// lib/settlement.js — 파트너 정산 리포트(순수 로직 · 무부작용 · DB 비의존)
//
// 배경(COMMERCIAL_READINESS "정산 리포트"): 파트너별 계약·이용 실적·수수료 **산출 근거**를 조회·내보낸다.
//   정산 분쟁을 막는 것은 금액 자체가 아니라 "어느 고객사가 어느 근거로 누구에게 귀속됐고, 어떤 율을 어떤
//   청구액에 곱했는가"가 줄마다 남는 것이다. 그래서 이 모듈의 출력은 줄마다 basis(근거)를 싣는다.
//
// 원칙
//   · 수수료율은 **설정값**(환경변수 PARTNER_COMMISSION_RATES · JSON · 퍼센트)에서만 온다. 이 파일에 숫자 율을 두지
//     않으며, 미설정이면 수수료를 0 으로 꾸미지 않고 null + RATE_MISSING 으로 드러낸다(테스트가 하드코딩을 감시).
//   · 귀속은 organizations.partner_id(현재 상태)가 아니라 **partner_attributions 이력**(정산월 말일 기준 최신 행)으로
//     판정한다. 이력이 없는 고객사는 어느 파트너에도 넣지 않고 unattributed 로 따로 보고한다 — 근거 없는 정산 금지.
//   · 금액 계산은 정수 연산만 쓴다(부동소수 오차 금지). 율은 소수 둘째 자리까지(=1/10000 단위 bp) 허용.
//     수수료 = 청구액 × 율(%) ÷ 100, **원 미만 반올림(half-up)**. 청구액은 0 이상 정수(원).
//   · 개인정보를 다루지 않는다: 파트너·고객사 **법인명**과 운영자 표시명만 통과시키고 그 외 컬럼은 화이트리스트로 버린다.
//   · 아무 것도 저장·전송하지 않는다. 이용 실적(세션수·청구액)은 **입력**이다 — 과금 원장은 계약 확정 후 연결 [승인 필요].

import { isValidId, isValidDate, currentAttribution } from './partner.js';
import { toCSV } from './export.js';

export const RATES_ENV = 'PARTNER_COMMISSION_RATES';
export const DEFAULT_RATE_KEY = '*';
export const FORMULA_KO = '수수료 = 청구액(원) × 수수료율(%) ÷ 100 · 원 미만 반올림(half-up)';

// 산출 상태 코드(줄 단위). complete 만 합계에 들어간다.
export const LINE_STATUS = ['complete', 'rate_missing', 'amount_missing', 'amount_invalid'];

