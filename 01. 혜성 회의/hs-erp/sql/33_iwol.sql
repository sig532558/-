-- =====================================================================
-- 33. 이월팀 — 시즌반품정리현황 · 선지시출고현황 (2026-11-24 행님 지시)
--  · 이월팀 단독판(이월팀_출고관리_단독판.html)을 사이트로 옮긴 것입니다.
--  · 2026-11-23 에 폐기한 옛 시즌 계획(erp_season · erp_season_act)과는 **다른 표**입니다.
--    옛 자료는 건드리지 않습니다.
--  · 보기 = 모든 직원 · 올리기 · 고치기 = 이월소터팀 + 관리자 (2026-11-24 행님 결정)
--  · 단가 · 금액은 어떤 칸에도 담지 않습니다 (엑셀에 있어도 읽지 않고 버립니다).
-- 01~32 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================

-- ① 배분지시 — 품번 한 줄 (같은 품번을 다시 올리면 덮어씀)
create table if not exists erp_iw_ord (
  style  text primary key,
  brand  text, season text, cls text, grp text,
  store  numeric default 0,            -- 매장지시
  online numeric default 0,            -- 온라인지시
  rest   numeric default 0,            -- 배분잔량
  at timestamptz default now()
);

-- ② 출고 실적 — 한 줄 = 한 출고 (열쇠: 송장번호·매장코드·출고구분·품번·색상·사이즈·날짜)
create table if not exists erp_iw_shp (
  source_key text primary key,
  d date, style text, color text, sz text,
  brand text, season text, grp text,
  kind text,                           -- store · online · rest
  qty numeric,
  at timestamptz default now()
);
create index if not exists erp_iw_shp_d on erp_iw_shp(d);

-- ③ 정리 기준 (WMS 재고현황) — 품번 한 줄
create table if not exists erp_iw_inv (
  style text primary key,
  brand text, season text, cls text, grp text, qty numeric,
  at timestamptz default now()
);

-- ④ 정리 실적 (WMS 재고실사현황) — 열쇠: 품번·색상·사이즈·날짜
create table if not exists erp_iw_cnt (
  source_key text primary key,
  d date, style text, color text, sz text,
  brand text, season text, grp text, qty numeric,
  at timestamptz default now()
);
create index if not exists erp_iw_cnt_d on erp_iw_cnt(d);

-- ⑤ 기준값 — key = 'out'(선지시 출고 일정) · 'ret'(시즌 정리 일정)
create table if not exists erp_iw_set (
  key text primary key, val jsonb, at timestamptz default now()
);

-- ⑥ 손으로 고친 줄별 시작일 — kind = out · ret
create table if not exists erp_iw_sst (
  kind text not null, gkey text not null, start_date date,
  primary key (kind, gkey)
);

-- ⑦ 날짜별 투입 인원
create table if not exists erp_iw_man (
  kind text not null, grp text not null, d date not null, people numeric,
  primary key (kind, grp, d)
);

-- ⑧ 상단 일정 띠 (③ 출고 일정 · ⑤ 정리 일정이 같이 씀)
create table if not exists erp_iw_band (
  id text primary key,
  lane int, s date, e date, label text, color text,
  at timestamptz default now()
);

-- ---------- RLS ----------
--  보기: 모든 직원(iwol.view) · 쓰기: 이월소터팀 + 관리자(scope all)
do $$
declare t text;
begin
  foreach t in array array['erp_iw_ord','erp_iw_shp','erp_iw_inv','erp_iw_cnt','erp_iw_set','erp_iw_sst','erp_iw_man','erp_iw_band'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists p_sel on %I', t);
    execute format('drop policy if exists p_ins on %I', t);
    execute format('drop policy if exists p_upd on %I', t);
    execute format('drop policy if exists p_del on %I', t);
    execute format('create policy p_sel on %I for select to authenticated using ((select erp_can(''iwol'', ''view'')))', t);
    --  쓰기 = iwol.create 권한 + (이월소터팀 사람 또는 관리자)
    --   ⚠ erp_team_ok 은 '전체 권한'(scope all)이면 어느 팀이든 참이라 지원팀까지 열린다 →
    --     팀 이름을 직접 보고, 관리자는 users.edit(관리자만 가진 권한)으로 가린다
    --  ⚠ any() 안에 (select …) 를 넣으면 PostgreSQL 이 글자를 배열로 읽으려다 터진다 — 함수를 바로 쓸 것
    execute format('create policy p_ins on %I for insert to authenticated with check ((select erp_can(''iwol'', ''create'')) and (''이월소터팀'' = any(erp_my_teams()) or (select erp_can(''users'', ''edit''))))', t);
    execute format('create policy p_upd on %I for update to authenticated using ((select erp_can(''iwol'', ''create'')) and (''이월소터팀'' = any(erp_my_teams()) or (select erp_can(''users'', ''edit''))))', t);
    execute format('create policy p_del on %I for delete to authenticated using ((select erp_can(''iwol'', ''create'')) and (''이월소터팀'' = any(erp_my_teams()) or (select erp_can(''users'', ''edit''))))', t);
  end loop;
end $$;

-- ---------- 등급별 기본 권한 (이미 있으면 그대로 둠) ----------
--  보기는 전체 공개 · 올리기는 위 정책에서 이월소터팀 · 관리자로 한 번 더 걸러집니다.
update erp_roles set perms = perms || '{"iwol":{"view":true,"create":true}}'::jsonb
  where id in ('admin', 'support', 'leader', 'staff') and not perms ? 'iwol';
update erp_roles set perms = perms || '{"iwol":{"view":true}}'::jsonb
  where id = 'ceo' and not perms ? 'iwol';
