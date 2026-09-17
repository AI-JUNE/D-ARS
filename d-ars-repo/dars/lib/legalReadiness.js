// lib/legalReadiness.js — 약관·개인정보처리방침 **확정본 게시 준비도** 판정(순수 로직 · 무부작용)
//
// 배경(COMMERCIAL_READINESS "약관·개인정보 처리방침 확정본 반영"): 문안 확정은 법무·사업자 정보가
//   있어야 하는 **사람의 일**이고 자동화가 대신할 수 없다. 자동화가 할 수 있고 해야 하는 일은 따로 있다 —
//   **"아직 초안이다"가 조용히 사라지지 않게** 하는 것이다. 지금 구조에서 `LEGAL_META.status` 를
//   'published' 로 한 글자만 바꾸면 화면의 초안 배너가 사라지고, 사업자등록번호도 수탁자 목록도
//   보유기간도 비어 있는 문서가 그대로 정식 고지가 된다. 아무 오류도 나지 않는다.
//
// 그래서 확정 조건을 목록이 아니라 **판정**으로 둔다. 사람이 채워야 할 칸이 비어 있으면 차단 사유로
//   보고하고, 다 채워졌을 때만 'published' 가 통과한다(= 체크리스트가 썩지 않는다).
//
// 한 가지 더: 방침 본문이 **아직 켜지지 않은 보호조치를 시행 중이라고 말하는지** 본다. 7장은
//   "접근권한 관리(RBAC)·접근 통제 … 를 시행합니다" 라고 단언하는데 실제로는 `AUTH_ENFORCE` 가
//   꺼져 있으면 인증이 강제되지 않는다. 초안 단계에서는 경고지만, 확정본에서 이 어긋남은
//   허위 서술이다(QUALITY_BAR §3 "오류를 삼키고 아무 일 없는 척하기" 와 같은 부류).
//
// 이 모듈은 **문안을 만들지도 고치지도 않는다.** 값을 읽어 판정만 하고, 어떤 입력에도 throw 하지 않으며
//   환경변수 값을 결과에 담지 않는다(이름·설정 여부만 — 다른 readiness 모듈과 동일 계약).

export const LEGAL_STATUSES = ['draft', 'published'];

