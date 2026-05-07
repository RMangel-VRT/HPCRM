export type TextureId =
  | "bark-mulch"
  | "cedar-mulch"
  | "compost-soil"
  | "native-no-mow"
  | "turf"
  | "breeze-fines"
  | "river-rock"
  | "decorative-rock"
  | "cobble"
  | "crusher-fines"
  | "diagonal-hatch"
  | "crosshatch"
  | "dot-pattern"
  | "light-grid";

export type TextureScale = "small" | "medium" | "large";

export const TEXTURE_SCALE_SIZES: Record<TextureScale, number> = {
  small: 0.018,
  medium: 0.032,
  large: 0.060,
};

export interface TextureDef {
  id: TextureId;
  name: string;
  category: "organic" | "rock" | "utility";
  color: string;
}

export const TEXTURE_LIBRARY: TextureDef[] = [
  { id: "bark-mulch",      name: "Bark Mulch",           category: "organic",  color: "#8B5E3C" },
  { id: "cedar-mulch",     name: "Cedar Mulch",          category: "organic",  color: "#A0522D" },
  { id: "compost-soil",    name: "Compost / Amended Soil",category: "organic", color: "#5C3D11" },
  { id: "native-no-mow",   name: "Native / No-Mow",      category: "organic",  color: "#4A7C3F" },
  { id: "turf",            name: "Turf",                  category: "organic",  color: "#2E7D32" },
  { id: "breeze-fines",    name: "Breeze / Fines",        category: "rock",     color: "#9E9E9E" },
  { id: "river-rock",      name: "River Rock",            category: "rock",     color: "#78909C" },
  { id: "decorative-rock", name: "Decorative Rock",       category: "rock",     color: "#607D8B" },
  { id: "cobble",          name: "2–4\" Cobble",          category: "rock",     color: "#546E7A" },
  { id: "crusher-fines",   name: "Crusher Fines",         category: "rock",     color: "#BDBDBD" },
  { id: "diagonal-hatch",  name: "Diagonal Hatch (Demo/Remove)", category: "utility", color: "#D32F2F" },
  { id: "crosshatch",      name: "Crosshatch (Replacement Zone)", category: "utility", color: "#1565C0" },
  { id: "dot-pattern",     name: "Dot Pattern (Planting Area)", category: "utility", color: "#388E3C" },
  { id: "light-grid",      name: "Light Grid (Work Zone)", category: "utility", color: "#F57F17" },
];

export const TEXTURE_MAP = new Map<TextureId, TextureDef>(
  TEXTURE_LIBRARY.map(t => [t.id, t])
);

export function getTextureDef(id: string): TextureDef | undefined {
  return TEXTURE_MAP.get(id as TextureId);
}

export const TEXTURE_CATEGORIES = [
  { key: "organic",  label: "Organic / Softscape" },
  { key: "rock",     label: "Rock / Mineral" },
  { key: "utility",  label: "Utility / Scope" },
] as const;

/**
 * Returns the SVG <path>/<circle>/etc elements to place inside a <pattern> element.
 * The pattern tile is assumed to be 1x1 in local coordinates.
 * Color is applied by the caller via stroke/fill attributes.
 */
