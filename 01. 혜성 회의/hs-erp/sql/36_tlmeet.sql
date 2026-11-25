-- =====================================================================
-- 36. 팀장 자체 회의록 (2026-11-25 행님 지시 · 2안 '회의록 문서형' 승인)
--  · 회의 날짜마다 한 장 (erp_tl_meet) · 그 안에 팀별 업무 (erp_tl_item)
--  · [새 회의 만들기] = 지난 회의에서 안 끝난 업무를 새 회의로 복사 (erp_tl_new_meet)
--  · 별도 파일은 DB 가 아니라 **파일 저장소(Storage) 'tlmeet' 칸**에 넣고, 여기에는 이름 · 위치만 적음 (erp_tl_file)
--    → DB 500MB 한도에 영향 없음 · 파일 저장소는 1GB
--  · 이어진 업무는 같은 root(처음 만든 업무 id)를 가지며, 파일은 root 에 붙어 회의가 바뀌어도 그대로 보임
--  · 권한 (2026-11-25 그림의 기본값 그대로)
--     보기       : 관리자 · 대표 · 업무지원팀 · 현장 팀장 (tlmeet.view)
--     업무 쓰기  : 팀장은 자기 팀 · 업무지원팀은 '지원팀' · 누구나 '공통 · 기타' · 관리자는 전부 (tlmeet.create)
--     대표님 · 총괄 지시사항 칸 : 관리자만 (users.edit)
--     회의 지우기 : 관리자만
-- 01~35 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================

-- ① 회의 (날짜 하나에 회의 하나 · id = 'YYYY-MM-DD')
create table if not exists erp_tl_meet (
  id text primary key,
  d date not null unique,
  title text default '주간 팀장 회의',
  memo text,
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  updated_by uuid
);

-- ② 회의 안의 업무 한 줄
create table if not exists erp_tl_item (
  id text primary key,
  meet_id text not null references erp_tl_meet(id) on delete cascade,
  root text not null,                  -- 처음 만든 업무 id (다음 회의로 이어진 업무도 같은 값)
  team text not null,
  sort int default 0,
  title text not null,                 -- 업무 내용
  start_d date, end_d date,            -- 시작일 · 종료일
  detail text,                         -- 세부 사항
  status text default 'run' check (status in ('wait', 'run', 'done')), -- 대기 · 진행 · 완료 (지연은 화면에서 종료일로 판단)
  pct int default 0 check (pct between 0 and 100),
  note text,                           -- 비고
  ceo text, ceo_d date,                -- 대표님 지시사항 · 적은 회의 날짜
  gm text, gm_d date,                  -- 총괄 지시사항 · 적은 회의 날짜
  carried boolean default false,       -- 지난 회의에서 넘어온 줄
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  updated_by uuid
);
create index if not exists erp_tl_item_meet on erp_tl_item(meet_id);
create index if not exists erp_tl_item_root on erp_tl_item(root);

-- ③ 별도 파일 (실제 파일은 Storage 'tlmeet' 칸 · path = 그 안의 위치)
create table if not exists erp_tl_file (
  id text primary key,
  root text not null,
  name text not null,                  -- 올린 파일 이름 (한글 그대로)
  path text not null unique,           -- 저장소 안 위치 (영문 · 숫자만)
  mime text, size bigint,
  by_user uuid default auth.uid(), by_name text,
  at timestamptz default now()
);
create index if not exists erp_tl_file_root on erp_tl_file(root);

-- ---------- 이 팀 업무를 쓸 수 있나 ----------
create or replace function erp_tl_ok(p_team text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select coalesce((r.perms -> 'tlmeet' ->> 'create')::boolean, false)
       and (coalesce((r.perms -> 'users' ->> 'edit')::boolean, false)
            or p_team = '공통 · 기타'
            or p_team = any(coalesce(p.teams, '{}'))
            or (p_team = '지원팀' and p.role_id = 'support'))
    from erp_profiles p join erp_roles r on r.id = p.role_id
    where p.id = auth.uid() and p.active), false)
$$;
grant execute on function erp_tl_ok(text) to authenticated;

