/* 혜성물류 운영 ERP — 물동량 (월마감 정산 기준) 엑셀 인식 · 집계
 *  · 정산 파일의 화주별 일별 시트(크리스 · 링스 · 로라 · 슈퍼웍스)
 *    한 시트에 같은 열 묶음이 여러 번: ① 원자료 ② 조정 ③ 정산(①+②) ④ 금액 → ③ 정산 수량만 읽음 (금액은 읽지 않음)
 *  · 로라: 입고 · 입고반품이 (침구/소품) · (가구) 두 칸 → 합쳐서 한 공정 · 쿠팡 출고는 따로
 * 브라우저(window.HSVolume)와 Node(require) 양쪽에서 동작
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./parsers2.js'));
  else root.HSVolume = factory(root.HSParsers2);
})(typeof self !== 'undefined' ? self : this, function (P2) {
  'use strict';
  const nk = (v) => (v == null ? '' : String(v)).replace(/[\s ]+/g, '');
  const OWNERS = { 크리스: '크리스', 링스: 'LX', LX: 'LX', 로라: '로라', 슈퍼웍스: '슈퍼웍스' };
  // 시트 이름에서 화주 찾기: 이름이 똑같을 때가 먼저 · 아니면 이름이 들어 있으면 (예: '크리스(1월)' · '2601 링스')
  //  · 금액 · 단가 시트는 읽지 않음 (기밀 · 애초에 안 읽음)
  function ownerOf(name) {
    const s = nk(name); if (!s) return null;
    if (OWNERS[s]) return OWNERS[s];
    if (/금액|단가|요율|청구/.test(s)) return null;
    const hit = Object.keys(OWNERS).filter((k) => s.indexOf(k) >= 0);
    return hit.length === 1 ? OWNERS[hit[0]] : null; // 두 화주 이름이 같이 든 시트는 헷갈리니 읽지 않음
  }
  // 공정: [키, 표시, 구분]
  const PROCS = [['입고', '입고', 'B2B'], ['입고반품', '입고반품', 'B2B'], ['출고', '출고', 'B2B'], ['반품', '반품', 'B2B'], ['쿠팡출고', '쿠팡 출고', 'B2B'],
    ['B2B→B2C', 'B2B→B2C 이관 (온라인 입고)', 'B2C'], ['B2C→B2B', 'B2C→B2B 이관 (온라인 반품)', 'B2C'], ['RT반출', 'RT 반출', 'B2C'], ['RT반입', 'RT 반입', 'B2C'], ['B2C고객출고', 'B2C 고객 출고', 'B2C'], ['B2C고객반품', 'B2C 고객 반품', 'B2C']];
  const PROC_OF = (h) => {
    const s = nk(h).replace(/\(침구\/소품\)|\(가구\)/g, '');
    if (/^B2B입고\(B2B→B2C\)/.test(s) || /B2B→B2C/.test(s)) return 'B2B→B2C';
    if (/^B2B반품\(B2C→B2B\)/.test(s) || /B2C→B2B/.test(s)) return 'B2C→B2B';
    if (/^B2C고객출고/.test(s)) return 'B2C고객출고';
    if (/^B2C고객반품/.test(s)) return 'B2C고객반품';
    if (/^쿠팡출고/.test(s)) return '쿠팡출고';
    if (/^RT반출/.test(s)) return 'RT반출';
    if (/^RT반입/.test(s)) return 'RT반입';
    if (s === '입고반품') return '입고반품';
    if (s === '입고') return '입고';
    if (s === '출고') return '출고';
    if (s === '반품') return '반품';
    return null;
  };
  const GROUP = Object.fromEntries(PROCS.map((p) => [p[0], p[2]]));
  const LABEL = Object.fromEntries(PROCS.map((p) => [p[0], p[1]]));
  // 머리글 줄에서 열 묶음 찾기: '입고'로 시작해 같은 공정이 다시 나올 때까지
  function blocks(row) {
    const out = []; let cur = null, prev = null;
    row.forEach((v, c) => {
      const p = PROC_OF(v); if (!p) { prev = null; return; }
      if (p === '입고' && prev !== '입고') { cur = { start: c, cols: [] }; out.push(cur); }
      if (cur) cur.cols.push({ c, p }); prev = p;
    });
    return out;
  }
  // sheets: [{name, ws}] → { rows: [{d, owner, proc, qty}], found: [{sheet, owner, from, to, days, qty, block}], miss: [] }
  function readBook(sheets) {
    const res = { rows: [], found: [], miss: [], skipped: [] };
    for (const s of sheets) {
      const owner = ownerOf(s.name); if (!owner) { res.skipped.push(s.name); continue; }
      P2.shrink(s.ws); const g = P2.grid(s.ws, 5000);
      let hr = -1, bl = [];
      for (let r = 0; r < Math.min(10, g.length); r++) { const b = blocks(g[r] || []); if (b.length && b[0].cols.length >= 4) { hr = r; bl = b; break; } }
      if (hr < 0) { res.miss.push({ sheet: s.name, owner, why: '입고 · 출고 · 반품 머리글을 찾지 못함' }); continue; }
      // 머리글이 첫 묶음에만 있는 시트(로라 등): '일자' 칸 위치로 세 번째(정산) 묶음을 같은 순서로 맞춤
      if (bl.length < 3) { const dates = []; (g[hr] || []).forEach((v, c) => { if (nk(v) === '일자') dates.push(c); }); if (dates.length >= 3 && bl[0]) { const off = dates[2] - dates[0]; bl = [bl[0], null, { start: bl[0].start + off, cols: bl[0].cols.map((x) => ({ c: x.c + off, p: x.p })) }]; } }
      const use = bl.length >= 3 ? 2 : 0; const b = bl[use];
      // 날짜 열: 묶음 바로 앞 칸이 날짜면 그 칸, 아니면 첫 칸
      const dateCol = (() => { for (let r = hr + 1; r < Math.min(g.length, hr + 40); r++) { const v = (g[r] || [])[b.start - 1]; if (P2.toDate(v)) return b.start - 1; } return 0; })();
      const agg = {}; let from = null, to = null, qty = 0;
      for (let r = hr + 1; r < g.length; r++) {
        const row = g[r]; if (!row || !row.length) continue;
        const d = P2.toDate(row[dateCol]); if (!d) continue;
        for (const x of b.cols) { const v = P2.num(row[x.c]); if (!v) continue; const k = d + '|' + x.p; agg[k] = (agg[k] || 0) + v; qty += v; }
        if (!from || d < from) from = d; if (!to || d > to) to = d;
      }
      Object.entries(agg).forEach(([k, v]) => { const [d, p] = k.split('|'); res.rows.push({ rec_date: d, owner, proc: p, qty: Math.round(v * 1000) / 1000 }); });
      const mos = [...new Set(Object.keys(agg).map((k) => k.slice(0, 7)))].sort();
      res.found.push({ sheet: s.name, owner, from, to, rows: Object.keys(agg).length, qty, months: mos, block: use === 2 ? '정산' : '원자료', procs: [...new Set(b.cols.map((x) => x.p))] });
    }
    return res;
  }
  // 화주마다 한 번씩 저장하려고 묶기 (같은 화주 시트가 여러 개여도 기간을 합쳐서 한 번에)
  //  → [{ owner, from, to, months: [...], qty, rows: [{rec_date, proc, qty}] }]
  function byOwner(res) {
    const o = {};
    (res.found || []).forEach((f) => {
      const a = o[f.owner] || (o[f.owner] = { owner: f.owner, from: f.from, to: f.to, months: [], qty: 0, sheets: [] });
      if (f.from && (!a.from || f.from < a.from)) a.from = f.from;
      if (f.to && (!a.to || f.to > a.to)) a.to = f.to;
      a.qty += f.qty; a.sheets.push(f.sheet); (f.months || []).forEach((m) => { if (a.months.indexOf(m) < 0) a.months.push(m); });
    });
    return Object.values(o).map((a) => { a.months.sort(); a.rows = (res.rows || []).filter((r) => r.owner === a.owner).map((r) => ({ rec_date: r.rec_date, proc: r.proc, qty: r.qty })); return a; });
  }
  // 미리보기용: 달 × 화주 합계 → [{ ym, by: {owner: qty}, total }]
  function monthGrid(rows) {
    const m = {};
    (rows || []).forEach((r) => { const k = r.rec_date.slice(0, 7); const a = m[k] || (m[k] = { ym: k, by: {}, total: 0 }); a.by[r.owner] = (a.by[r.owner] || 0) + (+r.qty || 0); a.total += (+r.qty || 0); });
    return Object.values(m).sort((a, b) => (a.ym < b.ym ? -1 : 1));
  }
  // 새 파일 범위(화주별 from~to) 안의 기존 값 중 새 파일에 없는 것은 0으로
  function upserts(res, old) {
    const have = new Set(res.rows.map((r) => r.rec_date + '|' + r.owner + '|' + r.proc));
    const rng = Object.fromEntries(res.found.map((f) => [f.owner, f]));
    const zero = (old || []).filter((o) => { const f = rng[o.owner]; return f && o.rec_date >= f.from && o.rec_date <= f.to && +o.qty && !have.has(o.rec_date + '|' + o.owner + '|' + o.proc); }).map((o) => ({ rec_date: o.rec_date, owner: o.owner, proc: o.proc, qty: 0 }));
    return res.rows.concat(zero);
  }
  // 월 집계: rows → { 'YYYY-MM': { owner: { proc: qty } } }
  function byMonth(rows) {
    const m = {};
    for (const r of rows) { const k = r.rec_date.slice(0, 7); const a = m[k] || (m[k] = {}); const o = a[r.owner] || (a[r.owner] = {}); o[r.proc] = (o[r.proc] || 0) + (+r.qty || 0); }
    return m;
  }
  const sum = (mo, owners, procs) => { if (!mo) return 0; let s = 0; for (const o in mo) { if (owners && owners.indexOf(o) < 0) continue; for (const p in mo[o]) { if (procs && procs.indexOf(p) < 0) continue; s += mo[o][p]; } } return s; };
  const B2B = PROCS.filter((p) => p[2] === 'B2B').map((p) => p[0]), B2C = PROCS.filter((p) => p[2] === 'B2C').map((p) => p[0]);
  return { readBook, upserts, byMonth, byOwner, monthGrid, ownerOf, sum, PROCS, GROUP, LABEL, B2B, B2C, OWNER_LIST: ['크리스', 'LX', '로라', '슈퍼웍스'] };
});
