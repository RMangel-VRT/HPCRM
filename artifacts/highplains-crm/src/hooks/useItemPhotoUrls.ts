import { useQuery } from "@tanstack/react-query";

export interface PhotoUrl {
  storageKey: string;
  signedUrl: string | null;
  expiresAt: string | null;
}

/**
 * Loads signed URLs for the photos on a given Extra-Billable campaign item.
 * Signed URLs expire after 7 days; React Query handles refetch when the user
 * opens the property sheet again.
 */
export function useItemPhotoUrls(campaignId: string, itemId: string | null, enabled = true) {
  return useQuery<PhotoUrl[]>({
    queryKey: ["/api/campaigns", campaignId, "items", itemId, "photo-urls"],
    enabled: enabled && Boolean(itemId),
  });
}
