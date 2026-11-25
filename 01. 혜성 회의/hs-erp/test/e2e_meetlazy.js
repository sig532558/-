// 월간 회의 — 보일 때 읽기 점검 (2026-11-18 · 사이트 점검 ③)
//  · 처음 열 때 반품 대장 · 손익계산표를 아직 안 읽음 → 내려가면 읽음 · PDF 버튼은 전부 읽고 인쇄
const { chromium } = require('playwright'); const PORT = process.argv[2] || process.env.PORT || 8766; const URL = 'http://localhost:' + PORT + '/';
let fail = 0; const ok = (c, t) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + t); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1500);
  await pg.evaluate(() => {
    window.__c = { rpc: [], list: [] };
    const r = HS.db.rpc.bind(HS.db), l = HS.db.list.bind(HS.db);
    HS.db.rpc = (fn, a) => { window.__c.rpc.push(fn); return r(fn, a); };
    HS.db.list = (t, q) => { window.__c.list.push(t); return l(t, q); };
    window.print = () => { window.__printed = (window.__printed || 0) + 1; };
  });
  await pg.evaluate(() => { window.scrollTo(0, 0); location.hash = '#/meeting?m=2026-10'; });
  await pg.waitForSelector('#ms-cost', { timeout: 20000 }); await pg.waitForTimeout(1500);
  const first = await pg.evaluate(() => ({ rpc: window.__c.rpc.slice(), list: window.__c.list.slice(), pm: (document.querySelector('#plMeet') || {}).textContent || '', rd: (document.querySelector('#retdash') || {}).textContent || '' }));
  ok(first.rpc.indexOf('erp_pl_days_json') < 0 && first.rpc.indexOf('erp_pl_days') < 0, '처음 열 때 손익계산표 자료는 아직 안 읽음');
  ok(/불러오는 중/.test(first.pm), '손익계산표 자리에 "불러오는 중" 표시');
  const sects = await pg.evaluate(() => document.querySelectorAll('.msect').length);
  ok(sects === 11, '섹션 11개는 모두 그대로 (' + sects + '개)');
  console.log('  처음 열 때 DB 호출: 목록 ' + first.list.length + '회 · 함수 ' + first.rpc.length + '회');
  // 입고팀 ③ 까지 내려가면 반품 대장을 읽음
  const before = await pg.evaluate(() => window.__c.list.length + window.__c.rpc.length);
  await pg.evaluate(() => { const el = document.querySelector('#retdash'); if (el) el.scrollIntoView({ block: 'center' }); });
  await pg.waitForTimeout(2000);
  const rd2 = await pg.evaluate(() => (document.querySelector('#retdash') || {}).textContent || '');
  const after = await pg.evaluate(() => window.__c.list.length + window.__c.rpc.length);
  ok(!/불러오는 중/.test(rd2) && rd2.length > 0, '반품 대장까지 내려가면 그려짐');
  ok(after > before, '내려간 뒤에 반품 자료를 읽음 (+' + (after - before) + '회)');
  // 10번까지 내려가면 손익계산표를 한 번에 읽음
  await pg.evaluate(() => document.querySelector('#plMeet').scrollIntoView({ block: 'center' }));
  await pg.waitForTimeout(2500);
  const pl = await pg.evaluate(() => ({ n: window.__c.rpc.filter((f) => f === 'erp_pl_days_json').length, t: document.querySelector('#plMeet').textContent }));
  ok(pl.n === 1, '10번까지 내려가면 손익 자료를 한 번 읽음 (' + pl.n + '회)');
  ok(!/불러오는 중/.test(pl.t), '손익계산표가 그려짐');
  // 위아래로 다시 움직여도 또 읽지 않음
  await pg.evaluate(() => window.scrollTo(0, 0)); await pg.waitForTimeout(500);
  await pg.evaluate(() => document.querySelector('#plMeet').scrollIntoView({ block: 'center' })); await pg.waitForTimeout(800);
  ok(await pg.evaluate(() => window.__c.rpc.filter((f) => f === 'erp_pl_days_json').length === 1), '다시 내려가도 또 읽지 않음');
  // PDF · 인쇄 — 안 읽은 칸이 있어도 전부 읽고 인쇄
  await pg.evaluate(() => { window.scrollTo(0, 0); location.hash = '#/meeting?m=2026-09'; });
  await pg.waitForTimeout(400); await pg.waitForSelector('#ms-cost', { timeout: 20000 }); await pg.waitForTimeout(800);
  await pg.evaluate(() => { window.__printed = 0; window.scrollTo(0, 0); });
  const pb = await pg.$('#tools button:has-text("PDF")'); await pb.click(); await pg.waitForTimeout(3000);
  const pr = await pg.evaluate(() => ({ n: window.__printed, pm: document.querySelector('#plMeet').textContent, rd: (document.querySelector('#retdash') || {}).textContent || '' }));
  ok(pr.n === 1 && !/불러오는 중/.test(pr.pm) && !/불러오는 중/.test(pr.rd), 'PDF · 인쇄는 남은 칸을 다 읽은 뒤 인쇄');
  console.log(errs.length ? '에러: ' + errs.join(' | ') : 'no page errors');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
