// 고객 화면 액션 콜백 — 고객이 화면에서 누른 것을 콜봇/CTI로 되돌림
// body: { token|sessionId, action:'select_menu'|'request_doc'|'to_agent'|'send_sms', value? }
import { verifyLink, notifyCallbot } from '@/lib/cpaas';
import { invalidJson, unauthorized, gone, badRequest } from '@/lib/apiError';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  let b = {}; try { b = await req.json(); } catch { return invalidJson(); }
  let sessionId = b.sessionId;
  if (b.token) { const v = verifyLink(b.token); if (!v) return unauthorized('invalid token'); if (v.expired) return gone(); sessionId = v.sessionId; }
  if (!sessionId) return badRequest('sessionId/token 필요');
  const action = b.action || 'unknown';
  const relay = await notifyCallbot({ sessionId, action, value: b.value ?? null, at: new Date().toISOString() });
  return Response.json({ ok: true, sessionId, action, relayed: relay });
}
