// lib/auditView.js — 감사 열람 화면(P0-7 · /admin/audit) 조회 파라미터·행 정형화 (순수 모듈)
//
// 배경: 감사 이벤트는 lib/audit.js 가 기록한다(기본 콘솔, AUDIT_DB=1 시 audit_events 영속화).
//   열람 API(/api/admin/audit)가 쓰는 파라미터 검증·페이지 구성 규칙을 순수 함수로 분리해
//   단위 테스트 대상으로 만든다(PMS /admin/security 와 동일 계약: 커서 페이징·마스킹 유지).
// 개인정보: 기록 시점에 이미 마스킹된 값만 저장되므로 이 모듈은 추가 PII 를 만들지도 풀지도 않는다.

import { AUDIT_EVENTS } from './audit.js';

export const AUDIT_VIEW_DEFAULT = 50;   // 1페이지 기본 행수
export const AUDIT_VIEW_MAX = 200;      // 상한(로그 폭주 방어 — PMS 와 동일 200건)

function toPosInt(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

// 조회 파라미터 파싱(방어적 — 어떤 입력에도 throw 하지 않는다):
//   event : AUDIT_EVENTS 화이트리스트 외 값은 무시(null = 전체)
//   before: 커서(이 id 미만을 조회) — 양의 정수만 인정
//   limit : 1..AUDIT_VIEW_MAX 클램프(기본 AUDIT_VIEW_DEFAULT)
export function parseAuditQuery(url) {
  let sp;
  try {
    sp = (url instanceof URL ? url : new URL(String(url), 'http://local')).searchParams;
  } catch {
    sp = new URLSearchParams();
  }
  const rawEvent = (sp.get('event') || '').trim();
  const event = AUDIT_EVENTS.includes(rawEvent) ? rawEvent : null;
  const before = toPosInt(sp.get('before'));
  const rawLimit = toPosInt(sp.get('limit'));
  const limit = rawLimit == null ? AUDIT_VIEW_DEFAULT : Math.min(rawLimit, AUDIT_VIEW_MAX);
  return { event, before, limit };
}

// DB 행 → 화면 행 정형화(방어적): 타입 강제·detail 평면 객체 보장.
// jsonb 가 문자열로 올 수도, 객체로 올 수도 있어(드라이버·경로별 차이) 둘 다 흡수한다.
export function shapeAuditRow(r) {
  if (!r || typeof r !== 'object') return null;
  const id = toPosInt(r.id);
  if (id == null) return null;
  let detail = r.detail;
  if (typeof detail === 'string') {
    try { detail = JSON.parse(detail); } catch { detail = {}; }
  }
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) detail = {};
  return {
    id,
    ts: typeof r.ts === 'string' ? r.ts : (r.ts instanceof Date ? r.ts.toISOString() : ''),
    event: typeof r.event === 'string' ? r.event : '',
    actor: typeof r.actor === 'string' ? r.actor : '',
    role: typeof r.role === 'string' ? r.role : '',
    ip: typeof r.ip === 'string' ? r.ip : '',
    detail,
  };
}

// limit+1 행 조회 결과 → 페이지 응답 구성: { events, nextBefore, hasMore }
//   rows 는 id 내림차순 가정. limit 초과분(+1 행)은 hasMore 판정에만 쓰고 버린다.
export function auditPage(rows, limit) {
  const list = Array.isArray(rows) ? rows : [];
  const shaped = list.map(shapeAuditRow).filter(Boolean);
  const hasMore = shaped.length > limit;
  const events = hasMore ? shaped.slice(0, limit) : shaped;
  const nextBefore = hasMore && events.length ? events[events.length - 1].id : null;
  return { events, nextBefore, hasMore };
}
