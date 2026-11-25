// 2026-11-19 (1120) — ① 관리자가 계정 바로 만들기 ② 반품 관리 대장을 설정 칸에 올렸을 때 안내 ③ 반품 현황 [대량 등록] 자리
const { chromium } = require('playwright');
const XLSX = require('xlsx');
const fs = require('fs'); const os = require('os'); const path = require('path');
const URL = 'http://localhost:' + (process.env.PORT || process.argv[2] || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

// 회사 파일을 쓰지 않도록 반품 관리 대장 모양만 흉내 낸 가짜 파일을 만든다
function makeBook() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['2026년 반품 진행 현황'], ['도착일', '도착 운송사 자료', null, null, null, '합계', '합계', '기타 용품', '도착 실무진BOX', null],
    [null, null, null, null, null, null, null, null, '완료', '대기'],
    ['합계', '탑', '롯데', '행낭', '기타', 100, 100, 5, 95, 0],
    ['2026-11-02', 10, 20, 3, 1, 34, 34, 2, 30, 0],
    ['2026-11-03', 12, 22, 4, 0, 38, 38, 1, 35, 0],
  ]), '일별 반품 관리 대장 전표');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['브랜드', '출고일자', '매장명', '출고구분', '출고번호', '출고수량', '지시일자', '출고전표구분', '전표바코드'],
    ['핑', 20261102, '가게1', '반품', 9001, 10, 20261102, '전표', 'B0001'],
    ['핑', 20261103, '가게2', '반품', 9002, 20, 20261103, '전표', 'B0002'],
  ]), '출고반품현황');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['의뢰일자', '의뢰번호', '출고일자', '출고번호', '매장명', '의뢰수량', '출고수량', '미출고수량', '전표바코드', '비고'],
    [20261102, 1, 20261102, 9001, '가게1', 10, 10, 0, 'B0001'],
    [20261103, 2, '', '', '가게2', 20, 0, 20, 'B0002'],
  ]), '핑');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['*날짜 숫자만'], ['날짜', '구분', '브랜드', '반품확정여부', '매장명', 'Box', '비고'],
    [20261102, '행낭', '핑', '확정', '가게1', 3],
  ]), '행낭');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['아무 뜻 없는 시트'], ['가', '나', '다']]), '메모');
  const p = path.join(os.tmpdir(), 'hs_ret_fake.xlsx'); XLSX.writeFile(wb, p); return p;
}

