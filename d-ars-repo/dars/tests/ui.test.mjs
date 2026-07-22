// tests/ui.test.mjs — UI 표시 유틸 단위 테스트 (무의존성)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pct, fmt, fmtDur, tagClass, NODE_TYPES, journey, stepLabel, compareVals, sortRows } from '../lib/ui.js';

test('pct: 정상 계산(반올림)', () => {
  assert.equal(pct(1, 2), 50);
  assert.equal(pct(1, 3), 33);
  assert.equal(pct(2, 3), 67);
});

test('pct: 분모 0이면 0 (0 나누기 방지)', () => {
  assert.equal(pct(5, 0), 0);
  assert.equal(pct(0, 0), 0);
});

test('fmt: 초를 mm:ss로 (0 패딩)', () => {
  assert.equal(fmt(65), '01:05');
  assert.equal(fmt(5), '00:05');
  assert.equal(fmt(600), '10:00');
  assert.equal(fmt(0), '00:00');
  assert.equal(fmt(3599), '59:59'); // 1시간 직전은 여전히 mm:ss(하위호환)
});

test('fmt: 1시간 이상은 h:mm:ss (장기 세션 분/초 혼동 해소)', () => {
  assert.equal(fmt(3600), '1:00:00');
  assert.equal(fmt(3661), '1:01:01');
  assert.equal(fmt(4530), '1:15:30'); // 이전엔 "75:30"으로 혼동
  assert.equal(fmt(36000), '10:00:00');
});

test('fmtDur: 1시간 미만은 "N분 N초"(알림 기존 표기 하위호환)', () => {
  assert.equal(fmtDur(200), '3분 20초');   // 기존 알림 표기와 동일
  assert.equal(fmtDur(30), '0분 30초');
  assert.equal(fmtDur(3599), '59분 59초');  // 1시간 직전
});

test('fmtDur: 1시간 이상은 "N시간 N분 N초" (장기 세션 명확화)', () => {
  assert.equal(fmtDur(3600), '1시간 0분 0초');
  assert.equal(fmtDur(7530), '2시간 5분 30초'); // 이전엔 "125분 30초"로 혼동
  assert.equal(fmtDur(36061), '10시간 1분 1초');
});

test('fmtDur: 잘못된 입력은 방어적으로 "0초"', () => {
  assert.equal(fmtDur(0), '0초');
  assert.equal(fmtDur(-5), '0초');
  assert.equal(fmtDur(NaN), '0초');
  assert.equal(fmtDur(Infinity), '0초');
  assert.equal(fmtDur(undefined), '0초');
  assert.equal(fmtDur(90.9), '1분 30초'); // 소수 초는 내림
});

test('fmt: 잘못된 입력은 방어적으로 00:00 (깨진 값 노출 방지)', () => {
  assert.equal(fmt(-5), '00:00');
  assert.equal(fmt(NaN), '00:00');
  assert.equal(fmt(Infinity), '00:00');
  assert.equal(fmt(undefined), '00:00');
  assert.equal(fmt(12.9), '00:12'); // 소수 초는 내림
});

test('tagClass: 알려진 상태 매핑', () => {
  assert.equal(tagClass('운영'), 't-ok');
  assert.equal(tagClass('실패'), 't-bad');
  assert.equal(tagClass('대기'), 't-warn');
  assert.equal(tagClass('진행'), 't-info');
});

test('tagClass: 미지의 상태는 기본값 t-mut', () => {
  assert.equal(tagClass('없는상태'), 't-mut');
  assert.equal(tagClass(undefined), 't-mut');
});

test('NODE_TYPES/journey: 핵심 구조 상수 존재', () => {
  assert.ok(NODE_TYPES.VISUAL_LAUNCH);
  assert.equal(NODE_TYPES.END.name, '종료');
  assert.equal(journey.length, 5);
});

test('stepLabel: 유효 인덱스는 journey 와 100% 동일(하위호환)', () => {
  assert.equal(stepLabel(0), '런칭');
  assert.equal(stepLabel(2), '상담');
  assert.equal(stepLabel(4), '완료');
  journey.forEach((label, i) => assert.equal(stepLabel(i), label));
  assert.equal(stepLabel('3'), '안내·발송'); // 숫자 문자열도 정상(느슨한 데이터 방어)
});

test('stepLabel: 범위 밖·undefined·비정수는 방어적으로 "—"', () => {
  assert.equal(stepLabel(5), '—');     // 상한 초과
  assert.equal(stepLabel(-1), '—');    // 음수
  assert.equal(stepLabel(undefined), '—');
  assert.equal(stepLabel(null), '—');
  assert.equal(stepLabel(NaN), '—');
  assert.equal(stepLabel('x'), '—');   // 파싱 불가 문자열
  assert.equal(stepLabel(2.5), '상담'); // 소수는 내림(Math.trunc)
});

test('compareVals: 두 값이 숫자면 수치 비교', () => {
  assert.ok(compareVals(2, 10) < 0);        // 2 < 10 (문자열 정렬이면 반대가 됨)
  assert.ok(compareVals(10, 2) > 0);
  assert.equal(compareVals(5, 5), 0);
});

test('compareVals: 문자열은 한글·숫자 자연 정렬', () => {
  assert.ok(compareVals('가', '나') < 0);
  assert.ok(compareVals('항목2', '항목10') < 0);  // numeric:true → 2 < 10
  assert.ok(compareVals('A2', 'A10') < 0);
});

test('compareVals: null/undefined 안전(빈 문자열 취급)', () => {
  assert.equal(compareVals(null, null), 0);
  assert.equal(compareVals(undefined, ''), 0);
  assert.ok(compareVals(null, '가') < 0);   // '' < '가'
});

test('sortRows: sort 없거나 key 없으면 원본 그대로', () => {
  const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];
  assert.equal(sortRows(rows, null), rows);
  assert.equal(sortRows(rows, {}), rows);
});

test('sortRows: 오름/내림 정렬 + 원본 불변', () => {
  const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];
  const asc = sortRows(rows, { key: 'n', dir: 'asc' });
  assert.deepEqual(asc.map(r => r.n), [1, 2, 3]);
  const desc = sortRows(rows, { key: 'n', dir: 'desc' });
  assert.deepEqual(desc.map(r => r.n), [3, 2, 1]);
  assert.deepEqual(rows.map(r => r.n), [3, 1, 2]); // 원본 불변
});

test('sortRows: val 함수로 파생 키 정렬(예: 완료율)', () => {
  const rows = [{ done: 1, req: 2 }, { done: 9, req: 10 }, { done: 1, req: 4 }];
  const val = (r, k) => k === 'rate' ? pct(r.done, r.req) : r[k];
  const asc = sortRows(rows, { key: 'rate', dir: 'asc' }, val);
  assert.deepEqual(asc.map(r => pct(r.done, r.req)), [25, 50, 90]);
});

test('sortRows: 안정 정렬(동률 시 입력 순서 유지)', () => {
  const rows = [{ n: 1, id: 'a' }, { n: 1, id: 'b' }, { n: 1, id: 'c' }];
  const asc = sortRows(rows, { key: 'n', dir: 'asc' });
  assert.deepEqual(asc.map(r => r.id), ['a', 'b', 'c']);
});
