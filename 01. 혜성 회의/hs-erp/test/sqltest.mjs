import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const q = async (s, p) => { try { return await db.query(s, p); } catch (e) { throw new Error(e.message + ' :: ' + s.slice(0, 120)); } };
await db.exec(`
create role authenticated; create role anon;
create schema auth;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create publication supabase_realtime;
grant usage on schema public to authenticated; grant usage on schema auth to authenticated;
`);
await db.exec(fs.readFileSync('sql/01_schema.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/02_security.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/03_extend.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/03_extend.sql', 'utf8')); // 두 번 실행해도 안전
await db.exec(fs.readFileSync('sql/04_views.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/04_views.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/05_firewall.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/05_firewall.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/06_count_season.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/06_count_season.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/07_returns.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/07_returns.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/08_meeting.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/08_meeting.sql', 'utf8'));
// pg_net 흉내 (시험용: 요청을 받으면 가짜 API 응답을 바로 만들어 줌)
await db.exec(`create schema if not exists net; create table if not exists net._http_response(id bigint primary key, status_code int, content text, error_msg text); create sequence if not exists net.s;
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language plpgsql as $f$
declare i bigint := nextval('net.s'); begin
  if headers->>'x-hq-key' <> 'hq_test1234' then insert into net._http_response values (i, 401, '{"message":"열쇠가 틀립니다"}', null); return i; end if;
  insert into net._http_response values (i, 200, case body->>'p_type'
    when 'daily' then '{"type":"daily","rows":[{"date":"2026-10-27","return_qty":5200,"return_boxes":310,"sorter_qty":4100,"ship_boxes":420,"ship_qty":8300,"transfer_boxes":60,"transfer_qty":1200,"heads":25,"heads_etc":2},{"date":"2026-10-28","return_qty":4800,"return_boxes":290,"sorter_qty":0,"ship_boxes":0,"ship_qty":0,"transfer_boxes":0,"transfer_qty":0,"heads":null,"heads_etc":null}]}'
    when 'ship' then '{"rows":[{"date":"2026-10-27","courier":"CJ","plt":4,"boxes":420,"boxes_metro":300,"boxes_local":120,"stores":61,"qty":8300,"confirmed":true,"confirmed_at":"2026-10-27 17:40"}]}'
    when 'transfer' then '{"rows":[{"date":"2026-10-27","carrier":"포승","plt":2,"boxes":60,"qty":1200,"styles":40,"confirmed":true}]}'
    when 'returns' then '{"rows":[{"work_date":"2026-10-27","box":"B001","store":"N101","store_name":"강남점","order_no":"3","kind":"시즌반품","plan_qty":30,"sent_qty":28,"rfid_qty":20,"nonrfid_qty":8,"sku_cnt":12,"confirmed":"Y"},{"work_date":"2026-10-27","box":"B002","store":"N102","store_name":"분당점","plan_qty":20,"sent_qty":20,"confirmed":"N"},{"work_date":"2026-06-01","box":"OLD","sent_qty":5,"confirmed":"Y"}]}'
    when 'sorter' then '{"rows":[{"date":"2026-10-27","style":"N1A","qty":100},{"date":"2026-10-27","style":"N1A","qty":50},{"date":"2026-10-27","style":"N2B","qty":70}]}'
    when 'inventory' then '{"rows":{"flow":[{"style":"N1A","opening":500,"in":150,"out":80,"closing":570}],"stock":[{"style":"N1A","place":"가동","qty":400},{"style":"N1A","place":"검수장","qty":170}],"daily":[{"date":"2026-10-27","kind":"반품확정","qty":5200},{"date":"2026-10-27","kind":"가용화","qty":4100}]}}'
    else '{"rows":[{"date":"2026-10-27","item":"반품확정","heads":12},{"date":"2026-10-27","item":"야근","heads":null,"overtime_heads":5,"overtime_hours":2}]}' end, null);
  return i; end $f$;`);
await db.exec(fs.readFileSync('sql/09_anseong.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/09_anseong.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/10_storage.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/10_storage.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/11_notice_pl.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/11_notice_pl.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/12_speed.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/12_speed.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/13_csdata.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/13_csdata.sql', 'utf8'));
await db.exec(`grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated; grant execute on all functions in schema public to authenticated; grant select on auth.users to authenticated;`);
const U = { admin: '00000000-0000-0000-0000-000000000001', sup: '00000000-0000-0000-0000-000000000002', lead: '00000000-0000-0000-0000-000000000003', staff: '00000000-0000-0000-0000-000000000004', other: '00000000-0000-0000-0000-000000000005' };
for (const k in U) await q(`insert into auth.users(id,email) values ($1,$2)`, [U[k], k + '@x']);
let AAL = 'aal2', IP = '';
const as = async (who, fn) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${U[who] || ''}',false); select set_config('request.jwt.claims','${JSON.stringify({ aal: AAL })}',false); select set_config('request.headers','${JSON.stringify(IP ? { 'cf-connecting-ip': IP } : {})}',false);`); try { return await fn(); } finally { await db.exec('reset role'); } };
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const fails = async (fn) => { try { await fn(); return false; } catch (e) { return e.message; } };
// 가입 신청
for (const [k, n] of [['admin', '배중열'], ['sup', '김영자'], ['lead', '서광범'], ['staff', '실무A'], ['other', '타팀']]) await as(k, () => q(`insert into erp_profiles(id,login_id,name) values (auth.uid(),$1,$2)`, [k, n]));
ok((await as('admin', () => q(`select erp_bootstrap_admin() r`))).rows[0].r === 'ok', '최초 관리자 지정');
ok((await as('sup', () => q(`select erp_bootstrap_admin() r`))).rows[0].r === 'already', '두번째 관리자 자동지정 차단');
ok(!!(await fails(() => as('sup', () => q(`update erp_profiles set role_id='admin', active=true where id=auth.uid()`)))), '본인 등급 셀프 변경 차단');
await as('admin', () => q(`update erp_profiles set role_id='support', active=true where login_id='sup'`));
await as('admin', () => q(`update erp_profiles set role_id='leader', active=true, teams='{정상1팀}' where login_id='lead'`));
await as('admin', () => q(`update erp_profiles set role_id='staff', active=true, teams='{정상1팀}' where login_id='staff'`));
await as('admin', () => q(`update erp_profiles set role_id='staff', active=true, teams='{온라인팀}' where login_id='other'`));
ok((await as('admin', () => q(`select count(*)::int n from erp_profiles where active`))).rows[0].n === 5, '관리자 승인 5명');
// 업무일지
await as('lead', () => q(`insert into erp_worklog(work_date,team,grp,task,unit_price,qty,to_count) values ('2026-10-19','정상1팀','출고','출고',188,11930,9.5)`));
ok(!!(await fails(() => as('lead', () => q(`insert into erp_worklog(work_date,team,grp,task,qty) values ('2026-10-19','온라인팀','출고','고객 출고',10)`)))), '현장팀장 다른 팀 업무일지 입력 차단');
ok(!!(await fails(() => as('staff', () => q(`insert into erp_worklog(work_date,team,grp,task,qty) values ('2026-10-19','정상1팀','출고','부자재출고',10)`)))), '실무진 업무일지 입력 차단');
ok(!!(await fails(() => as('lead', () => q(`insert into erp_locks(lock_date,module) values ('2026-10-19','worklog')`)))), '현장팀장 마감확정 차단(제출만 가능)');
await as('sup', () => q(`insert into erp_locks(lock_date,module) values ('2026-10-19','worklog')`));
ok(!!(await fails(async () => { const r = await as('lead', () => q(`update erp_worklog set qty=1 where work_date='2026-10-19' returning id`)); if (!r.rows.length) throw new Error('0 rows'); })), '마감 뒤 자료 수정 차단');
ok(!!(await fails(async () => { const r = await as('lead', () => q(`delete from erp_locks where lock_date='2026-10-19' returning lock_date`)); if (!r.rows.length) throw new Error('0 rows'); })), '자기 마감 해제 차단');
ok((await as('admin', () => q(`update erp_worklog set qty=12000 where work_date='2026-10-19' returning id`))).rows.length === 1, '관리자 마감 뒤 수정 가능');
// TO-DO
const t = (await as('sup', () => q(`insert into erp_tasks(task_type,brand,title,assigned_team,due_date) values ('오픈출고','핑','신규오픈 초도 출고','정상1팀','2026-10-21') returning id`))).rows[0].id;
ok((await as('lead', () => q(`select count(*)::int n from erp_notifications where kind='task_new'`))).rows[0].n === 1, '담당 팀에게 새 업무 알림');
ok((await as('other', () => q(`select count(*)::int n from erp_tasks`))).rows[0].n === 0, '타팀 실무진은 업무 안 보임');
ok(!!(await fails(async () => { const r = await as('other', () => q(`update erp_tasks set status='완료' where id=$1 returning id`, [t])); if (!r.rows.length) throw new Error('0'); })), '타팀 업무를 진행처리 차단');
await as('staff', () => q(`update erp_tasks set status='접수' where id=$1`, [t]));
await as('staff', () => q(`update erp_tasks set status='진행중', progress=60 where id=$1`, [t]));
ok(!!(await fails(() => as('staff', () => q(`update erp_tasks set title='변경' where id=$1`, [t])))), '실무진 업무내용 수정 차단');
await as('staff', () => q(`update erp_tasks set status='완료', result='182박스 출고' where id=$1`, [t]));
const tk = (await as('sup', () => q(`select status,progress,accepted_at is not null a,started_at is not null s,completed_at is not null c from erp_tasks where id=$1`, [t]))).rows[0];
ok(tk.progress === 100 && tk.a && tk.s && tk.c, '완료 시 진행률 100·시각 자동기록');
const n = (await as('sup', () => q(`select title,body from erp_notifications where kind='task_done'`))).rows;
ok(n.length === 1 && /완료/.test(n[0].title), '담당자에게 완료 알림 · ' + (n[0] && n[0].title + ' / ' + n[0].body));
ok((await as('sup', () => q(`select count(*)::int n from erp_task_events where task_id=$1`, [t]))).rows[0].n === 4, '진행 기록 4건');
ok((await as('lead', () => q(`select count(*)::int n from erp_notifications where kind='task_done'`))).rows[0].n === 0, '알림은 본인 것만 보임');
// 감사로그
ok((await as('admin', () => q(`select count(*)::int n from erp_audit where tbl='erp_worklog'`))).rows[0].n >= 2, '수정 이력 기록');
ok(!!(await fails(async () => { const r = await as('staff', () => q(`select * from erp_audit`)); if (!r.rows.length) throw new Error('0'); })), '실무진 감사로그 열람 차단');
// 등급 권한 변경 시 즉시 반영
await as('admin', () => q(`update erp_roles set perms = jsonb_set(perms,'{worklog,create}','true') where id='staff'`));
ok((await as('staff', () => q(`insert into erp_worklog(work_date,team,grp,task,qty) values ('2026-10-20','정상1팀','출고','부자재출고',10) returning id`))).rows.length === 1, '관리자가 실무진에 등록 권한 준 뒤 즉시 가능');
ok((await as('admin', () => q(`select count(*)::int n from erp_anseong_tables()`))).rows[0].n >= 0, '안성 테이블 목록 함수');
// upsert(ON CONFLICT) 경로 확인
await as('lead', () => q(`insert into erp_worklog(work_date,team,grp,task,unit_price,qty,to_count) values ('2026-10-21','정상1팀','출고','출고',188,100,2) on conflict (work_date,team,grp,task) do update set qty=excluded.qty`));
await as('lead', () => q(`insert into erp_worklog(work_date,team,grp,task,unit_price,qty,to_count) values ('2026-10-21','정상1팀','출고','출고',188,200,2) on conflict (work_date,team,grp,task) do update set qty=excluded.qty`));
ok((await as('lead', () => q(`select qty::int q from erp_worklog where work_date='2026-10-21'`))).rows[0].q === 200, '같은 업무일지 덮어쓰기(upsert)');
for (const v of [1, 2]) await as('sup', () => q(`insert into erp_daily_records(rec_date,section,rec_key,data) values ('2026-10-21','b2b','핑',$1) on conflict (rec_date,section,rec_key) do update set data=excluded.data`, [JSON.stringify({ out_qty: v })]));
ok((await as('sup', () => q(`select data->>'out_qty' v from erp_daily_records where rec_date='2026-10-21'`))).rows[0].v === '2', '업무지원팀 마감보고 upsert');
for (const v of ['요청', '완료']) await as('sup', () => q(`insert into erp_tasks(task_type,title,status,source,source_key,completed_at,assigned_by) values ('용차','마곡직영 31박스',$1,'dispatch','dispatch:abc','2026-01-08T18:00:00+09:00',null) on conflict (source_key) do update set status=excluded.status`, [v]));
ok((await as('sup', () => q(`select status, completed_at::text c from erp_tasks where source_key='dispatch:abc'`))).rows[0].c.startsWith('2026-01-08'), '엑셀 올린 업무 upsert · 완료시각 유지');
ok((await as('sup', () => q(`select count(*)::int n from erp_notifications where kind='task_done'`))).rows[0].n === 1, '엑셀 올린 완료건은 알림 안 보냄(담당자 없음)');
await as('sup', () => q(`insert into erp_teams(name,labor_cost) values ('정상1팀',160390) on conflict (name) do update set labor_cost=excluded.labor_cost`));
ok(true, '업무지원팀 엑셀 올리기로 팀 인건비 갱신');
await as('admin', () => q(`delete from erp_locks where lock_date='2026-10-19'`));
ok((await as('lead', () => q(`update erp_worklog set qty=1 where work_date='2026-10-19' returning id`))).rows.length === 1, '관리자 마감 해제 뒤 자료 수정 가능');

