// 지원팀 › 일일 마감보고 엑셀 대량 등록 (203일 시트)
const { chromium } = require('playwright'); const fs = require('fs');
const AT = '/mnt/user-data/attachments/7e416561-536b-572f-95a3-857922cfaa8e/';
if (!fs.existsSync(AT)) { console.log('SKIP ' + __filename.replace(/^.*[\\/]/, '') + ' — 회사 엑셀(첨부 폴더)이 이 PC에 없어 건너뜁니다'); process.exit(0); }
const F = AT + fs.readdirSync(AT).find((f) => f.startsWith('c15cbe97'));
const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/'; const SH = __dirname + '/shots/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => { const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'support'); await pg.fill('#lpw', '1234'); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1500);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  await pg.goto(URL + '#/daily?d=2026-10-30'); await pg.waitForTimeout(1000);
  await pg.click('#dbulk'); await pg.setInputFiles('#bd input', F); await pg.waitForSelector('#br table', { timeout: 120000 });
  const t = await pg.textContent('#br'); console.log(t.slice(0, 200)); ok(/203/.test(t) && /2025-12-31 ~ 2026-10-30/.test(t), '203일 인식 (2025-12-31 ~ 2026-10-30) · 공란 시트 건너뜀');
  await pg.screenshot({ path: SH + 'd1_bulk.png' });
  await pg.click('.modal .mf .btn.p'); await pg.waitForSelector('.modal-bg', { state: 'detached', timeout: 300000 }); await pg.waitForTimeout(1500);
  const v = await pg.$$eval('input.cell', (x) => x.map((e) => e.value)); ok(/2026-10-30/.test(pg.url()) && v.indexOf('468') >= 0, '등록 후 10/30 화면 · 핑 입고수량 468');
  await pg.goto(URL + '#/daily?d=2026-03-03'); await pg.waitForTimeout(1000); ok((await pg.$$eval('input.cell', (x) => x.filter((e) => e.value !== '').length)) > 10, '3/3 자료도 들어옴');
  await pg.click('#dbulk'); await pg.setInputFiles('#bd input', F); await pg.waitForSelector('#br table', { timeout: 120000 }); const t2 = await pg.textContent('#br'); console.log('T2', t2.slice(0, 160));
  ok(/새날짜0/.test(t2.replace(/\s/g, '')) && /이미있는날짜203/.test(t2.replace(/\s/g, '')), '같은 파일 다시: 새 날짜 0 · 이미 있는 날짜 203 (덮어쓰기 선택)');
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close(); })();
