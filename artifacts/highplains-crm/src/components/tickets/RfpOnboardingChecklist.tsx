import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ChecklistField = {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  isRequired: string;
  options: string[] | null;
  displayOrder: number;
};

function ChecklistItem({ field, value, readOnly, onSave }: {
  field: ChecklistField; value: string; readOnly: boolean; onSave: (value: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const required = field.isRequired === "true";
  const labelId = `rfp-checklist-label-${field.id}`;
  const save = async (next: string) => {
    if (saving || readOnly || next === value) return;
    setSaving(true);
    setFailed(false);
    try {
      await onSave(next);
      setDraft(null);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-2" data-testid={`checklist-${field.fieldKey}`}>
    <div className="flex items-center justify-between gap-2">
      <span id={labelId} className="text-sm font-medium">
        {field.fieldLabel}{required && <span className="ml-1 text-destructive">*</span>}
      </span>
      {required && value.trim() && <Badge variant="secondary" className="gap-1" data-testid={`done-${field.fieldKey}`}>
        <Check className="size-3" />{t("rfpTicket.done")}
      </Badge>}
    </div>
    {field.fieldType === "select" ? (
      <div role="group" aria-labelledby={labelId} className="inline-flex flex-wrap rounded-md border p-0.5">
        {field.options?.map((option, index) => <Button key={option} type="button" size="sm"
          variant={value === option ? "secondary" : "ghost"} aria-pressed={value === option} disabled={saving || readOnly}
          data-testid={`option-${field.fieldKey}-${index}`} onClick={() => void save(option)}>{option}</Button>)}
      </div>
    ) : field.fieldType === "textarea" ? (
      <Textarea aria-labelledby={labelId} aria-required={required} value={draft ?? value} rows={2}
        disabled={saving} readOnly={readOnly} onChange={e => setDraft(e.target.value)}
        onBlur={e => void save(e.currentTarget.value)} data-testid={`checklist-input-${field.fieldKey}`} />
    ) : (
      <Input aria-labelledby={labelId} aria-required={required} type={field.fieldType === "date" ? "date" : "text"}
        value={field.fieldType === "date" ? value.slice(0, 10) : value} disabled={saving || readOnly}
        onChange={e => void save(e.target.value)} data-testid={`checklist-input-${field.fieldKey}`} />
    )}
    {failed && <p role="alert" className="text-sm text-destructive">{t("rfpTicket.checklistSaveFailed")}</p>}
  </div>;
}

export function RfpOnboardingChecklist({ fields, getValue, readOnly, onSave }: {
  fields: ChecklistField[]; getValue: (fieldId: string) => string; readOnly: boolean;
  onSave: (fieldId: string, value: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  return <Card data-testid="card-rfp-onboarding">
    <CardHeader><CardTitle className="text-base">{t("rfpTicket.checklist")}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      {[...fields].sort((a, b) => a.displayOrder - b.displayOrder).map(field =>
        <ChecklistItem key={field.id} field={field} value={getValue(field.id)} readOnly={readOnly}
          onSave={value => onSave(field.id, value)} />)}
    </CardContent>
  </Card>;
}
