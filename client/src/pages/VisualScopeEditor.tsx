import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  MousePointer,
  Pentagon,
  Minus,
  TreePine,
  Flower,
  Circle,
  Type,
  Trash2,
  Check,
  Loader2,
  Info,
  Undo2,
  Redo2,
  Lock,
  Copy,
  X,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { MarkupObject, MarkupPoint, SymbolType, MarkupDocument } from "@shared/schema";
import { parseMarkupData } from "@shared/schema";

type ActiveTool = "select" | "polygon" | "polyline" | "tree" | "plant" | "boulder" | "text";
type DashStyle = "solid" | "dashed" | "dotted";

interface VisualScopeEditorProps {
  sheetId: string;
  baseImagePath: string;
  initialMarkupData: unknown;
  onSaved?: () => void;
}

const MAX_UNDO_STEPS = 20;
const VERTEX_HIT_RADIUS = 0.018;
const MIDPOINT_HIT_RADIUS = 0.013;
const SHAPE_HIT_RADIUS = 0.022;
const CLOSE_POLYGON_RADIUS = 0.025;

const DEFAULT_SYMBOL_COLORS: Record<SymbolType, string> = {
  tree: "#2d6a2d",
  plant: "#22c55e",
  boulder: "#9ca3af",
};

const DEFAULT_LAYER_ID = "annotations";

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): MarkupPoint {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const t = pt.matrixTransform(svg.getScreenCTM()!.inverse());
  return [clamp(t.x), clamp(t.y)];
}

function toSvgPoints(pts: MarkupPoint[]): string {
  return pts.map(([x, y]) => `${x},${y}`).join(" ");
}

