import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../storage', () => {
  const templates: any[] = [];
  return {
    storage: {
      getChemicalNotificationTemplate: vi.fn(async (id: string, companyId: string) =>
        templates.find(t => t.id === id && t.companyId === companyId) ?? null,
      ),
      getChemicalNotificationTemplates: vi.fn(async (companyId: string) =>
        templates.filter(t => t.companyId === companyId),
      ),
      __setTemplates: (rows: any[]) => {
        templates.length = 0;
        templates.push(...rows);
      },
    },
  };
});

import { storage } from '../storage';
import {
  renderChemicalNotificationTemplate,
  MissingChemicalNotificationTemplateError,
} from './emailService';
import { CHEM_NOTIF_TEMPLATE_SEEDS } from '../templates/seed';

const setTemplates = (rows: any[]) => (storage as any).__setTemplates(rows);

const baseTpl = {
  id: 'tpl-1',
  companyId: 'co-1',
  name: 'Broadleaf Weed Control',
  serviceType: 'broadleaf_weed_control',
  isDefault: false,
  preVisitSubject: 'Upcoming: {{customerName}} — {{productName}}',
  preVisitHtml:
    '<p>Visit for {{customerName}}.</p><p>Product: {{productName}}</p><p>Re-entry: {{reentryInterval}}</p>',
  postVisitSubject: 'Completed: {{customerName}}',
  postVisitHtml:
    '<p>Done for {{customerName}}.</p><p>Watering: {{wateringInstructions}}</p>',
  defaultLabelPdfStorageKey: null,
  defaultLabelPdfFilename: null,
  productName: 'Trimec Classic',
  activeIngredient: '2,4-D',
  epaRegNumber: '2217-543',
  purposeText: 'Selective broadleaf weed control',
  reentryInterval: 'Until dry',
  wateringInstructions: 'No watering for 24h',
  mowingInstructions: 'No mowing for 48h',
  postApplicationExpectation: 'Wilt in 5-7 days',
};

const stdSendVars = {
  companyName: 'Acme Lawn Co',
  customerName: 'Pat Customer',
  campaignTitle: 'Spring Lawn Care',
  targetDate: 'May 15, 2026',
  backupDate: 'May 16, 2026',
  timeWindow: '8:00 AM – 12:00 PM',
  contactPhone: '555-0123',
  contactEmail: 'office@acme.example',
  applicatorName: 'Dana Tech',
  applicatorLicense: 'CO-12345',
  pesticideLicenseNumber: 'LIC-9001',
  notes: 'Gate code 4321.',
  completionDate: 'May 15, 2026',
  completionTime: '10:45 AM',
};

describe('renderChemicalNotificationTemplate', () => {
  beforeEach(() => {
    setTemplates([]);
  });

  it('throws MissingChemicalNotificationTemplateError when company has no templates', async () => {
    await expect(
      renderChemicalNotificationTemplate({ notificationTemplateId: null }, 'co-1', 'pre', {
        customerName: 'Acme',
      }),
    ).rejects.toBeInstanceOf(MissingChemicalNotificationTemplateError);
  });

  it('exposes the standard error message on the missing-template error', async () => {
    try {
      await renderChemicalNotificationTemplate({ notificationTemplateId: null }, 'co-1', 'pre', {});
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MissingChemicalNotificationTemplateError);
      expect((err as Error).message).toContain('Notification Templates');
    }
  });

  it('falls back to the company default when campaign has no template selected', async () => {
    setTemplates([
      { ...baseTpl, id: 'tpl-default', name: 'Default', isDefault: true },
      { ...baseTpl, id: 'tpl-other', name: 'Other', isDefault: false },
    ]);
    const result = await renderChemicalNotificationTemplate(
      { notificationTemplateId: null },
      'co-1',
      'pre',
      { customerName: 'Acme' },
    );
    expect(result.templateId).toBe('tpl-default');
    expect(result.templateName).toBe('Default');
    expect(result.subject).toContain('Acme');
    expect(result.subject).toContain('Trimec Classic');
    expect(result.html).toContain('Until dry');
  });

  it('prefers the campaign-selected template over the company default', async () => {
    setTemplates([
      { ...baseTpl, id: 'tpl-default', name: 'Default', isDefault: true },
      { ...baseTpl, id: 'tpl-picked', name: 'Picked', isDefault: false, productName: 'Picked Product' },
    ]);
    const result = await renderChemicalNotificationTemplate(
      { notificationTemplateId: 'tpl-picked' },
      'co-1',
      'pre',
      { customerName: 'Acme' },
    );
    expect(result.templateId).toBe('tpl-picked');
    expect(result.subject).toContain('Picked Product');
  });

  it('lets caller-supplied non-empty vars override template product metadata', async () => {
    setTemplates([{ ...baseTpl, isDefault: true }]);
    const result = await renderChemicalNotificationTemplate(
      { notificationTemplateId: null },
      'co-1',
      'pre',
      { customerName: 'Acme', productName: 'Override Product', reentryInterval: '' },
    );
    expect(result.subject).toContain('Override Product');
    expect(result.subject).not.toContain('Trimec Classic');
    expect(result.html).toContain('Until dry');
  });

  it('renders post-visit subject/html when kind=post', async () => {
    setTemplates([{ ...baseTpl, isDefault: true }]);
    const result = await renderChemicalNotificationTemplate(
      { notificationTemplateId: null },
      'co-1',
      'post',
      { customerName: 'Acme' },
    );
    expect(result.subject).toBe('Completed: Acme');
    expect(result.html).toContain('No watering for 24h');
  });

  it('returns a non-empty plain-text fallback derived from the rendered HTML', async () => {
    setTemplates([{ ...baseTpl, isDefault: true }]);
    const result = await renderChemicalNotificationTemplate(
      { notificationTemplateId: null },
      'co-1',
      'pre',
      { customerName: 'Acme' },
    );
    expect(typeof result.textBody).toBe('string');
    expect(result.textBody.length).toBeGreaterThan(0);
    // Tags stripped, content preserved.
    expect(result.textBody).not.toMatch(/<[a-z]/i);
    expect(result.textBody).toContain('Acme');
    expect(result.textBody).toContain('Trimec Classic');
    expect(result.textBody).toContain('Until dry');
  });

  it('falls through to company default when campaign template id no longer exists', async () => {
    setTemplates([{ ...baseTpl, id: 'tpl-default', isDefault: true }]);
    const result = await renderChemicalNotificationTemplate(
      { notificationTemplateId: 'tpl-deleted' },
      'co-1',
      'pre',
      { customerName: 'Acme' },
    );
    expect(result.templateId).toBe('tpl-default');
  });
});

