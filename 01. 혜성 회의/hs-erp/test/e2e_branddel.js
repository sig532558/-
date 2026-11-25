// 브랜드 완전 삭제 기능 점검 (2026-11-13)
//  · 자료가 있는 브랜드는 못 지움 · 사용 중지 안 된 브랜드는 버튼 자체가 안 보임 · 자료 없는 브랜드는 지워짐
const { chromium } = require('playwright'); const PORT = process.argv[2] || 8767; const URL = 'http://localhost:' + PORT + '/';
let fail = 0; const ok = (c, t) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + t); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);

  // 자료가 있는 브랜드(네파 · 지난 반품 자료 하나 심어둠) → 완전히 삭제 눌러도 막혀야 함
  await pg.evaluate(() => HS.db.upsert('erp_ret_done', [{ rec_date: '2026-10-01', brand: '네파', slips: 1, pcs: 1 }]));
  await pg.evaluate(() => HS.db.upsert('erp_brands', [Object.assign({}, HS.cache.brandMap['네파'], { active: false, end_date: '2026-11-13' })]));
  await pg.evaluate(() => (location.hash = '#/settings?k=brands&off=1')); await pg.waitForTimeout(300);
  await pg.evaluate(() => HS.route()); await pg.waitForTimeout(1500);
  const row = () => pg.locator('tr[data-n="네파"]');
  ok(await row().locator('[data-del]').count() === 1, '사용 중지된 네파에 [완전히 삭제] 버튼이 보임');
  await row().locator('[data-del]').click(); await pg.waitForTimeout(1500);
  const modalTxt = await pg.textContent('.modal-bg');
  ok(/지울 수 없습니다/.test(modalTxt) && /반품 확정/.test(modalTxt), '반품 자료가 있어 "지울 수 없습니다" + 반품 확정 항목을 알려 줌 · ' + modalTxt.slice(0, 120));
  await pg.click('.modal-bg .btn'); await pg.waitForTimeout(300);
  const stillThere = await pg.evaluate(() => !!HS.cache.brandMap['네파']);
  ok(stillThere === true, '막혔으니 네파는 그대로 남아 있음');

  // 그 반품 자료를 지우고 다시 시도 → 이번엔 지워져야 함
  await pg.evaluate(() => HS.db.remove('erp_ret_done', { rec_date: '2026-10-01', brand: '네파' }));
  await pg.evaluate(() => HS.route()); await pg.waitForTimeout(1000);
  await row().locator('[data-del]').click(); await pg.waitForTimeout(1500);
  const f2 = await pg.textContent('.modal-bg');
  ok(/되돌릴 수 없습니다/.test(f2), '자료가 없으면 "되돌릴 수 없습니다" 확인창이 뜸');
  // 기준명을 안 맞게 입력 → 거부
  await pg.fill('.modal-bg #cn', '네'); await pg.click('.modal-bg .btn.p.del'); await pg.waitForTimeout(500);
  ok((await pg.$('.modal-bg')) !== null, '기준명이 다르면 안 지워지고 창이 그대로 있음');
  // 정확히 입력 → 지워짐
  await pg.fill('.modal-bg #cn', '네파'); await pg.click('.modal-bg .btn.p.del'); await pg.waitForTimeout(1500);
  const gone = await pg.evaluate(() => !HS.cache.brandMap['네파']);
  ok(gone === true, '기준명을 정확히 입력하면 완전히 지워짐');
  // 안성센터 owners 에서도 네파가 빠졌는지 (다른 브랜드가 '네파' 화주사를 안 쓰므로)
  const ownersClean = await pg.evaluate(() => { const c = (HS.cache.centers || []).find((x) => x.id === 'anseong'); return c ? (c.owners || []).indexOf('네파') : -99; });
  ok(ownersClean === -1, '안성센터 owners 목록에서도 네파가 빠짐 · ' + ownersClean);

  // 사용 중지 안 된(사용 중인) 브랜드는 삭제 버튼 자체가 안 보임
  await pg.evaluate(() => (location.hash = '#/settings?k=brands')); await pg.waitForTimeout(300);
  await pg.evaluate(() => HS.route()); await pg.waitForTimeout(1000);
  ok(await pg.locator('tr[data-n="핑"] [data-del]').count() === 0, '사용 중인(핑) 브랜드엔 삭제 버튼이 안 보임');

  console.log(errs.length ? '에러: ' + errs.join(' | ') : 'no page errors');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
