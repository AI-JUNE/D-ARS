import { hasDB, sql, safe, jsonCached } from '@/lib/db';
import { demoScenarios } from '@/lib/demo';
export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await safe(() => sql`select id,name,type,status,version,nodes,updated_by,updated_at from scenarios order by id`, demoScenarios);
  return jsonCached(rows && rows.length ? rows : demoScenarios, 60);
}
export async function POST(req) {
  const b = await req.json();
  const id = b.id || 'SC-' + Date.now().toString().slice(-4);
  const nodes = b.nodes || [{ id:1, type:'VISUAL_LAUNCH', label:'화면 런칭' }, { id:2, type:'END', label:'종료' }];
  if (!hasDB) return Response.json({ id, ...b, version:1, nodes, status:b.status||'미운영' }, { status:201 });
  const row = await safe(async () => (await sql`insert into scenarios (id,name,type,status,version,nodes,updated_by)
    values (${id}, ${b.name||'새 시나리오'}, ${b.type||'인바운드'}, ${b.status||'미운영'}, 1, ${JSON.stringify(nodes)}, ${b.updated_by||'운영 관리자'})
    returning *`)[0], { id, ...b, version:1, nodes });
  return Response.json(row, { status:201 });
}
