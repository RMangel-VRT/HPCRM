import { expect, it } from "vitest";
import { DEFAULT_WORDING, validateWording, WORDING_FIELDS } from "./wording";
import { EMAIL_WORDING_KEYS, WORDING_LIMITS } from "../../../../../lib/db/src/emailWordingContracts";

const valid = DEFAULT_WORDING.estimate;

it("accepts all approved defaults and only allows an empty general-message intro", () => {
  for (const key of EMAIL_WORDING_KEYS) {
    expect(validateWording(key, DEFAULT_WORDING[key])).toBeNull();
    for (const field of WORDING_FIELDS) {
      if (key === "general_message" && field === "intro") continue;
      expect(validateWording(key, { ...DEFAULT_WORDING[key], [field]: " " })?.[field]).toBe("This field is required.");
    }
  }
});

it("checks all six maximum lengths", () => {
  for (const field of WORDING_FIELDS) {
    const limit = WORDING_LIMITS[field];
    expect(validateWording("estimate", { ...valid, [field]: "a".repeat(limit) })).toBeNull();
    expect(validateWording("estimate", { ...valid, [field]: "a".repeat(limit + 1) })?.[field]).toContain(`${limit} characters`);
  }
});

it.each(["\n", "\r\n", "\u2028", "\u0085"])("rejects a line break", newline => {
  expect(validateWording("estimate", { ...valid, subject: `Estimate${newline}Test` })?.subject).toBe("Keep this to one paragraph.");
});
it.each(["{companyName", "companyName}", "{{companyName}}", "{a{b}c}"])("rejects malformed braces: %s", subject => {
  expect(validateWording("estimate", { ...valid, subject })?.subject).toBe("Placeholders need both braces, like {customerName}.");
});
it.each(["{companyname}", "{dueDate}", "{title2}", "{}"])("rejects unapproved placeholders: %s", subject => {
  expect(validateWording("estimate", { ...valid, subject })?.subject).toContain(`Unknown placeholder ${subject}.`);
});
it.each(["<b>Intro</b>", "https://example.test", "**Bold**", "[Link](mailto:a@example.test)"])("rejects authored markup: %s", intro => {
  expect(validateWording("estimate", { ...valid, intro })?.intro).toContain("Use plain text");
});
