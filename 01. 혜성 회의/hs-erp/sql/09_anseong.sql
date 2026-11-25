-- =====================================================================
-- 혜성물류 운영 ERP — 안성센터 자료 API (hq_export) 연동
--  · ERP 서버(이 DB)가 직접 안성 API를 불러 저장합니다 → 본사 전용 열쇠(hq_)는 DB 안에만 있고 직원 화면으로 나가지 않음
--  · 매일 18:30 · 08:30 (한국 시간) 최근 7일 자동으로 다시 받기 (pg_net · pg_cron)
--  · 받는 자료: 날짜별 요약(daily) · 출고(ship) · 포승이관(transfer) · 인원(staff)  — 금액 없음 · 보기 전용
-- 01~08 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================
do $$ begin create extension if not exists pg_net; exception when others then raise notice 'pg_net 사용 불가: %', sqlerrm; end $$;
do $$ begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron 사용 불가: %', sqlerrm; end $$;

-- 비밀 보관 (아무도 직접 못 읽음 · 정해진 함수만 사용)
create table if not exists erp_secret (k text primary key, v text, updated_at timestamptz default now());
alter table erp_secret enable row level security;
revoke all on erp_secret from anon, authenticated;

-- 받은 자료
create table if not exists erp_as_daily (
  date date primary key,
  return_qty numeric, return_boxes numeric, sorter_qty numeric, ship_boxes numeric, ship_qty numeric,
  transfer_boxes numeric, transfer_qty numeric, heads numeric, heads_etc numeric,
  fetched_at timestamptz default now()
);
create table if not exists erp_as_ship (
  date date not null, courier text not null default '', plt numeric, boxes numeric, boxes_metro numeric, boxes_local numeric, stores numeric, qty numeric,
  confirmed boolean, confirmed_at text, fetched_at timestamptz default now(), primary key (date, courier)
);
create table if not exists erp_as_transfer (
  date date not null, carrier text not null default '', plt numeric, boxes numeric, qty numeric, styles numeric,
  confirmed boolean, confirmed_at text, fetched_at timestamptz default now(), primary key (date, carrier)
);
create table if not exists erp_as_staff (
  date date not null, item text not null, heads numeric, overtime_heads numeric, overtime_hours numeric, note text,
  fetched_at timestamptz default now(), primary key (date, item)
);
-- 요청 기록 (보낸 요청 → 응답 처리)
create table if not exists erp_as_req (
  id bigint primary key,                 -- pg_net 요청 번호
  p_type text, p_from date, p_to date,
  at timestamptz default now(), done boolean default false, status int, rows int, msg text, by_name text
);

