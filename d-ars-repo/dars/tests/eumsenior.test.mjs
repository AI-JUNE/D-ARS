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
  normalizeDraft,
  parseDraft,
  stepQuery,
  DRAFT_PARAM,
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

// ── 고른 것을 주소에 남긴다 ────────────────────────────────────────────────
// 고친 결함: 선택이 화면 메모리에만 있어, 탭이 되살아나며 다시 불러와지면(문자 확인하러 앱을
// 바꿨다 돌아오는 것만으로도 일어난다) 고른 것이 전부 사라지고 1단계로 돌아갔다. 링크 수명은
// 5분이라 두어 번이면 링크가 먼저 죽는다. 아래 계약이 그 회귀를 막는다.

test('parseDraft: Next 의 searchParams(평면 객체)와 URLSearchParams 를 모두 읽는다', () => {
  assert.deepEqual(parseDraft({ a: 'walk', t: 'morning' }), { activity: 'walk', timeslot: 'morning' });
  assert.deepEqual(
    parseDraft(new URLSearchParams('step=3&a=talk&t=any')),
    { activity: 'talk', timeslot: 'any' },
  );
  // 같은 이름이 여러 번 실리면 첫 값만 본다(?a=walk&a=talk).
  assert.deepEqual(parseDraft({ a: ['walk', 'talk'] }), { activity: 'walk', timeslot: '' });
});

test('parseDraft: 주소는 누구나 고친다 — 목록 밖 값은 빈 값으로 떨어진다', () => {
  for (const bad of ['<script>', 'WALK', 'walk ', '없는값', '', '../../etc', 'walk&t=any']) {
    assert.equal(parseDraft({ a: bad }).activity, '', `거르지 못한 값: ${bad}`);
  }
  assert.deepEqual(parseDraft({ a: { k: 'walk' }, t: 7 }), { activity: '', timeslot: '' });
  assert.deepEqual(parseDraft(null), { activity: '', timeslot: '' });
  assert.deepEqual(parseDraft(undefined), { activity: '', timeslot: '' });
});

test('parseDraft: 읽다가 던지는 객체에도 throw 하지 않는다(뒤로가기가 화면을 죽이면 안 된다)', () => {
  const hostile = { get value() { throw new Error('boom'); } };
  Object.defineProperty(hostile, 'a', { get() { throw new Error('boom'); }, enumerable: true });
  assert.deepEqual(parseDraft(hostile), { activity: '', timeslot: '' });
});

test('normalizeDraft: 규격 밖 선택은 고르지 않은 것과 같게 다룬다', () => {
  assert.deepEqual(normalizeDraft({ activity: 'walk', timeslot: 'any' }), { activity: 'walk', timeslot: 'any' });
  assert.deepEqual(normalizeDraft({ activity: 'walk', timeslot: '없는값' }), { activity: 'walk', timeslot: '' });
  assert.deepEqual(normalizeDraft(null), { activity: '', timeslot: '' });
  // 넘겨도 되는 값만 나온다 — done·sid 같은 것이 섞여 나가지 않는다.
  assert.deepEqual(
    Object.keys(normalizeDraft({ activity: 'walk', timeslot: 'any', done: true, sid: 's-1' })).sort(),
    ['activity', 'timeslot'],
  );
});

test('stepQuery: 단계와 고른 것을 함께 싣고, 고르지 않은 것은 싣지 않는다', () => {
  assert.equal(stepQuery(1, {}), '?step=1');
  assert.equal(stepQuery(2, { activity: 'walk' }), '?step=2&a=walk');
  assert.equal(stepQuery(3, { activity: 'walk', timeslot: 'morning' }), '?step=3&a=walk&t=morning');
  assert.equal(stepQuery(3, { activity: '없는값', timeslot: 'morning' }), '?step=3&t=morning');
  assert.equal(stepQuery('9', { activity: 'walk' }), '?step=1&a=walk', '범위 밖 단계는 1로');
});

test('stepQuery: 완료(done)는 어떤 경우에도 주소에 실리지 않는다', () => {
  // 실으면 주소 한 줄로 「신청이 접수되었습니다」 화면이 만들어진다.
  const q = stepQuery(4, { activity: 'walk', timeslot: 'any', done: true });
  assert.equal(q, '?step=4&a=walk&t=any');
  assert.ok(!q.includes('done'), `완료 상태가 주소에 실렸다: ${q}`);
  assert.ok(!Object.keys(DRAFT_PARAM).includes('done'));
});

test('stepQuery: 주소에 나가는 값은 고정 어휘뿐이라 이스케이프가 필요 없다', () => {
  const values = [...ACTIVITIES, ...TIMESLOTS].map((o) => o.k);
  for (const v of values) {
    assert.match(v, /^[a-z]+$/, `주소에 그대로 실리는 값은 안전한 문자여야 한다: ${v}`);
    assert.equal(encodeURIComponent(v), v);
  }
  // 파라미터 이름도 짧은 고정 어휘다(토큰 옆에 긴 흔적을 남기지 않는다).
  for (const k of Object.values(DRAFT_PARAM)) assert.match(k, /^[a-z]$/);
});

test('주소 왕복: 고른 것이 그대로 돌아오고 단계도 유지된다(탭 복원)', () => {
  for (const a of ACTIVITIES) {
    for (const t of TIMESLOTS) {
      const draft = { activity: a.k, timeslot: t.k };
      const q = new URLSearchParams(stepQuery(3, draft).slice(1));
      assert.deepEqual(parseDraft(q), draft);
      assert.equal(clampStep(parseStep(q.get('step')), { ...parseDraft(q), done: false }), 3);
    }
  }
});

test('주소 왕복: 선택을 지운 주소는 단계도 함께 되돌아간다(건너뛰기 불가)', () => {
  const forged = new URLSearchParams('step=3&a=없는값&t=morning');
  const draft = parseDraft(forged);
  assert.deepEqual(draft, { activity: '', timeslot: 'morning' });
  assert.equal(clampStep(parseStep(forged.get('step')), { ...draft, done: false }), 1);
});

test('주소만으로는 완료 화면에 닿을 수 없다(접수는 서버 응답에서만 온다)', () => {
  const q = new URLSearchParams('step=4&a=walk&t=morning&done=1');
  const draft = parseDraft(q);
  assert.ok(!('done' in draft));
  assert.equal(clampStep(parseStep(q.get('step')), { ...draft, done: false }), 3, '확인 화면까지만');
});

test('storageKey: sid 별로 구분되고 값이 없으면 빈 문자열이다', () => {
  assert.equal(storageKey('s-1001'), 'dars.eum.senior.s-1001');
  assert.notEqual(storageKey('s-1001'), storageKey('s-1002'));
  assert.equal(storageKey(''), '');
  assert.equal(storageKey(null), '');
});
