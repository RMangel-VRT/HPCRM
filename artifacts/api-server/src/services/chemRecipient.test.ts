import { describe, expect, it } from "vitest";
import type { Contact } from "@workspace/db";
import { selectChemRecipient } from "./chemRecipient";

const contact = (name: string, emails: string[], isPrimary = "false"): Contact =>
  ({ name, emails, isPrimary, role: null, propertyManagerId: null } as Contact);

describe("chemical campaign recipient selection", () => {
  it("finds an email even when every customer contact is non-primary", () => {
    const contacts = [
      contact("First", ["first@example.com"]),
      contact("Second", ["second@example.com"]),
      contact("Third", ["third@example.com"]),
      contact("Fourth", ["fourth@example.com"]),
    ];
    expect(selectChemRecipient(null, contacts)).toEqual({
      email: "first@example.com",
      contactName: "First",
    });
  });

  it("prefers a linked property manager over customer contacts", () => {
    expect(selectChemRecipient(
      { name: "Manager", email: null, emails: [{ email: "manager@example.com", isPrimary: "true" }] },
      [contact("Customer", ["customer@example.com"], "true")],
    )).toEqual({ email: "manager@example.com", contactName: "Manager" });
  });

  it("skips blank or malformed addresses and reports a genuinely missing recipient", () => {
    expect(selectChemRecipient(null, [contact("Empty", ["", "invalid"])]))
      .toEqual({ email: null, contactName: null });
  });

  it("uses a valid non-primary contact if a primary contact has no email", () => {
    expect(selectChemRecipient(null, [
      contact("Primary", [], "true"),
      contact("Available", ["available@example.com"]),
    ])).toEqual({ email: "available@example.com", contactName: "Available" });
  });
});