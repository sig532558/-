-- =====================================================================
-- 30. 손익 자료를 한 번에 (2026-11-18 · 사이트 점검 ② — 승인)
--  · 월간 회의 · 원가 관리의 손익계산표는 erp_pl_days(날짜 × 팀 × 주차) 줄을 받아 화면에서 주차 · 달로 묶음
--  · 서버(PostgREST)가 한 번에 1,000줄까지만 돌려줘서 1년치를 달마다 14번 나눠 불렀음 (2026-11-13)
--  · 같은 줄을 jsonb 배열 '하나'로 돌려주면 줄 수 제한에 안 걸림 → 한 번에 받음 (계산 규칙 · 숫자는 그대로)
--  · 권한도 그대로: erp_pl_days 와 같이 부른 사람 권한(RLS)으로 읽음 (security definer 아님)
-- 기존 표 · 함수는 건드리지 않는 '추가'입니다. 여러 번 실행해도 안전합니다.
-- =====================================================================
create or replace function erp_pl_days_json(p_from date, p_to date) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from erp_pl_days(p_from, p_to) x
$$;
grant execute on function erp_pl_days_json(date, date) to authenticated;
revoke execute on function erp_pl_days_json(date, date) from anon;
