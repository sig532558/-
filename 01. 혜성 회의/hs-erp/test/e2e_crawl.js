// 전체 점검: 역할별(관리자 · 업무지원 · 팀장 · 실무) × 메뉴 전부 × PC/휴대폰 — 오류 · 멈춤 · 가로 넘침
const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => { const b = await chromium.launch(); const issues = [];
  for (const [id, pw] of [['admin', 'admin1234'], ['support', '1234'], ['leader', '1234'], ['staff', '1234']]) for (const vp of [{ width: 1440, height: 900, n: 'PC' }, { width: 390, height: 844, n: '휴대폰' }]) {
    const ctx = await b.newContext({ viewport: vp }); const pg = await ctx.newPage(); let errs = [];
    pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
    await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1500);
    await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
    const links = await pg.evaluate(() => [...new Set([...document.querySelectorAll('.nav a[href^="#/"]')].map((a) => a.getAttribute('href')))]);
    for (const h of links) {
      errs = []; await pg.goto(URL + h); await pg.waitForTimeout(1300); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
      const st = await pg.evaluate(() => { const b = document.getElementById('body'); return { stuck: /불러오는 중/.test(b.textContent) && b.textContent.length < 40, err: [...b.querySelectorAll('.card.empty')].map((x) => x.textContent).filter((t) => /오류|실패|error|undefined|null|NaN|권한이 없/i.test(t)).join(' / ').slice(0, 160), nan: /NaN|undefined|\[object Object\]/.test(b.innerText), wide: document.documentElement.scrollWidth > innerWidth + 2 }; });
      const bad = []; if (errs.length) bad.push('오류: ' + errs.join(' | ').slice(0, 200)); if (st.stuck) bad.push('불러오는 중에 멈춤'); if (st.err) bad.push('화면 오류: ' + st.err); if (st.nan) bad.push('NaN/undefined 표시'); if (st.wide && vp.n === '휴대폰') bad.push('가로 넘침');
      if (bad.length) issues.push(id + ' · ' + vp.n + ' · ' + h + ' → ' + bad.join(' · '));
    }
    console.log(id, vp.n, links.length + '개 화면');
    await ctx.close();
  }
  issues.forEach((x) => console.log('ISSUE ' + x)); ok(!issues.length, '전체 화면 점검 문제 ' + issues.length + '건');
  await b.close(); })();
