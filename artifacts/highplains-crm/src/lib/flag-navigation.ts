import { FLAG_STATUSES, type FlagStatus } from "@shared/schema";

export function flagStatusFromSearch(search: string): FlagStatus | "all" {
  const value = new URLSearchParams(search).get("status");
  return value === "all" ? "all" : FLAG_STATUSES.includes(value as FlagStatus) ? value as FlagStatus : "new";
}

export function flagStatusHref(search: string, status: FlagStatus | "all") {
  const params = new URLSearchParams(search);
  params.set("status", status);
  return `/dashboard/flags?${params}`;
}
