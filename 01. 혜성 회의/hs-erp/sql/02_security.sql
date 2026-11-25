-- =====================================================================
-- 혜성물류 운영 ERP — 권한 함수 · 트리거 · RLS · 기본 데이터
-- 01_schema.sql 실행 후 실행
-- =====================================================================

-- ---------- 권한 함수 ----------
create or replace function erp_me() returns erp_profiles
language sql stable security definer set search_path = public as $$
  select * from erp_profiles where id = auth.uid() and active
$$;

create or replace function erp_can(p_module text, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (r.perms -> p_module ->> p_action)::boolean
    from erp_profiles p join erp_roles r on r.id = p.role_id
    where p.id = auth.uid() and p.active
  ), false)
$$;

create or replace function erp_team_ok(p_team text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select r.scope = 'all' or p_team = any(p.teams)
    from erp_profiles p join erp_roles r on r.id = p.role_id
    where p.id = auth.uid() and p.active
  ), false)
$$;

create or replace function erp_is_locked(p_date date, p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from erp_locks where lock_date = p_date and module = p_module and locked)
$$;

create or replace function erp_write_ok(p_module text, p_action text, p_date date, p_team text default null) returns boolean
language sql stable security definer set search_path = public as $$
  select erp_can(p_module, p_action)
     and (p_team is null or erp_team_ok(p_team))
     and (p_date is null or not erp_is_locked(p_date, p_module) or erp_can(p_module, 'unlock'))
$$;

-- 최초 관리자 지정: 활성 관리자가 한 명도 없을 때만, 호출한 사용자를 관리자로
create or replace function erp_bootstrap_admin() returns text
language plpgsql security definer set search_path = public as $$
begin
  if exists(select 1 from erp_profiles where role_id = 'admin' and active) then
    return 'already';
  end if;
  perform set_config('erp.bootstrap', '1', true);
  update erp_profiles set role_id = 'admin', active = true where id = auth.uid();
  perform set_config('erp.bootstrap', '', true);
  return 'ok';
end $$;

-- 같은 DB의 안성센터 테이블 목록(연동 설정 화면용, 이름·행수만)
create or replace function erp_anseong_tables() returns table(table_name text, est_rows bigint)
language sql stable security definer set search_path = public as $$
  select c.relname::text, c.reltuples::bigint
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','v','m') and c.relname not like 'erp\_%'
  order by c.relname
$$;

