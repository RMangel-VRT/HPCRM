import { createCanvas, loadImage } from "canvas";
import type { CanvasRenderingContext2D as NodeCanvasCtx, Canvas as NodeCanvas } from "canvas";
import { ObjectStorageService } from "./objectStorage";
import type { VisualScopeSheet, MarkupObject, MarkupPoint, SymbolType, LegendState, LegendEntry, LayerDefinition } from "@shared/schema";
import { flattenMarkupObjects } from "@shared/schema";
import { detectLegendEntries, applyLegendState, DEFAULT_LEGEND_STATE } from "@shared/legendUtils";
import { TEXTURE_SCALE_SIZES, getTextureDef } from "@shared/textures";
import type { TextureId } from "@shared/textures";

export type ExportType = "base" | "overlay" | "combined";

const MAX_IMAGE_BYTES = 30 * 1024 * 1024; // 30 MB
const MAX_IMAGE_DIM = 20000; // pixels

function px(n: number, width: number) { return n * width; }
function py(n: number, height: number) { return n * height; }

const DEFAULT_SYMBOL_COLORS: Record<SymbolType, string> = {
  tree: "#2d6a2d",
  plant: "#22c55e",
  boulder: "#9ca3af",
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}

function drawSymbol(
  ctx: NodeCanvasCtx,
  symbolType: SymbolType,
  cx: number,
  cy: number,
  s: number,
  color?: string
) {
  const fill = color || DEFAULT_SYMBOL_COLORS[symbolType];
  ctx.beginPath();
  if (symbolType === "tree") {
    ctx.moveTo(cx, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.5, cy + s * 0.5);
    ctx.lineTo(cx - s * 0.5, cy + s * 0.5);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  } else if (symbolType === "plant") {
    ctx.arc(cx, cy, s * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  } else if (symbolType === "boulder") {
    ctx.ellipse(cx, cy, s * 0.5, s * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

function roundRect(
  ctx: NodeCanvasCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function getObjectCenter(obj: MarkupObject, width: number, height: number): { cx: number; cy: number } {
  if (obj.type === "symbol" || obj.type === "text") {
    return { cx: px(obj.points[0][0], width), cy: py(obj.points[0][1], height) };
  }
  const xs = obj.points.map(p => p[0]);
  const ys = obj.points.map(p => p[1]);
  return {
    cx: px((Math.min(...xs) + Math.max(...xs)) / 2, width),
    cy: py((Math.min(...ys) + Math.max(...ys)) / 2, height),
  };
}

function applyDash(ctx: NodeCanvasCtx, dashStyle: string | undefined, lw: number) {
  if (dashStyle === "dashed") ctx.setLineDash([lw * 5, lw * 3]);
  else if (dashStyle === "dotted") ctx.setLineDash([lw, lw * 2]);
  else ctx.setLineDash([]);
}

function drawTexturePattern(
  ctx: NodeCanvasCtx,
  textureId: string,
  tilePixels: number
): ReturnType<NodeCanvasCtx["createPattern"]> | null {
  const texDef = getTextureDef(textureId);
  if (!texDef) {
    console.warn("[VisualScopeRenderer] Unknown textureId:", textureId);
    return null;
  }

  const tile = createCanvas(tilePixels, tilePixels);
  const tc = tile.getContext("2d") as NodeCanvasCtx;
  const s = tilePixels;
  const color = texDef.color;

  tc.strokeStyle = color;
  tc.fillStyle = color;
  tc.lineWidth = Math.max(1, s * 0.055);
  tc.lineCap = "round";

  const id = textureId as TextureId;

  if (id === "bark-mulch") {
    tc.strokeStyle = color; tc.lineWidth = Math.max(1, s * 0.06);
    [[0.1,0.3,0.45,0.25],[0.5,0.7,0.85,0.65],[0.6,0.2,0.9,0.35],[0.05,0.75,0.4,0.8],[0.3,0.5,0.55,0.55]].forEach(([x1,y1,x2,y2]) => {
      tc.beginPath(); tc.moveTo(x1*s,y1*s); tc.lineTo(x2*s,y2*s); tc.stroke();
    });
  } else if (id === "cedar-mulch") {
    tc.lineWidth = Math.max(1, s * 0.07);
    [[0.05,0.2,0.3,0.15],[0.55,0.4,0.75,0.35],[0.2,0.65,0.5,0.6],[0.65,0.8,0.95,0.85]].forEach(([x1,y1,x2,y2]) => {
      tc.beginPath(); tc.moveTo(x1*s,y1*s); tc.lineTo(x2*s,y2*s); tc.stroke();
    });
    [[0.45,0.85,0.04],[0.8,0.2,0.04]].forEach(([cx,cy,r]) => {
      tc.beginPath(); tc.arc(cx*s,cy*s,r*s,0,Math.PI*2); tc.fill();
    });
  } else if (id === "compost-soil") {
    [[0.15,0.15,0.07],[0.5,0.1,0.05],[0.8,0.25,0.06],[0.25,0.5,0.05],[0.65,0.55,0.07],[0.1,0.8,0.06],[0.45,0.75,0.05],[0.85,0.8,0.07]].forEach(([cx,cy,r]) => {
      tc.beginPath(); tc.arc(cx*s,cy*s,r*s,0,Math.PI*2); tc.fill();
    });
  } else if (id === "native-no-mow") {
    tc.lineWidth = Math.max(1, s * 0.05);
    [[0.15,1,0.1,0.55],[0.1,0.55,0.05,0.3],[0.4,1,0.45,0.5],[0.45,0.5,0.55,0.2],[0.7,1,0.65,0.6],[0.65,0.6,0.7,0.35],[0.9,1,0.88,0.65]].forEach(([x1,y1,x2,y2]) => {
      tc.beginPath(); tc.moveTo(x1*s,y1*s); tc.lineTo(x2*s,y2*s); tc.stroke();
    });
  } else if (id === "turf") {
    tc.globalAlpha = 0.5; tc.lineWidth = Math.max(1, s * 0.04);
    [[0,0.25,1,0.25],[0,0.5,1,0.5],[0,0.75,1,0.75]].forEach(([x1,y1,x2,y2]) => {
      tc.beginPath(); tc.moveTo(x1*s,y1*s); tc.lineTo(x2*s,y2*s); tc.stroke();
    });
    tc.globalAlpha = 1; tc.lineWidth = Math.max(1, s * 0.05);
    [[0.2,1,0.15,0.6],[0.55,1,0.6,0.6],[0.85,1,0.8,0.7]].forEach(([x1,y1,x2,y2]) => {
      tc.beginPath(); tc.moveTo(x1*s,y1*s); tc.lineTo(x2*s,y2*s); tc.stroke();
    });
  } else if (id === "breeze-fines") {
    [[0.12,0.12,0.05,0.6],[0.38,0.25,0.04,0.5],[0.65,0.1,0.05,0.6],[0.88,0.35,0.04,0.5],[0.22,0.55,0.04,0.6],[0.5,0.5,0.05,0.5],[0.78,0.62,0.04,0.6],[0.08,0.8,0.04,0.5],[0.45,0.82,0.05,0.6],[0.85,0.88,0.04,0.5]].forEach(([cx,cy,r,a]) => {
      tc.globalAlpha = a; tc.beginPath(); tc.arc(cx*s,cy*s,r*s,0,Math.PI*2); tc.fill();
    });
    tc.globalAlpha = 1;
  } else if (id === "river-rock") {
    tc.strokeStyle = color; tc.lineWidth = Math.max(1, s * 0.05); tc.fillStyle = "transparent";
    [[0.25,0.25,0.18,0.12],[0.72,0.3,0.15,0.1],[0.15,0.72,0.12,0.15],[0.65,0.7,0.2,0.13]].forEach(([cx,cy,rx,ry]) => {
      tc.beginPath(); tc.ellipse(cx*s,cy*s,rx*s,ry*s,0,0,Math.PI*2); tc.stroke();
    });
  } else if (id === "decorative-rock") {
    tc.strokeStyle = color; tc.lineWidth = Math.max(1, s * 0.05); tc.fillStyle = "transparent";
    [[[0.15,0.05],[0.35,0.1],[0.3,0.3],[0.1,0.28]],[[0.55,0.15],[0.75,0.08],[0.88,0.3],[0.65,0.38]],[[0.05,0.55],[0.28,0.52],[0.32,0.72],[0.08,0.78]],[[0.5,0.6],[0.72,0.55],[0.8,0.78],[0.55,0.88]]].forEach(pts => {
      tc.beginPath(); tc.moveTo(pts[0][0]*s,pts[0][1]*s);
      pts.slice(1).forEach(p => tc.lineTo(p[0]*s,p[1]*s));
      tc.closePath(); tc.stroke();
    });
  } else if (id === "cobble") {
    tc.strokeStyle = color; tc.lineWidth = Math.max(1, s * 0.06); tc.fillStyle = "transparent";
    [[0.28,0.28,0.22,0.18],[0.75,0.28,0.18,0.22],[0.28,0.75,0.22,0.18],[0.75,0.75,0.18,0.2]].forEach(([cx,cy,rx,ry]) => {
      tc.beginPath(); tc.ellipse(cx*s,cy*s,rx*s,ry*s,0,0,Math.PI*2); tc.stroke();
    });
  } else if (id === "crusher-fines") {
    const pts2 = [[0.1,0.1,0.03,0.45],[0.3,0.2,0.025,0.45],[0.55,0.08,0.03,0.45],[0.78,0.18,0.025,0.45],[0.92,0.05,0.02,0.45],[0.18,0.42,0.025,0.45],[0.42,0.48,0.03,0.45],[0.68,0.38,0.025,0.45],[0.88,0.5,0.03,0.45],[0.05,0.72,0.03,0.45],[0.32,0.78,0.025,0.45],[0.6,0.68,0.03,0.45],[0.82,0.8,0.025,0.45],[0.15,0.92,0.02,0.45],[0.5,0.9,0.03,0.45],[0.75,0.95,0.02,0.45]];
    pts2.forEach(([cx,cy,r,a]) => {
      tc.globalAlpha = a; tc.beginPath(); tc.arc(cx*s,cy*s,r*s,0,Math.PI*2); tc.fill();
    });
    tc.globalAlpha = 1;
  } else if (id === "diagonal-hatch") {
    tc.lineWidth = Math.max(1, s * 0.07);
    [[-0.1,0.1,0.1,-0.1],[0,1,1,0],[0.4,1.1,1.1,0.4],[-0.1,0.6,0.6,-0.1]].forEach(([x1,y1,x2,y2]) => {
      tc.beginPath(); tc.moveTo(x1*s,y1*s); tc.lineTo(x2*s,y2*s); tc.stroke();
    });
  } else if (id === "crosshatch") {
    tc.lineWidth = Math.max(1, s * 0.06);
    [[-0.1,0.1,0.1,-0.1],[0,1,1,0],[0.5,1.1,1.1,0.5],[-0.1,0.5,0.5,-0.1],[1.1,0.1,0.9,-0.1],[0,0,1,1],[-0.1,0.4,0.4,0.9],[0.1,-0.1,1.1,0.9]].forEach(([x1,y1,x2,y2]) => {
      tc.beginPath(); tc.moveTo(x1*s,y1*s); tc.lineTo(x2*s,y2*s); tc.stroke();
    });
  } else if (id === "dot-pattern") {
    [[0.25,0.25],[0.75,0.25],[0.25,0.75],[0.75,0.75]].forEach(([cx,cy]) => {
      tc.beginPath(); tc.arc(cx*s,cy*s,0.1*s,0,Math.PI*2); tc.fill();
    });
  } else if (id === "light-grid") {
    tc.lineWidth = Math.max(1, s * 0.05);
    [[0,0,1,0],[0,0.5,1,0.5],[0,0,0,1],[0.5,0,0.5,1]].forEach(([x1,y1,x2,y2]) => {
      tc.beginPath(); tc.moveTo(x1*s,y1*s); tc.lineTo(x2*s,y2*s); tc.stroke();
    });
  }

  return ctx.createPattern(tile as unknown as HTMLCanvasElement, "repeat");
}

function drawMarkup(
  ctx: NodeCanvasCtx,
  objects: MarkupObject[],
  width: number,
  height: number
) {
  const sorted = [...objects].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  for (const obj of sorted) {
    const points = obj.points as MarkupPoint[];
    if (!points || points.length === 0) continue;

    ctx.save();
    ctx.globalAlpha = typeof obj.opacity === "number" ? obj.opacity : 1;

    const rotation = obj.rotation ?? 0;
    if (rotation !== 0) {
      const { cx, cy } = getObjectCenter(obj, width, height);
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    if (obj.type === "polygon") {
      const isTexture = obj.fillType === "texture" && !!obj.textureId && !!getTextureDef(obj.textureId);

      ctx.beginPath();
      ctx.moveTo(px(points[0][0], width), py(points[0][1], height));
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(px(points[i][0], width), py(points[i][1], height));
      }
      ctx.closePath();

      if (isTexture) {
        const scaleKey = obj.textureScale ?? "medium";
        const tilePixels = Math.max(8, Math.round(TEXTURE_SCALE_SIZES[scaleKey] * width));
        const texOpacity = obj.textureOpacity ?? 0.85;

        // Draw light base tint
        ctx.save();
        const baseFill = obj.fillColor || "#1a4d1a";
        ctx.fillStyle = baseFill;
        ctx.globalAlpha = 0.12;
        ctx.fill();
        ctx.restore();

        // Draw texture pattern
        ctx.save();
        try {
          const pattern = drawTexturePattern(ctx, obj.textureId!, tilePixels);
          if (pattern) {
            ctx.fillStyle = pattern;
            ctx.globalAlpha = texOpacity;
            ctx.fill();
          } else {
            // Fallback to solid fill
            ctx.fillStyle = obj.fillColor || "rgba(29,101,29,0.2)";
            ctx.globalAlpha = 1;
            ctx.fill();
          }
        } catch (err) {
          console.warn("[VisualScopeRenderer] Texture fill failed, falling back to solid:", err);
          ctx.fillStyle = obj.fillColor || "rgba(29,101,29,0.2)";
          ctx.globalAlpha = 1;
          ctx.fill();
        }
        ctx.restore();
      } else {
        ctx.fillStyle = obj.fillColor || "rgba(29,101,29,0.2)";
        ctx.fill();
      }

      ctx.strokeStyle = obj.strokeColor || "#1a4d1a";
      const lw = (obj.strokeWidth || 2) * width / 1000;
      ctx.lineWidth = lw;
      ctx.lineJoin = "round";
      applyDash(ctx, obj.dashStyle, lw);
      ctx.stroke();
      ctx.setLineDash([]);

    } else if (obj.type === "polyline") {
      if (points.length < 2) { ctx.restore(); continue; }
      ctx.beginPath();
      ctx.moveTo(px(points[0][0], width), py(points[0][1], height));
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(px(points[i][0], width), py(points[i][1], height));
      }
      ctx.strokeStyle = obj.strokeColor || "#1a4d1a";
      const lw = (obj.strokeWidth || 2) * width / 1000;
      ctx.lineWidth = lw;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      applyDash(ctx, obj.dashStyle, lw);
      ctx.stroke();
      ctx.setLineDash([]);

    } else if (obj.type === "symbol" && obj.symbolType) {
      const cx = px(points[0][0], width);
      const cy = py(points[0][1], height);
      const s = width * 0.03;
      drawSymbol(ctx, obj.symbolType, cx, cy, s, obj.strokeColor || undefined);

    } else if (obj.type === "text") {
      const textX = px(points[0][0], width);
      const textY = py(points[0][1], height);
      const fontSize = Math.round(width * 0.012);
      ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
      ctx.fillStyle = obj.strokeColor || "#1a4d1a";
      ctx.shadowColor = "rgba(255,255,255,0.85)";
      ctx.shadowBlur = Math.round(width * 0.003);
      ctx.fillText(obj.label ?? "", textX, textY);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }
}

function drawLegendEntry(
  ctx: NodeCanvasCtx,
  entry: LegendEntry,
  x: number,
  y: number,
  iconSize: number,
  fontSize: number,
  showCounts: boolean
) {
  const iconCx = x + iconSize * 0.5;
  const iconCy = y + iconSize * 0.5;

  if (entry.kind === "symbol" && entry.symbolType) {
    drawSymbol(ctx, entry.symbolType, iconCx, iconCy, iconSize, entry.color);
  } else if (entry.kind === "line") {
    ctx.strokeStyle = entry.color || "#555";
    ctx.lineWidth = Math.max(1.5, iconSize * 0.12);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, iconCy);
    ctx.lineTo(x + iconSize, iconCy);
    ctx.stroke();
  } else {
    // material — color swatch
    const rgb = hexToRgb(entry.color || "#888888");
    ctx.fillStyle = rgb
      ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.85)`
      : (entry.color || "#888888");
    ctx.beginPath();
    roundRect(ctx, x + 1, y + 1, iconSize - 2, iconSize - 2, 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  let label = entry.label;
  if (showCounts && entry.kind === "symbol" && entry.count !== undefined) {
    label = `${label} \u00d7 ${entry.count}`;
  }

  ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = "#333333";
  ctx.shadowBlur = 0;
  ctx.fillText(label, x + iconSize + Math.round(iconSize * 0.4), y + iconSize * 0.78);
}

function drawLegendGroupHeader(
  ctx: NodeCanvasCtx,
  label: string,
  x: number,
  y: number,
  fontSize: number
) {
  ctx.font = `bold ${Math.round(fontSize * 0.85)}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = "#888888";
  ctx.fillText(label.toUpperCase(), x, y + fontSize * 0.8);
}

function drawLegend(
  ctx: NodeCanvasCtx,
  objects: MarkupObject[],
  width: number,
  height: number,
  legendState: LegendState
) {
  if (!legendState.enabled) return;

  const allEntries = detectLegendEntries(objects);
  const entries = applyLegendState(allEntries, legendState);

  if (entries.length === 0) return;

  const pad = Math.round(width * 0.012);
  const iconSize = Math.round(width * 0.016);
  const rowH = Math.round(width * 0.028);
  const fontSize = Math.round(width * 0.013);
  const titleFontSize = Math.round(width * 0.015);
  const groupHeaderH = Math.round(width * 0.022);
  const boxWidth = Math.round(width * 0.22);
  const margin = Math.round(width * 0.015);
  const radius = Math.round(pad * 0.5);

  const compact = legendState.mode === "compact";

  const materials = entries.filter(e => e.kind === "material");
  const symbols = entries.filter(e => e.kind === "symbol");
  const lines = entries.filter(e => e.kind === "line");

  // Compute content height
  let contentH = pad + titleFontSize + pad; // title row
  if (!compact) {
    if (legendState.showMaterialsGroup && materials.length > 0) {
      contentH += groupHeaderH + materials.length * rowH;
    }
    if (legendState.showSymbolsGroup && symbols.length > 0) {
      contentH += groupHeaderH + symbols.length * rowH;
    }
    if (legendState.showLinesGroup && lines.length > 0) {
      contentH += groupHeaderH + lines.length * rowH;
    }
    contentH += pad;
  } else {
    // compact: single row of dot swatches
    contentH += Math.round(iconSize * 1.5) + pad;
  }

  const boxHeight = contentH;

  // Determine position corner
  let bx: number, by: number;
  switch (legendState.position) {
    case "top-left":
      bx = margin; by = margin; break;
    case "top-right":
      bx = width - boxWidth - margin; by = margin; break;
    case "bottom-left":
      bx = margin; by = height - boxHeight - margin; break;
    case "bottom-right":
    default:
      bx = width - boxWidth - margin; by = height - boxHeight - margin; break;
  }

  ctx.save();

  // Background
  roundRect(ctx, bx, by, boxWidth, boxHeight, radius);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = Math.max(1, Math.round(width * 0.0005));
  ctx.stroke();

  // Title
  ctx.font = `bold ${titleFontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = "#111111";
  ctx.fillText(legendState.title || "Legend", bx + pad, by + pad + titleFontSize);

  if (compact) {
    // Compact: tiny swatches in a row
    let cx = bx + pad;
    const rowY = by + pad + titleFontSize + pad;
    const compactIconSize = Math.round(iconSize * 0.8);
    const compactFontSize = Math.round(fontSize * 0.85);
    for (const entry of entries) {
      if (cx + compactIconSize + 60 > bx + boxWidth - pad) break;
      drawLegendEntry(ctx, entry, cx, rowY, compactIconSize, compactFontSize, false);
      const labelLen = Math.min((legendState.customLabels[entry.id] ?? entry.label).length * compactFontSize * 0.6, 70);
      cx += compactIconSize + labelLen + pad;
    }
  } else {
    let curY = by + pad + titleFontSize + Math.round(pad * 0.5);

    function drawSection(sectionEntries: LegendEntry[], groupLabel: string) {
      if (sectionEntries.length === 0) return;
      curY += Math.round(pad * 0.4);
      drawLegendGroupHeader(ctx, groupLabel, bx + pad, curY, groupHeaderH);
      curY += groupHeaderH;
      for (const entry of sectionEntries) {
        drawLegendEntry(ctx, entry, bx + pad, curY, iconSize, fontSize, legendState.showSymbolCounts);
        curY += rowH;
      }
    }

    if (legendState.showMaterialsGroup) drawSection(materials, "Materials");
    if (legendState.showSymbolsGroup) drawSection(symbols, "Symbols");
    if (legendState.showLinesGroup) drawSection(lines, "Lines");
  }

  ctx.restore();
}

export async function renderVisualScope(
  sheet: VisualScopeSheet,
  type: ExportType,
  width: number
): Promise<Buffer> {
  if (!sheet.baseImagePath) {
    throw new Error("NO_BASE_IMAGE");
  }

  const objectStorage = new ObjectStorageService();
  let imgBuffer: Buffer;
  try {
    imgBuffer = await objectStorage.downloadByPath(sheet.baseImagePath);
  } catch (err: any) {
    throw new Error(`Visual Scope export failed: ${err?.message ?? "Object not found"}`);
  }

  if (imgBuffer.length > MAX_IMAGE_BYTES) {
    throw new Error("BASE_IMAGE_TOO_LARGE");
  }

  const baseImg = await loadImage(imgBuffer);

  if (baseImg.width > MAX_IMAGE_DIM || baseImg.height > MAX_IMAGE_DIM) {
    throw new Error("BASE_IMAGE_TOO_LARGE");
  }

  const height = Math.round(width * baseImg.height / baseImg.width);
  const layerDefs = (sheet.layerDefs as LayerDefinition[] | null) ?? null;
  const legendState: LegendState = (sheet.legendState as LegendState | null) ?? DEFAULT_LEGEND_STATE;
  const hiddenLayerIds = new Set<string>();
  if (layerDefs) {
    for (const l of layerDefs) {
      if (!l.visible) hiddenLayerIds.add(l.id);
    }
  }

  const rawObjects = flattenMarkupObjects(sheet.markupData);
  const objects = rawObjects.filter(obj => {
    const layerId = obj.layerId ?? (
      obj.type === "polygon" ? "areas" :
      obj.type === "polyline" ? "lines" :
      obj.type === "symbol" ? "symbols" : "text-callouts"
    );
    return !hiddenLayerIds.has(layerId);
  });

  if (type === "base") {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(baseImg as any, 0, 0, width, height);
    return canvas.toBuffer("image/png");
  }

  if (type === "overlay") {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    drawMarkup(ctx, objects, width, height);
    return canvas.toBuffer("image/png");
  }

  // combined
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(baseImg as any, 0, 0, width, height);
  drawMarkup(ctx, objects, width, height);
  drawLegend(ctx, objects, width, height, legendState);
  return canvas.toBuffer("image/png");
}
