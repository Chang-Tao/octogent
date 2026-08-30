import type { TentacleWorkspaceMode, TerminalLifecycleState } from "./types";

export type WorktreeGcRecord = {
  workspaceMode: TentacleWorkspaceMode;
  archivedAt?: string | undefined;
  lifecycleState?: TerminalLifecycleState | undefined;
  completionSummary?: { merged: boolean } | undefined;
};

/**
 * Decides whether an archived terminal record's worktree may be reclaimed
 * (worktree directory and branch deleted).
 *
 * Iron rule: work that never merged into the base branch must not be deleted
 * by any automated path. Only two signals count as proof of a merge — a
 * `completed` lifecycle verdict (worktree terminals are only marked completed
 * once their commits are merged) or an explicit `merged: true` completion
 * summary. Everything else, including `awaiting-review`, stays on disk.
 */
export const shouldReclaimWorktree = (record: WorktreeGcRecord): boolean => {
  if (record.workspaceMode !== "worktree") {
    return false;
  }

  if (!record.archivedAt) {
    return false;
  }

  return record.lifecycleState === "completed" || record.completionSummary?.merged === true;
};
