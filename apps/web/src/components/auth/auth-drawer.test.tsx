import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authClient } from "@/lib/auth-client";

import { AuthDrawer } from "./auth-drawer";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: vi.fn(),
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));

const useSessionMock = vi.mocked(authClient.useSession);
const signInMock = vi.mocked(authClient.signIn.email);

beforeEach(() => {
  vi.clearAllMocks();
  useSessionMock.mockReturnValue({
    data: null,
    isPending: false,
  } as unknown as ReturnType<typeof authClient.useSession>);
});

function renderDrawer() {
  return render(<AuthDrawer trigger={<button type="button">Open auth</button>} />);
}

describe("AuthDrawer", () => {
  it("is closed until the trigger is clicked, then shows the sign-in form", async () => {
    renderDrawer();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open auth" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(
      within(dialog).getByText("Sign in to keep favourites and search history."),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Email")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Password")).toBeInTheDocument();
  });

  it("switches between sign-in and sign-up modes", async () => {
    renderDrawer();
    await userEvent.click(screen.getByRole("button", { name: "Open auth" }));
    const dialog = await screen.findByRole("dialog");

    await userEvent.click(within(dialog).getByRole("button", { name: "Need an account? Sign up" }));
    expect(within(dialog).getByRole("heading", { name: "Create account" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Already have an account? Sign in" }),
    );
    expect(within(dialog).getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("a successful sign-in closes the drawer without navigating", async () => {
    signInMock.mockImplementation(async (_body, options) => {
      (options as { onSuccess?: (ctx: unknown) => void } | undefined)?.onSuccess?.({});
      return {} as never;
    });
    renderDrawer();
    await userEvent.click(screen.getByRole("button", { name: "Open auth" }));
    const dialog = await screen.findByRole("dialog");

    await userEvent.type(within(dialog).getByLabelText("Email"), "jane@dev.io");
    await userEvent.type(within(dialog).getByLabelText("Password"), "password123");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign in" }));

    expect(signInMock).toHaveBeenCalledWith(
      { email: "jane@dev.io", password: "password123" },
      expect.anything(),
    );
    // Closes and stays put — no router involved, we are still on "/".
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.pathname).toBe("/");
  });

  it("keeps the drawer open when sign-in fails", async () => {
    signInMock.mockImplementation(async (_body, options) => {
      (
        options as
          | { onError?: (error: { error: { message: string; statusText: string } }) => void }
          | undefined
      )?.onError?.({ error: { message: "Invalid credentials", statusText: "Unauthorized" } });
      return {} as never;
    });
    renderDrawer();
    await userEvent.click(screen.getByRole("button", { name: "Open auth" }));
    const dialog = await screen.findByRole("dialog");

    await userEvent.type(within(dialog).getByLabelText("Email"), "jane@dev.io");
    await userEvent.type(within(dialog).getByLabelText("Password"), "wrongpassword");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
