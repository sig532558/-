-- =====================================================================
-- 혜성물류 운영 ERP — 전산자료 (모든 재고 · 출고지시 수량의 기준)
--  · WMS 재고 현황 (정상창고 · 반품창고) · ERP 재고 현황 (온라인 · 매장) · 출고 지시 (B2B · 온라인 크리스/LX)
--  · 품목별 상세는 "가장 최근 파일"만 (5천 줄 묶음으로 압축 저장) · 날짜별로는 브랜드 합계만 쌓음 → 저장 공간 절약
--  · 올리기: 전산자료 권한(create) = 지원팀 · 관리자 / 보기: 모든 직원
-- 01~12 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================

-- 올린 기록
create table if not exists erp_cs_file (
  id bigint generated always as identity primary key,
  kind text not null,                    -- wms · erp · order
  sub  text not null,                    -- 정상창고 · 반품창고 / 온라인 · 매장 / B2B · 크리스 · LX
  ref_date date,                         -- 자료 날짜 (출고지시 = 지시일 · 재고 = 올린 날)
  file_name text, rows int, qty numeric, summary jsonb,
  by_user uuid default auth.uid(), by_name text, at timestamptz default now()
);
create index if not exists erp_cs_file_k on erp_cs_file(kind, sub, at desc);

-- 최신 상세 (재고) — 압축 묶음: rows = [[브랜드, 품번, 색상, 사이즈, 로케이션, 현재고, 출고, 미래발생분], …]
create table if not exists erp_cs_part (
  kind text not null, sub text not null, part int not null,
  rows jsonb, at timestamptz default now(),
  primary key (kind, sub, part)
);

-- 날짜별 브랜드 합계 (추이 · 어제 대비)
create table if not exists erp_cs_daily (
  d date not null, kind text not null, sub text not null, brand text not null,
  qty numeric, sku int, noloc int, noloc_qty numeric, out_qty numeric,
  primary key (d, kind, sub, brand)
);

-- 출고 지시 (날짜 · 구분 · 브랜드) — B2B: 판매 · 선지시 / 온라인: 건수 · 수량
create table if not exists erp_cs_order (
  d date not null, sub text not null, brand text not null,
  sale numeric, pre numeric, qty numeric, cnt numeric,
  primary key (d, sub, brand)
);

-- 아침 출고지시: 파일 값 · 손 수정 표시
alter table erp_orders add column if not exists src_qty numeric;
alter table erp_orders add column if not exists manual boolean default false;

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['erp_cs_file','erp_cs_part','erp_cs_daily','erp_cs_order'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists p_sel on %I', t);
    execute format('drop policy if exists p_ins on %I', t);
    execute format('drop policy if exists p_upd on %I', t);
    execute format('drop policy if exists p_del on %I', t);
    execute format('create policy p_sel on %I for select to authenticated using ((select erp_can(''csdata'', ''view'')))', t);
  end loop;
  -- 출고 지시는 화면에서 바로 저장 (전산자료 올리기 권한)
  create policy p_ins on erp_cs_order for insert to authenticated with check ((select erp_can('csdata', 'create')));
  create policy p_upd on erp_cs_order for update to authenticated using ((select erp_can('csdata', 'create')));
  create policy p_del on erp_cs_order for delete to authenticated using ((select erp_can('csdata', 'create')));
  create policy p_ins on erp_cs_file for insert to authenticated with check ((select erp_can('csdata', 'create')));
end $$;

-- 재고 파일 바꿔 넣기 (한 번에): 이전 상세 지우고 새 묶음 · 오늘 브랜드 합계 · 올린 기록
create or replace function erp_cs_replace(p_kind text, p_sub text, p_parts jsonb, p_daily jsonb, p_file text, p_rows int, p_qty numeric, p_summary jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare dd date := (now() at time zone 'Asia/Seoul')::date; fid bigint; i int := 0; x jsonb;
begin
  if not erp_can('csdata', 'create') then raise exception '전산자료 올리기 권한이 없습니다'; end if;
  if p_kind not in ('wms', 'erp') then raise exception '모르는 자료 종류: %', p_kind; end if;
  delete from erp_cs_part where kind = p_kind and sub = p_sub;
  for x in select * from jsonb_array_elements(coalesce(p_parts, '[]')) loop
    insert into erp_cs_part(kind, sub, part, rows, at) values (p_kind, p_sub, i, x, now()); i := i + 1;
  end loop;
  delete from erp_cs_daily where d = dd and kind = p_kind and sub = p_sub;
  insert into erp_cs_daily(d, kind, sub, brand, qty, sku, noloc, noloc_qty, out_qty)
    select dd, p_kind, p_sub, coalesce(y->>'brand', ''), (y->>'qty')::numeric, (y->>'sku')::int, (y->>'noloc')::int, (y->>'noloc_qty')::numeric, (y->>'out_qty')::numeric
    from jsonb_array_elements(coalesce(p_daily, '[]')) y;
  insert into erp_cs_file(kind, sub, ref_date, file_name, rows, qty, summary, by_name)
    values (p_kind, p_sub, dd, p_file, p_rows, p_qty, p_summary, (select name from erp_profiles where id = auth.uid())) returning id into fid;
  return fid;
end $$;
grant execute on function erp_cs_replace(text, text, jsonb, jsonb, text, int, numeric, jsonb) to authenticated;
revoke execute on function erp_cs_replace(text, text, jsonb, jsonb, text, int, numeric, jsonb) from anon;

-- 오래된 날짜별 합계 정리 (3년) — 저장 공간
create or replace function erp_cs_trim() returns int language sql security definer set search_path = public as $$
  with d as (delete from erp_cs_daily where d < (now() at time zone 'Asia/Seoul')::date - 1095 returning 1) select count(*)::int from d
$$;

-- ---------- 등급별 기본 권한 (이미 있으면 유지) ----------
update erp_roles set perms = perms || '{"csdata":{"view":true,"create":true}}'::jsonb where id in ('admin', 'support') and not perms ? 'csdata';
update erp_roles set perms = perms || '{"csdata":{"view":true}}'::jsonb where id in ('ceo', 'leader', 'staff') and not perms ? 'csdata';
