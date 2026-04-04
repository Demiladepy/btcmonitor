import "dotenv/config";
import { defineConfig } from "prisma/config";
import { normalizeDatabaseUrl } from "./lib/database-url";

function prismaConfigDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    return "postgresql://postgres:postgres@127.0.0.1:5432/postgres?sslmode=require";
  }
  return normalizeDatabaseUrl(raw);
}

function prismaConfigDirectUrl(): string {
  const raw = process.env.DIRECT_URL?.trim();
  if (!raw) return prismaConfigDatabaseUrl();
  return normalizeDatabaseUrl(raw);
}

// Prisma CLI (migrate deploy, db push, etc.) uses this config.
// The runtime app (lib/prisma.ts) reads DATABASE_URL from env directly.
//
// Supabase: port 6543 (PgBouncer transaction mode) hangs on pg_advisory_lock
// used by the migration engine. Port 5432 (session mode) works correctly.
// So the CLI always uses DIRECT_URL (port 5432); the app uses DATABASE_URL (port 6543).
const cliUrl = prismaConfigDirectUrl(); // DIRECT_URL if set, otherwise DATABASE_URL

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
  },
  datasource: {
    url: cliUrl,
  },
});

