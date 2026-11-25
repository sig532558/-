-- =====================================================================
-- 혜성물류 운영 ERP — 추가 기능 (2026-10)
--   · 아침 출고지시 취합 (B2B 브랜드별 · B2C 브랜드별 · 전년 대비)
--   · 브랜드 관리 확장 (영문명 · 코드 · 다른 이름 · 사용 중지)
--   · 팀별 KPI · 원가 (KPI 입력 → 업무일지 자동 반영)
--   · 신상품 입고 · 출고 · 정리 현황 (화주 ERP · WMS 자료)
-- 01 · 02 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================

-- ---------- 브랜드 확장 ----------
alter table erp_brands add column if not exists en text;
alter table erp_brands add column if not exists code text;
alter table erp_brands add column if not exists aliases text[] default '{}';
alter table erp_brands add column if not exists use_returns boolean default true;
alter table erp_brands add column if not exists start_date date;
alter table erp_brands add column if not exists end_date date;
alter table erp_brands add column if not exists active boolean default true;

-- ---------- 아침 출고지시 취합 ----------
create table if not exists erp_orders (
  rec_date   date not null,
  section    text not null,            -- sale: B2B 판매분 / pre: B2B 선지시(미작업분) / b2c: B2C 브랜드별 / b2c_ch: B2C 채널(크리스·LX·어드민)
  brand      text not null default '',  -- 브랜드(기준명) 또는 채널명
  qty        numeric,                   -- 수량
  cnt        numeric,                   -- 건수(B2C 배송지 기준)
  note       text,
  updated_by uuid default auth.uid(),
  updated_at timestamptz default now(),
  primary key (rec_date, section, brand)
);
create table if not exists erp_orders_day (
  rec_date   date primary key,
  cmp_date   date,                      -- 전년 비교일 (비우면 364일 전 같은 요일)
  prev       jsonb,                     -- 과거 엑셀에 적혀 있던 전년 값 {sale:{브랜드:수량}, pre:{}, b2c_qty, b2c_cnt}
  b2c_prev_qty numeric,                 -- 전년 B2C 수량 (물동량 현황 연결 전 직접 입력값)
  memo       text,
  updated_by uuid default auth.uid(),
  updated_at timestamptz default now()
);

-- ---------- 팀별 KPI ----------
create table if not exists erp_kpi (
  work_date  date not null,
  team       text not null,
  sheet      text not null,             -- in 입고 / first 초도 / out 출고 / box 배출 / ret 반품 / etc 그외
  brand      text not null default '',  -- '' = 합계
  metric     text not null,             -- 인원 · Units · 초도PCS · 판매분 · 수시 ...
  value      numeric,
  updated_by uuid default auth.uid(),
  updated_at timestamptz default now(),
  primary key (work_date, team, sheet, brand, metric)
);
create index if not exists erp_kpi_team_date on erp_kpi(team, work_date);
create table if not exists erp_kpi_day (
  work_date    date not null,
  team         text not null,
  field_count  numeric,                 -- 현장 인원
  office_count numeric,                 -- 지원팀·반품팀 사무 인원 (업무일지 '지원팀,반품팀' T.O)
  ret_count    numeric,                 -- 반품팀 인원(참고)
  ot_hours     numeric, ot_people numeric,
  holiday      boolean default false,
  memo         text,                    -- 그외 업무사항
  updated_by uuid default auth.uid(),
  updated_at timestamptz default now(),
  primary key (work_date, team)
);