// 확정본에 반드시 채워져야 하는 LEGAL_META 항목 — 비어 있으면 게시 불가.
//   key = 필드명, value = 사람이 어디서 가져와야 하는지(=빈 칸을 채울 출처).
export const REQUIRED_META = Object.freeze({
  operator: '운영 법인명 — 사업자등록증',
  service: '서비스명',
  contactEmail: '공식 문의 이메일',
  effectiveDate: '시행일(YYYY-MM-DD)',
  businessNumber: '사업자등록번호 — 사업자등록증',
  address: '사업장 주소 — 사업자등록증',
  privacyOfficer: '개인정보 보호책임자 성명·직책',
  retentionNotice: '보유기간 확정 문구 — 위탁계약·관계 법령',
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// 본문에 남아 있으면 "확정 안 된 자리"라는 뜻인 표식들.
const PENDING_RE = /\[승인 필요\]|⚠️|TBD|TODO|미확정/;

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function sectionsText(sections) {
  return (Array.isArray(sections) ? sections : [])
    .filter((s) => s && typeof s === 'object')
    .map((s) => `${str(s.h)}\n${str(s.body)}`)
    .join('\n');
}

/**
 * 준비도 판정.
 * @param {{meta?: object, terms?: any[], privacy?: any[], subprocessors?: any[], env?: object}} input
 * @returns {{status: string, published: boolean, blockers: {code,msg}[], warnings: {code,msg}[],
 *            filled: string[], missing: string[], ok: boolean}}
 *   blockers — 확정본으로 게시할 수 없는 사유(status 가 'published' 일 때 종료코드 1).
 *   warnings — 초안 단계에서 알고만 있으면 되는 것.
 *   ok       — '지금 상태가 일관되는가'. 초안이면 초안다우면 통과, 게시본이면 빈 칸이 없어야 통과.
 */
export function legalReadiness(input) {
  const i = input && typeof input === 'object' ? input : {};
  const meta = i.meta && typeof i.meta === 'object' ? i.meta : {};
  const env = i.env && typeof i.env === 'object' ? i.env : {};
  const blockers = [];
  const warnings = [];

  const status = LEGAL_STATUSES.includes(meta.status) ? meta.status : 'draft';
  if (!LEGAL_STATUSES.includes(meta.status)) {
    blockers.push({ code: 'STATUS_UNKNOWN', msg: `status 는 ${LEGAL_STATUSES.join(' | ')} 중 하나여야 한다(초안으로 간주)` });
  }
  const published = status === 'published';

  // 1) 확정본 필수 항목
  const filled = [];
  const missing = [];
  for (const key of Object.keys(REQUIRED_META)) {
    if (str(meta[key])) filled.push(key); else missing.push(key);
  }
  for (const key of missing) {
    blockers.push({ code: 'META_MISSING', msg: `${key} 미확정 — ${REQUIRED_META[key]}` });
  }
  if (str(meta.contactEmail) && !EMAIL_RE.test(str(meta.contactEmail))) {
    blockers.push({ code: 'CONTACT_INVALID', msg: 'contactEmail 이 이메일 형식이 아니다' });
  }
  if (str(meta.effectiveDate) && !DATE_RE.test(str(meta.effectiveDate))) {
    blockers.push({ code: 'EFFECTIVE_DATE_INVALID', msg: 'effectiveDate 는 YYYY-MM-DD 형식이어야 한다' });
  }

  // 2) 본문에 남은 미확정 표식 — 초안이면 **있어야 정상**, 게시본이면 남아 있으면 안 된다.
  const body = `${sectionsText(i.terms)}\n${sectionsText(i.privacy)}`;
  const hasPending = PENDING_RE.test(body);
  if (published && hasPending) {
    blockers.push({ code: 'PENDING_MARKERS', msg: '게시본인데 본문에 [승인 필요]·⚠️·TBD 표식이 남아 있다' });
  }
  if (!published && !hasPending) {
    warnings.push({ code: 'DRAFT_UNMARKED', msg: '초안인데 본문에 미확정 표식이 없다 — 읽는 사람이 확정본으로 오해할 수 있다' });
  }

  // 3) 처리위탁 수탁자 공개(개인정보 보호법 §26) — 목록이 비면 방침 5장은 일반론에 머문다.
  const subs = (Array.isArray(i.subprocessors) ? i.subprocessors : []).filter((s) => s && str(s.name) && str(s.task));
  if (!subs.length) {
    blockers.push({ code: 'SUBPROCESSORS_EMPTY', msg: '처리위탁 수탁자 공개 목록이 비어 있다(수탁자·위탁업무 내용)' });
  }

  // 4) 본문이 **아직 켜지지 않은 보호조치**를 시행 중이라고 말하는가.
  //    값이 아니라 설정 여부만 본다(다른 readiness 모듈과 동일 — 값은 결과에 담지 않는다).
  const enforced = env.AUTH_ENFORCE === '1';
  const claimsAccessControl = /접근권한 관리|접근 통제|RBAC/.test(body);
  if (claimsAccessControl && !enforced) {
    const msg = '방침이 접근권한 관리·접근 통제를 시행 중이라고 서술하는데 AUTH_ENFORCE 가 켜져 있지 않다';
    (published ? blockers : warnings).push({ code: 'CLAIM_AHEAD_OF_CODE', msg });
  }

  // 5) 보유기간 — **보유·이용기간 조항 안에** 기간 수치가 없으면 "지체 없이 파기" 일반론뿐이라는 뜻이다.
  //    방침 전체를 보면 §9 고지 의무의 '7일'(공지 기간)에 걸려 오탐이 난다 — 조항을 좁혀서 본다.
  const retentionSection = (Array.isArray(i.privacy) ? i.privacy : [])
    .filter((s) => s && typeof s === 'object' && /보유/.test(str(s.h)))
    .map((s) => str(s.body))
    .join('\n');
  if (retentionSection && !/\d+\s*(일|개월|년)/.test(retentionSection) && !str(meta.retentionNotice)) {
    warnings.push({ code: 'RETENTION_VAGUE', msg: '보유·이용기간 조항에 구체적 기간이 없다 — 위탁계약·법령에 맞춰 확정 필요' });
  }

  // ok 판정: 게시본은 차단 사유가 하나도 없어야 하고, 초안은 "초안임이 드러나면" 통과다.
  //   초안 단계에서 빈 칸을 이유로 CI 를 빨갛게 만들지 않는다(아직 사람의 차례이기 때문).
  const ok = published ? blockers.length === 0 : !blockers.some((b) => b.code === 'STATUS_UNKNOWN' || b.code === 'CONTACT_INVALID' || b.code === 'EFFECTIVE_DATE_INVALID');

  return { status, published, blockers, warnings, filled, missing, ok };
}

// 사람이 채워야 할 남은 칸의 요약 한 줄(값은 담지 않고 **항목 이름**만).
export function pendingSummary(r) {
  const res = r && typeof r === 'object' ? r : {};
  const missing = Array.isArray(res.missing) ? res.missing : [];
  if (!missing.length) return '확정 필요 항목 없음';
  return `확정 필요 ${missing.length}건: ${missing.join(', ')}`;
}

export default legalReadiness;
