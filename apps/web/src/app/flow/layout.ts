import type {
  AgentRuntimeState,
  AgentState,
  DeckTentacleSummary,
  TentacleWorkspaceMode,
  TerminalCompletionSummary,
} from "@octogent/core";

import type { TerminalView } from "../types";

export type FlowNodeKind = "octoboss" | "tentacle" | "agent";

/** What the node is in the org chart, for the card's role line. */
export type FlowNodeRole = "octoboss" | "tentacle" | "coordinator" | "worker";

export type FlowNode = {
  id: string;
  kind: FlowNodeKind;
  /** tentacleId for tentacles, terminalId for agents. */
  refId?: string;
  label: string;
  color: string;
  level: number;
  x: number;
  y: number;
  z: number;
  role: FlowNodeRole;
  agentState?: AgentState;
  workspaceMode?: TentacleWorkspaceMode;
  todoTotal?: number;
  todoDone?: number;
  description?: string;
  todoItems?: Array<{ text: string; done: boolean }>;
  childCount?: number;
  runtimeState?: AgentRuntimeState;
  runtimeToolName?: string;
  completionSummary?: TerminalCompletionSummary;
};

export type FlowEdge = { from: string; to: string };

export type FlowLayout = { nodes: FlowNode[]; edges: FlowEdge[]; maxLevel: number };

export type FlowCamera = { panX: number; panY: number; zoom: number; perspective: number };

export const OCTOBOSS_FLOW_ID = "flow:octoboss";

// One depth plane per hierarchy level, marching left→right and away from the
// viewer; agents lean back toward the viewer so they sit "in front of" their
// octopus, which is what gives the scene its depth.
const LEVEL_SPACING_X = 240;
const LEVEL_DEPTH_Z = -180;
const AGENT_FORWARD_Z = 70;
const AGENT_FORWARD_X = 96;
const SIBLING_SPACING_Y = 120;
const AGENT_FAN_SPACING_Y = 78;

const OCTOBOSS_COLOR = "#d4a017";
const FALLBACK_AGENT_COLOR = "#9ca3af";

const centeredOffset = (index: number, count: number, spacing: number): number =>
  (index - (count - 1) / 2) * spacing;

type FlowLayoutInput = {
  tentacles: DeckTentacleSummary[];
  terminals: TerminalView;
  agentRuntimeStates?: ReadonlyMap<string, { state: AgentRuntimeState; toolName?: string }>;
};

/**
 * Positions the fleet in a depth-staged space: octoboss → tentacles → their
 * agents → child agents (swarm workers), each parent-child chain one level
 * further right and deeper. Pure and deterministic so the view layer only
 * projects and draws.
 */
export const buildFlowLayout = ({
  tentacles,
  terminals,
  agentRuntimeStates,
}: FlowLayoutInput): FlowLayout => {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  const boss: FlowNode = {
    id: OCTOBOSS_FLOW_ID,
    kind: "octoboss",
    label: "OCTOBOSS",
    color: OCTOBOSS_COLOR,
    role: "octoboss",
    level: 0,
    x: 0,
    y: 0,
    z: 0,
  };
  nodes.push(boss);

  const tentacleNodes = new Map<string, FlowNode>();
  const sortedTentacles = [...tentacles].sort((a, b) => a.tentacleId.localeCompare(b.tentacleId));
  sortedTentacles.forEach((entry, index) => {
    const node: FlowNode = {
      id: `flow:tentacle:${entry.tentacleId}`,
      kind: "tentacle",
      refId: entry.tentacleId,
      label: entry.displayName || entry.tentacleId,
      color: entry.color ?? OCTOBOSS_COLOR,
      level: 1,
      x: LEVEL_SPACING_X,
      y: centeredOffset(index, sortedTentacles.length, SIBLING_SPACING_Y),
      z: LEVEL_DEPTH_Z,
      role: "tentacle",
      todoTotal: entry.todoTotal,
      todoDone: entry.todoDone,
      ...(entry.description ? { description: entry.description } : {}),
      ...(entry.todoItems?.length ? { todoItems: entry.todoItems } : {}),
    };
    tentacleNodes.set(entry.tentacleId, node);
    nodes.push(node);
    edges.push({ from: boss.id, to: node.id });
  });

  // Resolve each terminal's chain depth via parentTerminalId; an unknown parent
  // falls back to the tentacle so the agent never silently disappears.
  const byTerminalId = new Map(terminals.map((t) => [t.terminalId, t]));
  const depthCache = new Map<string, number>();
  const chainDepth = (terminalId: string, hops = 0): number => {
    if (hops > 8) {
      return 0; // cycle guard: treat as a direct child of the tentacle
    }
    const cached = depthCache.get(terminalId);
    if (cached !== undefined) {
      return cached;
    }
    const record = byTerminalId.get(terminalId);
    const parentId = record?.parentTerminalId;
    const depth = parentId && byTerminalId.has(parentId) ? chainDepth(parentId, hops + 1) + 1 : 0;
    depthCache.set(terminalId, depth);
    return depth;
  };

  // Group agents by (anchor, depth) so siblings fan out together. The anchor is
  // the parent agent when it exists, otherwise the tentacle.
  const groups = new Map<string, TerminalView>();
  for (const record of terminals) {
    const parentId = record.parentTerminalId;
    const anchorId =
      parentId && byTerminalId.has(parentId)
        ? `flow:agent:${parentId}`
        : (tentacleNodes.get(record.tentacleId)?.id ?? boss.id);
    const bucket = groups.get(anchorId) ?? [];
    bucket.push(record);
    groups.set(anchorId, bucket);
  }

  // Materialize in chain-depth order so every anchor node exists before its
  // children are placed relative to it.
  const childCounts = new Map<string, number>();
  for (const record of terminals) {
    const parentId = record.parentTerminalId;
    if (parentId && byTerminalId.has(parentId)) {
      childCounts.set(parentId, (childCounts.get(parentId) ?? 0) + 1);
    }
  }

  const pending = [...terminals].sort(
    (a, b) => chainDepth(a.terminalId) - chainDepth(b.terminalId),
  );
  const agentNodes = new Map<string, FlowNode>();
  for (const record of pending) {
    const depth = chainDepth(record.terminalId);
    const parentId = record.parentTerminalId;
    const anchor =
      (parentId ? agentNodes.get(`flow:agent:${parentId}`) : undefined) ??
      tentacleNodes.get(record.tentacleId) ??
      boss;
    const siblings = groups.get(anchor.id)?.filter((t) => chainDepth(t.terminalId) === depth) ?? [];
    const index = siblings.findIndex((t) => t.terminalId === record.terminalId);
    const node: FlowNode = {
      id: `flow:agent:${record.terminalId}`,
      kind: "agent",
      refId: record.terminalId,
      label: record.tentacleName || record.terminalId,
      color: tentacleNodes.get(record.tentacleId)?.color ?? FALLBACK_AGENT_COLOR,
      level: anchor.level + 1,
      x: anchor.x + AGENT_FORWARD_X + LEVEL_SPACING_X * Math.max(0, depth),
      y:
        anchor.y +
        centeredOffset(Math.max(0, index), Math.max(1, siblings.length), AGENT_FAN_SPACING_Y),
      // In front of its anchor: one step back toward the viewer.
      z: anchor.z + AGENT_FORWARD_Z,
      role: (childCounts.get(record.terminalId) ?? 0) > 0 ? "coordinator" : "worker",
      agentState: record.state,
      childCount: childCounts.get(record.terminalId) ?? 0,
      ...(record.workspaceMode ? { workspaceMode: record.workspaceMode } : {}),
      ...(record.completionSummary ? { completionSummary: record.completionSummary } : {}),
      ...(() => {
        const info = agentRuntimeStates?.get(record.terminalId);
        if (!info) {
          return {};
        }
        return {
          runtimeState: info.state,
          ...(info.toolName ? { runtimeToolName: info.toolName } : {}),
        };
      })(),
    };
    agentNodes.set(node.id, node);
    nodes.push(node);
    edges.push({ from: anchor.id, to: node.id });
  }

  const maxLevel = nodes.reduce((max, n) => Math.max(max, n.level), 0);
  return { nodes, edges, maxLevel };
};

