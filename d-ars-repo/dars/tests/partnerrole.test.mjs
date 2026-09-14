// tests/partnerrole.test.mjs — partner_admin 역할(lib/auth.js) · 범위 판정 · 활성화 게이트 · 문서/등록부 대조
// 원칙: 기본 OFF. 켜기 전엔 파트너 계정이 로그인도 권한 통과도 못 한다. 범위 판정 실패는 전체 공개가 아니라 빈 결과.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROLES, PARTNER_ROLE, PARTNER_SCOPE_NONE, isPartnerRoleEnabled, isValidPartnerId,
  roleAtLeast, partnerScopeOf, findUser, signToken, verifyToken, minRoleFor,
} from '../lib/auth.js';
import { scopeOrganizations, scopeSql, isValidId } from '../lib/partner.js';
import { parseUsersSpec, checkAuthEnv, issueInfo } from '../lib/authReadiness.js';
import { envVar } from '../lib/envMatrix.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOOD_PW = 'Pw-long-enough-12';
const PARTNER_USERS = JSON.stringify([
  { u: 'gowon-admin', p: GOOD_PW, role: 'admin', name: '관리자' },
  { u: 'j2-partner', p: GOOD_PW, role: 'partner_admin', name: '파트너 담당', partnerId: 'P-001' },
  { u: 'j2-noid', p: GOOD_PW, role: 'partner_admin', name: '범위 없음' },
]);
function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally {
    for (const k of Object.keys(vars)) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

test('직원 사다리(ROLES)는 그대로다 — partner_admin 은 사다리에 끼어들지 않는다', () => {
  assert.deepEqual(ROLES, ['viewer', 'operator', 'admin']);
  assert.equal(PARTNER_ROLE, 'partner_admin');
  assert.ok(!ROLES.includes(PARTNER_ROLE));
});

test('기본(OFF): 파트너 역할은 어느 최소 역할도 통과하지 못하고 로그인도 거부된다', () => {
  withEnv({ PARTNER_ROLE_ENABLE: null, AUTH_USERS: PARTNER_USERS }, () => {
    assert.equal(isPartnerRoleEnabled(), false);
    assert.equal(roleAtLeast(PARTNER_ROLE, 'viewer'), false);
    assert.equal(roleAtLeast(PARTNER_ROLE, 'operator'), false);
    assert.equal(findUser('j2-partner', GOOD_PW), null, '스위치 OFF → 비밀번호가 맞아도 로그인 불가');
    assert.equal(findUser('gowon-admin', GOOD_PW).role, 'admin', '직원 계정은 영향 없음');
    assert.equal(partnerScopeOf({ role: PARTNER_ROLE, partnerId: 'P-001' }), PARTNER_SCOPE_NONE);
  });
});

test('ON: 열람(viewer)만 통과 · 운영 편집(operator)·관리(admin)는 불가 · 오타값(true/yes)은 켜지지 않는다', () => {
  withEnv({ PARTNER_ROLE_ENABLE: '1' }, () => {
    assert.equal(roleAtLeast(PARTNER_ROLE, 'viewer'), true);
    assert.equal(roleAtLeast(PARTNER_ROLE, 'operator'), false);
    assert.equal(roleAtLeast(PARTNER_ROLE, 'admin'), false);
    // 경로 게이트와 결합: 관리·운영 경로는 막히고 열람 경로만 열린다
    assert.equal(roleAtLeast(PARTNER_ROLE, minRoleFor('/admin/audit')), false);
    assert.equal(roleAtLeast(PARTNER_ROLE, minRoleFor('/ums')), false);
    assert.equal(roleAtLeast(PARTNER_ROLE, minRoleFor('/dashboard')), true);
    // 직원 판정은 불변
    assert.ok(roleAtLeast('admin', 'operator') && !roleAtLeast('viewer', 'operator'));
  });
  for (const v of ['true', 'yes', ' 1', '01']) {
    withEnv({ PARTNER_ROLE_ENABLE: v }, () => assert.equal(roleAtLeast(PARTNER_ROLE, 'viewer'), false, `'${v}' 로는 켜지지 않는다`));
  }
});

test('ON: 로그인은 partnerId 가 유효한 파트너 계정만 · 세션 공개 필드에 비밀번호 없음', () => {
  withEnv({ PARTNER_ROLE_ENABLE: '1', AUTH_USERS: PARTNER_USERS }, () => {
    const u = findUser('j2-partner', GOOD_PW);
    assert.deepEqual(u, { u: 'j2-partner', role: 'partner_admin', name: '파트너 담당', partnerId: 'P-001' });
    assert.equal(u.p, undefined);
    assert.equal(findUser('j2-noid', GOOD_PW), null, 'partnerId 없는 파트너 계정은 범위를 정할 수 없어 로그인 거부');
    assert.equal(findUser('j2-partner', 'wrong'), null);
    assert.equal(findUser('gowon-admin', GOOD_PW).partnerId, undefined, '직원 세션에는 partnerId 필드가 없다');
  });
});

test('partnerScopeOf: 직원 → null(전체) · 파트너 → 자기 id · 판정 불가 → 빈 문자열(빈 결과)', () => {
  withEnv({ PARTNER_ROLE_ENABLE: '1' }, () => {
    assert.equal(partnerScopeOf({ role: 'viewer' }), null);
    assert.equal(partnerScopeOf({ role: 'admin' }), null);
    assert.equal(partnerScopeOf({ role: PARTNER_ROLE, partnerId: 'P-001' }), 'P-001');
    for (const bad of [{ role: PARTNER_ROLE }, { role: PARTNER_ROLE, partnerId: '' }, { role: PARTNER_ROLE, partnerId: 'p 001' },
      { role: 'superuser' }, null, undefined, 'admin', 42]) {
      assert.equal(partnerScopeOf(bad), PARTNER_SCOPE_NONE, JSON.stringify(bad));
    }
  });
});

test('통합: partnerScopeOf 결과를 lib/partner 범위 함수에 그대로 넘기면 전체/자기것/빈 결과로 갈린다', () => {
  const orgs = [
    { id: 'ORG-1', partner_id: 'P-001' }, { id: 'ORG-2', partner_id: 'P-002' }, { id: 'ORG-3', partner_id: null },
  ];
  withEnv({ PARTNER_ROLE_ENABLE: '1' }, () => {
    assert.equal(scopeOrganizations(orgs, partnerScopeOf({ role: 'operator' })).length, 3);
    assert.deepEqual(scopeOrganizations(orgs, partnerScopeOf({ role: PARTNER_ROLE, partnerId: 'P-001' })).map((o) => o.id), ['ORG-1']);
    assert.deepEqual(scopeOrganizations(orgs, partnerScopeOf({ role: PARTNER_ROLE })), [], '범위 없는 파트너 → 빈 결과(전체 공개 아님)');
    assert.deepEqual(scopeSql(partnerScopeOf({ role: PARTNER_ROLE })), { where: 'false', params: [] });
    assert.deepEqual(scopeSql(partnerScopeOf({ role: 'admin' })), { where: 'true', params: [] });
  });
  withEnv({ PARTNER_ROLE_ENABLE: null }, () => {
    assert.deepEqual(scopeOrganizations(orgs, partnerScopeOf({ role: PARTNER_ROLE, partnerId: 'P-001' })), [], 'OFF 인데 파트너 세션이 남아 있어도 빈 결과');
  });
});

test('식별자 규칙은 lib/partner.isValidId 와 동일하다(두 선언이 어긋나면 실패)', () => {
  for (const v of ['P-001', 'ORG-1', 'ABC', 'A'.repeat(32), 'ab', 'p-001', 'A'.repeat(33), '-AB', 'P 1', '', null, 12]) {
    assert.equal(isValidPartnerId(v), isValidId(v), String(v));
  }
});

test('세션 토큰: partnerId 는 파트너 역할에서만 왕복하고, 직원 토큰에 섞인 partnerId 는 버린다', async () => {
  const p = await verifyToken(await signToken({ u: 'j2', role: PARTNER_ROLE, name: 'J2', partnerId: 'P-001' }));
  assert.equal(p.partnerId, 'P-001');
  const bad = await verifyToken(await signToken({ u: 'j2', role: PARTNER_ROLE, name: 'J2', partnerId: 'no good' }));
  assert.equal(bad.partnerId, null, '형식 불량 partnerId 는 null(범위 없음 → 빈 결과)');
  const staff = await verifyToken(await signToken({ u: 'a', role: 'admin', name: 'A', partnerId: 'P-001' }));
  assert.equal(staff.partnerId, undefined);
});

test('로그인 라우트는 partnerId 를 서명 페이로드에 싣는다(소스 가드 · HTTP 메서드 외 export 없음)', () => {
  const src = fs.readFileSync(path.join(root, 'app', 'api', 'auth', 'login', 'route.js'), 'utf8');
  assert.match(src, /signToken\(\{[^}]*partnerId/, 'partnerId 없이 서명하면 파트너 세션에 범위가 없다');
  const exports = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_]+)/gm)].map((m) => m[1]);
  assert.deepEqual(exports.sort(), ['POST', 'dynamic']);
});

