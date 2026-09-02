// tests/health.test.mjs — 헬스체크 응답 구성 단위 테스트 (무의존성: node:test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHealth, normalizeDep, normalizeDeps, DEP_STATUSES } from '../lib/health.js';
import { readFileSync } from 'node:fs';

const FIXED = new Date('2026-07-09T00:00:00.000Z');

test('connected: ok=true, 200, 지연·커밋·환경 포함', () => {
  const { body, status } = buildHealth({
    dbStatus: 'connected', latencyMs: 12, commit: 'abc1234', env: 'production', now: FIXED,
  });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.db, 'connected');
  assert.equal(body.dbLatencyMs, 12);
  assert.equal(body.commit, 'abc1234');
  assert.equal(body.env, 'production');
  assert.equal(body.ts, '2026-07-09T00:00:00.000Z');
});

test('demo-fallback: ok=true, 200, 지연 미포함(하위호환)', () => {
  const { body, status } = buildHealth({ dbStatus: 'demo-fallback', now: FIXED });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.db, 'demo-fallback');
  assert.equal('dbLatencyMs' in body, false);
});

test('error: ok=false, 503 (업타임 모니터 감지)', () => {
  const { body, status } = buildHealth({ dbStatus: 'error', now: FIXED });
  assert.equal(status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.db, 'error');
});

test('기본값: commit/env 누락 시 null·unknown', () => {
  const { body } = buildHealth({ dbStatus: 'demo-fallback', now: FIXED });
  assert.equal(body.commit, null);
  assert.equal(body.env, 'unknown');
});

test('latencyMs=0 도 포함(falsy 값 누락 방지)', () => {
  const { body } = buildHealth({ dbStatus: 'connected', latencyMs: 0, now: FIXED });
  assert.equal(body.dbLatencyMs, 0);
});

test('빠른 응답: slow 플래그 없음(하위호환 — 임계값 미만이면 필드 미포함)', () => {
  const { body } = buildHealth({ dbStatus: 'connected', latencyMs: 12, now: FIXED });
  assert.equal('slow' in body, false);
});

test('느린 DB: 임계값 이상이면 slow=true, 그러나 ok=true·200 유지(느림 ≠ 다운)', () => {
  const { body, status } = buildHealth({ dbStatus: 'connected', latencyMs: 1800, now: FIXED });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.slow, true);
  assert.equal(body.dbLatencyMs, 1800);
});

test('느린 DB: 임계값 경계(정확히 임계값)면 slow=true', () => {
  const { body } = buildHealth({ dbStatus: 'connected', latencyMs: 1500, now: FIXED });
  assert.equal(body.slow, true);
});

test('사용자 지정 임계값 반영(slowThresholdMs)', () => {
  const fast = buildHealth({ dbStatus: 'connected', latencyMs: 300, slowThresholdMs: 200, now: FIXED });
  assert.equal(fast.body.slow, true);
  const relaxed = buildHealth({ dbStatus: 'connected', latencyMs: 1800, slowThresholdMs: 5000, now: FIXED });
  assert.equal('slow' in relaxed.body, false);
});

test('demo-fallback/error 는 지연이 없어 slow 판정 대상 아님', () => {
  const demo = buildHealth({ dbStatus: 'demo-fallback', now: FIXED });
  assert.equal('slow' in demo.body, false);
  const err = buildHealth({ dbStatus: 'error', latencyMs: 9999, now: FIXED });
  assert.equal('slow' in err.body, false); // connected 가 아니면 slow 미판정
});


// ── 의존성·버전 노출 (COMMERCIAL_READINESS §공통-3, 2026-09-02) ────────────

test('version: 값이 있을 때만 실린다(하위호환)', () => {
  const withV = buildHealth({ dbStatus: 'connected', version: '0.1.0', now: FIXED });
  assert.equal(withV.body.version, '0.1.0');
  const noV = buildHealth({ dbStatus: 'connected', now: FIXED });
  assert.equal('version' in noV.body, false);
});

test('deps: 없으면 키 자체가 없다(기존 소비자 계약 불변)', () => {
  const { body } = buildHealth({ dbStatus: 'connected', now: FIXED });
  assert.equal('deps' in body, false);
  assert.equal('degraded' in body, false);
});

test('deps: 이름·상태·지연만 노출된다', () => {
  const { body, status } = buildHealth({
    dbStatus: 'connected',
    deps: [{ name: 'cpaas', status: 'ok', latencyMs: 41 }],
    now: FIXED,
  });
  assert.equal(status, 200);
  assert.deepEqual(body.deps, [{ name: 'cpaas', status: 'ok', latencyMs: 41 }]);
});

