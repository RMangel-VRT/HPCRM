/**
 * Finds the index in Open-Meteo's hourly.time array whose local time is closest
 * to the given target UTC instant.
 *
 * Open-Meteo returns hourly times as naive local strings (e.g. "2026-07-13T07:00")
 * when timezone=auto is used — no UTC offset attached. Treating these as UTC causes
 * a systematic hour-selection error equal to the location's UTC offset.
 *
 * The fix: append "Z" to force Date to parse the digits at face value, then subtract
 * utc_offset_seconds (in ms) to recover the true UTC instant of that reading.
 *
 * Example (Mountain Daylight Time, UTC-6):
 *   naive string "2026-07-13T07:00"
 *   + "Z"  →  parsed as 2026-07-13T07:00:00Z  (7*3600*1000 epoch ms)
 *   − (-21600 * 1000)  →  + 21600000 ms  →  2026-07-13T13:00:00Z  ✓
 */
export function findClosestHourIndex(
  times: string[],
  utcOffsetSeconds: number,
  targetMs: number,
): number {
  const utcOffsetMs = utcOffsetSeconds * 1000;
  let idx = 0;
  let closestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const naiveUtcMs = new Date(times[i] + "Z").getTime();
    const trueUtcMs = naiveUtcMs - utcOffsetMs;
    const diff = Math.abs(trueUtcMs - targetMs);
    if (diff < closestDiff) {
      closestDiff = diff;
      idx = i;
    }
  }
  return idx;
}

/**
 * Builds a ±1-day date window around a UTC instant so that local-timezone rollovers
 * (e.g. 10 PM Mountain = 04:00 next-day UTC) never push the target hour outside the
 * fetched date range.
 *
 * Returns { startDate, endDate } as YYYY-MM-DD strings suitable for Open-Meteo's
 * start_date / end_date query params.
 */
export function buildDateWindow(targetMs: number): { startDate: string; endDate: string } {
  const oneDayMs = 24 * 60 * 60 * 1000;
  const startDate = new Date(targetMs - oneDayMs).toISOString().slice(0, 10);
  const endDate = new Date(targetMs + oneDayMs).toISOString().slice(0, 10);
  return { startDate, endDate };
}
