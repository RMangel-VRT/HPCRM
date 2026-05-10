import { describe, it, expect } from 'vitest';
import {
  buildChemicalNotificationVariables,
  buildChemicalCompletionEmailVars,
} from './emailService';

describe('buildChemicalNotificationVariables (pre-visit)', () => {
  it('omits canonical product/treatment keys when no per-visit override exists, so template metadata wins', () => {
    const out = buildChemicalNotificationVariables(
      {
        targetDate: '2026-05-10',
        backupDate: '',
        timeWindowStart: '',
        timeWindowEnd: '',
        purposeOverride: null,
        reentryIntervalOverride: null,
        wateringInstructionsOverride: null,
        mowingInstructionsOverride: null,
      } as never,
      null,
      { title: 'Spring Pre-Emergent', windowStart: '2026-05-10', windowEnd: '2026-05-12' },
      { name: 'Acme Lawn', phone: '555-0100', email: 'a@x.com', pesticideLicenseNumber: 'LIC-1' },
      'Jane Doe',
      'Tech A', 'LIC-T-9',
      null, null,
    );
    expect(out.purpose).toBeUndefined();
    expect(out.reentryInterval).toBeUndefined();
    expect(out.wateringInstructions).toBeUndefined();
    expect(out.mowingInstructions).toBeUndefined();
    // Required contact + identity vars must be populated, never silently empty.
    expect(out.companyName).toBe('Acme Lawn');
    expect(out.contactPhone).toBe('555-0100');
    expect(out.contactEmail).toBe('a@x.com');
    expect(out.customerName).toBe('Jane Doe');
    expect(out.applicatorName).toBe('Tech A');
  });

  it('forwards canonical keys ONLY when the visit override is a non-empty string', () => {
    const out = buildChemicalNotificationVariables(
      {
        targetDate: '2026-05-10',
        purposeOverride: 'crabgrass control',
        reentryIntervalOverride: '4 hours',
        wateringInstructionsOverride: '   ',           // whitespace -> still omitted
        mowingInstructionsOverride: 'wait 24h',
      } as never,
      null,
      { title: 't', windowStart: 'a', windowEnd: 'b' },
      { name: 'Acme', phone: '555' },
      'Jane', null, null, null, null,
    );
    expect(out.purpose).toBe('crabgrass control');
    expect(out.reentryInterval).toBe('4 hours');
    expect(out.wateringInstructions).toBeUndefined();
    expect(out.mowingInstructions).toBe('wait 24h');
  });

  it('falls back the contact phone to the i18n "see company contact" string when company.phone is missing', () => {
    const out = buildChemicalNotificationVariables(
      { targetDate: '2026-05-10' } as never,
      null,
      { title: 't', windowStart: '', windowEnd: '' },
      { name: 'Acme', phone: null },
      'Jane', null, null, null, null,
    );
    expect(out.companyPhone).not.toBe('');
    expect(out.contactPhone).toBe('');
  });
});

describe('buildChemicalCompletionEmailVars (post-visit)', () => {
  it('omits productName / activeIngredient / epaRegNumber when caller passes empty so template metadata wins', () => {
    const out = buildChemicalCompletionEmailVars({
      companyName: 'Acme', customerName: 'Jane', campaignTitle: 't',
      completionDate: '2026-05-10',
      productName: '', activeIngredient: '', epaRegNumber: '',
      postApplicationExpectation: '', reEntryInterval: '',
      wateringInstructions: '', mowingInstructions: '',
      contactPhone: '555', contactEmail: 'a@x.com',
    });
    expect(out.productName).toBeUndefined();
    expect(out.activeIngredient).toBeUndefined();
    expect(out.epaRegNumber).toBeUndefined();
    expect(out.postApplicationExpectation).toBeUndefined();
    expect(out.reentryInterval).toBeUndefined();
    expect(out.mowingInstructions).toBeUndefined();
    expect(out.wateringInstructions).toBeUndefined();
    // Required identity / contact keys must always be populated.
    expect(out.companyName).toBe('Acme');
    expect(out.customerName).toBe('Jane');
    expect(out.completionDate).toBe('2026-05-10');
    expect(out.contactPhone).toBe('555');
    expect(out.contactEmail).toBe('a@x.com');
  });

  it('emits canonical keys when caller passes a true per-visit override', () => {
    const out = buildChemicalCompletionEmailVars({
      companyName: 'Acme', customerName: 'Jane', campaignTitle: 't',
      completionDate: '2026-05-10',
      productName: 'Roundup', activeIngredient: 'Glyphosate',
      epaRegNumber: '524-475', postApplicationExpectation: 'mild yellowing',
      reEntryInterval: '4h', wateringInstructions: 'water in 24h',
      mowingInstructions: 'wait 48h',
    });
    expect(out.productName).toBe('Roundup');
    expect(out.activeIngredient).toBe('Glyphosate');
    expect(out.epaRegNumber).toBe('524-475');
    expect(out.postApplicationExpectation).toBe('mild yellowing');
    expect(out.reentryInterval).toBe('4h');
    expect(out.wateringInstructions).toBe('water in 24h');
    expect(out.mowingInstructions).toBe('wait 48h');
  });
});
