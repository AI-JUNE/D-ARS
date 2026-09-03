// tests/auditaccess.test.mjs — 관리 기능 "접근 이력"(성공한 접근) 감사 계약 (118회차)
//
// 배경: 지금까지 감사는 거부(WRITE_DENIED/INGEST_DENIED)와 인증 이벤트만 남겼다.
//   상용 요건 "관리 기능 접근 이력"은 **통과한 접근**이 남아야 성립하므로 guardWrite 통과 경로에
//   ADMIN_ACCESS/WRITE_OK 를 기록한다. 이 테스트는 두 가지를 동시에 고정한다.
//     (1) 기록이 남는다(경로·메서드·강제 여부·마스킹된 계정).
//     (2) 기록이 **인가 판정을 바꾸지 않는다** — 통과는 통과, 거부는 그대로 401/403.
// 주의: audit() 는 콘솔 한 줄([AUDIT] JSON)로 기록한다(AUDIT_DB 미설정 = 기본). DB 접근 없음.

import test from 'node:test';
import assert from 'node:assert/strict';
import { guardWrite, signToken, COOKIE } from '../lib/auth.js';

// console.log 를 가로채 [AUDIT] 라인만 파싱해 돌려준다(원래 함수는 반드시 복원).
async function capture(fn) {
  const orig = console.log;
  const lines = [];
  console.log = (...a) => { lines.push(a.join(' ')); };
  try { await fn(); } finally { console.log = orig; }
  return lines
    .filter((l) => typeof l === 'string' && l.startsWith('[AUDIT] '))
    .map((l) => JSON.parse(l.slice('[AUDIT] '.length)));
}

function req(path, { method = 'POST', cookie = null } = {}) {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  headers.set('x-forwarded-for', '203.0.113.42');
  return { url: 'https://d-ars.example' + path, method, headers };
}

function setEnforce(on) {
  if (on) process.env.AUTH_ENFORCE = '1';
  else delete process.env.AUTH_ENFORCE;
}

test.afterEach(() => { setEnforce(false); });

// ── 비강제(기본·라이브 데모) 모드: 차단하지 않지만 이력은 남는다 ──
test('비강제: 통과(null)하면서 WRITE_OK 를 남긴다 — 경로·메서드·IP 마스킹', async () => {
  let ret = 'unset';
  const evs = await capture(async () => { ret = await guardWrite(req('/api/docs'), 'operator'); });
  assert.equal(ret, null, '감사 기록이 통과 판정을 바꾸면 안 된다');
  assert.equal(evs.length, 1);
  assert.equal(evs[0].event, 'WRITE_OK');
  assert.equal(evs[0].detail.path, '/api/docs');
  assert.equal(evs[0].detail.method, 'POST');
  assert.equal(evs[0].detail.need, 'operator');
  assert.equal(evs[0].detail.enforced, false);
  assert.equal(evs[0].ip, '203.0.113.x', '원문 IP 가 남으면 안 된다');
  assert.equal(evs[0].actor, '', '쿠키가 없으면 익명 접근');
});

test('비강제: 관리 API 접근은 ADMIN_ACCESS 로 분류된다', async () => {
  const evs = await capture(() => guardWrite(req('/api/admin/audit', { method: 'GET' }), 'admin'));
  assert.equal(evs.length, 1);
  assert.equal(evs[0].event, 'ADMIN_ACCESS');
  assert.equal(evs[0].detail.method, 'GET');
});

test('비강제: 쿠키가 있으면 마스킹된 계정까지 남는다(원문 금지)', async () => {
  const t = await signToken({ u: 'operator', role: 'operator', name: '상담 운영자' });
  const evs = await capture(() => guardWrite(req('/api/scenarios', { cookie: `${COOKIE}=${t}` }), 'operator'));
  assert.equal(evs.length, 1);
  assert.equal(evs[0].actor, 'o******r');
  assert.equal(evs[0].role, 'operator');
  assert.ok(!evs[0].actor.includes('perato'), '원문 계정 노출 금지(역할명은 PII 가 아니라 원문 유지)');
});

// ── 강제 모드: 통과·거부가 각각 다른 이벤트로 남는다 ──
test('강제: 유효 세션 통과 시 ADMIN_ACCESS(enforced=true)', async () => {
  setEnforce(true);
  const t = await signToken({ u: 'admin', role: 'admin', name: '운영 관리자' });
  let ret = 'unset';
  const evs = await capture(async () => {
    ret = await guardWrite(req('/api/admin/audit', { method: 'GET', cookie: `${COOKIE}=${t}` }), 'admin');
  });
  assert.equal(ret, null);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].event, 'ADMIN_ACCESS');
  assert.equal(evs[0].actor, 'a***n');
  assert.equal(evs[0].role, 'admin');
  assert.equal(evs[0].detail.enforced, true);
});

test('강제: 미인증은 401 + WRITE_DENIED 만 남는다(성공 이벤트 금지)', async () => {
  setEnforce(true);
  let ret = null;
  const evs = await capture(async () => { ret = await guardWrite(req('/api/docs'), 'operator'); });
  assert.equal(ret?.status, 401);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].event, 'WRITE_DENIED');
  assert.equal(evs[0].detail.reason, 'unauthorized');
  assert.ok(!evs.some((e) => e.event === 'WRITE_OK' || e.event === 'ADMIN_ACCESS'));
});

test('강제: 역할 부족은 403 + WRITE_DENIED(forbidden) — 성공 이벤트 금지', async () => {
  setEnforce(true);
  const t = await signToken({ u: 'viewer', role: 'viewer', name: '뷰어' });
  let ret = null;
  const evs = await capture(async () => {
    ret = await guardWrite(req('/api/admin/audit', { method: 'GET', cookie: `${COOKIE}=${t}` }), 'admin');
  });
  assert.equal(ret?.status, 403);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].event, 'WRITE_DENIED');
  assert.equal(evs[0].detail.reason, 'forbidden');
  assert.equal(evs[0].detail.need, 'admin');
});

test('강제: 위조 서명 쿠키는 미인증과 동일(401 · 계정 미노출)', async () => {
  setEnforce(true);
  const t = await signToken({ u: 'admin', role: 'admin', name: '운영 관리자' });
  const forged = t.split('.')[0] + '.deadbeef';
  let ret = null;
  const evs = await capture(async () => {
    ret = await guardWrite(req('/api/admin/audit', { cookie: `${COOKIE}=${forged}` }), 'admin');
  });
  assert.equal(ret?.status, 401);
  assert.equal(evs[0].event, 'WRITE_DENIED');
  assert.equal(evs[0].actor, '', '서명이 깨진 토큰의 계정 주장은 기록하지 않는다');
});

// ── 무해화: 감사 경로의 어떤 실패도 요청을 실패시키지 않는다 ──
test('이상한 요청 객체(url·headers 없음)에도 throw 없이 통과 판정 유지', async () => {
  let ret = 'unset';
  const evs = await capture(async () => { ret = await guardWrite({}, 'operator'); });
  assert.equal(ret, null);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].event, 'WRITE_OK');
  assert.equal(evs[0].detail.path, '');
});

test('쿼리스트링은 감사 detail 에 남지 않는다(PII 유입 방어)', async () => {
  const evs = await capture(() => guardWrite(req('/api/docs?phone=01012345678', { method: 'PUT' }), 'operator'));
  assert.equal(evs[0].detail.path, '/api/docs');
  assert.ok(!JSON.stringify(evs[0]).includes('01012345678'));
});
