// 신상품 현황 — 기획 수량 · 입고 수량 (PCS) 과 전년 대비 증감 수량 · 증감률
// 자료는 erp_np_style 에 직접 넣는다 (2026FW · 전년 2025FW)
const { chromium } = require('playwright');
const URL = 'http://localhost:' + (process.env.PORT || process.argv[2] || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body');
  // 2026FW: 핑 기획 2줄 300+200 / 입고 250+150 · 2025FW: 핑 기획 1줄 400 / 입고 400
  await pg.evaluate(async () => {
    const mk = (season, style, plan, inq) => ({ season, style, brand: '핑', scode: season.slice(2), item: 'TR', colors: 1, plan_qty: plan, in_qty: inq, out_qty: 0, stock: 1, stock_loc: 0, plan_date: '2026-09-01', st_in: inq ? '입고' : '미입고', st_out: '미출고', st_clean: '정리완료', defect: 0, flags: [] });
    await HS.db.upsert('erp_np_style', [
      mk('2026FW', 'Q11F6TR001', 300, 250), mk('2026FW', 'Q11F6TR002', 200, 150),
      mk('2025FW', 'Q11E6TR001', 400, 400),
    ]);
  });
  await pg.goto(URL + '#/newprod?s=2026FW'); await pg.waitForTimeout(2500);
  const t = (await pg.textContent('#body')).replace(/\s+/g, ' ');
  ok(/기획 수량 \(PCS\)/.test(t) && /입고 수량 \(PCS\)/.test(t), '요약에 기획 수량 · 입고 수량 칸');
  ok(/전년 400 ·/.test(t), '요약에 전년 수량 (기획 400)');
  // ① 브랜드별 표 — 핑 줄에서 여덟 칸 확인
  const V = await pg.evaluate(() => {
    const tb = [...document.querySelectorAll('#body table')].find((x) => /전년 기획 수량/.test(x.textContent)); if (!tb) return null;
    const hr = [...tb.querySelectorAll('tr')].find((x) => x.querySelector('th')); if (!hr) return null;
    const hs = [...hr.children].map((x) => x.textContent.trim().replace(/\s*▾?\s*$/, ''));
    const tr = tb.querySelector('tr[data-b]'); if (!tr) return null;
    const td = [...tr.children].map((x) => x.textContent.trim());
    const at = (n) => td[hs.indexOf(n)] || '';
    return { plan: at('기획 수량'), pplan: at('전년 기획 수량'), dplan: at('기획 증감'), rplan: at('기획 증감률'), inq: at('입고 수량'), pin: at('전년 입고 수량'), din: at('입고 증감'), rin: at('입고 증감률') };
  });
  ok(!!V, '① 표에서 핑 줄 찾기'); if (V) console.log(JSON.stringify(V));
  const n0 = (s) => +String(s).replace(/[^0-9.]/g, '') || 0;
  ok(V && n0(V.plan) === 500, '기획 수량 500 (300+200)');
  ok(V && n0(V.pplan) === 400, '전년 기획 수량 400');
  ok(V && n0(V.dplan) === 100 && /\+/.test(V.dplan), '기획 증감 +100');
  ok(V && Math.abs(n0(V.rplan) - 25) < 0.2 && /▲/.test(V.rplan), '기획 증감률 ▲ 25.0%');
  ok(V && n0(V.inq) === 400, '입고 수량 400 (250+150)');
  ok(V && n0(V.pin) === 400, '전년 입고 수량 400');
  ok(V && n0(V.din) === 0, '입고 증감 0');
  ok(V && Math.abs(n0(V.rin)) < 0.2, '입고 증감률 0.0%');
  // 전년 자료가 없는 시즌은 '-'
  await pg.goto(URL + '#/newprod?s=2025FW'); await pg.waitForTimeout(2000);
  const t2 = (await pg.textContent('#body')).replace(/\s+/g, ' ');
  ok(/2024 F\/W 자료를 올리면 표시/.test(t2), '전년 자료가 없으면 안내');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
