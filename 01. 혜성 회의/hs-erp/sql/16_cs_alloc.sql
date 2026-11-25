-- =====================================================================
-- 혜성물류 운영 ERP — 전산자료: 화주 ERP 배분LIST (출고 지시 · 17~18시 당일 마감)
--  · 의뢰구분 7가지: 1 패킹리스트(초두) · 2 반응보충 · 3 주문보충 · 4 수기보충 · 5 자동보충 · 6 완불보충 · 7 B2C매장출고
--  · 날짜별로는 "브랜드 × 의뢰구분" 합계 · 매장 수만 저장 (하루 수십 줄)
--  · 매장 × 품번 × 색상 × 사이즈 상세는 가장 최근 파일만 (erp_cs_part kind='alloc')
--  · 일일 마감 보고 B2B 칸 채우기는 화면에서 (손 수정 칸 유지)
-- 15 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================
create table if not exists erp_cs_alloc (
  d date not null,                       -- 보충일자
  brand text not null,
  k text not null,                       -- 1 ~ 7 · etc
  qty numeric, stores int, lines int,
  primary key (d, brand, k)
);
alter table erp_cs_alloc enable row level security;
drop policy if exists p_sel on erp_cs_alloc;
create policy p_sel on erp_cs_alloc for select to authenticated using ((select erp_can('csdata', 'view')));

-- 바꿔 넣기 (한 번에): 파일에 든 날짜의 합계를 새 값으로 · 상세는 최근 파일만 · 올린 기록
--  p_days : ['2026-11-03', …]  p_rows : [{d, brand, k, qty, stores, lines}, …]  p_parts : [[줄…], …]
create or replace function erp_cs_alloc_replace(p_days date[], p_rows jsonb, p_parts jsonb, p_file text, p_lines int, p_qty numeric, p_summary jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare fid bigint; i int := 0; x jsonb; d0 date;
begin
  if not erp_can('csdata', 'create') then raise exception '전산자료 올리기 권한이 없습니다'; end if;
  delete from erp_cs_alloc where d = any(coalesce(p_days, '{}'));
  insert into erp_cs_alloc(d, brand, k, qty, stores, lines)
    select (y->>'d')::date, coalesce(y->>'brand', ''), coalesce(y->>'k', 'etc'), (y->>'qty')::numeric, (y->>'stores')::int, (y->>'lines')::int
    from jsonb_array_elements(coalesce(p_rows, '[]')) y;
  delete from erp_cs_part where kind = 'alloc';
  for x in select * from jsonb_array_elements(coalesce(p_parts, '[]')) loop
    insert into erp_cs_part(kind, sub, part, brand, rows, at) values ('alloc', '배분LIST', i, null, x, now()); i := i + 1;
  end loop;
  select max(v) into d0 from unnest(p_days) v;
  insert into erp_cs_file(kind, sub, ref_date, file_name, rows, qty, summary, by_name)
    values ('order', '배분LIST', d0, p_file, p_lines, p_qty, p_summary, (select name from erp_profiles where id = auth.uid())) returning id into fid;
  return fid;
end $$;
grant execute on function erp_cs_alloc_replace(date[], jsonb, jsonb, text, int, numeric, jsonb) to authenticated;
revoke execute on function erp_cs_alloc_replace(date[], jsonb, jsonb, text, int, numeric, jsonb) from anon;

-- 오래된 날짜별 합계 정리 (3년) — 저장 공간
create or replace function erp_cs_trim() returns int language sql security definer set search_path = public as $$
  with d as (delete from erp_cs_daily where d < (now() at time zone 'Asia/Seoul')::date - 1095 returning 1),
       a as (delete from erp_cs_alloc where d < (now() at time zone 'Asia/Seoul')::date - 1095 returning 1)
  select ((select count(*) from d) + (select count(*) from a))::int
$$;
