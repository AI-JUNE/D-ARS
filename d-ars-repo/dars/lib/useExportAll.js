'use client';
// lib/useExportAll.js — 내보내기 공통 훅: 현재 검색·필터 조건의 **서버 전체 행**을 모아 콜백에 넘긴다.
//
// 사용 예)
//   const X = useExportAll('/api/docs', { q: L.dq });
//   const exportCsv = () => X.run((rows) => downloadCSV('docs.csv', sortRows(rows, sort, val), cols));
//   <button className="btn sm" disabled={X.busy} onClick={exportCsv}>⬇ CSV</button>
//   <ErrorBanner message={X.error} onRetry={...} />
//
// - 수집 실패는 throw 하지 않고 error 문자열(기존 ErrorBanner 재사용).
// - 일시적 5xx·네트워크 단절 자동 재시도는 getJSON 이 담당(기존 동작 유지).
// - 중복 클릭은 busy 로 무시(같은 파일 2번 내려받기 방지).

import { useCallback, useRef, useState } from 'react';
import { getJSON } from '@/lib/fetchJson';
import { fetchAllRows, EXPORT_MAX_ROWS } from '@/lib/exportAll';

export function useExportAll(base, { q = '', params = {}, maxRows = EXPORT_MAX_ROWS } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const busyRef = useRef(false);

  const key = JSON.stringify(params || {}); // 필터 객체 아이덴티티와 무관하게 비교

  const run = useCallback(async (handler) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(null); setTruncated(false);

    const res = await fetchAllRows(base, {
      q, params: JSON.parse(key), maxRows, get: getJSON,
    });

    busyRef.current = false;
    setBusy(false);

    if (res.error) { setError(res.error); return; }
    setTruncated(res.truncated);
    if (typeof handler === 'function') handler(res.rows, res);
  }, [base, q, key, maxRows]);

  const clear = useCallback(() => setError(null), []);

  return { busy, error, truncated, run, clear, maxRows };
}

export default useExportAll;