-- ---------- 공통 트리거 ----------
create or replace function erp_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function erp_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  k := coalesce(
    (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id',
    (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'rec_date',
    (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'name');
  insert into erp_audit(tbl, row_key, action, before, after, by_user)
  values (tg_table_name, k, tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['erp_worklog','erp_worklog_day','erp_headcount','erp_daily_records','erp_tasks','erp_returns_box','erp_records','erp_settlement','erp_roles','erp_profiles','erp_teams','erp_task_prices','erp_locks','erp_settings']
  loop
    execute format('drop trigger if exists %I_audit on %I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function erp_audit()', t, t);
  end loop;
  foreach t in array array['erp_worklog','erp_worklog_day','erp_headcount','erp_daily_records','erp_tasks','erp_returns_box','erp_records','erp_settlement','erp_requests','erp_roles']
  loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function erp_touch()', t, t);
  end loop;
end $$;

-- 프로필: 본인은 이름·연락처만, 등급·승인·담당팀은 관리자만 변경
create or replace function erp_profile_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not erp_can('users', 'edit') and coalesce(current_setting('erp.bootstrap', true), '') <> '1' then
    if new.role_id is distinct from old.role_id or new.active is distinct from old.active
       or new.teams is distinct from old.teams or new.login_id is distinct from old.login_id then
      raise exception '등급·승인·담당팀은 관리자만 변경할 수 있습니다';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists erp_profiles_guard on erp_profiles;
create trigger erp_profiles_guard before update on erp_profiles for each row execute function erp_profile_guard();

-- ---------- 업무협조 TO-DO: 상태 자동처리 + 이력 + 완료 콜사인 ----------
create or replace function erp_task_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and not erp_can('tasks', 'edit') then
    -- 진행 권한만 있는 사용자(실무진): 진행 관련 항목만 변경 가능
    if new.title is distinct from old.title or new.detail is distinct from old.detail
       or new.assigned_team is distinct from old.assigned_team or new.due_date is distinct from old.due_date
       or new.brand is distinct from old.brand or new.task_type is distinct from old.task_type
       or new.assigned_by is distinct from old.assigned_by then
      raise exception '진행 상태·진행률·결과만 변경할 수 있습니다';
    end if;
  end if;
  if new.status = '완료' then
    new.progress := 100;
    if tg_op = 'INSERT' or old.status is distinct from '완료' then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(new.completed_by, auth.uid());
    end if;
  elsif tg_op = 'UPDATE' and old.status = '완료' then
    new.completed_at := null; new.completed_by := null;
  end if;
  if new.status = '접수' and (tg_op = 'INSERT' or old.status is distinct from '접수') then new.accepted_at := coalesce(new.accepted_at, now()); end if;
  if new.status = '진행중' and (tg_op = 'INSERT' or old.status is distinct from '진행중') then
    new.started_at := coalesce(new.started_at, now());
    new.accepted_at := coalesce(new.accepted_at, now());
  end if;
  return new;
end $$;
drop trigger if exists erp_tasks_before on erp_tasks;
create trigger erp_tasks_before before insert or update on erp_tasks for each row execute function erp_task_before();

create or replace function erp_task_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select name into who from erp_profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    if new.source is null then
      insert into erp_task_events(task_id, by_name, status, progress, memo) values (new.id, who, new.status, new.progress, '등록');
      -- 할당 팀원에게 새 업무 알림
      if new.assigned_team is not null then
        insert into erp_notifications(user_id, kind, title, body, ref_id)
        select p.id, 'task_new', '새 업무 할당 · ' || new.assigned_team, coalesce(new.brand || ' · ', '') || new.title, new.id
        from erp_profiles p where p.active and new.assigned_team = any(p.teams) and p.id is distinct from auth.uid();
      end if;
    end if;
    return new;
  end if;
  if new.status is distinct from old.status or new.progress is distinct from old.progress or new.result is distinct from old.result then
    insert into erp_task_events(task_id, by_name, status, progress, memo)
    values (new.id, who, new.status, new.progress, nullif(coalesce(new.result, ''), coalesce(old.result, '')));
  end if;
  -- 완료 콜사인 → 할당한 담당자에게
  if new.status = '완료' and old.status is distinct from '완료' and new.assigned_by is not null then
    insert into erp_notifications(user_id, kind, title, body, ref_id)
    values (new.assigned_by, 'task_done', '완료 · ' || coalesce(new.assigned_team, '') || ' · ' || coalesce(who, ''),
            coalesce(new.brand || ' · ', '') || new.title || coalesce(' / ' || new.result, ''), new.id);
  end if;
  -- 할당 팀이 바뀌면 새 팀에 알림
  if new.assigned_team is distinct from old.assigned_team and new.assigned_team is not null then
    insert into erp_notifications(user_id, kind, title, body, ref_id)
    select p.id, 'task_new', '새 업무 할당 · ' || new.assigned_team, coalesce(new.brand || ' · ', '') || new.title, new.id
    from erp_profiles p where p.active and new.assigned_team = any(p.teams) and p.id is distinct from auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists erp_tasks_after on erp_tasks;
create trigger erp_tasks_after after insert or update on erp_tasks for each row execute function erp_task_after();

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['erp_roles','erp_profiles','erp_centers','erp_teams','erp_task_prices','erp_brands','erp_settings','erp_worklog','erp_worklog_day','erp_headcount','erp_daily_records','erp_locks','erp_tasks','erp_task_events','erp_notifications','erp_returns_box','erp_records','erp_settlement','erp_uploads','erp_audit','erp_requests']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists p_sel on %I', t);
    execute format('drop policy if exists p_ins on %I', t);
    execute format('drop policy if exists p_upd on %I', t);
    execute format('drop policy if exists p_del on %I', t);
  end loop;
end $$;

-- 등급
create policy p_sel on erp_roles for select to authenticated using (true);
create policy p_ins on erp_roles for insert to authenticated with check (erp_can('users','edit'));
create policy p_upd on erp_roles for update to authenticated using (erp_can('users','edit'));
create policy p_del on erp_roles for delete to authenticated using (erp_can('users','delete'));

-- 사용자: 본인 가입 신청(대기 상태로만), 관리자 승인
create policy p_sel on erp_profiles for select to authenticated using (id = auth.uid() or (erp_me()).id is not null);
create policy p_ins on erp_profiles for insert to authenticated with check (id = auth.uid() and role_id = 'pending' and active = false);
create policy p_upd on erp_profiles for update to authenticated using (id = auth.uid() or erp_can('users','edit'));
create policy p_del on erp_profiles for delete to authenticated using (erp_can('users','delete'));

-- 기준정보
create policy p_sel on erp_centers for select to authenticated using ((erp_me()).id is not null);
create policy p_ins on erp_centers for insert to authenticated with check (erp_can('settings','edit'));
create policy p_upd on erp_centers for update to authenticated using (erp_can('settings','edit'));
create policy p_sel on erp_teams for select to authenticated using ((erp_me()).id is not null);
create policy p_ins on erp_teams for insert to authenticated with check (erp_can('settings','edit') or erp_can('upload','create'));
create policy p_upd on erp_teams for update to authenticated using (erp_can('settings','edit') or erp_can('upload','create'));
create policy p_sel on erp_task_prices for select to authenticated using ((erp_me()).id is not null);
create policy p_ins on erp_task_prices for insert to authenticated with check (erp_can('settings','edit') or erp_can('upload','create'));
create policy p_upd on erp_task_prices for update to authenticated using (erp_can('settings','edit'));
create policy p_del on erp_task_prices for delete to authenticated using (erp_can('settings','edit'));
create policy p_sel on erp_brands for select to authenticated using ((erp_me()).id is not null);
create policy p_ins on erp_brands for insert to authenticated with check (erp_can('settings','edit'));
create policy p_upd on erp_brands for update to authenticated using (erp_can('settings','edit'));
create policy p_sel on erp_settings for select to authenticated using ((erp_me()).id is not null);
create policy p_ins on erp_settings for insert to authenticated with check (erp_can('settings','edit'));
create policy p_upd on erp_settings for update to authenticated using (erp_can('settings','edit'));

-- 업무일지 (팀 범위 + 마감 잠금)
create policy p_sel on erp_worklog for select to authenticated using (erp_can('worklog','view') and erp_team_ok(team));
create policy p_ins on erp_worklog for insert to authenticated with check (erp_write_ok('worklog','create',work_date,team));
create policy p_upd on erp_worklog for update to authenticated using (erp_write_ok('worklog','edit',work_date,team));
create policy p_del on erp_worklog for delete to authenticated using (erp_write_ok('worklog','delete',work_date,team));
create policy p_sel on erp_worklog_day for select to authenticated using (erp_can('worklog','view'));
create policy p_ins on erp_worklog_day for insert to authenticated with check (erp_write_ok('worklog','create',work_date,team));
create policy p_upd on erp_worklog_day for update to authenticated using (erp_write_ok('worklog','edit',work_date,team));
create policy p_sel on erp_headcount for select to authenticated using (erp_can('worklog','view'));
create policy p_ins on erp_headcount for insert to authenticated with check (erp_write_ok('worklog','create',work_date,null));
create policy p_upd on erp_headcount for update to authenticated using (erp_write_ok('worklog','edit',work_date,null));

-- 일일 마감보고
create policy p_sel on erp_daily_records for select to authenticated using (erp_can('daily','view'));
create policy p_ins on erp_daily_records for insert to authenticated with check (erp_write_ok('daily','create',rec_date));
create policy p_upd on erp_daily_records for update to authenticated using (erp_write_ok('daily','edit',rec_date));
create policy p_del on erp_daily_records for delete to authenticated using (erp_write_ok('daily','delete',rec_date));

-- 마감 잠금: 확정은 close, 해제는 unlock 권한
create policy p_sel on erp_locks for select to authenticated using ((erp_me()).id is not null);
create policy p_ins on erp_locks for insert to authenticated with check (erp_can(module,'close'));
create policy p_upd on erp_locks for update to authenticated using (erp_can(module,'unlock'));
create policy p_del on erp_locks for delete to authenticated using (erp_can(module,'unlock'));

-- 업무협조 TO-DO
create policy p_sel on erp_tasks for select to authenticated using (
  erp_can('tasks','view') and (erp_team_ok(coalesce(assigned_team,'')) or assigned_by = auth.uid() or assignee = auth.uid() or assigned_team is null));
create policy p_ins on erp_tasks for insert to authenticated with check (erp_can('tasks','assign') or erp_can('tasks','create'));
create policy p_upd on erp_tasks for update to authenticated using (
  erp_can('tasks','edit') or (erp_can('tasks','progress') and (erp_team_ok(coalesce(assigned_team,'')) or assignee = auth.uid())));
create policy p_del on erp_tasks for delete to authenticated using (erp_can('tasks','delete'));
create policy p_sel on erp_task_events for select to authenticated using (erp_can('tasks','view'));

-- 알림: 본인 것만
create policy p_sel on erp_notifications for select to authenticated using (user_id = auth.uid());
create policy p_upd on erp_notifications for update to authenticated using (user_id = auth.uid());
create policy p_del on erp_notifications for delete to authenticated using (user_id = auth.uid());

-- 반품
create policy p_sel on erp_returns_box for select to authenticated using (erp_can('returns','view'));
create policy p_ins on erp_returns_box for insert to authenticated with check (erp_write_ok('returns','create',rec_date));
create policy p_upd on erp_returns_box for update to authenticated using (erp_write_ok('returns','edit',rec_date));
create policy p_del on erp_returns_box for delete to authenticated using (erp_write_ok('returns','delete',rec_date));
create policy p_sel on erp_records for select to authenticated using (erp_can('returns','view'));
create policy p_ins on erp_records for insert to authenticated with check (erp_can('returns','create'));
create policy p_upd on erp_records for update to authenticated using (erp_can('returns','edit'));
create policy p_del on erp_records for delete to authenticated using (erp_can('returns','delete'));

-- 정산
create policy p_sel on erp_settlement for select to authenticated using (erp_can('settlement','view'));
create policy p_ins on erp_settlement for insert to authenticated with check (erp_can('settlement','create'));
create policy p_upd on erp_settlement for update to authenticated using (erp_can('settlement','edit'));
create policy p_del on erp_settlement for delete to authenticated using (erp_can('settlement','delete'));

-- 업로드·감사·개선요청
create policy p_sel on erp_uploads for select to authenticated using (erp_can('upload','view'));
create policy p_ins on erp_uploads for insert to authenticated with check (erp_can('upload','create'));
create policy p_sel on erp_audit for select to authenticated using (erp_can('users','view'));
create policy p_sel on erp_requests for select to authenticated using ((erp_me()).id is not null);
create policy p_ins on erp_requests for insert to authenticated with check ((erp_me()).id is not null);
create policy p_upd on erp_requests for update to authenticated using (created_by = auth.uid() or erp_can('requests','edit'));

-- ---------- 실시간 반영 ----------
do $$
declare t text;
begin
  foreach t in array array['erp_tasks','erp_notifications','erp_worklog','erp_daily_records','erp_locks','erp_requests']
  loop
    begin execute format('alter publication supabase_realtime add table %I', t);
    exception when others then null; end;
  end loop;
end $$;

-- ---------- 기본 데이터 ----------
insert into erp_centers(id, name, owners, sort) values
 ('gobaek','고백리센터','{크리스,LX,로라}',1), ('anseong','안성센터','{네파}',2)
on conflict (id) do nothing;

insert into erp_teams(name, center_id, labor_cost, ot_rate, sort) values
 ('정상1팀','gobaek',160390,30073.125,1), ('이월소터팀','gobaek',163406,0,2), ('입고반품팀','gobaek',157695,0,3),
 ('온라인팀','gobaek',156929,0,4), ('로라팀','gobaek',220000,0,5), ('별도인원','gobaek',160000,0,6),
 ('안성센터','anseong',157445,29520.9375,7)
on conflict (name) do nothing;

-- 권한 매트릭스: view 보기 / create 등록 / edit 수정 / delete 삭제 / close 마감확정 / unlock 마감해제 / assign 업무할당 / progress 진행처리
insert into erp_roles(id, name, level, scope, perms, memo) values
('admin','관리자',90,'all','{
 "dashboard":{"view":true},
 "worklog":{"view":true,"create":true,"edit":true,"delete":true,"close":true,"unlock":true},
 "daily":{"view":true,"create":true,"edit":true,"delete":true,"close":true,"unlock":true},
 "tasks":{"view":true,"create":true,"edit":true,"delete":true,"assign":true,"progress":true},
 "returns":{"view":true,"create":true,"edit":true,"delete":true,"close":true,"unlock":true},
 "settlement":{"view":true,"create":true,"edit":true,"delete":true},
 "anseong":{"view":true,"edit":true},
 "upload":{"view":true,"create":true},
 "users":{"view":true,"edit":true,"delete":true},
 "settings":{"view":true,"edit":true},
 "requests":{"view":true,"create":true,"edit":true}}','전체 권한 · 마감 해제 · 등급 관리'),
('ceo','대표',100,'all','{
 "dashboard":{"view":true},"worklog":{"view":true},"daily":{"view":true},"tasks":{"view":true},
 "returns":{"view":true},"settlement":{"view":true},"anseong":{"view":true},"upload":{"view":true},
 "users":{"view":true},"settings":{"view":true},"requests":{"view":true,"create":true}}','전체 열람'),
('support','업무지원팀',60,'all','{
 "dashboard":{"view":true},"worklog":{"view":true,"close":true},
 "daily":{"view":true,"create":true,"edit":true,"close":true},
 "tasks":{"view":true,"create":true,"edit":true,"assign":true,"progress":true},
 "returns":{"view":true,"create":true,"edit":true},"settlement":{"view":true,"create":true,"edit":true},
 "anseong":{"view":true},"upload":{"view":true,"create":true},"requests":{"view":true,"create":true}}','업무 할당 · 마감보고 작성'),
('leader','현장 팀장',40,'own_team','{
 "dashboard":{"view":true},"worklog":{"view":true,"create":true,"edit":true},
 "daily":{"view":true},"tasks":{"view":true,"progress":true},
 "returns":{"view":true,"create":true,"edit":true},"anseong":{"view":true},"requests":{"view":true,"create":true}}','자기 팀 업무일지 · 업무 진행'),
('staff','실무진',20,'own_team','{
 "dashboard":{"view":true},"worklog":{"view":true},"tasks":{"view":true,"progress":true},
 "returns":{"view":true},"requests":{"view":true,"create":true}}','자기 팀 업무 진행 처리'),
('pending','승인 대기',0,'own_team','{}','가입 후 관리자 승인 전')
on conflict (id) do nothing;

insert into erp_brands(name, owner, center_id, b2b, b2c, sort) values
 ('핑','크리스','gobaek',true,true,1),('고커','크리스','gobaek',true,false,2),('팬텀','크리스','gobaek',true,true,3),
 ('파리게이츠','크리스','gobaek',true,true,4),('마스터바니','크리스','gobaek',true,true,5),('세인트앤드류스','크리스','gobaek',true,true,6),
 ('링스','LX컴퍼니','gobaek',true,true,7),('V12','LX컴퍼니','gobaek',true,false,8),('베셀','크리스','gobaek',true,false,9),
 ('하이드로겐','크리스','gobaek',true,false,10),('마무트','크리스','gobaek',true,false,11),('앤드원더','크리스','gobaek',true,false,12),
 ('보기보이즈','슈퍼윅스','gobaek',true,false,13),('로라애슐리','로라애슐리','gobaek',true,true,14),('용품볼','크리스','gobaek',true,false,15),
 ('네파','네파','anseong',true,true,20)
on conflict (name) do nothing;

insert into erp_settings(key, value) values
 ('anseong', '{"mode":"same_project","datasets":[]}'),
 ('company', '{"name":"혜성물류(주)","tel":"031-632-5559"}')
on conflict (key) do nothing;
