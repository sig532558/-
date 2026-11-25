-- =====================================================================
-- 혜성물류 운영 ERP — 방화벽 ③ 관리자 2단계 인증 · ⑤ 관리자 기능 회사 IP 제한
-- 화면이 아니라 DB 권한 함수(erp_can)에서 막기 때문에 우회할 수 없습니다.
-- 01~04 실행 후 실행. 여러 번 실행해도 안전합니다.
--
-- 비상 해제 (관리자 IP 목록을 잘못 넣어 잠겼을 때) — Supabase SQL Editor에서:
--   update erp_settings set value = jsonb_set(value, '{admin_ips}', '[]') where key = 'security';
-- =====================================================================

-- 등급별 2단계 인증 필요 여부 (처음 설치할 때만 관리자 = 필요)
alter table erp_roles add column if not exists mfa boolean default false;
update erp_roles set mfa = true where id = 'admin' and not exists (select 1 from erp_settings where key = 'security');
insert into erp_settings(key, value) values ('security', '{"admin_ips":[],"access_done":false}') on conflict (key) do nothing;

-- 로그인 단계 (aal1 = 비밀번호만 / aal2 = 2단계 인증 완료)
create or replace function erp_aal() returns text
language sql stable as $$ select coalesce(auth.jwt() ->> 'aal', 'aal1') $$;

-- 접속한 사람의 인터넷 주소 (Cloudflare → Supabase 전달 헤더)
create or replace function erp_client_ip() returns text
language plpgsql stable as $$
declare h json; v text;
begin
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then return null; end;
  if h is null then return null; end if;
  v := coalesce(h ->> 'cf-connecting-ip', split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1), h ->> 'x-real-ip');
  return nullif(trim(v), '');
end $$;
create or replace function erp_my_ip() returns text language sql stable as $$ select erp_client_ip() $$;

-- 관리자 기능 IP 허용 여부 (목록이 비어 있으면 제한 없음 · CIDR 가능: 211.1.2.0/24)
create or replace function erp_ip_ok() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare lst jsonb; ip text; e text;
begin
  select value -> 'admin_ips' into lst from erp_settings where key = 'security';
  if lst is null or jsonb_array_length(lst) = 0 then return true; end if;
  ip := erp_client_ip(); if ip is null then return false; end if;
  for e in select jsonb_array_elements_text(lst) loop
    begin if ip::inet <<= e::inet then return true; end if; exception when others then null; end;
  end loop;
  return false;
end $$;

-- 권한 함수 강화: 보기 외 동작은 (2단계 인증 필요 등급이면) aal2 필요, 관리자 기능은 회사 IP에서만
create or replace function erp_can(p_module text, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (r.perms -> p_module ->> p_action)::boolean
       and (p_action = 'view' or not coalesce(r.mfa, false) or erp_aal() = 'aal2')
       and (not (p_action = 'unlock' or (p_module in ('users','settings') and p_action <> 'view')) or erp_ip_ok())
    from erp_profiles p join erp_roles r on r.id = p.role_id
    where p.id = auth.uid() and p.active
  ), false)
$$;

-- 내 보안 상태 (화면 표시용)
create or replace function erp_my_security() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ip', erp_client_ip(), 'aal', erp_aal(), 'ip_ok', erp_ip_ok(),
    'mfa_required', coalesce((select r.mfa from erp_profiles p join erp_roles r on r.id = p.role_id where p.id = auth.uid()), false))
$$;
grant execute on function erp_my_ip(), erp_my_security() to authenticated;

-- 관리자 IP 목록 저장 시 안전장치: 지금 접속한 주소가 목록에 없으면 저장 거부 (스스로 잠기는 사고 방지)
-- (SQL Editor처럼 접속 주소가 없는 경우는 통과 → 비상 해제 가능)
create or replace function erp_security_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare ip text; e text; hit boolean := false;
begin
  if new.key <> 'security' then return new; end if;
  if jsonb_typeof(new.value -> 'admin_ips') is distinct from 'array' then
    new.value := jsonb_set(coalesce(new.value, '{}'::jsonb), '{admin_ips}', '[]'); return new;
  end if;
  for e in select jsonb_array_elements_text(new.value -> 'admin_ips') loop
    begin perform e::inet; exception when others then raise exception '관리자 IP 형식이 올바르지 않습니다: %', e; end;
  end loop;
  ip := erp_client_ip();
  if ip is null or jsonb_array_length(new.value -> 'admin_ips') = 0 then return new; end if;
  for e in select jsonb_array_elements_text(new.value -> 'admin_ips') loop
    if ip::inet <<= e::inet then hit := true; end if;
  end loop;
  if not hit then raise exception '지금 접속한 주소(%)가 목록에 없습니다. 저장하면 관리자 기능이 잠기므로 거부했습니다.', ip; end if;
  return new;
end $$;
drop trigger if exists t_security_guard on erp_settings;
create trigger t_security_guard before insert or update on erp_settings for each row execute function erp_security_guard();
