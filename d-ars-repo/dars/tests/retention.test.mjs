// tests/retention.test.mjs — 개인정보 보관/파기 순수 헬퍼 단위 테스트 (무의존성, DB 불필요)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maskPhone, retentionDays, retentionEnabled, cutoffISO, purgePlan,
  DEFAULT_RETENTION_DAYS, MIN_RETENTION_DAYS, PII_TABLES,
} from '../lib/retention.js';

test('maskPhone — 하이픈 번호는 가운데를 가리고 형식 유지', () => {
  assert.equal(maskPhone('010-1234-5678'), '010-****-5678');
  assert.equal(maskPhone('02-123-4567'), '021-**-4567'); // 숫자 9자리: head3+mid2+tail4
});

test('maskPhone — 하이픈 없는 번호도 가운데를 가림', () => {
  assert.equal(maskPhone('01012345678'), '010****5678');
});

test('maskPhone — 전화번호로 보기 어려운 값/빈 값/널은 원본 보존', () => {
  assert.equal(maskPhone(''), '');
  assert.equal(maskPhone('123'), '123');
  assert.equal(maskPhone(null), null);
  assert.equal(maskPhone(undefined), undefined);
});

test('retentionDays — 미설정/이상값은 안전 기본, 정상값은 반영', () => {
  assert.equal(retentionDays({}), DEFAULT_RETENTION_DAYS);
  assert.equal(retentionDays({ RETENTION_DAYS: 'abc' }), DEFAULT_RETENTION_DAYS);
  assert.equal(retentionDays({ RETENTION_DAYS: '5' }), DEFAULT_RETENTION_DAYS); // 하한 미만 → 기본
  assert.equal(retentionDays({ RETENTION_DAYS: String(MIN_RETENTION_DAYS) }), MIN_RETENTION_DAYS);
  assert.equal(retentionDays({ RETENTION_DAYS: '365' }), 365);
});

test('retentionEnabled — 명시적 1 일 때만 true', () => {
  assert.equal(retentionEnabled({}), false);
  assert.equal(retentionEnabled({ RETENTION_ENABLE: '0' }), false);
  assert.equal(retentionEnabled({ RETENTION_ENABLE: 'true' }), false);
  assert.equal(retentionEnabled({ RETENTION_ENABLE: '1' }), true);
});

test('cutoffISO — 경과 경계 시각을 과거로 계산', () => {
  const now = new Date('2026-07-17T00:00:00.000Z');
  assert.equal(cutoffISO(now, 180), new Date('2026-01-18T00:00:00.000Z').toISOString());
  // days=0 이면 경계는 곧 현재
  assert.equal(cutoffISO(now, 0), now.toISOString());
});

test('purgePlan — PII 테이블마다 미리보기·파기문을 파라미터화하여 생성', () => {
  const cutoff = '2026-01-18T00:00:00.000Z';
  const plan = purgePlan(cutoff);
  assert.equal(plan.length, PII_TABLES.length);
  const s = plan.find((p) => p.table === 'visual_sessions');
  assert.ok(s, 'visual_sessions 계획 존재');
  assert.deepEqual(s.params, [cutoff]);
  assert.match(s.count, /select count\(\*\)::int as n from visual_sessions where started_at < \$1 and phone is not null/);
  assert.match(s.purge, /update visual_sessions set phone = null where started_at < \$1 and phone is not null/);
  // 파기문은 반드시 날짜·PII 조건을 포함(전량 삭제 방지)
  for (const p of plan) {
    assert.match(p.purge, /where .+ < \$1 and .+ is not null/);
    assert.doesNotMatch(p.purge, /delete/i); // 행 삭제가 아니라 익명화만
  }
});
