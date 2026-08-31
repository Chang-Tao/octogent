import { describe, expect, it } from "vitest";

import { buildFlowLayout, project } from "../src/app/flow/layout";
import type { FlowCamera } from "../src/app/flow/layout";

type AnyTentacle = Parameters<typeof buildFlowLayout>[0]["tentacles"][number];
type AnyTerminal = Parameters<typeof buildFlowLayout>[0]["terminals"][number];

const tentacle = (id: string): AnyTentacle =>
  ({
    tentacleId: id,
    displayName: id,
    description: "",
    status: "idle",
    color: "#00c8ff",
    todoTotal: 3,
    todoDone: 1,
  }) as AnyTentacle;

const terminal = (id: string, tentacleId: string, parentTerminalId?: string): AnyTerminal =>
  ({
    terminalId: id,
    label: id,
    state: "live",
    tentacleId,
    tentacleName: id,
    workspaceMode: "worktree",
    createdAt: "2026-08-31T00:00:00.000Z",
    ...(parentTerminalId ? { parentTerminalId } : {}),
  }) as AnyTerminal;

describe("buildFlowLayout", () => {
  it("always roots the layout at the octoboss on level 0", () => {
    const { nodes } = buildFlowLayout({ tentacles: [], terminals: [] });

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ kind: "octoboss", level: 0 });
  });

  it("spreads tentacles on level 1, connected to the octoboss", () => {
    const { nodes, edges } = buildFlowLayout({
      tentacles: [tentacle("api"), tentacle("web")],
      terminals: [],
    });

    const tentacleNodes = nodes.filter((n) => n.kind === "tentacle");
    expect(tentacleNodes).toHaveLength(2);
    for (const n of tentacleNodes) {
      expect(n.level).toBe(1);
      expect(edges).toContainEqual({ from: nodes[0]?.id, to: n.id });
    }
    // Same level, distinct vertical slots.
    expect(new Set(tentacleNodes.map((n) => n.y)).size).toBe(2);
  });

  it("fans agents out in front of their tentacle, one level deeper", () => {
    const { nodes, edges } = buildFlowLayout({
      tentacles: [tentacle("api")],
      terminals: [terminal("t-1", "api"), terminal("t-2", "api")],
    });

    const host = nodes.find((n) => n.kind === "tentacle");
    const agents = nodes.filter((n) => n.kind === "agent");
    expect(agents).toHaveLength(2);
    for (const agent of agents) {
      expect(agent.level).toBe(2);
      // In front of the octopus: strictly closer to the viewer than its host.
      expect(agent.z).toBeGreaterThan(host?.z ?? 0);
      expect(edges).toContainEqual({ from: host?.id, to: agent.id });
    }
  });

  it("chains swarm workers one level behind their parent agent", () => {
    const { nodes, edges } = buildFlowLayout({
      tentacles: [tentacle("mini")],
      terminals: [
        terminal("mini-swarm-parent", "mini"),
        terminal("mini-swarm-0", "mini", "mini-swarm-parent"),
        terminal("mini-swarm-1", "mini", "mini-swarm-parent"),
      ],
    });

    const parent = nodes.find((n) => n.refId === "mini-swarm-parent");
    const workers = nodes.filter((n) => n.refId?.startsWith("mini-swarm-") && n !== parent);
    expect(parent?.level).toBe(2);
    for (const worker of workers) {
      expect(worker.level).toBe(3);
      expect(edges).toContainEqual({ from: parent?.id, to: worker.id });
    }
  });

  it("attaches an orphaned child to its tentacle instead of dropping it", () => {
    const { nodes, edges } = buildFlowLayout({
      tentacles: [tentacle("api")],
      terminals: [terminal("lost", "api", "gone-parent")],
    });

    const orphan = nodes.find((n) => n.refId === "lost");
    const host = nodes.find((n) => n.kind === "tentacle");
    expect(orphan?.level).toBe(2);
    expect(edges).toContainEqual({ from: host?.id, to: orphan?.id });
  });

  it("keeps levels advancing left to right", () => {
    const { nodes } = buildFlowLayout({
      tentacles: [tentacle("mini")],
      terminals: [terminal("p", "mini"), terminal("w", "mini", "p")],
    });

    const byLevel = new Map<number, number>();
    for (const n of nodes) {
      byLevel.set(n.level, n.x);
    }
    expect(byLevel.get(1)).toBeGreaterThan(byLevel.get(0) ?? 0);
    expect(byLevel.get(2)).toBeGreaterThan(byLevel.get(1) ?? 0);
    expect(byLevel.get(3)).toBeGreaterThan(byLevel.get(2) ?? 0);
  });
});

describe("project", () => {
  const camera: FlowCamera = { panX: 0, panY: 0, zoom: 1, perspective: 900 };

  it("is identity-ish at the viewer plane", () => {
    const p = project({ x: 100, y: 50, z: 0 }, camera);
    expect(p.sx).toBeCloseTo(100);
    expect(p.sy).toBeCloseTo(50);
    expect(p.scale).toBeCloseTo(1);
  });

  it("shrinks and converges points that sit deeper", () => {
    const near = project({ x: 200, y: 0, z: 0 }, camera);
    const far = project({ x: 200, y: 0, z: -600 }, camera);
    expect(far.scale).toBeLessThan(near.scale);
    // Deeper content drifts toward the vanishing point, not off-screen.
    expect(Math.abs(far.sx)).toBeLessThan(Math.abs(near.sx) + 1);
  });

  it("applies pan after projection so dragging moves the whole scene", () => {
    const base = project({ x: 10, y: 10, z: -300 }, camera);
    const panned = project({ x: 10, y: 10, z: -300 }, { ...camera, panX: 40, panY: -25 });
    expect(panned.sx - base.sx).toBeCloseTo(40);
    expect(panned.sy - base.sy).toBeCloseTo(-25);
    expect(panned.scale).toBeCloseTo(base.scale);
  });

  it("scales around the origin with zoom", () => {
    const z1 = project({ x: 100, y: 100, z: 0 }, camera);
    const z2 = project({ x: 100, y: 100, z: 0 }, { ...camera, zoom: 2 });
    expect(z2.sx).toBeCloseTo(z1.sx * 2);
    expect(z2.sy).toBeCloseTo(z1.sy * 2);
  });
});