describe('renderChemicalNotificationTemplate — full template seed coverage', () => {
  beforeEach(() => setTemplates([]));

  it('exports exactly 8 standard service-type seeds', () => {
    expect(CHEM_NOTIF_TEMPLATE_SEEDS).toHaveLength(8);
    const serviceTypes = new Set(CHEM_NOTIF_TEMPLATE_SEEDS.map(s => s.serviceType));
    expect(serviceTypes.size).toBe(8);
  });

  for (const seed of CHEM_NOTIF_TEMPLATE_SEEDS) {
    it(`renders pre + post for "${seed.name}" with all required sections populated`, async () => {
      setTemplates([{
        ...baseTpl,
        id: `tpl-${seed.serviceType}`,
        name: seed.name,
        serviceType: seed.serviceType,
        isDefault: true,
        preVisitSubject: seed.preVisitSubject,
        preVisitHtml: seed.preVisitHtml,
        postVisitSubject: seed.postVisitSubject,
        postVisitHtml: seed.postVisitHtml,
        productName: seed.productName,
        activeIngredient: seed.activeIngredient,
        epaRegNumber: seed.epaRegNumber,
        purposeText: seed.purposeText,
        reentryInterval: seed.reentryInterval,
        wateringInstructions: seed.wateringInstructions,
        mowingInstructions: seed.mowingInstructions,
        postApplicationExpectation: seed.postApplicationExpectation,
      }]);

      const pre = await renderChemicalNotificationTemplate(
        { notificationTemplateId: null }, 'co-1', 'pre', stdSendVars,
      );
      expect(pre.subject).toContain('Pat Customer');
      expect(pre.html).toContain('Acme Lawn Co');
      expect(pre.html).toContain('May 15, 2026');
      expect(pre.html).toContain(seed.productName);
      expect(pre.html).toContain('8:00 AM');
      expect(pre.html).toContain('Dana Tech');
      expect(pre.html).toContain('Gate code 4321.');
      expect(pre.html).toContain('LIC-9001');

      const post = await renderChemicalNotificationTemplate(
        { notificationTemplateId: null }, 'co-1', 'post', stdSendVars,
      );
      expect(post.subject).toContain('Pat Customer');
      expect(post.html).toContain('Visit completed');
      expect(post.html).toContain(seed.productName);
      expect(post.html).toContain('May 15, 2026');
      expect(post.html).toContain(seed.postApplicationExpectation);
      expect(post.html).toContain('LIC-9001');
    });
  }

  it('omits optional sections when their vars are empty', async () => {
    const seed = CHEM_NOTIF_TEMPLATE_SEEDS[0];
    setTemplates([{
      ...baseTpl,
      id: 'tpl-min',
      name: seed.name,
      isDefault: true,
      preVisitSubject: seed.preVisitSubject,
      preVisitHtml: seed.preVisitHtml,
      postVisitSubject: seed.postVisitSubject,
      postVisitHtml: seed.postVisitHtml,
      productName: '',
      activeIngredient: '',
      epaRegNumber: '',
      purposeText: '',
      reentryInterval: '',
      wateringInstructions: '',
      mowingInstructions: '',
      postApplicationExpectation: '',
    }]);
    const minimalVars = {
      companyName: 'Acme',
      customerName: 'Pat',
      campaignTitle: 'Spring',
      targetDate: 'May 15',
      backupDate: 'May 16',
      applicatorName: 'Dana',
    };

    const pre = await renderChemicalNotificationTemplate(
      { notificationTemplateId: null }, 'co-1', 'pre', minimalVars,
    );
    expect(pre.html).not.toContain('Active Ingredient');
    expect(pre.html).not.toContain('EPA Registration');
    expect(pre.html).not.toContain('Service Window');
    expect(pre.html).not.toContain('License:');
    expect(pre.html).not.toContain('Additional Notes');
    expect(pre.html).not.toContain('Pesticide Applicator License');
    expect(pre.html).not.toContain('View Product Label');

    const post = await renderChemicalNotificationTemplate(
      { notificationTemplateId: null }, 'co-1', 'post', { ...minimalVars, completionDate: 'May 15' },
    );
    expect(post.html).not.toContain('Areas Treated');
    expect(post.html).not.toContain('Application Conditions');
    expect(post.html).not.toContain('Site Photos');
    expect(post.html).not.toContain('Technician Notes');
    expect(post.html).not.toContain('What to Expect Next');
  });
});

