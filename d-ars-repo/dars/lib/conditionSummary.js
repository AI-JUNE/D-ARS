// lib/conditionSummary.js — **조회 조건 요약**(URL 쿼리 → 사람이 읽는 한 줄) 순수 유틸
// (React/DOM/DB 비의존 → 단위 테스트 가능. 사용처: lib/export.js 내보내기 머리말 · lib/ClearFilters.jsx 툴팁)
//
// 배경(감사·정산 신뢰성): 17~21회차로 기간·검색어·필터·뷰·정렬이 전부 URL 에 남고, 내보내기는
//   **서버 전체 기준**으로 현재 조건의 모든 행을 담는다. 그런데 **내보낸 파일 자체에는 그 조건이
//   한 글자도 기록되지 않았다** — "UMS 12건" 파일만 받은 감사자는 그것이 전체인지, 최근 7일 실패분인지,
//   특정 검색어 결과인지 알 수 없다(파일명에는 날짜 스탬프만 있다). 조건이 다른 두 파일이 같은 이름으로
//   나란히 놓이면 **잘못된 결론**으로 이어진다. → 내보내기 시 **현재 조건을 문서에 함께 기록**한다.
//
// 설계:
//   - 입력 단위는 **쿼리 문자열 그 자체**(clearParams·savedViews·shareLink 와 동일) → 화면별 상태 모델을
//     몰라도 되고, 새 조건 파라미터가 추가돼도 라벨만 늘리면 된다(URL 이 단일 진실 공급원).
//   - 모르는 키/값도 **버리지 않고** 키=값 그대로 표기한다(감사 기록은 누락보다 과다가 안전).
//   - `sort`·`dir` 은 한 항목으로 합쳐 "정렬: 수정일 ↓" 로 표기한다.
//   - 조건이 없으면 `''`(빈 문자열) → 호출부가 "조건 없음(전체)" 문구를 선택할 수 있다.
//   - 개인정보: 전화번호는 어느 목록에서도 **서버 검색 대상이 아니라 URL 에 실리지 않는다**(기존 PII 정책)
//     → 요약 문자열에 전화번호가 새어 나갈 경로가 원천적으로 없다.

// 기간 프리셋(lib/RangeSeg.jsx 의 RANGE_PRESETS 와 같은 의미 — 여기서는 라벨만 필요하다)
export const RANGE_LABELS = {
  '7d': '최근 7일',
  '30d': '최근 30일',
  '90d': '최근 90일',
};

// 정렬 키 라벨(lib/listSorts.js 의 5개 스펙 키 합집합 — 표 헤더 문구와 일치).
// 화면마다 스펙이 달라도 키 이름은 의미가 같아 하나의 표로 충분하다. 모르는 키는 키 이름을 그대로 쓴다.
export const SORT_LABELS = {
  id: 'ID', ts: '시각', sent_at: '발송 시각', updated_at: '수정일',
  phone: '번호', scenario: '시나리오', channel: '채널', result: '결과', duration: '소요',
  step: '단계', elapsed: '경과', status: '상태', biz: '업무', name: '이름',
  req: '요청', sent: '발송', done: '완료', rate: '완료율',
  service: '서비스', doc: '서류', type: '유형', version: '버전', nodes: '노드 수',
};

// 조건 파라미터 라벨·값 라벨. 여기에 없는 키도 그대로 표기된다(위 설계 참조).
export const PARAM_SPEC = {
  range: { label: '기간', values: RANGE_LABELS },
  q: { label: '검색어', quote: true },
  status: { label: '상태' },
  ch: { label: '채널' },
  view: { label: '보기', values: { board: '보드', table: '표' } },
  from: { label: '시작일' },
  to: { label: '종료일' },
};

const SORT_QS = 'sort';
const DIR_QS = 'dir';

function toParams(search) {
  try {
    if (search instanceof URLSearchParams) return new URLSearchParams(search.toString());
    if (typeof search === 'string') return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    if (search && typeof search === 'object') {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(search)) if (v != null) sp.set(k, String(v));
      return sp;
    }
  } catch {
    /* 형식이 어긋나면 빈 파라미터로 폴백 → 내보내기가 절대 실패하지 않는다 */
  }
  return new URLSearchParams();
}

// 쿼리 → [{ key, label, value }] (표시 순서: 기간 → 필터 → 검색어 → 정렬 → 기타)
const ORDER = ['range', 'from', 'to', 'status', 'ch', 'view', 'q'];

