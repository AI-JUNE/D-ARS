// tests/eumsenior.test.mjs — 이음 어르신 신청 화면 흐름 로직 단위 테스트
// 계약: URL(?step=) 의 단계는 항상 실제 선택 상태로 잘린다 · 제출 본문에 개인정보가 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITIES,
  TIMESLOTS,
  STEP_TITLE,
  parseStep,
  clampStep,
  maxReachableStep,
  labelOf,
  summaryText,
  buildPreferences,
  storageKey,
  EUM_STEP_MAX,
} from '../lib/eumSenior.js';

test('선택지는 각 4개다(한 화면 버튼 4개 이내 요건)', () => {
  assert.equal(ACTIVITIES.length, 4);
  assert.equal(TIMESLOTS.length, 4);
  for (const o of [...ACTIVITIES, ...TIMESLOTS]) {
    assert.ok(o.k && o.label, '키와 표시 이름이 모두 있어야 한다');
  }
  const keys = [...ACTIVITIES, ...TIMESLOTS].map((o) => o.k);
  assert.equal(new Set(keys).size, keys.length, '키 중복 금지');
});

test('단계는 4개이고 모든 단계에 제목이 있다', () => {
  assert.equal(EUM_STEP_MAX, 4);
  for (let i = 1; i <= 4; i++) assert.ok(STEP_TITLE[i], `${i}단계 제목 누락`);
});

test('parseStep: 범위 밖·이상값은 1단계로 되돌린다', () => {
  assert.equal(parseStep('3'), 3);
  assert.equal(parseStep(2), 2);
  assert.equal(parseStep('2.7'), 2);
  assert.equal(parseStep(['3']), 3);
  assert.equal(parseStep('0'), 1);
  assert.equal(parseStep('5'), 1);
  assert.equal(parseStep('열'), 1);
  assert.equal(parseStep(null), 1);
  assert.equal(parseStep(undefined), 1);
});

test('maxReachableStep: 선택이 쌓인 만큼만 앞으로 갈 수 있다', () => {
  assert.equal(maxReachableStep({}), 1);
  assert.equal(maxReachableStep({ activity: '없는값' }), 1);
  assert.equal(maxReachableStep({ activity: 'walk' }), 2);
  assert.equal(maxReachableStep({ activity: 'walk', timeslot: '없는값' }), 2);
  assert.equal(maxReachableStep({ activity: 'walk', timeslot: 'morning' }), 3);
  assert.equal(maxReachableStep({ done: true }), 4);
  assert.equal(maxReachableStep(null), 1);
});

test('clampStep: 새로고침으로 선택이 사라진 채 ?step=3 이면 1단계로 되돌린다', () => {
  assert.equal(clampStep(3, {}), 1);
  assert.equal(clampStep(3, { activity: 'walk' }), 2);
  assert.equal(clampStep(3, { activity: 'walk', timeslot: 'any' }), 3);
  assert.equal(clampStep(1, { activity: 'walk', timeslot: 'any' }), 1, '뒤로 가기는 허용');
});

test('clampStep: 제출 완료 뒤에는 뒤로 가도 완료 화면에 머문다(중복 제출 방지)', () => {
  assert.equal(clampStep(1, { activity: 'walk', timeslot: 'any', done: true }), 4);
  assert.equal(clampStep(9, { activity: 'walk', timeslot: 'any', done: true }), 4);
});

test('labelOf·summaryText: 값이 없거나 규격 밖이면 빈 문자열이다', () => {
  assert.equal(labelOf(ACTIVITIES, 'walk'), '산책·나들이');
  assert.equal(labelOf(ACTIVITIES, '없는값'), '');
  assert.equal(labelOf(null, 'walk'), '');
  assert.equal(summaryText({ activity: 'walk', timeslot: 'morning' }), '산책·나들이 · 오전 (9시~12시)');
  assert.equal(summaryText({ activity: 'walk' }), '');
  assert.equal(summaryText(null), '');
});

test('buildPreferences: 정상 본문에는 sid·선택·제출시각만 담긴다(개인정보 없음)', () => {
  const now = 1_760_000_000_000;
  const body = buildPreferences({ sid: 's-1001', activity: 'walk', timeslot: 'morning' }, now);
  assert.deepEqual(Object.keys(body).sort(), ['activity', 'sid', 'submittedAt', 'timeslot']);
  assert.equal(body.sid, 's-1001');
  assert.equal(body.submittedAt, new Date(now).toISOString());
});

test('buildPreferences: 선택 누락·규격 밖이면 null(제출을 막는다)', () => {
  assert.equal(buildPreferences({ sid: 's-1', activity: 'walk' }), null);
  assert.equal(buildPreferences({ sid: 's-1', activity: '없는값', timeslot: 'morning' }), null);
  assert.equal(buildPreferences({ sid: '', activity: 'walk', timeslot: 'morning' }), null);
  assert.equal(buildPreferences(null), null);
});

test('storageKey: sid 별로 구분되고 값이 없으면 빈 문자열이다', () => {
  assert.equal(storageKey('s-1001'), 'dars.eum.senior.s-1001');
  assert.notEqual(storageKey('s-1001'), storageKey('s-1002'));
  assert.equal(storageKey(''), '');
  assert.equal(storageKey(null), '');
});
