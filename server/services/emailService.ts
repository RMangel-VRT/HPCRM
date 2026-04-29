import sgMail from '@sendgrid/mail';
import { readFileSync } from 'fs';
import { join } from 'path';
import { storage } from '../storage';
import type { EmailLog, InsertEmailLog, EmailRule, CampaignItem, ChemicalProduct } from '@shared/schema';
import { getEmailFallbacks, formatTimeWindowWithFallback } from '../i18n/emailFallbacks';

function loadTemplateFile(filename: string): string {
  return readFileSync(join(__dirname, '../templates', filename), 'utf-8');
}

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key || !connectionSettings.settings.from_email)) {
    throw new Error('SendGrid not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, email: connectionSettings.settings.from_email };
}

async function getUncachableSendGridClient() {
  const { apiKey, email } = await getCredentials();
  sgMail.setApiKey(apiKey);
  return {
    client: sgMail,
    fromEmail: email
  };
}

export interface EmailContext {
  companyId: string;
  customerId?: string;
  ticketId?: string;
  templateId?: string;
  sentById?: string;
  variables: Record<string, string>;
}

export function renderTemplate(template: string, variables: Record<string, string>): string {
  // First process {{#if var}}...{{/if}} conditional blocks (supports optional sections in disk-based templates)
  let result = template.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, varName, content) => {
    return variables[varName]?.trim() ? content : '';
  });
  // Then substitute remaining {{var}} placeholders
  return result.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '');
}

function substituteVariables(template: string, variables: Record<string, string>): string {
  return renderTemplate(template, variables);
}

export async function sendEmail(
  toEmail: string,
  subject: string,
  htmlBody: string,
  textBody: string | null,
  context: EmailContext
): Promise<EmailLog> {
  const resolvedSubject = substituteVariables(subject, context.variables);
  const resolvedHtml = substituteVariables(htmlBody, context.variables);
  const resolvedText = textBody ? substituteVariables(textBody, context.variables) : undefined;

  const logEntry = await storage.createEmailLog({
    companyId: context.companyId,
    customerId: context.customerId || null,
    ticketId: context.ticketId || null,
    templateId: context.templateId || null,
    toEmail,
    subject: resolvedSubject,
    htmlBody: resolvedHtml,
    status: 'pending',
    sentById: context.sentById || null,
    providerMessageId: null,
    errorJson: null,
    sentAt: null,
  });

  try {
    const { client, fromEmail } = await getUncachableSendGridClient();

    const msg: sgMail.MailDataRequired = {
      to: toEmail,
      from: fromEmail,
      subject: resolvedSubject,
      html: resolvedHtml,
      ...(resolvedText && { text: resolvedText }),
    };

    const [response] = await client.send(msg);

    const providerMessageId = response?.headers?.['x-message-id'] || null;

    const updated = await storage.updateEmailLog(logEntry.id, {
      status: 'sent',
      providerMessageId,
      sentAt: new Date(),
    });

    console.log(`Email sent successfully to ${toEmail}, log ID: ${logEntry.id}`);
    return updated || logEntry;
  } catch (error: any) {
    console.error(`Failed to send email to ${toEmail}:`, error?.message || error);

    const errorInfo = {
      message: error?.message || 'Unknown error',
      code: error?.code,
      response: error?.response?.body,
    };

    const updated = await storage.updateEmailLog(logEntry.id, {
      status: 'failed',
      errorJson: errorInfo,
    });

    return updated || logEntry;
  }
}

export async function processEmailEvent(
  eventKey: string,
  companyId: string,
  variables: Record<string, string>,
  options: {
    customerId?: string;
    ticketId?: string;
    toEmail?: string;
    sentById?: string;
  }
): Promise<EmailLog[]> {
  const rules = await storage.getEmailRulesByEvent(eventKey, companyId);
  const results: EmailLog[] = [];

  for (const rule of rules) {
    try {
      const template = await storage.getEmailTemplateById(rule.templateId, companyId);
      if (!template || !template.isActive) {
        console.log(`Skipping rule ${rule.id}: template not found or inactive`);
        continue;
      }

      if (!options.toEmail) {
        console.log(`Skipping rule ${rule.id}: no recipient email address`);
        continue;
      }

      const context: EmailContext = {
        companyId,
        customerId: options.customerId,
        ticketId: options.ticketId,
        templateId: template.id,
        sentById: options.sentById,
        variables,
      };

      const log = await sendEmail(
        options.toEmail,
        template.subject,
        template.htmlBody,
        template.textBody,
        context
      );
      results.push(log);
    } catch (err) {
      console.error(`Error processing email rule ${rule.id}:`, err);
    }
  }

  return results;
}

