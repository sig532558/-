-- =====================================================================
-- 혜성물류 운영 ERP — 속도 · 저장 공간 안정화 (방안 1)
--  ① 권한 검사를 줄마다 하지 않고 한 번만 (보안 규칙은 그대로 · 표현만 바꿈) → 조회 25~180배
--  ② 수정 이력: 한 번에 많이 바뀌면(엑셀 대량 올리기) "누가 · 언제 · 어느 표 · 몇 줄" 한 줄만
--     손으로 고친 것(한 번에 30줄 이하)은 지금처럼 한 줄씩 전부 기록
--  ③ 이미 쌓인 대량 이력 정리 (손 수정 이력은 남김)
-- 01~11 실행 후 맨 마지막에 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================

-- 내 팀 목록 (전체 권한이면 '*' · 미승인 · 없는 사용자는 빈 목록) — 질의마다 한 번만 계산
create or replace function erp_my_teams() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select case when r.scope = 'all' then array['*'] else coalesce(p.teams, '{}') end
                   from erp_profiles p join erp_roles r on r.id = p.role_id where p.id = auth.uid() and p.active), '{}'::text[])
$$;
grant execute on function erp_my_teams() to authenticated;

-- ① 정책 바꾸기: erp_can · auth.uid · erp_me · erp_team_ok · erp_write_ok 를 (select …) 로 감싸 한 번만 계산
do $$
declare p record; q text; c text; n int := 0;
begin
  for p in select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' and tablename like 'erp\_%' loop
    q := p.qual; c := p.with_check;
    if coalesce(q, '') || coalesce(c, '') ~* 'select (erp_can|erp_my_teams|auth\.uid|\(erp_me)' then continue; end if; -- 이미 바꾼 정책
    for i in 1..2 loop
      declare s text := case when i = 1 then q else c end;
      begin
        if s is null then continue; end if;
        -- 작성 권한 + 팀 + 마감 (팀 없음 · 날짜만)
        s := regexp_replace(s, 'erp_write_ok\(''(\w+)''::text, ''(\w+)''::text, (\w+), NULL::text\)', '((SELECT erp_can(''\1'', ''\2'')) AND ((SELECT erp_can(''\1'', ''unlock'')) OR NOT erp_is_locked(\3, ''\1'')))', 'g');
        s := regexp_replace(s, 'erp_write_ok\(''(\w+)''::text, ''(\w+)''::text, (\w+), (\w+)\)', '((SELECT erp_can(''\1'', ''\2'')) AND ((SELECT erp_my_teams()) && ARRAY[''*''::text, \4]) AND ((SELECT erp_can(''\1'', ''unlock'')) OR NOT erp_is_locked(\3, ''\1'')))', 'g');
        s := regexp_replace(s, 'erp_write_ok\(''(\w+)''::text, ''(\w+)''::text, (\w+)\)', '((SELECT erp_can(''\1'', ''\2'')) AND ((SELECT erp_can(''\1'', ''unlock'')) OR NOT erp_is_locked(\3, ''\1'')))', 'g');
        s := regexp_replace(s, 'erp_can\(''(\w+)''::text, ''(\w+)''::text\)', '(SELECT erp_can(''\1'', ''\2''))', 'g');
        s := regexp_replace(s, 'erp_team_ok\((\w+)\)', '((SELECT erp_my_teams()) && ARRAY[''*''::text, \1])', 'g');
        s := regexp_replace(s, '\(erp_me\(\)\)\.(\w+)', '(SELECT (erp_me()).\1)', 'g');
        s := regexp_replace(s, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g');
        if i = 1 then q := s; else c := s; end if;
      end;
    end loop;
    if q is distinct from p.qual then execute format('alter policy %I on %I using (%s)', p.policyname, p.tablename, q); n := n + 1; end if;
    if c is distinct from p.with_check then execute format('alter policy %I on %I with check (%s)', p.policyname, p.tablename, c); n := n + 1; end if;
  end loop;
  raise notice '권한 정책 % 곳을 빠른 방식으로 바꿨습니다', n;
end $$;

-- 자주 찾는 칸 색인
create index if not exists erp_worklog_team_date on erp_worklog(team, work_date);
create index if not exists erp_audit_tbl_at on erp_audit(tbl, at desc);

-- ② 수정 이력: 문장 단위로 기록 (30줄 이하 = 줄마다 · 그보다 많으면 요약 한 줄)
create or replace function erp_audit_stmt() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; lim constant int := 30;
begin
  if tg_op = 'INSERT' then
    select count(*) into n from nt;
    if n = 0 then return null; end if;
    if n <= lim then
      insert into erp_audit(tbl, row_key, action, before, after, by_user)
        select tg_table_name, coalesce(to_jsonb(x) ->> 'id', to_jsonb(x) ->> 'rec_date', to_jsonb(x) ->> 'work_date', to_jsonb(x) ->> 'name'), 'INSERT', null, to_jsonb(x), auth.uid() from nt x;
    else
      insert into erp_audit(tbl, row_key, action, before, after, by_user)
        values (tg_table_name, n || '줄', 'INSERT (대량)', null, jsonb_build_object('rows', n, 'from', (select min(coalesce(to_jsonb(x) ->> 'work_date', to_jsonb(x) ->> 'rec_date')) from nt x), 'to', (select max(coalesce(to_jsonb(x) ->> 'work_date', to_jsonb(x) ->> 'rec_date')) from nt x)), auth.uid());
    end if;
  elsif tg_op = 'UPDATE' then
    select count(*) into n from nt;
    if n = 0 then return null; end if;
    if n <= lim then
      insert into erp_audit(tbl, row_key, action, before, after, by_user)
        select tg_table_name, coalesce(to_jsonb(b) ->> 'id', to_jsonb(b) ->> 'rec_date', to_jsonb(b) ->> 'work_date', to_jsonb(b) ->> 'name'), 'UPDATE', to_jsonb(a), to_jsonb(b), auth.uid()
        from (select x, row_number() over () rn from ot x) oa(a, rn) join (select y, row_number() over () rn from nt y) nb(b, rn) using (rn);
    else
      insert into erp_audit(tbl, row_key, action, before, after, by_user)
        values (tg_table_name, n || '줄', 'UPDATE (대량)', null, jsonb_build_object('rows', n, 'from', (select min(coalesce(to_jsonb(x) ->> 'work_date', to_jsonb(x) ->> 'rec_date')) from nt x), 'to', (select max(coalesce(to_jsonb(x) ->> 'work_date', to_jsonb(x) ->> 'rec_date')) from nt x)), auth.uid());
    end if;
  else -- DELETE: 지운 것은 몇 줄이든 내용까지 남김 (되살리기용) · 단 200줄 넘으면 요약
    select count(*) into n from ot;
    if n = 0 then return null; end if;
    if n <= 200 then
      insert into erp_audit(tbl, row_key, action, before, after, by_user)
        select tg_table_name, coalesce(to_jsonb(x) ->> 'id', to_jsonb(x) ->> 'rec_date', to_jsonb(x) ->> 'work_date', to_jsonb(x) ->> 'name'), 'DELETE', to_jsonb(x), null, auth.uid() from ot x;
    else
      insert into erp_audit(tbl, row_key, action, before, after, by_user) values (tg_table_name, n || '줄', 'DELETE (대량)', null, jsonb_build_object('rows', n), auth.uid());
    end if;
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['erp_worklog','erp_worklog_day','erp_headcount','erp_daily_records','erp_tasks','erp_returns_box','erp_records','erp_settlement','erp_roles','erp_profiles','erp_teams','erp_task_prices','erp_locks','erp_settings','erp_orders','erp_orders_day','erp_kpi','erp_kpi_day'] loop
    if to_regclass(t) is null then continue; end if;
    execute format('drop trigger if exists %I_audit on %I', t, t);
    execute format('drop trigger if exists %I_aud_i on %I', t, t);
    execute format('drop trigger if exists %I_aud_u on %I', t, t);
    execute format('drop trigger if exists %I_aud_d on %I', t, t);
    execute format('create trigger %I_aud_i after insert on %I referencing new table as nt for each statement execute function erp_audit_stmt()', t, t);
    execute format('create trigger %I_aud_u after update on %I referencing old table as ot new table as nt for each statement execute function erp_audit_stmt()', t, t);
    execute format('create trigger %I_aud_d after delete on %I referencing old table as ot for each statement execute function erp_audit_stmt()', t, t);
  end loop;
end $$;

-- ③ 쌓인 대량 이력 정리: 같은 사람이 같은 표를 같은 초에 30줄 넘게 바꾼 묶음 → 요약 한 줄로
create or replace function erp_audit_compact() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and not erp_can('users', 'edit') then raise exception '관리자만 할 수 있습니다'; end if;
  with g as (
    select tbl, by_user, date_trunc('second', at) s, action, count(*) c, min(id) keep_id
    from erp_audit where action in ('INSERT', 'UPDATE') group by 1, 2, 3, 4 having count(*) > 30
  ), u as (
    update erp_audit a set action = g.action || ' (대량)', before = null, after = jsonb_build_object('rows', g.c, '정리', true), row_key = g.c || '줄' from g where a.id = g.keep_id returning a.id
  ), d as (
    delete from erp_audit a using g where a.tbl = g.tbl and a.by_user is not distinct from g.by_user and date_trunc('second', a.at) = g.s and a.action = g.action and a.id <> g.keep_id returning a.id
  )
  select count(*) into n from d;
  return n;
end $$;
grant execute on function erp_audit_compact() to authenticated;
revoke execute on function erp_audit_compact() from anon;
select erp_audit_compact(); -- 설치할 때 한 번 정리
analyze;
