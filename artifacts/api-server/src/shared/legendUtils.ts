import type { MarkupObject, LegendEntry, LegendState, SymbolType } from "./schema";

export const DEFAULT_LEGEND_STATE: LegendState = {
  enabled: true,
  position: "bottom-right",
  mode: "expanded",
  title: "Legend",
  showMaterialsGroup: true,
  showSymbolsGroup: true,
  showLinesGroup: true,
  showSymbolCounts: true,
  hiddenEntryIds: [],
  customLabels: {},
  entryOrder: [],
};

const SYMBOL_LABELS: Record<SymbolType, string> = {
  tree: "Tree",
  plant: "Plant",
  boulder: "Boulder",
};

const SYMBOL_COLORS: Record<SymbolType, string> = {
  tree: "#2d6a2d",
  plant: "#22c55e",
  boulder: "#9ca3af",
};

export function detectLegendEntries(objects: MarkupObject[]): LegendEntry[] {
  const materialMap = new Map<string, LegendEntry>();
  const symbolMap = new Map<string, { entry: LegendEntry; count: number }>();
  const lineMap = new Map<string, LegendEntry>();

  for (const obj of objects) {
    if (obj.type === "polygon") {
      if (obj.fillType === "texture" && obj.textureId) {
        const id = `material:${obj.textureId}`;
        if (!materialMap.has(id)) {
          materialMap.set(id, {
            id,
            kind: "material",
            label: obj.materialLabel || obj.textureId,
            color: obj.strokeColor,
            textureId: obj.textureId,
          });
        } else if (obj.materialLabel && materialMap.get(id)!.label === obj.textureId) {
          materialMap.get(id)!.label = obj.materialLabel;
        }
      } else if (obj.materialLabel) {
        const key = obj.materialLabel.toLowerCase().replace(/\s+/g, "_");
        const id = `material:label:${key}`;
        if (!materialMap.has(id)) {
          materialMap.set(id, {
            id,
            kind: "material",
            label: obj.materialLabel,
            color: obj.strokeColor,
          });
        }
      }
    }

    if (obj.type === "symbol" && obj.symbolType) {
      const id = `symbol:${obj.symbolType}`;
      if (!symbolMap.has(id)) {
        symbolMap.set(id, {
          entry: {
            id,
            kind: "symbol",
            label: SYMBOL_LABELS[obj.symbolType] || obj.symbolType,
            color: SYMBOL_COLORS[obj.symbolType] || obj.strokeColor,
            symbolType: obj.symbolType,
            count: 0,
          },
          count: 0,
        });
      }
      symbolMap.get(id)!.count++;
      symbolMap.get(id)!.entry.count = symbolMap.get(id)!.count;
    }

    if (obj.type === "polyline" && obj.legendWorthy && obj.legendStyleId) {
      const id = `line:${obj.legendStyleId}`;
      if (!lineMap.has(id)) {
        lineMap.set(id, {
          id,
          kind: "line",
          label: obj.legendStyleLabel || obj.legendStyleId,
          color: obj.strokeColor,
          lineStyleId: obj.legendStyleId,
        });
      }
    }
  }

  const materials = Array.from(materialMap.values());
  const symbols = Array.from(symbolMap.values()).map(s => s.entry);
  const lines = Array.from(lineMap.values());

  return [...materials, ...symbols, ...lines];
}

export function applyLegendState(
  allEntries: LegendEntry[],
  state: LegendState
): LegendEntry[] {
  let entries = allEntries.filter(e => {
    if (state.hiddenEntryIds.includes(e.id)) return false;
    if (e.kind === "material" && !state.showMaterialsGroup) return false;
    if (e.kind === "symbol" && !state.showSymbolsGroup) return false;
    if (e.kind === "line" && !state.showLinesGroup) return false;
    return true;
  });

  entries = entries.map(e => ({
    ...e,
    label: state.customLabels[e.id] ?? e.label,
    count: state.showSymbolCounts ? e.count : undefined,
  }));

  if (state.entryOrder.length > 0) {
    const orderMap = new Map(state.entryOrder.map((id, i) => [id, i]));
    entries.sort((a, b) => {
      const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : 999;
      const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : 999;
      return ai - bi;
    });
  } else {
    const kindOrder: Record<string, number> = { material: 0, symbol: 1, line: 2 };
    entries.sort((a, b) => (kindOrder[a.kind] ?? 3) - (kindOrder[b.kind] ?? 3));
  }

  return entries;
}
