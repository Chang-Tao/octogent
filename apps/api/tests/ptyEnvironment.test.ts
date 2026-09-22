import { afterEach, describe, expect, it, vi } from "vitest";

import { createShellEnvironment } from "../src/terminalRuntime/ptyEnvironment";

const TOUCHED = ["CLAUDE_CODE_CHILD_SESSION", "CLAUDECODE"] as const;
const saved = new Map<string, string | undefined>();

afterEach(() => {
  for (const key of TOUCHED) {
    const value = saved.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  saved.clear();
});

const stub = (key: (typeof TOUCHED)[number], value: string) => {
  if (!saved.has(key)) {
    saved.set(key, process.env[key]);
  }
  process.env[key] = value;
};

describe("createShellEnvironment", () => {
  it("does not pass the parent's Claude session markers to agents", () => {
    // Octogent itself is often launched from inside a Claude Code session.
    // Inheriting these markers makes every agent believe it is a child
    // session — Claude then disables transcript saving, which breaks the
    // Stop-hook driven transcript pipeline completion detection relies on.
    stub("CLAUDE_CODE_CHILD_SESSION", "1");
    stub("CLAUDECODE", "1");

    const env = createShellEnvironment();

    expect(env.CLAUDE_CODE_CHILD_SESSION).toBeUndefined();
    expect(env.CLAUDECODE).toBeUndefined();
  });

  it("keeps unrelated variables and the terminal defaults", () => {
    const env = createShellEnvironment({ octogentSessionId: "terminal-9" });

    expect(env.TERM).toBe("xterm-256color");
    expect(env.OCTOGENT_SESSION_ID).toBe("terminal-9");
    expect(env.PATH).toBe(process.env.PATH);
  });

  it("tells the in-worker CLI which hub project and base it belongs to", () => {
    const env = createShellEnvironment({
      octogentSessionId: "terminal-1",
      apiBaseUrl: "http://127.0.0.1:8787/api/p/project-a",
      projectId: "project-a",
    });

    expect(env.OCTOGENT_API_BASE).toBe("http://127.0.0.1:8787/api/p/project-a");
    expect(env.OCTOGENT_PROJECT_ID).toBe("project-a");
  });

  it("does not pass an inherited OCTOGENT_PROJECT_ID to agents", () => {
    // A server launched from inside a hub worker must not hand that worker's
    // project to its own agents.
    vi.stubEnv("OCTOGENT_PROJECT_ID", "outer-project");

    const env = createShellEnvironment({ apiBaseUrl: "http://127.0.0.1:8787" });

    expect(env.OCTOGENT_PROJECT_ID).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
