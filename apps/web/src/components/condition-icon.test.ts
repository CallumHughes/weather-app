import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun } from "lucide-react";
import { describe, expect, it } from "vitest";

import { conditionIcon } from "./condition-icon";

describe("conditionIcon", () => {
  it.each([
    ["Clear", Sun],
    ["Clouds", Cloud],
    ["Rain", CloudRain],
    ["Drizzle", CloudRain],
    ["Thunderstorm", CloudLightning],
    ["Snow", CloudSnow],
    ["Mist", CloudFog],
    ["Fog", CloudFog],
    ["Haze", CloudFog],
    ["Smoke", CloudFog],
    ["Tornado", CloudFog],
  ] as const)("maps %s", (main, icon) => {
    expect(conditionIcon(main)).toBe(icon);
  });

  it("falls back to a plain cloud for unknown groups", () => {
    expect(conditionIcon("Meatballs")).toBe(Cloud);
  });
});
