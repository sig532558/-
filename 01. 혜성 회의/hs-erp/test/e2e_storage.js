// 저장 공간 화면 + 안성 추가 3항목 탭 (로컬 모드)
const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/';
(async () => { const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body');
  // 1) 기록 없음 상태
  await pg.goto(URL + '#/storage'); await pg.waitForTimeout(900); let t = await pg.textContent('#body');
  ok(/500 MB/.test(t) && /기록 쌓는 중|늘지 않음/.test(t), '저장 공간: 기록 없을 때 안내');
  ok(await pg.$('a[data-q="storage"], .nav a[href="#/storage"]') !== null || /저장 공간/.test(await pg.textContent('.nav')), '설정 메뉴에 저장 공간');
  await pg.click('#snap'); await pg.waitForTimeout(800);
  ok(/마지막 기록/.test(await pg.textContent('#tools')), '지금 다시 재기 → 기록됨');
  // 2) 60일 기록 흉내 (하루 2.3MB) → 예상일 계산
  const calc = await pg.evaluate(async () => {
    const MBb = 1048576, td = HS.today(); const hist = []; for (let i = 60; i >= 1; i--) { const d = HS.addDays(td, -i); const dow = new Date(d).getDay(); hist.push({ d, db: (186 - 2.3 * i) * MBb, file: 42 * MBb, tables: [{ name: 'erp_cnt_part', bytes: (58 - 0.9 * i) * MBb }, { name: 'erp_as_ret', bytes: (10 - 0.6 * Math.min(i, 14)) * MBb }], at: d + 'T00:10:00Z' }); }
    const fake = { db_bytes: 186 * MBb, limit_bytes: 500 * MBb, file_bytes: 42 * MBb, file_limit: 1024 * MBb, tables: [{ name: 'erp_cnt_part', bytes: 58 * MBb }, { name: 'erp_as_ret', bytes: 10 * MBb }, { name: 'erp_worklog', bytes: 20 * MBb }], hist, cron: true };
    const orig = HS.db.rpc.bind(HS.db); HS.db.rpc = async (fn, a) => (fn === 'erp_usage' ? JSON.parse(JSON.stringify(fake)) : orig(fn, a));
    const C = HS.storageCalc(fake); return { avg: C.avg / MBb, days: C.daysLeft, eta: C.eta, level: C.level, g: C.growth.erp_as_ret / MBb };
  });
  ok(Math.abs(calc.avg - 2.3) < 0.01 && calc.days === 137, '하루 평균 2.3MB · 남은 137일 (' + calc.eta + ')');
  ok(Math.abs(calc.g - 0.6) < 0.01, '항목별 하루 증가 계산 (안성 반품검수 +0.6MB)');
  await pg.evaluate(() => HS.route()); await pg.waitForTimeout(900); t = await pg.textContent('#body');
  ok(t.indexOf(calc.eta) >= 0 && /137일/.test(t) && /2\.3 MB\/일/.test(t), '화면: 예상일 · 남은 일수 · 평균 표시');
  ok((await pg.$$('#body svg')).length === 2, '누적 추이 · 하루 사용 그래프 2개');
  ok(/안성 · 반품검수 박스별/.test(t), '자료 이름 한글 표시');
  await pg.screenshot({ path: SH + 's1_storage.png', fullPage: true });
  // 3) 85% → 빨간 알림 + 대시보드 알림 줄
  await pg.evaluate(() => { const o = HS.db.rpc; HS.db.rpc = async (fn, a) => { const r = await o(fn, a); if (fn === 'erp_usage' && r) { r.db_bytes = 440 * 1048576; } return r; }; });
  await pg.evaluate(() => HS.route()); await pg.waitForTimeout(700);
  ok(/저장 공간 주의/.test(await pg.textContent('#body')), '85% 넘으면 빨간 알림');
  await pg.goto(URL + '#/meeting'); await pg.waitForTimeout(1500);
  ok(/저장 공간 88% 사용/.test(await pg.textContent('#body')), '월간 회의 보고서 맨 위 알림 줄'); await pg.screenshot({ path: SH + 's_dash.png' });
  // 모바일
  await pg.setViewportSize({ width: 390, height: 844 }); await pg.goto(URL + '#/storage'); await pg.waitForTimeout(900);
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= 392), '모바일 가로 넘침 없음');
  await pg.setViewportSize({ width: 1440, height: 900 });
  // 4) 안성 추가 3항목
  await pg.goto(URL + '#/anseong?k=ret'); await pg.waitForTimeout(800);
  ok(/받을 항목/.test(await pg.textContent('#body')), '반품검수: 꺼져 있으면 켜는 곳 안내');
  await pg.goto(URL + '#/anseong?k=opt'); await pg.waitForTimeout(800);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove())); // 신상품 알림 창 닫기
  for (const k of ['returns', 'sorter', 'inventory']) await pg.check('input[data-k="' + k + '"]');
  await pg.click('#sv'); await pg.waitForTimeout(800);
  const opt = await pg.evaluate(async () => (await HS.db.list('erp_settings', { eq: { key: 'anseong_opts' } }))[0].value);
  ok(opt.types.length === 7 && opt.types[0] === 'daily', '받을 항목 저장 (7가지)');
  await pg.screenshot({ path: SH + 's2_anseong_opt.png', fullPage: true });
  await pg.evaluate(async () => {
    await HS.db.rpc('erp_as_store', { p_type: 'returns', p_from: '2026-10-01', p_to: '2026-10-31', p: { rows: [{ work_date: '2026-10-27', box: 'B001', store: 'N101', store_name: '강남점', order_no: '3', kind: '시즌반품', plan_qty: 30, sent_qty: 28, rfid_qty: 20, nonrfid_qty: 8, sku_cnt: 12, confirmed: 'Y' }, { work_date: '2026-10-28', box: 'B002', store: 'N102', store_name: '분당점', plan_qty: 20, sent_qty: 20, rfid_qty: 15, confirmed: 'N' }] } });
    await HS.db.rpc('erp_as_store', { p_type: 'sorter', p_from: '2026-10-01', p_to: '2026-10-31', p: { rows: [{ date: '2026-10-27', style: 'N1A', qty: 150 }, { date: '2026-10-27', style: 'N2B', qty: 70 }, { date: '2026-10-28', style: 'N1A', qty: 40 }] } });
    await HS.db.rpc('erp_as_store', { p_type: 'inventory', p_from: '2026-10-01', p_to: '2026-10-28', p: { rows: { flow: [{ style: 'N1A', opening: 500, in: 150, out: 80, closing: 570 }, { style: 'N2B', opening: 100, in: 70, out: 10, closing: 160 }], stock: [{ style: 'N1A', place: '가용', qty: 400 }, { style: 'N1A', place: '검수장', qty: 170 }, { style: 'N2B', place: '가용', qty: 160 }], daily: [{ date: '2026-10-27', kind: '반품확정', qty: 5200 }, { date: '2026-10-27', kind: '가용화', qty: 4100 }] } } });
  });
  await pg.goto(URL + '#/anseong?k=ret&f=2026-10-01&t=2026-10-31'); await pg.waitForTimeout(900); t = await pg.textContent('#body');
  ok(/검수 박스/.test(t) && /강남점/.test(t) && /미확정/.test(t) && /48/.test(t), '반품검수 탭: 박스 · 매장 · 미확정');
  await pg.screenshot({ path: SH + 's3_anseong_ret.png', fullPage: true });
  await pg.goto(URL + '#/anseong?k=sorter&f=2026-10-01&t=2026-10-31'); await pg.waitForTimeout(900); t = await pg.textContent('#body');
  ok(/260/.test(t) && /N1A/.test(t) && /190/.test(t), '소터 탭: 합계 260 · N1A 190');
  await pg.goto(URL + '#/anseong?k=inv&f=2026-10-01&t=2026-10-31'); await pg.waitForTimeout(900); t = await pg.textContent('#body');
  ok(/730/.test(t) && /가용/.test(t) && /검수장/.test(t) && /가용화/.test(t), '수불 탭: 끝 재고 730 · 장소별 · 날짜별');
  await pg.screenshot({ path: SH + 's4_anseong_inv.png', fullPage: true });
  await pg.goto(URL + '#/anseong?f=2026-10-01&t=2026-10-31'); await pg.waitForTimeout(800);
  ok(/연결 상태/.test(await pg.textContent('#body')), '요약 탭 그대로');
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close(); })();
