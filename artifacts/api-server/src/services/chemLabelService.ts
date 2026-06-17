import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { chemicalProducts as chemicalProductsTable } from '@workspace/db';
import { resolveChemicalNotificationTemplate } from './emailService';
import { signObjectURL } from '../objectStorage';

export type LabelSource = 'visit_override' | 'template' | 'product' | 'none';

export interface ResolvedChemLabel {
  url: string;
  name: string;
  source: LabelSource;
}

/**
 * TTL for signed template-level label PDF URLs (7 days).
 * Kept in sync with the TEMPLATE_LABEL_TTL_SEC constant in routes.ts.
 */
export const TEMPLATE_LABEL_TTL_SEC = 604800;

/**
 * When true, a chemical notification send is blocked with HTTP 400 if the
 * resolved label comes from the product-level fallback rather than the
 * notification template or a visit-level override. Exported so route handlers
 * and tests can reference the same value without duplication.
 */
export const BLOCK_PRODUCT_LABEL_FALLBACK = true;

export const MISSING_LABEL_ERROR =
  'This template has no product label PDF attached. Add a label to the template before sending.';

/**
 * Returns true when a resolved label source should block a chemical
 * notification send with HTTP 400. Mirrors the guard condition used in
 * every send + preview path in routes.ts.
 */
export function isChemLabelBlocked(source: LabelSource): boolean {
  return source === 'none' || (source === 'product' && BLOCK_PRODUCT_LABEL_FALLBACK);
}

/**
 * Resolves the label PDF attachment for a chemical visit notification.
 *
 * Priority:
 *   1. Visit-level override  (`targetItem.labelPdfOverrideKey`)
 *   2. Template default      (`template.defaultLabelPdfStorageKey`)
 *   3. Product default       (`chemicalProducts.labelPdfStorageKey`)
 *   4. none                  (no label available)
 *
 * Never throws — errors during URL signing or DB lookup are swallowed so the
 * caller always receives a structured result. The `source` field tells the
 * caller whether to block the send (use `isChemLabelBlocked`).
 */
export async function resolveChemLabelAttachment(
  targetItem: { labelPdfOverrideKey?: string | null; chemicalProductId?: string | null },
  campaign: { notificationTemplateId?: string | null },
  companyId: string,
): Promise<ResolvedChemLabel> {
  let url = '';
  let name = '';
  let source: LabelSource = 'none';
  try {
    const tpl = await resolveChemicalNotificationTemplate(campaign, companyId).catch(() => null);
    let productLabelKey: string | null = null;
    if (targetItem.chemicalProductId) {
      const [prod] = await db
        .select({ labelPdfStorageKey: chemicalProductsTable.labelPdfStorageKey })
        .from(chemicalProductsTable)
        .where(
          and(
            eq(chemicalProductsTable.id, targetItem.chemicalProductId),
            eq(chemicalProductsTable.companyId, companyId),
          ),
        );
      productLabelKey = prod?.labelPdfStorageKey ?? null;
    }
    let storageKey: string | null = null;
    if (targetItem.labelPdfOverrideKey) {
      storageKey = targetItem.labelPdfOverrideKey;
      source = 'visit_override';
    } else if (tpl?.defaultLabelPdfStorageKey) {
      storageKey = tpl.defaultLabelPdfStorageKey;
      source = 'template';
    } else if (productLabelKey) {
      storageKey = productLabelKey;
      source = 'product';
    }
    name = tpl?.defaultLabelPdfFilename || '';
    if (storageKey) {
      const parts = storageKey.replace(/^\//, '').split('/');
      url = await signObjectURL({
        bucketName: parts[0],
        objectName: parts.slice(1).join('/'),
        method: 'GET',
        ttlSec: TEMPLATE_LABEL_TTL_SEC,
      });
    }
  } catch {
    /* non-fatal: return whatever was resolved so far */
  }
  return { url, name, source };
}
