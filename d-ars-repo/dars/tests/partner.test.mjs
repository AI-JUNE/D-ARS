// tests/partner.test.mjs — 파트너(채널) 귀속 규칙 + db/partner.sql 스키마 불변식
// 유닛: 순수 로직 계약(정상·실패 경로). 통합: 스키마 check 제약이 코드 규칙과 같은 말을 하는지 · 개인정보 컬럼 부재.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHANNELS, MAX_TEXT, isValidId, isValidDate, attributionOf, attributionProblems,
  normalizeAttribution, currentAttribution, scopeOrganizations, scopeSql,
} from '../lib/partner.js';
import { tableColumnsInSql, piiCandidates } from '../lib/retentionScan.js';
import { COVERED_TABLES } from '../lib/backupCheck.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQL = fs.readFileSync(path.join(ROOT, 'db', 'partner.sql'), 'utf8');
const codes = (o) => attributionProblems(o).map((p) => p.code).sort();

// ---- 식별자·날짜 ----

test('isValidId — 대문자·숫자·하이픈 3~32자만', () => {
  for (const ok of ['P-001', 'ORG-001', 'ABC', 'A'.repeat(32)]) assert.equal(isValidId(ok), true, ok);
  for (const bad of ['', 'ab', 'p-001', '-P01', 'ORG 001', 'ORG/1', 'A'.repeat(33), null, 7]) assert.equal(isValidId(bad), false, String(bad));
});

test('isValidDate — 달력에 있는 ISO 날짜만', () => {
  assert.equal(isValidDate('2026-02-28'), true);
  for (const bad of ['2026-02-30', '2026-13-01', '26-01-01', '2026/01/01', '', null, 20260101]) assert.equal(isValidDate(bad), false, String(bad));
});

// ---- 채널 유도 ----

test('attributionOf — partner_id 유무로 채널을 유도하고 공백은 없음으로 본다', () => {
  assert.deepEqual(attributionOf({ partner_id: 'P-001' }), { channel: 'partner', partnerId: 'P-001' });
  assert.deepEqual(attributionOf({ partner_id: ' P-001 ' }), { channel: 'partner', partnerId: 'P-001' });
  for (const o of [{}, { partner_id: null }, { partner_id: '' }, { partner_id: '   ' }, null, undefined, 3]) {
    assert.deepEqual(attributionOf(o), { channel: 'direct', partnerId: null });
  }
});

// ---- 문제 판정: 정상 경로 ----

test('attributionProblems — 직접 계약·파트너 계약 정상 입력은 문제 0건', () => {
  assert.deepEqual(codes({ id: 'ORG-001', acquired_via: 'direct', contracted_at: '2026-09-01' }), []);
  assert.deepEqual(codes({ org_id: 'ORG-002', partner_id: 'P-001', channel: 'partner', attributed_by: '김운영', reason: '계약서 C-2026-09-001' }), []);
  // 채널을 아예 안 적으면 partner_id 로 유도되므로 문제 없음
  assert.deepEqual(codes({ id: 'ORG-003', partner_id: 'P-001' }), []);
});

// ---- 문제 판정: 실패 경로 ----

test('attributionProblems — 채널과 partner_id 가 어긋나면 CHANNEL_MISMATCH', () => {
  assert.deepEqual(codes({ id: 'ORG-001', partner_id: 'P-001', acquired_via: 'direct' }), ['CHANNEL_MISMATCH']);
  assert.deepEqual(codes({ id: 'ORG-001', channel: 'partner' }), ['CHANNEL_MISMATCH']);
});

test('attributionProblems — 모르는 채널·깨진 식별자·잘못된 날짜', () => {
  assert.deepEqual(codes({ id: 'ORG-001', acquired_via: 'reseller' }), ['CHANNEL_UNKNOWN']);
  assert.deepEqual(codes({ id: 'org 1' }), ['ORG_ID_INVALID']);
  assert.deepEqual(codes({ id: 'ORG-001', partner_id: 'p 1' }), ['PARTNER_ID_INVALID']);
  assert.deepEqual(codes({ id: 'ORG-001', contracted_at: '2026-02-30' }), ['CONTRACTED_AT_INVALID']);
});

test('attributionProblems — 자유 서술란의 연락처·과다 길이를 막는다', () => {
  assert.deepEqual(codes({ id: 'ORG-001', reason: '담당 010-1234-5678' }), ['REASON_HAS_CONTACT']);
  assert.deepEqual(codes({ id: 'ORG-001', reason: 'contact someone@example.com' }), ['REASON_HAS_CONTACT']);
  assert.deepEqual(codes({ id: 'ORG-001', reason: 'x'.repeat(MAX_TEXT + 1) }), ['REASON_TOO_LONG']);
  assert.deepEqual(codes({ id: 'ORG-001', attributed_by: 'x'.repeat(MAX_TEXT + 1) }), ['ATTRIBUTED_BY_TOO_LONG']);
  // 계약서 번호 같은 짧은 숫자는 연락처가 아니다
  assert.deepEqual(codes({ id: 'ORG-001', reason: '계약서 2026-09-001 · 소개' }), []);
});

test('attributionProblems — 이상 입력에 throw 하지 않고 식별자 문제로 보고한다', () => {
  for (const bad of [null, undefined, 42, 'x', [], { id: 5 }]) {
    assert.doesNotThrow(() => attributionProblems(bad));
    assert.ok(codes(bad).includes('ORG_ID_INVALID'));
  }
});