// Extended base template with all four override-able fields in the HTML so
// per-visit override tests can assert they appear or are absent.
const overrideTpl = {
  ...baseTpl,
  preVisitHtml:
    '<p>{{customerName}}</p><p>Purpose: {{purpose}}</p><p>Re-entry: {{reentryInterval}}</p><p>Watering: {{wateringInstructions}}</p><p>Mowing: {{mowingInstructions}}</p>',
  postVisitHtml:
    '<p>{{customerName}}</p><p>Purpose: {{purpose}}</p><p>Re-entry: {{reentryInterval}}</p><p>Watering: {{wateringInstructions}}</p><p>Mowing: {{mowingInstructions}}</p>',
  purposeText: 'Template default purpose',
  reentryInterval: 'Template default reentry',
  wateringInstructions: 'Template default watering',
  mowingInstructions: 'Template default mowing',
};

describe('renderChemicalNotificationTemplate — per-visit override vars', () => {
  beforeEach(() => setTemplates([]));

  it('pre-email: per-visit override vars win over template defaults', async () => {
    setTemplates([{ ...overrideTpl, isDefault: true }]);
    const result = await renderChemicalNotificationTemplate(
      { notificationTemplateId: null },
      'co-1',
      'pre',
      {
        ...stdSendVars,
        purpose: 'Visit-specific crabgrass control',
        reentryInterval: '6 hours (visit override)',
      },
    );
    expect(result.html).toContain('Visit-specific crabgrass control');
    expect(result.html).not.toContain('Template default purpose');
    expect(result.html).toContain('6 hours (visit override)');
    expect(result.html).not.toContain('Template default reentry');
    // Fields not overridden still come from template defaults
    expect(result.html).toContain('Template default watering');
    expect(result.html).toContain('Template default mowing');
  });

  it('post-email: per-visit override vars win over template defaults', async () => {
    setTemplates([{ ...overrideTpl, isDefault: true }]);
    const result = await renderChemicalNotificationTemplate(
      { notificationTemplateId: null },
      'co-1',
      'post',
      {
        ...stdSendVars,
        wateringInstructions: 'Water in immediately (visit override)',
        mowingInstructions: 'Mow after 72h (visit override)',
      },
    );
    expect(result.html).toContain('Water in immediately (visit override)');
    expect(result.html).not.toContain('Template default watering');
    expect(result.html).toContain('Mow after 72h (visit override)');
    expect(result.html).not.toContain('Template default mowing');
    // Fields not overridden still come from template defaults
    expect(result.html).toContain('Template default purpose');
    expect(result.html).toContain('Template default reentry');
  });

  it('no overrides: template defaults render unchanged for both pre and post', async () => {
    setTemplates([{ ...overrideTpl, isDefault: true }]);
    const pre = await renderChemicalNotificationTemplate(
      { notificationTemplateId: null },
      'co-1',
      'pre',
      { customerName: 'Test Customer', companyName: 'Acme', campaignTitle: 'Spring' },
    );
    expect(pre.html).toContain('Template default purpose');
    expect(pre.html).toContain('Template default reentry');
    expect(pre.html).toContain('Template default watering');
    expect(pre.html).toContain('Template default mowing');

    const post = await renderChemicalNotificationTemplate(
      { notificationTemplateId: null },
      'co-1',
      'post',
      { customerName: 'Test Customer', companyName: 'Acme', campaignTitle: 'Spring', completionDate: 'May 15' },
    );
    expect(post.html).toContain('Template default purpose');
    expect(post.html).toContain('Template default reentry');
    expect(post.html).toContain('Template default watering');
    expect(post.html).toContain('Template default mowing');
  });
});
