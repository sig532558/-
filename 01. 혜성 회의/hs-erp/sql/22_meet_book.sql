-- =====================================================================
-- 월간회의 — 회의 자료 엑셀(보라색 탭 = 대표님 보고서 · 다른 색 탭 = 근거 데이터)을 달마다 저장
--  · idx 0 = 책 정보(제목 · 첫 장 핵심 숫자 · 시트 목록) · 1~ = 보고서 시트 · 100~ = 근거 데이터 시트
--  · 엑셀 모양(색 · 굵기 · 병합 · 숫자 서식)을 화면용으로 바꾼 자료만 저장 (원본 파일은 저장하지 않음)
-- 21 실행 후 실행. 여러 번 실행해도 안전합니다.
-- =====================================================================
create table if not exists erp_meet_book (
  ym text not null,                 -- 2026-11
  idx int not null,
  kind text not null default 'main' check (kind in ('book','main','data')),
  name text not null default '',
  color text,
  body jsonb not null default '{}'::jsonb,
  file_name text,
  updated_by uuid default auth.uid(), updated_at timestamptz default now(),
  primary key (ym, idx)
);
alter table erp_meet_book enable row level security;
drop policy if exists p_sel on erp_meet_book; drop policy if exists p_ins on erp_meet_book; drop policy if exists p_upd on erp_meet_book; drop policy if exists p_del on erp_meet_book;
create policy p_sel on erp_meet_book for select to authenticated using (erp_can('meeting','view'));
create policy p_ins on erp_meet_book for insert to authenticated with check (erp_can('meeting','edit'));
create policy p_upd on erp_meet_book for update to authenticated using (erp_can('meeting','edit'));
create policy p_del on erp_meet_book for delete to authenticated using (erp_can('meeting','edit'));
drop trigger if exists t_touch on erp_meet_book;
create trigger t_touch before update on erp_meet_book for each row execute function erp_touch4();
revoke all on erp_meet_book from anon;
grant select, insert, update, delete on erp_meet_book to authenticated;
