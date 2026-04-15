import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
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
  Ruler,
  AlertCircle,
  ImageOff,
  Map as MapIcon,
  Download,
  Sparkles,
  Tag,
  ChevronRight,
  Plus,
  Paintbrush,
  Palette,
  Save,
  BookOpen,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Group,
  Ungroup,
  List,
  Search,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  AlignStartVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  Clipboard,
  Grid3x3,
  Move,
} from "lucide-react";
import type {
  MarkupObject,
  MarkupPoint,
  SymbolType,
  MarkupDocument,
  LegendState,
  LegendEntry,
  FillType,
  TextureScale,
  LayerDefinition,
  SheetMetadata,
  CaptureParams,
  StylePreset,
  StylePresetConfig,
  SheetTemplate,
  LegendPosition,
  LegendMode,
  MarkupObjectType,
} from "@shared/schema";
import { parseMarkupData, flattenMarkupObjects, SYSTEM_LAYERS, getDefaultLayerForType } from "@shared/schema";
import { detectLegendEntries, applyLegendState, DEFAULT_LEGEND_STATE } from "@shared/legendUtils";
import { isSheetScaled, computeAreaSqFt, computeLengthFt, formatSqFt, formatLinearFt } from "@shared/measurementUtils";
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

// ─── Types ────────────────────────────────────────────────────────────────────
type ActiveTool = "select" | "polygon" | "polyline" | "text" | "stamp" | "tree" | "plant" | "boulder" | "callout";
type DashStyle = "solid" | "dashed" | "dotted";

type DragOp =
  | { kind: "move"; id: string; origPoints: MarkupPoint[]; startPt: MarkupPoint }
  | { kind: "multi-move"; ids: string[]; origPointsMap: Record<string, MarkupPoint[]>; startPt: MarkupPoint }
  | { kind: "vertex"; id: string; vertexIdx: number; startPt: MarkupPoint; origPt: MarkupPoint }
  | { kind: "rotate"; id: string; center: MarkupPoint; startAngle: number; origRotation: number }
  | { kind: "resize"; id: string; cx: number; cy: number; origScale: number; startDist: number }
  | { kind: "callout-target"; id: string; startPt: MarkupPoint; origTarget: MarkupPoint }
  | { kind: "title-block"; origPos: MarkupPoint; startPt: MarkupPoint }
  | { kind: "notes-block"; origPos: MarkupPoint; startPt: MarkupPoint }
  | { kind: "drag-box"; startPt: MarkupPoint; curPt: MarkupPoint }
  | { kind: "pan"; startClientX: number; startClientY: number; origPanX: number; origPanY: number };

interface ViewTransform {
  scale: number;
  panX: number; // px offset
  panY: number;
}

