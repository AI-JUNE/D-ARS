import { neon } from '@neondatabase/serverless';

export const hasDB = !!process.env.DATABASE_URL;

// Neon serverless (HTTP) — Vercel serverless/edge 호환. 미설정 시 null → 데모 폴백.
export const sql = hasDB ? neon(process.env.DATABASE_URL) : null;

export async function q(strings, ...values) {
  if (!hasDB) return null;
  return sql(strings, ...values);
}
