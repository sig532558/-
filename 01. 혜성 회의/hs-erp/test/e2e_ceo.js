// 🔒 대표님 지시 · 할 일 — 처음 시작 · 명단(사람 단위 권한) · 지시 · 할 일 · 자동 완료 · 권한 없는 사람 차단
const { chromium } = require('playwright'); const fs = require('fs');
const URL = 'http://localhost:' + (process.env.PORT || process.argv[2] || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; fs.mkdirSync(SH, { recursive: true });

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } }); await ctx.addInitScript(() => { try { localStorage.setItem('hs-nav-h', 'v'); } catch (e) { /* 무시 */ } }); /* 세로 메뉴로 점검 (가로 메뉴는 e2e_hnav) */ const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.addInitScript(() => { const T = new Date('2026-11-18T10:00:00').getTime(); const D = Date; class FD extends D { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } } window.Date = FD; });
  const login = async (id, pw) => {
    await pg.goto(URL); await pg.waitForTimeout(400);
    if (!(await pg.$('#lid'))) { await pg.evaluate(async () => { await HS.db.logout(); }); await pg.goto(URL + '#/'); await pg.reload(); }
    await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);
    await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  };
  const navHas = () => pg.evaluate(() => !!document.querySelector('.nav .ng.ceo') && /대표님 지시/.test(document.querySelector('.nav').textContent));
  const logout = async () => { await pg.evaluate(async () => { await HS.db.logout(); }); };

  // 시험 계정: 대표님(대표 등급) · 두 번째 관리자 — 명단이 비어 있는 처음 상태로
  await login('admin', 'admin1234');
  await pg.evaluate(async () => {
    for (const r of await HS.db.list('erp_ceo_items', {}).catch(() => [])) await HS.db.remove('erp_ceo_items', { id: r.id }).catch(() => {});
    await HS.db.upsert('erp_profiles', [{ id: 'u-ceo', login_id: 'ceo', password: '1234', name: '대표님', role_id: 'ceo', teams: [], active: true },
      { id: 'u-adm2', login_id: 'adm2', password: '1234', name: '관리자둘', role_id: 'admin', teams: [], active: true }]);
    await HS.loadRefs();
  });
  await pg.waitForTimeout(900); // 로컬 모드는 0.3초 뒤에 저장 — 새로고침 전에 기다림
  ok(!(await pg.evaluate(() => HS.ceo.ok)), '처음에는 명단이 비어 있음');

  // ① 업데이트 직후 — 관리자에게는 메뉴가 보이고, 들어가면 '처음 시작' 화면
  await pg.goto(URL + '#/meeting'); await pg.reload(); await pg.waitForSelector('#body'); await pg.waitForTimeout(1500);
  ok(await navHas(), '명단이 비어 있을 때 관리자에게 🔒 대표님 지시 메뉴가 보임');
  await pg.click('.nav .ng.ceo a[data-v="ceo"]'); await pg.waitForTimeout(1500);
  let t = (await pg.textContent('#body')).replace(/\s+/g, ' ');
  ok(/처음 시작/.test(t) && !!(await pg.$('#cbs')), "'처음 시작' 화면 + [나를 고정 인원으로 넣고 시작] 버튼");
  await pg.screenshot({ path: SH + 'ceo_0start.png' });

  // ② 지원 · 사원은 처음 상태에서도 메뉴가 안 보이고 주소로도 못 들어감
  await logout(); await login('staff', '1234');
  ok(!(await navHas()), '사원에게는 메뉴가 안 보임 (처음 상태)');
  await pg.goto(URL + '#/ceo'); await pg.waitForTimeout(1500);
  ok(!/#\/ceo/.test(await pg.evaluate(() => location.hash)), '사원이 주소로 들어가도 첫 화면으로 돌려보냄');

  // ③ 관리자가 시작 → 바로 지시 화면
  await logout(); await login('admin', 'admin1234');
  await pg.goto(URL + '#/ceo'); await pg.waitForTimeout(1500);
  await pg.click('#cbs'); await pg.waitForTimeout(2500);
  ok(await pg.evaluate(() => HS.ceo.ok && HS.ceo.fixed && HS.ceo.write), '시작 → 본인이 고정 인원 (보기 · 쓰기)');
  t = (await pg.textContent('#body')).replace(/\s+/g, ' ');
  ok(/진행 중 지시/.test(t) && /이번 주 기한/.test(t) && /기한 지남/.test(t) && /11월 완료/.test(t), '지시 화면 — 요약 네 칸');
  ok(!!(await pg.$('#tools button:has-text("+ 지시 등록")')) && !!(await pg.$('#tools button:has-text("엑셀")')), '[+ 지시 등록] · [엑셀] 버튼');

  // ④ 명단: 대표님(고정) · 팀장(보기만) 추가
  await pg.click('#tools .ceo-lock'); await pg.waitForSelector('.modal .ceo-mem');
  await pg.selectOption('.modal #cpu', 'u-ceo'); await pg.check('.modal #cpf');
  pg.once('dialog', (d) => d.accept());
  await pg.click('.modal #cpa'); await pg.waitForTimeout(400);
  if (await pg.$('.modal-bg .modal:has-text("고정 인원으로 넣을까요")')) { await pg.click('.modal-bg:last-of-type .mf .btn.p'); }
  await pg.waitForTimeout(1200);
  const leadId = await pg.evaluate(() => (HS.cache.people.find((p) => p.role_id === 'leader') || {}).id);
  await pg.selectOption('.modal #cpu', leadId); await pg.selectOption('.modal #cpw', '0'); await pg.click('.modal #cpa'); await pg.waitForTimeout(1200);
  const M = await pg.evaluate(async () => (await HS.db.list('erp_ceo_members', {})).map((m) => ({ u: m.user_id, w: m.can_write, f: m.fixed })));
  ok(M.length === 3 && M.some((m) => m.u === 'u-ceo' && m.f && m.w) && M.some((m) => m.u === leadId && !m.f && !m.w), '명단 3명 — 나(고정) · 대표님(고정) · 팀장(보기만) ' + JSON.stringify(M));
  const rows = await pg.$$eval('.modal .ceo-mem tr[data-u]', (x) => x.map((r) => ({ u: r.dataset.u, ed: !!r.querySelector('.ctg[data-a]') })));
  ok(rows.filter((r) => r.u === 'u-ceo' || r.u === rows[0].u).every((r) => !r.ed || r.u === leadId), '고정 인원 줄에는 끄는 스위치가 없음');
  ok(rows.some((r) => r.u === leadId && r.ed), '고정이 아닌 팀장 줄은 바꿀 수 있음');
  await pg.click('.modal .mf .btn'); await pg.waitForTimeout(1200);

  // ⑤ 지시 등록
  await pg.click('#tools button:has-text("+ 지시 등록")'); await pg.waitForSelector('.modal #ct');
  await pg.fill('.modal #ct', '런닝 품번은 반품 빼고 매장 운영'); await pg.fill('.modal #cn', '정상팀 · 이월팀 같이');
  await pg.fill('.modal #cu', '2026-11-20');
  const tm = await pg.$$('.modal .ctm input'); if (tm[0]) await tm[0].check();
  await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(1500);
  t = (await pg.textContent('#body')).replace(/\s+/g, ' ');
  ok(/런닝 품번은 반품 빼고 매장 운영/.test(await pg.textContent('.ceo-r')), '지시가 오른쪽 지시 묶음에 나옴');
  ok(!!(await pg.$('.cdir.on')) && !!(await pg.$('.ceo-flt [data-undir]')), '등록한 지시를 골라 둠 (왼쪽은 그 지시의 할 일만)');
  ok(!!(await pg.$('.cquick .seg2 span.on[data-qk="dir"]')) && !!(await pg.$('#qd')), "빠른 추가가 '대표님 지시' 로 · 그 지시가 골라져 있음");
  // ⑥ 할 일 두 개 추가 (Enter 로 하나 · 버튼으로 하나) → 둘 다 체크 → 지시가 자동으로 완료
  await pg.fill('#qt', '런닝 품번 정리 계획에 등록'); await pg.fill('#qo', '물류관리팀'); await pg.press('#qt', 'Enter'); await pg.waitForTimeout(1300);
  await pg.fill('#qt', '매장별 런닝 수량 맞춰 보기'); await pg.fill('#qo', '정상팀'); await pg.fill('#qu', '2026-11-20'); await pg.click('#qa'); await pg.waitForTimeout(1300);
  ok((await pg.$$('.ceo-l .ctd2')).length === 2, '할 일 2개 (왼쪽 목록)');
  t = (await pg.textContent('.ceo-l')).replace(/\s+/g, ' ');
  ok(/대표님 지시/.test(t) && /↳ 런닝 품번은 반품 빼고/.test(t), "줄마다 [대표님 지시] 꼬리표 · 어느 지시인지");
  ok(/이번 주/.test(t) && /기한 없음/.test(t), '날짜별로 묶임 (이번 주 · 기한 없음)');
  ok(/0 \/ 2/.test((await pg.textContent('.cdir.on')).replace(/\s+/g, ' ')), '오른쪽 지시 진행률 0 / 2');
  await pg.click('.ceo-l .ctd2 >> nth=0 >> [data-ck]'); await pg.waitForTimeout(1300);
  ok(/1 \/ 2/.test((await pg.textContent('.cdir.on')).replace(/\s+/g, ' ')), '하나 체크 → 1 / 2');
  await pg.click('.ceo-l .ctd2:not(.dn) >> [data-ck]'); await pg.waitForTimeout(1500);
  const D1 = await pg.evaluate(async () => (await HS.db.list('erp_ceo_items', { eq: { kind: 'dir' } }))[0]);
  ok(D1 && D1.state === '완료' && D1.done_at === '2026-11-18', '할 일을 다 끝내면 지시가 자동으로 완료 (' + (D1 || {}).state + ')');
  ok(!(await pg.$('.ceo-r .cdir')), "지시 묶음 기본(새로 받음 · 진행 중)에서는 완료된 지시가 숨음");
  ok(/끝낸 것 2개/.test(await pg.textContent('.ceo-l')), "끝낸 할 일은 '끝낸 것 2개' 로 접힘");
  await pg.click('.ceo-r [data-st="완료"]'); await pg.waitForTimeout(500);
  ok(/완료/.test((await pg.textContent('.ceo-r .cdir')).replace(/\s+/g, ' ')), "지시 상태 칩에서 '완료' 를 켜면 보임");
  // 끝낸 것을 펼쳐 하나를 다시 풀면 진행 중으로
  await pg.click('#cfd'); await pg.waitForTimeout(300);
  await pg.click('.ceo-l .ctd2.dn >> nth=0 >> [data-ck]'); await pg.waitForTimeout(1500);
  ok((await pg.evaluate(async () => (await HS.db.list('erp_ceo_items', { eq: { kind: 'dir' } }))[0].state)) === '진행 중', '할 일을 다시 풀면 지시가 진행 중으로');
  // ⑦ 내 할 일 · 기한 지난 것 (지시 고른 것 풀고)
  await pg.click('.ceo-flt [data-undir]'); await pg.waitForTimeout(400);
  await pg.click('.cquick [data-qk="mine"]'); await pg.waitForTimeout(300);
  await pg.fill('#qt', '안성센터 API 표 확인'); await pg.fill('#qu', '2026-11-15'); await pg.press('#qt', 'Enter'); await pg.waitForTimeout(1300);
  t = (await pg.textContent('.ceo-l')).replace(/\s+/g, ' ');
  ok(/내 할 일/.test(t) && /안성센터 API 표 확인/.test(t), '내 할 일 추가 ([내 할 일] 꼬리표)');
  ok(/⚠ 기한 지남/.test(t) && /3일/.test(t), "'⚠ 기한 지남' 묶음 · 3일 지남");
  ok((await pg.$eval('.ceo-k .kpi.r .v', (e) => e.textContent.trim())) === '1', '맨 위 기한 지남 1');

  // ⑧ 구글 캘린더 — ① 줄마다 일정 추가 창 (주소 확인) · 보낼 내용 세 가지
  // 캘린더를 확인할 '매장별 …' 줄이 끝낸 것에 들어가 있으면 다시 열어 둠
  await pg.evaluate(async () => { const r = (await HS.db.list('erp_ceo_items', {})).find((x) => x.title === '매장별 런닝 수량 맞춰 보기'); if (r && r.done) await HS.db.upsert('erp_ceo_items', [Object.assign({}, r, { done: false, done_at: null })]); });
  await pg.goto(URL + '#/'); await pg.goto(URL + '#/ceo'); await pg.waitForTimeout(1500);
  await pg.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
  const rowOf = (txt) => pg.$('.ceo-l .ctd2:not(.dn):has-text("' + txt + '")');
  await (await (await rowOf('안성센터 API 표 확인')).$('[data-cal]')).click(); await pg.waitForTimeout(400);
  let u = await pg.evaluate(() => window.__opened.pop() || '');
  ok(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/.test(u), '📅 → 구글 캘린더 일정 추가 창');
  ok(/dates=20261115\/20261116/.test(u) && decodeURIComponent(u).indexOf('[내 할 일] 안성센터 API 표 확인') > 0, '제목 · 날짜(종일)가 채워짐');
  ok(!/details=/.test(u), "기본 '제목 + 날짜만' — 설명은 안 보냄");
  ok(/✓ 캘린더/.test(await (await rowOf('안성센터 API 표 확인')).textContent()), '넣은 줄은 ✓ 캘린더 로 바뀜');
  await pg.click('#tools button:has-text("캘린더 설정")'); await pg.waitForSelector('.modal .opt2');
  await pg.check('.modal input[value="full"]'); await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(500);
  await (await (await rowOf('매장별 런닝 수량 맞춰 보기')).$('[data-cal]')).click(); await pg.waitForTimeout(400);
  u = decodeURIComponent(await pg.evaluate(() => window.__opened.pop() || ''));
  ok(/details=/.test(u) && u.indexOf('담당 정상팀') > 0 && u.indexOf('[대표님 지시] 매장별 런닝 수량 맞춰 보기') > 0, "'제목 + 날짜 + 담당 · 메모' 로 바꾸면 설명에 담당이 들어감");
  await pg.click('#tools button:has-text("캘린더 설정")'); await pg.waitForSelector('.modal .opt2');
  await pg.check('.modal input[value="hide"]'); await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(500);
  await (await (await rowOf('매장별 런닝 수량 맞춰 보기')).$('[data-cal]')).click(); await pg.waitForTimeout(400);
  u = decodeURIComponent(await pg.evaluate(() => window.__opened.pop() || ''));
  ok(u.indexOf('혜성 할 일 (11/20)') > 0 && u.indexOf('런닝') < 0, "'제목을 감춤' — 내용 없이 '혜성 할 일 (11/20)'");
  await pg.click('#tools button:has-text("캘린더 설정")'); await pg.waitForSelector('.modal .opt2');
  await pg.check('.modal input[value="title"]'); await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(500);
  // ② 한꺼번에 .ics 파일 — 하루 전 9시 알림 · 비공개 · 이미 넣은 것은 체크 빠짐
  await pg.evaluate(async () => { await HS.db.upsert('erp_ceo_items', [{ id: 'cT1', kind: 'mine', title: '12월 회의 자료, 미리 올리기', due: '2026-11-21', done: false }]); }); await pg.waitForTimeout(300);
  await pg.goto(URL + '#/'); await pg.goto(URL + '#/ceo'); await pg.waitForTimeout(1500);
  await pg.click('#calall'); await pg.waitForSelector('.modal .cpick');
  const picks = await pg.$$eval('.modal .cpick input', (x) => x.map((i) => ({ v: i.value, c: i.checked })));
  ok(picks.length === 3, '이번 주까지 할 일 3개가 목록에 (' + picks.length + ')');
  ok(picks.filter((p) => p.c).length === 1, '이미 넣은 2개는 체크가 빠져 있고 새 것 1개만 체크');
  const [dl2] = await Promise.all([pg.waitForEvent('download', { timeout: 15000 }).catch(() => null), pg.click('.modal .mf .btn.p')]);
  ok(!!dl2 && /\.ics$/.test(dl2.suggestedFilename()), '.ics 파일 받기 (' + (dl2 ? dl2.suggestedFilename() : '-') + ')');
  if (dl2) { const p2 = SH + 'ceo_test.ics'; await dl2.saveAs(p2); const ics = fs.readFileSync(p2, 'utf8');
    ok(/^BEGIN:VCALENDAR/.test(ics) && (ics.match(/BEGIN:VEVENT/g) || []).length === 1, '캘린더 파일 · 일정 1개');
    ok(/DTSTART;VALUE=DATE:20261121/.test(ics) && /DTEND;VALUE=DATE:20261122/.test(ics), '종일 일정 11/21');
    ok(/TRIGGER:-PT15H/.test(ics) && /CLASS:PRIVATE/.test(ics), '하루 전 오전 9시 알림 · 비공개');
    ok(/SUMMARY:\[내 할 일\] 12월 회의 자료\\, 미리 올리기/.test(ics), '쉼표 같은 글자도 캘린더 규칙대로 (\\,)');
    ok(/\r\n/.test(ics), '줄바꿈 CRLF (캘린더 규칙)'); }
  await pg.screenshot({ path: SH + 'ceo_1main.png', fullPage: true });
  // 엑셀
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 15000 }).catch(() => null), pg.click('#tools button:has-text("엑셀")')]);
  ok(!!dl, '엑셀 받기');
  // 사용자 · 등급 › 🔒 탭
  await pg.goto(URL + '#/users?k=ceo'); await pg.waitForTimeout(1500);
  ok((await pg.$$('.ceo-mem tr[data-u]')).length === 3, '설정 › 사용자 · 등급 › 🔒 탭에 명단 3명');

  // ⑧ 대표님 — 쓰기 가능
  await logout(); await login('ceo', '1234');
  ok(await navHas(), '대표님에게 메뉴가 보임');
  await pg.goto(URL + '#/ceo'); await pg.waitForTimeout(1500);
  ok(!!(await pg.$('#tools button:has-text("+ 지시 등록")')), '대표님은 지시 등록 가능');
  ok(/런닝 품번은 반품 빼고/.test(await pg.textContent('#body')), '대표님이 행님이 넣은 지시를 봄');
  // ⑨ 팀장 — 보기만
  await logout(); await login('leader', '1234');
  ok(await navHas(), '보기만 받은 팀장에게도 메뉴가 보임');
  await pg.goto(URL + '#/ceo'); await pg.waitForTimeout(1500);
  ok(!(await pg.$('#tools button:has-text("+ 지시 등록")')) && !(await pg.$('#qt')), '팀장은 등록 · 추가 칸 없음 (보기만)');
  ok(!!(await pg.evaluate(async () => { try { await HS.db.upsert('erp_ceo_items', [{ id: 'xx', kind: 'mine', title: '몰래' }]); return false; } catch (e) { return true; } })), '팀장이 몰래 써도 막힘');
  // ⑩ 명단에 없는 관리자 · 사원 — 메뉴 없음 · 내용 0줄
  for (const [id, pw, who] of [['adm2', '1234', '명단에 없는 관리자'], ['staff', '1234', '사원']]) {
    await logout(); await login(id, pw);
    ok(!(await navHas()), who + ' — 메뉴가 안 보임');
    ok((await pg.evaluate(async () => (await HS.db.list('erp_ceo_items', {})).length)) === 0, who + ' — 내용 0줄');
    await pg.goto(URL + '#/ceo'); await pg.waitForTimeout(1200);
    ok(!/#\/ceo/.test(await pg.evaluate(() => location.hash)), who + ' — 주소로 들어가도 돌려보냄');
  }
  // 휴대폰 화면
  await logout(); await login('admin', 'admin1234');
  await pg.setViewportSize({ width: 390, height: 844 }); await pg.goto(URL + '#/ceo'); await pg.waitForTimeout(1500);
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= 400), '휴대폰 화면 가로 넘침 없음');

  // 치우기 (다른 점검에 영향 없게)
  await pg.evaluate(async () => {
    for (const r of await HS.db.list('erp_ceo_items', {})) await HS.db.remove('erp_ceo_items', { id: r.id }).catch(() => {});
  });
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
