// 전 화면 오류 점검 · 공통 그리드 설정 · 모바일 (e2e2 실행 후 같은 브라우저 저장소 없이 단독 실행: 로컬 자료 다시 올림)
const { chromium } = require('playwright');
const fs = require('fs');
const UP = '/root/.claude/uploads/7e416561-536b-572f-95a3-857922cfaa8e/', AT = '/mnt/user-data/attachments/7e416561-536b-572f-95a3-857922cfaa8e/';
if (!fs.existsSync(UP) || !fs.existsSync(AT)) { console.log('SKIP ' + __filename.replace(/^.*[\\/]/, '') + ' — 회사 엑셀(올린 파일 폴더)이 이 PC에 없어 건너뜁니다'); process.exit(0); }
const file = (dir, p) => dir + fs.readdirSync(dir).find((f) => f.startsWith(p));
const SH = __dirname + '/shots/'; const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push(pg.url().split('#')[1] + ' pageerror: ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(pg.url().split('#')[1] + ' console: ' + m.text()); });
  const login = async (id, pw) => { await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(400); };
  const go = async (h, w) => { await pg.goto(URL + '#/' + h); await pg.waitForTimeout(w || 1300); };
  await login('admin', 'admin1234');
  await go('upload', 600);
  await pg.setInputFiles('#fi', [file(UP, 'cbef67b0'), file(UP, 'ba8ee902'), file(UP, '4840a465'), file(UP, '98a419f4'), file(AT, 'abf8d2c5'), file(AT, '251dc830')]);
  await pg.waitForSelector('#go', { timeout: 180000 }); await pg.click('#go'); await pg.waitForSelector('#prog .lock', { timeout: 400000 });
  console.log('upload:', (await pg.textContent('#prog')).slice(0, 160));
  // 1) 모든 메뉴 열어 보기
  const routes = await pg.$$eval('.nav a', (a) => a.map((x) => x.getAttribute('href').replace('#/', '')));
  const extra = ['orders?d=2026-10-27', 'kpi?t=정상1팀&m=2026-09', 'kpi?t=정상1팀&tab=in&d=2026-09-01', 'worklog?t=정상1팀&d=2026-09-01', 'daily?d=2026-10-19', 'settings?k=brands', 'settings?k=prices', 'users?k=roles', 'tasks?v=list', 'returns', 'settlement'];
  for (const r of routes.concat(extra)) { await go(r, 1200); const t = await pg.textContent('#body'); if (/Cannot|undefined|NaN|\[object/.test(t)) errs.push(r + ' 화면 글자 이상: ' + (t.match(/.{0,30}(Cannot|undefined|NaN|\[object).{0,30}/) || [''])[0]); }
  ok(true, '메뉴 ' + (routes.length + extra.length) + '개 화면 열기');
  // 2) 공통 그리드: 표마다 도구줄이 붙는지
  await go('kpi?t=정상1팀&m=2026-09', 2000);
  const bars = await pg.$$('.gtb'); ok(bars.length >= 2, 'KPI 화면 표 도구줄 ' + bars.length + '개');
  await go('settings?k=brands', 1200);
  const before = await pg.$$eval('#body table tr', (r) => r.filter((x) => x.style.display !== 'none').length);
  await pg.fill('.gtb .gq', 'PING'); await pg.waitForTimeout(500);
  const after = await pg.$$eval('#body table tr', (r) => r.filter((x) => x.style.display !== 'none').length);
  ok(after < before && after >= 2, '표 안에서 찾기 (' + before + ' → ' + after + '행)');
  await pg.fill('.gtb .gq', ''); await pg.waitForTimeout(400);
  await pg.click('.gtb [data-set]'); await pg.waitForSelector('.gcol');
  await pg.uncheck('.gcol input[data-h="2"]'); // 기준명 열 숨김
  await pg.selectOption('#gs', '3'); await pg.click('.modal .btn.p'); await pg.waitForTimeout(500);
  const hidden = await pg.$$eval('#body table tr:first-child th', (h) => h.filter((x) => x.style.display === 'none').map((x) => x.textContent));
  ok(hidden.indexOf('기준명') >= 0, '열 숨기기 (' + hidden.join(',') + ')');
  await go('settings?k=brands', 1200);
  const hidden2 = await pg.$$eval('#body table tr:first-child th', (h) => h.filter((x) => x.style.display === 'none').map((x) => x.textContent));
  ok(hidden2.indexOf('기준명') >= 0, '화면 다시 열어도 설정 유지');
  await pg.click('.gtb [data-views]'); await pg.click('.modal .btn.p'); await pg.waitForSelector('#vn'); await pg.fill('#vn', '브랜드 간단히'); await pg.check('#vs'); await pg.click('.modal .btn.p'); await pg.waitForTimeout(600);
  await pg.click('.gtb [data-views]'); await pg.waitForTimeout(400); ok(/브랜드 간단히/.test(await pg.textContent('.modal')), '보기 저장 · 목록 표시'); await pg.click('.modal [data-x]'); await pg.waitForTimeout(300);
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('.gtb [data-x]')]); await dl.saveAs(SH + 'g_brand.xlsx');
  const XLSX = require('xlsx'); const ws = XLSX.readFile(SH + 'g_brand.xlsx').Sheets.Sheet1; const hdr = XLSX.utils.sheet_to_json(ws, { header: 1 })[0];
  ok(hdr.indexOf('기준명') < 0 && hdr.indexOf('브랜드') >= 0, '엑셀 = 보이는 열 그대로 (' + hdr.slice(0, 5).join(',') + ')');
  await pg.click('.gtb [data-set]'); await pg.click('.modal .mf .btn:first-child'); await pg.waitForTimeout(600);
  // 편집 표(업무일지)도 도구 붙고 저장 동작 유지
  await go('worklog?t=이월소터팀&d=2026-10-19', 1500);
  ok((await pg.$$('.gtb')).length >= 1, '입력 표에도 도구줄');
  await pg.screenshot({ path: SH + 'g_worklog.png' });
  // 3) 모바일 폭
  await pg.setViewportSize({ width: 390, height: 844 });
  for (const r of ['dashboard', 'orders?d=2026-10-27', 'kpi?t=정상1팀&m=2026-09', 'tasks']) { await go(r, 1200); const w = await pg.evaluate(() => document.documentElement.scrollWidth); if (w > 400) errs.push(r + ' 모바일 가로 넘침 ' + w + 'px'); }
  await pg.screenshot({ path: SH + 'g_mobile.png' });
  ok(true, '모바일 폭 점검');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
