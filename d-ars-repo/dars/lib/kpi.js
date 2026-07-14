// lib/kpi.js — 대시보드·통계 KPI 파생값 공통 유틸 (React·DB 비의존 순수 함수 → 단위 테스트 가능)
//
// 배경: 대시보드(/dashboard)·통계(/stats)의 KPI 숫자가 **하드코딩 상수**("4,182"·"540"·"902"·"318"·"1,220")였고,
//       증감률(delta)도 고정 문자열이라 실제 데이터와 무관했다. 또 완료율·진행 세션 수는 화면에 로드된 행으로만
//       계산돼 페이징·상한(20건)에 걸리면 왜곡됐다.
//       → 서버 집계(`/api/sessions?agg=1`·`/api/multimodal?agg=1`·`/api/ums?meta=1`)와 일별 통계(`/api/stats`)에서
//         KPI를 파생시킨다. 여기 함수들은 그 파생 로직만 담당(순수 함수).
// 개인정보(전화번호)·인증·과금 로직과 무관(읽기 전용 집계값 가공).

// (테스트 러너에서 그대로 import 하므로 alias 대신 상대경로 사용 — notify.js 와 동일 규칙)
import { aggCount } from './aggregate.js';
import { stepCount } from './sessionsAgg.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// 일별 통계 배열의 특정 컬럼 합계(널·문자열 안전).
export function sumBy(rows, key) {
  const list = Array.isArray(rows) ? rows : [];
  let s = 0;
  for (const r of list) s += num(r && r[key]);
  return s;
}

// 천단위 콤마 표기(Counter가 콤마 유무로 포맷을 판단하므로 문자열로 만들어 넘긴다).
export function fmtNum(n) {
  return num(n).toLocaleString('ko-KR');
}

// 마지막 날 vs 직전 날 증감률. 표본이 2개 미만이거나 직전값이 0이면 표시하지 않는다(null).
// 반환: { text: '6.2%', dir: 'up'|'down' } | null
export function lastDelta(rows, key) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length < 2) return null;
  const cur = num(list[list.length - 1] && list[list.length - 1][key]);
  const prev = num(list[list.length - 2] && list[list.length - 2][key]);
  if (!prev) return null;
  const diff = ((cur - prev) / prev) * 100;
  const r = Math.round(Math.abs(diff) * 10) / 10;
  if (r === 0) return null; // 변화 없음 → 배지 숨김(가짜 증감 표시 방지)
  return { text: `${r}%`, dir: diff >= 0 ? 'up' : 'down' };
}

// 진행 중 세션 수(서버 집계 기준). 세션 API는 status='진행'만 반환하지만,
// 스냅샷에 완료(step 4)가 섞여 오더라도 과다 집계되지 않도록 방어적으로 제외한다.
export function activeSessions(agg) {
  const total = num(agg && agg.total);
  return Math.max(0, total - stepCount(agg, 4));
}

// 멀티모달 이력 집계 → 사용 완료율(%). 표본 0이면 0.
export function completionRate(agg) {
  const total = num(agg && agg.total);
  if (!total) return 0;
  return Math.round((aggCount(agg, '완료') / total) * 100);
}

// 멀티모달 이력 집계 → 이탈률(%).
export function dropRate(agg) {
  const total = num(agg && agg.total);
  if (!total) return 0;
  return Math.round((aggCount(agg, '이탈') / total) * 100);
}
