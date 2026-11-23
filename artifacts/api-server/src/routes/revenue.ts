import type { Express, RequestHandler } from "express";
import { z } from "zod/v4";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { storage } from "../storage";
import { companyToday } from "../lib/companyDay";
import {
  billingMonth, byCustomer, countInEffectSnowTm, dashboardRevenueMonths,
  filterRevenueLine, loadContractRevenueRows, loadContractRevenueSeasons, monthlyTotals, summarizeBillingMonth,
} from "../lib/contractRevenue";

export const requireRevenueRead: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).send("Not authenticated");
    return;
  }
  const user = req.user as UserWithContext;
  if (user.accessRole !== "admin" && user.accessRole !== "office") {
    res.status(403).send("Insufficient permissions - admin or office role required");
    return;
  }
  next();
};

const yearParam = z.string().regex(/^\d{4}$/).transform(Number).pipe(z.number().int().positive());
const billingQuery = z.strictObject({
  month: z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/),
});
const matrixQuery = z.strictObject({
  year: yearParam,
  line: z.enum(["all", "contract", "snow", "fee"]).default("all"),
});
const limitParam = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative());

export function registerRevenueRoutes(app: Express): void {
  // Apply the minimum role to every Revenue route, including legacy routes
  // registered later. Existing admin-only legacy actions keep that restriction.
  app.use("/api/revenue", requireRevenueRead);

  app.get("/api/revenue/contracts/billing", async (req, res) => {
    const query = billingQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ message: "month must be YYYY-MM" });
      return;
    }
    const month = `${query.data.month}-01`;
    const { activeCompanyId } = req.user as UserWithContext;
    const [rows, snowTmCount] = await Promise.all([
      loadContractRevenueRows(db, activeCompanyId, month, month),
      countInEffectSnowTm(db, activeCompanyId, companyToday()),
    ]);
    res.json({ month, ...summarizeBillingMonth(rows), snowTmCount });
  });

  app.get("/api/revenue/contracts/by-customer", async (req, res) => {
    const query = matrixQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ message: "year must be YYYY; line must be all, contract, snow or fee" });
      return;
    }
    const { year, line } = query.data;
    const { activeCompanyId } = req.user as UserWithContext;
    const rows = filterRevenueLine(
      await loadContractRevenueRows(db, activeCompanyId, billingMonth(year, 1), billingMonth(year, 12)), line,
    );
    const agreementIds = [...new Set(rows.map(row => row.agreementId))];
    const seasons = await loadContractRevenueSeasons(db, activeCompanyId, agreementIds, year);
    const monthTotals = monthlyTotals(rows, year);
    res.json({
      year,
      customers: byCustomer(rows, year, seasons),
      monthTotals,
      totalCents: monthTotals.reduce((sum, cents) => sum + cents, 0),
    });
  });

  app.get("/api/dashboard/monthly-revenue", requireRevenueRead, async (req, res) => {
    const year = yearParam.safeParse(req.query.year ?? companyToday().slice(0, 4));
    if (!year.success) {
      res.status(400).send("Invalid year");
      return;
    }
    const { activeCompanyId } = req.user as UserWithContext;
    const rows = await loadContractRevenueRows(db, activeCompanyId, billingMonth(year.data, 1), billingMonth(year.data, 12));
    res.json(dashboardRevenueMonths(rows, year.data));
  });

  app.get("/api/dashboard/top-customers", requireRevenueRead, async (req, res) => {
    const limit = limitParam.safeParse(req.query.limit ?? "5");
    if (!limit.success) {
      res.status(400).send("Invalid limit");
      return;
    }
    const { activeCompanyId } = req.user as UserWithContext;
    res.json(await storage.getTopCustomers(activeCompanyId, limit.data));
  });

  app.get("/api/revenue/overview", async (req, res) => {
    const { activeCompanyId } = req.user as UserWithContext;
    const month = parseInt(req.query.month as string);
    const year = parseInt(req.query.year as string);
    if (isNaN(month) || month < 1 || month > 12) {
      res.status(400).send("Invalid month");
      return;
    }
    if (isNaN(year) || year < 2000 || year > 2100) {
      res.status(400).send("Invalid year");
      return;
    }
    res.json(await storage.getRevenueOverview(activeCompanyId, month, year));
  });
}
