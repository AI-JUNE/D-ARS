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
// 세션 단계 인덱스 → 라벨. 유효 인덱스(0~4)는 journey 와 100% 동일하고, 범위 밖·undefined·비정수는
// 방어적으로 '—'(em-dash)를 반환한다. 배경: /sessions·/report 가 `journey[s.step]` 로 직접 인덱싱해
// 스냅샷의 step 이 누락·범위 밖이면 리포트·CSV 에 'undefined'/빈칸이 새어 나왔다. 여기서 한 번에 방어한다.
// (순수 함수 · 인증/개인정보/스키마 무관 · 유효 입력은 출력 불변 → 하위호환.)
export function stepLabel(step){
  if(step===null||step===undefined||step==='') return '—'; // Number(null)===0 등 강제변환 함정 차단
  const i=Math.trunc(Number(step));
  return (Number.isInteger(i)&&i>=0&&i<journey.length) ? journey[i] : '—';
}
export const pct=(a,b)=>b?Math.round(a/b*100):0;
// 초 → 경과/소요 시간 문자열. 1시간 미만은 mm:ss(하위호환 100%), 1시간 이상은 h:mm:ss.
// 실시간 세션 보드(s.elapsed)에서 60분 넘는 장기 세션이 "125:30"처럼 분/초를 혼동시키던 표기를 해소.
// 음수·NaN·비유한(Infinity) 등 잘못된 입력은 방어적으로 "00:00"으로 처리(깨진 값이 화면에 새는 것 방지).
export function fmt(s){
  const t=Math.floor(Number(s));
  if(!Number.isFinite(t)||t<=0) return '00:00';
  const ss=String(t%60).padStart(2,'0');
  const mm=String(Math.floor(t/60)%60).padStart(2,'0');
  const hr=Math.floor(t/3600);
  return hr>0 ? hr+':'+mm+':'+ss : mm+':'+ss;
}
// 초 → 한국어 소요시간 문장("2시간 5분 30초" / "3분 20초"). 알림 등 문장 안에서 자연스럽게 읽히도록 fmt()와 별도.
// 1시간 미만은 "N분 N초"(기존 알림 표기와 100% 동일 — 하위호환), 1시간 이상은 앞에 "N시간 "을 붙여 장기 세션을 명확히.
// (알림 규칙 #3 장기 세션 경과가 "125분 30초"처럼 혼동되던 것을 "2시간 5분 30초"로 해소.)
// 음수·NaN·비유한(Infinity) 등 잘못된 입력은 방어적으로 "0초"로 처리.
export function fmtDur(s){
  const t=Math.floor(Number(s));
  if(!Number.isFinite(t)||t<=0) return '0초';
  const sec=t%60, m=Math.floor(t/60)%60, h=Math.floor(t/3600);
  return h>0 ? `${h}시간 ${m}분 ${sec}초` : `${m}분 ${sec}초`;
}
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