-- ---------- 지시사항 칸은 관리자만 · 적은 날짜 · 수정자 ----------
create or replace function erp_tl_item_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare carry boolean := coalesce(current_setting('hs.tl_carry', true), '') = '1';
begin
  new.updated_at := now(); new.updated_by := auth.uid();
  if new.status = 'done' then new.pct := 100; end if;
  if carry then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.ceo, '') <> '' or coalesce(new.gm, '') <> '' then
      if not erp_can('users', 'edit') then raise exception '대표님 · 총괄 지시사항은 관리자만 쓸 수 있습니다'; end if;
    end if;
    new.ceo_d := case when coalesce(new.ceo, '') = '' then null else coalesce(new.ceo_d, new.meet_id::date) end;
    new.gm_d := case when coalesce(new.gm, '') = '' then null else coalesce(new.gm_d, new.meet_id::date) end;
  else
    if coalesce(new.ceo, '') is distinct from coalesce(old.ceo, '') or coalesce(new.gm, '') is distinct from coalesce(old.gm, '') then
      if not erp_can('users', 'edit') then raise exception '대표님 · 총괄 지시사항은 관리자만 고칠 수 있습니다'; end if;
    end if;
    if coalesce(new.ceo, '') is distinct from coalesce(old.ceo, '') then new.ceo_d := case when coalesce(new.ceo, '') = '' then null else new.meet_id::date end;
    else new.ceo_d := old.ceo_d; end if;
    if coalesce(new.gm, '') is distinct from coalesce(old.gm, '') then new.gm_d := case when coalesce(new.gm, '') = '' then null else new.meet_id::date end;
    else new.gm_d := old.gm_d; end if;
    new.root := old.root; new.carried := old.carried; -- 이어진 줄 표시는 바꾸지 않음
  end if;
  return new;
end $$;
drop trigger if exists erp_tl_item_guard on erp_tl_item;
create trigger erp_tl_item_guard before insert or update on erp_tl_item for each row execute function erp_tl_item_guard();

create or replace function erp_tl_meet_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists erp_tl_meet_touch on erp_tl_meet;
create trigger erp_tl_meet_touch before insert or update on erp_tl_meet for each row execute function erp_tl_meet_touch();

-- ---------- RLS ----------
alter table erp_tl_meet enable row level security;
alter table erp_tl_item enable row level security;
alter table erp_tl_file enable row level security;
drop policy if exists p_sel on erp_tl_meet; drop policy if exists p_ins on erp_tl_meet; drop policy if exists p_upd on erp_tl_meet; drop policy if exists p_del on erp_tl_meet;
create policy p_sel on erp_tl_meet for select to authenticated using ((select erp_can('tlmeet', 'view')));
create policy p_ins on erp_tl_meet for insert to authenticated with check ((select erp_can('tlmeet', 'create')));
create policy p_upd on erp_tl_meet for update to authenticated using ((select erp_can('tlmeet', 'create')));
create policy p_del on erp_tl_meet for delete to authenticated using ((select erp_can('users', 'edit')));

drop policy if exists p_sel on erp_tl_item; drop policy if exists p_ins on erp_tl_item; drop policy if exists p_upd on erp_tl_item; drop policy if exists p_del on erp_tl_item;
create policy p_sel on erp_tl_item for select to authenticated using ((select erp_can('tlmeet', 'view')));
create policy p_ins on erp_tl_item for insert to authenticated with check (erp_tl_ok(team));
create policy p_upd on erp_tl_item for update to authenticated using (erp_tl_ok(team)) with check (erp_tl_ok(team));
create policy p_del on erp_tl_item for delete to authenticated using (erp_tl_ok(team));

drop policy if exists p_sel on erp_tl_file; drop policy if exists p_ins on erp_tl_file; drop policy if exists p_del on erp_tl_file;
create policy p_sel on erp_tl_file for select to authenticated using ((select erp_can('tlmeet', 'view')));
create policy p_ins on erp_tl_file for insert to authenticated with check (exists (select 1 from erp_tl_item i where i.root = erp_tl_file.root and erp_tl_ok(i.team)));
create policy p_del on erp_tl_file for delete to authenticated using (by_user = (select auth.uid()) or exists (select 1 from erp_tl_item i where i.root = erp_tl_file.root and erp_tl_ok(i.team)));

