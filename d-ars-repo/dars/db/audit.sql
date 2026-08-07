-- db/audit.sql — 감사 이벤트 테이블 (P0-7 · 117회차)
-- [승인 필요: 스키마 변경] 운영 DB 적용은 수동으로만 한다(주간 컨펌 규칙).
--   psql "$DATABASE_URL" -f db/audit.sql   (멱등 — 재실행 안전)
-- 기록 주체: lib/audit.js (AUDIT_DB=1 일 때만 insert · 계정/IP 는 마스킹된 값만 저장)

create table if not exists audit_events (
  id     bigserial primary key,
  ts     timestamptz not null default now(),
  event  text not null,              -- AUDIT_EVENTS 화이트리스트 (lib/audit.js)
  actor  text not null default '',   -- 마스킹된 계정 식별자 (원문 저장 금지)
  role   text not null default '',
  ip     text not null default '',   -- 마스킹된 IP (원문 저장 금지)
  detail jsonb not null default '{}'::jsonb
);

create index if not exists idx_audit_ts on audit_events(ts desc);
create index if not exists idx_audit_event on audit_events(event);
