import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

// Avoid creating a new PrismaClient on every hot reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function normalizeSqliteFileUrl(url: string) {
  if (url.startsWith("file:")) {
    const relOrAbsPath = url.replace(/^file:/, "");
    return `file:${path.resolve(relOrAbsPath)}`;
  }
  return url;
}

const databaseUrl = normalizeSqliteFileUrl(process.env.DATABASE_URL ?? "file:./dev.db");

function createPrismaClient() {
  // Prisma 7: PrismaClient needs an adapter instance (or an accelerate URL).
  // Using better-sqlite3 adapter keeps dev simple and works with file-based SQLite URLs.
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

