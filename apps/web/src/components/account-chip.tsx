"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@weather-app/ui/components/avatar";
import { Button } from "@weather-app/ui/components/button";
import { User } from "lucide-react";

import { AuthDrawer } from "@/components/auth/auth-drawer";
import { FAVOURITES_QUERY_KEY } from "@/hooks/use-favourites";
import { HISTORY_QUERY_KEY } from "@/hooks/use-history";
import { authClient } from "@/lib/auth-client";

/** "Jane Doe" → "JD", "jane" → "J". Falls back to the email's first letter. */
function initials(name: string | undefined, email: string | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return (email?.[0] ?? "?").toUpperCase();
  }
  return parts
    .slice(0, 2)
    .map((part) => (part[0] ?? "").toUpperCase())
    .join("");
}

const chipClassName = "flex items-center gap-2 rounded-full bg-muted p-1";

/**
 * Account summary in the header. Signed in: avatar initials, email, and a
 * log-out button. Signed out: the same chip shape with a placeholder avatar
 * and a "Sign in" button that opens the auth drawer. The email/label is
 * hidden on narrow viewports so the chip never overflows a phone header.
 */
export function AccountChip() {
  const { data: session, isPending } = authClient.useSession();
  const queryClient = useQueryClient();

  if (isPending) {
    return null;
  }

  if (!session) {
    return (
      <div data-testid="account-chip" className={chipClassName}>
        <Avatar>
          <AvatarFallback>
            <User aria-hidden="true" className="size-4" />
          </AvatarFallback>
        </Avatar>
        <p className="hidden text-muted-foreground text-sm sm:block">Not signed in</p>
        <AuthDrawer
          trigger={
            <Button type="button" variant="outline" size="sm">
              Sign in
            </Button>
          }
        />
      </div>
    );
  }

  const { name, email } = session.user;

  function handleSignOut() {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          // Drop the signed-out user's cached favourites/history so they can
          // never leak into the next session on this page (auth happens
          // in-place now — no navigation resets the cache).
          queryClient.removeQueries({ queryKey: FAVOURITES_QUERY_KEY });
          queryClient.removeQueries({ queryKey: HISTORY_QUERY_KEY });
        },
      },
    });
  }

  return (
    <div data-testid="account-chip" className={chipClassName}>
      <Avatar>
        <AvatarFallback>{initials(name, email)}</AvatarFallback>
      </Avatar>
      <p className="hidden max-w-56 truncate font-medium text-sm sm:block" title={email}>
        {email}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={handleSignOut}>
        Log out
      </Button>
    </div>
  );
}
