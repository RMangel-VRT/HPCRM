import { createCanvas, loadImage } from "canvas";
import type { CanvasRenderingContext2D as NodeCanvasCtx, Canvas as NodeCanvas } from "canvas";
import { ObjectStorageService } from "./objectStorage";
import type { VisualScopeSheet, MarkupObject, MarkupPoint, SymbolType, LegendState, LegendEntry, LayerDefinition, SheetMetadata } from "@shared/schema";
import { flattenMarkupObjects, parseMarkupData } from "@shared/schema";
import { detectLegendEntries, applyLegendState, DEFAULT_LEGEND_STATE } from "@shared/legendUtils";
import { TEXTURE_SCALE_SIZES, getTextureDef } from "@shared/textures";
import type { TextureId } from "@shared/textures";
import {
  SYMBOL_MAP,
  SYMBOL_CATEGORIES,
  getSymbolsByCategory,
  LEGACY_SYMBOL_MAP,
  type SymbolDefinition,
  type SymbolPrimitive,
} from "@shared/symbolRegistry";

export type ExportType = "base" | "overlay" | "combined";

const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_DIM = 20000;

function px(n: number, width: number) { return n * width; }
function py(n: number, height: number) { return n * height; }

function resolveSymbolDef(obj: MarkupObject): SymbolDefinition | undefined {
  if (obj.symbolTypeId) return SYMBOL_MAP.get(obj.symbolTypeId);
  if (obj.symbolType) {
    const mapped = LEGACY_SYMBOL_MAP[obj.symbolType];
    if (mapped) return SYMBOL_MAP.get(mapped);
  }
  return undefined;
}

function drawSymbolPrimitives(
  ctx: NodeCanvasCtx,
  def: SymbolDefinition,
  cx: number,
  cy: number,
  size: number,
  color: string,
  rotation: number
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(size, size);

  const sw = 0.08;

  for (const shape of def.shapes) {
    ctx.save();
    const filled = (shape as any).filled === true;

    if (shape.kind === "circle") {
      ctx.beginPath();
      ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
      if (filled) { ctx.fillStyle = color; ctx.fill(); }
      else { ctx.strokeStyle = color; ctx.lineWidth = sw; ctx.stroke(); }

    } else if (shape.kind === "ellipse") {
      ctx.save();
      if (shape.rot) ctx.rotate((shape.rot * Math.PI) / 180);
      ctx.beginPath();
      ctx.ellipse(shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, Math.PI * 2);
      if (filled) { ctx.fillStyle = color; ctx.fill(); }
      else { ctx.strokeStyle = color; ctx.lineWidth = sw; ctx.stroke(); }
      ctx.restore();

    } else if (shape.kind === "polygon") {
      ctx.beginPath();
      ctx.moveTo(shape.pts[0][0], shape.pts[0][1]);
      for (let i = 1; i < shape.pts.length; i++) {
        ctx.lineTo(shape.pts[i][0], shape.pts[i][1]);
      }
      ctx.closePath();
      if (filled) { ctx.fillStyle = color; ctx.fill(); }
      else { ctx.strokeStyle = color; ctx.lineWidth = sw; ctx.stroke(); }

    } else if (shape.kind === "polyline") {
      ctx.beginPath();
      ctx.moveTo(shape.pts[0][0], shape.pts[0][1]);
      for (let i = 1; i < shape.pts.length; i++) {
        ctx.lineTo(shape.pts[i][0], shape.pts[i][1]);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = sw;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

    } else if (shape.kind === "line") {
      ctx.beginPath();
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = sw;
      ctx.lineCap = "round";
      ctx.stroke();

    } else if (shape.kind === "rect") {
      if (filled) {
        ctx.fillStyle = color;
        ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = sw;
        ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
      }
    }

    ctx.restore();
  }

  ctx.restore();
}

function roundRect(ctx: NodeCanvasCtx, x: number, y: number, w: number, h: number, r: number) {
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
    return { cx: px((obj.points as MarkupPoint[])[0][0], width), cy: py((obj.points as MarkupPoint[])[0][1], height) };
  }
  if (obj.type === "callout") {
    return { cx: px((obj.points as MarkupPoint[])[0][0], width), cy: py((obj.points as MarkupPoint[])[0][1], height) };
  }
  const xs = (obj.points as MarkupPoint[]).map(p => p[0]);
  const ys = (obj.points as MarkupPoint[]).map(p => p[1]);
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

  return ctx.createPattern(tile as any, "repeat");
}

