// 1105: 모든 표 순번 · 합계 줄 · 항목 수 · 여러 값 거르기 / 로케이션 없음 기준 (정상창고만)
// 2026-11-10: 4번 "배분LIST 매장 칸 없이" 는 그 화면이 폐기돼 뺌
const { chromium } = require('playwright'); const X = require('xlsx'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; const FX = __dirname + '/fx/';
const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const save = (name, aoa, sh) => { const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), sh || 'Sheet1'); X.writeFile(wb, FX + name); };
// WMS (가짜 자료): 정상창고 위치 빈칸 5 · TEMP 7 · 반품창고 빈칸 9
save('nl_wms.xlsx', [['창고코드', '위치정보', '바코드', '품번', '색상', '사이즈', '출고', '현재고', '미래발생분', '누적재고(미래재고)', '브랜드'],
  ['C0100 (정상창고)', 'A-01-01', 'x', '221E2TR803', 'NA', '95', 0, 100, 0, 100, '2 (FANTOM)'],
  ['C0100 (정상창고)', null, 'x', '221E2TR804', 'NA', '95', 0, 5, 0, 5, '2 (FANTOM)'],
  ['C0100 (정상창고)', 'temp', 'x', '221E2TR805', 'NA', '95', 0, 7, 0, 7, '2 (FANTOM)'],
  ['C0100 (정상창고)', null, 'x', '221E2TR806', 'NA', '95', 0, 0, 0, 0, '2 (FANTOM)'],
  ['C0500 (반품창고)', null, 'x', '221E2TR807', 'NA', '95', 0, 9, 0, 9, '2 (FANTOM)']]);
