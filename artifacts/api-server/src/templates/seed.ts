/**
 * Chemical Notification Template seeds (System 2, the only chemical-email system).
 *
 * Each seed defines one row in `chemical_notification_templates` keyed by
 * (companyId, name). The template HTML is driven entirely by Handlebars
 * variables (`{{productName}}`, `{{activeIngredient}}`, etc.) that are
 * populated at send time by `renderChemicalNotificationTemplate(...)` in
 * `emailService.ts` from the matching per-template metadata columns.
 *
 * The legacy `email_templates`-based chemical entries (System 1) and the two
 * disk HTML files have been removed; per-company cleanup of those rows is
 * `migrateRemoveChemicalEmailTemplates` in
 * `services/legacyChemEmailCleanup.ts`, called from the seed bootstrap.
 */

import type { IStorage } from '../storage';

// ─── Shared HTML building blocks ─────────────────────────────────────────────

const SHARED_EMAIL_STYLES = `
  body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; color: #111827; }
  .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
  .header { background-color: #1a5632; padding: 24px; text-align: center; }
  .header h1 { color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 0.5px; }
  .header p { color: #a7d7b0; margin: 6px 0 0; font-size: 13px; }
  .content { padding: 32px 24px; }
  .content h2 { color: #1a5632; margin: 0 0 8px; font-size: 20px; }
  .section-title { color: #1a5632; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin: 24px 0 8px; }
  .detail-row { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
  .detail-label { color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .detail-value { color: #111827; font-size: 15px; margin-top: 2px; white-space: pre-wrap; }
  .date-box { display: inline-block; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 10px 14px; margin: 4px 8px 4px 0; min-width: 170px; }
  .date-box .date-label { color: #15803d; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
  .date-box .date-value { color: #111827; font-size: 15px; font-weight: 600; margin-top: 2px; }
  .date-box.backup { background: #fef3c7; border-color: #fde68a; }
  .date-box.backup .date-label { color: #92400e; }
  .product-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 16px 18px; margin-top: 16px; }
  .product-box h3 { color: #15803d; margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; }
  .info-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 14px 16px; margin-top: 16px; color: #1e3a8a; font-size: 14px; line-height: 1.55; }
  .info-box strong { color: #1d4ed8; }
  .care-list { padding-left: 18px; margin: 8px 0 0; color: #374151; font-size: 14px; line-height: 1.6; }
  .care-list li { margin-bottom: 4px; }
  .applicator-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px 16px; margin-top: 16px; }
  .applicator-card .ac-name { color: #111827; font-weight: 600; font-size: 15px; }
  .applicator-card .ac-license { color: #6b7280; font-size: 13px; margin-top: 2px; }
  .applicator-card .ac-contact { color: #1a5632; font-size: 13px; margin-top: 6px; }
  .applicator-card .ac-contact a { color: #1a5632; text-decoration: none; }
  .attachment { border: 1px dashed #bbf7d0; background: #f0fdf4; border-radius: 6px; padding: 16px; margin-top: 18px; text-align: center; }
  .attachment .attach-name { color: #166534; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
  .label-btn { display: inline-block; padding: 10px 22px; background-color: #1a5632; color: #ffffff !important; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 600; }
  .completed-banner { display: flex; align-items: center; gap: 12px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 14px 18px; margin: 0 0 20px; }
  .completed-banner .check-circle { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: #16a34a; color: #ffffff; font-size: 18px; font-weight: 700; flex-shrink: 0; }
  .completed-banner .check-circle::after { content: '\\2713'; }
  .completed-banner .banner-text { color: #166534; font-weight: 700; font-size: 16px; }
  .expect-box { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; padding: 14px 16px; margin-top: 16px; color: #7c2d12; font-size: 14px; line-height: 1.55; }
  .next-visit { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 14px 16px; margin-top: 16px; }
  .next-visit .nv-label { color: #1d4ed8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }
  .next-visit .nv-value { color: #1e3a8a; font-size: 16px; font-weight: 600; margin-top: 4px; }
  .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
  .photos img { width: 100%; height: 120px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb; }
  .signoff { margin-top: 24px; color: #374151; font-size: 14px; line-height: 1.55; }
  .footer { padding: 18px 24px; background-color: #f9fafb; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
`;

