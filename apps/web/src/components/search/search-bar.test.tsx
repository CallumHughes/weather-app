import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useSearch } from "@/hooks/use-search";
import { SearchProvider } from "@/providers/search-provider";
import { SearchBar } from "./search-bar";

/** Exposes the shared search state the bar writes into (see SearchProvider). */
function SearchProbe() {
  const { search, dialogOpen, submitSearch, setDialogOpen } = useSearch();
  return (
    <>
      <output data-testid="submitted-search">{search}</output>
      <output data-testid="dialog-open">{String(dialogOpen)}</output>
      <button type="button" onClick={() => setDialogOpen(false)}>
        close dialog
      </button>
      <button type="button" onClick={() => submitSearch("Paris")}>
        set externally
      </button>
    </>
  );
}

function renderSearch() {
  render(
    <SearchProvider>
      <SearchBar />
      <SearchProbe />
    </SearchProvider>,
  );
}

describe("SearchBar", () => {
  it("submits the trimmed term and opens the result dialog", async () => {
    renderSearch();

    await userEvent.type(screen.getByLabelText("City"), "  London  ");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(screen.getByTestId("submitted-search")).toHaveTextContent("London");
    expect(screen.getByTestId("dialog-open")).toHaveTextContent("true");
  });

  it("does not submit when the input is empty or whitespace", async () => {
    renderSearch();

    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.type(screen.getByLabelText("City"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(screen.getByTestId("submitted-search")).toHaveTextContent("");
    expect(screen.getByTestId("dialog-open")).toHaveTextContent("false");
  });

  it("re-submitting the same term re-opens the result dialog", async () => {
    renderSearch();

    await userEvent.type(screen.getByLabelText("City"), "London");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(screen.getByRole("button", { name: "close dialog" }));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(screen.getByTestId("dialog-open")).toHaveTextContent("true");
  });

  it("syncs the input when the shared search changes (history row re-run)", async () => {
    renderSearch();

    await userEvent.click(screen.getByRole("button", { name: "set externally" }));

    expect(screen.getByLabelText("City")).toHaveValue("Paris");
  });
});
