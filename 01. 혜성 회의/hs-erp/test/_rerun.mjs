import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
process.chdir('/home/claude/hs-erp');
const db = new PGlite();
await db.exec(`create role authenticated; create role anon; create schema auth;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create publication supabase_realtime; grant usage on schema public to authenticated; grant usage on schema auth to authenticated;
create schema if not exists net; create table if not exists net._http_response(id bigint primary key, status_code int, content text, error_msg text);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $f$ select 1::bigint $f$;
create or replace function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $f$ select 1::bigint $f$;
`);
const files = fs.readdirSync('sql').filter(f => /^\d\d_.*\.sql$/.test(f)).sort();
const runAll = async () => { for (const f of files) { try { await db.exec(fs.readFileSync('sql/' + f, 'utf8')); } catch (e) { console.log('ERR', f, e.message); throw e; } } };
await runAll();
const tabs = (await db.query(`select table_name from information_schema.tables where table_schema='public' and table_name like 'erp\\_%' and table_type='BASE TABLE' order by 1`)).rows.map(r => r.table_name);
// 사용자가 바꾼 것처럼: 모든 테이블의 jsonb/text 칸 일부 수정은 어려우니 → 스냅샷 후 일부 직접 수정
const snap = async () => { const o = {}; for (const t of tabs) { o[t] = JSON.stringify((await db.query(`select * from ${t} order by 1`)).rows); } return o; };

await db.exec(`update erp_roles set perms = jsonb_set(jsonb_set(perms, '{kpi,edit}', 'false'), '{csdata,create}', 'false') where id in ('leader','support')`);
const before=(await db.query(`select id, perms->'kpi'->>'edit' k, perms->'csdata'->>'create' c from erp_roles order by 1`)).rows;
await runAll();
const after=(await db.query(`select id, perms->'kpi'->>'edit' k, perms->'csdata'->>'create' c from erp_roles order by 1`)).rows;
console.log(JSON.stringify(before)); console.log(JSON.stringify(after));
