/**
 * Normalize DATABASE_URL for node-postgres + Supabase.
 * - Strips accidental wrapping quotes from .env
 * - Appends sslmode=require for *.supabase.co (required for TLS to Supabase)
 */
export function normalizeDatabaseUrl(raw: string | undefined): string {
  let s = raw?.trim() ?? "";
  if (!s) {
    throw new Error("DATABASE_URL is empty.");
  }
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }

  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    throw new Error(
      "DATABASE_URL is not a valid URL. If your database password contains @ # : / ? or spaces, URL-encode it (e.g. encodeURIComponent in Node).",
    );
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(`DATABASE_URL must use postgresql:// or postgres:// (got ${parsed.protocol}).`);
  }

  const host = parsed.hostname.toLowerCase();
  if (host.includes("supabase.co") && !parsed.searchParams.has("sslmode")) {
    parsed.searchParams.set("sslmode", "require");
  }

  return parsed.toString();
}
