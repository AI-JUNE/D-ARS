'use client';
// lib/useList.js — 목록 화면 공통 훅: 서버 사이드 검색 + "더 보기" 페이징
//
// 사용 예)
//   const L = useList('/api/docs', { pageSize: 50, params: { status: filter } });
//   L.rows / L.total / L.hasMore / L.loading / L.loadingMore / L.error
//   L.q / L.setQ (디바운스 후 서버 검색) · L.loadMore() · L.reload()
//
// 특징
//  - 검색어·필터가 바뀌면 offset 0 으로 리셋 후 재조회(디바운스 300ms).
//  - "더 보기"는 다음 offset 페이지를 받아 **누적**(id 기준 중복 제거).
//  - 경쟁 조건 방지: 요청 시퀀스를 두고 늦게 도착한 옛 응답은 버린다.
//  - 실패는 throw 하지 않고 error 문자열 → 화면은 ErrorBanner + 다시 시도.
//  - 오프라인·일시적 5xx 자동 재시도는 fetchJson 이 담당(기존 동작 유지).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getJSON } from '@/lib/fetchJson';
import { PAGE_SIZE, SEARCH_DEBOUNCE, buildListUrl, readPage, mergePage } from '@/lib/listUrl';

// 검색어(q)는 기본적으로 훅 내부 state 지만, `q`·`setQ` 를 함께 넘기면 **제어 컴포넌트**처럼 동작한다
// (2026-07-14: 검색어를 URL 쿼리에 보존하기 위해 useUrlState 가 소유권을 갖는 경우 — 기존 호출부는 변경 없음).
export function useList(base, { pageSize = PAGE_SIZE, params = {}, debounce = SEARCH_DEBOUNCE, refreshMs = 0, q: qProp, setQ: setQProp } = {}) {
  const [qState, setQState] = useState('');
  const controlled = typeof qProp === 'string' && typeof setQProp === 'function';
  const q = controlled ? qProp : qState;
  const setQRef = useRef(setQProp);
  setQRef.current = setQProp;
  // 안정된 함수 아이덴티티를 유지한다(제어 모드에서 부모가 인라인 함수를 넘겨도 리렌더 폭증이 없다).
  const setQ = useCallback((v) => {
    if (controlled) setQRef.current?.(v); else setQState(v);
  }, [controlled]);
  const [dq, setDq] = useState('');          // 디바운스된 검색어(실제 서버 요청에 쓰임)
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const seq = useRef(0);
  const offsetRef = useRef(0);
  const key = JSON.stringify(params || {}); // 필터 변경 감지(객체 아이덴티티 무관)

  // 검색어 디바운스
  useEffect(() => {
    const t = setTimeout(() => setDq(q), debounce);
    return () => clearTimeout(t);
  }, [q, debounce]);

  const fetchPage = useCallback(async (offset, { more = false } = {}) => {
    const my = ++seq.current;
    if (more) setLoadingMore(true); else setLoading(true);
    const url = buildListUrl(base, { q: dq, limit: pageSize, offset, params: JSON.parse(key) });
    const { data, error: err } = await getJSON(url);
    if (my !== seq.current) return;           // 늦게 도착한 옛 응답 폐기
    if (err) {
      setError(err);
    } else {
      const page = readPage(data, { limit: pageSize, offset });
      setRows((prev) => mergePage(prev, page.rows, offset));
      setTotal(page.total);
      setHasMore(page.hasMore);
      offsetRef.current = offset + page.rows.length;
      setError(null);
    }
    if (more) setLoadingMore(false); else setLoading(false);
  }, [base, dq, key, pageSize]);

  // 검색어·필터 변경 → 첫 페이지부터 다시
  useEffect(() => { offsetRef.current = 0; fetchPage(0); }, [fetchPage]);

  // 선택적 자동 갱신(현재까지 로드한 만큼을 한 번에 다시 받아 목록 위치 유지)
  useEffect(() => {
    if (!refreshMs) return;
    const t = setInterval(() => {
      const size = Math.max(pageSize, offsetRef.current);
      const my = ++seq.current;
      getJSON(buildListUrl(base, { q: dq, limit: Math.min(size, 500), offset: 0, params: JSON.parse(key) })).then(({ data, error: err }) => {
        if (my !== seq.current) return;
        if (err) { setError(err); return; }
        const page = readPage(data, { limit: size, offset: 0 });
        setRows(page.rows);
        setTotal(page.total);
        setHasMore(page.hasMore);
        offsetRef.current = page.rows.length;
        setError(null);
      });
    }, refreshMs);
    return () => clearInterval(t);
  }, [base, dq, key, pageSize, refreshMs]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    fetchPage(offsetRef.current, { more: true });
  }, [fetchPage, hasMore, loading, loadingMore]);

  const reload = useCallback(() => { offsetRef.current = 0; fetchPage(0); }, [fetchPage]);

  // patch(updater): 로드된 행을 화면이 직접 갱신한다(SSE 실시간 스냅샷 반영 등).
  // 페이지 누적 상태(offset)는 건드리지 않으므로 "더 보기"로 로드한 과거 행이 사라지지 않는다.
  const patch = useCallback((updater) => {
    setRows((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return Array.isArray(next) ? next : prev;
    });
  }, []);

  // dq(디바운스된 검색어)를 노출한다 — 화면이 목록과 **같은 조건**으로 서버 집계(agg)를 요청할 때 쓴다.
  return useMemo(() => ({
    rows, total, hasMore, loading, loadingMore, error,
    q, setQ, dq, loadMore, reload, patch, searching: q !== dq,
  }), [rows, total, hasMore, loading, loadingMore, error, q, setQ, dq, loadMore, reload, patch]);
}

export default useList;
