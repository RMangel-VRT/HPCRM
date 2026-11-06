import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { rejectLegacySnowCoverageWrite, SNOW_COVERAGE_MESSAGE } from "../lib/snowCoverageInput";
describe("retired snow input HTTP boundary used by every customer route", () => {
  const app = express(); app.use(express.json()); app.use("/api/customers", rejectLegacySnowCoverageWrite);
  app.use("/api/customers", (_req, res) => { res.json({ ok: true }); });
  it.each([["post", "/api/customers"], ["patch", "/api/customers/id"], ["put", "/api/customers/id/setup"]] as const)
    ("%s %s rejects every provided value, not only true", async (method, path) => {
      for (const value of [true, false, null, "", 0]) for (const key of ["snowEnabled", "snow_enabled"]) {
        const r = await request(app)[method](path).send({ [key]: value }).expect(422);
        expect(r.body.message).toBe(SNOW_COVERAGE_MESSAGE);
        await request(app)[method](path).send({ customer: { [key]: value } }).expect(422);
      }
      await request(app)[method](path).send({ customer: { name: "Provided fields only" } }).expect(200);
    });
});
