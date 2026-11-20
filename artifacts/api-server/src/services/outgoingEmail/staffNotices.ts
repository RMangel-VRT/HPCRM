import { publicAppUrl } from "../../lib/publicAppUrl";
import { renderEmailLayout, type Block, type EmailCompany } from "./layout";

interface NewFieldFlag {
  flagId: string;
  tagLabel: string;
  propertyName: string | null;
  crewName: string | null;
  createdByName: string | null;
  note: string | null;
  photoCount: number;
}

export function renderNewFieldFlagEmail(flag: NewFieldFlag, company: EmailCompany) {
  const { flagId, tagLabel, propertyName, crewName, createdByName, note, photoCount } = flag;
  const from = crewName ?? createdByName;
  const property = propertyName ?? "an unspecified property";
  const subject = `New field flag from ${from ?? "the field"} at ${property}`;
  const blocks: Block[] = [{ kind: "facts", rows: [
    { label: "Property", value: propertyName ?? "Not specified" },
    { label: "Crew", value: crewName ?? "Not assigned" },
    { label: "Reported by", value: createdByName ?? "Unknown" },
    { label: "Photos", value: String(photoCount) },
  ] }];
  if (note?.trim()) blocks.push({ kind: "note", label: "Field note", text: note });

  // Flag attachments are private under flag-photos/. No approved public email
  // image path serves them; staff can see them on the authenticated flag page.
  return { subject, ...renderEmailLayout({
    subject,
    preview: `${tagLabel} · ${photoCount} ${photoCount === 1 ? "photo" : "photos"}`,
    docType: "Field flag",
    docNumber: tagLabel,
    stripe: "amber",
    wording: {
      eyebrow: "New field flag",
      headline: `${tagLabel} at ${property}`,
      intro: `${from ?? "A field crew"} flagged this from the field.`,
      closing: "",
    },
    greeting: null,
    blocks,
    company,
    internal: true,
    link: { label: "Open the flag in the CRM", url: `${publicAppUrl()}/dashboard/flags/${encodeURIComponent(flagId)}` },
  }) };
}

export function renderMailboxDisconnectedEmail(mailbox: string, company: EmailCompany) {
  const subject = `Gmail sync stopped for ${mailbox}`;
  return { subject, ...renderEmailLayout({
    subject,
    preview: "Reconnect to resume syncing",
    docType: "Mailbox",
    docNumber: "Action needed",
    stripe: "red",
    wording: {
      eyebrow: "Action needed",
      headline: "Your mailbox stopped syncing",
      intro: `Gmail sync stopped for ${mailbox} because Google’s permission expired or was removed. Nothing new will sync or send from this mailbox until you reconnect it.`,
      closing: "Your sync history is safe.",
    },
    greeting: null,
    blocks: [],
    company,
    internal: true,
    link: { label: "Reconnect in Settings → Shared mailboxes", url: `${publicAppUrl()}/dashboard/settings/shared-mailboxes` },
  }) };
}
