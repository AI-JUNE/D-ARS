// lib/partner.js — 파트너(채널) 귀속 규칙(순수 로직 · 무부작용 · DB 비의존)
//
// 배경(COMMERCIAL_READINESS "파트너 채널"): 파트너(제이투모로우원)는 영업·운영을 대행하고 수익을
//   배분받는다. 정산 분쟁을 막는 핵심은 "이 고객사가 어느 파트너를 통해 들어왔는가"가 **코드가 강제하는
//   불변식**으로 남는 것이다. 스키마(db/partner.sql)의 check 제약과 이 모듈의 판정은 같은 규칙을 말한다:
//     partner_id 가 있으면 반드시 채널 'partner', 없으면 반드시 'direct' — 둘이 어긋난 행은 만들지 않는다.
//
// 이 모듈은 **아무 것도 저장하지 않는다.** 화면·API 배선과 파트너 역할 활성화는 [승인 필요].
//   수수료율은 여기에 두지 않는다(정산 항목에서 설정값으로 분리 · 하드코딩 금지).

export const CHANNELS = ['direct', 'partner'];
export const PARTNER_STATUS = ['활성', '중지'];
export const ORG_STATUS = ['활성', '해지'];

// 식별자 형식: 영문 대문자·숫자·하이픈, 3~32자 (예: P-001 · ORG-001). 공백·한글·경로문자 금지.
const ID_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
export function isValidId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

// ISO 날짜(YYYY-MM-DD)만 허용. 달력에 없는 날짜(2026-02-30)는 거부.
export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// 채널·partner_id 정합 판정(스키마 check 와 동일 규칙). 이상 입력에 throw 하지 않는다.
//   → { channel: 'direct'|'partner', partnerId: string|null }
// partner_id 만 보고 채널을 **유도**한다 — 입력의 acquired_via 는 problems 에서 대조용으로만 쓴다.
export function attributionOf(org) {
  const pid = org && typeof org.partner_id === 'string' && org.partner_id.trim() ? org.partner_id.trim() : null;
  return { channel: pid ? 'partner' : 'direct', partnerId: pid };
}

// 귀속 행(organizations 또는 partner_attributions 입력) 의 문제 목록. 비어 있으면 저장 가능.
//   codes: ORG_ID_INVALID · PARTNER_ID_INVALID · CHANNEL_UNKNOWN · CHANNEL_MISMATCH ·
//          CONTRACTED_AT_INVALID · ATTRIBUTED_BY_TOO_LONG · REASON_TOO_LONG · REASON_HAS_CONTACT
export const MAX_TEXT = 200;
const CONTACT_RE = /(\d{2,3}-\d{3,4}-\d{4}|\b\d{10,11}\b|@[a-z0-9.-]+\.[a-z]{2,})/i;

export function attributionProblems(input) {
  const out = [];
  const o = input && typeof input === 'object' ? input : {};
  const orgId = typeof o.org_id === 'string' ? o.org_id : (typeof o.id === 'string' ? o.id : '');
  if (!isValidId(orgId)) out.push({ code: 'ORG_ID_INVALID', msg: '고객사 식별자 형식이 아니다(영문 대문자·숫자·하이픈 3~32자)' });

  const { channel, partnerId } = attributionOf(o);
  if (o.partner_id != null && o.partner_id !== '' && !isValidId(partnerId)) {
    out.push({ code: 'PARTNER_ID_INVALID', msg: '파트너 식별자 형식이 아니다' });
  }
  const declared = typeof o.channel === 'string' ? o.channel : (typeof o.acquired_via === 'string' ? o.acquired_via : null);
  if (declared != null && !CHANNELS.includes(declared)) {
    out.push({ code: 'CHANNEL_UNKNOWN', msg: `채널은 ${CHANNELS.join(' | ')} 중 하나여야 한다` });
  } else if (declared != null && declared !== channel) {
    out.push({ code: 'CHANNEL_MISMATCH', msg: `채널 '${declared}' 은 partner_id ${partnerId ? '있음' : '없음'} 과 어긋난다` });
  }
  if (o.contracted_at != null && o.contracted_at !== '' && !isValidDate(o.contracted_at)) {
    out.push({ code: 'CONTRACTED_AT_INVALID', msg: '계약일은 YYYY-MM-DD 형식이어야 한다' });
  }
  if (typeof o.attributed_by === 'string' && o.attributed_by.length > MAX_TEXT) {
    out.push({ code: 'ATTRIBUTED_BY_TOO_LONG', msg: `담당자 표시명은 ${MAX_TEXT}자 이하` });
  }
  if (typeof o.reason === 'string') {
    if (o.reason.length > MAX_TEXT) out.push({ code: 'REASON_TOO_LONG', msg: `귀속 근거는 ${MAX_TEXT}자 이하` });
    // 자유 서술란에 전화번호·이메일이 들어오는 것을 막는다(개인정보 유입 방어 · 파기 대상 밖의 컬럼이므로).
    if (CONTACT_RE.test(o.reason)) out.push({ code: 'REASON_HAS_CONTACT', msg: '귀속 근거에 전화번호·이메일을 적지 않는다' });
  }
  return out;
}

