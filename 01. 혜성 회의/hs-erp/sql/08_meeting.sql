-- =====================================================================
-- 혜성물류 운영 ERP — 월간 회의 · 물동량(월마감 정산) · 소모품/부자재 발주 · 공지 사항
-- 01~07 실행 후 실행. 여러 번 실행해도 안전합니다. (수량만 저장 · 금액 없음)
-- =====================================================================

-- 물동량: 화주 × 일자 × 공정 (정산 파일의 '정산' 블록 수량)
create table if not exists erp_volume (
  rec_date date not null,
  owner text not null,                   -- 크리스 · LX · 로라 · 슈퍼웍스
  proc text not null,                    -- 입고 · 입고반품 · 출고 · 반품 · 쿠팡출고 · B2B→B2C · B2C→B2B · RT반출 · RT반입 · B2C고객출고 · B2C고객반품
  qty numeric not null default 0,
  updated_by uuid default auth.uid(), updated_at timestamptz default now(),
  primary key (rec_date, owner, proc)
);
create index if not exists erp_volume_date on erp_volume(rec_date);

-- 월간 회의: 팀별 특이사항 · 공유사항
create table if not exists erp_meet_note (
  ym text not null,                      -- 2026-09
  sect text not null,                    -- 입고팀 · 정상팀 … · 연차
  body text,
  updated_by uuid default auth.uid(), updated_at timestamptz default now(),
  primary key (ym, sect)
);

-- 현장 소모품 · 부자재 발주 (요청 → 승인 → 발주 → 입고)
create table if not exists erp_supply (
  id bigint generated always as identity primary key,
  kind text not null default 'supply' check (kind in ('supply','material')),
  req_date date default current_date,
  team text, item text not null, brand text, qty numeric default 0, unit text, need_date date,
  status text not null default '요청' check (status in ('요청','승인','반려','발주','입고')),
  memo text, reply text,
  req_by uuid default auth.uid(), req_name text,
  appr_at timestamptz, order_at timestamptz, recv_at timestamptz, recv_name text,
  updated_by uuid default auth.uid(), updated_at timestamptz default now()
);
create index if not exists erp_supply_kind on erp_supply(kind, req_date);
create table if not exists erp_supply_item (
  kind text not null default 'supply',
  item text not null,
  brand text, unit text, spec text, safe_qty numeric, sort int, active boolean default true,
  updated_by uuid default auth.uid(), updated_at timestamptz default now(),
  primary key (kind, item)
);

