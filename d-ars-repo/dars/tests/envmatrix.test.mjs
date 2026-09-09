// tests/envmatrix.test.mjs — 환경 분리 매트릭스: 등록부·판정·문서 대조
// 핵심 안전 요건: 이 경로는 **환경변수 값을 어디에도 담지 않는다**(이름과 상태만).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENV_VARS, PROFILES, EXPECT_SET, EXPECT_UNSET, EXPECT_ANY,
  envVar, profileOf, checkVar, reusedSecrets, evaluateEnv,
  envNamesInSource, unregisteredEnvNames, unusedEnvNames,
} from '../lib/envMatrix.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['node_modules', '.next', '.git', 'public']);
const EXT = /\.(js|jsx|mjs)$/;
function collect(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else if (EXT.test(e.name)) out.push(fs.readFileSync(p, 'utf8'));
  }
  return out;
}
const appSources = () => [
  ...collect(path.join(root, 'app')),
  ...collect(path.join(root, 'lib')),
  ...collect(path.join(root, 'scripts')),
  fs.readFileSync(path.join(root, 'middleware.js'), 'utf8'),
];

// ---- 등록부 형태 ----

test('ENV_VARS — 모든 항목이 필수 필드를 갖고 이름이 중복되지 않는다', () => {
  const seen = new Set();
  for (const v of ENV_VARS) {
    assert.match(v.name, /^[A-Z][A-Z0-9_]*$/, `${v.name} 이름 형식`);
    assert.ok(!seen.has(v.name), `${v.name} 중복`);
    seen.add(v.name);
    assert.ok(['runtime', 'platform', 'tooling'].includes(v.scope), `${v.name} scope`);
    assert.equal(typeof v.secret, 'boolean');
    assert.equal(typeof v.gate, 'boolean');
    assert.ok(v.fallbackKo && v.fallbackKo.trim(), `${v.name} 기본 동작 설명 필요`);
    assert.ok(v.note && v.note.trim(), `${v.name} 비고 필요`);
    for (const p of PROFILES) assert.ok(typeof v.profiles[p] === 'string' && v.profiles[p], `${v.name}.${p}`);
  }
});

test('ENV_VARS — 데모 프로필은 어떤 변수도 요구하지 않는다(무설정으로 뜬다)', () => {
  for (const v of ENV_VARS.filter((x) => x.scope === 'runtime')) {
    assert.equal(v.profiles.demo, EXPECT_UNSET, `${v.name} 데모 기본은 미설정이어야 한다`);
  }
  assert.equal(evaluateEnv({}, 'demo').ok, true, '빈 환경에서 데모는 차단 사유 0');
});

test('ENV_VARS — 게이트 변수는 어느 프로필에서도 자동으로 켜라고 하지 않는다', () => {
  // 실인증(AUTH_ENFORCE)·감사DB 처럼 승격 절차에 포함된 것은 예외적으로 값을 명시하되,
  // 비가역·과금 계열은 어떤 프로필에서도 '켜라'고 적지 않는다.
  const neverOn = ['RETENTION_ENABLE', 'DARS_AICC_LIVE', 'DARS_AICC_APPROVAL_REF', 'RATE_LIMIT_DISABLED'];
  for (const name of neverOn) {
    const v = envVar(name);
    assert.ok(v, `${name} 등록 필요`);
    for (const p of PROFILES) assert.equal(v.profiles[p], EXPECT_UNSET, `${name}.${p} 는 미설정이어야 한다`);
  }
});

test('envVar — 모르는 이름은 null · 이상 입력 무throw', () => {
  assert.equal(envVar('NOPE'), null);
  assert.equal(envVar(null), null);
  assert.equal(envVar(undefined), null);
});

// ---- 프로필 판별 ----

test('profileOf — VERCEL_ENV 로 판별하고 모르면 가장 안전한 demo', () => {
  assert.equal(profileOf({ VERCEL_ENV: 'production' }), 'production');
  assert.equal(profileOf({ VERCEL_ENV: 'PREVIEW' }), 'staging');
  assert.equal(profileOf({ VERCEL_ENV: 'development' }), 'demo');
  assert.equal(profileOf({}), 'demo');
  assert.equal(profileOf(null), 'demo');
});

