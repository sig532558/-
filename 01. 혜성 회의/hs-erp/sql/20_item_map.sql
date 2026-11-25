-- =====================================================================
-- 혜성물류 운영 ERP — 품번 규칙 (아이템 코드 → 아이템군)
--  · 기본 59개 코드는 프로그램 안에 들어 있음 (style.js)
--  · 새 코드: 아이템군 칸이 있는 파일을 올리면 자동으로 배움 (확인 필요 표시)
--  · 관리자는 기준정보 설정 › 품번 규칙에서 고치기 · 확인 (erp_settings 'item_map')
-- 19 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================
insert into erp_settings(key, value) values ('item_map', '{}'::jsonb) on conflict (key) do nothing;

-- 자료 올리는 사람(전산자료 · 신상품 · 재고 실사)이 새 코드만 추가 — 이미 있는 코드는 절대 바꾸지 않음
create or replace function erp_item_learn(p_codes jsonb, p_from text) returns int
language plpgsql security definer set search_path = public as $$
declare cur jsonb; k text; v jsonb; n int := 0;
begin
  if not (erp_can('csdata', 'create') or erp_can('newprod', 'create') or erp_can('count', 'create') or erp_can('settings', 'edit')) then
    raise exception '자료 올리기 권한이 없습니다';
  end if;
  if jsonb_typeof(coalesce(p_codes, '{}'::jsonb)) <> 'object' then return 0; end if;
  insert into erp_settings(key, value) values ('item_map', '{}'::jsonb) on conflict (key) do nothing;
  select value into cur from erp_settings where key = 'item_map' for update;
  cur := coalesce(cur, '{}'::jsonb);
  for k, v in select * from jsonb_each(p_codes) loop
    exit when n >= 50;
    continue when k !~ '^[A-Z]{2}$' or cur ? k;
    continue when coalesce(v->>'g', '') !~ '^[1-5]$';
    cur := cur || jsonb_build_object(k, jsonb_build_object('g', (v->>'g')::int, 'n', left(coalesce(v->>'n', ''), 40), 'src', 'learn', 'ok', false,
      'at', to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD'), 'from', left(coalesce(p_from, ''), 60)));
    n := n + 1;
  end loop;
  if n > 0 then update erp_settings set value = cur where key = 'item_map'; end if;
  return n;
end $$;
revoke execute on function erp_item_learn(jsonb, text) from public, anon;
grant execute on function erp_item_learn(jsonb, text) to authenticated;
