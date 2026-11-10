/** SQL integrity constraints, not a service registry. Catalog parity is tested.
 * Kept browser-safe so both schema declarations preserve the same constraints.
 */
export const campaignServiceSql = "('aeration','cleanups','shrub_trimming','ornamental_grass','tree_pruning','chemical','irrigation_open','irrigation_winterization')";
export const serviceProgramCheckSql = `coalesce(
  service_key IN ${campaignServiceSql} AND rounds BETWEEN 1 AND 24
  AND array_ndims(month_spread) = 1 AND array_lower(month_spread,1) = 1
  AND array_length(month_spread,1) = 12 AND array_position(month_spread,NULL) IS NULL
  AND 0 <= ALL(month_spread) AND 4 >= ALL(month_spread)
  AND rounds = (month_spread[1]+month_spread[2]+month_spread[3]+month_spread[4]+month_spread[5]+month_spread[6]+month_spread[7]+month_spread[8]+month_spread[9]+month_spread[10]+month_spread[11]+month_spread[12]), false)`;
export const campaignIdentityCheckSql = `source IN ('manual','contract') AND (
  (source = 'manual' AND service_key IS NULL AND round_month IS NULL AND round_seq IS NULL)
  OR (source = 'contract' AND service_key IS NOT NULL AND service_key IN ${campaignServiceSql}
    AND round_month IS NOT NULL AND extract(day FROM round_month) = 1 AND round_seq IS NOT NULL AND round_seq > 0
    AND category = CASE WHEN service_key = 'chemical' THEN 'chemical'
      WHEN service_key IN ('irrigation_open','irrigation_winterization') THEN 'irrigation' ELSE 'general' END
    AND subtype IS NOT DISTINCT FROM CASE WHEN service_key = 'irrigation_open' THEN 'spring_turn_on'
      WHEN service_key = 'irrigation_winterization' THEN 'winterization' ELSE NULL END))`;