test('deps: URL·키 등 화이트리스트 밖 필드는 절대 실리지 않는다(공개 엔드포인트)', () => {
  const d = normalizeDep({
    name: 'cpaas', status: 'ok',
    url: 'https://api.example.com', apiKey: 'sk-secret', token: 't', password: 'p',
  });
  assert.deepEqual(Object.keys(d), ['name', 'status']);
  const { body } = buildHealth({
    dbStatus: 'connected', deps: [{ name: 'x', status: 'ok', secret: 'nope' }], now: FIXED,
  });
  assert.equal(JSON.stringify(body).includes('nope'), false);
});

test('normalizeDep: 이름 없으면 버린다 · 알 수 없는 상태는 error 로 보수적 처리', () => {
  assert.equal(normalizeDep({ status: 'ok' }), null);
  assert.equal(normalizeDep(null), null);
  assert.equal(normalizeDep('cpaas'), null);
  assert.equal(normalizeDep({ name: 'a', status: 'weird' }).status, 'error');
  for (const s of DEP_STATUSES) assert.equal(normalizeDep({ name: 'a', status: s }).status, s);
});

test('normalizeDeps: 배열 아니면 빈 배열 · 12개 상한 · 불량 항목만 버린다', () => {
  assert.deepEqual(normalizeDeps(null), []);
  assert.deepEqual(normalizeDeps('x'), []);
  const many = Array.from({ length: 30 }, (_, i) => ({ name: `d${i}`, status: 'ok' }));
  assert.equal(normalizeDeps(many).length, 12);
  assert.equal(normalizeDeps([{ name: 'a', status: 'ok' }, null, {}]).length, 1);
});

test('not-configured 는 장애가 아니다 — degraded 도 붙지 않는다', () => {
  const { body, status } = buildHealth({
    dbStatus: 'connected',
    deps: [{ name: 'cpaas', status: 'not-configured' }, { name: 'sms', status: 'not-configured' }],
    now: FIXED,
  });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal('degraded' in body, false);
});

test('필수 아닌 의존성 오류: 200 유지 + degraded=true (부가기능이 전체를 죽이지 않음)', () => {
  const { body, status } = buildHealth({
    dbStatus: 'connected', deps: [{ name: 'sms', status: 'error' }], now: FIXED,
  });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.degraded, true);
});

test('degraded 상태의 의존성도 degraded 플래그를 올린다', () => {
  const { body } = buildHealth({
    dbStatus: 'connected', deps: [{ name: 'cpaas', status: 'degraded' }], now: FIXED,
  });
  assert.equal(body.degraded, true);
});

test('required 의존성 오류: ok=false, 503', () => {
  const { body, status } = buildHealth({
    dbStatus: 'connected',
    deps: [{ name: 'cpaas', status: 'error', required: true }],
    now: FIXED,
  });
  assert.equal(status, 503);
  assert.equal(body.ok, false);
  // 이미 503 이므로 degraded 로 중복 표시하지 않는다
  assert.equal('degraded' in body, false);
});

test('DB 오류는 여전히 503 — deps 가 있어도 기존 계약 불변', () => {
  const { body, status } = buildHealth({
    dbStatus: 'error', deps: [{ name: 'cpaas', status: 'ok' }], now: FIXED,
  });
  assert.equal(status, 503);
  assert.equal(body.ok, false);
});

test('route 의 VERSION 상수는 package.json 과 일치한다(배포 식별 신뢰성)', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const route = readFileSync(new URL('../app/api/health/route.js', import.meta.url), 'utf8');
  const m = /const VERSION = '([^']+)'/.exec(route);
  assert.ok(m, 'VERSION 상수를 찾지 못함');
  assert.equal(m[1], pkg.version);
});

test('health route: HTTP 메서드·설정 외 export 금지(Vercel 빌드 실패 방지)', () => {
  const route = readFileSync(new URL('../app/api/health/route.js', import.meta.url), 'utf8');
  const names = [...route.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/gm)]
    .map((m) => m[1]);
  const allowed = new Set([
    'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
    'dynamic', 'revalidate', 'runtime', 'preferredRegion', 'dynamicParams', 'fetchCache', 'maxDuration',
  ]);
  for (const n of names) assert.ok(allowed.has(n), `허용되지 않은 export: ${n}`);
  assert.equal(/export\s*\{/.test(route), false, 'export { } 구문 금지');
  assert.equal(/export\s+default/.test(route), false, 'default export 금지');
});
