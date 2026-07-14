// tests/notifyrules.test.mjs — 알림 임계값 설정화(lib/notifyRules) 회귀 테스트 (무의존성 · 순수 로직)
// 핵심 계약: (1) 기본값 = 기존 하드코딩 상수(하위호환), (2) 쓰레기 입력은 클램핑/기본값으로 흡수,
//            (3) 기본값이면 요청 URL 이 기존과 동일, (4) 임계값이 실제 알림 도출을 바꾼다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THRESHOLD_SPEC, DEFAULT_THRESHOLDS, clampThreshold, normalizeThresholds,
  diffFromDefaults, isDefaults, parseThresholdParams, notifyUrl,
} from '../lib/notifyRules.js';
import { deriveNotifications } from '../lib/notify.js';

const FIXED = 1_700_000_000_000;

test('기본값은 기존 하드코딩 상수와 동일(하위호환)', () => {
  assert.deepEqual(DEFAULT_THRESHOLDS, {
    docMinReq: 50, docPct: 60, umsFailBad: 3, umsWait: 3, sessionSec: 180, dropPct: 8,
  });
  assert.ok(THRESHOLD_SPEC.every(s => s.min <= s.def && s.def <= s.max));
});

test('clampThreshold: 범위 클램핑·정수화·비숫자는 null', () => {
  assert.equal(clampThreshold('docPct', 0), 1);       // min
  assert.equal(clampThreshold('docPct', 999), 100);   // max
  assert.equal(clampThreshold('docPct', '70.9'), 70); // 문자열·소수 → 정수
  assert.equal(clampThreshold('sessionSec', -5), 30);
  assert.equal(clampThreshold('docPct', 'abc'), null);
  assert.equal(clampThreshold('docPct', null), null);
  assert.equal(clampThreshold('알수없는키', 5), null);
});

test('normalizeThresholds: 항상 완전한 집합 · 미지의 키 무시 · 잘못된 값은 기본값', () => {
  assert.deepEqual(normalizeThresholds(null), DEFAULT_THRESHOLDS);
  assert.deepEqual(normalizeThresholds('쓰레기'), DEFAULT_THRESHOLDS);
  const n = normalizeThresholds({ docPct: 75, dropPct: 'x', evil: 1 });
  assert.equal(n.docPct, 75);
  assert.equal(n.dropPct, DEFAULT_THRESHOLDS.dropPct);
  assert.equal(n.evil, undefined);
  assert.equal(Object.keys(n).length, THRESHOLD_SPEC.length);
});

test('normalizeThresholds 는 DEFAULT_THRESHOLDS 를 오염시키지 않는다', () => {
  const n = normalizeThresholds({ docPct: 99 });
  n.docPct = 1;
  assert.equal(DEFAULT_THRESHOLDS.docPct, 60);
});

test('diffFromDefaults/isDefaults: 바뀐 항목만 추림', () => {
  assert.deepEqual(diffFromDefaults(DEFAULT_THRESHOLDS), {});
  assert.equal(isDefaults(undefined), true);
  assert.deepEqual(diffFromDefaults({ ...DEFAULT_THRESHOLDS, docPct: 70 }), { docPct: 70 });
  assert.equal(isDefaults({ ...DEFAULT_THRESHOLDS, docPct: 70 }), false);
});

test('notifyUrl: 기본값이면 기존 URL 그대로(캐시 키 유지), 변경분만 파라미터로', () => {
  assert.equal(notifyUrl('/api/notifications', DEFAULT_THRESHOLDS), '/api/notifications');
  const u = notifyUrl('/api/notifications', { ...DEFAULT_THRESHOLDS, docPct: 70, sessionSec: 240 });
  const sp = new URL(u, 'http://local').searchParams;
  assert.equal(sp.get('docPct'), '70');
  assert.equal(sp.get('sessionSec'), '240');
  assert.equal(sp.get('dropPct'), null); // 기본값은 싣지 않는다
});

