// 브랜드 차례 — 설정 › 기준정보 › 브랜드 순번 하나로 모든 화면이 같은 차례를 쓰는지
//  순번을 거꾸로 바꾼 뒤, 브랜드 줄이 있는 화면들이 따라 바뀌는지 본다
const { chromium } = require('playwright');
const URL = 'http://localhost:' + (process.env.PORT || process.argv[2] || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

// 화면의 브랜드 줄 차례 읽기 — 표 머리글에 '브랜드' 가 있는 첫 표에서 브랜드 칸만
const colOf = async (pg, must) => pg.evaluate((must) => {
  const tbs = [...document.querySelectorAll('#body table')];
  const tb = tbs.find((x) => /브랜드/.test(x.textContent) && (!must || new RegExp(must).test(x.textContent)));
  if (!tb) return null;
  const hr = [...tb.querySelectorAll('tr')].find((x) => x.querySelector('th')); if (!hr) return null;
  const i = [...hr.children].findIndex((x) => /^브랜드/.test(x.textContent.trim())); if (i < 0) return null;
  return [...tb.querySelectorAll('tr')].filter((r) => !r.querySelector('th')).map((r) => ((r.children[i] || {}).textContent || '').trim())
    .filter((x) => x && !/합계|소계|TOTAL/.test(x));
}, must || null);

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body');
  await pg.waitForTimeout(1200);

  // 기준정보의 브랜드 차례 (표시 이름으로)
  // 되돌릴 때 쓸 처음 차례 (원래 이름 순서 그대로)
  const keep = await pg.evaluate(() => HS.cache.brands.slice().sort((a, b) => (+a.sort || 0) - (+b.sort || 0)).map((x) => ({ n: x.name })));
  const base = await pg.evaluate(() => HS.cache.brands.slice().sort((a, b) => (+a.sort || 0) - (+b.sort || 0)).map((x) => HS.bname(x.name)));
  ok(base.length > 2, '기준정보 브랜드 ' + base.length + '개 · ' + base.slice(0, 4).join(' · '));

  // 공통 함수가 있는지
  const hasFn = await pg.evaluate(() => typeof HS.bsort === 'function' && typeof HS.border === 'function' && typeof HS.bcmp === 'function');
  ok(hasFn, '공통 차례 함수 (HS.border · HS.bcmp · HS.bsort)');
  // 기준정보에 없는 이름은 맨 뒤
  const tail = await pg.evaluate(() => { const l = HS.bsort(['듣보브랜드', HS.cache.brands[1].name, HS.cache.brands[0].name]); return l[l.length - 1]; });
  ok(tail === '듣보브랜드', '기준정보에 없는 이름은 맨 뒤로 (' + tail + ')');

  // 신상품 자료 넣고 ① 브랜드별 표 차례 보기
  await pg.evaluate(async () => {
    const bs = HS.cache.brands.slice().sort((a, b) => (+a.sort || 0) - (+b.sort || 0)).slice(0, 4).map((x) => x.name);
    // 뒤 브랜드일수록 수량을 크게 → 수량순으로 정렬하면 차례가 거꾸로 나온다
    const rows = bs.map((n, i) => ({ season: '2099SS', style: 'Z' + i + '9G5TR001', brand: n, scode: 'G5', item: 'TR', colors: 1, plan_qty: (i + 1) * 1000, in_qty: (i + 1) * 900, out_qty: 0, stock: 1, stock_loc: 0, plan_date: '2099-03-01', st_in: '입고', st_out: '미출고', st_clean: '정리완료', defect: 0, flags: [] }));
    await HS.db.upsert('erp_np_style', rows);
  });
  await pg.goto(URL + '#/newprod?s=2099SS'); await pg.waitForTimeout(2500);
  const np = await colOf(pg, '기획 ST');
  ok(!!np && np.length >= 3, '신상품 ① 브랜드별 표를 읽음 (' + (np || []).length + '줄)');
  const want = base.filter((x) => (np || []).indexOf(x) >= 0);
  ok(!!np && np.join('|') === want.join('|'), '신상품 ① 차례가 기준정보와 같음\n    화면 ' + (np || []).join(' · ') + '\n    기준 ' + want.join(' · '));

  // 순번을 거꾸로 바꾸면 화면도 따라 바뀌는지
  await pg.evaluate(async () => { const bs = HS.cache.brands.slice().sort((a, b) => (+a.sort || 0) - (+b.sort || 0));
    for (let i = 0; i < bs.length; i++) await HS.db.update('erp_brands', { name: bs[i].name }, { sort: bs.length - i });
    await HS.loadRefs(); });
  await pg.goto(URL + '#/'); await pg.waitForTimeout(600);
  await pg.goto(URL + '#/newprod?s=2099SS'); await pg.waitForTimeout(2500);
  const np2 = await colOf(pg, '기획 ST');
  ok(!!np2 && np2.join('|') === (np || []).slice().reverse().join('|'), '순번을 거꾸로 바꾸니 화면 차례도 거꾸로\n    ' + (np2 || []).join(' · '));

  // 되돌리기 — 처음 순번 값을 그대로 다시 넣는다
  await pg.evaluate(async (save) => { for (let i = 0; i < save.length; i++) await HS.db.update('erp_brands', { name: save[i].n }, { sort: i + 1 }); await HS.loadRefs(); }, keep);
  await pg.goto(URL + '#/'); await pg.waitForTimeout(600);
  await pg.goto(URL + '#/newprod?s=2099SS'); await pg.waitForTimeout(2500);
  const np3 = await colOf(pg, '기획 ST');
  ok(!!np3 && np3.join('|') === (np || []).join('|'), '순번을 되돌리면 차례도 되돌아옴\n    화면 ' + (np3 || []).join(' · ') + '\n    처음 ' + (np || []).join(' · '));

  // 치우기
  await pg.evaluate(async () => { for (const r of await HS.db.list('erp_np_style', { eq: { season: '2099SS' } })) await HS.db.remove('erp_np_style', { season: '2099SS', style: r.style }).catch(() => {}); });
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
