import { z } from "zod/v4";

export const CUSTOMER_DOCUMENT_CATEGORIES = ["map", "site_plan", "irrigation", "photo", "other"] as const;
export type CustomerDocumentCategory = typeof CUSTOMER_DOCUMENT_CATEGORIES[number];
export const CUSTOMER_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
export const customerDocumentMetadata = z.object({
  name: z.string().trim().min(1).max(255),
  category: z.enum(CUSTOMER_DOCUMENT_CATEGORIES),
  note: z.string().max(500).nullable(),
}).strict();
export const customerDocumentPatch = customerDocumentMetadata.partial().refine(v => Object.keys(v).length > 0);

/** Browser-safe DTO. Stored paths are deliberately not exposed; retrieval reauthorizes. */
export interface CustomerDocumentDto {
  id: string;
  customerId: string;
  companyId: string;
  name: string;
  category: CustomerDocumentCategory;
  note: string | null;
  mimeType: string | null;
  fileType: string;
  fileSize: number | null;
  uploadedByName: string | null;
  createdAt: string;
  updatedAt: string;
  openUrl: string;
  downloadUrl: string;
}
export interface CustomerContractDocumentDto {
  id: string;
  filename: string;
  kind: "signed" | "review" | "clean" | "their_form" | "clarifications" | "other";
  seasonLabel: string;
  createdAt: string;
  agreementId: string;
  termId: string;
  openUrl: string;
}
