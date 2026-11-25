// 정상팀 › 신상품 현황 — 주단위 출고 현황(전월 · 당월) · 전개시기 ↔ 강제 등록 · 미정리 · 미출고
//  · 품번 자료를 직접 넣고(입고팀 신상품 자료와 같은 모양) 화면이 그 숫자를 그대로 쓰는지 본다
//  · 2026-11-10(화) 기준 주차: 11월1주 11/02~11/08 · 11월2주 11/09~11/15 · 11월3주 11/16~11/22
const { chromium } = require('playwright');
const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/';
const S = '2026FW';
// st_out 이 '미출고' 인데 현재고가 0이면 화면이 '출고완료'로 봄 → 미출고 품번에는 재고를 남겨 둔다
const R = (style, brand, plan, hq, o) => Object.assign({ season: S, style, brand, scode: 'F6', item: 'OT', plan_qty: 100, plan_date: plan, hq_date: hq, in_qty: 100, in_date: plan, out_qty: 0, stock: 0, stock_loc: 0, st_in: '입고', st_out: '출고완료', st_clean: '정리완료', defect: false, flags: [] }, o);
const ROWS = [
  // ① 전월(10월)
  R('A1', '핑', '2026-10-06', null, { out_qty: 100 }),                                   // 10월2주 · 출고완료
  R('A2', '핑', '2026-10-07', null, { st_out: '미출고', stock: 50 }),                     // 10월2주 · 미출고
  R('A3', '팬텀', '2026-10-20', null, { out_qty: 80, stock: 100, st_clean: '미정리' }),    // 10월4주 · 출고 후 미정리
  // ② 당월(11월)
  R('B1', '핑', '2026-11-03', null, { out_qty: 100 }),                                   // 전개 1주 · 강제 1주
  R('B2', '핑', '2026-11-04', '2026-11-10', { out_qty: 100 }),                           // 전개 1주 · 강제 2주 (차이)
  R('B3', '팬텀', '2026-11-09', null, { st_out: '미출고', stock: 60 }),                    // 전개 2주 · 미출고
  R('B4', '팬텀', '2026-11-17', null, { st_in: '미입고', in_qty: 0, st_out: '미출고' }),    // 전개 3주 · 미입고
  R('B5', '링스', null, null, { st_out: '미출고', stock: 70 }),                            // 전개일 없음 · 미출고
];
// 표에서 그 줄을 찾아 (No 칸이 붙어도) 그 글자부터 끝까지 돌려줌
const rowOf = (pg, sel, label) => pg.evaluate(([s, l]) => {
  for (const t of document.querySelectorAll(s + ' table')) for (const r of t.rows) {
    const c = [...r.cells].map((x) => x.textContent.replace(/\s+/g, ' ').trim());
    const i = c.findIndex((x) => x === l || x.indexOf(l + ' ') === 0); if (i >= 0) return c.slice(i);
  }
  return null;
}, [sel, label]);

