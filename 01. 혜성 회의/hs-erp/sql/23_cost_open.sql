-- 23. 원가 관리 전체 공개 · 공정단가 수시 변경 (2026-11-09 승인)
--  · 공정단가를 '운영비 제외 · 현장 인건비 관련 단가'로 정하므로 기밀 아님 → 원가 관리(업무일지 · 손익계산표)는 보기 권한이 있는 모든 직원이 전체 팀을 볼 수 있음
--  · 업무일지를 쓰는 사람(등록 · 수정 권한)이 자기 팀 공정단가 · 업무 항목을 직접 추가 · 변경 (수정 이력은 그대로 남음)
--  · 쓰기(입력 · 수정)는 예전처럼 담당 팀만 · 마감 잠금도 그대로
--  · 별도인원 팀은 사용 안 함 (기록은 보관)
-- 여러 번 실행해도 안전
drop policy if exists p_sel on erp_worklog;
create policy p_sel on erp_worklog for select to authenticated using (erp_can('worklog','view'));

drop policy if exists p_ins on erp_task_prices;
create policy p_ins on erp_task_prices for insert to authenticated with check (erp_can('settings','edit') or erp_can('upload','create') or erp_write_ok('worklog','edit',null,team));
drop policy if exists p_upd on erp_task_prices;
create policy p_upd on erp_task_prices for update to authenticated using (erp_can('settings','edit') or erp_write_ok('worklog','edit',null,team)) with check (erp_can('settings','edit') or erp_write_ok('worklog','edit',null,team));

update erp_teams set active = false where name = '별도인원';
