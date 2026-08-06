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
// 값(Date · ISO 문자열 · 'YYYY-MM-DD' 등) → 표시용 날짜 키(YYYY-MM-DD). 형식이 어긋나거나
// null/undefined/Invalid Date 면 방어적으로 '—'(em-dash)를 반환한다. 배경: /report 일별표·/scenarios
// 수정일 셀이 `String(x).slice(0,10)` 로 인라인 처리해, (1) null/undefined 가 'null'/'undefined' 로
// 새어 나오고 (2) Date 객체가 들어오면 "Thu Jul 23"(toString 앞 10자)로 잘못 표기될 수 있었다.
// 유효한 'YYYY-MM-DD…' 문자열은 앞 10자 그대로 → 기존 출력 100% 불변(하위호환).
const DAY_RE=/^\d{4}-\d{2}-\d{2}$/;
export function fmtDay(v){
  if(v===null||v===undefined) return '—';
  if(v instanceof Date) return Number.isNaN(v.getTime()) ? '—' : v.toISOString().slice(0,10);
  const s=String(v).slice(0,10);
  return DAY_RE.test(s) ? s : '—';
}
// 값(YYYY-MM-DD 날짜 키 등) → 차트 X축용 월-일(MM-DD). fmtDay 로 유효성 검증 후 앞 5자를 잘라내
// 유효한 'YYYY-MM-DD…' 은 'MM-DD' 로 100% 하위호환, null/undefined/Invalid 은 '—'(em-dash) 로 방어.
// 배경: /dashboard·/stats·charts 가 `String(d.day).slice(5)` 로 인라인 처리해, day 가 undefined 면
// "undefined".slice(5)='ined', null 이면 "null".slice(5)='' 가 차트 라벨·툴팁에 새어 나올 수 있었다.
export function fmtMD(v){
  const d=fmtDay(v);
  return d==='—' ? '—' : d.slice(5);
}
// 값(Date · ISO 문자열 · 타임스탬프) → 표시용 로컬 시각(HH:MM). null/undefined/Invalid Date 면 '—'(em-dash).
// 배경: /history 는 `String(new Date(r.ts).getHours()).padStart(2,'0')` 로, /ums 내보내기는
// `new Date(t).toTimeString().slice(0,5)` 로 시각을 인라인 처리해, ts/sent_at 이 null·형식오류면
// (1) /history 표에 "NaN:NaN" 이, (2) /ums CSV·Excel 「시각」 칸에 "Inval…"(Invalid Date 앞 5자)이
// 새어 나왔다. 로컬 시간(getHours/getMinutes)은 두 기존 표기와 동일 → 유효 입력 출력 100% 불변(하위호환).
export function fmtTime(v){
  if(v===null||v===undefined||v==='') return '—';
  const d=v instanceof Date ? v : new Date(v);
  if(Number.isNaN(d.getTime())) return '—';
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
// 비율(%) = round(a/b*100). 분모 0/음수·비유한 입력은 0으로 방어(화면에 "NaN%"/음수% 누출 차단).
// 유효한 유한 a·양수 b는 기존과 100% 동일 출력(하위호환) — 예: pct(1,2)=50, pct(2,3)=67, pct(5,0)=0.
// 기존엔 pct(undefined,total)이 Math.round(NaN)=NaN → "NaN%"가 새어나올 수 있었다(fmt/fmtDur/fmtNum과 동일 방어 패턴으로 통일).
export const pct=(a,b)=>{const x=Number(a),y=Number(b);return Number.isFinite(x)&&Number.isFinite(y)&&y>0?Math.round(x/y*100):0;};
// 진행바·도넛 스크린리더 라벨(순수 함수) — aria-label 텍스트만 생성하며 화면 표시값에는 영향 없음.
// 시각적 차트(Donut·ProgressRow)만 있던 데이터 시각화에 스크린리더용 대체 텍스트를 부여(a11y·상용/공공 납품 기준).
// 값·총계가 유효하면 "라벨 값/총계접미 (퍼센트%)", 총계가 없거나 비유한이면 "라벨 (퍼센트%)"만.
// pct 는 위 방어 헬퍼 재사용(비유한/0분모 → 0). label 은 문자열화 후 트림.
export function meterLabel(label, value, total, suffix = ''){
  const name = (label == null ? '' : String(label)).trim();
  const v = Number(value), t = Number(total);
  const hasCount = Number.isFinite(v) && Number.isFinite(t) && t > 0;
  const count = hasCount ? ` ${v}/${t}${suffix}` : '';
  const head = `${name}${count}`.trim();
  const p = pct(value, total);
  return head ? `${head} (${p}%)` : `${p}%`;
}
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
// 숫자 배열을 차트용 유한 숫자 배열로 정규화. null/undefined/NaN/Infinity/문자열 등 비유한 요소는 0으로 방어.
// 배경: AreaChart 가 data 를 그대로 Math.max/Math.min·Y(v) 에 써서, 배열에 비유한 값이 하나라도 섞이면
// max/min 이 NaN → Y(v)=NaN → SVG path 가 "…,NaN…" 로 **선·영역 전체가 조용히 깨졌다**(비표시).
// GroupedBars 는 이미 `Number(d[s.key])||0` 로 내부 방어하는데 AreaChart 만 누락 → 동일 패턴으로 통일.
// 유효한 유한 숫자는 Number(v)=항등 → 출력 100% 불변(하위호환). 배열이 아니면 빈 배열.
export function finiteNums(arr){
  return Array.isArray(arr) ? arr.map(v=>{const x=Number(v);return Number.isFinite(x)?x:0;}) : [];
}
// 차트 스크린리더 라벨용 내부 수치 포매터 — fmtNum(kpi.js)과 동일 규칙(ko-KR·비유한 0 방어)이되
// ui.js 를 무의존(import 0)으로 유지하려고 사설로 둔다(순환참조 없음). 로케일은 명시 → SSR 일관성.
function nfmt(x){ const v = Number(x); return (Number.isFinite(v) ? v : 0).toLocaleString('ko-KR'); }

// 추이(면적) 차트 스크린리더 라벨(순수 함수) — aria-label 텍스트만 생성, 화면 표시값 무영향.
// 배경: AreaChart 는 role="img" 만 있고 라벨이 정적("추이 그래프")이라 스크린리더가 실제 데이터를 읽지 못했다.
// Donut·ProgressRow(meterLabel)처럼 데이터를 요약(구간 수·최소·최대·최신)해 부여 → 차트 4종 시맨틱 통일.
// 비유한 값은 finiteNums 로 0 방어(막대·라인 렌더와 동일 규칙), 유효 포인트가 없으면 정적 라벨로 폴백(하위호환).
// unit 은 문자열화 후 각 수치 뒤에 붙인다(예: '건').
export function trendLabel(data, unit = ''){
  const D = finiteNums(data);
  if (!D.length) return '추이 그래프';
  const u = unit == null ? '' : String(unit);
  const min = Math.min(...D), max = Math.max(...D), latest = D[D.length - 1];
  return `추이 그래프, ${D.length}개 구간, 최소 ${nfmt(min)}${u}, 최대 ${nfmt(max)}${u}, 최신 ${nfmt(latest)}${u}`;
}

// 일별 그룹 막대 차트 스크린리더 라벨(순수 함수) — 계열별 전체 합계를 요약.
// data: [{day, key1, key2, ...}], series: [{key, label, color}]. 각 계열 합계를 "라벨 합계" 로 나열.
// 값은 Number()||0 방어(GroupedBars 막대 렌더와 동일 규칙). data/series 가 비면 정적 라벨로 폴백(하위호환).
export function barsLabel(data, series){
  const rows = Array.isArray(data) ? data : [];
  const ser = Array.isArray(series) ? series : [];
  if (!rows.length || !ser.length) return '일별 막대 그래프';
  const parts = ser.map(s => {
    const key = s && s.key;
    const name = (s && s.label != null ? String(s.label) : (key == null ? '' : String(key))).trim();
    const sum = rows.reduce((a, d) => a + (Number(d && d[key]) || 0), 0);
    return `${name} ${nfmt(sum)}`;
  });
  return `일별 막대 그래프, ${rows.length}일, ${parts.join(', ')}`;
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
