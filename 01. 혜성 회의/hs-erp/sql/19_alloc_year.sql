-- =====================================================================
-- 혜성물류 운영 ERP — 출고 지시(배분LIST) 상세 1년 보관 · 지시 조회
--  · 상세(매장 × 품번 × 색상 × 사이즈)를 3일 → 1년 보관
--  · 90일이 지난 상세는 매장명 · 의뢰일자 · 의뢰구분 글자만 비워 용량을 줄임
--    (수량 · 매장코드 · 품번 · 색상 · 사이즈 · 의뢰구분 번호 · 보충일자 · 브랜드는 그대로)
-- 17 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================
create index if not exists erp_cs_part_kind_sub on erp_cs_part(kind, sub);

create or replace function erp_cs_alloc_compact() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update erp_cs_part p set
    rows = (select coalesce(jsonb_agg(jsonb_build_array(e->0, e->1, '', e->3, e->4, e->5, e->6, e->7, '', '', e->10)), '[]'::jsonb) from jsonb_array_elements(p.rows) e),
    stat = coalesce(p.stat, '{}'::jsonb) || '{"compact": true}'::jsonb
  where p.kind = 'alloc' and p.sub < ((now() at time zone 'Asia/Seoul')::date - 90)::text and not coalesce((p.stat->>'compact')::boolean, false);
  get diagnostics n = row_count; return n;
end $$;
revoke execute on function erp_cs_alloc_compact() from public, anon, authenticated;

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
        (select count(distinct el->>1) from erp_cs_part p, jsonb_array_elements(p.rows) el where p.kind = 'alloc' and p.sub = dd::text),
        coalesce((select sum(lines) from erp_cs_alloc where d = dd and brand <> '' and k = 'all'), 0);
  end loop;
  insert into erp_cs_file(kind, sub, ref_date, file_name, rows, qty, summary, by_name)
    values ('order', '배분LIST', (select max(v) from unnest(p_days) v), p_file, p_lines, p_qty, p_summary, nm) returning id into fid;
  return fid;
end $$;
grant execute on function erp_cs_alloc_merge(date[], text[], jsonb, jsonb, text, int, numeric, jsonb) to authenticated;
revoke execute on function erp_cs_alloc_merge(date[], text[], jsonb, jsonb, text, int, numeric, jsonb) from anon;