function buildPreVisitHtml(treatmentTitle: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${SHARED_EMAIL_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{companyName}}</h1>
      <p>Scheduled Visit Notice</p>
    </div>
    <div class="content">
      <h2>${treatmentTitle}</h2>
      <p>Hello {{customerName}}, this is to notify you of an upcoming visit at your property.</p>

      <div class="section-title">Scheduled Visit</div>
      <div>
        <div class="date-box">
          <div class="date-label">Target Date</div>
          <div class="date-value">{{targetDate}}</div>
        </div>
        <div class="date-box backup">
          <div class="date-label">Backup Date</div>
          <div class="date-value">{{backupDate}}</div>
        </div>
      </div>
      {{#if timeWindow}}
      <div class="detail-row">
        <div class="detail-label">Service Window</div>
        <div class="detail-value">{{timeWindow}}</div>
      </div>
      {{/if}}
      <div class="detail-row">
        <div class="detail-label">Property</div>
        <div class="detail-value">{{customerName}}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Campaign</div>
        <div class="detail-value">{{campaignTitle}}</div>
      </div>

      <div class="section-title">What We're Applying</div>
      <div class="product-box">
        <h3>Treatment Details</h3>
        {{#if productName}}
        <div class="detail-row">
          <div class="detail-label">Product</div>
          <div class="detail-value">{{productName}}</div>
        </div>
        {{/if}}
        {{#if activeIngredient}}
        <div class="detail-row">
          <div class="detail-label">Active Ingredient</div>
          <div class="detail-value">{{activeIngredient}}</div>
        </div>
        {{/if}}
        {{#if epaRegNumber}}
        <div class="detail-row">
          <div class="detail-label">EPA Registration</div>
          <div class="detail-value">{{epaRegNumber}}</div>
        </div>
        {{/if}}
        {{#if purpose}}
        <div class="detail-row">
          <div class="detail-label">Purpose</div>
          <div class="detail-value">{{purpose}}</div>
        </div>
        {{/if}}
      </div>

      {{#if labelAttachmentUrl}}
      <div class="attachment">
        {{#if labelAttachmentName}}<div class="attach-name">{{labelAttachmentName}}</div>{{/if}}
        <a href="{{labelAttachmentUrl}}" class="label-btn" target="_blank" rel="noopener">View Product Label (PDF)</a>
      </div>
      {{/if}}

      <div class="section-title">Before We Arrive</div>
      <ul class="care-list">
        <li>Please keep pets and children indoors during application.</li>
        <li>Pick up any loose items, toys, or pet bowls from treated areas.</li>
        <li>Close windows that face the application area while we are on site.</li>
      </ul>

      <div class="section-title">After Application</div>
      <ul class="care-list">
        {{#if reentryInterval}}<li><strong>Re-entry interval:</strong> {{reentryInterval}}</li>{{/if}}
        {{#if wateringInstructions}}<li><strong>Watering:</strong> {{wateringInstructions}}</li>{{/if}}
        {{#if mowingInstructions}}<li><strong>Mowing:</strong> {{mowingInstructions}}</li>{{/if}}
      </ul>

      <div class="info-box">
        Visits may be rescheduled to the backup date if weather conditions are unsafe for application. We will notify you if any changes are needed.
      </div>

      <div class="section-title">Your Applicator</div>
      <div class="applicator-card">
        <div class="ac-name">{{applicatorName}}</div>
        {{#if applicatorLicense}}<div class="ac-license">License: {{applicatorLicense}}</div>{{/if}}
        <div class="ac-contact">
          {{#if contactPhone}}<a href="tel:{{contactPhone}}">{{contactPhone}}</a>{{/if}}
          {{#if contactEmail}} &middot; <a href="mailto:{{contactEmail}}">{{contactEmail}}</a>{{/if}}
        </div>
      </div>

      {{#if notes}}
      <div class="section-title">Additional Notes</div>
      <div class="info-box">{{notes}}</div>
      {{/if}}

      <p class="signoff">Thank you for trusting {{companyName}} with your property.</p>
    </div>
    <div class="footer">
      <p>{{companyName}} &mdash; Property Maintenance Services</p>
      {{#if pesticideLicenseNumber}}<p style="margin-top:6px;">Pesticide Applicator License: {{pesticideLicenseNumber}}</p>{{/if}}
    </div>
  </div>
</body>
</html>`;
}

function buildPostVisitHtml(treatmentTitle: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${SHARED_EMAIL_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{companyName}}</h1>
      <p>Visit Completion Report</p>
    </div>
    <div class="content">
      <div class="completed-banner">
        <span class="check-circle"></span>
        <span class="banner-text">Visit completed</span>
      </div>

      <h2>${treatmentTitle} &mdash; Completed</h2>
      <p>The ${treatmentTitle.toLowerCase()} application has been completed at your property.</p>

      <div class="section-title">Visit Summary</div>
      <div class="detail-row">
        <div class="detail-label">Property</div>
        <div class="detail-value">{{customerName}}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Campaign</div>
        <div class="detail-value">{{campaignTitle}}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Completed</div>
        <div class="detail-value">{{completionDate}}{{#if completionTime}} at {{completionTime}}{{/if}}</div>
      </div>
      {{#if applicatorName}}
      <div class="detail-row">
        <div class="detail-label">Completed By</div>
        <div class="detail-value">{{applicatorName}}{{#if applicatorLicense}} &middot; License {{applicatorLicense}}{{/if}}</div>
      </div>
      {{/if}}
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

      <div class="section-title">What We Applied</div>
      <div class="product-box">
        <h3>Product Details</h3>
        {{#if productName}}
        <div class="detail-row">
          <div class="detail-label">Product</div>
          <div class="detail-value">{{productName}}</div>
        </div>
        {{/if}}
        {{#if activeIngredient}}
        <div class="detail-row">
          <div class="detail-label">Active Ingredient</div>
          <div class="detail-value">{{activeIngredient}}</div>
        </div>
        {{/if}}
        {{#if epaRegNumber}}
        <div class="detail-row">
          <div class="detail-label">EPA Registration</div>
          <div class="detail-value">{{epaRegNumber}}</div>
        </div>
        {{/if}}
      </div>

      {{#if labelAttachmentUrl}}
      <div class="attachment">
        {{#if labelAttachmentName}}<div class="attach-name">{{labelAttachmentName}}</div>{{/if}}
        <a href="{{labelAttachmentUrl}}" class="label-btn" target="_blank" rel="noopener">View Product Label (PDF)</a>
      </div>
      {{/if}}

      {{#if postApplicationExpectation}}
      <div class="section-title">What to Expect Next</div>
      <div class="expect-box">{{postApplicationExpectation}}</div>
      {{/if}}

      <div class="section-title">24&ndash;48 Hour Care</div>
      <ul class="care-list">
        {{#if reentryInterval}}<li><strong>Re-entry interval:</strong> {{reentryInterval}}</li>{{/if}}
        {{#if wateringInstructions}}<li><strong>Watering:</strong> {{wateringInstructions}}</li>{{/if}}
        {{#if mowingInstructions}}<li><strong>Mowing:</strong> {{mowingInstructions}}</li>{{/if}}
      </ul>

      {{#if notes}}
      <div class="section-title">Technician Notes</div>
      <div class="info-box">{{notes}}</div>
      {{/if}}

      {{#if nextVisitDate}}
      <div class="next-visit">
        <div class="nv-label">{{nextVisitTitle}}</div>
        <div class="nv-value">{{nextVisitDate}}</div>
      </div>
      {{/if}}

      {{#if completionPhotosHtml}}
      <div class="section-title">Site Photos</div>
      <div class="photos">{{{completionPhotosHtml}}}</div>
      {{/if}}

      <p class="signoff">If you have any questions about this visit, contact us at
        {{#if contactEmail}}<a href="mailto:{{contactEmail}}" style="color:#1a5632;">{{contactEmail}}</a>{{/if}}
        {{#if contactPhone}} or {{contactPhone}}{{/if}}.
        Thank you for trusting {{companyName}}.
      </p>
    </div>
    <div class="footer">
      <p>{{companyName}} &mdash; Property Maintenance Services</p>
      {{#if pesticideLicenseNumber}}<p style="margin-top:6px;">Pesticide Applicator License: {{pesticideLicenseNumber}}</p>{{/if}}
    </div>
  </div>
</body>
</html>`;
}

// ─── Per-service-type seed metadata ──────────────────────────────────────────

interface ChemNotifTemplateSeed {
  name: string;
  serviceType: string;
  preVisitSubject: string;
  preVisitHtml: string;
  postVisitSubject: string;
  postVisitHtml: string;
  productName: string;
  activeIngredient: string;
  epaRegNumber: string;
  purposeText: string;
  reentryInterval: string;
  wateringInstructions: string;
  mowingInstructions: string;
  postApplicationExpectation: string;
}

export const CHEM_NOTIF_TEMPLATE_SEEDS: ChemNotifTemplateSeed[] = [
  {
    name: 'Broadleaf Weed Control',
    serviceType: 'broadleaf_weed_control',
    preVisitSubject: 'Upcoming Broadleaf Weed Control \u2014 {{customerName}}',
    preVisitHtml: buildPreVisitHtml('Broadleaf Weed Control'),
    postVisitSubject: 'Broadleaf Weed Control Completed \u2014 {{customerName}}',
    postVisitHtml: buildPostVisitHtml('Broadleaf Weed Control'),
    productName: 'LESCO Three-Way Selective Herbicide',
    activeIngredient: '2,4-D, Mecoprop-p (MCPP), Dicamba',
    epaRegNumber: 'EPA Reg. No. 10404-66',
    purposeText: 'Selective control of broadleaf weeds (dandelion, clover, plantain, ground ivy, thistle) without harming desirable turfgrass.',
    reentryInterval: 'Keep off treated areas for 48 hours or until the lawn is completely dry.',
    wateringInstructions: 'Do not water or irrigate for 24 hours after application.',
    mowingInstructions: 'Do not mow for 48 hours before or after application.',
    postApplicationExpectation: 'Treated weeds will yellow and curl within 7\u201314 days. Full results are typically visible within 3\u20134 weeks depending on weed species and weather.',
  },
  {
    name: 'Fertilizer Application',
    serviceType: 'fertilizer_application',
    preVisitSubject: 'Upcoming Fertilizer Application \u2014 {{customerName}}',
    preVisitHtml: buildPreVisitHtml('Fertilizer Application'),
    postVisitSubject: 'Fertilizer Application Completed \u2014 {{customerName}}',
    postVisitHtml: buildPostVisitHtml('Fertilizer Application'),
    productName: 'Professional Granular Turf Fertilizer',
    activeIngredient: 'Slow-release nitrogen with balanced N-P-K formulation',
    epaRegNumber: 'Not required (fertilizer)',
    purposeText: 'Promote healthy growth, deep color, and improved root development with a slow-release feeding cycle.',
    reentryInterval: 'Safe once granules are watered in and the surface is completely dry (typically 24\u201348 hours).',
    wateringInstructions: 'Water within 24\u201348 hours with at least 0.25 inches of irrigation to activate the granules.',
    mowingInstructions: 'Resume normal mowing schedule after the lawn has been watered in.',
    postApplicationExpectation: 'You should see greening and improved turf density within 2\u20133 weeks. Slow-release feeding continues for 6\u20138 weeks.',
  },
  {
    name: 'Pre-Emergent Application',
    serviceType: 'pre_emergent_application',
    preVisitSubject: 'Upcoming Pre-Emergent Application \u2014 {{customerName}}',
    preVisitHtml: buildPreVisitHtml('Pre-Emergent Herbicide Application'),
    postVisitSubject: 'Pre-Emergent Application Completed \u2014 {{customerName}}',
    postVisitHtml: buildPostVisitHtml('Pre-Emergent Herbicide Application'),
    productName: 'Prodiamine 65 WDG Pre-Emergent Herbicide',
    activeIngredient: 'Prodiamine 65%',
    epaRegNumber: 'EPA Reg. No. 70506-44',
    purposeText: 'Prevent crabgrass, annual bluegrass, foxtail, and other annual grassy weeds from germinating in your lawn.',
    reentryInterval: 'Safe to enter once the product is watered in (within 21 days of application).',
    wateringInstructions: 'Water in with at least 0.5 inches of irrigation or natural rainfall within 21 days to activate the weed barrier.',
    mowingInstructions: 'Do NOT aerate, dethatch, or overseed after application \u2014 it breaks the pre-emergent barrier.',
    postApplicationExpectation: 'Pre-emergent prevents seed germination; results are best judged by the absence of new weed growth throughout the season.',
  },
  {
    name: 'Crabgrass Treatment',
    serviceType: 'crabgrass_treatment',
    preVisitSubject: 'Upcoming Crabgrass Treatment \u2014 {{customerName}}',
    preVisitHtml: buildPreVisitHtml('Post-Emergent Crabgrass Control'),
    postVisitSubject: 'Crabgrass Treatment Completed \u2014 {{customerName}}',
    postVisitHtml: buildPostVisitHtml('Post-Emergent Crabgrass Control'),
    productName: 'Drive XLR8 Post-Emergent Crabgrass Killer',
    activeIngredient: 'Quinclorac 18.92%',
    epaRegNumber: 'EPA Reg. No. 432-1517',
    purposeText: 'Selective post-emergent control of actively growing crabgrass and several broadleaf weeds.',
    reentryInterval: 'Keep off treated areas until the lawn is completely dry (2\u20134 hours).',
    wateringInstructions: 'Do not water or irrigate for 24 hours after application.',
    mowingInstructions: 'Do not mow for 24 hours before or after application.',
    postApplicationExpectation: 'Crabgrass will yellow and wilt within 7\u201310 days. Complete browning typically occurs within 2\u20133 weeks.',
  },
  {
    name: 'Fungicide Application',
    serviceType: 'fungicide_application',
    preVisitSubject: 'Upcoming Fungicide Application \u2014 {{customerName}}',
    preVisitHtml: buildPreVisitHtml('Fungicide Application'),
    postVisitSubject: 'Fungicide Application Completed \u2014 {{customerName}}',
    postVisitHtml: buildPostVisitHtml('Fungicide Application'),
    productName: 'Heritage G Granular Fungicide',
    activeIngredient: 'Azoxystrobin 0.31%',
    epaRegNumber: 'EPA Reg. No. 100-1093',
    purposeText: 'Preventive and curative control of brown patch, dollar spot, pythium, and other turf diseases.',
    reentryInterval: 'Keep off treated areas until granules have been watered in and the surface is dry (typically 24 hours).',
    wateringInstructions: 'Water in with 0.1\u20130.25 inches of irrigation immediately after application to activate the product.',
    mowingInstructions: 'Resume normal mowing schedule once the lawn has been watered in.',
    postApplicationExpectation: 'Disease pressure will subside within 7\u201314 days. Continue your watering and mowing best practices to prevent recurrence.',
  },
  {
    name: 'Insecticide Application',
    serviceType: 'insecticide_application',
    preVisitSubject: 'Upcoming Insecticide Application \u2014 {{customerName}}',
    preVisitHtml: buildPreVisitHtml('Insecticide Application'),
    postVisitSubject: 'Insecticide Application Completed \u2014 {{customerName}}',
    postVisitHtml: buildPostVisitHtml('Insecticide Application'),
    productName: 'Acelepryn G Granular Insecticide',
    activeIngredient: 'Chlorantraniliprole 0.20%',
    epaRegNumber: 'EPA Reg. No. 100-1489',
    purposeText: 'Long-residual control of grubs, billbugs, sod webworm, and other turf-damaging insects.',
    reentryInterval: 'Keep pets and children off treated areas until the lawn is completely dry (typically 2\u20134 hours).',
    wateringInstructions: 'Water in with at least 0.25 inches of irrigation within 24 hours to move the active ingredient into the soil.',
    mowingInstructions: 'Resume normal mowing schedule once the lawn has been watered in.',
    postApplicationExpectation: 'A single application provides season-long control. You should see a noticeable reduction in insect activity within 1\u20132 weeks.',
  },
  {
    name: 'Aeration & Overseeding',
    serviceType: 'aeration_overseeding',
    preVisitSubject: 'Upcoming Aeration & Overseeding \u2014 {{customerName}}',
    preVisitHtml: buildPreVisitHtml('Aeration & Overseeding'),
    postVisitSubject: 'Aeration & Overseeding Completed \u2014 {{customerName}}',
    postVisitHtml: buildPostVisitHtml('Aeration & Overseeding'),
    productName: 'Premium Cool-Season Turfgrass Seed Blend',
    activeIngredient: 'Tall fescue, perennial ryegrass, and Kentucky bluegrass blend',
    epaRegNumber: 'Not applicable',
    purposeText: 'Relieve soil compaction, improve water and nutrient uptake, and thicken the lawn through overseeding.',
    reentryInterval: 'Lawn is safe to enter immediately after service \u2014 no chemical re-entry restriction.',
    wateringInstructions: 'Water lightly twice per day for the first 14 days to keep new seed moist; reduce frequency once seed has germinated.',
    mowingInstructions: 'Wait until new grass reaches 3\u20134 inches before the first mow (typically 2\u20133 weeks). Bag clippings for the first 2 mows.',
    postApplicationExpectation: 'New seedlings should appear in 7\u201321 days. Avoid heavy traffic and lawn chemicals for 4\u20136 weeks while seed establishes.',
  },
  {
    name: 'Custom Treatment',
    serviceType: 'custom',
    preVisitSubject: 'Upcoming Lawn Service \u2014 {{customerName}}',
    preVisitHtml: buildPreVisitHtml('Scheduled Lawn Service'),
    postVisitSubject: 'Lawn Service Completed \u2014 {{customerName}}',
    postVisitHtml: buildPostVisitHtml('Scheduled Lawn Service'),
    productName: '',
    activeIngredient: '',
    epaRegNumber: '',
    purposeText: 'Edit this template under Settings \u2192 Notification Templates to add the specific product details for your custom service.',
    reentryInterval: 'Edit this template to add the recommended re-entry interval.',
    wateringInstructions: 'Edit this template to add watering guidance.',
    mowingInstructions: 'Edit this template to add mowing guidance.',
    postApplicationExpectation: 'Edit this template to describe what the customer should expect after the visit.',
  },
];

/**
 * Idempotent upsert: seed eight standard chemical notification templates per
 * company. If a template with the same name already exists, sync `preVisitHtml`
 * and `postVisitHtml` so structural improvements roll out, but never touch
 * subjects or product-detail fields (those are admin-customisable).
 */
export async function seedChemicalNotificationTemplates(
  companyId: string,
  storage: IStorage,
): Promise<void> {
  const existing = await storage.getChemicalNotificationTemplates(companyId);
  const byName = new Map(existing.map(t => [t.name, t]));

  for (const seed of CHEM_NOTIF_TEMPLATE_SEEDS) {
    const match = byName.get(seed.name);
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
        productName: seed.productName || null,
        activeIngredient: seed.activeIngredient || null,
        epaRegNumber: seed.epaRegNumber || null,
        purposeText: seed.purposeText || null,
        reentryInterval: seed.reentryInterval || null,
        wateringInstructions: seed.wateringInstructions || null,
        mowingInstructions: seed.mowingInstructions || null,
        postApplicationExpectation: seed.postApplicationExpectation || null,
        createdBy: null,
      });
      console.log(`Seeded chemical notification template "${seed.name}" for company ${companyId}`);
    } else {
      const updates: Record<string, string> = {};
      if (match.preVisitHtml !== seed.preVisitHtml) updates.preVisitHtml = seed.preVisitHtml;
      if (match.postVisitHtml !== seed.postVisitHtml) updates.postVisitHtml = seed.postVisitHtml;
      // Backfill product-detail metadata for pre-existing templates that
      // were seeded before #392 added these columns. We ONLY write when the
      // existing DB value is null/empty so any admin customizations
      // (non-empty values) are preserved untouched. Seeds with empty values
      // (e.g. "Custom Treatment" leaves productName empty) are skipped so
      // we never write empties.
      const metadataFields = [
        'productName', 'activeIngredient', 'epaRegNumber', 'purposeText',
        'reentryInterval', 'wateringInstructions', 'mowingInstructions',
        'postApplicationExpectation',
      ] as const;
      for (const field of metadataFields) {
        const seedValue = (seed as unknown as Record<string, string>)[field];
        const currentValue = (match as unknown as Record<string, string | null>)[field];
        const currentIsEmpty = currentValue === null || currentValue === undefined || String(currentValue).trim() === '';
        if (currentIsEmpty && seedValue && seedValue.trim().length > 0) {
          updates[field] = seedValue;
        }
      }
      if (Object.keys(updates).length > 0) {
        await storage.updateChemicalNotificationTemplate(match.id, companyId, updates);
        console.log(`Updated chemical notification template "${seed.name}" for company ${companyId}: ${Object.keys(updates).join(', ')}`);
      }
    }
  }
}