// ===== 추가 기능 (03_extend) =====
ok((await as('admin', () => q(`select perms ? 'orders' o, perms ? 'kpi' k, perms ? 'newprod' n from erp_roles where id='support'`))).rows[0].o, '기존 등급에 새 메뉴 권한 추가');
ok((await as('admin', () => q(`select en from erp_brands where name='마스터바니'`))).rows[0].en === 'MASTER BUNNY', '브랜드 영문명 채움');
// 출고지시
await as('sup', () => q(`insert into erp_orders(rec_date,section,brand,qty) values ('2026-10-27','sale','핑',165),('2026-10-27','pre','팬텀',234) on conflict (rec_date,section,brand) do update set qty=excluded.qty`));
ok((await as('staff', () => q(`select count(*)::int n from erp_orders`))).rows[0].n === 2, '실무진 출고지시 열람');
ok(!!(await fails(() => as('lead', () => q(`insert into erp_orders(rec_date,section,brand,qty) values ('2026-10-27','sale','팬텀',1)`)))), '현장팀장 출고지시 입력 차단');
await as('sup', () => q(`insert into erp_locks(lock_date,module) values ('2026-10-27','orders')`));
ok(!!(await fails(async () => { const r = await as('sup', () => q(`update erp_orders set qty=1 where rec_date='2026-10-27' returning brand`)); if (!r.rows.length) throw new Error('0'); })), '출고지시 마감 뒤 지원팀 수정 차단');
ok((await as('admin', () => q(`update erp_orders set qty=166 where rec_date='2026-10-27' and brand='핑' returning brand`))).rows.length === 1, '관리자 마감 뒤 수정 가능');
// KPI → 업무일지
await as('admin', () => q(`insert into erp_task_prices(team,grp,task,unit_price) values ('정상1팀','출고','출고',188),('정상1팀','출고','부자재출고',805),('정상1팀','출고','사은품출고',805),('정상1팀','정리','입고솔리드정리',29),('정상1팀','정리','수시,폐점 정리',255),('정상1팀','정리','지원팀,반품팀',0) on conflict (team,grp,task) do nothing`));
const K = [['first', '인원', 3.5], ['first', '초도PCS', 10109], ['first', '부자재', 59], ['out', '인원', 5], ['out', '온라인', 204], ['out', '판매분', 4232], ['box', '인원', 1.5], ['etc', '인원', 1], ['in', '인원', 2], ['in', 'Units', 1968], ['ret', '인원', 6], ['ret', '온라인', 643], ['ret', '수시', 3388]];
for (const [sh, m, v] of K) await as('lead', () => q(`insert into erp_kpi(work_date,team,sheet,brand,metric,value) values ('2026-09-01','정상1팀',$1,'',$2,$3)`, [sh, m, v]));
await as('lead', () => q(`insert into erp_kpi_day(work_date,team,field_count,office_count) values ('2026-09-01','정상1팀',19,2)`));
ok((await as('lead', () => q(`select erp_kpi_sync('2026-09-01','정상1팀') n`))).rows[0].n === 6, 'KPI → 업무일지 6개 공정 반영');
const W = Object.fromEntries((await as('admin', () => q(`select task, qty::float q, to_count::float t, unit_price::int p from erp_worklog where work_date='2026-09-01' and team='정상1팀'`))).rows.map((r) => [r.task, r]));
ok(W['출고'].q === 14545 && W['출고'].t === 11 && W['출고'].p === 188, 'KPI 출고 14,545 · T.O 11 (엑셀 업무일지와 일치)');
ok(W['입고솔리드정리'].q === 1968 && W['수시,폐점 정리'].q === 4031 && W['수시,폐점 정리'].t === 6 && W['지원팀,반품팀'].t === 2 && W['부자재출고'].q === 59, 'KPI 입고 1,968 · 반품 4,031 · 지원 2 · 부자재 59');
ok(!!(await fails(() => as('other', () => q(`insert into erp_kpi(work_date,team,sheet,brand,metric,value) values ('2026-09-01','정상1팀','in','','Units',1)`)))), '타팀·실무진 KPI 입력 차단');
ok(!!(await fails(() => as('other', () => q(`select erp_kpi_sync('2026-09-01','정상1팀')`)))), '권한 없는 사용자 업무일지 반영 차단');
await as('sup', () => q(`insert into erp_locks(lock_date,module) values ('2026-09-01','worklog')`));
ok(!!(await fails(() => as('lead', () => q(`select erp_kpi_sync('2026-09-01','정상1팀')`)))), '업무일지 마감 뒤 KPI 반영 차단');
// 신상품
await as('sup', () => q(`insert into erp_np_style(season,style,brand,plan_qty,st_in) values ('2026FW','111F3JP001','핑',10,'입고')`));
ok(!!(await fails(() => as('lead', () => q(`insert into erp_np_style(season,style) values ('2026FW','X')`)))), '현장팀장 신상품 자료 등록 차단');
ok((await as('lead', () => q(`select count(*)::int n from erp_np_style`))).rows[0].n === 1, '현장팀장 신상품 현황 열람');
await as('sup', () => q(`insert into erp_settings(key,value) values ('np_update','{"2026FW":{"at":"x"}}') on conflict (key) do update set value=excluded.value`));
ok(!!(await fails(() => as('sup', () => q(`insert into erp_settings(key,value) values ('company2','{}')`)))), '지원팀은 업데이트 기록 외 설정 변경 차단');

// 저장된 보기
await db.exec(`grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated;`);
await as('lead', () => q(`insert into erp_views(screen,name,config) values ('kpi:x','나만 보기','{}')`));
await as('sup', () => q(`insert into erp_views(screen,name,shared,config) values ('kpi:x','공유 보기',true,'{}')`));
ok((await as('lead', () => q(`select count(*)::int n from erp_views`))).rows[0].n === 2, '내 보기 + 공유 보기 열람');
ok((await as('staff', () => q(`select count(*)::int n from erp_views`))).rows[0].n === 1, '남의 비공개 보기는 안 보임');
ok(!!(await fails(async () => { const r = await as('staff', () => q(`update erp_views set name='x' where name='공유 보기' returning id`)); if (!r.rows.length) throw new Error('0'); })), '남의 보기 수정 차단');
ok(!!(await fails(() => as('staff', () => q(`insert into erp_views(screen,name,owner,config) values ('a','b','00000000-0000-0000-0000-000000000001','{}')`)))), '남의 이름으로 보기 저장 차단');
// 보안 방화벽 — 2단계 인증 · 회사 관리자 IP 제한
AAL = 'aal1';
ok(!!(await fails(async () => { const r = await as('admin', () => q(`update erp_teams set name=name where true returning 1`)); if (!r.rows.length) throw new Error('0'); })), '관리자: 2단계 인증 없이 수정 차단');
ok((await as('admin', () => q(`select count(*)::int n from erp_teams`))).rows[0].n > 0, '관리자: 2단계 인증 없이 보기는 가능');
ok((await as('sup', () => q(`select erp_can('orders','create') r`))).rows[0].r === true, '일반 등급은 2단계 인증 없이 작업 가능');
AAL = 'aal2'; IP = '211.10.10.5';
ok((await as('admin', () => q(`select erp_my_security() r`))).rows[0].r.ip === '211.10.10.5', '지금 접속 주소 확인');
ok(!!(await fails(() => as('admin', () => q(`update erp_settings set value='{"admin_ips":["1.2.3.4"]}' where key='security'`)))), '내 주소 없는 목록 저장 거절(스스로 잠김 방지)');
ok(!!(await fails(() => as('admin', () => q(`update erp_settings set value='{"admin_ips":["abc"]}' where key='security'`)))), '잘못된 IP 형식 거절');
await as('admin', () => q(`update erp_settings set value='{"admin_ips":["211.10.10.0/24"]}' where key='security'`));
ok((await as('admin', () => q(`select erp_can('users','edit') r`))).rows[0].r === true, '회사 주소(대역)에서 관리자 기능 허용');
IP = '8.8.8.8';
ok((await as('admin', () => q(`select erp_can('users','edit') r`))).rows[0].r === false, '밖의 주소에서 관리자 기능 차단');
ok((await as('admin', () => q(`select erp_can('worklog','edit') r`))).rows[0].r === true, '밖의 주소에서도 일반 업무는 가능');
ok((await as('admin', () => q(`select erp_can('users','view') r`))).rows[0].r === true, '밖의 주소에서 보기는 가능');
IP = '';
await q(`update erp_settings set value=jsonb_set(value,'{admin_ips}','[]') where key='security'`);
ok((await as('admin', () => q(`select erp_can('users','edit') r`))).rows[0].r === true, 'SQL 비상 해제 뒤 관리자 기능 복구');
// 재고 실사 · 시즌 계획
AAL = 'aal2';
const roleOf = async (who) => (await as(who, () => q(`select role_id r from erp_profiles where id=auth.uid()`))).rows[0].r;
console.log('roles', await roleOf('sup'), await roleOf('lead'), await roleOf('staff'));
await as('sup', () => q(`insert into erp_cnt(id,name) values ('c1','전반기 실사')`));
ok((await as('lead', () => q(`select count(*)::int n from erp_cnt`))).rows[0].n === 1, '현장 팀장: 실사 보기');
ok(!!(await fails(() => as('lead', () => q(`insert into erp_cnt(id,name) values ('c2','x')`)))), '현장 팀장: 새 실사 등록 차단');
await as('sup', () => q(`insert into erp_cnt_part(cnt_id,kind,file,part,rows) values ('c1','sys','wms.xlsx',0,'[["1F-A-01","A","BK","",3,0,3]]')`));
ok(!!(await fails(() => as('lead', () => q(`insert into erp_cnt_part(cnt_id,kind,file,part,rows) values ('c1','sys','x.xlsx',0,'[]')`)))), '현장 팀장: 전산 재고 올리기 차단');
await as('lead', () => q(`insert into erp_cnt_part(cnt_id,kind,file,part,rows) values ('c1','act','1차.xlsx',0,'[["1F-A-01","A","BK","",3,0,"1차"]]')`));
ok(true, '현장 팀장: 실사 자료 올리기');
ok(!!(await fails(() => as('staff', () => q(`insert into erp_cnt_part(cnt_id,kind,file,part,rows) values ('c1','act','s.xlsx',0,'[]')`)))), '실무진: 실사 자료 올리기 차단');
ok((await as('lead', () => q(`delete from erp_cnt_part where cnt_id='c1' and kind='sys' returning 1`))).rows.length === 0, '현장 팀장: 전산 재고 지우기 차단');
await as('sup', () => q(`update erp_cnt set status='확정' where id='c1'`));
ok(!!(await fails(() => as('lead', () => q(`insert into erp_cnt_part(cnt_id,kind,file,part,rows) values ('c1','act','2차.xlsx',0,'[]')`)))), '확정 뒤 실사 자료 변경 차단');
ok((await as('sup', () => q(`insert into erp_cnt_part(cnt_id,kind,file,part,rows) values ('c1','re','r.xlsx',0,'[]') returning 1`))).rows.length === 1, '마감 권한(업무지원팀)은 확정 뒤에도 수정');
await as('sup', () => q(`insert into erp_season(id,name,half) values ('2026SS','2026 S/S','SS')`));
await as('lead', () => q(`insert into erp_season_act(season_id,work_date,job,qty,people) values ('2026SS','2026-09-28','여름 1차 소터',43820,18)`));
ok(true, '현장 팀장: 시즌 실적 입력');
ok(!!(await fails(() => as('lead', () => q(`insert into erp_season(id,name) values ('x','x')`)))), '현장 팀장: 시즌 계획 등록 차단');
ok(!!(await fails(() => as('staff', () => q(`insert into erp_season_act(season_id,work_date,job,qty) values ('2026SS','2026-09-29','a',1)`)))), '실무진: 시즌 실적 입력 차단');
ok((await as('other', () => q(`select count(*)::int n from erp_cnt`))).rows[0].n === 1, '실무진(타팀): 실사 보기 가능');
await as('admin', () => q(`update erp_profiles set active=false where login_id='other'`));
ok((await as('other', () => q(`select count(*)::int n from erp_cnt`))).rows[0].n === 0, '사용 중지된 사용자: 실사 안 보임');
// 반품 관리 (07)
await as('sup', () => q(`insert into erp_ret_done(rec_date,brand,slips,pcs) values ('2026-10-28','팬텀',239,7978) on conflict (rec_date,brand) do update set slips=excluded.slips, pcs=excluded.pcs`));
await as('sup', () => q(`insert into erp_ret_done(rec_date,brand,slips,pcs) values ('2026-10-28','팬텀',240,7980) on conflict (rec_date,brand) do update set slips=excluded.slips, pcs=excluded.pcs`));
ok((await as('staff', () => q(`select slips from erp_ret_done where brand='팬텀'`))).rows[0].slips === 240, '업무지원팀: 반품 확정 다시 올리면 같은 날짜 값 바뀜 · 실무진 보기');
await as('sup', () => q(`insert into erp_ret_pend(brand,req_from,req_to,rows) values ('링스','2026-09-04','2026-10-27','[{"d":"2026-10-27","pend":3,"open":true}]')`));
ok(!!(await fails(() => as('staff', () => q(`insert into erp_ret_pend(brand) values ('핑')`)))), '실무진: 매장 반품 올리기 차단');
await as('lead', () => q(`insert into erp_ret_bag(kind,rec_date,brand,store,box,source_key) values ('행낭','2026-10-29','링스','타택배중지',1,'m|a')`));
await as('sup', () => q(`insert into erp_ret_bag(kind,rec_date,brand,store,box,source_key) values ('행낭','2026-10-29','핑','안성',4,'m|b')`));
ok((await as('sup', () => q(`delete from erp_ret_bag where source_key='m|a' returning 1`))).rows.length === 0, '행낭: 남이 넣은 줄은 지울 권한 없으면 안 지워짐');
ok((await as('lead', () => q(`delete from erp_ret_bag where source_key='m|a' returning 1`))).rows.length === 1, '행낭: 내가 넣은 줄은 지울 수 있음');
ok((await as('admin', () => q(`delete from erp_ret_bag where source_key='m|b' returning 1`))).rows.length === 1, '관리자: 행낭 전부 지움');
ok(!!(await fails(() => as('staff', () => q(`insert into erp_ret_bag(kind,rec_date,box,source_key) values ('타택배','2026-10-29',1,'m|c')`)))), '실무진: 행낭·타택배 등록 차단');
// 월간 회의 · 물동량 · 발주 · 공지 (08)
ok((await as('sup', () => q(`select erp_volume_replace('크리스','2026-09-01','2026-09-30','[{"rec_date":"2026-09-01","proc":"출고","qty":100},{"rec_date":"2026-09-02","proc":"반품","qty":50}]'::jsonb) n`))).rows[0].n === 2, '업무지원팀: 물동량 올리기');
await as('sup', () => q(`select erp_volume_replace('크리스','2026-09-01','2026-09-30','[{"rec_date":"2026-09-01","proc":"출고","qty":120}]'::jsonb)`));
ok((await as('admin', () => q(`select sum(qty)::int s from erp_volume`))).rows[0].s === 120, '같은 기간 다시 올리면 바꿔 넣기 (두 번 세지 않음)');
ok(!!(await fails(() => as('lead', () => q(`select erp_volume_replace('크리스','2026-09-01','2026-09-30','[]'::jsonb)`)))), '현장 팀장: 물동량 올리기 차단');
ok((await as('lead', () => q(`select * from erp_volume_month('2026-01-01','2026-12-31')`))).rows[0].qty == 120, '현장 팀장: 달 합계 보기 (회의 권한)');
ok((await as('staff', () => q(`select count(*)::int n from erp_volume`))).rows[0].n === 0, '실무진: 물동량 안 보임');
await as('lead', () => q(`insert into erp_meet_note(ym,sect,body) values ('2026-09','정상팀','초두 8ST 기획')`));
ok(!!(await fails(() => as('staff', () => q(`insert into erp_meet_note(ym,sect,body) values ('2026-09','x','y')`)))), '실무진: 회의 특이사항 작성 차단');
const sid = (await as('staff', () => q(`insert into erp_supply(kind,item,qty,status) values ('supply','목장갑',20,'입고') returning id, status`))).rows[0];
ok(sid.status === '요청', '실무진: 소모품 요청 (상태는 요청으로 고정)');
ok(!!(await fails(() => as('staff', () => q(`update erp_supply set status='승인' where id=${sid.id}`)))), '요청자: 스스로 승인 차단');
await as('admin', () => q(`update erp_supply set status='발주' where id=${sid.id}`));
ok(!!(await fails(() => as('staff', () => q(`update erp_supply set qty=99 where id=${sid.id}`)))), '발주 뒤 요청 내용 수정 차단');
await as('staff', () => q(`update erp_supply set status='입고', recv_name='실무A' where id=${sid.id}`));
ok((await as('admin', () => q(`select status from erp_supply where id=${sid.id}`))).rows[0].status === '입고', '요청자: 입고 확인');
ok(!!(await fails(() => as('other', () => q(`select count(*) from erp_notice`)))) || (await as('other', () => q(`select count(*)::int n from erp_notice`))).rows[0].n === 0, '사용 중지 사용자: 공지 안 보임');
const nid = (await as('sup', () => q(`insert into erp_notice(title) values ('건강검진') returning id`))).rows[0].id;
await as('staff', () => q(`insert into erp_notice_read(notice_id) values (${nid})`));
ok((await as('sup', () => q(`select count(*)::int n from erp_notice_read where notice_id=${nid}`))).rows[0].n === 1, '공지 읽음 확인 · 작성자가 확인 가능');
ok(!!(await fails(() => as('staff', () => q(`insert into erp_notice(title) values ('x')`)))), '실무진: 공지 작성 차단');
// 안성 API 연동 (09)
ok(!!(await fails(() => as('admin', () => q(`select erp_as_pull('2026-10-21','2026-10-28')`)))), '열쇠 없으면 받기 거절');
ok(!!(await fails(() => as('sup', () => q(`select erp_as_set_key('hq_test1234')`)))), '업무지원팀: 열쇠 등록 차단');
await as('admin', () => q(`select erp_as_set_key('hq_test1234')`));
ok(!!(await fails(() => as('admin', () => q(`select v from erp_secret`)))) || (await as('admin', () => q(`select v from erp_secret`))).rows.length === 0, '열쇠는 화면(API)에서 읽을 수 없음 (관리자도)');
const st0 = (await as('admin', () => q(`select erp_as_status() s`))).rows[0].s; ok(st0.key_set && st0.key_tail === '1234', '상태: 열쇠 등록됨 · 끝 4자리만 · ' + st0.key_tail);
ok((await as('admin', () => q(`select erp_as_pull('2026-07-01','2026-10-28') n`))).rows[0].n === 8, '120일을 93일씩 2번 × 자료 4종 = 요청 8건');
ok((await as('lead', () => q(`select erp_as_collect() n`))).rows[0].n === 8, '응답 저장 8건 (보기 권한도 처리 가능)');
const dd = (await as('lead', () => q(`select * from erp_as_daily order by date`))).rows; ok((await as('staff', () => q(`select count(*)::int n from erp_as_daily`))).rows[0].n === 0, '실무진(안성 보기 권한 없음): 안 보임'); ok(dd.length === 2 && +dd[0].ship_qty === 8300 && dd[1].heads === null, '날짜별 요약 저장 (인원 미입력 null 유지)');
ok((await as('lead', () => q(`select count(*)::int n from erp_as_staff`))).rows[0].n === 2 && (await as('lead', () => q(`select count(*)::int n from erp_as_ship where confirmed`))).rows[0].n === 1, '출고 · 인원 저장');
await as('admin', () => q(`select erp_as_pull('2026-10-21','2026-10-28', array['daily'])`)); await as('admin', () => q(`select erp_as_collect()`));
ok((await as('admin', () => q(`select count(*)::int n from erp_as_daily`))).rows[0].n === 2, '같은 기간 다시 받아도 두 번 쌓이지 않음');
await as('admin', () => q(`select erp_as_set_key('hq_wrong')`)); await as('admin', () => q(`select erp_as_pull('2026-10-28','2026-10-28', array['daily'])`)); await as('admin', () => q(`select erp_as_collect()`));
const lst = (await as('admin', () => q(`select erp_as_status() s`))).rows[0].s.last[0]; ok(lst.status === 401 && /열쇠/.test(lst.msg), '열쇠가 틀리면 401 · 이유 기록');
ok(!!(await fails(() => as('staff', () => q(`select erp_as_pull()`)))), '실무진: 받기 차단');
const u = (await as('admin', () => q(`select erp_usage() r`))).rows[0].r; ok(u && u.db_bytes > 0 && u.tables.length > 0, '저장 공간 사용량 (관리자) ' + (u.db_bytes / 1048576).toFixed(1) + 'MB');
ok((await as('staff', () => q(`select erp_usage() r`))).rows[0].r === null, '저장 공간 사용량: 실무진은 안 보임');

