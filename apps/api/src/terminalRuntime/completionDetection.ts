import type { TentacleWorkspaceMode, TerminalLifecycleState } from "@octogent/core";

import {
  type CompletionGitFacts,
  type RunGitCommand,
  collectCompletionGitFacts,
} from "../completionSummary";

export type CompletionVerdict =
  | { outcome: "completed" | "awaiting-review"; gitFacts: CompletionGitFacts | null }
  | { outcome: "none" };

/**
 * Decides, on a Stop hook, whether a terminal's work is finished.
 *
 * Claude fires Stop after every conversational turn, so the bar is
 * deliberately conservative for worktree terminals: only a clean tree with
 * commits beyond the base counts as done — anything else means the agent is
 * mid-task and the terminal stays as it is. Shared-mode workers are told not
 * to commit at all, so their Stop is taken at face value.
 */
export const evaluateCompletionOnStop = (input: {
  workspaceMode: TentacleWorkspaceMode;
  worktreeCwd: string | null;
  baseRef: string;
  run: RunGitCommand;
}): CompletionVerdict => {
  if (input.workspaceMode === "shared") {
    return { outcome: "completed", gitFacts: null };
  }

  if (!input.worktreeCwd) {
    return { outcome: "none" };
  }

  try {
    if (input.run(input.worktreeCwd, ["status", "--porcelain"]).trim().length > 0) {
      return { outcome: "none" };
    }
  } catch {
    // Git being unavailable is not evidence of completion either way.
    return { outcome: "none" };
  }

  const gitFacts = collectCompletionGitFacts(input.worktreeCwd, input.baseRef, input.run);
  if (!gitFacts) {
    return { outcome: "none" };
  }

  // After the reviewer merges, `log base..HEAD` collapses to nothing because
  // HEAD became an ancestor of the base — the empty range is a consequence of
  // the merge, not evidence of no work. Merged therefore wins outright; only
  // an unmerged branch needs commits to prove the agent actually did anything.
  if (gitFacts.merged) {
    return { outcome: "completed", gitFacts };
  }

  if (gitFacts.commits.length === 0) {
    return { outcome: "none" };
  }

  return { outcome: "awaiting-review", gitFacts };
};

// Verdicts that must survive the live-PTY mirror. `stalled` belongs here too:
// the stall detector only ever fires while the PTY is alive, so mirroring it
// back to "running" hid every stall from snapshots (a reload showed four busy
// agents that had been silent for minutes). Activity already flips a stalled
// terminal back to running, so nothing else has to change.
const LIVE_SESSION_EXEMPT_STATES: ReadonlySet<TerminalLifecycleState> = new Set([
  "completed",
  "awaiting-review",
  "stalled",
]);

/**
 * Lifecycle state a snapshot should report.
 *
 * A live PTY normally means "running", but the PTY stays open after the agent
 * finishes; a completion verdict must survive that mirror or the UI would
 * flip straight back to running and hide it.
 */
export const resolveSnapshotLifecycle = (
  hasLiveSession: boolean,
  persisted: TerminalLifecycleState | undefined,
): TerminalLifecycleState => {
  if (hasLiveSession) {
    return persisted && LIVE_SESSION_EXEMPT_STATES.has(persisted) ? persisted : "running";
  }
  return persisted ?? "registered";
};
