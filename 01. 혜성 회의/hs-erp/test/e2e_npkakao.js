// 신상품 현황 — [📷 카톡용 이미지] 한 장 요약 카드
const { chromium } = require('playwright'); const fs = require('fs');
const URL = 'http://localhost:' + (process.env.PORT || process.argv[2] || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; fs.mkdirSync(SH, { recursive: true });

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 1050 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body');
  await pg.waitForTimeout(1200);
  // 자료: 핑 3줄 (입고 2 · 미입고 1 · 출고 1 · 미정리 1) · 링스 2줄 (다 입고 · 다 출고) · 전년 2줄
  await pg.evaluate(async () => {
    // 재고가 0이면 '미출고' 가 '출고완료' 로 뒤집히므로(화면 규칙), 미출고 · 미정리 줄에는 재고를 남긴다
    const mk = (season, style, brand, st_in, st_out, st_clean, plan, inq) => ({ season, style, brand, scode: season.slice(2), item: 'TR', colors: 1, plan_qty: plan, in_qty: inq, out_qty: 0, stock: (st_clean === '미정리' || st_out === '미출고') ? 5 : 0, stock_loc: 0, plan_date: '2098-03-01', st_in, st_out, st_clean, defect: 0, flags: [] });
    const b1 = HS.cache.brands[0].name, b2 = HS.cache.brands[1].name;
    await HS.db.upsert('erp_np_style', [
      mk('2098SS', 'K11H5TR001', b1, '입고', '출고완료', '미정리', 1000, 900),
      mk('2098SS', 'K11H5TR002', b1, '입고', '미출고', '정리완료', 1000, 800),
      mk('2098SS', 'K11H5TR003', b1, '미입고', '', '정리완료', 1000, 0),
      mk('2098SS', 'K21H5TR004', b2, '입고', '출고완료', '정리완료', 500, 500),
      mk('2098SS', 'K21H5TR005', b2, '입고', '출고완료', '정리완료', 500, 500),
      mk('2097SS', 'K11G5TR001', b1, '입고', '출고완료', '정리완료', 800, 800),
      mk('2097SS', 'K21G5TR002', b2, '입고', '출고완료', '정리완료', 800, 800),
    ]);
  });
  await pg.goto(URL + '#/newprod?s=2098SS'); await pg.waitForTimeout(2500);
  ok(!!(await pg.$('button:has-text("카톡용 이미지")')), '[📷 카톡용 이미지] 버튼');

  await pg.click('button:has-text("카톡용 이미지")');
  await pg.waitForSelector('.rep-np', { timeout: 30000 });
  const C = await pg.evaluate(() => {
    const el = document.querySelector('.rep-np'); const t = el.textContent.replace(/\s+/g, ' ');
    const cells = [...el.querySelectorAll('.big>div')].map((d) => ({ l: d.querySelector('.l').textContent.trim(), v: d.querySelector('.v').textContent.trim(), s: d.querySelector('.c').textContent.trim() }));
    const rows = [...el.querySelectorAll('table tr')].slice(1).map((r) => [...r.children].map((c) => c.textContent.trim()));
    return { t, cells, rows, w: el.offsetWidth, foot: el.querySelector('.foot').textContent.replace(/\s+/g, ' ') };
  });
  ok(C.cells.length === 6, '큰 숫자 6칸 (' + C.cells.map((x) => x.l).join(' · ') + ')');
  console.log('   값: ' + C.cells.map((x) => x.l + '=' + x.v + ' [' + x.s + ']').join(' / '));
  const v = (l) => (C.cells.find((x) => x.l === l) || {}).v;
  ok(v('기획 품번') === '5 ST', '기획 품번 5 ST (' + v('기획 품번') + ')');
  ok(v('입고') === '4' && (C.cells.find((x) => x.l === '입고') || {}).s === '입고율 80.0%', '입고 4 · 입고율 80.0%');
  ok(v('미입고') === '1', '미입고 1');
  ok(v('출고 완료') === '3' && /75\.0%/.test((C.cells.find((x) => x.l === '출고 완료') || {}).s), '출고 완료 3 · 출고율 75.0%');
  ok(v('입고 후 미출고') === '1', '입고 후 미출고 1');
  ok(v('출고 후 미정리') === '1', '출고 후 미정리 1');
  ok(C.rows.length === 3, '브랜드 2줄 + 합계 (' + C.rows.length + ')');
  ok(C.rows[C.rows.length - 1][1] === '5', '합계 줄 기획 5');
  ok(/전년 대비/.test(C.foot) && /2097 S\/S/.test(C.foot), '꼬리말에 전년 대비 (' + C.foot.slice(0, 60) + ')');
  ok(C.w >= 600 && C.w <= 760, '세로 카드 폭 ' + C.w + 'px (카톡에서 읽히는 크기)');
  ok(/신상품 현황/.test(C.t) && /혜성물류/.test(C.t), '제목 · 회사 이름');

  // 미리보기 창에 복사 · 저장 버튼
  await pg.waitForSelector('.snapv img', { timeout: 60000 });
  const m = (await pg.textContent('.modal')).replace(/\s+/g, ' ');
  ok(/복사/.test(m) && /저장/.test(m), '미리보기 창에 [복사] · [저장]');
  await pg.screenshot({ path: SH + 'npk_preview.png', fullPage: false });
  await pg.click('.modal button:has-text("닫기")'); await pg.waitForTimeout(500);

  // 브랜드를 고르면 그 브랜드만
  const b1 = await pg.evaluate(() => HS.cache.brands[0].name);
  await pg.goto(URL + '#/newprod?s=2098SS&b=' + encodeURIComponent(b1)); await pg.waitForTimeout(2000);
  await pg.click('button:has-text("카톡용 이미지")'); await pg.waitForSelector('.rep-np', { timeout: 30000 });
  const C2 = await pg.evaluate(() => ({ ttl: document.querySelector('.rep-np .hd .t').textContent.trim(), n: document.querySelectorAll('.rep-np table tr').length - 2 }));
  ok(C2.n === 1, '브랜드를 고르면 그 브랜드 1줄만 (' + C2.n + ')');
  ok(/·/.test(C2.ttl) && C2.ttl.length > 12, '제목에 브랜드 이름 (' + C2.ttl + ')');
  await pg.waitForSelector('.snapv img', { timeout: 60000 }); await pg.click('.modal button:has-text("닫기")');

  // 치우기
  await pg.evaluate(async () => { for (const s of ['2098SS', '2097SS']) for (const r of await HS.db.list('erp_np_style', { eq: { season: s } })) await HS.db.remove('erp_np_style', { season: s, style: r.style }).catch(() => {}); });
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
