// lib/selection.js — 목록 행 선택(체크박스) 순수 유틸 + 내보내기 범위 결정(25회차, 백로그 (v))
//
// 배경: 내보내기는 22~24회차를 거치며 "현재 조건의 **서버 전체 행**"을 문서·파일명에 조건까지 적어
//   내보내는 데까지 왔다. 그런데 실제 감사·정산 현장의 요청은 종종 그보다 좁다 —
//   **"이 3건만 뽑아 보내 주세요"**. 지금까지는 그 3건을 담을 방법이 없어 (1) 전체를 내보낸 뒤
//   엑셀에서 손으로 지우거나(원본 훼손·실수 위험), (2) 조건을 억지로 좁혀 3건만 남기려 애써야 했다
//   (대개 불가능하다 — 서로 다른 업무의 3건에는 공통 조건이 없다).
//
// 설계 원칙:
//   - **선택이 0건이면 기존 동작과 100% 동일**(서버 전체 수집 → 내보내기). 체크박스를 한 번도
//     건드리지 않는 사용자에게는 아무것도 바뀌지 않는다(하위호환).
//   - 선택이 1건 이상이면 내보내기는 **선택 행만** 담는다. 이때는 이미 화면에 로드된 행이므로
//     서버 재수집이 필요 없다(즉시 다운로드 · 네트워크 0회).
//   - 감사 추적을 깨지 않는다: 문서 머리말과 파일명에 **"선택한 N건만 내보냄"**을 남긴다
//     → 받는 사람이 "이게 전체인가 일부인가"를 파일만 보고 안다(22·23회차 원칙의 연장).
//   - 선택 대상은 **행의 id 집합**이며 전화번호(PII)는 담지 않는다. 선택은 브라우저 메모리에만
//     존재하고 URL·localStorage·서버 어디에도 저장하지 않는다 → 공유 링크·저장된 뷰 무영향.
//
// (상대 경로 임포트 — node:test 러너가 별칭 해석 없이 직접 임포트한다)
import { currentSearch, exportSubtitle, conditionSlug } from './conditionSummary.js';

export const DEFAULT_GET_ID = (r) => (r && r.id != null ? r.id : null);

// 행 배열 → id 배열(누락 id 는 제외 — 식별할 수 없는 행은 선택 대상이 아니다)
export function rowIds(rows, getId = DEFAULT_GET_ID) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows) {
    const id = getId(r);
    if (id != null) out.push(id);
  }
  return out;
}

// 하나 토글 — **새 Set 을 반환**(원본 불변 → React 상태 갱신 감지)
export function toggleId(sel, id) {
  const next = new Set(sel instanceof Set ? sel : []);
  if (id == null) return next;
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

// 여러 개 일괄 on/off (전체 선택 체크박스)
export function setMany(sel, ids, on) {
  const next = new Set(sel instanceof Set ? sel : []);
  for (const id of Array.isArray(ids) ? ids : []) {
    if (id == null) continue;
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function allSelected(sel, ids) {
  const list = Array.isArray(ids) ? ids : [];
  if (list.length === 0) return false; // 빈 목록에서 "전체 선택됨"은 의미가 없다
  const s = sel instanceof Set ? sel : new Set();
  return list.every((id) => s.has(id));
}

export function someSelected(sel, ids) {
  const list = Array.isArray(ids) ? ids : [];
  const s = sel instanceof Set ? sel : new Set();
  return list.some((id) => s.has(id));
}

// 헤더 체크박스는 3상태: 전체 선택(checked) · 일부 선택(indeterminate) · 미선택
export function headerState(sel, ids) {
  const all = allSelected(sel, ids);
  return { checked: all, indeterminate: !all && someSelected(sel, ids) };
}

// 선택된 행 — **현재 화면(=서버) 정렬 순서를 그대로 보존**한다(체크한 순서가 아니라).
// 내보낸 파일의 행 순서가 화면과 달라지면 대조가 안 되기 때문이다.
export function selectedRows(rows, sel, getId = DEFAULT_GET_ID) {
  if (!Array.isArray(rows)) return [];
  const s = sel instanceof Set ? sel : new Set();
  return rows.filter((r) => {
    const id = getId(r);
    return id != null && s.has(id);
  });
}

// 조건이 바뀌면(검색·필터·기간·정렬) 화면의 행 집합 자체가 달라진다 → 사라진 행의 선택은 정리한다.
// (남겨 두면 "3건 선택됨"인데 표에는 1건만 체크된 유령 상태가 된다)
export function pruneSelection(sel, ids) {
  const keep = new Set(Array.isArray(ids) ? ids : []);
  const next = new Set();
  for (const id of sel instanceof Set ? sel : []) if (keep.has(id)) next.add(id);
  return next;
}

// ── 내보내기 범위(감사 추적) ────────────────────────────────────────────────────────────
// 선택이 있을 때만 문서 머리말·파일명에 "선택한 N건"을 덧붙인다.
// 선택이 없으면 **빈 opts** → downloadCSV/Excel/printPDF 가 기존대로 현재 조건을 자동 기록한다(하위호환).
export function selectionNote(count) {
  const n = Math.max(0, Number(count) || 0);
  return n > 0 ? `선택한 ${n}건만 내보냄` : '';
}

export function exportScope(count, search = '') {
  const n = Math.max(0, Number(count) || 0);
  if (n <= 0) return {};
  const base = exportSubtitle(search);
  const slug = conditionSlug(search);
  const tag = `선택${n}건`;
  return {
    subtitle: `${base} · ${selectionNote(n)}`,
    slug: slug ? `${slug}_${tag}` : tag,
  };
}

// 화면 호출부 공통 진입점:
//   const R = exportRunner(S, X);
//   const exportCsv = () => R.run((rows, opts) => downloadCSV('ums.csv', rows, cols, opts));
// - 선택 0건: 기존 경로(X.run — 서버 전체 수집, opts 없음)
// - 선택 N건: 이미 로드된 선택 행을 즉시 넘긴다(서버 요청 0회) + 선택 표기 opts
export function exportRunner(S, X, { search = currentSearch } = {}) {
  const count = S && Number(S.count) > 0 ? Number(S.count) : 0;
  const scoped = count > 0;
  return {
    scoped,
    count,
    run(handler) {
      if (typeof handler !== 'function') return undefined;
      if (scoped) {
        const rows = (S && S.rows) || [];
        return handler(rows, exportScope(count, typeof search === 'function' ? search() : String(search || '')));
      }
      if (!X || typeof X.run !== 'function') return undefined;
      return X.run((all) => handler(all, {}));
    },
  };
}

export default selectedRows;
