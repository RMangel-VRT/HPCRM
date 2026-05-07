import { eq } from "drizzle-orm";
import { db as defaultDb } from "./db";
import { contracts, contractMonthlyAmounts, customers } from "@shared/schema";
import type { ContractAuditRow, AuditFlag, AuditStatus } from "@shared/auditTypes";

type DbInstance = typeof defaultDb;

function isoDateStr(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().split("T")[0];
}

function getExpectedActiveMonths(
  year: number,
  startDate: Date,
  endDate: Date | null
): number[] {
  const active: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const monthStart = new Date(Date.UTC(year, m - 1, 1));
    const monthEnd = new Date(Date.UTC(year, m, 0));

    const contractStart = new Date(
      Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
    );
    const contractEnd = endDate
      ? new Date(
          Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate())
        )
      : null;

    const startsBeforeMonthEnd = contractStart <= monthEnd;
    const endsAfterMonthStart = contractEnd === null || contractEnd >= monthStart;

    if (startsBeforeMonthEnd && endsAfterMonthStart) {
      active.push(m);
    }
  }
  return active;
}

function contractOverlapsYear(
  year: number,
  startDate: Date,
  endDate: Date | null
): boolean {
  return getExpectedActiveMonths(year, startDate, endDate).length > 0;
}

function deriveAuditStatus(flags: AuditFlag[]): AuditStatus {
  if (flags.includes("unknown_billing_pattern")) return "Error";
  if (flags.includes("missing_month") || flags.includes("zero_value_active_row")) return "Incomplete";
  if (
    flags.includes("annual_total_mismatch") ||
    flags.includes("inconsistent_monthly_values") ||
    flags.includes("populated_outside_contract_term") ||
    flags.includes("duplicate_service_line")
  ) {
    return "Needs Review";
  }
  return "Complete";
}

export async function buildContractAuditRows(
  companyId: string,
  year: number,
  dbInstance: DbInstance = defaultDb
): Promise<ContractAuditRow[]> {
  const [allCustomers, allContracts, allAmounts] = await Promise.all([
    dbInstance.select().from(customers).where(eq(customers.companyId, companyId)),
    dbInstance.select().from(contracts).where(eq(contracts.companyId, companyId)),
    dbInstance.select().from(contractMonthlyAmounts).where(eq(contractMonthlyAmounts.companyId, companyId)),
  ]);

  const customerMap = new Map(allCustomers.map((c) => [c.id, c]));

  const amountsByContract = new Map<string, typeof allAmounts>();
  for (const amt of allAmounts) {
    if (!amountsByContract.has(amt.contractId)) {
      amountsByContract.set(amt.contractId, []);
    }
    amountsByContract.get(amt.contractId)!.push(amt);
  }

  const serviceLineKey = (customerId: string, serviceType: string) =>
    `${customerId}::${serviceType}`;

  const serviceLineContractIds = new Map<string, string[]>();
  for (const contract of allContracts) {
    if (!contractOverlapsYear(year, contract.startDate, contract.endDate ?? null)) continue;
    const key = serviceLineKey(contract.customerId, contract.serviceType);
    if (!serviceLineContractIds.has(key)) serviceLineContractIds.set(key, []);
    serviceLineContractIds.get(key)!.push(contract.id);
  }

  const duplicateServiceLineIds = new Set<string>();
  for (const ids of Array.from(serviceLineContractIds.values())) {
    if (ids.length > 1) {
      for (const id of ids) duplicateServiceLineIds.add(id);
    }
  }

  const yearContracts = allContracts.filter((c) =>
    contractOverlapsYear(year, c.startDate, c.endDate ?? null)
  );

  const rows: ContractAuditRow[] = [];

  for (const contract of yearContracts) {
    const customer = customerMap.get(contract.customerId);
    if (!customer) continue;

    const amounts = amountsByContract.get(contract.id) ?? [];

    const amountByMonth = new Map<number, number>();
    for (const amt of amounts) {
      amountByMonth.set(amt.month, amt.amount);
    }

    const billingPattern = contract.billingPattern ?? null;
    const flags: AuditFlag[] = [];

    if (!billingPattern || !["monthly", "seasonal", "12-of-12"].includes(billingPattern)) {
      flags.push("unknown_billing_pattern");
    }

    const contractTermStart = contract.startDate;
    const contractTermEnd = contract.endDate ?? null;

    const expectedActiveMonths = getExpectedActiveMonths(year, contractTermStart, contractTermEnd);

    const monthlyValues: (number | null)[] = [];
    const actualPopulatedMonths: number[] = [];
    let annualTotalStored = 0;
    let annualTotalCalculated = 0;

    for (let m = 1; m <= 12; m++) {
      const raw = amountByMonth.get(m);
      if (raw != null) {
        const dollars = raw / 100;
        monthlyValues.push(dollars);
        annualTotalStored += dollars;
        if (raw > 0) {
          actualPopulatedMonths.push(m);
        }
      } else {
        monthlyValues.push(null);
      }
    }

    for (const m of expectedActiveMonths) {
      const val = monthlyValues[m - 1];
      if (val != null) {
        annualTotalCalculated += val;
      }
    }

    const missingMonthCount = expectedActiveMonths.filter(
      (m) => monthlyValues[m - 1] == null
    ).length;

    const unexpectedPopulatedMonthCount = actualPopulatedMonths.filter(
      (m) => !expectedActiveMonths.includes(m)
    ).length;

    if (missingMonthCount > 0 && !flags.includes("unknown_billing_pattern")) {
      flags.push("missing_month");
    }

    for (const m of expectedActiveMonths) {
      const raw = amountByMonth.get(m);
      if (raw != null && raw === 0) {
        flags.push("zero_value_active_row");
        break;
      }
    }

    if (unexpectedPopulatedMonthCount > 0) {
      flags.push("populated_outside_contract_term");
    }

    if (Math.abs(annualTotalStored - annualTotalCalculated) > 0.01) {
      flags.push("annual_total_mismatch");
    }

    const inTermValues = expectedActiveMonths
      .map((m) => monthlyValues[m - 1])
      .filter((v): v is number => v != null && v > 0);
    if (inTermValues.length > 1 && billingPattern === "monthly") {
      const firstVal = inTermValues[0];
      const allSame = inTermValues.every((v) => Math.abs(v - firstVal) < 0.01);
      if (!allSame) {
        flags.push("inconsistent_monthly_values");
      }
    }

    if (duplicateServiceLineIds.has(contract.id)) {
      flags.push("duplicate_service_line");
    }

    const auditStatus = deriveAuditStatus(flags);

    rows.push({
      contractId: contract.id,
      customerId: contract.customerId,
      propertyName: customer.name,
      serviceType: contract.serviceType,
      contractStatus: contract.status,
      billingPattern,
      contractTermStart: isoDateStr(contractTermStart),
      contractTermEnd: isoDateStr(contractTermEnd),
      expectedActiveMonths,
      actualPopulatedMonths,
      monthlyValues,
      annualTotalStored,
      annualTotalCalculated,
      missingMonthCount,
      unexpectedPopulatedMonthCount,
      auditStatus,
      auditFlags: Array.from(new Set(flags)),
    });
  }

  return rows;
}
