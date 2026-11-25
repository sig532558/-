// 휴대폰 화면 (2026-11-19 · 읽기 전용 · 홈 화면 어플)
const { chromium } = require('playwright');
const fs = require('fs');
const URL = 'http://localhost:' + (process.env.PORT || process.argv[2] || 8766) + '/';
const SITE = __dirname + '/../site/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

(async () => {
  const b = await chromium.launch(); const errs = [];
  // ---------- 어플 파일 ----------
  const mf = JSON.parse(fs.readFileSync(SITE + 'manifest.webmanifest', 'utf8'));
  ok(mf.display === 'standalone' && /#\/m/.test(mf.start_url), '어플로 열면 주소창 없이 휴대폰 화면부터 (' + mf.start_url + ')');
  ok((mf.icons || []).some((i) => i.sizes === '512x512') && (mf.icons || []).some((i) => i.purpose === 'maskable'), '아이콘 512 · 적응형(maskable) 있음');
  ['icon-180.png', 'icon-192.png', 'icon-512.png', 'sw.js'].forEach((f) => ok(fs.existsSync(SITE + f), f + ' 있음'));
  const sw = fs.readFileSync(SITE + 'sw.js', 'utf8');
  ok(/u\.origin !== self\.location\.origin\) return/.test(sw) && /html\|css\|js\|png\|webmanifest/.test(sw), '어플은 화면 파일만 저장하고 다른 곳(회사 자료)은 건드리지 않음');

  // ---------- 휴대폰 ----------
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/권한이 없습니다/.test(m.text())) errs.push('console: ' + m.text()); });
  const login = async (id, pw) => { await pg.evaluate(() => sessionStorage.clear()).catch(() => {}); await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1200); };
  await login('admin', 'admin1234');
  ok((await pg.evaluate(() => location.hash)) === '#/m', '휴대폰으로 들어오면 휴대폰 화면부터');
  const hid = await pg.evaluate(() => [getComputedStyle(document.querySelector('.side')).display, getComputedStyle(document.querySelector('.top')).display]);
  ok(hid[0] === 'none' && hid[1] === 'none', '메뉴 · 제목 줄은 숨김');
  const items = await pg.$$eval('.mitem', (xs) => xs.map((x) => x.textContent.replace(/[›\s]+$/, '').trim()));
  ok(items.length === 4 && items[0] === '일일 마감 보고', '홈에 화면 4개 (' + items.join(' · ') + ')');

  const noEdit = async (where) => {
    const n = await pg.evaluate(() => ({ b: document.querySelectorAll('#body button').length, i: document.querySelectorAll('#body input, #body select, #body textarea').length }));
    ok(n.b === 0 && n.i === 0, where + ': 고치는 단추 · 입력칸 없음 (읽기 전용)');
  };
  await noEdit('홈');

  // 일일 마감 보고
  await pg.click('.mitem >> nth=0'); await pg.waitForTimeout(1500);
  ok(/일일 마감 보고/.test(await pg.textContent('.mhd')), '일일 마감 보고로 들어감');
  await noEdit('일일 마감 보고');
  const d0 = await pg.textContent('.mnav b');
  await pg.click('.mnav span >> nth=0'); await pg.waitForTimeout(1200);
  ok((await pg.textContent('.mnav b')) !== d0, '‹ 를 누르면 하루 앞으로 (' + d0.trim() + ' → ' + (await pg.textContent('.mnav b')).trim() + ')');
  await pg.click('.mch .mc >> nth=2'); await pg.waitForTimeout(1200);
  ok(await pg.evaluate(() => [...document.querySelectorAll('.mc')][2].classList.contains('on')), '출고 · 입고 · 반품 바꿔 보기');
  await pg.click('.mbk'); await pg.waitForTimeout(1200);
  ok((await pg.$$('.mitem')).length === 4, '‹ 로 홈으로 돌아옴');

  // 출고 현황
  await pg.goto(URL + '#/m?k=ship'); await pg.waitForTimeout(1800);
  ok(!!(await pg.$('.mbig')), '출고 현황에 큰 숫자');
  await noEdit('출고 현황');
  await pg.click('.mch .mc >> nth=1'); await pg.waitForTimeout(1500);
  ok(await pg.evaluate(() => [...document.querySelectorAll('.mc')][1].classList.contains('on')), '이번 주 · 이번 달 · 연간 바꿔 보기');
  // 반품 미처리 전표 — PC 와 같은 규칙(rows 중 open 인 것)으로 세는지
  await pg.evaluate(async () => { await HS.db.upsert('erp_ret_pend', [
    { brand: '핑', req_slips: 9, req_pcs: 900, rows: [{ d: '2026-11-10', pend: 10, open: true }, { d: '2026-11-11', pend: 5, open: true }, { d: '2026-11-12', pend: 3, open: false }] },
    { brand: '마무트', req_slips: 2, req_pcs: 50, rows: [{ d: '2026-11-10', pend: 7, open: true }] }]); });
  await pg.waitForTimeout(800); // 로컬 자료는 0.3초 뒤에 저장되므로 화면을 옮기기 전에 기다림
  await pg.goto(URL + '#/m?k=ret'); await pg.waitForTimeout(1800);
  const rt = (await pg.textContent('#body')).replace(/\s+/g, ' ');
  ok(/미처리 전표 3건 · 22 PCS/.test(rt), '미처리 전표는 안 끝난 줄만 셈 (3건 · 22 PCS)');
  for (const [k, l] of [['ret', '반품 현황'], ['np', '신상품 현황']]) {
    await pg.goto(URL + '#/m?k=' + k); await pg.waitForTimeout(1500);
    ok(new RegExp(l).test(await pg.textContent('.mhd')), l + ' 열림');
    await noEdit(l);
  }
  // 2026-11-23: '이월팀 일정' 은 폐기 — 주소로 들어와도 홈으로
  await pg.goto(URL + '#/m?k=season'); await pg.reload(); await pg.waitForTimeout(1800);
  const sn = (await pg.textContent('#body')).replace(/\s+/g, ' ');
  ok(!/이월팀 일정/.test(sn), '폐기한 이월팀 일정은 안 열림');

  // 등급별 — 실무진은 자기 등급에 보이는 것만
  await login('staff', '1234');
  const si = await pg.$$eval('.mitem', (xs) => xs.map((x) => x.textContent.replace(/[›\s]+$/, '').trim()));
  ok(si.length > 0 && si.length <= 5, '실무진 홈에는 볼 수 있는 것만 (' + si.length + '개: ' + si.join(' · ') + ')');
  await pg.goto(URL + '#/m?k=ret'); await pg.waitForTimeout(1200);
  const txt = await pg.textContent('#body');
  ok(si.indexOf('반품 현황') >= 0 ? !/볼 권한이 없습니다/.test(txt) : /볼 권한이 없습니다/.test(txt), '권한 없는 화면은 주소로 들어가도 막힘');

  // PC 화면으로 · 기억
  await login('admin', 'admin1234');
  await pg.click('[data-pc]'); await pg.waitForTimeout(1500);
  ok((await pg.evaluate(() => location.hash)) !== '#/m' && (await pg.evaluate(() => getComputedStyle(document.querySelector('.side')).display)) !== 'none', '[PC 화면으로 보기] → 예전 화면');
  await pg.reload(); await pg.waitForTimeout(2000);
  ok((await pg.evaluate(() => location.hash)) !== '#/m', '다시 열어도 PC 화면 그대로 (기억)');
  await pg.evaluate(() => localStorage.removeItem('hs-pc'));

  // PC 폭에서는 저절로 휴대폰 화면이 뜨지 않음
  const c2 = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p2 = await c2.newPage();
  await p2.goto(URL); await p2.waitForSelector('#lid'); await p2.fill('#lid', 'admin'); await p2.fill('#lpw', 'admin1234'); await p2.click('#lgo'); await p2.waitForSelector('#body'); await p2.waitForTimeout(1500);
  ok((await p2.evaluate(() => location.hash)) !== '#/m', 'PC 에서는 예전 화면 그대로');
  ok(!!(await p2.$('#mgo')), 'PC 에도 [휴대폰 화면] 링크가 있음');

  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