(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 1100 } }); const errs = [];
  // 주차 확인이 들어 있어 오늘 날짜를 2026-11-10 (11월2주) 로 고정한다 — 안 그러면 날짜에 따라 [이번 주] 가 어긋난다
  await pg.addInitScript(() => { const T = new Date('2026-11-10T10:00:00').getTime(); const D = Date; class FD extends D { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } } window.Date = FD; });
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  await pg.evaluate(async (rows) => { await HS.db.upsert('erp_np_style', rows); }, ROWS);

  // ---------- 0. 메뉴 · 화면 ----------
  await pg.goto(URL + '#/npout?m=2026-11'); await pg.waitForSelector('#np1', { timeout: 20000 }); await pg.waitForTimeout(900);
  const nav = await pg.$$eval('.nav .ng[data-g="정상팀"] a', (x) => x.map((a) => a.textContent.trim()));
  ok(nav.indexOf('신상품 현황') >= 0 && nav[0] === '원가 관리 입력', '정상팀 메뉴에 신상품 현황 ' + JSON.stringify(nav));
  const kp = await pg.$$eval('.kpi .v', (x) => x.map((e) => e.textContent.trim()));
  ok(kp[0] === '4' && kp[1] === '2', '요약: 당월 전개 품번 4 · 출고 완료 2 ' + JSON.stringify(kp));
  ok(kp[2] === '3' && kp[3] === '1', '요약: 입고 후 미출고 3 · 출고 후 미정리 1 ' + JSON.stringify(kp));

  // ---------- 1. 전월 주단위 ----------
  const w102 = await rowOf(pg, '#np1', '10월2주'); const w104 = await rowOf(pg, '#np1', '10월4주');
  ok(w102 && w102[1] === '10/05 ~ 10/11', '10월2주 기간 10/05 ~ 10/11 ' + JSON.stringify(w102));
  ok(w102 && w102[2] === '2' && w102[3] === '2' && w102[4] === '1' && w102[6] === '1', '10월2주: 기획 2 · 입고 2 · 출고 1 · 미출고 1 ' + JSON.stringify(w102));
  ok(w104 && w104[2] === '1' && w104[4] === '1' && w104[7] === '1', '10월4주: 기획 1 · 출고 1 · 미정리 1 ' + JSON.stringify(w104));
  const t1 = await rowOf(pg, '#np1', '합계');
  ok(t1 && t1[2] === '3' && t1[4] === '2' && t1[5] === '66.7%', '전월 합계: 기획 3 · 출고 2 · 출고율 66.7% ' + JSON.stringify(t1));

  // ---------- 2. 당월 주단위 · 전개 ↔ 강제 ----------
  const v1 = await rowOf(pg, '#np2', '11월1주'); const v2 = await rowOf(pg, '#np2', '11월2주'); const v3 = await rowOf(pg, '#np2', '11월3주');
  ok(v1 && v1[1] === '11/02 ~ 11/08', '11월1주 기간 11/02 ~ 11/08 ' + JSON.stringify(v1));
  ok(v1 && v1[2] === '2' && v1[4] === '2' && v1[6] === '1' && v1[10] === '-1', '11월1주: 전개 2 → 강제 1 · 차이 -1 ' + JSON.stringify(v1));
  ok(v2 && v2[2] === '1' && v2[6] === '2' && v2[10] === '+1', '11월2주: 전개 1 → 강제 2 · 차이 +1 ' + JSON.stringify(v2));
  ok(v2 && v2[0].indexOf('이번 주') > 0, '오늘이 든 주에 [이번 주] 표시 ' + JSON.stringify(v2 && v2[0]));
  ok(v3 && v3[2] === '1' && v3[3] === '0', '11월3주: 기획 1 · 입고 0 (미입고) ' + JSON.stringify(v3));
  const t2 = await rowOf(pg, '#np2', '합계');
  ok(t2 && t2[2] === '4' && t2[6] === '4' && t2[10] === '-', '당월 합계: 전개 4 = 강제 4 · 차이 없음 ' + JSON.stringify(t2));
  await pg.screenshot({ path: SH + 'npo1.png', fullPage: true });

  // 주를 누르면 그 주 품번 목록
  await pg.click('#np2 tr[data-w="2026-11-09"]'); await pg.waitForTimeout(1200);
  const wtx = await pg.textContent('body');
  ok(/11월2주 품번/.test(wtx) && /B2/.test(wtx) && /B3/.test(wtx), '주를 누르면 그 주 품번(B2 강제 · B3 전개) 목록');
  ok(/강제/.test(await pg.textContent('#body')), '본사 요청일로 들어온 품번에 [강제] 표시');

  // ---------- 3. 출고 후 미정리 ----------
  // 화면에는 브랜드 표시 이름(2 (FANTOM) 등)이 나오므로 data-ub 로 찾는다
  const u = await pg.evaluate(() => { const tr = document.querySelector('#np3 tr[data-ub="팬텀"]'); if (!tr) return null; const c = [...tr.cells].map((x) => x.textContent.replace(/\s+/g, ' ').trim()); const i = c.findIndex((x) => /FANTOM|팬텀/.test(x)); return i < 0 ? c : c.slice(i); });
  ok(u && u[2] === '1' && u[3] === '100', '미정리: 팬텀 1 ST · 100 PCS ' + JSON.stringify(u));
  await pg.click('#np3 tr[data-ub="팬텀"]'); await pg.waitForTimeout(600);
  ok(/A3/.test(await pg.textContent('#np3 #ud')), '브랜드를 누르면 품번 목록(A3)');

  // ---------- 4. 입고 후 미출고 ----------
  const n4 = await pg.$$eval('#np4 tbody tr, #np4 table tr', (t) => t.map((r) => r.textContent.replace(/\s+/g, ' ').trim()).filter((x) => /A2|B3|B5/.test(x)));
  ok(n4.length === 3, '미출고 3건 (A2 · B3 · B5) ' + n4.length);
  ok(/A2/.test(n4[0]) && /지남/.test(n4[0]), '전개일 지난 것이 맨 위 ' + n4[0]);
  ok(/B5/.test(n4[2]) && /전개일 없음/.test(n4[2]), '전개일 없는 품번은 맨 뒤 · [전개일 없음] ' + n4[2]);

  // ---------- 5. 브랜드 고르기 ----------
  await pg.selectOption('#tools select', '핑'); await pg.waitForTimeout(1500);
  const kb = await pg.$$eval('.kpi .v', (x) => x.map((e) => e.textContent.trim()));
  ok(kb[0] === '2' && kb[3] === '0', '브랜드 핑만: 당월 전개 2 · 미정리 0 ' + JSON.stringify(kb));
  await pg.screenshot({ path: SH + 'npo2_brand.png', fullPage: true });

  // ---------- 6. 다른 달로 옮기기 ----------
  await pg.goto(URL + '#/npout?m=2026-10'); await pg.waitForSelector('#np1'); await pg.waitForTimeout(1200);
  const o1 = await rowOf(pg, '#np2', '10월2주');
  ok(o1 && o1[2] === '2', '달을 바꾸면 ② 당월 표가 10월로 바뀜 ' + JSON.stringify(o1));

  // ---------- 7. 휴대폰 ----------
  await pg.setViewportSize({ width: 390, height: 840 }); await pg.goto(URL + '#/npout?m=2026-11'); await pg.waitForTimeout(2000);
  const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 1, '휴대폰 화면 가로 넘침 없음 (' + over + ')');
  await pg.screenshot({ path: SH + 'npo3_mobile.png', fullPage: false });

  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
