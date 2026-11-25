-- =====================================================================
-- 혜성물류 운영 ERP — 반품 관리 (매장 반품 등록 · 고백센터 반품 확정 · 행낭/타택배 대장)
-- 01~06 실행 후 실행. 여러 번 실행해도 안전합니다.
-- 저장 공간 절약: 반품 확정(하루 수백 전표)은 날짜×브랜드 합계만, 매장 반품은 아직 확정 안 된(미처리) 줄만 저장
-- =====================================================================

-- 고백센터 반품 확정 (화주 ERP '출고 반품 현황') → 확정일(출고일자) × 브랜드 합계
create table if not exists erp_ret_done (
  rec_date date not null,
  brand text not null,
  slips int not null default 0,          -- 전표 수 (줄 수)
  pcs numeric not null default 0,        -- 수량 (반품이라 음수로 받은 것을 양수로 저장)
  updated_by uuid default auth.uid(), updated_at timestamptz default now(),
  primary key (rec_date, brand)
);
create index if not exists erp_ret_done_date on erp_ret_done(rec_date);

-- 매장 반품 등록 (화주 ERP '의뢰 대비 출고 반품 현황') → 브랜드별 미처리(아직 출고 확정 안 된) 줄
create table if not exists erp_ret_pend (
  brand text primary key,
  req_from date, req_to date,            -- 마지막으로 올린 파일의 의뢰일 범위
  req_slips int default 0, req_pcs numeric default 0,  -- 그 범위의 의뢰 합계 (참고)
  rows jsonb not null default '[]'::jsonb, -- [{d:의뢰일, no:의뢰번호, store:매장, req:의뢰수량, out:출고수량, pend:미출고수량, slip:전표바코드}]
  updated_by uuid default auth.uid(), updated_at timestamptz default now()
);

-- 행낭 · 타택배 반품 (수작업 등록)
create table if not exists erp_ret_bag (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('행낭','타택배')),
  rec_date date,
  courier text,                          -- 택배사 (타택배)
  gubun text,                            -- 구분 (반품 · 샘플 · 행낭 등)
  brand text, confirmed text, store text,
  box numeric default 0,
  note text,
  status text, check_date date, checker text, client_note text, proc_date date, proc_by text, proc_note text, -- 타택배 처리 칸
  source_key text unique,
  updated_by uuid default auth.uid(), updated_at timestamptz default now()
);
create index if not exists erp_ret_bag_date on erp_ret_bag(kind, rec_date);

create or replace function erp_touch3() returns trigger language plpgsql as $$ begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists t_touch on erp_ret_done; create trigger t_touch before update on erp_ret_done for each row execute function erp_touch3();
drop trigger if exists t_touch on erp_ret_pend; create trigger t_touch before update on erp_ret_pend for each row execute function erp_touch3();
drop trigger if exists t_touch on erp_ret_bag; create trigger t_touch before update on erp_ret_bag for each row execute function erp_touch3();

-- ---------- RLS (반품 관리 권한 'returns') ----------
do $$
declare t text;
begin
  foreach t in array array['erp_ret_done','erp_ret_pend','erp_ret_bag'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists p_sel on %I', t);
    execute format('drop policy if exists p_ins on %I', t);
    execute format('drop policy if exists p_upd on %I', t);
    execute format('drop policy if exists p_del on %I', t);
    execute format('create policy p_sel on %I for select to authenticated using (erp_can(''returns'',''view''))', t);
    execute format('create policy p_ins on %I for insert to authenticated with check (erp_can(''returns'',''create''))', t);
    execute format('create policy p_upd on %I for update to authenticated using (erp_can(''returns'',''create'') or erp_can(''returns'',''edit''))', t);
    execute format('create policy p_del on %I for delete to authenticated using (erp_can(''returns'',''delete''))', t);
  end loop;
end $$;
-- 행낭·타택배: 잘못 넣은 줄은 입력한 사람도 지울 수 있음
drop policy if exists p_del on erp_ret_bag;
create policy p_del on erp_ret_bag for delete to authenticated using (erp_can('returns','delete') or (erp_can('returns','create') and updated_by = auth.uid()));

-- ---------- 실시간 ----------
do $$
declare t text;
begin
  foreach t in array array['erp_ret_done','erp_ret_pend','erp_ret_bag'] loop
    begin execute format('alter publication supabase_realtime add table %I', t); exception when others then null; end;
  end loop;
end $$;
