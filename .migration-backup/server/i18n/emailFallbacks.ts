/**
 * Server-side email fallback strings for chemical notification templates.
 * These are used when a merge variable has no value from the campaign item
 * or product catalog. Supported languages mirror the app's i18n locales.
 */

type SupportedLocale = 'en' | 'es';

interface ChemEmailFallbacks {
  toBeScheduled: string;
  toBeDetermined: string;
  toBeConfirmed: string;
  startingAround: string;
  seeCompanyContact: string;
  seeTreatmentDocumentation: string;
  seeProductLabel: string;
  generalPurpose: string;
  wateringInstructions: string;
  mowingInstructions: string;
  licensedApplicator: string;
}

const fallbacks: Record<SupportedLocale, ChemEmailFallbacks> = {
  en: {
    toBeScheduled: 'To be scheduled',
    toBeDetermined: 'To be determined',
    toBeConfirmed: 'To be confirmed',
    startingAround: 'Starting around',
    seeCompanyContact: 'See company contact details',
    seeTreatmentDocumentation: 'See treatment documentation',
    seeProductLabel: 'See product label',
    generalPurpose: 'General pest/weed management',
    wateringInstructions: 'Follow standard watering restrictions for 24 hours after application.',
    mowingInstructions: 'Avoid mowing for 24 hours after application.',
    licensedApplicator: 'Licensed applicator',
  },
  es: {
    toBeScheduled: 'Por programar',
    toBeDetermined: 'Por determinar',
    toBeConfirmed: 'Por confirmar',
    startingAround: 'Comenzando aproximadamente a las',
    seeCompanyContact: 'Consulte la información de contacto de la empresa',
    seeTreatmentDocumentation: 'Consulte la documentación del tratamiento',
    seeProductLabel: 'Consulte la etiqueta del producto',
    generalPurpose: 'Control general de plagas/malezas',
    wateringInstructions: 'Siga las restricciones de riego estándar durante 24 horas después de la aplicación.',
    mowingInstructions: 'Evite cortar el césped durante 24 horas después de la aplicación.',
    licensedApplicator: 'Aplicador con licencia',
  },
};

/**
 * Returns fallback strings for the given locale, defaulting to English.
 */
export function getEmailFallbacks(locale?: string | null): ChemEmailFallbacks {
  const key = (locale?.split('-')[0] ?? 'en') as SupportedLocale;
  return fallbacks[key] ?? fallbacks['en'];
}

/**
 * Formats a time window into a human-readable string.
 * Both values → "8:00 AM – 12:00 PM"
 * Start only  → "Starting around 8:00 AM"
 * Neither     → fallback.toBeConfirmed
 */
export function formatTimeWindowWithFallback(
  start?: string | null,
  end?: string | null,
  locale?: string | null,
): string {
  const fb = getEmailFallbacks(locale);
  if (!start && !end) return fb.toBeConfirmed;

  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m ?? 0).padStart(2, '0')} ${ampm}`;
  };

  if (start && end) return `${fmt(start)} \u2013 ${fmt(end)}`;
  return `${fb.startingAround} ${fmt(start!)}`;
}
