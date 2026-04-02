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

// URLs live in prisma.config (Prisma 7). Supabase: pooled `DATABASE_URL` for the app;
// optional `DIRECT_URL` (port 5432) for migrations / shadow DB.
const databaseUrl = prismaConfigDatabaseUrl();
const shadowOrDirectUrl = prismaConfigDirectUrl();

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
    shadowDatabaseUrl: shadowOrDirectUrl,
  },
});

