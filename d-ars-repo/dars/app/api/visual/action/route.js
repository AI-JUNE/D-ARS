// 고객 화면 액션 콜백 — 고객이 화면에서 누른 것을 콜봇/CTI로 되돌림
// body: { token|sessionId, action:'select_menu'|'request_doc'|'to_agent'|'send_sms', value? }
import { verifyLink, notifyCallbot } from '@/lib/cpaas';
import { invalidJson, unauthorized, gone, badRequest } from '@/lib/apiError';
import { consume, ipKey } from '@/lib/apiLimits';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  let b = {}; try { b = await req.json(); } catch { return invalidJson(); }
  let sessionId = b.sessionId;
  if (b.token) {
    const v = verifyLink(b.token);
    // 위조 토큰은 IP 단위(브루트포스 방어) · 유효 토큰은 아래에서 세션 단위로 제한.
    if (!v) return consume('tokenFail', ipKey(req)) || unauthorized('invalid token');
    if (v.expired) return gone();
    sessionId = v.sessionId;
  }
  if (!sessionId) return badRequest('sessionId/token 필요');
  // 콜봇으로 릴레이되는 쓰기 경로 → 세션 단위 제한(사람 손 조작 속도 대비 충분).
  const over = consume('visualAction', sessionId);
  if (over) return over;
  const action = b.action || 'unknown';
  const relay = await notifyCallbot({ sessionId, action, value: b.value ?? null, at: new Date().toISOString() });
  return Response.json({ ok: true, sessionId, action, relayed: relay });
}
