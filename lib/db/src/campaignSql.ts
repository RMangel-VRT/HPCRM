/** SQL integrity constraints, not a service registry. Catalog parity is tested.
 * Kept browser-safe so both schema declarations preserve the same constraints.
 */
export const campaignServiceSql = "('aeration','cleanups','shrub_trimming','ornamental_grass','tree_pruning','native_areas','fertilization','broadleaf','irrigation_open','irrigation_winterization')";
export const campaignIdentityCheckSql = `(source IN ('manual','contract') AND (
  (source = 'manual' AND service_key IS NULL AND calendar_entry_id IS NULL AND round_year IS NULL AND round_month IS NULL AND round_seq IS NULL)
  OR (source = 'contract' AND service_key IS NOT NULL AND service_key IN ${campaignServiceSql.slice(0, -1)},'backflow')
    AND calendar_entry_id IS NOT NULL AND round_year IS NOT NULL
    AND category = CASE WHEN service_key IN ('fertilization','broadleaf') THEN 'chemical'
      WHEN service_key IN ('irrigation_open','irrigation_winterization') THEN 'irrigation' ELSE 'general' END
    AND subtype IS NOT DISTINCT FROM CASE WHEN service_key = 'irrigation_open' THEN 'spring_turn_on'
      WHEN service_key = 'irrigation_winterization' THEN 'winterization' ELSE NULL END))) IS TRUE`;
