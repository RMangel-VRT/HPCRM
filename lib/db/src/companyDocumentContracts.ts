import { z } from "zod/v4";
import { isCalendarDate } from "./schema/calendarDate";

export const COMPANY_DOCUMENT_CATEGORIES = ["tax", "licenses", "insurance", "business", "other"] as const;
export const COMPANY_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
export const companyDocumentDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate);
const fields = {
  name: z.string().trim().min(1).max(255),
  category: z.enum(COMPANY_DOCUMENT_CATEGORIES),
  expiresOn: companyDocumentDate.nullable(),
  visibility: z.enum(["office", "everyone"]),
  pinned: z.boolean(),
  role: z.enum(["pesticide_license"]).nullable(),
};
export const companyDocumentPatch = z.object(fields).partial().strict().refine(v => Object.keys(v).length > 0);
export const companyDocumentCreate = z.object({
  ...fields, uploadToken: z.string().min(1).max(4096),
  expiresOn: fields.expiresOn.optional(),
  role: z.preprocess(v => v === "" ? undefined : v, fields.role.optional()),
}).strict();
export const companyDocumentReplace = z.object({
  uploadToken: z.string().min(1).max(4096), expiresOn: fields.expiresOn.optional(),
}).strict();
/** UTC is a calendar day representation, not a business timezone. */
export function documentCalendarDaysBetween(from: string, to: string) {
  const day = (v: string) => {
    companyDocumentDate.parse(v);
    const [y, m, d] = v.split("-").map(Number);
    const date = new Date(0); date.setUTCFullYear(y, m - 1, d); date.setUTCHours(0, 0, 0, 0);
    return date.getTime() / 86400000;
  };
  return day(to) - day(from);
}
export function companyDocumentStatus(expiresOn: string | null, today: string) {
  const daysUntilExpiry = expiresOn ? documentCalendarDaysBetween(today, expiresOn) : null;
  const status = daysUntilExpiry === null ? "none" : daysUntilExpiry < 0 ? "expired" : daysUntilExpiry <= 60 ? "expiring" : "current";
  return { status, daysUntilExpiry } as { status: "none" | "expired" | "expiring" | "current"; daysUntilExpiry: number | null };
}
export interface CompanyDocumentFileDto {
  id: string; fileName: string; fileSize: number | null; uploadedAt: string;
  uploadedByName: string | null; isCurrent: boolean; openUrl: string; downloadUrl: string;
}
export interface CompanyDocumentDto {
  id: string; name: string; category: typeof COMPANY_DOCUMENT_CATEGORIES[number];
  role: "pesticide_license" | null; expiresOn: string | null; visibility: "office" | "everyone"; pinned: boolean;
  status: ReturnType<typeof companyDocumentStatus>["status"]; daysUntilExpiry: number | null;
  currentFile: { fileName: string; fileType: string | null; fileSize: number | null; uploadedAt: string; uploadedByName: string | null } | null;
  openUrl: string; downloadUrl: string; updatedAt: string;
}
export interface CompanyDocumentsResponse {
  documents: CompanyDocumentDto[];
  license: { number: string | null; documentId: string | null; expiresOn: string | null };
}
export const companyDocumentEmailInput = z.object({
  mailboxAccountId: z.string().min(1),
  to: z.array(z.string().trim().email().max(254)).min(1).max(10),
  cc: z.array(z.string().trim().email().max(254)).max(10).optional(),
  subject: z.string().trim().min(1).max(255).refine(v => !/[\r\n\u0000]/.test(v)).optional(),
  note: z.string().trim().max(2000).optional(),
  documentIds: z.array(z.string().min(1)).min(1).max(10).refine(v => new Set(v).size === v.length),
}).strict().refine(v => v.to.length + (v.cc?.length ?? 0) <= 10);
export type CompanyDocumentEmailInput = z.infer<typeof companyDocumentEmailInput>;
export interface CompanyDocumentSendDto {
  id: string; date: string; to: string[]; subject: string; sentByName: string | null;
  fromAddress?: string | null;
  deliveryStatus: string | null;
}
