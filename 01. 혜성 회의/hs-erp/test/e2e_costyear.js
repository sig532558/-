// 원가관리 업무일지: 해마다 열 자리가 다른 것 (2026-11-12 · 매출 60조 사건)
//  · 2025년 모양: 업무구분(B) 상세업무(C) [공정단가(D)] 매출(F) 지출(G) 손익계산(H) → 블록 I부터
//  · 2026년 모양: 업무구분(B) 상세업무(C) 작업수량(D) 인원(E) 월손익(F) [공정단가(G)] 매출(I) … → 블록 L부터
//  G열을 단가로 고정해 읽으면 2025년 파일에서 '지출(금액)'을 단가로 써서 매출이 수조 원이 됨
const X = require('xlsx'); const fs = require('fs');
const P = require('../site/js/parsers.js');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const FX = __dirname + '/fx/'; fs.mkdirSync(FX, { recursive: true });
const Y = new Date().getFullYear();
const ser = (s) => Math.round((new Date(s + 'T00:00:00Z') - new Date('1899-12-30T00:00:00Z')) / 86400000);

// 공통: 3일치 블록 2개 · 업무 2줄 · 손익합계
function build(style, year, labor) {
  const g = [];
  const put = (r, c, v) => { (g[r] = g[r] || [])[c] = v; };
  put(0, 1, '정상1팀 업무일지');
  if (style === 2026) { put(1, 8, '평균인건비'); put(1, 9, labor); put(2, 8, '연장근무시급'); put(2, 9, 30000); }
  else { put(1, 5, '평균인건비'); put(1, 6, labor); put(2, 5, '연장근무시급'); put(2, 6, 28000); }
  const HR = 10; // 머리글 줄
  const base = style === 2026 ? ['업무구분', '상세업무', '작업수량', '인원', '월손익', '공정단가', null, '매출', '지출', '손익계산'] : ['업무구분', '상세업무', '공정단가', null, '매출', '지출', '손익계산'];
  base.forEach((v, i) => put(HR, i + 1, v));
  const blk = style === 2026 ? 11 : 8;            // 첫 블록 시작 칸
  const priceCol = style === 2026 ? 6 : 3;         // 공정단가 칸
  const money = style === 2026 ? 9 : 6;            // '지출(금액)' 칸 — 예전엔 여기를 단가로 읽었음
  [0, 1].forEach((k) => {                          // 블록 2개 (5칸 간격)
    const c = blk + k * 5;
    put(HR, c, '작업수량'); put(HR, c + 1, 'T.O');
    put(HR - 2, c + 2, ser(year + '-0' + (k + 1) + '-05'));
  });
  // 업무 2줄 + 손익합계
  [['출고', '출고', 188], ['정리', '입고솔리드정리', 29]].forEach(([grp, task, price], i) => {
    const r = HR + 1 + i;
    put(r, 1, i === 0 ? grp : null); put(r, 2, task);
    put(r, priceCol, price);
    put(r, money, 1234567); // 금액 칸 (단가로 잘못 읽히면 매출이 폭발)
    [0, 1].forEach((k) => { const c = blk + k * 5; put(r, c, 1000); put(r, c + 1, 2); });
  });
  put(HR + 3, 2, '손익합계');
  const ws = X.utils.aoa_to_sheet(g.map((r) => r || []));
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, '정상1팀 업무일지');
  return wb;
}
X.writeFile(build(2025, Y - 1, 153300), FX + 'cost_y2025.xlsx');
X.writeFile(build(2026, Y, 160390), FX + 'cost_y2026.xlsx');

const read = (f) => {
  const wb = X.readFile(FX + f);
  const out = P.analyze(wb, f);
  const x = out.find((z) => z.kind === 'worklog');
  const st = x && (x.sets || []).find((s) => s.table === 'worklog');
  const tm = x && (x.sets || []).find((s) => s.table === 'teams');
  const yc = x && (x.sets || []).find((s) => s.table === 'team_cost');
  return { rows: (st && st.rows) || [], teams: (tm && tm.rows) || [], yearCost: (yc && yc.rows) || [], warnings: (x && x.warnings) || [] };
};

// ---------- 1. 2026년 모양 ----------
const a = read('cost_y2026.xlsx');
ok(a.rows.length === 4, '2026년 모양: 업무 2줄 × 날짜 2개 = 4줄 (' + a.rows.length + ')');
const aPrice = [...new Set(a.rows.map((r) => +r.unit_price))].sort((x, y) => x - y);
ok(JSON.stringify(aPrice) === '[29,188]', '2026년 모양: 공정단가 29 · 188 (' + JSON.stringify(aPrice) + ')');
const aSales = a.rows.reduce((s, r) => s + r.qty * r.unit_price, 0);
ok(aSales === 434000, '2026년 모양: 매출 (1000×188 + 1000×29) × 2일 = 434,000 · 실제 ' + aSales.toLocaleString());
ok(a.teams.length === 1 && +a.teams[0].labor_cost === 160390, '올해 파일은 팀 인건비 160,390 반영');

// ---------- 2. 2025년 모양 (단가 칸이 D열) ----------
const b = read('cost_y2025.xlsx');
ok(b.rows.length === 4, '2025년 모양: 4줄 (' + b.rows.length + ')');
const bPrice = [...new Set(b.rows.map((r) => +r.unit_price))].sort((x, y) => x - y);
ok(JSON.stringify(bPrice) === '[29,188]', '2025년 모양: 공정단가도 29 · 188 (금액 1,234,567 을 단가로 읽지 않음) · ' + JSON.stringify(bPrice));
const bSales = b.rows.reduce((s, r) => s + r.qty * r.unit_price, 0);
ok(bSales === 434000, '2025년 모양: 매출도 434,000 · 실제 ' + bSales.toLocaleString());
ok(bSales < 1e9, '매출이 수조 원으로 터지지 않음');

// ---------- 3. 지난 해 파일은 팀 인건비를 덮지 않음 ----------
ok(b.teams.length === 0, '지난 해 파일: 팀 인건비 안 바꿈 (올해 지출이 틀어지므로)');
ok(b.warnings.some((w) => /지난 해 파일이라 기준정보의 팀 인건비/.test(w)), '왜 안 바꾸는지 알려 줌 · ' + (b.warnings.find((w) => /기준정보의 팀 인건비/.test(w)) || '').slice(0, 50));

// ---------- 4. 연도별 인건비 (sql/26_team_year_cost.sql) ----------
ok(a.yearCost.length === 1 && +a.yearCost[0].year === Y && +a.yearCost[0].labor_cost === 160390, '올해 파일 → ' + Y + '년 인건비 160,390 ' + JSON.stringify(a.yearCost));
ok(b.yearCost.length === 1 && +b.yearCost[0].year === Y - 1 && +b.yearCost[0].labor_cost === 153300, '지난 해 파일 → ' + (Y - 1) + '년 인건비 153,300 (그 해 줄로만) ' + JSON.stringify(b.yearCost));
ok(+b.yearCost[0].ot_rate === 28000, '연장근무 시급도 그 해 값으로 ' + b.yearCost[0].ot_rate);
ok(b.warnings.some((w) => new RegExp((Y - 1) + '년 인건비 153,300').test(w)), '어느 해 인건비로 들어가는지 알려 줌');

console.log('done');
