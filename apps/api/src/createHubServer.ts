import { existsSync, statSync } from "node:fs";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { isAbsolute, resolve } from "node:path";
import type { Duplex } from "node:stream";

import type { TerminalLifecycleState } from "@octogent/core";

import {
  assertSecureRemoteBinding,
  evaluateRemoteAuth,
  isLoopbackAddress,
  resolveAccessToken,
} from "./createApiServer/remoteAuth";
import { guardApiRequest } from "./createApiServer/requestHandler";
import {
  readJsonBodyOrWriteError,
  writeJson,
  writeMethodNotAllowed,
  writeNoContent,
} from "./createApiServer/routeHelpers";
import { getRequestCorsOrigin, readHeaderValue } from "./createApiServer/security";
import { serveWebApp } from "./createApiServer/staticFiles";
import { isUpgradeAllowed } from "./createApiServer/upgradeHandler";
import { type ProjectContext, createProjectContext } from "./createProjectContext";
import { type TerminalHealthCounts, createHealthSnapshotSource } from "./healthSnapshot";
import { type HubProjectRegistry, createFileProjectRegistry } from "./hubProjectRegistry";
import { toConnectableHost } from "./listenHost";
import { log, logError, logVerbose } from "./logging";
import type { ProjectRegistryEntry } from "./projectPersistence";
import { resolveProjectKey, toProjectSlug } from "./projectSlug";
import type { GitClient } from "./terminalRuntime";

/** Per project: lower than a lone server's default, since the hub cap is shared. */
const HUB_DEFAULT_SESSIONS_PER_PROJECT = 12;
const HUB_DEFAULT_MAX_SESSIONS = 32;

const PROJECT_API_MOUNT = /^\/api\/p\/([^/]+)(\/.*)?$/;
const PROJECT_WEB_MOUNT = /^\/p\/[^/]+(\/.*)?$/;

export type CreateHubServerOptions = {
  registry?: HubProjectRegistry;
  webDistDir?: string | undefined;
  promptsDir?: string | undefined;
  accessToken?: string | null;
  /** The address agents dial; defaults to the bound address once start() listens. */
  hubBaseUrl?: string | undefined;
  gitClient?: GitClient;
  /** Hub-wide PTY session cap; defaults to OCTOGENT_HUB_MAX_TERMINAL_SESSIONS, then 32. */
  maxTotalSessions?: number;
  /** Per-project cap; defaults to OCTOGENT_MAX_TERMINAL_SESSIONS when set, else 12. */
  maxSessionsPerProject?: number;
};

type LoadedProject = { context: ProjectContext; slug: string };

class ProjectUnavailableError extends Error {}

const readPositiveInteger = (raw: string | undefined): number | undefined => {
  const parsed = Number(raw?.trim());
  return raw?.trim() && Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : undefined;
};

const isExistingDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

const matchProjectMount = (pathname: string): { key: string; rest: string } | null => {
  const match = PROJECT_API_MOUNT.exec(pathname);
  if (!match) {
    return null;
  }
  try {
    return { key: decodeURIComponent(match[1] ?? ""), rest: match[2] ?? "/" };
  } catch {
    // A malformed escape cannot name any project.
    return { key: "", rest: "/" };
  }
};

const sumHealthCounts = (counts: TerminalHealthCounts[]): TerminalHealthCounts => {
  const terminals: Record<TerminalLifecycleState, number> = {
    registered: 0,
    running: 0,
    stopped: 0,
    exited: 0,
    stale: 0,
    stalled: 0,
    "awaiting-review": 0,
    completed: 0,
  };
  let ptySessions = 0;
  let terminalEventClients = 0;
  for (const entry of counts) {
    ptySessions += entry.ptySessions;
    terminalEventClients += entry.terminalEventClients;
    for (const state of Object.keys(terminals) as TerminalLifecycleState[]) {
      terminals[state] += entry.terminals[state];
    }
  }
  return { ptySessions, terminals, terminalEventClients };
};

