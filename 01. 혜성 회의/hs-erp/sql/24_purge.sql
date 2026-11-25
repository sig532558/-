-- 24. 저장 공간 정리 (2026-11-10)
--  · 폐기한 화면(업무 협조 TO-DO · 소모품/부자재 발주 · 통합 대시보드 알림)의 남은 자료를 지움
--  · 오래된 월간 회의 보고서 엑셀 · 수정 이력 · 업로드 기록을 날짜로 끊어 지움
--  · 관리자(users.edit 권한)만 실행 · 지운 건수를 돌려줌 · 되돌릴 수 없음
--  · 지운 뒤 빈 자리는 Postgres 가 천천히 되쓰므로 화면 용량 숫자는 바로 줄지 않을 수 있음
-- 여러 번 실행해도 안전

create or replace function erp_purge(p_kind text, p_before date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare n bigint; res jsonb := '{}'::jsonb; cut text;
begin
  if not erp_can('users', 'edit') then raise exception '저장 공간 정리 권한이 없습니다'; end if;

  if p_kind = 'retired' then
    -- 폐기한 화면: 업무 협조 TO-DO · 소모품/부자재 발주 · 알림
    -- ⚠ 2026-11-25: Supabase 는 WHERE 없는 DELETE 를 막는다 ("DELETE requires a WHERE clause").
    --    security definer 함수 안이라도 세션 설정이 그대로 따라오므로, 늘 참인 조건(id is not null)을 붙인다.
    if to_regclass('public.erp_task_events') is not null then
      delete from erp_task_events where id is not null; get diagnostics n = row_count; res := res || jsonb_build_object('erp_task_events', n); end if;
    if to_regclass('public.erp_tasks') is not null then
      delete from erp_tasks where id is not null; get diagnostics n = row_count; res := res || jsonb_build_object('erp_tasks', n); end if;
    if to_regclass('public.erp_supply') is not null then
      delete from erp_supply where id is not null; get diagnostics n = row_count; res := res || jsonb_build_object('erp_supply', n); end if;
    if to_regclass('public.erp_notifications') is not null then
      delete from erp_notifications where id is not null; get diagnostics n = row_count; res := res || jsonb_build_object('erp_notifications', n); end if;

  elsif p_kind = 'meetbook' then
    if p_before is null then raise exception '언제 이전 것을 지울지 날짜가 없습니다'; end if;
    cut := to_char(p_before, 'YYYY-MM');
    if to_regclass('public.erp_meet_book') is not null then
      delete from erp_meet_book where ym < cut; get diagnostics n = row_count; res := res || jsonb_build_object('erp_meet_book', n); end if;
    if to_regclass('public.erp_meet_note') is not null then
      delete from erp_meet_note where ym < cut; get diagnostics n = row_count; res := res || jsonb_build_object('erp_meet_note', n); end if;

  elsif p_kind = 'audit' then
    if p_before is null then raise exception '언제 이전 것을 지울지 날짜가 없습니다'; end if;
    if to_regclass('public.erp_audit') is not null then
      delete from erp_audit where at < p_before; get diagnostics n = row_count; res := res || jsonb_build_object('erp_audit', n); end if;

  elsif p_kind = 'uploads' then
    if p_before is null then raise exception '언제 이전 것을 지울지 날짜가 없습니다'; end if;
    if to_regclass('public.erp_uploads') is not null then
      delete from erp_uploads where at < p_before; get diagnostics n = row_count; res := res || jsonb_build_object('erp_uploads', n); end if;

  else
    raise exception '모르는 정리 항목입니다: %', p_kind;
  end if;

  return res;
end $$;

revoke all on function erp_purge(text, date) from public;
grant execute on function erp_purge(text, date) to authenticated;

-- 정리 전에 얼마나 지워지는지 미리 세어 보기 (지우지 않음)
create or replace function erp_purge_count(p_kind text, p_before date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare n bigint; res jsonb := '{}'::jsonb; cut text;
begin
  if not erp_can('users', 'edit') then raise exception '저장 공간 정리 권한이 없습니다'; end if;

  if p_kind = 'retired' then
    if to_regclass('public.erp_task_events') is not null then
      execute 'select count(*) from erp_task_events' into n; res := res || jsonb_build_object('erp_task_events', n); end if;
    if to_regclass('public.erp_tasks') is not null then
      execute 'select count(*) from erp_tasks' into n; res := res || jsonb_build_object('erp_tasks', n); end if;
    if to_regclass('public.erp_supply') is not null then
      execute 'select count(*) from erp_supply' into n; res := res || jsonb_build_object('erp_supply', n); end if;
    if to_regclass('public.erp_notifications') is not null then
      execute 'select count(*) from erp_notifications' into n; res := res || jsonb_build_object('erp_notifications', n); end if;

  elsif p_kind = 'meetbook' then
    if p_before is null then raise exception '언제 이전 것을 지울지 날짜가 없습니다'; end if;
    cut := to_char(p_before, 'YYYY-MM');
    if to_regclass('public.erp_meet_book') is not null then
      execute 'select count(*) from erp_meet_book where ym < $1' into n using cut; res := res || jsonb_build_object('erp_meet_book', n); end if;
    if to_regclass('public.erp_meet_note') is not null then
      execute 'select count(*) from erp_meet_note where ym < $1' into n using cut; res := res || jsonb_build_object('erp_meet_note', n); end if;

  elsif p_kind = 'audit' then
    if p_before is null then raise exception '언제 이전 것을 지울지 날짜가 없습니다'; end if;
    if to_regclass('public.erp_audit') is not null then
      execute 'select count(*) from erp_audit where at < $1' into n using p_before; res := res || jsonb_build_object('erp_audit', n); end if;

  elsif p_kind = 'uploads' then
    if p_before is null then raise exception '언제 이전 것을 지울지 날짜가 없습니다'; end if;
    if to_regclass('public.erp_uploads') is not null then
      execute 'select count(*) from erp_uploads where at < $1' into n using p_before; res := res || jsonb_build_object('erp_uploads', n); end if;

  else
    raise exception '모르는 정리 항목입니다: %', p_kind;
  end if;

  return res;
end $$;

revoke all on function erp_purge_count(text, date) from public;
grant execute on function erp_purge_count(text, date) to authenticated;
