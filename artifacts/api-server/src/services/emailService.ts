import sgMail from '@sendgrid/mail';
import Handlebars from 'handlebars';
import { storage } from '../storage';
import type { EmailLog, InsertEmailLog, EmailRule, CampaignItem, ChemicalProduct, ChemicalNotificationTemplate } from '@workspace/db';
import { getEmailFallbacks, formatTimeWindowWithFallback } from '../i18n/emailFallbacks';

/**
 * Thrown by renderChemicalNotificationTemplate when no template can be resolved
 * for a chemical campaign. Routes should map this to HTTP 400 with the message.
 */
export class MissingChemicalNotificationTemplateError extends Error {
  status = 400 as const;
  constructor() {
    super(
      'This company has no chemical notification templates configured. Visit Settings \u2192 Notification Templates to create one.',
    );
    this.name = 'MissingChemicalNotificationTemplateError';
  }
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

// Compiled template cache — keyed by template source string
const compiledTemplateCache = new Map<string, HandlebarsTemplateDelegate>();

function getCompiledTemplate(template: string): HandlebarsTemplateDelegate {
  let compiled = compiledTemplateCache.get(template);
  if (!compiled) {
    compiled = Handlebars.compile(template, { noEscape: false });
    compiledTemplateCache.set(template, compiled);
  }
  return compiled;
}

export function renderTemplate(template: string, variables: Record<string, string>): string {
  try {
    const compiled = getCompiledTemplate(template);
    return compiled(variables);
  } catch {
    // Fallback: regex-based substitution so a syntax error never blocks an email send
    let result = template.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, varName, content) => {
      return variables[varName]?.trim() ? content : '';
    });
    return result.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '');
  }
}

