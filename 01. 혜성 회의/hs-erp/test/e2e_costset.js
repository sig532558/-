// 원가 관리 (2026-11-11)
//  ① 업무 숨기기 · 되살리기  ② 업무 · 단가는 관리자만  ③ 설정 › 원가관리 설정
//  ④ 지원팀 › 팀별 인원 배정 (각 팀 원가 관리 화면에 그대로)  ⑤ 별도인원 메뉴
const { chromium } = require('playwright');
const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/';
const login = async (pg, id, pw) => {
  await pg.goto(URL); await pg.waitForTimeout(600);
  // 이미 로그인돼 있으면 먼저 나감 (자료는 그대로 두고 사람만 바꿈)
  if (!(await pg.$('#lid'))) { await pg.evaluate(async () => { await HS.db.logout(); }); await pg.goto(URL); await pg.reload(); }
  await pg.waitForSelector('#lid', { timeout: 20000 });
  await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
};
const navOf = (pg, g) => pg.$$eval('.nav .ng[data-g="' + g + '"] a', (x) => x.map((a) => a.textContent.trim()));
// 표에서 그 줄을 글자로 찾음 (앞에 No 칸이 붙어도 됨)
const rowOf = (pg, sel, label) => pg.evaluate(([s, l]) => {
  for (const t of document.querySelectorAll(s + ' table')) for (const r of t.rows) {
    const c = [...r.cells].map((x) => x.textContent.replace(/\s+/g, ' ').trim());
    const i = c.findIndex((x) => x === l || x.indexOf(l + ' ') === 0); if (i >= 0) return c.slice(i);
  } return null;
}, [sel, label]);

