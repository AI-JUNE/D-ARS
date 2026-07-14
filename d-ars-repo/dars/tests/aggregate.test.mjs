// tests/aggregate.test.mjs — 서버 집계 유틸 회귀 테스트 (의존성 0 · node:test)
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyAgg, aggregateRows, foldGroups, aggCount, readAgg, aggUrl } from '../lib/aggregate.js';

const rows = [
  { result: '완료', channel: '화면 표출', duration: 100 },
  { result: '완료', channel: '음성 안내', duration: 50 },
  { result: '이탈', channel: '화면 표출', duration: 30 },
  { result: '상담원 전환', channel: '화면 표출', duration: 20 },
];

test('emptyAgg: 안전한 기본값', () => {
  assert.deepEqual(emptyAgg(), { total: 0, byResult: {}, byChannel: [], avgDuration: 0 });
});

test('aggregateRows: 결과·채널 카운트와 평균 소요', () => {
  const a = aggregateRows(rows);
  assert.equal(a.total, 4);
  assert.equal(a.byResult['완료'], 2);
  assert.equal(a.byResult['이탈'], 1);
  assert.equal(a.byResult['상담원 전환'], 1);
  assert.equal(a.avgDuration, 50); // (100+50+30+20)/4
  assert.deepEqual(a.byChannel[0], { name: '화면 표출', count: 3 });
});

test('aggregateRows: 빈 배열·비배열은 0분모 방지', () => {
  assert.equal(aggregateRows([]).avgDuration, 0);
  assert.equal(aggregateRows(null).total, 0);
});

test('aggregateRows: duration 누락·문자열은 안전 처리', () => {
  const a = aggregateRows([{ result: '완료', channel: 'A' }, { result: '완료', channel: 'A', duration: '10' }]);
  assert.equal(a.total, 2);
  assert.equal(a.avgDuration, 5); // 누락은 0으로 취급
});

test('aggregateRows: result/channel 누락은 "기타"', () => {
  const a = aggregateRows([{ duration: 4 }]);
  assert.equal(a.byResult['기타'], 1);
  assert.equal(a.byChannel[0].name, '기타');
});

test('foldGroups: DB group-by 결과 접기', () => {
  const a = foldGroups([
    { result: '완료', channel: '화면 표출', n: 3, dur: 300 },
    { result: '이탈', channel: '화면 표출', n: 1, dur: 20 },
    { result: '완료', channel: '음성 안내', n: 2, dur: 80 },
  ]);
  assert.equal(a.total, 6);
  assert.equal(a.byResult['완료'], 5);
  assert.equal(a.byResult['이탈'], 1);
  assert.equal(a.avgDuration, 67); // 400/6 = 66.67 → 67
  assert.deepEqual(a.byChannel.map((c) => c.count), [4, 2]);
});

test('foldGroups: 빈 입력 안전', () => {
  assert.deepEqual(foldGroups([]), emptyAgg());
  assert.deepEqual(foldGroups(undefined), emptyAgg());
});

test('byChannel: 건수 내림차순, 동수는 이름 오름차순', () => {
  const a = aggregateRows([
    { result: '완료', channel: '나', duration: 1 },
    { result: '완료', channel: '가', duration: 1 },
    { result: '완료', channel: '다', duration: 1 },
    { result: '완료', channel: '다', duration: 1 },
  ]);
  assert.deepEqual(a.byChannel.map((c) => c.name), ['다', '가', '나']);
});

test('aggCount: 없는 키는 0', () => {
  const a = aggregateRows(rows);
  assert.equal(aggCount(a, '완료'), 2);
  assert.equal(aggCount(a, '없는결과'), 0);
  assert.equal(aggCount(null, '완료'), 0);
});

test('readAgg: 정상 응답 정규화', () => {
  const a = readAgg({ total: 5, byResult: { '완료': 3 }, byChannel: [{ name: 'A', count: '2' }], avgDuration: 12 });
  assert.equal(a.total, 5);
  assert.equal(a.byResult['완료'], 3);
  assert.deepEqual(a.byChannel, [{ name: 'A', count: 2 }]);
  assert.equal(a.avgDuration, 12);
});

test('readAgg: 깨진 응답(배열·null·문자열)도 화면을 깨뜨리지 않음', () => {
  assert.deepEqual(readAgg(null), emptyAgg());
  assert.deepEqual(readAgg([1, 2]), emptyAgg());
  assert.deepEqual(readAgg('oops'), emptyAgg());
  assert.deepEqual(readAgg({}), emptyAgg());
});

test('aggUrl: 조건 파라미터 + agg=1, 빈 값·전체는 생략', () => {
  assert.equal(aggUrl('/api/multimodal', { q: '', params: { channel: '전체' } }), '/api/multimodal?agg=1');
  const u = new URL(aggUrl('/api/multimodal', { q: ' 대출 ', params: { channel: '음성 안내', empty: '' } }), 'http://x');
  assert.equal(u.searchParams.get('q'), '대출');
  assert.equal(u.searchParams.get('channel'), '음성 안내');
  assert.equal(u.searchParams.get('agg'), '1');
  assert.equal(u.searchParams.has('empty'), false);
});
