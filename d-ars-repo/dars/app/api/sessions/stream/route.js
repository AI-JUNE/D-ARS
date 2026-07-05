import { hasDB, sql, safe } from '@/lib/db';
import { demoSessions } from '@/lib/demo';
export const dynamic = 'force-dynamic';

// SSE 실시간 세션 동기. WebSocket 대신 서버-센트 이벤트로 진행 세션 스냅샷을 주기적으로 push.
// Vercel 서버리스 수명 한계를 고려해 ~25초 후 스스로 종료 → EventSource가 자동 재연결(무한 실시간 유지).
async function snapshot() {
  const rows = await safe(() => sql`select id,phone,scenario,step,node,elapsed,status
    from visual_sessions where status='진행' order by started_at desc limit 20`, demoSessions(6));
  return rows && rows.length ? rows : demoSessions(6);
}
export async function GET() {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send('ready', { db: hasDB ? 'connected' : 'demo-fallback', ts: new Date().toISOString() });
      for (let tick = 0; tick < 12 && !closed; tick++) {
        try { send('sessions', await snapshot()); } catch { break; }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!closed) { try { controller.close(); } catch {} }
    },
    cancel() { closed = true; },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
