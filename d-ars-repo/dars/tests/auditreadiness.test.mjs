// tests/auditreadiness.test.mjs — 감사로그 영속화 준비도 판정 + 적재 관측 카운터
// 핵심: "켰다"와 "실제로 남는다"가 다른 상태를 판정으로 드러내는지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditReadiness, auditDepStatus, auditFlagOn, auditFlagTypo, AUDIT_MODES } from '../lib/auditReadiness.js';
import { audit, auditStats, resetAuditStats, AUDIT_EVENTS } from '../lib/audit.js';
import { DEP_STATUSES } from '../lib/health.js';

const root = fileURLToPath(new URL('..', import.meta.url));

// ---- 플래그 해석 ----

test('auditFlagOn — 정확히 1 일 때만 켠다', () => {
  assert.equal(auditFlagOn({ AUDIT_DB: '1' }), true);
  for (const v of ['0', 'true', 'TRUE', 'yes', '', ' 1 ', undefined]) {
    assert.equal(auditFlagOn({ AUDIT_DB: v }), false, `${JSON.stringify(v)} 는 꺼진 상태`);
  }
  assert.equal(auditFlagOn(null), false);
});

test('auditFlagTypo — 켠 줄 알았는데 안 켜진 값을 잡아낸다', () => {
  for (const v of ['true', 'TRUE', 'yes', 'on', 'enabled', ' 1 ', '1 ']) {
    assert.equal(auditFlagTypo({ AUDIT_DB: v }), true, `${JSON.stringify(v)} 는 오타 후보`);
  }
  assert.equal(auditFlagTypo({ AUDIT_DB: '1' }), false, '정상값은 오타가 아니다');
  assert.equal(auditFlagTypo({ AUDIT_DB: '0' }), false, '명시적 OFF 는 오타가 아니다');
  assert.equal(auditFlagTypo({}), false);
  assert.equal(auditFlagTypo(null), false);
});

// ---- 준비도 판정 ----

test('auditReadiness — 기본(플래그 OFF)은 콘솔 모드이며 차단 사유가 아니다', () => {
  const r = auditReadiness({ env: {} });
  assert.equal(r.mode, 'console');
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.code === 'AUDIT_CONSOLE_ONLY'), '보존기간 종속을 알린다');
});

test('auditReadiness — 오타로 꺼진 상태를 경고한다', () => {
  const r = auditReadiness({ env: { AUDIT_DB: 'true' } });
  assert.equal(r.mode, 'console');
  assert.ok(r.warnings.some((w) => w.code === 'AUDIT_FLAG_TYPO'));
});

test('auditReadiness — 스위치만 켜고 DB 가 없으면 차단(db-blind)', () => {
  const r = auditReadiness({ env: { AUDIT_DB: '1' }, hasDB: false });
  assert.equal(r.mode, 'db-blind');
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => b.code === 'AUDIT_DB_NO_DATABASE'));
});

test('auditReadiness — 적재가 전부 실패하면 차단하고 테이블 미적용을 지목한다', () => {
  const r = auditReadiness({ env: { AUDIT_DB: '1' }, hasDB: true, failures: 5, persisted: 0 });
  assert.equal(r.mode, 'db-blind');
  assert.equal(r.ok, false);
  const b = r.blockers.find((x) => x.code === 'AUDIT_PERSIST_FAILING');
  assert.ok(b && /audit\.sql/.test(b.msg), '다음 행동(db/audit.sql 적용)을 제시해야 한다');
});

test('auditReadiness — 일부만 실패하면 동작 중(경고)으로 본다', () => {
  const r = auditReadiness({ env: { AUDIT_DB: '1' }, hasDB: true, failures: 2, persisted: 100 });
  assert.equal(r.mode, 'db');
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.code === 'AUDIT_PERSIST_PARTIAL'));
});

test('auditReadiness — 정상 영속화는 차단·경고 없음', () => {
  const r = auditReadiness({ env: { AUDIT_DB: '1' }, hasDB: true, failures: 0, persisted: 10 });
  assert.equal(r.mode, 'db');
  assert.deepEqual(r.blockers, []);
  assert.deepEqual(r.warnings, []);
});

test('auditReadiness — 이상 입력에 throw 하지 않고 모드는 항상 어휘 안에 있다', () => {
  for (const bad of [undefined, null, {}, { env: null, failures: NaN, persisted: -3 }]) {
    const r = auditReadiness(bad);
    assert.ok(AUDIT_MODES.includes(r.mode));
    assert.equal(r.failures, 0);
    assert.equal(r.persisted, 0);
  }
});

test('auditReadiness — 판정 결과에 환경변수 값이 담기지 않는다', () => {
  const r = auditReadiness({ env: { AUDIT_DB: '1', DATABASE_URL: 'postgres://u:LEAKPASS@h/db' }, hasDB: true });
  assert.doesNotMatch(JSON.stringify(r), /LEAKPASS/);
});

// ---- health deps 환산 ----

