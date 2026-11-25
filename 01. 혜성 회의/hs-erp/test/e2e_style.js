// 품번 규칙: 파일에 기획년도 · 시즌 · 아이템군이 없어도 품번으로 채움 · 새 아이템 코드 자동 학습 · 기준정보 › 품번 규칙
const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; const FX = __dirname + '/fx/';
const ST = require('../site/js/style.js'); const CNT = require('../site/js/count.js');
const login = async (pg, id, pw) => { await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1500); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove())); };
(async () => {
  // 규칙 (Node)
  const i1 = ST.info('221E2TR803'); ok(i1.yr === 'E (2025)' && i1.se === '2 (여름)' && i1.gr === '1 (T/SHIRTS)', '규칙: 221E2TR803 → ' + JSON.stringify(i1));
  ok(ST.info('911E7GV001').yr === 'E (2025)' && ST.info('2219SN001X').yr === '', '규칙: 시즌 자리가 1~7이 아니면 채우지 않음');
  ok(ST.info('221922SN01').yr === '', '규칙: 모양이 다른 품번은 빈칸');
  ok(ST.info('2219' + '1SN001').yr === '9 (2019)' && ST.info('22101SN001').yr === '0 (2020)', '규칙: 숫자 년도 9=2019 · 0=2020');
  ok(JSON.stringify(ST.fill('221E2TR803', 'F (2026)', '', '')) === JSON.stringify(['F (2026)', '2 (여름)', '1 (T/SHIRTS)']), '규칙: 파일 값 우선 · 빈칸만 채움');
  ok(Object.keys(ST.BASE).length === 61, '기본 아이템 코드 61개 (아이템군 엑셀 기준 · SA · PW 추가)');
  ['SN', 'SO', 'ST', 'JB', 'JC', 'OP', 'TB', 'WP', 'WT', 'AT'].forEach((c) => ok(CNT.classify('221E2' + c + '001').grp !== '-', '재고 실사: 빠졌던 코드 ' + c + ' → ' + CNT.classify('221E2' + c + '001').grp));
  ok(CNT.classify('22191SN001').year === 2019, '재고 실사: 숫자 년도 2019');
  const L = ST.learn([['L11F2XA001', '3 (OUTER)', 'XA (신규아우터)'], ['L11F2XA002', '3 (OUTER)', ''], ['L11F2TO310', '1 (T/SHIRTS)', '']]); ok(L.XA && L.XA.g === 3 && L.XA.n === '신규아우터' && !L.TO, '자동 학습: 새 코드만 ' + JSON.stringify(L));

  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 950 }, acceptDownloads: true }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await login(pg, 'admin', 'admin1234');
  await pg.goto(URL + '#/csdash'); await pg.waitForTimeout(1000); await pg.click('#csup'); await pg.waitForSelector('#cd input', { state: 'attached' });
  await pg.setInputFiles('#cd input', [FX + 'st_nocol.xlsx', FX + 'st_learn.xlsx']); await pg.waitForTimeout(2500);
  await pg.click('.modal .mf .btn.p'); await pg.waitForFunction(() => !document.querySelector('#cd'), null, { timeout: 60000 }); await pg.waitForTimeout(2500);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  const im = await pg.evaluate(async () => ((await HS.db.list('erp_settings', { eq: { key: 'item_map' } }))[0] || {}).value || {});
  ok(im.XA && im.XA.g === 3 && im.XA.src === 'learn' && im.XA.ok === false, 'WMS 파일 올리면 새 코드 XA 자동 학습 (확인 필요) ' + JSON.stringify(im.XA));
  // WMS 재고 조회 · 반품창고
  await pg.goto(URL + '#/cs?k=wms&t=조회'); await pg.waitForSelector('.qt', { timeout: 20000 }); await pg.waitForTimeout(500);
  await pg.click('.qf .qms >> nth=0'); await pg.waitForSelector('.qpop'); await pg.click('.qpop [data-none]'); await pg.click('.qpop .qpl label:has-text("반품창고")'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
  await pg.click('.qbar .seg button:has-text("SKU")'); await pg.waitForTimeout(400);
  const cell = async (st) => pg.evaluate((st) => { const th = [...document.querySelectorAll('.qt tr:first-child th')].map((x) => x.textContent.replace(/[▲▼]/g, '').trim()); const tr = [...document.querySelectorAll('.qt tr')].find((r) => [...r.cells].some((c) => c.textContent.trim() === st)); if (!tr) return null; const g = (l) => tr.cells[th.indexOf(l)] ? tr.cells[th.indexOf(l)].textContent.trim() : '?'; return [g('기획년도'), g('시즌'), g('복종')]; }, st);
  let c1 = await cell('221E2TR803'); ok(c1 && c1.join('|') === 'E (2025)|2 (여름)|1 (T/SHIRTS)', '칸 없는 파일 → 품번으로 채움 ' + JSON.stringify(c1));
  c1 = await cell('911E2SN001'); ok(c1 && c1[2] === '2 (SWEATER)', '빠졌던 코드 SN → SWEATER ' + JSON.stringify(c1));
  c1 = await cell('221F2ZZ001'); ok(c1 && c1[0] === 'F (2026)' && c1[2] === '', '모르는 코드 ZZ → 아이템군 빈칸 ' + JSON.stringify(c1));
  const yb = await pg.$$('.qf'); let yo = []; for (const q of yb) { if (/기획년도/.test(await q.textContent())) { await (await q.$('.qms')).click(); await pg.waitForSelector('.qpop'); yo = await pg.$$eval('.qpop .qpl label', (s) => s.map((o) => o.textContent)); await pg.keyboard.press('Escape'); break; } }
  ok(yo.some((o) => /E \(2025\)/.test(o)), '기획년도 드롭박스에 채운 값 ' + JSON.stringify(yo));
  await pg.screenshot({ path: SH + 'st1_query.png', fullPage: true });
  // 현황 엑셀에 기획년도 · 시즌 · 아이템군
  const xrow = await pg.evaluate(async () => { const L = await HS.csParts('wms', '반품창고'); const x = L.find((l) => l[1] === '221E2TR803'); return x ? HSStyle.fill(x[1], x[8], x[9], x[10]) : null; }); ok(xrow && xrow[0] === 'E (2025)', '현황 엑셀 값도 같은 규칙');
  // 기준정보 › 품번 규칙
  await pg.goto(URL + '#/settings?k=style'); await pg.waitForSelector('[data-g]', { timeout: 15000 }); await pg.waitForTimeout(400);
  let t = await pg.textContent('#body'); ok(/확인 필요 2건/.test(t) && /XA/.test(t) && /ZZ/.test(t) && /미확인/.test(t), '품번 규칙 탭: 확인 필요 (XA 자동 학습 · ZZ 미확인)');
  ok(/품번 자리별 뜻/.test(t) && /2017 · 2018 · 2019/.test(t), '자리별 뜻 표');
  await pg.click('[data-ok="XA"]'); await pg.waitForTimeout(1500); await pg.waitForSelector('[data-g]');
  await pg.selectOption('[data-g="ZZ"]', '5'); await pg.fill('[data-n="ZZ"]', '테스트용품'); await pg.click('#sv'); await pg.waitForTimeout(1500);
  const im2 = await pg.evaluate(async () => ((await HS.db.list('erp_settings', { eq: { key: 'item_map' } }))[0] || {}).value || {});
  ok(im2.XA.ok === true && im2.XA.src === 'learn' && im2.ZZ && im2.ZZ.g === 5 && im2.ZZ.src === 'admin', '확인 · 관리자 수정 저장 ' + JSON.stringify([im2.XA, im2.ZZ]));
  t = await pg.textContent('#body'); ok(!/확인 필요 \d/.test(t), '확인 다 하면 알림 사라짐');
  // 기본 코드 바꿨다 되돌리기
  await pg.fill('.srw #fq', 'TR'); await pg.waitForTimeout(500); await pg.selectOption('[data-g="TR"]', '2'); await pg.click('#sv'); await pg.waitForTimeout(1500);
  ok(await pg.evaluate(() => HSStyle.info('221E2TR803').gr) === '2 (SWEATER)', '기본 코드도 관리자가 바꿀 수 있음');
  await pg.fill('.srw #fq', 'TR'); await pg.waitForTimeout(500); await pg.selectOption('[data-g="TR"]', '1'); await pg.click('#sv'); await pg.waitForTimeout(1500);
  const im3 = await pg.evaluate(async () => ((await HS.db.list('erp_settings', { eq: { key: 'item_map' } }))[0] || {}).value || {}); ok(!im3.TR, '기본값으로 되돌리면 추가 기록 지움');
  await pg.screenshot({ path: SH + 'st2_rules.png', fullPage: true });
  await pg.goto(URL + '#/cs?k=wms&t=조회'); await pg.waitForSelector('.qt', { timeout: 20000 }); await pg.waitForTimeout(500);
  c1 = await cell('221F2ZZ001'); ok(c1 && c1[2] === '5 (ACCESSORY)', '관리자가 정한 ZZ → 조회에 반영 ' + JSON.stringify(c1));
  // 현장 팀장: 품번 규칙 수정 불가
  const lead = await pg.evaluate(() => HS.can('settings', 'edit')); ok(lead === true, '(관리자 권한 확인)');
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close();
})();
