// 신상품 ② 입고 현황 — 한 파일에 여러 시즌이 섞여 있어도 시즌 탭과 상관없이 알아서 넣기
//  · 2026-11-11: "시즌별로 올리다 보면 사람이 탭을 잘못 고른다" → 파일에 든 시즌을 모두 보고 넣을 수 있는 시즌만 켬
//  · 기획년도 · 시즌은 화주 ERP 와 같은 글자 코드 (F=2026 · G=2027 / 6=F/W · 5=S/S)
const { chromium } = require('playwright'); const X = require('xlsx'); const fs = require('fs');
const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; const FX = __dirname + '/fx/'; fs.mkdirSync(SH, { recursive: true }); fs.mkdirSync(FX, { recursive: true });
const BR = '1 (PING)';
const FW = ['111F6OT201', '111F6OT202'], SS = ['111F5OT301', '111F5OT302'], G5 = ['111G5OT401'];
// ① 신상품 정보 — 2026 F/W 2개 + 2026 S/S 2개 (2027 S/S 는 일부러 안 넣음)
const planHead = ['브랜드', '구분', '기획년도', '시즌', '아이템군', '품번', '색상', '세트구분', '출고예정일', '기획량', '사용여부'];
const planRow = (st, i) => [BR, '정상', st[3], st[4], 'OT', st, 'BK', '', '2026-0' + ((i % 8) + 1) + '-15', 500, 'Y'];
{ const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([planHead].concat(FW.concat(SS).map(planRow))), '품번정보현황'); X.writeFile(wb, FX + 'npin_plan.xlsx'); }
// ② 입고 현황 — 세 시즌이 섞인 한 파일 ('0 (입고)' 처럼 코드가 붙은 모양 그대로)
const inHead = ['브랜드', '일자', '입고구분', '기획년도', '시즌', '아이템군', '품번', '색상', '입고수량', '등록일자'];
const inRow = (st, q) => [BR, '2026-09-10', '0 (입고)', st[3] + ' (2026)', st[4] + ' (시즌)', '3 (OUTER)', st, 'BK', q, '2026-09-10'];
{ const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([inHead].concat([inRow(FW[0], 100), inRow(FW[1], 200), inRow(SS[0], 50), inRow(SS[1], 60), inRow(G5[0], 999)])), '입고반품현황');
  X.writeFile(wb, FX + 'npin_mix.xlsx'); }
// ②-2 그 뒤에 '새로 들어온 날' 만 든 파일 (누적 관리 확인용) — 앞 입고를 지우면 안 됨
{ const wb = X.utils.book_new();
  const r = inRow(FW[0], 7); r[1] = '2026-09-20'; r[9] = '2026-09-20';
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([inHead, r]), '입고반품현황');
  X.writeFile(wb, FX + 'npin_add.xlsx'); }

const upTab = async (pg, s) => { await pg.goto(URL + '#/newprod?tab=up' + (s ? '&s=' + s : '')); await pg.waitForSelector('.np3 .slot', { timeout: 20000 }); await pg.waitForTimeout(700); };
const drop = async (pg, slotNo, f) => { const ins = await pg.$$('.np3 .slot input[type="file"]'); await ins[slotNo].setInputFiles(FX + f); await pg.waitForTimeout(3000); };
const inQty = (pg, s) => pg.evaluate(async (ss) => { const r = await HS.db.list('erp_np_style', { eq: { season: ss }, select: 'style,in_qty' }).catch(() => []); return r.reduce((a, x) => a + (+x.in_qty || 0), 0); }, s);
const styles = (pg, s) => pg.evaluate(async (ss) => (await HS.db.list('erp_np_style', { eq: { season: ss }, select: 'style' }).catch(() => [])).length, s);

