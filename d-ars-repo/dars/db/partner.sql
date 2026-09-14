-- db/partner.sql — 파트너(채널) · 고객사(계약 주체) · 매출 귀속 근거 (COMMERCIAL_READINESS "파트너 채널")
-- [승인 필요: 스키마 변경] 운영 DB 적용은 수동으로만 한다(주간 컨펌 규칙). db-setup 은 이 파일을 적용하지 않는다.
--   psql "$DATABASE_URL" -f db/partner.sql   (멱등 — 재실행 안전)
-- 설계 원칙
--   · 계약·서비스 주체는 고원. 파트너는 영업·운영 대행 + 수익 배분. partner_id 가 NULL 이면 직접 계약.
--   · 향후 리셀러(파트너 명의 계약)로 바뀔 수 있으므로 organizations 는 파트너 하나에만 매달리는 구조로 두고
--     화이트라벨·2계층 권한은 지금 구현하지 않는다(확장 여지만 확보).
--   · 귀속 근거(partner_attributions)는 **추가만 하는 이력**이다. 정산 분쟁 시 "언제 누가 무엇을 근거로
--     귀속했는가"를 되짚어야 하므로 갱신·삭제하지 않고 새 행으로 정정한다.
--   · 사람 개인정보(전화·이메·주소)는 어느 표에도 두지 않는다. 담당자는 운영자 **표시명**만 남긴다.
--   · 수수료율은 이 표에 두지 않는다(정산 항목에서 설정값으로 분리 예정 · 하드코딩 금지).

create table if not exists partners (
  id          text primary key,                     -- 예: P-001
  name        text not null,                        -- 파트너 법인명(회사명 · 사람 이름 아님)
  status      text not null default '활성',          -- 활성 | 중지
  created_at  timestamptz not null default now()
);

create table if not exists organizations (
  id            text primary key,                   -- 예: ORG-001
  name          text not null,                      -- 고객사명(법인명 · 사람 이름 아님)
  partner_id    text references partners(id),       -- NULL = 직접 계약(고원 직판)
  acquired_via  text not null default 'direct',     -- direct | partner  (partner_id 와 정합 · lib/partner.js)
  contracted_at date,                               -- 계약일(귀속 기준일)
  status        text not null default '활성',        -- 활성 | 해지
  created_at    timestamptz not null default now(),
  check (acquired_via in ('direct', 'partner')),
  check ((acquired_via = 'partner') = (partner_id is not null))
);

-- 매출 귀속 근거(추가 전용 이력). 한 고객사에 여러 행이 있으면 **최신 행이 유효**하다.
create table if not exists partner_attributions (
  id             bigserial primary key,
  org_id         text not null references organizations(id),
  partner_id     text references partners(id),      -- NULL = 직접 계약으로 귀속(정정 시 포함)
  channel        text not null,                     -- direct | partner
  contracted_at  date,                              -- 귀속 기준 계약일
  attributed_by  text not null default '',          -- 운영자 표시명(계정 원문·연락처 저장 금지)
  reason         text not null default '',          -- 귀속 근거(계약서 번호·소개 경로 등 자유 서술 · 개인정보 기재 금지)
  created_at     timestamptz not null default now(),
  check (channel in ('direct', 'partner')),
  check ((channel = 'partner') = (partner_id is not null))
);

create index if not exists idx_org_partner on organizations(partner_id);
create index if not exists idx_attr_org on partner_attributions(org_id, created_at desc);
create index if not exists idx_attr_partner on partner_attributions(partner_id);
