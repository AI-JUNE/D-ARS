// tests/apierror.test.mjs — 표준 API 응답/에러 포맷 단위 테스트 (무의존성: node:test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ok, fail, badRequest, unauthorized, forbidden, notFound, gone, tooManyRequests, serverError,
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
