// tests/fetchjson.test.mjs — 클라이언트 요청 공통 유틸 회귀 테스트 (무의존성: node:test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { httpMessage, errorMessage, requestJSON, getJSON, postJSON, asArray } from '../lib/fetchJson.js';

const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
const errRes = (status) => ({ ok: false, status, json: async () => ({}) });

test('httpMessage: 상태코드별 사용자 메시지', () => {
  assert.match(httpMessage(401), /로그인/);
  assert.match(httpMessage(403), /권한/);
  assert.match(httpMessage(404), /찾을 수 없/);
  assert.match(httpMessage(500), /서버 오류/);
  assert.match(httpMessage(503), /서버 오류/);
  assert.equal(typeof httpMessage(418), 'string');
});

test('errorMessage: 타임아웃(Abort)과 네트워크 오류를 구분', () => {
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  assert.match(errorMessage(abort), /지연|중단/);
  assert.match(errorMessage(new Error('boom')), /네트워크/);
});

test('requestJSON: 성공 시 { data, error:null }', async () => {
  const r = await requestJSON('/api/x', { fetchImpl: async () => okRes([{ id: 1 }]) });
  assert.equal(r.error, null);
  assert.deepEqual(r.data, [{ id: 1 }]);
});

test('requestJSON: HTTP 오류는 throw 없이 error 메시지로 반환', async () => {
  const r = await requestJSON('/api/x', { fetchImpl: async () => errRes(500) });
  assert.equal(r.data, null);
  assert.match(r.error, /서버 오류/);
});

test('requestJSON: 네트워크 예외도 throw 하지 않음', async () => {
  const r = await requestJSON('/api/x', { fetchImpl: async () => { throw new Error('down'); } });
  assert.equal(r.data, null);
  assert.match(r.error, /네트워크/);
});

test('requestJSON: JSON 파싱 실패 시 안내 메시지', async () => {
  const bad = { ok: true, status: 200, json: async () => { throw new Error('not json'); } };
  const r = await requestJSON('/api/x', { fetchImpl: async () => bad });
  assert.equal(r.data, null);
  assert.match(r.error, /응답 형식/);
});

test('requestJSON: 타임아웃 초과 시 중단 메시지(무한 대기 방지)', async () => {
  const hang = (url, opts) => new Promise((_resolve, reject) => {
    opts.signal?.addEventListener('abort', () => {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
  });
  const r = await requestJSON('/api/slow', { fetchImpl: hang, timeout: 20 });
  assert.equal(r.data, null);
  assert.match(r.error, /지연|중단/);
});

test('getJSON/postJSON: 메서드·바디 전달', async () => {
  let seen = null;
  const spy = async (url, opts) => { seen = { url, opts }; return okRes({ ok: true }); };
  await getJSON('/api/docs', { fetchImpl: spy });
  assert.equal(seen.opts.method, 'GET');
  assert.equal(seen.opts.body, undefined);

  await postJSON('/api/docs', { name: '새 서류' }, { fetchImpl: spy });
  assert.equal(seen.opts.method, 'POST');
  assert.equal(seen.opts.body, JSON.stringify({ name: '새 서류' }));
  assert.equal(seen.opts.headers['content-type'], 'application/json');
});

test('asArray: 배열이 아닌 응답에서도 화면이 깨지지 않도록 [] 반환', () => {
  assert.deepEqual(asArray([1, 2]), [1, 2]);
  assert.deepEqual(asArray(null), []);
  assert.deepEqual(asArray({ error: 'x' }), []);
  assert.deepEqual(asArray(undefined), []);
});
