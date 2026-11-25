// 자료를 실제로 넣은 뒤 전체 화면 점검 (관리자 · 팀장) — 원가관리 · KPI 3팀 · 출고지시
const { chromium } = require('playwright'); const fs = require('fs'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const AT = '/mnt/user-data/attachments/7e416561-536b-572f-95a3-857922cfaa8e/';
if (!fs.existsSync(AT)) { console.log('SKIP ' + __filename.replace(/^.*[\\/]/, '') + ' — 회사 엑셀(첨부 폴더)이 이 PC에 없어 건너뜁니다'); process.exit(0); }
const file = (p) => AT + fs.readdirSync(AT).find((f) => f.startsWith(p));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const pg = await ctx.newPage(); let errs = []; const issues = [];
  pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const clr = () => pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  const login = async (id, pw) => { await pg.evaluate(() => sessionStorage.clear()).catch(() => {}); await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1500); await clr(); };
  await login('admin', 'admin1234');
  await pg.goto(URL + '#/upload'); await pg.waitForTimeout(800); await clr();
  await pg.setInputFiles('#fi', [file('f31309b0'), file('5dff3d6d'), file('c5d3e6a6'), file('251dc830'), file('abf8d2c5')]); await pg.waitForSelector('#go', { timeout: 300000 });
  await pg.click('#go'); await pg.waitForSelector('#prog .lock', { timeout: 900000 }); await pg.waitForTimeout(800); console.log('upload:', (await pg.textContent('#prog')).slice(0, 200));
  const extra = ['#/dashboard?d=2026-09-15', '#/worklog?t=정상1팀&d=2026-09-15', '#/worklog?t=이월소터팀&d=2026-03-10', '#/kpi?t=정상1팀&m=2026-09', '#/kpi?t=정상1팀&tab=in&d=2026-09-15', '#/kpi?t=온라인팀&m=2026-10', '#/kpi?t=이월소터팀&m=2026-07', '#/orders?d=2026-10-27', '#/meeting?m=2026-09', '#/costsum?v=pl&y=2026', '#/costsum?v=to&y=2026', '#/costsum?v=qty&y=2026', '#/daily?d=2026-09-15', '#/storage', '#/settings?k=brands', '#/settings?k=prices', '#/settings?k=teams', '#/settings?k=conn'];
  for (const [id, pw] of [['admin', 'admin1234'], ['leader', '1234']]) {
    if (id !== 'admin') await login(id, pw);
    const links = await pg.evaluate(() => [...new Set([...document.querySelectorAll('.nav a[href^="#/"]')].map((a) => a.getAttribute('href')))]);
    for (const h of links.concat(extra)) {
      errs = []; await pg.goto(URL + h); await pg.waitForTimeout(1500); await clr();
      const st = await pg.evaluate(() => { const b = document.getElementById('body'); return { stuck: /불러오는 중/.test(b.textContent) && b.textContent.length < 40, nan: (b.innerText.match(/.{0,30}(NaN|undefined|\[object Object\]|Infinity).{0,30}/) || [''])[0] }; });
      const bad = []; if (errs.length) bad.push('오류: ' + errs.join(' | ').slice(0, 220)); if (st.stuck) bad.push('불러오는 중에 멈춤'); if (st.nan) bad.push('이상한 값: ' + st.nan);
      if (bad.length) issues.push(id + ' · ' + h + ' → ' + bad.join(' · '));
    }
    console.log(id, (links.length + extra.length) + '개 화면');
  }
  issues.forEach((x) => console.log('ISSUE ' + x)); ok(!issues.length, '자료 넣은 뒤 화면 점검 문제 ' + issues.length + '건');
  await b.close(); })();
