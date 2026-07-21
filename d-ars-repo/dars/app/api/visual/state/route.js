// 고객 화면 상태 조회(공개, 서명토큰 스코프) — /visual 이 폴링해 콜봇 node 이벤트를 실시간 반영
// GET /api/visual/state?s=<서명토큰>  → { ok, sessionId, node, step, status, scenario }
import { verifyLink } from '@/lib/cpaas';
import { sql, safe } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const u = new URL(req.url);
  const token = u.searchParams.get('s');
  const v = token ? verifyLink(token) : null;
  if (!v) return Response.json({ ok: false, error: 'invalid token' }, { status: 401 });
  if (v.expired) return Response.json({ ok: false, error: 'expired' }, { status: 410 });
  const rows = await safe(() => sql`select node, step, status, scenario from visual_sessions where id = ${v.sessionId}`, null);
  const r = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return Response.json({
    ok: true, sessionId: v.sessionId,
    node: r?.node ?? null, step: r?.step ?? null, status: r?.status ?? null, scenario: r?.scenario ?? null,
  });
}
