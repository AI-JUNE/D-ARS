// 헬스체크 응답 바디/상태코드 구성 (순수 함수 · DB 접근 없음 → 단위 테스트 가능)
// db 상태:
//   - 'connected'      : DB 프로브(select 1) 성공
//   - 'demo-fallback'  : DATABASE_URL 미설정(데모 모드) — 정상 동작으로 간주
//   - 'error'          : DB 설정되어 있으나 프로브 실패 → 503(모니터링/업타임 감지용)
//
// 성능 관측(2026-07-21 야간): 프로브가 성공하더라도 DB 지연이 임계값 이상이면
//   body.slow=true 를 실어 보낸다. 완전한 장애(503)가 되기 전에 업타임 모니터가
//   "성능 저하"를 선제 감지할 수 있게 하기 위함이다(ok/status 계약은 불변 — 느림 ≠ 다운).
export const DEFAULT_SLOW_THRESHOLD_MS = 1500;

export function buildHealth({
  dbStatus,
  latencyMs = null,
  commit = null,
  env = 'unknown',
  now = new Date(),
  slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS,
} = {}) {
  const ok = dbStatus !== 'error';
  const body = { ok, db: dbStatus };
  if (latencyMs != null) body.dbLatencyMs = latencyMs;
  // DB 프로브는 성공했지만 지연이 임계값 이상 → 성능 저하 신호(하위호환: 느리지 않으면 필드 자체를 넣지 않음)
  if (
    dbStatus === 'connected' &&
    latencyMs != null &&
    slowThresholdMs != null &&
    latencyMs >= slowThresholdMs
  ) {
    body.slow = true;
  }
  body.commit = commit;
  body.env = env;
  body.ts = now.toISOString();
  return { body, status: ok ? 200 : 503 };
}
