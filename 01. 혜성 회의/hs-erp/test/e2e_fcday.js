// 내년 예상 물동량 — 일일(날짜 가로 · 주차 소계 · 월 합계) 표 점검
const { chromium } = require('playwright'); const PORT = process.argv[2] || 8767; const URL = 'http://localhost:' + PORT + '/';
const SH = __dirname + '\\shots\\'; const pad = (n) => String(n).padStart(2, '0');
let fail = 0; const ok = (c, t) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + t); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1600, height: 1100 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);
  // 2025 매월 입고 100 · 출고 200 / 2026 1~11월 입고 110 · 출고 180 (월 1일 한 줄)
  // 2026년 1월만 날짜별로 5일치 더 넣어 "올해 실적" 줄이 날마다 다르게 나오는지 본다
  const rows = [];
  for (let m = 1; m <= 12; m++) rows.push({ rec_date: '2025-' + pad(m) + '-01', owner: '크리스', proc: '입고', qty: 100 }, { rec_date: '2025-' + pad(m) + '-01', owner: '크리스', proc: '출고', qty: 200 });
  for (let m = 1; m <= 11; m++) rows.push({ rec_date: '2026-' + pad(m) + '-01', owner: '크리스', proc: '입고', qty: 110 }, { rec_date: '2026-' + pad(m) + '-01', owner: '크리스', proc: '출고', qty: 180 });
  [['2026-01-05', 11], ['2026-01-06', 22], ['2026-01-07', 33]].forEach(([d, q]) => rows.push({ rec_date: d, owner: '크리스', proc: '입고', qty: q }));
  await pg.evaluate((rs) => HS.db.upsert('erp_volume', rs), rows);
  await pg.evaluate(() => (location.hash = '#/meeting?m=2026-11')); await pg.waitForTimeout(300);
  await pg.evaluate(() => HS.route()); await pg.waitForTimeout(2500);
  await pg.selectOption('#ms-fc #fcV', 'd'); await pg.waitForTimeout(1500);
  const head = await pg.$$eval('#ms-fc table tr:first-child th', (a) => a.map((e) => e.textContent.trim()));
  ok(head[0] === '공정' && head[1] === '년' && head[2] === '월 합계', '첫 칸이 공정 · 년 · 월 합계 · ' + head.slice(0, 3));
  ok(head.some((h) => /^1\/1 금/.test(h)), '날짜가 가로로 나옴 (1/1 금) · ' + head[3]);
  ok(head.filter((h) => /주차$/.test(h)).length >= 5, '주차 소계 칸이 있음 · ' + head.filter((h) => /주차$/.test(h)).join(','));
  ok(/휴일/.test(head.find((h) => /^1\/1/.test(h)) || ''), '1/1 신정이 휴일로 표시됨');
  const T = await pg.$$eval('#ms-fc table tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim().replace(/,/g, ''))));
  const find = (l, yr) => T.find((r) => r[0] === l && r[1] === yr) || [];
  ok(find('B2B 합계', '2027년 예상').length > 10, 'B2B 합계 · 2027년 예상 줄이 있음');
  ok(find('B2B 합계', '2026년 실적').length > 10, 'B2B 합계 · 2026년 실적 줄이 있음');
  ok(T.some((r) => r[1] === '증감률'), '증감률 줄이 있음');
  ok(T.some((r) => r[1] === '2026년 대비 차이'), '26년 대비 차이 줄이 있음');
  ok(T.some((r) => r[1] === '2025년 대비 차이'), '25년 대비 차이 줄이 있음');
  // 1/1(금·신정) · 1/2(토) · 1/3(일) 은 '-'
  const h2 = head.indexOf(head.find((h) => /^1\/1 금/.test(h)));
  const inN = T.find((r) => r[0] === '입고' && r[1] === '2027년 예상') || [];
  ok(inN[h2] === '-', '1/1 신정은 - (' + inN[h2] + ')');
  ok(inN[h2 + 1] === '-' && inN[h2 + 2] === '-', '1/2 토 · 1/3 일도 - ');
  // 평일은 같은 값 (월 예상 ÷ 작업일 수)
  const wd = await pg.evaluate(() => { const H = new Set(HS.HOLIDAYS); let n = 0; const d = new Date(2027, 0, 1); const p = (x) => String(x).padStart(2, '0'); while (d.getMonth() === 0) { const w = d.getDay(); const ds = '2027-01-' + p(d.getDate()); if (w !== 0 && w !== 6 && !H.has(ds)) n++; d.setDate(d.getDate() + 1); } return n; });
  // 1/3(일) 뒤에 1주차 소계 칸이 끼므로 1/4 는 h2+4 · 월 합계는 3번째 칸
  const mTot = +inN[2]; const want = String(Math.round(mTot / wd));
  ok(inN[h2 + 4] === want, '1/4 월 입고 예상 = 월 합계 ' + mTot + ' ÷ 작업일 ' + wd + ' = ' + want + ' · ' + inN[h2 + 4]);
  ok(inN[h2 + 5] === want, '평일은 같은 값');
  ok(Math.abs(+want * wd - mTot) <= wd, '평일 값 × 작업일 수 ≈ 월 합계 (' + (+want * wd) + ' vs ' + mTot + ')');
  // 올해 실적 줄은 날마다 다름 (1/5 11 · 1/6 22 · 1/7 33)
  const inC = T.find((r) => r[0] === '입고' && r[1] === '2026년 실적') || [];
  ok(inC[h2 + 5] === '11' && inC[h2 + 6] === '22' && inC[h2 + 7] === '33', '2026년 실적은 날짜별 실제 수량 · ' + inC.slice(h2 + 5, h2 + 8));
  // 26년 대비 차이 = 예상 - 실적 (1/5 는 10 - 11 = -1)
  const dN = T.filter((r) => r[1] === '2026년 대비 차이');
  ok(dN.length > 0 && dN.some((r) => r[h2 + 5] === '-1'), '26년 대비 차이가 예상 - 실적 (1/5 = -1)');
  // 25년 대비 차이 = 26년 실적 - 25년 실적 (25년 자료가 1일에만 있어 1/5 는 11 - 0 = +11)
  const dP = T.filter((r) => r[1] === '2025년 대비 차이');
  ok(dP.length > 0 && dP.some((r) => r[h2 + 5] === '+11'), '25년 대비 차이가 26년 - 25년 (1/5 = +11)');
  // 달 넘기기
  await pg.click('#ms-fc #fcNext'); await pg.waitForTimeout(1500);
  ok(/2027년 2월/.test(await pg.textContent('#ms-fc')), '▶ 를 누르면 2월로 넘어감');
  await pg.click('#ms-fc #fcPrev'); await pg.waitForTimeout(1500);
  ok(/2027년 1월/.test(await pg.textContent('#ms-fc')), '◀ 로 되돌아옴');
  await pg.locator('#ms-fc').screenshot({ path: SH + 'fc_day_table.png' });
  console.log(errs.length ? '에러: ' + errs.join(' | ') : 'no page errors');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
