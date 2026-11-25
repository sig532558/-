// 시즌 정리 실적: 상품 단위 스캔 파일(품번 · 실사수량 · 입력일자) 인식 점검
const XLSX = require('xlsx'); const fs = require('fs'); const S = require('../site/js/season.js');
const AT = '/mnt/user-data/attachments/7e416561-536b-572f-95a3-857922cfaa8e/';
const F = AT + fs.readdirSync(AT).find((f) => f.startsWith('b02cac50'));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const wb = XLSX.read(fs.readFileSync(F), { type: 'buffer' }); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
ok(S.parseAct(rows, 2026).length === 0, '기존 방식(일자 · 작업 · 수량)으로는 인식 안 됨 (원인)');
const total = rows.slice(2).reduce((a, r) => a + (+r[7] || 0), 0);
const jobs = S.defaultJobs('FW', 2025, [], []); jobs.push({ phase: 'sort', name: '과년차 JK 정리', seasons: '과년차', cls: 'JK' });
const r = S.parseScan(rows, jobs, 2025, 'sort'); console.log(JSON.stringify({ lines: r.lines, total: r.total, dateCol: r.dateCol, rows: r.rows, un: r.unassigned }));
ok(r.dateCol === '입력일자' && r.rows.every((x) => x.date === '2026-06-25'), '날짜 = 입력일자 (2026-06-25) · 실사일자 아님');
ok(r.total === 12130 && r.lines === 1018, '전체 ' + r.lines + '줄 · ' + r.total + ' PCS 읽음 (엑셀 합계 12,130)');
const J = Object.fromEntries(r.rows.map((x) => [x.job, x.qty]));
ok(J['과년차 JK 정리'] === 519 && J['과년차 이너 사이즈 분류'] === 6060 && J['반품 입고 동시 전시즌 · 전복종 분류'] === 5551, '시즌 · 복종으로 배정: 과년차 JK 519 · 과년차 이너 6,060 · 그 외 5,551');
const r2 = S.parseScan(rows, S.defaultJobs('FW', 2025, [], []), 2025, 'sort');
ok(r2.rows[0].job === '반품 입고 동시 전시즌 · 전복종 분류', '맞는 작업 없으면 대상 없는(전체) 작업으로');
