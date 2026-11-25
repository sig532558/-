// 모든 표 공통 조건 줄: 글자 칸 여러 개 고르기 · 찾기 쉼표 여러 개 · 비율 범위 · 0인 줄 숨김 · 지우기 · 기억
const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(800);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  await pg.goto(URL + '#/notice'); await pg.waitForTimeout(800);
  await pg.evaluate(() => { const B = ['PING', 'FANTOM', 'LYNX', 'MAMMUT']; const S = ['F3', 'F4']; let h = '<table><tr><th>브랜드</th><th>시즌</th><th>수량</th><th>입고률</th></tr>'; let k = 0; B.forEach((b) => S.forEach((s) => { k++; h += '<tr><td>' + b + '</td><td>' + s + '</td><td>' + (b === 'MAMMUT' && s === 'F4' ? 0 : k * 10) + '</td><td>' + (b === 'MAMMUT' ? '0.0%' : (20 + k * 9) + '.0%') + '</td></tr>'; })); h += '</table>';
    const c = HS.el('<div class="card"><h3>시험 표</h3><div class="tw">' + h + '</div></div>'); document.querySelector('#body').appendChild(c); });
  await pg.waitForSelector('.gcond', { timeout: 10000 });
  const lab = await pg.$$eval('.gcond .gcf span', (x) => x.map((e) => e.textContent)); ok(lab.join(',') === '브랜드,시즌,입고률', '조건 칸 자동: ' + lab.join(','));
  const vis = () => pg.$$eval('.card:has(h3:text("시험 표")) table tr', (t) => t.filter((r) => r.style.display !== 'none' && r.querySelector('td') && !r.classList.contains('gsum')).length);
  ok(await vis() === 8, '처음 8줄');
  await pg.click('.gcond .gcs >> nth=0'); await pg.waitForSelector('.qpop'); await pg.click('.qpop [data-none]'); await pg.click('.qpop label:has(span:text-is("PING"))'); await pg.click('.qpop label:has(span:text-is("LYNX"))'); await pg.mouse.click(5, 5); await pg.waitForTimeout(300);
  ok(await vis() === 4 && (await pg.textContent('.gcond .gcs >> nth=0')).indexOf('LYNX 외 1') === 0 || (await pg.textContent('.gcond .gcs >> nth=0')).indexOf('PING 외 1') === 0, '브랜드 2개 고르기 → 4줄 · ' + (await pg.textContent('.gcond .gcs >> nth=0')));
  await pg.click('.gcond .gcs >> nth=0'); await pg.waitForSelector('.qpop'); await pg.click('.qpop [data-none]'); await pg.waitForTimeout(200); ok(await vis() === 0 && /선택 없음/.test(await pg.textContent('.gcond .gcs >> nth=0')), '전체 해제 → 0줄 (선택 없음)'); await pg.mouse.click(5, 5);
  await pg.click('.gchip.o'); await pg.waitForTimeout(200); ok(await vis() === 8, '조건 모두 지우기');
  await pg.fill('.gq', 'fantom, mammut'); await pg.waitForTimeout(500); ok(await vis() === 4, '찾기 쉼표 여러 개 → 4줄');
  await pg.click('.gchip.o'); await pg.waitForTimeout(200);
  await pg.selectOption('.gcond select', 'lt30'); await pg.waitForTimeout(300); ok(await vis() === 3, '입고률 30% 미만만 → 3줄 (29% · MAMMUT 2줄)');
  await pg.selectOption('.gcond select', ''); await pg.click('.gcond .gzc'); await pg.waitForTimeout(300); ok(await vis() === 7, '0인 줄 숨김 → 7줄');
  await pg.click('.gchip.o'); await pg.waitForTimeout(200); ok(await vis() === 8 && !(await pg.$('.gcond .gzc.on')), '지우면 0인 줄 숨김도 꺼짐');
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close();
})();
