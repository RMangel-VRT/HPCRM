import { Router, type ErrorRequestHandler, type Express, type RequestHandler } from "express";
import { z as contractZ } from "zod";
import { z } from "zod/v4";
import { INCOME_ACCOUNT_STREAMS } from "@workspace/db/revenue-streams";
import {
  GetRevenueQboStatusResponse, ListRevenueQboAccountsResponse, RefreshRevenueQboIncomeBody,
  RefreshRevenueQboIncomeResponse, UpdateRevenueQboAccountMappingsBodyItem, UpdateRevenueQboAccountMappingsResponse,
} from "@workspace/api-zod";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { storage } from "../storage";
import { companyToday } from "../lib/companyDay";
import {
  getQboIncomeStatus, isRevenueRefreshYear, listIncomeAccounts, refreshQboIncome, RevenueQboError,
  updateIncomeAccountMappings,
} from "../services/qboIncome";
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

const requireRevenueQboCompany: RequestHandler = (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!(req.user as UserWithContext).activeCompanyId) {
    res.status(403).json({ message: "An active company is required" });
    return;
  }
  next();
};
const requireRevenueQboAdmin: RequestHandler = (req, res, next) => {
  const user = req.user as UserWithContext;
  if (user.accessRole !== "admin") {
    res.status(403).json({ message: "Administrator access required" });
    return;
  }
  const expectedCompany = req.get("X-Company-Id");
  if (expectedCompany !== undefined && expectedCompany !== user.activeCompanyId) {
    res.status(409).json({ message: "Active company changed. Reload and try again." });
    return;
  }
  next();
};
// Orval emits these contracts for `zod`, not for the legacy routes' `zod/v4`.
const mappingBody = contractZ.array(UpdateRevenueQboAccountMappingsBodyItem.strict().extend({
  qboAccountId: UpdateRevenueQboAccountMappingsBodyItem.shape.qboAccountId
    .refine(id => id.trim() === id && !id.includes("\0")),
  stream: contractZ.enum(INCOME_ACCOUNT_STREAMS).nullable(),
})).max(1000).refine(changes => new Set(changes.map(row => row.qboAccountId)).size === changes.length);
const refreshBody = RefreshRevenueQboIncomeBody.strict().extend({
  year: RefreshRevenueQboIncomeBody.shape.year.refine(isRevenueRefreshYear),
});
const handleQboError: ErrorRequestHandler = (err, req, res, next) => {
  if (!(err instanceof RevenueQboError)) { next(err); return; }
  if (err.status === 502) req.log?.warn({ cause: err.cause }, err.message);
  res.status(err.status).json({ message: err.message });
};

function qboIncomeRoutes() {
  const router = Router();
  router.use(requireRevenueQboCompany);

  router.get("/status", async (req, res): Promise<void> => {
    const { activeCompanyId } = req.user as UserWithContext;
    res.json(GetRevenueQboStatusResponse.parse(await getQboIncomeStatus(activeCompanyId)));
  });
  router.get("/accounts", async (req, res): Promise<void> => {
    const { activeCompanyId } = req.user as UserWithContext;
    res.json(ListRevenueQboAccountsResponse.parse(await listIncomeAccounts(activeCompanyId)));
  });
  router.put("/accounts", requireRevenueQboAdmin, async (req, res): Promise<void> => {
    const parsed = mappingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Provide unique QuickBooks income account IDs and valid streams or null" });
      return;
    }
    const { activeCompanyId, id } = req.user as UserWithContext;
    await updateIncomeAccountMappings(activeCompanyId, id, parsed.data);
    res.json(UpdateRevenueQboAccountMappingsResponse.parse({ ok: true }));
  });
  router.post("/refresh", requireRevenueQboAdmin, async (req, res): Promise<void> => {
    const parsed = refreshBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Year must be an integer from 2015 through the current Colorado year" });
      return;
    }
    const { activeCompanyId } = req.user as UserWithContext;
    res.json(RefreshRevenueQboIncomeResponse.parse(await refreshQboIncome(activeCompanyId, parsed.data.year)));
  });
  router.use(handleQboError);
  return router;
}

export function registerRevenueRoutes(app: Express): void {
  // Apply the minimum role to every Revenue route, including legacy routes
  // registered later. Existing admin-only legacy actions keep that restriction.
  app.use("/api/revenue", requireRevenueRead);
  app.use("/api/revenue/qbo", qboIncomeRoutes());

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
