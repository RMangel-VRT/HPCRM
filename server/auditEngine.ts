import { eq } from "drizzle-orm";
import { db } from "./db";
import { contracts, contractMonthlyAmounts, customers } from "@shared/schema";
import type { ContractAuditRow, AuditFlag, AuditStatus } from "@shared/auditTypes";

function getExpectedActiveMonths(
  year: number,
  startDate: Date,
  endDate: Date | null,
  billingPattern: string
): number[] {
  const months: number[] = [];

  for (let m = 1; m <= 12; m++) {
    const monthStart = new Date(Date.UTC(year, m - 1, 1));
    const monthEnd = new Date(Date.UTC(year, m, 0));

    if (monthEnd < startDate) continue;
    if (endDate && monthStart > endDate) continue;

    if (billingPattern === "monthly" || billingPattern === "12-of-12") {
      months.push(m);
    } else if (billingPattern === "seasonal") {
      months.push(m);
    } else {
      months.push(m);
    }
  }

  return months;
}

export async function buildContractAuditRows(
  companyId: string,
  year: number
): Promise<ContractAuditRow[]> {
  const [allContracts, allAmounts, allCustomers] = await Promise.all([
    db.select().from(contracts).where(eq(contracts.companyId, companyId)),
    db.select().from(contractMonthlyAmounts).where(eq(contractMonthlyAmounts.companyId, companyId)),
    db.select().from(customers).where(eq(customers.companyId, companyId)),
  ]);

  const customerMap = new Map(allCustomers.map((c) => [c.id, c]));

  const amountsByContract = new Map<string, typeof allAmounts>();
  for (const amt of allAmounts) {
    if (!amountsByContract.has(amt.contractId)) amountsByContract.set(amt.contractId, []);
    amountsByContract.get(amt.contractId)!.push(amt);
  }

  const serviceLineKey = (customerId: string, serviceType: string) => `${customerId}::${serviceType}`;
  const serviceLineCounts = new Map<string, number>();
  for (const contract of allContracts) {
    const key = serviceLineKey(contract.customerId, contract.serviceType);
    serviceLineCounts.set(key, (serviceLineCounts.get(key) ?? 0) + 1);
  }

  const rows: ContractAuditRow[] = [];

  for (const contract of allContracts) {
    const customer = customerMap.get(contract.customerId);
    if (!customer) continue;

    const startDate = new Date(contract.startDate);
    const endDate = contract.endDate ? new Date(contract.endDate) : null;

    const contractStartYear = startDate.getUTCFullYear();
    const contractEndYear = endDate ? endDate.getUTCFullYear() : null;

    if (contractStartYear > year) continue;
    if (contractEndYear && contractEndYear < year) continue;

    const expectedActiveMonths = getExpectedActiveMonths(
      year,
      startDate,
      endDate,
      contract.billingPattern
    );

    const amounts = amountsByContract.get(contract.id) ?? [];

    const monthlyValues: (number | null)[] = new Array(12).fill(null);
    for (const amt of amounts) {
      if (amt.month >= 1 && amt.month <= 12 && amt.amount > 0) {
        monthlyValues[amt.month - 1] = amt.amount / 100;
      }
    }

    const actualPopulatedMonths: number[] = [];
    for (let m = 1; m <= 12; m++) {
      if (monthlyValues[m - 1] !== null && monthlyValues[m - 1]! > 0) {
        actualPopulatedMonths.push(m);
      }
    }

    const annualTotalStored = amounts.reduce((sum, a) => sum + a.amount, 0) / 100;

    const annualTotalCalculated = expectedActiveMonths.reduce((sum, m) => {
      const val = monthlyValues[m - 1];
      return sum + (val ?? 0);
    }, 0);

    const missingMonthCount = expectedActiveMonths.filter(
      (m) => !actualPopulatedMonths.includes(m)
    ).length;

    const unexpectedPopulatedMonthCount = actualPopulatedMonths.filter(
      (m) => !expectedActiveMonths.includes(m)
    ).length;

    const flags: AuditFlag[] = [];

    if (missingMonthCount > 0) {
      flags.push("missing_month");
    }

    const allZero =
      actualPopulatedMonths.length === 0 && expectedActiveMonths.length > 0;
    if (allZero) {
      flags.push("zero_value_active_row");
    }

    if (
      Math.abs(annualTotalStored - annualTotalCalculated) > 0.01 &&
      expectedActiveMonths.length > 0
    ) {
      flags.push("annual_total_mismatch");
    }

    const key = serviceLineKey(contract.customerId, contract.serviceType);
    if ((serviceLineCounts.get(key) ?? 0) > 1) {
      flags.push("duplicate_service_line");
    }

    if (unexpectedPopulatedMonthCount > 0) {
      flags.push("populated_outside_contract_term");
    }

    const populatedValues = expectedActiveMonths
      .map((m) => monthlyValues[m - 1])
      .filter((v) => v !== null && v > 0) as number[];
    if (populatedValues.length > 1) {
      const avg = populatedValues.reduce((a, b) => a + b, 0) / populatedValues.length;
      const hasInconsistency = populatedValues.some((v) => Math.abs(v - avg) > avg * 0.5);
      if (hasInconsistency) {
        flags.push("inconsistent_monthly_values");
      }
    }

    let auditStatus: AuditStatus;
    if (flags.length === 0) {
      auditStatus = "Complete";
    } else if (flags.includes("zero_value_active_row") || flags.includes("duplicate_service_line")) {
      auditStatus = "Error";
    } else if (missingMonthCount > 0) {
      auditStatus = "Incomplete";
    } else {
      auditStatus = "Needs Review";
    }

    rows.push({
      contractId: contract.id,
      customerId: contract.customerId,
      propertyName: customer.name,
      serviceType: contract.serviceType,
      contractStatus: contract.status,
      billingPattern: contract.billingPattern,
      contractTermStart: startDate.toISOString(),
      contractTermEnd: endDate ? endDate.toISOString() : null,
      expectedActiveMonths,
      actualPopulatedMonths,
      monthlyValues,
      annualTotalStored,
      annualTotalCalculated,
      missingMonthCount,
      unexpectedPopulatedMonthCount,
      auditStatus,
      auditFlags: flags,
    });
  }

  return rows;
}
