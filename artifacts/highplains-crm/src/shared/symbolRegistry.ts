export type SymbolCategory =
  | "trees"
  | "shrubs"
  | "rock-hardscape"
  | "irrigation"
  | "site-markers";

export type SymbolPrimitive =
  | { kind: "circle"; cx: number; cy: number; r: number; filled?: boolean }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; rot?: number; filled?: boolean }
  | { kind: "polygon"; pts: [number, number][]; filled?: boolean }
  | { kind: "polyline"; pts: [number, number][] }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; filled?: boolean };

export interface SymbolDefinition {
  id: string;
  name: string;
  category: SymbolCategory;
  defaultColor: string;
  shapes: SymbolPrimitive[];
}

export const SYMBOL_CATEGORIES: { id: SymbolCategory; label: string }[] = [
  { id: "trees", label: "Trees" },
  { id: "shrubs", label: "Shrubs & Planting" },
  { id: "rock-hardscape", label: "Rock & Hardscape" },
  { id: "irrigation", label: "Irrigation / Drainage" },
  { id: "site-markers", label: "Site / Scope Markers" },
];

export const SYMBOL_REGISTRY: SymbolDefinition[] = [
  // ── TREES ──────────────────────────────────────────────────────────────────
  {
    id: "deciduous-tree",
    name: "Deciduous Tree",
    category: "trees",
    defaultColor: "#2d6a2d",
    shapes: [
      { kind: "circle", cx: 0, cy: -0.15, r: 0.72, filled: true },
      { kind: "line", x1: 0, y1: 0.57, x2: 0, y2: 0.92 },
    ],
  },
  {
    id: "evergreen-tree",
    name: "Evergreen Tree",
    category: "trees",
    defaultColor: "#1a5c1a",
    shapes: [
      { kind: "polygon", pts: [[0, -0.95], [0.55, -0.1], [-0.55, -0.1]], filled: true },
      { kind: "polygon", pts: [[0, -0.55], [0.7, 0.35], [-0.7, 0.35]], filled: true },
      { kind: "polygon", pts: [[0, -0.1], [0.85, 0.9], [-0.85, 0.9]], filled: true },
    ],
  },
  {
    id: "palm-tree",
    name: "Palm Tree",
    category: "trees",
    defaultColor: "#3d7a3d",
    shapes: [
      { kind: "line", x1: 0, y1: 0.9, x2: 0, y2: -0.3 },
      { kind: "line", x1: 0, y1: -0.3, x2: 0.8, y2: -0.85 },
      { kind: "line", x1: 0, y1: -0.3, x2: -0.8, y2: -0.85 },
      { kind: "line", x1: 0, y1: -0.3, x2: 0.6, y2: -0.5 },
      { kind: "line", x1: 0, y1: -0.3, x2: -0.6, y2: -0.5 },
      { kind: "line", x1: 0, y1: -0.3, x2: 0, y2: -0.95 },
    ],
  },
  {
    id: "fruit-tree",
    name: "Fruit Tree",
    category: "trees",
    defaultColor: "#4a7c2d",
    shapes: [
      { kind: "circle", cx: 0, cy: -0.15, r: 0.72, filled: false },
      { kind: "circle", cx: -0.35, cy: -0.35, r: 0.16, filled: true },
      { kind: "circle", cx: 0.35, cy: -0.25, r: 0.16, filled: true },
      { kind: "circle", cx: 0.1, cy: 0.15, r: 0.16, filled: true },
      { kind: "circle", cx: -0.2, cy: 0.1, r: 0.14, filled: true },
      { kind: "line", x1: 0, y1: 0.57, x2: 0, y2: 0.92 },
    ],
  },
  {
    id: "columnar-tree",
    name: "Columnar Tree",
    category: "trees",
    defaultColor: "#2d5c1a",
    shapes: [
      { kind: "ellipse", cx: 0, cy: 0, rx: 0.32, ry: 0.88, filled: true },
    ],
  },
  {
    id: "large-shade-tree",
    name: "Large Shade Tree",
    category: "trees",
    defaultColor: "#1e5c1e",
    shapes: [
      { kind: "circle", cx: 0, cy: 0, r: 0.88, filled: false },
      { kind: "circle", cx: 0, cy: 0, r: 0.55, filled: false },
      { kind: "line", x1: 0, y1: -0.88, x2: 0, y2: 0.88 },
      { kind: "line", x1: -0.88, y1: 0, x2: 0.88, y2: 0 },
    ],
  },

  // ── SHRUBS & PLANTING ──────────────────────────────────────────────────────
  {
    id: "shrub",
    name: "Shrub",
    category: "shrubs",
    defaultColor: "#4ade80",
    shapes: [
      { kind: "ellipse", cx: 0, cy: 0.05, rx: 0.85, ry: 0.6, filled: true },
      { kind: "circle", cx: -0.42, cy: -0.22, r: 0.38, filled: true },
      { kind: "circle", cx: 0.42, cy: -0.18, r: 0.36, filled: true },
      { kind: "circle", cx: 0, cy: -0.3, r: 0.38, filled: true },
    ],
  },
  {
    id: "hedge",
    name: "Hedge",
    category: "shrubs",
    defaultColor: "#22c55e",
    shapes: [
      { kind: "rect", x: -0.88, y: -0.45, w: 1.76, h: 0.9, filled: true },
      { kind: "line", x1: -0.44, y1: -0.45, x2: -0.44, y2: 0.45 },
      { kind: "line", x1: 0, y1: -0.45, x2: 0, y2: 0.45 },
      { kind: "line", x1: 0.44, y1: -0.45, x2: 0.44, y2: 0.45 },
    ],
  },
  {
    id: "ornamental-grass",
    name: "Ornamental Grass",
    category: "shrubs",
    defaultColor: "#86efac",
    shapes: [
      { kind: "line", x1: 0, y1: 0.85, x2: 0, y2: -0.9 },
      { kind: "line", x1: 0, y1: 0.85, x2: -0.5, y2: -0.7 },
      { kind: "line", x1: 0, y1: 0.85, x2: 0.5, y2: -0.7 },
      { kind: "line", x1: 0, y1: 0.85, x2: -0.8, y2: -0.35 },
      { kind: "line", x1: 0, y1: 0.85, x2: 0.8, y2: -0.35 },
      { kind: "line", x1: 0, y1: 0.85, x2: -0.9, y2: 0.15 },
      { kind: "line", x1: 0, y1: 0.85, x2: 0.9, y2: 0.15 },
    ],
  },
  {
    id: "groundcover",
    name: "Groundcover",
    category: "shrubs",
    defaultColor: "#4ade80",
    shapes: [
      { kind: "ellipse", cx: 0, cy: 0.2, rx: 0.88, ry: 0.42, filled: true },
      { kind: "circle", cx: -0.5, cy: 0, r: 0.28, filled: true },
      { kind: "circle", cx: 0.5, cy: 0, r: 0.28, filled: true },
      { kind: "circle", cx: 0, cy: -0.15, r: 0.3, filled: true },
    ],
  },
  {
    id: "perennial",
    name: "Perennial",
    category: "shrubs",
    defaultColor: "#86efac",
    shapes: [
      { kind: "circle", cx: 0, cy: 0, r: 0.28, filled: true },
      { kind: "ellipse", cx: 0, cy: -0.65, rx: 0.22, ry: 0.32, filled: true },
      { kind: "ellipse", cx: 0.56, cy: -0.32, rx: 0.22, ry: 0.32, rot: 60, filled: true },
      { kind: "ellipse", cx: 0.56, cy: 0.32, rx: 0.22, ry: 0.32, rot: 120, filled: true },
      { kind: "ellipse", cx: 0, cy: 0.65, rx: 0.22, ry: 0.32, filled: true },
      { kind: "ellipse", cx: -0.56, cy: 0.32, rx: 0.22, ry: 0.32, rot: 60, filled: true },
      { kind: "ellipse", cx: -0.56, cy: -0.32, rx: 0.22, ry: 0.32, rot: 120, filled: true },
    ],
  },
  {
    id: "flowering-shrub",
    name: "Flowering Shrub",
    category: "shrubs",
    defaultColor: "#4ade80",
    shapes: [
      { kind: "circle", cx: 0, cy: 0, r: 0.65, filled: false },
      { kind: "circle", cx: 0, cy: -0.65, r: 0.2, filled: true },
      { kind: "circle", cx: 0.56, cy: -0.32, r: 0.2, filled: true },
      { kind: "circle", cx: 0.56, cy: 0.32, r: 0.2, filled: true },
      { kind: "circle", cx: 0, cy: 0.65, r: 0.2, filled: true },
      { kind: "circle", cx: -0.56, cy: 0.32, r: 0.2, filled: true },
      { kind: "circle", cx: -0.56, cy: -0.32, r: 0.2, filled: true },
    ],
  },

  // ── ROCK & HARDSCAPE ──────────────────────────────────────────────────────
  {
    id: "boulder",
    name: "Boulder",
    category: "rock-hardscape",
    defaultColor: "#94a3b8",
    shapes: [
      {
        kind: "polygon",
        pts: [
          [-0.3, -0.85], [0.3, -0.85], [0.72, -0.48], [0.88, 0.1],
          [0.6, 0.72], [0, 0.9], [-0.55, 0.65], [-0.85, 0.1], [-0.68, -0.48],
        ],
        filled: true,
      },
    ],
  },
  {
    id: "stepping-stone",
    name: "Stepping Stone",
    category: "rock-hardscape",
    defaultColor: "#94a3b8",
    shapes: [
      { kind: "ellipse", cx: 0, cy: 0, rx: 0.82, ry: 0.62, filled: true },
    ],
  },
  {
    id: "river-rock",
    name: "River Rock",
    category: "rock-hardscape",
    defaultColor: "#94a3b8",
    shapes: [
      { kind: "ellipse", cx: -0.42, cy: 0.2, rx: 0.38, ry: 0.28, filled: true },
      { kind: "ellipse", cx: 0.42, cy: 0.2, rx: 0.38, ry: 0.28, filled: true },
      { kind: "ellipse", cx: 0, cy: -0.25, rx: 0.42, ry: 0.3, filled: true },
    ],
  },
  {
    id: "retaining-wall",
    name: "Retaining Wall",
    category: "rock-hardscape",
    defaultColor: "#94a3b8",
    shapes: [
      { kind: "rect", x: -0.88, y: -0.35, w: 1.76, h: 0.7, filled: true },
      { kind: "line", x1: -0.88, y1: -0.35, x2: 0.88, y2: -0.35 },
      { kind: "line", x1: -0.88, y1: 0, x2: 0.88, y2: 0 },
      { kind: "line", x1: -0.88, y1: 0.35, x2: 0.88, y2: 0.35 },
      { kind: "line", x1: -0.44, y1: -0.35, x2: -0.44, y2: 0 },
      { kind: "line", x1: 0.44, y1: 0, x2: 0.44, y2: 0.35 },
      { kind: "line", x1: 0, y1: -0.35, x2: 0, y2: 0 },
    ],
  },
  {
    id: "gravel-area",
    name: "Gravel Area",
    category: "rock-hardscape",
    defaultColor: "#94a3b8",
    shapes: [
      {
        kind: "polygon",
        pts: [[0, -0.9], [0.9, 0], [0, 0.9], [-0.9, 0]],
        filled: false,
      },
      { kind: "circle", cx: -0.35, cy: -0.35, r: 0.1, filled: true },
      { kind: "circle", cx: 0.35, cy: -0.35, r: 0.1, filled: true },
      { kind: "circle", cx: 0, cy: 0, r: 0.1, filled: true },
      { kind: "circle", cx: 0.35, cy: 0.35, r: 0.1, filled: true },
      { kind: "circle", cx: -0.35, cy: 0.35, r: 0.1, filled: true },
    ],
  },
  {
    id: "flagstone",
    name: "Flagstone",
    category: "rock-hardscape",
    defaultColor: "#94a3b8",
    shapes: [
      {
        kind: "polygon",
        pts: [[-0.2, -0.88], [0.72, -0.6], [0.88, 0.35], [0.1, 0.88], [-0.82, 0.55], [-0.75, -0.3]],
        filled: true,
      },
    ],
  },

  // ── IRRIGATION / DRAINAGE ─────────────────────────────────────────────────
  {
    id: "spray-head",
    name: "Spray Head",
    category: "irrigation",
    defaultColor: "#3b82f6",
    shapes: [
      { kind: "circle", cx: 0, cy: 0, r: 0.4, filled: true },
      { kind: "line", x1: 0, y1: -0.4, x2: 0, y2: -0.88 },
      { kind: "line", x1: 0.4, y1: 0, x2: 0.88, y2: 0 },
      { kind: "line", x1: 0, y1: 0.4, x2: 0, y2: 0.88 },
      { kind: "line", x1: -0.4, y1: 0, x2: -0.88, y2: 0 },
      { kind: "line", x1: 0.28, y1: -0.28, x2: 0.62, y2: -0.62 },
      { kind: "line", x1: 0.28, y1: 0.28, x2: 0.62, y2: 0.62 },
      { kind: "line", x1: -0.28, y1: 0.28, x2: -0.62, y2: 0.62 },
      { kind: "line", x1: -0.28, y1: -0.28, x2: -0.62, y2: -0.62 },
    ],
  },
  {
    id: "drip-emitter",
    name: "Drip Emitter",
    category: "irrigation",
    defaultColor: "#3b82f6",
    shapes: [
      { kind: "circle", cx: 0, cy: 0, r: 0.75, filled: false },
      { kind: "circle", cx: 0, cy: 0, r: 0.22, filled: true },
    ],
  },
  {
    id: "valve-box",
    name: "Valve Box",
    category: "irrigation",
    defaultColor: "#3b82f6",
    shapes: [
      { kind: "rect", x: -0.78, y: -0.78, w: 1.56, h: 1.56, filled: false },
      { kind: "line", x1: -0.78, y1: -0.78, x2: 0.78, y2: 0.78 },
      { kind: "line", x1: 0.78, y1: -0.78, x2: -0.78, y2: 0.78 },
    ],
  },
  {
    id: "drain-inlet",
    name: "Drain Inlet",
    category: "irrigation",
    defaultColor: "#3b82f6",
    shapes: [
      { kind: "circle", cx: 0, cy: 0, r: 0.82, filled: false },
      { kind: "line", x1: 0, y1: -0.82, x2: 0, y2: 0.82 },
      { kind: "line", x1: -0.82, y1: 0, x2: 0.82, y2: 0 },
    ],
  },
  {
    id: "rain-sensor",
    name: "Rain Sensor",
    category: "irrigation",
    defaultColor: "#3b82f6",
    shapes: [
      { kind: "polygon", pts: [[-0.82, 0.25], [0.82, 0.25], [0, -0.72]], filled: false },
      { kind: "line", x1: 0, y1: 0.25, x2: 0, y2: 0.88 },
      { kind: "line", x1: -0.35, y1: 0.25, x2: -0.35, y2: 0.88 },
      { kind: "line", x1: 0.35, y1: 0.25, x2: 0.35, y2: 0.88 },
    ],
  },
  {
    id: "backflow-preventer",
    name: "Backflow Preventer",
    category: "irrigation",
    defaultColor: "#3b82f6",
    shapes: [
      { kind: "rect", x: -0.55, y: -0.82, w: 1.1, h: 0.62, filled: true },
      { kind: "rect", x: -0.82, y: -0.2, w: 1.64, h: 0.62, filled: true },
      { kind: "line", x1: -0.82, y1: 0.42, x2: -0.82, y2: 0.82 },
      { kind: "line", x1: 0.82, y1: 0.42, x2: 0.82, y2: 0.82 },
    ],
  },

  // ── SITE / SCOPE MARKERS ──────────────────────────────────────────────────
  {
    id: "property-line-marker",
    name: "Property Line",
    category: "site-markers",
    defaultColor: "#f59e0b",
    shapes: [
      { kind: "line", x1: -0.88, y1: -0.88, x2: -0.88, y2: 0.88 },
      { kind: "line", x1: -0.88, y1: 0.88, x2: 0.88, y2: 0.88 },
      { kind: "line", x1: -0.88, y1: -0.88, x2: 0.88, y2: -0.88 },
      { kind: "line", x1: 0.88, y1: -0.88, x2: 0.88, y2: 0.88 },
    ],
  },
  {
    id: "setback-marker",
    name: "Setback Line",
    category: "site-markers",
    defaultColor: "#f59e0b",
    shapes: [
      { kind: "line", x1: -0.88, y1: -0.35, x2: 0.88, y2: -0.35 },
      { kind: "line", x1: -0.88, y1: 0.35, x2: 0.88, y2: 0.35 },
      { kind: "line", x1: -0.55, y1: -0.82, x2: -0.55, y2: 0.82 },
      { kind: "line", x1: 0.55, y1: -0.82, x2: 0.55, y2: 0.82 },
    ],
  },
  {
    id: "existing-tree-marker",
    name: "Existing Tree (Remain)",
    category: "site-markers",
    defaultColor: "#f59e0b",
    shapes: [
      { kind: "circle", cx: 0, cy: 0, r: 0.78, filled: false },
      { kind: "line", x1: -0.55, y1: -0.55, x2: 0.55, y2: 0.55 },
      { kind: "line", x1: 0.55, y1: -0.55, x2: -0.55, y2: 0.55 },
    ],
  },
  {
    id: "remove-marker",
    name: "Remove Element",
    category: "site-markers",
    defaultColor: "#ef4444",
    shapes: [
      { kind: "line", x1: -0.78, y1: -0.78, x2: 0.78, y2: 0.78 },
      { kind: "line", x1: 0.78, y1: -0.78, x2: -0.78, y2: 0.78 },
      { kind: "circle", cx: 0, cy: 0, r: 0.88, filled: false },
    ],
  },
  {
    id: "note-flag",
    name: "Note Flag",
    category: "site-markers",
    defaultColor: "#f59e0b",
    shapes: [
      { kind: "line", x1: -0.5, y1: -0.88, x2: -0.5, y2: 0.88 },
      { kind: "polygon", pts: [[-0.5, -0.88], [0.82, -0.45], [-0.5, -0.02]], filled: true },
    ],
  },
  {
    id: "area-marker",
    name: "Area Marker",
    category: "site-markers",
    defaultColor: "#f59e0b",
    shapes: [
      { kind: "polygon", pts: [[0, -0.88], [0.88, 0], [0, 0.88], [-0.88, 0]], filled: false },
      { kind: "circle", cx: 0, cy: 0, r: 0.22, filled: true },
    ],
  },
];

export const SYMBOL_MAP: Map<string, SymbolDefinition> = new Map(
  SYMBOL_REGISTRY.map((s) => [s.id, s])
);

export function getSymbolDef(id: string): SymbolDefinition | undefined {
  return SYMBOL_MAP.get(id);
}

export function getSymbolsByCategory(cat: SymbolCategory): SymbolDefinition[] {
  return SYMBOL_REGISTRY.filter((s) => s.category === cat);
}

export const LEGACY_SYMBOL_MAP: Record<string, string> = {
  tree: "deciduous-tree",
  plant: "shrub",
  boulder: "boulder",
};
