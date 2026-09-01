import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { asRecord } from "@octogent/core";

/**
 * Pre-seeds Codex trust for a workspace directory so an unattended agent does
 * not stall on the folder-trust or hooks-review dialog — the Codex counterpart
 * of claudeTrust's ensureDirectoryTrusted.
 *
 * Trust lives in $CODEX_HOME/config.toml (default ~/.codex/config.toml):
 * - `[projects."<path>"] trust_level = "trusted"` trusts the folder, and
 * - `[hooks.state."<hooks.json path>:<event>:<group>:<index>"] trusted_hash`
 *   entries approve each installed hook definition by content hash.
 *
 * The hash is a port of the open-source codex CLI (github.com/openai/codex,
 * codex-rs): `hook_hash` in hooks/src/engine/discovery.rs builds a normalized
 * identity `{ event_name, matcher?, hooks: [<normalized handler>] }`, converts
 * it to a TOML value (dropping every `None` field), and `version_for_toml` in
 * config/src/fingerprint.rs re-serializes that value as compact JSON with
 * recursively sorted keys and hashes it: `sha256:<hex of sha256(json)>`.
 * The hash depends only on the definition, never on which file holds it.
 */

export const resolveCodexConfigPath = (env: NodeJS.ProcessEnv = process.env): string => {
  const override = env.OCTOGENT_CODEX_CONFIG?.trim();
  if (override) {
    return override;
  }
  const codexHome = env.CODEX_HOME?.trim();
  return join(codexHome || join(homedir(), ".codex"), "config.toml");
};

/** Hook-state key labels from codex-rs hooks/src/lib.rs hook_event_key_label. */
const CODEX_HOOK_EVENT_LABELS: Record<string, string> = {
  PreToolUse: "pre_tool_use",
  PermissionRequest: "permission_request",
  PostToolUse: "post_tool_use",
  PreCompact: "pre_compact",
  PostCompact: "post_compact",
  SessionStart: "session_start",
  SessionEnd: "session_end",
  UserPromptSubmit: "user_prompt_submit",
  SubagentStart: "subagent_start",
  SubagentStop: "subagent_stop",
  Stop: "stop",
  Interrupt: "interrupt",
};

// matcher_pattern_for_event: these events never match on anything, so Codex
// clears their matcher before hashing.
const MATCHERLESS_EVENTS = new Set(["UserPromptSubmit", "Stop", "Interrupt"]);

// Only these events can emit additionalContext; elsewhere the limit is dropped
// from the normalized identity. The 2,500-token default is also dropped so an
// explicit default hashes like an implicit one.
const ADDITIONAL_CONTEXT_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "SessionStart",
  "UserPromptSubmit",
  "SubagentStart",
]);
const DEFAULT_ADDITIONAL_CONTEXT_LIMIT = 2500;

const asOptionalUnsignedInteger = (value: unknown): number | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
};

/** normalize_command_hook: SessionEnd/Interrupt default to 1s capped at 3s. */
const normalizeTimeout = (eventName: string, timeout: number | undefined): number =>
  eventName === "SessionEnd" || eventName === "Interrupt"
    ? Math.min(Math.max(timeout ?? 1, 1), 3)
    : Math.max(timeout ?? 600, 1);

/**
 * Serializes exactly like codex's canonical fingerprint JSON: compact
 * separators with object keys recursively sorted byte-wise (Rust String sort).
 */
const canonicalJsonStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonStringify).join(",")}]`;
  }
  const record = asRecord(value);
  if (record) {
    const keys = Object.keys(record).sort((left, right) =>
      Buffer.compare(Buffer.from(left, "utf-8"), Buffer.from(right, "utf-8")),
    );
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

/**
 * Computes the `trusted_hash` Codex expects for one hook handler, or null when
 * the handler is not a hashable command hook: Codex either skips such handlers
 * (empty command) or rejects the file outright (malformed fields), and only
 * `command` handlers are ported — an mcp_tool identity embeds arbitrary JSON
 * whose TOML float round-trip this port cannot reproduce byte-for-byte, and
 * Octogent never installs one. Unported handlers keep their review dialog.
 */
export const computeCodexHookHash = (
  eventName: string,
  matcher: string | undefined,
  handler: Record<string, unknown>,
): string | null => {
  const eventLabel = CODEX_HOOK_EVENT_LABELS[eventName];
  if (!eventLabel || handler.type !== "command") {
    return null;
  }

  const platformCommand =
    process.platform === "win32" && typeof handler.commandWindows === "string"
      ? handler.commandWindows
      : handler.command;
  if (typeof platformCommand !== "string" || platformCommand.trim().length === 0) {
    return null;
  }
  const timeout = asOptionalUnsignedInteger(handler.timeout);
  const additionalContextLimit = asOptionalUnsignedInteger(handler.additionalContextLimit);
  if (timeout === null || additionalContextLimit === null) {
    return null;
  }
  if (handler.async !== undefined && typeof handler.async !== "boolean") {
    return null;
  }
  if (handler.statusMessage !== undefined && typeof handler.statusMessage !== "string") {
    return null;
  }

  const keepAdditionalContextLimit =
    ADDITIONAL_CONTEXT_EVENTS.has(eventName) &&
    additionalContextLimit !== undefined &&
    additionalContextLimit !== DEFAULT_ADDITIONAL_CONTEXT_LIMIT;
  const normalizedMatcher = MATCHERLESS_EVENTS.has(eventName) ? undefined : matcher;

  // Field names and presence mirror the serde/TOML serialization of codex's
  // normalized HookHandlerConfig::Command: absent Options vanish, `async` and
  // the filled-in `timeout` always serialize.
  const identity = {
    event_name: eventLabel,
    ...(normalizedMatcher === undefined ? {} : { matcher: normalizedMatcher }),
    hooks: [
      {
        type: "command",
        command: platformCommand,
        timeout: normalizeTimeout(eventName, timeout),
        async: handler.async === true,
        ...(handler.statusMessage === undefined ? {} : { statusMessage: handler.statusMessage }),
        ...(keepAdditionalContextLimit ? { additionalContextLimit } : {}),
      },
    ],
  };

  const digest = createHash("sha256")
    .update(canonicalJsonStringify(identity), "utf-8")
    .digest("hex");
  return `sha256:${digest}`;
};

type HookStateEntry = { key: string; hash: string };

/**
 * Collects the `[hooks.state]` entries for every hashable handler in a
 * hooks.json file. Group and handler positions come from the raw arrays —
 * codex numbers skipped handlers too — so unhashable neighbors do not shift
 * the keys of the entries we can seed.
 */
const collectHookStateEntries = (hooksJsonPath: string): HookStateEntry[] => {
  if (!existsSync(hooksJsonPath)) {
    return [];
  }
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = asRecord(JSON.parse(readFileSync(hooksJsonPath, "utf-8")));
  } catch {
    return [];
  }
  const events = asRecord(parsed?.hooks);
  if (!events) {
    return [];
  }

  const entries: HookStateEntry[] = [];
  for (const [eventName, eventLabel] of Object.entries(CODEX_HOOK_EVENT_LABELS)) {
    const groups = events[eventName];
    if (!Array.isArray(groups)) {
      continue;
    }
    for (const [groupIndex, groupValue] of groups.entries()) {
      const group = asRecord(groupValue);
      const matcher = typeof group?.matcher === "string" ? group.matcher : undefined;
      const handlers = Array.isArray(group?.hooks) ? group.hooks : [];
      for (const [handlerIndex, handlerValue] of handlers.entries()) {
        const handler = asRecord(handlerValue);
        const hash = handler && computeCodexHookHash(eventName, matcher, handler);
        if (hash) {
          entries.push({
            key: `${hooksJsonPath}:${eventLabel}:${groupIndex}:${handlerIndex}`,
            hash,
          });
        }
      }
    }
  }
  return entries;
};

const escapeTomlBasicString = (value: string): string =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: TOML basic strings require escaping exactly these control characters
  value.replace(/[\\"\u0000-\u001f\u007f]/g, (character) => {
    switch (character) {
      case "\\":
        return "\\\\";
      case '"':
        return '\\"';
      case "\b":
        return "\\b";
      case "\t":
        return "\\t";
      case "\n":
        return "\\n";
      case "\f":
        return "\\f";
      case "\r":
        return "\\r";
      default:
        return `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
    }
  });

/**
 * Parses one `[table.header]` line into its key segments, or null when the
 * line is not a well-formed header. Handles bare, basic-quoted, and
 * literal-quoted keys — the only forms Codex itself writes.
 */