// ---- 수수료율 설정 파싱 ----
// 입력: JSON 문자열 `{"P-001": 20, "*": 15}` — 키는 파트너 id 또는 '*'(기본율), 값은 퍼센트(0~100 · 소수 둘째 자리까지).
// 출력: { rates: {id → bp(정수 · 1/100 %)}, problems: [{code, key?}] }  — 값은 항상 정규화된 정수 bp.
//   문제가 있는 항목만 버리고 나머지는 살린다(한 오타가 전체 정산을 막지 않게). 미설정·빈 문자열 → rates {} (문제 없음).
export function parseCommissionRates(raw) {
  const out = { rates: {}, problems: [] };
  if (raw == null || (typeof raw === 'string' && !raw.trim())) return out;
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { out.problems.push({ code: 'RATES_INVALID_JSON' }); return out; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { out.problems.push({ code: 'RATES_NOT_OBJECT' }); return out; }
  for (const [k, v] of Object.entries(obj)) {
    if (k !== DEFAULT_RATE_KEY && !isValidId(k)) { out.problems.push({ code: 'RATE_KEY_INVALID', key: k }); continue; }
    const bp = toBasisPoints(v);
    if (bp == null) { out.problems.push({ code: 'RATE_VALUE_INVALID', key: k }); continue; }
    out.rates[k] = bp;
  }
  return out;
}

// 퍼센트(숫자 또는 숫자 문자열) → bp 정수. 0~100, 소수 둘째 자리까지만. 그 외 null.
export function toBasisPoints(v) {
  const s = typeof v === 'number' ? String(v) : (typeof v === 'string' ? v.trim() : '');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const [i, f = ''] = s.split('.');
  const bp = Number(i) * 100 + Number((f + '00').slice(0, 2));
  return bp > 10000 ? null : bp;
}

// bp → 표시용 퍼센트 문자열('20', '12.5', '0.25')
export function bpToPercent(bp) {
  if (!Number.isInteger(bp) || bp < 0) return '';
  const i = Math.floor(bp / 100), f = bp % 100;
  return f === 0 ? String(i) : `${i}.${String(f).padStart(2, '0').replace(/0$/, '')}`;
}

// 파트너에 적용할 율. 파트너 개별 키 우선, 없으면 '*' 기본율, 둘 다 없으면 null(=미산출).
//   → { bp, source: 'partner'|'default' } | null
export function commissionRateFor(partnerId, rates) {
  const r = rates && typeof rates === 'object' ? rates : {};
  if (isValidId(partnerId) && Number.isInteger(r[partnerId])) return { bp: r[partnerId], source: 'partner' };
  if (Number.isInteger(r[DEFAULT_RATE_KEY])) return { bp: r[DEFAULT_RATE_KEY], source: 'default' };
  return null;
}

// ---- 기간 ----
// 'YYYY-MM' → { month, from:'YYYY-MM-01', to:'YYYY-MM-DD'(말일) } | null
export function parseMonth(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}$/.test(s)) return null;
  const [y, m] = s.split('-').map(Number);
  if (m < 1 || m > 12) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { month: s, from: `${s}-01`, to: `${s}-${String(last).padStart(2, '0')}` };
}

// ---- 금액 ----
// 청구액(원 · 0 이상 정수) × bp → 수수료(원 · half-up). 이상 입력은 null.
export function computeCommission(amountKrw, bp) {
  if (!Number.isInteger(amountKrw) || amountKrw < 0 || amountKrw > Number.MAX_SAFE_INTEGER / 10000) return null;
  if (!Number.isInteger(bp) || bp < 0 || bp > 10000) return null;
  return Math.floor((amountKrw * bp + 5000) / 10000);
}

function intOrNull(v) {
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) v = Number(v.trim());
  return Number.isInteger(v) && v >= 0 ? v : null;
}
function safeText(v, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// 이용 실적 입력 행 → 고객사별 집계(같은 org_id 가 여러 행이면 합산). 정산월과 다른 달의 행은 무시한다.
//   행: { org_id, month:'YYYY-MM', sessions?, amount_krw? }
//   → Map(org_id → { sessions: int|null, amountKrw: int|null, invalid: boolean })
export function aggregateUsage(rows, month) {
  const map = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r !== 'object' || !isValidId(r.org_id) || r.month !== month) continue;
    const cur = map.get(r.org_id) || { sessions: null, amountKrw: null, invalid: false };
    const s = intOrNull(r.sessions), a = intOrNull(r.amount_krw);
    if (r.sessions != null && s == null) cur.invalid = true;
    if (r.amount_krw != null && a == null) cur.invalid = true;
    if (s != null) cur.sessions = (cur.sessions || 0) + s;
    if (a != null) cur.amountKrw = (cur.amountKrw || 0) + a;
    map.set(r.org_id, cur);
  }
  return map;
}

// 정산월 말일 기준으로 유효한 귀속 행(그 이후에 기록된 정정은 그 달 정산에 소급하지 않는다).
export function attributionAsOf(rows, toDate) {
  const cutoff = Date.parse(`${toDate}T23:59:59.999Z`);
  const list = (Array.isArray(rows) ? rows : []).filter((r) => {
    if (!r || typeof r !== 'object') return false;
    const t = Date.parse(r.created_at);
    return !Number.isNaN(t) && t <= cutoff;
  });
  return currentAttribution(list);
}

