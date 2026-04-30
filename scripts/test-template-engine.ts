/**
 * Verification script for the Handlebars-based email template engine.
 * Run with:  npx tsx scripts/test-template-engine.ts
 *
 * Imports and exercises the actual exported engine functions from emailService.ts.
 * Prints PASS or FAIL for each test case.
 */

import {
  substituteVariables,
  getDefaultWorkCompletedTemplate,
  getDefaultChemicalPreNoticeTemplate,
  getDefaultChemicalPostNoticeTemplate,
} from '../server/services/emailService';

// ── helper ──
let passed = 0;
let failed = 0;

function check(description: string, actual: string, expected: string): void {
  if (actual === expected) {
    console.log(`PASS  ${description}`);
    passed++;
  } else {
    console.log(`FAIL  ${description}`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── Test cases ──

// 1. Plain variable substitution
check(
  'Plain substitution: {{name}} is replaced with its value',
  substituteVariables('Hello, {{name}}!', { name: 'World' }),
  'Hello, World!'
);

// 2. Truthy conditional block is included
check(
  'Truthy conditional: {{#if flag}}...{{/if}} renders content when flag is set',
  substituteVariables('{{#if show}}visible{{/if}}', { show: 'yes' }),
  'visible'
);

// 3. Falsy conditional block is excluded
check(
  'Falsy conditional: {{#if flag}}...{{/if}} renders nothing when flag is empty',
  substituteVariables('{{#if show}}visible{{/if}}', { show: '' }),
  ''
);

// 4. HTML escaping: double-stash {{var}} HTML-escapes its value
check(
  'HTML escaping: double-stash {{var}} escapes < > & characters',
  substituteVariables('{{html}}', { html: '<b>bold</b>' }),
  '&lt;b&gt;bold&lt;/b&gt;'
);

// 5. Triple-stash bypass: {{{var}}} renders raw HTML without escaping
check(
  'Triple-stash bypass: {{{var}}} renders raw HTML unescaped',
  substituteVariables('{{{html}}}', { html: '<b>bold</b>' }),
  '<b>bold</b>'
);

// ── Spot-check the three live templates ──

const workTemplate = getDefaultWorkCompletedTemplate();
const preTemplate = getDefaultChemicalPreNoticeTemplate();
const postTemplate = getDefaultChemicalPostNoticeTemplate();

const WORK_VARS_POPULATED: Record<string, string> = {
  ticketTitle: 'Spring Lawn Treatment',
  companyName: 'GreenCo',
  customerName: 'Jane Smith',
  completionDate: '2026-04-30',
  workSummaryForCustomer: 'Applied fertiliser and pre-emergent.',
  scopeItemsHtml: '<ul><li>Lawn</li></ul>',
  completionPhotosHtml: '<img src="photo.jpg" />',
  materialsUsed: 'Fertiliser 10-10-10',
  areasWorked: 'Front lawn',
  recommendations: 'Water weekly.',
  leadTechName: 'Bob',
  crewSummary: 'Bob, Alice',
  followUpTitle: 'Follow-up visit',
  followUpDetails: 'In two weeks.',
  timeOnSite: '2 hours',
  ticketNumber: '#ABC123',
  serviceCategory: 'Lawn Care',
  contactEmail: 'info@greenco.com',
  contactPhone: '555-0100',
};

const WORK_VARS_EMPTY: Record<string, string> = {
  ticketTitle: 'Spring Lawn Treatment',
  companyName: 'GreenCo',
  customerName: 'Jane Smith',
  completionDate: '2026-04-30',
  workSummaryForCustomer: 'Applied fertiliser.',
  scopeItemsHtml: '',
  completionPhotosHtml: '',
  materialsUsed: '',
  areasWorked: '',
  recommendations: '',
  leadTechName: 'Bob',
  crewSummary: '',
  followUpTitle: '',
  followUpDetails: '',
  timeOnSite: '',
  ticketNumber: '#ABC123',
  serviceCategory: 'Lawn Care',
  contactEmail: '',
  contactPhone: '',
};

const CHEMICAL_VARS_POPULATED: Record<string, string> = {
  companyName: 'GreenCo',
  customerName: 'Jane Smith',
  campaignTitle: 'Spring Spray',
  windowStart: '2026-05-01',
  windowEnd: '2026-05-03',
  completionDate: '2026-04-30',
  photoHtmlThumbs: '<img src="photo.jpg" />',
  areasTreated: 'Backyard',
  applicatorName: 'Bob',
  applicatorLicense: 'LIC-123',
  targetDate: '2026-05-01',
  backupDate: '2026-05-02',
  timeWindow: '8 AM – 12 PM',
  productName: 'SprayCo',
  productManufacturer: 'Acme',
  productCategory: 'Herbicide',
  productEpaRegNumber: 'EPA-123',
  productSignalWord: 'Caution',
  productActiveIngredient: 'Glyphosate',
  productPurpose: 'Weed control',
  reentryInterval: '24 hours',
  wateringInstructions: 'Water after 24h.',
  mowingInstructions: 'Wait 48h.',
  labelAttachmentUrl: '',
  companyPhone: '555-0100',
  companyEmail: 'info@greenco.com',
  completionTime: '10:00 AM',
  nextVisitTitle: 'Next Visit',
  nextVisitDate: '2026-06-01',
  applicationConditions: 'Dry and sunny',
  notes: 'All good.',
  postApplicationExpectation: 'Grass will green up.',
  reEntryInterval: '24 hours',
  mowingRestriction: '48 hours',
  textSections: '',
};

const CHEMICAL_VARS_EMPTY: Record<string, string> = {
  ...CHEMICAL_VARS_POPULATED,
  photoHtmlThumbs: '',
  areasTreated: '',
  applicatorName: '',
  notes: '',
  nextVisitDate: '',
  postApplicationExpectation: '',
  textSections: '',
};

const SPOT_CHECKS: Array<{ label: string; htmlBody: string; vars: Record<string, string>; empty: boolean }> = [
  { label: 'Work Completed (populated)', htmlBody: workTemplate.htmlBody, vars: WORK_VARS_POPULATED, empty: false },
  { label: 'Work Completed (empty conditionals)', htmlBody: workTemplate.htmlBody, vars: WORK_VARS_EMPTY, empty: true },
  { label: 'Chemical Pre-Notice (populated)', htmlBody: preTemplate.htmlBody, vars: CHEMICAL_VARS_POPULATED, empty: false },
  { label: 'Chemical Pre-Notice (empty conditionals)', htmlBody: preTemplate.htmlBody, vars: CHEMICAL_VARS_EMPTY, empty: true },
  { label: 'Chemical Post-Notice (populated)', htmlBody: postTemplate.htmlBody, vars: CHEMICAL_VARS_POPULATED, empty: false },
  { label: 'Chemical Post-Notice (empty conditionals)', htmlBody: postTemplate.htmlBody, vars: CHEMICAL_VARS_EMPTY, empty: true },
];

console.log('\n── Spot-check: no literal {{#if or {{/if in rendered output ──');
for (const { label, htmlBody, vars, empty } of SPOT_CHECKS) {
  const rendered = substituteVariables(htmlBody, vars);
  const hasLiteral = /\{\{#if|\{\{\/if/.test(rendered);
  if (hasLiteral) {
    console.log(`FAIL  ${label} — rendered output still contains literal {{#if or {{/if}}`);
    failed++;
  } else {
    console.log(`PASS  ${label}`);
    passed++;
  }
  if (empty) {
    console.log(`      [rendered snippet for empty-conditional case (first 300 chars)]`);
    console.log(`      ${rendered.replace(/\s+/g, ' ').slice(0, 300)}`);
  }
}

// ── Summary ──
console.log(`\n${passed + failed} checks — ${passed} PASS, ${failed} FAIL`);
if (failed > 0) process.exit(1);
