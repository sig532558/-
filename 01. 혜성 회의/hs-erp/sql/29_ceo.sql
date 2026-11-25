-- =====================================================================
-- 29. 대표님 지시 · 할 일 (2026-11-18 승인)
--  · 행님 · 대표님만 보고 쓰는 칸. 권한은 등급(관리자 · 팀장 …)이 아니라 '사람' 단위로 줌
--    → 관리자 등급이라도 명단에 없으면 메뉴도 안 보이고, 이 SQL 규칙(RLS) 때문에 자료를 읽을 수도 없음
--  · erp_ceo_members : 볼 수 있는 사람 명단 (보기 · 쓰기 · 고정)
--      고정(fixed) = 행님 · 대표님 — 화면에서 빼거나 바꿀 수 없음 (실수로 잠기는 일 없게)
--      처음 한 번: 명단이 비어 있을 때만, 사용자 관리 권한이 있는 사람이 '자기 자신'을 고정으로 넣을 수 있음
--      그 뒤로는 고정 인원만 사람을 더하고 뺌
--  · erp_ceo_items   : 지시(dir) · 지시에 붙은 할 일(todo) · 내 할 일(mine)
--      내용이 새지 않도록 수정 이력(erp_audit)에 남기지 않음. 명단 변경만 이력에 남김
-- 기존 표는 하나도 건드리지 않는 '추가'입니다. 01~28 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================

create table if not exists erp_ceo_members (
  user_id   uuid primary key references erp_profiles(id) on delete cascade,
  can_write boolean not null default true,
  fixed     boolean not null default false,
  added_by  uuid default auth.uid(),
  added_at  timestamptz default now(),
  constraint erp_ceo_members_fixed_write check (not fixed or can_write)
);

create table if not exists erp_ceo_items (
  id         text primary key,
  kind       text not null check (kind in ('dir', 'todo', 'mine')),
  parent_id  text references erp_ceo_items(id) on delete cascade,
  rec_date   date,                 -- 지시 받은 날
  src        text,                 -- 받은 곳 (월간 회의 · 전화 · 카톡 · 대면 · 기타)
  title      text not null,        -- 지시 내용 · 할 일
  note       text,                 -- 한 줄 설명
  teams      text[] default '{}',  -- 관련 팀
  owner      text,                 -- 할 일 담당
  due        date,                 -- 기한
  state      text default '새로 받음',  -- 지시: 새로 받음 · 진행 중 · 완료 · 보류
  done       boolean default false, -- 할 일 · 내 할 일: 끝냄
  done_at    date,
  memo       text,
  sort       int default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  updated_by uuid
);
create index if not exists erp_ceo_items_parent on erp_ceo_items(parent_id);
create index if not exists erp_ceo_items_kind on erp_ceo_items(kind, due);

-- ---------- 권한 함수 ----------
--  쓰기는 다른 화면과 같은 규칙: 2단계 인증이 필요한 등급이면 인증(aal2)한 상태에서만 (05_firewall.sql 의 erp_can 과 같음)
create or replace function erp_ceo_ok(p_write boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from erp_ceo_members m join erp_profiles p on p.id = m.user_id left join erp_roles r on r.id = p.role_id
    where m.user_id = auth.uid() and p.active
      and (not p_write or (m.can_write and (not coalesce(r.mfa, false) or erp_aal() = 'aal2'))))
$$;
create or replace function erp_ceo_fixed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from erp_ceo_members m join erp_profiles p on p.id = m.user_id left join erp_roles r on r.id = p.role_id
    where m.user_id = auth.uid() and p.active and m.fixed
      and (not coalesce(r.mfa, false) or erp_aal() = 'aal2'))
$$;
create or replace function erp_ceo_empty() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists(select 1 from erp_ceo_members)
$$;
grant execute on function erp_ceo_ok(boolean), erp_ceo_fixed(), erp_ceo_empty() to authenticated;
revoke execute on function erp_ceo_ok(boolean), erp_ceo_fixed(), erp_ceo_empty() from anon;

-- ---------- 명단 ----------
alter table erp_ceo_members enable row level security;
drop policy if exists p_sel on erp_ceo_members;
create policy p_sel on erp_ceo_members for select to authenticated
  using (erp_ceo_ok() or erp_can('users', 'view'));            -- 사용자 관리 화면에서 '누가 볼 수 있는지'는 보임 (내용은 아님)
drop policy if exists p_ins on erp_ceo_members;
create policy p_ins on erp_ceo_members for insert to authenticated
  with check (erp_ceo_fixed()
              or (erp_ceo_empty() and erp_can('users', 'edit') and user_id = auth.uid() and fixed));  -- 처음 한 번: 자기 자신을 고정으로
drop policy if exists p_upd on erp_ceo_members;
create policy p_upd on erp_ceo_members for update to authenticated
  using (erp_ceo_fixed() and not fixed)                         -- 고정 인원은 바꿀 수 없음
  with check (erp_ceo_fixed());
drop policy if exists p_del on erp_ceo_members;
create policy p_del on erp_ceo_members for delete to authenticated
  using (erp_ceo_fixed() and not fixed);                        -- 고정 인원은 뺄 수 없음
grant select, insert, update, delete on erp_ceo_members to authenticated;
revoke all on erp_ceo_members from anon;

-- ---------- 지시 · 할 일 ----------
alter table erp_ceo_items enable row level security;
drop policy if exists p_sel on erp_ceo_items;
create policy p_sel on erp_ceo_items for select to authenticated using (erp_ceo_ok());
drop policy if exists p_ins on erp_ceo_items;
create policy p_ins on erp_ceo_items for insert to authenticated with check (erp_ceo_ok(true));
drop policy if exists p_upd on erp_ceo_items;
create policy p_upd on erp_ceo_items for update to authenticated using (erp_ceo_ok(true)) with check (erp_ceo_ok(true));
drop policy if exists p_del on erp_ceo_items;
create policy p_del on erp_ceo_items for delete to authenticated using (erp_ceo_ok(true));
grant select, insert, update, delete on erp_ceo_items to authenticated;
revoke all on erp_ceo_items from anon;

-- ---------- 명단 변경만 수정 이력에 남김 (지시 내용은 남기지 않음) ----------
do $$
begin
  if to_regprocedure('erp_audit_stmt()') is null then return; end if;
  execute 'drop trigger if exists erp_ceo_members_aud_i on erp_ceo_members';
  execute 'drop trigger if exists erp_ceo_members_aud_u on erp_ceo_members';
  execute 'drop trigger if exists erp_ceo_members_aud_d on erp_ceo_members';
  execute 'create trigger erp_ceo_members_aud_i after insert on erp_ceo_members referencing new table as nt for each statement execute function erp_audit_stmt()';
  execute 'create trigger erp_ceo_members_aud_u after update on erp_ceo_members referencing old table as ot new table as nt for each statement execute function erp_audit_stmt()';
  execute 'create trigger erp_ceo_members_aud_d after delete on erp_ceo_members referencing old table as ot for each statement execute function erp_audit_stmt()';
end $$;
