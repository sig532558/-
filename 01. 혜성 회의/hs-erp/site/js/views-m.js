/* 혜성물류 회의자료 — 휴대폰 화면 (읽기 전용 · 2026-11-19)
 *  · 홈 화면에 추가하면 어플처럼 열립니다 (manifest.webmanifest · sw.js)
 *  · 등록 · 수정 · 삭제 단추는 넣지 않습니다. 고치는 일은 PC 화면에서.
 *  · 보이는 자료는 PC와 같은 규칙 · 등급(RLS)도 그대로입니다.
 *  · 폭이 좁아 가로로 긴 표는 쓰지 않고 큰 숫자 + 세로 목록으로만 보여 줍니다.
 */
(function () {
  'use strict';
  const { esc, fmt, today, addDays } = HS;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const md = (d) => (d ? +d.slice(5, 7) + '/' + +d.slice(8, 10) : '-');
  const dw = (d) => WD[new Date(d + 'T00:00:00').getDay()];
  const mdw = (d) => md(d) + ' (' + dw(d) + ')';
  const n0 = (v) => +v || 0;
  const go = (q) => HS.go('m', q);
  const PAGES = [
    { k: 'daily', l: '일일 마감 보고', perm: 'daily' },
    { k: 'ship', l: '출고 현황', perm: 'daily' },
    { k: 'ret', l: '반품 현황', perm: 'returns' },
    { k: 'np', l: '신상품 현황', perm: 'newprod' },
    // 2026-11-23: '이월팀 일정' 폐기 — 시즌 계획이 다른 프로그램으로 갔음
  ];
  const can = (p) => !p.perm || HS.can(p.perm, 'view');
  const safe = (pr) => pr.catch(() => []);
  // ⚠ 이름 짓기: .msub 는 월간 회의가 쓰는 클래스라 쓰면 안 됨 (여기는 .mhsub)
  const who = () => { const r = (HS.cache.roles.find((x) => x.id === HS.me.role_id) || {}).name || ''; return HS.me.name + (r && r !== HS.me.name ? ' ' + r : ''); };
  const head = (title) => '<div class="mhd">' + (title ? '<span class="mbk" data-back>‹</span><b>' + esc(title) + '</b>' : '<div><b>혜성물류 회의자료</b><div class="mhsub">' + mdw(today()) + ' · ' + esc(who()) + '</div></div>') + '</div>';
  const kpi = (l, v, s) => '<div class="mk"><div class="l">' + esc(l) + '</div><div class="v">' + v + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') + '</div>';
  const rows = (list) => '<table class="mtb">' + list.map((r) => '<tr' + (r[2] ? ' class="' + r[2] + '"' : '') + '><td>' + esc(r[0]) + '</td><td class="n">' + (r[1] == null ? '<span class="mute">-</span>' : fmt(r[1])) + '</td></tr>').join('') + '</table>';
  const chips = (list, cur, key) => '<div class="mch">' + list.map(([k, l]) => '<span class="mc' + (k === cur ? ' on' : '') + '" data-' + key + '="' + esc(k) + '">' + esc(l) + '</span>').join('') + '</div>';
  const empty = (t) => '<div class="mempty">' + esc(t) + '</div>';
  const card = (inner) => '<div class="mcd">' + inner + '</div>';

  // ---------- 홈 ----------
  async function home(body) {
    const t = today(); const from = addDays(t, -14);
    const [dy, bx] = await Promise.all([
      HS.can('daily', 'view') ? safe(HS.db.list('erp_daily_records', { eq: { section: 'b2b' }, gte: { rec_date: from }, lte: { rec_date: t } })) : [],
      HS.can('returns', 'view') ? safe(HS.db.list('erp_returns_box', { gte: { rec_date: from }, lte: { rec_date: t } })) : [],
    ]);
    const byD = {}; dy.forEach((r) => (byD[r.rec_date] = (byD[r.rec_date] || 0) + n0((r.data || {}).out_qty)));
    const ld = Object.keys(byD).filter((d) => byD[d] > 0).sort().pop();
    const lb = bx.slice().sort((a, b) => (a.rec_date < b.rec_date ? -1 : 1)).pop();
    body.innerHTML = head('') +
      '<div class="mkw">' +
      kpi(ld ? mdw(ld) + ' 출고' : '최근 출고', ld ? fmt(byD[ld]) : '-', ld ? '' : '자료 없음') +
      kpi(lb ? mdw(lb.rec_date) + ' 반품 완료' : '최근 반품', lb ? fmt(n0(lb.done)) : '-', lb ? '도착 ' + fmt(n0(lb.top) + n0(lb.lotte) + n0(lb.haengnang) + n0(lb.etc)) + ' BOX' : '자료 없음') +
      '</div>' +
      '<div class="mlist">' + PAGES.filter(can).map((p) => '<a class="mitem" href="#/m?k=' + p.k + '">' + esc(p.l) + '<span>›</span></a>').join('') + '</div>' +
      '<div class="mfoot">읽기 전용입니다 · 고치실 일은 PC 화면에서<br><a href="#" data-pc>PC 화면으로 보기</a></div>';
  }

  // ---------- 일일 마감 보고 ----------
  const DK = [['out', '출고'], ['in', '입고'], ['ret', '반품']];
  async function daily(body, p) {
    const d = p.d || today(); const k = DK.some((x) => x[0] === p.t) ? p.t : 'out';
    const recs = await safe(HS.db.list('erp_daily_records', { eq: { rec_date: d } }));
    const sec = k === 'ret' ? 'return' : 'b2b';
    const mine = recs.filter((r) => r.section === sec);
    const val = (r) => (k === 'out' ? n0((r.data || {}).out_qty) : k === 'in' ? n0((r.data || {}).in_qty) : n0((r.data || {}).return_total) || n0((r.data || {}).online_return) + n0((r.data || {}).store_return));
    const list = mine.map((r) => [HS.bname(r.rec_key), val(r)]).filter((x) => x[1] !== 0).sort((a, b) => b[1] - a[1]);
    const tot = list.reduce((a, x) => a + x[1], 0);
    body.innerHTML = head('일일 마감 보고') +
      '<div class="mnav"><span data-d="' + addDays(d, -1) + '">‹ ' + md(addDays(d, -1)) + '</span><b>' + mdw(d) + '</b><span data-d="' + addDays(d, 1) + '">' + md(addDays(d, 1)) + ' ›</span></div>' +
      chips(DK, k, 't') +
      (list.length ? card(rows([['합계', tot, 'tot']].concat(list))) : empty('이 날짜에는 ' + DK.find((x) => x[0] === k)[1] + ' 자료가 없습니다'));
  }

  // ---------- 출고 현황 ----------
  const SP = [['w', '이번 주'], ['m', '이번 달'], ['y', '연간']];
  async function ship(body, p) {
    const per = SP.some((x) => x[0] === p.p) ? p.p : 'w';
    const t = today(); const y = +t.slice(0, 4);
    const mon = (d) => addDays(d, -((new Date(d + 'T00:00:00').getDay() + 6) % 7));
    const rng = per === 'w' ? [mon(t), addDays(mon(t), 6)] : per === 'm' ? [t.slice(0, 7) + '-01', t.slice(0, 7) + '-31'] : [y + '-01-01', y + '-12-31'];
    const pr = [addDays(rng[0], -364), addDays(rng[1], -364)];
    const [cur, prv] = await Promise.all([
      safe(HS.db.list('erp_daily_records', { eq: { section: 'b2b' }, gte: { rec_date: rng[0] }, lte: { rec_date: rng[1] } })),
      safe(HS.db.list('erp_daily_records', { eq: { section: 'b2b' }, gte: { rec_date: pr[0] }, lte: { rec_date: pr[1] } })),
    ]);
    const sum = (a) => a.reduce((x, r) => x + n0((r.data || {}).out_qty), 0);
    const byD = {}; cur.forEach((r) => (byD[r.rec_date] = (byD[r.rec_date] || 0) + n0((r.data || {}).out_qty)));
    const c = sum(cur), v = sum(prv); const rate = v ? ((c - v) / v) * 100 : null;
    let list;
    if (per === 'y') { const byM = {}; cur.forEach((r) => (byM[r.rec_date.slice(0, 7)] = (byM[r.rec_date.slice(0, 7)] || 0) + n0((r.data || {}).out_qty))); list = Object.keys(byM).sort().map((m) => [+m.slice(5) + '월', byM[m]]); }
    else { const ds = []; for (let x = rng[0]; x <= rng[1]; x = addDays(x, 1)) ds.push(x); list = ds.filter((x) => byD[x] || x <= t).map((x) => [mdw(x), byD[x] == null ? null : byD[x]]); }
    body.innerHTML = head('출고 현황') + chips(SP, per, 'p') +
      card('<div class="mper">' + esc(per === 'w' ? md(rng[0]) + ' ~ ' + md(rng[1]) : per === 'm' ? +t.slice(5, 7) + '월' : y + '년') + '</div><div class="mbig">' + fmt(c) + '</div>' +
        '<div class="msub2">' + (y - 1) + ' 같은 기간 ' + fmt(v) + (rate == null ? '' : ' · <b class="' + (rate >= 0 ? 'pos' : 'neg') + '">' + (rate >= 0 ? '▲ ' : '▼ ') + Math.abs(rate).toFixed(1) + '%</b>') + '</div>') +
      (list.length ? card(rows(list)) : empty('이 기간에는 출고 자료가 없습니다')) +
      '<div class="mfoot">마감 보고의 출고수량 기준 · 전년은 52주 전 같은 요일</div>';
  }

  // ---------- 반품 현황 ----------
  async function ret(body) {
    const t = today(); const m1 = t.slice(0, 7) + '-01';
    const [bx, pend] = await Promise.all([
      safe(HS.db.list('erp_returns_box', { gte: { rec_date: m1 }, lte: { rec_date: t.slice(0, 7) + '-31' } })),
      safe(HS.db.list('erp_ret_pend', {})),
    ]);
    const srt = bx.slice().sort((a, b) => (a.rec_date < b.rec_date ? -1 : 1)); const last = srt[srt.length - 1];
    const box = (r) => n0(r.top) + n0(r.lotte) + n0(r.haengnang) + n0(r.etc);
    const mTot = srt.reduce((a, r) => a + box(r), 0), mDone = srt.reduce((a, r) => a + n0(r.done), 0);
    // 미처리 전표 = erp_ret_pend 의 rows 중 open 인 것 (PC 반품 현황과 같은 규칙)
    const openOf = (r) => ((r.rows || []).filter((x) => x.open));
    const pl = pend.map((r) => [HS.bname(r.brand), openOf(r).length]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
    const pcs = pend.reduce((a, r) => a + openOf(r).reduce((s, x) => s + n0(x.pend), 0), 0);
    body.innerHTML = head('반품 현황') +
      '<div class="mkw">' + kpi(last ? mdw(last.rec_date) + ' 도착' : '최근 도착', last ? fmt(box(last)) + ' BOX' : '-', last ? '완료 ' + fmt(n0(last.done)) + ' · 대기 ' + fmt(n0(last.pending)) : '자료 없음') +
      kpi(+t.slice(5, 7) + '월 누적', fmt(mTot) + ' BOX', '완료 ' + fmt(mDone)) + '</div>' +
      (pl.length ? card('<div class="mper">브랜드별 미처리 전표 <b>' + fmt(pl.reduce((a, x) => a + x[1], 0)) + '건</b> · ' + fmt(pcs) + ' PCS</div>' + rows(pl)) : empty('미처리 전표가 없습니다')) +
      (srt.length ? card('<div class="mper">날짜별 도착 BOX</div>' + rows(srt.slice().reverse().map((r) => [mdw(r.rec_date), box(r)]))) : '');
  }

  // ---------- 신상품 현황 ----------
  async function np(body, p) {
    const all = await safe(HS.db.list('erp_np_style', { select: 'season,brand,plan_qty,in_qty,out_qty,stock' }));
    if (!all.length) { body.innerHTML = head('신상품 현황') + empty('신상품 자료가 없습니다'); return; }
    const seasons = [...new Set(all.map((r) => r.season))].sort().reverse();
    const s = seasons.indexOf(p.s) >= 0 ? p.s : seasons[0];
    const mine = all.filter((r) => r.season === s);
    const S = (f) => mine.reduce((a, r) => a + n0(r[f]), 0);
    const byB = {}; mine.forEach((r) => { const b = HS.bname(r.brand || ''); (byB[b] = byB[b] || { in: 0, out: 0 }); byB[b].in += n0(r.in_qty); byB[b].out += n0(r.out_qty); });
    const sl = (s2) => s2.slice(0, 4) + ' ' + (s2.slice(4) === 'FW' ? 'F/W' : 'S/S');
    body.innerHTML = head('신상품 현황') + chips(seasons.slice(0, 4).map((x) => [x, sl(x)]), s, 's') +
      '<div class="mkw">' + kpi('기획', fmt(S('plan_qty'))) + kpi('입고', fmt(S('in_qty')), S('plan_qty') ? Math.round((S('in_qty') / S('plan_qty')) * 100) + '%' : '') + '</div>' +
      '<div class="mkw">' + kpi('출고', fmt(S('out_qty'))) + kpi('현재고', fmt(S('stock'))) + '</div>' +
      card('<div class="mper">브랜드별 입고 / 출고</div><table class="mtb">' + Object.keys(byB).sort((a, b) => byB[b].in - byB[a].in).map((b) => '<tr><td>' + esc(b) + '</td><td class="n">' + fmt(byB[b].in) + '</td><td class="n">' + fmt(byB[b].out) + '</td></tr>').join('') + '</table>');
  }

  HS.view('m', {
    title: '휴대폰',
    async render(body, p) {
      const pg = PAGES.find((x) => x.k === p.k);
      body.className = 'body mpg';
      if (!p.k || !pg) return home(body);
      if (!can(pg)) { body.innerHTML = head(pg.l) + empty('이 자료를 볼 권한이 없습니다'); return; }
      if (p.k === 'daily') await daily(body, p);
      else if (p.k === 'ship') await ship(body, p);
      else if (p.k === 'ret') await ret(body);
      else if (p.k === 'np') await np(body, p);
      body.querySelectorAll('[data-d]').forEach((e) => (e.onclick = () => go({ k: 'daily', d: e.dataset.d, t: p.t })));
      body.querySelectorAll('[data-t]').forEach((e) => (e.onclick = () => go({ k: 'daily', d: p.d, t: e.dataset.t })));
      body.querySelectorAll('[data-p]').forEach((e) => (e.onclick = () => go({ k: 'ship', p: e.dataset.p })));
      body.querySelectorAll('[data-s]').forEach((e) => (e.onclick = () => go({ k: 'np', s: e.dataset.s })));
    },
  });
  // 홈 · 뒤로 · PC 화면으로 (화면을 다시 그려도 살아 있게 문서에 한 번만 건다)
  if (!HS._mdoc) {
    HS._mdoc = true;
    document.addEventListener('click', (e) => {
      const bk = e.target.closest && e.target.closest('[data-back]'); if (bk) { e.preventDefault(); go({}); return; }
      const pc = e.target.closest && e.target.closest('[data-pc]');
      if (pc) { e.preventDefault(); try { localStorage.setItem('hs-pc', '1'); } catch (x) { /* 무시 */ } const [hh, q] = HS.home(); HS.go(hh, q); }
    });
  }
})();
