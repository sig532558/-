-- =====================================================================
-- 혜성물류 운영 ERP — 공통 그리드 '저장된 보기' (모든 화면 표 · 피벗)
-- 01 · 02 · 03 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================
create table if not exists erp_views (
  id         bigint generated always as identity primary key,
  screen     text not null,            -- 화면:표 이름
  name       text not null,
  owner      uuid not null default auth.uid() references erp_profiles(id) on delete cascade,
  shared     boolean default false,    -- 전체 공유
  config     jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (screen, owner, name)
);
alter table erp_views enable row level security;
drop policy if exists p_sel on erp_views; drop policy if exists p_ins on erp_views; drop policy if exists p_upd on erp_views; drop policy if exists p_del on erp_views;
create policy p_sel on erp_views for select to authenticated using ((erp_me()).id is not null and (shared or owner = auth.uid()));
create policy p_ins on erp_views for insert to authenticated with check ((erp_me()).id is not null and owner = auth.uid());
create policy p_upd on erp_views for update to authenticated using (owner = auth.uid());
create policy p_del on erp_views for delete to authenticated using (owner = auth.uid() or erp_can('users','edit'));
