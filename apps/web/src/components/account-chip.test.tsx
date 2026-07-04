import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authClient } from "@/lib/auth-client";

import { AccountChip } from "./account-chip";

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: vi.fn(), signOut: vi.fn() },
}));

const useSessionMock = vi.mocked(authClient.useSession);
const signOutMock = vi.mocked(authClient.signOut);

function setSession(user: { name?: string; email?: string } | null) {
  useSessionMock.mockReturnValue({
    data: user ? { user } : null,
    isPending: false,
  } as unknown as ReturnType<typeof authClient.useSession>);
}

function renderChip() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Seed user-scoped caches to assert the sign-out cleanup.
  queryClient.setQueryData(["favourites"], [{ id: "f1" }]);
  queryClient.setQueryData(["history"], [{ id: "h1" }]);
  render(
    <QueryClientProvider client={queryClient}>
      <AccountChip />
    </QueryClientProvider>,
  );
  return queryClient;
}

beforeEach(() => {
  useSessionMock.mockReset();
  signOutMock.mockReset();
});

describe("AccountChip", () => {
  it("signed out: shows the placeholder chip with a Sign in button", () => {
    setSession(null);
    renderChip();

    const chip = screen.getByTestId("account-chip");
    expect(chip).toHaveTextContent("Not signed in");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
  });

  it("signed out: the Sign in button opens the auth drawer", async () => {
    setSession(null);
    renderChip();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Sign in to keep favourites and search history.")).toBeInTheDocument();
  });

  it("signed in: shows initials, email, and a log-out button", () => {
    setSession({ name: "Jane Doe", email: "jane@dev.io" });
    renderChip();

    expect(screen.getByText("JD")).toBeInTheDocument();
    expect(screen.getByText("jane@dev.io")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("logging out clears the cached favourites and history", async () => {
    setSession({ name: "Jane Doe", email: "jane@dev.io" });
    signOutMock.mockImplementation(async (options) => {
      (
        options as { fetchOptions?: { onSuccess?: () => void } } | undefined
      )?.fetchOptions?.onSuccess?.();
      return {} as never;
    });
    const queryClient = renderChip();

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(signOutMock).toHaveBeenCalled();
    expect(queryClient.getQueryData(["favourites"])).toBeUndefined();
    expect(queryClient.getQueryData(["history"])).toBeUndefined();
  });
});
