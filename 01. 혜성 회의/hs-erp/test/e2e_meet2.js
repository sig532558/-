// 월간 회의: 메뉴 정리 · 2. 원가 관리 손익계산표 모양 · 항목 누르면 팀 화면 이동
const { chromium } = require('playwright'); const fs = require('fs');
const AT = '/mnt/user-data/attachments/7e416561-536b-572f-95a3-857922cfaa8e/'; const file = (p) => AT + fs.readdirSync(AT).find((f) => f.startsWith(p));
const SH = __dirname + '/shots/'; const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const closeModals = (pg) => pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(800); await closeModals(pg);
  { const mn = (await pg.$$eval('.nav .ng[data-g="월간 회의"] a', (x) => x.map((a) => a.textContent.trim()))).join('|');
    ok(mn === '월간 회의 (운영 자료)|물동량|원가 관리|안성 센터', '월간 회의 메뉴 (보고서 · 자동 집계는 폐기) ' + mn); }
  // 자료 없음
  await pg.goto(URL + '#/meeting?m=2026-09'); await pg.waitForTimeout(1500);
  ok(/원가관리 자료가 없습니다/.test(await pg.textContent('#ms-cost')), '원가 자료 없을 때 안내');
  // 2026-11-10: 신상품 섹션(#ms-np)은 입고팀 ① 과 같은 내용이라 폐기 — 원가 관리는 맨 마지막(10번)
  ok(!(await pg.$('#ms-np')), '신상품 섹션 폐기 (입고팀 ① 과 겹침)');
  ok(/10\. 원가 관리 · 인력 운영/.test(await pg.textContent('#body')), '원가 관리 · 인력 운영은 맨 마지막 10번');
  // 원가관리 엑셀 올리기
  await pg.goto(URL + '#/upload'); await pg.waitForTimeout(800); await closeModals(pg);
  await pg.setInputFiles('#fi', [file('f31309b0')]); await pg.waitForSelector('#go', { timeout: 180000 });
  await pg.click('#go'); await pg.waitForSelector('#prog .lock', { timeout: 600000 }); await pg.waitForTimeout(500); await closeModals(pg);
  await pg.goto(URL + '#/meeting?m=2026-09'); await pg.waitForSelector('#plMeet .plk', { timeout: 30000 }); await pg.waitForTimeout(600);
  const kp = await pg.$$eval('#plMeet .plk b', (x) => x.map((e) => e.textContent.trim())); ok(kp.length === 3 && kp[0] !== '0', '누적 매출 · 지출 · 손익 ' + JSON.stringify(kp));
  ok(await pg.$$eval('#plMeet svg', (x) => x.length) === 2 && (await pg.$$('#plMeet .pldt')).length === 1, '월별 · 주차별 그래프 + 월별 숫자표');
  ok(!(await pg.$('#plMeet .gtb')) && !(await pg.$('#plMeet .pldt .gno')), '그래프 숫자표에 표 도구 · 순번 없음');
  const q = await pg.$eval('#plMeet #selQ', (s) => s.options[s.selectedIndex].textContent); ok(q === '삼사분기', '회의 달(9월)의 분기 → 삼사분기 ' + q);
  const cur = await pg.$eval('#plMeet .tM tr.cur', (r) => r.textContent); ok(/9월/.test(cur), '회의 달 9월 줄 강조');
  ok(/엑셀/.test(await pg.textContent('#plMeet')), '출처 표시 (엑셀)');
  const tot = await pg.$$eval('#plMeet tr', (trs) => { for (const t of trs) { const c = [...t.cells].map((e) => e.textContent.trim()); const i = c.findIndex((v) => /^\(주\)혜성물류/.test(v)); if (i >= 0) return c[i + 3]; } return null; }); ok(tot === '2,232,829,832', '(주)혜성물류 매출 = 원가 관리 화면과 같음 ' + tot);
  await pg.$eval('#ms-cost', (e) => e.scrollIntoView()); await pg.screenshot({ path: SH + 'mt1_cost.png', clip: await pg.$eval('#ms-cost', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: Math.min(r.height, 1500) }; }), fullPage: true });
  // 팀 고르기
  await pg.selectOption('#plMeet #selM', '정상1팀'); await pg.waitForTimeout(300); ok(/정상1팀/.test(await pg.textContent('#plMeet .plk')), '팀 고르면 누적 칸도 그 팀');
  // 누르면 이동
  await pg.click('#plMeet tr.click >> nth=0'); await pg.waitForTimeout(900); ok(/#\/kpi\?t=/.test(pg.url()) && /m=2026-09/.test(pg.url()), '팀 줄 → 그 팀 KPI 원가관리 (9월) ' + decodeURIComponent(pg.url()));
  await pg.goBack(); await pg.waitForSelector('#plMeet .plk', { timeout: 30000 });
  await pg.click('#ms-입고팀 tr.click >> nth=0'); await pg.waitForTimeout(900); ok(/#\/volume/.test(pg.url()), '입고팀 항목 줄 → 물동량 ' + pg.url());
  await pg.goBack(); await pg.waitForTimeout(1500);
  const h = await pg.$eval('#ms-정상팀 h3 .mgo', (a) => a.getAttribute('href')); ok(/kpi\?t=정상1팀&m=2026-09/.test(decodeURIComponent(h)), '정상팀 제목 → 팀 화면 ' + decodeURIComponent(h));
  await pg.click('#ms-정상팀 h3 .mgo'); await pg.waitForTimeout(900); ok(/kpi/.test(pg.url()), '제목 링크 이동');
  // 원가 관리 메뉴 화면도 같은 모양
  await pg.goto(URL + '#/costsum?v=pl&y=2026'); await pg.waitForSelector('.plk', { timeout: 30000 }); ok((await pg.$$('.pldark svg')).length === 2 && !!(await pg.$('#snap')), '원가 관리 메뉴: 같은 모양 + 카톡 · 엑셀 버튼');
  // 휴대폰
  await pg.setViewportSize({ width: 390, height: 800 }); await pg.waitForTimeout(400); const ov = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(ov <= 2, '휴대폰: 가로 넘침 없음 ' + ov);
  await pg.screenshot({ path: SH + 'mt2_mobile.png', fullPage: false });
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close();
})();
