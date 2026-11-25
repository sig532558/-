// 업로드 양식 보기 점검 — 꼭 필요한 칸이 예시 표에 실제로 있는지 · 양식 창이 에러 없이 열리는지
const { chromium } = require('playwright'); const PORT = process.argv[2] || 8767; const URL = 'http://localhost:' + PORT + '/';
let fail = 0; const ok = (c, t) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + t); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);
  const R = await pg.evaluate(() => {
    const nk = (s) => String(s).replace(/\s+/g, '').replace(/\(.*?\)/g, '');
    const out = [];
    for (const k in HS.FMT) {
      const x = HS.FMT[k];
      const cols = (x.cols || []).map(nk);
      const missing = (x.req || []).filter((g) => !g.some((n) => cols.some((c) => c === nk(n) || c.indexOf(nk(n)) >= 0 || nk(n).indexOf(c) >= 0)));
      out.push({ k, t: x.t, miss: missing.map((g) => g[0]), rowLen: (x.rows || []).map((r) => r.length), colLen: (x.cols || []).length, hasFrom: !!x.from, opt: (x.opt || []).length });
    }
    return out;
  });
  R.forEach((x) => {
    ok(!x.miss.length, '[' + x.k + '] 꼭 필요한 칸이 예시 표에 다 있음' + (x.miss.length ? ' — 빠짐: ' + x.miss.join(' · ') : ''));
    ok(x.rowLen.every((n) => n === x.colLen), '[' + x.k + '] 예시 줄 칸 수가 머리글과 같음 (' + x.colLen + ' · ' + x.rowLen.join(',') + ')');
    ok(x.hasFrom, '[' + x.k + '] 어디서 받는지 적혀 있음');
  });
  // 양식 창이 실제로 열리는지 (엑셀 라이브러리 없이도)
  const keys = R.map((x) => x.k);
  for (const k of keys) {
    const r = await pg.evaluate((kk) => { try { HS.fmtShow(kk); const m = document.querySelector('.modal-bg'); const t = m ? m.textContent.length : 0; document.querySelectorAll('.modal-bg').forEach((e) => e.remove()); return t; } catch (e) { return 'ERR ' + e.message; } }, k);
    ok(typeof r === 'number' && r > 100, '[' + k + '] 양식 창이 열림');
  }
  console.log(errs.length ? '에러: ' + errs.join(' | ') : 'no page errors');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
