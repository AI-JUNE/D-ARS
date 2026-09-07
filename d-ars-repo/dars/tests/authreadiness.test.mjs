// tests/authreadiness.test.mjs — AUTH_ENFORCE 전환 준비도 판정 검증
// 이 테스트는 인증을 켜지 않는다. 순수 함수 판정과 문서-코드 대조만 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  maskAccount, parseUsersSpec, checkAuthEnv, issueInfo, matrixFromDoc, matrixDrift,
  DEMO_SECRET, DEMO_PASSWORDS, MIN_SECRET_LEN, MIN_PASSWORD_LEN,
} from '../lib/authReadiness.js';
import { routeRoleMatrix, minRoleFor } from '../lib/auth.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const GOOD_SECRET = 'x'.repeat(MIN_SECRET_LEN);
const GOOD_PW = 'Correct-Horse-99';
const codes = (list) => list.map((x) => x.code);

// 차단 사유가 하나도 없는 기준 환경(테스트 픽스처 — 실제 값이 아니다)
function readyEnv(extra = {}) {
  return {
    AUTH_SECRET: GOOD_SECRET,
    AUTH_USERS: JSON.stringify([{ u: 'gowon-admin', p: GOOD_PW, role: 'admin', name: '관리자' }]),
    DEMO_MODE: '0',
    INGEST_KEY: 'k'.repeat(20),
    AUDIT_DB: '1',
    RBAC_SESSION_SECRET: 'r'.repeat(40),
    ...extra,
  };
}

// ---- 마스킹 ----
test('maskAccount: 앞 2자만 남기고 가린다 · 원문 길이를 그대로 노출하지 않는다', () => {
  assert.equal(maskAccount('operator'), 'op******');
  assert.equal(maskAccount('ab'), '**');
  assert.equal(maskAccount('a'), '*');
  assert.equal(maskAccount(''), '');
  assert.equal(maskAccount(null), '');
  const long = maskAccount('a'.repeat(50));
  assert.ok(long.length <= 8, '긴 아이디도 길이를 흘리지 않는다');
});

