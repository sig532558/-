-- =====================================================================
-- 혜성물류 운영 ERP — Supabase 스키마 (안성센터 프로그램과 같은 프로젝트에 설치)
-- 모든 ERP 테이블은 erp_ 로 시작 → 안성센터 기존 테이블과 충돌 없음
-- Supabase 대시보드 > SQL Editor 에 01 → 02 순서로 붙여넣고 실행
-- =====================================================================


-- ---------- 등급(권한) ----------
create table if not exists erp_roles (
  id          text primary key,
  name        text not null,
  level       int  not null default 10,          -- 숫자가 클수록 상위 등급
  scope       text not null default 'all',        -- all: 전체 팀 / own_team: 담당 팀만
  perms       jsonb not null default '{}'::jsonb, -- {"worklog":{"view":true,"create":true,"edit":true,"delete":false,"unlock":false,"assign":false}, ...}
  memo        text,
  updated_at  timestamptz default now()
);

-- ---------- 사용자 ----------
create table if not exists erp_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  login_id    text unique not null,
  name        text not null,
  dept        text,
  title       text,                               -- 직급(사원~센터장)
  phone       text,
  role_id     text references erp_roles(id) default 'pending',
  teams       text[] default '{}',                -- 담당 팀(현장팀장·실무진 범위)
  active      boolean default false,              -- 관리자 승인 전 false
  last_seen   timestamptz,
  created_at  timestamptz default now()
);

-- ---------- 기준 정보 ----------
create table if not exists erp_centers (
  id text primary key, name text not null, owners text[] default '{}', sort int default 0
);
create table if not exists erp_teams (
  name        text primary key,
  center_id   text references erp_centers(id) default 'gobaek',
  labor_cost  numeric not null default 160390,    -- 평균 인건비(1인/일)
  ot_rate     numeric not null default 0,         -- 연장근무 시급
  sort        int default 0,
  active      boolean default true
);
create table if not exists erp_task_prices (
  id bigint generated always as identity primary key,
  team text not null, grp text not null default '', task text not null,
  unit_price numeric not null default 0, sort int default 0, active boolean default true,
  unique (team, grp, task)
);
create table if not exists erp_brands (
  name text primary key, owner text, center_id text default 'gobaek', b2b boolean default true, b2c boolean default false, sort int default 0
);
create table if not exists erp_settings (
  key text primary key, value jsonb, updated_at timestamptz default now()
);

-- ---------- 관리자 업무일지 ----------
create table if not exists erp_worklog (
  id            bigint generated always as identity primary key,
  work_date     date not null,
  team          text not null,
  grp           text not null default '',
  task          text not null,
  unit_price    numeric not null default 0,
  qty           numeric not null default 0,
  to_count      numeric not null default 0,
  cost_override numeric,                           -- 별도인원 등 지출 직접 입력
  note          text,
  extra         jsonb,
  updated_by    uuid default auth.uid(),
  updated_at    timestamptz default now(),
  unique (work_date, team, grp, task)
);
create index if not exists erp_worklog_date on erp_worklog(work_date);

create table if not exists erp_worklog_day (
  work_date date not null, team text not null,
  ot_hours numeric default 0, ot_people numeric default 0,
  status text default '작성중',                    -- 작성중 / 제출
  note text, submitted_by uuid, submitted_at timestamptz,
  updated_at timestamptz default now(),
  primary key (work_date, team)
);
create table if not exists erp_headcount (
  work_date date not null, team text not null,
  field_count numeric default 0, office_count numeric default 0,
  updated_at timestamptz default now(),
  primary key (work_date, team)
);

-- ---------- 일일 마감보고 (구역별 유연 구조) ----------
create table if not exists erp_daily_records (
  id bigint generated always as identity primary key,
  rec_date date not null,
  section  text not null,   -- b2b, return, carryover, material, parcel, b2c, b2c_time, wms, short, offline, return_ledger
  rec_key  text not null,   -- 브랜드/화주사 등
  data     jsonb not null default '{}'::jsonb,
  updated_by uuid default auth.uid(),
  updated_at timestamptz default now(),
  unique (rec_date, section, rec_key)
);
create index if not exists erp_daily_date on erp_daily_records(rec_date);

