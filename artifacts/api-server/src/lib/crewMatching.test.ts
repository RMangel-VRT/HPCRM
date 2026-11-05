import { describe, expect, it } from "vitest";
import { proposeCrewLinks } from "./crewMatching";
const crew = { id: "s", companyId: "a", name: "North", supervisorUserId: "u", isActive: true };
const team = { id: "t", companyId: "a", leaderUserId: "u", crewId: null };
describe("campaign crew proposals", () => {
  it("matches a unique active same-company supervisor", () => {
    expect(proposeCrewLinks([crew], [team]).campaignLinks).toEqual([{ id: "t", crewId: "s" }]);
  });
  it("never steals an existing choice", () => {
    expect(proposeCrewLinks([crew], [{ ...team, crewId: "other" }]).campaignLinks).toEqual([]);
  });
  it("rejects ambiguous supervisors, inactive crews and other companies", () => {
    for (const standing of [[crew, { ...crew, id: "s2" }], [{ ...crew, isActive: false }], [{ ...crew, companyId: "b" }]])
      expect(proposeCrewLinks(standing, [team]).campaignLinks).toEqual([]);
  });
});
