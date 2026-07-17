import { Router } from "express";
import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import multer from "multer";
import type { UserWithContext } from "../auth";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import {
  isQboConfigured,
  getAuthorizeUrl,
  exchangeCodeForTokens,
  revokeConnection,
  getCompanyInfo,
  isQboWriteEnabled,
  qboRequest,
} from "../services/qboClient";
import { encryptToken } from "../services/qboCrypto";

// ── Session type extension ──────────────────────────────────────────────────────
declare module "express-session" {
  interface SessionData {
    qboOAuthState?: {
      state: string;
      companyId: string;
      expiresAt: number;
    };
  }
}

const router = Router();

// Multer instance: memory storage, 5 MB limit, only CSV files
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok =
      file.mimetype === "text/csv" ||
      file.mimetype === "text/plain" ||
      file.originalname.toLowerCase().endsWith(".csv");
    cb(null, ok);
  },
});

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function requireAdmin(req: Request, res: Response): UserWithContext | null {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  const u = req.user as UserWithContext;
  if (u.activeRole !== "admin" && !u.isSuperAdminBool) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  return u;
}

function requireAdminOrOffice(req: Request, res: Response): UserWithContext | null {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  const u = req.user as UserWithContext;
  if (u.activeRole !== "admin" && u.activeRole !== "office" && !u.isSuperAdminBool) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  return u;
}

function safePublicConn(conn: Awaited<ReturnType<typeof storage.getQboConnection>>) {
  if (!conn) return { status: "not_connected" as const };
  return {
    status: conn.status,
    realmId: conn.realmId,
    companyName: conn.companyName,
    environment: conn.environment,
    lastErrorMessage: conn.lastErrorMessage,
    connectedAt: conn.connectedAt,
    updatedAt: conn.updatedAt,
  };
}