const parseTomlHeaderKeyPath = (line: string): string[] | null => {
  let cursor = line.startsWith("[[") ? 2 : 1;
  const isArrayHeader = cursor === 2;
  const segments: string[] = [];

  const skipWhitespace = () => {
    while (line[cursor] === " " || line[cursor] === "\t") {
      cursor += 1;
    }
  };

  for (;;) {
    skipWhitespace();
    const start = line[cursor];
    if (start === '"' || start === "'") {
      let segment = "";
      cursor += 1;
      while (cursor < line.length && line[cursor] !== start) {
        if (start === '"' && line[cursor] === "\\") {
          const escapeCharacter = line[cursor + 1];
          const simple: Record<string, string> = {
            b: "\b",
            t: "\t",
            n: "\n",
            f: "\f",
            r: "\r",
            '"': '"',
            "\\": "\\",
          };
          if (escapeCharacter !== undefined && escapeCharacter in simple) {
            segment += simple[escapeCharacter];
            cursor += 2;
            continue;
          }
          if (escapeCharacter === "u" || escapeCharacter === "U") {
            const width = escapeCharacter === "u" ? 4 : 8;
            const hex = line.slice(cursor + 2, cursor + 2 + width);
            if (!new RegExp(`^[0-9A-Fa-f]{${width}}$`).test(hex)) {
              return null;
            }
            segment += String.fromCodePoint(Number.parseInt(hex, 16));
            cursor += 2 + width;
            continue;
          }
          return null;
        }
        segment += line[cursor];
        cursor += 1;
      }
      if (line[cursor] !== start) {
        return null;
      }
      cursor += 1;
      segments.push(segment);
    } else {
      const match = /^[A-Za-z0-9_-]+/.exec(line.slice(cursor));
      if (!match) {
        return null;
      }
      segments.push(match[0]);
      cursor += match[0].length;
    }
    skipWhitespace();
    if (line[cursor] === ".") {
      cursor += 1;
      continue;
    }
    break;
  }

  const closer = isArrayHeader ? "]]" : "]";
  if (!line.startsWith(closer, cursor)) {
    return null;
  }
  const trailer = line.slice(cursor + closer.length).trim();
  if (trailer.length > 0 && !trailer.startsWith("#")) {
    return null;
  }
  return segments;
};

/**
 * Extracts every table-header key path in the config, or null when a line we
 * would have to reason about cannot be tokenized. Multi-line strings could
 * hide header-looking lines, so their mere presence makes the file off-limits;
 * so does any unparseable `[`-line (including multi-line array continuations —
 * refusing an exotic config is safe, appending into it blind is not).
 */
const parseTomlHeaderPaths = (contents: string): string[][] | null => {
  if (contents.includes('"""') || contents.includes("'''")) {
    return null;
  }
  const headerPaths: string[][] = [];
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("[")) {
      continue;
    }
    const headerPath = parseTomlHeaderKeyPath(line);
    if (!headerPath) {
      return null;
    }
    headerPaths.push(headerPath);
  }
  return headerPaths;
};

const samePath = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((segment, index) => segment === right[index]);

/**
 * Marks a workspace directory as trusted for Codex and pre-approves the hooks
 * installed by codexHooks (which must have written hooks.json already — see
 * the adapter ordering in agentProviders).
 *
 * The read-modify-write is append-only and conservative, in the spirit of
 * claudeTrust: an existing section is never rewritten (a duplicate table
 * header would make the whole config unparseable for Codex, and an operator's
 * explicit "untrusted" verdict deserves to stand), only missing sections are
 * appended, a config we cannot safely tokenize is left alone, and the write
 * goes through a sibling temp file so Codex never sees a torn config.
 *
 * Returns whether the config changed.
 */
export const ensureCodexDirectoryTrusted = (
  targetCwd: string,
  configPath: string = resolveCodexConfigPath(),
): boolean => {
  const projectPath = resolve(targetCwd);
  // The runtime hooks live in the user layer next to the config (the only
  // layer the Codex TUI loads from worktree sessions) — see codexHooks.
  const hooksJsonPath = resolve(dirname(configPath), "hooks.json");

  const contents = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "";
  const headerPaths = parseTomlHeaderPaths(contents);
  if (!headerPaths) {
    // Never touch a config we could misread: it is the operator's live Codex
    // desktop state, and a bad append could take the whole file down with it.
    return false;
  }

  const sections: Array<{ headerPath: string[]; body: string }> = [
    { headerPath: ["projects", projectPath], body: 'trust_level = "trusted"' },
    ...collectHookStateEntries(hooksJsonPath).map((entry) => ({
      headerPath: ["hooks", "state", entry.key],
      body: `trusted_hash = "${entry.hash}"`,
    })),
  ];

  const missing = sections.filter(
    (section) => !headerPaths.some((headerPath) => samePath(headerPath, section.headerPath)),
  );
  if (missing.length === 0) {
    return false;
  }

  const blocks = missing.map((section) => {
    const quotedLeaf = `"${escapeTomlBasicString(section.headerPath[section.headerPath.length - 1] ?? "")}"`;
    const prefix = section.headerPath.slice(0, -1).join(".");
    return `[${prefix}.${quotedLeaf}]\n${section.body}\n`;
  });
  const separator = contents.length === 0 ? "" : contents.endsWith("\n") ? "\n" : "\n\n";
  const nextContents = `${contents}${separator}${blocks.join("\n")}`;

  // Write through a sibling temp file so a concurrent Codex process never
  // observes a half-written config.
  mkdirSync(dirname(configPath), { recursive: true });
  const temporaryPath = join(dirname(configPath), `.octogent-codex-trust-${process.pid}.tmp`);
  writeFileSync(temporaryPath, nextContents, "utf-8");
  renameSync(temporaryPath, configPath);
  return true;
};
