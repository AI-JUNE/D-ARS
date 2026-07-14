export const NODE_TYPES = {
  VISUAL_LAUNCH:{ic:'🚀',c:'#be5535',name:'보이는 ARS 런칭'},
  SHOW_MENU:{ic:'🧭',c:'#3b6ea5',name:'메뉴 표출'},
  SHOW_CARD:{ic:'🗂️',c:'#2e8b57',name:'정보 카드'},
  REQUEST_DOC:{ic:'📋',c:'#c9902a',name:'필요서류 안내'},
  RAG_ANSWER:{ic:'📚',c:'#7d5ba6',name:'RAG 응답'},
  CHANNEL_SWITCH:{ic:'🔀',c:'#c0392b',name:'채널 전환'},
  END:{ic:'🏁',c:'#555',name:'종료'},
};
export const journey=['런칭','본인확인','상담','안내·발송','완료'];
export const pct=(a,b)=>b?Math.round(a/b*100):0;
export const fmt=(s)=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
export function tagClass(s){const m={'운영':'t-ok','미운영':'t-mut','발송완료':'t-ok','대기':'t-warn','실패':'t-bad','진행':'t-info','완료':'t-ok'};return m[s]||'t-mut';}

// 표 컬럼 정렬 공통 비교자(prism-pms 반영 · 한글·숫자 자연 정렬).
// 두 값이 모두 숫자면 수치 비교, 아니면 문자열 자연 정렬(localeCompare 'ko', numeric:true).
// null/undefined 안전. docs·sessions·ums 3개 화면에서 중복되던 로직을 단일화.
export function compareVals(av, bv) {
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  return String(av ?? '').localeCompare(String(bv ?? ''), 'ko', { numeric: true });
}

// 표 헤더 정렬 토글(오름 → 내림 → 해제). docs·ums·sessions 3개 화면에 인라인 중복되던 로직 단일화.
// 순수 함수라 단위 테스트 가능하며, 키보드·마우스 어느 경로로 눌러도 동일한 상태 전이를 보장한다.
export function nextSort(sort, key) {
  if (!key) return sort ?? null;
  if (!sort || sort.key !== key) return { key, dir: 'asc' };
  return sort.dir === 'asc' ? { key, dir: 'desc' } : null;
}

// 현재 정렬 상태의 시각 표시(▲/▼) — 미정렬 컬럼은 빈 문자열.
export function sortArrow(sort, key) {
  if (!sort || sort.key !== key) return '';
  return sort.dir === 'asc' ? ' ▲' : ' ▼';
}

// 스크린리더용 aria-sort 값(WAI-ARIA columnheader). 미정렬은 'none'.
export function ariaSort(sort, key) {
  if (!sort || sort.key !== key) return 'none';
  return sort.dir === 'asc' ? 'ascending' : 'descending';
}

// sort={key,dir} 규격으로 행 배열을 정렬(원본 불변·안정 정렬).
// val(row,key)로 정렬 키를 추출(미지정 시 row[key]). sort 없거나 key 없으면 원본 반환.
export function sortRows(rows, sort, val) {
  if (!sort || !sort.key) return rows;
  const get = typeof val === 'function' ? val : (r, k) => r[k];
  const dir = sort.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => dir * compareVals(get(a, sort.key), get(b, sort.key)));
}
