-- 27. 단가는 [설정 › 원가관리 설정] 에서만 · 팀장은 자기 팀만 · 인원 확인 나누기 (2026-11-12 승인)
--  · 25_cost_admin.sql 에서 "단가는 관리자만" 으로 잠근 것을 조금 엽니다
--      → 팀장 등급은 [설정 › 원가관리 설정] 에서 자기 팀 업무 추가 · 숨김 · 단가 변경을 할 수 있습니다
--      → 팀별 원가 관리 입력(업무일지) 화면의 공정단가는 누구도 못 고칩니다 (디폴트 수정 불가)
--  · 인원 확인을 나눕니다 — 현장확인은 각 팀이 자기 화면에서, 사무실확인 · 배정 인원은 지원팀이
--    (칸을 나누는 것은 화면에서 막습니다. DB 는 지금처럼 줄 단위로만 봅니다)
-- 여러 번 실행해도 안전

-- ① 배정 인원 칸 추가 (있던 자료는 그대로 · 칼럼만 덧붙임)
alter table erp_headcount add column if not exists alloc_count numeric;

-- ② 원가관리 설정 권한 (costset) — 관리자 · 팀장은 고치기 · 나머지는 보기만
update erp_roles set perms = jsonb_set(perms, '{costset}', '{"view":true,"edit":true}'::jsonb)
  where id in ('admin', 'leader');
update erp_roles set perms = jsonb_set(perms, '{costset}', '{"view":true}'::jsonb)
  where id in ('ceo', 'support', 'staff') and perms -> 'costset' is null;

-- ③ 공정 단가 · 업무 항목 — 관리자는 전 팀 · 팀장은 자기 팀만 (엑셀 일괄 등록은 그대로)
drop policy if exists p_ins on erp_task_prices;
create policy p_ins on erp_task_prices for insert to authenticated
  with check (erp_can('settings','edit') or erp_can('upload','create')
    or (erp_can('costset','edit') and team = any(erp_my_teams())));
drop policy if exists p_upd on erp_task_prices;
create policy p_upd on erp_task_prices for update to authenticated
  using (erp_can('settings','edit') or (erp_can('costset','edit') and team = any(erp_my_teams())))
  with check (erp_can('settings','edit') or (erp_can('costset','edit') and team = any(erp_my_teams())));
drop policy if exists p_del on erp_task_prices;
create policy p_del on erp_task_prices for delete to authenticated
  using (erp_can('settings','edit') or (erp_can('costset','edit') and team = any(erp_my_teams())));
