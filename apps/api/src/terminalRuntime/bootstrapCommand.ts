// Claude Code rejects anything outside this set; an unknown value would leave
// the agent at an error prompt instead of working, so fall back instead.
const CLAUDE_PERMISSION_MODES = new Set([
  "acceptEdits",
  "auto",
  "bypassPermissions",
  "manual",
  "dontAsk",
  "plan",
]);

const DEFAULT_CLAUDE_PERMISSION_MODE = "auto";

type BootstrapEnv = { OCTOGENT_CLAUDE_PERMISSION_MODE?: string };

export const resolveClaudePermissionMode = (env: BootstrapEnv): string => {
  const requested = env.OCTOGENT_CLAUDE_PERMISSION_MODE?.trim();
  return requested && CLAUDE_PERMISSION_MODES.has(requested)
    ? requested
    : DEFAULT_CLAUDE_PERMISSION_MODE;
};

/**
 * The command written into a fresh PTY to start the agent.
 *
 * Claude defaults to asking before each action, which strands a terminal that
 * nobody is watching; `auto` keeps it moving. Operators who do want to approve
 * each step can set OCTOGENT_CLAUDE_PERMISSION_MODE=manual.
 */
export const resolveBootstrapCommand = (
  provider: string,
  env: BootstrapEnv = process.env,
): string =>
  provider === "codex" ? "codex" : `claude --permission-mode ${resolveClaudePermissionMode(env)}`;