// ---- 개별 판정 ----

test('checkVar — 필수/미설정/정확값 각각을 판정한다', () => {
  const req = { name: 'A', profiles: { production: EXPECT_SET } };
  assert.equal(checkVar(req, { A: 'x' }, 'production').state, 'ok');
  assert.equal(checkVar(req, {}, 'production').state, 'missing');
  assert.equal(checkVar(req, { A: '   ' }, 'production').state, 'missing', '공백만 있는 값은 미설정');

  const unset = { name: 'B', profiles: { demo: EXPECT_UNSET } };
  assert.equal(checkVar(unset, {}, 'demo').state, 'ok');
  assert.equal(checkVar(unset, { B: '1' }, 'demo').state, 'unexpected');

  const exact = { name: 'C', profiles: { production: '1' } };
  assert.equal(checkVar(exact, { C: '1' }, 'production').state, 'ok');
  assert.equal(checkVar(exact, { C: '0' }, 'production').state, 'mismatch');
  assert.equal(checkVar(exact, {}, 'production').state, 'missing');

  const free = { name: 'D', profiles: { production: EXPECT_ANY } };
  assert.equal(checkVar(free, {}, 'production').state, 'ok');
});

test('checkVar — 반환값에 환경변수 값이 들어가지 않는다', () => {
  const r = checkVar({ name: 'A', profiles: { production: EXPECT_SET } }, { A: 'super-secret-value' }, 'production');
  assert.doesNotMatch(JSON.stringify(r), /super-secret-value/);
});

// ---- 비밀값 재사용 ----

test('reusedSecrets — 같은 값을 쓰는 비밀 변수 짝을 이름으로만 보고한다', () => {
  const env = { AUTH_SECRET: 'same', RBAC_SESSION_SECRET: 'same', EUM_TOKEN_SECRET: 'other' };
  const pairs = reusedSecrets(env);
  assert.equal(pairs.length, 1);
  assert.deepEqual(pairs[0], ['AUTH_SECRET', 'RBAC_SESSION_SECRET']);
  assert.doesNotMatch(JSON.stringify(pairs), /same|other/, '값이 새면 안 된다');
});

test('reusedSecrets — 빈 값·비밀 아닌 변수는 대상이 아니다', () => {
  assert.deepEqual(reusedSecrets({ AUTH_SECRET: '', RBAC_SESSION_SECRET: '' }), []);
  assert.deepEqual(reusedSecrets({ AUTH_ENFORCE: '1', DEMO_MODE: '1' }), [], '비밀값이 아니면 무시');
  assert.deepEqual(reusedSecrets(null), []);
});

// ---- 종합 판정 ----

test('evaluateEnv — 운영 프로필의 어긋남은 차단, 스테이징은 경고', () => {
  const prod = evaluateEnv({}, 'production');
  assert.equal(prod.ok, false);
  assert.ok(prod.blockers.some((b) => b.name === 'AUTH_ENFORCE'));
  assert.equal(prod.warnings.length, 0);

  const stg = evaluateEnv({}, 'staging');
  assert.equal(stg.ok, true, '스테이징 구성 미비는 차단이 아니다');
  assert.ok(stg.warnings.length > 0);
});

test('evaluateEnv — 게이트 변수 어긋남에는 [승인 필요] 를 붙인다', () => {
  const prod = evaluateEnv({}, 'production');
  const b = prod.blockers.find((x) => x.name === 'AUTH_ENFORCE');
  assert.match(b.msg, /\[승인 필요\]/);
  const db = prod.blockers.find((x) => x.name === 'DATABASE_URL');
  assert.doesNotMatch(db.msg, /\[승인 필요\]/, '게이트가 아닌 변수엔 붙이지 않는다');
});

