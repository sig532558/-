// 내년 예상 물동량 — 화주 · 브랜드 · 연간/월간/일일 고르기 점검
const { chromium } = require('playwright'); const PORT = process.argv[2] || 8767; const URL = 'http://localhost:' + PORT + '/';
const SH = __dirname + '\\shots\\';
const pad = (n) => String(n).padStart(2, '0');
let fail = 0; const ok = (c, t) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + t); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 1200 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);
  // 물동량: 크리스 입고 100/110 · 출고 200/180 · LX 출고 50/60
  const rows = [];
  for (let m = 1; m <= 12; m++) rows.push({ rec_date: '2025-' + pad(m) + '-01', owner: '크리스', proc: '입고', qty: 100 }, { rec_date: '2025-' + pad(m) + '-01', owner: '크리스', proc: '출고', qty: 200 }, { rec_date: '2025-' + pad(m) + '-01', owner: 'LX', proc: '출고', qty: 50 });
  for (let m = 1; m <= 11; m++) rows.push({ rec_date: '2026-' + pad(m) + '-01', owner: '크리스', proc: '입고', qty: 110 }, { rec_date: '2026-' + pad(m) + '-01', owner: '크리스', proc: '출고', qty: 180 }, { rec_date: '2026-' + pad(m) + '-01', owner: 'LX', proc: '출고', qty: 60 });
  await pg.evaluate((rs) => HS.db.upsert('erp_volume', rs), rows);
  // 마감 보고(브랜드별 B2B 출고): PING 2025 매월 1,000 · 2026 1~11월 매월 1,200
  const dr = [];
  for (let m = 1; m <= 12; m++) dr.push({ rec_date: '2025-' + pad(m) + '-05', section: 'b2b', rec_key: 'PING', data: { out_qty: 1000 } });
  for (let m = 1; m <= 11; m++) dr.push({ rec_date: '2026-' + pad(m) + '-05', section: 'b2b', rec_key: 'PING', data: { out_qty: 1200 } });
  await pg.evaluate((rs) => HS.db.upsert('erp_daily_records', rs), dr);
  const go = async () => { await pg.evaluate(() => (location.hash = '#/meeting?m=2026-11')); await pg.waitForTimeout(300); await pg.evaluate(() => HS.route()); await pg.waitForTimeout(2500); };
  const tbl = () => pg.$$eval('#ms-fc table tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim().replace(/,/g, ''))));
  const pick = async (id, v) => { await pg.selectOption('#ms-fc #' + id, v); await pg.waitForTimeout(600); };
  await go();
  ok((await pg.$$('#ms-fc select')).length === 3, '고르는 칸 3개 (화주 · 브랜드 · 연간/월간/일일)');
  let T = await tbl(); let f = (l) => T.find((r) => r[0] === l) || [];
  // 전 화주: 입고 1,452 + 출고 2,760 (2025 3,000 → 2026 2,880 · 증감 0.96) = 4,212
  ok(f('연 합계')[5] === '4212', '전 화주 연 합계 예상 4,212 · ' + f('연 합계')[5]);
  // ① 화주 = LX 만 (출고 2025 600 · 2026 11월까지 660 + 12월 60 = 720 · 증감 1.2 → 864)
  await pick('fcOwn', 'LX'); T = await tbl(); f = (l) => T.find((r) => r[0] === l) || [];
  ok(f('출고')[1] === '600' && f('출고')[2] === '720', 'LX 출고 2025 600 · 2026 720 · ' + f('출고').slice(1, 3));
  ok(f('출고')[5] === '864', 'LX 출고 2027 예상 864 · ' + f('출고')[5]);
  ok(!T.some((r) => r[0] === '입고'), 'LX 는 입고 자료가 없어 입고 줄이 안 나옴');
  await pick('fcOwn', '');
  // ② 브랜드 = PING (마감 보고 기준 · 출고 한 줄 · 2025 12,000 · 2026 14,400 · 2027 17,280)
  await pick('fcBrand', 'PING'); T = await tbl(); f = (l) => T.find((r) => r[0] === '출고 (장)') || [];
  ok(f()[1] === '12000' && f()[2] === '14400', 'PING 출고 2025 12,000 · 2026 14,400 · ' + f().slice(1, 3));
  ok(f()[5] === '17280', 'PING 출고 2027 예상 17,280 · ' + f()[5]);
  ok(/일일 마감 보고/.test(await pg.textContent('#ms-fc')), '브랜드는 마감 보고 기준이라고 알려 줌');
  await pg.locator('#ms-fc').screenshot({ path: SH + 'fc_brand.png' });
  await pick('fcBrand', '');
  // ③ 월간 보기 — 12개월 칸 + 차이 표
  await pick('fcV', 'm'); T = await tbl();
  ok(T[0].length === 15, '월간 표는 공정 + 년 + 합계 + 12개월 = 15칸 · ' + T[0].length);
  const mf = (l, yr) => T.find((r) => r[0] === l && r[1] === yr) || [];
  ok(mf('B2B 합계', '2027년 예상')[2] === '4212', '월간 B2B 합계 예상 4,212 · ' + mf('B2B 합계', '2027년 예상')[2]);
  ok(T.some((r) => r[1] === '2026년 대비 차이'), '26년 대비 차이 줄이 있음');
  ok(T.some((r) => r[1] === '2025년 대비 차이'), '25년 대비 차이 줄이 있음');
  ok(T.some((r) => r[1] === '증감률'), '증감률 줄이 있음');
  await pg.locator('#ms-fc').screenshot({ path: SH + 'fc_month.png' });
  // ④ 일일 보기 — 날짜별 표로 바뀜 (자세한 점검은 e2e_fcday.js)
  await pick('fcV', 'd'); await pg.waitForTimeout(1200); T = await tbl();
  ok(T[0] && T[0][0] === '공정' && T[0][1] === '년' && T[0][2] === '월 합계', '일일은 날짜별 표 (공정 · 년 · 월 합계) · ' + (T[0] || []).slice(0, 3));
  ok((T[0] || []).some((h) => /주차$/.test(h)), '주차 소계 칸이 있음');
  ok(/작업일 \d+일/.test(await pg.textContent('#ms-fc')), '그 달 작업일 수를 알려 줌');
  // 작업일 수 = 토 · 일 + 공휴일(시즌 계획과 같은 목록)을 뺀 날 — 2027-01-01 신정이 빠져야 함
  const HOL = await pg.evaluate(() => new Set(HS.HOLIDAYS).has('2027-01-01'));
  ok(HOL === true, '2027년 공휴일 목록에 신정이 있음');
  const wd = (yy, m, hol) => { let n = 0; const d = new Date(yy, m - 1, 1); const p2 = (x) => String(x).padStart(2, '0'); while (d.getMonth() === m - 1) { const w = d.getDay(); const ds = yy + '-' + p2(m) + '-' + p2(d.getDate()); if (w !== 0 && w !== 6 && hol.indexOf(ds) < 0) n++; d.setDate(d.getDate() + 1); } return n; };
  const hols = await pg.evaluate(() => HS.HOLIDAYS);
  ok(wd(2027, 1, hols) < wd(2027, 1, []), '1월 작업일 수가 공휴일만큼 줄어듦 (' + wd(2027, 1, hols) + ' < ' + wd(2027, 1, []) + ')');
  const dtx = await pg.textContent('#ms-fc');
  ok(new RegExp('작업일 ' + wd(2027, 1, hols) + '일').test(dtx), '화면에 적힌 작업일 수가 공휴일을 뺀 값과 같음 (' + wd(2027, 1, hols) + ')');
  ok(/날짜별 예상 = 그 달 예상/.test(dtx), '날짜별 계산법을 근거에 적음');
  ok(/공휴일 · 명절/.test(dtx), '공휴일 · 명절을 뺐다고 적음');
  await pg.locator('#ms-fc').screenshot({ path: SH + 'fc_day.png' });
  console.log(errs.length ? '에러: ' + errs.join(' | ') : 'no page errors');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
