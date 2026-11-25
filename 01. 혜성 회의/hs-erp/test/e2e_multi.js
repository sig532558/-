// 조회 조건 여러 값 고르기: 전체 선택 · 전체 해제 · 찾기 · 바로 반영 · 기억
const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; const FX = __dirname + '/fx/';
const login = async (pg) => { await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1500); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove())); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await login(pg);
  await pg.goto(URL + '#/csdash'); await pg.waitForTimeout(1000); await pg.click('#csup'); await pg.waitForSelector('#cd input', { state: 'attached' });
  await pg.setInputFiles('#cd input', [FX + 'st_nocol.xlsx', FX + 'st_learn.xlsx']); await pg.waitForTimeout(2500);
  await pg.click('.modal .mf .btn.p'); await pg.waitForFunction(() => !document.querySelector('#cd'), null, { timeout: 60000 }); await pg.waitForTimeout(2000);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  await pg.goto(URL + '#/cs?k=wms&t=조회'); await pg.waitForSelector('.qt', { timeout: 20000 }); await pg.waitForTimeout(500);
  const qf = async (l) => { for (const q of await pg.$$('.qf')) if ((await q.textContent()).indexOf(l) === 0) return q.$('.qms'); return null; };
  const rows = () => pg.$$eval('.qt tr', (r) => r.length - 2);
  const btnT = async (l) => (await (await qf(l)).textContent()).replace('▾', '').trim();
  ok(await btnT('창고') === '정상창고', '창고 기본값 정상창고 ' + await btnT('창고'));
  // 창고 여러 개
  await (await qf('창고')).click(); await pg.waitForSelector('.qpop');
  const whs = await pg.$$eval('.qpop .qpl label span', (s) => s.map((x) => x.textContent)); ok(whs.length >= 2, '창고 값 ' + JSON.stringify(whs));
  await pg.click('.qpop [data-all]'); await pg.waitForTimeout(300);
  ok(await btnT('창고') === '전체', '전체 선택 → 전체');
  const nAll = await pg.$eval('.qbar .qtag', (x) => x.textContent);
  await pg.click('.qpop [data-none]'); await pg.waitForTimeout(300);
  ok(await btnT('창고') === '선택 없음' && /^0 \//.test(await pg.$eval('.qbar .qtag', (x) => x.textContent.replace(/^.*· /, ''))), '전체 해제 → 선택 없음 · 0줄');
  await pg.click('.qpop .qpl label:has-text("반품창고")'); await pg.waitForTimeout(300);
  ok(await btnT('창고') === '반품창고', '하나 고름 → ' + await btnT('창고'));
  await pg.click('.qpop .qpl label:has-text("정상창고")'); await pg.waitForTimeout(300); ok(await btnT('창고') === '전체', '둘 다 고르면 = 전체');
  await pg.click('.qpop .qpl label:has-text("정상창고")'); await pg.waitForTimeout(300);
  ok(await pg.isVisible('.qpop'), '고르는 동안 창 열려 있음');
  await pg.screenshot({ path: SH + 'm1_pop.png' });
  await pg.click('.qpop [data-x]'); ok(!(await pg.$('.qpop')), '닫기');
  const tag = await pg.$eval('.qbar .qtag', (x) => x.textContent); ok(/창고: /.test(tag), '조건 표시 ' + tag);
  // 브랜드: 찾기 + 찾은 것만 선택
  await (await qf('브랜드')).click(); await pg.waitForSelector('.qpop');
  const bn = await pg.$$eval('.qpop .qpl label span', (s) => s.map((x) => x.textContent)); console.log('브랜드', bn.join(','));
  if (await pg.$('.qpop .qpq')) { await pg.fill('.qpop .qpq', bn[0].slice(0, 3)); await pg.waitForTimeout(200); const vis = await pg.$$eval('.qpop .qpl label', (s) => s.filter((x) => x.style.display !== 'none').length); ok(vis >= 1 && vis <= bn.length, '목록 찾기 ' + vis); }
  await pg.click('.qpop [data-none]'); await pg.click('.qpop .qpl label >> nth=0'); await pg.waitForTimeout(300); await pg.mouse.click(5, 5); ok(!(await pg.$('.qpop')), '바깥 누르면 닫힘');
  const allB = await pg.$$eval('.qt tr', (rs) => { const th = [...rs[0].cells].map((c) => c.textContent.trim()); const i = th.findIndex((x) => /^브랜드/.test(x)); return [...new Set(rs.slice(2).map((r) => (r.cells[i] || {}).textContent))]; });
  ok(allB.length === 1, '고른 브랜드만 나옴 ' + JSON.stringify(allB));
  // 기억
  await pg.reload(); await pg.waitForSelector('.qt', { timeout: 20000 }); await pg.waitForTimeout(500);
  ok(await btnT('창고') === '반품창고', '다시 열어도 고른 값 기억 ' + await btnT('창고'));
  await pg.click('.qbar a:has-text("조건 지우기")'); await pg.waitForTimeout(300); ok(await btnT('창고') === '전체' && await btnT('브랜드') === '전체', '조건 지우기 → 전체');
  // 예전 저장값(한 값) 그대로 읽기
  await pg.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^hs-q:/.test(k) && /wms/i.test(k)) { const v = JSON.parse(localStorage.getItem(k)); v.f.wh = '반품창고'; localStorage.setItem(k, JSON.stringify(v)); } });
  await pg.reload(); await pg.waitForSelector('.qt', { timeout: 20000 }); await pg.waitForTimeout(500); ok(await btnT('창고') === '반품창고', '예전 저장값 읽기 ' + await btnT('창고'));
  // 휴대폰 폭
  await pg.setViewportSize({ width: 390, height: 800 }); await pg.waitForTimeout(300); await (await qf('브랜드')).click(); await pg.waitForSelector('.qpop');
  const bx = await pg.$eval('.qpop', (p) => { const r = p.getBoundingClientRect(); return [r.left, r.right, window.innerWidth]; }); ok(bx[0] >= 0 && bx[1] <= bx[2], '휴대폰 화면 안에 들어옴 ' + JSON.stringify(bx));
  await pg.screenshot({ path: SH + 'm2_mobile.png' });
  void nAll; void rows;
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close();
})();
