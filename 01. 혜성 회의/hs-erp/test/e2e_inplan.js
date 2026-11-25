// 2026-11-24 — 입고팀 › 금주 · 차주 상품 입고 계획 (본사 '금주차주 입고스케줄' 양식)
//  시험 파일은 실제 파일 모양을 그대로 흉내낸다:
//   · 머리글이 둘째 줄 · 날짜는 머리글 바로 아래 줄의 요일 칸 · 브랜드는 묶인 칸(첫 줄에만)
//   · 브랜드 소계 2줄(위=ST개수 아래=수량) · 맨 아래 총계 2줄(STYLE 칸에 ST 개수)
//   · 의류는 엑셀 일련번호 날짜 · 용품은 글자 날짜로 두 가지를 다 본다
const { chromium } = require('playwright'); const XLSX = require('xlsx');
const URL = 'http://localhost:' + (process.env.PORT || process.argv[2] || 8766) + '/';
const TMP = require('os').tmpdir();
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const p2 = (n) => String(n).padStart(2, '0');
const iso = (d) => d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
const addU = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const monU = (s) => addU(s, -((new Date(s + 'T00:00:00Z').getUTCDay() + 6) % 7));
const ser = (s) => Math.round((Date.parse(s + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 864e5);
const md = (s) => +s.slice(5, 7) + '/' + +s.slice(8, 10);
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(900);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));

  const today = await pg.evaluate(() => HS.today());
  const C = monU(today), N = addU(C, 7);           // 금주 월요일 · 차주 월요일
  const cD = [0, 1, 2, 3, 4].map((i) => addU(C, i));
  const nD = [0, 1, 2, 3, 4].map((i) => addU(N, i));

  // 화면이 그려지도록 신상품 자료를 조금 넣는다
  await pg.evaluate(async () => {
    const s = HS.curSeason();
    await HS.db.upsert('erp_np_style', [{ season: s, style: 'IPSEED1', brand: HS.brandOf('PING') || '핑', plan_date: HS.today(), in_qty: 10, out_qty: 0, stock: 10, st_in: '입고', st_out: '미출고', st_clean: '정리', flags: [] }]);
    await HS.db.upsert('erp_settings', [{ key: 'np_update', value: { [s]: { at: new Date().toISOString(), by: '점검' } } }]);
  });
  await pg.waitForTimeout(600);

  // ---------- 시험 파일 만들기 ----------
  const HEAD = ['브랜드', '순번', '입고전개시기', 'STYLE', '업체', '전개시기', '월', '화', '수', '목', '금', '입고구분', '시즌'];
  const dayRow = (ds, asSer) => ['', '', '', '', '', ''].concat(ds.map((d) => (asSer ? ser(d) : d))).concat(['', '']);
  const r = (brand, no, sty, qs, kind, se) => [brand, no, '', sty, '업체', '', qs[0] || '', qs[1] || '', qs[2] || '', qs[3] || '', qs[4] || '', kind || '', se || ''];
  const subQ = (qs) => ['', '', '', '', '', ''].concat(qs.map((q) => q || 0)).concat([qs.reduce((a, x) => a + (x || 0), 0), '']);
  const subN = (ns) => ['', ns.reduce((a, x) => a + (x || 0), 0), '', '', '', ''].concat(ns.map((n) => n || 0)).concat([ns.reduce((a, x) => a + (x || 0), 0), '']);

  const f = TMP + '/inplan_real.xlsx';
  const wb = XLSX.utils.book_new();
  // 의류 금주 — 핑 2줄(월 600 · 화 1,200) · 링스 1줄(수 500) · 소계 · 총계
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['크리스 전브랜드 금주 입고'], HEAD, dayRow(cD, true),
    r('핑', 1, '111F3JP801-2', [600], '2차수 GY', 3),
    r('', 2, '111G2PS201', [0, 1200], '', 2),
    subN([1, 1, 0, 0, 0]), subQ([600, 1200, 0, 0, 0]),
    r('링스', 1, 'L11G2TO001', [0, 0, 500], '', 1),
    subN([0, 0, 1, 0, 0]), subQ([0, 0, 500, 0, 0]),
    ['총계', '', '', 3, '', '', 1, 1, 1, 0, 0, 3, ''],
    subQ([600, 1200, 500, 0, 0]),
  ]), '의류입고스케줄(금주)');
  // 의류 차주 — 핑 1줄(화 4,900) · 파리게이츠 2줄(월 1,250 · 금 600)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['크리스 전브랜드 차주 입고'], HEAD, dayRow(nD, true),
    r('핑', 1, '111G1PT001', [0, 4900], '', 1),
    subN([0, 1, 0, 0, 0]), subQ([0, 4900, 0, 0, 0]),
    r('파리게이츠', 1, '511G2TO401', [1250], '', 2),
    r('', 2, '521G1TI205', [0, 0, 0, 0, 600], '', 2),
    subN([1, 0, 0, 0, 1]), subQ([1250, 0, 0, 0, 600]),
    ['총계', '', '', 3, '', '', 1, 1, 0, 0, 1, 3, ''],
    subQ([1250, 4900, 0, 0, 600]),
  ]), '의류입고스케줄(차주)');
  // 용품 금주 — 핑 1줄(목 200) · 날짜를 글자로 적은 파일도 읽는지
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['크리스 전브랜드 용품 금주'], HEAD.slice(0, 12), dayRow(cD, false).slice(0, 12),
    r('핑', 1, '121F3BG155-2', [0, 0, 0, 200], '26FW리오더').slice(0, 12),
    subN([0, 0, 0, 1, 0]).slice(0, 12), subQ([0, 0, 0, 200, 0]).slice(0, 12),
    ['총계', '', '', 1, '', '', 0, 0, 0, 1, 0, 1],
  ]), '용품입고스케줄(금주)');
  // 용품 차주 — 파리게이츠 1줄(수 1,250)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['크리스 전브랜드 용품 차주'], HEAD.slice(0, 12), dayRow(nD, false).slice(0, 12),
    r('파리게이츠', 1, '521G2SD102', [0, 0, 1250], '').slice(0, 12),
    ['총계', '', '', 1, '', '', 0, 0, 1, 0, 0, 1],
  ]), '용품입고스케줄(차주)');
  XLSX.writeFile(wb, f);

  // ---------- 화면 ----------
  await pg.goto(URL + '#/newprod'); await pg.waitForSelector('.ipb', { timeout: 25000 }); await pg.waitForTimeout(1200);
  ok(/금주 · 차주 상품 입고 계획/.test(await pg.textContent('#body')), '① ② 아래에 [금주 · 차주 상품 입고 계획] 칸');
  const segs = await pg.$$eval('#ips .seg button', (x) => x.map((e) => e.textContent.trim()));
  ok(segs.join('|') === '금주|차주|같이 보기', '① 보기 고르기 3개 · ' + segs.join(' '));

  // ---------- 올리기 ----------
  await pg.setInputFiles('#ipt input[type=file]', f); await pg.waitForSelector('.modal', { timeout: 10000 });
  const m = flat(await pg.textContent('.modal'));
  ok(/시트 4개를 읽었습니다/.test(m), '② 시트 4개를 다 읽음 · ' + m.slice(0, 60));
  ok(/의류입고스케줄\(금주\).*2,300장/.test(m), '② 의류 금주 2,300장 (소계 · 총계 줄을 안 더함)');
  ok(/의류입고스케줄\(차주\).*6,750장/.test(m), '② 의류 차주 6,750장');
  ok(/용품입고스케줄\(금주\).*200장/.test(m), '② 용품 금주 200장 (날짜를 글자로 적은 시트)');
  ok(/용품입고스케줄\(차주\).*1,250장/.test(m), '② 용품 차주 1,250장');
  ok(new RegExp(md(cD[0]) + ' ~ ' + md(cD[4])).test(m), '② 금주 기간 ' + md(cD[0]) + ' ~ ' + md(cD[4]));
  ok(/단가 · 금액 칸은 읽지 않습니다/.test(m), '② 단가 · 금액은 읽지 않는다고 적힘');
  await pg.click('.modal button:has-text("올리기")'); await pg.waitForTimeout(2500);

  // ---------- 저장된 자료 ----------
  const raw = await pg.evaluate(() => HS.db.list('erp_np_raw', { eq: { kind: 'inplan' } }).then((r) => r[0]));
  ok(raw && raw.rows.length === 8, '③ 품번 줄만 8줄 저장 (소계 · 총계 줄은 안 들어감 · ' + (raw ? raw.rows.length : 0) + ')');
  ok(raw && raw.rows.every((x) => x.sty && /[A-Z]/.test(x.sty)), '③ 품번이 아닌 숫자 줄은 안 들어감');
  ok(raw && raw.rows.every((x) => !('price' in x) && !('amt' in x)), '③ 단가 · 금액 칸은 저장 안 됨');
  const cw = raw.rows.filter((x) => x.w === 'cur'), nw = raw.rows.filter((x) => x.w === 'next');
  ok(cw.length === 4 && nw.length === 4, '③ 금주 4줄 · 차주 4줄 (' + cw.length + ' / ' + nw.length + ')');
  ok(cw.reduce((a, x) => a + x.qty, 0) === 2500 && nw.reduce((a, x) => a + x.qty, 0) === 8000, '③ 금주 2,500장 · 차주 8,000장');
  const pingMon = raw.rows.find((x) => x.sty === '111F3JP801-2');
  ok(pingMon && pingMon.d === cD[0] && pingMon.qty === 600, '③ 수량이 든 요일 칸의 날짜로 들어감 (' + (pingMon ? pingMon.d : '없음') + ' = ' + cD[0] + ')');
  const carry = raw.rows.find((x) => x.sty === '111G2PS201');
  ok(carry && carry.b === (await pg.evaluate(() => HS.brandOf('핑') || '핑')), '③ 브랜드가 빈 줄은 윗줄 브랜드를 이어받음');
  const gk = raw.rows.find((x) => x.sty === '121F3BG155-2');
  ok(gk && gk.g === '용품', '③ 시트 이름으로 의류 · 용품을 가림');

  // ---------- 요약칸 ----------
  const bd = flat(await pg.textContent('.ipb'));
  ok(/금주 입고 계획\s*2,500/.test(bd), '④ 요약칸 금주 2,500장');
  ok(/차주 입고 계획\s*8,000/.test(bd), '④ 요약칸 차주 8,000장');
  ok(/금주 ST\s*4/.test(bd) && /차주 ST\s*4/.test(bd), '④ 요약칸 ST 4 · 4');
  ok(/▲ 5,500/.test(bd), '④ 차주 ↔ 금주 ▲ 5,500');

  // ---------- 표 ----------
  const tbl = async (i) => pg.$$eval('.ipb table', (ts, k) => [...(ts[k] || { rows: [] }).rows].map((r) => [...r.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim())), i);
  const t0 = await tbl(0);
  ok(t0.length > 2 && /금주/.test((t0[0] || []).join(' ')), '⑤ 첫 표는 금주 · ' + (t0[0] || []).join(' ').slice(0, 40));
  const hd = (t0[1] || []).join('|');
  ok(hd.indexOf(md(cD[0])) >= 0 && hd.indexOf(md(cD[4])) >= 0, '⑤ 머리글에 월~금 날짜 (' + hd + ')');
  const brRow = (t, re) => t.find((row) => re.test(row[0] || ''));
  const ping = brRow(t0, /PING/);
  ok(ping && ping[1] === '의류' && ping[2] === '2' && ping[ping.length - 1] === '1,800', '⑤ 핑 의류 ST 2 · 합계 1,800 (' + JSON.stringify(ping) + ')');
  // 소계 줄은 브랜드 · 구분 칸을 한 칸으로 합치므로(colspan) ST 가 둘째 칸이다
  const sub = t0.find((row) => /소계/.test(row[0] || ''));
  ok(sub && sub[1] === '3' && sub[sub.length - 1] === '2,000', '⑤ 핑 소계 (의류+용품) ST 3 · 2,000 (' + JSON.stringify(sub) + ')');
  const tot = t0.find((row) => /^합계$/.test(row[0] || ''));
  ok(tot && tot[tot.length - 1] === '2,500', '⑤ 금주 합계 2,500');
  // 브랜드 차례 = 기준정보 순번 (핑 1번 · 링스 7번)
  const order = t0.filter((row) => /^(의류|용품)$/.test(row[1] || '')).map((row) => row[0]).filter(Boolean);
  ok(/PING/.test(order[0] || '') && /LYNX/.test(order[order.length - 1] || ''), '⑤ 브랜드 차례는 기준정보 순번 (' + order.join(' · ') + ')');
  // 차주 표 — 금주 대비 칸
  const t1 = await tbl(1);
  ok(t1.length > 2 && /차주/.test((t1[0] || []).join(' ')), '⑥ 둘째 표는 차주');
  ok((t1[0] || []).join('|').indexOf('금주 대비') >= 0, '⑥ 차주 표에만 [금주 대비] 칸');
  const tot1 = t1.find((row) => /^합계$/.test(row[0] || ''));
  ok(tot1 && /8,000/.test(tot1.join(' ')) && /5,500/.test(tot1.join(' ')), '⑥ 차주 합계 8,000 · 금주 대비 ▲ 5,500');

  // ---------- 보기 고르기 ----------
  await pg.click('#ips .seg button:has-text("차주")'); await pg.waitForTimeout(800);
  ok((await pg.$$('.ipb table')).length === 1, '⑦ [차주] 를 누르면 표 하나만');
  ok(/차주/.test(flat(await pg.textContent('.ipb table'))), '⑦ 그 표가 차주 표');
  await pg.click('#ips .seg button:has-text("금주")'); await pg.waitForTimeout(800);
  const one = flat(await pg.textContent('.ipb table'));
  ok((await pg.$$('.ipb table')).length === 1 && /2,500/.test(one), '⑦ [금주] 를 누르면 금주 표만');
  await pg.click('#ips .seg button:has-text("같이 보기")'); await pg.waitForTimeout(800);
  ok((await pg.$$('.ipb table')).length === 2, '⑦ [같이 보기] 면 표 두 개');

  // ---------- 다시 올려도 안 쌓임 ----------
  await pg.setInputFiles('#ipt input[type=file]', f); await pg.waitForSelector('.modal', { timeout: 10000 });
  await pg.click('.modal button:has-text("올리기")'); await pg.waitForTimeout(2500);
  const raw2 = await pg.evaluate(() => HS.db.list('erp_np_raw', { eq: { kind: 'inplan' } }).then((r) => r[0]));
  ok(raw2 && raw2.rows.length === 8, '⑧ 같은 파일을 두 번 올려도 8줄 (' + (raw2 ? raw2.rows.length : 0) + ')');

  // ---------- 엉뚱한 파일 ----------
  const bad = TMP + '/inplan_bad.xlsx';
  { const w2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w2, XLSX.utils.aoa_to_sheet([['가', '나'], [1, 2]]), 'Sheet1'); XLSX.writeFile(w2, bad); }
  await pg.setInputFiles('#ipt input[type=file]', bad); await pg.waitForTimeout(1500);
  ok(/입고스케줄 시트를 찾지 못했습니다/.test(flat(await pg.textContent('#toasts'))), '⑨ 엉뚱한 파일은 왜 안 되는지 알려 줌');

  // ⑨ 에서 일부러 엉뚱한 파일을 올렸으므로 그 오류는 빼고 본다
  const real = errs.filter((e) => !/입고스케줄 시트를 찾지 못했습니다/.test(e));
  console.log(real.length ? 'FAIL page errors:\n' + real.join('\n') : 'no page errors');
  if (real.length) process.exitCode = 1;
  await b.close();
})();
