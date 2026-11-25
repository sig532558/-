-- =====================================================================
-- 혜성물류 운영 ERP — 재고 실사 · 시즌 반품 정리/선지시 출고
-- 01~05 실행 후 실행. 여러 번 실행해도 안전합니다.
-- 대용량(재고 5만 줄 등)은 줄마다 저장하지 않고 5천 줄 묶음(jsonb 배열)으로 저장 → 저장 공간·속도 절약
-- =====================================================================

-- ---------- 재고 실사 ----------
create table if not exists erp_cnt (
  id text primary key,                      -- 예: c20261230
  name text not null,
  center_id text default 'gobaek',
  scope text,                               -- 범위 설명 (이월 창고 1~3층 등)
  start_date date, end_date date,
  opts jsonb not null default '{}'::jsonb,  -- {level:'loc'|'sku', cmp:'cur'|'acc'|'loc', loc_rule:[{prefix,cmp}], loss:'excl'|'incl', tol_qty:3, tol_pct:5}
  zones_done text[] default '{}',           -- 완료 처리한 구역
  status text not null default '진행' check (status in ('진행','확정')),
  summary jsonb,                            -- 목록·대시보드용 요약 (계산 결과)
  created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now()
);
-- 묶음 저장: kind = sys(전산 재고) · fut(미래 발생분 내역) · act(실사) · re(재실사)
create table if not exists erp_cnt_part (
  cnt_id text not null references erp_cnt(id) on delete cascade,
  kind text not null check (kind in ('sys','fut','act','re')),
  file text not null,
  part int not null default 0,
  meta jsonb,                               -- 파일 정보 (줄 수 · 수량 · 조 · 구역 · 열 이름)
  rows jsonb not null default '[]'::jsonb,
  uploaded_by uuid default auth.uid(), uploaded_at timestamptz default now(),
  primary key (cnt_id, kind, file, part)
);

-- ---------- 시즌 반품 정리 · 선지시 출고 ----------
create table if not exists erp_season (
  id text primary key,                      -- 예: 2026SS
  name text not null,
  half text check (half in ('SS','FW')),
  team text default '이월소터팀',
  start_date date, end_date date,
  opts jsonb not null default '{}'::jsonb,  -- {equip:[], ratio:[], jobs:[], holidays:[], ...}
  stock jsonb,                              -- 매장 재고 요약 (브랜드 × 시즌 × 복종)
  pre jsonb,                                -- 선지시 요약
  status text not null default '계획' check (status in ('계획','진행','완료')),
  created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists erp_season_act (
  season_id text not null references erp_season(id) on delete cascade,
  work_date date not null,
  job text not null,                        -- 작업 이름 (계획 작업 목록과 같은 이름)
  qty numeric default 0,
  people numeric,
  memo text,
  updated_by uuid default auth.uid(), updated_at timestamptz default now(),
  primary key (season_id, work_date, job)
);

-- ---------- 수정 시각 ----------
create or replace function erp_touch2() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists t_touch on erp_cnt; create trigger t_touch before update on erp_cnt for each row execute function erp_touch2();
drop trigger if exists t_touch on erp_season; create trigger t_touch before update on erp_season for each row execute function erp_touch2();

-- 확정된 실사는 마감 권한(close)이 있어야 자료 변경
create or replace function erp_cnt_open(p_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select status <> '확정' from erp_cnt where id = p_id), true) or erp_can('count','close')
$$;

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['erp_cnt','erp_cnt_part','erp_season','erp_season_act'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists p_sel on %I', t);
    execute format('drop policy if exists p_ins on %I', t);
    execute format('drop policy if exists p_upd on %I', t);
    execute format('drop policy if exists p_del on %I', t);
  end loop;
end $$;
-- 실사: 등록·전산재고 = create / 실사 자료 올리기 = upload (현장 팀장) / 확정 = close
create policy p_sel on erp_cnt for select to authenticated using (erp_can('count','view'));
create policy p_ins on erp_cnt for insert to authenticated with check (erp_can('count','create'));
create policy p_upd on erp_cnt for update to authenticated using (erp_can('count','create') or erp_can('count','edit') or erp_can('count','close'));
create policy p_del on erp_cnt for delete to authenticated using (erp_can('count','delete'));
create policy p_sel on erp_cnt_part for select to authenticated using (erp_can('count','view'));
create policy p_ins on erp_cnt_part for insert to authenticated with check (erp_cnt_open(cnt_id) and (erp_can('count','create') or (kind in ('act','re') and erp_can('count','upload'))));
create policy p_upd on erp_cnt_part for update to authenticated using (erp_cnt_open(cnt_id) and (erp_can('count','create') or (kind in ('act','re') and erp_can('count','upload'))));
create policy p_del on erp_cnt_part for delete to authenticated using (erp_cnt_open(cnt_id) and (erp_can('count','create') or (kind in ('act','re') and erp_can('count','upload') and uploaded_by = auth.uid())));
-- 시즌: 계획 = create·edit / 실적 = upload
create policy p_sel on erp_season for select to authenticated using (erp_can('season','view'));
create policy p_ins on erp_season for insert to authenticated with check (erp_can('season','create'));
create policy p_upd on erp_season for update to authenticated using (erp_can('season','create') or erp_can('season','edit'));
create policy p_del on erp_season for delete to authenticated using (erp_can('season','delete'));
create policy p_sel on erp_season_act for select to authenticated using (erp_can('season','view'));
create policy p_ins on erp_season_act for insert to authenticated with check (erp_can('season','upload') or erp_can('season','edit'));
create policy p_upd on erp_season_act for update to authenticated using (erp_can('season','upload') or erp_can('season','edit'));
create policy p_del on erp_season_act for delete to authenticated using (erp_can('season','edit'));

-- ---------- 실시간 ----------
do $$
declare t text;
begin
  foreach t in array array['erp_cnt','erp_season','erp_season_act'] loop
    begin execute format('alter publication supabase_realtime add table %I', t); exception when others then null; end;
  end loop;
end $$;

-- ---------- 등급별 기본 권한 (이미 있으면 유지) ----------
update erp_roles set perms = perms || '{"count":{"view":true,"create":true,"upload":true,"edit":true,"delete":true,"close":true},"season":{"view":true,"create":true,"upload":true,"edit":true,"delete":true}}'::jsonb where id = 'admin' and not perms ? 'count';
update erp_roles set perms = perms || '{"count":{"view":true},"season":{"view":true}}'::jsonb where id = 'ceo' and not perms ? 'count';
update erp_roles set perms = perms || '{"count":{"view":true,"create":true,"upload":true,"edit":true,"close":true},"season":{"view":true,"create":true,"upload":true,"edit":true}}'::jsonb where id = 'support' and not perms ? 'count';
update erp_roles set perms = perms || '{"count":{"view":true,"upload":true},"season":{"view":true,"upload":true}}'::jsonb where id = 'leader' and not perms ? 'count';
update erp_roles set perms = perms || '{"count":{"view":true},"season":{"view":true}}'::jsonb where id = 'staff' and not perms ? 'count';

-- ---------- 저장 공간 사용량 (무료 요금제 500MB 관리) · 관리자만 ----------
create or replace function erp_usage() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not erp_can('users', 'view') then null else jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'limit_bytes', 500 * 1024 * 1024,
    'tables', (select coalesce(jsonb_agg(jsonb_build_object('name', t.relname, 'bytes', t.b) order by t.b desc), '[]'::jsonb)
               from (select c.relname, pg_total_relation_size(c.oid) as b from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'erp\_%' order by 2 desc limit 10) t)
  ) end
$$;
grant execute on function erp_usage() to authenticated;
