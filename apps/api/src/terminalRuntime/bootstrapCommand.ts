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

// Codex rejects unknown sandbox/approval values the same way, so validate here
// and fall back instead of launching a broken command.
const CODEX_SANDBOX_MODES = new Set(["read-only", "workspace-write", "danger-full-access"]);
const CODEX_APPROVAL_POLICIES = new Set(["on-request", "never"]);

const DEFAULT_CODEX_SANDBOX_MODE = "workspace-write";
const DEFAULT_CODEX_APPROVAL_POLICY = "never";

type BootstrapEnv = {
  OCTOGENT_CLAUDE_PERMISSION_MODE?: string;
  OCTOGENT_CODEX_SANDBOX_MODE?: string;
  OCTOGENT_CODEX_APPROVAL_POLICY?: string;
};

export const resolveClaudePermissionMode = (env: BootstrapEnv): string => {
  const requested = env.OCTOGENT_CLAUDE_PERMISSION_MODE?.trim();
  return requested && CLAUDE_PERMISSION_MODES.has(requested)
    ? requested
    : DEFAULT_CLAUDE_PERMISSION_MODE;
};

export const resolveCodexSandboxMode = (env: BootstrapEnv): string => {
  const requested = env.OCTOGENT_CODEX_SANDBOX_MODE?.trim();
  return requested && CODEX_SANDBOX_MODES.has(requested) ? requested : DEFAULT_CODEX_SANDBOX_MODE;
};

export const resolveCodexApprovalPolicy = (env: BootstrapEnv): string => {
  const requested = env.OCTOGENT_CODEX_APPROVAL_POLICY?.trim();
  return requested && CODEX_APPROVAL_POLICIES.has(requested)
    ? requested
    : DEFAULT_CODEX_APPROVAL_POLICY;
};

/**
 * The command written into a fresh PTY to start the agent.
 *
 * Both agents default to asking before actions, which strands a terminal that
 * nobody is watching: Claude runs with `--permission-mode auto`, Codex with the
 * workspace-write sandbox and approvals off. Operators who do want to approve
 * each step can set OCTOGENT_CLAUDE_PERMISSION_MODE=manual or
 * OCTOGENT_CODEX_APPROVAL_POLICY=on-request.
 */
export const resolveBootstrapCommand = (
  provider: string,
  env: BootstrapEnv = process.env,
): string =>
  provider === "codex"
    ? `codex --sandbox ${resolveCodexSandboxMode(env)} --ask-for-approval ${resolveCodexApprovalPolicy(env)}`
    : `claude --permission-mode ${resolveClaudePermissionMode(env)}`;
