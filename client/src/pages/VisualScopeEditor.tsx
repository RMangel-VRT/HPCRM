import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  MousePointer,
  Pentagon,
  Minus,
  TreePine,
  Flower,
  Circle,
  Type,
  Trash2,
  Check,
  Loader2,
  Info,
  Undo2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { MarkupObject, MarkupPoint, SymbolType } from "@shared/schema";

type ActiveTool = "select" | "polygon" | "polyline" | "tree" | "plant" | "boulder" | "text";

interface VisualScopeEditorProps {
  sheetId: string;
  baseImagePath: string;
  initialMarkup: MarkupObject[];
  onSaved?: () => void;
}

const MAX_UNDO_STEPS = 20;

const DEFAULT_SYMBOL_COLORS: Record<SymbolType, string> = {
  tree: "#2d6a2d",
  plant: "#22c55e",
  boulder: "#9ca3af",
};

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

function pointToSegmentDistance(p: MarkupPoint, a: MarkupPoint, b: MarkupPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
}

function hitTest(obj: MarkupObject, pt: MarkupPoint): boolean {
  if (obj.type === "symbol" || obj.type === "text") {
    return distance(pt, obj.points[0]) < 0.05;
  }
  if (obj.points.length < 2) return false;
  for (let i = 0; i < obj.points.length - 1; i++) {
    if (pointToSegmentDistance(pt, obj.points[i], obj.points[i + 1]) < 0.025) return true;
  }
  if (obj.type === "polygon" && obj.points.length > 2) {
    if (pointToSegmentDistance(pt, obj.points[obj.points.length - 1], obj.points[0]) < 0.025) return true;
  }
  return false;
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

function SymbolSvg({ type, color, size = 16 }: { type: SymbolType; color?: string; size?: number }) {
  const fill = color || DEFAULT_SYMBOL_COLORS[type];
  if (type === "tree") {
    return (
      <svg width={size} height={size} viewBox="-1 -1 2 2">
        <polygon points="0,-0.9 0.85,0.7 -0.85,0.7" fill={fill} />
      </svg>
    );
  }
  if (type === "plant") {
    return (
      <svg width={size} height={size} viewBox="-1 -1 2 2">
        <circle cx="0" cy="0" r="0.85" fill={fill} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="-1 -1 2 2">
      <ellipse cx="0" cy="0" rx="0.9" ry="0.6" fill={fill} />
    </svg>
  );
}

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

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
    <input
      ref={inputRef}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === "Enter") onCommit();
        if (e.key === "Escape") onCancel();
        e.stopPropagation();
      }}
      onBlur={onCommit}
      style={{
        position: "absolute",
        left,
        top,
        transform: "translate(-50%, -50%)",
        fontSize: "13px",
        border: "1.5px solid #f59e0b",
        borderRadius: "4px",
        padding: "2px 8px",
        background: "white",
        zIndex: 20,
        minWidth: "80px",
        outline: "none",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}
      data-testid="input-text-label"
    />
  );
}

interface MarkupShapeProps {
  obj: MarkupObject;
  selected: boolean;
}

function MarkupShape({ obj, selected }: MarkupShapeProps) {
  const sw = obj.strokeWidth / 1000;
  const selRing = "#f59e0b";
  const selSw = 0.003;

  if (obj.type === "polygon") {
    return (
      <g>
        <polygon
          points={toSvgPoints(obj.points)}
          stroke={obj.strokeColor}
          fill={obj.fillColor}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        {selected && obj.points.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={0.008} fill={selRing} />
        ))}
      </g>
    );
  }

  if (obj.type === "polyline") {
    return (
      <g>
        <polyline
          points={toSvgPoints(obj.points)}
          stroke={obj.strokeColor}
          fill="none"
          strokeWidth={sw}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {selected && obj.points.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={0.008} fill={selRing} />
        ))}
      </g>
    );
  }

  if (obj.type === "symbol") {
    const [x, y] = obj.points[0];
    const scale = 0.03;
    const color = obj.strokeColor;
    let inner: React.ReactNode = null;
    if (obj.symbolType === "tree") {
      inner = <polygon points="0,-0.5 0.5,0.5 -0.5,0.5" fill={color} />;
    } else if (obj.symbolType === "plant") {
      inner = <circle cx="0" cy="0" r="0.45" fill={color} />;
    } else {
      inner = <ellipse cx="0" cy="0" rx="0.5" ry="0.35" fill={color} />;
    }
    return (
      <g>
        <g transform={`translate(${x} ${y}) scale(${scale})`}>{inner}</g>
        {selected && (
          <circle cx={x} cy={y} r={0.045} fill="none" stroke={selRing} strokeWidth={selSw} />
        )}
      </g>
    );
  }

  if (obj.type === "text") {
    const [x, y] = obj.points[0];
    return (
      <g>
        <text
          x={x}
          y={y}
          fontSize={0.025}
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
    </g>
  );
}