-- 공지 사항 (+ 읽음 확인)
create table if not exists erp_notice (
  id bigint generated always as identity primary key,
  title text not null, body text,
  targets text[],                        -- 비우면 전체 · 팀 이름 목록
  pin boolean default false,
  created_by uuid default auth.uid(), created_name text, created_at timestamptz default now(),
  updated_by uuid default auth.uid(), updated_at timestamptz default now()
);
create table if not exists erp_notice_read (
  notice_id bigint not null references erp_notice(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  at timestamptz default now(),
  primary key (notice_id, user_id)
);

create or replace function erp_touch4() returns trigger language plpgsql as $$ begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
do $$
declare t text;
begin
  foreach t in array array['erp_volume','erp_meet_note','erp_supply','erp_supply_item','erp_notice'] loop
    execute format('drop trigger if exists t_touch on %I', t);
    execute format('create trigger t_touch before update on %I for each row execute function erp_touch4()', t);
  end loop;
end $$;

-- 발주: 요청한 사람은 '요청' 상태일 때만 내용 수정 · 상태(승인·발주·입고)는 관리 권한(edit)만
create or replace function erp_supply_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if erp_can('supply','edit') then return new; end if;
  if tg_op = 'INSERT' then new.status := '요청'; new.req_by := auth.uid(); return new; end if;
  if old.req_by is distinct from auth.uid() then raise exception '내가 요청한 건만 수정할 수 있습니다'; end if;
  if old.status = '발주' and new.status = '입고' then new.recv_at := coalesce(new.recv_at, now()); return new; end if; -- 요청한 팀이 입고 확인
  if old.status <> '요청' then raise exception '이미 처리된 요청은 수정할 수 없습니다'; end if;
  if new.status is distinct from old.status then raise exception '승인 · 발주는 관리팀만 할 수 있습니다'; end if;
  return new;
end $$;
drop trigger if exists t_supply_guard on erp_supply;
create trigger t_supply_guard before insert or update on erp_supply for each row execute function erp_supply_guard();

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['erp_volume','erp_meet_note','erp_supply','erp_supply_item','erp_notice','erp_notice_read'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists p_sel on %I', t);
    execute format('drop policy if exists p_ins on %I', t);
    execute format('drop policy if exists p_upd on %I', t);
    execute format('drop policy if exists p_del on %I', t);
  end loop;
end $$;
create policy p_sel on erp_volume for select to authenticated using (erp_can('volume','view') or erp_can('meeting','view'));
create policy p_ins on erp_volume for insert to authenticated with check (erp_can('volume','create'));
create policy p_upd on erp_volume for update to authenticated using (erp_can('volume','create'));
create policy p_del on erp_volume for delete to authenticated using (erp_can('volume','create'));
create policy p_sel on erp_meet_note for select to authenticated using (erp_can('meeting','view'));
create policy p_ins on erp_meet_note for insert to authenticated with check (erp_can('meeting','edit'));
create policy p_upd on erp_meet_note for update to authenticated using (erp_can('meeting','edit'));
create policy p_del on erp_meet_note for delete to authenticated using (erp_can('meeting','edit'));
create policy p_sel on erp_supply for select to authenticated using (erp_can('supply','view'));
create policy p_ins on erp_supply for insert to authenticated with check (erp_can('supply','create') or erp_can('supply','edit'));
create policy p_upd on erp_supply for update to authenticated using (erp_can('supply','edit') or (erp_can('supply','create') and req_by = auth.uid()));
create policy p_del on erp_supply for delete to authenticated using (erp_can('supply','delete') or (erp_can('supply','create') and req_by = auth.uid() and status = '요청'));
create policy p_sel on erp_supply_item for select to authenticated using (erp_can('supply','view'));
create policy p_ins on erp_supply_item for insert to authenticated with check (erp_can('supply','edit'));
create policy p_upd on erp_supply_item for update to authenticated using (erp_can('supply','edit'));
create policy p_del on erp_supply_item for delete to authenticated using (erp_can('supply','edit'));
create policy p_sel on erp_notice for select to authenticated using ((erp_me()).active);
create policy p_ins on erp_notice for insert to authenticated with check (erp_can('notice','create'));
create policy p_upd on erp_notice for update to authenticated using (erp_can('notice','edit'));
create policy p_del on erp_notice for delete to authenticated using (erp_can('notice','delete'));
create policy p_sel on erp_notice_read for select to authenticated using (user_id = auth.uid() or erp_can('notice','create'));
create policy p_ins on erp_notice_read for insert to authenticated with check (user_id = auth.uid() and (erp_me()).active);

-- ---------- 실시간 ----------
do $$
declare t text;
begin
  foreach t in array array['erp_meet_note','erp_supply','erp_notice'] loop
    begin execute format('alter publication supabase_realtime add table %I', t); exception when others then null; end;
  end loop;
end $$;

-- ---------- 등급별 기본 권한 (이미 있으면 유지) ----------
update erp_roles set perms = perms || '{"meeting":{"view":true,"edit":true},"volume":{"view":true,"create":true},"supply":{"view":true,"create":true,"edit":true,"delete":true},"notice":{"view":true,"create":true,"edit":true,"delete":true}}'::jsonb where id = 'admin' and not perms ? 'meeting';
update erp_roles set perms = perms || '{"meeting":{"view":true},"volume":{"view":true},"supply":{"view":true},"notice":{"view":true}}'::jsonb where id = 'ceo' and not perms ? 'meeting';
update erp_roles set perms = perms || '{"meeting":{"view":true,"edit":true},"volume":{"view":true,"create":true},"supply":{"view":true,"create":true},"notice":{"view":true,"create":true,"edit":true}}'::jsonb where id = 'support' and not perms ? 'meeting';
update erp_roles set perms = perms || '{"meeting":{"view":true,"edit":true},"volume":{"view":true},"supply":{"view":true,"create":true},"notice":{"view":true}}'::jsonb where id = 'leader' and not perms ? 'meeting';
update erp_roles set perms = perms || '{"supply":{"view":true,"create":true},"notice":{"view":true}}'::jsonb where id = 'staff' and not perms ? 'supply';

-- ---------- 월 합계 (화면이 일별 수만 줄을 내려받지 않게) · 읽기 권한(RLS)은 그대로 적용 ----------
create or replace function erp_volume_month(p_from date, p_to date) returns table(ym text, owner text, proc text, qty numeric)
language sql stable set search_path = public as $$
  select to_char(rec_date, 'YYYY-MM'), owner, proc, sum(qty) from erp_volume where rec_date between p_from and p_to group by 1, 2, 3
$$;
create or replace function erp_worklog_month(p_from date, p_to date) returns table(ym text, team text, qty numeric, to_count numeric, days bigint)
language sql stable set search_path = public as $$
  select to_char(work_date, 'YYYY-MM'), team, sum(qty), sum(to_count), count(distinct work_date) from erp_worklog where work_date between p_from and p_to group by 1, 2
$$;
grant execute on function erp_volume_month(date, date), erp_worklog_month(date, date) to authenticated;
-- 물동량 바꿔 넣기: 화주 · 기간을 지우고 새 값으로 (한 번에 · 권한은 RLS 그대로)
create or replace function erp_volume_replace(p_owner text, p_from date, p_to date, p_rows jsonb) returns int
language plpgsql set search_path = public as $$
declare n int;
begin
  if not erp_can('volume','create') then raise exception '물동량 올리기 권한이 없습니다'; end if;
  delete from erp_volume where owner = p_owner and rec_date between p_from and p_to;
  insert into erp_volume(rec_date, owner, proc, qty)
    select (x->>'rec_date')::date, p_owner, x->>'proc', (x->>'qty')::numeric from jsonb_array_elements(p_rows) x
    on conflict (rec_date, owner, proc) do update set qty = excluded.qty;
  get diagnostics n = row_count; return n;
end $$;
grant execute on function erp_volume_replace(text, date, date, jsonb) to authenticated;
