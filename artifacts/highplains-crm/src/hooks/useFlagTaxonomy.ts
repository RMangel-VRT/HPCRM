import { useQuery } from "@tanstack/react-query";
import {
  FLAG_STATUSES as LOCAL_STATUSES,
  FLAG_TAGS as LOCAL_TAGS,
  type FlagStatus,
  type FlagTag,
} from "@shared/schema";

// Single runtime authority for flag tag/status taxonomy is
// lib/db/src/flag-tags.ts (server). The CRM hydrates the same list at runtime
// from GET /api/flag-tags so the office can roll out a new tag without
// shipping a new web bundle. The local copy in @shared/schema is a
// compile-time fallback only — it keeps the page typed/usable while the
// hydrate request is in flight or if it fails.
type ServerTag = { value: string; label: string; color: string };
type Resp = { tags: ServerTag[]; statuses: readonly string[]; noteMaxLength: number };

export function useFlagTaxonomy(): {
  tags: readonly { value: FlagTag; label: string; color: string }[];
  statuses: readonly FlagStatus[];
  noteMaxLength: number;
} {
  const { data } = useQuery<Resp>({
    queryKey: ["/api/flag-tags"],
    staleTime: 5 * 60_000,
  });
  const tags =
    data?.tags && data.tags.length > 0
      ? (data.tags as readonly { value: FlagTag; label: string; color: string }[])
      : LOCAL_TAGS;
  const statuses =
    data?.statuses && data.statuses.length > 0
      ? (data.statuses as readonly FlagStatus[])
      : LOCAL_STATUSES;
  return { tags, statuses, noteMaxLength: data?.noteMaxLength ?? 280 };
}

export function tagMetaFromList(
  tag: string,
  list: readonly { value: string; label: string; color: string }[],
): { value: string; label: string; color: string } {
  return list.find((t) => t.value === tag) ?? { label: tag.replace(/_/g, " "), color: "#6b7280", value: tag };
}
