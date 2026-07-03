import { hasDB, sql } from '@/lib/db';
import { demoSessions } from '@/lib/demo';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!hasDB) return Response.json(demoSessions(6));
  const rows = await sql`select id,phone,scenario,step,node,elapsed,status
    from visual_sessions where status='진행' order by started_at desc limit 20`;
  return Response.json(rows);
}
