// 2026-11-24 — 이월팀 시즌반품정리현황(iwret) · 선지시출고현황(iwout)
//  단독판을 사이트로 옮긴 것. 메뉴 · 품번 규칙 · 엑셀 다섯 양식 · 일정 표 · 권한을 본다.
const { chromium } = require('playwright'); const XLSX = require('xlsx');
const URL = 'http://localhost:' + (process.env.PORT || process.argv[2] || 8766) + '/';
const TMP = require('os').tmpdir();
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const mk = (file, aoa, sheet) => { const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet(aoa), sheet || 'Sheet1'); XLSX.writeFile(w, file); return file; };
const flat = (s) => String(s || '').replace(/\s+/g, ' ');

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
  // 메뉴 링크를 눌러야 해서 세로 메뉴로 (가로 메뉴에서는 하위 링크가 숨어 있음)
  await ctx.addInitScript(() => { try { localStorage.setItem('hs-nav-h', 'v'); } catch (e) { /* 무시 */ } });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(900);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));

  // ================= ① 메뉴 · 화면 =================
  const nav = flat(await pg.textContent('nav.nav'));
  ok(/시즌반품정리현황/.test(nav), '① 메뉴에 [시즌반품정리현황]');
  ok(/선지시출고현황/.test(nav), '① 메뉴에 [선지시출고현황]');
  ok(await pg.evaluate(() => HS.LAZY.iwret === 'js/views-iwol.js' && HS.LAZY.iwout === 'js/views-iwol.js'), '① 두 화면이 한 파일을 같이 씀');
  ok(await pg.evaluate(() => HS.RETIRED.indexOf('iwol') < 0 && HS.RETIRED.indexOf('iwret') < 0), '① 폐기 목록에 들어가지 않음');

  await pg.goto(URL + '#/iwout'); await pg.waitForSelector('#body .iwdrop, #body .card', { timeout: 20000 }); await pg.waitForTimeout(600);
  ok(/선지시출고현황/.test(await pg.textContent('#ttl')), '① 선지시출고현황이 열림');
  const segs = await pg.$$eval('#tools .seg button', (x) => x.map((e) => e.textContent.trim()));
  ok(segs.join('|') === '① 배분지시|② 출고 작업 현황|③ 출고 일정', '① 선지시 탭 3개 · ' + segs.join(' '));
  await pg.goto(URL + '#/iwret'); await pg.waitForSelector('#body .iwdrop, #body .card', { timeout: 20000 }); await pg.waitForTimeout(600);
  const segs2 = await pg.$$eval('#tools .seg button', (x) => x.map((e) => e.textContent.trim()));
  ok(segs2.join('|') === '④ 시즌 반품 정리|⑤ 시즌 정리 일정', '① 시즌반품정리 탭 2개 · ' + segs2.join(' '));

  // ================= ② 배분지시 — 취합본 (단가 · 금액 칸이 있어도 안 읽음) =================
  const fOrd = mk(TMP + '/iw_ord.xlsx', [
    ['품번', '전체지시', '온라인지시', '배분잔량', '출고합계', '단가', '금액'],
    ['5AAF1T001', 1000, 200, 100, 50, 1500, 1500000],
    ['5AAF1J001', 500, 0, 0, 0, 9900, 4950000],
    ['4AAE1S001', 300, 100, 0, 0, 1200, 360000],
    ['1AAF2JO01', 200, 0, 0, 0, 800, 160000],
    ['합계', 2000, 300, 100, 50, '', ''],
  ]);
  await pg.goto(URL + '#/iwout?k=ord'); await pg.waitForSelector('#body .iwdrop', { timeout: 20000 }); await pg.waitForTimeout(400);
  await pg.setInputFiles('#body .iwdrop input[type=file]', fOrd); await pg.waitForSelector('.modal', { timeout: 10000 });
  const m1 = flat(await pg.textContent('.modal'));
  ok(/품번 4개/.test(m1) && /전체 2,000장/.test(m1), '② 미리보기 · 품번 4개 · 2,000장 · ' + m1.slice(0, 60));
  ok(/출고수량 [\d,]+장은 날짜가 없어 안 넣습니다/.test(m1), '② 출고합계 칸은 날짜가 없어 안 넣는다고 알려 줌');
  await pg.click('.modal button:has-text("등록")'); await pg.waitForTimeout(1800);
  const ordRows = await pg.evaluate(() => HS.db.list('erp_iw_ord', {}));
  ok(ordRows.length === 4, '② DB 에 품번 4줄 (' + ordRows.length + ')');
  const noMoney = ordRows.every((r) => Object.keys(r).every((k) => !/price|amount|단가|금액/i.test(k)));
  ok(noMoney, '② 단가 · 금액은 DB 어디에도 안 들어감');
  const one = ordRows.find((r) => r.style === '5AAF1T001');
  ok(one && one.brand === '파리' && one.season === 'F1' && one.grp === '이너' && one.store === 700 && one.online === 200 && one.rest === 100,
    '② 품번에서 브랜드 · 시즌 · 복종을 뽑고 매장지시 = 전체 − 온라인 − 잔량 (' + (one ? one.brand + ' ' + one.season + ' ' + one.grp + ' ' + one.store : '없음') + ')');
  const jo = ordRows.find((r) => r.style === '1AAF2JO01');
  ok(jo && jo.cls === 'TS' && jo.grp === '이너', '② 핑 JO(원피스)는 TS · 이너로 봄 (' + (jo ? jo.cls : '없음') + ')');
  const tb = flat(await pg.textContent('#body'));
  ok(/합계/.test(tb) && /2,000/.test(tb), '② 화면 합계 2,000장');

  // ================= ③ 배분 원본(매장이 가로로 펼쳐진 WMS 판매분 확정등록) =================
  const fWide = mk(TMP + '/iw_wide.xlsx', [
    ['', '', '', '', '', '0101 강남점', '0102 분당점', '0143 온라인쇼핑-출고용', '0161 배분잔량'],
    ['품번', '색상', '사이즈', '위치정보', '총수량', '0101', '0102', '0143', '0161'],
    ['8AAD1X001', 'BK', '95', 'A-1', 140, 60, 40, 30, 10],
  ]);
  await pg.setInputFiles('#body .iwdrop input[type=file]', fWide); await pg.waitForSelector('.modal', { timeout: 10000 });
  ok(/가로로 펼쳐진/.test(flat(await pg.textContent('.modal'))), '③ 원본 배분 파일(가로 펼침)로 알아봄');
  await pg.click('.modal button:has-text("등록")'); await pg.waitForTimeout(1500);
  const acc = await pg.evaluate(() => HS.db.list('erp_iw_ord', { eq: { style: '8AAD1X001' } }).then((r) => r[0]));
  ok(acc && acc.store === 100 && acc.online === 30 && acc.rest === 10 && acc.grp === 'ACC',
    '③ 윗줄 매장 이름으로 매장 · 온라인 · 잔량을 가름 (' + (acc ? acc.store + '/' + acc.online + '/' + acc.rest + ' ' + acc.grp : '없음') + ')');

  // ================= ④ 출고 실적 — 등록일자 기준 · 두 번 올려도 안 쌓임 =================
  const shRows = [
    ['기본항목', '', '', '', '', '', '', '', '', '', ''],
    ['브랜드', '출고일자', '매장코드', '매장명', '출고구분', '바코드', '품번', '색상', '사이즈', '출고수량', '등록일자'],
    ['파리', '2027-06-26', '0101', '강남점', '판매', 'B1', '5AAF1T001', 'BK', '095', 300, '2026-11-20'],
    ['파리', '2027-06-26', '0102', '분당점', '판매', 'B2', '5AAF1T001', 'BK', '095', 200, '2026-11-20'],
    ['파리', '2027-06-26', '0143', '온라인쇼핑-출고용', '판매', 'B3', '5AAF1T001', 'WH', '100', 100, '2026-11-21'],
    ['바니', '2027-06-26', '0101', '강남점', '판매', 'B4', '4AAE1S001', 'BK', '095', 150, '2026-11-21'],
  ];
  const fShp = mk(TMP + '/iw_shp.xlsx', shRows);
  await pg.goto(URL + '#/iwout?k=shp'); await pg.waitForSelector('#body .iwdrop', { timeout: 20000 }); await pg.waitForTimeout(400);
  await pg.setInputFiles('#body .iwdrop input[type=file]', fShp); await pg.waitForSelector('.modal', { timeout: 10000 });
  const m2 = flat(await pg.textContent('.modal'));
  ok(/날짜 기준 등록일자/.test(m2), '④ 날짜는 등록일자를 먼저 씀 · ' + m2.slice(0, 60));
  ok(/2026-11-20 ~ 2026-11-21/.test(m2), '④ 출고일자(2027-06-26)가 아니라 등록일자 기간');
  await pg.click('.modal button:has-text("등록")'); await pg.waitForTimeout(1800);
  let shp = await pg.evaluate(() => HS.db.list('erp_iw_shp', {}));
  ok(shp.length === 4 && shp.reduce((s, r) => s + r.qty, 0) === 750, '④ 출고 4줄 · 750장 (' + shp.length + '줄 ' + shp.reduce((s, r) => s + r.qty, 0) + '장)');
  // 같은 파일을 한 번 더
  await pg.setInputFiles('#body .iwdrop input[type=file]', fShp); await pg.waitForSelector('.modal', { timeout: 10000 });
  await pg.click('.modal button:has-text("등록")'); await pg.waitForTimeout(1800);
  shp = await pg.evaluate(() => HS.db.list('erp_iw_shp', {}));
  ok(shp.length === 4 && shp.reduce((s, r) => s + r.qty, 0) === 750, '④ 두 번 올려도 안 쌓임 (' + shp.length + '줄 ' + shp.reduce((s, r) => s + r.qty, 0) + '장)');
  const onl = shp.filter((r) => r.kind === 'online').reduce((s, r) => s + r.qty, 0);
  ok(onl === 100, '④ 매장명에 온라인이 들어가면 온라인출고 (' + onl + ')');
  const sTxt = flat(await pg.textContent('#body'));
  ok(/지시 대비 출고/.test(sTxt) && /750/.test(sTxt), '④ 지시 대비 출고 표에 750장');

  // ================= ⑤ 출고 일정 =================
  await pg.goto(URL + '#/iwout?k=sch'); await pg.waitForSelector('#body table.iwsched', { timeout: 20000 }); await pg.waitForTimeout(700);
  const h1 = await pg.$$eval('#body table.iwsched thead tr:last-child th.st', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).slice(0, 3));
  ok(h1[0] === '복종', '⑤ 출고 일정 기본 묶음 차례는 복종 먼저 (' + h1.join(' ') + ')');
  const sch = flat(await pg.textContent('#body'));
  ok(/런닝타임/.test(sch) && /끝나는 날/.test(sch), '⑤ 런닝타임 · 끝나는 날 칸');
  ok(/TOTAL/.test(sch) && /소계/.test(sch), '⑤ TOTAL · 소계 줄');
  ok(/일별 생산량 · 인원 · 생산성/.test(sch), '⑤ 생산성 표');
  ok((await pg.$$('#body table.iwsched tr.bd')).length === 3, '⑤ 일정 띠 3줄이 머리글 위');
  // 거르기 — 복종 JK 만
  await pg.click('#body .iwflt [data-g="JK"]'); await pg.waitForTimeout(700);
  const only = await pg.$$eval('#body table.iwsched:not(.prd) td.gc', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(only.length && only.every((v) => v === 'JK'), '⑤ 거르기 · JK 만 남음 (' + only.join(',') + ')');
  await pg.click('#body .iwflt [data-clr]'); await pg.waitForTimeout(700);
  ok((await pg.$$eval('#body table.iwsched:not(.prd) td.gc', (x) => x.length)) > 1, '⑤ 거르기 지우면 다시 전체');

  // ================= ⑥ 시즌 반품 정리 — 재고현황 · 재고실사현황 =================
  const fInv = mk(TMP + '/iw_inv.xlsx', [
    ['품번', '색상', '사이즈', '현재고'],
    ['5AAF1T001', 'BK', '095', 1000],
    ['5AAF1J001', 'BK', '095', 400],
    ['8AAD1X001', 'BK', '095', 200],
  ], 'WMS 재고');
  const fCnt = mk(TMP + '/iw_cnt.xlsx', [
    ['기본항목정보', '', '', '', '', '', '', '', '', '기타정보', '', ''],
    ['브랜드', '실사일자', '기획년도', '시즌', '아이템군', '바코드', '품번', '색상', '사이즈', '실사수량', '사용자명', '입력일자'],
    ['파리', '2026-12-05', '2026', 'F', '이너', 'C1', '5AAF1T001', 'BK', '095', 300, '홍길동', '2026-11-20'],
    ['파리', '2026-12-05', '2026', 'F', '이너', 'C1', '5AAF1T001', 'BK', '095', 200, '홍길동', '2026-11-21'],
    ['핑', '2026-12-21', '2026', 'F', '이너', 'C2', '1AAF2JO01', 'BK', '095', 120, '홍길동', '2026-11-21'],
    ['', '', '', '', '', '', '', '', '', 620, '', ''],
  ]);
  await pg.goto(URL + '#/iwret?k=srt'); await pg.waitForSelector('#body .iwdrop', { timeout: 20000 }); await pg.waitForTimeout(400);
  await pg.locator('#body .iwdrop').nth(0).locator('input[type=file]').setInputFiles(fInv); await pg.waitForSelector('.modal', { timeout: 10000 });
  ok(/정리 대상 1,600장/.test(flat(await pg.textContent('.modal'))), '⑥ 재고현황 · 정리 대상 1,600장');
  await pg.click('.modal button:has-text("등록")'); await pg.waitForTimeout(1800);
  await pg.locator('#body .iwdrop').nth(1).locator('input[type=file]').setInputFiles(fCnt); await pg.waitForSelector('.modal', { timeout: 10000 });
  const m3 = flat(await pg.textContent('.modal'));
  ok(/정리 완료 620장/.test(m3), '⑥ 재고실사 · 정리 완료 620장 (합계줄은 품번이 비어 저절로 빠짐)');
  ok(/날짜 기준 입력일자/.test(m3), '⑥ 날짜는 입력일자 (실사일자가 아님)');
  await pg.click('.modal button:has-text("등록")'); await pg.waitForTimeout(1800);
  const srt = flat(await pg.textContent('#body'));
  ok(/정리 대상 1,600장/.test(srt) || /1,600/.test(srt), '⑥ 요약칸 정리 대상 1,600장');
  ok(/38\.8%/.test(srt), '⑥ 진행률 38.8% (620 ÷ 1,600)');
  ok(/기준에 없는 정리 실적 120장/.test(srt), '⑥ 기준에 없는 정리 실적 120장을 빨간 칸으로');
  const cnt = await pg.evaluate(() => HS.db.list('erp_iw_cnt', {}));
  ok(cnt.length === 3, '⑥ 열쇠 = 품번 · 색상 · 사이즈 · 날짜 → 3줄 (' + cnt.length + ')');

  // ================= ⑦ 시즌 정리 일정 =================
  await pg.goto(URL + '#/iwret?k=ssc'); await pg.waitForSelector('#body table.iwsched', { timeout: 20000 }); await pg.waitForTimeout(700);
  const h2 = await pg.$$eval('#body table.iwsched thead tr:last-child th.st', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).slice(0, 3));
  ok(h2[0] === '브랜드', '⑦ 정리 일정 기본 묶음 차례는 브랜드 먼저 (' + h2.join(' ') + ')');
  const sc2 = flat(await pg.textContent('#body'));
  ok(/정리 대상/.test(sc2) && /남은 수량/.test(sc2) && /진행률/.test(sc2), '⑦ 칸 = 정리대상 · 정리완료 · 남은수량 · 진행률');
  // 줄마다 시작일 고치기
  const dt = await pg.$('#body table.iwsched input.iwdt');
  ok(!!dt, '⑦ 줄마다 시작일을 손으로 고치는 칸');
  if (dt) {
    await dt.fill('2026-12-07'); await dt.dispatchEvent('change'); await pg.waitForTimeout(1200);
    const sst = await pg.evaluate(() => HS.db.list('erp_iw_sst', {}));
    ok(sst.length >= 1 && String(sst[0].start_date).slice(0, 10) === '2026-12-07', '⑦ 고친 시작일이 DB 에 저장됨');
    const man = await pg.$$eval('#body table.iwsched input.iwdt.man', (x) => x.length);
    ok(man >= 1, '⑦ 손으로 고친 줄은 노란 칸으로 표시');
  }
  // 일정 띠 더하기
  await pg.fill('#body [data-bx2]', '시험 띠'); await pg.click('#body [data-ba]'); await pg.waitForTimeout(1500);
  ok(/시험 띠/.test(await pg.textContent('#body table.iwsched')), '⑦ 일정 띠 더하기');
  const band = await pg.evaluate(() => HS.db.list('erp_iw_band', {}));
  ok(band.length === 1, '⑦ 띠가 DB 에 1줄 (' + band.length + ')');

  // ================= ⑨ 운영 기간 · 마감 확정 · 안 끝난 것 넘기기 (2026-11-25) =================
  const T0 = await pg.evaluate(() => { const d = new Date(); return d.getFullYear() + (d.getMonth() + 1 <= 6 ? 'H1' : 'H2'); });
  const T1 = T0.slice(-2) === 'H1' ? T0.slice(0, 4) + 'H2' : String(+T0.slice(0, 4) + 1) + 'H1';
  const lab = (t) => t.slice(0, 4) + (t.slice(-2) === 'H1' ? ' 상반기' : ' 하반기');
  await pg.goto(URL + '#/iwout?k=ord'); await pg.waitForSelector('#body .iwdrop', { timeout: 20000 }); await pg.waitForTimeout(500);
  const opt = await pg.$$eval('#tools select option', (x) => x.map((o) => o.textContent.trim()));
  ok(opt.some((o) => o.indexOf(lab(T0)) === 0), '⑨ 운영 기간 고르는 칸 · 지금 기간 ' + lab(T0) + ' (' + opt.join(' / ') + ')');
  const rows0 = await pg.evaluate(() => HS.db.list('erp_iw_ord', {}));
  ok(rows0.length && rows0.every((r) => r.term), '⑨ 올린 자료에 운영 기간이 붙어 있음');
  ok(!!(await pg.$('#tools button:has-text("마감 확정")')), '⑨ [마감 확정] 단추');
  await pg.click('#tools button:has-text("마감 확정")'); await pg.waitForSelector('.modal', { timeout: 10000 }); await pg.waitForTimeout(400);
  const mc = flat(await pg.textContent('.modal'));
  ok(new RegExp(lab(T1)).test(mc), '⑨ 다음 기간(' + lab(T1) + ') 으로 넘긴다고 보여 줌');
  // 지시 − 출고: 5AAF1T001 (700·200·100 − 500·100·0)=400 · 5AAF1J001 500 · 4AAE1S001 (200·100 − 150)=150 · 1AAF2JO01 200 · 8AAD1X001 140
  const tr = await pg.$$eval('.modal table tbody tr', (x) => x.map((r) => [...r.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim())));
  ok(tr[0] && tr[0][1] === '5' && tr[0][2] === '1,390장', '⑨ 배분지시 남은 것 5품번 · 1,390장 (' + JSON.stringify(tr[0]) + ')');
  // 대상 − 완료: 5AAF1T001 1,000−500=500 · 5AAF1J001 400 · 8AAD1X001 200
  ok(tr[1] && tr[1][1] === '3' && tr[1][2] === '1,100장', '⑨ 정리 기준 남은 것 3품번 · 1,100장 (' + JSON.stringify(tr[1]) + ')');
  await pg.click('.modal button:has-text("마감하고 넘기기")'); await pg.waitForTimeout(2500);
  const st9 = await pg.evaluate(async ([a, b]) => ({
    term: (await HS.db.list('erp_iw_term', {})).find((x) => x.term === a) || null,
    nord: await HS.db.list('erp_iw_ord', { eq: { term: b } }),
    ninv: await HS.db.list('erp_iw_inv', { eq: { term: b } }),
    oshp: (await HS.db.list('erp_iw_shp', { eq: { term: a } })).length,
    nshp: (await HS.db.list('erp_iw_shp', { eq: { term: b } })).length,
    hash: location.hash,
  }), [T0, T1]);
  ok(st9.term && st9.term.closed === true, '⑨ 지금 기간이 마감됨');
  ok(st9.nord.length === 5 && st9.nord.reduce((s, r) => s + r.store + r.online + r.rest, 0) === 1390, '⑨ 다음 기간에 배분지시 5품번 · 1,390장이 생김');
  const c1 = st9.nord.find((r) => r.style === '5AAF1T001');
  ok(c1 && c1.store === 200 && c1.online === 100 && c1.rest === 100, '⑨ 매장 · 온라인 · 잔량을 따로 빼서 넘김 (5AAF1T001 = 200 · 100 · 100)');
  ok(st9.ninv.length === 3 && st9.ninv.reduce((s, r) => s + r.qty, 0) === 1100, '⑨ 다음 기간에 정리 기준 3품번 · 1,100장이 생김');
  ok(st9.oshp === 4 && st9.nshp === 0, '⑨ 출고 실적은 지난 기간에 그대로 남고 안 넘어감');
  ok(/term=/.test(st9.hash) && st9.hash.indexOf(T1) >= 0, '⑨ 마감하면 다음 기간 화면으로 넘어감');
  // 마감한 기간을 다시 열면 보기만
  await pg.goto(URL + '#/iwout?k=ord&term=' + T0); await pg.waitForSelector('#body .card', { timeout: 20000 }); await pg.waitForTimeout(800);
  const lk = flat(await pg.textContent('#body'));
  ok(/마감되었습니다/.test(lk) && /보기만 됩니다/.test(lk), '⑨ 마감한 기간은 잠김 안내');
  ok((await pg.$$('#body .iwdrop')).length === 0, '⑨ 마감한 기간에는 올리는 칸이 없음');
  ok(!(await pg.$('#tools button:has-text("마감 확정")')), '⑨ 마감한 기간에는 [마감 확정] 단추가 없음');
  ok(/2,140/.test(lk), '⑨ 마감한 기간 숫자는 그대로 보임');
  const blk = await pg.evaluate((t) => HS.db.upsert('erp_iw_ord', [{ term: t, style: 'ZZ1', brand: '핑', season: 'F1', cls: 'TS', grp: '이너', store: 1 }]).then(() => '들어감').catch((e) => e.message), T0);
  ok(/마감한 기간/.test(blk), '⑨ 마감한 기간은 직접 저장해도 막힘 · ' + blk);
  const twice = await pg.evaluate((t) => HS.db.rpc('erp_iw_close', { p_term: t }).then(() => '됨').catch((e) => e.message), T0);
  ok(/이미 마감/.test(twice), '⑨ 두 번 마감 못 함');
  // 마감 해제 (관리자)
  ok(!!(await pg.$('#tools button:has-text("마감 해제")')), '⑨ 관리자에게는 [마감 해제] 단추');
  await pg.click('#tools button:has-text("마감 해제")'); await pg.waitForSelector('.modal', { timeout: 8000 });
  await pg.click('.modal button:has-text("확인")'); await pg.waitForTimeout(1800);
  ok((await pg.$$('#body .iwdrop')).length > 0, '⑨ 해제하면 다시 올릴 수 있음');

  // ================= ⑧ 권한 — 보기는 전체 · 올리기는 이월소터팀 + 관리자 =================
  await pg.evaluate(() => HS.db.logout()); await pg.waitForTimeout(500);
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'staff'); await pg.fill('#lpw', '1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(900);
  await pg.goto(URL + '#/iwout?k=ord'); await pg.waitForSelector('#body .card', { timeout: 20000 }); await pg.waitForTimeout(800);
  ok((await pg.$$('#body .iwdrop')).length === 0, '⑧ 다른 팀 실무진에게는 올리는 칸이 안 보임');
  const st8 = flat(await pg.textContent('#body'));
  ok(/이월소터팀 · 관리자만 올릴 수 있습니다/.test(st8), '⑧ 왜 못 올리는지 알려 줌');
  ok(/2,140/.test(st8), '⑧ 숫자는 그대로 보임 (보기는 전체 공개 · 취합본 2,000 + 원본 140)');
  const blocked = await pg.evaluate(() => HS.db.upsert('erp_iw_ord', [{ style: 'ZZZ', brand: '핑', season: 'F1', cls: 'TS', grp: '이너', store: 1 }]).then(() => '들어감').catch((e) => e.message));
  ok(/이월소터팀/.test(blocked), '⑧ 직접 저장해도 막힘 · ' + blocked);

  console.log(errs.length ? 'FAIL page errors:\n' + errs.join('\n') : 'no page errors');
  if (errs.length) process.exitCode = 1;
  await b.close();
})();