// ---- 10: 안성 추가 3종류 · 저장 공간 기록 ----
await as('admin', () => q(`select erp_as_set_key('hq_test1234')`));
ok(!!(await fails(() => as('sup', () => q(`select erp_as_set_opts(array['returns'])`)))), '업무지원팀: 받을 종류 변경 차단');
ok(!!(await fails(() => as('admin', () => q(`select erp_as_set_opts(array['money'])`)))), '모르는 종류 거절');
const op = (await as('admin', () => q(`select erp_as_set_opts(array['returns','sorter','inventory'], 3) v`))).rows[0].v; ok(op.types[0] === 'daily' && op.types.length === 4 && op.keep_months === 3, '받을 종류 저장 (날짜별 요약은 항상 포함)');
ok((await as('admin', () => q(`select erp_as_pull('2026-10-27','2026-10-27') n`))).rows[0].n === 4, '종류를 안 주면 고른 종류만큼 요청 (4건)');
await as('admin', () => q(`select erp_as_collect()`));
const rt = (await as('lead', () => q(`select * from erp_as_ret order by box`))).rows; ok(rt.length === 2 && rt[0].confirmed === true && rt[1].confirmed === false && +rt[0].sent_qty === 28, '반품검수 박스별 저장 (Y/N → 확정 여부 · 기간 밖은 제외)');
const so = (await as('lead', () => q(`select * from erp_as_sorter order by style`))).rows; ok(so.length === 2 && +so[0].qty === 150, '소터 스타일별 저장 (같은 스타일 합산)');
const fl = (await as('lead', () => q(`select * from erp_as_inv_flow`))).rows; const sk = (await as('lead', () => q(`select count(*)::int n from erp_as_inv_stock`))).rows[0].n; const idy = (await as('lead', () => q(`select count(*)::int n from erp_as_inv_daily`))).rows[0].n;
ok(fl.length === 1 && +fl[0].closing === 570 && +fl[0].qty_in === 150 && sk === 2 && idy === 2, '수불 · 장소별 재고 · 날짜별 합계 저장');
ok((await as('staff', () => q(`select count(*)::int n from erp_as_ret`))).rows[0].n === 0, '실무진: 반품검수 안 보임');
await as('admin', () => q(`select erp_as_pull('2026-10-27','2026-10-27', array['returns'])`)); await as('admin', () => q(`select erp_as_collect()`));
ok((await as('admin', () => q(`select count(*)::int n from erp_as_ret`))).rows[0].n === 2, '반품검수 다시 받아도 두 번 쌓이지 않음');
await q(`insert into erp_as_ret(work_date, box, sent_qty) values ('2026-06-01','OLD',5)`);
ok(!!(await fails(() => as('lead', () => q(`select erp_as_trim()`)))), '팀장: 정리 차단');
ok((await as('admin', () => q(`select erp_as_trim(3) n`))).rows[0].n === 1, '3개월 지난 안성 상세 자료 정리 (1건)');
const sn = (await as('admin', () => q(`select erp_usage_snap() r`))).rows[0].r; ok(sn && +sn.db_bytes > 0 && Array.isArray(sn.tables), '저장 공간 오늘 기록');
await as('admin', () => q(`select erp_usage_snap()`)); ok((await q(`select count(*)::int n from erp_usage_log`)).rows[0].n === 1, '같은 날 다시 재면 덮어씀');
ok(!!(await fails(() => as('staff', () => q(`select erp_usage_snap()`)))), '실무진: 기록 차단');
const u2 = (await as('admin', () => q(`select erp_usage() r`))).rows[0].r; ok(u2.hist.length === 1 && u2.file_limit > 0, '사용량 + 기록(hist) 함께');

// ---- 11: 공지 확인 · 손익계산표 ----
const nid11 = (await as('admin', () => q(`insert into erp_notice(title, targets) values ('안전 교육', '{정상팀}') returning id`))).rows[0].id;
await as('lead', () => q(`insert into erp_notice_read(notice_id) values ($1)`, [nid11]));
await as('lead', () => q(`update erp_notice_read set confirmed_at = now() where notice_id = $1 and user_id = auth.uid()`, [nid11]));
ok((await as('admin', () => q(`select count(*)::int n from erp_notice_read where notice_id = $1 and confirmed_at is not null`, [nid11]))).rows[0].n === 1, '공지 확인: 본인 확인 기록 · 관리자가 봄');
const upd11 = (await as('staff', () => q(`update erp_notice_read set confirmed_at = now() where notice_id = $1 returning 1`, [nid11]))).rows.length; ok(upd11 === 0, '공지 확인: 남의 확인 기록은 못 바꿈');
await as('lead', () => q(`insert into erp_worklog(work_date,team,grp,task,unit_price,qty,to_count,extra) values ('2026-08-31','정상1팀','출고','출고',100,1000,2,'{"wk":"2026-09-1"}')`));
const pl11 = (await as('lead', () => q(`select * from erp_pl_days('2026-08-31','2026-08-31')`))).rows; const pr11 = pl11.find((x) => x.team === '정상1팀');
ok(pr11 && pr11.wk === '2026-09-1' && +pr11.sales === 100000 && +pr11.to_count === 2, '손익계산표: 하루·팀 합계 + 엑셀 주차(wk) ' + JSON.stringify(pr11));
ok((await as('other', () => q(`select count(*)::int n from erp_pl_days('2026-08-31','2026-08-31') where team = '정상1팀'`))).rows[0].n === 0, '손익계산표: 다른 팀 실무진은 안 보임 (권한 그대로)');

// ---- 12: 속도 · 이력 ----
const pc = (await q(`select count(*) filter (where coalesce(qual,'') || coalesce(with_check,'') ~* 'select erp_can|select erp_my_teams|select auth.uid|select [(]erp_me') n, count(*) filter (where coalesce(qual,'') || coalesce(with_check,'') ~ 'erp_can[(]''''') raw from pg_policies where schemaname='public'`)).rows[0]; ok(+pc.n > 100, '권한 정책 빠른 방식으로 바뀜 ' + pc.n + '개');
const a0 = +(await q(`select count(*) n from erp_audit`)).rows[0].n;
await as('admin', () => q(`insert into erp_kpi(work_date,team,sheet,brand,metric,value) select '2026-11-02','정상1팀','in','B'||g,'Units',g from generate_series(1,100) g`));
const a1 = (await q(`select action, row_key from erp_audit order by id desc limit 1`)).rows[0]; ok(+(await q(`select count(*) n from erp_audit`)).rows[0].n === a0 + 1 && /대량/.test(a1.action) && a1.row_key === '100줄', '엑셀 100줄 한 번 입력 요약 1줄 ' + JSON.stringify(a1));
await as('admin', () => q(`insert into erp_kpi(work_date,team,sheet,brand,metric,value) select '2026-11-02','정상1팀','in','B'||g,'Units',g+1 from generate_series(1,100) g on conflict (work_date,team,sheet,brand,metric) do update set value = excluded.value`));
ok(/UPDATE \(대량\)/.test((await q(`select action from erp_audit order by id desc limit 1`)).rows[0].action), '엑셀 다시 올리기(덮어쓰기)도 요약 1줄');
await as('lead', () => q(`update erp_worklog set qty = qty + 1 where work_date = '2026-08-31' and team = '정상1팀'`));
const a2 = (await q(`select action, before, after from erp_audit order by id desc limit 1`)).rows[0]; ok(a2.action === 'UPDATE' && a2.before && a2.after && +a2.after.qty === +a2.before.qty + 1, '한 줄 수정 1건씩 고치기 전 · 후 그대로 기록');
await as('admin', () => q(`delete from erp_kpi where work_date = '2026-11-02' and brand in ('B1','B2')`)); ok((await q(`select count(*) n from erp_audit where action = 'DELETE' and tbl = 'erp_kpi'`)).rows[0].n >= 2, '지워진 내용까지 기록');
ok(!!(await fails(() => as('lead', () => q(`select erp_audit_compact()`)))), '이력 정리: 관리자만');
ok((await as('lead', () => q(`select count(*)::int n from erp_kpi where team = '정상1팀' and work_date = '2026-11-02'`))).rows[0].n === 98 && (await as('other', () => q(`select count(*)::int n from erp_kpi where work_date = '2026-11-02'`))).rows[0].n === 0, '팀 권한 그대로: 정상팀은 보임 · 온라인팀은 안 보임');
ok(!!(await fails(() => as('other', () => q(`insert into erp_kpi(work_date,team,sheet,brand,metric,value) values ('2026-11-03','정상1팀','in','','Units',1)`)))), '다른 팀 KPI 입력 차단 그대로');

