import type { DeckTentacleSummary } from "@octogent/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { normalizeDeckTentacleSummary } from "../app/deckNormalizers";
import { type FlowCamera, type FlowNode, buildFlowLayout, project } from "../app/flow/layout";
import { useT } from "../app/providers/LocaleProvider";
import type { TerminalView } from "../app/types";
import { buildDeckTentaclesUrl } from "../runtime/runtimeEndpoints";
import { OctopusGlyph } from "./EmptyOctopus";

type FlowPrimaryViewProps = {
  columns: TerminalView;
  deckRevision?: number;
  onOpenTerminal?: (terminalId: string) => void;
};

const INITIAL_CAMERA: FlowCamera = { panX: 320, panY: 300, zoom: 1, perspective: 900 };
const ZOOM_MIN = 0.45;
const ZOOM_MAX = 2.2;

const agentDotClass = (node: FlowNode): string => {
  switch (node.agentState) {
    case "completed":
      return "flow-agent-dot--done";
    case "awaiting-review":
      return "flow-agent-dot--review";
    case "stalled":
    case "stale":
      return "flow-agent-dot--attention";
    case "stopped":
    case "exited":
      return "flow-agent-dot--inactive";
    default:
      return "flow-agent-dot--live";
  }
};

const NodeCard = ({
  node,
  onOpenTerminal,
}: {
  node: FlowNode;
  onOpenTerminal?: ((terminalId: string) => void) | undefined;
}) => {
  const t = useT();
  const summary = node.completionSummary;

  return (
    <div className="flow-card" role="status">
      <div className="flow-card-title-row">
        <span className="flow-card-title">{node.label}</span>
        {node.agentState && (
          <span className={`flow-card-state flow-card-state--${node.agentState}`}>
            {t(`agentState.${node.agentState}`)}
          </span>
        )}
      </div>
      {node.kind === "tentacle" && node.todoTotal !== undefined && (
        <div className="flow-card-progress">
          <div className="flow-card-progress-track">
            <div
              className="flow-card-progress-fill"
              style={{
                width: `${node.todoTotal > 0 ? Math.round(((node.todoDone ?? 0) / node.todoTotal) * 100) : 0}%`,
              }}
            />
          </div>
          <span className="flow-card-progress-text">
            {t("web.flow.todoProgress", {
              done: node.todoDone ?? 0,
              total: node.todoTotal,
            })}
          </span>
        </div>
      )}
      {summary && (
        <div className="flow-card-summary">
          {summary.taskLine && <p className="flow-card-task">{summary.taskLine}</p>}
          <p className="flow-card-facts">
            {summary.commits.length > 0 &&
              `${summary.commits.length} commits · +${summary.insertions}/-${summary.deletions}`}
            {summary.branch && (
              <>
                <br />
                {summary.branch}
                {summary.merged ? " ✓" : ""}
              </>
            )}
          </p>
        </div>
      )}
      {node.kind === "agent" && node.refId && onOpenTerminal && (
        <button
          type="button"
          className="flow-card-open"
          onClick={(event) => {
            event.stopPropagation();
            onOpenTerminal(node.refId as string);
          }}
        >
          {t("web.flow.openTerminal")}
        </button>
      )}
    </div>
  );
};

export const FlowPrimaryView = ({
  columns,
  deckRevision,
  onOpenTerminal,
}: FlowPrimaryViewProps) => {
  const t = useT();
  const [tentacles, setTentacles] = useState<DeckTentacleSummary[]>([]);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const response = await fetch(buildDeckTentaclesUrl(), {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;
        const payload = (await response.json()) as unknown;
        if (disposed || !Array.isArray(payload)) return;
        setTentacles(
          payload
            .map((entry) => normalizeDeckTentacleSummary(entry))
            .filter((entry): entry is DeckTentacleSummary => entry !== null),
        );
      } catch {
        // The view stays on its last good data.
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [deckRevision]);
  const [camera, setCamera] = useState<FlowCamera>(INITIAL_CAMERA);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null,
  );

  const layout = useMemo(
    () => buildFlowLayout({ tentacles, terminals: columns }),
    [tentacles, columns],
  );

  const projected = useMemo(() => {
    const map = new Map<string, { sx: number; sy: number; scale: number }>();
    for (const node of layout.nodes) {
      map.set(node.id, project(node, camera));
    }
    return map;
  }, [layout, camera]);

  // Nearer nodes render on top; the sort also keeps DOM order stable enough
  // for hover to feel consistent.
  const paintOrder = useMemo(() => [...layout.nodes].sort((a, b) => a.z - b.z), [layout]);

  const activeCardId = pinnedId ?? hoveredId;
  const activeNode = activeCardId
    ? (layout.nodes.find((n) => n.id === activeCardId) ?? null)
    : null;
  const activeProjection = activeNode ? projected.get(activeNode.id) : null;

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        panX: camera.panX,
        panY: camera.panY,
      };
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    },
    [camera.panX, camera.panY],
  );

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setCamera((current) => ({
      ...current,
      panX: drag.panX + (event.clientX - drag.startX),
      panY: drag.panY + (event.clientY - drag.startY),
    }));
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    setCamera((current) => {
      const nextZoom = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, current.zoom * (event.deltaY < 0 ? 1.1 : 0.9)),
      );
      return { ...current, zoom: nextZoom };
    });
  }, []);

  return (
    <section
      className="flow-view"
      aria-label={t("web.a11y.flowView")}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <svg className="flow-links" aria-hidden="true">
        {layout.edges.map((edge) => {
          const from = projected.get(edge.from);
          const to = projected.get(edge.to);
          if (!from || !to) return null;
          const midX = (from.sx + to.sx) / 2;
          return (
            <path
              key={`${edge.from}->${edge.to}`}
              className="flow-link"
              d={`M ${from.sx} ${from.sy} C ${midX} ${from.sy}, ${midX} ${to.sy}, ${to.sx} ${to.sy}`}
            />
          );
        })}
      </svg>

      {paintOrder.map((node) => {
        const p = projected.get(node.id);
        if (!p) return null;
        const style: React.CSSProperties = {
          transform: `translate(-50%, -50%) translate(${p.sx}px, ${p.sy}px) scale(${p.scale})`,
          zIndex: 10 + Math.round(p.scale * 100),
        };
        const isDimmed = node.agentState === "completed";
        return (
          <button
            key={node.id}
            type="button"
            className={`flow-node flow-node--${node.kind}${isDimmed ? " flow-node--dimmed" : ""}`}
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerEnter={() => setHoveredId(node.id)}
            onPointerLeave={() => setHoveredId((current) => (current === node.id ? null : current))}
            onClick={(event) => {
              event.stopPropagation();
              setPinnedId((current) => (current === node.id ? null : node.id));
            }}
          >
            {node.kind === "agent" ? (
              <span className={`flow-agent-dot ${agentDotClass(node)}`} />
            ) : (
              <OctopusGlyph
                color={node.color}
                animation={node.kind === "octoboss" ? "walk" : "idle"}
                expression="happy"
                accessory="none"
                scale={node.kind === "octoboss" ? 5 : 4}
              />
            )}
            <span className="flow-node-label">{node.label}</span>
          </button>
        );
      })}

      {activeNode && activeProjection && (
        <div
          className="flow-card-anchor"
          style={{
            transform: `translate(${activeProjection.sx + 26}px, ${activeProjection.sy - 12}px)`,
            zIndex: 400,
          }}
        >
          <NodeCard node={activeNode} onOpenTerminal={onOpenTerminal} />
        </div>
      )}

      <p className="flow-hint">{t("web.flow.hint")}</p>
    </section>
  );
};
