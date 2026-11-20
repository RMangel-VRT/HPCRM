import { beforeEach, describe, expect, it, vi } from 'vitest';

const { templates } = vi.hoisted(() => ({ templates: [] as Record<string, unknown>[] }));
vi.mock('../storage', () => ({ storage: {
  getChemicalNotificationTemplate: async (id: string, companyId: string) => templates.find(t => t.id === id && t.companyId === companyId),
  getChemicalNotificationTemplates: async (companyId: string) => templates.filter(t => t.companyId === companyId),
} }));
vi.mock('./outgoingEmail/company', () => ({ loadEmailCompany: async () => ({
  name: 'Acme Lawn Co', phone: '303-555-0123', email: 'office@acme.example', addressLine: '1 Main Street', website: 'acme.example',
}) }));

import { chemicalVisitVariableSpec, renderChemicalNotificationTemplate, MissingChemicalNotificationTemplateError } from './emailService';

const fields = {
  productName: 'Sample product', activeIngredient: 'Sample ingredient', epaRegNumber: '123-456', purposeText: 'Sample purpose',
  reentryInterval: 'Until dry', wateringInstructions: 'Water tomorrow.', mowingInstructions: 'Mow next week.',
  postApplicationExpectation: 'Signs of treatment appear next week.',
};
const base = {
  id: 'template-1', companyId: 'company-a', name: 'Broadleaf Weed Control', isDefault: true,
  preVisitSubject: 'Legacy subject', postVisitSubject: 'Legacy subject',
  preVisitHtml: '<script>Legacy content</script>', postVisitHtml: '<script>Legacy content</script>', ...fields,
};
const visit = {
  customerName: 'Sample Property', campaignTitle: 'Spring Round',
  targetDate: 'May 15', backupDate: 'May 16', timeWindow: '8:00 AM – 12:00 PM',
  completionDate: 'May 15', completionTime: '10:45 AM', areasTreated: 'Front lawn', applicationConditions: 'Calm',
  nextVisitTitle: 'Summer Round', nextVisitDate: 'June 15',
  pesticideLicenseNumber: 'CO-12345', applicatorName: 'Licensed Sample', applicatorLicense: 'BACKUP',
  labelAttachmentUrl: 'https://storage.example.test/label?first=1&second=2', labelAttachmentName: 'Product & Label.pdf',
  companyName: 'Wrong Company', companyPhone: 'Wrong Phone', notes: 'Gate closed after the visit.',
};
const render = (kind: 'pre' | 'post', vars = visit as Record<string, string>, urls?: string[], notificationTemplateId?: string) =>
  renderChemicalNotificationTemplate({ notificationTemplateId }, 'company-a', kind, vars, urls);

function ordered(content: string, terms: string[]) {
  let index = -1;
  for (const term of terms) {
    const next = content.indexOf(term, index + 1);
    expect(next, term).toBeGreaterThan(index);
    index = next;
  }
}

