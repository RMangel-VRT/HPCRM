/** SQL integrity constraints, not a service registry. Catalog parity is tested.
 * Kept browser-safe so both schema declarations preserve the same constraints.
 */
export const campaignServiceSql = "('aeration','cleanups','shrub_trimming','ornamental_grass','tree_pruning','native_areas','fertilization','broadleaf','irrigation_open','irrigation_winterization')";
export const campaignIdentityCheckSql = `source IN ('manual','contract') AND (
  (source = 'manual' AND service_key IS NULL AND round_month IS NULL AND round_seq IS NULL)
  OR (source = 'contract' AND service_key IS NOT NULL AND (service_key IN ${campaignServiceSql} OR service_key = 'chemical')
    AND round_month IS NOT NULL AND extract(day FROM round_month) = 1 AND round_seq IS NOT NULL AND round_seq > 0
    AND category = CASE WHEN service_key = 'chemical' THEN 'chemical'
      WHEN service_key IN ('irrigation_open','irrigation_winterization') THEN 'irrigation' ELSE 'general' END
    AND subtype IS NOT DISTINCT FROM CASE WHEN service_key = 'irrigation_open' THEN 'spring_turn_on'
      WHEN service_key = 'irrigation_winterization' THEN 'winterization' ELSE NULL END))`;