test('evaluateEnv — 비밀값 재사용은 프로필과 무관하게 차단', () => {
  const r = evaluateEnv({ AUTH_SECRET: 'k', EUM_TOKEN_SECRET: 'k' }, 'demo');
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => b.code === 'ENV_SECRET_REUSED'));
});

test('evaluateEnv — 결과 어디에도 환경변수 값이 담기지 않는다', () => {
  const env = {};
  for (const v of ENV_VARS) env[v.name] = `VALUE-${v.name}-LEAK`;
  const r = evaluateEnv(env, 'production');
  assert.doesNotMatch(JSON.stringify(r), /LEAK/, '값이 판정 결과에 새면 안 된다');
});

test('evaluateEnv — 켜져 있는 게이트를 이름으로 보고한다', () => {
  const r = evaluateEnv({ AUDIT_DB: '1', RETENTION_ENABLE: '1' }, 'demo');
  assert.deepEqual(r.gatesOn.sort(), ['AUDIT_DB', 'RETENTION_ENABLE']);
});

test('evaluateEnv — 모르는 프로필은 가장 안전한 demo 로 떨어지고 throw 하지 않는다', () => {
  assert.equal(evaluateEnv({}, 'nonsense').profile, 'demo');
  assert.doesNotThrow(() => evaluateEnv(null, null));
});

// ---- 등록부 썩음 방지 ----

test('envNamesInSource — process.env 와 주입된 env 접근을 모두 잡는다', () => {
  const s = "process.env.FOO_BAR + process.env['BAZ_QUX'] + env.QUUX_X + env.lower";
  const found = [...envNamesInSource(s)].sort();
  assert.deepEqual(found, ['BAZ_QUX', 'FOO_BAR', 'QUUX_X']);
  assert.deepEqual([...envNamesInSource(null)], []);
});

test('[통합] 코드가 읽는 환경변수는 전부 등록부에 있다', () => {
  const missing = unregisteredEnvNames(appSources());
  assert.deepEqual(missing, [],
    '등록부 누락 → lib/envMatrix.ENV_VARS 와 docs/STAGING_OPERATIONS.md 를 함께 갱신');
});

test('[통합] 등록부에만 있고 코드가 읽지 않는 유령 변수는 없다', () => {
  assert.deepEqual(unusedEnvNames(appSources()), []);
});

test('[통합] docs/STAGING_OPERATIONS.md 표가 등록부와 양방향 일치한다', () => {
  const md = fs.readFileSync(path.join(root, 'docs', 'STAGING_OPERATIONS.md'), 'utf8');
  const rows = md.split('\n').filter((l) => /^\|\s*`[A-Z]/.test(l));
  const documented = rows.map((l) => (l.match(/`([A-Z][A-Z0-9_]*)`/) || [])[1]).filter(Boolean);
  const registry = ENV_VARS.map((v) => v.name);
  assert.deepEqual([...documented].sort(), [...registry].sort(), '문서 표와 등록부가 어긋난다');
  // 게이트·비밀 표시도 함께 확인(표기가 빠지면 위험한 변수가 평범해 보인다)
  for (const l of rows) {
    const name = (l.match(/`([A-Z][A-Z0-9_]*)`/) || [])[1];
    const v = envVar(name);
    assert.equal(l.includes('🔒'), v.secret, `${name} 비밀값 표기 불일치`);
    assert.equal(l.includes('[승인 필요]'), v.gate, `${name} 승인 게이트 표기 불일치`);
  }
});

test('[통합] env-check CLI 는 값을 출력하지 않고 아무 것도 바꾸지 않는다', () => {
  const src = fs.readFileSync(path.join(root, 'scripts', 'env-check.mjs'), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.doesNotMatch(code, /writeFileSync|appendFileSync|rmSync|unlinkSync|neon\s*\(/);
  // process.env 를 통째로 찍거나 개별 값을 출력하지 않는다
  assert.doesNotMatch(code, /console\.[a-z]+\([^)]*process\.env\.(?!VERCEL_ENV)/, '환경변수 값 출력 금지');
  assert.doesNotMatch(code, /JSON\.stringify\(\s*process\.env/);
});
