// 재고 한 번 등록 → 활용: 월간 회의 월말 재고
// 2026-11-10: 팀 화면(#/kpi) 재고 요약은 그 화면이 폐기돼 뺌 · 2026-11-23: 시즌 계획 [전산자료에서 가져오기]도 폐기돼 뺌
const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; const FX = __dirname + '/fx/';
const closeModals = (pg) => pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1200); await closeModals(pg);
  // 전산자료 올리기 (WMS + ERP 매장별)
  await pg.goto(URL + '#/csdash'); await pg.waitForTimeout(1000); await pg.click('#csup'); await pg.waitForSelector('#cd input', { state: 'attached' });
  await pg.setInputFiles('#cd input', [FX + 'cs_wms.xlsx', FX + 'cs_erp_store.xlsx']); await pg.waitForTimeout(3500);
  await pg.click('.modal .mf .btn.p'); await pg.waitForFunction(() => !document.querySelector('#cd'), null, { timeout: 120000 }); await pg.waitForTimeout(2500); await closeModals(pg);
  const want = await pg.evaluate(async () => { const r = {}; for (const [k, s] of HS.STOCK_ALL) { const x = await HS.csStockAt(k, s, HS.today()); r[k + s] = x && x.qty; } return r; }); console.log(want);
  ok(want.erp매장 === 2230 && want.erp온라인 === 400, 'ERP 매장별: 매장 2,230 · 온라인(온라인쇼핑몰) 400 · 합계 줄 제외');
  // 월간 회의
  const ym = await pg.evaluate(() => HS.today().slice(0, 7));
  await pg.goto(URL + '#/meeting?m=' + ym); await pg.waitForTimeout(2500);
  ok(/월말 재고/.test(await pg.textContent('#ms-vol')) && /ERP 매장 재고 \(PCS\)/.test(await pg.textContent('#ms-vol')), '회의 0번: 월말 재고 표');
  ok(/월말 정상창고 재고/.test(await pg.textContent('#ms-정상팀')) && /월말 온라인 재고/.test(await pg.textContent('#ms-온라인팀')) && /월말 반품창고 재고/.test(await pg.textContent('#ms-이월팀')), '정상 · 이월 · 온라인 팀 항목에 월말 재고 줄');
  // 2026-11-12 부터 월말 재고는 요약칸(.kc) · 그 안의 링크를 누르면 WMS 재고 조회로
  await pg.click('#ms-정상팀 .kc:has-text("월말 정상창고") a'); await pg.waitForTimeout(1200); ok(/#\/cs\?k=wms/.test(pg.url()), '월말 재고 요약칸을 누르면 WMS 재고 조회 ' + decodeURIComponent(pg.url()));
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close();
})();
