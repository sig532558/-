const { chromium } = require('playwright');
const URL = 'http://localhost:' + (process.env.PORT || 8767) + '/'; const FX = __dirname + '/fx/'; const SH = __dirname + '/shots/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true }); const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body');
  await pg.goto(URL + '#/count'); await pg.waitForTimeout(800);
  ok(/등록된 실사가 없습니다/.test(await pg.textContent('#body')), '실사 목록 (비어 있음)');
  await pg.click('text=+ 새 실사'); await pg.waitForSelector('#n'); await pg.fill('#sc', '이월 창고 1~3층'); await pg.click('.modal .btn.p'); await pg.waitForTimeout(1200);
  ok(/실사 등록/.test(await pg.textContent('#body')), '새 실사 등록 → 등록 화면');
  await pg.setInputFiles('.drop input[type=file] >> nth=0', [FX + 'wms_stock.xlsx', FX + 'future.xlsx']); await pg.waitForTimeout(4000);
  let t = await pg.textContent('#body');
  ok(/재고 현황 · wms_stock.xlsx · 4,037줄/.test(t), '전산 재고 업로드 4,037줄');
  ok(/110,150/.test(t) && /13,364/.test(t) && /96,786/.test(t), '현재고 · 미래 · 누적 합계 표시');
  ok(/미래 발생분 내역: .*로스 3/.test(t), '미래 발생분 내역 표시');
  await pg.setInputFiles('.drop input[type=file] >> nth=1', [FX + 'count_floor1.xlsx', FX + 'count_floor2.xlsx']); await pg.waitForTimeout(5000);
  t = await pg.textContent('#body');
  ok(/count_floor1.xlsx/.test(t) && /1조/.test(t) && /2조/.test(t), '실사 파일 2개 · 조 자동 인식');
  ok(/1F-SP/.test(t) && /100.0%/.test(t), '구역별 진행률 표시');
  await pg.screenshot({ path: SH + 'count_1setup.png', fullPage: true });
  await pg.click('.seg button:has-text("차이 현황")'); await pg.waitForTimeout(2500);
  t = await pg.textContent('#body');
  ok(/부족 1 · 과잉 0 · 미등록 1/.test(t), '차이 SKU: 부족 1 · 미등록 1');
  ok(/로스 3/.test(t) && /로스 3 제외|로스 3개|부족 3개 설명/.test(t), '로스 차이에서 제외 표시');
  await pg.screenshot({ path: SH + 'count_2diff.png', fullPage: true });
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('text=차이 현황 엑셀 다운로드')]);
  const p = SH + 'count.xlsx'; await dl.saveAs(p); const XLSX = require('xlsx'); const wb = XLSX.readFile(p);
  ok(wb.SheetNames.join(',') === '요약,브랜드별,구역별,차이 상세,미래 발생분,재실사 목록,WMS 조정용', '엑셀 7개 시트 (' + wb.SheetNames.join(',') + ')');
  const det = XLSX.utils.sheet_to_json(wb.Sheets['차이 상세']); ok(det.length === 2, '차이 상세 2줄');
  // TO-DO 폐기: 보내기 버튼 · 체크칸 없음
  ok(!/TO-DO/.test(await pg.textContent('#body')) && !(await pg.$('input[data-k]')), 'TO-DO 보내기 버튼 · 체크칸 없음');
  // 재실사 결과
  await pg.waitForTimeout(500);
  await pg.setInputFiles('.dbtn input[type=file]', FX + 'recount_floor1.xlsx'); await pg.waitForTimeout(3500);
  t = await pg.textContent('#body'); ok(/부족 0 · 과잉 0 · 미등록 1/.test(t) && /재실사 반영 1/.test(t), '재실사 결과 반영 → 부족 0');
  // 대시보드
  await pg.click('.seg button:has-text("대시보드")'); await pg.waitForTimeout(2500);
  t = await pg.textContent('#body'); ok(/이너 \(티셔츠/.test(t) && /JK \(아우터\)/.test(t) && /년도별 정확도/.test(t) && /브랜드 · 년도 · 시즌 × 복종별/.test(t), '대시보드 복종 카드 · 피벗');
  ok(await pg.$('.pv-host table'), '피벗 표 그리기');
  await pg.screenshot({ path: SH + 'count_3dash.png', fullPage: true });
  await pg.click('.pv-host td[data-c]'); await pg.waitForTimeout(2500); ok(/차이 상세/.test(await pg.textContent('#body')), '대시보드 칸 → 차이 상세 이동');
  // 확정
  await pg.click('.cnt-tb button:has-text("확정")'); await pg.click('.modal .btn.p'); await pg.waitForTimeout(1500);
  await pg.goto(URL + '#/count'); await pg.waitForTimeout(1000); t = await pg.textContent('#body'); ok(/확정/.test(t) && /이월 창고 1~3층/.test(t), '목록에 확정 · 요약 표시');
  await pg.screenshot({ path: SH + 'count_0list.png', fullPage: true });
  // 현장 팀장: 실사 자료만 올리기
  await pg.evaluate(() => sessionStorage.clear()); await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'leader'); await pg.fill('#lpw', '1234'); await pg.click('#lgo'); await pg.waitForSelector('#body');
  await pg.goto(URL + '#/count'); await pg.waitForTimeout(800); ok(!(await pg.$('text=+ 새 실사')), '현장 팀장: 새 실사 버튼 없음');
  await pg.setViewportSize({ width: 390, height: 844 }); await pg.click('tr[data-id]'); await pg.waitForTimeout(2500);
  console.log(await pg.evaluate(() => [...document.querySelectorAll('#body *, .top *, header *')].filter((e) => e.getBoundingClientRect().right > 395 && !e.closest('#tools') && !e.closest('.tw')).slice(0, 8).map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right))));
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= 400), '휴대폰 화면 가로 넘침 없음');
  await pg.screenshot({ path: SH + 'count_m.png', fullPage: true });
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
