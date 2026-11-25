// 반품 타택배 · 행낭 붙여넣기: 제목줄로 열 순서 맞춤 · 미리보기 오류 표시 · 정상 줄만 넣기 · 오류 줄은 저장 막기
const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/';
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(800);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  const br = await pg.evaluate(() => HS.cache.brands.filter((x) => x.active !== false).slice(0, 2).map((x) => x.name)); console.log('브랜드', br);
  await pg.goto(URL + '#/returns?k=t'); await pg.waitForSelector('#paste');
  // 타택배: 원본 시트 열 순서가 화면과 다름 (제목줄 포함) + 오류 줄
  const T = ['매장명\t날짜\t택배사\t브랜드\tBOX\t비고', '롯데 본점\t2026-11-03\t로젠\t' + br[0] + '\t3\t', '현대 판교\t11/4\tCJ\t' + br[1] + '\t1,2\t', '신세계\t2026-11-05\t한진\t없는브랜드\t2\t', '갤러리아\t어제\t로젠\t' + br[0] + '\t1\t', '\t2026-11-05\t로젠\t' + br[0] + '\t두개\t'].join('\n');
  await pg.click('#paste'); await pg.fill('#pt', T); await pg.dispatchEvent('#pt', 'input'); await pg.waitForTimeout(300);
  const info = await pg.textContent('#pv .lock'); ok(/제목줄 인식/.test(info) && /5줄/.test(info) && /정상 2/.test(info) && /오류 3/.test(info), '미리보기: ' + info.trim());
  const er = await pg.$$eval('table.pvt tr.perr td:last-child', (x) => x.map((e) => e.textContent)); console.log(er);
  ok(er.some((e) => /없는브랜드.*목록에 없음/.test(e)) && er.some((e) => /날짜 인식 불가/.test(e)) && er.some((e) => /매장명 빈칸/.test(e) && /두개.*숫자 아님/.test(e)), '오류 이유 표시 (브랜드 · 날짜 · 매장명 · Box)');
  const r2 = await pg.$$eval('table.pvt tr', (t) => [...t[2].cells].map((c) => c.textContent)); ok(r2[1] === '2026-11-04' && r2[6] === '1,2' || r2.indexOf('2026-11-04') >= 0, '11/4 → 2026-11-04 · 열 순서 자동 ' + JSON.stringify(r2));
  await pg.screenshot({ path: SH + 'rp1_preview.png' });
  await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(500);
  const rows = await pg.$$eval('.qe tbody tr', (t) => t.map((r) => r.querySelector('[data-k=store]').value + '|' + r.querySelector('[data-k=box]').value + '|' + r.querySelector('[data-k=rec_date]').value + '|' + r.querySelector('[data-k=courier]').value));
  ok(rows.length === 2 && rows[0] === '롯데 본점|3|2026-11-03|로젠' && rows[1] === '현대 판교|12|2026-11-04|CJ', '정상 줄만 들어감 (칸 맞게) ' + JSON.stringify(rows));
  // 오류 줄도 넣기 → 빨간 줄 · 저장 막힘
  await pg.click('#paste'); await pg.fill('#pt', T); await pg.dispatchEvent('#pt', 'input'); await pg.waitForTimeout(200); await pg.click('.modal .mf .btn:has-text("오류 줄도")'); await pg.waitForTimeout(400);
  ok(await pg.$$eval('.qe tbody tr.perr', (x) => x.length) === 3, '오류 줄 빨간 표시 3줄');
  await pg.click('#qs'); await pg.waitForTimeout(500); ok(/빨간 줄 3개/.test(await pg.evaluate(() => document.body.innerText)), '오류 있으면 저장 막음 (빨간 줄 3개 안내)');
  const n0 = await pg.evaluate(async () => (await HS.db.list('erp_ret_bag', { eq: { kind: '타택배' } })).length); ok(n0 === 0, '저장 안 됨 ' + n0);
  // 빨간 줄 지우고 저장
  for (let k = 0; k < 3; k++) await pg.click('.qe tbody tr.perr .click >> nth=0');
  await pg.click('#qs'); await pg.waitForTimeout(1200);
  const saved = await pg.evaluate(async () => (await HS.db.list('erp_ret_bag', { eq: { kind: '타택배' } })).map((r) => r.store + '|' + r.brand + '|' + r.box + '|' + r.rec_date)); ok(saved.length === 4 && saved.every((x) => !/null|\|0\|/.test(x)), '정상 줄 저장 (브랜드 빈칸 없음) ' + JSON.stringify(saved));
  // 행낭: 제목줄 없이 (화면 순서)
  await pg.goto(URL + '#/returns?k=h'); await pg.waitForSelector('#paste'); await pg.click('#paste');
  await pg.fill('#pt', ['2026-11-06\t' + br[0] + '\t확정\t대구점\t5\t메모', '2026-11-06\t' + br[1] + '\tY\t부산점\t0\t'].join('\n')); await pg.dispatchEvent('#pt', 'input'); await pg.waitForTimeout(200);
  const i2 = await pg.textContent('#pv .lock'); ok(/제목줄 없음/.test(i2) && /오류 1/.test(i2), '행낭 제목줄 없이 · Box 0 오류 ' + i2.trim());
  await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(300); ok((await pg.$$eval('.qe tbody tr', (t) => t.length)) === 1, '행낭 정상 1줄');
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close();
})();
