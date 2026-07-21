-- D-ARS (보이는 ARS) schema · Neon Postgres
create table if not exists scenarios (
  id          text primary key,
  name        text not null,
  type        text not null default '인바운드',   -- 인바운드 | 아웃바운드
  status      text not null default '미운영',      -- 운영 | 미운영
  version     int  not null default 1,
  nodes       jsonb not null default '[]'::jsonb,   -- [{id,type,label}]
  updated_by  text,
  updated_at  timestamptz not null default now()
);

create table if not exists docs (
  id       text primary key,
  biz      text not null,
  name     text not null,
  req      int not null default 0,
  sent     int not null default 0,
  done     int not null default 0,
  in_use   boolean not null default true
);

create table if not exists visual_sessions (
  id         text primary key,
  call_id    text,
  phone      text,
  scenario   text,
  step       int not null default 0,     -- 0 런칭 ~ 4 완료
  node       text,
  gen        text,               -- 세대 톤(senior|youth|family)
  elapsed    int not null default 0,
  status     text not null default '진행',
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);

create table if not exists ums_log (
  id       bigserial primary key,
  sent_at  timestamptz not null default now(),
  phone    text,
  service  text,
  doc      text,
  status   text not null default '대기'     -- 발송완료 | 대기 | 실패
);

create table if not exists daily_stats (
  day        date primary key,
  inbound    int default 0,
  multimodal int default 0,
  completed  int default 0,
  dropped    int default 0
);

alter table visual_sessions add column if not exists gen text;
create index if not exists idx_sessions_status on visual_sessions(status);
create index if not exists idx_ums_status on ums_log(status);
