const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const UP = '/root/.claude/uploads/7e416561-536b-572f-95a3-857922cfaa8e/';
if (!fs.existsSync(UP)) { console.log('SKIP ' + __filename.replace(/^.*[\\/]/, '') + ' — 회사 엑셀(올린 파일 폴더)이 이 PC에 없어 건너뜁니다'); process.exit(0); }
const file = (p) => UP + fs.readdirSync(UP).find((f) => f.startsWith(p));
const SH = __dirname + '/shots/';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const shot = (n) => pg.screenshot({ path: SH + n + '.png', fullPage: false });
  const login = async (id, pw) => { await pg.goto('http://localhost:8767/'); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(600); };
  const logout = async () => { await pg.click('#logout'); await pg.waitForSelector('#lid'); };
  const toast = async () => (await pg.$$eval('.toast', (x) => x.map((e) => e.textContent))).join(' | ');
  await pg.goto('http://localhost:8767/'); await pg.waitForSelector('#lid'); await shot('00_login');
  await login('admin', 'admin1234');
  // 일괄 업로드
  await pg.goto('http://localhost:8767/#/upload'); await pg.waitForSelector('#fi', { state: 'attached' });
  const files = ['cbef67b0', 'ba8ee902', '4840a465', '529414c1', '98a419f4', '11fd9de6', '400903f9', '14baef85'].map(file);
  await pg.setInputFiles('#fi', files);
  await pg.waitForSelector('#go', { timeout: 120000 }); await shot('01_upload_detect');
  const detected = await pg.$$eval('#res table tr', (r) => r.length - 1); console.log('detected rows', detected);
  await pg.click('#go'); await pg.waitForSelector('#prog .lock', { timeout: 300000 });
  console.log('upload result:', await pg.textContent('#prog')); await shot('02_upload_done');
  // 대시보드 (2026-10-19)
  await pg.goto('http://localhost:8767/#/dashboard?c=all&d=2026-10-19'); await pg.waitForTimeout(1500); await shot('03_dashboard');
  console.log('dash kpi:', (await pg.$$eval('.kpi .v', (x) => x.map((e) => e.textContent))).join(' / '));
  // 업무일지
  await pg.goto('http://localhost:8767/#/worklog?t=정상1팀&d=2026-10-19'); await pg.waitForTimeout(1200); await shot('04_worklog');
  console.log('worklog kpi:', (await pg.$$eval('.kpi .v', (x) => x.map((e) => e.textContent))).join(' / '));
  // 마감보고
  await pg.goto('http://localhost:8767/#/daily?d=2026-10-19&s=b2b'); await pg.waitForTimeout(1200); await shot('05_daily');
  // 마감 확정
  pg.once('dialog', (d) => d.accept());
  await pg.click('text=마감 확정'); await pg.click('.modal .btn.p'); await pg.waitForTimeout(800); console.log('lock:', await pg.textContent('.lock'));
  // 업무 할당 (관리자 → 정상1팀)
  await pg.goto('http://localhost:8767/#/tasks'); await pg.waitForTimeout(1200); await shot('06_tasks_board_import');
  await pg.click('text=+ 업무 할당'); await pg.waitForSelector('#f_title');
  await pg.selectOption('#f_type', '오픈출고'); await pg.selectOption('#f_brand', '핑'); await pg.selectOption('#f_team', '정상1팀');
  await pg.fill('#f_title', '신규오픈 매장 초도 출고 2,868 PCS'); await pg.fill('#f_detail', 'PB334 여수(대) 오픈 · 용차 · 물류검수'); await pg.fill('#f_qty', '2868');
  await shot('07_task_assign_form'); await pg.click('.modal .btn.p'); await pg.waitForTimeout(800); console.log('assign toast:', await toast());
  await logout();
  // 실무진 로그인 → 새 업무 팝업 → 접수 → 진행 → 완료
  await login('staff', '1234'); await pg.waitForSelector('.callsign', { timeout: 5000 }).catch(() => {}); await shot('08_staff_new_popup');
  console.log('staff popup:', await pg.$eval('.callsign', (e) => e.innerText).catch(() => 'none'));
  await pg.click('.modal .btn.p'); await pg.waitForTimeout(1000); // 업무 보기
  await pg.waitForSelector('.modal .range', { timeout: 5000 }); await shot('09_staff_task_detail');
  await pg.click('.modal .mf button:text-is("접수")'); await pg.waitForTimeout(700);
  await pg.click('.tk >> text=신규오픈 매장 초도 출고'); await pg.waitForSelector('.modal .range');
  await pg.$eval('.modal .range', (r) => { r.value = 60; r.dispatchEvent(new Event('input')); });
  await pg.fill('.modal #res', '182박스 중 110박스 피킹'); await pg.click('.modal .mf button:text-is("진행률 저장")'); await pg.waitForTimeout(700); await shot('10_staff_board_progress');
  await pg.click('.tk >> text=신규오픈 매장 초도 출고'); await pg.waitForSelector('.modal .range');
  await pg.fill('.modal #res', '182박스 출고 완료 · 서광범 인계'); await pg.click('.modal .mf button:text-is("완료 처리")'); await pg.waitForTimeout(300); await pg.click('.modal-bg:last-child .btn.p'); await pg.waitForTimeout(800);
  console.log('staff toast:', await toast());
  // 실무진은 업무일지 입력 불가 확인
  await pg.goto('http://localhost:8767/#/worklog?t=정상1팀&d=2026-10-20'); await pg.waitForTimeout(800); console.log('staff editable inputs:', await pg.$$eval('#body input.cell:not([disabled])', (x) => x.length));
  console.log('staff nav:', (await pg.$$eval('.nav a', (x) => x.map((e) => e.textContent))).join(','));
  await logout();
  // 관리자 로그인 → 완료 콜사인 팝업
  await login('admin', 'admin1234'); await pg.waitForSelector('.callsign', { timeout: 5000 }).catch(() => {}); await shot('11_admin_callsign');
  console.log('admin popup:', await pg.$eval('.callsign', (e) => e.innerText).catch(() => 'none'));
  await pg.click('.modal .btn:not(.p)'); await pg.waitForTimeout(500);
  // 반품, 정산, 권한, 안성, 요청
  await pg.goto('http://localhost:8767/#/returns?k=box&m=2026-01'); await pg.waitForTimeout(900); await shot('12_returns');
  await pg.goto('http://localhost:8767/#/settlement?m=2025-11'); await pg.waitForTimeout(900); await shot('13_settlement');
  console.log('settle kpi:', (await pg.$$eval('.kpi .v', (x) => x.map((e) => e.textContent))).join(' / '));
  await pg.goto('http://localhost:8767/#/users?k=roles'); await pg.waitForTimeout(900); await shot('14_roles');
  await pg.goto('http://localhost:8767/#/users?k=audit'); await pg.waitForTimeout(900); await shot('15_audit');
  await pg.goto('http://localhost:8767/#/anseong'); await pg.waitForTimeout(900); await shot('16_anseong');
  await pg.goto('http://localhost:8767/#/requests'); await pg.waitForTimeout(900); await shot('17_requests');
  // 모바일
  const m = await ctx.newPage(); await m.setViewportSize({ width: 390, height: 844 }); m.on('pageerror', (e) => errs.push('m:' + e.message));
  await m.goto('http://localhost:8767/'); await m.waitForSelector('#lid'); await m.fill('#lid', 'leader'); await m.fill('#lpw', '1234'); await m.click('#lgo'); await m.waitForTimeout(1200);
  if (await m.$('.modal-bg')) await m.click('.modal .btn:not(.p)').catch(() => {});
  await m.goto('http://localhost:8767/#/worklog?t=정상1팀&d=2026-10-19'); await m.waitForTimeout(1000); await m.screenshot({ path: SH + '18_mobile_worklog.png' });
  await m.goto('http://localhost:8767/#/tasks'); await m.waitForTimeout(1000); await m.screenshot({ path: SH + '19_mobile_tasks.png' });
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await b.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
