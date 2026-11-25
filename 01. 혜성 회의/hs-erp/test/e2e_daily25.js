// 2025년 판 일일 마감보고 읽기 (2026-11-19 · 행님 지시 "25년 파일도 인식되게")
//  · 2026년 판에 생긴 '입고반품 수량'(F) 칸이 2025년 판에는 없어 그 뒤 칸이 한 칸씩 당겨져 있다
//  · 과 · 미출 상세도 2025년 판에는 '구분 · 브랜드' 칸이 없어 두 칸 당겨져 있다
// 브라우저 없이 파서만 확인한다
const XLSX = require('xlsx');
const P = require('../site/js/parsers.js');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

// 칸 이름과 값 — 두 해 모두 같은 뜻의 칸에 같은 값을 넣는다
const V = { in_plan_st: 1, in_real_st: 2, in_qty: 3, in_return_qty: 4, t1: 5, t25: 6, ft20: 7, ft40: 8, pre_in_st: 9, out_plan_st: 10, out_real_st: 11, wait_st: 12, first_qty: 13, order_qty: 14, full_qty: 15, out_qty: 16, short_qty: 17, online_order: 18, online_out: 19, online_short: 20, open_export: 21, hold_change: 22, total_qty: 23, total_short: 24 };
function sheet(year) {
  const y26 = year === 26;
  const H = ['', '브랜드', '입고예정ST', '실입고ST', '입고수량'].concat(y26 ? ['입고반품 수량'] : [], ['1TON', '2.5TON', '20FT', '40FT', '기입고ST', '출고예정', '실출고ST', '출고 후 대기ST', '출고수량', '지시수량', '완불수량', '출고수량', '미출수량', '온라인 지시수량', '온라인 출고수량', '온라인 미출수량', '오픈수출매장', '홀딩및해제 변경수량', '당일 총수량', '총미출수량']);
  const R = ['', '핑', V.in_plan_st, V.in_real_st, V.in_qty].concat(y26 ? [V.in_return_qty] : [], [V.t1, V.t25, V.ft20, V.ft40, V.pre_in_st, V.out_plan_st, V.out_real_st, V.wait_st, V.first_qty, V.order_qty, V.full_qty, V.out_qty, V.short_qty, V.online_order, V.online_out, V.online_short, V.open_export, V.hold_change, V.total_qty, V.total_short]);
  // 지시 분류 (9시주문분 …) — 2026년 판은 '브랜드' 칸이 하나 더 있어 두 칸 밀려 있다
  const o9 = y26 ? 31 : 29;
  H[o9 - 1] = '22시 지시분'; H[o9] = '9시주문분'; H[o9 + 1] = '기타보충분'; H[o9 + 2] = '1시30분완불분'; H[o9 + 3] = '22시지시분'; H[o9 + 4] = '낮업무지시분';
  R[o9 - 1] = 91; R[o9] = 92; R[o9 + 1] = 93; R[o9 + 2] = 94; R[o9 + 3] = 95; R[o9 + 4] = 96;
  const aoa = [['', '일일 판매분 및 입,출고'], ['', year === 26 ? 46344 : 45659], ['', 'B2B', '입고업무'], H, R, ['', '총합계']];
  // 반품 블록 + 과 · 미출 상세
  const h2 = ['', '브랜드', '온라인 전일 확정수량', '매장 전일 확정수량', '반품합계', '미확정 수량', '브랜드', '년도,시즌 복종', '총박스수', '매장수', '출고수량', '브랜드', '부자재 (박스)', '사은품 (박스)', '부자재 (박스)', '사은품 (박스)', '부자재 (박스)', '사은품 (박스)', '브랜드', 'ⓐ롯데택배', 'ⓑ탑코리아', 'ⓒ서울화물', '출고합계', 'ⓐ롯데택배', 'ⓑ탑코리아', 'ⓒ기타택배', 'ⓓ서울화물', '반품합계'];
  const r2 = ['', '핑', 11, 12, 23, 5, '핑', 'F2', 3, 2, 100, '핑', 1, 2, 3, 4, 5, 6, '핑', 61, 62, 63, 64, 71, 72, 73, 74, 75];
  const sc = y26 ? 30 : 28; // 매장코드 자리 (2026년 판은 구분 · 브랜드가 앞에 둘 더)
  if (y26) { h2[sc - 2] = '구분(B2C, B2B) 자동입력'; h2[sc - 1] = '브랜드 자동입력'; r2[sc - 2] = 'B2B'; r2[sc - 1] = '핑'; }
  ['매장코드', '매장명', '품번', '색상', '사이즈', '과미출 수량', '미출사유'].forEach((t, i) => { h2[sc + i] = t; });
  ['S001', '롯데본점', 'ST-1', '검정', '095', -7, '재고부족'].forEach((t, i) => { r2[sc + i] = t; });
  aoa.push(['', year === 26 ? 46343 : 45658, '', '반품업무'], h2, r2, ['', '총합계']);
  return XLSX.utils.aoa_to_sheet(aoa);
}

