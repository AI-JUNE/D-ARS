// 이벤트 릴레이 — 콜봇/CPaaS가 STT·TTS·시나리오 노드 이벤트를 push
// body: { sessionId, type:'stt'|'tts'|'node'|'end', node?, step?, text? }
// visual_sessions에 진행 상태를 upsert → 기존 SSE(/api/sessions/stream)가 화면에 반영
import { sql, safe } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  let b = {}; try { b = await req.json(); } catch { return Response.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  const sessionId = b.sessionId || b.id;
  if (!sessionId) return Response.json({ ok: false, error: 'sessionId 필요' }, { status: 400 });
  const node = b.node || null;
  const step = Number.isFinite(b.step) ? b.step : null;
  const status = b.type === 'end' ? '완료' : '진행';
  await safe(() => sql`update visual_sessions set
    node = coalesce(${node}, node),
    step = coalesce(${step}, step),
    status = ${status}
    where id = ${sessionId}`, null);
  return Response.json({ ok: true, sessionId, applied: { node, step, status } });
}
