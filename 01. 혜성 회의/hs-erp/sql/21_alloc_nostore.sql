-- =====================================================================
-- 혜성물류 운영 ERP — 배분LIST 매장코드 · 매장명 없이 올리기
--  · 매장 칸 없이 받은 파일은 매장 수를 세지 않음 (빈 매장코드는 매장 수에서 뺌)
--  · 로케이션 없음 기준 (설정 'noloc_rule'): 빈칸 + 지정 위치 이름 · 최소 수량 · 빨강 비율 (반품창고 제외)
-- 20 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================
insert into erp_settings(key, value) values ('noloc_rule', '{"codes":[],"min":1,"pct":5}'::jsonb) on conflict (key) do nothing;

create or replace function erp_cs_alloc_merge(p_days date[], p_brands text[], p_rows jsonb, p_parts jsonb, p_file text, p_lines int, p_qty numeric, p_summary jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare fid bigint; x jsonb; dd date; nm text := (select name from erp_profiles where id = auth.uid()); mx int;
begin
  if not erp_can('csdata', 'create') then raise exception '전산자료 올리기 권한이 없습니다'; end if;
  if exists (select 1 from erp_cs_close where kind = 'alloc' and d = any(coalesce(p_days, '{}')) and closed_at is not null) then
    raise exception '이미 마감된 날짜입니다 (%). 관리자가 마감 해제 후 다시 올려 주세요', (select string_agg(d::text, ', ') from erp_cs_close where kind = 'alloc' and d = any(p_days) and closed_at is not null);
  end if;
  delete from erp_cs_alloc where d = any(p_days) and (brand = any(coalesce(p_brands, '{}')) or brand = '');
  insert into erp_cs_alloc(d, brand, k, qty, stores, lines, at, by_name, file)
    select (y->>'d')::date, coalesce(y->>'brand', ''), coalesce(y->>'k', 'etc'), (y->>'qty')::numeric, (y->>'stores')::int, (y->>'lines')::int,
      case when y->>'k' = 'all' then now() end, case when y->>'k' = 'all' then nm end, case when y->>'k' = 'all' then p_file end
    from jsonb_array_elements(coalesce(p_rows, '[]')) y where coalesce(y->>'brand', '') <> '';
  -- 상세: 날짜 × 브랜드별 최근 파일만
  delete from erp_cs_part where kind = 'alloc' and sub = any(select v::text from unnest(p_days) v) and brand = any(coalesce(p_brands, '{}'));
  select coalesce(max(part), -1) into mx from erp_cs_part where kind = 'alloc';
  for x in select * from jsonb_array_elements(coalesce(p_parts, '[]')) loop
    mx := mx + 1; insert into erp_cs_part(kind, sub, part, brand, rows, at) values ('alloc', x->>'d', mx, x->>'brand', x->'rows', now());
  end loop;
  delete from erp_cs_part where kind = 'alloc' and sub < ((now() at time zone 'Asia/Seoul')::date - 365)::text; -- 1년 보관
  perform erp_cs_alloc_compact();
  -- 날짜 전체 합계 (브랜드 합 · 매장 수는 상세에서 중복 없이)
  foreach dd in array p_days loop
    insert into erp_cs_alloc(d, brand, k, qty, stores, lines)
      select dd, '', 'all', coalesce((select sum(qty) from erp_cs_alloc where d = dd and brand <> '' and k = 'all'), 0),
        (select count(distinct nullif(el->>1, '')) from erp_cs_part p, jsonb_array_elements(p.rows) el where p.kind = 'alloc' and p.sub = dd::text),
        coalesce((select sum(lines) from erp_cs_alloc where d = dd and brand <> '' and k = 'all'), 0);
  end loop;
  insert into erp_cs_file(kind, sub, ref_date, file_name, rows, qty, summary, by_name)
    values ('order', '배분LIST', (select max(v) from unnest(p_days) v), p_file, p_lines, p_qty, p_summary, nm) returning id into fid;
  return fid;
end $$;
grant execute on function erp_cs_alloc_merge(date[], text[], jsonb, jsonb, text, int, numeric, jsonb) to authenticated;
revoke execute on function erp_cs_alloc_merge(date[], text[], jsonb, jsonb, text, int, numeric, jsonb) from anon;
