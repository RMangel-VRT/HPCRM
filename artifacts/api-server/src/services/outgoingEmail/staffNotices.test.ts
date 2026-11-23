import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderNewFieldFlagEmail, renderMailboxDisconnectedEmail } from "./staffNotices";

const company = { name: "High & Plains", addressLine: "123 Test St", phone: "555-0100", email: "office@example.test", website: "example.test" };
const flag = {
  flagId: "flag-1", tagLabel: "Broken sprinkler head", propertyName: "North & Main",
  crewName: "Crew 2", createdByName: "Ric <Supervisor>", note: "Head is snapped off <near gate> & zone 4.\nMarker: {{zone}}", photoCount: 2,
};
const footer = "Internal notice from High Plains CRM · you get this because of your role.";

beforeEach(() => vi.stubEnv("PUBLIC_APP_URL", " https://crm.example.test/// "));
afterEach(() => vi.unstubAllEnvs());

describe("fixed staff notice renderers", () => {
  it("renders an amber field flag with escaped facts and note, a photo count, and the flag link", () => {
    const { subject, html, text } = renderNewFieldFlagEmail(flag, company);
    expect(subject).toBe("New field flag from Crew 2 at North & Main");
    expect(html).toContain('bgcolor="#E3A008" height="6"');
    expect(html).toContain("Broken sprinkler head · 2 photos&#847;");
    expect(html).toContain("Broken sprinkler head at North &amp; Main</h1>");
    expect(html).toContain("Crew 2 flagged this from the field.");
    expect(html).toContain(">Field note</div>");
    expect(html).toContain("Head is snapped off &lt;near gate&gt; &amp; zone 4.<br>Marker: {{zone}}");
    expect(html).toContain("Ric &lt;Supervisor&gt;");
    expect(html).not.toContain("<near gate>");
    expect(html).toMatch(/href="https:\/\/crm\.example\.test\/dashboard\/flags\/flag-1"[^>]*>Open the flag in the CRM<\/a>/);
    expect(text).toContain("Property: North & Main\nCrew: Crew 2\nReported by: Ric <Supervisor>\nPhotos: 2");
    expect(text).toContain(`Field note\n${flag.note}`);
    expect(text).toContain("Open the flag in the CRM: https://crm.example.test/dashboard/flags/flag-1");
    expect(html.match(/<img\b/g)).toHaveLength(1); // Brand logo only, no private attachment.
    expect(`${html}\n${text}`).not.toMatch(/\/email-img\/|flag-photos\//);
  });

  it("handles flags without optional metadata and treats the ID as one path segment", () => {
    const { html, text } = renderNewFieldFlagEmail({
      ...flag, flagId: "flag/2 &3", crewName: null, createdByName: null, propertyName: null, note: null, photoCount: 1,
    }, company);
    expect(html).toContain("Broken sprinkler head · 1 photo&#847;");
    expect(text).toContain("Property: Not specified\nCrew: Not assigned\nReported by: Unknown\nPhotos: 1");
    expect(text).not.toContain("Field note");
    expect(text).toContain("/dashboard/flags/flag%2F2%20%263");
  });

  it("renders a red mailbox notice with an escaped address and the direct reconnect route", () => {
    const mailbox = `"ops<team>&"@example.test`;
    const { subject, html, text } = renderMailboxDisconnectedEmail(mailbox, company);
    expect(subject).toBe(`Gmail sync stopped for ${mailbox}`);
    expect(html).toContain('bgcolor="#C8372D" height="6"');
    expect(html).toContain("Reconnect to resume syncing&#847;");
    expect(html).toContain("Your mailbox stopped syncing</h1>");
    expect(html).toContain("Gmail sync stopped for &quot;ops&lt;team&gt;&amp;&quot;@example.test because Google’s permission expired or was removed.");
    expect(html).not.toContain("<team>");
    expect(html).toContain("Nothing new will sync or send from this mailbox until you reconnect it.");
    expect(html).toContain("Your sync history is safe.");
    expect(html).toMatch(/href="https:\/\/crm\.example\.test\/dashboard\/settings\/shared-mailboxes"[^>]*>Reconnect in Settings → Shared mailboxes<\/a>/);
    expect(text).toContain(`Gmail sync stopped for ${mailbox} because Google’s permission expired or was removed.`);
    expect(text).toContain("Reconnect in Settings → Shared mailboxes: https://crm.example.test/dashboard/settings/shared-mailboxes");
    expect(`${html}\n${text}`).not.toContain("/settings/mailbox-accounts");
  });

  it.each([
    ["field flag", () => renderNewFieldFlagEmail(flag, company)],
    ["disconnected mailbox", () => renderMailboxDisconnectedEmail("ops@example.test", company)],
  ] as const)("uses the plain internal footer and shared header for the %s", (_name, render) => {
    const { html, text } = render();
    expect(html).toContain('bgcolor="#37443D"');
    expect(html).toContain('src="https://crm.example.test/email/hp-logo-white-horizontal.png"');
    expect(html).toContain(footer);
    expect(text).toContain(footer);
    expect(html).not.toMatch(/mountains(?:-footer)?\.png|hp-logo-badge\.png|<style\b|123 Test St|office@example\.test/);
    expect(text).not.toMatch(/123 Test St|office@example\.test/);
  });
});
