import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { parseApiValidationError } from "@/lib/apiError";
import { companyToday } from "@/lib/schedulingStatus";
import {
  COMPANY_DOCUMENT_MAX_BYTES,
  type CompanyDocumentDto, type CompanyDocumentFileDto, type CompanyDocumentsResponse,
} from "../../../../../lib/db/src/companyDocumentContracts";

export type { CompanyDocumentDto, CompanyDocumentFileDto, CompanyDocumentsResponse };
export const CATEGORIES = ["tax", "licenses", "insurance", "business", "other"] as const;
export type CompanyDocumentCategory = typeof CATEGORIES[number];

const ROOT = "/api/company-documents";
/** Shared, company-scoped key: the page and the sidebar dot read the same cache entry. */
export const companyDocumentsKey = (companyId: string | null | undefined) => [ROOT, companyId ?? "none"] as const;
export const companyDocumentFilesKey = (companyId: string | null | undefined, id: string) => [ROOT, companyId ?? "none", "files", id] as const;

/** Every call binds the initiating company so a company switch mid-flight gets a 409, never cross-company data. */
export function companyRequest(companyId: string, method: string, url: string, body?: unknown, signal?: AbortSignal) {
  return apiRequest(method, url, body, { headers: { "X-Company-Id": companyId }, ...(signal ? { signal } : {}) });
}

export function useCompanyDocuments(companyId: string | null | undefined) {
  return useQuery<CompanyDocumentsResponse>({
    queryKey: companyDocumentsKey(companyId),
    queryFn: async () => (await companyRequest(companyId!, "GET", ROOT)).json(),
    enabled: !!companyId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useCompanyDocumentFiles(companyId: string | null | undefined, id: string | null, enabled: boolean) {
  return useQuery<CompanyDocumentFileDto[]>({
    queryKey: companyDocumentFilesKey(companyId, id ?? ""),
    queryFn: async () => (await companyRequest(companyId!, "GET", `${ROOT}/${encodeURIComponent(id!)}/files`)).json(),
    enabled: !!companyId && !!id && enabled,
    staleTime: 60_000,
  });
}

export function useInvalidateCompanyDocuments(companyId: string | null | undefined) {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: [ROOT, companyId ?? "none"] }), [qc, companyId]);
}

export const companyDocumentsUrl = { root: ROOT, license: `${ROOT}/license-number`, uploadUrl: `${ROOT}/upload-url`,
  doc: (id: string) => `${ROOT}/${encodeURIComponent(id)}`, files: (id: string) => `${ROOT}/${encodeURIComponent(id)}/files` };

/** Same check SettingsPage used: a chemical template prints the license footer. */
export const templateUsesLicense = (html: string | null | undefined) => /\{\{#if\s+pesticideLicenseNumber\}\}/.test(html ?? "");

export const isAttention = (d: Pick<CompanyDocumentDto, "status">) => d.status === "expiring" || d.status === "expired";
export function soonestAttention(docs: CompanyDocumentDto[]) {
  return docs.filter(isAttention).sort((a, b) => (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0))[0] ?? null;
}
export const shortName = (name: string) => name.replace(/^Certificate of insurance\s*[—-]\s*/i, "COI — ");

/** One year after today's Colorado calendar date (Feb 29 falls back to Feb 28). */
export function oneYearFromToday(today: string = companyToday()): string {
  const [y, m, d] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  return `${y + 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function formatDocDate(value: string | null | undefined, lang: string) {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", year: "numeric", timeZone: dateOnly ? "UTC" : "America/Denver" });
}

export const fileKind = (fileName?: string | null, fileType?: string | null) => {
  const ext = (fileType || fileName?.split(".").pop() || "").toLowerCase();
  return ext === "jpeg" ? "JPG" : ext ? ext.toUpperCase().slice(0, 4) : "FILE";
};
export const previewable = (fileType?: string | null, fileName?: string | null) => {
  const k = fileKind(fileName, fileType);
  return k === "PDF" ? "pdf" : k === "JPG" || k === "PNG" ? "image" : null;
};

export type PrecheckError = "tooLarge" | "unsupported";
export function precheckCompanyFile(file: File): PrecheckError | null {
  if (file.size > COMPANY_DOCUMENT_MAX_BYTES) return "tooLarge";
  if (!/\.(pdf|jpe?g|png|heic)$/i.test(file.name)) return "unsupported";
  return null;
}

type T = (k: string, o?: Record<string, unknown>) => string;
const CODE_KEYS: Record<string, string> = {
  COMPANY_DOCUMENT_EMAIL_TOO_LARGE: "emailTooLarge", COMPANY_DOCUMENT_EMAIL_FAILED: "emailFailed",
  COMPANY_DOCUMENT_MAILBOX_UNAVAILABLE: "mailboxUnavailable",
  COMPANY_DOCUMENT_TOO_LARGE: "tooLarge", COMPANY_DOCUMENT_UNSUPPORTED_TYPE: "unsupported",
  COMPANY_DOCUMENT_INVALID_FILE: "invalidFile", COMPANY_DOCUMENT_INVALID_CONTENT: "invalidFile", COMPANY_DOCUMENT_EMPTY: "invalidFile",
  COMPANY_DOCUMENT_INVALID_METADATA: "invalidDetails", COMPANY_DOCUMENT_ROLE_TAKEN: "roleTaken",
  COMPANY_DOCUMENT_COMPANY_CHANGED: "companyChanged", COMPANY_DOCUMENT_FORBIDDEN: "forbidden",
  COMPANY_DOCUMENT_NOT_FOUND: "notFound", COMPANY_DOCUMENT_FILE_MISSING: "notFound",
};
/** Server codes become plain words in the user's language; unknown codes never leak raw JSON. */
export function companyDocumentErrorText(err: unknown, t: T): string {
  if (err instanceof Error && err.message === "network") return t("companyDocuments.errors.network");
  const { code, status } = parseApiValidationError(err) as { code?: string; status?: number };
  if (code && CODE_KEYS[code]) return t(`companyDocuments.errors.${CODE_KEYS[code]}`);
  if (code && /INVALID|CORRUPT|MISMATCH/.test(code)) return t("companyDocuments.errors.invalidFile");
  if (status === 413) return t("companyDocuments.errors.tooLarge");
  if (status === 415) return t("companyDocuments.errors.unsupported");
  return t("companyDocuments.errors.generic");
}
