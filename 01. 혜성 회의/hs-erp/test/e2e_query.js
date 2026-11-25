// 재고 조회 (WMS · ERP): 탭 · 조건 · 보기 단위 · 칸 설정 · 정렬 · 엑셀 · 누적재고
// 2026-11-10: 지시 조회(배분LIST) 화면은 폐기 → 그 부분 점검을 뺌
const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; const FX = __dirname + '/fx/';
const login = async (pg, id, pw) => { await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1500); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove())); };
const txt = (pg) => pg.textContent('#body');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await login(pg, 'admin', 'admin1234');
  await pg.goto(URL + '#/csdash'); await pg.waitForTimeout(1000); await pg.click('#csup'); await pg.waitForSelector('#cd input', { state: 'attached' });
  await pg.setInputFiles('#cd input', [FX + 'cs_wms.xlsx', FX + 'cs_erp.xlsx']); await pg.waitForTimeout(2500);
  await pg.click('.modal .mf .btn.p'); await pg.waitForFunction(() => !document.querySelector('#cd'), null, { timeout: 60000 }); await pg.waitForTimeout(2500);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  // WMS
  await pg.goto(URL + '#/cs?k=wms&t=정상창고'); await pg.waitForTimeout(1200); ok(/재고 조회/.test(await pg.textContent('#tools')), 'WMS 탭에 [재고 조회]');
  await pg.goto(URL + '#/cs?k=wms&t=조회'); await pg.waitForSelector('.qt', { timeout: 20000 }); await pg.waitForTimeout(500);
  let t = await txt(pg); ok(/누적재고 \(미래재고\)/.test(t) && /미래발생분/.test(t) && /현재고/.test(t), 'WMS 재고 조회 칸: 현재고 · 미래발생분 · 누적재고');
  const tot = await pg.evaluate(async () => { const L = await HS.csParts('wms', '정상창고'); return { n: L.length, has11: L.filter((x) => x[11] != null).length, bad: L.filter((x) => x[11] !== x[5] - x[7]).length }; });
  ok(tot.n > 0 && tot.has11 === tot.n && tot.bad === 0, '누적재고 저장 (파일 값 = 현재고 − 미래발생분) ' + JSON.stringify(tot));
  ok(/품번 \+ 색상/.test(t) && await pg.$('.qbar .seg button.on') && (await pg.textContent('.qbar .seg button.on')) === '품번 + 색상', '기본 보기 단위: 품번 + 색상');
  const n0 = await pg.$$eval('.qt tr', (r) => r.length);
  await pg.fill('.qf input.in >> nth=0', 'H11F3FH208'); await pg.waitForTimeout(700);
  t = await pg.textContent('.qt'); const rows1 = await pg.$$eval('.qt tr:not(.tot):not(.qdet)', (r) => r.length - 1);
  ok(/H11F3FH208/.test(t) && rows1 >= 1 && rows1 < n0, '품번 일부 검색 → ' + rows1 + '줄');
  await pg.click('.qbar .seg button:has-text("SKU")'); await pg.waitForTimeout(400); ok(/사이즈/.test(await pg.textContent('.qt tr')), 'SKU 단위 → 사이즈 칸');
  await pg.click('.qbar .seg button:has-text("품번 + 색상")'); await pg.waitForTimeout(300);
  const ex = await pg.$('.qt tr.qx'); if (ex) { await ex.click(); await pg.waitForTimeout(300); ok(!!(await pg.$('.qt tr.qdet')), '줄 누르면 묶인 상세 펼침'); } else ok(true, '(묶인 줄 없음)');
  // 정렬
  await pg.click('.qt th:has-text("미래발생분")'); await pg.waitForTimeout(300); ok(/▼/.test(await pg.textContent('.qt th:has-text("미래발생분")')), '칸 제목 눌러 정렬');
  // 칸 설정: 출고 숨기기 → 기억
  await pg.click('.qbar button:has-text("칸 설정")'); await pg.waitForTimeout(300);
  await pg.uncheck('.qcs input[data-k="out"]'); await pg.click('.qcs [data-u="2"]'); await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(300);
  let hd = await pg.$$eval('.qt tr:first-child th', (h) => h.map((x) => x.textContent.replace(/[▲▼]/g, '').trim()).filter((x) => x !== 'No'));
  ok(hd.indexOf('출고') < 0 && hd[0] === '품번', '칸 설정: 숨기기 · 순서 ' + JSON.stringify(hd.slice(0, 4)));
  await pg.reload(); await pg.waitForSelector('.qt', { timeout: 20000 }); await pg.waitForTimeout(500);
  hd = await pg.$$eval('.qt tr:first-child th', (h) => h.map((x) => x.textContent.replace(/[▲▼]/g, '').trim())); ok(hd.indexOf('출고') < 0 && (await pg.inputValue('.qf input.in >> nth=0')) === 'H11F3FH208', '다시 열어도 칸 설정 · 조건 기억');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('.qbar button:has-text("엑셀 받기")')]); ok(!!dl, '조회 결과 엑셀 받기');
  await pg.click('.qbar a:has-text("조건 지우기")'); await pg.waitForTimeout(400);
  await pg.click('.qf .qms >> nth=1'); await pg.waitForSelector('.qpop'); const opts = await pg.$$eval('.qpop .qpl label', (s) => s.map((o) => o.textContent)); ok(opts.length >= 2, '브랜드 고르기 값 ' + opts.length + '개'); await pg.keyboard.press('Escape');
  await pg.screenshot({ path: SH + 'q1_wms.png', fullPage: true });
  // ERP
  await pg.goto(URL + '#/cs?k=erp&t=조회'); await pg.waitForSelector('.qt', { timeout: 20000 }); await pg.waitForTimeout(500);
  t = await txt(pg); ok(/매장별/.test(t) && /현재고/.test(t) && /합계/.test(await pg.textContent('.qt')), 'ERP 재고 조회 (매장별)');
  await pg.click('.qbar .seg button:has-text("브랜드 합계")'); await pg.waitForTimeout(300); console.log((await pg.textContent('.qt')).slice(0,300)); ok(/합계/.test(await pg.textContent('.qt')), 'ERP 브랜드 합계');
  await pg.screenshot({ path: SH + 'q2_erp.png', fullPage: true });
  // 지시 조회 (배분LIST) 화면은 폐기 — 주소로 들어와도 WMS 재고로 되돌림
  await pg.goto(URL + '#/cs?k=order&t=조회'); await pg.waitForTimeout(1500);
  t = await txt(pg); ok(/정상창고/.test(await pg.textContent('#tools')) && !/지시 후 남는 재고/.test(t), '지시 조회 화면 폐기 → WMS 재고 탭으로 되돌림');
  const fn = await pg.evaluate(() => typeof HS.qgrid); ok(fn === 'function', 'HS.qgrid');
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close();
})();
