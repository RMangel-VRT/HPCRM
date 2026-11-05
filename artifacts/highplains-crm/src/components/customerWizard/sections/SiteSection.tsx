import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { WizardDraft } from "../wizardModel";
import { Field, Section } from "./shared";
import type { SetDraft, TW } from "./shared";

export function SiteSection({ d, setD, tw, framed, id, testId = "wizard-body-4" }: { d: WizardDraft; setD: SetDraft; tw: TW; framed?: boolean; id?: string; testId?: string }) {
  const set = (p: Partial<WizardDraft["site"]>) => setD(c => ({ ...c, site: { ...c.site, ...p } }));
  return (
    <Section title={tw("site.heading")} lead={tw("site.lead")} testId={testId} id={id} framed={framed}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={tw("site.gateCode")}><Input value={d.site.gateCode} onChange={e => set({ gateCode: e.target.value })} className="font-mono" data-testid="input-site-gate" /></Field>
        <Field label={tw("site.petStationCount")}><Input inputMode="numeric" value={d.site.petStationCount} onChange={e => set({ petStationCount: e.target.value })} data-testid="input-site-pet-count" /></Field>
        <Field label={tw("site.accessNotes")}><Textarea rows={2} value={d.site.accessNotes} onChange={e => set({ accessNotes: e.target.value })} data-testid="input-site-access" /></Field>
        <Field label={tw("site.watchOutNotes")}><Textarea rows={2} value={d.site.watchOutNotes} onChange={e => set({ watchOutNotes: e.target.value })} data-testid="input-site-watch" /></Field>
        <Field label={tw("site.petStationLocations")}><Textarea rows={2} value={d.site.petStationLocations} onChange={e => set({ petStationLocations: e.target.value })} data-testid="input-site-pet-locations" /></Field>
        <Field label={tw("site.controllerLocations")}><Textarea rows={2} value={d.site.irrigationControllerLocations} onChange={e => set({ irrigationControllerLocations: e.target.value })} data-testid="input-site-controllers" /></Field>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
        <span><span className="font-medium">{tw("site.includeInRoute")}</span><span className="block text-xs text-muted-foreground">{tw("site.includeInRouteHelp")}</span></span>
        <Switch checked={d.site.includeInRoute} onCheckedChange={v => set({ includeInRoute: v })} data-testid="switch-include-route" />
      </label>
    </Section>
  );
}