test('auditDepStatus — health 의 상태 어휘로만 환산한다', () => {
  const cases = [
    [{ mode: 'console' }, 'not-configured'],
    [{ mode: 'db', failures: 0 }, 'ok'],
    [{ mode: 'db', failures: 3 }, 'degraded'],
    [{ mode: 'db-blind' }, 'error'],
  ];
  for (const [input, expected] of cases) {
    const got = auditDepStatus(input);
    assert.equal(got, expected);
    assert.ok(DEP_STATUSES.includes(got), 'health 어휘 밖의 값 금지');
  }
  assert.ok(DEP_STATUSES.includes(auditDepStatus(null)));
});

// ---- 적재 관측 카운터 ----

test('audit — 플래그 OFF 면 적재를 시도하지 않는다(카운터 불변)', async () => {
  resetAuditStats();
  delete process.env.AUDIT_DB;
  await audit('AUTH_LOGIN', { actor: 'operator', ip: '1.2.3.4' });
  assert.deepEqual(auditStats(), { attempted: 0, persisted: 0, failed: 0, lastFailedAt: null });
});

test('audit — 플래그 ON + DB 없음이면 실패로 세고, 그래도 throw 하지 않는다', async () => {
  resetAuditStats();
  process.env.AUDIT_DB = '1';
  try {
    const r = await audit('AUTH_LOGIN', { actor: 'operator', ip: '1.2.3.4' });
    assert.equal(r, true, '본 요청을 실패시키지 않는다(무해화 계약)');
    const s = auditStats();
    assert.equal(s.attempted, 1);
    assert.equal(s.persisted, 0);
    assert.equal(s.failed, 1, '영속화가 일어나지 않은 사실이 카운터에 남아야 한다');
    assert.ok(typeof s.lastFailedAt === 'string');
    // 이 상태가 곧 db-blind 로 판정돼야 한다
    const r2 = auditReadiness({ env: process.env, hasDB: false, failures: s.failed, persisted: s.persisted });
    assert.equal(r2.mode, 'db-blind');
  } finally {
    delete process.env.AUDIT_DB;
    resetAuditStats();
  }
});

test('audit — 화이트리스트 밖 이벤트는 세지도 기록하지도 않는다', async () => {
  resetAuditStats();
  process.env.AUDIT_DB = '1';
  try {
    assert.equal(await audit('MADE_UP_EVENT', { actor: 'x' }), false);
    assert.deepEqual(auditStats(), { attempted: 0, persisted: 0, failed: 0, lastFailedAt: null });
  } finally {
    delete process.env.AUDIT_DB;
    resetAuditStats();
  }
});

test('auditStats — 복사본을 반환해 외부에서 수정할 수 없다', async () => {
  resetAuditStats();
  const s = auditStats();
  s.persisted = 999;
  assert.equal(auditStats().persisted, 0);
});

test('auditStats — 오류 원문을 담지 않는다', async () => {
  resetAuditStats();
  process.env.AUDIT_DB = '1';
  try {
    await audit('AUTH_LOGIN', { actor: 'operator@example.com', ip: '10.0.0.9' });
    const s = auditStats();
    assert.deepEqual(Object.keys(s).sort(), ['attempted', 'failed', 'lastFailedAt', 'persisted']);
    assert.doesNotMatch(JSON.stringify(s), /operator|example\.com|10\.0\.0/, '엔트리 내용이 새면 안 된다');
  } finally {
    delete process.env.AUDIT_DB;
    resetAuditStats();
  }
});

// ---- 통합 ----

test('[통합] /api/health 는 audit-persist 의존성을 노출하고 route export 계약을 지킨다', () => {
  const src = fs.readFileSync(path.join(root, 'app', 'api', 'health', 'route.js'), 'utf8');
  assert.match(src, /audit-persist/);
  assert.match(src, /auditDepStatus/);
  assert.doesNotMatch(src, /required:\s*true/, '감사 적재 실패로 503 을 내지 않는다');
  const exported = [...src.matchAll(/^export\s+(?:const|async\s+function|function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  assert.deepEqual(exported.sort(), ['GET', 'dynamic'], 'route.js 는 HTTP 메서드·설정 외 export 금지');
});

test('[통합] audit-check CLI 는 읽기 전용이고 값을 출력하지 않는다', () => {
  const src = fs.readFileSync(path.join(root, 'scripts', 'audit-check.mjs'), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.doesNotMatch(code, /neon\s*\(|writeFileSync|appendFileSync|unlinkSync/);
  assert.doesNotMatch(code, /console\.[a-z]+\([^)]*process\.env\.[A-Z]/, '환경변수 값 출력 금지');
  assert.match(code, /process\.exit/);
});

test('[통합] AUDIT_EVENTS 어휘는 비어 있지 않고 전부 대문자 상수 형식이다', () => {
  assert.ok(AUDIT_EVENTS.length >= 8);
  for (const e of AUDIT_EVENTS) assert.match(e, /^[A-Z][A-Z0-9_]*$/);
  assert.equal(new Set(AUDIT_EVENTS).size, AUDIT_EVENTS.length, '중복 금지');
});
