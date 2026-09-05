import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentStateTracker } from "../src/agentStateDetection";
import type { ConversationTurn } from "../src/terminalRuntime/conversations";
import { createHookProcessor } from "../src/terminalRuntime/hookProcessor";
import type {
  PersistedTerminal,
  TerminalServerMessage,
  TerminalSession,
} from "../src/terminalRuntime/types";
import type { TerminalAgentProvider } from "../src/terminalRuntime/types";

const TERMINAL_ID = "t-1";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const makeHarness = (
  options: {
    agentProvider?: TerminalAgentProvider;
    hasSession?: boolean;
    lastToolName?: string;
  } = {},
) => {
  const transcriptDirectoryPath = mkdtempSync(join(tmpdir(), "octogent-hook-processor-"));
  tempDirs.push(transcriptDirectoryPath);

  const terminal = {
    terminalId: TERMINAL_ID,
    tentacleId: TERMINAL_ID,
    tentacleName: "Terminal",
    ...(options.agentProvider ? { agentProvider: options.agentProvider } : {}),
  } as PersistedTerminal;
  const terminals = new Map<string, PersistedTerminal>([[TERMINAL_ID, terminal]]);

  const broadcasts: TerminalServerMessage[] = [];
  const session = {
    terminalId: TERMINAL_ID,
    tentacleId: TERMINAL_ID,
    agentState: "processing",
    stateTracker: new AgentStateTracker({ initialState: "processing" }),
    clients: new Set(),
    directListeners: new Set([(message: TerminalServerMessage) => broadcasts.push(message)]),
    lastToolName: options.lastToolName,
  } as unknown as TerminalSession;

  const sessions = new Map<string, TerminalSession>();
  if (options.hasSession !== false) {
    sessions.set(TERMINAL_ID, session);
  }

  // Capture the agent state at delivery time to pin the ordering contract:
  // codex sessions must be idle before queued channel messages are delivered.
  const agentStatesAtDelivery: string[] = [];
  const deliverChannelMessages = vi.fn((_terminalId: string) => {
    agentStatesAtDelivery.push(session.agentState);
    return 0;
  });
  const releaseSessionKeepAlive = vi.fn(() => true);
  const reviveSessionTranscript = vi.fn(() => false);
  const evaluateSessionCompletion = vi.fn();
  const persistRegistry = vi.fn();
  const onStateChange = vi.fn();

  const processor = createHookProcessor({
    terminals,
    sessions,
    transcriptDirectoryPath,
    getApiBaseUrl: () => "http://127.0.0.1:4100",
    persistRegistry,
    deliverChannelMessages,
    releaseSessionKeepAlive,
    reviveSessionTranscript,
    evaluateSessionCompletion,
    onStateChange,
  });

  return {
    processor,
    terminal,
    session,
    broadcasts,
    transcriptDirectoryPath,
    agentStatesAtDelivery,
    deliverChannelMessages,
    releaseSessionKeepAlive,
    evaluateSessionCompletion,
    onStateChange,
  };
};

const writeClaudeTranscript = (dir: string): string => {
  const transcriptPath = join(dir, "claude-transcript.jsonl");
  const lines = [
    JSON.stringify({
      type: "user",
      message: { role: "user", content: "please fix the bug" },
      timestamp: "2026-09-01T10:00:00.000Z",
    }),
    JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: "done, bug fixed" }] },
      timestamp: "2026-09-01T10:01:00.000Z",
    }),
  ];
  writeFileSync(transcriptPath, `${lines.join("\n")}\n`, "utf8");
  return transcriptPath;
};

const writeCodexRolloutTranscript = (dir: string): string => {
  const transcriptPath = join(dir, "codex-rollout.jsonl");
  const lines = [
    JSON.stringify({
      timestamp: "2026-09-01T10:00:00.000Z",
      ordinal: 1,
      type: "response_item",
      payload: { role: "assistant", content: "rollout entry" },
    }),
  ];
  writeFileSync(transcriptPath, `${lines.join("\n")}\n`, "utf8");
  return transcriptPath;
};

