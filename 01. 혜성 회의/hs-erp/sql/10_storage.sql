-- =====================================================================
-- 혜성물류 운영 ERP — ① 안성 추가 자료 3가지  ② 저장 공간 기록 (누적 · 하루 사용 · 한도 예상일)
--  ① 반품검수 박스별(returns) · 소터 스타일별(sorter) · 수불·재고(inventory) — [받을 항목 고르기]에서 켠 것만 받음
--     줄이 많은 자료라 기본 최근 3개월만 보관 (안성 원본은 그대로 → 필요하면 언제든 다시 받기)
--  ② 매일 00:10(한국) DB · 파일 용량을 기록 → 하루 사용량 · 500MB 도달 예상일 계산
-- 01~09 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================

-- ---------- ① 안성 추가 자료 ----------
create table if not exists erp_as_ret (
  work_date date not null, box text not null default '', store text, store_name text, order_no text, kind text,
  plan_qty numeric, sent_qty numeric, rfid_qty numeric, nonrfid_qty numeric, sku_cnt numeric,
  confirmed boolean, confirmed_at text, fetched_at timestamptz default now()
);
create index if not exists erp_as_ret_d on erp_as_ret(work_date);
create table if not exists erp_as_sorter (
  date date not null, style text not null default '', qty numeric, fetched_at timestamptz default now(), primary key (date, style)
);
create table if not exists erp_as_inv_daily (
  date date not null, kind text not null default '', qty numeric, fetched_at timestamptz default now(), primary key (date, kind)
);
-- 스타일별 수불 · 장소별 재고: 마지막으로 받은 기간 것만 (기간마다 값이 달라서 계속 쌓지 않음)
create table if not exists erp_as_inv_flow (
  style text primary key, opening numeric, qty_in numeric, qty_out numeric, closing numeric, p_from date, p_to date, fetched_at timestamptz default now()
);
create table if not exists erp_as_inv_stock (
  style text not null, place text not null default '', qty numeric, as_of date, fetched_at timestamptz default now(), primary key (style, place)
);

-- 받을 항목 · 보관 기간 (기본: 처음 4가지 · 3개월)
insert into erp_settings(key, value) values ('anseong_opts', '{"types":["daily","ship","transfer","staff"],"keep_months":3}') on conflict (key) do nothing;

