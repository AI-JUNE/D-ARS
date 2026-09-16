// tests/settlement.test.mjs — 파트너 정산 리포트(lib/settlement.js) 계약 + 라우트/등록부 소스 가드
// 유닛: 율 설정 파싱(정상·실패) · 정수 금액 산출(half-up · 부동소수 무오차) · 귀속 이력 기준일 · 리포트 조립 · CSV.
// 통합: 수수료율 하드코딩 부재 · 개인정보 컬럼 미통과 · 라우트 export 규약 · 환경변수 등록부/문서 대조.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATES_ENV, DEFAULT_RATE_KEY, FORMULA_KO, LINE_STATUS, CSV_COLUMNS,
  parseCommissionRates, toBasisPoints, bpToPercent, commissionRateFor, parseMonth, computeCommission,
  aggregateUsage, attributionAsOf, buildSettlement, settlementRows, settlementCsv,
} from '../lib/settlement.js';
import { envVar } from '../lib/envMatrix.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

// ---- 수수료율 설정 ----

test('parseCommissionRates — 미설정·빈 문자열은 율 없음(문제 0건)', () => {
  for (const raw of [undefined, null, '', '   ']) {
    assert.deepEqual(parseCommissionRates(raw), { rates: {}, problems: [] }, String(raw));
  }
});

test('parseCommissionRates — 퍼센트를 bp 정수로 정규화(숫자·문자열·기본율 *)', () => {
  const r = parseCommissionRates('{"P-001": 12.5, "*": "20", "P-002": 0.25}');
  assert.deepEqual(r.rates, { 'P-001': 1250, '*': 2000, 'P-002': 25 });
  assert.deepEqual(r.problems, []);
});

test('parseCommissionRates — 오류 항목만 버리고 나머지는 살린다(한 오타가 전체 정산을 막지 않게)', () => {
  const r = parseCommissionRates('{"P-001": 20, "p 1": 5, "P-002": 101, "P-003": -1, "P-004": 1.234, "P-005": "abc"}');
  assert.deepEqual(r.rates, { 'P-001': 2000 });
  assert.deepEqual(r.problems.map((p) => p.code + ':' + p.key).sort(), [
    'RATE_KEY_INVALID:p 1', 'RATE_VALUE_INVALID:P-002', 'RATE_VALUE_INVALID:P-003', 'RATE_VALUE_INVALID:P-004', 'RATE_VALUE_INVALID:P-005',
  ]);
});

test('parseCommissionRates — 깨진 JSON·배열·스칼라는 코드로 보고하고 throw 하지 않는다', () => {
  assert.deepEqual(parseCommissionRates('{not json').problems, [{ code: 'RATES_INVALID_JSON' }]);
  assert.deepEqual(parseCommissionRates('[1,2]').problems, [{ code: 'RATES_NOT_OBJECT' }]);
  assert.deepEqual(parseCommissionRates('"20"').problems, [{ code: 'RATES_NOT_OBJECT' }]);
  assert.doesNotThrow(() => parseCommissionRates(42));
});

test('toBasisPoints ↔ bpToPercent 왕복', () => {
  for (const [pct, bp, back] of [['20', 2000, '20'], ['12.5', 1250, '12.5'], ['0.25', 25, '0.25'], ['100', 10000, '100'], ['0', 0, '0'], ['7.05', 705, '7.05']]) {
    assert.equal(toBasisPoints(pct), bp, pct);
    assert.equal(bpToPercent(bp), back, String(bp));
  }
  for (const bad of ['100.01', '1.234', '-1', 'abc', '', null, NaN, Infinity]) assert.equal(toBasisPoints(bad), null, String(bad));
  assert.equal(bpToPercent(-1), '');
});

test('commissionRateFor — 파트너 개별 > 기본율(*) > 없음(null · 0 으로 대체하지 않는다)', () => {
  const rates = { 'P-001': 2500, [DEFAULT_RATE_KEY]: 1000 };
  assert.deepEqual(commissionRateFor('P-001', rates), { bp: 2500, source: 'partner' });
  assert.deepEqual(commissionRateFor('P-009', rates), { bp: 1000, source: 'default' });
  assert.equal(commissionRateFor('P-009', { 'P-001': 2500 }), null);
  assert.equal(commissionRateFor('P-001', {}), null);
  assert.equal(commissionRateFor('P-001', null), null);
});

// ---- 기간·금액 ----

test('parseMonth — 말일 계산(윤년 포함)·형식 오류', () => {
  assert.deepEqual(parseMonth('2024-02'), { month: '2024-02', from: '2024-02-01', to: '2024-02-29' });
  assert.deepEqual(parseMonth('2026-12'), { month: '2026-12', from: '2026-12-01', to: '2026-12-31' });
  for (const bad of ['2026-13', '2026-00', '2026-1', '2026/09', '202609', '', null, 202609]) assert.equal(parseMonth(bad), null, String(bad));
});