-- ---------- 마감 잠금 ----------
create table if not exists erp_locks (
  lock_date date not null, module text not null,  -- worklog / daily / returns
  locked boolean default true, locked_by uuid, locked_at timestamptz default now(),
  primary key (lock_date, module)
);

-- ---------- 업무협조 TO-DO ----------
create table if not exists erp_tasks (
  id              bigint generated always as identity primary key,
  center_id       text default 'gobaek',
  task_type       text not null default '업무협조', -- 보충출고/오픈출고/홀딩·재출고/수출출고/용차/D+1지시/부자재/폐점/기타
  brand           text,
  title           text not null,
  detail          text,
  assigned_team   text,                            -- 할당 팀
  assignee        uuid references erp_profiles(id),
  assignee_name   text,
  assigned_by     uuid references erp_profiles(id) default auth.uid(),
  requester       text,                            -- 요청자 이름(엑셀 이관용)
  request_date    date default current_date,
  due_date        date,
  ship_date       date,
  priority        text default '보통',
  status          text not null default '요청',     -- 요청 / 접수 / 진행중 / 완료 / 보류
  progress        int  not null default 0 check (progress between 0 and 100),
  qty             numeric, boxes numeric,
  result          text, note text,
  accepted_at     timestamptz, started_at timestamptz, completed_at timestamptz,
  completed_by    uuid,
  source          text, source_key text unique,    -- 엑셀 업로드 중복 방지
  data            jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists erp_tasks_status on erp_tasks(status, assigned_team);

create table if not exists erp_task_events (
  id bigint generated always as identity primary key,
  task_id bigint references erp_tasks(id) on delete cascade,
  at timestamptz default now(), by_user uuid default auth.uid(), by_name text,
  status text, progress int, memo text
);

-- ---------- 알림 (완료 콜사인) ----------
create table if not exists erp_notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references erp_profiles(id) on delete cascade,
  kind text not null default 'task_done',
  title text not null, body text, ref_id bigint,
  created_at timestamptz default now(), read_at timestamptz
);
create index if not exists erp_noti_user on erp_notifications(user_id, read_at);

-- ---------- 반품 ----------
create table if not exists erp_returns_box (
  rec_date date primary key,
  top numeric default 0, lotte numeric default 0, haengnang numeric default 0, etc numeric default 0,
  hanger numeric default 0, done numeric default 0, pending numeric default 0, confirmed_pcs numeric default 0,
  note text, updated_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists erp_records (                -- 행사·선반품, 재반송, 불량, 폐점반품, 온라인반품 등 대장
  id bigint generated always as identity primary key,
  kind text not null, rec_date date, brand text, title text, qty numeric, state text,
  source_key text unique, data jsonb,
  updated_by uuid default auth.uid(), updated_at timestamptz default now()
);
create index if not exists erp_records_kind on erp_records(kind, rec_date);

-- ---------- 입고대행 정산 ----------
create table if not exists erp_settlement (
  id bigint generated always as identity primary key,
  client_code text, client_name text, in_date date, style text, pcs numeric default 0,
  box_assort numeric default 0, box_solid numeric default 0, box_total numeric default 0,
  base_amount numeric default 0, err_amount numeric default 0, final_amount numeric default 0,
  status text default '대기', done_date date, note text, source_key text unique, data jsonb,
  updated_by uuid default auth.uid(), updated_at timestamptz default now()
);

-- ---------- 업로드 이력 / 감사 로그 / 개선 요청 ----------
create table if not exists erp_uploads (
  id bigint generated always as identity primary key,
  file_name text, kinds text[], rows int, summary jsonb,
  by_user uuid default auth.uid(), at timestamptz default now()
);
create table if not exists erp_audit (
  id bigint generated always as identity primary key,
  tbl text, row_key text, action text, before jsonb, after jsonb,
  by_user uuid default auth.uid(), at timestamptz default now()
);
create index if not exists erp_audit_at on erp_audit(at desc);
create table if not exists erp_requests (
  id bigint generated always as identity primary key,
  title text not null, body text, page text, priority text default '보통',
  status text default '접수',                     -- 접수 / 검토중 / 반영완료 / 보류
  reply text, created_by uuid default auth.uid(), created_name text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
