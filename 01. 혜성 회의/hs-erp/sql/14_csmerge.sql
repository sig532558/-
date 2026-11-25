-- =====================================================================
-- 혜성물류 운영 ERP — 전산자료: 브랜드별로 나눠 받은 재고 파일 합치기
--  · WMS 재고를 브랜드별 파일 여러 개로 올려도 → 파일에 있는 브랜드만 새것으로 바꾸고 나머지 브랜드는 그대로
--  · 상세 묶음(erp_cs_part)을 브랜드 단위로 저장 · 브랜드마다 기준 시각 · 파일 이름 기록
--  · 오늘 브랜드 합계(erp_cs_daily)는 남아 있는 전체 상세로 다시 계산
-- 13 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================

alter table erp_cs_part add column if not exists brand text;   -- 파일의 브랜드 칸 글자 그대로 (예: 5 (PEARLY GATES))
alter table erp_cs_part add column if not exists stat jsonb;    -- {name, qty, sku, styles, noloc, noloc_qty, out, fut, file, by_name}

-- 예전(통째로 저장한) 묶음 → 브랜드 묶음으로 나눔 (한 번만 · 자료는 그대로)
with old as (delete from erp_cs_part where brand is null returning kind, sub, rows, at),
e as (select o.kind, o.sub, coalesce(el->>0, '') as b, el, o.at from old o, jsonb_array_elements(coalesce(o.rows, '[]')) el)
insert into erp_cs_part(kind, sub, part, brand, rows, at, stat)
select kind, sub, 1000000 + (row_number() over (order by kind, sub, b))::int, b, jsonb_agg(el), max(at),
  jsonb_build_object('name', b, 'qty', sum((el->>5)::numeric), 'sku', count(*), 'styles', count(distinct el->>1),
    'noloc', count(*) filter (where (el->>5)::numeric > 0 and coalesce(el->>4, '') = ''),
    'noloc_qty', coalesce(sum((el->>5)::numeric) filter (where (el->>5)::numeric > 0 and coalesce(el->>4, '') = ''), 0),
    'out', sum(coalesce((el->>6)::numeric, 0)), 'fut', sum(coalesce((el->>7)::numeric, 0)))
from e group by kind, sub, b;

-- 브랜드 단위로 바꿔 넣기
--  p_brands: 이 파일에 들어 있는 브랜드(글자 그대로) — 이 브랜드의 예전 상세는 지움 (이 창고/채널에 줄이 없어도)
--  p_parts : [{brand, rows, stat}, …]
create or replace function erp_cs_merge(p_kind text, p_sub text, p_brands text[], p_parts jsonb, p_file text, p_rows int, p_qty numeric, p_summary jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare dd date := (now() at time zone 'Asia/Seoul')::date; fid bigint; mx int; x jsonb;
begin
  if not erp_can('csdata', 'create') then raise exception '전산자료 올리기 권한이 없습니다'; end if;
  if p_kind not in ('wms', 'erp') then raise exception '모르는 자료 종류: %', p_kind; end if;
  delete from erp_cs_part where kind = p_kind and sub = p_sub and (brand = any(coalesce(p_brands, '{}')) or brand is null);
  select coalesce(max(part), -1) into mx from erp_cs_part where kind = p_kind and sub = p_sub;
  for x in select * from jsonb_array_elements(coalesce(p_parts, '[]')) loop
    mx := mx + 1;
    insert into erp_cs_part(kind, sub, part, brand, rows, stat, at) values (p_kind, p_sub, mx, coalesce(x->>'brand', ''), x->'rows', x->'stat', now());
  end loop;
  -- 오늘 브랜드 합계 = 남아 있는 상세 전체 (다른 파일로 올린 브랜드 포함)
  delete from erp_cs_daily where d = dd and kind = p_kind and sub = p_sub;
  insert into erp_cs_daily(d, kind, sub, brand, qty, sku, noloc, noloc_qty, out_qty)
    select dd, p_kind, p_sub, coalesce(nullif(stat->>'name', ''), brand, ''), sum((stat->>'qty')::numeric), sum((stat->>'sku')::int),
      case when p_kind = 'wms' then sum((stat->>'noloc')::int) end, case when p_kind = 'wms' then sum((stat->>'noloc_qty')::numeric) end, sum((stat->>'out')::numeric)
    from erp_cs_part where kind = p_kind and sub = p_sub group by 4;
  if coalesce(p_rows, 0) > 0 then
    insert into erp_cs_file(kind, sub, ref_date, file_name, rows, qty, summary, by_name)
      values (p_kind, p_sub, dd, p_file, p_rows, p_qty, p_summary, (select name from erp_profiles where id = auth.uid())) returning id into fid;
  end if;
  return fid;
end $$;
grant execute on function erp_cs_merge(text, text, text[], jsonb, text, int, numeric, jsonb) to authenticated;
revoke execute on function erp_cs_merge(text, text, text[], jsonb, text, int, numeric, jsonb) from anon;
