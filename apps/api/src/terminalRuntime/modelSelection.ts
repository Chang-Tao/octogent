import type { TerminalAgentProvider } from "@octogent/core";

/**
 * Difficulty tiers for dispatching a task without naming a model. The mapping
 * encodes the metering reality: within Claude the weekly pool is shared but
 * burn rates differ widely per model, and Fable additionally has its own
 * scarce weekly cap, so tiers exist to spend the pool where it matters.
 */
export type EffortTier = "light" | "standard" | "heavy" | "max";

const EFFORT_TIERS: readonly EffortTier[] = ["light", "standard", "heavy", "max"];

export const isEffortTier = (value: unknown): value is EffortTier =>
  typeof value === "string" && (EFFORT_TIERS as readonly string[]).includes(value);

/** Codex entries pack the reasoning effort as `model@effort`. */
type EffortModelMap = Partial<Record<EffortTier, Partial<Record<TerminalAgentProvider, string>>>>;

const DEFAULT_EFFORT_MODELS: EffortModelMap = {
  light: { "claude-code": "haiku", codex: "gpt-5.6-luna@low" },
  standard: { "claude-code": "sonnet", codex: "gpt-5.6-terra@medium" },
  heavy: { "claude-code": "opus", codex: "gpt-5.5@high" },
  max: { "claude-code": "fable", codex: "gpt-5.6-sol@high" },
};

// These strings end up inside the PTY bootstrap command line, so only accept
// plain identifier-shaped values.
const MODEL_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const isValidModelToken = (value: unknown): value is string =>
  typeof value === "string" && MODEL_TOKEN_RE.test(value);

export type ResolvedAgentModel = {
  model: string;
  codexReasoningEffort?: string;
  effortTier?: EffortTier;
};

type ModelSelectionEnv = { OCTOGENT_EFFORT_MODELS?: string };

const readEffortModelOverrides = (env: ModelSelectionEnv): EffortModelMap => {
  const raw = env.OCTOGENT_EFFORT_MODELS?.trim();
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as EffortModelMap;
  } catch {
    // A broken override must not block terminal creation.
    return {};
  }
};

const unpackModelEntry = (
  entry: string,
  provider: TerminalAgentProvider,
): Omit<ResolvedAgentModel, "effortTier"> | null => {
  const [model, packedEffort] = provider === "codex" ? entry.split("@", 2) : [entry, undefined];
  if (!model || !MODEL_TOKEN_RE.test(model)) {
    return null;
  }
  if (packedEffort !== undefined && !MODEL_TOKEN_RE.test(packedEffort)) {
    return null;
  }
  return { model, ...(packedEffort ? { codexReasoningEffort: packedEffort } : {}) };
};

/**
 * Resolves what the terminal should run with: an explicit model wins, an
 * effort tier falls back to the (env-overridable) mapping, and neither means
 * the provider keeps its own default. Returns null for "nothing requested" and
 * also for values that fail validation — creation then proceeds without a
 * model rather than launching a broken or unsafe command.
 */
export const resolveAgentModelSelection = (
  input: { provider: TerminalAgentProvider; model?: string; effort?: EffortTier },
  env: ModelSelectionEnv = process.env,
): ResolvedAgentModel | null => {
  if (input.model !== undefined) {
    if (!MODEL_TOKEN_RE.test(input.model)) {
      return null;
    }
    return { model: input.model, ...(input.effort ? { effortTier: input.effort } : {}) };
  }

  if (!input.effort) {
    return null;
  }

  const overrides = readEffortModelOverrides(env);
  const entry =
    overrides[input.effort]?.[input.provider] ??
    DEFAULT_EFFORT_MODELS[input.effort]?.[input.provider];
  if (!entry) {
    return null;
  }
  const unpacked = unpackModelEntry(entry, input.provider);
  return unpacked ? { ...unpacked, effortTier: input.effort } : null;
};
