// 정상팀 › 반품 정리 현황 — '매장 폐점 수시반품 대장' 8개 시트 한 번에 올리기
//  · 시험 파일은 실제 대장의 까다로운 점을 그대로 흉내냄:
//    칸 합쳐 빈 날짜 · 1/7~1/14 · 1월02,03일 · 12/25/24 · ' 1,133 ' · '왼료' 오타 · '이월03일' (못 읽는 날짜)
const { chromium } = require('playwright'); const X = require('xlsx'); const fs = require('fs');
const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; const FX = __dirname + '/fx/'; fs.mkdirSync(SH, { recursive: true }); fs.mkdirSync(FX, { recursive: true });
const E = (n) => Array.from({ length: n }, () => '');

const wb = X.utils.book_new();
const add = (name, aoa) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), name);

add('폐점반품_OPEN,홀딩해체', [
  ['매장 폐점반품'], [], ['', '', '', '', '', '미정리수량', 1574],
  ['No', '반품일자', '항목', '브랜드', '매장명', '시즌별 수량', '반품수불', '박스수량', '사용처', "반품팀 진행 현황'", '정상팀\r\n인계일자', '박스수량', '정상팀\r\n정리일자', '정리결과', '사용처/비고', '최종결과'],
  ['1', '1/3', '', '팬텀', '부산반여', 'C,D/3,4', 1056, 61, '해체', '1/6 서원경 사원 인계완료', '1/6/26', 61, '1/8/26', '', '', '정리완료'],
  ['2', '', '', '', '', 'D1,D2', 110, '', '해체', '', '', '', '1/8/26', '', '', '정리완료'],
  ['3', '1/7~1/14', '', '핑', '수원영통', 'D3', 223, 6, '해체', '', '1/16/26', 6, '', '', '', ''],
  ['4', '1/20', '', '핑', '대구', 'D4', 50, 2, '해체', '', '', '', '', '', '', ''],
]);
add('수시및행사반품(정상팀)', [
  ['매장 수시반품'], ['', '', '', '', '', '미정리수량', 62], ['김기환 대리 작성'],
  ['No', '반품일자', '브랜드', '반품형태', '매장명', '시즌 및 복종', '반품수불', '박스수량', '사용처', "반품팀 진행 현황'", '이월팀\r\n인계일자', '리프레쉬\r\n작업일정', '이월팀\r\n정리일자', '정상팀\r\n인계일자', '인계박스', '정상팀\r\n정리일자', '정리결과', '최종결과'],
  ['1', '1/3', '바니', '수시', '하프문', 'D3', 40, 2, '해체', '1/6 주선미 주임 인계완료', '', '', '', '1/6/26', 2, '1/6/26', '', '정리완료'],
  ['2', '1/3~1/6', '파리게이츠', '행사', '4개매장', 'B3,B4', 1235, 45, '도곡특판 행사출고', '1/8 도곡특판 출고 게이트 완료', '', '', '', '', '', '', '', '출고완료'],
  ['3', '1/14', '세인트', '행사', '3개매장', 'C3,C4', 1243, 47, '도곡특판', '', '', '', '', '1/15/26', 47, '', '', '정리작업 예정(3/5~3/6)'],
  ['4', '1/16', '핑', '수시', '벽제', ' D3 ', ' 1,133 ', '100', '해체', '', '', '', '', '', '', '', '', ''],
]);
add('수시및행사반품(이월팀)', [
  ['매장 행사반품'], ['김기환 대리 작성'],
  ['No', '반품일자', '브랜드', '반품형태', '매장명', '시즌 및 복종', ' 반품수불 ', '박스수량', '사용처', "반품팀 진행 현황'", ' 출고 수량 ', '이월팀\r\n인계일자', '인계박스', '이월팀\r\n정리일자', '리프레쉬\r\n작업일정', '정리결과', '최종결과'],
  ['', '01월 14일', 'v12', '행사', '9개매장', 'B,C', ' 511 ', '32', '본사 행사출고', '이정환 부장 인계완료', ' 511 ', '01월 14일', '32', '', '', '', '5/20 인계완료'],
]);
add('행사반품 출고(정상팀)', [
  ['행사 전환출고 및 샘플출고'], ['반품', '', '', '', '', '', '', '', '', '출고'],
  ['No', '반품일자', '브랜드', '반품형태', '매장명', '시즌 및 복종', '반품수불', '박스수량', '사용처', '브랜드', '출고 내용', '출고일자', '출고매장', '출고수량'],
  ['3', '01월 16일', '팬텀', '샘플', '덕평팩토리', '샘플', 237, 5, '역삼특판 행사출고', '팬텀', '샘플 출고', '01월 21일', '역삼특판', 237],
]);
add('시즌아웃반품', [
  ['시즌 아웃반품'], ['김기환 대리 작성', '', '', '', '', '', '', '', '', '', '', '', '이월팀 작성', '', '', '', '정상팀 작성'],
  ['No', '반품일자', '브랜드', '반품형태', '매장명', '시즌 및 복종', ' 반품수불 ', ' 박스수량 ', '사용처', "반품팀 진행 현황'", '인계일자', ' 인계박스 ', '정리일자', '인수자', '정리결과', '최종결과', '정리일자', '인수자', '정리결과', '최종결과'],
  ['', '02월 02일', '파리게이츠', '시즌아웃', '', '겨울시즌', ' 1,828 ', ' 84 ', '정상팀 정리', '최민준차장 인계완료', '02월 11일', ' 84 ', '', '최민준', '', '', '', '', '', ''],
]);
add('온라인 --> 이월,정상', [
  ['', '고객반품 정리 대장'], ['', '미정리수량', '0 '], ['', '김나혜 / 김경숙 작성'],
  ['B2C 반품 등록일자', '브랜드', '수량', 'B2B 반품 등록일', 'B2B 이관 박스수량', '이관 수량', '정상 인계 일자', '이관 팀', '정리 일자', '서류 인계 일자', '결과', '최종결과'],
  ['1월02,03일', '핑', '6 ', '01월08일', '1 ', '6 ', '01월08일', '정상', '1/8/26', '1/8/26', '', '정리완료'],
  ['1월23,24,31일,2월3일', '링스', '319 ', '02월05일', '19 ', '319 ', '02월05일', '정상', '', '', '', ''],
]);
add('이월,정상 --> 온라인', [
  ['온라인 B2B 이관 관리 대장'], [], ['최민준 차장'],
  ['브랜드', '내용', 'B2C 출고 등록일', '이관 박스 수량', '이관 수량', '시즌', 'B2C 인계 일자', '정리 일자', '포스 확정 일자', '결과', '최종결과'],
  ['팬텀', '', '12/25/24', 140, 5136, 'F C1ACC(140박스)', '12/16/24', '', '', '완료', ''],
]);
add('온라인 반품대장', [
  ['', '고순녀', '', '', '', '', '김나혜, 김경숙'],
  ['반품일자', '반품수량', '반품등록일', '폴리백 ', 'B2B반품수량', 'B2C정리수량', '정리일정', '결과', '비고', '최종결과'],
  ['12월26일', 232, '12월26일', '12월28일', '', '', '', '완료', '', '완료'],
  ['이월03일', 474, '01월03일', '01월07일', '', '', '', '왼료', '', '완료'],
]);
X.writeFile(wb, FX + 'rclean.xlsx');
// 대장이 아닌 파일
{ const w = X.utils.book_new(); X.utils.book_append_sheet(w, X.utils.aoa_to_sheet([['가', '나'], [1, 2]]), 'Sheet1'); X.writeFile(w, FX + 'rclean_bad.xlsx'); }

