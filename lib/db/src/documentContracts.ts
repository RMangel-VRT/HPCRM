import { z } from "zod/v4";

/** Document-specific contact/boilerplate owner; never includes company name or prices. */
export const DOCUMENT_FIELDS = [
  "addressLine1", "addressLine2", "city", "state", "postalCode", "phone", "email", "website",
  "remitTo", "paymentInstructions", "estimateTerms", "warrantyText", "invoiceFooterNote",
] as const;
export type DocumentField = typeof DOCUMENT_FIELDS[number];
export type DocumentSettings = Record<DocumentField, string>;
export const DEFAULT_PAYMENT_INSTRUCTIONS = "Please remit by check payable to {company name}. Reference the invoice number.";
export const emptyDocumentSettings = (): DocumentSettings => Object.fromEntries(
  DOCUMENT_FIELDS.map(key => [key, key === "paymentInstructions" ? DEFAULT_PAYMENT_INSTRUCTIONS : ""]),
) as DocumentSettings;
export const patchDocumentSettingsSchema = z.strictObject({
  addressLine1: z.string().max(500).optional(), addressLine2: z.string().max(500).optional(),
  city: z.string().max(200).optional(), state: z.string().max(100).optional(), postalCode: z.string().max(40).optional(),
  phone: z.string().max(100).optional(), email: z.string().max(320).optional(), website: z.string().max(500).optional(),
  remitTo: z.string().max(4000).optional(), paymentInstructions: z.string().max(8000).optional(),
  estimateTerms: z.string().max(8000).optional(), warrantyText: z.string().max(8000).optional(),
  invoiceFooterNote: z.string().max(500).optional(),
}).refine(value => Object.keys(value).length > 0, "No changes");
/** Explicit projection also strips DB attribution and arbitrary caller properties. */
export function documentSettingsModel(value?: Partial<DocumentSettings> | null): DocumentSettings {
  const result = emptyDocumentSettings();
  for (const key of DOCUMENT_FIELDS) if (typeof value?.[key] === "string") result[key] = value[key]!;
  return result;
}
