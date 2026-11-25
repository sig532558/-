-- =====================================================================
-- 혜성물류 운영 ERP — ① 공지 [확인했습니다] 기록  ② 손익계산표(월 · 주차별) 집계
-- 01~10 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================

-- ① 공지 확인: 읽음(열어 봄)과 별도로 [확인했습니다]를 누른 시각
alter table erp_notice_read add column if not exists confirmed_at timestamptz;
drop policy if exists p_upd on erp_notice_read;
create policy p_upd on erp_notice_read for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ② 손익계산표: 날짜 × 팀 합계 (매출 = 수량 × 공정단가 · 지출 = T.O × 팀 인건비 또는 직접 입력 지출 + 야근)
--    화면이 업무일지 수만 줄을 내려받지 않고 하루 · 팀 합계만 받음 · 읽기 권한(RLS)은 그대로
drop function if exists erp_pl_days(date, date);
create or replace function erp_pl_days(p_from date, p_to date) returns table(d date, team text, wk text, sales numeric, cost numeric, ot numeric, to_count numeric, qty numeric)
language sql stable set search_path = public as $$
  -- wk = 원가관리 엑셀에서 올린 줄의 주차 칸 ('2026-09-1' = 9월1주차) · 화면에서 입력한 줄은 비어 있음(화면이 날짜로 계산)
  select x.d, x.team, x.wk, sum(x.sales), sum(x.cost), sum(x.ot), sum(x.to_count), sum(x.qty) from (
    select w.work_date d, w.team, w.extra->>'wk' wk, sum(w.qty * w.unit_price) sales, sum(coalesce(w.cost_override, w.to_count * coalesce(t.labor_cost, 0))) cost, 0::numeric ot, sum(w.to_count) to_count, sum(w.qty) qty
    from erp_worklog w left join erp_teams t on t.name = w.team where w.work_date between p_from and p_to group by 1, 2, 3
    union all
    select y.work_date, y.team, null, 0, coalesce(y.ot_hours, 0) * coalesce(y.ot_people, 0) * coalesce(t.ot_rate, 0), coalesce(y.ot_hours, 0) * coalesce(y.ot_people, 0) * coalesce(t.ot_rate, 0), 0, 0
    from erp_worklog_day y left join erp_teams t on t.name = y.team where y.work_date between p_from and p_to and coalesce(y.ot_hours, 0) * coalesce(y.ot_people, 0) <> 0
  ) x group by 1, 2, 3
$$;
grant execute on function erp_pl_days(date, date) to authenticated;
revoke execute on function erp_pl_days(date, date) from anon;
