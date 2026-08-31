import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installCodexHooksInDirectory } from "../src/terminalRuntime/codexHooks";

const API_BASE_URL = "http://127.0.0.1:8787";

const CODEX_HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "Stop",
] as const;

describe("installCodexHooksInDirectory", () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "octogent-codex-hooks-"));
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  const readHooksFile = (): Record<string, unknown> =>
    JSON.parse(readFileSync(join(workspaceDir, ".codex", "hooks.json"), "utf8")) as Record<
      string,
      unknown
    >;

  it("writes a hooks.json covering the runtime lifecycle events", () => {
    installCodexHooksInDirectory(workspaceDir, API_BASE_URL);

    const parsed = readHooksFile();
    const hooks = parsed.hooks as Record<string, unknown[]>;
    for (const eventName of CODEX_HOOK_EVENTS) {
      expect(hooks[eventName], eventName).toHaveLength(1);
    }
  });

  it("posts the stdin payload to the API and identifies the session via query param", () => {
    installCodexHooksInDirectory(workspaceDir, API_BASE_URL);

    const contents = readFileSync(join(workspaceDir, ".codex", "hooks.json"), "utf8");
    expect(contents).toContain(`${API_BASE_URL}/api/hooks/permission-request`);
    expect(contents).toContain("octogent_session=$OCTOGENT_SESSION_ID");
    expect(contents).toContain("-d @-");
  });

  it("silences the API response so Codex never feeds it back to the model", () => {
    installCodexHooksInDirectory(workspaceDir, API_BASE_URL);

    const parsed = readHooksFile();
    const hooks = parsed.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    for (const eventName of CODEX_HOOK_EVENTS) {
      const entries = hooks[eventName] ?? [];
      for (const entry of entries) {
        for (const hook of entry.hooks) {
          expect(hook.command, eventName).toContain("-o /dev/null");
        }
      }
    }
  });

  it("preserves hooks an operator added themselves and stays idempotent", () => {
    const codexDir = join(workspaceDir, ".codex");
    installCodexHooksInDirectory(workspaceDir, API_BASE_URL);

    const parsed = readHooksFile();
    const hooks = parsed.hooks as Record<string, unknown[]>;
    hooks.SessionEnd = [{ hooks: [{ type: "command", command: "echo bye", timeout: 3 }] }];
    writeFileSync(join(codexDir, "hooks.json"), JSON.stringify(parsed), "utf8");

    installCodexHooksInDirectory(workspaceDir, API_BASE_URL);

    const merged = readHooksFile();
    const mergedHooks = merged.hooks as Record<string, unknown[]>;
    expect(mergedHooks.SessionEnd).toHaveLength(1);
    expect(mergedHooks.Stop, "re-install must not duplicate entries").toHaveLength(1);
  });

  it("replaces an unparseable hooks.json instead of failing the install", () => {
    const codexDir = join(workspaceDir, ".codex");
    installCodexHooksInDirectory(workspaceDir, API_BASE_URL);
    writeFileSync(join(codexDir, "hooks.json"), "{not json", "utf8");

    installCodexHooksInDirectory(workspaceDir, API_BASE_URL);

    const parsed = readHooksFile();
    const hooks = parsed.hooks as Record<string, unknown[]>;
    expect(hooks.Stop).toHaveLength(1);
  });
});
