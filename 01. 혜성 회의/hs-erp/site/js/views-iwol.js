/* 이월팀 — 시즌반품정리현황(iwret) · 선지시출고현황(iwout)   2026-11-24
 *  · 이월팀 단독판(이월팀_출고관리_단독판.html)을 사이트로 옮긴 것. 화면 · 계산은 그대로,
 *    저장만 이 브라우저(localStorage) → 사이트 DB(Supabase · sql/33_iwol.sql) 로 바꿨다.
 *  · 2026-11-23 에 폐기한 옛 시즌 계획(views-season.js)과는 아무 상관이 없다. 옛 자료는 건드리지 않는다.
 *  · 품번 규칙은 '2026_전브랜드_지시대비출고_v7.xlsx' 의 [구분 기준] 시트 그대로.
 *  · 단가 · 금액 칸은 엑셀에 있어도 읽지 않는다 (화면 · DB 어디에도 안 남는다).
 *
 *  화면
 *   선지시출고현황 : ① 배분지시  ② 출고 작업 현황  ③ 출고 일정
 *   시즌반품정리현황: ④ 시즌 반품 정리  ⑤ 시즌 정리 일정
 *
 *  ⚠ 날짜는 UTC 로만 계산한다 (addD · dow). HS.addDays 는 지역 시간이라 하루 밀린다.
 *  ⚠ 클래스 이름은 전부 .iwol 안에서만 쓰는 것 (css/iwol.css) — app.css 와 겹치지 않게 감싸 두었다.
 */
