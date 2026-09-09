// tests/retentionscan.test.mjs — 개인정보 파기 대상 발견·대조 (DB 불필요 · 파일 읽기는 통합 검사에서만)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  tableColumnsInSql, piiKindOf, piiCandidates, protectedColumns,
  unprotectedPii, staleExempt, unreasonedExempt, brokenTargets, scanSchemas,
  PII_EXEMPT, PII_PATTERNS, CONSTRAINT_STARTERS,
} from '../lib/retentionScan.js';
import { PII_TABLES, purgePlan } from '../lib/retention.js';
import { stripSqlComments } from '../lib/backupCheck.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const readDb = () => fs.readdirSync(path.join(root, 'db')).filter((f) => f.endsWith('.sql'))
  .map((f) => fs.readFileSync(path.join(root, 'db', f), 'utf8'));

// ---- 파서 ----

test('tableColumnsInSql — create table 본문의 컬럼만 뽑고 제약 정의는 버린다', () => {
  const sql = `create table if not exists t (
    id text primary key,
    phone text,
    amount numeric(10,2) not null default 0,
    primary key (id, phone),
    constraint t_uq unique (phone)
  );`;
  const [t0] = tableColumnsInSql(sql);
  assert.equal(t0.table, 't');
  assert.deepEqual(t0.columns, ['amount', 'id', 'phone']);
});

test('tableColumnsInSql — 타입 인자·문자열 리터럴 안의 콤마에 속지 않는다', () => {
  const sql = "create table a (x numeric(10,2), y text default 'a,b,c', z int);";
  assert.deepEqual(tableColumnsInSql(sql)[0].columns, ['x', 'y', 'z']);
});

test('tableColumnsInSql — CRLF 파일에서도 줄 주석이 컬럼을 삼키지 않는다(회귀)', () => {
  // 과거 stripSqlComments 가 `/--.*$/` 라 CRLF 에서 주석을 하나도 지우지 못했고,
  // 그 결과 주석 다음 줄의 컬럼이 통째로 사라졌다(scenarios.status 등).
  const sql = "create table s (\r\n  type text default 'x',   -- 설명 | 설명\r\n  status text,\r\n  version int\r\n);\r\n";
  assert.doesNotMatch(stripSqlComments(sql), /설명/);
  assert.deepEqual(tableColumnsInSql(sql)[0].columns, ['status', 'type', 'version']);
});

test('tableColumnsInSql — alter table add column 도 반영, 주석 처리된 DDL 은 무시', () => {
  const sql = `create table t (id text);
alter table t add column if not exists gen text;
-- create table ghost (id text, phone text);`;
  const out = tableColumnsInSql(sql);
  assert.deepEqual(out.map((x) => x.table), ['t']);
  assert.deepEqual(out[0].columns, ['gen', 'id']);
});

test('tableColumnsInSql — 이상 입력에 throw 하지 않고 빈 배열', () => {
  for (const bad of [null, undefined, 42, {}, '', 'select 1']) {
    assert.deepEqual(tableColumnsInSql(bad), []);
  }
  // 괄호가 닫히지 않아도 죽지 않는다
  assert.doesNotThrow(() => tableColumnsInSql('create table t (id text'));
});

test('CONSTRAINT_STARTERS — 제약 키워드가 컬럼으로 새지 않는다', () => {
  for (const k of CONSTRAINT_STARTERS) {
    const cols = tableColumnsInSql(`create table t (id text, ${k} (id));`)[0].columns;
    assert.ok(!cols.includes(k), `${k} 가 컬럼으로 잡혔다`);
  }
});

// ---- 탐지 ----

test('piiKindOf — 개인정보로 보이는 컬럼명을 유형으로 분류', () => {
  assert.equal(piiKindOf('phone'), '전화번호');
  assert.equal(piiKindOf('to_phone'), '전화번호');
  assert.equal(piiKindOf('email'), '이메일');
  assert.equal(piiKindOf('updated_by'), '작성자 식별자');
  assert.equal(piiKindOf('call_id'), '통화 식별자');
  assert.equal(piiKindOf('PHONE'), '전화번호'); // 대소문자 무관
});

test('piiKindOf — 개인정보가 아닌 컬럼은 null · 이상 입력 무throw', () => {
  for (const c of ['id', 'status', 'step', 'elapsed', 'nodes', 'day', 'inbound']) {
    assert.equal(piiKindOf(c), null, `${c} 는 개인정보가 아니다`);
  }
  for (const bad of [null, undefined, 0, {}, []]) assert.equal(piiKindOf(bad), null);
});