(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 1050 } }); const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));

  // ---------- 1. 설정 › 원가관리 설정 ----------
  await login(pg, 'admin', 'admin1234');
  const setNav = await navOf(pg, '설정');
  ok(setNav.indexOf('원가관리 설정') === 1, '설정 메뉴에 원가관리 설정 ' + JSON.stringify(setNav));
  await pg.goto(URL + '#/costset'); await pg.waitForSelector('.card'); await pg.waitForTimeout(1200);
  const t1 = await pg.textContent('#body');
  ok(/공정 단가/.test(t1) && /업무 추가/.test(t1), '팀별 업무 · 단가 화면 ' + (await pg.textContent('h3')).slice(0, 40));
  ok(/숨긴 업무도 보기/.test(await pg.textContent('#tools')), '[숨긴 업무도 보기] 있음');
  // 기준정보의 옛 주소는 새 화면으로
  await pg.goto(URL + '#/settings?k=prices'); await pg.waitForTimeout(1500);
  ok(/#\/costset/.test(pg.url()), '옛 주소(기준정보 › 공정 단가)는 원가관리 설정으로 보냄 ' + pg.url());
  const stNav = await pg.$$eval('#tools .seg button', (x) => x.map((e) => e.textContent.trim()));
  ok(stNav.indexOf('팀별 업무 · 단가') === 0 && stNav.indexOf('팀 · 인건비') === 1 && stNav.indexOf('연도별 인건비') === 2, '탭 3개 ' + JSON.stringify(stNav));

  // ---------- 1-2. 연도별 인건비 (sql/26_team_year_cost.sql) ----------
  const nowY = new Date().getFullYear();
  await pg.goto(URL + '#/costset?k=year'); await pg.waitForSelector('.card'); await pg.waitForTimeout(1500);
  const yTxt = await pg.textContent('#body');
  ok(new RegExp(nowY + '년 인건비').test(yTxt), '올해 인건비 화면 · ' + (await pg.textContent('h3')).slice(0, 30));
  ok(/기준정보 값/.test(yTxt), '기준정보 값을 나란히 보여 줌');
  const yrSeg = await pg.$$eval('#tools .seg button', (x) => x.map((e) => e.textContent.trim()));
  ok(yrSeg.indexOf(nowY + '년') >= 0 && yrSeg.indexOf((nowY - 1) + '년') >= 0, '연도 고르는 칸 ' + JSON.stringify(yrSeg.filter((s) => /년$/.test(s))));
  // 지난 해 인건비를 넣고 지출이 그 값으로 계산되는지
  await pg.goto(URL + '#/costset?k=year&y=' + (nowY - 1)); await pg.waitForSelector('.card'); await pg.waitForTimeout(1500);
  await pg.evaluate(() => {
    const tr = [...document.querySelectorAll('tr')].find((r) => [...r.cells].some((c) => c.textContent.trim() === '정상1팀'));
    const i = tr.querySelector('input[data-k="labor_cost"]'); i.value = '153300'; i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await pg.click('button.btn.p'); await pg.waitForTimeout(2500);
  const yc = await pg.evaluate(async (y) => (await HS.db.list('erp_team_cost', {})).filter((r) => r.team === '정상1팀' && +r.year === y).map((r) => +r.labor_cost), nowY - 1);
  ok(JSON.stringify(yc) === '[153300]', '지난 해 인건비 저장됨 ' + JSON.stringify(yc));
  const cost = await pg.evaluate(async (y) => {
    await HS.db.upsert('erp_worklog', [{ work_date: y + '-09-10', team: '정상1팀', grp: '출고', task: '출고', unit_price: 100, qty: 10, to_count: 3 }]);
    const r = await HS.db.rpc('erp_pl_days', { p_from: y + '-09-10', p_to: y + '-09-10' });
    return Math.round(+(r.find((x) => x.team === '정상1팀') || {}).cost || 0);
  }, nowY - 1);
  ok(cost === 3 * 153300, '지난 해 지출이 그 해 인건비로 계산됨 (3명 × 153,300 = 459,900) · 실제 ' + cost.toLocaleString());

  // ---------- 2. 업무 추가 → 숨기기 → 되살리기 ----------
  await pg.evaluate(async () => { await HS.db.upsert('erp_task_prices', [{ team: '정상1팀', grp: '출고', task: '시험업무', unit_price: 77, sort: 99, active: true }]); });
  await pg.goto(URL + '#/costset?k=prices&t=' + encodeURIComponent('정상1팀')); await pg.waitForSelector('.card'); await pg.waitForTimeout(1200);
  ok(/시험업무/.test(await pg.textContent('#body')), '추가한 업무가 목록에 나옴');
  const inList = async () => /시험업무/.test(await pg.textContent('#body'));
  // 숨기기 (확인 창 → 예)
  pg.once('dialog', (d) => d.accept());
  await pg.evaluate(() => { const tr = [...document.querySelectorAll('tr')].find((r) => /시험업무/.test(r.textContent)); tr.querySelector('[data-hide]').click(); });
  await pg.waitForTimeout(600);
  const okBtn = await pg.$('.modal .mf .btn.p'); if (okBtn) await okBtn.click();
  await pg.waitForTimeout(1800);
  ok(!(await inList()), '숨기면 목록에서 사라짐');
  const stillThere = await pg.evaluate(async () => (await HS.db.list('erp_task_prices', { eq: { team: '정상1팀' } })).filter((r) => r.task === '시험업무').length);
  ok(stillThere === 1, '숨겨도 자료는 지워지지 않음 (지나간 기록 보호)');
  // 업무일지 입력칸에도 안 나와야 함
  await pg.goto(URL + '#/worklog?t=' + encodeURIComponent('정상1팀')); await pg.waitForSelector('.card'); await pg.waitForTimeout(1500);
  ok(!/시험업무/.test(await pg.textContent('#body')), '숨긴 업무는 업무일지 입력칸에도 안 나옴');
  // 되살리기
  await pg.goto(URL + '#/costset?k=prices&t=' + encodeURIComponent('정상1팀') + '&off=1'); await pg.waitForSelector('.card'); await pg.waitForTimeout(1200);
  ok(await inList(), '[숨긴 업무도 보기] 로 다시 보임');
  await pg.evaluate(() => { const tr = [...document.querySelectorAll('tr')].find((r) => /시험업무/.test(r.textContent)); tr.querySelector('[data-hide]').click(); });
  await pg.waitForTimeout(1800);
  const back = await pg.evaluate(async () => (await HS.db.list('erp_task_prices', { eq: { team: '정상1팀' } })).find((r) => r.task === '시험업무').active);
  ok(back !== false, '되살리기');
  await pg.screenshot({ path: SH + 'cs1_prices.png', fullPage: true });

  // ---------- 3. 별도인원 ----------
  const groups = await pg.$$eval('.nav .ng', (x) => x.map((e) => e.dataset.g));
  ok(groups.indexOf('별도인원') >= 0, '별도인원 메뉴 생김 ' + JSON.stringify(groups.filter((g) => /팀|별도/.test(g))));
  await pg.goto(URL + '#/worklog?t=' + encodeURIComponent('별도인원')); await pg.waitForSelector('.card'); await pg.waitForTimeout(1500);
  ok(/별도인원/.test(await pg.textContent('#tools')), '별도인원 원가 관리 입력 화면 열림');

  // ---------- 4. 지원팀 › 팀별 인원 배정 ----------
  await login(pg, 'support', '1234');
  const supNav = await navOf(pg, '지원팀');
  ok(supNav.indexOf('팀별 인원 배정') === 2, '지원팀 메뉴에 팀별 인원 배정 ' + JSON.stringify(supNav));
  await pg.goto(URL + '#/headcount?d=2026-11-11'); await pg.waitForSelector('.card'); await pg.waitForTimeout(1500);
  const h1 = await pg.textContent('#body');
  ok(/나눠 쓸 인원/.test(h1) && /지원팀/.test(h1) && /관리팀/.test(h1), '① 나눠 쓸 인원 (지원팀 · 관리팀)');
  ok(/팀별 배정/.test(h1) && /현장확인/.test(h1) && /사무실확인/.test(h1) && /배정 인원/.test(h1), '② 팀별 배정 표 (현장확인 · 사무실확인 · 배정 인원)');
  // 2026-11-12 부터 현장확인은 각 팀이 적으므로 여기서는 입력칸이 아니어야 함
  const roF = await pg.evaluate(() => { const tr = [...document.querySelectorAll('tr')].find((r) => [...r.cells].some((c) => c.textContent.trim() === '정상1팀')); return tr ? tr.querySelectorAll('input[data-k="field_count"]').length : -1; });
  ok(roF === 0, '현장확인은 지원팀 화면에서 못 고침 (입력칸 ' + roF + '개)');
  // 지원팀 3 · 관리팀 2 → 정상1팀 배정 2 · 이월소터팀 배정 3
  await pg.evaluate(() => {
    const set = (tr, k, v) => { const i = tr.querySelector('input[data-k="' + k + '"]'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); };
    const find = (t) => [...document.querySelectorAll('tr')].find((r) => (r.cells[r.cells.length - 1] && true) && [...r.cells].some((c) => c.textContent.trim() === t));
    set(find('지원팀'), 'field_count', 3); set(find('관리팀'), 'field_count', 2);
    set(find('정상1팀'), 'office_count', 2); set(find('정상1팀'), 'alloc_count', 2);
    set(find('이월소터팀'), 'office_count', 1); set(find('이월소터팀'), 'alloc_count', 3);
  });
  await pg.waitForTimeout(400);
  const sumTxt = await pg.textContent('.lock');
  ok(/나눠 쓸 인원 5명/.test(sumTxt.replace(/\s+/g, ' ')) && /배정 합계 5명/.test(sumTxt.replace(/\s+/g, ' ')), '합계를 바로 알려 줌 · ' + sumTxt.replace(/\s+/g, ' ').slice(0, 90));
  await pg.click('button.btn.p'); await pg.waitForTimeout(2200);
  const saved = await pg.evaluate(async () => Object.fromEntries((await HS.db.list('erp_headcount', { eq: { work_date: '2026-11-11' } })).map((r) => [r.team, [+r.office_count, +r.alloc_count]])));
  ok(JSON.stringify(saved['정상1팀']) === '[2,2]' && JSON.stringify(saved['이월소터팀']) === '[1,3]', '사무실확인 · 배정 인원 저장됨 ' + JSON.stringify(saved));
  await pg.screenshot({ path: SH + 'cs2_head.png', fullPage: true });

  // ---------- 5. 각 팀 원가 관리 화면에 그대로 (보기만) ----------
  await login(pg, 'admin', 'admin1234');
  await pg.goto(URL + '#/worklog?t=' + encodeURIComponent('정상1팀') + '&d=2026-11-11'); await pg.waitForSelector('.card'); await pg.waitForTimeout(1800);
  // 인원 확인 표: 내 팀 줄의 현장확인만 입력칸 · 사무실확인 · 배정 인원은 글자
  const hv = await pg.evaluate(() => {
    const tr = [...document.querySelectorAll('tr')].find((r) => [...r.cells].some((c) => c.textContent.trim() === '정상1팀'));
    if (!tr) return null;
    return { ins: [...tr.querySelectorAll('input')].map((i) => i.dataset.k), txt: [...tr.cells].map((c) => c.textContent.trim()) };
  });
  ok(hv && hv.ins.length === 1 && hv.ins[0] === 'field_count', '내 팀 현장확인만 입력칸 ' + JSON.stringify(hv && hv.ins));
  ok(hv && hv.txt.indexOf('2') >= 0, '지원팀이 적은 사무실확인 · 배정 인원이 그대로 보임 ' + JSON.stringify(hv && hv.txt));

  // ---------- 6. 원가 관리 입력 화면에서는 단가를 못 바꿈 (디폴트 수정 불가) ----------
  await login(pg, 'leader', '1234');
  await pg.goto(URL + '#/worklog?t=' + encodeURIComponent('정상1팀')); await pg.waitForSelector('.card'); await pg.waitForTimeout(1800);
  ok(!(await pg.$('#addTask')), '업무 추가 버튼은 이 화면에 없음');
  const priceInputs = await pg.$$eval('input[data-k="unit_price"]', (x) => x.length);
  ok(priceInputs === 0, '공정단가 칸이 입력칸이 아님 (' + priceInputs + ')');
  ok(/공정단가는 이 화면에서 고칠 수 없습니다/.test(await pg.textContent('#body')), '왜 못 바꾸는지 알려 줌');
  ok(/원가관리 설정/.test(await pg.textContent('#body')), '어디서 바꾸는지 알려 줌');
  const qtyInputs = await pg.$$eval('input[data-k="qty"]', (x) => x.length);
  ok(qtyInputs > 0, '작업수량은 그대로 입력 가능 (' + qtyInputs + '칸)');
  await pg.screenshot({ path: SH + 'cs3_lead.png', fullPage: true });

  // ---------- 6-2. 팀장은 설정에서 자기 팀만 (2026-11-12) ----------
  const lNav = await navOf(pg, '설정');
  ok(lNav.indexOf('원가관리 설정') >= 0, '팀장 메뉴에도 원가관리 설정 ' + JSON.stringify(lNav));
  await pg.goto(URL + '#/costset?k=prices&t=' + encodeURIComponent('정상1팀')); await pg.waitForSelector('.card'); await pg.waitForTimeout(1500);
  const lTabs = await pg.$$eval('#tools .seg button', (x) => x.map((e) => e.textContent.trim()));
  ok(lTabs.length === 1 && lTabs[0] === '팀별 업무 · 단가', '팀장에게는 인건비 탭이 없음 ' + JSON.stringify(lTabs));
  ok(/팀장입니다/.test(await pg.textContent('#body')), '자기 팀만 고칠 수 있다고 알려 줌');
  const myPrice = await pg.$$eval('input[data-k="unit_price"]', (x) => x.length);
  ok(myPrice > 0, '팀장: 자기 팀 단가는 입력칸 (' + myPrice + '칸)');
  ok(!!(await pg.$('button[data-hide]')), '팀장: 자기 팀 업무 숨기기 버튼 있음');
  await pg.goto(URL + '#/costset?k=prices&t=' + encodeURIComponent('온라인팀')); await pg.waitForSelector('.card'); await pg.waitForTimeout(1500);
  const oPrice = await pg.$$eval('input[data-k="unit_price"]', (x) => x.length);
  ok(oPrice === 0, '팀장: 다른 팀 단가는 보기만 (' + oPrice + ')');
  const blocked = await pg.evaluate(async () => { try { await HS.db.upsert('erp_task_prices', [{ team: '온라인팀', grp: '출고', task: '몰래추가', unit_price: 1 }]); return 'ok'; } catch (e) { return e.message; } });
  ok(/원가관리 설정/.test(blocked), '팀장: 다른 팀 단가표 직접 저장도 막힘 · ' + blocked);
  const mine = await pg.evaluate(async () => { try { await HS.db.upsert('erp_task_prices', [{ team: '정상1팀', grp: '출고', task: '팀장추가', unit_price: 7 }]); return 'ok'; } catch (e) { return e.message; } });
  ok(mine === 'ok', '팀장: 자기 팀 업무 추가는 됨 · ' + mine);
  await pg.screenshot({ path: SH + 'cs4_lead_set.png', fullPage: true });

  // ---------- 7. 휴대폰 ----------
  await pg.setViewportSize({ width: 390, height: 840 });
  await login(pg, 'support', '1234');
  await pg.goto(URL + '#/headcount?d=2026-11-11'); await pg.waitForTimeout(2200);
  const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 1, '휴대폰 화면 가로 넘침 없음 (' + over + ')');

  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