create or replace function erp_as_store_i(p_type text, p_from date, p_to date, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare rows jsonb := coalesce(p -> 'rows', case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end); n int := 0; cur date;
begin
  if p_type = 'daily' then
    delete from erp_as_daily where date between p_from and p_to;
    insert into erp_as_daily(date, return_qty, return_boxes, sorter_qty, ship_boxes, ship_qty, transfer_boxes, transfer_qty, heads, heads_etc)
      select (x->>'date')::date, (x->>'return_qty')::numeric, (x->>'return_boxes')::numeric, (x->>'sorter_qty')::numeric, (x->>'ship_boxes')::numeric, (x->>'ship_qty')::numeric,
             (x->>'transfer_boxes')::numeric, (x->>'transfer_qty')::numeric, (x->>'heads')::numeric, (x->>'heads_etc')::numeric
      from jsonb_array_elements(rows) x where x->>'date' is not null
      on conflict (date) do update set return_qty = excluded.return_qty, return_boxes = excluded.return_boxes, sorter_qty = excluded.sorter_qty, ship_boxes = excluded.ship_boxes, ship_qty = excluded.ship_qty,
        transfer_boxes = excluded.transfer_boxes, transfer_qty = excluded.transfer_qty, heads = excluded.heads, heads_etc = excluded.heads_etc, fetched_at = now();
  elsif p_type = 'ship' then
    delete from erp_as_ship where date between p_from and p_to;
    insert into erp_as_ship(date, courier, plt, boxes, boxes_metro, boxes_local, stores, qty, confirmed, confirmed_at)
      select (x->>'date')::date, coalesce(x->>'courier', ''), (x->>'plt')::numeric, (x->>'boxes')::numeric, (x->>'boxes_metro')::numeric, (x->>'boxes_local')::numeric, (x->>'stores')::numeric, (x->>'qty')::numeric, (x->>'confirmed')::boolean, x->>'confirmed_at'
      from jsonb_array_elements(rows) x where x->>'date' is not null
      on conflict (date, courier) do update set plt = excluded.plt, boxes = excluded.boxes, boxes_metro = excluded.boxes_metro, boxes_local = excluded.boxes_local, stores = excluded.stores, qty = excluded.qty, confirmed = excluded.confirmed, confirmed_at = excluded.confirmed_at, fetched_at = now();
  elsif p_type = 'transfer' then
    delete from erp_as_transfer where date between p_from and p_to;
    insert into erp_as_transfer(date, carrier, plt, boxes, qty, styles, confirmed, confirmed_at)
      select (x->>'date')::date, coalesce(x->>'carrier', ''), (x->>'plt')::numeric, (x->>'boxes')::numeric, (x->>'qty')::numeric, (x->>'styles')::numeric, (x->>'confirmed')::boolean, x->>'confirmed_at'
      from jsonb_array_elements(rows) x where x->>'date' is not null
      on conflict (date, carrier) do update set plt = excluded.plt, boxes = excluded.boxes, qty = excluded.qty, styles = excluded.styles, confirmed = excluded.confirmed, confirmed_at = excluded.confirmed_at, fetched_at = now();
  elsif p_type = 'staff' then
    delete from erp_as_staff where date between p_from and p_to;
    insert into erp_as_staff(date, item, heads, overtime_heads, overtime_hours, note)
      select (x->>'date')::date, coalesce(x->>'item', ''), (x->>'heads')::numeric, (x->>'overtime_heads')::numeric, (x->>'overtime_hours')::numeric, x->>'note'
      from jsonb_array_elements(rows) x where x->>'date' is not null
      on conflict (date, item) do update set heads = excluded.heads, overtime_heads = excluded.overtime_heads, overtime_hours = excluded.overtime_hours, note = excluded.note, fetched_at = now();
  elsif p_type = 'returns' then
    delete from erp_as_ret where work_date between p_from and p_to;
    insert into erp_as_ret(work_date, box, store, store_name, order_no, kind, plan_qty, sent_qty, rfid_qty, nonrfid_qty, sku_cnt, confirmed, confirmed_at)
      select (x->>'work_date')::date, coalesce(x->>'box', ''), x->>'store', x->>'store_name', x->>'order_no', x->>'kind', (x->>'plan_qty')::numeric, (x->>'sent_qty')::numeric, (x->>'rfid_qty')::numeric,
             (x->>'nonrfid_qty')::numeric, (x->>'sku_cnt')::numeric, case upper(coalesce(x->>'confirmed', '')) when 'Y' then true when 'TRUE' then true when 'N' then false when 'FALSE' then false end, x->>'confirmed_at'
      from jsonb_array_elements(rows) x where (x->>'work_date')::date between p_from and p_to;
  elsif p_type = 'sorter' then
    delete from erp_as_sorter where date between p_from and p_to;
    insert into erp_as_sorter(date, style, qty)
      select (x->>'date')::date, coalesce(x->>'style', ''), sum((x->>'qty')::numeric) from jsonb_array_elements(rows) x where x->>'date' is not null group by 1, 2
      on conflict (date, style) do update set qty = excluded.qty, fetched_at = now();
  elsif p_type = 'inventory' then
    if jsonb_typeof(rows) <> 'object' then raise exception '수불 자료 형식이 다릅니다 (flow · stock · daily 묶음)'; end if;
    delete from erp_as_inv_daily where date between p_from and p_to;
    insert into erp_as_inv_daily(date, kind, qty)
      select (x->>'date')::date, coalesce(x->>'kind', ''), sum((x->>'qty')::numeric) from jsonb_array_elements(coalesce(rows->'daily', '[]')) x where x->>'date' is not null group by 1, 2
      on conflict (date, kind) do update set qty = excluded.qty, fetched_at = now();
    -- 스타일별 · 장소별은 가장 최근 기간(끝 날짜가 같거나 늦을 때)만 바꿈
    select max(f.p_to) into cur from erp_as_inv_flow f;
    if cur is null or p_to >= cur then
      delete from erp_as_inv_flow where true;
      insert into erp_as_inv_flow(style, opening, qty_in, qty_out, closing, p_from, p_to)
        select coalesce(x->>'style', ''), sum((x->>'opening')::numeric), sum((x->>'in')::numeric), sum((x->>'out')::numeric), sum((x->>'closing')::numeric), p_from, p_to
        from jsonb_array_elements(coalesce(rows->'flow', '[]')) x group by 1;
      delete from erp_as_inv_stock where true;
      insert into erp_as_inv_stock(style, place, qty, as_of)
        select coalesce(x->>'style', ''), coalesce(x->>'place', ''), sum((x->>'qty')::numeric), p_to from jsonb_array_elements(coalesce(rows->'stock', '[]')) x group by 1, 2;
    end if;
    return coalesce(jsonb_array_length(rows->'flow'), 0) + coalesce(jsonb_array_length(rows->'stock'), 0) + coalesce(jsonb_array_length(rows->'daily'), 0);
  else raise exception '모르는 자료 종류: %', p_type;
  end if;
  return jsonb_array_length(rows);
end $$;
revoke execute on function erp_as_store_i(text, date, date, jsonb) from public, anon, authenticated;

-- 받기: 종류를 안 주면 [받을 항목]에서 고른 것 (자동 받기도 이것)
drop function if exists erp_as_pull(date, date, text[]);
create or replace function erp_as_pull(p_from date default current_date - 7, p_to date default current_date, p_types text[] default null) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare cfg jsonb; hk text; d1 date; d2 date; t text; rid bigint; n int := 0; tps text[] := p_types;
begin
  if auth.uid() is not null and not erp_can('anseong', 'edit') then raise exception '안성 연동 권한이 없습니다'; end if;
  select v into hk from erp_secret where k = 'anseong_hq_key';
  if hk is null or hk = '' then raise exception '본사 전용 열쇠(hq_)가 아직 등록되지 않았습니다'; end if;
  select s.value into cfg from erp_settings s where s.key = 'anseong_api';
  if cfg is null or coalesce(cfg->>'url', '') = '' then raise exception '안성 API 주소가 설정되지 않았습니다'; end if;
  if p_to < p_from then raise exception '기간이 잘못되었습니다'; end if;
  if tps is null then select array(select jsonb_array_elements_text(s.value->'types')) into tps from erp_settings s where s.key = 'anseong_opts'; end if;
  if tps is null or cardinality(tps) = 0 then tps := array['daily','ship','transfer','staff']; end if;
  d1 := p_from;
  while d1 <= p_to loop
    d2 := least(p_to, d1 + 92);
    foreach t in array tps loop
      select net.http_post(url := cfg->>'url', body := jsonb_build_object('p_type', t, 'p_from', d1, 'p_to', d2),
        headers := jsonb_build_object('apikey', cfg->>'apikey', 'x-hq-key', hk, 'Content-Type', 'application/json'), timeout_milliseconds := 30000) into rid;
      insert into erp_as_req(id, p_type, p_from, p_to, by_name) values (rid, t, d1, d2, coalesce((select name from erp_profiles where id = auth.uid()), '자동'))
        on conflict (id) do update set p_type = excluded.p_type, p_from = excluded.p_from, p_to = excluded.p_to, at = now(), done = false, status = null, msg = null;
      n := n + 1;
    end loop;
    d1 := d2 + 1;
  end loop;
  return n;
end $$;
grant execute on function erp_as_pull(date, date, text[]) to authenticated;
revoke execute on function erp_as_pull(date, date, text[]) from anon;

-- 받을 항목 · 보관 개월 저장 (안성 연동 수정 권한)
create or replace function erp_as_set_opts(p_types text[], p_keep int default 3) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not erp_can('anseong', 'edit') then raise exception '안성 연동 설정 권한이 없습니다'; end if;
  if exists(select 1 from unnest(p_types) t where t not in ('daily','ship','transfer','staff','returns','sorter','inventory')) then raise exception '모르는 자료 종류가 있습니다'; end if;
  if 'daily' <> all(p_types) then p_types := array['daily'] || p_types; end if; -- 날짜별 요약은 항상
  v := jsonb_build_object('types', to_jsonb(p_types), 'keep_months', greatest(1, least(36, coalesce(p_keep, 3))));
  insert into erp_settings(key, value) values ('anseong_opts', v) on conflict (key) do update set value = excluded.value;
  return v;
end $$;

-- 오래된 안성 상세 자료 정리 (반품검수 · 소터 · 날짜별 수불) — 자동(매일) · 화면 [지금 정리]
create or replace function erp_as_trim(p_keep int default null) returns int
language plpgsql security definer set search_path = public as $$
declare k int := p_keep; cut date; a int; b int; c int;
begin
  if auth.uid() is not null and not erp_can('anseong', 'edit') then raise exception '안성 연동 설정 권한이 없습니다'; end if;
  if k is null then select (s.value->>'keep_months')::int into k from erp_settings s where s.key = 'anseong_opts'; end if;
  k := greatest(1, coalesce(k, 3)); cut := ((now() at time zone 'Asia/Seoul')::date - make_interval(months => k))::date;
  delete from erp_as_ret where work_date < cut; get diagnostics a = row_count;
  delete from erp_as_sorter where date < cut; get diagnostics b = row_count;
  delete from erp_as_inv_daily where date < cut; get diagnostics c = row_count;
  return a + b + c;
end $$;
grant execute on function erp_as_set_opts(text[], int), erp_as_trim(int) to authenticated;
revoke execute on function erp_as_set_opts(text[], int), erp_as_trim(int) from anon;

do $$
declare t text;
begin
  foreach t in array array['erp_as_ret','erp_as_sorter','erp_as_inv_daily','erp_as_inv_flow','erp_as_inv_stock'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists p_sel on %I', t);
    execute format('create policy p_sel on %I for select to authenticated using (erp_can(''anseong'',''view''))', t);
  end loop;
end $$;

-- ---------- ② 저장 공간 기록 ----------
create table if not exists erp_usage_log (
  d date primary key,                    -- 한국 날짜
  db_bytes bigint, file_bytes bigint, tables jsonb, at timestamptz default now()
);
alter table erp_usage_log enable row level security;
drop policy if exists p_sel on erp_usage_log;
create policy p_sel on erp_usage_log for select to authenticated using (erp_can('users','view'));

create or replace function erp_usage_files() returns bigint
language plpgsql stable security definer set search_path = public as $$
declare b bigint := 0;
begin
  begin execute 'select coalesce(sum((metadata->>''size'')::bigint), 0) from storage.objects' into b; exception when others then b := null; end;
  return b;
end $$;
revoke execute on function erp_usage_files() from public, anon, authenticated;

create or replace function erp_usage_tables() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', t.relname, 'bytes', t.b) order by t.b desc), '[]'::jsonb)
  from (select c.relname, pg_total_relation_size(c.oid) as b from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'erp\_%') t
$$;
revoke execute on function erp_usage_tables() from public, anon, authenticated;

-- 오늘 기록 (자동 00:10 · 화면 [지금 다시 재기]) — 같은 날 다시 재면 덮어씀
create or replace function erp_usage_snap() returns jsonb
language plpgsql security definer set search_path = public as $$
declare dd date := (now() at time zone 'Asia/Seoul')::date; r jsonb;
begin
  if auth.uid() is not null and not erp_can('users', 'view') then raise exception '권한이 없습니다'; end if;
  insert into erp_usage_log(d, db_bytes, file_bytes, tables, at) values (dd, pg_database_size(current_database()), erp_usage_files(), erp_usage_tables(), now())
    on conflict (d) do update set db_bytes = excluded.db_bytes, file_bytes = excluded.file_bytes, tables = excluded.tables, at = now();
  select to_jsonb(l) into r from erp_usage_log l where l.d = dd; return r;
end $$;

-- 화면용: 지금 용량 + 최근 120일 기록 (표는 이름 · 용량만)
create or replace function erp_usage() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not erp_can('users', 'view') then return null; end if;
  return jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'limit_bytes', 500 * 1024 * 1024,
    'file_bytes', erp_usage_files(),
    'file_limit', 1024 * 1024 * 1024,
    'tables', (select coalesce(jsonb_agg(y.value), '[]'::jsonb) from (select e.value from jsonb_array_elements(erp_usage_tables()) e limit 40) y),
    'hist', (select coalesce(jsonb_agg(jsonb_build_object('d', h.d, 'db', h.db_bytes, 'file', h.file_bytes, 'tables', h.tables, 'at', h.at) order by h.d), '[]'::jsonb)
             from (select * from erp_usage_log where d >= (now() at time zone 'Asia/Seoul')::date - 120) h),
    'cron', exists(select 1 from pg_extension where extname = 'pg_cron')
  );
end $$;
grant execute on function erp_usage(), erp_usage_snap() to authenticated;
revoke execute on function erp_usage(), erp_usage_snap() from anon;

-- ---------- 자동 예약 (UTC: 15:10 = 한국 00:10 · 15:20 = 한국 00:20) ----------
do $$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('erp_as_pull_pm', 'erp_as_pull_am', 'erp_usage_snap', 'erp_as_trim');
    perform cron.schedule('erp_as_pull_pm', '30 9 * * *', $c$select erp_as_pull(current_date - 7, current_date, null) where exists(select 1 from erp_secret where k = 'anseong_hq_key')$c$);
    perform cron.schedule('erp_as_pull_am', '30 23 * * *', $c$select erp_as_pull(current_date - 7, current_date, null) where exists(select 1 from erp_secret where k = 'anseong_hq_key')$c$);
    perform cron.schedule('erp_usage_snap', '10 15 * * *', $c$select erp_usage_snap()$c$);
    perform cron.schedule('erp_as_trim', '20 15 * * *', $c$select erp_as_trim()$c$);
  end if;
exception when others then raise notice '자동 예약 실패: %', sqlerrm;
end $$;
select erp_usage_snap(); -- 설치하는 날 첫 기록