function distance(a: MarkupPoint, b: MarkupPoint): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function midpoint(a: MarkupPoint, b: MarkupPoint): MarkupPoint {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function pointToSegmentDistance(p: MarkupPoint, a: MarkupPoint, b: MarkupPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
}

function rotatePoint(p: MarkupPoint, center: MarkupPoint, degrees: number): MarkupPoint {
  if (!degrees) return p;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p[0] - center[0];
  const dy = p[1] - center[1];
  return [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos];
}

interface BBox {
  x1: number; y1: number; x2: number; y2: number;
  cx: number; cy: number; w: number; h: number;
}

function getBbox(obj: MarkupObject): BBox {
  if (obj.points.length === 0) return { x1: 0, y1: 0, x2: 0, y2: 0, cx: 0, cy: 0, w: 0, h: 0 };
  if (obj.type === "symbol" || obj.type === "text") {
    const [x, y] = obj.points[0];
    const r = obj.type === "symbol" ? 0.04 : 0.07;
    return { x1: x - r, y1: y - r, x2: x + r, y2: y + r, cx: x, cy: y, w: r * 2, h: r * 2 };
  }
  const xs = obj.points.map(p => p[0]);
  const ys = obj.points.map(p => p[1]);
  const x1 = Math.min(...xs), x2 = Math.max(...xs);
  const y1 = Math.min(...ys), y2 = Math.max(...ys);
  return { x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, w: x2 - x1, h: y2 - y1 };
}

function hitTestObj(obj: MarkupObject, pt: MarkupPoint): boolean {
  const rotation = obj.rotation ?? 0;
  const bb = getBbox(obj);
  const testPt: MarkupPoint = rotation ? rotatePoint(pt, [bb.cx, bb.cy], -rotation) : pt;

  if (obj.type === "symbol" || obj.type === "text") {
    return distance(testPt, obj.points[0]) < 0.05;
  }
  if (obj.points.length < 2) return false;
  for (let i = 0; i < obj.points.length - 1; i++) {
    if (pointToSegmentDistance(testPt, obj.points[i], obj.points[i + 1]) < SHAPE_HIT_RADIUS) return true;
  }
  if ((obj.type === "polygon" || obj.closed) && obj.points.length > 2) {
    if (pointToSegmentDistance(testPt, obj.points[obj.points.length - 1], obj.points[0]) < SHAPE_HIT_RADIUS) return true;
    if (pointInPolygon(testPt, obj.points)) return true;
  }
  return false;
}

function pointInPolygon(pt: MarkupPoint, poly: MarkupPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function nanoid8(): string {
  return Math.random().toString(36).slice(2, 10);
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function dashArray(style: DashStyle | undefined, sw: number): string | undefined {
  const s = sw / 1000;
  if (style === "dashed") return `${s * 5},${s * 3}`;
  if (style === "dotted") return `${s},${s * 2}`;
  return undefined;
}

function SymbolSvg({ type, color, size = 16 }: { type: SymbolType; color?: string; size?: number }) {
  const fill = color || DEFAULT_SYMBOL_COLORS[type];
  if (type === "tree") {
    return (
      <svg width={size} height={size} viewBox="-1 -1 2 2">
        <polygon points="0,-0.9 0.85,0.7 -0.85,0.7" fill={fill} />
      </svg>
    );
  }
  if (type === "plant") {
    return (
      <svg width={size} height={size} viewBox="-1 -1 2 2">
        <circle cx="0" cy="0" r="0.85" fill={fill} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="-1 -1 2 2">
      <ellipse cx="0" cy="0" rx="0.9" ry="0.6" fill={fill} />
    </svg>
  );
}

interface TextEditOverlayProps {
  obj: MarkupObject;
  svgRef: React.RefObject<SVGSVGElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

function TextEditOverlay({ obj, svgRef, containerRef, value, onChange, onCommit, onCancel }: TextEditOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  if (!svgRef.current || !containerRef.current) return null;

  const svg = svgRef.current;
  const container = containerRef.current;
  const pt = svg.createSVGPoint();
  pt.x = obj.points[0][0];
  pt.y = obj.points[0][1];
  const screen = pt.matrixTransform(svg.getScreenCTM()!);
  const rect = container.getBoundingClientRect();
  const left = screen.x - rect.left;
  const top = screen.y - rect.top;

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === "Enter") onCommit();
        if (e.key === "Escape") onCancel();
        e.stopPropagation();
      }}
      onBlur={onCommit}
      style={{
        position: "absolute",
        left,
        top,
        transform: "translate(-50%, -50%)",
        fontSize: "13px",
        border: "1.5px solid #f59e0b",
        borderRadius: "4px",
        padding: "2px 8px",
        background: "white",
        zIndex: 20,
        minWidth: "80px",
        outline: "none",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}
      data-testid="input-text-label"
    />
  );
}

interface MarkupShapeProps {
  obj: MarkupObject;
  selected: boolean;
  selectedVertexIdx: number | null;
  hoveredMidEdge: number | null;
  onVertexPointerDown: (idx: number, e: React.PointerEvent) => void;
  onMidpointClick: (edgeIdx: number, e: React.PointerEvent) => void;
  onVertexClick: (idx: number) => void;
}

function MarkupShape({
  obj,
  selected,
  selectedVertexIdx,
  hoveredMidEdge,
  onVertexPointerDown,
  onMidpointClick,
  onVertexClick,
}: MarkupShapeProps) {
  const sw = obj.strokeWidth / 1000;
  const bb = getBbox(obj);
  const rotation = obj.rotation ?? 0;
  const rotTransform = rotation ? `rotate(${rotation} ${bb.cx} ${bb.cy})` : undefined;
  const selRing = "#f59e0b";
  const opacity = obj.opacity ?? 1;
  const da = dashArray(obj.dashStyle, obj.strokeWidth);

  if (obj.type === "polygon") {
    const edges: React.ReactNode[] = [];
    if (selected) {
      const n = obj.points.length;
      for (let i = 0; i < n; i++) {
        const a = obj.points[i];
        const b = obj.points[(i + 1) % n];
        const mp = midpoint(a, b);
        const isHovered = hoveredMidEdge === i;
        edges.push(
          <circle
            key={`mid-${i}`}
            cx={mp[0]}
            cy={mp[1]}
            r={isHovered ? MIDPOINT_HIT_RADIUS : MIDPOINT_HIT_RADIUS * 0.7}
            fill={isHovered ? "#3b82f6" : "rgba(59,130,246,0.5)"}
            style={{ cursor: "pointer" }}
            onPointerDown={e => { e.stopPropagation(); onMidpointClick(i, e); }}
            data-testid={`handle-midpoint-${obj.id}-${i}`}
          />
        );
      }
    }

    return (
      <g transform={rotTransform} opacity={opacity}>
        <polygon
          points={toSvgPoints(obj.points)}
          stroke={obj.strokeColor}
          fill={obj.fillColor}
          strokeWidth={sw}
          strokeLinejoin="round"
          strokeDasharray={da}
        />
        {selected && edges}
        {selected && obj.points.map((p, i) => (
          <circle
            key={`v-${i}`}
            cx={p[0]}
            cy={p[1]}
            r={VERTEX_HIT_RADIUS}
            fill={selectedVertexIdx === i ? "#ef4444" : selRing}
            stroke="white"
            strokeWidth={0.002}
            style={{ cursor: "grab" }}
            onPointerDown={e => { e.stopPropagation(); onVertexPointerDown(i, e); }}
            onClick={e => { e.stopPropagation(); onVertexClick(i); }}
            data-testid={`handle-vertex-${obj.id}-${i}`}
          />
        ))}
      </g>
    );
  }

  if (obj.type === "polyline") {
    const n = obj.points.length;
    const edges: React.ReactNode[] = [];
    if (selected) {
      for (let i = 0; i < n - 1; i++) {
        const a = obj.points[i];
        const b = obj.points[i + 1];
        const mp = midpoint(a, b);
        const isHovered = hoveredMidEdge === i;
        edges.push(
          <circle
            key={`mid-${i}`}
            cx={mp[0]}
            cy={mp[1]}
            r={isHovered ? MIDPOINT_HIT_RADIUS : MIDPOINT_HIT_RADIUS * 0.7}
            fill={isHovered ? "#3b82f6" : "rgba(59,130,246,0.5)"}
            style={{ cursor: "pointer" }}
            onPointerDown={e => { e.stopPropagation(); onMidpointClick(i, e); }}
            data-testid={`handle-midpoint-${obj.id}-${i}`}
          />
        );
      }
    }

    return (
      <g transform={rotTransform} opacity={opacity}>
        <polyline
          points={toSvgPoints(obj.points)}
          stroke={obj.strokeColor}
          fill="none"
          strokeWidth={sw}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={da}
        />
        {/* Wider invisible hit area for selection */}
        <polyline
          points={toSvgPoints(obj.points)}
          stroke="transparent"
          fill="none"
          strokeWidth={sw + 0.015}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {selected && edges}
        {selected && obj.points.map((p, i) => (
          <circle
            key={`v-${i}`}
            cx={p[0]}
            cy={p[1]}
            r={VERTEX_HIT_RADIUS}
            fill={selectedVertexIdx === i ? "#ef4444" : selRing}
            stroke="white"
            strokeWidth={0.002}
            style={{ cursor: "grab" }}
            onPointerDown={e => { e.stopPropagation(); onVertexPointerDown(i, e); }}
            onClick={e => { e.stopPropagation(); onVertexClick(i); }}
            data-testid={`handle-vertex-${obj.id}-${i}`}
          />
        ))}
      </g>
    );
  }

  if (obj.type === "symbol") {
    const [x, y] = obj.points[0];
    const scale = 0.03;
    const color = obj.strokeColor;
    let inner: React.ReactNode = null;
    if (obj.symbolType === "tree") {
      inner = <polygon points="0,-0.5 0.5,0.5 -0.5,0.5" fill={color} />;
    } else if (obj.symbolType === "plant") {
      inner = <circle cx="0" cy="0" r="0.45" fill={color} />;
    } else {
      inner = <ellipse cx="0" cy="0" rx="0.5" ry="0.35" fill={color} />;
    }
    return (
      <g transform={rotTransform} opacity={opacity}>
        <g transform={`translate(${x} ${y}) scale(${scale})`}>{inner}</g>
        {selected && (
          <circle cx={x} cy={y} r={0.045} fill="none" stroke="#f59e0b" strokeWidth={0.003} />
        )}
      </g>
    );
  }

  if (obj.type === "text") {
    const [x, y] = obj.points[0];
    return (
      <g transform={rotTransform} opacity={opacity}>
        <text
          x={x}
          y={y}
          fontSize={0.025}
          fill={obj.strokeColor}
          dominantBaseline="middle"
          textAnchor="middle"
          style={{ userSelect: "none" }}
        >
          {obj.label || "Label"}
        </text>
        {selected && (
          <rect
            x={x - 0.08}
            y={y - 0.025}
            width={0.16}
            height={0.05}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={0.003}
            rx={0.005}
          />
        )}
      </g>
    );
  }

  return null;
}

interface InProgressShapeProps {
  points: MarkupPoint[];
  preview: MarkupPoint | null;
  tool: ActiveTool;
  color: string;
}

function InProgressShape({ points, preview, tool, color }: InProgressShapeProps) {
  const all = preview ? [...points, preview] : points;
  if (all.length < 1) return null;

  return (
    <g>
      {all.length >= 2 && (
        <polyline
          points={toSvgPoints(all)}
          stroke={color}
          strokeWidth={0.002}
          strokeDasharray="0.005,0.003"
          fill="none"
          strokeLinecap="round"
        />
      )}
      {tool === "polygon" && points.length >= 3 && preview && (
        <line
          x1={preview[0]}
          y1={preview[1]}
          x2={points[0][0]}
          y2={points[0][1]}
          stroke={color}
          strokeWidth={0.002}
          strokeDasharray="0.005,0.003"
        />
      )}
      {points.length > 0 && (
        <circle
          cx={points[0][0]}
          cy={points[0][1]}
          r={0.012}
          fill="none"
          stroke={color}
          strokeWidth={0.002}
        />
      )}
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={0.006} fill={color} />
      ))}
    </g>
  );
}

