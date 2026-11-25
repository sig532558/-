// 팀 고유 양식 KPI (온라인팀 10월 · 이월팀 7월) 일괄 등록 → 팀별 KPI 화면
const { chromium } = require('playwright'); const fs = require('fs');
const AT = '/mnt/user-data/attachments/7e416561-536b-572f-95a3-857922cfaa8e/';
if (!fs.existsSync(AT)) { console.log('SKIP ' + __filename.replace(/^.*[\\/]/, '') + ' — 회사 엑셀(첨부 폴더)이 이 PC에 없어 건너뜁니다'); process.exit(0); }
const file = (p) => AT + fs.readdirSync(AT).find((f) => f.startsWith(p));
const SH = __dirname + '/shots/'; const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => { const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body');
  await pg.goto(URL + '#/upload'); await pg.waitForTimeout(800); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  await pg.setInputFiles('#fi', [file('5dff3d6d'), file('c5d3e6a6')]); await pg.waitForSelector('#go', { timeout: 120000 });
  const kinds = await pg.$$eval('#res table tr td:nth-child(4)', (x) => x.map((e) => e.textContent));
  const rs0 = await pg.textContent('#res'); ok(kinds.filter((k) => /팀별 KPI/.test(k)).length === 2 && /온라인팀/.test(rs0) && /이월소터팀/.test(rs0), '온라인팀 · 이월팀 KPI 인식');
  const rt = await pg.textContent('#res'); ok(/TOTAL 칸 588.5/.test(rt), '이월팀 월간취합 합계칸 차이 알림');
  await pg.screenshot({ path: SH + 'k1_upload.png', fullPage: true });
  await pg.click('#go'); await pg.waitForSelector('#prog .lock', { timeout: 300000 }); await pg.waitForTimeout(500);
  await pg.goto(URL + '#/kpi?t=온라인팀&m=2026-10'); await pg.waitForTimeout(1500); let t = await pg.textContent('#body');
  ok(/90,854/.test(t) && /184\.5/.test(t) && /492/.test(t), '온라인팀 10월: 작업 수량 90,854 · T.O 184.5 · 생산성 492');
  ok(/지시수량/.test(t) && /고객반품/.test(t), '온라인팀 공정별 항목');
  await pg.screenshot({ path: SH + 'k2_online.png', fullPage: true });
  await pg.goto(URL + '#/kpi?t=이월소터팀&m=2026-07'); await pg.waitForTimeout(1500); t = await pg.textContent('#body');
  ok(/421,998/.test(t) && /595\.5/.test(t), '이월팀 7월: 작업 수량 421,998 · T.O 595.5 (날짜별 합)');
  ok(/물량이동/.test(t), '그외 업무 메모');
  await pg.screenshot({ path: SH + 'k3_carry.png', fullPage: true });
  await pg.goto(URL + '#/kpi?t=입고반품팀'); await pg.waitForTimeout(900); ok(/원가관리표/.test(await pg.textContent('#body')), '입고반품팀: KPI 대신 원가관리표 안내');
  await pg.goto(URL + '#/kpi?t=정상1팀'); await pg.waitForTimeout(900); ok(!/원가관리표\(관리자 업무일지\)에만/.test(await pg.textContent('#body')), '정상팀 화면 그대로');
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close(); })();
