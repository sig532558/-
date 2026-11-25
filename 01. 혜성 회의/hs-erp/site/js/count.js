/* 혜성물류 운영 ERP — 재고 실사 계산
 *  · 파일 자동 인식: 전산 재고(WMS 재고현황) · 미래 발생분 내역 · 실사 자료(조별·PDA 스캔) · 재실사
 *  · 비교: 로케이션+SKU / SKU만 (한 칸에 위치가 여러 개면 자동으로 SKU 비교)
 *  · 비교 수량: 현재고 / 누적재고(현재고 − 미래 발생분) / 구역별 지정
 *  · 로스: 차이에서 제외(따로 표시) / 차이에 포함
 *  · 차이 유형: 부족 · 과잉 · 위치 상이 · 미등록 / 재실사 기준 (±N개 또는 ±N%)
 * 브라우저(window.HSCount)와 Node(require) 양쪽에서 동작 · 화면·DB와 무관한 순수 계산
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HSCount = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const txt = (v) => (v == null ? '' : String(v).replace(/　/g, ' ').trim());
  const num = (v) => { if (v == null || v === '') return 0; if (typeof v === 'number') return isFinite(v) ? v : 0; const n = parseFloat(String(v).replace(/[,\s]/g, '')); return isFinite(n) ? n : 0; };
  const up = (v) => txt(v).toUpperCase().replace(/\s+/g, '');

  // ---------- 품번 규칙 (크리스 · LX 공통) ----------
  // 품번 4번째 자리 = 기획년도 (0=2020 · A=2021 … F=2026) · 5번째 = 시즌 · 6~7번째 = 아이템 — 규칙표는 style.js 한 곳
  const GRP = { 1: '1 (T/SHIRTS)', 2: '2 (SWEATER)', 3: '3 (OUTER)', 4: '4 (PANTS)', 5: '5 (ACCESSORY)' };
  const ST = (typeof HSStyle !== 'undefined' && HSStyle) || (typeof require === 'function' ? require('./style.js') : null);
  const CLS = ST.CLS;
  const ITEM = new Proxy({}, { get: (o, k) => { if (typeof k !== 'string') return undefined; const e = ST.getExtra()[k]; if (e && e.g) return +e.g; const b = ST.BASE[k]; return b ? b[0] : undefined; } });
  const SEASON = ST.SEASON;
  const yearOfLetter = (ch) => ST.yearNum(ch);
  function classify(style, yearRaw, seasonRaw, grpRaw) {
    const s = up(style);
    let year = null; const ym = txt(yearRaw).match(/(20\d\d)/); if (ym) year = +ym[1]; else year = yearOfLetter(s[3]);
    let season = txt(seasonRaw); if (!season || !/^\d/.test(season)) season = SEASON[s[4]] || (season || '-');
    let g = null; const gm = txt(grpRaw).match(/^([1-5])/); if (gm) g = +gm[1]; else g = ITEM[s.slice(5, 7)] || null;
    return { year: year || '-', season, grp: g ? GRP[g] : '-', cls: ST.clsOf(s, grpRaw), item: s.slice(5, 7) };
  }
  const yearBand = (y, base) => (y === '-' ? '-' : y >= base - 1 ? String(y) : (base - 2) + ' 이하');

  // ---------- 로케이션 ----------
  const splitLocs = (v) => txt(v).split(/[\s,;/]+/).map((x) => x.toUpperCase()).filter(Boolean);
  const zoneOf = (loc) => { if (!loc) return '(위치 없음)'; const p = loc.split('-'); return p.length >= 2 ? p[0] + '-' + p[1] : loc.slice(0, 3); };

  // ---------- 엑셀 머리글 인식 ----------
  const COL = {
    loc: /위치|로케이션|^loc|location|보관/i, style: /^품번$|^품번코드$|스타일|^style$|상품코드|품목코드/i, color: /색상|칼라|컬러|^color$|^col$/i, size: /사이즈|^size$|규격/i,
    cur: /현재고|전산재고|재고수량|^재고$|^전산$/, fut: /미래/, acc: /누적/, brand: /^브랜드(명)?$|^brand$/i, year: /기획년도|^년도$|^연도$/, season: /^시즌$/, grp: /아이템군|복종/, barcode: /바코드|barcode|조합코드|^sku$/i,
    qty: /실사|수량|^qty$|스캔/i, kind: /^구분$|유형|사유|발생구분|종류|^내역$/, crew: /^조$|조명|담당|작업자/,
    // '물류재고관리_재고실사_이월배분' 자체 엑셀: 한 시트에 업무구분(1=창고재고수량·2=지시·3=출고·4=로스·5=매장재고·6=재고실사)으로
    // 여러 자료가 섞여 있음 — 이 칸이 있으면 그 파일로 보고, 줄마다 업무구분이 '6'(재고실사)인 것만 씀 (2026-11-16)
    code6: /^업무구분$/,
  };
  function header(rows) {
    for (let r = 0; r < Math.min(rows.length, 12); r++) {
      const row = rows[r] || []; const ix = {};
      row.forEach((v, c) => { const t = txt(v).replace(/\s+/g, ''); if (!t) return; for (const k in COL) if (COL[k].test(t)) { if (k === 'brand') ix[k] = c; else if (ix[k] == null) ix[k] = c; } });
      if (ix.qty != null && [ix.cur, ix.fut, ix.acc].indexOf(ix.qty) >= 0) delete ix.qty;
      if (ix.qty != null && /현재고|미래|누적/.test(txt(row[ix.qty]))) delete ix.qty;
      if ((ix.style != null || ix.barcode != null)) return { r, ix, names: row.map(txt) };
    }
    return null;
  }
  // 파일 종류: sys(전산 재고) · fut(미래 발생분 내역) · act(실사)
  function detect(rows) {
    const h = header(rows); if (!h) return null; const ix = h.ix;
    if (ix.code6 != null && ix.qty != null) return Object.assign({ kind: 'act' }, h); // 재고관리 도구 자체 엑셀 (업무구분 6줄만)
    if (ix.cur != null || ix.acc != null) return Object.assign({ kind: 'sys' }, h);
    if (ix.kind != null && ix.loc == null && ix.qty != null) return Object.assign({ kind: 'fut' }, h);
    if (ix.loc != null) return Object.assign({ kind: 'act' }, h);
    if (ix.kind != null) return Object.assign({ kind: 'fut' }, h);
    return null;
  }
  const FUT_KIND = (v) => { const t = txt(v); if (/오픈/.test(t)) return '오픈'; if (/행사/.test(t)) return '행사'; if (/로스|loss|분실/i.test(t)) return '로스'; if (/반품/.test(t)) return '반품 창고'; return t ? '기타' : '기타'; };

  // rows(2차원 배열) → 압축 줄
  // sys: [loc, style, color, size, cur, fut, acc, brand, year, season, grp, barcode]
  // fut: [kind, style, color, size, qty, brand]
  // act: [loc, style, color, size, qty, isBarcode, crew]
  function parse(rows, forceKind) {
    const d = detect(rows); if (!d) return null;
    const kind = forceKind || d.kind; const ix = d.ix; const out = []; const g = (row, k) => (ix[k] == null ? '' : row[ix[k]]);
    let qty = 0;
    for (let r = d.r + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      if (ix.code6 != null && txt(g(row, 'code6')) !== '6') continue; // 재고실사(6) 줄만 (창고재고수량·지시·출고·로스·매장재고는 건너뜀)
      let style = up(g(row, 'style')); const bc = up(g(row, 'barcode'));
      if (!style && !bc) continue; if (/^(합계|소계|TOTAL)/.test(style)) continue;
      if (kind === 'sys') {
        const cur = num(g(row, 'cur')); const fut = ix.fut != null ? num(g(row, 'fut')) : (ix.acc != null && ix.cur != null ? cur - num(g(row, 'acc')) : 0);
        const acc = ix.acc != null ? num(g(row, 'acc')) : cur - fut;
        if (!style) style = bc;
        out.push([splitLocs(g(row, 'loc')).join(' '), style, up(g(row, 'color')), up(g(row, 'size')), cur, fut, acc, txt(g(row, 'brand')), txt(g(row, 'year')), txt(g(row, 'season')), txt(g(row, 'grp')), bc]); qty += cur;
      } else if (kind === 'fut') {
        const q = ix.qty != null ? num(g(row, 'qty')) : 1; if (!q) continue;
        out.push([FUT_KIND(g(row, 'kind')), style || bc, up(g(row, 'color')), up(g(row, 'size')), q, txt(g(row, 'brand'))]); qty += q;
      } else {
        const q = ix.qty != null ? num(g(row, 'qty')) : 1; // 수량 칸이 없으면 한 줄 = 1개 (PDA 스캔)
        const loc = splitLocs(g(row, 'loc'))[0] || '';
        out.push([loc, style || bc, style ? up(g(row, 'color')) : '', style ? up(g(row, 'size')) : '', q, style ? 0 : 1, txt(g(row, 'crew'))]); qty += q;
      }
    }
    const multi = kind === 'sys' && out.some((x) => x[0].indexOf(' ') > 0);
    return { kind, rows: out, meta: { lines: out.length, qty, cols: Object.keys(ix), multiLoc: multi, header: d.names.filter(Boolean).slice(0, 20) } };
  }

  // ---------- 계산 ----------
  // data: { sys:[rows], fut:[rows], act:[{file, at, crew, rows}], re:[{file, at, rows}] }
  // opts: { level:'auto'|'loc'|'sku', cmp:'cur'|'acc'|'loc', loc_rule:[{prefix,cmp}], loss:'excl'|'incl', tol_qty:3, tol_pct:5, zones_done:[], base_year }
  function compute(data, opts, brandOf) {
    opts = Object.assign({ level: 'auto', cmp: 'cur', loc_rule: [], loss: 'excl', tol_qty: 3, tol_pct: 5, zones_done: [] }, opts || {});
    brandOf = brandOf || ((x) => x);
    const sys = data.sys || [];
    const multi = sys.some((x) => x[0].indexOf(' ') > 0);
    const level = opts.level === 'auto' ? (multi ? 'sku' : 'loc') : (opts.level === 'loc' && multi ? 'sku' : opts.level);
    const skuK = (s, c, z) => s + '|' + c + '|' + z;
    const baseYear = opts.base_year || new Date().getFullYear();

    // 바코드 → SKU (전산 재고에 바코드·조합코드가 있으면 그대로, 없으면 품번 앞자리로 자르기)
    const bcMap = new Map(); const styles = new Set(); const styleLens = new Set();
    for (const r of sys) { if (r[11]) bcMap.set(r[11], [r[1], r[2], r[3]]); bcMap.set(r[1] + r[2] + r[3], [r[1], r[2], r[3]]); bcMap.set(r[1] + r[2], [r[1], r[2], r[3]]); styles.add(r[1]); styleLens.add(r[1].length); }
    const lens = [...styleLens].sort((a, b) => b - a);
    const resolve = (code) => { if (bcMap.has(code)) return bcMap.get(code); for (const L of lens) { const s = code.slice(0, L); if (styles.has(s)) return [s, code.slice(L, L + 2), code.slice(L + 2)]; } return [code, '', '']; };

    // 품목 정보 (브랜드·년도·시즌·복종)
    const info = new Map();
    const infoOf = (style, r) => {
      if (info.has(style) && !r) return info.get(style);
      const c = classify(style, r && r[8], r && r[9], r && r[10]);
      const b = (r && r[7] && brandOf(r[7])) || brandOf('CODE:' + style[0]) || '(미확인)';
      const o = { brand: b, year: c.year, yband: yearBand(c.year, baseYear), season: c.season, grp: c.grp, cls: c.cls };
      if (!info.has(style) || r) info.set(style, o); return o;
    };

    // 전산 재고 → 비교 단위
    const E = new Map(); // key → entry
    const locSet = new Map(); // loc → zone
    for (const r of sys) {
      const locs = r[0] ? r[0].split(' ') : [];
      locs.forEach((l) => locSet.set(l, zoneOf(l)));
      const sk = skuK(r[1], r[2], r[3]); const key = level === 'loc' ? (locs[0] || '') + '#' + sk : sk;
      let e = E.get(key);
      if (!e) { e = { key, sku: sk, loc: level === 'loc' ? (locs[0] || '') : '', locs: new Set(), style: r[1], color: r[2], size: r[3], cur: 0, fut: 0, acc: 0, act: 0, scanned: false, inSys: true }; E.set(key, e); }
      locs.forEach((l) => e.locs.add(l)); e.cur += r[4]; e.fut += r[5]; e.acc += r[6];
      infoOf(r[1], r);
    }

    // 실사 자료: 같은 로케이션은 가장 나중에 올린 파일 값으로 교체
    const acts = (data.act || []).slice().sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
    const locFile = new Map();
    acts.forEach((f, i) => { const seen = new Set(); f.rows.forEach((x) => { if (x[0] && !seen.has(x[0])) { seen.add(x[0]); locFile.set(x[0], i); } }); });
    const scannedLocs = new Set(); const crewOfZone = {}; const unknown = new Map();
    let actTotal = 0;
    acts.forEach((f, i) => {
      for (const x of f.rows) {
        if (x[0] && locFile.get(x[0]) !== i) continue; // 다시 올린 로케이션 → 이전 파일 값 무시
        let st = x[1], co = x[2], sz = x[3]; if (x[5]) [st, co, sz] = resolve(x[1]);
        const sk = skuK(st, co, sz); const key = level === 'loc' ? x[0] + '#' + sk : sk;
        if (x[0]) { scannedLocs.add(x[0]); if (!locSet.has(x[0])) locSet.set(x[0], zoneOf(x[0])); const z = zoneOf(x[0]); if (x[6] || f.crew) (crewOfZone[z] = crewOfZone[z] || new Set()).add(x[6] || f.crew); }
        let e = E.get(key);
        if (!e) { e = { key, sku: sk, loc: level === 'loc' ? x[0] : '', locs: new Set(), style: st, color: co, size: sz, cur: 0, fut: 0, acc: 0, act: 0, scanned: true, inSys: false }; E.set(key, e); unknown.set(key, e); infoOf(st); }
        if (x[0]) e.locs.add(x[0]);
        e.act += x[4]; e.scanned = true; actTotal += x[4];
      }
    });

    // 재실사: 해당 항목 실사 수량을 재실사 값으로 교체
    const re = new Map();
    (data.re || []).slice().sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))).forEach((f) => {
      const seen = new Map();
      for (const x of f.rows) {
        let st = x[1], co = x[2], sz = x[3]; if (x[5]) [st, co, sz] = resolve(x[1]);
        const sk = skuK(st, co, sz); const key = level === 'loc' ? x[0] + '#' + sk : sk;
        seen.set(key, (seen.get(key) || 0) + x[4]);
      }
      seen.forEach((q, k) => re.set(k, q));
    });

    // 비교 범위: 위치가 모두 실사 완료(스캔 또는 완료 처리 구역)된 항목
    const zDone = new Set(opts.zones_done || []);
    const locDone = (l) => scannedLocs.has(l) || zDone.has(zoneOf(l));
    const cmpOf = (e) => {
      let m = opts.cmp;
      if (m === 'loc') { m = 'cur'; const l = e.loc || [...e.locs][0] || ''; for (const r of opts.loc_rule || []) if (r.prefix && l.indexOf(r.prefix.toUpperCase()) === 0) { m = r.cmp; break; } }
      return m;
    };

    // 미래 발생분 (위치 없음 · SKU 단위)
    const futBy = {}; const lossSku = new Map(); const futSku = new Map();
    for (const f of data.fut || []) {
      futBy[f[0]] = (futBy[f[0]] || 0) + f[4];
      const sk = skuK(f[1], f[2], f[3]);
      if (f[0] === '로스') lossSku.set(sk, (lossSku.get(sk) || 0) + f[4]);
      futSku.set(sk, (futSku.get(sk) || 0) + f[4]);
    }

    const lines = [];
    for (const e of E.values()) {
      const locs = [...e.locs]; const inScope = e.inSys ? (locs.length ? locs.every(locDone) : zDone.has('(위치 없음)')) : true;
      const it = info.get(e.style) || infoOf(e.style);
      const m = cmpOf(e);
      const L = { key: e.key, loc: e.loc || locs.slice(0, 4).join(' ') + (locs.length > 4 ? ' 외 ' + (locs.length - 4) : ''), zone: zoneOf(e.loc || locs[0] || ''), style: e.style, color: e.color, size: e.size,
        brand: it.brand, year: it.year, yband: it.yband, season: it.season, grp: it.grp, cls: it.cls,
        cur: e.cur, fut: e.fut, acc: e.acc, cmpBy: m, sys: e.inSys ? (m === 'acc' ? e.acc : e.cur) : 0, act1: e.act, act: re.has(e.key) ? re.get(e.key) : e.act, re: re.has(e.key) ? re.get(e.key) : null,
        inSys: e.inSys, scope: inScope, loss: 0 };
      lines.push(L);
    }
    // 로스: 차이에서 제외(현재고 비교 → 부족을 로스로 설명) / 포함(누적재고 비교 → 로스를 다시 더해 부족으로 표시)
    const bySku = new Map(); lines.forEach((l) => { const k = skuK(l.style, l.color, l.size); (bySku.get(k) || bySku.set(k, []).get(k)).push(l); });
    for (const [sk, q] of lossSku) {
      const ls = (bySku.get(sk) || []).filter((l) => l.scope && l.inSys); let left = q;
      for (const l of ls) {
        if (opts.loss === 'excl' && l.cmpBy === 'cur') { const short = Math.max(0, l.sys - l.act); const u = Math.min(short, left); l.loss = u; l.sys -= u; left -= u; }
        else if (opts.loss === 'incl' && l.cmpBy === 'acc') { l.sys += left; l.loss = -left; left = 0; }
        if (left <= 0) break;
      }
    }
    // 차이 · 유형
    for (const l of lines) { l.diff = l.act - l.sys; l.type = !l.inSys ? '미등록' : l.diff === 0 ? '일치' : l.diff < 0 ? '부족' : '과잉'; }
    if (level === 'loc') { // 같은 SKU가 다른 로케이션에서 남고 모자라면 → 위치 상이
      for (const ls of bySku.values()) {
        const sh = ls.filter((l) => l.scope && l.diff < 0), ov = ls.filter((l) => l.scope && l.diff > 0);
        for (const a of sh) for (const b of ov) {
          const m = Math.min(-a.diff - (a.moved || 0), b.diff - (b.moved || 0)); if (m <= 0) continue;
          a.moved = (a.moved || 0) + m; b.moved = (b.moved || 0) + m; a.moveTo = b.loc; b.moveFrom = a.loc;
        }
        for (const l of sh.concat(ov)) if (l.moved && l.moved >= Math.abs(l.diff)) l.type = '위치 상이';
      }
    }
    for (const l of lines) {
      l.recount = l.scope && (l.type === '부족' || l.type === '과잉' || l.type === '미등록') && l.re == null &&
        (Math.abs(l.diff) >= opts.tol_qty || (l.sys > 0 && Math.abs(l.diff) / l.sys * 100 >= opts.tol_pct));
    }

    // ---------- 요약 ----------
    const S = lines.filter((l) => l.scope);
    const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
    const kpi = {
      level, lines: S.filter((l) => l.inSys).length, match: S.filter((l) => l.type === '일치').length,
      cur: sum(S, (l) => l.cur), fut: sum(S, (l) => l.fut), acc: sum(S, (l) => l.acc), sys: sum(S, (l) => l.sys), act: sum(S, (l) => l.act), loss: sum(S, (l) => l.loss),
      short: sum(S, (l) => (l.diff < 0 ? l.diff : 0)), over: sum(S, (l) => (l.diff > 0 ? l.diff : 0)),
      n_short: S.filter((l) => l.type === '부족').length, n_over: S.filter((l) => l.type === '과잉').length, n_moved: S.filter((l) => l.type === '위치 상이').length, n_unreg: S.filter((l) => l.type === '미등록').length,
      n_recount: S.filter((l) => l.recount).length, n_re: S.filter((l) => l.re != null).length, act_total: actTotal,
      all_cur: sum(lines, (l) => l.cur), all_fut: sum(lines, (l) => l.fut), all_acc: sum(lines, (l) => l.acc),
    };
    kpi.diff = kpi.act - kpi.sys; kpi.n_diff = kpi.n_short + kpi.n_over + kpi.n_moved + kpi.n_unreg;
    kpi.rate = kpi.lines ? kpi.match / kpi.lines * 100 : null;
    kpi.qrate = kpi.sys ? (1 - (Math.abs(kpi.short) + kpi.over) / kpi.sys) * 100 : null;

    const grpBy = (f) => { const m = new Map(); for (const l of S) { const k = f(l); const o = m.get(k) || m.set(k, { k, sys: 0, act: 0, cur: 0, fut: 0, acc: 0, short: 0, over: 0, n: 0, match: 0, rec: 0 }).get(k); o.sys += l.sys; o.act += l.act; o.cur += l.cur; o.fut += l.fut; o.acc += l.acc; if (l.diff < 0) o.short += l.diff; else o.over += l.diff; o.n++; if (l.type === '일치') o.match++; if (l.recount) o.rec++; } return [...m.values()].map((o) => Object.assign(o, { diff: o.act - o.sys, qrate: o.sys ? (1 - (Math.abs(o.short) + o.over) / o.sys) * 100 : null })); };
    const brands = grpBy((l) => l.brand).sort((a, b) => b.sys - a.sys);

    // 구역별 진행률 (전산 로케이션 대비 실사 완료)
    const zones = new Map();
    for (const [l, z] of locSet) { const o = zones.get(z) || zones.set(z, { zone: z, locs: 0, done: 0, scanned: 0, cur: 0, sys: 0, act: 0 }).get(z); o.locs++; if (scannedLocs.has(l)) o.scanned++; if (locDone(l)) o.done++; }
    for (const l of lines) { const o = zones.get(l.zone) || zones.set(l.zone, { zone: l.zone, locs: 0, done: 0, scanned: 0, cur: 0, sys: 0, act: 0 }).get(l.zone); o.cur += l.cur; if (l.scope) { o.sys += l.sys; o.act += l.act; } }
    const zl = [...zones.values()].map((o) => Object.assign(o, { pct: o.locs ? o.done / o.locs * 100 : (zDone.has(o.zone) ? 100 : 0), complete: zDone.has(o.zone) || (o.locs > 0 && o.done === o.locs), crew: [...(crewOfZone[o.zone] || [])].join(', '), diff: o.act - o.sys })).sort((a, b) => a.zone.localeCompare(b.zone));
    const zt = { locs: sum(zl, (z) => z.locs), done: sum(zl, (z) => z.done) };
    kpi.loc_total = zt.locs; kpi.loc_done = zt.done; kpi.progress = zt.locs ? zt.done / zt.locs * 100 : 0;
    kpi.zones_total = zl.length; kpi.zones_complete = zl.filter((z) => z.complete).length;

    const fut = Object.keys(futBy).map((k) => ({ kind: k, qty: futBy[k] }));
    return { level, multi, kpi, lines, brands, zones: zl, fut, futSku, grpBy };
  }

  // 목록·대시보드용 요약 (DB erp_cnt.summary 에 저장)
  function summary(res) {
    return { kpi: res.kpi, brands: res.brands.map((b) => ({ k: b.k, sys: b.sys, act: b.act, short: b.short, over: b.over, qrate: b.qrate })), zones: res.zones.map((z) => ({ zone: z.zone, locs: z.locs, done: z.done, pct: Math.round(z.pct * 10) / 10 })), fut: res.fut, at: new Date().toISOString() };
  }

  // 5천 줄 묶음
  const chunk = (rows, n) => { n = n || 5000; const out = []; for (let i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n)); return out.length ? out : [[]]; };

  return { parse, detect, compute, summary, classify, zoneOf, splitLocs, chunk, ITEM, GRP, CLS, SEASON };
});
