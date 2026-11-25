/* 전산자료 엑셀 인식 — WMS 재고 · ERP 재고 · 출고 지시(B2B) · 온라인 주문(버킷 어드민 · 사방넷)
 *  · 머리글 이름으로 칸을 찾음 (칸 순서가 바뀌어도 됨) · 브라우저 / Node 공용
 *  · 결과 재고 줄(압축): [브랜드원문, 품번, 색상, 사이즈, 로케이션, 현재고, 출고, 미래발생분, 창고/채널]
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HSCs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const txt = (v) => (v == null ? '' : String(v).replace(/　/g, ' ').trim());
  const nk = (v) => txt(v).replace(/\s+/g, '');
  const num = (v) => { if (v == null || v === '') return 0; if (typeof v === 'number') return isFinite(v) ? v : 0; const n = Number(String(v).replace(/[,\s]/g, '')); return isFinite(n) ? n : 0; };
  const up = (v) => txt(v).toUpperCase();
  const COL = {
    style: /^품번$|^품번코드$|^스타일(코드)?$|^style$|^상품코드$|^품목코드$/i, color: /^색상(코드)?$|^칼라$|^컬러$|^color$/i, size: /^사이즈$|^size$|^규격$/i,
    brand: /^(소속)?브랜드(명)?$|^brand$/i, loc: /위치정보|로케이션|^loc(ation)?$|^보관위치$/i,
    cur: /^현재고$|^재고수량$|^재고$|^가용재고$|^전산재고$|^현재고수량$/, out: /^출고$|^출고수량$|^누적출고$/, fut: /미래발생|^미래$/, tot: /누적재고|미래재고/,
    wh: /창고/, ch: /^채널$|^판매채널$|^유통$|^매장구분$|^구분$|^매장유형$/, scode: /^매장코드$/, sname: /^매장(명)?$/, year: /^기획년도$|^년도$/, season: /^시즌$/, grp: /^아이템군$|^복종$/, item: /^아이템$/,
    oqty: /지시수량|출고지시수량|^수량$|^지시$|요청수량|주문수량/, okind: /지시구분|출고구분|^구분$|주문구분|출고유형/, date: /^일자$|지시일|출고일|주문일/,
  };
  function header(rows, need, maxRow) {
    for (let r = 0; r < Math.min(rows.length, maxRow || 12); r++) {
      const row = rows[r] || []; const ix = {};
      row.forEach((v, c) => { const t = nk(v); if (!t) return; for (const k in COL) if (COL[k].test(t) && ix[k] == null) ix[k] = c; });
      if (need.every((k) => (Array.isArray(k) ? k.some((x) => ix[x] != null) : ix[k] != null))) return { r, ix, names: row.map(txt) };
    }
    return null;
  }
  const OCOL = { brand: /^브랜드(명)?$|^brand$/i, qty: /주문수량|^수량$|^qty$/i, key: /주문번호|배송지|수령(인|자)?주소|^주소$/, st: /주문상태|^상태$/ };
  const isWhReturn = (t) => /반품/.test(txt(t));
  const chOf = (t) => (/온라인|online|자사몰|몰|B2C|이커머스/i.test(txt(t)) ? '온라인' : '매장');

  // ---------- 화주 ERP 배분LIST (영업MD › 배분LIST) ----------
  const ACOL = { kind: /의뢰구분|위뢰구분|^구분$/, scode: /^매장코드$/, sname: /^매장(명)?$/, style: /^품번$|^품번코드$|^스타일(코드)?$/, color: /^색상(코드)?$|^칼라$|^컬러$/, size: /^사이즈$|^규격$/, qty: /보충수량|배분수량|^수량$/, rdate: /의뢰일자|의뢰일/, bdate: /보충일자|보충일|출고일자/ };
  const ALLOC_K = [['1', '패킹리스트 (초두)'], ['2', '반응보충'], ['3', '주문보충'], ['4', '수기보충'], ['5', '자동보충'], ['6', '완불보충'], ['7', 'B2C 매장출고']];
  function allocKind(t) { const x = nk(t).toUpperCase(); if (/패킹|초두|초도|PACKING/.test(x)) return '1'; if (/B2C|매장출고/.test(x)) return '7'; if (/반응/.test(x)) return '2'; if (/주문/.test(x)) return '3'; if (/수기/.test(x)) return '4'; if (/자동/.test(x)) return '5'; if (/완불/.test(x)) return '6'; return 'etc'; }
  const pad = (n) => String(n).padStart(2, '0');
  function toYmd(v, year) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    if (v instanceof Date) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    const t = txt(v); let m = t.match(/^(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/); if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    m = t.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = t.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})$/); if (m) return '20' + m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    m = t.match(/^(\d{1,2})[-./월\s]+(\d{1,2})/); if (m) return (year || new Date().getFullYear()) + '-' + pad(m[1]) + '-' + pad(m[2]);
    return '';
  }
  function allocHeader(rows) {
    for (let r = 0; r < Math.min(rows.length, 12); r++) {
      const row = rows[r] || []; const ix = {};
      row.forEach((v, c) => { const t = nk(v); if (!t) return; for (const k in ACOL) if (ACOL[k].test(t) && ix[k] == null) ix[k] = c; });
      if (ix.kind != null && ix.qty != null && ix.style != null && (/의뢰|위뢰/.test(nk(row[ix.kind])) || /보충|배분/.test(nk(row[ix.qty])))) return { r, ix, names: row.map(txt) };
    }
    return null;
  }
  // 결과: { lines: [[품번, 매장코드, 매장명, 색상, 사이즈, 수량, 의뢰구분(1~7·etc), 보충일자, 의뢰일자, 원래 구분 글자]], days, skipped, unknown:{글자:줄수}, noDate }
  function parseAlloc(rows, opt) {
    const h = allocHeader(rows); if (!h) return null; const ix = h.ix; const g = (row, k) => (ix[k] == null ? '' : row[ix[k]]);
    const lines = []; let skipped = 0, noDate = 0; const unknown = {}; const days = {};
    for (let r = h.r + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue; const style = up(g(row, 'style')); const kt = txt(g(row, 'kind'));
      if (!style || /^(합계|소계|총계|TOTAL)/.test(style) || /^(합계|소계|총계)/.test(kt)) continue;
      const q = num(g(row, 'qty')); if (!(q > 0)) { skipped++; continue; } // 0 · 마이너스(취소 등) 빼고
      const k = allocKind(kt); if (k === 'etc') unknown[kt || '(빈칸)'] = (unknown[kt || '(빈칸)'] || 0) + 1;
      let d = toYmd(g(row, 'bdate')) || toYmd(g(row, 'rdate')) || (opt && opt.d) || ''; if (!d) { noDate++; continue; }
      days[d] = (days[d] || 0) + q;
      lines.push([style, up(g(row, 'scode')), txt(g(row, 'sname')), up(g(row, 'color')), up(g(row, 'size')), q, k, d, toYmd(g(row, 'rdate')), kt]);
    }
    // 매장코드 · 매장명 없이 받은 파일: 같은 품번 · 색상 · 사이즈 · 의뢰구분 · 날짜 줄을 합쳐 줄 수를 줄임
    const noStore = ix.scode == null && ix.sname == null; const raw = lines.length; let out = lines;
    if (noStore) { const M = new Map(); for (const l of lines) { const key = [l[0], l[3], l[4], l[6], l[7], l[8], l[9]].join('\u0001'); const o = M.get(key); if (o) o[5] += l[5]; else M.set(key, l.slice()); } out = [...M.values()]; }
    return { lines: out, raw, noStore, days, skipped, noDate, unknown, hasBdate: ix.bdate != null, header: h.names.filter(Boolean).slice(0, 20) };
  }

  // 파일 종류 맞히기: wms(로케이션 있는 재고) · erp(로케이션 없는 재고) · order(지시 수량) · alloc(배분LIST) · null
  function detect(rows) {
    if (allocHeader(rows)) return 'alloc';
    if (header(rows, ['style', 'cur', 'loc'])) return 'wms';
    if (header(rows, ['style', 'cur'])) return 'erp';
    if (header(rows, ['brand', 'cur', ['scode', 'sname']])) return 'erp'; // 화주 ERP 매장별 재고현황 (품번 없이 매장 × 시즌 × 아이템군 합계)
    const h = header(rows, ['brand', 'oqty']);
    if (h) return h.names.some((t) => OCOL.key.test(nk(t))) ? 'online' : 'order'; // 주문번호 · 주소가 있으면 온라인 주문
    return null;
  }
  // 재고 → { rows, subs: {정상창고:[…], 반품창고:[…]} } (창고/채널 칸이 없으면 forceSub)
  const isOnlineStore = (t) => /온라인쇼핑/.test(txt(t)); // 매장명에 "온라인쇼핑"이 들어간 곳만 온라인
  // 화주 ERP 매장별 재고: 줄 = [브랜드원문, 매장코드, 기획년도, 시즌, 매장명, 현재고, 0, 0, 아이템군]
  function parseStoreStock(rows, forceSub) {
    const h = header(rows, ['brand', 'cur', ['scode', 'sname']]); if (!h) return null;
    const ix = h.ix; const g = (row, k) => (ix[k] == null ? '' : row[ix[k]]);
    const subs = {}; let qty = 0;
    for (let r = h.r + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const b = txt(g(row, 'brand')); if (!b || /^(합계|소계|총계|TOTAL)/i.test(b)) continue; // 맨 아래 합계 줄 (브랜드 빈 줄) 제외
      const sname = txt(g(row, 'sname')); const sub = forceSub || (isOnlineStore(sname) ? '온라인' : '매장');
      const cur = num(g(row, 'cur'));
      (subs[sub] || (subs[sub] = [])).push([b, up(g(row, 'scode')), txt(g(row, 'year')), txt(g(row, 'season')), sname, cur, 0, 0, txt(g(row, 'grp'))]); qty += cur;
    }
    return { subs, qty, mode: 'store', cols: Object.keys(ix), hasWh: false, hasCh: true, hasLoc: false, header: h.names.filter(Boolean).slice(0, 20) };
  }
  // 무엇이 빠졌는지 (인식 실패 안내): 파일 앞 12줄에서 칸 이름이 가장 많은 줄
  function missing(rows, need) {
    let best = null;
    for (let r = 0; r < Math.min(rows.length, 12); r++) { const names = (rows[r] || []).map(txt).filter(Boolean); if (!best || names.length > best.length) best = names; }
    const has = (k) => (best || []).some((t) => COL[k] && COL[k].test(nk(t)));
    return { miss: need.filter((k) => (Array.isArray(k) ? !k.some(has) : !has(k))), names: (best || []).slice(0, 20) };
  }
  function parseStock(rows, kind, forceSub) {
    const h = header(rows, ['style', 'cur']); if (!h) return kind === 'erp' ? parseStoreStock(rows, forceSub) : null;
    const ix = h.ix; const g = (row, k) => (ix[k] == null ? '' : row[ix[k]]);
    const subs = {}; let qty = 0; const learn = [];
    for (let r = h.r + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const style = up(g(row, 'style')); if (!style || /^(합계|소계|TOTAL|총계)/.test(style)) continue;
      let sub = forceSub;
      if (!sub) sub = kind === 'wms' ? (ix.wh != null && isWhReturn(g(row, 'wh')) ? '반품창고' : '정상창고') : (ix.ch != null ? chOf(g(row, 'ch')) : '매장');
      const cur = num(g(row, 'cur'));
      const line = [txt(g(row, 'brand')), style, up(g(row, 'color')), up(g(row, 'size')), kind === 'wms' ? txt(g(row, 'loc')).replace(/\s+/g, ' ') : '', cur, num(g(row, 'out')), num(g(row, 'fut'))];
      if (kind === 'wms' && ix.grp != null && learn.length < 20000) learn.push([style, g(row, 'grp'), g(row, 'item')]); // 품번 규칙 자동 학습 재료 (저장 안 함)
      if (kind === 'wms') line.push(txt(g(row, 'year')), txt(g(row, 'season')), txt(g(row, 'grp')), ix.tot != null ? num(g(row, 'tot')) : cur - num(g(row, 'fut'))); // 신상품 › 재고 현황 · 재고 조회 (11: 누적재고 = 현재고 − 미래발생분)
      (subs[sub] || (subs[sub] = [])).push(line); qty += cur;
    }
    return { subs, qty, cols: Object.keys(ix), hasWh: ix.wh != null, hasCh: ix.ch != null, hasLoc: ix.loc != null, learn, header: h.names.filter(Boolean).slice(0, 20) };
  }
  // 로케이션 없음 기준 (기준정보 'noloc_rule'): 현재고 min 이상 · 위치정보 빈칸 또는 지정한 위치 이름 · 반품창고는 계산 안 함
  let NOLOC = { codes: new Set(), min: 1, pct: 5 };
  function setNoloc(r) { r = r || {}; NOLOC = { codes: new Set((r.codes || []).map((c) => String(c).toUpperCase().replace(/\s+/g, '')).filter(Boolean)), min: Math.max(1, +r.min || 1), pct: r.pct == null || r.pct === '' ? 5 : +r.pct }; }
  const getNoloc = () => ({ codes: [...NOLOC.codes], min: NOLOC.min, pct: NOLOC.pct });
  const isNoloc = (x) => x[5] > 0 && x[5] >= NOLOC.min && (!x[4] || NOLOC.codes.has(String(x[4]).toUpperCase().replace(/\s+/g, '')));
  // 브랜드 합계 (오늘 기록 · 화면)
  function stockByBrand(lines, brandOf) {
    const by = {};
    for (const x of lines) {
      const b = brandOf(x[0], x[1]) || x[0] || '(브랜드 없음)'; const o = by[b] || (by[b] = { brand: b, qty: 0, sku: 0, noloc: 0, noloc_qty: 0, out_qty: 0, styles: new Set() });
      o.qty += x[5]; o.sku++; o.out_qty += x[6]; o.styles.add(x[1]);
      if (isNoloc(x)) { o.noloc++; o.noloc_qty += x[5]; }
    }
    return Object.values(by).map((o) => ({ brand: o.brand, qty: o.qty, sku: o.sku, noloc: o.noloc, noloc_qty: o.noloc_qty, out_qty: o.out_qty, styles: o.styles.size }));
  }
  const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

  // B2B 출고지시 (WMS) → 브랜드별 { sale, pre } · 구분 칸에 '선지시/미작업'이면 선지시
  function parseOrder(rows) {
    const h = header(rows, ['brand', 'oqty']); if (!h) return null;
    const ix = h.ix; const by = {}; let n = 0;
    for (let r = h.r + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue; const b = txt(row[ix.brand]); if (!b || /^(합계|소계|총계|TOTAL)/i.test(b)) continue;
      const q = num(row[ix.oqty]); if (!q) continue; const k = ix.okind != null && /선지시|미작업|선출고/.test(txt(row[ix.okind])) ? 'pre' : 'sale';
      const o = by[b] || (by[b] = { sale: 0, pre: 0 }); o[k] += q; n++;
    }
    return { by, lines: n, hasKind: ix.okind != null, header: h.names.filter(Boolean).slice(0, 20) };
  }
  // 온라인 주문 (버킷 어드민 등 일반 양식) → 브랜드별 { cnt(주문/배송지 수), qty } — 이름 · 전화 · 주소는 계산에만
  function parseOnline(rows) {
    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const row = rows[r] || []; const ix = {};
      row.forEach((v, c) => { const t = nk(v); for (const k in OCOL) if (OCOL[k].test(t) && ix[k] == null) ix[k] = c; });
      if (ix.brand == null || ix.qty == null) continue;
      const by = {}; let n = 0;
      for (let i = r + 1; i < rows.length; i++) {
        const x = rows[i]; if (!x) continue; const b = txt(x[ix.brand]); if (!b) continue;
        if (ix.st != null && /취소|반품|교환/.test(txt(x[ix.st]))) continue;
        const o = by[b] || (by[b] = { qty: 0, keys: new Set() }); o.qty += num(x[ix.qty]); o.keys.add(ix.key != null ? nk(x[ix.key]) : 'r' + i); n++;
      }
      const out = {}; for (const b in by) out[b] = { cnt: by[b].keys.size, qty: by[b].qty };
      return { by: out, lines: n };
    }
    return null;
  }
  return { setNoloc, getNoloc, isNoloc, detect, parseAlloc, allocKind, ALLOC_K, toYmd, parseStock, parseStoreStock, isOnlineStore, missing, stockByBrand, parseOrder, parseOnline, chunk, header, COL };
});
