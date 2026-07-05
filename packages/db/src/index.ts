import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@weather-app/env/server";

import { PrismaClient } from "../prisma/generated/client";

export type {
  FavouriteLocation,
  Prisma,
  PrismaClient,
  SearchHistory,
  WeatherCache,
} from "../prisma/generated/client";

// Not exported: everything shares the singleton below so the process
// holds a single connection pool (Better-Auth included).
function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();
export default prisma;