// ---- 13: 전산자료 ----
const parts13 = JSON.stringify([[['1', 'AB12', 'BK', '95', 'A-01', 5, 2, 0], ['1', 'AB12', 'BK', '100', '', 3, 0, 0]]]);
const daily13 = JSON.stringify([{ brand: '핑', qty: 8, sku: 2, noloc: 1, noloc_qty: 3, out_qty: 2 }]);
ok(!!(await fails(() => as('lead', () => q(`select erp_cs_replace('wms','정상창고',$1,$2,'a.xlsx',2,8,'{}')`, [parts13, daily13])))), '전산자료 올리기: 현장팀장 차단');
await as('sup', () => q(`select erp_cs_replace('wms','정상창고',$1,$2,'a.xlsx',2,8,'{}')`, [parts13, daily13]));
await as('sup', () => q(`select erp_cs_replace('wms','정상창고',$1,$2,'b.xlsx',2,8,'{}')`, [parts13, daily13]));
ok((await as('staff', () => q(`select count(*)::int n from erp_cs_part where kind='wms' and sub='정상창고'`))).rows[0].n === 1 && (await as('staff', () => q(`select count(*)::int n from erp_cs_daily`))).rows[0].n === 1, '재고 상세는 최신 파일만 · 날짜별 브랜드 합계 1줄 (덮어 올려도)');
ok((await as('staff', () => q(`select count(*)::int n from erp_cs_file`))).rows[0].n === 2 && (await as('staff', () => q(`select by_name from erp_cs_file order by id desc limit 1`))).rows[0].by_name === '김영자', '올린 기록 · 올린 사람 이름');
ok(!!(await fails(() => as('sup', () => q(`select erp_cs_replace('xx','정상창고','[]','[]','a',0,0,'{}')`)))), '모르는 자료 종류 차단');
ok(!!(await fails(() => as('lead', () => q(`insert into erp_cs_order(d,sub,brand,sale) values ('2026-11-03','B2B','핑',10)`)))), '출고 지시 저장: 현장팀장 차단');
await as('sup', () => q(`insert into erp_cs_order(d,sub,brand,sale,pre,qty) values ('2026-11-03','B2B','핑',10,2,12)`));
ok(!!(await fails(() => as('staff', () => q(`insert into erp_cs_part(kind,sub,part,rows) values ('wms','정상창고',9,'[]')`)))), '재고 상세 직접 쓰기 차단');
await as('sup', () => q(`insert into erp_orders(rec_date,section,brand,qty,src_qty,manual) values ('2026-11-03','sale','핑',10,10,false)`));
ok((await as('staff', () => q(`select src_qty, manual from erp_orders where rec_date='2026-11-03' and brand='핑'`))).rows[0].manual === false, '아침 출고지시: 파일 값 · 손 수정 표시 값');
// 14: 브랜드별로 나눠 받은 재고 파일 합치기
await db.exec(fs.readFileSync('sql/14_csmerge.sql', 'utf8'));
ok((await as('staff', () => q(`select count(*)::int n, min(brand) b from erp_cs_part where kind='wms' and sub='정상창고'`))).rows[0].b != null, '14: 이전 통째 묶음도 브랜드 묶음으로 나눔');
await db.exec(fs.readFileSync('sql/14_csmerge.sql', 'utf8'));
const mp = (b, n, q0) => ({ brand: b, rows: Array.from({ length: n }, (_, i) => [b, 'S' + i, 'BK', 'F', i % 2 ? 'A-1' : '', q0, 0, 0]), stat: { name: b.replace(/^\d+ \((.*)\)$/, '$1'), qty: n * q0, sku: n, styles: n, noloc: Math.ceil(n / 2), noloc_qty: Math.ceil(n / 2) * q0, out: 0, fut: 0, file: 'x' } });
await as('sup', () => q(`select erp_cs_merge('wms','정상창고',$1,$2,'6.xlsx',3,30,'{}')`, [['1 (PING)'], JSON.stringify([mp('1 (PING)', 3, 10)])]));
await as('sup', () => q(`select erp_cs_merge('wms','정상창고',$1,$2,'4.xlsx',4,80,'{}')`, [['5 (PEARLY GATES)', '6 (MASTER BUNNY)'], JSON.stringify([mp('5 (PEARLY GATES)', 2, 20), mp('6 (MASTER BUNNY)', 2, 20)])]));
let dsum = (await as('staff', () => q(`select sum(qty)::int s, count(*)::int n from erp_cs_daily where kind='wms' and sub='정상창고' and d=(now() at time zone 'Asia/Seoul')::date`))).rows[0];
ok(dsum.s === 8 + 30 + 80 && dsum.n === 4, '14: 다른 브랜드 파일을 올려도 앞 브랜드 유지 · 오늘 합계 = 전체 (' + JSON.stringify(dsum) + ')');
await as('sup', () => q(`select erp_cs_merge('wms','정상창고',$1,$2,'6b.xlsx',1,5,'{}')`, [['1 (PING)'], JSON.stringify([mp('1 (PING)', 1, 5)])]));
dsum = (await as('staff', () => q(`select sum(qty)::int s from erp_cs_daily where kind='wms' and sub='정상창고' and d=(now() at time zone 'Asia/Seoul')::date`))).rows[0];
ok(dsum.s === 8 + 5 + 80, '14: 같은 브랜드 다시 올리면 그 브랜드만 새것으로');
await as('sup', () => q(`select erp_cs_merge('wms','반품창고',$1,'[]','6b.xlsx',0,0,'{}')`, [['1 (PING)']]));
ok((await as('staff', () => q(`select count(*)::int n from erp_cs_file where file_name='6b.xlsx'`))).rows[0].n === 1, '14: 값 없는 창고는 지우기만 하고 기록 안 남김');
ok(!!(await fails(() => as('lead', () => q(`select erp_cs_merge('wms','정상창고','{}','[]','a',0,0,'{}')`)))), '14: 현장팀장 차단');
// 15: 실사 지우기 (현장 팀장) · 7일 뒤 되살리기
await db.exec(fs.readFileSync('sql/15_cnt_trash.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/15_cnt_trash.sql', 'utf8'));
await as('sup', () => q(`insert into erp_cnt(id,name) values ('t1','중복 등록 실사'),('t2','확정 실사')`));
await as('sup', () => q(`insert into erp_cnt_part(cnt_id,kind,file,part,rows,uploaded_by) values ('t1','act','1차.xlsx',0,'[]',auth.uid())`));
await as('admin', () => q(`update erp_cnt set status='확정' where id='t2'`));
ok(!!(await fails(() => as('staff', () => q(`select erp_cnt_trash('t1')`)))), '15: 실무진 실사 지우기 차단');
ok(!!(await fails(() => as('lead', () => q(`select erp_cnt_trash('t2')`)))), '15: 확정된 실사는 팀장도 지우기 차단');
await as('lead', () => q(`delete from erp_cnt_part where cnt_id='t1' and file='1차.xlsx'`));
ok((await as('admin', () => q(`select count(*)::int n from erp_cnt_part where cnt_id='t1'`))).rows[0].n === 0, '15: 팀장이 다른 사람이 올린 실사 파일 지움');
await as('lead', () => q(`select erp_cnt_trash('t1')`));
ok((await as('admin', () => q(`select deleted_at is not null d, deleted_name from erp_cnt where id='t1'`))).rows[0].d === true, '15: 팀장이 진행 중 실사 지움 (휴지통)');
ok(!!(await fails(() => as('lead', () => q(`insert into erp_cnt_part(cnt_id,kind,file,part,rows) values ('t1','act','2차.xlsx',0,'[]')`)))), '15: 지운 실사에 자료 올리기 차단');
await as('lead', () => q(`delete from erp_cnt where id='t1'`));
ok((await as('admin', () => q(`select count(*)::int n from erp_cnt where id='t1'`))).rows[0].n === 1, '15: 팀장 완전 지우기는 안 됨 (휴지통만)');
ok(!!(await fails(() => as('lead', () => q(`select erp_cnt_restore('t1')`)))), '15: 되살리기 팀장 차단');
await as('admin', () => q(`select erp_cnt_restore('t1')`));
ok((await as('admin', () => q(`select deleted_at from erp_cnt where id='t1'`))).rows[0].deleted_at === null, '15: 관리자 되살리기');
await as('admin', () => q(`update erp_cnt set deleted_at = now() - interval '8 days' where id='t1'`));
await as('admin', () => q(`select erp_cnt_trash('t2')`));
ok((await as('admin', () => q(`select count(*)::int n from erp_cnt where id='t1'`))).rows[0].n === 0, '15: 7일 지난 실사는 완전히 지움 · 확정 실사도 관리자 지우기 가능');
// 16: 배분LIST
await db.exec(fs.readFileSync('sql/16_cs_alloc.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/16_cs_alloc.sql', 'utf8'));
await db.exec(`grant all on all tables in schema public to authenticated;`); // Supabase 기본 권한과 같게
const ar = JSON.stringify([{ d: '2026-11-03', brand: '핑', k: '2', qty: 10, stores: 2, lines: 3 }, { d: '2026-11-03', brand: '핑', k: 'all', qty: 10, stores: 2, lines: 3 }]);
const ap = JSON.stringify([[['111A', 'F1', '매장', 'BK', '95', 10, '2', '2026-11-03', '', '반응보충', '핑']]]);
ok(!!(await fails(() => as('lead', () => q(`select erp_cs_alloc_replace('{2026-11-03}',$1,$2,'a.xlsx',3,10,'{}')`, [ar, ap])))), '16: 배분LIST 올리기 현장팀장 차단');
await as('sup', () => q(`select erp_cs_alloc_replace('{2026-11-03}',$1,$2,'a.xlsx',3,10,'{}')`, [ar, ap]));
await as('sup', () => q(`select erp_cs_alloc_replace('{2026-11-03}',$1,$2,'b.xlsx',3,10,'{}')`, [ar, ap]));
ok((await as('staff', () => q(`select count(*)::int n, sum(qty)::int s from erp_cs_alloc where d='2026-11-03'`))).rows[0].s === 20 && (await as('staff', () => q(`select count(*)::int n from erp_cs_part where kind='alloc'`))).rows[0].n === 1, '16: 같은 날짜 다시 올리면 새 파일로 바꿈 · 상세는 최근 파일만');
ok((await as('staff', () => q(`select sub, ref_date::text r from erp_cs_file where file_name='b.xlsx' and sub='배분LIST'`))).rows[0].r === '2026-11-03', '16: 올린 기록 (보충일자)');
ok(!!(await fails(() => as('sup', () => q(`insert into erp_cs_alloc(d,brand,k,qty) values ('2026-11-04','핑','1',1)`)))), '16: 합계 직접 쓰기 차단');
// 17: 배분LIST 브랜드별 · 마감
await db.exec(fs.readFileSync('sql/17_cs_alloc_close.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/17_cs_alloc_close.sql', 'utf8'));
await db.exec(`grant all on all tables in schema public to authenticated;`);
const D17 = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 최근 3일치만 남기므로 오늘 날짜로 시험
const mr = (b, q) => JSON.stringify([{ d: D17, brand: b, k: '2', qty: q, stores: 1, lines: 1 }, { d: D17, brand: b, k: 'all', qty: q, stores: 1, lines: 1 }]);
const mp2 = (b, q, sc) => JSON.stringify([{ d: D17, brand: b, rows: [['111A', sc, '매장', 'BK', '95', q, '2', D17, '', '반응보충', b]] }]);
await as('sup', () => q(`select erp_cs_alloc_merge('{${D17}}','{핑}',$1,$2,'핑.xlsx',1,10,'{}')`, [mr('핑', 10), mp2('핑', 10, 'F1')]));
await as('sup', () => q(`select erp_cs_alloc_merge('{${D17}}','{팬텀}',$1,$2,'팬텀.xlsx',1,20,'{}')`, [mr('팬텀', 20), mp2('팬텀', 20, 'F1')]));
let tt = (await as('staff', () => q(`select qty::int q, stores from erp_cs_alloc where d='${D17}' and brand='' and k='all'`))).rows[0];
ok(tt.q === 30 && tt.stores === 1, '17: 브랜드별 따로 올려도 합쳐짐 · 매장 수 중복 없이 ' + JSON.stringify(tt));
await as('sup', () => q(`select erp_cs_alloc_merge('{${D17}}','{핑}',$1,$2,'핑2.xlsx',1,5,'{}')`, [mr('핑', 5), mp2('핑', 5, 'F2')]));
tt = (await as('staff', () => q(`select qty::int q, stores from erp_cs_alloc where d='${D17}' and brand='' and k='all'`))).rows[0];
ok(tt.q === 25 && tt.stores === 2 && (await as('staff', () => q(`select file from erp_cs_alloc where d='${D17}' and brand='핑' and k='all'`))).rows[0].file === '핑2.xlsx', '17: 같은 브랜드 다시 올리면 그 브랜드만 새것으로');
await as('sup', () => q(`select erp_cs_alloc_skip('${D17}','마무트',true)`));
ok((await as('staff', () => q(`select skip from erp_cs_close where d='${D17}'`))).rows[0].skip.indexOf('마무트') >= 0, '17: 오늘 없음');
ok(!!(await fails(() => as('lead', () => q(`select erp_cs_alloc_close('${D17}',true)`)))), '17: 현장팀장 마감 차단');
await as('sup', () => q(`select erp_cs_alloc_close('${D17}',true)`));
ok((await as('staff', () => q(`select brands, qty::int q, closed_name from erp_cs_close where d='${D17}'`))).rows[0].q === 25, '17: 지시서 마감 (브랜드 수 · 수량 기록)');
ok(!!(await fails(() => as('sup', () => q(`select erp_cs_alloc_merge('{${D17}}','{핑}',$1,$2,'x.xlsx',1,5,'{}')`, [mr('핑', 5), mp2('핑', 5, 'F2')])))), '17: 마감 뒤 올리기 차단');
ok(!!(await fails(() => as('sup', () => q(`select erp_cs_alloc_close('${D17}',false)`)))), '17: 지원팀 마감 해제 차단');
await as('admin', () => q(`select erp_cs_alloc_close('${D17}',false)`));
await as('sup', () => q(`select erp_cs_alloc_merge('{${D17}}','{핑}',$1,$2,'핑3.xlsx',1,7,'{}')`, [mr('핑', 7), mp2('핑', 7, 'F2')]));
ok((await as('staff', () => q(`select qty::int q from erp_cs_alloc where d='${D17}' and brand='' and k='all'`))).rows[0].q === 27, '17: 관리자 마감 해제 뒤 다시 올리기');
// 18: 신상품 최근 파일 원본
await db.exec(fs.readFileSync('sql/18_np_raw.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/18_np_raw.sql', 'utf8'));
await db.exec(`grant all on all tables in schema public to authenticated;`);
await as('sup', () => q(`insert into erp_np_raw(kind,file,n,rows) values ('plan','a.xlsx',1,'[["1 (PING)"]]') on conflict (kind) do update set file=excluded.file`));
await as('sup', () => q(`insert into erp_np_raw(kind,file,n,rows) values ('plan','b.xlsx',1,'[["1 (PING)"]]') on conflict (kind) do update set file=excluded.file`));
ok((await as('staff', () => q(`select file from erp_np_raw where kind='plan'`))).rows[0].file === 'b.xlsx', '18: 신상품 원본은 종류마다 최근 1개');
ok(!!(await fails(() => as('lead', () => q(`insert into erp_np_raw(kind,file) values ('inbound','x')`)))), '18: 신상품 원본 저장 권한 (현장팀장 차단)');
// 19: 배분LIST 상세 1년 보관 · 90일 지나면 용량 줄임
await db.exec(fs.readFileSync('sql/19_alloc_year.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/19_alloc_year.sql', 'utf8'));
await db.exec(`grant all on all tables in schema public to authenticated;`);
const kd0 = (n) => `((now() at time zone 'Asia/Seoul')::date - ${n})::text`;
await db.exec(`insert into erp_cs_part(kind,sub,part,brand,rows,at) values
  ('alloc', ${kd0(10)}, 900, '핑', '[["111A","F1","매장가","BK","95",3,"2","x","2026-01-01","반응보충","핑"]]', now()),
  ('alloc', ${kd0(100)}, 901, '핑', '[["111A","F1","매장가","BK","95",4,"2","x","2026-01-01","반응보충","핑"]]', now()),
  ('alloc', ${kd0(400)}, 902, '핑', '[["111A","F1","매장가","BK","95",5,"2","x","2026-01-01","반응보충","핑"]]', now())`);
await as('admin', () => q(`select erp_cs_alloc_close('${D17}',false)`));
await as('sup', () => q(`select erp_cs_alloc_merge('{${D17}}','{핑}',$1,$2,'핑4.xlsx',1,7,'{}')`, [mr('핑', 7), mp2('핑', 7, 'F2')]));
const P19 = Object.fromEntries((await as('staff', () => q(`select part, rows from erp_cs_part where kind='alloc' and part >= 900`))).rows.map((r) => [r.part, r.rows[0]]));
ok(P19[900] && P19[900][2] === '매장가', '19: 10일 전 상세 그대로 (3일 뒤 1년 보관)');
ok(P19[901] && P19[901][2] === '' && P19[901][5] === 4 && P19[901][1] === 'F1' && P19[901][10] === '핑', '19: 90일 지난 상세는 매장명 · 글자만 비움 (수량 · 매장코드 · 브랜드 유지)');
ok(!P19[902], '19: 1년 지난 상세는 지움');
ok(!!(await fails(() => as('sup', () => q(`select erp_cs_alloc_compact()`)))), '19: 줄이는 함수는 직접 호출 차단');
// 20: 품번 규칙 저장 · 아이템 코드 자동 학습
await db.exec(fs.readFileSync('sql/20_item_map.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/20_item_map.sql', 'utf8'));
await db.exec(`grant all on all tables in schema public to authenticated;`);
const n20 = (await as('sup', () => q(`select erp_item_learn('{"XA":{"g":3,"n":"신규"},"bad":{"g":3},"XB":{"g":9}}','WMS 재고현황')`))).rows[0].erp_item_learn;
ok(n20 === 1, '20: 새 코드만 배움 (잘못된 코드 · 없는 아이템군 무시)');
await as('admin', () => q(`update erp_settings set value = jsonb_set(value, '{XA}', '{"g":2,"n":"신규","src":"admin","ok":true}') where key='item_map'`));
await as('sup', () => q(`select erp_item_learn('{"XA":{"g":5}}','x')`));
const m20 = (await as('staff', () => q(`select value from erp_settings where key='item_map'`))).rows[0].value;
ok(m20.XA.g === 2 && m20.XA.src === 'admin', '20: 관리자가 고친 코드는 자동 학습이 바꾸지 않음');
await fails(() => as('sup', () => q(`update erp_settings set value='{}' where key='item_map'`)));
ok(!!(await as('admin', () => q(`select value from erp_settings where key='item_map'`))).rows[0].value.XA, '20: 권한 없는 사람은 규칙 직접 못 고침');
// 21 · 22: 월간 회의 자료 (엑셀 → 팀별 발표)
await db.exec(fs.readFileSync('sql/21_alloc_nostore.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/22_meet_book.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/22_meet_book.sql', 'utf8'));
await as('admin', () => q(`insert into erp_meet_book(ym, idx, kind, name, body) values ('2026-11', 0, 'book', '2026년 11월 월간 회의', '{"kpis":[]}'), ('2026-11', 1, 'main', '입고반품팀', '{"grid":{"n":1}}')`));
ok((await as('admin', () => q(`select count(*)::int n from erp_meet_book where ym='2026-11'`))).rows[0].n === 2, '22: 관리자 회의 자료 저장');
ok(!!(await fails(() => as('staff', () => q(`insert into erp_meet_book(ym, idx, name) values ('2026-11', 5, 'x')`)))), '22: 현장 사원은 회의 자료 올리기 차단');
ok(!!(await fails(() => as('staff', () => q(`delete from erp_meet_book where ym='2026-11'`)))) || (await as('admin', () => q(`select count(*)::int n from erp_meet_book where ym='2026-11'`))).rows[0].n === 2, '22: 현장 사원은 지우기 차단');
await db.exec(`reset role; set role anon;`); ok(!!(await fails(() => q(`select * from erp_meet_book`))), '22: 로그인 안 한 사람 읽기 차단'); await db.exec(`reset role;`);
// ---------- 24. 저장 공간 정리 (erp_purge · erp_purge_count) ----------
await db.exec(fs.readFileSync('sql/24_purge.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/24_purge.sql', 'utf8')); // 두 번 실행해도 안전
ok(!!(await fails(() => as('staff', () => q(`select erp_purge_count('retired')`)))), '24: 현장 사원은 정리 건수 세기 차단');
ok(!!(await fails(() => as('staff', () => q(`select erp_purge('retired')`)))), '24: 현장 사원은 정리 실행 차단');
ok(!!(await fails(() => as('admin', () => q(`select erp_purge('이상한것')`)))), '24: 모르는 정리 항목은 거절');
ok(!!(await fails(() => as('admin', () => q(`select erp_purge('audit')`)))), '24: 날짜 없이 기간 정리는 거절');
{ const r = await as('admin', () => q(`select erp_purge_count('retired') j`)); ok(r.rows[0].j && typeof r.rows[0].j === 'object', '24: 관리자 정리 건수 세기 · ' + JSON.stringify(r.rows[0].j)); }
{ const r = await as('admin', () => q(`select erp_purge('retired') j`)); ok(r.rows[0].j && typeof r.rows[0].j === 'object', '24: 관리자 폐기 화면 자료 정리 실행 · ' + JSON.stringify(r.rows[0].j)); }
{ const r = await as('admin', () => q(`select erp_purge('meetbook', (now() - interval '24 months')::date) j`)); ok(r.rows[0].j && typeof r.rows[0].j === 'object', '24: 24개월 지난 회의 보고서 정리 실행'); }
ok((await as('admin', () => q(`select count(*)::int n from erp_meet_book where ym='2026-11'`))).rows[0].n === 2, '24: 최근 회의 보고서는 지워지지 않음');

