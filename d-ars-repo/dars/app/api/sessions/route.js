import { hasDB, sql, safe } from '@/lib/db';
import { demoSessions } from '@/lib/demo';
export const dynamic = 'force-dynamic';
export async function GET() {
  const rows = await safe(() => sql`select id,phone,scenario,step,node,elapsed,status
    from visual_sessions where status='진행' order by started_at desc limit 20`, demoSessions(6));
  const data = rows && rows.length ? rows : demoSessions(6);
  return Response.json(data, { headers: { 'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=10' } });
}
