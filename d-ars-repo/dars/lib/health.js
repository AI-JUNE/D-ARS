// 헬스체크 응답 바디/상태코드 구성 (순수 함수 · DB 접근 없음 → 단위 테스트 가능)
// db 상태:
//   - 'connected'      : DB 프로브(select 1) 성공
//   - 'demo-fallback'  : DATABASE_URL 미설정(데모 모드) — 정상 동작으로 간주
//   - 'error'          : DB 설정되어 있으나 프로브 실패 → 503(모니터링/업타임 감지용)
export function buildHealth({
  dbStatus,
  latencyMs = null,
  commit = null,
  env = 'unknown',
  now = new Date(),
} = {}) {
  const ok = dbStatus !== 'error';
  const body = { ok, db: dbStatus };
  if (latencyMs != null) body.dbLatencyMs = latencyMs;
  body.commit = commit;
  body.env = env;
  body.ts = now.toISOString();
  return { body, status: ok ? 200 : 503 };
}
