import { campaignServiceSql } from "./campaignSql";

/** SQL integrity mirrors, protected by catalog parity tests, not another catalog. */
export const checklistServiceSql = "('backflow')";
export const recurringServiceSql = "('mowing','pet_station','winter_visits','irrigation_inspection','native_areas')";
export const monthDaySql = (column: string) => `${column} ~ '^(01|03|05|07|08|10|12)-(0[1-9]|[12][0-9]|3[01])$|^(04|06|09|11)-(0[1-9]|[12][0-9]|30)$|^02-(0[1-9]|1[0-9]|2[0-8])$'`;
// Distinct valid days on the fixed non-leap 365-day cycle imply a 1..364-day window.
// Preserve the main project's Publish round-trip fix. A leading COALESCE CHECK
// is misparsed by database-to-database introspection; IS TRUE preserves semantics.
export const serviceCalendarCheckSql = `(coalesce(
  position BETWEEN 1 AND 24 AND name = btrim(name) AND length(name) BETWEEN 1 AND 80
  AND (${monthDaySql("opens_md")}) AND (${monthDaySql("due_md")}) AND opens_md <> due_md
  AND ((kind = 'round' AND service_key IN ${campaignServiceSql})
    OR (kind = 'checklist' AND service_key IN ${checklistServiceSql} AND position = 1)
    OR (kind = 'recurring' AND service_key IN ${recurringServiceSql}))
  AND (kind = 'round' OR NOT in_standard)
  AND (kind = 'recurring' OR (pattern IS NULL AND includes IS NULL)), false)) IS TRUE`;
