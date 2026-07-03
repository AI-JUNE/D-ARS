import { hasDB, sql } from '@/lib/db';
export const dynamic = 'force-dynamic';

export async function PUT(req, { params }) {
  const b = await req.json();
  if (!hasDB) return Response.json({ id: params.id, ...b, updated: true });
  const [row] = await sql`update docs set
    biz=coalesce(${b.biz}, biz), name=coalesce(${b.name}, name),
    in_use=coalesce(${typeof b.in_use==='boolean'? b.in_use : null}, in_use)
    where id=${params.id} returning *`;
  return Response.json(row || {});
}