function getAppBaseUrl(): string {
  return (
    process.env.APP_PUBLIC_URL ||
    (process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`
      : "http://localhost:3000")
  );
}

// GET /api/qbo/connection — admin + office
router.get("/connection", async (req, res) => {
  const u = requireAdminOrOffice(req, res);
  if (!u) return;
  try {
    const conn = await storage.getQboConnection(u.activeCompanyId);
    res.json(safePublicConn(conn));
  } catch (err) {
    logger.error({ err }, "GET /api/qbo/connection error");
    res.status(500).json({ message: "Failed to get QBO connection" });
  }
});

// POST /api/qbo/connect — admin only
router.post("/connect", async (req, res) => {
  const u = requireAdmin(req, res);
  if (!u) return;
  try {
    if (!isQboConfigured()) {
      res.status(503).json({ message: "QuickBooks integration is not configured on this server" });
      return;
    }
    const state = randomBytes(32).toString("hex");
    req.session.qboOAuthState = {
      state,
      companyId: u.activeCompanyId,
      expiresAt: Date.now() + STATE_TTL_MS,
    };
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );
    const authorizeUrl = getAuthorizeUrl(state);
    logger.info(
      {
        clientIdPrefix: process.env.QBO_CLIENT_ID?.slice(0, 8),
        environment: process.env.QBO_ENVIRONMENT,
        redirectUri: process.env.QBO_REDIRECT_URI,
        authorizeUrlPrefix: authorizeUrl.slice(0, 120),
      },
      "QBO connect debug"
    );
    res.json({ authorizeUrl });
  } catch (err) {
    logger.error({ err }, "POST /api/qbo/connect error");
    res.status(500).json({ message: "Failed to initiate QuickBooks connection" });
  }
});

// GET /api/qbo/callback — OAuth return from Intuit
router.get("/callback", async (req, res) => {
  const baseUrl = getAppBaseUrl();
  const settingsUrl = `${baseUrl}/dashboard/settings/features`;

  const { code, state, realmId, error } = req.query as Record<string, string | undefined>;

  if (error) {
    logger.warn({ error }, "QBO OAuth callback returned error from Intuit");
    res.redirect(`${settingsUrl}?qbo=error&reason=${encodeURIComponent(error)}`);
    return;
  }

  if (!code || !state || !realmId) {
    res.redirect(`${settingsUrl}?qbo=error&reason=missing_params`);
    return;
  }

  const sessionState = req.session.qboOAuthState;

  if (!sessionState) {
    logger.warn("QBO callback: no session state found");
    res.redirect(`${settingsUrl}?qbo=error&reason=state_missing`);
    return;
  }

  if (sessionState.state !== state) {
    logger.warn({ expected: sessionState.state, got: state }, "QBO callback: state mismatch");
    res.redirect(`${settingsUrl}?qbo=error&reason=state_mismatch`);
    return;
  }

  if (Date.now() > sessionState.expiresAt) {
    logger.warn("QBO callback: state expired");
    delete req.session.qboOAuthState;
    res.redirect(`${settingsUrl}?qbo=error&reason=state_expired`);
    return;
  }

  const { companyId } = sessionState;
  delete req.session.qboOAuthState;

  try {
    const tokens = await exchangeCodeForTokens(code, realmId);

    const accessEnc = encryptToken(tokens.access_token);
    const refreshEnc = encryptToken(tokens.refresh_token);
    if (!accessEnc || !refreshEnc) {
      res.redirect(`${settingsUrl}?qbo=error&reason=encryption_failed`);
      return;
    }

    const now = Date.now();
    const environment = (process.env.QBO_ENVIRONMENT || "production") as "sandbox" | "production";

    await storage.upsertQboConnection({
      companyId,
      realmId,
      accessTokenEnc: accessEnc,
      refreshTokenEnc: refreshEnc,
      tokenExpiresAt: new Date(now + tokens.expires_in * 1000),
      refreshTokenExpiresAt: tokens.x_refresh_token_expires_in
        ? new Date(now + tokens.x_refresh_token_expires_in * 1000)
        : null,
      status: "connected",
      environment,
      companyName: null,
      lastErrorMessage: null,
    });

    // Fetch company name from QBO
    try {
      const info = await getCompanyInfo(companyId);
      const companyInfo = (info as Record<string, unknown>)["CompanyInfo"] as Record<string, unknown> | undefined;
      const companyName = companyInfo?.["CompanyName"] as string | undefined;
      if (companyName) {
        await storage.upsertQboConnection({
          companyId,
          realmId,
          accessTokenEnc: accessEnc,
          refreshTokenEnc: refreshEnc,
          tokenExpiresAt: new Date(now + tokens.expires_in * 1000),
          refreshTokenExpiresAt: tokens.x_refresh_token_expires_in
            ? new Date(now + tokens.x_refresh_token_expires_in * 1000)
            : null,
          status: "connected",
          environment,
          companyName,
          lastErrorMessage: null,
        });
      }
    } catch (err) {
      logger.warn({ err, companyId }, "Could not fetch QBO company name after connect (non-fatal)");
    }

    res.redirect(`${settingsUrl}?qbo=connected`);
  } catch (err) {
    logger.error({ err, companyId }, "QBO callback token exchange failed");
    const reason = err instanceof Error ? err.message : "exchange_failed";
    res.redirect(`${settingsUrl}?qbo=error&reason=${encodeURIComponent(reason)}`);
  }
});

// POST /api/qbo/disconnect — admin only
router.post("/disconnect", async (req, res) => {
  const u = requireAdmin(req, res);
  if (!u) return;
  try {
    await revokeConnection(u.activeCompanyId);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "POST /api/qbo/disconnect error");
    res.status(500).json({ message: "Failed to disconnect QuickBooks" });
  }
});

// POST /api/qbo/test — admin + office
router.post("/test", async (req, res) => {
  const u = requireAdminOrOffice(req, res);
  if (!u) return;
  try {
    const info = await getCompanyInfo(u.activeCompanyId);
    const companyInfo = (info as Record<string, unknown>)["CompanyInfo"] as Record<string, unknown> | undefined;
    const name = companyInfo?.["CompanyName"] as string | undefined;
    res.json({ ok: true, companyName: name ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Test failed";
    logger.warn({ err }, "POST /api/qbo/test failed");
    res.json({ ok: false, error: msg });
  }
});

// GET /api/qbo/write-enabled — internal/admin check
router.get("/write-enabled", async (req, res) => {
  const u = requireAdminOrOffice(req, res);
  if (!u) return;
  try {
    const enabled = await isQboWriteEnabled(u.activeCompanyId);
    res.json({ enabled });
  } catch (err) {
    logger.error({ err }, "GET /api/qbo/write-enabled error");
    res.status(500).json({ message: "Failed to check QBO write access" });
  }
});

// ── Customer Pull & Binding endpoints ─────────────────────────────────────────

function notConnected(res: Response): void {
  res.status(503).json({ message: "QuickBooks is not connected for this company" });
}

async function assertConnected(companyId: string, res: Response): Promise<boolean> {
  const conn = await storage.getQboConnection(companyId);
  if (!conn || conn.status !== "connected") {
    notConnected(res);
    return false;
  }
  return true;
}

// POST /api/qbo/customers/pull — pages through QBO Customer API and upserts into cache
router.post("/customers/pull", async (req, res) => {
  const u = requireAdminOrOffice(req, res);
  if (!u) return;
  if (!(await assertConnected(u.activeCompanyId, res))) return;

  try {
    let pulled = 0;
    let startPosition = 1;
    const PAGE_SIZE = 1000;
    const allQboRows: Array<{
      qboId: string; displayName: string; companyName?: string | null;
      email?: string | null; phone?: string | null; billAddrLine1?: string | null;
      billAddrCity?: string | null; billAddrPostalCode?: string | null;
      billAddrCountrySubDivisionCode?: string | null; active: boolean;
    }> = [];

    // Page through all QBO customers
    while (true) {
      const query = encodeURIComponent(
        `SELECT * FROM Customer WHERE Active IN (true,false) STARTPOSITION ${startPosition} MAXRESULTS ${PAGE_SIZE}`,
      );
      const resp = await qboRequest(u.activeCompanyId, "GET", `/query?query=${query}`);
      if (!resp.ok) {
        const text = await resp.text();
        logger.error({ status: resp.status, body: text }, "QBO customer query failed");
        res.status(502).json({ message: `QBO query failed: ${resp.status}` });
        return;
      }
      const data = await resp.json() as Record<string, unknown>;
      const queryResponse = (data as { QueryResponse?: Record<string, unknown> }).QueryResponse ?? {};
      const items = (queryResponse.Customer as unknown[] | undefined) ?? [];

      for (const item of items) {
        const c = item as Record<string, unknown>;
        const billAddr = c["BillAddr"] as Record<string, unknown> | undefined;
        const primaryEmail = (c["PrimaryEmailAddr"] as Record<string, unknown> | undefined)?.["Address"] as string | undefined;
        const primaryPhone = (c["PrimaryPhone"] as Record<string, unknown> | undefined)?.["FreeFormNumber"] as string | undefined;
        allQboRows.push({
          qboId: String(c["Id"]),
          displayName: String(c["DisplayName"] ?? c["FullyQualifiedName"] ?? ""),
          companyName: (c["CompanyName"] as string | undefined) ?? null,
          email: primaryEmail ?? null,
          phone: primaryPhone ?? null,
          billAddrLine1: (billAddr?.["Line1"] as string | undefined) ?? null,
          billAddrCity: (billAddr?.["City"] as string | undefined) ?? null,
          billAddrPostalCode: (billAddr?.["PostalCode"] as string | undefined) ?? null,
          billAddrCountrySubDivisionCode: (billAddr?.["CountrySubDivisionCode"] as string | undefined) ?? null,
          active: c["Active"] !== false,
        });
      }

      if (items.length < PAGE_SIZE) break;
      startPosition += PAGE_SIZE;
    }

    const presentQboIds = allQboRows.map((r) => r.qboId);
    pulled = allQboRows.length;

    // Upsert all rows into cache; get true insert vs update counts
    let inserted = 0;
    let updated = 0;
    if (allQboRows.length > 0) {
      const upsertResult = await storage.upsertQboCustomerCache(u.activeCompanyId, allQboRows);
      inserted = upsertResult.inserted;
      updated = upsertResult.updated;
    }

    // Deactivate rows not in this pull
    const deactivated = await storage.deactivateMissingQboCustomersRaw(
      u.activeCompanyId,
      presentQboIds,
    );

    // Refresh display names on already-bound CRM customers whose name changed
    const changedRows = allQboRows.filter((r) => r.displayName);
    await storage.refreshStaleDisplayNames(u.activeCompanyId, changedRows);

    // Detect stale bindings (bound CRM customers whose QBO ID is absent from the full pull)
    const staleQboIds = await storage.getStaleBindings(u.activeCompanyId, presentQboIds);
    const staleBindings = staleQboIds.length;

    // Detect inactive bindings (bound CRM customers whose QBO customer is present but inactive)
    const inactiveQboIds = await storage.getInactiveBindings(u.activeCompanyId);
    const inactiveBindings = inactiveQboIds.length;

    res.json({
      pulled,
      inserted,
      updated,
      deactivated,
      staleBindings,
      inactiveBindings,
      lastPulledAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "POST /api/qbo/customers/pull error");
    res.status(500).json({ message: "Failed to pull customers from QuickBooks" });
  }
});

// GET /api/qbo/customers/cache — Tab 1: Full Customer List (read-only; works even if briefly disconnected)
router.get("/customers/cache", async (req, res) => {
  const u = requireAdminOrOffice(req, res);
  if (!u) return;
  if (!(await assertConnected(u.activeCompanyId, res))) return;
  try {
    const filter = (req.query["filter"] as string) ?? "all";
    const search = (req.query["search"] as string) ?? undefined;
    const validFilters = ["all", "in_crm", "not_in_crm", "inactive"] as const;
    const safeFilter = validFilters.includes(filter as typeof validFilters[number])
      ? (filter as typeof validFilters[number])
      : "all";
    const rows = await storage.getQboCacheList(u.activeCompanyId, safeFilter, search);
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "GET /api/qbo/customers/cache error");
    res.status(500).json({ message: "Failed to fetch QBO customer cache" });
  }
});

// GET /api/qbo/customers/mapping — Tab 2: CRM Customer Matching
router.get("/customers/mapping", async (req, res) => {
  const u = requireAdminOrOffice(req, res);
  if (!u) return;
  if (!(await assertConnected(u.activeCompanyId, res))) return;
  try {
    const filter = (req.query["filter"] as string) ?? "all";
    const search = (req.query["search"] as string) ?? undefined;
    const validFilters = ["all", "bound", "unbound"] as const;
    const safeFilter = validFilters.includes(filter as typeof validFilters[number])
      ? (filter as typeof validFilters[number])
      : "all";
    const rows = await storage.getQboMappingRows(u.activeCompanyId, safeFilter, search);
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "GET /api/qbo/customers/mapping error");
    res.status(500).json({ message: "Failed to fetch QBO customer mapping" });
  }
});

// GET /api/qbo/customers/unbound-count — badge data; always available (no connection required)
router.get("/customers/unbound-count", async (req, res) => {
  const u = requireAdminOrOffice(req, res);
  if (!u) return;
  try {
    const activeUnbound = await storage.countActiveUnboundCustomers(u.activeCompanyId);
    res.json({ activeUnbound });
  } catch (err) {
    logger.error({ err }, "GET /api/qbo/customers/unbound-count error");
    res.status(500).json({ message: "Failed to count unbound customers" });
  }
});

// POST /api/qbo/customers/bind
router.post("/customers/bind", async (req, res) => {
  const u = requireAdminOrOffice(req, res);
  if (!u) return;
  if (!(await assertConnected(u.activeCompanyId, res))) return;
  try {
    const { customerId, qboId } = req.body as { customerId?: string; qboId?: string };
    if (!customerId || !qboId) {
      res.status(400).json({ message: "customerId and qboId are required" });
      return;
    }
    const result = await storage.bindQboCustomer(u.activeCompanyId, customerId, qboId);
    if (result.notFound === "qbo") {
      res.status(404).json({ message: "QuickBooks customer not found in cache for this company" });
      return;
    }
    if (result.notFound === "customer") {
      res.status(404).json({ message: "CRM customer not found for this company" });
      return;
    }
    if (result.conflict) {
      res.status(409).json({ message: "This QuickBooks customer is already bound to another CRM customer" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "POST /api/qbo/customers/bind error");
    res.status(500).json({ message: "Failed to bind customer" });
  }
});

// POST /api/qbo/customers/unbind
router.post("/customers/unbind", async (req, res) => {
  const u = requireAdminOrOffice(req, res);
  if (!u) return;
  if (!(await assertConnected(u.activeCompanyId, res))) return;
  try {
    const { customerId } = req.body as { customerId?: string };
    if (!customerId) {
      res.status(400).json({ message: "customerId is required" });
      return;
    }
    await storage.unbindQboCustomer(u.activeCompanyId, customerId);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "POST /api/qbo/customers/unbind error");
    res.status(500).json({ message: "Failed to unbind customer" });
  }
});

// POST /api/qbo/customers/promote — create a new CRM customer from a QBO cache row
router.post("/customers/promote", async (req, res) => {
  const u = requireAdminOrOffice(req, res);
  if (!u) return;
  if (!(await assertConnected(u.activeCompanyId, res))) return;
  try {
    const { qboId, overrides } = req.body as {
      qboId?: string;
      overrides?: { name?: string; street?: string; city?: string; state?: string; zip?: string };
    };
    if (!qboId) {
      res.status(400).json({ message: "qboId is required" });
      return;
    }
    const result = await storage.promoteQboCustomerToCrm(
      u.activeCompanyId,
      qboId,
      overrides ?? {},
    );
    if ("conflict" in result && result.conflict) {
      res.status(409).json({ message: "This QuickBooks customer is already bound to a CRM customer" });
      return;
    }
    if ("missingFields" in result) {
      res.status(400).json({ message: "Missing required fields", missingFields: result.missingFields });
      return;
    }
    res.json(result);
  } catch (err) {
    logger.error({ err }, "POST /api/qbo/customers/promote error");
    res.status(500).json({ message: "Failed to promote customer" });
  }
});

/** Minimal RFC 4180-style CSV field splitter.
 *  Handles quoted fields containing literal commas and "" as an escaped quote. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) {
      fields.push("");
      break;
    }
    if (line[i] === '"') {
      i++; // skip opening quote
      let field = "";
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (i < line.length && line[i] === ',') i++; // skip delimiter
    } else {
      let field = "";
      while (i < line.length && line[i] !== ',') {
        field += line[i++];
      }
      fields.push(field.trim());
      if (i < line.length) i++; // skip delimiter
    }
  }
  return fields;
}

/** Parse CSV text into {customer_name, quickbooks_id} rows */
function parseSeedCsv(
  text: string,
): { rows: Array<{ customer_name: string; quickbooks_id: string }>; error?: string } {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], error: "CSV must have a header and at least one data row" };
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf("customer_name");
  const idIdx = header.indexOf("quickbooks_id");
  if (nameIdx === -1 || idIdx === -1) {
    return { rows: [], error: "CSV must have customer_name and quickbooks_id columns" };
  }
  const rows: Array<{ customer_name: string; quickbooks_id: string }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const name = cols[nameIdx]?.trim() ?? "";
    const id = cols[idIdx]?.trim() ?? "";
    if (name && id) {
      rows.push({ customer_name: name, quickbooks_id: id });
    }
  }
  return { rows };
}

// POST /api/qbo/customers/import-seed
// Accepts:
//   1. multipart/form-data with a `file` field containing a CSV
//   2. application/json array of {customer_name, quickbooks_id}
//   3. text/csv or text/plain string with header row: customer_name,quickbooks_id
// Scores each row against CRM customers via trigram similarity on customer_name,
// then persists the best-match as a seed suggestion on the cache row.
router.post(
  "/customers/import-seed",
  csvUpload.single("file"),
  async (req, res) => {
    const u = requireAdminOrOffice(req, res);
    if (!u) return;
    if (!(await assertConnected(u.activeCompanyId, res))) return;
    try {
      let rows: Array<{ customer_name: string; quickbooks_id: string }> = [];

      if (req.file) {
        // Case 1: multipart file upload
        const { rows: parsed, error } = parseSeedCsv(req.file.buffer.toString("utf8"));
        if (error) {
          res.status(400).json({ message: error });
          return;
        }
        rows = parsed;
      } else {
        const body = req.body as unknown;
        if (typeof body === "string") {
          // Case 3: text/csv or text/plain string body
          const { rows: parsed, error } = parseSeedCsv(body);
          if (error) {
            res.status(400).json({ message: error });
            return;
          }
          rows = parsed;
        } else if (Array.isArray(body)) {
          // Case 2: JSON array
          rows = body as Array<{ customer_name: string; quickbooks_id: string }>;
        } else {
          res.status(400).json({
            message: "Body must be multipart/form-data with a file field, application/json array, or text/csv",
          });
          return;
        }
      }

      if (rows.length === 0) {
        res.status(400).json({ message: "No rows found in import data" });
        return;
      }

      const results: Array<{
        quickbooks_id: string;
        customer_name: string;
        status: "not_in_cache" | "no_match" | "already_bound" | "seeded";
        matchedCustomerId?: string;
        matchedCustomerName?: string;
      }> = [];

      for (const row of rows) {
        // Verify the QBO cache row exists for this company
        const cacheRow = await storage.getQboCacheRow(u.activeCompanyId, row.quickbooks_id);
        if (!cacheRow) {
          results.push({ quickbooks_id: row.quickbooks_id, customer_name: row.customer_name, status: "not_in_cache" });
          continue;
        }

        // Skip if already seeded (has an existing suggested CRM match)
        if (cacheRow.seedCustomerId) {
          results.push({ quickbooks_id: row.quickbooks_id, customer_name: row.customer_name, status: "already_bound" });
          continue;
        }

        // Score against CRM customers using trigram on customer_name directly
        const bestMatch = await storage.findBestCrmMatchByName(
          u.activeCompanyId,
          row.customer_name,
        );

        if (!bestMatch || bestMatch.score < 0.1) {
          results.push({ quickbooks_id: row.quickbooks_id, customer_name: row.customer_name, status: "no_match" });
          continue;
        }

        await storage.writeSeedSuggestion(
          u.activeCompanyId,
          row.quickbooks_id,
          bestMatch.customerId,
          "irrigopro",
        );
        results.push({
          quickbooks_id: row.quickbooks_id,
          customer_name: row.customer_name,
          status: "seeded",
          matchedCustomerId: bestMatch.customerId,
          matchedCustomerName: bestMatch.customerName,
        });
      }

      res.json({ results });
    } catch (err) {
      logger.error({ err }, "POST /api/qbo/customers/import-seed error");
      res.status(500).json({ message: "Failed to process import seed" });
    }
  },
);

export default router;