describe('branded chemical notices', () => {
  beforeEach(() => templates.splice(0, templates.length, base));

  it('uses the exact upcoming subject, ordered blocks and company contact data', async () => {
    const result = await render('pre', { ...visit, reentryInterval: '6 hours', wateringInstructions: '   ' });
    expect(result.subject).toBe('Upcoming Broadleaf Weed Control – Sample Property');
    expect(result.templateId).toBe(base.id);
    expect(result.templateName).toBe(base.name);
    const terms = ['May 15', 'May 16', 'Before we arrive', 'After the application', 'What we’re applying',
      'Licensed applicator on your visit', 'Required by Colorado law', 'A note from High Plains'];
    ordered(result.html.split('<h1')[1], terms);
    ordered(result.textBody, terms);
    expect(result.html).toContain('href="https://storage.example.test/label?first=1&amp;second=2"');
    expect(result.html).toContain('Product &amp; Label.pdf');
    expect(result.textBody).toContain('https://storage.example.test/label?first=1&second=2');
    expect(result.textBody).toContain('Stay off treated areas: 6 hours.');
    expect(result.textBody).toContain('Water tomorrow.');
    expect(result.textBody).toContain('Colorado Commercial Applicator · License #CO-12345');
    expect(result.textBody).toContain('Questions on the day? 303-555-0123');
    expect(result.textBody).toContain('Thank you,\nAcme Lawn Co');
    expect(result.html).not.toMatch(/Legacy|Wrong Company|Wrong Phone|#BACKUP|display\s*:\s*(?:flex|grid)|<style|<svg|::after/i);
  });

  it('uses the exact completion subject, ordered blocks, and every photo in rows of up to three', async () => {
    const urls = Array.from({ length: 5 }, (_, i) => `https://images.example.test/${i}.jpg`);
    const result = await render('post', { ...visit, mowingInstructions: 'Visit-specific mowing.' }, urls);
    expect(result.subject).toBe('Broadleaf Weed Control completed – Sample Property');
    const terms = ['10:45 AM', 'Front lawn', 'Calm', 'For the next two days', 'What to expect', 'Photos from today',
      urls[0], urls[4], 'Summer Round', 'June 15', 'Required by Colorado law', 'A note from High Plains'];
    ordered(result.html, terms);
    ordered(result.textBody, terms);
    expect(result.html).toMatch(/alt="Photo 3"[^>]*><\/td><\/tr><\/table>[\s\S]+<tr><td[^>]*><img [^>]*alt="Photo 4"/);
    expect(result.html).toContain('Visit-specific mowing.');
    expect(result.textBody).not.toContain('Mow next week.');
    expect(result.textBody).not.toMatch(/<[^>]+>|Licensed Sample|Sample purpose/);
    expect(result.html).not.toMatch(/Legacy|display\s*:\s*(?:flex|grid)|<style|<svg|::after/i);
  });

  it('omits absent blocks, leaves company fallback out of the disclosure, and escapes supplied values', async () => {
    templates[0] = { ...base, ...Object.fromEntries(Object.keys(fields).map(key => [key, null])) };
    const pre = await render('pre', { customerName: '<Property>', applicatorLicense: 'ONLY-LICENSE', labelAttachmentUrl: 'javascript:alert(1)' });
    expect(pre.html).toContain('Before we arrive');
    expect(pre.html).toContain('&lt;Property&gt;');
    expect(pre.textBody).toContain('License #ONLY-LICENSE');
    expect(pre.html).not.toMatch(/Planned date|Backup date|After the application|What we’re applying|Product label|note from High Plains|javascript:/);
    const post = await render('post', { customerName: 'Sample Property' }, ['data:image/png;base64,test']);
    expect(post.html).not.toMatch(/For the next two days|What to expect|Photos from today|Next visit|Product label|note from High Plains|Licensed applicator/);
  });

  it('keeps visit input specs independent of stored HTML', () => {
    expect(chemicalVisitVariableSpec('pre').user.map(v => v.name)).toEqual(['targetDate', 'backupDate', 'notes']);
    expect(chemicalVisitVariableSpec('post').user.map(v => v.name)).toEqual(['areasTreated', 'applicationConditions', 'nextVisitDate', 'notes']);
  });

  it('honors selection over the company default, and refuses missing or cross-company selection', async () => {
    templates.push({ ...base, id: 'picked', name: 'Selected', isDefault: false }, { ...base, id: 'foreign', companyId: 'company-b' });
    expect((await render('pre', visit, [], 'picked')).subject).toBe('Upcoming Selected – Sample Property');
    expect((await render('pre')).templateId).toBe(base.id);
    await expect(render('pre', visit, [], 'foreign')).rejects.toThrow(/linked to this campaign no longer exists/);
  });

  it('keeps the same missing and ambiguous default errors', async () => {
    templates.length = 0;
    await expect(render('pre')).rejects.toBeInstanceOf(MissingChemicalNotificationTemplateError);
    await expect(render('pre')).rejects.toThrow(/Notification Templates/);
    templates.push(base, { ...base, id: 'duplicate' });
    await expect(render('pre')).rejects.toThrow(/Multiple notification templates/);
  });
});