test('computeCommission — 정수 연산 · 원 미만 half-up · 부동소수 오차 없음', () => {
  assert.equal(computeCommission(1000000, 2000), 200000);
  assert.equal(computeCommission(1000005, 1250), 125001);   // 125000.625 → 125001
  assert.equal(computeCommission(5, 1000), 1);              // 0.5 → 1 (half-up)
  assert.equal(computeCommission(4, 1000), 0);              // 0.4 → 0
  assert.equal(computeCommission(3, 1000), 0);              // 0.3 — 0.1+0.2 류 오차가 있으면 틀어진다
  assert.equal(computeCommission(0, 2000), 0);
  assert.equal(computeCommission(123456789, 0), 0);
});

test('computeCommission — 음수·소수·문자열·범위 밖 율은 null', () => {
  for (const [a, bp] of [[-1, 1000], [1.5, 1000], ['100', 1000], [100, -1], [100, 10001], [100, 12.5], [null, 1000], [Number.MAX_SAFE_INTEGER, 1]]) {
    assert.equal(computeCommission(a, bp), null, `${a},${bp}`);
  }
});

test('aggregateUsage — 같은 고객사 합산 · 다른 달 무시 · 이상값은 invalid 표시', () => {
  const m = aggregateUsage([
    { org_id: 'ORG-001', month: '2026-09', sessions: 10, amount_krw: 100000 },
    { org_id: 'ORG-001', month: '2026-09', sessions: '5', amount_krw: '50000' },
    { org_id: 'ORG-001', month: '2026-08', sessions: 99, amount_krw: 999999 },
    { org_id: 'ORG-002', month: '2026-09', sessions: 1, amount_krw: -5 },
    { org_id: 'bad id', month: '2026-09', sessions: 1, amount_krw: 1 },
    null, 7,
  ], '2026-09');
  assert.deepEqual(m.get('ORG-001'), { sessions: 15, amountKrw: 150000, invalid: false });
  assert.deepEqual(m.get('ORG-002'), { sessions: 1, amountKrw: null, invalid: true });
  assert.equal(m.size, 2);
});

test('attributionAsOf — 정산월 말일 이후 기록된 정정은 그 달에 소급하지 않는다', () => {
  const rows = [
    { id: 1, org_id: 'ORG-001', partner_id: 'P-001', channel: 'partner', created_at: '2026-09-10T00:00:00Z' },
    { id: 2, org_id: 'ORG-001', partner_id: null, channel: 'direct', created_at: '2026-10-01T00:00:00Z' },
  ];
  assert.equal(attributionAsOf(rows, '2026-09-30').id, 1);
  assert.equal(attributionAsOf(rows, '2026-10-31').id, 2);
  assert.equal(attributionAsOf(rows, '2026-08-31'), null);
  assert.equal(attributionAsOf([{ created_at: 'garbage' }], '2026-09-30'), null);
});

// ---- 리포트 조립 ----

const FIX = () => ({
  month: '2026-09',
  partners: [
    { id: 'P-002', name: '파트너B', status: '활성', phone: '010-1111-2222' },
    { id: 'P-001', name: '파트너A', status: '활성', email: 'x@y.co' },
  ],
  organizations: [
    { id: 'ORG-004', name: '귀속없음', partner_id: 'P-001', contracted_at: '2026-09-05' },   // 이력 없음 → 정산 제외
    { id: 'ORG-003', name: '직접계약', contracted_at: '2026-01-01' },
    { id: 'ORG-002', name: '=SUM(A1)', contracted_at: '2026-03-01' },
    { id: 'ORG-001', name: '고객사1', contracted_at: '2026-02-01', contact_phone: '010-9999-8888' },
    { id: 'ORG-005', name: '미등록파트너', contracted_at: '2026-04-01' },
  ],
  attributions: [
    { id: 1, org_id: 'ORG-001', partner_id: 'P-001', channel: 'partner', contracted_at: '2026-02-01', attributed_by: '김운영', reason: '계약서 C-1', created_at: '2026-02-01T00:00:00Z' },
    { id: 2, org_id: 'ORG-002', partner_id: 'P-002', channel: 'partner', contracted_at: '2026-03-01', attributed_by: '김운영', reason: '', created_at: '2026-03-01T00:00:00Z' },
    { id: 3, org_id: 'ORG-003', partner_id: null, channel: 'direct', created_at: '2026-01-01T00:00:00Z' },
    { id: 4, org_id: 'ORG-005', partner_id: 'P-404', channel: 'partner', created_at: '2026-04-01T00:00:00Z' },
    { id: 5, org_id: 'ORG-001', partner_id: 'P-002', channel: 'partner', created_at: '2026-10-02T00:00:00Z' },   // 10월 정정 → 9월 미반영
  ],
  usage: [
    { org_id: 'ORG-001', month: '2026-09', sessions: 120, amount_krw: 1000005 },
  ],
  rates: { 'P-001': 1250 },
});

