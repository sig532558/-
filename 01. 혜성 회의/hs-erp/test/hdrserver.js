// Cloudflare Pages처럼 site/_headers 를 적용하는 시험용 서버
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'site');
const rules = []; let cur = null;
for (const line of fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) { cur = { pat: line.trim(), h: {} }; rules.push(cur); } else { const i = line.indexOf(':'); cur.h[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
}
const match = (pat, p) => new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(p);
const MT = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const h = { 'Content-Type': MT[path.extname(f)] || 'application/octet-stream' };
  for (const r of rules) if (match(r.pat, p)) Object.assign(h, r.h);
  res.writeHead(200, h); res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(f));
}).listen(+process.argv[2] || 8767);