// ---- AUTH_USERS 파싱 ----
test('parseUsersSpec: 정상 배열은 통과하고 비밀번호를 반환값에 담지 않는다', () => {
  const r = parseUsersSpec(JSON.stringify([{ u: 'a1', p: GOOD_PW, role: 'admin', name: 'A' }]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
  assert.equal(r.users.length, 1);
  assert.equal('p' in r.users[0], false, '비밀번호는 절대 반환하지 않는다');
  assert.equal(JSON.stringify(r).includes(GOOD_PW), false);
});

test('parseUsersSpec: 미설정·깨진 JSON·비배열·빈 배열을 각각 구분한다', () => {
  assert.deepEqual(codes(parseUsersSpec('').problems), ['users_missing']);
  assert.deepEqual(codes(parseUsersSpec('   ').problems), ['users_missing']);
  assert.deepEqual(codes(parseUsersSpec(undefined).problems), ['users_missing']);
  assert.deepEqual(codes(parseUsersSpec('{oops').problems), ['users_invalid_json']);
  assert.deepEqual(codes(parseUsersSpec('{"u":"a"}').problems), ['users_not_array']);
  assert.deepEqual(codes(parseUsersSpec('[]').problems), ['users_empty']);
});

test('parseUsersSpec: 데모 계정·데모 비밀번호를 잡는다', () => {
  const r = parseUsersSpec(JSON.stringify([{ u: 'admin', p: DEMO_PASSWORDS[0], role: 'admin' }]));
  assert.ok(codes(r.problems).includes('user_demo_password'));
  assert.ok(codes(r.problems).includes('user_demo_account'));
  assert.equal(r.ok, false);
});

test('parseUsersSpec: 짧은 비밀번호는 warning, 없는 비밀번호는 blocker', () => {
  const short = parseUsersSpec(JSON.stringify([{ u: 'a1', p: 'short', role: 'admin' }]));
  assert.ok(codes(short.problems).includes('user_weak_password'));
  assert.equal(issueInfo('user_weak_password').level, 'warning');
  const none = parseUsersSpec(JSON.stringify([{ u: 'a1', p: '', role: 'admin' }]));
  assert.ok(codes(none.problems).includes('user_no_password'));
  assert.equal(issueInfo('user_no_password').level, 'blocker');
  assert.ok(MIN_PASSWORD_LEN >= 8);
});

test('parseUsersSpec: 역할 오타·중복 아이디·아이디 누락·admin 부재', () => {
  const bad = parseUsersSpec(JSON.stringify([{ u: 'a1', p: GOOD_PW, role: 'Admin' }]));
  assert.ok(codes(bad.problems).includes('user_bad_role'), '대소문자가 다르면 권한 판정에서 탈락한다');
  assert.ok(codes(bad.problems).includes('users_no_admin'));
  const dup = parseUsersSpec(JSON.stringify([
    { u: 'a1', p: GOOD_PW, role: 'admin' }, { u: 'a1', p: GOOD_PW, role: 'viewer' },
  ]));
  assert.ok(codes(dup.problems).includes('user_duplicate'));
  const noId = parseUsersSpec(JSON.stringify([{ p: GOOD_PW, role: 'admin' }]));
  assert.ok(codes(noId.problems).includes('user_no_id'));
  const onlyViewer = parseUsersSpec(JSON.stringify([{ u: 'v1', p: GOOD_PW, role: 'viewer' }]));
  assert.ok(codes(onlyViewer.problems).includes('users_no_admin'));
});

test('parseUsersSpec: 이상 입력(원소가 null·숫자·배열)에도 throw 하지 않는다', () => {
  for (const v of ['[null]', '[1,2]', '[[]]', '[true]']) {
    const r = parseUsersSpec(v);
    assert.equal(r.ok, false);
    assert.ok(Array.isArray(r.problems) && r.problems.length);
  }
});

// ---- 환경 판정 ----
test('checkAuthEnv: 기준 환경은 차단 사유 0건', () => {
  const r = checkAuthEnv(readyEnv());
  assert.deepEqual(r.blockers, [], JSON.stringify(r.blockers));
  assert.deepEqual(r.warnings, []);
  assert.equal(r.ready, true);
  assert.deepEqual(r.accounts, [{ account: 'go******', role: 'admin' }]);
});

test('checkAuthEnv: 현재 라이브 구성(전부 미설정)은 반드시 준비 미완', () => {
  const r = checkAuthEnv({});
  assert.equal(r.ready, false);
  assert.equal(r.enforced, false);
  assert.ok(codes(r.blockers).includes('secret_missing'));
  assert.ok(codes(r.blockers).includes('users_missing'));
});

test('checkAuthEnv: 데모 서명키·짧은 서명키는 blocker', () => {
  assert.ok(codes(checkAuthEnv(readyEnv({ AUTH_SECRET: DEMO_SECRET })).blockers).includes('secret_demo'));
  assert.ok(codes(checkAuthEnv(readyEnv({ AUTH_SECRET: 'x'.repeat(MIN_SECRET_LEN - 1) })).blockers).includes('secret_short'));
  assert.equal(checkAuthEnv(readyEnv({ AUTH_SECRET: GOOD_SECRET })).ready, true);
});

test('checkAuthEnv: RATE_LIMIT_DISABLED=1 은 blocker, 다른 값은 무해', () => {
  assert.ok(codes(checkAuthEnv(readyEnv({ RATE_LIMIT_DISABLED: '1' })).blockers).includes('ratelimit_disabled'));
  for (const v of ['0', 'true', 'yes', '']) {
    assert.equal(checkAuthEnv(readyEnv({ RATE_LIMIT_DISABLED: v })).ready, true, `값 ${v} 는 해제가 아니다`);
  }
});

test('checkAuthEnv: 운영 위생 항목은 warning 이지 전환을 막지 않는다', () => {
  const r = checkAuthEnv(readyEnv({ DEMO_MODE: '1', INGEST_KEY: '', AUDIT_DB: '', RBAC_SESSION_SECRET: '' }));
  assert.equal(r.ready, true, 'warning 은 준비 완료를 막지 않는다');
  assert.deepEqual(codes(r.warnings).sort(),
    ['audit_console_only', 'demo_mode_open', 'ingest_key_missing', 'rbac_secret_missing']);
});

test('checkAuthEnv: enforced 는 상태 보고일 뿐 판정을 바꾸지 않는다', () => {
  const on = checkAuthEnv(readyEnv({ AUTH_ENFORCE: '1' }));
  const off = checkAuthEnv(readyEnv());
  assert.equal(on.enforced, true);
  assert.equal(off.enforced, false);
  assert.deepEqual(on.blockers, off.blockers);
  // 준비가 안 된 채 켜져 있는 위험 상태도 그대로 드러낸다
  const risky = checkAuthEnv({ AUTH_ENFORCE: '1' });
  assert.equal(risky.enforced, true);
  assert.equal(risky.ready, false);
});

test('checkAuthEnv: 이상 입력(null·문자열·배열)에도 throw 하지 않는다', () => {
  for (const v of [null, undefined, 'nope', 42, []]) {
    const r = checkAuthEnv(v);
    assert.equal(r.ready, false);
    assert.ok(Array.isArray(r.blockers));
  }
});

test('checkAuthEnv: 결과에 비밀값이 섞이지 않는다', () => {
  const env = readyEnv({ AUTH_SECRET: 'SECRET-VALUE-'.padEnd(40, 'z'), INGEST_KEY: 'INGEST-VALUE-X' });
  const dump = JSON.stringify(checkAuthEnv(env));
  assert.equal(dump.includes('SECRET-VALUE'), false);
  assert.equal(dump.includes('INGEST-VALUE'), false);
  assert.equal(dump.includes(GOOD_PW), false);
  assert.equal(dump.includes('gowon-admin'), false, '계정 아이디도 마스킹된 형태로만 나온다');
});

test('issueInfo: 모르는 코드는 보수적으로 blocker', () => {
  assert.equal(issueInfo('made_up_code').level, 'blocker');
  assert.equal(issueInfo('secret_demo').level, 'blocker');
  assert.equal(issueInfo('demo_mode_open').level, 'warning');
});

// ---- 문서 <-> 코드 매핑 ----
test('matrixFromDoc: 백틱 경로 표 행만 읽는다', () => {
  const md = [
    '| 경로 | 최소 역할 | 비고 |',
    '| `/admin` | admin | 관리 |',
    '| `/ums` | operator |  |',
    '| 로그인 | viewer | 백틱 없음 → 무시 |',
    '문장 속 `/scenarios` 는 표가 아니다',
  ].join('\n');
  assert.deepEqual(matrixFromDoc(md), { '/admin': 'admin', '/ums': 'operator' });
  assert.deepEqual(matrixFromDoc(null), {});
});

test('matrixDrift: 누락·유령·역할 불일치를 각각 잡는다', () => {
  const code = { '/admin': 'admin', '/ums': 'operator' };
  assert.equal(matrixDrift(code, { ...code }).ok, true);
  assert.deepEqual(matrixDrift(code, { '/admin': 'admin' }).missingInDoc, ['/ums']);
  assert.deepEqual(matrixDrift(code, { ...code, '/gone': 'admin' }).ghostInDoc, ['/gone']);
  assert.deepEqual(matrixDrift(code, { ...code, '/ums': 'viewer' }).mismatched,
    [{ path: '/ums', code: 'operator', doc: 'viewer' }]);
  assert.equal(matrixDrift(null, null).ok, true);
});

test('routeRoleMatrix: 코드 매핑은 복사본이라 밖에서 못 바꾼다 · minRoleFor 와 같은 값', () => {
  const m = routeRoleMatrix();
  m['/admin'] = 'viewer';
  assert.equal(routeRoleMatrix()['/admin'], 'admin');
  for (const [p, role] of Object.entries(routeRoleMatrix())) assert.equal(minRoleFor(p), role);
});

// 통합: 실제 문서와 실제 코드가 어긋나면 실패한다(문서가 썩는 것을 막는 장치)
test('통합: docs/AUTH_ROLLOUT.md 의 역할 매핑 표가 lib/auth 와 일치한다', () => {
  const md = fs.readFileSync(path.join(root, 'docs', 'AUTH_ROLLOUT.md'), 'utf8');
  const d = matrixDrift(routeRoleMatrix(), matrixFromDoc(md));
  assert.equal(d.ok, true, JSON.stringify(d));
});

test('통합: AUTH_ROLLOUT 문서가 승인 게이트와 한계를 명시한다', () => {
  const md = fs.readFileSync(path.join(root, 'docs', 'AUTH_ROLLOUT.md'), 'utf8');
  assert.ok(md.includes('[승인 필요]'), '활성화가 승인 사항임을 문서가 말해야 한다');
  assert.ok(md.includes('npm run auth:check'));
  assert.ok(/한계/.test(md));
});

test('통합: package.json 에 auth:check 스크립트가 배선돼 있다', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['auth:check'], 'node scripts/auth-check.mjs');
});

test('통합: 점검 CLI 는 읽기 전용 — 쓰기·환경 변경 코드가 없다', () => {
  const src = fs.readFileSync(path.join(root, 'scripts', 'auth-check.mjs'), 'utf8');
  assert.equal(/writeFileSync|appendFileSync|rmSync|unlinkSync/.test(src), false);
  assert.equal(/process\.env\.[A-Z_]+\s*=/.test(src), false, '환경변수를 설정하지 않는다');
});
