// 내년 예상 물동량 섹션 숫자 점검 — 손으로 계산한 값과 화면 값을 맞춰 봄
const { chromium } = require('playwright'); const URL = 'http://localhost:8766/';
const SH = 'C:\\Users\\sig53\\Desktop\\클로드 코드\\01. 혜성 회의\\hs-erp\\test\\shots\\';
const pad = (n) => String(n).padStart(2, '0');
let fail = 0; const ok = (t, a, b) => { const good = String(a) === String(b); if (!good) fail++; console.log((good ? 'PASS' : 'FAIL') + ' ' + t + ' · 화면=' + a + ' 기대=' + b); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 1400 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);
  // 물동량 넣기: 2025년 1~12월 입고 100 · 출고 200 / 2026년 1~11월 입고 110 · 출고 180
  const rows = [];
  for (let m = 1; m <= 12; m++) { rows.push({ rec_date: '2025-' + pad(m) + '-01', owner: '크리스', proc: '입고', qty: 100 }, { rec_date: '2025-' + pad(m) + '-01', owner: '크리스', proc: '출고', qty: 200 }); }
  for (let m = 1; m <= 11; m++) { rows.push({ rec_date: '2026-' + pad(m) + '-01', owner: '크리스', proc: '입고', qty: 110 }, { rec_date: '2026-' + pad(m) + '-01', owner: '크리스', proc: '출고', qty: 180 }); }
  await pg.evaluate((rs) => HS.db.upsert('erp_volume', rs), rows);
  const read = async () => {
    await pg.evaluate(() => (location.hash = '#/meeting?m=2026-11'));
    await pg.waitForTimeout(400); await pg.evaluate(() => HS.route()); await pg.waitForTimeout(2500);
    return pg.$$eval('#ms-fc table tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim().replace(/,/g, ''))));
  };
  // ① 기획 수량 없을 때
  let T = await read(); console.log(JSON.stringify(T, null, 0));
  const find = (l) => T.find((r) => r[0] === l) || [];
  // 칸: 0 공정 · 1 2025 · 2 2026 · 3 증감 · 4 25년 대비 차이 · 5 2027 예상 · 6 26년 대비 차이 · 7 산출 기준
  ok('입고 2025', find('입고')[1], 1200); ok('입고 2026', find('입고')[2], 1320); ok('입고 2027 예상', find('입고')[5], 1452);
  ok('입고 25년 대비 차이', find('입고')[4], '+120');
  ok('입고 산출 기준', find('입고')[7], '전년 증감률');
  ok('출고 2026', find('출고')[2], 2160); ok('출고 2027 예상', find('출고')[5], 1944);
  ok('출고 25년 대비 차이', find('출고')[4], '-240');
  ok('연 합계 2027', find('연 합계')[5], 3396); ok('연 합계 차이', find('연 합계')[6], '-84');
  ok('연 합계 25년 대비 차이', find('연 합계')[4], '-120');
  ok('상반기 2027', find('상반기 (1~6월)')[5], 1698); ok('하반기 2027', find('하반기 (7~12월)')[5], 1698);
  await pg.locator('#ms-fc').screenshot({ path: SH + 'meet_fc_noplan.png' });
  // ② 2027 기획 수량 2,000장 넣었을 때 — 입고만 기획 기준으로 바뀜
  await pg.evaluate(() => HS.db.upsert('erp_np_style', [{ season: '2027SS', style: 'TEST27A', plan_qty: 1200 }, { season: '2027FW', style: 'TEST27B', plan_qty: 800 }]));
  T = await read();
  ok('기획 적용 입고 2027 예상', find('입고')[5], 2000); // 달마다 167 · 차이는 한 달에 몰아 합계를 기획 수량에 맞춤
  ok('기획 적용 산출 기준', find('입고')[7], '기획 수량');
  ok('기획 적용 출고 2027 예상', find('출고')[5], 1944);
  ok('기획 적용 연 합계', find('연 합계')[5], 3944);
  const memo = await pg.$eval('#ms-fc .mtext', (e) => e.textContent);
  ok('근거에 기획 수량 적힘', /2027년 신상품 기획 수량 2,000장/.test(memo), 'true');
  ok('근거에 미마감 안내', /2026년은 11월까지가 실적/.test(memo), 'true');
  await pg.locator('#ms-fc').screenshot({ path: SH + 'meet_fc27.png' });
  console.log(errs.length ? '에러: ' + errs.join(' | ') : 'no page errors');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
