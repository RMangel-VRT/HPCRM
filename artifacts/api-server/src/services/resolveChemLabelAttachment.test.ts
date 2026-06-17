/**
 * Tests for the chemical notification label integrity guard (Slice F).
 *
 * Scenarios 5 and 6 from the task spec:
 *   5. Template with no `defaultLabelPdfStorageKey` → source 'none' → blocked (400).
 *   6. Template with a `defaultLabelPdfStorageKey` → source 'template' → not blocked.
 *
 * `resolveChemLabelAttachment` is now an exported function in chemLabelService.ts;
 * all external dependencies (storage, db, signObjectURL) are mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock: storage (drives resolveChemicalNotificationTemplate) ───────────────

vi.mock('../storage', () => {
  const templates: any[] = [];
  return {
    storage: {
      getChemicalNotificationTemplate: vi.fn(async (id: string, companyId: string) =>
        templates.find((t) => t.id === id && t.companyId === companyId) ?? null,
      ),
      getChemicalNotificationTemplates: vi.fn(async (companyId: string) =>
        templates.filter((t) => t.companyId === companyId),
      ),
      __setTemplates: (rows: any[]) => {
        templates.length = 0;
        templates.push(...rows);
      },
    },
  };
});

// ─── Mock: db (drives product label key lookup) ───────────────────────────────

vi.mock('../db', () => {
  let _productKey: string | null = null;
  const selectChain = {
    from: () => selectChain,
    where: async () => (_productKey ? [{ labelPdfStorageKey: _productKey }] : []),
  };
  return {
    db: {
      select: () => selectChain,
      // Test helper: set the product label key returned by db.select queries.
      __setProductLabelKey: (key: string | null) => { _productKey = key; },
    },
  };
});

// ─── Mock: objectStorage (drives URL signing) ─────────────────────────────────

vi.mock('../objectStorage', () => ({
  signObjectURL: vi.fn(async ({ bucketName, objectName }: { bucketName: string; objectName: string }) =>
    `https://storage.example.com/${bucketName}/${objectName}?sig=mock`,
  ),
}));

import { storage } from '../storage';
import { db as dbModule } from '../db';
import { signObjectURL } from '../objectStorage';
import {
  resolveChemLabelAttachment,
  isChemLabelBlocked,
  BLOCK_PRODUCT_LABEL_FALLBACK,
  MISSING_LABEL_ERROR,
} from './chemLabelService';

const setTemplates = (rows: any[]) => (storage as any).__setTemplates(rows);
const setProductLabelKey = (key: string | null) => (dbModule as any).__setProductLabelKey(key);

const baseTpl = {
  id: 'tpl-1',
  companyId: 'co-1',
  name: 'Broadleaf Weed Control',
  isDefault: true,
  preVisitSubject: 'Upcoming visit',
  preVisitHtml: '<p>Visit</p>',
  postVisitSubject: 'Visit completed',
  postVisitHtml: '<p>Done</p>',
  defaultLabelPdfStorageKey: null as string | null,
  defaultLabelPdfFilename: null as string | null,
  productName: 'Trimec Classic',
  activeIngredient: '2,4-D',
  epaRegNumber: '2217-543',
  purposeText: 'Broadleaf weed control',
  reentryInterval: 'Until dry',
  wateringInstructions: 'No watering for 24h',
  mowingInstructions: 'No mowing for 48h',
  postApplicationExpectation: 'Wilt in 5-7 days',
};

// ─── Scenario 5: template has NO defaultLabelPdfStorageKey ───────────────────

describe('resolveChemLabelAttachment — Scenario 5: template has no label PDF', () => {
  beforeEach(() => {
    setTemplates([]);
    setProductLabelKey(null);
    vi.mocked(signObjectURL).mockClear();
  });

  it('returns source "none" when template has no label key and no visit override or product key', async () => {
    setTemplates([{ ...baseTpl, defaultLabelPdfStorageKey: null }]);
    const result = await resolveChemLabelAttachment(
      { labelPdfOverrideKey: null, chemicalProductId: null },
      { notificationTemplateId: null },
      'co-1',
    );
    expect(result.source).toBe('none');
    expect(result.url).toBe('');
  });

  it('does not call signObjectURL when source is "none"', async () => {
    setTemplates([{ ...baseTpl, defaultLabelPdfStorageKey: null }]);
    await resolveChemLabelAttachment(
      { labelPdfOverrideKey: null, chemicalProductId: null },
      { notificationTemplateId: null },
      'co-1',
    );
    expect(signObjectURL).not.toHaveBeenCalled();
  });

  it('isChemLabelBlocked returns true for source "none"', () => {
    expect(isChemLabelBlocked('none')).toBe(true);
  });

  it('end-to-end: no-label template → source "none" → guard blocks the send (400)', async () => {
    setTemplates([{ ...baseTpl, defaultLabelPdfStorageKey: null }]);
    const { source } = await resolveChemLabelAttachment(
      { labelPdfOverrideKey: null, chemicalProductId: null },
      { notificationTemplateId: null },
      'co-1',
    );
    expect(isChemLabelBlocked(source)).toBe(true);
  });

  it('the MISSING_LABEL_ERROR constant describes the correct user-facing error', () => {
    expect(MISSING_LABEL_ERROR).toContain('no product label PDF attached');
    expect(MISSING_LABEL_ERROR).toContain('Add a label to the template');
  });

  it('source is "product" (blocked by default) when only the product has a label key', async () => {
    setTemplates([{ ...baseTpl, defaultLabelPdfStorageKey: null }]);
    setProductLabelKey('bucket/product/label.pdf');
    const { source } = await resolveChemLabelAttachment(
      { labelPdfOverrideKey: null, chemicalProductId: 'prod-1' },
      { notificationTemplateId: null },
      'co-1',
    );
    expect(source).toBe('product');
    expect(BLOCK_PRODUCT_LABEL_FALLBACK).toBe(true);
    expect(isChemLabelBlocked(source)).toBe(true);
  });
});

// ─── Scenario 6: template HAS defaultLabelPdfStorageKey ─────────────────────

describe('resolveChemLabelAttachment — Scenario 6: template has a label PDF', () => {
  beforeEach(() => {
    setTemplates([]);
    setProductLabelKey(null);
    vi.mocked(signObjectURL).mockClear();
  });

  it('returns source "template" when template has a label storage key', async () => {
    setTemplates([{
      ...baseTpl,
      defaultLabelPdfStorageKey: 'chembucket/labels/trimec.pdf',
      defaultLabelPdfFilename: 'trimec.pdf',
    }]);
    const result = await resolveChemLabelAttachment(
      { labelPdfOverrideKey: null, chemicalProductId: null },
      { notificationTemplateId: null },
      'co-1',
    );
    expect(result.source).toBe('template');
    expect(result.name).toBe('trimec.pdf');
  });

  it('calls signObjectURL with the correct bucket and object name', async () => {
    setTemplates([{
      ...baseTpl,
      defaultLabelPdfStorageKey: 'chembucket/labels/trimec.pdf',
    }]);
    const result = await resolveChemLabelAttachment(
      { labelPdfOverrideKey: null, chemicalProductId: null },
      { notificationTemplateId: null },
      'co-1',
    );
    expect(signObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ bucketName: 'chembucket', objectName: 'labels/trimec.pdf', method: 'GET' }),
    );
    expect(result.url).toMatch(/^https:\/\/storage\.example\.com\//);
  });

  it('isChemLabelBlocked returns false for source "template"', () => {
    expect(isChemLabelBlocked('template')).toBe(false);
  });

  it('end-to-end: template with label → source "template" → guard allows the send', async () => {
    setTemplates([{
      ...baseTpl,
      defaultLabelPdfStorageKey: 'chembucket/labels/trimec.pdf',
    }]);
    const { source } = await resolveChemLabelAttachment(
      { labelPdfOverrideKey: null, chemicalProductId: null },
      { notificationTemplateId: null },
      'co-1',
    );
    expect(isChemLabelBlocked(source)).toBe(false);
  });

  it('visit-level override wins over template key → source "visit_override" → not blocked', async () => {
    setTemplates([{
      ...baseTpl,
      defaultLabelPdfStorageKey: 'chembucket/labels/trimec.pdf',
    }]);
    const { source } = await resolveChemLabelAttachment(
      { labelPdfOverrideKey: 'chembucket/overrides/visit.pdf', chemicalProductId: null },
      { notificationTemplateId: null },
      'co-1',
    );
    expect(source).toBe('visit_override');
    expect(isChemLabelBlocked(source)).toBe(false);
  });
});

// ─── Guard helper completeness ─────────────────────────────────────────────────

describe('isChemLabelBlocked — full source matrix', () => {
  it('"none" is always blocked', () => {
    expect(isChemLabelBlocked('none')).toBe(true);
  });

  it('"product" is blocked when BLOCK_PRODUCT_LABEL_FALLBACK is true (the production default)', () => {
    expect(BLOCK_PRODUCT_LABEL_FALLBACK).toBe(true);
    expect(isChemLabelBlocked('product')).toBe(true);
  });

  it('"template" is never blocked', () => {
    expect(isChemLabelBlocked('template')).toBe(false);
  });

  it('"visit_override" is never blocked', () => {
    expect(isChemLabelBlocked('visit_override')).toBe(false);
  });
});
