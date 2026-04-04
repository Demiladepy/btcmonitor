import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { normalizeDatabaseUrl } from "@/lib/database-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const raw = process.env.DATABASE_URL;
  const connectionString = normalizeDatabaseUrl(raw);

  // Pass a pre-built pg.Pool so ssl options are guaranteed to reach the driver.
  // Passing a config object with connectionString + ssl can conflict when the URL
  // already contains sslmode=require — pg merges them unpredictably.
  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 15_000,
    ssl: { rejectUnauthorized: false },
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = prisma;
