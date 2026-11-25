-- 31. 수정 이력 자동 지우기 (2026-11-18 · 행님 지시 "2년 이후 자료 자동 삭제")
--  · 설정 › 사용자 · 등급 › 수정 이력 에서 고른 기간(기본 2년)이 지난 이력을 매일 밤 00:40 에 지움
--  · 기간은 erp_settings('audit_keep_months') 에 {"months": 24} 로 저장 · 0 이면 자동 지우기 끔
--  · 손으로 지우는 것은 24_purge.sql 의 erp_purge('audit', 날짜) 를 그대로 씀
--  · 수정 이력만 지웁니다 (업무 자료는 건드리지 않음) · 되돌릴 수 없음
-- 여러 번 실행해도 안전

-- ---------- 지금 설정 · 지울 건수 · 자동 예약 여부 ----------
create or replace function erp_audit_trim_info()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare mo int; n bigint := 0;
begin
  if not erp_can('users', 'view') then raise exception '수정 이력 권한이 없습니다'; end if;
  select coalesce((value ->> 'months')::int, 24) into mo from erp_settings where key = 'audit_keep_months';
  if mo is null then mo := 24; end if;
  if mo > 0 and to_regclass('public.erp_audit') is not null then
    select count(*) into n from erp_audit where at < now() - make_interval(months => mo);
  end if;
  return jsonb_build_object(
    'months', mo,
    'old', n,
    'cron', exists(select 1 from pg_extension where extname = 'pg_cron')
  );
end $$;

revoke all on function erp_audit_trim_info() from public;
grant execute on function erp_audit_trim_info() to authenticated;

-- ---------- 기간 바꾸기 (관리자만) ----------
create or replace function erp_audit_trim_set(p_months int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not erp_can('users', 'edit') then raise exception '수정 이력 설정 권한이 없습니다'; end if;
  if p_months is null or p_months < 0 or p_months > 120 then raise exception '기간이 올바르지 않습니다'; end if;
  insert into erp_settings(key, value, updated_at) values ('audit_keep_months', jsonb_build_object('months', p_months), now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  return erp_audit_trim_info();
end $$;

revoke all on function erp_audit_trim_set(int) from public;
grant execute on function erp_audit_trim_set(int) to authenticated;

-- ---------- 매일 밤 자동으로 지우기 ----------
create or replace function erp_audit_trim()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare mo int; n int := 0;
begin
  -- 사람이 부를 때는 관리자만 (예약 실행은 auth.uid() 가 없음)
  if auth.uid() is not null and not erp_can('users', 'edit') then raise exception '수정 이력 정리 권한이 없습니다'; end if;
  select coalesce((value ->> 'months')::int, 24) into mo from erp_settings where key = 'audit_keep_months';
  if mo is null then mo := 24; end if;
  if mo <= 0 then return 0; end if;
  if to_regclass('public.erp_audit') is null then return 0; end if;
  delete from erp_audit where at < now() - make_interval(months => mo);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function erp_audit_trim() from public;
grant execute on function erp_audit_trim() to authenticated;

-- ---------- 예약 (UTC 15:40 = 한국 00:40) ----------
do $$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'erp_audit_trim';
    perform cron.schedule('erp_audit_trim', '40 15 * * *', $c$select erp_audit_trim()$c$);
  else
    raise notice 'pg_cron 이 없어 수정 이력 자동 지우기를 예약하지 못했습니다 — 화면에서 [지금 지우기] 를 눌러 주세요';
  end if;
end $$;
