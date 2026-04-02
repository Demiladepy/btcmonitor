import "dotenv/config";
import { defineConfig } from "prisma/config";

// URLs live in prisma.config (Prisma 7). Supabase: pooled `DATABASE_URL` for the app;
// optional `DIRECT_URL` (port 5432) for migrations / shadow DB.
const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

const shadowOrDirectUrl = process.env.DIRECT_URL?.trim() || databaseUrl;

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

