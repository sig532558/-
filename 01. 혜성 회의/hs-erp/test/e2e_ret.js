// 반품 관리 화면 점검 (로컬 모드 · 실제 반품 관리 V1.211 엑셀)
const { chromium } = require('playwright'); const fs = require('fs'); const XLSX = require('xlsx');
const AT = '/mnt/user-data/attachments/7e416561-536b-572f-95a3-857922cfaa8e/';
if (!fs.existsSync(AT)) { console.log('SKIP ' + __filename.replace(/^.*[\\/]/, '') + ' — 회사 엑셀(첨부 폴더)이 이 PC에 없어 건너뜁니다'); process.exit(0); }
const F = AT + fs.readdirSync(AT).find((f) => f.startsWith('e48502b0'));
const SH = __dirname + '/shots/', FX = __dirname + '/fx/'; fs.mkdirSync(SH, { recursive: true }); fs.mkdirSync(FX, { recursive: true });
const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
// 화주 ERP 원본처럼: 출고반품현황만 든 파일 · 펜텀 의뢰 대비 파일(브랜드 열 없음, 파일 이름에 브랜드)
{ const wb = XLSX.read(fs.readFileSync(F), { type: 'buffer' });
  const a = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(a, wb.Sheets['출고반품현황'], 'Sheet1'); XLSX.writeFile(a, FX + 'ret_done.xlsx');
  const b = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(b, wb.Sheets['펜텀'], 'Sheet1'); XLSX.writeFile(b, FX + 'FANTOM_req.xlsx');
  const c = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(c, wb.Sheets['링스'], 'Sheet1'); XLSX.writeFile(c, FX + 'req_nobrand.xlsx'); }
