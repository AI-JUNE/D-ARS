import { hasDB, sql, safe } from '@/lib/db';
import { demoScenarios } from '@/lib/demo';
import { guardWrite } from '@/lib/auth';
import { readJson, badRequest, clampStr, clampNodes } from '@/lib/validate';
export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  const row = await safe(async () => (await sql`select * from scenarios where id=${params.id}`)[0], demoScenarios.find(s=>s.id===params.id)||{});
  return Response.json(row || {});
}
export async function PUT(req, { params }) {
  const denied = await guardWrite(req, 'operator');
  if (denied) return denied;
  // 입력검증(상용 하드닝): 깨진 본문은 500 이 아니라 400 으로 정규화하고, 값은 POST 와 같은 규칙으로 클램핑.
  // 지정하지 않은 필드는 null → coalesce 로 기존 값 유지(부분 수정 하위호환).
  const b = await readJson(req);
  if (!b) return badRequest('invalid json');
  const name = b.name == null ? null : clampStr(b.name, 120);
  const type = b.type == null ? null : clampStr(b.type, 40);
  const status = b.status == null ? null : clampStr(b.status, 20);
  const nodes = b.nodes == null ? null : clampNodes(b.nodes);   // 배열이 아니면 null → 기존 노드 유지
  const updatedBy = clampStr(b.updated_by, 60) || '운영 관리자';
  if (!hasDB) return Response.json({ id: params.id, ...b, updated: true });
  const row = await safe(async () => (await sql`update scenarios set
    name=coalesce(${name}, name), type=coalesce(${type}, type), status=coalesce(${status}, status),
    nodes=coalesce(${nodes ? JSON.stringify(nodes) : null}, nodes),
    version=version+1, updated_by=${updatedBy}, updated_at=now()
    where id=${params.id} returning *`)[0], { id: params.id, ...b, updated: true });
  return Response.json(row || {});
}
export async function DELETE(req, { params }) {
  const denied = await guardWrite(req, 'admin');   // 삭제는 admin 이상
  if (denied) return denied;
  await safe(() => sql`delete from scenarios where id=${params.id}`, null);
  return Response.json({ ok: true });
}