export default function VisualScopeEditor({ sheetId, baseImagePath, initialMarkup, onSaved }: VisualScopeEditorProps) {
  const { t } = useTranslation();
  const [objects, setObjects] = useState<MarkupObject[]>(initialMarkup);
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeColor, setActiveColor] = useState<string>("#1a4d1a");
  const [inProgressPoints, setInProgressPoints] = useState<MarkupPoint[]>([]);
  const [previewPoint, setPreviewPoint] = useState<MarkupPoint | null>(null);
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [selectionPanelText, setSelectionPanelText] = useState("");

  const hasUserEdited = useRef(false);
  const undoStack = useRef<MarkupObject[][]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragPushedUndo = useRef(false);

  const totalPoints = objects.reduce((sum, o) => sum + o.points.length, 0);
  const isAtLimit = objects.length >= 200 || totalPoints >= 5000;

  const selectedObj = selectedId ? objects.find(o => o.id === selectedId) ?? null : null;

  // Sync selection panel text when selection changes or the selected object's label changes
  useEffect(() => {
    if (selectedObj?.type === "text") {
      setSelectionPanelText(selectedObj.label || "Label");
    }
  }, [selectedId, selectedObj?.label]);

  // Reset editor state (including undo history) when the sheet or base image changes
  useEffect(() => {
    setObjects(initialMarkup);
    setActiveTool("select");
    setSelectedId(null);
    setActiveColor("#1a4d1a");
    setInProgressPoints([]);
    setPreviewPoint(null);
    setDragging(null);
    setEditingTextId(null);
    setEditingTextValue("");
    setSelectionPanelText("");
    undoStack.current = [];
    hasUserEdited.current = false;
    dragPushedUndo.current = false;
  }, [sheetId, baseImagePath]);

  // Push current objects onto the undo stack (max 20)
  const pushUndo = useCallback((current: MarkupObject[]) => {
    undoStack.current = [...undoStack.current.slice(-MAX_UNDO_STEPS + 1), current];
  }, []);

  // Undo last action
  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    hasUserEdited.current = true;
    setObjects(prev);
    setSelectedId(null);
  }, []);

  useEffect(() => {
    if (!hasUserEdited.current) return;
    setSaveStatus("unsaved");
    const timer = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await apiRequest("PATCH", `/api/visual-scope-sheets/${sheetId}`, { markupData: objects });
        setSaveStatus("saved");
        onSaved?.();
      } catch {
        setSaveStatus("unsaved");
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [objects]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const inTextField = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active instanceof HTMLElement && active.isContentEditable);
      if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey && !inTextField) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && document.activeElement === document.body) {
        setObjects(prev => {
          pushUndo(prev);
          hasUserEdited.current = true;
          return prev.filter(o => o.id !== selectedId);
        });
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, undo, pushUndo]);

  const changeTool = useCallback((tool: ActiveTool) => {
    setActiveTool(tool);
    setSelectedId(null);
    setInProgressPoints([]);
    setPreviewPoint(null);
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setObjects(prev => {
      pushUndo(prev);
      hasUserEdited.current = true;
      return prev.filter(o => o.id !== selectedId);
    });
    setSelectedId(null);
  }, [selectedId, pushUndo]);

  // Change the color of selected item or update activeColor
  const handleColorChange = useCallback((color: string) => {
    setActiveColor(color);
    if (!selectedId) return;
    setObjects(prev => {
      pushUndo(prev);
      hasUserEdited.current = true;
      return prev.map(o => {
        if (o.id !== selectedId) return o;
        if (o.type === "polygon") {
          return { ...o, strokeColor: color, fillColor: hexToRgba(color, 0.15) };
        }
        return { ...o, strokeColor: color, fillColor: color };
      });
    });
  }, [selectedId, pushUndo]);

  // Get the "current color" to show in color picker
  const currentColorForPicker = selectedObj ? selectedObj.strokeColor : activeColor;

  const commitPolyline = useCallback((pts: MarkupPoint[]) => {
    if (pts.length < 2) return;
    setObjects(prev => {
      pushUndo(prev);
      hasUserEdited.current = true;
      return [...prev, {
        id: nanoid8(),
        type: "polyline",
        points: pts,
        strokeColor: activeColor,
        fillColor: "none",
        strokeWidth: 2,
        createdAt: new Date().toISOString(),
      }];
    });
    setInProgressPoints([]);
    setPreviewPoint(null);
  }, [activeColor, pushUndo]);

  const commitPolygon = useCallback((pts: MarkupPoint[]) => {
    if (pts.length < 3) return;
    setObjects(prev => {
      pushUndo(prev);
      hasUserEdited.current = true;
      return [...prev, {
        id: nanoid8(),
        type: "polygon",
        points: pts,
        strokeColor: activeColor,
        fillColor: hexToRgba(activeColor, 0.15),
        strokeWidth: 2,
        createdAt: new Date().toISOString(),
      }];
    });
    setInProgressPoints([]);
    setPreviewPoint(null);
  }, [activeColor, pushUndo]);

  const commitTextEdit = useCallback(() => {
    if (!editingTextId) return;
    const label = editingTextValue.trim();
    setObjects(prev => {
      pushUndo(prev);
      hasUserEdited.current = true;
      return prev.map(o => o.id === editingTextId ? { ...o, label: label || "Label" } : o);
    });
    setEditingTextId(null);
    setEditingTextValue("");
  }, [editingTextId, editingTextValue, pushUndo]);

  const cancelTextEdit = useCallback(() => {
    if (!editingTextId) return;
    const wasNew = objects.find(o => o.id === editingTextId && o.label === "Label");
    if (wasNew) {
      setObjects(prev => {
        pushUndo(prev);
        hasUserEdited.current = true;
        return prev.filter(o => o.id !== editingTextId);
      });
    }
    setEditingTextId(null);
    setEditingTextValue("");
  }, [editingTextId, objects, pushUndo]);

  // Commit text label change from selection panel
  const commitSelectionPanelText = useCallback(() => {
    if (!selectedId) return;
    const label = selectionPanelText.trim() || "Label";
    setObjects(prev => {
      const current = prev.find(o => o.id === selectedId);
      if (current && current.label === label) return prev;
      pushUndo(prev);
      hasUserEdited.current = true;
      return prev.map(o => o.id === selectedId ? { ...o, label } : o);
    });
  }, [selectedId, selectionPanelText, pushUndo]);

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    e.preventDefault();

    if (editingTextId) return;

    const pt = clientToSvg(svgRef.current, e.clientX, e.clientY);

    if (activeTool === "select") {
      let found = false;
      for (let i = objects.length - 1; i >= 0; i--) {
        if (hitTest(objects[i], pt)) {
          const obj = objects[i];
          setSelectedId(obj.id);
          setActiveColor(obj.strokeColor);
          if (obj.type === "text") {
            setSelectionPanelText(obj.label || "Label");
          }
          const orig = obj.points[0];
          dragPushedUndo.current = false;
          setDragging({ id: obj.id, startX: pt[0], startY: pt[1], origX: orig[0], origY: orig[1] });
          svgRef.current.setPointerCapture(e.pointerId);
          found = true;
          break;
        }
      }
      if (!found) setSelectedId(null);
      return;
    }

    if (isAtLimit) return;

    if (activeTool === "polygon") {
      if (inProgressPoints.length >= 3 && distance(pt, inProgressPoints[0]) < 0.025) {
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

    const symbolTypeMap: Record<string, SymbolType | undefined> = { tree: "tree", plant: "plant", boulder: "boulder" };
    const symType = symbolTypeMap[activeTool];
    if (symType) {
      const color = DEFAULT_SYMBOL_COLORS[symType];
      setObjects(prev => {
        pushUndo(prev);
        hasUserEdited.current = true;
        return [...prev, {
          id: nanoid8(),
          type: "symbol",
          symbolType: symType,
          points: [pt],
          strokeColor: color,
          fillColor: color,
          strokeWidth: 2,
          createdAt: new Date().toISOString(),
        }];
      });
      return;
    }

    if (activeTool === "text") {
      const newId = nanoid8();
      setObjects(prev => {
        pushUndo(prev);
        hasUserEdited.current = true;
        return [...prev, {
          id: newId,
          type: "text",
          points: [pt],
          label: "Label",
          strokeColor: activeColor,
          fillColor: "none",
          strokeWidth: 1,
          createdAt: new Date().toISOString(),
        }];
      });
      setSelectedId(newId);
      setEditingTextId(newId);
      setEditingTextValue("Label");
    }
  }, [activeTool, objects, inProgressPoints, isAtLimit, editingTextId, commitPolygon, activeColor, pushUndo]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const pt = clientToSvg(svgRef.current, e.clientX, e.clientY);

    if (inProgressPoints.length > 0) {
      setPreviewPoint(pt);
    }

    if (dragging) {
      const draggingObj = objects.find(o => o.id === dragging.id);
      const isMovable = draggingObj?.type === "symbol" || draggingObj?.type === "text";
      if (!dragPushedUndo.current && isMovable) {
        dragPushedUndo.current = true;
        pushUndo(objects);
      }
      const dx = pt[0] - dragging.startX;
      const dy = pt[1] - dragging.startY;
      const newX = clamp(dragging.origX + dx);
      const newY = clamp(dragging.origY + dy);
      hasUserEdited.current = true;
      setObjects(prev => prev.map(o => {
        if (o.id !== dragging.id) return o;
        if (o.type !== "symbol" && o.type !== "text") return o;
        return { ...o, points: [[newX, newY]] };
      }));
    }
  }, [inProgressPoints, dragging, pushUndo, objects]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
    dragPushedUndo.current = false;
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (activeTool === "polyline" && inProgressPoints.length >= 2) {
      commitPolyline(inProgressPoints);
    } else if (activeTool === "polygon" && inProgressPoints.length >= 2) {
      commitPolygon(inProgressPoints);
    }
  }, [activeTool, inProgressPoints, commitPolyline, commitPolygon]);

  const treeCnt = objects.filter(o => o.type === "symbol" && o.symbolType === "tree").length;
  const plantCnt = objects.filter(o => o.type === "symbol" && o.symbolType === "plant").length;
  const boulderCnt = objects.filter(o => o.type === "symbol" && o.symbolType === "boulder").length;
  const hasSymbols = treeCnt > 0 || plantCnt > 0 || boulderCnt > 0;
  const canUndo = undoStack.current.length > 0;

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

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b flex-wrap" data-testid="toolbar-markup">
        <ToolBtn tool="select" icon={MousePointer} label="Select" />
        <ToolBtn tool="polygon" icon={Pentagon} label="Polygon — click to add points, click near first point to close" />
        <ToolBtn tool="polyline" icon={Minus} label="Polyline — click to add points, double-click to finish" />
        <Separator orientation="vertical" className="h-6 mx-1" />
        <ToolBtn tool="tree" icon={TreePine} label="Tree" />
        <ToolBtn tool="plant" icon={Flower} label="Plant" />
        <ToolBtn tool="boulder" icon={Circle} label="Boulder" />
        <ToolBtn tool="text" icon={Type} label="Text label" />
        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Color picker */}
        <div className="relative flex items-center" title="Draw color — applies to new shapes and selected items">
          <label
            htmlFor="color-picker"
            className="flex items-center cursor-pointer"
            aria-label="Color picker"
          >
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

        {/* Undo button */}
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

        {/* Delete button */}
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

        {inProgressPoints.length > 0 && (
          <span className="text-xs text-muted-foreground ml-2 italic" data-testid="text-drawing-hint">
            {activeTool === "polygon"
              ? "Click near first point to close, or double-click to finish."
              : "Double-click to finish."}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground" data-testid="text-save-status">
          {saveStatus === "saving" && <><Loader2 className="w-3 h-3 animate-spin" />{t("common.saving")}</>}
          {saveStatus === "saved" && <><Check className="w-3 h-3 text-green-600" />{t("common.save")}</>}
          {saveStatus === "unsaved" && t("common.save")}
        </div>
      </div>

      {/* Selection edit panel */}
      {selectedObj && (
        <div
          className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 flex-wrap"
          data-testid="panel-selection-edit"
        >
          <span className="text-xs font-medium text-muted-foreground shrink-0">Selected:</span>

          {/* Color picker for selected item */}
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

          {/* Text edit field for text items */}
          {selectedObj.type === "text" && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Label</span>
              <input
                type="text"
                value={selectionPanelText}
                onChange={e => setSelectionPanelText(e.target.value)}
                onBlur={commitSelectionPanelText}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    commitSelectionPanelText();
                    e.currentTarget.blur();
                  }
                  e.stopPropagation();
                }}
                className="text-xs px-2 py-1 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                style={{ minWidth: "80px" }}
                data-testid="input-selection-label"
              />
            </div>
          )}

          {/* Delete button in selection panel */}
          <Button
            size="sm"
            variant="ghost"
            onClick={deleteSelected}
            className="text-destructive hover:text-destructive"
            data-testid="button-selection-delete"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Delete
          </Button>
        </div>
      )}

      {/* Complexity warning */}
      {isAtLimit && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-b" data-testid="banner-markup-limit">
          <Info className="w-3 h-3 shrink-0" />
          Markup is very complex. Simplify shapes before adding more.
        </div>
      )}

      {/* Editor canvas */}
      <div
        ref={containerRef}
        style={{
          position: "relative",
          lineHeight: 0,
          aspectRatio: "1 / 1",
          maxHeight: "calc(100vh - 320px)",
          maxWidth: "calc(100vh - 320px)",
          width: "100%",
        }}
      >
        <img
          src={baseImagePath}
          alt="Base image"
          style={{ width: "100%", height: "100%", display: "block" }}
          data-testid="img-base-image"
          draggable={false}
        />
        <svg
          ref={svgRef}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            cursor: activeTool === "select" ? "default" : "crosshair",
            touchAction: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        >
          {objects.map(obj => (
            <MarkupShape key={obj.id} obj={obj} selected={obj.id === selectedId} />
          ))}
          {inProgressPoints.length > 0 && (
            <InProgressShape points={inProgressPoints} preview={previewPoint} tool={activeTool} color={activeColor} />
          )}
        </svg>

        {editingTextId && (() => {
          const obj = objects.find(o => o.id === editingTextId);
          if (!obj) return null;
          return (
            <TextEditOverlay
              obj={obj}
              svgRef={svgRef as React.RefObject<SVGSVGElement>}
              containerRef={containerRef as React.RefObject<HTMLDivElement>}
              value={editingTextValue}
              onChange={setEditingTextValue}
              onCommit={commitTextEdit}
              onCancel={cancelTextEdit}
            />
          );
        })()}
      </div>

      {/* Legend */}
      {hasSymbols && (
        <div className="flex items-center gap-4 px-3 py-2 border-t text-sm flex-wrap" data-testid="panel-legend">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Legend</span>
          {treeCnt > 0 && (
            <div className="flex items-center gap-1.5" data-testid="legend-tree">
              <SymbolSvg type="tree" size={14} />
              <span className="text-xs">Tree</span>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">×{treeCnt}</span>
            </div>
          )}
          {plantCnt > 0 && (
            <div className="flex items-center gap-1.5" data-testid="legend-plant">
              <SymbolSvg type="plant" size={14} />
              <span className="text-xs">Plant</span>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">×{plantCnt}</span>
            </div>
          )}
          {boulderCnt > 0 && (
            <div className="flex items-center gap-1.5" data-testid="legend-boulder">
              <SymbolSvg type="boulder" size={14} />
              <span className="text-xs">Boulder</span>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">×{boulderCnt}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
