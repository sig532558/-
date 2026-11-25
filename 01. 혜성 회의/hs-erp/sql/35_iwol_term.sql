-- =====================================================================
-- 35. 이월팀 — 운영 기간(상·하반기) · 마감 확정 · 안 끝난 것 다음 기간으로 넘기기
--     (2026-11-25 행님 승인 "2안")
--  · 33_iwol.sql 의 표에 [운영 기간] 칸을 더합니다. 이미 넣으신 자료는 지금 기간(2026 하반기)으로 붙습니다.
--  · [마감 확정] 을 누르면 ① 그 기간을 잠그고 ② 아직 안 끝난 것만 다음 기간으로 자동 복사합니다.
--  · 마감한 기간도 보기는 그대로 됩니다. 고치는 것만 막힙니다 (관리자는 마감 해제 가능).
-- 33 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================

-- ---------- ① 운영 기간 표 ----------
create table if not exists erp_iw_term (
  term  text primary key,              -- 2026H1 · 2026H2
  label text not null,                 -- 2026 상반기
  closed boolean default false,
  closed_at timestamptz, closed_by text,
  created_at timestamptz default now()
);

-- 지금 기간 (1~6월 = 상반기 · 7~12월 = 하반기)
create or replace function erp_iw_cur_term() returns text
language sql stable set search_path = public as $$
  select to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY')
      || case when extract(month from (now() at time zone 'Asia/Seoul')::date) <= 6 then 'H1' else 'H2' end
$$;
create or replace function erp_iw_next_term(t text) returns text
language sql immutable set search_path = public as $$
  select case when right(t, 2) = 'H1' then left(t, 4) || 'H2'
              else to_char((left(t, 4)::int + 1), 'FM0000') || 'H1' end
$$;
create or replace function erp_iw_term_label(t text) returns text
language sql immutable set search_path = public as $$
  select left(t, 4) || case when right(t, 2) = 'H1' then ' 상반기' else ' 하반기' end
$$;
-- 기간 줄이 없으면 만든다
create or replace function erp_iw_term_add(t text) returns void
language sql security definer set search_path = public as $$
  insert into erp_iw_term(term, label) values (t, erp_iw_term_label(t)) on conflict (term) do nothing
$$;
-- 마감된 기간인가 (쓰기 정책에서 씀)
create or replace function erp_iw_closed(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select closed from erp_iw_term where term = t), false)
$$;
grant execute on function erp_iw_cur_term() to authenticated;
grant execute on function erp_iw_next_term(text) to authenticated;
grant execute on function erp_iw_term_label(text) to authenticated;
grant execute on function erp_iw_closed(text) to authenticated;
revoke all on function erp_iw_term_add(text) from public;

