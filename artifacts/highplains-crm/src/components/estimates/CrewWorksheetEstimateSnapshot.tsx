import { useTranslation } from "react-i18next";
import { formatEstimateUnit } from "../../../../../lib/db/src/estimateUnits";
import type { EstimateWorksheetSection } from "../../../../../lib/db/src/estimateContracts";
import type { CrewWorksheetPhoto, CrewWorksheetWithDetails } from "@shared/schema";

export function worksheetPhotoUrl(photo: CrewWorksheetPhoto, companyId?: string) {
  if (photo.storageObjectPath.startsWith("/objects/estimate-version-photos/")) {
    return `/api/crew-worksheets/${encodeURIComponent(photo.crewWorksheetId)}/photos/${encodeURIComponent(photo.id)}/image${companyId ? `?company=${encodeURIComponent(companyId)}` : ""}`;
  }
  return `/objects/${photo.storageObjectPath.replace(/^\//, "")}`;
}

export function CrewWorksheetEstimateSnapshot({ worksheet }: { worksheet: CrewWorksheetWithDetails }) {
  const { t } = useTranslation();
  const sections = (worksheet.estimateLinesSnapshot as EstimateWorksheetSection[] | null | undefined)
    ?.filter(section => section.lines.length) ?? [];
  if (!sections.length) return null;
  return (
    <section className="space-y-2 rounded-md border p-4 print:border-0 print:p-0" data-testid="worksheet-estimate-lines">
      <h2 className="font-semibold">{t("crewWorksheets.estimateLineItems")}</h2>
      {sections.map((section, index) => (
        <div key={index}>
          <h3 className="text-sm font-medium">{section.name}</h3>
          <ul className="list-disc pl-5 text-sm">
            {section.lines.map((line, i) => (
              <li key={i} className="break-words">
                {line.quantity} {formatEstimateUnit(line.unit)} — {line.name}
                {line.detail && <div className="whitespace-pre-wrap text-xs text-muted-foreground">{line.detail}</div>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