(async () => {
  const FILE = makeBook();
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hs-nav-h', 'v'); } catch (e) {} });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/권한이 없습니다|이미 있는 아이디|비밀번호 두 칸|아이디는 영문/.test(m.text())) errs.push('console: ' + m.text()); });
  const login = async (id, pw) => { await pg.evaluate(() => sessionStorage.clear()).catch(() => {}); await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(600); };
  await login('admin', 'admin1234');

  // ---------- ① 사용자 직접 추가 ----------
  await pg.goto(URL + '#/users?k=users'); await pg.waitForTimeout(1200);
  ok(!!(await pg.$('button:has-text("+ 사용자 직접 추가")')), '[+ 사용자 직접 추가] 단추가 있음');
  const open = async () => { await pg.click('button:has-text("+ 사용자 직접 추가")'); await pg.waitForSelector('#a1'); };
  const fill = async (id, pw, pw2, name, role) => { await pg.fill('#a1', id); await pg.fill('#a2', name); await pg.selectOption('#a6', role || 'admin'); await pg.fill('#a7', pw); await pg.fill('#a8', pw2 == null ? pw : pw2); };
  await open(); await fill('daepyo', 'abcd1234!', 'abcd9999!', '대표님');
  await pg.click('.modal .btn.p'); await pg.waitForTimeout(600);
  ok(/비밀번호 두 칸이 다릅니다/.test(await pg.textContent('body')), '비밀번호 두 칸이 다르면 알려 줌');
  await pg.fill('#a8', 'abcd1234!'); await pg.click('.modal .btn.p'); await pg.waitForTimeout(1500);
  ok(/대표님 계정을 만들었습니다|계정을 만들었습니다/.test(await pg.textContent('body')), '계정을 만들었다고 알려 줌');
  const row = await pg.evaluate(() => { const tr = [...document.querySelectorAll('.card tr')].find((t) => /daepyo/.test(t.textContent)); return tr ? tr.textContent.replace(/\s+/g, ' ').trim() : null; });
  ok(row && /대표님/.test(row) && /사용/.test(row), '사용자 표에 바로 보이고 상태가 [사용] (' + (row || '-') + ')');
  await open(); await fill('daepyo', 'abcd1234!', null, '또 대표님');
  await pg.click('.modal .btn.p'); await pg.waitForTimeout(1200);
  ok(/이미 있는 아이디/.test(await pg.textContent('body')), '같은 아이디는 두 번 못 만듦');
  await pg.keyboard.press('Escape'); await pg.click('.modal .btn:has-text("취소")').catch(() => {});
  await pg.waitForTimeout(400);
  await open(); await fill('짧다', 'abcd1234!', null, '테스트');
  await pg.click('.modal .btn.p'); await pg.waitForTimeout(1000);
  ok(/아이디는 영문/.test(await pg.textContent('body')), '한글 아이디는 막음');
  await pg.keyboard.press('Escape'); await pg.click('.modal .btn:has-text("취소")').catch(() => {});
  // 만든 계정으로 로그인
  await login('daepyo', 'abcd1234!');
  ok(/대표님/.test(await pg.textContent('.me')), '만든 계정으로 바로 로그인됨');
  await login('staff', '1234');
  await pg.goto(URL + '#/users?k=users'); await pg.waitForTimeout(900);
  ok(!(await pg.$('button:has-text("+ 사용자 직접 추가")')), '실무진에게는 단추가 안 보임');

  // ---------- ② 설정 › 엑셀 칸에 반품 관리 대장 ----------
  await login('admin', 'admin1234');
  await pg.goto(URL + '#/upload'); await pg.waitForTimeout(1000);
  await pg.setInputFiles('#fi', FILE);
  for (let i = 0; i < 40; i++) { await pg.waitForTimeout(1000); if (!/분석 중/.test(await pg.textContent('#res'))) break; }
  const t = (await pg.textContent('#res')).replace(/\s+/g, ' ');
  ok(/반품 관리 대장/.test(t) && /반품 현황/.test(t), '반품 관리 대장이면 제 자리로 보내는 안내가 뜸');
  ok(/등록되지 않는 시트 \d+개/.test(t), '안 들어가는 시트 수를 알려 줌 (' + (t.match(/등록되지 않는 시트 \d+개/) || [])[0] + ')');
  ok(/인식 불가/.test(t), '못 알아본 시트도 표에 보임');
  const checked = await pg.$$eval('#res input[data-i]', (xs) => xs.filter((x) => x.checked).length);
  ok(checked === 0, '반품 관리 대장은 체크를 꺼 둠 (켜진 줄 ' + checked + ')');

  // ---------- ③ 반품 현황 [대량 등록] ----------
  await pg.goto(URL + '#/returns?k=up'); await pg.waitForTimeout(1200);
  const h = await pg.$$eval('.card h3', (xs) => xs.map((x) => x.textContent.trim()));
  ok(/대량 등록/.test(h[0] || ''), '[대량 등록] 이 맨 위 (' + (h[0] || '-').slice(0, 20) + ')');
  ok((await pg.$$('.slot')).length === 3, '항목별 1 · 2 · 3번 칸은 그대로 (' + (await pg.$$('.slot')).length + '개)');
  await (await pg.$$('input[type=file]'))[0].setInputFiles(FILE);
  for (let i = 0; i < 40; i++) { await pg.waitForTimeout(1000); if (!/읽는 중/.test(await pg.textContent('#bkr'))) break; }
  const bt = (await pg.textContent('#bkr')).replace(/\s+/g, ' ');
  ok(/일별 반품 관리 대장/.test(bt) && /출고 반품 현황/.test(bt), '대량 등록은 시트를 종류별로 나눠 읽음 (' + bt.slice(0, 80) + ')');

  try { fs.unlinkSync(FILE); } catch (e) { /* 무시 */ }
  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