-- ---------- [새 회의 만들기] — 그 날짜 회의가 있으면 그대로, 없으면 만들고 지난 회의의 안 끝난 업무를 복사 ----------
create or replace function erp_tl_new_meet(p_d date, p_title text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mid text := to_char(p_d, 'YYYY-MM-DD'); prev text; n int := 0;
begin
  if not erp_can('tlmeet', 'create') then raise exception '회의를 만들 권한이 없습니다'; end if;
  if p_d is null then raise exception '회의 날짜를 넣어 주세요'; end if;
  if exists (select 1 from erp_tl_meet where id = mid) then return jsonb_build_object('id', mid, 'carried', 0, 'existed', true); end if;
  insert into erp_tl_meet(id, d, title, created_by) values (mid, p_d, coalesce(nullif(trim(p_title), ''), '주간 팀장 회의'), auth.uid());
  select id into prev from erp_tl_meet where d < p_d order by d desc limit 1;
  if prev is not null then
    perform set_config('hs.tl_carry', '1', true);
    insert into erp_tl_item(id, meet_id, root, team, sort, title, start_d, end_d, detail, status, pct, note, ceo, ceo_d, gm, gm_d, carried, created_by)
      select mid || '-' || substr(md5(i.id || clock_timestamp()::text), 1, 10), mid, i.root, i.team, i.sort, i.title, i.start_d, i.end_d, i.detail, i.status, i.pct, i.note, i.ceo, i.ceo_d, i.gm, i.gm_d, true, auth.uid()
      from erp_tl_item i where i.meet_id = prev and i.status <> 'done';
    get diagnostics n = row_count;
    perform set_config('hs.tl_carry', '', true);
  end if;
  return jsonb_build_object('id', mid, 'carried', n, 'from', prev, 'existed', false);
end $$;
grant execute on function erp_tl_new_meet(date, text) to authenticated;

-- ---------- 업무 한 줄 지우기 — 그 업무가 다른 회의에 더 없으면 붙은 파일 줄도 지우고, 저장소에서 지울 위치를 돌려줌 ----------
create or replace function erp_tl_del_item(p_id text) returns text[]
language plpgsql security definer set search_path = public as $$
declare it erp_tl_item; paths text[] := '{}';
begin
  select * into it from erp_tl_item where id = p_id;
  if it.id is null then raise exception '없는 업무입니다'; end if;
  if not erp_tl_ok(it.team) then raise exception '이 팀 업무를 지울 권한이 없습니다'; end if;
  delete from erp_tl_item where id = p_id;
  if not exists (select 1 from erp_tl_item where root = it.root) then
    select coalesce(array_agg(path), '{}') into paths from erp_tl_file where root = it.root;
    delete from erp_tl_file where root = it.root;
  end if;
  return paths;
end $$;
grant execute on function erp_tl_del_item(text) to authenticated;

-- ---------- 회의 지우기 (관리자만) — 회의 안 업무 · 남는 데가 없는 파일 줄까지 · 저장소에서 지울 위치를 돌려줌 ----------
create or replace function erp_tl_del_meet(p_id text) returns text[]
language plpgsql security definer set search_path = public as $$
declare paths text[] := '{}'; rs text[];
begin
  if not erp_can('users', 'edit') then raise exception '회의를 지우는 것은 관리자만 할 수 있습니다'; end if;
  select coalesce(array_agg(distinct root), '{}') into rs from erp_tl_item where meet_id = p_id;
  delete from erp_tl_meet where id = p_id; -- 업무는 같이 지워짐 (on delete cascade)
  select coalesce(array_agg(path), '{}') into paths from erp_tl_file f where f.root = any(rs) and not exists (select 1 from erp_tl_item i where i.root = f.root);
  delete from erp_tl_file f where f.root = any(rs) and not exists (select 1 from erp_tl_item i where i.root = f.root);
  return paths;
end $$;
grant execute on function erp_tl_del_meet(text) to authenticated;

-- ---------- 파일 저장소 칸 'tlmeet' (공개 안 함 · 파일 하나 10MB) ----------
--  · 로그인한 직원 중 회의록 보기 권한이 있어야 열림 (주소가 새도 못 엶 · 화면은 1시간짜리 임시 주소로 엶)
insert into storage.buckets (id, name, public, file_size_limit)
  values ('tlmeet', 'tlmeet', false, 10485760)
  on conflict (id) do update set public = false, file_size_limit = 10485760;
drop policy if exists tlmeet_sel on storage.objects;
drop policy if exists tlmeet_ins on storage.objects;
drop policy if exists tlmeet_del on storage.objects;
create policy tlmeet_sel on storage.objects for select to authenticated using (bucket_id = 'tlmeet' and (select erp_can('tlmeet', 'view')));
create policy tlmeet_ins on storage.objects for insert to authenticated with check (bucket_id = 'tlmeet' and (select erp_can('tlmeet', 'create')));
create policy tlmeet_del on storage.objects for delete to authenticated using (bucket_id = 'tlmeet' and (select erp_can('tlmeet', 'create')));

-- ---------- 실시간 — 회의 중 다른 팀장이 고치면 화면이 저절로 새로 고쳐짐 ----------
do $$
declare t text;
begin
  foreach t in array array['erp_tl_meet', 'erp_tl_item', 'erp_tl_file'] loop
    begin execute format('alter publication supabase_realtime add table %I', t); exception when others then null; end;
  end loop;
end $$;

-- ---------- 등급별 기본 권한 (이미 있으면 그대로 둠) ----------
update erp_roles set perms = perms || '{"tlmeet":{"view":true,"create":true}}'::jsonb
  where id in ('admin', 'support', 'leader') and not perms ? 'tlmeet';
update erp_roles set perms = perms || '{"tlmeet":{"view":true}}'::jsonb
  where id = 'ceo' and not perms ? 'tlmeet';