/**
 * Screen projection for the pseudo-3D flow scene. Nodes and SVG links share
 * this one function, so they can never drift apart the way mixed CSS
 * perspective and SVG coordinates do. Depth (negative z) shrinks a point and
 * pulls it toward the vanishing point; pan is applied post-projection so a
 * drag moves the whole scene rigidly.
 */
export const project = (
  point: { x: number; y: number; z: number },
  camera: FlowCamera,
): { sx: number; sy: number; scale: number } => {
  const depth = Math.max(-point.z, 0);
  const scale = camera.perspective / (camera.perspective + depth);
  return {
    sx: point.x * scale * camera.zoom + camera.panX,
    sy: point.y * scale * camera.zoom + camera.panY,
    scale: scale * camera.zoom,
  };
};

// Breathing room around the fitted scene: glyphs and labels render around each
// node's anchor point, and the hover card opens to the side.
const FIT_MARGIN_PX = 90;
const FIT_ZOOM_MIN = 0.45;
const FIT_ZOOM_MAX = 1;
const DEFAULT_PERSPECTIVE = 900;

/**
 * Camera that centers the whole scene in the viewport, zooming out (never in)
 * when the fleet outgrows it. A fixed default camera clips nodes as soon as a
 * fleet fans wider than the hardcoded pan allowed for.
 */
export const computeFitCamera = (
  nodes: ReadonlyArray<Pick<FlowNode, "x" | "y" | "z">>,
  viewport: { width: number; height: number },
  perspective: number = DEFAULT_PERSPECTIVE,
): FlowCamera => {
  if (nodes.length === 0 || viewport.width <= 0 || viewport.height <= 0) {
    return {
      panX: Math.max(0, viewport.width / 2),
      panY: Math.max(0, viewport.height / 2),
      zoom: 1,
      perspective,
    };
  }

  const base: FlowCamera = { panX: 0, panY: 0, zoom: 1, perspective };
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    const { sx, sy } = project(node, base);
    minX = Math.min(minX, sx);
    maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy);
    maxY = Math.max(maxY, sy);
  }

  const sceneWidth = maxX - minX;
  const sceneHeight = maxY - minY;
  const availableWidth = Math.max(1, viewport.width - FIT_MARGIN_PX * 2);
  const availableHeight = Math.max(1, viewport.height - FIT_MARGIN_PX * 2);
  const zoomToFit = Math.min(
    FIT_ZOOM_MAX,
    sceneWidth > 0 ? availableWidth / sceneWidth : FIT_ZOOM_MAX,
    sceneHeight > 0 ? availableHeight / sceneHeight : FIT_ZOOM_MAX,
  );
  const zoom = Math.max(FIT_ZOOM_MIN, zoomToFit);

  return {
    panX: viewport.width / 2 - ((minX + maxX) / 2) * zoom,
    panY: viewport.height / 2 - ((minY + maxY) / 2) * zoom,
    zoom,
    perspective,
  };
};