// ---------- 25. 원가 관리: 업무 · 단가는 관리자만 · 지원팀 인원 확인 · 별도인원 ----------
await db.exec(fs.readFileSync('sql/25_cost_admin.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/25_cost_admin.sql', 'utf8')); // 두 번 실행해도 안전
await as('admin', () => q(`insert into erp_task_prices(team, grp, task, unit_price) values ('정상1팀','출고','검수',100) on conflict do nothing`));
// RLS 는 막을 때 오류가 아니라 '0줄 바뀜' 으로 지나가므로, 값이 그대로인지로 본다
await as('lead', () => q(`update erp_task_prices set unit_price = 999 where team='정상1팀' and task='검수'`));
ok((await as('admin', () => q(`select unit_price::int n from erp_task_prices where team='정상1팀' and task='검수'`))).rows[0].n === 100, '25: 현장 팀장은 자기 팀 단가도 못 바꿈');
ok(!!(await fails(() => as('lead', () => q(`insert into erp_task_prices(team, grp, task, unit_price) values ('정상1팀','출고','새업무',10)`)))), '25: 현장 팀장은 업무 추가 차단');
await as('lead', () => q(`delete from erp_task_prices where team='정상1팀' and task='검수'`));
ok((await as('admin', () => q(`select count(*)::int n from erp_task_prices where team='정상1팀' and task='검수'`))).rows[0].n === 1, '25: 현장 팀장은 업무 삭제 차단');
await as('admin', () => q(`update erp_task_prices set unit_price = 120 where team='정상1팀' and task='검수'`));
ok((await as('admin', () => q(`select unit_price::int n from erp_task_prices where team='정상1팀' and task='검수'`))).rows[0].n === 120, '25: 관리자는 단가 변경');
await as('admin', () => q(`update erp_task_prices set active = false where team='정상1팀' and task='검수'`));
ok((await as('staff', () => q(`select active from erp_task_prices where team='정상1팀' and task='검수'`))).rows[0].active === false, '25: 숨김(active=false)은 보기에는 그대로 남음');
ok((await as('admin', () => q(`select active from erp_teams where name='별도인원'`))).rows[0].active === true, '25: 별도인원 팀 다시 사용');
ok((await as('admin', () => q(`select erp_can('headcount','edit') b`))).rows[0].b === true, '25: 관리자 인원 확인 쓰기 권한');
ok((await as('sup', () => q(`select erp_can('headcount','edit') b`))).rows[0].b === true, '25: 지원팀 인원 확인 쓰기 권한');
ok((await as('staff', () => q(`select erp_can('headcount','edit') b`))).rows[0].b === false, '25: 현장 사원은 인원 확인 쓰기 없음');
await as('sup', () => q(`insert into erp_headcount(work_date, team, field_count, office_count) values ('2026-11-11','정상1팀',0,7)`));
ok((await as('sup', () => q(`select office_count::int n from erp_headcount where work_date='2026-11-11' and team='정상1팀'`))).rows[0].n === 7, '25: 지원팀이 사무실확인 인원 입력');
await as('sup', () => q(`update erp_headcount set office_count = 8 where work_date='2026-11-11' and team='정상1팀'`));
ok((await as('sup', () => q(`select office_count::int n from erp_headcount where work_date='2026-11-11' and team='정상1팀'`))).rows[0].n === 8, '25: 지원팀이 사무실확인 인원 수정');
// 'staff' 는 앞 시험에서 worklog.create 권한을 받아 두었으므로, 권한 없는 사용자로 본다
ok(!!(await fails(() => as('other', () => q(`insert into erp_headcount(work_date, team, field_count) values ('2026-11-12','정상1팀',3)`)))), '25: 권한 없는 사용자는 인원 입력 차단');

// ---------- 26. 연도별 인건비 (erp_team_cost) ----------
await db.exec(fs.readFileSync('sql/26_team_year_cost.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/26_team_year_cost.sql', 'utf8')); // 두 번 실행해도 안전
await db.exec(`grant all on all tables in schema public to authenticated;`);
ok((await as('admin', () => q(`select count(*)::int n from erp_team_cost where year = extract(year from now())::int`))).rows[0].n > 0, '26: 지금 팀 인건비를 올해 줄로 채워 넣음');
ok(!!(await fails(() => as('lead', () => q(`insert into erp_team_cost(team,year,labor_cost) values ('정상1팀',2024,1)`)))), '26: 현장 팀장은 연도별 인건비 등록 차단');
ok((await as('staff', () => q(`select count(*)::int n from erp_team_cost`))).rows[0].n > 0, '26: 보기는 모두 가능 (원가는 전체 공개)');
// 2025년 인건비를 따로 넣고, 2025년 지출이 그 값으로 계산되는지
await as('admin', () => q(`insert into erp_teams(name,labor_cost) values ('정상1팀',160390) on conflict (name) do update set labor_cost=excluded.labor_cost`));
await as('admin', () => q(`insert into erp_team_cost(team,year,labor_cost,ot_rate) values ('정상1팀',2025,153300,28743.75) on conflict (team,year) do update set labor_cost=excluded.labor_cost, ot_rate=excluded.ot_rate`));
await as('admin', () => q(`delete from erp_locks where lock_date='2025-09-01'`));
await as('admin', () => q(`insert into erp_worklog(work_date,team,grp,task,unit_price,qty,to_count) values ('2025-09-10','정상1팀','출고','출고',100,10,3) on conflict (work_date,team,grp,task) do update set to_count=excluded.to_count`));
await as('admin', () => q(`insert into erp_worklog(work_date,team,grp,task,unit_price,qty,to_count) values ('2026-09-10','정상1팀','출고','출고',100,10,3) on conflict (work_date,team,grp,task) do update set to_count=excluded.to_count`));
{
  const a = (await as('admin', () => q(`select cost::numeric c from erp_pl_days('2025-09-10','2025-09-10') where team='정상1팀'`))).rows[0];
  ok(a && Math.round(+a.c) === 3 * 153300, '26: 2025년 지출은 2025년 인건비(153,300) 기준 · ' + (a && Math.round(+a.c).toLocaleString()));
}
{
  const b = (await as('admin', () => q(`select cost::numeric c from erp_pl_days('2026-09-10','2026-09-10') where team='정상1팀'`))).rows[0];
  ok(b && Math.round(+b.c) === 3 * 160390, '26: 2026년 지출은 2026년 인건비(160,390) 기준 · ' + (b && Math.round(+b.c).toLocaleString()));
}
await as('admin', () => q(`delete from erp_team_cost where team='정상1팀' and year=2025`));
{
  const c = (await as('admin', () => q(`select cost::numeric c from erp_pl_days('2025-09-10','2025-09-10') where team='정상1팀'`))).rows[0];
  ok(c && Math.round(+c.c) === 3 * 160390, '26: 그 해 줄이 없으면 예전처럼 기준정보 값을 씀 · ' + (c && Math.round(+c.c).toLocaleString()));
}

// ---------- 27. 단가는 설정에서만 · 팀장은 자기 팀만 · 배정 인원 칸 ----------
await db.exec(fs.readFileSync('sql/27_cost_leader.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/27_cost_leader.sql', 'utf8')); // 두 번 실행해도 안전
await db.exec(`grant all on all tables in schema public to authenticated;`);
ok((await as('lead', () => q(`select erp_can('costset','edit') b`))).rows[0].b === true, '27: 팀장은 원가관리 설정 쓰기 권한');
ok((await as('staff', () => q(`select erp_can('costset','edit') b`))).rows[0].b === false, '27: 현장 사원은 원가관리 설정 쓰기 없음');
ok((await as('staff', () => q(`select erp_can('costset','view') b`))).rows[0].b === true, '27: 보기는 모두 가능');
// 자기 팀 (정상1팀) — 바꿀 수 있어야 함.  RLS 는 막을 때 오류가 아니라 '0줄 바뀜' 이므로 값으로 본다
await as('admin', () => q(`insert into erp_task_prices(team, grp, task, unit_price) values ('정상1팀','출고','검수2',100) on conflict do nothing`));
await as('lead', () => q(`update erp_task_prices set unit_price = 150 where team='정상1팀' and task='검수2'`));
ok((await as('admin', () => q(`select unit_price::int n from erp_task_prices where team='정상1팀' and task='검수2'`))).rows[0].n === 150, '27: 팀장은 자기 팀 단가 변경');
await as('lead', () => q(`insert into erp_task_prices(team, grp, task, unit_price) values ('정상1팀','출고','새업무27',10)`));
ok((await as('admin', () => q(`select count(*)::int n from erp_task_prices where team='정상1팀' and task='새업무27'`))).rows[0].n === 1, '27: 팀장은 자기 팀 업무 추가');
await as('lead', () => q(`update erp_task_prices set active = false where team='정상1팀' and task='새업무27'`));
ok((await as('admin', () => q(`select active from erp_task_prices where team='정상1팀' and task='새업무27'`))).rows[0].active === false, '27: 팀장은 자기 팀 업무 숨김');
// 다른 팀 (온라인팀) — 막혀야 함
await as('admin', () => q(`insert into erp_task_prices(team, grp, task, unit_price) values ('온라인팀','출고','고객출고',200) on conflict do nothing`));
await as('lead', () => q(`update erp_task_prices set unit_price = 999 where team='온라인팀' and task='고객출고'`));
ok((await as('admin', () => q(`select unit_price::int n from erp_task_prices where team='온라인팀' and task='고객출고'`))).rows[0].n === 200, '27: 팀장은 다른 팀 단가 못 바꿈');
ok(!!(await fails(() => as('lead', () => q(`insert into erp_task_prices(team, grp, task, unit_price) values ('온라인팀','출고','몰래추가',10)`)))), '27: 팀장은 다른 팀 업무 추가 차단');
await as('lead', () => q(`delete from erp_task_prices where team='온라인팀' and task='고객출고'`));
ok((await as('admin', () => q(`select count(*)::int n from erp_task_prices where team='온라인팀' and task='고객출고'`))).rows[0].n === 1, '27: 팀장은 다른 팀 업무 삭제 차단');
// 인건비는 그대로 관리자만
ok(!!(await fails(() => as('lead', () => q(`insert into erp_team_cost(team,year,labor_cost) values ('정상1팀',2023,1)`)))), '27: 팀장은 연도별 인건비 등록 차단 (그대로)');
// 배정 인원 칸
await as('sup', () => q(`insert into erp_headcount(work_date, team, office_count, alloc_count) values ('2026-11-13','정상1팀',7,38) on conflict (work_date,team) do update set office_count=excluded.office_count, alloc_count=excluded.alloc_count`));
ok((await as('sup', () => q(`select alloc_count::int n from erp_headcount where work_date='2026-11-13' and team='정상1팀'`))).rows[0].n === 38, '27: 지원팀이 배정 인원 입력');
ok((await as('staff', () => q(`select alloc_count::int n from erp_headcount where work_date='2026-11-13' and team='정상1팀'`))).rows[0].n === 38, '27: 배정 인원은 모두 볼 수 있음');
// 팀장이 자기 팀 현장확인만 올려도 사무실확인 · 배정 인원은 그대로 남아야 함 (칸을 따로 보내므로)
await as('lead', () => q(`insert into erp_headcount(work_date, team, field_count) values ('2026-11-13','정상1팀',9) on conflict (work_date,team) do update set field_count=excluded.field_count`));
{
  const r = (await as('admin', () => q(`select field_count::int f, office_count::int o, alloc_count::int a from erp_headcount where work_date='2026-11-13' and team='정상1팀'`))).rows[0];
  ok(r && r.f === 9 && r.o === 7 && r.a === 38, '27: 현장확인만 저장해도 사무실확인 · 배정 인원이 남음 · ' + JSON.stringify(r));
}

