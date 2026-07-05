import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Components call next/navigation's useRouter (router.refresh() after auth
// changes); jsdom has no app router, so provide an inert one for every test.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// jsdom has no window.matchMedia; the use-mobile hook (auth drawer) needs it.
// Minimal stub: never matches, so tests exercise the desktop (Dialog) branch.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
