// lib/listSorts.js — 목록 API 서버 사이드 정렬 **화이트리스트 스펙**(순수 상수 · React/DB 비의존)
//
// 배경: 정렬 서버 전환의 보안 핵심은 "사용자는 **키 이름만** 보낼 수 있고, SQL 조각은 서버가 선언한 상수"라는 점이다.
//       docs·ums 는 스펙이 라우트 안에 있어 단위 테스트가 불가능했다 → 신규 전환분(history·sessions)은
//       스펙을 여기로 분리해 **화이트리스트 자체를 회귀 테스트**한다(키 누락·위험 문자·파생값 의미 검증).
// 사용: 라우트가 parseSortParams(url, SPEC) / orderBySql(sort, SPEC) / sortRowsBy(rows, sort, SPEC) 에 그대로 넘긴다.
// 개인정보 정책: 전화번호는 **표시·정렬 대상**이지만 **서버 검색 대상은 아니다**(기존 API 정책 유지).

// 멀티모달 이력(/api/multimodal · /history 표 헤더와 1:1)
export const MM_SORTS = {
  id: { sql: 'id' },
  ts: { sql: 'ts', val: (r) => new Date(r?.ts).getTime() },
  phone: { sql: 'phone' },
  scenario: { sql: 'scenario' },
  channel: { sql: 'channel' },
  result: { sql: 'result' },
  duration: { sql: 'duration' },
};

// 실시간 세션(/api/sessions · /sessions 표 헤더와 1:1)
// status 는 화면 표기가 step 기반(step>=4 → '완료')이라 정렬 기준도 step 으로 맞춘다.
export const SESSION_SORTS = {
  id: { sql: 'id' },
  phone: { sql: 'phone' },
  scenario: { sql: 'scenario' },
  step: { sql: 'step' },
  elapsed: { sql: 'elapsed' },
  status: { sql: 'step', val: (r) => r?.step },
};

// 필요서류(/api/docs · /docs 표 헤더와 1:1) — 기존엔 라우트 안에 있던 스펙을 통합(중복 제거·테스트 가능).
// rate(완료율)는 파생값이라 DB 는 case 식, 데모는 동일 의미의 계산식으로 정렬한다.
export const DOC_SORTS = {
  id: { sql: 'id' },
  biz: { sql: 'biz' },
  name: { sql: 'name' },
  req: { sql: 'req' },
  sent: { sql: 'sent' },
  done: { sql: 'done' },
  rate: {
    sql: '(case when coalesce(req,0)=0 then 0 else done::numeric/req end)',
    val: (r) => (r?.req ? (r.done || 0) / r.req : 0),
  },
};

// UMS 발송 이력(/api/ums · /ums 표 헤더와 1:1)
// phone 은 화면 표시 컬럼이라 **정렬 대상**에는 포함하되 **서버 검색 대상에는 넣지 않는다**(PII 정책 유지).
export const UMS_SORTS = {
  sent_at: { sql: 'sent_at', val: (r) => new Date(r?.sent_at).getTime() },
  phone: { sql: 'phone' },
  service: { sql: 'service' },
  doc: { sql: 'doc' },
  status: { sql: 'status' },
};

// 시나리오(/api/scenarios · /scenarios 목록·보드) — 2026-07-13 야간 신규 서버 검색·페이징 전환분.
// nodes(노드 수)는 파생값: DB 는 jsonb_array_length, 데모는 배열 길이.
export const SCENARIO_SORTS = {
  id: { sql: 'id' },
  name: { sql: 'name' },
  type: { sql: 'type' },
  status: { sql: 'status' },
  version: { sql: 'version' },
  updated_at: { sql: 'updated_at', val: (r) => new Date(r?.updated_at).getTime() },
  nodes: { sql: 'jsonb_array_length(nodes)', val: (r) => (Array.isArray(r?.nodes) ? r.nodes.length : 0) },
};

// 서버 사이드 검색 대상 필드(데모 폴백 경로에서 filterRows 가 사용 · DB 경로의 ILIKE 대상과 동일 의미).
// 전화번호(PII)는 어떤 목록에서도 검색 대상이 아니다.
export const DOC_SEARCH_FIELDS = ['id', 'biz', 'name'];
export const UMS_SEARCH_FIELDS = ['service', 'doc', 'status'];
export const SCENARIO_SEARCH_FIELDS = ['id', 'name', 'type', 'status', 'updated_by'];
