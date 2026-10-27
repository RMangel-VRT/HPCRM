/** Shared pulse contract, independent of any individual dashboard display. */
export interface PulseResponse {
  stats: { customersCount: number; activeContractsCount: number; monthlyRevenue: number; ytdRevenue: number };
  revenue: { year: number; months: number[]; priorYear: number; priorMonths: number[] };
  unbilledTicketCount: number;
  avgDaysCloseToInvoice: number | null;
  activeSeason: { id: string; name: string; startDate: string | null; endDate: string | null } | null;
  nextSeason: { id: string; name: string; startDate: string | null } | null;
  snowBook: { activeSnowContracts: number; expiringBeforeSeasonStart: number };
  renewals: Array<{
    agreementId: string; customerId: string; customerName: string;
    line: "landscape" | "snow" | "both"; termId: string; seasonLabel: string;
    renewalDraftStatus: "draft" | "sent" | null; endDate: string; daysLeft: number;
  }>;
  crewsToday: Array<{ crewId: string; crewName: string; stops: number; complete: number; flagged: number }>;
}
