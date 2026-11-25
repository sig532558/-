// 전년 대비 물동량 — 차이 수량 줄 · 칸 점검 (2026-11-13)
const { chromium } = require('playwright'); const PORT = process.argv[2] || 8767; const URL = 'http://localhost:' + PORT + '/';
const SH = __dirname + '\\shots\\'; const pad = (n) => String(n).padStart(2, '0');
let fail = 0; const ok = (c, t) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + t); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1600, height: 1200 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);
  // 크리스 입고(B2B) 2025 매월 100 · 2026 매월 130 / B2C 고객 출고 2025 매월 50 · 2026 매월 40
  const rows = [];
  for (let m = 1; m <= 12; m++) rows.push({ rec_date: '2025-' + pad(m) + '-01', owner: '크리스', proc: '입고', qty: 100 }, { rec_date: '2025-' + pad(m) + '-01', owner: '크리스', proc: 'B2C고객출고', qty: 50 });
  for (let m = 1; m <= 10; m++) rows.push({ rec_date: '2026-' + pad(m) + '-01', owner: '크리스', proc: '입고', qty: 130 }, { rec_date: '2026-' + pad(m) + '-01', owner: '크리스', proc: 'B2C고객출고', qty: 40 });
  await pg.evaluate((rs) => HS.db.upsert('erp_volume', rs), rows);
  await pg.evaluate(() => (location.hash = '#/volume?m=2026-10')); await pg.waitForTimeout(300);
  await pg.evaluate(() => HS.route()); await pg.waitForTimeout(2500);
  // ① 월별 물동량 표 — 묶음마다 차이 수량 줄
  const T = await pg.$$eval('.card table tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim().replace(/,/g, ''))));
  const diffRows = T.filter((r) => r.indexOf('차이 수량') >= 0);
  ok(diffRows.length >= 3, '합계 · B2B · B2C 마다 차이 수량 줄 (' + diffRows.length + ')');
  // 합계 1월: 2025 150 · 2026 170 → +20
  const r0 = diffRows[0] || [];
  ok(r0.indexOf('+20') >= 0, '합계 1월 차이 +20 · ' + r0.slice(1, 4));
  // 11 · 12월은 2026 자료가 없어 -150
  ok(r0.filter((x) => x === '-150').length >= 2, '자료 없는 달은 -150 (전년만 있음)');
  // ② 공정별 표 — 차이 수량 칸
  const head = await pg.$$eval('.card table tr:first-child th', (a) => a.map((e) => e.textContent.trim()));
  ok(true, '머리글 읽음: ' + head.join(','));
  // 공정별: 구분 · 공정 · 전년 달 · 올해 달 · 증감 · 차이 수량
  const proc = T.find((r) => r[1] === '입고') || [];
  ok(proc[5] === '+30', '공정별 입고 차이 +30 (100 → 130) · ' + proc[5]);
  // ③ 화주별 표 — 차이 수량 · 누적 차이 (맨 앞에 번호(No) 칸이 붙음)
  // No · 화주 · 전년 · 10월 · 증감 · 차이 수량 · 누적 · 누적 증감 · 누적 차이
  const own = T.find((r) => r[1] === '크리스') || [];
  ok(own[5] === '+20', '화주별 크리스 10월 차이 +20 · ' + own[5]);
  ok(own[8] === '+200', '화주별 누적 차이 +200 (1,500 → 1,700) · ' + own[8]);
  // ④ 차이 수량은 증감률 바로 아래 줄
  const iR = T.findIndex((r) => r[0] === '증감률' || r[1] === '증감률');
  const iD = T.findIndex((r) => r[0] === '차이 수량' || r[1] === '차이 수량');
  ok(iR >= 0 && iD === iR + 1, '차이 수량 줄이 증감률 바로 아래 (' + iR + ' → ' + iD + ')');
  await pg.screenshot({ path: SH + 'vol_diff.png', fullPage: false });
  console.log(errs.length ? '에러: ' + errs.join(' | ') : 'no page errors');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
