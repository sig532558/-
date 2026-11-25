// 설정 › 엑셀 · 물동량 업로드 — 맨 위 [엑셀 일괄 등록] 칸에 물동량 파일을 넣어도 알아보고
// 아래 [물동량 올리기] 칸으로 넘겨 주는지 (2026-11-12 · 행님이 위 칸에 넣어 "인식 못 한다"고 한 건)
const { chromium } = require('playwright'); const X = require('xlsx'); const fs = require('fs');
const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; const FX = __dirname + '/fx/'; fs.mkdirSync(SH, { recursive: true }); fs.mkdirSync(FX, { recursive: true });

// 회사 파일과 같은 모양: 한 시트에 같은 열 묶음 3번(원자료 · 조정 · 정산) · 세 번째(정산)만 읽어야 함
const H = ['일자', '입고', '입고반품', '출고', '반품'];
const head = [].concat(H, H, H);
const day = (d, a, b) => [d, a, 0, b, 0, d, 0, 0, 0, 0, d, a, 0, b, 0];
const sheet = (rows) => X.utils.aoa_to_sheet([head].concat(rows));
{
  const wb = X.utils.book_new();
  // 다른 점검(e2e_volbulk · e2e_usage)과 겹치지 않게 아무도 안 쓰는 2023년으로
  X.utils.book_append_sheet(wb, sheet([day('2023-01-02', 100, 50), day('2023-01-03', 200, 60)]), '크리스');
  X.utils.book_append_sheet(wb, sheet([day('2023-01-02', 10, 5)]), '링스');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['항목', '금액'], ['보관료', 1000000]]), '크리스정산금액(월간)');
  X.writeFile(wb, FX + 'vol_hand.xlsx');
}
// 물동량도 아니고 아는 종류도 아닌 파일 → 예전처럼 '인식된 시트가 없습니다'
{ const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['아무거나', '값'], ['가', 1]]), '엉뚱한시트'); X.writeFile(wb, FX + 'vol_none.xlsx'); }

(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1480, height: 1050 } }); const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1500);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  await pg.goto(URL + '#/upload'); await pg.waitForSelector('#drop'); await pg.waitForTimeout(1200);

  // ---------- 1. 올리는 칸이 두 개 ----------
  const zones = await pg.$$eval('input[type=file]', (x) => x.length);
  ok(zones === 2, '올리는 칸 2개 (엑셀 일괄 등록 · 물동량) ' + zones);

  // ---------- 2. 맨 위 칸에 물동량 파일 ----------
  await pg.setInputFiles('#fi', FX + 'vol_hand.xlsx');
  await pg.waitForFunction(() => /물동량|인식된 시트가 없습니다/.test(document.querySelector('#res').textContent), null, { timeout: 60000 });
  await pg.waitForTimeout(3000);
  const r1 = (await pg.textContent('#res')).replace(/\s+/g, ' ');
  ok(/물동량 파일이네요/.test(r1), '위 칸: 물동량 파일이라고 알려 줌 · ' + r1.slice(0, 110));
  ok(!/인식된 시트가 없습니다/.test(r1), '위 칸: 더 이상 "인식된 시트가 없습니다" 가 아님');
  ok(/물동량 올리기\] 칸으로/.test(r1), '위 칸: 어디로 가는지 알려 줌');
  ok(!/크리스정산금액/.test(r1), '금액 시트는 읽지 않음 (기밀)');

  // ---------- 3. 아래 물동량 칸이 그대로 이어받았는지 ----------
  await pg.waitForFunction(() => /위 칸에서 넘어옴/.test(document.body.textContent), null, { timeout: 30000 });
  ok(true, '아래 [물동량 올리기] 칸이 이어받음');
  await pg.waitForFunction(() => /새로 넣음|덮어씀/.test(document.body.textContent), null, { timeout: 60000 });
  const body = (await pg.textContent('#body')).replace(/\s+/g, ' ');
  ok(/시트 2개/.test(body), '화주 2개(크리스 · 링스)로 읽음');
  ok(/2023-01/.test(body), '달 × 화주 미리보기 나옴');
  await pg.screenshot({ path: SH + 'vh1_hand.png', fullPage: true });

  // ---------- 4. 실제로 등록되는지 ----------
  const btn = await pg.$$('button');
  for (const x of btn) { const t = (await x.textContent()).trim(); if (/개월 등록|등록$/.test(t) && /개월/.test(t)) { await x.click(); break; } }
  await pg.waitForTimeout(4000);
  const saved = await pg.evaluate(async () => (await HS.db.list('erp_volume', { gte: { rec_date: '2023-01-01' }, lte: { rec_date: '2023-01-31' } })).reduce((a, r) => a + (+r.qty || 0), 0));
  ok(saved === 425, '정산 묶음(세 번째)만 읽어 등록 100+200+50+60+10+5 = 425 · 실제 ' + saved);
  // 뒤 점검에 영향 없게 치움
  await pg.evaluate(async () => { for (const o of ['크리스', 'LX']) await HS.db.rpc('erp_volume_replace', { p_owner: o, p_from: '2023-01-01', p_to: '2023-12-31', p_rows: [] }).catch(async () => { for (const r of await HS.db.list('erp_volume', { gte: { rec_date: '2023-01-01' }, lte: { rec_date: '2023-12-31' } })) await HS.db.remove('erp_volume', { rec_date: r.rec_date, owner: r.owner, proc: r.proc }).catch(() => {}); }); });

  // ---------- 5. 물동량도 아는 종류도 아닌 파일은 예전 그대로 ----------
  await pg.goto(URL + '#/upload'); await pg.waitForSelector('#drop'); await pg.waitForTimeout(1200);
  await pg.setInputFiles('#fi', FX + 'vol_none.xlsx');
  await pg.waitForFunction(() => /인식된 시트가 없습니다|물동량 파일이네요/.test(document.querySelector('#res').textContent), null, { timeout: 60000 });
  await pg.waitForTimeout(1200);
  const r2 = (await pg.textContent('#res')).replace(/\s+/g, ' ');
  ok(/인식된 시트가 없습니다/.test(r2) && !/물동량 파일이네요/.test(r2), '엉뚱한 파일은 예전처럼 "인식된 시트가 없습니다"');

  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
