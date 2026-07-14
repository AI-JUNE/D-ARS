// tests/notify.test.mjs — 알림 자동 도출 순수 로직 단위 테스트 (무의존성)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveNotifications } from '../lib/notify.js';

const FIXED = 1_700_000_000_000; // 결정적 타임스탬프

// 아무 이상 신호가 없는 최소 입력: '콜봇 연동 정상'(ok) 1건만 존재
test('기본: 이상 없으면 ok 요약 1건만', () => {
  const { notes, summary } = deriveNotifications({}, FIXED);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].level, 'ok');
  assert.equal(notes[0].cat, '시스템');
  assert.equal(notes[0].ts, FIXED);
  assert.deepEqual(summary, { total: 1, bad: 0, warn: 0, info: 0 });
});

test('서류: 운영 중·요청50↑·완료율60%미만 → warn, 그 외 미발생', () => {
  const docs = [
    { name: '가입신청서', req: 100, done: 50, in_use: true },   // 50% → warn
    { name: '동의서', req: 100, done: 80, in_use: true },       // 80% → 무시
    { name: '소액서류', req: 40, done: 0, in_use: true },       // req<50 → 무시
    { name: '미운영서류', req: 100, done: 0, in_use: false },   // 미운영 → 무시
  ];
  const { notes } = deriveNotifications({ docs }, FIXED);
  const docNotes = notes.filter(n => n.cat === '서류');
  assert.equal(docNotes.length, 1);
  assert.equal(docNotes[0].level, 'warn');
  assert.match(docNotes[0].title, /가입신청서 완료율 50%/);
});

test('UMS: 실패 3건 이상 → bad, 1~2건 → warn', () => {
  const bad = deriveNotifications({ ums: [{ status: '실패' }, { status: '실패' }, { status: '실패' }] }, FIXED);
  assert.equal(bad.notes.find(n => n.cat === 'UMS').level, 'bad');
  const warn = deriveNotifications({ ums: [{ status: '실패' }] }, FIXED);
  assert.equal(warn.notes.find(n => n.cat === 'UMS').level, 'warn');
});

test('UMS: 대기 3건 이상 → info, 2건 이하 미발생', () => {
  const three = deriveNotifications({ ums: [{ status: '대기' }, { status: '대기' }, { status: '대기' }] }, FIXED);
  const waitNote = three.notes.find(n => n.title.includes('대기'));
  assert.ok(waitNote && waitNote.level === 'info');
  const two = deriveNotifications({ ums: [{ status: '대기' }, { status: '대기' }] }, FIXED);
  assert.equal(two.notes.filter(n => n.title.includes('대기')).length, 0);
});

test('세션: 경과 180초 이상만 장기 진행 알림', () => {
  const sessions = [
    { id: 'S1', scenario: '주문상세', elapsed: 179 },  // 경계 미만 → 무시
    { id: 'S2', scenario: '배송추적', elapsed: 200 },  // → warn
  ];
  const { notes } = deriveNotifications({ sessions }, FIXED);
  const sNotes = notes.filter(n => n.cat === '세션');
  assert.equal(sNotes.length, 1);
  assert.match(sNotes[0].title, /S2/);
  assert.match(sNotes[0].body, /3분 20초/);
});

test('통계: 이탈률 8% 이상만 알림(최근일 기준)', () => {
  const hi = deriveNotifications({ daily: [{ day: '07-01', inbound: 1000, dropped: 50 }, { day: '07-02', inbound: 1000, dropped: 100 }] }, FIXED);
  assert.ok(hi.notes.find(n => n.cat === '통계'));
  const lo = deriveNotifications({ daily: [{ day: '07-02', inbound: 1000, dropped: 50 }] }, FIXED);
  assert.equal(lo.notes.filter(n => n.cat === '통계').length, 0);
});

test('정렬·요약: bad가 먼저, 요약 카운트 일치', () => {
  const { notes, summary } = deriveNotifications({
    docs: [{ name: 'A', req: 100, done: 10, in_use: true }],           // warn
    ums: [{ status: '실패' }, { status: '실패' }, { status: '실패' }], // bad
    daily: [{ day: '07-02', inbound: 1000, dropped: 200 }],            // warn
  }, FIXED);
  assert.equal(notes[0].level, 'bad');                 // 최우선
  assert.equal(notes[notes.length - 1].level, 'ok');   // 최하위(항상 존재)
  assert.equal(summary.bad, 1);
  assert.equal(summary.warn, 2);
  assert.equal(summary.total, notes.length);
});

test('id는 카테고리·삽입순서 기반, ts는 주입값', () => {
  const { notes } = deriveNotifications({ ums: [{ status: '실패' }] }, FIXED);
  assert.ok(notes.every(n => n.ts === FIXED));
  assert.ok(notes.every(n => typeof n.id === 'string' && n.id.includes('-')));
});
