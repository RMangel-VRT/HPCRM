import { createCanvas, loadImage } from "canvas";
import type { CanvasRenderingContext2D as NodeCanvasCtx } from "canvas";
import { ObjectStorageService } from "./objectStorage";
import type { VisualScopeSheet, MarkupObject, MarkupPoint, SymbolType } from "@shared/schema";

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

function drawMarkup(
  ctx: NodeCanvasCtx,
  objects: MarkupObject[],
  width: number,
  height: number
) {
  for (const obj of objects) {
    const points = obj.points as MarkupPoint[];
    if (!points || points.length === 0) continue;

    ctx.save();

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
      ctx.lineWidth = (obj.strokeWidth || 2) * width / 1000;
      ctx.lineJoin = "round";
      ctx.stroke();

    } else if (obj.type === "polyline") {
      if (points.length < 2) { ctx.restore(); continue; }
      ctx.beginPath();
      ctx.moveTo(px(points[0][0], width), py(points[0][1], height));
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(px(points[i][0], width), py(points[i][1], height));
      }
      ctx.strokeStyle = obj.strokeColor || "#1a4d1a";
      ctx.lineWidth = (obj.strokeWidth || 2) * width / 1000;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

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

function drawLegend(
  ctx: NodeCanvasCtx,
  objects: MarkupObject[],
  width: number,
  height: number
) {
  const counts = { tree: 0, plant: 0, boulder: 0 } as Record<SymbolType, number>;
  for (const obj of objects) {
    if (obj.type === "symbol" && obj.symbolType && obj.symbolType in counts) {
      counts[obj.symbolType]++;
    }
  }

  type LegendEntry = { type: SymbolType; label: string; count: number };
  const entries: LegendEntry[] = (
    [
      { type: "tree" as SymbolType, label: "Trees" },
      { type: "plant" as SymbolType, label: "Plants" },
      { type: "boulder" as SymbolType, label: "Boulders" },
    ] as { type: SymbolType; label: string }[]
  )
    .filter((e) => counts[e.type] > 0)
    .map((e) => ({ ...e, count: counts[e.type] }));

  if (entries.length === 0) return;

  const pad = Math.round(width * 0.012);
  const iconSize = Math.round(width * 0.016);
  const rowH = Math.round(width * 0.028);
  const fontSize = Math.round(width * 0.013);
  const titleFontSize = Math.round(width * 0.015);
  const boxWidth = Math.round(width * 0.2);
  const margin = Math.round(width * 0.015);
  const boxHeight = pad * 2 + titleFontSize + pad + entries.length * rowH;
  const bx = width - boxWidth - margin;
  const by = height - boxHeight - margin;
  const radius = Math.round(pad * 0.5);

  ctx.save();

  roundRect(ctx, bx, by, boxWidth, boxHeight, radius);
  ctx.fillStyle = "rgba(255,255,255,0.90)";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = Math.max(1, Math.round(width * 0.0005));
  ctx.stroke();

  ctx.font = `bold ${titleFontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = "#111111";
  ctx.fillText("Legend", bx + pad, by + pad + titleFontSize);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const rowY = by + pad + titleFontSize + pad + i * rowH;
    const iconCx = bx + pad + iconSize * 0.5;
    const iconCy = rowY + iconSize * 0.5;
    const s = iconSize;

    drawSymbol(ctx, entry.type, iconCx, iconCy, s);

    ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = "#333333";
    ctx.shadowBlur = 0;
    ctx.fillText(
      `${entry.label} \u00d7 ${entry.count}`,
      bx + pad + iconSize + Math.round(pad * 0.6),
      rowY + iconSize * 0.75
    );
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
  const objects = (sheet.markupData as MarkupObject[] | null) ?? [];

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
  drawLegend(ctx, objects, width, height);
  return canvas.toBuffer("image/png");
}