const upload = async (pg, f) => { await pg.setInputFiles('#dz + div + div + input[type=file], .card input[type=file]', FX + f); await pg.waitForFunction(() => /✔|✖/.test((document.querySelector('#dz') || {}).textContent || ''), null, { timeout: 60000 }); await pg.waitForTimeout(600); };
const rowOf = (pg, sel, label) => pg.evaluate(([s, l]) => {
  for (const t of document.querySelectorAll(s + ' table')) for (const r of t.rows) {
    const c = [...r.cells].map((x) => x.textContent.replace(/\s+/g, ' ').trim());
    const i = c.findIndex((x) => x === l); if (i >= 0) return c.slice(i);
  } return null;
}, [sel, label]);

(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1560, height: 1100 } }); const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));

  // ---------- 1. 메뉴 · 첫 화면 ----------
  await pg.goto(URL + '#/rclean'); await pg.waitForSelector('#dz', { timeout: 20000 }); await pg.waitForTimeout(600);
  const nav = await pg.$$eval('.nav .ng[data-g="정상팀"] a', (x) => x.map((a) => a.textContent.trim()));
  // 재고 실사는 2026-11-16 에 [전산자료] 묶음과 겹쳐서 정상팀에서 뺐다 (같은 화면이 두 군데 있던 것)
  ok(nav.join('|') === '원가 관리 입력|신상품 현황|출고 현황|반품 정리 현황', '정상팀 메뉴 4개 ' + JSON.stringify(nav));
  ok((await pg.$$('#tools .seg button')).length === 9, '탭 9개 (전체 + 대장 8)');
  ok(/2026년/.test(await pg.textContent('#yy')), '기준 연도 고르는 칸');

  // ---------- 2. 대장이 아닌 파일 ----------
  await upload(pg, 'rclean_bad.xlsx');
  ok(/아는 대장을 찾지 못했습니다/.test(await pg.textContent('#dz')), '대장이 아닌 파일 → 거부');

  // ---------- 3. 대장 올리기 ----------
  await upload(pg, 'rclean.xlsx');
  const dz = (await pg.textContent('#dz')).replace(/\s+/g, ' ');
  ok(/8개 시트/.test(dz) && /16줄/.test(dz), '8개 시트 · 16줄 ' + dz.slice(0, 120));
  const pv = (await pg.textContent('#pv')).replace(/\s+/g, ' ');
  ok(/날짜를 읽지 못한 줄 1/.test(pv), "못 읽는 날짜('이월03일') 1줄을 알려 줌");
  ok(/새로 들어감/.test(pv) && !/덮어씀/.test(pv), '처음 올릴 때는 덮어쓰는 줄 없음');
  await pg.screenshot({ path: SH + 'rc1_up.png', fullPage: true });
  await pg.click('#reg'); await pg.waitForFunction(() => !document.querySelector('#dz'), null, { timeout: 120000 }); await pg.waitForTimeout(2000);

  // ---------- 4. 요약 · 대장별 ----------
  const kp = await pg.$$eval('.kpi .v', (x) => x.map((e) => e.textContent.trim()));
  ok(kp[0] === '16' && kp[1] === '9' && kp[2] === '5' && kp[3] === '2', '요약: 16줄 · 완료 9 · 정리중 5 · 대기 2 ' + JSON.stringify(kp));
  const tot = await rowOf(pg, '.card', '합계');
  ok(tot && tot[1] === '16', '대장별 표 합계 16줄 ' + JSON.stringify(tot));
  const rc = await rowOf(pg, '.card', '폐점 · OPEN · 홀딩해체');
  ok(rc && rc[1] === '4' && rc[4] === '2' && rc[5] === '1' && rc[6] === '1', '폐점 대장: 4줄 · 완료 2 · 정리중 1 · 대기 1 ' + JSON.stringify(rc));
  const on2 = await rowOf(pg, '.card', '온라인 → 이월 · 정상');
  ok(on2 && on2[1] === '2' && on2[4] === '1', '온라인→이월·정상 2줄 · 완료 1 ' + JSON.stringify(on2));
  await pg.screenshot({ path: SH + 'rc2_all.png', fullPage: true });

  // ---------- 5. 칸 합친 줄 · 여러 날 적힌 줄 ----------
  await pg.goto(URL + '#/rclean?k=rc_close&f=all'); await pg.waitForTimeout(1800);
  const cl = await pg.$$eval('.card .tw table tr', (t) => t.map((r) => [...r.cells].map((c) => c.textContent.replace(/\s+/g, ' ').trim())));
  // 표 맨 앞에는 HS.enhanceTables 가 넣는 No 칸이 붙으므로 '상태'는 자리 번호 말고 글자로 찾는다
  const stOf = (r) => (r || []).find((c) => /^(정리 완료|정리 중|인계 대기)$/.test(c)) || '';
  const r110 = cl.find((r) => r.indexOf('110') >= 0);
  ok(r110 && /01\/03/.test(r110.join(' ')) && r110.indexOf('부산반여') >= 0, '칸 합친 줄: 윗줄 반품일자(01/03) · 매장(부산반여) 이어받음 ' + JSON.stringify(r110));
  const r223 = cl.find((r) => r.indexOf('223') >= 0);
  ok(r223 && /01\/07/.test(r223.join(' ')) && r223.join(' ').indexOf('1/7~1/14') >= 0, '여러 날 적힌 줄: 첫 날 01/07 + 적힌 글자 보관 ' + JSON.stringify(r223));
  ok(stOf(r223) === '정리 중', '인계일자만 있으면 정리 중 ' + stOf(r223));
  const r50 = cl.find((r) => r.indexOf('대구') >= 0);
  ok(stOf(r50) === '인계 대기', '인계일자도 없으면 인계 대기 ' + stOf(r50));

  // ---------- 6. 숫자 · 결과 글자 읽기 ----------
  await pg.goto(URL + '#/rclean?k=rc_normal&f=all'); await pg.waitForTimeout(1800);
  const nm = await pg.$$eval('.card .tw table tr', (t) => t.map((r) => [...r.cells].map((c) => c.textContent.replace(/\s+/g, ' ').trim())));
  const st2 = (r) => (r || []).find((c) => /^(정리 완료|정리 중|인계 대기)$/.test(c)) || '';
  ok(nm.some((r) => r.indexOf('1,133') >= 0), "' 1,133 ' 처럼 콤마·공백 있는 수량도 숫자로");
  const ev = nm.find((r) => r.join(' ').indexOf('출고완료') >= 0);
  ok(st2(ev) === '정리 완료', '최종결과가 "출고완료"면 정리 완료 ' + st2(ev));
  const pl = nm.find((r) => r.join(' ').indexOf('정리작업 예정') >= 0);
  ok(st2(pl) === '정리 중', '"정리작업 예정(3/5~3/6)" 은 완료가 아님 (날짜가 들어 있어도) ' + st2(pl));
  // 정리 안 끝난 것만 보기
  await pg.goto(URL + '#/rclean?k=rc_normal'); await pg.waitForTimeout(1800);
  ok((await pg.$$eval('.card .tw table tr[data-i]', (t) => t.length)) === 2, '[정리 안 끝난 것] 2줄만');

  // ---------- 7. 이월팀 '인계완료' 는 정리 완료가 아님 ----------
  await pg.goto(URL + '#/rclean?k=rc_carry&f=all'); await pg.waitForTimeout(1800);
  ok(/정리 중/.test(await pg.textContent('.card .tw')), '"5/20 인계완료" 는 정리 중 (완료 아님)');

  // ---------- 8. 연도 든 날짜 · 두 벌 칸 ----------
  await pg.goto(URL + '#/rclean?k=rc_b2on&f=all'); await pg.waitForTimeout(1800);
  ok(/12\/25/.test(await pg.textContent('.card .tw')), "'12/25/24' 는 2024-12-25 로 읽음");
  await pg.goto(URL + '#/rclean?k=rc_seasonout&f=all'); await pg.waitForTimeout(1800);
  const sh = await pg.$$eval('.card .tw table tr:first-child th', (t) => t.map((x) => x.textContent.trim()));
  ok(sh.indexOf('이월팀 정리일자') >= 0 && sh.indexOf('정상팀 정리일자') >= 0, '시즌아웃: 이월팀 · 정상팀 두 벌 칸 ' + JSON.stringify(sh));

  // ---------- 9. 줄 눌러 자세히 ----------
  await pg.click('.card .tw table tr[data-i]'); await pg.waitForTimeout(900);
  ok(/최민준/.test(await pg.textContent('.modal-bg')), '줄을 누르면 모든 칸을 보여 줌');
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));

  // ---------- 10. 다시 올려도 두 번 안 들어감 ----------
  await pg.goto(URL + '#/rclean?up=1'); await pg.waitForSelector('#dz'); await pg.waitForTimeout(600);
  await upload(pg, 'rclean.xlsx');
  ok(/덮어씀/.test(await pg.textContent('#pv')), '다시 올리면 [덮어씀] 으로 알려 줌');
  await pg.click('#reg'); await pg.waitForFunction(() => !document.querySelector('#dz'), null, { timeout: 120000 }); await pg.waitForTimeout(2000);
  const kp2 = await pg.$$eval('.kpi .v', (x) => x.map((e) => e.textContent.trim()));
  ok(kp2[0] === '16', '다시 올려도 16줄 그대로 ' + JSON.stringify(kp2));

  // ---------- 11. 휴대폰 ----------
  await pg.setViewportSize({ width: 390, height: 840 }); await pg.goto(URL + '#/rclean'); await pg.waitForTimeout(2200);
  const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 1, '휴대폰 화면 가로 넘침 없음 (' + over + ')');
  await pg.screenshot({ path: SH + 'rc3_mobile.png', fullPage: false });

  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
