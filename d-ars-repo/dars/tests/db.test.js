// lib/db.js jsonCached 응답 헤더 단위 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonCached, hasDB } from '../lib/db.js';

test('jsonCached: JSON 본문 + CDN 캐시 헤더', async () => {
  const res = jsonCached({ ok: true }, 30);
  assert.equal(res.headers.get('Cache-Control'), 'public, s-maxage=30, stale-while-revalidate=150');
  assert.deepEqual(await res.json(), { ok: true });
});

test('jsonCached: 기본 캐시 60초', () => {
  const res = jsonCached({});
  assert.ok(res.headers.get('Cache-Control').includes('s-maxage=60'));
});

test('hasDB: DATABASE_URL 미설정 시 false (데모 폴백)', () => {
  assert.equal(typeof hasDB, 'boolean');
});