test('buildSettlement — 정상 경로: 이력 기준 귀속 · 근거 동반 · 상태 코드 · 합계', () => {
  const r = buildSettlement(FIX());
  assert.equal(r.ok, true);
  assert.equal(r.month, '2026-09');
  assert.equal(r.formula, FORMULA_KO);
  assert.equal(r.rateSource, RATES_ENV);
  assert.deepEqual(r.partners.map((p) => p.partnerId), ['P-001', 'P-002']);          // id 오름차순(결정적)

  const a = r.partners[0];
  assert.equal(a.ratePct, '12.5');
  assert.equal(a.lines.length, 1);
  const l = a.lines[0];
  assert.equal(l.orgId, 'ORG-001');
  assert.equal(l.status, 'complete');
  assert.equal(l.amountKrw, 1000005);
  assert.equal(l.commissionKrw, 125001);
  assert.equal(l.contractedAt, '2026-02-01');
  assert.deepEqual(l.basis, { attributionId: 1, attributedAt: '2026-02-01T00:00:00Z', attributedBy: '김운영', reason: '계약서 C-1', formula: FORMULA_KO });
  assert.deepEqual(a.totals, { orgs: 1, sessions: 120, amountKrw: 1000005, commissionKrw: 125001, complete: 1, incomplete: 0 });

  const b = r.partners[1];
  assert.equal(b.ratePct, null);                       // 율 미설정 → null(0 아님)
  assert.equal(b.lines[0].status, 'amount_missing');   // 청구액 없음이 율 없음보다 먼저 드러난다
  assert.equal(b.lines[0].commissionKrw, null);
  assert.deepEqual(b.totals, { orgs: 1, sessions: 0, amountKrw: 0, commissionKrw: 0, complete: 0, incomplete: 1 });

  assert.deepEqual(r.direct, [{ orgId: 'ORG-003', orgName: '직접계약', attributionId: 3 }]);
  assert.deepEqual(r.unattributed, [{ orgId: 'ORG-004', orgName: '귀속없음', code: 'ATTRIBUTION_MISSING' }]);
  assert.deepEqual(r.problems, [{ code: 'PARTNER_UNKNOWN', partnerId: 'P-404', orgId: 'ORG-005' }]);
  assert.deepEqual(r.summary, { partners: 2, lines: 2, complete: 1, incomplete: 1, direct: 1, unattributed: 1 });
});

test('buildSettlement — organizations.partner_id 는 근거가 아니다(이력 없는 고객사는 어느 파트너에도 안 들어간다)', () => {
  const r = buildSettlement(FIX());
  for (const p of r.partners) assert.ok(!p.lines.some((l) => l.orgId === 'ORG-004'));
});

test('buildSettlement — 율은 있는데 청구액이 없으면 amount_missing · 청구액 이상은 amount_invalid · 율 없으면 rate_missing', () => {
  const base = FIX();
  base.rates = {};
  const r1 = buildSettlement(base);
  assert.equal(r1.partners[0].lines[0].status, 'rate_missing');
  assert.equal(r1.partners[0].lines[0].commissionKrw, null);
  assert.equal(r1.partners[0].totals.commissionKrw, 0);
  const base2 = FIX();
  base2.usage = [{ org_id: 'ORG-001', month: '2026-09', sessions: 1, amount_krw: 1.5 }];
  const r2 = buildSettlement(base2);
  assert.equal(r2.partners[0].lines[0].status, 'amount_invalid');
  assert.equal(r2.partners[0].lines[0].amountKrw, null);
  for (const p of [r1, r2]) for (const g of p.partners) for (const l of g.lines) assert.ok(LINE_STATUS.includes(l.status));
});

test('buildSettlement — 기본율(*)은 rateSource:default 로 구분된다', () => {
  const base = FIX();
  base.rates = { '*': 1000 };
  const r = buildSettlement(base);
  assert.equal(r.partners[0].lines[0].rateSource, 'default');
  assert.equal(r.partners[0].lines[0].commissionKrw, 100001);   // 100000.5 → half-up
});

