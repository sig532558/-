// 내년 예상 물동량 — 신상품 기획 수량이 한 시즌만 올라왔을 때(S/S 먼저 · F/W 는 5월 예정) 처리 점검
const { chromium } = require('playwright'); const PORT = process.argv[2] || 8767; const URL = 'http://localhost:' + PORT + '/';
const SH = __dirname + '\\shots\\'; const pad = (n) => String(n).padStart(2, '0');
let fail = 0; const ok = (c, t) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + t); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 1200 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);
  // 물동량: 입고 2025 매월 100 (연 1,200) · 2026 1~11월 매월 110 → 2026 입고 1,320 · 증감 1.1
  const rows = [];
  for (let m = 1; m <= 12; m++) rows.push({ rec_date: '2025-' + pad(m) + '-01', owner: '크리스', proc: '입고', qty: 100 });
  for (let m = 1; m <= 11; m++) rows.push({ rec_date: '2026-' + pad(m) + '-01', owner: '크리스', proc: '입고', qty: 110 });
  await pg.evaluate((rs) => HS.db.upsert('erp_volume', rs), rows);
  const go = async () => { await pg.evaluate(() => (location.hash = '#/meeting?m=2026-11')); await pg.waitForTimeout(300); await pg.evaluate(() => HS.route()); await pg.waitForTimeout(2500); };
  const inRow = async () => (await pg.$$eval('#ms-fc table tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim().replace(/,/g, ''))))).find((r) => r[0] === '입고') || [];
  const txt = () => pg.textContent('#ms-fc');
  // ① 2027 자료가 하나도 없을 때 — 전년 증감률 (1,320 × 1.1 = 1,452)
  await go();
  // 칸: 0 공정 · 1 2025 · 2 2026 · 3 증감 · 4 25년 대비 차이 · 5 2027 예상 · 6 26년 대비 차이 · 7 산출 기준
  ok((await inRow())[5] === '1452', '기획 자료가 없으면 전년 증감률 1,452 · ' + (await inRow())[5]);
  ok((await inRow())[7] === '전년 증감률', '산출 기준이 전년 증감률');
  ok((await inRow())[4] === '+120', '2026년 줄에 25년 대비 차이 +120 · ' + (await inRow())[4]);
  // ② 2026 시즌별 기획(SS 600 · FW 400 = 6:4) 만 있고 2027 은 없을 때 — 그대로 전년 증감률
  await pg.evaluate(() => HS.db.upsert('erp_np_style', [{ season: '2026SS', style: 'T26S', plan_qty: 600 }, { season: '2026FW', style: 'T26W', plan_qty: 400 }]));
  await go();
  ok((await inRow())[5] === '1452', '2027 자료 전에는 그대로 1,452 · ' + (await inRow())[5]);
  // ③ 2027SS 만 등록 (1,000장) — S/S 는 기획값, F/W 는 1,320 × 0.4 × 1.1 = 581 로 추정 → 합 1,581
  await pg.evaluate(() => HS.db.upsert('erp_np_style', [{ season: '2027SS', style: 'T27S', plan_qty: 1000 }]));
  await go();
  ok((await inRow())[5] === '1581', 'S/S 만 등록되면 1,000 + 추정 581 = 1,581 · ' + (await inRow())[5]);
  ok((await inRow())[7] === '기획 수량 + 전년 증감률', '산출 기준이 "기획 수량 + 전년 증감률" · ' + (await inRow())[7]);
  const t3 = await txt();
  ok(/S\/S 기획 수량만 등록/.test(t3), 'S/S 만 등록됐다고 알려 줌');
  ok(/581장으로 추정/.test(t3), 'F/W 추정값을 숫자로 알려 줌');
  ok(/60 : 40/.test(t3), '2026년 기획 S/S : F/W 비율을 알려 줌');
  await pg.locator('#ms-fc').screenshot({ path: SH + 'fc_season_half.png' });
  // ④ 2027FW 까지 등록 (800장) — 1,000 + 800 = 1,800 · 추정 없음
  await pg.evaluate(() => HS.db.upsert('erp_np_style', [{ season: '2027FW', style: 'T27W', plan_qty: 800 }]));
  await go();
  ok((await inRow())[5] === '1800', '두 시즌 다 등록되면 1,800 · ' + (await inRow())[5]);
  ok((await inRow())[7] === '기획 수량', '산출 기준이 기획 수량');
  const t4 = await txt();
  ok(!/추정해 더했습니다/.test(t4), '추정 안내가 사라짐');
  ok(/S\/S 1,000 \+ F\/W 800/.test(t4), '시즌별 수량을 적어 줌');
  await pg.locator('#ms-fc').screenshot({ path: SH + 'fc_season_full.png' });
  console.log(errs.length ? '에러: ' + errs.join(' | ') : 'no page errors');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
