/* 혜성물류 운영 ERP — 추가 기능 엑셀 인식
 *  · 아침 출고지시 취합 월별 시트 (25년 오전/오후 양식, 26년 2025년/2026년/B2C 양식)
 *  · 사방넷 주문 (B2C 브랜드별 배송지 건수 · 수량) — 개인정보는 계산에만 쓰고 결과에 넣지 않음
 *  · Daily KPI Report (Summary · 입고 · 초도 · 배출 · 출고 · 반품 · 그외업무)
 *  · 신상품: 화주 ERP 품번정보 · 입고현황, WMS 재고현황, 불량상품
 * 브라우저(window.XLSX)와 Node(require('xlsx')) 양쪽에서 동작
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('xlsx'));
  // 2026-11-12: 엑셀 라이브러리를 뒤에서 받으므로 여기서 값을 붙잡으면 안 됨 — 쓸 때마다 window.XLSX 를 봄
  else root.HSParsers2 = factory({ get utils() { return root.XLSX.utils; }, read: function () { return root.XLSX.read.apply(root.XLSX, arguments); }, write: function () { return root.XLSX.write.apply(root.XLSX, arguments); }, writeFile: function () { return root.XLSX.writeFile.apply(root.XLSX, arguments); } });
})(typeof self !== 'undefined' ? self : this, function (XLSX) {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const txt = (v) => (v == null ? '' : String(v).replace(/　/g, ' ').trim());
  const nk = (v) => txt(v).replace(/[\s]+/g, '');
  const num = (v) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v).replace(/[,\s원]/g, '');
    if (s === '' || s === '-' || /^#/.test(s)) return null;
    const n = Number(s); return isFinite(n) ? n : null;
  };
  function toDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    if (typeof v === 'number') {
      if (v > 19000101 && v < 21001231) { const s = String(Math.round(v)); return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); }
      if (v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
      return null;
    }
    const s = String(v).trim();
    let m = s.match(/^(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/); if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    m = s.match(/^(\d{2})(\d{2})(\d{2})$/); if (m) return '20' + m[1] + '-' + m[2] + '-' + m[3];
    return null;
  }
  const grid = (ws, maxRows) => {
    if (!ws || !ws['!ref']) return [];
    const r = XLSX.utils.decode_range(ws['!ref']);
    if (maxRows) r.e.r = Math.min(r.e.r, r.s.r + maxRows - 1);
    const out = [];
    for (let R = r.s.r; R <= r.e.r; R++) {
      const row = []; let any = false;
      for (let C = 0; C <= r.e.c; C++) { const c = ws[XLSX.utils.encode_cell({ r: R, c: C })]; const v = c ? (c.v !== undefined ? c.v : null) : null; row.push(v); if (v != null && v !== '') any = true; }
      out.push(any ? row : []);
    }
    return out;
  };
  // 실제 사용 범위만 (빈 행 104만 줄 같은 파일 대비)
  const shrink = (ws) => { try { if (!ws['!ref']) return; const r = XLSX.utils.decode_range(ws['!ref']); let maxR = 0; for (const k in ws) { if (k[0] === '!') continue; const a = XLSX.utils.decode_cell(k); if (a.r > maxR) maxR = a.r; } r.e.r = Math.min(r.e.r, maxR); ws['!ref'] = XLSX.utils.encode_range(r); } catch (e) { /* 무시 */ } };

  // ================= 1. 아침 출고지시 월별 시트 =================
  const ORDER_SHEET = /^(\d{2})(\d{1,2})월$/;
  function isOrderSheet(name, g) {
    if (!ORDER_SHEET.test(name.trim())) return false;
    const r2 = (g[1] || []).map(nk).join('|'); const r1 = nk((g[0] || [])[0]);
    return /2025년\|2026년|20\d\d년\|20\d\d년/.test(r2) || (/오전\|오후/.test(r2) && /브랜드/.test(r1));
  }
  // brandOf: (텍스트) → 기준 브랜드명 | null
  function parseOrderSheet(name, ws, brandOf) {
    shrink(ws);
    const g = grid(ws, 80); const warn = []; const orders = []; const days = [];
    if (!isOrderSheet(name, g)) return null;
    const isNew = /20\d\d년/.test((g[1] || []).map(nk).join('|'));
    // 날짜 블록
    const blocks = []; const r1 = g[0] || [];
    for (let c = 1; c < r1.length; c++) { const d = toDate(r1[c]); if (d) blocks.push({ c, d }); }
    blocks.forEach((b, i) => (b.w = (blocks[i + 1] ? blocks[i + 1].c : b.c + (isNew ? 4 : 3)) - b.c));
    const seen = new Set();
    const use = blocks.filter((b) => { if (seen.has(b.d)) { warn.push(b.d + ' 날짜가 두 번 있어 첫 번째만 사용'); return false; } seen.add(b.d); return true; });
    // 구역 찾기
    const label = (r) => txt((g[r] || [])[0]);
    let saleEnd = -1, preStart = -1, preEnd = -1;
    for (let r = 2; r < g.length; r++) { const l = nk(label(r)); if (saleEnd < 0 && /소계|TOTAL/i.test(l)) saleEnd = r; else if (preStart < 0 && /특이사항/.test(l)) preStart = r + 1; else if (preStart > 0 && preEnd < 0 && /소계|TOTAL/i.test(l)) preEnd = r; }
    if (saleEnd < 0) return { orders: [], days: [], warnings: ['브랜드 구역을 찾지 못했습니다'] };
    const unknown = new Set();
    const bOf = (r) => { const t = label(r); if (!t) return null; const b = brandOf(t); if (!b) unknown.add(t); return b || t; };
    for (const bk of use) {
      const c = bk.c; const day = { rec_date: bk.d, prev: { sale: {}, pre: {} } }; let anyPrev = false;
      for (let r = 2; r < saleEnd; r++) {
        const b = bOf(r); if (!b) continue; const row = g[r] || [];
        if (isNew) {
          const q = num(row[c + 1]); const p = num(row[c]);
          if (q != null) orders.push({ rec_date: bk.d, section: 'sale', brand: b, qty: q });
          if (p != null) { day.prev.sale[b] = p; anyPrev = true; }
        } else {
          const a = num(row[c]), pm = num(row[c + 1]);
          if (a != null || pm != null) orders.push({ rec_date: bk.d, section: 'sale', brand: b, qty: (a || 0) + (pm || 0) });
        }
      }
      if (preStart > 0) {
        for (let r = preStart; r < (preEnd > 0 ? preEnd : Math.min(g.length, preStart + 20)); r++) {
          const b = bOf(r); if (!b) continue; const row = g[r] || [];
          if (isNew) {
            const q = num(row[c + 1]), p = num(row[c]); const note = txt(row[c + 2]);
            if (q != null || (note && q != null)) orders.push({ rec_date: bk.d, section: 'pre', brand: b, qty: q, note: note || null });
            if (p != null) { day.prev.pre[b] = p; anyPrev = true; }
          } else {
            const q = num(row[c + 2]); const note = txt(row[c]);
            if (q != null) orders.push({ rec_date: bk.d, section: 'pre', brand: b, qty: q, note: note || null });
          }
        }
      }
      if (isNew) { // B2C 표 (크리스 · LX · 어드민) — 달마다 위치가 달라 라벨 기준으로 읽음
        const end = Math.min(saleEnd + 1, g.length); const ch = {}; let cur = null; let prevQty = null, afterPrev = false; const big = [];
        for (let r = 2; r < end; r++) {
          const vc = (g[r] || [])[c + 2], vd = (g[r] || [])[c + 3]; const lc = nk(vc), ld = nk(vd);
          if (/^(크리스|사방넷)$/.test(lc)) { if (!ch['크리스']) cur = (ch['크리스'] = []); }
          else if (lc === '어드민') cur = (ch['어드민'] = []);
          else if (lc === 'LX') cur = (ch.LX = []);
          else { const n = num(vc); if (n != null && cur && cur.length < 2 && Math.abs(n) >= 1) cur.push(n); }
          if (ld === (+bk.d.slice(0, 4) - 1) + '년') afterPrev = true;
          else { const n = num(vd); if (n != null && Math.abs(n) >= 2 && Number.isInteger(n)) { if (afterPrev && prevQty == null) prevQty = n; else if (!afterPrev) big.push(n); } }
        }
        const sumC = Object.values(ch).reduce((a, v) => a + (v[0] || 0), 0), sumQ = Object.values(ch).reduce((a, v) => a + (v[1] || 0), 0);
        if (big.length >= 2 && (Math.abs(big[0] - sumC) > 0.5 || Math.abs(big[1] - sumQ) > 0.5)) warn.push(bk.d + ' B2C 합계 확인 필요 (건수 ' + sumC + '/' + big[0] + ', 수량 ' + sumQ + '/' + big[1] + ')');
        ['크리스', 'LX', '어드민'].forEach((n) => { const v = ch[n]; if (v && v.length) orders.push({ rec_date: bk.d, section: 'b2c_ch', brand: n, cnt: v[0] != null ? v[0] : null, qty: v[1] != null ? v[1] : null }); });
        if (prevQty != null) { day.prev.b2c_qty = prevQty; anyPrev = true; }
      }
      if (anyPrev) days.push(day);
    }
    if (unknown.size) warn.push('등록 안 된 브랜드: ' + [...unknown].join(', '));
    return { orders, days, warnings: warn, format: isNew ? '2026 양식' : '2025 양식' };
  }

  // ================= 2. 사방넷 주문 (B2C) =================
  function findHeader(g, need, maxRow) {
    for (let r = 0; r < Math.min(g.length, maxRow || 10); r++) {
      const row = (g[r] || []).map(nk); const ix = {};
      row.forEach((v, i) => { if (v && ix[v] == null) ix[v] = i; });
      if (need.every((n) => (Array.isArray(n) ? n.some((x) => ix[x] != null) : ix[n] != null))) return { r, ix };
    }
    return null;
  }
  const pick = (ix, names) => { for (const n of names) if (ix[n] != null) return ix[n]; return null; };
  function isSabang(g) { return !!findHeader(g, ['사방넷주문번호', ['브랜드명', '브랜드'], ['주문수량', '수량'], ['배송지주소', '수령자주소']], 5); }
  // 결과: { brands: {기준명:{cnt,qty}}, owners: {화주사:{cnt,qty}}, lines, unknown:[] } — 이름·전화·주소는 결과에 없음
  function parseSabang(ws, brandOf, ownerOf) {
    const g = grid(ws); const h = findHeader(g, ['사방넷주문번호', ['브랜드명', '브랜드'], ['주문수량', '수량'], ['배송지주소', '수령자주소']], 5);
    if (!h) return null;
    const cB = pick(h.ix, ['브랜드명', '브랜드']), cQ = pick(h.ix, ['주문수량', '수량']), cA = pick(h.ix, ['배송지주소', '수령자주소']), cS = pick(h.ix, ['주문상태']);
    const per = {}; const own = {}; const unknown = {}; let lines = 0;
    for (let r = h.r + 1; r < g.length; r++) {
      const row = g[r]; if (!row || !row.length) continue;
      const st = cS != null ? txt(row[cS]) : ''; if (/취소|반품|교환/.test(st)) continue;
      const bt = txt(row[cB]); if (!bt) continue; lines++;
      const b = brandOf(bt); const key = b || bt; if (!b) unknown[bt] = (unknown[bt] || 0) + 1;
      const q = num(row[cQ]) || 0; const addr = nk(row[cA]);
      const x = per[key] || (per[key] = { qty: 0, a: new Set() }); x.qty += q; if (addr) x.a.add(addr);
      const o = (b && ownerOf ? ownerOf(b) : null) || '기타'; const y = own[o] || (own[o] = { qty: 0, a: new Set() }); y.qty += q; if (addr) y.a.add(addr);
    }
    const out = { brands: {}, owners: {}, lines, unknown: Object.keys(unknown) };
    for (const k in per) out.brands[k] = { cnt: per[k].a.size, qty: per[k].qty };
    for (const k in own) out.owners[k] = { cnt: own[k].a.size, qty: own[k].qty };
    g.length = 0; // 원본 행 즉시 버림
    return out;
  }

  // ================= 3. Daily KPI Report =================
  const KPI_SHEETS = { 입고: 'in', 초도: 'first', 출고: 'out', 반품: 'ret', 배출: 'box', 그외업무: 'etc' };
  const isNormalKpi = (wb) => { const s = wb.SheetNames.map((n) => n.trim()); return ['입고', '초도', '출고', '반품'].every((n) => s.indexOf(n) >= 0); };
  const dateHdr = (g) => { for (let r = 0; r < 8; r++) if (/^date$/i.test(txt((g[r] || [])[0]))) return r; return -1; };
  // 팀마다 시트 구성이 달라도: Summary 또는 월간취합 + 'Date' 머리글 시트가 있으면 Daily KPI Report
  function isKpiBook(wb) {
    const s = wb.SheetNames.map((n) => n.trim()); if (s.indexOf('Summary') < 0 && s.indexOf('월간취합') < 0) return false;
    if (isNormalKpi(wb)) return true;
    return wb.SheetNames.some((n) => !/^(summary|월간취합)$/i.test(n.trim()) && dateHdr(grid(wb.Sheets[n], 10)) >= 0);
  }
  const TEAM_OF = [[/이월/, '이월소터팀'], [/온라인/, '온라인팀'], [/정상/, '정상1팀'], [/입고|반품팀/, '입고반품팀']];
  function kpiTeamOf(wb) {
    const pick = (t) => { for (const [re, n] of TEAM_OF) if (re.test(t)) return n; return null; };
    for (const sn of ['월간취합', 'Summary']) { const ws = wb.Sheets[sn] || wb.Sheets[wb.SheetNames.find((x) => x.trim() === sn)]; if (!ws) continue; const g = grid(ws, 4); const t = g.map((r) => (r || []).slice(0, 6).map(txt).join(' ')).join(' '); const n = pick(t); if (n) return n; }
    return null;
  }
  const metricName = (v) => nk(v).replace(/\n/g, '');
  // 이월팀 · 온라인팀 등: 시트 이름 = 공정 · 'total' 줄 = 브랜드 줄 · 그 아래 줄들 = 항목 (칸마다 가장 아래 글자)
  function parseKpiGeneric(wb, brandOf, opt) {
    opt = opt || {}; const warn = []; const kpi = []; const days = {}; const team = opt.team || kpiTeamOf(wb);
    if (!team) return { team: null, kpi, days: [], dates: [], warnings: ['팀 이름을 찾지 못했습니다 (월간취합 첫 칸에 \'이월팀\' · \'온라인팀\' 등)'], sheets: [] };
    const unknown = new Set(); const sheets = [];
    const dayOf = (d) => days[d] || (days[d] = { work_date: d, team });
    for (const sn0 of wb.SheetNames) {
      const sn = sn0.trim(); if (/^(summary|월간취합)$/i.test(sn)) continue;
      const g = grid(wb.Sheets[sn0], 120); const hr = dateHdr(g); if (hr < 0) continue;
      let d0 = -1; for (let r = hr + 1; r < g.length; r++) if (toDate((g[r] || [])[0])) { d0 = r; break; }
      if (d0 < 0) continue;
      const W = Math.max(...g.slice(hr, d0).map((r) => (r || []).length), 0);
      if (sn === '그외업무') { // 인원 · 그외 업무사항
        const lab = []; for (let c = 1; c < W; c++) for (let r = d0 - 1; r > hr; r--) { const t = nk((g[r] || [])[c]); if (t) { lab[c] = t; break; } }
        const cTo = lab.indexOf('인원'); const cMemo = lab.findIndex((x) => x && /업무/.test(x));
        for (let r = d0; r < g.length; r++) { const d = toDate((g[r] || [])[0]); if (!d) continue; const to = num(g[r][cTo >= 0 ? cTo : 1]); if (to != null) kpi.push({ work_date: d, team, sheet: 'etc', brand: '', metric: '인원', value: to });
          const memo = lab.map((l, c) => (c && l && c !== cTo && /업무/.test(l) ? txt(g[r][c]) : '')).filter((x) => x && x !== '0').join(' / '); if (memo) dayOf(d).memo = memo; }
        sheets.push({ sheet: 'etc', label: '그외업무' }); continue;
      }
      let br = -1; for (let r = hr + 1; r < d0; r++) if ((g[r] || []).some((v) => /^total$/i.test(txt(v)))) { br = r; break; }
      const mFrom = br >= 0 ? br + 1 : hr + 2; const cols = []; let curB = br >= 0 ? null : ''; const seen = {};
      for (let c = 1; c < W; c++) {
        if (br >= 0) { const bt = txt(g[br][c]); if (bt) { if (/^total$/i.test(bt)) curB = ''; else { const b = brandOf(bt); if (!b) unknown.add(bt); curB = b || bt; } } }
        if (curB == null) continue;
        let mt = ''; for (let r = d0 - 1; r >= mFrom; r--) { const t = metricName((g[r] || [])[c]); if (t) { mt = t; break; } }
        if (!mt) continue; if (/^total인원$/i.test(mt)) mt = '인원';
        const k = curB + '|' + mt; seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1) mt += seen[k];
        cols.push({ c, brand: curB, metric: mt });
      }
      if (!cols.length) { warn.push(sn + ' 시트 항목을 찾지 못함'); continue; }
      for (let r = d0; r < g.length; r++) {
        const d = toDate((g[r] || [])[0]); if (!d) continue;
        for (const x of cols) { const v = num(g[r][x.c]); if (v == null) continue; if (v === 0 && x.brand !== '') continue; kpi.push({ work_date: d, team, sheet: sn, brand: x.brand, metric: x.metric, value: v }); }
      }
      sheets.push({ sheet: sn, label: sn, metrics: [...new Set(cols.filter((x) => x.brand === '').map((x) => x.metric))] });
    }
    // 월간취합: 팀이 정한 총TO · 총 작업 수량 · 공정(구분)별 항목 → sheet 'sum'
    const msn = wb.SheetNames.find((x) => x.trim() === '월간취합');
    if (msn) {
      const g = grid(wb.Sheets[msn], 80); let hr = -1; for (let r = 0; r < 8; r++) if (nk((g[r] || [])[0]) === '구분') { hr = r; break; }
      if (hr >= 0) {
        const dc = []; (g[hr] || []).forEach((v, c) => { const d = c >= 2 ? toDate(v) : null; if (d) dc.push([c, d]); });
        let sec = ''; const seen = {}; let n = 0;
        for (let r = hr + 1; r < g.length; r++) {
          const row = g[r] || []; const s0 = nk(row[0]); if (s0) sec = s0.replace(/\//g, ''); const dt = nk(row[1]).replace(/\//g, ''); if (!dt || /생산성/.test(dt)) continue;
          if (!dc.some(([c]) => num(row[c]) != null)) continue;
          let mt = (sec ? sec + '›' : '') + dt; seen[mt] = (seen[mt] || 0) + 1; if (seen[mt] > 1) mt += seen[mt];
          const tc = num(row[2]), ds = dc.reduce((a, [c]) => a + (num(row[c]) || 0), 0); if (tc != null && Math.abs(tc - ds) > 0.01) warn.push('월간취합 \'' + mt + '\' TOTAL 칸 ' + Math.round(tc * 10) / 10 + ' ≠ 날짜별 합 ' + Math.round(ds * 10) / 10 + ' (ERP는 날짜별 값 기준)');
          for (const [c, d] of dc) { const v = num(row[c]); if (v != null) { kpi.push({ work_date: d, team, sheet: 'sum', brand: '', metric: mt, value: v }); n++; } }
        }
        if (n) sheets.unshift({ sheet: 'sum', label: '월간취합' });
      }
    }
    if (unknown.size) warn.push('등록 안 된 브랜드: ' + [...unknown].join(', '));
    const dates = [...new Set(kpi.filter((k) => k.value).map((k) => k.work_date))].sort();
    const all = [...new Set(kpi.map((k) => k.work_date))];
    return { team, kpi: kpi.filter((k) => all.indexOf(k.work_date) >= 0), days: Object.values(days), dates, warnings: warn, sheets, generic: true };
  }
  function parseKpiBook(wb, brandOf, opt) {
    if (!isNormalKpi(wb)) return parseKpiGeneric(wb, brandOf, opt);
    opt = opt || {}; const warn = []; const kpi = []; const days = {}; let team = opt.team || null;
    const sum = wb.Sheets.Summary ? grid(wb.Sheets.Summary, 80) : [];
    if (!team) { const t = sum.slice(0, 4).map((r) => (r || []).map(txt).join(' ')).join(' '); team = /정상/.test(t) ? '정상1팀' : null; }
    if (!team) { warn.push('팀을 알 수 없어 정상1팀으로 등록'); team = '정상1팀'; }
    const unknown = new Set();
    const dayOf = (d) => days[d] || (days[d] = { work_date: d, team });
    for (const sn of wb.SheetNames) {
      const code = KPI_SHEETS[sn.trim()]; if (!code) continue;
      const g = grid(wb.Sheets[sn], 80);
      let hr = -1; for (let r = 0; r < 8; r++) if (/^date$/i.test(txt((g[r] || [])[0]))) { hr = r; break; }
      if (hr < 0) { warn.push(sn + ' 시트 머리글을 찾지 못함'); continue; }
      const brow = g[hr + 1] || [], m1 = g[hr + 2] || [], m2 = g[hr + 4] || [];
      const hasM2 = m2.some((v) => txt(v));
      if (code === 'etc') { // 인원 · 그외 업무사항
        for (let r = hr + 1; r < g.length; r++) { const d = toDate((g[r] || [])[0]); if (!d) continue; const to = num(g[r][1]); const memo = txt(g[r][2]); if (to != null) kpi.push({ work_date: d, team, sheet: 'etc', brand: '', metric: '인원', value: to }); if (memo && memo !== '0') dayOf(d).memo = memo; }
        continue;
      }
      const cols = []; let curB = null;
      for (let c = 1; c < Math.max(brow.length, m1.length, m2.length); c++) {
        const bt = txt(brow[c]); if (bt) { if (/^total$/i.test(bt)) curB = ''; else { const b = brandOf(bt); if (!b) unknown.add(bt); curB = b || bt; } }
        if (curB == null) continue;
        const mt = metricName(curB !== '' && hasM2 ? m2[c] : m1[c]); if (!mt) continue;
        cols.push({ c, brand: curB, metric: mt });
      }
      for (let r = hr + 1; r < g.length; r++) {
        const d = toDate((g[r] || [])[0]); if (!d) continue;
        for (const x of cols) { const v = num(g[r][x.c]); if (v == null) continue; if (v === 0 && x.brand !== '') continue; kpi.push({ work_date: d, team, sheet: code, brand: x.brand, metric: x.metric, value: v }); }
      }
    }
    // Summary 인원현황 (현장 · 지원팀 · 반품팀)
    if (sum.length) {
      let hr = -1; for (let r = 0; r < 10; r++) if (/^date$/i.test(txt((sum[r] || [])[0]))) { hr = r; break; }
      const lab = (sum[hr + 4] || []).map(nk); const f = lab.indexOf('현장'), s = lab.indexOf('지원팀'), rt = lab.indexOf('반품팀');
      let miss = 0;
      for (let r = hr + 1; r < sum.length; r++) {
        const d = toDate((sum[r] || [])[0]); if (!d) continue; const row = sum[r];
        const has = kpi.some((k) => k.work_date === d && k.brand === '' && k.metric === '인원' && k.value);
        if (!has) continue;
        const day = dayOf(d);
        if (f >= 0 && num(row[f]) != null) day.field_count = num(row[f]);
        const sv = s >= 0 ? num(row[s]) : null, rv = rt >= 0 ? num(row[rt]) : null;
        if (sv != null || rv != null) { day.office_count = (sv || 0) + (rv || 0); day.ret_count = rv; } else miss++;
      }
      if (miss) warn.push('지원·반품 사무 인원이 빈 날짜 ' + miss + '일 (업무일지 지원팀 T.O는 0으로 반영)');
    }
    if (unknown.size) warn.push('등록 안 된 브랜드: ' + [...unknown].join(', '));
    const dates = [...new Set(kpi.map((k) => k.work_date))].sort();
    return { team, kpi, days: Object.values(days).filter((d) => dates.indexOf(d.work_date) >= 0), dates, warnings: warn };
  }

  // ================= 4. 신상품 (화주 ERP · WMS) =================
  const NP_SPEC = {
    plan: { need: ['품번', ['기획량', '기획수량'], ['출고예정일', '전개시기']], label: '화주 ERP 품번 정보' },
    inbound: { need: ['품번', ['입고수량'], ['입고구분', '일자', '입고일자']], label: 'WMS 입고반품 현황' },
    stock: { need: ['품번', ['현재고'], ['위치정보', '로케이션']], label: 'WMS 재고 현황 (출고 포함)' },
    out: { need: ['품번', ['출고수량', '출고량', '출고']], label: '출고 현황' },
    defect: { need: ['품번', ['회수일자(반출일자)', '회수일자', '반출일자'], ['전산처리방법', '반품수량']], label: '불량 상품' },
  };
  // 업로드 칸 → 받는 자료 종류 (칸마다 그 자료만 받음)
  const NP_SLOT = { plan: ['plan'], inbound: ['inbound'], out: ['stock', 'out', 'defect'], defect: ['defect'] };
  const NP_ORDER = ['stock', 'inbound', 'plan', 'out', 'defect'];
  function npKind(g, only) {
    for (const k of NP_ORDER) { if (only && only.indexOf(k) < 0) continue; const h = findHeader(g, NP_SPEC[k].need, 8); if (h) return { kind: k, h }; }
    return null;
  }
  // 인식 안 될 때 이유: 가장 비슷한 머리글 줄에서 빠진 열 이름
  const needName = (n) => (Array.isArray(n) ? n[0] : n);
  function npDiagnose(g, only) {
    let best = null;
    for (const k of only || NP_ORDER) {
      const need = NP_SPEC[k].need;
      for (let r = 0; r < Math.min(g.length, 8); r++) {
        const row = (g[r] || []).map(nk).filter(Boolean); if (!row.length) continue;
        const has = (n) => (Array.isArray(n) ? n : [n]).some((x) => row.indexOf(x) >= 0);
        const hit = need.filter(has).length;
        if (!best || hit > best.hit || (hit === best.hit && row.length > best.cols.length)) best = { kind: k, hit, miss: need.filter((n) => !has(n)).map(needName), cols: row };
      }
    }
    return best;
  }
  const code = (v) => { const t = txt(v); const m = t.match(/^([0-9A-Za-z]+)\s*\(/); return m ? m[1] : t.split(/\s/)[0]; };
  // 시즌: 2026FW 등. 품번 4번째 글자 = 년도(F=2026, E=2025), 5번째 = 시즌(1 봄 2 여름 3 가을 4 겨울 5 S/S 6 F/W 7 NONSEASON)
  const YEAR_OF = (ch) => { const c = String(ch || '').toUpperCase(); if (!/[A-Z]/.test(c)) return null; return 2021 + (c.charCodeAt(0) - 65); };
  const seasonOf = (yl, sd) => { const y = YEAR_OF(yl); if (!y) return null; return y + (['1', '2', '5'].indexOf(String(sd)) >= 0 ? 'SS' : 'FW'); };
  // sheets: [{name, ws}], only: 받을 자료 종류(없으면 전부) → {plan, inbound, stock, out, defect, found, miss}
  const NP_SKIP = /^(전체 데이터|아이템_색상 현황|입_출고률|주차별|월별|범례|전개시기|1월2주차)/;
  function readNpFiles(sheets, only) {
    const out = { plan: [], inbound: [], stock: [], out: [], defect: [], found: [], miss: [], raw: { plan: [], inbound: [], defect: [] } };
    const RAWC = NP_RAW_COLS;
    for (const s of sheets) {
      if (NP_SKIP.test(s.name.trim())) continue;
      shrink(s.ws);
      const g = grid(s.ws); const k = npKind(g, only);
      if (!k) { const d = npDiagnose(g, only); if (d && d.cols.length) out.miss.push({ sheet: s.name, kind: d.kind, label: NP_SPEC[d.kind].label, miss: d.miss, cols: d.cols.slice(0, 8) }); continue; }
      const ix = k.h.ix; let n = 0;
      const I = (names) => pick(ix, names);
      for (let r = k.h.r + 1; r < g.length; r++) {
        const row = g[r]; if (!row || !row.length) continue;
        const style = txt(row[ix['품번']]).toUpperCase(); if (!style || style === '품번' || /^#/.test(style)) continue;
        if (/^\d+$/.test(style) && !txt(row[I(['브랜드'])])) continue; // 맨 아래 합계 줄 (품번 칸에 개수)
        if (RAWC[k.kind]) out.raw[k.kind].push(RAWC[k.kind].map((c) => { const j = I(c[1]); const v = j == null ? '' : row[j]; return c[2] === 'n' ? num(v) : c[2] === 'd' ? toDate(v) || txt(v) : c[2] === 'c' ? code(v) : c[2] === 'b' ? txt(v) : txt(v); }));
        if (k.kind === 'plan') {
          out.plan.push({ style, color: code(row[I(['색상'])]), brand: txt(row[I(['브랜드'])]), year: code(row[I(['기획년도'])]), sd: code(row[I(['시즌'])]), item: txt(row[I(['아이템군'])]), qty: num(row[I(['기획량', '기획수량'])]) || 0, date: toDate(row[I(['출고예정일', '전개시기'])]), state: txt(row[I(['상태'])]), use: txt(row[I(['사용여부'])]), gubun: txt(row[I(['구분'])]), set: txt(row[I(['세트구분'])]) });
        } else if (k.kind === 'inbound') {
          out.inbound.push({ style, color: code(row[I(['색상'])]), brand: txt(row[I(['브랜드'])]), qty: num(row[I(['입고수량'])]) || 0, date: toDate(row[I(['일자', '입고일자'])]), kind: txt(row[I(['입고구분'])]), year: code(row[I(['기획년도'])]), sd: code(row[I(['시즌'])]) , item: txt(row[I(['아이템군'])])});
        } else if (k.kind === 'stock') {
          out.stock.push({ style, color: code(row[I(['색상'])]), loc: txt(row[I(['위치정보', '로케이션'])]), out: num(row[I(['출고', '출고수량'])]) || 0, stock: num(row[I(['현재고'])]) || 0, year: code(row[I(['기획년도'])]), sd: code(row[I(['시즌'])]) });
        } else if (k.kind === 'out') {
          out.out.push({ style, color: code(row[I(['색상'])]), brand: txt(row[I(['브랜드'])]), qty: num(row[I(['출고수량', '출고량', '출고'])]) || 0, date: toDate(row[I(['출고일자', '일자', '출고일'])]) });
        } else {
          out.defect.push({ style, qty: num(row[I(['총수량'])]) || num(row[I(['창고재고'])]) || 0, date: toDate(row[I(['회수일자(반출일자)', '회수일자', '반출일자'])]), how: txt(row[I(['전산처리방법'])]) });
        }
        n++;
      }
      out.found.push({ sheet: s.name, kind: k.kind, label: NP_SPEC[k.kind].label, rows: n, qty: k.kind === 'inbound' ? out.inbound.slice(-n).reduce((a, x) => a + inSign(x.kind) * Math.abs(x.qty), 0) : k.kind === 'out' ? out.out.slice(-n).reduce((a, x) => a + x.qty, 0) : null });
    }
    return out;
  }
  // 입고구분: 정상 입고 = +1 · 반품 = −1 (수량 빼기) · 그 밖 = 0 (안 셈) · 칸이 없으면 입고
  function inSign(k) { const t = txt(k); if (!t) return 1; if (/반품/.test(t)) return -1; if (/입고/.test(t)) return 1; return 0; }
  // 올린 자료 보기 칸 (원본 표) — [제목, 찾는 칸 이름들, 모양(n 숫자 · d 날짜 · c 코드 · b 그대로)]
  const NP_RAW_COLS = {
    plan: [['브랜드', ['브랜드']], ['구분', ['구분']], ['기획년도', ['기획년도']], ['시즌', ['시즌']], ['아이템군', ['아이템군']], ['품번', ['품번']], ['색상', ['색상'], 'c'], ['세트구분', ['세트구분']], ['출고예정일', ['출고예정일', '전개시기'], 'd'], ['기획량', ['기획량', '기획수량'], 'n'], ['사용여부', ['사용여부']]],
    inbound: [['브랜드', ['브랜드']], ['일자', ['일자', '입고일자'], 'd'], ['입고구분', ['입고구분']], ['기획년도', ['기획년도']], ['시즌', ['시즌']], ['아이템군', ['아이템군']], ['품번', ['품번']], ['색상', ['색상'], 'c'], ['입고수량', ['입고수량'], 'n'], ['등록일자', ['등록일자'], 'd']],
    defect: [['회수일자', ['회수일자(반출일자)', '회수일자', '반출일자'], 'd'], ['품번', ['품번']], ['색상', ['색상'], 'c'], ['사이즈', ['사이즈']], ['수량', ['총수량', '창고재고', '반품수량'], 'n'], ['전산처리방법', ['전산처리방법']]],
  };
  // 품번별 계산 → erp_np_style 행
  function computeNp(data, season, brandOf, opt) {
    opt = opt || {};
    const inSeason = (style, yl, sd) => { const s = seasonOf(yl || style[3], sd || style[4]); return s === season; };
    const P = {};
    for (const p of data.plan) {
      if (p.use && /^N/i.test(p.use)) continue;
      if (!inSeason(p.style, p.year, p.sd)) continue;
      const x = P[p.style] || (P[p.style] = { style: p.style, brandText: p.brand, colors: new Set(), plan_qty: 0, plan_date: null, scode: (code(p.year) || p.style[3]) + (p.sd || p.style[4]), item: p.item || (typeof HSStyle !== 'undefined' ? HSStyle.info(p.style).gr : '') });
      x.colors.add(p.color); x.plan_qty += p.qty; if (p.date && (!x.plan_date || p.date < x.plan_date)) x.plan_date = p.date;
    }
    const IN = {}, ST = {};
    for (const r of data.inbound) { const sg = inSign(r.kind); if (!sg) continue; const x = IN[r.style] || (IN[r.style] = { qty: 0, date: null, brandText: r.brand, yl: r.year, sd: r.sd }); x.qty += sg * Math.abs(r.qty); if (sg > 0 && r.date && (!x.date || r.date < x.date)) x.date = r.date; }
    for (const r of data.stock) { const x = ST[r.style] || (ST[r.style] = { out: 0, stock: 0, loc: 0, yl: r.year, sd: r.sd }); x.out += r.out; x.stock += r.stock; if (r.loc) x.loc += r.stock; }
    const OUT = {}; for (const r of data.out || []) OUT[r.style] = (OUT[r.style] || 0) + r.qty; // 출고 현황 파일이 있으면 출고는 그 파일 기준
    const hasOut = (data.out || []).length > 0;
    const DEF = new Set(data.defect.map((d) => d.style));
    const hasPlan = data.plan.length > 0;
    // 기획에 없지만 이번 시즌 입고·재고가 있는 품번
    const extra = new Set();
    if (hasPlan) for (const s of Object.keys(IN).concat(Object.keys(ST))) if (!P[s] && inSeason(s, (IN[s] || ST[s]).yl, (IN[s] || ST[s]).sd)) extra.add(s);
    const rows = [];
    const all = new Set(Object.keys(P).concat([...extra]));
    for (const s of all) {
      const p = P[s] || { style: s, colors: new Set(), plan_qty: null, plan_date: null, scode: s[3] + s[4], brandText: (IN[s] || {}).brandText };
      const i = IN[s] || { qty: 0, date: null }; const t = Object.assign({ out: 0, stock: 0, loc: 0 }, ST[s]); if (hasOut) t.out = OUT[s] || 0;
      const bt = p.brandText || (IN[s] || {}).brandText || '';
      const brand = brandOf(bt) || brandOf(code(bt) + ' (', true) || brandOf(s[0] + ' (', true) || bt || null;
      const inQ = i.qty || 0;
      const flags = [];
      if (!P[s]) flags.push('기획누락');
      rows.push(npStatus({ season, style: s, brand, scode: p.scode, item: p.item || null, colors: p.colors.size || null, plan_qty: p.plan_qty, plan_date: p.plan_date, in_qty: inQ, in_date: i.date, out_qty: t.out, stock: data.stock.length ? t.stock : null, stock_loc: data.stock.length ? t.loc : null, defect: DEF.has(s), flags }));
    }
    rows.sort((a, b) => (a.brand || '').localeCompare(b.brand || '') || a.style.localeCompare(b.style));
    return rows;
  }
  // 상태 판정 (입고 · 출고 · 정리) — 정리 기준: 재고>0 이고 로케이션 할당 → 정리완료 / 미할당 → 미정리 / 재고 0 → 전량출고
  function npStatus(r) {
    const inQ = +r.in_qty || 0, out = +r.out_qty || 0, st = +r.stock || 0, loc = +r.stock_loc || 0;
    r.st_in = inQ > 0 ? '입고' : '미입고';
    // 출고 0이어도 현재고 0(이하)이면 다 나간 것으로 봄 — 현재고를 모르면(null) 미출고 그대로
    const known = r.stock != null && r.stock !== '';
    r.st_out = r.st_in === '미입고' ? '미입고' : (out > 0 || (known && st <= 0) ? '출고완료' : '미출고');
    r.st_clean = r.st_in === '미입고' ? '미입고상품' : st <= 0 ? '전량출고' : loc > 0 ? '정리완료' : '미정리';
    const f = (r.flags || []).filter((x) => x === '기획누락');
    if (r.plan_qty && inQ > r.plan_qty * 1.1 && inQ - r.plan_qty >= 10) f.push('초과입고');
    if (st < 0) f.push('재고마이너스');
    if (f.indexOf('기획누락') < 0 && !r.plan_date) f.push('전개일없음');
    r.flags = f; return r;
  }
  // 집계 (화면 · 스냅샷 공용)
  function npSummary(rows) {
    const z = () => ({ st: 0, in: 0, notin: 0, out: 0, notout: 0, unclean: 0, unclean_all: 0, defect: 0, plan_qty: 0, in_qty: 0 });
    const tot = z(); const by = {};
    for (const r of rows) {
      if ((r.flags || []).indexOf('기획누락') >= 0) continue;
      const b = by[r.brand || '기타'] || (by[r.brand || '기타'] = z());
      for (const x of [tot, b]) {
        x.st++; x.plan_qty += +r.plan_qty || 0; x.in_qty += +r.in_qty || 0;
        if (r.st_in === '입고') x.in++; else x.notin++;
        if (r.st_out === '출고완료') x.out++; if (r.st_out === '미출고') x.notout++;
        if (r.st_clean === '미정리') { x.unclean_all++; if (r.st_out === '출고완료') x.unclean++; }
        if (r.defect) x.defect++;
      }
    }
    return { tot, by };
  }
  // 전개 주차: 그 주 금요일이 속한 달 기준 (월~금) (기존 엑셀 '7월5주' 규칙)
  function weekTh(s) {
    if (!s) return null;
    const d = new Date(s + 'T00:00:00'); const th = new Date(d); th.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 4);
    return (th.getMonth() + 1) + '월' + Math.ceil(th.getDate() / 7) + '주';
  }
  return { NP_RAW_COLS, inSign, parseOrderSheet, isOrderSheet, parseSabang, isSabang, isKpiBook, parseKpiBook, parseKpiGeneric, kpiTeamOf, readNpFiles, NP_SPEC, NP_SLOT, computeNp, npStatus, npSummary, weekTh, seasonOf, toDate, num, grid, shrink };
});
