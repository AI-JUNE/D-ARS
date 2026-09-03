// tests/backupcheck.test.mjs — 백업·복구 준비도 판정(126회차)
// 유닛: 순수 로직 계약. 통합: db/*.sql 실선언 ↔ RUNBOOK 커버리지 목록 양방향 대조 · 리허설 기록 파일 형식.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  stripSqlComments, tablesInSql, COVERED_TABLES, uncoveredTables, staleCoverage,
  REHEARSAL_STEPS, DEFAULT_REHEARSAL_MAX_AGE_DAYS, normalizeRehearsal, missingSteps,
  rehearsalStatus, compareRowCounts, rowCountProblems,
} from '../lib/backupCheck.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86400000;
const NOW = Date.parse('2026-09-03T00:00:00Z');
const full = (at, by = '고원 운영') => ({ at, by, steps: REHEARSAL_STEPS.slice() });

// ---- 스키마 선언 추출 ----

test('create table 선언에서 테이블 이름을 사전순·중복 제거로 뽑는다', () => {
  const sql = 'create table if not exists b (id int);\ncreate table a (id int);\ncreate table if not exists b (id int);';
  assert.deepEqual(tablesInSql(sql), ['a', 'b']);
});

test('주석 처리된 DDL 은 선언으로 보지 않는다(db/retention.sql 의 미적용 예시)', () => {
  const sql = 'create table real_t (id int);\n-- create table ghost_t (id int);';
  assert.deepEqual(tablesInSql(sql), ['real_t']);
});

test('줄 주석 제거는 행 수를 보존한다(행 번호 기반 도구와 호환)', () => {
  const out = stripSqlComments('a -- x\nb\n-- c');
  assert.equal(out.split('\n').length, 3);
  assert.equal(out.split('\n')[1], 'b');
});

test('스키마 한정·인용 이름에서도 테이블 이름만 뽑는다', () => {
  assert.deepEqual(tablesInSql('create table public."Audit_Events" (id int);'), ['audit_events']);
});

test('이상 입력에 throw 하지 않는다', () => {
  for (const bad of [null, undefined, 123, {}, '']) {
    assert.deepEqual(tablesInSql(bad), []);
    assert.equal(stripSqlComments(bad), '');
  }
});

test('커버리지 대조는 양방향이다(누락·유령 항목을 각각 보고)', () => {
  assert.deepEqual(uncoveredTables(['a', 'b'], ['a']), ['b']);       // 스키마에만 있음 = 복구 검증 누락
  assert.deepEqual(staleCoverage(['a'], ['a', 'zz']), ['zz']);        // 목록에만 있음 = 유령 항목
  assert.deepEqual(uncoveredTables(['a'], ['a']), []);
  assert.deepEqual(staleCoverage(['a'], ['a']), []);
  assert.deepEqual(uncoveredTables(null, null), []);
  assert.deepEqual(staleCoverage(null, null), []);
});

// ---- 통합: 실제 db/*.sql ↔ COVERED_TABLES ----

test('통합: db/*.sql 이 선언한 표와 RUNBOOK 커버리지 목록이 정확히 일치한다', () => {
  const dir = path.join(ROOT, 'db');
  const sql = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  const declared = tablesInSql(sql);
  assert.ok(declared.length > 0, 'db/*.sql 에서 표 선언을 하나도 못 찾았다');
  assert.deepEqual(uncoveredTables(declared), [], '새 표가 복구 검증 대상에서 빠졌다 — lib/backupCheck.COVERED_TABLES 와 RUNBOOK.md 를 갱신하라');
  assert.deepEqual(staleCoverage(declared), [], '없는 표가 커버리지 목록에 남아 있다');
});

test('통합: RUNBOOK.md 가 존재하고 커버리지 표를 모두 언급한다', () => {
  const md = fs.readFileSync(path.join(ROOT, 'RUNBOOK.md'), 'utf8');
  for (const t of COVERED_TABLES) assert.ok(md.includes(t), `RUNBOOK.md 에 ${t} 언급이 없다`);
  for (const s of REHEARSAL_STEPS) assert.ok(md.includes(s), `RUNBOOK.md 에 리허설 단계 ${s} 설명이 없다`);
});

// ---- 리허설 기록 ----

test('정규화: 알 수 없는 단계명은 버리고 선언 순서로 정렬한다', () => {
  const n = normalizeRehearsal({ at: '2026-09-01T00:00:00Z', steps: ['app', 'oops', 'snapshot'], by: '고원' });
  assert.deepEqual(n.steps, ['snapshot', 'app']);
  assert.equal(n.by, '고원');
  assert.equal(n.note, '');
  assert.equal(typeof n.at, 'number');
});

test('정규화: 이상 입력에 throw 하지 않고 빈 기록으로 만든다', () => {
  for (const bad of [null, undefined, 'x', 42, { at: 'not-a-date', steps: 'app' }]) {
    const n = normalizeRehearsal(bad);
    assert.equal(n.at, null);
    assert.deepEqual(n.steps, []);
  }
});

test('빠진 단계를 선언 순서로 보고한다', () => {
  assert.deepEqual(missingSteps({ at: '2026-09-01', steps: ['restore', 'snapshot'] }), ['schema', 'rowcount', 'app', 'signoff']);
  assert.deepEqual(missingSteps(full('2026-09-01')), []);
});