interface VisualScopeEditorProps {
  sheetId: string;
  baseImagePath: string;
  initialMarkup?: MarkupObject[];
  initialLayerDefs?: LayerDefinition[] | null;
  initialLegendState?: LegendState | null;
  initialMarkupData?: unknown;
  captureParams?: CaptureParams | null;
  onSaved?: () => void;
  onBaseImageError?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_UNDO_STEPS = 30;
const VERTEX_HIT_RADIUS = 0.018;
const MIDPOINT_HIT_RADIUS = 0.013;
const SHAPE_HIT_RADIUS = 0.022;
const CLOSE_POLYGON_RADIUS = 0.025;
const BASE_SYMBOL_SIZE = 0.04;
const HANDLE_R = 0.008;
const ROT_HANDLE_OFFSET = 0.025;
const GRID_SIZE = 0.025; // 2.5% of canvas width for snap-to-grid
const NUDGE_AMOUNT = 0.005;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const CLIPBOARD_KEY = "vse-clipboard";

const DEFAULT_SYMBOL_COLORS: Record<SymbolType, string> = {
  tree: "#2d6a2d",
  plant: "#22c55e",
  boulder: "#9ca3af",
};

const DEFAULT_LAYER_ID = "annotations";

// ─── Helper Functions ─────────────────────────────────────────────────────────
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

function snapToGrid(v: number, enabled: boolean): number {
  if (!enabled) return v;
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}

function snapPt(pt: MarkupPoint, enabled: boolean): MarkupPoint {
  if (!enabled) return pt;
  return [snapToGrid(pt[0], true), snapToGrid(pt[1], true)];
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): MarkupPoint {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const t = pt.matrixTransform(svg.getScreenCTM()!.inverse());
  return [clamp01(t.x), clamp01(t.y)];
}

function clientToSvgRaw(svg: SVGSVGElement, clientX: number, clientY: number): MarkupPoint {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const t = pt.matrixTransform(svg.getScreenCTM()!.inverse());
  return [t.x, t.y];
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

function getMultiSelectBBox(objs: MarkupObject[]): BBox | null {
  if (objs.length === 0) return null;
  const bboxes = objs.map(getBbox);
  const x1 = Math.min(...bboxes.map(b => b.x1));
  const y1 = Math.min(...bboxes.map(b => b.y1));
  const x2 = Math.max(...bboxes.map(b => b.x2));
  const y2 = Math.max(...bboxes.map(b => b.y2));
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
  if (obj.type === "callout") {
    const BADGE_R = 0.028;
    if (distance(pt, obj.points[0]) < BADGE_R + 0.015) return true;
    if (obj.points.length > 1 && distance(pt, obj.points[1]) < 0.02) return true;
    if (obj.points.length > 1) {
      if (pointToSegmentDistance(pt, obj.points[0], obj.points[1]) < SHAPE_HIT_RADIUS) return true;
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

function bboxIntersects(bb: BBox, boxStart: MarkupPoint, boxEnd: MarkupPoint): boolean {
  const minX = Math.min(boxStart[0], boxEnd[0]);
  const maxX = Math.max(boxStart[0], boxEnd[0]);
  const minY = Math.min(boxStart[1], boxEnd[1]);
  const maxY = Math.max(boxStart[1], boxEnd[1]);
  return bb.x2 >= minX && bb.x1 <= maxX && bb.y2 >= minY && bb.y1 <= maxY;
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

function migrateObjects(objects: unknown): MarkupObject[] {
  if (!Array.isArray(objects)) return [];
  return (objects as MarkupObject[]).map(obj => ({
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

function getObjectDisplayName(obj: MarkupObject): string {
  if (obj.name) return obj.name;
  if (obj.label && obj.label !== "Label") return obj.label;
  if (obj.type === "symbol") {
    const def = resolveSymbolDef(obj);
    if (def) return def.name;
    return obj.symbolType ?? "Symbol";
  }
  const typeLabels: Record<string, string> = {
    polygon: "Area",
    polyline: "Line",
    text: "Text",
    callout: `Callout #${obj.calloutNumber ?? ""}`,
    symbol: "Symbol",
  };
  return typeLabels[obj.type] ?? obj.type;
}

// ─── Clipboard (cross-sheet) ───────────────────────────────────────────────────
function setClipboard(objects: MarkupObject[]): void {
  try {
    localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(objects));
  } catch {}
}

function getClipboard(): MarkupObject[] {
  try {
    const raw = localStorage.getItem(CLIPBOARD_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data as MarkupObject[];
  } catch {
    return [];
  }
}

// ─── Symbol SVG Primitive Renderer ────────────────────────────────────────────
function SymbolPrimitiveEl({ shape, color, sw }: { shape: SymbolPrimitive; color: string; sw: number }) {
  const fill = shape.kind !== "line" && shape.kind !== "polyline" && (shape as any).filled ? color : "none";
  const stroke = shape.kind === "line" || shape.kind === "polyline" || !(shape as any).filled ? color : "none";

  if (shape.kind === "circle") {
    return <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill={fill} stroke={stroke} strokeWidth={sw} />;
  }
  if (shape.kind === "ellipse") {
    const transform = shape.rot ? `rotate(${shape.rot} ${shape.cx} ${shape.cy})` : undefined;
    return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill={fill} stroke={stroke} strokeWidth={sw} transform={transform} />;
  }
  if (shape.kind === "polygon") {
    const pts = shape.pts.map(([x, y]) => `${x},${y}`).join(" ");
    return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />;
  }
  if (shape.kind === "polyline") {
    const pts = shape.pts.map(([x, y]) => `${x},${y}`).join(" ");
    return <polyline points={pts} fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />;
  }
  if (shape.kind === "line") {
    return <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={color} strokeWidth={sw} strokeLinecap="round" />;
  }
  if (shape.kind === "rect") {
    return <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} fill={fill} stroke={stroke} strokeWidth={sw} />;
  }
  return null;
}

function SymbolIcon({ def, size = 48, color }: { def: SymbolDefinition; size?: number; color?: string }) {
  const c = color ?? def.defaultColor;
  const sw = 0.08;
  return (
    <svg width={size} height={size} viewBox="-1 -1 2 2" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      {def.shapes.map((shape, i) => <SymbolPrimitiveEl key={i} shape={shape} color={c} sw={sw} />)}
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
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

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
        position: "absolute", left, top, transform: "translate(-50%, -50%)",
        fontSize: "13px", border: "1.5px solid #f59e0b", borderRadius: "4px",
        padding: "4px 8px", background: "white", zIndex: 20,
        minWidth: "120px", minHeight: "40px", outline: "none",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)", resize: "both", fontFamily: "inherit",
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
  const sw = (obj.strokeWidth || 2) / 1000;
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
  const tipX = targetPos[0], tipY = targetPos[1];
  const arrBaseX = tipX + nx * arrLen, arrBaseY = tipY + ny * arrLen;
  const perpX = -ny, perpY = nx;
  const arrowPoints = [`${tipX},${tipY}`, `${arrBaseX + perpX * arrW},${arrBaseY + perpY * arrW}`, `${arrBaseX - perpX * arrW},${arrBaseY - perpY * arrW}`].join(" ");
  const num = obj.calloutNumber ?? 1;
  const label = obj.label ?? "";

  return (
    <g opacity={opacity}>
      {len > BADGE_R * 0.5 && (
        <>
          <line x1={lineEndX} y1={lineEndY} x2={targetPos[0] + nx * arrLen} y2={targetPos[1] + ny * arrLen}
            stroke={lineColor} strokeWidth={sw} strokeDasharray={da} strokeLinecap="round" />
          <polygon points={arrowPoints} fill={lineColor} />
        </>
      )}
      <circle cx={badgePos[0]} cy={badgePos[1]} r={BADGE_R} fill={selected ? "#f59e0b" : "#1d4ed8"}
        stroke="white" strokeWidth={0.003} style={{ cursor: "grab" }}
        onPointerDown={e => { e.stopPropagation(); onBadgePointerDown(e); }}
        data-testid={`callout-badge-${obj.id}`} />
      <text x={badgePos[0]} y={badgePos[1]} fontSize={BADGE_R * 1.1} fill="white"
        textAnchor="middle" dominantBaseline="central" fontWeight="bold"
        style={{ userSelect: "none", pointerEvents: "none" }}>{num}</text>
      {label && (
        <text x={badgePos[0] + BADGE_R + 0.008} y={badgePos[1]} fontSize={0.022} fill={lineColor}
          dominantBaseline="middle" style={{ userSelect: "none", pointerEvents: "none" }}>
          {label.length > 25 ? label.slice(0, 25) + "…" : label}
        </text>
      )}
      {selected && obj.points.length > 1 && (
        <circle cx={targetPos[0]} cy={targetPos[1]} r={0.015} fill="#ef4444" stroke="white" strokeWidth={0.002}
          style={{ cursor: "grab" }} onPointerDown={e => { e.stopPropagation(); onTargetPointerDown(e); }}
          data-testid={`callout-target-${obj.id}`} />
      )}
      {selected && (
        <circle cx={badgePos[0]} cy={badgePos[1]} r={BADGE_R + 0.01} fill="none" stroke="#f59e0b"
          strokeWidth={0.003} strokeDasharray="0.006,0.003" style={{ pointerEvents: "none" }} />
      )}
    </g>
  );
}

function makePatternId(obj: MarkupObject) { return `tex-${obj.id}`; }

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
      <pattern id={patId} x="0" y="0" width={tileSize} height={tileSize} patternUnits="userSpaceOnUse">
        <g transform={`scale(${tileSize})`} color={texDef.color} dangerouslySetInnerHTML={{ __html: content }} />
      </pattern>
    </defs>
  );
}

interface MarkupShapeProps {
  obj: MarkupObject;
  selected: boolean;
  multiSelected: boolean;
  selectedVertexIdx: number | null;
  hoveredMidEdge: number | null;
  onVertexPointerDown: (idx: number, e: React.PointerEvent) => void;
  onMidpointClick: (edgeIdx: number, e: React.PointerEvent) => void;
  onVertexClick: (idx: number) => void;
  onCalloutBadgePointerDown: (obj: MarkupObject, e: React.PointerEvent) => void;
  onCalloutTargetPointerDown: (obj: MarkupObject, e: React.PointerEvent) => void;
}

const MarkupShape = memo(function MarkupShape({
  obj, selected, multiSelected, selectedVertexIdx, hoveredMidEdge,
  onVertexPointerDown, onMidpointClick, onVertexClick,
  onCalloutBadgePointerDown, onCalloutTargetPointerDown,
}: MarkupShapeProps) {
  const sw = obj.strokeWidth / 1000;
  const bb = getBbox(obj);
  const rotation = obj.rotation ?? 0;
  const rotTransform = rotation ? `rotate(${rotation} ${bb.cx} ${bb.cy})` : undefined;
  const selRing = "#f59e0b";
  const multiSelRing = "#3b82f6";
  const selSw = 0.003;
  const opacity = obj.opacity ?? 1;
  const da = dashArray(obj.dashStyle, obj.strokeWidth);

  if (obj.type === "callout") {
    return (
      <CalloutShape obj={obj} selected={selected}
        onBadgePointerDown={e => onCalloutBadgePointerDown(obj, e)}
        onTargetPointerDown={e => onCalloutTargetPointerDown(obj, e)} />
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
          <circle key={`mid-${i}`} cx={mp[0]} cy={mp[1]}
            r={isHovered ? MIDPOINT_HIT_RADIUS : MIDPOINT_HIT_RADIUS * 0.7}
            fill={isHovered ? "#3b82f6" : "rgba(59,130,246,0.5)"}
            style={{ cursor: "pointer" }}
            onPointerDown={e => { e.stopPropagation(); onMidpointClick(i, e); }}
            data-testid={`handle-midpoint-${obj.id}-${i}`} />
        );
      }
    }
    return (
      <g transform={rotTransform} opacity={opacity}>
        {isTexture && <PolygonTextureDef obj={obj} />}
        {isTexture ? (
          <>
            <polygon points={pts} stroke="none" fill={obj.fillColor} fillOpacity={0.12} strokeWidth={0} />
            <polygon points={pts} stroke={obj.strokeColor} fill={`url(#${patId})`} fillOpacity={texOpacity} strokeWidth={sw} strokeLinejoin="round" strokeDasharray={da} />
          </>
        ) : (
          <polygon points={pts} stroke={obj.strokeColor} fill={obj.fillColor} strokeWidth={sw} strokeLinejoin="round" strokeDasharray={da} />
        )}
        {(selected || multiSelected) && (
          <polygon points={pts} fill="none" stroke={selected ? selRing : multiSelRing} strokeWidth={selSw} strokeDasharray="0.006,0.003" style={{ pointerEvents: "none" }} />
        )}
        {selected && edges}
        {selected && obj.points.map((p, i) => (
          <circle key={`v-${i}`} cx={p[0]} cy={p[1]} r={VERTEX_HIT_RADIUS}
            fill={selectedVertexIdx === i ? "#ef4444" : selRing}
            stroke="white" strokeWidth={0.002} style={{ cursor: "grab" }}
            onPointerDown={e => { e.stopPropagation(); onVertexPointerDown(i, e); }}
            onClick={e => { e.stopPropagation(); onVertexClick(i); }}
            data-testid={`handle-vertex-${obj.id}-${i}`} />
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
          <circle key={`mid-${i}`} cx={mp[0]} cy={mp[1]}
            r={isHovered ? MIDPOINT_HIT_RADIUS : MIDPOINT_HIT_RADIUS * 0.7}
            fill={isHovered ? "#3b82f6" : "rgba(59,130,246,0.5)"}
            style={{ cursor: "pointer" }}
            onPointerDown={e => { e.stopPropagation(); onMidpointClick(i, e); }}
            data-testid={`handle-midpoint-${obj.id}-${i}`} />
        );
      }
    }
    return (
      <g transform={rotTransform} opacity={opacity}>
        <polyline points={toSvgPoints(obj.points)} stroke={obj.strokeColor} fill="none" strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={da} />
        <polyline points={toSvgPoints(obj.points)} stroke="transparent" fill="none" strokeWidth={sw + 0.015} strokeLinecap="round" strokeLinejoin="round" />
        {(selected || multiSelected) && (
          <polyline points={toSvgPoints(obj.points)} fill="none" stroke={selected ? selRing : multiSelRing} strokeWidth={selSw} strokeDasharray="0.006,0.003" style={{ pointerEvents: "none" }} />
        )}
        {selected && edges}
        {selected && obj.points.map((p, i) => (
          <circle key={`v-${i}`} cx={p[0]} cy={p[1]} r={VERTEX_HIT_RADIUS}
            fill={selectedVertexIdx === i ? "#ef4444" : selRing}
            stroke="white" strokeWidth={0.002} style={{ cursor: "grab" }}
            onPointerDown={e => { e.stopPropagation(); onVertexPointerDown(i, e); }}
            onClick={e => { e.stopPropagation(); onVertexClick(i); }}
            data-testid={`handle-vertex-${obj.id}-${i}`} />
        ))}
      </g>
    );
  }

  if (obj.type === "symbol") {
    const [cx, cy] = obj.points[0];
    const scale = obj.scale ?? 1;
    const rot = obj.rotation ?? 0;
    const hs = BASE_SYMBOL_SIZE * scale;
    const def = resolveSymbolDef(obj);
    const color = obj.strokeColor;
    const symSw = 0.08;
    return (
      <g opacity={opacity}>
        <g transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${hs})`}>
          {def ? def.shapes.map((shape, i) => <SymbolPrimitiveEl key={i} shape={shape} color={color} sw={symSw} />) : <circle cx="0" cy="0" r="0.7" fill={color} />}
        </g>
        {obj.showLabel && obj.label && (
          <text x={cx} y={cy + hs + 0.018} fontSize={0.018} fill={color} dominantBaseline="hanging" textAnchor="middle" style={{ userSelect: "none" }}>{obj.label}</text>
        )}
        {(selected || multiSelected) && (
          <rect x={cx - hs} y={cy - hs} width={hs * 2} height={hs * 2}
            fill="none" stroke={selected ? selRing : multiSelRing} strokeWidth={selSw} strokeDasharray="0.006,0.004" />
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
          <text key={i} x={x} y={y + i * lineH - ((lines.length - 1) * lineH) / 2}
            fontSize={fontSize} fill={obj.strokeColor} dominantBaseline="middle"
            textAnchor={textAnchor} style={{ userSelect: "none" }}>{line || " "}</text>
        ))}
        {(selected || multiSelected) && (
          <rect x={x - (textAnchor === "middle" ? 0.1 : textAnchor === "end" ? 0.2 : 0)} y={y - fontSize * lines.length * 0.7}
            width={0.2} height={fontSize * lines.length * 1.5} fill="none"
            stroke={selected ? selRing : multiSelRing} strokeWidth={selSw} rx={0.005} />
        )}
      </g>
    );
  }

  return null;
});

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
    [cx - hs, cy - hs], [cx + hs, cy - hs], [cx + hs, cy + hs], [cx - hs, cy + hs],
  ];
  const rotHandleY = cy - hs - ROT_HANDLE_OFFSET;
  return (
    <g>
      <line x1={cx} y1={cy - hs} x2={cx} y2={rotHandleY} stroke="#f59e0b" strokeWidth={0.002} strokeDasharray="0.004,0.003" style={{ pointerEvents: "none" }} />
      <circle cx={cx} cy={rotHandleY} r={HANDLE_R * 1.3} fill="#f59e0b" stroke="white" strokeWidth={0.002}
        style={{ cursor: "grab" }} onPointerDown={e => { e.stopPropagation(); onRotateStart(e, cx, cy); }} data-testid="handle-rotate" />
      {corners.map(([hx, hy], i) => (
        <rect key={i} x={hx - HANDLE_R} y={hy - HANDLE_R} width={HANDLE_R * 2} height={HANDLE_R * 2}
          fill="white" stroke="#f59e0b" strokeWidth={0.002} style={{ cursor: "nwse-resize" }}
          onPointerDown={e => { e.stopPropagation(); const dist = distance([hx, hy], [cx, cy]); onResizeStart(e, cx, cy, scale, dist); }}
          data-testid={`handle-resize-${i}`} />
      ))}
    </g>
  );
}

// ─── In-progress shape ───────────────────────────────────────────────────────
function InProgressShape({ points, preview, tool, color }: { points: MarkupPoint[]; preview: MarkupPoint | null; tool: ActiveTool; color: string; }) {
  const all = preview ? [...points, preview] : points;
  if (all.length < 1) return null;
  if (tool === "callout") {
    if (points.length === 1 && preview) {
      return (
        <g>
          <line x1={points[0][0]} y1={points[0][1]} x2={preview[0]} y2={preview[1]} stroke={color} strokeWidth={0.002} strokeDasharray="0.005,0.003" />
          <circle cx={points[0][0]} cy={points[0][1]} r={0.025} fill={color} opacity={0.5} />
        </g>
      );
    }
    return <g><circle cx={points[0]?.[0] ?? 0.5} cy={points[0]?.[1] ?? 0.5} r={0.025} fill={color} opacity={0.5} /></g>;
  }
  return (
    <g>
      {all.length >= 2 && <polyline points={toSvgPoints(all)} stroke={color} strokeWidth={0.002} strokeDasharray="0.005,0.003" fill="none" strokeLinecap="round" />}
      {tool === "polygon" && points.length >= 3 && preview && (
        <line x1={preview[0]} y1={preview[1]} x2={points[0][0]} y2={points[0][1]} stroke={color} strokeWidth={0.002} strokeDasharray="0.005,0.003" />
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
  return [clamp01(t.x), clamp01(t.y)];
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

// ─── Layers Panel ─────────────────────────────────────────────────────────────
interface LayersPanelProps {
  layers: LayerDefinition[];
  activeLayerId: string;
  onSetActive: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLocked: (id: string) => void;
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
            <div key={layer.id}
              className={`flex items-center gap-1 px-2 py-1 cursor-pointer hover-elevate text-xs ${isActive ? "bg-accent/60 font-semibold" : ""}`}
              onClick={() => { if (!layer.locked) onSetActive(layer.id); }}
              data-testid={`layer-row-${layer.id}`}>
              <Button size="icon" variant="ghost" className="w-5 h-5 shrink-0"
                onClick={e => { e.stopPropagation(); onToggleVisible(layer.id); }}
                title={layer.visible ? "Hide layer" : "Show layer"}
                data-testid={`button-layer-visibility-${layer.id}`} disabled={isBase}>
                {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-muted-foreground" />}
              </Button>
              <Button size="icon" variant="ghost" className="w-5 h-5 shrink-0"
                onClick={e => { e.stopPropagation(); if (!isBase) onToggleLocked(layer.id); }}
                title={layer.locked ? "Unlock layer" : "Lock layer"}
                data-testid={`button-layer-lock-${layer.id}`} disabled={isBase}>
                {layer.locked ? <Lock className="w-3 h-3 text-muted-foreground" /> : <Unlock className="w-3 h-3" />}
              </Button>
              <span className={`truncate flex-1 ${!layer.visible ? "text-muted-foreground line-through" : ""}`} title={layer.name}>{layer.name}</span>
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" title="Active layer" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Object Inspector ─────────────────────────────────────────────────────────
interface ObjectInspectorProps {
  obj: MarkupObject;
  onChange: (updates: Partial<MarkupObject>) => void;
  onDelete: () => void;
}

function ObjectInspector({ obj, onChange, onDelete }: ObjectInspectorProps) {
  return (
    <div className="flex flex-col gap-0" data-testid="panel-inspector">
      <div className="flex items-center justify-between px-2 py-1.5 border-b bg-muted/30">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inspector</span>
        <Button size="icon" variant="ghost" className="w-5 h-5 text-destructive" onClick={onDelete} data-testid="button-inspector-delete" title="Delete object">
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
      <div className="px-2 py-2 space-y-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Name / Label</Label>
          <Input className="h-7 text-xs" value={obj.name ?? ""} onChange={e => onChange({ name: e.target.value })} onKeyDown={e => e.stopPropagation()} placeholder="Optional name" data-testid="input-inspector-name" />
        </div>
        {obj.type === "polygon" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Fill Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={obj.strokeColor} onChange={e => { const c = e.target.value; onChange({ strokeColor: c, fillColor: hexToRgba(c, 0.15) }); }} className="w-7 h-7 rounded border border-border cursor-pointer" data-testid="input-inspector-fill-color" />
                <span className="text-xs text-muted-foreground">{obj.strokeColor}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Fill Opacity</Label>
              <Input type="number" className="h-7 text-xs" min={0} max={1} step={0.05}
                value={(() => { const m = obj.fillColor?.match(/rgba\([^,]+,[^,]+,[^,]+,([^)]+)\)/); return m ? parseFloat(m[1]).toFixed(2) : "0.15"; })()}
                onChange={e => { const alpha = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)); onChange({ fillColor: hexToRgba(obj.strokeColor, alpha) }); }}
                onKeyDown={e => e.stopPropagation()} data-testid="input-inspector-fill-opacity" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Stroke Width</Label>
              <Input type="number" className="h-7 text-xs" min={1} max={20} value={obj.strokeWidth} onChange={e => onChange({ strokeWidth: parseInt(e.target.value) || 2 })} onKeyDown={e => e.stopPropagation()} data-testid="input-inspector-stroke-width" />
            </div>
          </>
        )}
        {obj.type === "polyline" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Stroke Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={obj.strokeColor} onChange={e => onChange({ strokeColor: e.target.value })} className="w-7 h-7 rounded border border-border cursor-pointer" data-testid="input-inspector-polyline-color" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Stroke Width</Label>
              <Input type="number" className="h-7 text-xs" min={1} max={20} value={obj.strokeWidth} onChange={e => onChange({ strokeWidth: parseInt(e.target.value) || 2 })} onKeyDown={e => e.stopPropagation()} data-testid="input-inspector-polyline-stroke-width" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Dash Style</Label>
              <Select value={obj.dashStyle ?? "solid"} onValueChange={v => onChange({ dashStyle: v as DashStyle })}>
                <SelectTrigger className="h-7 text-xs" data-testid="select-inspector-dash-style"><SelectValue /></SelectTrigger>
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
              <Input className="h-7 text-xs" value={obj.label ?? ""} onChange={e => onChange({ label: e.target.value || "Label" })} onKeyDown={e => e.stopPropagation()} data-testid="input-inspector-text-content" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={obj.strokeColor} onChange={e => onChange({ strokeColor: e.target.value })} className="w-7 h-7 rounded border border-border cursor-pointer" data-testid="input-inspector-text-color" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Font Size</Label>
              <Input type="number" className="h-7 text-xs" min={8} max={80} value={obj.fontSize ?? 25} onChange={e => onChange({ fontSize: parseInt(e.target.value) || 25 })} onKeyDown={e => e.stopPropagation()} data-testid="input-inspector-font-size" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Rotation (°)</Label>
              <Input type="number" className="h-7 text-xs" min={-180} max={180} value={obj.rotation ?? 0} onChange={e => onChange({ rotation: parseInt(e.target.value) || 0 })} onKeyDown={e => e.stopPropagation()} data-testid="input-inspector-text-rotation" />
            </div>
          </>
        )}
        {obj.type === "symbol" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={obj.strokeColor} onChange={e => onChange({ strokeColor: e.target.value, fillColor: e.target.value })} className="w-7 h-7 rounded border border-border cursor-pointer" data-testid="input-inspector-symbol-color" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Rotation (°)</Label>
              <Input type="number" className="h-7 text-xs" min={-180} max={180} value={obj.rotation ?? 0} onChange={e => onChange({ rotation: parseInt(e.target.value) || 0 })} onKeyDown={e => e.stopPropagation()} data-testid="input-inspector-symbol-rotation" />
            </div>
          </>
        )}
        <div className="pt-1 text-xs text-muted-foreground capitalize">Type: {obj.type}</div>
      </div>
    </div>
  );
}

// ─── Object List Panel ────────────────────────────────────────────────────────
interface ObjectListPanelProps {
  objects: MarkupObject[];
  selectedId: string | null;
  multiSelectedIds: Set<string>;
  layerDefs: LayerDefinition[];
  onSelect: (id: string, shift: boolean) => void;
  onToggleVisibility: (id: string) => void;
  onClose: () => void;
}

function ObjectListPanel({ objects, selectedId, multiSelectedIds, layerDefs, onSelect, onToggleVisibility, onClose }: ObjectListPanelProps) {
  const [search, setSearch] = useState("");
  const layerMap = new Map(layerDefs.map(l => [l.id, l]));

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return [...objects].reverse();
    return [...objects].reverse().filter(o => {
      const name = getObjectDisplayName(o).toLowerCase();
      return name.includes(q) || o.type.includes(q);
    });
  }, [objects, search]);

  return (
    <div className="flex flex-col h-full" data-testid="panel-object-list">
      <div className="flex items-center justify-between px-2 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-1.5">
          <List className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objects</span>
        </div>
        <Button size="icon" variant="ghost" className="w-5 h-5" onClick={onClose} data-testid="button-object-list-close">
          <X className="w-3 h-3" />
        </Button>
      </div>
      <div className="px-2 py-1.5 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            className="h-7 text-xs pl-7"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.stopPropagation()}
            placeholder="Search objects..."
            data-testid="input-object-list-search"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center italic">No objects found</div>
          )}
          {filtered.map(obj => {
            const isSelected = selectedId === obj.id || multiSelectedIds.has(obj.id);
            const layer = layerMap.get(obj.layerId ?? "areas");
            const def = obj.type === "symbol" ? resolveSymbolDef(obj) : undefined;
            return (
              <div
                key={obj.id}
                className={`flex items-center gap-2 px-2 py-1 cursor-pointer hover-elevate text-xs ${isSelected ? "bg-accent/60" : ""}`}
                onClick={e => onSelect(obj.id, e.shiftKey)}
                data-testid={`object-list-row-${obj.id}`}
              >
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  {obj.type === "symbol" && def ? (
                    <SymbolIcon def={def} color={obj.strokeColor} size={16} />
                  ) : obj.type === "polygon" ? (
                    <div className="w-3.5 h-3.5 rounded-sm border" style={{ background: obj.fillColor?.startsWith("rgba") ? obj.fillColor : obj.fillColor, borderColor: obj.strokeColor }} />
                  ) : obj.type === "polyline" ? (
                    <div className="w-3.5 h-0.5 rounded" style={{ background: obj.strokeColor }} />
                  ) : obj.type === "text" ? (
                    <span style={{ color: obj.strokeColor, fontSize: 10, fontWeight: "bold" }}>T</span>
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#1d4ed8" }} />
                  )}
                </div>
                <span className="flex-1 truncate" title={getObjectDisplayName(obj)}>{getObjectDisplayName(obj)}</span>
                <span className="text-muted-foreground shrink-0" style={{ fontSize: 9 }}>{layer?.name ?? ""}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-5 h-5 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={e => { e.stopPropagation(); onToggleVisibility(obj.id); }}
                  title="Toggle visibility"
                  data-testid={`button-object-visibility-${obj.id}`}
                  style={{ opacity: isSelected ? 1 : undefined }}
                >
                  <Eye className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      <div className="px-2 py-1 border-t text-xs text-muted-foreground">
        {objects.length} object{objects.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

// ─── Symbol Library Panel ─────────────────────────────────────────────────────
function SymbolLibrary({ onSelect }: { onSelect: (def: SymbolDefinition) => void }) {
  const [activeTab, setActiveTab] = useState<SymbolCategory>("trees");
  return (
    <div className="flex flex-col gap-3">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SymbolCategory)}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          {SYMBOL_CATEGORIES.map(cat => (
            <TabsTrigger key={cat.id} value={cat.id} className="text-xs" data-testid={`tab-symbol-cat-${cat.id}`}>{cat.label}</TabsTrigger>
          ))}
        </TabsList>
        {SYMBOL_CATEGORIES.map(cat => (
          <TabsContent key={cat.id} value={cat.id}>
            <ScrollArea className="h-80">
              <div className="grid grid-cols-3 gap-2 p-2">
                {getSymbolsByCategory(cat.id).map(def => (
                  <Tooltip key={def.id}>
                    <TooltipTrigger asChild>
                      <button className="flex flex-col items-center gap-1.5 p-2 rounded-md border border-transparent hover-elevate active-elevate-2 text-center focus:outline-none focus:ring-2 focus:ring-ring"
                        onClick={() => onSelect(def)} data-testid={`button-symbol-${def.id}`} type="button">
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

// ─── Legend Components ────────────────────────────────────────────────────────
type Corner = LegendState["position"];

function getCornerCls(pos: Corner): string {
  switch (pos) {
    case "top-left": return "top-3 left-3";
    case "top-right": return "top-3 right-3";
    case "bottom-left": return "bottom-3 left-3";
    case "bottom-right": return "bottom-3 right-3";
  }
}

function resolveDefFromEntry(entry: LegendEntry): SymbolDefinition | undefined {
  if (entry.symbolType) {
    const mapped = LEGACY_SYMBOL_MAP[entry.symbolType];
    if (mapped) return SYMBOL_MAP.get(mapped);
  }
  return undefined;
}

function LegendPanel({ entries, legendState, onLegendStateChange, containerRef }: {
  entries: LegendEntry[];
  allEntries: LegendEntry[];
  legendState: LegendState;
  onLegendStateChange: (ls: LegendState) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const positionCls = getCornerCls(legendState.position);
  return (
    <div className={`absolute ${positionCls} bg-background/90 backdrop-blur-sm border rounded-md shadow-md p-2 text-xs min-w-[140px] max-w-[200px] z-10`} data-testid="panel-legend">
      {legendState.title && <div className="font-semibold text-sm mb-1 border-b pb-1">{legendState.title}</div>}
      <div className="space-y-1">
        {entries.map(e => (
          <div key={e.id} className="flex items-center gap-2">
            {e.kind === "symbol" && resolveDefFromEntry(e) ? (
              <SymbolIcon def={resolveDefFromEntry(e)!} color={e.color} size={12} />
            ) : e.color ? (
              <div className="w-3 h-3 rounded-sm shrink-0 border" style={{ backgroundColor: e.color }} />
            ) : null}
            <span className="text-muted-foreground flex-1 truncate">{legendState.customLabels?.[e.id] ?? e.label}</span>
            {e.count !== undefined && legendState.showSymbolCounts && <span className="font-medium">{e.count}</span>}
          </div>
        ))}
        {entries.length === 0 && <div className="text-muted-foreground italic">No entries</div>}
      </div>
    </div>
  );
}

function LegendSettings({ legendState, onLegendStateChange }: { legendState: LegendState; onLegendStateChange: (ls: LegendState) => void; }) {
  return (
    <div className="p-3 space-y-2 text-sm min-w-[200px]">
      <div>
        <Label className="text-xs text-muted-foreground block mb-1">Position</Label>
        <Select value={legendState.position} onValueChange={v => onLegendStateChange({ ...legendState, position: v as LegendState["position"] })}>
          <SelectTrigger data-testid="select-legend-position" className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="top-left">Top Left</SelectItem>
            <SelectItem value="top-right">Top Right</SelectItem>
            <SelectItem value="bottom-left">Bottom Left</SelectItem>
            <SelectItem value="bottom-right">Bottom Right</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground block mb-1">Mode</Label>
        <Select value={legendState.mode} onValueChange={v => onLegendStateChange({ ...legendState, mode: v as LegendState["mode"] })}>
          <SelectTrigger data-testid="select-legend-mode" className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="compact">Compact</SelectItem>
            <SelectItem value="expanded">Expanded</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={legendState.showSymbolCounts} onChange={() => onLegendStateChange({ ...legendState, showSymbolCounts: !legendState.showSymbolCounts })} data-testid="checkbox-legend-show-counts" />
        <span className="text-xs">Show symbol counts</span>
      </label>
    </div>
  );
}

// ─── Title / Notes Block SVG ──────────────────────────────────────────────────
function TitleBlockSvg({ meta, pos, onPointerDown }: { meta: SheetMetadata; pos: MarkupPoint; onPointerDown: (e: React.PointerEvent<SVGGElement>) => void }) {
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
    <g style={{ cursor: "move" }} onPointerDown={onPointerDown} data-testid="title-block-svg">
      <rect x={x} y={y} width={w} height={h} fill="rgba(255,255,255,0.92)" stroke="rgba(0,0,0,0.25)" strokeWidth={0.002} rx={0.006} />
      <text x={x + pad} y={y + pad + titleFontSize * 0.85} fontSize={titleFontSize} fontWeight="bold" fill="#111" style={{ userSelect: "none" }}>{rows[0]}</text>
      {rows.slice(1).map((row, i) => (
        <text key={i} x={x + pad} y={y + pad + titleFontSize + (i + 1) * lineH - lineH * 0.2} fontSize={bodyFontSize} fill="#444" style={{ userSelect: "none" }}>{row}</text>
      ))}
    </g>
  );
}

function NotesBlockSvg({ meta, pos, onPointerDown }: { meta: SheetMetadata; pos: MarkupPoint; onPointerDown: (e: React.PointerEvent<SVGGElement>) => void }) {
  const [x, y] = pos;
  const content = meta.notesContent || "";
  const lines = content.split("\n").filter(l => l.trim() !== "");
  const w = 0.3;
  const lineH = 0.018;
  const pad = 0.012;
  const titleH = 0.018;
  const h = pad * 2 + titleH + pad * 0.5 + lines.length * lineH;
  return (
    <g style={{ cursor: "move" }} onPointerDown={onPointerDown} data-testid="notes-block-svg">
      <rect x={x} y={y} width={w} height={Math.max(h, pad * 3 + titleH)} fill="rgba(255,255,255,0.92)" stroke="rgba(0,0,0,0.25)" strokeWidth={0.002} rx={0.006} />
      <text x={x + pad} y={y + pad + titleH * 0.85} fontSize={titleH} fontWeight="bold" fill="#111" style={{ userSelect: "none" }}>Notes</text>
      {lines.map((line, i) => {
        const isBullet = line.startsWith("•") || line.startsWith("-");
        const text = isBullet ? (line.startsWith("-") ? "• " + line.slice(1).trimStart() : line) : line;
        return (
          <text key={i} x={x + pad} y={y + pad + titleH + pad * 0.5 + i * lineH + lineH * 0.8} fontSize={0.011} fill="#333" style={{ userSelect: "none" }}>
            {text.length > 40 ? text.slice(0, 40) + "…" : text}
          </text>
        );
      })}
    </g>
  );
}

const LAYOUT_PRESETS = {
  proposal_exhibit: { label: "Proposal Exhibit", titleBlockPosition: [0.02, 0.82] as MarkupPoint, notesBlockPosition: [0.72, 0.82] as MarkupPoint },
  scope_plan: { label: "Scope Plan", titleBlockPosition: [0.02, 0.02] as MarkupPoint, notesBlockPosition: [0.02, 0.82] as MarkupPoint },
  internal_planning: { label: "Internal Planning", titleBlockPosition: [0.72, 0.02] as MarkupPoint, notesBlockPosition: [0.72, 0.55] as MarkupPoint },
};

// ─── Main Editor Component ────────────────────────────────────────────────────
export default function VisualScopeEditor({
  sheetId, baseImagePath, initialMarkup, initialLayerDefs, initialLegendState, initialMarkupData, captureParams, onSaved, onBaseImageError,
}: VisualScopeEditorProps) {
  const { t } = useTranslation();

  // Core state
  const [objects, setObjects] = useState<MarkupObject[]>(() => migrateObjects(initialMarkup ?? flattenMarkupObjects(initialMarkupData)));
  const [layerDefs, setLayerDefs] = useState<LayerDefinition[]>(() => mergeLayerDefs(initialLayerDefs));
  const [activeLayerId, setActiveLayerId] = useState<string>("areas");
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [activeSymbolId, setActiveSymbolId] = useState<string>("deciduous-tree");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
  const [selectedVertexIdx, setSelectedVertexIdx] = useState<number | null>(null);
  const [activeColor, setActiveColor] = useState<string>("#1a4d1a");
  const [inProgressPoints, setInProgressPoints] = useState<MarkupPoint[]>([]);
  const [previewPoint, setPreviewPoint] = useState<MarkupPoint | null>(null);
  const [drag, setDrag] = useState<DragOp | null>(null);
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
  const [showObjectList, setShowObjectList] = useState(false);
  const [sheetMeta, setSheetMeta] = useState<SheetMetadata>(() => (parseMarkupData(initialMarkupData).sheetMeta ?? {}));
  const [showMeasurementLabels, setShowMeasurementLabels] = useState(false);
  const [takeoffOpen, setTakeoffOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"png" | "pdf">("png");
  const [exportResolution, setExportResolution] = useState<"standard" | "high">("standard");
  const [exportPreset, setExportPreset] = useState<"standard" | "clean" | "internal">("standard");
  const [exportBrandingEnabled, setExportBrandingEnabled] = useState(false);
  const [exportCompanyName, setExportCompanyName] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [baseImageError, setBaseImageError] = useState(false);

  // Zoom / pan state
  const [viewTransform, setViewTransform] = useState<ViewTransform>({ scale: 1, panX: 0, panY: 0 });
  const [isPanMode, setIsPanMode] = useState(false); // spacebar held
  const spacebarHeld = useRef(false);

  // Snap state
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(false);

  const { toast } = useToast();
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [showPresetsPanel, setShowPresetsPanel] = useState(true);
  const [savePresetName, setSavePresetName] = useState("");
  const [savePresetCategory, setSavePresetCategory] = useState("general");
  const [showSavePresetDialog, setShowSavePresetDialog] = useState(false);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");

  const { data: stylePresetsData } = useQuery<StylePreset[]>({
    queryKey: ["/api/style-presets"],
  });
  const stylePresetList = stylePresetsData ?? [];

  const { data: sheetTemplatesData, refetch: refetchTemplates } = useQuery<SheetTemplate[]>({
    queryKey: ["/api/sheet-templates"],
  });
  const sheetTemplateList = sheetTemplatesData ?? [];

  const activePreset = activePresetId ? stylePresetList.find(p => p.id === activePresetId) ?? null : null;

  const hasUserEdited = useRef(false);
  const legendUserEdited = useRef(false);
  const undoStack = useRef<{ objects: MarkupObject[]; layerDefs: LayerDefinition[] }[]>([]);
  const redoStack = useRef<{ objects: MarkupObject[]; layerDefs: LayerDefinition[] }[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const dragStartedUndo = useRef(false);

  // ─── Derived ──────────────────────────────────────────────────────────────
  const sortedObjects = useMemo(() => [...objects].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)), [objects]);
  const totalPoints = objects.reduce((sum, o) => sum + o.points.length, 0);
  const isAtLimit = objects.length >= 200 || totalPoints >= 5000;
  const selectedObj = selectedId ? objects.find(o => o.id === selectedId) ?? null : null;
  const layerMap = useMemo(() => new Map(layerDefs.map(l => [l.id, l])), [layerDefs]);
  const scaled = isSheetScaled(captureParams ?? null);
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  const allSelectedIds = useMemo(() => {
    const s = new Set(multiSelectedIds);
    if (selectedId) s.add(selectedId);
    return s;
  }, [selectedId, multiSelectedIds]);

  const allSelectedObjects = useMemo(() => objects.filter(o => allSelectedIds.has(o.id)), [objects, allSelectedIds]);

  const visibleObjectIds = useMemo(() => new Set(layerDefs.filter(l => l.visible).map(l => l.id)), [layerDefs]);

  const takeoffSummary = useMemo(() => {
    let totalAreaSqFt = 0;
    let totalLengthFt = 0;
    const symbolCounts: Record<string, number> = {};
    for (const obj of objects) {
      if (obj.type === "polygon" && obj.points.length >= 3) {
        const area = computeAreaSqFt(obj.points, captureParams ?? null);
        if (area !== null) totalAreaSqFt += area;
      } else if (obj.type === "polyline" && obj.points.length >= 2) {
        const len = computeLengthFt(obj.points, captureParams ?? null);
        if (len !== null) totalLengthFt += len;
      } else if (obj.type === "symbol") {
        const def = resolveSymbolDef(obj);
        const key = def?.name ?? obj.symbolType ?? "symbol";
        symbolCounts[key] = (symbolCounts[key] ?? 0) + 1;
      }
    }
    return { totalAreaSqFt, totalLengthFt, symbolCounts };
  }, [objects, captureParams]);

  const allLegendEntries = useMemo(() => detectLegendEntries(objects), [objects]);
  const visibleLegendEntries = useMemo(() => applyLegendState(allLegendEntries, legendState), [allLegendEntries, legendState]);

  const nextCalloutNumber = useCallback(() => {
    const existing = objects.filter(o => o.type === "callout" && typeof o.calloutNumber === "number").map(o => o.calloutNumber as number);
    if (existing.length === 0) return 1;
    return Math.max(...existing) + 1;
  }, [objects]);

  function isLayerSelectableForObj(obj: MarkupObject): boolean {
    const layer = layerMap.get(obj.layerId ?? "areas");
    if (!layer) return true;
    return layer.visible && !layer.locked;
  }

  const activeSymbolDef = SYMBOL_MAP.get(activeSymbolId);
  const currentColorForPicker = selectedObj ? selectedObj.strokeColor : activeColor;

  // ─── Undo / Redo ──────────────────────────────────────────────────────────
  const pushUndo = useCallback((currentObjects: MarkupObject[], currentLayerDefs: LayerDefinition[]) => {
    undoStack.current = [...undoStack.current.slice(-MAX_UNDO_STEPS + 1), { objects: currentObjects, layerDefs: currentLayerDefs }];
    redoStack.current = [];
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
    setMultiSelectedIds(new Set());
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
    setMultiSelectedIds(new Set());
  }, []);

  // ─── Update helpers ────────────────────────────────────────────────────────
  const updateObjects = useCallback((fn: (objs: MarkupObject[]) => MarkupObject[]) => {
    setObjects(fn);
    hasUserEdited.current = true;
  }, []);

  function updateSheetMeta(updates: Partial<SheetMetadata>) {
    setSheetMeta(prev => ({ ...prev, ...updates }));
    hasUserEdited.current = true;
  }

  // ─── Selection helpers ────────────────────────────────────────────────────
  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setMultiSelectedIds(new Set());
    setSelectedVertexIdx(null);
  }, []);

  const addToMultiSelection = useCallback((id: string) => {
    setMultiSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // If we're removing the primary selected, clear it
        if (id === selectedId) setSelectedId(next.size > 0 ? Array.from(next)[0] : null);
      } else {
        next.add(id);
      }
      return next;
    });
  }, [selectedId]);

  // ─── Operations ───────────────────────────────────────────────────────────
  const deleteSelected = useCallback(() => {
    const toDelete = new Set(allSelectedIds);
    if (toDelete.size === 0) return;
    pushUndo(objects, layerDefs);
    setObjects(current => current.filter(o => !toDelete.has(o.id)));
    clearSelection();
    hasUserEdited.current = true;
  }, [allSelectedIds, objects, layerDefs, pushUndo, clearSelection]);

  const duplicateSelected = useCallback(() => {
    if (allSelectedIds.size === 0) return;
    pushUndo(objects, layerDefs);
    const offset = 0.02;
    const newObjs: MarkupObject[] = [];
    const newIds: string[] = [];
    allSelectedObjects.forEach(obj => {
      const newId = nanoid8();
      newIds.push(newId);
      const newObj: MarkupObject = {
        ...obj,
        id: newId,
        points: obj.points.map(p => [clamp01(p[0] + offset), clamp01(p[1] + offset)] as MarkupPoint),
        createdAt: new Date().toISOString(),
        zIndex: (obj.zIndex ?? 0) + 1,
      };
      if (newObj.type === "callout") {
        newObj.calloutNumber = nextCalloutNumber() + newObjs.length;
      }
      newObjs.push(newObj);
    });
    setObjects(current => [...current, ...newObjs]);
    if (newIds.length === 1) {
      setSelectedId(newIds[0]);
      setMultiSelectedIds(new Set());
    } else {
      setSelectedId(newIds[0]);
      setMultiSelectedIds(new Set(newIds.slice(1)));
    }
    hasUserEdited.current = true;
  }, [allSelectedIds, allSelectedObjects, objects, layerDefs, pushUndo, nextCalloutNumber]);

  const copyToClipboard = useCallback(() => {
    if (allSelectedObjects.length === 0) return;
    setClipboard(allSelectedObjects);
    toast({ title: `Copied ${allSelectedObjects.length} object${allSelectedObjects.length !== 1 ? "s" : ""} to clipboard` });
  }, [allSelectedObjects, toast]);

  const pasteFromClipboard = useCallback(() => {
    const items = getClipboard();
    if (items.length === 0) return;
    pushUndo(objects, layerDefs);
    const offset = 0.02;
    const newObjs: MarkupObject[] = items.map(obj => ({
      ...obj,
      id: nanoid8(),
      points: obj.points.map(p => [clamp01(p[0] + offset), clamp01(p[1] + offset)] as MarkupPoint),
      createdAt: new Date().toISOString(),
      zIndex: objects.length + 1,
    }));
    setObjects(current => [...current, ...newObjs]);
    setSelectedId(newObjs[0].id);
    setMultiSelectedIds(new Set(newObjs.slice(1).map(o => o.id)));
    hasUserEdited.current = true;
    toast({ title: `Pasted ${newObjs.length} object${newObjs.length !== 1 ? "s" : ""}` });
  }, [objects, layerDefs, pushUndo, toast]);

  const nudgeSelected = useCallback((dx: number, dy: number) => {
    if (allSelectedIds.size === 0) return;
    setObjects(current => current.map(o => {
      if (!allSelectedIds.has(o.id)) return o;
      return { ...o, points: o.points.map(p => [p[0] + dx, p[1] + dy] as MarkupPoint) };
    }));
    hasUserEdited.current = true;
  }, [allSelectedIds]);

  // ─── Alignment tools ──────────────────────────────────────────────────────
  const alignObjects = useCallback((type: "left" | "centerH" | "right" | "top" | "centerV" | "bottom") => {
    if (allSelectedObjects.length < 2) return;
    pushUndo(objects, layerDefs);
    const bboxes = allSelectedObjects.map(o => ({ id: o.id, bb: getBbox(o) }));
    let refVal: number;
    switch (type) {
      case "left": refVal = Math.min(...bboxes.map(b => b.bb.x1)); break;
      case "centerH": refVal = (Math.min(...bboxes.map(b => b.bb.x1)) + Math.max(...bboxes.map(b => b.bb.x2))) / 2; break;
      case "right": refVal = Math.max(...bboxes.map(b => b.bb.x2)); break;
      case "top": refVal = Math.min(...bboxes.map(b => b.bb.y1)); break;
      case "centerV": refVal = (Math.min(...bboxes.map(b => b.bb.y1)) + Math.max(...bboxes.map(b => b.bb.y2))) / 2; break;
      case "bottom": refVal = Math.max(...bboxes.map(b => b.bb.y2)); break;
    }
    setObjects(current => current.map(o => {
      const entry = bboxes.find(b => b.id === o.id);
      if (!entry) return o;
      const bb = entry.bb;
      let dx = 0, dy = 0;
      switch (type) {
        case "left": dx = refVal! - bb.x1; break;
        case "centerH": dx = refVal! - bb.cx; break;
        case "right": dx = refVal! - bb.x2; break;
        case "top": dy = refVal! - bb.y1; break;
        case "centerV": dy = refVal! - bb.cy; break;
        case "bottom": dy = refVal! - bb.y2; break;
      }
      return { ...o, points: o.points.map(p => [p[0] + dx, p[1] + dy] as MarkupPoint) };
    }));
    hasUserEdited.current = true;
  }, [allSelectedObjects, objects, layerDefs, pushUndo]);

  const distributeObjects = useCallback((axis: "h" | "v") => {
    if (allSelectedObjects.length < 3) return;
    pushUndo(objects, layerDefs);
    const sorted = [...allSelectedObjects].sort((a, b) => {
      const ba = getBbox(a), bb = getBbox(b);
      return axis === "h" ? ba.cx - bb.cx : ba.cy - bb.cy;
    });
    const first = getBbox(sorted[0]);
    const last = getBbox(sorted[sorted.length - 1]);
    const totalSpace = (axis === "h" ? last.cx - first.cx : last.cy - first.cy) / (sorted.length - 1);
    const bboxMap = new Map(sorted.map((o, i) => {
      const bb = getBbox(o);
      const target = axis === "h" ? first.cx + i * totalSpace : first.cy + i * totalSpace;
      const delta = axis === "h" ? target - bb.cx : target - bb.cy;
      return [o.id, { dx: axis === "h" ? delta : 0, dy: axis === "v" ? delta : 0 }];
    }));
    setObjects(current => current.map(o => {
      const entry = bboxMap.get(o.id);
      if (!entry) return o;
      return { ...o, points: o.points.map(p => [p[0] + entry.dx, p[1] + entry.dy] as MarkupPoint) };
    }));
    hasUserEdited.current = true;
  }, [allSelectedObjects, objects, layerDefs, pushUndo]);

  // ─── Group / Ungroup ──────────────────────────────────────────────────────
  const groupSelected = useCallback(() => {
    if (allSelectedIds.size < 2) return;
    pushUndo(objects, layerDefs);
    const groupId = nanoid8();
    setObjects(current => current.map(o => allSelectedIds.has(o.id) ? { ...o, groupId } : o));
    hasUserEdited.current = true;
    toast({ title: `Grouped ${allSelectedIds.size} objects` });
  }, [allSelectedIds, objects, layerDefs, pushUndo, toast]);

  const ungroupSelected = useCallback(() => {
    const selectedGroupIds = new Set(allSelectedObjects.map(o => o.groupId).filter(Boolean) as string[]);
    if (selectedGroupIds.size === 0) return;
    pushUndo(objects, layerDefs);
    setObjects(current => current.map(o => {
      if (o.groupId && selectedGroupIds.has(o.groupId)) {
        const { groupId: _, ...rest } = o;
        return rest;
      }
      return o;
    }));
    hasUserEdited.current = true;
    toast({ title: "Ungrouped objects" });
  }, [allSelectedObjects, objects, layerDefs, pushUndo, toast]);

  // ─── Zoom / Pan ───────────────────────────────────────────────────────────
  const zoomTo = useCallback((newScale: number, focalX?: number, focalY?: number) => {
    setViewTransform(prev => {
      const clamped = clampZoom(newScale);
      if (focalX !== undefined && focalY !== undefined && canvasWrapperRef.current) {
        const rect = canvasWrapperRef.current.getBoundingClientRect();
        const cx = focalX - rect.left;
        const cy = focalY - rect.top;
        const scaleFactor = clamped / prev.scale;
        const newPanX = cx - scaleFactor * (cx - prev.panX);
        const newPanY = cy - scaleFactor * (cy - prev.panY);
        return { scale: clamped, panX: newPanX, panY: newPanY };
      }
      return { ...prev, scale: clamped };
    });
  }, []);

  const zoomIn = useCallback(() => zoomTo(viewTransform.scale * 1.3), [viewTransform.scale, zoomTo]);
  const zoomOut = useCallback(() => zoomTo(viewTransform.scale / 1.3), [viewTransform.scale, zoomTo]);

  const zoomFit = useCallback(() => {
    setViewTransform({ scale: 1, panX: 0, panY: 0 });
  }, []);

  const zoomToSelection = useCallback(() => {
    if (allSelectedObjects.length === 0) return;
    const bb = getMultiSelectBBox(allSelectedObjects);
    if (!bb || !canvasWrapperRef.current) return;
    const rect = canvasWrapperRef.current.getBoundingClientRect();
    const svgW = rect.width, svgH = rect.height;
    const padding = 0.1;
    const targetW = (bb.w + padding * 2);
    const targetH = (bb.h + padding * 2) * (svgW / (svgH * (1 / 0.707)));
    const newScale = clampZoom(Math.min(1 / targetW, 1 / targetH) * 0.8);
    const centerX = svgW / 2;
    const centerY = svgH / 2;
    // Convert bb center from SVG coords to viewport
    const bbCenterSvgX = bb.cx * svgW;
    const bbCenterSvgY = bb.cy * svgH * 0.707;
    const newPanX = centerX - newScale * bbCenterSvgX;
    const newPanY = centerY - newScale * bbCenterSvgY;
    setViewTransform({ scale: newScale, panX: newPanX, panY: newPanY });
  }, [allSelectedObjects]);

  // ─── Event: Reset on sheet change ─────────────────────────────────────────
  useEffect(() => {
    setObjects(migrateObjects(initialMarkup ?? flattenMarkupObjects(initialMarkupData)));
    setLayerDefs(mergeLayerDefs(initialLayerDefs));
    setSheetMeta(parseMarkupData(initialMarkupData).sheetMeta ?? {});
    setActiveTool("select");
    clearSelection();
    setActiveColor("#1a4d1a");
    setInProgressPoints([]);
    setPreviewPoint(null);
    setDrag(null);
    setHoveredMidEdge(null);
    setEditingTextId(null);
    setEditingTextValue("");
    setLegendState(initialLegendState ?? DEFAULT_LEGEND_STATE);
    setSelectionPanelNote("");
    setViewTransform({ scale: 1, panX: 0, panY: 0 });
    undoStack.current = [];
    redoStack.current = [];
    hasUserEdited.current = false;
    legendUserEdited.current = false;
    dragStartedUndo.current = false;
    setActiveLayerId("areas");
    setBaseImageError(false);
  }, [sheetId, baseImagePath]);

  // ─── Effect: sync selection panel ─────────────────────────────────────────
  useEffect(() => {
    if (selectedObj?.type === "text") setSelectionPanelText(selectedObj.label || "Label");
    else if (selectedObj?.type === "symbol") { setSelectionPanelText(selectedObj.label ?? ""); setSelectionPanelNote(selectedObj.note ?? ""); }
    else if (selectedObj?.type === "callout") setSelectionPanelText(selectedObj.label || "");
    if (selectedObj?.type === "polygon") setMaterialLabelText(selectedObj.materialLabel || "");
  }, [selectedId, selectedObj?.label, selectedObj?.materialLabel, selectedObj?.note]);

  // ─── Auto-save ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasUserEdited.current) return;
    setSaveStatus("unsaved");
    const timer = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await apiRequest("PATCH", `/api/visual-scope-sheets/${sheetId}`, {
          markupData: { version: "2.0", objects, sheetMeta },
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

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingTextId) return;
      const meta = e.metaKey || e.ctrlKey;

      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        spacebarHeld.current = true;
        setIsPanMode(true);
        return;
      }

      if (meta && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (meta && (e.key === "y" || e.key === "Y")) { e.preventDefault(); redo(); return; }
      if (meta && (e.key === "d" || e.key === "D")) { e.preventDefault(); duplicateSelected(); return; }
      if (meta && (e.key === "c" || e.key === "C")) { e.preventDefault(); copyToClipboard(); return; }
      if (meta && (e.key === "v" || e.key === "V")) { e.preventDefault(); pasteFromClipboard(); return; }
      if (meta && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        // Select all
        const selectableIds = objects.filter(o => isLayerSelectableForObj(o)).map(o => o.id);
        if (selectableIds.length > 0) {
          setSelectedId(selectableIds[0]);
          setMultiSelectedIds(new Set(selectableIds.slice(1)));
        }
        return;
      }
      if (meta && (e.key === "+" || e.key === "=")) { e.preventDefault(); zoomIn(); return; }
      if (meta && e.key === "-") { e.preventDefault(); zoomOut(); return; }
      if (meta && e.key === "0") { e.preventDefault(); zoomFit(); return; }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (allSelectedIds.size > 0) { e.preventDefault(); deleteSelected(); }
        return;
      }

      if (e.key === "Escape") {
        if (inProgressPoints.length > 0) {
          setInProgressPoints([]);
          setPreviewPoint(null);
        } else {
          clearSelection();
          setActiveTool("select");
        }
        return;
      }

      // Arrow nudge
      const nudgeAmt = e.shiftKey ? NUDGE_AMOUNT * 5 : NUDGE_AMOUNT;
      if (e.key === "ArrowLeft") { e.preventDefault(); nudgeSelected(-nudgeAmt, 0); }
      if (e.key === "ArrowRight") { e.preventDefault(); nudgeSelected(nudgeAmt, 0); }
      if (e.key === "ArrowUp") { e.preventDefault(); nudgeSelected(0, -nudgeAmt); }
      if (e.key === "ArrowDown") { e.preventDefault(); nudgeSelected(0, nudgeAmt); }

      // Tool shortcuts
      if (!meta) {
        if (e.key === "v" || e.key === "V") setActiveTool("select");
        if (e.key === "p" || e.key === "P") setActiveTool("polygon");
        if (e.key === "l" || e.key === "L") setActiveTool("polyline");
        if (e.key === "t" || e.key === "T") setActiveTool("text");
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spacebarHeld.current = false;
        setIsPanMode(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => { window.removeEventListener("keydown", handleKeyDown); window.removeEventListener("keyup", handleKeyUp); };
  }, [undo, redo, allSelectedIds, editingTextId, inProgressPoints, deleteSelected, duplicateSelected, copyToClipboard, pasteFromClipboard, nudgeSelected, zoomIn, zoomOut, zoomFit, clearSelection, objects]);

  // ─── Wheel zoom handler ────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY;
    const zoomFactor = delta > 0 ? 0.9 : 1.1;
    zoomTo(viewTransform.scale * zoomFactor, e.clientX, e.clientY);
  }, [viewTransform.scale, zoomTo]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleSetActiveLayer = (id: string) => setActiveLayerId(id);
  const handleToggleLayerVisible = (id: string) => { setLayerDefs(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l)); hasUserEdited.current = true; };
  const handleToggleLayerLocked = (id: string) => { setLayerDefs(prev => prev.map(l => l.id === id ? { ...l, locked: !l.locked } : l)); hasUserEdited.current = true; };
  const handleLegendStateChange = (ls: LegendState) => { setLegendState(ls); legendUserEdited.current = true; hasUserEdited.current = true; };

  const handleColorChange = useCallback((color: string) => {
    setActiveColor(color);
    if (!selectedId) return;
    setObjects(prev => {
      pushUndo(prev, layerDefs);
      hasUserEdited.current = true;
      return prev.map(o => {
        if (o.id !== selectedId) return o;
        if (o.type === "polygon") { const fo = o.fillOpacity ?? 0.15; return { ...o, strokeColor: color, fillColor: hexToRgba(color, fo) }; }
        return { ...o, strokeColor: color, fillColor: color };
      });
    });
  }, [selectedId, pushUndo, layerDefs]);

  const handleInspectorChange = useCallback((updates: Partial<MarkupObject>) => {
    if (!selectedId) return;
    pushUndo(objects, layerDefs);
    setObjects(current => current.map(o => o.id === selectedId ? { ...o, ...updates } : o));
    hasUserEdited.current = true;
  }, [selectedId, objects, layerDefs, pushUndo]);

  const changeTool = useCallback((tool: ActiveTool) => {
    setActiveTool(tool);
    setInProgressPoints([]);
    setPreviewPoint(null);
    if (tool !== "select") clearSelection();
  }, [clearSelection]);

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
  }, [editingTextId, objects, layerDefs, pushUndo]);

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
    setObjects(prev => {
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

  const handleObjectListToggleVisibility = useCallback((id: string) => {
    const obj = objects.find(o => o.id === id);
    if (!obj) return;
    const layer = layerMap.get(obj.layerId ?? "areas");
    if (layer) handleToggleLayerVisible(layer.id);
  }, [objects, layerMap]);

  const handleObjectListSelect = useCallback((id: string, shift: boolean) => {
    if (shift) {
      addToMultiSelection(id);
    } else {
      setSelectedId(id);
      setMultiSelectedIds(new Set());
      setSelectedVertexIdx(null);
      const obj = objects.find(o => o.id === id);
      if (obj) setActiveColor(obj.strokeColor);
    }
  }, [addToMultiSelection, objects]);

  // ─── Canvas Pointer Events ────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    e.preventDefault();
    if (editingTextId) return;

    // Pan mode (spacebar)
    if (spacebarHeld.current) {
      setDrag({ kind: "pan", startClientX: e.clientX, startClientY: e.clientY, origPanX: viewTransform.panX, origPanY: viewTransform.panY });
      svgRef.current.setPointerCapture(e.pointerId);
      return;
    }

    const rawPt = clientToSvgRaw(svgRef.current, e.clientX, e.clientY);
    const pt = snapPt([clamp01(rawPt[0]), clamp01(rawPt[1])], snapToGridEnabled);

    if (activeTool === "select") {
      let found = false;
      // Check objects from top to bottom
      for (let i = sortedObjects.length - 1; i >= 0; i--) {
        const obj = sortedObjects[i];
        if (!isLayerSelectableForObj(obj)) continue;
        if (hitTestObj(obj, pt)) {
          if (e.shiftKey) {
            // Toggle multi-select
            if (selectedId === obj.id) {
              setSelectedId(null);
            } else {
              setMultiSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(obj.id)) next.delete(obj.id);
                else next.add(obj.id);
                return next;
              });
              if (!selectedId) setSelectedId(obj.id);
            }
          } else {
            // Single select
            setSelectedId(obj.id);
            setMultiSelectedIds(new Set());
            setSelectedVertexIdx(null);
            setActiveColor(obj.strokeColor);
            if (obj.type === "text" || obj.type === "callout") setSelectionPanelText(obj.label || (obj.type === "callout" ? "" : "Label"));
            if (obj.type === "symbol") { setSelectionPanelText(obj.label ?? ""); setSelectionPanelNote(obj.note ?? ""); }
          }
          // Start move drag
          if (!e.shiftKey) {
            dragStartedUndo.current = false;
            if (allSelectedIds.size > 1 || (multiSelectedIds.size > 0 && multiSelectedIds.has(obj.id))) {
              // Multi-move
              const origPointsMap: Record<string, MarkupPoint[]> = {};
              allSelectedIds.forEach(id => {
                const o = objects.find(x => x.id === id);
                if (o) origPointsMap[id] = o.points.map(p => [...p] as MarkupPoint);
              });
              setDrag({ kind: "multi-move", ids: Array.from(allSelectedIds), origPointsMap, startPt: pt });
            } else {
              setDrag({ kind: "move", id: obj.id, origPoints: obj.points.map(p => [...p] as MarkupPoint), startPt: pt });
            }
            svgRef.current.setPointerCapture(e.pointerId);
          }
          found = true;
          break;
        }
      }

      if (!found) {
        // Check title/notes block
        if (sheetMeta.titleBlockPosition && distance(pt, sheetMeta.titleBlockPosition) < 0.1) {
          setDrag({ kind: "title-block", origPos: [...sheetMeta.titleBlockPosition] as MarkupPoint, startPt: pt });
          return;
        }
        if (sheetMeta.notesBlockPosition && distance(pt, sheetMeta.notesBlockPosition) < 0.1) {
          setDrag({ kind: "notes-block", origPos: [...sheetMeta.notesBlockPosition] as MarkupPoint, startPt: pt });
          return;
        }
        // Start drag-box selection
        if (!e.shiftKey) clearSelection();
        setDrag({ kind: "drag-box", startPt: pt, curPt: pt });
        svgRef.current.setPointerCapture(e.pointerId);
      }
      return;
    }

    if (isAtLimit) return;

    if (activeTool === "polygon" || activeTool === "polyline") {
      if (activeTool === "polygon" && inProgressPoints.length >= 3 && distance(pt, inProgressPoints[0]) < CLOSE_POLYGON_RADIUS) {
        commitShape(inProgressPoints);
      } else {
        setInProgressPoints(prev => [...prev, pt]);
      }
      return;
    }

    if (activeTool === "stamp") {
      const def = SYMBOL_MAP.get(activeSymbolId);
      if (!def) return;
      const newId = nanoid8();
      const symbolPreset = activePreset?.type === "symbol" ? activePreset : null;
      const symbolPresetConfig = symbolPreset?.styleConfig as StylePresetConfig | undefined;
      updateObjects(prev => {
        pushUndo(prev, layerDefs);
        hasUserEdited.current = true;
        return [...prev, {
        id: newId,
        type: "symbol",
        symbolTypeId: symbolPresetConfig?.symbolTypeId ?? def.id,
        points: [pt],
        scale: symbolPresetConfig?.scale ?? 1,
        rotation: 0,
        label: "",
        showLabel: false,
        note: "",
        strokeColor: symbolPresetConfig?.strokeColor ?? def.defaultColor,
        fillColor: symbolPresetConfig?.strokeColor ?? def.defaultColor,
        strokeWidth: 2,
        opacity: symbolPresetConfig?.opacity ?? 1,
        createdAt: new Date().toISOString(),
        layerId: activeLayerId,
        zIndex: prev.length,
        ...(symbolPreset && { presetId: symbolPreset.id }),
        }];
      });
      setSelectedId(newId);
      setMultiSelectedIds(new Set());
      setActiveTool("select");
      return;
    }

    const newId = nanoid8();
    if (activeTool === "text") {
      const newObj: MarkupObject = {
        id: newId, type: "text", points: [pt], strokeColor: activeColor,
        strokeWidth: 2, fillColor: "none", label: "Label", fontSize: 25,
        layerId: activeLayerId, zIndex: objects.length, createdAt: new Date().toISOString(),
      };
      setObjects(current => [...current, newObj]);
      setSelectedId(newId);
      setMultiSelectedIds(new Set());
      setEditingTextId(newId);
      setEditingTextValue("Label");
    } else if (activeTool === "callout") {
      const newObj: MarkupObject = {
        id: newId, type: "callout", points: [pt], strokeColor: activeColor,
        strokeWidth: 2, fillColor: "none", label: "", calloutNumber: nextCalloutNumber(),
        layerId: activeLayerId, zIndex: objects.length, createdAt: new Date().toISOString(),
      };
      setObjects(current => [...current, newObj]);
      setSelectedId(newId);
      setMultiSelectedIds(new Set());
      setDrag({ kind: "callout-target", id: newId, startPt: pt, origTarget: pt });
    } else {
      const newObj: MarkupObject = {
        id: newId, type: "symbol", symbolType: activeTool as any, points: [pt],
        strokeColor: DEFAULT_SYMBOL_COLORS[activeTool as SymbolType] || activeColor,
        strokeWidth: 2, fillColor: "none", symbolSize: 30, layerId: activeLayerId,
        zIndex: objects.length, createdAt: new Date().toISOString(),
      };
      setObjects(current => [...current, newObj]);
      setSelectedId(newId);
      setMultiSelectedIds(new Set());
    }
  }, [activeTool, activeSymbolId, sortedObjects, objects, inProgressPoints, isAtLimit, editingTextId,
      activeColor, pushUndo, layerDefs, activeLayerId, allSelectedIds, multiSelectedIds,
      viewTransform, snapToGridEnabled, sheetMeta, clearSelection, nextCalloutNumber]);

  const applyPresetToSelected = (preset: StylePreset) => {
    if (!selectedObj) return;
    pushUndo(objects, layerDefs);
    const c = preset.styleConfig as StylePresetConfig;
    const updates: Partial<MarkupObject> = {
      ...(c.strokeColor !== undefined && { strokeColor: c.strokeColor }),
      ...(c.fillColor !== undefined && { fillColor: c.fillColor }),
      ...(c.strokeWidth !== undefined && { strokeWidth: c.strokeWidth }),
      ...(c.dashStyle !== undefined && { dashStyle: c.dashStyle }),
      ...(c.fillType !== undefined && { fillType: c.fillType }),
      ...(c.textureId !== undefined && { textureId: c.textureId }),
      ...(c.textureScale !== undefined && { textureScale: c.textureScale }),
      ...(c.textureOpacity !== undefined && { textureOpacity: c.textureOpacity }),
      ...(c.materialLabel !== undefined && { materialLabel: c.materialLabel }),
      ...(c.opacity !== undefined && { opacity: c.opacity }),
      presetId: preset.id,
    };
    setObjects(current => current.map(o => o.id === selectedId ? { ...o, ...updates } : o));
    hasUserEdited.current = true;
  };

  const saveSelectedAsPreset = async () => {
    if (!selectedObj || !savePresetName.trim()) return;
    const isPolyline = selectedObj.type === "polyline";
    const isSymbol = selectedObj.type === "symbol";
    const presetType = isSymbol ? "symbol" : isPolyline ? "line" : "area";
    const config: StylePresetConfig = {
      strokeColor: selectedObj.strokeColor,
      fillColor: selectedObj.fillColor,
      strokeWidth: selectedObj.strokeWidth,
      ...(selectedObj.dashStyle && { dashStyle: selectedObj.dashStyle }),
      ...(selectedObj.fillType && { fillType: selectedObj.fillType }),
      ...(selectedObj.textureId && { textureId: selectedObj.textureId }),
      ...(selectedObj.textureScale && { textureScale: selectedObj.textureScale }),
      ...(selectedObj.textureOpacity !== undefined && { textureOpacity: selectedObj.textureOpacity }),
      ...(selectedObj.materialLabel && { materialLabel: selectedObj.materialLabel }),
      ...(selectedObj.opacity !== undefined && { opacity: selectedObj.opacity }),
      ...(selectedObj.symbolTypeId && { symbolTypeId: selectedObj.symbolTypeId }),
      ...(selectedObj.scale !== undefined && { scale: selectedObj.scale }),
    };
    try {
      await apiRequest("POST", "/api/style-presets", {
        name: savePresetName.trim(),
        type: presetType,
        category: savePresetCategory,
        styleConfig: config,
        isDefault: false,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/style-presets"] });
      setShowSavePresetDialog(false);
      setSavePresetName("");
    } catch (e) {
      console.error("Failed to save preset", e);
    }
  };

  const saveCurrentAsTemplate = async () => {
    if (!saveTemplateName.trim()) return;
    const layerVisibility: Record<string, boolean> = {};
    layerDefs.forEach(l => { layerVisibility[l.id] = l.visible; });
    try {
      await apiRequest("POST", "/api/sheet-templates", {
        name: saveTemplateName.trim(),
        layerVisibility,
        legendConfig: legendState as unknown as Record<string, unknown>,
        titleBlockFormat: sheetMeta.titleBlockPosition ? { position: sheetMeta.titleBlockPosition } : {},
        notesLayout: sheetMeta.notesBlockPosition ? { position: sheetMeta.notesBlockPosition } : {},
        defaultPresetIds: [],
      });
      await refetchTemplates();
      setShowSaveTemplateDialog(false);
      setSaveTemplateName("");
    } catch (e) {
      console.error("Failed to save template", e);
    }
  };

  const loadTemplate = (template: SheetTemplate) => {
    if (template.layerVisibility) {
      setLayerDefs(prev => prev.map(l => ({
        ...l,
        visible: (template.layerVisibility as Record<string, boolean>)[l.id] ?? l.visible,
      })));
    }
    if (template.legendConfig && Object.keys(template.legendConfig).length > 0) {
      setLegendState(prev => ({ ...prev, ...(template.legendConfig as unknown as Partial<LegendState>) }));
    }
    const tf = template.titleBlockFormat as Record<string, unknown>;
    const nl = template.notesLayout as Record<string, unknown>;
    if (tf?.position) updateSheetMeta({ titleBlockPosition: tf.position as MarkupPoint });
    if (nl?.position) updateSheetMeta({ notesBlockPosition: nl.position as MarkupPoint });
    hasUserEdited.current = true;
  };

  function applyPresetConfig(preset: StylePreset | null, base: Partial<MarkupObject>): Partial<MarkupObject> {
    if (!preset) return base;
    const c = preset.styleConfig as StylePresetConfig;
    return {
      ...base,
      ...(c.strokeColor !== undefined && { strokeColor: c.strokeColor }),
      ...(c.fillColor !== undefined && { fillColor: c.fillColor }),
      ...(c.strokeWidth !== undefined && { strokeWidth: c.strokeWidth }),
      ...(c.dashStyle !== undefined && { dashStyle: c.dashStyle }),
      ...(c.fillType !== undefined && { fillType: c.fillType }),
      ...(c.textureId !== undefined && { textureId: c.textureId }),
      ...(c.textureScale !== undefined && { textureScale: c.textureScale }),
      ...(c.textureOpacity !== undefined && { textureOpacity: c.textureOpacity }),
      ...(c.materialLabel !== undefined && { materialLabel: c.materialLabel }),
      ...(c.opacity !== undefined && { opacity: c.opacity }),
      presetId: preset.id,
    };
  }

  const commitShape = useCallback((pts: MarkupPoint[]) => {
    if (pts.length < 2) { setInProgressPoints([]); setPreviewPoint(null); return; }
    pushUndo(objects, layerDefs);
    const newId = nanoid8();
    const isPolyline = activeTool === "polyline";
    const base: Partial<MarkupObject> = {
      strokeColor: activeColor,
      strokeWidth: 2,
      fillColor: isPolyline ? "none" : hexToRgba(activeColor, 0.15),
    };
    const presetForType = activePreset && (
      (isPolyline && activePreset.type === "line") ||
      (!isPolyline && activePreset.type === "area")
    ) ? activePreset : null;
    const withPreset = applyPresetConfig(presetForType, base);
    const newObj: MarkupObject = {
      id: newId,
      type: isPolyline ? "polyline" : "polygon",
      points: [...pts],
      strokeColor: withPreset.strokeColor ?? activeColor,
      strokeWidth: withPreset.strokeWidth ?? 2,
      fillColor: withPreset.fillColor ?? (isPolyline ? "none" : hexToRgba(activeColor, 0.15)),
      layerId: activeLayerId,
      zIndex: objects.length,
      createdAt: new Date().toISOString(),
      ...(withPreset.dashStyle && { dashStyle: withPreset.dashStyle }),
      ...(withPreset.fillType && { fillType: withPreset.fillType }),
      ...(withPreset.textureId && { textureId: withPreset.textureId }),
      ...(withPreset.textureScale && { textureScale: withPreset.textureScale }),
      ...(withPreset.textureOpacity !== undefined && { textureOpacity: withPreset.textureOpacity }),
      ...(withPreset.materialLabel && { materialLabel: withPreset.materialLabel }),
      ...(withPreset.opacity !== undefined && { opacity: withPreset.opacity }),
      ...(presetForType && { presetId: presetForType.id }),
    };
    setObjects(current => [...current, newObj]);
    setInProgressPoints([]);
    setPreviewPoint(null);
    setSelectedId(newId);
    setMultiSelectedIds(new Set());
    hasUserEdited.current = true;
  }, [activeTool, activeColor, objects, layerDefs, pushUndo, activeLayerId]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!svgRef.current) return;
    const rawPt = clientToSvgRaw(svgRef.current, e.clientX, e.clientY);
    const pt = snapPt([clamp01(rawPt[0]), clamp01(rawPt[1])], snapToGridEnabled);
    setPreviewPoint(pt);

    if (drag) {
      if (drag.kind === "pan") {
        const dx = e.clientX - drag.startClientX;
        const dy = e.clientY - drag.startClientY;
        setViewTransform(prev => ({ ...prev, panX: drag.origPanX + dx, panY: drag.origPanY + dy }));
        return;
      }

      if (drag.kind === "drag-box") {
        setDrag({ ...drag, curPt: rawPt as MarkupPoint });
        return;
      }

      if (!dragStartedUndo.current) {
        pushUndo(objects, layerDefs);
        dragStartedUndo.current = true;
      }

      if (drag.kind === "rotate") {
        const angle = Math.atan2(pt[1] - drag.center[1], pt[0] - drag.center[0]);
        const angleDeg = (angle * 180) / Math.PI;
        const delta = angleDeg - drag.startAngle;
        setObjects(current => current.map(o => o.id === drag.id ? { ...o, rotation: (drag.origRotation + delta + 360) % 360 } : o));
      } else if (drag.kind === "resize") {
        const dist = distance(pt, [drag.cx, drag.cy]);
        const newScale = Math.max(0.1, (drag.origScale * dist) / drag.startDist);
        setObjects(prev => prev.map(o => o.id === drag.id ? { ...o, scale: newScale } : o));
      } else {
        // All remaining drag kinds have startPt: move, multi-move, vertex, callout-target, title-block, notes-block
        const dragWithPt = drag as Extract<DragOp, { startPt: MarkupPoint }>;
        const dx = pt[0] - dragWithPt.startPt[0];
        const dy = pt[1] - dragWithPt.startPt[1];

        if (drag.kind === "move") {
          setObjects(current => current.map(o => o.id === drag.id ? {
            ...o, points: drag.origPoints.map(p => [p[0] + dx, p[1] + dy] as MarkupPoint)
          } : o));
        } else if (drag.kind === "multi-move") {
          setObjects(current => current.map(o => {
            if (!drag.ids.includes(o.id)) return o;
            const orig = drag.origPointsMap[o.id];
            if (!orig) return o;
            return { ...o, points: orig.map(p => [p[0] + dx, p[1] + dy] as MarkupPoint) };
          }));
        } else if (drag.kind === "vertex") {
          setObjects(current => current.map(o => o.id === drag.id ? {
            ...o, points: o.points.map((p, i) => i === drag.vertexIdx ? [drag.origPt[0] + dx, drag.origPt[1] + dy] as MarkupPoint : p)
          } : o));
        } else if (drag.kind === "callout-target") {
          setObjects(current => current.map(o => o.id === drag.id ? { ...o, points: [o.points[0], pt] } : o));
        } else if (drag.kind === "title-block") {
          updateSheetMeta({ titleBlockPosition: [drag.origPos[0] + dx, drag.origPos[1] + dy] as MarkupPoint });
        } else if (drag.kind === "notes-block") {
          updateSheetMeta({ notesBlockPosition: [drag.origPos[0] + dx, drag.origPos[1] + dy] as MarkupPoint });
        }
      }
    }

    // Hovered midpoint edge detection
    if (selectedId && activeTool === "select") {
      const obj = objects.find(o => o.id === selectedId);
      if (obj && (obj.type === "polygon" || obj.type === "polyline")) {
        let bestEdge = -1;
        let minD = 0.02;
        const n = obj.type === "polygon" ? obj.points.length : obj.points.length - 1;
        for (let i = 0; i < n; i++) {
          const a = obj.points[i];
          const b = obj.points[(i + 1) % obj.points.length];
          const mp = midpoint(a, b);
          const d = distance(pt, mp);
          if (d < minD) { minD = d; bestEdge = i; }
        }
        setHoveredMidEdge(bestEdge);
      }
    }
  }, [drag, objects, layerDefs, pushUndo, selectedId, activeTool, snapToGridEnabled]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (drag?.kind === "drag-box" && svgRef.current) {
      // Find objects within box
      const { startPt, curPt } = drag;
      const newIds = sortedObjects
        .filter(o => isLayerSelectableForObj(o) && bboxIntersects(getBbox(o), startPt, curPt))
        .map(o => o.id);
      if (newIds.length > 0) {
        setSelectedId(newIds[0]);
        setMultiSelectedIds(new Set(newIds.slice(1)));
      }
    }
    setDrag(null);
    dragStartedUndo.current = false;
  }, [drag, sortedObjects]);

  // Double-click to commit polyline
  const handleDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === "polyline" && inProgressPoints.length >= 2) {
      commitShape(inProgressPoints);
    }
    if (activeTool === "polygon" && inProgressPoints.length >= 3) {
      commitShape(inProgressPoints);
    }
    // Double-click to edit text
    if (activeTool === "select" && svgRef.current) {
      const rawPt = clientToSvgRaw(svgRef.current, e.clientX, e.clientY);
      const pt: MarkupPoint = [clamp01(rawPt[0]), clamp01(rawPt[1])];
      for (let i = sortedObjects.length - 1; i >= 0; i--) {
        const obj = sortedObjects[i];
        if (!isLayerSelectableForObj(obj)) continue;
        if ((obj.type === "text") && hitTestObj(obj, pt)) {
          setEditingTextId(obj.id);
          setEditingTextValue(obj.label || "Label");
          break;
        }
      }
    }
  }, [activeTool, inProgressPoints, commitShape, sortedObjects]);

  const handleVertexPointerDown = useCallback((id: string, idx: number, e: React.PointerEvent) => {
    if (!svgRef.current) return;
    const pt = clientToSvg(svgRef.current, e.clientX, e.clientY);
    const obj = objects.find(o => o.id === id);
    if (!obj) return;
    dragStartedUndo.current = false;
    setDrag({ kind: "vertex", id, vertexIdx: idx, startPt: pt, origPt: [...obj.points[idx]] as MarkupPoint });
    svgRef.current.setPointerCapture(e.pointerId);
  }, [objects]);

  const handleMidpointClick = useCallback((id: string, edgeIdx: number, e: React.PointerEvent) => {
    if (!svgRef.current) return;
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
  }, [objects, layerDefs, pushUndo]);

  const handleVertexClick = useCallback((id: string, idx: number) => {
    const obj = objects.find(o => o.id === id);
    if (obj && obj.points.length > (obj.type === "polygon" ? 3 : 2)) {
      pushUndo(objects, layerDefs);
      setObjects(current => current.map(o => o.id === id ? { ...o, points: o.points.filter((_, i) => i !== idx) } : o));
      hasUserEdited.current = true;
    }
  }, [objects, layerDefs, pushUndo]);

  const handleCalloutBadgePointerDown = useCallback((obj: MarkupObject, e: React.PointerEvent) => {
    if (!svgRef.current) return;
    const pt = clientToSvg(svgRef.current, e.clientX, e.clientY);
    dragStartedUndo.current = false;
    setDrag({ kind: "move", id: obj.id, origPoints: obj.points.map(p => [...p] as MarkupPoint), startPt: pt });
    svgRef.current.setPointerCapture(e.pointerId);
  }, []);

  const handleCalloutTargetPointerDown = useCallback((obj: MarkupObject, e: React.PointerEvent) => {
    if (!svgRef.current) return;
    const pt = clientToSvg(svgRef.current, e.clientX, e.clientY);
    dragStartedUndo.current = false;
    setDrag({ kind: "callout-target", id: obj.id, startPt: pt, origTarget: obj.points[1] ? [...obj.points[1]] as MarkupPoint : pt });
    svgRef.current.setPointerCapture(e.pointerId);
  }, []);

  const handleResizeStart = useCallback((e: React.PointerEvent, cx: number, cy: number, origScale: number, startDist: number) => {
    if (!svgRef.current) return;
    svgRef.current.setPointerCapture(e.pointerId);
    dragStartedUndo.current = false;
    setDrag({ kind: "resize", id: selectedId!, cx, cy, origScale, startDist });
  }, [selectedId]);

  const handleRotateStart = useCallback((e: React.PointerEvent, cx: number, cy: number) => {
    if (!svgRef.current) return;
    const pt = clientToSvg(svgRef.current, e.clientX, e.clientY);
    const dx = pt[0] - cx, dy = pt[1] - cy;
    const startAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    const obj = objects.find(o => o.id === selectedId);
    const origRotation = obj?.rotation ?? 0;
    svgRef.current.setPointerCapture(e.pointerId);
    dragStartedUndo.current = false;
    setDrag({ kind: "rotate", id: selectedId!, center: [cx, cy], startAngle, origRotation });
  }, [selectedId, objects]);

  // ─── Export ────────────────────────────────────────────────────────────────
  async function handleExport() {
    setIsExporting(true);
    try {
      const endpoint = exportFormat === "pdf" ? `/api/visual-scope-sheets/${sheetId}/export-pdf` : `/api/visual-scope-sheets/${sheetId}/export-png`;
      const res = await fetch(endpoint, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: exportPreset, resolution: exportResolution, branding: { enabled: exportBrandingEnabled, companyName: exportBrandingEnabled ? exportCompanyName : undefined } }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error ?? "Export failed"); }
      const blob = await res.blob();
      const ext = exportFormat === "pdf" ? "pdf" : "png";
      const filename = `visual-scope-${exportPreset}.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }

  // ─── Cursor ────────────────────────────────────────────────────────────────
  const svgCursor = isPanMode ? "grab" : drag?.kind === "pan" ? "grabbing" : activeTool === "select" ? "default" : "crosshair";

  // ─── Multi-select bounding box ────────────────────────────────────────────
  const multiSelectBBox = useMemo(() => {
    if (allSelectedIds.size < 2) return null;
    return getMultiSelectBBox(allSelectedObjects);
  }, [allSelectedIds, allSelectedObjects]);

  // ─── Drag box rect ────────────────────────────────────────────────────────
  const dragBoxRect = drag?.kind === "drag-box" ? drag : null;

  // ─── Render ───────────────────────────────────────────────────────────────
  const canvasStyle: React.CSSProperties = {
    transform: `translate(${viewTransform.panX}px, ${viewTransform.panY}px) scale(${viewTransform.scale})`,
    transformOrigin: "center center",
    transition: drag?.kind === "pan" ? "none" : undefined,
  };

  return (
    <div className="flex flex-col h-full bg-background" ref={containerRef}>
      {/* ── Header Toolbar ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-3 h-12 border-b bg-card shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {/* Drawing tools */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant={activeTool === "select" ? "default" : "ghost"} onClick={() => changeTool("select")} title="Select (V)" data-testid="tool-select" className="h-8 w-8">
                <MousePointer className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Select (V)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant={activeTool === "polygon" ? "default" : "ghost"} onClick={() => changeTool("polygon")} title="Polygon (P)" data-testid="tool-polygon" disabled={isAtLimit} className="h-8 w-8">
                <Pentagon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Polygon (P)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant={activeTool === "polyline" ? "default" : "ghost"} onClick={() => changeTool("polyline")} title="Line (L)" data-testid="tool-polyline" disabled={isAtLimit} className="h-8 w-8">
                <Minus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Line (L)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant={activeTool === "text" ? "default" : "ghost"} onClick={() => changeTool("text")} title="Text (T)" data-testid="tool-text" disabled={isAtLimit} className="h-8 w-8">
                <Type className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Text (T)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant={activeTool === "callout" ? "default" : "ghost"} onClick={() => changeTool("callout")} title="Callout" data-testid="tool-callout" disabled={isAtLimit} className="h-8 w-8">
                <MessageSquare className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Callout</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Symbol Library */}
          <Sheet open={libraryOpen} onOpenChange={setLibraryOpen}>
            <SheetTrigger asChild>
              <Button size="sm" variant="ghost" className={`toggle-elevate gap-1.5 h-8${activeTool === "stamp" ? " toggle-elevated" : ""}`} title="Symbol Library" data-testid="button-symbol-library" disabled={isAtLimit}>
                <Library className="w-4 h-4" />
                {activeSymbolDef && <span className="text-xs text-muted-foreground hidden sm:inline">{activeSymbolDef.name}</span>}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80">
              <SheetHeader><SheetTitle>Symbol Library</SheetTitle></SheetHeader>
              <div className="mt-4">
                <SymbolLibrary onSelect={def => { setActiveSymbolId(def.id); setActiveColor(def.defaultColor); changeTool("stamp"); setLibraryOpen(false); }} />
              </div>
            </SheetContent>
          </Sheet>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Color picker */}
          <div className="relative flex items-center" title="Active color">
            <label htmlFor="color-picker" className="flex items-center cursor-pointer" aria-label="Color picker">
              <span className="w-5 h-5 rounded-sm border border-border" style={{ background: currentColorForPicker }} data-testid="swatch-active-color" />
            </label>
            <input id="color-picker" type="color" value={currentColorForPicker} onChange={e => handleColorChange(e.target.value)} className="absolute opacity-0 w-5 h-5 cursor-pointer" style={{ left: 0, top: 0 }} data-testid="input-color-picker" title="Pick color" />
          </div>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Undo/Redo */}
          <Button size="icon" variant="ghost" disabled={!canUndo} onClick={undo} data-testid="button-undo" title="Undo (Ctrl+Z)" className="h-8 w-8"><Undo2 className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" disabled={!canRedo} onClick={redo} data-testid="button-redo" title="Redo (Ctrl+Shift+Z)" className="h-8 w-8"><Redo2 className="w-4 h-4" /></Button>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Multi-select tools (shown when 2+ selected) */}
          {allSelectedIds.size >= 2 && (
            <>
              <div className="flex items-center gap-0.5 border rounded-md px-1 py-0.5 bg-blue-50 dark:bg-blue-950/30">
                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium mr-1">{allSelectedIds.size} sel.</span>
                <Tooltip><TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" onClick={() => alignObjects("left")} className="h-6 w-6" data-testid="button-align-left" title="Align Left"><AlignStartVertical className="w-3 h-3" /></Button>
                </TooltipTrigger><TooltipContent>Align Left</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" onClick={() => alignObjects("centerH")} className="h-6 w-6" data-testid="button-align-center-h" title="Center Horizontally"><AlignHorizontalJustifyCenter className="w-3 h-3" /></Button>
                </TooltipTrigger><TooltipContent>Center Horizontally</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" onClick={() => alignObjects("right")} className="h-6 w-6" data-testid="button-align-right" title="Align Right"><AlignEndVertical className="w-3 h-3" /></Button>
                </TooltipTrigger><TooltipContent>Align Right</TooltipContent></Tooltip>
                <Separator orientation="vertical" className="h-4 mx-0.5" />
                <Tooltip><TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" onClick={() => alignObjects("top")} className="h-6 w-6" data-testid="button-align-top" title="Align Top"><AlignStartHorizontal className="w-3 h-3" /></Button>
                </TooltipTrigger><TooltipContent>Align Top</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" onClick={() => alignObjects("centerV")} className="h-6 w-6" data-testid="button-align-center-v" title="Center Vertically"><AlignVerticalJustifyCenter className="w-3 h-3" /></Button>
                </TooltipTrigger><TooltipContent>Center Vertically</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" onClick={() => alignObjects("bottom")} className="h-6 w-6" data-testid="button-align-bottom" title="Align Bottom"><AlignEndHorizontal className="w-3 h-3" /></Button>
                </TooltipTrigger><TooltipContent>Align Bottom</TooltipContent></Tooltip>
                {allSelectedIds.size >= 3 && (
                  <>
                    <Separator orientation="vertical" className="h-4 mx-0.5" />
                    <Tooltip><TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" onClick={() => distributeObjects("h")} className="h-6 w-6" data-testid="button-distribute-h" title="Distribute Horizontally"><AlignHorizontalJustifyCenter className="w-3 h-3" /></Button>
                    </TooltipTrigger><TooltipContent>Distribute Horizontally</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" onClick={() => distributeObjects("v")} className="h-6 w-6" data-testid="button-distribute-v" title="Distribute Vertically"><AlignVerticalJustifyCenter className="w-3 h-3" /></Button>
                    </TooltipTrigger><TooltipContent>Distribute Vertically</TooltipContent></Tooltip>
                  </>
                )}
                <Separator orientation="vertical" className="h-4 mx-0.5" />
                <Tooltip><TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" onClick={groupSelected} className="h-6 w-6" data-testid="button-group" title="Group"><Group className="w-3 h-3" /></Button>
                </TooltipTrigger><TooltipContent>Group</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" onClick={() => { duplicateSelected(); }} className="h-6 w-6" data-testid="button-bulk-duplicate" title="Duplicate All"><Copy className="w-3 h-3" /></Button>
                </TooltipTrigger><TooltipContent>Duplicate Selection</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={deleteSelected} data-testid="button-bulk-delete" title="Delete All"><Trash2 className="w-3 h-3" /></Button>
                </TooltipTrigger><TooltipContent>Delete Selection</TooltipContent></Tooltip>
              </div>
              <Separator orientation="vertical" className="h-6 mx-1" />
            </>
          )}

          {/* Single-object actions */}
          {allSelectedIds.size === 1 && selectedId && (
            <>
              <Button size="sm" variant="ghost" onClick={duplicateSelected} data-testid="button-duplicate" title="Duplicate (Ctrl+D)" className="h-8 gap-1 text-xs">
                <Copy className="w-3.5 h-3.5" />Dupe
              </Button>
              {allSelectedObjects[0]?.groupId && (
                <Button size="sm" variant="ghost" onClick={ungroupSelected} data-testid="button-ungroup" title="Ungroup" className="h-8 gap-1 text-xs">
                  <Ungroup className="w-3.5 h-3.5" />Ungroup
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={deleteSelected} data-testid="button-delete-selected" title="Delete (Del)" className="h-8 gap-1 text-xs text-destructive">
                <Trash2 className="w-3.5 h-3.5" />Delete
              </Button>
              <Separator orientation="vertical" className="h-6 mx-1" />
            </>
          )}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          {/* Snap to grid toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className={`toggle-elevate h-8 w-8${snapToGridEnabled ? " toggle-elevated" : ""}`} onClick={() => setSnapToGridEnabled(v => !v)} data-testid="button-snap-grid" title="Snap to Grid">
                <Grid3x3 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Snap to Grid</TooltipContent>
          </Tooltip>

          {/* Object list toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className={`toggle-elevate h-8 w-8${showObjectList ? " toggle-elevated" : ""}`} onClick={() => setShowObjectList(v => !v)} data-testid="button-object-list" title="Object List">
                <List className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Object List</TooltipContent>
          </Tooltip>

          {/* Legend */}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className={`toggle-elevate gap-1 h-8${legendState.enabled ? " toggle-elevated" : ""}`} data-testid="button-legend-toggle" title="Legend settings">
                <MapIcon className="w-4 h-4" />
                <span className="text-xs hidden sm:inline">Legend</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0" side="bottom" align="end">
              <div className="p-3 border-b">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={legendState.enabled} onChange={() => handleLegendStateChange({ ...legendState, enabled: !legendState.enabled })} data-testid="checkbox-legend-enabled" />
                  <span className="text-sm font-medium">Show Legend</span>
                </label>
              </div>
              <LegendSettings legendState={legendState} onLegendStateChange={handleLegendStateChange} />
            </PopoverContent>
          </Popover>

          {/* Sheet settings */}
          <Button size="icon" variant={showSheetPanel ? "default" : "ghost"} onClick={() => setShowSheetPanel(!showSheetPanel)} className="h-8 w-8" title="Sheet Settings" data-testid="button-sheet-settings">
            <Layout className="h-4 w-4" />
          </Button>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 border rounded-md px-1 py-0.5">
            <Tooltip><TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={zoomOut} className="h-6 w-6" data-testid="button-zoom-out" title="Zoom Out (Ctrl+-)"><ZoomOut className="w-3 h-3" /></Button>
            </TooltipTrigger><TooltipContent>Zoom Out</TooltipContent></Tooltip>
            <button className="text-xs font-mono min-w-[40px] text-center px-1 hover-elevate rounded" onClick={zoomFit} data-testid="button-zoom-level" title="Reset zoom (Ctrl+0)">
              {Math.round(viewTransform.scale * 100)}%
            </button>
            <Tooltip><TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={zoomIn} className="h-6 w-6" data-testid="button-zoom-in" title="Zoom In (Ctrl++)"><ZoomIn className="w-3 h-3" /></Button>
            </TooltipTrigger><TooltipContent>Zoom In</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={zoomFit} className="h-6 w-6" data-testid="button-zoom-fit" title="Fit to view (Ctrl+0)"><Maximize2 className="w-3 h-3" /></Button>
            </TooltipTrigger><TooltipContent>Fit to View</TooltipContent></Tooltip>
          </div>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Export */}
          <Button size="sm" variant="outline" onClick={() => setExportOpen(true)} data-testid="button-export-modal" title="Export PNG or PDF" className="h-8">
            <Download className="w-4 h-4 mr-1" />Export
          </Button>

          {/* Save status */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground ml-1" data-testid="text-save-status">
            {saveStatus === "saving" && <><Loader2 className="w-3 h-3 animate-spin" />Saving</>}
            {saveStatus === "saved" && <><Check className="w-3 h-3 text-green-600" />Saved</>}
            {saveStatus === "unsaved" && "Unsaved"}
          </div>

          {/* Close */}
          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => onSaved?.()} title="Close editor" data-testid="button-close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* ── Layer / status bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1 border-b bg-muted/20 text-xs text-muted-foreground shrink-0" data-testid="bar-layer-info">
        <Lock className="w-3 h-3 shrink-0 opacity-50" />
        <span className="opacity-70">Base (locked)</span>
        <Separator orientation="vertical" className="h-3 mx-1" />
        <span className="font-medium text-foreground">{layerDefs.find(l => l.id === activeLayerId)?.name ?? "Annotations"}</span>
        <span className="opacity-60">— {objects.length} object{objects.length !== 1 ? "s" : ""}</span>
        {allSelectedIds.size > 0 && <span className="text-blue-500 font-medium">· {allSelectedIds.size} selected</span>}
        {snapToGridEnabled && <Badge variant="secondary" className="text-xs h-4 px-1 ml-1">Snap</Badge>}
        {inProgressPoints.length > 0 && (
          <span className="text-muted-foreground italic ml-2" data-testid="text-drawing-hint">
            {activeTool === "polygon" ? "Click near start to close · Enter to finish · Esc to cancel" : "Double-click or Enter to finish · Esc to cancel"}
          </span>
        )}
      </div>

      {/* ── Main content area ──────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left sidebar: Layers + Inspector */}
        <aside className="w-52 border-r bg-card flex flex-col shrink-0 overflow-y-auto" data-testid="sidebar-left">
          <LayersPanel layers={layerDefs} activeLayerId={activeLayerId} onSetActive={handleSetActiveLayer} onToggleVisible={handleToggleLayerVisible} onToggleLocked={handleToggleLayerLocked} />
          <Separator />

          {/* Style Presets Panel */}
          <div className="border-b">
            <button
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover-elevate"
              onClick={() => setShowPresetsPanel(p => !p)}
              data-testid="button-toggle-presets"
            >
              <span className="flex items-center gap-1.5">
                <Palette className="h-3 w-3" />
                Style Presets
              </span>
              {showPresetsPanel ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showPresetsPanel && (
              <div className="px-2 pb-2 space-y-1">
                {stylePresetList.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2 opacity-60">No presets yet</p>
                ) : (
                  <>
                    {(["area", "line", "symbol"] as const).map(type => {
                      const group = stylePresetList.filter(p => p.type === type);
                      if (group.length === 0) return null;
                      const typeLabel = type === "area" ? "Areas" : type === "line" ? "Lines" : "Symbols";
                      return (
                        <div key={type}>
                          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider px-1 pt-1 pb-0.5">{typeLabel}</p>
                          {group.map(preset => (
                            <button
                              key={preset.id}
                              onClick={() => setActivePresetId(activePresetId === preset.id ? null : preset.id)}
                              className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-md text-xs hover-elevate ${activePresetId === preset.id ? "bg-primary/10 text-primary font-medium" : "text-foreground"}`}
                              data-testid={`preset-${preset.id}`}
                            >
                              <span
                                className="w-3 h-3 rounded-sm shrink-0 border border-black/10"
                                style={{
                                  background: (preset.styleConfig as StylePresetConfig).strokeColor ?? "#888",
                                }}
                              />
                              <span className="truncate">{preset.name}</span>
                              {activePresetId === preset.id && <Check className="h-3 w-3 ml-auto shrink-0" />}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </>
                )}
                {activePresetId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs text-muted-foreground mt-1"
                    onClick={() => setActivePresetId(null)}
                    data-testid="button-clear-preset"
                  >
                    Clear Active Preset
                  </Button>
                )}
              </div>
            )}
          </div>

          {selectedObj && allSelectedIds.size === 1 ? (
            <>
              <ObjectInspector obj={selectedObj} onChange={handleInspectorChange} onDelete={deleteSelected} />
              <div className="p-2 pt-0 mt-auto border-t bg-muted/30">
                {/* Apply Preset to selected */}
                {stylePresetList.length > 0 && (selectedObj.type === "polygon" || selectedObj.type === "polyline" || selectedObj.type === "symbol") && (
                  <div className="mb-2">
                    <Select
                      onValueChange={val => {
                        const preset = stylePresetList.find(p => p.id === val);
                        if (preset) applyPresetToSelected(preset);
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs" data-testid="select-apply-preset">
                        <SelectValue placeholder="Apply preset..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(["area", "line", "symbol"] as const).map(type => {
                          const group = stylePresetList.filter(p => p.type === type);
                          if (group.length === 0) return null;
                          const relevantType = selectedObj.type === "polygon" ? "area" : selectedObj.type === "polyline" ? "line" : "symbol";
                          if (type !== relevantType) return null;
                          return group.map(preset => (
                            <SelectItem key={preset.id} value={preset.id} data-testid={`apply-preset-${preset.id}`}>
                              {preset.name}
                            </SelectItem>
                          ));
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* Save as Preset / duplicate / delete / copy */}
                {showSavePresetDialog ? (
                  <div className="space-y-1.5 mb-2">
                    <Input
                      className="h-7 text-xs"
                      placeholder="Preset name..."
                      value={savePresetName}
                      onChange={e => setSavePresetName(e.target.value)}
                      data-testid="input-preset-name"
                      autoFocus
                    />
                    <Input
                      className="h-7 text-xs"
                      placeholder="Category (e.g. mulch)"
                      value={savePresetCategory}
                      onChange={e => setSavePresetCategory(e.target.value)}
                      data-testid="input-preset-category"
                    />
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="h-7 text-xs flex-1"
                        onClick={saveSelectedAsPreset}
                        data-testid="button-confirm-save-preset"
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setShowSavePresetDialog(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs gap-1.5 mb-2"
                    onClick={() => setShowSavePresetDialog(true)}
                    data-testid="button-save-as-preset"
                  >
                    <Tag className="h-3 w-3" />
                    Save as Preset
                  </Button>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={duplicateSelected} data-testid="button-inspector-duplicate">
                    <Copy className="h-3 w-3" />Duplicate
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs text-destructive gap-1" onClick={deleteSelected} data-testid="button-inspector-delete-alt">
                    <Trash2 className="h-3 w-3" />Delete
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 col-span-2" onClick={copyToClipboard} data-testid="button-inspector-copy">
                    <Clipboard className="h-3 w-3" />Copy to Clipboard
                  </Button>
                </div>
              </div>
            </>
          ) : allSelectedIds.size > 1 ? (
            <div className="flex flex-col gap-2 p-3">
              <p className="text-xs font-medium text-muted-foreground">{allSelectedIds.size} objects selected</p>
              <p className="text-xs text-muted-foreground">Use alignment tools in the toolbar to reposition them.</p>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={copyToClipboard}>
                <Clipboard className="h-3 w-3" />Copy All
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs text-destructive gap-1" onClick={deleteSelected}>
                <Trash2 className="h-3 w-3" />Delete All
              </Button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-muted-foreground">
              <Info className="h-7 w-7 mb-2 opacity-20" />
              <p className="text-xs">No object selected</p>
              <p className="text-xs opacity-60 mt-1">Click to select · Shift+click multi-select · Drag to box-select</p>
            </div>
          )}
        </aside>

        {/* Canvas area */}
        <main
          className="flex-1 overflow-hidden bg-muted/40 relative"
          onWheel={handleWheel}
          data-testid="canvas-main"
          style={{ cursor: isPanMode ? (drag?.kind === "pan" ? "grabbing" : "grab") : undefined }}
        >
          <div
            ref={canvasWrapperRef}
            className="w-full h-full flex items-center justify-center"
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                ...canvasStyle,
                width: "calc(min(100% - 32px, (100vh - 120px) * 1.414))",
                aspectRatio: "1.414 / 1",
                position: "relative",
              }}
              className="shadow-2xl bg-white select-none ring-1 ring-black/5"
              data-testid="canvas-container"
            >
              {/* Base image */}
              <div className="absolute inset-0 pointer-events-none">
                {baseImageError ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 pointer-events-auto" data-testid="base-image-error-overlay">
                    <ImageOff className="w-10 h-10 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">{t("visualScope.baseImageLoadError", "Base image could not be loaded")}</p>
                    {onBaseImageError && (
                      <Button size="sm" variant="outline" onClick={onBaseImageError} data-testid="button-replace-base-image">
                        {t("visualScope.replaceBaseImage", "Replace base image")}
                      </Button>
                    )}
                  </div>
                ) : (
                  <img
                    src={baseImagePath}
                    className="w-full h-full object-contain opacity-40 grayscale"
                    alt="Base blueprint"
                    onError={() => setBaseImageError(true)}
                  />
                )}
              </div>

              {/* SVG canvas */}
              <svg
                ref={svgRef}
                viewBox="0 0 1 0.707"
                className="absolute inset-0 w-full h-full touch-none"
                style={{ cursor: svgCursor }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onDoubleClick={handleDoubleClick}
                data-testid="canvas-svg"
              >
                {/* Objects */}
                {sortedObjects.map(obj => {
                  if (!visibleObjectIds.has(obj.layerId ?? "areas")) return null;
                  return (
                    <MarkupShape
                      key={obj.id}
                      obj={obj}
                      selected={selectedId === obj.id}
                      multiSelected={multiSelectedIds.has(obj.id)}
                      selectedVertexIdx={selectedId === obj.id ? selectedVertexIdx : null}
                      hoveredMidEdge={selectedId === obj.id ? hoveredMidEdge : null}
                      onVertexPointerDown={(idx, e) => handleVertexPointerDown(obj.id, idx, e)}
                      onMidpointClick={(edgeIdx, e) => handleMidpointClick(obj.id, edgeIdx, e)}
                      onVertexClick={idx => handleVertexClick(obj.id, idx)}
                      onCalloutBadgePointerDown={handleCalloutBadgePointerDown}
                      onCalloutTargetPointerDown={handleCalloutTargetPointerDown}
                    />
                  );
                })}

                {/* Transform handles for single selected symbol */}
                {selectedId && selectedObj?.type === "symbol" && (
                  <TransformHandles obj={selectedObj} onResizeStart={handleResizeStart} onRotateStart={handleRotateStart} />
                )}

                {/* Multi-select bounding box */}
                {multiSelectBBox && (
                  <rect
                    x={multiSelectBBox.x1 - 0.008}
                    y={multiSelectBBox.y1 - 0.008}
                    width={multiSelectBBox.w + 0.016}
                    height={multiSelectBBox.h + 0.016}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={0.003}
                    strokeDasharray="0.008,0.004"
                    style={{ pointerEvents: "none" }}
                    data-testid="multi-select-bbox"
                  />
                )}

                {/* Drag selection box */}
                {dragBoxRect && (
                  <rect
                    x={Math.min(dragBoxRect.startPt[0], dragBoxRect.curPt[0])}
                    y={Math.min(dragBoxRect.startPt[1], dragBoxRect.curPt[1])}
                    width={Math.abs(dragBoxRect.curPt[0] - dragBoxRect.startPt[0])}
                    height={Math.abs(dragBoxRect.curPt[1] - dragBoxRect.startPt[1])}
                    fill="rgba(59,130,246,0.08)"
                    stroke="#3b82f6"
                    strokeWidth={0.002}
                    strokeDasharray="0.006,0.003"
                    style={{ pointerEvents: "none" }}
                    data-testid="drag-select-box"
                  />
                )}

                {/* Snap grid dots (when enabled) */}
                {snapToGridEnabled && viewTransform.scale >= 1.5 && (
                  <g style={{ pointerEvents: "none" }}>
                    {Array.from({ length: Math.floor(1 / GRID_SIZE) + 1 }, (_, i) =>
                      Array.from({ length: Math.floor(0.707 / GRID_SIZE) + 1 }, (_, j) => (
                        <circle key={`g-${i}-${j}`} cx={i * GRID_SIZE} cy={j * GRID_SIZE} r={0.002} fill="rgba(59,130,246,0.3)" />
                      ))
                    )}
                  </g>
                )}

                {/* In-progress shape */}
                {inProgressPoints.length > 0 && (
                  <InProgressShape points={inProgressPoints} preview={previewPoint} tool={activeTool} color={activeColor} />
                )}

                {/* Title/Notes blocks */}
                {sheetMeta.titleBlockPosition && (
                  <TitleBlockSvg meta={sheetMeta} pos={sheetMeta.titleBlockPosition}
                    onPointerDown={e => { e.stopPropagation(); const pt = clientToSvg(svgRef.current!, e.clientX, e.clientY); setDrag({ kind: "title-block", origPos: [...sheetMeta.titleBlockPosition!] as MarkupPoint, startPt: pt }); }} />
                )}
                {sheetMeta.notesBlockPosition && (
                  <NotesBlockSvg meta={sheetMeta} pos={sheetMeta.notesBlockPosition}
                    onPointerDown={e => { e.stopPropagation(); const pt = clientToSvg(svgRef.current!, e.clientX, e.clientY); setDrag({ kind: "notes-block", origPos: [...sheetMeta.notesBlockPosition!] as MarkupPoint, startPt: pt }); }} />
                )}

                {/* Measurement labels */}
                {showMeasurementLabels && scaled && sortedObjects
                  .filter(obj => visibleObjectIds.has(obj.layerId ?? "areas"))
                  .map(obj => {
                    if (obj.type === "polygon" && obj.points.length >= 3) {
                      const area = computeAreaSqFt(obj.points, captureParams ?? null);
                      if (area === null) return null;
                      const cx = obj.points.reduce((s, p) => s + p[0], 0) / obj.points.length;
                      const cy = obj.points.reduce((s, p) => s + p[1], 0) / obj.points.length;
                      return <text key={`meas-${obj.id}`} x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="0.025" fill="white" stroke="rgba(0,0,0,0.6)" strokeWidth="0.002" paintOrder="stroke" style={{ pointerEvents: "none", fontFamily: "sans-serif" }} data-testid={`meas-label-${obj.id}`}>{formatSqFt(area)}</text>;
                    } else if (obj.type === "polyline" && obj.points.length >= 2) {
                      const len = computeLengthFt(obj.points, captureParams ?? null);
                      if (len === null) return null;
                      const mid = Math.floor(obj.points.length / 2);
                      const mx = (obj.points[mid - 1][0] + obj.points[mid][0]) / 2;
                      const my = (obj.points[mid - 1][1] + obj.points[mid][1]) / 2;
                      return <text key={`meas-${obj.id}`} x={mx} y={my - 0.015} textAnchor="middle" dominantBaseline="middle" fontSize="0.025" fill="white" stroke="rgba(0,0,0,0.6)" strokeWidth="0.002" paintOrder="stroke" style={{ pointerEvents: "none", fontFamily: "sans-serif" }} data-testid={`meas-label-${obj.id}`}>{formatLinearFt(len)}</text>;
                    }
                    return null;
                  })
                }
              </svg>

              {/* Text edit overlay */}
              {editingTextId && objects.find(o => o.id === editingTextId) && (
                <TextEditOverlay
                  obj={objects.find(o => o.id === editingTextId)!}
                  svgRef={svgRef}
                  containerRef={containerRef}
                  value={editingTextValue}
                  onChange={setEditingTextValue}
                  onCommit={commitEditingText}
                  onCancel={() => { setEditingTextId(null); setEditingTextValue(""); }}
                />
              )}

              {/* Legend overlay */}
              {legendState.enabled && visibleLegendEntries.length > 0 && (
                <LegendPanel entries={visibleLegendEntries} allEntries={allLegendEntries} legendState={legendState} onLegendStateChange={handleLegendStateChange} containerRef={containerRef} />
              )}

              {/* Scale badge */}
              <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1.5 z-10 pointer-events-none">
                {scaled ? (
                  <Badge variant="secondary" className="text-xs gap-1" data-testid="badge-scaled"><Ruler className="w-3 h-3" />Scaled</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs gap-1 bg-background/80 backdrop-blur-sm" data-testid="badge-not-to-scale"><AlertCircle className="w-3 h-3 text-muted-foreground" />Not to Scale</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Takeoff summary panel */}
          {takeoffOpen && (
            <div className="absolute top-3 right-3 bg-background/95 backdrop-blur-sm border rounded-md shadow-md p-3 text-sm z-20 min-w-[200px] max-w-[260px]" data-testid="panel-takeoff-summary">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">Takeoff Summary</span>
                <Button size="icon" variant="ghost" onClick={() => setTakeoffOpen(false)} data-testid="button-takeoff-close"><X className="w-3 h-3" /></Button>
              </div>
              {!scaled ? (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Measurements unavailable — sheet is not to scale.</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {takeoffSummary.totalAreaSqFt > 0 && (
                    <div className="flex items-center justify-between gap-4" data-testid="takeoff-total-area">
                      <span className="text-muted-foreground text-xs">Total Area</span>
                      <span className="font-medium tabular-nums text-xs">{formatSqFt(takeoffSummary.totalAreaSqFt)}</span>
                    </div>
                  )}
                  {takeoffSummary.totalLengthFt > 0 && (
                    <div className="flex items-center justify-between gap-4" data-testid="takeoff-total-length">
                      <span className="text-muted-foreground text-xs">Total Length</span>
                      <span className="font-medium tabular-nums text-xs">{formatLinearFt(takeoffSummary.totalLengthFt)}</span>
                    </div>
                  )}
                  {Object.entries(takeoffSummary.symbolCounts).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between gap-4" data-testid={`takeoff-symbol-${type}`}>
                      <span className="text-muted-foreground text-xs capitalize">{type}</span>
                      <span className="font-medium tabular-nums text-xs">{count}</span>
                    </div>
                  ))}
                  {takeoffSummary.totalAreaSqFt === 0 && takeoffSummary.totalLengthFt === 0 && Object.keys(takeoffSummary.symbolCounts).length === 0 && (
                    <div className="text-xs text-muted-foreground italic">No measurements yet.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right sidebars */}
        {showObjectList && (
          <aside className="w-56 border-l bg-card flex flex-col shrink-0" data-testid="sidebar-object-list">
            <ObjectListPanel
              objects={objects}
              selectedId={selectedId}
              multiSelectedIds={multiSelectedIds}
              layerDefs={layerDefs}
              onSelect={handleObjectListSelect}
              onToggleVisibility={handleObjectListToggleVisibility}
              onClose={() => setShowObjectList(false)}
            />
          </aside>
        )}

        {showSheetPanel && (
          <aside className="w-64 border-l bg-card flex flex-col shrink-0 overflow-y-auto" data-testid="panel-sheet">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sheet Composition</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowSheetPanel(false)}><X className="h-3 w-3" /></Button>
            </div>
            <div className="p-4 space-y-5">
              {/* Sheet Templates */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Sheet Templates</Label>
                {sheetTemplateList.length > 0 && (
                  <div className="grid grid-cols-1 gap-1">
                    {sheetTemplateList.map(tmpl => (
                      <Button
                        key={tmpl.id}
                        variant="outline"
                        size="sm"
                        className="justify-start text-xs h-8 font-normal gap-1.5"
                        onClick={() => loadTemplate(tmpl)}
                        data-testid={`template-${tmpl.id}`}
                      >
                        <BookOpen className="h-3 w-3" />
                        {tmpl.name}
                      </Button>
                    ))}
                  </div>
                )}
                {showSaveTemplateDialog ? (
                  <div className="space-y-1.5">
                    <Input
                      className="h-8 text-xs"
                      placeholder="Template name..."
                      value={saveTemplateName}
                      onChange={e => setSaveTemplateName(e.target.value)}
                      data-testid="input-template-name"
                      autoFocus
                    />
                    <div className="flex gap-1">
                      <Button size="sm" className="h-7 text-xs flex-1" onClick={saveCurrentAsTemplate} data-testid="button-confirm-save-template">
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowSaveTemplateDialog(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-xs h-8 font-normal gap-1.5"
                    onClick={() => setShowSaveTemplateDialog(true)}
                    data-testid="button-save-template"
                  >
                    <Save className="h-3 w-3" />
                    Save Current as Template
                  </Button>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-xs font-medium">Layout Preset</Label>
                <div className="grid grid-cols-1 gap-1.5">
                  {Object.entries(LAYOUT_PRESETS).map(([id, preset]) => (
                    <Button key={id} variant="outline" size="sm" className="justify-start text-xs h-8 font-normal" onClick={() => updateSheetMeta({ titleBlockPosition: preset.titleBlockPosition, notesBlockPosition: preset.notesBlockPosition })}>
                      {preset.label}
                    </Button>
                  ))}
                  <Button variant="outline" size="sm" className="justify-start text-xs h-8 font-normal text-destructive" onClick={() => updateSheetMeta({ titleBlockPosition: undefined, notesBlockPosition: undefined })}>
                    Remove All Overlays
                  </Button>
                </div>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="space-y-1.5"><Label className="text-xs font-medium">Sheet Title</Label><Input className="h-8 text-xs" value={sheetMeta.sheetTitle || ""} onChange={e => updateSheetMeta({ sheetTitle: e.target.value })} placeholder="VISUAL SCOPE SHEET" /></div>
                <div className="space-y-1.5"><Label className="text-xs font-medium">Project Name</Label><Input className="h-8 text-xs" value={sheetMeta.projectName || ""} onChange={e => updateSheetMeta({ projectName: e.target.value })} /></div>
                <div className="space-y-1.5"><Label className="text-xs font-medium">Company Name</Label><Input className="h-8 text-xs" value={sheetMeta.companyName || ""} onChange={e => updateSheetMeta({ companyName: e.target.value })} /></div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Notes Content</Label>
                  <textarea className="w-full min-h-[100px] text-xs p-2 rounded-md border bg-background" value={sheetMeta.notesContent || ""} onChange={e => updateSheetMeta({ notesContent: e.target.value })} placeholder="Enter notes here..." />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs font-medium">View Options</Label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={showMeasurementLabels && scaled} onCheckedChange={v => scaled && setShowMeasurementLabels(v)} disabled={!scaled} data-testid="switch-measurement-labels" />
                  <span className="text-xs">Measurement labels</span>
                </label>
                <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1" onClick={() => setTakeoffOpen(v => !v)} data-testid="button-takeoff-toggle">
                  <AlertCircle className="w-3 h-3" />{takeoffOpen ? "Hide" : "Show"} Takeoff
                </Button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="h-7 border-t bg-muted/30 px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
          <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" />Objects: {objects.length}/200</div>
          <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" />Pts: {totalPoints}/5000</div>
          <div className="flex items-center gap-1.5">Zoom: {Math.round(viewTransform.scale * 100)}%</div>
        </div>
        <div className="text-[10px] text-muted-foreground font-mono">
          Sheet: {sheetId.slice(0, 8)}… · Space+drag=pan · Scroll=zoom
        </div>
      </footer>

      {/* ── Export Dialog ────────────────────────────────────────────────── */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-export">
          <DialogHeader><DialogTitle>Export Visual Scope</DialogTitle></DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>Format</Label>
              <div className="flex gap-2">
                <Button size="sm" variant={exportFormat === "png" ? "default" : "outline"} onClick={() => setExportFormat("png")} data-testid="button-export-format-png">PNG</Button>
                <Button size="sm" variant={exportFormat === "pdf" ? "default" : "outline"} onClick={() => setExportFormat("pdf")} data-testid="button-export-format-pdf">PDF</Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Resolution</Label>
              <div className="flex gap-2">
                <Button size="sm" variant={exportResolution === "standard" ? "default" : "outline"} onClick={() => setExportResolution("standard")} data-testid="button-export-resolution-standard">Standard (2000px)</Button>
                <Button size="sm" variant={exportResolution === "high" ? "default" : "outline"} onClick={() => setExportResolution("high")} data-testid="button-export-resolution-high">High-Res (4000px)</Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Preset</Label>
              <Select value={exportPreset} onValueChange={v => setExportPreset(v as any)}>
                <SelectTrigger data-testid="select-export-preset"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard Proposal Sheet</SelectItem>
                  <SelectItem value="clean">Clean Visual Only</SelectItem>
                  <SelectItem value="internal">Internal Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Branding</Label>
                <Switch checked={exportBrandingEnabled} onCheckedChange={setExportBrandingEnabled} data-testid="switch-export-branding" />
              </div>
              {exportBrandingEnabled && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Company name</Label>
                  <Input value={exportCompanyName} onChange={e => setExportCompanyName(e.target.value)} placeholder="Your Company Name" data-testid="input-export-company-name" />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)} data-testid="button-export-cancel">Cancel</Button>
            <Button onClick={handleExport} disabled={isExporting} data-testid="button-export-confirm">
              {isExporting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Exporting...</> : <><Download className="w-4 h-4 mr-1" />Export {exportFormat.toUpperCase()}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
