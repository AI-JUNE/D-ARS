import { hasDB, sql, safe } from '@/lib/db';
import { demoScenarios } from '@/lib/demo';
export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  const row = await safe(async () => (await sql`select * from scenarios where id=${params.id}`)[0], demoScenarios.find(s=>s.id===params.id)||{});
  return Response.json(row || {});
}
export async function PUT(req, { params }) {
  const b = await req.json();
  if (!hasDB) return Response.json({ id: params.id, ...b, updated: true });
  const row = await safe(async () => (await sql`update scenarios set
    name=coalesce(${b.name}, name), type=coalesce(${b.type}, type), status=coalesce(${b.status}, status),
    nodes=coalesce(${b.nodes ? JSON.stringify(b.nodes) : null}, nodes),
    version=version+1, updated_by=${b.updated_by||'운영 관리자'}, updated_at=now()
    where id=${params.id} returning *`)[0], { id: params.id, ...b, updated: true });
  return Response.json(row || {});
}
export async function DELETE(_req, { params }) {
  await safe(() => sql`delete from scenarios where id=${params.id}`, null);
  return Response.json({ ok: true });
}
