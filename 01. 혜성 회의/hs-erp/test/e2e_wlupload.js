// 원가관리 업무일지 엑셀을 실제로 올려 월별 손익계산표에 모든 달이 나오는지 본다
// 쓰는 법: node test\e2e_wlupload.js <포트> <엑셀경로>
const { chromium } = require('playwright'); const PORT = process.argv[2] || 8767; const FILE = process.argv[3];
const URL = 'http://localhost:' + PORT + '/'; const SH = __dirname + '\\shots\\';
let fail = 0; const ok = (c, t) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + t); };
(async () => {
  if (!FILE) { console.log('엑셀 경로를 넣어 주세요'); process.exit(1); }
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 1100 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1500);
  await pg.evaluate(() => (location.hash = '#/upload')); await pg.waitForTimeout(2500);
  const fi = await pg.$('input[type=file]');
  ok(!!fi, '엑셀 일괄 등록 칸이 있음');
  if (!fi) { await b.close(); process.exit(1); }
  await fi.setInputFiles(FILE);
  await pg.waitForTimeout(12000);
  const txt1 = await pg.textContent('#body');
  console.log('고른 뒤 화면: ' + txt1.replace(/\s+/g, ' ').slice(0, 400));
  // 등록 버튼 누르기
  const btn = await pg.$('button:has-text("등록")');
  ok(!!btn, '등록 버튼이 있음');
  if (btn) { await btn.click(); await pg.waitForTimeout(25000); }
  const txt2 = await pg.textContent('#body');
  console.log('등록 뒤 화면: ' + txt2.replace(/\s+/g, ' ').slice(0, 400));
  // 등록 결과에 들어간 기간(달 범위)이 적히는지 — 달이 빠지면 바로 보이게 (2026-11-13)
  const okBox = await pg.$('.lock.ok');
  const okTxt = okBox ? await okBox.textContent() : '';
  ok(/worklog [\d,]+ \(2026-\d\d ~ 2026-\d\d · \d+개월\)/.test(okTxt), '등록 결과에 업무일지 기간이 적힘 · ' + (okTxt.match(/worklog[^·]*/) || ['없음'])[0]);
  // 월별 손익계산표 확인
  await pg.evaluate(() => (location.hash = '#/costsum?v=pl&y=2026')); await pg.waitForTimeout(300);
  await pg.evaluate(() => HS.route()); await pg.waitForTimeout(4000);
  const rows = await pg.$$eval('table tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim())));
  const mon = {};
  rows.forEach((r) => { const m = (r.find((x) => /^\d{1,2}월$/.test(x)) || ''); if (!m) return; const nums = r.filter((x) => /[\d,]{4,}/.test(x)); if (nums.length) mon[m] = nums[0]; });
  const got = Object.keys(mon);
  console.log('값이 있는 달: ' + got.join(' · '));
  ok(got.length >= 10, '최소 10개 달에 값이 있음 (' + got.length + ')');
  ['8월', '9월', '10월', '11월'].forEach((m) => ok(!!mon[m], m + ' 에 값이 있음 · ' + (mon[m] || '빈칸')));
  await pg.screenshot({ path: SH + 'wl_upload.png' });
  console.log(errs.length ? '에러: ' + errs.slice(0, 3).join(' | ') : 'no page errors');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
