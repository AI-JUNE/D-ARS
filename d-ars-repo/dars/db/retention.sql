-- D-ARS 개인정보 보관/파기 참조 SQL (Neon Postgres)
-- ※ 이 파일은 참조용이다. 파기(비가역)는 자동 실행하지 않는다.
--    운영자가 검토 후 scripts/retention-purge.mjs --commit 또는 직접 실행한다. [사람 승인 필요]
--
-- 정책 요약: 개인정보(전화번호)는 보관기간(RETENTION_DAYS, 기본 180일) 경과 시
--   행을 삭제하지 않고 식별 컬럼(phone·call_id)만 NULL 로 익명화한다 → 집계 통계는 보존, 식별정보만 제거.
--   대상 목록의 단일 출처는 lib/retention.js PII_TABLES 다(문서: docs/RETENTION_POLICY.md).

-- (1) 파기 대상 미리보기(DRY-RUN): 경과분 중 전화번호가 남아있는 행 수
--     :cutoff 는 애플리케이션에서 (now - RETENTION_DAYS) ISO 시각으로 바인딩.
select 'visual_sessions.phone' as tbl, count(*)::int as n
  from visual_sessions where started_at < :cutoff and phone is not null
union all
select 'visual_sessions.call_id' as tbl, count(*)::int as n
  from visual_sessions where started_at < :cutoff and call_id is not null
union all
select 'ums_log.phone' as tbl, count(*)::int as n
  from ums_log where sent_at < :cutoff and phone is not null;

-- (2) 실제 파기(익명화) — [사람 승인 필요] 실행 전 반드시 (1) 결과 확인
--     WHERE 절의 날짜 조건과 'phone is not null' 은 전량 삭제 사고를 막는 안전장치다. 제거 금지.
-- update visual_sessions set phone   = null where started_at < :cutoff and phone   is not null;
-- update visual_sessions set call_id = null where started_at < :cutoff and call_id is not null;
-- update ums_log        set phone   = null where sent_at    < :cutoff and phone   is not null;

-- (3) (선택) 파기 감사로그 테이블 — 언제 몇 건을 익명화했는지 남기려면 아래를 사용.
-- create table if not exists retention_audit (
--   id        bigserial primary key,
--   ran_at    timestamptz not null default now(),
--   tbl       text not null,
--   cutoff    timestamptz not null,
--   affected  int not null default 0,
--   mode      text not null default 'commit'   -- dryrun | commit
-- );