test('buildSettlement — 잘못된 월은 MONTH_INVALID · 이상 입력에 throw 하지 않는다', () => {
  assert.deepEqual(buildSettlement({ month: '2026/09' }), { ok: false, error: 'MONTH_INVALID', month: null });
  for (const bad of [null, undefined, 7, 'x', { month: '2026-09', partners: 'no', organizations: 5, attributions: null, usage: {}, rates: [] }]) {
    assert.doesNotThrow(() => buildSettlement(bad), String(bad));
  }
  const empty = buildSettlement({ month: '2026-09' });
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.summary, { partners: 0, lines: 0, complete: 0, incomplete: 0, direct: 0, unattributed: 0 });
});

test('buildSettlement — 결정적 출력(같은 입력을 순서만 섞어도 같은 결과)', () => {
  const a = FIX();
  const b = FIX();
  b.partners.reverse(); b.organizations.reverse(); b.attributions.reverse();
  assert.deepEqual(buildSettlement(a), buildSettlement(b));
});

test('개인정보 화이트리스트 — 입력에 섞인 전화·이메일 컬럼은 리포트·CSV 어디에도 나오지 않는다', () => {
  const r = buildSettlement(FIX());
  const json = JSON.stringify(r) + settlementCsv(r);
  for (const leak of ['010-1111-2222', 'x@y.co', '010-9999-8888', 'contact_phone', 'phone', 'email']) {
    assert.ok(!json.includes(leak), `유출: ${leak}`);
  }
});

// ---- CSV ----

test('settlementCsv — BOM · 머리글 · 줄 수 · 수식 인젝션 방지', () => {
  const r = buildSettlement(FIX());
  const csv = settlementCsv(r);
  assert.ok(csv.startsWith('\uFEFF'));
  const lines = csv.slice(1).split('\n');
  assert.equal(lines[0], CSV_COLUMNS.map((c) => `"${c.label}"`).join(','));
  assert.equal(lines.length, 1 + r.summary.lines);
  assert.ok(csv.includes('"\'=SUM(A1)"'), '수식으로 시작하는 고객사명은 텍스트로 강제');
  assert.ok(csv.includes('"125001"') && csv.includes('"12.5"') && csv.includes('"complete"'));
  assert.equal(settlementRows({ ok: false }).length, 0);
  assert.equal(settlementCsv(null), '\uFEFF' + lines[0] + '\n');   // 빈 리포트 = 머리글만
});

// ---- 소스 가드(통합) ----

test('[가드] lib/settlement.js 에 수수료율 숫자가 박혀 있지 않다(설정값 전용)', () => {
  const code = read('lib', 'settlement.js').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.doesNotMatch(code, /(rate|pct|bp)\w*\s*(=|:)\s*\d/i, '율을 코드에 두지 않는다');
  assert.doesNotMatch(code, /\[DEFAULT_RATE_KEY\]\s*(=|:)\s*\d/);
  assert.equal(commissionRateFor('P-001', parseCommissionRates(undefined).rates), null);
});

test('[가드] /api/admin/settlement 라우트 — export 규약 · admin 게이트 · 저장/전송 없음 · 이용실적 원천 없음 명시', () => {
  const src = read('app', 'api', 'admin', 'settlement', 'route.js');
  const names = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm)].map((m) => m[1]).sort();
  assert.deepEqual(names, ['GET', 'dynamic']);
  assert.match(src, /guardWrite\(req,\s*'admin'\)/);
  assert.match(src, /parseCommissionRates\(process\.env\.PARTNER_COMMISSION_RATES\)/);
  assert.match(src, /usageSource:\s*'none'/);
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.doesNotMatch(code, /insert\s+into|update\s+\w+\s+set|delete\s+from|fetch\(/i);
  assert.doesNotMatch(code, /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)/);
});

test('[가드] PARTNER_COMMISSION_RATES 는 등록부·문서에 있고 게이트/비밀 아님 · 어느 프로필에서도 강제하지 않는다', () => {
  const v = envVar(RATES_ENV);
  assert.ok(v, '등록부 누락');
  assert.equal(v.gate, false);
  assert.equal(v.secret, false);
  assert.equal(v.profiles.demo, '미설정');
  const md = read('docs', 'STAGING_OPERATIONS.md');
  assert.match(md, /\| `PARTNER_COMMISSION_RATES` \|/);
  const doc = read('docs', 'PARTNER_SETTLEMENT.md');
  assert.ok(doc.includes(FORMULA_KO), '문서 산식이 코드와 다르다');
  assert.ok(doc.includes('PARTNER_COMMISSION_RATES'));
  for (const s of LINE_STATUS) assert.ok(doc.includes(`\`${s}\``), `문서에 상태 코드 ${s} 없음`);
});