// ---------- 29. 대표님 지시 · 할 일 — 사람 단위 권한 ----------
await db.exec(fs.readFileSync('sql/29_ceo.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/29_ceo.sql', 'utf8')); // 두 번 실행해도 안전
await db.exec(`grant all on all tables in schema public to authenticated;`);
// 대표님 계정 하나 더 (등급 '대표') · 두 번째 관리자 계정 (명단에 없는 관리자)
U.ceo = '00000000-0000-0000-0000-000000000006'; U.adm2 = '00000000-0000-0000-0000-000000000007';
for (const k of ['ceo', 'adm2']) { await q(`insert into auth.users(id,email) values ($1,$2)`, [U[k], k + '@x']); await as(k, () => q(`insert into erp_profiles(id,login_id,name) values (auth.uid(),$1,$2)`, [k, k === 'ceo' ? '대표님' : '관리자2'])); }
await as('admin', () => q(`update erp_profiles set role_id='ceo', active=true where login_id='ceo'`));
await as('admin', () => q(`update erp_profiles set role_id='admin', active=true where login_id='adm2'`));
const cnt29 = async (who, t) => (await as(who, () => q(`select count(*)::int n from ${t}`))).rows[0].n;
// 처음: 명단이 비어 있으면 아무도 못 봄 · 사원은 자기를 넣을 수 없음
ok(!!(await fails(() => as('staff', () => q(`insert into erp_ceo_members(user_id, fixed) values (auth.uid(), true)`)))), '29: 사원은 처음 명단에 자기를 못 넣음');
ok(!!(await fails(() => as('admin', () => q(`insert into erp_ceo_members(user_id, fixed) values ($1, true)`, [U.ceo])))), '29: 처음에도 남을 넣을 수는 없음 (자기 자신만)');
await as('admin', () => q(`insert into erp_ceo_members(user_id, fixed) values (auth.uid(), true)`));
ok((await cnt29('admin', 'erp_ceo_members')) === 1, '29: 처음 한 번 — 관리자가 자기 자신을 고정으로');
ok(!!(await fails(() => as('adm2', () => q(`insert into erp_ceo_members(user_id, fixed) values (auth.uid(), true)`)))), '29: 명단이 생긴 뒤에는 다른 관리자가 스스로 들어올 수 없음');
await as('admin', () => q(`insert into erp_ceo_members(user_id, can_write, fixed) values ($1, true, true)`, [U.ceo]));
await as('admin', () => q(`insert into erp_ceo_members(user_id, can_write, fixed) values ($1, false, false)`, [U.lead]));
ok((await cnt29('admin', 'erp_ceo_members')) === 3, '29: 고정 인원이 대표님(고정) · 팀장(보기만) 추가');
ok(!!(await fails(() => as('admin', () => q(`insert into erp_ceo_members(user_id, can_write, fixed) values ($1, false, true)`, [U.sup])))), '29: 고정이면 쓰기는 꼭 켜져 있어야 함');
// 지시 · 할 일
await as('admin', () => q(`insert into erp_ceo_items(id, kind, title, rec_date, due) values ('d1','dir','런닝 품번은 반품 빼고 매장 운영','2026-11-10','2026-11-20')`));
await as('ceo', () => q(`insert into erp_ceo_items(id, kind, parent_id, title, owner) values ('t1','todo','d1','런닝 품번 정리 계획에 등록','물류관리팀')`));
ok((await cnt29('admin', 'erp_ceo_items')) === 2, '29: 행님 · 대표님 둘 다 쓰기');
ok((await cnt29('lead', 'erp_ceo_items')) === 2, '29: 보기만 받은 팀장도 읽기');
ok(!!(await fails(() => as('lead', () => q(`insert into erp_ceo_items(id, kind, title) values ('x1','mine','몰래')`)))), '29: 보기만 받은 사람은 쓰기 차단');
await as('lead', () => q(`update erp_ceo_items set title='바꿈' where id='d1'`));
ok((await as('admin', () => q(`select title from erp_ceo_items where id='d1'`))).rows[0].title !== '바꿈', '29: 보기만 받은 사람은 고치기 차단');
// 명단에 없는 사람 — 관리자라도 못 읽음
ok((await cnt29('adm2', 'erp_ceo_items')) === 0, '29: 명단에 없는 관리자는 0줄 (내용 못 읽음)');
ok((await cnt29('sup', 'erp_ceo_items')) === 0 && (await cnt29('staff', 'erp_ceo_items')) === 0, '29: 지원 · 사원도 0줄');
ok(!!(await fails(() => as('adm2', () => q(`insert into erp_ceo_items(id, kind, title) values ('x2','mine','몰래')`)))), '29: 명단에 없는 관리자는 쓰기 차단');
ok((await cnt29('adm2', 'erp_ceo_members')) === 3, '29: 관리자는 명단(누가 볼 수 있는지)만 보임');
ok((await cnt29('staff', 'erp_ceo_members')) === 0, '29: 사원은 명단도 안 보임');
// 고정 인원은 빼거나 바꿀 수 없음 · 고정이 아닌 사람은 고정 인원이 빼고 넣음
await as('admin', () => q(`delete from erp_ceo_members where user_id = $1`, [U.ceo]));
ok((await cnt29('admin', 'erp_ceo_members')) === 3, '29: 고정(대표님)은 뺄 수 없음');
await as('admin', () => q(`update erp_ceo_members set can_write = false where user_id = $1`, [U.ceo]));
ok((await as('admin', () => q(`select can_write from erp_ceo_members where user_id=$1`, [U.ceo]))).rows[0].can_write === true, '29: 고정 인원의 쓰기 권한은 못 끔');
await as('lead', () => q(`delete from erp_ceo_members where user_id = $1`, [U.lead]));
ok((await cnt29('admin', 'erp_ceo_members')) === 3, '29: 고정이 아닌 사람(팀장)은 명단을 못 바꿈');
await as('admin', () => q(`update erp_ceo_members set can_write = true where user_id = $1`, [U.lead]));
ok((await as('admin', () => q(`select can_write from erp_ceo_members where user_id=$1`, [U.lead]))).rows[0].can_write === true, '29: 고정 인원이 팀장에게 쓰기 켜기');
await as('admin', () => q(`delete from erp_ceo_members where user_id = $1`, [U.lead]));
ok((await cnt29('admin', 'erp_ceo_members')) === 2 && (await cnt29('lead', 'erp_ceo_items')) === 0, '29: 명단에서 빼면 바로 못 읽음');
// 할 일은 지시를 지우면 같이 지워짐 · 내용은 수정 이력에 안 남음
ok((await as('admin', () => q(`select count(*)::int n from erp_audit where tbl='erp_ceo_items'`))).rows[0].n === 0, '29: 지시 내용은 수정 이력에 남지 않음');
ok((await as('admin', () => q(`select count(*)::int n from erp_audit where tbl='erp_ceo_members'`))).rows[0].n > 0, '29: 명단 바뀐 기록은 남음');
await as('ceo', () => q(`delete from erp_ceo_items where id='d1'`));
ok((await cnt29('admin', 'erp_ceo_items')) === 0, '29: 지시를 지우면 붙은 할 일도 같이');
await db.exec(`reset role; set role anon;`); ok(!!(await fails(() => q(`select * from erp_ceo_items`))), '29: 로그인 안 한 사람 읽기 차단'); await db.exec(`reset role;`);
// 운영(Supabase) 화면은 저장할 때 upsert(= insert … on conflict do update) 를 씀 — 그 방식으로도 같은 규칙인지
{
  const UP_M = `insert into erp_ceo_members(user_id, can_write, fixed) values ($1, $2, $3) on conflict (user_id) do update set can_write = excluded.can_write, fixed = excluded.fixed`;
  const UP_I = `insert into erp_ceo_items(id, kind, title, done) values ($1, $2, $3, $4) on conflict (id) do update set title = excluded.title, done = excluded.done`;
  await db.exec(`delete from erp_ceo_members; delete from erp_ceo_items;`); // 업데이트 직후처럼 빈 명단으로
  await as('adm2', () => q(UP_M, [U.adm2, true, true]));
  ok((await cnt29('adm2', 'erp_ceo_members')) === 1, '29u: upsert 로 처음 시작 (관리자가 자기 자신을 고정으로)');
  await as('adm2', () => q(UP_M, [U.ceo, true, true]));
  ok((await cnt29('adm2', 'erp_ceo_members')) === 2, '29u: upsert 로 대표님 고정 추가');
  await as('adm2', () => q(UP_I, ['u1', 'mine', '할 일', false]));
  await as('ceo', () => q(UP_I, ['u1', 'mine', '고친 할 일', true]));
  const r = (await as('adm2', () => q(`select title, done from erp_ceo_items where id='u1'`))).rows[0];
  ok(r && r.title === '고친 할 일' && r.done === true, '29u: upsert 로 넣고 다른 고정 인원이 고치기');
  ok(!!(await fails(() => as('admin', () => q(UP_I, ['u2', 'mine', '몰래', false])))), '29u: 명단에 없는 관리자는 upsert 로도 못 씀');
  ok(!!(await fails(() => as('admin', () => q(UP_M, [U.admin, true, true])))), '29u: 명단이 생긴 뒤 다른 관리자가 upsert 로 스스로 못 들어옴');
  const blocked = await fails(() => as('adm2', () => q(UP_M, [U.ceo, false, false]))); // 고정 줄은 upsert 로 바꾸려 하면 오류로 막힘
  const c = (await as('adm2', () => q(`select can_write, fixed from erp_ceo_members where user_id=$1`, [U.ceo]))).rows[0];
  ok(!!blocked && c && c.can_write === true && c.fixed === true, '29u: 고정 인원은 upsert 로도 못 바꿈');
  await db.exec(`delete from erp_ceo_members; delete from erp_ceo_items;`);
}

// ---------- 30. 손익 자료 한 번에 (erp_pl_days_json) ----------
await db.exec(fs.readFileSync('sql/30_pl_json.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/30_pl_json.sql', 'utf8')); // 두 번 실행해도 안전
{
  const A = (await as('admin', () => q(`select d::text, team, coalesce(wk,'') wk, round(cost::numeric) c, round(sales::numeric) s from erp_pl_days('2025-01-01','2026-12-31') order by 1,2,3`))).rows;
  const J = (await as('admin', () => q(`select erp_pl_days_json('2025-01-01','2026-12-31') j`))).rows[0].j;
  const arr = typeof J === 'string' ? JSON.parse(J) : J;
  ok(Array.isArray(arr) && arr.length === A.length && A.length > 0, '30: 묶음 하나로 같은 줄 수 · ' + A.length + '줄');
  const B = arr.map((x) => [String(x.d).slice(0, 10), x.team, x.wk || '', Math.round(+x.cost), Math.round(+x.sales)].join('|')).sort();
  const AA = A.map((x) => [x.d, x.team, x.wk, +x.c, +x.s].join('|')).sort();
  ok(JSON.stringify(B) === JSON.stringify(AA), '30: 날짜 · 팀 · 주차 · 지출 · 매출이 기존 함수와 똑같음');
  const E = (await as('admin', () => q(`select erp_pl_days_json('1990-01-01','1990-01-02') j`))).rows[0].j;
  ok(JSON.stringify(typeof E === 'string' ? JSON.parse(E) : E) === '[]', '30: 자료 없는 기간은 빈 묶음');}

// ---------- 31. 수정 이력 자동 지우기 (erp_audit_trim) ----------
await db.exec(fs.readFileSync('sql/31_audit_trim.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/31_audit_trim.sql', 'utf8')); // 두 번 실행해도 안전
{
  const info = async (w) => { const r = (await as(w, () => q(`select erp_audit_trim_info() j`))).rows[0].j; return typeof r === 'string' ? JSON.parse(r) : r; };
  await db.exec(`delete from erp_settings where key = 'audit_keep_months'; delete from erp_audit;`);
  await db.exec(`insert into erp_audit(tbl,row_key,action,at) values ('erp_worklog','3년전','UPDATE', now() - interval '3 years'), ('erp_worklog','13개월전','UPDATE', now() - interval '13 months'), ('erp_worklog','어제','UPDATE', now() - interval '1 day')`);
  const d0 = await info('admin');
  ok(d0.months === 24 && d0.old === 1, '31: 처음은 2년 · 지울 것 1건 (' + d0.months + '개월 · ' + d0.old + '건)');
  const s1 = (await as('admin', () => q(`select erp_audit_trim_set(12) j`))).rows[0].j;
  ok((typeof s1 === 'string' ? JSON.parse(s1) : s1).months === 12, '31: 기간을 1년으로 바꿈');
  ok((await info('admin')).old === 2, '31: 1년으로 바꾸면 지울 것 2건');
  ok(await fails(() => as('staff', () => q(`select erp_audit_trim_set(36)`))), '31: 실무진은 기간을 못 바꿈');
  ok(await fails(() => as('staff', () => q(`select erp_audit_trim()`))), '31: 실무진은 못 지움');
  const n = (await as('admin', () => q(`select erp_audit_trim() n`))).rows[0].n;
  ok(n === 2, '31: 1년 지난 이력 2건만 지움 (' + n + '건)');
  // 설정을 바꾼 것 자체도 수정 이력에 남으므로 '어제' 줄이 살아 있는지 · 오래된 줄이 없는지로 본다
  const left = (await q(`select count(*)::int c, count(*) filter (where row_key = '어제')::int y, count(*) filter (where at < now() - interval '12 months')::int o from erp_audit`)).rows[0];
  ok(left.y === 1 && left.o === 0, '31: 최근 이력은 그대로 · 오래된 것만 사라짐 (' + left.c + '건 남음)');
  await as('admin', () => q(`select erp_audit_trim_set(0)`));
  await db.exec(`insert into erp_audit(tbl,row_key,action,at) values ('erp_worklog','5년전','UPDATE', now() - interval '5 years')`);
  const off = await info('admin');
  ok(off.months === 0 && off.old === 0, '31: 끄면 자동으로 지우지 않음');
  ok((await as('admin', () => q(`select erp_audit_trim() n`))).rows[0].n === 0, '31: 꺼 두면 밤에도 지우지 않음');
  ok((await q(`select count(*)::int c from erp_audit where row_key = '5년전'`)).rows[0].c === 1, '31: 꺼 둔 동안 오래된 이력도 그대로');
  await db.exec(`delete from erp_audit; delete from erp_settings where key = 'audit_keep_months';`);
}

// ---------- 32. 관리자가 계정 바로 만들기 (erp_add_user) ----------
// 점검판에는 Supabase 인증 표(auth.users)가 뼈대만 있으므로 쓰는 칸을 채워 두고,
// 비밀번호 암호화(pgcrypto)는 흉내만 낸다 — 실제 사이트에서는 bcrypt 로 들어간다
await db.exec(`
  alter table auth.users add column if not exists instance_id uuid;
  alter table auth.users add column if not exists aud text;
  alter table auth.users add column if not exists role text;
  alter table auth.users add column if not exists encrypted_password text;
  alter table auth.users add column if not exists email_confirmed_at timestamptz;
  alter table auth.users add column if not exists raw_app_meta_data jsonb;
  alter table auth.users add column if not exists created_at timestamptz;
  alter table auth.users add column if not exists updated_at timestamptz;
  alter table auth.users add column if not exists confirmation_token text;
  alter table auth.users add column if not exists recovery_token text;
  alter table auth.users add column if not exists email_change_token_new text;
  alter table auth.users add column if not exists email_change text;
  create table if not exists auth.identities (id uuid, user_id uuid, identity_data jsonb, provider text, provider_id text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
  create schema if not exists extensions;
  create or replace function extensions.gen_salt(t text) returns text language sql as $$ select 'bf$salt' $$;
  create or replace function extensions.crypt(p text, s text) returns text language sql as $$ select '$2a$' || md5(p || s) $$;
`);
await db.exec(fs.readFileSync('sql/32_add_user.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/32_add_user.sql', 'utf8')); // 두 번 실행해도 안전
{
  const add = (who, args) => as(who, () => q(`select erp_add_user($1,$2,$3,$4,$5,$6,$7,$8) j`, args));
  ok(await fails(() => add('staff', ['daepyo', 'abcd1234!', '대표님', 'admin', null, null, null, []])), '32: 실무진은 계정을 못 만듦');
  ok(await fails(() => add('admin', ['ce', 'abcd1234!', '대표님', 'admin', null, null, null, []])), '32: 너무 짧은 아이디 막음');
  ok(await fails(() => add('admin', ['대표', 'abcd1234!', '대표님', 'admin', null, null, null, []])), '32: 한글 아이디 막음');
  ok(await fails(() => add('admin', ['ceo', 'short', '대표님', 'admin', null, null, null, []])), '32: 8자 미만 비밀번호 막음');
  ok(await fails(() => add('admin', ['daepyo', 'abcd1234!', '', 'admin', null, null, null, []])), '32: 이름 없으면 막음');
  ok(await fails(() => add('admin', ['daepyo', 'abcd1234!', '대표님', '없는등급', null, null, null, []])), '32: 없는 등급 막음');
  const r = (await add('admin', ['DAEPYO', 'abcd1234!', ' 대표님 ', 'admin', '경영지원', '대표이사', '010-0000-0000', []])).rows[0].j;
  const j = typeof r === 'string' ? JSON.parse(r) : r;
  ok(j.login_id === 'daepyo' && j.email === 'daepyo@hyeseong.erp' && j.name === '대표님', '32: 대문자 아이디는 소문자로 · 이메일은 @hyeseong.erp (' + j.login_id + ' · ' + j.email + ')');
  const p = (await q(`select * from erp_profiles where login_id = 'daepyo'`)).rows[0];
  ok(p && p.active === true && p.role_id === 'admin' && p.name === '대표님', '32: 승인 없이 바로 쓰는 계정 (등급 ' + (p || {}).role_id + ')');
  const u = (await q(`select * from auth.users where email = 'daepyo@hyeseong.erp'`)).rows[0];
  ok(u && u.encrypted_password && u.encrypted_password !== 'abcd1234!', '32: 비밀번호는 암호화해서 넣음');
  ok(u && u.email_confirmed_at !== null && u.aud === 'authenticated', '32: 메일 확인 없이 바로 로그인 가능한 상태');
  ok((await q(`select count(*)::int c from auth.identities where user_id = $1`, [u.id])).rows[0].c === 1, '32: 로그인 종류(identity)도 같이 들어감');
  ok(await fails(() => add('admin', ['daepyo', 'abcd1234!', '또 대표님', 'admin', null, null, null, []])), '32: 같은 아이디 두 번 막음');
  await db.exec(`delete from erp_profiles where login_id = 'daepyo'; delete from auth.identities where user_id in (select id from auth.users where email = 'daepyo@hyeseong.erp'); delete from auth.users where email = 'daepyo@hyeseong.erp';`);
}