test('PII_PATTERNS — 모든 패턴이 정규식과 유형 라벨을 갖는다', () => {
  assert.ok(PII_PATTERNS.length > 0);
  for (const p of PII_PATTERNS) {
    assert.ok(p.re instanceof RegExp, '정규식이어야 한다');
    assert.equal(typeof p.kind, 'string');
    assert.ok(p.kind.trim().length > 0);
    assert.ok(!p.re.global, 'lastIndex 상태가 남는 g 플래그 금지');
  }
});

test('piiCandidates — 표·컬럼 사전순으로 후보를 모은다 · 이상 입력 무throw', () => {
  const found = piiCandidates([
    { table: 'b', columns: ['phone', 'id'] },
    { table: 'a', columns: ['email'] },
    { table: '', columns: ['phone'] },     // 표 이름 없음 → 버림
  ]);
  assert.deepEqual(found.map((c) => `${c.table}.${c.column}`), ['a.email', 'b.phone']);
  assert.deepEqual(piiCandidates(null), []);
  assert.deepEqual(piiCandidates([{ table: 'a' }]), []);
});

// ---- 대조 ----

test('unprotectedPii — 파기도 면제도 없는 컬럼만 문제로 본다', () => {
  const cands = [
    { table: 'x', column: 'phone', kind: '전화번호' },
    { table: 'y', column: 'email', kind: '이메일' },
    { table: 'z', column: 'name', kind: '이름' },
  ];
  const tables = [{ table: 'x', dateCol: 'at', piiCol: 'phone', label: 'x' }];
  const exempt = [{ table: 'z', column: 'name', reason: '사람 이름 아님' }];
  const out = unprotectedPii(cands, tables, exempt);
  assert.deepEqual(out.map((c) => `${c.table}.${c.column}`), ['y.email']);
});

test('unprotectedPii — 사유 없는 면제는 면제로 인정하지 않는다', () => {
  const cands = [{ table: 'z', column: 'name', kind: '이름' }];
  const out = unprotectedPii(cands, [], [{ table: 'z', column: 'name', reason: '   ' }]);
  assert.equal(out.length, 1, '공백 사유는 면제가 아니다');
});

test('staleExempt / unreasonedExempt — 유령·무사유 면제를 잡는다', () => {
  const cands = [{ table: 'a', column: 'name', kind: '이름' }];
  assert.deepEqual(
    staleExempt(cands, [{ table: 'a', column: 'name', reason: 'r' }, { table: 'gone', column: 'name', reason: 'r' }])
      .map((e) => e.table),
    ['gone'],
  );
  assert.equal(unreasonedExempt([{ table: 'a', column: 'b', reason: '' }, null]).length, 2);
  assert.deepEqual(staleExempt(null, null), []);
});

test('brokenTargets — 파기 대상의 표·컬럼·기준시각이 스키마에 없으면 잡아낸다', () => {
  const schema = [{ table: 'ok', columns: ['phone', 'at'] }];
  const out = brokenTargets(schema, [
    { table: 'ok', dateCol: 'at', piiCol: 'phone' },      // 정상
    { table: 'nope', dateCol: 'at', piiCol: 'phone' },    // 표 없음
    { table: 'ok', dateCol: 'at', piiCol: 'gone' },       // 컬럼 없음
    { table: 'ok', dateCol: 'gone', piiCol: 'phone' },    // 기준시각 없음
  ]);
  assert.deepEqual(out.map((b) => b.missing), ['table', 'piiCol', 'dateCol']);
});

test('protectedColumns — PII_TABLES 를 표.컬럼 집합으로 환산', () => {
  const s = protectedColumns([{ table: 't', piiCol: 'p' }, { table: 't' }]);
  assert.deepEqual([...s], ['t.p']);
});

test('scanSchemas — 미보호 컬럼이 있으면 blocker 로 실패시킨다', () => {
  const r = scanSchemas(['create table leak (id text, customer_email text, at timestamptz);']);
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => b.code === 'PII_UNPROTECTED' && /customer_email/.test(b.msg)));
  // 실제 스키마가 없으니 PII_TABLES 대상은 전부 깨진 것으로도 잡힌다
  assert.ok(r.blockers.some((b) => b.code === 'PII_TARGET_BROKEN'));
});

test('scanSchemas — 이상 입력에 throw 하지 않는다', () => {
  for (const bad of [null, undefined, 42, [null, 1, {}]]) {
    assert.doesNotThrow(() => scanSchemas(bad));
  }
});

// ---- 실제 저장소 통합 검사 ----

