// lib/liveMerge.js — 실시간 스트림(SSE) 스냅샷을 "페이지 누적 목록"에 반영하는 순수 유틸
//
// 배경: 세션 보드는 SSE 로 최신 진행 세션 스냅샷(최대 20건)을 2초마다 받는다.
//       한편 목록은 서버 검색·"더 보기" 페이징(50건씩 누적)으로 과거 세션까지 로드한다.
//       스냅샷으로 목록을 통째로 교체하면 **더 보기로 로드한 과거 행이 사라진다**.
//       → 스냅샷은 (1) 이미 로드된 행을 id 기준으로 **갱신**하고,
//          (2) 목록의 맨 앞(최신)에 **새 세션만 삽입**한다(검색 중에는 조건 불명확 → 삽입 금지).
// React·DB 비의존 순수 함수 → 단위 테스트 가능. 개인정보·인증·과금 로직과 무관.

const idOf = (r) => (r && r.id != null ? String(r.id) : null);

// prev: 화면에 로드된 행(페이지 누적), live: SSE 스냅샷 배열
// insert=false 이면 새 세션을 삽입하지 않고 기존 행 갱신만 한다(검색어·필터가 걸린 상태).
export function applyLive(prev, live, { insert = true } = {}) {
  const base = Array.isArray(prev) ? prev : [];
  const snap = Array.isArray(live) ? live : [];
  if (!snap.length) return base;

  const byId = new Map();
  for (const r of snap) {
    const id = idOf(r);
    if (id) byId.set(id, r);
  }

  let changed = false;
  const merged = base.map((row) => {
    const id = idOf(row);
    const hit = id ? byId.get(id) : null;
    if (!hit) return row;
    byId.delete(id); // 이미 목록에 있는 세션 → 삽입 대상에서 제외
    const next = { ...row, ...hit };
    if (equalRow(row, next)) return row;
    changed = true;
    return next;
  });

  const fresh = insert ? snap.filter((r) => { const id = idOf(r); return id && byId.has(id); }) : [];
  if (!fresh.length) return changed ? merged : base;
  return fresh.concat(merged); // 새 세션은 최신순 목록 맨 앞
}

// 얕은 비교 — 값이 그대로면 새 배열/객체를 만들지 않아 불필요한 리렌더를 줄인다.
function equalRow(a, b) {
  const ka = Object.keys(a || {});
  const kb = Object.keys(b || {});
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a[k] === b[k]);
}

export default applyLive;
