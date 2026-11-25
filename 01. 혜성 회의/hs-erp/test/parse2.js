// 추가 기능 파서 검증 (실제 엑셀과 대조)
const XLSX = require('xlsx'); const P2 = require('../site/js/parsers2.js'); const fs = require('fs');
const B = { 핑: ['PING', '1', ['PING', '핑']], 팬텀: ['FANTOM', '2', ['FANTOM', '펜텀', '팬텀']], 파리게이츠: ['PEARLY GATES', '5', ['PEARLY GATES', '파리', '파리게이츠']], 마스터바니: ['MASTER BUNNY', '4', ['MASTER BUNNY', 'MASTER BUNNY EDITION', '바니', '마바']], 고커: ['GOKER', '6', ['GOKER']], 세인트앤드류스: ['ST ANDREWS', '8', ['ST ANDREWS', '세인트', '세인트앤드류스']], 하이드로겐: ['HYDROGEN', 'H', ['HYDROGEN', '하이']], 마무트: ['MAMMUT', 'M', ['MAMMUT', '마므트']], 앤드원더: ['and wander', 'W', ['AND WANDER', '앤드']], 베셀: ['VESSEL', 'S', ['VESSEL']], 보기보이즈: ['bogeyboys', 'B', ['BOGEYBOYS']], 링스: ['LYNX', 'L', ['LYNX']], V12: ['V12', 'V', ['VTWELVE', 'V12', '브이트웰브']], 로라애슐리: ['LAURA ASHLEY', 'R', ['LAURA ASHLEY', '로라']], 용품볼: ['용품사업부', '9', ['용품사업부']] };
const OWN = { 링스: 'LX', V12: 'LX' };
const bkey = (s) => { let t = String(s == null ? '' : s).trim(); const m = t.match(/^\s*[0-9A-Za-z]{1,2}\s*\((.+)\)\s*$/); if (m) t = m[1]; return t.toUpperCase().replace(/[\s　·._\-\[\]()]/g, ''); };
const ix = {}; for (const n in B) { [n, B[n][0], ...B[n][2]].forEach((a) => { ix[bkey(a)] = ix[bkey(a)] || n; }); ix['CODE:' + B[n][1]] = n; }
const brandOf = (t) => { if (!t) return null; const k = bkey(t); if (ix[k]) return ix[k]; const m = String(t).match(/^\s*([0-9A-Za-z])\s*\(/); return m ? ix['CODE:' + m[1].toUpperCase()] || null : null; };
const A = '/mnt/user-data/attachments/7e416561-536b-572f-95a3-857922cfaa8e/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
// 1) 출고지시
const wb1 = XLSX.read(fs.readFileSync(A + 'abf8d2c5-01._____2026______.xlsx'), { type: 'buffer' });
let O = [], D = [], W = [];
for (const n of wb1.SheetNames) { const r = P2.parseOrderSheet(n, wb1.Sheets[n], brandOf); if (r) { O.push(...r.orders); D.push(...r.days); W.push(n + ':' + r.format + ' ' + r.warnings.join(';')); } }
console.log(W.join('\n'));
const day = (d, sec) => O.filter((o) => o.rec_date === d && o.section === sec);
const s1027 = day('2026-10-27', 'sale'); const sum = (a, k) => a.reduce((x, o) => x + (+o[k] || 0), 0);
ok(sum(s1027, 'qty') === 1386 && sum(day('2026-10-27', 'pre'), 'qty') === 899, '10/27 판매분 1,386 · 선지시 899');
const ch = Object.fromEntries(day('2026-10-27', 'b2c_ch').map((o) => [o.brand, o]));
ok(ch['크리스'].cnt === 584 && ch['크리스'].qty === 760 && ch.LX.cnt === 337 && ch['어드민'].qty === 1278, '10/27 B2C 크리스 584·760 · LX 337 · 어드민 1,278');
const d27 = D.find((d) => d.rec_date === '2026-10-27');
ok(d27.prev.b2c_qty === 3421 && Object.values(d27.prev.sale).reduce((a, b) => a + b, 0) === 2486, '10/27 엑셀 전년값 판매 2,486 · B2C 3,421');
const s25 = sum(day('2025-10-28', 'sale'), 'qty'); ok(s25 === 2486, '2025-10-28 (25년 양식) 판매분 ' + s25);
ok(day('2025-10-01', 'pre').some((o) => o.brand === '핑' && o.qty === 1562), '25년 양식 특이사항 PING 1,562');
ok(new Set(O.map((o) => o.rec_date)).size > 250, '불러온 날짜 ' + new Set(O.map((o) => o.rec_date)).size + '일');
// 2) 사방넷
for (const [sh, ec, eq] of [['크리스', 584, 760], ['LX', 337, 444]]) {
  const r = P2.parseSabang(wb1.Sheets[sh], brandOf, (b) => OWN[b] || '크리스');
  const o = r.owners[sh === 'LX' ? 'LX' : '크리스'];
  ok(o.cnt === ec && o.qty === eq, sh + ' 사방넷 배송지 ' + o.cnt + ' · 수량 ' + o.qty + ' · 브랜드 ' + JSON.stringify(r.brands) + ' · 미등록 ' + r.unknown);
  ok(!JSON.stringify(r).match(/서울|010-/), sh + ' 결과에 개인정보 없음');
}
// 3) KPI
const wb3 = XLSX.read(fs.readFileSync(A + '251dc830-____Daily_KPI_Report_202609.xlsx'), { type: 'buffer' });
ok(P2.isKpiBook(wb3), 'KPI 리포트 인식');
const K = P2.parseKpiBook(wb3, brandOf); console.log('KPI', K.team, K.kpi.length, K.dates.length + '일', K.warnings);
const kv = (d, sh, m, b) => sum(K.kpi.filter((k) => k.work_date === d && k.sheet === sh && k.metric === m && k.brand === (b || '')), 'value');
ok(kv('2026-09-01', 'first', '초도PCS') === 10109 && kv('2026-09-01', 'out', '판매분') === 4232 && kv('2026-09-01', 'ret', '수시') === 3388 && kv('2026-09-01', 'in', 'Units') === 1968, '9/1 초도 10,109 · 판매분 4,232 · 수시 3,388 · 입고 1,968');
ok(kv('2026-09-01', 'first', '인원') + kv('2026-09-01', 'out', '인원') + kv('2026-09-01', 'box', '인원') === 10, '9/1 출고 T.O 10 (초도+출고+배출)');
const mo = (sh, m, b) => sum(K.kpi.filter((k) => k.sheet === sh && k.metric === m && k.brand === (b || '')), 'value');
const outTot = mo('first', '초도PCS') + ['온라인', '판매분', '오픈', '행사'].reduce((a, m) => a + mo('out', m), 0);
ok(outTot === 354663, '9월 출고 합계 ' + outTot + ' (KPI 354,663)');
const pingOut = mo('first', '초도PCS', '핑') + ['온라인', '판매분', '오픈', '행사'].reduce((a, m) => a + mo('out', m, '핑'), 0);
ok(pingOut === 80565, '9월 PING 출고 ' + pingOut);
const toT = ['in', 'first', 'out', 'box', 'ret', 'etc'].reduce((a, s) => a + mo(s, '인원'), 0); ok(Math.abs(toT - 398) < 0.5, '9월 총 T.O ' + toT + ' · ' + ['in', 'first', 'out', 'box', 'ret', 'etc'].map((s) => s + ' ' + mo(s, '인원')).join(' '));
ok(K.days.find((d) => d.work_date === '2026-09-02').office_count === 2, '9/2 지원·반품 사무 2명');
// 4) 신상품
const wb4 = XLSX.read(fs.readFileSync(A + '89cf0660-2026__F_W_____________V8.04.xlsx'), { type: 'buffer' });
const data = P2.readNpFiles(wb4.SheetNames.map((n) => ({ name: n, ws: wb4.Sheets[n] })));
console.log(data.found);
const rows = P2.computeNp(data, '2026FW', brandOf); const S = P2.npSummary(rows);
console.log(JSON.stringify(S.tot));
ok(S.tot.st === 2207 && S.tot.in === 2011 && S.tot.notin === 196 && S.tot.out === 2005 && S.tot.notout === 6, '신상품 기획 2,207 · 입고 2,011 · 미입고 196 · 출고 2,005 · 미출고 6');
ok(S.by['마무트'].st === 209 && S.by['마무트'].in === 142 && S.by['하이드로겐'].in === 48, 'MAMMUT 209/142 · HYDROGEN 48');
console.log('출고후 미정리', S.tot.unclean, '전체 미정리', S.tot.unclean_all, '불량', S.tot.defect, Object.fromEntries(Object.entries(S.by).map(([k, v]) => [k, v.unclean])));
const fl = {}; rows.forEach((r) => r.flags.forEach((f) => (fl[f] = (fl[f] || 0) + 1))); console.log('flags', fl);
const ref = {}; XLSX.utils.sheet_to_json(wb4.Sheets['전체 데이터'], { header: 1, range: 2 }).forEach((r) => { if (r[5]) ref[r[5]] = r[8]; });
let wk = 0, wn = 0; rows.forEach((r) => { if (ref[r.style] && r.plan_date) { wn++; if (P2.weekTh(r.plan_date) === ref[r.style]) wk++; } });
ok(wk / wn > 0.97, '전개 주차 규칙 일치 ' + wk + '/' + wn); console.log(rows.filter((r) => ref[r.style] && r.plan_date && P2.weekTh(r.plan_date) !== ref[r.style]).slice(0, 8).map((r) => r.style + ' ' + r.plan_date + ' ' + P2.weekTh(r.plan_date) + ' vs ' + ref[r.style]).join('\n'));
// 5) 신상품 3칸 업로드 — 칸마다 그 자료만 · 출고 현황 별도 파일
{
  const U = '/root/.claude/uploads/7e416561-536b-572f-95a3-857922cfaa8e/';
  const V7 = U + '98a419f4-01._2026_________________V7.17.xlsx';
  const sh = (wb) => wb.SheetNames.map((n) => ({ name: n, ws: wb.Sheets[n] }));
  if (fs.existsSync(V7)) {
    const w7 = XLSX.read(fs.readFileSync(V7), { type: 'buffer' });
    const r3 = P2.readNpFiles(sh(w7), P2.NP_SLOT.out);
    ok(r3.found.length === 0 && r3.miss.length > 0, '정산서를 3번 출고 칸에 넣으면 거부 · 빠진 열 ' + JSON.stringify(r3.miss[0] && r3.miss[0].miss));
    const ra = P2.readNpFiles(sh(XLSX.read(fs.readFileSync(V7), { type: 'buffer' })), null);
    ok(new Set(ra.found.map((x) => x.kind)).size < 2, '정산서는 예비 경로(관리 엑셀)에서 거부 (자료 1종)');
  }
  const w8 = () => XLSX.read(fs.readFileSync(A + '89cf0660-2026__F_W_____________V8.04.xlsx'), { type: 'buffer' });
  const rp = P2.readNpFiles(sh(w8()), P2.NP_SLOT.plan);
  ok(rp.found.length === 1 && rp.found[0].kind === 'plan' && rp.inbound.length === 0 && rp.stock.length === 0, '1번 칸은 품번 정보만 받음 (' + rp.plan.length + '줄)');
  const ri = P2.readNpFiles(sh(w8()), P2.NP_SLOT.inbound);
  ok(ri.found.length === 1 && ri.found[0].kind === 'inbound' && ri.found[0].qty > 0, '2번 칸은 입고 현황만 받음 (' + ri.found[0].qty + 'PCS)');
  // 출고 현황 별도 파일 (품번 · 색상 · 출고일자 · 출고수량)
  const all = P2.readNpFiles(sh(w8()), null);
  const st = {}; all.stock.forEach((r) => (st[r.style] = (st[r.style] || 0) + r.out));
  const aoa = [['출고 현황'], ['품번', '색상', '출고일자', '출고수량']]; Object.entries(st).forEach(([s, q]) => { if (q) aoa.push([s, 'BK', '2026-10-28', q]); });
  const ow = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(ow, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
  const ro = P2.readNpFiles(sh(ow), P2.NP_SLOT.out);
  ok(ro.found.length === 1 && ro.found[0].kind === 'out' && ro.out.length === aoa.length - 2, '3번 칸: 출고 현황 파일 인식 ' + ro.out.length + '줄');
  const d2 = Object.assign({}, all, { out: ro.out, stock: [] });
  const S2 = P2.npSummary(P2.computeNp(d2, '2026FW', brandOf)).tot;
  ok(S2.out === 2005, '출고 현황 파일만으로 출고 완료 ' + S2.out + ' (재고 현황 기준과 동일 2,005)');
  const ro0 = P2.readNpFiles(sh(ow), P2.NP_SLOT.inbound);
  ok(ro0.found.length === 0 && ro0.miss[0].miss.indexOf('입고수량') >= 0, '출고 파일을 2번 입고 칸에 넣으면 거부 · "입고수량" 열 없음 안내');
}