export function getPatternSvgContent(id: TextureId): string {
  switch (id) {
    case "bark-mulch":
      return `
        <line x1="0.1" y1="0.3" x2="0.45" y2="0.25" stroke="currentColor" stroke-width="0.06" stroke-linecap="round"/>
        <line x1="0.5" y1="0.7" x2="0.85" y2="0.65" stroke="currentColor" stroke-width="0.06" stroke-linecap="round"/>
        <line x1="0.6" y1="0.2" x2="0.9" y2="0.35" stroke="currentColor" stroke-width="0.05" stroke-linecap="round"/>
        <line x1="0.05" y1="0.75" x2="0.4" y2="0.8" stroke="currentColor" stroke-width="0.05" stroke-linecap="round"/>
        <line x1="0.3" y1="0.5" x2="0.55" y2="0.55" stroke="currentColor" stroke-width="0.04" stroke-linecap="round"/>
      `;
    case "cedar-mulch":
      return `
        <line x1="0.05" y1="0.2" x2="0.3" y2="0.15" stroke="currentColor" stroke-width="0.07" stroke-linecap="round"/>
        <line x1="0.55" y1="0.4" x2="0.75" y2="0.35" stroke="currentColor" stroke-width="0.07" stroke-linecap="round"/>
        <line x1="0.2" y1="0.65" x2="0.5" y2="0.6" stroke="currentColor" stroke-width="0.06" stroke-linecap="round"/>
        <line x1="0.65" y1="0.8" x2="0.95" y2="0.85" stroke="currentColor" stroke-width="0.06" stroke-linecap="round"/>
        <circle cx="0.45" cy="0.85" r="0.04" fill="currentColor"/>
        <circle cx="0.8" cy="0.2" r="0.04" fill="currentColor"/>
      `;
    case "compost-soil":
      return `
        <circle cx="0.15" cy="0.15" r="0.07" fill="currentColor"/>
        <circle cx="0.5" cy="0.1" r="0.05" fill="currentColor"/>
        <circle cx="0.8" cy="0.25" r="0.06" fill="currentColor"/>
        <circle cx="0.25" cy="0.5" r="0.05" fill="currentColor"/>
        <circle cx="0.65" cy="0.55" r="0.07" fill="currentColor"/>
        <circle cx="0.1" cy="0.8" r="0.06" fill="currentColor"/>
        <circle cx="0.45" cy="0.75" r="0.05" fill="currentColor"/>
        <circle cx="0.85" cy="0.8" r="0.07" fill="currentColor"/>
      `;
    case "native-no-mow":
      return `
        <line x1="0.15" y1="1" x2="0.1" y2="0.55" stroke="currentColor" stroke-width="0.05" stroke-linecap="round"/>
        <line x1="0.1" y1="0.55" x2="0.05" y2="0.3" stroke="currentColor" stroke-width="0.04" stroke-linecap="round"/>
        <line x1="0.4" y1="1" x2="0.45" y2="0.5" stroke="currentColor" stroke-width="0.05" stroke-linecap="round"/>
        <line x1="0.45" y1="0.5" x2="0.55" y2="0.2" stroke="currentColor" stroke-width="0.04" stroke-linecap="round"/>
        <line x1="0.7" y1="1" x2="0.65" y2="0.6" stroke="currentColor" stroke-width="0.05" stroke-linecap="round"/>
        <line x1="0.65" y1="0.6" x2="0.7" y2="0.35" stroke="currentColor" stroke-width="0.04" stroke-linecap="round"/>
        <line x1="0.9" y1="1" x2="0.88" y2="0.65" stroke="currentColor" stroke-width="0.04" stroke-linecap="round"/>
      `;
    case "turf":
      return `
        <line x1="0" y1="0.25" x2="1" y2="0.25" stroke="currentColor" stroke-width="0.04" opacity="0.5"/>
        <line x1="0" y1="0.5" x2="1" y2="0.5" stroke="currentColor" stroke-width="0.04" opacity="0.5"/>
        <line x1="0" y1="0.75" x2="1" y2="0.75" stroke="currentColor" stroke-width="0.04" opacity="0.5"/>
        <line x1="0.2" y1="1" x2="0.15" y2="0.6" stroke="currentColor" stroke-width="0.05" stroke-linecap="round"/>
        <line x1="0.55" y1="1" x2="0.6" y2="0.6" stroke="currentColor" stroke-width="0.05" stroke-linecap="round"/>
        <line x1="0.85" y1="1" x2="0.8" y2="0.7" stroke="currentColor" stroke-width="0.05" stroke-linecap="round"/>
      `;
    case "breeze-fines":
      return `
        <circle cx="0.12" cy="0.12" r="0.05" fill="currentColor" opacity="0.6"/>
        <circle cx="0.38" cy="0.25" r="0.04" fill="currentColor" opacity="0.5"/>
        <circle cx="0.65" cy="0.1" r="0.05" fill="currentColor" opacity="0.6"/>
        <circle cx="0.88" cy="0.35" r="0.04" fill="currentColor" opacity="0.5"/>
        <circle cx="0.22" cy="0.55" r="0.04" fill="currentColor" opacity="0.6"/>
        <circle cx="0.5" cy="0.5" r="0.05" fill="currentColor" opacity="0.5"/>
        <circle cx="0.78" cy="0.62" r="0.04" fill="currentColor" opacity="0.6"/>
        <circle cx="0.08" cy="0.8" r="0.04" fill="currentColor" opacity="0.5"/>
        <circle cx="0.45" cy="0.82" r="0.05" fill="currentColor" opacity="0.6"/>
        <circle cx="0.85" cy="0.88" r="0.04" fill="currentColor" opacity="0.5"/>
      `;
    case "river-rock":
      return `
        <ellipse cx="0.25" cy="0.25" rx="0.18" ry="0.12" stroke="currentColor" stroke-width="0.05" fill="none"/>
        <ellipse cx="0.72" cy="0.3" rx="0.15" ry="0.1" stroke="currentColor" stroke-width="0.05" fill="none"/>
        <ellipse cx="0.15" cy="0.72" rx="0.12" ry="0.15" stroke="currentColor" stroke-width="0.05" fill="none"/>
        <ellipse cx="0.65" cy="0.7" rx="0.2" ry="0.13" stroke="currentColor" stroke-width="0.05" fill="none"/>
      `;
    case "decorative-rock":
      return `
        <polygon points="0.15,0.05 0.35,0.1 0.3,0.3 0.1,0.28" stroke="currentColor" stroke-width="0.05" fill="none"/>
        <polygon points="0.55,0.15 0.75,0.08 0.88,0.3 0.65,0.38" stroke="currentColor" stroke-width="0.05" fill="none"/>
        <polygon points="0.05,0.55 0.28,0.52 0.32,0.72 0.08,0.78" stroke="currentColor" stroke-width="0.05" fill="none"/>
        <polygon points="0.5,0.6 0.72,0.55 0.8,0.78 0.55,0.88" stroke="currentColor" stroke-width="0.05" fill="none"/>
      `;
    case "cobble":
      return `
        <ellipse cx="0.28" cy="0.28" rx="0.22" ry="0.18" stroke="currentColor" stroke-width="0.06" fill="none"/>
        <ellipse cx="0.75" cy="0.28" rx="0.18" ry="0.22" stroke="currentColor" stroke-width="0.06" fill="none"/>
        <ellipse cx="0.28" cy="0.75" rx="0.22" ry="0.18" stroke="currentColor" stroke-width="0.06" fill="none"/>
        <ellipse cx="0.75" cy="0.75" rx="0.18" ry="0.2" stroke="currentColor" stroke-width="0.06" fill="none"/>
      `;
    case "crusher-fines":
      return `
        <circle cx="0.1" cy="0.1" r="0.03" fill="currentColor" opacity="0.45"/>
        <circle cx="0.3" cy="0.2" r="0.025" fill="currentColor" opacity="0.45"/>
        <circle cx="0.55" cy="0.08" r="0.03" fill="currentColor" opacity="0.45"/>
        <circle cx="0.78" cy="0.18" r="0.025" fill="currentColor" opacity="0.45"/>
        <circle cx="0.92" cy="0.05" r="0.02" fill="currentColor" opacity="0.45"/>
        <circle cx="0.18" cy="0.42" r="0.025" fill="currentColor" opacity="0.45"/>
        <circle cx="0.42" cy="0.48" r="0.03" fill="currentColor" opacity="0.45"/>
        <circle cx="0.68" cy="0.38" r="0.025" fill="currentColor" opacity="0.45"/>
        <circle cx="0.88" cy="0.5" r="0.03" fill="currentColor" opacity="0.45"/>
        <circle cx="0.05" cy="0.72" r="0.03" fill="currentColor" opacity="0.45"/>
        <circle cx="0.32" cy="0.78" r="0.025" fill="currentColor" opacity="0.45"/>
        <circle cx="0.6" cy="0.68" r="0.03" fill="currentColor" opacity="0.45"/>
        <circle cx="0.82" cy="0.8" r="0.025" fill="currentColor" opacity="0.45"/>
        <circle cx="0.15" cy="0.92" r="0.02" fill="currentColor" opacity="0.45"/>
        <circle cx="0.5" cy="0.9" r="0.03" fill="currentColor" opacity="0.45"/>
        <circle cx="0.75" cy="0.95" r="0.02" fill="currentColor" opacity="0.45"/>
      `;
    case "diagonal-hatch":
      return `
        <line x1="-0.1" y1="0.1" x2="0.1" y2="-0.1" stroke="currentColor" stroke-width="0.07"/>
        <line x1="0" y1="1" x2="1" y2="0" stroke="currentColor" stroke-width="0.07"/>
        <line x1="0.4" y1="1.1" x2="1.1" y2="0.4" stroke="currentColor" stroke-width="0.07"/>
        <line x1="-0.1" y1="0.6" x2="0.6" y2="-0.1" stroke="currentColor" stroke-width="0.07"/>
      `;
    case "crosshatch":
      return `
        <line x1="-0.1" y1="0.1" x2="0.1" y2="-0.1" stroke="currentColor" stroke-width="0.06"/>
        <line x1="0" y1="1" x2="1" y2="0" stroke="currentColor" stroke-width="0.06"/>
        <line x1="0.5" y1="1.1" x2="1.1" y2="0.5" stroke="currentColor" stroke-width="0.06"/>
        <line x1="-0.1" y1="0.5" x2="0.5" y2="-0.1" stroke="currentColor" stroke-width="0.06"/>
        <line x1="1.1" y1="0.1" x2="0.9" y2="-0.1" stroke="currentColor" stroke-width="0.06"/>
        <line x1="0" y1="0" x2="1" y2="1" stroke="currentColor" stroke-width="0.06"/>
        <line x1="-0.1" y1="0.4" x2="0.4" y2="0.9" stroke="currentColor" stroke-width="0.06"/>
        <line x1="0.1" y1="-0.1" x2="1.1" y2="0.9" stroke="currentColor" stroke-width="0.06"/>
      `;
    case "dot-pattern":
      return `
        <circle cx="0.25" cy="0.25" r="0.1" fill="currentColor"/>
        <circle cx="0.75" cy="0.25" r="0.1" fill="currentColor"/>
        <circle cx="0.25" cy="0.75" r="0.1" fill="currentColor"/>
        <circle cx="0.75" cy="0.75" r="0.1" fill="currentColor"/>
      `;
    case "light-grid":
      return `
        <line x1="0" y1="0" x2="1" y2="0" stroke="currentColor" stroke-width="0.05"/>
        <line x1="0" y1="0.5" x2="1" y2="0.5" stroke="currentColor" stroke-width="0.05"/>
        <line x1="0" y1="0" x2="0" y2="1" stroke="currentColor" stroke-width="0.05"/>
        <line x1="0.5" y1="0" x2="0.5" y2="1" stroke="currentColor" stroke-width="0.05"/>
      `;
    default:
      return "";
  }
}
