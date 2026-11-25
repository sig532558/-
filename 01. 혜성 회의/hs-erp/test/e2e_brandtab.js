// 기준정보 설정 > 브랜드 탭이 실제로 새 화면(brandAdmin)으로 뜨는지 점검 (2026-11-13 버그 수정)
const { chromium } = require('playwright'); const PORT = process.argv[2] || 8767; const URL = 'http://localhost:' + PORT + '/';
let fail = 0; const ok = (c, t) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + t); };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);

  // ① k 없이 그냥 #/settings 로 들어가면 (사이드바 링크가 이렇게 감) → 브랜드 탭 + 새 화면이어야 함
  await pg.evaluate(() => (location.hash = '#/settings')); await pg.waitForTimeout(300);
  await pg.evaluate(() => HS.route()); await pg.waitForTimeout(1500);
  const t1 = await pg.textContent('#body');
  ok(/브랜드 목록/.test(t1), 'k 없이 들어가도 새 브랜드 화면(브랜드 목록)이 뜸');
  ok(/완전히 삭제|사용 중지 브랜드 보기/.test(t1), '완전히 삭제 안내 또는 사용 중지 체크박스가 보임');
  ok(!/일일 마감보고 브랜드 행 순서/.test(t1), '옛 단순 편집 화면(일일 마감보고 브랜드 행 순서)은 더 이상 안 뜸');

  // ② ?k=brands 명시해도 동일
  await pg.evaluate(() => (location.hash = '#/settings?k=brands')); await pg.waitForTimeout(300);
  await pg.evaluate(() => HS.route()); await pg.waitForTimeout(1200);
  ok(/브랜드 목록/.test(await pg.textContent('#body')), 'k=brands 로 들어가도 새 화면');

  // ③ 품번 규칙 · 보안 탭은 그대로 살아 있어야 함
  await pg.evaluate(() => (location.hash = '#/settings?k=style')); await pg.waitForTimeout(300);
  await pg.evaluate(() => HS.route()); await pg.waitForTimeout(1200);
  ok(/품번/.test(await pg.textContent('#body')), '품번 규칙 탭 정상');
  await pg.evaluate(() => (location.hash = '#/settings?k=sec')); await pg.waitForTimeout(300);
  await pg.evaluate(() => HS.route()); await pg.waitForTimeout(1200);
  ok(/보안 점검/.test(await pg.textContent('#body')), '보안 탭 정상');

  // ④ 옛 주소(k=teams/prices)는 여전히 원가관리 설정으로 보내져야 함
  await pg.evaluate(() => (location.hash = '#/settings?k=teams')); await pg.waitForTimeout(300);
  await pg.evaluate(() => HS.route()); await pg.waitForTimeout(1200);
  ok(/costset/.test(decodeURIComponent(await pg.evaluate(() => location.hash))), '옛 teams 주소는 원가관리 설정(costset)으로 보내짐 · ' + decodeURIComponent(await pg.evaluate(() => location.hash)));

  // ⑤ 완전히 삭제 버튼(네파 사용중지 후)이 실제로 보이는지
  await pg.evaluate(() => HS.db.upsert('erp_brands', [Object.assign({}, HS.cache.brandMap['네파'], { active: false, end_date: '2026-11-13' })]));
  await pg.evaluate(() => (location.hash = '#/settings?k=brands&off=1')); await pg.waitForTimeout(300);
  await pg.evaluate(() => HS.route()); await pg.waitForTimeout(1200);
  ok(await pg.locator('tr[data-n="네파"] [data-del]').count() === 1, '사용 중지된 네파에 완전히 삭제 버튼이 실제로 보임');

  console.log(errs.length ? '에러: ' + errs.join(' | ') : 'no page errors');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