(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body');
  await pg.goto(URL + '#/returns'); await pg.waitForTimeout(1000);
  ok(/자료가 없습니다/.test(await pg.textContent('#body')), '첫 화면: 자료 없음 안내');
  await pg.goto(URL + '#/returns?k=up'); await pg.waitForSelector('[data-slot=req]');
  ok((await pg.$$('.np3 .slot')).length === 3, '자료 업데이트 칸 3개 (매장 반품 등록 · 고백센터 반품 확정 · 일별 대장 박스)');
  // 잘못된 칸
  await pg.setInputFiles('[data-slot=req] input[type=file]', FX + 'ret_done.xlsx'); await pg.waitForFunction(() => /✖|✔/.test(document.querySelector('[data-slot=req]').textContent), null, { timeout: 60000 });
  ok(/매장 반품 등록 파일이 아닙니다/.test(await pg.textContent('[data-slot=req]')), '매장 반품 칸에 출고 반품 현황 → 거부 · 빠진 열 안내');
  // 브랜드 없는 파일 → 선택
  await pg.setInputFiles('[data-slot=req] input[type=file]', FX + 'req_nobrand.xlsx'); await pg.waitForFunction(() => /브랜드를 모르는|✔|✖/.test(document.querySelector('[data-slot=req]').textContent), null, { timeout: 60000 });
  ok(/브랜드를 모르는 줄/.test(await pg.textContent('[data-slot=req]')), '브랜드 열 · 이름 없는 파일 → 브랜드 선택 칸');
  await pg.selectOption('[data-slot=req] [data-nb]', '링스'); await pg.waitForTimeout(300);
  ok(/링스 4,460/.test(await pg.textContent('[data-slot=req]')), '브랜드 선택 → 링스 4,460줄');
  // V1.211 통째로
  await pg.setInputFiles('#bkr + input, .card input[type=file]:not([multiple])', F); await pg.waitForFunction(() => /✔|✖/.test((document.querySelector('#bkr') || {}).textContent || ''), null, { timeout: 120000 });
  ok(/행낭 13,115건/.test(await pg.textContent('#bkr')), '기존 관리 엑셀: 행낭 13,115 · 타택배 · 박스 수불 인식');
  await pg.screenshot({ path: SH + 'r1_upload.png', fullPage: true });
  await pg.click('#reg'); await pg.waitForFunction(() => location.hash.indexOf('k=dash') >= 0, null, { timeout: 300000 }); await pg.waitForTimeout(2500); await pg.goto(URL + '#/returns?k=dash&m=2026-10&d=2026-10-28'); await pg.waitForTimeout(2000);
  const kv = await pg.$$eval('.kpi .v', (x) => x.map((e) => e.textContent.trim()));
  console.log(kv);
  ok(kv[3] === '1,638 전표', '전산 미처리 1,638 전표 (엑셀과 같음)');
  ok(kv[2] === '18,189 전표', '10월 누적 반품 완료 18,189 전표');
  ok(/324/.test(kv[0]) && kv[1] === '337 전표', '10/28 도착 324 BOX · 당일 완료 337 전표');
  const row = await pg.$$eval('.rtab tr', (t) => t.map((r) => r.textContent));
  ok(row.some((r) => r.replace(/,/g, '') === '10/27 (화)352052622949534461-45316834--5-39-492253299---501012257-881'), '10/27 줄이 엑셀 대장과 같음 (탑 35 · 롯데 205 · 행낭 26 · 기타 229 · 합계 495 · 완료 492 전표 · 미처리 881 전표)');
  await pg.screenshot({ path: SH + 'r2_dash.png', fullPage: true });
  await pg.click('#vs button:nth-child(2)'); await pg.waitForTimeout(1200);
  const rp = await pg.$$eval('.rtab tr', (t) => t.map((r) => r.textContent.replace(/,/g, '')));
  ok(rp.some((r) => /^10\/28 \(수\)5297978/.test(r)), 'PCS 보기: 10/28 핑 529 · 펜텀 7,978');
  await pg.screenshot({ path: SH + 'r3_pcs.png', fullPage: true });
  // 다시 같은 출고 반품 현황만 올려도 숫자 그대로
  await pg.goto(URL + '#/returns?k=up'); await pg.waitForSelector('[data-slot=done]');
  await pg.setInputFiles('[data-slot=done] input[type=file]', FX + 'ret_done.xlsx'); await pg.waitForFunction(() => /✔|✖/.test(document.querySelector('[data-slot=done]').textContent), null, { timeout: 60000 });
  await pg.setInputFiles('[data-slot=req] input[type=file]', FX + 'FANTOM_req.xlsx'); await pg.waitForFunction(() => /✔|✖/.test(document.querySelector('[data-slot=req]').textContent), null, { timeout: 60000 });
  ok(/펜텀 7,411/.test(await pg.textContent('[data-slot=req]')), '파일 이름(FANTOM)으로 브랜드 인식');
  await pg.click('#reg'); await pg.waitForFunction(() => location.hash.indexOf('k=dash') >= 0, null, { timeout: 120000 }); await pg.waitForTimeout(2000); await pg.goto(URL + '#/returns?k=dash&m=2026-10&d=2026-10-28'); await pg.waitForTimeout(2000);
  const kv2 = await pg.$$eval('.kpi .v', (x) => x.map((e) => e.textContent.trim()));
  ok(kv2[2] === '18,189 전표' && kv2[3] === '1,638 전표', '같은 자료 다시 올려도 두 번 세지 않음');
  // 미처리 상세
  ok(/미처리 상세/.test(await pg.textContent('#body')) && /펜텀 · 오래된 순 · 871건/.test(await pg.textContent('#body')), '미처리 상세: 펜텀 871건');
  // 행낭 등록
  await pg.goto(URL + '#/returns?k=h&m=2026-10'); await pg.waitForSelector('.qe tbody tr');
  ok(/10월|2026-10 · 732건/.test(await pg.textContent('#body')), '행낭 대장 10월 732건');
  await pg.selectOption('.qe tbody tr:last-child [data-k=brand]', '마스터바니'); await pg.fill('.qe tbody tr:last-child [data-k=store]', '안성'); await pg.fill('.qe tbody tr:last-child [data-k=box]', '4');
  await pg.focus('.qe tbody tr:last-child [data-k=note]'); await pg.keyboard.press('Enter');
  ok((await pg.$$('.qe tbody tr')).length === 2 && (await pg.$eval('.qe tbody tr:last-child [data-k=brand]', (e) => e.value)) === '마스터바니', 'Enter → 새 줄 (브랜드 윗줄 값 그대로)');
  await pg.keyboard.type('대구황금점'); await pg.fill('.qe tbody tr:last-child [data-k=box]', '1');
  await pg.screenshot({ path: SH + 'r4_bag.png', fullPage: false });
  await pg.click('#qs'); await pg.waitForTimeout(1500);
  ok(/2줄 저장했습니다|734건/.test(await pg.textContent('body')), '행낭 2줄 저장');
  // 타택배
  await pg.goto(URL + '#/returns?k=t&m=2026-10'); await pg.waitForSelector('.qe tbody tr');
  ok((await pg.$$('.qe thead th')).length === 9 && /확인 대기|처리 완료/.test(await pg.textContent('#body')), '타택배: 택배사 · 구분 칸 · 상태 표시');
  // 기타 대장 · 박스 수불
  await pg.goto(URL + '#/returns?k=box&m=2026-10'); await pg.waitForTimeout(1200); ok(/일별 반품 박스 수불/.test(await pg.textContent('#body')), '박스 수불 탭');
  await pg.goto(URL + '#/returns?k=rec&m=2026-10'); await pg.waitForTimeout(1200); ok(/행사·선반품/.test(await pg.textContent('#body')), '기타 대장 탭');
  // 휴대폰
  await pg.setViewportSize({ width: 390, height: 840 }); await pg.goto(URL + '#/returns'); await pg.waitForTimeout(2000);
  const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(over <= 1, '휴대폰 화면 가로 넘침 없음 (' + over + ')');
  await pg.screenshot({ path: SH + 'r5_mobile.png', fullPage: false });
  console.log(errs.length ? errs.join('\n') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
