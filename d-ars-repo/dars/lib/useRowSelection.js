'use client';
// lib/useRowSelection.js — 목록 행 선택 훅(25회차, 백로그 (v))
//
// 사용 예)
//   const S = useRowSelection(view, { scope: JSON.stringify({ q: L.dq, ...listParams }) });
//   const R = exportRunner(S, X);
//   const exportCsv = () => R.run((rows, opts) => downloadCSV('ums.csv', rows, exportCols, opts));
//   <SelectAllTh S={S} /> … <SelectTd S={S} row={r} /> … <SelectionNote S={S} />
//
// - 선택은 **브라우저 메모리에만** 존재한다(URL·localStorage·서버 미저장) → 공유 링크·저장된 뷰·PII 무영향.
// - 조회 조건(scope)이 바뀌면 선택을 비운다: 다른 조건으로 갈아탄 뒤 "3건 선택됨"이 남아 있으면
//   사용자는 자신이 무엇을 내보내는지 알 수 없다(가장 위험한 종류의 침묵).
// - "더 보기"로 행이 늘어나는 것은 같은 조건이므로 선택을 유지한다(누적 선택 가능).
// - 자동 갱신으로 행이 사라지면 그 id 의 선택도 정리한다(유령 선택 방지) — `count` 는 항상
//   **화면에 실재하는 선택 행 수**이므로 표의 체크 수와 안내 문구가 어긋나지 않는다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_GET_ID, rowIds, toggleId, setMany, headerState, selectedRows, pruneSelection,
} from '@/lib/selection';

export function useRowSelection(rows, { scope = '', getId = DEFAULT_GET_ID } = {}) {
  const [sel, setSel] = useState(() => new Set());
  // rows 가 배열이 아니면 매 렌더마다 새 [] 참조가 생겨 아래 useMemo 들이 매번 재계산된다
  // (react-hooks/exhaustive-deps 경고) → list 자체를 메모해 참조를 안정화한다. 결과는 동일.
  const list = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
  const ids = useMemo(() => rowIds(list, getId), [list, getId]);
  const idKey = useMemo(() => ids.map(String).join(''), [ids]); // 행 집합 변화 감지(참조 무관)

  const idsRef = useRef(ids);
  idsRef.current = ids;

  // (1) 조건이 바뀌면 선택 초기화 — 첫 렌더에서는 건너뛴다(불필요한 상태 갱신 방지)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSel((prev) => (prev.size === 0 ? prev : new Set()));
  }, [scope]);

  // (2) 화면에서 사라진 행의 선택 정리. 선택이 없으면 아무 일도 하지 않는다.
  useEffect(() => {
    setSel((prev) => {
      if (prev.size === 0) return prev;
      const next = pruneSelection(prev, idsRef.current);
      return next.size === prev.size ? prev : next;
    });
  }, [idKey]);

  const toggle = useCallback((id) => setSel((prev) => toggleId(prev, id)), []);
  const toggleAll = useCallback(() => {
    setSel((prev) => {
      const cur = idsRef.current;
      const all = cur.length > 0 && cur.every((id) => prev.has(id));
      return setMany(prev, cur, !all);
    });
  }, []);
  const clear = useCallback(() => setSel((prev) => (prev.size === 0 ? prev : new Set())), []);
  const isSelected = useCallback((id) => sel.has(id), [sel]);

  const head = headerState(sel, ids);
  const picked = useMemo(() => selectedRows(list, sel, getId), [list, sel, getId]);

  return {
    sel,
    ids,
    count: picked.length,   // 화면에 실재하는 선택 행 수(유령 제외)
    rows: picked,           // 화면(=서버) 정렬 순서 보존
    active: picked.length > 0,
    checked: head.checked,
    indeterminate: head.indeterminate,
    getId,
    isSelected,
    toggle,
    toggleAll,
    clear,
  };
}

export default useRowSelection;
