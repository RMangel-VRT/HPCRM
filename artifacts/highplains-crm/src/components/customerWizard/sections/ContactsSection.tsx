import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { apSnapshotContact, rowKey } from "../wizardModel";
import type { ContactRow, PmManager, WizardDraft } from "../wizardModel";
import { Field, Section } from "./shared";
import type { SectionMode, SetDraft, TW } from "./shared";

interface Props {
  d: WizardDraft; setD: SetDraft; tw: TW; manager: PmManager | null; master: boolean;
  mode?: SectionMode; framed?: boolean; id?: string; testId?: string;
}

export function ContactsSection({ d, setD, tw, manager: mgr, master, mode = "create", framed, id, testId = "wizard-body-3" }: Props) {
  // Setting one primary clears the others, so exactly one contact is primary.
  const upd = (key: string, p: Partial<ContactRow>) => setD(c => ({ ...c, contacts: c.contacts.map(r => (r.key === key ? { ...r, ...p } : p.isPrimary ? { ...r, isPrimary: false } : r)) }));
  const managerShown = !!mgr && !d.contacts.some(c => c.propertyManagerId === mgr.id);
  return (
    <Section title={tw("contacts.heading")} lead={tw("contacts.lead")} testId={testId} id={id} framed={framed}>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setD(c => ({ ...c, contacts: [...c.contacts, { key: rowKey(), name: "", role: "", emails: "", phones: "", notes: "", isPrimary: c.contacts.length === 0 }] }))} data-testid="button-add-contact"><Plus className="mr-1 h-4 w-4" />{tw("contacts.add")}</Button>
        {/* One-time creation snapshot: copies AP details once into an ordinary contact row; never kept in sync. */}
        {mode === "create" && (
          <Button type="button" size="sm" variant="outline" disabled={!d.billingContactName.trim() || master} title={!d.billingContactName.trim() ? tw("contacts.sameAsApNone") : tw("contacts.sameAsApHelp")}
            onClick={() => setD(c => ({ ...c, contacts: [...c.contacts, apSnapshotContact(c)] }))} data-testid="button-same-as-ap">{tw("contacts.sameAsAp")}</Button>
        )}
      </div>
      {mode === "create" && <p className="text-xs text-muted-foreground">{d.billingContactName.trim() ? tw("contacts.sameAsApHelp") : tw("contacts.sameAsApNone")}</p>}
      {managerShown && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed bg-muted/40 p-3 text-sm" data-testid="row-manager-contact">
          <div><div className="font-medium">{mgr!.name}</div><div className="text-xs text-muted-foreground">{tw("contacts.managerAutoHelp", { name: mgr!.name })}</div></div>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{tw("contacts.managerAuto")}</span>
        </div>
      )}
      {d.contacts.length === 0 && !managerShown && <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="empty-contacts">{tw("contacts.empty")}</p>}
      <ul className="space-y-3">
        {d.contacts.map((c, i) => (
          <li key={c.key} className="space-y-3 rounded-md border p-3" data-testid={`row-contact-${i}`}>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex gap-2">{c.id && <span className="rounded bg-muted px-1.5 py-0.5">{tw("contacts.existing")}</span>}{c.source === "ap" && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary" data-testid={`badge-ap-${i}`}>{tw("contacts.apSnapshot")}</span>}</span>
              <span className="flex items-center gap-3">
                <label className="flex items-center gap-1.5"><Checkbox checked={c.isPrimary} onCheckedChange={v => upd(c.key, { isPrimary: !!v })} data-testid={`checkbox-primary-${i}`} />{tw("contacts.primary")}</label>
                <Button type="button" size="icon" variant="ghost" aria-label={tw("contacts.remove")} data-testid={`button-remove-contact-${i}`}
                  onClick={() => setD(cur => ({ ...cur, contacts: cur.contacts.filter(r => r.key !== c.key), deletedContactIds: c.id ? [...cur.deletedContactIds, c.id] : cur.deletedContactIds }))}><Trash2 className="h-4 w-4" /></Button>
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Field label={tw("contacts.name")}><Input value={c.name} onChange={e => upd(c.key, { name: e.target.value })} data-testid={`input-contact-name-${i}`} /></Field>
              <Field label={tw("contacts.role")}><Input value={c.role} onChange={e => upd(c.key, { role: e.target.value })} data-testid={`input-contact-role-${i}`} /></Field>
              <Field label={tw("contacts.emails")} hint={tw("contacts.listHint")}><Input value={c.emails} onChange={e => upd(c.key, { emails: e.target.value })} data-testid={`input-contact-emails-${i}`} /></Field>
              <Field label={tw("contacts.phones")} hint={tw("contacts.listHint")}><Input value={c.phones} onChange={e => upd(c.key, { phones: e.target.value })} data-testid={`input-contact-phones-${i}`} /></Field>
              <div className="md:col-span-2"><Field label={tw("contacts.notes")}><Textarea rows={2} value={c.notes ?? ""} onChange={e => upd(c.key, { notes: e.target.value })} data-testid={`input-contact-notes-${i}`} /></Field></div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
