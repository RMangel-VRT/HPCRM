import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { computeScheduleBy, localDateString } from "./scheduleBy";
import { insertTicketSchema as serverSchema } from "@workspace/db";
import { insertTicketSchema as clientSchema } from "../../../highplains-crm/src/shared/schema";
import { pickProvided } from "./patchBody";

// Execute the actual client helper without adding another cross-root TS import
// to the API production typecheck. The CRM typecheck covers its source types.
const clientModule = { exports: {} as {
  computeScheduleBy: typeof computeScheduleBy; localDateString: typeof localDateString;
} };
const clientSource = readFileSync(new URL("../../../highplains-crm/src/shared/scheduleBy.ts", import.meta.url), "utf8");
new Function("module", "exports", transformSync(clientSource, {
  loader: "ts", format: "cjs", target: "es2022",
}).code)(clientModule, clientModule.exports);
const { computeScheduleBy: clientCompute, localDateString: clientLocalDate } = clientModule.exports;

describe("schedule-by shared fixtures", () => {
  const fixtures = [
    ["urgent", "2026-10-05", "2026-10-06"],
    ["urgent", "2026-10-09", "2026-10-12"],
    ["urgent", "2026-10-10", "2026-10-12"],
    ["urgent", "2026-10-11", "2026-10-12"],
    ["high", "2026-10-05", "2026-10-08"],
    ["normal", "2026-10-05", "2026-10-12"],
    ["low", "2026-10-05", "2026-10-26"],
    ["unknown", "2026-10-05", "2026-10-12"],
    ["high", "2026-01-30", "2026-02-02"],
    ["normal", "2026-12-28", "2027-01-04"],
    ["low", "2026-12-28", "2027-01-18"],
    ["urgent", "2027-12-31", "2028-01-03"],
    ["normal", "2028-02-23", "2028-03-01"],
    ["normal", "2026-03-06", "2026-03-13"],
    ["normal", "2026-10-30", "2026-11-06"],
  ];
  it.each(fixtures)("%s from %s gives %s in both copies", (priority, input, expected) => {
    // Independent offset-bearing fixture: never derive the instant from host-local getters.
    const offset = input >= "2026-03-08" && input < "2026-11-01" ? "-06:00" : "-07:00";
    const base = new Date(`${input}T23:45:00${offset}`);
    const original = base.getTime();
    expect(localDateString(base)).toBe(input);
    expect(clientLocalDate(base)).toBe(input);
    expect(computeScheduleBy(priority, base)).toBe(expected);
    expect(clientCompute(priority, base)).toBe(expected);
    expect(base.getTime()).toBe(original);
  });
  it.each([null, undefined])("missing priority %s uses normal", priority => {
    const base = new Date("2026-10-05T00:00:00-06:00");
    expect(computeScheduleBy(priority, base)).toBe("2026-10-12");
    expect(clientCompute(priority, base)).toBe("2026-10-12");
  });
  it.each([
    ["2026-10-09T19:00:00-06:00", "2026-10-12"],
    ["2026-10-09T23:59:59-06:00", "2026-10-12"],
    ["2026-03-08T01:59:59-07:00", "2026-03-09"],
    ["2026-03-08T03:00:00-06:00", "2026-03-09"],
    ["2026-11-01T01:30:00-06:00", "2026-11-02"],
    ["2026-11-01T01:30:00-07:00", "2026-11-02"],
  ])("urgent parity at %s", (instant, expected) => {
    expect(computeScheduleBy("urgent", new Date(instant))).toBe(expected);
    expect(clientCompute("urgent", new Date(instant))).toBe(expected);
  });
});

describe("scheduling insert-schema parity and sparse PATCH", () => {
  const base = {
    companyId: "company", ticketTypeId: "type", currentStatusId: "status",
    title: "Work", createdById: "actor",
  };
  for (const [name, schema] of [["server", serverSchema], ["client", clientSchema]] as const) {
    it(`${name} preserves dates and note through form parsing`, () => {
      const fields = { scheduleBy: "2028-02-29", followUpDate: "2027-01-01", followUpNote: "Call customer" };
      expect(schema.parse({ ...base, ...fields })).toMatchObject({ ...base, ...fields });
    });
    it(`${name} omits blanks without defaults and preserves explicit null`, () => {
      const absent = schema.parse(base);
      for (const key of ["scheduleBy", "followUpDate", "followUpNote"]) expect(absent[key]).toBeUndefined();
      const blank = schema.parse({ ...base, scheduleBy: "", followUpDate: "" });
      expect(blank.scheduleBy).toBeUndefined();
      expect(blank.followUpDate).toBeUndefined();
      const clear = { scheduleBy: null, followUpDate: null, followUpNote: null };
      expect(schema.parse({ ...base, ...clear })).toMatchObject(clear);
    });
    it.each(["2026-2-01", "not-a-date", "2026-02-29", "2026-04-31", "0000-01-01", 123])(
      `${name} rejects invalid calendar date %s`, value => {
        expect(schema.safeParse({ ...base, scheduleBy: value }).success).toBe(false);
        expect(schema.safeParse({ ...base, followUpDate: value }).success).toBe(false);
      },
    );
  }
  it("server PATCH preserves null and never introduces absent defaults", () => {
    const body = { followUpDate: null, followUpNote: null };
    expect(pickProvided(serverSchema.partial().parse(body), body)).toEqual(body);
    expect(pickProvided(serverSchema.partial().parse({}), {})).toEqual({});
  });
});
