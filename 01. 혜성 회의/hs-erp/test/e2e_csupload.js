// 전산자료(WMS · ERP 재고) 올리기 버튼이 실제로 모달을 여는지 점검 (2026-11-13)
//  · cs_bucket 처럼 FKEYS 가 가리키는 양식 키가 HS.FMT 에서 빠지면 HS.FMT[k].t 에서 조용히 죽어
//    아무 반응 없이 버튼이 먹통이 되는 걸 e2e_formats.js(FMT 안 키만 돎)는 못 잡아서 따로 만듦
const { chromium } = require('playwright'); const PORT = process.argv[2] || 8767; const URL = 'http://localhost:' + PORT + '/';
let fail = 0; const ok = (c, t) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + t); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);

  // ① FKEYS 가 가리키는 양식 키가 전부 HS.FMT 에 실제로 있는지 (views-cs.js 와 formats.js 를 서로 맞춰 봄)
  const miss = await pg.evaluate(() => { const FK = ['cs_wms', 'cs_erp', 'cs_alloc', 'cs_bucket', 'cs_sabang']; return FK.filter((k) => !HS.FMT[k]); });
  ok(miss.length === 0, 'FKEYS 가 가리키는 양식이 전부 HS.FMT 에 있음' + (miss.length ? ' · 빠짐: ' + miss.join(',') : ''));

  // ② 여러 파일 한 번에 올리기 모달(전산자료 메인 화면)이 실제로 열리는지
  await pg.evaluate(() => (location.hash = '#/cs?k=wms')); await pg.waitForTimeout(300);
  await pg.evaluate(() => HS.route()); await pg.waitForTimeout(1500);
  const btn = await pg.$('#csup');
  if (btn) { await btn.click(); await pg.waitForTimeout(800); ok((await pg.$('.modal-bg')) !== null, '여러 파일 한 번에 올리기 버튼을 누르면 모달이 열림'); await pg.keyboard.press('Escape').catch(() => {}); await pg.click('.modal-bg .x').catch(() => {}); }
  else console.log('참고: #csup 버튼을 못 찾음 (권한 때문일 수 있음)');

  // ③ WMS 재고현황 탭의 "WMS 재고현황 엑셀 놓기" 카드를 눌러도 모달이 열리는지 (사용자가 보고한 바로 그 버튼)
  await pg.waitForTimeout(500);
  const ud = await pg.$('#ud');
  ok(!!ud, 'WMS 탭에 업로드 카드(#ud)가 있음');
  if (ud) {
    await ud.click(); await pg.waitForTimeout(1000);
    ok((await pg.$('.modal-bg')) !== null, 'WMS 업로드 카드를 누르면 모달이 열림 (사용자가 겪은 무반응 재현 · 고침 확인)');
    ok(errs.length === 0, '콘솔에 에러가 없음' + (errs.length ? ' · ' + errs[0] : ''));
    await pg.click('.modal-bg .x').catch(() => {});
  }

  // ④ ERP 재고현황 탭도 동일
  await pg.evaluate(() => (location.hash = '#/cs?k=erp')); await pg.waitForTimeout(300);
  await pg.evaluate(() => HS.route()); await pg.waitForTimeout(1500);
  const ud2 = await pg.$('#ud');
  if (ud2) { await ud2.click(); await pg.waitForTimeout(1000); ok((await pg.$('.modal-bg')) !== null, 'ERP 업로드 카드를 누르면 모달이 열림'); await pg.click('.modal-bg .x').catch(() => {}); }
  else console.log('참고: ERP 탭 #ud 카드를 못 찾음');

  console.log(errs.length ? '에러: ' + errs.join(' | ') : 'no page errors');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
