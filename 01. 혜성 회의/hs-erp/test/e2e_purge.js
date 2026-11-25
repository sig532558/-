// 설정 › 저장 공간 › 저장 공간 정리하기 — 관리자만 보임 · 항목 4개 · 기준(개월) 고르기 · 지우기는 확인 창을 거침
const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const login = async (pg, id, pw) => { await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(900); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove())); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await login(pg, 'admin', 'admin1234');
  await pg.goto(URL + '#/storage'); await pg.waitForSelector('tr[data-k]', { timeout: 15000 }); await pg.waitForTimeout(400);

  const ks = await pg.$$eval('tr[data-k]', (a) => a.map((e) => e.dataset.k));
  ok(ks.join(',') === 'retired,meetbook,audit,uploads', '정리 항목 4개 · ' + ks.join(','));
  ok(/폐기한 화면에 남은 자료/.test(await pg.textContent('tr[data-k="retired"]')), '폐기 화면 자료 줄');
  ok(!(await pg.$('tr[data-k="retired"] select')), '폐기 화면 자료는 기간 고르기 없음 (전부)');
  const mos = await pg.$$eval('tr[data-k="meetbook"] select option', (a) => a.map((e) => e.value + (e.selected ? '*' : '')));
  ok(mos.join(',') === '6,12,24*,36', '회의 보고서 기준 개월 · 기본 24개월 · ' + mos.join(','));
  ok(/되돌릴 수 없습니다/.test(await pg.textContent('.card:has(tr[data-k="retired"])')), '되돌릴 수 없다는 안내');

  // 현장 사원에게는 정리 묶음이 안 보임
  const pg2 = await b.newPage({ viewport: { width: 1440, height: 950 } }); pg2.on('pageerror', (e) => errs.push(e.message));
  await login(pg2, 'staff', '1234');
  await pg2.goto(URL + '#/storage'); await pg2.waitForTimeout(1200);
  ok(!(await pg2.$('tr[data-k]')), '현장 사원에게는 정리 묶음이 안 보임');

  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close();
})();