type DragOp =
  | { kind: "move"; id: string; origPoints: MarkupPoint[]; startPt: MarkupPoint }
  | { kind: "vertex"; id: string; vertexIdx: number; startPt: MarkupPoint; origPt: MarkupPoint }
  | { kind: "rotate"; id: string; center: MarkupPoint; startAngle: number; origRotation: number };

interface SelectionHandlesProps {
  obj: MarkupObject;
  onStartVertexDrag: (idx: number, startPt: MarkupPoint) => void;
  onStartRotate: (startPt: MarkupPoint) => void;
}

function getSvgPoint(e: React.PointerEvent<SVGCircleElement>): MarkupPoint {
  const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
  const svgPt = svg.createSVGPoint();
  svgPt.x = e.clientX;
  svgPt.y = e.clientY;
  const t = svgPt.matrixTransform(svg.getScreenCTM()!.inverse());
  return [clamp(t.x), clamp(t.y)];
}

function SelectionHandles({ obj, onStartVertexDrag, onStartRotate }: SelectionHandlesProps) {
  const bb = getBbox(obj);
  const rotation = obj.rotation ?? 0;
  const pad = 0.015;
  const selRing = "#f59e0b";
  const selSw = 0.002;
  const handleR = 0.012;
  const rotHandleOffset = 0.06;

  const rotateHandlePosLocal: MarkupPoint = [bb.cx, bb.y1 - pad - rotHandleOffset];
  const rotateHandlePos: MarkupPoint = rotation
    ? rotatePoint(rotateHandlePosLocal, [bb.cx, bb.cy], rotation)
    : rotateHandlePosLocal;

  const lineStart: MarkupPoint = rotation
    ? rotatePoint([bb.cx, bb.y1 - pad], [bb.cx, bb.cy], rotation)
    : [bb.cx, bb.y1 - pad];

  const corners: MarkupPoint[] = [
    [bb.x1 - pad, bb.y1 - pad],
    [bb.x2 + pad, bb.y1 - pad],
    [bb.x2 + pad, bb.y2 + pad],
    [bb.x1 - pad, bb.y2 + pad],
  ];
  const rotatedCorners = rotation ? corners.map(c => rotatePoint(c, [bb.cx, bb.cy], rotation)) : corners;

  return (
    <g style={{ pointerEvents: "none" }}>
      {/* Bounding box outline */}
      <polygon
        points={rotatedCorners.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke={selRing}
        strokeWidth={selSw}
        strokeDasharray="0.006,0.003"
        style={{ pointerEvents: "none" }}
      />

      {/* Vertex handles for polygon/polyline (shown in rotated space) */}
      {(obj.type === "polygon" || obj.type === "polyline") && obj.points.map((p, i) => {
        const rp: MarkupPoint = rotation ? rotatePoint(p, [bb.cx, bb.cy], rotation) : p;
        return (
          <circle
            key={i}
            cx={rp[0]}
            cy={rp[1]}
            r={handleR}
            fill="white"
            stroke={selRing}
            strokeWidth={selSw}
            style={{ cursor: "grab", pointerEvents: "all" }}
            onPointerDown={e => {
              e.stopPropagation();
              e.preventDefault();
              onStartVertexDrag(i, getSvgPoint(e));
            }}
          />
        );
      })}

      {/* Rotate handle stem line */}
      <line
        x1={lineStart[0]}
        y1={lineStart[1]}
        x2={rotateHandlePos[0]}
        y2={rotateHandlePos[1]}
        stroke={selRing}
        strokeWidth={selSw}
        style={{ pointerEvents: "none" }}
      />

      {/* Rotate handle circle */}
      <circle
        cx={rotateHandlePos[0]}
        cy={rotateHandlePos[1]}
        r={handleR}
        fill="white"
        stroke={selRing}
        strokeWidth={selSw}
        style={{ cursor: "crosshair", pointerEvents: "all" }}
        onPointerDown={e => {
          e.stopPropagation();
          e.preventDefault();
          onStartRotate(getSvgPoint(e));
        }}
      />

      {/* Rotate cue glyph */}
      <text
        x={rotateHandlePos[0]}
        y={rotateHandlePos[1]}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={0.018}
        fill={selRing}
        style={{ userSelect: "none", pointerEvents: "none" }}
      >
        ↻
      </text>
    </g>
  );
}

export default function VisualScopeEditor({ sheetId, baseImagePath, initialMarkupData, onSaved }: VisualScopeEditorProps) {
  const { t } = useTranslation();

  const [editorState, setEditorState] = useState<MarkupDocument>(() => parseMarkupData(initialMarkupData));
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVertexIdx, setSelectedVertexIdx] = useState<number | null>(null);
  const [activeColor, setActiveColor] = useState<string>("#1a4d1a");
  const [inProgressPoints, setInProgressPoints] = useState<MarkupPoint[]>([]);
  const [previewPoint, setPreviewPoint] = useState<MarkupPoint | null>(null);
  const [drag, setDrag] = useState<DragOp | null>(null);
  const [draggingVertex, setDraggingVertex] = useState<{ id: string; vertexIdx: number; startPt: MarkupPoint; origPts: MarkupPoint[] } | null>(null);
  const [hoveredMidEdge, setHoveredMidEdge] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [selectionPanelText, setSelectionPanelText] = useState("");

  const hasUserEdited = useRef(false);
  const undoStack = useRef<MarkupDocument[]>([]);
  const redoStack = useRef<MarkupDocument[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartedUndo = useRef(false);
  const vertexDragStartedUndo = useRef(false);

  function pushUndoSnapshot(snapshot: MarkupDocument) {
    undoStack.current = [...undoStack.current.slice(-MAX_UNDO_STEPS + 1), snapshot];
    redoStack.current = [];
  }

  const defaultLayer = editorState.layers.find(l => !l.locked && l.visible) ?? editorState.layers[0];
  const objects = defaultLayer?.objects ?? [];
  const sortedObjects = [...objects].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const totalPoints = objects.reduce((sum, o) => sum + o.points.length, 0);
  const isAtLimit = objects.length >= 200 || totalPoints >= 5000;
  const selectedObj = selectedId ? objects.find(o => o.id === selectedId) ?? null : null;

  function updateObjects(fn: (objs: MarkupObject[]) => MarkupObject[], opts?: { pushUndo?: boolean }): void {
    setEditorState(prev => {
      const activeLayerId = (prev.layers.find(l => !l.locked && l.visible) ?? prev.layers[0])?.id ?? DEFAULT_LAYER_ID;
      if (opts?.pushUndo) {
        undoStack.current = [...undoStack.current.slice(-MAX_UNDO_STEPS + 1), prev];
        redoStack.current = [];
      }
      return {
        ...prev,
        layers: prev.layers.map(l =>
          l.id === activeLayerId ? { ...l, objects: fn(l.objects) } : l
        ),
      };
    });
    hasUserEdited.current = true;
  }

  const setObjects = (fn: (objs: MarkupObject[]) => MarkupObject[]) => updateObjects(fn);
  useEffect(() => {
    if (selectedObj?.type === "text") {
      setSelectionPanelText(selectedObj.label || "Label");
    }
  }, [selectedId, selectedObj?.label]);

  useEffect(() => {
    setEditorState(parseMarkupData(initialMarkupData));
    setActiveTool("select");
    setSelectedId(null);
    setSelectedVertexIdx(null);
    setActiveColor("#1a4d1a");
    setInProgressPoints([]);
    setPreviewPoint(null);
    setDrag(null);
    setDraggingVertex(null);
    setHoveredMidEdge(null);
    setEditingTextId(null);
    setEditingTextValue("");
    setSelectionPanelText("");
    undoStack.current = [];
    redoStack.current = [];
    hasUserEdited.current = false;
    dragStartedUndo.current = false;
    vertexDragStartedUndo.current = false;
  }, [sheetId, baseImagePath]);

  const pushUndo = useCallback((snapshot: MarkupDocument) => {
    pushUndoSnapshot(snapshot);
  }, []);
  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    hasUserEdited.current = true;
    setEditorState(current => {
      redoStack.current = [...redoStack.current.slice(-MAX_UNDO_STEPS + 1), current];
      return prev;
    });
    setSelectedId(null);
  }, []);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current[redoStack.current.length - 1];
    redoStack.current = redoStack.current.slice(0, -1);
    hasUserEdited.current = true;
    setEditorState(current => {
      undoStack.current = [...undoStack.current.slice(-MAX_UNDO_STEPS + 1), current];
      return next;
    });
    setSelectedId(null);
    setSelectedVertexIdx(null);
  }, []);

  useEffect(() => {
    if (!hasUserEdited.current) return;
    setSaveStatus("unsaved");
    const timer = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await apiRequest("PATCH", `/api/visual-scope-sheets/${sheetId}`, { markupData: editorState });
        setSaveStatus("saved");
        onSaved?.();
      } catch {
        setSaveStatus("unsaved");
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [editorState]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const inTextField = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active instanceof HTMLElement && active.isContentEditable);
      if (inTextField) return;

      if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey) || (e.key === "y" && e.ctrlKey)) {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === "Escape") {
        if (inProgressPoints.length > 0) {
          setInProgressPoints([]);
          setPreviewPoint(null);
        } else {
          setSelectedId(null);
          setSelectedVertexIdx(null);
        }
        return;
      }

      if (e.key === "Enter") {
        if (activeTool === "polyline" && inProgressPoints.length >= 2) {
          commitPolyline(inProgressPoints);
        } else if (activeTool === "polygon" && inProgressPoints.length >= 3) {
          commitPolygon(inProgressPoints);
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId !== null && selectedVertexIdx !== null) {
          const obj = objects.find(o => o.id === selectedId);
          if (obj && (obj.type === "polygon" || obj.type === "polyline")) {
            const minPts = obj.type === "polygon" ? 3 : 2;
            if (obj.points.length > minPts) {
              updateObjects(prev => {
                pushUndoSnapshot(editorState);
                const newPts = obj.points.filter((_, i) => i !== selectedVertexIdx);
                return prev.map(o => o.id === selectedId ? { ...o, points: newPts } : o);
              });
              setSelectedVertexIdx(null);
            }
          }
          return;
        }
        if (selectedId && document.activeElement === document.body) {
          updateObjects(prev => {
            pushUndoSnapshot(editorState);
            return prev.filter(o => o.id !== selectedId);
          });
          setSelectedId(null);
          setSelectedVertexIdx(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, selectedVertexIdx, undo, redo, activeTool, inProgressPoints, objects, editorState]);

  const changeTool = useCallback((tool: ActiveTool) => {
    setActiveTool(tool);
    setSelectedId(null);
    setSelectedVertexIdx(null);
    setInProgressPoints([]);
    setPreviewPoint(null);
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    updateObjects(prev => {
      pushUndoSnapshot(editorState);
      return prev.filter(o => o.id !== selectedId);
    });
    setSelectedId(null);
    setSelectedVertexIdx(null);
  }, [selectedId, editorState]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    updateObjects(prev => {
      const obj = prev.find(o => o.id === selectedId);
      if (!obj) return prev;
      pushUndoSnapshot(editorState);
      const offset = 0.02;
      const newObj: MarkupObject = {
        ...obj,
        id: nanoid8(),
        points: obj.points.map(([x, y]) => [clamp(x + offset), clamp(y + offset)] as MarkupPoint),
        createdAt: new Date().toISOString(),
      };
      return [...prev, newObj];
    });
  }, [selectedId, editorState]);

  const handleColorChange = useCallback((color: string) => {
    setActiveColor(color);
    if (!selectedId) return;
    updateObjects(prev => {
      pushUndoSnapshot(editorState);
      return prev.map(o => {
        if (o.id !== selectedId) return o;
        if (o.type === "polygon") {
          const fo = o.fillOpacity ?? 0.15;
          return { ...o, strokeColor: color, fillColor: hexToRgba(color, fo) };
        }
        return { ...o, strokeColor: color, fillColor: color };
      });
    });
  }, [selectedId, editorState]);

  const handleStrokeWidthChange = useCallback((width: number) => {
    if (!selectedId) return;
    updateObjects(prev => prev.map(o => o.id === selectedId ? { ...o, strokeWidth: width } : o));
  }, [selectedId]);

  const handleDashStyleChange = useCallback((style: DashStyle) => {
    if (!selectedId) return;
    updateObjects(prev => {
      pushUndoSnapshot(editorState);
      return prev.map(o => o.id === selectedId ? { ...o, dashStyle: style } : o);
    });
  }, [selectedId, editorState]);

  const handleOpacityChange = useCallback((opacity: number) => {
    if (!selectedId) return;
    updateObjects(prev => prev.map(o => o.id === selectedId ? { ...o, opacity } : o));
  }, [selectedId]);

  const handleFillOpacityChange = useCallback((fillOpacity: number) => {
    if (!selectedId) return;
    updateObjects(prev => prev.map(o => {
      if (o.id !== selectedId || o.type !== "polygon") return o;
      return { ...o, fillOpacity, fillColor: hexToRgba(o.strokeColor, fillOpacity) };
    }));
  }, [selectedId]);
  const currentColorForPicker = selectedObj ? selectedObj.strokeColor : activeColor;

  const commitPolyline = useCallback((pts: MarkupPoint[]) => {
    if (pts.length < 2) return;
    updateObjects(prev => {
      pushUndoSnapshot(editorState);
      return [...prev, {
        id: nanoid8(),
        type: "polyline",
        points: pts,
        strokeColor: activeColor,
        fillColor: "none",
        strokeWidth: 2,
        opacity: 1,
        dashStyle: "solid",
        createdAt: new Date().toISOString(),
        rotation: 0,
        zIndex: prev.length,
      }];
    });
    setInProgressPoints([]);
    setPreviewPoint(null);
  }, [activeColor, editorState]);

  const commitPolygon = useCallback((pts: MarkupPoint[]) => {
    if (pts.length < 3) return;
    updateObjects(prev => {
      pushUndoSnapshot(editorState);
      return [...prev, {
        id: nanoid8(),
        type: "polygon",
        points: pts,
        strokeColor: activeColor,
        fillColor: hexToRgba(activeColor, 0.15),
        fillOpacity: 0.15,
        strokeWidth: 2,
        opacity: 1,
        dashStyle: "solid",
        createdAt: new Date().toISOString(),
        rotation: 0,
        zIndex: prev.length,
      }];
    });
    setInProgressPoints([]);
    setPreviewPoint(null);
  }, [activeColor, editorState]);

  const commitTextEdit = useCallback(() => {
    if (!editingTextId) return;
    const label = editingTextValue.trim();
    updateObjects(prev => {
      pushUndoSnapshot(editorState);
      return prev.map(o => o.id === editingTextId ? { ...o, label: label || "Label" } : o);
    });
    setEditingTextId(null);
    setEditingTextValue("");
  }, [editingTextId, editingTextValue, editorState]);

  const cancelTextEdit = useCallback(() => {
    if (!editingTextId) return;
    const wasNew = objects.find(o => o.id === editingTextId && o.label === "Label");
    if (wasNew) {
      updateObjects(prev => {
        pushUndoSnapshot(editorState);
        return prev.filter(o => o.id !== editingTextId);
      });
    }
    setEditingTextId(null);
    setEditingTextValue("");
  }, [editingTextId, objects, editorState]);

  const commitSelectionPanelText = useCallback(() => {
    if (!selectedId) return;
    const label = selectionPanelText.trim() || "Label";
    updateObjects(prev => {
      const current = prev.find(o => o.id === selectedId);
      if (current && current.label === label) return prev;
      pushUndoSnapshot(editorState);
      return prev.map(o => o.id === selectedId ? { ...o, label } : o);
    });
  }, [selectedId, selectionPanelText, editorState]);

  const startMoveDrag = useCallback((id: string, obj: MarkupObject, startPt: MarkupPoint) => {
    dragStartedUndo.current = false;
    setDrag({ kind: "move", id, origPoints: obj.points.map(p => [...p] as MarkupPoint), startPt });
  }, []);

  const startVertexDrag = useCallback((id: string, idx: number, startPt: MarkupPoint, origPt: MarkupPoint) => {
    dragStartedUndo.current = false;
    setDrag({ kind: "vertex", id, vertexIdx: idx, startPt, origPt });
  }, []);

  const startRotateDrag = useCallback((id: string, center: MarkupPoint, startPt: MarkupPoint, origRotation: number) => {
    dragStartedUndo.current = false;
    const dx = startPt[0] - center[0];
    const dy = startPt[1] - center[1];
    const startAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    setDrag({ kind: "rotate", id, center, startAngle, origRotation });
  }, []);

  const deleteSelectedVertex = useCallback(() => {
    if (selectedId === null || selectedVertexIdx === null) return;
    const obj = objects.find(o => o.id === selectedId);
    if (!obj || (obj.type !== "polygon" && obj.type !== "polyline")) return;
    const minPts = obj.type === "polygon" ? 3 : 2;
    if (obj.points.length <= minPts) return;
    updateObjects(prev => {
      pushUndoSnapshot(editorState);
      return prev.map(o => {
        if (o.id !== selectedId) return o;
        return { ...o, points: o.points.filter((_, i) => i !== selectedVertexIdx) };
      });
    });
    setSelectedVertexIdx(null);
  }, [selectedId, selectedVertexIdx, objects, editorState]);

  const handleVertexPointerDown = useCallback((vertexIdx: number, e: React.PointerEvent) => {
    if (!svgRef.current || !selectedId) return;
    const pt = clientToSvg(svgRef.current, e.clientX, e.clientY);
    const obj = objects.find(o => o.id === selectedId);
    if (!obj) return;
    vertexDragStartedUndo.current = false;
    setDraggingVertex({ id: selectedId, vertexIdx, startPt: pt, origPts: obj.points });
    svgRef.current.setPointerCapture(e.pointerId);
  }, [selectedId, objects]);

  const handleMidpointClick = useCallback((edgeIdx: number, e: React.PointerEvent) => {
    if (!svgRef.current || !selectedId) return;
    const pt = clientToSvg(svgRef.current, e.clientX, e.clientY);
    const obj = objects.find(o => o.id === selectedId);
    if (!obj) return;
    const mp = midpoint(obj.points[edgeIdx], obj.points[(edgeIdx + 1) % obj.points.length]);
    updateObjects(prev => {
      pushUndoSnapshot(editorState);
      return prev.map(o => {
        if (o.id !== selectedId) return o;
        const newPts = [...o.points];
        newPts.splice(edgeIdx + 1, 0, mp);
        return { ...o, points: newPts };
      });
    });
    const newIdx = edgeIdx + 1;
    setSelectedVertexIdx(newIdx);
    vertexDragStartedUndo.current = true;
    setDraggingVertex({ id: selectedId, vertexIdx: newIdx, startPt: pt, origPts: [...obj.points.slice(0, edgeIdx + 1), mp, ...obj.points.slice(edgeIdx + 1)] });
    if (svgRef.current) svgRef.current.setPointerCapture(e.pointerId);
  }, [selectedId, objects, editorState]);

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    e.preventDefault();
    if (editingTextId) return;

    const pt = clientToSvg(svgRef.current, e.clientX, e.clientY);

    if (activeTool === "select") {
      let found = false;
      for (let i = sortedObjects.length - 1; i >= 0; i--) {
        const obj = sortedObjects[i];
        if (obj.locked) continue;
        if (hitTestObj(obj, pt)) {
          setSelectedId(obj.id);
          setSelectedVertexIdx(null);
          setActiveColor(obj.strokeColor);
          if (obj.type === "text") {
            setSelectionPanelText(obj.label || "Label");
          }
          startMoveDrag(obj.id, obj, pt);
          svgRef.current.setPointerCapture(e.pointerId);
          found = true;
          break;
        }
      }
      if (!found) {
        setSelectedId(null);
        setSelectedVertexIdx(null);
      }
      return;
    }

    if (isAtLimit) return;

    if (activeTool === "polygon") {
      if (inProgressPoints.length >= 3 && distance(pt, inProgressPoints[0]) < CLOSE_POLYGON_RADIUS) {
        commitPolygon(inProgressPoints);
      } else {
        hasUserEdited.current = true;
        setInProgressPoints(prev => [...prev, pt]);
      }
      return;
    }

    if (activeTool === "polyline") {
      hasUserEdited.current = true;
      setInProgressPoints(prev => [...prev, pt]);
      return;
    }

    const symbolTypeMap: Record<string, SymbolType | undefined> = { tree: "tree", plant: "plant", boulder: "boulder" };
    const symType = symbolTypeMap[activeTool];
    if (symType) {
      const color = DEFAULT_SYMBOL_COLORS[symType];
      updateObjects(prev => {
        pushUndoSnapshot(editorState);
        return [...prev, {
          id: nanoid8(),
          type: "symbol",
          symbolType: symType,
          points: [pt],
          strokeColor: color,
          fillColor: color,
          strokeWidth: 2,
          opacity: 1,
          createdAt: new Date().toISOString(),
          rotation: 0,
          zIndex: prev.length,
        }];
      });
      return;
    }

    if (activeTool === "text") {
      const newId = nanoid8();
      updateObjects(prev => {
        pushUndoSnapshot(editorState);
        return [...prev, {
          id: newId,
          type: "text",
          points: [pt],
          label: "Label",
          strokeColor: activeColor,
          fillColor: "none",
          strokeWidth: 1,
          opacity: 1,
          createdAt: new Date().toISOString(),
          rotation: 0,
          zIndex: prev.length,
        }];
      });
      setSelectedId(newId);
      setEditingTextId(newId);
      setEditingTextValue("Label");
    }
  }, [activeTool, sortedObjects, inProgressPoints, isAtLimit, editingTextId, commitPolygon, activeColor, editorState, startMoveDrag]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const pt = clientToSvg(svgRef.current, e.clientX, e.clientY);

    if (inProgressPoints.length > 0) {
      setPreviewPoint(pt);
    }

    if (draggingVertex) {
      if (!vertexDragStartedUndo.current) {
        vertexDragStartedUndo.current = true;
        pushUndoSnapshot(editorState);
      }
      const dx = pt[0] - draggingVertex.startPt[0];
      const dy = pt[1] - draggingVertex.startPt[1];
      updateObjects(prev => prev.map(o => {
        if (o.id !== draggingVertex.id) return o;
        const newPts = draggingVertex.origPts.map((p, i) => {
          if (i !== draggingVertex.vertexIdx) return p;
          return [clamp(p[0] + dx), clamp(p[1] + dy)] as MarkupPoint;
        });
        return { ...o, points: newPts };
      }));
      return;
    }

    if (!drag) {
      if (selectedId && activeTool === "select") {
        const obj = objects.find(o => o.id === selectedId);
        if (obj && (obj.type === "polygon" || obj.type === "polyline")) {
          const n = obj.points.length;
          const limit = obj.type === "polygon" ? n : n - 1;
          let found: number | null = null;
          for (let i = 0; i < limit; i++) {
            const a = obj.points[i];
            const b = obj.points[(i + 1) % n];
            const mp = midpoint(a, b);
            if (distance(pt, mp) < MIDPOINT_HIT_RADIUS * 1.5) {
              found = i;
              break;
            }
          }
          setHoveredMidEdge(found);
        }
      }
      return;
    }

    if (drag.kind === "move") {
      if (!dragStartedUndo.current) {
        dragStartedUndo.current = true;
        pushUndoSnapshot(editorState);
      }
      const dx = pt[0] - drag.startPt[0];
      const dy = pt[1] - drag.startPt[1];
      updateObjects(prev => prev.map(o => {
        if (o.id !== drag.id) return o;
        const newPoints = drag.origPoints.map(p => [clamp(p[0] + dx), clamp(p[1] + dy)] as MarkupPoint);
        return { ...o, points: newPoints };
      }));
    } else if (drag.kind === "vertex") {
      if (!dragStartedUndo.current) {
        dragStartedUndo.current = true;
        pushUndoSnapshot(editorState);
      }
      const obj = objects.find(o => o.id === drag.id);
      if (!obj) return;
      const bb = getBbox(obj);
      const rotation = obj.rotation ?? 0;
      const localPt = rotation ? rotatePoint(pt, [bb.cx, bb.cy], -rotation) : pt;
      updateObjects(prev => prev.map(o => {
        if (o.id !== drag.id) return o;
        const newPoints = [...o.points] as MarkupPoint[];
        newPoints[drag.vertexIdx] = [clamp(localPt[0]), clamp(localPt[1])];
        return { ...o, points: newPoints };
      }));
    } else if (drag.kind === "rotate") {
      if (!dragStartedUndo.current) {
        dragStartedUndo.current = true;
        pushUndoSnapshot(editorState);
      }
      const dx = pt[0] - drag.center[0];
      const dy = pt[1] - drag.center[1];
      const currentAngle = Math.atan2(dy, dx) * (180 / Math.PI);
      const delta = currentAngle - drag.startAngle;
      const newRotation = ((drag.origRotation + delta) % 360 + 360) % 360;
      updateObjects(prev => prev.map(o =>
        o.id === drag.id ? { ...o, rotation: newRotation } : o
      ));
    }
  }, [inProgressPoints, drag, draggingVertex, objects, editorState, activeTool, selectedId]);

  const handlePointerUp = useCallback(() => {
    setDrag(null);
    setDraggingVertex(null);
    dragStartedUndo.current = false;
    vertexDragStartedUndo.current = false;
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (activeTool === "polyline" && inProgressPoints.length >= 2) {
      commitPolyline(inProgressPoints);
    } else if (activeTool === "polygon" && inProgressPoints.length >= 2) {
      commitPolygon(inProgressPoints);
    } else if (activeTool === "select" && selectedObj?.type === "text") {
      setEditingTextId(selectedObj.id);
      setEditingTextValue(selectedObj.label || "Label");
    }
  }, [activeTool, inProgressPoints, commitPolyline, commitPolygon, selectedObj, objects, selectedId]);

  const treeCnt = objects.filter(o => o.type === "symbol" && o.symbolType === "tree").length;
  const plantCnt = objects.filter(o => o.type === "symbol" && o.symbolType === "plant").length;
  const boulderCnt = objects.filter(o => o.type === "symbol" && o.symbolType === "boulder").length;
  const hasSymbols = treeCnt > 0 || plantCnt > 0 || boulderCnt > 0;
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  const isPolyShape = selectedObj?.type === "polygon" || selectedObj?.type === "polyline";
  const canDeleteVertex = isPolyShape && selectedVertexIdx !== null && selectedObj!.points.length > (selectedObj!.type === "polygon" ? 3 : 2);

  function ToolBtn({ tool, icon: Icon, label }: { tool: ActiveTool; icon: React.ElementType; label: string }) {
    const isActive = activeTool === tool;
    return (
      <Button
        size="icon"
        variant="ghost"
        className={`toggle-elevate${isActive ? " toggle-elevated" : ""}`}
        onClick={() => changeTool(tool)}
        title={label}
        data-testid={`button-tool-${tool}`}
        disabled={isAtLimit && tool !== "select"}
      >
        <Icon className="w-4 h-4" />
      </Button>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b flex-wrap" data-testid="toolbar-markup">
        <ToolBtn tool="select" icon={MousePointer} label="Select" />
        <ToolBtn tool="polygon" icon={Pentagon} label="Polygon — click to add points, click near first point to close, Enter to finish, Esc to cancel" />
        <ToolBtn tool="polyline" icon={Minus} label="Polyline — click to add points, double-click or Enter to finish, Esc to cancel" />
        <Separator orientation="vertical" className="h-6 mx-1" />
        <ToolBtn tool="tree" icon={TreePine} label="Tree" />
        <ToolBtn tool="plant" icon={Flower} label="Plant" />
        <ToolBtn tool="boulder" icon={Circle} label="Boulder" />
        <ToolBtn tool="text" icon={Type} label="Text label" />
        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Color picker */}
        <div className="relative flex items-center" title="Draw color — applies to new shapes and selected items">
          <label htmlFor="color-picker" className="flex items-center cursor-pointer" aria-label="Color picker">
            <span
              className="w-5 h-5 rounded-sm border border-border"
              style={{ background: currentColorForPicker }}
              data-testid="swatch-active-color"
            />
          </label>
          <input
            id="color-picker"
            type="color"
            value={currentColorForPicker}
            onChange={e => handleColorChange(e.target.value)}
            className="absolute opacity-0 w-5 h-5 cursor-pointer"
            style={{ left: 0, top: 0 }}
            data-testid="input-color-picker"
            title="Pick color"
          />
        </div>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Undo / Redo buttons */}
        <Button
          size="icon"
          variant="ghost"
          disabled={!canUndo}
          onClick={undo}
          data-testid="button-undo"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={!canRedo}
          onClick={redo}
          data-testid="button-redo"
          title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </Button>

        {/* Delete button */}
        <Button
          size="sm"
          variant="ghost"
          disabled={!selectedId}
          onClick={deleteSelected}
          data-testid="button-delete-selected"
          title="Delete selected (Delete key)"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          Delete
        </Button>

        {inProgressPoints.length > 0 && (
          <span className="text-xs text-muted-foreground ml-2 italic" data-testid="text-drawing-hint">
            {activeTool === "polygon"
              ? "Click near first point to close, Enter to finish, Esc to cancel."
              : "Double-click or Enter to finish. Esc to cancel."}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground" data-testid="text-save-status">
          {saveStatus === "saving" && <><Loader2 className="w-3 h-3 animate-spin" />{t("common.saving")}</>}
          {saveStatus === "saved" && <><Check className="w-3 h-3 text-green-600" />{t("common.save")}</>}
          {saveStatus === "unsaved" && t("common.save")}
        </div>
      </div>

      {/* Layer indicator */}
      <div className="flex items-center gap-2 px-3 py-1 border-b bg-muted/20 text-xs text-muted-foreground" data-testid="bar-layer-info">
        <Lock className="w-3 h-3 shrink-0 opacity-50" />
        <span className="opacity-70">Base image (locked)</span>
        <Separator orientation="vertical" className="h-3 mx-1" />
        <span className="font-medium text-foreground">{defaultLayer?.name ?? "Annotations"}</span>
        <span className="opacity-60">— {objects.length} object{objects.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Selection edit panel */}
      {selectedObj && (
        <div
          className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 flex-wrap"
          data-testid="panel-selection-edit"
        >
          <span className="text-xs font-medium text-muted-foreground shrink-0">
            {selectedObj.type.charAt(0).toUpperCase() + selectedObj.type.slice(1)}
            {selectedVertexIdx !== null ? ` — Vertex ${selectedVertexIdx + 1}` : ""}
          </span>

          {/* Color picker for selected item */}
          <div className="relative flex items-center gap-1.5" title="Change item color">
            <span className="text-xs text-muted-foreground">Color</span>
            <label htmlFor="selection-color-picker" className="flex items-center cursor-pointer">
              <span
                className="w-5 h-5 rounded-sm border border-border"
                style={{ background: selectedObj.strokeColor }}
                data-testid="swatch-selection-color"
              />
            </label>
            <input
              id="selection-color-picker"
              type="color"
              value={selectedObj.strokeColor}
              onChange={e => handleColorChange(e.target.value)}
              className="absolute opacity-0 w-5 h-5 cursor-pointer"
              style={{ left: "2.5rem", top: 0 }}
              data-testid="input-selection-color-picker"
            />
          </div>

          {/* Rotation display */}
          {(selectedObj.rotation ?? 0) !== 0 && (
            <span className="text-xs text-muted-foreground" data-testid="text-rotation-value">
              {Math.round(selectedObj.rotation ?? 0)}°
            </span>
          )}

          {/* Stroke width (for polylines and polygons) */}
          {isPolyShape && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Width</span>
              <input
                type="range"
                min={1}
                max={12}
                step={1}
                value={selectedObj.strokeWidth}
                onChange={e => handleStrokeWidthChange(Number(e.target.value))}
                onMouseUp={() => { pushUndoSnapshot(editorState); }}
                className="w-20 accent-primary"
                data-testid="input-stroke-width"
              />
              <span className="text-xs tabular-nums w-4 text-muted-foreground">{selectedObj.strokeWidth}</span>
            </div>
          )}

          {/* Dash style (polylines and polygons) */}
          {isPolyShape && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Line</span>
              {(["solid", "dashed", "dotted"] as DashStyle[]).map(s => (
                <button
                  key={s}
                  onClick={() => handleDashStyleChange(s)}
                  className={`px-2 py-0.5 text-xs rounded border transition-colors ${(selectedObj.dashStyle ?? "solid") === s ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}
                  data-testid={`button-dash-${s}`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Fill opacity (polygon only) */}
          {selectedObj.type === "polygon" && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Fill</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round((selectedObj.fillOpacity ?? 0.15) * 100)}
                onChange={e => handleFillOpacityChange(Number(e.target.value) / 100)}
                onMouseUp={() => { pushUndoSnapshot(editorState); }}
                className="w-16 accent-primary"
                data-testid="input-fill-opacity"
              />
              <span className="text-xs tabular-nums w-7 text-muted-foreground">{Math.round((selectedObj.fillOpacity ?? 0.15) * 100)}%</span>
            </div>
          )}

          {/* Opacity */}
          {(isPolyShape || selectedObj.type === "symbol" || selectedObj.type === "text") && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Opacity</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round((selectedObj.opacity ?? 1) * 100)}
                onChange={e => handleOpacityChange(Number(e.target.value) / 100)}
                onMouseUp={() => { pushUndoSnapshot(editorState); }}
                className="w-16 accent-primary"
                data-testid="input-opacity"
              />
              <span className="text-xs tabular-nums w-7 text-muted-foreground">{Math.round((selectedObj.opacity ?? 1) * 100)}%</span>
            </div>
          )}
          {selectedObj.type === "text" && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Label</span>
              <input
                type="text"
                value={selectionPanelText}
                onChange={e => setSelectionPanelText(e.target.value)}
                onBlur={commitSelectionPanelText}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    commitSelectionPanelText();
                    e.currentTarget.blur();
                  }
                  e.stopPropagation();
                }}
                className="text-xs px-2 py-1 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                style={{ minWidth: "80px" }}
                data-testid="input-selection-label"
              />
            </div>
          )}

          {/* Label for polygon/polyline */}
          {isPolyShape && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Label</span>
              <input
                type="text"
                value={selectedObj.label ?? ""}
                onChange={e => {
                  const label = e.target.value;
                  setObjects(prev => prev.map(o => o.id === selectedId ? { ...o, label } : o));
                  hasUserEdited.current = true;
                }}
                onBlur={() => { pushUndoSnapshot(editorState); }}
                onKeyDown={e => e.stopPropagation()}
                className="text-xs px-2 py-1 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                style={{ minWidth: "80px" }}
                data-testid="input-poly-label"
              />
            </div>
          )}

          {/* Vertex delete button */}
          {canDeleteVertex && (
            <Button
              size="sm"
              variant="ghost"
              onClick={deleteSelectedVertex}
              className="text-destructive"
              data-testid="button-delete-vertex"
              title="Remove selected vertex (Delete/Backspace)"
            >
              <X className="w-3 h-3 mr-1" />
              Remove vertex
            </Button>
          )}

          {/* Duplicate button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={duplicateSelected}
            data-testid="button-duplicate"
            title="Duplicate selected object"
          >
            <Copy className="w-3 h-3 mr-1" />
            Duplicate
          </Button>

          {/* Delete button in selection panel */}
          <Button
            size="sm"
            variant="ghost"
            onClick={deleteSelected}
            className="text-destructive"
            data-testid="button-selection-delete"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Delete
          </Button>
        </div>
      )}

      {/* Complexity warning */}
      {isAtLimit && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-b" data-testid="banner-markup-limit">
          <Info className="w-3 h-3 shrink-0" />
          Markup is very complex. Simplify shapes before adding more.
        </div>
      )}

      {/* Editor canvas */}
      <div
        ref={containerRef}
        style={{
          position: "relative",
          lineHeight: 0,
          aspectRatio: "1 / 1",
          maxHeight: "calc(100vh - 340px)",
          maxWidth: "calc(100vh - 340px)",
          width: "100%",
        }}
      >
        {/* Background layer: base image — locked, non-interactive */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
          }}
          data-testid="layer-background"
          aria-label="Background layer (locked)"
        >
          <img
            src={baseImagePath}
            alt="Base image"
            style={{ width: "100%", height: "100%", display: "block" }}
            data-testid="img-base-image"
            draggable={false}
          />
        </div>

        {/* Annotation layer: SVG canvas */}
        <svg
          ref={svgRef}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            zIndex: 1,
            cursor: activeTool === "select" ? "default" : "crosshair",
            touchAction: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          data-testid="svg-annotation-layer"
        >
          {sortedObjects.map(obj => (
            <MarkupShape
              key={obj.id}
              obj={obj}
              selected={obj.id === selectedId}
              selectedVertexIdx={obj.id === selectedId ? selectedVertexIdx : null}
              hoveredMidEdge={obj.id === selectedId ? hoveredMidEdge : null}
              onVertexPointerDown={handleVertexPointerDown}
              onMidpointClick={handleMidpointClick}
              onVertexClick={setSelectedVertexIdx}
            />
          ))}

          {/* Selection handles (rendered on top) */}
          {selectedObj && activeTool === "select" && (
            <SelectionHandles
              obj={selectedObj}
              onStartVertexDrag={(idx, startPt) => {
                const origPt = selectedObj.points[idx];
                startVertexDrag(selectedObj.id, idx, startPt, origPt);
              }}
              onStartRotate={startPt => {
                const bb = getBbox(selectedObj);
                startRotateDrag(selectedObj.id, [bb.cx, bb.cy], startPt, selectedObj.rotation ?? 0);
              }}
            />
          )}

          {inProgressPoints.length > 0 && (
            <InProgressShape points={inProgressPoints} preview={previewPoint} tool={activeTool} color={activeColor} />
          )}
        </svg>

        {editingTextId && (() => {
          const obj = objects.find(o => o.id === editingTextId);
          if (!obj) return null;
          return (
            <TextEditOverlay
              obj={obj}
              svgRef={svgRef as React.RefObject<SVGSVGElement>}
              containerRef={containerRef as React.RefObject<HTMLDivElement>}
              value={editingTextValue}
              onChange={setEditingTextValue}
              onCommit={commitTextEdit}
              onCancel={cancelTextEdit}
            />
          );
        })()}
      </div>

      {/* Legend */}
      {hasSymbols && (
        <div className="flex items-center gap-4 px-3 py-2 border-t text-sm flex-wrap" data-testid="panel-legend">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Legend</span>
          {treeCnt > 0 && (
            <div className="flex items-center gap-1.5" data-testid="legend-tree">
              <SymbolSvg type="tree" size={14} />
              <span className="text-xs">Tree</span>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">×{treeCnt}</span>
            </div>
          )}
          {plantCnt > 0 && (
            <div className="flex items-center gap-1.5" data-testid="legend-plant">
              <SymbolSvg type="plant" size={14} />
              <span className="text-xs">Plant</span>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">×{plantCnt}</span>
            </div>
          )}
          {boulderCnt > 0 && (
            <div className="flex items-center gap-1.5" data-testid="legend-boulder">
              <SymbolSvg type="boulder" size={14} />
              <span className="text-xs">Boulder</span>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">×{boulderCnt}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
