import type { Express, Request, Response } from "express";
import type { UserWithContext } from "../auth";
import { receiveAuditUpload, parseAuditFiles } from "../lib/contractAuditFiles";
import { loadAuditData } from "../lib/contractAuditData";
import { planAuditImport, auditReport } from "../lib/contractAuditPlan";
import { executeAuditImport } from "../lib/contractAuditExecution";
import { auditBatches, streamAuditExport } from "../lib/contractAuditExport";

export function auditSize(value: unknown) {
  const text = value === undefined ? "10" : value;
  if (typeof text !== "string" || !/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 50)
    throw new Error("Size must be an integer from 1 to 50");
  return Number(text);
}
export function registerContractAudit(app: Express, authorize: (req: Request, res: Response) => UserWithContext | null) {
  app.get("/api/admin/contract-center/audit-export/batches", async (req, res) => {
    const user = authorize(req, res); if (!user) return;
    let size: number;
    try { size = auditSize(req.query.size); }
    catch (e) { res.status(400).json({ message: (e as Error).message }); return; }
    const batches = auditBatches(await loadAuditData(user.activeCompanyId), size);
    res.json(batches.map(({ customerIds: _ids, ...row }) => row));
  });
  app.get("/api/admin/contract-center/audit-export", async (req, res) => {
    const user = authorize(req, res); if (!user) return;
    let size: number;
    try { size = auditSize(req.query.size); }
    catch (e) { res.status(400).json({ message: (e as Error).message }); return; }
    if (typeof req.query.batch !== "string" || !/^[1-9]\d*$/.test(req.query.batch) ||
      !Number.isSafeInteger(Number(req.query.batch))) {
      res.status(400).json({ message: "Batch must be a one-based integer" }); return;
    }
    if (req.query.documents !== undefined && !["true", "false"].includes(req.query.documents as string)) {
      res.status(400).json({ message: "Documents must be true or false" }); return;
    }
    await streamAuditExport(res, await loadAuditData(user.activeCompanyId), Number(req.query.batch), size,
      req.query.documents !== "false", process.env.APP_VERSION ?? "0.0.0");
  });
  app.post("/api/admin/contract-center/import", async (req, res) => {
    const user = authorize(req, res); if (!user) return;
    if (req.query.dryRun !== undefined && !["true", "false"].includes(req.query.dryRun as string)) {
      res.status(400).json({ message: "dryRun must be true or false" }); return;
    }
    const dryRun = req.query.dryRun !== "false";
    let files;
    try { files = await parseAuditFiles(await receiveAuditUpload(req)); }
    catch (e) { res.status(400).json({ message: (e as Error).message }); return; }
    // Parsing errors are returned in the same structured Preview envelope.
    const plan = planAuditImport(files, await loadAuditData(user.activeCompanyId));
    if (dryRun || plan.errors.length) { res.json(auditReport(plan, dryRun)); return; }
    res.json(await executeAuditImport(files, user.activeCompanyId, user.id));
  });
}
