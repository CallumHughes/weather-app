import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { WeatherSearch } from "./weather-search";

/** The search state is lifted (see WeatherHome); a stateful harness stands in. */
function Harness({ onSubmit }: { onSubmit: (term: string) => void }) {
  const [search, setSearch] = useState("");
  return (
    <WeatherSearch
      search={search}
      onSubmit={(term) => {
        setSearch(term);
        onSubmit(term);
      }}
    />
  );
}

describe("WeatherSearch", () => {
  it("submits the trimmed term", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("City"), "  London  ");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("London");
  });

  it("does not submit when the input is empty or whitespace", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.type(screen.getByLabelText("City"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("re-submitting the same term fires again (re-opens the result dialog)", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("City"), "London");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenLastCalledWith("London");
  });

  it("syncs the input when the lifted search changes (history row re-run)", async () => {
    function ExternalSetter() {
      const [search, setSearch] = useState("");
      return (
        <>
          <WeatherSearch search={search} onSubmit={setSearch} />
          <button type="button" onClick={() => setSearch("Paris")}>
            set externally
          </button>
        </>
      );
    }
    render(<ExternalSetter />);

    await userEvent.click(screen.getByRole("button", { name: "set externally" }));

    expect(screen.getByLabelText("City")).toHaveValue("Paris");
  });
});
