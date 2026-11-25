-- =====================================================================
-- 혜성물류 운영 ERP — 배분LIST 브랜드별로 나눠 올리기 · 마감
--  · 같은 날짜에 브랜드별 파일을 따로 올려도 합쳐짐 (파일에 든 브랜드만 새것으로)
--  · 브랜드마다 올린 시각 · 사람 · 파일 기록 (k='all' 줄)
--  · [배분LIST 마감]: 지원팀 · 관리자 (전산자료 올리기 권한) / 마감 해제: 관리자 (전산자료 close 권한)
--  · [오늘 없음]: 그날 배분이 없는 브랜드를 마감 대상에서 뺌
--  · 상세(매장 × 품번 × 색상 × 사이즈)는 날짜 × 브랜드별 최근 파일만 · 최근 3일치만 보관
-- 16 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================
alter table erp_cs_alloc add column if not exists at timestamptz;
alter table erp_cs_alloc add column if not exists by_name text;
alter table erp_cs_alloc add column if not exists file text;

create table if not exists erp_cs_close (
  d date not null, kind text not null default 'alloc',
  closed_at timestamptz, closed_by uuid, closed_name text,
  brands int, qty numeric,
  skip text[] not null default '{}',      -- 오늘 없음 브랜드
  primary key (d, kind)
);
alter table erp_cs_close enable row level security;
drop policy if exists p_sel on erp_cs_close;
create policy p_sel on erp_cs_close for select to authenticated using ((select erp_can('csdata', 'view')));

-- 관리자: 마감 해제 권한
update erp_roles set perms = jsonb_set(perms, '{csdata,close}', 'true'::jsonb)
  where id = 'admin' and perms ? 'csdata' and not (perms->'csdata' ? 'close');

-- 예전(16) 통째 상세는 지움 (날짜 · 브랜드 상세로 바뀜)
delete from erp_cs_part where kind = 'alloc' and brand is null;

-- 브랜드 단위 바꿔 넣기
--  p_brands: 이 파일에 든 브랜드 · p_rows: [{d, brand, k, qty, stores, lines}] (브랜드 줄만) · p_parts: [{d, brand, rows}]
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
  delete from erp_cs_part where kind = 'alloc' and sub < ((now() at time zone 'Asia/Seoul')::date - 3)::text; -- 최근 3일치만
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

-- 오늘 없음 (마감 대상에서 빼기 · 되돌리기)
create or replace function erp_cs_alloc_skip(p_d date, p_brand text, p_on boolean) returns text[]
language plpgsql security definer set search_path = public as $$
declare s text[];
begin
  if not erp_can('csdata', 'create') then raise exception '전산자료 올리기 권한이 없습니다'; end if;
  if exists (select 1 from erp_cs_close where d = p_d and kind = 'alloc' and closed_at is not null) then raise exception '이미 마감된 날짜입니다'; end if;
  insert into erp_cs_close(d, kind) values (p_d, 'alloc') on conflict do nothing;
  update erp_cs_close set skip = case when p_on then array(select distinct unnest(array_append(skip, p_brand))) else array_remove(skip, p_brand) end
    where d = p_d and kind = 'alloc' returning skip into s;
  return s;
end $$;
-- 마감 (p_on = true) · 마감 해제 (false · 관리자)
create or replace function erp_cs_alloc_close(p_d date, p_on boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if p_on then
    if not erp_can('csdata', 'create') then raise exception '마감 권한이 없습니다'; end if;
    insert into erp_cs_close(d, kind) values (p_d, 'alloc') on conflict do nothing;
    update erp_cs_close set closed_at = now(), closed_by = auth.uid(), closed_name = (select name from erp_profiles where id = auth.uid()),
      brands = (select count(*) from erp_cs_alloc where d = p_d and brand <> '' and brand not like '미등록%' and k = 'all'),
      qty = (select coalesce(sum(qty), 0) from erp_cs_alloc where d = p_d and brand <> '' and k = 'all')
      where d = p_d and kind = 'alloc' and closed_at is null;
    return 'closed';
  else
    if not erp_can('csdata', 'close') then raise exception '마감 해제는 관리자만 할 수 있습니다'; end if;
    update erp_cs_close set closed_at = null, closed_by = null, closed_name = null where d = p_d and kind = 'alloc';
    return 'opened';
  end if;
end $$;
grant execute on function erp_cs_alloc_skip(date, text, boolean) to authenticated; revoke execute on function erp_cs_alloc_skip(date, text, boolean) from anon;
grant execute on function erp_cs_alloc_close(date, boolean) to authenticated; revoke execute on function erp_cs_alloc_close(date, boolean) from anon;
