'use client';
// lib/useQueryString.js — 현재 주소의 **쿼리 문자열**(선행 '?' 없음)을 구독하는 훅
//
// URL 상태 훅들(useRangeParam·useUrlState·useSortState)은 `history.replaceState` 로 주소만 바꾸므로
// 브라우저 이벤트가 발생하지 않는다 → popstate(뒤로/앞으로)에 더해 **가벼운 폴링**으로 변화를 감지한다
// (문자열 비교 1회 · 값이 같으면 리렌더 없음).
//
// useSyncExternalStore 를 쓰는 이유: SSR 스냅샷('')을 분리해 **하이드레이션 불일치가 원천적으로 없고**,
// 렌더 중 location 을 직접 읽는 비순수 코드나 의존성 없는 useEffect(무한 갱신 위험)를 둘 다 피할 수 있다.
//
// (19회차에 SavedViews 안에 인라인으로 있던 코드를 ClearFilters 와 공유하기 위해 분리 — 동작 동일.)

import { useSyncExternalStore } from 'react';

export const URL_POLL_MS = 400;

const subscribeUrl = (onChange) => {
  window.addEventListener('popstate', onChange);
  const t = setInterval(onChange, URL_POLL_MS);
  return () => { window.removeEventListener('popstate', onChange); clearInterval(t); };
};
const getUrlSnapshot = () => window.location.search.replace(/^\?/, '');
const getUrlServerSnapshot = () => '';

export default function useQueryString() {
  return useSyncExternalStore(subscribeUrl, getUrlSnapshot, getUrlServerSnapshot);
}
