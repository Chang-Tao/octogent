import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { format } from "node:util";

export const SERVER_LOG_MAX_BYTES = 5 * 1024 * 1024;
const SERVER_LOG_GENERATIONS = 3;

let serverLogPath: string | null = null;
let hasWarnedAboutFileLogging = false;
let hasInstalledUncaughtErrorLogging = false;

const isEnabled = (value: string | undefined): boolean => value === "1";

export const isVerboseLoggingEnabled = (): boolean => isEnabled(process.env.OCTOGENT_VERBOSE_LOGS);

const warnOnce = (error: unknown): void => {
  if (hasWarnedAboutFileLogging) {
    return;
  }
  hasWarnedAboutFileLogging = true;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[server-log] Unable to write ${serverLogPath ?? "server log"}: ${message}`);
};

const rotateServerLog = (logPath: string): void => {
  for (let generation = SERVER_LOG_GENERATIONS; generation >= 1; generation -= 1) {
    const source = generation === 1 ? logPath : `${logPath}.${generation - 1}`;
    const destination = `${logPath}.${generation}`;
    if (!existsSync(source)) {
      continue;
    }
    rmSync(destination, { force: true });
    renameSync(source, destination);
  }
};

const rotateIfNeeded = (incomingBytes = 0): void => {
  if (!serverLogPath || !existsSync(serverLogPath)) {
    return;
  }
  if (statSync(serverLogPath).size + incomingBytes > SERVER_LOG_MAX_BYTES) {
    rotateServerLog(serverLogPath);
  }
};

const maskSecrets = (line: string): string =>
  line.replace(/([?&]token=)([^&\s]+)/gu, (_match, prefix: string, token: string) => {
    return `${prefix}${token.slice(0, 4)}…`;
  });

const appendToServerLog = (args: Parameters<typeof console.log>): void => {
  if (!serverLogPath) {
    return;
  }
  try {
    const line = `${maskSecrets(format(...args))}\n`;
    rotateIfNeeded(Buffer.byteLength(line));
    appendFileSync(serverLogPath, line, "utf8");
  } catch (error) {
    // Logging must never turn an otherwise healthy request into a failure.
    warnOnce(error);
  }
};

type ConfigureServerLoggingOptions = {
  projectStateDir: string;
  env?: NodeJS.ProcessEnv;
};

export const configureServerLogging = ({
  projectStateDir,
  env = process.env,
}: ConfigureServerLoggingOptions): string | null => {
  hasWarnedAboutFileLogging = false;
  const configuredPath = env.OCTOGENT_SERVER_LOG?.trim();
  if (configuredPath?.toLowerCase() === "off") {
    serverLogPath = null;
    return null;
  }

  serverLogPath = configuredPath
    ? isAbsolute(configuredPath)
      ? configuredPath
      : resolve(configuredPath)
    : join(projectStateDir, "logs", "server.log");

  try {
    mkdirSync(dirname(serverLogPath), { recursive: true });
    rotateIfNeeded();
    appendFileSync(serverLogPath, "", "utf8");
  } catch (error) {
    warnOnce(error);
  }
  return serverLogPath;
};

export const log = (...args: Parameters<typeof console.log>): void => {
  console.log(...args);
  appendToServerLog(args);
};

export const logWarn = (...args: Parameters<typeof console.warn>): void => {
  console.warn(...args);
  appendToServerLog(args);
};

export const logError = (...args: Parameters<typeof console.error>): void => {
  console.error(...args);
  appendToServerLog(args);
};

export const logVerbose = (...args: Parameters<typeof console.log>): void => {
  if (isVerboseLoggingEnabled()) {
    console.log(...args);
  }
  appendToServerLog(args);
};

export const installUncaughtErrorLogging = (): void => {
  if (hasInstalledUncaughtErrorLogging) {
    return;
  }
  hasInstalledUncaughtErrorLogging = true;
  process.on("uncaughtExceptionMonitor", (error, origin) => {
    appendToServerLog([`Uncaught error (${origin}):`, error]);
  });
};
