-- =====================================================================
-- 34. 사용자 관리 — 삭제 · 아이디 바꾸기 · 비밀번호 바꾸기 (2026-11-24 행님 지시)
--  · [설정 › 사용자 · 등급] 에서 관리자만 (users.edit / users.delete)
--  · 삭제는 ERP 명단 + Supabase 로그인 계정까지 한 번에 지웁니다 (되돌릴 수 없음)
--  · 지운 사람의 이름 · 아이디는 erp_gone_user 에 남깁니다 (행님 결정 2026-11-24)
--    → 그 사람이 쓴 업무일지 · 마감보고 · 수정 이력의 '작성자' 칸이 빈칸이 되지 않습니다
--  · 비밀번호는 Postgres 안에서 바로 암호화(bcrypt)해 넣습니다 — 어디에도 원문으로 남지 않습니다
--  · 연락처 · 담당 팀 · 소속 · 직급 · 등급은 전부터 이 화면에서 고칠 수 있었습니다 (erp_profiles 수정)
-- 32 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================

do $$ begin create extension if not exists pgcrypto with schema extensions; exception when others then
  begin create extension if not exists pgcrypto; exception when others then raise notice 'pgcrypto 를 켜지 못했습니다: %', sqlerrm; end; end $$;

-- ---------- 지난 사람 (이름만 남김) ----------
create table if not exists erp_gone_user (
  id        uuid primary key,
  login_id  text,
  name      text not null,
  dept      text, title text, role_id text,
  at        timestamptz default now(),
  by_name   text
);
alter table erp_gone_user enable row level security;
drop policy if exists p_sel on erp_gone_user;
-- 보기는 로그인한 사람 모두 (작성자 이름을 찾는 데 씀) · 쓰기 정책은 두지 않음 → 아래 함수로만 들어간다
create policy p_sel on erp_gone_user for select to authenticated using ((select (erp_me()).id) is not null);

-- ---------- 사용자 삭제 ----------
create or replace function erp_del_user(p_id uuid, p_name text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare u erp_profiles; n int;
begin
  if not erp_can('users', 'delete') then raise exception '사용자를 지울 권한이 없습니다'; end if;
  if p_id = auth.uid() then raise exception '자기 자신은 지울 수 없습니다'; end if;
  select * into u from erp_profiles where id = p_id;
  if u.id is null then raise exception '없는 사용자입니다'; end if;
  if btrim(coalesce(p_name, '')) <> u.name then raise exception '이름이 다릅니다 — 지울 사람 이름을 그대로 넣어 주세요'; end if;
  -- 관리자가 한 명뿐이면 막는다 (아무도 못 들어가는 사이트가 되지 않게)
  if u.role_id = 'admin' then
    select count(*) into n from erp_profiles where role_id = 'admin' and active and id <> p_id;
    if n = 0 then raise exception '관리자가 한 명뿐입니다 — 다른 관리자를 먼저 만들어 주세요'; end if;
  end if;

  insert into erp_gone_user (id, login_id, name, dept, title, role_id, by_name)
  values (u.id, u.login_id, u.name, u.dept, u.title, u.role_id, (select name from erp_profiles where id = auth.uid()))
  on conflict (id) do update set login_id = excluded.login_id, name = excluded.name, at = now();

  -- 업무협조 TO-DO 는 사용자 칸이 erp_profiles 를 가리키므로 먼저 비운다 (나머지 표는 저절로 지워지거나 그대로 남는다)
  update erp_tasks set assignee = null where assignee = p_id;
  update erp_tasks set assigned_by = null where assigned_by = p_id;
  update erp_tasks set completed_by = null where completed_by = p_id;

  delete from auth.identities where user_id = p_id;
  delete from auth.users where id = p_id;          -- erp_profiles 는 따라 지워짐 (on delete cascade)
  delete from erp_profiles where id = p_id;        -- 로그인 계정이 없던 줄이면 직접 지운다
  return jsonb_build_object('id', p_id, 'name', u.name, 'login_id', u.login_id);
end $$;
revoke all on function erp_del_user(uuid, text) from public;
grant execute on function erp_del_user(uuid, text) to authenticated;

-- ---------- 비밀번호 바꾸기 (관리자가 정해 줌) ----------
create or replace function erp_set_password(p_id uuid, p_password text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare u erp_profiles;
begin
  if not erp_can('users', 'edit') then raise exception '비밀번호를 바꿀 권한이 없습니다'; end if;
  if coalesce(p_password, '') = '' or length(p_password) < 8 then raise exception '비밀번호는 8자 이상이어야 합니다'; end if;
  select * into u from erp_profiles where id = p_id;
  if u.id is null then raise exception '없는 사용자입니다'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_id;
  if not found then raise exception '로그인 계정이 없습니다 (Supabase 에 없는 사용자입니다)'; end if;
  return jsonb_build_object('id', p_id, 'name', u.name, 'login_id', u.login_id);
end $$;
revoke all on function erp_set_password(uuid, text) from public;
grant execute on function erp_set_password(uuid, text) to authenticated;

-- ---------- 아이디 바꾸기 ----------
create or replace function erp_set_login_id(p_id uuid, p_login_id text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare u erp_profiles; lid text; em text;
begin
  if not erp_can('users', 'edit') then raise exception '아이디를 바꿀 권한이 없습니다'; end if;
  select * into u from erp_profiles where id = p_id;
  if u.id is null then raise exception '없는 사용자입니다'; end if;
  lid := lower(btrim(coalesce(p_login_id, '')));
  if lid = '' or lid !~ '^[a-z0-9._-]{3,30}$' then raise exception '아이디는 영문 소문자 · 숫자 · . _ - 로 3~30자입니다'; end if;
  if lid = lower(u.login_id) then return jsonb_build_object('id', p_id, 'login_id', u.login_id, 'same', true); end if;
  if exists (select 1 from erp_profiles where lower(login_id) = lid and id <> p_id) then raise exception '이미 있는 아이디입니다: %', lid; end if;
  em := case when lid like '%@%' then lid else lid || '@hyeseong.erp' end;
  if exists (select 1 from auth.users where lower(email) = em and id <> p_id) then raise exception '이미 있는 아이디입니다: %', lid; end if;

  update erp_profiles set login_id = lid where id = p_id;
  update auth.users set email = em, updated_at = now() where id = p_id;
  -- 로그인 종류(identity) 의 메일도 같이 바꾼다 (판에 따라 칸이 달라 jsonb 만 고친다)
  begin
    update auth.identities set identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', em), updated_at = now()
      where user_id = p_id;
  exception when others then raise notice 'identity 를 고치지 못했습니다: %', sqlerrm;
  end;
  return jsonb_build_object('id', p_id, 'login_id', lid, 'email', em, 'name', u.name);
end $$;
revoke all on function erp_set_login_id(uuid, text) from public;
grant execute on function erp_set_login_id(uuid, text) to authenticated;
