import { hasDB, sql, safe } from '@/lib/db';
import { demoSessions } from '@/lib/demo';
export const dynamic = 'force-dynamic';

// 진행 세션 조회(보드/실시간 폴백). SSE 스트림(/api/sessions/stream)이 push하는 스냅샷과 동일 스키마.
export async function GET() {
  const rows = await safe(() => sql`select id,phone,scenario,step,node,elapsed,status
    from visual_sessions where status='진행' order by started_at desc limit 20`, demoSessions(6));
  const data = rows && rows.length ? rows : demoSessions(6);
  return Response.json(data, { headers: { 'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=10' } });
}

// 콜봇 이벤트 → Neon 세션 write API.
// body: { event:'launch'|'progress'|'complete'|'drop', id?, callId?, phone?, scenario?, node?, step?, elapsed? }
// 되돌리기 어려운 변경 아님(삭제·스키마 파괴 없음). visual_sessions에 upsert만 수행.
const NODE_BY_STEP = ['VISUAL_LAUNCH', 'SHOW_CARD', 'SHOW_MENU', 'REQUEST_DOC', 'END'];
function maskPhone(p) {
  if (!p) return null;
  const d = String(p).replace(/[^0-9]/g, '');
  return d.length >= 8 ? d.slice(0, 3) + '-****-' + d.slice(-4) : p;
}
export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  const event = String(body.event || 'progress');
  const id = body.id || body.callId || 'VS-' + Date.now().toString(36).toUpperCase();
  const callId = body.callId || null;
  const phone = maskPhone(body.phone);
  const scenario = body.scenario || null;
  // 이벤트별 파생값
  let step = Number.isInteger(body.step) ? body.step : null;
  let status = '진행';
  let ended = false;
  if (event === 'launch') { step = step ?? 0; status = '진행'; }
  else if (event === 'complete') { step = 4; status = '완료'; ended = true; }
  else if (event === 'drop') { status = '이탈'; ended = true; }
  else { step = step ?? 0; status = '진행'; } // progress
  const node = body.node || (step != null ? NODE_BY_STEP[Math.min(step, 4)] : null);
  const elapsed = Number.isFinite(body.elapsed) ? Math.max(0, Math.floor(body.elapsed)) : 0;

  if (!hasDB) {
    // DB 미설정 시: 화면이 멈추지 않도록 정규화된 세션 객체만 에코(데모 폴백).
    return Response.json({ ok: true, mode: 'demo-fallback', session: { id, phone, scenario, step: step ?? 0, node, elapsed, status } });
  }
  const saved = await safe(async () => {
    const rows = await sql`
      insert into visual_sessions (id, call_id, phone, scenario, step, node, elapsed, status, started_at, ended_at)
      values (${id}, ${callId}, ${phone}, ${scenario}, ${step ?? 0}, ${node}, ${elapsed}, ${status}, now(), ${ended ? new Date().toISOString() : null})
      on conflict (id) do update set
        call_id  = coalesce(excluded.call_id, visual_sessions.call_id),
        phone    = coalesce(excluded.phone, visual_sessions.phone),
        scenario = coalesce(excluded.scenario, visual_sessions.scenario),
        step     = greatest(excluded.step, visual_sessions.step),
        node     = coalesce(excluded.node, visual_sessions.node),
        elapsed  = greatest(excluded.elapsed, visual_sessions.elapsed),
        status   = excluded.status,
        ended_at = coalesce(excluded.ended_at, visual_sessions.ended_at)
      returning id, phone, scenario, step, node, elapsed, status`;
    return rows?.[0];
  }, null);
  if (!saved) return Response.json({ ok: false, error: 'write failed', mode: 'db-error' }, { status: 500 });
  return Response.json({ ok: true, mode: 'db', session: saved });
}
