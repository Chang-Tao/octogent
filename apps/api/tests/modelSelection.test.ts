import { describe, expect, it } from "vitest";

import { isEffortTier, resolveAgentModelSelection } from "../src/terminalRuntime/modelSelection";

describe("resolveAgentModelSelection", () => {
  it("maps effort tiers to per-provider defaults", () => {
    expect(resolveAgentModelSelection({ provider: "claude-code", effort: "light" }, {})).toEqual({
      model: "haiku",
      effortTier: "light",
    });
    expect(resolveAgentModelSelection({ provider: "claude-code", effort: "max" }, {})).toEqual({
      model: "fable",
      effortTier: "max",
    });
    expect(resolveAgentModelSelection({ provider: "codex", effort: "standard" }, {})).toEqual({
      model: "gpt-5.6-terra",
      codexReasoningEffort: "medium",
      effortTier: "standard",
    });
    // Top two Codex tiers share the strongest current model; reasoning level
    // separates them (gpt-5.5 is previous-generation and no longer used).
    expect(resolveAgentModelSelection({ provider: "codex", effort: "heavy" }, {})).toEqual({
      model: "gpt-5.6-sol",
      codexReasoningEffort: "high",
      effortTier: "heavy",
    });
    expect(resolveAgentModelSelection({ provider: "codex", effort: "max" }, {})).toEqual({
      model: "gpt-5.6-sol",
      codexReasoningEffort: "xhigh",
      effortTier: "max",
    });
  });

  it("lets an explicit model win over the effort tier", () => {
    expect(
      resolveAgentModelSelection({ provider: "claude-code", model: "opus", effort: "light" }, {}),
    ).toEqual({ model: "opus", effortTier: "light" });
  });

  it("returns null when neither model nor effort is requested", () => {
    expect(resolveAgentModelSelection({ provider: "claude-code" }, {})).toBeNull();
  });

  it("honors the OCTOGENT_EFFORT_MODELS env override", () => {
    const env = {
      OCTOGENT_EFFORT_MODELS: JSON.stringify({
        light: { "claude-code": "haiku-4-5", codex: "gpt-5.3-codex-spark@low" },
      }),
    };
    expect(resolveAgentModelSelection({ provider: "claude-code", effort: "light" }, env)).toEqual({
      model: "haiku-4-5",
      effortTier: "light",
    });
    expect(resolveAgentModelSelection({ provider: "codex", effort: "light" }, env)).toEqual({
      model: "gpt-5.3-codex-spark",
      codexReasoningEffort: "low",
      effortTier: "light",
    });
    // Tiers absent from the override keep their defaults.
    expect(
      resolveAgentModelSelection({ provider: "claude-code", effort: "standard" }, env),
    ).toEqual({ model: "sonnet", effortTier: "standard" });
  });

  it("ignores an unparseable override instead of failing terminal creation", () => {
    expect(
      resolveAgentModelSelection(
        { provider: "claude-code", effort: "light" },
        { OCTOGENT_EFFORT_MODELS: "{not json" },
      ),
    ).toEqual({ model: "haiku", effortTier: "light" });
  });

  it("rejects model names that could not be shell-safe", () => {
    expect(
      resolveAgentModelSelection({ provider: "claude-code", model: 'x"; rm -rf /' }, {}),
    ).toBeNull();
    expect(
      resolveAgentModelSelection(
        { provider: "codex", effort: "light" },
        { OCTOGENT_EFFORT_MODELS: JSON.stringify({ light: { codex: "bad model@$(boom)" } }) },
      ),
    ).toBeNull();
  });
});

describe("isEffortTier", () => {
  it("accepts the four tiers and nothing else", () => {
    for (const tier of ["light", "standard", "heavy", "max"]) {
      expect(isEffortTier(tier), tier).toBe(true);
    }
    expect(isEffortTier("ultra")).toBe(false);
    expect(isEffortTier("")).toBe(false);
  });
});
