import { describe, expect, it } from "vitest";

import { resolveBootstrapCommand } from "../src/terminalRuntime/bootstrapCommand";

describe("resolveBootstrapCommand", () => {
  it("runs Claude in a permission mode that does not stall an unattended agent", () => {
    expect(resolveBootstrapCommand("claude-code", {})).toBe("claude --permission-mode auto");
  });

  it("lets an operator pick a stricter or looser mode", () => {
    expect(
      resolveBootstrapCommand("claude-code", { OCTOGENT_CLAUDE_PERMISSION_MODE: "manual" }),
    ).toBe("claude --permission-mode manual");
  });

  it("ignores a blank override", () => {
    expect(resolveBootstrapCommand("claude-code", { OCTOGENT_CLAUDE_PERMISSION_MODE: "  " })).toBe(
      "claude --permission-mode auto",
    );
  });

  it("rejects a mode Claude Code does not accept rather than launching a broken command", () => {
    expect(
      resolveBootstrapCommand("claude-code", { OCTOGENT_CLAUDE_PERMISSION_MODE: "; rm -rf /" }),
    ).toBe("claude --permission-mode auto");
  });

  it("leaves Codex alone", () => {
    expect(resolveBootstrapCommand("codex", {})).toBe("codex");
  });

  it("falls back to the default provider for an unknown one", () => {
    expect(resolveBootstrapCommand("who-knows", {})).toBe("claude --permission-mode auto");
  });
});
