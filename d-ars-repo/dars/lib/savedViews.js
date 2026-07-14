// lib/savedViews.js — **저장된 뷰(조회 조건 프리셋)** 순수 유틸 (React/DOM 비의존 → 단위 테스트 가능)
//
// 배경: 17~19회차로 기간·검색어·필터·뷰·정렬이 모두 URL 쿼리에 남게 되면서
//       **주소 하나 = 화면 완전 재현**이 성립했다. 그런데 실무에서 자주 쓰는 조건
//       (예: "실패한 UMS 발송 · 최근 7일 · 시각 내림차순")은 여전히 매번 **손으로 다시 만들어야** 한다.
//       매일 아침 같은 조건을 5번 클릭해서 재구성하는 것은 감사·정산 담당자의 실제 반복 노동이다.
//       → 현재 URL 쿼리를 **이름 붙여 저장**해 두고 한 번에 되돌아가는 프리셋을 제공한다.
//
// 설계:
//   - 저장 단위는 **쿼리 문자열 그 자체**(선행 '?' 없음). 화면별 상태 모델을 몰라도 되고,
//     새 파라미터가 추가돼도 이 모듈은 바뀌지 않는다(URL 이 이미 단일 진실 공급원이므로).
//   - 저장소는 **브라우저 localStorage**(화면별 키) → **DB 스키마 변경 없음 · 서버 무관 · 저위험**.
//     (조직 공유가 필요해지면 나중에 서버 저장으로 승격 가능 — 그때도 이 자료구조를 그대로 쓴다.)
//   - 손상된 JSON·잘못된 항목은 **조용히 버리고** 나머지를 살린다(화면이 절대 깨지지 않는다).
//   - 개인정보(전화번호)는 저장 대상이 아니다 — 전화번호는 어느 목록에서도 **서버 검색 대상이 아니고**
//     따라서 URL 쿼리에 실리지 않는다(PII 정책 유지). 저장되는 것은 필터·기간·정렬·검색어뿐이다.

export const MAX_VIEWS = 12;   // 화면당 최대 프리셋 수(칩이 줄바꿈으로 넘쳐 레이아웃을 밀지 않도록)
export const MAX_NAME = 24;    // 이름 길이 상한
export const MAX_QUERY = 500;  // 쿼리 문자열 상한(비정상적으로 긴 URL 저장 방지)

// localStorage 키 — 화면 식별자별로 분리(같은 브랜드 네임스페이스 `dars:` 유지).
export function storageKey(screen) {
  const s = String(screen || '').trim() || 'default';
  return `dars:views:${s}`;
}

// 이름 정규화: 트림 · 공백 접기 · 길이 제한. 비면 null(= 저장 불가).
export function normalizeName(name) {
  const s = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.slice(0, MAX_NAME);
}

// 쿼리 정규화: 선행 '?' 제거 · 트림 · 길이 제한. 빈 문자열도 **유효한 뷰**다(= '조건 없음/전체' 프리셋).
export function normalizeQuery(query) {
  if (typeof query !== 'string') return '';
  const s = query.startsWith('?') ? query.slice(1) : query;
  return s.trim().slice(0, MAX_QUERY);
}

const isView = (v) => v && typeof v === 'object' && typeof v.name === 'string' && typeof v.q === 'string';

// 저장된 원문(JSON 문자열 또는 이미 파싱된 배열) → 유효한 뷰 배열.
// 손상·이상 항목은 버리고, 같은 이름은 **앞선 것만** 남기며(중복 제거), 상한까지만 취한다.
export function parseViews(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = new Set();
  for (const v of arr) {
    if (!isView(v)) continue;
    const name = normalizeName(v.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, q: normalizeQuery(v.q) });
    if (out.length >= MAX_VIEWS) break;
  }
  return out;
}

export function serializeViews(list) {
  return JSON.stringify(parseViews(list));
}

// 뷰 추가·갱신(원본 불변). 같은 이름이면 **덮어쓴다**(= 조건 업데이트, 중복 생성 아님).
// 신규는 뒤에 붙이고, 상한을 넘으면 **가장 오래된 것부터** 밀어낸다.
export function addView(list, name, query) {
  const nm = normalizeName(name);
  if (!nm) return parseViews(list);           // 이름이 없으면 변화 없음
  const q = normalizeQuery(query);
  const cur = parseViews(list);
  const i = cur.findIndex((v) => v.name === nm);
  if (i >= 0) {
    const next = [...cur];
    next[i] = { name: nm, q };                // 제자리 갱신(칩 순서 유지 → 사용자가 위치를 다시 찾지 않아도 된다)
    return next;
  }
  const next = [...cur, { name: nm, q }];
  return next.length > MAX_VIEWS ? next.slice(next.length - MAX_VIEWS) : next;
}

// 뷰 삭제(원본 불변). 없는 이름이면 그대로.
export function removeView(list, name) {
  const nm = normalizeName(name);
  const cur = parseViews(list);
  if (!nm) return cur;
  return cur.filter((v) => v.name !== nm);
}

export function findView(list, name) {
  const nm = normalizeName(name);
  if (!nm) return null;
  return parseViews(list).find((v) => v.name === nm) || null;
}

// 뷰를 적용할 주소(pathname + 쿼리). 쿼리가 비면 순수 경로 → '전체' 조건으로 되돌아간다.
export function viewHref(pathname, query) {
  const p = String(pathname || '/') || '/';
  const q = normalizeQuery(query);
  return q ? `${p}?${q}` : p;
}

// 현재 주소가 이 뷰와 같은 조건인가 — 파라미터 **순서가 달라도 같게** 판정한다
// (사용자가 필터를 클릭한 순서에 따라 쿼리 순서가 달라지기 때문. 그래도 조건은 동일하다).
export function sameQuery(a, b) {
  const norm = (s) => {
    const sp = new URLSearchParams(normalizeQuery(s));
    const pairs = [...sp.entries()].sort(([k1, v1], [k2, v2]) => (k1 === k2 ? String(v1).localeCompare(String(v2)) : k1.localeCompare(k2)));
    return pairs.map(([k, v]) => `${k}=${v}`).join('&');
  };
  try { return norm(a) === norm(b); } catch { return false; }
}

export default parseViews;