const read = (year) => {
  const wb = XLSX.utils.book_new(); const name = (year === 26 ? '26' : '25') + '0102';
  XLSX.utils.book_append_sheet(wb, sheet(year), name);
  const res = P.analyze(wb, '일일업무수불.xlsx').filter((x) => x.sheet === name);
  const rows = (res[0] && res[0].sets || []).flatMap((s) => s.rows || []);
  const by = {}; rows.forEach((r) => (by[r.section] = (by[r.section] || []).concat([r])));
  return by;
};

const a = read(25), b = read(26);
ok(!!(a.b2b && a.b2b.length), '25년 판도 B2B 줄을 읽음 (' + ((a.b2b || []).length) + '줄)');
ok(!!(b.b2b && b.b2b.length), '26년 판도 그대로 읽음 (' + ((b.b2b || []).length) + '줄)');
const KEYS = ['in_plan_st', 'in_real_st', 'in_qty', 'pre_in_st', 'out_plan_st', 'out_real_st', 'wait_st', 'first_qty', 'order_qty', 'full_qty', 'out_qty', 'short_qty', 'online_order', 'online_out', 'online_short', 'open_export', 'hold_change', 'total_qty', 'total_short'];
const d25 = (a.b2b || [{}])[0].data || {}, d26 = (b.b2b || [{}])[0].data || {};
KEYS.forEach((k) => ok(d25[k] === V[k], '25년 ' + k + ' = ' + V[k] + ' (읽은 값 ' + d25[k] + ')'));
ok(d26.in_return_qty === V.in_return_qty && d25.in_return_qty == null, '입고반품 수량은 26년 판에만 있음');
ok(d25.ord_9 === 92 && d26.ord_9 === 92 && d25.ord_day === 96 && d26.ord_day === 96, '지시 분류(9시주문분 · 낮업무지시분)도 두 판 모두 같은 자리로');
ok(JSON.stringify((a.parcel || [{}])[0].data) === JSON.stringify((b.parcel || [{}])[0].data), '택배 박스 칸은 두 판이 같음');
const noBasis = (d) => { const o = Object.assign({}, d || {}); delete o.basis_date; return JSON.stringify(o); };
ok(noBasis((a.return || [{}])[0].data) === noBasis((b.return || [{}])[0].data), '반품 칸도 두 판이 같음 (기준일은 날짜라 빼고 비교)');
const s25 = (a.short || [])[0], s26 = (b.short || [])[0];
ok(s25 && s25.data.qty === -7 && s25.data.store === '롯데본점' && s25.data.style === 'ST-1', '25년 판 과 · 미출 상세도 읽음 (' + (s25 ? s25.data.store + ' ' + s25.data.qty : '못 읽음') + ')');
ok(s26 && s26.data.qty === -7 && s26.data.brand === '핑' && s26.data.kind === 'B2B', '26년 판 과 · 미출 상세는 구분 · 브랜드까지');
ok(s25 && s25.data.brand === '', '25년 판에는 브랜드 칸이 없어 비워 둠');
console.log('끝');
