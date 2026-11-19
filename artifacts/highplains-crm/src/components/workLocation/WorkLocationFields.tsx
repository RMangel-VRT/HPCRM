import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function WorkLocationFields({ label, details, onChange, property, disabled }: {
  label: string;
  details: string;
  onChange: (value: { label: string; details: string }) => void;
  property?: { name: string; address: string };
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-label`}>{t("workLocation.location")}</Label>
        <Input id={`${id}-label`} value={label} disabled={disabled} maxLength={500}
          onChange={e => onChange({ label: e.target.value, details })} data-testid="input-work-location-label" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-details`}>{t("workLocation.details")}</Label>
        <Textarea id={`${id}-details`} value={details} disabled={disabled} rows={2} maxLength={10000}
          onChange={e => onChange({ label, details: e.target.value })} data-testid="input-work-location-details" />
      </div>
      <Button type="button" size="sm" variant="outline" disabled={disabled || !property?.address}
        onClick={() => property && onChange({ label: property.name, details: property.address })} data-testid="button-use-work-property-address">
        {t("workLocation.usePropertyAddress")}
      </Button>
    </div>
  );
}
