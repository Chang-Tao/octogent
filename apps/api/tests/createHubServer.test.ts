import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("node-pty", () => ({
  spawn: spawnMock,
}));

import { createHubServer } from "../src/createHubServer";
import {
  type ProjectRegistryEntry,
  loadProjectsRegistry,
  registerProject,
  saveProjectsRegistry,
} from "../src/projectPersistence";
import type { GitClient } from "../src/terminalRuntime";

class FakeGitClient implements GitClient {
  assertAvailable(): void {}

  isRepository(): boolean {
    return true;
  }

  addWorktree(): void {}

  removeWorktree(): void {}

  removeBranch(): void {}

  readWorktreeStatus(): ReturnType<GitClient["readWorktreeStatus"]> {
    return {
      branchName: "main",
      upstreamBranchName: null,
      isDirty: false,
      aheadCount: 0,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    };
  }

  commitAll(): void {}

  pushCurrentBranch(): void {}

  syncWithBase(): void {}

  readCurrentBranchPullRequest(): null {
    return null;
  }

  createPullRequest(): null {
    return null;
  }

  mergeCurrentBranchPullRequest(): void {}
}

const fakePty = () => ({
  pid: 4242,
  write: vi.fn(),
  kill: vi.fn(),
  resize: vi.fn(),
  onData: () => ({ dispose: vi.fn() }),
  onExit: () => ({ dispose: vi.fn() }),
});

type ProjectListing = {
  id: string;
  name: string;
  slug: string;
  path: string;
  loaded: boolean;
  summary?: { id: string; runningTerminals: number; ptySessions: number };
};