test('authReadiness: partner_admin 은 허용 역할이되 partnerId 없으면 blocker · 스위치 ON 은 warning', () => {
  const r = parseUsersSpec(PARTNER_USERS);
  const codes = r.problems.map((p) => p.code);
  assert.ok(!codes.includes('user_bad_role'), 'partner_admin 은 역할 오타가 아니다');
  assert.deepEqual(r.problems.filter((p) => p.code === 'user_partner_no_id').map((p) => p.account), ['j2*****']);
  assert.equal(issueInfo('user_partner_no_id').level, 'blocker');
  assert.ok(!r.users.some((u) => 'p' in u || 'partnerId' in u && u.partnerId === GOOD_PW), '비밀번호 미포함');
  const env = { AUTH_SECRET: 'x'.repeat(40), AUTH_USERS: PARTNER_USERS, PARTNER_ROLE_ENABLE: '1' };
  const c = checkAuthEnv(env);
  assert.ok(c.warnings.some((w) => w.code === 'partner_role_enabled'));
  assert.ok(!checkAuthEnv({ ...env, PARTNER_ROLE_ENABLE: '' }).warnings.some((w) => w.code === 'partner_role_enabled'));
  assert.doesNotMatch(JSON.stringify(c), /P-001|j2-partner/, '보고서에 파트너 id·계정 원문을 싣지 않는다');
});

test('등록부·문서: PARTNER_ROLE_ENABLE 은 게이트(승인 필요)이고 어느 프로필에서도 켜라고 적지 않는다', () => {
  const v = envVar('PARTNER_ROLE_ENABLE');
  assert.ok(v && v.gate && !v.secret && v.scope === 'runtime');
  assert.deepEqual(Object.values(v.profiles), ['미설정', '미설정', '미설정']);
  const rollout = fs.readFileSync(path.join(root, 'docs', 'AUTH_ROLLOUT.md'), 'utf8');
  assert.match(rollout, /`partner_admin`/);
  assert.match(rollout, /PARTNER_ROLE_ENABLE=1[^\n]*\[승인 필요\]/);
  const channel = fs.readFileSync(path.join(root, 'docs', 'PARTNER_CHANNEL.md'), 'utf8');
  assert.match(channel, /partnerScopeOf/);
});
