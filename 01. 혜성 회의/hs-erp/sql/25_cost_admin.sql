-- 25. 원가 관리: 업무 추가 · 삭제 · 단가 변경은 관리자만 · 지원팀 인원 확인 · 별도인원 사용 (2026-11-11 승인)
--  · 23_cost_open.sql 에서 "업무일지 쓰는 사람이 자기 팀 단가를 바꿀 수 있게" 열어 둔 것을 되돌림
--    → 업무(공정) 추가 · 숨김 · 단가 변경은 [설정 › 원가관리 설정] 에서 관리자만
--  · 보기는 그대로 전체 공개 (단가는 기밀이 아님 — 23번 결정 유지)
--  · 지원팀은 매출이 없는 팀이고 인원을 각 팀에 배정해 운영하므로, 각 팀의 '사무실확인' 인원만 쓸 수 있게 함
--    (현장확인 · 작업수량 · 단가 · 업무일지는 그대로 못 씀)
--  · 별도인원 팀을 다시 사용 (23번에서 껐던 것을 켬)
-- 여러 번 실행해도 안전

-- ① 공정 단가 · 업무 항목: 관리자만 (엑셀 일괄 등록은 그대로)
drop policy if exists p_ins on erp_task_prices;
create policy p_ins on erp_task_prices for insert to authenticated
  with check (erp_can('settings','edit') or erp_can('upload','create'));
drop policy if exists p_upd on erp_task_prices;
create policy p_upd on erp_task_prices for update to authenticated
  using (erp_can('settings','edit')) with check (erp_can('settings','edit'));
drop policy if exists p_del on erp_task_prices;
create policy p_del on erp_task_prices for delete to authenticated
  using (erp_can('settings','edit'));

-- ② 별도인원 다시 사용
update erp_teams set active = true where name = '별도인원';

-- ③ 인원 확인 권한 (headcount) — 지원팀이 사무실확인만 쓸 수 있게
update erp_roles set perms = jsonb_set(perms, '{headcount}', '{"view":true,"edit":true}'::jsonb)
  where id in ('admin','support');
update erp_roles set perms = jsonb_set(perms, '{headcount}', '{"view":true}'::jsonb)
  where id in ('ceo','leader','staff') and perms -> 'headcount' is null;

drop policy if exists p_sel on erp_headcount;
create policy p_sel on erp_headcount for select to authenticated
  using (erp_can('worklog','view') or erp_can('headcount','view'));
drop policy if exists p_ins on erp_headcount;
create policy p_ins on erp_headcount for insert to authenticated
  with check (erp_write_ok('worklog','create',work_date,null)
    or (erp_can('headcount','edit') and (not erp_is_locked(work_date,'worklog') or erp_can('worklog','unlock'))));
drop policy if exists p_upd on erp_headcount;
create policy p_upd on erp_headcount for update to authenticated
  using (erp_write_ok('worklog','edit',work_date,null)
    or (erp_can('headcount','edit') and (not erp_is_locked(work_date,'worklog') or erp_can('worklog','unlock'))));
