// 신상품 자료 업데이트: 한 파일에 여러 시즌이 섞여 있어도 체크한 시즌을 한 번에 등록
//  · 품번 4번째 글자 = 기획년도 (F=2026 · G=2027) · 5번째 = 시즌 (5 S/S · 6 F/W)
const { chromium } = require('playwright'); const X = require('xlsx'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; const FX = __dirname + '/fx/';
const BR = '1 (PING)';
// ① 신상품 정보 (화주 ERP 품번정보현황) — 2026 F/W 6개 · 2027 S/S 4개
// 기획년도 · 시즌은 화주 ERP 와 같은 글자 코드 (F=2026 · G=2027 / 6=F/W · 5=S/S)
const planRow = (st, i) => [BR, '정상', st[3], st[4], 'OT', st, 'BK', '', '2026-' + String((i % 9) + 1).padStart(2, '0') + '-15', 100 + i * 10, 'Y'];
const FW = Array.from({ length: 6 }, (_, i) => '111F6OT' + String(201 + i));
const SS = Array.from({ length: 4 }, (_, i) => '111G5OT' + String(301 + i));
const planHead = ['브랜드', '구분', '기획년도', '시즌', '아이템군', '품번', '색상', '세트구분', '출고예정일', '기획량', '사용여부'];
const wb1 = X.utils.book_new();
X.utils.book_append_sheet(wb1, X.utils.aoa_to_sheet([planHead].concat(FW.concat(SS).map(planRow))), '품번정보현황');
X.writeFile(wb1, FX + 'np_plan_2.xlsx');
// 2026 F/W 만 든 파일 (한 시즌일 때 화면 확인용)
const wb2 = X.utils.book_new();
X.utils.book_append_sheet(wb2, X.utils.aoa_to_sheet([planHead].concat(FW.map(planRow))), '품번정보현황');
X.writeFile(wb2, FX + 'np_plan_1.xlsx');
// ② 입고 현황 (WMS 입고반품 현황) — 두 시즌 섞어서 · '반품' 줄은 빼기
const inHead = ['브랜드', '일자', '입고구분', '기획년도', '시즌', '아이템군', '품번', '색상', '입고수량', '등록일자'];
const inRow = (st, q, kind) => [BR, '2026-09-10', kind || '입고', st[3], st[4], 'OT', st, 'BK', q, '2026-09-10'];
const wb3 = X.utils.book_new();
X.utils.book_append_sheet(wb3, X.utils.aoa_to_sheet([inHead].concat(
  FW.slice(0, 4).map((s, i) => inRow(s, 50 + i)),
  SS.slice(0, 2).map((s, i) => inRow(s, 70 + i)),
  [inRow(FW[0], 10, '반품')])), '입고반품현황');
X.writeFile(wb3, FX + 'np_in_2.xlsx');
const login = async (pg, id, pw) => { await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1500); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove())); };
const upTab = async (pg) => { await pg.goto(URL + '#/newprod?tab=up'); await pg.waitForSelector('.np3 .slot', { timeout: 20000 }); await pg.waitForTimeout(600); };
const drop = async (pg, slotNo, files) => { const ins = await pg.$$('.np3 .slot input[type="file"]'); await ins[slotNo].setInputFiles(files.map((f) => FX + f)); await pg.waitForTimeout(2500); };
const styleCount = (pg, season) => pg.evaluate(async (s) => (await HS.db.list('erp_np_style', { eq: { season: s }, select: 'style' }).catch(() => [])).length, season);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 1000 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await login(pg, 'admin', 'admin1234');
  // ---------- 1. 한 시즌만 든 파일 → 예전처럼 ----------
  await upTab(pg); await drop(pg, 0, ['np_plan_1.xlsx']);
  await pg.waitForSelector('#reg', { timeout: 30000 });
  // 2026-11-11: 한 시즌뿐이어도 '파일에 무엇이 들었는지' 보여 줌 (시즌 탭 휴먼 에러 막기) — 칩은 1개
  { const ck = await pg.$$eval('.npck', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
    ok(ck.length === 1 && /2026 F\/W/.test(ck[0]), '한 시즌만 들어 있으면 시즌 칸에 하나만 ' + JSON.stringify(ck)); }
  ok((await pg.textContent('#reg')).trim() === '등록', '한 시즌이면 버튼은 [등록] ' + (await pg.textContent('#reg')).trim());
  { const v = await pg.$$eval('#pv2 .kpi .v', (x) => x.map((e) => e.textContent.trim())); ok(v[0] === '6', '미리보기: 기획 품번 6 (파일을 제대로 읽음) ' + JSON.stringify(v)); }
  // ---------- 2. 두 시즌이 섞인 파일 ----------
  await upTab(pg); await drop(pg, 0, ['np_plan_2.xlsx']); await drop(pg, 1, ['np_in_2.xlsx']);
  await pg.waitForSelector('#reg', { timeout: 30000 }); await pg.waitForTimeout(600);
  ok(await pg.$('.npss'), '두 시즌이면 [등록할 시즌] 칸이 뜸');
  const chips = await pg.$$eval('.npck', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(chips.length === 2 && chips.some((c) => /2026 F\/W/.test(c)) && chips.some((c) => /2027 S\/S/.test(c)), '시즌 두 개 · 줄 수 표시 ' + JSON.stringify(chips));
  ok((await pg.$$eval('.npck input', (x) => x.every((e) => e.checked))), '처음에는 두 시즌 다 켜져 있음');
  ok(/2개 시즌 등록/.test(await pg.textContent('#reg')), '버튼: 2개 시즌 등록 ' + (await pg.textContent('#reg')).trim());
  ok(/2개 시즌을 한 번에 등록합니다/.test(await pg.textContent('#pv2')), '미리보기 위에 안내 줄');
  await pg.screenshot({ path: SH + 'nps1_two.png', fullPage: true });
  // 체크 하나 끄면 버튼 글씨가 바뀜
  await pg.uncheck('.npck input[data-ck="2027SS"]'); await pg.waitForTimeout(300);
  ok((await pg.textContent('#reg')).trim() === '등록', '하나만 고르면 버튼은 [등록] ' + (await pg.textContent('#reg')).trim());
  ok(/2026 F\/W/.test(await pg.textContent('#regn')) && !/2027/.test(await pg.textContent('#regn')), '등록할 시즌 안내도 같이 바뀜 ' + (await pg.textContent('#regn')).trim());
  await pg.check('.npck input[data-ck="2027SS"]'); await pg.waitForTimeout(300);
  ok(/2개 시즌 등록/.test(await pg.textContent('#reg')), '다시 켜면 2개 시즌 등록');
  // ---------- 3. 한 번에 등록 ----------
  await pg.click('#reg'); await pg.waitForTimeout(6000);
  const fw = await styleCount(pg, '2026FW'); const ss = await styleCount(pg, '2027SS');
  ok(fw === 6, '2026 F/W 품번 6개 등록 (' + fw + ')');
  ok(ss === 4, '2027 S/S 품번 4개 등록 (' + ss + ')');
  ok(/#\/newprod/.test(pg.url()) && /s=2027SS/.test(decodeURIComponent(pg.url())), '등록 뒤 가장 최근 시즌으로 이동 ' + decodeURIComponent(pg.url()));
  // 시즌마다 따로 계산됐는지: 입고 수량이 그 시즌 품번에만
  const inq = await pg.evaluate(async () => { const o = {}; for (const s of ['2026FW', '2027SS']) { const r = await HS.db.list('erp_np_style', { eq: { season: s }, select: 'style,in_qty' }); o[s] = r.reduce((a, x) => a + (+x.in_qty || 0), 0); } return o; });
  // 2026FW: 50+51+52+53 = 206 에서 반품 10 빼기 = 196 · 2027SS: 70+71 = 141
  ok(inq['2026FW'] === 196, '2026 F/W 입고 합계 196 (반품 10 뺌) ' + inq['2026FW']);
  ok(inq['2027SS'] === 141, '2027 S/S 입고 합계 141 ' + inq['2027SS']);
  // 시즌 탭에 두 시즌 다 생겼는지
  await pg.goto(URL + '#/newprod'); await pg.waitForTimeout(2000);
  const tabs = await pg.$$eval('#tools .seg button', (x) => x.map((e) => e.textContent.trim()));
  ok(tabs.some((t) => /2026 F\/W/.test(t)) && tabs.some((t) => /2027 S\/S/.test(t)), '현황 화면 시즌 탭에 두 시즌 ' + JSON.stringify(tabs));
  await pg.screenshot({ path: SH + 'nps2_after.png', fullPage: true });
  // ---------- 4. 다시 올려도 두 번 안 들어감 ----------
  await upTab(pg); await drop(pg, 0, ['np_plan_2.xlsx']); await pg.waitForSelector('#reg', { timeout: 30000 }); await pg.waitForTimeout(600);
  await pg.click('#reg'); await pg.waitForTimeout(6000);
  ok((await styleCount(pg, '2026FW')) === 6 && (await styleCount(pg, '2027SS')) === 4, '다시 올려도 품번 수 그대로 (6 · 4)');
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close();
})();
