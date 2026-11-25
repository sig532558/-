-- =====================================================================
-- 혜성물류 운영 ERP — 재고 실사: 필요 없는 실사 삭제 (현장 팀장 가능) · 7일 안 되살리기
--  · 진행 중 실사: 재고 실사 "삭제" 권한 (관리자 · 현장 팀장 기본)
--  · 확정된 실사: 마감 권한(close) = 관리자만
--  · 지운 실사는 7일 보관 → 관리자가 되살리기 · 7일 지나면 완전히 지움
--  · 실사 · 재실사 파일: 삭제 권한이 있으면 다른 조가 올린 파일도 지울 수 있음
-- 14 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================
alter table erp_cnt add column if not exists deleted_at timestamptz;
alter table erp_cnt add column if not exists deleted_by uuid;
alter table erp_cnt add column if not exists deleted_name text;

-- 현장 팀장: 실사 삭제 권한 (이미 정해 둔 값이 있으면 그대로)
update erp_roles set perms = jsonb_set(perms, '{count,delete}', 'true'::jsonb)
  where id = 'leader' and perms ? 'count' and not (perms->'count' ? 'delete');

-- 지운 실사에는 자료를 더 올리지 못함 (관리자 제외)
create or replace function erp_cnt_open(p_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select status <> '확정' and deleted_at is null from erp_cnt where id = p_id), true) or erp_can('count','close')
$$;

-- 지우기 (휴지통으로)
create or replace function erp_cnt_trash(p_id text) returns text
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if not erp_can('count', 'delete') then raise exception '실사 삭제 권한이 없습니다'; end if;
  select * into c from erp_cnt where id = p_id;
  if c.id is null then raise exception '실사를 찾을 수 없습니다'; end if;
  if c.status = '확정' and not erp_can('count', 'close') then raise exception '확정된 실사는 관리자만 삭제할 수 있습니다'; end if;
  update erp_cnt set deleted_at = now(), deleted_by = auth.uid(), deleted_name = (select name from erp_profiles where id = auth.uid()) where id = p_id;
  delete from erp_cnt where deleted_at < now() - interval '7 days'; -- 7일 지난 것은 완전히 지움
  return c.name;
end $$;
-- 되살리기 (관리자)
create or replace function erp_cnt_restore(p_id text) returns text
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  if not erp_can('count', 'close') then raise exception '되살리기는 관리자만 할 수 있습니다'; end if;
  update erp_cnt set deleted_at = null, deleted_by = null, deleted_name = null where id = p_id and deleted_at is not null returning name into n;
  if n is null then raise exception '지운 실사가 아니거나 7일이 지나 완전히 지워졌습니다'; end if;
  return n;
end $$;
grant execute on function erp_cnt_trash(text) to authenticated; revoke execute on function erp_cnt_trash(text) from anon;
grant execute on function erp_cnt_restore(text) to authenticated; revoke execute on function erp_cnt_restore(text) from anon;

-- 완전 삭제는 관리자만 (팀장은 휴지통으로만)
drop policy if exists p_del on erp_cnt;
create policy p_del on erp_cnt for delete to authenticated using (erp_can('count','close'));
-- 실사 · 재실사 파일: 삭제 권한이 있으면 다른 조 파일도
drop policy if exists p_del on erp_cnt_part;
create policy p_del on erp_cnt_part for delete to authenticated using (erp_cnt_open(cnt_id) and (erp_can('count','create') or (kind in ('act','re') and erp_can('count','upload') and (uploaded_by = auth.uid() or erp_can('count','delete')))));
