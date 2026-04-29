/**
 * Chemical email template seed registry.
 *
 * Each entry in CHEMICAL_TEMPLATE_REGISTRY describes one email template that
 * should exist for every company.  On startup the seeder calls
 * `seedChemicalEmailTemplates(companyId, storage)` for every company.
 *
 * The seeder is idempotent:
 *  - If the template does not exist in the DB it is created together with the
 *    matching automation rule.
 *  - If the template already exists but the HTML on disk has changed, only the
 *    htmlBody column is updated (subject / text are NOT overwritten so that
 *    company-level customisations survive restarts).
 */

import path from 'path';
import fs from 'fs';
import type { IStorage } from '../storage';

export interface TemplateRegistryEntry {
  /** Human-readable name stored in the DB */
  name: string;
  /** Automation event key that triggers this template */
  eventKey: string;
  /** Disk file inside server/templates/ */
  htmlFile: string;
  subject: string;
  textBody: string;
  /** Inline HTML fallback when the disk file cannot be read */
  htmlFallback: string;
}

export const CHEMICAL_TEMPLATE_REGISTRY: TemplateRegistryEntry[] = [
  {
    name: 'Chemical Treatment Notice',
    eventKey: 'campaign.chemical_pre_notice',
    htmlFile: 'chemical-treatment-notification.html',
    subject: 'Upcoming Chemical Treatment: {{customerName}}',
    textBody: `Upcoming Chemical Treatment: {{customerName}}\n\nThis is to inform you that a chemical treatment application is scheduled for your property.\n\nProperty: {{customerName}}\nCampaign: {{campaignTitle}}\nScheduled Window: {{windowStart}} - {{windowEnd}}\n\nPlease ensure that pets, children, and sensitive items are kept away from treated areas during and after application.\n\nIf you have any questions, please contact us.\n\n{{companyName}} - Property Maintenance Services`,
    htmlFallback: `<!DOCTYPE html><html><body><p>{{companyName}} — Upcoming Chemical Treatment for {{customerName}}. Scheduled: {{windowStart}} - {{windowEnd}}.</p><p>{{companyName}} - Property Maintenance Services</p></body></html>`,
  },
  {
    name: 'Chemical Treatment Completion',
    eventKey: 'campaign.chemical_post_notice',
    htmlFile: 'chemical-treatment-completion.html',
    subject: 'Chemical Treatment Completed: {{customerName}}',
    textBody: `Chemical Treatment Completed: {{customerName}}\n\nA chemical treatment has been completed at your property.\n\nProperty: {{customerName}}\nCampaign: {{campaignTitle}}\nCompleted On: {{completionDate}}\n\n{{textSections}}\n\nIf you have any questions about this treatment, please contact us directly.\n\n{{companyName}} - Property Maintenance Services`,
    htmlFallback: `<!DOCTYPE html><html><body><p>{{companyName}} — Chemical Treatment Completed for {{customerName}} on {{completionDate}}.</p><p>{{companyName}} - Property Maintenance Services</p></body></html>`,
  },
];

function loadHtmlFile(fileName: string): string | null {
  try {
    const filePath = path.resolve(process.cwd(), 'server', 'templates', fileName);
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Idempotent upsert: create the template + automation rule if absent,
 * otherwise sync the htmlBody if the disk file has changed.
 */
export async function seedChemicalEmailTemplates(
  companyId: string,
  storage: IStorage,
): Promise<void> {
  for (const entry of CHEMICAL_TEMPLATE_REGISTRY) {
    const htmlBody = loadHtmlFile(entry.htmlFile) || entry.htmlFallback;

    const existing = await storage.getEmailTemplateByName(entry.name, companyId);
    if (!existing) {
      const template = await storage.createEmailTemplate({
        name: entry.name,
        subject: entry.subject,
        htmlBody,
        textBody: entry.textBody,
        category: 'transactional' as const,
        isActive: true,
        companyId,
      });
      await storage.createEmailRule({
        companyId,
        eventKey: entry.eventKey,
        templateId: template.id,
        conditionsJson: null,
        isEnabled: true,
      });
      console.log(`Seeded email template "${entry.name}" for company ${companyId}`);
    } else if (existing.htmlBody !== htmlBody) {
      await storage.updateEmailTemplate(existing.id, companyId, { htmlBody });
      console.log(`Updated email template "${entry.name}" for company ${companyId} (disk content changed)`);
    }
  }
}

/** Convenience accessor — returns the pre-built template object for a given eventKey. */
export function getRegistryTemplate(eventKey: string): TemplateRegistryEntry | undefined {
  return CHEMICAL_TEMPLATE_REGISTRY.find(e => e.eventKey === eventKey);
}
