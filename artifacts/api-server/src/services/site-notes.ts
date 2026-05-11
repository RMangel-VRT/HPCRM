// Mobile v1 Slice 2: Site notes curation.
//
// Returns the curated set of `property_site_notes` rows the field crew should
// see for a given ticket. We return notes that are either:
//   1. global to the property (service_type IS NULL), OR
//   2. specifically tagged with the ticket's `service_type`.
//
// Inactive notes are filtered out. Results are sorted by `sortOrder` so the
// office can control the surface order shown in the mobile UI.
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { propertySiteNotes, type PropertySiteNote } from "@workspace/db";

export async function getSiteNotesForProperty(
  customerId: string,
  serviceType: string | null,
): Promise<PropertySiteNote[]> {
  const serviceTypeFilter = serviceType
    ? or(isNull(propertySiteNotes.serviceType), eq(propertySiteNotes.serviceType, serviceType))
    : isNull(propertySiteNotes.serviceType);

  return db
    .select()
    .from(propertySiteNotes)
    .where(
      and(
        eq(propertySiteNotes.customerId, customerId),
        eq(propertySiteNotes.isActive, true),
        serviceTypeFilter!,
      ),
    )
    .orderBy(asc(propertySiteNotes.sortOrder), asc(propertySiteNotes.label));
}

export function serializeSiteNote(n: PropertySiteNote) {
  return {
    id: n.id,
    label: n.label,
    value: n.value,
    serviceType: n.serviceType,
    sortOrder: n.sortOrder,
  };
}
