// lib/sessionsAgg.js — 실시간 세션 보드 서버 집계 유틸 (React·DB 비의존 순수 함수 → 단위 테스트 가능)
//
// 배경: 세션 화면 KPI(진행 세션·평균 경과·안내/발송 단계·상담원 전환 대기)가 "화면에 로드된 행"으로
//       계산돼, 서버 페이징("더 보기")으로 전환하면 첫 페이지(50건)만 반영돼 수치가 왜곡된다.
//       → 서버가 현재 조건(검색어) **전체**에 대해 집계한 값을 내려주고, 화면은 그것을 그대로 쓴다.
// 개인정보(전화번호)·인증·과금 로직과 무관(읽기 전용 집계, 비PII 필드만 사용).

// 표준 형태: { total, byStep:{[step]:건수}, byNode:{[노드]:건수}, avgElapsed }
export function emptySessionAgg() {
  return { total: 0, byStep: {}, byNode: {}, avgElapsed: 0 };
}

function finish(total, byStep, byNode, elapsedSum) {
  return { total, byStep, byNode, avgElapsed: total ? Math.round(elapsedSum / total) : 0 };
}

// 메모리 배열(데모 폴백) 집계.
export function sessionAggRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const byStep = {};
  const byNode = {};
  let sum = 0;
  for (const r of list) {
    const st = Number(r?.step);
    const key = Number.isFinite(st) ? String(st) : '0';
    byStep[key] = (byStep[key] || 0) + 1;
    const nd = r?.node ?? '기타';
    byNode[nd] = (byNode[nd] || 0) + 1;
    const e = Number(r?.elapsed);
    if (Number.isFinite(e)) sum += e;
  }
  return finish(list.length, byStep, byNode, sum);
}

// DB group-by 결과 집계: [{ step, node, n, el }] → 표준 형태.
export function foldSessionGroups(groups) {
  const g = Array.isArray(groups) ? groups : [];
  const byStep = {};
  const byNode = {};
  let sum = 0;
  let total = 0;
  for (const row of g) {
    const n = Number(row?.n) || 0;
    sum += Number(row?.el) || 0;
    total += n;
    const st = Number(row?.step);
    const key = Number.isFinite(st) ? String(st) : '0';
    byStep[key] = (byStep[key] || 0) + n;
    const nd = row?.node ?? '기타';
    byNode[nd] = (byNode[nd] || 0) + n;
  }
  return finish(total, byStep, byNode, sum);
}

// 클라이언트 응답 정규화 — 형식이 어긋나도 화면이 깨지지 않게 기본값으로 수렴.
export function readSessionAgg(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return emptySessionAgg();
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    total: num(data.total),
    byStep: obj(data.byStep),
    byNode: obj(data.byNode),
    avgElapsed: num(data.avgElapsed),
  };
}

// 특정 단계(step) 건수. 숫자·문자열 키 모두 허용.
export function stepCount(agg, step) {
  const m = agg && agg.byStep ? agg.byStep : {};
  return Number(m[String(step)]) || 0;
}

// 특정 노드 건수(예: 'CHANNEL_SWITCH' = 상담원 전환 대기).
export function nodeCount(agg, node) {
  const m = agg && agg.byNode ? agg.byNode : {};
  return Number(m[node]) || 0;
}