-- 받은 JSON 저장: 그 기간은 새 값으로 바꿈 (늦게 올라온 자료 · 고친 값 반영)
create or replace function erp_as_store_i(p_type text, p_from date, p_to date, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare rows jsonb := coalesce(p -> 'rows', case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end); n int := 0;
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
  else raise exception '모르는 자료 종류: %', p_type;
  end if;
  get diagnostics n = row_count; return jsonb_array_length(rows);
end $$;
revoke execute on function erp_as_store_i(text, date, date, jsonb) from public, anon, authenticated;
-- 화면에서 직접 넣기 (안성 연동 수정 권한) · 시험 · 비상용
create or replace function erp_as_store(p_type text, p_from date, p_to date, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not erp_can('anseong', 'edit') then raise exception '안성 연동 권한이 없습니다'; end if;
  return erp_as_store_i(p_type, p_from, p_to, p);
end $$;

-- 요청 보내기: 기간을 93일씩 나눠 자료 종류별로 (pg_net · 비동기) → 몇 초 뒤 erp_as_collect 가 저장
create or replace function erp_as_pull(p_from date default current_date - 7, p_to date default current_date, p_types text[] default array['daily','ship','transfer','staff']) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare cfg jsonb; hk text; d1 date; d2 date; t text; rid bigint; n int := 0;
begin
  if auth.uid() is not null and not erp_can('anseong', 'edit') then raise exception '안성 연동 권한이 없습니다'; end if;
  select v into hk from erp_secret where k = 'anseong_hq_key';
  if hk is null or hk = '' then raise exception '본사 전용 열쇠(hq_)가 아직 등록되지 않았습니다'; end if;
  select s.value into cfg from erp_settings s where s.key = 'anseong_api';
  if cfg is null or coalesce(cfg->>'url', '') = '' then raise exception '안성 API 주소가 설정되지 않았습니다'; end if;
  if p_to < p_from then raise exception '기간이 잘못되었습니다'; end if;
  d1 := p_from;
  while d1 <= p_to loop
    d2 := least(p_to, d1 + 92);
    foreach t in array p_types loop
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

-- 응답 처리: 도착한 응답을 저장 (자동: 2분마다 · 화면: [지금 가져오기] 뒤)
create or replace function erp_as_collect() returns int
language plpgsql security definer set search_path = public, extensions as $$
declare r record; resp record; n int := 0; c int; body jsonb;
begin
  if auth.uid() is not null and not erp_can('anseong', 'view') then raise exception '권한이 없습니다'; end if;
  for r in select * from erp_as_req where not done order by id loop
    select status_code, content, error_msg into resp from net._http_response where id = r.id;
    if not found then
      if r.at < now() - interval '10 minutes' then update erp_as_req set done = true, msg = '응답 없음 (시간 초과)' where id = r.id; end if;
      continue;
    end if;
    begin
      if resp.status_code = 200 then
        body := resp.content::jsonb; c := erp_as_store_i(r.p_type, r.p_from, r.p_to, body);
        update erp_as_req set done = true, status = 200, rows = c, msg = null where id = r.id; n := n + 1;
      else
        update erp_as_req set done = true, status = resp.status_code, msg = left(coalesce(resp.error_msg, '') || ' ' || coalesce(resp.content, ''), 300) where id = r.id;
      end if;
    exception when others then update erp_as_req set done = true, status = coalesce(resp.status_code, 0), msg = left(sqlerrm, 300) where id = r.id;
    end;
  end loop;
  return n;
end $$;

-- 열쇠 등록 (관리자 · 관리자 IP) · 상태 보기 (열쇠는 끝 4자리만)
create or replace function erp_as_set_key(p_key text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not erp_can('anseong', 'edit') or not erp_ip_ok() then raise exception '안성 연동 설정 권한이 없습니다 (관리자 · 허용된 접속 주소)'; end if;
  if p_key is null or p_key = '' then delete from erp_secret where k = 'anseong_hq_key'; return 'removed'; end if;
  if p_key !~ '^hq_' then raise exception '본사 전용 열쇠는 hq_ 로 시작합니다'; end if;
  insert into erp_secret(k, v, updated_at) values ('anseong_hq_key', p_key, now()) on conflict (k) do update set v = excluded.v, updated_at = now();
  return 'ok';
end $$;
create or replace function erp_as_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not erp_can('anseong', 'view') then null else jsonb_build_object(
    'key_set', exists(select 1 from erp_secret where k = 'anseong_hq_key' and coalesce(v, '') <> ''),
    'key_tail', (select right(v, 4) from erp_secret where k = 'anseong_hq_key'),
    'key_at', (select updated_at from erp_secret where k = 'anseong_hq_key'),
    'net', exists(select 1 from pg_extension where extname = 'pg_net'),
    'cron', exists(select 1 from pg_extension where extname = 'pg_cron'),
    'last', (select jsonb_agg(x) from (select id, p_type, p_from, p_to, at, done, status, rows, msg, by_name from erp_as_req order by at desc, id desc limit 12) x),
    'max_date', (select max(date) from erp_as_daily), 'min_date', (select min(date) from erp_as_daily)
  ) end
$$;
grant execute on function erp_as_pull(date, date, text[]), erp_as_collect(), erp_as_set_key(text), erp_as_status(), erp_as_store(text, date, date, jsonb) to authenticated;
revoke execute on function erp_as_pull(date, date, text[]), erp_as_collect(), erp_as_set_key(text), erp_as_store(text, date, date, jsonb) from anon;

-- 기본 주소 · 공개키 (안성센터 안내 문서 · 공개키라 화면에 보여도 됨)
insert into erp_settings(key, value) values ('anseong_api', '{"url":"https://auhxzdfaqironsxmpxoe.supabase.co/rest/v1/rpc/hq_export","apikey":"sb_publishable_X_NgqsWuWyoTSD_MYfinWw_JkzGqhpp"}')
on conflict (key) do nothing;

-- ---------- RLS: 받은 자료는 안성 연동 보기 권한 ----------
do $$
declare t text;
begin
  foreach t in array array['erp_as_daily','erp_as_ship','erp_as_transfer','erp_as_staff','erp_as_req'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists p_sel on %I', t);
    execute format('create policy p_sel on %I for select to authenticated using (erp_can(''anseong'',''view''))', t);
  end loop;
end $$;

-- ---------- 자동 받기 (pg_cron · UTC 기준: 09:30 = 한국 18:30 · 23:30 = 한국 08:30) ----------
do $$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('erp_as_pull_pm', 'erp_as_pull_am', 'erp_as_collect');
    perform cron.schedule('erp_as_pull_pm', '30 9 * * *', $c$select erp_as_pull(current_date - 7, current_date) where exists(select 1 from erp_secret where k = 'anseong_hq_key')$c$);
    perform cron.schedule('erp_as_pull_am', '30 23 * * *', $c$select erp_as_pull(current_date - 7, current_date) where exists(select 1 from erp_secret where k = 'anseong_hq_key')$c$);
    perform cron.schedule('erp_as_collect', '*/2 * * * *', $c$select erp_as_collect() where exists(select 1 from erp_as_req where not done)$c$);
  end if;
exception when others then raise notice '자동 받기 예약 실패: %', sqlerrm;
end $$;
