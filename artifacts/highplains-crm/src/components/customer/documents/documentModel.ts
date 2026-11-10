import { parseApiValidationError } from "@/lib/apiError";

// Driver-free shared contract, like the other CRM validation contracts.
import {
  CUSTOMER_DOCUMENT_CATEGORIES, CUSTOMER_DOCUMENT_MAX_BYTES,
  type CustomerDocumentCategory, type CustomerDocumentDto, type CustomerContractDocumentDto,
} from "../../../../../../lib/db/src/customerDocumentContracts";
export { CUSTOMER_DOCUMENT_CATEGORIES, CUSTOMER_DOCUMENT_MAX_BYTES };
export type { CustomerDocumentCategory, CustomerDocumentDto, CustomerContractDocumentDto };
export const NOTE_MAX = 500;
export const NAME_MAX = 255;

export const CONTRACT_DOCUMENT_KINDS = ["signed", "review", "clean", "their_form", "clarifications", "other"] as const;
export type ContractDocumentKind = typeof CONTRACT_DOCUMENT_KINDS[number];

export type DocumentFilter = "all" | CustomerDocumentCategory | "contracts";
export const DOCUMENT_FILTERS: readonly DocumentFilter[] = ["all", ...CUSTOMER_DOCUMENT_CATEGORIES, "contracts"];

export const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "heic", "heif", "docx", "xlsx"] as const;
export const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.docx,.xlsx,application/pdf,image/jpeg,image/png,image/heic,image/heif";

export type DocKind = "pdf" | "image" | "doc" | "sheet" | "unknown";

const ext = (s: string) => { const m = /\.([a-z0-9]+)$/i.exec(s.trim()); return m ? m[1].toLowerCase() : ""; };

/** Kind from stored MIME, then legacy fileType. Unknown stays unknown. */
export function documentKind(d: Pick<CustomerDocumentDto, "mimeType" | "fileType">): DocKind {
  const mime = (d.mimeType ?? "").toLowerCase();
  const ft = (d.fileType ?? "").toLowerCase();
  const probe = (v: string): DocKind | null => {
    if (!v) return null;
    if (v === "application/pdf" || v === "pdf" || v.endsWith("/pdf")) return "pdf";
    if (v.startsWith("image/") || ["jpg", "jpeg", "png", "heic", "heif"].includes(v)) return "image";
    if (v.includes("wordprocessingml") || v === "docx") return "doc";
    if (v.includes("spreadsheetml") || v === "xlsx") return "sheet";
    return null;
  };
  return probe(mime) ?? probe(ft) ?? probe(ext(ft)) ?? "unknown";
}

export function fileKind(file: File): DocKind {
  return documentKind({ mimeType: file.type || null, fileType: ext(file.name) });
}

export const baseName = (fileName: string) => {
  const trimmed = fileName.replace(/\.[^./\\]+$/, "").trim();
  return (trimmed || fileName).slice(0, NAME_MAX);
};

export type ClientRejection = "type" | "size" | "empty";
export function precheckFile(file: File): ClientRejection | null {
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext(file.name))) return "type";
  if (file.size > CUSTOMER_DOCUMENT_MAX_BYTES) return "size";
  if (file.size === 0) return "empty";
  return null;
}

export function formatBytes(n: number | null | undefined, lang = "en"): string | null {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  const nf = (v: number, d: number) => v.toLocaleString(lang.startsWith("es") ? "es" : "en", { maximumFractionDigits: d });
  if (n < 1024) return `${nf(n, 0)} B`;
  if (n < 1024 * 1024) return `${nf(n / 1024, 0)} KB`;
  return `${nf(n / (1024 * 1024), 1)} MB`;
}

const time = (v: string) => { const t = new Date(v).getTime(); return Number.isFinite(t) ? t : 0; };

/** Newest first; under All, maps are pinned above other uploads. */
export function sortDocuments(docs: readonly CustomerDocumentDto[], filter: DocumentFilter): CustomerDocumentDto[] {
  return [...docs].sort((a, b) => {
    if (filter === "all") {
      const pa = a.category === "map" ? 0 : 1, pb = b.category === "map" ? 0 : 1;
      if (pa !== pb) return pa - pb;
    }
    return time(b.createdAt) - time(a.createdAt) || a.name.localeCompare(b.name);
  });
}

export function matchesSearch(q: string, ...fields: (string | null | undefined)[]) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return fields.some(f => !!f && f.toLowerCase().includes(s));
}

/* ---- per-user category preference (safe storage) ---- */
const prefKey = (companyId: string | null, userId: string | null) => `hp:cp5:docCategory:${companyId ?? "-"}:${userId ?? "-"}`;
export function readCategoryPref(companyId: string | null, userId: string | null): CustomerDocumentCategory | null {
  if (!companyId || !userId) return null;
  try {
    const v = window.localStorage.getItem(prefKey(companyId, userId));
    return v && (CUSTOMER_DOCUMENT_CATEGORIES as readonly string[]).includes(v) ? v as CustomerDocumentCategory : null;
  } catch { return null; }
}
export function writeCategoryPref(companyId: string | null, userId: string | null, c: CustomerDocumentCategory) {
  if (!companyId || !userId) return;
  try { window.localStorage.setItem(prefKey(companyId, userId), c); } catch { /* storage unavailable: ignore */ }
}
/** First upload: map for PDFs/images, other otherwise. Later: the user's last pick. */
export function initialCategory(file: File, pref: CustomerDocumentCategory | null): CustomerDocumentCategory {
  if (pref) return pref;
  const k = fileKind(file);
  return k === "pdf" || k === "image" ? "map" : "other";
}

/** Localizable error text from an apiRequest/XHR failure. */
export function documentErrorText(err: unknown, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (err instanceof Error && err.message === "scope-changed") return t("cp5.documents.errors.scopeChanged");
  if (err instanceof Error && err.message === "network") return t("cp5.documents.errors.network");
  const { code, message } = parseApiValidationError(err);
  if (code) {
    const known = t(`cp5.documents.errors.codes.${code}`, { defaultValue: "" });
    if (known && known !== `cp5.documents.errors.codes.${code}`) return known;
  }
  return message ?? t("cp5.documents.errors.generic");
}
