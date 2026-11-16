import { describe, expect, it } from "vitest";
import { signTicketPhotoUpload, ticketPhotoAdditions } from "./ticketPhotoUploads";

const path = "/objects/uploads/11111111-1111-4111-8111-111111111111";
const scope = { userId: "u1", companyId: "c1" };
const now = 1_800_000_000_000;
const input = () => [{ path, uploadToken: signTicketPhotoUpload(path, scope, "session", now) }];

describe("ticket photo attachment grants", () => {
  it("accepts the caller's upload and deduplicates idempotent retries", () => {
    const photos = input();
    expect(ticketPhotoAdditions([...photos, ...photos], scope, "session", now)).toEqual([path]);
  });
  it("refuses expired, foreign-company, foreign-user and foreign-session uploads", () => {
    expect(() => ticketPhotoAdditions(input(), scope, "session", now + 3_600_000)).toThrow();
    expect(() => ticketPhotoAdditions(input(), { ...scope, companyId: "c2" }, "session", now)).toThrow();
    expect(() => ticketPhotoAdditions(input(), { ...scope, userId: "u2" }, "session", now)).toThrow();
    expect(() => ticketPhotoAdditions(input(), scope, "other-session", now)).toThrow();
  });
  it("refuses path substitution, forged tokens and empty or legacy ungranted arrays", () => {
    expect(() => ticketPhotoAdditions([{ ...input()[0], path: `${path}x` }], scope, "session", now)).toThrow();
    expect(() => ticketPhotoAdditions([{ path, uploadToken: "forged.token" }], scope, "session", now)).toThrow();
    expect(() => ticketPhotoAdditions([], scope, "session", now)).toThrow();
    expect(() => ticketPhotoAdditions([path], scope, "session", now)).toThrow();
  });
});
