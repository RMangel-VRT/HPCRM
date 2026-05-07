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

// ─────────────────────────────────────────────────────────────────────────────
// Chemical Notification Template seeds (multi-template system)
// ─────────────────────────────────────────────────────────────────────────────

const SHARED_EMAIL_STYLES = `
  body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
  .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
  .header { background-color: #1a5632; padding: 24px; text-align: center; }
  .header h1 { color: #ffffff; margin: 0; font-size: 22px; }
  .content { padding: 32px 24px; }
  .content h2 { color: #1a5632; margin-top: 0; }
  .detail-row { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
  .detail-label { color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
  .detail-value { color: #111827; font-size: 15px; margin-top: 2px; }
  .product-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 16px; margin-top: 20px; }
  .product-box h3 { color: #15803d; margin: 0 0 12px; font-size: 14px; text-transform: uppercase; }
  .notice-box { background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 14px 16px; margin-top: 24px; }
  .notice-box p { margin: 0; color: #166534; font-size: 14px; line-height: 1.5; }
  .footer { padding: 16px 24px; background-color: #f9fafb; text-align: center; font-size: 12px; color: #9ca3af; }
  .label-btn { display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #1a5632; color: #ffffff !important; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 600; }
`;

function buildPreVisitHtml(
  treatmentTitle: string,
  treatmentDescription: string,
  careInstructions: string,
  productDetailHtml?: string,
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${SHARED_EMAIL_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{companyName}}</h1>
    </div>
    <div class="content">
      <h2>${treatmentTitle}</h2>
      <p>${treatmentDescription}</p>
      <div class="detail-row">
        <div class="detail-label">Property</div>
        <div class="detail-value">{{customerName}}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Campaign</div>
        <div class="detail-value">{{campaignTitle}}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Scheduled Date</div>
        <div class="detail-value">{{targetDate}}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Backup Date</div>
        <div class="detail-value">{{backupDate}}</div>
      </div>
      <div class="notice-box">
        <p>${careInstructions}</p>
      </div>
      ${productDetailHtml ? productDetailHtml : ''}
      {{#if labelPdfUrl}}
      <div style="margin-top:20px;">
        <a href="{{labelPdfUrl}}" class="label-btn" target="_blank">View Product Label (PDF)</a>
      </div>
      {{/if}}
      {{#if notes}}
      <div class="detail-row" style="margin-top:16px;">
        <div class="detail-label">Additional Notes</div>
        <div class="detail-value">{{notes}}</div>
      </div>
      {{/if}}
    </div>
    <div class="footer">
      <p>{{companyName}} &mdash; Property Maintenance Services</p>
      {{#if pesticideLicenseNumber}}
      <p style="margin-top:6px;">Pesticide Applicator License: {{pesticideLicenseNumber}}</p>
      {{/if}}
    </div>
  </div>
</body>
</html>`;
}

function buildPostVisitHtml(
  treatmentTitle: string,
  postDescriptionHtml: string,
  careInstructionsHtml: string,
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${SHARED_EMAIL_STYLES}
  .detail-value { white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{companyName}}</h1>
    </div>
    <div class="content">
      <h2>${treatmentTitle} — Completed</h2>
      <p>A ${treatmentTitle.toLowerCase()} application has been completed at your property.</p>
      <div class="detail-row">
        <div class="detail-label">Property</div>
        <div class="detail-value">{{customerName}}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Campaign</div>
        <div class="detail-value">{{campaignTitle}}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Completion Date</div>
        <div class="detail-value">{{completionDate}}</div>
      </div>
      {{#if areasTreated}}
      <div class="detail-row">
        <div class="detail-label">Areas Treated</div>
        <div class="detail-value">{{areasTreated}}</div>
      </div>
      {{/if}}
      {{#if applicationConditions}}
      <div class="detail-row">
        <div class="detail-label">Application Conditions</div>
        <div class="detail-value">{{applicationConditions}}</div>
      </div>
      {{/if}}
      {{#if nextVisitDate}}
      <div class="detail-row">
        <div class="detail-label">Next Scheduled Visit</div>
        <div class="detail-value">{{nextVisitDate}}</div>
      </div>
      {{/if}}
      {{#if notes}}
      <div class="detail-row">
        <div class="detail-label">Technician Notes</div>
        <div class="detail-value">{{notes}}</div>
      </div>
      {{/if}}
      ${postDescriptionHtml}
      ${careInstructionsHtml}
      <div class="notice-box">
        <p>If you have any questions about this treatment, please contact us directly. Thank you for your continued trust in our services.</p>
      </div>
    </div>
    <div class="footer">
      <p>{{companyName}} &mdash; Property Maintenance Services</p>
    </div>
  </div>
</body>
</html>`;
}

interface ChemNotifTemplateSeed {
  name: string;
  serviceType: string;
  preVisitSubject: string;
  preVisitHtml: string;
  postVisitSubject: string;
  postVisitHtml: string;
}

const CHEM_NOTIF_TEMPLATE_SEEDS: ChemNotifTemplateSeed[] = [
  {
    name: 'Broadleaf Weed Control',
    serviceType: 'broadleaf_weed_control',
    preVisitSubject: 'Upcoming Broadleaf Weed Control Application — {{customerName}}',
    preVisitHtml: buildPreVisitHtml(
      'Scheduled Broadleaf Weed Control Application',
      'We will be applying a selective broadleaf herbicide to your property on the date listed below.',
      'Please keep pets, children, and sensitive individuals off treated areas for at least 48 hours after application and until the lawn is completely dry. Do not water or mow for 24 hours following treatment.',
      `<div class="product-box" style="margin-top:20px;">
        <h3>Product Label &amp; Safety Information</h3>
        <div class="detail-row">
          <div class="detail-label">Product Name</div>
          <div class="detail-value">LESCO Three-Way Selective Herbicide</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Active Ingredients</div>
          <div class="detail-value">2,4-D, Mecoprop-p (MCPP), Dicamba</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Target Weeds</div>
          <div class="detail-value">Broadleaf weeds including dandelion, clover, plantain, ground ivy, and thistle</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Re-Entry Interval</div>
          <div class="detail-value">48 hours or until the lawn is completely dry</div>
        </div>
      </div>`,
    ),
    postVisitSubject: 'Broadleaf Weed Control Completed — {{customerName}}',
    postVisitHtml: buildPostVisitHtml(
      'Broadleaf Weed Control',
      `<div class="product-box">
        <h3>What to Expect</h3>
        <div class="detail-row">
          <div class="detail-label">Visible Results</div>
          <div class="detail-value">Broadleaf weeds will begin to show signs of stress (yellowing, curling) within 7–14 days. Full results are typically visible within 3–4 weeks depending on weed species and weather.</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Product Applied</div>
          <div class="detail-value">LESCO Three-Way Selective Herbicide (2,4-D, Mecoprop-p, Dicamba)</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Re-Entry Interval</div>
          <div class="detail-value">48 hours from time of application</div>
        </div>
      </div>`,
      `<div class="notice-box" style="margin-top:20px;">
        <p><strong>Post-Application Care:</strong> Do not mow for 48 hours. Do not water or irrigate for 24 hours. Keep pets and children off treated areas until the lawn is completely dry. Heavy rain within 4 hours of application may reduce effectiveness.</p>
      </div>`,
    ),
  },
  {
    name: 'Fertilizer Application',
    serviceType: 'fertilizer_application',
    preVisitSubject: 'Upcoming Fertilizer Application — {{customerName}}',
    preVisitHtml: buildPreVisitHtml(
      'Scheduled Fertilizer Application',
      'We will be applying a professional turf fertilizer to your property to promote healthy growth and color.',
      'Granular fertilizer is safe for people and pets once it has been watered in and the lawn has dried. We recommend watering within 24–48 hours of application to maximize effectiveness. Avoid mowing immediately before or after application if possible.',
      `<div class="product-box" style="margin-top:20px;">
        <h3>Product Label &amp; Safety Information</h3>
        <div class="detail-row">
          <div class="detail-label">Product Name</div>
          <div class="detail-value">Professional Granular Turf Fertilizer</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Formulation</div>
          <div class="detail-value">Balanced NPK with slow-release nitrogen</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Re-Entry Interval</div>
          <div class="detail-value">Safe once granules are watered in and the surface is completely dry (typically 24–48 hours)</div>
        </div>
      </div>`,
    ),
    postVisitSubject: 'Fertilizer Application Completed — {{customerName}}',
    postVisitHtml: buildPostVisitHtml(
      'Fertilizer Application',
      `<div class="product-box">
        <h3>What to Expect</h3>
        <div class="detail-row">
          <div class="detail-label">Visible Results</div>
          <div class="detail-value">You should notice greening and improved turf density within 2–3 weeks. Slow-release formulations continue feeding your lawn for 6–8 weeks after application.</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Application Type</div>
          <div class="detail-value">Professional Granular Turf Fertilizer (Balanced NPK with slow-release nitrogen)</div>
        </div>
      </div>`,
      `<div class="notice-box" style="margin-top:20px;">
        <p><strong>Post-Application Care:</strong> Water within 24–48 hours to activate granules. Keep pets off the lawn until granules are watered in and the surface is dry. Avoid heavy foot traffic for 24 hours. Resume normal mowing schedule after watering.</p>
      </div>`,
    ),
  },
  {
    name: 'Pre-Emergent Application',
    serviceType: 'pre_emergent_application',
    preVisitSubject: 'Upcoming Pre-Emergent Herbicide Application — {{customerName}}',
    preVisitHtml: buildPreVisitHtml(
      'Scheduled Pre-Emergent Herbicide Application',
      'We will be applying a pre-emergent herbicide to prevent crabgrass and other annual weeds from germinating in your lawn.',
      'Pre-emergent products create a chemical barrier in the soil. It is important to water in the product within 21 days to activate it. Avoid aerating, overseeding, or disturbing the soil after application, as this breaks the barrier.',
      `<div class="product-box" style="margin-top:20px;">
        <h3>Product Label &amp; Safety Information</h3>
        <div class="detail-row">
          <div class="detail-label">Product Name</div>
          <div class="detail-value">Prodiamine-Based Pre-Emergent Herbicide</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Active Ingredient</div>
          <div class="detail-value">Prodiamine 0.37%</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Target Weeds</div>
          <div class="detail-value">Crabgrass, annual bluegrass, foxtail, and other annual grassy weeds</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Re-Entry Interval</div>
          <div class="detail-value">Safe to enter once product is watered in (within 21 days of application)</div>
        </div>
      </div>`,
    ),
    postVisitSubject: 'Pre-Emergent Herbicide Application Completed — {{customerName}}',
    postVisitHtml: buildPostVisitHtml(
      'Pre-Emergent Herbicide Application',
      `<div class="product-box">
        <h3>What to Expect</h3>
        <div class="detail-row">
          <div class="detail-label">How It Works</div>
          <div class="detail-value">Pre-emergent herbicides prevent weed seeds from germinating by inhibiting root development at the soil level. They do not kill existing weeds. Results are best judged by the absence of new weed growth throughout the season.</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Active Ingredient Applied</div>
          <div class="detail-value">Prodiamine (0.37%) — provides season-long control of crabgrass, annual bluegrass, and other annual weeds</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Critical Next Step</div>
          <div class="detail-value">Water in with 0.5 inches of irrigation or natural rainfall within 21 days to activate the weed barrier</div>
        </div>
      </div>`,
      `<div class="notice-box" style="margin-top:20px;">
        <p><strong>Important:</strong> Do NOT aerate, overseed, or disturb the soil after application — this breaks the pre-emergent barrier and reduces effectiveness. If overseeding is needed, it should be done in the fall after the pre-emergent has broken down.</p>
      </div>`,
    ),
  },
  {
    name: 'Crabgrass Treatment',
    serviceType: 'crabgrass_treatment',
    preVisitSubject: 'Upcoming Crabgrass Treatment Application — {{customerName}}',
    preVisitHtml: buildPreVisitHtml(
      'Scheduled Post-Emergent Crabgrass Control Application',
      'We will be applying a post-emergent herbicide specifically targeting actively growing crabgrass in your lawn.',
      'Please keep pets and children off treated areas until the lawn is completely dry. Do not mow or water for 24 hours following application to allow the product to be fully absorbed by weed foliage.',
      `<div class="product-box" style="margin-top:20px;">
        <h3>Product Label &amp; Safety Information</h3>
        <div class="detail-row">
          <div class="detail-label">Product Name</div>
          <div class="detail-value">Post-Emergent Crabgrass Control</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Active Ingredient</div>
          <div class="detail-value">Quinclorac — post-emergent selective herbicide</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Target Weeds</div>
          <div class="detail-value">Actively growing crabgrass</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Re-Entry Interval</div>
          <div class="detail-value">Keep off treated areas until completely dry (2–4 hours)</div>
        </div>
      </div>`,
    ),
    postVisitSubject: 'Crabgrass Treatment Completed — {{customerName}}',
    postVisitHtml: buildPostVisitHtml(
      'Crabgrass Treatment',
      `<div class="product-box">
        <h3>What to Expect</h3>
        <div class="detail-row">
          <div class="detail-label">Visible Results</div>
          <div class="detail-value">Crabgrass plants will begin to show yellowing and wilting within 7–10 days. Complete browning typically occurs within 2–3 weeks. Dead crabgrass can be removed after it has fully died.</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Retreatment</div>
          <div class="detail-value">Heavily infested areas or late-season crabgrass may require a follow-up application 3–4 weeks after the initial treatment.</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Active Ingredient Applied</div>
          <div class="detail-value">Quinclorac — post-emergent selective herbicide targeting actively growing crabgrass</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Re-Entry Interval</div>
          <div class="detail-value">Keep off treated areas until completely dry (2–4 hours)</div>
        </div>
      </div>`,
      `<div class="notice-box" style="margin-top:20px;">
        <p><strong>Post-Application Care:</strong> Do not mow or water for 24 hours. Once crabgrass has died, bare areas can be overseeded in the fall to restore turf density and prevent future weed pressure. Contact us if you would like to schedule an overseeding service.</p>
      </div>`,
    ),
  },
];

/**
 * Idempotent upsert: seed four standard chemical notification templates per company.
 * If a template with the same name already exists, sync only the preVisitHtml to pick
 * up structural changes while preserving company-level subject customisations.
 */
export async function seedChemicalNotificationTemplates(
  companyId: string,
  storage: IStorage,
): Promise<void> {
  for (const seed of CHEM_NOTIF_TEMPLATE_SEEDS) {
    const existing = await storage.getChemicalNotificationTemplates(companyId);
    const match = existing.find(t => t.name === seed.name);
    if (!match) {
      await storage.createChemicalNotificationTemplate({
        companyId,
        name: seed.name,
        serviceType: seed.serviceType,
        isDefault: false,
        preVisitSubject: seed.preVisitSubject,
        preVisitHtml: seed.preVisitHtml,
        postVisitSubject: seed.postVisitSubject,
        postVisitHtml: seed.postVisitHtml,
        createdBy: null,
      });
      console.log(`Seeded chemical notification template "${seed.name}" for company ${companyId}`);
    } else if (match.preVisitHtml !== seed.preVisitHtml) {
      await storage.updateChemicalNotificationTemplate(match.id, companyId, { preVisitHtml: seed.preVisitHtml });
      console.log(`Updated pre-visit HTML for chemical notification template "${seed.name}" for company ${companyId}`);
    }
  }
}
