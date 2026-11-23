/** Fixed planning streams. The final two account choices are not planning streams. */
export const REVENUE_STREAMS = ["contract", "snow", "irrigation", "projects", "extra"] as const;
export const INCOME_ACCOUNT_STREAMS = [...REVENUE_STREAMS, "other", "exclude"] as const;

export type RevenueStream = (typeof REVENUE_STREAMS)[number];
export type IncomeAccountStream = (typeof INCOME_ACCOUNT_STREAMS)[number];
