import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserWithContext } from '../auth';

const { store, signObjectURL } = vi.hoisted(() => ({ store: {
  createChemicalNotificationTemplate: vi.fn(async (data: object) => ({ id: 'mine', ...data })),
  updateChemicalNotificationTemplate: vi.fn(async (id: string, _companyId: string, updates: object) => ({ id, ...updates })),
  getChemicalNotificationTemplate: vi.fn(async (id: string, companyId: string) => id === 'mine' && companyId === 'company-a'
    ? { id, defaultLabelPdfFilename: 'Sample label.pdf', defaultLabelPdfStorageKey: '/bucket/private/chemical-notification-template-labels/company-a/mine.pdf' } : undefined),
  getCompanyById: vi.fn(async () => ({ pesticideLicenseNumber: 'SAMPLE-9' })),
}, signObjectURL: vi.fn(async () => 'https://storage.example.test/authorized-label') }));
vi.mock('../storage', () => ({ storage: store }));
vi.mock('../objectStorage', () => ({ signObjectURL, ObjectStorageService: class { getPrivateObjectDir() { return '/bucket/private'; } } }));
vi.mock('../services/outgoingEmail/company', () => ({ loadEmailCompany: async () => ({
  name: 'Sample Company', phone: '555-0123', email: '', addressLine: '', website: '',
}) }));
import { registerChemicalTemplateWrites } from './chemicalTemplateWrites';

const path = '/api/chemical-notification-templates';
function api(accessRole?: string) {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => !!accessRole) as typeof req.isAuthenticated;
    if (accessRole) req.user = { id: 'actor', activeCompanyId: 'company-a', accessRole } as UserWithContext;
    next();
  });
  registerChemicalTemplateWrites(app);
  return request(app);
}
beforeEach(() => vi.clearAllMocks());

describe('chemical template editor API', () => {
  it('saves without subject or HTML and only accepts structured fields on create and edit', async () => {
    const app = api('admin');
    const saved = await app.post(path).send({ name: 'New treatment', serviceType: 'custom', isDefault: true, companyId: 'foreign' });
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({ preVisitSubject: '', preVisitHtml: '', postVisitSubject: '', postVisitHtml: '', companyId: 'company-a', isDefault: true });
    const updated = await app.patch(`${path}/mine`).send({ productName: 'New product', preVisitSubject: 'Ignore', postVisitHtml: 'Ignore', defaultLabelPdfStorageKey: '/foreign/doc.pdf' });
    expect(updated.status).toBe(200);
    expect(store.updateChemicalNotificationTemplate).toHaveBeenCalledWith('mine', 'company-a', { productName: 'New product' });
  });

  it('renders unsaved details and both sample variants, never caller HTML or caller label URLs', async () => {
    const payload = { name: 'Unsaved treatment', productName: 'Unsaved product', postApplicationExpectation: 'Unsaved expectation',
      htmlBody: '<script>caller content</script>', labelAttachmentUrl: 'https://example.test/untrusted', templateId: 'mine' };
    const editor = api('office');
    const upcoming = await editor.post(`${path}/preview`).send({ ...payload, emailType: 'pre' });
    expect(upcoming.status).toBe(200);
    expect(upcoming.body.subject).toBe('Upcoming Unsaved treatment – Sample Property');
    expect(upcoming.body.htmlBody).toContain('Unsaved product');
    expect(upcoming.body.htmlBody).toContain('Colorado Commercial Applicator · License #SAMPLE-9');
    expect(upcoming.body.htmlBody).toContain('https://storage.example.test/authorized-label');
    expect(upcoming.body.htmlBody).not.toMatch(/caller content|untrusted/);
    const completed = await editor.post(`${path}/preview`).send({ ...payload, emailType: 'post' });
    expect(completed.status).toBe(200);
    expect(completed.body.subject).toBe('Unsaved treatment completed – Sample Property');
    expect(completed.body.textBody).toContain('Unsaved expectation');
    expect(store.createChemicalNotificationTemplate).not.toHaveBeenCalled();
  });

  it('denies anonymous and cross-company access and refuses legacy-only preview bodies', async () => {
    const payload = { name: 'Sample', emailType: 'pre' };
    expect((await api().post(`${path}/preview`).send(payload)).status).toBe(401);
    expect((await api('field').post(`${path}/preview`).send(payload)).status).toBe(403);
    expect((await api('admin').post(`${path}/preview`).set('X-Company-Id', 'company-b').send(payload)).status).toBe(409);
    expect((await api('admin').post(`${path}/preview`).send({ ...payload, templateId: 'foreign' })).status).toBe(404);
    expect(signObjectURL).not.toHaveBeenCalled();
    expect((await api('admin').post(`${path}/preview`).send({ subject: 'Old subject', htmlBody: '<p>Old</p>' })).status).toBe(400);
  });

  it('does not sign a mismatched stored label path for a template preview', async () => {
    store.getChemicalNotificationTemplate.mockResolvedValueOnce({
      id: 'mine', defaultLabelPdfFilename: 'Sample.pdf',
      defaultLabelPdfStorageKey: '/bucket/private/chemical-notification-template-labels/other/mine.pdf',
    });
    const preview = await api('admin').post(`${path}/preview`).send({ name: 'Sample', emailType: 'pre', templateId: 'mine' });
    expect(preview.status).toBe(200);
    expect(preview.body.textBody).not.toContain('Sample.pdf');
    expect(signObjectURL).not.toHaveBeenCalled();
  });
});
