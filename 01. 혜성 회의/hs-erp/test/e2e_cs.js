// 전산자료: 여러 파일 한 번에 올리기 (WMS 정상/반품 · ERP 온라인/매장) → 대시보드 · 로케이션 팝업 · 신상품 동기화
// 2026-11-10: 출고 지시 자료(배분LIST · 버킷 · 사방넷)는 전산자료에서 안 씀 (아침 출고지시 취합 화면에서 올림) → 그 부분 점검을 바꿈
const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const FX = __dirname + '/fx/'; const SH = __dirname + '/shots/';
const login = async (pg, id, pw) => { await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1500); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove())); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await login(pg, 'admin', 'admin1234');
  const d = await pg.evaluate(() => HS.today());
  // 메뉴 순서: 공지 → 월간 회의 → 전산자료
  const groups = await pg.evaluate(() => [...document.querySelectorAll('.nav .ng')].map((x) => x.dataset.g).filter(Boolean));
  const gi = (n) => groups.findIndex((x) => x.indexOf(n) >= 0);
  ok(gi('월간 회의') >= 0 && gi('전산자료') === gi('월간 회의') + 1, '메뉴: 월간 회의 다음 전산자료 ' + JSON.stringify(groups.slice(0, 4)));
  // 신상품 하나 미리 (WMS 동기화 확인용)
  const season = await pg.evaluate(async () => { const s = HS.curSeason(); await HS.db.upsert('erp_np_style', [{ season: s, style: 'H11F3FH208', brand: '하이드로겐', plan_qty: 200, in_qty: 150, out_qty: 0, stock: 0, stock_loc: 0, flags: [] }]); return s; });
  await pg.goto(URL + '#/csdash'); await pg.waitForTimeout(1000);
  await pg.click('#csup'); await pg.waitForSelector('#cd input', { state: 'attached' });
  await pg.setInputFiles('#cd input', [FX + 'cs_wms.xlsx', FX + 'cs_erp.xlsx', FX + 'cs_bucket.xlsx']); await pg.waitForTimeout(2500);
  const kinds = await pg.$$eval('#cr select', (s) => s.map((x) => x.value)); ok(JSON.stringify(kinds) === JSON.stringify(['wms', 'erp', '']), '종류 자동 인식 (WMS · ERP · 버킷은 안 씀 → 빈칸) ' + JSON.stringify(kinds));
  await pg.screenshot({ path: SH + 'cs1_upload.png' });
  await pg.click('.modal .mf .btn.p'); await pg.waitForFunction(() => !document.querySelector('#cd'), null, { timeout: 60000 }); await pg.waitForTimeout(2500);
  // 로케이션 팝업 (정상창고 올리면 자동)
  const lp = await pg.$('.modal-bg.locpop'); ok(!!lp, '정상창고 올린 뒤 로케이션 확인 팝업');
  if (lp) { const t = await lp.textContent(); ok(/로케이션 없음/.test(t), '팝업: 로케이션 없음 목록'); await pg.screenshot({ path: SH + 'cs2_locpop.png' }); await pg.click('.modal-bg.locpop .mf .btn.p'); await pg.waitForTimeout(400); }
  const S = await pg.evaluate(async () => { const L = await HS.csLatest(); const o = {}; for (const k in L) o[k] = L[k].rows; return o; });
  ok(S['wms|정상창고'] > 3000 && S['wms|반품창고'] > 50 && S['erp|온라인'] === 21 && S['erp|매장'] === 39, '창고 · 채널 자동 구분 ' + JSON.stringify(S));
  const parts = await pg.evaluate(async () => (await HS.db.list('erp_cs_part', { eq: { kind: 'wms', sub: '정상창고' } })).map((x) => x.brand)); ok(parts.length > 1 && parts.every((b) => b != null) && new Set(parts).size === parts.length, '상세는 브랜드 묶음으로 저장 (' + parts.length + '묶음)');
  const np = await pg.evaluate(async (s) => (await HS.db.list('erp_np_style', { eq: { season: s, style: 'H11F3FH208' } }))[0], season);
  ok(np && +np.out_qty > 0 && +np.stock > 0, '신상품 출고 · 재고 WMS로 자동 갱신 (따로 올리지 않음) out=' + (np && np.out_qty) + ' stock=' + (np && np.stock));
  const ord = await pg.evaluate(async (d) => (await HS.db.list('erp_orders', { eq: { rec_date: d } })).map((r) => r.section + ':' + r.brand + ':' + r.qty).sort(), d);
  ok(!ord.some((x) => /^b2c_ch:크리스:/.test(x)), '버킷 파일은 전산자료에서 안 씀 (아침 출고지시 취합에서 올림) ' + JSON.stringify(ord));
  const pii = await pg.evaluate(() => JSON.stringify(localStorage).match(/홍길동|010-0000/)); ok(!pii, '이름 · 전화 저장 안 함');
  await pg.goto(URL + '#/csdash'); await pg.waitForTimeout(1200); await pg.screenshot({ path: SH + 'cs3_dash.png', fullPage: true });
  ok((await pg.textContent('#body')).indexOf('브랜드별 추이') >= 0, '대시보드 브랜드별 추이');
  await pg.goto(URL + '#/cs?k=wms'); await pg.waitForTimeout(1200); await pg.screenshot({ path: SH + 'cs4_wms.png', fullPage: true });
  ok(/로케이션 없음/.test(await pg.textContent('#body')), 'WMS 재고 화면');
  await pg.goto(URL + '#/cs?k=erp&t=합계'); await pg.waitForTimeout(1000); ok(/합계/.test(await pg.textContent('#body')), 'ERP 합계 (매장 + 온라인)'); await pg.screenshot({ path: SH + 'cs5_erp.png', fullPage: true });
  // 출고 지시 화면(배분LIST · 온라인 · 지시 조회)은 폐기 — 주소로 들어와도 WMS 재고로 되돌림
  await pg.goto(URL + '#/cs?k=order&t=온라인&d=' + d); await pg.waitForTimeout(1200); await pg.screenshot({ path: SH + 'cs6_online.png', fullPage: true });
  ok(/정상창고/.test(await pg.textContent('#tools')) && !/배분LIST/.test(await pg.textContent('#tools')), '출고 지시 화면 폐기 → WMS 재고 탭으로 되돌림');
  await pg.goto(URL + '#/csdash'); await pg.waitForTimeout(1000); const tx = await pg.textContent('#body'); ok(tx.indexOf('배분지시 현황') < 0 && tx.indexOf('브랜드별 추이') >= 0 && tx.indexOf('오늘 올릴 전산 자료') > tx.indexOf('브랜드별 추이'), '대시보드: 배분지시 현황 없음(폐기) · 오늘 올릴 자료는 맨 아래');
  // 09:00 알림 (자동 시험에선 꺼져 있음 → 직접 호출)
  await pg.evaluate(() => { localStorage.removeItem('x'); });
  // 권한: 실무진은 보기만
  const p2 = await b.newPage({ viewport: { width: 390, height: 844 } }); p2.on('pageerror', (e) => errs.push(e.message));
  await login(p2, 'staff', '1234').catch(() => null);
  if (await p2.$('#body')) { await p2.goto(URL + '#/csdash'); await p2.waitForTimeout(1200); ok(!(await p2.$('#csup')), '실무진: 올리기 버튼 없음 (보기만)'); await p2.screenshot({ path: SH + 'cs8_mobile.png', fullPage: true }); }
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close();
})();
