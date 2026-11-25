// 추가 기능 E2E (로컬 모드 · 실제 엑셀)
const { chromium } = require('playwright');
const fs = require('fs');
const UP = '/root/.claude/uploads/7e416561-536b-572f-95a3-857922cfaa8e/', AT = '/mnt/user-data/attachments/7e416561-536b-572f-95a3-857922cfaa8e/';
if (!fs.existsSync(UP) || !fs.existsSync(AT)) { console.log('SKIP ' + __filename.replace(/^.*[\\/]/, '') + ' — 회사 엑셀(올린 파일 폴더)이 이 PC에 없어 건너뜁니다'); process.exit(0); }
const file = (dir, p) => dir + fs.readdirSync(dir).find((f) => f.startsWith(p));
const SH = __dirname + '/shots/'; fs.mkdirSync(SH, { recursive: true });
const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const shot = (n, full) => pg.screenshot({ path: SH + n + '.png', fullPage: !!full });
  const login = async (id, pw) => { await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(500); };
  const go = async (h, w) => { await pg.goto(URL + '#/' + h); await pg.waitForTimeout(w || 1500); };
  const kv = async () => (await pg.$$eval('.kpi .v', (x) => x.map((e) => e.textContent.trim())));
  await login('admin', 'admin1234');
  // 1) 일괄 등록: 업무일지(단가) + 출고지시 + KPI
  await go('upload', 800);
  await pg.setInputFiles('#fi', [file(UP, 'cbef67b0'), file(AT, 'abf8d2c5'), file(AT, '251dc830')]);
  await pg.waitForSelector('#go', { timeout: 120000 });
  const kinds = await pg.$$eval('#res table tr td:nth-child(4)', (x) => x.map((e) => e.textContent));
  ok(kinds.filter((k) => /아침 출고지시/.test(k)).length >= 20 && kinds.some((k) => /팀별 KPI/.test(k)), '엑셀 일괄 등록: 출고지시 ' + kinds.filter((k) => /아침 출고지시/.test(k)).length + '시트 · KPI 인식');
  await shot('n01_upload_detect');
  await pg.click('#go'); await pg.waitForSelector('#prog .lock', { timeout: 300000 });
  const up = await pg.textContent('#prog'); console.log('upload:', up.slice(0, 300)); ok(/업무일지 반영 \d+일/.test(up), '등록 후 KPI → 업무일지 반영');
  // 2) 출고지시 10/27
  await go('orders?d=2026-10-27', 1800); await shot('n02_orders_before');
  let k = await kv(); console.log('orders kpi', k.join(' / '));
  ok(/1,386/.test(k[0]) && /2,486/.test(k[0]) && /2,285/.test(k[2]) && /3,658/.test(k[2]), '출고지시 판매 1,386/2,486 · 합계 2,285/3,658 (엑셀과 동일)');
  // 사방넷 파일 (출고지시 엑셀 안의 크리스·LX 시트)
  await pg.setInputFiles('.drop input[type=file]', [file(AT, 'abf8d2c5')]);
  await pg.waitForFunction(() => /크리스/.test((document.querySelector('.drop .res') || {}).textContent || ''), null, { timeout: 60000 });
  console.log('sabang:', await pg.textContent('.drop .res'));
  await pg.fill('#adc', '874'); await pg.fill('#adq', '1278'); await pg.click('#sv2'); await pg.waitForTimeout(1500);
  k = await kv(); console.log('orders kpi after', k.join(' / '));
  ok(/1,795건/.test(k[3]) && /2,482/.test(k[3]) && /3,421/.test(k[3]), 'B2C 1,795건 · 2,482 / 전년 3,421');
  await shot('n03_orders', true);
  await pg.click('[data-i1]'); await pg.waitForSelector('.snapi img', { timeout: 30000 }); const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 30000 }), pg.click('.modal .mf .btn.p')]); await dl.saveAs(SH + 'n04_kakao.png'); ok(fs.statSync(SH + 'n04_kakao.png').size > 20000, '카톡용 이미지 생성');
  await pg.click('[data-i2]'); await pg.waitForSelector('.snapi img', { timeout: 30000 }); const [dl2] = await Promise.all([pg.waitForEvent('download', { timeout: 30000 }), pg.click('.modal .mf .btn.p')]); await dl2.saveAs(SH + 'n05_xls.png');
  const [dl3] = await Promise.all([pg.waitForEvent('download', { timeout: 30000 }), pg.click('[data-x]')]); await dl3.saveAs(SH + 'n06_orders.xlsx'); ok(fs.statSync(SH + 'n06_orders.xlsx').size > 3000, '엑셀 내려받기');
  // 3) KPI 원가 분석 9월
  await go('kpi?t=정상1팀&m=2026-09', 2500); await shot('n07_kpi', true);
  k = await kv(); console.log('kpi', k.join(' / '));
  ok(/461,449/.test(k[0]) && /398\.4/.test(k[1]) && /1,158/.test(k[2]), 'KPI 총 수량 461,449 · T.O 398.4 · 생산성 1,158 (엑셀 표시값 398 · 1,159는 반올림)');
  const rowsTxt = await pg.$$eval('.card table', (t) => t[0].innerText); ok(/111원/.test(rowsTxt) && /157원/.test(rowsTxt) && /253원/.test(rowsTxt), '공정별 개당 원가 출고 111 · 입고 157 · 반품 253');
  ok(/입고 정리 적자/.test(await pg.textContent('#body')), '입고 정리 적자 경고');
  await go('kpi?t=정상1팀&tab=in&d=2026-09-01', 1500); await shot('n08_kpi_input', true);
  // 4) 업무일지 자동 반영 확인
  await go('worklog?t=정상1팀&d=2026-09-01', 1500); await shot('n09_worklog_auto');
  const wl = await pg.textContent('#body'); const iv = await pg.$$eval('#body input.cell', (x) => x.map((e) => e.value)); ok(/KPI 입력으로 자동 작성/.test(wl) && iv.indexOf('14545') >= 0 && iv.indexOf('4031') >= 0 && iv.indexOf('1968') >= 0, '업무일지 9/1: 출고 14,545 · 입고 1,968 · 반품 4,031 (KPI 자동)');
  // 5) 신상품
  await go('newprod?tab=up', 1000);
  await pg.setInputFiles('#bkf', [file(AT, '89cf0660')]);
  for (let i = 0; i < 60 && !(await pg.$('#reg')); i++) { if (await pg.$('.modal')) { console.log('brand prompt:', (await pg.textContent('.modal')).slice(0, 60)); await pg.click('.modal .mf .btn:first-child'); } await pg.waitForTimeout(1000); }
  await pg.waitForSelector('#reg', { timeout: 60000 }); await shot('n10_np_update', true);
  await pg.click('#reg'); await pg.waitForFunction(() => /newprod\?s=/.test(location.hash) && document.querySelectorAll('.kpi').length > 3, null, { timeout: 120000 }); await pg.waitForTimeout(1000);
  k = await kv(); console.log('np', k.join(' / '));
  ok(k[1] === '2,207' && k[2] === '2,011' && k[3] === '196', '신상품 기획 2,207 · 입고 2,011 · 미입고 196 (재고는 전산자료 WMS 기준 · 1104_1부터)');
  await shot('n11_newprod', true);
  await go('newprod?s=2026FW&l=unclean', 1500); await shot('n12_np_unclean', true);
  // 6) 브랜드 관리
  await go('settings?k=brands', 1200); await shot('n13_brands', true);
  await pg.click('text=＋ 브랜드 추가'); await pg.fill('#en', 'NEW BRAND'); await pg.fill('#cd', 'N2'); await pg.fill('#ow', '크리스'); await pg.fill('#al', '뉴브랜드, NEW BRAND KOREA'); await shot('n14_brand_add');
  await pg.click('.modal .btn.p'); await pg.waitForTimeout(1200); ok(/NEW BRAND/.test(await pg.textContent('#body')), '브랜드 추가');
  // 7) 권한: 현장팀장
  await pg.click('#logout'); await pg.waitForSelector('#lid'); await login('leader', '1234');
  await go('orders?d=2026-10-27', 1500); ok(!(await pg.$('#sv1')), '현장팀장 출고지시 읽기 전용');
  await go('kpi?t=정상1팀&tab=in&d=2026-09-02', 1500); ok(!!(await pg.$('#sv')), '현장팀장 자기 팀 KPI 입력 가능');
  await go('newprod', 1500); ok(!(await pg.$('text=자료 업데이트')), '현장팀장 신상품 업데이트 버튼 없음');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
