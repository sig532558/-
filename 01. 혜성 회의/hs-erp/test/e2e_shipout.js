// 정상팀 › 출고 현황 (전년대비) — 월별 · 주단위 · 일별(동요일)
//  · 올해 = 일일 마감 보고(브랜드별) · 전년 = 물동량(화주) — 브랜드 줄의 전년은 그 해 마감 보고가 있어야 나옴
//  · 2026-11-11(수) 기준: 이번 주 월요일 2026-11-09 · 주차 이름 11월2주
const { chromium } = require('playwright');
const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/';
// 올해(2026) 일일 마감 보고
const D26 = [
  ['2026-01-05', '핑', 1000], ['2026-01-05', '팬텀', 500], ['2026-01-05', '링스', 300],
  ['2026-11-02', '핑', 50], ['2026-11-03', '핑', 60],
  ['2026-11-09', '핑', 100], ['2026-11-10', '핑', 200], ['2026-11-09', '팬텀', 40],
];
// 전년(2025) 일일 마감 보고 — 핑만 있음 (팬텀 · 링스는 '전년 마감 보고 없음' 이 되어야 함)
const D25 = [['2025-01-06', '핑', 800], ['2025-11-10', '핑', 90]];
// 전년 물동량 — 화주 단위 (출고 · 쿠팡출고만 셈 · 반품은 세면 안 됨)
const V25 = [
  ['2025-01-06', '크리스', '출고', 1200], ['2025-01-06', '크리스', '쿠팡출고', 100], ['2025-01-06', 'LX', '출고', 400],
  ['2025-01-06', '크리스', '반품', 9999], ['2025-11-10', '크리스', '출고', 70],
];
const rowOf = (pg, sel, label) => pg.evaluate(([s, l]) => {
  for (const t of document.querySelectorAll(s + ' table')) for (const r of t.rows) {
    const c = [...r.cells].map((x) => x.textContent.replace(/\s+/g, ' ').trim());
    const i = c.findIndex((x) => x === l || x.indexOf(l + ' ') === 0); if (i >= 0) return c.slice(i);
  } return null;
}, [sel, label]);

