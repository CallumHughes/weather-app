import "@testing-library/jest-dom/vitest";

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
