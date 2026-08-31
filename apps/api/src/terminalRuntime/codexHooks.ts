import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { mergeHookEntries, parseSettingsObject } from "./hookSettingsMerge";

/**
 * Codex feeds hook stdout back to the model as developer context, so unlike
 * the Claude hooks the API's JSON reply must be discarded with -o /dev/null.
 * Codex command hooks run through a shell, which is what makes the env var
 * expansion and stdin piping here work.
 */
const codexHookCommand = (apiBaseUrl: string, hookPath: string): string =>
  `curl -s -o /dev/null -X POST "${apiBaseUrl}/api/hooks/${hookPath}?octogent_session=$OCTOGENT_SESSION_ID" -H 'Content-Type: application/json' -d @- || true`;

const codexHookEntry = (apiBaseUrl: string, hookPath: string, timeoutSeconds: number) => ({
  hooks: [
    {
      type: "command",
      command: codexHookCommand(apiBaseUrl, hookPath),
      timeout: timeoutSeconds,
    },
  ],
});

/**
 * Writes the Octogent runtime hooks into `<targetCwd>/.codex/hooks.json`.
 *
 * The event set mirrors the Claude install where Codex offers an equivalent;
 * PermissionRequest replaces Claude's Notification-based permission detection.
 * Codex only trusts a hook definition after the operator (or a seeded
 * hooks.state entry) approves its hash, so installing alone is not enough to
 * make these run — see codexTrust.
 */
export const installCodexHooksInDirectory = (targetCwd: string, apiBaseUrl: string): void => {
  const targetCodexDir = join(targetCwd, ".codex");
  const targetHooksPath = join(targetCodexDir, "hooks.json");

  const hooksConfig: Record<string, unknown[]> = {
    SessionStart: [codexHookEntry(apiBaseUrl, "session-start", 5)],
    UserPromptSubmit: [codexHookEntry(apiBaseUrl, "user-prompt-submit", 5)],
    PreToolUse: [codexHookEntry(apiBaseUrl, "pre-tool-use", 5)],
    PermissionRequest: [codexHookEntry(apiBaseUrl, "permission-request", 5)],
    Stop: [codexHookEntry(apiBaseUrl, "stop", 15)],
  };

  try {
    mkdirSync(targetCodexDir, { recursive: true });
    const existingSettings = existsSync(targetHooksPath)
      ? parseSettingsObject(readFileSync(targetHooksPath, "utf8"))
      : null;
    const mergedSettings = existingSettings ? { ...existingSettings } : {};

    let mergedHooks =
      mergedSettings.hooks &&
      typeof mergedSettings.hooks === "object" &&
      !Array.isArray(mergedSettings.hooks)
        ? { ...(mergedSettings.hooks as Record<string, unknown>) }
        : {};

    for (const [eventName, eventEntries] of Object.entries(hooksConfig)) {
      mergedHooks = mergeHookEntries(mergedHooks, eventName, eventEntries);
    }

    mergedSettings.hooks = mergedHooks;
    writeFileSync(targetHooksPath, `${JSON.stringify(mergedSettings, null, 2)}\n`, "utf8");
  } catch {
    // Best-effort: hook installation should not block terminal creation.
  }
};
