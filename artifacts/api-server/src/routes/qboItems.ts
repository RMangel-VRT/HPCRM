import { Router, type RequestHandler } from "express";
import { z } from "zod/v4";
import { UMBRELLA_KEYS } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { estimateAccess } from "../lib/estimateAccess";
import { storage } from "../storage";
import { isQboWriteEnabled } from "../services/qboClient";
import { cachedItems, createItem, incomeAccounts, linkItem, listUmbrellas, pullItems, QboItemError, unlinkItem } from "../services/qboItems";
import { logger } from "../lib/logger";

const router = Router();
const keySchema = z.object({ key: z.enum(UMBRELLA_KEYS) }).strict();
const linkSchema = keySchema.extend({ qboItemId: z.string().trim().min(1).max(200) });
const createSchema = keySchema.extend({
  name: z.string().trim().min(1).max(100), incomeAccountId: z.string().trim().min(1).max(200),
  type: z.preprocess(v => v === "" || v === null ? undefined : v, z.enum(["Service", "NonInventory"]).optional()),
});
function handle(work: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    try { await work(req, res, next); } catch (err) {
      if (err instanceof QboItemError) { res.status(err.status).json({ message: err.message, ...err.details }); return; }
      logger.error({ err }, "QuickBooks item operation failed");
      res.status(500).json({ message: "QuickBooks item operation failed. Pull items and check existing bindings before retrying a create." });
    }
  };
}
const connected: RequestHandler = async (req, res, next) => {
  try {
    const conn = await storage.getQboConnection((req.user as UserWithContext).activeCompanyId);
    if (!conn || conn.status !== "connected") { res.status(503).json({ message: "QuickBooks is not connected for this company" }); return; }
    next();
  } catch (err) { next(err); }
};
// Only these exact new paths use this gate; existing OAuth/admin routes are unchanged.
router.get("/umbrellas", estimateAccess, handle(async (req, res) => {
  const companyId = (req.user as UserWithContext).activeCompanyId;
  const [items, qboWriteEnabled] = await Promise.all([listUmbrellas(companyId), isQboWriteEnabled(companyId)]);
  res.json({ items, qboWriteEnabled });
}));
router.post("/items/pull", estimateAccess, connected, handle(async (req, res) => { res.json(await pullItems((req.user as UserWithContext).activeCompanyId)); }));
router.get("/items/cache", estimateAccess, handle(async (req, res) => {
  const parsed = z.object({ search: z.string().max(200).optional(), type: z.string().max(100).optional() }).safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ message: "Invalid search or type" }); return; }
  res.json(await cachedItems((req.user as UserWithContext).activeCompanyId, parsed.data.search, parsed.data.type));
}));
router.get("/items/income-accounts", estimateAccess, connected, handle(async (req, res) => { res.json(await incomeAccounts((req.user as UserWithContext).activeCompanyId)); }));
router.post("/umbrellas/link", estimateAccess, handle(async (req, res) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Valid key and qboItemId are required" }); return; }
  await linkItem((req.user as UserWithContext).activeCompanyId, parsed.data.key, parsed.data.qboItemId);
  res.json({ ok: true });
}));
router.post("/umbrellas/unlink", estimateAccess, handle(async (req, res) => {
  const parsed = keySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Valid key is required" }); return; }
  await unlinkItem((req.user as UserWithContext).activeCompanyId, parsed.data.key);
  res.json({ ok: true });
}));
router.post("/umbrellas/create-in-qbo", estimateAccess, connected, handle(async (req, res) => {
  const companyId = (req.user as UserWithContext).activeCompanyId;
  if (!await isQboWriteEnabled(companyId)) {
    res.status(403).json({ message: "QuickBooks write access is disabled. Enable it in Settings → Features.", writeDisabled: true }); return;
  }
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Valid key, name, type and incomeAccountId are required" }); return; }
  const item = await createItem(companyId, parsed.data);
  res.json({ ok: true, qboId: item.qboId });
}));
export default router;
