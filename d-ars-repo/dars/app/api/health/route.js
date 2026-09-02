import { hasDB, sql } from '@/lib/db';
import { buildHealth } from '@/lib/health';
import { captureError } from '@/lib/monitor';
import { logRequest, requestIdFrom, startTimer } from '@/lib/log';

// ★ route.js 에서는 HTTP 메서드(GET/POST/...)와 Next 설정 export 외에
//   **어떤 것도 export 하지 않는다**(빌드 실패 원인). 헬퍼는 파일 내부 상수로만 둔다.
export const dynamic = 'force-dynamic';

// 배포 식별용: Vercel 커밋 SHA(단축) · 실행 환경 · 앱 버전
const COMMIT = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null;
const ENV = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown';
const VERSION = '0.1.0'; // package.json 과 동기화(런타임 JSON import 회피 — 번들 경고 방지)

// 외부 의존성의 **설정 여부**를 상태로 환산한다.
//   여기서는 실제 외부 호출을 하지 않는다. /health 는 자주·자동으로 호출되므로
//   외부 API 를 매번 두드리면 그쪽에 부하와 과금을 유발하고, 그쪽 장애가 곧 우리 헬스체크 지연이 된다.
//   따라서 "붙을 준비가 되어 있는가"(설정 유무)만 노출한다. 실프로브는 별도 승인 사항. [승인 필요]
//   required 는 지정하지 않는다 — 미도입 상태에서 503 을 유발하면 안 된다.
function configuredDeps() {
  const set = (v) => typeof v === 'string' && v.trim().length > 0;
  return [
    { name: 'cpaas', status: set(process.env.CPAAS_API_KEY) ? 'ok' : 'not-configured' },
    { name: 'sms-gateway', status: set(process.env.SMS_GATEWAY_URL) ? 'ok' : 'not-configured' },
    { name: 'callbot', status: set(process.env.CALLBOT_CALLBACK_URL) ? 'ok' : 'not-configured' },
    { name: 'monitor', status: set(process.env.MONITOR_DSN) ? 'ok' : 'not-configured' },
  ];
}

// 헬스체크: 실제 DB 프로브(select 1)로 연결성·지연을 측정하고,
// tested buildHealth 로직으로 응답/상태코드를 구성한다.
//  - DATABASE_URL 미설정 → 'demo-fallback'(정상, 200)
//  - 프로브 성공        → 'connected'(200, 지연 포함)
//  - 프로브 실패        → 'error'(503, 업타임 모니터가 감지)
export async function GET(req) {
  const timer = startTimer();
  const requestId = requestIdFrom(req?.headers);
  let dbStatus = 'demo-fallback';
  let latencyMs = null;
  if (hasDB) {
    const t0 = Date.now();
    try {
      await sql`select 1`;
      dbStatus = 'connected';
      latencyMs = Date.now() - t0;
    } catch (e) {
      // 전역 캡처 훅(lib/monitor): [MONITOR] 한 줄 + DSN 설정 시에만 외부 전송.
      // await 하지 않는다 — 모니터링 지연이 헬스체크 응답을 늦추면 안 된다(무해화 계약상 reject 없음).
      captureError(e, { level: 'fatal', source: 'api/health', context: { probe: 'select 1' } });
      dbStatus = 'error';
    }
  }
  const { body, status } = buildHealth({
    dbStatus, latencyMs, commit: COMMIT, env: ENV, version: VERSION, deps: configuredDeps(),
  });
  // 구조화 로깅(lib/log): 요청 ID·소요시간·에러코드를 [LOG] 한 줄로 남긴다. PII 미기록.
  logRequest({
    requestId, method: 'GET', path: '/api/health', status,
    durationMs: timer.done(), code: status === 200 ? null : 'health_db_down',
  });
  return Response.json(body, {
    status,
    // 상류에서 이어받았든 새로 만들었든 응답에 되돌려준다 — 클라이언트 오류 신고와 서버 로그를 잇는 고리.
    headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
  });
}
