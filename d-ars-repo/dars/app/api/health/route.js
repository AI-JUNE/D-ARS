import { hasDB, sql } from '@/lib/db';
import { buildHealth } from '@/lib/health';

export const dynamic = 'force-dynamic';

// 배포 식별용: Vercel 커밋 SHA(단축) · 실행 환경
const COMMIT = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null;
const ENV = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown';

// 헬스체크: 실제 DB 프로브(select 1)로 연결성·지연을 측정하고,
// tested buildHealth 로직으로 응답/상태코드를 구성한다.
//  - DATABASE_URL 미설정 → 'demo-fallback'(정상, 200)
//  - 프로브 성공        → 'connected'(200, 지연 포함)
//  - 프로브 실패        → 'error'(503, 업타임 모니터가 감지)
export async function GET() {
  let dbStatus = 'demo-fallback';
  let latencyMs = null;
  if (hasDB) {
    const t0 = Date.now();
    try {
      await sql`select 1`;
      dbStatus = 'connected';
      latencyMs = Date.now() - t0;
    } catch (e) {
      console.error('health probe failed:', e?.message);
      dbStatus = 'error';
    }
  }
  const { body, status } = buildHealth({ dbStatus, latencyMs, commit: COMMIT, env: ENV });
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