test('[통합] db/*.sql 의 개인정보 후보 컬럼은 전부 파기 대상이거나 사유 있는 면제다', () => {
  const r = scanSchemas(readDb());
  assert.deepEqual(r.unprotected.map((c) => `${c.table}.${c.column}`), [],
    '미판단 개인정보 컬럼이 있다 → lib/retention.PII_TABLES 또는 lib/retentionScan.PII_EXEMPT 와 docs/PRIVACY_RETENTION.md 갱신');
  assert.deepEqual(r.blockers, []);
  assert.deepEqual(r.warnings, [], '유령·무사유 면제 없음');
  assert.equal(r.ok, true);
});

test('[통합] 파기 계획은 항상 날짜·비NULL 조건을 갖고 행을 삭제하지 않는다', () => {
  const plan = purgePlan('2026-01-01T00:00:00.000Z');
  assert.equal(plan.length, PII_TABLES.length);
  for (const p of plan) {
    assert.match(p.purge, /where .+ < \$1 and .+ is not null/);
    assert.doesNotMatch(p.purge, /delete|truncate|drop/i);
    assert.match(p.count, /^select count/);
    assert.deepEqual(p.params, ['2026-01-01T00:00:00.000Z']);
  }
});

test('[통합] docs/PRIVACY_RETENTION.md 표가 코드와 양방향 일치한다', () => {
  const md = fs.readFileSync(path.join(root, 'docs', 'PRIVACY_RETENTION.md'), 'utf8');
  const keys = new Set([...md.matchAll(/`([a-z_]+\.[a-z_]+)`/g)].map((m) => m[1]));
  for (const t of PII_TABLES) {
    assert.ok(keys.has(`${t.table}.${t.piiCol}`), `문서에 파기 대상 ${t.table}.${t.piiCol} 누락`);
  }
  for (const e of PII_EXEMPT) {
    assert.ok(keys.has(`${e.table}.${e.column}`), `문서에 면제 항목 ${e.table}.${e.column} 누락`);
    // 사유가 문서에도 실제로 적혀 있어야 한다(표만 있고 근거가 빠지는 것 방지)
    assert.ok(md.includes(e.reason.slice(0, 12)), `문서에 ${e.table}.${e.column} 사유 누락`);
  }
  // 유령: 문서에만 있는 표.컬럼이 코드 어디에도 없으면 안 된다(개명·삭제 후 방치)
  const known = new Set([
    ...PII_TABLES.map((t) => `${t.table}.${t.piiCol}`),
    ...PII_TABLES.map((t) => `${t.table}.${t.dateCol}`),
    ...PII_EXEMPT.map((e) => `${e.table}.${e.column}`),
  ]);
  const schemaKeys = new Set();
  for (const t of scanSchemas(readDb()).schemaTables) for (const c of t.columns) schemaKeys.add(`${t.table}.${c}`);
  for (const k of keys) {
    if (!known.has(k) && !schemaKeys.has(k)) assert.fail(`문서의 ${k} 는 코드·스키마 어디에도 없다`);
  }
});

test('[통합] 정책 문서는 하나뿐이다 — RETENTION_POLICY.md 는 내용을 갖지 않는다', () => {
  // 같은 정책이 두 파일로 갈라지면 한쪽은 반드시 썩는다. 이 실행 환경에서 파일을 지우지 못해
  // 남겨 둔 안내 스텁이며, 다시 정책 표가 들어오는 것을 막는다.
  const p = path.join(root, 'docs', 'RETENTION_POLICY.md');
  if (!fs.existsSync(p)) return; // 사람이 삭제했으면 통과
  const md = fs.readFileSync(p, 'utf8');
  assert.ok(md.includes('docs/PRIVACY_RETENTION.md'), '정본 위치를 가리켜야 한다');
  assert.doesNotMatch(md, /^\s*\|/m, '정책 표를 두지 않는다(정본은 PRIVACY_RETENTION.md)');
});

test('[통합] retention-check CLI 는 읽기 전용이다(파기·쓰기 호출 없음)', () => {
  const src = fs.readFileSync(path.join(root, 'scripts', 'retention-check.mjs'), 'utf8');
  // 주석에는 절차 안내로 --commit 이 등장할 수 있으므로 **코드 줄만** 본다.
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.doesNotMatch(code, /@neondatabase|neon\s*\(/, 'DB 에 접속하지 않는다');
  assert.doesNotMatch(code, /writeFileSync|appendFileSync|rmSync|unlinkSync/, '파일을 쓰지 않는다');
  assert.doesNotMatch(code, /purgePlan|--commit/, '파기 계획을 만들지도 실행하지도 않는다');
  assert.match(code, /process\.exit/);
});