export function summarizeQuery(search) {
  const sp = toParams(search);
  const out = [];
  const seen = new Set([SORT_QS, DIR_QS]);

  const push = (key, raw) => {
    const spec = PARAM_SPEC[key];
    const val = String(raw ?? '').trim();
    if (!val) return;                                   // 빈 값은 조건이 아니다
    const label = spec?.label || key;
    const shown = spec?.values?.[val] || val;
    out.push({ key, label, value: spec?.quote ? `'${shown}'` : shown });
  };

  for (const key of ORDER) {
    if (!sp.has(key)) continue;
    seen.add(key);
    for (const v of sp.getAll(key)) push(key, v);
  }

  // 정렬(sort + dir → 한 항목)
  const sk = (sp.get(SORT_QS) || '').trim();
  if (sk) {
    const desc = (sp.get(DIR_QS) || '').trim().toLowerCase() === 'desc'; // 서버 parseSortParams 와 같은 규칙
    out.push({ key: SORT_QS, label: '정렬', value: `${SORT_LABELS[sk] || sk} ${desc ? '↓ 내림차순' : '↑ 오름차순'}` });
  }

  // 스펙에 없는 나머지 파라미터도 기록(누락보다 과다가 안전)
  for (const [k, v] of sp.entries()) {
    if (seen.has(k)) continue;
    seen.add(k);
    for (const vv of sp.getAll(k)) push(k, vv);
  }

  return out;
}

// 사람이 읽는 한 줄 — "기간: 최근 7일 · 상태: 실패 · 정렬: 발송 시각 ↓ 내림차순"
// 조건이 없으면 '' (호출부가 기본 문구를 고른다).
export function conditionText(search) {
  return summarizeQuery(search).map((c) => `${c.label}: ${c.value}`).join(' · ');
}

// 내보내기 문서(PDF·Excel) 머리말 — 조건이 없어도 **명시적으로** 전체임을 남긴다(감사 기록).
export function exportSubtitle(search, { none = '조회 조건 없음(전체)' } = {}) {
  const t = conditionText(search);
  return t ? `조회 조건 — ${t}` : `조회 조건 — ${none}`;
}

// ── 파일명용 조건 슬러그(23회차, 백로그 (s)) ────────────────────────────────────────────────
// 배경: 22회차로 PDF·Excel **문서 안**에는 조건이 남았지만, **파일명**은 여전히 `ums_2026-07-14.csv` 뿐이라
//   같은 날 조건만 바꿔 두 번 내보내면 **파일명이 충돌**하고(브라우저가 `(1)` 을 붙인다) 폴더에 쌓인 파일을
//   **열어 보기 전에는 구분할 수 없다**. CSV 는 데이터 무결성 때문에 본문에 머리말을 넣지 않으므로
//   **CSV 를 조건별로 구분할 유일한 수단이 파일명**이다. → 파일명에 조건 요약을 넣는다.
// 설계: 사람이 읽는 라벨이 아니라 **URL 원값**을 쓴다(짧고, 그 값을 그대로 주소에 넣으면 조건이 재현된다).
//   파일 시스템 금지문자(\ / : * ? " < > |)·제어문자·공백은 '-' 로 치환하고, 토큰 24자·전체 60자로 자른다.

export const SLUG_MAX = 60;      // 슬러그 전체 상한(날짜 스탬프·확장자 제외)
export const SLUG_TOKEN_MAX = 24; // 토큰 1개 상한(긴 검색어 방어)

// 파일명 안전 토큰(한글은 보존 — 윈도우·맥 모두 UTF-8 파일명을 지원한다)
export function slugToken(v, max = SLUG_TOKEN_MAX) {
  const s = String(v ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '-')
    .replace(/[\s._]+/g, '-')     // 공백·점·밑줄 → '-' ('_' 는 구분자로 쓰므로 토큰 안에 두지 않는다)
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.slice(0, Math.max(1, max)).replace(/-+$/g, '');
}

// 쿼리 → 파일명 조각. 조건이 없으면 '' (호출부는 기존 파일명을 그대로 쓴다 → 하위호환).
export function conditionSlug(search, { max = SLUG_MAX } = {}) {
  const sp = toParams(search);
  const out = [];
  const seen = new Set([SORT_QS, DIR_QS]);

  for (const key of ORDER) {
    if (!sp.has(key)) continue;
    seen.add(key);
    for (const v of sp.getAll(key)) {
      const t = slugToken(v);
      if (t) out.push(key === 'from' || key === 'to' ? `${key}-${t}` : t);
    }
  }

  const sk = (sp.get(SORT_QS) || '').trim();
  if (sk) {
    const desc = (sp.get(DIR_QS) || '').trim().toLowerCase() === 'desc';
    const t = slugToken(sk);
    if (t) out.push(`sort-${t}-${desc ? 'desc' : 'asc'}`);
  }

  for (const [k] of sp.entries()) {
    if (seen.has(k)) continue;
    seen.add(k);
    for (const vv of sp.getAll(k)) {
      const t = slugToken(vv);
      if (t) out.push(`${slugToken(k, 12)}-${t}`);
    }
  }

  // 전체 길이 상한: 들어가는 데까지만 담는다(잘린 채로 이어 붙여 오해를 만들지 않는다)
  const cap = Math.max(0, Number(max) || 0);
  let slug = '';
  for (const t of out) {
    const next = slug ? `${slug}_${t}` : t;
    if (next.length > cap) break;
    slug = next;
  }
  return slug;
}

// 브라우저에서 현재 주소의 조건 요약(SSR·비브라우저에서는 '' → 호출부가 안전하게 폴백).
export function currentSearch() {
  try {
    return typeof window !== 'undefined' && window.location ? String(window.location.search || '') : '';
  } catch {
    return '';
  }
}

export default conditionText;
