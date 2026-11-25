// 서버 1,000줄 제한 대비 — 자료가 많은 집계는 기간을 나눠 부르는지 점검 (2026-11-13)
const { chromium } = require('playwright'); const PORT = process.argv[2] || 8767; const URL = 'http://localhost:' + PORT + '/';
let fail = 0; const ok = (c, t) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + t); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1500);
  await pg.evaluate(() => { window.__rpc = []; const o = HS.db.rpc.bind(HS.db); HS.db.rpc = function (fn, a) { window.__rpc.push({ fn, a }); return o(fn, a); }; });
  // ① 손익계산표 — erp_pl_days_json 한 번에 (1,000줄 제한 없는 묶음 · 2026-11-18)
  await pg.evaluate(() => { window.__rpc = []; location.hash = '#/costsum?v=pl&y=2026'; });
  await pg.waitForTimeout(300); await pg.evaluate(() => HS.route()); await pg.waitForTimeout(3000);
  const pj = await pg.evaluate(() => window.__rpc.filter((x) => x.fn === 'erp_pl_days_json'));
  const pl = await pg.evaluate(() => window.__rpc.filter((x) => x.fn === 'erp_pl_days'));
  // 화면 한 번 그릴 때 1회인지 — 위에서 주소 바꿈 + 직접 그리기로 두 번 그리므로 그려진 횟수로 나눠 봄
  await pg.evaluate(() => { window.__rpc = []; HS.route(); }); await pg.waitForTimeout(2500);
  const pj1 = await pg.evaluate(() => window.__rpc.filter((x) => x.fn === 'erp_pl_days_json').length);
  ok(pj.length >= 1 && pl.length === 0 && pj1 === 1, '손익 자료를 한 번에 받음 (화면 한 번에 묶음 ' + pj1 + '회 · 나눠 부르기 ' + pl.length + '회)');
  ok(pj[0] && pj[0].a.p_from === '2025-12-20' && pj[0].a.p_to === '2027-01-10', '받는 기간 = 전년 12/20 ~ 다음 해 1/10 · ' + (pj[0] ? pj[0].a.p_from + '~' + pj[0].a.p_to : '-'));
  // ①-2 30번 SQL 이 아직 없는 서버면 예전처럼 달마다 나눠 부름
  await pg.evaluate(() => { window.__rpc = []; const o = HS.db.rpc; HS.db.rpc = function (fn, a) { if (fn === 'erp_pl_days_json') { window.__rpc.push({ fn, a }); return Promise.reject(new Error('function not found')); } return o(fn, a); }; location.hash = '#/costsum?v=pl&y=2025'; });
  await pg.waitForTimeout(300); await pg.evaluate(() => HS.route()); await pg.waitForTimeout(3000);
  const fb = await pg.evaluate(() => window.__rpc.filter((x) => x.fn === 'erp_pl_days'));
  const longOne = fb.find((x) => (new Date(x.a.p_to) - new Date(x.a.p_from)) / 864e5 > 40);
  ok(fb.length >= 12 && !longOne, '30번 없으면 달마다 나눠 부름 (' + fb.length + '회 · 40일 넘는 구간 없음)');
  ok(await pg.evaluate(() => !document.querySelector('#body').textContent.includes('손익 자료를 읽지 못했')), '나눠 부를 때도 표가 그려짐');
  // ② 물동량 — erp_volume_month 를 해마다 나눠 부름
  await pg.evaluate(() => { window.__rpc = []; location.hash = '#/volume?m=2026-10'; });
  await pg.waitForTimeout(300); await pg.evaluate(() => HS.route()); await pg.waitForTimeout(3000);
  const vm = await pg.evaluate(() => window.__rpc.filter((x) => x.fn === 'erp_volume_month'));
  ok(vm.length >= 2, 'erp_volume_month 를 해마다 나눠 부름 (' + vm.length + '회)');
  const twoYear = vm.find((x) => String(x.a.p_from).slice(0, 4) !== String(x.a.p_to).slice(0, 4));
  ok(!twoYear, '한 번에 두 해를 부르지 않음' + (twoYear ? ' · ' + twoYear.a.p_from + '~' + twoYear.a.p_to : ''));
  // ③ 1,000줄이 오면 알려 주는 장치가 있는지 (코드 확인)
  const hasWarn = await pg.evaluate(async () => (await (await fetch('js/db.js')).text()).indexOf('1,000줄') >= 0);
  ok(hasWarn === true, '1,000줄로 잘렸을 때 알려 주는 장치가 있음');
  console.log(errs.length ? '에러: ' + errs.join(' | ') : 'no page errors');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
