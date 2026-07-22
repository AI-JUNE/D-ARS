'use client';
// lib/RowSelect.jsx — 목록 행 선택 UI(25회차, 백로그 (v))
//
//   <SelectAllTh S={S} />              표 헤더의 전체 선택 체크박스(3상태: 전체·일부·미선택)
//   <SelectTd S={S} row={r} />         행 체크박스
//   <SelectionNote S={S} />            "3건 선택됨 · 내보내기는 선택 행만" 안내 + 선택 해제
//
// 설계:
// - 선택 열은 **인쇄 시 숨긴다**(`noprint`) — 인쇄물(감사 제출본)에 빈 체크박스 칸이 남지 않는다.
//   헤더·본문 모두 같은 클래스라 열 수가 어긋나지 않는다(무붕괴).
// - 체크박스는 네이티브 `<input type="checkbox">` — 키보드(Tab·Space)·스크린리더가 그대로 동작한다.
//   행 전체를 클릭 대상으로 만들지 않는다(표의 기존 클릭·정렬 UX 를 건드리지 않기 위해).
// - 헤더 체크박스의 '일부 선택'은 DOM 속성(indeterminate)이라 ref 로만 설정할 수 있다.

import { useEffect, useRef } from 'react';

export function SelectAllTh({ S, label = '전체 선택' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!S.indeterminate;
  }, [S.indeterminate, S.checked]);
  return (
    <th className="noprint" style={{ width: 34, textAlign: 'center' }}>
      <input
        ref={ref}
        type="checkbox"
        aria-label={label}
        checked={!!S.checked}
        onChange={S.toggleAll}
        style={{ cursor: 'pointer' }}
      />
    </th>
  );
}

export function SelectTd({ S, row, label = '행 선택' }) {
  const id = S.getId(row);
  return (
    <td className="noprint" style={{ textAlign: 'center' }}>
      <input
        type="checkbox"
        aria-label={label}
        checked={S.isSelected(id)}
        onChange={() => S.toggle(id)}
        style={{ cursor: 'pointer' }}
      />
    </td>
  );
}

// 선택이 없으면 아무것도 렌더하지 않는다 → 체크박스를 안 쓰는 사용자의 화면은 이전과 동일.
export function SelectionNote({ S }) {
  if (!S || !S.active) return null;
  return (
    <div
      className="muted noprint"
      role="status"
      aria-live="polite"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        fontSize: 12, margin: '8px 0 0', wordBreak: 'break-word',
      }}
    >
      <span><b>{S.count}건 선택됨</b> · 내보내기(CSV·Excel·PDF)는 <b>선택한 행만</b> 담습니다.</span>
      <button type="button" className="btn sm" onClick={S.clear}>선택 해제</button>
    </div>
  );
}

export default SelectionNote;
