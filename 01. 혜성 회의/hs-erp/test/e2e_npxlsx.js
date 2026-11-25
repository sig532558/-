// 엑셀 라이브러리를 뒤에서 받아도 신상품 정보 파일이 읽히는지 (2026-11-12 · 파서가 XLSX 를 붙잡아 두던 문제)
// 쓰는 법: node test\e2e_npxlsx.js <포트> <엑셀파일경로>
const { chromium } = require('playwright');
const PORT = process.argv[2] || 8767; const FILE = process.argv[3];
const URL = 'http://localhost:' + PORT + '/';
let fail = 0; const ok = (c, t) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + t); };
(async () => {
  if (!FILE) { console.log('엑셀 파일 경로를 넣어 주세요'); process.exit(1); }
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 1100 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1500);
  ok(await pg.evaluate(() => !!window.XLSX), '엑셀 라이브러리가 뒤에서 받아짐');
  ok(await pg.evaluate(() => !!(HSParsers2 && HSParsers2.readNpFiles)), '파서가 준비됨');
  // 파서가 붙잡아 둔 XLSX 가 아니라 지금 window.XLSX 를 보는지 — 시트 범위 읽기로 확인
  ok(await pg.evaluate(() => { try { return HSParsers2.grid({ '!ref': 'A1:B2', A1: { v: 1 } }).length === 2; } catch (e) { return 'ERR ' + e.message; } }) === true, '파서가 지금 엑셀 라이브러리를 씀 (grid)');
  await pg.evaluate(() => (location.hash = '#/newprod?tab=up')); await pg.waitForTimeout(2500);
  const slot = await pg.$('[data-slot="plan"] input[type=file]');
  ok(!!slot, '신상품 정보 칸이 있음');
  if (slot) {
    await slot.setInputFiles(FILE);
    await pg.waitForTimeout(6000);
    const t = await pg.textContent('[data-slot="plan"]');
    ok(!/파일을 열 수 없습니다/.test(t), '파일을 열 수 없습니다 라는 말이 안 나옴');
    ok(!/reading 'utils'|undefined/.test(t), 'utils 에러가 안 나옴');
    ok(/품번|기획량|줄|건|읽음|확인/.test(t), '읽은 결과가 칸에 나옴');
    console.log('칸 내용 요약: ' + t.replace(/\s+/g, ' ').slice(0, 220));
  }
  console.log(errs.length ? '에러: ' + errs.join(' | ') : 'no page errors');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
