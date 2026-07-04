"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { deleteHistoryItem, getHistory } from "@/lib/api";

export const HISTORY_QUERY_KEY = ["history"] as const;

/**
 * The signed-in user's recent searches. Disabled while signed out so the
 * panel never fires an unauthenticated request.
 */
export function useHistory(isSignedIn: boolean) {
  return useQuery({
    queryKey: HISTORY_QUERY_KEY,
    queryFn: getHistory,
    enabled: isSignedIn,
  });
}

/** Delete a history entry; refreshes the panel on success. */
export function useDeleteHistoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteHistoryItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY }),
  });
}