-- ---------- 신상품 입고 · 출고 · 정리 ----------
create table if not exists erp_np_style (
  season     text not null,             -- 예: 2026FW, 2026SS
  style      text not null,             -- 품번
  brand      text,
  scode      text,                      -- 시즌 코드 (F3 · F4 …)
  item       text,                      -- 아이템군
  colors     int,
  plan_qty   numeric,                   -- 기획량 (화주 ERP)
  plan_date  date,                      -- 전개시기 (화주 ERP 출고예정일)
  hq_date    date,                      -- 본사 메일 출고 요청일 (직접 입력, 있으면 우선)
  in_qty     numeric, in_date date,     -- 입고 (화주 ERP 입고현황)
  out_qty    numeric,                   -- 출고 (WMS)
  stock      numeric,                   -- 현재고 (WMS)
  stock_loc  numeric,                   -- 로케이션 할당된 재고
  st_in      text,                      -- 입고 / 미입고
  st_out     text,                      -- 출고완료 / 미출고 / 미입고
  st_clean   text,                      -- 정리완료 / 미정리 / 전량출고 / 미입고
  defect     boolean default false,
  flags      text[] default '{}',       -- 기획누락 · 초과입고 · 재고마이너스 · 전개일없음 · 신규브랜드
  updated_at timestamptz default now(),
  primary key (season, style)
);
create index if not exists erp_np_style_brand on erp_np_style(season, brand);
create table if not exists erp_np_snap (
  season text not null, snap_date date not null, data jsonb,
  primary key (season, snap_date)
);

-- ---------- 트리거 ----------
do $$
declare t text;
begin
  foreach t in array array['erp_orders','erp_orders_day','erp_kpi','erp_kpi_day']
  loop
    execute format('drop trigger if exists %I_audit on %I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function erp_audit()', t, t);
  end loop;
  foreach t in array array['erp_orders','erp_orders_day','erp_kpi','erp_kpi_day','erp_np_style']
  loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function erp_touch()', t, t);
  end loop;
end $$;

-- ---------- KPI → 관리자 업무일지 자동 반영 ----------
-- 연결 규칙은 erp_settings 'kpi_map' 에 팀별로 저장 (화면: 기준정보 설정)
create or replace function erp_kpi_sync(p_date date, p_team text) returns int
language plpgsql security definer set search_path = public as $$
declare m jsonb; e jsonb; pr jsonb; q numeric; t numeric; v numeric; price numeric; n int := 0; d erp_kpi_day;
begin
  if not (erp_write_ok('kpi','edit',p_date,p_team) or erp_write_ok('kpi','create',p_date,p_team)) then
    raise exception 'KPI 입력 권한이 없습니다';
  end if;
  if erp_is_locked(p_date,'worklog') and not erp_can('worklog','unlock') then
    raise exception '% 업무일지가 마감되어 원가에 반영할 수 없습니다', p_date;
  end if;
  select value -> p_team into m from erp_settings where key = 'kpi_map';
  if m is null then return 0; end if;
  select * into d from erp_kpi_day where work_date = p_date and team = p_team;
  for e in select * from jsonb_array_elements(m) loop
    q := 0; t := 0;
    for pr in select * from jsonb_array_elements(coalesce(e->'qty','[]')) loop
      select coalesce(sum(value),0) into v from erp_kpi where work_date = p_date and team = p_team and sheet = pr->>0 and brand = '' and metric = pr->>1;
      q := q + v;
    end loop;
    for pr in select * from jsonb_array_elements(coalesce(e->'to','[]')) loop
      if pr->>0 = 'day' then v := coalesce(case pr->>1 when 'office' then d.office_count when 'field' then d.field_count end, 0);
      else select coalesce(sum(value),0) into v from erp_kpi where work_date = p_date and team = p_team and sheet = pr->>0 and brand = '' and metric = pr->>1;
      end if;
      t := t + v;
    end loop;
    select unit_price into price from erp_task_prices where team = p_team and grp = coalesce(e->>'grp','') and task = e->>'task';
    insert into erp_worklog(work_date, team, grp, task, unit_price, qty, to_count, note)
    values (p_date, p_team, coalesce(e->>'grp',''), e->>'task', coalesce(price,0), q, t, 'KPI 자동')
    on conflict (work_date, team, grp, task) do update
      set qty = excluded.qty, to_count = excluded.to_count, unit_price = excluded.unit_price, note = 'KPI 자동', updated_by = auth.uid();
    n := n + 1;
  end loop;
  if d.work_date is not null and (d.ot_hours is not null or d.ot_people is not null) then
    insert into erp_worklog_day(work_date, team, ot_hours, ot_people) values (p_date, p_team, coalesce(d.ot_hours,0), coalesce(d.ot_people,0))
    on conflict (work_date, team) do update set ot_hours = excluded.ot_hours, ot_people = excluded.ot_people;
  end if;
  return n;
