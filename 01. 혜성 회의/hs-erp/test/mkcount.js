// 재고 실사 시험 파일 만들기 (실제 '재고 현황' 시트 + 모의 실사 · 미래 발생분 · 재실사) → test/fx (저장소 제외)
const XLSX = require('xlsx'); const fs = require('fs');
const dir = '/mnt/user-data/attachments/7e416561-536b-572f-95a3-857922cfaa8e/'; const f = fs.readdirSync(dir).find((x) => x.startsWith('89cf0660'));
const wb = XLSX.readFile(dir + f); const ws = wb.Sheets['재고 현황'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
const out = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(rows.map((r) => r.slice(0, 13))), '재고 현황'); XLSX.writeFile(out, __dirname + '/fx/wms_stock.xlsx');
const data = rows.slice(3).filter((r) => r[5]);
const crews = { '1F': [], '2F': [], '3F': [] };
for (const r of data) {
  const locs = String(r[4] || '').split(/\s+/).filter(Boolean); if (!locs.length || !(r[8] > 0)) continue;
  const per = Math.floor(r[8] / locs.length); let left = r[8];
  locs.forEach((l, i) => { const q = i === locs.length - 1 ? left : per; left -= q; const fl = l.slice(0, 2); (crews[fl] || crews['3F']).push([l, r[5], r[6], q]); });
}
const hit = crews['1F'].find((x) => x[1] === '111F3TF101' && x[2] === 'MG'); hit[3] -= 5;
crews['1F'].push([crews['1F'][0][0], 'ZZ1F3PT999', 'BK', 4]);
const w = (name, aoa) => { const b = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(b, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1'); XLSX.writeFile(b, __dirname + '/fx/' + name); };
w('count_floor1.xlsx', [['조', '로케이션', '품번', '색상', '수량']].concat(crews['1F'].map((x) => ['1조', x[0], x[1], x[2], x[3]])));
w('count_floor2.xlsx', [['조', '로케이션', '품번', '색상', '수량']].concat(crews['2F'].map((x) => ['2조', x[0], x[1], x[2], x[3]])));
w('future.xlsx', [['구분', '품번', '색상', '수량'], ['로스', '111F3TF101', 'MG', 3], ['오픈', '111F3TF101', 'NA', 10], ['반품창고', 'H11F3FH208', 'BG', 7]]);
w('recount_floor1.xlsx', [['로케이션', '품번', '색상', '수량']].concat(crews['1F'].filter((x) => x[1] === '111F3TF101' && x[2] === 'MG').map((x) => [x[0], x[1], x[2], x[3] + (x === hit ? 5 : 0)])));
console.log('1F', crews['1F'].length, '2F', crews['2F'].length, '3F', crews['3F'].length);
