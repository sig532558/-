/* 신상품 입고 · 출고 · 정리 현황 (화주 ERP · WMS 자료) */
(function () {
  'use strict';
  const { esc, fmt, today, addDays } = HS;
  const P2 = window.HSParsers2;
  const SEL = 'season,style,brand,scode,item,colors,plan_qty,plan_date,hq_date,in_qty,in_date,out_qty,stock,stock_loc,st_in,st_out,st_clean,defect,flags';
  const curSeason = () => { const d = new Date(); return d.getFullYear() + (d.getMonth() >= 6 ? 'FW' : 'SS'); };
  // 시즌 순서: 2025SS < 2025FW < 2026SS < 2026FW (글자 순서로 정렬하면 FW가 SS보다 앞이라 틀림)
  HS.seasonKey = (s) => +String(s).slice(0, 4) * 2 + (/FW$/.test(s) ? 1 : 0);
  HS.seasonSort = (arr) => arr.slice().sort((a, b) => HS.seasonKey(b) - HS.seasonKey(a));
  HS.curSeason = curSeason;
  const prevSeason = (s) => (+s.slice(0, 4) - 1) + s.slice(4);
  const sLabel = (s) => s.slice(0, 4) + ' ' + (s.slice(4) === 'FW' ? 'F/W' : 'S/S');
  const effDate = (r) => r.hq_date || r.plan_date;
  const pc = (a, b) => (b ? (a / b) * 100 : null);
  async function npMeta() { try { const s = (await HS.db.list('erp_settings', { eq: { key: 'np_update' } }))[0]; return (s && s.value) || {}; } catch (e) { return {}; } }

  HS.view('newprod', {
    title: '신상품 입고 · 출고 · 정리 현황', perm: 'newprod',
    async render(body, p, tools) {
      const meta = await npMeta();
      const seasons = HS.seasonSort([...new Set(Object.keys(meta).concat([curSeason()]))]);
      const season = p.s || (meta[curSeason()] ? curSeason() : seasons[0]);
      tools.appendChild(HS.seg(seasons.map((s) => [s, sLabel(s)]), season, (s) => HS.go('newprod', { s })));
      if (p.tab === 'up') return updateView(body, p, tools, season, meta);
      const m = meta[season] || {};
      tools.appendChild(HS.el('<span class="pill">' + (m.at ? '업데이트 ' + esc(new Date(m.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })) + ' · ' + esc(m.by || '') : '자료 없음') + '</span>'));
      if (HS.can('newprod', 'create')) { const b = HS.el('<button class="btn">자료 업데이트</button>'); b.onclick = () => HS.go('newprod', { s: season, tab: 'up' }); tools.appendChild(b); }
      const kb = HS.el('<button class="btn">📷 카톡용 이미지</button>'); tools.appendChild(kb);
      const xb = HS.el('<button class="btn gd">엑셀 내려받기</button>'); tools.appendChild(xb);
      const [rows, prevRows, snaps] = await Promise.all([HS.db.list('erp_np_style', { eq: { season }, select: SEL }), HS.db.list('erp_np_style', { eq: { season: prevSeason(season) }, select: 'brand,flags,st_in,st_out,plan_qty,in_qty' }), HS.db.list('erp_np_snap', { eq: { season: prevSeason(season) }, order: ['snap_date', false], limit: 400 })]);
      if (window.HSStyle) rows.forEach((r) => { if (!r.item) r.item = HSStyle.info(r.style).gr; }); // 아이템군 빈칸은 품번으로
      // 출고 기준: 현재고 0 → 출고완료 (예전에 올린 자료도 바로 적용 · 재고 파일을 한 번도 안 올린 시즌은 그대로)
      { const hasStk = rows.some((r) => +r.stock || +r.stock_loc); rows.forEach((r) => { if (r.st_out === '미출고' && hasStk && r.stock != null && +r.stock <= 0) r.st_out = '출고완료'; }); }
      body.innerHTML = '';
      if (!rows.length) { body.innerHTML = '<div class="card empty">' + esc(sLabel(season)) + ' 신상품 자료가 없습니다.<br>① 신상품 정보 ② 입고 현황 ③ 출고 현황 파일을 올려 주세요.' + (HS.can('newprod', 'create') ? '<br><br><button class="btn p" id="gu">자료 업데이트</button>' : '') + '</div>'; const g = body.querySelector('#gu'); if (g) g.onclick = () => HS.go('newprod', { s: season, tab: 'up' }); return; }
      const brandF = p.b || '';
      const view = brandF ? rows.filter((r) => r.brand === brandF) : rows;
      const S = P2.npSummary(view); const T = S.tot;
      // 전년: 같은 시점 스냅샷(364일 전 이전 가장 가까운 날) → 없으면 전년 시즌 전체 기획 ST
      const pv = prevRows.filter((r) => (r.flags || []).indexOf('기획누락') < 0 && (!brandF || r.brand === brandF));
      const snap = snaps.find((x) => x.snap_date <= addDays(today(), -364));
      const prevBy = {}; pv.forEach((r) => (prevBy[r.brand] = (prevBy[r.brand] || 0) + 1));
      const prevTot = pv.length || null;
      const yoy = prevTot ? (T.st / prevTot - 1) * 100 : null;
      // 전년 기획 수량 · 입고 수량 (PCS) — 품번 수(ST)와 따로 본다
      const PS = P2.npSummary(pv); const PT = PS.tot;
      const dq = (c, p) => (!p ? null : c - p); // 증감 수량
      const dr = (c, p) => (!p ? null : (c / p - 1) * 100); // 증감률
      const sgq = (v) => (v == null ? '<span class="mute">-</span>' : !v ? '<span class="mute">0</span>' : '<span class="' + (v > 0 ? 'pos' : 'neg') + '">' + (v > 0 ? '+' : '−') + fmt(Math.abs(v)) + '</span>');
      const sgr = (v) => (v == null ? '<span class="mute">-</span>' : Math.abs(v) < 0.05 ? '<span class="mute">0.0%</span>' : '<span class="' + (v > 0 ? 'pos' : 'neg') + '">' + (v > 0 ? '▲ ' : '▼ ') + Math.abs(v).toFixed(1) + '%</span>');
      const k = HS.el('<div class="kpis" style="margin-bottom:14px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))"></div>');
      const kp = (l, v, s, st) => '<div class="card kpi"' + (st ? ' style="' + st + '"' : '') + '><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
      const sc = {}; view.forEach((r) => { if ((r.flags || []).indexOf('기획누락') < 0) sc[r.scode] = (sc[r.scode] || 0) + 1; });
      k.innerHTML = kp('전년 대비 신상품', yoy == null ? '<span class="mute">-</span>' : '<span class="' + (yoy >= 0 ? 'pos' : 'neg') + '">' + (yoy >= 0 ? '▲ ' : '▼ ') + Math.abs(yoy).toFixed(1) + '%</span>', prevTot ? sLabel(prevSeason(season)) + ' 기획 ' + fmt(prevTot) + ' ST' + (snap ? ' · 같은 시점 입고 ' + fmt(snap.data.tot.in) : '') : sLabel(prevSeason(season)) + ' 자료를 올리면 표시', 'border:2px solid var(--gold)') +
        kp('기획 품번 (ST)', fmt(T.st), Object.entries(sc).sort().map(([a, b]) => esc(a) + ' ' + fmt(b)).join(' · ')) + kp('입고', fmt(T.in), '<span class="pos">입고율 ' + (pc(T.in, T.st) || 0).toFixed(1) + '%</span>') +
        kp('미입고', '<span class="neg">' + fmt(T.notin) + '</span>', (pc(T.notin, T.st) || 0).toFixed(1) + '% · 전개일 없음 ' + fmt(view.filter((r) => r.st_in === '미입고' && !effDate(r)).length)) +
        kp('출고 완료', fmt(T.out), '<span class="pos">출고율 ' + (pc(T.out, T.in) || 0).toFixed(1) + '%</span>') + kp('입고 후 미출고', '<span class="neg">' + fmt(T.notout) + '</span>', (pc(T.notout, T.in) || 0).toFixed(1) + '%') +
        kp('출고 후 미정리', '<span style="color:var(--gold)">' + fmt(T.unclean) + '</span>', '재고 있음 + 로케이션 없음 · 불량 ' + fmt(T.defect)) +
        kp('기획 수량 (PCS)', fmt(T.plan_qty), PT.plan_qty ? '전년 ' + fmt(PT.plan_qty) + ' · ' + sgq(dq(T.plan_qty, PT.plan_qty)) + ' ' + sgr(dr(T.plan_qty, PT.plan_qty)) : sLabel(prevSeason(season)) + ' 자료를 올리면 표시') +
        kp('입고 수량 (PCS)', fmt(T.in_qty), PT.in_qty ? '전년 ' + fmt(PT.in_qty) + ' · ' + sgq(dq(T.in_qty, PT.in_qty)) + ' ' + sgr(dr(T.in_qty, PT.in_qty)) : sLabel(prevSeason(season)) + ' 자료를 올리면 표시');
      body.appendChild(k);
      // ① 브랜드별
      const bn = HS.bsort(Object.keys(S.by)); // 브랜드 차례는 기준정보 › 브랜드 순번 하나로
      const bar = (v, col) => '<span style="display:inline-block;width:70px;height:8px;background:#EEF0F4;border-radius:4px;vertical-align:middle;position:relative;overflow:hidden;margin-right:5px"><i style="position:absolute;left:0;top:0;bottom:0;width:' + Math.min(100, v || 0) + '%;background:' + col + '"></i></span>';
      const inCol = (v) => (v >= 85 ? 'var(--pos)' : v >= 65 ? 'var(--gold)' : 'var(--neg)');
      const QH = '<th class="n" style="background:#EEF4FB">기획 수량</th><th class="n" style="background:#EEF4FB">전년 기획 수량</th><th class="n" style="background:#EEF4FB">기획 증감</th><th class="n" style="background:#EEF4FB">기획 증감률</th>'
        + '<th class="n" style="background:#F3FBF5">입고 수량</th><th class="n" style="background:#F3FBF5">전년 입고 수량</th><th class="n" style="background:#F3FBF5">입고 증감</th><th class="n" style="background:#F3FBF5">입고 증감률</th>';
      const QTD = (x, px) => '<td class="n" data-l="기획 수량" style="background:#F7FAFD"><b>' + fmt(x.plan_qty) + '</b></td><td class="n" data-l="전년 기획 수량" style="background:#F7FAFD">' + (px && px.plan_qty ? fmt(px.plan_qty) : '-') + '</td>'
        + '<td class="n" data-l="기획 증감" style="background:#F7FAFD">' + sgq(dq(x.plan_qty, px && px.plan_qty)) + '</td><td class="n" data-l="기획 증감률" style="background:#F7FAFD">' + sgr(dr(x.plan_qty, px && px.plan_qty)) + '</td>'
        + '<td class="n" data-l="입고 수량" style="background:#F8FCF9"><b>' + fmt(x.in_qty) + '</b></td><td class="n" data-l="전년 입고 수량" style="background:#F8FCF9">' + (px && px.in_qty ? fmt(px.in_qty) : '-') + '</td>'
        + '<td class="n" data-l="입고 증감" style="background:#F8FCF9">' + sgq(dq(x.in_qty, px && px.in_qty)) + '</td><td class="n" data-l="입고 증감률" style="background:#F8FCF9">' + sgr(dr(x.in_qty, px && px.in_qty)) + '</td>';
      const c1 = HS.el('<div class="card"><h3>① 브랜드별 입고 · 출고 · 정리 <small>ST = 품번 수 · 수량 = PCS · 전년 같은 시즌과 나란히 (증감 수량 · 증감률) · 브랜드를 누르면 그 브랜드만</small></h3><div class="tw rt"></div></div>');
      c1.querySelector('.tw').innerHTML = '<table><tr><th>브랜드</th><th class="n">기획 ST</th><th class="n">입고 ST</th><th>입고율</th><th class="n">미입고</th><th class="n">출고 ST</th><th>출고율</th><th class="n">미출고</th><th class="n">미정리</th><th class="n">불량</th><th class="n" style="background:#FBF3D0">전년 기획 ST</th><th class="n" style="background:#FBF3D0">증감률</th>' + QH + '</tr>' +
        bn.map((b) => { const x = S.by[b]; const ir = pc(x.in, x.st), orr = pc(x.out, x.in); const pvb = prevBy[b]; const y = pvb ? (x.st / pvb - 1) * 100 : null; return '<tr class="click" data-b="' + esc(b) + '"><td data-l="브랜드"><b>' + esc(HS.bname(b)) + '</b></td><td class="n" data-l="기획">' + fmt(x.st) + '</td><td class="n" data-l="입고">' + fmt(x.in) + '</td><td data-l="입고율">' + bar(ir, inCol(ir)) + '<b style="color:' + (ir < 85 ? inCol(ir) : 'inherit') + '">' + (ir || 0).toFixed(1) + '%</b></td><td class="n neg" data-l="미입고">' + fmt(x.notin) + '</td><td class="n" data-l="출고">' + fmt(x.out) + '</td><td data-l="출고율">' + bar(orr, 'var(--blue)') + (orr || 0).toFixed(1) + '%</td><td class="n" data-l="미출고">' + fmt(x.notout) + '</td><td class="n" data-l="미정리"' + (x.unclean >= 5 ? ' style="color:var(--gold);font-weight:700"' : '') + '>' + fmt(x.unclean) + '</td><td class="n" data-l="불량">' + fmt(x.defect) + '</td><td class="n" data-l="전년" style="background:#FFFBEE">' + (pvb ? fmt(pvb) : '-') + '</td><td class="n" data-l="증감률" style="background:#FFFBEE">' + (y == null ? (pvb === undefined && prevTot ? '<span class="tag k">신규</span>' : '-') : '<span class="' + (y >= 0 ? 'pos' : 'neg') + '">' + (y >= 0 ? '▲ ' : '▼ ') + Math.abs(y).toFixed(1) + '%</span>') + '</td>' + QTD(x, PS.by[b]) + '</tr>'; }).join('') +
        '<tr class="tot"><td>합계</td><td class="n">' + fmt(T.st) + '</td><td class="n">' + fmt(T.in) + '</td><td>' + (pc(T.in, T.st) || 0).toFixed(1) + '%</td><td class="n">' + fmt(T.notin) + '</td><td class="n">' + fmt(T.out) + '</td><td>' + (pc(T.out, T.in) || 0).toFixed(1) + '%</td><td class="n">' + fmt(T.notout) + '</td><td class="n">' + fmt(T.unclean) + '</td><td class="n">' + fmt(T.defect) + '</td><td class="n">' + (prevTot ? fmt(prevTot) : '-') + '</td><td class="n">' + (yoy == null ? '-' : (yoy >= 0 ? '▲ ' : '▼ ') + Math.abs(yoy).toFixed(1) + '%') + '</td>' + QTD(T, PT) + '</tr></table>' + (brandF ? '<div style="margin-top:8px"><button class="btn sm" id="allb">전체 브랜드 보기</button></div>' : '');
      c1.querySelectorAll('tr[data-b]').forEach((tr) => (tr.onclick = () => HS.go('newprod', { s: season, b: tr.dataset.b })));
      const ab = c1.querySelector('#allb'); if (ab) ab.onclick = () => HS.go('newprod', { s: season });
      body.appendChild(c1);
      const row2 = HS.el('<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:14px;margin-top:14px;align-items:start"></div>'); body.appendChild(row2);
      // ② 전개 주차별
      const W = {}; const nowW = P2.weekTh(today());
      view.forEach((r) => { if ((r.flags || []).indexOf('기획누락') >= 0) return; const d = effDate(r); if (!d) return; const w = P2.weekTh(d); const x = W[w] || (W[w] = { w, d, st: 0, in: 0, out: 0, un: 0 }); if (d < x.d) x.d = d; x.st++; if (r.st_in === '입고') x.in++; if (r.st_out === '출고완료') x.out++; if (r.st_clean === '미정리') x.un++; });
      const wk = Object.values(W).sort((a, b) => (a.d < b.d ? -1 : 1)); const ci = wk.findIndex((x) => x.w === nowW || x.d >= today());
      const wl = wk.slice(Math.max(0, (ci < 0 ? wk.length : ci) - 7), Math.max(0, (ci < 0 ? wk.length : ci) - 7) + 12);
      const mx = Math.max(1, ...wl.map((x) => x.st));
      const c2 = HS.el('<div class="card"><h3>② 전개 주차별 진행 <small>기획 / 입고 / 출고 (ST) · 본사 요청일이 있으면 그 날짜 기준</small></h3><div style="display:flex;align-items:flex-end;gap:8px;height:150px;border-bottom:1px solid var(--line)">' + wl.map((x) => '<div title="' + esc(x.w) + ' · 기획 ' + x.st + ' / 입고 ' + x.in + ' / 출고 ' + x.out + ' / 미정리 ' + x.un + '" style="flex:1;display:flex;align-items:flex-end;gap:2px;' + (x.w === nowW ? 'outline:2px dashed var(--gold);outline-offset:3px;border-radius:4px' : '') + '"><i style="display:block;width:33%;height:' + x.st / mx * 140 + 'px;background:#C9D0DC;border-radius:3px 3px 0 0"></i><i style="display:block;width:33%;height:' + x.in / mx * 140 + 'px;background:var(--pos);border-radius:3px 3px 0 0"></i><i style="display:block;width:33%;height:' + x.out / mx * 140 + 'px;background:var(--blue);border-radius:3px 3px 0 0"></i></div>').join('') + '</div><div style="display:flex;gap:8px;font-size:10.5px;color:var(--mute);margin-top:3px">' + wl.map((x) => '<div style="flex:1;text-align:center' + (x.w === nowW ? ';font-weight:700;color:var(--ink)' : '') + '">' + esc(x.w) + '</div>').join('') + '</div><div class="mute" style="font-size:11.5px;margin-top:6px"><span style="display:inline-block;width:10px;height:10px;background:#C9D0DC"></span> 기획 <span style="display:inline-block;width:10px;height:10px;background:var(--pos);margin-left:8px"></span> 입고 <span style="display:inline-block;width:10px;height:10px;background:var(--blue);margin-left:8px"></span> 출고 · ' + wl.filter((x) => x.st - x.in > 0 && x.d <= addDays(today(), 7)).slice(-3).map((x) => esc(x.w) + ' 미입고 ' + (x.st - x.in)).join(' · ') + '</div></div>');
      row2.appendChild(c2);
      // ②-1 금주 · 차주 상품 입고 계획 (2026-11-23 행님 지시 · 2026-11-24 본사 실제 양식으로 다시 씀)
      //  표가 넓어서(브랜드 · 구분 · ST · 월~금 · 합계 · 대비) 묶음 한 줄을 다 쓰게 둔다 (grid-column)
      const c2b = HS.el('<div class="card" style="grid-column:1/-1"><h3>금주 · 차주 상품 입고 계획 <small id="ipw"></small><span class="sp"></span><span id="ips"></span><span id="ipt"></span></h3><div class="ipb"><div class="empty">불러오는 중…</div></div></div>');
      // ③ 조치 목록
      const inPlan = (r) => (r.flags || []).indexOf('기획누락') < 0;
      const TABS = [['notin', '미입고', (r) => r.st_in === '미입고' && inPlan(r)], ['notout', '입고 후 미출고', (r) => r.st_out === '미출고' && inPlan(r)], ['unclean', '출고 후 미정리', (r) => r.st_clean === '미정리' && r.st_out === '출고완료' && inPlan(r)], ['defect', '불량', (r) => r.defect && inPlan(r)], ['over', '초과 입고', (r) => (r.flags || []).indexOf('초과입고') >= 0], ['noplan', '기획 누락', (r) => (r.flags || []).indexOf('기획누락') >= 0], ['nodate', '전개일 없음', (r) => (r.flags || []).indexOf('전개일없음') >= 0]];
      const cur = p.l && TABS.find((t) => t[0] === p.l) ? p.l : 'notin';
      const c3 = HS.el('<div class="card"><h3>③ 조치 목록 <small>본사 요청일 입력</small></h3></div>');
      const segs = HS.seg(TABS.map(([k2, l, f]) => [k2, l + ' ' + view.filter(f).length]), cur, (l) => HS.go('newprod', Object.assign({}, p, { s: season, l })));
      c3.appendChild(segs);
      const list = view.filter(TABS.find((t) => t[0] === cur)[2]).sort((a, b) => (b.stock || 0) - (a.stock || 0) || ((effDate(a) || '9') < (effDate(b) || '9') ? -1 : 1));
      const canHq = HS.can('newprod', 'edit') || HS.can('newprod', 'create');
      const tw = HS.el('<div class="tw rt" style="max-height:360px;margin-top:8px"></div>');
      tw.innerHTML = '<table><tr><th>브랜드</th><th>품번</th><th class="n">기획</th><th class="n">입고</th><th class="n">출고</th><th class="n">현재고</th><th>전개시기</th><th>본사 요청일</th><th>상태</th></tr>' + list.slice(0, 300).map((r, i) => '<tr><td data-l="브랜드">' + esc(HS.bname(r.brand)) + (r.brand && HS.cache.brandMap[r.brand] && HS.cache.brandMap[r.brand].start_date > addDays(today(), -365) ? ' <span class="tag k">신규 브랜드</span>' : '') + '</td><td data-l="품번"><b>' + esc(r.style) + '</b></td><td class="n" data-l="기획">' + (r.plan_qty == null ? '-' : fmt(r.plan_qty)) + '</td><td class="n" data-l="입고"' + ((r.flags || []).indexOf('초과입고') >= 0 ? ' style="color:var(--neg);font-weight:700"' : '') + '>' + fmt(r.in_qty) + '</td><td class="n" data-l="출고">' + fmt(r.out_qty) + '</td><td class="n" data-l="현재고">' + fmt(r.stock) + '</td><td data-l="전개">' + esc(r.plan_date || '-') + ' <span class="mute">' + esc(r.plan_date ? P2.weekTh(r.plan_date) : '') + '</span></td><td data-l="본사 요청일">' + (canHq ? '<input type="date" class="in" data-hq="' + i + '" value="' + esc(r.hq_date || '') + '" style="width:140px;padding:3px 6px">' : esc(r.hq_date || '')) + '</td><td data-l="상태">' + status(r) + '</td></tr>').join('') + '</table>' + (list.length > 300 ? '<div class="mute">상위 300건만 표시 · 전체는 엑셀로</div>' : '') + (!list.length ? '<div class="empty">해당 품번이 없습니다</div>' : '');
      c3.appendChild(tw);
      const act = HS.el('<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"></div>'); c3.appendChild(act);
      const lx = HS.el('<button class="btn">목록 엑셀</button>'); lx.onclick = () => HS.download('신상품_' + TABS.find((t) => t[0] === cur)[1] + '_' + season + '.xlsx', list.map(xrow), '목록'); act.appendChild(lx);
      tw.querySelectorAll('input[data-hq]').forEach((inp) => (inp.onchange = async () => { const r = list[+inp.dataset.hq]; try { await HS.db.update('erp_np_style', { season, style: r.style }, { hq_date: inp.value || null }); HS.toast(r.style + ' 본사 요청일 저장', 'ok'); } catch (e) { HS.err(e); } }));
      row2.appendChild(c3);
      row2.appendChild(c2b);
      drawInPlan(c2b).catch((e) => { c2b.querySelector('.ipb').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
      xb.onclick = () => HS.download('신상품현황_' + season + '.xlsx', view.map(xrow), sLabel(season));
      // 카톡용 한 장 요약 — 화면에 떠 있는 값 그대로 (브랜드를 고른 상태면 그 브랜드만)
      kb.onclick = () => kakaoCard({ season, brandF, T, by: S.by, bn, prevTot, yoy, PT, m }).catch(HS.err);
    },
  });
  // ---------- 금주 · 차주 상품 입고 계획 (2026-11-23 지시 · 2026-11-24 본사 실제 양식으로 다시 씀) ----------
  //  본사 파일: '금주차주 입고스케줄NNNN.xlsx' — 시트 4개 (의류 · 용품 × 금주 · 차주)
  //   · 머리글은 둘째 줄 [브랜드 · 순번 · 입고전개시기 · STYLE · 업체 · 전개시기 · 월 화 수 목 금 · 입고구분 · 시즌]
  //   · ⚠ 날짜는 머리글 바로 아래 줄의 요일 칸 값 (엑셀 일련번호) — 칸 이름에는 날짜가 없다
  //   · ⚠ 브랜드는 묶인 칸이라 첫 줄에만 적혀 있다 → 윗줄 값을 이어받는다
  //   · ⚠ 브랜드 소계(STYLE 빈칸 2줄 · 위=ST개수 아래=수량)와 맨 아래 총계(브랜드='총계' · STYLE 칸에 ST 개수)는 뺀다
  //   · 금주 · 차주는 시트 이름으로 가린다 (이름에 없으면 날짜로 이번 주 · 다음 주를 따진다)
  //  저장은 erp_np_raw(kind='inplan') 한 줄 — DB 표를 새로 만들지 않음
  //  ⚠ 단가 · 금액 칸은 읽지 않는다 (브랜드 · 날짜 · 품번 · 수량만 저장)
  const IP_KIND = 'inplan';
  const IPWD = ['일', '월', '화', '수', '목', '금', '토'];
  const ipNum = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[,\s]/g, '')); return isFinite(n) ? n : 0; };
  const ipTx = (v) => String(v == null ? '' : v).trim();
  const ipDate = (v) => {
    if (v == null || v === '') return '';
    if (typeof v === 'number') { if (v > 19000101 && v < 21001231) { const s = String(Math.round(v)); return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); }
      if (v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30 + Math.floor(v))); return d.toISOString().slice(0, 10); } return ''; }
    const t = ipTx(v); const p2 = (n) => String(n).padStart(2, '0');
    let m = t.match(/(20\d\d)[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/); if (m) return m[1] + '-' + p2(m[2]) + '-' + p2(m[3]);
    m = t.match(/^(20\d\d)(\d\d)(\d\d)$/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
    return '';
  };
  // ⚠ 날짜는 UTC 로만 계산한다 (한국 시간으로 만들면 toISOString 이 하루 밀린다)
  const ipAdd = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const ipMon = (s) => ipAdd(s, -((new Date(s + 'T00:00:00Z').getUTCDay() + 6) % 7));
  const ipMd = (s) => (s ? +s.slice(5, 7) + '/' + +s.slice(8, 10) : '');
  const ipWd = (s) => IPWD[new Date(s + 'T00:00:00Z').getUTCDay()];
  // 시트 하나 읽기 → { w:'cur'|'next', g:'의류'|'용품', days:[날짜…], list:[{b,d,sty,qty,k,se}…] }
  function ipSheet(name, rows) {
    let hi = -1;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const t = (rows[i] || []).map((c) => ipTx(c).replace(/\s+/g, '').toUpperCase());
      if (t.indexOf('브랜드') >= 0 && (t.indexOf('STYLE') >= 0 || t.indexOf('품번') >= 0)) { hi = i; break; }
    }
    if (hi < 0) return null;
    const H = (rows[hi] || []).map((c) => ipTx(c).replace(/\s+/g, ''));
    const ix = {};
    H.forEach((t, c) => {
      if (/^브랜드$/.test(t) && ix.b == null) ix.b = c;
      if ((/^STYLE$/i.test(t) || /^품번$/.test(t)) && ix.sty == null) ix.sty = c;
      if (/^입고구분$/.test(t) && ix.k == null) ix.k = c;
      if (/^시즌$/.test(t) && ix.se == null) ix.se = c;
    });
    if (ix.b == null || ix.sty == null) return null;
    // 요일 칸 → 바로 아래 줄의 날짜
    const dc = [];
    H.forEach((t, c) => { if (/^[월화수목금토일]$/.test(t)) { const d = ipDate((rows[hi + 1] || [])[c]); if (d) dc.push({ c, d }); } });
    if (!dc.length) return null;
    const list = []; let lastB = '';
    for (let r = hi + 2; r < rows.length; r++) {
      const x = rows[r]; if (!x) continue;
      const bRaw = ipTx(x[ix.b]);
      if (/^(총계|합계|소계)$/.test(bRaw)) break; // 맨 아래 총계 줄 — 여기서 그만
      if (bRaw) lastB = bRaw;
      const sty = ipTx(x[ix.sty]).toUpperCase();
      // 소계 줄은 STYLE 이 비어 있고, 총계 줄은 STYLE 칸에 ST 개수(숫자)가 들어 있다 → 글자가 섞인 것만 품번으로 본다
      if (!sty || !/[A-Z]/.test(sty)) continue;
      const b = (HS.brandOf ? HS.brandOf(lastB) || lastB : lastB) || '(미확인)';
      dc.forEach((d) => { const q = ipNum(x[d.c]); if (!q) return;
        list.push({ b, d: d.d, sty, qty: q, k: ix.k == null ? '' : ipTx(x[ix.k]), se: ix.se == null ? '' : ipTx(x[ix.se]) }); });
    }
    if (!list.length && !dc.length) return null;
    const nm = String(name || '');
    const mon0 = ipMon(dc[0].d); const thisMon = ipMon(today());
    const w = /차주/.test(nm) ? 'next' : /금주/.test(nm) ? 'cur' : (mon0 === thisMon ? 'cur' : mon0 === ipAdd(thisMon, 7) ? 'next' : '');
    return { name: nm, w, g: /용품/.test(nm) ? '용품' : '의류', days: dc.map((d) => d.d), list };
  }
  // 파일 하나 읽기 → { sheets:[…], list:[…] }  (w 를 못 가린 시트는 뺀다)
  function ipRead(wb) {
    const sheets = []; const list = [];
    wb.SheetNames.forEach((n) => {
      const s = ipSheet(n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, blankrows: false }));
      if (!s) return;
      sheets.push({ name: s.name, w: s.w, g: s.g, days: s.days, n: s.list.length, qty: s.list.reduce((a, x) => a + x.qty, 0) });
      if (!s.w) return;
      s.list.forEach((x) => list.push({ w: s.w, g: s.g, b: x.b, d: x.d, sty: x.sty, qty: x.qty, k: x.k, se: x.se }));
    });
    return { sheets, list };
  }
  let IPV = 'both'; // 금주 · 차주 · 같이 보기 (보는 사람 화면에만)
  const IPVS = [['cur', '금주'], ['next', '차주'], ['both', '같이 보기']];
  const GRPS = ['의류', '용품'];
  // 한 주 표 그리기 — 브랜드 세로 · 월~금 가로 (본사 엑셀과 같은 모양)
  function ipTable(ttl, rows, other) {
    const days = [...new Set(rows.map((x) => x.d))].sort();
    if (!days.length) return '<div class="empty">' + esc(ttl) + ' 에 들어올 계획이 없습니다</div>';
    const mon = ipMon(days[0]);
    const cols = [...new Set([0, 1, 2, 3, 4].map((i) => ipAdd(mon, i)).concat(days))].sort();
    const sum = (ls) => ls.reduce((a, x) => a + x.qty, 0);
    const dayOf = (ls, d) => sum(ls.filter((x) => x.d === d));
    const brs = HS.bsort([...new Set(rows.map((x) => x.b))]);
    const oSum = (f) => (other ? sum(other.filter(f)) : null);
    const diff = (v, o) => (o == null ? '' : v - o === 0 ? '<span class="mute">-</span>' : '<span style="color:var(--' + (v > o ? 'pos' : 'neg') + ')">' + (v > o ? '▲ ' : '▼ ') + fmt(Math.abs(v - o)) + '</span>');
    const q = (v) => (v ? fmt(v) : '');
    let h = '<div class="tw no-tools" style="margin-top:8px"><table class="no-no"><thead>'
      + '<tr><th rowspan="2">브랜드</th><th rowspan="2">구분</th><th rowspan="2" class="n">ST</th>'
      + '<th colspan="' + cols.length + '">' + esc(ttl) + '</th><th rowspan="2" class="n">합계</th>'
      + (other ? '<th rowspan="2" class="n">금주 대비</th>' : '') + '</tr><tr>'
      + cols.map((d) => '<th class="n">' + ipMd(d) + '<br><span class="mute" style="font-weight:400">' + ipWd(d) + '</span></th>').join('')
      + '</tr></thead><tbody>';
    brs.forEach((b) => {
      const mine = rows.filter((x) => x.b === b);
      const gs = GRPS.filter((g) => mine.some((x) => x.g === g));
      gs.forEach((g) => {
        const ls = mine.filter((x) => x.g === g); const t = sum(ls);
        h += '<tr><td data-l="브랜드"><b>' + esc(HS.bname(b) || b) + '</b></td><td data-l="구분" class="c">' + esc(g) + '</td><td class="n" data-l="ST">' + fmt(ls.length) + '</td>'
          + cols.map((d) => '<td class="n">' + q(dayOf(ls, d)) + '</td>').join('')
          + '<td class="n"><b>' + fmt(t) + '</b></td>' + (other ? '<td class="n">' + diff(t, oSum((x) => x.b === b && x.g === g)) + '</td>' : '') + '</tr>';
      });
      if (gs.length > 1) {
        const t = sum(mine);
        h += '<tr class="tot"><td colspan="2">' + esc(HS.bname(b) || b) + ' 소계</td><td class="n">' + fmt(mine.length) + '</td>'
          + cols.map((d) => '<td class="n">' + q(dayOf(mine, d)) + '</td>').join('')
          + '<td class="n">' + fmt(t) + '</td>' + (other ? '<td class="n">' + diff(t, oSum((x) => x.b === b)) + '</td>' : '') + '</tr>';
      }
    });
    const tt = sum(rows);
    h += '</tbody><tfoot><tr class="tot"><td colspan="2">합계</td><td class="n">' + fmt(rows.length) + '</td>'
      + cols.map((d) => '<td class="n">' + q(dayOf(rows, d)) + '</td>').join('')
      + '<td class="n">' + fmt(tt) + '</td>' + (other ? '<td class="n">' + diff(tt, oSum(() => true)) + '</td>' : '') + '</tr></tfoot></table></div>';
    return h;
  }
  async function drawInPlan(card) {
    const ed = HS.can('newprod', 'create');
    const row = (await HS.db.list('erp_np_raw', { eq: { kind: IP_KIND } }).catch(() => []))[0];
    const all = ((row && row.rows) || []).filter((x) => x && x.d && x.qty);
    const cur = all.filter((x) => x.w === 'cur'), next = all.filter((x) => x.w === 'next');
    const rng = (ls) => { const d = [...new Set(ls.map((x) => x.d))].sort(); return d.length ? ipMd(ipMon(d[0])) + ' ~ ' + ipMd(ipAdd(ipMon(d[0]), 4)) : ''; };
    card.querySelector('#ipw').textContent = (cur.length ? '금주 ' + rng(cur) + ' · ' : '') + (next.length ? '차주 ' + rng(next) : '')
      + (row && row.file ? ' · ' + row.file : '');
    // 보기 고르기
    const sg = card.querySelector('#ips'); sg.innerHTML = '';
    sg.appendChild(HS.seg(IPVS, IPV, (v) => { IPV = v; drawInPlan(card).catch(HS.err); }));
    // 엑셀 올리기
    if (ed) {
      const w = HS.el('<span><button class="btn sm p" id="ipup">엑셀 올리기</button><input type="file" accept=".xlsx,.xlsm,.xls,.csv" class="hide"></span>');
      card.querySelector('#ipt').innerHTML = ''; card.querySelector('#ipt').appendChild(w);
      const fi = w.querySelector('input'); w.querySelector('#ipup').onclick = () => fi.click();
      fi.onchange = async () => {
        const f = fi.files[0]; fi.value = ''; if (!f) return;
        try {
          await HS.xlsx();
          const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array', cellFormula: false, cellHTML: false, cellText: false });
          const R = ipRead(wb);
          if (!R.list.length) throw new Error('입고스케줄 시트를 찾지 못했습니다 · 머리줄에 [브랜드] [STYLE] 과 [월 화 수 목 금] 칸이, 그 아래 줄에 날짜가 있어야 합니다');
          const skip = R.sheets.filter((s) => !s.w);
          const pre = '<div style="line-height:1.9"><b>' + esc(f.name) + '</b> · 시트 ' + R.sheets.length + '개를 읽었습니다<br>'
            + R.sheets.filter((s) => s.w).map((s) => '· ' + esc(s.name) + ' — ' + ipMd(s.days[0]) + ' ~ ' + ipMd(s.days[s.days.length - 1]) + ' · 품번 ' + fmt(s.n) + '줄 · <b>' + fmt(s.qty) + '장</b>').join('<br>')
            + (skip.length ? '<br><span class="neg">금주 · 차주를 가리지 못한 시트 ' + skip.length + '개는 뺐습니다 (' + esc(skip.map((s) => s.name).join(' · ')) + ')</span>' : '')
            + '<br><span class="mute">브랜드 소계 · 총계 줄은 읽지 않았습니다 (합계는 화면이 다시 계산합니다) · 단가 · 금액 칸은 읽지 않습니다</span>'
            + '<br><span class="mute">올리면 먼저 올린 계획은 이 파일로 바뀝니다</span></div>';
          if (!(await HS.modal('금주 · 차주 상품 입고 계획', pre, [['취소', null], ['올리기', true, 'p']], { wide: true }))) return;
          await HS.db.upsert('erp_np_raw', [{ kind: IP_KIND, file: f.name, n: R.list.length, rows: R.list, by_name: HS.me.name, at: new Date().toISOString() }]);
          HS.toast('입고 계획 ' + fmt(R.list.length) + '줄 · ' + fmt(R.list.reduce((a, x) => a + x.qty, 0)) + '장 올렸습니다', 'ok'); HS.route();
        } catch (e) { HS.err(e); }
      };
    }
    const body = card.querySelector('.ipb');
    if (!all.length) { body.innerHTML = '<div class="empty">올린 입고 계획이 없습니다' + (ed ? ' · [엑셀 올리기]로 본사 입고스케줄을 올리세요' : '') + '</div>'; return; }
    const tq = (ls) => ls.reduce((a, x) => a + x.qty, 0);
    const kp = [['금주 입고 계획', fmt(tq(cur)) + '장'], ['금주 ST', fmt(cur.length)], ['차주 입고 계획', fmt(tq(next)) + '장'], ['차주 ST', fmt(next.length)],
      ['차주 ↔ 금주', (tq(next) - tq(cur) === 0 ? '-' : '<span style="color:var(--' + (tq(next) > tq(cur) ? 'pos' : 'neg') + ')">' + (tq(next) > tq(cur) ? '▲ ' : '▼ ') + fmt(Math.abs(tq(next) - tq(cur))) + '</span>')]];
    let h = '<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px">'
      + kp.map(([l, v]) => '<div class="card kpi" style="margin:0"><div class="l">' + l + '</div><div class="v">' + v + '</div></div>').join('') + '</div>';
    if (IPV === 'cur' || IPV === 'both') h += ipTable('금주 (' + rng(cur) + ')', cur, null);
    if (IPV === 'next' || IPV === 'both') h += ipTable('차주 (' + rng(next) + ')', next, cur.length ? cur : null);
    h += '<div class="mute" style="font-size:11.5px;margin-top:6px">· 브랜드 차례는 [설정 › 기준정보 › 브랜드] 순번대로 · ST 는 그 주에 들어올 품번 수 · 본사 엑셀의 소계 · 총계 줄은 읽지 않습니다</div>';
    body.innerHTML = h;
  }

  // ---------- 카톡용 한 장 요약 이미지 ----------
  //  화면 오른쪽 위 [📷 카톡용 이미지] → 세로 카드를 그려 HS.snap 으로 사진을 만든다 (미리보기 → 복사 · 저장 · 공유)
  async function kakaoCard(K) {
    const T = K.T; const pc2 = (a, b) => (b ? (a / b * 100) : 0);
    const inR = pc2(T.in, T.st), outR = pc2(T.out, T.in);
    const col = (v) => (v >= 95 ? '#2F7A43' : v >= 80 ? '#C9A227' : '#B4442F');
    const bar = (v) => '<span class="kbar"><i style="width:' + Math.max(2, Math.min(100, v)) + '%;background:' + col(v) + '"></i></span>';
    const kc = (l, v, s, cls) => '<div' + (cls ? ' class="' + cls + '"' : '') + '><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="c mute">' + s + '</div></div>';
    const rows = (K.bn || []).map((b) => { const x = K.by[b] || {}; const ir = pc2(x.in, x.st);
      return '<tr><td>' + esc(HS.bname(b)) + '</td><td class="n">' + fmt(x.st) + '</td><td class="n">' + bar(ir) + '<b style="color:' + col(ir) + '">' + ir.toFixed(1) + '%</b></td><td class="n' + (x.notin ? ' nin' : '') + '">' + (x.notin ? fmt(x.notin) : '-') + '</td><td class="n' + (x.unclean ? ' nun' : '') + '">' + (x.unclean ? fmt(x.unclean) : '-') + '</td></tr>'; }).join('');
    const ttl = sLabel(K.season) + ' 신상품 현황' + (K.brandF ? ' · ' + HS.bname(K.brandF) : '');
    const upd = K.m && K.m.at ? ' · 자료 ' + new Date(K.m.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const yoy = K.yoy == null ? '' : '전년 대비 <b class="' + (K.yoy >= 0 ? 'up' : 'dn') + '">' + (K.yoy >= 0 ? '▲ ' : '▼ ') + Math.abs(K.yoy).toFixed(1) + '%</b> (' + sLabel(prevSeason(K.season)) + ' 기획 ' + fmt(K.prevTot) + ' ST)'
      + (K.PT && K.PT.plan_qty ? ' · 기획 수량 ' + fmt(T.plan_qty) + ' ↔ 전년 ' + fmt(K.PT.plan_qty) : '') + '<br>';
    const html = '<div class="rep-k rep-np"><div class="hd"><div class="s">혜성물류 · 신상품 입고 · 출고 · 정리</div><div class="t">' + esc(ttl) + '</div><div class="d">' + esc(today().slice(5).replace('-', '/')) + ' 기준' + esc(upd) + '</div></div>'
      + '<div class="big">'
      + kc('기획 품번', fmt(T.st) + ' <small>ST</small>', fmt(T.plan_qty) + ' PCS')
      + kc('입고', '<span class="ok">' + fmt(T.in) + '</span>', '입고율 ' + inR.toFixed(1) + '%', 'g')
      + kc('미입고', '<span class="bad">' + fmt(T.notin) + '</span>', pc2(T.notin, T.st).toFixed(1) + '%', 'r')
      + kc('출고 완료', '<span class="ok">' + fmt(T.out) + '</span>', '출고율 ' + outR.toFixed(1) + '%', 'g')
      + kc('입고 후 미출고', '<span class="warn">' + fmt(T.notout) + '</span>', pc2(T.notout, T.in).toFixed(1) + '%', 'y')
      + kc('출고 후 미정리', '<span class="warn">' + fmt(T.unclean) + '</span>', '불량 ' + fmt(T.defect), 'y')
      + '</div>'
      + '<h4>브랜드별 (' + (K.bn || []).length + '개)</h4>'
      + '<table><tr><th style="text-align:left">브랜드</th><th>기획 ST</th><th>입고율</th><th>미입고</th><th>미정리</th></tr>' + rows
      + '<tr class="sum"><td>합계</td><td class="n">' + fmt(T.st) + '</td><td class="n">' + inR.toFixed(1) + '%</td><td class="n">' + fmt(T.notin) + '</td><td class="n">' + fmt(T.unclean) + '</td></tr></table>'
      + '<div class="foot">' + yoy + '브랜드 차례는 설정 › 기준정보 › 브랜드 순번 · 혜성물류 회의자료</div></div>';
    const host = HS.el('<div style="position:fixed;left:-12000px;top:0;z-index:-1"></div>'); host.innerHTML = html; document.body.appendChild(host);
    try { await HS.snap(host.firstElementChild, '신상품현황_' + K.season + (K.brandF ? '_' + K.brandF : '') + '_' + today().replace(/-/g, '')); } finally { host.remove(); }
  }
  function status(r) {
    if (r.st_in === '미입고') return '<span class="tag r">미입고</span>';
    const t = [];
    if (r.st_out === '미출고') t.push('<span class="tag r">미출고</span>'); else t.push('<span class="tag b">출고완료</span>');
    if (r.st_clean === '미정리') t.push('<span class="tag y">미정리</span>'); else if (r.st_clean === '전량출고') t.push('<span class="tag g">전량출고</span>'); else t.push('<span class="tag g">정리완료</span>');
    (r.flags || []).forEach((f) => t.push('<span class="tag">' + esc(f) + '</span>'));
    if (r.defect) t.push('<span class="tag r">불량</span>');
    return t.join(' ');
  }
  const xrow = (r) => ({ 브랜드: HS.bname(r.brand), 품번: r.style, 시즌: r.scode, 아이템군: r.item, 색상수: r.colors, 기획량: r.plan_qty, 전개시기: r.plan_date, 전개주차: r.plan_date ? P2.weekTh(r.plan_date) : '', 본사요청일: r.hq_date, 입고수량: r.in_qty, 최초입고일: r.in_date, 출고수량: r.out_qty, 현재고: r.stock, 로케이션재고: r.stock_loc, 입고: r.st_in, 출고: r.st_out, 정리: r.st_clean, 불량: r.defect ? 'Y' : '', 표시: (r.flags || []).join(',') });

  // ---------- 자료 업데이트 (① 신상품 정보 ② 입고 현황 ③ 출고 현황 — 칸마다 그 자료만) ----------
  const SLOTS = [
    { k: 'plan', no: 1, l: '신상품 정보', src: '화주 ERP', tag: 'b', path: '상품기획관리 › 품번정보현황', cols: '브랜드 · 구분 · 기획년도 · 시즌 · 아이템군 · 품번 · 색상 · 세트구분 · 출고예정일 · 기획량', cyc: '주 1회 + 변경 시', more: '사용여부 Y만 · 세트구분은 보기만 (계산 무시) · 맨 아래 합계 줄은 자동으로 뺌' },
    { k: 'inbound', no: 2, l: '입고 현황', src: 'WMS', tag: 'y', path: '입고반품 현황', cols: '브랜드 · 일자 · 입고구분 · 기획년도 · 시즌 · 아이템군 · 품번 · 색상 · 입고수량 · 등록일자', cyc: '매일 17~18시', more: '입고구분 "입고"는 더하고 "반품"은 수량에서 빼기 · 입고일 = 일자 · <b>시즌 시작일부터</b> 받기 권장' },
    { k: 'defect', no: '', l: '불량 상품', src: '선택', tag: 'b', small: true, cols: '품번 · 회수일자 · 전산처리방법', cyc: '있을 때' },
  ];
  const KINDS = ['plan', 'inbound', 'stock', 'out', 'defect'];
  const when = (t) => (t ? new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '없음');
  async function readFiles(files, only) {
    const data = { plan: [], inbound: [], stock: [], out: [], defect: [], found: [], miss: [], names: [], raw: { plan: [], inbound: [], defect: [] } };
    for (const f of files) {
      try {
        HS.needXlsx(); const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array', cellFormula: false, cellHTML: false, cellText: false });
        const d = P2.readNpFiles(wb.SheetNames.map((n) => ({ name: n, ws: wb.Sheets[n] })), only);
        KINDS.forEach((k) => data[k].push(...d[k])); for (const k in d.raw) data.raw[k].push(...d.raw[k]);
        d.found.forEach((x) => data.found.push(Object.assign({ file: f.name }, x)));
        if (!d.found.length) data.miss.push(Object.assign({ file: f.name }, d.miss.sort((x, y) => x.miss.length - y.miss.length)[0] || { sheet: '-', miss: [], cols: [] }));
        else data.names.push(f.name);
      } catch (e) { data.miss.push({ file: f.name, sheet: '-', err: '파일을 열 수 없습니다 (' + e.message + ')', miss: [], cols: [] }); }
    }
    return data;
  }
  // ③ 재고 현황: 전산자료 WMS 정상창고 상세 → 신상품 계산용
  async function wmsStock() { const L = HS.csParts ? await HS.csParts('wms', '정상창고') : []; return L.map((x) => ({ style: x[1], color: x[2], loc: x[4], out: +x[6] || 0, stock: +x[5] || 0 })); }
  function autoCard() {
    const el = HS.el('<div class="slot auto"><h4><span class="no">3</span>재고 현황 <span class="tag y">WMS</span> <span class="tag g">자동</span></h4><div style="font-size:12px;margin:-2px 0 4px">전산자료 › WMS 재고 현황 (정상창고만)</div><div class="dz2 auto">불러오는 중…</div><div class="cols">쓰는 칸: 기획년도 · 시즌 · 아이템군 · 위치정보 · 품번 · 색상 · 출고 · 현재고 · 미래발생분 · 누적재고 · 브랜드 · <a href="#/cs?k=wms&t=정상창고">WMS 재고 현황 가기</a></div></div>');
    (async () => { const P = await HS.db.list('erp_cs_part', { eq: { kind: 'wms', sub: '정상창고' }, select: 'brand,stat,at' }).catch(() => []); const td = today();
      const B = {}; P.forEach((x) => { const n = (x.stat && x.stat.name) || x.brand; if (!B[n] || x.at < B[n]) B[n] = x.at; });
      const last = Object.values(B).sort().pop(); const old = Object.entries(B).filter(([, at]) => HS.ymd(new Date(at)) !== td).map(([n]) => HS.bname(n));
      el.querySelector('.dz2').innerHTML = P.length ? '🔗 <b>따로 올리지 않습니다</b><br>정상창고 ' + esc(when(last)) + ' 기준 · ' + Object.keys(B).length + '개 브랜드<br><span style="font-size:11.5px">한 번 올리면 → 전산자료 재고 + 신상품 출고 · 정리 둘 다</span>' + (old.length ? '<br><span class="wa3" style="font-size:11.5px">⚠ 오늘 안 올린 브랜드: ' + esc(old.join(', ')) + '</span>' : '') : '⚠ 전산자료 WMS 재고 현황이 아직 없습니다<br><a href="#/cs?k=wms&t=정상창고">WMS 재고 올리기</a>'; })();
    return el;
  }
  // 올린 자료 보기: 최근 파일 원본 (① 신상품 정보 ② 입고 현황 ③ 재고 현황 · 불량)
  function rawView() {
    const C = P2.NP_RAW_COLS; const TAB = [['plan', '① 신상품 정보'], ['inbound', '② 입고 현황'], ['stock', '③ 재고 현황'], ['defect', '불량 상품']];
    const STC = ['기획년도', '시즌', '아이템군', '위치정보', '품번', '색상', '출고', '현재고', '미래발생분', '누적재고', '브랜드'];
    const el = HS.el('<div class="card" style="margin-top:14px"><h3>올린 자료 보기 <small>가장 최근 파일 그대로 · 표 설정 · 엑셀 (최대 500줄 표시 · 엑셀은 전체)</small><span class="sp"></span><span id="rvt"></span></h3><div id="rvb"><div class="empty">불러오는 중…</div></div></div>');
    let cur = 'plan'; const cache = {};
    const load = async (k) => {
      if (cache[k]) return cache[k];
      if (k === 'stock') { const st = new Set((await HS.db.list('erp_np_style', { select: 'style' }).catch(() => [])).map((r) => r.style)); const L = HS.csParts ? await HS.csParts('wms', '정상창고') : [];
        const rows = L.filter((x) => st.has(x[1])).map((x) => [...(window.HSStyle ? HSStyle.fill(x[1], x[8], x[9], x[10]) : [x[8] || '', x[9] || '', x[10] || '']), x[4], x[1], x[2], +x[6] || 0, +x[5] || 0, +x[7] || 0, (+x[5] || 0) - (+x[7] || 0), HS.bname(HS.brandOf(x[0]) || x[0])]);
        return (cache[k] = { cols: STC, rows, file: '전산자료 WMS 정상창고 (신상품 품번만)', n: rows.length }); }
      const r = (await HS.db.list('erp_np_raw', { eq: { kind: k } }).catch(() => []))[0];
      const cols = C[k].map((c) => c[0]); const bi = cols.indexOf('브랜드'); const ui = cols.indexOf('사용여부');
      let rows = r ? r.rows || [] : []; if (ui >= 0) rows = rows.filter((x) => !/^N/i.test(String(x[ui] || ''))); // 사용여부 Y만
      if (bi >= 0) rows = rows.map((x) => { const y = x.slice(); y[bi] = HS.bname(HS.brandOf(y[bi]) || y[bi]); return y; });
      { const si = cols.indexOf('품번'), yi = cols.indexOf('기획년도'), ei = cols.indexOf('시즌'), gi = cols.indexOf('아이템군'); if (window.HSStyle && si >= 0 && (yi >= 0 || ei >= 0 || gi >= 0)) rows = rows.map((x) => { if ((yi < 0 || x[yi]) && (ei < 0 || x[ei]) && (gi < 0 || x[gi])) return x; const y = x.slice(); const f = HSStyle.fill(y[si], yi >= 0 ? y[yi] : 'x', ei >= 0 ? y[ei] : 'x', gi >= 0 ? y[gi] : 'x'); if (yi >= 0) y[yi] = f[0]; if (ei >= 0) y[ei] = f[1]; if (gi >= 0) y[gi] = f[2]; return y; }); } // 빈칸만 품번으로
      const outCols = ui >= 0 ? cols.filter((c, i) => i !== ui) : cols; if (ui >= 0) rows = rows.map((x) => x.filter((v, i) => i !== ui));
      return (cache[k] = { cols: outCols, rows, file: r ? r.file + ' · ' + when(r.at) + ' · ' + (r.by_name || '') : '', n: rows.length });
    };
    const draw = async () => {
      const b = el.querySelector('#rvb'); b.innerHTML = '<div class="empty">불러오는 중…</div>'; const d = await load(cur);
      el.querySelector('#rvt').innerHTML = ''; el.querySelector('#rvt').appendChild(HS.seg(TAB.map(([k, l]) => [k, l + (cache[k] ? ' ' + fmt(cache[k].n) : '')]), cur, (x) => { cur = x; draw(); }));
      if (!d.rows.length) { b.innerHTML = '<div class="empty">' + (cur === 'stock' ? '전산자료 WMS 정상창고에 이번 신상품 품번이 없습니다' : '아직 올린 파일이 없습니다') + '</div>'; return; }
      const num = (c) => /수량|기획량|출고|현재고|미래|누적/.test(c);
      b.innerHTML = '<div class="mute" style="font-size:12px;margin-bottom:6px">' + esc(d.file) + ' · ' + fmt(d.n) + '줄 <a href="javascript:void 0" id="rvx" style="margin-left:8px">엑셀 받기</a></div><div class="tw" style="max-height:520px;overflow:auto"><table><tr>' + d.cols.map((c) => '<th' + (num(c) ? ' class="n"' : '') + '>' + esc(c) + '</th>').join('') + '</tr>' + d.rows.slice(0, 500).map((x) => '<tr>' + x.map((v, i) => '<td' + (num(d.cols[i]) ? ' class="n"' : '') + '>' + esc(typeof v === 'number' ? fmt(v) : v) + '</td>').join('') + '</tr>').join('') + '</table></div>';
      b.querySelector('#rvx').onclick = () => HS.download('신상품_' + TAB.find((t) => t[0] === cur)[1].replace(/[①②③ ]/g, '') + '_' + today() + '.xlsx', d.rows.map((x) => Object.fromEntries(d.cols.map((c, i) => [c, x[i]]))), '자료');
    };
    draw(); HS.npRawShow = (k) => { cur = k; draw(); el.scrollIntoView({ behavior: 'smooth' }); };
    return el;
  }
  async function updateView(body, p, tools, season0, meta) {
    if (!HS.can('newprod', 'create')) { body.innerHTML = '<div class="card empty">자료 업데이트 권한이 없습니다</div>'; return; }
    const back = HS.el('<button class="btn">← 현황으로</button>'); back.onclick = () => HS.go('newprod', { s: season0 }); tools.appendChild(back);
    const m = meta[season0] || {}; const parts = m.parts || {};
    const got = {}; // 칸별 읽은 자료
    body.innerHTML = '';
    const grid = HS.el('<div class="np3"></div>'); body.appendChild(grid);
    const warnBox = HS.el('<div></div>'); body.appendChild(warnBox);
    const res = HS.el('<div class="card" style="margin-top:14px"><h3>미리보기 <small>파일을 올리면 여기서 확인 후 등록합니다</small></h3><div id="pv"><div class="empty">위 칸에 파일을 올려 주세요. 일부만 올리면 나머지는 지난 자료를 그대로 씁니다.</div></div></div>'); body.appendChild(res);
    const pvEl = res.querySelector('#pv');
    const drawSlot = (sl) => {
      const el = grid.querySelector('[data-slot="' + sl.k + '"]'); const g = got[sl.k]; const last = parts[sl.k] || (m.at ? { at: m.at, by: m.by } : null);
      let st = '<div class="dz2">파일을 끌어다 놓거나 눌러서 선택<br><span class="mute">다운로드한 파일을 수정 없이 그대로</span></div>';
      if (g && g.busy) st = '<div class="dz2">읽는 중…</div>';
      else if (g && g.found.length) st = '<div class="dz2 ok">' + g.found.map((x) => '✔ <b>' + esc(x.file) + '</b><br>' + esc(x.label) + ' · ' + fmt(x.rows) + '줄' + (x.qty != null ? ' · ' + fmt(x.qty) + 'PCS' : '')).join('<br>') + (g.miss.length ? '<div style="margin-top:6px;color:var(--neg)">✖ 제외: ' + g.miss.map((x) => esc(x.file)).join(', ') + '</div>' : '') + '</div>';
      else if (g && g.miss.length) st = '<div class="dz2 bad">' + g.miss.map((x) => '✖ <b>' + esc(x.file) + '</b><br>' + (x.err ? esc(x.err) : sl.l + ' 파일이 아닙니다<br><span class="mute">' + (x.miss.length ? '\'' + esc(x.miss.join('\', \'')) + '\' 열을 찾지 못했습니다' : '자료 줄을 찾지 못했습니다') + (x.cols && x.cols.length ? ' (찾은 열: ' + esc(x.cols.join(' · ')) + ' …)' : '') + '</span>')).join('<br>') + '</div>';
      el.innerHTML = '<h4>' + (sl.no ? '<span class="no">' + sl.no + '</span>' : '') + sl.l + ' <span class="tag ' + sl.tag + '">' + sl.src + '</span></h4>' + (sl.path ? '<div style="font-size:12px;margin:-2px 0 4px">' + sl.path + '</div>' : '') + st + '<div class="cols">' + (sl.small ? '' : '꼭 있어야 할 열: <b>' + sl.cols + '</b> ') + HS.fmtLink('np_' + sl.k, '양식') + (sl.small ? '' : '<br>주기: ' + sl.cyc + (sl.more ? '<br>' + sl.more : '')) + '</div><div class="stl"><span class="mute">지난 업데이트</span><span>' + esc(last ? when(last.at) : '없음') + '</span></div><div style="display:flex;gap:6px"><button class="btn sm' + (g && g.found.length ? '' : ' p') + '" data-pick>' + (g && g.found.length ? '다른 파일로 바꾸기' : '파일 선택') + '</button>' + (g ? '<button class="btn sm" data-clr>비우기</button>' : '') + '</div><input type="file" multiple accept=".xlsx,.xlsm,.xls,.csv" class="hide">';
      if (sl.small) { const lk = HS.el('<div style="font-size:12px"><span class="mute" data-dn>…</span> · <a href="javascript:void 0">자세히 보기 ›</a></div>'); lk.querySelector('a').onclick = () => HS.npRawShow && HS.npRawShow('defect'); el.insertBefore(lk, el.querySelector('.cols')); HS.db.list('erp_np_raw', { eq: { kind: 'defect' } }).then((r) => { const x = r[0]; lk.querySelector('[data-dn]').textContent = x ? '최근 ' + fmt(x.n) + '건 · ' + fmt((x.rows || []).reduce((t, y) => t + (+y[4] || 0), 0)) + ' PCS' : '아직 없음'; }).catch(() => {}); }
      const fi = el.querySelector('input'); el.querySelector('[data-pick]').onclick = () => fi.click(); fi.onchange = () => load(sl, [...fi.files]);
      const dz = el.querySelector('.dz2'); dz.onclick = () => fi.click();
      const cl = el.querySelector('[data-clr]'); if (cl) cl.onclick = () => { delete got[sl.k]; drawSlot(sl); refresh(); };
      el.ondragover = (e) => { e.preventDefault(); el.classList.add('over'); }; el.ondragleave = () => el.classList.remove('over');
      el.ondrop = (e) => { e.preventDefault(); el.classList.remove('over'); load(sl, [...e.dataTransfer.files]); };
    };
    async function load(sl, files) {
      if (!files.length) return;
      got[sl.k] = { busy: true, found: [], miss: [] }; drawSlot(sl); await new Promise((r) => setTimeout(r, 30));
      got[sl.k] = await readFiles(files, P2.NP_SLOT[sl.k]); drawSlot(sl); refresh();
    }
    grid.classList.add('np4');
    SLOTS.forEach((sl) => { if (sl.k === 'defect') grid.appendChild(autoCard()); grid.appendChild(HS.el('<div class="slot' + (sl.small ? ' small' : '') + '" data-slot="' + sl.k + '"></div>')); drawSlot(sl); });
    body.appendChild(rawView()); // 올린 자료 보기
    // 예비 경로: 기존 관리 엑셀(V8 등) — 신상품 자료 시트가 2종 이상 있는 파일만
    const bk = HS.el('<div class="card" style="margin-top:14px"><h3>기존 관리 엑셀(V8 등) 한 번에 올리기 <small>예비 경로</small><span class="sp"></span><button class="btn sm">파일 선택</button></h3><div class="mute" style="font-size:12px;line-height:1.7">시트가 여러 개인 관리 엑셀은 여기에 올리면 시트 내용을 보고 1 · 2번 · 불량 칸에 나눠 넣습니다. 신상품 자료가 2종 이상 들어 있지 않은 파일(정산서 · 업무일지 등)은 받지 않습니다.</div><div id="bkr"></div><input type="file" id="bkf" accept=".xlsx,.xlsm,.xls" class="hide"></div>');
    body.appendChild(bk);
    const bfi = bk.querySelector('input'); bk.querySelector('button').onclick = () => bfi.click();
    bfi.onchange = async () => {
      const f = [...bfi.files]; if (!f.length) return; const r = bk.querySelector('#bkr'); r.innerHTML = '<div class="empty">읽는 중…</div>';
      const d = await readFiles(f, null); const kinds = [...new Set(d.found.map((x) => x.kind))];
      if (kinds.length < 2) { r.innerHTML = '<div class="lock" style="margin-top:10px;background:#FBE6E2;border-color:#F0B8AE">✖ <b>' + esc(f[0].name) + '</b>은(는) 신상품 관리 엑셀이 아닙니다' + (d.found.length ? ' (찾은 자료: ' + esc(d.found.map((x) => x.sheet + ' → ' + x.label).join(', ')) + ' 1종뿐)' : '') + '. 자료별로 위 1 · 2번 칸에 올려 주세요.</div>'; return; }
      const pick = (ks) => ({ found: d.found.filter((x) => ks.indexOf(x.kind) >= 0), miss: [], plan: ks.indexOf('plan') >= 0 ? d.plan : [], inbound: ks.indexOf('inbound') >= 0 ? d.inbound : [], stock: ks.indexOf('stock') >= 0 ? d.stock : [], out: ks.indexOf('out') >= 0 ? d.out : [], defect: ks.indexOf('defect') >= 0 ? d.defect : [], names: [f[0].name], raw: { plan: ks.indexOf('plan') >= 0 ? d.raw.plan : [], inbound: ks.indexOf('inbound') >= 0 ? d.raw.inbound : [], defect: ks.indexOf('defect') >= 0 ? d.raw.defect : [] } });
      SLOTS.forEach((sl) => { const ks = P2.NP_SLOT[sl.k]; if (d.found.some((x) => ks.indexOf(x.kind) >= 0)) { got[sl.k] = pick(ks); drawSlot(sl); } });
      r.innerHTML = '<div class="lock ok" style="margin-top:10px">✔ ' + esc(d.found.map((x) => x.sheet + ' → ' + x.label).join(' · ')) + '</div>'; refresh();
    };
    body.appendChild(HS.el('<div class="card" style="margin-top:14px"><h3>업데이트 방식</h3><div class="mute" style="font-size:12px;line-height:1.8">· 신상품 정보: 품번 기준 덮어쓰기 (본사 요청일은 유지)<br>· 입고 현황 (WMS 입고반품 현황): 품번별 입고 합계 · 입고구분 "반품"은 빼기 · 입고일 = 일자<br>· 재고 현황: 전산자료 › WMS 재고 현황(정상창고)을 그대로 씀 — 출고 · 현재고 · 로케이션(정리 상태)<br>· 정리 기준: 재고 있음 + 로케이션 할당 → 정리완료 / 로케이션 없음 → 미정리 / 재고 0 → 전량 출고<br>· 담당: 업무지원팀 · 평일 18시까지 업데이트가 없으면 담당자 화면에 알림</div></div>'));
    function combined() {
      const data = { plan: [], inbound: [], stock: [], out: [], defect: [], found: [] }; const names = []; const slotsUsed = [];
      SLOTS.forEach((sl) => { const g = got[sl.k]; if (!g || g.busy || !g.found.length) return; KINDS.forEach((k) => data[k].push(...(g[k] || []))); data.found.push(...g.found); names.push(...g.names); slotsUsed.push(sl.k); });
      return { data, names: [...new Set(names)], slotsUsed };
    }
    let curSeasonSel = null;
    let allSeasons = []; // 파일에서 찾은 시즌 (줄 수 많은 순)
    let regSel = null; // 등록할 시즌 (체크한 것) — 2026-11-10: 여러 시즌 한꺼번에 등록
    let seasonCnt = {};
    let regOk = {}; // 시즌별로 넣을 수 있는지 (① 신상품 정보가 파일에 있거나 이미 등록돼 있음)
    // 2026-11-11: ② 입고 현황은 '누적 관리' — DB에 쌓아 둔 입고 줄에 이번 파일의 '새 줄'만 더한다.
    //   예전에는 올린 파일만으로 입고 수량을 다시 계산해서, 그날치만 든 파일을 올리면 그 앞의 입고가 지워졌음.
    //   같은 줄인지 보는 열쇠: 품번 · 색상 · 일자 · 입고구분 · 등록일자 · 수량 (+ 파일 안에서 같은 값이 몇 번째인지)
    const IB = { brand: 0, date: 1, kind: 2, year: 3, sd: 4, item: 5, style: 6, color: 7, qty: 8, reg: 9 };
    const cd = (v) => { const t = String(v == null ? '' : v).trim(); const m = t.match(/^([0-9A-Za-z]+)\s*\(/); return m ? m[1] : t.split(/\s/)[0]; };
    const ibBase = (r) => [r[IB.style], r[IB.color], r[IB.date], r[IB.kind], r[IB.reg], r[IB.qty]].join('|');
    const ibToIn = (r) => ({ style: String(r[IB.style] || '').toUpperCase(), color: r[IB.color], brand: r[IB.brand], qty: +r[IB.qty] || 0, date: r[IB.date] || null, kind: r[IB.kind], year: cd(r[IB.year]), sd: cd(r[IB.sd]), item: r[IB.item] });
    const IB_MAX = 200000;
    let inbAcc = null; // { rows: 누적 줄, before: 쌓여 있던 줄, added: 새로 들어온 줄, file: 파일 줄 }
    async function mergeInbound(data) {
      inbAcc = null;
      const g = got.inbound; const fileRaw = (g && g.raw && g.raw.inbound) || [];
      if (!fileRaw.length) return;
      const prev = (await HS.db.list('erp_np_raw', { eq: { kind: 'inbound' } }).catch(() => []))[0];
      const map = new Map(); const c1 = {};
      ((prev && prev.rows) || []).forEach((r) => { const b = ibBase(r); c1[b] = (c1[b] || 0) + 1; map.set(b + '|' + c1[b], r); });
      const before = map.size; const c2 = {}; let added = 0;
      fileRaw.forEach((r) => { const b = ibBase(r); c2[b] = (c2[b] || 0) + 1; const k = b + '|' + c2[b]; if (!map.has(k)) { map.set(k, r); added++; } });
      let rows = [...map.values()];
      let cut = 0;
      if (rows.length > IB_MAX) { rows = rows.sort((a, b) => String(a[IB.date] || '').localeCompare(String(b[IB.date] || ''))).slice(-IB_MAX); cut = 1; }
      inbAcc = { rows, before, added, file: fileRaw.length, cut };
      data.inbound = rows.map(ibToIn);
    }
    // 2026-11-11: 시즌 탭을 잘못 골라도 막히지 않게 — 파일에 든 시즌을 모두 보고, 넣을 수 있는 시즌을 스스로 고른다
    const regOkCache = {};
    async function canReg(s, planCnt) { // 넣을 수 있나 = 파일에 ① 신상품 정보가 있거나 · 이미 등록된 품번이 있거나
      if ((planCnt || {})[s]) return true;
      if (regOkCache[s] == null) regOkCache[s] = (await HS.db.list('erp_np_style', { eq: { season: s }, select: 'style', limit: 1 }).catch(() => [])).length > 0;
      return regOkCache[s];
    }
    async function refresh() {
      const { data, names, slotsUsed } = combined();
      if (!slotsUsed.length) { pvEl.innerHTML = '<div class="empty">위 칸에 파일을 올려 주세요. 일부만 올리면 나머지는 지난 자료를 그대로 씁니다.</div>'; warnBox.innerHTML = ''; return; }
      const sOf = (r) => P2.seasonOf(r.year || r.style[3], r.sd || r.style[4]);
      const cnt = {}; data.plan.concat(data.inbound).forEach((r) => { const s = sOf(r); if (s) cnt[s] = (cnt[s] || 0) + 1; });
      const planCnt = {}; data.plan.forEach((r) => { const s = sOf(r); if (s) planCnt[s] = (planCnt[s] || 0) + 1; });
      const seasons = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]); if (seasons.indexOf(season0) < 0) seasons.push(season0);
      seasonCnt = cnt;
      const inFile = seasons.filter((s) => cnt[s]); // 시즌 칸은 '이번 파일'에 든 시즌 기준 (누적까지 다시 넣지 않게)
      await mergeInbound(data); // 계산은 누적 입고 줄로
      const okS = {}; for (const s of seasons) okS[s] = await canReg(s, planCnt);
      // 파일에 든 시즌이 바뀌면 체크를 다시 — 넣을 수 있는 시즌만 켜 둠
      if (!regSel || allSeasons.join() !== seasons.join()) regSel = new Set(inFile.filter((s) => okS[s]));
      allSeasons = seasons; regOk = okS;
      // 미리보기에 띄울 시즌: 고른 것 → (시즌 탭이 파일에 있고 넣을 수 있으면) 시즌 탭 → 넣을 수 있는 시즌 중 줄 수 많은 것
      let season = curSeasonSel && seasons.indexOf(curSeasonSel) >= 0 ? curSeasonSel : null;
      if (!season) season = cnt[season0] && okS[season0] ? season0 : inFile.filter((s) => okS[s])[0] || (cnt[season0] ? season0 : inFile[0]) || season0;
      const bad = SLOTS.filter((sl) => got[sl.k] && !got[sl.k].busy && !got[sl.k].found.length);
      warnBox.innerHTML = bad.length ? '<div class="lock" style="margin-top:14px">⚠ ' + bad.map((sl) => sl.no + '번 ' + sl.l).join(', ') + '이(가) 올바르지 않아 그 자료는 <b>지난 자료를 그대로</b> 씁니다. 나머지만 반영하려면 그대로 [등록]을 누르세요.</div>' : '';
      const multi = seasons.filter((s) => cnt[s]).length > 1;
      pvEl.innerHTML =
        (inFile.length ? '<div class="npss"><b>등록할 시즌</b> <span class="mute" style="font-size:12px">파일에 ' + inFile.length + '개 시즌이 들어 있습니다' + (multi ? ' · 체크한 시즌을 한 번에 등록합니다' : '') + (inFile.some((s) => !okS[s]) ? ' · <b class="neg">① 신상품 정보가 없는 시즌은 넣을 수 없어 꺼 두었습니다</b>' : '') + '</span><div class="npsl">' +
          inFile.map((s) => (okS[s]
            ? '<label class="npck' + (regSel.has(s) ? ' on' : '') + '"><input type="checkbox" data-ck="' + esc(s) + '"' + (regSel.has(s) ? ' checked' : '') + '> ' + esc(sLabel(s)) + ' <span class="mute">' + fmt(cnt[s]) + '줄</span></label>'
            : '<label class="npck off" title="이 시즌은 ① 신상품 정보(품번정보현황)가 없어 넣을 수 없습니다"><input type="checkbox" disabled> ' + esc(sLabel(s)) + ' <span class="mute">' + fmt(cnt[s]) + '줄 · ① 없음</span></label>')).join('') + '</div></div>' : '') +
        '<div style="margin:0 0 10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' + (multi ? '<span class="mute" style="font-size:12px">아래 미리보기에서 볼 시즌</span>' : '시즌') + ' <select class="in" id="ss" style="width:210px">' + seasons.map((s) => '<option value="' + s + '"' + (s === season ? ' selected' : '') + '>' + sLabel(s) + (cnt[s] ? ' (' + fmt(cnt[s]) + '줄)' : '') + (okS[s] ? '' : ' · ① 없음') + '</option>').join('') + '</select></div><div id="pv2"></div>';
      pvEl.querySelector('#ss').onchange = (e) => { curSeasonSel = e.target.value; refresh(); };
      pvEl.querySelectorAll('[data-ck]').forEach((cb) => (cb.onchange = () => {
        if (cb.checked) regSel.add(cb.dataset.ck); else regSel.delete(cb.dataset.ck);
        cb.closest('.npck').classList.toggle('on', cb.checked);
        const rb = pvEl.querySelector('#reg'); if (rb) rb.textContent = regBtnLabel();
        const rn = pvEl.querySelector('#regn'); if (rn) rn.innerHTML = regListHtml();
      }));
      preview(data, season, names, slotsUsed);
    }
    const regList = () => HS.seasonSort(allSeasons.filter((s) => regSel && regSel.has(s)));
    const regBtnLabel = () => { const n = regList().length; return n > 1 ? n + '개 시즌 등록' : '등록'; };
    const regListHtml = () => { const L = regList(); return L.length ? esc(L.map(sLabel).join(' · ')) + ' · 반영: ' : '<span class="neg">등록할 시즌을 하나 이상 고르세요</span> · '; };
    const skipU = new Set(); // '이번만 기타로' 처리한 브랜드
    // 한 시즌의 품번 목록 계산 — 미리보기와 등록(여러 시즌)이 같이 씀
    async function calcRows(data, season, bOf) {
      const old = await HS.db.list('erp_np_style', { eq: { season }, select: SEL });
      const oldMap = Object.fromEntries(old.map((r) => [r.style, r]));
      const oldStk = old.some((r) => +r.stock || +r.stock_loc); // 예전에 재고 파일을 올린 적이 있는지
      // 일부 자료만 올린 경우: 없는 자료는 지난 값 사용
      const has = { plan: data.plan.length > 0, inbound: data.inbound.length > 0, stock: data.stock.length > 0, out: data.out.length > 0 || data.stock.length > 0 };
      let rows = P2.computeNp(data, season, (t, q) => bOf(t, q) || null);
      if (!has.plan && old.length) { // 품번 정보 없음 → 기존 품번 목록 기준
        const nm = Object.fromEntries(rows.map((r) => [r.style, r]));
        const IN = {}; data.inbound.forEach((r) => { const x = IN[r.style] || (IN[r.style] = { q: 0, d: null }); x.q += r.qty; if (r.date && (!x.d || r.date < x.d)) x.d = r.date; });
        const OUT = {}; data.out.forEach((r) => (OUT[r.style] = (OUT[r.style] || 0) + r.qty));
        const ST = {}; data.stock.forEach((r) => { const x = ST[r.style] || (ST[r.style] = { out: 0, stock: 0, loc: 0 }); x.out += r.out; x.stock += r.stock; if (r.loc) x.loc += r.stock; });
        rows = old.map((o) => { const n = nm[o.style] || {}; const x = Object.assign({}, o, { flags: (o.flags || []).filter((f) => f === '기획누락') });
          if (has.inbound) { x.in_qty = (IN[o.style] || {}).q || 0; x.in_date = (IN[o.style] || {}).d || null; }
          if (has.stock) { x.stock = (ST[o.style] || {}).stock || 0; x.stock_loc = (ST[o.style] || {}).loc || 0; x.out_qty = (ST[o.style] || {}).out || 0; }
          if (data.out.length) x.out_qty = OUT[o.style] || 0;
          if (data.defect.length) x.defect = data.defect.some((d) => d.style === o.style);
          void n; return P2.npStatus(x); });
      } else {
        rows = rows.map((r) => { const o = oldMap[r.style]; if (!o) return r; const x = Object.assign({}, r); if (!has.inbound) { x.in_qty = o.in_qty; x.in_date = o.in_date; } if (!has.stock) { x.stock = oldStk ? o.stock : null; x.stock_loc = oldStk ? o.stock_loc : null; } if (!has.out) x.out_qty = o.out_qty; if (!data.defect.length) x.defect = o.defect; return P2.npStatus(x); });
      }
      rows.forEach((r) => { if (oldMap[r.style] && oldMap[r.style].hq_date) r.hq_date = oldMap[r.style].hq_date; });
      return { rows, old, oldMap, has };
    }
    async function preview(data, season, names, slotsUsed) {
      const pv = pvEl.querySelector('#pv2'); pv.innerHTML = '<div class="empty">계산 중…</div>';
      const unknown = new Set(); const bOf = (t, quiet) => { const b = HS.brandOf(t); if (!b && !quiet && t && /[0-9A-Za-z가-힣]{2}/.test(t) && !skipU.has(String(t).trim())) unknown.add(String(t).trim()); return b; };
      if (!data.stock.length) { const ws = await wmsStock(); if (ws.length) data.stock = ws; } // ③ 재고 현황 = 전산자료 WMS 정상창고 (따로 안 올림)
      const { rows, old, oldMap, has } = await calcRows(data, season, bOf);
      if (!has.plan && !old.length) {
        // 2026-11-11: 파일은 잘 읽었는데 그 시즌 ① 신상품 정보가 없어 못 넣는 경우 — 왜 안 되는지 · 파일에 든 시즌이 무엇인지 알려 준다
        const sOf = (r) => P2.seasonOf(r.year, r.sd) || (r.style && r.style.length > 4 ? P2.seasonOf(r.style[3], r.style[4]) : null);
        const cnt = {}; let none = 0;
        ['plan', 'inbound'].forEach((k) => (data[k] || []).forEach((r) => { const s = sOf(r); if (s) cnt[s] = (cnt[s] || 0) + 1; else none++; }));
        const got = HS.seasonSort(Object.keys(cnt));
        const read = (data.found || []).map((f) => esc(f.label || f.kind) + ' ' + fmt(f.rows) + '줄').join(' · ');
        pv.innerHTML = '<div class="lock ok" style="margin-bottom:8px">✔ 파일은 잘 읽었습니다' + (read ? ' — ' + read : '') + '</div>' +
          '<div class="lock" style="background:#FBE6E2;border-color:#F0B8AE">⚠ <b>' + esc(sLabel(season)) + '</b> 은 아직 <b>① 신상품 정보</b>(화주 ERP 품번정보현황)가 등록돼 있지 않습니다.<br>' +
          '입고 수량을 붙일 <b>기획 품번 목록</b>이 없어서 그대로는 넣을 수 없습니다.<div class="mute" style="font-size:12px;margin-top:8px;line-height:1.8">' +
          '· <b>1번 칸</b>에 신상품 정보 파일을 같이 올려 주세요. 한 번만 올리면 그 다음부터는 2번(입고)만 올려도 됩니다.<br>' +
          (got.length ? '· 올린 파일에 든 시즌: <b>' + got.map((s) => esc(sLabel(s)) + ' ' + fmt(cnt[s]) + '줄').join(' · ') + '</b>' + (none ? ' <span class="mute">(시즌을 알 수 없는 줄 ' + fmt(none) + ')</span>' : '') + '<br>' : '') +
          (got.length && got.indexOf(season) < 0 ? '· <b class="neg">지금 고른 시즌(' + esc(sLabel(season)) + ')은 이 파일에 없습니다.</b> 맨 위 시즌 탭을 바꾸고 파일을 다시 올려 주세요.<br>' : '') +
          '</div></div>';
        return;
      }
      if (unknown.size) { pv.innerHTML = ''; const u = [...unknown].slice(0, 8); await HS.resolveUnknownBrands(u, '신상품 파일'); u.forEach((x) => { if (!HS.brandOf(x)) skipU.add(x); }); return preview(data, season, names, slotsUsed); }
      const S = P2.npSummary(rows).tot; const O = old.length ? P2.npSummary(old).tot : null;
      const fl = {}; rows.forEach((r) => (r.flags || []).forEach((f) => (fl[f] = (fl[f] || 0) + 1)));
      const newS = rows.filter((r) => !oldMap[r.style]).length; const gone = has.plan ? old.filter((o) => !rows.some((r) => r.style === o.style)).length : 0;
      const dl = (a, b) => (O ? '<div class="s ' + (a - b > 0 ? 'pos' : a - b < 0 ? 'neg' : 'mute') + '">' + (a - b >= 0 ? '+' : '') + fmt(a - b) + '</div>' : '<div class="s mute">첫 등록</div>');
      const kp = (l, v, s, cls) => '<div class="card kpi"><div class="l">' + l + '</div><div class="v' + (cls ? ' ' + cls : '') + '">' + fmt(v) + '</div>' + s + '</div>';
      const kept = (k) => '<div class="s mute">지난 자료 · ' + esc(when((parts[k] || m).at)) + '</div>';
      let h = '<div class="kpis" style="margin-bottom:12px">' + kp('기획 품번', S.st, has.plan ? (newS ? '<div class="s">새 품번 +' + fmt(newS) + '</div>' : dl(S.st, O && O.st)) : kept('plan')) + kp('입고 완료', S.in, has.inbound ? dl(S.in, O && O.in) : kept('inbound')) + kp('미입고', S.notin, has.inbound ? dl(S.notin, O && O.notin) : kept('inbound')) + kp('출고 완료', S.out, has.out ? dl(S.out, O && O.out) : kept('out')) + kp('출고 후 미정리', S.unclean, has.stock ? dl(S.unclean, O && O.unclean) : kept('out'), 'neg') + '</div>';
      const chk = [];
      if (!has.plan) chk.push(['y', '! 1번 신상품 정보가 없어 지난 품번 목록(' + fmt(old.filter((x) => (x.flags || []).indexOf('기획누락') < 0).length) + '개)을 그대로 씁니다']);
      if (!has.inbound) chk.push(['y', '! 2번 입고 현황이 없어 지난 입고 수량을 그대로 씁니다']);
      else if (inbAcc) chk.push(['g', '✔ <b>입고는 누적으로 관리합니다</b> — 이번 파일 ' + fmt(inbAcc.file) + '줄 중 <b>새로 들어온 줄 ' + fmt(inbAcc.added) + '개</b>' + (inbAcc.before ? ' · 쌓여 있던 ' + fmt(inbAcc.before) + '줄' : '') + ' → 누적 <b>' + fmt(inbAcc.rows.length) + '줄</b>로 계산합니다' + (inbAcc.cut ? ' <span class="neg">(' + fmt(IB_MAX) + '줄까지만 보관 · 오래된 줄부터 뺌)</span>' : '') + ' <button class="btn sm" id="ibrst" style="margin-left:8px">누적 지우고 이 파일만 쓰기</button>']);
      if (!has.out) chk.push(['y', '! 3번 출고 현황이 없어 지난 출고 · 재고를 그대로 씁니다']);
      else if (!has.stock) chk.push(['y', '! 출고 수량만 바뀝니다. 현재고 · 로케이션(정리 상태)은 WMS 재고 현황 파일이 있어야 바뀝니다']);
      if (gone) chk.push(['y', '! 화주 ERP 기획에서 빠진 품번 ' + fmt(gone) + '개 → 등록하면 목록에서 지웁니다']);
      if (fl['기획누락']) chk.push(['y', '! 입고·재고는 있는데 화주 ERP 기획에 없는 품번 ' + fl['기획누락'] + '개 (\'기획 누락\' 목록)']);
      if (fl['전개일없음']) chk.push(['y', '! 전개시기가 비어 있는 품번 ' + fl['전개일없음'] + '개 → 화주 확인 · 본사 요청일 입력']);
      if (fl['초과입고']) { const ex = rows.find((r) => (r.flags || []).indexOf('초과입고') >= 0); chk.push(['y', '! 기획보다 10% 넘게 입고된 품번 ' + fl['초과입고'] + '개 (예: ' + esc(ex.style) + ' 기획 ' + fmt(ex.plan_qty) + ' / 입고 ' + fmt(ex.in_qty) + ')']); }
      if (fl['재고마이너스']) chk.push(['r', '✖ 현재고가 마이너스인 품번 ' + fl['재고마이너스'] + '개 → WMS 재고 확인']);
      if (has.out && S.out < (O ? O.out : 0) * 0.5) chk.push(['r', '✖ 출고 완료 품번이 지난번(' + fmt(O.out) + ')의 절반도 안 됩니다 → 3번 파일 기간 · 시즌을 확인하세요']);
      if (regList().length > 1) h = '<div class="lock ok" style="margin-bottom:8px">✔ <b>' + regList().length + '개 시즌을 한 번에 등록합니다</b> — ' + esc(regList().map(sLabel).join(' · ')) + ' <span class="mute" style="font-size:11.5px">(아래 숫자는 ' + esc(sLabel(season)) + ' 것입니다 · 시즌마다 따로 계산해서 넣습니다)</span></div>' + h;
      h += chk.map(([c2, t]) => '<div class="lock ' + (c2 === 'g' ? 'ok' : '') + '" style="margin-bottom:6px;' + (c2 === 'r' ? 'background:#FBE6E2;border-color:#F0B8AE' : '') + '">' + t + '</div>').join('') + '<div style="display:flex;gap:10px;align-items:center;margin-top:12px"><button class="btn p" id="reg">' + regBtnLabel() + '</button><span class="mute" id="pg"><span id="regn">' + regListHtml() + '</span>' + slotsUsed.map((k) => SLOTS.find((x) => x.k === k).l).join(', ') + '</span></div>';
      pv.innerHTML = h;
      { const rst = pv.querySelector('#ibrst'); if (rst) rst.onclick = async () => {
        if (!(await HS.confirm('지금까지 쌓인 입고 줄 ' + fmt(inbAcc.before) + '개를 모두 지우고, 올린 파일(' + fmt(inbAcc.file) + '줄)만 쓸까요?\n\n잘못 올린 파일을 되돌릴 때만 쓰세요.'))) return;
        try { await HS.db.upsert('erp_np_raw', [{ kind: 'inbound', file: '(비움)', n: 0, rows: [], by_name: HS.me.name, at: new Date().toISOString() }]); HS.toast('누적을 비웠습니다', 'ok'); refresh(); } catch (e) { HS.err(e); }
      }; }
      // 등록: 체크한 시즌을 차례로 (시즌마다 그 시즌 품번만 다시 계산)
      pv.querySelector('#reg').onclick = async () => {
        const b = pv.querySelector('#reg'); const pg = pv.querySelector('#pg');
        const list = regList().length ? regList() : [season];
        if (!list.length) { HS.toast('등록할 시즌을 고르세요', 'err'); return; }
        b.disabled = true; const quiet = (t) => HS.brandOf(t) || null; const doneS = []; let totRows = 0;
        try {
          for (const sn of list) {
            const many = list.length > 1; const head = many ? sLabel(sn) + ' (' + (doneS.length + 1) + '/' + list.length + ') · ' : '';
            pg.textContent = head + '계산 중…';
            const R = sn === season ? { rows, old, oldMap, has } : await calcRows(data, sn, quiet);
            if (!R.has.plan && !R.old.length) { pg.textContent = head + '건너뜀 (신상품 정보 없음)'; continue; }
            const up = R.rows.map((r) => { const o = Object.assign({}, r); delete o.hq_date; return o; });
            await HS.db.upsert('erp_np_style', up, (a, n) => (pg.textContent = head + fmt(a) + ' / ' + fmt(n)));
            if (R.has.plan) { const keep = new Set(R.rows.map((r) => r.style)); for (const o of R.old.filter((x) => !keep.has(x.style))) await HS.db.remove('erp_np_style', { season: sn, style: o.style }); }
            await HS.db.upsert('erp_np_snap', [{ season: sn, snap_date: today(), data: P2.npSummary(R.rows) }]);
            doneS.push(sn); totRows += R.rows.length;
          }
          if (!doneS.length) throw new Error('등록한 시즌이 없습니다 · 1번 신상품 정보 파일을 올려 주세요');
          // 올린 자료 원본 — 입고(inbound)는 누적한 줄을 통째로 저장, 나머지는 이번 파일 그대로
          for (const sl of SLOTS) { const g = got[sl.k]; if (!g || !g.raw || !(g.raw[sl.k] || []).length) continue;
            const rw = sl.k === 'inbound' && inbAcc ? inbAcc.rows : g.raw[sl.k];
            try { await HS.db.upsert('erp_np_raw', [{ kind: sl.k, file: (g.names || []).join(', ').slice(0, 200) + (sl.k === 'inbound' && inbAcc ? ' (누적 ' + rw.length + '줄)' : ''), n: rw.length, rows: rw, by_name: HS.me.name, at: new Date().toISOString() }]); } catch (e) { console.warn('np raw', e); } }
          const mt = await npMeta(); const now = new Date().toISOString();
          doneS.forEach((sn) => { const prev = mt[sn] || {}; const ps = Object.assign({}, prev.parts || {}); slotsUsed.forEach((k) => (ps[k] = { at: now, by: HS.me.name, files: (got[k].names || []).slice(0, 3) })); mt[sn] = { at: now, by: HS.me.name, files: names.slice(0, 5), parts: ps }; });
          await HS.db.upsert('erp_settings', [{ key: 'np_update', value: mt }]);
          HS.toast((doneS.length > 1 ? doneS.length + '개 시즌 (' + doneS.map(sLabel).join(' · ') + ') ' : sLabel(doneS[0]) + ' ') + '신상품 자료 ' + fmt(totRows) + '개 품번 등록', 'ok');
          await HS.styLearn(data.plan.concat(data.inbound).map((r) => [r.style, r.item, '']), '신상품 파일');
          HS.go('newprod', { s: HS.seasonSort(doneS)[0] });
        } catch (e) { HS.err(e); b.disabled = false; }
      };
    }
  }

  // ---------- 평일 17~18시 업데이트 알림 (업무지원팀) ----------
  (HS.afterBoot = HS.afterBoot || []).push(() => {
    if (!HS.can('newprod', 'create') || navigator.webdriver) return; // 자동 시험(로봇 브라우저)에서는 띄우지 않음
    const check = async () => {
      const n = new Date(); const wd = n.getDay(); const hm = n.getHours() * 60 + n.getMinutes();
      if (wd === 0 || wd === 6 || hm < 17 * 60 + 30 || hm > 19 * 60) return;
      let flag = ''; try { flag = localStorage.getItem('hs-np-remind') || ''; } catch (e) { /* 무시 */ }
      if (flag === today()) return;
      const meta = await npMeta(); const done = Object.values(meta).some((m) => m.at && m.at.slice(0, 10) === today() || (m.at && HS.ymd(new Date(m.at)) === today()));
      if (done) return;
      try { localStorage.setItem('hs-np-remind', today()); } catch (e) { /* 무시 */ }
      HS.beep('task_new');
      const v = await HS.modal(null, '<div class="callsign new"><div class="ic">📦</div><h2>신상품 자료 업데이트</h2><p>오늘 신상품 입고·출고·정리 자료가 아직 올라오지 않았습니다.<br>퇴근 전(18시)까지 화주 ERP · WMS 자료를 올려 주세요.</p></div>', [['나중에', null], ['지금 올리기', 'go', 'p']]);
      if (v === 'go') HS.go('newprod', { tab: 'up' });
    };
    setTimeout(check, 4000); setInterval(check, 10 * 60 * 1000);
  });
})();