end $$;

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['erp_orders','erp_orders_day','erp_kpi','erp_kpi_day','erp_np_style','erp_np_snap']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists p_sel on %I', t);
    execute format('drop policy if exists p_ins on %I', t);
    execute format('drop policy if exists p_upd on %I', t);
    execute format('drop policy if exists p_del on %I', t);
  end loop;
end $$;
-- 브랜드: 관리자(기준정보) + 업무지원팀(출고지시 등록 권한)이 추가·수정. 삭제는 사용 안 함 (사용 중지로 처리)
drop policy if exists p_ins on erp_brands;
drop policy if exists p_upd on erp_brands;
create policy p_ins on erp_brands for insert to authenticated with check (erp_can('settings','edit') or erp_can('orders','create'));
create policy p_upd on erp_brands for update to authenticated using (erp_can('settings','edit') or erp_can('orders','create'));

-- 출고지시 (마감 잠금 'orders')
create policy p_sel on erp_orders for select to authenticated using (erp_can('orders','view'));
create policy p_ins on erp_orders for insert to authenticated with check (erp_write_ok('orders','create',rec_date));
create policy p_upd on erp_orders for update to authenticated using (erp_write_ok('orders','edit',rec_date));
create policy p_del on erp_orders for delete to authenticated using (erp_write_ok('orders','delete',rec_date));
create policy p_sel on erp_orders_day for select to authenticated using (erp_can('orders','view'));
create policy p_ins on erp_orders_day for insert to authenticated with check (erp_write_ok('orders','create',rec_date));
create policy p_upd on erp_orders_day for update to authenticated using (erp_write_ok('orders','edit',rec_date));

-- KPI (팀 범위 + 마감 잠금 'kpi')
create policy p_sel on erp_kpi for select to authenticated using (erp_can('kpi','view') and erp_team_ok(team));
create policy p_ins on erp_kpi for insert to authenticated with check (erp_write_ok('kpi','create',work_date,team));
create policy p_upd on erp_kpi for update to authenticated using (erp_write_ok('kpi','edit',work_date,team));
create policy p_del on erp_kpi for delete to authenticated using (erp_write_ok('kpi','delete',work_date,team));
create policy p_sel on erp_kpi_day for select to authenticated using (erp_can('kpi','view') and erp_team_ok(team));
create policy p_ins on erp_kpi_day for insert to authenticated with check (erp_write_ok('kpi','create',work_date,team));
create policy p_upd on erp_kpi_day for update to authenticated using (erp_write_ok('kpi','edit',work_date,team));

-- 신상품
create policy p_sel on erp_np_style for select to authenticated using (erp_can('newprod','view'));
create policy p_ins on erp_np_style for insert to authenticated with check (erp_can('newprod','create'));
create policy p_upd on erp_np_style for update to authenticated using (erp_can('newprod','create') or erp_can('newprod','edit'));
create policy p_del on erp_np_style for delete to authenticated using (erp_can('newprod','create'));
create policy p_sel on erp_np_snap for select to authenticated using (erp_can('newprod','view'));
create policy p_ins on erp_np_snap for insert to authenticated with check (erp_can('newprod','create'));
create policy p_upd on erp_np_snap for update to authenticated using (erp_can('newprod','create'));

-- 신상품 자료 등록자는 업데이트 시각 기록(erp_settings 'np_update')을 남길 수 있어야 함
drop policy if exists p_ins on erp_settings;
drop policy if exists p_upd on erp_settings;
create policy p_ins on erp_settings for insert to authenticated with check (erp_can('settings','edit') or (key = 'np_update' and erp_can('newprod','create')));
create policy p_upd on erp_settings for update to authenticated using (erp_can('settings','edit') or (key = 'np_update' and erp_can('newprod','create')));

-- ---------- 실시간 ----------
do $$
declare t text;
begin
  foreach t in array array['erp_orders','erp_orders_day','erp_kpi','erp_kpi_day']
  loop
    begin execute format('alter publication supabase_realtime add table %I', t);
    exception when others then null; end;
  end loop;
