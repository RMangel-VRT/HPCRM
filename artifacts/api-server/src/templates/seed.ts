/** Standard product defaults for chemical notification templates. */
import type { IStorage } from '../storage';
import { emptyLegacyChemicalWording } from '../services/outgoingEmail/chemicalEmail';

interface ChemNotifTemplateSeed {
  name: string;
  serviceType: string;
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

/** Seed missing templates and backfill missing product defaults without touching legacy wording. */
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
        ...emptyLegacyChemicalWording,
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
