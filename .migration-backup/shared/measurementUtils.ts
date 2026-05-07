import type { MarkupPoint, MarkupObject, CaptureParams } from "./schema";

export function isSheetScaled(captureParams: CaptureParams | null | undefined): boolean {
  if (!captureParams) return false;
  return (
    typeof captureParams.centerLat === "number" &&
    typeof captureParams.centerLng === "number" &&
    typeof captureParams.zoom === "number" &&
    typeof captureParams.widthUsed === "number" &&
    captureParams.widthUsed > 0
  );
}

function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

function metersPerNormalizedUnit(captureParams: CaptureParams): number {
  const mpp = metersPerPixel(captureParams.centerLat, captureParams.zoom);
  return mpp * captureParams.widthUsed;
}

export function computeAreaSqFt(
  points: MarkupPoint[],
  captureParams: CaptureParams | null | undefined
): number | null {
  if (!captureParams || !isSheetScaled(captureParams)) return null;
  if (points.length < 3) return null;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  area = Math.abs(area) / 2;
  const mpu = metersPerNormalizedUnit(captureParams);
  const sqMeters = area * mpu * mpu;
  return sqMeters * 10.7639;
}

export function computeLengthFt(
  points: MarkupPoint[],
  captureParams: CaptureParams | null | undefined
): number | null {
  if (!captureParams || !isSheetScaled(captureParams)) return null;
  if (points.length < 2) return null;
  let totalNorm = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const dy = points[i + 1][1] - points[i][1];
    totalNorm += Math.sqrt(dx * dx + dy * dy);
  }
  const mpu = metersPerNormalizedUnit(captureParams);
  const meters = totalNorm * mpu;
  return meters * 3.28084;
}

export function computeObjectMeasurements(
  obj: MarkupObject,
  captureParams: CaptureParams | null | undefined
): { areaSqFt?: number; lengthFt?: number } {
  if (!captureParams || !isSheetScaled(captureParams)) return {};
  if (obj.type === "polygon" && obj.points.length >= 3) {
    const area = computeAreaSqFt(obj.points, captureParams);
    return area !== null ? { areaSqFt: area } : {};
  }
  if (obj.type === "polyline" && obj.points.length >= 2) {
    const len = computeLengthFt(obj.points, captureParams);
    return len !== null ? { lengthFt: len } : {};
  }
  return {};
}

export function formatSqFt(sqFt: number): string {
  return `${Math.round(sqFt).toLocaleString()} SF`;
}

export function formatLinearFt(ft: number): string {
  return `${Math.round(ft).toLocaleString()} LF`;
}
