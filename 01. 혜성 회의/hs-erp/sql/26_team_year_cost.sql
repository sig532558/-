-- 26. 연도별 인건비 (2026-11-12 승인)
--  · 지금까지 지출 = 인원 × erp_teams.labor_cost (팀마다 한 값) 이라, 2025년 지출이 2026년 인건비로 계산됐음
--    (2025년 정상1팀 153,300원 · 2026년 160,390원 → 약 4~5% 크게 나옴)
--  · erp_team_cost (팀 × 연도) 를 두고, 그 해 값이 있으면 그걸 먼저 씀. 없으면 예전처럼 erp_teams 값을 씀
--  · erp_teams 는 '지금 쓰는 기본값' 으로 그대로 둠 (화면·기존 코드가 계속 씀)
-- 여러 번 실행해도 안전

create table if not exists erp_team_cost (
  team text not null,
  year int not null,
  labor_cost numeric not null default 0,   -- 평균 인건비 (1인/일)
  ot_rate    numeric not null default 0,   -- 연장근무 시급
  memo text,
  updated_at timestamptz default now(),
  primary key (team, year)
);
alter table erp_team_cost enable row level security;

-- 보기: 로그인한 사람 모두 (원가는 전체 공개 — 23번 결정)
drop policy if exists p_sel on erp_team_cost;
create policy p_sel on erp_team_cost for select to authenticated
  using ((erp_me()).id is not null);
-- 쓰기: 관리자 · 엑셀 일괄 등록 (업무일지 파일에 그 해 인건비가 적혀 있음)
drop policy if exists p_ins on erp_team_cost;
create policy p_ins on erp_team_cost for insert to authenticated
  with check (erp_can('settings','edit') or erp_can('upload','create'));
drop policy if exists p_upd on erp_team_cost;
create policy p_upd on erp_team_cost for update to authenticated
  using (erp_can('settings','edit') or erp_can('upload','create'))
  with check (erp_can('settings','edit') or erp_can('upload','create'));
drop policy if exists p_del on erp_team_cost;
create policy p_del on erp_team_cost for delete to authenticated
  using (erp_can('settings','edit'));

grant select, insert, update, delete on erp_team_cost to authenticated;

-- 지금 값을 올해 줄로 한 번 넣어 둠 (이미 있으면 그대로) → 올해 숫자는 하나도 안 바뀜
insert into erp_team_cost(team, year, labor_cost, ot_rate, memo)
select name, extract(year from (now() at time zone 'Asia/Seoul'))::int, coalesce(labor_cost, 0), coalesce(ot_rate, 0), '기준정보에서 옮김'
from erp_teams
on conflict (team, year) do nothing;

-- 손익계산: 그 해 인건비를 먼저 씀
drop function if exists erp_pl_days(date, date);
create or replace function erp_pl_days(p_from date, p_to date) returns table(d date, team text, wk text, sales numeric, cost numeric, ot numeric, to_count numeric, qty numeric)
language sql stable set search_path = public as $$
  -- wk = 원가관리 엑셀에서 올린 줄의 주차 칸 ('2026-09-1' = 9월1주차) · 화면에서 입력한 줄은 비어 있음(화면이 날짜로 계산)
  -- 인건비 = 그 해 erp_team_cost 값 → 없으면 erp_teams 값 (2026-11-12)
  select x.d, x.team, x.wk, sum(x.sales), sum(x.cost), sum(x.ot), sum(x.to_count), sum(x.qty) from (
    select w.work_date d, w.team, w.extra->>'wk' wk, sum(w.qty * w.unit_price) sales,
           sum(coalesce(w.cost_override, w.to_count * coalesce(tc.labor_cost, t.labor_cost, 0))) cost,
           0::numeric ot, sum(w.to_count) to_count, sum(w.qty) qty
    from erp_worklog w
    left join erp_teams t on t.name = w.team
    left join erp_team_cost tc on tc.team = w.team and tc.year = extract(year from w.work_date)::int
    where w.work_date between p_from and p_to group by 1, 2, 3
    union all
    select y.work_date, y.team, null, 0,
           coalesce(y.ot_hours, 0) * coalesce(y.ot_people, 0) * coalesce(tc.ot_rate, t.ot_rate, 0),
           coalesce(y.ot_hours, 0) * coalesce(y.ot_people, 0) * coalesce(tc.ot_rate, t.ot_rate, 0), 0, 0
    from erp_worklog_day y
    left join erp_teams t on t.name = y.team
    left join erp_team_cost tc on tc.team = y.team and tc.year = extract(year from y.work_date)::int
    where y.work_date between p_from and p_to and coalesce(y.ot_hours, 0) * coalesce(y.ot_people, 0) <> 0
  ) x group by 1, 2, 3
$$;
grant execute on function erp_pl_days(date, date) to authenticated;
revoke execute on function erp_pl_days(date, date) from anon;
