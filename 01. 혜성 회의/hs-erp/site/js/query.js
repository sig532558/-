/* 조회 그리드 (전산자료 › 재고 조회 · 지시 조회)
 *  · 조건 (드롭다운 · 글자 일부 · 고르기 · 체크) — 드롭다운 값은 다른 조건에 맞게 자동으로 좁혀짐
 *  · 보기 단위 (묶어 보기 · 합계) · 줄 누르면 묶인 상세 펼침
 *  · ⚙ 칸 설정 (보이기/숨기기 · 순서, 사람마다 이 브라우저에 기억) · 칸 제목 눌러 정렬 · 50줄씩 · 조회 결과 엑셀
 *  HS.qgrid(el, opt) → { setData(rows), refresh() }
 *   opt.key: 기억 이름 · opt.filters: [{k, l, t:'sel'|'txt'|'opt'|'chk', get(r), opts:[[v,l,test]], def, w}]
 *   opt.cols: [{k, l, num, agg:'sum'|'count'|'distinct'|'first'|fn, get(r), dk(r), fmt(v,g), cls(v,g), hide}]
 *   opt.units: [{id, l, by:[col k], hide:[col k], pivot:{by(r), val, label}}] · opt.sort: {k, d}
 */
(function () {
  'use strict';
  const { esc, fmt } = HS;
  const PAGE = 50;
  const LS = (k, v) => { try { const key = 'hs-q:' + k + ':' + ((HS.me && HS.me.id) || ''); if (v === undefined) return JSON.parse(localStorage.getItem(key) || 'null'); if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch (e) { return null; } return null; };
  const sval = (v) => (v == null ? '' : String(v));
  const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : sval(a).localeCompare(sval(b), 'ko', { numeric: true }));

  HS.qgrid = function (el, o) {
    const saved = LS(o.key) || {};
    const st = {
      f: Object.assign({}, Object.fromEntries(o.filters.map((f) => [f.k, f.def != null ? f.def : f.t === 'chk' ? false : ''])), saved.f || {}),
      unit: o.units.some((u) => u.id === saved.unit) ? saved.unit : o.unit || o.units[0].id,
      sort: saved.sort || o.sort || null, page: 0,
      order: (saved.order || []).filter((k) => o.cols.some((c) => c.k === k)), off: saved.off || o.cols.filter((c) => c.hide).map((c) => c.k), open: null,
    };
    o.cols.forEach((c) => { if (st.order.indexOf(c.k) < 0) st.order.push(c.k); });
    // 고르기 조건은 여러 값 선택: null = 전체 · [값…] = 고른 값만 (예전에 저장된 한 값도 그대로 읽음)
    const msv = (v) => (v == null || v === '' ? null : Array.isArray(v) ? v.map(sval) : [sval(v)]);
    o.filters.forEach((f) => { if (f.t === 'sel') st.f[f.k] = msv(st.f[f.k]); });
    let data = []; let groups = []; let tot = null; let filtered = [];
    const save = () => LS(o.key, { f: Object.fromEntries(o.filters.filter((f) => f.keep !== false).map((f) => [f.k, st.f[f.k]])), unit: st.unit, sort: st.sort, order: st.order, off: st.off });
    const C = Object.fromEntries(o.cols.map((c) => [c.k, c]));
    const gv = (c, r) => (c.get ? c.get(r) : r[c.k]);

    el.innerHTML = '';
    const fw = HS.el('<div class="qflt"></div>'); const bar = HS.el('<div class="qbar"></div>'); const tw = HS.el('<div class="tw qtw"></div>'); const pg = HS.el('<div class="qpg"></div>');
    el.appendChild(fw); el.appendChild(bar); el.appendChild(tw); el.appendChild(pg);

    // ---------- 조건 ----------
    const pass = (r, skip) => o.filters.every((f) => {
      if (f.k === skip) return true; const v = st.f[f.k];
      if (f.t === 'chk') return !v || f.test(r);
      if (f.t === 'sel') return !v || v.indexOf(sval(f.get(r))) >= 0;
      if (v === '' || v == null) return true;
      if (f.t === 'opt') { const x = f.opts.find((p) => p[0] === v); return !x || !x[2] || x[2](r); }
      const rv = sval(f.get(r));
      if (f.t === 'txt') { const q = String(v).trim().toUpperCase(); return !q || q.split(/\s+/).some((w) => rv.toUpperCase().indexOf(w) >= 0 || (f.get2 && sval(f.get2(r)).toUpperCase().indexOf(w) >= 0)); }
      return rv === v;
    });
    const fEls = {};
    o.filters.forEach((f) => {
      const w = HS.el('<div class="qf' + (f.t === 'chk' ? ' chk' : '') + '"' + (f.w ? ' style="grid-column:span ' + f.w + '"' : '') + '></div>');
      if (f.t === 'chk') { w.innerHTML = '<label><input type="checkbox"> ' + esc(f.l) + '</label>'; const i = w.querySelector('input'); i.checked = !!st.f[f.k]; i.onchange = () => { st.f[f.k] = i.checked; go(); }; fEls[f.k] = i; }
      else if (f.t === 'txt') { w.innerHTML = '<label>' + f.l + '</label><input class="in" placeholder="' + esc(f.ph || '일부만 써도 됨') + '">'; const i = w.querySelector('input'); i.value = st.f[f.k] || ''; let tm; i.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { st.f[f.k] = i.value; go(); }, 250); }; fEls[f.k] = i; }
      else if (f.t === 'sel') { w.innerHTML = '<label>' + f.l + '</label><button type="button" class="in qms" data-ms="' + esc(f.k) + '"></button>'; const b = w.querySelector('button'); b.onclick = (e) => { e.stopPropagation(); msOpen(f, b); }; fEls[f.k] = b; }
      else { w.innerHTML = '<label>' + f.l + '</label><select class="in"></select>'; const s = w.querySelector('select'); s.onchange = () => { st.f[f.k] = s.value; go(); }; fEls[f.k] = s; }
      fw.appendChild(w);
    });
    const msText = (f, v) => { const L = (x) => (f.label ? f.label(x) : x) || '(빈칸)'; return !v ? '전체' : !v.length ? '선택 없음' : v.length === 1 ? L(v[0]) : L(v[0]) + ' 외 ' + (v.length - 1); };
    const MS = {};
    const fillSel = () => o.filters.filter((f) => f.t === 'sel').forEach((f) => {
      const cnt = {}; for (const r of data) { if (!pass(r, f.k)) continue; const v = sval(f.get(r)); if (v === '') continue; cnt[v] = (cnt[v] || 0) + 1; }
      let vs = Object.keys(cnt).sort(f.sort || cmp); const cur = st.f[f.k] || []; cur.forEach((v) => { if (vs.indexOf(v) < 0) vs.push(v); });
      MS[f.k] = { vs, cnt };
      const b = fEls[f.k]; const v = st.f[f.k]; b.textContent = msText(f, v) + ' ▾'; b.title = v && v.length ? v.map((x) => (f.label ? f.label(x) : x)).join(', ') : '';
      b.classList.toggle('on', !!v); b.classList.toggle('none', !!v && !v.length);
    });
    // 여러 값 고르기 창: 찾기 · 전체 선택 · 전체 해제 · 체크 (바로 반영)
    let pop = null;
    const msClose = () => { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', msOut, true); document.removeEventListener('keydown', msKey, true); } };
    const msOut = (e) => { if (pop && !pop.contains(e.target) && !(e.target.closest && e.target.closest('.qms'))) msClose(); };
    const msKey = (e) => { if (e.key === 'Escape') msClose(); };
    function msOpen(f, btn) {
      const same = pop && pop.dataset.k === f.k; msClose(); if (same) return;
      const { vs, cnt } = MS[f.k] || { vs: [], cnt: {} }; const L = (x) => esc((f.label ? f.label(x) : x) || '(빈칸)');
      pop = HS.el('<div class="qpop" data-k="' + esc(f.k) + '"><div class="qph"><b>' + esc(f.l) + '</b><span class="mute">여러 개 고를 수 있음</span></div>' + (vs.length > 8 ? '<input class="in qpq" placeholder="목록에서 찾기">' : '') + '<div class="qpb"><button type="button" class="btn sm" data-all>전체 선택</button><button type="button" class="btn sm" data-none>전체 해제</button><span class="qpn mute"></span></div><div class="qpl">' + (vs.length ? vs.map((v, i) => '<label data-i="' + i + '"><input type="checkbox" data-v="' + i + '"> <span>' + L(v) + '</span><em>' + fmt(cnt[v] || 0) + '</em></label>').join('') : '<div class="mute" style="padding:8px">값이 없습니다</div>') + '</div><div class="qpf"><button type="button" class="btn sm p" data-x>닫기</button></div></div>');
      document.body.appendChild(pop);
      const rc = btn.getBoundingClientRect(); const pw = Math.max(rc.width, 240);
      pop.style.left = Math.max(8, Math.min(rc.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - pw - 8)) + 'px'; pop.style.top = rc.bottom + window.scrollY + 4 + 'px'; pop.style.width = pw + 'px';
      const boxes = [...pop.querySelectorAll('input[data-v]')];
      const sel = () => { const v = st.f[f.k]; return new Set(v ? v : vs); };
      const paint = () => { const S = sel(); boxes.forEach((c) => (c.checked = S.has(vs[+c.dataset.v]))); const v = st.f[f.k]; pop.querySelector('.qpn').textContent = !v ? '전체' : fmt(v.length) + '개 고름'; };
      const commit = (S) => { st.f[f.k] = vs.every((v) => S.has(v)) ? null : vs.filter((v) => S.has(v)); paint(); go(); };
      const shown = () => boxes.filter((c) => c.closest('label').style.display !== 'none');
      boxes.forEach((c) => (c.onchange = () => { const S = sel(); const v = vs[+c.dataset.v]; if (c.checked) S.add(v); else S.delete(v); commit(S); }));
      pop.querySelector('[data-all]').onclick = () => { const S = sel(); shown().forEach((c) => S.add(vs[+c.dataset.v])); commit(S); };
      pop.querySelector('[data-none]').onclick = () => { const S = sel(); shown().forEach((c) => S.delete(vs[+c.dataset.v])); commit(S); };
      pop.querySelector('[data-x]').onclick = msClose;
      const q = pop.querySelector('.qpq'); if (q) { q.oninput = () => { const t = q.value.trim().toUpperCase(); boxes.forEach((c) => { const v = vs[+c.dataset.v]; const lb = String(f.label ? f.label(v) : v).toUpperCase(); c.closest('label').style.display = !t || lb.indexOf(t) >= 0 ? '' : 'none'; }); }; setTimeout(() => q.focus(), 0); }
      paint(); document.addEventListener('mousedown', msOut, true); document.addEventListener('keydown', msKey, true);
    }
    o.filters.filter((f) => f.t === 'opt').forEach((f) => { fEls[f.k].innerHTML = f.opts.map((p) => '<option value="' + esc(p[0]) + '"' + (p[0] === st.f[f.k] ? ' selected' : '') + '>' + esc(p[1]) + '</option>').join(''); });

    // ---------- 묶기 ----------
    const unitOf = () => o.units.find((u) => u.id === st.unit) || o.units[0];
    const aggOne = (c, M) => {
      const a = c.agg || (c.num ? 'sum' : 'first');
      if (typeof a === 'function') return a(M);
      if (a === 'sum') { let s = 0; for (const r of M) s += +gv(c, r) || 0; return s; }
      if (a === 'count') return M.length;
      if (a === 'distinct') { const s = new Set(); for (const r of M) s.add(c.dk ? c.dk(r) : gv(c, r)); return s.size; }
      const s = new Set(); for (const r of M) { const v = gv(c, r); if (v !== '' && v != null) s.add(v); } const arr = [...s];
      return arr.length <= 1 ? (arr[0] == null ? '' : arr[0]) : c.many === 'list' ? arr.slice(0, 3).join(', ') + (arr.length > 3 ? ' 외 ' + (arr.length - 3) : '') : arr[0] + ' 외 ' + (arr.length - 1);
    };
    let pcols = [];
    function build() {
      const u = unitOf(); filtered = data.filter((r) => pass(r));
      pcols = [];
      if (u.pivot) { const s = new Set(); filtered.forEach((r) => s.add(sval(u.pivot.by(r)))); pcols = [...s].sort(u.pivot.sort || cmp).map((v) => ({ k: 'p:' + v, l: u.pivot.label ? u.pivot.label(v) : v || '(없음)', num: true, pv: v })); }
      if (!u.by) groups = filtered.map((r) => ({ r, M: [r] }));
      else {
        const G = new Map(); for (const r of filtered) { const key = u.by.map((k) => sval(gv(C[k], r))).join('\u0001'); let g = G.get(key); if (!g) G.set(key, (g = { M: [] })); g.M.push(r); }
        groups = [...G.values()];
      }
      for (const g of groups) {
        g.v = {}; for (const c of o.cols) g.v[c.k] = !u.by ? gv(c, g.r) : u.by.indexOf(c.k) >= 0 ? gv(c, g.M[0]) : aggOne(c, g.M);
        if (pcols.length) { const pv = C[u.pivot.val]; pcols.forEach((p) => (g.v[p.k] = 0)); for (const r of g.M) g.v['p:' + sval(u.pivot.by(r))] += +gv(pv, r) || 0; }
      }
      if (st.sort && (C[st.sort.k] || st.sort.k.startsWith('p:'))) { const k = st.sort.k, d = st.sort.d ? -1 : 1; groups.sort((a, b) => d * cmp(a.v[k], b.v[k])); }
      tot = {}; for (const c of o.cols) if (c.num) tot[c.k] = c.agg === 'distinct' || typeof c.agg === 'function' ? aggOne(c, filtered) : c.agg === 'count' ? filtered.length : groups.reduce((a, g) => a + (+g.v[c.k] || 0), 0);
      pcols.forEach((p) => (tot[p.k] = groups.reduce((a, g) => a + (+g.v[p.k] || 0), 0)));
    }
    const visCols = () => { const u = unitOf(); const base = st.order.map((k) => C[k]).filter((c) => c && st.off.indexOf(c.k) < 0 && !(u.hide && u.hide.indexOf(c.k) >= 0)); if (!pcols.length) return base; const at = base.findIndex((c) => c.k === u.pivot.val); const out = base.slice(); out.splice(at < 0 ? out.length : at, 0, ...pcols); return out; };
    const cell = (c, v, g) => { const cls = (c.num ? 'n' : '') + (c.cls ? ' ' + (c.cls(v, g) || '') : '') + (c.hl ? ' qhl' : ''); const t = c.fmt ? c.fmt(v, g) : c.num ? (v === '' || v == null ? '-' : fmt(v)) : esc(sval(v)); return '<td' + (cls.trim() ? ' class="' + cls.trim() + '"' : '') + '>' + (c.b ? '<b>' + t + '</b>' : t) + '</td>'; };

    // ---------- 그리기 ----------
    function draw() {
      const u = unitOf(); const V = visCols(); const n = groups.length; const pages = Math.max(1, Math.ceil(n / PAGE)); if (st.page >= pages) st.page = pages - 1;
      const head = '<tr><th class="gno">No</th>' + V.map((c) => '<th class="' + (c.num ? 'n ' : '') + 'qs' + (c.hl ? ' qhl' : '') + (st.sort && st.sort.k === c.k ? ' on' : '') + '" data-s="' + esc(c.k) + '">' + esc(c.l) + (st.sort && st.sort.k === c.k ? (st.sort.d ? ' ▼' : ' ▲') : '') + '</th>').join('') + '</tr>';
      const rows = groups.slice(st.page * PAGE, st.page * PAGE + PAGE).map((g, i) => {
        const idx = st.page * PAGE + i; const can = u.by && g.M.length > 1;
        let h = '<tr class="' + (can ? 'qx' : '') + (o.rowCls ? ' ' + (o.rowCls(g) || '') : '') + '"' + (can ? ' data-i="' + idx + '"' : '') + '><td class="gno">' + (idx + 1) + '</td>' + V.map((c) => cell(c, g.v[c.k], g)).join('') + '</tr>';
        if (can && st.open === idx) {
          const D = o.cols.filter((c) => st.off.indexOf(c.k) < 0 && !c.noDetail && (!u.by || u.by.indexOf(c.k) < 0)); const M = g.M.slice().sort(o.detailSort || ((a, b) => 0)).slice(0, 300);
          h += '<tr class="qdet"><td colspan="' + (V.length + 1) + '"><div class="mute" style="font-size:11px;margin-bottom:4px">묶인 상세 ' + fmt(g.M.length) + '줄' + (g.M.length > 300 ? ' (300줄까지 · 전부는 엑셀)' : '') + '</div><table class="no-tools"><tr>' + D.map((c) => '<th' + (c.num ? ' class="n"' : '') + '>' + esc(c.l) + '</th>').join('') + '</tr>' + M.map((r) => '<tr>' + D.map((c) => cell(Object.assign({}, c, { b: false }), c.agg === 'count' ? 1 : c.agg === 'distinct' ? 1 : gv(c, r), { v: Object.fromEntries(D.map((d) => [d.k, gv(d, r)])), M: [r] })).join('') + '</tr>').join('') + '</table></div></td></tr>';
        }
        return h;
      }).join('');
      const tr = '<tr class="tot gsum"><td class="gno">합계</td>' + V.map((c, i) => (i === 0 ? '<td>' + fmt(n) + '건</td>' : c.num ? cell(Object.assign({}, c, { b: false, cls: c.totCls }), tot[c.k], { v: tot, M: filtered }) : '<td></td>')).join('') + '</tr>';
      tw.innerHTML = n ? '<table class="no-tools qt">' + head + tr + rows + '</table>' : '<table class="no-tools qt">' + head + '</table><div class="empty">' + (data.length ? '조건에 맞는 자료가 없습니다 · <a href="javascript:void 0" data-clr>조건 지우기</a>' : esc(o.empty || '자료가 없습니다')) + '</div>';
      pg.innerHTML = '<span>' + (n ? fmt(st.page * PAGE + 1) + ' ~ ' + fmt(Math.min(n, (st.page + 1) * PAGE)) + ' / ' + fmt(n) + '줄' : '0줄') + (u.by ? ' · 줄을 누르면 묶인 상세' : '') + (o.note ? ' · ' + o.note : '') + '</span>' + (pages > 1 ? '<span><button class="btn sm" data-p="-1"' + (st.page ? '' : ' disabled') + '>‹</button> ' + (st.page + 1) + ' / ' + pages + ' <button class="btn sm" data-p="1"' + (st.page < pages - 1 ? '' : ' disabled') + '>›</button></span>' : '');
      tw.querySelectorAll('th[data-s]').forEach((th) => (th.onclick = () => { const k = th.dataset.s; st.sort = st.sort && st.sort.k === k ? (st.sort.d ? { k, d: false } : null) : { k, d: !!(C[k] ? C[k].num : true) }; st.page = 0; st.open = null; save(); build(); draw(); }));
      tw.querySelectorAll('tr.qx').forEach((r) => (r.onclick = () => { const i = +r.dataset.i; st.open = st.open === i ? null : i; draw(); }));
      pg.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { st.page += +b.dataset.p; st.open = null; draw(); }));
      const cl = tw.querySelector('[data-clr]'); if (cl) cl.onclick = clear;
      drawBar();
    }
    function drawBar() {
      const on = o.filters.filter((f) => (f.t === 'chk' ? st.f[f.k] : f.t === 'sel' ? !!st.f[f.k] : st.f[f.k] !== '' && st.f[f.k] != null && !(f.t === 'opt' && f.opts[0] && f.opts[0][0] === st.f[f.k])));
      bar.innerHTML = '<b>보기 단위</b>';
      bar.appendChild(HS.seg(o.units.map((u) => [u.id, u.l]), st.unit, (v) => { st.unit = v; st.page = 0; st.open = null; save(); go(true); }));
      bar.appendChild(HS.el('<span class="qtag">' + (on.length ? on.map((f) => esc(f.t === 'chk' ? f.l : f.t === 'opt' ? (f.opts.find((p) => p[0] === st.f[f.k]) || [, ''])[1] : f.t === 'txt' ? '"' + st.f[f.k] + '"' : f.t === 'sel' ? f.l + ': ' + msText(f, st.f[f.k]) : f.label ? f.label(st.f[f.k]) : st.f[f.k])).join(' · ') + ' · ' : '') + fmt(filtered.length) + ' / ' + fmt(data.length) + '줄</span>'));
      if (on.length) { const a = HS.el('<a href="javascript:void 0" style="font-size:12px">조건 지우기</a>'); a.onclick = clear; bar.appendChild(a); }
      bar.appendChild(HS.el('<span style="margin-left:auto"></span>'));
      const cs = HS.el('<button class="btn sm">⚙ 칸 설정</button>'); cs.onclick = colSet; bar.appendChild(cs);
      const xl = HS.el('<button class="btn sm">엑셀 받기 (조회 결과)</button>'); xl.onclick = excel; bar.appendChild(xl);
    }
    function clear() { msClose(); o.filters.forEach((f) => { st.f[f.k] = f.t === 'chk' ? false : f.t === 'opt' ? (f.opts[0] || [''])[0] : f.t === 'sel' ? null : ''; if (fEls[f.k]) { if (f.t === 'chk') fEls[f.k].checked = false; else if (f.t !== 'sel') fEls[f.k].value = st.f[f.k]; } }); go(); }
    function excel() {
      if (!groups.length) return HS.toast('조회 결과가 없습니다');
      const V = visCols(); const out = groups.map((g) => Object.fromEntries(V.map((c) => [c.l, c.xl ? c.xl(g.v[c.k], g) : g.v[c.k] == null ? '' : g.v[c.k]])));
      HS.download((o.xls || '조회') + '_' + HS.today() + '.xlsx', out, (o.sheet || '조회').slice(0, 30));
    }
    function colSet() {
      const box = HS.el('<div class="qcs"><div class="mute" style="font-size:11.5px;margin-bottom:6px">체크 = 보이기 · 끌거나 ▲▼로 순서 바꾸기 · 이 브라우저에 기억</div><div class="ql"></div></div>');
      const list = box.querySelector('.ql'); const ord = st.order.slice(); const off = new Set(st.off);
      const paint = () => {
        list.innerHTML = ord.map((k, i) => '<div class="qi" draggable="true" data-i="' + i + '"><span class="qh">⋮⋮</span><label><input type="checkbox"' + (off.has(k) ? '' : ' checked') + ' data-k="' + esc(k) + '"> ' + esc(C[k].l) + '</label><span style="margin-left:auto"><button class="btn sm" data-u="' + i + '"' + (i ? '' : ' disabled') + '>▲</button> <button class="btn sm" data-d="' + i + '"' + (i < ord.length - 1 ? '' : ' disabled') + '>▼</button></span></div>').join('');
        list.querySelectorAll('input[data-k]').forEach((c) => (c.onchange = () => (c.checked ? off.delete(c.dataset.k) : off.add(c.dataset.k))));
        const mv = (a, b) => { const [x] = ord.splice(a, 1); ord.splice(b, 0, x); paint(); };
        list.querySelectorAll('[data-u]').forEach((b) => (b.onclick = () => mv(+b.dataset.u, +b.dataset.u - 1)));
        list.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => mv(+b.dataset.d, +b.dataset.d + 1)));
        let from = null; list.querySelectorAll('.qi').forEach((r) => { r.ondragstart = () => (from = +r.dataset.i); r.ondragover = (e) => e.preventDefault(); r.ondrop = (e) => { e.preventDefault(); if (from != null && from !== +r.dataset.i) mv(from, +r.dataset.i); from = null; }; });
      };
      paint();
      HS.modal('칸 설정', box, [['처음대로', 'reset'], ['취소', null], ['적용', true, 'p']]).then((r) => {
        if (r === 'reset') { st.order = o.cols.map((c) => c.k); st.off = o.cols.filter((c) => c.hide).map((c) => c.k); }
        else if (r) { st.order = ord; st.off = [...off]; } else return;
        save(); draw();
      });
    }
    function go(keepPage) { if (!keepPage) st.page = 0; st.open = null; save(); fillSel(); build(); draw(); }
    // 화면에서 조건 바꾸기 (다른 화면에서 넘어올 때 등): sel 은 값 하나 · 여러 개 · null(전체)
    const setF = (k, v) => { const f = o.filters.find((x) => x.k === k); if (!f) return; st.f[k] = f.t === 'sel' ? msv(v) : v; if (fEls[k] && f.t !== 'sel') { if (f.t === 'chk') fEls[k].checked = !!v; else fEls[k].value = v; } go(); };
    return { setData(rows) { data = rows || []; go(); }, refresh: () => go(true), state: st, setF };
  };
})();