test("기록이 없으면 'none' 이고 필수 단계 전부를 남은 일로 보고한다", () => {
  const s = rehearsalStatus([], NOW);
  assert.equal(s.state, 'none');
  assert.equal(s.at, null);
  assert.equal(s.ageDays, null);
  assert.deepEqual(s.missing, REHEARSAL_STEPS);
  assert.deepEqual(rehearsalStatus(null, NOW).state, 'none');
  assert.deepEqual(rehearsalStatus([{ steps: REHEARSAL_STEPS }], NOW).state, 'none'); // 날짜 없는 기록은 근거가 아니다
});

test("완주 기록이 없으면 'incomplete' — 부분 수행을 근거로 삼지 않는다", () => {
  const s = rehearsalStatus([{ at: '2026-09-02T00:00:00Z', steps: ['snapshot', 'restore'] }], NOW);
  assert.equal(s.state, 'incomplete');
  assert.deepEqual(s.missing, ['schema', 'rowcount', 'app', 'signoff']);
});

test("최신 미완주 기록이 있어도 오래된 완주 기록만으로 'ok' 가 되지 않는다(경과일 기준은 완주 건)", () => {
  const recs = [
    full(new Date(NOW - 200 * DAY).toISOString()),
    { at: new Date(NOW - 1 * DAY).toISOString(), steps: ['snapshot'] },
  ];
  const s = rehearsalStatus(recs, NOW);
  assert.equal(s.state, 'stale');
  assert.equal(s.ageDays, 200);
});

test("유효기간 안의 완주 기록이면 'ok', 넘기면 'stale'", () => {
  assert.equal(rehearsalStatus([full(new Date(NOW - 10 * DAY).toISOString())], NOW).state, 'ok');
  assert.equal(rehearsalStatus([full(new Date(NOW - 89 * DAY).toISOString())], NOW).state, 'ok');
  assert.equal(rehearsalStatus([full(new Date(NOW - 91 * DAY).toISOString())], NOW).state, 'stale');
  assert.equal(DEFAULT_REHEARSAL_MAX_AGE_DAYS, 90);
});

test('유효기간 인자가 이상해도 기본값으로 되돌아간다(0·음수로 전부 stale 되는 사고 방지)', () => {
  const recs = [full(new Date(NOW - 10 * DAY).toISOString())];
  for (const bad of [0, -5, NaN, null, 'x']) assert.equal(rehearsalStatus(recs, NOW, bad).state, 'ok');
});

test('미래 날짜 기록도 throw 없이 다루고 경과일은 0 아래로 내려가지 않는다', () => {
  const s = rehearsalStatus([full(new Date(NOW + 5 * DAY).toISOString())], NOW);
  assert.equal(s.state, 'ok');
  assert.equal(s.ageDays, 0);
});

test('통합: 리허설 기록 파일이 정의된 형식이고, 현재 상태를 판정할 수 있다', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'docs', 'restore-rehearsal.json'), 'utf8');
  const doc = JSON.parse(raw);
  assert.ok(Array.isArray(doc.rehearsals), 'rehearsals 배열이 있어야 한다');
  const s = rehearsalStatus(doc.rehearsals, Date.now());
  assert.ok(['none', 'incomplete', 'stale', 'ok'].includes(s.state));
  // 기록된 항목은 전부 형식을 지켜야 한다(날짜·단계명).
  for (const r of doc.rehearsals) {
    assert.notEqual(normalizeRehearsal(r).at, null, '리허설 기록에 유효한 at(ISO 시각)이 필요하다');
  }
});

// ---- 행수 대조 ----

test('행수 대조: 표 이름 합집합을 사전순으로, 한쪽만 있으면 확인 불가(ok=false)', () => {
  const rows = compareRowCounts({ b: 1, a: 2 }, { a: 2 });
  assert.deepEqual(rows.map((r) => r.table), ['a', 'b']);
  assert.equal(rows[0].ok, true);
  assert.equal(rows[1].ok, false);
  assert.equal(rows[1].after, null);
  assert.equal(rows[1].delta, null);
});

test('행수 대조: 감소는 항상 실패, 증가는 허용치 안에서만 통과', () => {
  assert.equal(compareRowCounts({ a: 10 }, { a: 9 })[0].ok, false);
  assert.equal(compareRowCounts({ a: 10 }, { a: 12 })[0].ok, false);
  assert.equal(compareRowCounts({ a: 10 }, { a: 12 }, 3)[0].ok, true);
  assert.equal(compareRowCounts({ a: 10 }, { a: 9 }, 3)[0].ok, false);
});

test('행수 대조: 문제 항목만 추려낸다 · 이상 입력에 throw 하지 않는다', () => {
  const rows = compareRowCounts({ a: 1, b: 1 }, { a: 1, b: 0 });
  assert.deepEqual(rowCountProblems(rows).map((r) => r.table), ['b']);
  assert.deepEqual(compareRowCounts(null, undefined), []);
  assert.deepEqual(rowCountProblems(null), []);
  assert.deepEqual(compareRowCounts({ a: 'x' }, { a: 1 })[0].ok, false);
});
