/** Disposable AM1 browser fixture. Never reads or changes an existing person's role. */
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { companies, companyUsers, customers, users, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";

const file = resolve(import.meta.dirname, "../../../../generated-artifacts/am1/browser-fixture.json");
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Development fixtures cannot run in production");
  if (process.argv[2] === "cleanup") {
    const data = JSON.parse(readFileSync(file, "utf8"));
    const [company] = await db.select().from(companies).where(eq(companies.id, data.companyId));
    if (company?.slug !== `am1-browser-${data.companyId}`) throw new Error("Not an AM1 disposable fixture");
    await db.delete(companies).where(eq(companies.id, data.companyId));
    await db.delete(users).where(inArray(users.id, data.userIds));
    unlinkSync(file); return;
  }
  const companyId = randomUUID(), actor = randomUUID(), candidate = randomUUID(), parent = randomUUID(), branch = randomUUID(), standalone = randomUUID();
  const password = randomBytes(18).toString("hex"), salt = randomBytes(16).toString("hex");
  const email = `am1-${actor}@example.invalid`;
  await db.transaction(async tx => {
    await tx.insert(companies).values({ id: companyId, name: "AM1 Disposable Verification", slug: `am1-browser-${companyId}` });
    await tx.insert(users).values([
      { id: actor, name: "AM1 Synthetic Manager", email, defaultCompanyId: companyId, passwordHash: `${scryptSync(password, salt, 64).toString("hex")}.${salt}` },
      { id: candidate, name: "AM1 Synthetic Candidate", email: `am1-${candidate}@example.invalid`, passwordHash: "not-a-login", defaultCompanyId: companyId },
    ]);
    await tx.insert(companyUsers).values([
      { userId: actor, companyId, role: "account_manager", status: "active" },
      { userId: candidate, companyId, role: "office", status: "active" },
    ]);
    await tx.insert(customers).values([
      { id: parent, companyId, name: "AM1 Parent", street: "1 Fixture Way", city: "Denver", state: "CO", zip: "80000", status: "prospect", isParent: "true" },
      { id: standalone, companyId, name: "AM1 Standalone", street: "2 Fixture Way", city: "Denver", state: "CO", zip: "80000", status: "prospect" },
    ]);
    await tx.insert(customers).values({ id: branch, companyId, parentCustomerId: parent, name: "AM1 Branch", street: "3 Fixture Way", city: "Denver", state: "CO", zip: "80000", status: "prospect" });
  });
  mkdirSync(resolve(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify({ companyId, email, password, userIds: [actor, candidate], parent, branch, standalone }, null, 2), { mode: 0o600 });
  console.log("Disposable AM1 fixture ready; credentials are in the ignored browser-fixture.json.");
}
main().finally(async () => { await pool.end(); await schemaPool.end(); });