// ---- 리포트 ----
// buildSettlement({ month, partners, organizations, attributions, usage, rates })
//   partners:      [{ id, name, status }]
//   organizations: [{ id, name, contracted_at, status }]         (partner_id 는 보지 않는다 — 이력이 정본)
//   attributions:  [{ id, org_id, partner_id, channel, contracted_at, attributed_by, created_at }]
//   usage:         [{ org_id, month, sessions, amount_krw }]      (입력 · 과금 원장 연결 전까지 비어 있을 수 있다)
//   rates:         parseCommissionRates(...).rates
// 결과는 파트너 id 오름차순 · 고객사 id 오름차순으로 결정적(같은 입력 → 같은 출력).
export function buildSettlement(input) {
  const o = input && typeof input === 'object' ? input : {};
  const period = parseMonth(o.month);
  if (!period) return { ok: false, error: 'MONTH_INVALID', month: null };

  const rates = o.rates && typeof o.rates === 'object' ? o.rates : {};
  const partnersById = new Map();
  for (const p of Array.isArray(o.partners) ? o.partners : []) {
    if (p && isValidId(p.id)) partnersById.set(p.id, { id: p.id, name: safeText(p.name), status: safeText(p.status, 20) });
  }
  const orgs = (Array.isArray(o.organizations) ? o.organizations : [])
    .filter((x) => x && isValidId(x.id))
    .map((x) => ({ id: x.id, name: safeText(x.name), contractedAt: isValidDate(x.contracted_at) ? x.contracted_at : null, status: safeText(x.status, 20) }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const attrByOrg = new Map();
  for (const a of Array.isArray(o.attributions) ? o.attributions : []) {
    if (!a || !isValidId(a.org_id)) continue;
    const list = attrByOrg.get(a.org_id) || [];
    list.push(a);
    attrByOrg.set(a.org_id, list);
  }
  const usage = aggregateUsage(o.usage, period.month);

  const groups = new Map();           // partnerId → { partner, lines[] }
  const direct = [];                  // 이력상 직접 계약(정산 대상 아님 · 확인용)
  const unattributed = [];            // 귀속 이력 없음 → 정산에 넣지 않는다
  const problems = [];

  for (const org of orgs) {
    const attr = attributionAsOf(attrByOrg.get(org.id), period.to);
    if (!attr) { unattributed.push({ orgId: org.id, orgName: org.name, code: 'ATTRIBUTION_MISSING' }); continue; }
    if (attr.channel !== 'partner' || !isValidId(attr.partner_id)) { direct.push({ orgId: org.id, orgName: org.name, attributionId: attr.id ?? null }); continue; }
    const pid = attr.partner_id;
    if (!partnersById.has(pid)) { problems.push({ code: 'PARTNER_UNKNOWN', partnerId: pid, orgId: org.id }); continue; }

    const u = usage.get(org.id) || { sessions: null, amountKrw: null, invalid: false };
    const rate = commissionRateFor(pid, rates);
    let status = 'complete', commissionKrw = null;
    if (u.invalid) status = 'amount_invalid';
    else if (u.amountKrw == null) status = 'amount_missing';
    else if (!rate) status = 'rate_missing';
    else commissionKrw = computeCommission(u.amountKrw, rate.bp);
    if (status === 'complete' && commissionKrw == null) status = 'amount_invalid';

    const line = {
      orgId: org.id, orgName: org.name, contractedAt: isValidDate(attr.contracted_at) ? attr.contracted_at : org.contractedAt,
      sessions: u.sessions, amountKrw: u.invalid ? null : u.amountKrw,
      ratePct: rate ? bpToPercent(rate.bp) : null, rateSource: rate ? rate.source : null,
      commissionKrw, status,
      basis: {
        attributionId: attr.id ?? null, attributedAt: typeof attr.created_at === 'string' ? attr.created_at : null,
        attributedBy: safeText(attr.attributed_by), reason: safeText(attr.reason),
        formula: FORMULA_KO,
      },
    };
    const g = groups.get(pid) || { partner: partnersById.get(pid), lines: [] };
    g.lines.push(line);
    groups.set(pid, g);
  }

  const partners = [...groups.keys()].sort().map((pid) => {
    const g = groups.get(pid);
    const rate = commissionRateFor(pid, rates);
    const totals = { orgs: g.lines.length, sessions: 0, amountKrw: 0, commissionKrw: 0, complete: 0, incomplete: 0 };
    for (const l of g.lines) {
      if (l.sessions != null) totals.sessions += l.sessions;
      if (l.status === 'complete') { totals.complete += 1; totals.amountKrw += l.amountKrw; totals.commissionKrw += l.commissionKrw; }
      else totals.incomplete += 1;
    }
    return {
      partnerId: pid, partnerName: g.partner.name, partnerStatus: g.partner.status,
      ratePct: rate ? bpToPercent(rate.bp) : null, rateSource: rate ? rate.source : null,
      lines: g.lines, totals,
    };
  });

  return {
    ok: true,
    month: period.month, from: period.from, to: period.to,
    rateSource: RATES_ENV, formula: FORMULA_KO,
    partners, direct, unattributed, problems,
    summary: {
      partners: partners.length,
      lines: partners.reduce((n, p) => n + p.lines.length, 0),
      complete: partners.reduce((n, p) => n + p.totals.complete, 0),
      incomplete: partners.reduce((n, p) => n + p.totals.incomplete, 0),
      direct: direct.length, unattributed: unattributed.length,
    },
  };
}

// ---- CSV 내보내기 ----
// 줄 단위 평탄화(파트너 합계 행은 넣지 않는다 — 스프레드시트에서 합계는 사용자가 다시 계산할 수 있어야 한다).
// 수식 인젝션 방지·BOM 은 lib/export 규약을 그대로 쓴다.
export const CSV_COLUMNS = [
  { label: '정산월', value: 'month' },
  { label: '파트너ID', value: 'partnerId' },
  { label: '파트너명', value: 'partnerName' },
  { label: '고객사ID', value: 'orgId' },
  { label: '고객사명', value: 'orgName' },
  { label: '계약일', value: 'contractedAt' },
  { label: '세션수', value: 'sessions' },
  { label: '청구액(원)', value: 'amountKrw' },
  { label: '수수료율(%)', value: 'ratePct' },
  { label: '율출처', value: 'rateSource' },
  { label: '수수료(원)', value: 'commissionKrw' },
  { label: '산출상태', value: 'status' },
  { label: '귀속근거ID', value: 'attributionId' },
  { label: '귀속기록일', value: 'attributedAt' },
  { label: '귀속담당', value: 'attributedBy' },
  { label: '귀속근거', value: 'reason' },
  { label: '산식', value: 'formula' },
];

export function settlementRows(report) {
  if (!report || !report.ok) return [];
  const rows = [];
  for (const p of report.partners) {
    for (const l of p.lines) {
      rows.push({
        month: report.month, partnerId: p.partnerId, partnerName: p.partnerName,
        orgId: l.orgId, orgName: l.orgName, contractedAt: l.contractedAt ?? '',
        sessions: l.sessions ?? '', amountKrw: l.amountKrw ?? '', ratePct: l.ratePct ?? '', rateSource: l.rateSource ?? '',
        commissionKrw: l.commissionKrw ?? '', status: l.status,
        attributionId: l.basis.attributionId ?? '', attributedAt: l.basis.attributedAt ?? '',
        attributedBy: l.basis.attributedBy, reason: l.basis.reason, formula: l.basis.formula,
      });
    }
  }
  return rows;
}

export function settlementCsv(report) {
  return '\uFEFF' + toCSV(settlementRows(report), CSV_COLUMNS);
}

export default buildSettlement;
