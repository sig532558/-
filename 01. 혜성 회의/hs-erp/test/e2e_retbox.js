// 반품 현황 › 자료 업데이트 ③ — 일별 반품 관리 대장(도착 운송사 BOX · 실무진 BOX) 엑셀 대량 등록
//  · 머리글이 두 줄인 파일 · 칸 이름이 다른 옛 파일(자리로 읽기) · 여러 달 · 덮어쓰기
const { chromium } = require('playwright'); const X = require('xlsx'); const fs = require('fs');
const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; const FX = __dirname + '/fx/'; fs.mkdirSync(SH, { recursive: true }); fs.mkdirSync(FX, { recursive: true });

// ① 지금 쓰는 모양: 머리글 두 줄 (묶음 줄 + 세부 줄) · 11월 3일 + 12월 1일 (한 파일에 두 달)
const G1 = ['', '도착 운송사 BOX', '', '', '', '', '실무진 BOX', '', ''];
const H1 = ['도착일', '탑', '롯데', '행낭', '기타', '합계', '기타용품', '완료', '대기'];
const A = [
  ['2026-11-02', 10, 20, 5, 3, 38, 2, 30, 6],
  ['2026-11-03', 40, 50, 6, 4, 100, 3, 80, 17],
  ['2026-11-04', 70, 80, 7, 5, 162, 4, 150, 8],
  ['2026-12-01', 11, 12, 13, 14, 50, 1, 40, 9],
];
{ const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([G1, H1].concat(A)), '일별 반품 관리 대장 전표'); X.writeFile(wb, FX + 'retbox_a.xlsx'); }
// ② 덮어쓰기용: 11/03 을 바꾸고 11/06 을 새로 넣음 (11/02 · 11/04 는 건드리지 않아야 함)
const B = [['2026-11-03', 1, 2, 3, 4, 10, 0, 5, 5], ['2026-11-06', 100, 0, 0, 0, 100, 0, 90, 10]];
{ const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([G1, H1].concat(B)), '일별 반품 관리 대장 전표'); X.writeFile(wb, FX + 'retbox_b.xlsx'); }
// ③ 옛 파일: 세부 칸 이름이 영문이라 이름으로 못 찾음 → 묶음 글씨(도착 운송사 BOX)를 보고 자리로 읽어야 함
//    자리: A 도착일 · B 탑 · C 롯데 · D 행낭 · E 기타 · H 기타용품 · I 완료 · J 대기
const H3 = ['도착일', 'TOP', 'LOTTE', 'BAG', 'ETC', '합계', '비고', '기타용품BOX', '처리완료', '처리대기'];
const C = [['2026-09-01', 7, 8, 9, 1, 25, '', 2, 20, 3]];
{ const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['', '도착 운송사 BOX'], H3].concat(C)), '대장'); X.writeFile(wb, FX + 'retbox_old.xlsx'); }
// ④ 대장이 아닌 파일 (고백센터 반품 확정) → 3번 칸에서 거부해야 함
{ const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['브랜드', '출고일자', '매장명', '출고구분', '출고수량', '전표바코드'], ['핑', '2026-11-02', '롯데본점', '반품', -5, '880123']]), '출고반품현황'); X.writeFile(wb, FX + 'retbox_bad.xlsx'); }

const upTab = async (pg) => { await pg.goto(URL + '#/returns?k=up'); await pg.waitForSelector('[data-slot=box]'); await pg.waitForTimeout(400); };
const drop = async (pg, f) => { await pg.setInputFiles('[data-slot=box] input[type=file]', FX + f); await pg.waitForFunction(() => /✔|✖/.test(document.querySelector('[data-slot=box]').textContent), null, { timeout: 60000 }); await pg.waitForTimeout(800); };
// 대장 표에서 그 날짜 줄을 읽음 (앞에 No 칸이 붙어도 날짜 칸부터 세도록)
const boxRow = (pg, d) => pg.evaluate((dd) => {
  const t = document.querySelector('.rtab table'); if (!t) return null;
  for (const r of t.rows) { const c = [...r.cells].map((x) => x.textContent.trim()); const i = c.findIndex((x) => x.indexOf(dd) === 0); if (i >= 0 && c.length > i + 8) return c.slice(i, i + 9); }
  return null;
}, d);

