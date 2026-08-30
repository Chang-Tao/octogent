import { describe, expect, it } from "vitest";

import { shouldReclaimWorktree } from "../src/terminalRuntime/worktreeGc";

const mergedSummary = { merged: true };
const unmergedSummary = { merged: false };

describe("shouldReclaimWorktree", () => {
  it("reclaims an archived worktree record whose lifecycle is completed", () => {
    expect(
      shouldReclaimWorktree({
        workspaceMode: "worktree",
        archivedAt: "2026-08-01T00:00:00.000Z",
        lifecycleState: "completed",
      }),
    ).toBe(true);
  });

  it("reclaims an archived worktree record whose summary says merged", () => {
    for (const lifecycleState of ["stopped", "exited"] as const) {
      expect(
        shouldReclaimWorktree({
          workspaceMode: "worktree",
          archivedAt: "2026-08-01T00:00:00.000Z",
          lifecycleState,
          completionSummary: mergedSummary,
        }),
      ).toBe(true);
    }
  });

  it("never reclaims shared-mode records, even completed and archived", () => {
    expect(
      shouldReclaimWorktree({
        workspaceMode: "shared",
        archivedAt: "2026-08-01T00:00:00.000Z",
        lifecycleState: "completed",
        completionSummary: mergedSummary,
      }),
    ).toBe(false);
  });

  it("never reclaims a record that is not archived", () => {
    expect(
      shouldReclaimWorktree({
        workspaceMode: "worktree",
        lifecycleState: "completed",
        completionSummary: mergedSummary,
      }),
    ).toBe(false);
  });

  it("never reclaims awaiting-review records: unmerged work must survive", () => {
    expect(
      shouldReclaimWorktree({
        workspaceMode: "worktree",
        archivedAt: "2026-08-01T00:00:00.000Z",
        lifecycleState: "awaiting-review",
      }),
    ).toBe(false);
    expect(
      shouldReclaimWorktree({
        workspaceMode: "worktree",
        archivedAt: "2026-08-01T00:00:00.000Z",
        lifecycleState: "awaiting-review",
        completionSummary: unmergedSummary,
      }),
    ).toBe(false);
  });

  it("never reclaims archived stopped/exited records without proof of a merge", () => {
    for (const lifecycleState of ["stopped", "exited", "stale", "registered"] as const) {
      expect(
        shouldReclaimWorktree({
          workspaceMode: "worktree",
          archivedAt: "2026-08-01T00:00:00.000Z",
          lifecycleState,
          completionSummary: unmergedSummary,
        }),
      ).toBe(false);
      expect(
        shouldReclaimWorktree({
          workspaceMode: "worktree",
          archivedAt: "2026-08-01T00:00:00.000Z",
          lifecycleState,
        }),
      ).toBe(false);
    }
  });

  it("never reclaims a record with no lifecycle state and no summary", () => {
    expect(
      shouldReclaimWorktree({
        workspaceMode: "worktree",
        archivedAt: "2026-08-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });
});