describe("createHubServer", () => {
  let stopHub: (() => Promise<void>) | null = null;
  const temporaryDirectories: string[] = [];

  beforeEach(() => {
    saveProjectsRegistry({ projects: [] });
    spawnMock.mockReset();
    spawnMock.mockImplementation(fakePty);
  });

  afterEach(async () => {
    if (stopHub) {
      await stopHub();
      stopHub = null;
    }
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  const makeDirectory = (prefix = "octogent-hub-test-") => {
    const directory = mkdtempSync(join(tmpdir(), prefix));
    temporaryDirectories.push(directory);
    return directory;
  };

  const registerWorkspace = (name: string): ProjectRegistryEntry =>
    registerProject(makeDirectory(), name);

  const startHub = async (options: Partial<Parameters<typeof createHubServer>[0]> = {}) => {
    const hub = createHubServer({ gitClient: new FakeGitClient(), accessToken: null, ...options });
    const { host, port } = await hub.start(0, "127.0.0.1");
    stopHub = () => hub.stop();
    return { hub, baseUrl: `http://${host}:${port}` };
  };

  const listProjects = async (baseUrl: string) => {
    const response = await fetch(`${baseUrl}/api/projects`);
    expect(response.status).toBe(200);
    return ((await response.json()) as { projects: ProjectListing[] }).projects;
  };

  const createTerminal = (baseUrl: string, key: string, body: Record<string, unknown> = {}) =>
    fetch(`${baseUrl}/api/p/${key}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceMode: "shared", ...body }),
    });

  it("lists every registered project without loading any", async () => {
    const alpha = registerWorkspace("Alpha Project");
    const beta = registerWorkspace("Beta");
    const { baseUrl } = await startHub();

    const projects = await listProjects(baseUrl);
    expect(projects).toEqual([
      {
        id: alpha.id,
        name: "Alpha Project",
        slug: "alpha-project",
        path: alpha.path,
        loaded: false,
      },
      { id: beta.id, name: "Beta", slug: "beta", path: beta.path, loaded: false },
    ]);

    const health = (await (await fetch(`${baseUrl}/api/hub/health`)).json()) as Record<
      string,
      unknown
    >;
    expect(health).toMatchObject({
      status: "ok",
      pid: process.pid,
      projects: { registered: 2, loaded: 0 },
      loadedProjects: [],
      ptySessions: 0,
    });
  });

  it("loads only the project a request names, by slug or by id", async () => {
    const alpha = registerWorkspace("Alpha Project");
    const beta = registerWorkspace("Beta");
    const { baseUrl } = await startHub();

    const health = await fetch(`${baseUrl}/api/p/alpha-project/api/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok", ptySessions: 0 });

    let projects = await listProjects(baseUrl);
    expect(projects.find((project) => project.id === alpha.id)).toMatchObject({
      loaded: true,
      summary: { id: alpha.id, runningTerminals: 0, ptySessions: 0 },
    });
    expect(projects.find((project) => project.id === beta.id)?.loaded).toBe(false);

    const snapshots = await fetch(`${baseUrl}/api/p/${beta.id}/api/terminal-snapshots`);
    expect(snapshots.status).toBe(200);
    expect(await snapshots.json()).toEqual([]);
    projects = await listProjects(baseUrl);
    expect(projects.every((project) => project.loaded)).toBe(true);
  });

  it("answers 404 JSON for an unknown project key", async () => {
    registerWorkspace("Alpha");
    const { baseUrl } = await startHub();

    for (const path of ["/api/p/nope/api/health", "/api/p/nope", "/api/p/%E0%A4%A/api/health"]) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status, path).toBe(404);
      expect(response.headers.get("content-type")).toBe("application/json");
    }
    // Unprefixed project routes do not exist on the hub.
    expect((await fetch(`${baseUrl}/api/terminal-snapshots`)).status).toBe(404);
  });

  it("does not load a project whose directory is gone", async () => {
    const alpha = registerWorkspace("Alpha");
    rmSync(alpha.path, { recursive: true, force: true });
    const { baseUrl } = await startHub();

    const response = await fetch(`${baseUrl}/api/p/alpha/api/health`);
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: string }).error).toContain(alpha.path);
    expect(existsSync(alpha.path)).toBe(false);
  });

  it("registers a workspace through POST /api/projects", async () => {
    registerWorkspace("Alpha");
    const { baseUrl } = await startHub();
    const workspace = makeDirectory();

    const post = (body: unknown) =>
      fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const created = await post({ path: workspace, name: "Gamma Ray" });
    expect(created.status).toBe(201);
    const entry = (await created.json()) as ProjectListing;
    expect(entry).toMatchObject({ name: "Gamma Ray", slug: "gamma-ray", path: workspace });
    expect(existsSync(join(workspace, ".octogent", "project.json"))).toBe(true);
    expect(existsSync(join(workspace, ".octogent", "tentacles"))).toBe(true);

    const projects = await listProjects(baseUrl);
    expect(projects.map((project) => project.slug)).toEqual(["alpha", "gamma-ray"]);

    const again = await post({ path: workspace });
    expect(again.status).toBe(200);
    expect(((await again.json()) as ProjectListing).id).toBe(entry.id);

    const file = join(workspace, "a-file");
    writeFileSync(file, "");
    for (const path of ["relative/dir", join(workspace, "missing"), file, 42, undefined]) {
      expect((await post({ path })).status, String(path)).toBe(400);
    }
    expect(loadProjectsRegistry().projects).toHaveLength(2);
  });

  it("delivers a hook to the addressed project's runtime only", async () => {
    const alpha = registerWorkspace("Alpha");
    registerWorkspace("Beta");
    const { baseUrl } = await startHub();
    // Terminal ids repeat per project, which is exactly why the prefix matters.
    expect((await createTerminal(baseUrl, alpha.id)).status).toBe(201);
    expect((await createTerminal(baseUrl, "beta")).status).toBe(201);

    const hook = await fetch(
      `${baseUrl}/api/p/${alpha.id}/api/hooks/user-prompt-submit?octogent_session=terminal-1`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Investigate flaky CI" }),
      },
    );
    expect(hook.status).toBe(200);

    const names = async (key: string) =>
      (
        (await (await fetch(`${baseUrl}/api/p/${key}/api/terminal-snapshots`)).json()) as Array<{
          terminalId: string;
          tentacleName: string;
        }>
      ).map((snapshot) => snapshot.tentacleName);
    expect(await names("alpha")).toEqual(["Investigate flaky CI"]);
    expect(await names("beta")).not.toContain("Investigate flaky CI");
  });

  it("points a project's agents at the project-scoped base", async () => {
    const alpha = registerWorkspace("Alpha");
    const { baseUrl } = await startHub();

    const created = await createTerminal(baseUrl, "alpha", { initialPrompt: "hello" });
    expect(created.status).toBe(201);

    const projectBase = `${baseUrl}/api/p/${alpha.id}`;
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const spawnOptions = spawnMock.mock.calls[0]?.[2] as { env: Record<string, string> };
    expect(spawnOptions.env.OCTOGENT_API_BASE).toBe(projectBase);
    expect(spawnOptions.env.OCTOGENT_PROJECT_ID).toBe(alpha.id);

    const settings = readFileSync(join(alpha.path, ".claude", "settings.json"), "utf8");
    expect(settings).toContain(`"${projectBase}/api/hooks/session-start?octogent_session=`);
    expect(settings).toContain(`"url": "${projectBase}/api/hooks/pre-tool-use"`);
  });

  it("rejects the terminal that would exceed the hub-wide session cap", async () => {
    registerWorkspace("Alpha");
    registerWorkspace("Beta");
    const { baseUrl } = await startHub({ maxTotalSessions: 2 });

    expect((await createTerminal(baseUrl, "alpha", { initialPrompt: "one" })).status).toBe(201);
    expect((await createTerminal(baseUrl, "beta", { initialPrompt: "two" })).status).toBe(201);

    const refused = await createTerminal(baseUrl, "alpha", { initialPrompt: "three" });
    expect(refused.status).toBe(429);
    expect(((await refused.json()) as { error: string }).error).toContain("(2)");
    expect(spawnMock).toHaveBeenCalledTimes(2);

    const health = (await (await fetch(`${baseUrl}/api/hub/health`)).json()) as Record<
      string,
      unknown
    >;
    expect(health).toMatchObject({ ptySessions: 2, maxTerminalSessions: 2 });
  });

  it("serves the web app at the root and under /p/<key>/ without loading the project", async () => {
    registerWorkspace("Alpha");
    const webDistDir = makeDirectory("octogent-hub-web-");
    writeFileSync(join(webDistDir, "index.html"), "<html>hub-index</html>");
    mkdirSync(join(webDistDir, "assets"));
    writeFileSync(join(webDistDir, "assets", "app.js"), "console.log(1)");
    const { baseUrl } = await startHub({ webDistDir });

    for (const path of ["/", "/p/alpha/", "/p/alpha", "/p/alpha/deck/some-route"]) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type"), path).toBe("text/html");
      expect(await response.text()).toBe("<html>hub-index</html>");
    }
    for (const path of ["/assets/app.js", "/p/alpha/assets/app.js"]) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.headers.get("content-type"), path).toBe("application/javascript");
    }
    expect((await listProjects(baseUrl))[0]?.loaded).toBe(false);
  });

  it("upgrades WebSockets through the project prefix and refuses unknown keys", async () => {
    const alpha = registerWorkspace("Alpha");
    const { baseUrl } = await startHub();

    const upgrade = (path: string, origin?: string) =>
      new Promise<boolean>((resolve) => {
        const url = new URL(baseUrl);
        const socket = createConnection({ host: url.hostname, port: Number(url.port) });
        let head = "";
        let settled = false;
        const finish = (opened: boolean) => {
          if (!settled) {
            settled = true;
            socket.destroy();
            resolve(opened);
          }
        };
        socket.on("connect", () => {
          socket.write(
            `GET ${path} HTTP/1.1\r\nHost: ${url.host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n${origin ? `Origin: ${origin}\r\n` : ""}\r\n`,
          );
        });
        socket.on("data", (chunk) => {
          head += chunk.toString("utf8");
          if (head.includes("101 Switching Protocols")) {
            finish(true);
          }
        });
        socket.on("error", () => finish(false));
        socket.on("close", () => finish(false));
        setTimeout(() => finish(false), 1_000);
      });

    expect(await upgrade(`/api/p/${alpha.id}/api/terminal-events/ws`)).toBe(true);
    expect(await upgrade("/api/p/nope/api/terminal-events/ws")).toBe(false);
    expect(await upgrade("/api/terminal-events/ws")).toBe(false);
    expect(
      await upgrade(`/api/p/${alpha.id}/api/terminal-events/ws`, "https://attacker.example"),
    ).toBe(false);
  });

  it("applies the origin check before dispatching to a project", async () => {
    registerWorkspace("Alpha");
    const { baseUrl } = await startHub();

    for (const path of ["/api/projects", "/api/p/alpha/api/health"]) {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { Origin: "https://attacker.example" },
      });
      expect(response.status, path).toBe(403);
    }
    expect((await listProjects(baseUrl))[0]?.loaded).toBe(false);
  });
});
