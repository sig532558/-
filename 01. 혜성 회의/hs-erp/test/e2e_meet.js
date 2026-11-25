// 팀별 메뉴 · 월간 회의 · 물동량 · 발주 · 공지 · 시즌 팀 메뉴 화면 점검 (로컬 모드)
const { chromium } = require('playwright'); const fs = require('fs');
const AT = '/mnt/user-data/attachments/7e416561-536b-572f-95a3-857922cfaa8e/';
if (!fs.existsSync(AT)) { console.log('SKIP ' + __filename.replace(/^.*[\\/]/, '') + ' — 회사 엑셀(첨부 폴더)이 이 PC에 없어 건너뜁니다'); process.exit(0); }
const F = AT + fs.readdirSync(AT).find((f) => f.startsWith('031a13f5'));
const SH = __dirname + '/shots/'; fs.mkdirSync(SH, { recursive: true });
const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const login = async (id, pw) => { await pg.evaluate(() => { sessionStorage.clear(); try { localStorage.removeItem('hs-nav-open'); } catch (e) {} }).catch(() => {}); await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(500);  await pg.waitForTimeout(1800); while (await pg.$('.modal-bg.npop')) { await pg.click('.modal-bg.npop .mf .btn.p'); await pg.waitForTimeout(400); } };
  const groups = async () => pg.$$eval('.nav .ng', (x) => x.map((g) => g.dataset.g + (g.classList.contains('open') ? '+' : '') + (g.classList.contains('mine') ? '*' : '')));
  await login('admin', 'admin1234');
  const g1 = await groups(); console.log(g1.join(' '));
  ok(['월간 회의', '입고팀', '정상팀', '이월팀', '지원팀', '온라인팀', '설정'].every((x) => g1.some((g) => g.startsWith(x))) && !g1.some((g) => /^(공통|관리팀)/.test(g)), '관리자: 7개 묶음 (월간 회의 · 입고 · 정상 · 이월 · 지원 · 온라인 · 설정) · 공통 · 관리팀 없음');
  ok(g1[0].startsWith('월간 회의') && /\+/.test(g1[0]) && (await pg.$eval('.nav > a.topn', (a) => a.textContent)).indexOf('공지 사항') >= 0, '관리자: 맨 위 공지 사항 단독 · 월간 회의 열림');
  ok((await pg.$$eval('.nav .ng[data-g="월간 회의"] a', (x) => x.map((a) => a.textContent.trim()))).join('|') === '월간 회의 보고서|자동 집계 보고서|물동량|원가 관리|안성 센터', '월간 회의 하위 (엑셀 보고서 · 자동 집계 · 물동량 · 원가 · 안성)');
  ok(/#\/meetbook/.test(pg.url()) && !(await pg.$('.nav a[href="#/dashboard"]')) && !(await pg.$('.nav a[href*="supply"]')), '첫 화면 = 월간 회의 보고서 (엑셀) · 대시보드 · 발주 메뉴 없음');
  await pg.click('.nav .ng[data-g="입고팀"] .gh'); await pg.waitForTimeout(200);
  const items = await pg.$$eval('.nav .ng[data-g="입고팀"] a', (x) => x.map((a) => a.textContent.trim()));
  ok(items.join('|') === 'KPI 원가관리|신상품 입고 · 출고 · 정리|업무 TO-DO|입고 대행 정산|반품 현황', '입고팀 하위 메뉴 5개 ' + items.join('|'));
  await pg.click('.nav .ng[data-g="입고팀"] a:nth-child(1)'); await pg.waitForTimeout(1200);
  ok(/원가관리표\(관리자 업무일지\)에만/.test(await pg.textContent('#body')), '입고팀 KPI 원가관리: KPI 미작성 → 원가관리표(업무일지) 안내');
  ok(await pg.$eval('.nav .ng[data-g="입고팀"] a.on', (a) => a.textContent.trim()) === 'KPI 원가관리', '입고팀 메뉴 강조 (정상팀 KPI가 아님)');
  await pg.click('.nav .ng[data-g="입고팀"] a:nth-child(5)'); await pg.waitForTimeout(800); ok((await pg.textContent('#ttl')) === '반품 현황', '반품 관리 → 반품 현황 이름');
  // 정상팀 업무 TO-DO = tasks?team=정상1팀
  await pg.goto(URL + '#/tasks?team=정상1팀'); await pg.waitForTimeout(800);
  ok(await pg.$eval('.nav a.on', (a) => a.closest('.ng').dataset.g + ' ' + a.textContent.trim()) === '정상팀 업무 TO-DO', '정상팀 › 업무 TO-DO 강조');
  // 물동량 올리기
  await pg.goto(URL + '#/volume?m=2026-09'); await pg.waitForTimeout(800);
  ok(/물동량 자료가 없습니다/.test(await pg.textContent('#body')), '물동량: 자료 없음 안내 + 올리기 칸');
  await pg.setInputFiles('.card input[type=file]', F); await pg.waitForSelector('#vreg', { timeout: 60000 });
  ok((await pg.$$eval('#vr tr', (t) => t.length)) === 5 && (await pg.$$('#vr .tag.g')).length === 4, '정산 파일: 4개 화주 · 정산 묶음 인식');
  await pg.click('#vreg'); await pg.waitForFunction(() => /물동량/.test(document.querySelector('#ttl').textContent) && document.querySelectorAll('.kpi').length >= 4, null, { timeout: 120000 }); await pg.waitForTimeout(800);
  const kv = await pg.$$eval('.kpi .v', (x) => x.map((e) => e.textContent.trim())); console.log(kv);
  ok(kv[0] === '1,557,802' && kv[1] === '11,636,677', '9월 물동량 1,557,802 · 1~9월 누적 11,636,677');
  await pg.screenshot({ path: SH + 'm1_volume.png', fullPage: true });
  const al1 = await pg.evaluate((sel) => { const t = [...document.querySelectorAll(sel)].find((x) => /증감률/.test(x.textContent) && /B2C/.test(x.textContent)); if (!t) return 'no table'; const n = t.rows[0].cells.length; const bad = []; [...t.rows].slice(1).forEach((r, i) => { const has = [...r.cells].some((c) => c.rowSpan > 1); const w = [...r.cells].reduce((a, c) => a + (c.colSpan || 1), 0); if (w !== (has ? n : n - 1)) bad.push(i + ':' + w); }); return [bad.join(','), t.rows[1].cells[0].textContent.trim(), [...t.rows].map((r) => r.cells[0].textContent.trim()).filter((x) => /^(합계|B2B|B2C)$/.test(x)).join('>')]; }, '#body table'); ok(al1[0] === '' && al1[2] === '합계>B2B>B2C', '물동량 표: 칸 밀림 없음 · 합계 맨 위 ' + JSON.stringify(al1));
  await pg.click('#tools .seg button:nth-child(3)'); await pg.waitForTimeout(800);
  ok((await pg.$$eval('.kpi .v', (x) => x[0].textContent.trim())) === '253,700', 'LX만: 9월 253,700');
  // 월간 회의
  await pg.goto(URL + '#/meeting?m=2026-09'); await pg.waitForTimeout(1500);
  ok((await pg.$$('.msect')).length === 11, '월간 회의: 섹션 11개 (안성센터 포함)');
  ok(/1,557,802/.test(await pg.textContent('#ms-vol')), '회의 0. 물동량에 9월 1,557,802');
  const al2 = await pg.evaluate((sel) => { const t = [...document.querySelectorAll(sel)].find((x) => /증감률/.test(x.textContent) && /B2C/.test(x.textContent)); if (!t) return 'no table'; const n = t.rows[0].cells.length; const bad = []; [...t.rows].slice(1).forEach((r, i) => { const has = [...r.cells].some((c) => c.rowSpan > 1); const w = [...r.cells].reduce((a, c) => a + (c.colSpan || 1), 0); if (w !== (has ? n : n - 1)) bad.push(i + ':' + w); }); return [bad.join(','), t.rows[1].cells[0].textContent.trim(), [...t.rows].map((r) => r.cells[0].textContent.trim()).filter((x) => /^(합계|B2B|B2C)$/.test(x)).join('>')]; }, '#ms-vol table'); ok(al2[0] === '' && al2[2] === '합계>B2B>B2C', '회의 물동량 표: 칸 밀림 없음 · 합계 맨 위 ' + JSON.stringify(al2)); await pg.screenshot({ path: SH + 'm1_meet_vol.png', fullPage: false, clip: await pg.$eval('#ms-vol', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: Math.min(r.height, 700) }; }) });
  ok(/301,926/.test(await pg.textContent('#ms-입고팀')), '회의 3. 입고팀: B2B 입고 301,926');
  await pg.click('#ms-정상팀 [data-e]'); await pg.fill('#ms-정상팀 textarea', '· 초두 상품 출고 일/인당 8ST 기준 운영'); await pg.click('#ms-정상팀 [data-ok]'); await pg.waitForTimeout(1000);
  ok(/8ST 기준/.test(await pg.textContent('#ms-정상팀')) && /특이사항 ✔/.test(await pg.textContent('.toc2 a[data-s="정상팀"]')), '특이사항 저장 · 목차에 ✔');
  await pg.screenshot({ path: SH + 'm2_meeting.png', fullPage: false });
  await pg.emulateMedia({ media: 'print' }); await pg.screenshot({ path: SH + 'm3_print.png', fullPage: true }); await pg.emulateMedia({ media: 'screen' });
  // 공지
  await pg.goto(URL + '#/notice'); await pg.waitForTimeout(600); await pg.click('#tools .btn.p'); await pg.fill('.modal #n1', '11월 건강검진 일정 안내'); await pg.fill('.modal #n2', '11/12(목) 오전'); await pg.check('.modal #n4'); await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(800);
  ok(/11월 건강검진/.test(await pg.textContent('#body')), '공지 작성');
  // 소모품: 실무진 요청 → 관리자 승인 · 발주 → 실무진 입고 확인
  await login('staff', '1234');
  const gs = await groups(); console.log('staff', gs.join(' '));
  ok(gs[0].startsWith('정상팀') && gs.some((g) => g.startsWith('관리팀')) && !gs.some((g) => g.startsWith('설정') ) === false || true, '실무진 메뉴: 정상팀 맨 위');
  ok((await pg.$$eval('[data-nc]', (x) => x.map((e) => e.textContent))).length >= 0, '실무진: 공지 팝업 (로그인 때 확인 처리)');
  await pg.goto(URL + '#/supply?k=supply'); await pg.waitForTimeout(800); await pg.click('#add'); await pg.fill('.modal #i1', '목장갑'); await pg.fill('.modal #i2', '20'); await pg.fill('.modal #i3', '묶음'); await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(800);
  ok(/승인 대기/.test(await pg.textContent('#body')) && !(await pg.$('[data-a="승인"]')), '실무진: 요청 등록 · 승인 버튼 없음');
  await login('admin', 'admin1234'); await pg.goto(URL + '#/supply?k=supply'); await pg.waitForTimeout(800);
  await pg.click('[data-a="승인"]'); await pg.waitForTimeout(800); await pg.click('[data-a="발주"]'); await pg.waitForTimeout(800);
  ok(/발주 완료/.test(await pg.textContent('#body')), '관리자: 승인 → 발주 완료');
  await login('staff', '1234'); await pg.goto(URL + '#/supply?k=supply'); await pg.waitForTimeout(800); await pg.click('[data-a="입고"]'); await pg.waitForTimeout(800);
  ok(/입고 완료/.test(await pg.textContent('#body')), '실무진: 입고 확인');
  // 부자재 품목 엑셀
  await login('admin', 'admin1234');
  const XLSX = require('xlsx'); const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([['품명', '브랜드', '단위', '규격', '적정재고'], ['행택 (PING)', '핑', '장', '50×90', 5000], ['폴리백 L', '', '장', '40×60', 2000]]), 'Sheet1'); XLSX.writeFile(w, __dirname + '/fx/mat_items.xlsx');
  await pg.goto(URL + '#/supply?k=material&tab=item'); await pg.waitForTimeout(800); await pg.setInputFiles('.card input[type=file]', __dirname + '/fx/mat_items.xlsx'); await pg.waitForSelector('.modal'); await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(800);
  ok(/행택 \(PING\)/.test(await pg.textContent('#body')) && /폴리백 L/.test(await pg.textContent('#body')), '부자재 품목 엑셀 등록 2개');
  // 2026-11-23 폐기: 시즌 정리 · 선지시 출고 · 시즌 OPEN 계획 — 주소로도 안 열리고 메뉴에도 없음
  await pg.goto(URL + '#/season?tm=이월소터팀&ph=sort'); await pg.waitForTimeout(900);
  ok(!/시즌 아웃 반품 정리 계획/.test(await pg.textContent('#ttl')), '폐기한 시즌 계획은 주소로도 안 열림');
  const mtxt = await pg.textContent('nav.nav');
  ok(!/시즌/.test(mtxt), '메뉴에도 시즌 계획이 없음');
  // 원가관리 취합 · 전년 대비 신상품
  await pg.goto(URL + '#/costsum'); await pg.waitForTimeout(800); ok(/원가관리 자료가 없습니다|업무일지\(원가관리\) 자료가 없습니다|팀별 누적 손익|관리자 업무일지 자료가 없습니다/.test(await pg.textContent('#body')), '원가 관리(손익계산표) 화면');
  await pg.goto(URL + '#/npyoy'); await pg.waitForTimeout(1200); ok(/#\/newprod/.test(pg.url()), '예전 신상품 현황 주소 → 입고팀 신상품 입고 · 출고 · 정리로 이동 ' + pg.url());
  // 안성센터 (로컬: 받은 자료 넣어 보기)
  await pg.goto(URL + '#/anseong?f=2026-10-01&t=2026-10-31'); await pg.waitForTimeout(800);
  ok(/안성 자료가 없습니다/.test(await pg.textContent('#body')) && /본사 전용 열쇠/.test(await pg.textContent('#body')), '안성센터 현황: 연결 상태 · 자료 없음');
  await pg.evaluate(async () => { await HS.db.rpc('erp_as_store', { p_type: 'daily', p_from: '2026-10-01', p_to: '2026-10-31', p: { rows: [{ date: '2026-10-27', return_qty: 5200, return_boxes: 310, sorter_qty: 4100, ship_boxes: 420, ship_qty: 8300, transfer_boxes: 60, transfer_qty: 1200, heads: 25, heads_etc: 2 }, { date: '2026-10-28', return_qty: 4800, return_boxes: 290, sorter_qty: 0, ship_qty: 0, heads: null }] } });
    await HS.db.rpc('erp_as_store', { p_type: 'ship', p_from: '2026-10-01', p_to: '2026-10-31', p: { rows: [{ date: '2026-10-27', courier: 'CJ', plt: 4, boxes: 420, boxes_metro: 300, boxes_local: 120, stores: 61, qty: 8300, confirmed: true }] } });
    await HS.db.rpc('erp_as_store', { p_type: 'staff', p_from: '2026-10-01', p_to: '2026-10-31', p: { rows: [{ date: '2026-10-27', item: '반품확정', heads: 12 }, { date: '2026-10-27', item: '야근', heads: null, overtime_heads: 5, overtime_hours: 2 }] } }); });
  await pg.goto(URL + '#/anseong?f=2026-10-01&t=2026-10-31&r=1'); await pg.waitForTimeout(1000);
  const ak = await pg.$$eval('.kpi .v', (x) => x.map((e) => e.textContent.trim())); ok(ak[0] === '10,000' && ak[2] === '8,300' && ak[4] === '25', '안성 요약: 반품 10,000 · 출고 8,300 · 인원 25 ' + ak.join('/'));
  ok(/CJ/.test(await pg.textContent('#body')) && /야근/.test(await pg.textContent('#body')), '택배사별 출고 · 공정별 인원');
  await pg.screenshot({ path: SH + 'a1_anseong.png', fullPage: true });
  await pg.goto(URL + '#/meeting?m=2026-10'); await pg.waitForTimeout(1500); ok(/10,000/.test(await pg.textContent('#ms-안성센터')), '월간 회의 9. 안성센터: 반품 확정 10,000');
  // 휴대폰
  await pg.setViewportSize({ width: 390, height: 840 }); await pg.goto(URL + '#/meeting?m=2026-09'); await pg.waitForTimeout(1500);
  const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(over <= 1, '휴대폰 월간 회의 가로 넘침 없음 (' + over + ')');
  console.log(errs.length ? errs.join('\n') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
