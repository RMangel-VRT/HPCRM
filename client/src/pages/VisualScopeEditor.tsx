import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  ScrollArea,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MousePointer,
  Pentagon,
  Minus,
  Type,
  Trash2,
  Check,
  Loader2,
  Info,
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  Lock,
  Copy,
  X,
  Library,
  Settings,
  ChevronUp,
  ChevronDown,
  GripHorizontal,
  Unlock,
  Layers,
  MessageSquare,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Layout,
  FileText,
  RotateCcw,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { MarkupObject, MarkupPoint, SymbolType, MarkupDocument, LegendState, LegendEntry, FillType, TextureScale, LayerDefinition, SheetMetadata } from "@shared/schema";
import { parseMarkupData, flattenMarkupObjects, SYSTEM_LAYERS, getDefaultLayerForType } from "@shared/schema";
import { detectLegendEntries, applyLegendState, DEFAULT_LEGEND_STATE } from "@shared/legendUtils";
import {
  TEXTURE_LIBRARY,
  TEXTURE_CATEGORIES,
  TEXTURE_SCALE_SIZES,
  getTextureDef,
  getPatternSvgContent,
} from "@shared/textures";
import type { TextureId } from "@shared/textures";
import {
  SYMBOL_CATEGORIES,
  SYMBOL_MAP,
  LEGACY_SYMBOL_MAP,
  getSymbolsByCategory,
  type SymbolDefinition,
  type SymbolPrimitive,
  type SymbolCategory,
} from "@shared/symbolRegistry";

type ActiveTool = "select" | "polygon" | "polyline" | "text" | "stamp" | "tree" | "plant" | "boulder" | "callout";
type DashStyle = "solid" | "dashed" | "dotted";

type DragOp =
  | { kind: "move"; id: string; origPoints: MarkupPoint[]; startPt: MarkupPoint }
  | { kind: "vertex"; id: string; vertexIdx: number; startPt: MarkupPoint; origPt: MarkupPoint }
  | { kind: "rotate"; id: string; center: MarkupPoint; startAngle: number; origRotation: number }
  | { kind: "resize"; id: string; cx: number; cy: number; origScale: number; startDist: number };

interface VisualScopeEditorProps {
  sheetId: string;
  baseImagePath: string;
  initialMarkup?: MarkupObject[];
  initialLayerDefs?: LayerDefinition[] | null;
  initialLegendState?: LegendState | null;
  initialMarkupData?: unknown;
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

const BASE_SYMBOL_SIZE = 0.04; // normalized SVG units (half-width at scale=1)
const HANDLE_R = 0.008; // handle radius in SVG units
const ROT_HANDLE_OFFSET = 0.025; // distance above top edge for rotation handle

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
    const scale = obj.scale ?? 1;
    const r = obj.type === "symbol" ? BASE_SYMBOL_SIZE * scale * 1.5 : 0.07;
    return { x1: x - r, y1: y - r, x2: x + r, y2: y + r, cx: x, cy: y, w: r * 2, h: r * 2 };
  }
  if (obj.type === "callout") {
    const [x, y] = obj.points[0];
    const r = 0.05;
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
    const scale = obj.scale ?? 1;
    const hs = BASE_SYMBOL_SIZE * scale * 1.5;
    return distance(testPt, obj.points[0]) < hs;
  }
  if (obj.type as string === "callout") {
    const BADGE_R = 0.028;
    const testPtNorm: MarkupPoint = rotation ? rotatePoint(pt, [bb.cx, bb.cy], -rotation) : pt;
    if (distance(testPtNorm, obj.points[0]) < BADGE_R + 0.015) return true;
    if (obj.points.length > 1 && distance(testPtNorm, obj.points[1]) < 0.02) return true;
    if (obj.points.length > 1) {
      if (pointToSegmentDistance(testPtNorm, obj.points[0], obj.points[1]) < SHAPE_HIT_RADIUS) return true;
    }
    return false;
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

function migrateObjects(objects: MarkupObject[]): MarkupObject[] {
  return objects.map(obj => ({
    ...obj,
    layerId: obj.layerId ?? getDefaultLayerForType(obj.type),
  }));
}

function mergeLayerDefs(saved: LayerDefinition[] | null | undefined): LayerDefinition[] {
  if (!saved || saved.length === 0) return SYSTEM_LAYERS.map(l => ({ ...l }));
  const savedMap = new Map(saved.map(l => [l.id, l]));
  return SYSTEM_LAYERS.map(sys => {
    const s = savedMap.get(sys.id);
    if (!s) return { ...sys };
    return {
      ...sys,
      visible: sys.id === "base-image" ? true : s.visible,
      locked: sys.id === "base-image" ? true : s.locked,
    };
  });
}

function resolveSymbolDef(obj: MarkupObject): SymbolDefinition | undefined {
  if (obj.symbolTypeId) return SYMBOL_MAP.get(obj.symbolTypeId);
  if (obj.symbolType) {
    const mappedId = LEGACY_SYMBOL_MAP[obj.symbolType];
    if (mappedId) return SYMBOL_MAP.get(mappedId);
  }
  return undefined;
}

// ─── Symbol SVG Primitive Renderer ────────────────────────────────────────────
function SymbolPrimitiveEl({
  shape,
  color,
  sw,
}: {
  shape: SymbolPrimitive;
  color: string;
  sw: number;
}) {
  const fill = shape.kind !== "line" && shape.kind !== "polyline" && (shape as any).filled ? color : "none";
  const stroke = shape.kind === "line" || shape.kind === "polyline" || !(shape as any).filled ? color : "none";

  if (shape.kind === "circle") {
    return (
      <circle
        cx={shape.cx}
        cy={shape.cy}
        r={shape.r}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
      />
    );
  }
  if (shape.kind === "ellipse") {
    const transform = shape.rot ? `rotate(${shape.rot} ${shape.cx} ${shape.cy})` : undefined;
    return (
      <ellipse
        cx={shape.cx}
        cy={shape.cy}
        rx={shape.rx}
        ry={shape.ry}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
        transform={transform}
      />
    );
  }
  if (shape.kind === "polygon") {
    const pts = shape.pts.map(([x, y]) => `${x},${y}`).join(" ");
    return (
      <polygon
        points={pts}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    );
  }
  if (shape.kind === "polyline") {
    const pts = shape.pts.map(([x, y]) => `${x},${y}`).join(" ");
    return (
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    );
  }
  if (shape.kind === "line") {
    return (
      <line
        x1={shape.x1}
        y1={shape.y1}
        x2={shape.x2}
        y2={shape.y2}
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    );
  }
  if (shape.kind === "rect") {
    return (
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.w}
        height={shape.h}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
      />
    );
  }
  return null;
}

function SymbolIcon({
  def,
  size = 48,
  color,
}: {
  def: SymbolDefinition;
  size?: number;
  color?: string;
}) {
  const c = color ?? def.defaultColor;
  const sw = 0.08;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-1 -1 2 2"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      {def.shapes.map((shape, i) => (
        <SymbolPrimitiveEl key={i} shape={shape} color={c} sw={sw} />
      ))}
    </svg>
  );
}

// ─── Markup Shape Renderer ────────────────────────────────────────────────────

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
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    <textarea
      ref={inputRef}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onCommit(); }
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
        padding: "4px 8px",
        background: "white",
        zIndex: 20,
        minWidth: "120px",
        minHeight: "40px",
        outline: "none",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        resize: "both",
        fontFamily: "inherit",
      }}
      data-testid="input-text-label"
    />
  );
}

interface CalloutShapeProps {
  obj: MarkupObject;
  selected: boolean;
  onBadgePointerDown: (e: React.PointerEvent) => void;
  onTargetPointerDown: (e: React.PointerEvent) => void;
}