const login = async (pg, id, pw) => { await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1500); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove())); };
const csUp = async (pg, opener, files) => { await opener(); await pg.waitForSelector('#cd input', { state: 'attached' }); await pg.setInputFiles('#cd input', files.map((f) => FX + f)); await pg.waitForTimeout(2000); await pg.click('.modal .mf .btn.p'); await pg.waitForFunction(() => !document.querySelector('#cd'), null, { timeout: 60000 }); await pg.waitForTimeout(2000); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove())); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await login(pg, 'admin', 'admin1234');
  // ---------- 1. 표: 순번 · 합계 · 항목 수 ----------
  await pg.goto(URL + '#/home'); await pg.waitForTimeout(800);
  await pg.evaluate(() => {
    const c = HS.el('<div class="card" id="tg"><h3>시험표</h3><div class="tw"><table id="t1"><tr><th><input type="checkbox"></th><th>브랜드</th><th>품번</th><th class="n">기획</th><th class="n">입고</th><th>전개시기</th><th class="n">입고율</th></tr>' +
      [['MAMMUT', 'M31F6CP002', 110, 111, '2026-05-28', '101%'], ['PEARLY GATES', '599F7WL001', 1800, 1559, '2026-06-23', '87%'], ['MAMMUT', 'M31F6CP003', 81, 81, '2026-05-28', '100%'], ['MASTER BUNNY', '422F3PS951', 800, 828, '2026-07-01', '104%'], ['', '412F3TO902', 400, '1,200.5', '2026-07-01', '300%']]
        .map((r) => '<tr><td><input type="checkbox"></td>' + r.map((v, i) => '<td' + (i === 2 || i === 3 || i === 5 ? ' class="n"' : '') + '>' + v + '</td>').join('') + '</tr>').join('') + '</table></div></div>');
    const c2 = HS.el('<div class="card" id="tg2"><h3>합계있는표</h3><div class="tw"><table id="t2"><tr><th>브랜드</th><th class="n">현재고</th></tr><tr><td>A</td><td class="n">10</td></tr><tr><td>B</td><td class="n">20</td></tr><tr><td>C</td><td class="n">30</td></tr><tr class="tot"><td>합계</td><td class="n">60</td></tr></table></div></div>');
    document.getElementById('body').prepend(c2); document.getElementById('body').prepend(c); HS.enhanceTables();
  });
  await pg.waitForTimeout(400);
  const T = () => pg.evaluate(() => { const t = document.getElementById('t1'); return { th: [...t.rows[0].cells].map((c) => c.textContent.trim()), sum: [...t.querySelector('tr.gsum').cells].map((c) => c.textContent.trim()), no: [...t.rows].filter((r) => !r.classList.contains('gsum') && r.style.display !== 'none').slice(1).map((r) => r.cells[0].textContent), cnt: document.querySelector('#tg .gcnt').textContent, chips: document.querySelector('#tg .gchips').textContent, vis: [...t.rows].slice(1).filter((r) => r.style.display !== 'none' && !r.classList.contains('gsum')).map((r) => r.cells[3].textContent) }; });
  let s = await T();
  ok(s.th[0] === 'No', '첫 칸 No ' + JSON.stringify(s.th));
  ok(s.no.join(',') === '1,2,3,4,5', '순번 1~5 ' + s.no);
  ok(s.sum[0] === '합계' && s.sum[2] === '5건' && s.sum[4] === '3,191' && s.sum[5] === '3,779.5' && s.sum[6] === '' && s.sum[7] === '', '합계 줄: 수량만 더함 · 날짜 · 율 제외 ' + JSON.stringify(s.sum));
  ok(/항목 5건/.test(s.cnt) && /기획 합계 3,191/.test(s.cnt), '항목 수 · 합계 표시 ' + s.cnt);
  const s2 = await pg.evaluate(() => { const t = document.getElementById('t2'); return { r1: t.rows[1].textContent, gs: !!t.querySelector('tr.gsum'), no: [...t.rows].map((r) => r.cells[0].textContent) }; });
  ok(s2.r1.replace(/\s/g, '') === '합계60' && !s2.gs, '원래 합계 줄 있는 표 → 위로 옮김 (겹치지 않음) ' + JSON.stringify(s2));
  // ---------- 2. 머리글 ▾ 여러 값 거르기 ----------
  await pg.click('#t1 th .gdd[data-gci="1"]'); await pg.waitForSelector('.gpop');
  ok(/전체 선택/.test(await pg.textContent('.gpop')) && /반대로/.test(await pg.textContent('.gpop')) && /\(빈칸\)/.test(await pg.textContent('.gpop')), '고르기 창: 전체 선택 · 해제 · 찾은 것만 · 반대로 · 빈칸');
  await pg.click('.gpop [data-a="none"]'); await pg.check('.gpop [data-k="MAMMUT"]'); await pg.check('.gpop [data-k="PEARLY GATES"]'); await pg.click('.gpop [data-o]'); await pg.waitForTimeout(300);
  s = await T(); ok(s.vis.length === 3 && s.no.join(',') === '1,2,3' && s.sum[2] === '3건' && s.sum[4] === '1,991', '두 브랜드 골라 거름 · 순번 다시 · 보이는 줄만 합계 ' + JSON.stringify([s.vis, s.no, s.sum[4]]));
  ok(/항목 3 \/ 5건/.test(s.cnt) && /브랜드: MAMMUT 외 1/.test(s.chips), '보이는 수 / 전체 · 조건 칩 ' + s.cnt + ' | ' + s.chips);
  await pg.click('#t1 th .gdd[data-gci="4"]'); await pg.waitForSelector('.gpop'); await pg.fill('.gpop [data-mn]', '100'); await pg.click('.gpop [data-o]'); await pg.waitForTimeout(300);
  s = await T(); ok(s.vis.length === 2 && /입고: .*≥ 100/.test(s.chips), '여러 칸 동시 조건 (브랜드 + 입고 ≥ 100) ' + JSON.stringify(s.vis) + s.chips);
  await pg.click('#tg .gchip[data-ck="1"]'); await pg.waitForTimeout(300); s = await T(); ok(s.vis.length === 5 - 1 && !/브랜드:/.test(s.chips), '칩 ✕ → 그 조건만 해제 (' + s.vis.length + ')');
  await pg.click('#t1 th .gdd[data-gci="1"]'); await pg.waitForSelector('.gpop'); await pg.fill('.gpop [data-fs]', 'MA'); await pg.click('.gpop [data-a="found"]'); await pg.fill('.gpop [data-fs]', ''); await pg.click('.gpop [data-a="inv"]'); await pg.click('.gpop [data-o]'); await pg.waitForTimeout(300);
  s = await T(); ok(s.vis.length === 2 && s.vis.every((v) => /599F7WL001|412F3TO902/.test(v)), '찾은 것만 선택 → 반대로 ' + JSON.stringify(s.vis));
  await pg.click('#tg [data-call]'); await pg.waitForTimeout(300); s = await T(); ok(s.vis.length === 5 && !s.chips, '거르기 모두 지우기');
  await pg.click('#t1 th .gdd[data-gci="1"]'); await pg.waitForSelector('.gpop'); await pg.click('.gpop [data-a="none"]'); await pg.click('.gpop [data-o]'); await pg.waitForTimeout(400);
  ok(!!(await pg.$('.gpop')), '하나도 안 고르면 적용 안 됨 (창 그대로)'); await pg.keyboard.press('Escape');
  // 표 설정 필터도 같은 고르기
  await pg.click('#tg [data-set]'); await pg.waitForSelector('.modal [data-f="2"]'); await pg.click('.modal [data-f="2"]'); await pg.waitForTimeout(300);
  ok(/찾은 것만 선택/.test(await pg.textContent('.modal-bg:last-child')), '⚙ 표 설정 › 필터에도 같은 버튼'); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  await pg.screenshot({ path: SH + 'grid1.png', clip: { x: 0, y: 0, width: 1440, height: 700 } });
  // 실제 화면 표 (조회 화면: No · 합계 위)
  await pg.goto(URL + '#/settings?k=style'); await pg.waitForSelector('[data-g]', { timeout: 15000 }); await pg.waitForTimeout(500);
  ok(await pg.evaluate(() => [...document.querySelectorAll('#body table')].some((t) => t.rows[0] && t.rows[0].cells[0].textContent.trim() === 'No')), '실제 화면 표에도 No (품번 규칙)');
  // ---------- 3. 로케이션 없음 기준 ----------
  await csUp(pg, async () => { await pg.goto(URL + '#/csdash'); await pg.waitForTimeout(1000); await pg.click('#csup'); }, ['nl_wms.xlsx']);
  await pg.goto(URL + '#/cs?k=wms&t=정상창고'); await pg.waitForTimeout(1500); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  let t = await pg.textContent('#body');
  ok(/로케이션 없음 기준/.test(t) && /로케이션 없음 SKU/.test(t) && /로케이션 없음 수량/.test(t) && /로케이션 없음 비율/.test(t) && /반품창고 제외/.test(t), '정상창고: 기준 표시 · SKU · 수량 · 비율 칸');
  const fr = async () => pg.evaluate(() => { const t = [...document.querySelectorAll('#body table')].find((x) => /로케이션 없음 SKU/.test(x.rows[0].textContent)); const th = [...t.rows[0].cells].map((c) => c.textContent.trim()); const r = [...t.rows].find((x) => /FANTOM|팬텀/.test(x.textContent) && !x.classList.contains('gsum')); const g = (l) => r.cells[th.indexOf(l)].textContent.trim(); return [g('로케이션 없음 SKU'), g('로케이션 없음 수량'), g('로케이션 없음 비율')]; });
  let v = await fr(); ok(v[0] === '1' && v[1] === '5' && v[2] === '4.5%', '빈칸만 셈 · 재고 0 · 반품창고 빼고 (1 SKU · 5 · 4.5%) ' + JSON.stringify(v));
  await pg.waitForTimeout(1500); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  await pg.click('#nlset'); await pg.waitForSelector('#nli'); await pg.fill('#nli', 'Te mp'); await pg.click('#nla'); await pg.fill('#nlp', '3'); await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(1200);
  const nr = await pg.evaluate(async () => ((await HS.db.list('erp_settings', { eq: { key: 'noloc_rule' } }))[0] || {}).value);
  ok(nr && nr.codes[0] === 'TEMP' && nr.pct === 3, '기준 설정 저장 ' + JSON.stringify(nr));
  await csUp(pg, async () => { await pg.goto(URL + '#/csdash'); await pg.waitForTimeout(1000); await pg.click('#csup'); }, ['nl_wms.xlsx']);
  await pg.goto(URL + '#/cs?k=wms&t=정상창고'); await pg.waitForTimeout(1500); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  v = await fr(); ok(v[0] === '2' && v[1] === '12', 'TEMP 위치도 로케이션 없음으로 (2 SKU · 12) ' + JSON.stringify(v));
  ok(await pg.evaluate(() => { const t = [...document.querySelectorAll('#body table')].find((x) => /로케이션 없음 비율/.test(x.rows[0].textContent)); return [...t.querySelectorAll('td.neg')].some((c) => /%$/.test(c.textContent)); }), '비율 3% 넘으면 빨강');
  t = await pg.textContent('#body'); ok(/TEMP/.test(t), '기준 줄에 TEMP 표시');
  await pg.screenshot({ path: SH + 'grid2_noloc.png', fullPage: true });
  await pg.goto(URL + '#/cs?k=wms&t=반품창고'); await pg.waitForTimeout(1500); t = await pg.textContent('#body');
  ok(!/로케이션 없음/.test(t), '반품창고: 로케이션 없음 칸 · 카드 없음');
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close();
})();