// ---- 정규화 ----

test('normalizeAttribution — 채널은 partner_id 에서 유도, 텍스트는 trim·절단, 컬럼명은 스키마와 동일', () => {
  const r = normalizeAttribution({ id: ' ORG-001 ', partner_id: 'P-001', acquired_via: 'direct', contracted_at: '2026-09-01', attributed_by: ' 김운영 ', reason: ' r ' });
  assert.deepEqual(r, { org_id: 'ORG-001', partner_id: 'P-001', channel: 'partner', contracted_at: '2026-09-01', attributed_by: '김운영', reason: 'r' });
  const cols = tableColumnsInSql(SQL).find((t) => t.table === 'partner_attributions').columns;
  for (const k of Object.keys(r)) assert.ok(cols.includes(k), `partner_attributions 에 ${k} 컬럼이 없다`);
  const d = normalizeAttribution({ id: 'ORG-002', contracted_at: 'bad', attributed_by: 'x'.repeat(300) });
  assert.equal(d.channel, 'direct'); assert.equal(d.partner_id, null); assert.equal(d.contracted_at, null);
  assert.equal(d.attributed_by.length, MAX_TEXT);
  assert.doesNotThrow(() => normalizeAttribution(null));
});

// ---- 이력 ----

test('currentAttribution — 최신 created_at, 동률이면 id 큰 행. 빈 이력은 null', () => {
  const rows = [
    { id: 1, created_at: '2026-09-01T00:00:00Z', channel: 'partner', partner_id: 'P-001' },
    { id: 3, created_at: '2026-09-02T00:00:00Z', channel: 'direct', partner_id: null },
    { id: 2, created_at: '2026-09-02T00:00:00Z', channel: 'partner', partner_id: 'P-002' },
  ];
  assert.equal(currentAttribution(rows).id, 3);
  assert.equal(currentAttribution([]), null);
  assert.equal(currentAttribution(null), null);
  assert.equal(currentAttribution([null, { id: 9, created_at: 'garbage' }]).id, 9);
});

// ---- 범위(2계층 확장 여지) ----

test('scopeOrganizations — null 은 전체, 파트너 id 는 귀속분만, 이상값은 빈 배열(전체 공개로 넘기지 않음)', () => {
  const orgs = [{ id: 'ORG-1', partner_id: 'P-001' }, { id: 'ORG-2', partner_id: null }, { id: 'ORG-3', partner_id: 'P-002' }, null];
  assert.equal(scopeOrganizations(orgs, null).length, 3);
  assert.deepEqual(scopeOrganizations(orgs, 'P-001').map((o) => o.id), ['ORG-1']);
  assert.deepEqual(scopeOrganizations(orgs, ''), []);
  assert.deepEqual(scopeOrganizations(orgs, 'p 1'), []);
  assert.deepEqual(scopeOrganizations(undefined, null), []);
});

test('scopeSql — 값은 바인딩으로만 나가고 이상값은 false 조건', () => {
  assert.deepEqual(scopeSql(null), { where: 'true', params: [] });
  assert.deepEqual(scopeSql('P-001', 2), { where: 'partner_id = $2', params: ['P-001'] });
  const inj = "P' or 1=1 --";
  const r = scopeSql(inj);
  assert.equal(r.where, 'false');
  assert.ok(!r.where.includes(inj));
});

// ---- 통합: 스키마 ----

test('[통합] db/partner.sql 은 세 표를 선언하고 backupCheck 커버리지에 모두 올라 있다', () => {
  const tables = tableColumnsInSql(SQL).map((t) => t.table);
  assert.deepEqual(tables, ['organizations', 'partner_attributions', 'partners']);
  for (const t of tables) assert.ok(COVERED_TABLES.includes(t), `${t} 가 COVERED_TABLES 에 없다`);
});

test('[통합] 스키마 check 제약이 코드와 같은 규칙(채널 ↔ partner_id 정합)을 말한다', () => {
  const norm = SQL.replace(/\s+/g, ' ');
  assert.match(norm, /check \(acquired_via in \('direct', 'partner'\)\)/);
  assert.match(norm, /check \(\(acquired_via = 'partner'\) = \(partner_id is not null\)\)/);
  assert.match(norm, /check \(\(channel = 'partner'\) = \(partner_id is not null\)\)/);
  assert.deepEqual(CHANNELS, ['direct', 'partner']);
  // partner_id 는 반드시 nullable(직접 계약 허용)
  assert.doesNotMatch(norm, /partner_id text not null/);
  assert.match(norm, /partner_id text references partners\(id\)/);
});

test('[통합] 파트너 표에는 사람 개인정보 컬럼이 없다(이름=법인명·담당자 표시명만)', () => {
  const cands = piiCandidates(tableColumnsInSql(SQL)).map((c) => `${c.table}.${c.column}`);
  assert.deepEqual(cands, ['organizations.name', 'partner_attributions.attributed_by', 'partners.name']);
  assert.doesNotMatch(SQL, /rate|commission|수수료율\s+numeric/i, '수수료율은 스키마에 하드코딩하지 않는다');
});

test('[통합] db-setup 은 partner.sql 을 자동 적용하지 않는다(스키마 변경은 승인)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'db-setup.mjs'), 'utf8');
  assert.doesNotMatch(src, /partner\.sql/);
});
