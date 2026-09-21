import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SERVER_LOG_MAX_BYTES,
  configureServerLogging,
  installUncaughtErrorLogging,
  isVerboseLoggingEnabled,
  log,
  logVerbose,
} from "../src/logging";

describe("logging", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    configureServerLogging({ projectStateDir: "", env: { OCTOGENT_SERVER_LOG: "off" } });
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const makeStateDir = () => {
    const directory = mkdtempSync(join(tmpdir(), "octogent-logging-test-"));
    temporaryDirectories.push(directory);
    return directory;
  };

  it("keeps verbose logs disabled by default", () => {
    vi.stubEnv("OCTOGENT_VERBOSE_LOGS", undefined);

    expect(isVerboseLoggingEnabled()).toBe(false);
  });

  it("enables verbose logs when OCTOGENT_VERBOSE_LOGS=1", () => {
    vi.stubEnv("OCTOGENT_VERBOSE_LOGS", "1");

    expect(isVerboseLoggingEnabled()).toBe(true);
  });

  it("only writes verbose logs when enabled", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logVerbose("hidden");
    vi.stubEnv("OCTOGENT_VERBOSE_LOGS", "1");
    logVerbose("shown");

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith("shown");
  });

  it("creates the server log and appends regular lines", () => {
    const projectStateDir = makeStateDir();

    const logPath = configureServerLogging({ projectStateDir });
    log("server", "started");

    expect(logPath).toBe(join(projectStateDir, "logs", "server.log"));
    expect(readFileSync(logPath as string, "utf8")).toContain("server started\n");
  });

  it("writes verbose lines to the file without printing them by default", () => {
    const projectStateDir = makeStateDir();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("OCTOGENT_VERBOSE_LOGS", undefined);
    const logPath = configureServerLogging({ projectStateDir });

    logVerbose("[Hook] pre-tool-use: tool=Read session=test");

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(readFileSync(logPath as string, "utf8")).toContain("[Hook] pre-tool-use");
  });

  it("rotates an oversized log and keeps three generations", () => {
    const projectStateDir = makeStateDir();
    const logsDir = join(projectStateDir, "logs");
    const logPath = join(logsDir, "server.log");
    mkdirSync(logsDir, { recursive: true });
    writeFileSync(logPath, "x".repeat(SERVER_LOG_MAX_BYTES + 1));
    writeFileSync(`${logPath}.1`, "generation-one");
    writeFileSync(`${logPath}.2`, "generation-two");
    writeFileSync(`${logPath}.3`, "generation-three");

    configureServerLogging({ projectStateDir });

    expect(readFileSync(`${logPath}.1`, "utf8")).toHaveLength(SERVER_LOG_MAX_BYTES + 1);
    expect(readFileSync(`${logPath}.2`, "utf8")).toBe("generation-one");
    expect(readFileSync(`${logPath}.3`, "utf8")).toBe("generation-two");
    expect(readFileSync(logPath, "utf8")).toBe("");
  });

  it("rotates before a write would cross the size limit", () => {
    const projectStateDir = makeStateDir();
    const logsDir = join(projectStateDir, "logs");
    const logPath = join(logsDir, "server.log");
    mkdirSync(logsDir, { recursive: true });
    writeFileSync(logPath, "x".repeat(SERVER_LOG_MAX_BYTES));
    configureServerLogging({ projectStateDir });

    logVerbose("next generation");

    expect(readFileSync(`${logPath}.1`, "utf8")).toHaveLength(SERVER_LOG_MAX_BYTES);
    expect(readFileSync(logPath, "utf8")).toBe("next generation\n");
  });

  it("masks access tokens in file output", () => {
    const projectStateDir = makeStateDir();
    const logPath = configureServerLogging({ projectStateDir });

    log("LAN: http://192.168.1.2:8787/?token=abcdefghijk");

    expect(readFileSync(logPath as string, "utf8")).toContain("?token=abcd…");
    expect(readFileSync(logPath as string, "utf8")).not.toContain("abcdefghijk");
  });

  it("does not create a file when OCTOGENT_SERVER_LOG=off", () => {
    const projectStateDir = makeStateDir();

    const logPath = configureServerLogging({
      projectStateDir,
      env: { OCTOGENT_SERVER_LOG: "off" },
    });
    log("not persisted");

    expect(logPath).toBeNull();
    expect(existsSync(join(projectStateDir, "logs", "server.log"))).toBe(false);
  });

  it("swallows write failures and warns only once", () => {
    const projectStateDir = makeStateDir();
    const unwritablePath = join(projectStateDir, "directory-not-file");
    mkdirSync(unwritablePath);
    const warningSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    configureServerLogging({
      projectStateDir,
      env: { OCTOGENT_SERVER_LOG: unwritablePath },
    });

    expect(() => logVerbose("first failure")).not.toThrow();
    expect(() => logVerbose("second failure")).not.toThrow();
    expect(warningSpy).toHaveBeenCalledTimes(1);
  });

  it("records uncaught errors through the process monitor", () => {
    const projectStateDir = makeStateDir();
    const logPath = configureServerLogging({ projectStateDir });
    const previousListeners = new Set(process.listeners("uncaughtExceptionMonitor"));
    installUncaughtErrorLogging();
    const monitor = process
      .listeners("uncaughtExceptionMonitor")
      .find((listener) => !previousListeners.has(listener));

    expect(monitor).toBeDefined();
    monitor?.(new Error("unexpected crash"), "uncaughtException");

    expect(readFileSync(logPath as string, "utf8")).toContain("unexpected crash");
  });
});
