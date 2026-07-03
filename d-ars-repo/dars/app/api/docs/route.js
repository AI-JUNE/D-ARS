import { hasDB, sql, safe, jsonCached } from '@/lib/db';
import { demoDocs } from '@/lib/demo';
export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await safe(() => sql`select id,biz,name,req,sent,done,in_use from docs order by req desc`, demoDocs);
  return jsonCached(rows && rows.length ? rows : demoDocs, 60);
}
export async function POST(req) {
  const b = await req.json();
  const id = b.id || 'D' + Date.now().toString().slice(-4);
  if (!hasDB) return Response.json({ id, biz:b.biz||'-', name:b.name||'새 서류', req:0, sent:0, done:0, in_use:true }, { status:201 });
  const row = await safe(async () => (await sql`insert into docs (id,biz,name) values (${id}, ${b.biz||'-'}, ${b.name||'새 서류'}) returning *`)[0], { id, biz:b.biz, name:b.name, req:0, sent:0, done:0, in_use:true });
  return Response.json(row, { status:201 });
}
