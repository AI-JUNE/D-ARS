// tests/auth.test.mjs — lib/auth.js HMAC 세션 토큰(signToken/verifyToken) 보안 로직 단위 테스트 (무의존성: node:test)
// 참고: RBAC 헬퍼(roleAtLeast/minRoleFor/findUser)는 auth.test.js 에서 검증. 이 파일은 토큰 서명/검증 경로를 담당.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken } from '../lib/auth.js';

test('signToken→verifyToken 왕복: u/role/name 보존 · exp 미래 시각', async () => {
  const t = await signToken({ u: 'admin', role: 'admin', name: '운영 관리자' });
  const p = await verifyToken(t);
  assert.equal(p.u, 'admin');
  assert.equal(p.role, 'admin');
  assert.equal(p.name, '운영 관리자');
  assert.equal(typeof p.exp, 'number');
  assert.ok(p.exp > Date.now());
});

test('변조된 페이로드는 서명 불일치 → null', async () => {
  const t = await signToken({ u: 'v', role: 'viewer', name: '뷰어' });
  const [b, sig] = t.split('.');
  const tampered = b.slice(0, -2) + (b.slice(-2) === 'AA' ? 'BB' : 'AA') + '.' + sig;
  assert.equal(await verifyToken(tampered), null);
});

test('변조된/가짜 서명은 → null (timingSafeEqual 경로)', async () => {
  const t = await signToken({ u: 'op', role: 'operator', name: '상담 운영자' });
  const [b] = t.split('.');
  assert.equal(await verifyToken(b + '.deadbeef'), null);
});

test('형식 오류/빈 값/비문자열은 → null', async () => {
  assert.equal(await verifyToken(''), null);
  assert.equal(await verifyToken('nodot'), null);
  assert.equal(await verifyToken(null), null);
  assert.equal(await verifyToken(undefined), null);
});
