// @vitest-environment node
import { describe, it, expect } from "vitest";
import { findClosestHourIndex, buildDateWindow } from "./weatherHourMatch";

// Mountain Daylight Time = UTC-6 → utc_offset_seconds = -21600
const MDT_OFFSET = -21600;

/**
 * Generates a 48-hour block of hourly naive local time strings starting at midnight
 * of a given local date, plus matching temperature values.
 *
 * E.g. localDate = "2026-07-13" →
 *   times[0]  = "2026-07-13T00:00"  temp[0]  = 60
 *   times[7]  = "2026-07-13T07:00"  temp[7]  = 55   ← morning
 *   times[13] = "2026-07-13T13:00"  temp[13] = 99   ← afternoon peak
 *   times[22] = "2026-07-13T22:00"  temp[22] = 70   ← evening
 */
function makeHourlyBlock(localDate: string, hours = 48) {
  const times: string[] = [];
  const temperature_2m: number[] = [];
  const date = new Date(localDate + "T00:00:00Z");
  for (let h = 0; h < hours; h++) {
    const d = new Date(date.getTime() + h * 3600 * 1000);
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const yyyy = d.toISOString().slice(0, 10);
    times.push(`${yyyy}T${hh}:00`);
    temperature_2m.push(baseTemp(h));
  }
  return { times, temperature_2m };
}

function baseTemp(hour: number): number {
  // hour 0..23 repeated: cold at night, peak at 13
  const h = hour % 24;
  if (h === 7) return 55;
  if (h === 13) return 99;
  if (h === 22) return 70;
  return 65;
}

describe("findClosestHourIndex — timezone offset correction", () => {
  it("returns morning hour (index 7, 55°F) for 7:30 AM Mountain time, not afternoon", () => {
    // 7:30 AM MDT = 13:30 UTC
    const targetMs = new Date("2026-07-13T13:30:00Z").getTime();
    const { times, temperature_2m } = makeHourlyBlock("2026-07-12"); // day-before start (±1 day window)

    const idx = findClosestHourIndex(times, MDT_OFFSET, targetMs);

    // Local "07:00" on 2026-07-13 is index 31 in a block starting at 2026-07-12T00:00 local
    // (24 hours for the 12th + 7 hours into the 13th = index 31)
    expect(times[idx]).toBe("2026-07-13T07:00");
    expect(temperature_2m[idx]).toBe(55);
  });

  it("does NOT return the afternoon hour (13:00 local = 19:00 UTC) for a 7:30 AM Mountain target", () => {
    const targetMs = new Date("2026-07-13T13:30:00Z").getTime();
    const { times, temperature_2m } = makeHourlyBlock("2026-07-12");

    const idx = findClosestHourIndex(times, MDT_OFFSET, targetMs);

    expect(temperature_2m[idx]).not.toBe(99);
    expect(times[idx]).not.toBe("2026-07-13T13:00");
  });

  it("handles Eastern time (UTC-4) correctly — 8 AM Eastern target picks local 08:00", () => {
    // Eastern Daylight Time = UTC-4 → utc_offset_seconds = -14400
    const EDT_OFFSET = -14400;
    // 8:00 AM EDT = 12:00 UTC
    const targetMs = new Date("2026-07-13T12:00:00Z").getTime();
    const { times } = makeHourlyBlock("2026-07-12");

    const idx = findClosestHourIndex(times, EDT_OFFSET, targetMs);

    expect(times[idx]).toBe("2026-07-13T08:00");
  });
});

describe("buildDateWindow — date rollover edge case", () => {
  it("includes the local date for a 10 PM Mountain capture (04:00 next-day UTC)", () => {
    // 10 PM MDT on July 13 = 04:00 UTC on July 14 (next day)
    // Without ±1 day window, fetching start_date=2026-07-14&end_date=2026-07-14 gives the
    // WRONG date — July 14th data instead of July 13th.
    // With the window, start_date=2026-07-13 is included.
    const targetMs = new Date("2026-07-14T04:00:00Z").getTime(); // 10 PM MDT July 13
    const { startDate, endDate } = buildDateWindow(targetMs);

    expect(startDate).toBe("2026-07-13");
    expect(endDate).toBe("2026-07-15");
  });

  it("selects the correct local hour for a 10 PM Mountain evening capture", () => {
    // Target: 10 PM MDT July 13 = 2026-07-14T04:00Z
    const targetMs = new Date("2026-07-14T04:00:00Z").getTime();

    // Mock a 72-hour block starting 2026-07-13T00:00 local (covering the ±1 day window)
    const { times, temperature_2m } = makeHourlyBlock("2026-07-13", 72);

    const idx = findClosestHourIndex(times, MDT_OFFSET, targetMs);

    // Local "22:00" on 2026-07-13 is index 22 in the block
    expect(times[idx]).toBe("2026-07-13T22:00");
    expect(temperature_2m[idx]).toBe(70);
  });
});
