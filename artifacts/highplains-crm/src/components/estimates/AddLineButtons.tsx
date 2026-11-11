import { useTranslation } from "react-i18next";
import { Droplets, Hammer, Leaf, Mountain, PenLine, Receipt, Sprout, Tractor } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LINE_TINT, LINE_TYPES, type EstimateLineType } from "@/lib/estimateBuilder";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const LINE_TYPE_ICON: Record<EstimateLineType, LucideIcon> = {
  plant: Leaf, hardscape: Mountain, irrigation: Droplets, labor: Hammer, service: Sprout, equipment: Tractor, fee: Receipt, custom: PenLine,
};

/** "Add line" group: eight outlined buttons, each with the line type's tinted icon chip. */
export function AddLineButtons({ sectionId, onAdd }: { sectionId: string; onAdd: (t: EstimateLineType) => void }) {
  const { t } = useTranslation();
  return (
    <div className="border-t bg-muted/30 px-3 py-2.5" data-testid={`bar-add-${sectionId}`}>
      <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground" id={`add-line-label-${sectionId}`}>
        {t("estimateBuilder.addLine")}
      </div>
      <div role="group" aria-labelledby={`add-line-label-${sectionId}`} data-testid={`group-add-${sectionId}`}
        className="estimate-add-buttons">
        {LINE_TYPES.map((type) => {
          const Icon = LINE_TYPE_ICON[type];
          const tint = `hsl(${LINE_TINT[type]})`;
          return (
            <Button key={type} type="button" variant="outline" size="sm" onClick={() => onAdd(type)} data-testid={`button-add-${type}-${sectionId}`}
              className={cn("h-8 min-h-8 justify-start gap-1.5 bg-background pl-1 pr-2.5 text-[12.5px] font-medium shadow-none transition-[transform,background-color]",
                "hover:bg-rail-hover active:translate-y-px focus-visible:ring-2 focus-visible:ring-[hsl(var(--rail-active-icon))] focus-visible:ring-offset-1")}
              style={{ borderColor: `color-mix(in srgb, ${tint} 30%, hsl(var(--border)))` }}>
              <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                style={{ background: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint }}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              {t(`estimateBuilder.line.type.${type}`)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
