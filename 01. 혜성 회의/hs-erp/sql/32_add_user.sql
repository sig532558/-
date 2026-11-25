-- 32. 관리자가 사용자 계정을 바로 만들기 (2026-11-19 · 행님 지시 "대표님은 가입을 안 하시니 내가 입력해 강제 가입")
--  · 설정 › 사용자 · 등급 › [+ 사용자 직접 추가] 에서 아이디 · 이름 · 등급 · 첫 비밀번호를 넣으면 바로 쓸 수 있는 계정이 생김
--  · 관리자(users.edit)만 실행 · 로그인 아이디는 가입 화면과 같은 규칙으로 <아이디>@hyeseong.erp 로 저장
--  · 비밀번호는 Postgres 안에서 바로 암호화(bcrypt)해 넣습니다 — 어디에도 원문으로 남지 않습니다
--  · 만든 뒤 대표님이 비밀번호를 바꾸려면 로그인 후 [비밀번호 변경]
-- 여러 번 실행해도 안전

do $$ begin create extension if not exists pgcrypto with schema extensions; exception when others then
  begin create extension if not exists pgcrypto; exception when others then raise notice 'pgcrypto 를 켜지 못했습니다: %', sqlerrm; end; end $$;

create or replace function erp_add_user(
  p_login_id text,
  p_password text,
  p_name text,
  p_role text default 'staff',
  p_dept text default null,
  p_title text default null,
  p_phone text default null,
  p_teams text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare uid uuid := gen_random_uuid(); em text; lid text;
begin
  if not erp_can('users', 'edit') then raise exception '사용자를 만들 권한이 없습니다'; end if;
  lid := lower(btrim(coalesce(p_login_id, '')));
  if lid = '' or lid !~ '^[a-z0-9._-]{3,30}$' then raise exception '아이디는 영문 소문자 · 숫자 · . _ - 로 3~30자입니다'; end if;
  if coalesce(p_password, '') = '' or length(p_password) < 8 then raise exception '비밀번호는 8자 이상이어야 합니다'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception '이름을 넣어 주세요'; end if;
  if not exists (select 1 from erp_roles where id = p_role) then raise exception '없는 등급입니다: %', p_role; end if;
  if exists (select 1 from erp_profiles where lower(login_id) = lid) then raise exception '이미 있는 아이디입니다: %', lid; end if;

  em := case when lid like '%@%' then lid else lid || '@hyeseong.erp' end;
  if exists (select 1 from auth.users where lower(email) = em) then raise exception '이미 있는 아이디입니다: %', lid; end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', btrim(p_name), 'app', 'erp', 'made_by', 'erp_add_user'),
    now(), now(), '', '', '', ''
  );

  -- 로그인 종류(identity) — Supabase 판에 따라 칸이 달라 두 가지로 나눠 넣고, 실패해도 계정은 살려 둠
  begin
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id') then
      insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), uid, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', uid::text, now(), now(), now());
    else
      execute 'insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values ($1, $2, $3, $4, now(), now(), now())'
        using uid::text, uid, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email';
    end if;
  exception when others then raise notice 'identity 를 넣지 못했습니다 (로그인에는 대개 문제 없음): %', sqlerrm;
  end;

  insert into erp_profiles (id, login_id, name, dept, title, phone, role_id, teams, active)
  values (uid, lid, btrim(p_name), nullif(btrim(coalesce(p_dept, '')), ''), nullif(btrim(coalesce(p_title, '')), ''), nullif(btrim(coalesce(p_phone, '')), ''), p_role, coalesce(p_teams, '{}'), true);

  return jsonb_build_object('id', uid, 'login_id', lid, 'email', em, 'name', btrim(p_name), 'role', p_role);
end $$;

revoke all on function erp_add_user(text, text, text, text, text, text, text, text[]) from public;
grant execute on function erp_add_user(text, text, text, text, text, text, text, text[]) to authenticated;