-- ---------- ② 표마다 [운영 기간] 칸 더하기 · 열쇠 바꾸기 ----------
do $$
declare t text; cur text := erp_iw_cur_term();
begin
  foreach t in array array['erp_iw_ord','erp_iw_shp','erp_iw_inv','erp_iw_cnt','erp_iw_sst','erp_iw_man','erp_iw_band'] loop
    execute format('alter table %I add column if not exists term text', t);
    execute format('update %I set term = %L where term is null or term = ''''', t, cur);
    execute format('alter table %I alter column term set default erp_iw_cur_term()', t);
    execute format('alter table %I alter column term set not null', t);
  end loop;
  -- 열쇠에 기간을 넣는다 (같은 품번이 기간마다 따로 있을 수 있으므로)
  alter table erp_iw_ord drop constraint if exists erp_iw_ord_pkey;
  alter table erp_iw_ord add primary key (term, style);
  alter table erp_iw_shp drop constraint if exists erp_iw_shp_pkey;
  alter table erp_iw_shp add primary key (term, source_key);
  alter table erp_iw_inv drop constraint if exists erp_iw_inv_pkey;
  alter table erp_iw_inv add primary key (term, style);
  alter table erp_iw_cnt drop constraint if exists erp_iw_cnt_pkey;
  alter table erp_iw_cnt add primary key (term, source_key);
  alter table erp_iw_sst drop constraint if exists erp_iw_sst_pkey;
  alter table erp_iw_sst add primary key (kind, term, gkey);
  alter table erp_iw_man drop constraint if exists erp_iw_man_pkey;
  alter table erp_iw_man add primary key (kind, term, grp, d);
end $$;
create index if not exists erp_iw_ord_t on erp_iw_ord(term);
create index if not exists erp_iw_shp_t on erp_iw_shp(term);
create index if not exists erp_iw_inv_t on erp_iw_inv(term);
create index if not exists erp_iw_cnt_t on erp_iw_cnt(term);
create index if not exists erp_iw_band_t on erp_iw_band(term);

-- 지금 기간 · 다음 기간 줄을 만들어 둔다
select erp_iw_term_add(erp_iw_cur_term());

-- ---------- ③ RLS ----------
alter table erp_iw_term enable row level security;
drop policy if exists p_sel on erp_iw_term; drop policy if exists p_ins on erp_iw_term;
drop policy if exists p_upd on erp_iw_term; drop policy if exists p_del on erp_iw_term;
create policy p_sel on erp_iw_term for select to authenticated using ((select erp_can('iwol', 'view')));
-- 마감 · 해제는 아래 함수로만 (손으로 못 고침)

-- 자료 표: 마감된 기간에는 쓰지 못하게 한 겹 더
do $$
declare t text;
begin
  foreach t in array array['erp_iw_ord','erp_iw_shp','erp_iw_inv','erp_iw_cnt','erp_iw_sst','erp_iw_man','erp_iw_band'] loop
    execute format('drop policy if exists p_ins on %I', t);
    execute format('drop policy if exists p_upd on %I', t);
    execute format('drop policy if exists p_del on %I', t);
    execute format('create policy p_ins on %I for insert to authenticated with check ((select erp_can(''iwol'', ''create'')) and (''이월소터팀'' = any(erp_my_teams()) or (select erp_can(''users'', ''edit''))) and not erp_iw_closed(term))', t);
    execute format('create policy p_upd on %I for update to authenticated using ((select erp_can(''iwol'', ''create'')) and (''이월소터팀'' = any(erp_my_teams()) or (select erp_can(''users'', ''edit''))) and not erp_iw_closed(term))', t);
    execute format('create policy p_del on %I for delete to authenticated using ((select erp_can(''iwol'', ''create'')) and (''이월소터팀'' = any(erp_my_teams()) or (select erp_can(''users'', ''edit''))) and not erp_iw_closed(term))', t);
  end loop;
end $$;

-- ---------- ④ 마감하면 무엇이 넘어가나 (미리 보기) ----------
--  배분지시: 지시(매장 · 온라인 · 잔량) − 그 품번 출고 = 남은 수량 (0 보다 크면 넘김)
--  정리 기준: 정리 대상 − 그 품번 정리 실적 = 남은 수량 (0 보다 크면 넘김)
create or replace function erp_iw_carry(p_term text)
returns table (kind text, style text, brand text, season text, cls text, grp text, a numeric, b numeric, c numeric)
language sql stable security definer set search_path = public as $$
  with sh as (
    select style, sum(case when kind = 'store' then qty else 0 end) s,
           sum(case when kind = 'online' then qty else 0 end) o,
           sum(case when kind = 'rest' then qty else 0 end) r
    from erp_iw_shp where term = p_term group by style
  ), ord as (
    select 'ord'::text kind, d.style, d.brand, d.season, d.cls, d.grp,
           greatest(coalesce(d.store, 0) - coalesce(sh.s, 0), 0) a,
           greatest(coalesce(d.online, 0) - coalesce(sh.o, 0), 0) b,
           greatest(coalesce(d.rest, 0) - coalesce(sh.r, 0), 0) c
    from erp_iw_ord d left join sh on sh.style = d.style where d.term = p_term
  ), ct as (
    select style, sum(qty) q from erp_iw_cnt where term = p_term group by style
  ), inv as (
    select 'inv'::text kind, v.style, v.brand, v.season, v.cls, v.grp,
           greatest(coalesce(v.qty, 0) - coalesce(ct.q, 0), 0) a, 0::numeric b, 0::numeric c
    from erp_iw_inv v left join ct on ct.style = v.style where v.term = p_term
  )
  select * from ord where a + b + c > 0
  union all
  select * from inv where a > 0
$$;
grant execute on function erp_iw_carry(text) to authenticated;

create or replace function erp_iw_close_preview(p_term text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'term', p_term, 'next', erp_iw_next_term(p_term),
    'closed', erp_iw_closed(p_term),
    'ord_styles', (select count(*) from erp_iw_carry(p_term) where kind = 'ord'),
    'ord_qty',    (select coalesce(sum(a + b + c), 0) from erp_iw_carry(p_term) where kind = 'ord'),
    'inv_styles', (select count(*) from erp_iw_carry(p_term) where kind = 'inv'),
    'inv_qty',    (select coalesce(sum(a), 0) from erp_iw_carry(p_term) where kind = 'inv'),
    'ord_all',    (select count(*) from erp_iw_ord where term = p_term),
    'inv_all',    (select count(*) from erp_iw_inv where term = p_term),
    'shp_rows',   (select count(*) from erp_iw_shp where term = p_term),
    'cnt_rows',   (select count(*) from erp_iw_cnt where term = p_term)
  )
$$;
grant execute on function erp_iw_close_preview(text) to authenticated;

-- ---------- ⑤ 마감 확정 ----------
create or replace function erp_iw_close(p_term text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare nx text; n1 int := 0; n2 int := 0; me text;
begin
  -- 마감 확정은 관리자만 (2026-11-25 행님께 보여 드린 기본값 그대로 · 이월소터팀은 자료만 올림)
  if not erp_can('users', 'edit') then raise exception '마감 확정은 관리자만 할 수 있습니다'; end if;
  if erp_iw_closed(p_term) then raise exception '이미 마감한 기간입니다'; end if;
  if (select count(*) from erp_iw_ord where term = p_term) = 0
     and (select count(*) from erp_iw_inv where term = p_term) = 0
    then raise exception '이 기간에는 올린 자료가 없습니다'; end if;

  nx := erp_iw_next_term(p_term);
  perform erp_iw_term_add(p_term); perform erp_iw_term_add(nx);
  me := (select name from erp_profiles where id = auth.uid());

  -- 안 끝난 배분지시를 다음 기간으로 (이미 그 기간에 있으면 덮어쓰지 않고 그대로 둔다)
  insert into erp_iw_ord (term, style, brand, season, cls, grp, store, online, rest)
    select nx, style, brand, season, cls, grp, a, b, c from erp_iw_carry(p_term) where kind = 'ord'
    on conflict (term, style) do nothing;
  get diagnostics n1 = row_count;

  -- 안 끝난 정리 기준을 다음 기간으로
  insert into erp_iw_inv (term, style, brand, season, cls, grp, qty)
    select nx, style, brand, season, cls, grp, a from erp_iw_carry(p_term) where kind = 'inv'
    on conflict (term, style) do nothing;
  get diagnostics n2 = row_count;

  update erp_iw_term set closed = true, closed_at = now(), closed_by = me where term = p_term;
  return jsonb_build_object('term', p_term, 'next', nx, 'ord_moved', n1, 'inv_moved', n2);
end $$;
revoke all on function erp_iw_close(text) from public;
grant execute on function erp_iw_close(text) to authenticated;

-- ---------- ⑥ 마감 해제 (관리자만) ----------
create or replace function erp_iw_reopen(p_term text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not erp_can('users', 'edit') then raise exception '마감 해제는 관리자만 할 수 있습니다'; end if;
  update erp_iw_term set closed = false, closed_at = null, closed_by = null where term = p_term;
  if not found then raise exception '없는 기간입니다: %', p_term; end if;
  return jsonb_build_object('term', p_term, 'closed', false);
end $$;
revoke all on function erp_iw_reopen(text) from public;
grant execute on function erp_iw_reopen(text) to authenticated;
