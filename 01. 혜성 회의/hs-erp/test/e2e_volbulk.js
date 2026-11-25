// 물동량 대량 등록: 한 파일에 여러 달 · 파일 여러 개 · 달마다 미리보기(새로 넣음 / 덮어씀) · 읽지 않은 시트 · 금액 안 읽음
const { chromium } = require('playwright'); const X = require('xlsx'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; const FX = __dirname + '/fx/';
const PROCS = ['입고', '입고반품', '출고', '반품', '쿠팡출고'];
// 한 시트 = 일자 + [입고…쿠팡출고] 묶음 3번 (① 원자료 ② 조정 ③ 정산) · 금액 칸은 맨 뒤 (읽히면 안 됨)
const head = () => { const h = []; for (let i = 0; i < 3; i++) { h.push('일자'); PROCS.forEach((p) => h.push(p)); } h.push('단가'); h.push('금액'); return h; };
// 날짜별 정산 수량 = base + 날짜 · 원자료 · 조정은 일부러 다른 값
const sheet = (days, base) => {
  const rows = [head()];
  days.forEach((d, i) => {
    const r = []; const q = (k) => base + i + k;
    for (let blk = 0; blk < 3; blk++) { r.push(d); PROCS.forEach((p, k) => r.push(blk === 2 ? q(k) : blk === 0 ? 9999 : 1)); }
    r.push(12345); r.push(99999999); // 단가 · 금액 — 절대 읽히면 안 됨
    rows.push(r);
  });
  return X.utils.aoa_to_sheet(rows);
};
const daysOf = (ym, n) => Array.from({ length: n }, (_, i) => ym + '-' + String(i + 1).padStart(2, '0'));
const book = (name, sheets) => { const wb = X.utils.book_new(); sheets.forEach(([n, ws]) => X.utils.book_append_sheet(wb, ws, n)); X.writeFile(wb, FX + name); };
// 파일 1: 2025-11 · 2025-12 · 2026-01 (3개월) — 시트 이름에 달이 붙은 것(크리스(11월))도 섞음
const D = (ym) => daysOf(ym, 4);
book('vol_a.xlsx', [
  ['크리스', sheet(D('2025-11').concat(D('2025-12'), D('2026-01')), 100)],
  ['링스', sheet(D('2025-11').concat(D('2025-12'), D('2026-01')), 200)],
  ['로라(침구)', sheet(D('2025-11').concat(D('2025-12'), D('2026-01')), 300)],
  ['슈퍼웍스', sheet(D('2025-11').concat(D('2025-12'), D('2026-01')), 400)],
  ['표지', X.utils.aoa_to_sheet([['혜성물류 월마감 정산']])],
  ['금액합계', X.utils.aoa_to_sheet([['화주', '금액'], ['크리스', 123456789]])],
]);
// 파일 2: 2026-01 (겹침 · 값 다름) + 2026-02 (새 달)
book('vol_b.xlsx', [
  ['크리스', sheet(D('2026-01').concat(D('2026-02')), 1000)],
  ['링스', sheet(D('2026-01').concat(D('2026-02')), 2000)],
]);
const login = async (pg, id, pw) => { await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(1500); await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove())); };
const pick = async (pg, files) => { await pg.setInputFiles('.card input[type="file"][multiple]', files.map((f) => FX + f)); await pg.waitForSelector('#vreg', { timeout: 60000 }); await pg.waitForTimeout(400); };
// 달 × 화주 표: 표 도구가 'No' 칸 · 합계 줄을 더 넣으므로 칸 이름으로 찾음
const monTable = (fn, arg) => (pg) => pg.evaluate(fn, arg);
const cellOf = async (pg, ym, colName) => pg.evaluate(([y, cn]) => {
  const t = [...document.querySelectorAll('#vr table')].find((x) => /지금 DB/.test(x.rows[0].textContent));
  if (!t) return null; const th = [...t.rows[0].cells].map((c) => c.textContent.replace(/[▲▼]/g, '').trim());
  const dc = th.indexOf('달'), ci = th.indexOf(cn); if (dc < 0 || ci < 0) return null;
  const r = [...t.rows].find((x) => x.cells[dc] && x.cells[dc].textContent.trim() === y);
  return r ? r.cells[ci].textContent.replace(/\s+/g, ' ').trim() : null;
}, [ym, colName]);
const monthRows = (pg) => pg.evaluate(() => {
  const t = [...document.querySelectorAll('#vr table')].find((x) => /지금 DB/.test(x.rows[0].textContent));
  if (!t) return []; const dc = [...t.rows[0].cells].map((c) => c.textContent.trim()).indexOf('달');
  return [...t.rows].map((r) => (r.cells[dc] || {}).textContent || '').map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}$/.test(s));
});
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 1000 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await login(pg, 'admin', 'admin1234');
  await pg.goto(URL + '#/volume'); await pg.waitForTimeout(1200);
  ok(await pg.$('.card input[type="file"][multiple]'), '파일 여러 개 고를 수 있음');
  ok(/여러 개 가능/.test(await pg.textContent('#vpick')), '버튼: 파일 선택 (여러 개 가능)');
  // ---------- 1. 한 파일에 여러 달 ----------
  await pick(pg, ['vol_a.xlsx']);
  let t = await pg.textContent('#vh'); ok(/3개월/.test(t) && /시트 4개/.test(t), '머리글: 시트 4개 · 3개월 ' + t.replace(/\s+/g, ' ').slice(0, 90));
  const yms = await monthRows(pg);
  ok(JSON.stringify(yms) === JSON.stringify(['2025-11', '2025-12', '2026-01']), '달마다 한 줄 ' + JSON.stringify(yms));
  ok((await cellOf(pg, '2025-11', '지금 DB')) === '새로 넣음', '처음 올릴 때는 전부 새로 넣음');
  ok(!/덮어씁니다/.test(await pg.textContent('#vr')), '덮어쓸 달이 없으면 경고 줄 없음');
  // 금액 · 단가는 읽지 않음 (한 달 합계 = 정산 묶음 값만)
  // 크리스 2025-11: i=0..3, 수량 = (100+i+k), k=0..4 → 합계 = sum_i sum_k (100+i+k) = 4*5*100 + 5*(0+1+2+3) + 4*(0+1+2+3+4) = 2000+30+40 = 2070
  ok((await cellOf(pg, '2025-11', '크리스')) === '2,070', '크리스 2025-11 = 정산 묶음 값만 (2,070) — 원자료 9999 · 금액 미반영 ' + (await cellOf(pg, '2025-11', '크리스')));
  ok(/읽지 않은 시트 2개/.test(await pg.textContent('#vr')) && /표지/.test(await pg.textContent('#vr')) && /금액합계/.test(await pg.textContent('#vr')), '읽지 않은 시트: 표지 · 금액합계');
  ok(/로라\(침구\)/.test(await pg.textContent('#vr')), '시트 이름에 딴 말이 붙어도 화주 인식 (로라(침구))');
  ok(/3개월 등록/.test(await pg.textContent('#vreg')), '버튼에 몇 달인지 ' + (await pg.textContent('#vreg')));
  await pg.screenshot({ path: SH + 'volb1_one.png', fullPage: true });
  await pg.click('#vreg'); await pg.waitForTimeout(2500);
  ok(/m=2026-01/.test(pg.url()), '등록 뒤 마지막 달로 이동 ' + decodeURIComponent(pg.url()));
  const got = await pg.evaluate(async () => { const r = await HS.db.rpc('erp_volume_month', { p_from: '2025-01-01', p_to: '2026-12-31' }); const m = {}; (r || []).forEach((x) => { m[x.ym] = (m[x.ym] || 0) + (+x.qty || 0); }); return m; });
  ok(got['2025-11'] > 0 && got['2025-12'] > 0 && got['2026-01'] > 0, '3개월 다 들어감 ' + JSON.stringify(got));
  ok(!Object.values(got).some((v) => v > 1e6), '금액(99,999,999)이 수량으로 들어가지 않음 ' + JSON.stringify(got));
  // ---------- 2. 겹치는 달 → 덮어씀 표시 ----------
  await pg.goto(URL + '#/volume'); await pg.waitForTimeout(1200);
  await pick(pg, ['vol_b.xlsx']);
  t = await pg.textContent('#vr');
  ok(/이미 들어있는 달 1개를 덮어씁니다/.test(t), '겹치는 달 경고 줄 ' + (t.match(/이미[^—]*/) || [''])[0].trim());
  ok(/되돌릴 수 없습니다/.test(t), '되돌릴 수 없다는 안내');
  ok(/^덮어씀/.test(await cellOf(pg, '2026-01', '지금 DB')), '2026-01 = 덮어씀 ' + (await cellOf(pg, '2026-01', '지금 DB')));
  ok(/덮어씀 [\d,]+/.test(await cellOf(pg, '2026-01', '지금 DB')), '덮어쓰는 달은 지금 DB 값도 같이 보여줌 ' + (await cellOf(pg, '2026-01', '지금 DB')));
  ok((await cellOf(pg, '2026-02', '지금 DB')) === '새로 넣음', '2026-02 = 새로 넣음');
  await pg.screenshot({ path: SH + 'volb2_over.png', fullPage: true });
  const before = (await pg.evaluate(async () => { const r = await HS.db.rpc('erp_volume_month', { p_from: '2026-01-01', p_to: '2026-01-31' }); return (r || []).reduce((a, x) => a + (+x.qty || 0), 0); }));
  await pg.click('#vreg'); await pg.waitForTimeout(2500);
  const after = (await pg.evaluate(async () => { const r = await HS.db.rpc('erp_volume_month', { p_from: '2026-01-01', p_to: '2026-01-31' }); return (r || []).reduce((a, x) => a + (+x.qty || 0), 0); }));
  ok(after !== before && after > 0, '덮어쓰면 2026-01 값이 바뀜 (' + before + ' → ' + after + ')');
  const keep = await pg.evaluate(async () => { const r = await HS.db.rpc('erp_volume_month', { p_from: '2025-11-01', p_to: '2025-11-30' }); return (r || []).reduce((a, x) => a + (+x.qty || 0), 0); });
  ok(keep > 0, '파일에 없는 달(2025-11)은 그대로 ' + keep);
  // vol_b 에 없는 화주(로라 · 슈퍼웍스)의 2026-01 은 지워지면 안 됨
  const ow = await pg.evaluate(async () => { const r = await HS.db.rpc('erp_volume_month', { p_from: '2026-01-01', p_to: '2026-01-31' }); const m = {}; (r || []).forEach((x) => { m[x.owner] = (m[x.owner] || 0) + (+x.qty || 0); }); return m; });
  ok(ow['로라'] > 0 && ow['슈퍼웍스'] > 0, '파일에 없는 화주는 건드리지 않음 ' + JSON.stringify(ow));
  // ---------- 3. 파일 여러 개 한꺼번에 ----------
  await pg.goto(URL + '#/volume'); await pg.waitForTimeout(1200);
  await pick(pg, ['vol_a.xlsx', 'vol_b.xlsx']);
  t = await pg.textContent('#vh'); ok(/파일 2개/.test(t) && /4개월/.test(t), '파일 2개 → 합쳐서 4개월 ' + t.replace(/\s+/g, ' ').slice(0, 90));
  ok(/파일별로 읽은 것/.test(await pg.textContent('#vr')) && /뒤에 고른 파일/.test(await pg.textContent('#vr')), '파일별 표 · 겹칠 때 안내');
  // 겹치는 2026-01 크리스: 뒤 파일(vol_b) 값이 남아야 함 — vol_b 크리스 base 1000 → 4*5*1000+30+40 = 20,070
  ok((await cellOf(pg, '2026-01', '크리스')) === '20,070', '같은 달이 두 파일에 있으면 뒤 파일 값 ' + (await cellOf(pg, '2026-01', '크리스')));
  await pg.screenshot({ path: SH + 'volb3_multi.png', fullPage: true });
  await pg.click('#vreg'); await pg.waitForTimeout(3000);
  ok(/m=2026-02/.test(pg.url()), '등록 뒤 마지막 달(2026-02)로 이동 ' + decodeURIComponent(pg.url()));
  // ---------- 4. 물동량 파일이 아닌 것 ----------
  await pg.goto(URL + '#/volume'); await pg.waitForTimeout(1200);
  book('vol_bad.xlsx', [['아무거나', X.utils.aoa_to_sheet([['가', '나'], [1, 2]])]]);
  await pg.setInputFiles('.card input[type="file"][multiple]', [FX + 'vol_bad.xlsx']); await pg.waitForTimeout(1500);
  ok(/물동량 정산 파일이 아닙니다/.test(await pg.textContent('#vr')) && !(await pg.$('#vreg')), '엉뚱한 파일 → 안내 · 등록 버튼 없음');
  // ---------- 5. 권한 ----------
  const p2 = await b.newPage({ viewport: { width: 1440, height: 950 } }); p2.on('pageerror', (e) => errs.push(e.message));
  await login(p2, 'leader', '1234').catch(() => null);
  if (await p2.$('#body')) { await p2.goto(URL + '#/volume'); await p2.waitForTimeout(1500); ok(!(await p2.$('#vpick')), '현장 팀장: 올리기 칸 없음 (보기만)'); }
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close();
})();
