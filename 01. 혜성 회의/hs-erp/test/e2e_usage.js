const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8767) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => { const b = await chromium.launch(); const pg = await b.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body');
  await pg.goto(URL + '#/settings?k=conn'); await pg.waitForTimeout(1200); const t = await pg.textContent('#body');
  ok(/저장 공간 사용량/.test(t) && /%/.test(t) && /\/ 500MB/.test(t), '연결 탭 저장 공간 사용량 표시');
  await pg.screenshot({ path: __dirname + '/shots/usage.png', fullPage: true });
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); await b.close(); })();
