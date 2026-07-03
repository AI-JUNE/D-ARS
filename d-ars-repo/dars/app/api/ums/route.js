import { hasDB, sql } from '@/lib/db';
import { demoUms } from '@/lib/demo';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const status = new URL(req.url).searchParams.get('status');
  if (!hasDB) { let d = demoUms(30); if (status && status!=='전체') d = d.filter(x=>x.status===status); return Response.json(d); }
  const rows = status && status!=='전체'
    ? await sql`select id,sent_at,phone,service,doc,status from ums_log where status=${status} order by sent_at desc limit 100`
    : await sql`select id,sent_at,phone,service,doc,status from ums_log order by sent_at desc limit 100`;
  return Response.json(rows);
}
export async function POST(req) {
  const b = await req.json();
  if (!hasDB) return Response.json({ id: Date.now(), sent_at:new Date().toISOString(), status:'발송완료', ...b }, { status:201 });
  const [row] = await sql`insert into ums_log (phone,service,doc,status)
    values (${b.phone||'010-****-0000'}, ${b.service||'영수증 발급'}, ${b.doc||'거래 영수증'}, '발송완료') returning *`;
  return Response.json(row, { status:201 });
}
