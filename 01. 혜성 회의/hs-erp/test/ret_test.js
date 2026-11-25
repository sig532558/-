// 반품 관리 계산 점검 — 반품 관리 V1.211 엑셀의 대장 시트 값과 대조
const XLSX = require('xlsx'); const fs = require('fs'); const R = require('../site/js/returns.js');
const AT = '/mnt/user-data/attachments/7e416561-536b-572f-95a3-857922cfaa8e/';
const F = AT + fs.readdirSync(AT).find((f) => f.startsWith('e48502b0'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const B = { 핑: ['핑', 'PING', '1'], 팬텀: ['펜텀', 'FANTOM', '2'], 파리게이츠: ['파리', 'PEARLY GATES', '5'], 마스터바니: ['바니', 'MASTER BUNNY', '4'], 고커: ['GOKER', '6'], 세인트앤드류스: ['세인트', 'ST ANDREWS', '8'], 하이드로겐: ['하이', 'HYDROGEN', 'H'], 마무트: ['MAMMUT', 'M'], 앤드원더: ['앤드', 'AND WANDER', 'W'], 베셀: ['VESSEL', 'S'], 링스: ['LYNX', 'L'], V12: ['VTWELVE', 'V'] };
const ix = {}; for (const n in B) { ix[n.toUpperCase()] = n; B[n].forEach((a) => (a.length > 1 ? (ix[a.toUpperCase().replace(/\s/g, '')] = n) : (ix['C:' + a] = n))); }
const brandOf = (t) => { if (!t) return null; const s = String(t).trim(); const m = s.match(/^([0-9A-Za-z])\s*\((.+)\)$/); if (m) return ix['C:' + m[1].toUpperCase()] || ix[m[2].toUpperCase().replace(/\s/g, '')] || null; return ix[s.toUpperCase().replace(/\s/g, '')] || null; };
const t0 = Date.now();
const wb = XLSX.read(fs.readFileSync(F), { type: 'buffer', cellFormula: false, cellHTML: false, cellText: false });
const d = R.readBook(wb.SheetNames.map((n) => ({ name: n, ws: wb.Sheets[n] })), 'V1.211.xlsx', null, brandOf);
console.log('읽기', Date.now() - t0, 'ms'); console.log(d.found.map((x) => x.sheet + '→' + x.kind + ' ' + x.rows + (x.skip ? ' (건너뜀 ' + x.skip + ')' : '')).join(' | ')); console.log('miss', d.miss.map((x) => x.sheet).join(','), 'noBrand', d.noBrand.length);
// 시트 값 (data_only 대신 SheetJS 저장된 결과값)
const L = XLSX.utils.sheet_to_json(wb.Sheets['일별 반품 관리 대장 전표'], { header: 1, raw: true });
const P = XLSX.utils.sheet_to_json(wb.Sheets['일별반품 관리대장 PCS'], { header: 1, raw: true });
const SB = ['핑', '팬텀', '파리게이츠', '마스터바니', '고커', '세인트앤드류스', '하이드로겐', '마무트', '앤드원더', '베셀', '링스', 'V12'];
const PB = ['핑', '팬텀', '파리게이츠', '마스터바니', '고커', '세인트앤드류스', '하이드로겐', '마무트', '베셀', '링스', 'V12'];
const agg = R.doneAgg(d.done); const DM = {}; agg.rows.forEach((r) => (DM[r.rec_date + '|' + r.brand] = r));
const pend = R.pendMerge(d.req, {}); const PA = {}; R.pendAgg(pend).forEach((r) => (PA[r.d + '|' + r.brand] = r));
const bagSum = (kind, dt) => d.bags.filter((b) => b.kind === kind && b.rec_date === dt).reduce((a, b) => a + b.box, 0);
let badS = 0, badP = 0, badB = 0, nd = 0;
for (const row of L.slice(6)) {
  const dt = R.day(row[0]); if (!dt || !/^2026-(09|10)/.test(dt)) continue; nd++;
  SB.forEach((b, i) => { const v = (DM[dt + '|' + b] || {}).slips || 0; if (v !== (+row[11 + i] || 0)) { badS++; if (badS < 5) console.log('완료전표', dt, b, v, row[11 + i]); } });
  SB.forEach((b, i) => { const v = (PA[dt + '|' + b] || {}).slips || 0; if (v !== (+row[24 + i] || 0)) { badS++; if (badS < 8) console.log('미처리전표', dt, b, v, row[24 + i]); } });
  if (bagSum('행낭', dt) !== (+row[3] || 0) || bagSum('타택배', dt) !== (+row[4] || 0)) { badB++; if (badB < 5) console.log('박스', dt, bagSum('행낭', dt), row[3], bagSum('타택배', dt), row[4]); }
}
for (const row of P.slice(5)) {
  const dt = R.day(row[0]); if (!dt || !/^2026-(09|10)/.test(dt)) continue;
  PB.forEach((b, i) => { const v = (DM[dt + '|' + b] || {}).pcs || 0; if (v !== (+row[1 + i] || 0)) { badP++; if (badP < 5) console.log('완료PCS', dt, b, v, row[1 + i]); } });
  PB.forEach((b, i) => { const v = (PA[dt + '|' + b] || {}).pcs || 0; if (v !== -(+row[14 + i] || 0)) { badP++; if (badP < 8) console.log('미처리PCS', dt, b, v, row[14 + i]); } });
}
ok(nd >= 55, '대장 날짜 ' + nd + '일 대조');
ok(badS === 0, '전표 (당일 완료 · 전산 미처리) 시트와 일치 · 다른 칸 ' + badS);
ok(badP === 0, 'PCS (전산 완료 · 미처리) 시트와 일치 · 다른 칸 ' + badP);
ok(badB === 0, '행낭 · 기타(타택배) BOX 시트와 일치 · 다른 날 ' + badB);
const totPend = pend.reduce((a, p) => a + p.rows.filter((x) => x.open).length, 0); const totPcs = pend.reduce((a, p) => a + p.rows.reduce((s, x) => s + x.pend, 0), 0);
ok(totPend === 1638 && totPcs === 53738, '미처리 합계 1,638 전표 · 53,738 PCS → ' + totPend + ' · ' + totPcs);
ok(agg.rows.reduce((a, r) => a + r.pcs, 0) === 972209, '반품 확정 PCS 합계 972,209');
ok(d.bags.filter((b) => b.kind === '행낭').length > 13000 && d.bags.filter((b) => b.kind === '타택배').length > 1000, '행낭 ' + d.bags.filter((b) => b.kind === '행낭').length + ' · 타택배 ' + d.bags.filter((b) => b.kind === '타택배').length);
ok(new Set(d.bags.map((b) => b.source_key)).size === d.bags.length, '행낭·타택배 중복 없는 키 (다시 올려도 두 번 안 들어감)');
ok(d.box.length > 30 && d.box.length < 70 && d.box.find((b) => b.rec_date === '2026-10-28').lotte === 236, '박스 수불 이관 ' + d.box.length + '일 · 10/28 롯데 236');
// 슬롯 제한: 매장 반품 칸에 출고반품현황만 있는 파일 → 거부
const only = R.readBook([{ name: '출고반품현황', ws: wb.Sheets['출고반품현황'] }], 'x.xlsx', R.SLOT.req, brandOf);
ok(only.found.length === 0 && only.miss.length === 1, '매장 반품 칸은 출고 반품 현황 거부 · 빠진 열 ' + JSON.stringify(only.miss[0] && only.miss[0].miss));
// 범위 병합: 10/20~10/28만 다시 올리면 그 밖의 미처리는 유지
const part = d.req.filter((r) => r.brand === '팬텀' && r.d >= '2026-10-20');
const old = Object.fromEntries(pend.map((p) => [p.brand, p]));
const m2 = R.pendMerge(part.map((r) => Object.assign({}, r, { out_date: '2026-10-29', pend: 0 })), old)[0];
ok(m2.rows.filter((x) => x.open).length === old['팬텀'].rows.filter((x) => x.open && x.d < '2026-10-20').length, '일부 기간만 올리면 그 기간만 바뀌고 나머지 미처리 유지');
