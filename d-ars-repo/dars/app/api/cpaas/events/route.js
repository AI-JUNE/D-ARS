// 이벤트 릴레이 — 콜봇/CPaaS가 STT·TTS·시나리오 노드 이벤트를 push
// body: { sessionId, type:'stt'|'tts'|'node'|'end', node?, step?, text? }
// visual_sessions에 진행 상태를 upsert → 기존 SSE(/api/sessions/stream)가 화면에 반영
// 보안(v1.1): voice와 동일하게 x-webhook-secret 검증 → 가짜 이벤트 주입 차단
import { sql, safe } from '@/lib/db';
import { verifyWebhook } from '@/lib/cpaas';
import { createRateLimiter, clientIp } from '@/lib/rateLimit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 과다요청/플러딩 완화: IP당 1분 120회(통화 중 STT·TTS·node 이벤트는 빈번하므로 넉넉히).
// 시크릿 브루트포스도 함께 완화하기 위해 verifyWebhook 이전에 검사한다.
// [승인 필요] 멀티노드/서버리스 확장 시 Redis 등 공유 스토어로 교체.
const eventsLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });

export async function POST(req) {
  const gate = eventsLimiter.check(clientIp(req));
  if (!gate.allowed) return Response.json({ ok: false, error: 'rate limited' }, { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } });
  if (!verifyWebhook(req)) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  let b = {}; try { b = await req.json(); } catch { return Response.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  const sessionId = b.sessionId || b.id;
  if (!sessionId) return Response.json({ ok: false, error: 'sessionId 필요' }, { status: 400 });
  const node = b.node || null;
  const step = Number.isFinite(b.step) ? b.step : null;
  const status = b.type === 'end' ? '완료' : '진행';
  const gen = ['senior', 'youth', 'family'].includes(b.gen) ? b.gen : null;   // 통화 중 세대 톤 전환
  await safe(() => sql`update visual_sessions set
    node = coalesce(${node}, node),
    step = coalesce(${step}, step),
    status = ${status}
    where id = ${sessionId}`, null);
  if (gen) await safe(() => sql`update visual_sessions set gen = ${gen} where id = ${sessionId}`, null);
  return Response.json({ ok: true, sessionId, applied: { node, step, status, gen } });
}
