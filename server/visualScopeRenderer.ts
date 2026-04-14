import { createCanvas, loadImage } from "canvas";
import type { CanvasRenderingContext2D as NodeCanvasCtx } from "canvas";
import { ObjectStorageService } from "./objectStorage";
import type { VisualScopeSheet, MarkupObject, MarkupPoint, SymbolType, LegendState, LegendEntry } from "@shared/schema";
import { flattenMarkupObjects } from "@shared/schema";
import { detectLegendEntries, applyLegendState, DEFAULT_LEGEND_STATE } from "@shared/legendUtils";

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
      ctx.beginPath();
      ctx.moveTo(px(points[0][0], width), py(points[0][1], height));
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(px(points[i][0], width), py(points[i][1], height));
      }
      ctx.closePath();
      ctx.fillStyle = obj.fillColor || "rgba(29,101,29,0.2)";
      ctx.fill();
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
  const objects = flattenMarkupObjects(sheet.markupData);
  const legendState: LegendState = (sheet.legendState as LegendState | null) ?? DEFAULT_LEGEND_STATE;

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
