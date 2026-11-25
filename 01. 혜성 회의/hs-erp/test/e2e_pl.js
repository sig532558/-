// 원가관리 V4.06 업로드 → 손익계산표가 엑셀 '손익계산표' 시트와 같은지 · 공지 팝업/확인 · 브랜드 순서 · 카톡 미리보기 · 시즌
const { chromium } = require('playwright'); const fs = require('fs');
const AT = '/mnt/user-data/attachments/7e416561-536b-572f-95a3-857922cfaa8e/'; const file = (p) => AT + fs.readdirSync(AT).find((f) => f.startsWith(p));
const SH = __dirname + '/shots/'; const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const closeModals = (pg) => pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const login = async (id, pw) => { await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(800); };
  await login('admin', 'admin1234'); await closeModals(pg);
  // 1) 원가관리 V4.06 올리기
  await pg.goto(URL + '#/upload'); await pg.waitForTimeout(800); await closeModals(pg);
  await pg.setInputFiles('#fi', [file('f31309b0')]); await pg.waitForSelector('#go', { timeout: 180000 });
  await pg.click('#go'); await pg.waitForSelector('#prog .lock', { timeout: 600000 }); await pg.waitForTimeout(500); await closeModals(pg);
  await pg.goto(URL + '#/costsum?v=pl&y=2026&tm=정상1팀'); await pg.waitForTimeout(2000); let t = await pg.textContent('#body');
  const rowOf = async (sel, label) => pg.$$eval(sel + ' tr', (trs, l) => { for (const x of trs) { const c = [...x.cells].map((e) => e.textContent.trim()); const i = c.indexOf(l); if (i >= 0 && i <= 1) return c.slice(i); } return null; }, label); // 순번 칸이 있어도 이름 칸부터
  let r = await rowOf('.tM', '1월'); console.log('정상 1월', r);
  ok(r && r[1] === '102,923,665' && r[2] === '79,072,270' && r[3] === '23,851,395', '정상팀 1월 매출 · 지출 · 손익 = 엑셀 손익계산표');
  r = await rowOf('.tM', '합계'); console.log('정상 합계', r); ok(r && r[1] === '727,343,280', '정상팀 연 매출 합계 727,343,280 = 엑셀');
  await pg.selectOption('#selW', '이월소터팀'); await pg.selectOption('#selQ', '2'); await pg.waitForTimeout(300);
  r = await rowOf('.tW', '7월1주차'); console.log('이월 7월1주차', r); ok(r && r[1] === '21,505,813' && r[2] === '14,134,619', '이월팀 7월1주차 = 엑셀');
  r = await rowOf('.tW', '합계'); console.log('이월 3분기 합계', r); ok(r && r[1] === '148,998,868', '이월팀 3분기 매출 합계 = 엑셀 148,998,868');
  r = await pg.$$eval('.plrep tr', (trs) => { for (const t of trs) { const c = [...t.cells].map((e) => e.textContent.trim()); const i = c.findIndex((v) => /^\(주\)혜성물류/.test(v)); if (i >= 0 && i <= 1) return c.slice(i); } return null; }); console.log('전체', r); console.log('ALL', r); ok(r && r[3] === '2,232,829,832', '회사 전체 매출 2,232,829,832 = 엑셀 2,235,802,289 − 8/31 두 번 더한 2,972,457 (입고 · 온라인)');
  r = await rowOf('.tM', '8월'); ok(r && r[1] === '74,211,774', '정상팀 8월 = 엑셀 (8/31은 9월1주차)');
  await pg.screenshot({ path: SH + 'p1_pl.png', fullPage: true });
  // 2) 카톡 이미지: 미리보기 창
  await pg.click('#snap'); await pg.waitForSelector('.snapi img', { timeout: 30000 }); ok(/카톡 이미지 미리보기/.test(await pg.textContent('.modal')), '카톡 이미지 → 미리보기 창 (바로 다운로드 안 함)');
  await pg.screenshot({ path: SH + 'p2_snap.png' }); await closeModals(pg);
  // 3) 브랜드 순서 편집
  await pg.goto(URL + '#/settings?k=brands'); await pg.waitForTimeout(1000); await pg.click('#bord'); await pg.waitForSelector('.bo-row');
  const first = await pg.$eval('.bo-row', (x) => x.dataset.n); await pg.click('.bo-row:nth-child(3) [data-t]');
  const now1 = await pg.$eval('.bo-row', (x) => x.dataset.n); await pg.screenshot({ path: SH + 'p3_brand.png' });
  await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(800);
  const firstRow = await pg.$eval('.rt tr[data-n]', (x) => x.dataset.n); ok(now1 !== first && firstRow === now1, '브랜드 순서: 3번째를 맨 위로 → 저장 · 목록 반영 (' + now1 + ')');
  // 4) 공지: 정상팀 대상 → 정상팀 팀장 접속 시 팝업 → 확인
  await pg.goto(URL + '#/notice'); await pg.waitForTimeout(800); await pg.click('#tools .btn.p');
  await pg.fill('#n1', '11월 안전 교육'); await pg.fill('#n2', '11/3(월) 08:30 전원 참석'); await pg.check('#n3 input[value="정상팀"]'); await pg.check('#n3 input[value="지원팀"]');
  await pg.screenshot({ path: SH + 'p4_notice_form.png' }); await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(800); await closeModals(pg);
  t = await pg.textContent('#body'); ok(/11월 안전 교육/.test(t) && /정상팀, 지원팀/.test(t), '공지: 정상팀 · 지원팀 대상으로 저장');
  const relog = async (id, pw) => { await pg.evaluate(() => sessionStorage.clear()).catch(() => {}); await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); };
  // 정상팀 팀장: 접속하면 팝업 → [확인했습니다]
  await relog('leader', '1234'); await pg.waitForSelector('.modal-bg.npop', { timeout: 8000 }).catch(() => {});
  let pop = await pg.$('.modal-bg.npop'); ok(!!pop && /11월 안전 교육/.test(await pop.textContent()), '정상팀 팀장 접속 → 공지 팝업');
  await pg.screenshot({ path: SH + 'p5_notice_pop.png' });
  await pg.click('.modal-bg.npop .mf .btn.p'); await pg.waitForTimeout(600);
  await relog('leader', '1234'); await pg.waitForTimeout(2500); ok(!(await pg.$('.modal-bg.npop')), '확인한 공지는 다시 안 뜸');
  // 업무지원(지원팀): 팝업 · [나중에] → 다음 접속에 다시
  await relog('support', '1234'); await pg.waitForSelector('.modal-bg.npop', { timeout: 8000 }).catch(() => {}); ok(!!(await pg.$('.modal-bg.npop')), '지원팀 접속 → 공지 팝업');
  await pg.click('.modal-bg.npop .mf .btn:not(.p)'); await relog('support', '1234'); await pg.waitForSelector('.modal-bg.npop', { timeout: 8000 }).catch(() => {}); ok(!!(await pg.$('.modal-bg.npop')), '[나중에] → 다음 접속에 다시 팝업');
  // 관리자: 확인 현황
  await relog('admin', 'admin1234'); await pg.waitForTimeout(2500); await closeModals(pg); await pg.goto(URL + '#/notice'); await pg.waitForTimeout(900);
  const rt = await pg.$$eval('tr[data-id] td', (x) => x.map((e) => e.textContent.trim())); console.log('notice row', rt.join(' | ')); ok(rt.some((x) => /^1 \/ [23]$/.test(x)), '관리자 목록: 확인 1 / 대상');
  await pg.click('tr[data-id]'); await pg.waitForSelector('.ncf'); const nc = await pg.textContent('.ncf'); ok(/확인 1명/.test(nc) && /정상팀장/.test(nc) && /아직/.test(nc) && /업무지원/.test(nc), '공지 상세: 확인한 사람 · 안 한 사람');
  await pg.screenshot({ path: SH + 'p6_notice_status.png' });
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors (admin)'); if (errs.length) process.exitCode = 1; await b.close(); })();
