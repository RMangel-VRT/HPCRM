import { sql } from "drizzle-orm";
import { db } from "../db";

type DrizzleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Database = typeof db | DrizzleTransaction;

type TicketTypeRow = {
  id: string;
  name: string;
  typeKey: string | null;
};

export interface ExtraBillableConversionCounts {
  companies: number;
  types: number;
  tickets: number;
  conflicts: number;
}

export interface ConvertExtraBillableToTaskOptions {
  /** Limits conversion scope, primarily useful for transaction-isolated tests. */
  companyIds?: readonly string[];
}

const REQUIRED_COLUMNS: ReadonlyArray<[string, string]> = [
  ["companies", "id"],
  ["ticket_types", "id"],
  ["ticket_types", "company_id"],
  ["ticket_types", "name"],
  ["ticket_types", "description"],
  ["ticket_types", "type_key"],
  ["ticket_types", "requires_customer"],
  ["ticket_types", "requires_scheduling"],
  ["ticket_types", "requires_completion"],
  ["ticket_types", "requires_invoicing"],
  ["ticket_types", "terminal_behavior"],
  ["tickets", "company_id"],
  ["tickets", "ticket_type_id"],
  ["tickets", "work_type"],
  ["tickets", "billing_behavior"],
];

async function findMissingRequiredColumns(database: Database): Promise<string[]> {
  const requiredValues = sql.join(
    REQUIRED_COLUMNS.map(([tableName, columnName]) =>
      sql`(${tableName}, ${columnName})`,
    ),
    sql`, `,
  );
  const result = await database.execute(sql`
    SELECT required.table_name, required.column_name
    FROM (VALUES ${requiredValues}) AS required(table_name, column_name)
    LEFT JOIN information_schema.columns AS actual
      ON actual.table_schema = current_schema()
      AND actual.table_name = required.table_name
      AND actual.column_name = required.column_name
    WHERE actual.column_name IS NULL
  `);
  const missing = result.rows as Array<{ table_name: string; column_name: string }>;
  return missing.map(({ table_name, column_name }) => `${table_name}.${column_name}`);
}

/**
 * Idempotently renames each company's seeded Extra Billable type to Task.
 * This performs DML only. It changes the two billing classification fields on
 * all existing tickets that use the selected legacy type, without changing
 * their status, custom fields, history, or dates. Passing a transaction is
 * supported so callers/tests can contain the operation in an outer transaction.
 */
export async function convertExtraBillableToTask(
  database: Database = db,
  options: ConvertExtraBillableToTaskOptions = {},
): Promise<ExtraBillableConversionCounts> {
  try {
    const missingColumns = await findMissingRequiredColumns(database);
    if (missingColumns.length) {
      console.warn(
        `[convertExtraBillableToTask] Skipped: required database columns are missing: ${missingColumns.join(", ")}`,
      );
      const emptyCounts: ExtraBillableConversionCounts = {
        companies: 0,
        types: 0,
        tickets: 0,
        conflicts: 0,
      };
      console.info(
        `[convertExtraBillableToTask] companies=0 types=0 tickets=0 conflicts=0`,
      );
      return emptyCounts;
    }
    const candidates = await database.execute(sql`
      SELECT DISTINCT company_id AS "companyId"
      FROM ticket_types
      WHERE (type_key = 'extra_billable'
         OR (type_key IS NULL AND name = 'Extra Billable'))
      ${options.companyIds
        ? options.companyIds.length
          ? sql`AND company_id IN (${sql.join(options.companyIds.map((id) => sql`${id}`), sql`, `)})`
          : sql`AND FALSE`
        : sql``}
      ORDER BY company_id
    `);
    const companyIds = (candidates.rows as Array<{ companyId: string }>)
      .map(({ companyId }) => companyId);

    const counts: ExtraBillableConversionCounts = {
      companies: 0,
      types: 0,
      tickets: 0,
      conflicts: 0,
    };

    for (const companyId of companyIds) {
      const companyCounts = await database.transaction(async (transaction) => {
        // Serializes concurrent startup conversions for the same company.
        const lockedCompany = await transaction.execute(sql`
          SELECT id FROM companies WHERE id = ${companyId} FOR UPDATE
        `);
        if (!lockedCompany.rows.length) {
          return { typeChanged: false, ticketCount: 0, conflict: false };
        }

        // Re-read only after obtaining the company lock. A competing startup
        // may have completed the conversion while this process was waiting.
        const typeResult = await transaction.execute(sql`
          SELECT id, name, type_key AS "typeKey"
          FROM ticket_types
          WHERE company_id = ${companyId}
        `);
        const types = typeResult.rows as TicketTypeRow[];
        const taskType = types.find((type) => type.typeKey === "task")
          ?? types.find((type) => type.typeKey === null && type.name === "Task");
        const extraBillableType = types.find((type) => type.typeKey === "extra_billable")
          ?? types.find((type) => type.typeKey === null && type.name === "Extra Billable");

        // A company is only considered while a legacy type exists. Do not
        // revisit a converted Task (or an unrelated custom Task) on later boots.
        if (!extraBillableType) {
          return { typeChanged: false, ticketCount: 0, conflict: false };
        }
        if (taskType) {
          return { typeChanged: false, ticketCount: 0, conflict: true };
        }
        const selectedType = extraBillableType;

        const updatedType = await transaction.execute(sql`
          UPDATE ticket_types
          SET name = 'Task',
              type_key = 'task',
              description = 'Used for contract and billable field work.',
              requires_customer = 'true',
              requires_scheduling = 'true',
              requires_completion = 'true',
              requires_invoicing = 'false',
              terminal_behavior = 'close'
          WHERE id = ${selectedType.id}
            AND company_id = ${companyId}
          RETURNING id
        `);
        if (!updatedType.rows.length) {
          return { typeChanged: false, ticketCount: 0, conflict: false };
        }

        const updatedTickets = await transaction.execute(sql`
          UPDATE tickets AS ticket
          SET work_type = 'extra_work',
              billing_behavior = 'invoice_required'
          WHERE ticket.company_id = ${companyId}
            AND ticket.ticket_type_id = ${selectedType.id}
          RETURNING ticket.id
        `);
        return {
          typeChanged: true,
          ticketCount: updatedTickets.rows.length,
          conflict: false,
        };
      });

      counts.companies += 1;
      if (companyCounts.typeChanged) counts.types += 1;
      counts.tickets += companyCounts.ticketCount;
      if (companyCounts.conflict) {
        counts.conflicts += 1;
        console.warn(
          `[convertExtraBillableToTask] Skipped company ${companyId}: both Extra Billable and Task ticket types exist.`,
        );
      }
    }

    console.info(
      `[convertExtraBillableToTask] companies=${counts.companies} types=${counts.types} tickets=${counts.tickets} conflicts=${counts.conflicts}`,
    );
    return counts;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Extra Billable to Task conversion failed: ${message}`, { cause: error });
  }
}