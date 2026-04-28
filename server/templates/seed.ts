import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { storage } from '../storage';
import { getDefaultChemicalPreNoticeTemplate, getDefaultChemicalPostNoticeTemplate } from '../services/emailService';

// __dirname may not be defined in all tsx/esm contexts; resolve relative to cwd instead
const TEMPLATES_DIR = resolve(process.cwd(), 'server', 'templates');

function readTemplate(filename: string): string {
  return readFileSync(join(TEMPLATES_DIR, filename), 'utf-8');
}

interface TemplateDefinition {
  name: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  category: 'transactional' | 'marketing' | 'system';
  isActive: boolean;
}

const CHEMICAL_NOTIFICATION_TEXT = `Scheduled Chemical Treatment: {{customerName}}

This is to notify you of an upcoming chemical treatment at your property.

Property: {{customerName}}
Campaign: {{campaignTitle}}
Scheduled Date: {{targetDate}}
Backup Date: {{backupDate}}
Service Window: {{timeWindow}}
Product: {{productName}}
Manufacturer: {{productManufacturer}}
Active Ingredient: {{productActiveIngredient}}
Purpose: {{productPurpose}}
Re-entry Interval: {{reentryInterval}}
Watering: {{wateringInstructions}}
Mowing: {{mowingInstructions}}
Applicator: {{applicatorName}} ({{applicatorLicense}})

Please keep pets and children off treated areas until dry.

{{companyName}} \u2014 Property Maintenance Services`;

function getTemplateDefinitions(): TemplateDefinition[] {
  const chemPreTemplate = getDefaultChemicalPreNoticeTemplate();
  const chemPostTemplate = getDefaultChemicalPostNoticeTemplate();

  return [
    {
      name: chemPreTemplate.name,
      subject: chemPreTemplate.subject,
      htmlBody: chemPreTemplate.htmlBody,
      textBody: chemPreTemplate.textBody,
      category: chemPreTemplate.category,
      isActive: chemPreTemplate.isActive,
    },
    {
      name: chemPostTemplate.name,
      subject: chemPostTemplate.subject,
      htmlBody: chemPostTemplate.htmlBody,
      textBody: chemPostTemplate.textBody,
      category: chemPostTemplate.category,
      isActive: chemPostTemplate.isActive,
    },
    {
      name: 'Chemical Treatment Notification',
      subject: 'Scheduled Chemical Treatment \u2014 {{customerName}}',
      htmlBody: readTemplate('chemical-treatment-notification.html'),
      textBody: CHEMICAL_NOTIFICATION_TEXT,
      category: 'transactional',
      isActive: true,
    },
  ];
}

/**
 * Idempotently seeds chemical email templates for a company.
 * Safe to call on every startup — only inserts if a template with that
 * name does not already exist for the company. The notification template
 * is loaded from the file-backed source at
 * server/templates/chemical-treatment-notification.html.
 */
export async function seedChemicalEmailTemplates(companyId: string): Promise<void> {
  const definitions = getTemplateDefinitions();

  for (const def of definitions) {
    const existingByName = await storage.getEmailTemplateByName(def.name, companyId);
    if (!existingByName) {
      await storage.createEmailTemplate({
        companyId,
        name: def.name,
        subject: def.subject,
        htmlBody: def.htmlBody,
        textBody: def.textBody || null,
        category: def.category,
        isActive: def.isActive,
      });
    } else {
      // Upsert: update subject/body from source file so stale templates get corrected on startup
      await storage.updateEmailTemplate(existingByName.id, companyId, {
        subject: def.subject,
        htmlBody: def.htmlBody,
        textBody: def.textBody || null,
        category: def.category,
      });
    }
  }
}
