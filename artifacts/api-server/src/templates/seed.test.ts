import { describe, it, expect, beforeEach, vi } from 'vitest';

import { CHEM_NOTIF_TEMPLATE_SEEDS, seedChemicalNotificationTemplates } from './seed';

type Row = {
  id: string;
  companyId: string;
  name: string;
  serviceType: string;
  preVisitHtml: string;
  postVisitHtml: string;
  productName: string | null;
  activeIngredient: string | null;
  epaRegNumber: string | null;
  purposeText: string | null;
  reentryInterval: string | null;
  wateringInstructions: string | null;
  mowingInstructions: string | null;
  postApplicationExpectation: string | null;
};

function makeStorage(initial: Row[] = []) {
  const rows: Row[] = [...initial];
  return {
    rows,
    getChemicalNotificationTemplates: vi.fn(async (companyId: string) =>
      rows.filter(r => r.companyId === companyId),
    ),
    createChemicalNotificationTemplate: vi.fn(async (input: any) => {
      const row: Row = { id: `tpl-${rows.length + 1}`, ...input };
      rows.push(row);
      return row;
    }),
    updateChemicalNotificationTemplate: vi.fn(async (id: string, _companyId: string, updates: Record<string, unknown>) => {
      const r = rows.find(x => x.id === id);
      if (r) Object.assign(r, updates);
      return r;
    }),
  };
}

describe('seedChemicalNotificationTemplates — metadata backfill', () => {
  beforeEach(() => vi.clearAllMocks());

  it('backfills missing product-detail metadata on pre-existing templates', async () => {
    const broadleafSeed = CHEM_NOTIF_TEMPLATE_SEEDS.find(s => s.name === 'Broadleaf Weed Control')!;
    const existing: Row = {
      id: 'tpl-existing',
      companyId: 'co-1',
      name: broadleafSeed.name,
      serviceType: broadleafSeed.serviceType,
      preVisitHtml: broadleafSeed.preVisitHtml,
      postVisitHtml: broadleafSeed.postVisitHtml,
      productName: null,
      activeIngredient: '',
      epaRegNumber: null,
      purposeText: null,
      reentryInterval: null,
      wateringInstructions: null,
      mowingInstructions: null,
      postApplicationExpectation: null,
    };
    const storage = makeStorage([existing]);

    await seedChemicalNotificationTemplates('co-1', storage as any);

    const updateCall = storage.updateChemicalNotificationTemplate.mock.calls
      .find(c => c[0] === 'tpl-existing');
    expect(updateCall).toBeTruthy();
    const updates = updateCall![2] as Record<string, string>;
    expect(updates.productName).toBe(broadleafSeed.productName);
    expect(updates.activeIngredient).toBe(broadleafSeed.activeIngredient);
    expect(updates.epaRegNumber).toBe(broadleafSeed.epaRegNumber);
    expect(updates.purposeText).toBe(broadleafSeed.purposeText);
    expect(updates.reentryInterval).toBe(broadleafSeed.reentryInterval);
    expect(updates.wateringInstructions).toBe(broadleafSeed.wateringInstructions);
    expect(updates.mowingInstructions).toBe(broadleafSeed.mowingInstructions);
    expect(updates.postApplicationExpectation).toBe(broadleafSeed.postApplicationExpectation);
  });

  it('preserves admin customizations on metadata fields with non-empty values', async () => {
    const fertSeed = CHEM_NOTIF_TEMPLATE_SEEDS.find(s => s.name === 'Fertilizer Application')!;
    const existing: Row = {
      id: 'tpl-fert',
      companyId: 'co-1',
      name: fertSeed.name,
      serviceType: fertSeed.serviceType,
      preVisitHtml: fertSeed.preVisitHtml,
      postVisitHtml: fertSeed.postVisitHtml,
      productName: 'My Custom Fertilizer Brand',
      activeIngredient: 'Custom NPK 20-5-10',
      epaRegNumber: null,
      purposeText: 'Custom company-specific text',
      reentryInterval: null,
      wateringInstructions: null,
      mowingInstructions: null,
      postApplicationExpectation: null,
    };
    const storage = makeStorage([existing]);

    await seedChemicalNotificationTemplates('co-1', storage as any);

    const updateCall = storage.updateChemicalNotificationTemplate.mock.calls
      .find(c => c[0] === 'tpl-fert');
    expect(updateCall).toBeTruthy();
    const updates = updateCall![2] as Record<string, string>;
    expect(updates.productName).toBeUndefined();
    expect(updates.activeIngredient).toBeUndefined();
    expect(updates.purposeText).toBeUndefined();
    expect(updates.epaRegNumber).toBe(fertSeed.epaRegNumber);
    expect(updates.reentryInterval).toBe(fertSeed.reentryInterval);
    expect(updates.wateringInstructions).toBe(fertSeed.wateringInstructions);
    expect(updates.mowingInstructions).toBe(fertSeed.mowingInstructions);
    expect(updates.postApplicationExpectation).toBe(fertSeed.postApplicationExpectation);
  });

  it('makes no update call when all metadata is already populated and bodies match', async () => {
    const insectSeed = CHEM_NOTIF_TEMPLATE_SEEDS.find(s => s.name === 'Insecticide Application')!;
    const existing: Row = {
      id: 'tpl-insect',
      companyId: 'co-1',
      name: insectSeed.name,
      serviceType: insectSeed.serviceType,
      preVisitHtml: insectSeed.preVisitHtml,
      postVisitHtml: insectSeed.postVisitHtml,
      productName: insectSeed.productName,
      activeIngredient: insectSeed.activeIngredient,
      epaRegNumber: insectSeed.epaRegNumber,
      purposeText: insectSeed.purposeText,
      reentryInterval: insectSeed.reentryInterval,
      wateringInstructions: insectSeed.wateringInstructions,
      mowingInstructions: insectSeed.mowingInstructions,
      postApplicationExpectation: insectSeed.postApplicationExpectation,
    };
    const storage = makeStorage([existing]);

    await seedChemicalNotificationTemplates('co-1', storage as any);

    const insectUpdate = storage.updateChemicalNotificationTemplate.mock.calls
      .find(c => c[0] === 'tpl-insect');
    expect(insectUpdate).toBeUndefined();
  });

  it('does not overwrite "Custom Treatment" empty seed values onto existing rows', async () => {
    const customSeed = CHEM_NOTIF_TEMPLATE_SEEDS.find(s => s.name === 'Custom Treatment')!;
    expect(customSeed.productName).toBe('');
    const existing: Row = {
      id: 'tpl-custom',
      companyId: 'co-1',
      name: customSeed.name,
      serviceType: customSeed.serviceType,
      preVisitHtml: customSeed.preVisitHtml,
      postVisitHtml: customSeed.postVisitHtml,
      productName: null,
      activeIngredient: null,
      epaRegNumber: null,
      purposeText: customSeed.purposeText,
      reentryInterval: customSeed.reentryInterval,
      wateringInstructions: customSeed.wateringInstructions,
      mowingInstructions: customSeed.mowingInstructions,
      postApplicationExpectation: customSeed.postApplicationExpectation,
    };
    const storage = makeStorage([existing]);

    await seedChemicalNotificationTemplates('co-1', storage as any);

    const updateCall = storage.updateChemicalNotificationTemplate.mock.calls
      .find(c => c[0] === 'tpl-custom');
    expect(updateCall).toBeUndefined();
  });
});