// ===== 33. 이월팀 — 시즌반품정리현황 · 선지시출고현황 (sql/33_iwol.sql) =====
await db.exec(fs.readFileSync('sql/33_iwol.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/33_iwol.sql', 'utf8')); // 두 번 실행해도 안전
await db.exec(`grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated; grant execute on all functions in schema public to authenticated;`);
{
  // 'other'(실무진)를 이월소터팀으로 — 이 팀 사람만 올릴 수 있는지 보려고
  //  (앞의 191~193절에서 'other' 를 사용 중지로 바꿔 두었으므로 다시 켠다)
  await db.exec(`update erp_profiles set teams='{온라인팀,이월소터팀}', active=true where login_id='other'`);
  const perms = (await q(`select id, perms -> 'iwol' p from erp_roles where id <> 'pending' order by id`)).rows;
  ok(perms.length === 5 && perms.every((r) => r.p && r.p.view === true), '33: 승인 뒤 모든 등급이 보기 권한을 가짐 (전체 공개)');
  ok((perms.find((r) => r.id === 'ceo') || {}).p.create == null, '33: 대표님 등급은 보기만');
  const ins = (who, sty) => as(who, () => q(`insert into erp_iw_ord(style,brand,season,cls,grp,store) values ($1,'파리','F1','TS','이너',100)`, [sty]));
  ok(!(await fails(() => ins('other', 'A1'))), '33: 이월소터팀은 올릴 수 있음');
  ok(!(await fails(() => ins('admin', 'A2'))), '33: 관리자는 올릴 수 있음');
  ok(await fails(() => ins('staff', 'A3')), '33: 다른 팀 실무진은 못 올림');
  ok(await fails(() => ins('sup', 'A4')), '33: 지원팀(이월소터팀 아님)도 못 올림');
  ok((await as('staff', () => q(`select count(*)::int n from erp_iw_ord`))).rows[0].n === 2, '33: 보기는 다른 팀도 다 됨');
  ok(await fails(async () => { const r = await as('staff', () => q(`delete from erp_iw_ord where style='A1' returning style`)); if (!r.rows.length) throw new Error('0 rows'); }), '33: 다른 팀은 못 지움');
  ok((await as('other', () => q(`delete from erp_iw_ord where style='A1' returning style`))).rows.length === 1, '33: 이월소터팀은 지울 수 있음');
  // 열쇠(중복 방지) — 같은 줄을 두 번 넣으면 쌓이지 않고 덮어써야 함
  await as('other', () => q(`insert into erp_iw_shp(source_key,d,style,brand,season,grp,kind,qty) values ('K1','2026-11-20','5AAF1T001','파리','F1','이너','store',300)
    on conflict (source_key) do update set qty = excluded.qty`));
  await as('other', () => q(`insert into erp_iw_shp(source_key,d,style,brand,season,grp,kind,qty) values ('K1','2026-11-20','5AAF1T001','파리','F1','이너','store',300)
    on conflict (source_key) do update set qty = excluded.qty`));
  ok((await as('other', () => q(`select count(*)::int n, sum(qty)::int s from erp_iw_shp`))).rows[0].s === 300, '33: 같은 열쇠는 두 번 안 쌓임');
  // 기준값 · 줄별 시작일 · 인원 · 띠
  await as('other', () => q(`insert into erp_iw_set(key,val) values ('out','{"sorter":30000}'::jsonb) on conflict (key) do update set val = excluded.val`));
  await as('other', () => q(`insert into erp_iw_sst(kind,gkey,start_date) values ('ret','파리|F1|이너','2026-12-07') on conflict (kind,gkey) do update set start_date = excluded.start_date`));
  await as('other', () => q(`insert into erp_iw_man(kind,grp,d,people) values ('out','이너','2026-11-20',12) on conflict (kind,grp,d) do update set people = excluded.people`));
  await as('other', () => q(`insert into erp_iw_band(id,lane,s,e,label,color) values ('b1',0,'2026-11-20','2026-11-25','1차 봄의류','#1E7A4B')`));
  const n = (await as('staff', () => q(`select (select count(*) from erp_iw_set) a, (select count(*) from erp_iw_sst) b, (select count(*) from erp_iw_man) c, (select count(*) from erp_iw_band) d`))).rows[0];
  ok(+n.a === 1 && +n.b === 1 && +n.c === 1 && +n.d === 1, '33: 기준값 · 시작일 · 인원 · 일정 띠 표가 다 들어감');
  ok(await fails(() => as('staff', () => q(`insert into erp_iw_band(id,lane,s,e,label) values ('b2',0,'2026-11-20','2026-11-25','몰래')`))), '33: 다른 팀은 띠를 못 더함');
}

// ===== 34. 사용자 관리 — 삭제 · 아이디 · 비밀번호 (sql/34_user_admin.sql) =====
await db.exec(fs.readFileSync('sql/34_user_admin.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/34_user_admin.sql', 'utf8')); // 두 번 실행해도 안전
await db.exec(`grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;`);
{
  const add = (who, args) => as(who, () => q(`select erp_add_user($1,$2,$3,$4,$5,$6,$7,$8) j`, args));
  const J = (r) => { const v = r.rows[0].j; return typeof v === 'string' ? JSON.parse(v) : v; };
  const made = J(await add('admin', ['temp1', 'abcd1234!', '임시사람', 'staff', '현장', '사원', '010-1111-2222', ['정상1팀']]));
  const uid = made.id;
  // 비밀번호
  ok(await fails(() => as('staff', () => q(`select erp_set_password($1,'newpass123')`, [uid]))), '34: 실무진은 비밀번호를 못 바꿈');
  ok(await fails(() => as('admin', () => q(`select erp_set_password($1,'short')`, [uid]))), '34: 8자 미만 비밀번호 막음');
  const before = (await q(`select encrypted_password p from auth.users where id = $1`, [uid])).rows[0].p;
  await as('admin', () => q(`select erp_set_password($1,'newpass123')`, [uid]));
  const after = (await q(`select encrypted_password p from auth.users where id = $1`, [uid])).rows[0].p;
  ok(before !== after && after !== 'newpass123', '34: 비밀번호가 암호화되어 바뀜');
  // 아이디
  ok(await fails(() => as('staff', () => q(`select erp_set_login_id($1,'temp2')`, [uid]))), '34: 실무진은 아이디를 못 바꿈');
  ok(await fails(() => as('admin', () => q(`select erp_set_login_id($1,'임시')`, [uid]))), '34: 한글 아이디 막음');
  ok(await fails(() => as('admin', () => q(`select erp_set_login_id($1,'ab')`, [uid]))), '34: 너무 짧은 아이디 막음');
  ok(await fails(() => as('admin', () => q(`select erp_set_login_id($1,'admin')`, [uid]))), '34: 이미 있는 아이디 막음');
  await as('admin', () => q(`select erp_set_login_id($1,'TEMP2')`, [uid]));
  const chg = (await q(`select p.login_id l, u.email e from erp_profiles p join auth.users u on u.id = p.id where p.id = $1`, [uid])).rows[0];
  ok(chg.l === 'temp2' && chg.e === 'temp2@hyeseong.erp', '34: 아이디는 소문자로 · 로그인 메일도 같이 바뀜 (' + chg.l + ' · ' + chg.e + ')');
  // 삭제
  ok(await fails(() => as('staff', () => q(`select erp_del_user($1,'임시사람')`, [uid]))), '34: 실무진은 사용자를 못 지움');
  ok(await fails(() => as('admin', () => q(`select erp_del_user($1,'딴이름')`, [uid]))), '34: 이름이 다르면 막음');
  ok(await fails(() => as('admin', () => q(`select erp_del_user((select id from erp_profiles where login_id='admin'),'배중열')`))), '34: 자기 자신은 못 지움');
  await as('admin', () => q(`select erp_del_user($1,'임시사람')`, [uid]));
  ok((await q(`select count(*)::int n from erp_profiles where id = $1`, [uid])).rows[0].n === 0, '34: 명단에서 지워짐');
  ok((await q(`select count(*)::int n from auth.users where id = $1`, [uid])).rows[0].n === 0, '34: 로그인 계정도 지워짐');
  const g = (await q(`select * from erp_gone_user where id = $1`, [uid])).rows[0];
  ok(g && g.name === '임시사람' && g.login_id === 'temp2', '34: 지난 사람에 이름 · 아이디가 남음 (' + (g ? g.name : '없음') + ')');
  ok((await as('staff', () => q(`select count(*)::int n from erp_gone_user`))).rows[0].n === 1, '34: 지난 사람 명단은 모두 볼 수 있음 (작성자 이름 찾기)');
  ok(await fails(() => as('admin', () => q(`insert into erp_gone_user(id,name) values (gen_random_uuid(),'손으로')`))), '34: 지난 사람 명단은 손으로 못 넣음 (함수로만)');
  // 관리자 등급도 (다른 관리자가 있으면) 지울 수 있다 · 지원팀은 못 지운다
  const m2 = J(await add('admin', ['temp3', 'abcd1234!', '임시관리', 'admin', null, null, null, []]));
  ok(await fails(() => as('sup', () => q(`select erp_del_user($1,'임시관리')`, [m2.id]))), '34: 지원팀은 사용자를 못 지움');
  await as('admin', () => q(`select erp_del_user($1,'임시관리')`, [m2.id]));
  ok((await q(`select count(*)::int n from erp_profiles where login_id = 'temp3'`)).rows[0].n === 0, '34: 다른 관리자가 있으면 관리자도 지워짐');
}

// ===== WHERE 없는 DELETE 금지 (2026-11-25 · 운영 사이트에서 "DELETE requires a WHERE clause" 로 저장 공간 정리가 막혔음) =====
//  Supabase 는 WHERE 없는 DELETE 를 막는다 — security definer 함수 안이라도 세션 설정이 따라온다.
//  이 점검판(PGlite)에는 그 설정이 없어 함수로는 재현이 안 되므로, SQL 파일 글자를 직접 본다.
{
  const bad = [];
  for (const f of fs.readdirSync('sql').filter((x) => /^\d\d_.*\.sql$/.test(x))) {
    const src = fs.readFileSync('sql/' + f, 'utf8').replace(/--[^\n]*/g, '');
    // 문장 단위로 잘라 'delete from …' 에 where 가 있는지 본다
    src.split(';').forEach((st) => { const m = st.match(/\bdelete\s+from\s+[\w.]+/i); if (m && !/\bwhere\b/i.test(st.slice(st.search(/\bdelete\s+from\b/i)))) bad.push(f + ': ' + m[0]); });
  }
  ok(!bad.length, 'SQL: WHERE 없는 DELETE 가 없음' + (bad.length ? ' — ' + bad.join(' · ') : ''));
}

