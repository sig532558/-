/* 혜성물류 운영 ERP — 반품 관리 엑셀 인식 · 계산
 *  · 매장 반품 등록: 화주 ERP '의뢰 대비 출고 반품 현황' (브랜드별 파일/시트) → 미처리(출고일자 없음) 줄
 *  · 고백센터 반품 확정: 화주 ERP '출고 반품 현황' → 확정일 × 브랜드 전표 수 · PCS
 *  · 기존 관리 엑셀(반품 관리 V1.211): 위 2종 + 행낭 · 타택배 시트 + 일별 대장의 박스(탑·롯데·기타용품·실무진)
 * 계산 규칙은 '일별 반품 관리 대장 전표' · '일별반품 관리대장 PCS' 시트 수식과 같음
 *  · 당일 반품 완료 전표 = 출고반품현황 줄 수 (출고일자·브랜드)   · PCS = −출고수량 합
 *  · 전산 미처리 전표 = 브랜드 시트에서 출고일자가 빈 줄 수 (의뢰일자) · PCS = 미출고수량 합
 *  · 행낭 BOX = 행낭 시트 Box 합 · 기타 BOX = 타택배 시트 Box 합 (날짜별)
 * 브라우저(window.HSReturns)와 Node(require) 양쪽에서 동작
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./parsers2.js'));
  else root.HSReturns = factory(root.HSParsers2);
})(typeof self !== 'undefined' ? self : this, function (P2) {
  'use strict';
  const txt = (v) => (v == null ? '' : String(v).replace(/[　 ]/g, ' ').trim());
  const nk = (v) => txt(v).replace(/\s+/g, '');
  const num = P2.num;
  const day = (v) => { const s = txt(v); if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); return P2.toDate(v); };

  // 시트 머리글 → 자료 종류
  const SPEC = {
    req: { need: ['의뢰일자', '의뢰수량', '미출고수량'], label: '매장 반품 등록 (의뢰 대비 출고 반품 현황)' },
    done: { need: ['출고일자', '출고수량', '전표바코드', '매장명'], not: ['의뢰일자'], label: '고백센터 반품 확정 (출고 반품 현황)' },
    bag_t: { need: ['날짜', '택배사', '브랜드', '매장명', 'box'], label: '타택배 대장' },
    bag_h: { need: ['날짜', '구분', '브랜드', '매장명', 'box'], not: ['택배사'], label: '행낭 대장' },
    ledger: { need: ['도착일'], label: '일별 반품 관리 대장 (박스)' },
  };
  const SLOT = { req: ['req'], done: ['done'], box: ['ledger'], all: ['req', 'done', 'bag_t', 'bag_h', 'ledger'] };
  function header(g, kind, maxRow) {
    const sp = SPEC[kind];
    for (let r = 0; r < Math.min(g.length, maxRow || 8); r++) {
      const row = (g[r] || []).map((v) => nk(v).toLowerCase()); const ix = {};
      row.forEach((v, i) => { if (v && ix[v] == null) ix[v] = i; });
      if (sp.need.every((n) => ix[n.toLowerCase()] != null) && !(sp.not || []).some((n) => ix[n.toLowerCase()] != null)) return { r, ix };
    }
    return null;
  }
  function diagnose(g, kinds) {
    let best = null;
    for (const k of kinds) for (let r = 0; r < Math.min(g.length, 8); r++) {
      const row = (g[r] || []).map((v) => nk(v)).filter(Boolean); if (!row.length) continue; const low = row.map((x) => x.toLowerCase());
      const hit = SPEC[k].need.filter((n) => low.indexOf(n.toLowerCase()) >= 0).length;
      if (!best || hit > best.hit || (hit === best.hit && row.length > best.cols.length)) best = { kind: k, hit, miss: SPEC[k].need.filter((n) => low.indexOf(n.toLowerCase()) < 0), cols: row.slice(0, 8) };
    }
    return best;
  }
  const col = (ix, ...names) => { for (const n of names) { const i = ix[n.toLowerCase()]; if (i != null) return i; } return null; };
  const at = (row, i) => (i == null ? null : row[i]);

  // 일별 반품 관리 대장(박스) 칸 찾기 — 머리글이 두 줄(묶음 + 세부)이라 두 줄을 같이 본다
  //  · 이름으로 찾지 못하면 null → 옛 V1.211 자리(A 도착일 · B 탑 · C 롯데 · D 행낭 · E 기타 · H 기타용품 · I 완료 · J 대기)를 쓴다
  const LCOL = { d: ['도착일', '날짜', '일자', '반품일'], top: ['탑', '탑코리아'], lotte: ['롯데', '롯데택배', '롯데글로벌'], haengnang: ['행낭'], etc: ['기타'], hanger: ['기타용품', '옷걸이', '옷걸이기타박스', '옷걸이·기타박스'], done: ['완료', '반품완료'], pending: ['대기', '미작업'] };
  const LFIX = { d: 0, top: 1, lotte: 2, haengnang: 3, etc: 4, hanger: 7, done: 8, pending: 9 };
  function ledgerCols(g, hr) {
    const ix = {};
    for (const r of [hr, hr + 1]) (g[r] || []).forEach((v, i) => { const s = nk(v); if (!s) return; for (const k in LCOL) if (ix[k] == null && LCOL[k].indexOf(s) >= 0) ix[k] = i; });
    return ix.d != null && ix.top != null && ix.lotte != null ? ix : null; // 날짜 · 탑 · 롯데를 다 찾았을 때만 이름으로 읽는다
  }

  // sheets: [{name, ws}] · file: 파일 이름 · only: 받을 종류 · brandOf: 텍스트 → 기준 브랜드
  function readBook(sheets, file, only, brandOf) {
    const out = { req: [], done: [], bags: [], box: [], found: [], miss: [], noBrand: [] };
    const kinds = only || SLOT.all;
    const fileBrand = brandOf(String(file || '').replace(/\.[^.]+$/, '').replace(/[_\-\d.()\s]+/g, ' ').trim().split(' ')[0]) || null;
    for (const s of sheets) {
      P2.shrink(s.ws);
      const g = P2.grid(s.ws, 200000);
      let k = null, h = null;
      for (const kk of ['req', 'done', 'bag_t', 'bag_h', 'ledger']) { if (kinds.indexOf(kk) < 0) continue; h = header(g, kk, kk === 'ledger' ? 6 : 8); if (h) { k = kk; break; } }
      let lc = null;
      if (k === 'ledger') { // 박스 대장(전표 시트)만 — 칸 이름으로 찾고, 못 찾으면 '도착 운송사 BOX' 묶음 글씨로 확인
        lc = ledgerCols(g, h.r);
        if (!lc && !g.slice(0, 6).some((row) => (row || []).some((v) => /도착운송사/.test(nk(v))))) k = null;
      }
      if (!k) {
        const rest = kinds.filter((x) => x !== 'ledger');
        if (!rest.length) { // 박스 대장만 찾는 중 — 시트의 칸 이름을 그대로 보여 준다
          const cols = (g.slice(0, 8).map((row) => (row || []).map((v) => nk(v)).filter(Boolean)).sort((a, b) => b.length - a.length)[0] || []).slice(0, 8);
          if (cols.length) out.miss.push({ sheet: s.name, kind: 'ledger', label: SPEC.ledger.label, miss: ['도착일', '탑', '롯데'], cols });
          continue;
        }
        const d = diagnose(g, rest); if (d && d.cols.length) out.miss.push({ sheet: s.name, kind: d.kind, label: SPEC[d.kind].label, miss: d.miss, cols: d.cols }); continue;
      }
      const ix = h.ix; let n = 0, skip = 0, pcs = 0;
      if (k === 'req') {
        const iB = col(ix, '브랜드'), iD = col(ix, '의뢰일자'), iNo = col(ix, '의뢰번호'), iO = col(ix, '출고일자'), iS = col(ix, '매장명'), iR = col(ix, '의뢰수량'), iOut = col(ix, '출고수량'), iP = col(ix, '미출고수량'), iBc = col(ix, '전표바코드');
        const sheetBrand = brandOf(s.name) || null;
        for (let r = h.r + 1; r < g.length; r++) {
          const row = g[r]; if (!row || !row.length) continue;
          const d = day(at(row, iD)); if (!d) { if (txt(at(row, iD)) && nk(at(row, iD)) !== '의뢰일자') skip++; continue; }
          const brand = (iB != null && brandOf(txt(at(row, iB)))) || sheetBrand || fileBrand;
          const o = { brand, d, no: txt(at(row, iNo)), out_date: day(at(row, iO)), store: txt(at(row, iS)), req: num(at(row, iR)) || 0, out: num(at(row, iOut)) || 0, pend: -(num(at(row, iP)) || 0), slip: txt(at(row, iBc)) };
          if (!brand) out.noBrand.push(o); else out.req.push(o);
          n++; pcs += Math.abs(o.req);
        }
      } else if (k === 'done') {
        const iB = col(ix, '브랜드'), iD = col(ix, '출고일자'), iG = col(ix, '출고구분'), iQ = col(ix, '출고수량'), iBc = col(ix, '전표바코드');
        for (let r = h.r + 1; r < g.length; r++) {
          const row = g[r]; if (!row || !row.length) continue;
          if (nk(at(row, iB)) === '브랜드') continue; // 머리글 반복 줄
          const d = day(at(row, iD)); if (!d) { if (txt(at(row, iB))) skip++; continue; }
          const gb = txt(at(row, iG)); if (gb && !/반품/.test(gb)) { skip++; continue; }
          const brand = brandOf(txt(at(row, iB))) || txt(at(row, iB)) || null; if (!brand) { skip++; continue; }
          const q = -(num(at(row, iQ)) || 0);
          out.done.push({ d, brand, pcs: q, slip: txt(at(row, iBc)) }); n++; pcs += q;
        }
      } else if (k === 'bag_h' || k === 'bag_t') {
        const kind = k === 'bag_h' ? '행낭' : '타택배'; const seen = {};
        const I = (...a) => col(ix, ...a);
        const m = { d: I('날짜'), courier: I('택배사'), gubun: I('구분'), brand: I('브랜드'), conf: I('반품확정여부'), store: I('매장명'), box: I('box'), note: I('비고'), status: I('상태'), cd: I('확인일자'), checker: I('확인자'), cn: I('위탁사비고'), pd: I('처리일자'), pb: I('처리자'), pn: I('처리자비고') };
        for (let r = h.r + 1; r < g.length; r++) {
          const row = g[r]; if (!row || !row.length) continue;
          const d = day(at(row, m.d)); const store = txt(at(row, m.store)); const box = num(at(row, m.box));
          if (!d) { if (store || box) skip++; continue; }
          const bt = txt(at(row, m.brand));
          const o = { kind, rec_date: d, courier: txt(at(row, m.courier)) || null, gubun: txt(at(row, m.gubun)) || null, brand: brandOf(bt) || bt || null, confirmed: txt(at(row, m.conf)) || null, store: store || null, box: box || 0, note: txt(at(row, m.note)) || null,
            status: txt(at(row, m.status)) || null, check_date: day(at(row, m.cd)), checker: txt(at(row, m.checker)) || null, client_note: txt(at(row, m.cn)) || null, proc_date: day(at(row, m.pd)), proc_by: txt(at(row, m.pb)) || null, proc_note: txt(at(row, m.pn)) || null };
          const base = ['x', kind, d, o.courier, o.gubun, o.brand, o.store, o.box, o.note].join('|'); seen[base] = (seen[base] || 0) + 1;
          o.source_key = base + '|' + seen[base];
          out.bags.push(o); n++; pcs += o.box;
        }
      } else if (k === 'ledger') { // 일별 반품 관리 대장 전표 — 칸 이름으로, 없으면 옛 자리(LFIX)로
        const m = lc || LFIX;
        for (let r = h.r + 1; r < g.length; r++) {
          const row = g[r]; if (!row || !row.length) continue; const d = day(row[m.d]); if (!d) continue;
          const v = (i) => (i == null ? 0 : num(row[i]) || 0); const o = { rec_date: d, top: v(m.top), lotte: v(m.lotte), haengnang: v(m.haengnang), etc: v(m.etc), hanger: v(m.hanger), done: v(m.done), pending: v(m.pending) };
          if (o.top || o.lotte || o.haengnang || o.etc || o.hanger || o.done || o.pending) { out.box.push(o); n++; }
        }
      }
      out.found.push({ sheet: s.name, kind: k, label: SPEC[k].label, rows: n, skip, qty: pcs, brand: k === 'req' ? (brandOf(s.name) || fileBrand || null) : null });
    }
    return out;
  }

  // 반품 확정 → 날짜 × 브랜드 합계 (같은 날짜 범위는 새 파일 값으로 바꿈)
  function doneAgg(done) {
    const m = {}; let from = null, to = null;
    for (const r of done) { const k = r.d + '|' + r.brand; const x = m[k] || (m[k] = { rec_date: r.d, brand: r.brand, slips: 0, pcs: 0 }); x.slips++; x.pcs += r.pcs; if (!from || r.d < from) from = r.d; if (!to || r.d > to) to = r.d; }
    return { rows: Object.values(m), from, to };
  }
  // old: 지금 저장된 erp_ret_done (from~to) → 새 파일에 없는 날짜·브랜드는 0으로
  function doneUpserts(agg, old) {
    const have = new Set(agg.rows.map((r) => r.rec_date + '|' + r.brand));
    const zero = (old || []).filter((o) => o.rec_date >= agg.from && o.rec_date <= agg.to && !have.has(o.rec_date + '|' + o.brand) && (o.slips || o.pcs)).map((o) => ({ rec_date: o.rec_date, brand: o.brand, slips: 0, pcs: 0 }));
    return agg.rows.concat(zero);
  }
  // 매장 반품 → 브랜드별 미처리 묶음 (파일의 의뢰일 범위는 새 값으로, 범위 밖 기존 미처리는 유지)
  function pendMerge(req, oldMap) {
    const by = {};
    for (const r of req) { const b = by[r.brand] || (by[r.brand] = { brand: r.brand, from: r.d, to: r.d, slips: 0, pcs: 0, rows: [] }); if (r.d < b.from) b.from = r.d; if (r.d > b.to) b.to = r.d; b.slips++; b.pcs += Math.abs(r.req);
      if (!r.out_date || r.pend) b.rows.push({ d: r.d, no: r.no, store: r.store, req: Math.abs(r.req), out: Math.abs(r.out), pend: r.pend, slip: r.slip, open: !r.out_date }); }
    return Object.values(by).map((b) => {
      const old = (oldMap && oldMap[b.brand]) || null;
      const keep = old ? (old.rows || []).filter((x) => x.d < b.from || x.d > b.to) : [];
      const rows = keep.concat(b.rows).sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
      return { brand: b.brand, req_from: old && old.req_from && old.req_from < b.from ? old.req_from : b.from, req_to: old && old.req_to && old.req_to > b.to ? old.req_to : b.to, req_slips: b.slips, req_pcs: b.pcs, rows, _new: b.rows.filter((x) => x.open).length, _old: old ? (old.rows || []).filter((x) => x.open && x.d >= b.from && x.d <= b.to).length : 0 };
    });
  }
  // 미처리 집계: 의뢰일 × 브랜드 → 전표(출고일자 없는 줄) · PCS(미출고수량)
  function pendAgg(pendRows) {
    const m = {};
    for (const p of pendRows || []) for (const x of p.rows || []) { const k = x.d + '|' + p.brand; const o = m[k] || (m[k] = { d: x.d, brand: p.brand, slips: 0, pcs: 0 }); if (x.open) o.slips++; o.pcs += x.pend || 0; }
    return Object.values(m);
  }
  return { readBook, doneAgg, doneUpserts, pendMerge, pendAgg, SPEC, SLOT, day };
});
