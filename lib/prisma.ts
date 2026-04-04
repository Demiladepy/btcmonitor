import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { normalizeDatabaseUrl } from "@/lib/database-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const raw = process.env.DATABASE_URL;
  const normalized = normalizeDatabaseUrl(raw);

  // Strip sslmode from the URL — pg parses it and sets ssl:true, which then
  // overrides the explicit ssl object below. We own SSL entirely via the pool config.
  const parsed = new URL(normalized);
  parsed.searchParams.delete("sslmode");
  const connectionString = parsed.toString();

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
