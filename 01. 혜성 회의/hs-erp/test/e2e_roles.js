// 등급별 전체 화면 점검 — 관리자가 실사 · 시즌 자료를 만든 뒤, 업무지원팀 · 현장 팀장 · 실무진으로 모든 메뉴를 열어 오류 · 이상 글자 · 권한 버튼 확인
const { chromium } = require('playwright');
const URL = 'http://localhost:' + (process.env.PORT || 8767) + '/'; const FX = __dirname + '/fx/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push(pg.url().split('#')[1] + ' pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/권한이 없습니다|권한 없음|형식이 올바르지|이미 있습니다/.test(m.text())) errs.push(pg.url().split('#')[1] + ' console: ' + m.text()); });
  const login = async (id, pw) => { await pg.evaluate(() => sessionStorage.clear()).catch(() => {}); await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(400); };
  const bad = async (where) => { const t = await pg.textContent('#body'); const m = t.match(/.{0,25}(undefined|NaN|\[object|Infinity|null명|null개).{0,25}/); if (m) errs.push(where + ' 이상 글자: ' + m[0]); };
  // 관리자: 자료 만들기
  await login('admin', 'admin1234');
  await pg.goto(URL + '#/count'); await pg.waitForTimeout(600); await pg.click('text=+ 새 실사'); await pg.waitForSelector('#n'); await pg.click('.modal .btn.p'); await pg.waitForTimeout(1200);
  await pg.setInputFiles('.drop input[type=file] >> nth=0', [FX + 'wms_stock.xlsx', FX + 'future.xlsx']); await pg.waitForTimeout(4000);
  await pg.setInputFiles('.drop input[type=file] >> nth=1', [FX + 'count_floor1.xlsx']); await pg.waitForTimeout(4000);
  // 같은 파일 다시 올리기 → 줄 수 그대로
  await pg.setInputFiles('.drop input[type=file] >> nth=1', [FX + 'count_floor1.xlsx']); await pg.waitForTimeout(4000);
  const files = await pg.$$eval('.card td', (tds) => tds.filter((t) => t.textContent === 'count_floor1.xlsx').length); ok(files === 1, '같은 실사 파일 다시 올려도 1개로 교체');
  // 잘못된 파일
  await pg.setInputFiles('.drop input[type=file] >> nth=1', [FX + 'future.xlsx']); await pg.waitForTimeout(2500);
  // 2026-11-23: 시즌 계획 폐기 — 이 점검에서도 뺌
  // 등급별 점검
  for (const [id, pw, role] of [['admin', 'admin1234', '관리자'], ['support', '1234', '업무지원팀'], ['leader', '1234', '현장 팀장'], ['staff', '1234', '실무진']]) {
    await login(id, pw);
    const routes = await pg.$$eval('.nav a', (a) => a.map((x) => x.getAttribute('href').replace('#/', '')));
    for (const r of routes) { await pg.goto(URL + '#/' + r); await pg.waitForTimeout(900); await bad(role + ' ' + r); }
    const has = (r) => routes.some((x) => x.split('?')[0] === r);
    ok(has('count') && !has('season'), role + ': 재고 실사 메뉴 보임 · 시즌 계획은 없음 (' + routes.length + '개 메뉴)');
    await pg.goto(URL + '#/count'); await pg.waitForTimeout(800); const newBtn = !!(await pg.$('text=+ 새 실사'));
    await pg.click('tr[data-id]'); await pg.waitForTimeout(2000); await pg.goto(pg.url().replace(/s=\w+/, '') + '&s=setup'); await pg.waitForTimeout(2000);
    const drops = (await pg.$$('.drop')).length;
    for (const s of ['diff', 'dash']) { await pg.click('.seg button:has-text("' + (s === 'diff' ? '차이 현황' : '대시보드') + '")'); await pg.waitForTimeout(2000); await bad(role + ' count ' + s); }
    console.log(role, '새 실사 버튼', newBtn, '· 업로드 칸', drops);
    if (role === '관리자' || role === '업무지원팀') ok(newBtn && drops === 2, role + ': 실사 등록 · 전산재고 · 실사 업로드 가능');
    if (role === '현장 팀장') ok(!newBtn && drops === 1, '현장 팀장: 실사 자료만 올리기 (등록 · 전산재고 불가)');
    if (role === '실무진') ok(!newBtn && drops === 0, '실무진: 보기만 가능');
  }
  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
