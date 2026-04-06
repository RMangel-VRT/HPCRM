export type AuditFlag =
  | "missing_month"
  | "zero_value_active_row"
  | "annual_total_mismatch"
  | "duplicate_service_line"
  | "inconsistent_monthly_values"
  | "populated_outside_contract_term";

export type AuditStatus = "Complete" | "Needs Review" | "Incomplete" | "Error";

export interface ContractAuditRow {
  contractId: string;
  customerId: string;
  propertyName: string;
  serviceType: string;
  contractStatus: "active" | "paused" | "ended";
  billingPattern: string;
  contractTermStart: string;
  contractTermEnd: string | null;
  expectedActiveMonths: number[];
  actualPopulatedMonths: number[];
  monthlyValues: (number | null)[];
  annualTotalStored: number;
  annualTotalCalculated: number;
  missingMonthCount: number;
  unexpectedPopulatedMonthCount: number;
  auditStatus: AuditStatus;
  auditFlags: AuditFlag[];
}

export interface ContractAuditResponse {
  year: number;
  rows: ContractAuditRow[];
}
