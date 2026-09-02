// tests/apierror.test.mjs — 표준 API 응답/에러 포맷 단위 테스트 (무의존성: node:test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ok, fail, badRequest, unauthorized, forbidden, notFound, gone, tooManyRequests, serverError,
  rateLimited, invalidJson,
} from '../lib/apiError.js';

async function read(res) {
  return { status: res.status, body: await res.json() };
}

test('ok: 200 + ok:true, 데이터 병합', async () => {
  const { status, body } = await read(ok({ items: [1, 2], total: 2 }));
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.items, [1, 2]);
  assert.equal(body.total, 2);
});

test('ok: 비객체 인자는 data 로 감싼다', async () => {
  const { body } = await read(ok(42));
  assert.equal(body.ok, true);
  assert.equal(body.data, 42);
});

test('fail: 기본 400 + ok:false + error 유지', async () => {
  const { status, body } = await read(fail());
  assert.equal(status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.error, 'invalid request');
});

test('fail: extra 필드(code/details) 병합', async () => {
  const { body } = await read(fail('bad', 400, { code: 'E_BAD', details: { field: 'x' } }));
  assert.equal(body.error, 'bad');
  assert.equal(body.code, 'E_BAD');
  assert.deepEqual(body.details, { field: 'x' });
});

test('상태별 헬퍼: 코드/기본문구 확인', async () => {
  const cases = [
    [unauthorized(), 401, 'unauthorized'],
    [forbidden(), 403, 'forbidden'],
    [notFound(), 404, 'not found'],
    [gone(), 410, 'expired'],
    [tooManyRequests(), 429, 'rate limited'],
    [serverError(), 500, 'internal error'],
    [badRequest(), 400, 'invalid request'],
  ];
  for (const [res, status, error] of cases) {
    const r = await read(res);
    assert.equal(r.status, status);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.error, error);
  }
});

test('no-store 캐시 헤더 부착(실패 응답)', () => {
  const res = badRequest();
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

// ── rateLimited / invalidJson (전 라우트 통일용 헬퍼) ─────────────────────
test('rateLimited: 429 + Retry-After 정수 초', async () => {
  const res = rateLimited(30);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('Retry-After'), '30');
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, 'rate limited');
});

test('rateLimited: 0·음수·NaN·소수는 안전한 정수 초로 정규화(최소 1)', () => {
  assert.equal(rateLimited(0).headers.get('Retry-After'), '1');
  assert.equal(rateLimited(-5).headers.get('Retry-After'), '1');
  assert.equal(rateLimited(undefined).headers.get('Retry-After'), '1');
  assert.equal(rateLimited(NaN).headers.get('Retry-After'), '1');
  assert.equal(rateLimited('abc').headers.get('Retry-After'), '1');
  assert.equal(rateLimited(2.1).headers.get('Retry-After'), '3');   // 올림 — 이른 재시도 방지
  assert.equal(rateLimited('30').headers.get('Retry-After'), '30'); // 문자열 숫자도 허용
});

test('rateLimited: 사용자 문구·추가 필드 유지', async () => {
  const body = await rateLimited(5, '로그인 시도가 너무 많습니다.', { code: 'LOGIN_RATELIMITED' }).json();
  assert.equal(body.error, '로그인 시도가 너무 많습니다.');
  assert.equal(body.code, 'LOGIN_RATELIMITED');
});

test('rateLimited: 에러 응답이라도 캐시되지 않는다', () => {
  assert.equal(rateLimited(10).headers.get('Cache-Control'), 'no-store');
});

test('invalidJson: 400 + 고정 문구', async () => {
  const res = invalidJson();
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, 'invalid json');
});

test('fail: headers 인자를 얹어도 no-store 는 덮이지 않는다', () => {
  const res = fail('x', 429, {}, { 'Retry-After': '7', 'Cache-Control': 'public, max-age=600' });
  assert.equal(res.headers.get('Retry-After'), '7');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});
