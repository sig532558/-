-- =====================================================================
-- 혜성물류 운영 ERP — 브랜드 완전 삭제 허용 (2026-11-13)
--  · 지금까지는 erp_brands 에 delete 정책이 아예 없어 아무도 못 지웠음
--    (화면 안내문 그대로: "삭제 대신 사용 중지로 처리") — 그걸 관리자만 되게 추가
--  · 실제 지우기 전에 화면(설정 › 기준정보 › 브랜드)에서 반품 · 일일마감 · 신상품 등
--    관련 자료가 하나도 없는지 먼저 확인함 (site/js/views-orders.js 의 checkBrandUsage)
--  · 지운 기록은 기존 erp_brands 감사(audit) 트리거가 그대로 남겨 관리자가 되짚어볼 수 있음
-- 01~27 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================
drop policy if exists p_del on erp_brands;
create policy p_del on erp_brands for delete to authenticated using (erp_can('settings','edit'));
