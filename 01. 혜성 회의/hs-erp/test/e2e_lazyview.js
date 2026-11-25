// 첫 로딩 쪼개기 점검 (2026-11-18 · 사이트 점검 ⑤)
//  · 처음엔 HS.LAZY 화면 파일을 안 받음 · 주소로 바로 열어도 받아서 그림 · 2초 뒤 나머지를 뒤에서 받음
const { chromium } = require('playwright'); const PORT = process.argv[2] || process.env.PORT || 8766; const URL = 'http://localhost:' + PORT + '/';
let fail = 0; const ok = (c, t) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + t); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } }); const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  const got = []; pg.on('request', (r) => { const u = r.url(); if (/\/js\/.*\.js/.test(u)) got.push(u.split('/js/')[1].split('?')[0]); });
  await pg.goto(URL + '#/rclean'); await pg.waitForSelector('#lid');
  // iwret · iwout 은 한 파일(views-iwol.js)을 같이 쓰므로 파일 이름으로 묶어 센다 (2026-11-24)
  const LAZY = await pg.evaluate(() => [...new Set(Object.values(HS.LAZY).map((s) => s.replace('js/', '')))]);
  ok(LAZY.length === 7, '나중에 받는 화면 파일 7개 (' + LAZY.join(', ') + ')');
  ok(LAZY.every((f) => got.indexOf(f) < 0), '처음 열 때는 그 파일을 안 받음');
  await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);
  ok(got.indexOf('views-rclean.js') >= 0, '반품 정리 현황 주소로 바로 들어오면 그 파일을 받음');
  ok(await pg.evaluate(() => HS.cur === 'rclean' && !/불러오는 중/.test(document.querySelector('#body').textContent.slice(0, 40))), '반품 정리 현황 화면이 그려짐');
  await pg.waitForTimeout(3000);
  ok(LAZY.every((f) => got.indexOf(f) >= 0), '2초 뒤 나머지 화면 파일을 뒤에서 받아 둠');
  ok(LAZY.every((f) => got.filter((x) => x === f).length === 1), '같은 파일을 두 번 받지 않음');
  for (const [h, nm] of [['#/count', 'count'], ['#/rclean', 'rclean'], ['#/npout', 'npout'], ['#/shipout', 'shipout'], ['#/headcount', 'headcount'], ['#/iwret', 'iwret'], ['#/iwout', 'iwout'], ['#/tlmeet', 'tlmeet']]) {
    await pg.evaluate((x) => { location.hash = x; }, h); await pg.waitForTimeout(900);
    ok(await pg.evaluate((n) => HS.cur === n, nm), h + ' 열림');
  }
  console.log(errs.length ? '에러: ' + errs.join(' | ') : 'no page errors');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
