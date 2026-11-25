// 2026-11-24 — 설정 › 사용자 · 등급: 삭제 · 아이디 · 비밀번호 · 연락처 · 담당 팀 고치기 (관리자만)
const { chromium } = require('playwright');
const URL = 'http://localhost:' + (process.env.PORT || process.argv[2] || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
  // 메뉴 링크를 누르므로 세로 메뉴로
  await ctx.addInitScript(() => { try { localStorage.setItem('hs-nav-h', 'v'); } catch (e) { /* 무시 */ } });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const login = async (id, pw) => { await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForTimeout(1200); };
  await login('admin', 'admin1234');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(600);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));

  // 시험용 사용자 둘 만들기
  const made = await pg.evaluate(async () => {
    const mk = (lid, nm) => HS.db.rpc('erp_add_user', { p_login_id: lid, p_password: 'abcd1234!', p_name: nm, p_role: 'staff', p_dept: '현장', p_title: '사원', p_phone: '010-0000-0001', p_teams: ['정상1팀'] });
    const a = await mk('tuser1', '점검사람'); const c = await mk('tuser2', '지울사람');
    await HS.loadRefs(); return { a, c };
  });
  ok(made.a && made.a.id, '① 시험용 사용자 2명 만듦');

  await pg.goto(URL + '#/users'); await pg.waitForSelector('#body table', { timeout: 20000 }); await pg.waitForTimeout(700);
  const t0 = flat(await pg.textContent('#body'));
  ok(/점검사람/.test(t0) && /tuser1/.test(t0), '① 사용자 표에 보임');
  ok(/이름을 누르면/.test(t0), '① 이름을 누르면 고칠 수 있다고 안내');

  // ---------- 모달 열기 ----------
  const open = async (nm) => { await pg.click('#body tr:has-text("' + nm + '")'); await pg.waitForSelector('.modal', { timeout: 8000 }); await pg.waitForTimeout(300); };
  await open('점검사람');
  const m0 = flat(await pg.textContent('.modal'));
  ok(/아이디/.test(m0) && /비밀번호 바꾸기/.test(m0), '② 모달에 아이디 칸 · 비밀번호 바꾸기 단추');
  ok(/연락처/.test(m0) && /담당 팀/.test(m0), '② 연락처 · 담당 팀도 그 자리에');
  ok(await pg.$eval('.modal #u7', (e) => e.value) === 'tuser1', '② 아이디 칸에 지금 아이디');

  // ---------- 아이디 · 연락처 · 담당 팀 바꾸기 ----------
  await pg.fill('.modal #u7', 'tuser9');
  await pg.fill('.modal #u6', '010-5555-6666');
  await pg.click('.modal #tc .chip:has-text("입고반품팀")');
  await pg.click('.modal .mf button:has-text("저장")'); await pg.waitForTimeout(1800);
  const p1 = await pg.evaluate(() => HS.db.list('erp_profiles', { eq: { name: '점검사람' } }).then((r) => r[0]));
  ok(p1 && p1.login_id === 'tuser9', '③ 아이디가 바뀜 (' + (p1 ? p1.login_id : '없음') + ')');
  ok(p1 && p1.phone === '010-5555-6666', '③ 연락처가 바뀜');
  ok(p1 && (p1.teams || []).indexOf('입고반품팀') >= 0 && (p1.teams || []).indexOf('정상1팀') >= 0, '③ 담당 팀이 둘로 늘어남 (' + (p1 ? (p1.teams || []).join(',') : '') + ')');
  const t1 = flat(await pg.textContent('#body table'));
  ok(/tuser9/.test(t1) && !/tuser1\b/.test(t1), '③ 표에도 새 아이디로 보임');

  // 이미 있는 아이디로는 못 바꿈
  await open('점검사람');
  await pg.fill('.modal #u7', 'admin');
  await pg.click('.modal .mf button:has-text("저장")'); await pg.waitForTimeout(1200);
  ok(/이미 있는 아이디/.test(flat(await pg.textContent('#toasts'))), '③ 이미 있는 아이디는 막힘');
  await pg.click('.modal .mf button:has-text("취소")'); await pg.waitForTimeout(400);

  // ---------- 비밀번호 바꾸기 ----------
  await open('점검사람');
  await pg.click('.modal #upw'); await pg.waitForTimeout(500);
  const pm = () => pg.locator('.modal-bg').last();
  ok(/비밀번호 바꾸기/.test(flat(await pm().textContent())), '④ 비밀번호 창이 열림');
  await pm().locator('#p1').fill('newpass123'); await pm().locator('#p2').fill('다른거12345');
  await pm().locator('.mf button:has-text("바꾸기")').click(); await pg.waitForTimeout(900);
  ok(/두 칸이 다릅니다/.test(flat(await pg.textContent('#toasts'))), '④ 두 칸이 다르면 막힘');
  await pm().locator('#p1').fill('short'); await pm().locator('#p2').fill('short');
  await pm().locator('.mf button:has-text("바꾸기")').click(); await pg.waitForTimeout(900);
  ok(/8자 이상/.test(flat(await pg.textContent('#toasts'))), '④ 8자 미만은 막힘');
  await pm().locator('#p1').fill('newpass123'); await pm().locator('#p2').fill('newpass123');
  await pm().locator('.mf button:has-text("바꾸기")').click(); await pg.waitForTimeout(1200);
  ok(/비밀번호를 바꿨습니다/.test(flat(await pg.textContent('#toasts'))), '④ 비밀번호가 바뀜');
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));

  // 새 비밀번호로 실제 로그인되는지
  await pg.evaluate(() => HS.db.logout()); await pg.waitForTimeout(500);
  await login('tuser9', 'newpass123');
  ok(await pg.evaluate(() => !!(HS.me && HS.me.active)), '④ 바꾼 비밀번호로 로그인됨');
  ok(!(await pg.$('#body .card h3:has-text("사용자")')) || !(await pg.evaluate(() => HS.can('users', 'edit'))), '④ 실무진에게는 사용자 수정 권한이 없음');
  await pg.evaluate(() => HS.db.logout()); await pg.waitForTimeout(500);
  await login('admin', 'admin1234');

  // ---------- 삭제 ----------
  await pg.goto(URL + '#/users'); await pg.waitForSelector('#body table', { timeout: 20000 }); await pg.waitForTimeout(700);
  await open('지울사람');
  await pg.click('.modal .mf button:has-text("삭제")'); await pg.waitForTimeout(600);
  const d0 = flat(await pm().textContent());
  ok(/완전히 지웁니다/.test(d0) && /되돌릴 수 없습니다/.test(d0), '⑤ 지우기 전에 무엇이 일어나는지 알려 줌');
  ok(/자료는 그대로 남습니다/.test(d0), '⑤ 쓴 자료는 남는다고 알려 줌');
  // 이름을 틀리게 적으면 막힘
  await pm().locator('#dn').fill('딴이름');
  await pm().locator('.mf button:has-text("완전히 삭제")').click(); await pg.waitForTimeout(900);
  ok(/이름이 다릅니다/.test(flat(await pg.textContent('#toasts'))), '⑤ 이름을 그대로 적지 않으면 막힘');
  // 사용 중지로 바꾸기
  await pm().locator('.mf button:has-text("사용 중지로 바꾸기")').click(); await pg.waitForTimeout(1500);
  const off = await pg.evaluate(() => HS.db.list('erp_profiles', { eq: { name: '지울사람' } }).then((r) => r[0]));
  ok(off && off.active === false, '⑤ [사용 중지로 바꾸기] 로 지우지 않고 막을 수 있음');
  // 완전 삭제
  await open('지울사람');
  await pg.click('.modal .mf button:has-text("삭제")'); await pg.waitForTimeout(600);
  await pm().locator('#dn').fill('지울사람');
  await pm().locator('.mf button:has-text("완전히 삭제")').click(); await pg.waitForTimeout(2000);
  const gone = await pg.evaluate(async () => ({
    left: (await HS.db.list('erp_profiles', { eq: { name: '지울사람' } })).length,
    g: (await HS.db.list('erp_gone_user', {}))[0] || null,
  }));
  ok(gone.left === 0, '⑥ 사용자가 명단에서 사라짐');
  ok(gone.g && gone.g.name === '지울사람' && gone.g.login_id === 'tuser2', '⑥ [지난 사람] 에 이름 · 아이디가 남음');
  ok(await pg.evaluate((id) => HS.who(id) === '지울사람', made.c.id), '⑥ 옛 자료의 작성자 이름(HS.who)이 그대로 나옴');
  const t2 = flat(await pg.textContent('#body'));
  ok(/지난 사람 1명/.test(t2) && /지울사람/.test(t2), '⑥ 화면 아래 [지난 사람] 칸에 보임 · ' + (t2.match(/지난 사람[^·]{0,40}/) || [''])[0]);
  ok(!/tuser2/.test(flat(await pg.textContent('#body table'))), '⑥ 사용자 표에는 더 이상 없음');
  // 지운 아이디를 다시 쓸 수 있다
  const again = await pg.evaluate(() => HS.db.rpc('erp_add_user', { p_login_id: 'tuser2', p_password: 'abcd1234!', p_name: '새사람', p_role: 'staff', p_teams: [] }).then(() => 'ok').catch((e) => e.message));
  ok(again === 'ok', '⑥ 지운 아이디를 다시 쓸 수 있음 · ' + again);
  // 자기 자신은 못 지움
  const self = await pg.evaluate(() => HS.db.rpc('erp_del_user', { p_id: HS.me.id, p_name: HS.me.name }).then(() => '지워짐').catch((e) => e.message));
  ok(/자기 자신/.test(self), '⑥ 자기 자신은 못 지움 · ' + self);

  // ---------- 권한 ----------
  await pg.evaluate(() => HS.db.logout()); await pg.waitForTimeout(500);
  await login('leader', '1234');
  const no = await pg.evaluate(async () => {
    const r = {};
    r.canEdit = HS.can('users', 'edit'); r.canDel = HS.can('users', 'delete');
    r.pw = await HS.db.rpc('erp_set_password', { p_id: HS.me.id, p_password: 'abcd12345' }).then(() => '됨').catch((e) => e.message);
    r.lid = await HS.db.rpc('erp_set_login_id', { p_id: HS.me.id, p_login_id: 'leader2' }).then(() => '됨').catch((e) => e.message);
    return r;
  });
  ok(!no.canEdit && !no.canDel, '⑦ 팀장에게는 사용자 수정 · 삭제 권한이 없음');
  ok(/권한이 없습니다/.test(no.pw), '⑦ 팀장이 직접 불러도 비밀번호 못 바꿈 · ' + no.pw);
  ok(/권한이 없습니다/.test(no.lid), '⑦ 팀장이 직접 불러도 아이디 못 바꿈');

  // 일부러 낸 오류(막힘 안내)는 빼고 본다
  const real = errs.filter((e) => !/두 칸이 다릅니다|8자 이상|이미 있는 아이디|이름이 다릅니다|권한이 없습니다|자기 자신/.test(e));
  console.log(real.length ? 'FAIL page errors:\n' + real.join('\n') : 'no page errors');
  if (real.length) process.exitCode = 1;
  await b.close();
})();
