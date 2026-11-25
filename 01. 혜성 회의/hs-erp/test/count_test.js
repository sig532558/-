// 재고 실사 계산 점검 — 실제 WMS 재고현황(신상품 파일 '재고 현황' 시트) + 모의 실사 자료
const XLSX = require('xlsx'); const C = require('../site/js/count.js'); const glob = require('fs');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const dir = '/mnt/user-data/attachments/7e416561-536b-572f-95a3-857922cfaa8e/';
const f = glob.readdirSync(dir).find((x) => x.startsWith('89cf0660'));
const wb = XLSX.readFile(dir + f); const rows = XLSX.utils.sheet_to_json(wb.Sheets['재고 현황'], { header: 1, raw: true, defval: '' });
const p = C.parse(rows);
ok(p && p.kind === 'sys', '전산 재고 파일 자동 인식 (' + (p && p.kind) + ')');
ok(p.rows.length === 4037, '줄 수 4,037 = ' + p.rows.length);
const s = p.rows.reduce((a, r) => [a[0] + r[4], a[1] + r[5], a[2] + r[6]], [0, 0, 0]);
ok(s[0] === 110150 && s[1] === 13364 && s[2] === 96786, '현재고 110,150 · 미래 13,364 · 누적 96,786 = ' + s.join(' / '));
ok(p.meta.multiLoc, '한 칸에 위치 여러 개 → SKU 비교 자동 선택');
const brandOf = (x) => { const m = String(x).match(/\(([^)]+)\)/); return m ? m[1] : (String(x).startsWith('CODE:') ? null : x); };
// 모의 실사: 위치마다 나눠 스캔 (구역 1F 전체 + 2F 일부)
const act = [];
let k = 0;
for (const r of p.rows) {
  const locs = r[0] ? r[0].split(' ') : []; if (!locs.length || r[4] <= 0) continue;
  const per = Math.floor(r[4] / locs.length); let left = r[4];
  locs.forEach((l, i) => { const q = i === locs.length - 1 ? left : per; left -= q; act.push([l, r[1], r[2], '', q, 0, '']); });
}
// 차이 만들기: 3개 SKU 부족, 1개 과잉, 1개 미등록, 바코드 1건
const t0 = act.findIndex((x) => x[1] === '111F3TF101' && x[2] === 'MG'); act[t0][4] -= 5;
const t1 = act.findIndex((x) => x[1] === 'H11F3FH208' && x[2] === 'BG'); act[t1][4] += 2;
act.push([act[0][0], 'ZZ1F3PT999', 'BK', '', 4, 0, '']);
const bcRow = act.find((x) => x[1] === 'H31F3FH292' && x[2] === 'BK'); bcRow[4] -= 1; act.push([bcRow[0], 'H31F3FH292BK', '', '', 1, 1, '']); // 바코드 스캔 1개
const res = C.compute({ sys: p.rows, act: [{ file: 'a.xlsx', at: '1', rows: act }] }, { level: 'auto', cmp: 'cur', loss: 'excl', base_year: 2026 }, brandOf);
const K = res.kpi;
ok(res.level === 'sku', '비교 단위 SKU');
ok(K.n_short === 1 && K.n_over === 1 && K.n_unreg === 1, '부족 1 · 과잉 1 · 미등록 1 (' + [K.n_short, K.n_over, K.n_unreg] + ')');
ok(K.diff === -5 + 2 + 4, '순차이 +1 = ' + K.diff);
ok(res.lines.find((l) => l.style === 'H31F3FH292' && l.color === 'BK').diff === 0, '바코드 스캔 → 품번·색상으로 합산');
console.log('범위 밖(위치 없음/재고 0 위치):', res.lines.filter((l) => !l.scope).length, '· 진행률', K.progress.toFixed(1) + '%', '· 정확도', K.rate.toFixed(2) + '%');
ok(res.brands.find((b) => b.k === 'PING'), '브랜드 PING 인식');
const L = res.lines.find((l) => l.style === '111F3TF101' && l.color === 'MG');
ok(L.year === 2026 && L.cls === '이너' && /가을/.test(L.season), '년도·시즌·복종 분류 (' + [L.year, L.season, L.cls] + ')');
ok(L.recount, '재실사 대상 (−5개)');
// 누적재고 비교
const r2 = C.compute({ sys: p.rows, act: [{ file: 'a', at: '1', rows: act }] }, { cmp: 'acc' }, brandOf);
ok(r2.kpi.sys === r2.kpi.acc, '누적재고 비교 = 누적재고 합');
// 다시 올린 로케이션은 최신 값으로 교체
const loc0 = act[t0][0]; const fix = act.filter((x) => x[0] === loc0).map((x) => x.slice()); fix.find((x) => x[1] === '111F3TF101' && x[2] === 'MG')[4] += 5;
const r3 = C.compute({ sys: p.rows, act: [{ file: 'a', at: '1', rows: act }, { file: 'b', at: '2', rows: fix }] }, {}, brandOf);
ok(r3.kpi.n_short === 0, '같은 로케이션 다시 올리면 최신 값으로 교체');
// 재실사
const r4 = C.compute({ sys: p.rows, act: [{ file: 'a', at: '1', rows: act }], re: [{ file: 'r', at: '3', rows: [['', '111F3TF101', 'MG', '', 50, 0]] }] }, {}, brandOf);
ok(r4.kpi.n_short === 0 && r4.kpi.n_re === 1, '재실사 결과 반영');
// 로스 제외 · 포함
const fut = [['로스', '111F3TF101', 'MG', '', 3, ''], ['오픈', '111F3TF101', 'NA', '', 10, '']];
const r5 = C.compute({ sys: p.rows, fut, act: [{ file: 'a', at: '1', rows: act }] }, { loss: 'excl' }, brandOf);
ok(r5.lines.find((l) => l.style === '111F3TF101' && l.color === 'MG').diff === -2, '로스 3 → 차이에서 제외 (−5 → −2)');
ok(r5.fut.find((x) => x.kind === '오픈').qty === 10, '미래 발생분 구분 집계');
// 로케이션+SKU 단위 · 위치 상이
const sysL = [['1F-A-01', 'A11F3PT100', 'BK', '', 10, 0, 10, 'PING', '', '', '', ''], ['1F-A-02', 'A11F3PT100', 'BK', '', 5, 0, 5, 'PING', '', '', '', ''], ['1F-A-03', 'A11F3JK100', 'NA', '', 8, 2, 6, 'PING', '', '', '', '']];
const actL = [['1F-A-01', 'A11F3PT100', 'BK', '', 6, 0, ''], ['1F-A-02', 'A11F3PT100', 'BK', '', 9, 0, ''], ['1F-A-03', 'A11F3JK100', 'NA', '', 8, 0, '']];
const r6 = C.compute({ sys: sysL, act: [{ file: 'x', at: '1', rows: actL }] }, {}, brandOf);
ok(r6.level === 'loc' && r6.lines.filter((l) => l.type === '위치 상이').length === 2, '로케이션 비교 · 위치 상이 2건');
ok(r6.lines.find((l) => l.style === 'A11F3JK100').cls === 'JK' && r6.lines[0].year === 2026, 'JK 분류 · 년도 F=2026');
const r7 = C.compute({ sys: sysL, act: [{ file: 'x', at: '1', rows: actL }] }, { cmp: 'loc', loc_rule: [{ prefix: '1F-A-03', cmp: 'acc' }] }, brandOf);
ok(r7.lines.find((l) => l.style === 'A11F3JK100').diff === 2, '구역별 비교 지정 (누적재고 6 vs 실사 8 → +2)');
// 실사 파일 인식
const a = C.parse([['조', '로케이션', '바코드', '수량'], ['1조', '1F-A-01', 'A11F3PT100BK', 3]]);
ok(a.kind === 'act' && a.rows[0][5] === 1 && a.rows[0][6] === '1조', '실사 파일 인식 (바코드·조)');
const fu = C.parse([['구분', '품번', '색상', '수량'], ['반품창고', 'A11F3PT100', 'BK', 2]]);
ok(fu.kind === 'fut' && fu.rows[0][0] === '반품 창고', '미래 발생분 파일 인식');
const sc = C.parse([['로케이션', '품번', '색상', '사이즈'], ['1F-A-01', 'A11F3PT100', 'BK', '95'], ['1F-A-01', 'A11F3PT100', 'BK', '95']]);
ok(sc.kind === 'act' && sc.meta.qty === 2, 'PDA 스캔(수량 칸 없음) → 한 줄 1개');