const readStoredTurns = (transcriptDirectoryPath: string): ConversationTurn[] | null => {
  const filePath = join(transcriptDirectoryPath, `${TERMINAL_ID}.claude-turns.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as ConversationTurn[];
};

describe("permission-request hook", () => {
  it("puts a codex session into waiting_for_permission with the payload tool name", () => {
    const { processor, session, broadcasts, onStateChange } = makeHarness({
      agentProvider: "codex",
    });

    const result = processor.handleHook(
      "permission-request",
      { session_id: "codex-1", cwd: "/tmp", tool_name: "shell" },
      TERMINAL_ID,
    );

    expect(result).toEqual({ ok: true });
    expect(session.agentState).toBe("waiting_for_permission");
    expect(session.stateTracker.currentState).toBe("waiting_for_permission");
    expect(session.lastToolName).toBe("shell");
    expect(onStateChange).toHaveBeenCalledWith(TERMINAL_ID, "waiting_for_permission", "shell");
    expect(broadcasts).toEqual([
      { type: "state", state: "waiting_for_permission", toolName: "shell" },
    ]);
  });

  it("falls back to the session's last tool name when the payload has none", () => {
    const { processor, broadcasts, onStateChange } = makeHarness({
      agentProvider: "codex",
      lastToolName: "apply_patch",
    });

    processor.handleHook("permission-request", { session_id: "codex-1" }, TERMINAL_ID);

    expect(onStateChange).toHaveBeenCalledWith(
      TERMINAL_ID,
      "waiting_for_permission",
      "apply_patch",
    );
    expect(broadcasts).toEqual([
      { type: "state", state: "waiting_for_permission", toolName: "apply_patch" },
    ]);
  });

  it("ignores the hook for non-codex terminals", () => {
    const { processor, session, broadcasts, onStateChange } = makeHarness({
      agentProvider: "claude-code",
    });

    const result = processor.handleHook(
      "permission-request",
      { session_id: "claude-1", tool_name: "Bash" },
      TERMINAL_ID,
    );

    expect(result).toEqual({ ok: true });
    expect(session.agentState).toBe("processing");
    expect(session.stateTracker.currentState).toBe("processing");
    expect(onStateChange).not.toHaveBeenCalled();
    expect(broadcasts).toEqual([]);
  });

  it("stays ok when the session is unknown", () => {
    const { processor, onStateChange } = makeHarness({
      agentProvider: "codex",
      hasSession: false,
    });

    const result = processor.handleHook(
      "permission-request",
      { session_id: "codex-1", tool_name: "shell" },
      TERMINAL_ID,
    );

    expect(result).toEqual({ ok: true });
    expect(onStateChange).not.toHaveBeenCalled();
  });
});

describe("stop hook for codex sessions", () => {
  it("skips the Claude transcript parser and stores only last_assistant_message", () => {
    const { processor, transcriptDirectoryPath } = makeHarness({ agentProvider: "codex" });
    // A Claude-format file at transcript_path: if the parser ran, the stored
    // turns would include the user turn from this file.
    const transcriptPath = writeClaudeTranscript(transcriptDirectoryPath);

    processor.handleHook(
      "stop",
      {
        session_id: "codex-1",
        cwd: "/tmp",
        transcript_path: transcriptPath,
        last_assistant_message: "codex finished the task",
      },
      TERMINAL_ID,
    );

    const stored = readStoredTurns(transcriptDirectoryPath);
    expect(stored).not.toBeNull();
    expect(stored).toHaveLength(1);
    expect(stored?.[0]?.role).toBe("assistant");
    expect(stored?.[0]?.content).toBe("codex finished the task");
  });

  it("forces idle before delivering channel messages and keeps the completion path", () => {
    const {
      processor,
      session,
      broadcasts,
      transcriptDirectoryPath,
      agentStatesAtDelivery,
      deliverChannelMessages,
      releaseSessionKeepAlive,
      evaluateSessionCompletion,
      onStateChange,
    } = makeHarness({ agentProvider: "codex" });
    const transcriptPath = writeCodexRolloutTranscript(transcriptDirectoryPath);

    processor.handleHook(
      "stop",
      {
        session_id: "codex-1",
        cwd: "/tmp",
        transcript_path: transcriptPath,
        last_assistant_message: "codex finished the task",
      },
      TERMINAL_ID,
    );

    expect(session.agentState).toBe("idle");
    expect(session.stateTracker.currentState).toBe("idle");
    expect(onStateChange).toHaveBeenCalledWith(TERMINAL_ID, "idle");
    expect(broadcasts).toContainEqual({ type: "state", state: "idle" });
    expect(evaluateSessionCompletion).toHaveBeenCalledWith(TERMINAL_ID);
    expect(deliverChannelMessages).toHaveBeenCalledWith(TERMINAL_ID);
    // The idle gate must already be open when delivery runs.
    expect(agentStatesAtDelivery).toEqual(["idle"]);
    expect(releaseSessionKeepAlive).toHaveBeenCalledWith(TERMINAL_ID);
  });

  it("still idles and evaluates completion without a last_assistant_message", () => {
    const {
      processor,
      session,
      transcriptDirectoryPath,
      evaluateSessionCompletion,
      deliverChannelMessages,
    } = makeHarness({ agentProvider: "codex" });
    const transcriptPath = writeCodexRolloutTranscript(transcriptDirectoryPath);

    processor.handleHook(
      "stop",
      { session_id: "codex-1", cwd: "/tmp", transcript_path: transcriptPath },
      TERMINAL_ID,
    );

    expect(readStoredTurns(transcriptDirectoryPath)).toBeNull();
    expect(session.agentState).toBe("idle");
    expect(evaluateSessionCompletion).toHaveBeenCalledWith(TERMINAL_ID);
    expect(deliverChannelMessages).toHaveBeenCalledWith(TERMINAL_ID);
  });
});

describe("stop hook and awaiting-review terminals", () => {
  it("keeps an awaiting-review terminal alive instead of starting the idle-close grace", () => {
    const {
      processor,
      terminal,
      transcriptDirectoryPath,
      releaseSessionKeepAlive,
      evaluateSessionCompletion,
    } = makeHarness({ agentProvider: "codex" });
    // The verdict lands during evaluation, before the keep-alive decision.
    evaluateSessionCompletion.mockImplementation(() => {
      terminal.lifecycleState = "awaiting-review";
    });
    const transcriptPath = writeCodexRolloutTranscript(transcriptDirectoryPath);

    processor.handleHook(
      "stop",
      { session_id: "codex-1", cwd: "/tmp", transcript_path: transcriptPath },
      TERMINAL_ID,
    );

    expect(evaluateSessionCompletion).toHaveBeenCalledWith(TERMINAL_ID);
    expect(releaseSessionKeepAlive).not.toHaveBeenCalled();
  });

  it("still releases keep-alive when the stop did not finish the work", () => {
    const { processor, terminal, transcriptDirectoryPath, releaseSessionKeepAlive } = makeHarness({
      agentProvider: "codex",
    });
    terminal.lifecycleState = "running";
    const transcriptPath = writeCodexRolloutTranscript(transcriptDirectoryPath);

    processor.handleHook(
      "stop",
      { session_id: "codex-1", cwd: "/tmp", transcript_path: transcriptPath },
      TERMINAL_ID,
    );

    expect(releaseSessionKeepAlive).toHaveBeenCalledWith(TERMINAL_ID);
  });
});

describe("stop hook for claude-code sessions", () => {
  it("keeps parsing the Claude transcript and does not force idle", () => {
    const {
      processor,
      session,
      broadcasts,
      transcriptDirectoryPath,
      evaluateSessionCompletion,
      deliverChannelMessages,
      releaseSessionKeepAlive,
      onStateChange,
    } = makeHarness({ agentProvider: "claude-code" });
    const transcriptPath = writeClaudeTranscript(transcriptDirectoryPath);

    processor.handleHook(
      "stop",
      {
        session_id: "claude-1",
        cwd: "/tmp",
        transcript_path: transcriptPath,
        last_assistant_message: "done, bug fixed",
      },
      TERMINAL_ID,
    );

    const stored = readStoredTurns(transcriptDirectoryPath);
    expect(stored).not.toBeNull();
    expect(stored?.map((turn) => turn.role)).toContain("user");
    // Claude sessions return to idle via the idle_prompt notification, not the
    // stop hook; forcing idle here would race the real notification.
    expect(session.agentState).toBe("processing");
    expect(onStateChange).not.toHaveBeenCalledWith(TERMINAL_ID, "idle");
    expect(broadcasts).not.toContainEqual({ type: "state", state: "idle" });
    expect(evaluateSessionCompletion).toHaveBeenCalledWith(TERMINAL_ID);
    expect(deliverChannelMessages).toHaveBeenCalledWith(TERMINAL_ID);
    expect(releaseSessionKeepAlive).toHaveBeenCalledWith(TERMINAL_ID);
  });

  it("behaves the same for terminals without an agentProvider", () => {
    const { processor, session, transcriptDirectoryPath } = makeHarness();
    const transcriptPath = writeClaudeTranscript(transcriptDirectoryPath);

    processor.handleHook(
      "stop",
      { session_id: "claude-1", cwd: "/tmp", transcript_path: transcriptPath },
      TERMINAL_ID,
    );

    const stored = readStoredTurns(transcriptDirectoryPath);
    expect(stored?.map((turn) => turn.role)).toContain("user");
    expect(session.agentState).toBe("processing");
  });
});
