import { sql } from "drizzle-orm";
import { db, type AppTransaction } from "../db";

export async function allocateCrewWorksheetNumber(companyId: string, year: number, conn: typeof db | AppTransaction = db) {
  const { rows } = await conn.execute<{ last_number: number }>(sql`
    INSERT INTO crew_worksheet_number_counters (company_id, year, last_number)
    VALUES (${companyId}, ${year}, 1)
    ON CONFLICT (company_id, year)
    DO UPDATE SET last_number = crew_worksheet_number_counters.last_number + 1
    RETURNING last_number
  `);
  return `CW-${year}-${String(rows[0].last_number).padStart(4, "0")}`;
}
