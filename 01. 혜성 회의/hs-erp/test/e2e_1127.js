// 2026-11-23 지시 — ① 월간 회의 브랜드 차례 ② 차주 신상품 입고 계획 ③ 전주 · 금주 브랜드별 출고
//                    ④ 금주 · 차주 출고 현황 ⑤ 반품 정리 현황 이름 · 단위 ⑥ 시즌 계획 폐기 확인
const { chromium } = require('playwright'); const XLSX = require('xlsx');
const URL = 'http://localhost:' + (process.env.PORT || process.argv[2] || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const p2 = (n) => String(n).padStart(2, '0');
const iso = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const add = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const mon = (s) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const md = (s) => +s.slice(5, 7) + '/' + +s.slice(8, 10);

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(900);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));

  const today = await pg.evaluate(() => HS.today());
  const curMon = mon(today), preMon = add(curMon, -7), nxtMon = add(curMon, 7);
  const YM = today.slice(0, 7), LY = (+today.slice(0, 4) - 1) + today.slice(4, 7);

  // ================= ⑥ 시즌 계획 폐기 =================
  const navTxt = await pg.textContent('nav.nav');
  // 2026-11-24: 이월팀 [시즌반품정리현황] 이 새로 생겼으므로 '시즌' 글자가 아니라 폐기한 메뉴 이름으로 본다
  ok(!/시즌 아웃 반품 정리 계획|선지시 출고 계획|시즌 OPEN 정리 계획/.test(navTxt), '메뉴에 폐기한 시즌 계획이 없음');
  await pg.goto(URL + '#/season?ph=sort'); await pg.waitForTimeout(900);
  ok(!/시즌 아웃|선지시 출고 계획/.test(await pg.textContent('#ttl')), '주소로도 시즌 계획이 안 열림');
  ok(await pg.evaluate(() => HS.RETIRED.indexOf('season') >= 0 && !HS.LAZY.season), '폐기 목록에 들어가고 파일도 안 받음');
  ok(await pg.evaluate(() => Array.isArray(HS.HOLIDAYS) && HS.HOLIDAYS.indexOf('2027-01-01') >= 0), '공휴일 목록은 HS.HOLIDAYS 로 옮겨짐');

  // ================= ① 월간 회의 ② 월별 입고 현황 브랜드 차례 =================
  await pg.evaluate(async ([ym, ly]) => {
    const rows = []; const put = (br, d, q) => rows.push([br, d, '입고', '2026', 'F', '아우터', 'X1', 'BK', q, d]);
    ['PING', 'LYNX', 'MAMMUT'].forEach((br, i) => { put(br, ym + '-10', 1000 + i * 100); put(br, ly + '-10', 900 + i * 100); });
    await HS.db.upsert('erp_np_raw', [{ kind: 'inbound', file: '차례시험.xlsx', n: rows.length, rows }]);
  }, [YM, LY]);
  await pg.waitForTimeout(600);
  await pg.goto(URL + '#/meeting?m=' + YM); await pg.waitForSelector('#npmonb table', { timeout: 20000 }); await pg.waitForTimeout(800);
  const shown = await pg.$$eval('#npmonb table tr td:first-child', (t) => t.map((x) => x.textContent.trim()).filter((v) => !/합계/.test(v)));
  const want = await pg.evaluate(() => HS.bsort(['PING', 'LYNX', 'MAMMUT'].map((x) => HS.brandOf(x) || x)).map((x) => HS.bname(x) || x));
  ok(shown.length === 3 && shown.join('|') === want.join('|'), '월별 입고 현황 브랜드 차례 = 기준정보 순번 (화면 ' + shown.join(' · ') + ' / 기준 ' + want.join(' · ') + ')');

  // 신상품 자료 넣기 (② ③ 둘 다 이 자료 위에서 봄)
  await pg.evaluate(async ([pm, cm]) => {
    const s = HS.curSeason();
    const mk = (style, brand, d, q) => ({ season: s, style, brand, plan_date: d, hq_date: d, in_qty: q, out_qty: q, stock: 0, st_in: '입고', st_out: '출고완료', st_clean: '정리', flags: [] });
    await HS.db.upsert('erp_np_style', [
      mk('W1PING01', HS.brandOf('PING') || 'PING', HS.addDays(pm, 1), 500),
      mk('W1PING02', HS.brandOf('PING') || 'PING', HS.addDays(pm, 2), 300),
      mk('W2PING03', HS.brandOf('PING') || 'PING', HS.addDays(cm, 1), 700),
      mk('W2LYNX01', HS.brandOf('LYNX') || 'LYNX', HS.addDays(cm, 2), 250),
    ]);
    await HS.db.upsert('erp_settings', [{ key: 'np_update', value: { [s]: { at: new Date().toISOString(), by: '점검' } } }]);
  }, [preMon, curMon]);
  await pg.waitForTimeout(700);

  // ================= ② 입고팀 금주 · 차주 상품 입고 계획 =================
  //  2026-11-24: 본사 실제 양식(금주차주 입고스케줄)으로 다시 만들었으므로 자세한 점검은 e2e_inplan.js 로 옮겼다
  await pg.goto(URL + '#/newprod'); await pg.waitForSelector('.ipb', { timeout: 20000 }); await pg.waitForTimeout(1200);
  ok(/금주 · 차주 상품 입고 계획/.test(await pg.textContent('#body')), '② 아래에 금주 · 차주 상품 입고 계획 칸');

  // ================= ③ 정상팀 신상품 현황 — 전주 · 금주 브랜드별 출고 =================
  await pg.goto(URL + '#/npout'); await pg.waitForSelector('#npw', { timeout: 20000 }); await pg.waitForTimeout(1200);
  const npw = await pg.evaluate(() => [...document.querySelectorAll('#npw table tr')].map((r) => [...r.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim())));
  const pingRow = npw.find((r) => /PING/.test(r[0] || ''));
  ok(!!pingRow && pingRow[1] === '2' && pingRow[2] === '800', 'PING 전주 ST 2 · 수량 800 (' + JSON.stringify(pingRow) + ')');
  ok(!!pingRow && pingRow[3] === '1' && pingRow[4] === '700', 'PING 금주 ST 1 · 수량 700');
  ok(!!pingRow && pingRow[5] === '2' && pingRow[7] === '1', '강제 등록 기준 칸도 같이 나옴');
  const npwHead = (await pg.textContent('#npw h3')).replace(/\s+/g, ' ');
  ok(/③ 전주 · 금주 브랜드별 출고 현황/.test(npwHead), '③ 전주 · 금주 브랜드별 출고 현황 · ' + npwHead.slice(0, 50));
  const t45 = await pg.textContent('#body');
  ok(/④ 출고 후 미정리/.test(t45) && /⑤ 입고 후 미출고/.test(t45), '아래 두 칸은 ④ ⑤ 로 밀림');

  // ================= ④ 정상팀 출고 현황 — 금주 · 차주 =================
  await pg.evaluate(async ([cm, nm, pm]) => {
    const recs = []; const put = (d, q) => recs.push({ rec_date: d, section: 'b2b', rec_key: HS.brandOf('PING') || 'PING', data: { out_qty: q } });
    for (let i = 0; i < 5; i++) { put(HS.addDays(pm, i), 1000 + i); put(HS.addDays(cm, i), 2000 + i); put(HS.addDays(nm, i), 3000 + i); }
    const ly = (s) => (+s.slice(0, 4) - 1) + s.slice(4);
    for (let i = 0; i < 5; i++) { put(ly(HS.addDays(cm, i)), 500 + i); put(ly(HS.addDays(nm, i)), 600 + i); }
    await HS.db.upsert('erp_daily_records', recs);
  }, [curMon, nxtMon, preMon]);
  await pg.waitForTimeout(700);
  await pg.goto(URL + '#/shipout?s=daily'); await pg.waitForSelector('#so4', { timeout: 20000 }); await pg.waitForTimeout(1200);
  ok(/③ 금주 출고 현황/.test(await pg.textContent('#so4 h3')), "③ 이름이 '금주 출고 현황' 으로 바뀜");
  ok(!!(await pg.$('#so5')), '④ 차주 출고 현황 칸이 생김');
  const so5 = (await pg.textContent('#so5')).replace(/\s+/g, ' ');
  ok(/차주 출고 현황/.test(so5), '④ 제목 · ' + so5.slice(0, 40));
  const h5 = (await pg.$$eval('#so5 table tr:first-child th', (t) => t.map((x) => x.textContent.replace(/\s+/g, ' ').trim()))).filter((x) => x !== 'No');
  ok(h5.length === 5 && /금주/.test(h5[2]) && /차주/.test(h5[3]), '칸 = 요일 · 전년 차주 · 금주 · 차주 · 전년대비 (' + h5.join(' · ') + ')');
  const r5 = await pg.evaluate(() => { const r = [...document.querySelectorAll('#so5 table tr')].find((x) => [...x.children].some((c) => c.textContent.trim() === '월'));
    return r ? [...r.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).filter((v, i, a) => !(i === 0 && /^\d+$/.test(v) && a.length > 5)) : null; });
  ok(!!r5 && /3,000/.test(r5[3] || ''), '차주 월요일 3,000 (' + JSON.stringify(r5) + ')');
  ok(!!r5 && /60\d/.test(r5[1] || ''), '전년 차주 칸은 전년 같은 주 자료 (' + (r5 ? r5[1] : '-') + ')');

  // ================= ⑤ 반품 정리 현황 — 이름 · 단위 =================
  await pg.evaluate(async (ym) => {
    const rows = []; for (let i = 1; i <= 4; i++) rows.push({ source_key: 'N|rc|' + i, kind: 'rc_close', rec_date: ym + '-0' + i, brand: HS.brandOf('PING') || 'PING', title: '매장' + i, qty: 100 * i, state: i <= 3 ? '정리완료' : '인계대기', data: { 박스수량: 10 } });
    await HS.db.upsert('erp_records', rows);
  }, YM);
  await pg.waitForTimeout(700);
  await pg.goto(URL + '#/rclean'); await pg.waitForTimeout(2500);
  const rc = (await pg.textContent('#body')).replace(/\s+/g, ' ');
  ok(/등록된 매장 \(개\)/.test(rc) && !/등록된 줄/.test(rc), "요약칸이 '등록된 매장 (개)' 로 바뀜");
  const rh = await pg.$$eval('#body table th', (t) => t.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  ok(rh.indexOf('매장 (개)') >= 0 && rh.indexOf('수량 (PCS)') >= 0 && rh.indexOf('박스 (BOX)') >= 0, '대장별 표 칸에 단위 (' + rh.slice(0, 7).join(' · ') + ')');
  ok(rh.indexOf('줄') < 0, "'줄' 칸이 없음");

  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
