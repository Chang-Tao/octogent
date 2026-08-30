import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Duplex } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createShellEnvironmentMock, ensureSpawnHelperMock, spawnMock } = vi.hoisted(() => ({
  createShellEnvironmentMock: vi.fn(() => ({})),
  ensureSpawnHelperMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock("node-pty", () => ({
  spawn: spawnMock,
}));

vi.mock("../src/terminalRuntime/ptyEnvironment", () => ({
  createShellEnvironment: createShellEnvironmentMock,
  ensureNodePtySpawnHelperExecutable: ensureSpawnHelperMock,
}));

import { createSessionRuntime } from "../src/terminalRuntime/sessionRuntime";
import type { PersistedTerminal, TerminalSession } from "../src/terminalRuntime/types";

class FakePty extends EventEmitter {
  write = vi.fn();
  resize = vi.fn();
  kill = vi.fn();

  onData(listener: (chunk: string) => void) {
    this.on("data", listener);
    return {
      dispose: () => {
        this.off("data", listener);
      },
    };
  }

  onExit(listener: (event: { exitCode: number; signal: number }) => void) {
    this.on("exit", listener);
    return {
      dispose: () => {
        this.off("exit", listener);
      },
    };
  }

  emitData(chunk: string) {
    this.emit("data", chunk);
  }

  emitExit(event: { exitCode: number; signal: number }) {
    this.emit("exit", event);
  }
}

class FakeWebSocket extends EventEmitter {
  readyState = 1;
  sentMessages: string[] = [];
  send = vi.fn((payload: string) => {
    this.sentMessages.push(payload);
  });
  close = vi.fn(() => {
    if (this.readyState !== 1) {
      return;
    }

    this.readyState = 3;
    this.emit("close");
  });
}

class FakeWebSocketServer {
  nextSocket: FakeWebSocket | null = null;

  handleUpgrade = vi.fn(
    (
      _request: IncomingMessage,
      _socket: Duplex,
      _head: Buffer,
      callback: (socket: FakeWebSocket) => void,
    ) => {
      if (!this.nextSocket) {
        throw new Error("Missing websocket for upgrade.");
      }

      const socket = this.nextSocket;
      this.nextSocket = null;
      callback(socket);
    },
  );
}

const createUpgradeRequest = (tentacleId: string) =>
  ({
    url: `/api/terminals/${tentacleId}/ws`,
  }) as IncomingMessage;

const parseSentMessages = (socket: FakeWebSocket) =>
  socket.sentMessages.map((raw) => JSON.parse(raw) as { type: string; data?: string });

describe("createSessionRuntime", () => {
  const temporaryDirectories: string[] = [];

  const createTemporaryDirectory = () => {
    const directory = mkdtempSync(join(tmpdir(), "octogent-session-runtime-test-"));
    temporaryDirectories.push(directory);
    return directory;
  };

  beforeEach(() => {
    createShellEnvironmentMock.mockClear();
    ensureSpawnHelperMock.mockClear();
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories.length = 0;
  });

  it("keeps a session alive across reconnects and replays scrollback history", () => {
    const tentacleId = "tentacle-1";
    const terminals = new Map<string, PersistedTerminal>([
      [
        tentacleId,
        {
          terminalId: tentacleId,
          tentacleId,
          tentacleName: tentacleId,
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
        },
      ],
    ]);
    const sessions = new Map<string, TerminalSession>();
    const websocketServer = new FakeWebSocketServer();
    const pty = new FakePty();
    const transcriptDirectoryPath = createTemporaryDirectory();
    spawnMock.mockReturnValue(pty);

    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions,
      getTentacleWorkspaceCwd: () => process.cwd(),
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
      sessionIdleGraceMs: 60_000,
      scrollbackMaxBytes: 1024,
    });

    const firstSocket = new FakeWebSocket();
    websocketServer.nextSocket = firstSocket;
    expect(
      runtime.handleUpgrade(createUpgradeRequest(tentacleId), {} as Duplex, Buffer.alloc(0)),
    ).toBe(true);

    pty.emitData("first line\r\n");
    pty.emitData("second line\r\n");
    firstSocket.close();
    expect(sessions.has(tentacleId)).toBe(true);

    const secondSocket = new FakeWebSocket();
    websocketServer.nextSocket = secondSocket;
    expect(
      runtime.handleUpgrade(createUpgradeRequest(tentacleId), {} as Duplex, Buffer.alloc(0)),
    ).toBe(true);

    const secondMessages = parseSentMessages(secondSocket);
    expect(secondMessages.find((message) => message.type === "history")).toEqual({
      type: "history",
      data: "first line\r\nsecond line\r\n",
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(pty.write).toHaveBeenCalledTimes(1);

    runtime.close();
  });

  it("closes idle sessions after the configured grace timeout", () => {
    vi.useFakeTimers();

    const tentacleId = "tentacle-1";
    const terminals = new Map<string, PersistedTerminal>([
      [
        tentacleId,
        {
          terminalId: tentacleId,
          tentacleId,
          tentacleName: tentacleId,
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
        },
      ],
    ]);
    const sessions = new Map<string, TerminalSession>();
    const websocketServer = new FakeWebSocketServer();
    const pty = new FakePty();
    const transcriptDirectoryPath = createTemporaryDirectory();
    spawnMock.mockReturnValue(pty);

    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions,
      getTentacleWorkspaceCwd: () => process.cwd(),
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
      sessionIdleGraceMs: 1000,
      scrollbackMaxBytes: 1024,
    });

    const socket = new FakeWebSocket();
    websocketServer.nextSocket = socket;
    expect(
      runtime.handleUpgrade(createUpgradeRequest(tentacleId), {} as Duplex, Buffer.alloc(0)),
    ).toBe(true);
    socket.close();

    expect(sessions.has(tentacleId)).toBe(true);
    vi.advanceTimersByTime(999);
    expect(sessions.has(tentacleId)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(pty.kill).toHaveBeenCalledTimes(1);
    expect(sessions.has(tentacleId)).toBe(false);

    runtime.close();
  });

  it("disposes PTY subscriptions when a session is closed", () => {
    const tentacleId = "tentacle-1";
    const terminals = new Map<string, PersistedTerminal>([
      [
        tentacleId,
        {
          terminalId: tentacleId,
          tentacleId,
          tentacleName: tentacleId,
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
        },
      ],
    ]);
    const sessions = new Map<string, TerminalSession>();
    const websocketServer = new FakeWebSocketServer();
    const pty = new FakePty();
    const transcriptDirectoryPath = createTemporaryDirectory();
    spawnMock.mockReturnValue(pty);

    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions,
      getTentacleWorkspaceCwd: () => process.cwd(),
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
      sessionIdleGraceMs: 60_000,
      scrollbackMaxBytes: 1024,
    });

    expect(runtime.startSession(tentacleId)).toBe(true);
    expect(pty.listenerCount("data")).toBe(1);
    expect(pty.listenerCount("exit")).toBe(1);

    expect(runtime.closeSession(tentacleId)).toBe(true);

    expect(pty.kill).toHaveBeenCalledTimes(1);
    expect(pty.listenerCount("data")).toBe(0);
    expect(pty.listenerCount("exit")).toBe(0);
    expect(sessions.has(tentacleId)).toBe(false);

    runtime.close();
  });

  it("clears delayed prompt timers when a prompted session is closed", () => {
    vi.useFakeTimers();

    const tentacleId = "tentacle-1";
    const terminals = new Map<string, PersistedTerminal>([
      [
        tentacleId,
        {
          terminalId: tentacleId,
          tentacleId,
          tentacleName: tentacleId,
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
          initialPrompt: "Investigate and report back.",
        },
      ],
    ]);
    const sessions = new Map<string, TerminalSession>();
    const websocketServer = new FakeWebSocketServer();
    const pty = new FakePty();
    const transcriptDirectoryPath = createTemporaryDirectory();
    spawnMock.mockReturnValue(pty);

    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions,
      getTentacleWorkspaceCwd: () => process.cwd(),
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
      sessionIdleGraceMs: 60_000,
      scrollbackMaxBytes: 1024,
    });

    expect(runtime.startSession(tentacleId)).toBe(true);
    expect(pty.write).toHaveBeenNthCalledWith(1, "claude --permission-mode auto\r");

    expect(runtime.closeSession(tentacleId)).toBe(true);
    vi.advanceTimersByTime(10_000);

    expect(pty.write).toHaveBeenCalledTimes(1);
    expect(sessions.has(tentacleId)).toBe(false);

    runtime.close();
  });

  it("releases headless prompted sessions after keepalive is dropped", () => {
    vi.useFakeTimers();

    const tentacleId = "tentacle-1";
    const terminals = new Map<string, PersistedTerminal>([
      [
        tentacleId,
        {
          terminalId: tentacleId,
          tentacleId,
          tentacleName: tentacleId,
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
          initialPrompt: "Investigate and report back.",
        },
      ],
    ]);
    const sessions = new Map<string, TerminalSession>();
    const websocketServer = new FakeWebSocketServer();
    const pty = new FakePty();
    const transcriptDirectoryPath = createTemporaryDirectory();
    spawnMock.mockReturnValue(pty);

    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions,
      getTentacleWorkspaceCwd: () => process.cwd(),
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
      sessionIdleGraceMs: 1_000,
      scrollbackMaxBytes: 1024,
    });

    expect(runtime.startSession(tentacleId)).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(sessions.has(tentacleId)).toBe(true);

    expect(runtime.releaseSessionKeepAlive(tentacleId)).toBe(true);
    vi.advanceTimersByTime(999);
    expect(sessions.has(tentacleId)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(pty.kill).toHaveBeenCalledTimes(1);
    expect(sessions.has(tentacleId)).toBe(false);

    runtime.close();
  });

  it("removes exited sessions without killing the already-exited PTY", () => {
    const tentacleId = "tentacle-1";
    const terminals = new Map<string, PersistedTerminal>([
      [
        tentacleId,
        {
          terminalId: tentacleId,
          tentacleId,
          tentacleName: tentacleId,
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
        },
      ],
    ]);
    const sessions = new Map<string, TerminalSession>();
    const websocketServer = new FakeWebSocketServer();
    const pty = new FakePty();
    const transcriptDirectoryPath = createTemporaryDirectory();
    spawnMock.mockReturnValue(pty);

    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions,
      getTentacleWorkspaceCwd: () => process.cwd(),
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
      sessionIdleGraceMs: 60_000,
      scrollbackMaxBytes: 1024,
    });

    expect(runtime.startSession(tentacleId)).toBe(true);
    pty.emitExit({ exitCode: 0, signal: 0 });

    expect(pty.kill).not.toHaveBeenCalled();
    expect(pty.listenerCount("data")).toBe(0);
    expect(pty.listenerCount("exit")).toBe(0);
    expect(sessions.has(tentacleId)).toBe(false);

    runtime.close();
  });

  it("enforces the configured max concurrent terminal sessions before spawning", () => {
    const terminals = new Map<string, PersistedTerminal>([
      [
        "tentacle-1",
        {
          terminalId: "tentacle-1",
          tentacleId: "tentacle-1",
          tentacleName: "tentacle-1",
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
        },
      ],
      [
        "tentacle-2",
        {
          terminalId: "tentacle-2",
          tentacleId: "tentacle-2",
          tentacleName: "tentacle-2",
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
        },
      ],
    ]);
    const sessions = new Map<string, TerminalSession>();
    const websocketServer = new FakeWebSocketServer();
    const firstPty = new FakePty();
    const transcriptDirectoryPath = createTemporaryDirectory();
    spawnMock.mockReturnValue(firstPty);

    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions,
      getTentacleWorkspaceCwd: () => process.cwd(),
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
      sessionIdleGraceMs: 60_000,
      scrollbackMaxBytes: 1024,
      maxConcurrentSessions: 1,
    });

    expect(runtime.startSession("tentacle-1")).toBe(true);
    expect(runtime.startSession("tentacle-2")).toBe(false);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(sessions.has("tentacle-1")).toBe(true);
    expect(sessions.has("tentacle-2")).toBe(false);

    runtime.close();
  });

  it("truncates oversize chunks to the configured scrollback size", () => {
    const tentacleId = "tentacle-1";
    const terminals = new Map<string, PersistedTerminal>([
      [
        tentacleId,
        {
          terminalId: tentacleId,
          tentacleId,
          tentacleName: tentacleId,
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
        },
      ],
    ]);
    const sessions = new Map<string, TerminalSession>();
    const websocketServer = new FakeWebSocketServer();
    const pty = new FakePty();
    const transcriptDirectoryPath = createTemporaryDirectory();
    spawnMock.mockReturnValue(pty);

    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions,
      getTentacleWorkspaceCwd: () => process.cwd(),
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
      sessionIdleGraceMs: 60_000,
      scrollbackMaxBytes: 8,
    });

    const firstSocket = new FakeWebSocket();
    websocketServer.nextSocket = firstSocket;
    expect(
      runtime.handleUpgrade(createUpgradeRequest(tentacleId), {} as Duplex, Buffer.alloc(0)),
    ).toBe(true);
    pty.emitData("123456789012");
    firstSocket.close();

    const secondSocket = new FakeWebSocket();
    websocketServer.nextSocket = secondSocket;
    expect(
      runtime.handleUpgrade(createUpgradeRequest(tentacleId), {} as Duplex, Buffer.alloc(0)),
    ).toBe(true);

    const secondMessages = parseSentMessages(secondSocket);
    expect(secondMessages.find((message) => message.type === "history")).toEqual({
      type: "history",
      data: "56789012",
    });

    runtime.close();
  });

  it("strips a broken leading ANSI fragment from replayed history after truncation", () => {
    const tentacleId = "tentacle-1";
    const terminals = new Map<string, PersistedTerminal>([
      [
        tentacleId,
        {
          terminalId: tentacleId,
          tentacleId,
          tentacleName: tentacleId,
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
        },
      ],
    ]);
    const sessions = new Map<string, TerminalSession>();
    const websocketServer = new FakeWebSocketServer();
    const pty = new FakePty();
    const transcriptDirectoryPath = createTemporaryDirectory();
    spawnMock.mockReturnValue(pty);

    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions,
      getTentacleWorkspaceCwd: () => process.cwd(),
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
      sessionIdleGraceMs: 60_000,
      scrollbackMaxBytes: 18,
    });

    const firstSocket = new FakeWebSocket();
    websocketServer.nextSocket = firstSocket;
    expect(
      runtime.handleUpgrade(createUpgradeRequest(tentacleId), {} as Duplex, Buffer.alloc(0)),
    ).toBe(true);
    pty.emitData("\u001b[48;2;55;55;55mHELLO\r\n");
    firstSocket.close();

    const secondSocket = new FakeWebSocket();
    websocketServer.nextSocket = secondSocket;
    expect(
      runtime.handleUpgrade(createUpgradeRequest(tentacleId), {} as Duplex, Buffer.alloc(0)),
    ).toBe(true);

    const secondMessages = parseSentMessages(secondSocket);
    expect(secondMessages.find((message) => message.type === "history")).toEqual({
      type: "history",
      data: "HELLO\r\n",
    });

    runtime.close();
  });

  it("ignores duplicate resize payloads for the same terminal size", () => {
    const tentacleId = "tentacle-1";
    const terminals = new Map<string, PersistedTerminal>([
      [
        tentacleId,
        {
          terminalId: tentacleId,
          tentacleId,
          tentacleName: tentacleId,
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
        },
      ],
    ]);
    const sessions = new Map<string, TerminalSession>();
    const websocketServer = new FakeWebSocketServer();
    const pty = new FakePty();
    const transcriptDirectoryPath = createTemporaryDirectory();
    spawnMock.mockReturnValue(pty);

    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions,
      getTentacleWorkspaceCwd: () => process.cwd(),
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
      sessionIdleGraceMs: 60_000,
      scrollbackMaxBytes: 1024,
    });

    const socket = new FakeWebSocket();
    websocketServer.nextSocket = socket;
    expect(
      runtime.handleUpgrade(createUpgradeRequest(tentacleId), {} as Duplex, Buffer.alloc(0)),
    ).toBe(true);

    socket.emit("message", JSON.stringify({ type: "resize", cols: 120, rows: 35 }));
    socket.emit("message", JSON.stringify({ type: "resize", cols: 120, rows: 35 }));
    socket.emit("message", JSON.stringify({ type: "resize", cols: 121, rows: 35 }));

    expect(pty.resize).toHaveBeenCalledTimes(1);
    expect(pty.resize).toHaveBeenLastCalledWith(121, 35);

    runtime.close();
  });

  it("writes normalized transcript events for each terminal session", async () => {
    const tentacleId = "tentacle-1";
    const terminals = new Map<string, PersistedTerminal>([
      [
        tentacleId,
        {
          terminalId: tentacleId,
          tentacleId,
          tentacleName: tentacleId,
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
        },
      ],
    ]);
    const sessions = new Map<string, TerminalSession>();
    const websocketServer = new FakeWebSocketServer();
    const pty = new FakePty();
    const transcriptDirectoryPath = createTemporaryDirectory();
    spawnMock.mockReturnValue(pty);

    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions,
      getTentacleWorkspaceCwd: () => process.cwd(),
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
      sessionIdleGraceMs: 60_000,
      scrollbackMaxBytes: 1024,
    });

    const socket = new FakeWebSocket();
    websocketServer.nextSocket = socket;
    expect(
      runtime.handleUpgrade(createUpgradeRequest(tentacleId), {} as Duplex, Buffer.alloc(0)),
    ).toBe(true);

    socket.emit("message", JSON.stringify({ type: "input", data: "echo hi\r" }));
    pty.emitData("\u001b[31mred\u001b[0m\r\n");
    runtime.close();

    const transcriptPath = join(transcriptDirectoryPath, `${encodeURIComponent(tentacleId)}.jsonl`);
    type TranscriptEvent = { type: string; text?: string; reason?: string };

    // The file appearing does not mean the stream flushed a whole line, so wait
    // for content that parses rather than for the path to exist.
    const readTranscriptEvents = (): TranscriptEvent[] => {
      if (!existsSync(transcriptPath)) {
        return [];
      }
      const contents = readFileSync(transcriptPath, "utf8").trim();
      if (!contents) {
        return [];
      }
      try {
        return contents.split(/\r?\n/).map((line) => JSON.parse(line) as TranscriptEvent);
      } catch {
        return [];
      }
    };

    let transcriptEvents: TranscriptEvent[] = [];
    for (let attempt = 0; attempt < 100; attempt += 1) {
      transcriptEvents = readTranscriptEvents();
      if (
        transcriptEvents.some((event) => event.type === "session_start") &&
        transcriptEvents.some((event) => event.type === "session_end")
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(transcriptEvents.some((event) => event.type === "session_start")).toBe(true);
    expect(
      transcriptEvents.some(
        (event) => event.type === "session_end" && event.reason === "session_close",
      ),
    ).toBe(true);
  });

  it("can start a prompted session headlessly and submits the prompt automatically", () => {
    vi.useFakeTimers();

    const tentacleId = "tentacle-1";
    const terminals = new Map<string, PersistedTerminal>([
      [
        tentacleId,
        {
          terminalId: tentacleId,
          tentacleId,
          tentacleName: tentacleId,
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
          initialPrompt: "Investigate and report back.",
        },
      ],
    ]);
    const sessions = new Map<string, TerminalSession>();
    const websocketServer = new FakeWebSocketServer();
    const pty = new FakePty();
    const transcriptDirectoryPath = createTemporaryDirectory();
    spawnMock.mockReturnValue(pty);

    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions,
      getTentacleWorkspaceCwd: () => process.cwd(),
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
      sessionIdleGraceMs: 1000,
      scrollbackMaxBytes: 1024,
    });

    expect(runtime.startSession(tentacleId)).toBe(true);
    expect(sessions.has(tentacleId)).toBe(true);
    expect(pty.write).toHaveBeenNthCalledWith(1, "claude --permission-mode auto\r");

    vi.advanceTimersByTime(4_000);
    expect(pty.write).toHaveBeenNthCalledWith(
      2,
      "\u001b[200~Investigate and report back.\u001b[201~",
    );

    vi.advanceTimersByTime(150);
    expect(pty.write).toHaveBeenNthCalledWith(3, "\r");

    vi.advanceTimersByTime(10_000);
    expect(sessions.has(tentacleId)).toBe(true);

    runtime.close();
  });

  it("pastes an initial input draft without submitting it", () => {
    vi.useFakeTimers();

    const tentacleId = "tentacle-1";
    const terminals = new Map<string, PersistedTerminal>([
      [
        tentacleId,
        {
          terminalId: tentacleId,
          tentacleId,
          tentacleName: tentacleId,
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
          initialInputDraft: "You are working on docs.",
        },
      ],
    ]);
    const sessions = new Map<string, TerminalSession>();
    const websocketServer = new FakeWebSocketServer();
    const pty = new FakePty();
    const transcriptDirectoryPath = createTemporaryDirectory();
    spawnMock.mockReturnValue(pty);

    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions,
      getTentacleWorkspaceCwd: () => process.cwd(),
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
      sessionIdleGraceMs: 1_000,
      scrollbackMaxBytes: 1_024,
    });

    const socket = new FakeWebSocket();
    websocketServer.nextSocket = socket;
    expect(
      runtime.handleUpgrade(createUpgradeRequest(tentacleId), {} as Duplex, Buffer.alloc(0)),
    ).toBe(true);

    expect(pty.write).toHaveBeenNthCalledWith(1, "claude --permission-mode auto\r");

    vi.advanceTimersByTime(4_000);
    expect(pty.write).toHaveBeenNthCalledWith(2, "\u001b[200~You are working on docs.\u001b[201~");

    vi.advanceTimersByTime(150);
    expect(pty.write).toHaveBeenCalledTimes(2);

    runtime.close();
  });

  it("reports runtime state changes through the state-change callback", () => {
    const tentacleId = "tentacle-1";
    const terminals = new Map<string, PersistedTerminal>([
      [
        tentacleId,
        {
          terminalId: tentacleId,
          tentacleId,
          tentacleName: tentacleId,
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
        },
      ],
    ]);
    const sessions = new Map<string, TerminalSession>();
    const websocketServer = new FakeWebSocketServer();
    const pty = new FakePty();
    const transcriptDirectoryPath = createTemporaryDirectory();
    const onStateChange = vi.fn();
    spawnMock.mockReturnValue(pty);

    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions,
      getTentacleWorkspaceCwd: () => process.cwd(),
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
      sessionIdleGraceMs: 60_000,
      scrollbackMaxBytes: 1024,
      onStateChange,
    });

    const socket = new FakeWebSocket();
    websocketServer.nextSocket = socket;
    expect(
      runtime.handleUpgrade(createUpgradeRequest(tentacleId), {} as Duplex, Buffer.alloc(0)),
    ).toBe(true);

    socket.emit("message", JSON.stringify({ type: "input", data: "echo hi\r" }));

    expect(onStateChange).toHaveBeenCalledWith(tentacleId, "processing", undefined);

    runtime.close();
  });

  it("reports session lifecycle start and exit through callbacks", () => {
    const tentacleId = "tentacle-1";
    const terminals = new Map<string, PersistedTerminal>([
      [
        tentacleId,
        {
          terminalId: tentacleId,
          tentacleId,
          tentacleName: tentacleId,
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
        },
      ],
    ]);
    const sessions = new Map<string, TerminalSession>();
    const websocketServer = new FakeWebSocketServer();
    const pty = new FakePty();
    Object.defineProperty(pty, "pid", { value: 3210 });
    const transcriptDirectoryPath = createTemporaryDirectory();
    const onSessionStart = vi.fn();
    const onSessionEnd = vi.fn();
    spawnMock.mockReturnValue(pty);

    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions,
      getTentacleWorkspaceCwd: () => process.cwd(),
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
      sessionIdleGraceMs: 60_000,
      scrollbackMaxBytes: 1024,
      onSessionStart,
      onSessionEnd,
    });

    const socket = new FakeWebSocket();
    websocketServer.nextSocket = socket;
    expect(
      runtime.handleUpgrade(createUpgradeRequest(tentacleId), {} as Duplex, Buffer.alloc(0)),
    ).toBe(true);

    expect(onSessionStart).toHaveBeenCalledWith(
      tentacleId,
      expect.objectContaining({
        processId: 3210,
        startedAt: expect.any(String),
      }),
    );

    pty.emit("exit", { exitCode: 7, signal: 0 });

    expect(onSessionEnd).toHaveBeenCalledWith(
      tentacleId,
      expect.objectContaining({
        reason: "pty_exit",
        exitCode: 7,
        signal: 0,
        endedAt: expect.any(String),
      }),
    );
    expect(sessions.has(tentacleId)).toBe(false);

    runtime.close();
  });
});