function CalloutShape({ obj, selected, onBadgePointerDown, onTargetPointerDown }: CalloutShapeProps) {
  const BADGE_R = 0.028;
  const badgePos = obj.points[0];
  const targetPos = obj.points.length > 1 ? obj.points[1] : badgePos;
  const lineColor = obj.strokeColor;
  const sw = (obj.type === "callout" ? (obj.strokeWidth || 2) : 2) / 1000;
  const da = dashArray(obj.dashStyle, obj.strokeWidth || 2);
  const opacity = obj.opacity ?? 1;

  const dx = badgePos[0] - targetPos[0];
  const dy = badgePos[1] - targetPos[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = len > 0 ? dx / len : 0;
  const ny = len > 0 ? dy / len : 0;

  const lineEndX = badgePos[0] - nx * BADGE_R;
  const lineEndY = badgePos[1] - ny * BADGE_R;

  const arrLen = 0.018;
  const arrW = 0.009;
  const tipX = targetPos[0];
  const tipY = targetPos[1];
  const arrBaseX = tipX + nx * arrLen;
  const arrBaseY = tipY + ny * arrLen;
  const perpX = -ny;
  const perpY = nx;

  const arrowPoints = [
    `${tipX},${tipY}`,
    `${arrBaseX + perpX * arrW},${arrBaseY + perpY * arrW}`,
    `${arrBaseX - perpX * arrW},${arrBaseY - perpY * arrW}`,
  ].join(" ");

  const num = obj.calloutNumber ?? 1;
  const label = obj.label ?? "";

  return (
    <g opacity={opacity}>
      {len > BADGE_R * 0.5 && (
        <>
          <line
            x1={lineEndX}
            y1={lineEndY}
            x2={targetPos[0] + nx * arrLen}
            y2={targetPos[1] + ny * arrLen}
            stroke={lineColor}
            strokeWidth={sw}
            strokeDasharray={da}
            strokeLinecap="round"
          />
          <polygon
            points={arrowPoints}
            fill={lineColor}
          />
        </>
      )}

      <circle
        cx={badgePos[0]}
        cy={badgePos[1]}
        r={BADGE_R}
        fill={selected ? "#f59e0b" : "#1d4ed8"}
        stroke="white"
        strokeWidth={0.003}
        style={{ cursor: "grab" }}
        onPointerDown={e => { e.stopPropagation(); onBadgePointerDown(e); }}
        data-testid={`callout-badge-${obj.id}`}
      />
      <text
        x={badgePos[0]}
        y={badgePos[1]}
        fontSize={BADGE_R * 1.1}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontWeight="bold"
        style={{ userSelect: "none", pointerEvents: "none" }}
      >
        {num}
      </text>

      {label && (
        <text
          x={badgePos[0] + BADGE_R + 0.008}
          y={badgePos[1]}
          fontSize={0.022}
          fill={lineColor}
          dominantBaseline="middle"
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          {label.length > 25 ? label.slice(0, 25) + "…" : label}
        </text>
      )}

      {selected && obj.points.length > 1 && (
        <circle
          cx={targetPos[0]}
          cy={targetPos[1]}
          r={0.015}
          fill="#ef4444"
          stroke="white"
          strokeWidth={0.002}
          style={{ cursor: "grab" }}
          onPointerDown={e => { e.stopPropagation(); onTargetPointerDown(e); }}
          data-testid={`callout-target-${obj.id}`}
        />
      )}

      {selected && (
        <circle
          cx={badgePos[0]}
          cy={badgePos[1]}
          r={BADGE_R + 0.01}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={0.003}
          strokeDasharray="0.006,0.003"
          style={{ pointerEvents: "none" }}
        />
      )}
    </g>
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
  onCalloutBadgePointerDown: (obj: MarkupObject, e: React.PointerEvent) => void;
  onCalloutTargetPointerDown: (obj: MarkupObject, e: React.PointerEvent) => void;
}

function makePatternId(obj: MarkupObject) {
  return `tex-${obj.id}`;
}

function PolygonTextureDef({ obj }: { obj: MarkupObject }) {
  const texId = obj.textureId;
  const scale = obj.textureScale ?? "medium";
  if (!texId) return null;

  const texDef = getTextureDef(texId);
  if (!texDef) return null;

  const tileSize = TEXTURE_SCALE_SIZES[scale];
  const patId = makePatternId(obj);
  const content = getPatternSvgContent(texId as TextureId);
  if (!content) return null;

  return (
    <defs>
      <pattern
        id={patId}
        x="0"
        y="0"
        width={tileSize}
        height={tileSize}
        patternUnits="userSpaceOnUse"
      >
        <g
          transform={`scale(${tileSize})`}
          color={texDef.color}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </pattern>
    </defs>
  );
}

function MarkupShape({
  obj,
  selected,
  selectedVertexIdx,
  hoveredMidEdge,
  onVertexPointerDown,
  onMidpointClick,
  onVertexClick,
  onCalloutBadgePointerDown,
  onCalloutTargetPointerDown,
}: MarkupShapeProps) {
  const sw = obj.strokeWidth / 1000;
  const bb = getBbox(obj);
  const rotation = obj.rotation ?? 0;
  const rotTransform = rotation ? `rotate(${rotation} ${bb.cx} ${bb.cy})` : undefined;
  const selRing = "#f59e0b";
  const selSw = 0.003;
  const opacity = obj.opacity ?? 1;
  const da = dashArray(obj.dashStyle, obj.strokeWidth);

  if (obj.type as string === "callout") {
    return (
      <CalloutShape
        obj={obj as any}
        selected={selected}
        onBadgePointerDown={e => onCalloutBadgePointerDown(obj, e)}
        onTargetPointerDown={e => onCalloutTargetPointerDown(obj, e)}
      />
    );
  }

  if (obj.type === "polygon") {
    const isTexture = obj.fillType === "texture" && !!obj.textureId && !!getTextureDef(obj.textureId ?? "");
    const patId = makePatternId(obj);
    const texOpacity = obj.textureOpacity ?? 0.85;
    const pts = toSvgPoints(obj.points);

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
        {isTexture && <PolygonTextureDef obj={obj} />}
        {isTexture ? (
          <>
            <polygon points={pts} stroke="none" fill={obj.fillColor} fillOpacity={0.12} strokeWidth={0} />
            <polygon
              points={pts}
              stroke={obj.strokeColor}
              fill={`url(#${patId})`}
              fillOpacity={texOpacity}
              strokeWidth={sw}
              strokeLinejoin="round"
              strokeDasharray={da}
            />
          </>
        ) : (
          <polygon
            points={pts}
            stroke={obj.strokeColor}
            fill={obj.fillColor}
            strokeWidth={sw}
            strokeLinejoin="round"
            strokeDasharray={da}
          />
        )}
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
    const [cx, cy] = obj.points[0];
    const scale = obj.scale ?? 1;
    const rotation = obj.rotation ?? 0;
    const hs = BASE_SYMBOL_SIZE * scale;
    const def = resolveSymbolDef(obj);
    const color = obj.strokeColor;
    const symSw = 0.08;
    let inner: React.ReactNode = null;
    if (obj.symbolType === "tree") {
      inner = <polygon points="0,-0.5 0.5,0.5 -0.5,0.5" fill={color} />;
    } else if (obj.symbolType === "plant") {
      inner = <circle cx="0" cy="0" r="0.45" fill={color} />;
    } else {
      inner = <ellipse cx="0" cy="0" rx="0.5" ry="0.35" fill={color} />;
    }
    return (
      <g opacity={opacity}>
        <g transform={`translate(${cx} ${cy}) rotate(${rotation}) scale(${hs})`}>
          {def ? def.shapes.map((shape, i) => (
            <SymbolPrimitiveEl key={i} shape={shape} color={color} sw={symSw} />
          )) : <circle cx="0" cy="0" r="0.7" fill={color} />}
        </g>
        {obj.showLabel && obj.label && (
          <text x={cx} y={cy + hs + 0.018} fontSize={0.018} fill={color}
            dominantBaseline="hanging" textAnchor="middle" style={{ userSelect: "none" }}>
            {obj.label}
          </text>
        )}
        {selected && (
          <rect x={cx - hs} y={cy - hs} width={hs * 2} height={hs * 2}
            fill="none" stroke={selRing} strokeWidth={selSw} strokeDasharray="0.006,0.004" />
        )}
      </g>
    );
  }

  if (obj.type === "text") {
    const [x, y] = obj.points[0];
    const fontSize = obj.fontSize ?? 0.025;
    const align = obj.textAlign ?? "center";
    const textAnchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
    const lines = (obj.label || "Label").split("\n");
    const lineH = fontSize * 1.3;

    return (
      <g transform={rotTransform} opacity={opacity}>
        {lines.map((line, i) => (
          <text
            key={i}
            x={x}
            y={y + i * lineH - ((lines.length - 1) * lineH) / 2}
            fontSize={fontSize}
            fill={obj.strokeColor}
            dominantBaseline="middle"
            textAnchor={textAnchor}
            style={{ userSelect: "none" }}
          >
            {line || " "}
          </text>
        ))}
        {selected && (
          <rect
            x={x - (textAnchor === "middle" ? 0.1 : textAnchor === "end" ? 0.2 : 0)}
            y={y - fontSize * lines.length * 0.7}
            width={0.2}
            height={fontSize * lines.length * 1.5}
            fill="none"
            stroke={selRing}
            strokeWidth={selSw}
            rx={0.005}
          />
        )}
      </g>
    );
  }

  return null;
}

// ─── Transform Handles ─────────────────────────────────────────────────────────
interface TransformHandlesProps {
  obj: MarkupObject;
  onResizeStart: (e: React.PointerEvent, cx: number, cy: number, origScale: number, startDist: number) => void;
  onRotateStart: (e: React.PointerEvent, cx: number, cy: number) => void;
}

function TransformHandles({ obj, onResizeStart, onRotateStart }: TransformHandlesProps) {
  if (obj.type !== "symbol") return null;
  const [cx, cy] = obj.points[0];
  const scale = obj.scale ?? 1;
  const hs = BASE_SYMBOL_SIZE * scale;
  const corners: [number, number][] = [
    [cx - hs, cy - hs],
    [cx + hs, cy - hs],
    [cx + hs, cy + hs],
    [cx - hs, cy + hs],
  ];
  const rotHandleY = cy - hs - ROT_HANDLE_OFFSET;

  return (
    <g>
      {/* Rotation connector line */}
      <line
        x1={cx}
        y1={cy - hs}
        x2={cx}
        y2={rotHandleY}
        stroke="#f59e0b"
        strokeWidth={0.002}
        strokeDasharray="0.004,0.003"
        style={{ pointerEvents: "none" }}
      />
      {/* Rotation handle */}
      <circle
        cx={cx}
        cy={rotHandleY}
        r={HANDLE_R * 1.3}
        fill="#f59e0b"
        stroke="white"
        strokeWidth={0.002}
        style={{ cursor: "grab" }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onRotateStart(e, cx, cy);
        }}
        data-testid="handle-rotate"
      />
      {/* Corner resize handles */}
      {corners.map(([hx, hy], i) => (
        <rect
          key={i}
          x={hx - HANDLE_R}
          y={hy - HANDLE_R}
          width={HANDLE_R * 2}
          height={HANDLE_R * 2}
          fill="white"
          stroke="#f59e0b"
          strokeWidth={0.002}
          style={{ cursor: "nwse-resize" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            const dist = distance([hx, hy], [cx, cy]);
            onResizeStart(e, cx, cy, scale, dist);
          }}
          data-testid={`handle-resize-${i}`}
        />
      ))}
    </g>
  );
}

// ─── In-progress shape ───────────────────────────────────────────────────────
interface InProgressShapeProps {
  points: MarkupPoint[];
  preview: MarkupPoint | null;
  tool: ActiveTool;
  color: string;
}

function InProgressShape({ points, preview, tool, color }: InProgressShapeProps) {
  const all = preview ? [...points, preview] : points;
  if (all.length < 1) return null;

  if (tool === "callout") {
    if (points.length === 1 && preview) {
      return (
        <g>
          <line
            x1={points[0][0]} y1={points[0][1]}
            x2={preview[0]} y2={preview[1]}
            stroke={color} strokeWidth={0.002} strokeDasharray="0.005,0.003"
          />
          <circle cx={points[0][0]} cy={points[0][1]} r={0.025} fill={color} opacity={0.5} />
        </g>
      );
    }
    return (
      <g>
        <circle cx={points[0]?.[0] ?? 0.5} cy={points[0]?.[1] ?? 0.5} r={0.025} fill={color} opacity={0.5} />
      </g>
    );
  }

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
  | { kind: "rotate"; id: string; center: MarkupPoint; startAngle: number; origRotation: number }
  | { kind: "resize"; id: string; cx: number; cy: number; origScale: number; startDist: number }
  | { kind: "callout-target"; id: string; startPt: MarkupPoint; origTarget: MarkupPoint }
  | { kind: "title-block"; origPos: MarkupPoint; startPt: MarkupPoint }
  | { kind: "notes-block"; origPos: MarkupPoint; startPt: MarkupPoint };
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

  if (obj.type === "callout") return null;

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
      <polygon
        points={rotatedCorners.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke={selRing}
        strokeWidth={selSw}
        strokeDasharray="0.006,0.003"
        style={{ pointerEvents: "none" }}
      />
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

interface LayersPanelProps {
  layers: LayerDefinition[];
  activeLayerId: string;
  onSetActive: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLocked: (id: string) => void;
}

type Corner = LegendState["position"];

function getCornerStyle(pos: Corner): React.CSSProperties {
  const m = 10;
  switch (pos) {
    case "top-left":     return { top: m, left: m };
    case "top-right":    return { top: m, right: m };
    case "bottom-left":  return { bottom: m, left: m };
    case "bottom-right": return { bottom: m, right: m };
  }
}

function nearestCorner(x: number, y: number, w: number, h: number): Corner {
  const midX = w / 2;
  const midY = h / 2;
  if (x <= midX && y <= midY) return "top-left";
  if (x > midX && y <= midY) return "top-right";
  if (x <= midX && y > midY) return "bottom-left";
  return "bottom-right";
}

function resolveDefFromEntry(entry: LegendEntry): SymbolDefinition | undefined {
  if (entry.symbolTypeId) return SYMBOL_MAP.get(entry.symbolTypeId);
  if (entry.symbolType) {
    const mapped = LEGACY_SYMBOL_MAP[entry.symbolType];
    if (mapped) return SYMBOL_MAP.get(mapped);
  }
  return undefined;
}

function LegendPanel({ entries, allEntries, legendState, onLegendStateChange, containerRef }: LegendPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const mode = legendState.mode;
  const compact = mode === "compact";

  function toggleHide(id: string) {
    const hidden = legendState.hiddenEntryIds;
    const next = hidden.includes(id) ? hidden.filter(x => x !== id) : [...hidden, id];
    onLegendStateChange({ ...legendState, hiddenEntryIds: next });
  }

  function startRename(entry: LegendEntry) {
    setRenamingId(entry.id);
    setRenameValue(legendState.customLabels[entry.id] ?? entry.label);
  }

  function commitRename() {
    if (!renamingId) return;
    onLegendStateChange({
      ...legendState,
      customLabels: { ...legendState.customLabels, [renamingId]: renameValue.trim() || (allEntries.find(e => e.id === renamingId)?.label ?? "") },
    });
    setRenamingId(null);
  }

  function moveEntry(id: string, dir: -1 | 1) {
    const orderedIds = entries.map(e => e.id);
    const idx = orderedIds.indexOf(id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= orderedIds.length) return;
    const newOrder = [...orderedIds];
    [newOrder[idx], newOrder[newIdx]] = [newOrder[newIdx], newOrder[idx]];
    onLegendStateChange({ ...legendState, entryOrder: newOrder });
  }

  function handleMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("button,input")) return;
    e.preventDefault();
    if (!containerRef.current || !panelRef.current) return;
    draggingRef.current = true;

    const onMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const corner = nearestCorner(x, y, rect.width, rect.height);
      if (corner !== legendState.position) {
        onLegendStateChange({ ...legendState, position: corner });
      }
    };

    const onMouseUp = (ev: MouseEvent) => {
      draggingRef.current = false;
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;
        const corner = nearestCorner(x, y, rect.width, rect.height);
        onLegendStateChange({ ...legendState, position: corner });
      }
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  const sectionGroups = useMemo(() => {
    const materials = entries.filter(e => e.kind === "material");
    const symbols = entries.filter(e => e.kind === "symbol");
    const lines = entries.filter(e => e.kind === "line");
    return { materials, symbols, lines };
  }, [entries]);

  const panelStyle: React.CSSProperties = {
    position: "absolute",
    ...getCornerStyle(legendState.position),
    background: "rgba(255,255,255,0.93)",
    border: "1px solid rgba(0,0,0,0.15)",
    borderRadius: "6px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
    zIndex: 30,
    minWidth: compact ? "100px" : "160px",
    maxWidth: "220px",
    cursor: "grab",
    userSelect: "none",
    fontSize: "11px",
  };

  function EntryRow({ entry }: { entry: LegendEntry }) {
    const isHidden = legendState.hiddenEntryIds.includes(entry.id);
    const isFirst = entries[0]?.id === entry.id;
    const isLast = entries[entries.length - 1]?.id === entry.id;
    const entryDef = resolveDefFromEntry(entry);

    return (
      <div
        className="flex items-center gap-1 py-0.5 group"
        style={{ opacity: isHidden ? 0.4 : 1 }}
        data-testid={`legend-entry-${entry.id}`}
      >
        {/* Swatch */}
        <div className="shrink-0 flex items-center justify-center" style={{ width: 16, height: 16 }}>
          {entry.kind === "symbol" && entryDef ? (
            <SymbolIcon def={entryDef} color={entry.color} size={14} />
          ) : entry.kind === "line" ? (
            <div style={{ width: 14, height: 2, background: entry.color || "#333", borderRadius: 1 }} />
          ) : (
            <div style={{ width: 12, height: 12, borderRadius: 2, background: entry.color || "#888", border: "1px solid rgba(0,0,0,0.2)" }} />
          )}
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          {renamingId === entry.id ? (
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenamingId(null);
                e.stopPropagation();
              }}
              style={{ fontSize: 10, padding: "0 2px", border: "1px solid #f59e0b", borderRadius: 2, outline: "none", width: "100%", background: "white" }}
              data-testid={`input-legend-rename-${entry.id}`}
            />
          ) : (
            <span
              style={{ fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", cursor: "text" }}
              onClick={() => startRename(entry)}
              title="Click to rename"
              data-testid={`text-legend-label-${entry.id}`}
            >
              {legendState.customLabels[entry.id] ?? entry.label}
              {entry.kind === "symbol" && entry.count !== undefined && legendState.showSymbolCounts && (
                <span style={{ color: "#888", marginLeft: 2 }}>×{entry.count}</span>
              )}
            </span>
          )}
        </div>

        {/* Controls */}
        {!compact && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => moveEntry(entry.id, -1)}
              disabled={isFirst}
              className="p-0.5 rounded hover-elevate disabled:opacity-30"
              title="Move up"
              data-testid={`button-legend-up-${entry.id}`}
            >
              <ChevronUp className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={() => moveEntry(entry.id, 1)}
              disabled={isLast}
              className="p-0.5 rounded hover-elevate disabled:opacity-30"
              title="Move down"
              data-testid={`button-legend-down-${entry.id}`}
            >
              <ChevronDown className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={() => toggleHide(entry.id)}
              className="p-0.5 rounded hover-elevate"
              title={isHidden ? "Show entry" : "Hide entry"}
              data-testid={`button-legend-toggle-${entry.id}`}
            >
              {isHidden ? <EyeOff className="w-2.5 h-2.5 text-muted-foreground" /> : <Eye className="w-2.5 h-2.5 text-muted-foreground" />}
            </button>
          </div>
        )}
      </div>
    );
  }

  const hasAnyVisible = entries.length > 0;

  if (!hasAnyVisible && !compact) {
    return (
      <div ref={panelRef} style={panelStyle} onMouseDown={handleMouseDown}>
        <div style={{ padding: "6px 8px" }}>
          <div style={{ fontWeight: 600, fontSize: 10, color: "#666", marginBottom: 2 }}>{legendState.title}</div>
          <div style={{ fontSize: 9, color: "#aaa" }}>No items to show</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={panelRef} style={panelStyle} onMouseDown={handleMouseDown}>
      <div style={{ padding: "4px 8px 3px", borderBottom: "1px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: 10, color: "#555" }}>{legendState.title}</span>
      </div>
      {!compact && (
        <div style={{ padding: "4px 8px 5px" }}>
          {legendState.showMaterialsGroup && sectionGroups.materials.length > 0 && (
            <div>
              <div style={{ fontSize: 8, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2, marginTop: 1 }}>Materials</div>
              {sectionGroups.materials.map(e => <EntryRow key={e.id} entry={e} />)}
            </div>
          )}
          {legendState.showSymbolsGroup && sectionGroups.symbols.length > 0 && (
            <div>
              <div style={{ fontSize: 8, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2, marginTop: 1 }}>Symbols</div>
              {sectionGroups.symbols.map(e => <EntryRow key={e.id} entry={e} />)}
            </div>
          )}
          {legendState.showLinesGroup && sectionGroups.lines.length > 0 && (
            <div>
              <div style={{ fontSize: 8, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2, marginTop: 1 }}>Lines</div>
              {sectionGroups.lines.map(e => <EntryRow key={e.id} entry={e} />)}
            </div>
          )}
        </div>
      )}
      {compact && (
        <div style={{ padding: "3px 6px 4px", display: "flex", flexWrap: "wrap", gap: 4 }}>
          {entries.map(e => {
            const def = resolveDefFromEntry(e);
            return (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                {e.kind === "symbol" && def ? (
                  <SymbolIcon def={def} color={e.color} size={10} />
                ) : e.kind === "line" ? (
                  <div style={{ width: 10, height: 2, background: e.color || "#333" }} />
                ) : (
                  <div style={{ width: 8, height: 8, borderRadius: 1, background: e.color || "#888", border: "1px solid rgba(0,0,0,0.2)" }} />
                )}
                <span style={{ fontSize: 9, color: "#444" }}>{legendState.customLabels[e.id] ?? e.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

  return (
    <div ref={panelRef} style={panelStyle} onMouseDown={handleMouseDown}>
      <div style={{ padding: "4px 8px 3px", borderBottom: "1px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: 10, color: "#555" }}>{legendState.title}</span>
      </div>
      {!compact && (
        <div style={{ padding: "4px 8px 5px" }}>
          {legendState.showMaterialsGroup && sectionGroups.materials.length > 0 && (
            <div>
              <div style={{ fontSize: 8, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2, marginTop: 1 }}>Materials</div>
              {sectionGroups.materials.map(e => <EntryRow key={e.id} entry={e} />)}
            </div>
          )}
          {legendState.showSymbolsGroup && sectionGroups.symbols.length > 0 && (
            <div>
              <div style={{ fontSize: 8, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2, marginTop: 1 }}>Symbols</div>
              {sectionGroups.symbols.map(e => <EntryRow key={e.id} entry={e} />)}
            </div>
          )}
          {legendState.showLinesGroup && sectionGroups.lines.length > 0 && (
            <div>
              <div style={{ fontSize: 8, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2, marginTop: 1 }}>Lines</div>
              {sectionGroups.lines.map(e => <EntryRow key={e.id} entry={e} />)}
            </div>
          )}
        </div>
      )}
      {compact && (
        <div style={{ padding: "3px 6px 4px", display: "flex", flexWrap: "wrap", gap: 4 }}>
          {entries.map(e => {
            const def = resolveDefFromEntry(e);
            return (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                {e.kind === "symbol" && def ? (
                  <SymbolIcon def={def} color={e.color} size={10} />
                ) : e.kind === "line" ? (
                  <div style={{ width: 10, height: 2, background: e.color || "#333" }} />
                ) : (
                  <div style={{ width: 8, height: 8, borderRadius: 1, background: e.color || "#888", border: "1px solid rgba(0,0,0,0.2)" }} />
                )}
                <span style={{ fontSize: 9, color: "#444" }}>{legendState.customLabels[e.id] ?? e.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LayersPanel({ layers, activeLayerId, onSetActive, onToggleVisible, onToggleLocked }: LayersPanelProps) {
  return (
    <div className="flex flex-col" data-testid="panel-layers">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b bg-muted/30">
        <Layers className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layers</span>
      </div>
      <div className="flex flex-col">
        {layers.map(layer => {
          const isActive = layer.id === activeLayerId;
          const isBase = layer.id === "base-image";
          return (
            <div
              key={layer.id}
              className={`flex items-center gap-1 px-2 py-1 cursor-pointer hover-elevate text-xs ${isActive ? "bg-accent/60 font-semibold" : ""}`}
              onClick={() => {
                if (!layer.locked) onSetActive(layer.id);
              }}
              data-testid={`layer-row-${layer.id}`}
            >
              <Button
                size="icon"
                variant="ghost"
                className="w-5 h-5 shrink-0"
                onClick={e => { e.stopPropagation(); onToggleVisible(layer.id); }}
                title={layer.visible ? "Hide layer" : "Show layer"}
                data-testid={`button-layer-visibility-${layer.id}`}
                disabled={isBase}
              >
                {layer.visible
                  ? <Eye className="w-3 h-3" />
                  : <EyeOff className="w-3 h-3 text-muted-foreground" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="w-5 h-5 shrink-0"
                onClick={e => { e.stopPropagation(); if (!isBase) onToggleLocked(layer.id); }}
                title={layer.locked ? "Unlock layer" : "Lock layer"}
                data-testid={`button-layer-lock-${layer.id}`}
                disabled={isBase}
              >
                {layer.locked
                  ? <Lock className="w-3 h-3 text-muted-foreground" />
                  : <Unlock className="w-3 h-3" />}
              </Button>
              <span
                className={`truncate flex-1 ${!layer.visible ? "text-muted-foreground line-through" : ""}`}
                title={layer.name}
              >
                {layer.name}
              </span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" title="Active layer" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ObjectInspectorProps {
  obj: MarkupObject;
  onChange: (updates: Partial<MarkupObject>) => void;
  onDelete: () => void;
}

// ─── Symbol Library Panel ─────────────────────────────────────────────────────
interface SymbolLibraryProps {
  onSelect: (def: SymbolDefinition) => void;
}

function SymbolLibrary({ onSelect }: SymbolLibraryProps) {
  const [activeTab, setActiveTab] = useState<SymbolCategory>("trees");

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SymbolCategory)}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          {SYMBOL_CATEGORIES.map((cat) => (
            <TabsTrigger
              key={cat.id}
              value={cat.id}
              className="text-xs"
              data-testid={`tab-symbol-cat-${cat.id}`}
            >
              {cat.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SYMBOL_CATEGORIES.map((cat) => (
          <TabsContent key={cat.id} value={cat.id}>
            <ScrollArea className="h-80">
              <div className="grid grid-cols-3 gap-2 p-2">
                {getSymbolsByCategory(cat.id).map((def) => (
                  <Tooltip key={def.id}>
                    <TooltipTrigger asChild>
                      <button
                        className="flex flex-col items-center gap-1.5 p-2 rounded-md border border-transparent hover-elevate active-elevate-2 text-center focus:outline-none focus:ring-2 focus:ring-ring"
                        onClick={() => onSelect(def)}
                        data-testid={`button-symbol-${def.id}`}
                        type="button"
                      >
                        <SymbolIcon def={def} size={44} />
                        <span className="text-xs text-muted-foreground leading-tight">{def.name}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="p-2">
                      <div className="flex flex-col items-center gap-1">
                        <SymbolIcon def={def} size={80} />
                        <span className="text-xs font-medium">{def.name}</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ─── Legend Settings Popover ─────────────────────────────────────────────────

interface LegendSettingsProps {
  legendState: LegendState;
  onLegendStateChange: (ls: LegendState) => void;
}

function ObjectInspector({ obj, onChange, onDelete }: ObjectInspectorProps) {
  return (
    <div className="flex flex-col gap-0" data-testid="panel-inspector">
      <div className="flex items-center justify-between px-2 py-1.5 border-b bg-muted/30">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inspector</span>
        <Button
          size="icon"
          variant="ghost"
          className="w-5 h-5 text-destructive"
          onClick={onDelete}
          data-testid="button-inspector-delete"
          title="Delete object"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
      <div className="px-2 py-2 space-y-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Name / Label</Label>
          <Input
            className="h-7 text-xs"
            value={obj.name ?? ""}
            onChange={e => onChange({ name: e.target.value })}
            onKeyDown={e => e.stopPropagation()}
            placeholder="Optional name"
            data-testid="input-inspector-name"
          />
        </div>

        {obj.type === "polygon" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Fill Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={obj.strokeColor}
                  onChange={e => {
                    const c = e.target.value;
                    onChange({ strokeColor: c, fillColor: hexToRgba(c, 0.15) });
                  }}
                  className="w-7 h-7 rounded border border-border cursor-pointer"
                  data-testid="input-inspector-fill-color"
                />
                <span className="text-xs text-muted-foreground">{obj.strokeColor}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Fill Opacity</Label>
              <Input
                type="number"
                className="h-7 text-xs"
                min={0}
                max={1}
                step={0.05}
                value={(() => {
                  const m = obj.fillColor?.match(/rgba\([^,]+,[^,]+,[^,]+,([^)]+)\)/);
                  return m ? parseFloat(m[1]).toFixed(2) : "0.15";
                })()}
                onChange={e => {
                  const alpha = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                  onChange({ fillColor: hexToRgba(obj.strokeColor, alpha) });
                }}
                onKeyDown={e => e.stopPropagation()}
                data-testid="input-inspector-fill-opacity"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Stroke Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={obj.strokeColor}
                  onChange={e => onChange({ strokeColor: e.target.value })}
                  className="w-7 h-7 rounded border border-border cursor-pointer"
                  data-testid="input-inspector-stroke-color"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Stroke Width</Label>
              <Input
                type="number"
                className="h-7 text-xs"
                min={1}
                max={20}
                value={obj.strokeWidth}
                onChange={e => onChange({ strokeWidth: parseInt(e.target.value) || 2 })}
                onKeyDown={e => e.stopPropagation()}
                data-testid="input-inspector-stroke-width"
              />
            </div>
          </>
        )}

        {obj.type === "polyline" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Stroke Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={obj.strokeColor}
                  onChange={e => onChange({ strokeColor: e.target.value })}
                  className="w-7 h-7 rounded border border-border cursor-pointer"
                  data-testid="input-inspector-polyline-color"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Stroke Width</Label>
              <Input
                type="number"
                className="h-7 text-xs"
                min={1}
                max={20}
                value={obj.strokeWidth}
                onChange={e => onChange({ strokeWidth: parseInt(e.target.value) || 2 })}
                onKeyDown={e => e.stopPropagation()}
                data-testid="input-inspector-polyline-stroke-width"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Dash Style</Label>
              <Select
                value={obj.dashStyle ?? "solid"}
                onValueChange={v => onChange({ dashStyle: v as "solid" | "dashed" | "dotted" })}
              >
                <SelectTrigger className="h-7 text-xs" data-testid="select-inspector-dash-style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">Solid</SelectItem>
                  <SelectItem value="dashed">Dashed</SelectItem>
                  <SelectItem value="dotted">Dotted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {obj.type === "text" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Text Content</Label>
              <Input
                className="h-7 text-xs"
                value={obj.label ?? ""}
                onChange={e => onChange({ label: e.target.value || "Label" })}
                onKeyDown={e => e.stopPropagation()}
                data-testid="input-inspector-text-content"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={obj.strokeColor}
                  onChange={e => onChange({ strokeColor: e.target.value })}
                  className="w-7 h-7 rounded border border-border cursor-pointer"
                  data-testid="input-inspector-text-color"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Font Size</Label>
              <Input
                type="number"
                className="h-7 text-xs"
                min={8}
                max={80}
                value={obj.fontSize ?? 25}
                onChange={e => onChange({ fontSize: parseInt(e.target.value) || 25 })}
                onKeyDown={e => e.stopPropagation()}
                data-testid="input-inspector-font-size"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Rotation (°)</Label>
              <Input
                type="number"
                className="h-7 text-xs"
                min={-180}
                max={180}
                value={obj.rotation ?? 0}
                onChange={e => onChange({ rotation: parseInt(e.target.value) || 0 })}
                onKeyDown={e => e.stopPropagation()}
                data-testid="input-inspector-text-rotation"
              />
            </div>
          </>
        )}

        {obj.type === "symbol" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={obj.strokeColor}
                  onChange={e => onChange({ strokeColor: e.target.value, fillColor: e.target.value })}
                  className="w-7 h-7 rounded border border-border cursor-pointer"
                  data-testid="input-inspector-symbol-color"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Size</Label>
              <Input
                type="number"
                className="h-7 text-xs"
                min={10}
                max={100}
                value={obj.symbolSize ?? 30}
                onChange={e => onChange({ symbolSize: parseInt(e.target.value) || 30 })}
                onKeyDown={e => e.stopPropagation()}
                data-testid="input-inspector-symbol-size"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Rotation (°)</Label>
              <Input
                type="number"
                className="h-7 text-xs"
                min={-180}
                max={180}
                value={obj.rotation ?? 0}
                onChange={e => onChange({ rotation: parseInt(e.target.value) || 0 })}
                onKeyDown={e => e.stopPropagation()}
                data-testid="input-inspector-symbol-rotation"
              />
            </div>
          </>
        )}

        <div className="pt-1 text-xs text-muted-foreground capitalize">
          Type: {obj.type}
        </div>
      </div>
    </div>
  );
}

interface TitleBlockSvgProps {
  meta: SheetMetadata;
  pos: MarkupPoint;
  onPointerDown: (e: React.PointerEvent<SVGGElement>) => void;
}

function TitleBlockSvg({ meta, pos, onPointerDown }: TitleBlockSvgProps) {
  const [x, y] = pos;
  const w = 0.28;
  const lineH = 0.022;
  const pad = 0.012;
  const titleFontSize = 0.018;
  const bodyFontSize = 0.013;

  const rows = [
    meta.sheetTitle || "VISUAL SCOPE SHEET",
    meta.sheetDate ? `Date: ${meta.sheetDate}` : null,
    meta.projectName ? `Project: ${meta.projectName}` : null,
    meta.companyName ? `Company: ${meta.companyName}` : null,
  ].filter(Boolean) as string[];
  const h = pad * 2 + titleFontSize + (rows.length - 1) * lineH + pad;

  return (
    <g
      style={{ cursor: "move" }}
      onPointerDown={onPointerDown}
      data-testid="title-block-svg"
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="rgba(255,255,255,0.92)"
        stroke="rgba(0,0,0,0.25)"
        strokeWidth={0.002}
        rx={0.006}
      />
      <text
        x={x + pad}
        y={y + pad + titleFontSize * 0.85}
        fontSize={titleFontSize}
        fontWeight="bold"
        fill="#111"
        style={{ userSelect: "none" }}
      >
        {rows[0]}
      </text>
      {rows.slice(1).map((row, i) => (
        <text
          key={i}
          x={x + pad}
          y={y + pad + titleFontSize + (i + 1) * lineH - lineH * 0.2}
          fontSize={bodyFontSize}
          fill="#444"
          style={{ userSelect: "none" }}
        >
          {row}
        </text>
      ))}
    </g>
  );
}

interface NotesBlockSvgProps {
  meta: SheetMetadata;
  pos: MarkupPoint;
  onPointerDown: (e: React.PointerEvent<SVGGElement>) => void;
}

function NotesBlockSvg({ meta, pos, onPointerDown }: NotesBlockSvgProps) {
  const [x, y] = pos;
  const content = meta.notesContent || "";
  const lines = content.split("\n").filter(l => l.trim() !== "");
  const w = 0.3;
  const lineH = 0.018;
  const pad = 0.012;
  const titleH = 0.018;
  const h = pad * 2 + titleH + pad * 0.5 + lines.length * lineH;

  return (
    <g
      style={{ cursor: "move" }}
      onPointerDown={onPointerDown}
      data-testid="notes-block-svg"
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={Math.max(h, pad * 3 + titleH)}
        fill="rgba(255,255,255,0.92)"
        stroke="rgba(0,0,0,0.25)"
        strokeWidth={0.002}
        rx={0.006}
      />
      <text
        x={x + pad}
        y={y + pad + titleH * 0.85}
        fontSize={titleH}
        fontWeight="bold"
        fill="#111"
        style={{ userSelect: "none" }}
      >
        Notes
      </text>
      {lines.map((line, i) => {
        const isBullet = line.startsWith("•") || line.startsWith("-");
        const text = isBullet ? (line.startsWith("-") ? "• " + line.slice(1).trimStart() : line) : line;
        return (
          <text
            key={i}
            x={x + pad}
            y={y + pad + titleH + pad * 0.5 + i * lineH + lineH * 0.8}
            fontSize={0.011}
            fill="#333"
            style={{ userSelect: "none" }}
          >
            {text.length > 40 ? text.slice(0, 40) + "…" : text}
          </text>
        );
      })}
    </g>
  );
}

const LAYOUT_PRESETS = {
  proposal_exhibit: {
    label: "Proposal Exhibit",
    titleBlockPosition: [0.02, 0.82] as MarkupPoint,
    notesBlockPosition: [0.72, 0.82] as MarkupPoint,
  },
  scope_plan: {
    label: "Scope Plan",
    titleBlockPosition: [0.02, 0.02] as MarkupPoint,
    notesBlockPosition: [0.02, 0.82] as MarkupPoint,
  },
  internal_planning: {
    label: "Internal Planning",
    titleBlockPosition: [0.72, 0.02] as MarkupPoint,
    notesBlockPosition: [0.72, 0.55] as MarkupPoint,
  },
};

export default function VisualScopeEditor({ sheetId, baseImagePath, initialMarkup, initialLayerDefs, initialLegendState, initialMarkupData, onSaved }: VisualScopeEditorProps) {
  const { t } = useTranslation();
  const [objects, setObjects] = useState<MarkupObject[]>(() => migrateObjects(initialMarkup ?? flattenMarkupObjects(initialMarkupData)));
  const [layerDefs, setLayerDefs] = useState<LayerDefinition[]>(() => mergeLayerDefs(initialLayerDefs));
  const [activeLayerId, setActiveLayerId] = useState<string>("areas");
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [activeSymbolId, setActiveSymbolId] = useState<string>("deciduous-tree");
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
  const [legendState, setLegendState] = useState<LegendState>(() => initialLegendState ?? DEFAULT_LEGEND_STATE);
  const [materialLabelText, setMaterialLabelText] = useState("");
  const [selectionPanelText, setSelectionPanelText] = useState("");
  const [selectionPanelNote, setSelectionPanelNote] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [showSheetPanel, setShowSheetPanel] = useState(false);
  const [sheetMeta, setSheetMeta] = useState<SheetMetadata>(() => (parseMarkupData(initialMarkupData).sheetMeta ?? {}));

  const hasUserEdited = useRef(false);
  const legendUserEdited = useRef(false);
  const undoStack = useRef<{ objects: MarkupObject[]; layerDefs: LayerDefinition[] }[]>([]);
  const redoStack = useRef<{ objects: MarkupObject[]; layerDefs: LayerDefinition[] }[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartedUndo = useRef(false);
  const vertexDragStartedUndo = useRef(false);

  function updateSheetMeta(updates: Partial<SheetMetadata>) {
    setSheetMeta(prev => ({ ...prev, ...updates }));
    hasUserEdited.current = true;
  }

  const sortedObjects = [...objects].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const totalPoints = objects.reduce((sum, o) => sum + o.points.length, 0);
  const isAtLimit = objects.length >= 200 || totalPoints >= 5000;
  const selectedObj = selectedId ? objects.find(o => o.id === selectedId) ?? null : null;

  const layerMap = new Map(layerDefs.map(l => [l.id, l]));

  function isLayerSelectableForObj(obj: MarkupObject): boolean {
    const layer = layerMap.get(obj.layerId ?? "areas");
    if (!layer) return true;
    return layer.visible && !layer.locked;
  }

  const allLegendEntries = useMemo(() => detectLegendEntries(objects), [objects]);
  const visibleLegendEntries = useMemo(
    () => applyLegendState(allLegendEntries, legendState),
    [allLegendEntries, legendState]
  );

  const nextCalloutNumber = useCallback(() => {
    const existing = objects
      .filter(o => o.type === "callout" && typeof o.calloutNumber === "number")
      .map(o => o.calloutNumber as number);
    if (existing.length === 0) return 1;
    return Math.max(...existing) + 1;
  }, [objects]);

  const updateObjects = (fn: (objs: MarkupObject[]) => MarkupObject[]) => {
    setObjects(fn);
    hasUserEdited.current = true;
  };

  useEffect(() => {
    if (selectedObj?.type === "text") {
      setSelectionPanelText(selectedObj.label || "Label");
    } else if (selectedObj?.type === "symbol") {
      setSelectionPanelText(selectedObj.label ?? "");
      setSelectionPanelNote(selectedObj.note ?? "");
    } else if (selectedObj?.type === "callout") {
      setSelectionPanelText(selectedObj.label || "");
    }
    if (selectedObj?.type === "polygon") {
      setMaterialLabelText(selectedObj.materialLabel || "");
    }
  }, [selectedId, selectedObj?.label, selectedObj?.materialLabel, selectedObj?.note]);

  useEffect(() => {
    setObjects(migrateObjects(initialMarkup ?? flattenMarkupObjects(initialMarkupData)));
    setLayerDefs(mergeLayerDefs(initialLayerDefs));
    setSheetMeta(parseMarkupData(initialMarkupData).sheetMeta ?? {});
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
    setLegendState(initialLegendState ?? DEFAULT_LEGEND_STATE);
    setSelectionPanelNote("");
    undoStack.current = [];
    hasUserEdited.current = false;
    legendUserEdited.current = false;
    dragStartedUndo.current = false;
    vertexDragStartedUndo.current = false;
    setActiveLayerId("areas");
  }, [sheetId, baseImagePath]);

  const pushUndo = useCallback((currentObjects: MarkupObject[], currentLayerDefs: LayerDefinition[]) => {
    undoStack.current = [
      ...undoStack.current.slice(-MAX_UNDO_STEPS + 1),
      { objects: currentObjects, layerDefs: currentLayerDefs },
    ];
  }, []);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    hasUserEdited.current = true;
    setObjects(current => {
      setLayerDefs(currentDefs => {
        redoStack.current = [...redoStack.current.slice(-MAX_UNDO_STEPS + 1), { objects: current, layerDefs: currentDefs }];
        return prev.layerDefs;
      });
      return prev.objects;
    });
    setSelectedId(null);
  }, []);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current[redoStack.current.length - 1];
    redoStack.current = redoStack.current.slice(0, -1);
    hasUserEdited.current = true;
    setObjects(current => {
      setLayerDefs(currentDefs => {
        undoStack.current = [...undoStack.current.slice(-MAX_UNDO_STEPS + 1), { objects: current, layerDefs: currentDefs }];
        return next.layerDefs;
      });
      return next.objects;
    });
    setSelectedId(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingTextId) return;
      if (e.key === "z" && (e.metaKey || e.ctrlKey)) {
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) deleteSelected();
      } else if (e.key === "Escape") {
        if (inProgressPoints.length > 0) {
          setInProgressPoints([]);
          setPreviewPoint(null);
        } else {
          setSelectedId(null);
          setActiveTool("select");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, selectedId, editingTextId, inProgressPoints]);

  useEffect(() => {
    if (!hasUserEdited.current) return;
    const timer = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await apiRequest("PATCH", `/api/visual-scope-sheets/${sheetId}`, {
          markupData: {
            version: "2.0",
            objects,
            sheetMeta,
          },
          legendState: legendUserEdited.current ? legendState : null,
          layerDefs,
        });
        setSaveStatus("saved");
      } catch (err) {
        console.error("Save failed:", err);
        setSaveStatus("unsaved");
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [objects, layerDefs, legendState, sheetMeta, sheetId]);

  const handleSetActiveLayer = (id: string) => {
    setActiveLayerId(id);
  };

  const handleToggleLayerVisible = (id: string) => {
    setLayerDefs(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
    hasUserEdited.current = true;
  };

  const handleToggleLayerLocked = (id: string) => {
    setLayerDefs(prev => prev.map(l => l.id === id ? { ...l, locked: !l.locked } : l));
    hasUserEdited.current = true;
  };

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    pushUndo(objects, layerDefs);
    setObjects(current => current.filter(o => o.id !== selectedId));
    setSelectedId(null);
    hasUserEdited.current = true;
  }, [selectedId, objects, layerDefs, pushUndo]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId || !selectedObj) return;
    pushUndo(objects, layerDefs);
    const newId = nanoid8();
    const newObj: MarkupObject = {
      ...selectedObj,
      id: newId,
      points: selectedObj.points.map(p => [p[0] + 0.02, p[1] + 0.02] as MarkupPoint),
      zIndex: (selectedObj.zIndex ?? 0) + 1,
    };
    if (newObj.type === "callout") {
      newObj.calloutNumber = nextCalloutNumber();
    }
    setObjects(current => [...current, newObj]);
    setSelectedId(newId);
    hasUserEdited.current = true;
  }, [selectedId, selectedObj, objects, layerDefs, pushUndo, nextCalloutNumber]);

  const commitEditingText = () => {
    if (!editingTextId) return;
    const val = editingTextValue.trim() || "Label";
    pushUndo(objects, layerDefs);
    setObjects(current => current.map(o => o.id === editingTextId ? { ...o, label: val } : o));
    setEditingTextId(null);
    hasUserEdited.current = true;
  };

  const commitSelectionPanelLabel = useCallback(() => {
    if (!selectedId) return;
    const cur = objects.find(o => o.id === selectedId);
    const label = selectionPanelText.trim() || (cur?.type === "text" ? "Label" : "");
    updateObjects(prev => {
      const current = prev.find(o => o.id === selectedId);
      if (current && current.label === label) return prev;
      pushUndo(prev, layerDefs);
      hasUserEdited.current = true;
      return prev.map(o => o.id === selectedId ? { ...o, label } : o);
    });
  }, [selectedId, selectionPanelText, objects, pushUndo, layerDefs]);

  const commitSelectionPanelText = useCallback(() => {
    if (!selectedId || !selectedObj) return;
    const val = selectionPanelText.trim() || (selectedObj.type === "callout" ? "" : "Label");
    if (val === selectedObj.label) return;
    pushUndo(objects, layerDefs);
    setObjects(current => current.map(o => o.id === selectedId ? { ...o, label: val } : o));
    hasUserEdited.current = true;
  }, [selectedId, selectionPanelText, pushUndo, layerDefs, selectedObj, objects]);

  const handleFillTypeChange = (type: FillType) => {
    if (!selectedId) return;
    pushUndo(objects, layerDefs);
    setObjects(current =>
      current.map(o => (o.id === selectedId ? { ...o, fillType: type } : o))
    );
  };

  const handleTextureIdChange = (id: string) => {
    if (!selectedId) return;
    pushUndo(objects, layerDefs);
    setObjects(current =>
      current.map(o => (o.id === selectedId ? { ...o, textureId: id } : o))
    );
  };

  const handleTextureScaleChange = (scale: TextureScale) => {
    if (!selectedId) return;
    pushUndo(objects, layerDefs);
    setObjects(current =>
      current.map(o => (o.id === selectedId ? { ...o, textureScale: scale } : o))
    );
  };

  const handleTextureOpacityChange = (opacity: number) => {
    if (!selectedId) return;
    pushUndo(objects, layerDefs);
    setObjects(current =>
      current.map(o => (o.id === selectedId ? { ...o, textureOpacity: opacity } : o))
    );
  };

  const commitMaterialLabel = () => {
    if (!selectedId) return;
    pushUndo(objects, layerDefs);
    setObjects(current =>
      current.map(o => (o.id === selectedId ? { ...o, materialLabel: materialLabelText } : o))
    );
    hasUserEdited.current = true;
  };

  const commitMaterialLabel = useCallback(() => {
    if (!selectedId) return;
    const materialLabel = materialLabelText.trim();
    setObjects(prev => {
      const current = prev.find(o => o.id === selectedId);
      if (current && current.materialLabel === materialLabel) return prev;
      pushUndo(prev, layerDefs);
      hasUserEdited.current = true;
      return prev.map(o => o.id === selectedId ? { ...o, materialLabel } : o);
    });
  }, [selectedId, materialLabelText, pushUndo, layerDefs]);

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
    setObjects(prev => {
      pushUndo(objects, layerDefs);
      return prev.map(o => {
        if (o.id !== selectedId) return o;
        return { ...o, points: o.points.filter((_, i) => i !== selectedVertexIdx) };
      });
    });
    setSelectedVertexIdx(null);
  }, [selectedId, selectedVertexIdx, objects, pushUndo, layerDefs]);

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
    setObjects(prev => {
      pushUndo(objects, layerDefs);
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
  }, [selectedId, objects, pushUndo, layerDefs]);

  const commitSelectionPanelNote = useCallback(() => {
    if (!selectedId) return;
    const note = selectionPanelNote.trim();
    updateObjects(prev => {
      const cur = prev.find(o => o.id === selectedId);
      if (cur && cur.note === note) return prev;
      pushUndo(prev, layerDefs);
      return prev.map(o => o.id === selectedId ? { ...o, note } : o);
    });
  }, [selectedId, selectionPanelNote, pushUndo, layerDefs]);

  const toggleShowLabel = useCallback(() => {
    if (!selectedId) return;
    updateObjects(prev => {
      pushUndo(prev, layerDefs);
      return prev.map(o => o.id === selectedId ? { ...o, showLabel: !o.showLabel } : o);
    });
  }, [selectedId, pushUndo, layerDefs]);

  // ─── Handle Drag Callbacks ──────────────────────────────────────────────────
  const handleResizeStart = useCallback((
    e: React.PointerEvent,
    cx: number,
    cy: number,
    origScale: number,
    startDist: number,
  ) => {
    if (!svgRef.current) return;
    svgRef.current.setPointerCapture(e.pointerId);
    dragStartedUndo.current = false;
    setDrag({ kind: "resize", id: selectedId!, cx, cy, origScale, startDist });
  }, [selectedId]);

  const handleRotateStart = useCallback((e: React.PointerEvent, cx: number, cy: number) => {
    if (!svgRef.current) return;
    const pt = clientToSvg(svgRef.current, e.clientX, e.clientY);
    const dx = pt[0] - cx;
    const dy = pt[1] - cy;
    const startAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    const obj = objects.find(o => o.id === selectedId);
    const origRotation = obj?.rotation ?? 0;
    svgRef.current.setPointerCapture(e.pointerId);
    dragStartedUndo.current = false;
    setDrag({ kind: "rotate", id: selectedId!, center: [cx, cy], startAngle, origRotation });
  }, [selectedId, objects]);

  // ─── Canvas Pointer Events ──────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    e.preventDefault();
    if (editingTextId) return;
    const pt = clientToSvg(svgRef.current!, e.clientX, e.clientY);

    if (activeTool === "select") {
      let found = false;
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (!isLayerSelectableForObj(obj)) continue;
        if (hitTestObj(obj, pt)) {
          setSelectedId(obj.id);
          setSelectedVertexIdx(null);
          setActiveColor(obj.strokeColor);
          if (obj.type === "text" || obj.type === "callout") {
            setSelectionPanelText(obj.label || (obj.type === "callout" ? "" : "Label"));
          }
          if (obj.type === "symbol") {
            setSelectionPanelText(obj.label ?? "");
            setSelectionPanelNote(obj.note ?? "");
          }
          startMoveDrag(obj.id, obj, pt);
          if (svgRef.current) svgRef.current.setPointerCapture(e.pointerId);
          found = true;
          break;
        }
      }
      if (found) return;

      if (sheetMeta.titleBlockPosition && distance(pt, sheetMeta.titleBlockPosition) < 0.1) {
        setDrag({ kind: "title-block", origPos: [...sheetMeta.titleBlockPosition] as MarkupPoint, startPt: pt });
        return;
      }
      if (sheetMeta.notesBlockPosition && distance(pt, sheetMeta.notesBlockPosition) < 0.1) {
        setDrag({ kind: "notes-block", origPos: [...sheetMeta.notesBlockPosition] as MarkupPoint, startPt: pt });
        return;
      }

      const hit = sortedObjects.slice().reverse().find(o => isLayerSelectableForObj(o) && hitTestObj(o, pt));
      if (hit) {
        setSelectedId(hit.id);
        setSelectedVertexIdx(null);
        setActiveColor(hit.strokeColor);
        if (hit.type === "text" || hit.type === "callout") {
          setSelectionPanelText(hit.label || (hit.type === "callout" ? "" : "Label"));
        }
        dragStartedUndo.current = false;
        setDrag({ kind: "move", id: hit.id, origPoints: hit.points.map(p => [...p] as MarkupPoint), startPt: pt });
      } else {
        setSelectedId(null);
      }
      return;
    }

    if (isAtLimit) return;

    if (activeTool === "polygon" || activeTool === "polyline") {
      if (inProgressPoints.length > 0 && distance(pt, inProgressPoints[0]) < CLOSE_POLYGON_RADIUS) {
        commitPolygon();
      } else {
        setInProgressPoints(prev => [...prev, pt]);
      }
      return;
    }

    if (activeTool === "polyline") {
      hasUserEdited.current = true;
      setInProgressPoints(prev => [...prev, pt]);
      return;
    }

    if (activeTool === "stamp") {
      const def = SYMBOL_MAP.get(activeSymbolId);
      if (!def) return;
      const newId = nanoid8();
      updateObjects(prev => {
        pushUndo(prev, layerDefs);
        hasUserEdited.current = true;
        return [...prev, {
          id: newId,
          type: "symbol",
          symbolTypeId: def.id,
          points: [pt],
          scale: 1,
          rotation: 0,
          label: "",
          showLabel: false,
          note: "",
          strokeColor: def.defaultColor,
          fillColor: def.defaultColor,
          strokeWidth: 2,
          opacity: 1,
          createdAt: new Date().toISOString(),
          layerId: activeLayerId,
          zIndex: prev.length,
        }];
      });
      setSelectedId(newId);
      setActiveTool("select");
      return;
    }

    const newId = nanoid8();
    let newObj: MarkupObject;
    if (activeTool === "text") {
      newObj = {
        id: newId,
        type: "text",
        points: [pt],
        strokeColor: activeColor,
        strokeWidth: 2,
        fillColor: "none",
        label: "Label",
        fontSize: 25,
        layerId: activeLayerId,
        zIndex: objects.length,
        createdAt: new Date().toISOString(),
      };
      setObjects(current => [...current, newObj]);
      setSelectedId(newId);
      setEditingTextId(newId);
      setEditingTextValue("Label");
    } else if (activeTool === "callout") {
      newObj = {
        id: newId,
        type: "callout",
        points: [pt],
        strokeColor: activeColor,
        strokeWidth: 2,
        fillColor: "none",
        label: "",
        calloutNumber: nextCalloutNumber(),
        layerId: activeLayerId,
        zIndex: objects.length,
        createdAt: new Date().toISOString(),
      };
      setObjects(current => [...current, newObj]);
      setSelectedId(newId);
      setDrag({ kind: "callout-target", id: newId, startPt: pt, origTarget: pt });
    } else {
      newObj = {
        id: newId,
        type: "symbol",
        symbolType: activeTool as any,
        points: [pt],
        strokeColor: DEFAULT_SYMBOL_COLORS[activeTool as SymbolType] || activeColor,
        strokeWidth: 2,
        fillColor: "none",
        symbolSize: 30,
        layerId: activeLayerId,
        zIndex: objects.length,
        createdAt: new Date().toISOString(),
      };
      setObjects(current => [...current, newObj]);
      setSelectedId(newId);
    }
  }, [activeTool, activeSymbolId, sortedObjects, objects, inProgressPoints, isAtLimit, editingTextId, commitPolygon, activeColor, pushUndo, layerDefs, activeLayerId, layerMap, startMoveDrag, nextCalloutNumber]);

  const handleInspectorChange = (updates: Partial<MarkupObject>) => {
    if (!selectedId) return;
    pushUndo(objects, layerDefs);
    setObjects(current => current.map(o => o.id === selectedId ? { ...o, ...updates } : o));
    hasUserEdited.current = true;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!svgRef.current) return;
    const pt = clientToSvg(svgRef.current, e.clientX, e.clientY);
    setPreviewPoint(pt);

    if (drag) {
      if (!dragStartedUndo.current) {
        pushUndo(objects, layerDefs);
        dragStartedUndo.current = true;
      }
      if (drag.kind === "rotate") {
        const angle = Math.atan2(pt[1] - drag.center[1], pt[0] - drag.center[0]);
        const angleDeg = (angle * 180) / Math.PI;
        const delta = angleDeg - drag.startAngle;
        setObjects(current => current.map(o => o.id === drag.id ? {
          ...o,
          rotation: (drag.origRotation + delta + 360) % 360
        } : o));
      } else {
        const dx = pt[0] - drag.startPt[0];
        const dy = pt[1] - drag.startPt[1];

        if (drag.kind === "move") {
          setObjects(current => current.map(o => o.id === drag.id ? {
            ...o,
            points: drag.origPoints.map(p => [p[0] + dx, p[1] + dy] as MarkupPoint)
          } : o));
        } else if (drag.kind === "vertex") {
          setObjects(current => current.map(o => o.id === drag.id ? {
            ...o,
            points: o.points.map((p, i) => i === drag.vertexIdx ? [drag.origPt[0] + dx, drag.origPt[1] + dy] as MarkupPoint : p)
          } : o));
        } else if (drag.kind === "resize") {
          const dist = distance(pt, [drag.cx, drag.cy]);
          const newScale = Math.max(0.1, (drag.origScale * dist) / drag.startDist);
          setObjects(prev => prev.map(o => o.id === drag.id ? { ...o, scale: newScale } : o));
        } else if (drag.kind === "callout-target") {
          setObjects(current => current.map(o => o.id === drag.id ? {
            ...o,
            points: [o.points[0], pt]
          } : o));
        } else if (drag.kind === "title-block") {
          updateSheetMeta({ titleBlockPosition: [drag.origPos[0] + dx, drag.origPos[1] + dy] });
        } else if (drag.kind === "notes-block") {
          updateSheetMeta({ notesBlockPosition: [drag.origPos[0] + dx, drag.origPos[1] + dy] });
        }
      }
    }

    if (selectedId && activeTool === "select") {
      const obj = objects.find(o => o.id === selectedId);
      if (obj && (obj.type === "polygon" || obj.type === "polyline")) {
        let bestEdge = -1;
        let minD = 0.02;
        for (let i = 0; i < (obj.type === "polygon" ? obj.points.length : obj.points.length - 1); i++) {
          const a = obj.points[i];
          const b = obj.points[(i + 1) % obj.points.length];
          const mp = midpoint(a, b);
          const d = distance(pt, mp);
          if (d < minD) {
            minD = d;
            bestEdge = i;
          }
        }
        setHoveredMidEdge(bestEdge);
      }
    }
  };

  const handlePointerUp = () => {
    setDrag(null);
    dragStartedUndo.current = false;
  };

  const commitPolygon = () => {
    if (inProgressPoints.length < 2) {
      setInProgressPoints([]);
      setPreviewPoint(null);
      return;
    }
    pushUndo(objects, layerDefs);
    const newId = nanoid8();
    const isPolyline = activeTool === "polyline";
    const newObj: MarkupObject = {
      id: newId,
      type: isPolyline ? "polyline" : "polygon",
      points: [...inProgressPoints],
      strokeColor: activeColor,
      strokeWidth: 2,
      fillColor: isPolyline ? "none" : hexToRgba(activeColor, 0.15),
      layerId: activeLayerId,
      zIndex: objects.length,
      createdAt: new Date().toISOString(),
    };
    setObjects(current => [...current, newObj]);
    setInProgressPoints([]);
    setPreviewPoint(null);
    setSelectedId(newId);
    hasUserEdited.current = true;
  };

  const handleVertexPointerDown = (id: string, idx: number, e: React.PointerEvent) => {
    const pt = clientToSvg(svgRef.current!, e.clientX, e.clientY);
    const obj = objects.find(o => o.id === id);
    if (!obj) return;
    setDrag({ kind: "vertex", id, vertexIdx: idx, startPt: pt, origPt: [...obj.points[idx]] as MarkupPoint });
  };

  const handleMidpointClick = (id: string, edgeIdx: number, e: React.PointerEvent) => {
    pushUndo(objects, layerDefs);
    setObjects(current => current.map(o => {
      if (o.id !== id) return o;
      const pts = [...o.points];
      const a = pts[edgeIdx];
      const b = pts[(edgeIdx + 1) % pts.length];
      const mp = midpoint(a, b);
      pts.splice(edgeIdx + 1, 0, mp);
      return { ...o, points: pts };
    }));
    hasUserEdited.current = true;
  };

  const handleVertexClick = (id: string, idx: number) => {
    const obj = objects.find(o => o.id === id);
    if (obj && obj.points.length > 3) {
      pushUndo(objects, layerDefs);
      setObjects(current => current.map(o => o.id === id ? {
        ...o,
        points: o.points.filter((_, i) => i !== idx)
      } : o));
      hasUserEdited.current = true;
    }
  };

  const handleCalloutBadgePointerDown = (obj: MarkupObject, e: React.PointerEvent) => {
    const pt = clientToSvg(svgRef.current!, e.clientX, e.clientY);
    setDrag({ kind: "move", id: obj.id, origPoints: obj.points.map(p => [...p] as MarkupPoint), startPt: pt });
  };

  const handleCalloutTargetPointerDown = (obj: MarkupObject, e: React.PointerEvent) => {
    const pt = clientToSvg(svgRef.current!, e.clientX, e.clientY);
    setDrag({ kind: "callout-target", id: obj.id, startPt: pt, origTarget: obj.points[1] ? [...obj.points[1]] as MarkupPoint : pt });
  };

  const isPolyShape = selectedObj?.type === "polygon" || selectedObj?.type === "polyline";
  const canDeleteVertex = isPolyShape && selectedVertexIdx !== null && selectedObj!.points.length > (selectedObj!.type === "polygon" ? 3 : 2);

  return (
    <div className="flex flex-col h-full bg-background" ref={containerRef}>
      <header className="flex items-center justify-between px-4 h-12 border-b bg-card shrink-0 gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant={activeTool === "select" ? "default" : "ghost"}
            size="icon"
            onClick={() => setActiveTool("select")}
            title="Select tool (V)"
            className="h-9 w-9"
            data-testid="tool-select"
          >
            <MousePointer className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Button
            variant={activeTool === "polygon" ? "default" : "ghost"}
            size="icon"
            onClick={() => setActiveTool("polygon")}
            disabled={isAtLimit}
            title="Polygon tool (P)"
            className="h-9 w-9"
            data-testid="tool-polygon"
          >
            <Pentagon className="h-4 w-4" />
          </Button>
          <Button
            variant={activeTool === "polyline" ? "default" : "ghost"}
            size="icon"
            onClick={() => setActiveTool("polyline")}
            disabled={isAtLimit}
            title="Line tool (L)"
            className="h-9 w-9"
            data-testid="tool-polyline"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant={activeTool === "tree" ? "default" : "ghost"}
            size="icon"
            onClick={() => setActiveTool("tree")}
            disabled={isAtLimit}
            title="Tree symbol"
            className="h-9 w-9"
            data-testid="tool-tree"
          >
            <Library className="h-4 w-4" />
          </Button>
          <Button
            variant={activeTool === "plant" ? "default" : "ghost"}
            size="icon"
            onClick={() => setActiveTool("plant")}
            disabled={isAtLimit}
            title="Plant symbol"
            className="h-9 w-9"
            data-testid="tool-plant"
          >
            <Library className="h-4 w-4" />
          </Button>
          <Button
            variant={activeTool === "boulder" ? "default" : "ghost"}
            size="icon"
            onClick={() => setActiveTool("boulder")}
            disabled={isAtLimit}
            title="Boulder symbol"
            className="h-9 w-9"
            data-testid="tool-boulder"
          >
            <Library className="h-4 w-4" />
          </Button>
          <Button
            variant={activeTool === "text" ? "default" : "ghost"}
            size="icon"
            onClick={() => setActiveTool("text")}
            disabled={isAtLimit}
            title="Text tool (T)"
            className="h-9 w-9"
            data-testid="tool-text"
          >
            <Type className="h-4 w-4" />
          </Button>
          <Button
            variant={activeTool === "callout" ? "default" : "ghost"}
            size="icon"
            onClick={() => setActiveTool("callout")}
            disabled={isAtLimit}
            title="Callout tool (C)"
            className="h-9 w-9"
            data-testid="tool-callout"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <div className="flex items-center gap-1.5 px-2">
            <input
              type="color"
              value={activeColor}
              onChange={e => setActiveColor(e.target.value)}
              className="w-6 h-6 rounded-md border border-border cursor-pointer overflow-hidden"
              data-testid="input-color-picker"
            />
            <span className="text-xs font-mono text-muted-foreground uppercase hidden sm:inline">
              {activeColor}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveStatus === "saving" && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse mr-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </div>
          )}
          {saveStatus === "saved" && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium mr-2">
              <Check className="h-3 w-3" />
              Saved
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={undo}
            disabled={undoStack.current.length === 0}
            className="h-9 w-9"
            title="Undo (Ctrl+Z)"
            data-testid="button-undo"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={redo}
            disabled={redoStack.current.length === 0}
            className="h-9 w-9"
            title="Redo (Ctrl+Shift+Z)"
            data-testid="button-redo"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Button
            variant={showSheetPanel ? "default" : "ghost"}
            size="icon"
            onClick={() => setShowSheetPanel(!showSheetPanel)}
            className="h-9 w-9"
            title="Sheet Settings"
            data-testid="button-sheet-settings"
          >
            <Layout className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={legendState.enabled ? "default" : "ghost"}
                size="icon"
                className="h-9 w-9"
                title="Legend Settings"
                data-testid="button-legend-settings"
              >
                <FileText className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">Legend Settings</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Enabled</span>
                    <input
                      type="checkbox"
                      checked={legendState.enabled}
                      onChange={e => {
                        setLegendState(prev => ({ ...prev, enabled: e.target.checked }));
                        legendUserEdited.current = true;
                        hasUserEdited.current = true;
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </div>
                </div>

                {legendState.enabled && (
                  <div className="space-y-3 pt-1 border-t">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Title</Label>
                      <Input
                        className="h-8 text-xs"
                        value={legendState.title || ""}
                        onChange={e => {
                          setLegendState(prev => ({ ...prev, title: e.target.value }));
                          legendUserEdited.current = true;
                          hasUserEdited.current = true;
                        }}
                        placeholder="Legend"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Layout</Label>
                      <Select
                        value={legendState.mode || "compact"}
                        onValueChange={v => {
                          setLegendState(prev => ({ ...prev, mode: v as any }));
                          legendUserEdited.current = true;
                          hasUserEdited.current = true;
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="detailed">Detailed (Side)</SelectItem>
                          <SelectItem value="compact">Compact (Overlay)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Show Counts</span>
                      <input
                        type="checkbox"
                        checked={legendState.showSymbolCounts}
                        onChange={e => {
                          setLegendState(prev => ({ ...prev, showSymbolCounts: e.target.checked }));
                          legendUserEdited.current = true;
                          hasUserEdited.current = true;
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </div>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground"
            onClick={() => onSaved?.()}
            title="Close editor"
            data-testid="button-close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <aside className="w-56 border-r bg-card flex flex-col shrink-0 overflow-y-auto">
          <LayersPanel
            layers={layerDefs}
            activeLayerId={activeLayerId}
            onSetActive={handleSetActiveLayer}
            onToggleVisible={handleToggleLayerVisible}
            onToggleLocked={handleToggleLayerLocked}
          />
          <Separator />

          {selectedObj ? (
            <ObjectInspector
              obj={selectedObj}
              onChange={handleInspectorChange}
              onDelete={deleteSelected}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
              <Info className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-xs">No object selected</p>
            </div>
          )}
          )}

          {selectedObj && (
            <div className="p-2 pt-0 mt-auto border-t bg-muted/30">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={duplicateSelected}
                  data-testid="button-inspector-duplicate"
                >
                  <Copy className="h-3 w-3" />
                  Duplicate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-destructive gap-1.5"
                  onClick={deleteSelected}
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </aside>

        <main className="flex-1 overflow-auto bg-muted/40 p-8 flex items-center justify-center relative min-h-0">
          <div
            className="relative shadow-2xl bg-white select-none ring-1 ring-black/5"
            style={{
              width: "calc(100vh * 0.7)",
              height: "calc(100vh * 0.7 * 0.707)",
              maxWidth: "100%",
              maxHeight: "100%",
              aspectRatio: "1.414 / 1",
            }}
          >
            <div className="absolute inset-0 pointer-events-none">
              <img
                src={baseImagePath}
                className="w-full h-full object-contain opacity-40 grayscale"
                alt="Base blueprint"
              />
            </div>

            <svg
              ref={svgRef}
              viewBox="0 0 1 0.707"
              className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              data-testid="canvas-svg"
            >
              {sortedObjects.map(obj => (
                isLayerSelectableForObj(obj) && (
                  <MarkupShape
                    key={obj.id}
                    obj={obj}
                    selected={selectedId === obj.id}
                    selectedVertexIdx={selectedVertexIdx}
                    hoveredMidEdge={selectedId === obj.id ? hoveredMidEdge : null}
                    onVertexPointerDown={(idx, e) => handleVertexPointerDown(obj.id, idx, e)}
                    onMidpointClick={(edgeIdx, e) => handleMidpointClick(obj.id, edgeIdx, e)}
                    onVertexClick={(idx) => handleVertexClick(obj.id, idx)}
                    onCalloutBadgePointerDown={handleCalloutBadgePointerDown}
                    onCalloutTargetPointerDown={handleCalloutTargetPointerDown}
                  />
                )
              ))}

              {inProgressPoints.length > 0 && (
                <InProgressShape
                  points={inProgressPoints}
                  preview={previewPoint}
                  tool={activeTool}
                  color={activeColor}
                />
              )}

              {selectedId && objects.find(o => o.id === selectedId) && (
                <SelectionHandles
                  obj={objects.find(o => o.id === selectedId)!}
                  onStartVertexDrag={(idx, pt) => handleVertexPointerDown(selectedId, idx, { clientX: 0, clientY: 0 } as any)}
                  onStartRotate={() => {}}
                />
              )}

              {sheetMeta.titleBlockPosition && (
                <TitleBlockSvg
                  meta={sheetMeta}
                  pos={sheetMeta.titleBlockPosition}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const pt = clientToSvg(svgRef.current!, e.clientX, e.clientY);
                    setDrag({ kind: "title-block", origPos: [...sheetMeta.titleBlockPosition!] as MarkupPoint, startPt: pt });
                  }}
                />
              )}

              {sheetMeta.notesBlockPosition && (
                <NotesBlockSvg
                  meta={sheetMeta}
                  pos={sheetMeta.notesBlockPosition}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const pt = clientToSvg(svgRef.current!, e.clientX, e.clientY);
                    setDrag({ kind: "notes-block", origPos: [...sheetMeta.notesBlockPosition!] as MarkupPoint, startPt: pt });
                  }}
                />
              )}
            </svg>

            {editingTextId && (
              <TextEditOverlay
                obj={objects.find(o => o.id === editingTextId)!}
                svgRef={svgRef}
                containerRef={containerRef}
                value={editingTextValue}
                onChange={setEditingTextValue}
                onCommit={commitEditingText}
                onCancel={() => setEditingTextId(null)}
              />
            )}
          </div>
        </main>

        {showSheetPanel && (
          <aside className="w-64 border-l bg-card flex flex-col shrink-0 overflow-y-auto" data-testid="panel-sheet">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sheet Composition</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowSheetPanel(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="p-4 space-y-5">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Layout Preset</Label>
                <div className="grid grid-cols-1 gap-1.5">
                  {Object.entries(LAYOUT_PRESETS).map(([id, preset]) => (
                    <Button
                      key={id}
                      variant="outline"
                      size="sm"
                      className="justify-start text-xs h-8 font-normal"
                      onClick={() => {
                        updateSheetMeta({
                          titleBlockPosition: preset.titleBlockPosition,
                          notesBlockPosition: preset.notesBlockPosition,
                        });
                      }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start text-xs h-8 font-normal text-destructive"
                    onClick={() => {
                      updateSheetMeta({
                        titleBlockPosition: undefined,
                        notesBlockPosition: undefined,
                      });
                    }}
                  >
                    Remove All Overlays
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Sheet Title</Label>
                  <Input
                    className="h-8 text-xs"
                    value={sheetMeta.sheetTitle || ""}
                    onChange={e => updateSheetMeta({ sheetTitle: e.target.value })}
                    placeholder="VISUAL SCOPE SHEET"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Project Name</Label>
                  <Input
                    className="h-8 text-xs"
                    value={sheetMeta.projectName || ""}
                    onChange={e => updateSheetMeta({ projectName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Company Name</Label>
                  <Input
                    className="h-8 text-xs"
                    value={sheetMeta.companyName || ""}
                    onChange={e => updateSheetMeta({ companyName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Notes Content</Label>
                  <textarea
                    className="w-full min-h-[100px] text-xs p-2 rounded-md border bg-background"
                    value={sheetMeta.notesContent || ""}
                    onChange={e => updateSheetMeta({ notesContent: e.target.value })}
                    placeholder="Enter notes here..."
                  />
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      <footer className="h-8 border-t bg-muted/30 px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            Objects: {objects.length} / 200
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Complexity: {totalPoints} / 5000 pts
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground font-mono">
          Sheet ID: {sheetId}
        </div>
      </footer>
    </div>
  );
}