/**
 * One process serving every registered project. Projects load lazily on the
 * first request that names them (`/api/p/<slug-or-id>/…`) and stay loaded;
 * each gets its own context and an API base scoped to its id, so hooks and
 * the in-worker CLI reach exactly that project.
 */
export const createHubServer = ({
  registry = createFileProjectRegistry(),
  webDistDir,
  promptsDir,
  accessToken: configuredAccessToken = resolveAccessToken(process.env),
  hubBaseUrl,
  gitClient,
  maxTotalSessions = readPositiveInteger(process.env.OCTOGENT_HUB_MAX_TERMINAL_SESSIONS) ??
    HUB_DEFAULT_MAX_SESSIONS,
  maxSessionsPerProject,
}: CreateHubServerOptions = {}) => {
  const accessToken = configuredAccessToken?.trim() || null;
  let remoteBinding = false;
  const isRemoteBinding = () => remoteBinding;
  const guardOptions = { isRemoteBinding, accessToken };
  let boundBaseUrl = "http://127.0.0.1:8787";
  const getHubBaseUrl = () => (hubBaseUrl ?? boundBaseUrl).replace(/\/+$/, "");
  // Leaving the runtime's option unset lets it honor OCTOGENT_MAX_TERMINAL_SESSIONS itself.
  const perProjectSessions =
    maxSessionsPerProject ??
    (process.env.OCTOGENT_MAX_TERMINAL_SESSIONS?.trim()
      ? undefined
      : HUB_DEFAULT_SESSIONS_PER_PROJECT);
  const resolvedWebDistDir = webDistDir && existsSync(webDistDir) ? webDistDir : null;
  const hubHealth = createHealthSnapshotSource();
  const loaded = new Map<string, LoadedProject>();

  const readTotals = () =>
    sumHealthCounts([...loaded.values()].map(({ context }) => context.runtime.readHealthCounts()));

  const checkSessionAdmission = (): string | null =>
    readTotals().ptySessions >= maxTotalSessions
      ? `Hub terminal session limit reached (${maxTotalSessions}) across all projects. Close a terminal session in any project or increase OCTOGENT_HUB_MAX_TERMINAL_SESSIONS.`
      : null;

  const loadProject = (entry: ProjectRegistryEntry): ProjectContext => {
    const existing = loaded.get(entry.id);
    if (existing) {
      return existing.context;
    }
    // Loading scaffolds .octogent/ in the workspace, which would quietly
    // recreate a directory the operator deleted or moved.
    if (!isExistingDirectory(entry.path)) {
      throw new ProjectUnavailableError(`Project directory not found: ${entry.path}`);
    }

    const { projectId, projectStateDir } = registry.prepare(entry);
    const alreadyLoaded = loaded.get(projectId);
    if (alreadyLoaded) {
      return alreadyLoaded.context;
    }

    const slug = entry.slug ?? toProjectSlug(entry.name);
    const context = createProjectContext({
      workspaceCwd: entry.path,
      projectStateDir,
      promptsDir,
      projectId,
      projectName: entry.name,
      // The id, never the slug: this base is baked into hook files and PTY
      // environments that outlive a rename.
      apiBaseUrl: () => `${getHubBaseUrl()}/api/p/${encodeURIComponent(projectId)}`,
      isRemoteBinding,
      maxConcurrentSessions: perProjectSessions,
      checkSessionAdmission,
      logPrefix: `[${slug}]`,
      ...(gitClient ? { gitClient } : {}),
    });
    loaded.set(projectId, { context, slug });
    log(`[Hub] Loaded project ${slug} (${projectId}) at ${entry.path}`);
    return context;
  };

  const resolveProjectContext = (key: string): ProjectContext | null => {
    // Hooks and worker CLIs address projects by id, so that path skips the registry read.
    const loadedById = loaded.get(key);
    if (loadedById) {
      return loadedById.context;
    }
    const entry = key.length > 0 ? resolveProjectKey(registry.load(), key) : null;
    return entry ? loadProject(entry) : null;
  };

  const toProjectListing = (entry: ProjectRegistryEntry) => {
    const project = loaded.get(entry.id);
    return {
      id: entry.id,
      name: entry.name,
      slug: entry.slug ?? toProjectSlug(entry.name),
      path: entry.path,
      loaded: project !== undefined,
      ...(project ? { summary: project.context.describe() } : {}),
    };
  };

  const handleRegisterProject = async (
    request: IncomingMessage,
    response: ServerResponse,
    corsOrigin: string | null,
  ) => {
    // The guard already admits only loopback or token holders; registering a
    // path grants full-access agents that directory, so it re-checks rather
    // than rely on the guard never being loosened.
    const auth = evaluateRemoteAuth({
      remoteAddress: request.socket.remoteAddress,
      url: request.url ?? "/",
      headers: {
        "x-octogent-token": request.headers["x-octogent-token"],
        cookie: request.headers.cookie,
      },
      accessToken,
    });
    if (auth.kind === "deny") {
      writeJson(response, 401, { error: "Access token required." }, corsOrigin);
      return;
    }

    const body = await readJsonBodyOrWriteError(request, response, corsOrigin);
    if (!body.ok) {
      return;
    }
    const payload = (body.payload ?? {}) as Record<string, unknown>;
    const rawPath = typeof payload.path === "string" ? payload.path.trim() : "";
    if (!rawPath || !isAbsolute(rawPath)) {
      writeJson(response, 400, { error: "path must be an absolute path." }, corsOrigin);
      return;
    }
    const workspaceCwd = resolve(rawPath);
    if (!isExistingDirectory(workspaceCwd)) {
      writeJson(response, 400, { error: `Not a directory: ${workspaceCwd}` }, corsOrigin);
      return;
    }
    const name =
      typeof payload.name === "string" && payload.name.trim().length > 0
        ? payload.name.trim()
        : undefined;

    const knownIds = new Set(registry.load().projects.map((project) => project.id));
    let entry: ProjectRegistryEntry;
    try {
      entry = registry.register(workspaceCwd, name);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      writeJson(response, 400, { error: `Cannot register ${workspaceCwd}: ${reason}` }, corsOrigin);
      return;
    }
    log(`[Hub] Registered project ${entry.slug ?? entry.name} (${entry.id}) at ${workspaceCwd}`);
    // By id, not path: a moved workspace keeps its project.json and so its entry.
    writeJson(response, knownIds.has(entry.id) ? 200 : 201, toProjectListing(entry), corsOrigin);
  };

  const handleHubRoute = async (
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
    corsOrigin: string | null,
  ): Promise<boolean> => {
    if (pathname === "/api/hub/health") {
      if (request.method !== "GET") {
        writeMethodNotAllowed(response, corsOrigin);
        return true;
      }
      writeJson(
        response,
        200,
        {
          ...hubHealth.readHealthSnapshot(readTotals()),
          pid: process.pid,
          maxTerminalSessions: maxTotalSessions,
          projects: { registered: registry.load().projects.length, loaded: loaded.size },
          loadedProjects: [...loaded.values()].map(({ context, slug }) => ({
            id: context.projectId,
            slug,
            ptySessions: context.runtime.readHealthCounts().ptySessions,
          })),
        },
        corsOrigin,
      );
      return true;
    }

    if (pathname === "/api/projects") {
      if (request.method === "GET") {
        writeJson(
          response,
          200,
          { projects: registry.load().projects.map(toProjectListing) },
          corsOrigin,
        );
      } else if (request.method === "POST") {
        await handleRegisterProject(request, response, corsOrigin);
      } else {
        writeMethodNotAllowed(response, corsOrigin);
      }
      return true;
    }

    return false;
  };

  const handleRequest = async (request: IncomingMessage, response: ServerResponse) => {
    if (!guardApiRequest(request, response, guardOptions)) {
      return;
    }
    const startTime = Date.now();
    const method = request.method ?? "?";
    const corsOrigin = getRequestCorsOrigin(
      readHeaderValue(request.headers.origin),
      readHeaderValue(request.headers.host),
      remoteBinding,
    );

    try {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      const { pathname } = requestUrl;

      if (method === "OPTIONS") {
        writeNoContent(response, 204, corsOrigin);
        return;
      }

      const mount = matchProjectMount(pathname);
      if (mount) {
        let project: ProjectContext | null;
        try {
          project = resolveProjectContext(mount.key);
        } catch (error) {
          if (!(error instanceof ProjectUnavailableError)) {
            throw error;
          }
          writeJson(response, 404, { error: error.message }, corsOrigin);
          return;
        }
        if (!project) {
          writeJson(response, 404, { error: `Unknown project: ${mount.key}` }, corsOrigin);
          return;
        }
        // Mount semantics: the project's routes only ever see their own paths.
        request.url = `${mount.rest}${requestUrl.search}`;
        await project.handleRequest(request, response);
        return;
      }

      if (await handleHubRoute(request, response, pathname, corsOrigin)) {
        logVerbose(
          `[Hub] ${method} ${pathname} ${response.statusCode} ${Date.now() - startTime}ms`,
        );
        return;
      }

      if (resolvedWebDistDir && method === "GET" && !pathname.startsWith("/api/")) {
        // /p/<key>/… is a client-side route of the one SPA; built assets are
        // referenced absolutely, but a relative one resolves here too.
        const webMount = PROJECT_WEB_MOUNT.exec(pathname);
        const webPath = webMount ? (webMount[1] ?? "/") : pathname;
        if (await serveWebApp(response, resolvedWebDistDir, webPath)) {
          return;
        }
      }

      writeJson(response, 404, { error: "Not found" }, corsOrigin);
    } catch (error) {
      logError(
        `[Hub] Unhandled error: ${method} ${request.url ?? "/"}`,
        error instanceof Error ? (error.stack ?? error.message) : error,
      );
      if (!response.headersSent) {
        writeJson(response, 500, { error: "Internal server error" }, corsOrigin);
      }
    }
  };

  const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!isUpgradeAllowed(request, guardOptions)) {
      socket.destroy();
      return;
    }
    try {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      const mount = matchProjectMount(requestUrl.pathname);
      const project = mount ? resolveProjectContext(mount.key) : null;
      if (!mount || !project) {
        socket.destroy();
        return;
      }
      request.url = `${mount.rest}${requestUrl.search}`;
      project.handleUpgrade(request, socket, head);
    } catch {
      socket.destroy();
    }
  };

  const server = createServer(handleRequest);
  server.on("upgrade", handleUpgrade);

  return {
    server,
    hubBaseUrl: getHubBaseUrl,
    async start(port = 8787, host = "127.0.0.1") {
      await new Promise<void>((resolveStart, rejectStart) => {
        const onError = (error: Error) => rejectStart(error);
        server.once("error", onError);
        server.listen(port, host, () => {
          server.off("error", onError);
          const address = server.address();
          const boundAddress = typeof address === "object" && address ? address.address : host;
          remoteBinding = !isLoopbackAddress(boundAddress);

          try {
            assertSecureRemoteBinding(boundAddress, accessToken);
            resolveStart();
          } catch (error) {
            server.close(() => rejectStart(error));
          }
        });
      });

      const address = server.address();
      const resolvedPort = typeof address === "object" && address ? address.port : port;
      // A wildcard bind is not a destination; hooks and worker CLIs must dial something real.
      boundBaseUrl = `http://${toConnectableHost(host)}:${resolvedPort}`;
      return { host, port: resolvedPort };
    },
    async stop() {
      hubHealth.close();
      const projects = [...loaded.values()];
      loaded.clear();
      await Promise.allSettled(projects.map(({ context }) => context.stop()));
      if (!server.listening) {
        return;
      }
      await new Promise<void>((resolveStop, rejectStop) => {
        server.close((error) => {
          if (error) {
            rejectStop(error);
            return;
          }
          resolveStop();
        });
        server.closeAllConnections();
      });
    },
  };
};