function drawCallout(
  ctx: NodeCanvasCtx,
  obj: MarkupObject,
  width: number,
  height: number
) {
  const points = obj.points as MarkupPoint[];
  if (points.length < 1) return;

  const bx = px(points[0][0], width);
  const by = py(points[0][1], height);
  const tx = points.length > 1 ? px(points[1][0], width) : bx;
  const ty = points.length > 1 ? py(points[1][1], height) : by;

  const BADGE_R = width * 0.028;
  const lineColor = obj.strokeColor || "#1d4ed8";
  const lw = Math.max(1, (obj.strokeWidth || 2) * width / 1000);

  const dx = bx - tx;
  const dy = by - ty;
  const len = Math.sqrt(dx * dx + dy * dy);

  ctx.save();
  ctx.globalAlpha = typeof obj.opacity === "number" ? obj.opacity : 1;

  if (len > BADGE_R * 0.5) {
    const nx = dx / len;
    const ny = dy / len;
    const lineEndX = bx - nx * BADGE_R;
    const lineEndY = by - ny * BADGE_R;
    const arrLen = width * 0.018;
    const arrW = width * 0.009;
    const baseX = tx + nx * arrLen;
    const baseY = ty + ny * arrLen;
    const perpX = -ny;
    const perpY = nx;

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lw;
    applyDash(ctx, obj.dashStyle, lw);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lineEndX, lineEndY);
    ctx.lineTo(baseX, baseY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(baseX + perpX * arrW, baseY + perpY * arrW);
    ctx.lineTo(baseX - perpX * arrW, baseY - perpY * arrW);
    ctx.closePath();
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(bx, by, BADGE_R, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.fill();
  ctx.strokeStyle = "white";
  ctx.lineWidth = Math.max(1, width * 0.003);
  ctx.setLineDash([]);
  ctx.stroke();

  const num = String(obj.calloutNumber ?? 1);
  const fontSize = Math.round(BADGE_R * 1.1);
  ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(num, bx, by);

  if (obj.label) {
    const labelFontSize = Math.round(width * 0.018);
    ctx.font = `${labelFontSize}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = lineColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(255,255,255,0.85)";
    ctx.shadowBlur = Math.round(width * 0.003);
    const labelX = bx + BADGE_R + width * 0.008;
    const truncated = obj.label.length > 25 ? obj.label.slice(0, 25) + "…" : obj.label;
    ctx.fillText(truncated, labelX, by);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
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

    if (obj.type === "callout") {
      drawCallout(ctx, obj, width, height);
      continue;
    }

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

    } else if (obj.type === "symbol") {
      const def = resolveSymbolDef(obj);
      const cx = px(points[0][0], width);
      const cy = py(points[0][1], height);
      const scale = obj.scale ?? 1;
      const rotation = obj.rotation ?? 0;
      const size = width * 0.04 * scale;
      const color = obj.strokeColor || def?.defaultColor || "#333333";

      if (def) {
        drawSymbolPrimitives(ctx, def, cx, cy, size, color, rotation);
      } else {
        // Fallback: circle
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      // Draw label below symbol if showLabel is set
      if (obj.showLabel && obj.label) {
        const fontSize = Math.round(width * 0.012);
        ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(255,255,255,0.85)";
        ctx.shadowBlur = Math.round(width * 0.002);
        ctx.fillText(obj.label, cx, cy + size + fontSize * 1.2);
        ctx.shadowBlur = 0;
        ctx.textAlign = "left";
      }

    } else if (obj.type === "text") {
      const textX = px(points[0][0], width);
      const textY = py(points[0][1], height);
      const normFontSize = obj.fontSize ?? 0.025;
      const fontSize = Math.round(normFontSize * width);
      const align = obj.textAlign ?? "center";
      ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
      ctx.fillStyle = obj.strokeColor || "#1a4d1a";
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(255,255,255,0.85)";
      ctx.shadowBlur = Math.round(width * 0.003);
      const lines = (obj.label ?? "").split("\n");
      const lineH = fontSize * 1.3;
      lines.forEach((line, i) => {
        const yOff = i * lineH - ((lines.length - 1) * lineH) / 2;
        ctx.fillText(line, textX, textY + yOff);
      });
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

  if (entry.kind === "symbol") {
    const def = entry.symbolTypeId
      ? SYMBOL_MAP.get(entry.symbolTypeId)
      : entry.symbolType
        ? SYMBOL_MAP.get(LEGACY_SYMBOL_MAP[entry.symbolType] ?? "")
        : undefined;
    if (def) {
      drawSymbolPrimitives(ctx, def, iconCx, iconCy, iconSize * 0.5, entry.color || def.defaultColor, 0);
    } else {
      ctx.beginPath();
      ctx.arc(iconCx, iconCy, iconSize * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = entry.color || "#333333";
      ctx.fill();
    }
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
    ctx.fillStyle = entry.color || "#888888";
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
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
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

    const drawSection = (sectionEntries: LegendEntry[], groupLabel: string) => {
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

function drawTitleBlock(
  ctx: NodeCanvasCtx,
  meta: SheetMetadata,
  width: number,
  height: number
) {
  const pos = meta.titleBlockPosition ?? [0.02, 0.82];
  const x = px(pos[0], width);
  const y = py(pos[1], height);

  const rows = [
    meta.sheetTitle || "Visual Scope",
    meta.propertyName ? `Property: ${meta.propertyName}` : null,
    meta.sheetDate ? `Date: ${meta.sheetDate}` : null,
    meta.projectName ? `Project: ${meta.projectName}` : null,
    meta.companyName ? `Company: ${meta.companyName}` : null,
  ].filter(Boolean) as string[];

  const pad = Math.round(width * 0.012);
  const titleFontSize = Math.round(width * 0.018);
  const bodyFontSize = Math.round(width * 0.012);
  const lineH = Math.round(width * 0.022);
  const boxW = Math.round(width * 0.28);
  const boxH = pad * 2 + titleFontSize + (rows.length - 1) * lineH + pad;
  const radius = Math.round(width * 0.006);

  ctx.save();

  roundRect(ctx, x, y, boxW, boxH, radius);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = Math.max(1, Math.round(width * 0.002));
  ctx.setLineDash([]);
  ctx.stroke();

  ctx.font = `bold ${titleFontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = "#111";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(rows[0], x + pad, y + pad + titleFontSize);

  ctx.font = `${bodyFontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = "#444";
  for (let i = 1; i < rows.length; i++) {
    ctx.fillText(rows[i], x + pad, y + pad + titleFontSize + i * lineH);
  }

  ctx.restore();
}

function drawNotesBlock(
  ctx: NodeCanvasCtx,
  meta: SheetMetadata,
  width: number,
  height: number
) {
  const pos = meta.notesBlockPosition ?? [0.72, 0.82];
  const x = px(pos[0], width);
  const y = py(pos[1], height);
  const content = meta.notesContent || "";
  const lines = content.split("\n").filter(l => l.trim() !== "");

  const pad = Math.round(width * 0.012);
  const titleFontSize = Math.round(width * 0.015);
  const bodyFontSize = Math.round(width * 0.011);
  const lineH = Math.round(width * 0.018);
  const boxW = Math.round(width * 0.26);
  const boxH = pad * 2 + titleFontSize + pad * 0.5 + lines.length * lineH + pad;
  const radius = Math.round(width * 0.006);

  ctx.save();

  roundRect(ctx, x, y, boxW, Math.max(boxH, pad * 3 + titleFontSize), radius);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = Math.max(1, Math.round(width * 0.002));
  ctx.setLineDash([]);
  ctx.stroke();

  ctx.font = `bold ${titleFontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = "#111";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Notes", x + pad, y + pad + titleFontSize);

  ctx.font = `${bodyFontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = "#333";
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.startsWith("-")) {
      line = "• " + line.slice(1).trimStart();
    }
    const truncated = line.length > 40 ? line.slice(0, 40) + "…" : line;
    ctx.fillText(truncated, x + pad, y + pad + titleFontSize + pad * 0.5 + i * lineH + bodyFontSize);
  }

  ctx.restore();
}

// ─── Pro Export Types ──────────────────────────────────────────────────────

export type ExportPreset = "standard" | "clean" | "internal";

export interface ExportBranding {
  enabled: boolean;
  companyName?: string;
}

export interface ProExportOptions {
  preset?: ExportPreset;
  width?: number;
  branding?: ExportBranding;
}

// ─── Title Block ────────────────────────────────────────────────────────────

function wrapText(ctx: NodeCanvasCtx, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawBrandingHeader(
  ctx: NodeCanvasCtx,
  width: number,
  headerHeight: number,
  companyName: string
) {
  ctx.fillStyle = "#1a4d1a";
  ctx.fillRect(0, 0, width, headerHeight);
  const fontSize = Math.round(headerHeight * 0.42);
  ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.shadowBlur = 0;
  ctx.fillText(companyName, Math.round(headerHeight * 0.35), Math.round(headerHeight / 2 + fontSize * 0.36));
  ctx.textAlign = "left";
}

function drawExportTitleBlock(
  ctx: NodeCanvasCtx,
  y: number,
  width: number,
  blockHeight: number,
  title: string,
  customerName: string,
  scopeDate: string
) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, y, width, blockHeight);

  ctx.strokeStyle = "#1a4d1a";
  ctx.lineWidth = Math.max(2, Math.round(width * 0.0018));
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();

  const pad = Math.round(width * 0.018);
  const titleFontSize = Math.round(width * 0.021);
  const subtitleFontSize = Math.round(width * 0.013);

  ctx.font = `bold ${titleFontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = "#111111";
  ctx.textAlign = "left";
  ctx.shadowBlur = 0;
  ctx.fillText(title, pad, y + pad + titleFontSize);

  ctx.font = `${subtitleFontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = "#555555";
  const sub = [customerName, scopeDate].filter(Boolean).join("   \u00b7   ");
  ctx.fillText(sub, pad, y + pad + titleFontSize + Math.round(subtitleFontSize * 1.5));

  // Right side: "Visual Scope" label
  ctx.font = `${subtitleFontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = "#aaaaaa";
  ctx.textAlign = "right";
  ctx.fillText("Visual Scope", width - pad, y + pad + titleFontSize);
  ctx.textAlign = "left";
}

// ─── Pro Export Renderer ────────────────────────────────────────────────────

export async function renderVisualScopeExport(
  sheet: VisualScopeSheet & { customerName?: string },
  options: ProExportOptions = {}
): Promise<Buffer> {
  const preset = options.preset ?? "standard";
  const targetWidth = Math.max(1200, Math.min(6000, options.width ?? 2000));
  const branding = options.branding ?? { enabled: false };

  if (!sheet.baseImagePath) throw new Error("NO_BASE_IMAGE");

  const objectStorage = new ObjectStorageService();
  let imgBuffer: Buffer;
  try {
    imgBuffer = await objectStorage.downloadByPath(sheet.baseImagePath);
  } catch (err: any) {
    throw new Error(`Visual Scope export failed: ${err?.message ?? "Object not found"}`);
  }
  if (imgBuffer.length > MAX_IMAGE_BYTES) throw new Error("BASE_IMAGE_TOO_LARGE");

  const baseImg = await loadImage(imgBuffer);
  if (baseImg.width > MAX_IMAGE_DIM || baseImg.height > MAX_IMAGE_DIM) throw new Error("BASE_IMAGE_TOO_LARGE");

  const imgWidth = targetWidth;
  const imgHeight = Math.round(targetWidth * (baseImg.height / baseImg.width));

  const layerDefs = (sheet.layerDefs as LayerDefinition[] | null) ?? null;
  const legendState: LegendState = ((sheet as any).legendState as LegendState | null) ?? DEFAULT_LEGEND_STATE;

  const hiddenLayerIds = new Set<string>();
  if (preset !== "internal" && layerDefs) {
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

  const brandingH = (branding.enabled && branding.companyName)
    ? Math.round(imgWidth * 0.030)
    : 0;
  const titleBlockH = (preset === "standard" || preset === "internal")
    ? Math.round(imgWidth * 0.052)
    : 0;
  const totalHeight = brandingH + imgHeight + titleBlockH;

  const canvas = createCanvas(imgWidth, totalHeight);
  const ctx = canvas.getContext("2d") as NodeCanvasCtx;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, imgWidth, totalHeight);

  if (brandingH > 0) {
    drawBrandingHeader(ctx, imgWidth, brandingH, branding.companyName!);
  }

  ctx.drawImage(baseImg as any, 0, brandingH, imgWidth, imgHeight);

  ctx.save();
  ctx.translate(0, brandingH);
  drawMarkup(ctx, objects, imgWidth, imgHeight);
  if (preset !== "clean") {
    drawLegend(ctx, objects, imgWidth, imgHeight, legendState);
  }
  ctx.restore();

  if (titleBlockH > 0) {
    drawExportTitleBlock(
      ctx,
      brandingH + imgHeight,
      imgWidth,
      titleBlockH,
      sheet.title || "Visual Scope",
      (sheet as any).customerName || "",
      sheet.scopeDate || ""
    );
  }

  return canvas.toBuffer("image/png");
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
  const legendState: LegendState = ((sheet as any).legendState as LegendState | null) ?? DEFAULT_LEGEND_STATE;
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

  const doc = parseMarkupData(sheet.markupData);
  const sheetMeta = doc.sheetMeta;

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

  if (sheetMeta) {
    if (sheetMeta.titleBlockVisible !== false && (sheetMeta.sheetTitle || sheetMeta.propertyName || sheetMeta.sheetDate || sheetMeta.projectName || sheetMeta.companyName)) {
      drawTitleBlock(ctx, sheetMeta, width, height);
    }
    if (sheetMeta.notesVisible !== false && sheetMeta.notesContent) {
      drawNotesBlock(ctx, sheetMeta, width, height);
    }
  }


  return canvas.toBuffer("image/png");
}
