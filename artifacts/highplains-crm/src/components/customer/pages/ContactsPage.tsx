import { useTranslation } from "react-i18next";
import { Copy, Users } from "lucide-react";
import type { Contact, PropertyManagementCompany, PropertyManager } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { PageEmptyState, TableSkeleton } from "@/components/customer/page";

/** Clipboard write with honest success/failure feedback. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch { return false; }
}

/** Today's "Email" button behavior, relabelled: every contact email, comma-separated, to the clipboard. */
export function allContactEmails(contacts: readonly Contact[]): string[] {
  return contacts.flatMap(c => c.emails ?? []).map(e => e.trim()).filter(Boolean);
}

/** Company name for the auto-created manager contact (contact.propertyManagerId -> manager -> company). */
export function managerContactCompany(contact: Contact, managers: readonly PropertyManager[], companies: readonly PropertyManagementCompany[]): string | null {
  if (!contact.propertyManagerId) return null;
  const manager = managers.find(m => m.id === contact.propertyManagerId);
  return companies.find(c => c.id === manager?.propertyManagementCompanyId)?.name ?? null;
}

export default function ContactsPage({ contacts, isLoading, error, onRetry, pmManagers, pmCompanies }: {
  contacts: Contact[]; isLoading: boolean; error: unknown; onRetry: () => void;
  pmManagers: PropertyManager[]; pmCompanies: PropertyManagementCompany[];
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const copy = async (text: string) => {
    const ok = await copyText(text);
    toast(ok ? { title: t("cp4.contacts.copied") } : { title: t("cp4.contacts.copyFailed"), variant: "destructive" });
  };

  if (isLoading) return <TableSkeleton rows={4} cols={4} testId="contacts-skeleton" />;
  if (error) return <PageEmptyState icon={Users} message={t("cp4.loadFailed")} testId="contacts-error"
    action={<Button size="sm" variant="outline" onClick={onRetry} data-testid="button-retry-contacts">{t("cp4.retry")}</Button>} />;
  if (!contacts.length) return <PageEmptyState icon={Users} message={t("customerDetail.noContacts")} testId="contacts-empty" />;

  const sorted = [...contacts].sort((a, b) => (a.isPrimary === "true" ? 0 : 1) - (b.isPrimary === "true" ? 0 : 1) || a.name.localeCompare(b.name));
  return (
    <div className="overflow-x-auto rounded-[10px] border" data-testid="table-contacts">
      <Table>
        <TableHeader>
          <TableRow className="bg-[hsl(var(--table-header))] hover:bg-[hsl(var(--table-header))]">
            <TableHead className="h-9">{t("cp4.contacts.name")}</TableHead>
            <TableHead className="h-9">{t("cp4.contacts.role")}</TableHead>
            <TableHead className="h-9">{t("cp4.contacts.email")}</TableHead>
            <TableHead className="h-9">{t("cp4.contacts.phone")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map(contact => {
            const fromCompany = contact.propertyManagerId ? managerContactCompany(contact, pmManagers, pmCompanies) : null;
            const emails = (contact.emails ?? []).filter(Boolean);
            const phones = (contact.phones ?? []).filter(Boolean);
            return (
              <TableRow key={contact.id} className="h-11 align-middle" data-testid={`row-contact-${contact.id}`}>
                <TableCell className="py-2">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium" data-testid={`text-contact-name-${contact.id}`}>{contact.name}</span>
                    {contact.isPrimary === "true" && (
                      <span className="rounded-full bg-[hsl(var(--rail-active))] px-2 py-0.5 text-[11.5px] font-semibold text-[hsl(var(--rail-heading))]" data-testid={`chip-primary-${contact.id}`}>
                        {t("cp4.contacts.primary")}
                      </span>
                    )}
                  </span>
                  {contact.notes && <span className="block max-w-[28rem] truncate text-xs text-muted-foreground" title={contact.notes}>{contact.notes}</span>}
                </TableCell>
                <TableCell className="py-2">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span>{contact.role || <span className="text-muted-foreground">{"\u2014"}</span>}</span>
                    {contact.propertyManagerId && (
                      <span className="rounded-full border px-2 py-0.5 text-[11.5px] text-muted-foreground" data-testid={`tag-from-company-${contact.id}`}>
                        {fromCompany ? t("cp4.contacts.fromCompany", { company: fromCompany }) : t("cp4.contacts.fromManagement")}
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="py-2">
                  {emails.length ? (
                    <span className="flex flex-col gap-0.5">
                      {emails.map((email: string, idx: number) => (
                        <span key={idx} className="inline-flex items-center gap-1">
                          <a href={`mailto:${email}`} className="break-all hover:underline" data-testid={`link-contact-email-${contact.id}-${idx}`}>{email}</a>
                          <button type="button" className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                            aria-label={t("cp4.contacts.copyEmail", { email })} onClick={() => void copy(email)} data-testid={`button-copy-email-${contact.id}-${idx}`}>
                            <Copy className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </span>
                  ) : <span className="text-muted-foreground">{"\u2014"}</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap py-2 tabular-nums">
                  {phones.length ? <span className="flex flex-col gap-0.5">{phones.map((p: string, i: number) => <a key={i} href={`tel:${p}`} className="hover:underline">{p}</a>)}</span>
                    : <span className="text-muted-foreground">{"\u2014"}</span>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