(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1540, height: 1150 } }); const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  // 시험 자료가 2026-11-09 주에 있으므로 날짜를 그날로 맞춰 둔다 (2026-11-23: 금주 · 차주가 '오늘' 기준이 됨)
  await pg.addInitScript(() => { const T = new Date('2026-11-11T10:00:00').getTime(); const D = Date; class FD extends D { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } } window.Date = FD; });
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  await pg.evaluate(async ([d26, d25, v25]) => {
    await HS.db.upsert('erp_daily_records', d26.concat(d25).map(([d, k, q]) => ({ rec_date: d, section: 'b2b', rec_key: k, data: { out_qty: q } })));
    await HS.db.upsert('erp_volume', v25.map(([d, o, p, q]) => ({ rec_date: d, owner: o, proc: p, qty: q })));
  }, [D26, D25, V25]);

  await pg.goto(URL + '#/shipout?y=2026'); await pg.waitForSelector('#so1', { timeout: 20000 }); await pg.waitForTimeout(1200);
  const nav = await pg.$$eval('.nav .ng[data-g="정상팀"] a', (x) => x.map((a) => a.textContent.trim()));
  ok(nav.indexOf('출고 현황') === 2, '정상팀 메뉴에 출고 현황 (신상품 현황 다음) ' + JSON.stringify(nav));

  // ---------- 1. 월별 ----------
  const m1 = await rowOf(pg, '#so1', '1월');
  ok(m1 && m1[1] === '1,800' && m1[2] === '1,700', '1월: 올해 1,800 (1000+500+300) · 전년 1,700 (물동량 출고+쿠팡, 반품 제외) ' + JSON.stringify(m1));
  ok(m1 && /\+100/.test(m1[3]) && /5\.9%/.test(m1[4]), '1월 증감 +100 · 증감률 5.9% ' + JSON.stringify(m1));
  const m11 = await rowOf(pg, '#so1', '11월');
  ok(m11 && /이번 달/.test(m11[0]) && m11[1] === '450', '11월: 이번 달 표시 · 올해 450 ' + JSON.stringify(m11));
  ok(m11 && /진행 중/.test(m11[4]), '진행 중인 달은 증감률을 내지 않음 ' + (m11 && m11[4]));
  const t1 = await rowOf(pg, '#so1', '합계');
  ok(t1 && t1[1] === '2,250' && t1[2] === '1,770', '합계: 올해 2,250 · 전년 1,770 ' + JSON.stringify(t1));

  // ---------- 2. 브랜드별 · 화주 묶음 ----------
  // 화면에는 브랜드 표시 이름(1 (PING) 등)이 나오므로 data-b 로 찾고, 숫자는 뒤에서 5칸을 본다
  //  (올해 · 전년 · 증감 · 증감률 · 비중)
  const brandRow = (pg2, bb) => pg2.evaluate((x) => { const tr = document.querySelector('#so2 tr[data-b="' + x + '"]'); return tr ? [...tr.cells].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).slice(-5) : null; }, bb);
  const ownRow = (pg2, l) => pg2.evaluate((x) => { for (const tr of document.querySelectorAll('#so2 table tr')) { const c = [...tr.cells].map((y) => y.textContent.replace(/\s+/g, ' ').trim()); if (c.some((y) => y.indexOf('화주 묶음') > 0 && y.indexOf(x) === 0)) return c.slice(-5); } return null; }, l);
  const bp = await brandRow(pg, '핑');
  ok(bp && bp[0] === '1,410' && bp[1] === '890', '핑: 올해 1,410 · 전년 890 (2025 마감 보고가 있어서 나옴) ' + JSON.stringify(bp));
  const bf = await brandRow(pg, '팬텀');
  ok(bf && bf[0] === '540' && bf[1] === '-' && /마감 보고 없음/.test(bf.join(' ')), '팬텀: 올해 540 · 2025 마감 보고가 없어 전년 칸 비움 + 이유 표시 ' + JSON.stringify(bf));
  const oc = await ownRow(pg, '크리스');
  ok(oc && oc[0] === '1,950' && oc[1] === '1,370', '크리스 화주 묶음: 올해 1,950 (핑+팬텀) · 전년 1,370 (물동량) ' + JSON.stringify(oc));
  const ol = await ownRow(pg, 'LX컴퍼니');
  ok(ol && ol[0] === '300' && ol[1] === '400', 'LX컴퍼니 묶음: 올해 300 · 전년 400 ' + JSON.stringify(ol));
  const t2 = await rowOf(pg, '#so2', '합계');
  ok(t2 && t2[1] === '2,250' && t2[2] === '1,770', '브랜드별 합계도 2,250 ↔ 1,770 ' + JSON.stringify(t2));
  await pg.screenshot({ path: SH + 'so1.png', fullPage: true });

  // ---------- 3. 주단위 ----------
  const w2 = await rowOf(pg, '#so3', '11월2주');
  ok(w2 && /이번 주/.test(w2[0]) && w2[2] === '340', '11월2주(11/09~11/15): 올해 340 (100+200+40) ' + JSON.stringify(w2));
  ok(w2 && w2[3] === '70', '전년 같은 주차(2025 11월2주)에서 물동량 70 ' + JSON.stringify(w2));
  const w1 = await rowOf(pg, '#so3', '11월1주');
  ok(w1 && w1[2] === '110', '11월1주(11/02~11/08): 올해 110 (50+60) ' + JSON.stringify(w1));

  // ---------- 4. 일별 (요일 맞춰서) ----------
  const mo = await rowOf(pg, '#so4', '월');
  ok(mo && mo[3].indexOf('140') === 0, '당주 월요일(11/09) 140 (핑 100 + 팬텀 40) ' + JSON.stringify(mo));
  const tu = await rowOf(pg, '#so4', '화');
  ok(tu && tu[3].indexOf('200') === 0, '당주 화요일(11/10) 200 ' + JSON.stringify(tu));
  ok(mo && mo[2].indexOf('50') === 0, '전주 월요일(11/02) 50 ' + JSON.stringify(mo));

  // ---------- 5. 브랜드 고르기 ----------
  await pg.goto(URL + '#/shipout?y=2026&b=' + encodeURIComponent('팬텀')); await pg.waitForSelector('#so1'); await pg.waitForTimeout(1200);
  ok(/2025년 일일 마감 보고가 없어/.test(await pg.textContent('#body')), '전년 마감 보고가 없는 브랜드는 왜 비는지 알려 줌');
  const fm = await rowOf(pg, '#so1', '1월');
  ok(fm && fm[1] === '500' && fm[2] === '-', '팬텀 1월: 올해 500 · 전년 칸은 비움 (물동량을 나눠 쓰지 않음) ' + JSON.stringify(fm));
  await pg.goto(URL + '#/shipout?y=2026&b=' + encodeURIComponent('핑')); await pg.waitForSelector('#so1'); await pg.waitForTimeout(1200);
  const pm = await rowOf(pg, '#so1', '1월');
  ok(pm && pm[1] === '1,000' && pm[2] === '800', '핑 1월: 올해 1,000 · 전년 800 (그 브랜드 마감 보고) ' + JSON.stringify(pm));
  await pg.screenshot({ path: SH + 'so2_brand.png', fullPage: true });

  // ---------- 5-2. 전년 기준 고르기 (마감 보고 ↔ 물동량) ----------
  await pg.goto(URL + '#/shipout?y=2026'); await pg.waitForSelector('#so1'); await pg.waitForTimeout(1200);
  const seg = await pg.$$eval('#tools .seg button', (x) => x.map((e) => e.textContent.trim()));
  ok(seg.indexOf('2025 마감 보고') >= 0 && seg.indexOf('2025 물동량') >= 0, '전년 기준 고르는 칸 있음 ' + JSON.stringify(seg));
  ok(/2025 마감 보고 2일/.test(await pg.textContent('#tools')), '전년 마감 보고 날짜 수를 알려 줌');
  await pg.goto(URL + '#/shipout?y=2026&s=daily'); await pg.waitForSelector('#so1'); await pg.waitForTimeout(1200);
  const dm = await rowOf(pg, '#so1', '1월');
  ok(dm && dm[1] === '1,800' && dm[2] === '800', '[2025 마감 보고] 로 바꾸면 1월 전년 800 (마감 보고 기준) ' + JSON.stringify(dm));
  ok(/2일치뿐입니다/.test(await pg.textContent('#body')), '1년치가 안 되면 전년 숫자가 낮다고 알려 줌');
  const od = await ownRow(pg, '크리스');
  ok(od && od[1] === '890', '마감 보고 기준일 때 화주 묶음 전년도 마감 보고로 묶음 (890) ' + JSON.stringify(od));
  await pg.goto(URL + '#/shipout?y=2026&s=vol'); await pg.waitForSelector('#so1'); await pg.waitForTimeout(1200);
  const vm = await rowOf(pg, '#so1', '1월');
  ok(vm && vm[2] === '1,700', '[2025 물동량] 으로 되돌리면 1월 전년 1,700 ' + JSON.stringify(vm));

  // ---------- 6. 휴대폰 ----------
  await pg.setViewportSize({ width: 390, height: 840 }); await pg.goto(URL + '#/shipout?y=2026'); await pg.waitForTimeout(2200);
  const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 1, '휴대폰 화면 가로 넘침 없음 (' + over + ')');

  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
