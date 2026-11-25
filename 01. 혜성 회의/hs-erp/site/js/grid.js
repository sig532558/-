/* 공통 그리드 설정
 *  1) HS.enhanceTables: 모든 화면의 표에 '⚙ 표 설정' 자동 부착
 *     - 열 숨기기 · 순서, 정렬, 열별 필터(값 선택 · 포함 · 숫자 범위), 전체 검색
 *     - 보기 저장(나만 / 전체 공유) · 엑셀 내려받기(보이는 그대로)
 *     - 첫 칸 순번(No) · 머리글 밑 합계 줄(수량 칸만 · 보이는 줄만) · 항목 수
 *     - 머리글 ▾ : 여러 값 골라 거르기 (전체 선택 · 해제 · 찾은 것만 · 반대로)
 *  2) HS.pivot: 분석용 피벗 (행 · 열 · 값 · 옵션 · 필터 · 저장 보기 · 엑셀)
 */
(function () {
  'use strict';
  const { esc, fmt } = HS;
  const LS = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('hs-grid:' + k) || 'null'); if (v === null) localStorage.removeItem('hs-grid:' + k); else localStorage.setItem('hs-grid:' + k, JSON.stringify(v)); } catch (e) { return null; } return null; };
  const cellText = (td) => { if (!td) return ''; const i = td.querySelector('input,select'); if (i) return i.type === 'checkbox' ? (i.checked ? 'Y' : '') : i.value; return td.textContent.trim(); };
  const toNum = (s) => { if (s == null) return null; let t = String(s).replace(/[,\s원개명건%▲▼+]/g, ''); if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t) * (/▼/.test(s) ? -1 : 1); const m = String(s).match(/^(-)?(\d+)억\s*([\d,]+)?만?$/); if (m) return (m[1] ? -1 : 1) * (+m[2] * 1e8 + (+(m[3] || '0').replace(/,/g, '')) * 1e4); const m2 = String(s).match(/^([+-]?[\d,]+)만$/); if (m2) return +m2[1].replace(/,/g, '') * 1e4; return null; };

  // ---------- 저장 보기 (erp_views) ----------
  async function loadViews(key) { try { return (await HS.db.list('erp_views', { eq: { screen: key }, order: ['name'] })).filter((v) => v.shared || v.owner === HS.me.id); } catch (e) { return []; } }
  async function saveView(key, cfg) {
    const f = HS.el('<div class="form"><label class="f wide">보기 이름<input class="in" id="vn" placeholder="예: 정기 실사 보고용"></label><label class="f wide"><span><input type="checkbox" id="vs"> 전체 공유 (다른 사람도 이 보기를 고를 수 있음)</span></label></div>');
    return HS.modal('보기 저장', f, [['취소', null], ['저장', true, 'p']], { onOk: async () => { const name = f.querySelector('#vn').value.trim(); if (!name) throw new Error('이름을 입력하세요'); await HS.db.upsert('erp_views', [{ screen: key, name, owner: HS.me.id, shared: f.querySelector('#vs').checked, config: cfg }]); HS.toast('보기를 저장했습니다', 'ok'); } });
  }
  HS.gridViews = { load: loadViews, save: saveView };

  // ================= 1. 모든 표 자동 설정 =================
  const dc = (r) => [...r.cells].filter((c) => !c.classList.contains('gno')); // 순번 칸 빼고
  function headerInfo(tb) {
    const r0 = tb.rows[0]; if (!r0) return null;
    const cells = dc(r0); if (!cells.length || !cells.every((c) => c.tagName === 'TH')) return null;
    // 위아래로 합친 칸(rowspan)이 있는 표는 줄을 옮기면 칸이 밀리므로 '찾기 · 엑셀'만 (예: 물동량 합계 · B2B · B2C 묶음)
    const merged = [...tb.rows].slice(1).some((r) => [...r.cells].some((c) => (c.rowSpan || 1) > 1));
    const simple = !merged && cells.every((c) => (c.colSpan || 1) === 1 && (c.rowSpan || 1) === 1) && !(tb.rows[1] && [...tb.rows[1].cells].every((c) => c.tagName === 'TH'));
    return { simple, n: cells.length, names: cells.map((c, i) => c.textContent.replace(/▾/g, '').trim() || (c.querySelector('input') ? '선택' : '열' + (i + 1))) };
  }
  function regularRows(tb, H) { return [...tb.rows].slice(1).filter((r) => dc(r).length === H.n && !r.classList.contains('tot') && !r.classList.contains('sum') && !r.classList.contains('gsum') && !isTotRow(r) && ![...r.cells].some((c) => c.colSpan > 1)); }
  const cellAt = (r, ci) => dc(r).find((c) => +c.dataset.ci === ci) || dc(r)[ci];
  function mark(tb, H) { [tb.rows[0]].concat(regularRows(tb, H)).forEach((r) => dc(r).forEach((c, i) => { if (c.dataset.ci == null) c.dataset.ci = i; })); }
  function apply(tb, H, st) {
    if (!H.simple) { // 머리글이 복잡한 표: 찾기만
      const q = (st.q || '').trim().toLowerCase(); const rs = [...tb.rows].filter((r) => ![...r.cells].every((c) => c.tagName === 'TH'));
      const qq = q.split(',').map((x) => x.trim()).filter(Boolean); rs.forEach((r) => (r.style.display = !qq.length || qq.some((w) => r.textContent.toLowerCase().indexOf(w) >= 0) || r.classList.contains('tot') || r.classList.contains('ptot') ? '' : 'none'));
      return { shown: rs.filter((r) => r.style.display !== 'none').length, total: rs.length };
    }
    mark(tb, H);
    const rows = regularRows(tb, H);
    // 정렬
    if (st.sort && st.sort.col != null) {
      const ci = st.sort.col; const dir = st.sort.dir === 'desc' ? -1 : 1; const parent = rows[0] && rows[0].parentNode;
      if (parent) {
        const tail = [...tb.rows].slice(1).filter((r) => rows.indexOf(r) < 0 && !r.classList.contains('gsum'));
        const keyed = rows.map((r, i) => ({ r, i, v: cellText(cellAt(r, ci)), n: toNum(cellText(cellAt(r, ci))) }));
        keyed.sort((a, b) => { if (a.n != null && b.n != null) return (a.n - b.n) * dir || a.i - b.i; if (a.n != null) return -1; if (b.n != null) return 1; return a.v.localeCompare(b.v, 'ko') * dir || a.i - b.i; });
        keyed.forEach((k) => parent.appendChild(k.r)); tail.forEach((r) => r.parentNode.appendChild(r));
      }
    }
    // 필터
    const qs = (st.q || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean); // 쉼표로 여러 개 = 하나라도 맞으면
    rows.forEach((r) => {
      let ok = !qs.length || qs.some((q) => [...r.cells].some((c) => cellText(c).toLowerCase().indexOf(q) >= 0));
      if (ok && st.zero) { const ns = dc(r).map((c) => cellText(c)).filter((t) => toNum(t) != null && !/^\d{4}[-./]\d|^0\d|^\d{1,2}[/.]\d{1,2}$/.test(t.trim())); ok = !ns.length || ns.some((t) => toNum(t) !== 0); } // 0인 줄 숨김
      for (const k in st.f || {}) {
        if (!ok) break; const f = st.f[k]; const t = cellText(cellAt(r, +k));
        if (f.vals && (f.vals.length || f.pick)) ok = f.vals.indexOf(t) >= 0; // 조건 줄에서 '전체 해제' = 아무 줄도 안 보임
        if (ok && f.has) ok = t.toLowerCase().indexOf(f.has.toLowerCase()) >= 0;
        const n = toNum(t); if (ok && f.min != null && f.min !== '') ok = n != null && n >= +f.min; if (ok && f.max != null && f.max !== '') ok = n != null && n <= +f.max;
        if (ok && f.nz) ok = n != null ? n !== 0 : t !== '' && t !== '-';
        if (ok && f.pr) ok = n != null && (f.pr === 'lt30' ? n < 30 : f.pr === 'lt50' ? n < 50 : f.pr === 'ge80' ? n >= 80 : true); // 비율 범위
      }
      r.style.display = ok ? '' : 'none';
    });
    // 열 순서 · 숨기기 (원래 열 번호 기준)
    const order = (st.order && st.order.length === H.n) ? st.order : [...Array(H.n).keys()];
    const hide = new Set(st.hide || []);
    [tb.rows[0]].concat(rows).forEach((r) => { const cells = dc(r); order.forEach((ci) => { const c = cells.find((x) => +x.dataset.ci === ci); if (c) r.appendChild(c); }); cells.forEach((c) => (c.style.display = hide.has(+c.dataset.ci) ? 'none' : '')); });
    return { shown: rows.filter((r) => r.style.display !== 'none').length, total: rows.length };
  }
  function exportTable(tb, H, name) {
    const aoa = [];
    [...tb.rows].forEach((r) => { if (r.style.display === 'none') return; const row = []; [...r.cells].forEach((c) => { if (c.style.display === 'none') return; const t = cellText(c); const n = toNum(t); row.push(n != null && !/^0\d/.test(t) ? n : t); for (let k = 1; k < (c.colSpan || 1); k++) row.push(''); }); aoa.push(row); });
    HS.needXlsx(); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1'); XLSX.writeFile(wb, name.replace(/[\\/:*?"<>|]/g, '') + '_' + HS.today() + '.xlsx');
  }
  // ---------- 순번(No) · 합계 줄 · 항목 수 ----------
  const NOSUM = /율|%|비율|일자|날짜|일$|시각|시간|시기|기간|년도|연도|년$|월$|주차|주$|코드|번호|^No$|순위|순번|경과|사이즈|바코드|전화|요일|차수|버전|기준|^선택$|^열\d+$/;
  const isTotRow = (r) => r.classList.contains('tot') || r.classList.contains('sum') || r.classList.contains('ptot') || /^(합계|총계|전체 합계|계)(\s*\(.*\))?$/.test(((dc(r)[0] || {}).textContent || '').trim());
  function addNo(tb) {
    if (tb.querySelector('.gno')) return true;
    if ([...tb.rows].some((r) => [...r.cells].some((c) => (c.rowSpan || 1) > 1))) return false;
    const r0 = tb.rows[0]; const th = document.createElement('th'); th.className = 'gno'; th.textContent = 'No'; r0.insertBefore(th, r0.firstChild);
    [...tb.rows].slice(1).forEach((r) => { const td = document.createElement('td'); td.className = 'gno'; if (isTotRow(r) && !/^(합계|총계|계)/.test(((dc(r)[0] || {}).textContent || '').trim())) td.textContent = '합계'; r.insertBefore(td, r.firstChild); });
    return true;
  }
  // 수량 칸 찾기: 머리글 이름(날짜 · 율 · 코드 … 제외) + 값 90% 이상이 숫자
  function numCols(tb, H, rows) {
    const out = [];
    for (let ci = 0; ci < H.n; ci++) {
      if (NOSUM.test(H.names[ci])) continue;
      let n = 0, t = 0, dig = 0, bad = false;
      for (const r of rows) {
        const c = cellAt(r, ci); if (!c) continue;
        if (c.querySelector('input[type=checkbox],input[type=date],select,button')) { bad = true; break; }
        const x = cellText(c); if (!x || x === '-') continue; t++;
        if (/^\d{4}[-./]\d|^\d{1,2}:\d\d|%$/.test(x)) { bad = true; break; }
        if (toNum(x) != null) { n++; const m = x.replace(/,/g, '').match(/\.(\d+)/); if (m) dig = Math.max(dig, Math.min(2, m[1].length)); }
      }
      if (!bad && t > 0 && n / t >= 0.9) out.push({ ci, dig, name: H.names[ci] });
    }
    return out;
  }
  function drawSum(tb, H, NC, rows, own) {
    const old = tb.querySelector('tr.gsum'); if (old) old.remove();
    if (own) { tb.rows[0].insertAdjacentElement('afterend', own); return null; } // 화면에 원래 있던 합계 줄 → 위로
    if (!NC.length) return null;
    const vis = rows.filter((r) => r.style.display !== 'none'); const sums = {};
    NC.forEach(({ ci }) => (sums[ci] = vis.reduce((a, r) => a + (toNum(cellText(cellAt(r, ci))) || 0), 0)));
    const tr = document.createElement('tr'); tr.className = 'gsum';
    const no = document.createElement('td'); no.className = 'gno'; no.textContent = '합계'; tr.appendChild(no);
    let cntDone = false;
    dc(tb.rows[0]).forEach((th) => {
      const ci = +th.dataset.ci; const td = document.createElement('td'); td.dataset.ci = ci; td.style.display = th.style.display;
      const nc = NC.find((x) => x.ci === ci);
      if (nc) { td.className = 'n'; td.textContent = fmt(sums[ci], nc.dig); }
      else if (!cntDone && th.style.display !== 'none' && !NOSUM.test(H.names[ci]) && rows[0] && !(cellAt(rows[0], ci) || { querySelector: () => 1 }).querySelector('input,select,button')) { td.textContent = fmt(vis.length) + '건'; cntDone = true; }
      tr.appendChild(td);
    });
    tb.rows[0].insertAdjacentElement('afterend', tr);
    return sums;
  }
  function renumber(tb, rows) { let i = 0; rows.forEach((r) => { const c = r.cells[0]; if (c && c.classList.contains('gno')) c.textContent = r.style.display === 'none' ? '' : ++i; }); }

  // ---------- 여러 값 골라 거르기 (머리글 ▾ · 표 설정 공용) ----------
  function filterBox(m, fl, isNum) {
    fl = fl || {}; const keys = [...m.keys()].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })); const MAXL = 3000; const many = keys.length > MAXL;
    const all = !fl.vals || !fl.vals.length; const on = new Set(all ? keys : fl.vals);
    const el = HS.el('<div class="gfb"><input class="in" data-fs placeholder="값 찾기"><div class="gfbb"><button class="btn sm" data-a="all">전체 선택</button><button class="btn sm" data-a="none">전체 해제</button><button class="btn sm" data-a="found">찾은 것만 선택</button><button class="btn sm" data-a="inv">반대로</button></div><div class="gfl"></div>' +
      (many ? '<div class="mute" style="font-size:11px;margin-top:4px">값이 ' + fmt(keys.length) + '개라 앞 ' + fmt(MAXL) + '개만 보입니다 · 찾기 칸으로 좁혀 주세요</div>' : '') +
      '<div class="gfo">' + (isNum ? '<label>최소 <input class="in" data-mn inputmode="decimal"></label><label>최대 <input class="in" data-mx inputmode="decimal"></label>' : '') + '<label><input type="checkbox" data-nz> 0 · 빈칸 빼기</label></div></div>');
    const fs = el.querySelector('[data-fs]'); const box = el.querySelector('.gfl');
    const match = (k) => { const q = fs.value.trim().toLowerCase(); return !q || (k || '(빈칸)').toLowerCase().indexOf(q) >= 0; };
    const draw = () => { const ks = keys.filter(match).slice(0, MAXL); box.innerHTML = ks.map((k) => '<label><input type="checkbox" data-k="' + esc(k) + '"' + (on.has(k) ? ' checked' : '') + '> ' + esc(k || '(빈칸)') + '<span class="mute">' + fmt(m.get(k)) + '</span></label>').join('') || '<div class="mute">찾는 값이 없습니다</div>'; box.querySelectorAll('[data-k]').forEach((c) => (c.onchange = () => { if (c.checked) on.add(c.dataset.k); else on.delete(c.dataset.k); })); };
    fs.oninput = draw;
    el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); const a = b.dataset.a; if (a === 'all') keys.forEach((k) => on.add(k)); else if (a === 'none') on.clear(); else if (a === 'found') { on.clear(); keys.filter(match).forEach((k) => on.add(k)); } else { keys.forEach((k) => (on.has(k) ? on.delete(k) : on.add(k))); } draw(); }));
    if (isNum) { el.querySelector('[data-mn]').value = fl.min || ''; el.querySelector('[data-mx]').value = fl.max || ''; }
    el.querySelector('[data-nz]').checked = !!fl.nz;
    draw();
    const get = () => { if (!on.size) throw new Error('값을 하나 이상 고르세요'); const vals = on.size === keys.length ? undefined : keys.filter((k) => on.has(k)); const r = { vals, has: fl.has || undefined, min: isNum ? el.querySelector('[data-mn]').value || undefined : fl.min, max: isNum ? el.querySelector('[data-mx]').value || undefined : fl.max, nz: el.querySelector('[data-nz]').checked || undefined }; return Object.values(r).some((x) => x !== undefined) ? r : null; };
    return { el, get, focus: () => fs.focus() };
  }
  const valMap = (tb, H, ci) => { mark(tb, H); const m = new Map(); regularRows(tb, H).forEach((r) => { const t = cellText(cellAt(r, ci)); m.set(t, (m.get(t) || 0) + 1); }); return m; };
  const isNumCol = (m) => { let n = 0, t = 0; m.forEach((c, k) => { if (!k) return; t++; if (toNum(k) != null) n++; }); return t > 0 && n / t >= 0.9; };
  let popEl = null; const closePop = () => { if (popEl) { popEl.remove(); popEl = null; } };
  document.addEventListener('mousedown', (e) => { if (popEl && !popEl.contains(e.target) && !(e.target.classList && e.target.classList.contains('gdd'))) closePop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
  // 여러 개 고르기 창 (재고 조회와 같은 모양) — sel: 고른 값들 · null = 전체
  let mpop = null;
  function pickMany(btn, title, vs, cnt, cur, onSet) {
    if (mpop) { const same = mpop.dataset.t === title; mpop.remove(); mpop = null; if (same) return; }
    const S = () => new Set(cur || vs);
    const p = HS.el('<div class="qpop" data-t="' + esc(title) + '"><div class="qph"><b>' + esc(title) + '</b><span class="mute">여러 개 고를 수 있음</span></div>' + (vs.length > 8 ? '<input class="in qpq" placeholder="목록에서 찾기">' : '') + '<div class="qpb"><button type="button" class="btn sm" data-all>전체 선택</button><button type="button" class="btn sm" data-none>전체 해제</button><span class="qpn mute"></span></div><div class="qpl">' + vs.map((v, i) => '<label><input type="checkbox" data-v="' + i + '"> <span>' + esc(v) + '</span><em>' + fmt(cnt.get(v) || 0) + '</em></label>').join('') + '</div><div class="qpf"><button type="button" class="btn sm p" data-x2>닫기</button></div></div>');
    mpop = p; document.body.appendChild(p); const rc = btn.getBoundingClientRect(); const pw = Math.max(rc.width, 240);
    p.style.left = Math.max(8, Math.min(rc.left + scrollX, scrollX + document.documentElement.clientWidth - pw - 8)) + 'px'; p.style.top = rc.bottom + scrollY + 4 + 'px'; p.style.width = pw + 'px';
    const boxes = [...p.querySelectorAll('input[data-v]')];
    const paint = () => { const s = S(); boxes.forEach((c) => (c.checked = s.has(vs[+c.dataset.v]))); p.querySelector('.qpn').textContent = !cur ? '전체' : cur.length + '개 고름'; };
    const commit = (s) => { cur = vs.every((v) => s.has(v)) ? null : vs.filter((v) => s.has(v)); paint(); onSet(cur); };
    const shown = () => boxes.filter((c) => c.closest('label').style.display !== 'none');
    boxes.forEach((c) => (c.onchange = () => { const s = S(); const v = vs[+c.dataset.v]; if (c.checked) s.add(v); else s.delete(v); commit(s); }));
    p.querySelector('[data-all]').onclick = () => { const s = S(); shown().forEach((c) => s.add(vs[+c.dataset.v])); commit(s); };
    p.querySelector('[data-none]').onclick = () => { const s = S(); shown().forEach((c) => s.delete(vs[+c.dataset.v])); commit(s); };
    const close = () => { if (mpop === p) { p.remove(); mpop = null; } document.removeEventListener('mousedown', out, true); };
    const out = (e) => { if (!p.contains(e.target) && e.target !== btn) close(); };
    p.querySelector('[data-x2]').onclick = close; const qq = p.querySelector('.qpq'); if (qq) { qq.oninput = () => { const t = qq.value.trim().toUpperCase(); boxes.forEach((c) => (c.closest('label').style.display = !t || vs[+c.dataset.v].toUpperCase().indexOf(t) >= 0 ? '' : 'none')); }; setTimeout(() => qq.focus(), 0); }
    paint(); setTimeout(() => document.addEventListener('mousedown', out, true), 0);
  }
  HS.pickMany = pickMany; // 다른 화면(월간 회의 입고팀 월별 입고 현황)에서도 같은 "여러 개 고르기" 창을 씀
  function openPop(anchor, title, fb, onApply, onClear) {
    closePop();
    const p = HS.el('<div class="gpop"><div class="gph">' + esc(title) + ' — 여러 개 고르기</div></div>'); p.appendChild(fb.el);
    const ft = HS.el('<div class="gpf"><button class="btn sm" data-c>지우기</button><button class="btn sm p" data-o>적용</button></div>'); p.appendChild(ft);
    ft.querySelector('[data-c]').onclick = () => { closePop(); onClear(); };
    ft.querySelector('[data-o]').onclick = () => { try { const v = fb.get(); closePop(); onApply(v); } catch (e) { HS.toast(e.message, 'err'); } };
    document.body.appendChild(p); popEl = p;
    const rc = anchor.getBoundingClientRect(); const w = p.offsetWidth; const left = Math.max(8, Math.min(window.innerWidth - w - 8, rc.left + window.scrollX - 20));
    p.style.left = left + 'px'; p.style.top = (rc.bottom + window.scrollY + 4) + 'px'; fb.focus();
  }
  const fLabel = (H, ci, f) => { const v = []; if (f.vals && f.vals.length) v.push(f.vals.slice(0, 1).map((x) => x || '(빈칸)').join('') + (f.vals.length > 1 ? ' 외 ' + (f.vals.length - 1) : '')); if (f.has) v.push('"' + f.has + '" 포함'); if (f.pr) v.push({ lt30: '30% 미만', lt50: '50% 미만', ge80: '80% 이상' }[f.pr] || ''); if (f.min) v.push('≥ ' + f.min); if (f.max) v.push('≤ ' + f.max); if (f.nz) v.push('0 · 빈칸 빼기'); return (H.names[ci] || '열') + ': ' + v.join(' · '); };

  // 도구 없는 표(no-tools): 순번 · 합계 줄만 (조회 화면 .qt 는 자체 처리)
  function lite(tb) {
    if (tb.dataset.gt || tb.classList.contains('qt') || tb.closest('.modal-bg,.rep-k,.rep-x,.pvw,.gpop,.no-no') || tb.classList.contains('no-no')) return;
    if (tb.rows.length < 4) return; const H = headerInfo(tb); if (!H || !H.simple) return;
    tb.dataset.gt = 'lite';
    const own = [...tb.rows].slice(1).find(isTotRow) || null;
    const hasNo = addNo(tb); mark(tb, H); const rows = regularRows(tb, H);
    drawSum(tb, H, numCols(tb, H, rows), rows, own); if (hasNo) renumber(tb, rows);
  }
  function attach(tb, idx) {
    if (!tb.dataset.gt && (tb.classList.contains('no-tools') || tb.closest('.no-tools'))) return lite(tb);
    if (tb.dataset.gt || tb.closest('.modal-bg,.rep-k,.rep-x,.no-tools,.pvw') || tb.classList.contains('no-tools')) return;
    if (tb.rows.length < 4) return;
    const H = headerInfo(tb); if (!H) return;
    tb.dataset.gt = '1';
    const card = tb.closest('.card'); const h3 = card && card.querySelector('h3');
    const title = (h3 ? h3.childNodes[0] && (h3.childNodes[0].textContent || '').trim() || h3.textContent.trim().slice(0, 24) : '') || '표' + idx;
    const key = (HS.cur || 'x') + ':' + title.replace(/[①-⑳\d\s]+/g, '').slice(0, 30) + ':' + H.n;
    let st = LS(key) || {};
    const bar = HS.el('<div class="gtb"><input class="in gq" placeholder="표 안에서 찾기 (쉼표로 여러 개)"><span class="gcnt"></span><span class="sp"></span>' + (H.simple ? '<button class="btn sm" data-set>⚙ 표 설정</button>' : '') + '<button class="btn sm" data-views>★ 보기</button><button class="btn sm" data-x>엑셀</button></div>');
    const chips = HS.el('<div class="gchips"></div>');
    const wrap = tb.closest('.tw') || tb; wrap.parentNode.insertBefore(bar, wrap); wrap.parentNode.insertBefore(chips, wrap);
    const q = bar.querySelector('.gq'); q.value = st.q || '';
    // 순번 · 합계 줄 · 머리글 ▾ (머리글이 단순한 표만)
    let hasNo = false, NC = [], own = null;
    if (H.simple) {
      own = [...tb.rows].slice(1).find(isTotRow) || null;
      hasNo = addNo(tb);
      mark(tb, H); NC = numCols(tb, H, regularRows(tb, H));
      dc(tb.rows[0]).forEach((th) => { const ci = +th.dataset.ci; if (/^(선택|열\d+)$/.test(H.names[ci]) || th.querySelector('input')) return; const b = document.createElement('span'); b.className = 'gdd'; b.title = '여러 값 골라 거르기'; b.dataset.gci = ci; th.appendChild(b);
        b.onclick = (e) => { e.stopPropagation(); e.preventDefault(); const m = valMap(tb, H, ci); st.f = st.f || {}; const fb = filterBox(m, st.f[ci], isNumCol(m)); openPop(b, H.names[ci], fb, (v) => { st.f = st.f || {}; if (v) st.f[ci] = Object.assign({}, v, { has: (st.f[ci] || {}).has }); else delete st.f[ci]; if (st.f[ci] && !Object.values(st.f[ci]).some((x) => x !== undefined)) delete st.f[ci]; save(); }, () => { if (st.f) delete st.f[ci]; save(); }); }; });
    }
    // 조건 줄: 글자 칸(값 2~80개) 여러 개 고르기 · 비율 칸 범위 · 0인 줄 숨김 — 머리글 ▾ 거르기와 같은 상태(st.f)를 씀
    let cond = null;
    if (H.simple) {
      const cols = []; for (let ci = 0; ci < H.n; ci++) { if (/^(선택|열\d+|No|순번)$/.test(H.names[ci] || '')) continue; const m = valMap(tb, H, ci); const ks = [...m.keys()].filter(Boolean); if (!ks.length) continue;
        const pct = ks.filter((k) => /%$/.test(k)).length >= ks.length * 0.8; if (pct) { cols.push({ ci, t: 'p' }); continue; } if (!isNumCol(m) && ks.length >= 2 && ks.length <= 80 && ks.every((k) => k.length <= 40)) cols.push({ ci, t: 's', m }); }
      const S = cols.filter((c) => c.t === 's').slice(0, 4), Pc = cols.filter((c) => c.t === 'p').slice(0, 2);
      if (S.length || Pc.length) {
        cond = HS.el('<div class="gcond">' + S.map((c) => '<div class="gcf"><span>' + esc(H.names[c.ci]) + '</span><button type="button" class="in gcs" data-c="' + c.ci + '"></button></div>').join('') + Pc.map((c) => '<div class="gcf"><span>' + esc(H.names[c.ci]) + '</span><select class="in" data-p="' + c.ci + '"><option value="">전체</option><option value="lt30">30% 미만만</option><option value="lt50">50% 미만만</option><option value="ge80">80% 이상만</option></select></div>').join('') + '<button type="button" class="gzc" data-z>0인 줄 숨김</button></div>');
        bar.parentNode.insertBefore(cond, bar.nextSibling);
        cond.querySelectorAll('[data-c]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const ci = +b.dataset.c; const m = valMap(tb, H, ci); const vs = [...m.keys()].filter(Boolean).sort((a, z) => a.localeCompare(z, 'ko')); pickMany(b, H.names[ci], vs, m, ((st.f || {})[ci] || {}).vals, (sel) => { st.f = st.f || {}; if (!sel) { if (st.f[ci]) { delete st.f[ci].vals; delete st.f[ci].pick; if (!Object.values(st.f[ci]).some((x) => x !== undefined)) delete st.f[ci]; } } else st.f[ci] = Object.assign({}, st.f[ci] || {}, { vals: sel, pick: 1 }); save(); }); }));
        cond.querySelectorAll('[data-p]').forEach((sl) => (sl.onchange = () => { const ci = +sl.dataset.p; st.f = st.f || {}; if (sl.value) st.f[ci] = Object.assign({}, st.f[ci] || {}, { pr: sl.value }); else if (st.f[ci]) { delete st.f[ci].pr; if (!Object.values(st.f[ci]).some((x) => x !== undefined)) delete st.f[ci]; } save(); }));
        cond.querySelector('[data-z]').onclick = () => { st.zero = !st.zero; save(); };
      }
    }
    const run = () => {
      if (cond) { cond.querySelectorAll('[data-c]').forEach((b) => { const v = ((st.f || {})[b.dataset.c] || {}).vals; b.textContent = (!v ? '전체' : !v.length ? '선택 없음' : v.length === 1 ? (v[0] || '(빈칸)') : v[0] + ' 외 ' + (v.length - 1)) + ' ▾'; b.classList.toggle('on', !!v); });
        cond.querySelectorAll('[data-p]').forEach((sl) => (sl.value = ((st.f || {})[sl.dataset.p] || {}).pr || '')); cond.querySelector('[data-z]').classList.toggle('on', !!st.zero); }
      const r = apply(tb, H, st); const cnt = bar.querySelector('.gcnt');
      let sums = null;
      if (H.simple) { const rows = regularRows(tb, H); sums = drawSum(tb, H, NC, rows, own); if (hasNo) renumber(tb, rows); }
      cnt.innerHTML = '항목 <b>' + (r.shown !== r.total ? fmt(r.shown) + '</b> / ' + fmt(r.total) : fmt(r.total) + '</b>') + '건' + (sums ? NC.filter((x) => { const th = dc(tb.rows[0]).find((t) => +t.dataset.ci === x.ci); return th && th.style.display !== 'none'; }).slice(0, 2).map((x) => ' · ' + esc(x.name) + ' 합계 <b>' + fmt(sums[x.ci], x.dig) + '</b>').join('') : '');
      const fs = st.f || {}; const ks = Object.keys(fs);
      chips.innerHTML = ks.map((k) => '<span class="gchip" data-ck="' + k + '">' + esc(fLabel(H, +k, fs[k])) + ' <i>✕</i></span>').join('') + ((ks.length || (st.q || '').trim() || st.zero) ? '<span class="gchip o" data-call>✕ 조건 모두 지우기</span>' : '');
      chips.querySelectorAll('[data-ck]').forEach((c) => (c.onclick = () => { delete st.f[c.dataset.ck]; save(); }));
      const ca = chips.querySelector('[data-call]'); if (ca) ca.onclick = () => { st.f = {}; st.q = ''; st.zero = false; q.value = ''; save(); };
      tb.querySelectorAll('.gdd').forEach((b) => b.classList.toggle('on', !!fs[b.dataset.gci]));
      bar.querySelector('[data-set]') && bar.querySelector('[data-set]').classList.toggle('on', !!((st.hide && st.hide.length) || ks.length || st.sort));
    };
    const save = () => { LS(key, st); run(); };
    let qt; q.oninput = () => { clearTimeout(qt); qt = setTimeout(() => { st.q = q.value; save(); }, 200); };
    bar.querySelector('[data-x]').onclick = () => exportTable(tb, H, title);
    if (H.simple) bar.querySelector('[data-set]').onclick = () => settings(tb, H, st, (ns) => { st = ns; save(); }, title);
    bar.querySelector('[data-views]').onclick = async () => {
      const vs = await loadViews(key);
      const f = HS.el('<div>' + (vs.length ? '<div class="tw"><table class="no-tools"><tr><th>보기</th><th>공유</th><th></th></tr>' + vs.map((v, i) => '<tr><td><b>' + esc(v.name) + '</b></td><td>' + (v.shared ? '<span class="tag b">전체</span>' : '<span class="tag">나만</span>') + '</td><td><button class="btn sm p" data-ap="' + i + '">적용</button>' + (v.owner === HS.me.id ? ' <button class="btn sm" data-del="' + i + '">삭제</button>' : '') + '</td></tr>').join('') + '</table></div>' : '<div class="mute">저장된 보기가 없습니다</div>') + '</div>');
      const v = await HS.modal('저장된 보기 · ' + title, f, [['기본값으로', 'reset'], ['지금 설정 저장', 'save', 'p']], {
        onOpen: (bg) => { bg.querySelectorAll('[data-ap]').forEach((b) => (b.onclick = () => { st = JSON.parse(JSON.stringify(vs[+b.dataset.ap].config || {})); q.value = st.q || ''; LS(key, st); bg.remove(); HS.route(); })); bg.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { const x = vs[+b.dataset.del]; try { await HS.db.remove('erp_views', { id: x.id }); b.closest('tr').remove(); } catch (e) { HS.err(e); } })); },
      });
      if (v === 'reset') { st = {}; LS(key, null); HS.route(); } else if (v === 'save') await saveView(key, st);
    };
    run();
  }
  function settings(tb, H, st0, done, title) {
    const st = JSON.parse(JSON.stringify(st0 || {})); st.f = st.f || {}; st.hide = st.hide || [];
    let order = (st.order && st.order.length === H.n) ? st.order.slice() : [...Array(H.n).keys()];
    const rows = regularRows(tb, H);
    // 현재 화면 순서가 바뀌어 있을 수 있어 원래 열 번호 기준으로 값 수집
    const origVals = (ci) => { mark(tb, H); const m = new Map(); rows.forEach((r) => { const t = cellText(cellAt(r, ci)); m.set(t, (m.get(t) || 0) + 1); }); return m; };
    const f = HS.el('<div class="gset"><div class="mute" style="font-size:11.5px;margin-bottom:6px">열을 ▲▼로 옮기고, 체크를 끄면 숨깁니다. 필터는 열마다 지정합니다.</div><div class="gcols"></div><div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">정렬 <select class="in" id="gs" style="width:200px"><option value="">원래 순서</option>' + H.names.map((n, i) => '<option value="' + i + '">' + esc(n) + '</option>').join('') + '</select><select class="in" id="gd" style="width:110px"><option value="asc">오름차순</option><option value="desc">내림차순</option></select></div></div>');
    const box = f.querySelector('.gcols');
    const draw = () => {
      box.innerHTML = order.map((ci, pos) => { const fl = st.f[ci] || {}; const on = st.hide.indexOf(ci) < 0; const act = (fl.vals && fl.vals.length) || fl.has || fl.min || fl.max || fl.nz; return '<div class="gcol"><button class="btn sm" data-u="' + pos + '">▲</button><button class="btn sm" data-d="' + pos + '">▼</button><label><input type="checkbox" data-h="' + ci + '"' + (on ? ' checked' : '') + '> ' + esc(H.names[ci]) + '</label><span class="sp"></span><button class="btn sm' + (act ? ' p' : '') + '" data-f="' + ci + '">필터' + (act ? ' ●' : '') + '</button></div>'; }).join('');
      box.querySelectorAll('[data-u]').forEach((b) => (b.onclick = () => { const p = +b.dataset.u; if (p > 0) { [order[p - 1], order[p]] = [order[p], order[p - 1]]; draw(); } }));
      box.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { const p = +b.dataset.d; if (p < order.length - 1) { [order[p + 1], order[p]] = [order[p], order[p + 1]]; draw(); } }));
      box.querySelectorAll('[data-h]').forEach((c) => (c.onchange = () => { const ci = +c.dataset.h; st.hide = st.hide.filter((x) => x !== ci); if (!c.checked) st.hide.push(ci); }));
      box.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => colFilter(+b.dataset.f)));
    };
    const colFilter = (ci) => {
      const m = origVals(ci); const fl = st.f[ci] || {};
      const fb = filterBox(m, fl, isNumCol(m)); const g = HS.el('<div><label class="f">포함하는 글자<input class="in" id="fh"></label></div>'); g.appendChild(fb.el); g.querySelector('#fh').value = fl.has || '';
      HS.modal('필터 · ' + H.names[ci], g, [['지우기', 'clr'], ['적용', 'ok', 'p']], { onOk: () => { fb.get(); } }).then((v) => {
        if (v === 'clr') delete st.f[ci];
        else if (v === 'ok') { let r = null; try { r = fb.get(); } catch (e) { r = null; } r = Object.assign({}, r || {}, { has: g.querySelector('#fh').value.trim() || undefined }); if (Object.values(r).some((x) => x !== undefined)) st.f[ci] = r; else delete st.f[ci]; }
        draw();
      });
    };
    draw();
    if (st.sort) { f.querySelector('#gs').value = st.sort.col; f.querySelector('#gd').value = st.sort.dir; }
    HS.modal('⚙ 표 설정 · ' + title, f, [['기본값', 'reset'], ['적용', 'ok', 'p']], { wide: true }).then((v) => {
      if (v === 'reset') { done({}); HS.route(); return; }
      if (v !== 'ok') return;
      st.order = order.some((x, i) => x !== i) ? order : undefined;
      const sc = f.querySelector('#gs').value; st.sort = sc === '' ? undefined : { col: +sc, dir: f.querySelector('#gd').value };
      if (!st.hide.length) delete st.hide; if (!Object.keys(st.f).length) delete st.f;
      done(st);
    });
  }
  HS.enhanceTables = (root) => { (root || document.getElementById('body') || document).querySelectorAll('table').forEach((t, i) => { try { attach(t, i); } catch (e) { console.warn('grid', e); } }); };
  // 화면이 다시 그려질 때마다 자동 부착
  let mo = null, tm = null;
  HS.watchTables = () => { const body = document.getElementById('body'); if (!body || mo) return; mo = new MutationObserver(() => { clearTimeout(tm); tm = setTimeout(() => HS.enhanceTables(body), 120); }); mo.observe(body, { childList: true, subtree: true }); };

  // ================= 2. 피벗 =================
  // o: { el, key, data:[{...}], dims:[{k,l,order?:[...], fmt?}], measures:[{k,l,dig?}], derived:[{k,l,f:(agg)=>v, show}], state, onCell(filter) , title }
  HS.pivot = function (o) {
    const key = 'pivot:' + o.key;
    let st = Object.assign({ rows: o.state.rows.slice(), col: o.state.col || null, vals: o.state.vals.slice(), opts: Object.assign({ sub: true, nz: false, color: true }, o.state.opts || {}), sort: o.state.sort || '', f: {} }, LS(key) || {});
    const dimOf = (k) => o.dims.find((d) => d.k === k) || { k, l: k };
    const allVals = (k) => { const d = dimOf(k); const s = [...new Set(o.data.map((r) => r[k] == null ? '' : String(r[k])))]; if (d.order) return d.order.filter((x) => s.indexOf(x) >= 0).concat(s.filter((x) => d.order.indexOf(x) < 0).sort()); return s.sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })); };
    const label = (k, v) => { const d = dimOf(k); return d.fmt ? d.fmt(v) : (v === '' ? '(없음)' : v); };
    const valDefs = () => st.vals.map((k) => o.measures.find((m) => m.k === k) || (o.derived || []).find((m) => m.k === k)).filter(Boolean);
    const root = o.el; root.innerHTML = '';
    const fb = HS.el('<div class="pfb"><b>필터</b><span class="pfl"></span><span class="sp"></span><button class="btn sm" data-clr>✕ 필터 지우기</button><button class="btn sm" data-set>⚙ 그리드 설정</button><button class="btn sm" data-views>★ 저장된 보기</button><button class="btn sm gd" data-x>엑셀</button></div>');
    const holder = HS.el('<div class="tw pvw"></div>');
    root.appendChild(fb); root.appendChild(holder);
    const save = () => { LS(key, st); draw(); };
    function filtered() { return o.data.filter((r) => Object.entries(st.f).every(([k, vs]) => !vs || !vs.length || vs.indexOf(r[k] == null ? '' : String(r[k])) >= 0)); }
    function agg(rows) { const a = { _n: rows.length }; o.measures.forEach((m) => (a[m.k] = rows.reduce((s, r) => s + (+r[m.k] || 0), 0))); (o.derived || []).forEach((d) => (a[d.k] = d.f(a))); return a; }
    function draw() {
      // 필터 바
      fb.querySelector('.pfl').innerHTML = o.dims.filter((d) => d.filter !== false).map((d) => { const v = st.f[d.k]; return '<span class="dd' + (v && v.length ? ' on' : '') + '" data-fd="' + d.k + '">' + esc(d.l) + ': <b>' + (v && v.length ? esc(v.slice(0, 2).map((x) => label(d.k, x)).join(', ') + (v.length > 2 ? ' 외 ' + (v.length - 2) : '')) : '전체') + '</b> ▾</span>'; }).join('');
      fb.querySelectorAll('[data-fd]').forEach((x) => (x.onclick = () => pickFilter(x.dataset.fd)));
      const data = filtered(); const vd = valDefs(); const col = st.col; const cvals = col ? allVals(col).filter((v) => data.some((r) => String(r[col] == null ? '' : r[col]) === v)) : [];
      const cols = col ? cvals.concat(['__t']) : ['__t'];
      const sub = (rows, k) => (k === '__t' ? rows : rows.filter((r) => String(r[col] == null ? '' : r[col]) === k));
      const fmtv = (m, v) => (m.show ? m.show(v) : v == null || isNaN(v) ? '-' : fmt(v, m.dig || 0));
      const vcls = (m, v) => (!st.opts.color || !m.color || !v ? '' : v < 0 ? 'neg' : 'pos');
      // 행 트리
      const lines = [];
      const walk = (rows, depth, path) => {
        const k = st.rows[depth]; let groups = allVals(k).map((v) => [v, rows.filter((r) => String(r[k] == null ? '' : r[k]) === v)]).filter((g) => g[1].length);
        if (st.sort) { const [sk, sd] = st.sort.split(':'); groups.sort((a, b) => ((agg(a[1])[sk] || 0) - (agg(b[1])[sk] || 0)) * (sd === 'asc' ? 1 : -1)); }
        for (const [v, rs] of groups) {
          const p = Object.assign({}, path, { [k]: v });
          if (st.opts.nz && o.nzKey && !rs.some((r) => +r[o.nzKey])) continue;
          if (depth < st.rows.length - 1) { if (st.opts.sub) lines.push({ depth, path: p, rows: rs, sub: true, v, k }); walk(rs, depth + 1, p); }
          else lines.push({ depth, path: p, rows: rs, v, k });
        }
      };
      if (st.rows.length) walk(data, 0, {});
      const head1 = '<tr>' + st.rows.map((k) => '<th rowspan="' + (vd.length > 1 || col ? 2 : 1) + '">' + esc(dimOf(k).l) + '</th>').join('') + cols.map((c, i) => '<th colspan="' + vd.length + '" class="pc' + (i % 4) + (c === '__t' ? ' pt' : '') + '">' + esc(c === '__t' ? '합계' : label(col, c)) + '</th>').join('') + '</tr>';
      const head2 = vd.length > 1 || col ? '<tr>' + cols.map(() => vd.map((m) => '<th>' + esc(m.l) + '</th>').join('')).join('') + '</tr>' : '';
      const body = lines.map((ln) => '<tr class="' + (ln.sub ? 'psub' : '') + '">' + st.rows.map((k, i) => '<td' + (i === ln.depth ? ' class="pk"' : '') + '>' + (i === ln.depth ? esc(label(k, ln.v)) + (ln.sub ? ' <span class="mute">소계</span>' : '') : '') + '</td>').join('') + cols.map((c) => { const a = agg(sub(ln.rows, c)); return vd.map((m) => '<td class="n ' + vcls(m, a[m.k]) + '" data-c="' + esc(JSON.stringify(Object.assign({}, ln.path, c === '__t' ? {} : { [col]: c }))) + '">' + fmtv(m, a[m.k]) + '</td>').join(''); }).join('') + '</tr>').join('');
      const tot = '<tr class="ptot"><td colspan="' + Math.max(1, st.rows.length) + '">합계</td>' + cols.map((c) => { const a = agg(sub(data, c)); return vd.map((m) => '<td class="n ' + vcls(m, a[m.k]) + '">' + fmtv(m, a[m.k]) + '</td>').join(''); }).join('') + '</tr>';
      holder.innerHTML = '<table class="pv">' + head1 + head2 + body + tot + '</table>' + (!lines.length ? '<div class="empty">조건에 맞는 자료가 없습니다</div>' : '');
      if (o.onCell) holder.querySelectorAll('td[data-c]').forEach((td) => { td.style.cursor = 'pointer'; td.onclick = () => o.onCell(Object.assign({}, st.f, JSON.parse(td.dataset.c))); });
      if (o.onChange) o.onChange(data, st);
    }
    function pickFilter(k) {
      const vs = allVals(k); const cur = st.f[k] || [];
      const g = HS.el('<div style="max-height:340px;overflow:auto;line-height:2">' + vs.map((v, i) => '<label style="display:block"><input type="checkbox" data-i="' + i + '"' + (!cur.length || cur.indexOf(v) >= 0 ? ' checked' : '') + '> ' + esc(label(k, v)) + '</label>').join('') + '</div>');
      HS.modal(dimOf(k).l, g, [['전체', 'all'], ['적용', 'ok', 'p']]).then((r) => { if (r === 'all') delete st.f[k]; else if (r === 'ok') { const s = vs.filter((v, i) => g.querySelector('[data-i="' + i + '"]').checked); if (s.length === vs.length || !s.length) delete st.f[k]; else st.f[k] = s; } else return; save(); });
    }
    function settingsP() {
      const all = o.dims.map((d) => d.k);
      let rows = st.rows.slice(), col = st.col;
      const g = HS.el('<div class="pset"><div class="lab">행 (▲▼ 순서 · ✕ 빼기)</div><div class="zone" id="zr"></div><div class="lab">열</div><div class="zone" id="zc"></div><div class="lab">사용 가능 항목 (누르면 행에 추가 · 길게 생각할 필요 없이 열로 보내려면 ↔)</div><div class="zone pool" id="zp"></div><div class="lab">값 (보일 항목)</div><div id="zv"></div><div class="lab">옵션</div><div><label class="ck"><input type="checkbox" id="o1"> 소계 표시</label><label class="ck"><input type="checkbox" id="o2"> 차이 있는 행만</label><label class="ck"><input type="checkbox" id="o3"> 차이 색 강조</label></div><div class="lab">정렬</div><select class="in" id="so" style="width:220px"><option value="">기본 순서</option></select></div>');
      const $ = (id) => g.querySelector('#' + id);
      const ms = o.measures.concat(o.derived || []);
      $('zv').innerHTML = ms.map((m) => '<label class="ck"><input type="checkbox" data-m="' + m.k + '"' + (st.vals.indexOf(m.k) >= 0 ? ' checked' : '') + '> ' + esc(m.l) + '</label>').join('');
      $('so').innerHTML += ms.map((m) => '<option value="' + m.k + ':desc">' + esc(m.l) + ' 큰 순</option><option value="' + m.k + ':asc">' + esc(m.l) + ' 작은 순</option>').join(''); $('so').value = st.sort || '';
      $('o1').checked = !!st.opts.sub; $('o2').checked = !!st.opts.nz; $('o3').checked = !!st.opts.color; if (!o.nzKey) $('o2').parentNode.style.display = 'none';
      const pill = (k, extra) => '<span class="pill">' + esc(dimOf(k).l) + extra + '</span>';
      const redraw = () => {
        $('zr').innerHTML = rows.map((k, i) => pill(k, ' <a data-ru="' + i + '">▲</a><a data-rd="' + i + '">▼</a><a data-rx="' + i + '">✕</a><a data-rc="' + i + '" title="열로">↔</a>')).join(' › ') || '<span class="mute">비어 있음</span>';
        $('zc').innerHTML = col ? pill(col, ' <a data-cx>✕</a>') : '<span class="mute">없음 (합계만)</span>';
        $('zp').innerHTML = all.filter((k) => rows.indexOf(k) < 0 && k !== col).map((k) => '<span class="pill o" data-add="' + k + '">' + esc(dimOf(k).l) + ' ＋</span>').join(' ') || '<span class="mute">모두 사용 중</span>';
        g.querySelectorAll('[data-ru]').forEach((a) => (a.onclick = () => { const i = +a.dataset.ru; if (i > 0) { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; redraw(); } }));
        g.querySelectorAll('[data-rd]').forEach((a) => (a.onclick = () => { const i = +a.dataset.rd; if (i < rows.length - 1) { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; redraw(); } }));
        g.querySelectorAll('[data-rx]').forEach((a) => (a.onclick = () => { rows.splice(+a.dataset.rx, 1); redraw(); }));
        g.querySelectorAll('[data-rc]').forEach((a) => (a.onclick = () => { const k = rows.splice(+a.dataset.rc, 1)[0]; if (col) rows.push(col); col = k; redraw(); }));
        const cx = g.querySelector('[data-cx]'); if (cx) cx.onclick = () => { col = null; redraw(); };
        g.querySelectorAll('[data-add]').forEach((a) => (a.onclick = () => { rows.push(a.dataset.add); redraw(); }));
      };
      redraw();
      HS.modal('⚙ 그리드 설정', g, [['기본값', 'reset'], ['보기 저장', 'save'], ['적용', 'ok', 'p']], { wide: true }).then(async (v) => {
        if (v === 'reset') { st = Object.assign({ f: {} }, JSON.parse(JSON.stringify(o.state)), { opts: Object.assign({ sub: true, nz: false, color: true }, o.state.opts || {}) }); LS(key, null); draw(); return; }
        if (v !== 'ok' && v !== 'save') return;
        if (!rows.length) rows = [all[0]];
        const vals = ms.filter((m) => g.querySelector('[data-m="' + m.k + '"]').checked).map((m) => m.k);
        Object.assign(st, { rows, col, vals: vals.length ? vals : st.vals, sort: $('so').value, opts: { sub: $('o1').checked, nz: $('o2').checked, color: $('o3').checked } });
        save(); if (v === 'save') await saveView(key, st);
      });
    }
    fb.querySelector('[data-clr]').onclick = () => { st.f = {}; save(); };
    fb.querySelector('[data-set]').onclick = settingsP;
    fb.querySelector('[data-views]').onclick = async () => {
      const vs = await loadViews(key);
      const g = HS.el('<div>' + (vs.length ? vs.map((v, i) => '<div style="display:flex;gap:8px;align-items:center;padding:4px 0"><b>' + esc(v.name) + '</b>' + (v.shared ? '<span class="tag b">전체</span>' : '<span class="tag">나만</span>') + '<span class="sp" style="flex:1"></span><button class="btn sm p" data-ap="' + i + '">적용</button>' + (v.owner === HS.me.id ? '<button class="btn sm" data-del="' + i + '">삭제</button>' : '') + '</div>').join('') : '<div class="mute">저장된 보기가 없습니다. 그리드 설정에서 \'보기 저장\'을 누르세요.</div>') + '</div>');
      HS.modal('저장된 보기', g, [['닫기', null]], { onOpen: (bg) => { bg.querySelectorAll('[data-ap]').forEach((b) => (b.onclick = () => { st = Object.assign({ f: {} }, JSON.parse(JSON.stringify(vs[+b.dataset.ap].config))); bg.remove(); save(); })); bg.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { try { await HS.db.remove('erp_views', { id: vs[+b.dataset.del].id }); b.parentNode.remove(); } catch (e) { HS.err(e); } })); } });
    };
    fb.querySelector('[data-x]').onclick = () => { HS.needXlsx(); const t = holder.querySelector('table'); const aoa = [...t.rows].map((r) => { const a = []; [...r.cells].forEach((c) => { const tx = c.textContent.replace(/소계$/, '').trim(); const n = toNum(tx); a.push(n != null ? n : tx); for (let k = 1; k < (c.colSpan || 1); k++) a.push(''); }); return a; }); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '그리드'); if (o.extraSheets) o.extraSheets(wb, filtered(), st); XLSX.writeFile(wb, (o.title || '그리드') + '_' + HS.today() + '.xlsx'); };
    draw();
    return { state: () => st, filtered, redraw: draw };
  };
})();
