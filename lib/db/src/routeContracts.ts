import { z } from "zod/v4";
import { isCalendarDate } from "./schema/calendarDate";

export const routeDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate, "Invalid calendar date");
export const routeService = z.enum(["mowing", "pet_station", "winter_visits", "irrigation_inspection"]);
export const routeStopFields = {
  customerId: z.string().min(1),
  serviceKey: routeService,
  crewId: z.string().min(1),
  weekday: z.number().int().min(1).max(6),
  everyWeeks: z.number().int().refine(n => n === 1 || n === 2, "Cadence must be 1 or 2 weeks").default(1),
  anchorDate: routeDate,
  sortOrder: z.number().int().min(-2147483648).max(2147483647).default(0),
  minutes: z.number().int().min(5).max(720),
  seasonStart: routeDate.nullable().optional(),
  seasonEnd: routeDate.nullable().optional(),
  pausedUntil: routeDate.nullable().optional(),
  isActive: z.boolean().default(true),
  notes: z.string().nullable().optional(),
};
export const routeStopBody = z.object(routeStopFields);
export function validRouteSeason(value: { seasonStart?: string | null; seasonEnd?: string | null }) {
  return Boolean(value.seasonStart) === Boolean(value.seasonEnd)
    && (!value.seasonStart || !value.seasonEnd || value.seasonStart <= value.seasonEnd);
}
