// 배분LIST (17~18시 당일 마감): 인식 · 의뢰구분 7가지 · 품번 첫 글자 브랜드 · 일일 마감 B2B 채움 · 손 수정 유지 · 되돌리기 · 다시 올리기
//
// ⚠ 2026-11-10 — 이 점검은 멈춰 두었습니다.
//    출고 지시 화면(#/cs?k=order · 배분LIST · 온라인 · 지시 조회)이 폐기돼 주소로 들어가도 WMS 재고로 되돌려집니다
//    (site/js/views-cs.js: k !== 'order' 일 때만 그 탭을 씀). 아래 점검은 전부 그 화면을 열기 때문에 지금은 쓸 수 없습니다.
//    배분LIST 화면을 다시 살리면 바로 아래 두 줄(console.log · return)만 지우면 그대로 돌아갑니다.
//    DB 쪽 배분LIST 규칙(erp_cs_alloc · erp_cs_alloc_merge)은 test/sqltest.mjs 에서 그대로 점검합니다.
console.log('SKIP 배분LIST 화면 폐기 — 점검하지 않음 (DB 규칙은 sqltest.mjs)');
return;
const { chromium } = require('playwright'); const X = require('xlsx'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; const FX = __dirname + '/fx/';
const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
// 예시 파일 (가짜 자료): 핑(1) · 팬텀(2) · 파리게이츠(5) · 등록 안 된 코드(Q)
const K = ['패킹리스트(초두)]신상품 출고', '반응보충', '주문보충', '수기보충', '자동보충', '완불보충', 'B2C매장출고'];
const rows = [['의뢰구분', '매장코드', '매장명', '품번', '색상', '사이즈', '보충수량', '의뢰일자', '보충일자']]; const exp = {};
const add = (k, sc, sn, st, q) => { rows.push([K[k - 1] || k, sc, sn, st, 'BK', '95', q, kst, kst]); };
for (let i = 0; i < 7; i++) { add(i + 1, 'F1' + i, '매장' + i, '111F4OT20' + i, 10 + i); add(i + 1, 'F2' + i, '매장B' + i, '221F4PT10' + i, 20 + i); }
add(2, 'F30', '매장C', '531F4OT201', 5); add(3, 'F30', '매장C', '531F4OT202', 0); add(4, 'F31', '매장D', 'Q11F4OT201', 3);
const save = (name, rr) => { const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([rows[0]].concat(rr)), '배분LIST'); X.writeFile(wb, FX + name); };
save('cs_alloc.xlsx', rows.slice(1)); save('cs_alloc_ping.xlsx', rows.slice(1).filter((x) => /^1/.test(x[3]))); save('cs_alloc_rest.xlsx', rows.slice(1).filter((x) => !/^1/.test(x[3])));
const login = async (pg, id, pw) => { await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1200); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove())); };
const upload = async (pg, files) => { await pg.goto(URL + '#/cs?k=order&t=배분LIST&d=' + kst); await pg.waitForTimeout(900); await pg.click('#au'); await pg.waitForSelector('#cd input', { state: 'attached' }); await pg.setInputFiles('#cd input', (files || ['cs_alloc.xlsx']).map((f) => FX + f)); await pg.waitForFunction(() => document.querySelectorAll('#cr select').length >= 1); const k = await pg.$eval('#cr select', (s) => s.value); await pg.click('.modal .mf .btn.p'); await pg.waitForFunction(() => !document.querySelector('#cd'), null, { timeout: 60000 }); await pg.waitForTimeout(1500); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove())); return k; };
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await login(pg, 'admin', 'admin1234');
  // 예전(1103_6 · 7) 방식으로 남은 기록 (브랜드 = 숫자) 이 있어도 화면이 열려야 함
  await pg.evaluate(async (d) => HS.db.insert('erp_cs_file', { kind: 'order', sub: '배분LIST', ref_date: d, file_name: 'old.xlsx', rows: 5, qty: 10, summary: { brands: 3, gone: [] }, by_name: '예전' }), kst);
  await pg.goto(URL + '#/cs?k=order&t=배분LIST&d=' + kst); await pg.waitForTimeout(1200); ok(!/is not a function/.test(await pg.textContent('#body')) && /old\.xlsx/.test(await pg.textContent('#body')), '예전 기록이 있어도 화면 열림');
  const k = await upload(pg, ['cs_alloc_ping.xlsx']); ok(k === 'order:배분LIST', '배분LIST 자동 인식 (' + k + ')');
  let A0 = await pg.evaluate(async (d) => (await HS.db.list('erp_cs_alloc', { eq: { d, k: 'all' } })).map((r) => r.brand + '|' + r.qty), kst);
  ok(A0.indexOf('핑|91') >= 0 && !A0.some((x) => /^팬텀/.test(x)), '브랜드 파일 1 (핑)만 올림 → 핑만');
  ok(/등록 1 \/ /.test(await pg.textContent('#body')) && /남은 브랜드/.test(await pg.textContent('#body')), '진행률 · 남은 브랜드 표시');
  await upload(pg, ['cs_alloc_rest.xlsx']);
  A0 = await pg.evaluate(async (d) => (await HS.db.list('erp_cs_alloc', { eq: { d, k: 'all' } })).map((r) => r.brand + '|' + r.qty), kst);
  ok(A0.indexOf('핑|91') >= 0 && A0.indexOf('팬텀|161') >= 0 && A0.indexOf('|260') >= 0, '브랜드 파일 2 올려도 핑 그대로 · 합계 260 ' + JSON.stringify(A0));
  const A = await pg.evaluate(async (d) => (await HS.db.list('erp_cs_alloc', { eq: { d } })).map((r) => r.brand + '|' + r.k + '|' + r.qty), kst);
  ok(A.indexOf('핑|1|10') >= 0 && A.indexOf('핑|7|16') >= 0 && A.indexOf('팬텀|6|25') >= 0, '의뢰구분 7가지 · 품번 첫 글자 브랜드');
  ok(A.indexOf('파리게이츠|2|5') >= 0 && !A.some((x) => /^파리게이츠\|3\|/.test(x)), '보충수량 0 줄 제외');
  ok(A.some((x) => /^미등록 Q\|4\|3$/.test(x)), '등록 안 된 품번 코드 → 미등록');
  const t = await pg.textContent('#body'); ok(/반응보충/.test(t) && /매장 수/.test(t) && /등록 안 된 품번 코드/.test(t), '전산자료 배분LIST 화면'); await pg.screenshot({ path: SH + 'alloc1.png', fullPage: true });
  await pg.click('[data-b="핑"][data-k="2"]'); await pg.waitForTimeout(500); ok(/매장 1곳/.test(await pg.textContent('.modal')) && /F11/.test(await pg.textContent('.modal')), '숫자 누르면 매장 목록'); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  // 일일 마감 B2B
  const D = await pg.evaluate(async (d) => { const r = await HS.db.list('erp_daily_records', { eq: { rec_date: d, section: 'b2b' } }); const o = {}; r.forEach((x) => (o[x.rec_key] = x.data)); return o; }, kst);
  const P = D['핑'] || {}; ok(!D['미등록 Q'], '미등록 코드는 일일 마감에 넣지 않음'); ok(P.first_qty === 10 && P.order_qty === 11 + 12 + 13 + 14 && P.full_qty === 15 && P.online_order === 16, '일일 마감: 초도 · 판매분지시(2~5) · 완불 · 온라인지시 ' + JSON.stringify([P.first_qty, P.order_qty, P.full_qty, P.online_order]));
  await pg.goto(URL + '#/daily?d=' + kst + '&s=b2b'); await pg.waitForTimeout(1500); ok(/배분LIST/.test(await pg.textContent('#body')), '일일 마감 안내 줄');
  // 손 수정
  const ri = await pg.evaluate(() => { const ins = [...document.querySelectorAll('input[data-k="order_qty"]')]; const i = ins.findIndex((x) => x.value === '50'); return i >= 0 ? ins[i].dataset.r : null; });
  ok(ri != null, '판매분지시 50 칸 보임');
  await pg.fill('input[data-r="' + ri + '"][data-k="order_qty"]', '60'); await pg.click('.card .btn.p'); await pg.waitForTimeout(1500);
  ok(/손 수정 1칸/.test(await pg.textContent('#body')), '손 수정 1칸 표시'); await pg.screenshot({ path: SH + 'alloc2.png', fullPage: true });
  await upload(pg, ['cs_alloc_ping.xlsx']);
  let p2 = await pg.evaluate(async (d) => (await HS.db.list('erp_daily_records', { eq: { rec_date: d, section: 'b2b', rec_key: '핑' } }))[0].data, kst);
  ok(p2.order_qty === 60 && p2._src.order_qty === 50 && p2.first_qty === 10, '다시 올려도 손 수정 칸 유지 · 나머지는 파일 값');
  const A2 = await pg.evaluate(async (d) => (await HS.db.list('erp_cs_alloc', { eq: { d, brand: '핑', k: '1' } }))[0].qty, kst); ok(A2 === 10, '다시 올리면 바꿔 넣기 (두 번 안 더함)');
  await pg.goto(URL + '#/daily?d=' + kst + '&s=b2b'); await pg.waitForTimeout(1200); await pg.click('#arv'); await pg.waitForTimeout(300); await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(1200);
  p2 = await pg.evaluate(async (d) => (await HS.db.list('erp_daily_records', { eq: { rec_date: d, section: 'b2b', rec_key: '핑' } }))[0].data, kst); ok(p2.order_qty === 50 && !(p2._man || []).length, '파일 값으로 되돌리기');
  // 마감 → 올리기 막힘 → 관리자 해제
  await pg.goto(URL + '#/cs?k=order&t=배분LIST&d=' + kst); await pg.waitForTimeout(1000);
  const sk = await pg.$('[data-sk][data-on="1"]'); if (sk) { await sk.click(); await pg.waitForTimeout(800); }
  await pg.click('#acl'); await pg.waitForTimeout(400); ok(/마감/.test(await pg.textContent('.modal')), '마감 확인 창 (남은 브랜드 안내)'); await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(1200);
  ok(/배분LIST 마감/.test(await pg.textContent('#body')) && !(await pg.$('#au')), '마감 → 올리기 버튼 없어짐'); await pg.screenshot({ path: SH + 'alloc4_closed.png', fullPage: true });
  const er = await pg.evaluate(async (d) => { try { await HS.db.rpc('erp_cs_alloc_merge', { p_days: [d], p_brands: ['핑'], p_rows: [], p_parts: [], p_file: 'x', p_lines: 0, p_qty: 0, p_summary: {} }); return ''; } catch (e) { return e.message; } }, kst); ok(/마감/.test(er), '마감 후 올리기 막힘');
  await pg.click('#aop'); await pg.waitForTimeout(300); await pg.click('.modal .mf .btn.p'); await pg.waitForTimeout(1200); ok(!!(await pg.$('#au')), '관리자 마감 해제');
  // 대시보드 · 양식
  await pg.goto(URL + '#/csdash'); await pg.waitForTimeout(1000); ok(/배분LIST/.test(await pg.textContent('#body')) && /배분지시 현황/.test(await pg.textContent('#body')), '대시보드 항목 · 배분지시 현황'); await pg.screenshot({ path: SH + 'alloc3_dash.png', fullPage: true });
  await pg.click('#body [data-fmt="cs_alloc"]'); await pg.waitForTimeout(400); ok(/보충일자/.test(await pg.textContent('.modal')), '양식 보기 · 배분LIST');
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close();
})();