// ===== 35. 이월팀 운영 기간 · 마감 확정 · 넘기기 (sql/35_iwol_term.sql) =====
{
  // 33절에서 시험으로 넣은 줄(A2 · K1)은 치우고 시작 — 넘어갈 수량을 정확히 세려고
  await db.exec(`delete from erp_iw_ord where style in ('A1','A2','A3','A4'); delete from erp_iw_shp where source_key = 'K1';`);
  // 33절에서 넣은 자료가 있는 상태에서 35 를 돌린다 → 지금 기간으로 붙어야 함
  await as('other', () => q(`insert into erp_iw_ord(style,brand,season,cls,grp,store,online,rest) values ('P1','파리','F1','TS','이너',700,200,100),('P2','핑','F2','TS','이너',300,0,0) on conflict (style) do nothing`));
  await as('other', () => q(`insert into erp_iw_inv(style,brand,season,cls,grp,qty) values ('P1','파리','F1','TS','이너',1000) on conflict (style) do nothing`));
  await as('other', () => q(`insert into erp_iw_cnt(source_key,d,style,brand,season,grp,qty) values ('C1','2026-11-20','P1','파리','F1','이너',400) on conflict (source_key) do nothing`));
  await as('other', () => q(`insert into erp_iw_shp(source_key,d,style,brand,season,grp,kind,qty) values ('S1','2026-11-20','P1','파리','F1','이너','store',500),('S2','2026-11-20','P1','파리','F1','이너','online',50),('S3','2026-11-21','P2','핑','F2','이너','store',300) on conflict (source_key) do nothing`));
}
await db.exec(fs.readFileSync('sql/35_iwol_term.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/35_iwol_term.sql', 'utf8')); // 두 번 실행해도 안전
await db.exec(`grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;`);
{
  const T0 = (await q(`select erp_iw_cur_term() t`)).rows[0].t;
  const T1 = (await q(`select erp_iw_next_term($1) t`, [T0])).rows[0].t;
  ok(/^20\d\dH[12]$/.test(T0) && /^20\d\dH[12]$/.test(T1) && T0 !== T1, '35: 지금 기간 ' + T0 + ' · 다음 기간 ' + T1);
  ok((await q(`select erp_iw_next_term('2026H2') t`)).rows[0].t === '2027H1' && (await q(`select erp_iw_next_term('2027H1') t`)).rows[0].t === '2027H2', '35: 하반기 다음은 이듬해 상반기');
  ok((await q(`select erp_iw_term_label('2026H2') t`)).rows[0].t === '2026 하반기', '35: 기간 이름 = 2026 하반기');
  ok((await q(`select count(*)::int n from erp_iw_ord where term is null or term = ''`)).rows[0].n === 0, '35: 이미 있던 자료가 모두 지금 기간으로 붙음');
  ok((await q(`select count(*)::int n from erp_iw_term where term = $1`, [T0])).rows[0].n === 1, '35: 지금 기간 줄이 만들어짐');
  // 같은 품번이 기간마다 따로 있을 수 있음
  await as('other', () => q(`insert into erp_iw_ord(term,style,brand,season,cls,grp,store) values ('2099H1','P1','파리','F1','TS','이너',1)`));
  ok((await q(`select count(*)::int n from erp_iw_ord where style = 'P1'`)).rows[0].n === 2, '35: 같은 품번이 다른 기간에 따로 들어감 (열쇠 = 기간 + 품번)');
  await db.exec(`delete from erp_iw_ord where term = '2099H1'`);
  // 미리 보기 — P1: 지시 700·200·100 − 출고 500·50·0 = 200·150·100 (450) · P2: 300 − 300 = 0 (안 넘어감)
  const pv = (await as('other', () => q(`select erp_iw_close_preview($1) j`, [T0]))).rows[0].j;
  const P = typeof pv === 'string' ? JSON.parse(pv) : pv;
  ok(+P.ord_styles === 1 && +P.ord_qty === 450, '35: 넘어갈 배분지시 = 안 끝난 1품번 · 450장 (다 끝난 P2 는 빠짐) · ' + P.ord_styles + ' / ' + P.ord_qty);
  ok(+P.inv_styles === 1 && +P.inv_qty === 600, '35: 넘어갈 정리 기준 = 1,000 − 400 = 600장');
  // 권한
  ok(await fails(() => as('staff', () => q(`select erp_iw_close($1)`, [T0]))), '35: 다른 팀 실무진은 마감 못 함');
  ok(await fails(() => as('sup', () => q(`select erp_iw_close($1)`, [T0]))), '35: 지원팀도 마감 못 함');
  ok(await fails(() => as('other', () => q(`select erp_iw_close($1)`, [T0]))), '35: 이월소터팀 실무진도 마감 못 함 (관리자만)');
  ok(await fails(() => as('admin', () => q(`select erp_iw_close('2001H1')`))), '35: 자료 없는 기간은 마감 못 함');
  // 마감 (관리자)
  const cr = (await as('admin', () => q(`select erp_iw_close($1) j`, [T0]))).rows[0].j;
  const C = typeof cr === 'string' ? JSON.parse(cr) : cr;
  ok(+C.ord_moved === 1 && +C.inv_moved === 1, '35: 마감하면서 배분지시 1 · 정리 기준 1 이 넘어감');
  const np = (await q(`select * from erp_iw_ord where term = $1 and style = 'P1'`, [T1])).rows[0];
  ok(np && +np.store === 200 && +np.online === 150 && +np.rest === 100, '35: 매장 · 온라인 · 잔량을 따로 빼서 넘김 (200 · 150 · 100)');
  ok((await q(`select count(*)::int n from erp_iw_ord where term = $1 and style = 'P2'`, [T1])).rows[0].n === 0, '35: 다 끝난 품번은 안 넘어감');
  ok(+(await q(`select qty from erp_iw_inv where term = $1 and style = 'P1'`, [T1])).rows[0].qty === 600, '35: 정리 기준은 남은 600장으로 넘어감');
  ok((await q(`select count(*)::int n from erp_iw_shp where term = $1`, [T1])).rows[0].n === 0, '35: 출고 실적은 안 넘어감 (지난 기간에 그대로)');
  ok((await q(`select closed from erp_iw_term where term = $1`, [T0])).rows[0].closed === true, '35: 지난 기간이 잠김');
  ok(await fails(() => as('admin', () => q(`select erp_iw_close($1)`, [T0]))), '35: 두 번 마감 못 함');
  // 잠긴 기간에는 쓰기 막힘 (RLS 는 오류가 아니라 0줄로 지나가는 경우가 있어 값으로 본다)
  await fails(() => as('other', () => q(`insert into erp_iw_ord(term,style,brand,season,cls,grp,store) values ($1,'NEW','핑','F1','TS','이너',1)`, [T0])));
  ok((await q(`select count(*)::int n from erp_iw_ord where term = $1 and style = 'NEW'`, [T0])).rows[0].n === 0, '35: 잠긴 기간에는 새 줄을 못 넣음');
  await as('other', () => q(`update erp_iw_ord set store = 1 where term = $1 and style = 'P1'`, [T0]));
  ok(+(await q(`select store from erp_iw_ord where term = $1 and style = 'P1'`, [T0])).rows[0].store === 700, '35: 잠긴 기간 숫자는 못 고침');
  await as('other', () => q(`delete from erp_iw_ord where term = $1 and style = 'P1'`, [T0]));
  ok((await q(`select count(*)::int n from erp_iw_ord where term = $1 and style = 'P1'`, [T0])).rows[0].n === 1, '35: 잠긴 기간 줄은 못 지움');
  // 다음 기간은 그대로 쓸 수 있음
  await as('other', () => q(`update erp_iw_ord set store = 210 where term = $1 and style = 'P1'`, [T1]));
  ok(+(await q(`select store from erp_iw_ord where term = $1 and style = 'P1'`, [T1])).rows[0].store === 210, '35: 다음 기간은 고칠 수 있음');
  ok((await as('staff', () => q(`select count(*)::int n from erp_iw_ord where term = $1`, [T0]))).rows[0].n >= 1, '35: 잠긴 기간도 보기는 다 됨');
  // 해제는 관리자만
  ok(await fails(() => as('other', () => q(`select erp_iw_reopen($1)`, [T0]))), '35: 이월소터팀 실무진은 마감 해제 못 함');
  await as('admin', () => q(`select erp_iw_reopen($1)`, [T0]));
  ok((await q(`select closed from erp_iw_term where term = $1`, [T0])).rows[0].closed === false, '35: 관리자는 마감 해제 가능');
  ok(await fails(() => as('admin', () => q(`update erp_iw_term set closed = true where term = $1 returning term`, [T0]).then((r) => { if (!r.rows.length) throw new Error('0 rows'); }))), '35: 기간 표는 손으로 못 고침 (함수로만)');
}

// ===== 36. 팀장 자체 회의록 (sql/36_tlmeet.sql) =====
//  Supabase 의 파일 저장소(storage) 흉내 — 칸(buckets) · 파일(objects) 표만
await db.exec(`create schema if not exists storage;
create table if not exists storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated; grant all on storage.objects to authenticated; grant select on storage.buckets to authenticated;`);
await db.exec(fs.readFileSync('sql/36_tlmeet.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/36_tlmeet.sql', 'utf8')); // 두 번 실행해도 안전
await db.exec(`grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;`);
{
  const R = async (id) => (await q(`select perms->'tlmeet' p from erp_roles where id=$1`, [id])).rows[0].p;
  ok((await R('leader')).create === true && (await R('support')).create === true && (await R('admin')).create === true, '36: 팀장 · 업무지원팀 · 관리자 = 보기 + 쓰기');
  ok((await R('ceo')).view === true && !(await R('ceo')).create && (await R('staff')) == null, '36: 대표 = 보기만 · 실무진 = 없음');
  const B = (await q(`select public, file_size_limit from storage.buckets where id='tlmeet'`)).rows[0];
  ok(B && B.public === false && +B.file_size_limit === 10485760, '36: 파일 저장소 칸 tlmeet — 공개 안 함 · 파일 하나 10MB');
  // 회의 만들기
  const m1 = (await as('lead', () => q(`select erp_tl_new_meet('2026-11-18','주간 팀장 회의') j`))).rows[0].j;
  ok(m1.id === '2026-11-18' && +m1.carried === 0, '36: 팀장이 첫 회의를 만듦 (넘어온 업무 0)');
  ok(await fails(() => as('staff', () => q(`select erp_tl_new_meet('2026-11-19')`))), '36: 실무진은 회의를 못 만듦');
  // 업무 쓰기 — 팀장은 자기 팀만
  await as('lead', () => q(`insert into erp_tl_item(id,meet_id,root,team,sort,title,status,pct) values ('a1','2026-11-18','a1','정상1팀',1,'FW 재고 실사','run',70),('a2','2026-11-18','a2','정상1팀',2,'마무트 정리','run',90)`));
  ok((await q(`select count(*)::int n from erp_tl_item where team='정상1팀'`)).rows[0].n === 2, '36: 팀장이 자기 팀 업무를 씀');
  ok(await fails(() => as('lead', () => q(`insert into erp_tl_item(id,meet_id,root,team,title) values ('x1','2026-11-18','x1','온라인팀','남의 팀')`))), '36: 팀장은 다른 팀 업무를 못 씀');
  await as('lead', () => q(`insert into erp_tl_item(id,meet_id,root,team,title) values ('c1','2026-11-18','c1','공통 · 기타','장호원 JWMS 연결')`));
  ok((await q(`select count(*)::int n from erp_tl_item where id='c1'`)).rows[0].n === 1, '36: 공통 · 기타는 누구나 씀');
  ok(await fails(() => as('sup', () => q(`insert into erp_tl_item(id,meet_id,root,team,title) values ('x2','2026-11-18','x2','정상1팀','지원팀이 정상팀 업무')`))), '36: 업무지원팀은 정상1팀 업무를 못 씀');
  await as('sup', () => q(`insert into erp_tl_item(id,meet_id,root,team,title,status,pct) values ('s1','2026-11-18','s1','지원팀','V12 판촉집기 출고','run',65)`));
  ok((await q(`select count(*)::int n from erp_tl_item where id='s1'`)).rows[0].n === 1, '36: 업무지원팀은 지원팀 업무를 씀');
  // 지시사항 칸 — 관리자만
  ok(await fails(() => as('lead', () => q(`insert into erp_tl_item(id,meet_id,root,team,title,ceo) values ('x3','2026-11-18','x3','정상1팀','지시 몰래','대표님 말씀')`))), '36: 팀장은 대표님 지시를 못 씀');
  ok(await fails(() => as('lead', () => q(`update erp_tl_item set gm='총괄 말씀' where id='a1'`))), '36: 팀장은 자기 팀 줄에도 총괄 지시를 못 넣음');
  await as('admin', () => q(`insert into erp_tl_item(id,meet_id,root,team,title,ceo,status,pct) values ('i1','2026-11-18','i1','입고반품팀','27년 초두 입고','바니 초두 12/05 매장 도착','run',45)`));
  await as('admin', () => q(`update erp_tl_item set gm='인원 추가 지원팀과 협의' where id='a1'`));
  const a1 = (await q(`select * from erp_tl_item where id='a1'`)).rows[0]; const i1 = (await q(`select * from erp_tl_item where id='i1'`)).rows[0];
  const ds = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  ok(ds(i1.ceo_d) === '2026-11-18' && ds(a1.gm_d) === '2026-11-18', '36: 지시사항에 그 회의 날짜가 같이 남음');
  // 팀장이 진행만 고치면 지시사항은 그대로 · 완료는 100%
  await as('lead', () => q(`update erp_tl_item set status='done', pct=50 where id='a2'`));
  await as('lead', () => q(`update erp_tl_item set pct=80, detail='SS 완료 · 차이 0' where id='a1'`));
  const a1b = (await q(`select * from erp_tl_item where id='a1'`)).rows[0];
  ok(+(await q(`select pct from erp_tl_item where id='a2'`)).rows[0].pct === 100, '36: 완료로 바꾸면 진행률 100%');
  ok(+a1b.pct === 80 && a1b.gm === '인원 추가 지원팀과 협의', '36: 팀장이 진행률을 고쳐도 관리자 지시는 그대로');
  // 보기 권한
  ok((await as('staff', () => q(`select count(*)::int n from erp_tl_item`))).rows[0].n === 0, '36: 실무진은 회의록을 못 봄');
  ok((await as('sup', () => q(`select count(*)::int n from erp_tl_item`))).rows[0].n === 5, '36: 업무지원팀은 전 팀 회의록을 봄 (5줄)');
  // 별도 파일 — 자기 팀 업무에만 붙임
  await as('lead', () => q(`insert into erp_tl_file(id,root,name,path,mime,size) values ('f1','a2','마무트_정리.png','a2/f1.jpg','image/jpeg',300000),('f2','a1','실사.pdf','a1/f2.pdf','application/pdf',800000)`));
  ok((await q(`select count(*)::int n from erp_tl_file`)).rows[0].n === 2, '36: 팀장이 자기 팀 업무에 파일을 붙임');
  ok(await fails(() => as('lead', () => q(`insert into erp_tl_file(id,root,name,path) values ('fx','i1','남의팀.png','i1/fx.png')`))), '36: 다른 팀 업무에는 파일을 못 붙임');
  await as('lead', () => q(`insert into storage.objects(bucket_id,name,owner) values ('tlmeet','a1/f2.pdf',auth.uid())`));
  ok((await q(`select count(*)::int n from storage.objects where bucket_id='tlmeet'`)).rows[0].n === 1, '36: 팀장은 파일 저장소에 올릴 수 있음');
  ok(await fails(() => as('staff', () => q(`insert into storage.objects(bucket_id,name) values ('tlmeet','zz/x.png')`))), '36: 실무진은 파일 저장소에 못 올림');
  ok((await as('staff', () => q(`select count(*)::int n from storage.objects where bucket_id='tlmeet'`))).rows[0].n === 0, '36: 실무진은 저장된 파일을 못 엶');
  // 새 회의 — 안 끝난 업무만 넘어옴 (a1 진행 · c1 · s1 · i1 = 4 · a2 완료는 빠짐)
  const m2 = (await as('lead', () => q(`select erp_tl_new_meet('2026-11-25') j`))).rows[0].j;
  ok(m2.id === '2026-11-25' && +m2.carried === 4 && m2.from === '2026-11-18', '36: 새 회의에 안 끝난 업무 4건이 넘어옴 (완료 1건 빠짐) · ' + m2.carried);
  const c = (await q(`select * from erp_tl_item where meet_id='2026-11-25' and root='i1'`)).rows[0];
  ok(c && c.carried === true && c.ceo === '바니 초두 12/05 매장 도착' && ds(c.ceo_d) === '2026-11-18' && +c.pct === 45, '36: 넘어온 업무는 지시사항 · 지시 날짜(11-18) · 진행률을 그대로 가짐 (팀장이 만들어도)');
  ok((await q(`select count(*)::int n from erp_tl_item where meet_id='2026-11-25' and root='a2'`)).rows[0].n === 0, '36: 완료한 업무는 안 넘어옴');
  const m3 = (await as('lead', () => q(`select erp_tl_new_meet('2026-11-25') j`))).rows[0].j;
  ok(m3.existed === true && +m3.carried === 0 && (await q(`select count(*)::int n from erp_tl_item where meet_id='2026-11-25'`)).rows[0].n === 4, '36: 같은 날짜를 또 누르면 있던 회의를 엶 (두 번 복사 안 함)');
  // 지우기
  const p1 = (await as('lead', () => q(`select erp_tl_del_item('a2') p`))).rows[0].p;
  ok(Array.isArray(p1) && p1.length === 1 && p1[0] === 'a2/f1.jpg' && (await q(`select count(*)::int n from erp_tl_file where root='a2'`)).rows[0].n === 0, '36: 업무를 지우면 다른 회의에 없는 그 업무 파일도 정리 (저장소 위치를 돌려줌)');
  ok(await fails(() => as('lead', () => q(`select erp_tl_del_item('i1')`))), '36: 팀장은 다른 팀 업무를 못 지움');
  ok(await fails(() => as('lead', () => q(`select erp_tl_del_meet('2026-11-18')`))), '36: 팀장은 회의를 못 지움');
  const p2 = (await as('admin', () => q(`select erp_tl_del_meet('2026-11-18') p`))).rows[0].p;
  ok((await q(`select count(*)::int n from erp_tl_meet where id='2026-11-18'`)).rows[0].n === 0 && (await q(`select count(*)::int n from erp_tl_item where meet_id='2026-11-18'`)).rows[0].n === 0, '36: 관리자는 회의를 지움 (업무 같이 지워짐)');
  ok(Array.isArray(p2) && p2.length === 0 && (await q(`select count(*)::int n from erp_tl_file where root='a1'`)).rows[0].n === 1, '36: 다음 회의로 이어진 업무의 파일은 남음');
  // 넘어온 줄의 root · carried 는 못 바꿈
  await as('admin', () => q(`update erp_tl_item set root='zz', carried=false where meet_id='2026-11-25' and root='a1'`));
  ok((await q(`select count(*)::int n from erp_tl_item where meet_id='2026-11-25' and root='a1' and carried`)).rows[0].n === 1, '36: 이어진 업무 표시(root · carried)는 고쳐지지 않음');
}

console.log('done');
