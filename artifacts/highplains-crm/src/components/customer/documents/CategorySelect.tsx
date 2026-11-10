import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CUSTOMER_DOCUMENT_CATEGORIES, type CustomerDocumentCategory } from "./documentModel";

export function CategorySelect({ id, value, onChange, testId }: {
  id?: string; value: CustomerDocumentCategory; onChange: (c: CustomerDocumentCategory) => void; testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={v => onChange(v as CustomerDocumentCategory)}>
      <SelectTrigger id={id} data-testid={testId}><SelectValue /></SelectTrigger>
      <SelectContent>
        {CUSTOMER_DOCUMENT_CATEGORIES.map(c => (
          <SelectItem key={c} value={c} data-testid={`option-category-${c}`}>
            <span className="flex flex-col">
              <span>{t(`cp5.documents.categories.${c}`)}</span>
              {c === "irrigation" && <span className="text-[11px] text-muted-foreground">{t("cp5.documents.categories.irrigationHint")}</span>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