export async function resendEmail(emailLogId: string, companyId: string, sentById: string): Promise<EmailLog | null> {
  const existingLog = await storage.getEmailLogById(emailLogId, companyId);
  if (!existingLog) return null;

  const context: EmailContext = {
    companyId,
    customerId: existingLog.customerId || undefined,
    ticketId: existingLog.ticketId || undefined,
    templateId: existingLog.templateId || undefined,
    sentById,
    variables: {},
  };

  return sendEmail(
    existingLog.toEmail,
    existingLog.subject,
    existingLog.htmlBody || '',
    null,
    context
  );
}

export function getDefaultWorkCompletedTemplate() {
  return {
    name: 'Work Completed Notification',
    subject: 'Work Completed: {{ticketTitle}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background-color: #1a5632; padding: 24px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; }
    .content { padding: 32px 24px; }
    .content h2 { color: #1a5632; margin-top: 0; }
    .detail-row { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-label { color: #6b7280; font-size: 13px; text-transform: uppercase; }
    .detail-value { color: #111827; font-size: 15px; margin-top: 2px; }
    .footer { padding: 16px 24px; background-color: #f9fafb; text-align: center; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{companyName}}</h1>
    </div>
    <div class="content">
      <h2>Work Completed</h2>
      <p>The following work has been completed at your property:</p>
      <div class="detail-row">
        <div class="detail-label">Work Description</div>
        <div class="detail-value">{{ticketTitle}}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Property</div>
        <div class="detail-value">{{customerName}}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Completed On</div>
        <div class="detail-value">{{completionDate}}</div>
      </div>
      {{#if ticketDescription}}
      <div class="detail-row">
        <div class="detail-label">Details</div>
        <div class="detail-value">{{ticketDescription}}</div>
      </div>
      {{/if}}
      <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">
        If you have any questions about this work, please contact us.
      </p>
    </div>
    <div class="footer">
      <p>{{companyName}} - Property Maintenance Services</p>
    </div>
  </div>
</body>
</html>`,
    textBody: `Work Completed: {{ticketTitle}}\n\nThe following work has been completed at your property:\n\nWork: {{ticketTitle}}\nProperty: {{customerName}}\nCompleted On: {{completionDate}}\n\nIf you have any questions about this work, please contact us.\n\n{{companyName}} - Property Maintenance Services`,
    category: 'transactional' as const,
    isActive: true,
  };
}

export function getDefaultChemicalPreNoticeTemplate() {
  const htmlBody =
    loadTemplateFile('chemical-treatment-notification.html') ||
    `<!DOCTYPE html><html><body><p>{{companyName}} — Upcoming Chemical Treatment for {{customerName}}. Scheduled: {{windowStart}} - {{windowEnd}}.</p><p>{{companyName}} - Property Maintenance Services</p></body></html>`;

  return {
    name: 'Chemical Treatment Notice',
    subject: 'Upcoming Chemical Treatment: {{customerName}}',
    htmlBody,
    textBody: `Upcoming Chemical Treatment: {{customerName}}\n\nThis is to inform you that a chemical treatment application is scheduled for your property.\n\nProperty: {{customerName}}\nCampaign: {{campaignTitle}}\nScheduled Window: {{windowStart}} - {{windowEnd}}\n\nPlease ensure that pets, children, and sensitive items are kept away from treated areas during and after application.\n\nIf you have any questions, please contact us.\n\n{{companyName}} - Property Maintenance Services`,
    category: 'transactional' as const,
    isActive: true,
  };
}

function loadTemplateFile(fileName: string): string | null {
  try {
    const templatePath = path.resolve(process.cwd(), 'server', 'templates', fileName);
    return fs.readFileSync(templatePath, 'utf-8');
  } catch {
    return null;
  }
}

export function getDefaultChemicalPostNoticeTemplate() {
  const htmlBody =
    loadTemplateFile('chemical-treatment-completion.html') ||
    `<!DOCTYPE html><html><body><p>{{companyName}} — Chemical Treatment Completed for {{customerName}} on {{completionDate}}.</p><p>{{companyName}} - Property Maintenance Services</p></body></html>`;

  return {
    name: 'Chemical Treatment Completion',
    subject: 'Chemical Treatment Completed: {{customerName}}',
    htmlBody,
    textBody: `Chemical Treatment Completed: {{customerName}}\n\nA chemical treatment has been completed at your property.\n\nProperty: {{customerName}}\nCampaign: {{campaignTitle}}\nCompleted On: {{completionDate}}\n\n{{textSections}}\n\nIf you have any questions about this treatment, please contact us directly.\n\n{{companyName}} - Property Maintenance Services`,
    category: 'transactional' as const,
    isActive: true,
  };
}

export function getDefaultChemicalTreatmentNotificationTemplate() {
  return {
    name: 'Chemical Treatment Notification',
    subject: 'Scheduled Chemical Treatment \u2014 {{customerName}}',
    htmlBody: loadTemplateFile('chemical-treatment-notification.html'),
    textBody: `Scheduled Chemical Treatment: {{customerName}}\n\nThis is to notify you of an upcoming chemical treatment at your property.\n\nProperty: {{customerName}}\nCampaign: {{campaignTitle}}\nScheduled Date: {{targetDate}}\nBackup Date: {{backupDate}}\nService Window: {{timeWindow}}\nProduct: {{productName}}\nManufacturer: {{productManufacturer}}\nActive Ingredient: {{productActiveIngredient}}\nPurpose: {{productPurpose}}\nRe-entry Interval: {{reentryInterval}}\nWatering: {{wateringInstructions}}\nMowing: {{mowingInstructions}}\nApplicator: {{applicatorName}} ({{applicatorLicense}})\n\nPlease keep pets and children off treated areas until dry.\n\n{{companyName}} \u2014 Property Maintenance Services`,
    category: 'transactional' as const,
    isActive: true,
  };
}

/**
 * Formats a time window string from start and end values.
 * e.g. "08:00" and "12:00" → "8:00 AM – 12:00 PM"
 * Delegates to the locale-aware formatTimeWindowWithFallback (defaults to English).
 */
export function formatTimeWindow(start: string | null | undefined, end: string | null | undefined): string {
  return formatTimeWindowWithFallback(start, end, 'en');
}

/**
 * Builds the merge variables for a chemical treatment notification email.
 * Priority model:
 *   1. Per-visit override fields from campaign item (highest priority)
 *   2. Product catalog defaults
 *   3. Locale-aware fallback strings via server/i18n/emailFallbacks.ts
 *
 * @param locale - BCP-47 locale code (e.g. "en", "es") to select fallback language.
 *   Defaults to "en". Pass the customer/company preferred language where available.
 */
export function buildChemicalNotificationVariables(
  item: Partial<CampaignItem>,
  product: ChemicalProduct | null | undefined,
  campaign: { title: string; windowStart: string; windowEnd: string },
  company: { name: string; phone?: string | null; email?: string | null },
  customerName: string,
  applicatorName?: string | null,
  applicatorLicense?: string | null,
  labelAttachmentUrl?: string | null,
  locale?: string | null,
): Record<string, string> {
  const fb = getEmailFallbacks(locale);
  // Per-visit override → product default → locale-aware i18n fallback string
  const purpose = (item as any).purposeOverride ?? (product as any)?.purposeDescription ?? fb.generalPurpose;
  const reentry = (item as any).reentryIntervalOverride ?? (product as any)?.reentryIntervalHours;
  const watering = (item as any).wateringInstructionsOverride ?? (product as any)?.wateringInstructions ?? fb.wateringInstructions;
  const mowing = (item as any).mowingInstructionsOverride ?? (product as any)?.mowingInstructions ?? fb.mowingInstructions;
  const timeWindow = formatTimeWindowWithFallback((item as any).timeWindowStart, (item as any).timeWindowEnd, locale);
  return {
    companyName: company.name || '',
    companyPhone: company.phone || fb.seeCompanyContact,
    companyEmail: company.email || '',
    customerName: customerName || '',
    campaignTitle: campaign.title || '',
    targetDate: (item as any).targetDate || campaign.windowStart || fb.toBeScheduled,
    backupDate: (item as any).backupDate || fb.toBeDetermined,
    timeWindow,
    windowStart: campaign.windowStart || '',
    windowEnd: campaign.windowEnd || '',
    productName: product?.name || fb.seeTreatmentDocumentation,
    productManufacturer: (product as any)?.manufacturer || '',
    productCategory: (product as any)?.category || '',
    productEpaRegNumber: product?.epaRegistrationNumber || '',
    productSignalWord: product?.signalWord || '',
    productActiveIngredient: product?.activeIngredient || '',
    productPurpose: purpose,
    reentryInterval: reentry != null ? `${reentry} hours` : fb.seeProductLabel,
    wateringInstructions: watering,
    mowingInstructions: mowing,
    applicatorName: applicatorName || fb.licensedApplicator,
    applicatorLicense: applicatorLicense || '',
    labelAttachmentUrl: labelAttachmentUrl || '',
  };
}

export function buildChemicalCompletionEmailVars(params: {
  companyName: string;
  customerName: string;
  campaignTitle: string;
  completionDate: string;
  completionTime?: string;
  nextVisitTitle?: string;
  applicatorName?: string;
  areasTreated?: string;
  applicationConditions?: string;
  notes?: string;
  postApplicationExpectation?: string;
  reEntryInterval?: string;
  mowingRestriction?: string;
  wateringInstructions?: string;
  photoHtmlThumbs?: string;
  nextVisitDate?: string;
}): Record<string, string> {
  const {
    companyName, customerName, campaignTitle, completionDate,
    completionTime = '', nextVisitTitle = 'Next Scheduled Visit',
    applicatorName = '', areasTreated = '', applicationConditions = '',
    notes = '', postApplicationExpectation = '', reEntryInterval = '',
    mowingRestriction = '', wateringInstructions = '',
    photoHtmlThumbs = '', nextVisitDate = '',
  } = params;

  // Build plain-text sections for the textBody template
  const textParts: string[] = [];
  if (applicatorName) textParts.push(`Completed By: ${applicatorName}`);
  if (completionTime) textParts.push(`Completion Time: ${completionTime}`);
  if (areasTreated) textParts.push(`Areas Treated: ${areasTreated}`);
  if (applicationConditions) textParts.push(`Conditions: ${applicationConditions}`);
  if (notes) textParts.push(`Notes: ${notes}`);
  if (nextVisitDate) textParts.push(`${nextVisitTitle}: ${nextVisitDate}`);
  if (postApplicationExpectation) textParts.push(`\nWhat to Expect:\n${postApplicationExpectation}`);
  if (reEntryInterval) textParts.push(`Re-Entry Interval: ${reEntryInterval}`);
  if (mowingRestriction) textParts.push(`Mowing Restriction: ${mowingRestriction}`);
  if (wateringInstructions) textParts.push(`Watering Instructions: ${wateringInstructions}`);

  // Return flat key-value pairs; disk-based HTML templates use {{#if var}}...{{/if}} for conditional sections
  return {
    companyName,
    customerName,
    campaignTitle,
    completionDate,
    completionTime,
    nextVisitTitle,
    applicatorName,
    areasTreated,
    applicationConditions,
    notes,
    postApplicationExpectation,
    reEntryInterval,
    mowingRestriction,
    wateringInstructions,
    photoHtmlThumbs,
    nextVisitDate,
    textSections: textParts.join('\n'),
  };
}

/**
 * Context-tagged render helper for chemical email templates.
 * Loads the appropriate disk template by context tag, then substitutes
 * variables using the shared renderTemplate engine.
 *
 * @param context 'pre-visit' | 'completion' — which template to render
 * @param vars    flat key→value map (from buildChemicalCompletionEmailVars or
 *                equivalent pre-visit var builder)
 */
export function renderChemicalEmail(
  context: 'pre-visit' | 'completion',
  vars: Record<string, string>,
): string {
  const fileMap: Record<string, string> = {
    'pre-visit': 'chemical-treatment-notification.html',
    'completion': 'chemical-treatment-completion.html',
  };
  const fileName = fileMap[context];
  const templatePath = path.resolve(process.cwd(), 'server', 'templates', fileName);
  let template: string;
  try {
    template = fs.readFileSync(templatePath, 'utf-8');
  } catch {
    // Inline fallback if disk file is missing
    template = context === 'pre-visit'
      ? `<p>{{companyName}} — Upcoming Chemical Treatment for {{customerName}}. Scheduled: {{windowStart}} - {{windowEnd}}.</p>`
      : `<p>{{companyName}} — Chemical Treatment Completed for {{customerName}} on {{completionDate}}.</p>`;
  }
  return renderTemplate(template, vars);
}