(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 1100 } }); const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1200);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));

  // ---------- 1. 먼저 ① 신상품 정보 (2026 F/W · 2026 S/S) 등록 ----------
  await upTab(pg); await drop(pg, 0, 'npin_plan.xlsx');
  await pg.waitForSelector('#reg', { timeout: 30000 }); await pg.waitForTimeout(600);
  await pg.click('#reg'); await pg.waitForTimeout(6000);
  ok((await styles(pg, '2026FW')) === 2 && (await styles(pg, '2026SS')) === 2, '밑자료: 2026 F/W 2개 · 2026 S/S 2개 품번 등록');

  // ---------- 2. 시즌 탭을 '일부러 틀리게' 두고 입고 파일만 올리기 ----------
  await upTab(pg, '2027SS'); await drop(pg, 1, 'npin_mix.xlsx');
  await pg.waitForSelector('.npss', { timeout: 30000 }); await pg.waitForTimeout(900);
  const chips = await pg.$$eval('.npck', (x) => x.map((e) => ({ t: e.textContent.replace(/\s+/g, ' ').trim(), off: e.classList.contains('off'), on: !!e.querySelector('input:checked') })));
  ok(chips.length === 3, '파일에 든 시즌 3개를 모두 보여 줌 ' + JSON.stringify(chips.map((c) => c.t)));
  ok(chips.filter((c) => c.on).length === 2 && chips.every((c) => (c.on ? !c.off : true)), '넣을 수 있는 2개 시즌만 켜져 있음 ' + JSON.stringify(chips));
  const g5 = chips.find((c) => /2027 S\/S/.test(c.t));
  ok(g5 && g5.off && /① 없음/.test(g5.t), '① 신상품 정보가 없는 2027 S/S 는 꺼 두고 이유를 적음 ' + (g5 && g5.t));
  const sel = await pg.$eval('#ss', (e) => e.value);
  ok(sel === '2026FW', '시즌 탭(2027 S/S)이 틀려도 미리보기는 넣을 수 있는 시즌으로 자동 ' + sel);
  ok(await pg.$('#reg'), '막히지 않고 등록 버튼이 나옴');
  ok(/2개 시즌 등록/.test(await pg.textContent('#reg')), '버튼: 2개 시즌 등록 ' + (await pg.textContent('#reg')).trim());
  await pg.screenshot({ path: SH + 'npin1.png', fullPage: true });

  // ---------- 3. 한 번에 등록 → 시즌마다 제 입고 수량 ----------
  await pg.click('#reg'); await pg.waitForTimeout(8000);
  ok((await inQty(pg, '2026FW')) === 300, '2026 F/W 입고 300 (100+200) ' + (await inQty(pg, '2026FW')));
  ok((await inQty(pg, '2026SS')) === 110, '2026 S/S 입고 110 (50+60) ' + (await inQty(pg, '2026SS')));
  ok((await styles(pg, '2027SS')) === 0, '① 없는 2027 S/S 는 들어가지 않음');

  // ---------- 4. 다시 올려도 두 번 안 더해짐 ----------
  await upTab(pg, '2027SS'); await drop(pg, 1, 'npin_mix.xlsx');
  await pg.waitForSelector('#reg', { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.click('#reg'); await pg.waitForTimeout(8000);
  ok((await inQty(pg, '2026FW')) === 300 && (await inQty(pg, '2026SS')) === 110, '다시 올려도 입고 수량 그대로 (300 · 110)');

  // ---------- 4-2. 누적 관리: 새 날짜만 든 파일을 올려도 앞 입고가 지워지지 않음 ----------
  await upTab(pg, '2026FW'); await drop(pg, 1, 'npin_add.xlsx');
  await pg.waitForSelector('#reg', { timeout: 30000 }); await pg.waitForTimeout(900);
  const acc = (await pg.textContent('#pv2')).replace(/\s+/g, ' ');
  ok(/입고는 누적으로 관리합니다/.test(acc), '누적 관리라고 알려 줌');
  ok(/이번 파일 1줄 중 새로 들어온 줄 1개/.test(acc), '이번 파일 1줄 · 새 줄 1개 ' + (acc.match(/이번 파일[^·]*·[^→]*→ 누적 \d+줄/) || [''])[0]);
  ok(/누적 6줄/.test(acc), '누적 6줄 (앞 5줄 + 새 1줄) ' + (acc.match(/누적 \d+줄/) || [''])[0]);
  await pg.click('#reg'); await pg.waitForTimeout(8000);
  ok((await inQty(pg, '2026FW')) === 307, '2026 F/W 입고 307 (앞 300 + 새 7) ' + (await inQty(pg, '2026FW')));
  ok((await inQty(pg, '2026SS')) === 110, '다른 시즌(2026 S/S 110)도 그대로 ' + (await inQty(pg, '2026SS')));
  await pg.screenshot({ path: SH + 'npin3_acc.png', fullPage: true });
  // 같은 파일을 또 올리면 새 줄 0
  await upTab(pg, '2026FW'); await drop(pg, 1, 'npin_add.xlsx'); await pg.waitForSelector('#reg', { timeout: 30000 }); await pg.waitForTimeout(900);
  ok(/새로 들어온 줄 0개/.test((await pg.textContent('#pv2')).replace(/\s+/g, ' ')), '같은 파일을 또 올리면 새 줄 0개');

  // ---------- 5. 맞는 시즌 탭에서는 그 시즌이 먼저 보임 ----------
  await upTab(pg, '2026SS'); await drop(pg, 1, 'npin_mix.xlsx');
  await pg.waitForSelector('#ss', { timeout: 30000 }); await pg.waitForTimeout(900);
  ok((await pg.$eval('#ss', (e) => e.value)) === '2026SS', '시즌 탭이 파일에 있으면 그 시즌을 먼저 보여 줌');

  // ---------- 6. 넣을 수 있는 시즌이 하나도 없으면 왜 안 되는지 알려 줌 ----------
  await pg.evaluate(async () => { for (const s of ['2026FW', '2026SS']) { const r = await HS.db.list('erp_np_style', { eq: { season: s }, select: 'style' }); for (const x of r) await HS.db.remove('erp_np_style', { season: s, style: x.style }); } });
  await upTab(pg, '2027SS'); await drop(pg, 1, 'npin_mix.xlsx'); await pg.waitForTimeout(2500);
  const pv = (await pg.textContent('#pv2')).replace(/\s+/g, ' ');
  ok(/파일은 잘 읽었습니다/.test(pv), '파일은 읽었다고 먼저 알려 줌 ' + pv.slice(0, 80));
  ok(/① 신상품 정보/.test(pv) && /2026 F\/W/.test(pv), '왜 안 되는지 · 파일에 든 시즌을 알려 줌');
  await pg.screenshot({ path: SH + 'npin2_block.png', fullPage: true });

  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
