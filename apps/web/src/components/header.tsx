import { Cloud } from "lucide-react";

import { AccountChip } from "./account-chip";
import { ModeToggle } from "./mode-toggle";

export default function Header() {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full items-center justify-between px-4 py-2">
        <span className="flex items-center gap-2 font-medium">
          <Cloud aria-hidden="true" className="size-4" />
          Weather
        </span>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <AccountChip />
        </div>
      </div>
    </header>
  );
}
