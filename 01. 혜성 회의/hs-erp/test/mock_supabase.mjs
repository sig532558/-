// Supabase Management API 모의 서버 — 실제 SQL은 PGlite로 실행
import http from 'http';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
await db.exec(`create role authenticated; create role anon; create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$; create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$; create publication supabase_realtime;
create table public.returns_expected(id serial primary key, tracking text, qty int); create table public.scan_logs(id serial primary key);`);
const log = [];
http.createServer(async (req, res) => {
  let body = ''; req.on('data', (c) => (body += c)); await new Promise((r) => req.on('end', r));
  const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  log.push(req.method + ' ' + req.url);
  if (req.headers.authorization !== 'Bearer sbp_test') return send(401, { message: 'Unauthorized' });
  const m = req.url.match(/^\/v1\/projects\/([a-z0-9]+)(\/.*)?$/);
  if (!m || m[1] !== 'abcdefghij1234567890') return send(404, { message: 'not found' });
  const sub = m[2] || '';
  if (req.method === 'GET' && sub === '') return send(200, { id: m[1], name: '혜성물류', region: 'ap-northeast-2' });
  if (req.method === 'GET' && sub.startsWith('/api-keys')) return send(200, [{ name: 'anon', api_key: 'eyJhbGciOiJIUzI1NiJ9.anon.test' }, { name: 'service_role', api_key: 'eyJ.secret' }]);
  if (req.method === 'PATCH' && sub === '/config/auth') { const j = JSON.parse(body); log.push('auth ' + JSON.stringify(j)); return send(200, j); }
  if (req.method === 'POST' && sub === '/database/query') {
    const { query } = JSON.parse(body);
    try { const r = await db.exec(query); const last = r[r.length - 1]; return send(201, last ? last.rows : []); }
    catch (e) { return send(400, { message: e.message }); }
  }
  if (req.url === '/__log') return send(200, log);
  send(404, { message: 'no route' });
}).listen(process.env.PORT || 9911, () => console.log('mock on 9911'));