test('parseThresholdParams: 파라미터 없으면 기본값(기존 동작)', () => {
  assert.deepEqual(parseThresholdParams('http://local/api/notifications'), DEFAULT_THRESHOLDS);
  assert.deepEqual(parseThresholdParams('완전-잘못된-url'), DEFAULT_THRESHOLDS);
});

test('parseThresholdParams: 값 파싱·클램핑 · 인젝션/쓰레기 문자열은 기본값 폴백', () => {
  const t = parseThresholdParams('http://local/api/notifications?docPct=70&sessionSec=99999&dropPct=0');
  assert.equal(t.docPct, 70);
  assert.equal(t.sessionSec, 3600); // max 클램핑
  assert.equal(t.dropPct, 1);       // min 클램핑
  const bad = parseThresholdParams("http://local/api/notifications?docPct=1;drop%20table%20docs&umsWait=");
  assert.deepEqual(bad, DEFAULT_THRESHOLDS);
});

test('도출 연동: 임계값을 안 주면 기존과 동일 결과(하위호환)', () => {
  const docs = [{ name: '가입신청서', req: 100, done: 55, in_use: true }]; // 55% < 60 → warn
  const a = deriveNotifications({ docs }, FIXED);
  const b = deriveNotifications({ docs }, FIXED, undefined);
  assert.deepEqual(a.notes, b.notes);
  assert.equal(a.summary.warn, 1);
  assert.deepEqual(a.thresholds, DEFAULT_THRESHOLDS);
});

test('도출 연동: 서류 완료율 하한을 낮추면 알림이 사라진다', () => {
  const docs = [{ name: '가입신청서', req: 100, done: 55, in_use: true }];
  const { summary } = deriveNotifications({ docs }, FIXED, { docPct: 50 });
  assert.equal(summary.warn, 0);
  assert.equal(summary.total, 1); // ok 요약만
});

test('도출 연동: 최소 요청 건수를 올리면 소량 서류가 제외된다', () => {
  const docs = [{ name: '소액서류', req: 60, done: 0, in_use: true }];
  assert.equal(deriveNotifications({ docs }, FIXED).summary.warn, 1);
  assert.equal(deriveNotifications({ docs }, FIXED, { docMinReq: 100 }).summary.warn, 0);
});

test('도출 연동: UMS 실패 긴급 기준 · 대기 기준', () => {
  const ums = [{ status: '실패' }, { status: '실패' }, { status: '대기' }, { status: '대기' }];
  const base = deriveNotifications({ ums }, FIXED);     // 실패 2 < 3 → warn, 대기 2 < 3 → 없음
  assert.equal(base.summary.bad, 0);
  assert.equal(base.summary.warn, 1);
  assert.equal(base.summary.info, 0);
  const tight = deriveNotifications({ ums }, FIXED, { umsFailBad: 2, umsWait: 2 });
  assert.equal(tight.summary.bad, 1);   // 실패 2 ≥ 2 → 긴급
  assert.equal(tight.summary.info, 1);  // 대기 2 ≥ 2 → 정보
});

test('도출 연동: 장기 세션 경과 · 이탈률 임계값', () => {
  const sessions = [{ id: 'S1', scenario: '가입', elapsed: 150 }];
  const daily = [{ day: '2026-07-12', inbound: 100, dropped: 6 }]; // 6% < 8
  assert.equal(deriveNotifications({ sessions, daily }, FIXED).summary.warn, 0);
  const t = deriveNotifications({ sessions, daily }, FIXED, { sessionSec: 120, dropPct: 5 });
  assert.equal(t.summary.warn, 2); // 장기 세션 + 이탈률
});

test('도출 연동: 적용된 임계값을 응답에 담는다(클램핑 후 값)', () => {
  const { thresholds } = deriveNotifications({}, FIXED, { docPct: 999 });
  assert.equal(thresholds.docPct, 100);
  assert.equal(thresholds.sessionSec, DEFAULT_THRESHOLDS.sessionSec);
});
