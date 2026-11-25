/* 공통: 월간 회의 · 전년 대비 물동량 · 전년 대비 신상품 현황 · 원가관리 취합 (손익계산표 + 인원 · 수량 전년 비교) */
(function () {
  'use strict';
  const { esc, fmt, today, addDays } = HS;
  const V = window.HSVolume; const P2 = window.HSParsers2;
  const pad = (n) => String(n).padStart(2, '0');
  const prevYm = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? (y - 1) + '-12' : y + '-' + pad(m - 1); };
  const lastYear = (ym) => (+ym.slice(0, 4) - 1) + ym.slice(4);
  const monthEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return HS.ymd(new Date(y, m, 0)); };
  const defYm = () => prevYm(today().slice(0, 7)); // 회의는 보통 지난달 마감 기준
  const pct = (a, b) => { if (!b) return '<span class="mute">-</span>'; const v = (a / b - 1) * 100; return '<span class="' + (v >= 0 ? 'pos' : 'neg') + '">' + (v >= 0 ? '+' : '') + v.toFixed(1) + '%</span>'; };
  const n0 = (v) => (v == null || v === '' ? '<span class="mute">-</span>' : typeof v === 'number' ? fmt(Math.round(v * 10) / 10) : esc(v));
  // 차이 수량 (부호 · 색) — 두 해 모두 0이면 '-' (2026-11-13)
  const dqty = (v, any) => (!any ? '<span class="mute">-</span>' : !v ? '<span class="mute">0</span>' : '<span class="' + (v > 0 ? 'pos' : 'neg') + '">' + (v > 0 ? '+' : '') + fmt(Math.round(v)) + '</span>');
  const OWN = ['크리스', 'LX', '로라', '슈퍼웍스'];
  const TEAM = { 입고팀: '입고반품팀', 정상팀: '정상1팀', 이월팀: '이월소터팀', 온라인팀: '온라인팀' };
  const monthPicker = (ym, onPick) => { const w = HS.el('<span class="datenav"><button title="이전 달">◀</button><input type="month" class="in" style="width:140px"><button title="다음 달">▶</button></span>'); const i = w.children[1]; i.value = ym; w.children[0].onclick = () => onPick(prevYm(ym)); w.children[2].onclick = () => { const [y, m] = ym.split('-').map(Number); onPick(m === 12 ? (y + 1) + '-01' : y + '-' + pad(m + 1)); }; i.onchange = () => i.value && onPick(i.value); return w; };

  // ---------- 자료 모으기 ----------
  // 서버(PostgREST)는 한 번에 1,000줄까지만 주므로 해마다 나눠 부른다 — 2년치를 한 번에 부르면 뒷부분이 잘림 (2026-11-13)
  async function volMonths(y1, y2) {
    const parts = []; for (let yy = y1; yy <= y2; yy++) parts.push(HS.db.rpc('erp_volume_month', { p_from: yy + '-01-01', p_to: yy + '-12-31' }));
    const got = await Promise.all(parts);
    const M = {}; got.forEach((r) => (r || []).forEach((x) => { const a = M[x.ym] || (M[x.ym] = {}); const o = a[x.owner] || (a[x.owner] = {}); o[x.proc] = (o[x.proc] || 0) + (+x.qty || 0); }));
    return M;
  }
  async function wlMonths(d1, d2) { const r = await HS.db.rpc('erp_worklog_month', { p_from: d1, p_to: d2 }); const W = {}; (r || []).forEach((x) => { (W[x.ym] || (W[x.ym] = {}))[x.team] = { qty: +x.qty || 0, to: +x.to_count || 0, days: +x.days || 0 }; }); return W; }
  async function npNow() { // 신상품: 최근 시즌 요약 + 전년 같은 시즌 (같은 시점 기록이 있으면 그것)
    const snaps = await HS.db.list('erp_np_snap', { order: ['snap_date', false], limit: 400 }).catch(() => []);
    if (!snaps.length) return null;
    // 지금 시즌(오늘 기준) 이하 중 가장 최근 시즌 · 그 시즌의 마지막 기록 (지난 시즌 파일을 오늘 올려도 바뀌지 않음)
    const now = HS.seasonKey(HS.curSeason()); const ss = HS.seasonSort([...new Set(snaps.map((x) => x.season))]); const cs = ss.find((x) => HS.seasonKey(x) <= now) || ss[0];
    const cur = snaps.find((x) => x.season === cs); const ps = (+cur.season.slice(0, 4) - 1) + cur.season.slice(4); const target = (+cur.snap_date.slice(0, 4) - 1) + cur.snap_date.slice(4);
    const prevs = snaps.filter((s) => s.season === ps); const prev = prevs.filter((s) => s.snap_date <= target)[0] || prevs[prevs.length - 1] || null;
    return { season: cur.season, at: cur.snap_date, cur: cur.data, prevSeason: ps, prevAt: prev && prev.snap_date, prev: prev && prev.data };
  }
  const sLabel = (s) => (s ? s.slice(0, 4) + ' ' + (s.slice(4) === 'SS' ? 'S/S' : 'F/W') : '');
  // ---------- 내년 예상 물동량 (2026-11-12) ----------
  // ① 올해 아직 안 지난 달은 [전년 같은 달 × (올해 누적 ÷ 전년 같은 기간 누적)] 으로 채워 1년치를 맞춤
  // ② 내년 예상 = 그 1년치 × (올해 ÷ 전년) — 전년 대비 증감률을 한 번 더 적용
  // ③ 입고 공정만 예외: 내년 신상품 기획 수량이 올라온 시즌(S/S · F/W)은 그 수량을 쓰고,
  //    아직 안 올라온 시즌은 전년 증감률로 메움 (2026-11-12 · 2027 F/W 는 5월 등록 예정이라)
  const fcSum = (a) => a.reduce((x, v) => x + (+v || 0), 0);
  // 신상품 기획 수량: 내년 · 올해를 시즌별로 (season 은 '2027SS' · '2027FW' 꼴)
  function fcPlan(np, y) {
    const s = (ss) => (np || []).filter((r) => String(r.season || '') === ss).reduce((a, r) => a + (+r.plan_qty || 0), 0);
    const ny = y + 1;
    return { ss: s(ny + 'SS'), fw: s(ny + 'FW'), ss0: s(y + 'SS'), fw0: s(y + 'FW') };
  }
  // 입고 줄의 내년 목표치: 올라온 시즌은 기획 수량 · 안 올라온 시즌은 [올해 입고 × 그 시즌 비중 × 전년 증감률]
  //  · 시즌 비중은 올해(y) 기획 수량 S/S : F/W 비율로 나눔 — 그 자료가 없으면 기획 기준을 쓰지 않음
  function fcInTarget(P, curSum, gr) {
    if (!P.ss && !P.fw) return null;
    if (P.ss && P.fw) return { qty: P.ss + P.fw, ssPart: P.ss, fwPart: P.fw, rss: null, full: true }; // 두 시즌이 다 올라오면 비율이 필요 없음
    const base0 = P.ss0 + P.fw0; if (!base0) return null;
    const rss = P.ss0 / base0;
    const ssPart = P.ss || Math.round(curSum * rss * gr);
    const fwPart = P.fw || Math.round(curSum * (1 - rss) * gr);
    return { qty: ssPart + fwPart, ssPart, fwPart, rss, full: !!(P.ss && P.fw) };
  }
  // 월별 12칸 두 줄(전년 · 올해 — 안 지난 달은 null)로 내년 12칸을 만듦
  function fcLine(prev, cur, lastM, planQty) {
    const pd = fcSum(prev.slice(0, lastM)), cd = fcSum(cur.slice(0, lastM)); const r = pd ? cd / pd : 1;
    const curF = cur.map((v, i) => (v == null ? Math.round(prev[i] * r) : v));
    const pSum = fcSum(prev), cSum = fcSum(curF); const gr = pSum ? cSum / pSum : 1;
    let nxt = curF.map((v) => Math.round(v * gr)); let base = '전년 증감률';
    if (planQty) {
      const t = cSum || 1; nxt = curF.map((v) => Math.round((v / t) * planQty)); base = '기획 수량';
      // 달마다 반올림하면 합계가 기획 수량과 몇 장 어긋나므로, 그 차이는 가장 큰 달에 몰아 합계를 맞춤
      const d = planQty - fcSum(nxt); if (d) { let mi = 0; nxt.forEach((v, i) => { if (v > nxt[mi]) mi = i; }); nxt[mi] += d; }
    }
    return { prev, curF, nxt, prevSum: pSum, curSum: cSum, nxtSum: fcSum(nxt), gr, base };
  }
  function fcCalc(M, y, own, P) {
    const q = (yy, m, p) => V.sum(M[yy + '-' + pad(m)], own, p ? [p] : null);
    let lastM = 0; for (let m = 1; m <= 12; m++) if (q(y, m, null)) lastM = m;
    let inT = null;
    const rows = V.PROCS.map((p) => {
      const prev = [], cur = [];
      for (let m = 1; m <= 12; m++) { prev.push(q(y - 1, m, p[0])); cur.push(m <= lastM ? q(y, m, p[0]) : null); }
      let L = fcLine(prev, cur, lastM, 0);
      if (p[0] === '입고' && P) {
        const t = fcInTarget(P, L.curSum, L.gr);
        if (t && t.qty) { inT = t; L = fcLine(prev, cur, lastM, t.qty); L.base = t.full ? '기획 수량' : '기획 수량 + 전년 증감률'; }
      }
      return Object.assign({ p: p[0] }, L);
    }).filter((r) => r.prevSum || r.curSum);
    return { lastM, rows, sum: fcSum, inT };
  }
  // 그 달 작업일 수 — 토 · 일과 공휴일 · 명절을 뺌 (공휴일 목록은 app.js HS.HOLIDAYS 하나만 씀 · 2026-11-23)
  const fcHol = () => new Set(HS.HOLIDAYS || []);
  const fcWd = (yy, m, hol) => {
    let n = 0; const d = new Date(yy, m - 1, 1);
    while (d.getMonth() === m - 1) {
      const w = d.getDay();
      const ds = yy + '-' + pad(m) + '-' + pad(d.getDate());
      if (w !== 0 && w !== 6 && !(hol && hol.has(ds))) n++;
      d.setDate(d.getDate() + 1);
    }
    return n;
  };
  // 그 해에 공휴일 목록이 있는지 (없으면 토 · 일만 뺐다고 알려 줌)
  const fcHolN = (yy, hol) => [...(hol || [])].filter((d) => String(d).slice(0, 4) === String(yy) && ![0, 6].includes(new Date(d + 'T00:00:00').getDay())).length;
  // 월별 입고 현황: 올린 WMS '입고반품 현황' 원자료를 달 × 브랜드로 모음 (입고구분 "반품"은 빼기)
  function npMonthly(rawList) {
    const raw = (rawList || [])[0]; const rows = (raw && raw.rows) || []; if (!rows.length) return null;
    const cols = (P2.NP_RAW_COLS.inbound || []).map((c) => c[0]);
    const bi = cols.indexOf('브랜드'), di = cols.indexOf('일자'), ki = cols.indexOf('입고구분'), qi = cols.indexOf('입고수량');
    if (di < 0 || qi < 0) return null;
    const M = {}, B = {}, K = {};
    for (const r of rows) {
      const d = String(r[di] || ''); if (!/^\d{4}-\d{2}/.test(d)) continue;
      const ym = d.slice(0, 7);
      const bRaw = bi >= 0 ? r[bi] : ''; const key = (HS.brandOf ? HS.brandOf(bRaw) || bRaw : bRaw) || '기타';
      const b = (HS.bname ? HS.bname(key) : key) || '기타'; K[b] = key;
      const q = (+r[qi] || 0) * (ki >= 0 && /반품/.test(String(r[ki] || '')) ? -1 : 1);
      const a = M[ym] || (M[ym] = {}); a[b] = (a[b] || 0) + q; B[b] = (B[b] || 0) + Math.abs(q);
    }
    // 브랜드 차례 = 기준정보 › 브랜드 순번 — 화면에는 영문 표기를 쓰지만 차례는 기준정보 이름으로 따진다 (2026-11-23)
    const brands = HS.bsort(Object.keys(B), (b) => K[b] || b);
    return brands.length ? { M, brands, file: (raw && raw.file) || '' } : null;
  }

  // ---------- 표 도우미 ----------
  function volTable(M, y, upto, owners) {
    const mo = []; for (let m = 1; m <= upto; m++) mo.push(pad(m));
    let h = '<table><tr><th>구분</th><th>년</th>' + mo.map((m) => '<th class="n">' + +m + '월</th>').join('') + '<th class="n">' + (upto === 12 ? '합계' : '1~' + upto + '월') + '</th></tr>';
    for (const [lbl, ps] of [['합계', null], ['B2B', V.B2B], ['B2C', V.B2C]]) { // 합계 묶음을 맨 위로
      const a = mo.map((m) => V.sum(M[(y - 1) + '-' + m], owners, ps)), b = mo.map((m) => V.sum(M[y + '-' + m], owners, ps));
      const sa = a.reduce((x, v) => x + v, 0), sb = b.reduce((x, v) => x + v, 0);
      const cls = lbl === '합계' ? ' class="tot"' : '';
      h += '<tr' + cls + '><td rowspan="4"><b>' + lbl + '</b></td><td>' + (y - 1) + '년</td>' + a.map((v) => '<td class="n">' + n0(v) + '</td>').join('') + '<td class="n">' + n0(sa) + '</td></tr>';
      h += '<tr' + cls + '><td>' + y + '년</td>' + b.map((v) => '<td class="n"><b>' + n0(v) + '</b></td>').join('') + '<td class="n"><b>' + n0(sb) + '</b></td></tr>';
      h += '<tr' + cls + '><td>증감률</td>' + a.map((v, i) => '<td class="n">' + (b[i] || v ? pct(b[i], v) : '<span class="mute">-</span>') + '</td>').join('') + '<td class="n">' + pct(sb, sa) + '</td></tr>';
      // 2026-11-13: 차이 수량 줄 (올해 - 전년) · 증감률 아래
      h += '<tr' + cls + '><td>차이 수량</td>' + a.map((v, i) => '<td class="n">' + dqty(b[i] - v, b[i] || v) + '</td>').join('') + '<td class="n">' + dqty(sb - sa, sb || sa) + '</td></tr>';
    }
    return h + '</table>';
  }
  function procTable(M, ym, owners) {
    const ly = lastYear(ym); const ps = V.PROCS.filter((p) => V.sum(M[ym], owners, [p[0]]) || V.sum(M[ly], owners, [p[0]]));
    const mx = Math.max(1, ...ps.map((p) => V.sum(M[ym], owners, [p[0]])));
    return '<table><tr><th>구분</th><th>공정</th><th class="n">' + esc(ly.replace('-', '년 ')) + '월</th><th class="n">' + esc(ym.replace('-', '년 ')) + '월</th><th class="n">증감</th><th class="n">차이 수량</th><th style="width:24%"></th></tr>' +
      ps.map((p) => { const a = V.sum(M[ly], owners, [p[0]]), b = V.sum(M[ym], owners, [p[0]]); return '<tr><td>' + p[2] + '</td><td>' + esc(p[1]) + '</td><td class="n">' + n0(a) + '</td><td class="n"><b>' + n0(b) + '</b></td><td class="n">' + pct(b, a) + '</td><td class="n">' + dqty(b - a, b || a) + '</td><td><div class="hbar"><i style="width:' + Math.max(0.5, (b / mx) * 100) + '%"></i></div></td></tr>'; }).join('') + '</table>';
  }
  function bars(M, y, owners) {
    const vals = []; for (let m = 1; m <= 12; m++) vals.push([V.sum(M[(y - 1) + '-' + pad(m)], owners, null), V.sum(M[y + '-' + pad(m)], owners, null)]);
    const mx = Math.max(1, ...vals.flat()); const W = 900, H = 200, g = (W - 50) / 12, bw = Math.min(22, g / 2 - 4);
    let s = '<svg viewBox="0 0 ' + W + ' ' + (H + 30) + '" width="100%" role="img" aria-label="월별 물동량">';
    for (let k = 0; k <= 4; k++) { const yy = 10 + (H - 20) * (1 - k / 4); s += '<line x1="44" x2="' + W + '" y1="' + yy + '" y2="' + yy + '" stroke="#EEF0F4"/><text x="40" y="' + (yy + 4) + '" font-size="10" fill="#6B7486" text-anchor="end">' + Math.round((mx * k) / 4 / 10000) + '만</text>'; }
    vals.forEach(([a, b], i) => { const x = 50 + i * g; [[a, '#C8CEDA'], [b, '#0F1E3D']].forEach(([v, c], j) => { const bh = ((H - 20) * v) / mx; if (v) s += '<rect x="' + (x + j * (bw + 3)) + '" y="' + (10 + H - 20 - bh) + '" width="' + bw + '" height="' + bh + '" rx="3" fill="' + c + '"><title>' + (y - 1 + j) + '년 ' + (i + 1) + '월 ' + fmt(v) + '</title></rect>'; }); s += '<text x="' + (x + bw) + '" y="' + (H + 6) + '" font-size="11" fill="#6B7486" text-anchor="middle">' + (i + 1) + '월</text>'; });
    return s + '<rect x="' + (W - 160) + '" y="0" width="10" height="10" fill="#C8CEDA"/><text x="' + (W - 146) + '" y="9" font-size="11">' + (y - 1) + '년</text><rect x="' + (W - 90) + '" y="0" width="10" height="10" fill="#0F1E3D"/><text x="' + (W - 76) + '" y="9" font-size="11">' + y + '년</text></svg>';
  }
  const kv = (rows) => '<table><tr><th>항목</th><th class="n">이번 달</th><th class="n">전년 같은 달</th><th class="n">증감</th><th>이동 (하위 메뉴)</th></tr>' + rows.map((r) => '<tr' + (r[4] ? ' class="click" data-href="' + esc(r[4]) + '"' : '') + '><td>' + esc(r[0]) + '</td><td class="n"><b>' + (typeof r[1] === 'string' ? r[1] : n0(r[1])) + '</b></td><td class="n">' + (typeof r[2] === 'string' ? r[2] : n0(r[2])) + '</td><td class="n">' + (typeof r[1] === 'number' && typeof r[2] === 'number' ? pct(r[1], r[2]) : '<span class="mute">-</span>') + '</td><td class="mute">' + (r[4] ? '<a href="' + esc(r[4]) + '">' + esc(r[3]) + ' →</a>' : esc(r[3] || '')) + '</td></tr>').join('') + '</table>';

  // ================= 월간 회의 =================
  const SECTS = [
    // 2026-11-10: 신상품 섹션은 입고팀 ① 과 같은 내용이라 뺌 · 원가 관리 · 인력 운영은 맨 마지막으로 (팀별 섹션에는 인원 · 원가를 넣지 않음)
    ['fc', '00. 내년 예상 물동량', '전사'], // 2026-11-12: 제목은 그릴 때 실제 연도로 바뀜 (예: 2027년 예상 물동량)
    ['vol', '01. 물동량 (월마감)', '전사'],
    ['입고팀', '02. 입고팀', '팀별'], ['정상팀', '03. 정상팀', '팀별'], ['이월팀', '04. 이월팀', '팀별'], ['지원팀', '05. 지원팀', '팀별'], ['온라인팀', '06. 온라인팀', '팀별'], ['관리팀', '07. 관리팀', '팀별'], ['안성센터', '08. 안성센터', '팀별'],
    ['연차', '09. 연차 사용 계획', '기타'],
    ['cost', '10. 원가 관리 · 인력 운영', '원가 관리'],
  ];
  // 섹션 제목 · 항목을 누르면 가는 팀 화면 (같은 달)
  const SEC_GO = (k, ym) => ({ vol: '#/volume?m=' + ym, np: '#/newprod', cost: '#/costsum?v=pl&y=' + ym.slice(0, 4), 입고팀: '#/worklog?t=입고반품팀', 정상팀: '#/worklog?t=정상1팀', 이월팀: '#/worklog?t=이월소터팀', 지원팀: '#/daily', 온라인팀: '#/worklog?t=온라인팀', 관리팀: '#/notice', 안성센터: '#/anseong' })[k];
  HS.view('meeting', {
    title: '월간 회의', perm: 'meeting',
    async render(body, p, tools) {
      const ym = /^\d{4}-\d{2}$/.test(p.m || '') ? p.m : defYm(); const y = +ym.slice(0, 4), mm = +ym.slice(5); const ly = lastYear(ym);
      const m1 = ym + '-01', m2 = monthEnd(ym), l1 = ly + '-01', l2 = monthEnd(ly);
      tools.appendChild(monthPicker(ym, (x) => HS.go('meeting', { m: x })));
      // 보일 때 읽기 (2026-11-18 · 사이트 점검 ③): 스스로 자료를 따로 받는 무거운 칸(반품 대장 · 손익계산표)은
      //  화면 가까이 내려왔을 때 받음 — 처음 열 때 DB 호출이 줄어듦. 모양은 그대로.
      //  PDF · 인쇄는 아직 안 받은 칸을 전부 받은 뒤 인쇄
      const LZ = [];
      const lazy = (el, fn) => {
        const job = { done: false, p: null, run() { if (!this.done) { this.done = true; this.p = Promise.resolve().then(fn); } return this.p; } };
        LZ.push(job);
        if (!('IntersectionObserver' in window)) { job.run(); return; }
        const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); job.run(); } }, { rootMargin: '600px 0px' });
        io.observe(el);
      };
      const pr = HS.el('<button class="btn">PDF · 인쇄</button>'); pr.onclick = async () => { if (LZ.some((j) => !j.done)) { HS.toast('남은 자료를 불러온 뒤 인쇄합니다'); await Promise.all(LZ.map((j) => j.run())); await new Promise((r) => setTimeout(r, 300)); } window.print(); }; tools.appendChild(pr);
      const own = p.o && OWN.indexOf(p.o) >= 0 ? [p.o] : null;
      const safe = (pr2) => pr2.catch((e) => { console.warn(e); return null; });
      const [M, W, notes, np, done, doneL, pend, settle, daily, notices, asd, npRaw,
        db2b, rcl, cnts, heads, ords, ups, npPlan] = await Promise.all([
        safe(volMonths(y - 1, y)), safe(wlMonths(ly + '-01', monthEnd(ym))), HS.db.list('erp_meet_note', { eq: { ym } }), safe(npNow()),
        safe(HS.db.list('erp_ret_done', { gte: { rec_date: m1 }, lte: { rec_date: m2 } })), safe(HS.db.list('erp_ret_done', { gte: { rec_date: l1 }, lte: { rec_date: l2 } })), safe(HS.db.list('erp_ret_pend', {})),
        safe(HS.db.list('erp_settlement', { gte: { in_date: m1 }, lte: { in_date: m2 }, select: 'in_date,client_name,pcs,box_total,status' })),
        safe(HS.db.list('erp_daily_records', { gte: { rec_date: m1 }, lte: { rec_date: m2 }, select: 'rec_date' })),
        safe(HS.db.list('erp_notice', { select: 'id,created_at' })),
        safe(HS.can('anseong', 'view') ? HS.db.list('erp_as_daily', { gte: { date: l1 }, lte: { date: m2 } }) : Promise.resolve([])),
        safe(HS.can('newprod', 'view') ? HS.db.list('erp_np_raw', { eq: { kind: 'inbound' } }) : Promise.resolve([])),
        // ----- 팀별 섹션 (2026-11-12) -----
        safe(HS.can('daily', 'view') ? HS.db.list('erp_daily_records', { eq: { section: 'b2b' }, gte: { rec_date: (y - 1) + '-01-01' }, lte: { rec_date: m2 }, select: 'rec_date,rec_key,data' }) : Promise.resolve([])),
        safe(HS.can('returns', 'view') && window.HSRClean ? HS.db.list('erp_records', { in: { kind: window.HSRClean.SHEETS.map((s) => s.k) }, gte: { rec_date: m1 }, lte: { rec_date: m2 } }) : Promise.resolve([])),
        safe(HS.can('count', 'view') ? HS.db.list('erp_cnt', { order: ['start_date', false], limit: 24, select: 'id,name,start_date,end_date,status,summary,deleted_at' }) : Promise.resolve([])),
        safe(HS.db.list('erp_headcount', { gte: { work_date: m1 }, lte: { work_date: m2 } })),
        safe(HS.can('orders', 'view') ? HS.db.list('erp_orders', { gte: { rec_date: m1 }, lte: { rec_date: m2 }, select: 'rec_date' }) : Promise.resolve([])),
        safe(HS.db.list('erp_uploads', { order: ['at', false], limit: 30, select: 'file_name,kinds,rows,at' })),
        // 내년 예상 물동량 — 신상품 기획 수량 (시즌 = 2027SS · 2027FW 처럼 연도로 시작) (2026-11-12)
        // 올해 시즌(S/S : F/W 비율) + 내년 시즌(기획 수량) 두 해만 읽음 — 전체를 읽으면 품번 수천 줄이라 느려짐
        safe(HS.can('newprod', 'view') ? HS.db.list('erp_np_style', { gte: { season: String(y) }, lte: { season: (y + 1) + 'z' }, select: 'season,plan_qty' }) : Promise.resolve([])),
      ]);
      // 월말 재고 (전산자료 WMS · ERP 재고 — 그 달 마지막 등록) · 전년 같은 달
      // 2026-11-12: 재고 한 종류마다 이번 달 · 전년을 따로 읽던 것(8회)을 한 번에 읽어 나눠 씀(4회) — 화면 뜨는 속도
      const STK = {}; await Promise.all((HS.STOCK_ALL || []).map(async ([kd, sb]) => {
        const rows = await HS.db.list('erp_cs_daily', { eq: { kind: kd, sub: sb }, lte: { d: m2 }, order: ['d', false], limit: 800 }).catch(() => []);
        const at = (ds) => { const r0 = rows.filter((r) => r.d <= ds); if (!r0.length) return null; const last = r0[0].d; const L = r0.filter((r) => r.d === last); return { d: last, qty: L.reduce((a, r) => a + (+r.qty || 0), 0), sku: L.reduce((a, r) => a + (+r.sku || 0), 0) }; };
        const b = at(l2); STK[kd + '|' + sb] = [at(m2), b && b.d >= l1 ? b : null];
      })).catch(() => {});
      const stk = (kd, sb) => { const v = STK[kd + '|' + sb] || []; return [v[0] ? v[0].qty : '-', v[1] ? v[1].qty : '-']; };
      const stkRow = (team) => { const m = HS.TEAM_STOCK && HS.TEAM_STOCK[team]; if (!m) return []; const v = STK[m[0] + '|' + m[1]] || []; return [['월말 ' + m[2] + ' · PCS' + (v[0] ? ' · ' + v[0].d.slice(5).replace('-', '/') + ' 기준' : ''), ...stk(m[0], m[1]), (m[0] === 'wms' ? 'WMS' : 'ERP') + ' 재고 조회', '#/cs?k=' + m[0] + '&t=조회']]; };
      const Mv = M || {}; const Wv = W || {}; const NOTE = Object.fromEntries((notes || []).map((n) => [n.sect, n]));
      const vs = (ps) => [V.sum(Mv[ym], own, ps), V.sum(Mv[ly], own, ps)];
      const wl = (team, k) => [((Wv[ym] || {})[team] || {})[k] || 0, ((Wv[ly] || {})[team] || {})[k] || 0];
      const per = (team) => { const [q, q2] = wl(team, 'qty'); const [t, t2] = wl(team, 'to'); return [t ? q / t : 0, t2 ? q2 / t2 : 0]; };
      const rate = (a, b) => (b ? Math.round((a / b) * 1000) / 10 + '%' : '-');
      const dS = (l) => (l || []).reduce((a, r) => a + (+r.slips || 0), 0), dP = (l) => (l || []).reduce((a, r) => a + (+r.pcs || 0), 0);
      const pendS = (pend || []).reduce((a, x) => a + (x.rows || []).filter((r) => r.open).length, 0);
      // ================= 입고팀 섹션 — 하위 입고팀 자료를 항목별로 모아 보여 주고, 제목을 누르면 그 화면으로 바로 감 =================
      const dash = '<span class="mute">-</span>';
      const MON = npMonthly(npRaw); let monSel = null; // 월별 입고 현황 · 고른 브랜드 (null = 전체)
      const msub = (no, title, small, go, goLabel, inner, tag) => '<div class="msub"><a class="sh" href="' + esc(go) + '"><span class="num">' + no + '</span><b>' + esc(title) + '</b>' + (small ? '<small>' + esc(small) + '</small>' : '') + (tag ? '<span class="nbadge">' + esc(tag) + '</span>' : '') + '<span class="arr">' + esc(goLabel) + ' →</span></a><div class="sb">' + inner + '</div></div>';
      // 1) 신상품 입고 현황 — 기획량 · 입고 S/T · 입고 수량(PCS) 을 전년과 나란히
      const npGrid = () => {
        if (!np || !np.cur) return '<div class="empty">신상품 자료가 없습니다 · <a href="#/newprod">신상품 입고 · 출고 · 정리</a>에서 업데이트</div>';
        const S = np.cur, P = np.prev, by = S.by || {};
        const bs = HS.bsort(Object.keys(by)); // 브랜드 차례 = 기준정보 › 브랜드 순번
        const cells = (c, q) => {
          const g = (k) => (c[k] == null ? dash : fmt(c[k])), gp = (k) => (!q || q[k] == null ? dash : fmt(q[k])), gd = (k) => (!q || !q[k] || c[k] == null ? dash : pct(c[k], q[k]));
          return '<td class="n sep"><b>' + g('st') + '</b></td><td class="n mute">' + gp('st') + '</td><td class="n">' + gd('st') + '</td>' +
            '<td class="n sep"><b>' + g('in') + '</b></td><td class="n mute">' + gp('in') + '</td><td class="n">' + gd('in') + '</td>' +
            '<td class="n sep"><b>' + g('in_qty') + '</b></td><td class="n mute">' + gp('in_qty') + '</td><td class="n">' + gd('in_qty') + '</td>' +
            '<td class="n sep"><b>' + rate(c.in, c.st) + '</b></td><td class="n">' + g('notin') + '</td><td class="n sep"><b>' + rate(c.out, c.in) + '</b></td><td class="n">' + g('unclean') + '</td>';
        };
        return '<div class="tw"><table class="mgrp no-no"><tr class="gh"><th rowspan="2" class="l">브랜드</th><th class="g1 sep" colspan="3">기획량 (S/T)</th><th class="sep" colspan="3">입고 (S/T)</th><th class="g2 sep" colspan="3">입고 수량 (PCS)</th><th class="sep" colspan="2">입고율 · 미입고</th><th class="sep" colspan="2">출고 · 정리</th></tr><tr>' +
          ['올해', '전년', '증감', '올해', '전년', '증감', '올해', '전년', '증감', '입고율', '미입고', '출고율', '미정리'].map((l, i) => '<th class="n' + ([0, 3, 6, 9, 11].indexOf(i) >= 0 ? ' sep' : '') + '">' + l + '</th>').join('') + '</tr>' +
          bs.map((b) => '<tr class="click" data-href="#/newprod?b=' + encodeURIComponent(b) + '"><td>' + esc(HS.bname ? HS.bname(b) : b) + '</td>' + cells(by[b], (P && P.by && P.by[b]) || null) + '</tr>').join('') +
          '<tr class="tot"><td>합계</td>' + cells(S.tot, P && P.tot) + '</tr></table></div><div class="mute" style="font-size:11px;margin-top:5px">브랜드 줄을 누르면 그 브랜드 신상품 목록으로 바로 갑니다</div>';
      };
      // 2) 월별 입고 현황 — WMS 입고반품 현황 원자료 · 브랜드 여러 개 고르기
      const monBody = () => {
        const inSel = (b) => !monSel || monSel.indexOf(b) >= 0;
        const mq = (x) => { const a = MON.M[x] || {}; return Object.keys(a).reduce((s, b) => s + (inSel(b) ? a[b] : 0), 0); };
        const cur = [], prv = []; for (let i = 1; i <= mm; i++) { cur.push(mq(y + '-' + pad(i))); prv.push(mq((y - 1) + '-' + pad(i))); }
        const mx = Math.max(1, ...cur, ...prv); const W2 = 900, H2 = 160, g2 = (W2 - 8) / Math.max(1, mm), bw2 = Math.max(4, Math.min(18, g2 / 2 - 4));
        let sv = '<svg viewBox="0 0 ' + W2 + ' ' + (H2 + 24) + '" width="100%" role="img" aria-label="월별 입고 수량">';
        for (let i = 0; i < mm; i++) { const x0 = 4 + i * g2 + (g2 - bw2 * 2 - 3) / 2;
          [[prv[i], '#C8CEDA'], [cur[i], '#0F1E3D']].forEach((p2, j) => { const h2 = Math.max(0, ((H2 - 14) * p2[0]) / mx); if (p2[0] > 0) sv += '<rect x="' + (x0 + j * (bw2 + 3)) + '" y="' + (8 + H2 - 14 - h2) + '" width="' + bw2 + '" height="' + h2 + '" rx="3" fill="' + p2[1] + '"><title>' + (y - 1 + j) + '년 ' + (i + 1) + '월 ' + fmt(p2[0]) + ' PCS</title></rect>'; });
          sv += '<text x="' + (x0 + bw2) + '" y="' + (H2 + 6) + '" font-size="11" fill="#6B7486" text-anchor="middle">' + (i + 1) + '월</text>'; }
        sv += '</svg>';
        const pm1 = prevYm(ym), pm2 = prevYm(pm1), ly2 = lastYear(ym); const bq = (b, x) => (MON.M[x] || {})[b] || 0;
        const bs = MON.brands.filter(inSel);
        const line = (lbl, a0, a1, a2, a3, tot) => '<tr' + (tot ? ' class="tot"' : '') + '><td>' + esc(lbl) + '</td><td class="n">' + n0(a0) + '</td><td class="n">' + n0(a1) + '</td><td class="n"><b>' + n0(a2) + '</b></td><td class="n">' + (a1 ? pct(a2, a1) : dash) + '</td><td class="n mute">' + (a3 ? fmt(a3) : '-') + '</td><td class="n">' + (a3 ? pct(a2, a3) : dash) + '</td></tr>';
        const mLbl = (x) => +x.slice(5) + '월';
        return sv + '<div class="tw" style="margin-top:8px"><table class="no-no"><tr><th>브랜드</th><th class="n">' + mLbl(pm2) + '</th><th class="n">' + mLbl(pm1) + '</th><th class="n">' + mLbl(ym) + ' (이번 달)</th><th class="n">전월 대비</th><th class="n">전년 같은 달</th><th class="n">증감</th></tr>' +
          bs.map((b) => line(b, bq(b, pm2), bq(b, pm1), bq(b, ym), bq(b, ly2))).join('') +
          line('합계 (' + bs.length + '개 브랜드)', mq(pm2), mq(pm1), mq(ym), mq(ly2), true) + '</table></div>';
      };
      const monHtml = () => (!MON ? '<div class="empty">월별 입고 자료가 없습니다 · <a href="#/newprod?tab=up">신상품 › 자료 업데이트</a>에서 WMS 입고반품 현황을 올리면 나옵니다</div>'
        : '<div class="mcond"><span class="mute">조건</span><button class="btn sm p" id="mbrand">브랜드 <b>전체</b> ▾</button><span class="mute">입고구분 "반품"은 빼고 더한 수량 (PCS)</span><span class="sp"></span><span class="lgd2"><i class="a"></i>' + (y - 1) + '년<i class="b"></i>' + y + '년</span></div><div id="npmonb"></div>');
      // 4) 입고 대행 — 고객사별
      const settleTable = () => { const l = settle || []; if (!l.length) return '<div class="empty">' + esc(ym) + ' 입고 대행 정산 자료가 없습니다</div>';
        const by = {}; l.forEach((r) => { const k = r.client_name || '(이름 없음)'; const o = by[k] || (by[k] = { n: 0, pcs: 0, box: 0, st: {} }); o.n++; o.pcs += +r.pcs || 0; o.box += +r.box_total || 0; const s = r.status || '대기'; o.st[s] = (o.st[s] || 0) + 1; });
        const ks = Object.keys(by).sort((a, b) => by[b].pcs - by[a].pcs); const T = ks.reduce((a, k) => ({ n: a.n + by[k].n, pcs: a.pcs + by[k].pcs, box: a.box + by[k].box }), { n: 0, pcs: 0, box: 0 });
        return '<div class="tw"><table class="no-no"><tr><th>고객사</th><th class="n">건수</th><th class="n">PCS</th><th class="n">확정 BOX</th><th>정산 상태</th></tr>' +
          ks.map((k) => '<tr class="click" data-href="#/settlement"><td>' + esc(k) + '</td><td class="n">' + fmt(by[k].n) + '</td><td class="n"><b>' + fmt(by[k].pcs) + '</b></td><td class="n">' + fmt(by[k].box) + '</td><td class="mute">' + esc(Object.keys(by[k].st).map((s) => s + ' ' + by[k].st[s]).join(' · ')) + '</td></tr>').join('') +
          '<tr class="tot"><td>합계</td><td class="n">' + fmt(T.n) + '</td><td class="n">' + fmt(T.pcs) + '</td><td class="n">' + fmt(T.box) + '</td><td></td></tr></table></div>'; };
      function inboundSect() {
        const S = np && np.cur && np.cur.tot, P = np && np.prev && np.prev.tot;
        const kpi = (l, v, s, cls) => '<div class="kc' + (cls ? ' ' + cls : '') + '"><div class="l">' + esc(l) + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
        const vsIn = vs(['입고', '입고반품']);
        let h = '<div class="kpis6">' +
          kpi('B2B 입고 물동량', n0(vsIn[0]), '전년 ' + n0(vsIn[1]) + ' · ' + pct(vsIn[0], vsIn[1])) +
          kpi('신상품 기획량 (S/T)', S ? n0(S.st) : dash, S && P ? '전년 ' + n0(P.st) + ' · ' + pct(S.st, P.st) : (np ? sLabel(np.season) : '자료 없음'), 'hl') +
          kpi('신상품 입고 수량 (PCS)', S && S.in_qty != null ? n0(S.in_qty) : dash, S && P && P.in_qty ? '전년 ' + n0(P.in_qty) + ' · ' + pct(S.in_qty, P.in_qty) : '전년 기록 없음', 'hl2') +
          kpi('신상품 입고율', S ? rate(S.in, S.st) : dash, P ? '전년 ' + rate(P.in, P.st) : '전년 기록 없음') +
          kpi('미입고 (S/T)', S ? n0(S.notin) : dash, P ? '전년 ' + n0(P.notin) + ' · ' + pct(S.notin, P.notin) : '전년 기록 없음') +
          kpi('반품 처리 완료 (전표)', n0(dS(done)), doneL && doneL.length ? '전년 ' + n0(dS(doneL)) + ' · ' + pct(dS(done), dS(doneL)) : '전년 기록 없음') +
          kpi('반품 미발송 (매장)', '<span class="' + (pendS ? 'neg' : '') + '">' + n0(pendS) + '</span>', '의뢰 후 안 보낸 전표 · 지금') +
          kpi('입고 대행', (settle || []).length ? fmt((settle || []).length) + '건' : dash, (settle || []).length ? fmt((settle || []).reduce((a, r) => a + (+r.pcs || 0), 0)) + ' PCS' : '자료 없음') + '</div>';
        h += msub(1, '신상품 입고 현황', (np ? sLabel(np.season) + ' · ' + np.at + ' 기준' : ''), '#/newprod', '신상품 입고 · 출고 · 정리', npGrid());
        h += msub(2, '월별 입고 현황', 'WMS 입고반품 현황 기준', '#/newprod?tab=up', '신상품 자료 업데이트', '<div id="npmon">' + monHtml() + '</div>');
        h += msub(3, '반품 진행 현황', ym + ' · 일별 반품 관리 대장 (반품 현황 화면과 같은 표)', '#/returns', '반품 현황', '<div id="retdash"><div class="empty">불러오는 중…</div></div>');
        h += msub(4, '입고 대행', ym + ' 정산 기준', '#/settlement', '입고 대행 정산', settleTable());
        return h;
      }
      // ================= 팀별 섹션 — 입고팀과 같은 모양 (요약 4칸 + 번호 묶음) · 2026-11-12 승인 시안 =================
      const y0 = y - 1; const OUTP2 = ['출고', '쿠팡출고'];
      const kc = (l, v, s, c2) => '<div class="kc' + (c2 ? ' ' + c2 : '') + '"><div class="l">' + esc(l) + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
      const kbox = (a) => '<div class="kpis6">' + a.join('') + '</div>';
      const twrap = (h) => '<div class="tw"><table class="no-no">' + h + '</table></div>';
      const rel = (a, b) => (b ? (a / b - 1) * 100 : null);
      const rtag = (v) => (v == null ? dash : '<span class="' + (v >= 0 ? 'pos' : 'neg') + '">' + (v >= 0 ? '▲ ' : '▼ ') + Math.abs(v).toFixed(1) + '%</span>');
      const dtag = (v) => (v == null ? dash : '<span class="' + (v > 0 ? 'pos' : v < 0 ? 'neg' : 'mute') + '">' + (v > 0 ? '+' : '') + fmt(v) + '</span>');
      const hbar = (v) => '<div class="hbar"><i style="width:' + Math.max(0, Math.min(100, v || 0)) + '%"></i></div>';
      const rpc = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : dash);
      // 월말 재고 요약칸 — 누르면 WMS · ERP 재고 조회로 (예전 표 줄에서 요약칸으로 옮김 · 2026-11-12)
      const stkKpi = (team, label) => { const r = stkRow(team)[0]; return kc(label, r ? n0(r[1]) : dash, r ? '전년 ' + n0(r[2]) + ' · <a href="' + esc(r[4]) + '">' + esc(r[3]) + ' →</a>' : '재고 자료 없음'); };
      const empty = (t) => '<div class="empty">' + t + '</div>';
      const dd2 = (s) => new Date(s + 'T00:00:00');
      const iso2 = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      const monOf = (s) => { const d = dd2(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso2(d); };
      // 그 달에 속한 주 (그 주 금요일이 그 달 — 기존 엑셀과 같은 규칙)
      function weeksOf(ymx) {
        const out = []; const seen = {}; const end = monthEnd(ymx);
        for (let x = addDays(ymx + '-01', -7); x <= addDays(end, 7); x = addDays(x, 1)) {
          const mo = monOf(x); if (seen[mo]) continue; seen[mo] = 1;
          const fri = addDays(mo, 4); if (fri.slice(0, 7) !== ymx) continue;
          out.push({ mon: mo, sun: addDays(mo, 6), w: P2.weekTh(fri) });
        }
        return out.sort((a, b) => (a.mon < b.mon ? -1 : 1));
      }
      // ---------- 03. 정상팀 ----------
      const dayOut = {}; (db2b || []).forEach((r) => (dayOut[r.rec_date] = (dayOut[r.rec_date] || 0) + (+((r.data || {}).out_qty) || 0)));
      const sumD = (a, b) => Object.keys(dayOut).reduce((s, k) => (k >= a && k <= b ? s + dayOut[k] : s), 0);
      const volYtd = (yy) => { let s = 0; for (let i = 1; i <= mm; i++) s += V.sum(Mv[yy + '-' + pad(i)], own, OUTP2); return s; };
      function normalSect() {
        const cm = sumD(m1, m2), pmD = sumD(l1, l2), volL = V.sum(Mv[ly], own, OUTP2);
        const pm = pmD || volL; const pIsDaily = !!pmD;
        const cc = sumD(y + '-01-01', m2), pcD = sumD(y0 + '-01-01', l2); const pc = pcD || volYtd(y0);
        const S = np && np.cur, P = np && np.prev;
        const wks = weeksOf(ym); const pw = {}; weeksOf(ly).forEach((w) => (pw[w.w] = w));
        // ① 출고 현황
        let t1 = '<tr><th>구분</th><th class="n">' + y + '</th><th class="n">' + y0 + '</th><th class="n">증감</th><th>증감률</th></tr>' +
          '<tr><td><b>' + mm + '월</b></td><td class="n"><b>' + n0(cm) + '</b></td><td class="n">' + n0(pm) + '</td><td class="n">' + (cm && pm ? dtag(cm - pm) : dash) + '</td><td>' + (cm && pm ? rtag(rel(cm, pm)) : dash) + '</td></tr>' +
          '<tr class="tot"><td>1~' + mm + '월 누계</td><td class="n">' + n0(cc) + '</td><td class="n">' + n0(pc) + '</td><td class="n">' + (cc && pc ? dtag(cc - pc) : dash) + '</td><td>' + (cc && pc ? rtag(rel(cc, pc)) : dash) + '</td></tr>' +
          wks.map((w) => { const c = sumD(w.mon, w.sun); const o = pw[w.w]; const q = o ? sumD(o.mon, o.sun) : 0;
            if (!c && !q) return ''; // 자료가 아예 없는 주는 빼고
            return '<tr><td>' + esc(w.w) + ' <span class="mute">' + w.mon.slice(5).replace('-', '/') + '~' + w.sun.slice(5).replace('-', '/') + '</span></td><td class="n">' + n0(c) + '</td><td class="n">' + n0(q) + '</td><td class="n">' + (c && q ? dtag(c - q) : dash) + '</td><td>' + (c && q ? rtag(rel(c, q)) : dash) + '</td></tr>'; }).join('');
        let h = kbox([
          kc('B2B 출고 물동량', n0(V.sum(Mv[ym], own, OUTP2)), '전년 ' + n0(volL) + ' · ' + pct(V.sum(Mv[ym], own, OUTP2), volL)),
          kc('마감 보고 출고 (' + mm + '월)', n0(cm), pIsDaily ? '전년 ' + n0(pm) + ' · ' + pct(cm, pm) : '전년은 물동량 기준', 'hl'),
          kc('신상품 출고율', S && S.tot ? rate(S.tot.out, S.tot.in) : dash, P && P.tot ? '전년 ' + rate(P.tot.out, P.tot.in) : (np ? sLabel(np.season) : '자료 없음'), 'hl2'),
          stkKpi('정상1팀', '월말 정상창고 재고'),
        ]);
        h += msub(1, '출고 현황', y + ' ↔ ' + y0 + ' · 월 · 누계 · 주단위' + (pIsDaily ? '' : ' (전년은 물동량 기준 · 주단위 전년은 비어 있음)'), '#/shipout?y=' + y, '출고 현황',
          (cm || pm ? twrap(t1) : empty('출고 자료가 없습니다 · <a href="#/daily">일일 마감 보고</a>에서 올리면 나옵니다')));
        // ② 신상품 출고 · 정리
        const by = (S && S.by) || {}; const bs = HS.bsort(Object.keys(by));
        const npc = (c) => '<td class="n">' + n0(c.st) + '</td><td class="n">' + n0(c.in) + '</td><td class="n"><b>' + n0(c.out) + '</b></td><td>' + rate(c.out, c.in) + '</td><td class="n ' + ((c.in || 0) - (c.out || 0) ? 'neg' : '') + '">' + n0((c.in || 0) - (c.out || 0)) + '</td><td class="n ' + (c.unclean ? 'neg' : '') + '">' + n0(c.unclean) + '</td>';
        h += msub(2, '신상품 출고 · 정리 현황', np ? sLabel(np.season) + ' · ' + np.at + ' 기준' : '', '#/npout', '신상품 현황',
          (bs.length ? twrap('<tr><th>브랜드</th><th class="n">기획 S/T</th><th class="n">입고 S/T</th><th class="n">출고 S/T</th><th>출고율</th><th class="n">입고 후 미출고</th><th class="n">출고 후 미정리</th></tr>' +
            bs.map((b) => '<tr class="click" data-href="#/npout?b=' + encodeURIComponent(b) + '"><td>' + esc(HS.bname ? HS.bname(b) : b) + '</td>' + npc(by[b]) + '</tr>').join('') +
            '<tr class="tot"><td>합계</td>' + npc(S.tot || {}) + '</tr>') : empty('신상품 자료가 없습니다 · <a href="#/newprod">신상품 입고 · 출고 · 정리</a>에서 업데이트')));
        // ③ 반품 정리 현황
        const RCL = window.HSRClean; const rl = rcl || [];
        let t3 = '';
        if (RCL && rl.length) {
          const byK = {}; rl.forEach((r) => { const o = byK[r.kind] || (byK[r.kind] = { n: 0, q: 0, b: 0, s: {} }); o.n++; o.q += +r.qty || 0; o.b += RCL.boxOf(r); o.s[r.state] = (o.s[r.state] || 0) + 1; });
          const line = (lbl, o, tot) => '<tr' + (tot ? ' class="tot"' : ' class="click" data-href="#/rclean"') + '><td>' + esc(lbl) + '</td><td class="n">' + n0(o.n) + '</td><td class="n"><b>' + n0(o.q) + '</b></td><td class="n">' + n0(o.b) + '</td><td class="n pos">' + n0(o.s['정리완료'] || 0) + '</td><td class="n">' + n0(o.s['정리중'] || 0) + '</td><td class="n ' + (o.s['인계대기'] ? 'neg' : '') + '">' + n0(o.s['인계대기'] || 0) + '</td></tr>';
          const T = { n: 0, q: 0, b: 0, s: {} }; Object.keys(byK).forEach((k) => { T.n += byK[k].n; T.q += byK[k].q; T.b += byK[k].b; ['정리완료', '정리중', '인계대기'].forEach((s) => (T.s[s] = (T.s[s] || 0) + (byK[k].s[s] || 0))); });
          t3 = twrap('<tr><th>대장</th><th class="n">건수</th><th class="n">수량</th><th class="n">박스</th><th class="n">정리 완료</th><th class="n">정리 중</th><th class="n">인계 대기</th></tr>' +
            RCL.SHEETS.filter((s) => byK[s.k]).map((s) => line(s.short, byK[s.k])).join('') + line('합계', T, true));
        }
        h += msub(3, '반품 정리 현황', ym + ' · 매장 폐점 수시반품 대장 기준', '#/rclean', '반품 정리 현황',
          (t3 || empty(ym + ' 반품 정리 대장 자료가 없습니다 · <a href="#/rclean">반품 정리 현황</a>에서 올리면 나옵니다')));
        // ④ 재고 실사
        const withS = (cnts || []).filter((c) => !c.deleted_at && c.summary && c.summary.brands && c.summary.brands.length);
        const cn = withS.find((c) => (c.start_date || '').slice(0, 7) === ym) || withS[0] || null;
        let t4 = '';
        if (cn) {
          const br = cn.summary.brands.slice().sort((a, b) => (b.sys || 0) - (a.sys || 0));
          const T = br.reduce((a, b) => ({ sys: a.sys + (+b.sys || 0), act: a.act + (+b.act || 0) }), { sys: 0, act: 0 });
          t4 = twrap('<tr><th>브랜드</th><th class="n">기준 재고</th><th class="n">실사</th><th class="n">차이</th><th>정확도</th></tr>' +
            br.map((b) => '<tr class="click" data-href="#/count?id=' + encodeURIComponent(cn.id) + '"><td>' + esc(HS.bname ? HS.bname(b.k) || b.k : b.k) + '</td><td class="n">' + n0(b.sys) + '</td><td class="n"><b>' + n0(b.act) + '</b></td><td class="n">' + dtag((+b.act || 0) - (+b.sys || 0)) + '</td><td>' + (b.qrate == null ? dash : (+b.qrate).toFixed(2) + '%') + '</td></tr>').join('') +
            '<tr class="tot"><td>합계</td><td class="n">' + n0(T.sys) + '</td><td class="n">' + n0(T.act) + '</td><td class="n">' + dtag(T.act - T.sys) + '</td><td>' + (T.sys ? ((1 - Math.abs(T.act - T.sys) / T.sys) * 100).toFixed(2) + '%' : dash) + '</td></tr>');
        }
        h += msub(4, '재고 실사', cn ? esc(cn.name) + ' · ' + esc(cn.status) : '', '#/count', '재고 실사',
          (t4 || empty('실사 자료가 없습니다 · <a href="#/count">재고 실사</a>에서 등록하면 나옵니다')));
        return h;
      }
      // ---------- 04. 이월팀 ----------
      //  2026-11-23: 시즌 정리 계획 · 선지시 출고 계획 묶음 폐기 — 다른 프로그램으로 옮김
      function carrySect() {
        const rm = vs(['반품']); let ca = 0, cb = 0; for (let i = 1; i <= mm; i++) { ca += V.sum(Mv[y + '-' + pad(i)], own, ['반품']); cb += V.sum(Mv[y0 + '-' + pad(i)], own, ['반품']); }
        let h = kbox([
          kc('B2B 반품 물동량', n0(rm[0]), '전년 ' + n0(rm[1]) + ' · ' + pct(rm[0], rm[1])),
          kc('1~' + mm + '월 반품 누계', n0(ca), '전년 ' + n0(cb) + ' · ' + pct(ca, cb), 'hl'),
          stkKpi('이월소터팀', '월말 반품창고 재고'),
        ]);
        h += msub(1, '반품 물동량', y + ' ↔ ' + y0 + ' · 월마감 정산 기준', '#/volume?m=' + ym, '물동량',
          twrap('<tr><th>구분</th><th class="n">' + y + '</th><th class="n">' + y0 + '</th><th class="n">증감</th><th>증감률</th></tr>' +
            '<tr><td><b>' + mm + '월 반품</b></td><td class="n"><b>' + n0(rm[0]) + '</b></td><td class="n">' + n0(rm[1]) + '</td><td class="n">' + (rm[0] && rm[1] ? dtag(rm[0] - rm[1]) : dash) + '</td><td>' + (rm[0] && rm[1] ? rtag(rel(rm[0], rm[1])) : dash) + '</td></tr>' +
            '<tr class="tot"><td>1~' + mm + '월 누계</td><td class="n">' + n0(ca) + '</td><td class="n">' + n0(cb) + '</td><td class="n">' + (ca && cb ? dtag(ca - cb) : dash) + '</td><td>' + (ca && cb ? rtag(rel(ca, cb)) : dash) + '</td></tr>'));
        return h;
      }
      // ---------- 06. 온라인팀 ----------
      function onlineSect() {
        const o1 = vs(['B2C고객출고']), o2 = vs(['B2C고객반품']), i1 = vs(['B2B→B2C']), i2 = vs(['B2C→B2B']), r1 = vs(['RT반출']), r2 = vs(['RT반입']);
        const rr = (a, b) => (a ? ((b / a) * 100).toFixed(1) + '%' : '-');
        let h = kbox([
          kc('B2C 고객 출고', n0(o1[0]), '전년 ' + n0(o1[1]) + ' · ' + pct(o1[0], o1[1])),
          kc('B2C 고객 반품', n0(o2[0]), '반품률 ' + rr(o1[0], o2[0]) + ' · 전년 ' + rr(o1[1], o2[1]), 'hl'),
          kc('B2B→B2C 이관', n0(i1[0]), '전년 ' + n0(i1[1]) + ' · ' + pct(i1[0], i1[1]), 'hl2'),
          stkKpi('온라인팀', '월말 온라인 재고'),
        ]);
        const ln = (lbl, a) => '<tr><td>' + esc(lbl) + '</td><td class="n"><b>' + n0(a[0]) + '</b></td><td class="n">' + n0(a[1]) + '</td><td class="n">' + (a[0] && a[1] ? dtag(a[0] - a[1]) : dash) + '</td><td>' + (a[0] && a[1] ? rtag(rel(a[0], a[1])) : dash) + '</td></tr>';
        h += msub(1, 'B2C 출고 · 반품', ym + ' · 전년 같은 달', '#/volume?m=' + ym, '물동량',
          twrap('<tr><th>구분</th><th class="n">' + y + '</th><th class="n">' + y0 + '</th><th class="n">증감</th><th>증감률</th></tr>' +
            ln('고객 출고', o1) + ln('고객 반품', o2) +
            '<tr class="tot"><td>반품률</td><td class="n"><b>' + rr(o1[0], o2[0]) + '</b></td><td class="n">' + rr(o1[1], o2[1]) + '</td><td class="n mute" colspan="2">출고 수량 대비</td></tr>'));
        h += msub(2, '이관 (온라인 입고 · 반품)', 'B2B ↔ B2C · RT', '#/volume?m=' + ym, '물동량',
          twrap('<tr><th>구분</th><th class="n">' + y + '</th><th class="n">' + y0 + '</th><th class="n">증감</th><th>증감률</th></tr>' +
            ln('B2B→B2C (온라인 입고)', i1) + ln('B2C→B2B (온라인 반품)', i2) + ln('RT 반출', r1) + ln('RT 반입', r2)));
        return h;
      }
      // ---------- 05. 지원팀 (매출이 없는 팀 — 인원 배정과 제때 작성했는지를 봄) ----------
      function supportSect() {
        // 영업일 (월~금)
        const bd = []; for (let x = m1; x <= m2; x = addDays(x, 1)) { const w = dd2(x).getDay(); if (w !== 0 && w !== 6) bd.push(x); }
        const dset = new Set((daily || []).map((d) => d.rec_date));
        const oset = new Set((ords || []).map((d) => d.rec_date));
        const miss = (st) => bd.filter((x) => !st.has(x));
        const mdl = (a) => (a.length ? a.slice(0, 6).map((x) => x.slice(5).replace('-', '/')).join(' · ') + (a.length > 6 ? ' …' : '') : dash);
        // 팀별 인원 배정 (그 달 합계 · 배정 인원은 마지막 기록)
        const hs = heads || []; const tnames = HS.cache.teams.map((t) => t.name);
        const H = {}; hs.forEach((r) => { const o = H[r.team] || (H[r.team] = { f: 0, o: 0, al: null, alD: '', bad: [] }); o.f += +r.field_count || 0; o.o += +r.office_count || 0; if (r.alloc_count != null && r.work_date >= o.alD) { o.al = +r.alloc_count; o.alD = r.work_date; } if (r.field_count != null && r.office_count != null && +r.field_count !== +r.office_count) o.bad.push(r.work_date); });
        const POOL = ['지원팀', '관리팀'];
        const poolSum = POOL.reduce((a, t) => a + ((H[t] || {}).f || 0), 0);
        const allocSum = tnames.reduce((a, t) => a + ((H[t] || {}).al || 0), 0);
        const badDays = [...new Set(tnames.flatMap((t) => (H[t] || {}).bad || []))].sort();
        let h = kbox([
          kc('일일 마감 보고 작성', fmt(dset.size) + ' / ' + fmt(bd.length) + '일', miss(dset).length ? '<span class="neg">미작성 ' + miss(dset).length + '일</span> · ' + mdl(miss(dset)) : '빠진 날 없음'),
          kc('아침 출고지시 취합', fmt(oset.size) + ' / ' + fmt(bd.length) + '일', miss(oset).length ? '<span class="neg">미작성 ' + miss(oset).length + '일</span> · ' + mdl(miss(oset)) : '빠진 날 없음', 'hl'),
          kc('배정 인원 (최근)', allocSum ? fmt(allocSum, 1) + '명' : dash, POOL.map((t) => t + ' ' + fmt((H[t] || {}).f || 0, 1)).join(' · ') + ' (연인원)', 'hl2'),
          kc('현장 ↔ 사무실 불일치', badDays.length ? '<span class="neg">' + badDays.length + '일</span>' : '0일', badDays.length ? mdl(badDays) : '모두 맞음'),
        ]);
        h += msub(1, '팀별 인원 배정', ym + ' · 현장확인(팀 작성) ↔ 사무실확인(지원팀 작성) ↔ 배정 인원', '#/headcount', '팀별 인원 배정',
          (hs.length ? twrap('<tr><th>팀</th><th class="n">현장확인 (팀 작성)</th><th class="n">사무실확인 (지원팀)</th><th class="n">배정 인원</th><th>확인</th></tr>' +
            tnames.filter((t) => H[t]).map((t) => { const o = H[t]; return '<tr class="click" data-href="#/headcount"><td>' + esc(t) + '</td><td class="n"><b>' + n0(o.f) + '</b></td><td class="n">' + n0(o.o) + '</td><td class="n">' + (o.al == null ? dash : fmt(o.al, 1)) + '</td><td>' + (o.bad.length ? '<span class="tag r">' + o.bad.length + '일 다름</span>' : '<span class="tag g">일치</span>') + '</td></tr>'; }).join('') +
            '<tr class="tot"><td>합계 <span class="mute">연인원</span></td><td class="n">' + n0(tnames.reduce((a, t) => a + ((H[t] || {}).f || 0), 0)) + '</td><td class="n">' + n0(tnames.reduce((a, t) => a + ((H[t] || {}).o || 0), 0)) + '</td><td class="n">' + (allocSum ? fmt(allocSum, 1) : dash) + '</td><td class="mute">' + (poolSum ? '나눠 쓸 인원 ' + fmt(poolSum, 1) + '명 (연인원)' : '') + '</td></tr>')
            : empty(ym + ' 인원 자료가 없습니다 · <a href="#/headcount">팀별 인원 배정</a>에서 적으면 나옵니다')));
        h += msub(2, '일일 마감 보고 작성 현황', ym + ' · 영업일(월~금) ' + bd.length + '일 기준', '#/daily', '일일 마감 보고',
          twrap('<tr><th>구분</th><th class="n">영업일</th><th class="n">작성</th><th class="n">미작성</th><th>미작성 날짜</th></tr>' +
            [['일일 마감 보고', dset], ['아침 출고지시 취합', oset]].map((x) => '<tr><td>' + x[0] + '</td><td class="n">' + bd.length + '</td><td class="n pos">' + x[1].size + '</td><td class="n ' + (miss(x[1]).length ? 'neg' : 'mute') + '">' + (miss(x[1]).length || '-') + '</td><td class="mute">' + mdl(miss(x[1])) + '</td></tr>').join('')));
        // ③ 자료 등록 현황
        const lastKey = (o) => Object.keys(o || {}).sort().pop() || null;
        const okTag = (v, want) => (v == null ? '<span class="tag r">자료 없음</span>' : v >= want ? '<span class="tag g">' + esc(want) + ' 까지 ✔</span>' : '<span class="tag y">' + esc(v) + ' 까지</span>');
        const rlLast = (rcl || []).map((r) => r.rec_date).filter(Boolean).sort().pop() || null;
        const up0 = (ups || [])[0];
        const rows3 = [
          ['물동량 (크리스 · LX · 로라 · 슈퍼웍스)', lastKey(Mv), okTag(lastKey(Mv), ym), '#/volume?m=' + ym],
          ['원가관리 업무일지', lastKey(Wv), okTag(lastKey(Wv), ym), '#/costsum?v=pl&y=' + y],
          ['일일 마감 보고', [...dset].sort().pop() || null, okTag(([...dset].sort().pop() || '').slice(0, 7) || null, ym), '#/daily'],
          ['반품 정리 대장', rlLast, okTag(rlLast ? rlLast.slice(0, 7) : null, ym), '#/rclean'],
          ['신상품 (입고 · 출고 · 정리)', np ? np.at : null, np ? '<span class="tag g">' + esc(sLabel(np.season)) + ' · ' + esc(np.at) + '</span>' : '<span class="tag r">자료 없음</span>', '#/newprod'],
        ];
        h += msub(3, '자료 등록 현황', '어느 자료가 어디까지 들어왔는지', '#/upload', '엑셀 · 물동량 업로드',
          twrap('<tr><th>자료</th><th>마지막 자료</th><th>이번 달</th></tr>' +
            rows3.map((r) => '<tr class="click" data-href="' + esc(r[3]) + '"><td>' + esc(r[0]) + '</td><td>' + (r[1] ? esc(r[1]) : dash) + '</td><td>' + r[2] + '</td></tr>').join('')) +
          (up0 ? '<div class="mute" style="font-size:11.5px;margin-top:8px">최근 엑셀 일괄 등록 · ' + esc(String(up0.at).slice(0, 16).replace('T', ' ')) + ' · ' + esc(up0.file_name || '') + ' · ' + fmt(up0.rows || 0) + '줄</div>' : ''));
        return h;
      }
      // ---------- 00. 내년 예상 물동량 — 화주 · 브랜드 · 연간 / 월간 / 일일 고르기 (2026-11-12) ----------
      const fcNy = y + 1;
      const fcS = { own: '', brand: '', v: 'y', dm: 1 };
      const fcBrands = [...new Set((db2b || []).map((r) => r.rec_key).filter(Boolean))].sort();
      // 일일(날짜별) 표에 쓸 올해 그 달 물동량 — 고를 때만 읽어 옴 (2026-11-12)
      let fcDay = null;
      async function fcLoadDay(m) {
        const k = y + '-' + pad(m); if (fcDay && fcDay.ym === k) return fcDay;
        const k0 = (y - 1) + '-' + pad(m); // 전년 같은 달 — 25년 대비 차이 줄에 씀
        const sel = 'rec_date,owner,proc,qty';
        const [a, b2] = await Promise.all([
          HS.db.list('erp_volume', { gte: { rec_date: k + '-01' }, lte: { rec_date: monthEnd(k) }, select: sel }).catch(() => []),
          HS.db.list('erp_volume', { gte: { rec_date: k0 + '-01' }, lte: { rec_date: monthEnd(k0) }, select: sel }).catch(() => []),
        ]);
        fcDay = { ym: k, rows: a || [], prev: b2 || [] }; return fcDay;
      }
      // 월간 — 1~12월 가로 · 일일과 같은 줄 구조 (예상 / 올해 대비 차이 / 실적 / 전년 대비 차이 / 증감률) (2026-11-13)
      function fcMonTbl(rows, ny) {
        const n2 = (v) => (v == null ? '<span class="mute">-</span>' : fmt(Math.round(v)));
        const d2 = (v) => (v == null ? '<span class="mute">-</span>' : v === 0 ? '<span class="mute">0</span>' : '<span class="' + (v > 0 ? 'pos' : 'neg') + '">' + (v > 0 ? '+' : '') + fmt(Math.round(v)) + '</span>');
        const hh = '<tr><th style="text-align:left">공정</th><th style="text-align:left">년</th><th class="n" style="background:#F2F6FF">합계</th>' +
          Array.from({ length: 12 }, (_, i) => '<th class="n">' + (i + 1) + '월</th>').join('') + '</tr>';
        const line = (lab, yr, a, cls, strong) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + esc(lab) + '</td><td class="mute">' + esc(yr) + '</td>' +
          '<td class="n" style="background:#F2F6FF">' + (strong ? '<b>' + fmt(Math.round(fcSum(a))) + '</b>' : fmt(Math.round(fcSum(a)))) + '</td>' +
          a.map((v) => '<td class="n">' + n2(v) + '</td>').join('') + '</tr>';
        const diff = (yr, a, b3) => { const d = a.map((v, i) => v - b3[i]); return '<tr><td></td><td class="mute">' + esc(yr) + '</td>' +
          '<td class="n" style="background:#F2F6FF">' + d2(fcSum(d)) + '</td>' + d.map((v) => '<td class="n">' + d2(v) + '</td>').join('') + '</tr>'; };
        const rate = (lab, a, b3) => '<tr><td>' + esc(lab) + '</td><td class="mute">증감률</td>' +
          '<td class="n" style="background:#F2F6FF">' + (fcSum(b3) ? pct(fcSum(a), fcSum(b3)) : '<span class="mute">-</span>') + '</td>' +
          a.map((v, i) => '<td class="n">' + (b3[i] ? pct(v, b3[i]) : '<span class="mute">-</span>') + '</td>').join('') + '</tr>';
        const add = (arrs) => arrs.reduce((a, x) => a.map((v, i) => v + (+x[i] || 0)), Array(12).fill(0));
        let body = '';
        ['B2B', 'B2C'].forEach((g) => {
          const gr = rows.filter((r) => (V.GROUP[r.p] || 'B2B') === g); if (!gr.length) return;
          const N = add(gr.map((r) => r.nxt)), C = add(gr.map((r) => r.curF)), P0 = add(gr.map((r) => r.prev));
          body += line(g + ' 합계', ny + '년 예상', N, 'tot', true) + diff(y + '년 대비 차이', N, C) +
            line(g + ' 합계', y + '년 실적', C, 'tot') + diff((y - 1) + '년 대비 차이', C, P0) + rate(g + ' 합계', N, C);
          gr.forEach((r) => { const lb = V.LABEL[r.p] || r.p;
            body += line(lb, ny + '년 예상', r.nxt) + diff(y + '년 대비 차이', r.nxt, r.curF) +
              line(lb, y + '년 실적', r.curF) + diff((y - 1) + '년 대비 차이', r.curF, r.prev); });
        });
        return '<div class="tw"><table class="no-no" style="white-space:nowrap;font-size:11.5px">' + hh + body + '</table></div>';
      }
      // 일일 — 날짜 가로 · 주차 소계 · 월 합계 (2026-11-12 승인 시안)
      //  · 내년 예상은 [그 달 예상 ÷ 그 달 작업일 수] 라 평일마다 같은 값 · 토 · 일 · 공휴일은 '-' (주차 소계에도 안 들어감)
      //  · 올해 실적은 날짜별 실제 수량 (화주 = erp_volume · 브랜드 = 일일 마감 보고)
      function fcDayTbl(rows, ny, m) {
        const HOL = fcHol(); const wd = fcWd(ny, m, HOL); const DW = ['일', '월', '화', '수', '목', '금', '토'];
        const dim = new Date(ny, m, 0).getDate(); const dimY = new Date(y, m, 0).getDate();
        const days = []; for (let d = 1; d <= dim; d++) { const w = new Date(ny, m - 1, d).getDay(); const ds = ny + '-' + pad(m) + '-' + pad(d); days.push({ d, w, hol: HOL.has(ds), off: w === 0 || w === 6 || HOL.has(ds) }); }
        // 올해 같은 달 날짜별 실적 — 공정 → 일(1~31) → 수량
        const cur = {}; const pre = {}; // pre = 전년 같은 달 (25년 대비 차이 줄)
        const put = (box, proc, ds, q) => { const o = box[proc] || (box[proc] = {}); const d = +String(ds).slice(8, 10); o[d] = (o[d] || 0) + q; };
        if (fcS.brand) {
          (db2b || []).forEach((r) => { const ds = String(r.rec_date || ''); if (r.rec_key !== fcS.brand) return; const q = +((r.data || {}).out_qty) || 0;
            if (ds.slice(0, 7) === y + '-' + pad(m)) put(cur, '출고', ds, q); else if (ds.slice(0, 7) === (y - 1) + '-' + pad(m)) put(pre, '출고', ds, q); });
        } else {
          ((fcDay || {}).rows || []).forEach((r) => { if (fcS.own && r.owner !== fcS.own) return; put(cur, r.proc, r.rec_date, +r.qty || 0); });
          ((fcDay || {}).prev || []).forEach((r) => { if (fcS.own && r.owner !== fcS.own) return; put(pre, r.proc, r.rec_date, +r.qty || 0); });
        }
        // 주 묶음 (월~일 · 말일에서 끊음)
        const weeks = []; let w0 = [];
        days.forEach((x, i) => { w0.push(x); if (x.w === 0 || i === days.length - 1) { weeks.push(w0); w0 = []; } });
        const nxtOf = (r) => { const t = r.nxt[m - 1] || 0; return wd ? Math.round(t / wd) : 0; };
        const curOf = (r, d) => (d > dimY ? null : ((cur[r.p] || {})[d] || 0));
        const preOf = (r, d) => (d > new Date(y - 1, m, 0).getDate() ? null : ((pre[r.p] || {})[d] || 0));
        const n2 = (v) => (v == null ? '<span class="mute">-</span>' : fmt(Math.round(v)));
        const d2 = (v) => (v == null ? '<span class="mute">-</span>' : v === 0 ? '<span class="mute">0</span>' : '<span class="' + (v > 0 ? 'pos' : 'neg') + '">' + (v > 0 ? '+' : '') + fmt(Math.round(v)) + '</span>');
        // 머리글
        let hh = '<tr><th style="text-align:left">공정</th><th style="text-align:left">년</th><th class="n" style="background:#F2F6FF">월 합계</th>';
        weeks.forEach((wk, wi) => { wk.forEach((x) => { hh += '<th class="n"' + (x.off ? ' style="color:#9AA3B4"' : '') + '>' + m + '/' + x.d + ' ' + DW[x.w] + (x.hol ? '<br><span style="font-size:10px;font-weight:400">휴일</span>' : '') + '</th>'; }); hh += '<th class="n" style="background:#F5F6F8">' + (wi + 1) + '주차</th>'; });
        hh += '</tr>';
        // 한 줄: kind = 'n'(내년 예상) · 'c'(올해 실적) · 'r'(증감률)
        // plan = true: 내년 예상 줄 — 쉬는 날은 '-' 이고 소계에도 안 들어감
        //        false: 올해 실적 줄 — 쉬는 날에 작업한 수량이 있으면 그대로 보여 주고 소계에도 넣음
        const line = (lab, yr, get, cls, strong, plan) => {
          let h = '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + esc(lab) + '</td><td class="mute">' + esc(yr) + '</td>';
          let tot = 0; let body = '';
          weeks.forEach((wk) => {
            let ws = 0;
            wk.forEach((x) => {
              const v = plan && x.off ? null : get(x);
              if (v) ws += v;
              body += '<td class="n"' + (x.off ? ' style="color:#9AA3B4"' : '') + '>' + n2(v || null) + '</td>';
            });
            tot += ws; body += '<td class="n" style="background:#F5F6F8">' + fmt(Math.round(ws)) + '</td>';
          });
          h += '<td class="n" style="background:#F2F6FF">' + (strong ? '<b>' + fmt(Math.round(tot)) + '</b>' : fmt(Math.round(tot))) + '</td>' + body + '</tr>';
          return h;
        };
        // 차이 줄 — 쉬는 날은 '-' (주차 소계에도 안 들어감) · 부호와 색을 붙임
        const diffLine = (lab, yr, ga, gb) => {
          let h = '<tr><td>' + esc(lab) + '</td><td class="mute">' + esc(yr) + '</td>'; let tot = 0; let body = '';
          weeks.forEach((wk) => {
            let ws = 0;
            wk.forEach((x) => {
              if (x.off) { body += '<td class="n" style="color:#9AA3B4">-</td>'; return; }
              const a = ga(x), b3 = gb(x);
              if (a == null || b3 == null) { body += '<td class="n"><span class="mute">-</span></td>'; return; }
              const v = a - b3; ws += v; body += '<td class="n">' + d2(v) + '</td>';
            });
            tot += ws; body += '<td class="n" style="background:#F5F6F8">' + d2(ws) + '</td>';
          });
          h += '<td class="n" style="background:#F2F6FF">' + d2(tot) + '</td>' + body + '</tr>';
          return h;
        };
        const rateLine = (lab, gN, gC) => {
          let h = '<tr><td>' + esc(lab) + '</td><td class="mute">증감률</td>'; let tn = 0, tc = 0; let body = '';
          weeks.forEach((wk) => { let sn = 0, sc = 0; wk.forEach((x) => { if (x.off) { body += '<td class="n" style="color:#9AA3B4">-</td>'; return; } const a = gN(x) || 0, b2 = gC(x) || 0; sn += a; sc += b2; body += '<td class="n">' + (b2 ? pct(a, b2) : '<span class="mute">-</span>') + '</td>'; }); tn += sn; tc += sc; body += '<td class="n" style="background:#F5F6F8">' + (sc ? pct(sn, sc) : '<span class="mute">-</span>') + '</td>'; });
          h += '<td class="n" style="background:#F2F6FF">' + (tc ? pct(tn, tc) : '<span class="mute">-</span>') + '</td>' + body + '</tr>';
          return h;
        };
        const grp = (g) => rows.filter((r) => (V.GROUP[r.p] || 'B2B') === g);
        let body = '';
        ['B2B', 'B2C'].forEach((g) => {
          const gr = grp(g); if (!gr.length) return;
          const gN = (x) => (x.off ? 0 : gr.reduce((a, r) => a + nxtOf(r), 0));
          const gC = (x) => gr.reduce((a, r) => a + (curOf(r, x.d) || 0), 0);
          const gP = (x) => gr.reduce((a, r) => a + (preOf(r, x.d) || 0), 0);
          body += line(g + ' 합계', ny + '년 예상', gN, 'tot', true, true) +
            diffLine('', y + '년 대비 차이', gN, gC) +
            line(g + ' 합계', y + '년 실적', gC, 'tot', false, false) +
            diffLine('', (y - 1) + '년 대비 차이', gC, gP) +
            rateLine(g + ' 합계', gN, gC);
          gr.forEach((r) => {
            const lb = V.LABEL[r.p] || r.p;
            body += line(lb, ny + '년 예상', (x) => (x.off ? 0 : nxtOf(r)), '', false, true) +
              diffLine('', y + '년 대비 차이', (x) => (x.off ? 0 : nxtOf(r)), (x) => curOf(r, x.d)) +
              line(lb, y + '년 실적', (x) => curOf(r, x.d), '', false, false) +
              diffLine('', (y - 1) + '년 대비 차이', (x) => curOf(r, x.d), (x) => preOf(r, x.d));
          });
        });
        return '<div style="display:flex;align-items:center;gap:8px;margin:2px 0 8px"><button class="btn sm" id="fcPrev">◀</button><b style="font-size:13.5px">' + ny + '년 ' + m + '월</b><button class="btn sm" id="fcNext">▶</button>' +
          '<span class="mute" style="font-size:11.5px">작업일 ' + wd + '일 · 토 · 일과 공휴일은 뺐습니다</span>' +
          '<span class="mute" style="font-size:11.5px;margin-left:auto">가로로 밀어서 ' + dim + '일까지 ▸</span></div>' +
          '<div class="tw"><table class="no-no" style="white-space:nowrap;font-size:11.5px">' + hh + body + '</table></div>';
      }
      function fcBody() {
        const ny = fcNy; const P = fcPlan(npPlan, y);
        const sel = (id, cur, opts, w) => '<select class="in" id="' + id + '" style="width:' + w + 'px">' + opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>';
        const ctl = '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px">' +
          '<span class="mute" style="font-size:12px">화주</span>' + sel('fcOwn', fcS.own, [['', '전체']].concat(OWN.map((o) => [o, o])), 100) +
          '<span class="mute" style="font-size:12px;margin-left:4px">브랜드</span>' + sel('fcBrand', fcS.brand, [['', '전체']].concat(fcBrands.map((b) => [b, HS.bname(b)])), 130) +
          '<span style="margin-left:8px"></span>' + sel('fcV', fcS.v, [['y', '연간'], ['m', '월간'], ['d', '일일 (하루 평균)']], 130) + '</div>';
        let rows = [], lastM = 0, head = '', warn = '', inT = null;
        if (fcS.brand) {
          // 브랜드별 수량은 물동량 정산 파일에 없어서 일일 마감 보고(B2B 브랜드별 출고)를 씀 — 그래서 출고 한 줄만 나옴
          const mon = (yy) => { const a = []; for (let m = 1; m <= 12; m++) { const k = yy + '-' + pad(m); a.push((db2b || []).filter((r) => r.rec_key === fcS.brand && String(r.rec_date).slice(0, 7) === k).reduce((s, r) => s + (+((r.data || {}).out_qty) || 0), 0)); } return a; };
          const prev = mon(y - 1), cur0 = mon(y);
          for (let m = 1; m <= 12; m++) if (cur0[m - 1]) lastM = m;
          const L = fcLine(prev, cur0.map((v, i) => (i + 1 <= lastM ? v : null)), lastM, 0);
          if (!L.prevSum && !L.curSum) return ctl + '<div class="empty">' + esc(HS.bname(fcS.brand)) + ' 의 마감 보고 출고 자료가 없습니다</div>';
          rows = [Object.assign({ p: '출고', lab: '출고 (장)' }, L)];
          head = esc(HS.bname(fcS.brand)) + ' · 일일 마감 보고 기준';
          warn = '브랜드별 수량은 물동량 정산 파일에 없어 <b>일일 마감 보고의 브랜드별 출고</b>로 계산했습니다. 그래서 출고 한 줄만 나오고, 화주 고르기는 적용되지 않습니다.';
          inT = null;
        } else {
          const F = fcCalc(Mv, y, fcS.own ? [fcS.own] : null, P);
          if (!F.rows.length) return ctl + '<div class="empty">물동량 자료가 없습니다 · <a href="#/volume">물동량</a>에서 정산 파일을 올리세요</div>';
          rows = F.rows.map((r) => Object.assign({ lab: V.LABEL[r.p] || r.p }, r)); lastM = F.lastM; inT = F.inT;
          head = (fcS.own || '전 화주') + ' · 물동량 정산 기준';
          // 기획 수량이 어느 시즌까지 들어왔는지 — 한 시즌만 들어왔으면 나머지는 추정이라고 알림
          if (inT && !inT.full) warn = ny + ' <b>' + (P.ss ? 'S/S' : 'F/W') + ' 기획 수량만 등록</b>돼 있습니다 (' + fmt(P.ss || P.fw) + '장). ' +
            (P.ss ? 'F/W' : 'S/S') + ' 는 아직이라 <b>' + fmt(P.ss ? inT.fwPart : inT.ssPart) + '장으로 추정</b>해 메웠습니다 (' + y + '년 기획 S/S : F/W = ' + Math.round(inT.rss * 100) + ' : ' + (100 - Math.round(inT.rss * 100)) + ' 비율 · 전년 증감률 적용). 나머지 시즌이 올라오면 저절로 바뀝니다.';
          else if (!inT && (P.ss || P.fw)) warn = y + '년 시즌별 기획 수량이 없어 ' + ny + ' 기획 수량을 쓰지 못했습니다 — 입고도 전년 증감률로 잡았습니다.';
        }
        const T = (k) => rows.reduce((a, r) => a + r[k], 0);
        const HF = (k, a, b) => rows.reduce((s, r) => s + fcSum(r[k].slice(a, b)), 0);
        const dq = (v) => (v ? '<span class="' + (v >= 0 ? 'pos' : 'neg') + '">' + (v >= 0 ? '+' : '') + fmt(Math.round(v)) + '</span>' : '<span class="mute">0</span>');
        const tot = [T('prevSum'), T('curSum'), T('nxtSum')];
        const kps = kbox([kc(y + '년 합계 (장)', fmt(tot[1]), lastM < 12 ? lastM + '월까지 실적 + 남은 달 추정' : '12개월 마감'),
          kc(ny + '년 예상 (장)', fmt(tot[2]), inT ? (inT.full ? '입고는 기획 수량 기준' : '입고는 ' + (P.ss ? 'S/S' : 'F/W') + ' 기획 + 나머지 추정') : '전년 증감률 기준'),
          kc(y + '년 대비 차이', (tot[2] - tot[1] >= 0 ? '+' : '') + fmt(tot[2] - tot[1]), '장'),
          kc('증감률', (tot[1] ? ((tot[2] / tot[1] - 1) * 100).toFixed(1) : '-') + '%', y + '년 대비')]);
        let tbl;
        if (fcS.v === 'y') {
          // 2026-11-13: 올해 줄에도 전년 대비 차이 수량 칸을 더함
          const row = (l, a, b, c, base, cls) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + esc(l) + '</td><td class="n">' + n0(a) + '</td><td class="n">' + n0(b) + '</td><td class="n">' + pct(b, a) + '</td><td class="n">' + dq(b - a) + '</td><td class="n"><b>' + n0(c) + '</b></td><td class="n">' + dq(c - b) + '</td><td class="mute" style="font-size:11.5px">' + esc(base || '') + '</td></tr>';
          const h1 = [HF('prev', 0, 6), HF('curF', 0, 6), HF('nxt', 0, 6)], h2 = [HF('prev', 6, 12), HF('curF', 6, 12), HF('nxt', 6, 12)];
          tbl = twrap('<tr><th>공정</th><th class="n">' + (y - 1) + '년</th><th class="n">' + y + '년</th><th class="n">' + '증감</th><th class="n">' + (y - 1) + '년 대비 차이</th><th class="n">' + ny + '년 예상</th><th class="n">' + y + '년 대비 차이</th><th>산출 기준</th></tr>' +
            rows.map((r) => row(r.lab, r.prevSum, r.curSum, r.nxtSum, r.base)).join('') +
            row('연 합계', tot[0], tot[1], tot[2], '', 'tot') +
            row('상반기 (1~6월)', h1[0], h1[1], h1[2], '') + row('하반기 (7~12월)', h2[0], h2[1], h2[2], ''));
        } else if (fcS.v === 'd') {
          tbl = fcDayTbl(rows, ny, fcS.dm);
        } else {
          tbl = fcMonTbl(rows, ny);
        }
        return ctl + (warn ? '<div class="lock" style="margin-bottom:10px;font-size:12px">' + warn + '</div>' : '') + kps + tbl +
          '<div class="memo2" style="margin-top:10px"><div class="mh2"><b>산출 근거</b> <span class="mute" style="font-size:11.5px">' + head + '</span></div><div class="mtext" style="font-size:12.5px;line-height:1.8">' +
          (fcS.brand ? '· 출고: ' + (y - 1) + '년 대비 ' + y + '년 증감률을 ' + ny + '년에 한 번 더 적용했습니다.<br>'
            : '· 입고: ' + (inT
              ? (inT.full
                ? ny + '년 신상품 기획 수량 ' + fmt(inT.qty) + '장을 그대로 썼습니다 (S/S ' + fmt(P.ss) + ' + F/W ' + fmt(P.fw) + ' · ' + y + '년 입고 월별 비중으로 나눔).'
                : ny + ' ' + (P.ss ? 'S/S' : 'F/W') + ' 기획 수량 ' + fmt(P.ss || P.fw) + '장은 그대로 쓰고, 아직 안 올라온 ' + (P.ss ? 'F/W' : 'S/S') + ' 는 ' + fmt(P.ss ? inT.fwPart : inT.ssPart) + '장으로 추정해 더했습니다 (' + y + '년 기획 S/S : F/W = ' + Math.round(inT.rss * 100) + ' : ' + (100 - Math.round(inT.rss * 100)) + ' 비율에 전년 증감률 적용 · 합계 ' + fmt(inT.qty) + '장).')
              : ny + '년 신상품 기획 수량이 아직 올라오지 않아 입고도 전년 증감률로 잡았습니다. [신상품 입고 · 출고 · 정리]에 ' + ny + ' 시즌 신상품 정보 파일을 올리면 이 줄이 기획 수량 기준으로 바뀝니다.') + '<br>' +
              '· 그 밖 공정: ' + (y - 1) + '년 대비 ' + y + '년 증감률을 ' + ny + '년에 한 번 더 적용했습니다.<br>') +
          (lastM < 12 ? '· ' + y + '년은 ' + lastM + '월까지가 실적이고, 남은 ' + (12 - lastM) + '개월은 ' + (y - 1) + '년 같은 달에 올해 증감률을 곱해 채웠습니다. 12월 마감이 올라오면 저절로 바뀝니다.<br>' : '') +
          (fcS.v === 'y' ? '· 상 · 하반기는 월별 예상치를 1~6월 · 7~12월로 더한 것입니다.<br>' : '') +
          (fcS.v === 'd' ? '· 날짜별 예상 = 그 달 예상 ÷ 그 달 작업일 수 (평일마다 같은 값) · ' + y + '년 줄은 날짜별 실제 수량입니다.<br>· 작업일은 토 · 일과 ' + (fcHolN(ny, fcHol()) ? '공휴일 · 명절 ' + fcHolN(ny, fcHol()) + '일을 뺐습니다 (시즌 정리 계획과 같은 휴일 목록 · 대체공휴일은 근무로 봅니다)' : '공휴일을 뺍니다. 다만 ' + ny + '년 공휴일 목록이 없어 이번에는 토 · 일만 뺐습니다') + '.<br>' : '') +
          '· 자료 출처: ' + (fcS.brand ? '일일 마감 보고(브랜드별 B2B 출고)' : '물동량(정산 파일) · 신상품 정보(화주 ERP 품번정보현황)') + '. 단위는 모두 장(PCS)입니다.' +
          '</div></div>';
      }
      let retP = { k: 'dash' }; // 반품 대장 안에서 고른 전표/PCS · 브랜드 (화면을 떠나지 않고 그 자리에서 다시 그림)
      const AFTER = {
        // 예상 물동량 고르기 — 바꾸면 이 카드 안만 다시 그림 (자료는 이미 읽어 둔 것을 씀)
        fc: (card) => {
          const host = card.querySelector('#fcBox'); if (!host) return;
          const paint = async () => {
            // 일일(날짜별)은 그 달 물동량을 그때 읽어 옴
            if (fcS.v === 'd' && !fcS.brand && (!fcDay || fcDay.ym !== y + '-' + pad(fcS.dm))) {
              host.innerHTML = '<div class="empty">' + fcS.dm + '월 자료를 불러오는 중…</div>';
              await fcLoadDay(fcS.dm);
            }
            host.innerHTML = fcBody(); bind();
          };
          const bind = () => {
            const o = host.querySelector('#fcOwn'), b = host.querySelector('#fcBrand'), v = host.querySelector('#fcV');
            if (o) o.onchange = () => { fcS.own = o.value; paint(); };
            if (b) b.onchange = () => { fcS.brand = b.value; paint(); };
            if (v) v.onchange = () => { fcS.v = v.value; paint(); };
            const p2 = host.querySelector('#fcPrev'), n2 = host.querySelector('#fcNext');
            if (p2) p2.onclick = () => { fcS.dm = fcS.dm > 1 ? fcS.dm - 1 : 12; paint(); };
            if (n2) n2.onclick = () => { fcS.dm = fcS.dm < 12 ? fcS.dm + 1 : 1; paint(); };
          };
          bind();
        },
        입고팀: (card) => {
          // ② 월별 입고 현황 — 브랜드 여러 개 고르기
          const host = card.querySelector('#npmon');
          if (host && MON) {
            const btn = host.querySelector('#mbrand'), bd = host.querySelector('#npmonb');
            if (btn && bd) {
              const cnt = new Map(MON.brands.map((b) => [b, Object.keys(MON.M).reduce((s, k2) => s + Math.abs((MON.M[k2] || {})[b] || 0), 0)]));
              const paint = () => { bd.innerHTML = monBody(); btn.querySelector('b').textContent = monSel ? monSel.length + '개' : '전체'; };
              btn.onclick = () => { if (HS.pickMany) HS.pickMany(btn, '브랜드', MON.brands, cnt, monSel, (v) => { monSel = v; paint(); }); };
              paint();
            }
          }
          // ③ 반품 진행 현황 — 반품 현황 화면의 일별 반품 관리 대장을 그대로 (요약 4칸만 빼고)
          const rd = card.querySelector('#retdash');
          if (rd && HS.returnsDash) {
            const drawRet = () => { rd.innerHTML = ''; return HS.returnsDash(rd, retP, ym, { noKpi: true, view: 'meeting', go: (np2) => { retP = np2; drawRet(); } }).catch((e) => { rd.innerHTML = '<div class="empty">반품 자료를 읽지 못했습니다 · ' + esc(e.message) + '</div>'; }); };
            rd.innerHTML = '<div class="empty">반품 대장 불러오는 중…</div>';
            lazy(rd, drawRet); // 화면에 보일 때 읽기 (2026-11-18)
          } else if (rd) rd.innerHTML = '<div class="empty">반품 자료를 읽지 못했습니다</div>';
        },
      };
      const RT = {
        // 내년 예상 물동량 (2026-11-12)
        fc: () => '<div id="fcBox">' + fcBody() + '</div>',
        vol: () => '<div class="seg-wrap" id="ownSeg"></div><div class="tw">' + volTable(Mv, y, mm, own) + '</div><div class="tw" style="margin-top:12px">' + procTable(Mv, ym, own) + '</div>' + (Object.keys(STK).some((k) => STK[k][0]) ? '<h4 style="margin:14px 0 6px;font-size:13.5px">월말 재고 <small class="mute" style="font-weight:400">전산자료 WMS · ERP 재고 · 그 달 마지막 등록 기준 · 전 화주</small></h4><div class="tw">' + kv((HS.STOCK_ALL || []).map(([kd, sb, l]) => { const v = STK[kd + '|' + sb] || []; return [l + ' 재고 (PCS)' + (v[0] ? ' · ' + v[0].d.slice(5).replace('-', '/') + ' 기준 · SKU ' + fmt(v[0].sku) : ''), ...stk(kd, sb), (kd === 'wms' ? 'WMS' : 'ERP') + ' 재고 조회', '#/cs?k=' + kd + '&t=조회']; })) + '</div>' : '') + (Object.keys(Mv).length ? '' : '<div class="lock" style="margin-top:10px">물동량 자료가 없습니다. <a href="#/volume">물동량</a>에서 정산 파일을 올리세요.</div>'),
        cost: () => { const teams = [...new Set(Object.keys(Wv[ym] || {}).concat(Object.keys(Wv[ly] || {})))]; const order = HS.cache.teams.map((t) => t.name); teams.sort((a, b) => order.indexOf(a) - order.indexOf(b)); const tt = (k, m) => teams.reduce((a, t) => a + (((Wv[m] || {})[t] || {})[k] || 0), 0);
          return '<div id="plMeet"><div class="empty">손익계산표 불러오는 중…</div></div><h4 style="margin:16px 0 6px;font-size:13.5px">인력 운영 <small class="mute" style="font-weight:400">인원 · 작업 수량 전년 비교</small></h4>' + (teams.length ? '<div class="tw"><table><tr><th>팀</th><th class="n">인원 (연인원)</th><th class="n">전년</th><th class="n">증감</th><th class="n">작업 수량</th><th class="n">전년</th><th class="n">증감</th><th class="n">인당</th></tr>' + teams.map((t) => { const [a, b] = wl(t, 'to'); const [q, q2] = wl(t, 'qty'); return '<tr class="click" data-href="#/worklog?t=' + encodeURIComponent(t) + '"><td>' + esc(t) + '</td><td class="n"><b>' + n0(a) + '</b></td><td class="n">' + n0(b) + '</td><td class="n">' + pct(a, b) + '</td><td class="n">' + n0(q) + '</td><td class="n">' + n0(q2) + '</td><td class="n">' + pct(q, q2) + '</td><td class="n">' + (a ? fmt(Math.round(q / a)) : '-') + '</td></tr>'; }).join('') +
            '<tr class="tot"><td><b>합계</b></td><td class="n"><b>' + n0(tt('to', ym)) + '</b></td><td class="n">' + n0(tt('to', ly)) + '</td><td class="n">' + pct(tt('to', ym), tt('to', ly)) + '</td><td class="n">' + n0(tt('qty', ym)) + '</td><td class="n">' + n0(tt('qty', ly)) + '</td><td class="n">' + pct(tt('qty', ym), tt('qty', ly)) + '</td><td class="n">' + (tt('to', ym) ? fmt(Math.round(tt('qty', ym) / tt('to', ym))) : '-') + '</td></tr></table></div><div class="mute" style="font-size:11.5px;margin-top:6px">관리자 업무일지 기준 (금액 제외 · 인원 · 작업 수량만)</div>' : '<div class="empty">' + esc(ym) + ' 관리자 업무일지 자료가 없습니다</div>'); },
        입고팀: () => inboundSect(),
        정상팀: () => normalSect(),
        이월팀: () => carrySect(),
        지원팀: () => supportSect(),
        온라인팀: () => onlineSect(),
        관리팀: () => kv([['공지 사항 (이번 달 등록)', (notices || []).filter((n) => (n.created_at || '').slice(0, 7) === ym).length, '-', '공지 사항', '#/notice'], ['기준정보 · 사용자', '-', '-', '기준정보', '#/settings']]),
        안성센터: () => { const A = asd || []; const inM = (r, a, b) => r.date >= a && r.date <= b; const sm = (k, a, b) => A.filter((r) => inM(r, a, b)).reduce((x, r) => x + (+r[k] || 0), 0); const v2 = (k) => [sm(k, m1, m2), sm(k, l1, l2) || '-'];
          if (!A.length) return '<div class="empty">안성 자료가 없습니다 · <a href="#/anseong">안성센터 연동</a>에서 가져오기</div>';
          return kv([['반품 확정 (장)', ...v2('return_qty'), '안성센터 연동', '#/anseong'], ['소터 분류 (장)', ...v2('sorter_qty'), '안성센터 연동', '#/anseong'], ['출고 (장 · 확정)', ...v2('ship_qty'), '안성센터 연동', '#/anseong'], ['포승 이관 (장 · 확정)', ...v2('transfer_qty'), '안성센터 연동', '#/anseong']]); },
        연차: () => '',
      };
      body.innerHTML = '';
      const wrap = HS.el('<div class="meet"></div>'); body.appendChild(wrap);
      // 2026-11-12: 본문 목차 박스 폐기 — 같은 항목이 왼쪽 메뉴(월간 회의 ▸ 01~10)에 있어 중복
      const main = HS.el('<div class="mmain"></div>'); wrap.appendChild(main);
      main.appendChild(HS.el('<div class="ptitle">혜성물류 ' + y + '년 ' + mm + '월 월간 회의</div>'));
      const canE = HS.can('meeting', 'edit'); const myG = HS.myGroup ? HS.myGroup() : null; const isAll = HS.me.role && HS.me.role.scope === 'all';
      SECTS.forEach(([k, l, g]) => {
        const team = g === '팀별';
        const go = SEC_GO(k, ym); const c = HS.el('<div class="card msect no-tools" id="ms-' + esc(k) + '"><h3>' + esc(k === 'fc' ? '00. ' + (y + 1) + '년 예상 물동량' : l) + (TEAM[k] ? ' <small>' + esc(TEAM[k]) + '</small>' : '') + (go ? '<a class="mgo" href="' + esc(go) + '">' + (k === 'vol' ? '물동량 화면' : k === 'cost' ? '원가 관리 화면' : '팀 화면') + ' →</a>' : '') + '</h3><div class="mbody">' + (RT[k] ? RT[k]() : '') + '</div></div>');
        // 특이사항 · 공유사항
        const may = canE && (isAll || !team || k === myG || (k === '지원팀' && HS.me.role_id === 'support'));
        if (team || k === '연차' || NOTE[k]) {
          const n = NOTE[k] || {}; const box = HS.el('<div class="memo2"><div class="mh2"><b>' + (k === '연차' ? '팀원 연차 사용 계획' : '특이사항 · 공유사항 · 생산성 개선 방안') + '</b><span class="mute">' + (n.updated_at ? esc(HS.who(n.updated_by) || '') + ' · ' + esc(new Date(n.updated_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })) : '') + '</span><span class="sp"></span>' + (may ? '<button class="btn sm" data-e>' + (n.body ? '수정' : '작성') + '</button>' : '') + '</div><div class="mtext">' + (n.body ? esc(n.body).replace(/\n/g, '<br>') : '<span class="mute">' + (may ? '아직 작성하지 않았습니다' : '작성 전') + '</span>') + '</div></div>');
          c.appendChild(box);
          const eb = box.querySelector('[data-e]'); if (eb) eb.onclick = () => { const t = box.querySelector('.mtext'); t.innerHTML = '<textarea class="in" style="width:100%;min-height:130px"></textarea><div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px"><button class="btn sm" data-c>취소</button><button class="btn sm p" data-ok>저장</button></div>'; const ta = t.querySelector('textarea'); ta.value = n.body || ''; ta.focus(); t.querySelector('[data-c]').onclick = () => HS.route(); t.querySelector('[data-ok]').onclick = async () => { try { await HS.db.upsert('erp_meet_note', [{ ym, sect: k, body: ta.value.trim() }]); HS.toast('저장했습니다', 'ok'); HS.route(); } catch (e) { HS.err(e); } }; };
        }
        main.appendChild(c);
        if (AFTER[k]) { try { AFTER[k](c); } catch (e) { console.warn('meeting section', k, e); } }
      });
      const pm = main.querySelector('#plMeet'); if (pm && HS.plView) lazy(pm, () => HS.plView(pm, {}, y, { meet: true, ym }).catch((e) => { pm.innerHTML = '<div class="empty">손익계산표를 읽지 못했습니다 · ' + esc(e.message) + '</div>'; }));
      main.addEventListener('click', (e) => { if (e.target.closest('a,button,select,input,textarea,label')) return; const tr = e.target.closest('tr[data-href]'); if (tr) location.hash = tr.dataset.href.replace(/^#/, ''); });
      // 메뉴(월간 회의 ▸ 01~10)로 들어왔을 때 그 항목으로 내려감 (2026-11-12)
      if (p.s) setTimeout(() => { const el = document.getElementById('ms-' + p.s); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120);
      const sw = main.querySelector('#ownSeg'); if (sw) sw.appendChild(HS.seg([['', '전체']].concat(OWN.map((o) => [o, o])), p.o || '', (o) => HS.go('meeting', Object.assign({}, p, { o, m: ym }))));
      HS.live(['erp_meet_note'], () => { if (HS.cur === 'meeting' && !document.querySelector('.memo2 textarea')) HS.route(); });
    },
  });

  // ================= 전년 대비 물동량 =================
  HS.view('volume', {
    title: '전년 대비 물동량', perm: 'volume',
    async render(body, p, tools) {
      const ym = /^\d{4}-\d{2}$/.test(p.m || '') ? p.m : defYm(); const y = +ym.slice(0, 4), mm = +ym.slice(5);
      tools.appendChild(monthPicker(ym, (x) => HS.go('volume', Object.assign({}, p, { m: x }))));
      const own = p.o && OWN.indexOf(p.o) >= 0 ? [p.o] : null;
      tools.appendChild(HS.seg([['', '전체']].concat(OWN.map((o) => [o, o])), p.o || '', (o) => HS.go('volume', Object.assign({}, p, { o, m: ym }))));
      const M = await volMonths(y - 1, y); body.innerHTML = '';
      const has = Object.keys(M).length;
      if (has) {
        const ly = lastYear(ym); const a = V.sum(M[ly], own, null), b = V.sum(M[ym], own, null);
        let ya = 0, yb = 0; for (let m = 1; m <= mm; m++) { ya += V.sum(M[(y - 1) + '-' + pad(m)], own, null); yb += V.sum(M[y + '-' + pad(m)], own, null); }
        body.appendChild(HS.el('<div class="kpis"><div class="card kpi"><div class="l">' + mm + '월 물동량</div><div class="v">' + fmt(b) + '</div><div class="s">전년 ' + fmt(a) + ' · ' + pct(b, a) + '</div></div><div class="card kpi"><div class="l">1~' + mm + '월 누적</div><div class="v">' + fmt(yb) + '</div><div class="s">전년 ' + fmt(ya) + ' · ' + pct(yb, ya) + '</div></div><div class="card kpi"><div class="l">' + mm + '월 B2B</div><div class="v">' + fmt(V.sum(M[ym], own, V.B2B)) + '</div><div class="s">' + pct(V.sum(M[ym], own, V.B2B), V.sum(M[ly], own, V.B2B)) + '</div></div><div class="card kpi"><div class="l">' + mm + '월 B2C</div><div class="v">' + fmt(V.sum(M[ym], own, V.B2C)) + '</div><div class="s">' + pct(V.sum(M[ym], own, V.B2C), V.sum(M[ly], own, V.B2C)) + '</div></div></div>'));
        const c1 = HS.el('<div class="card" style="margin-top:14px"><h3>월별 물동량 <small>' + (own ? esc(own[0]) : '전 화주') + ' · 월마감 정산 기준 · 수량(PCS)</small></h3>' + bars(M, y, own) + '<div class="tw" style="margin-top:10px">' + volTable(M, y, 12, own) + '</div></div>'); body.appendChild(c1);
        const two = HS.el('<div class="row2" style="margin-top:14px"></div>'); body.appendChild(two);
        two.appendChild(HS.el('<div class="card"><h3>공정별 <small>' + esc(ym) + ' · 전년 대비</small></h3><div class="tw">' + procTable(M, ym, own) + '</div></div>'));
        two.appendChild(HS.el('<div class="card"><h3>화주별 <small>' + esc(ym) + '</small></h3><div class="tw"><table><tr><th>화주</th><th class="n">전년</th><th class="n">' + mm + '월</th><th class="n">증감</th><th class="n">차이 수량</th><th class="n">누적</th><th class="n">누적 증감</th><th class="n">누적 차이</th></tr>' + OWN.map((o) => { let a2 = 0, b2 = 0; for (let m = 1; m <= mm; m++) { a2 += V.sum(M[(y - 1) + '-' + pad(m)], [o], null); b2 += V.sum(M[y + '-' + pad(m)], [o], null); } const a1 = V.sum(M[ly], [o], null), b1 = V.sum(M[ym], [o], null); return '<tr><td>' + o + '</td><td class="n">' + n0(a1) + '</td><td class="n"><b>' + n0(b1) + '</b></td><td class="n">' + pct(b1, a1) + '</td><td class="n">' + dqty(b1 - a1, b1 || a1) + '</td><td class="n">' + n0(b2) + '</td><td class="n">' + pct(b2, a2) + '</td><td class="n">' + dqty(b2 - a2, b2 || a2) + '</td></tr>'; }).join('') + '</table></div></div>'));
      } else body.appendChild(HS.el('<div class="card empty">물동량 자료가 없습니다' + (HS.can('volume', 'create') ? '. 아래에서 월마감 정산 파일을 올리세요.' : '') + '</div>'));
      if (HS.can('volume', 'create')) body.appendChild(uploadCard());
    },
  });
  // 물동량 올리기 (대량 등록) — 한 파일에 여러 달 · 파일 여러 개 가능
  //  · 등록 전에 달마다 무엇이 들어오는지 (새로 넣음 / 덮어씀 · 지금 DB 값) 다 보여줌
  //  · 겹치는 달은 묻지 않고 덮어씀 (2026-11-10 사용자 결정) — 대신 누르기 전에 경고 줄
  //  · 금액 · 단가는 읽지 않음
  function uploadCard() {
    const c = HS.el('<div class="card" style="margin-top:14px"><h3 id="vh">물동량 올리기 <small>월마감 정산 파일 (크리스 · 링스 · 로라 · 슈퍼웍스 일별 시트) · 정산 수량만 읽음 · 금액은 읽지 않음 · ' + HS.fmtLink('volume') + '</small><span class="sp"></span><button class="btn sm p" id="vpick">파일 선택 (여러 개 가능)</button></h3><div class="mute" id="vhelp" style="font-size:12px;line-height:1.7">한 파일에 여러 달이 들어 있어도 됩니다. 파일에 든 <b>화주 · 기간</b>은 새 값으로 바꿉니다 (같은 파일을 다시 올려도 두 번 들어가지 않음). 지난 자료를 한꺼번에 넣을 때는 파일을 여러 개 골라도 됩니다.</div><div id="vr"></div><input type="file" accept=".xlsx,.xlsm,.xls" multiple class="hide"></div>');
    const fi = c.querySelector('input'); c.querySelector('#vpick').onclick = () => fi.click();
    // 맨 위 [엑셀 일괄 등록] 칸에 물동량 파일을 넣었을 때 그리로 넘겨받음 (2026-11-12)
    HS.volumeTakeFiles = async (files) => {
      try { const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f)); fi.files = dt.files; } catch (e) { /* 옛 브라우저 */ }
      c.scrollIntoView({ behavior: 'smooth', block: 'start' });
      await fi.onchange(); // 읽는 중에 머리글(#vh)을 다시 쓰므로, 끝난 뒤에 꼬리표를 붙인다
      const h = c.querySelector('#vh');
      if (h && !/넘어옴/.test(h.textContent)) h.insertAdjacentHTML('beforeend', '<span class="tag y" style="margin-left:6px">위 칸에서 넘어옴</span>');
      return c;
    };
    fi.onchange = async () => {
      const files = [...fi.files]; if (!files.length) return;
      const r = c.querySelector('#vr'); const help = c.querySelector('#vhelp');
      r.innerHTML = '<div class="empty">읽는 중…</div>'; await new Promise((x) => setTimeout(x, 30));
      // 파일 이름 순서대로 읽음 → 같은 달이 두 파일에 있으면 뒤에 읽은 파일이 남음
      files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      const all = { rows: [], found: [], miss: [], skipped: [] }; const perFile = []; const bad = [];
      for (const f of files) {
        r.innerHTML = '<div class="empty">' + esc(f.name) + ' 읽는 중…</div>'; await new Promise((x) => setTimeout(x, 20));
        let res;
        try { HS.needXlsx(); const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array', cellFormula: false, cellHTML: false, cellText: false }); res = V.readBook(wb.SheetNames.map((n) => ({ name: n, ws: wb.Sheets[n] }))); }
        catch (e) { bad.push(f.name + ': ' + e.message); continue; }
        if (!res.found.length) { bad.push(f.name + ': 화주 일별 시트를 찾지 못함' + (res.miss.length ? ' (' + res.miss.map((m) => m.sheet + ' — ' + m.why).join(', ') + ')' : '')); continue; }
        // 뒤 파일이 남도록: 같은 날짜 · 화주 · 공정은 새 값으로 바꿔 넣기
        const key = (q) => q.rec_date + '|' + q.owner + '|' + q.proc; const idx = {};
        all.rows.forEach((q, i) => (idx[key(q)] = i));
        res.rows.forEach((q) => { const i = idx[key(q)]; if (i == null) { idx[key(q)] = all.rows.length; all.rows.push(q); } else all.rows[i] = q; });
        res.found.forEach((x) => all.found.push(Object.assign({ file: f.name }, x)));
        res.miss.forEach((m) => all.miss.push(Object.assign({ file: f.name }, m)));
        (res.skipped || []).forEach((s) => { if (all.skipped.indexOf(s) < 0) all.skipped.push(s); });
        perFile.push({ name: f.name, owners: [...new Set(res.found.map((x) => x.owner))], months: [...new Set(res.found.flatMap((x) => x.months || []))].sort(), qty: res.found.reduce((a, x) => a + x.qty, 0) });
      }
      if (!all.found.length) {
        r.innerHTML = '<div class="lock" style="background:#FBE6E2;border-color:#F0B8AE">✖ 물동량 정산 파일이 아닙니다. 크리스 · 링스 · 로라 · 슈퍼웍스 일별 시트(일자 · 입고 · 출고 · 반품 …)가 있어야 합니다.' + (bad.length ? '<br><span class="mute">' + esc(bad.join(' · ')) + '</span>' : '') + '</div>';
        fi.value = ''; return;
      }
      const grid = V.monthGrid(all.rows); const OWS = V.byOwner(all);
      const months = grid.map((g) => g.ym); const last = months[months.length - 1];
      // 지금 DB에 든 달 (덮어쓰는 달을 가려내려고)
      let cur = {};
      try { const y1 = +months[0].slice(0, 4), y2 = +last.slice(0, 4); const M = await volMonths(y1, y2); months.forEach((m) => { const v = V.sum(M[m], null, null); if (v) cur[m] = v; }); } catch (e) { cur = {}; }
      const over = months.filter((m) => cur[m] != null);
      help.style.display = 'none';
      c.querySelector('#vh').innerHTML = '물동량 올리기 <small>' + (files.length > 1 ? '파일 ' + files.length + '개' : esc(files[0].name)) + ' · 시트 ' + all.found.length + '개 · <b>' + months.length + '개월</b> · 읽은 줄 ' + fmt(all.rows.length) + '</small><span class="sp"></span><button class="btn sm" id="vpick2">파일 다시 고르기</button>';
      c.querySelector('#vpick2').onclick = () => fi.click();
      const cell = (g, o) => (g.by[o] ? fmt(g.by[o]) : '<span class="mute">-</span>');
      const tot = {}; OWN.forEach((o) => (tot[o] = grid.reduce((a, g) => a + (g.by[o] || 0), 0)));
      r.innerHTML =
        (over.length ? '<div class="lock warn" style="margin-bottom:12px"><span>⚠ <b>이미 들어있는 달 ' + over.length + '개를 덮어씁니다</b> — 아래 표에서 <span class="tag y">덮어씀</span> 표시된 달입니다. 되돌릴 수 없습니다.</span></div>' : '') +
        (bad.length ? '<div class="lock" style="margin-bottom:12px;background:#FBE6E2;border-color:#F0B8AE"><span>✖ 읽지 못한 파일 ' + bad.length + '개 — ' + esc(bad.join(' · ')) + '</span></div>' : '') +
        '<div class="tw"><table class="no-tools"><tr><th>달</th>' + OWN.map((o) => '<th class="n">' + esc(o) + '</th>').join('') + '<th class="n">합계</th><th>지금 DB</th></tr>' +
        grid.map((g) => '<tr><td>' + esc(g.ym) + '</td>' + OWN.map((o) => '<td class="n">' + cell(g, o) + '</td>').join('') + '<td class="n"><b>' + fmt(g.total) + '</b></td><td>' + (cur[g.ym] != null ? '<span class="tag y">덮어씀</span> <span class="mute" style="font-size:11px">' + fmt(cur[g.ym]) + '</span>' : '<span class="tag g">새로 넣음</span>') + '</td></tr>').join('') +
        '<tr class="tot"><td>합계 ' + months.length + '개월</td>' + OWN.map((o) => '<td class="n">' + fmt(tot[o]) + '</td>').join('') + '<td class="n">' + fmt(grid.reduce((a, g) => a + g.total, 0)) + '</td><td></td></tr></table></div>' +
        (perFile.length > 1 ? '<div style="margin-top:14px"><b style="font-size:13px">파일별로 읽은 것</b></div><div class="tw" style="margin-top:6px"><table class="no-tools"><tr><th>파일</th><th>화주</th><th>기간</th><th class="n">달</th><th class="n">수량</th></tr>' + perFile.map((x) => '<tr><td>' + esc(x.name) + '</td><td>' + esc(x.owners.join(' · ')) + '</td><td>' + esc(x.months.length ? x.months[0] + ' ~ ' + x.months[x.months.length - 1] : '-') + '</td><td class="n">' + x.months.length + '</td><td class="n">' + fmt(x.qty) + '</td></tr>').join('') + '</table></div><div class="mute" style="font-size:12px;margin-top:8px">같은 달이 두 파일에 있으면 <b>뒤에 고른 파일</b> 값이 남습니다 (파일 이름 순서대로 올림)</div>' : '') +
        '<div style="margin-top:14px"><b style="font-size:13px">시트별로 읽은 것</b></div>' +
        '<div class="tw" style="margin-top:6px"><table class="no-tools"><tr><th>시트</th><th>화주</th><th>기간</th><th class="n">달</th><th>읽은 묶음</th><th class="n">수량</th><th class="n">줄</th></tr>' +
        all.found.map((x) => '<tr><td>' + esc(x.sheet) + (perFile.length > 1 ? ' <span class="mute" style="font-size:11px">' + esc(x.file) + '</span>' : '') + '</td><td>' + esc(x.owner) + '</td><td>' + esc(x.from + ' ~ ' + x.to) + '</td><td class="n">' + (x.months || []).length + '</td><td>' + (x.block === '정산' ? '<span class="tag g">정산</span>' : '<span class="tag y">원자료 (정산 묶음 없음)</span>') + '</td><td class="n">' + fmt(x.qty) + '</td><td class="n">' + fmt(x.rows) + '</td></tr>').join('') + '</table></div>' +
        (all.miss.length ? '<div class="lock" style="margin-top:12px"><span>⚠ 화주 시트인데 읽지 못한 것 ' + all.miss.length + '개 — ' + esc(all.miss.map((m) => m.sheet + ' (' + m.why + ')').join(' · ')) + '</span></div>' : '') +
        (all.skipped.length ? '<div class="lock" style="margin-top:12px"><span>읽지 않은 시트 ' + all.skipped.length + '개 — <b>' + all.skipped.map(esc).join('</b> · <b>') + '</b> <span class="mute">(화주 일별 시트가 아니거나 금액 시트 · 금액은 읽지 않습니다)</span></span></div>' : '') +
        '<div id="vprog"></div>' +
        '<div style="display:flex;align-items:center;gap:10px;justify-content:flex-end;margin-top:14px"><span class="mute" style="font-size:12px">등록하면 위 ' + months.length + '개월이 그대로 들어가고' + (over.length ? ', 덮어쓰는 ' + over.length + '개월은 지금 값이 지워집니다' : '') + '</span><button class="btn p" id="vreg">' + months.length + '개월 등록</button></div>';
      r.querySelector('#vreg').onclick = async () => {
        const b = r.querySelector('#vreg'); const pr = r.querySelector('#vprog'); b.disabled = true; const done = [];
        try {
          for (let i = 0; i < OWS.length; i++) {
            const x = OWS[i];
            pr.innerHTML = '<div class="lock ok" style="margin-top:12px"><span>' + (done.length ? '✔ ' + done.map((d) => '<b>' + esc(d) + '</b> 저장 완료').join(' · ') + ' · ' : '') + '<b>' + esc(x.owner) + '</b> 저장 중… (' + (i + 1) + ' / ' + OWS.length + ')</span></div>';
            b.textContent = x.owner + ' 저장 중…';
            await HS.db.rpc('erp_volume_replace', { p_owner: x.owner, p_from: x.from, p_to: x.to, p_rows: x.rows });
            done.push(x.owner);
          }
          await HS.db.insert('erp_uploads', { file_name: (files.length > 1 ? files.length + '개 파일 · ' + files[0].name : files[0].name).slice(0, 300), kinds: ['물동량'], rows: all.rows.length, summary: { owners: OWS.map((x) => x.owner), months: months.length, from: months[0], to: last, files: files.length } }).catch(() => {});
          HS.toast(months.length + '개월 물동량을 등록했습니다', 'ok'); HS.go('volume', { m: last });
        } catch (e) { b.disabled = false; b.textContent = months.length + '개월 등록'; pr.innerHTML = ''; HS.err(e); }
      };
      fi.value = '';
    };
    return c;
  }
  HS.volumeUploadCard = uploadCard;

  // ================= 전년 대비 신상품 현황 → 입고팀 신상품 입고 · 출고 · 정리로 대체 (예전 주소로 오면 이동) =================
  HS.view('npyoy', { title: '신상품 입고 · 출고 · 정리', perm: 'newprod', async render() { HS.go('newprod', {}); } });

  // ================= 원가관리 취합 (인원 · 작업 수량) =================
  // ================= 손익계산표 (원가관리 엑셀 '손익계산표' 시트와 같은 모양) =================
  //  · 팀별 누적 · 월별(팀 선택) · 분기/주차별(팀 · 분기 선택) — 인원 · 수량 · 매출 · 지출 · 손익
  const QTR = [['일사분기', [1, 2, 3]], ['이사분기', [4, 5, 6]], ['삼사분기', [7, 8, 9]], ['사사분기', [10, 11, 12]]];
  const ALL = '(주)혜성물류'; const EXCL = ['로라팀', '별도인원']; // 엑셀 손익계산표의 (주)혜성물류 = 로라팀 · 별도인원 제외
  // 막대(매출 · 지출) + 선(손익) 그래프 — 원가관리 엑셀 손익계산표 차트 모양 · 아래에 숫자표
  function plChart(labels, list) {
    const W = 760, H = 230, L = 64, n = labels.length; const S = list.map((o) => o.sales), C = list.map((o) => o.cost), P = list.map((o) => o.sales - o.cost);
    const top = Math.max(1, ...S, ...C, ...P), bot = Math.min(0, ...P); const rng = top - bot || 1; const y = (v) => 12 + (H - 40) * (top - v) / rng;
    const g = (W - L - 6) / Math.max(1, n), bw = Math.max(3, Math.min(16, g / 3)); const M = (v) => (Math.abs(v) >= 1e6 ? Math.round(v / 1e6).toLocaleString() + '백만' : Math.round(v / 1e4).toLocaleString() + '만');
    let o = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="손익 그래프">';
    for (let k = 0; k <= 4; k++) { const v = bot + rng * k / 4, yy = y(v); o += '<line x1="' + L + '" x2="' + W + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '" stroke="#EEF0F4"/><text x="' + (L - 4) + '" y="' + (yy + 3).toFixed(1) + '" font-size="9" text-anchor="end" fill="#6B7486">' + M(v) + '</text>'; }
    if (bot < 0) o += '<line x1="' + L + '" x2="' + W + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '" stroke="#C8CEDA"/>';
    const pts = [];
    labels.forEach((l, i) => { const x = L + 6 + i * g; [[S[i], '#7B5CFA', '매출'], [C[i], '#F08C00', '지출']].forEach(([v, c, nm], j) => { if (v > 0) o += '<rect x="' + (x + j * (bw + 2)).toFixed(1) + '" y="' + y(v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, y(0) - y(v)).toFixed(1) + '" rx="2" fill="' + c + '"><title>' + esc(l) + ' ' + nm + ' ' + fmt(Math.round(v)) + '</title></rect>'; });
      if (l !== '합계') pts.push((x + bw).toFixed(1) + ',' + y(P[i]).toFixed(1)); o += '<text x="' + (x + bw).toFixed(1) + '" y="' + (H - 12) + '" font-size="10" text-anchor="middle" fill="#6B7486">' + esc(l) + '</text>'; });
    o += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#2E6BD8" stroke-width="2"/></svg>';
    return o;
  }
  function plTable(labels, list) {
    const S = list.map((o) => o.sales), C = list.map((o) => o.cost), P = list.map((o) => o.sales - o.cost); let o = '';
    o += '<table class="pldt no-no"><tr><th></th>' + labels.map((l) => '<th class="n">' + esc(l) + '</th>').join('') + '</tr>' + [['매출', '#7B5CFA', S], ['지출', '#F08C00', C], ['손익계산', '#2E6BD8', P]].map(([nm, c, v]) => '<tr><td><i style="background:' + c + '"></i>' + nm + '</td>' + v.map((x) => '<td class="n' + (x < 0 ? ' neg' : '') + '">' + fmt(Math.round(x)) + '</td>').join('') + '</tr>').join('') + '</table>';
    return o;
  }
  // 손익계산표 (원가관리 엑셀 '손익계산표' 시트와 같은 모양)
  //  · 누적 매출 · 지출 · 손익 / 팀별 누적 (출처: 엑셀 대량 등록 · 팀 화면 입력) / 월별 표 + 그래프 / 분기 · 주차별 표 + 그래프
  //  · opt.meet = 월간 회의 보고서 안 (버튼 없이 · 그 달이 든 분기)
  async function plView(body, p, y, opt) {
    opt = opt || {};
    // 1년치를 한 번에: erp_pl_days_json 이 같은 줄을 묶음 하나로 돌려줘서 서버의 '1,000줄' 제한에 안 걸림 (sql/30 · 2026-11-18)
    //  · 30번 SQL 이 아직 없으면 예전처럼 달마다 나눠 부름 (1,000줄 제한 때문에 · 2026-11-13)
    let rows = []; try {
      let got = null;
      try { const j = await HS.db.rpc('erp_pl_days_json', { p_from: (y - 1) + '-12-20', p_to: (y + 1) + '-01-10' }); if (Array.isArray(j)) got = [j]; } catch (e) { got = null; }
      if (!got) {
        const span = [[(y - 1) + '-12-20', (y - 1) + '-12-31']];
        for (let m = 1; m <= 12; m++) span.push([y + '-' + pad(m) + '-01', y + '-' + pad(m) + '-' + new Date(y, m, 0).getDate()]);
        span.push([(y + 1) + '-01-01', (y + 1) + '-01-10']);
        got = await Promise.all(span.map(([a, b]) => HS.db.rpc('erp_pl_days', { p_from: a, p_to: b })));
      }
      const seen = new Set();
      got.forEach((r) => (r || []).forEach((x) => { const k = x.d + '|' + x.team + '|' + (x.wk || ''); if (seen.has(k)) return; seen.add(k); rows.push(x); }));
    } catch (e) { body.innerHTML = '<div class="card empty">손익 자료를 읽지 못했습니다 · 설치하기 2번(DB 설치)을 다시 실행하세요 (sql/11_notice_pl.sql)<br><span class="mute">' + esc(e.message) + '</span></div>'; return; }
    body.innerHTML = '';
    // 주차 · 월: 엑셀에서 올린 줄은 엑셀 주차 칸 그대로(wk), 화면 입력 · 야근은 같은 날짜 줄의 주차 → 없으면 날짜로 계산
    const wkOf = {}; rows.forEach((r) => { if (r.wk) wkOf[r.d + '|' + r.team] = r.wk; });
    rows.forEach((r) => { const k = r.wk || wkOf[r.d + '|' + r.team] || HS.weekInfo(r.d).key; const [yy, mm, kk] = k.split('-').map(Number); r.y = yy; r.m = mm; r.k = kk; r.wl = mm + '월' + kk + '주차'; });
    rows = rows.filter((r) => r.y === y);
    const order = HS.cache.teams.map((t) => t.name); const teams = [...new Set(rows.map((r) => r.team))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (!teams.length) { body.innerHTML = '<div class="' + (opt.meet ? '' : 'card ') + 'empty">' + y + '년 원가관리 자료가 없습니다<br><span class="mute" style="font-size:12px">원가관리 엑셀을 [설정 › 엑셀 · 물동량 업로드]로 올리거나 각 팀 KPI 원가관리 · 업무일지에 입력하면 자동으로 채워집니다</span></div>'; return; }
    const Z = () => ({ to: 0, qty: 0, sales: 0, cost: 0 }); const add = (o, r) => { o.to += +r.to_count || 0; o.qty += +r.qty || 0; o.sales += +r.sales || 0; o.cost += +r.cost || 0; return o; };
    const W = (n) => fmt(Math.round(n)); const P = (n) => '<span class="' + (n < 0 ? 'neg' : n > 0 ? 'pos' : 'mute') + '">' + (n < 0 ? '-' : '') + fmt(Math.abs(Math.round(n))) + '</span>';
    const mm0 = opt.ym ? +opt.ym.slice(5) : null;
    const kpiHref = (t, m) => (t === ALL ? '' : '#/worklog?t=' + encodeURIComponent(t));
    const line = (l, o, cls, href) => '<tr' + (cls || href ? ' class="' + [cls, href ? 'click' : ''].filter(Boolean).join(' ') + '"' : '') + (href ? ' data-href="' + esc(href) + '"' : '') + '><td>' + l + '</td><td class="n">' + fmt(Math.round(o.to * 10) / 10) + '</td><td class="n">' + W(o.qty) + '</td><td class="n">' + W(o.sales) + '</td><td class="n">' + W(o.cost) + '</td><td class="n"><b>' + P(o.sales - o.cost) + '</b></td></tr>';
    const line3 = (l, o, cls, href) => '<tr' + (cls || href ? ' class="' + [cls, href ? 'click' : ''].filter(Boolean).join(' ') + '"' : '') + (href ? ' data-href="' + esc(href) + '"' : '') + '><td>' + l + '</td><td class="n">' + (o.sales ? W(o.sales) : '') + '</td><td class="n">' + (o.cost ? W(o.cost) : '') + '</td><td class="n"><b>' + (o.sales || o.cost ? P(o.sales - o.cost) : '') + '</b></td></tr>';
    const head = (l) => '<tr><th>' + l + '</th><th class="n">인원</th><th class="n">수량</th><th class="n">매출</th><th class="n">지출</th><th class="n">손익계산</th></tr>';
    const head3 = (l) => '<tr><th>' + l + '</th><th class="n">매출</th><th class="n">지출</th><th class="n">손익계산</th></tr>';
    const of = (t) => rows.filter((r) => (t === ALL ? EXCL.indexOf(r.team) < 0 : r.team === t));
    // 자료 출처: 엑셀 대량 등록(주차 칸 있는 줄) · 화면 입력(KPI 원가관리 · 업무일지)
    const src = {}; rows.forEach((r) => { if (!(+r.qty || +r.to_count)) return; const s2 = src[r.team] || (src[r.team] = {}); s2[r.wk ? 'x' : 'k'] = 1; });
    const srcTag = (t) => { const s2 = src[t] || {}; return (s2.x ? '<span class="tag y">엑셀</span> ' : '') + (s2.k ? '<span class="tag b">KPI</span>' : ''); };
    const st = (() => { try { return JSON.parse(localStorage.getItem('hs-pl') || '{}'); } catch (e) { return {}; } })();
    const save = () => { try { localStorage.setItem('hs-pl', JSON.stringify(st)); } catch (e) { /* 무시 */ } };
    const curQ = QTR.findIndex((q) => q[1].indexOf(mm0 || +today().slice(5, 7)) >= 0);
    const tAll = teams.concat([ALL]);
    let tM = tAll.indexOf(p.tm) >= 0 ? p.tm : st.tM && tAll.indexOf(st.tM) >= 0 ? st.tM : ALL;
    let tW = tAll.indexOf(st.tW) >= 0 ? st.tW : (teams[1] || teams[0]); let q = opt.meet ? curQ : st.q != null ? st.q : (String(y) === today().slice(0, 4) ? curQ : 3);
    const sel = (id, opts, cur) => '<select class="in" id="' + id + '" style="width:auto;min-width:130px;height:32px">' + opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>';
    const tOpts = teams.map((t) => [t, t]).concat([[ALL, ALL + ' 전체']]);
    const wrap = HS.el('<div class="plrep' + (opt.meet ? ' plstack' : '') + '"></div>'); body.appendChild(wrap);
    // 누적 3칸 (월별 표에서 고른 팀)
    const kp = HS.el('<div class="plk"></div>'); wrap.appendChild(kp);
    // 팀별 누적
    const byT = {}; rows.forEach((r) => add(byT[r.team] || (byT[r.team] = Z()), r)); const tot = of(ALL).reduce((a, r) => add(a, r), Z()); const totAll = rows.reduce((a, r) => add(a, r), Z()); const hasEx = rows.some((r) => EXCL.indexOf(r.team) >= 0);
    const rate = (o) => '<td class="n">' + (o.sales ? ((o.sales - o.cost) / o.sales * 100).toFixed(1) + '%' : '-') + '</td>';
    const c0 = HS.el('<div class="' + (opt.meet ? '' : 'card') + '"><h3' + (opt.meet ? ' style="font-size:13.5px;margin:4px 0 8px"' : '') + '>팀별 누적 손익 <small>' + y + '년 · 자료: 원가관리 엑셀 대량 등록 + 각 팀 KPI 원가관리 · 업무일지 입력 · 매출 = 수량 × 공정단가 · 지출 = T.O × 팀 인건비 + 야근</small>' + (opt.meet ? '' : '<span class="sp"></span><button class="btn sm gd" id="snap">카톡 이미지</button><button class="btn sm" id="xl" style="margin-left:6px">엑셀</button>') + '</h3><div class="tw no-tools"><table>' + head('팀').replace('</tr>', '<th class="n">이익률</th><th>출처</th></tr>') +
      teams.map((t) => line('<b>' + esc(t) + '</b>', byT[t], '', kpiHref(t, mm0)).replace('</tr>', rate(byT[t]) + '<td>' + srcTag(t) + '</td></tr>')).join('') + line('<b>' + ALL + '</b>' + (hasEx ? ' <span class="mute" style="font-size:11px">로라팀 · 별도인원 제외 (엑셀과 같음)</span>' : ''), tot, 'tot').replace('</tr>', rate(tot) + '<td></td></tr>') + (hasEx ? line('전체 팀 합계', totAll).replace('</tr>', rate(totAll) + '<td></td></tr>') : '') + '</table></div><div class="mute" style="font-size:11px;margin-top:4px">팀 줄을 누르면 그 팀 KPI 원가관리로 이동</div></div>');
    wrap.appendChild(c0);
    const cM = HS.el('<div class="plrow"><div><div class="plh"><b>월별 손익계산표</b><span class="sp"></span>' + sel('selM', tOpts, tM) + '</div><div class="tw no-tools tM"></div></div><div class="pldark"><div class="plt"><span class="plnm"></span><span>월별 손익계산표</span><span class="plg"><i style="background:#7B5CFA"></i>매출 <i style="background:#F08C00"></i>지출 <i style="background:#2E6BD8;height:3px"></i>손익</span></div><div class="plin cM"></div></div></div>'); wrap.appendChild(cM);
    const cW = HS.el('<div class="plrow"><div><div class="plh"><b>분기/주차별 손익계산표</b><span class="sp"></span>' + sel('selW', tOpts, tW) + ' ' + sel('selQ', QTR.map((x, i) => [i, x[0]]), q) + '</div><div class="tw no-tools tW"></div></div><div class="pldark"><div class="plt"><span class="plnm"></span><span>분기/주차별 손익계산표</span><span class="plq"></span></div><div class="plin cW"></div></div></div>'); wrap.appendChild(cW);
    const drawM = () => {
      const r = of(tM); const M = []; for (let m = 1; m <= 12; m++) M.push(Z()); r.forEach((x) => add(M[x.m - 1], x)); const S = M.reduce((a, o) => ({ to: a.to + o.to, qty: a.qty + o.qty, sales: a.sales + o.sales, cost: a.cost + o.cost }), Z());
      kp.innerHTML = '<div><span>누적 매출금액 (원)</span><b>' + W(S.sales) + '</b></div><div><span>누적 지출금액 (원)</span><b>' + W(S.cost) + '</b></div><div class="' + (S.sales - S.cost < 0 ? 'm' : 'p') + '"><span>누적 손익금액 (원) · ' + esc(tM) + '</span><b>' + (S.sales - S.cost < 0 ? '-' : '') + W(Math.abs(S.sales - S.cost)) + '</b></div>';
      cM.querySelector('.tM').innerHTML = '<table>' + head3('월') + M.map((o, i) => line3((i + 1) + '월', o, mm0 === i + 1 ? 'cur' : '', kpiHref(tM, i + 1))).join('') + line3('합계', S, 'tot') + '</table>';
      cM.querySelector('.plnm').textContent = tM;
      // 그래프 막대는 1~12월 (합계 칸은 비움) · 아래 숫자표에는 합계까지 (엑셀과 같음)
      const lab = M.map((o, i) => (i + 1) + '월').concat(['합계']);
      cM.querySelector('.cM').innerHTML = plChart(lab, M.concat([Z()])) + plTable(lab, M.concat([S]));
    };
    const drawW = () => {
      const months = QTR[q][1]; const labels = []; const by = {};
      for (const m of months) { const n = Math.max(5, ...of(tW).filter((x) => x.m === m).map((x) => x.k)); for (let k = 1; k <= n; k++) labels.push(m + '월' + k + '주차'); } // 엑셀처럼 달마다 1~5주차
      of(tW).forEach((x) => { if (months.indexOf(x.m) < 0) return; add(by[x.wl] || (by[x.wl] = Z()), x); });
      const S = labels.reduce((a, l) => (by[l] ? add(a, { to_count: by[l].to, qty: by[l].qty, sales: by[l].sales, cost: by[l].cost }) : a), Z());
      cW.querySelector('.tW').innerHTML = '<table>' + head3('월주차') + labels.map((l) => line3(l, by[l] || Z(), '', kpiHref(tW, +l.split('월')[0]))).join('') + line3('합계', S, 'tot') + '</table>';
      cW.querySelector('.plnm').textContent = tW; cW.querySelector('.plq').textContent = QTR[q][0];
      cW.querySelector('.cW').innerHTML = plChart(labels.map((l) => l.replace('주차', '')), labels.map((l) => by[l] || Z()));
    };
    cM.querySelector('#selM').onchange = (e) => { tM = e.target.value; st.tM = tM; save(); drawM(); };
    cW.querySelector('#selW').onchange = (e) => { tW = e.target.value; st.tW = tW; save(); drawW(); };
    cW.querySelector('#selQ').onchange = (e) => { q = +e.target.value; if (!opt.meet) { st.q = q; save(); } drawW(); };
    drawM(); drawW();
    wrap.addEventListener('click', (e) => { if (opt.meet || e.target.closest('a,button,select,input')) return; const tr = e.target.closest('tr[data-href]'); if (tr) location.hash = tr.dataset.href.replace(/^#/, ''); });
    if (opt.meet) return;
    c0.querySelector('#snap').onclick = () => HS.snap(wrap, '손익계산표_' + y).catch(HS.err);
    c0.querySelector('#xl').onclick = () => {
      HS.needXlsx(); const wb = XLSX.utils.book_new(); const r2 = (l, o) => [l, Math.round(o.to * 10) / 10, Math.round(o.qty), Math.round(o.sales), Math.round(o.cost), Math.round(o.sales - o.cost)]; const H = ['구분', '인원', '수량', '매출', '지출', '손익계산'];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([H].concat(teams.map((t) => r2(t, byT[t])), [r2(ALL, tot), r2('전체 팀 합계', totAll)])), '팀별 누적');
      teams.concat([ALL]).forEach((t) => { const M = []; for (let m = 1; m <= 12; m++) M.push(Z()); of(t).forEach((x) => add(M[x.m - 1], x)); const wk = {}; const lab = []; of(t).slice().sort((a, b) => (a.m - b.m) || (a.k - b.k)).forEach((x) => { const l = x.wl; if (!wk[l]) { wk[l] = Z(); lab.push(l); } add(wk[l], x); });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['월별'].concat(H.slice(1))].concat(M.map((o, i) => r2((i + 1) + '월', o)), [[]], [['월주차'].concat(H.slice(1))], lab.map((l) => r2(l, wk[l])))), t.replace(/[\\/?*[\]:]/g, '').slice(0, 30)); });
      XLSX.writeFile(wb, '손익계산표_' + y + '.xlsx');
    };
  }
  HS.plView = plView;

  HS.view('costsum', {
    title: '원가관리 · 손익계산표', perm: 'worklog',
    async render(body, p, tools) {
      const y = +(p.y || today().slice(0, 4)); const v = p.v === 'qty' ? 'qty' : p.v === 'to' ? 'to' : 'pl';
      tools.appendChild(HS.seg([['pl', '손익계산표'], ['to', '인원 전년 비교'], ['qty', '작업 수량 전년 비교']], v, (x) => HS.go('costsum', { y, v: x })));
      tools.appendChild(HS.seg([[String(y - 1), (y - 1) + '년'], [String(y), y + '년']], String(y), (x) => HS.go('costsum', Object.assign({}, p, { y: x }))));
      if (v === 'pl') return plView(body, p, y);
      const W = await wlMonths((y - 1) + '-01-01', y + '-12-31'); body.innerHTML = '';
      const order = HS.cache.teams.map((t) => t.name); const teams = [...new Set(Object.values(W).flatMap((m) => Object.keys(m)))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      if (!teams.length) { body.innerHTML = '<div class="card empty">관리자 업무일지 자료가 없습니다</div>'; return; }
      const val = (ym, t) => ((W[ym] || {})[t] || {})[v] || 0; const mo = []; for (let m = 1; m <= 12; m++) mo.push(pad(m));
      const lbl = v === 'to' ? '인원 (연인원)' : '작업 수량';
      body.appendChild(HS.el('<div class="card"><h3>팀별 ' + lbl + ' · 전년 대비 <small>' + y + '년 · 관리자 업무일지 기준 · 금액 제외</small></h3><div class="tw"><table><tr><th>팀</th><th>년</th>' + mo.map((m) => '<th class="n">' + +m + '월</th>').join('') + '<th class="n">상반기</th><th class="n">하반기</th><th class="n">합계</th></tr>' +
        teams.concat(['합계']).map((t) => { const f = (yy, m) => (t === '합계' ? teams.reduce((a, x) => a + val(yy + '-' + m, x), 0) : val(yy + '-' + m, t)); const H = (yy, h) => mo.slice(h * 6, h * 6 + 6).reduce((a, m) => a + f(yy, m), 0); const tr = (yy, b) => '<td>' + yy + '년</td>' + mo.map((m) => '<td class="n">' + (b ? '<b>' : '') + n0(f(yy, m) || null) + (b ? '</b>' : '') + '</td>').join('') + '<td class="n">' + n0(H(yy, 0)) + '</td><td class="n">' + n0(H(yy, 1)) + '</td><td class="n">' + n0(H(yy, 0) + H(yy, 1)) + '</td>';
          return '<tr' + (t === '합계' ? ' class="tot"' : '') + '><td rowspan="3"><b>' + esc(t) + '</b></td>' + tr(y - 1, false) + '</tr><tr' + (t === '합계' ? ' class="tot"' : '') + '>' + tr(y, true) + '</tr><tr' + (t === '합계' ? ' class="tot"' : '') + '><td>증감</td>' + mo.map((m) => '<td class="n">' + (f(y, m) ? pct(f(y, m), f(y - 1, m)) : '<span class="mute">-</span>') + '</td>').join('') + '<td class="n">' + pct(H(y, 0), H(y - 1, 0)) + '</td><td class="n">' + pct(H(y, 1), H(y - 1, 1)) + '</td><td class="n">' + pct(H(y, 0) + H(y, 1), H(y - 1, 0) + H(y - 1, 1)) + '</td></tr>'; }).join('') + '</table></div></div>'));
    },
  });
})();
// 설정 › 엑셀 · 물동량 업로드 화면 아래에 물동량 올리기 칸 추가
(function () { const u = HS.views && HS.views.upload; if (!u || u._vol) return; u._vol = true; const orig = u.render; u.render = async function (body, p, tools) { await orig.call(this, body, p, tools); if (HS.can('volume', 'create') && HS.volumeUploadCard) body.appendChild(HS.volumeUploadCard()); }; u.title = '엑셀 · 물동량 업로드'; })();
