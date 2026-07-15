// 고객 화면 액션 콜백 — 고객이 화면에서 누른 것을 콜봇/CTI로 되돌림
// body: { token|sessionId, action:'select_menu'|'request_doc'|'to_agent'|'send_sms', value? }
import { verifyLink, notifyCallbot } from '@/lib/cpaas';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  let b = {}; try { b = await req.json(); } catch { return Response.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  let sessionId = b.sessionId;
  if (b.token) { const v = verifyLink(b.token); if (!v) return Response.json({ ok: false, error: 'invalid token' }, { status: 401 }); if (v.expired) return Response.json({ ok: false, error: 'expired' }, { status: 410 }); sessionId = v.sessionId; }
  if (!sessionId) return Response.json({ ok: false, error: 'sessionId/token 필요' }, { status: 400 });
  const action = b.action || 'unknown';
  const relay = await notifyCallbot({ sessionId, action, value: b.value ?? null, at: new Date().toISOString() });
  return Response.json({ ok: true, sessionId, action, relayed: relay });
}
