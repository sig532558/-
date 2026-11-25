// 모든 화면의 입력 칸에 실제 키보드로 입력되는지 점검 (fill 이 아닌 type)
const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8767) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); const bad = []; let n = 0;
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.click('#lid'); await pg.keyboard.type('admin'); await pg.click('#lpw'); await pg.keyboard.type('admin1234');
  ok(await pg.inputValue('#lpw') === 'admin1234', '로그인 비밀번호 키보드 입력'); await pg.keyboard.press('Enter'); await pg.waitForSelector('#body');
  // 사용 신청 창
  const routes = await pg.$$eval('.nav a', (a) => a.map((x) => x.getAttribute('href').replace('#/', '')));
  const extra = ['settings?k=prices', 'settings?k=brands', 'settings?k=inbound', 'settings?k=sec', 'kpi?v=input', 'newprod?v=update', 'count', 'season'];
  for (const r of routes.concat(extra)) {
    await pg.goto(URL + '#/' + r); await pg.waitForTimeout(900);
    const ids = await pg.$$eval('#body input, #body textarea, #tools input', (xs) => xs.map((x, i) => { x.dataset.tt = 'i' + i; return { id: 'i' + i, type: x.type, vis: !!(x.offsetWidth || x.offsetHeight), dis: x.disabled || x.readOnly, num: x.inputMode === 'numeric' || x.type === 'number' } }).filter((x) => x.vis && !x.dis && ['text', 'password', 'search', 'number', 'textarea', 'tel', 'email'].indexOf(x.type) >= 0).slice(0, 12));
    for (const x of ids) {
      const sel = '[data-tt="' + x.id + '"]'; const el = await pg.$(sel); if (!el) continue;
      const before = await el.inputValue().catch(() => null); if (before == null) continue;
      await el.click({ timeout: 2000 }).catch(() => {}); await pg.keyboard.press('End'); await pg.keyboard.type('7');
      const after = await el.inputValue().catch(() => before); n++;
      if (after === before) bad.push(r + ' ' + x.type + ' #' + x.id);
      await pg.keyboard.press('Backspace');
    }
  }
  ok(n > 30 && !bad.length, '화면 입력 칸 ' + n + '개 키보드 입력' + (bad.length ? ' — 막힘: ' + bad.join(', ') : ''));
  await b.close();
})();
