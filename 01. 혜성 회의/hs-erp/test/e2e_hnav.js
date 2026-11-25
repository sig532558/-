// PC 가로 메뉴 점검 (2026-11-18 · 사이트 점검 ④)
//  · 1440px = 위쪽 가로 메뉴 · 마우스 올리면 펼침 · 눌러서 이동 · [세로 메뉴로] 되돌리기
//  · 1000px · 휴대폰 = 예전 세로 메뉴 그대로 (☰)
const { chromium } = require('playwright'); const PORT = process.argv[2] || process.env.PORT || 8766; const URL = 'http://localhost:' + PORT + '/';
const SHOT = process.env.SHOT; // 사진 저장 폴더 (없으면 안 찍음)
let fail = 0; const ok = (c, t) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + t); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.evaluate(() => { try { localStorage.removeItem('hs-nav-h'); } catch (e) {} });
  await pg.evaluate(() => { location.hash = '#/notice'; }); await pg.waitForTimeout(1200);
  ok(await pg.evaluate(() => document.getElementById('app').classList.contains('hnav')), '1440px: 가로 메뉴');
  const geo = await pg.evaluate(() => { const s = document.querySelector('.side').getBoundingClientRect(); const t = document.querySelector('.top').getBoundingClientRect(); return { sw: s.width, sh: s.height, tt: t.top, sb: s.bottom }; });
  ok(geo.sw > 1300 && geo.sh < 110, '메뉴가 위쪽 한 줄 (폭 ' + Math.round(geo.sw) + ' · 높이 ' + Math.round(geo.sh) + ')');
  ok(Math.abs(geo.tt - geo.sb) < 2, '제목 줄이 메뉴 바로 아래');
  ok(await pg.evaluate(() => [...document.querySelectorAll('.nav .gi')].every((g) => getComputedStyle(g).display === 'none')), '처음엔 하위 메뉴가 접혀 있음');
  // 마우스 올리면 펼침
  const gh = await pg.$('.nav .ng[data-g="전산자료"] > .gh'); await gh.hover(); await pg.waitForTimeout(200);
  ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.nav .ng[data-g="전산자료"] .gi')).display === 'block'), '묶음에 마우스 올리면 아래로 펼침');
  if (SHOT) await pg.screenshot({ path: SHOT + '/hnav_1440.png' });
  await pg.click('.nav .ng[data-g="전산자료"] .gi a:has-text("WMS 재고 현황")'); await pg.waitForTimeout(1200);
  ok(/#\/cs\?k=wms/.test(await pg.evaluate(() => location.hash)), '하위 메뉴 눌러 이동');
  await pg.mouse.move(700, 600); await pg.waitForTimeout(200);
  ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.nav .ng[data-g="전산자료"] .gi')).display === 'none'), '이동 뒤 펼침 닫힘');
  ok(await pg.evaluate(() => { const g = document.querySelector('.nav .ng[data-g="전산자료"] > .gh'); return getComputedStyle(g).boxShadow.indexOf('inset') >= 0; }), '지금 화면의 묶음에 금색 밑줄');
  // 눌러서 펼치기 (마우스 없는 노트북 터치)
  await pg.evaluate(() => document.querySelector('.nav .ng[data-g="설정"] > .gh').click()); await pg.waitForTimeout(150);
  ok(await pg.evaluate(() => document.querySelector('.nav .ng[data-g="설정"]').classList.contains('hopen')), '묶음을 누르면 펼침');
  const inView = await pg.evaluate(() => { const r = document.querySelector('.nav .ng[data-g="설정"] .gi').getBoundingClientRect(); return r.right <= innerWidth + 1 && r.left >= 0; });
  ok(inView, '오른쪽 끝 묶음도 화면 안에 펼침');
  await pg.mouse.click(700, 600); await pg.waitForTimeout(150);
  ok(await pg.evaluate(() => !document.querySelector('.nav .ng.hopen')), '바깥 누르면 닫힘');
  // 아래로 내려도 메뉴 · 제목 줄이 위에 붙어 있음
  await pg.evaluate(() => { location.hash = '#/meeting?m=2026-10'; }); await pg.waitForSelector('#ms-cost', { timeout: 20000 });
  await pg.evaluate(() => window.scrollTo(0, 3000)); await pg.waitForTimeout(300);
  const st = await pg.evaluate(() => ({ s: document.querySelector('.side').getBoundingClientRect().top, t: document.querySelector('.top').getBoundingClientRect().top, h: document.querySelector('.side').offsetHeight }));
  ok(st.s === 0 && Math.abs(st.t - st.h) < 2, '내려도 메뉴 · 제목 줄이 위에 고정');
  // 세로 메뉴로 되돌리기
  await pg.evaluate(() => window.scrollTo(0, 0));
  await pg.click('#navh'); await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => !document.getElementById('app').classList.contains('hnav') && document.querySelector('.side').getBoundingClientRect().width < 260), '[세로 메뉴로] 누르면 예전 세로 메뉴');
  await pg.reload(); await pg.waitForSelector('#body'); await pg.waitForTimeout(800);
  ok(await pg.evaluate(() => !document.getElementById('app').classList.contains('hnav')), '새로고침해도 세로 유지 (이 브라우저 기억)');
  await pg.click('#navh'); await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => document.getElementById('app').classList.contains('hnav')), '[가로 메뉴로] 다시 가로');
  // 좁은 창 · 휴대폰은 그대로
  await pg.setViewportSize({ width: 1000, height: 800 }); await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => !document.getElementById('app').classList.contains('hnav')), '1000px 창은 세로 메뉴 그대로');
  await pg.setViewportSize({ width: 375, height: 800 }); await pg.waitForTimeout(300);
  const mob = await pg.evaluate(() => ({ h: document.getElementById('app').classList.contains('hnav'), bg: getComputedStyle(document.getElementById('burger')).display, nvh: getComputedStyle(document.querySelector('.nvh')).display }));
  ok(!mob.h && mob.bg !== 'none' && mob.nvh === 'none', '휴대폰은 ☰ 그대로 · 가로/세로 단추 안 보임');
  if (SHOT) { await pg.setViewportSize({ width: 1440, height: 900 }); await pg.evaluate(() => { location.hash = '#/meeting?m=2026-10'; }); await pg.waitForTimeout(1500); await pg.screenshot({ path: SHOT + '/hnav_meet.png' }); }
  console.log(errs.length ? '에러: ' + errs.join(' | ') : 'no page errors');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