// 저장용 귀속 레코드 정규화(problems 가 비어 있을 때만 의미 있음). 채널은 partner_id 에서 유도한다.
//   → { org_id, partner_id, channel, contracted_at, attributed_by, reason } (컬럼명 = db/partner.sql)
export function normalizeAttribution(input) {
  const o = input && typeof input === 'object' ? input : {};
  const { channel, partnerId } = attributionOf(o);
  const orgId = typeof o.org_id === 'string' ? o.org_id : (typeof o.id === 'string' ? o.id : '');
  return {
    org_id: orgId.trim(),
    partner_id: partnerId,
    channel,
    contracted_at: isValidDate(o.contracted_at) ? o.contracted_at : null,
    attributed_by: typeof o.attributed_by === 'string' ? o.attributed_by.trim().slice(0, MAX_TEXT) : '',
    reason: typeof o.reason === 'string' ? o.reason.trim().slice(0, MAX_TEXT) : '',
  };
}

// 귀속 이력(partner_attributions 행 배열) 중 **유효한 최신 행**. created_at 내림차순, 동률이면 id 큰 쪽.
//   이력이 없으면 null(=귀속 미기록 · '직접 계약'으로 단정하지 않는다).
export function currentAttribution(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r === 'object');
  if (!list.length) return null;
  const ts = (r) => { const t = Date.parse(r.created_at); return Number.isNaN(t) ? -Infinity : t; };
  return list.reduce((best, r) => {
    if (!best) return r;
    const d = ts(r) - ts(best);
    if (d > 0) return r;
    if (d === 0 && Number(r.id || 0) > Number(best.id || 0)) return r;
    return best;
  }, null);
}

// 2계층 확장 여지: 테넌트 목록에 파트너 범위를 끼워 넣는 단일 지점.
//   partnerId 가 null/undefined → 전체(고원 운영자). 문자열 → 그 파트너에 귀속된 고객사만.
//   빈 문자열·이상값은 **아무 것도 반환하지 않는다**(범위 판정 실패를 전체 공개로 넘기지 않는다).
export function scopeOrganizations(orgs, partnerId) {
  const list = (Array.isArray(orgs) ? orgs : []).filter((o) => o && typeof o === 'object');
  if (partnerId == null) return list;
  if (!isValidId(partnerId)) return [];
  return list.filter((o) => attributionOf(o).partnerId === partnerId);
}

// 같은 규칙의 SQL 조각(향후 쿼리 계층에서 사용). 값은 바인딩 파라미터로만 나간다(문자열 결합 금지).
export function scopeSql(partnerId, paramIndex = 1) {
  if (partnerId == null) return { where: 'true', params: [] };
  if (!isValidId(partnerId)) return { where: 'false', params: [] };
  return { where: `partner_id = $${paramIndex}`, params: [partnerId] };
}

export default attributionProblems;