end $$;

-- ---------- 등급별 기본 권한 (기존 등급에 새 메뉴만 추가 · 이미 있으면 유지) ----------
update erp_roles set perms = perms || '{"orders":{"view":true,"create":true,"edit":true,"delete":true,"close":true,"unlock":true},"kpi":{"view":true,"create":true,"edit":true,"delete":true,"close":true,"unlock":true},"newprod":{"view":true,"create":true,"edit":true}}'::jsonb
 where id = 'admin' and not perms ? 'orders';
update erp_roles set perms = perms || '{"orders":{"view":true},"kpi":{"view":true},"newprod":{"view":true}}'::jsonb
 where id = 'ceo' and not perms ? 'orders';
update erp_roles set perms = perms || '{"orders":{"view":true,"create":true,"edit":true,"close":true},"kpi":{"view":true,"create":true,"edit":true,"close":true},"newprod":{"view":true,"create":true,"edit":true}}'::jsonb
 where id = 'support' and not perms ? 'orders';
update erp_roles set perms = perms || '{"orders":{"view":true},"kpi":{"view":true,"create":true,"edit":true},"newprod":{"view":true}}'::jsonb
 where id = 'leader' and not perms ? 'orders';
update erp_roles set perms = perms || '{"orders":{"view":true},"newprod":{"view":true}}'::jsonb
 where id = 'staff' and not perms ? 'orders';

-- ---------- 브랜드 영문명 · 코드 · 다른 이름 (비어 있을 때만) ----------
update erp_brands b set en = x.en, code = x.code, aliases = x.al
from (values
 ('핑','PING','1','{PING,핑}'::text[]), ('팬텀','FANTOM','2','{FANTOM,펜텀,팬텀}'), ('파리게이츠','PEARLY GATES','5','{PEARLY GATES,파리,파리게이츠}'),
 ('마스터바니','MASTER BUNNY','4','{MASTER BUNNY,MASTER BUNNY EDITION,바니,마바}'), ('고커','GOKER','6','{GOKER}'), ('세인트앤드류스','ST ANDREWS','8','{ST ANDREWS,세인트,세인트앤드류스}'),
 ('하이드로겐','HYDROGEN','H','{HYDROGEN,하이}'), ('마무트','MAMMUT','M','{MAMMUT,마므트}'), ('앤드원더','and wander','W','{AND WANDER,앤드}'),
 ('베셀','VESSEL','S','{VESSEL}'), ('보기보이즈','bogeyboys','B','{BOGEYBOYS}'), ('링스','LYNX','L','{LYNX}'), ('V12','V12','V','{VTWELVE,V12,브이트웰브}'),
 ('로라애슐리','LAURA ASHLEY','R','{LAURA ASHLEY,로라}'), ('용품볼','용품사업부','9','{용품사업부}'), ('네파','NEPA','N','{NEPA}')
) as x(name, en, code, al)
where b.name = x.name and b.en is null;
update erp_brands set active = true where active is null;

-- ---------- KPI → 업무일지 연결 기본 규칙 (정상1팀, Daily KPI Report 양식) ----------
insert into erp_settings(key, value) values ('kpi_map', '{
 "정상1팀":[
  {"grp":"출고","task":"출고","qty":[["first","초도PCS"],["out","온라인"],["out","판매분"],["out","오픈"],["out","행사"]],"to":[["first","인원"],["out","인원"],["box","인원"],["etc","인원"]]},
  {"grp":"출고","task":"부자재출고","qty":[["first","부자재"]],"to":[]},
  {"grp":"출고","task":"사은품출고","qty":[["first","사은품"]],"to":[]},
  {"grp":"정리","task":"입고솔리드정리","qty":[["in","Units"]],"to":[["in","인원"]]},
  {"grp":"정리","task":"수시,폐점 정리","qty":[["ret","온라인"],["ret","수시"],["ret","폐점"],["ret","행사"],["ret","해체"]],"to":[["ret","인원"]]},
  {"grp":"정리","task":"지원팀,반품팀","qty":[],"to":[["day","office"]]}
 ]}')
on conflict (key) do nothing;
