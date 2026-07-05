"use client";

import { Button } from "@weather-app/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@weather-app/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@weather-app/ui/components/empty";
import { Skeleton } from "@weather-app/ui/components/skeleton";
import { History, Trash2 } from "lucide-react";

import { AuthDrawer } from "@/components/auth/auth-drawer";
import { useDeleteHistoryItem, useHistory } from "@/hooks/use-history";
import { useSearch } from "@/hooks/use-search";
import type { HistoryItem } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

function locationLabel(item: HistoryItem): string {
  return [item.resolvedName, item.state, item.country].filter(Boolean).join(", ");
}

export interface SearchHistoryProps {
  /**
   * Server-derived session state (see page.tsx). Passed down rather than read
   * from authClient.useSession() so SSR and hydration agree deterministically.
   */
  isSignedIn: boolean;
}

export function SearchHistory({ isSignedIn }: SearchHistoryProps) {
  // Clicking a row re-runs that search (fills the bar, opens the dialog).
  const { submitSearch } = useSearch();
  const history = useHistory(isSignedIn);
  const deleteItem = useDeleteHistoryItem();

  if (!isSignedIn) {
    // Signed out: same placeholder treatment as the favourites board (and no
    // history fetch). The link-style button opens the auth drawer instead of
    // a /login page.
    return (
      <Empty className="border border-dashed" data-testid="history-signed-out">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Recent searches</EmptyTitle>
          <EmptyDescription>
            <AuthDrawer
              trigger={
                <button
                  type="button"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Sign in to keep your search history
                </button>
              }
            />
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  let content: React.ReactNode;
  if (history.isPending) {
    content = (
      <div className="flex flex-col gap-2" data-testid="history-loading">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  } else if (history.isError) {
    content = (
      <div className="flex flex-col items-start gap-2" data-testid="history-error">
        <p className="text-muted-foreground text-sm">Couldn’t load your search history.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => history.refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if (history.data.length === 0) {
    content = (
      <p className="text-muted-foreground text-sm" data-testid="history-empty">
        Your searches will appear here.
      </p>
    );
  } else {
    content = (
      <ul className="flex flex-col divide-y" data-testid="history-list">
        {history.data.map((item) => (
          <li key={item.id} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => submitSearch(item.resolvedName)}
              className="flex min-w-0 flex-1 items-baseline justify-between gap-2 py-2 text-left text-sm hover:text-foreground"
            >
              <span className="truncate">{locationLabel(item)}</span>
              <span className="shrink-0 text-muted-foreground text-xs">
                {formatRelativeTime(item.createdAt)}
              </span>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${item.resolvedName} from history`}
              disabled={deleteItem.isPending}
              onClick={() => deleteItem.mutate(item.id)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card data-testid="search-history">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History aria-hidden="true" className="size-4" />
          Recent searches
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
