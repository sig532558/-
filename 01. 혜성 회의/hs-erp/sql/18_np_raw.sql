-- =====================================================================
-- 혜성물류 운영 ERP — 신상품 현황: 최근 올린 파일 원본 (올린 자료 보기)
--  · 신상품 정보(품번정보현황) · 입고 현황(WMS 입고반품 현황) · 불량 상품 — 종류마다 가장 최근 파일 1개만
--  · 재고 현황은 전산자료 › WMS 재고 현황(정상창고)을 그대로 씀 (따로 저장 안 함)
-- 17 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================
create table if not exists erp_np_raw (
  kind text primary key,                 -- plan · inbound · defect
  file text, n int, rows jsonb,          -- rows = [[칸 값…], …] (화면에 보이는 칸 순서)
  by_name text, at timestamptz default now()
);
alter table erp_np_raw enable row level security;
drop policy if exists p_sel on erp_np_raw; drop policy if exists p_ins on erp_np_raw; drop policy if exists p_upd on erp_np_raw;
create policy p_sel on erp_np_raw for select to authenticated using ((select erp_can('newprod', 'view')));
create policy p_ins on erp_np_raw for insert to authenticated with check ((select erp_can('newprod', 'create')));
create policy p_upd on erp_np_raw for update to authenticated using ((select erp_can('newprod', 'create')));
