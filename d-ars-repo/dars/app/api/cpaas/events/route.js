// 이벤트 릴레이 — 콜봇/CPaaS가 STT·TTS·시나리오 노드 이벤트를 push
// body: { sessionId, type:'stt'|'tts'|'node'|'end', node?, step?, text? }
// visual_sessions에 진행 상태를 upsert → 기존 SSE(/api/sessions/stream)가 화면에 반영
// 보안(v1.1): voice와 동일하게 x-webhook-secret 검증 → 가짜 이벤트 주입 차단
import { sql, safe } from '@/lib/db';
import { verifyWebhook } from '@/lib/cpaas';
import { unauthorized, invalidJson, badRequest } from '@/lib/apiError';
import { consume, ipKey } from '@/lib/apiLimits';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 과다요청/플러딩 완화. 한도는 lib/apiLimits 의 정책표(cpaasEvents)에 있다 — 라우트에 숫자를 두지 않는다.
// 시크릿 브루트포스도 함께 완화하기 위해 verifyWebhook **이전에** 검사한다.
export async function POST(req) {
  const over = consume('cpaasEvents', ipKey(req));
  if (over) return over;
  if (!verifyWebhook(req)) return unauthorized();
  let b = {}; try { b = await req.json(); } catch { return invalidJson(); }
  const sessionId = b.sessionId || b.id;
  if (!sessionId) return badRequest('sessionId 필요');
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
