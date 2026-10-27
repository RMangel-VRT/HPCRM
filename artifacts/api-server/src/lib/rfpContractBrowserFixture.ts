import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { ticketFieldValues } from "@workspace/db";
import { db, pool } from "../db";
import { createRfpFixture, removeRfpFixture } from "./rfpContractFixture";

const dir = resolve(import.meta.dirname, "../../../../generated-artifacts/rfp-browser");
try {
  if (process.argv[2] === "cleanup") {
    const f = JSON.parse(await readFile(`${dir}/fixture.json`, "utf8"));
    await removeRfpFixture(f.companyId, f.userId);
    await unlink(`${dir}/fixture.json`);
  } else if (process.argv[2] === "verify") {
    const f = JSON.parse(await readFile(`${dir}/fixture.json`, "utf8"));
    const login = await fetch("http://localhost:8080/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: f.email, password: f.password }) });
    if (!login.ok) throw new Error(`Disposable fixture login failed: ${login.status}`);
    const cookie = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
    type FixtureContract = { terms: { id: string; allowedMoves: string[] }[] };
    type LinkedSeason = { displayStatus: string; termId: string };
    const api = async <T = unknown>(method: string, path: string, body?: unknown, status = 200): Promise<T> => {
      const response = await fetch(`http://localhost:8080/api${path}`, { method, headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body) });
      if (response.status !== status) throw new Error(`${method} ${path}: expected ${status}, received ${response.status}: ${await response.text()}`);
      return response.json() as Promise<T>;
    };
    const create = (bidTicketId?: string) => api<FixtureContract>("POST", "/contract-center/contracts", { bidTicketId, customerId: f.customerId, line: "both", form: "ours",
      term: { seasonLabel: "2027", startDate: "2027-01-01", endDate: "2027-12-31", snowPricing: "time_and_materials" }, scope: [], rates: [], payments: [] }, 201);
    const direct = await create(f.directLostRfp.id), directTerm = direct.terms[0];
    if (!directTerm.allowedMoves.includes("lost")) throw new Error("Unsent bid draft did not offer Lost");
    // Inspect the ordinary ticket PATCH conflict and exact message.
    const guard = await fetch(`http://localhost:8080/api/tickets/${f.directLostRfp.id}`, { method: "PATCH", headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ currentStatusId: f.statuses.find((s: { statusKey: string }) => s.statusKey === "awarded").id }) });
    if (guard.status !== 409 || (await guard.json() as { message?: string }).message !== "Mark the contract signed in the Contract Center; the RFP follows it.") throw new Error("Unsigned manual status guard failed");
    await api("PATCH", `/tickets/${f.directLostRfp.id}`, { title: "Disposable direct bid update" });
    const directSeasons = await api<LinkedSeason[]>("GET", `/contract-center/contracts?bidTicketId=${f.directLostRfp.id}`);
    for (const season of directSeasons.filter((s: { displayStatus: string }) => ["draft", "sent"].includes(s.displayStatus))) {
      await api("POST", `/contract-center/terms/${season.termId}/status`, { to: "lost" });
    }
    const directTicket = await api<{ ticket: { currentStatusId: string }; statuses: { id: string; statusKey: string }[] }>("GET", `/tickets/${f.directLostRfp.id}/details`);
    if (!directTicket.statuses.some((s: { id: string; statusKey: string }) => s.id === directTicket.ticket.currentStatusId && s.statusKey === "closed_lost")) throw new Error("Direct draft loss did not close RFP");
    const decisionDraft = await create(f.decisionRfp.id), decisionSent = await create(f.decisionRfp.id);
    await api("POST", `/contract-center/terms/${decisionSent.terms[0].id}/status`, { to: "sent" });
    const decisionField = f.fields.find((field: { fieldKey: string }) => field.fieldKey === "decision_outcome");
    await api("PUT", `/tickets/${f.decisionRfp.id}/field-values/${decisionField.id}`, { value: "Lost" });
    const seasons = await api<LinkedSeason[]>("GET", `/contract-center/contracts?bidTicketId=${f.decisionRfp.id}`);
    if (seasons.length !== 2 || seasons.some((s: { displayStatus: string }) => s.displayStatus !== "lost")) throw new Error("Decision Lost did not propagate to draft and sent");
    if (!decisionDraft.terms[0].allowedMoves.includes("lost")) throw new Error("Decision propagation draft did not use ordinary Lost eligibility");
    const ordinary = await create();
    if (ordinary.terms[0].allowedMoves.includes("lost")) throw new Error("Ordinary draft unexpectedly offers Lost");
    const rejected = await fetch(`http://localhost:8080/api/contract-center/terms/${ordinary.terms[0].id}/status`, {
      method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ to: "lost" }) });
    if (rejected.status !== 409) throw new Error("Ordinary draft unexpectedly accepts Lost");
    console.info("Verified live development API: direct unsent bid Lost, unsigned manual 409, Decision Lost draft/sent propagation, ordinary draft rejection.");
  } else {
    const f = await createRfpFixture(), rfp = await f.createRfp(), decisionRfp = await f.createRfp("decision_received"), directLostRfp = await f.createRfp();
    await db.insert(ticketFieldValues).values([
      { ticketId: rfp.id, fieldId: f.fields.find(f => f.fieldKey === "service_request_type")!.id, value: "Maintenance & Snow Removal", capturedById: f.userId },
      { ticketId: rfp.id, fieldId: f.fields.find(f => f.fieldKey === "desired_start_date")!.id, value: "2027-01-01", capturedById: f.userId },
    ]);
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/fixture.json`, JSON.stringify({ companyId: f.companyId, userId: f.userId, customerId: f.customerId,
      email: f.email, password: f.password, rfp, decisionRfp, directLostRfp, statuses: f.statuses, fields: f.fields }), { mode: 0o600 });
  }
} finally { await pool.end(); }
