// 아침 출고지시: 금일 판매 입력 후 금일 선지시 입력 → 금일 판매 자동 차감
const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => { const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1500);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  await pg.goto(URL + '#/orders?d=2026-11-02'); await pg.waitForTimeout(1200);
  const S = 'input[data-r="0"][data-k="sale"]', P = 'input[data-r="0"][data-k="pre"]';
  await pg.fill(S, '1758'); await pg.click(P); await pg.keyboard.type('192'); await pg.waitForTimeout(200);
  ok(await pg.inputValue(S) === '1566', '판매 1,758 → 선지시 192 입력 → 판매 1,566 (' + await pg.inputValue(S) + ')');
  await pg.fill(P, '200'); await pg.waitForTimeout(100); ok(await pg.inputValue(S) === '1558', '선지시 200으로 고치면 → 판매 1,558');
  await pg.fill(P, ''); await pg.waitForTimeout(100); ok(await pg.inputValue(S) === '1758', '선지시 지우면 → 판매 1,758 되돌림');
  await pg.click(P); await pg.keyboard.type('192'); await pg.screenshot({ path: __dirname + '/shots/o1_pre.png' });
  await pg.click('#sv1'); await pg.waitForTimeout(1200); await pg.goto(URL + '#/orders?d=2026-11-01'); await pg.waitForTimeout(500); await pg.goto(URL + '#/orders?d=2026-11-02'); await pg.waitForTimeout(1200);
  ok(await pg.inputValue(S) === '1566' && await pg.inputValue(P) === '192', '저장 후 다시 열어도 판매 1,566 · 선지시 192');
  await pg.fill(P, '100'); ok(await pg.inputValue(S) === '1658', '다음 날 다시 고쳐도 차이만큼 (선지시 192→100: 판매 1,658)');
  const s2 = 'input[data-r="1"][data-k="sale"]', p2 = 'input[data-r="1"][data-k="pre"]'; await pg.fill(p2, '50'); ok(await pg.inputValue(s2) === '', '판매를 안 넣은 브랜드는 그대로 (빈칸)');
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close(); })();
