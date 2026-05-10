import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LEGACY_CHEMICAL_TEMPLATE_NAMES } from '@workspace/db';

interface MockResponse { rows: unknown[]; rowCount?: number }

const responseQueue: MockResponse[] = [];
let executeCalls = 0;
const executedSql: string[] = [];

vi.mock('../db', () => ({
  db: {
    execute: vi.fn(async (q: unknown): Promise<MockResponse> => {
      executeCalls += 1;
      try {
        const s = (q as { queryChunks?: unknown[] }).queryChunks
          ? JSON.stringify((q as { queryChunks: unknown[] }).queryChunks)
          : String(q);
        executedSql.push(s);
      } catch { /* ignore */ }
      return responseQueue.shift() ?? { rows: [] };
    }),
  },
}));

async function loadFreshModule() {
  vi.resetModules();
  responseQueue.length = 0;
  executeCalls = 0;
  executedSql.length = 0;
  return await import('./legacyChemEmailCleanup');
}

describe('migrateRemoveChemicalEmailTemplates', () => {
  beforeEach(async () => {
    responseQueue.length = 0;
    executeCalls = 0;
    executedSql.length = 0;
  });

  it('runs the cleanup on first invocation and reports per-company removed counts', async () => {
    const { migrateRemoveChemicalEmailTemplates } = await loadFreshModule();
    // Call order:
    //   1. CREATE TABLE          → ensureTrackingTable
    //   2. SELECT 1              → alreadyApplied (empty)
    //   3. SELECT template_id    → captured legacy templates (2 ids)
    //   4. DELETE email_rules    → 3 removed
    //   5. UPDATE email_logs     → detach FKs
    //   6. DELETE email_templates → 2 removed
    //   7. INSERT tracking
    responseQueue.push(
      { rows: [] },
      { rows: [] },
      { rows: [{ template_id: 't-1' }, { template_id: 't-2' }] },
      { rows: [], rowCount: 3 },
      { rows: [] },
      { rows: [], rowCount: 2 },
      { rows: [] },
    );
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await migrateRemoveChemicalEmailTemplates('co-A');

    expect(result).toEqual({ removedRules: 3, removedTemplates: 2, skipped: false });
    expect(executeCalls).toBe(7);
    const logged = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(logged).toContain('[chem-notif legacy cleanup]');
    expect(logged).toContain('company=co-A');
    expect(logged).toContain('removed 3 rules, 2 templates');
    logSpy.mockRestore();
  });

  it('is idempotent: a second invocation for the same company is a no-op', async () => {
    const { migrateRemoveChemicalEmailTemplates } = await loadFreshModule();
    responseQueue.push(
      { rows: [] }, { rows: [] },
      { rows: [{ template_id: 't-1' }] },
      { rows: [], rowCount: 1 }, { rows: [] }, { rows: [], rowCount: 1 }, { rows: [] },
    );
    await migrateRemoveChemicalEmailTemplates('co-B');
    const callsAfterFirst = executeCalls;

    responseQueue.push({ rows: [{ exists: 1 }] });
    const result = await migrateRemoveChemicalEmailTemplates('co-B');

    expect(result).toEqual({ removedRules: 0, removedTemplates: 0, skipped: true });
    expect(executeCalls - callsAfterFirst).toBe(1);
  });

  it('skips the templates DELETE when no legacy rules captured any templateIds', async () => {
    const { migrateRemoveChemicalEmailTemplates } = await loadFreshModule();
    responseQueue.push(
      { rows: [] }, { rows: [] },
      { rows: [] },                  // captured: empty
      { rows: [], rowCount: 0 },     // delete rules: nothing
      { rows: [] },                  // insert tracking
    );
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await migrateRemoveChemicalEmailTemplates('co-C');

    expect(result).toEqual({ removedRules: 0, removedTemplates: 0, skipped: false });
    expect(executeCalls).toBe(5);
    const logged = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(logged).toContain('removed 0 rules, 0 templates');
    logSpy.mockRestore();
  });

  it('scopes every DELETE/UPDATE to companyId (no cross-company touch)', async () => {
    const { migrateRemoveChemicalEmailTemplates } = await loadFreshModule();
    responseQueue.push(
      { rows: [] }, { rows: [] },
      { rows: [{ template_id: 't-1' }] },
      { rows: [], rowCount: 1 },
      { rows: [] },
      { rows: [], rowCount: 1 },
      { rows: [] },
    );
    await migrateRemoveChemicalEmailTemplates('co-D');
    // Every captured SQL chunk involving DELETE or UPDATE on email_*
    // tables must reference the company_id binding.
    const dml = executedSql.filter(s => /DELETE|UPDATE/i.test(s) && /email_(rules|logs|templates)/i.test(s));
    expect(dml.length).toBeGreaterThanOrEqual(3);
    for (const s of dml) {
      expect(s).toMatch(/company_id/);
    }
  });

  it('only deletes templates whose name is in the seeded legacy list', async () => {
    const { migrateRemoveChemicalEmailTemplates } = await loadFreshModule();
    responseQueue.push(
      { rows: [] }, { rows: [] },
      { rows: [{ template_id: 't-1' }] },
      { rows: [], rowCount: 1 },
      { rows: [] },
      { rows: [], rowCount: 0 },
      { rows: [] },
    );
    await migrateRemoveChemicalEmailTemplates('co-E');
    const templateDelete = executedSql.find(s => /DELETE/i.test(s) && /email_templates/i.test(s));
    expect(templateDelete).toBeDefined();
    for (const name of LEGACY_CHEMICAL_TEMPLATE_NAMES) {
      expect(templateDelete!).toContain(name);
    }
  });
});
