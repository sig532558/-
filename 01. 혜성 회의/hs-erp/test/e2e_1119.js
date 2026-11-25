// 2026-11-18 (1119) 행님 지시 4가지 점검
//  ① 가로 메뉴 펼침에 흰 점선 상자(엑셀 놓는 칸 모양)가 붙지 않음 — 클래스 이름 drop → hopen
//  ② 계획 수립: 작업 지우기 ✕ 가 가로로 밀지 않아도 보임 + [작업 삭제] 로 여러 개 한 번에
//  ③ 수정 이력: 오래된 이력 자동 지우기 (기본 2년 · 기억 · 지금 지우기)
//  ④ 저장 공간: 백업 받기 (엑셀 · JSON · 안성 열쇠는 담지 않음)
const { chromium } = require('playwright');
const URL = 'http://localhost:' + (process.env.PORT || process.argv[2] || 8766) + '/'; const FX = __dirname + '/fx/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const TMP = require('os').tmpdir();

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/권한이 없습니다|이미 있습니다|지울 작업을 고르세요/.test(m.text())) errs.push('console: ' + m.text()); });
  const login = async () => { await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(900); };
  await login();

  // ---------- ① 가로 메뉴 펼침 ----------
  const gh = await pg.$$('.nav .ng .gh');
  await pg.mouse.move(5, 600); await gh[3].click(); await pg.waitForTimeout(400); await pg.mouse.move(5, 600); await pg.waitForTimeout(300);
  const nav = await pg.evaluate(() => {
    const g = [...document.querySelectorAll('.nav .ng')].find((x) => x.classList.contains('hopen'));
    if (!g) return null; const cs = getComputedStyle(g); const gi = getComputedStyle(g.querySelector('.gi'));
    return { cls: g.className, bg: cs.backgroundColor, border: cs.borderStyle, pad: cs.padding, giBg: gi.backgroundColor, giShow: gi.display, anyDrop: !!document.querySelector('.nav .ng.drop') };
  });
  ok(!!nav, '묶음을 누르면 펼쳐짐 (hopen)');
  ok(nav && !nav.anyDrop, "메뉴에 drop (엑셀 놓는 칸) 이름을 쓰지 않음");
  ok(nav && /rgba\(0, 0, 0, 0\)|transparent/.test(nav.bg), '펼친 묶음에 흰 바탕 없음 (' + (nav || {}).bg + ')');
  ok(nav && !/dashed/.test(nav.border), '펼친 묶음에 점선 테두리 없음 (' + (nav || {}).border + ')');
  ok(nav && nav.giShow === 'block' && /15, 30, 61/.test(nav.giBg), '펼침 칸은 예전처럼 남색 (' + (nav || {}).giBg + ')');

  // ---------- ③ 수정 이력 자동 지우기 ----------
  await ctx.addInitScript(() => { try { localStorage.setItem('hs-nav-h', 'v'); } catch (e) {} });
  await pg.goto(URL + '#/users?k=audit'); await pg.waitForTimeout(1200);
  ok(!!(await pg.$('#am')), '수정 이력에 자동 지우기 줄이 있음');
  ok((await pg.$eval('#am', (e) => e.value)) === '24', '기본은 2년 (지금 ' + (await pg.$eval('#am', (e) => e.value)) + '개월)');
  ok(/수정 이력만 지웁니다/.test(await pg.textContent('#body')), '업무 자료는 건드리지 않는다고 알려 줌');
  await pg.selectOption('#am', '12'); await pg.waitForTimeout(700);
  const saved = await pg.evaluate(async () => (await HS.db.list('erp_settings', { eq: { key: 'audit_keep_months' } }))[0]);
  ok(saved && +saved.value.months === 12, '고른 기간이 저장됨 (' + JSON.stringify(saved && saved.value) + ')');
  await pg.waitForTimeout(700); await pg.reload(); await pg.waitForTimeout(1500);
  ok((await pg.$eval('#am', (e) => e.value)) === '12', '다시 열어도 고른 기간 그대로');
  // 2년 지난 가짜 이력 → [지금 지우기]
  await pg.selectOption('#am', '24'); await pg.waitForTimeout(600);
  const made = await pg.evaluate(async () => {
    const old = new Date(); old.setFullYear(old.getFullYear() - 3);
    await HS.db.insert('erp_audit', { tbl: 'erp_worklog', row_key: '옛날', action: 'UPDATE', before: {}, after: {}, at: old.toISOString() }).catch(() => {});
    return (await HS.db.rpc('erp_audit_trim_info')).old;
  });
  ok(made >= 1, '3년 전 이력을 지울 것으로 셈 (' + made + '건)');
  await pg.waitForTimeout(700); await pg.reload(); await pg.waitForTimeout(1500);
  await pg.click('#ax'); await pg.waitForTimeout(500);
  ok(/되돌릴 수 없습니다/.test(await pg.textContent('.modal')), '[지금 지우기] 는 먼저 물어봄');
  await pg.click('.modal .btn.p'); await pg.waitForTimeout(1500);
  const left = await pg.evaluate(async () => (await HS.db.rpc('erp_audit_trim_info')).old);
  ok(left === 0, '지운 뒤 2년 지난 이력 0건 (' + left + ')');

  // ---------- ④ 백업 받기 ----------
  await pg.goto(URL + '#/storage'); await pg.waitForTimeout(2500);
  ok(!!(await pg.$('#bj')), '저장 공간에 백업 받기 칸이 있음');
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 90000 }), pg.click('#bj')]);
  const jp = TMP + '/hs_backup.json'; await dl.saveAs(jp);
  ok(/혜성물류_백업_\d{4}-\d{2}-\d{2}\.json/.test(dl.suggestedFilename()), '파일 이름에 날짜 (' + dl.suggestedFilename() + ')');
  const js = JSON.parse(require('fs').readFileSync(jp, 'utf8'));
  const tn = Object.keys(js.tables || {});
  ok(tn.length >= 5, '표 ' + tn.length + '개가 담김');
  ok(tn.indexOf('erp_secret') < 0, '안성 연동 열쇠(erp_secret)는 담기지 않음');
  ok(!!js.made_at && js.site === '혜성물류 회의자료', '언제 받았는지 같이 적힘');
  ok(/표 \d+개 · [\d,]+줄을 받았습니다/.test(await pg.textContent('#bp')), '다 받으면 몇 줄인지 알려 줌');
  const [dx] = await Promise.all([pg.waitForEvent('download', { timeout: 120000 }), pg.click('#bx')]);
  const xp = TMP + '/hs_backup.xlsx'; await dx.saveAs(xp);
  const wb = require('xlsx').readFile(xp);
  ok(wb.SheetNames.length >= 5, '엑셀은 표마다 시트 (' + wb.SheetNames.length + '개)');
  ok(wb.SheetNames.every((n) => n.length <= 31) && new Set(wb.SheetNames).size === wb.SheetNames.length, '시트 이름이 겹치지 않고 31자 이하');

  // ② 계획 수립 작업 삭제 점검은 2026-11-23 시즌 계획 폐기와 함께 뺌

  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
