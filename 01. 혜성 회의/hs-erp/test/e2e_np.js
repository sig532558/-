// 신상품 3칸 업로드 화면 점검 (로컬 모드 · 실제 엑셀)
const { chromium } = require('playwright'); const fs = require('fs'); const XLSX = require('xlsx'); const P2 = require('../site/js/parsers2.js');
const UP = '/root/.claude/uploads/7e416561-536b-572f-95a3-857922cfaa8e/', AT = '/mnt/user-data/attachments/7e416561-536b-572f-95a3-857922cfaa8e/';
if (!fs.existsSync(AT) || !fs.existsSync(UP)) { console.log('SKIP ' + __filename.replace(/^.*[\\/]/, '') + ' — 회사 엑셀(첨부 폴더)이 이 PC에 없어 건너뜁니다'); process.exit(0); }
const file = (dir, p) => dir + fs.readdirSync(dir).find((f) => f.startsWith(p));
const SH = __dirname + '/shots/', FX = __dirname + '/fx/'; fs.mkdirSync(SH, { recursive: true }); fs.mkdirSync(FX, { recursive: true });
const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
// 출고 현황 시험 파일: V8 재고 현황의 출고 수량을 품번별로 (현재고·로케이션 없음)
{ const wb = XLSX.read(fs.readFileSync(file(AT, '89cf0660')), { type: 'buffer' }); const d = P2.readNpFiles(wb.SheetNames.map((n) => ({ name: n, ws: wb.Sheets[n] })), ['stock']);
  const st = {}; d.stock.forEach((r) => (st[r.style] = (st[r.style] || 0) + r.out));
  const aoa = [['품번', '색상', '출고일자', '출고수량']]; Object.entries(st).forEach(([s, q]) => { if (q) aoa.push([s, 'BK', '2026-10-28', q]); });
  const ow = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(ow, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1'); XLSX.writeFile(ow, FX + 'np_out.xlsx'); }
(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const kv = async () => (await pg.$$eval('.kpi .v', (x) => x.map((e) => e.textContent.trim())));
  const brandPrompt = async () => { if (await pg.$('.modal')) await pg.click('.modal .mf .btn:first-child'); };
  const waitReg = async () => { for (let i = 0; i < 90 && !(await pg.$('#reg')); i++) { await brandPrompt(); await pg.waitForTimeout(1000); } };
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body');
  await pg.goto(URL + '#/newprod?s=2026FW&tab=up'); await pg.waitForTimeout(1200);
  ok((await pg.$$('.np3 .slot[data-slot]')).length === 3 && !!(await pg.$('.np3 .slot.auto')), '칸: 신상품 정보 · 입고 현황 · 불량(작은 칸) + 재고 현황 자동');
  ok(/전산자료 › WMS 재고 현황/.test(await pg.textContent('.np3 .slot.auto')), '3번 재고 현황 = 전산자료 WMS (따로 안 올림)');
  ok(/WMS/.test(await pg.textContent('[data-slot=inbound] h4')) && /입고반품 현황/.test(await pg.textContent('[data-slot=inbound]')), '2번 입고 현황 = WMS 입고반품 현황');
  // 첫 등록에 입고만 → 품번 정보 먼저 안내
  await pg.setInputFiles('[data-slot=inbound] input', file(AT, '89cf0660')); await pg.waitForFunction(() => /✔/.test(document.querySelector('[data-slot=inbound]').textContent), null, { timeout: 60000 }); await pg.waitForTimeout(1500);
  ok(/1번 신상품 정보/.test(await pg.textContent('#pv')), '첫 등록에 입고만 올리면 "1번 신상품 정보 먼저" 안내');
  // 예비 경로: 정산서 거부 → V8 받아서 칸에 나눔
  await pg.setInputFiles('#bkf', file(UP, '98a419f4')); await pg.waitForFunction(() => /✖|✔/.test(document.querySelector('#bkr').textContent), null, { timeout: 60000 });
  ok(/신상품 관리 엑셀이 아닙니다/.test(await pg.textContent('#bkr')), '예비 경로: 정산서(V7.17) 거부');
  await pg.setInputFiles('#bkf', file(AT, '89cf0660')); await pg.waitForFunction(() => /✔/.test(document.querySelector('#bkr').textContent), null, { timeout: 60000 }); await waitReg();
  const sl = await pg.$$eval('.np3 .slot[data-slot] .dz2', (x) => x.map((e) => e.className));
  ok(sl.every((c) => /ok/.test(c)), '예비 경로: V8을 1 · 2 · 불량 칸에 나눠 넣음 ' + JSON.stringify(sl));
  await pg.click('#reg'); await pg.waitForFunction(() => /newprod\?s=/.test(location.hash) && document.querySelectorAll('.kpi').length > 3, null, { timeout: 120000 }); await pg.waitForTimeout(800);
  let k = await kv(); ok(k[1] === '2,207' && k[2] === '2,011', '등록 2,207 · 입고 2,011 (입고반품은 빼고) ' + JSON.stringify(k));
  // 올린 자료 보기 (최근 원본)
  await pg.goto(URL + '#/newprod?s=2026FW&tab=up'); await pg.waitForTimeout(2000);
  ok(!/없음/.test(await pg.textContent('[data-slot=plan] .stl')), '칸별 지난 업데이트 시각 표시');
  let rv = await pg.textContent('#rvb'); ok(/세트구분/.test(rv) && /출고예정일/.test(rv) && /기획량/.test(rv), '올린 자료 보기 ① 신상품 정보 칸');
  await pg.click('#rvt .seg button:nth-child(2)'); await pg.waitForTimeout(1000); rv = await pg.textContent('#rvb');
  ok(/입고구분/.test(rv) && /등록일자/.test(rv), '② 입고 현황 탭 칸');
  await pg.click('#rvt .seg button:nth-child(4)'); await pg.waitForTimeout(1000); ok(/전산처리방법/.test(await pg.textContent('#rvb')), '불량 상품 탭');
  ok(/건 ·/.test(await pg.textContent('[data-slot=defect]')), '불량 작은 칸: 건수 · 자세히 보기');
  await pg.screenshot({ path: SH + 'np3_up.png', fullPage: true });
  // 휴대폰 화면
  await pg.setViewportSize({ width: 390, height: 844 }); await pg.goto(URL + '#/newprod?s=2026FW&tab=up'); await pg.waitForTimeout(1200);
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= 392), '휴대폰 화면 가로 넘침 없음'); await pg.screenshot({ path: SH + 'np3_mobile.png', fullPage: true });
  console.log(errs.length ? errs.join('\n') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
