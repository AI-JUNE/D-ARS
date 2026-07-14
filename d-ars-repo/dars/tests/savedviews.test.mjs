// tests/savedviews.test.mjs — 저장된 뷰(조회 조건 프리셋, lib/savedViews.js) 회귀 테스트
// 핵심 계약: (1) 손상된 저장소 내용이 화면을 깨뜨리지 않는다 (2) 같은 이름은 덮어쓴다(중복 생성 아님)
//            (3) 상한을 넘으면 오래된 것부터 밀려난다 (4) 파라미터 순서가 달라도 같은 조건으로 인식
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_NAME, MAX_VIEWS,
  addView, findView, normalizeName, normalizeQuery, parseViews, removeView,
  sameQuery, serializeViews, storageKey, viewHref,
} from '../lib/savedViews.js';

test('savedviews: storageKey 는 화면별로 분리된다', () => {
  assert.equal(storageKey('ums'), 'dars:views:ums');
  assert.equal(storageKey(''), 'dars:views:default');
  assert.equal(storageKey(undefined), 'dars:views:default');
});

test('savedviews: 이름 정규화(트림·공백 접기·길이 제한), 빈 이름은 null', () => {
  assert.equal(normalizeName('  실패   발송 7일 '), '실패 발송 7일');
  assert.equal(normalizeName(''), null);
  assert.equal(normalizeName('   '), null);
  assert.equal(normalizeName(null), null);
  assert.equal(normalizeName('가'.repeat(80)).length, MAX_NAME);
});

test('savedviews: 쿼리 정규화 — 선행 ? 제거, 빈 쿼리도 유효(=전체 조건)', () => {
  assert.equal(normalizeQuery('?status=실패&range=7d'), 'status=실패&range=7d');
  assert.equal(normalizeQuery('status=실패'), 'status=실패');
  assert.equal(normalizeQuery(''), '');
  assert.equal(normalizeQuery(undefined), '');
  assert.ok(normalizeQuery('a=' + 'x'.repeat(2000)).length <= 500);
});

test('savedviews: 손상된 JSON·이상 항목은 조용히 버리고 나머지를 살린다', () => {
  assert.deepEqual(parseViews('{{not json'), []);
  assert.deepEqual(parseViews(null), []);
  assert.deepEqual(parseViews('{"a":1}'), []); // 배열이 아님
  assert.deepEqual(
    parseViews([{ name: '실패', q: 'status=실패' }, { name: '' }, null, 7, { q: 'x' }, { name: '대기', q: '' }]),
    [{ name: '실패', q: 'status=실패' }, { name: '대기', q: '' }]
  );
});

test('savedviews: 같은 이름은 중복 저장되지 않는다(앞선 것만 유지)', () => {
  const l = parseViews([{ name: 'A', q: 'a=1' }, { name: 'A', q: 'a=2' }]);
  assert.equal(l.length, 1);
  assert.equal(l[0].q, 'a=1');
});

test('savedviews: addView 는 원본을 바꾸지 않고 새 배열을 만든다', () => {
  const base = [{ name: 'A', q: 'a=1' }];
  const next = addView(base, 'B', '?b=2');
  assert.deepEqual(base, [{ name: 'A', q: 'a=1' }]); // 불변
  assert.deepEqual(next, [{ name: 'A', q: 'a=1' }, { name: 'B', q: 'b=2' }]);
});

test('savedviews: 같은 이름으로 저장하면 조건을 덮어쓰고 순서(위치)는 유지된다', () => {
  const base = [{ name: 'A', q: 'a=1' }, { name: 'B', q: 'b=1' }, { name: 'C', q: 'c=1' }];
  const next = addView(base, ' B ', '?b=999');
  assert.equal(next.length, 3);
  assert.equal(next[1].name, 'B');
  assert.equal(next[1].q, 'b=999'); // 제자리 갱신 → 사용자가 칩 위치를 다시 찾지 않아도 된다
});

test('savedviews: 이름이 비면 저장되지 않는다(변화 없음)', () => {
  const base = [{ name: 'A', q: 'a=1' }];
  assert.deepEqual(addView(base, '   ', 'x=1'), base);
});

test('savedviews: 상한을 넘으면 가장 오래된 것부터 밀려난다', () => {
  let list = [];
  for (let i = 0; i < MAX_VIEWS + 3; i++) list = addView(list, 'V' + i, 'i=' + i);
  assert.equal(list.length, MAX_VIEWS);
  assert.equal(list[0].name, 'V3');                     // 앞의 3개가 밀려남
  assert.equal(list[MAX_VIEWS - 1].name, 'V' + (MAX_VIEWS + 2));
});

test('savedviews: removeView / findView', () => {
  const base = [{ name: 'A', q: 'a=1' }, { name: 'B', q: 'b=1' }];
  assert.deepEqual(removeView(base, 'A'), [{ name: 'B', q: 'b=1' }]);
  assert.deepEqual(removeView(base, '없는이름'), base); // 없으면 그대로
  assert.deepEqual(base, [{ name: 'A', q: 'a=1' }, { name: 'B', q: 'b=1' }]); // 불변
  assert.equal(findView(base, 'B').q, 'b=1');
  assert.equal(findView(base, 'Z'), null);
});

test('savedviews: serialize → parse 왕복이 동일하다', () => {
  const list = [{ name: '실패 7일', q: 'status=실패&range=7d' }, { name: '전체', q: '' }];
  assert.deepEqual(parseViews(serializeViews(list)), list);
});

test('savedviews: viewHref — 빈 쿼리는 순수 경로(전체 조건으로 복귀)', () => {
  assert.equal(viewHref('/ums', 'status=실패&range=7d'), '/ums?status=실패&range=7d');
  assert.equal(viewHref('/ums', '?status=실패'), '/ums?status=실패');
  assert.equal(viewHref('/ums', ''), '/ums');
  assert.equal(viewHref('', ''), '/');
});

test('savedviews: sameQuery — 파라미터 순서가 달라도 같은 조건으로 인식(활성 칩 강조)', () => {
  assert.ok(sameQuery('a=1&b=2', 'b=2&a=1'));
  assert.ok(sameQuery('?range=7d&status=실패', 'status=실패&range=7d'));
  assert.ok(sameQuery('', ''));
  assert.ok(!sameQuery('a=1', 'a=2'));
  assert.ok(!sameQuery('a=1', 'a=1&b=2'));
  assert.ok(!sameQuery('status=실패', ''));
});