(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 1000 } }); const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));

  // ---------- 1. 칸이 생겼는지 ----------
  await upTab(pg);
  ok((await pg.$$('.np3 .slot')).length === 3, '자료 업데이트 칸 3개 (매장 반품 · 고백센터 확정 · 일별 대장 박스)');
  const t3 = await pg.textContent('[data-slot=box]');
  ok(/일별 반품 관리 대장/.test(t3) && /사내 엑셀/.test(t3), '3번 칸: 일별 반품 관리 대장 (사내 엑셀)');

  // ---------- 2. 대장이 아닌 파일은 거부 ----------
  await drop(pg, 'retbox_bad.xlsx');
  ok(/파일이 아닙니다/.test(await pg.textContent('[data-slot=box]')), '대장이 아닌 파일 → 거부');

  // ---------- 3. 머리글 두 줄 · 여러 달 ----------
  await drop(pg, 'retbox_a.xlsx');
  const s1 = await pg.textContent('[data-slot=box]');
  ok(/4일/.test(s1) && /2개월/.test(s1), '4일 · 2개월로 읽음 ' + s1.replace(/\s+/g, ' ').slice(0, 120));
  ok(/도착 BOX 350/.test(s1), '도착 BOX 합계 350 (11월 300 + 12월 50)');
  const pv1 = (await pg.textContent('#pv')).replace(/\s+/g, ' ');
  ok(/2026-11/.test(pv1) && /2026-12/.test(pv1), '미리보기: 달마다 한 줄');
  ok(/새로 들어감/.test(pv1) && !/일 덮어씀/.test(pv1), '처음 올릴 때는 덮어쓰는 날이 없음 (머리글의 "덮어씀" 칸만 있음)');
  await pg.screenshot({ path: SH + 'rb1_up.png', fullPage: true });
  await pg.click('#reg'); await pg.waitForFunction(() => location.hash.indexOf('k=dash') >= 0, null, { timeout: 120000 }); await pg.waitForTimeout(2500);
  ok(/m=2026-12/.test(decodeURIComponent(pg.url())), '등록 뒤 마지막 달(2026-12) 대장으로 이동 ' + decodeURIComponent(pg.url()));

  // ---------- 4. 대장에 그대로 보이는지 ----------
  await pg.goto(URL + '#/returns?k=dash&m=2026-11'); await pg.waitForTimeout(2000);
  const r2 = await boxRow(pg, '11/02'); const r3 = await boxRow(pg, '11/03'); const r4 = await boxRow(pg, '11/04');
  ok(JSON.stringify(r2) === JSON.stringify(['11/02 (월)', '10', '20', '5', '3', '38', '2', '30', '6']), '11/02 줄 = 엑셀과 같음 ' + JSON.stringify(r2));
  ok(r3 && r3[1] === '40' && r3[7] === '80', '11/03 탑 40 · 실무진 완료 80 ' + JSON.stringify(r3));
  ok(r4 && r4[5] === '162', '11/04 합계 162 ' + JSON.stringify(r4));
  const kp = await pg.$$eval('.kpi .v', (x) => x.map((e) => e.textContent.trim()));
  ok(kp[0] === '162', '맨 위 요약: 마지막 날 도착 BOX 162 ' + JSON.stringify(kp));
  await pg.screenshot({ path: SH + 'rb2_dash.png', fullPage: true });

  // ---------- 5. 덮어쓰기 — 파일에 든 날만 ----------
  await upTab(pg); await drop(pg, 'retbox_b.xlsx');
  const pv2 = (await pg.textContent('#pv')).replace(/\s+/g, ' ');
  ok(/1일 덮어씀/.test(pv2), '미리보기: 이미 있는 1일(11/03)은 덮어쓴다고 알려 줌 ' + pv2.slice(0, 160));
  await pg.click('#reg'); await pg.waitForFunction(() => location.hash.indexOf('k=dash') >= 0, null, { timeout: 120000 }); await pg.waitForTimeout(2500);
  await pg.goto(URL + '#/returns?k=dash&m=2026-11'); await pg.waitForTimeout(2000);
  const n2 = await boxRow(pg, '11/02'), n3 = await boxRow(pg, '11/03'), n4 = await boxRow(pg, '11/04'), n6 = await boxRow(pg, '11/06');
  ok(n3 && n3[1] === '1' && n3[5] === '10', '11/03 은 새 값으로 바뀜 (탑 1 · 합계 10) ' + JSON.stringify(n3));
  ok(n6 && n6[1] === '100' && n6[7] === '90', '11/06 이 새로 생김 ' + JSON.stringify(n6));
  ok(JSON.stringify(n2) === JSON.stringify(r2), '파일에 없는 11/02 는 그대로');
  ok(JSON.stringify(n4) === JSON.stringify(r4), '파일에 없는 11/04 는 그대로');

  // ---------- 6. 옛 파일 (칸 이름이 달라도 자리로 읽기) ----------
  await upTab(pg); await drop(pg, 'retbox_old.xlsx');
  ok(/1일/.test(await pg.textContent('[data-slot=box]')), '옛 모양 파일도 1일 읽음');
  await pg.click('#reg'); await pg.waitForFunction(() => location.hash.indexOf('k=dash') >= 0, null, { timeout: 120000 }); await pg.waitForTimeout(2500);
  await pg.goto(URL + '#/returns?k=dash&m=2026-09'); await pg.waitForTimeout(2000);
  const o1 = await boxRow(pg, '09/01');
  ok(JSON.stringify(o1) === JSON.stringify(['09/01 (화)', '7', '8', '9', '1', '25', '2', '20', '3']), '옛 파일: 자리로 읽어 대장과 같음 ' + JSON.stringify(o1));

  // ---------- 7. 타이핑 등록(박스 수불)은 그대로 ----------
  await pg.goto(URL + '#/returns?k=box&m=2026-11'); await pg.waitForTimeout(1500);
  const bt = await pg.textContent('#body');
  ok(/일별 반품 박스 수불/.test(bt), '[박스 수불] 타이핑 등록 화면 그대로 있음');
  ok(/11월 반품 도착 박스/.test(bt), '박스 수불 요약도 올린 자료를 그대로 씀');

  // ---------- 8. 박스 자료가 없는 달은 왜 비는지 알려 줌 ----------
  //  월간 회의는 기본이 '지난달' 이라 "거기는 나오는데 여기는 안 나온다" 가 생김 (2026-11-11)
  //  10월에 반품 완료만 넣어 둠 — 박스만 없는 달을 만들기 위해
  await pg.evaluate(async () => { await HS.db.upsert('erp_ret_done', [{ rec_date: '2026-10-05', brand: '핑', slips: 3, pcs: 30 }]); });
  await pg.goto(URL + '#/returns?k=dash&m=2026-10'); await pg.waitForTimeout(2000);
  const e10 = await pg.textContent('#body');
  ok(/2026-10 은 도착 운송사 BOX · 실무진 BOX 자료가 아직 없습니다/.test(e10.replace(/\s+/g, ' ')), '박스 자료 없는 달: 왜 비는지 알려 줌');
  ok(/가장 최근 박스 자료는 2026-12-01/.test(e10.replace(/\s+/g, ' ')), '가장 최근 박스 자료 날짜를 알려 줌');
  ok(/월간 회의.*지난달/.test(e10.replace(/\s+/g, ' ')), '월간 회의와 달이 다를 수 있다고 알려 줌');
  ok(/자료 업데이트 ③ 일별 반품 관리 대장/.test(e10), '어디서 올리는지 알려 줌');
  await pg.screenshot({ path: SH + 'rb3_nobox.png', fullPage: true });
  await pg.goto(URL + '#/returns?k=dash&m=2026-11'); await pg.waitForTimeout(2000);
  ok(!/자료가 아직 없습니다/.test(await pg.textContent('#body')), '박스 자료가 있는 달에는 안내 줄이 안 나옴');

  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
