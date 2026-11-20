import { expect, it } from "vitest";
import { buildWorkCompletedEmail } from "./workCompletedEmail";
import { buildDocumentsEmail, buildGeneralMessage } from "./serviceEmails";
import { DEFAULT_WORDING } from "./wording";
const company = { name: "Fixture Landscape", email: "office@example.test", addressLine: "123 Test St", website: "", phone: "" };
const ticket = { id: "abcdef-id", companyId: "fixture", title: "Replace shrubs", leadTechName: "Private Lead", crewSummary: "Private Crew" };
it("renders completion facts in the specified order, with no staff fields", async () => {
  const recap = { ...ticket, completedAt: new Date("2026-11-21T01:00:00Z"), actualStartTime: new Date("2026-11-20T19:00:00Z"),
    actualEndTime: new Date("2026-11-20T20:30:00Z"), areasWorked: "Entry beds", workSummaryForCustomer: "Removed shrubs.\nPlanted junipers.",
    materialsUsed: "Compost", recommendations: "Water weekly." };
  const email = await buildWorkCompletedEmail({ wording: DEFAULT_WORDING.work_completed, ticket: recap, company, customer: { name: "The Property" },
    photoUrls: ["https://example.test/email-img/allowed-photo"], followUp: { title: "Follow up in spring", description: "Inspect the plants." } });
  expect(email.subject).toBe("Work completed – Replace shrubs");
  expect(email.text).toContain("Completed: November 20, 2026");
  expect(email.text).toContain("Time on site: Arrived 12:00 PM, departed 1:30 PM (1h 30m)");
  const sections = ["What we did", "Materials", "Photos from today", "Our recommendation", "Follow-up"];
  let cursor = -1;
  for (const section of sections) {
    const next = email.html.indexOf(section);
    expect(next).toBeGreaterThan(cursor);
    cursor = next;
  }
  expect(email.html).toContain("#ABCDEF");
  expect(email.text).toContain("- Removed shrubs.\n- Planted junipers.");
  expect(email.html + email.text).not.toMatch(/Private Lead|Private Crew|Crew On Site|Lead Tech/);
});
it("omits unavailable completion facts and renders a one-sentence recap as a callout", async () => {
  const email = await buildWorkCompletedEmail({ wording: DEFAULT_WORDING.work_completed, ticket: { ...ticket, workSummaryForCustomer: "Cleaned the entry." },
    company, photoUrls: [], customer: { name: "The Property" } });
  expect(email.text).toContain("What we did\nCleaned the entry.");
  expect(email.html + email.text).not.toMatch(/photos inside|with photos|Time on site|Our recommendation|Photos from today|Materials|Follow-up/);
});
it("uses the documents catalog, with one escaped attachment row per file", async () => {
  const email = await buildDocumentsEmail({ companyId: "fixture", company, wording: DEFAULT_WORDING.documents, documents: [
    { title: "W-9 <2026>", filename: "W-9.pdf", pageCount: 1 }, { title: "License", filename: "License.pdf" },
  ], note: "  Thanks & hello.  " });
  expect(email.subject).toBe("Requested documents – Fixture Landscape");
  expect(email.html).toContain("W-9 &lt;2026&gt;");
  expect(email.html).toContain("2 attached");
  expect(email.text).toContain("Hello,");
  expect(email.text).toContain("Attached: W-9.pdf · 1 page\nAttached: License.pdf");
});
it("escapes typed HTML and renders real blank-line-separated paragraphs without expanding typed tokens", async () => {
  const email = await buildGeneralMessage({ companyId: "fixture", company, wording: DEFAULT_WORDING.general_message, subject: " Typed & exact ", customerName: "Test Property",
    body: "First <script>alert(1)</script>.\r\nLine two.\r\n \r\n{companyName} stays literal." });
  expect(email.subject).toBe(" Typed & exact ");
  expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;.<br>Line two.</p><p");
  expect(email.html).not.toContain("<script>");
  expect(email.text).toContain("Line two.\n\n{companyName} stays literal.");
});
