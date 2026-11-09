/** Disposable signed-in verification data. Never targets real customer records. */
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { agreements, termBillingMonths } from "@workspace/db";
import { createNonRenewalFixture, removeNonRenewalFixture } from "./contractNonRenewalFixture";
import { db, pool } from "../db";
import { writeTerm } from "./contractCenterPersistence";
import { preparePayments } from "./contractCenterService";

const dir = resolve(import.meta.dirname, "../../../../generated-artifacts/cc2-18");
const path = `${dir}/browser-fixture.json`;
try {
  if (process.env.NODE_ENV === "production") throw new Error("Development only");
  if (process.argv[2] === "cleanup") {
    const f = JSON.parse(await readFile(path, "utf8"));
    await removeNonRenewalFixture(f.companyId, f.userId);
    await unlink(path);
  } else {
    const f = await createNonRenewalFixture();
    const payments = [
      { component: "Grounds", months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amountCents: 185400 })) },
      { component: "Mobilization", fee: true, months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amountCents: 3995 })) },
    ];
    const prepared = preparePayments(payments, "2026-01-01", "2026-12-31", "landscape");
    const agreement = await db.transaction(async tx => {
      const [a] = await tx.insert(agreements).values({ companyId: f.companyId, customerId: f.customerId }).returning();
      const { rows, preStart: _pre, ...fields } = prepared;
      const term = await writeTerm(tx, f.companyId, f.userId, null, { ...fields, agreementId: a.id,
        line: "landscape", form: "theirs", seasonLabel: "Payment browser fixture", startDate: "2026-01-01",
        endDate: "2026-12-31", status: "signed", signedAt: new Date() }, "Disposable payment browser fixture");
      await tx.insert(termBillingMonths).values(rows.map(r => ({ ...r, termId: term.id, companyId: f.companyId })));
      return { agreementId: a.id, termId: term.id };
    });
    await mkdir(dir, { recursive: true });
    await writeFile(path, JSON.stringify({ companyId: f.companyId, userId: f.userId, customerId: f.customerId,
      email: f.email, password: f.password, ...agreement }), { mode: 0o600 });
  }
} finally { await pool.end(); }
