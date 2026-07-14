// tests/session.test.mjs — 서명 세션 토큰 sign/verify 보안 로직 단위 테스트 (무의존성)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signSession, verifySession } from '../lib/session.js';

const SECRET = 'test-secret-abc123';

test('sign→verify 왕복: payload(role,sub) 보존', async () => {
  const token = await signSession({ sub: 'admin', role: 'admin' }, SECRET);
  const body = await verifySession(token, SECRET);
  assert.equal(body.sub, 'admin');
  assert.equal(body.role, 'admin');
  assert.equal(typeof body.exp, 'number');
});

test('틀린 시크릿으로 검증 시 null', async () => {
  const token = await signSession({ sub: 'op', role: 'operator' }, SECRET);
  assert.equal(await verifySession(token, 'other-secret'), null);
});

test('변조된 토큰(페이로드 조작)은 null', async () => {
  const token = await signSession({ sub: 'v', role: 'viewer' }, SECRET);
  const [data, sig] = token.split('.');
  const tampered = data.slice(0, -2) + 'XY' + '.' + sig;
  assert.equal(await verifySession(tampered, SECRET), null);
});

test('형식 오류/빈 토큰은 null', async () => {
  assert.equal(await verifySession('', SECRET), null);
  assert.equal(await verifySession('nodot', SECRET), null);
  assert.equal(await verifySession(null, SECRET), null);
});

test('만료된 토큰은 null (ttl 음수)', async () => {
  const token = await signSession({ sub: 'x', role: 'viewer' }, SECRET, -10);
  assert.equal(await verifySession(token, SECRET), null);
});

test('시크릿 없으면 검증 불가(null)', async () => {
  const token = await signSession({ sub: 'x', role: 'viewer' }, SECRET);
  assert.equal(await verifySession(token, ''), null);
});
