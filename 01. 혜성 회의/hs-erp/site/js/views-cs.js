/* 전산자료 — 모든 재고 · 출고지시 수량의 기준
 *  · 대시보드 · WMS 재고 현황(정상창고 · 반품창고) · ERP 재고 현황(온라인 · 매장) · 출고 지시(B2B · 온라인 크리스/LX)
 *  · 재고 상세는 최신 파일만(묶음 압축) · 날짜별로는 브랜드 합계만 → 저장 공간 절약
 *  · WMS 정상창고를 올리면 → 신상품 출고 · 정리 상태 자동 갱신 · 로케이션 확인 팝업(정상팀 · 관리자)
 *  · 출고 지시 B2B → 아침 출고지시 판매 · 선지시 자동 채움 (손 수정 칸은 유지) · 온라인 → B2C 칸
 *  · 09:00까지 안 올라온 자료 → 지원팀(올리기 권한) 팝업 */
(function () {
  'use strict';
  const { esc, fmt, today, addDays } = HS;
  const C = window.HSCs; const P2 = window.HSParsers2;
  const SRC = [ // [kind, sub, 이름, 파일]
    ['wms', '정상창고', 'WMS 재고 · 정상창고', 'WMS 재고현황 (창고 칸으로 자동 구분)'], ['wms', '반품창고', 'WMS 재고 · 반품창고', '같은 파일 (창고 칸)'],
    ['erp', '온라인', 'ERP 재고 · 온라인', '화주 ERP 재고현황'], ['erp', '매장', 'ERP 재고 · 매장', '화주 ERP 재고현황'],
  ];
  const kd = () => today(); // 한국 날짜
  const atDay = (at) => (at ? HS.ymd(new Date(at)) : '');
  const hm = (at) => (at ? new Date(at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
  const brandOf = (t, style) => { const s = String(t || '').trim(); return (s && HS.brandOf(s)) || (s && s.length <= 2 && HS.brandOf(s + ' (')) || (style && HS.brandOf(String(style)[0] + ' (')) || s || null; };
  const sgn = (v) => (v == null ? '<span class="mute">-</span>' : '<span class="' + (v > 0 ? 'pos' : v < 0 ? 'neg' : 'mute') + '">' + (v > 0 ? '+' : '') + fmt(v) + '</span>');
  async function latestFiles() { const f = await HS.db.list('erp_cs_file', { order: ['at', false], limit: 300 }).catch(() => []); const L = {}; f.forEach((x) => { const k = x.kind + '|' + x.sub; if (!L[k]) L[k] = x; }); return L; }
  // 상세 묶음: 바뀐 묶음만 내려받고 나머지는 이 브라우저에 보관 (Supabase 무료 전송량 5GB/월 아끼기)
  const PC = new Map(); let idb = null;
  const IDB = () => idb || (idb = new Promise((res) => { try { const r = indexedDB.open('hs-cs', 1); r.onupgradeneeded = () => r.result.createObjectStore('p'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (e) { res(null); } }));
  const idbGet = async (k) => { const d = await IDB(); if (!d) return null; return new Promise((res) => { try { const q = d.transaction('p').objectStore('p').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } }); };
  const idbPut = async (k, v) => { const d = await IDB(); if (!d) return; try { d.transaction('p', 'readwrite').objectStore('p').put(v, k); } catch (e) { /* 무시 */ } };
  async function partsQ(q) {
    const meta = await HS.db.list('erp_cs_part', Object.assign({}, q, { select: 'kind,sub,part,brand,at', order: ['part'] })).catch(() => []);
    const ck = (m) => m.kind + '|' + m.sub + '|' + m.part + '|' + m.at; const out = new Array(meta.length); const miss = [];
    await Promise.all(meta.map(async (m, i) => { const k = ck(m); let v = PC.get(k); if (!v) { v = await idbGet(k); if (v) PC.set(k, v); } if (v) out[i] = Object.assign({}, m, { rows: v }); else miss.push(i); }));
    for (let j = 0; j < miss.length; j += 20) {
      const ids = miss.slice(j, j + 20); const got = await HS.db.list('erp_cs_part', { eq: Object.assign({ kind: q.eq.kind }, q.eq.sub ? { sub: q.eq.sub } : {}), in: { part: ids.map((i) => meta[i].part) } }).catch(() => []);
      ids.forEach((i) => { const g = got.find((x) => x.part === meta[i].part && x.sub === meta[i].sub); if (g) { out[i] = g; const k = ck(g); PC.set(k, g.rows || []); idbPut(k, g.rows || []); } });
    }
    return out.filter(Boolean);
  }
  async function loadParts(kind, sub) { return (await partsQ({ eq: { kind, sub } })).flatMap((x) => x.rows || []); }
  HS.csPartsQ = partsQ;
  HS.csLatest = latestFiles; HS.csParts = loadParts;
  // 그날(이하) 마지막으로 등록한 재고 합계 (팀 화면 · 월간 회의) → { d, qty, sku } 또는 null
  HS.csStockAt = async (kind, sub, d) => {
    const rows = await HS.db.list('erp_cs_daily', { eq: { kind, sub }, lte: { d }, order: ['d', false], limit: 400 }).catch(() => []);
    if (!rows.length) return null; const last = rows[0].d; const L = rows.filter((r) => r.d === last);
    return { d: last, qty: L.reduce((a, r) => a + (+r.qty || 0), 0), sku: L.reduce((a, r) => a + (+r.sku || 0), 0) };
  };
  // 팀 ↔ 재고 짝 (정상팀 = WMS 정상창고 · 이월팀 = WMS 반품창고 · 온라인팀 = ERP 온라인)
  HS.TEAM_STOCK = { 정상1팀: ['wms', '정상창고', '정상창고 재고 (WMS)'], 이월소터팀: ['wms', '반품창고', '반품창고 재고 (WMS)'], 온라인팀: ['erp', '온라인', '온라인 재고 (ERP)'] };
  HS.STOCK_ALL = [['wms', '정상창고', 'WMS 정상창고'], ['wms', '반품창고', 'WMS 반품창고'], ['erp', '매장', 'ERP 매장'], ['erp', '온라인', 'ERP 온라인']];
  // 팀 화면 맨 위 재고 요약 칸
  HS.teamStockStrip = async (team) => {
    const m = HS.TEAM_STOCK[team]; if (!m) return null;
    const now = await HS.csStockAt(m[0], m[1], today()); const box = HS.el('<a class="card stk" href="#/cs?k=' + m[0] + '&t=조회"></a>');
    if (!now) { box.innerHTML = '<div class="l">' + esc(m[2]) + '</div><div class="v" style="font-size:14px">자료 없음</div><div class="s">전산자료에서 재고를 올리면 여기 나옵니다</div>'; return box; }
    const pe = new Date(now.d + 'T00:00:00'); pe.setDate(0); const prev = await HS.csStockAt(m[0], m[1], HS.ymd(pe));
    const ch = prev && prev.qty ? ((now.qty / prev.qty - 1) * 100) : null;
    box.innerHTML = '<div class="l">' + esc(m[2]) + ' →</div><div class="v">' + fmt(now.qty) + '</div><div class="s">SKU ' + fmt(now.sku) + ' · ' + esc(now.d.slice(5).replace('-', '/')) + ' 기준' + (ch == null ? '' : ' · 전 달 말 <span class="' + (ch >= 0 ? 'pos' : 'neg') + '">' + (ch >= 0 ? '+' : '') + ch.toFixed(1) + '%</span>') + '</div>';
    return box;
  };

  // ================= 올리기 (여러 파일 · 종류 자동 · 바꿀 수 있음) =================
  const FK = (k) => { const [a, b] = String(k || '').split(':'); return a === 'wms' ? 'cs_wms' : a === 'erp' ? 'cs_erp' : b === 'B2B' ? 'cs_order' : b === '크리스' ? 'cs_bucket' : b === 'LX' ? 'cs_sabang' : b === '배분LIST' ? 'cs_alloc' : ''; };
  const FKEYS = ['cs_wms', 'cs_erp', 'cs_alloc', 'cs_bucket', 'cs_sabang'];
  const unknownNote = (hint, rows) => { const key = hint.kind === 'order' ? FK('order:' + (hint.sub || 'B2B')) : FK(hint.kind); const m = C.missing(rows, []); return '<div class="neg" style="font-size:11.5px;margin-top:3px;white-space:normal">종류를 알아보지 못했습니다 · ' + (key ? HS.fmtMissing(key, rows).replace(/<a class="fmtl"[\s\S]*$/, '') : '파일의 칸: ' + esc(m.names.join(', ') || '(비어 있음)')) + ' — 종류를 직접 고르거나 오른쪽 양식을 확인하세요</div>'; };
  const KIND_OPTS = [['wms', 'WMS 재고 (창고 자동)'], ['wms:정상창고', 'WMS 재고 · 정상창고'], ['wms:반품창고', 'WMS 재고 · 반품창고'], ['erp', 'ERP 재고 (채널 자동)'], ['erp:온라인', 'ERP 재고 · 온라인'], ['erp:매장', 'ERP 재고 · 매장'], ['', '올리지 않음']];
  HS.csUpload = async (hint) => {
    hint = hint || {};
    const f = HS.el('<div><div class="drop" id="cd" style="padding:20px;text-align:center"><b>전산 자료 엑셀 놓기</b> (또는 눌러서 고르기 · 여러 파일 가능)<div class="mute" style="font-size:12px;margin-top:4px">WMS 재고 · ERP 재고 · 배분LIST · 버킷 어드민 · 사방넷 — 종류를 자동으로 알아봅니다 (틀리면 아래에서 바꾸기)</div><div style="margin-top:6px;font-size:12px">양식 보기: ' + FKEYS.map((k) => HS.fmtLink(k, HS.FMT[k].t)).join(' &nbsp; ') + '</div><input type="file" multiple accept=".xlsx,.xls,.csv" class="hide"></div>' +
      '<div class="form" style="margin-top:10px;max-width:420px"><label class="f">출고 지시 날짜 <span class="mute">(재고는 올린 날 기준)</span><input class="in" type="date" id="od"></label></div><div id="cr" style="margin-top:8px"></div><div id="cp" style="margin-top:8px"></div></div>');
    f.querySelector('#od').value = hint.d || kd();
    const dz = f.querySelector('#cd'), fi = dz.querySelector('input'), cr = f.querySelector('#cr'); let items = [];
    const handle = async (files) => {
      cr.innerHTML = '<div class="empty">읽는 중…</div>'; items = [];
      for (const file of files) {
        try {
          HS.needXlsx(); const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellFormula: false, cellHTML: false, cellText: false });
          for (const sn of wb.SheetNames) {
            const ws = wb.Sheets[sn]; if (!ws || !ws['!ref']) continue;
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }); if (rows.length < 2) continue;
            let kind = ''; if (P2.isSabang(rows)) kind = 'order:LX'; else { const d = C.detect(rows); kind = d === 'alloc' ? 'order:배분LIST' : d === 'wms' ? 'wms' : d === 'erp' ? 'erp' :  d === 'order' ? '' : d === 'online' || C.parseOnline(rows) ? 'order:크리스' : ''; }
            // 화면(탭)에서 올렸고 파일에 창고/채널 구분 칸이 없으면 → 그 탭으로
            if ((kind === 'wms' || kind === 'erp') && hint.kind === kind && hint.sub && hint.sub !== '합계') { const h = C.header(rows, ['style', 'cur']); if (h && h.ix[kind === 'wms' ? 'wh' : 'ch'] == null) kind = kind + ':' + hint.sub; }
            if (/^order/.test(kind)) kind = ''; // 출고 지시 자료(배분LIST · 버킷 · 사방넷)는 전산자료에서 쓰지 않음 (아침 출고지시 취합 화면에서 올림)
            items.push({ file: file.name, sheet: sn, rows, kind, ws });
          }
        } catch (e) { items.push({ file: file.name, sheet: '-', rows: [], kind: '', err: e.message }); }
      }
      draw();
    };
    const draw = () => {
      if (!items.length) { cr.innerHTML = '<div class="lock">인식된 시트가 없습니다</div>'; return; }
      cr.innerHTML = '<div class="tw"><table class="no-tools"><tr><th>파일 · 시트</th><th class="n">줄</th><th>종류</th><th></th></tr>' + items.map((x, i) => '<tr><td>' + esc(x.file) + ' <span class="mute">· ' + esc(x.sheet) + '</span>' + (x.err ? ' <span class="neg">' + esc(x.err) + '</span>' : '') + (!x.kind && !x.err && x.rows.length ? unknownNote(hint, x.rows) : '') + '</td><td class="n">' + fmt(Math.max(0, x.rows.length - 1)) + '</td><td><select class="in" data-i="' + i + '" style="height:30px;padding:2px 6px">' + KIND_OPTS.map(([v, l]) => '<option value="' + v + '"' + (v === x.kind ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></td><td>' + (FK(x.kind) ? HS.fmtLink(FK(x.kind), '양식') : '') + '</td></tr>').join('') + '</table></div>';
      cr.querySelectorAll('select').forEach((s) => (s.onchange = () => { items[+s.dataset.i].kind = s.value; draw(); }));
    };
    dz.onclick = (e) => { if (e.target !== fi) fi.click(); }; fi.onchange = () => handle([...fi.files]);
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over'); dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); handle([...e.dataTransfer.files]); };
    let done = [];
    const ok = await HS.modal('전산자료 올리기', f, [['닫기', null], ['올리기', true, 'p']], { wide: true, onOk: async (v, bg) => {
      const use = items.filter((x) => x.kind); if (!use.length) throw new Error('올릴 파일을 놓아 주세요');
      const cp = bg.querySelector('#cp'); const od = bg.querySelector('#od').value || kd(); bg.querySelectorAll('.mf .btn').forEach((b) => (b.disabled = true)); done = [];
      try {
        for (const x of use) {
          cp.innerHTML = '<div class="mute">' + esc(x.file) + ' 올리는 중…</div>';
          const [kind, sub] = x.kind.split(':');
          if (kind === 'wms' || kind === 'erp') {
            const p = C.parseStock(x.rows, kind, sub || null); if (!p) { const m = C.missing(x.rows, kind === 'erp' ? ['brand', 'cur', ['scode', 'sname']] : ['style', 'cur']); throw new Error(x.file + ': ' + (m.miss.length ? m.miss.map((q) => ({ style: '품번', cur: '현재고', brand: '소속브랜드', scode: '매장코드' })[Array.isArray(q) ? q[0] : q]).join(' · ') + ' 칸이 없습니다' : '칸을 읽지 못했습니다') + ' · 파일의 칸: ' + m.names.join(', ') + ' (양식 보기에서 확인)'); }
            // 파일에 든 브랜드만 바꿔 넣음 (브랜드별로 나눠 받은 파일 여러 개 → 합쳐짐)
            const fb = [...new Set(Object.values(p.subs).flat().map((l) => l[0]))];
            const all = sub ? [sub] : (kind === 'wms' ? (p.hasWh ? ['정상창고', '반품창고'] : Object.keys(p.subs)) : (p.hasCh ? ['온라인', '매장'] : Object.keys(p.subs)));
            for (const s of all) { const t = await saveStock(kind, s, p.subs[s] || [], x.file, fb); if (t) done.push(t); }
            if (kind === 'wms') await HS.styLearn(p.learn, 'WMS 재고현황 · ' + x.file);
          } else if (sub === '배분LIST') done.push(await saveAlloc(x, od));
          else if (sub === 'B2B') done.push(await saveOrderB2B(x, od));
          else done.push(await saveOnline(x, sub, od));
        }
      } catch (e) { bg.querySelectorAll('.mf .btn').forEach((b) => (b.disabled = false)); throw e; }
      HS.toast(done.join(' · '), 'ok');
    } });
    if (ok && done.some((t) => /정상창고/.test(t))) { try { const n = await HS.csNpSync(await loadParts('wms', '정상창고')); if (n) HS.toast('신상품 출고 · 정리 상태 ' + n + '개 품번 갱신', 'ok'); } catch (e) { console.warn('np sync', e); } }
    if (ok) { HS.route(); if (done.some((t) => /정상창고/.test(t))) setTimeout(() => HS.locPopup(true), 800); }
  };
  async function saveStock(kind, sub, lines, file, brands) {
    const g = {}; lines.forEach((l) => (g[l[0]] || (g[l[0]] = [])).push(l));
    const parts = Object.entries(g).map(([raw, rows]) => { const b = C.stockByBrand(rows, brandOf)[0]; return { brand: raw, rows, stat: { name: b.brand, qty: b.qty, sku: b.sku, styles: b.styles, noloc: kind === 'wms' && sub !== '반품창고' ? b.noloc : 0, noloc_qty: kind === 'wms' && sub !== '반품창고' ? b.noloc_qty : 0, out: b.out_qty, fut: rows.reduce((a, x) => a + (x[7] || 0), 0), neg: rows.filter((x) => x[5] < 0).length, neg_qty: rows.reduce((a, x) => a + (x[5] < 0 ? x[5] : 0), 0), file, by_name: HS.me && HS.me.name } }; });
    const qty = lines.reduce((a, x) => a + x[5], 0);
    const summary = { sku: lines.length, styles: new Set(lines.map((x) => x[1])).size, noloc: parts.reduce((a, b) => a + b.stat.noloc, 0), noloc_qty: parts.reduce((a, b) => a + b.stat.noloc_qty, 0), out: parts.reduce((a, b) => a + b.stat.out, 0), fut: parts.reduce((a, b) => a + b.stat.fut, 0), brands: parts.map((b) => b.stat.name) };
    await HS.db.rpc('erp_cs_merge', { p_kind: kind, p_sub: sub, p_brands: brands || Object.keys(g), p_parts: parts, p_file: file, p_rows: lines.length, p_qty: qty, p_summary: summary });
    if (!lines.length) return '';
    return (kind === 'wms' ? 'WMS ' : 'ERP ') + sub + ' ' + parts.map((b) => HS.bname(b.stat.name)).join(' · ') + ' ' + fmt(lines.length) + '줄';
  }
  // ---------- 배분LIST (17~18시 당일 마감) → 날짜별 브랜드 × 의뢰구분 · 일일 마감 B2B 칸 ----------
  const ALLOC_FILL = { first_qty: ['1'], order_qty: ['2', '3', '4', '5'], full_qty: ['6'], online_order: ['7'] }; // 일일 마감 B2B 칸 ← 의뢰구분
  HS.ALLOC_FILL = ALLOC_FILL;
  const allocBrand = (style) => (style && HS.brandOf(String(style)[0] + ' (')) || '미등록 ' + String(style || '?')[0]; // 배분LIST에는 브랜드 칸이 없음 → 품번 첫 글자 (1=PING · L=LYNX …)
  async function saveAlloc(x, od) {
    const p = C.parseAlloc(x.rows, { d: od }); if (!p) throw new Error(x.file + ': ' + HS.fmtMissing('cs_alloc', x.rows).replace(/<[^>]+>/g, '').replace(/📄.*$/, '') + ' (양식 보기에서 확인)');
    if (!p.lines.length) throw new Error(x.file + ': 보충수량이 있는 줄이 없습니다');
    const A = {}; const unreg = {}; const PB = {};
    for (const l of p.lines) {
      const b = allocBrand(l[0]); if (/^미등록/.test(b)) unreg[b] = (unreg[b] || 0) + 1; l.push(b);
      for (const kk of [l[6], 'all']) { const key = l[7] + '|' + b + '|' + kk; const o = A[key] || (A[key] = { d: l[7], brand: b, k: kk, qty: 0, st: new Set(), lines: 0 }); o.qty += l[5]; if (l[1]) o.st.add(l[1]); o.lines++; }
      const pk = l[7] + '|' + b; (PB[pk] || (PB[pk] = { d: l[7], brand: b, rows: [] })).rows.push(l);
    }
    const rows = Object.values(A).map((o) => ({ d: o.d, brand: o.brand, k: o.k, qty: o.qty, stores: p.noStore ? null : o.st.size, lines: o.lines }));
    const days = Object.keys(p.days).sort(); const qty = p.lines.reduce((a, l) => a + l[5], 0); const brands = [...new Set(p.lines.map((l) => l[10]))];
    // 브랜드 단위로 바꿔 넣기 (같은 날짜 다른 브랜드는 그대로) — 마감된 날짜는 막힘
    await HS.db.rpc('erp_cs_alloc_merge', { p_days: days, p_brands: brands, p_rows: rows, p_parts: Object.values(PB), p_file: x.file, p_lines: p.lines.length, p_qty: qty, p_summary: { days: p.days, skipped: p.skipped, unknown: p.unknown, unreg, brands, noStore: p.noStore || undefined, raw: p.noStore ? p.raw : undefined } });
    const msgs = [];
    for (const d of days) msgs.push(await fillDaily(d, rows.filter((r) => r.d === d)));
    if (Object.keys(p.unknown).length) HS.toast('⚠ 모르는 의뢰구분 ' + Object.entries(p.unknown).map(([k, n]) => '"' + k + '" ' + n + '줄').join(', ') + ' → "기타"로 넣었습니다', 'err');
    if (Object.keys(unreg).length) HS.toast('⚠ 등록 안 된 품번 코드: ' + Object.entries(unreg).map(([k, n]) => k.replace('미등록 ', '') + ' ' + n + '줄').join(', ') + ' — 설정 › 브랜드에 코드를 넣으면 자동으로 들어갑니다', 'err');
    if (p.noStore) HS.toast('ℹ ' + x.file + ': 매장코드 · 매장명 칸 없음 → 매장 수는 표시하지 않습니다 · 같은 품번 · 색상 · 사이즈 줄을 합쳐 ' + fmt(p.raw) + '줄 → ' + fmt(p.lines.length) + '줄로 저장', 'ok');
    return '배분LIST ' + days.map((d) => d.slice(5)).join(', ') + ' · ' + brands.filter((b) => !/^미등록/.test(b)).map(HS.bname).join(' · ') + ' ' + fmt(qty) + '개' + (msgs.filter(Boolean).length ? ' · ' + msgs.filter(Boolean).join(' · ') : '');
  }
  // 일일 마감 B2B: 초도출고 · 판매분지시 · 완불 · 온라인지시 (손으로 고친 칸은 그대로 · 파일 값은 _src 에)
  async function fillDaily(d, rows) {
    if (!HS.can('daily', 'create') && !HS.can('daily', 'edit')) return '일일 마감 권한 없음 (채우지 않음)';
    const lk = (await HS.db.list('erp_locks', { eq: { lock_date: d, module: 'daily' } }).catch(() => [])).find((x) => x.locked);
    if (lk) { HS.toast(d + ' 일일 마감이 확정되어 B2B 칸은 채우지 않았습니다 (마감 해제 후 다시 올리기)', 'err'); return '일일 마감 확정됨'; }
    const by = {}; rows.filter((r) => r.brand && !/^미등록/.test(r.brand) && r.k !== 'all').forEach((r) => { (by[r.brand] || (by[r.brand] = {}))[r.k] = +r.qty || 0; });
    const old = await HS.db.list('erp_daily_records', { eq: { rec_date: d, section: 'b2b' } }).catch(() => []); const om = {}; old.forEach((r) => (om[r.rec_key] = r));
    const up = []; let man = 0;
    const keys = new Set(Object.keys(by)); // 이 파일에 든 브랜드만 (다른 브랜드 칸은 그대로)
    for (const b of keys) {
      const o = om[b]; const data = Object.assign({}, o ? o.data : {}); const m = (data._man || []).slice(); const src = {};
      for (const [f, ks] of Object.entries(ALLOC_FILL)) { const v = by[b] ? ks.reduce((a, k) => a + (by[b][k] || 0), 0) : null; src[f] = v; if (m.indexOf(f) >= 0) { man++; continue; } data[f] = v; }
      data._src = by[b] ? src : null; data._man = by[b] ? m : []; data._src_at = new Date().toISOString();
      up.push({ rec_date: d, section: 'b2b', rec_key: b, data });
    }
    if (up.length) await HS.db.upsert('erp_daily_records', up);
    return '일일 마감 ' + d.slice(5) + ' B2B ' + Object.keys(by).length + '개 브랜드' + (man ? ' (손 수정 ' + man + '칸 유지)' : '');
  }
  async function saveOrderB2B(x, d) {
    const p = C.parseOrder(x.rows); if (!p) throw new Error(x.file + ': 브랜드 · 지시수량 칸을 찾지 못했습니다');
    const by = {}; for (const b in p.by) { const n = brandOf(b) || b; const o = by[n] || (by[n] = { sale: 0, pre: 0 }); o.sale += p.by[b].sale; o.pre += p.by[b].pre; }
    const old = await HS.db.list('erp_cs_order', { eq: { d, sub: 'B2B' } });
    const rows = Object.entries(by).map(([brand, o]) => ({ d, sub: 'B2B', brand, sale: o.sale, pre: p.hasKind ? o.pre : null, qty: o.sale + o.pre })).concat(old.filter((r) => !by[r.brand]).map((r) => ({ d, sub: 'B2B', brand: r.brand, sale: null, pre: null, qty: null })));
    await HS.db.upsert('erp_cs_order', rows);
    await HS.db.insert('erp_cs_file', { kind: 'order', sub: 'B2B', ref_date: d, file_name: x.file, rows: p.lines, qty: rows.reduce((a, r) => a + (+r.qty || 0), 0), summary: { brands: Object.keys(by).length, hasKind: p.hasKind }, by_name: HS.me.name });
    // 아침 출고지시: 파일 값으로 채움 (손으로 고친 칸은 그대로 · 파일 값만 기록)
    const cur = await HS.db.list('erp_orders', { eq: { rec_date: d } }); const ex = {}; cur.forEach((r) => (ex[r.section + '|' + r.brand] = r));
    const up = [];
    for (const [brand, o] of Object.entries(by)) for (const sec of p.hasKind ? ['sale', 'pre'] : ['sale']) {
      const v = o[sec]; const e = ex[sec + '|' + brand];
      up.push(e && e.manual ? { rec_date: d, section: sec, brand, qty: e.qty, src_qty: v, manual: true } : { rec_date: d, section: sec, brand, qty: v, src_qty: v, manual: false });
    }
    if (up.length) { try { await HS.db.upsert('erp_orders', up); } catch (e) { HS.toast('출고 지시는 저장했지만 아침 출고지시 채우기 실패: ' + e.message, 'err'); } }
    return 'B2B 출고 지시 ' + d.slice(5) + ' · ' + Object.keys(by).length + '개 브랜드';
  }
  async function saveOnline(x, sub, d) {
    let r = P2.isSabang(x.rows) ? P2.parseSabang(x.ws, HS.brandOf, HS.ownerOf) : null; let by;
    if (r) by = r.brands; else { const g = C.parseOnline(x.rows); if (!g) throw new Error(x.file + ': 브랜드 · 수량 칸을 찾지 못했습니다'); by = {}; for (const b in g.by) { const n = brandOf(b) || b; const o = by[n] || (by[n] = { cnt: 0, qty: 0 }); o.cnt += g.by[b].cnt; o.qty += g.by[b].qty; } }
    const rows = Object.entries(by).map(([brand, o]) => ({ d, sub, brand, cnt: o.cnt, qty: o.qty }));
    await HS.db.upsert('erp_cs_order', rows);
    const tq = rows.reduce((a, b) => a + (+b.qty || 0), 0), tc = rows.reduce((a, b) => a + (+b.cnt || 0), 0);
    await HS.db.insert('erp_cs_file', { kind: 'order', sub, ref_date: d, file_name: x.file, rows: rows.length, qty: tq, summary: { cnt: tc }, by_name: HS.me.name });
    // 아침 출고지시 B2C 칸 (브랜드 · 화주 합계) — 이름 · 전화 · 주소는 저장하지 않음
    try { await HS.db.upsert('erp_orders', rows.map((b) => ({ rec_date: d, section: 'b2c', brand: b.brand, cnt: b.cnt, qty: b.qty })).concat([{ rec_date: d, section: 'b2c_ch', brand: sub, cnt: r ? (r.owners[sub] || { cnt: tc }).cnt : tc, qty: tq }])); } catch (e) { HS.toast('아침 출고지시 B2C 채우기 실패: ' + e.message, 'err'); }
    return '온라인 ' + sub + ' ' + d.slice(5) + ' · ' + fmt(tq) + '개';
  }

  // ================= 신상품: WMS 정상창고로 출고 · 재고 · 정리 상태 갱신 (따로 올리지 않아도 됨) =================
  HS.csNpSync = async (lines) => {
    if (!HS.can('newprod', 'create') && !HS.can('newprod', 'edit')) return 0;
    const ST = {}; for (const x of lines) { const o = ST[x[1]] || (ST[x[1]] = { out: 0, stock: 0, loc: 0 }); o.out += x[6]; o.stock += x[5]; if (x[4]) o.loc += x[5]; }
    const cs = HS.curSeason ? HS.curSeason() : today().slice(0, 4) + (+today().slice(5, 7) >= 7 ? 'FW' : 'SS'); const y = +cs.slice(0, 4); const ps = /FW/.test(cs) ? y + 'SS' : (y - 1) + 'FW';
    let n = 0;
    for (const season of [cs, ps]) {
      const rows = await HS.db.list('erp_np_style', { eq: { season } }).catch(() => []); const up = [];
      for (const r of rows) { const t = ST[r.style]; if (!t) continue; if (+r.out_qty === t.out && +r.stock === t.stock && +r.stock_loc === t.loc) continue; const nr = P2.npStatus(Object.assign({}, r, { out_qty: t.out, stock: t.stock, stock_loc: t.loc, flags: (r.flags || []).slice() })); delete nr.updated_at; up.push(nr); }
      if (up.length) { await HS.db.upsert('erp_np_style', up); n += up.length; }
    }
    return n;
  };

  // ================= 대시보드 =================
  HS.view('csdash', {
    title: '전산자료 · 대시보드', perm: 'csdata',
    async render(body, p, tools) {
      const canU = HS.can('csdata', 'create');
      if (canU) { const b = HS.el('<button class="btn p" id="csup">⬆ 여러 파일 한 번에 올리기</button>'); b.onclick = () => HS.csUpload(); tools.appendChild(b); }
      const d = kd();
      const [L, daily, ord, cnt, alc, acl] = await Promise.all([latestFiles(), HS.db.list('erp_cs_daily', { gte: { d: addDays(d, -8) }, lte: { d } }).catch(() => []), HS.db.list('erp_cs_order', { eq: { d } }).catch(() => []), HS.db.list('erp_cnt', {}).catch(() => []), HS.db.list('erp_cs_alloc', { gte: { d: addDays(d, -7) }, lte: { d } }).catch(() => []), HS.allocClose(d)]);
      const dates = [...new Set(daily.map((x) => x.d))].sort(); const lastD = (kind, sub) => dates.filter((x) => daily.some((y) => y.d === x && y.kind === kind && y.sub === sub)).pop();
      const tot = (kind, sub, dd, k) => daily.filter((x) => x.d === dd && x.kind === kind && x.sub === sub).reduce((a, x) => a + (+x[k || 'qty'] || 0), 0);
      const todayOk = (k) => L[k] && atDay(L[k].at) === d;
      const st = (k) => (L[k] ? (todayOk(k) ? '<span class="pos" style="font-size:11.5px">' + esc(hm(L[k].at)) + ' ✔</span>' : '<span class="wa3" style="font-size:11.5px">' + esc(hm(L[k].at)) + ' ⚠</span>') : '<span class="mute" style="font-size:11.5px">없음</span>');
      const wd = lastD('wms', '정상창고'), rd = lastD('wms', '반품창고'), od2 = lastD('erp', '온라인'), md = lastD('erp', '매장');
      const oq = (s) => ord.filter((r) => r.sub === s).reduce((a, r) => a + (+r.qty || 0), 0);
      const card = (t, k, rows, foot) => '<div class="csrc"><h4>' + t + '<span class="sp"></span>' + k + '</h4>' + rows.map(([l, v, c]) => '<div class="row"><span' + (c ? ' class="' + c + '"' : '') + '>' + l + '</span><b' + (c ? ' class="' + c + '"' : '') + '>' + v + '</b></div>').join('') + (foot ? '<div class="mute" style="font-size:11px;margin-top:4px">' + foot + '</div>' : '') + '</div>';
      const ad = alc.map((x) => x.d).sort().pop(); const AD = alc.filter((x) => x.d === ad); const at0 = AD.find((x) => x.brand === '' && x.k === 'all');
      const lastCnt = cnt.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
      body.innerHTML = '';
      body.appendChild(HS.el('<div class="cs4" style="grid-template-columns:repeat(3,minmax(0,1fr))">' +
        card('<a href="#/cs?k=wms">WMS 재고 현황</a>', st('wms|정상창고'), [['정상창고', wd ? fmt(tot('wms', '정상창고', wd)) : '-'], ['반품창고', rd ? fmt(tot('wms', '반품창고', rd)) : '-'], ['로케이션 없음', wd ? fmt(tot('wms', '정상창고', wd, 'noloc')) + ' SKU' : '-', 'neg']], '한 파일 · 창고 칸으로 자동 구분') +
        card('<a href="#/cs?k=erp">ERP 재고 현황</a>', st('erp|매장'), [['온라인', od2 ? fmt(tot('erp', '온라인', od2)) : '-'], ['매장', md ? fmt(tot('erp', '매장', md)) : '-'], ['합계 (매장 + 온라인)', od2 || md ? fmt((od2 ? tot('erp', '온라인', od2) : 0) + (md ? tot('erp', '매장', md) : 0)) : '-']]) +
        card('<a href="#/count">재고 실사</a>', '<span class="mute" style="font-size:11.5px">' + esc(lastCnt ? (lastCnt.status || '') : '') + '</span>', [['최근 실사', lastCnt ? esc(lastCnt.name || lastCnt.title || ('#' + lastCnt.id)) : '없음'], ['전산 기준', 'WMS 재고 현황']]) + '</div>'));
      // 오늘 올릴 자료
      const c1 = HS.el('<div class="card" style="margin-top:14px"><h3>오늘 올릴 전산 자료 <small>각 화면에서 따로 올리거나 [여러 파일 한 번에 올리기] · 같은 날 여러 번 올리면 마지막 파일 기준</small></h3><div class="tw"><table class="no-tools"><tr><th>자료</th><th>올리는 파일</th><th>마지막 업데이트</th><th>올린 사람</th><th class="n">줄</th><th></th></tr>' +
        SRC.map(([k, s, l, fl, due]) => { const x = L[k + '|' + s]; const early = due && new Date().getHours() < due && !todayOk(k + '|' + s) && !(s === '배분LIST' && acl && acl.closed_at); return '<tr><td><b>' + esc(l) + '</b></td><td class="mute">' + esc(fl) + ' ' + HS.fmtLink(k === 'wms' ? 'cs_wms' : k === 'erp' ? 'cs_erp' : FK('order:' + s), '양식') + '</td><td>' + (early ? '<span class="mute">' + (due - 1) + '~' + due + '시 예정</span>' : x ? (todayOk(k + '|' + s) ? '<span class="pos">' + esc(hm(x.at)) + ' ✔</span>' : '<span class="wa3">' + esc(hm(x.at)) + ' ⚠ 오늘 아직</span>') : '<span class="neg">없음</span>') + '</td><td>' + esc((x && x.by_name) || '') + '</td><td class="n">' + (x ? fmt(x.rows) : '-') + '</td><td>' + (canU && s !== '반품창고' ? '<button class="btn sm" data-k="' + k + '" data-s="' + s + '">올리기</button>' : '') + '</td></tr>'; }).join('') + '</table></div>' +
        '<div class="mute" style="font-size:11.5px;margin-top:8px;line-height:1.7">· 재고 · 출고지시 수량은 이 전산 자료 기준 · 원가 · KPI · 일일 마감 · 물동량은 지금 기준 유지 (전산과 다르면 "전산 대비 차이" 표시)<br>· 신상품 정보 · 입고 · 반품 입고 파일은 지금처럼 각 화면에서 · <b>신상품 출고 · 정리 상태는 WMS 정상창고를 올리면 자동 갱신</b><br>· 사방넷 · 버킷 어드민의 이름 · 전화 · 주소는 계산에만 쓰고 저장하지 않음</div></div>');
      c1.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => HS.csUpload({ kind: b.dataset.k, sub: b.dataset.s })));
      // 브랜드별 추이
      if (wd) {
        const prev = dates.filter((x) => x < wd && daily.some((y) => y.d === x && y.kind === 'wms' && y.sub === '정상창고')); const p1 = prev[prev.length - 1], p7 = prev.find((x) => x <= addDays(wd, -7)) || prev[0];
        const q = (kind, sub, dd, b) => { const r = daily.find((x) => x.d === dd && x.kind === kind && x.sub === sub && x.brand === b); return r ? +r.qty : null; };
        const bs = [...new Set(daily.filter((x) => x.kind === 'wms' && x.sub === '정상창고' && x.d === wd).map((x) => x.brand))]; const bo = (n) => { const x = (HS.cache.brandMap || {})[n]; return x ? +x.sort || 0 : 999; }; bs.sort((a, b) => bo(a) - bo(b));
        body.appendChild(HS.el('<div class="card" style="margin-top:14px"><h3>브랜드별 추이 <small>날짜별 브랜드 합계만 보관 (품목 상세는 최근 파일만 → 저장 공간 절약) · WMS ' + esc(wd.slice(5)) + ' 기준</small></h3><div class="tw"><table><tr><th>브랜드</th><th class="n">WMS 정상창고</th><th class="n">전날 대비</th><th class="n">7일 전 대비</th><th class="n">로케이션 없음</th><th class="n">ERP 온라인</th><th class="n">ERP 매장</th></tr>' +
          bs.map((b) => { const v = q('wms', '정상창고', wd, b); const a = p1 ? q('wms', '정상창고', p1, b) : null, s7 = p7 ? q('wms', '정상창고', p7, b) : null; const nl = (daily.find((x) => x.d === wd && x.kind === 'wms' && x.sub === '정상창고' && x.brand === b) || {}).noloc;
            return '<tr><td>' + esc(HS.bname(b)) + '</td><td class="n"><b>' + fmt(v) + '</b></td><td class="n">' + (a == null ? '<span class="mute">-</span>' : sgn(v - a)) + '</td><td class="n">' + (s7 == null || p7 === p1 ? '<span class="mute">-</span>' : sgn(v - s7)) + '</td><td class="n' + (nl ? ' neg' : '') + '">' + (nl ? fmt(nl) : '-') + '</td><td class="n">' + (od2 && q('erp', '온라인', od2, b) != null ? fmt(q('erp', '온라인', od2, b)) : '-') + '</td><td class="n">' + (md && q('erp', '매장', md, b) != null ? fmt(q('erp', '매장', md, b)) : '-') + '</td></tr>'; }).join('') + '</table></div></div>'));
      }
      body.appendChild(c1); // 오늘 올릴 전산 자료 — 맨 아래
    },
  });

  // ================= WMS 재고 · ERP 재고 · 출고 지시 =================
  const TABS = { wms: [['정상창고', '정상창고'], ['반품창고', '반품창고'], ['조회', '재고 조회']], erp: [['합계', '합계 (매장 + 온라인)'], ['매장', '매장'], ['온라인', '온라인'], ['조회', '재고 조회']], order: [['배분LIST', '배분LIST (당일 마감)'], ['온라인', '온라인 (크리스 · LX)'], ['조회', '지시 조회']] };
  const TITLE = { wms: 'WMS 재고 현황', erp: 'ERP 재고 현황', order: '출고 지시' };
  HS.view('cs', {
    title: '전산자료', perm: 'csdata',
    async render(body, p, tools) {
      const k = TABS[p.k] && p.k !== 'order' ? p.k : 'wms'; /* 출고 지시 화면은 폐기 (주소로 들어와도 WMS 재고로) */ const t = (TABS[k].find((x) => x[0] === p.t) || TABS[k][0])[0]; const canU = HS.can('csdata', 'create');
      document.getElementById('ttl').textContent = '전산자료 · ' + TITLE[k];
      tools.appendChild(HS.seg(TABS[k], t, (x) => HS.go('cs', { k, t: x })));
      if (t === '조회') return queryView(k, body, p, tools);
      if (k === 'order') return orderView(body, p, tools, t, canU);
      const [L, daily, PT] = await Promise.all([latestFiles(), HS.db.list('erp_cs_daily', { eq: { kind: k }, gte: { d: addDays(kd(), -40) } }).catch(() => []), HS.db.list('erp_cs_part', { eq: { kind: k }, select: 'kind,sub,part,brand,stat,at' }).catch(() => [])]);
      const subs = t === '합계' ? ['온라인', '매장'] : [t];
      const BP = PT.filter((x) => subs.indexOf(x.sub) >= 0 && x.stat); // 브랜드 묶음 (기준 시각 · 파일)
      const F = subs.map((s) => L[k + '|' + s]).filter(Boolean);
      const bAt = {}; BP.forEach((x) => { const n = x.stat.name || x.brand; const o = bAt[n] || (bAt[n] = { at: x.at, file: x.stat.file, by: x.stat.by_name }); if (x.at < o.at) Object.assign(o, { at: x.at, file: x.stat.file, by: x.stat.by_name }); });
      const oldest = BP.reduce((a, x) => (!a || x.at < a ? x.at : a), null);
      const xl = HS.el('<button class="btn">엑셀 받기 (최신 상세)</button>'); tools.appendChild(xl);
      xl.onclick = async () => { const all = []; for (const s of subs) (await loadParts(k, s)).forEach((x) => all.push(k === 'erp' && x.length === 9 ? { 구분: s, 소속브랜드: x[0], 매장코드: x[1], 매장명: x[4], 기획년도: x[2], 시즌: x[3], 아이템군: x[8], 현재고: x[5] } : Object.assign({ 구분: s, 브랜드: HS.bname(brandOf(x[0], x[1])), 품번: x[1], 색상: x[2], 사이즈: x[3], 로케이션: x[4], 현재고: x[5], 출고: x[6], 미래발생분: x[7] }, k === 'wms' ? (([a, b2, c2]) => ({ 누적재고: x[11] != null ? x[11] : (+x[5] || 0) - (+x[7] || 0), 기획년도: a, 시즌: b2, 아이템군: c2 }))(fy(x)) : {}))); if (!all.length) return HS.toast('자료가 없습니다'); HS.download(TITLE[k] + '_' + t + '_' + kd() + '.xlsx', all, t); };
      body.innerHTML = '';
      if (k === 'erp' && t === '합계') return erpSummary(body, PT, daily, canU);
      const top = HS.el('<div class="cstop"></div>'); body.appendChild(top);
      const up = HS.el('<div class="card"><h3>' + esc(t) + ' 올리기</h3>' + (canU && t !== '합계' ? '<div class="drop" id="ud" style="padding:14px;text-align:center"><b>' + (k === 'wms' ? 'WMS 재고현황' : '화주 ERP 재고현황') + ' 엑셀 놓기</b><div class="mute" style="font-size:11.5px;margin-top:4px">품번 · 색상 · ' + (k === 'wms' ? '위치정보 · ' : '') + '현재고 · 브랜드 칸 자동 인식' + (k === 'wms' ? ' · 창고 칸이 있으면 정상/반품 자동 구분' : ' · 매장명 "온라인쇼핑"이면 온라인') + ' ' + HS.fmtLink(k === 'wms' ? 'cs_wms' : 'cs_erp') + '</div></div>' : '') +
        '<div class="tw" style="margin-top:8px"><table class="no-tools">' + (F.length ? F.map((x) => '<tr><td class="mute">' + esc(x.sub) + ' 마지막</td><td>' + esc(hm(x.at)) + ' · ' + esc(x.by_name || '') + ' · ' + fmt(x.rows) + '줄 <span class="mute">' + esc(x.file_name || '') + '</span></td></tr>').join('') : '<tr><td class="mute">아직 올린 자료가 없습니다</td></tr>') + '</table></div>' +
        (Object.keys(bAt).length > 1 ? '<div class="mute" style="font-size:11.5px;margin-top:6px">브랜드별로 나눠 올린 파일은 합쳐서 보여 줍니다 · 브랜드 ' + Object.keys(bAt).length + '개 · 파일 ' + new Set(Object.values(bAt).map((o) => o.file)).size + '개 (브랜드별 기준 시각은 아래 표)</div>' : '') + '</div>');
      top.appendChild(up);
      const ud = up.querySelector('#ud'); if (ud) ud.onclick = (e) => { if (!e.target.closest('[data-fmt]')) HS.csUpload({ kind: k, sub: t }); };
      const S = BP.length ? BP.reduce((a, x) => { const s = x.stat; a.qty += +s.qty || 0; a.sku += +s.sku || 0; a.styles += +s.styles || 0; a.noloc += +s.noloc || 0; a.noloc_qty += +s.noloc_qty || 0; a.fut += +s.fut || 0; a.out += +s.out || 0; return a; }, { qty: 0, sku: 0, styles: 0, noloc: 0, noloc_qty: 0, fut: 0, out: 0 })
        : F.reduce((a, x) => { const s = x.summary || {}; a.qty += +x.qty || 0; a.sku += s.sku || 0; a.styles += s.styles || 0; a.noloc += s.noloc || 0; a.noloc_qty += s.noloc_qty || 0; a.fut += s.fut || 0; a.out += s.out || 0; return a; }, { qty: 0, sku: 0, styles: 0, noloc: 0, noloc_qty: 0, fut: 0, out: 0 });
      const has = BP.length || F.length;
      const ds = [...new Set(daily.filter((x) => subs.indexOf(x.sub) >= 0).map((x) => x.d))].sort(); const dl = ds[ds.length - 1], dp = ds[ds.length - 2];
      const sumD = (dd) => daily.filter((x) => x.d === dd && subs.indexOf(x.sub) >= 0).reduce((a, x) => a + (+x.qty || 0), 0);
      const kp = (l, v, s2, c) => '<div class="card kpi"><div class="l">' + l + '</div><div class="v' + (c ? ' ' + c : '') + '">' + v + '</div><div class="s">' + s2 + '</div></div>';
      top.appendChild(HS.el('<div class="kpis" style="grid-template-columns:repeat(' + (k === 'wms' && t === '정상창고' ? 4 : 3) + ',1fr)">' + kp('현재고', has ? fmt(S.qty) : '-', dp ? '전날 대비 ' + sgn(sumD(dl) - sumD(dp)) : '') + kp('SKU', has ? fmt(S.sku) : '-', '스타일 ' + fmt(S.styles)) +
        (k === 'wms' && t === '정상창고' ? kp('로케이션 없음', has ? fmt(S.noloc) : '-', fmt(S.noloc_qty) + ' PCS · <a href="javascript:void 0" id="nl">목록 보기</a>', S.noloc ? 'neg' : '') : '') + kp(k === 'wms' ? '출고 예정 (미래발생분)' : '누적 출고', fmt(k === 'wms' ? S.fut : S.out), oldest ? '가장 오래된 기준 ' + esc(hm(oldest)) : F.length ? '기준 ' + esc(hm(F[0].at)) : '') + '</div>'));
      const nl = top.querySelector('#nl'); if (nl) nl.onclick = () => HS.locPopup(true);
      if (!dl) return;
      const bs = [...new Set(daily.filter((x) => x.d === dl && subs.indexOf(x.sub) >= 0).map((x) => x.brand))]; const bo = (n) => { const x = (HS.cache.brandMap || {})[n]; return x ? +x.sort || 0 : 999; }; bs.sort((a, b) => bo(a) - bo(b));
      const g = (dd, b, f) => daily.filter((x) => x.d === dd && x.brand === b && subs.indexOf(x.sub) >= 0).reduce((a, x) => a + (+x[f || 'qty'] || 0), 0);
      const isN = k === 'wms' && t === '정상창고'; const R = C.getNoloc(); // 로케이션 없음: 정상창고만 (반품창고는 자리 관리 대상 아님)
      const pctOf = (q, all) => (all > 0 ? q / all * 100 : 0); const pcs = (v) => (v || v === 0 ? v.toFixed(1) + '%' : '-');
      const nlRow = (b) => { const sk = g(dl, b, 'noloc'), nq = g(dl, b, 'noloc_qty'), p2 = pctOf(nq, g(dl, b)); return '<td class="n' + (sk ? ' neg' : '') + '">' + fmt(sk) + '</td><td class="n' + (nq ? ' neg' : '') + '">' + fmt(nq) + '</td><td class="n' + (p2 > R.pct ? ' neg' : '') + '">' + pcs(p2) + '</td>'; };
      const tq = sumD(dl), tsk = bs.reduce((a, b) => a + g(dl, b, 'noloc'), 0), tnq = bs.reduce((a, b) => a + g(dl, b, 'noloc_qty'), 0);
      const bc = HS.el('<div class="card" style="margin-top:14px"><h3>브랜드별 <small>' + esc(t) + ' · ' + esc(dl) + ' 기준</small></h3>' +
        (isN ? '<div class="nlrule">📍 <b>로케이션 없음 기준</b> : 현재고 ' + fmt(R.min) + '개 이상 · 위치정보 <b>빈칸</b>' + (R.codes.length ? ' 또는 ' + R.codes.map((c) => '<span class="tag">' + esc(c) + '</span>').join(' ') : '') + ' · 비율 ' + fmt(R.pct, 1) + '% 넘으면 빨강 · 반품창고 제외<span class="sp"></span>' + (HS.can('settings', 'edit') ? '<button class="btn sm" id="nlset">기준 설정</button>' : '') + '</div>' : '') +
        '<div class="tw"><table><tr><th>브랜드</th><th class="n">현재고</th><th class="n">SKU</th>' + (isN ? '<th class="n">로케이션 없음 SKU</th><th class="n">로케이션 없음 수량</th><th class="n">로케이션 없음 비율</th>' : '') + '<th class="n">전날 대비</th><th>기준 (파일)</th></tr>' +
        bs.map((b) => '<tr><td>' + esc(HS.bname(b)) + '</td><td class="n"><b>' + fmt(g(dl, b)) + '</b></td><td class="n">' + fmt(g(dl, b, 'sku')) + '</td>' + (isN ? nlRow(b) : '') + '<td class="n">' + (dp ? sgn(g(dl, b) - g(dp, b)) : '<span class="mute">-</span>') + '</td><td class="mute" style="font-size:12px">' + (bAt[b] ? '<span class="' + (atDay(bAt[b].at) === kd() ? '' : 'wa3') + '">' + esc(hm(bAt[b].at)) + (atDay(bAt[b].at) === kd() ? '' : ' ⚠') + '</span> · ' + esc(bAt[b].file || '') : '') + '</td></tr>').join('') +
        '<tr class="tot"><td>합계</td><td class="n">' + fmt(tq) + '</td><td class="n">' + fmt(bs.reduce((a, b) => a + g(dl, b, 'sku'), 0)) + '</td>' + (isN ? '<td class="n">' + fmt(tsk) + '</td><td class="n">' + fmt(tnq) + '</td><td class="n">' + pcs(pctOf(tnq, tq)) + '</td>' : '') + '<td class="n">' + (dp ? sgn(sumD(dl) - sumD(dp)) : '') + '</td><td></td></tr></table></div>' +
        (isN ? '<div class="mute" style="font-size:11.5px;margin-top:6px">비율 = 로케이션 없음 수량 ÷ 현재고 · 기준을 바꾸면 다음에 올리는 WMS 파일부터 적용 (목록 보기는 바로 적용)</div>' : '') + '</div>');
      body.appendChild(bc);
      const ns = bc.querySelector('#nlset'); if (ns) ns.onclick = () => HS.nolocSetting();
    },
  });
  // ERP 재고 합계 (매장 + 온라인) — 화주 ERP 매장별 재고현황 · 온라인 = 매장명 "온라인쇼핑"
  async function erpSummary(body, PT, daily, canU) {
    const parts = await partsQ({ eq: { kind: 'erp' } });
    const wd = await HS.db.list('erp_cs_daily', { eq: { kind: 'wms', sub: '정상창고' }, gte: { d: addDays(kd(), -10) } }).catch(() => []);
    const wl = wd.map((x) => x.d).sort().pop(); const W = {}; wd.filter((x) => x.d === wl).forEach((x) => (W[x.brand] = +x.qty || 0));
    const B = {}; const ST = {}; const SE = {}; const NEG = []; const files = {}; let tm = 0, to = 0, isStore = false; const stores = [new Set(), new Set()];
    for (const pt of parts) {
      const on = pt.sub === '온라인'; const n = (pt.stat && pt.stat.name) || brandOf(pt.brand) || pt.brand || '(브랜드 없음)';
      const b = B[n] || (B[n] = { brand: n, m: 0, o: 0, neg: 0, files: new Set(), at: pt.at });
      if (pt.stat && pt.stat.file) { b.files.add(pt.stat.file); files[pt.stat.file] = (files[pt.stat.file] || 0); }
      if (pt.at < b.at) b.at = pt.at;
      for (const x of pt.rows || []) {
        const q = +x[5] || 0; if (on) { b.o += q; to += q; } else { b.m += q; tm += q; }
        if (pt.stat && pt.stat.file) files[pt.stat.file] += q;
        if (q < 0) { b.neg++; NEG.push({ 구분: pt.sub, 브랜드: HS.bname(n), 코드: x[1], 매장명: x.length === 9 ? x[4] : '', 기획년도: x.length === 9 ? x[2] : '', 시즌: x.length === 9 ? x[3] : '', 품번_아이템군: x.length === 9 ? x[8] : x[1], 현재고: q }); }
        if (x.length === 9) { isStore = true; stores[on ? 1 : 0].add(x[1]); const sk = x[1] + ' ' + x[4]; const so = ST[sk] || (ST[sk] = { s: sk, on, q: 0 }); so.q += q; const yy = (String(x[2]).match(/\d{4}/) || [''])[0]; const ss = (String(x[3]).match(/\(([^)]*)\)/) || [, x[3]])[1]; const ek = (yy + ' ' + ss).trim(); SE[ek] = (SE[ek] || 0) + q; }
      }
    }
    const bl = HS.bsort(Object.entries(B), (e) => e[0]).map((e) => e[1]); const negQ = NEG.reduce((a, x) => a + x.현재고, 0);
    const kp = (l, v, s2, c) => '<div class="card kpi"><div class="l">' + l + '</div><div class="v' + (c ? ' ' + c : '') + '">' + v + '</div><div class="s">' + s2 + '</div></div>';
    if (canU) { const u = HS.el('<div class="card" style="margin-bottom:14px"><div class="drop" id="ud" style="padding:12px;text-align:center"><b>화주 ERP 매장별 재고현황 엑셀 놓기</b> <span class="mute" style="font-size:11.5px">(크리스 · LX 따로 올려도 합쳐짐 · 파일에 든 브랜드만 새것으로 · 매장명에 "온라인쇼핑"이 있으면 온라인)</span> ' + HS.fmtLink('cs_erp') + '</div></div>'); u.querySelector('#ud').onclick = (e) => { if (!e.target.closest('[data-fmt]')) HS.csUpload({ kind: 'erp' }); }; body.appendChild(u); }
    if (!parts.length) { body.appendChild(HS.el('<div class="card empty">아직 올린 ERP 재고가 없습니다 · 화주 ERP 매장별 재고현황 엑셀을 올려 주세요</div>')); return; }
    const fl = Object.entries(files).map(([f, q]) => esc(f) + ' ' + fmt(q)).join(' · ');
    body.appendChild(HS.el('<div class="kpis" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px">' + kp('매장 재고', fmt(tm), isStore ? '매장 ' + fmt(stores[0].size) + '곳' : '') + kp('온라인 재고', fmt(to), isStore ? '매장명 "온라인쇼핑" ' + fmt(stores[1].size) + '곳' : '') + kp('합계 (매장 + 온라인)', fmt(tm + to), fl) +
      kp('마이너스 재고', fmt(NEG.length) + '줄', fmt(negQ) + ' PCS' + (NEG.length ? ' · <a href="javascript:void 0" id="ng">목록 보기</a>' : ''), NEG.length ? 'neg' : '') + '</div>'));
    const ng = body.querySelector('#ng'); if (ng) ng.onclick = () => { const L2 = NEG.slice().sort((a, b) => a.현재고 - b.현재고); const f = HS.el('<div><div class="mute" style="font-size:12px;margin-bottom:8px">현재고가 0보다 작은 줄 ' + fmt(L2.length) + '개 · 적은 순 (최대 300줄 표시 · 엑셀은 전체)</div><div class="tw" style="max-height:60vh;overflow:auto"><table class="no-tools"><tr><th>구분</th><th>브랜드</th><th>코드</th><th>매장명</th><th>시즌</th><th>아이템군 · 품번</th><th class="n">현재고</th></tr>' + L2.slice(0, 300).map((x) => '<tr><td>' + esc(x.구분) + '</td><td>' + esc(x.브랜드) + '</td><td>' + esc(x.코드) + '</td><td>' + esc(x.매장명) + '</td><td>' + esc((x.기획년도 + ' ' + x.시즌).trim()) + '</td><td>' + esc(x.품번_아이템군) + '</td><td class="n neg">' + fmt(x.현재고) + '</td></tr>').join('') + '</table></div></div>');
      HS.modal('ERP 마이너스 재고', f, [['닫기', null], ['엑셀 받기', true, 'p']], { wide: true, onOk: async () => { HS.download('ERP_마이너스재고_' + kd() + '.xlsx', L2, '마이너스'); } }); };
    const g2 = HS.el('<div style="display:grid;grid-template-columns:1.75fr 1fr;gap:14px;align-items:start" class="cs2"></div>'); body.appendChild(g2);
    g2.appendChild(HS.el('<div class="card"><h3>브랜드별 <small>합계 줄 자동 제외 · WMS 정상창고' + (wl ? ' ' + esc(wl.slice(5)) : '') + '와 나란히</small></h3><div class="tw"><table><tr><th>브랜드</th><th class="n">매장</th><th class="n">온라인</th><th class="n">ERP 합계</th><th class="n">WMS 정상창고</th><th class="n">마이너스</th><th>기준 (파일)</th></tr>' +
      bl.map((b) => '<tr><td>' + esc(HS.bname(b.brand)) + '</td><td class="n">' + fmt(b.m) + '</td><td class="n">' + fmt(b.o) + '</td><td class="n"><b>' + fmt(b.m + b.o) + '</b></td><td class="n">' + (W[b.brand] != null ? fmt(W[b.brand]) : '<span class="mute">-</span>') + '</td><td class="n' + (b.neg ? ' neg' : '') + '">' + (b.neg ? fmt(b.neg) + '줄' : '-') + '</td><td class="mute" style="font-size:12px"><span class="' + (atDay(b.at) === kd() ? '' : 'wa3') + '">' + esc(hm(b.at)) + (atDay(b.at) === kd() ? '' : ' ⚠') + '</span> · ' + esc([...b.files].join(', ')) + '</td></tr>').join('') +
      '<tr class="tot"><td>합계</td><td class="n">' + fmt(tm) + '</td><td class="n">' + fmt(to) + '</td><td class="n">' + fmt(tm + to) + '</td><td class="n">' + fmt(Object.values(W).reduce((a, x) => a + x, 0)) + '</td><td class="n">' + fmt(NEG.length) + '줄</td><td></td></tr></table></div></div>'));
    const side = HS.el('<div style="display:flex;flex-direction:column;gap:14px"></div>'); g2.appendChild(side);
    if (isStore) {
      const top = Object.values(ST).sort((a, b) => b.q - a.q).slice(0, 10);
      side.appendChild(HS.el('<div class="card"><h3>재고 많은 곳 TOP 10 <small>매장 · 온라인</small></h3><div class="tw"><table class="no-tools"><tr><th>매장</th><th>구분</th><th class="n">현재고</th></tr>' + top.map((x) => '<tr><td>' + esc(x.s) + '</td><td><span class="cbadge' + (x.on ? ' on' : '') + '">' + (x.on ? '온라인' : '매장') + '</span></td><td class="n">' + fmt(x.q) + '</td></tr>').join('') + '</table></div></div>'));
      const se = Object.entries(SE).sort((a, b) => b[1] - a[1]).slice(0, 8);
      side.appendChild(HS.el('<div class="card"><h3>시즌별 <small>기획년도 · 시즌 · 많은 순 8개</small></h3><div class="tw"><table class="no-tools"><tr><th>시즌</th><th class="n">현재고</th></tr>' + se.map(([k2, q]) => '<tr><td>' + esc(k2 || '(시즌 없음)') + '</td><td class="n">' + fmt(q) + '</td></tr>').join('') + '</table></div></div>'));
    }
    body.appendChild(HS.el('<div class="mute" style="font-size:11.5px;margin-top:10px;line-height:1.7">· 온라인 / 매장 구분: 매장명에 "온라인쇼핑"이 들어간 곳만 온라인 (온라인쇼핑 · 온라인쇼핑-출고용) · 크리스몰 · 쿠팡 · LF몰 · 버킷스토어 · 자사몰 등은 매장<br>· 저장: 매장 × 시즌 × 아이템군 합계 (품번 없는 양식) · 날짜별로는 브랜드 합계만 쌓음</div>'));
  }
  // 브랜드 × 의뢰구분 표 (대시보드 · 배분LIST 화면 같이 씀)
  function allocTable(A, links) {
    const KS = C.ALLOC_K.concat(A.some((r) => r.k === 'etc') ? [['etc', '기타 (모르는 구분)']] : []);
    const q = (b, k) => { const r = A.find((x) => x.brand === b && x.k === k); return r ? +r.qty : 0; }; const stv = (b) => { const r = A.find((x) => x.brand === b && x.k === 'all'); return r ? r.stores : 0; }; const anyNo = A.some((x) => x.brand && x.k === 'all' && x.stores == null); const stS = (b) => { const v = stv(b); return v == null || (b === '' && anyNo && !v) ? '<span class="mute" title="매장 칸 없이 올린 파일">-</span>' : fmt(v) + (b === '' && anyNo ? '+' : ''); };
    const bo = (n) => { const x = (HS.cache.brandMap || {})[n]; return x ? +x.sort || 0 : 999; };
    const bs = [...new Set(A.filter((r) => r.brand).map((r) => r.brand))].sort((a, b) => (/^미등록/.test(a) ? 1 : 0) - (/^미등록/.test(b) ? 1 : 0) || bo(a) - bo(b));
    return '<div class="tw"><table><tr><th>브랜드</th>' + KS.map(([k, l]) => '<th class="n">' + esc(k === 'etc' ? l : k + ') ' + l) + '</th>').join('') + '<th class="n">합계</th><th class="n">매장 수</th></tr>' +
      bs.map((b) => '<tr><td' + (/^미등록/.test(b) ? ' class="neg"' : '') + '>' + esc(/^미등록/.test(b) ? b + ' (품번 코드)' : HS.bname(b)) + '</td>' + KS.map(([k]) => '<td class="n">' + (q(b, k) ? (links ? '<a href="javascript:void 0" data-b="' + esc(b) + '" data-k="' + k + '">' + fmt(q(b, k)) + '</a>' : fmt(q(b, k))) : '<span class="mute">0</span>') + '</td>').join('') + '<td class="n"><b>' + fmt(q(b, 'all')) + '</b></td><td class="n">' + stS(b) + '</td></tr>').join('') +
      '<tr class="tot"><td>합계</td>' + KS.map(([k]) => '<td class="n">' + fmt(bs.reduce((a, b) => a + q(b, k), 0)) + '</td>').join('') + '<td class="n">' + fmt(q('', 'all')) + '</td><td class="n">' + stS('') + '</td></tr></table></div>';
  }
  // 배분LIST: 브랜드별로 나눠 올리기 → 브랜드 카드 · 진행률 → [배분LIST 마감] (해제는 관리자)
  HS.allocTargets = () => (HS.cache.brands || []).filter((b) => b.center_id !== 'anseong' && b.b2b !== false && b.active !== false).map((b) => b.name);
  HS.allocClose = async (d) => (await HS.db.list('erp_cs_close', { eq: { d, kind: 'alloc' } }).catch(() => []))[0] || null;
  async function allocView(body, d, canU) {
    const [A, F, CL, PV] = await Promise.all([HS.db.list('erp_cs_alloc', { eq: { d } }).catch(() => []), HS.db.list('erp_cs_file', { eq: { kind: 'order', sub: '배분LIST', ref_date: d }, order: ['at', false], limit: 100 }).catch(() => []), HS.allocClose(d), HS.db.list('erp_cs_alloc', { gte: { d: addDays(d, -7) }, lte: { d: addDays(d, -1) }, eq: { k: 'all' } }).catch(() => [])]);
    body.innerHTML = '';
    const closed = CL && CL.closed_at; const skip = (CL && CL.skip) || []; const canX = HS.can('csdata', 'close');
    const B = {}; A.filter((r) => r.brand && r.k === 'all').forEach((r) => (B[r.brand] = r));
    const fbr = (f) => (f && f.summary && Array.isArray(f.summary.brands) ? f.summary.brands : []); // 예전 기록은 브랜드 수(숫자)만 있음
    const nF = {}; F.forEach((f) => fbr(f).forEach((b) => (nF[b] = (nF[b] || 0) + 1)));
    const prev = {}; PV.filter((r) => r.brand).sort((a, b) => (a.d < b.d ? -1 : 1)).forEach((r) => (prev[r.brand] = r));
    const targets = HS.allocTargets(); const extra = Object.keys(B).filter((b) => targets.indexOf(b) < 0);
    const need = targets.filter((b) => skip.indexOf(b) < 0); const done = need.filter((b) => B[b]); const left = need.filter((b) => !B[b]);
    const c = HS.el('<div class="card"><h3>출고 지시 · 배분LIST · ' + esc(d) + ' 당일 마감 <small>보충일자 기준 · 브랜드별 파일을 따로 올려도 합쳐짐 (파일에 든 브랜드만 새것으로) · ' + HS.fmtLink('cs_alloc') + '</small><span class="sp"></span>' +
      (canU && !closed ? '<button class="btn sm" id="au">⬆ 브랜드 파일 올리기 (여러 개 가능)</button> <button class="btn sm p" id="acl" style="background:#1F8A5B;border-color:#1F8A5B">✔ 배분LIST 마감</button>' : '') + (A.length ? ' <button class="btn sm" id="ax">상세 엑셀</button>' : '') + '</h3></div>');
    if (closed) c.appendChild(HS.el('<div class="lock ok" style="margin-bottom:10px;font-size:13px"><span>🔒 <b>' + esc(d) + ' 배분LIST 마감</b> · ' + esc(CL.closed_name || '') + ' ' + esc(hm(CL.closed_at)) + ' · ' + fmt(CL.brands) + '개 브랜드 · ' + fmt(CL.qty) + '개 · 더 올리거나 바꿀 수 없습니다</span><span class="sp"></span>' + (canX ? '<button class="btn sm" id="aop">마감 해제 (관리자)</button>' : '<span class="mute" style="font-size:11.5px">마감 해제는 관리자</span>') + '</div>'));
    else c.appendChild(HS.el('<div style="display:flex;align-items:center;gap:12px;font-size:13px;flex-wrap:wrap"><b>등록 ' + done.length + ' / ' + need.length + ' 브랜드</b><div class="aprog"><i style="width:' + (need.length ? Math.round(done.length / need.length * 100) : 0) + '%"></i></div>' + (left.length ? '<span class="wa3">⏳ 남은 브랜드: ' + left.map((b) => esc(HS.bname(b))).join(' · ') + '</span>' : '<span class="pos">✔ 모두 올렸습니다 → [배분LIST 마감]</span>') + '<span class="mute" style="font-size:11.5px">· 평일 18:00까지 마감 안 되면 지원팀 알림</span></div>'));
    const card = (b) => { const r = B[b]; const sk = skip.indexOf(b) >= 0; const pr = prev[b]; const un = /^미등록/.test(b);
      const cls = r ? (nF[b] > 1 ? 're' : 'done') : sk ? 'skip' : 'wait';
      return '<div class="acard ' + cls + '"><b' + (un ? ' class="neg"' : '') + '>' + esc(un ? b + ' (품번 코드)' : HS.bname(b)) + '</b><br>' +
        (r ? (nF[b] > 1 ? '<span style="color:#2357C6;font-weight:700">↻ ' + esc(hm(r.at)) + ' 다시 올림</span>' : '<span class="pos">✔ ' + esc(hm(r.at)) + '</span>') + ' · ' + esc(r.by_name || '') + '<br><span class="mute">' + esc(r.file || '') + ' · ' + fmt(r.lines) + '줄</span><br>' + fmt(r.qty) + '개 · ' + (r.stores == null ? '<span class="mute">매장 정보 없음</span>' : fmt(r.stores) + '개 매장')
          : sk ? '<span class="mute">오늘 없음 (마감 대상 아님)</span>' + (canU && !closed ? '<br><a href="javascript:void 0" data-sk="' + esc(b) + '" data-on="0">되돌리기</a>' : '')
          : '<span class="wa3">⏳ 아직</span><br><span class="mute">' + (pr ? '지난 ' + esc(pr.d.slice(5)) + ' : ' + fmt(pr.qty) + '개' : '지난 기록 없음') + '</span>' + (canU && !closed ? '<br><a href="javascript:void 0" data-sk="' + esc(b) + '" data-on="1">오늘 없음</a>' : '')) + '</div>'; };
    c.appendChild(HS.el('<div class="acards">' + targets.concat(extra).map(card).join('') + '</div>'));
    if (!A.length) c.appendChild(HS.el('<div class="empty">' + esc(d) + ' 배분LIST가 없습니다 · 17~18시에 화주 ERP 영업MD › 배분LIST 엑셀(브랜드별)을 올려 주세요</div>'));
    else {
      c.appendChild(HS.el(allocTable(A, true)));
      const unk = {}, unr = {}; let skp = 0; F.forEach((f) => { const sm = f.summary || {}; Object.entries(sm.unknown || {}).forEach(([k, n]) => (unk[k] = (unk[k] || 0) + n)); Object.entries(sm.unreg || {}).forEach(([k, n]) => (unr[k] = (unr[k] || 0) + n)); skp += sm.skipped || 0; });
      const warn = [];
      if (Object.keys(unr).length) warn.push('등록 안 된 품번 코드 ' + Object.entries(unr).map(([k, n]) => '"' + esc(k.replace('미등록 ', '')) + '" ' + fmt(n) + '줄').join(', ') + ' — 설정 › 브랜드에 코드를 넣으면 자동으로 들어갑니다');
      if (Object.keys(unk).length) warn.push('모르는 의뢰구분 ' + Object.entries(unk).map(([k, n]) => '"' + esc(k) + '" ' + fmt(n) + '줄').join(', ') + ' → 기타');
      if (skp) warn.push('보충수량 0 · 마이너스 ' + fmt(skp) + '줄은 빼고 계산');
      c.appendChild(HS.el('<div class="mute" style="font-size:11.5px;margin-top:8px">· 숫자를 누르면 그 의뢰구분의 매장 목록 · 일일 마감 B2B: 1) → 초도출고 · 2)~5) → 판매분지시 · 6) → 완불 · 7) → 온라인지시 (<a href="#/daily?d=' + d + '&s=b2b">일일 마감 보기</a>)</div>'));
      if (warn.length) c.appendChild(HS.el('<div class="lock warn" style="margin-top:8px;font-size:12px;line-height:1.7">⚠ ' + warn.join('<br>⚠ ') + '</div>'));
    }
    body.appendChild(c);
    body.appendChild(HS.el('<div class="card" style="margin-top:14px"><h3>올린 기록 · ' + esc(d) + ' <small>17:00 ~ 18:00 · 같은 브랜드를 다시 올리면 그 브랜드만 새것으로 · 파일이 크면 화주 ERP에서 CSV로 받아도 됩니다</small></h3><div class="tw"><table class="no-tools"><tr><th>올린 시각</th><th>올린 사람</th><th>파일</th><th>브랜드</th><th class="n">줄</th><th class="n">수량</th></tr>' + (F.length ? F.map((x) => '<tr><td>' + esc(hm(x.at)) + '</td><td>' + esc(x.by_name || '') + '</td><td class="mute">' + esc(x.file_name || '') + '</td><td>' + esc(fbr(x).map((b) => (/^미등록/.test(b) ? b : HS.bname(b))).join(', ')) + '</td><td class="n">' + fmt(x.rows) + '</td><td class="n">' + fmt(x.qty) + '</td></tr>').join('') : '<tr><td colspan="6" class="mute">아직 없음</td></tr>') + '</table></div></div>'));
    const au = body.querySelector('#au'); if (au) au.onclick = () => HS.csUpload({ kind: 'order', sub: '배분LIST', d });
    body.querySelectorAll('[data-sk]').forEach((a) => (a.onclick = async () => { try { await HS.db.rpc('erp_cs_alloc_skip', { p_d: d, p_brand: a.dataset.sk, p_on: a.dataset.on === '1' }); HS.route(); } catch (e) { HS.err(e); } }));
    const acl = body.querySelector('#acl'); if (acl) acl.onclick = async () => {
      if (!done.length && !extra.length) return HS.toast('올린 브랜드가 없습니다');
      const msg = (left.length ? '<b class="neg">' + left.map((b) => esc(HS.bname(b))).join(' · ') + '</b> 아직 안 올렸습니다.<br>배분이 없는 브랜드면 카드에서 [오늘 없음]을 누르세요.<br><br>그래도 ' : '') + esc(d) + ' 배분LIST를 <b>마감</b>할까요?<br><span class="mute" style="font-size:12px">마감하면 그날 배분LIST는 더 올리거나 바꿀 수 없습니다 (관리자만 마감 해제)</span>';
      if (!(await HS.confirm(msg))) return; try { await HS.db.rpc('erp_cs_alloc_close', { p_d: d, p_on: true }); HS.toast(d + ' 배분LIST 마감했습니다', 'ok'); HS.route(); } catch (e) { HS.err(e); } };
    const aop = body.querySelector('#aop'); if (aop) aop.onclick = async () => { if (!(await HS.confirm(esc(d) + ' 배분LIST 마감을 해제할까요? (해제하면 다시 올릴 수 있습니다)'))) return; try { await HS.db.rpc('erp_cs_alloc_close', { p_d: d, p_on: false }); HS.toast('마감 해제했습니다', 'ok'); HS.route(); } catch (e) { HS.err(e); } };
    const lines = async () => (await loadParts('alloc', d));
    const ax = body.querySelector('#ax'); if (ax) ax.onclick = async () => { const L2 = await lines(); if (!L2.length) return HS.toast(d + ' 상세가 없습니다 (상세는 1년 보관)'); const KN = Object.fromEntries(C.ALLOC_K); HS.download('배분LIST_' + d + '.xlsx', L2.map((l) => ({ 의뢰구분: l[9], 구분: KN[l[6]] || '기타', 브랜드: /^미등록/.test(l[10]) ? l[10] : HS.bname(l[10]), 매장코드: l[1], 매장명: l[2], 품번: l[0], 색상: l[3], 사이즈: l[4], 보충수량: l[5], 의뢰일자: l[8], 보충일자: l[7] })), '배분LIST'); };
    body.querySelectorAll('[data-b]').forEach((a) => (a.onclick = async () => {
      const b = a.dataset.b, k = a.dataset.k; const L2 = (await lines()).filter((l) => l[10] === b && l[6] === k);
      if (!L2.length) return HS.toast('상세가 없습니다 (상세는 1년 보관)');
      if (!L2.some((l) => l[1])) { // 매장 칸 없이 올린 파일 → 품번 목록
        const P = {}; L2.forEach((l) => { const o = P[l[0]] || (P[l[0]] = { s: l[0], q: 0, cs: new Set() }); o.q += l[5]; o.cs.add(l[3] + '|' + l[4]); }); const pl = Object.values(P).sort((x, y) => y.q - x.q); const KN0 = Object.fromEntries(C.ALLOC_K);
        return HS.modal((/^미등록/.test(b) ? b : HS.bname(b)) + ' · ' + (KN0[k] || '기타') + ' · 품번 ' + pl.length + '개', '<div class="mute" style="font-size:12px;margin-bottom:6px">매장코드 · 매장명 없이 올린 파일이라 매장 목록 대신 품번 목록을 보여 줍니다</div><div class="tw" style="max-height:60vh;overflow:auto"><table class="no-tools"><tr><th>품번</th><th class="n">색상 · 사이즈 수</th><th class="n">보충수량</th></tr>' + pl.map((o) => '<tr><td>' + esc(o.s) + '</td><td class="n">' + fmt(o.cs.size) + '</td><td class="n">' + fmt(o.q) + '</td></tr>').join('') + '</table></div>', [['닫기', null]], { wide: true });
      }
      const S = {}; L2.forEach((l) => { const o = S[l[1]] || (S[l[1]] = { c: l[1], n: l[2], q: 0, s: new Set() }); o.q += l[5]; o.s.add(l[0]); });
      const list = Object.values(S).sort((x, y) => y.q - x.q); const KN = Object.fromEntries(C.ALLOC_K);
      HS.modal((/^미등록/.test(b) ? b : HS.bname(b)) + ' · ' + (KN[k] || '기타') + ' · 매장 ' + list.length + '곳', '<div class="tw" style="max-height:60vh;overflow:auto"><table class="no-tools"><tr><th>매장코드</th><th>매장명</th><th class="n">품번 수</th><th class="n">보충수량</th></tr>' + list.map((o) => '<tr><td>' + esc(o.c) + '</td><td>' + esc(o.n) + '</td><td class="n">' + fmt(o.s.size) + '</td><td class="n">' + fmt(o.q) + '</td></tr>').join('') + '</table></div>', [['닫기', null]], { wide: true });
    }));
  }
  async function orderView(body, p, tools, t, canU) {
    const d = p.d || kd(); tools.appendChild(HS.dateNav(d, (x) => HS.go('cs', { k: 'order', t, d: x })));
    if (canU) { const b = HS.el('<button class="btn p">⬆ 올리기</button>'); b.onclick = () => HS.csUpload({ kind: 'order', sub: t === '온라인' ? '크리스' : t, d }); tools.appendChild(b); }
    if (t === '배분LIST') return allocView(body, d, canU);
    const [rows, L] = await Promise.all([HS.db.list('erp_cs_order', { eq: { d } }).catch(() => []), HS.db.list('erp_cs_file', { eq: { kind: 'order', ref_date: d }, order: ['at', false] }).catch(() => [])]);
    body.innerHTML = '';
    const bo = (n) => { const x = (HS.cache.brandMap || {})[n]; return x ? +x.sort || 0 : 999; };
    if (t === 'B2B') {
      const R = rows.filter((r) => r.sub === 'B2B' && r.qty != null).sort((a, b) => bo(a.brand) - bo(b.brand)); const f = L.find((x) => x.sub === 'B2B');
      body.appendChild(HS.el('<div class="card"><h3>B2B 출고 지시 <small>' + esc(d) + (f ? ' · WMS ' + esc(hm(f.at)) + ' · ' + esc(f.by_name || '') : ' · 아직 없음') + ' · 아침 출고지시 판매 · 선지시 칸에 자동으로 채워짐 (<a href="#/orders?d=' + d + '">아침 출고지시 보기</a>)</small></h3>' +
        (R.length ? '<div class="tw"><table><tr><th>브랜드</th><th class="n">판매</th><th class="n">선지시</th><th class="n">합계</th></tr>' + R.map((r) => '<tr><td>' + esc(HS.bname(r.brand)) + '</td><td class="n">' + fmt(r.sale) + '</td><td class="n">' + (r.pre == null ? '<span class="mute">-</span>' : fmt(r.pre)) + '</td><td class="n"><b>' + fmt(r.qty) + '</b></td></tr>').join('') + '<tr class="tot"><td>합계</td><td class="n">' + fmt(R.reduce((a, r) => a + (+r.sale || 0), 0)) + '</td><td class="n">' + fmt(R.reduce((a, r) => a + (+r.pre || 0), 0)) + '</td><td class="n">' + fmt(R.reduce((a, r) => a + (+r.qty || 0), 0)) + '</td></tr></table></div>' + (f && f.summary && f.summary.hasKind === false ? '<div class="mute" style="font-size:11.5px;margin-top:6px">파일에 판매 · 선지시 구분 칸이 없어 전부 판매로 넣었습니다</div>' : '') : '<div class="empty">' + esc(d) + ' B2B 출고 지시 파일이 없습니다 · WMS 출고지시 엑셀을 올려 주세요</div>') + '</div>'));
    } else {
      for (const s of ['크리스', 'LX']) {
        const R = rows.filter((r) => r.sub === s).sort((a, b) => bo(a.brand) - bo(b.brand)); const f = L.find((x) => x.sub === s);
        const c = HS.el('<div class="card" style="margin-bottom:14px"><h3>온라인 · ' + s + ' <small>' + (s === '크리스' ? '버킷 어드민' : '사방넷') + (f ? ' · ' + esc(hm(f.at)) + ' · ' + esc(f.by_name || '') : ' · 아직 없음') + '</small><span class="sp"></span>' + (canU ? '<button class="btn sm">' + (s === '크리스' ? '버킷 어드민' : '사방넷') + ' 올리기</button>' : '') + '</h3>' +
          (R.length ? '<div class="tw"><table><tr><th>브랜드</th><th class="n">건수 (배송지)</th><th class="n">수량</th></tr>' + R.map((r) => '<tr><td>' + esc(HS.bname(r.brand)) + '</td><td class="n">' + fmt(r.cnt) + '</td><td class="n"><b>' + fmt(r.qty) + '</b></td></tr>').join('') + '<tr class="tot"><td>합계</td><td class="n">' + fmt(R.reduce((a, r) => a + (+r.cnt || 0), 0)) + '</td><td class="n">' + fmt(R.reduce((a, r) => a + (+r.qty || 0), 0)) + '</td></tr></table></div>' : '<div class="empty">파일이 없습니다</div>') + '</div>');
        const b = c.querySelector('h3 .btn'); if (b) b.onclick = () => HS.csUpload({ kind: 'order', sub: s, d });
        body.appendChild(c);
      }
      body.appendChild(HS.el('<div class="mute" style="font-size:11.5px">· 로라 · 슈퍼웍스 온라인은 추후 연결 · 이름 · 전화 · 주소는 계산에만 쓰고 저장하지 않음</div>'));
    }
  }

  // ================= 재고 조회 · 지시 조회 =================
  // 시즌 값은 파일 · 품번 규칙 모두 '2 (여름)' 모양 그대로
  const seaL = (v) => v;
  // 기획년도 · 시즌 · 아이템군: 파일 값 우선, 빈칸만 품번으로 (style.js)
  const fy = (x) => (window.HSStyle ? HSStyle.fill(x[1], x[8], x[9], x[10]) : [x[8] || '', x[9] || '', x[10] || '']);
  const fresh = (PT, subs) => { const by = {}; PT.filter((x) => subs.indexOf(x.sub) >= 0).forEach((x) => { const n = HS.bname((x.stat && x.stat.name) || x.brand || '') || '전체'; if (!by[n] || x.at < by[n]) by[n] = x.at; }); const G = {}; Object.entries(by).forEach(([n, at]) => (G[hm(at)] || (G[hm(at)] = { at, n: [] })).n.push(n)); return Object.entries(G).sort((x, y) => (x[1].at < y[1].at ? -1 : 1)).map(([t, g]) => { const old = atDay(g.at) !== kd(); return '<span class="' + (old ? 'wa3' : '') + '" title="' + esc(g.n.join(', ')) + '">' + esc(t) + (old ? ' ⚠' : '') + ' (' + (g.n.length > 2 ? g.n.length + '개 브랜드' : esc(g.n.join(' · '))) + ')</span>'; }).join(' · ') || '아직 없음'; };
  async function queryView(k, body, p, tools) {
    body.innerHTML = '<div class="card"><div class="empty">불러오는 중…</div></div>';
    if (k === 'wms') return wmsQuery(body);
    if (k === 'erp') return erpQuery(body);
    return allocQuery(body, p, tools);
  }
  async function wmsQuery(body) {
    const subs = ['정상창고', '반품창고'];
    const [PT, A, B] = await Promise.all([HS.db.list('erp_cs_part', { eq: { kind: 'wms' }, select: 'kind,sub,part,brand,stat,at' }).catch(() => []), loadParts('wms', '정상창고'), loadParts('wms', '반품창고')]);
    const R = []; const add = (L, wh) => { for (const x of L) { const fut = +x[7] || 0; const f3 = fy(x); R.push({ wh, b: HS.bname(brandOf(x[0], x[1])) || '', st: x[1], co: x[2], sz: x[3], loc: x[4], cur: +x[5] || 0, out: +x[6] || 0, fut, tot: x[11] != null ? +x[11] : (+x[5] || 0) - fut, yr: f3[0], se: f3[1], gr: f3[2] }); } };
    add(A, '정상창고'); add(B, '반품창고');
    const c = HS.el('<div class="card"><h3>재고 조회 <small>WMS · 브랜드별 최신 파일 기준 · ' + fresh(PT, subs) + '</small></h3><div class="q"></div></div>'); body.innerHTML = ''; body.appendChild(c);
    const sku = (r) => r.st + '|' + r.co + '|' + r.sz;
    HS.qgrid(c.querySelector('.q'), {
      key: 'cs-wms', xls: 'WMS재고조회', sheet: 'WMS 재고', empty: 'WMS 재고현황을 먼저 올려 주세요',
      note: '누적재고 = 현재고 − 미래발생분 (WMS 파일 값) · 마이너스는 빨간색',
      filters: [
        { k: 'wh', l: '창고', t: 'sel', get: (r) => r.wh, def: '정상창고' }, { k: 'b', l: '브랜드', t: 'sel', get: (r) => r.b }, { k: 'yr', l: '기획년도', t: 'sel', get: (r) => r.yr, sort: (a, b) => cmpD(a, b) },
        { k: 'se', l: '시즌', t: 'sel', get: (r) => r.se, label: seaL }, { k: 'gr', l: '복종 (아이템군)', t: 'sel', get: (r) => r.gr }, { k: 'st', l: '품번', t: 'txt', get: (r) => r.st, ph: '일부만 · 띄어 쓰면 여러 개' },
        { k: 'co', l: '색상', t: 'sel', get: (r) => r.co }, { k: 'sz', l: '사이즈', t: 'sel', get: (r) => r.sz, sort: szSort },
        { k: 'q', l: '재고', t: 'opt', def: 'pos', opts: [['pos', '현재고 있는 것만', (r) => r.cur > 0], ['all', '전체'], ['fut', '미래발생분 있는 것', (r) => r.fut !== 0], ['tneg', '누적재고 마이너스', (r) => r.tot < 0], ['neg', '현재고 0 · 마이너스', (r) => r.cur <= 0], ['noloc', '로케이션 없음', (r) => r.cur > 0 && !r.loc]] },
        { k: 'lc', l: '로케이션', t: 'txt', get: (r) => r.loc, ph: '예: A-03' },
      ],
      cols: [
        { k: 'wh', l: '창고', hide: true }, { k: 'b', l: '브랜드' }, { k: 'st', l: '품번' }, { k: 'co', l: '색상' }, { k: 'sz', l: '사이즈' }, { k: 'yr', l: '기획년도' }, { k: 'se', l: '시즌' }, { k: 'gr', l: '복종' },
        { k: 'sku', l: 'SKU', num: true, agg: 'distinct', dk: sku, get: () => 1 },
        { k: 'cur', l: '현재고', num: true, hl: true, b: true, cls: (v) => (v < 0 ? 'neg' : '') }, { k: 'fut', l: '미래발생분', num: true, hl: true }, { k: 'tot', l: '누적재고 (미래재고)', num: true, hl: true, cls: (v) => (v < 0 ? 'neg' : '') },
        { k: 'out', l: '출고', num: true }, { k: 'loc', l: '로케이션', fmt: (v) => (v ? '<span class="qcut" title="' + esc(v) + '">' + esc(v) + '</span>' : '<span class="neg">없음</span>') },
      ],
      units: [
        { id: 'sku', l: 'SKU', by: ['wh', 'b', 'st', 'co', 'sz'], hide: ['sku'] }, { id: 'sc', l: '품번 + 색상', by: ['wh', 'b', 'st', 'co'], hide: ['sz'] },
        { id: 'st', l: '품번', by: ['wh', 'b', 'st'], hide: ['co', 'sz'] }, { id: 'bs', l: '브랜드 · 시즌 합계', by: ['wh', 'b', 'yr', 'se'], hide: ['st', 'co', 'sz', 'gr', 'loc'] }, { id: 'raw', l: '로케이션별 (파일 줄)' },
      ],
      unit: 'sc', sort: { k: 'cur', d: true }, detailSort: (a, b) => cmpD(a.sz, b.sz),
    }).setData(R);
  }
  async function erpQuery(body) {
    const subs = ['매장', '온라인'];
    const [PT, A, B] = await Promise.all([HS.db.list('erp_cs_part', { eq: { kind: 'erp' }, select: 'kind,sub,part,brand,stat,at' }).catch(() => []), loadParts('erp', '매장'), loadParts('erp', '온라인')]);
    const R = []; const add = (L, ch) => { for (const x of L) { const st9 = x.length === 9; R.push(st9 ? { ch, b: HS.bname(brandOf(x[0])) || x[0] || '', sc: x[1], sn: x[4], yr: x[2], se: x[3], gr: x[8], cur: +x[5] || 0 } : { ch, b: HS.bname(brandOf(x[0], x[1])) || '', sc: '', sn: '(품번 양식) ' + x[1], yr: '', se: '', gr: '', cur: +x[5] || 0 }); } };
    add(A, '매장'); add(B, '온라인');
    const c = HS.el('<div class="card"><h3>재고 조회 <small>화주 ERP · 브랜드별 최신 파일 기준 · 파일에 품번 칸이 없어 매장 · 시즌 · 아이템군 단위 · ' + fresh(PT, subs) + '</small></h3><div class="q"></div></div>'); body.innerHTML = ''; body.appendChild(c);
    HS.qgrid(c.querySelector('.q'), {
      key: 'cs-erp', xls: 'ERP재고조회', sheet: 'ERP 재고', empty: '화주 ERP 재고현황을 먼저 올려 주세요', note: '매장별 보기는 시즌을 가로로 펼침',
      filters: [
        { k: 'ch', l: '구분', t: 'sel', get: (r) => r.ch }, { k: 'b', l: '브랜드', t: 'sel', get: (r) => r.b }, { k: 'sn', l: '매장 (이름 · 코드)', t: 'txt', get: (r) => r.sn, get2: (r) => r.sc, ph: '예: 롯데' },
        { k: 'yr', l: '기획년도', t: 'sel', get: (r) => r.yr, sort: (a, b) => cmpD(a, b) }, { k: 'se', l: '시즌', t: 'sel', get: (r) => r.se, label: seaL }, { k: 'gr', l: '복종 (아이템군)', t: 'sel', get: (r) => r.gr },
        { k: 'q', l: '재고', t: 'opt', def: 'pos', opts: [['pos', '있는 것만', (r) => r.cur > 0], ['all', '전체'], ['neg', '0 · 마이너스', (r) => r.cur <= 0]] },
      ],
      cols: [
        { k: 'b', l: '브랜드' }, { k: 'ch', l: '구분' }, { k: 'sc', l: '매장코드' }, { k: 'sn', l: '매장명' }, { k: 'yr', l: '기획년도' }, { k: 'se', l: '시즌' }, { k: 'gr', l: '복종' },
        { k: 'ns', l: '매장 수', num: true, agg: 'distinct', dk: (r) => r.sc, get: () => 1 }, { k: 'cur', l: '현재고', num: true, hl: true, b: true, cls: (v) => (v < 0 ? 'neg' : '') },
      ],
      units: [
        { id: 'st', l: '매장별', by: ['b', 'ch', 'sc', 'sn'], hide: ['yr', 'se', 'gr', 'ns'], pivot: { by: (r) => r.se, val: 'cur', label: (v) => v || '(시즌 없음)' } },
        { id: 'raw', l: '상세 (매장 × 시즌 × 아이템군)', hide: ['ns'] }, { id: 'sg', l: '시즌 · 아이템군 합계', by: ['b', 'yr', 'se', 'gr'], hide: ['ch', 'sc', 'sn'] },
        { id: 'br', l: '브랜드 합계', by: ['b', 'ch'], hide: ['sc', 'sn', 'yr', 'se', 'gr'] },
      ],
      unit: 'st', sort: { k: 'cur', d: true },
    }).setData(R);
  }
  async function allocQuery(body, p, tools) {
    const to0 = p.to || kd(); const fr0 = p.fr || addDays(to0, -3);
    const dw = HS.el('<span style="display:inline-flex;gap:4px;align-items:center;font-size:12px">보충일자 <input type="date" class="in" id="qf" style="padding:4px 6px"> ~ <input type="date" class="in" id="qt" style="padding:4px 6px"> <button class="btn sm" data-r="0">오늘</button><button class="btn sm" data-r="6">7일</button><button class="btn sm" data-r="30">31일</button></span>');
    dw.querySelector('#qf').value = fr0; dw.querySelector('#qt').value = to0; tools.appendChild(dw);
    const mx = (f, t) => { if (t < f) [f, t] = [t, f]; if (f < addDays(t, -30)) f = addDays(t, -30); return [f, t]; };
    const goR = (f, t) => { [f, t] = mx(f, t); HS.go('cs', { k: 'order', t: '조회', fr: f, to: t }); };
    dw.querySelector('#qf').onchange = dw.querySelector('#qt').onchange = () => goR(dw.querySelector('#qf').value, dw.querySelector('#qt').value);
    dw.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => goR(addDays(kd(), -+b.dataset.r), kd())));
    const [fr, to] = mx(fr0, to0); const td = kd();
    const [P, W] = await Promise.all([partsQ({ eq: { kind: 'alloc' }, gte: { sub: fr }, lte: { sub: to } }), loadParts('wms', '정상창고')]);
    // WMS: SKU 현재고 · 품번 → 년도 · 시즌 · 복종
    const inv = new Map(), sty = new Map(); for (const x of W) { const kk = x[1] + '|' + x[2] + '|' + x[3]; inv.set(kk, (inv.get(kk) || 0) + (+x[5] || 0)); if (!sty.has(x[1])) sty.set(x[1], fy(x)); }
    const KN = Object.fromEntries(C.ALLOC_K); const names = {};
    const R = []; for (const x of P) for (const l of x.rows || []) { if (l[2]) names[l[1]] = l[2]; const s3 = sty.get(l[0]) || ['', '', '']; R.push({ d: x.sub, b: /^미등록/.test(l[10] || x.brand || '') ? l[10] || x.brand : HS.bname(l[10] || x.brand || '') || '', st: l[0], sc: l[1], sn: l[2], co: l[3], sz: l[4], q: +l[5] || 0, k: l[6], kn: KN[l[6]] ? l[6] + ' ' + KN[l[6]] : '기타', yr: s3[0], se: s3[1], gr: s3[2], sku: l[0] + '|' + l[3] + '|' + l[4] }); }
    R.forEach((r) => { if (!r.sn) r.sn = names[r.sc] || ''; });
    const need = new Map(); R.forEach((r) => { if (r.d === td) need.set(r.sku, (need.get(r.sku) || 0) + r.q); });
    R.forEach((r) => { if (r.d === td) { const iv = inv.get(r.sku); r.iv = iv == null ? 0 : iv; r.short = r.iv - need.get(r.sku) < 0; } });
    const dsk = (M) => { const s = new Set(); M.forEach((r) => { if (r.d === td) s.add(r.sku); }); return s; };
    const ivAgg = (M) => { const s = dsk(M); if (!s.size) return ''; let t = 0; s.forEach((k2) => (t += inv.get(k2) || 0)); return t; };
    const remAgg = (M) => { const s = dsk(M); if (!s.size) return ''; let t = 0; s.forEach((k2) => (t += (inv.get(k2) || 0) - need.get(k2))); return t; };
    const c = HS.el('<div class="card"><h3>지시 조회 <small>배분LIST · ' + esc(fr) + ' ~ ' + esc(to) + ' · 날짜 × 브랜드별 최신 파일 · 1년 보관 (한 번에 31일까지) · WMS 현재고는 오늘 지시에만</small></h3><div class="q"></div></div>'); body.innerHTML = ''; body.appendChild(c);
    HS.qgrid(c.querySelector('.q'), {
      key: 'cs-alloc', xls: '출고지시조회', sheet: '지시 조회', empty: esc(fr) + ' ~ ' + esc(to) + ' 배분LIST가 없습니다',
      note: '지시 후 남는 재고 = WMS 현재고 − 오늘 그 SKU 지시 전부 · 지난 날짜는 "-"',
      filters: [
        { k: 'b', l: '브랜드', t: 'sel', get: (r) => r.b }, { k: 'kn', l: '의뢰구분', t: 'sel', get: (r) => r.kn }, { k: 'sn', l: '매장 (이름 · 코드)', t: 'txt', get: (r) => r.sn, get2: (r) => r.sc },
        { k: 'se', l: '시즌 (WMS 기준)', t: 'sel', get: (r) => r.se, label: seaL }, { k: 'gr', l: '복종 (WMS 기준)', t: 'sel', get: (r) => r.gr }, { k: 'st', l: '품번', t: 'txt', get: (r) => r.st, ph: '일부만 · 띄어 쓰면 여러 개' },
        { k: 'co', l: '색상', t: 'sel', get: (r) => r.co }, { k: 'sz', l: '사이즈', t: 'sel', get: (r) => r.sz, sort: szSort },
        { k: 'sh', l: '재고 부족만 (오늘)', t: 'chk', test: (r) => !!r.short, keep: false },
      ],
      cols: [
        { k: 'd', l: '보충일자', fmt: (v) => esc(String(v).slice(5)), xl: (v) => v }, { k: 'b', l: '브랜드' }, { k: 'st', l: '품번' }, { k: 'co', l: '색상' }, { k: 'sz', l: '사이즈' }, { k: 'yr', l: '기획년도', hide: true }, { k: 'se', l: '시즌', hide: true }, { k: 'gr', l: '복종', hide: true },
        { k: 'kn', l: '의뢰구분', many: 'list' }, { k: 'sc', l: '매장코드' }, { k: 'sn', l: '매장명' }, { k: 'ns', l: '매장 수', num: true, agg: 'distinct', dk: (r) => r.sc, get: () => 1 },
        { k: 'q', l: '지시 수량', num: true, hl: true, b: true },
        { k: 'iv', l: 'WMS 현재고', num: true, agg: ivAgg, get: (r) => (r.d === td ? r.iv : ''), noDetail: false },
        { k: 'rm', l: '지시 후 남는 재고', num: true, agg: remAgg, get: (r) => (r.d === td ? (inv.get(r.sku) || 0) - need.get(r.sku) : ''), cls: (v) => (v !== '' && v < 0 ? 'lowq' : ''), totCls: (v) => (v < 0 ? 'neg' : '') },
      ],
      units: [
        { id: 'sku', l: '품번 + 색상 + 사이즈', by: ['d', 'b', 'st', 'co', 'sz'], hide: ['sc', 'sn'] }, { id: 'raw', l: '상세 (매장 × SKU)', hide: ['ns'] },
        { id: 'sc', l: '품번 + 색상', by: ['d', 'b', 'st', 'co'], hide: ['sz', 'sc', 'sn'] },
        { id: 'dk', l: '날짜 × 의뢰구분', by: ['d', 'b'], hide: ['st', 'co', 'sz', 'kn', 'sc', 'sn', 'iv', 'rm', 'yr', 'se', 'gr'], pivot: { by: (r) => r.kn, val: 'q', sort: (a, b) => cmpD(a, b) } },
        { id: 'st', l: '매장별', by: ['d', 'b', 'sc', 'sn'], hide: ['st', 'co', 'sz', 'iv', 'rm', 'ns'] },
      ],
      unit: 'sku', sort: { k: 'q', d: true }, detailSort: (a, b) => b.q - a.q,
    }).setData(R);
  }
  const cmpD = (a, b) => String(a).localeCompare(String(b), 'ko', { numeric: true });
  const SZO = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', 'F', 'FREE'];
  const szSort = (a, b) => { const i = SZO.indexOf(a), j = SZO.indexOf(b); if (i >= 0 && j >= 0) return i - j; if (i >= 0 || j >= 0) return i >= 0 ? -1 : 1; return cmpD(a, b); };

  // ================= 로케이션 확인 팝업 (정상팀 · 관리자) =================
  // 로케이션 없음 기준 설정 (관리자 · 기준정보 'noloc_rule')
  HS.nolocSetting = async () => {
    const R = C.getNoloc(); let codes = R.codes.slice();
    const f = HS.el('<div class="form"><div class="f wide"><b>이렇게 적힌 위치도 "로케이션 없음"으로 셈</b><div id="nlc" style="margin:6px 0"></div><div style="display:flex;gap:6px"><input class="in" id="nli" placeholder="위치 이름 (예: TEMP · 입고대기)" style="flex:1"><button class="btn sm" id="nla">+ 추가</button></div><div class="mute" style="font-size:11.5px;margin-top:4px">빈칸은 항상 셈 · 실제 자리가 아닌 임시 위치 이름만 넣으세요 (대소문자 · 띄어쓰기 무시)</div></div>' +
      '<label class="f">현재고 몇 개 이상부터<input class="in" id="nlm" type="number" min="1" value="' + R.min + '"></label><label class="f">빨강 표시 기준 (비율 %)<input class="in" id="nlp" type="number" min="0" step="0.1" value="' + R.pct + '"></label><div class="f wide mute" style="font-size:12px">반품창고는 항상 빼고 계산합니다 · 바꾼 기준은 다음에 올리는 WMS 정상창고 파일부터 브랜드별 숫자에 들어갑니다</div></div>');
    const draw = () => { f.querySelector('#nlc').innerHTML = '<span class="tag">빈칸 (항상)</span> ' + codes.map((c, i) => '<span class="tag b">' + esc(c) + ' <a href="javascript:void 0" data-x="' + i + '">✕</a></span>').join(' '); f.querySelectorAll('[data-x]').forEach((a) => (a.onclick = () => { codes.splice(+a.dataset.x, 1); draw(); })); };
    const add = () => { const v = f.querySelector('#nli').value.toUpperCase().replace(/\s+/g, ''); if (v && codes.indexOf(v) < 0 && codes.length < 30) codes.push(v.slice(0, 30)); f.querySelector('#nli').value = ''; draw(); };
    f.querySelector('#nla').onclick = (e) => { e.preventDefault(); add(); }; f.querySelector('#nli').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    draw();
    const ok = await HS.modal('📍 로케이션 없음 기준 설정', f, [['취소', null], ['저장', true, 'p']], { onOk: async () => {
      const v = { codes, min: Math.max(1, Math.round(+f.querySelector('#nlm').value || 1)), pct: Math.max(0, +f.querySelector('#nlp').value || 0) };
      await HS.db.upsert('erp_settings', [{ key: 'noloc_rule', value: v }]); C.setNoloc(v);
    } });
    if (ok) { HS.toast('로케이션 없음 기준을 저장했습니다', 'ok'); HS.route(); }
  };
  const locTarget = () => HS.me && HS.me.active && (HS.me.role_id === 'admin' || (HS.me.teams || []).indexOf('정상1팀') >= 0) && HS.can('csdata', 'view');
  HS.locPopup = async (force) => {
    if (!locTarget()) return; const key = 'hs-loc-' + today();
    if (!force) { try { if (localStorage.getItem(key)) return; } catch (e) { /* 무시 */ } }
    const lines = await loadParts('wms', '정상창고'); const L = await latestFiles(); const f = L['wms|정상창고'];
    const nl = lines.filter((x) => C.isNoloc(x)).sort((a, b) => b[5] - a[5]);
    const cs = HS.curSeason ? HS.curSeason() : ''; let un = [];
    if (HS.can('newprod', 'view')) un = (await HS.db.list('erp_np_style', { eq: { season: cs } }).catch(() => [])).filter((r) => r.st_clean === '미정리' && r.st_out === '출고완료');
    if (!nl.length && !un.length) { if (force) HS.toast('로케이션 없는 재고 · 출고 후 미정리 신상품이 없습니다', 'ok'); return; }
    while (document.querySelector('.modal-bg')) await new Promise((r) => setTimeout(r, 800)); // 다른 창(공지 등) 닫힌 뒤
    const nlQ = nl.reduce((a, x) => a + x[5], 0);
    const body = HS.el('<div><div class="k3l"><div><b class="neg">' + fmt(nl.length) + '</b><span>재고 있는데 로케이션 없음 (SKU)</span></div><div><b>' + fmt(nlQ) + '</b><span>해당 재고 수량 (PCS)</span></div><div><b class="wa3">' + fmt(un.length) + '</b><span>신상품 출고 후 미정리 (스타일)</span></div></div><div id="lt"></div><div class="tw" id="lb" style="max-height:46vh;overflow:auto"></div></div>');
    let tab = nl.length ? 'nl' : 'un';
    const draw = () => {
      body.querySelector('#lt').innerHTML = ''; body.querySelector('#lt').appendChild(HS.seg([['nl', '① 로케이션 없음 ' + nl.length], ['un', '② 신상품 출고 후 미정리 ' + un.length]], tab, (x) => { tab = x; draw(); }));
      body.querySelector('#lb').innerHTML = tab === 'nl' ? '<table class="no-tools"><tr><th>브랜드</th><th>품번</th><th>색상</th><th>사이즈</th><th class="n">현재고</th><th>상태</th></tr>' + nl.slice(0, 300).map((x) => '<tr><td>' + esc(HS.bname(brandOf(x[0], x[1]))) + '</td><td>' + esc(x[1]) + '</td><td>' + esc(x[2]) + '</td><td>' + esc(x[3]) + '</td><td class="n">' + fmt(x[5]) + '</td><td class="neg">로케이션 없음</td></tr>').join('') + (nl.length > 300 ? '<tr><td colspan="6" class="mute">… 외 ' + (nl.length - 300) + '건 (엑셀 받기)</td></tr>' : '') + '</table>'
        : '<table class="no-tools"><tr><th>브랜드</th><th>품번</th><th class="n">입고</th><th class="n">출고</th><th class="n">재고</th><th>상태</th></tr>' + un.slice(0, 300).map((r) => '<tr><td>' + esc(HS.bname(r.brand)) + '</td><td>' + esc(r.style) + '</td><td class="n">' + fmt(r.in_qty) + '</td><td class="n">' + fmt(r.out_qty) + '</td><td class="n">' + fmt(r.stock) + '</td><td class="wa3">출고 후 미정리</td></tr>').join('') + '</table>';
    };
    draw();
    const v = await HS.modal('📍 로케이션 확인 필요', body, [['엑셀 받기', 'xl'], ['나중에', null], ['확인 (오늘 그만 보기)', 'ok', 'p']], { wide: true, onOpen: (bg) => { bg.classList.add('locpop'); const s = bg.querySelector('.mh b'); if (s && f) s.insertAdjacentHTML('afterend', ' <span class="mute" style="font-size:12px;font-weight:400">WMS 재고 ' + esc(hm(f.at)) + ' 기준</span>'); },
      onOk: async (x) => {
        if (x === 'xl') { HS.needXlsx(); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(nl.map((y) => ({ 브랜드: HS.bname(brandOf(y[0], y[1])), 품번: y[1], 색상: y[2], 사이즈: y[3], 현재고: y[5] }))), '로케이션 없음'); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(un.map((r) => ({ 브랜드: HS.bname(r.brand), 품번: r.style, 입고: r.in_qty, 출고: r.out_qty, 재고: r.stock }))), '출고 후 미정리'); XLSX.writeFile(wb, '로케이션확인_' + today() + '.xlsx'); return false; }
        if (x === 'ok') { try { localStorage.setItem(key, '1'); } catch (e) { /* 무시 */ } }
      } });
    return v;
  };

  // ================= 09:00 미업로드 알림 (지원팀 · 올리기 권한) =================
  let remindAt = 0;
  async function remind() {
    if (!HS.me || !HS.can('csdata', 'create') || HS.me.role_id === 'ceo') return;
    const n = new Date(); if (n.getDay() === 0 || n.getDay() === 6 || n.getHours() < 9 || Date.now() < remindAt || document.querySelector('.modal-bg')) return;
    const L = await latestFiles(); const hr = n.getHours(); const td = today();
    let aclOk = true, aLeft = []; if (hr >= 18) { const cl = await HS.allocClose(td); aclOk = !!(cl && cl.closed_at); if (!aclOk) { const sk = (cl && cl.skip) || []; const A = await HS.db.list('erp_cs_alloc', { eq: { d: td, k: 'all' } }).catch(() => []); aLeft = HS.allocTargets().filter((b) => sk.indexOf(b) < 0 && !A.some((x) => x.brand === b)); } }
    const miss = SRC.filter(([k, s, , , due]) => s !== '반품창고' && hr >= (due || 9) && (s === '배분LIST' ? !aclOk : !(L[k + '|' + s] && atDay(L[k + '|' + s].at) === td)));
    if (!miss.length) { remindAt = Date.now() + 6 * 3600e3; return; }
    remindAt = Date.now() + 30 * 60e3; // 나중에 → 30분 뒤
    const v = await HS.modal('⏰ 전산 자료 올리기', '<div style="line-height:1.9">아직 오늘 올라오지 않은 전산 자료가 있습니다<br>' + miss.map(([k, s, l]) => '· <b>' + esc(l) + '</b>' + (s === '배분LIST' ? ' <span class="neg">— 마감 안 됨' + (aLeft.length ? ' · 남은 브랜드: ' + aLeft.map((b) => esc(HS.bname(b))).join(', ') : '') + '</span>' : L[k + '|' + s] ? ' <span class="mute">— 마지막 ' + esc(hm(L[k + '|' + s].at)) + '</span>' : '')).join('<br>') + '</div>', [['나중에 (30분 뒤)', null], ['지금 올리기', 'go', 'p']], { onOpen: (bg) => bg.classList.add('csrem') });
    if (v === 'go') HS.go('csdash');
  }
  (HS.afterBoot = HS.afterBoot || []).push(() => {
    setTimeout(() => HS.locPopup(false), 4500);
    if (navigator.webdriver) return; // 자동 시험에서는 시간 알림 끔
    setTimeout(remind, 6000); setInterval(remind, 5 * 60e3);
  });
  HS.csRemind = remind;
})();
