// tests/guard.test.mjs — lib/auth.js 쓰기 API 가드(guardWrite/parseCookie) 단위 테스트 (무의존성: node:test)
// 계약: 기본(비강제) 모드는 통과(null), AUTH_ENFORCE=1 에서만 미인증 401 / 역할부족 403.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCookie, guardWrite, signToken, COOKIE } from '../lib/auth.js';

function reqWithCookie(cookie) {
  return { headers: { get: (k) => (k.toLowerCase() === 'cookie' ? cookie : null) } };
}

test('parseCookie: 지정 쿠키만 정확히 추출 · 없으면 null', () => {
  assert.equal(parseCookie('a=1; dars_session=tok.sig; b=2', COOKIE), 'tok.sig');
  assert.equal(parseCookie('a=1; b=2', COOKIE), null);
  assert.equal(parseCookie('', COOKIE), null);
  assert.equal(parseCookie(null, COOKIE), null);
});

test('비강제 모드(기본): 쿠키 없어도 통과(null) — 라이브 데모 무붕괴', async () => {
  delete process.env.AUTH_ENFORCE;
  assert.equal(await guardWrite(reqWithCookie(null), 'operator'), null);
  assert.equal(await guardWrite(reqWithCookie('dars_session=garbage'), 'admin'), null);
});

test('강제 모드: 미인증 → 401', async () => {
  process.env.AUTH_ENFORCE = '1';
  try {
    const r = await guardWrite(reqWithCookie(null), 'operator');
    assert.ok(r, '차단 Response 반환해야 함');
    assert.equal(r.status, 401);
    const r2 = await guardWrite(reqWithCookie('dars_session=bad.token'), 'operator');
    assert.equal(r2.status, 401);
  } finally { delete process.env.AUTH_ENFORCE; }
});

test('강제 모드: 역할 부족 → 403', async () => {
  process.env.AUTH_ENFORCE = '1';
  try {
    const tok = await signToken({ u: 'v', role: 'viewer', name: '뷰어' });
    const r = await guardWrite(reqWithCookie(`dars_session=${tok}`), 'operator');
    assert.ok(r);
    assert.equal(r.status, 403);
  } finally { delete process.env.AUTH_ENFORCE; }
});

test('강제 모드: 충분한 역할 → 통과(null)', async () => {
  process.env.AUTH_ENFORCE = '1';
  try {
    const tok = await signToken({ u: 'op', role: 'operator', name: '상담 운영자' });
    assert.equal(await guardWrite(reqWithCookie(`dars_session=${tok}`), 'operator'), null);
    const admin = await signToken({ u: 'admin', role: 'admin', name: '운영 관리자' });
    assert.equal(await guardWrite(reqWithCookie(`dars_session=${admin}`), 'admin'), null);
  } finally { delete process.env.AUTH_ENFORCE; }
});

// ── 가드 거부 감사(P0-7): 거부 시 [AUDIT] WRITE_DENIED 콘솔 한 줄 기록(마스킹·무해화 계약) ──
test('강제 모드: 거부 시 WRITE_DENIED 감사 기록(콘솔) · 통과 시 기록 없음', async () => {
  process.env.AUTH_ENFORCE = '1';
  const orig = console.log;
  const lines = [];
  console.log = (...a) => { lines.push(a.join(' ')); };
  try {
    await guardWrite({ ...reqWithCookie(null), url: 'http://x/api/docs' }, 'operator');           // 401
    const tok = await signToken({ u: 'viewer1', role: 'viewer', name: '뷰어' });
    await guardWrite({ ...reqWithCookie(`dars_session=${tok}`), url: 'http://x/api/ums' }, 'operator'); // 403
    const denied = lines.filter((l) => l.startsWith('[AUDIT]') && l.includes('WRITE_DENIED'));
    assert.equal(denied.length, 2);
    const unauth = JSON.parse(denied[0].slice('[AUDIT] '.length));
    assert.equal(unauth.detail.reason, 'unauthorized');
    assert.equal(unauth.detail.path, '/api/docs');
    const forb = JSON.parse(denied[1].slice('[AUDIT] '.length));
    assert.equal(forb.detail.reason, 'forbidden');
    assert.equal(forb.actor, 'v*****1');            // 마스킹 후에만 기록
    // 통과 시에는 감사 기록 없음
    lines.length = 0;
    const op = await signToken({ u: 'op', role: 'operator', name: '운영자' });
    assert.equal(await guardWrite({ ...reqWithCookie(`dars_session=${op}`), url: 'http://x/api/ums' }, 'operator'), null);
    assert.equal(lines.filter((l) => l.includes('WRITE_DENIED')).length, 0);
  } finally { console.log = orig; delete process.env.AUTH_ENFORCE; }
});
