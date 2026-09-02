// 고객 화면 상태 조회(공개, 서명토큰 스코프) — /visual 이 폴링해 콜봇 node 이벤트를 실시간 반영
// GET /api/visual/state?s=<서명토큰>  → { ok, sessionId, node, step, status, scenario }
import { verifyLink } from '@/lib/cpaas';
import { sql, safe } from '@/lib/db';
import { unauthorized, gone } from '@/lib/apiError';
import { consume, ipKey } from '@/lib/apiLimits';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const u = new URL(req.url);
  const token = u.searchParams.get('s');
  const v = token ? verifyLink(token) : null;
  // 토큰이 없거나 위조면 IP 단위로 빡빡하게 제한 — 서명토큰 브루트포스만 겨냥한다.
  // (정상 사용자는 이 경로를 타지 않으므로 CGNAT 공유 IP 라도 무고한 차단이 없다.)
  if (!v) return consume('tokenFail', ipKey(req)) || unauthorized('invalid token');
  if (v.expired) return gone();
  // 토큰이 유효한 요청은 **세션 단위**로 제한한다. 한 세션의 과다요청이 같은 IP 를 쓰는
  // 다른 이용자에게 전이되지 않는다. 화면 폴링 주기(2.5초)의 5배 여유.
  const over = consume('visualState', v.sessionId);
  if (over) return over;
  const rows = await safe(() => sql`select node, step, status, scenario from visual_sessions where id = ${v.sessionId}`, null);
  const r = Array.isArray(rows) && rows[0] ? rows[0] : null;
  // gen 컬럼은 분리 조회(미마이그레이션 시에도 node 조회가 깨지지 않도록)
  const g = await safe(() => sql`select gen from visual_sessions where id = ${v.sessionId}`, null);
  const gen = Array.isArray(g) && g[0] ? g[0].gen ?? null : null;
  return Response.json({
    ok: true, sessionId: v.sessionId,
    node: r?.node ?? null, step: r?.step ?? null, status: r?.status ?? null, scenario: r?.scenario ?? null, gen,
  });
}
