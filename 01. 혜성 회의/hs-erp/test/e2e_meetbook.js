// 월간회의: 회의 자료 엑셀 올리기 → 장별 발표 화면 (엑셀 모양 그대로) · 첫 장 핵심 숫자 · 엑셀 원본 · 발표 넘기기 · 핵심 메모
const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; const FILE = process.env.MEET || '/tmp/claude-0/-home-claude/7e416561-536b-572f-95a3-857922cfaa8e/scratchpad/real/m1109/meet.xlsx';
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(800);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  ok(await pg.title() === '혜성물류 회의자료' && /혜성물류 회의자료/.test(await pg.textContent('.logo')), '사이트 이름 혜성물류 회의자료');
  ok((await pg.$$eval('.nav .ng[data-g="월간 회의"] a', (x) => x.map((a) => a.textContent.trim()))).join('|').startsWith('월간 회의 보고서|자동 집계 보고서'), '메뉴: 월간 회의 보고서 (엑셀) 맨 위');
  await pg.goto(URL + '#/meetbook'); await pg.waitForTimeout(800); ok(/아직 올린 월간 회의 자료가 없습니다/.test(await pg.textContent('#body')), '자료 없을 때 안내');
  const t0 = Date.now(); await pg.setInputFiles('#tools input[type=file], .tools input[type=file], input[type=file][accept=".xlsx,.xlsm"]', FILE);
  await pg.waitForSelector('#mbym', { timeout: 120000 }); const readMs = Date.now() - t0;
  const mt = await pg.textContent('.modal'); ok(/2026년 11월 월간 회의/.test(mt) && /보고서\(보라색\) 7시트 · 47장/.test(mt), '읽기 (' + readMs + 'ms): ' + mt.slice(0, 80));
  ok(await pg.inputValue('#mbym') === '2026-11', '회의 달 자동 2026-11'); ok(/신상품입고현황 너무 큼\(217MB\)/.test(mt) && /인사파트\(숨긴 시트\)/.test(mt), '큰 시트 · 숨긴 시트 안내');
  await pg.screenshot({ path: SH + 'mb0_upload.png' });
  await pg.click('.modal .mf .btn.p'); await pg.waitForFunction(() => /meetbook\?m=2026-11/.test(location.hash) && document.querySelector('.mbk'), null, { timeout: 120000 }); await pg.waitForTimeout(500);
  const kp = await pg.$$eval('.mbkc', (x) => x.map((e) => e.querySelector('.l').textContent + '=' + e.querySelector('.v').textContent));
  ok(kp.join('|') === '신상품 입고율=44.9%|신상품 출고율=82.0%|전월 B2B 출고 전년 대비=-1.2%|이월 반입 예상=68,398 pcs|전월 온라인 출고 전년 대비=-22.3%|당월 손익 (천원)=9,011', '첫 장 핵심 숫자 ' + kp.join(' · '));
  await pg.screenshot({ path: SH + 'mb1_sum.png' });
  // 카드 누르면 그 장
  await pg.click('.mbkc >> nth=0'); await pg.waitForTimeout(400); ok(/신상품 입고 현황/.test(await pg.textContent('.mbtt')), '입고율 카드 → 신상품 입고 현황 장');
  // 읽기 좋은 표 (기본): 접기형 · 소계 8 · 0인 줄 숨김
  ok(await pg.$$eval('table.mst2 tr.sb', (x) => x.length) === 8 && !(await pg.$('table.mst2 tr.sub')), '읽기 좋은 표: 브랜드 소계 8줄만 (접힘)');
  ok(/0인 줄 \d+개 숨김/.test(await pg.textContent('.msi')), '0인 줄 숨김 안내 ' + (await pg.textContent('.msi')));
  const totT = await pg.$$eval('table.mst2 tr.tot td', (t) => t.map((x) => x.textContent)); ok(totT[2] === '2,207 ST' && /44\.9%/.test(totT[4]), 'TOTAL 줄 ' + totT.slice(0, 5).join('|'));
  ok(/neg/.test(await pg.$eval('table.mst2 tr.sb:has-text("MAMMUT") td:nth-child(5) b', (e) => e.className)), 'MAMMUT 입고률 22.0% 빨강 (30% 미만)');
  await pg.click('table.mst2 tr.sb:has-text("PING")'); await pg.waitForTimeout(200); ok((await pg.$$eval('table.mst2 tr.sub', (x) => x.map((r) => r.cells[1].textContent))).join(',') === 'F3,F4,F7', 'PING 누르면 시즌 펼침 (F6 0줄 숨김)');
  // 조건: 브랜드 여러 개 + 시즌 여러 개
  await pg.click('.mss >> nth=0'); await pg.waitForSelector('.qpop'); await pg.click('.qpop [data-none]');
  for (const n of ['1 (PING)', '5 (PEARLY GATES)', 'M (MAMMUT)']) await pg.click('.qpop .qpl label:has-text("' + n + '")'); await pg.keyboard.press('Escape'); await pg.mouse.click(5, 5);
  await pg.click('.mss >> nth=1'); await pg.waitForSelector('.qpop'); await pg.click('.qpop [data-none]'); for (const n of ['F3', 'F4']) await pg.click('.qpop .qpl label:has(span:text-is("' + n + '"))'); await pg.mouse.click(5, 5); await pg.waitForTimeout(300);
  const selT = await pg.$$eval('table.mst2 tr.sel td', (t) => t.map((x) => x.textContent)); ok(selT[0] === '선택 합계' && selT[2] === '765 ST' && selT[3] === '348 ST' && /45\.5%/.test(selT[4]) && /81\.9%/.test(selT[8]), '선택 합계 다시 계산 765 ST · 45.5% · 출고률 81.9% ' + selT.slice(0, 9).join('|'));
  ok(/dim/.test(await pg.$eval('table.mst2 tr.tot', (e) => e.className)), '원래 TOTAL 은 흐리게');
  ok((await pg.textContent('.mss >> nth=0')).indexOf('1 (PING) 외 2') === 0, '고른 표시: 1 (PING) 외 2');
  await pg.screenshot({ path: SH + 'mb5_filter.png' });
  await pg.click('#msc'); await pg.waitForTimeout(200); await pg.fill('#msq', 'pearly, lynx'); await pg.waitForTimeout(500);
  ok(await pg.$$eval('table.mst2 tr.sb', (x) => x.length) === 2, '찾기: 쉼표로 여러 개 (PEARLY, LYNX)');
  await pg.click('#msc'); await pg.waitForTimeout(200); await pg.selectOption('[data-r] >> nth=0', 'lt30'); await pg.waitForTimeout(300);
  const lowB = await pg.$$eval('table.mst2 tr.sb', (x) => x.map((r) => r.cells[0].textContent)); ok(lowB.length >= 3 && lowB.every((t) => /PING|FANTOM|PEARLY|MASTER|ST ANDREWS|HYDROGEN|MAMMUT|LYNX/.test(t)), '입고률 30% 미만만 → 해당 시즌이 있는 브랜드 ' + lowB.length);
  await pg.reload(); await pg.waitForSelector('table.mst2'); await pg.waitForTimeout(300); ok(/30% 미만/.test(await pg.textContent('.msi')), '고른 조건 기억');
  await pg.click('#msc'); await pg.waitForTimeout(200);
  // 엑셀 모양으로 바꿔 보기
  await pg.click('#mode'); await pg.waitForSelector('table.mbt'); 
  const cell = await pg.$$eval('table.mbt td', (t) => { const i = t.findIndex((x) => x.textContent === 'TOTAL'); return i >= 0 ? [t[i + 2].textContent, t[i + 2].getAttribute('style'), t[i + 4].textContent] : null; });
  ok(cell && cell[0] === '2,207 ST' && /background:#0D0D0D/.test(cell[1]) && /color:#FFFFFF/.test(cell[1]) && cell[2] === '44.9%', '엑셀 모양 그대로: TOTAL 줄 검정 바탕 · 흰 글자 · 2,207 ST · 44.9% ' + JSON.stringify(cell));
  const hdr = await pg.$$eval('table.mbt td', (t) => { const x = t.find((e) => e.textContent === 'S/T'); return x && x.getAttribute('style'); }); ok(/background:#FECCF3/.test(hdr || ''), 'S/T 제목 칸 분홍 (엑셀 색) ' + hdr);
  const sub = await pg.$$eval('table.mbt td', (t) => { const x = t.find((e) => e.textContent === '소계'); return x && x.getAttribute('style'); }); ok(/background:#385724/.test(sub || ''), '소계 줄 진초록');
  ok(await pg.$$eval('table.mbt td[rowspan]', (x) => x.length) > 5, '브랜드 칸 병합 (rowspan)');
  await pg.screenshot({ path: SH + 'mb2_slide.png', fullPage: false });
  // 키보드 넘기기
  await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(300); ok(/월간 입고 현황/.test(await pg.textContent('.mbtt')), '→ 다음 장 (2) 월간 입고 현황)');
  await pg.keyboard.press('ArrowLeft'); await pg.waitForTimeout(300); ok(/신상품 입고 현황/.test(await pg.textContent('.mbtt')), '← 이전 장');
  ok(/&s=1/.test(pg.url()), '주소에 장 번호 (새로 고쳐도 그 장) ' + pg.url());
  await pg.reload(); await pg.waitForSelector('.mbtt'); await pg.waitForTimeout(500); ok(/신상품 입고 현황/.test(await pg.textContent('.mbtt')), '새로 고침해도 같은 장');
  // 원가관리 장: 천원 단위
  await pg.click('.mbn .mbi.sub:has-text("2) 당월")'); await pg.waitForTimeout(400);
  const wg = await pg.$$eval('table.mbt td', (t) => { const i = t.findIndex((x) => x.textContent === 'TOTAL'); return i >= 0 ? [t[i + 1].textContent, t[i + 4].textContent] : null; }); ok(wg && wg[0] === '107,512' && wg[1] === '9,011', '원가관리 천원 단위 그대로 ' + JSON.stringify(wg));
  // 핵심 3줄
  await pg.click('.mbne'); await pg.fill('.modal textarea', '당월 손익 +9,011천원\n정상팀 적자 확인'); await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(800);
  ok(/정상팀 적자 확인/.test(await pg.textContent('.mbnote')), '장 핵심 메모 저장 · 표시');
  await pg.reload(); await pg.waitForSelector('.mbtt'); await pg.waitForTimeout(500); ok(/정상팀 적자 확인/.test(await pg.textContent('.mbnote')), '메모 다시 열어도 있음');
  // 엑셀 원본
  await pg.click('#src'); await pg.waitForSelector('.mbxt span'); await pg.waitForTimeout(500);
  const tabs = await pg.$$eval('.mbxt span', (x) => x.map((e) => e.textContent)); ok(tabs.length === 20 && tabs[0] === '입고반품팀', '엑셀 원본: 시트 탭 ' + tabs.length + '개');
  ok(/원가관리/.test(await pg.textContent('.mbxt span.on')), '지금 장의 시트가 열림');
  await pg.click('.mbxt span:has-text("신상품입고현황")'); await pg.waitForTimeout(400); ok(/너무 커서/.test(await pg.textContent('.mbxw')), '큰 시트 → 엑셀에서 보기 안내');
  await pg.click('.mbxt span:has-text("출고데이터")'); await pg.waitForSelector('.mbxw table.mbt', { timeout: 15000 }); ok(/앞부분만/.test(await pg.textContent('#xinfo')), '근거 시트 앞부분 (300줄)');
  const tanga = await pg.evaluate(async () => { const all = await HS.db.list('erp_meet_book', { eq: { ym: '2026-11', kind: 'data' } }); return all.filter((r) => JSON.stringify(r.body).indexOf('단가') >= 0).map((r) => r.name); }); ok(tanga.length === 0, '근거 데이터에 단가 칸 없음 ' + JSON.stringify(tanga));
  await pg.check('#only'); await pg.waitForTimeout(300); const t2 = await pg.$$eval('.mbxt span', (x) => x.map((e) => e.textContent)); ok(t2.length === 7, '대표님 모드 = 보라색 7시트만 ' + t2.join(','));
  await pg.screenshot({ path: SH + 'mb3_src.png' }); await pg.click('.modal .mf .btn'); await pg.waitForTimeout(300);
  // 왼쪽 근거 데이터 목록
  await pg.click('.mbn .mbi.data:has-text("입고대행")'); await pg.waitForSelector('.mbxw table.mbt', { timeout: 15000 }); ok(/입고대행/.test(await pg.textContent('.mbxt span.on')), '왼쪽 근거 데이터 → 원본 창'); await pg.click('.modal .mf .btn');
  // 같은 달 다시 올리면 바꿈
  const n0 = await pg.evaluate(async () => (await HS.db.list('erp_meet_book', { eq: { ym: '2026-11' } })).length);
  await pg.setInputFiles('input[type=file][accept=".xlsx,.xlsm"]', FILE); await pg.waitForSelector('#mbym', { timeout: 120000 }); await pg.click('.modal .mf .btn.p'); await pg.waitForFunction(() => document.querySelector('.mbk'), null, { timeout: 120000 }); await pg.waitForTimeout(500);
  const n1 = await pg.evaluate(async () => (await HS.db.list('erp_meet_book', { eq: { ym: '2026-11' } })).length); ok(n0 === n1 && n0 === 20, '다시 올려도 같은 달 바꿈 (중복 없음) ' + n0 + '→' + n1);
  // 휴대폰
  await pg.setViewportSize({ width: 390, height: 800 }); await pg.waitForTimeout(400); const ov = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(ov <= 2, '휴대폰 가로 넘침 없음 ' + ov);
  await pg.screenshot({ path: SH + 'mb4_mobile.png' });
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close();
})();
