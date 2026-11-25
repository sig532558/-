// 출고 기준: 입고 > 0 · 출고 0 · 현재고 0 → 출고완료 / 현재고 모름(null) → 미출고
const P2 = require('../site/js/parsers2.js');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const s = (o) => P2.npStatus(Object.assign({ flags: [], plan_date: '2026-09-01' }, o));
ok(s({ in_qty: 6, out_qty: 0, stock: 0, stock_loc: 0 }).st_out === '출고완료', '재고 0 → 출고완료');
ok(s({ in_qty: 6, out_qty: 0, stock: 0, stock_loc: 0 }).st_clean === '전량출고', '재고 0 → 전량출고');
ok(s({ in_qty: 400, out_qty: 0, stock: 120, stock_loc: 0 }).st_out === '미출고', '재고 남음 → 미출고');
ok(s({ in_qty: 10, out_qty: 0, stock: -2 }).st_out === '출고완료' && s({ in_qty: 10, out_qty: 0, stock: -2 }).flags.includes('재고마이너스'), '재고 마이너스 → 출고완료 + 표시');
ok(s({ in_qty: 10, out_qty: 0, stock: null }).st_out === '미출고', '재고 모름 → 미출고');
ok(s({ in_qty: 0, out_qty: 0, stock: 0 }).st_out === '미입고', '입고 0 → 미입고');
ok(s({ in_qty: 10, out_qty: 3, stock: 7, stock_loc: 7 }).st_out === '출고완료', '출고 있음 → 출고완료');
const sum = P2.npSummary([s({ brand: 'A', in_qty: 6, out_qty: 0, stock: 0 }), s({ brand: 'A', in_qty: 6, out_qty: 0, stock: 5 })]);
ok(sum.tot.out === 1 && sum.tot.notout === 1, '집계도 같은 기준 ' + JSON.stringify(sum.tot));