export function substituteVariables(template: string, variables: Record<string, string>): string {
  try {
    const compiled = getCompiledTemplate(template);
    return compiled(variables);
  } catch {
    // Fallback: regex-based substitution so a syntax error never blocks an email send
    let result = template;
    let prev: string;
    do {
      prev = result;
      result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, inner) => {
        const val = variables[key];
        return (val && val.trim()) ? inner : '';
      });
    } while (result !== prev);
    result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '');
    return result;
  }
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
  // NOTE: Use {{{tripleStash}}} for variables containing raw HTML (photos, HTML fragments, etc.). Plain {{var}} HTML-escapes its value.
  return {
    name: 'Work Completed Notification',
    subject: 'Work Completed: {{ticketTitle}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background-color: #1a5632; padding: 24px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 0.5px; }
    .header p { color: #a7d7b0; margin: 6px 0 0; font-size: 14px; }
    .content { padding: 32px 24px; }
    .section-label { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #6b7280; margin: 20px 0 6px; }
    .section-value { color: #111827; font-size: 15px; line-height: 1.5; white-space: pre-wrap; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }
    .summary-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 16px 20px; margin: 0 0 20px; }
    .summary-box p { margin: 0; color: #166534; font-size: 15px; line-height: 1.6; white-space: pre-wrap; }
    .ref-box { background: #f9fafb; border-radius: 6px; padding: 12px 16px; margin-top: 20px; }
    .ref-box .ref-row { display: flex; font-size: 13px; margin: 3px 0; }
    .ref-box .ref-label { color: #6b7280; width: 130px; flex-shrink: 0; }
    .ref-box .ref-value { color: #111827; font-weight: 500; }
    .photos-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
    .photos-grid img { width: 100%; height: 140px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb; }
    .followup-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 12px 16px; margin-top: 8px; }
    .followup-box p { margin: 4px 0; font-size: 13px; }
    .followup-title { font-weight: 600; color: #1d4ed8; }
    .footer { padding: 20px 24px; background-color: #f9fafb; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
    .footer a { color: #6b7280; }
    h2 { color: #1a5632; margin: 0 0 8px; font-size: 20px; }
    .crew-line { font-size: 14px; color: #374151; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{companyName}}</h1>
      <p>Work Completion Report</p>
    </div>
    <div class="content">
      <h2>Work Completed</h2>
      <p style="color:#374151;font-size:14px;margin:0 0 16px;">The following service has been completed at your property.</p>

      <div class="section-label">Work Performed</div>
      <div class="summary-box">
        <p>{{workSummaryForCustomer}}</p>
      </div>

      {{#if scopeItemsHtml}}
      <div class="section-label">Scope of Work</div>
      <div class="section-value">{{{scopeItemsHtml}}}</div>
      <hr class="divider">
      {{/if}}

      {{#if materialsUsed}}
      <div class="section-label">Materials Used</div>
      <div class="section-value">{{materialsUsed}}</div>
      <hr class="divider">
      {{/if}}

      {{#if areasWorked}}
      <div class="section-label">Areas Worked</div>
      <div class="section-value">{{areasWorked}}</div>
      <hr class="divider">
      {{/if}}

      {{#if completionPhotosHtml}}
      <div class="section-label">Site Photos</div>
      <div class="photos-grid">{{{completionPhotosHtml}}}</div>
      <hr class="divider">
      {{/if}}

      {{#if recommendations}}
      <div class="section-label">Observations &amp; Recommendations</div>
      <div class="section-value">{{recommendations}}</div>
      <hr class="divider">
      {{/if}}

      <div class="section-label">Crew On Site</div>
      <div class="section-value">{{leadTechName}}</div>
      {{#if crewSummary}}
      <div class="crew-line">{{crewSummary}}</div>
      {{/if}}
      <hr class="divider">

      {{#if followUpTitle}}
      <div class="section-label">Next Steps</div>
      <div class="followup-box">
        <p class="followup-title">{{followUpTitle}}</p>
        {{#if followUpDetails}}
        <p style="color:#374151;">{{followUpDetails}}</p>
        {{/if}}
      </div>
      <hr class="divider">
      {{/if}}

      <div class="ref-box">
        <div class="ref-row"><span class="ref-label">Property</span><span class="ref-value">{{customerName}}</span></div>
        <div class="ref-row"><span class="ref-label">Service</span><span class="ref-value">{{serviceCategory}}</span></div>
        <div class="ref-row"><span class="ref-label">Completed</span><span class="ref-value">{{completionDate}}</span></div>
        {{#if timeOnSite}}
        <div class="ref-row"><span class="ref-label">Time on Site</span><span class="ref-value">{{timeOnSite}}</span></div>
        {{/if}}
        <div class="ref-row"><span class="ref-label">Reference #</span><span class="ref-value">{{ticketNumber}}</span></div>
      </div>

      <p style="margin-top:20px;color:#6b7280;font-size:13px;">
        If you have any questions about this work, please contact us at
        {{#if contactEmail}}<a href="mailto:{{contactEmail}}" style="color:#1a5632;">{{contactEmail}}</a>{{/if}}
        {{#if contactPhone}} or {{contactPhone}}{{/if}}.
      </p>
    </div>
    <div class="footer">
      <p>{{companyName}} &mdash; Property Maintenance Services</p>
    </div>
  </div>
</body>
</html>`,
    textBody: `Work Completed: {{ticketTitle}}\n\nThe following service has been completed at your property.\n\nWork Performed:\n{{workSummaryForCustomer}}\n\nProperty: {{customerName}}\nService: {{serviceCategory}}\nCompleted: {{completionDate}}\nLead Tech: {{leadTechName}}\nReference: {{ticketNumber}}\n\nIf you have any questions, please contact us.\n\n{{companyName}} - Property Maintenance Services`,
    category: 'transactional' as const,
    isActive: true,
  };
}

// The pre-#392 disk-template helpers and registry-based renderer were removed
// when the chemical email pipeline was consolidated onto the
// chemical_notification_templates table. Use
// renderChemicalNotificationTemplate(...) below instead.

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
  company: { name: string; phone?: string | null; email?: string | null; pesticideLicenseNumber?: string | null },
  customerName: string,
  applicatorName?: string | null,
  applicatorLicense?: string | null,
  labelAttachmentUrl?: string | null,
  labelAttachmentName?: string | null,
  locale?: string | null,
): Record<string, string> {
  const fb = getEmailFallbacks(locale);
  // Per-visit overrides ONLY for the canonical keys consumed by the new
  // chemical_notification_templates HTML (productName/activeIngredient/
  // epaRegNumber/purpose/reentryInterval/wateringInstructions/
  // mowingInstructions/postApplicationExpectation). When a visit has no
  // override, we deliberately omit the key so the renderer's
  // template-metadata defaults (baseFromTemplate) win — the template is the
  // source of truth for product details.
  const purposeOverride = item.purposeOverride;
  const reentryOverride = item.reentryIntervalOverride;
  const wateringOverride = item.wateringInstructionsOverride;
  const mowingOverride = item.mowingInstructionsOverride;
  const timeWindow = formatTimeWindowWithFallback(item.timeWindowStart, item.timeWindowEnd, locale);
  const out: Record<string, string> = {
    companyName: company.name || '',
    companyPhone: company.phone || fb.seeCompanyContact,
    companyEmail: company.email || '',
    // Canonical contact-block keys consumed by the new templates.
    contactPhone: company.phone || '',
    contactEmail: company.email || '',
    customerName: customerName || '',
    campaignTitle: campaign.title || '',
    targetDate: item.targetDate || campaign.windowStart || fb.toBeScheduled,
    backupDate: item.backupDate || fb.toBeDetermined,
    timeWindow,
    windowStart: campaign.windowStart || '',
    windowEnd: campaign.windowEnd || '',
    // Legacy `product*`-prefixed keys retained empty for backwards-compat
    // with any custom email_templates body that may still reference them.
    // (Pre-#392 disk templates have been removed; the `chemical_products`
    // table does not carry `manufacturer` / `category` columns.)
    productManufacturer: '',
    productCategory: '',
    productSignalWord: product?.signalWord || '',
    applicatorName: applicatorName || fb.licensedApplicator,
    applicatorLicense: applicatorLicense || '',
    pesticideLicenseNumber: company.pesticideLicenseNumber || '',
    labelAttachmentName: labelAttachmentName || '',
    labelAttachmentUrl: labelAttachmentUrl || '',
  };
  // Only emit canonical product/treatment keys when there is a true
  // per-visit override. Empty string would still clobber template metadata
  // (the renderer treats explicit empty as "use template default"), so we
  // omit instead.
  if (purposeOverride && String(purposeOverride).trim().length > 0) out.purpose = String(purposeOverride);
  if (reentryOverride !== undefined && reentryOverride !== null && String(reentryOverride).trim().length > 0) out.reentryInterval = String(reentryOverride);
  if (wateringOverride && String(wateringOverride).trim().length > 0) out.wateringInstructions = String(wateringOverride);
  if (mowingOverride && String(mowingOverride).trim().length > 0) out.mowingInstructions = String(mowingOverride);
  return out;
}

export function buildChemicalCompletionEmailVars(params: {
  companyName: string;
  customerName: string;
  campaignTitle: string;
  completionDate: string;
  completionTime?: string;
  nextVisitTitle?: string;
  applicatorName?: string;
  applicatorLicense?: string;
  areasTreated?: string;
  applicationConditions?: string;
  notes?: string;
  postApplicationExpectation?: string;
  reEntryInterval?: string;
  mowingRestriction?: string;
  wateringInstructions?: string;
  mowingInstructions?: string;
  photoHtmlThumbs?: string;
  nextVisitDate?: string;
  productName?: string;
  activeIngredient?: string;
  epaRegNumber?: string;
  purpose?: string;
  labelAttachmentUrl?: string;
  labelAttachmentName?: string;
  contactPhone?: string;
  contactEmail?: string;
  pesticideLicenseNumber?: string;
}): Record<string, string> {
  const {
    companyName, customerName, campaignTitle, completionDate,
    completionTime = '', nextVisitTitle = 'Next Scheduled Visit',
    applicatorName = '', applicatorLicense = '',
    areasTreated = '', applicationConditions = '',
    notes = '', postApplicationExpectation = '', reEntryInterval = '',
    mowingRestriction = '', wateringInstructions = '',
    mowingInstructions = '',
    photoHtmlThumbs = '', nextVisitDate = '',
    productName = '', activeIngredient = '', epaRegNumber = '', purpose = '',
    labelAttachmentUrl = '', labelAttachmentName = '',
    contactPhone = '', contactEmail = '', pesticideLicenseNumber = '',
  } = params;
  const resolvedMowingInstructions = mowingInstructions || mowingRestriction;
  const resolvedReentryInterval = reEntryInterval;

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

  // Return flat key-value pairs; HTML templates use {{#if var}}...{{/if}} for conditional sections.
  // Both legacy keys (reEntryInterval/photoHtmlThumbs/mowingRestriction) and the canonical
  // keys consumed by the new chemical_notification_templates HTML
  // (reentryInterval/completionPhotosHtml/mowingInstructions plus the product-detail
  // and contact-block keys) are emitted so callers don't have to know which
  // template is downstream.
  // Canonical product/treatment keys consumed by the new chemical
  // notification templates are deliberately omitted when the caller did
  // not pass a per-visit override, so the renderer's template-metadata
  // defaults win. Empty string would still clobber the template default.
  const out: Record<string, string> = {
    companyName,
    customerName,
    campaignTitle,
    completionDate,
    completionTime,
    nextVisitTitle,
    applicatorName,
    applicatorLicense,
    areasTreated,
    applicationConditions,
    notes,
    photoHtmlThumbs,
    completionPhotosHtml: photoHtmlThumbs,
    nextVisitDate,
    labelAttachmentUrl,
    labelAttachmentName,
    contactPhone,
    contactEmail,
    pesticideLicenseNumber,
    // Legacy aliases kept for backwards-compat with any pre-#392 custom
    // email body still using these names.
    reEntryInterval: resolvedReentryInterval,
    mowingRestriction,
    textSections: textParts.join('\n'),
  };
  if (postApplicationExpectation && postApplicationExpectation.trim().length > 0) out.postApplicationExpectation = postApplicationExpectation;
  if (resolvedReentryInterval && resolvedReentryInterval.trim().length > 0) out.reentryInterval = resolvedReentryInterval;
  if (resolvedMowingInstructions && resolvedMowingInstructions.trim().length > 0) out.mowingInstructions = resolvedMowingInstructions;
  if (wateringInstructions && wateringInstructions.trim().length > 0) out.wateringInstructions = wateringInstructions;
  if (productName && productName.trim().length > 0) out.productName = productName;
  if (activeIngredient && activeIngredient.trim().length > 0) out.activeIngredient = activeIngredient;
  if (epaRegNumber && epaRegNumber.trim().length > 0) out.epaRegNumber = epaRegNumber;
  if (purpose && purpose.trim().length > 0) out.purpose = purpose;
  return out;
}

/**
 * Auto-derive a plain-text fallback body from the rendered HTML. This is a
 * thin best-effort conversion (strip tags, decode common entities, collapse
 * whitespace) so SendGrid's `text/plain` mime part is never empty for
 * chemical notification emails.
 */
function htmlToTextFallback(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&middot;/g, '·')
    .replace(/&mdash;/g, '—')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Resolve a chemical notification template for a campaign.
 *
 * Priority:
 *   1. The campaign's selected `notificationTemplateId`.
 *   2. The company's `isDefault: true` chemical notification template.
 *
 * If neither resolves to a row, throws `MissingChemicalNotificationTemplateError`,
 * which routes should map to HTTP 400 with the embedded message.
 */
export async function resolveChemicalNotificationTemplate(
  campaign: { notificationTemplateId?: string | null },
  companyId: string,
): Promise<ChemicalNotificationTemplate> {
  if (campaign.notificationTemplateId) {
    const tpl = await storage.getChemicalNotificationTemplate(
      campaign.notificationTemplateId,
      companyId,
    );
    if (tpl) return tpl;
  }
  const all = await storage.getChemicalNotificationTemplates(companyId);
  const fallback = all.find(t => t.isDefault) ?? null;
  if (fallback) return fallback;
  throw new MissingChemicalNotificationTemplateError();
}

/**
 * Resolve a chemical notification template (per resolveChemicalNotificationTemplate)
 * and render its `pre`- or `post`-visit subject and HTML body using the supplied
 * variable map merged with the template's per-template product-detail metadata.
 *
 * Caller-supplied vars take precedence over template metadata so per-visit
 * overrides (e.g. visit-specific product, applicator, label PDF URL) win.
 */
export async function renderChemicalNotificationTemplate(
  campaign: { notificationTemplateId?: string | null },
  companyId: string,
  kind: 'pre' | 'post',
  vars: Record<string, string>,
): Promise<{ subject: string; html: string; textBody: string; templateId: string; templateName: string }> {
  const tpl = await resolveChemicalNotificationTemplate(campaign, companyId);

  // Template metadata as defaults; non-empty caller vars override.
  const baseFromTemplate: Record<string, string> = {
    productName: tpl.productName ?? '',
    activeIngredient: tpl.activeIngredient ?? '',
    epaRegNumber: tpl.epaRegNumber ?? '',
    purpose: tpl.purposeText ?? '',
    reentryInterval: tpl.reentryInterval ?? '',
    wateringInstructions: tpl.wateringInstructions ?? '',
    mowingInstructions: tpl.mowingInstructions ?? '',
    postApplicationExpectation: tpl.postApplicationExpectation ?? '',
  };
  const merged: Record<string, string> = { ...baseFromTemplate };
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined && v !== null && String(v).length > 0) {
      merged[k] = String(v);
    } else if (!(k in merged)) {
      merged[k] = '';
    }
  }

  const subject = kind === 'pre' ? tpl.preVisitSubject : tpl.postVisitSubject;
  const html = kind === 'pre' ? tpl.preVisitHtml : tpl.postVisitHtml;
  const renderedHtml = renderTemplate(html, merged);
  return {
    subject: renderTemplate(subject, merged),
    html: renderedHtml,
    // Auto-generated plain-text fallback so the SendGrid text part is never empty.
    textBody: htmlToTextFallback(renderedHtml),
    templateId: tpl.id,
    templateName: tpl.name,
  };
}
