import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FlowNode } from "../src/app/flow/layout";
import { FlowNodeCard } from "../src/components/flow/FlowNodeCard";
import { renderWithLocale } from "./test-utils/renderWithLocale";

const base: FlowNode = {
  id: "flow:agent:t-1",
  kind: "agent",
  refId: "t-1",
  label: "worker one",
  color: "#00c8ff",
  role: "worker",
  level: 2,
  x: 0,
  y: 0,
  z: 0,
  workspaceMode: "worktree",
};

describe("FlowNodeCard", () => {
  it("shows the tentacle's三步 from its todo list", () => {
    renderWithLocale(
      <FlowNodeCard
        node={{
          ...base,
          id: "flow:tentacle:mini",
          kind: "tentacle",
          role: "tentacle",
          description: "负责小工具",
          todoTotal: 3,
          todoDone: 1,
          todoItems: [
            { text: "做 isEven", done: true },
            { text: "做 capitalize", done: false },
            { text: "做 sum", done: false },
          ],
        }}
      />,
    );

    expect(screen.getByText("负责小工具")).toBeInTheDocument();
    expect(screen.getByText("做 isEven")).toBeInTheDocument(); // prev
    expect(screen.getByText("做 capitalize")).toBeInTheDocument(); // now
    expect(screen.getByText("做 sum")).toBeInTheDocument(); // next
  });

  it("narrates a working agent: last commit, current tool, next step", () => {
    renderWithLocale(
      <FlowNodeCard
        node={{
          ...base,
          agentState: "live",
          runtimeState: "processing",
          runtimeToolName: "Bash",
          completionSummary: {
            taskLine: null,
            commits: [{ hash: "abc", message: "feat: step one" }],
            filesChanged: 1,
            insertions: 5,
            deletions: 0,
            branch: "octogent/t-1",
            merged: false,
            durationMs: null,
            workspaceMode: "worktree",
          },
        }}
      />,
    );

    expect(screen.getByText("feat: step one")).toBeInTheDocument();
    expect(screen.getByText("Using Bash")).toBeInTheDocument();
    expect(screen.getByText("Continue the current task")).toBeInTheDocument();
    expect(screen.getByText("Worktree agent · isolated branch")).toBeInTheDocument();
  });

  it("narrates awaiting review with the merge as the next step", () => {
    renderWithLocale(<FlowNodeCard node={{ ...base, agentState: "awaiting-review" }} />);

    expect(screen.getByText("Delivered, awaiting review")).toBeInTheDocument();
    expect(screen.getByText("Reviewer merges the branch")).toBeInTheDocument();
  });

  it("introduces a coordinator with its sub-agent count", () => {
    renderWithLocale(
      <FlowNodeCard node={{ ...base, role: "coordinator", childCount: 3, agentState: "live" }} />,
    );

    expect(screen.getByText("Swarm coordinator · 3 sub-agents")).toBeInTheDocument();
  });

  it("keeps the open-terminal action explicit", () => {
    const onOpen = vi.fn();
    renderWithLocale(<FlowNodeCard node={base} onOpenTerminal={onOpen} />);

    screen.getByRole("button", { name: "Open terminal" }).click();
    expect(onOpen).toHaveBeenCalledWith("t-1");
  });
});
