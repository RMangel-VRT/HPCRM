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
} from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Map,
  Library,
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

// ─── Types ────────────────────────────────────────────────────────────────────
type ActiveTool = "select" | "polygon" | "polyline" | "text" | "stamp";
type DashStyle = "solid" | "dashed" | "dotted";

type DragOp =
  | { kind: "move"; id: string; origPoints: MarkupPoint[]; startPt: MarkupPoint }
  | { kind: "vertex"; id: string; vertexIdx: number; startPt: MarkupPoint; origPt: MarkupPoint }
  | { kind: "rotate"; id: string; center: MarkupPoint; startAngle: number; origRotation: number }
  | { kind: "resize"; id: string; cx: number; cy: number; origScale: number; startDist: number };

interface VisualScopeEditorProps {
  sheetId: string;
  baseImagePath: string;
  initialMarkupData: unknown;
  initialLegendState?: LegendState | null;
  initialLayerDefs?: LayerDefinition[] | null;
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
interface MarkupShapeProps {
  obj: MarkupObject;
  selected: boolean;
  selectedVertexIdx: number | null;
  hoveredMidEdge: number | null;
  onVertexPointerDown: (idx: number, e: React.PointerEvent) => void;
  onMidpointClick: (edgeIdx: number, e: React.PointerEvent) => void;
  onVertexClick: (idx: number) => void;
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
}: MarkupShapeProps) {
  const sw = obj.strokeWidth / 1000;
  const bb = getBbox(obj);
  const rotation = obj.rotation ?? 0;
  const rotTransform = rotation ? `rotate(${rotation} ${bb.cx} ${bb.cy})` : undefined;
  const selRing = "#f59e0b";
  const selSw = 0.003;
  const opacity = obj.opacity ?? 1;
  const da = dashArray(obj.dashStyle, obj.strokeWidth);

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
            {/* Light base tint */}
            <polygon points={pts} stroke="none" fill={obj.fillColor} fillOpacity={0.12} strokeWidth={0} />
            {/* Texture pattern + stroke */}
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
    const fs = (obj.fontSize ?? 25) / 1000;
    const rot = obj.rotation ?? 0;
    return (
      <g transform={rotTransform} opacity={opacity}>
        <text
          x={x}
          y={y}
          fontSize={fs}
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

export default function VisualScopeEditor({ sheetId, baseImagePath, initialMarkup, initialLayerDefs, onSaved }: VisualScopeEditorProps) {
  const { t } = useTranslation();
  const [objects, setObjects] = useState<MarkupObject[]>(() => migrateObjects(initialMarkup));
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
  const [selectionPanelNote, setSelectionPanelNote] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);

  const hasUserEdited = useRef(false);
  const legendUserEdited = useRef(false);
  const undoStack = useRef<{ objects: MarkupObject[]; layerDefs: LayerDefinition[] }[]>([]);
  const redoStack = useRef<{ objects: MarkupObject[]; layerDefs: LayerDefinition[] }[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartedUndo = useRef(false);
  const vertexDragStartedUndo = useRef(false);

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

  // Auto-detect legend entries from objects
  const allLegendEntries = useMemo(() => detectLegendEntries(objects), [objects]);
  const visibleLegendEntries = useMemo(
    () => applyLegendState(allLegendEntries, legendState),
    [allLegendEntries, legendState]
  );
  useEffect(() => {
    if (selectedObj?.type === "text") {
      setSelectionPanelText(selectedObj.label || "Label");
    } else if (selectedObj?.type === "symbol") {
      setSelectionPanelText(selectedObj.label ?? "");
      setSelectionPanelNote(selectedObj.note ?? "");
    }
    if (selectedObj?.type === "polygon") {
      setMaterialLabelText(selectedObj.materialLabel || "");
    }
  }, [selectedId, selectedObj?.label, selectedObj?.materialLabel, selectedObj?.note]);

  useEffect(() => {
    setEditorState(parseMarkupData(initialMarkupData));
    setObjects(migrateObjects(initialMarkup));
    setLayerDefs(mergeLayerDefs(initialLayerDefs));
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
    setSelectedVertexIdx(null);
  }, []);

  // Auto-save markupData
  useEffect(() => {
    if (!hasUserEdited.current) return;
    setSaveStatus("unsaved");
    const timer = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await apiRequest("PATCH", `/api/visual-scope-sheets/${sheetId}`, {
          markupData: objects,
          layerDefs,
        });
        setSaveStatus("saved");
        onSaved?.();
      } catch {
        setSaveStatus("unsaved");
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [objects, layerDefs]);

  // Auto-save legendState
  useEffect(() => {
    if (!legendUserEdited.current) return;
    const timer = setTimeout(async () => {
      try {
        await apiRequest("PATCH", `/api/visual-scope-sheets/${sheetId}`, { legendState });
      } catch {
        // silent – legend save failure is non-critical
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [legendState]);

  const handleLegendStateChange = useCallback((ls: LegendState) => {
    legendUserEdited.current = true;
    setLegendState(ls);
  }, []);

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
              setObjects(prev => {
                pushUndo(prev, layerDefs);
                hasUserEdited.current = true;
                const newPts = obj.points.filter((_, i) => i !== selectedVertexIdx);
                return prev.map(o => o.id === selectedId ? { ...o, points: newPts } : o);
              });
              setSelectedVertexIdx(null);
            }
          }
          return;
        }
        if (selectedId && document.activeElement === document.body) {
          setObjects(prev => {
            pushUndo(prev, layerDefs);
            hasUserEdited.current = true;
            return prev.filter(o => o.id !== selectedId);
          });
          setSelectedId(null);
          setSelectedVertexIdx(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, selectedVertexIdx, undo, redo, activeTool, inProgressPoints, objects, pushUndo, layerDefs]);

  const changeTool = useCallback((tool: ActiveTool) => {
    setActiveTool(tool);
    setSelectedId(null);
    setSelectedVertexIdx(null);
    setInProgressPoints([]);
    setPreviewPoint(null);
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setObjects(prev => {
      pushUndo(prev, layerDefs);
      hasUserEdited.current = true;
      return prev.filter(o => o.id !== selectedId);
    });
    setSelectedId(null);
    setSelectedVertexIdx(null);
  }, [selectedId, pushUndo, layerDefs]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    setObjects(prev => {
      const obj = prev.find(o => o.id === selectedId);
      if (!obj) return prev;
      pushUndo(prev, layerDefs);
      hasUserEdited.current = true;
      const offset = 0.02;
      const newObj: MarkupObject = {
        ...obj,
        id: nanoid8(),
        points: obj.points.map(([x, y]) => [clamp(x + offset), clamp(y + offset)] as MarkupPoint),
        createdAt: new Date().toISOString(),
      };
      return [...prev, newObj];
    });
  }, [selectedId, pushUndo, layerDefs]);

  const handleColorChange = useCallback((color: string) => {
    setActiveColor(color);
    if (!selectedId) return;
    setObjects(prev => {
      pushUndo(prev, layerDefs);
      hasUserEdited.current = true;
      return prev.map(o => {
        if (o.id !== selectedId) return o;
        if (o.type === "polygon") {
          const fo = o.fillOpacity ?? 0.15;
          return { ...o, strokeColor: color, fillColor: hexToRgba(color, fo) };
        }
        return { ...o, strokeColor: color, fillColor: color };
      });
    });
  }, [selectedId, pushUndo, layerDefs]);

  const handleInspectorChange = useCallback((updates: Partial<MarkupObject>) => {
    if (!selectedId) return;
    setObjects(prev => {
      hasUserEdited.current = true;
      return prev.map(o => o.id === selectedId ? { ...o, ...updates } : o);
    });
  }, [selectedId]);

  const handleStrokeWidthChange = useCallback((width: number) => {
    if (!selectedId) return;
    setObjects(prev => prev.map(o => o.id === selectedId ? { ...o, strokeWidth: width } : o));
  }, [selectedId]);

  const handleDashStyleChange = useCallback((style: DashStyle) => {
    if (!selectedId) return;
    setObjects(prev => {
      pushUndo(objects, layerDefs);
      return prev.map(o => o.id === selectedId ? { ...o, dashStyle: style } : o);
    });
  }, [selectedId, editorState]);

  const handleOpacityChange = useCallback((opacity: number) => {
    if (!selectedId) return;
    setObjects(prev => prev.map(o => o.id === selectedId ? { ...o, opacity } : o));
  }, [selectedId]);

  const handleFillOpacityChange = useCallback((fillOpacity: number) => {
    if (!selectedId) return;
    setObjects(prev => prev.map(o => {
      if (o.id !== selectedId || o.type !== "polygon") return o;
      return { ...o, fillOpacity, fillColor: hexToRgba(o.strokeColor, fillOpacity) };
    }));
  }, [selectedId]);
  const currentColorForPicker = selectedObj ? selectedObj.strokeColor : activeColor;

  const commitPolyline = useCallback((pts: MarkupPoint[]) => {
    if (pts.length < 2) return;
    setObjects(prev => {
      pushUndo(prev, layerDefs);
      hasUserEdited.current = true;
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
        layerId: activeLayerId,
      }];
    });
    setInProgressPoints([]);
    setPreviewPoint(null);
  }, [activeColor, pushUndo, layerDefs, activeLayerId]);

  const commitPolygon = useCallback((pts: MarkupPoint[]) => {
    if (pts.length < 3) return;
    setObjects(prev => {
      pushUndo(prev, layerDefs);
      hasUserEdited.current = true;
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
        layerId: activeLayerId,
      }];
    });
    setInProgressPoints([]);
    setPreviewPoint(null);
  }, [activeColor, pushUndo, layerDefs, activeLayerId]);

  const commitTextEdit = useCallback(() => {
    if (!editingTextId) return;
    const label = editingTextValue.trim();
    setObjects(prev => {
      pushUndo(prev, layerDefs);
      hasUserEdited.current = true;
      return prev.map(o => o.id === editingTextId ? { ...o, label: label || "Label" } : o);
    });
    setEditingTextId(null);
    setEditingTextValue("");
  }, [editingTextId, editingTextValue, pushUndo, layerDefs]);

  const cancelTextEdit = useCallback(() => {
    if (!editingTextId) return;
    const wasNew = objects.find(o => o.id === editingTextId && o.label === "Label");
    if (wasNew) {
      setObjects(prev => {
        pushUndo(prev, layerDefs);
        hasUserEdited.current = true;
        return prev.filter(o => o.id !== editingTextId);
      });
    }
    setEditingTextId(null);
    setEditingTextValue("");
  }, [editingTextId, objects, pushUndo, layerDefs]);

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

  const handleFillTypeChange = useCallback((fillType: FillType) => {
    if (!selectedId) return;
    setObjects(prev => {
      pushUndo(prev, layerDefs);
      hasUserEdited.current = true;
      return prev.map(o => {
        if (o.id !== selectedId) return o;
        if (fillType === "texture") {
          const defaultTex = o.textureId || "bark-mulch";
          return { ...o, fillType: "texture", textureId: defaultTex, textureScale: o.textureScale ?? "medium", textureOpacity: o.textureOpacity ?? 0.85 };
        }
        return { ...o, fillType: "solid" };
      });
    });
  }, [selectedId, pushUndo, layerDefs]);

  const handleTextureIdChange = useCallback((textureId: string) => {
    if (!selectedId) return;
    const texDef = getTextureDef(textureId);
    if (!texDef) {
      console.warn("[TextureFill] Unknown textureId:", textureId);
      return;
    }
    setObjects(prev => {
      pushUndo(prev, layerDefs);
      hasUserEdited.current = true;
      return prev.map(o => o.id === selectedId ? { ...o, textureId } : o);
    });
  }, [selectedId, pushUndo, layerDefs]);

  const handleTextureScaleChange = useCallback((textureScale: TextureScale) => {
    if (!selectedId) return;
    setObjects(prev => prev.map(o => o.id === selectedId ? { ...o, textureScale } : o));
  }, [selectedId]);

  const handleTextureOpacityChange = useCallback((textureOpacity: number) => {
    if (!selectedId) return;
    setObjects(prev => prev.map(o => o.id === selectedId ? { ...o, textureOpacity } : o));
  }, [selectedId]);

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
  }, [selectedId, objects, editorState]);

  const commitSelectionPanelNote = useCallback(() => {
    if (!selectedId) return;
    const note = selectionPanelNote.trim();
    updateObjects(prev => {
      const cur = prev.find(o => o.id === selectedId);
      if (cur && cur.note === note) return prev;
      pushUndoSnapshot(editorState);
      return prev.map(o => o.id === selectedId ? { ...o, note } : o);
    });
  }, [selectedId, selectionPanelNote, editorState]);

  const toggleShowLabel = useCallback(() => {
    if (!selectedId) return;
    updateObjects(prev => {
      pushUndoSnapshot(editorState);
      return prev.map(o => o.id === selectedId ? { ...o, showLabel: !o.showLabel } : o);
    });
  }, [selectedId, editorState]);

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

    const pt = clientToSvg(svgRef.current, e.clientX, e.clientY);

    if (activeTool === "select") {
      let found = false;
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (!isLayerSelectableForObj(obj)) continue;
        if (hitTestObj(obj, pt)) {
          setSelectedId(obj.id);
          setSelectedVertexIdx(null);
          setActiveColor(obj.strokeColor);
          if (obj.type === "text") setSelectionPanelText(obj.label || "Label");
          if (obj.type === "symbol") {
            setSelectionPanelText(obj.label ?? "");
            setSelectionPanelNote(obj.note ?? "");
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

    const activeLayer = layerMap.get(activeLayerId);
    if (activeLayer?.locked) return;

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

    if (activeTool === "text") {
      const newId = nanoid8();
      setObjects(prev => {
        pushUndo(prev, layerDefs);
        hasUserEdited.current = true;
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
          layerId: activeLayerId,
        }];
      });
      setSelectedId(newId);
      setEditingTextId(newId);
      setEditingTextValue("Label");
    }
  }, [activeTool, activeSymbolId, sortedObjects, objects, inProgressPoints, isAtLimit, editingTextId, commitPolygon, activeColor, pushUndo, layerDefs, activeLayerId, layerMap, startMoveDrag]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const pt = clientToSvg(svgRef.current, e.clientX, e.clientY);

    if (inProgressPoints.length > 0) {
      setPreviewPoint(pt);
    }

    if (draggingVertex) {
      if (!vertexDragStartedUndo.current) {
        vertexDragStartedUndo.current = true;
        pushUndo(objects, layerDefs);
      }
      const dx = pt[0] - draggingVertex.startPt[0];
      const dy = pt[1] - draggingVertex.startPt[1];
      setObjects(prev => prev.map(o => {
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
        pushUndo(objects, layerDefs);
      }
      const dx = pt[0] - drag.startPt[0];
      const dy = pt[1] - drag.startPt[1];
      setObjects(prev => prev.map(o => {
        if (o.id !== drag.id) return o;
        const newPoints = drag.origPoints.map(p => [clamp(p[0] + dx), clamp(p[1] + dy)] as MarkupPoint);
        return { ...o, points: newPoints };
      }));
    } else if (drag?.kind === "vertex") {
      if (!dragStartedUndo.current) {
        dragStartedUndo.current = true;
        pushUndo(objects, layerDefs);
      }
      const obj = objects.find(o => o.id === drag.id);
      if (!obj) return;
      const bb = getBbox(obj);
      const rotation = obj.rotation ?? 0;
      const localPt = rotation ? rotatePoint(pt, [bb.cx, bb.cy], -rotation) : pt;
      setObjects(prev => prev.map(o => {
        if (o.id !== drag.id) return o;
        const newPoints = [...o.points] as MarkupPoint[];
        newPoints[drag.vertexIdx] = [clamp(localPt[0]), clamp(localPt[1])];
        return { ...o, points: newPoints };
      }));
    } else if (drag?.kind === "rotate") {
      if (!dragStartedUndo.current) {
        dragStartedUndo.current = true;
        pushUndo(objects, layerDefs);
      }
      const dx = pt[0] - drag.center[0];
      const dy = pt[1] - drag.center[1];
      const currentAngle = Math.atan2(dy, dx) * (180 / Math.PI);
      const delta = currentAngle - drag.startAngle;
      const newRotation = ((drag.origRotation + delta) % 360 + 360) % 360;
      setObjects(prev => prev.map(o =>
        o.id === drag.id ? { ...o, rotation: newRotation } : o
      ));
    } else if (drag.kind === "resize") {
      if (!dragStartedUndo.current) {
        dragStartedUndo.current = true;
        pushUndoSnapshot(editorState);
      }
      const dist = distance(pt, [drag.cx, drag.cy]);
      const newScale = Math.max(0.1, (drag.origScale * dist) / drag.startDist);
      updateObjects(prev => prev.map(o => o.id === drag.id ? { ...o, scale: newScale } : o));
    }
  }, [inProgressPoints, drag, draggingVertex, pushUndo, objects, layerDefs, activeTool, selectedId]);

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

  const handleToggleVisible = useCallback((layerId: string) => {
    setLayerDefs(prev => {
      pushUndo(objects, prev);
      hasUserEdited.current = true;
      return prev.map(l => l.id === layerId ? { ...l, visible: !l.visible } : l);
    });
    if (selectedId) {
      const obj = objects.find(o => o.id === selectedId);
      if (obj?.layerId === layerId) setSelectedId(null);
    }
  }, [objects, pushUndo, selectedId, layerDefs]);

  const handleToggleLocked = useCallback((layerId: string) => {
    setLayerDefs(prev => {
      hasUserEdited.current = true;
      return prev.map(l => l.id === layerId ? { ...l, locked: !l.locked } : l);
    });
    if (selectedId) {
      const obj = objects.find(o => o.id === selectedId);
      if (obj?.layerId === layerId) setSelectedId(null);
    }
  }, [objects, selectedId]);

  const treeCnt = objects.filter(o => o.type === "symbol" && o.symbolType === "tree").length;
  const plantCnt = objects.filter(o => o.type === "symbol" && o.symbolType === "plant").length;
  const boulderCnt = objects.filter(o => o.type === "symbol" && o.symbolType === "boulder").length;
  const hasSymbols = treeCnt > 0 || plantCnt > 0 || boulderCnt > 0;
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  const isPolyShape = selectedObj?.type === "polygon" || selectedObj?.type === "polyline";
  const canDeleteVertex = isPolyShape && selectedVertexIdx !== null && selectedObj!.points.length > (selectedObj!.type === "polygon" ? 3 : 2);

  // Cursor for active tool
  const svgCursor =
    activeTool === "select" ? "default" :
    activeTool === "stamp" ? "crosshair" :
    "crosshair";

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

  const visibleObjectIds = new Set(
    layerDefs.filter(l => l.visible).map(l => l.id)
  );
  const activeSymbolDef = SYMBOL_MAP.get(activeSymbolId);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b flex-wrap" data-testid="toolbar-markup">
        <ToolBtn tool="select" icon={MousePointer} label="Select" />
        <ToolBtn tool="polygon" icon={Pentagon} label="Polygon — click to add points, click near first point to close, Enter to finish, Esc to cancel" />
        <ToolBtn tool="polyline" icon={Minus} label="Polyline — click to add points, double-click or Enter to finish, Esc to cancel" />
        <ToolBtn tool="text" icon={Type} label="Text label" />

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Symbol Library Button */}
        <Sheet open={libraryOpen} onOpenChange={setLibraryOpen}>
          <SheetTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className={`toggle-elevate gap-1.5${activeTool === "stamp" ? " toggle-elevated" : ""}`}
              title="Symbol Library"
              data-testid="button-symbol-library"
              disabled={isAtLimit}
            >
              <Library className="w-4 h-4" />
              {activeSymbolDef && (
                <span className="text-xs text-muted-foreground hidden sm:inline">{activeSymbolDef.name}</span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80">
            <SheetHeader>
              <SheetTitle>Symbol Library</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <SymbolLibrary
                onSelect={(def) => {
                  setActiveSymbolId(def.id);
                  setActiveColor(def.defaultColor);
                  changeTool("stamp");
                  setLibraryOpen(false);
                }}
              />
            </div>
          </SheetContent>
        </Sheet>

        {/* Stamp tool active indicator */}
        {activeTool === "stamp" && activeSymbolDef && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
            <span className="italic">Stamp:</span>
            <SymbolIcon def={activeSymbolDef} size={16} />
            <span>{activeSymbolDef.name}</span>
          </div>
        )}

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

        {/* Delete */}
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

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Legend toggle */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className={`toggle-elevate gap-1${legendState.enabled ? " toggle-elevated" : ""}`}
              data-testid="button-legend-toggle"
              title="Legend settings"
            >
              <Map className="w-4 h-4" />
              <span className="text-xs">Legend</span>
              <Settings className="w-3 h-3 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0" side="bottom" align="start">
            <div className="p-3 border-b">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={legendState.enabled}
                  onChange={() => handleLegendStateChange({ ...legendState, enabled: !legendState.enabled })}
                  data-testid="checkbox-legend-enabled"
                />
                <span className="text-sm font-medium">Show Legend</span>
              </label>
            </div>
            <LegendSettings legendState={legendState} onLegendStateChange={handleLegendStateChange} />
          </PopoverContent>
        </Popover>

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

      {/* Selection / Inspector Panel */}
      {selectedObj && (
        <div
          className="flex items-start gap-3 px-3 py-2 border-b bg-muted/40 flex-wrap"
          data-testid="panel-selection-edit"
        >
          <span className="text-xs font-medium text-muted-foreground shrink-0">
            {selectedObj.type.charAt(0).toUpperCase() + selectedObj.type.slice(1)}
            {selectedVertexIdx !== null ? ` — Vertex ${selectedVertexIdx + 1}` : ""}
          </span>

          {/* Color */}
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
                onMouseUp={() => { pushUndo(objects, layerDefs); }}
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
                onMouseUp={() => { pushUndo(objects, layerDefs); }}
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
                onMouseUp={() => { pushUndo(objects, layerDefs); }}
                className="w-16 accent-primary"
                data-testid="input-opacity"
              />
              <span className="text-xs tabular-nums w-7 text-muted-foreground">{Math.round((selectedObj.opacity ?? 1) * 100)}%</span>
            </div>
          )}
          {/* Label field */}
          {(selectedObj.type === "text" || selectedObj.type === "symbol") && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Label</span>
              <input
                type="text"
                value={selectionPanelText}
                onChange={e => setSelectionPanelText(e.target.value)}
                onBlur={commitSelectionPanelLabel}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    commitSelectionPanelLabel();
                    e.currentTarget.blur();
                  }
                  e.stopPropagation();
                }}
                placeholder={selectedObj.type === "symbol" ? "Optional label" : "Label text"}
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
                  updateObjects(prev => prev.map(o => o.id === selectedId ? { ...o, label } : o));
                }}
                onBlur={() => { pushUndo(objects, layerDefs); }}
                onKeyDown={e => e.stopPropagation()}
                className="text-xs px-2 py-1 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                style={{ minWidth: "80px" }}
                data-testid="input-poly-label"
              />
            </div>
          )}

          {/* Show/hide label toggle (symbols only) */}
          {selectedObj.type === "symbol" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleShowLabel}
              title={selectedObj.showLabel ? "Hide label" : "Show label"}
              data-testid="button-toggle-label"
            >
              {selectedObj.showLabel
                ? <><EyeOff className="w-3 h-3 mr-1" />Hide Label</>
                : <><Eye className="w-3 h-3 mr-1" />Show Label</>}
            </Button>
          )}

          {/* Note field (symbols only) */}
          {selectedObj.type === "symbol" && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Note</span>
              <input
                type="text"
                value={selectionPanelNote}
                onChange={e => setSelectionPanelNote(e.target.value)}
                onBlur={commitSelectionPanelNote}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    commitSelectionPanelNote();
                    e.currentTarget.blur();
                  }
                  e.stopPropagation();
                }}
                placeholder="Add a note..."
                className="text-xs px-2 py-1 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                style={{ minWidth: "120px" }}
                data-testid="input-selection-note"
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

          {/* Delete selected object */}
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

      {/* Texture inspector — shown when a polygon is selected */}
      {selectedObj?.type === "polygon" && (
        <div className="px-3 py-2 border-b bg-muted/20 flex flex-col gap-2" data-testid="panel-texture-inspector">
          {/* Fill type toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground shrink-0">Fill</span>
            <Button
              size="sm"
              variant={selectedObj.fillType !== "texture" ? "secondary" : "ghost"}
              className="text-xs"
              onClick={() => handleFillTypeChange("solid")}
              data-testid="button-fill-solid"
            >
              Solid
            </Button>
            <Button
              size="sm"
              variant={selectedObj.fillType === "texture" ? "secondary" : "ghost"}
              className="text-xs"
              onClick={() => handleFillTypeChange("texture")}
              data-testid="button-fill-texture"
            >
              Texture
            </Button>
          </div>

          {/* Texture controls — only when texture fill is active */}
          {selectedObj.fillType === "texture" && (
            <>
              {/* Texture picker grid grouped by category */}
              <div className="flex flex-col gap-1.5" data-testid="panel-texture-picker">
                {TEXTURE_CATEGORIES.map(cat => {
                  const textures = TEXTURE_LIBRARY.filter(t => t.category === cat.key);
                  return (
                    <div key={cat.key}>
                      <div className="text-xs text-muted-foreground mb-1">{cat.label}</div>
                      <div className="flex flex-wrap gap-1">
                        {textures.map(tex => {
                          const isSelected = selectedObj.textureId === tex.id;
                          return (
                            <button
                              key={tex.id}
                              title={tex.name}
                              data-testid={`button-texture-${tex.id}`}
                              onClick={() => handleTextureIdChange(tex.id)}
                              style={{
                                width: 36,
                                height: 36,
                                border: isSelected ? `2px solid ${tex.color}` : "2px solid transparent",
                                borderRadius: 4,
                                padding: 0,
                                cursor: "pointer",
                                position: "relative",
                                overflow: "hidden",
                                background: "transparent",
                              }}
                              aria-pressed={isSelected}
                            >
                              <svg
                                viewBox="0 0 1 1"
                                width="100%"
                                height="100%"
                                style={{ display: "block", background: `${tex.color}18` }}
                              >
                                <defs>
                                  <pattern
                                    id={`swatch-${tex.id}`}
                                    x="0" y="0"
                                    width={TEXTURE_SCALE_SIZES.medium}
                                    height={TEXTURE_SCALE_SIZES.medium}
                                    patternUnits="userSpaceOnUse"
                                  >
                                    <g
                                      transform={`scale(${TEXTURE_SCALE_SIZES.medium})`}
                                      color={tex.color}
                                      dangerouslySetInnerHTML={{ __html: getPatternSvgContent(tex.id as TextureId) }}
                                    />
                                  </pattern>
                                </defs>
                                <rect x="0" y="0" width="1" height="1" fill={`url(#swatch-${tex.id})`} />
                              </svg>
                              {isSelected && (
                                <div style={{
                                  position: "absolute", inset: 0,
                                  border: `2px solid ${tex.color}`,
                                  borderRadius: 2,
                                  pointerEvents: "none",
                                }} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Scale selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Scale</span>
                {(["small", "medium", "large"] as TextureScale[]).map(s => (
                  <Button
                    key={s}
                    size="sm"
                    variant={selectedObj.textureScale === s ? "secondary" : "ghost"}
                    className="text-xs capitalize"
                    onClick={() => handleTextureScaleChange(s)}
                    data-testid={`button-texture-scale-${s}`}
                  >
                    {s}
                  </Button>
                ))}
              </div>

              {/* Opacity slider */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Opacity</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedObj.textureOpacity ?? 0.85}
                  onChange={e => handleTextureOpacityChange(parseFloat(e.target.value))}
                  className="flex-1 h-4 accent-primary"
                  data-testid="slider-texture-opacity"
                />
                <span className="text-xs text-muted-foreground tabular-nums w-7 text-right">
                  {Math.round((selectedObj.textureOpacity ?? 0.85) * 100)}%
                </span>
              </div>

              {/* Material label input (required when texture active) */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">
                  Material label<span className="text-destructive ml-0.5">*</span>
                </span>
                <input
                  type="text"
                  value={materialLabelText}
                  onChange={e => setMaterialLabelText(e.target.value)}
                  onBlur={commitMaterialLabel}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      commitMaterialLabel();
                      e.currentTarget.blur();
                    }
                    e.stopPropagation();
                  }}
                  placeholder={getTextureDef(selectedObj.textureId ?? "")?.name ?? "e.g. Bark Mulch Refresh"}
                  className="flex-1 text-xs px-2 py-1 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  data-testid="input-material-label"
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Complexity warning */}
      {isAtLimit && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-b" data-testid="banner-markup-limit">
          <Info className="w-3 h-3 shrink-0" />
          Markup is very complex. Simplify shapes before adding more.
        </div>
      )}

      {/* Main editor area: layers | canvas | inspector */}
      <div className="flex" style={{ minHeight: "300px" }}>
        {/* Layers Panel */}
        <div className="border-r shrink-0" style={{ width: "140px" }}>
          <LayersPanel
            layers={layerDefs}
            activeLayerId={activeLayerId}
            onSetActive={setActiveLayerId}
            onToggleVisible={handleToggleVisible}
            onToggleLocked={handleToggleLocked}
          />
        </div>
        {/* Canvas */}
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
            cursor: svgCursor,
            touchAction: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          data-testid="svg-annotation-layer"
        >
          {sortedObjects
            .filter(obj => visibleObjectIds.has(obj.layerId ?? "areas"))
            .map(obj => (
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

          {selectedObj && isLayerSelectableForObj(selectedObj) && (
            <>
              {(selectedObj.type === "polygon" || selectedObj.type === "polyline") && (
                <SelectionHandles
                  obj={selectedObj}
                  onStartVertexDrag={(idx, pt) => {
                    setDrag({ kind: "vertex", id: selectedObj.id, vertexIdx: idx, startPt: pt, origPt: selectedObj.points[idx] });
                  }}
                  onStartRotate={(pt) => {
                    const bb = getBbox(selectedObj);
                    const dx = pt[0] - bb.cx;
                    const dy = pt[1] - bb.cy;
                    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                    setDrag({ kind: "rotate", id: selectedObj.id, center: [bb.cx, bb.cy], startAngle: angle, origRotation: selectedObj.rotation ?? 0 });
                  }}
                />
              )}
              {selectedObj.type === "symbol" && (
                <TransformHandles
                  obj={selectedObj}
                  onResizeStart={handleResizeStart}
                  onRotateStart={handleRotateStart}
                />
              )}
            </>
          )}

          {inProgressPoints.length > 0 && (
            <InProgressShape points={inProgressPoints} preview={previewPoint} tool={activeTool} color={activeColor} />
          )}
        </svg>

        {/* Legend overlay */}
        {legendState.enabled && (allLegendEntries.length > 0) && (
          <LegendPanel
            entries={visibleLegendEntries}
            allEntries={allLegendEntries}
            legendState={legendState}
            onLegendStateChange={handleLegendStateChange}
            containerRef={containerRef as React.RefObject<HTMLDivElement>}
          />
        )}
      </div>
    </div>
  );
}
