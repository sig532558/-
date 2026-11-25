// '물류재고관리_재고실사_이월배분' 식 파일(업무구분 1~6이 한 시트에 섞임)을 실사 자료로 올려도
// 업무구분 6(재고실사) 줄만 반영되고 나머지는 건너뛰는지 점검 (2026-11-16)
const { chromium } = require('playwright');
const URL = 'http://localhost:' + (process.env.PORT || 8767) + '/'; const FX = __dirname + '/fx/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body');
  // 메뉴: 정상팀엔 재고 실사가 더 이상 없고, 전산자료 하위에만 있어야 함 (2026-11-13 중복 제거)
  const nav = await pg.textContent('.side');
  ok(/전산자료[\s\S]*재고 실사/.test(nav), '전산자료 하위에 재고 실사 메뉴가 있음');
  await pg.goto(URL + '#/count'); await pg.waitForTimeout(800);
  await pg.click('text=+ 새 실사'); await pg.waitForSelector('#n'); await pg.fill('#sc', '업무구분 혼합 파일 점검'); await pg.click('.modal .btn.p'); await pg.waitForTimeout(1200);
  await pg.setInputFiles('.drop input[type=file] >> nth=0', [FX + 'wms_stock.xlsx']); await pg.waitForTimeout(3000);
  await pg.setInputFiles('.drop input[type=file] >> nth=1', [FX + 'tool6.xlsx']); await pg.waitForTimeout(3000);
  const t = await pg.textContent('#body');
  ok(/tool6\.xlsx/.test(t), '실사 자료로 올라감');
  const cells = await pg.$$eval('tr:has-text("tool6.xlsx") td', (tds) => tds.map((td) => td.textContent.trim()));
  console.log('tool6.xlsx 줄의 칸: ' + JSON.stringify(cells));
  ok(cells[3] === '3', '업무구분 6(재고실사) 줄만 3줄 반영 (1·5는 건너뜀) · ' + cells[3]);
  ok(cells[4] === '47', '반영된 수량 합계 47 (30+12+5 · 업무구분 1=9999 · 5=500 은 제외) · ' + cells[4]);
  ok(!/9999/.test(t) && !/\b500\b/.test(t), '업무구분 1(창고재고수량)·5(매장재고) 값은 화면에 안 보임');
  console.log(errs.length ? '에러: ' + errs.join(' | ') : 'no page errors');
  await b.close();
  process.exit(errs.length ? 1 : (process.exitCode || 0));
})();
