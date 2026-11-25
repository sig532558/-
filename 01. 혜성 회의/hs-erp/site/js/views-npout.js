/* 정상팀 › 신상품 현황 — 주단위 출고 현황 · 출고 후 미정리 · 입고 후 미출고
 *  · 자료는 입고팀 › 신상품 입고 · 출고 · 정리(erp_np_style)를 그대로 씀 (따로 올리는 파일 없음)
 *  · 품번별 '출고 날짜'는 자료에 없음(재고 0 → 출고완료). 그래서 주차는 전개시기(출고예정일) 또는
 *    강제 등록(본사 요청일) 기준으로 나눔 — 2026-11-10 사용자 확인
 *  · 주차 규칙은 기존 엑셀과 같음: 그 주 금요일이 속한 달의 몇째 주 (P2.weekTh)
 */
(function () {
  'use strict';
  const { esc, fmt, today, addDays } = HS;
  const P2 = window.HSParsers2;
  const SEL = 'season,style,brand,scode,item,plan_qty,plan_date,hq_date,in_qty,in_date,out_qty,stock,stock_loc,st_in,st_out,st_clean,defect,flags';
  const sLabel = (s) => s.slice(0, 4) + ' ' + (s.slice(4) === 'FW' ? 'F/W' : 'S/S');
  const pc = (a, b) => (b ? (a / b) * 100 : null);
  const inPlan = (r) => (r.flags || []).indexOf('기획누락') < 0;
  const dd = (s) => new Date(s + 'T00:00:00');
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const monOf = (s) => { const d = dd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); }; // 그 주 월요일
  const md = (s) => s.slice(5).replace('-', '/');
  const gap = (s) => Math.round((dd(today()) - dd(s)) / 86400000); // + 면 지난 날
  const prevMonth = (ym) => { const d = dd(ym + '-01'); d.setMonth(d.getMonth() - 1); return iso(d).slice(0, 7); };
  async function npMeta() { try { const s = (await HS.db.list('erp_settings', { eq: { key: 'np_update' } }))[0]; return (s && s.value) || {}; } catch (e) { return {}; } }

  // 그 달에 속한 주(월요일 목록) — '금요일이 그 달'이면 그 달 주차
  function weeksOf(ym) {
    const first = ym + '-01'; const last = iso(new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0));
    const out = []; const seen = {};
    for (let x = addDays(first, -7); x <= addDays(last, 7); x = addDays(x, 1)) {
      const m = monOf(x); if (seen[m]) continue; seen[m] = 1;
      const fri = addDays(m, 4); if (fri.slice(0, 7) !== ym) continue;
      out.push({ mon: m, sun: addDays(m, 6), w: P2.weekTh(fri) });
    }
    return out.sort((a, b) => (a.mon < b.mon ? -1 : 1));
  }
  // 주 묶음 만들기: dateOf(r) 가 가리키는 날짜의 월요일로 모음
  function bucket(rows, weeks, dateOf) {
    const by = {}; weeks.forEach((w) => (by[w.mon] = { st: 0, in: 0, out: 0, notout: 0, unclean: 0, rows: [] }));
    rows.forEach((r) => { const d = dateOf(r); if (!d) return; const b = by[monOf(d)]; if (!b) return;
      b.st++; b.rows.push(r);
      if (r.st_in === '입고') { b.in++; if (r.st_out === '출고완료') b.out++; else b.notout++; }
      if (r.st_clean === '미정리' && r.st_out === '출고완료') b.unclean++; });
    return by;
  }
  const sumOf = (by) => Object.values(by).reduce((a, x) => ({ st: a.st + x.st, in: a.in + x.in, out: a.out + x.out, notout: a.notout + x.notout, unclean: a.unclean + x.unclean }), { st: 0, in: 0, out: 0, notout: 0, unclean: 0 });
  const bar = (v) => '<span class="npb"><i style="width:' + Math.min(100, Math.max(0, v || 0)) + '%"></i></span>';

  HS.view('npout', {
    title: '신상품 현황', perm: 'newprod',
    async render(body, p, tools) {
      const meta = await npMeta();
      const seasons = HS.seasonSort([...new Set(Object.keys(meta).concat([HS.curSeason()]))]);
      const season = p.s || (meta[HS.curSeason()] ? HS.curSeason() : seasons[0]);
      const ym = p.m || today().slice(0, 7);
      const go = (o) => HS.go('npout', Object.assign({ s: season, m: ym, b: p.b || '', g: p.g || '' }, o));
      tools.appendChild(HS.seg(seasons.map((s) => [s, sLabel(s)]), season, (s) => go({ s })));
      const mi = HS.el('<input class="in" type="month" style="width:140px">'); mi.value = ym; mi.onchange = () => go({ m: mi.value }); tools.appendChild(mi);
      const m = meta[season] || {};
      tools.appendChild(HS.el('<span class="pill">' + (m.at ? '신상품 자료 ' + esc(new Date(m.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })) : '자료 없음') + '</span>'));

      const all = await HS.db.list('erp_np_style', { eq: { season }, select: SEL });
      if (window.HSStyle) all.forEach((r) => { if (!r.item) r.item = HSStyle.info(r.style).gr; });
      // 출고 기준은 입고팀 화면과 같게: 재고 파일이 올라온 시즌이면 현재고 0 → 출고완료
      { const hasStk = all.some((r) => +r.stock || +r.stock_loc); all.forEach((r) => { if (r.st_out === '미출고' && hasStk && r.stock != null && +r.stock <= 0) r.st_out = '출고완료'; }); }
      body.innerHTML = '';
      if (!all.length) {
        body.innerHTML = '<div class="card empty">' + esc(sLabel(season)) + ' 신상품 자료가 없습니다.<br><span class="mute" style="font-size:12px">이 화면은 입고팀 ▸ 신상품 입고 · 출고 · 정리에 올린 자료를 그대로 씁니다. 따로 올릴 파일은 없습니다.</span><br><br><a class="btn p" href="#/newprod">신상품 입고 · 출고 · 정리 화면</a></div>';
        return;
      }
      // 브랜드 고르기
      const bNames = HS.bsort([...new Set(all.map((r) => r.brand).filter(Boolean))]);
      const bs = HS.el('<select class="in" style="width:150px"><option value="">전체 브랜드</option>' + bNames.map((b) => '<option value="' + esc(b) + '">' + esc(HS.bname(b)) + '</option>').join('') + '</select>');
      bs.value = p.b || ''; bs.onchange = () => go({ b: bs.value }); tools.appendChild(bs);
      const xb = HS.el('<button class="btn gd">엑셀 내려받기</button>'); tools.appendChild(xb);

      const rows = (p.b ? all.filter((r) => r.brand === p.b) : all).filter(inPlan);
      const planOf = (r) => r.plan_date || null;            // 전개시기 (화주 ERP 출고예정일)
      const hqOf = (r) => r.hq_date || r.plan_date || null; // 강제 등록 (본사 요청일) — 없으면 전개시기
      const W1 = weeksOf(prevMonth(ym)), W2 = weeksOf(ym);
      const B1 = bucket(rows, W1, planOf);
      const B2 = bucket(rows, W2, planOf), B2h = bucket(rows, W2, hqOf);
      const T1 = sumOf(B1), T2 = sumOf(B2), T2h = sumOf(B2h);

      // ---------- 맨 위 요약 ----------
      const unclean = rows.filter((r) => r.st_clean === '미정리' && r.st_out === '출고완료');
      const notout = rows.filter((r) => r.st_in === '입고' && r.st_out === '미출고');
      const late = notout.filter((r) => hqOf(r) && hqOf(r) < today());
      const kp = (l, v, s, st) => '<div class="card kpi"' + (st ? ' style="' + st + '"' : '') + '><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
      body.appendChild(HS.el('<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">' +
        kp(+ym.slice(5) + '월 전개 품번', fmt(T2.st), esc(ym) + ' · 기획 ST (전개시기 기준)') +
        kp(+ym.slice(5) + '월 출고 완료', fmt(T2.out), '<span class="pos">출고율 ' + (pc(T2.out, T2.in) || 0).toFixed(1) + '%</span>') +
        kp('입고 후 미출고', '<span class="neg">' + fmt(notout.length) + '</span>', '전체 시즌 기준 · 전개일 지난 것 <b class="neg">' + fmt(late.length) + '</b>') +
        kp('출고 후 미정리', '<span style="color:var(--gold)">' + fmt(unclean.length) + '</span>', '재고 있음 + 로케이션 없음 · ' + fmt(unclean.reduce((a, r) => a + (+r.stock || 0), 0)) + ' PCS') + '</div>'));

      // ---------- ① 전월 주단위 ----------
      const pm = prevMonth(ym);
      const c1 = HS.el('<div class="card" id="np1" style="margin-top:14px"><h3>① 전월 주단위 출고 현황 <small>' + esc(pm) + ' · 전개시기 기준 · 품번(ST) 수</small><span class="sp"></span><span class="mute" style="font-size:11.5px">주차는 그 주 금요일이 속한 달 기준 (기존 엑셀과 같음)</span></h3><div class="tw rt no-tools"></div></div>');
      c1.querySelector('.tw').innerHTML = '<table><tr><th>주차</th><th>기간</th><th class="n">기획 ST</th><th class="n">입고</th><th class="n">출고 완료</th><th>출고율</th><th class="n">미출고</th><th class="n">미정리</th></tr>' +
        W1.map((w) => { const x = B1[w.mon]; const r = pc(x.out, x.in); return '<tr><td data-l="주차"><b>' + esc(w.w) + '</b></td><td class="mute" data-l="기간">' + md(w.mon) + ' ~ ' + md(w.sun) + '</td><td class="n" data-l="기획">' + fmt(x.st) + '</td><td class="n" data-l="입고">' + fmt(x.in) + '</td><td class="n" data-l="출고">' + fmt(x.out) + '</td><td data-l="출고율">' + bar(r) + (r == null ? '-' : r.toFixed(1) + '%') + '</td><td class="n' + (x.notout ? ' neg' : '') + '" data-l="미출고">' + fmt(x.notout) + '</td><td class="n" data-l="미정리">' + fmt(x.unclean) + '</td></tr>'; }).join('') +
        '<tr class="tot"><td>합계</td><td></td><td class="n">' + fmt(T1.st) + '</td><td class="n">' + fmt(T1.in) + '</td><td class="n">' + fmt(T1.out) + '</td><td>' + (pc(T1.out, T1.in) || 0).toFixed(1) + '%</td><td class="n">' + fmt(T1.notout) + '</td><td class="n">' + fmt(T1.unclean) + '</td></tr></table>' +
        (T1.st ? '' : '<div class="empty">' + esc(pm) + ' 에 전개된 품번이 없습니다</div>');
      body.appendChild(c1);

      // ---------- ② 당월 주단위 (전개시기 · 강제 등록 나란히) ----------
      const nowMon = monOf(today());
      const c2 = HS.el('<div class="card" id="np2" style="margin-top:14px"><h3>② 당월 주단위 출고 현황 <small>' + esc(ym) + ' · 전개시기 기준 · 강제 등록(본사 요청일) 기준 나란히</small></h3><div class="tw rt no-tools"></div><div class="mute" style="font-size:11.5px;margin-top:8px;line-height:1.7">· <b>전개시기</b> = 화주 ERP 품번정보현황의 출고예정일 · <b>강제 등록</b> = 신상품 화면에서 직접 넣은 본사 요청일 (없으면 전개시기 그대로)<br>· 두 기준이 다른 품번이 있으면 [차이] 칸에 ± 로 보입니다. 누르면 그 주 품번 목록이 아래에 열립니다.</div></div>');
      c2.querySelector('.tw').innerHTML = '<table><tr><th rowspan="2">주차</th><th rowspan="2">기간</th><th colspan="4" class="c g1">전개시기 기준</th><th colspan="4" class="c g3">강제 등록 기준</th><th rowspan="2" class="n">차이</th></tr>' +
        '<tr><th class="n">기획 ST</th><th class="n">입고</th><th class="n">출고</th><th class="n">미출고</th><th class="n">기획 ST</th><th class="n">입고</th><th class="n">출고</th><th class="n">미출고</th></tr>' +
        W2.map((w) => { const x = B2[w.mon], y = B2h[w.mon]; const df = y.st - x.st; const now = w.mon === nowMon;
          return '<tr class="click" data-w="' + esc(w.mon) + '"' + (now ? ' style="outline:2px dashed var(--gold);outline-offset:-2px"' : '') + '><td data-l="주차"><b>' + esc(w.w) + '</b>' + (now ? ' <span class="tag y">이번 주</span>' : '') + '</td><td class="mute" data-l="기간">' + md(w.mon) + ' ~ ' + md(w.sun) + '</td>' +
            '<td class="n" data-l="기획">' + fmt(x.st) + '</td><td class="n" data-l="입고">' + fmt(x.in) + '</td><td class="n" data-l="출고">' + fmt(x.out) + '</td><td class="n' + (x.notout ? ' neg' : '') + '" data-l="미출고">' + fmt(x.notout) + '</td>' +
            '<td class="n npg" data-l="기획(강제)">' + fmt(y.st) + '</td><td class="n npg" data-l="입고(강제)">' + fmt(y.in) + '</td><td class="n npg" data-l="출고(강제)">' + fmt(y.out) + '</td><td class="n npg' + (y.notout ? ' neg' : '') + '" data-l="미출고(강제)">' + fmt(y.notout) + '</td>' +
            '<td class="n" data-l="차이">' + (df ? '<span class="' + (df > 0 ? 'pos' : 'neg') + '">' + (df > 0 ? '+' : '') + fmt(df) + '</span>' : '<span class="mute">-</span>') + '</td></tr>'; }).join('') +
        '<tr class="tot"><td>합계</td><td></td><td class="n">' + fmt(T2.st) + '</td><td class="n">' + fmt(T2.in) + '</td><td class="n">' + fmt(T2.out) + '</td><td class="n">' + fmt(T2.notout) + '</td><td class="n">' + fmt(T2h.st) + '</td><td class="n">' + fmt(T2h.in) + '</td><td class="n">' + fmt(T2h.out) + '</td><td class="n">' + fmt(T2h.notout) + '</td><td class="n">' + (T2h.st - T2.st ? (T2h.st - T2.st > 0 ? '+' : '') + fmt(T2h.st - T2.st) : '-') + '</td></tr></table>' +
        (T2.st || T2h.st ? '' : '<div class="empty">' + esc(ym) + ' 에 전개된 품번이 없습니다</div>');
      body.appendChild(c2);
      // 주 누르면 그 주 품번 목록
      const wd = HS.el('<div style="margin-top:12px"></div>'); body.appendChild(wd);
      const showWeek = (mon) => {
        const w = W2.find((x) => x.mon === mon); if (!w) { wd.innerHTML = ''; return; }
        const list = [...new Set((B2[mon].rows || []).concat(B2h[mon].rows || []))].sort((a, b) => ((hqOf(a) || '9') < (hqOf(b) || '9') ? -1 : 1));
        wd.innerHTML = '<div class="card"><h3>' + esc(w.w) + ' 품번 <small>' + md(w.mon) + ' ~ ' + md(w.sun) + ' · ' + fmt(list.length) + '개 · 전개시기 또는 강제 등록이 이 주인 것</small><span class="sp"></span><button class="btn sm" id="wc">닫기</button></h3><div class="tw rt no-tools" style="max-height:340px"><table><tr><th>브랜드</th><th>품번</th><th>전개시기</th><th>본사 요청일</th><th class="n">기획</th><th class="n">입고</th><th class="n">재고</th><th>상태</th></tr>' +
          list.map((r) => '<tr><td data-l="브랜드">' + esc(HS.bname(r.brand)) + '</td><td data-l="품번"><b>' + esc(r.style) + '</b></td><td data-l="전개시기">' + esc(r.plan_date || '-') + '</td><td data-l="본사 요청일">' + (r.hq_date ? esc(r.hq_date) + ' <span class="tag k">강제</span>' : '<span class="mute">-</span>') + '</td><td class="n" data-l="기획">' + (r.plan_qty == null ? '-' : fmt(r.plan_qty)) + '</td><td class="n" data-l="입고">' + fmt(r.in_qty) + '</td><td class="n" data-l="재고">' + fmt(r.stock) + '</td><td data-l="상태">' + stTag(r) + '</td></tr>').join('') + '</table></div></div>';
        wd.querySelector('#wc').onclick = () => go({ g: '' });
      };
      c2.querySelectorAll('tr[data-w]').forEach((tr) => (tr.onclick = () => go({ g: tr.dataset.w })));
      if (p.g) showWeek(p.g);

      // ---------- ③ 출고 후 미정리 · ④ 입고 후 미출고 ----------
      // ---------- ③ 전주 · 금주 브랜드별 출고 현황 (2026-11-23 행님 지시) ----------
      //  · 품번별 '출고한 날' 자료가 없어서 ① ② 와 같은 규칙으로 주를 나눔 — 전개시기 기준과 강제 등록 기준을 나란히
      const thisMon = monOf(today()), lastMon = addDays(thisMon, -7);
      const BW = {};
      rows.filter((r) => r.st_out === '출고완료').forEach((r) => {
        [['p', planOf], ['h', hqOf]].forEach(([w, f]) => {
          const d = f(r); if (!d) return; const m = monOf(d); const k = m === lastMon ? 'last' : m === thisMon ? 'cur' : '';
          if (!k) return;
          const o = BW[r.brand] || (BW[r.brand] = { p: { last: { st: 0, qty: 0 }, cur: { st: 0, qty: 0 } }, h: { last: { st: 0, qty: 0 }, cur: { st: 0, qty: 0 } } });
          o[w][k].st++; o[w][k].qty += +r.out_qty || 0;
        });
      });
      const bwKeys = HS.bsort(Object.keys(BW));
      const bwT = { p: { last: { st: 0, qty: 0 }, cur: { st: 0, qty: 0 } }, h: { last: { st: 0, qty: 0 }, cur: { st: 0, qty: 0 } } };
      bwKeys.forEach((b) => ['p', 'h'].forEach((w) => ['last', 'cur'].forEach((k) => { bwT[w][k].st += BW[b][w][k].st; bwT[w][k].qty += BW[b][w][k].qty; })));
      const nz = (v) => (v ? fmt(v) : '<span class="mute">-</span>');
      const cel = (o, b2) => '<td class="n">' + (b2 ? '<b>' + nz(o.st) + '</b>' : nz(o.st)) + '</td><td class="n">' + nz(o.qty) + '</td>';
      const cw = HS.el('<div class="card" id="npw" style="margin-top:14px"><h3>③ 전주 · 금주 브랜드별 출고 현황 <small>전주 ' + esc(md(lastMon)) + ' ~ ' + esc(md(addDays(lastMon, 6))) + ' · 금주 ' + esc(md(thisMon)) + ' ~ ' + esc(md(addDays(thisMon, 6))) + ' · ST = 품번 수 · 수량 = PCS</small></h3><div class="tw rt no-tools"></div>'
        + '<div class="mute" style="font-size:11.5px;margin-top:8px;line-height:1.7">· 품번마다 <b>출고한 날</b>이 자료에 없어서 ① ② 표와 같은 규칙(전개시기 · 강제 등록)으로 주를 나눕니다<br>· 출고 완료인 품번만 셉니다 · 수량은 그 품번의 출고 수량 합계입니다</div></div>');
      cw.querySelector('.tw').innerHTML = !bwKeys.length ? '<div class="empty">전주 · 금주에 출고한 품번이 없습니다</div>'
        : '<table><tr><th rowspan="2">브랜드</th><th colspan="4" class="c g1">전개시기 기준</th><th colspan="4" class="c g3">강제 등록 기준</th></tr>'
        + '<tr><th class="n">전주 ST</th><th class="n">전주 수량</th><th class="n">금주 ST</th><th class="n">금주 수량</th><th class="n">전주 ST</th><th class="n">전주 수량</th><th class="n">금주 ST</th><th class="n">금주 수량</th></tr>'
        + bwKeys.map((b) => { const o = BW[b];
          return '<tr><td data-l="브랜드"><b>' + esc(HS.bname(b) || b) + '</b></td>' + cel(o.p.last) + cel(o.p.cur, true) + cel(o.h.last) + cel(o.h.cur, true) + '</tr>'; }).join('')
        + '<tr class="tot"><td>합계</td>' + cel(bwT.p.last) + cel(bwT.p.cur, true) + cel(bwT.h.last) + cel(bwT.h.cur, true) + '</tr></table>';
      body.appendChild(cw);

      const two = HS.el('<div class="row2" style="margin-top:14px"></div>'); body.appendChild(two);
      // ④ 브랜드별
      const ub = {}; unclean.forEach((r) => { const x = ub[r.brand] || (ub[r.brand] = { st: 0, qty: 0, max: 0, rows: [] }); x.st++; x.qty += +r.stock || 0; const d = hqOf(r); if (d) x.max = Math.max(x.max, gap(d)); x.rows.push(r); });
      const outBy = {}; rows.forEach((r) => { if (r.st_out === '출고완료') outBy[r.brand] = (outBy[r.brand] || 0) + 1; });
      const un = HS.bsort(Object.keys(ub));
      const gTag = (n) => (n >= 10 ? '<span class="tag r">최장 ' + n + '일</span>' : n >= 3 ? '<span class="tag y">최장 ' + n + '일</span>' : n > 0 ? '<span class="tag">최장 ' + n + '일</span>' : '<span class="mute">-</span>');
      const c3 = HS.el('<div class="card" id="np3"><h3>④ 출고 후 미정리 현황 <small>출고 완료인데 재고가 남고 로케이션이 없는 것</small><span class="sp"></span><button class="btn sm" id="x3">목록 엑셀</button></h3><div class="tw rt no-tools"><table><tr><th>브랜드</th><th class="n">출고 ST</th><th class="n">미정리 ST</th><th class="n">미정리 수량</th><th>경과</th></tr>' +
        (un.length ? un.map((b) => { const x = ub[b]; return '<tr class="click" data-ub="' + esc(b) + '"><td data-l="브랜드"><b>' + esc(HS.bname(b)) + '</b></td><td class="n" data-l="출고">' + fmt(outBy[b] || 0) + '</td><td class="n" data-l="미정리" style="color:var(--gold);font-weight:700">' + fmt(x.st) + '</td><td class="n" data-l="수량">' + fmt(x.qty) + '</td><td data-l="경과">' + gTag(x.max) + '</td></tr>'; }).join('') +
          '<tr class="tot"><td>합계</td><td class="n">' + fmt(Object.values(outBy).reduce((a, n) => a + n, 0)) + '</td><td class="n">' + fmt(unclean.length) + '</td><td class="n">' + fmt(unclean.reduce((a, r) => a + (+r.stock || 0), 0)) + '</td><td></td></tr>' : '<tr><td colspan="5" class="empty">미정리 품번이 없습니다</td></tr>') +
        '</table></div><div id="ud" style="margin-top:10px"></div></div>');
      two.appendChild(c3);
      const ud = c3.querySelector('#ud');
      c3.querySelectorAll('tr[data-ub]').forEach((tr) => (tr.onclick = () => {
        const b = tr.dataset.ub; const L = ub[b].rows.slice().sort((a, c) => (c.stock || 0) - (a.stock || 0));
        ud.innerHTML = '<div class="mute" style="font-size:11.5px;margin-bottom:6px"><b>' + esc(HS.bname(b)) + '</b> 미정리 품번 ' + fmt(L.length) + '개</div><div class="tw rt no-tools" style="max-height:260px"><table><tr><th>품번</th><th>전개시기</th><th class="n">출고</th><th class="n">남은 재고</th><th class="n">경과</th></tr>' +
          L.map((r) => { const d = hqOf(r); const g = d ? gap(d) : null; return '<tr><td data-l="품번"><b>' + esc(r.style) + '</b></td><td data-l="전개시기">' + esc(r.plan_date || '-') + '</td><td class="n" data-l="출고">' + fmt(r.out_qty) + '</td><td class="n" data-l="재고">' + fmt(r.stock) + '</td><td class="n" data-l="경과">' + (g == null ? '-' : g + '일') + '</td></tr>'; }).join('') + '</table></div>';
      }));
      c3.querySelector('#x3').onclick = () => HS.download('신상품_출고후미정리_' + season + '.xlsx', unclean.map(xrow), '미정리');
      // ⑤ 입고 후 미출고
      const nl = notout.slice().sort((a, b) => ((hqOf(a) || '9999') < (hqOf(b) || '9999') ? -1 : 1));
      const c4 = HS.el('<div class="card" id="np4"><h3>⑤ 입고 후 미출고 현황 <small>입고는 됐는데 아직 안 나간 것 · 전개일 지난 것 먼저</small><span class="sp"></span><button class="btn sm" id="x4">목록 엑셀</button></h3><div class="tw rt no-tools" style="max-height:420px"><table><tr><th>브랜드</th><th>품번</th><th>전개시기</th><th class="n">입고</th><th class="n">재고</th><th>상태</th></tr>' +
        (nl.length ? nl.slice(0, 300).map((r) => { const d = hqOf(r); const g = d ? gap(d) : null;
          const t = d == null ? '<span class="tag r">전개일 없음</span>' : g > 0 ? '<span class="tag ' + (g >= 7 ? 'r' : 'y') + '">' + g + '일 지남</span>' : g === 0 ? '<span class="tag">오늘</span>' : '<span class="tag g">' + -g + '일 남음</span>';
          return '<tr><td data-l="브랜드">' + esc(HS.bname(r.brand)) + '</td><td data-l="품번"><b>' + esc(r.style) + '</b></td><td data-l="전개시기">' + esc(r.plan_date || '-') + ' <span class="mute">' + esc(d ? P2.weekTh(d) : '') + '</span>' + (r.hq_date ? ' <span class="tag k">강제</span>' : '') + '</td><td class="n" data-l="입고">' + fmt(r.in_qty) + '</td><td class="n" data-l="재고">' + fmt(r.stock) + '</td><td data-l="상태">' + t + '</td></tr>'; }).join('') : '<tr><td colspan="6" class="empty">미출고 품번이 없습니다</td></tr>') +
        '</table></div>' + (nl.length > 300 ? '<div class="mute" style="font-size:11.5px;margin-top:6px">상위 300건만 보여 줍니다 · 전체는 [목록 엑셀]</div>' : '') + '</div>');
      two.appendChild(c4);
      c4.querySelector('#x4').onclick = () => HS.download('신상품_입고후미출고_' + season + '.xlsx', nl.map(xrow), '미출고');

      xb.onclick = () => HS.download('정상팀_신상품현황_' + season + '_' + ym + '.xlsx',
        W2.map((w) => { const x = B2[w.mon], y = B2h[w.mon]; return { 주차: w.w, 시작: w.mon, 끝: w.sun, '전개 기획ST': x.st, '전개 입고': x.in, '전개 출고': x.out, '전개 미출고': x.notout, '강제 기획ST': y.st, '강제 입고': y.in, '강제 출고': y.out, '강제 미출고': y.notout }; }), ym + ' 주단위');
      HS.live(['erp_np_style'], () => { if (HS.cur === 'npout') HS.route(); });
    },
  });
  function stTag(r) {
    if (r.st_in === '미입고') return '<span class="tag r">미입고</span>';
    const t = [r.st_out === '미출고' ? '<span class="tag r">미출고</span>' : '<span class="tag b">출고완료</span>'];
    if (r.st_clean === '미정리') t.push('<span class="tag y">미정리</span>');
    if (r.defect) t.push('<span class="tag r">불량</span>');
    return t.join(' ');
  }
  const xrow = (r) => ({ 브랜드: HS.bname(r.brand), 품번: r.style, 시즌: r.scode, 아이템군: r.item, 기획량: r.plan_qty, 전개시기: r.plan_date, 전개주차: r.plan_date ? HSParsers2.weekTh(r.plan_date) : '', 본사요청일: r.hq_date, 입고수량: r.in_qty, 최초입고일: r.in_date, 출고수량: r.out_qty, 현재고: r.stock, 로케이션재고: r.stock_loc, 입고: r.st_in, 출고: r.st_out, 정리: r.st_clean, 불량: r.defect ? 'Y' : '' });
})();
