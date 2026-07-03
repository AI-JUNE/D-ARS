import { hasDB } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json({ ok: true, db: hasDB ? 'connected' : 'demo-fallback', ts: new Date().toISOString() });
}