(function () {
  'use strict';
  const esc = HS.esc;
  const el = HS.el;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const fmt = (n) => (n == null || n === '' || isNaN(n) ? '' : Math.round(n).toLocaleString('ko-KR'));
  const txt = (v) => String(v == null ? '' : v).trim();
  const num = (v) => { const n = +String(v == null ? '' : v).replace(/[,\s]/g, ''); return isFinite(n) ? n : 0; };

  // ---------- 품번에서 브랜드 · 시즌 · 복종 읽기 ([구분 기준] 시트) ----------
  const BRAND = { 1: '핑', 2: '팬텀', 4: '바니', 5: '파리', 8: '세인트', L: '링스', H: '하이', 6: '고커' };
  const CLS6 = { T: 'TS', S: 'SW', P: 'PT', J: 'JK' };
  const GRP = { TS: '이너', SW: '이너', PT: '이너', JK: 'JK', ACC: 'ACC' };
  const SE_NAME = { 1: '봄', 2: '여름', 3: '가을', 4: '겨울', 5: 'S/S', 6: 'F/W', 7: '논시즌' };
  const brandOf = (sty) => BRAND[String(sty || '').toUpperCase()[0]] || '(미확인)';
  const seasonOf = (sty) => { const s = String(sty || '').toUpperCase().slice(3, 5); return /^[A-Z]\d$/.test(s) ? s : ''; };
  const seaName = (code) => SE_NAME[String(code || '')[1]] || code || '';
  const clsOf = (sty) => {
    const s = String(sty || '').toUpperCase(); const b = brandOf(s); const two = s.slice(5, 7);
    if (['핑', '팬텀', '링스'].indexOf(b) >= 0 && (two === 'JO' || two === 'JS')) return 'TS'; // 엑셀 규칙
    return CLS6[s[5]] || 'ACC';
  };
  const grpOf = (sty) => GRP[clsOf(sty)] || 'ACC';
  // 매장명으로 구분
  const kindOf = (store) => { const t = txt(store); if (/온라인/.test(t)) return 'online'; if (/배분\s*잔량/.test(t)) return 'rest'; return 'store'; };

  // ---------- 권한 ----------
  //  보기 = 모든 직원 · 올리기 · 고치기 = 이월소터팀 + 관리자 (2026-11-24 행님 결정 · sql/33_iwol.sql 과 같은 규칙)
  //  ⚠ HS.teamOk 는 '전체 권한'(scope all)이면 어느 팀이든 참이라 지원팀까지 열린다 →
  //    팀 이름을 직접 보고, 관리자는 users.edit(관리자만 가진 권한)으로 가린다
  const canTeam = () => HS.can('iwol', 'create') && (((HS.me && HS.me.teams) || []).indexOf('이월소터팀') >= 0 || HS.can('users', 'edit'));
  //  마감 확정한 기간은 아무도 못 고친다 (sql/35_iwol_term.sql 과 같은 규칙)
  const canW = () => canTeam() && !isClosed();

  // ---------- 운영 기간 (상 · 하반기 · 2026-11-25) ----------
  const curTerm = () => { const d = new Date(); return d.getFullYear() + (d.getMonth() + 1 <= 6 ? 'H1' : 'H2'); };
  const nextTerm = (t) => (String(t).slice(-2) === 'H1' ? String(t).slice(0, 4) + 'H2' : String(+String(t).slice(0, 4) + 1) + 'H1');
  const termLabel = (t) => String(t).slice(0, 4) + (String(t).slice(-2) === 'H1' ? ' 상반기' : ' 하반기');
  const isClosed = () => (D.terms || []).some((x) => x.term === D.term && x.closed);

  // ---------- 자료 (한 번 읽어 두고 화면에서 돌려 씀) ----------
  const D0 = () => ({
    set: { out: { sorter: 30000, jk: 10000, start: '', off: '' }, ret: { 이너: 20000, JK: 8000, ACC: 5000, start: '' } },
    ord: [], shp: [], inv: [], cnt: [], sst: { out: {}, ret: {} }, man: { out: {}, ret: {} }, band: [],
    term: '', terms: [],
  });
  let D = D0();
  let loadedTerm = null;
  async function loadAll(term, force) {
    const t = term || D.term || curTerm();
    if (loadedTerm === t && !force) return D;
    const safe = (p) => p.catch((e) => { console.warn('iwol', e); return []; });
    const Q = { eq: { term: t } };
    const [terms, ord, shp, inv, cnt, st, sst, man, band] = await Promise.all([
      safe(HS.db.list('erp_iw_term', {})),
      safe(HS.db.list('erp_iw_ord', Q)), safe(HS.db.list('erp_iw_shp', Q)), safe(HS.db.list('erp_iw_inv', Q)),
      safe(HS.db.list('erp_iw_cnt', Q)), safe(HS.db.list('erp_iw_set', {})), safe(HS.db.list('erp_iw_sst', Q)),
      safe(HS.db.list('erp_iw_man', Q)), safe(HS.db.list('erp_iw_band', Q)),
    ]);
    const n = D0();
    n.term = t;
    // 기간 목록 — DB 에 아직 없으면 지금 기간을 보여 준다 (sql/35 를 안 돌린 사이트도 열리게)
    n.terms = terms.length ? terms.slice().sort((a, b) => (a.term < b.term ? 1 : -1)) : [{ term: curTerm(), label: termLabel(curTerm()), closed: false }];
    if (!n.terms.some((x) => x.term === t)) n.terms.unshift({ term: t, label: termLabel(t), closed: false });
    n.ord = ord; n.shp = shp; n.inv = inv; n.cnt = cnt;
    st.forEach((r) => { if (n.set[r.key]) Object.assign(n.set[r.key], r.val || {}); });
    sst.forEach((r) => { if (n.sst[r.kind] && r.start_date) n.sst[r.kind][r.gkey] = String(r.start_date).slice(0, 10); });
    man.forEach((r) => { if (n.man[r.kind]) n.man[r.kind][r.grp + '|' + String(r.d).slice(0, 10)] = +r.people || 0; });
    n.band = band.map((r) => ({ id: r.id, l: +r.lane || 0, s: String(r.s || '').slice(0, 10), e: String(r.e || '').slice(0, 10), x: r.label || '', c: r.color || '#2B3A67' }));
    D = n; loadedTerm = t; return D;
  }

  // ---------- 화면 설정은 이 브라우저에만 (묶음 차례 · 보일 칸 · 보기 · 거르기) ----------
  const F0 = () => ({ g: '', b: '', se: '', d1: '', d2: '', left: false, store: false });
  const uiKey = (kind) => 'hs.iwol.' + kind;
  function loadUI(kind) {
    let v = {}; try { v = JSON.parse(localStorage.getItem(uiKey(kind)) || '{}') || {}; } catch (e) { /* 처음 */ }
    return { ord: Array.isArray(v.ord) ? v.ord : null, cols: Array.isArray(v.cols) ? v.cols : null, view: v.view || '', f: Object.assign(F0(), v.f || {}) };
  }
  const saveUI = (kind, u) => { try { localStorage.setItem(uiKey(kind), JSON.stringify(u)); } catch (e) { /* 무시 */ } };

  // ---------- 엑셀 읽기 ----------
  const readSheets = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { try { const wb = XLSX.read(new Uint8Array(r.result), { type: 'array', cellDates: false });
      res(wb.SheetNames.map((nm) => ({ name: nm, rows: XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, raw: true, blankrows: false }) }))); } catch (e) { rej(e); } };
    r.onerror = () => rej(new Error('파일을 읽지 못했습니다')); r.readAsArrayBuffer(file);
  });
  const xlDate = (v) => {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30 + Math.floor(v))); return d.toISOString().slice(0, 10); }
    const t = txt(v).replace(/[./]/g, '-'); const m = t.match(/(20\d\d)-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    const m2 = t.match(/^(20\d\d)(\d\d)(\d\d)$/); if (m2) return m2[1] + '-' + m2[2] + '-' + m2[3];
    return '';
  };
  // 머리글 찾기 — 칸 이름으로 (자리 번호를 믿지 않는다 · 파일마다 칸 수가 다르다)
  const HCOL = {
    style: /^품번$|스타일|^style$/i, store: /매장명|^매장$/, scode: /매장코드/, qty: /출고수량|의뢰수량|지시수량|^수량$|배분수량/,
    // 날짜는 '등록일자'(실제로 일한 날)를 먼저 쓴다 — 출고일자는 앞날로 잡혀 한 칸에 몰린다 (2026-11-23 행님 확인)
    reg: /등록일자|입력일자/, date: /출고일자|^일자$|^날짜$|출고일/, inv: /송장번호/, color: /색상|칼라/, size: /사이즈/, brand: /브랜드/, kind: /출고구분|^구분$/,
  };
  function findHead(rows) {
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const m = {}; (rows[r] || []).forEach((v, c) => { const t = txt(v).replace(/\s+/g, ''); if (!t) return; for (const k in HCOL) if (HCOL[k].test(t) && m[k] == null) m[k] = c; });
      if (m.style != null && m.qty != null) return { r, ix: m, names: (rows[r] || []).map(txt) };
    }
    return null;
  }
  // WMS [출고/반품관리 › 출고관리 › 판매분 확정등록] — 매장이 가로로 펼쳐진 표
  function findPivot(rows) {
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const t = (rows[r] || []).map((v) => txt(v).replace(/\s+/g, ''));
      const st = t.indexOf('품번'); const tq = t.findIndex((x) => /^총수량$|^합계$/.test(x));
      if (st < 0 || tq < 0 || t.length - tq < 5) continue;
      const up = (rows[r - 1] || []).map((v) => txt(v).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' '));
      const cols = [];
      for (let c = tq + 1; c < t.length; c++) { const nm = up[c] || t[c]; if (!nm) continue; cols.push({ c, nm, k: kindOf(nm) }); }
      if (cols.length >= 3) return { r, style: st, tot: tq, cols };
    }
    return null;
  }
  // 취합본 — 품번 한 줄에 매장지시 · 온라인지시 · 배분잔량이 이미 갈라져 있는 표
  //  (복종그룹 칸이 있어도 안 쓴다 — 묶음은 품번에서 뽑은 규칙으로 통일 · 2026-11-24 행님 확인)
  const SUMC = { style: /^품번$/, all: /^전체지시$|^지시합계$|^총지시$/, store: /^매장지시$/, online: /^온라인지시$/, rest: /^배분잔량$/, did: /^출고합계$/ };
  function findSum(rows) {
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const m = {}; (rows[r] || []).forEach((v, c) => { const t = txt(v).replace(/\s+/g, ''); if (!t) return; for (const k in SUMC) if (SUMC[k].test(t) && m[k] == null) m[k] = c; });
      if (m.style != null && (m.store != null || m.online != null || m.rest != null)) return { r, ix: m };
    }
    return null;
  }
  // 재고현황 · 재고실사현황 (머리글이 둘째 줄인 파일이 있다)
  const nm2 = (v) => txt(v).replace(/\s+/g, '');
  const pick = (names, pats) => { for (const p of pats) { const i = names.findIndex((t) => p.test(t)); if (i >= 0) return i; } return -1; };
  const ST_C = [/^품번$/, /^스타일$|스타일No/i, /^STYLE$/i];
  const INV_Q = [/^현재고$/, /^재고수량$/, /^누적재고/, /^재고$/, /^수량$/];
  const CNT_Q = [/^실사수량$/, /^실사$/, /실사.*수량/, /^정리수량$/, /^작업수량$/, /^수량$/];
  const CNT_D = [/^입력일자$/, /^실사일자$/, /^등록일자$/, /^일자$|^날짜$/];
  function findCols(rows, qp, dp) {
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const names = (rows[r] || []).map(nm2);
      const s = pick(names, ST_C); if (s < 0) continue;
      const q = pick(names, qp); if (q < 0) continue;
      const d = dp ? pick(names, dp) : -1; if (dp && d < 0) continue;
      return { r, s, q, d, names, color: pick(names, [/^색상$/, /^칼라$/]), size: pick(names, [/^사이즈$/]) };
    }
    return null;
  }

  // ---------- 집계 ----------
  function aggOrd() { // 품번별 지시 → 브랜드 × 시즌 × 복종그룹
    const g = new Map();
    for (const r of D.ord) {
      const k = r.brand + '|' + r.season + '|' + r.grp;
      const o = g.get(k) || g.set(k, { b: r.brand, se: r.season, g: r.grp, store: 0, online: 0, rest: 0, all: 0, sty: new Set() }).get(k);
      o.store += +r.store || 0; o.online += +r.online || 0; o.rest += +r.rest || 0;
      o.all += (+r.store || 0) + (+r.online || 0) + (+r.rest || 0); o.sty.add(r.style);
    }
    return [...g.values()];
  }
  function aggShp() { // 출고 → 브랜드 × 시즌 × 복종그룹 · 날짜별
    const g = new Map(); const byD = new Map();
    for (const s of D.shp) {
      const k = s.brand + '|' + s.season + '|' + s.grp;
      const o = g.get(k) || g.set(k, { b: s.brand, se: s.season, g: s.grp, store: 0, online: 0, rest: 0, all: 0 }).get(k);
      const q = +s.qty || 0; o[s.kind] = (o[s.kind] || 0) + q; o.all += q;
      const dk = k + '|' + dOf(s.d); byD.set(dk, (byD.get(dk) || 0) + q);
    }
    return { g, byD };
  }
  const dOf = (v) => String(v || '').slice(0, 10);
  const shDates = () => [...new Set(D.shp.map((s) => dOf(s.d)))].filter(Boolean).sort();
  const cntDates = () => [...new Set(D.cnt.map((s) => dOf(s.d)))].filter(Boolean).sort();
  function aggSrt() { // 브랜드 × 시즌 × 복종그룹 — 정리 기준 · 실적
    const g = new Map();
    const get = (b, se, gr) => { const k = b + '|' + se + '|' + gr; return g.get(k) || g.set(k, { b, se, g: gr, base: 0, done: 0, sty: new Set() }).get(k); };
    D.inv.forEach((r) => { const o = get(r.brand, r.season, r.grp); o.base += +r.qty || 0; o.sty.add(r.style); });
    D.cnt.forEach((r) => { get(r.brand, r.season, r.grp).done += +r.qty || 0; });
    return [...g.values()];
  }
  const srtItems = () => aggSrt().map((x) => Object.assign(x, { all: Math.max(0, x.base - x.done) }));
  const srtByD = () => { const m = new Map(); D.cnt.forEach((r) => { const k = r.brand + '|' + r.season + '|' + r.grp + '|' + dOf(r.d); m.set(k, (m.get(k) || 0) + (+r.qty || 0)); }); return m; };

  // ---------- 휴무일 · 날짜 (UTC 로만 계산) ----------
  const addD = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dow = (s) => new Date(s + 'T00:00:00Z').getUTCDay();
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  // 휴무일 목록은 프로그램 공용(HS.HOLIDAYS) — 새 목록을 만들지 말 것
  const offSet = () => new Set((HS.HOLIDAYS || []).concat(String(D.set.out.off || '').split(/[\s,]+/).map(xlDate).filter(Boolean)));
  const workDay = (s, off) => dow(s) !== 0 && dow(s) !== 6 && !off.has(s);
  const md = (s) => (s ? (+s.slice(5, 7)) + '/' + (+s.slice(8, 10)) : '');
  const today = () => HS.today();

  // ---------- 일정 계산 (③ 출고 일정 · ⑤ 시즌 정리 일정 한 엔진) ----------
  const BRAND_ORD = ['파리', '바니', '세인트', '핑', '팬텀', '링스', '고커', '하이'];
  const GRP_ORD = ['이너', 'JK', 'ACC'];
  const brOrd = (b) => { const i = BRAND_ORD.indexOf(b); return i < 0 ? 90 : i; };
  const grpOrd = (g) => { const i = GRP_ORD.indexOf(g); return i < 0 ? 90 : i; };
  const seOrd = (se) => { const s = String(se || ''); return (s[1] === '1' ? 0 : s[1] === '2' ? 1 : 2) * 100 + (90 - (s.charCodeAt(0) || 0)); };

  function schedCalc(items, capOf, start0, brandFirst, sst) {
    const off = offSet();
    const gs = [...new Set(GRP_ORD.concat(items.map((x) => x.g)))].filter((g) => items.some((x) => x.g === g));
    const out = [];
    for (const g of gs) {
      const mine = items.filter((x) => x.g === g).sort((a, b) => (brandFirst
        ? (brOrd(a.b) - brOrd(b.b) || seOrd(a.se) - seOrd(b.se))
        : (seOrd(a.se) - seOrd(b.se) || brOrd(a.b) - brOrd(b.b))));
      const cap = capOf(g) || 1;
      let d = start0; while (!workDay(d, off)) d = addD(d, 1);
      let used = 0; const rows = [];
      for (const x of mine) {
        const key = x.b + '|' + x.se + '|' + x.g; const man = sst[key];
        // 손으로 고친 시작일이 있으면 그 날부터 — 뒷줄도 따라 밀린다 (2026-11-24 행님 지시)
        if (man) { d = man; used = 0; }
        while (!workDay(d, off)) d = addD(d, 1);
        const st = d;
        if (!(x.all > 0)) { rows.push(Object.assign({}, x, { key, man: !!man, days: 0, st, en: st })); continue; }
        let left = x.all; let n = 0;
        while (left > 0 && n < 400) {
          if (!workDay(d, off)) { d = addD(d, 1); used = 0; continue; }
          const room = Math.max(1, cap - used); const take = Math.min(left, room); left -= take; used += take;
          if (left <= 0) break; d = addD(d, 1); used = 0; n++;
        }
        rows.push(Object.assign({}, x, { key, man: !!man, days: Math.round(x.all / cap * 1000) / 1000, st, en: d }));
        if (used >= cap) { d = addD(d, 1); used = 0; }
      }
      out.push({ g, rows });
    }
    return out;
  }
  // 런닝타임 = 맨 처음 시작일 ~ 맨 마지막 종료일 (운영가능일 칸은 2026-11-24 행님 지시로 없앰)
  function runSpan(P) {
    let s = '', e = '';
    P.forEach((G) => G.rows.forEach((r) => { if (!s || r.st < s) s = r.st; if (!e || r.en > e) e = r.en; }));
    const days = s && e ? Math.round((new Date(e + 'T00:00:00Z') - new Date(s + 'T00:00:00Z')) / 864e5) + 1 : 0;
    const off = offSet(); let w = 0; if (s && e) { let d = s; while (d <= e) { if (workDay(d, off)) w++; d = addD(d, 1); } }
    return { st: s, en: e, days, work: w };
  }
  function plan() { // ③ 출고 일정
    const SH = aggShp();
    const P = schedCalc(aggOrd(), (g) => (g === 'JK' ? +D.set.out.jk : +D.set.out.sorter), D.set.out.start || today(), false, D.sst.out);
    P.forEach((G) => G.rows.forEach((r) => { r.did = (SH.g.get(r.key) || {}).all || 0; r.day = (dd) => SH.byD.get(r.key + '|' + dd) || 0; }));
    return P;
  }
  function planSrt() { // ⑤ 시즌 정리 일정 — 일정은 '남은 수량'(정리 대상 − 정리 완료)으로 잡는다
    const BD = srtByD();
    const P = schedCalc(srtItems(), (g) => +D.set.ret[g], D.set.ret.start || today(), true, D.sst.ret);
    P.forEach((G) => G.rows.forEach((r) => { r.did = r.done; r.day = (dd) => BD.get(r.key + '|' + dd) || 0; }));
    return P;
  }

  // ---------- 올리는 칸 ----------
  function dropBox(label, hint, onFiles) {
    const w = el('<div class="iwdrop"><b>' + esc(label) + '</b><div class="iwm" style="font-size:12px;margin-top:4px">' + hint + '</div><input type="file" multiple accept=".xlsx,.xls,.csv" class="iwhide"></div>');
    const fi = $('input', w);
    w.onclick = (e) => { if (e.target !== fi) fi.click(); };
    w.ondragover = (e) => { e.preventDefault(); w.classList.add('over'); };
    w.ondragleave = () => w.classList.remove('over');
    w.ondrop = (e) => { e.preventDefault(); w.classList.remove('over'); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); };
    fi.onchange = () => { if (fi.files.length) onFiles([...fi.files]); fi.value = ''; };
    return w;
  }
  const noPerm = (what) => el('<div class="iwm" style="font-size:12px;margin-bottom:12px">' + esc(what) + ' 은(는) <b>이월소터팀 · 관리자</b>만 올릴 수 있습니다. 보기는 그대로 됩니다.</div>');

  // ================= ① 배분지시 =================
  function viewOrd(body, redraw) {
    if (canW()) body.appendChild(dropBox('배분(지시) 엑셀 놓기 · 대량 등록',
      '<b>두 가지 양식</b>을 다 읽습니다 — 칸 이름으로 저절로 가립니다<br>① <b>원본 배분 파일</b> (품번 · 매장명 · 수량 / 매장이 가로로 펼쳐진 WMS 판매분 확정등록도 됨) · 매장명에 <b>온라인</b> → 온라인지시 · <b>배분잔량</b> → 배분잔량 · 나머지 → 매장지시<br>② <b>취합본</b> (품번 한 줄에 매장지시 · 온라인지시 · 배분잔량이 이미 갈라져 있는 표)',
      (fs) => ordUpload(fs, redraw)));
    else body.appendChild(noPerm('배분지시 엑셀'));
    const A = aggOrd();
    if (!A.length) { body.appendChild(el('<div class="card"><div class="empty">배분 엑셀을 올리면 브랜드 · 시즌 · 복종별 지시 수량이 나옵니다</div></div>')); return; }
    const S = aggShp();
    const tot = { store: 0, online: 0, rest: 0, all: 0, did: 0 };
    const rows = A.sort((a, b) => (brOrd(a.b) - brOrd(b.b) || seOrd(a.se) - seOrd(b.se) || grpOrd(a.g) - grpOrd(b.g)));
    const body2 = rows.map((x) => { const did = (S.g.get(x.b + '|' + x.se + '|' + x.g) || {}).all || 0;
      tot.store += x.store; tot.online += x.online; tot.rest += x.rest; tot.all += x.all; tot.did += did;
      return '<tr><td>' + esc(x.b) + '</td><td>' + esc(x.se) + ' <span class="iwm">' + esc(seaName(x.se)) + '</span></td><td>' + esc(x.g) + '</td><td class="n">' + fmt(x.sty.size) + '</td>'
        + '<td class="n">' + fmt(x.all) + '</td><td class="n">' + fmt(x.store) + '</td><td class="n">' + fmt(x.online) + '</td><td class="n">' + fmt(x.rest) + '</td>'
        + '<td class="n">' + fmt(did) + '</td><td class="n">' + (x.all ? (did / x.all * 100).toFixed(1) + '%' : '-') + '</td></tr>'; }).join('');
    const c = el('<div class="card"><h3>브랜드 · 시즌 · 복종별 지시 <small>품번 ' + fmt(D.ord.length) + '개 · 매장지시 = 전체지시 − 온라인 − 배분잔량</small><span class="sp"></span></h3><div class="iwtw"><table class="no-no">'
      + '<thead><tr><th>브랜드</th><th>시즌</th><th>복종그룹</th><th class="n">품번수</th><th class="n">전체지시</th><th class="n">매장지시</th><th class="n">온라인지시</th><th class="n">배분잔량</th><th class="n">출고합계</th><th class="n">출고율</th></tr></thead>'
      + '<tbody>' + body2 + '</tbody><tfoot><tr class="iwtot"><td colspan="4">합계</td><td class="n">' + fmt(tot.all) + '</td><td class="n">' + fmt(tot.store) + '</td><td class="n">' + fmt(tot.online) + '</td><td class="n">' + fmt(tot.rest) + '</td><td class="n">' + fmt(tot.did) + '</td><td class="n">' + (tot.all ? (tot.did / tot.all * 100).toFixed(1) + '%' : '-') + '</td></tr></tfoot></table></div></div>');
    const bt = el('<button class="btn sm">엑셀 받기</button>'); $('h3', c).appendChild(bt);
    bt.onclick = () => HS.download('이월팀_배분지시_' + today() + '.xlsx', rows.map((x) => ({ 브랜드: x.b, 시즌: x.se, 복종그룹: x.g, 품번수: x.sty.size, 전체지시: x.all, 매장지시: x.store, 온라인지시: x.online, 배분잔량: x.rest, 출고합계: (S.g.get(x.b + '|' + x.se + '|' + x.g) || {}).all || 0 })), '배분지시').catch(HS.err);
    body.appendChild(c);
  }
  async function ordUpload(files, redraw) {
    try {
      await HS.xlsx();
      const agg = new Map(); let lines = 0, skip = 0; const kinds = { store: 0, online: 0, rest: 0 }; let names = []; let wide = 0, sum = 0, didQ = 0;
      const put = (sty, k, q) => { const se = seasonOf(sty); if (!se) { skip++; return false; }
        const o = agg.get(sty) || agg.set(sty, { style: sty, brand: brandOf(sty), season: se, cls: clsOf(sty), grp: grpOf(sty), store: 0, online: 0, rest: 0 }).get(sty);
        o[k] += q; kinds[k] += q; return true; };
      for (const f of files) for (const sh of await readSheets(f)) {
        const sm = findSum(sh.rows);
        if (sm) { // 취합본 — 지시가 이미 갈라져 있다
          sum++;
          for (let r = sm.r + 1; r < sh.rows.length; r++) {
            const x = sh.rows[r]; if (!x) continue; const sty = txt(x[sm.ix.style]).toUpperCase();
            if (!sty || sty === '품번') continue;
            const on = sm.ix.online != null ? num(x[sm.ix.online]) : 0;
            const rs = sm.ix.rest != null ? num(x[sm.ix.rest]) : 0;
            const st = sm.ix.store != null ? num(x[sm.ix.store]) : (sm.ix.all != null ? num(x[sm.ix.all]) - on - rs : 0);
            if (sm.ix.did != null) didQ += num(x[sm.ix.did]);
            if (!(st || on || rs)) continue;
            if (!seasonOf(sty)) { skip++; continue; }
            if (st) put(sty, 'store', st);
            if (on) put(sty, 'online', on);
            if (rs) put(sty, 'rest', rs);
            lines++;
          }
          continue;
        }
        const p = findPivot(sh.rows);
        if (p) { // 매장이 가로로 펼쳐진 표
          wide++;
          for (let r = p.r + 1; r < sh.rows.length; r++) {
            const x = sh.rows[r]; if (!x) continue; const sty = txt(x[p.style]).toUpperCase();
            if (!sty || sty === '품번') continue;
            let any = false;
            for (const c of p.cols) { const q = num(x[c.c]); if (q) { if (put(sty, c.k, q)) any = true; } }
            if (any) lines++;
          }
          continue;
        }
        const h = findHead(sh.rows); if (!h) continue; names = h.names;
        for (let r = h.r + 1; r < sh.rows.length; r++) {
          const x = sh.rows[r]; if (!x) continue; const sty = txt(x[h.ix.style]).toUpperCase();
          if (!sty || sty === '품번') continue; const q = num(x[h.ix.qty]); if (!q) continue;
          if (put(sty, kindOf(h.ix.store != null ? x[h.ix.store] : ''), q)) lines++;
        }
      }
      if (!agg.size) throw new Error('품번 · 수량 칸을 찾지 못했습니다. 읽은 칸 이름: ' + (names.slice(0, 14).join(', ') || '없음'));
      const list = [...agg.values()];
      const by = new Map(); list.forEach((x) => { const k = x.brand + '|' + x.grp; by.set(k, (by.get(k) || 0) + x.store + x.online + x.rest); });
      const had = new Set(D.ord.map((x) => x.style)); const isNew = list.filter((x) => !had.has(x.style)).length;
      const pre = '<div style="line-height:1.8"><b>' + fmt(lines) + '줄</b> · 품번 <b>' + fmt(list.length) + '개</b> · 전체 <b>' + fmt(kinds.store + kinds.online + kinds.rest) + '장</b>'
        + (sum ? ' <span class="iwm">(취합본 — 지시가 이미 갈라져 있는 파일)</span>' : wide ? ' <span class="iwm">(매장이 가로로 펼쳐진 WMS 판매분 확정등록 파일)</span>' : '') + '<br>'
        + '매장지시 ' + fmt(kinds.store) + ' · 온라인지시 ' + fmt(kinds.online) + ' · 배분잔량 ' + fmt(kinds.rest) + '<br>'
        + '새 품번 <b>' + fmt(isNew) + '</b>개 · 이미 있던 품번 ' + fmt(list.length - isNew) + '개는 이 파일 값으로 바뀝니다'
        + (didQ ? '<br><span class="iwm">이 파일의 <b>출고수량 ' + fmt(didQ) + '장</b>은 날짜가 없어 안 넣습니다 — 출고는 ② 화면에서 올리세요</span>' : '')
        + (skip ? '<br><span class="neg">시즌을 못 읽은 ' + fmt(skip) + '줄은 뺐습니다</span>' : '') + '</div>'
        + '<div class="iwtw" style="margin-top:8px;max-height:46vh;overflow:auto"><table class="no-no"><thead><tr><th>브랜드</th><th>복종그룹</th><th class="n">지시 수량</th></tr></thead><tbody>'
        + [...by.entries()].sort().map(([k, v]) => '<tr><td>' + esc(k.split('|')[0]) + '</td><td>' + esc(k.split('|')[1]) + '</td><td class="n">' + fmt(v) + '</td></tr>').join('')
        + '</tbody></table></div><div class="iwm" style="font-size:11.5px;margin-top:8px"><b>품번 단위로 덮어씁니다.</b> 이 파일에 없는 품번(다른 브랜드 등)은 그대로 둡니다 — 브랜드별로 나눠 올려도 됩니다</div>';
      if (!(await HS.modal('배분지시 확인', '<div class="iwol">' + pre + '</div>', [['취소', null], ['등록', true, 'p']], { wide: true }))) return;
      await HS.db.upsert('erp_iw_ord', list.map((x) => Object.assign({ term: D.term }, x)));
      await loadAll(D.term, true); redraw();
      HS.toast('배분지시 품번 ' + fmt(list.length) + '개를 넣었습니다 (새 ' + fmt(isNew) + ' · 모두 ' + fmt(D.ord.length) + ')', 'ok');
    } catch (e) { HS.err(e); }
  }

  // ================= ② 출고 작업 현황 =================
  function viewShp(body, redraw) {
    if (canW()) body.appendChild(dropBox('출고 엑셀 놓기 · 대량 등록 (매일 이어서)',
      '칸 이름으로 저절로 찾습니다 · 날짜는 <b>등록일자</b>(실제로 일한 날)를 먼저 씁니다<br>같은 줄은 <b>송장번호 · 매장코드 · 출고구분 · 품번 · 색상 · 사이즈 · 날짜</b>를 열쇠로 덮어써 두 번 쌓이지 않습니다',
      (fs) => shpUpload(fs, redraw)));
    else body.appendChild(noPerm('출고 엑셀'));
    const S = D.shp;
    if (!S.length) { body.appendChild(el('<div class="card"><div class="empty">출고 엑셀을 올리면 지시 대비 출고 현황이 나옵니다</div></div>')); return; }
    const ds = shDates(); const A = aggOrd(); const G = aggShp();
    const byDay = new Map(); S.forEach((s) => byDay.set(dOf(s.d), (byDay.get(dOf(s.d)) || 0) + (+s.qty || 0)));
    body.appendChild(el('<div class="card"><h3>날짜별 출고 <small>' + esc(ds[0] || '') + ' ~ ' + esc(ds[ds.length - 1] || '') + ' · ' + ds.length + '일 · 모두 ' + fmt(S.reduce((x, s) => x + (+s.qty || 0), 0)) + '장</small></h3><div class="iwtw"><table class="no-no"><thead><tr><th>출고일자</th><th>요일</th><th class="n">출고 수량</th><th class="n">누계</th></tr></thead><tbody>'
      + (() => { let c = 0; return ds.slice(-30).map((d) => { c += byDay.get(d) || 0; return '<tr><td>' + esc(d) + '</td><td>' + WD[dow(d)] + '</td><td class="n">' + fmt(byDay.get(d)) + '</td><td class="n">' + fmt(c) + '</td></tr>'; }).join(''); })()
      + '</tbody></table></div>' + (ds.length > 30 ? '<div class="iwm" style="font-size:11.5px;margin-top:6px">마지막 30일만 보여 줍니다</div>' : '') + '</div>'));
    const rows = A.sort((a, b) => (brOrd(a.b) - brOrd(b.b) || seOrd(a.se) - seOrd(b.se) || grpOrd(a.g) - grpOrd(b.g)));
    const t = { all: 0, s: 0, o: 0, r: 0 };
    // 배분지시에 없는 출고는 표에 안 들어가므로 따로 알려 준다
    const okK = new Set(A.map((x) => x.b + '|' + x.se + '|' + x.g));
    const miss = new Map(); let missQ = 0;
    S.forEach((s) => { const k = s.brand + '|' + s.season + '|' + s.grp; if (okK.has(k)) return; missQ += +s.qty || 0;
      const lab = s.brand + ' ' + s.season + ' ' + s.grp; miss.set(lab, (miss.get(lab) || 0) + (+s.qty || 0)); });
    if (missQ) body.appendChild(el('<div class="card iwbad"><h3>배분지시에 없는 출고 ' + fmt(missQ) + '장 <small>그 브랜드 · 시즌 · 복종의 배분 파일을 아직 안 올렸습니다 — 올리면 저절로 붙습니다</small></h3><div class="iwtw"><table class="no-no"><thead><tr><th>브랜드 · 시즌 · 복종</th><th class="n">출고 수량</th></tr></thead><tbody>'
      + [...miss.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td class="n">' + fmt(v) + '</td></tr>').join('')
      + '</tbody></table></div></div>'));
    const c2 = el('<div class="card"><h3>지시 대비 출고 <small>매장 · 온라인 · 배분잔량 각각</small><span class="sp"></span></h3><div class="iwtw"><table class="no-no">'
      + '<thead><tr><th>브랜드</th><th>시즌</th><th>복종그룹</th><th class="n">전체지시</th><th class="n">매장출고</th><th class="n">온라인출고</th><th class="n">배분잔량출고</th><th class="n">출고합계</th><th class="n">미출고</th><th class="n">출고율</th></tr></thead><tbody>'
      + rows.map((x) => { const g = G.g.get(x.b + '|' + x.se + '|' + x.g) || { store: 0, online: 0, rest: 0, all: 0 };
        t.all += x.all; t.s += g.store || 0; t.o += g.online || 0; t.r += g.rest || 0;
        return '<tr><td>' + esc(x.b) + '</td><td>' + esc(x.se) + '</td><td>' + esc(x.g) + '</td><td class="n">' + fmt(x.all) + '</td><td class="n">' + fmt(g.store) + '</td><td class="n">' + fmt(g.online) + '</td><td class="n">' + fmt(g.rest) + '</td><td class="n"><b>' + fmt(g.all) + '</b></td><td class="n' + (x.all - g.all > 0 ? ' neg' : '') + '">' + fmt(x.all - g.all) + '</td><td class="n">' + (x.all ? (g.all / x.all * 100).toFixed(1) + '%' : '-') + '</td></tr>'; }).join('')
      + '</tbody><tfoot><tr class="iwtot"><td colspan="3">합계</td><td class="n">' + fmt(t.all) + '</td><td class="n">' + fmt(t.s) + '</td><td class="n">' + fmt(t.o) + '</td><td class="n">' + fmt(t.r) + '</td><td class="n">' + fmt(t.s + t.o + t.r) + '</td><td class="n">' + fmt(t.all - (t.s + t.o + t.r)) + '</td><td class="n">' + (t.all ? ((t.s + t.o + t.r) / t.all * 100).toFixed(1) + '%' : '-') + '</td></tr></tfoot></table></div></div>');
    const bt = el('<button class="btn sm">엑셀 받기</button>'); $('h3', c2).appendChild(bt);
    bt.onclick = () => HS.download('이월팀_지시대비출고_' + today() + '.xlsx', rows.map((x) => { const g = G.g.get(x.b + '|' + x.se + '|' + x.g) || {};
      return { 브랜드: x.b, 시즌: x.se, 복종그룹: x.g, 전체지시: x.all, 매장출고: g.store || 0, 온라인출고: g.online || 0, 배분잔량출고: g.rest || 0, 출고합계: g.all || 0, 미출고: x.all - (g.all || 0) }; }), '지시대비출고').catch(HS.err);
    body.appendChild(c2);
  }
  async function shpUpload(files, redraw) {
    try {
      await HS.xlsx();
      const add = {}; let lines = 0, noDate = 0, skip = 0; let names = []; const kinds = { store: 0, online: 0, rest: 0 };
      let dCol = '';
      for (const f of files) for (const sh of await readSheets(f)) {
        const h = findHead(sh.rows); const dc = h && (h.ix.reg != null ? h.ix.reg : h.ix.date);
        if (!h || dc == null) continue; names = h.names; dCol = h.names[dc] || '';
        for (let r = h.r + 1; r < sh.rows.length; r++) {
          const x = sh.rows[r]; if (!x) continue; const sty = txt(x[h.ix.style]).toUpperCase();
          if (!sty || sty === '품번') continue; const q = num(x[h.ix.qty]); if (!q) continue;
          const d = xlDate(x[dc]); if (!d) { noDate++; continue; }
          const se = seasonOf(sty); if (!se) { skip++; continue; }
          const k = kindOf(h.ix.store != null ? x[h.ix.store] : '');
          const color = txt(h.ix.color != null ? x[h.ix.color] : ''); const sz = txt(h.ix.size != null ? x[h.ix.size] : '');
          // 한 줄 열쇠 — 송장번호가 없는 파일도 있어 매장코드 · 출고구분까지 넣는다 (안 그러면 같은 품번이 겹쳐 사라짐)
          const key = [txt(h.ix.inv != null ? x[h.ix.inv] : ''), txt(h.ix.scode != null ? x[h.ix.scode] : ''), txt(h.ix.kind != null ? x[h.ix.kind] : ''), sty, color, sz, d].join('|');
          add[key] = { source_key: key, d, style: sty, color, sz, brand: brandOf(sty), season: se, grp: grpOf(sty), kind: k, qty: q };
          kinds[k] += q; lines++;
        }
      }
      const keys = Object.keys(add);
      if (!keys.length) throw new Error('품번 · 출고일자 · 출고수량 칸을 찾지 못했습니다. 읽은 칸 이름: ' + (names.slice(0, 14).join(', ') || '없음'));
      const had = new Set(D.shp.map((x) => x.source_key));
      const isNew = keys.filter((k) => !had.has(k)).length;
      const ds = [...new Set(keys.map((k) => add[k].d))].sort();
      const tot = keys.reduce((s, k) => s + add[k].qty, 0);
      const pre = '<div style="line-height:1.8"><b>' + fmt(lines) + '줄 · ' + fmt(tot) + '장</b> · 날짜 기준 <b>' + esc(dCol || '등록일자') + '</b> ' + esc(ds[0] || '') + (ds.length > 1 ? ' ~ ' + esc(ds[ds.length - 1]) : '') + ' (' + ds.length + '일)<br>'
        + '새로 들어오는 줄 <b>' + fmt(isNew) + '</b>개 · 이미 있던 줄 ' + fmt(keys.length - isNew) + '개는 덮어씁니다<br>'
        + '매장출고 ' + fmt(kinds.store) + ' · 온라인출고 ' + fmt(kinds.online) + ' · 배분잔량출고 ' + fmt(kinds.rest)
        + (noDate ? '<br><span class="neg">출고일자가 없는 ' + fmt(noDate) + '줄은 뺐습니다</span>' : '')
        + (skip ? '<br><span class="neg">시즌을 못 읽은 ' + fmt(skip) + '줄은 뺐습니다</span>' : '') + '</div>'
        + '<div class="iwm" style="font-size:11.5px;margin-top:8px">열쇠 = 송장번호 · 매장코드 · 출고구분 · 품번 · 색상 · 사이즈 · 날짜 (같은 파일을 두 번 올려도 안 쌓입니다)</div>';
      if (!(await HS.modal('출고 자료 확인', '<div class="iwol">' + pre + '</div>', [['취소', null], ['등록', true, 'p']]))) return;
      await saveMany('erp_iw_shp', keys.map((k) => add[k]));
      await loadAll(D.term, true); redraw();
      HS.toast('출고 ' + fmt(keys.length) + '줄을 넣었습니다 (새 줄 ' + fmt(isNew) + ')', 'ok');
    } catch (e) { HS.err(e); }
  }
  // 줄이 많으면 진행 상황을 알려 주며 넣는다
  async function saveMany(table, rows) {
    rows = rows.map((x) => Object.assign({ term: D.term }, x));
    let done = 0; const t = rows.length;
    await HS.db.upsert(table, rows, (n) => { done = n; if (t > 2000 && done % 2000 < 500) HS.toast('저장 중 ' + fmt(done) + ' / ' + fmt(t) + '줄'); });
    return done;
  }

  // ================= ④ 시즌 반품 정리 =================
  function viewSrt(body, redraw) {
    if (canW()) {
      body.appendChild(dropBox('① 정리 기준 엑셀 놓기 · WMS 재고현황', '정리해야 할 대상 수량입니다 · 칸 이름으로 저절로 찾습니다 (품번 · <b>현재고</b>)<br>품번에서 브랜드 · 시즌 · 복종을 뽑아 묶습니다 · <b>품번 단위로 덮어씁니다</b>', (fs) => invUpload(fs, redraw)));
      body.appendChild(dropBox('② 정리 실적 엑셀 놓기 · WMS 재고실사현황 (매일 이어서)', '그날 정리한 수량입니다 · 칸 이름으로 저절로 찾습니다 (품번 · <b>실사수량</b> · <b>입력일자</b>)<br>같은 줄은 <b>품번 · 색상 · 사이즈 · 날짜</b>를 열쇠로 덮어써 두 번 쌓이지 않습니다', (fs) => cntUpload(fs, redraw)));
    } else body.appendChild(noPerm('재고현황 · 재고실사현황 엑셀'));
    const A = aggSrt();
    if (!A.length) { body.appendChild(el('<div class="card"><div class="empty">재고현황을 올리면 정리 대상이, 재고실사현황을 올리면 정리 완료 수량이 나옵니다</div></div>')); return; }
    const base = A.reduce((s, x) => s + x.base, 0); const done = A.reduce((s, x) => s + x.done, 0);
    const ds = cntDates();
    const kp = el('<div class="iwkps"></div>');
    kp.innerHTML = [['정리 대상', fmt(base) + '장'], ['정리 완료', fmt(done) + '장'], ['진행률', base ? (done / base * 100).toFixed(1) + '%' : '-'],
      ['남은 수량', fmt(base - done) + '장'], ['일한 날', fmt(ds.length) + '일'], ['하루 평균', ds.length ? fmt(done / ds.length) + '장' : '-']]
      .map(([l, v]) => '<div class="iwkc"><i>' + l + '</i><b>' + v + '</b></div>').join('');
    body.appendChild(kp);
    if (ds.length) {
      const byD = new Map(); D.cnt.forEach((r) => byD.set(dOf(r.d), (byD.get(dOf(r.d)) || 0) + (+r.qty || 0)));
      let c = 0;
      body.appendChild(el('<div class="card"><h3>날짜별 정리 수량 <small>' + esc(ds[0]) + ' ~ ' + esc(ds[ds.length - 1]) + ' · ' + ds.length + '일 · 모두 ' + fmt(done) + '장</small></h3><div class="iwtw"><table class="no-no">'
        + '<thead><tr><th>입력일자</th><th>요일</th><th class="n">정리 수량</th><th class="n">누계</th><th class="n">남은 수량</th></tr></thead><tbody>'
        + ds.slice(-30).map((d) => { c += byD.get(d) || 0; return '<tr><td>' + esc(d) + '</td><td>' + WD[dow(d)] + '</td><td class="n">' + fmt(byD.get(d)) + '</td><td class="n">' + fmt(c) + '</td><td class="n">' + fmt(base - c) + '</td></tr>'; }).join('')
        + '</tbody></table></div>' + (ds.length > 30 ? '<div class="iwm" style="font-size:11.5px;margin-top:6px">마지막 30일만 보여 줍니다</div>' : '') + '</div>'));
    }
    const rows = A.sort((a, b) => (brOrd(a.b) - brOrd(b.b) || seOrd(a.se) - seOrd(b.se) || grpOrd(a.g) - grpOrd(b.g)));
    const tb = rows.map((x) => '<tr><td>' + esc(x.b) + '</td><td>' + esc(x.se) + '</td><td>' + esc(x.g) + '</td><td class="n">' + fmt(x.sty.size) + '</td>'
      + '<td class="n">' + fmt(x.base) + '</td><td class="n">' + fmt(x.done) + '</td><td class="n">' + fmt(x.base - x.done) + '</td>'
      + '<td class="n' + (x.base && x.done / x.base > 1.005 ? ' neg' : '') + '">' + (x.base ? (x.done / x.base * 100).toFixed(1) + '%' : '-') + '</td></tr>').join('');
    const c3 = el('<div class="card"><h3>브랜드 · 시즌 · 복종별 정리 현황 <small>품번 ' + fmt(D.inv.length) + '개</small><span class="sp"></span></h3><div class="iwtw"><table class="no-no">'
      + '<thead><tr><th>브랜드</th><th>시즌</th><th>복종그룹</th><th class="n">품번수</th><th class="n">정리 대상</th><th class="n">정리 완료</th><th class="n">남은 수량</th><th class="n">진행률</th></tr></thead>'
      + '<tbody>' + tb + '</tbody><tfoot><tr class="iwtot"><td colspan="4">합계</td><td class="n">' + fmt(base) + '</td><td class="n">' + fmt(done) + '</td><td class="n">' + fmt(base - done) + '</td><td class="n">' + (base ? (done / base * 100).toFixed(1) + '%' : '-') + '</td></tr></tfoot></table></div></div>');
    const bt = el('<button class="btn sm">엑셀 받기</button>'); $('h3', c3).appendChild(bt);
    bt.onclick = () => HS.download('이월팀_시즌반품정리_' + today() + '.xlsx', rows.map((x) => ({ 브랜드: x.b, 시즌: x.se, 복종그룹: x.g, 품번수: x.sty.size, '정리 대상': x.base, '정리 완료': x.done, '남은 수량': x.base - x.done, 진행률: x.base ? +(x.done / x.base * 100).toFixed(1) : '' })), '시즌반품정리').catch(HS.err);
    body.appendChild(c3);
    // 실적만 있고 기준에 없는 것
    const okK = new Set(D.inv.map((x) => x.brand + '|' + x.season + '|' + x.grp));
    const miss = new Map(); let missQ = 0;
    D.cnt.forEach((r) => { const k = r.brand + '|' + r.season + '|' + r.grp; if (okK.has(k)) return; missQ += +r.qty || 0;
      const lab = r.brand + ' ' + r.season + ' ' + r.grp; miss.set(lab, (miss.get(lab) || 0) + (+r.qty || 0)); });
    if (missQ) body.appendChild(el('<div class="card iwbad"><h3>기준에 없는 정리 실적 ' + fmt(missQ) + '장 <small>그 브랜드 · 시즌 · 복종의 재고현황을 아직 안 올렸습니다 — 올리면 저절로 붙습니다</small></h3><div class="iwtw"><table class="no-no"><thead><tr><th>브랜드 · 시즌 · 복종</th><th class="n">정리 수량</th></tr></thead><tbody>'
      + [...miss.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td class="n">' + fmt(v) + '</td></tr>').join('')
      + '</tbody></table></div></div>'));
  }
  async function invUpload(files, redraw) { // 정리 기준 — WMS 재고현황
    try {
      await HS.xlsx();
      const agg = new Map(); let lines = 0, skip = 0; const read = []; let names = [];
      for (const f of files) for (const sh of await readSheets(f)) {
        const h = findCols(sh.rows, INV_Q, null); if (!h) { names = (sh.rows[0] || []).map(txt); continue; }
        read.push(f.name + (sh.name ? ' [' + sh.name + ']' : '')); names = h.names;
        for (let r = h.r + 1; r < sh.rows.length; r++) {
          const x = sh.rows[r]; if (!x) continue; const sty = txt(x[h.s]).toUpperCase();
          if (!sty || sty === '품번') continue; const q = num(x[h.q]); if (!q) continue;
          const se = seasonOf(sty); if (!se) { skip++; continue; }
          const o = agg.get(sty) || agg.set(sty, { style: sty, brand: brandOf(sty), season: se, cls: clsOf(sty), grp: grpOf(sty), qty: 0 }).get(sty);
          o.qty += q; lines++;
        }
        break; // 파일마다 머리글이 맞는 첫 시트만 (여러 시트를 읽으면 같은 수량을 두 번 더한다)
      }
      if (!agg.size) throw new Error('품번 · 현재고 칸이 있는 시트를 찾지 못했습니다. 읽은 칸 이름: ' + (names.slice(0, 14).join(', ') || '없음'));
      const list = [...agg.values()]; const tot = list.reduce((s, x) => s + x.qty, 0);
      const by = new Map(); list.forEach((x) => { const k = x.brand + '|' + x.grp; by.set(k, (by.get(k) || 0) + x.qty); });
      const had = new Set(D.inv.map((x) => x.style)); const isNew = list.filter((x) => !had.has(x.style)).length;
      const pre = '<div style="line-height:1.8"><b>' + fmt(lines) + '줄</b> · 품번 <b>' + fmt(list.length) + '개</b> · 정리 대상 <b>' + fmt(tot) + '장</b><br>'
        + '읽은 시트: ' + esc(read.join(' · ')) + '<br>'
        + '새 품번 <b>' + fmt(isNew) + '</b>개 · 이미 있던 품번 ' + fmt(list.length - isNew) + '개는 이 파일 값으로 바뀝니다'
        + (skip ? '<br><span class="neg">시즌을 못 읽은 ' + fmt(skip) + '줄은 뺐습니다</span>' : '') + '</div>'
        + '<div class="iwtw" style="margin-top:8px;max-height:46vh;overflow:auto"><table class="no-no"><thead><tr><th>브랜드</th><th>복종그룹</th><th class="n">정리 대상</th></tr></thead><tbody>'
        + [...by.entries()].sort().map(([k, v]) => '<tr><td>' + esc(k.split('|')[0]) + '</td><td>' + esc(k.split('|')[1]) + '</td><td class="n">' + fmt(v) + '</td></tr>').join('')
        + '</tbody></table></div><div class="iwm" style="font-size:11.5px;margin-top:8px"><b>품번 단위로 덮어씁니다.</b> 이 파일에 없는 품번은 그대로 둡니다 — 브랜드별로 나눠 올려도 됩니다</div>';
      if (!(await HS.modal('정리 기준 확인 (재고현황)', '<div class="iwol">' + pre + '</div>', [['취소', null], ['등록', true, 'p']], { wide: true }))) return;
      await saveMany('erp_iw_inv', list);
      await loadAll(D.term, true); redraw();
      HS.toast('정리 기준 품번 ' + fmt(list.length) + '개를 넣었습니다 (모두 ' + fmt(D.inv.length) + ')', 'ok');
    } catch (e) { HS.err(e); }
  }
  async function cntUpload(files, redraw) { // 정리 실적 — WMS 재고실사현황
    try {
      await HS.xlsx();
      const add = {}; let lines = 0, skip = 0, noD = 0; let dcol = ''; const read = []; let names = [];
      for (const f of files) for (const sh of await readSheets(f)) {
        const h = findCols(sh.rows, CNT_Q, CNT_D); if (!h) { names = (sh.rows[0] || []).map(txt); continue; }
        read.push(f.name + (sh.name ? ' [' + sh.name + ']' : '')); names = h.names; dcol = h.names[h.d] || '';
        for (let r = h.r + 1; r < sh.rows.length; r++) {
          const x = sh.rows[r]; if (!x) continue; const sty = txt(x[h.s]).toUpperCase();
          if (!sty || sty === '품번') continue; const q = num(x[h.q]); if (!q) continue;
          const d = xlDate(x[h.d]); if (!d) { noD++; continue; }
          const se = seasonOf(sty); if (!se) { skip++; continue; }
          // 열쇠 = 품번 · 색상 · 사이즈 · 날짜. 한 파일 안에서 같은 열쇠가 여러 줄(로케이션이 다름)이면 더한다.
          const color = txt(h.color >= 0 ? x[h.color] : ''); const sz = txt(h.size >= 0 ? x[h.size] : '');
          const key = [sty, color, sz, d].join('|');
          const c = add[key];
          add[key] = { source_key: key, d, style: sty, color, sz, brand: brandOf(sty), season: se, grp: grpOf(sty), qty: (c ? c.qty : 0) + q };
          lines++;
        }
        break;
      }
      const keys = Object.keys(add);
      if (!keys.length) throw new Error('품번 · 실사수량 · 입력일자 칸이 있는 시트를 찾지 못했습니다. 읽은 칸 이름: ' + (names.slice(0, 14).join(', ') || '없음'));
      const tot = keys.reduce((s, k) => s + add[k].qty, 0);
      const ds = [...new Set(keys.map((k) => add[k].d))].sort();
      const had = new Set(D.cnt.map((x) => x.source_key));
      const over = keys.filter((k) => had.has(k)).length;
      const byD = new Map(); keys.forEach((k) => byD.set(add[k].d, (byD.get(add[k].d) || 0) + add[k].qty));
      const pre = '<div style="line-height:1.8"><b>' + fmt(lines) + '줄</b> · 정리 완료 <b>' + fmt(tot) + '장</b> · 날짜 기준 <b>' + esc(dcol) + '</b><br>'
        + esc(ds[0] || '') + (ds.length > 1 ? ' ~ ' + esc(ds[ds.length - 1]) : '') + ' · ' + ds.length + '일<br>'
        + '읽은 시트: ' + esc(read.join(' · ')) + '<br>'
        + '새로 들어오는 줄 <b>' + fmt(keys.length - over) + '</b>개 · 이미 있던 줄 ' + fmt(over) + '개는 덮어씁니다'
        + (noD ? '<br><span class="neg">날짜가 없는 ' + fmt(noD) + '줄은 뺐습니다</span>' : '')
        + (skip ? '<br><span class="neg">시즌을 못 읽은 ' + fmt(skip) + '줄은 뺐습니다</span>' : '') + '</div>'
        + '<div class="iwtw" style="margin-top:8px;max-height:40vh;overflow:auto"><table class="no-no"><thead><tr><th>날짜</th><th>요일</th><th class="n">정리 수량</th></tr></thead><tbody>'
        + [...byD.entries()].sort().map(([d, v]) => '<tr><td>' + esc(d) + '</td><td>' + WD[dow(d)] + '</td><td class="n">' + fmt(v) + '</td></tr>').join('')
        + '</tbody></table></div><div class="iwm" style="font-size:11.5px;margin-top:8px">열쇠 = <b>품번 · 색상 · 사이즈 · 날짜</b> (같은 파일을 두 번 올려도 안 쌓입니다)</div>';
      if (!(await HS.modal('정리 실적 확인 (재고실사현황)', '<div class="iwol">' + pre + '</div>', [['취소', null], ['등록', true, 'p']], { wide: true }))) return;
      await saveMany('erp_iw_cnt', keys.map((k) => add[k]));
      await loadAll(D.term, true); redraw();
      HS.toast('정리 실적 ' + fmt(keys.length) + '줄 · ' + fmt(tot) + '장을 넣었습니다', 'ok');
    } catch (e) { HS.err(e); }
  }

  // ================= ③ 출고 일정 · ⑤ 시즌 정리 일정 (한 틀로 그린다) =================
  //  표는 F안(엑셀 고밀도) · 일정 띠를 머리글 위로 · 거르기 · 줄마다 시작일 고치기 · 생산성 표
  const LANES = ['반품/출고 일정', '소터 작업 일정', '기타 일정'];
  const LC = ['#1E7A4B', '#8E3B4E', '#2B3A67', '#6B4C9A', '#B4660F', '#0F766E'];
  const GCOL = { 이너: '#1F3350', JK: '#B4660F', ACC: '#2F7A43' };
  const PAL = { g: GCOL, b: { 파리: '#1F3350', 바니: '#B4660F', 세인트: '#2F7A43', 핑: '#7A3E9D', 팬텀: '#0F766E', 링스: '#A33B5A', 고커: '#5B6470', 하이: '#8A5A2B' } };
  // 시즌 색은 만들어 쓴다 — 뒷자리로 색깔, 앞글자로 짙기 (시즌 코드가 계속 늘어나 목록으로는 모자람)
  const SE_HUE = { 1: 214, 2: 28, 3: 146, 4: 280, 5: 174, 6: 340, 7: 50, 8: 10, 9: 258, 0: 200 };
  const seCol = (v) => { const s = String(v || ''); const h = SE_HUE[s[1]] != null ? SE_HUE[s[1]] : 200;
    const i = Math.max(0, 'FEDCBA'.indexOf(s[0])); return 'hsl(' + h + ' 52% ' + (23 + i * 7) + '%)'; };
  const VW = [['all', '모두'], ['sub', '소계만'], ['sum', '합계만'], ['both', '소계+합계만']];
  const SCFG = {
    out: { t: '출고', ord0: ['g', 'se', 'b'],
      cols: [['days', '일정<br>(일)', 'n', 50], ['st', '시작일', 'c', 112], ['en', '종료일', 'c', 54],
        ['store', '매장<br>지시', 'n', 70], ['online', '온라인<br>지시', 'n', 70], ['rest', '배분<br>잔량', 'n', 64],
        ['did', '작업<br>수량', 'n', 70], ['gap', '차이<br>수량', 'n', 70]],
      note: '색칠한 칸 = 시작일~종료일 · 숫자 = 그날 출고 수량 (② 자료에서 자동)',
      empty: '① 배분지시를 올리면 출고 일정이 만들어집니다' },
    ret: { t: '정리', ord0: ['b', 'se', 'g'],
      cols: [['days', '일정<br>(일)', 'n', 50], ['st', '시작일', 'c', 112], ['en', '종료일', 'c', 54],
        ['base', '정리<br>대상', 'n', 70], ['done', '정리<br>완료', 'n', 70], ['all', '남은<br>수량', 'n', 70], ['pct', '진행률', 'n', 58]],
      note: '색칠한 칸 = 시작일~종료일 · 숫자 = 그날 정리 수량 (④ 재고실사 자료에서 자동)',
      empty: '④ 시즌 반품 정리에 재고현황을 올리면 정리 일정이 만들어집니다' },
  };

  function viewSched(body, mode, redraw) {
    const C = SCFG[mode];
    const st = D.set[mode];
    const sst = D.sst[mode];
    const man = D.man[mode];
    const U = loadUI(mode);
    const ed = canW();
    const setSave = async (k, v) => { st[k] = v; try { await HS.db.upsert('erp_iw_set', [{ key: mode, val: st }]); } catch (e) { HS.err(e); } };

    // ---- 기준값 ----
    const SET = mode === 'out'
      ? [['sorter', '소터 생산성 (이너 · ACC)', 'number'], ['jk', '크리스 JK 생산량', 'number'], ['start', '시작일', 'date']]
      : [['이너', '이너 하루 정리량', 'number'], ['JK', 'JK 하루 정리량', 'number'], ['ACC', 'ACC 하루 정리량', 'number'], ['start', '시작일', 'date']];
    const c = el('<div class="card no-tools"><h3>기준값 <small>바꾸면 일정이 바로 다시 계산됩니다 · 런닝타임은 처음 시작일~마지막 종료일로 저절로 나옵니다</small></h3><div class="iwsetw"></div></div>');
    $('.iwsetw', c).innerHTML = SET.map(([k, l, t]) => '<label class="iwf">' + l + '<input class="in" data-s="' + esc(k) + '" type="' + t + '" value="' + esc(st[k] == null ? '' : st[k]) + '"' + (ed ? '' : ' disabled') + '></label>').join('')
      + '<label class="iwf" style="flex:1 1 220px">쉬는 날 더하기 (쉼표로 · 두 일정이 함께 씁니다)<input class="in" data-o="off" value="' + esc(D.set.out.off || '') + '"' + (ed ? '' : ' disabled') + '></label>';
    body.appendChild(c);
    $$('[data-s]', c).forEach((x) => (x.onchange = async () => { const v = x.type === 'number' ? (+x.value || 0) : x.value; x.blur(); await setSave(x.dataset.s, v); setTimeout(redraw, 0); }));
    $$('[data-o]', c).forEach((x) => (x.onchange = async () => { D.set.out.off = x.value; x.blur();
      try { await HS.db.upsert('erp_iw_set', [{ key: 'out', val: D.set.out }]); } catch (e) { HS.err(e); } setTimeout(redraw, 0); }));

    const P = mode === 'out' ? plan() : planSrt();
    if (!P.length) { body.appendChild(el('<div class="card"><div class="empty">' + C.empty + '</div></div>')); return; }
    const RS = runSpan(P);
    // ---- 날짜 칸 ----
    const off = offSet();
    const dset = new Set(mode === 'out' ? shDates() : cntDates());
    if (RS.st && RS.en) { let d = RS.st, n = 0; while (d <= RS.en && n++ < 500) { if (workDay(d, off)) dset.add(d); d = addD(d, 1); } }
    const F = U.f;
    const ds = [...dset].sort().filter((d) => (!F.d1 || d >= F.d1) && (!F.d2 || d <= F.d2)).slice(0, 200);
    // ---- 기준값 칸 ----
    const flatAll = []; P.forEach((G) => G.rows.forEach((r) => flatAll.push(r)));
    const tot = (f) => flatAll.reduce((s, r) => s + (f(r) || 0), 0);
    const kp = el('<div class="iwkps"></div>');
    kp.innerHTML = (mode === 'out'
      ? [['전체 지시', fmt(tot((r) => r.all)) + '장'], ['출고 합계', fmt(tot((r) => r.did)) + '장'],
        ['진행률', tot((r) => r.all) ? (tot((r) => r.did) / tot((r) => r.all) * 100).toFixed(1) + '%' : '-'],
        ['남은 수량', fmt(tot((r) => r.all) - tot((r) => r.did)) + '장']]
      : [['정리 대상', fmt(tot((r) => r.base)) + '장'], ['정리 완료', fmt(tot((r) => r.done)) + '장'],
        ['진행률', tot((r) => r.base) ? (tot((r) => r.done) / tot((r) => r.base) * 100).toFixed(1) + '%' : '-'],
        ['남은 수량', fmt(tot((r) => r.all)) + '장']])
      .concat([['런닝타임', fmt(RS.days) + '일 <small>(일하는 날 ' + fmt(RS.work) + '일)</small>'],
        ['끝나는 날', md(RS.en) + ' <small>' + (RS.st ? md(RS.st) + ' 시작' : '') + '</small>']])
      .map(([l, v]) => '<div class="iwkc"><i>' + l + '</i><b>' + v + '</b></div>').join('');
    body.appendChild(kp);

    // ---- 줄 펴기 · 거르기 ----
    let flat = flatAll.slice();
    flat = flat.filter((r) => (!F.g || r.g === F.g) && (!F.b || r.b === F.b) && (!F.se || r.se === F.se)
      && (!F.store || r.store > 0) && (!F.left || (r.all - (mode === 'out' ? r.did : 0)) > 0));
    const OKEY = { g: '복종', se: '시즌', b: '브랜드' };
    const OTX = { g: (x) => x.g, se: (x) => x.se, b: (x) => x.b };
    const OORD = { g: (v) => grpOrd(v), se: (v) => seOrd(v), b: (v) => brOrd(v) };
    if (!U.ord || !U.ord.filter((k) => OKEY[k]).length) U.ord = C.ord0.slice();
    const lv = U.ord.filter((k) => OKEY[k]);
    const FXC = C.cols;
    const COL0 = FXC.map((x) => x[0]);
    if (!U.cols || !U.cols.length) U.cols = COL0.slice();
    const FX = FXC.filter((x) => U.cols.indexOf(x[0]) >= 0);
    if (!U.view) U.view = 'all';
    const vLeaf = U.view === 'all';
    const vSum = U.view !== 'sum';   // 2단계 소계 줄
    const NC = lv.length + FX.length;
    const SW = lv.map((k) => (k === 'g' ? 56 : k === 'se' ? 46 : 64)).concat(FX.map((x) => x[3]));
    const brs = [...new Set(flatAll.map((r) => r.b))].sort((a, b) => brOrd(a) - brOrd(b));
    const ses = [...new Set(flatAll.map((r) => r.se))].sort((a, b) => seOrd(a) - seOrd(b));
    const cf = el('<div class="card no-tools"><div class="iwflt"></div></div>');
    body.appendChild(cf);
    const save2 = () => saveUI(mode, U);
    $('.iwflt', cf).innerHTML = '<div class="fg"><span class="t">거르기</span><div class="chips">'
      + '<span class="iwchip' + (F.g ? '' : ' on') + '" data-g="">복종 전체</span>'
      + GRP_ORD.map((g) => '<span class="iwchip' + (F.g === g ? ' on' : '') + '" data-g="' + g + '">' + g + '</span>').join('')
      + '<select class="in sm" data-f="b"><option value="">브랜드 전체</option>' + brs.map((b) => '<option' + (F.b === b ? ' selected' : '') + '>' + esc(b) + '</option>').join('') + '</select>'
      + '<select class="in sm" data-f="se"><option value="">시즌 전체</option>' + ses.map((s) => '<option' + (F.se === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select>'
      + '<input class="in sm" type="date" data-f="d1" value="' + esc(F.d1 || '') + '"><span class="iwm">~</span><input class="in sm" type="date" data-f="d2" value="' + esc(F.d2 || '') + '">'
      + (mode === 'out' ? '<span class="iwchip' + (F.store ? ' on' : '') + '" data-b="store">매장지시 있는 것만</span>' : '')
      + '<span class="iwchip' + (F.left ? ' on' : '') + '" data-b="left">덜 끝난 것만</span>'
      + '<span class="iwchip x" data-clr="1">거르기 지우기</span></div></div>'
      + '<div class="fg"><span class="t">묶음 차례</span><div class="chips" style="align-items:center">'
      + [0, 1, 2].map((i) => (i ? '<span class="iwm" style="margin:0 3px">›</span>' : '')
        + '<select class="in sm" data-o="' + i + '" style="width:88px"><option value="">안 나눔</option>'
        + Object.keys(OKEY).map((k) => '<option value="' + k + '"' + (U.ord[i] === k ? ' selected' : '') + '>' + OKEY[k] + '</option>').join('') + '</select>').join('') + '</div></div>'
      + '<div class="fg"><span class="t">보일 칸</span><div class="chips">' + FXC.map(([k, l]) => '<span class="iwchip' + (U.cols.indexOf(k) >= 0 ? ' on' : '') + '" data-col="' + k + '">' + l.replace('<br>', '') + '</span>').join('') + '</div></div>'
      + '<div class="fg"><span class="t">보기</span><div class="chips">'
      + VW.map(([k, l]) => '<span class="iwchip' + (U.view === k ? ' on' : '') + '" data-vw="' + k + '">' + l + '</span>').join('')
      + '</div></div>';
    $$('.iwflt [data-g]', cf).forEach((x) => (x.onclick = () => { F.g = x.dataset.g; save2(); redraw(); }));
    $$('.iwflt [data-f]', cf).forEach((x) => (x.onchange = () => { F[x.dataset.f] = x.value; save2(); x.blur(); setTimeout(redraw, 0); }));
    $$('.iwflt [data-b]', cf).forEach((x) => (x.onclick = () => { F[x.dataset.b] = !F[x.dataset.b]; save2(); redraw(); }));
    $$('.iwflt [data-clr]', cf).forEach((x) => (x.onclick = () => { U.f = F0(); save2(); redraw(); }));
    $$('.iwflt [data-o]', cf).forEach((x) => (x.onchange = () => { const i = +x.dataset.o, v = x.value;
      const a2 = U.ord.slice(); const j = a2.indexOf(v); if (v && j >= 0 && j !== i) a2[j] = a2[i]; a2[i] = v;
      U.ord = a2.filter(Boolean).concat(['', '', '']).slice(0, 3); save2(); x.blur(); setTimeout(redraw, 0); }));
    $$('.iwflt [data-col]', cf).forEach((x) => (x.onclick = () => { const k = x.dataset.col;
      if (U.cols.indexOf(k) >= 0) { if (U.cols.length <= 1) return HS.toast('적어도 한 칸은 남겨야 합니다', 'err'); U.cols = U.cols.filter((y) => y !== k); }
      else U.cols = COL0.filter((y) => y === k || U.cols.indexOf(y) >= 0);
      save2(); redraw(); }));
    $$('.iwflt [data-vw]', cf).forEach((x) => (x.onclick = () => { U.view = x.dataset.vw; save2(); redraw(); }));

    // ---- 칸 값 ----
    const V = (list) => { const g = (f) => list.reduce((s, r) => s + (f(r) || 0), 0);
      const base = g((r) => r.base), done = g((r) => r.did), all = g((r) => r.all);
      return { days: g((r) => r.days).toFixed(1), st: md(list.map((r) => r.st).sort()[0]), en: md(list.map((r) => r.en).sort().pop()),
        store: fmt(g((r) => r.store)), online: fmt(g((r) => r.online)), rest: fmt(g((r) => r.rest)),
        did: fmt(done), gap: fmt(all - done), _gap: all - done,
        base: fmt(base), done: fmt(done), all: fmt(all), pct: base ? (done / base * 100).toFixed(1) + '%' : '-',
        _pct: base ? done / base * 100 : 0 }; };
    const cells = (list, i0, leaf) => { const v = V(list);
      return FX.map(([k, , cl], i) => { let s = v[k];
        if (k === 'st' && leaf) s = '<input class="iwdt' + (list[0].man ? ' man' : '') + '" type="date" data-sk="' + esc(list[0].key) + '" value="' + esc(list[0].st) + '"' + (ed ? '' : ' disabled') + '>';
        // 진행률이 100% 를 넘으면 빨강 — 기준(재고현황)에 없는 품번을 정리한 것이라 자료를 더 올려야 한다
        const bad = (k === 'gap' && v._gap > 0) || (k === 'pct' && v._pct > 100.5);
        return '<td class="st ' + cl + (bad ? ' neg' : '') + (i === FX.length - 1 ? ' last' : '') + '" data-ci="' + (i0 + i) + '"'
          + (k === 'pct' && v._pct > 100.5 ? ' title="정리 완료가 정리 대상보다 많습니다 — 그 묶음의 재고현황을 아직 안 올렸습니다"' : '') + '>' + s + '</td>'; }).join(''); };
    const dayTd = (d, cls, inner, key) => '<td class="dy' + cls + (d === today() ? ' tod' : '') + (dow(d) === 0 || dow(d) === 6 ? ' wk' : '') + '" data-d="' + d + '"' + (key ? ' data-key="' + esc(key) + '"' : '') + '>' + (inner || '') + '</td>';
    const dayCells = (list, paint) => ds.map((d) => { const q = list.reduce((s, r) => s + r.day(d), 0);
      const on = paint && list.some((r) => d >= r.st && d <= r.en);
      return dayTd(d, on ? ' bar' : '', q ? fmt(q) : '', on && list.length === 1 ? list[0].key : ''); }).join('');
    const byKey = (list, k) => { const m = new Map();
      list.forEach((r) => { const v = OTX[k](r); if (!m.has(v)) m.set(v, []); m.get(v).push(r); });
      return [...m.entries()].sort((x, y) => OORD[k](x[0]) - OORD[k](y[0])); };
    // 줄마다 제 단계 색 — TOTAL 은 1단계, 소계는 2단계, 상세 줄은 3단계
    const colK = lv.length > 1 ? lv[1] : lv[0];
    const colOf = (k, v) => (k === 'se' ? seCol(v) : (PAL[k] && PAL[k][v]) || '#44506B');
    const gcOf = (list) => colOf(colK, OTX[colK](list[0]));
    // ---- 머리글 ----
    const leftCell = (ci, cs, cls, inner) => '<td class="st ' + cls + '" data-ci="' + ci + '" colspan="' + cs + '">' + inner + '</td>';
    let h = '<table class="iwsched no-no"><thead>';
    LANES.forEach((ln, li) => {
      h += '<tr class="bd">' + leftCell(0, lv.length, 'c lane', '<b>' + esc(ln) + '</b>')
        + leftCell(lv.length, FX.length, 'c last', '<span class="iwm">' + (ed ? '띠를 눌러 ✎고치기 · ✕빼기' : '보기 전용') + '</span>');
      const its = (D.band || []).filter((x) => x.l === li).sort((a, b) => (a.s < b.s ? -1 : 1));
      let i = 0, used = -1;
      while (i < ds.length) { const d = ds[i];
        const it = its.find((x, xi) => xi > used && d >= x.s && d <= x.e);
        if (it) { const n = ds.filter((y, yi) => yi >= i && y <= it.e).length; used = its.indexOf(it);
          h += '<td class="dy c" colspan="' + n + '"><div class="iwband" style="background:' + esc(it.c) + '" data-bi="' + esc(it.id) + '">'
            + esc(it.x) + (ed ? ' <i data-be="' + esc(it.id) + '">✎</i><i data-bx="' + esc(it.id) + '">✕</i>' : '') + '</div></td>'; i += n; }
        else { h += dayTd(d, '', ''); i++; } }
      h += '</tr>';
    });
    h += '<tr class="mo">' + leftCell(0, lv.length, 'c', '기간') + leftCell(lv.length, FX.length, 'c last', md(ds[0] || '') + ' ~ ' + md(ds[ds.length - 1] || ''));
    { let i = 0; while (i < ds.length) { const m = ds[i].slice(0, 7); const n = ds.filter((d) => d.slice(0, 7) === m).length;
      h += '<th class="mon" colspan="' + n + '">' + (+m.slice(5, 7)) + '월</th>'; i += n; } }
    h += '</tr><tr>' + lv.map((k, i) => '<th class="st c" data-ci="' + i + '">' + OKEY[k] + '</th>').join('')
      + FX.map(([, l, cl], i) => '<th class="st ' + cl + (i === FX.length - 1 ? ' last' : '') + '" data-ci="' + (lv.length + i) + '">' + l + '</th>').join('')
      + ds.map((d) => '<th class="dy c' + (d === today() ? ' tod' : '') + (dow(d) === 0 || dow(d) === 6 ? ' wk' : '') + '">' + md(d) + '<br><span class="w">' + WD[dow(d)] + '</span></th>').join('') + '</tr></thead><tbody>';
    if (!flat.length) h += '<tr><td colspan="' + (NC + ds.length) + '" class="st" data-ci="0"><div class="empty" style="padding:14px">거르기에 걸린 줄이 없습니다</div></td></tr>';
    for (const pair0 of byKey(flat, lv[0])) {
      const v0 = pair0[0], l0 = pair0[1];
      const g1 = lv.length > 1 ? byKey(l0, lv[1]) : [];
      const leafN = lv.length > 2 ? (vLeaf ? g1.reduce((s, p) => s + byKey(p[1], lv[2]).length, 0) : 0)
        : (lv.length > 1 && (vLeaf || vSum) ? g1.length : 0);
      const span = 1 + (lv.length > 2 && vSum ? g1.length : 0) + leafN;
      h += '<tr class="tot" style="--c:' + colOf(lv[0], v0) + '"><td class="st grp gc" data-ci="0" rowspan="' + span + '">' + esc(v0) + '</td>'
        + (lv.length > 1 ? '<td class="st c" data-ci="1" colspan="' + (lv.length - 1) + '"><b>TOTAL</b></td>' : '')
        + cells(l0, lv.length, false) + dayCells(l0, false) + '</tr>';
      if (lv.length === 1) continue;
      for (const pair1 of g1) {
        const v1 = pair1[0], l1 = pair1[1];
        if (lv.length > 2) {
          const leaves = byKey(l1, lv[2]);
          if (vLeaf) leaves.forEach((p2, n) => {
            h += '<tr style="--c:' + colOf(lv[2], p2[0]) + '"><td class="st c" data-ci="1">' + (n === 0 ? '<b>' + esc(v1) + '</b>' : '') + '</td>'
              + '<td class="st" data-ci="2">' + esc(p2[0]) + '</td>' + cells(p2[1], lv.length, p2[1].length === 1) + dayCells(p2[1], true) + '</tr>';
          });
          if (vSum) h += '<tr class="sub" style="--c:' + gcOf(l1) + '"><td class="st c" data-ci="1" colspan="' + (lv.length - 1) + '"><b>' + esc(v1) + ' 소계</b></td>'
            + cells(l1, lv.length, false) + dayCells(l1, true) + '</tr>';
        } else if (vLeaf || vSum) {
          h += '<tr style="--c:' + gcOf(l1) + '"><td class="st c" data-ci="1">' + esc(v1) + '</td>' + cells(l1, lv.length, l1.length === 1) + dayCells(l1, true) + '</tr>';
        }
      }
    }
    h += '</tbody>';
    if (flat.length) h += '<tfoot><tr class="tot gt"><td class="st grp c" data-ci="0" colspan="' + lv.length + '"><b>전체 합계</b></td>'
      + cells(flat, lv.length, false) + dayCells(flat, false) + '</tr></tfoot>';
    h += '</table>';
    const ct = el('<div class="card no-tools"><h3>' + C.t + ' 일정 <small>' + C.note + (lv.length > 1 ? ' · ' + OKEY[lv[0]] + ' TOTAL › ' + OKEY[lv[1]] + ' 소계' : '') + '</small><span class="sp"></span><button class="btn sm" data-sx>엑셀</button></h3><div class="iwtw iwgt"></div>'
      + (ed ? '<div class="iwaddb"><select class="in sm" data-bl>' + LANES.map((l, i) => '<option value="' + i + '">' + esc(l) + '</option>').join('') + '</select>'
        + '<input class="in sm" type="date" data-bs value="' + esc(ds[0] || today()) + '"><span class="iwm">~</span><input class="in sm" type="date" data-be2 value="' + esc(ds[0] || today()) + '">'
        + '<input class="in sm" data-bx2 placeholder="내용 (예: 3011 전매장 1차 봄의류)" style="width:240px"><button class="btn sm p" data-ba>띠 더하기</button>'
        + '<span class="iwm" style="font-size:11.5px">노란 칸 = 시작일 직접 고치기 · 막대를 끌면 일정이 옮겨지고, 빈 곳을 끌면 표가 움직입니다</span></div>' : '') + '</div>');
    body.appendChild(ct); $('.iwgt', ct).innerHTML = h;
    const wrap = $('.iwgt', ct);
    // 왼쪽 칸 고정
    const lefts = []; let acc = 0; SW.forEach((w) => { lefts.push(acc); acc += w; });
    const narrow = window.innerWidth < 900;
    $$('.st[data-ci]', wrap).forEach((cEl) => { const i = +cEl.dataset.ci; const cs = +(cEl.getAttribute('colspan') || 1);
      if (narrow && i >= lv.length) { cEl.classList.remove('st'); return; }
      let w = 0; for (let k = i; k < Math.min(NC, i + cs); k++) w += SW[k];
      cEl.style.left = lefts[i] + 'px'; if (cs === 1) { cEl.style.minWidth = w + 'px'; cEl.style.maxWidth = w + 'px'; } });
    const tth = wrap.querySelector('thead th.tod'); if (tth) wrap.scrollLeft = Math.max(0, tth.offsetLeft - (narrow ? lefts[lv.length] || 0 : acc) - 2 * tth.offsetWidth);
    // 줄마다 시작일 고치기
    $$('input[data-sk]', wrap).forEach((x) => (x.onchange = async () => { const k = x.dataset.sk; x.blur();
      try { if (x.value) { sst[k] = x.value; await HS.db.upsert('erp_iw_sst', [{ kind: mode, term: D.term, gkey: k, start_date: x.value }]); }
        else { delete sst[k]; await HS.db.remove('erp_iw_sst', { kind: mode, term: D.term, gkey: k }); } } catch (e) { HS.err(e); }
      setTimeout(redraw, 0); }));
    // 띠 더하기 · 고치기 · 빼기
    const bandOf = (id) => D.band.find((x) => x.id === id);
    if (ed) {
      $('[data-ba]', ct).onclick = async () => { const s = $('[data-bs]', ct).value, e2 = $('[data-be2]', ct).value, x = $('[data-bx2]', ct).value.trim();
        if (!s || !e2 || !x) return HS.toast('날짜와 내용을 넣어 주세요', 'err');
        if (e2 < s) return HS.toast('끝 날짜가 시작보다 앞입니다', 'err');
        const id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        try { await HS.db.upsert('erp_iw_band', [{ id, term: D.term, lane: +$('[data-bl]', ct).value, s, e: e2, label: x, color: LC[D.band.length % LC.length] }]);
          await loadAll(D.term, true); redraw(); } catch (err) { HS.err(err); } };
      $$('[data-bx]', wrap).forEach((x) => (x.onclick = async (ev) => { ev.stopPropagation(); const b = bandOf(x.dataset.bx); if (!b) return;
        if (await HS.confirm('<b>' + esc(b.x) + '</b> 띠를 뺄까요?')) { try { await HS.db.remove('erp_iw_band', { id: b.id }); await loadAll(D.term, true); redraw(); } catch (e) { HS.err(e); } } }));
      $$('[data-be]', wrap).forEach((x) => (x.onclick = async (ev) => { ev.stopPropagation(); const b = bandOf(x.dataset.be); if (!b) return;
        const f = el('<div class="iwol" style="display:flex;flex-wrap:wrap;gap:8px"><label class="iwf">시작<input class="in" type="date" data-e1 value="' + esc(b.s) + '"></label>'
          + '<label class="iwf">끝<input class="in" type="date" data-e2 value="' + esc(b.e) + '"></label>'
          + '<label class="iwf" style="flex:1 1 240px">내용<input class="in" data-e3 value="' + esc(b.x) + '"></label>'
          + '<label class="iwf">색<input class="in" type="color" data-e4 value="' + esc(b.c) + '" style="width:60px;padding:2px"></label></div>');
        if (await HS.modal('일정 띠 고치기', f, [['취소', null], ['바꾸기', true, 'p']])) {
          try { await HS.db.upsert('erp_iw_band', [{ id: b.id, term: D.term, lane: b.l, s: $('[data-e1]', f).value || b.s, e: $('[data-e2]', f).value || b.e, label: $('[data-e3]', f).value || b.x, color: $('[data-e4]', f).value || b.c }]);
            await loadAll(D.term, true); redraw(); } catch (e) { HS.err(e); }
        } }));
    }
    // 끌기 — 막대는 일정 옮기기 · 빈 곳은 표 움직이기
    let dg = null;
    wrap.addEventListener('mousedown', (e) => {
      const bar = e.target.closest ? e.target.closest('td.dy.bar[data-key]') : null;
      if (e.target.closest && e.target.closest('input,select,button,.iwband')) return;
      dg = bar && ed ? { k: 'bar', key: bar.dataset.key, d0: bar.dataset.d, x: e.clientX } : { k: 'pan', x: e.clientX, sl: wrap.scrollLeft };
      if (!(bar && ed)) { wrap.classList.add('pan'); e.preventDefault(); }
    });
    const onMove = (e) => { if (!dg) return; if (dg.k === 'pan') wrap.scrollLeft = dg.sl - (e.clientX - dg.x); };
    const onUp = async (e) => { if (!dg) return; const d0 = dg; dg = null; wrap.classList.remove('pan');
      if (d0.k !== 'bar' || Math.abs(e.clientX - d0.x) < 6) return;
      const t = document.elementFromPoint(e.clientX, e.clientY); const td = t && t.closest ? t.closest('td.dy[data-d]') : null;
      if (!td) return;
      const row = flatAll.find((r) => r.key === d0.key); if (!row) return;
      const mv = Math.round((new Date(td.dataset.d + 'T00:00:00Z') - new Date(d0.d0 + 'T00:00:00Z')) / 864e5);
      if (!mv) return;
      let nd = addD(row.st, mv); const o2 = offSet(); let n = 0; while (!workDay(nd, o2) && n++ < 30) nd = addD(nd, 1);
      try { sst[d0.key] = nd; await HS.db.upsert('erp_iw_sst', [{ kind: mode, term: D.term, gkey: d0.key, start_date: nd }]);
        redraw(); HS.toast(row.b + ' ' + row.se + ' ' + row.g + ' → ' + md(nd) + ' 시작', 'ok'); } catch (err) { HS.err(err); } };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    DRAG.push(() => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); });

    // ---- 일별 생산량 · 인원 · 생산성 ----
    const PG = GRP_ORD.filter((g) => flatAll.some((r) => r.g === g));
    const qOf = (g, d) => flatAll.filter((r) => r.g === g).reduce((s, r) => s + r.day(d), 0);
    let ph = '<table class="iwsched prd no-no"><thead><tr><th class="st c" data-ci="0">구분</th><th class="st c last" data-ci="1">합계 · 평균</th>'
      + ds.map((d) => '<th class="dy c' + (d === today() ? ' tod' : '') + (dow(d) === 0 || dow(d) === 6 ? ' wk' : '') + '">' + md(d) + '<br><span class="w">' + WD[dow(d)] + '</span></th>').join('') + '</tr></thead><tbody>';
    PG.forEach((g) => {
      const qs = ds.map((d) => qOf(g, d));
      const ms = ds.map((d) => +man[g + '|' + d] || 0);
      const qt = qs.reduce((a, b) => a + b, 0);
      const daysOn = qs.filter((q) => q > 0).length;
      const mAvg = ms.filter((m, i) => qs[i] > 0).reduce((a, b) => a + b, 0) / (daysOn || 1);
      ph += '<tr class="pg" style="--c:' + (GCOL[g] || '#44506B') + '"><td class="st grp gc" data-ci="0" rowspan="3">' + esc(g) + '</td>'
        + '<td class="st n last" data-ci="1">' + fmt(qt) + '</td>' + qs.map((q, i) => '<td class="dy n' + (ds[i] === today() ? ' tod' : '') + '">' + (q ? fmt(q) : '') + '</td>').join('') + '</tr>'
        + '<tr class="pm"><td class="st n last" data-ci="1">' + (daysOn ? mAvg.toFixed(1) : '') + '</td>'
        + ds.map((d) => '<td class="dy n"><input class="iwmn" type="number" min="0" data-mg="' + esc(g) + '" data-md="' + d + '" value="' + (man[g + '|' + d] == null ? '' : esc(man[g + '|' + d])) + '"' + (ed ? '' : ' disabled') + '></td>').join('') + '</tr>'
        + '<tr class="pp"><td class="st n last" data-ci="1">' + (daysOn && mAvg ? fmt(qt / daysOn / mAvg) : '') + '</td>'
        + ds.map((d, i) => '<td class="dy n" data-pg="' + esc(g) + '" data-pd="' + d + '">' + (qs[i] && ms[i] ? fmt(qs[i] / ms[i]) : '') + '</td>').join('') + '</tr>';
    });
    ph += '</tbody>';
    if (PG.length > 1) {
      const aq = ds.map((d) => PG.reduce((s, g) => s + qOf(g, d), 0));
      const am = ds.map((d) => PG.reduce((s, g) => s + (+man[g + '|' + d] || 0), 0));
      const aqt = aq.reduce((a, b) => a + b, 0); const don = aq.filter((q) => q > 0).length;
      const amAvg = am.filter((m, i) => aq[i] > 0).reduce((a, b) => a + b, 0) / (don || 1);
      ph += '<tfoot><tr class="pg gt" style="--c:#0F1E3D"><td class="st grp gc" data-ci="0" rowspan="3">전체</td>'
        + '<td class="st n last" data-ci="1">' + fmt(aqt) + '</td>' + aq.map((q, i) => '<td class="dy n' + (ds[i] === today() ? ' tod' : '') + '">' + (q ? fmt(q) : '') + '</td>').join('') + '</tr>'
        + '<tr class="pm gt"><td class="st n last" data-ci="1">' + (don ? amAvg.toFixed(1) : '') + '</td>'
        + am.map((m, i) => '<td class="dy n" data-ag="' + ds[i] + '">' + (m || '') + '</td>').join('') + '</tr>'
        + '<tr class="pp gt"><td class="st n last" data-ci="1">' + (don && amAvg ? fmt(aqt / don / amAvg) : '') + '</td>'
        + aq.map((q, i) => '<td class="dy n" data-ap="' + ds[i] + '">' + (q && am[i] ? fmt(q / am[i]) : '') + '</td>').join('') + '</tr></tfoot>';
    }
    ph += '</table>';
    const pc = el('<div class="card no-tools"><h3>일별 생산량 · 인원 · 생산성 <small>생산량 ÷ 인원 = 생산성 · 인원 칸만 손으로 넣습니다</small><span class="sp"></span><button class="btn sm" data-px>엑셀</button></h3><div class="iwtw iwgt iwprdw"></div>'
      + '<div class="iwm" style="font-size:11.5px;margin-top:6px">줄 차례 — 위: 생산량(자동) · 가운데: <b>투입 인원(입력)</b> · 아래: 생산성</div></div>');
    body.appendChild(pc); $('.iwprdw', pc).innerHTML = ph;
    const pw = $('.iwprdw', pc);
    { const l2 = [0, 76]; $$('.st[data-ci]', pw).forEach((cEl) => { const i = +cEl.dataset.ci;
      cEl.style.left = l2[i] + 'px'; cEl.style.minWidth = (i ? 86 : 76) + 'px'; cEl.style.maxWidth = (i ? 86 : 76) + 'px'; }); }
    let mTmr = null;
    $$('input[data-mg]', pw).forEach((x) => (x.oninput = () => { const g = x.dataset.mg, d = x.dataset.md; const v = +x.value || 0;
      if (v) man[g + '|' + d] = v; else delete man[g + '|' + d];
      const cell = pw.querySelector('td[data-pg="' + g + '"][data-pd="' + d + '"]'); const q = qOf(g, d);
      if (cell) cell.textContent = q && v ? fmt(q / v) : '';
      const am = PG.reduce((s, gg) => s + (+man[gg + '|' + d] || 0), 0); const aq = PG.reduce((s, gg) => s + qOf(gg, d), 0);
      const c1 = pw.querySelector('td[data-ag="' + d + '"]'); if (c1) c1.textContent = am || '';
      const c2 = pw.querySelector('td[data-ap="' + d + '"]'); if (c2) c2.textContent = aq && am ? fmt(aq / am) : '';
      // 타자를 멈추면 저장 (한 글자마다 서버에 보내지 않는다)
      clearTimeout(mTmr); mTmr = setTimeout(async () => {
        try { if (v) await HS.db.upsert('erp_iw_man', [{ kind: mode, term: D.term, grp: g, d, people: v }]); else await HS.db.remove('erp_iw_man', { kind: mode, term: D.term, grp: g, d }); } catch (e) { HS.err(e); }
      }, 700); }));
    // ---- 엑셀 ----
    $('[data-sx]', ct).onclick = () => {
      const out = flat.map((r) => { const row = {}; lv.forEach((k) => (row[OKEY[k]] = OTX[k](r)));
        const v = V([r]); FX.forEach(([k, l]) => (row[l.replace('<br>', '')] = k === 'st' ? r.st : k === 'en' ? r.en : v[k]));
        ds.forEach((d) => (row[md(d)] = r.day(d) || '')); return row; });
      HS.download('이월팀_' + C.t + '일정_' + today() + '.xlsx', out, C.t + '일정').catch(HS.err);
    };
    $('[data-px]', pc).onclick = () => {
      const out = []; PG.forEach((g) => { const a = { 구분: g, 값: '생산량' }, b = { 구분: g, 값: '인원' }, c2 = { 구분: g, 값: '생산성' };
        ds.forEach((d) => { const q = qOf(g, d), m = +man[g + '|' + d] || 0;
          a[md(d)] = q || ''; b[md(d)] = m || ''; c2[md(d)] = q && m ? Math.round(q / m) : ''; });
        out.push(a, b, c2); });
      HS.download('이월팀_' + C.t + '생산성_' + today() + '.xlsx', out, '생산성').catch(HS.err);
    };
  }

  // ================= 화면 등록 =================
  const DRAG = []; // 화면을 다시 그릴 때 window 에 걸어 둔 끌기 처리를 떼어 낸다
  const clearDrag = () => { while (DRAG.length) { try { DRAG.pop()(); } catch (e) { /* 무시 */ } } };

  const TABS = {
    iwout: [['ord', '① 배분지시'], ['shp', '② 출고 작업 현황'], ['sch', '③ 출고 일정']],
    iwret: [['srt', '④ 시즌 반품 정리'], ['ssc', '⑤ 시즌 정리 일정']],
  };
  function drawTab(body, k, redraw) {
    if (k === 'ord') viewOrd(body, redraw);
    else if (k === 'shp') viewShp(body, redraw);
    else if (k === 'srt') viewSrt(body, redraw);
    else if (k === 'ssc') viewSched(body, 'ret', redraw);
    else viewSched(body, 'out', redraw);
  }
  // ---------- 마감 확정 (2026-11-25 · 안 끝난 것만 다음 기간으로) ----------
  async function closeTerm(name) {
    try {
      const t = D.term, nx = nextTerm(t);
      const v = await HS.db.rpc('erp_iw_close_preview', { p_term: t });
      const n = (x) => fmt(+(v && v[x]) || 0);
      const body = '<div style="line-height:1.9"><b>' + esc(termLabel(t)) + '</b> 을 마감합니다.<br><br>'
        + '① 이 기간은 <b>잠겨서 더 못 고칩니다</b> (보기는 그대로 · 관리자는 해제할 수 있습니다)<br>'
        + '② <b>아직 안 끝난 것만</b> <b>' + esc(termLabel(nx)) + '</b> 으로 넘어갑니다<br><br>'
        + '<div class="iwtw"><table class="no-no"><thead><tr><th>넘어가는 것</th><th class="n">품번</th><th class="n">수량</th><th class="n">이 기간 전체</th></tr></thead><tbody>'
        + '<tr><td>배분지시 <span class="iwm">(지시 − 출고)</span></td><td class="n"><b>' + n('ord_styles') + '</b></td><td class="n"><b>' + n('ord_qty') + '</b>장</td><td class="n iwm">' + n('ord_all') + '품번</td></tr>'
        + '<tr><td>정리 기준 <span class="iwm">(대상 − 완료)</span></td><td class="n"><b>' + n('inv_styles') + '</b></td><td class="n"><b>' + n('inv_qty') + '</b>장</td><td class="n iwm">' + n('inv_all') + '품번</td></tr>'
        + '</tbody></table></div>'
        + '<div class="iwm" style="font-size:12px;margin-top:8px">· 다 끝난 품번은 안 넘어갑니다 · <b>출고 실적 ' + n('shp_rows') + '줄 · 정리 실적 ' + n('cnt_rows') + '줄</b>은 이 기간에 그대로 남습니다<br>'
        + '· 다음 기간에 같은 품번이 이미 있으면 <b>덮어쓰지 않고 그대로</b> 둡니다</div></div>';
      if (!(await HS.modal('마감 확정 · ' + termLabel(t), '<div class="iwol">' + body + '</div>', [['취소', null], ['마감하고 넘기기', true, 'p']], { wide: true }))) return;
      const r = await HS.db.rpc('erp_iw_close', { p_term: t });
      HS.toast(termLabel(t) + ' 마감 · ' + termLabel(nx) + ' 으로 배분지시 ' + fmt(r.ord_moved) + '품번 · 정리 ' + fmt(r.inv_moved) + '품번을 넘겼습니다', 'ok');
      loadedTerm = null; HS.go(name, { k: HS.params().k || '', term: nx });
    } catch (e) { HS.err(e); }
  }
  function mkView(name, title) {
    HS.view(name, {
      title, perm: 'iwol',
      async render(body, p, tools) {
        clearDrag();
        body.innerHTML = '<div class="empty">자료 불러오는 중…</div>';
        await loadAll(p.term || curTerm());
        const tabs = TABS[name];
        const k = tabs.some((t) => t[0] === p.k) ? p.k : tabs[0][0];
        // 운영 기간 고르기 (상 · 하반기)
        const ts = HS.el('<select class="in" title="운영 기간">' + D.terms.map((x) => '<option value="' + esc(x.term) + '"' + (x.term === D.term ? ' selected' : '') + '>' + esc(x.label || termLabel(x.term)) + (x.closed ? ' (마감)' : '') + '</option>').join('') + '</select>');
        ts.onchange = () => HS.go(name, { k, term: ts.value });
        tools.appendChild(ts);
        tools.appendChild(HS.seg(tabs, k, (v) => HS.go(name, { k: v, term: D.term })));
        // 마감 확정은 관리자만 (2026-11-25 기본값 · 이월소터팀은 자료만 올림)
        if (HS.can('users', 'edit') && !isClosed()) { const cb = HS.el('<button class="btn p">마감 확정</button>'); cb.onclick = () => closeTerm(name); tools.appendChild(cb); }
        if (isClosed() && HS.can('users', 'edit')) { const rb = HS.el('<button class="btn">마감 해제</button>');
          rb.onclick = async () => { if (!(await HS.confirm(termLabel(D.term) + ' 마감을 풀까요?<br><span class="mute">넘어간 다음 기간 자료는 그대로 둡니다</span>'))) return;
            try { await HS.db.rpc('erp_iw_reopen', { p_term: D.term }); loadedTerm = null; HS.toast('마감을 풀었습니다', 'ok'); HS.route(); } catch (e) { HS.err(e); } };
          tools.appendChild(rb); }
        const draw = () => {
          clearDrag(); body.className = 'body iwol'; body.innerHTML = '';
          if (isClosed()) { const tm = D.terms.find((x) => x.term === D.term) || {};
            body.appendChild(el('<div class="lock" style="margin-bottom:12px">🔒 <b>' + esc(termLabel(D.term)) + ' 은 마감되었습니다</b> — 보기만 됩니다'
              + (tm.closed_at ? ' <span class="iwm">(' + esc(String(tm.closed_at).slice(0, 10)) + (tm.closed_by ? ' · ' + esc(tm.closed_by) : '') + ')</span>' : '')
              + (HS.can('users', 'edit') ? ' <span class="iwm">고치시려면 위 [마감 해제]</span>' : '') + '</div>'));
          }
          drawTab(body, k, draw);
        };
        draw();
      },
    });
  }
  mkView('iwret', '시즌반품정리현황');
  mkView('iwout', '선지시출고현황');
})();
