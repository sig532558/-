/* 이월팀 출고관리 단독판 — 2026-11-23 행님 지시로 처음부터 새로 만듦
 *  화면 4개: ① 배분지시  ② 출고 작업 현황  ③ 출고 일정  ④ 시즌 반품 정리(2026-11-24 더함)
 *  규칙은 '2026_전브랜드_지시대비출고_v7.xlsx' 의 [구분 기준] 시트 그대로.
 *  자료는 이 PC 브라우저(localStorage)에만 저장한다. */
(function () {
  'use strict';
  const KEY = 'hs_iwol_io_v1';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => (n == null || n === '' || isNaN(n) ? '' : Math.round(n).toLocaleString('ko-KR'));
  const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };
  const txt = (v) => String(v == null ? '' : v).trim();
  const num = (v) => { const n = +String(v == null ? '' : v).replace(/[,\s]/g, ''); return isFinite(n) ? n : 0; };

  // ---------- 품번에서 브랜드 · 시즌 · 복종 읽기 ([구분 기준] 시트) ----------
  const BRAND = { 1: '핑', 2: '팬텀', 4: '바니', 5: '파리', 8: '세인트', L: '링스', H: '하이', 6: '고커' };
  const CLS6 = { T: 'TS', S: 'SW', P: 'PT', J: 'JK' };
  const GRP = { TS: '이너', SW: '이너', PT: '이너', JK: 'JK', ACC: 'ACC' };
  const SE_NAME = { 1: '봄', 2: '여름', 3: '가을', 4: '겨울', 5: 'S/S', 6: 'F/W', 7: '논시즌' };
  const brandOf = (sty) => BRAND[String(sty || '').toUpperCase()[0]] || '(미확인)';
  const seasonOf = (sty) => { const s = String(sty || '').toUpperCase().slice(3, 5); return /^[A-Z]\d$/.test(s) ? s : ''; };
  const seaName = (code) => SE_NAME[code[1]] || code;
  const clsOf = (sty) => {
    const s = String(sty || '').toUpperCase(); const b = brandOf(s); const two = s.slice(5, 7);
    if (['핑', '팬텀', '링스'].indexOf(b) >= 0 && (two === 'JO' || two === 'JS')) return 'TS'; // 엑셀 규칙
    return CLS6[s[5]] || 'ACC';
  };
  const grpOf = (sty) => GRP[clsOf(sty)] || 'ACC';
  const OWNER = { 핑: '크리스', 팬텀: '크리스', 파리: '크리스', 바니: '크리스', 세인트: '크리스', 고커: '크리스', 하이: '크리스', 링스: 'LX' };
  const ownerOf = (bs) => { const o = [...new Set(bs.map((b) => OWNER[b] || ''))].filter(Boolean); return o.length === 1 ? o[0] : ''; };
  // 매장명으로 구분
  const kindOf = (store) => { const t = txt(store); if (/온라인/.test(t)) return 'online'; if (/배분\s*잔량/.test(t)) return 'rest'; return 'store'; };

  // ---------- 저장 ----------
  //  set = ③ 출고 일정 기준값 · set2 = ⑤ 시즌 정리 일정 기준값 (복종그룹마다 하루 정리량)
  //  sst/sst2 = 손으로 고친 줄별 시작일 · man/man2 = 날짜별 투입 인원 · band = 상단 일정 띠 (③·⑤ 함께 씀)
  const D0 = () => ({ set: { sorter: 30000, jk: 10000, start: '', off: '' }, set2: { 이너: 20000, JK: 8000, ACC: 5000, start: '' },
    ord: [], shp: {}, log: {}, inv: [], cnt: {}, sst: {}, sst2: {}, man: {}, man2: {}, band: [] });
  let D = D0();
  const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.set) D = Object.assign(D0(), s); } catch (e) { /* 처음 */ } };
  let tmr = null;
  const save = () => { clearTimeout(tmr); tmr = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { toast('저장 공간이 가득 찼습니다', 'err'); } }, 200); };

  // ---------- 알림 · 확인 ----------
  function toast(m, k) { const w = $('#toasts'); const t = el('<div class="toast' + (k ? ' ' + k : '') + '">' + esc(m) + '</div>'); w.appendChild(t); setTimeout(() => t.remove(), 3200); }
  function confirm2(msg) {
    return new Promise((res) => {
      const bg = el('<div class="modal-bg"><div class="modal"><h3>확인<span class="sp"></span><button class="x">✕</button></h3><div class="mb"><p style="margin:0;line-height:1.7">' + msg + '</p></div><div class="mf"><button class="btn">취소</button><button class="btn p">확인</button></div></div></div>');
      document.body.appendChild(bg);
      const done = (v) => { bg.remove(); res(v); };
      $('.x', bg).onclick = () => done(false); $$('.mf .btn', bg)[0].onclick = () => done(false); $$('.mf .btn', bg)[1].onclick = () => done(true);
    });
  }
  function sheet(title, body, okText) {
    return new Promise((res) => {
      const bg = el('<div class="modal-bg"><div class="modal wide"><h3>' + esc(title) + '<span class="sp"></span><button class="x">✕</button></h3><div class="mb"></div><div class="mf"><button class="btn">취소</button>' + (okText ? '<button class="btn p">' + esc(okText) + '</button>' : '') + '</div></div></div>');
      $('.mb', bg).appendChild(typeof body === 'string' ? el('<div>' + body + '</div>') : body);
      document.body.appendChild(bg);
      const done = (v) => { bg.remove(); res(v); };
      $('.x', bg).onclick = () => done(false); const bs = $$('.mf .btn', bg); bs[0].onclick = () => done(false); if (bs[1]) bs[1].onclick = () => done(true);
    });
  }

  // ---------- 엑셀 읽기 ----------
  const readSheets = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { try { const wb = XLSX.read(new Uint8Array(r.result), { type: 'array', cellDates: false });
      res(wb.SheetNames.map((n) => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, blankrows: false }) }))); } catch (e) { rej(e); } };
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
  // 머리글 찾기 — 칸 이름으로 (자리 번호를 믿지 않는다)
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

  // ---------- 집계 ----------
  const ordRows = () => D.ord;
  const shpRows = () => Object.values(D.shp);
  function aggOrd() { // 품번별 지시 → 브랜드 × 시즌 × 복종그룹
    const g = new Map();
    for (const r of D.ord) {
      const k = r.b + '|' + r.se + '|' + r.g;
      const o = g.get(k) || g.set(k, { b: r.b, se: r.se, g: r.g, store: 0, online: 0, rest: 0, all: 0, sty: new Set() }).get(k);
      o.store += r.store; o.online += r.online; o.rest += r.rest; o.all += r.store + r.online + r.rest; o.sty.add(r.sty);
    }
    return [...g.values()];
  }
  function aggShp() { // 출고 → 브랜드 × 시즌 × 복종그룹 · 날짜별
    const g = new Map(); const byD = new Map();
    for (const s of shpRows()) {
      const k = s.b + '|' + s.se + '|' + s.g;
      const o = g.get(k) || g.set(k, { b: s.b, se: s.se, g: s.g, store: 0, online: 0, rest: 0, all: 0 }).get(k);
      o[s.k] += s.q; o.all += s.q;
      const dk = k + '|' + s.d; byD.set(dk, (byD.get(dk) || 0) + s.q);
    }
    return { g, byD };
  }
  const dates = () => [...new Set(shpRows().map((s) => s.d))].filter(Boolean).sort();

  // ---------- 휴무일 · 날짜 ----------
  const HOL = ['2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02', '2026-05-05', '2026-05-25', '2026-06-03', '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-05', '2026-10-09', '2026-12-25',
    '2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-03-01', '2027-05-05', '2027-05-13', '2027-08-16', '2027-09-14', '2027-09-15', '2027-09-16', '2027-10-04', '2027-10-11', '2027-12-25'];
  // ⚠ 날짜는 UTC 로만 계산한다 — 한국 시간으로 만들면 toISOString() 이 하루 앞으로 밀려 날짜가 안 넘어간다
  const addD = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dow = (s) => new Date(s + 'T00:00:00Z').getUTCDay();
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const offSet = () => new Set(HOL.concat(String(D.set.off || '').split(/[\s,]+/).map(xlDate).filter(Boolean)));
  const workDay = (s, off) => dow(s) !== 0 && dow(s) !== 6 && !off.has(s);
  const md = (s) => (s ? (+s.slice(5, 7)) + '/' + (+s.slice(8, 10)) : '');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };

  // ---------- ③ 출고 일정 · ⑤ 시즌 정리 일정 계산 (한 엔진) ----------
  //  복종그룹(이너 · JK · ACC)마다 장비·작업조가 따로라 그룹별로 차례대로 날짜를 잡는다.
  //  차례는 행님이 정함(2026-11-24): 브랜드 파리›바니›세인트›핑›팬텀›링스 · 복종 이너›JK›ACC · 시즌 F1›E1›D1›C1 › F2›E2›D2›C2
  //   ③ 출고는 시즌 먼저, ⑤ 정리는 브랜드 먼저 돈다 (행님 지시).
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
    const P = schedCalc(aggOrd(), (g) => (g === 'JK' ? +D.set.jk : +D.set.sorter), D.set.start || today(), false, D.sst);
    P.forEach((G) => G.rows.forEach((r) => { r.did = (SH.g.get(r.key) || {}).all || 0; r.day = (dd) => SH.byD.get(r.key + '|' + dd) || 0; }));
    return P;
  }
  // ⑤ 시즌 정리 일정 — 기준은 ④ 에 올린 재고현황 · 실적은 재고실사현황 (일정은 '남은 수량'으로 잡는다 · 행님 지시)
  function srtItems() {
    const g = new Map();
    const get = (b, se, gr) => { const k = b + '|' + se + '|' + gr; return g.get(k) || g.set(k, { b, se, g: gr, base: 0, done: 0, sty: new Set() }).get(k); };
    D.inv.forEach((r) => { const o = get(r.b, r.se, r.g); o.base += r.q; o.sty.add(r.sty); });
    Object.values(D.cnt).forEach((r) => { get(r.b, r.se, r.g).done += r.q; });
    return [...g.values()].map((x) => Object.assign(x, { all: Math.max(0, x.base - x.done) }));
  }
  const srtByD = () => { const m = new Map(); Object.values(D.cnt).forEach((r) => { const k = r.b + '|' + r.se + '|' + r.g + '|' + r.d; m.set(k, (m.get(k) || 0) + r.q); }); return m; };
  function planSrt() {
    const BD = srtByD();
    const P = schedCalc(srtItems(), (g) => +D.set2[g], D.set2.start || today(), true, D.sst2);
    P.forEach((G) => G.rows.forEach((r) => { r.did = r.done; r.day = (dd) => BD.get(r.key + '|' + dd) || 0; }));
    return P;
  }

  // ================= 화면 =================
  const TABS = [['ord', '① 배분지시'], ['shp', '② 출고 작업 현황'], ['sch', '③ 출고 일정'], ['srt', '④ 시즌 반품 정리'], ['ssc', '⑤ 시즌 정리 일정']];
  let tab = 'ord';
  function render() {
    const root = $('#root');
    root.innerHTML = '<div class="wrap"><div class="side">'
      + '<div class="bd"><b>이월팀 출고관리</b><div class="mute" style="font-size:12px">배분지시 · 출고 · 일정 · 단독판</div></div>'
      + '<div class="warn">이 PC · 이 브라우저에만 저장됩니다</div>'
      + '<nav class="nav">' + TABS.map(([k, l]) => '<a href="#" data-t="' + k + '"' + (tab === k ? ' class="on"' : '') + '>' + l + '</a>').join('') + '</nav>'
      + '<div class="keep"><b>자료 지키기</b><div><a href="#" id="bk">백업 받기</a> · <a href="#" id="rs">백업 불러오기</a></div><div><a href="#" id="dl">자료 지우기</a></div><div class="mute" id="kb" style="font-size:11.5px"></div></div>'
      + '</div><div class="main"><div class="top"><h2 id="ttl"></h2><span class="sp"></span><div id="tools"></div></div><div id="body"></div></div></div>';
    $$('.nav a').forEach((a) => (a.onclick = (e) => { e.preventDefault(); tab = a.dataset.t; render(); }));
    $('#ttl').textContent = (TABS.find((t) => t[0] === tab) || [])[1] || '';
    const b = $('#body');
    if (tab === 'ord') viewOrd(b); else if (tab === 'shp') viewShp(b); else if (tab === 'srt') viewSrt(b); else if (tab === 'ssc') viewSsc(b); else viewSch(b);
    bindKeep();
  }
  function bindKeep() {
    const n = D.ord.length; const m = Object.keys(D.shp).length;
    $('#kb').textContent = '지시 ' + fmt(n) + '품번 · 출고 ' + fmt(m) + '줄 · 정리기준 ' + fmt(D.inv.length) + '품번 · 실적 ' + fmt(Object.keys(D.cnt).length) + '줄 · 저장 ' + Math.round((localStorage.getItem(KEY) || '').length / 1024) + 'KB';
    $('#bk').onclick = (e) => { e.preventDefault();
      const blob = new Blob([JSON.stringify({ app: 'iwol-io', made_at: new Date().toISOString(), data: D }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '이월팀출고관리_백업_' + today() + '.json'; a.click(); };
    $('#rs').onclick = (e) => { e.preventDefault(); const f = el('<input type="file" accept=".json">'); f.onchange = async () => {
      const file = f.files[0]; if (!file) return;
      try { const j = JSON.parse(await file.text()); if (!j.data || !j.data.set) throw new Error('이 앱의 백업 파일이 아닙니다');
        if (!(await confirm2('<b>' + esc(file.name) + '</b><br>지시 ' + fmt((j.data.ord || []).length) + '품번 · 출고 ' + fmt(Object.keys(j.data.shp || {}).length) + '줄 · 정리기준 ' + fmt((j.data.inv || []).length) + '품번 · 실적 ' + fmt(Object.keys(j.data.cnt || {}).length) + '줄<br><br>지금 자료를 이 백업으로 <b>모두 바꿉니다.</b> 계속할까요?'))) return;
        D = Object.assign(D0(), j.data); save(); render(); toast('백업을 불러왔습니다', 'ok');
      } catch (err) { toast(err.message, 'err'); } }; f.click(); };
    $('#dl').onclick = async (e) => { e.preventDefault();
      if (!(await confirm2('배분지시 · 출고 · 시즌 반품 정리 자료를 <b>모두 지웁니다.</b> 되돌릴 수 없습니다.'))) return;
      if (!(await confirm2('정말 지울까요? 백업을 받아 두셨나요?'))) return;
      D = D0(); save(); render(); toast('지웠습니다', 'ok'); };
  }

  // ---------- 올리는 칸 ----------
  function dropBox(label, hint, onFiles) {
    const w = el('<div class="drop"><b>' + esc(label) + '</b><div class="mute" style="font-size:12px;margin-top:4px">' + hint + '</div><input type="file" multiple accept=".xlsx,.xls,.csv" class="hide"></div>');
    const fi = $('input', w);
    w.onclick = (e) => { if (e.target !== fi) fi.click(); };
    w.ondragover = (e) => { e.preventDefault(); w.classList.add('over'); };
    w.ondragleave = () => w.classList.remove('over');
    w.ondrop = (e) => { e.preventDefault(); w.classList.remove('over'); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); };
    fi.onchange = () => { if (fi.files.length) onFiles([...fi.files]); fi.value = ''; };
    return w;
  }

  // ================= ① 배분지시 =================
  function viewOrd(body) {
    body.appendChild(dropBox('배분(지시) 엑셀 놓기 · 대량 등록', '<b>두 가지 양식</b>을 다 읽습니다 — 칸 이름으로 저절로 가립니다<br>① <b>원본 배분 파일</b> (품번 · 매장명 · 수량 / 매장이 가로로 펼쳐진 WMS 판매분 확정등록도 됨) · 매장명에 <b>온라인</b> → 온라인지시 · <b>배분잔량</b> → 배분잔량 · 나머지 → 매장지시<br>② <b>취합본</b> (품번 한 줄에 매장지시 · 온라인지시 · 배분잔량이 이미 갈라져 있는 표)', ordUpload));
    const A = aggOrd();
    if (!A.length) { body.appendChild(el('<div class="card"><div class="empty">배분 엑셀을 올리면 브랜드 · 시즌 · 복종별 지시 수량이 나옵니다</div></div>')); return; }
    const S = aggShp();
    const tot = { store: 0, online: 0, rest: 0, all: 0, did: 0 };
    const rows = A.sort((a, b) => (a.b < b.b ? -1 : a.b > b.b ? 1 : a.se < b.se ? -1 : a.se > b.se ? 1 : a.g < b.g ? -1 : 1));
    const body2 = rows.map((x) => { const did = (S.g.get(x.b + '|' + x.se + '|' + x.g) || {}).all || 0;
      tot.store += x.store; tot.online += x.online; tot.rest += x.rest; tot.all += x.all; tot.did += did;
      return '<tr><td>' + esc(x.b) + '</td><td>' + esc(x.se) + ' <span class="mute">' + esc(seaName(x.se)) + '</span></td><td>' + esc(x.g) + '</td><td class="n">' + fmt(x.sty.size) + '</td>'
        + '<td class="n">' + fmt(x.all) + '</td><td class="n">' + fmt(x.store) + '</td><td class="n">' + fmt(x.online) + '</td><td class="n">' + fmt(x.rest) + '</td>'
        + '<td class="n">' + fmt(did) + '</td><td class="n">' + (x.all ? (did / x.all * 100).toFixed(1) + '%' : '-') + '</td></tr>'; }).join('');
    body.appendChild(el('<div class="card"><h3>브랜드 · 시즌 · 복종별 지시 <small>품번 ' + fmt(D.ord.length) + '개 · 매장지시 = 전체지시 − 온라인 − 배분잔량</small></h3><div class="tw"><table>'
      + '<thead><tr><th>브랜드</th><th>시즌</th><th>복종그룹</th><th class="n">품번수</th><th class="n">전체지시</th><th class="n">매장지시</th><th class="n">온라인지시</th><th class="n">배분잔량</th><th class="n">출고합계</th><th class="n">출고율</th></tr></thead>'
      + '<tbody>' + body2 + '</tbody><tfoot><tr class="tot"><td colspan="4">합계</td><td class="n">' + fmt(tot.all) + '</td><td class="n">' + fmt(tot.store) + '</td><td class="n">' + fmt(tot.online) + '</td><td class="n">' + fmt(tot.rest) + '</td><td class="n">' + fmt(tot.did) + '</td><td class="n">' + (tot.all ? (tot.did / tot.all * 100).toFixed(1) + '%' : '-') + '</td></tr></tfoot></table></div></div>'));
  }
  // WMS [출고/반품관리 › 출고관리 › 판매분 확정등록] 파일 — 매장이 가로로 펼쳐진 표
  //  윗줄 = 매장 이름(0143 온라인쇼핑-출고용 · 0161 배분잔량 …) · 아랫줄 = 품번 · 색상 · 사이즈 · 위치정보 · 총수량 · 매장코드…
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
  // 취합본 모양 — 품번 한 줄에 매장지시 · 온라인지시 · 배분잔량 이 이미 갈라져 있는 표
  //  (복종그룹 칸이 있어도 안 쓴다 — 묶음은 품번에서 뽑은 앱 규칙으로 통일 · 2026-11-24 행님 확인)
  const SUMC = { style: /^품번$/, all: /^전체지시$|^지시합계$|^총지시$/, store: /^매장지시$/, online: /^온라인지시$/, rest: /^배분잔량$/, did: /^출고합계$/ };
  function findSum(rows) {
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const m = {}; (rows[r] || []).forEach((v, c) => { const t = txt(v).replace(/\s+/g, ''); if (!t) return; for (const k in SUMC) if (SUMC[k].test(t) && m[k] == null) m[k] = c; });
      if (m.style != null && (m.store != null || m.online != null || m.rest != null)) return { r, ix: m };
    }
    return null;
  }
  async function ordUpload(files) {
    try {
      const agg = new Map(); let lines = 0, skip = 0; const kinds = { store: 0, online: 0, rest: 0 }; let names = []; let wide = 0, sum = 0, didQ = 0;
      const put = (sty, k, q) => { const se = seasonOf(sty); if (!se) { skip++; return false; }
        const o = agg.get(sty) || agg.set(sty, { sty, b: brandOf(sty), se, cl: clsOf(sty), g: grpOf(sty), store: 0, online: 0, rest: 0 }).get(sty);
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
      const by = new Map(); list.forEach((x) => { const k = x.b + '|' + x.g; by.set(k, (by.get(k) || 0) + x.store + x.online + x.rest); });
      const had = new Set(D.ord.map((x) => x.sty)); const isNew = list.filter((x) => !had.has(x.sty)).length;
      const pre = el('<div><div style="line-height:1.8"><b>' + fmt(lines) + '줄</b> · 품번 <b>' + fmt(list.length) + '개</b> · 전체 <b>' + fmt(kinds.store + kinds.online + kinds.rest) + '장</b>'
        + (sum ? ' <span class="mute">(취합본 — 지시가 이미 갈라져 있는 파일)</span>' : wide ? ' <span class="mute">(매장이 가로로 펼쳐진 WMS 판매분 확정등록 파일)</span>' : '') + '<br>'
        + '매장지시 ' + fmt(kinds.store) + ' · 온라인지시 ' + fmt(kinds.online) + ' · 배분잔량 ' + fmt(kinds.rest) + '<br>'
        + '새 품번 <b>' + fmt(isNew) + '</b>개 · 이미 있던 품번 ' + fmt(list.length - isNew) + '개는 이 파일 값으로 바뀝니다'
        + (didQ ? '<br><span class="mute">이 파일의 <b>출고수량 ' + fmt(didQ) + '장</b>은 날짜가 없어 안 넣습니다 — 출고는 ② 화면에서 올리세요</span>' : '')
        + (skip ? '<br><span class="neg">시즌을 못 읽은 ' + fmt(skip) + '줄은 뺐습니다</span>' : '') + '</div>'
        + '<div class="tw" style="margin-top:8px;max-height:46vh;overflow:auto"><table><thead><tr><th>브랜드</th><th>복종그룹</th><th class="n">지시 수량</th></tr></thead><tbody>'
        + [...by.entries()].sort().map(([k, v]) => '<tr><td>' + esc(k.split('|')[0]) + '</td><td>' + esc(k.split('|')[1]) + '</td><td class="n">' + fmt(v) + '</td></tr>').join('')
        + '</tbody></table></div><div class="mute" style="font-size:11.5px;margin-top:8px"><b>품번 단위로 덮어씁니다.</b> 이 파일에 없는 품번(다른 브랜드 등)은 그대로 둡니다 — 브랜드별로 나눠 올려도 됩니다</div></div>');
      if (!(await sheet('배분지시 확인', pre, '등록'))) return;
      const keep = D.ord.filter((x) => !agg.has(x.sty));
      D.ord = keep.concat(list); save(); render();
      toast('배분지시 품번 ' + fmt(list.length) + '개를 넣었습니다 (새 ' + fmt(isNew) + ' · 모두 ' + fmt(D.ord.length) + ')', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }

  // ================= ② 출고 작업 현황 =================
  function viewShp(body) {
    body.appendChild(dropBox('출고 엑셀 놓기 · 대량 등록 (매일 이어서)', '칸 이름으로 저절로 찾습니다 · 날짜는 <b>등록일자</b>(실제로 일한 날)를 먼저 씁니다<br>같은 줄은 <b>송장번호 · 매장코드 · 품번 · 색상 · 사이즈 · 날짜</b>를 열쇠로 덮어써 두 번 쌓이지 않습니다', shpUpload));
    const S = shpRows();
    if (!S.length) { body.appendChild(el('<div class="card"><div class="empty">출고 엑셀을 올리면 지시 대비 출고 현황이 나옵니다</div></div>')); return; }
    const ds = dates(); const A = aggOrd(); const G = aggShp();
    // 날짜별
    const byDay = new Map(); S.forEach((s) => byDay.set(s.d, (byDay.get(s.d) || 0) + s.q));
    body.appendChild(el('<div class="card"><h3>날짜별 출고 <small>' + esc(ds[0] || '') + ' ~ ' + esc(ds[ds.length - 1] || '') + ' · ' + ds.length + '일 · 모두 ' + fmt(S.reduce((x, s) => x + s.q, 0)) + '장</small></h3><div class="tw"><table><thead><tr><th>출고일자</th><th>요일</th><th class="n">출고 수량</th><th class="n">누계</th></tr></thead><tbody>'
      + (() => { let c = 0; return ds.slice(-30).map((d) => { c += byDay.get(d) || 0; return '<tr><td>' + esc(d) + '</td><td>' + WD[dow(d)] + '</td><td class="n">' + fmt(byDay.get(d)) + '</td><td class="n">' + fmt(c) + '</td></tr>'; }).join(''); })()
      + '</tbody></table></div>' + (ds.length > 30 ? '<div class="mute" style="font-size:11.5px;margin-top:6px">마지막 30일만 보여 줍니다</div>' : '') + '</div>'));
    // 지시 대비 출고
    const rows = A.sort((a, b) => (a.b < b.b ? -1 : a.b > b.b ? 1 : a.se < b.se ? -1 : a.se > b.se ? 1 : a.g < b.g ? -1 : 1));
    const t = { all: 0, s: 0, o: 0, r: 0 };
    // 배분지시에 없는 출고(브랜드 · 시즌 · 복종그룹이 안 맞는 것)는 표에 안 들어가므로 따로 알려 준다
    const okK = new Set(A.map((x) => x.b + '|' + x.se + '|' + x.g));
    const miss = new Map(); let missQ = 0;
    S.forEach((s) => { const k = s.b + '|' + s.se + '|' + s.g; if (okK.has(k)) return; missQ += s.q; miss.set(s.b + ' ' + s.se + ' ' + s.g, (miss.get(s.b + ' ' + s.se + ' ' + s.g) || 0) + s.q); });
    if (missQ) body.appendChild(el('<div class="card" style="border-color:#E8B4B4;background:#FFF7F7"><h3 style="color:#B23A3A">배분지시에 없는 출고 ' + fmt(missQ) + '장 <small>그 브랜드 · 시즌 · 복종의 배분 파일을 아직 안 올렸습니다 — 올리면 저절로 붙습니다</small></h3><div class="tw"><table><thead><tr><th>브랜드 · 시즌 · 복종</th><th class="n">출고 수량</th></tr></thead><tbody>'
      + [...miss.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td class="n">' + fmt(v) + '</td></tr>').join('')
      + '</tbody></table></div></div>'));
    body.appendChild(el('<div class="card"><h3>지시 대비 출고 <small>매장 · 온라인 · 배분잔량 각각</small></h3><div class="tw"><table>'
      + '<thead><tr><th>브랜드</th><th>시즌</th><th>복종그룹</th><th class="n">전체지시</th><th class="n">매장출고</th><th class="n">온라인출고</th><th class="n">배분잔량출고</th><th class="n">출고합계</th><th class="n">미출고</th><th class="n">출고율</th></tr></thead><tbody>'
      + rows.map((x) => { const g = G.g.get(x.b + '|' + x.se + '|' + x.g) || { store: 0, online: 0, rest: 0, all: 0 };
        t.all += x.all; t.s += g.store; t.o += g.online; t.r += g.rest;
        return '<tr><td>' + esc(x.b) + '</td><td>' + esc(x.se) + '</td><td>' + esc(x.g) + '</td><td class="n">' + fmt(x.all) + '</td><td class="n">' + fmt(g.store) + '</td><td class="n">' + fmt(g.online) + '</td><td class="n">' + fmt(g.rest) + '</td><td class="n"><b>' + fmt(g.all) + '</b></td><td class="n' + (x.all - g.all > 0 ? ' neg' : '') + '">' + fmt(x.all - g.all) + '</td><td class="n">' + (x.all ? (g.all / x.all * 100).toFixed(1) + '%' : '-') + '</td></tr>'; }).join('')
      + '</tbody><tfoot><tr class="tot"><td colspan="3">합계</td><td class="n">' + fmt(t.all) + '</td><td class="n">' + fmt(t.s) + '</td><td class="n">' + fmt(t.o) + '</td><td class="n">' + fmt(t.r) + '</td><td class="n">' + fmt(t.s + t.o + t.r) + '</td><td class="n">' + fmt(t.all - (t.s + t.o + t.r)) + '</td><td class="n">' + (t.all ? ((t.s + t.o + t.r) / t.all * 100).toFixed(1) + '%' : '-') + '</td></tr></tfoot></table></div></div>'));
  }
  async function shpUpload(files) {
    try {
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
          // 한 줄 열쇠 — 송장번호가 없는 파일도 있어 매장코드 · 출고구분까지 넣는다 (안 그러면 같은 품번이 겹쳐 사라짐)
          const key = [txt(h.ix.inv != null ? x[h.ix.inv] : ''), txt(h.ix.scode != null ? x[h.ix.scode] : ''), txt(h.ix.kind != null ? x[h.ix.kind] : ''),
            sty, txt(h.ix.color != null ? x[h.ix.color] : ''), txt(h.ix.size != null ? x[h.ix.size] : ''), d].join('\u0001');
          add[key] = { d, sty, b: brandOf(sty), se, g: grpOf(sty), k, q };
          kinds[k] += q; lines++;
        }
      }
      const keys = Object.keys(add);
      if (!keys.length) throw new Error('품번 · 출고일자 · 출고수량 칸을 찾지 못했습니다. 읽은 칸 이름: ' + (names.slice(0, 14).join(', ') || '없음'));
      const isNew = keys.filter((k) => !D.shp[k]).length;
      const ds = [...new Set(keys.map((k) => add[k].d))].sort();
      const tot = keys.reduce((s, k) => s + add[k].q, 0);
      const pre = el('<div><div style="line-height:1.8"><b>' + fmt(lines) + '줄 · ' + fmt(tot) + '장</b> · 날짜 기준 <b>' + esc(dCol || '등록일자') + '</b> ' + esc(ds[0] || '') + (ds.length > 1 ? ' ~ ' + esc(ds[ds.length - 1]) : '') + ' (' + ds.length + '일)<br>'
        + '새로 들어오는 줄 <b>' + fmt(isNew) + '</b>개 · 이미 있던 줄 ' + fmt(keys.length - isNew) + '개는 덮어씁니다<br>'
        + '매장출고 ' + fmt(kinds.store) + ' · 온라인출고 ' + fmt(kinds.online) + ' · 배분잔량출고 ' + fmt(kinds.rest)
        + (noDate ? '<br><span class="neg">출고일자가 없는 ' + fmt(noDate) + '줄은 뺐습니다</span>' : '')
        + (skip ? '<br><span class="neg">시즌을 못 읽은 ' + fmt(skip) + '줄은 뺐습니다</span>' : '') + '</div>'
        + '<div class="mute" style="font-size:11.5px;margin-top:8px">열쇠 = 송장번호 · 매장코드 · 출고구분 · 품번 · 색상 · 사이즈 · 날짜 (같은 파일을 두 번 올려도 안 쌓입니다)</div></div>');
      if (!(await sheet('출고 자료 확인', pre, '등록'))) return;
      Object.assign(D.shp, add); save(); render(); toast('출고 ' + fmt(keys.length) + '줄을 넣었습니다 (새 줄 ' + fmt(isNew) + ')', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }

  // ================= ③ 출고 일정 =================
  // ================= ③ 출고 일정 · ⑤ 시즌 정리 일정 (한 틀로 그린다) =================
  //  2026-11-24 행님 지시: 표는 F안(엑셀 고밀도) · 일정 띠를 머리글 위로 · 거르기 · 줄마다 시작일 고치기
  //   · 인원을 넣어 '생산량 ÷ 인원 = 생산성' 이 날짜별로 나오는 별도 표
  const LANES = ['반품/출고 일정', '소터 작업 일정', '기타 일정'];
  const LC = ['#1E7A4B', '#8E3B4E', '#2B3A67', '#6B4C9A', '#B4660F', '#0F766E'];
  const GCOL = { 이너: '#1F3350', JK: '#B4660F', ACC: '#2F7A43' };
  // 묶음 차례(복종 · 시즌 · 브랜드)마다 쓰는 색 — 날짜칸 막대와 왼쪽 묶음 칸에 같이 쓴다
  const PAL = {
    g: GCOL,
    b: { 파리: '#1F3350', 바니: '#B4660F', 세인트: '#2F7A43', 핑: '#7A3E9D', 팬텀: '#0F766E', 링스: '#A33B5A', 고커: '#5B6470', 하이: '#8A5A2B' }
  };
  // 시즌 색은 만들어 쓴다 — 뒷자리(1봄 2여름 …)로 색깔을, 앞글자(F가 최신)로 짙기를 정한다.
  //  시즌 코드가 B2 · F3 · D7 처럼 계속 늘어나서 목록으로는 모자란다 (2026-11-24)
  const SE_HUE = { 1: 214, 2: 28, 3: 146, 4: 280, 5: 174, 6: 340, 7: 50, 8: 10, 9: 258, 0: 200 };
  const seCol = (v) => {
    const s = String(v || ''); const h = SE_HUE[s[1]] != null ? SE_HUE[s[1]] : 200;
    const i = Math.max(0, 'FEDCBA'.indexOf(s[0]));
    return 'hsl(' + h + ' 52% ' + (23 + i * 7) + '%)';
  };
  const VW = [['all', '모두'], ['sub', '소계만'], ['sum', '합계만'], ['both', '소계+합계만']];
  const SCFG = {
    sch: { t: '출고', ord0: ['g', 'se', 'b'],
      cols: [['days', '일정<br>(일)', 'n', 50], ['st', '시작일', 'c', 112], ['en', '종료일', 'c', 54],
        ['store', '매장<br>지시', 'n', 70], ['online', '온라인<br>지시', 'n', 70], ['rest', '배분<br>잔량', 'n', 64],
        ['did', '작업<br>수량', 'n', 70], ['gap', '차이<br>수량', 'n', 70]],
      note: '색칠한 칸 = 시작일~종료일 · 숫자 = 그날 출고 수량 (② 자료에서 자동)',
      empty: '① 배분지시를 올리면 출고 일정이 만들어집니다' },
    srt: { t: '정리', ord0: ['b', 'se', 'g'],
      cols: [['days', '일정<br>(일)', 'n', 50], ['st', '시작일', 'c', 112], ['en', '종료일', 'c', 54],
        ['base', '정리<br>대상', 'n', 70], ['done', '정리<br>완료', 'n', 70], ['all', '남은<br>수량', 'n', 70], ['pct', '진행률', 'n', 58]],
      note: '색칠한 칸 = 시작일~종료일 · 숫자 = 그날 정리 수량 (④ 재고실사 자료에서 자동)',
      empty: '④ 시즌 반품 정리에 재고현황을 올리면 정리 일정이 만들어집니다' }
  };

  function viewSched(body, mode) {
    const C = SCFG[mode];
    const st = mode === 'sch' ? D.set : D.set2;
    const sst = mode === 'sch' ? D.sst : D.sst2;
    const man = mode === 'sch' ? D.man : D.man2;
    // ---- 기준값 ----
    const SET = mode === 'sch'
      ? [['sorter', '소터 생산성 (이너 · ACC)', 'number'], ['jk', '크리스 JK 생산량', 'number'], ['start', '시작일', 'date']]
      : [['이너', '이너 하루 정리량', 'number'], ['JK', 'JK 하루 정리량', 'number'], ['ACC', 'ACC 하루 정리량', 'number'], ['start', '시작일', 'date']];
    const c = el('<div class="card no-tools"><h3>기준값 <small>바꾸면 일정이 바로 다시 계산됩니다 · 런닝타임은 처음 시작일~마지막 종료일로 저절로 나옵니다</small></h3><div class="setw"></div></div>');
    $('.setw', c).innerHTML = SET.map(([k, l, t]) => '<label class="f">' + l + '<input class="in" data-s="' + esc(k) + '" type="' + t + '" value="' + esc(st[k] == null ? '' : st[k]) + '"></label>').join('')
      + '<label class="f" style="flex:1 1 220px">휴무일 (쉼표로 · 예: 12/25, 2027-01-01)<input class="in" data-o="off" value="' + esc(D.set.off || '') + '"></label>';
    body.appendChild(c);
    $$('[data-s]', c).forEach((x) => (x.onchange = () => { st[x.dataset.s] = x.type === 'number' ? (+x.value || 0) : x.value; save(); x.blur(); setTimeout(render, 0); }));
    $$('[data-o]', c).forEach((x) => (x.onchange = () => { D.set.off = x.value; save(); x.blur(); setTimeout(render, 0); }));

    const P = mode === 'sch' ? plan() : planSrt();
    if (!P.length) { body.appendChild(el('<div class="card"><div class="empty">' + C.empty + '</div></div>')); return; }
    const RS = runSpan(P);
    // ---- 날짜 칸 ----
    const off = offSet();
    const dset = new Set(mode === 'sch' ? dates() : Object.values(D.cnt).map((r) => r.d).filter(Boolean));
    if (RS.st && RS.en) { let d = RS.st, n = 0; while (d <= RS.en && n++ < 500) { if (workDay(d, off)) dset.add(d); d = addD(d, 1); } }
    if (!st.f) st.f = { g: '', b: '', se: '', d1: '', d2: '', left: false, store: false };
    const F = st.f;
    const ds = [...dset].sort().filter((d) => (!F.d1 || d >= F.d1) && (!F.d2 || d <= F.d2)).slice(0, 200);
    // ---- 기준값 칸 ----
    const flatAll = []; P.forEach((G) => G.rows.forEach((r) => flatAll.push(r)));
    const tot = (f) => flatAll.reduce((s, r) => s + (f(r) || 0), 0);
    const kp = el('<div class="kps"></div>');
    kp.innerHTML = (mode === 'sch'
      ? [['전체 지시', fmt(tot((r) => r.all)) + '장'], ['출고 합계', fmt(tot((r) => r.did)) + '장'],
        ['진행률', tot((r) => r.all) ? (tot((r) => r.did) / tot((r) => r.all) * 100).toFixed(1) + '%' : '-'],
        ['남은 수량', fmt(tot((r) => r.all) - tot((r) => r.did)) + '장']]
      : [['정리 대상', fmt(tot((r) => r.base)) + '장'], ['정리 완료', fmt(tot((r) => r.done)) + '장'],
        ['진행률', tot((r) => r.base) ? (tot((r) => r.done) / tot((r) => r.base) * 100).toFixed(1) + '%' : '-'],
        ['남은 수량', fmt(tot((r) => r.all)) + '장']])
      .concat([['런닝타임', fmt(RS.days) + '일 <small style="font-weight:400;color:#6B7280">(일하는 날 ' + fmt(RS.work) + '일)</small>'],
        ['끝나는 날', md(RS.en) + ' <small style="font-weight:400;color:#6B7280">' + (RS.st ? md(RS.st) + ' 시작' : '') + '</small>']])
      .map(([l, v]) => '<div class="kc"><i>' + l + '</i><b>' + v + '</b></div>').join('');
    body.appendChild(kp);

    // ---- 줄 펴기 · 거르기 ----
    const gName = (G) => G;
    let flat = flatAll.slice();
    flat = flat.filter((r) => (!F.g || r.g === F.g) && (!F.b || r.b === F.b) && (!F.se || r.se === F.se)
      && (!F.store || r.store > 0) && (!F.left || (r.all - (mode === 'sch' ? r.did : 0)) > 0));
    const OKEY = { g: '복종', se: '시즌', b: '브랜드' };
    const OTX = { g: (x) => x.g, se: (x) => x.se, b: (x) => x.b };
    const OORD = { g: (v) => grpOrd(v), se: (v) => seOrd(v), b: (v) => brOrd(v) };
    if (!Array.isArray(st.ord) || !st.ord.filter((k) => OKEY[k]).length) st.ord = C.ord0.slice();
    const lv = st.ord.filter((k) => OKEY[k]);
    const FXC = C.cols;
    const COL0 = FXC.map((x) => x[0]);
    if (!Array.isArray(st.cols) || !st.cols.length) st.cols = COL0.slice();
    const FX = FXC.filter((x) => st.cols.indexOf(x[0]) >= 0);
    // 보기 — 모두 / 소계만 / 합계만 / 소계+합계만. TOTAL 줄은 늘 나온다 (2026-11-24 행님 지시)
    //  3단계 소계는 행님 지시로 뺐다 — 지금 묶음 줄은 TOTAL(1단계)과 소계(2단계) 둘뿐이라
    //  [합계만] 은 TOTAL 줄만, [소계만]·[소계+합계만] 은 TOTAL + 소계 가 된다.
    if (!st.view) st.view = st.only ? 'sub' : 'all'; // 옛 [모두/소계만] 설정 이어받기
    const vLeaf = st.view === 'all';
    const vSum = st.view !== 'sum';   // 2단계 소계 줄
    const NC = lv.length + FX.length;
    const SW = lv.map((k) => (k === 'g' ? 56 : k === 'se' ? 46 : 64)).concat(FX.map((x) => x[3]));
    const brs = [...new Set(flatAll.map((r) => r.b))].sort((a, b) => brOrd(a) - brOrd(b));
    const ses = [...new Set(flatAll.map((r) => r.se))].sort((a, b) => seOrd(a) - seOrd(b));
    const cf = el('<div class="card no-tools"><div class="cflt"></div></div>');
    body.appendChild(cf);
    $('.cflt', cf).innerHTML = '<div class="fg"><span class="t">거르기</span><div class="chips">'
      + '<span class="chip2' + (F.g ? '' : ' on') + '" data-g="">복종 전체</span>'
      + GRP_ORD.map((g) => '<span class="chip2' + (F.g === g ? ' on' : '') + '" data-g="' + g + '">' + g + '</span>').join('')
      + '<select class="in sm" data-f="b"><option value="">브랜드 전체</option>' + brs.map((b) => '<option' + (F.b === b ? ' selected' : '') + '>' + esc(b) + '</option>').join('') + '</select>'
      + '<select class="in sm" data-f="se"><option value="">시즌 전체</option>' + ses.map((s) => '<option' + (F.se === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select>'
      + '<input class="in sm" type="date" data-f="d1" value="' + esc(F.d1 || '') + '"><span class="mute">~</span><input class="in sm" type="date" data-f="d2" value="' + esc(F.d2 || '') + '">'
      + (mode === 'sch' ? '<span class="chip2' + (F.store ? ' on' : '') + '" data-b="store">매장지시 있는 것만</span>' : '')
      + '<span class="chip2' + (F.left ? ' on' : '') + '" data-b="left">덜 끝난 것만</span>'
      + '<span class="chip2 x" data-clr="1">거르기 지우기</span></div></div>'
      + '<div class="fg"><span class="t">묶음 차례</span><div class="chips" style="align-items:center">'
      + [0, 1, 2].map((i) => (i ? '<span class="mute" style="margin:0 3px">›</span>' : '')
        + '<select class="in sm" data-o="' + i + '" style="width:88px"><option value="">안 나눔</option>'
        + Object.keys(OKEY).map((k) => '<option value="' + k + '"' + (st.ord[i] === k ? ' selected' : '') + '>' + OKEY[k] + '</option>').join('') + '</select>').join('') + '</div></div>'
      + '<div class="fg"><span class="t">보일 칸</span><div class="chips">' + FXC.map(([k, l]) => '<span class="chip2' + (st.cols.indexOf(k) >= 0 ? ' on' : '') + '" data-col="' + k + '">' + l.replace('<br>', '') + '</span>').join('') + '</div></div>'
      + '<div class="fg"><span class="t">보기</span><div class="chips">'
      + VW.map(([k, l]) => '<span class="chip2' + (st.view === k ? ' on' : '') + '" data-vw="' + k + '">' + l + '</span>').join('')
      + '</div></div>';
    $$('.cflt [data-g]', cf).forEach((x) => (x.onclick = () => { F.g = x.dataset.g; save(); render(); }));
    $$('.cflt [data-f]', cf).forEach((x) => (x.onchange = () => { F[x.dataset.f] = x.value; save(); x.blur(); setTimeout(render, 0); }));
    $$('.cflt [data-b]', cf).forEach((x) => (x.onclick = () => { F[x.dataset.b] = !F[x.dataset.b]; save(); render(); }));
    $$('.cflt [data-clr]', cf).forEach((x) => (x.onclick = () => { st.f = { g: '', b: '', se: '', d1: '', d2: '', left: false, store: false }; save(); render(); }));
    $$('.cflt [data-o]', cf).forEach((x) => (x.onchange = () => { const i = +x.dataset.o, v = x.value;
      const a2 = st.ord.slice(); const j = a2.indexOf(v); if (v && j >= 0 && j !== i) a2[j] = a2[i]; a2[i] = v;
      st.ord = a2.filter(Boolean).concat(['', '', '']).slice(0, 3); save(); x.blur(); setTimeout(render, 0); }));
    $$('.cflt [data-col]', cf).forEach((x) => (x.onclick = () => { const k = x.dataset.col;
      if (st.cols.indexOf(k) >= 0) { if (st.cols.length <= 1) return toast('적어도 한 칸은 남겨야 합니다', 'err'); st.cols = st.cols.filter((y) => y !== k); }
      else st.cols = COL0.filter((y) => y === k || st.cols.indexOf(y) >= 0);
      save(); render(); }));
    $$('.cflt [data-vw]', cf).forEach((x) => (x.onclick = () => { st.view = x.dataset.vw; save(); render(); }));

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
        if (k === 'st' && leaf) s = '<input class="dt' + (list[0].man ? ' man' : '') + '" type="date" data-sk="' + esc(list[0].key) + '" value="' + esc(list[0].st) + '">';
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
    // 날짜칸 색은 '소계 기준'(묶음 차례의 둘째 단계)을 따른다 — 차례를 바꾸면 색도 같이 바뀐다 (2026-11-24 행님 지시)
    //  줄마다 제 단계 색을 쓴다 — TOTAL 은 1단계, 소계는 2단계, 상세 줄은 3단계 (③·⑤ 똑같이)
    const colK = lv.length > 1 ? lv[1] : lv[0];
    const colOf = (k, v) => (k === 'se' ? seCol(v) : (PAL[k] && PAL[k][v]) || '#44506B');
    const gcOf = (list) => colOf(colK, OTX[colK](list[0]));
    // ---- 머리글 ----
    const leftCell = (ci, cs, cls, inner) => '<td class="st ' + cls + '" data-ci="' + ci + '" colspan="' + cs + '">' + inner + '</td>';
    let h = '<table class="sched f"><thead>';
    // 일정 띠 — 머리글 위 (2026-11-24 행님 지시로 위아래 바꿈)
    LANES.forEach((ln, li) => {
      h += '<tr class="bd">' + leftCell(0, lv.length, 'c lane', '<b>' + esc(ln) + '</b>')
        + leftCell(lv.length, FX.length, 'c last', '<span class="mute">띠를 눌러 ✎고치기 · ✕빼기</span>');
      const its = (D.band || []).filter((x) => x.l === li).sort((a, b) => (a.s < b.s ? -1 : 1));
      let i = 0, used = -1;
      while (i < ds.length) { const d = ds[i];
        const it = its.find((x, xi) => xi > used && d >= x.s && d <= x.e);
        if (it) { const n = ds.filter((y, yi) => yi >= i && y <= it.e).length; used = its.indexOf(it);
          h += '<td class="dy c" colspan="' + n + '"><div class="bandc" style="background:' + esc(it.c) + '" data-bi="' + D.band.indexOf(it) + '">'
            + esc(it.x) + ' <i data-be="' + D.band.indexOf(it) + '">✎</i><i data-bx="' + D.band.indexOf(it) + '">✕</i></div></td>'; i += n; }
        else { h += dayTd(d, '', ''); i++; } }
      h += '</tr>';
    });
    // 월 머리줄
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
    // 맨 아래 전체 합계 — 거르기에 걸린 줄만 더한다 (2026-11-24 행님 지시)
    if (flat.length) h += '<tfoot><tr class="tot gt"><td class="st grp c" data-ci="0" colspan="' + lv.length + '"><b>전체 합계</b></td>'
      + cells(flat, lv.length, false) + dayCells(flat, false) + '</tr></tfoot>';
    h += '</table>';
    const ct = el('<div class="card no-tools"><h3>' + C.t + ' 일정 <small>' + C.note + (lv.length > 1 ? ' · ' + OKEY[lv[0]] + ' TOTAL › ' + OKEY[lv[1]] + ' 소계' : '') + '</small><span class="sp"></span><button class="btn sm" id="sx">엑셀</button></h3><div class="tw gtt"></div>'
      + '<div class="addb"><select class="in sm" id="bl">' + LANES.map((l, i) => '<option value="' + i + '">' + esc(l) + '</option>').join('') + '</select>'
      + '<input class="in sm" type="date" id="bs" value="' + esc(ds[0] || today()) + '"><span class="mute">~</span><input class="in sm" type="date" id="be" value="' + esc(ds[0] || today()) + '">'
      + '<input class="in sm" id="bx" placeholder="내용 (예: 3011 전배장 1차 봉의류)" style="width:240px"><button class="btn sm p" id="ba">띠 더하기</button>'
      + '<span class="mute" style="font-size:11.5px">노란 칸 = 시작일 직접 고치기 · 막대를 끌면 일정이 옮겨지고, 빈 곳을 끌면 표가 움직입니다</span></div></div>');
    body.appendChild(ct); $('.gtt', ct).innerHTML = h;
    const wrap = $('.gtt', ct);
    // 왼쪽 칸 고정
    const lefts = []; let acc = 0; SW.forEach((w) => { lefts.push(acc); acc += w; });
    const narrow = window.innerWidth < 900;
    $$('.st[data-ci]', wrap).forEach((cEl) => { const i = +cEl.dataset.ci; const cs = +(cEl.getAttribute('colspan') || 1);
      if (narrow && i >= lv.length) { cEl.classList.remove('st'); return; }
      let w = 0; for (let k = i; k < Math.min(NC, i + cs); k++) w += SW[k];
      cEl.style.left = lefts[i] + 'px'; if (cs === 1) { cEl.style.minWidth = w + 'px'; cEl.style.maxWidth = w + 'px'; } });
    const tth = wrap.querySelector('thead th.tod'); if (tth) wrap.scrollLeft = Math.max(0, tth.offsetLeft - (narrow ? lefts[lv.length] || 0 : acc) - 2 * tth.offsetWidth);
    // 줄마다 시작일 고치기
    $$('input[data-sk]', wrap).forEach((x) => (x.onchange = () => { const k = x.dataset.sk;
      if (x.value) sst[k] = x.value; else delete sst[k]; save(); x.blur(); setTimeout(render, 0); }));
    // 띠 더하기 · 고치기 · 빼기
    $('#ba', ct).onclick = () => { const s = $('#bs', ct).value, e = $('#be', ct).value, x = $('#bx', ct).value.trim();
      if (!s || !e || !x) return toast('날짜와 내용을 넣어 주세요', 'err');
      if (e < s) return toast('끝 날짜가 시작보다 앞입니다', 'err');
      D.band.push({ l: +$('#bl', ct).value, s, e, x, c: LC[D.band.length % LC.length] }); save(); render(); };
    $$('[data-bx]', wrap).forEach((x) => (x.onclick = async (ev) => { ev.stopPropagation(); const i = +x.dataset.bx;
      if (await confirm2('<b>' + esc(D.band[i].x) + '</b> 띠를 뺄까요?')) { D.band.splice(i, 1); save(); render(); } }));
    $$('[data-be]', wrap).forEach((x) => (x.onclick = async (ev) => { ev.stopPropagation(); const i = +x.dataset.be; const b = D.band[i];
      const f = el('<div><label class="f">시작<input class="in" type="date" id="e1" value="' + esc(b.s) + '"></label>'
        + '<label class="f">끝<input class="in" type="date" id="e2" value="' + esc(b.e) + '"></label>'
        + '<label class="f" style="flex:1 1 240px">내용<input class="in" id="e3" value="' + esc(b.x) + '"></label>'
        + '<label class="f">색<input class="in" type="color" id="e4" value="' + esc(b.c) + '" style="width:60px;padding:2px"></label></div>');
      f.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
      if (await sheet('일정 띠 고치기', f, '바꾸기')) { b.s = $('#e1', f).value || b.s; b.e = $('#e2', f).value || b.e; b.x = $('#e3', f).value || b.x; b.c = $('#e4', f).value || b.c; save(); render(); } }));
    // 끌기 — 막대는 일정 옮기기 · 빈 곳은 표 움직이기
    let dg = null;
    wrap.addEventListener('mousedown', (e) => {
      const bar = e.target.closest ? e.target.closest('td.dy.bar[data-key]') : null;
      if (e.target.closest && e.target.closest('input,select,button,.bandc')) return;
      dg = bar ? { k: 'bar', key: bar.dataset.key, d0: bar.dataset.d, x: e.clientX }
        : { k: 'pan', x: e.clientX, sl: wrap.scrollLeft };
      if (!bar) { wrap.classList.add('pan'); e.preventDefault(); }
    });
    window.addEventListener('mousemove', (e) => { if (!dg) return;
      if (dg.k === 'pan') wrap.scrollLeft = dg.sl - (e.clientX - dg.x); });
    window.addEventListener('mouseup', (e) => { if (!dg) return; const d0 = dg; dg = null; wrap.classList.remove('pan');
      if (d0.k !== 'bar' || Math.abs(e.clientX - d0.x) < 6) return;
      const t = document.elementFromPoint(e.clientX, e.clientY); const td = t && t.closest ? t.closest('td.dy[data-d]') : null;
      if (!td) return;
      const row = flatAll.find((r) => r.key === d0.key); if (!row) return;
      const mv = Math.round((new Date(td.dataset.d + 'T00:00:00Z') - new Date(d0.d0 + 'T00:00:00Z')) / 864e5);
      if (!mv) return;
      let nd = addD(row.st, mv); const o2 = offSet(); let n = 0; while (!workDay(nd, o2) && n++ < 30) nd = addD(nd, 1);
      sst[d0.key] = nd; save(); render(); toast(row.b + ' ' + row.se + ' ' + row.g + ' → ' + md(nd) + ' 시작', 'ok');
    });

    // ---- 일별 생산량 · 인원 · 생산성 ----
    const PG = GRP_ORD.filter((g) => flatAll.some((r) => r.g === g));
    const qOf = (g, d) => flatAll.filter((r) => r.g === g).reduce((s, r) => s + r.day(d), 0);
    let ph = '<table class="sched f prd"><thead><tr><th class="st c" data-ci="0">구분</th><th class="st c last" data-ci="1">합계 · 평균</th>'
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
        + ds.map((d) => '<td class="dy n"><input class="mn" type="number" min="0" data-mg="' + esc(g) + '" data-md="' + d + '" value="' + (man[g + '|' + d] == null ? '' : esc(man[g + '|' + d])) + '"></td>').join('') + '</tr>'
        + '<tr class="pp"><td class="st n last" data-ci="1">' + (daysOn && mAvg ? fmt(qt / daysOn / mAvg) : '') + '</td>'
        + ds.map((d, i) => '<td class="dy n" data-pg="' + esc(g) + '" data-pd="' + d + '">' + (qs[i] && ms[i] ? fmt(qs[i] / ms[i]) : '') + '</td>').join('') + '</tr>';
    });
    ph += '</tbody>';
    // 전체 합계 줄 — 복종 다 더한 생산량 · 인원 · 생산성 (2026-11-24 행님 지시)
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
    const pc = el('<div class="card no-tools"><h3>일별 생산량 · 인원 · 생산성 <small>생산량 ÷ 인원 = 생산성 · 인원 칸만 손으로 넣습니다</small><span class="sp"></span><button class="btn sm" id="px">엑셀</button></h3><div class="tw gtt prdw"></div>'
      + '<div class="mute" style="font-size:11.5px;margin-top:6px">줄 차례 — 위: 생산량(자동) · 가운데: <b>투입 인원(입력)</b> · 아래: 생산성</div></div>');
    body.appendChild(pc); $('.prdw', pc).innerHTML = ph;
    const pw = $('.prdw', pc);
    { const l2 = [0, 76]; $$('.st[data-ci]', pw).forEach((cEl) => { const i = +cEl.dataset.ci;
      cEl.style.left = l2[i] + 'px'; cEl.style.minWidth = (i ? 86 : 76) + 'px'; cEl.style.maxWidth = (i ? 86 : 76) + 'px'; }); }
    $$('input[data-mg]', pw).forEach((x) => (x.oninput = () => { const g = x.dataset.mg, d = x.dataset.md; const v = +x.value || 0;
      if (v) man[g + '|' + d] = v; else delete man[g + '|' + d]; save();
      const cell = pw.querySelector('td[data-pg="' + g + '"][data-pd="' + d + '"]'); const q = qOf(g, d);
      if (cell) cell.textContent = q && v ? fmt(q / v) : '';
      // 전체 합계 줄도 같이 고친다
      const am = PG.reduce((s, gg) => s + (+man[gg + '|' + d] || 0), 0); const aq = PG.reduce((s, gg) => s + qOf(gg, d), 0);
      const c1 = pw.querySelector('td[data-ag="' + d + '"]'); if (c1) c1.textContent = am || '';
      const c2 = pw.querySelector('td[data-ap="' + d + '"]'); if (c2) c2.textContent = aq && am ? fmt(aq / am) : ''; }));
    // ---- 엑셀 ----
    $('#sx', ct).onclick = () => {
      const out = flat.map((r) => { const row = {}; lv.forEach((k) => (row[OKEY[k]] = OTX[k](r)));
        const v = V([r]); FX.forEach(([k, l]) => (row[l.replace('<br>', '')] = k === 'st' ? r.st : k === 'en' ? r.en : v[k]));
        ds.forEach((d) => (row[md(d)] = r.day(d) || '')); return row; });
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), C.t + '일정');
      XLSX.writeFile(wb, '이월팀_' + C.t + '일정_' + today() + '.xlsx');
    };
    $('#px', pc).onclick = () => {
      const out = []; PG.forEach((g) => { const a = { 구분: g, 값: '생산량' }, b = { 구분: g, 값: '인원' }, c2 = { 구분: g, 값: '생산성' };
        ds.forEach((d) => { const q = qOf(g, d), m = +man[g + '|' + d] || 0;
          a[md(d)] = q || ''; b[md(d)] = m || ''; c2[md(d)] = q && m ? Math.round(q / m) : ''; });
        out.push(a, b, c2); });
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), '생산성');
      XLSX.writeFile(wb, '이월팀_' + C.t + '생산성_' + today() + '.xlsx');
    };
  }
  const viewSch = (b) => viewSched(b, 'sch');
  const viewSsc = (b) => viewSched(b, 'srt');

  // ================= ④ 시즌 반품 정리 =================
  //  기준 = WMS 재고현황 (품번 · 현재고)   ·   실적 = WMS 재고실사현황 (품번 · 실사수량 · 입력일자)
  //  2026-11-24 행님 지시. 실사수량 = '그날 정리한 수량' · 날짜 = 입력일자 (2026-11-23 확인한 규칙 그대로).
  const nm = (v) => txt(v).replace(/\s+/g, '');
  const pick = (names, pats) => { for (const p of pats) { const i = names.findIndex((t) => p.test(t)); if (i >= 0) return i; } return -1; };
  const ST_C = [/^품번$/, /^스타일$|스타일No/i, /^STYLE$/i];
  const INV_Q = [/^현재고$/, /^재고수량$/, /^누적재고/, /^재고$/, /^수량$/];
  const CNT_Q = [/^실사수량$/, /^실사$/, /실사.*수량/, /^정리수량$/, /^작업수량$/, /^수량$/];
  const CNT_D = [/^입력일자$/, /^실사일자$/, /^등록일자$/, /^일자$|^날짜$/];
  // 머리글이 있는 '첫 시트'만 읽는다 — 한 파일에 집계 시트가 여러 개면 같은 수량을 두 번 더하기 때문
  function findCols(rows, qp, dp) {
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const names = (rows[r] || []).map(nm);
      const s = pick(names, ST_C); if (s < 0) continue;
      const q = pick(names, qp); if (q < 0) continue;
      const d = dp ? pick(names, dp) : -1; if (dp && d < 0) continue;
      return { r, s, q, d, names, color: pick(names, [/^색상$/, /^칼라$/]), size: pick(names, [/^사이즈$/]) };
    }
    return null;
  }
  const invRows = () => D.inv;
  const cntRows = () => Object.values(D.cnt);
  function aggSrt() { // 브랜드 × 시즌 × 복종그룹 — 기준 · 실적
    const g = new Map();
    const get = (b, se, gr) => { const k = b + '|' + se + '|' + gr; return g.get(k) || g.set(k, { b, se, g: gr, base: 0, done: 0, sty: new Set() }).get(k); };
    D.inv.forEach((r) => { const o = get(r.b, r.se, r.g); o.base += r.q; o.sty.add(r.sty); });
    cntRows().forEach((r) => { get(r.b, r.se, r.g).done += r.q; });
    return [...g.values()];
  }

  async function invUpload(files) { // 정리 기준 — WMS 재고현황
    try {
      const agg = new Map(); let lines = 0, skip = 0; const read = []; let names = [];
      for (const f of files) for (const sh of await readSheets(f)) {
        const h = findCols(sh.rows, INV_Q, null); if (!h) { names = (sh.rows[0] || []).map(txt); continue; }
        read.push(f.name + (sh.name ? ' [' + sh.name + ']' : '')); names = h.names;
        for (let r = h.r + 1; r < sh.rows.length; r++) {
          const x = sh.rows[r]; if (!x) continue; const sty = txt(x[h.s]).toUpperCase();
          if (!sty || sty === '품번') continue; const q = num(x[h.q]); if (!q) continue;
          const se = seasonOf(sty); if (!se) { skip++; continue; }
          const o = agg.get(sty) || agg.set(sty, { sty, b: brandOf(sty), se, cl: clsOf(sty), g: grpOf(sty), q: 0 }).get(sty);
          o.q += q; lines++;
        }
        break; // 파일마다 첫 시트만
      }
      if (!agg.size) throw new Error('품번 · 현재고 칸이 있는 시트를 찾지 못했습니다. 읽은 칸 이름: ' + (names.slice(0, 14).join(', ') || '없음'));
      const list = [...agg.values()]; const tot = list.reduce((s, x) => s + x.q, 0);
      const by = new Map(); list.forEach((x) => { const k = x.b + '|' + x.g; by.set(k, (by.get(k) || 0) + x.q); });
      const had = new Set(D.inv.map((x) => x.sty)); const isNew = list.filter((x) => !had.has(x.sty)).length;
      const pre = el('<div><div style="line-height:1.8"><b>' + fmt(lines) + '줄</b> · 품번 <b>' + fmt(list.length) + '개</b> · 정리 대상 <b>' + fmt(tot) + '장</b><br>'
        + '읽은 시트: ' + esc(read.join(' · ')) + '<br>'
        + '새 품번 <b>' + fmt(isNew) + '</b>개 · 이미 있던 품번 ' + fmt(list.length - isNew) + '개는 이 파일 값으로 바뀝니다'
        + (skip ? '<br><span class="neg">시즌을 못 읽은 ' + fmt(skip) + '줄은 뺐습니다</span>' : '') + '</div>'
        + '<div class="tw" style="margin-top:8px;max-height:46vh;overflow:auto"><table><thead><tr><th>브랜드</th><th>복종그룹</th><th class="n">정리 대상</th></tr></thead><tbody>'
        + [...by.entries()].sort().map(([k, v]) => '<tr><td>' + esc(k.split('|')[0]) + '</td><td>' + esc(k.split('|')[1]) + '</td><td class="n">' + fmt(v) + '</td></tr>').join('')
        + '</tbody></table></div><div class="mute" style="font-size:11.5px;margin-top:8px"><b>품번 단위로 덮어씁니다.</b> 이 파일에 없는 품번은 그대로 둡니다 — 브랜드별로 나눠 올려도 됩니다</div></div>');
      if (!(await sheet('정리 기준 확인 (재고현황)', pre, '등록'))) return;
      D.inv = D.inv.filter((x) => !agg.has(x.sty)).concat(list); save(); render();
      toast('정리 기준 품번 ' + fmt(list.length) + '개를 넣었습니다 (모두 ' + fmt(D.inv.length) + ')', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }

  async function cntUpload(files) { // 정리 실적 — WMS 재고실사현황
    try {
      const add = {}; let lines = 0, skip = 0, noD = 0; let dcol = ''; const read = []; let names = [];
      for (const f of files) for (const sh of await readSheets(f)) {
        const h = findCols(sh.rows, CNT_Q, CNT_D); if (!h) { names = (sh.rows[0] || []).map(txt); continue; }
        read.push(f.name + (sh.name ? ' [' + sh.name + ']' : '')); names = h.names; dcol = h.names[h.d] || '';
        for (let r = h.r + 1; r < sh.rows.length; r++) {
          const x = sh.rows[r]; if (!x) continue; const sty = txt(x[h.s]).toUpperCase();
          if (!sty || sty === '품번') continue; const q = num(x[h.q]); if (!q) continue;
          const d = xlDate(x[h.d]); if (!d) { noD++; continue; }
          const se = seasonOf(sty); if (!se) { skip++; continue; }
          // 열쇠 = 품번 · 색상 · 사이즈 · 날짜 — 같은 파일을 두 번 올려도 안 쌓인다.
          //  한 파일 안에서 같은 열쇠가 여러 줄(로케이션이 다른 경우)이면 더한다.
          const key = [sty, txt(h.color >= 0 ? x[h.color] : ''), txt(h.size >= 0 ? x[h.size] : ''), d].join('\u0001');
          const c = add[key];
          add[key] = { d, sty, b: brandOf(sty), se, g: grpOf(sty), q: (c ? c.q : 0) + q };
          lines++;
        }
        break;
      }
      const keys = Object.keys(add);
      if (!keys.length) throw new Error('품번 · 실사수량 · 입력일자 칸이 있는 시트를 찾지 못했습니다. 읽은 칸 이름: ' + (names.slice(0, 14).join(', ') || '없음'));
      const tot = keys.reduce((s, k) => s + add[k].q, 0);
      const ds = [...new Set(keys.map((k) => add[k].d))].sort();
      const over = keys.filter((k) => D.cnt[k]).length;
      const byD = new Map(); keys.forEach((k) => byD.set(add[k].d, (byD.get(add[k].d) || 0) + add[k].q));
      const pre = el('<div><div style="line-height:1.8"><b>' + fmt(lines) + '줄</b> · 정리 완료 <b>' + fmt(tot) + '장</b> · 날짜 기준 <b>' + esc(dcol) + '</b><br>'
        + esc(ds[0] || '') + (ds.length > 1 ? ' ~ ' + esc(ds[ds.length - 1]) : '') + ' · ' + ds.length + '일<br>'
        + '읽은 시트: ' + esc(read.join(' · ')) + '<br>'
        + '새로 들어오는 줄 <b>' + fmt(keys.length - over) + '</b>개 · 이미 있던 줄 ' + fmt(over) + '개는 덮어씁니다'
        + (noD ? '<br><span class="neg">날짜가 없는 ' + fmt(noD) + '줄은 뺐습니다</span>' : '')
        + (skip ? '<br><span class="neg">시즌을 못 읽은 ' + fmt(skip) + '줄은 뺐습니다</span>' : '') + '</div>'
        + '<div class="tw" style="margin-top:8px;max-height:40vh;overflow:auto"><table><thead><tr><th>날짜</th><th>요일</th><th class="n">정리 수량</th></tr></thead><tbody>'
        + [...byD.entries()].sort().map(([d, v]) => '<tr><td>' + esc(d) + '</td><td>' + WD[dow(d)] + '</td><td class="n">' + fmt(v) + '</td></tr>').join('')
        + '</tbody></table></div><div class="mute" style="font-size:11.5px;margin-top:8px">열쇠 = <b>품번 · 색상 · 사이즈 · 날짜</b> (같은 파일을 두 번 올려도 안 쌓입니다)</div></div>');
      if (!(await sheet('정리 실적 확인 (재고실사현황)', pre, '등록'))) return;
      Object.assign(D.cnt, add); save(); render();
      toast('정리 실적 ' + fmt(keys.length) + '줄 · ' + fmt(tot) + '장을 넣었습니다', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }

  function viewSrt(body) {
    body.appendChild(dropBox('① 정리 기준 엑셀 놓기 · WMS 재고현황', '정리해야 할 대상 수량입니다 · 칸 이름으로 저절로 찾습니다 (품번 · <b>현재고</b>)<br>품번에서 브랜드 · 시즌 · 복종을 뽑아 묶습니다 · <b>품번 단위로 덮어씁니다</b>', invUpload));
    body.appendChild(dropBox('② 정리 실적 엑셀 놓기 · WMS 재고실사현황 (매일 이어서)', '그날 정리한 수량입니다 · 칸 이름으로 저절로 찾습니다 (품번 · <b>실사수량</b> · <b>입력일자</b>)<br>같은 줄은 <b>품번 · 색상 · 사이즈 · 날짜</b>를 열쇠로 덮어써 두 번 쌓이지 않습니다', cntUpload));
    const A = aggSrt();
    if (!A.length) { body.appendChild(el('<div class="card"><div class="empty">재고현황을 올리면 정리 대상이, 재고실사현황을 올리면 정리 완료 수량이 나옵니다</div></div>')); return; }
    const C = cntRows();
    const base = A.reduce((s, x) => s + x.base, 0); const done = A.reduce((s, x) => s + x.done, 0);
    const ds = [...new Set(C.map((r) => r.d))].filter(Boolean).sort();
    const kp = el('<div class="kps"></div>');
    kp.innerHTML = [['정리 대상', fmt(base) + '장'], ['정리 완료', fmt(done) + '장'], ['진행률', base ? (done / base * 100).toFixed(1) + '%' : '-'],
      ['남은 수량', fmt(base - done) + '장'], ['일한 날', fmt(ds.length) + '일'], ['하루 평균', ds.length ? fmt(done / ds.length) + '장' : '-']]
      .map(([l, v]) => '<div class="kc"><i>' + l + '</i><b>' + v + '</b></div>').join('');
    body.appendChild(kp);
    // 날짜별 정리 수량
    if (ds.length) {
      const byD = new Map(); C.forEach((r) => byD.set(r.d, (byD.get(r.d) || 0) + r.q));
      let c = 0;
      body.appendChild(el('<div class="card"><h3>날짜별 정리 수량 <small>' + esc(ds[0]) + ' ~ ' + esc(ds[ds.length - 1]) + ' · ' + ds.length + '일 · 모두 ' + fmt(done) + '장</small></h3><div class="tw"><table>'
        + '<thead><tr><th>입력일자</th><th>요일</th><th class="n">정리 수량</th><th class="n">누계</th><th class="n">남은 수량</th></tr></thead><tbody>'
        + ds.slice(-30).map((d) => { c += byD.get(d) || 0; return '<tr><td>' + esc(d) + '</td><td>' + WD[dow(d)] + '</td><td class="n">' + fmt(byD.get(d)) + '</td><td class="n">' + fmt(c) + '</td><td class="n">' + fmt(base - c) + '</td></tr>'; }).join('')
        + '</tbody></table></div>' + (ds.length > 30 ? '<div class="mute" style="font-size:11.5px;margin-top:6px">마지막 30일만 보여 줍니다</div>' : '') + '</div>'));
    }
    // 브랜드 · 시즌 · 복종그룹별
    const rows = A.sort((a, b) => (a.b < b.b ? -1 : a.b > b.b ? 1 : a.se < b.se ? -1 : a.se > b.se ? 1 : a.g < b.g ? -1 : 1));
    const tb = rows.map((x) => '<tr><td>' + esc(x.b) + '</td><td>' + esc(x.se) + '</td><td>' + esc(x.g) + '</td><td class="n">' + fmt(x.sty.size) + '</td>'
      + '<td class="n">' + fmt(x.base) + '</td><td class="n">' + fmt(x.done) + '</td><td class="n">' + fmt(x.base - x.done) + '</td>'
      + '<td class="n">' + (x.base ? (x.done / x.base * 100).toFixed(1) + '%' : '-') + '</td></tr>').join('');
    body.appendChild(el('<div class="card"><h3>브랜드 · 시즌 · 복종별 정리 현황 <small>품번 ' + fmt(D.inv.length) + '개</small></h3><div class="tw"><table>'
      + '<thead><tr><th>브랜드</th><th>시즌</th><th>복종그룹</th><th class="n">품번수</th><th class="n">정리 대상</th><th class="n">정리 완료</th><th class="n">남은 수량</th><th class="n">진행률</th></tr></thead>'
      + '<tbody>' + tb + '</tbody><tfoot><tr class="tot"><td colspan="4">합계</td><td class="n">' + fmt(base) + '</td><td class="n">' + fmt(done) + '</td><td class="n">' + fmt(base - done) + '</td><td class="n">' + (base ? (done / base * 100).toFixed(1) + '%' : '-') + '</td></tr></tfoot></table></div></div>'));
    // 실적만 있고 기준에 없는 것
    const okK = new Set(D.inv.map((x) => x.b + '|' + x.se + '|' + x.g));
    const miss = new Map(); let missQ = 0;
    C.forEach((r) => { const k = r.b + '|' + r.se + '|' + r.g; if (okK.has(k)) return; missQ += r.q; miss.set(r.b + ' ' + r.se + ' ' + r.g, (miss.get(r.b + ' ' + r.se + ' ' + r.g) || 0) + r.q); });
    if (missQ) body.appendChild(el('<div class="card" style="border-color:#E8B4B4;background:#FFF7F7"><h3 style="color:#B23A3A">기준에 없는 정리 실적 ' + fmt(missQ) + '장 <small>그 브랜드 · 시즌 · 복종의 재고현황을 아직 안 올렸습니다 — 올리면 저절로 붙습니다</small></h3><div class="tw"><table><thead><tr><th>브랜드 · 시즌 · 복종</th><th class="n">정리 수량</th></tr></thead><tbody>'
      + [...miss.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td class="n">' + fmt(v) + '</td></tr>').join('')
      + '</tbody></table></div></div>'));
    const bt = el('<button class="btn">엑셀 받기</button>');
    $('#tools').appendChild(bt);
    bt.onclick = () => {
      const out = rows.map((x) => ({ 브랜드: x.b, 시즌: x.se, 복종그룹: x.g, 품번수: x.sty.size, '정리 대상': x.base, '정리 완료': x.done, '남은 수량': x.base - x.done, 진행률: x.base ? +(x.done / x.base * 100).toFixed(1) : '' }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), '시즌반품정리');
      XLSX.writeFile(wb, '이월팀_시즌반품정리_' + today() + '.xlsx');
    };
  }

  window.IWOL = { boot: () => { load(); render(); }, _D: () => D, _plan: plan, _agg: aggOrd, _srt: aggSrt };
})();
