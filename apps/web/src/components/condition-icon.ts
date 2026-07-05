import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  type LucideIcon,
  Sun,
} from "lucide-react";

/**
 * Map an OpenWeather condition group (`current.condition.main`) to a lucide
 * icon, replacing the OpenWeather icon image. The atmosphere group (Mist,
 * Fog, Haze, Smoke, Dust, Sand, Ash, Squall, Tornado) all collapse to fog;
 * anything unknown falls back to a plain cloud.
 */
export function conditionIcon(main: string): LucideIcon {
  switch (main) {
    case "Clear":
      return Sun;
    case "Clouds":
      return Cloud;
    case "Rain":
    case "Drizzle":
      return CloudRain;
    case "Thunderstorm":
      return CloudLightning;
    case "Snow":
      return CloudSnow;
    case "Mist":
    case "Fog":
    case "Haze":
    case "Smoke":
    case "Dust":
    case "Sand":
    case "Ash":
    case "Squall":
    case "Tornado":
      return CloudFog;
    default:
      return Cloud;
  }
}
