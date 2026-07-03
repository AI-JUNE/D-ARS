import { hasDB, sql } from '@/lib/db';
import { demoScenarios } from '@/lib/demo';
export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  if (!hasDB) return Response.json(demoScenarios.find(s => s.id === params.id) || {});
  const [row] = await sql`select * from scenarios where id=${params.id}`;
  return Response.json(row || {});
}

// 저장(버전 상향) — nodes 갱신
export async function PUT(req, { params }) {
  const b = await req.json();
  if (!hasDB) return Response.json({ id: params.id, ...b, updated: true });
  const [row] = await sql`update scenarios set
    name=coalesce(${b.name}, name),
    type=coalesce(${b.type}, type),
    status=coalesce(${b.status}, status),
    nodes=coalesce(${b.nodes ? JSON.stringify(b.nodes) : null}, nodes),
    version=version+1,
    updated_by=${b.updated_by||'운영 관리자'},
    updated_at=now()
    where id=${params.id} returning *`;
  return Response.json(row || {});
}

export async function DELETE(_req, { params }) {
  if (hasDB) await sql`delete from scenarios where id=${params.id}`;
  return Response.json({ ok: true });
}
