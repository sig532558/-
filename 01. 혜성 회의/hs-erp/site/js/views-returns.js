/* 반품 관리 — 대시보드(전표 · PCS) · 자료 업데이트(매장 반품 등록 · 고백센터 반품 확정) · 행낭 · 타택배 수작업 등록
 * 박스 수불 · 기타 대장(행사·폐점·온라인 등)은 views-ops.js 의 HS.returnsLegacy 사용 */
(function () {
  'use strict';
  const { esc, fmt, today, addDays, monthRange } = HS;
  const R = window.HSReturns;
  const BR = ['핑', '팬텀', '파리게이츠', '마스터바니', '고커', '세인트앤드류스', '하이드로겐', '마무트', '앤드원더', '베셀', '링스', 'V12'];
  const SHORT = { 팬텀: '펜텀', 파리게이츠: '파리', 마스터바니: '바니', 세인트앤드류스: '세인트', 하이드로겐: '하이', 앤드원더: '앤드' };
  const sh = (b) => SHORT[b] || b;
  const z = (n) => (n ? fmt(n) : '<span class="z">-</span>');
  const TABS = [['dash', '대시보드'], ['up', '자료 업데이트'], ['box', '박스 수불'], ['h', '행낭 등록'], ['t', '타택배 등록'], ['rec', '기타 대장']];
  const brandOf = (t) => HS.brandOf(t) || null;
  const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  const when = (t) => (t ? new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '없음');
  const maxAt = (rows) => rows.reduce((m, r) => (r.updated_at && (!m || r.updated_at > m) ? r.updated_at : m), null);

  HS.view('returns', {
    title: '반품 현황', perm: 'returns',
    async render(body, p, tools) {
      const recKinds = (HS.REC_KINDS || []).map((k) => k[0]);
      let tab = p.k || 'dash'; if (recKinds.indexOf(tab) >= 0) tab = 'rec';
      const mo = p.m || today().slice(0, 7);
      tools.appendChild(HS.seg(TABS, tab, (k) => HS.go('returns', { k, m: mo })));
      if (tab !== 'up') { const mi = HS.el('<input class="in" type="month" style="width:140px">'); mi.value = mo; mi.onchange = () => HS.go('returns', Object.assign({}, p, { m: mi.value })); tools.appendChild(mi); }
      body.innerHTML = '';
      if (tab === 'dash') return dash(body, p, mo);
      if (tab === 'up') return upload(body, p);
      if (tab === 'h' || tab === 't') return bags(body, p, mo, tab === 'h' ? '행낭' : '타택배');
      if (tab === 'rec') {
        const rk = recKinds.indexOf(p.k) >= 0 ? p.k : recKinds[0];
        const sub = HS.el('<div style="margin-bottom:12px"></div>'); sub.appendChild(HS.seg(HS.REC_KINDS, rk, (k) => HS.go('returns', { k, m: mo }))); body.appendChild(sub);
        const inner = HS.el('<div></div>'); body.appendChild(inner);
        return HS.returnsLegacy.render(inner, Object.assign({}, p, { k: rk, m: mo }), HS.el('<div></div>'));
      }
      return HS.returnsLegacy.render(body, Object.assign({}, p, { k: 'box', m: mo }), HS.el('<div></div>'));
    },
  });

  // ================= 대시보드 =================
  //  opt.noKpi  — 맨 위 요약 4칸 빼기 (월간 회의 안에 넣을 때)
  //  opt.go     — 전표/PCS 바꾸기 · 브랜드 누르기를 가로챔 (없으면 반품 현황 화면으로 이동)
  //  opt.view   — 자료가 바뀌면 다시 그릴 화면 이름 (없으면 'returns')
  async function dash(body, p, mo, opt) {
    opt = opt || {}; const GO = opt.go || ((np) => HS.go('returns', np));
    const [m1, m2] = monthRange(mo + '-01'); const v = p.v === 'pcs' ? 'pcs' : 'slip';
    const [done, pend, box, bag] = await Promise.all([
      HS.db.list('erp_ret_done', { gte: { rec_date: m1 }, lte: { rec_date: m2 } }),
      HS.db.list('erp_ret_pend', {}),
      HS.db.list('erp_returns_box', { gte: { rec_date: m1 }, lte: { rec_date: m2 } }),
      HS.db.list('erp_ret_bag', { gte: { rec_date: m1 }, lte: { rec_date: m2 }, select: 'kind,rec_date,box' }),
    ]);
    const PA = R.pendAgg(pend);
    const D = {}; done.forEach((r) => (D[r.rec_date + '|' + r.brand] = r));
    const P = {}; PA.forEach((r) => (P[r.d + '|' + r.brand] = r));
    const BX = Object.fromEntries(box.map((r) => [r.rec_date, r]));
    const BG = {}; bag.forEach((b) => { const k = b.rec_date + '|' + b.kind; BG[k] = (BG[k] || 0) + (+b.box || 0); });
    const hasBag = { 행낭: bag.some((b) => b.kind === '행낭'), 타택배: bag.some((b) => b.kind === '타택배') };
    const days = []; for (let x = m1; x <= m2; x = addDays(x, 1)) { const w = new Date(x + 'T00:00:00').getDay(); const any = BX[x] || BG[x + '|행낭'] || BG[x + '|타택배'] || done.some((r) => r.rec_date === x) || PA.some((r) => r.d === x); if ((w > 0 && w < 6 && x <= today()) || any) days.push(x); }
    if (!done.length && !pend.length && !box.length && !bag.length) { body.innerHTML = '<div class="card empty">' + esc(mo) + ' 반품 자료가 없습니다.<br><br>' + (HS.can('returns', 'create') ? '<a class="btn p" href="#/returns?k=up">자료 업데이트</a>' : '') + '</div>'; return; }
    const allB = HS.bsort([...new Set(BR.concat(done.map((r) => r.brand), pend.map((r) => r.brand)))]); // 브랜드 차례 = 기준정보 › 브랜드 순번
    const brands = allB.filter((b) => done.some((r) => r.brand === b && (r.slips || r.pcs)) || PA.some((r) => r.brand === b && r.d >= m1 && r.d <= m2 && (r.slips || r.pcs)));
    const boxOf = (x) => { const b = BX[x] || {}; const hn = hasBag['행낭'] ? BG[x + '|행낭'] || 0 : +b.haengnang || 0; const et = hasBag['타택배'] ? BG[x + '|타택배'] || 0 : +b.etc || 0; return { top: +b.top || 0, lotte: +b.lotte || 0, hn, et, tot: (+b.top || 0) + (+b.lotte || 0) + hn + et, hanger: +b.hanger || 0, done: +b.done || 0, wait: +b.pending || 0 }; };
    const dv = (x, b, k) => ((D[x + '|' + b] || {})[k] || 0);
    const pv = (x, b, k) => ((P[x + '|' + b] || {})[k] || 0);
    // KPI
    const lastDay = days.filter((x) => boxOf(x).tot || brands.some((b) => dv(x, b, 'slips'))).pop();
    const LB = lastDay ? boxOf(lastDay) : null;
    const monS = done.reduce((a, r) => a + (+r.slips || 0), 0), monP = done.reduce((a, r) => a + (+r.pcs || 0), 0);
    const pb = {}; PA.forEach((r) => { const o = pb[r.brand] || (pb[r.brand] = { slips: 0, pcs: 0 }); o.slips += r.slips; o.pcs += r.pcs; });
    const pTop = Object.entries(pb).filter(([, o]) => o.slips).sort((a, b) => b[1].slips - a[1].slips);
    const pS = pTop.reduce((a, [, o]) => a + o.slips, 0), pP = Object.values(pb).reduce((a, o) => a + o.pcs, 0);
    const kp = (l, val, s, c) => '<div class="card kpi"><div class="l">' + l + '</div><div class="v ' + (c || '') + '">' + val + '</div><div class="s">' + s + '</div></div>';
    const ls = lastDay ? lastDay.slice(5).replace('-', '/') : '';
    if (!opt.noKpi) body.appendChild(HS.el('<div class="kpis">' +
      kp((ls || '최근') + ' 도착 BOX', LB ? fmt(LB.tot) : '-', LB ? '탑 ' + fmt(LB.top) + ' · 롯데 ' + fmt(LB.lotte) + ' · 행낭 ' + fmt(LB.hn) + ' · 기타 ' + fmt(LB.et) : '자료 없음') +
      kp((ls || '최근') + ' 당일 반품 완료', lastDay ? fmt(brands.reduce((a, b) => a + dv(lastDay, b, 'slips'), 0)) + ' 전표' : '-', lastDay ? fmt(brands.reduce((a, b) => a + dv(lastDay, b, 'pcs'), 0)) + ' PCS' : '') +
      kp(+mo.slice(5) + '월 누적 반품 완료', fmt(monS) + ' 전표', fmt(monP) + ' PCS') +
      kp('반품 미발송 (매장이 의뢰만 하고 안 보냄)', fmt(pS) + ' 전표', fmt(pP) + ' PCS' + (pTop.length ? ' · ' + pTop.slice(0, 2).map(([b, o]) => esc(sh(b)) + ' ' + fmt(o.slips)).join(' · ') : ''), pS ? 'neg' : '') + '</div>'));
    // 박스 칸이 왜 비는지 알려 줌
    //  월간 회의는 기본이 '지난달' 이고 반품 현황은 '이번 달' 이라, 같은 표인데도
    //  "월간 회의에는 나오는데 여기는 안 나온다" 가 자주 생김 (2026-11-11 사용자 지적)
    if (!box.length && !bag.length) {
      const lastBx = await HS.db.list('erp_returns_box', { order: ['rec_date', false], limit: 1, select: 'rec_date' }).catch(() => []);
      const ld = lastBx.length ? lastBx[0].rec_date : null;
      body.appendChild(HS.el('<div class="lock" style="margin-top:14px;font-size:12px;line-height:1.8">' +
        '<b>' + esc(mo) + ' 은 도착 운송사 BOX · 실무진 BOX 자료가 아직 없습니다</b> — 그래서 그 칸이 모두 <b>-</b> 입니다. (반품 완료 · 미발송은 다른 자료라 그대로 나옵니다)' +
        (ld ? '<br>가장 최근 박스 자료는 <b>' + esc(ld) + '</b> 입니다.' + (ld.slice(0, 7) !== mo ? ' <b>월간 회의</b>는 기본이 <b>지난달</b>이라 거기서는 그 달 숫자가 보입니다 — 같은 표인데 달이 다른 것입니다.' : '') : '') +
        (HS.can('returns', 'create') ? '<br>올리는 곳: <a href="#/returns?k=up">자료 업데이트 ③ 일별 반품 관리 대장 (박스)</a> · 한 줄씩 고치기는 <a href="#/returns?k=box">박스 수불</a>' : '') + '</div>'));
    }
    // 대장 표
    const c = HS.el('<div class="card" style="margin-top:14px"><h3>일별 반품 관리 대장<small>' + esc(mo) + '</small><span class="sp"></span><span id="vs"></span><button class="btn sm" id="xl" style="margin-left:8px">엑셀 받기</button></h3><div class="tw rtab" id="tb"></div><div class="mute" style="font-size:11.5px;margin-top:8px;line-height:1.7">· 탑 · 롯데 · 기타용품 · 실무진 BOX = <a href="#/returns?k=up">자료 업데이트 ③ 일별 대장 엑셀</a> 또는 <a href="#/returns?k=box">박스 수불</a> 직접 입력 · 행낭 · 기타 = <a href="#/returns?k=h">행낭</a> / <a href="#/returns?k=t">타택배</a> 등록에서 자동 합계<br>· 완료 = 고백센터 반품 확정(출고 반품 현황) · 미처리 = 매장 반품 등록(의뢰 대비 출고 반품 현황) 중 아직 출고 확정 안 된 것 (의뢰일 기준)</div></div>');
    body.appendChild(c);
    c.querySelector('#vs').appendChild(HS.seg([['slip', '전표'], ['pcs', 'PCS']], v, (x) => GO(Object.assign({}, p, { k: 'dash', v: x }))));
    const bh = brands.map((b) => '<th class="n">' + esc(sh(b)) + '</th>').join('') + '<th class="n">계</th>';
    const sumB = (x, f) => brands.reduce((a, b) => a + f(x, b), 0);
    const cell = (n, red) => '<td class="n' + (red && n ? ' r' : '') + '">' + z(n) + '</td>';
    let h;
    if (v === 'slip') {
      h = '<table><tr><th rowspan="2">도착일</th><th colspan="5" class="c g1">도착 운송사 BOX</th><th colspan="3" class="c g2">실무진 BOX</th><th colspan="' + (brands.length + 1) + '" class="c g3">당일 반품 완료 전표 [도착일 기준]</th><th colspan="' + (brands.length + 1) + '" class="c g4">반품 미발송 전표 [의뢰일 기준]</th></tr><tr><th class="n">탑</th><th class="n">롯데</th><th class="n">행낭</th><th class="n">기타</th><th class="n">합계</th><th class="n">기타용품</th><th class="n">완료</th><th class="n">대기</th>' + bh + bh + '</tr>';
      const tot = { top: 0, lotte: 0, hn: 0, et: 0, tot: 0, hanger: 0, done: 0, wait: 0 }; const tb = {}, tp = {};
      h += days.map((x) => { const b = boxOf(x); Object.keys(tot).forEach((k) => (tot[k] += b[k])); brands.forEach((br) => { tb[br] = (tb[br] || 0) + dv(x, br, 'slips'); tp[br] = (tp[br] || 0) + pv(x, br, 'slips'); });
        return '<tr><td>' + x.slice(5).replace('-', '/') + ' (' + HS.dow(x) + ')</td>' + [b.top, b.lotte, b.hn, b.et].map((n) => cell(n)).join('') + '<td class="n b">' + z(b.tot) + '</td>' + cell(b.hanger) + cell(b.done) + cell(b.wait, true) +
          brands.map((br) => cell(dv(x, br, 'slips'))).join('') + '<td class="n b">' + z(sumB(x, (y, br) => dv(y, br, 'slips'))) + '</td>' + brands.map((br) => cell(pv(x, br, 'slips'), true)).join('') + '<td class="n b' + (sumB(x, (y, br) => pv(y, br, 'slips')) ? ' r' : '') + '">' + z(sumB(x, (y, br) => pv(y, br, 'slips'))) + '</td></tr>'; }).join('');
      const sb = brands.reduce((a, br) => a + tb[br], 0), sp = brands.reduce((a, br) => a + tp[br], 0);
      h += '<tr class="tot"><td>합계</td>' + [tot.top, tot.lotte, tot.hn, tot.et, tot.tot, tot.hanger, tot.done, tot.wait].map((n) => '<td class="n b">' + z(n) + '</td>').join('') + brands.map((br) => '<td class="n b">' + z(tb[br]) + '</td>').join('') + '<td class="n b">' + z(sb) + '</td>' + brands.map((br) => '<td class="n b r">' + z(tp[br]) + '</td>').join('') + '<td class="n b r">' + z(sp) + '</td></tr></table>';
    } else {
      h = '<table><tr><th rowspan="2">날짜</th><th colspan="' + (brands.length + 1) + '" class="c g3">전산 완료 PCS [반품 확정일 기준]</th><th colspan="' + (brands.length + 1) + '" class="c g4">반품 미발송 PCS [의뢰일 기준]</th></tr><tr>' + bh + bh + '</tr>';
      const tb = {}, tp = {};
      h += days.map((x) => { brands.forEach((br) => { tb[br] = (tb[br] || 0) + dv(x, br, 'pcs'); tp[br] = (tp[br] || 0) + pv(x, br, 'pcs'); });
        return '<tr><td>' + x.slice(5).replace('-', '/') + ' (' + HS.dow(x) + ')</td>' + brands.map((br) => cell(dv(x, br, 'pcs'))).join('') + '<td class="n b">' + z(sumB(x, (y, br) => dv(y, br, 'pcs'))) + '</td>' + brands.map((br) => cell(pv(x, br, 'pcs'), true)).join('') + '<td class="n b' + (sumB(x, (y, br) => pv(y, br, 'pcs')) ? ' r' : '') + '">' + z(sumB(x, (y, br) => pv(y, br, 'pcs'))) + '</td></tr>'; }).join('');
      h += '<tr class="tot"><td>합계</td>' + brands.map((br) => '<td class="n b">' + z(tb[br]) + '</td>').join('') + '<td class="n b">' + z(brands.reduce((a, br) => a + tb[br], 0)) + '</td>' + brands.map((br) => '<td class="n b r">' + z(tp[br]) + '</td>').join('') + '<td class="n b r">' + z(brands.reduce((a, br) => a + tp[br], 0)) + '</td></tr></table>';
    }
    c.querySelector('#tb').innerHTML = days.length ? h : '<div class="empty">' + esc(mo) + ' 자료가 없습니다. <a href="#/returns?k=up">자료 업데이트</a>에서 파일을 올리세요.</div>';
    c.querySelector('#xl').onclick = () => HS.download('일별반품관리대장_' + (v === 'pcs' ? 'PCS' : '전표') + '_' + mo + '.xlsx', days.map((x) => { const b = boxOf(x); const o = { 날짜: x };
      if (v === 'slip') Object.assign(o, { 탑: b.top, 롯데: b.lotte, 행낭: b.hn, 기타: b.et, 합계: b.tot, 기타용품: b.hanger, 실무진완료: b.done, 실무진대기: b.wait });
      const k = v === 'pcs' ? 'pcs' : 'slips'; brands.forEach((br) => (o['완료 ' + sh(br)] = dv(x, br, k))); o['완료 계'] = sumB(x, (y, br) => dv(y, br, k)); brands.forEach((br) => (o['미처리 ' + sh(br)] = pv(x, br, k))); o['미처리 계'] = sumB(x, (y, br) => pv(y, br, k)); return o; }), v === 'pcs' ? '일별반품 PCS' : '일별반품 전표');
    // 미처리 브랜드 · 상세
    const two = HS.el('<div class="row2" style="margin-top:14px"></div>'); body.appendChild(two);
    const mx = pTop.length ? pTop[0][1].slips : 1;
    two.appendChild(HS.el('<div class="card"><h3>브랜드별 반품 미발송 <small>매장이 의뢰만 하고 안 보낸 것 · 의뢰일 기준 · 전체 기간 · 누르면 상세</small></h3>' + (pTop.length ? '<div class="rbars">' + pTop.map(([b, o]) => '<div class="rb click" data-b="' + esc(b) + '"><span>' + esc(sh(b)) + '</span><span class="bg"><i style="width:' + Math.max(1.5, (o.slips / mx) * 100) + '%"></i></span><span class="n">' + fmt(o.slips) + ' 전표 · ' + fmt(o.pcs) + ' PCS</span></div>').join('') + '</div>' : '<div class="empty">미처리 없음</div>') + '</div>'));
    const selB = p.b && pb[p.b] ? p.b : pTop.length ? pTop[0][0] : null;
    const pr = selB ? ((pend.find((x) => x.brand === selB) || {}).rows || []).filter((x) => x.open).sort((a, b) => (a.d < b.d ? -1 : 1)) : [];
    const pc = HS.el('<div class="card"><h3>반품 미발송 상세 <small>' + esc(selB ? sh(selB) : '') + ' · 오래된 순 · ' + fmt(pr.length) + '건</small><span class="sp"></span>' + (pr.length ? '<button class="btn sm" id="px">엑셀</button>' : '') + '</h3><div class="tw" style="max-height:360px"><table><tr><th>의뢰일</th><th>의뢰번호</th><th>매장</th><th class="n">의뢰</th><th class="n">미출고</th><th>경과</th><th>전표바코드</th></tr>' +
      (pr.length ? pr.slice(0, 300).map((x) => { const g = dayDiff(x.d, today()); return '<tr><td>' + esc(x.d.slice(5).replace('-', '/')) + '</td><td>' + esc(x.no || '') + '</td><td>' + esc(x.store || '') + '</td><td class="n">' + fmt(x.req) + '</td><td class="n r">' + fmt(x.pend) + '</td><td><span class="tag ' + (g >= 7 ? 'r' : g >= 3 ? 'y' : '') + '">' + g + '일</span></td><td class="mute">' + esc(x.slip || '') + '</td></tr>'; }).join('') + (pr.length > 300 ? '<tr><td colspan="7" class="mute">… ' + fmt(pr.length - 300) + '건 더 (엑셀로 전체 받기)</td></tr>' : '') : '<tr><td colspan="7" class="empty">미처리 없음</td></tr>') + '</table></div></div>');
    two.appendChild(pc);
    two.querySelectorAll('[data-b]').forEach((e) => (e.onclick = () => GO(Object.assign({}, p, { k: 'dash', b: e.dataset.b }))));
    const px = pc.querySelector('#px'); if (px) px.onclick = () => HS.download('반품미처리_' + sh(selB) + '_' + today() + '.xlsx', pr.map((x) => ({ 브랜드: selB, 의뢰일자: x.d, 의뢰번호: x.no, 매장명: x.store, 의뢰수량: x.req, 출고수량: x.out, 미출고수량: x.pend, 경과일: dayDiff(x.d, today()), 전표바코드: x.slip })), '미처리');
    HS.live(['erp_ret_done', 'erp_ret_pend', 'erp_returns_box', 'erp_ret_bag'], () => { if (HS.cur === (opt.view || 'returns')) HS.route(); });
  }
  HS.returnsDash = dash; // 월간 회의 › 입고팀 › 반품 진행 현황에서 같은 대장을 그대로 씀

  // ================= 자료 업데이트 =================
  const SLOTS = [
    { k: 'req', no: 1, l: '매장 반품 등록', sub: '의뢰 대비 출고 반품 현황', cols: '의뢰일자 · 의뢰번호 · 출고일자 · 매장명 · 의뢰수량 · 출고수량 · 미출고수량 · 전표바코드', more: '브랜드: 브랜드 열 → 없으면 파일·시트 이름(핑, 펜텀 …) → 그래도 없으면 직접 선택 · 브랜드별 파일 여러 개 한 번에 가능' },
    { k: 'done', no: 2, l: '고백센터 반품 확정', sub: '출고 반품 현황', cols: '브랜드 · 출고일자 · 매장명 · 출고구분 · 출고번호 · 출고수량 · 전표바코드', more: '파일에 든 날짜 범위는 새 값으로 바꿉니다 (겹쳐 올려도 두 번 세지 않음)' },
    // 2026-11-10: 대장의 '도착 운송사 BOX · 실무진 BOX'를 엑셀로 한꺼번에 채우는 칸 (타이핑 등록은 [박스 수불] 탭에 그대로 있음)
    { k: 'box', no: 3, l: '일별 반품 관리 대장 (박스)', sub: '도착 운송사 BOX · 실무진 BOX', tag: '사내 엑셀', every: '주기: 월 1회 · 메일로 받을 때마다',
      cols: '도착일 · 탑 · 롯데 · 행낭 · 기타 · 기타용품 · 완료 · 대기', more: '반품 관리 엑셀의 <b>일별 반품 관리 대장</b> 시트 · 여러 달이 한 파일에 있어도 됩니다<br>파일에 든 날짜만 새 값으로 바꿉니다 (파일에 없는 날은 그대로)' },
  ];
  async function readFiles(files, only) {
    const out = { req: [], done: [], bags: [], box: [], found: [], miss: [], noBrand: [] };
    for (const f of files) {
      try {
        HS.needXlsx(); const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array', cellFormula: false, cellHTML: false, cellText: false });
        const d = R.readBook(wb.SheetNames.map((n) => ({ name: n, ws: wb.Sheets[n] })), f.name, only, brandOf);
        ['req', 'done', 'bags', 'box', 'noBrand'].forEach((k) => out[k].push(...d[k].map((x) => (k === 'noBrand' ? Object.assign({ file: f.name }, x) : x))));
        d.found.forEach((x) => out.found.push(Object.assign({ file: f.name }, x)));
        if (!d.found.length) out.miss.push(Object.assign({ file: f.name }, d.miss.sort((a, b) => a.miss.length - b.miss.length)[0] || { sheet: '-', miss: [], cols: [] }));
      } catch (e) { out.miss.push({ file: f.name, sheet: '-', err: '파일을 열 수 없습니다 (' + e.message + ')', miss: [], cols: [] }); }
    }
    return out;
  }
  async function upload(body, p) {
    if (!HS.can('returns', 'create')) { body.innerHTML = '<div class="card empty">자료 업데이트 권한이 없습니다</div>'; return; }
    const [oldPend, lastDone, lastBox] = await Promise.all([
      HS.db.list('erp_ret_pend', {}),
      HS.db.list('erp_ret_done', { order: ['updated_at', false], limit: 1, select: 'updated_at,rec_date' }),
      HS.db.list('erp_returns_box', { order: ['updated_at', false], limit: 1, select: 'updated_at,rec_date' }).catch(() => []),
    ]);
    const last = { req: maxAt(oldPend), done: lastDone[0] && lastDone[0].updated_at, box: lastBox[0] && lastBox[0].updated_at };
    const got = {}; let mig = null; // mig: 기존 관리 엑셀의 행낭·타택배·박스
    const grid = HS.el('<div class="np3"></div>'); body.appendChild(grid);
    const pv = HS.el('<div class="card" style="margin-top:14px"><h3>미리보기 <small>확인 후 [등록]</small></h3><div id="pv"><div class="empty">위 칸에 파일을 올려 주세요. 하나만 올려도 됩니다.</div></div></div>'); body.appendChild(pv);
    const pvEl = pv.querySelector('#pv');
    const draw = (sl) => {
      const el = grid.querySelector('[data-slot="' + sl.k + '"]'); const g = got[sl.k];
      let st = '<div class="dz2">파일을 끌어다 놓거나 눌러서 선택<br><span class="mute">화주 ERP에서 받은 파일을 수정 없이 그대로</span></div>';
      if (g && g.busy) st = '<div class="dz2">읽는 중… (큰 파일은 10초 정도)</div>';
      else if (g && g.found.length) {
        const fs = [...new Set(g.found.map((x) => x.file))];
        st = '<div class="dz2 ok">✔ <b>' + esc(fs[0]) + '</b>' + (fs.length > 1 ? ' 외 ' + (fs.length - 1) + '개' : '') + '<br>' + (sl.k === 'req'
          ? (() => { const by = {}; g.req.forEach((r) => (by[r.brand] = (by[r.brand] || 0) + 1)); const ds = g.req.map((r) => r.d).sort(); const op = g.req.filter((r) => !r.out_date); return Object.entries(by).map(([b, n]) => esc(sh(b)) + ' ' + fmt(n)).join(' · ') + ' 줄<br>의뢰 ' + (ds[0] || '') + ' ~ ' + (ds[ds.length - 1] || '') + ' · <b style="color:var(--neg)">미출고 ' + fmt(op.length) + '건 (' + fmt(g.req.reduce((a, r) => a + (r.pend || 0), 0)) + ' PCS)</b>'; })()
          : sl.k === 'box'
            ? (() => { const ds = g.box.map((r) => r.rec_date).sort(); const ms = [...new Set(ds.map((d) => d.slice(0, 7)))]; return fmt(g.box.length) + '일 · ' + (ds[0] || '') + ' ~ ' + (ds[ds.length - 1] || '') + (ms.length > 1 ? ' (' + ms.length + '개월)' : '') + '<br>도착 BOX ' + fmt(g.box.reduce((a, r) => a + r.top + r.lotte + r.haengnang + r.etc, 0)) + ' · 실무진 완료 ' + fmt(g.box.reduce((a, r) => a + r.done, 0)); })()
            : (() => { const ds = g.done.map((r) => r.d).sort(); return fmt(g.done.length) + '줄 · 반품 확정 ' + (ds[0] || '') + ' ~ ' + (ds[ds.length - 1] || '') + '<br>' + fmt(g.done.reduce((a, r) => a + r.pcs, 0)) + ' PCS'; })())
          + (g.noBrand.length ? '<div style="margin-top:8px;color:var(--neg)">브랜드를 모르는 줄 ' + fmt(g.noBrand.length) + '개 → <select class="in" data-nb style="width:auto;display:inline-block"><option value="">브랜드 선택</option>' + HS.cache.brands.map((b) => '<option>' + esc(b.name) + '</option>').join('') + '</select></div>' : '')
          + (g.miss.length ? '<div style="margin-top:6px;color:var(--neg)">✖ 제외: ' + g.miss.map((x) => esc(x.file)).join(', ') + '</div>' : '') + '</div>';
      } else if (g && (g.miss.length || g.noBrand.length)) st = '<div class="dz2 bad">' + g.miss.map((x) => '✖ <b>' + esc(x.file) + '</b><br>' + (x.err ? esc(x.err) : sl.l + ' 파일이 아닙니다<br><span class="mute">' + (x.miss.length ? '\'' + esc(x.miss.join('\', \'')) + '\' 열을 찾지 못했습니다' : '자료 줄을 찾지 못했습니다') + (x.cols && x.cols.length ? ' (찾은 열: ' + esc(x.cols.join(' · ')) + ' …)' : '') + '</span>')).join('<br>') + '</div>';
      el.innerHTML = '<h4><span class="no">' + sl.no + '</span>' + sl.l + ' <span class="tag b">' + (sl.tag || '화주 ERP') + '</span><span class="mute" style="font-weight:400;font-size:12px">' + sl.sub + '</span></h4>' + st + '<div class="cols">꼭 있어야 할 열: <b>' + sl.cols + '</b> ' + HS.fmtLink('ret_' + sl.k, '양식') + '<br>' + sl.more + '<br>' + (sl.every || '주기: 매일 17~18시') + '</div><div class="stl"><span class="mute">지난 업데이트</span><span>' + esc(when(last[sl.k])) + '</span></div><div style="display:flex;gap:6px"><button class="btn sm' + (g && g.found.length ? '' : ' p') + '" data-pick>' + (g && g.found.length ? '다른 파일로 바꾸기' : '파일 선택') + '</button>' + (g ? '<button class="btn sm" data-clr>비우기</button>' : '') + '</div><input type="file" multiple accept=".xlsx,.xlsm,.xls,.csv" class="hide">';
      const fi = el.querySelector('input[type=file]'); el.querySelector('[data-pick]').onclick = () => fi.click(); fi.onchange = () => load(sl, [...fi.files]);
      el.querySelector('.dz2').onclick = (e) => { if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'OPTION') fi.click(); };
      const cl = el.querySelector('[data-clr]'); if (cl) cl.onclick = () => { delete got[sl.k]; if (sl.k === 'req' || sl.k === 'done') mig = null; draw(sl); refresh(); };
      const nb = el.querySelector('[data-nb]'); if (nb) nb.onchange = () => { if (!nb.value) return; g.noBrand.forEach((r) => g.req.push(Object.assign({}, r, { brand: nb.value }))); g.noBrand = []; if (!g.found.length) g.found.push({ file: '-', kind: 'req' }); draw(sl); refresh(); };
      el.ondragover = (e) => { e.preventDefault(); el.classList.add('over'); }; el.ondragleave = () => el.classList.remove('over');
      el.ondrop = (e) => { e.preventDefault(); el.classList.remove('over'); load(sl, [...e.dataTransfer.files]); };
    };
    async function load(sl, files) {
      if (!files.length) return;
      got[sl.k] = { busy: true, found: [], miss: [], noBrand: [] }; draw(sl); await new Promise((r) => setTimeout(r, 30));
      got[sl.k] = await readFiles(files, R.SLOT[sl.k]);
      if (got[sl.k].noBrand.length && !got[sl.k].found.length) got[sl.k].found = []; // 브랜드 선택 대기
      // 박스 대장: 어느 날이 이미 들어 있는지(= 덮어쓰는 날) 미리 보여 주려고 지금 값을 함께 읽어 둔다
      if (sl.k === 'box' && got.box.box.length) { const ds = got.box.box.map((r) => r.rec_date).sort(); got.box.old = await HS.db.list('erp_returns_box', { gte: { rec_date: ds[0] }, lte: { rec_date: ds[ds.length - 1] } }).catch(() => []); }
      draw(sl); refresh();
    }
    SLOTS.forEach((sl) => { grid.appendChild(HS.el('<div class="slot" data-slot="' + sl.k + '"></div>')); draw(sl); });
    // 기존 관리 엑셀 (V1.211) 한 번에
    const bk = HS.el('<div class="card" style="margin-bottom:14px;border:2px solid var(--gold)"><h3>⬆ 대량 등록 <small>반품 관리 대장(V1.211) 한 파일로 통째로 — 아래 1 · 2 · 3번은 항목별로 따로 올릴 때</small><span class="sp"></span><button class="btn p sm">파일 선택</button></h3><div class="mute" style="font-size:12px;line-height:1.7">브랜드 시트(핑 · 펜텀 …) → 1번, 출고반품현황 → 2번, 행낭 · 타택배 시트 → 행낭/타택배 대장, 일별 대장의 탑 · 롯데 · 기타용품 · 실무진 BOX → 박스 수불로 나눠 넣습니다. 같은 파일을 다시 올려도 두 번 들어가지 않습니다.<br><b>[설정 › 엑셀 · 물동량 업로드] 가 아니라 여기에 올려 주세요</b> — 그 칸은 일별 대장 한 시트만 읽습니다.</div><div id="bkr"></div><input type="file" accept=".xlsx,.xlsm,.xls" class="hide"></div>');
    body.insertBefore(bk, grid);
    const bfi = bk.querySelector('input'); bk.querySelector('button').onclick = () => bfi.click();
    bfi.onchange = async () => {
      const f = [...bfi.files]; if (!f.length) return; const r = bk.querySelector('#bkr'); r.innerHTML = '<div class="empty">읽는 중… (행낭 시트가 크면 10~20초)</div>'; await new Promise((x) => setTimeout(x, 30));
      const d = await readFiles(f, null); const kinds = [...new Set(d.found.map((x) => x.kind))];
      if (kinds.length < 2) { r.innerHTML = '<div class="lock" style="margin-top:10px;background:#FBE6E2;border-color:#F0B8AE">✖ <b>' + esc(f[0].name) + '</b>은(는) 여러 자료가 든 반품 관리 엑셀이 아닙니다. 자료별로 위 1 · 2 · 3번 칸에 올려 주세요 (일별 대장만 든 파일은 3번).</div>'; return; }
      const pick = (k) => ({ found: d.found.filter((x) => x.kind === k), miss: [], noBrand: k === 'req' ? d.noBrand : [], req: k === 'req' ? d.req : [], done: k === 'done' ? d.done : [] });
      if (kinds.indexOf('req') >= 0) { got.req = pick('req'); draw(SLOTS[0]); }
      if (kinds.indexOf('done') >= 0) { got.done = pick('done'); draw(SLOTS[1]); }
      mig = { bags: d.bags, box: d.box };
      const nh = d.bags.filter((b) => b.kind === '행낭').length, nt = d.bags.length - nh;
      r.innerHTML = '<div class="lock ok" style="margin-top:10px">✔ ' + esc(d.found.map((x) => x.sheet + ' → ' + x.label + ' ' + fmt(x.rows)).join(' · ')) + '<br>행낭 ' + fmt(nh) + '건 · 타택배 ' + fmt(nt) + '건 · 박스 수불 ' + fmt(d.box.length) + '일도 함께 등록합니다 (박스 수불은 같은 날짜 값을 바꿉니다)</div>';
      refresh();
    };
    function refresh() {
      const rq = got.req && !got.req.busy ? got.req.req : [], dn = got.done && !got.done.busy ? got.done.done : [];
      const bx = got.box && !got.box.busy ? got.box.box : [], bxOld = (got.box && got.box.old) || [];
      if (!rq.length && !dn.length && !bx.length && !mig) { pvEl.innerHTML = '<div class="empty">위 칸에 파일을 올려 주세요. 하나만 올려도 됩니다.</div>'; return; }
      const oldMap = Object.fromEntries(oldPend.map((x) => [x.brand, x]));
      const merged = rq.length ? R.pendMerge(rq, oldMap) : [];
      const agg = dn.length ? R.doneAgg(dn) : null;
      let h = '';
      if (agg) { const lastD = agg.rows.map((r) => r.rec_date).sort().pop(); const ld = agg.rows.filter((r) => r.rec_date === lastD); h += '<div class="lock ok" style="margin-bottom:8px">✔ 고백센터 반품 확정 ' + esc(agg.from) + ' ~ ' + esc(agg.to) + ' · ' + fmt(dn.length) + ' 전표 · ' + fmt(dn.reduce((a, r) => a + r.pcs, 0)) + ' PCS · 마지막 날 ' + esc(lastD.slice(5)) + ' ' + fmt(ld.reduce((a, r) => a + r.slips, 0)) + ' 전표 / ' + fmt(ld.reduce((a, r) => a + r.pcs, 0)) + ' PCS</div>'; }
      if (merged.length) h += '<div class="tw" style="margin-bottom:8px"><table><tr><th>브랜드</th><th>파일 의뢰일</th><th class="n">의뢰 전표</th><th class="n">미처리 (이 기간) 지금 → 새 파일</th><th class="n">미처리 전체 (새 파일 반영 후)</th></tr>' + merged.map((m) => { const o = m.rows.filter((x) => x.open); const ds = rq.filter((r) => r.brand === m.brand).map((r) => r.d).sort(); return '<tr><td>' + esc(sh(m.brand)) + '</td><td>' + esc(ds[0] + ' ~ ' + ds[ds.length - 1]) + '</td><td class="n">' + fmt(m.req_slips) + '</td><td class="n">' + fmt(m._old) + ' → <b>' + fmt(m._new) + '</b></td><td class="n ' + (o.length ? 'neg' : '') + '">' + fmt(o.length) + ' 전표 · ' + fmt(m.rows.reduce((a, x) => a + (x.pend || 0), 0)) + ' PCS</td></tr>'; }).join('') + '</table></div>';
      // 박스 대장 — 달마다 며칠이 들어가고 어느 날을 덮어쓰는지
      if (bx.length) {
        const had = new Set(bxOld.filter((o) => (+o.top || 0) + (+o.lotte || 0) + (+o.haengnang || 0) + (+o.etc || 0) + (+o.hanger || 0) + (+o.done || 0)).map((o) => o.rec_date));
        const by = {}; bx.forEach((r) => { const m = (by[r.rec_date.slice(0, 7)] = by[r.rec_date.slice(0, 7)] || { days: 0, over: 0, box: 0, hanger: 0, done: 0, wait: 0 }); m.days++; if (had.has(r.rec_date)) m.over++; m.box += r.top + r.lotte + r.haengnang + r.etc; m.hanger += r.hanger; m.done += r.done; m.wait += r.pending; });
        const ms = Object.keys(by).sort();
        h += '<div class="tw no-tools" style="margin-bottom:8px"><table><tr><th>달</th><th class="n">들어갈 날</th><th class="n">도착 운송사 BOX</th><th class="n">기타용품</th><th class="n">실무진 완료</th><th class="n">대기</th><th>덮어씀</th></tr>' +
          ms.map((m) => { const x = by[m]; return '<tr><td>' + esc(m) + '</td><td class="n">' + fmt(x.days) + '일</td><td class="n b">' + fmt(x.box) + '</td><td class="n">' + fmt(x.hanger) + '</td><td class="n">' + fmt(x.done) + '</td><td class="n">' + fmt(x.wait) + '</td><td>' + (x.over ? '<span class="tag y">' + fmt(x.over) + '일 덮어씀</span>' : '<span class="mute">새로 들어감</span>') + '</td></tr>'; }).join('') +
          '</table></div><div class="mute" style="font-size:11.5px;margin-bottom:8px">· 파일에 든 날짜만 새 값으로 바꿉니다 (파일에 없는 날은 그대로 둡니다)<br>· 행낭 · 기타는 <a href="#/returns?k=h">행낭</a> · <a href="#/returns?k=t">타택배</a> 등록 자료가 있으면 대장에 그 합계가 먼저 보입니다</div>';
      }
      if (mig) h += '<div class="lock" style="margin-bottom:8px">행낭 · 타택배 ' + fmt(mig.bags.length) + '건 · 박스 수불 ' + fmt(mig.box.length) + '일 함께 등록</div>';
      h += '<div style="display:flex;justify-content:flex-end"><button class="btn p" id="reg">등록</button></div>';
      pvEl.innerHTML = h;
      pvEl.querySelector('#reg').onclick = async () => {
        const btn = pvEl.querySelector('#reg'); btn.disabled = true; const st = HS.el('<div class="mute" style="margin-top:8px"></div>'); pvEl.appendChild(st);
        try {
          if (agg) { st.textContent = '반품 확정 저장 중…'; const old = await HS.db.list('erp_ret_done', { gte: { rec_date: agg.from }, lte: { rec_date: agg.to } }); await HS.db.upsert('erp_ret_done', R.doneUpserts(agg, old).map((r) => ({ rec_date: r.rec_date, brand: r.brand, slips: r.slips, pcs: r.pcs }))); }
          if (merged.length) { st.textContent = '매장 반품 저장 중…'; await HS.db.upsert('erp_ret_pend', merged.map((m) => ({ brand: m.brand, req_from: m.req_from, req_to: m.req_to, req_slips: m.req_slips, req_pcs: m.req_pcs, rows: m.rows }))); }
          if (mig && mig.bags.length) await HS.db.upsert('erp_ret_bag', mig.bags, (n, t) => (st.textContent = '행낭 · 타택배 저장 중… ' + fmt(n) + ' / ' + fmt(t)));
          if (mig && mig.box.length) { st.textContent = '박스 수불 저장 중…'; await HS.db.upsert('erp_returns_box', mig.box); }
          if (bx.length) await HS.db.upsert('erp_returns_box', bx, (n, t) => (st.textContent = '일별 대장 박스 저장 중… ' + fmt(n) + ' / ' + fmt(t)));
          await HS.db.insert('erp_uploads', { file_name: [...new Set([].concat(got.req ? got.req.found : [], got.done ? got.done.found : [], got.box ? got.box.found : []).map((x) => x.file))].join(', ').slice(0, 300), kinds: ['반품 관리'], rows: rq.length + dn.length + bx.length + (mig ? mig.bags.length : 0), summary: { req: rq.length, done: dn.length, bags: mig ? mig.bags.length : 0, box: (mig ? mig.box.length : 0) + bx.length } }).catch(() => {});
          HS.toast('등록했습니다', 'ok');
          const bm = bx.length ? bx.map((r) => r.rec_date).sort().pop().slice(0, 7) : null; // 박스만 올렸으면 그 달 대장으로
          HS.go('returns', bm && !rq.length && !dn.length ? { k: 'dash', m: bm } : { k: 'dash' });
        } catch (e) { btn.disabled = false; st.textContent = ''; HS.err(e); }
      };
    }
  }

  // ================= 행낭 · 타택배 등록 =================
  const BAG_COLS = {
    행낭: [['rec_date', '날짜', 'date', 130], ['brand', '브랜드', 'brand', 140], ['confirmed', '반품확정여부', 'conf', 110], ['store', '매장명', 'store', 0], ['box', 'Box', 'num', 70], ['note', '비고', 'text', 0]],
    타택배: [['rec_date', '날짜', 'date', 130], ['courier', '택배사', 'courier', 100], ['gubun', '구분', 'gubun', 90], ['brand', '브랜드', 'brand', 130], ['confirmed', '반품확정여부', 'conf', 110], ['store', '매장명', 'store', 0], ['box', 'Box', 'num', 70], ['note', '비고', 'text', 0]],
  };
  const T_MORE = [['status', '상태'], ['check_date', '확인일자'], ['checker', '확인자'], ['client_note', '위탁사 비고'], ['proc_date', '처리일자'], ['proc_by', '처리자'], ['proc_note', '처리자 비고']];
  async function bags(body, p, mo, kind) {
    const [m1, m2] = monthRange(mo + '-01'); const cols = BAG_COLS[kind];
    const [rows, recent] = await Promise.all([
      HS.db.list('erp_ret_bag', { eq: { kind }, gte: { rec_date: m1 }, lte: { rec_date: m2 }, order: ['rec_date', false] }),
      HS.db.list('erp_ret_bag', { eq: { kind }, gte: { rec_date: addDays(today(), -120) }, select: 'store,courier,gubun', limit: 5000 }),
    ]);
    const canC = HS.can('returns', 'create'), canE = HS.can('returns', 'edit') || canC;
    const uniq = (k) => [...new Set(recent.map((r) => r[k]).filter(Boolean))].sort();
    const dl = HS.el('<datalist id="rstore">' + uniq('store').map((s) => '<option value="' + esc(s) + '">').join('') + '</datalist><datalist id="rcourier">' + [...new Set(['로젠', 'CJ', '한진', '우체국', '경동', '용차'].concat(uniq('courier')))].map((s) => '<option value="' + esc(s) + '">').join('') + '</datalist><datalist id="rgubun">' + [...new Set(['반품', '샘플', '기타'].concat(uniq('gubun')))].map((s) => '<option value="' + esc(s) + '">').join('') + '</datalist>');
    body.appendChild(dl);
    const brandOpts = '<option value=""></option>' + HS.cache.brands.filter((b) => b.active !== false).map((b) => '<option>' + esc(b.name) + '</option>').join('') + '<option>샘플</option><option>기타</option>';
    const inp = (c, v) => { const [k, , t] = c; v = v == null ? '' : v;
      if (t === 'brand') return '<select data-k="' + k + '">' + brandOpts.replace('<option>' + esc(v) + '</option>', '<option selected>' + esc(v) + '</option>') + '</select>';
      if (t === 'conf') return '<select data-k="' + k + '"><option value=""></option><option' + (v === '확정' ? ' selected' : '') + '>확정</option><option' + (v === '미확정' ? ' selected' : '') + '>미확정</option></select>';
      if (t === 'date') return '<input type="date" data-k="' + k + '" value="' + esc(v) + '">';
      if (t === 'num') return '<input data-k="' + k + '" inputmode="decimal" style="text-align:right" value="' + esc(v) + '">';
      return '<input data-k="' + k + '" value="' + esc(v) + '"' + (t === 'store' ? ' list="rstore"' : t === 'courier' ? ' list="rcourier"' : t === 'gubun' ? ' list="rgubun"' : '') + '>'; };
    // 빠른 입력
    if (canC) {
      const qc = HS.el('<div class="card"><h3>' + kind + ' 반품 등록 <small id="qn"></small><span class="sp"></span><button class="btn sm" id="paste">엑셀에서 붙여넣기</button><button class="btn sm p" id="qs" style="margin-left:6px">저장</button></h3><div class="tw qe"><table><thead><tr>' + cols.map((c) => '<th' + (c[3] ? ' style="width:' + c[3] + 'px"' : '') + '>' + c[1] + '</th>').join('') + '<th style="width:30px"></th></tr></thead><tbody></tbody><tfoot><tr><td colspan="' + (cols.length + 1) + '"><button class="btn sm" id="qa">+ 줄 추가</button> <span class="mute" style="font-size:11.5px">마지막 칸에서 Enter = 새 줄 · 날짜 · 브랜드 · 택배사는 윗줄 값 그대로 · 매장명 자동 완성</span></td></tr></tfoot></table></div></div>');
      body.appendChild(qc);
      const tbody = qc.querySelector('tbody');
      const count = () => { const n = [...tbody.children].filter((tr) => tr.querySelector('[data-k=store]').value.trim() || +tr.querySelector('[data-k=box]').value).length; qc.querySelector('#qn').textContent = '입력 중 ' + n + '줄'; qc.querySelector('#qs').textContent = '저장' + (n ? ' (' + n + '줄)' : ''); };
      const addRow = (vals, focus) => {
        const prev = tbody.lastElementChild; const pv = {}; if (prev) prev.querySelectorAll('[data-k]').forEach((e) => (pv[e.dataset.k] = e.value));
        const base = Object.assign({ rec_date: today() }, prev ? { rec_date: pv.rec_date, brand: pv.brand, courier: pv.courier, gubun: pv.gubun, confirmed: pv.confirmed } : {}, vals || {});
        tbody.insertAdjacentHTML('beforeend', '<tr>' + cols.map((c) => '<td>' + inp(c, base[c[0]]) + '</td>').join('') + '<td><span class="click mute" title="지우기">✕</span></td></tr>'); const tr = tbody.lastElementChild;
        tr.querySelector('.click').onclick = () => { tr.remove(); if (!tbody.children.length) addRow(); count(); };
        tr.querySelectorAll('[data-k]').forEach((e) => { e.oninput = count; e.onchange = () => { count(); if (tr.classList.contains('perr')) { const o = {}; tr.querySelectorAll('[data-k]').forEach((x) => (o[x.dataset.k] = x.value.trim())); markErr(tr, checkRow(Object.assign({}, o, { _x: o.box }))); } }; });
        const lastIn = tr.querySelector('[data-k=note]'); lastIn.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addRow(null, true); } };
        if (focus) tr.querySelector('[data-k=store]').focus();
        count(); return tr;
      };
      addRow();
      qc.querySelector('#qa').onclick = () => addRow(null, true);
      // 엑셀에서 붙여넣기 — 제목줄이 있으면 열 순서 자동 맞춤 · 넣기 전에 미리보기에서 줄마다 오류 확인
      const ALIAS = { rec_date: /^(날짜|일자|반품일|도착일|입고일)$/, courier: /^(택배사|운송사)$/, gubun: /^구분$/, brand: /^(브랜드|브랜드명)$/, confirmed: /^(반품확정여부|확정여부|반품확정|확정)$/, store: /^(매장명|매장|거래처)$/, box: /^(box|박스|박스수|수량|box수)$/i, note: /^(비고|메모)$/ };
      const toDay = (v) => { const t = String(v || '').trim(); if (!t) return null; const d = R.day(t); if (d && /^\d{4}-\d\d-\d\d$/.test(d)) return d;
        const m = t.match(/^(\d{1,2})\s*[/.\-월]\s*(\d{1,2})\s*일?$/); if (m) { const y = +today().slice(0, 4); const mo = +m[1], dd = +m[2]; if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null; const yy = mo > +today().slice(5, 7) + 1 ? y - 1 : y; return yy + '-' + String(mo).padStart(2, '0') + '-' + String(dd).padStart(2, '0'); } return null; };
      const brandList = HS.cache.brands.filter((b) => b.active !== false).map((b) => b.name).concat(['샘플', '기타']);
      const checkRow = (o) => { const e = []; if (!o.rec_date) e.push('날짜 인식 불가'); if (o._b && !o.brand) e.push('브랜드 "' + o._b + '" 목록에 없음'); if (!o.brand && !o._b) e.push('브랜드 빈칸'); if (!String(o.store || '').trim()) e.push('매장명 빈칸'); if (o._x != null && o._x !== '' && !/^-?\d+(\.\d+)?$/.test(String(o._x).replace(/,/g, ''))) e.push('Box "' + o._x + '" 숫자 아님'); else if (!(+String(o.box || 0).replace(/,/g, '') > 0)) e.push('Box 0 또는 빈칸'); if (o.confirmed && !/^(확정|미확정)$/.test(o.confirmed)) e.push('반품확정여부는 확정 · 미확정'); return e; };
      const parsePaste = (raw) => {
        const lines = raw.split(/\r?\n/).filter((l) => l.replace(/\t/g, '').trim()); if (!lines.length) return { rows: [], head: false };
        const h = lines[0].split('\t').map((x) => x.trim()); const map = {}; h.forEach((x, i) => { for (const k in ALIAS) if (ALIAS[k].test(x.replace(/\s/g, '')) && map[k] == null) map[k] = i; });
        const head = Object.keys(map).length >= 2 && (map.rec_date != null || map.store != null || map.brand != null) && !h.some((x) => /^\d{4}[-./]\d|^\d+$/.test(x)); const idx = head ? map : Object.fromEntries(cols.map((c, i) => [c[0], i]));
        const rows = (head ? lines.slice(1) : lines).map((l, n) => { const c = l.split('\t'); const o = { _n: n + (head ? 2 : 1) }; cols.forEach((cc) => { const i = idx[cc[0]]; let v = i == null ? '' : (c[i] || '').trim(); o['_' + cc[0]] = v;
          if (cc[2] === 'date') v = toDay(v); else if (cc[2] === 'brand') { o._b = v; const bn = v ? brandOf(v) : null; v = bn && brandList.indexOf(bn) >= 0 ? bn : brandList.indexOf(v) >= 0 ? v : ''; } else if (cc[2] === 'num') { o._x = v; v = v.replace(/,/g, ''); if (!/^-?\d+(\.\d+)?$/.test(v)) v = ''; } else if (cc[2] === 'conf') v = /^미/.test(v) ? '미확정' : /확정|^y|^o/i.test(v) ? '확정' : v; o[cc[0]] = v; });
          if (!o._b) delete o._b; o.err = checkRow(o); return o; });
        return { rows, head, missing: head ? cols.filter((c) => idx[c[0]] == null && c[0] !== 'note' && c[0] !== 'confirmed').map((c) => c[1]) : [] };
      };
      const markErr = (tr, e) => { tr.classList.toggle('perr', !!(e && e.length)); tr.title = e && e.length ? e.join(' · ') : ''; };
      qc.querySelector('#paste').onclick = async () => {
        const f = HS.el('<div><div class="mute" style="font-size:12px;margin-bottom:6px;line-height:1.6">기존 ' + kind + ' 시트에서 줄을 복사(Ctrl+C)해서 아래에 붙여넣기(Ctrl+V) 하세요 · <b>제목줄까지 복사하면 열 순서를 자동으로 맞춥니다</b><br>제목줄 없이 붙일 때 열 순서: ' + cols.map((c) => c[1]).join(' · ') + '</div><textarea class="in" id="pt" style="min-height:150px;width:100%"></textarea><div id="pv" style="margin-top:8px"></div></div>');
        let P = { rows: [] };
        const prev = () => { P = parsePaste(f.querySelector('#pt').value); const bad = P.rows.filter((r) => r.err.length); const pv = f.querySelector('#pv');
          if (!P.rows.length) { pv.innerHTML = ''; return; }
          pv.innerHTML = '<div class="' + (bad.length ? 'lock' : 'lock ok') + '" style="margin-bottom:6px">' + (P.head ? '제목줄 인식 → 열 순서 자동 맞춤 · ' : '제목줄 없음 → 화면 열 순서로 넣음 · ') + '<b>' + P.rows.length + '줄</b> 중 정상 ' + (P.rows.length - bad.length) + ' · <b class="neg">오류 ' + bad.length + '</b>' + (P.missing && P.missing.length ? ' · 못 찾은 칸: ' + esc(P.missing.join(', ')) : '') + '</div>' +
            '<div class="tw" style="max-height:260px"><table class="pvt"><tr><th>줄</th>' + cols.map((c) => '<th>' + c[1] + '</th>').join('') + '<th>오류</th></tr>' + P.rows.slice(0, 500).map((r) => '<tr class="' + (r.err.length ? 'perr' : '') + '"><td class="mute">' + r._n + '</td>' + cols.map((c) => { const raw = r['_' + c[0]]; const v = r[c[0]]; const bad = (c[2] === 'date' && !v) || (c[2] === 'brand' && !v) || (c[2] === 'num' && r.err.some((e) => /^Box/.test(e))) || (c[2] === 'store' && !String(v || '').trim()); return '<td' + (bad ? ' class="bad"' : '') + '>' + esc(c[2] === 'date' ? (v || raw || '') : c[2] === 'brand' ? (v || raw || '') : v || '') + '</td>'; }).join('') + '<td class="neg">' + esc(r.err.join(' · ')) + '</td></tr>').join('') + '</table></div>'; };
        f.querySelector('#pt').oninput = prev;
        const res = await HS.modal('엑셀에서 붙여넣기 · 미리보기', f, [['취소', null], ['오류 줄도 넣고 화면에서 고치기', 'all'], ['정상 줄만 넣기', 'ok', 'p']], { wide: true });
        if (!res || !P.rows.length) return; const use = res === 'ok' ? P.rows.filter((r) => !r.err.length) : P.rows; if (!use.length) return HS.toast('넣을 정상 줄이 없습니다');
        const first = tbody.firstElementChild; if (tbody.children.length === 1 && first && !first.querySelector('[data-k=store]').value) first.remove();
        use.forEach((r) => { const o = {}; cols.forEach((c) => (o[c[0]] = c[2] === 'date' ? r.rec_date || '' : c[2] === 'num' ? (r._x || '').replace(/,/g, '') : r[c[0]])); const tr = addRow(o); markErr(tr, r.err); });
        const skipped = P.rows.length - use.length; HS.toast(use.length + '줄 넣었습니다' + (skipped ? ' · 오류 ' + skipped + '줄은 뺐습니다' : '') + (res === 'all' && P.rows.some((r) => r.err.length) ? ' · 빨간 줄을 고친 뒤 저장하세요' : ''), 'ok');
      };
      qc.querySelector('#qs').onclick = async () => {
        const stamp = Date.now().toString(36); const out = [];
        let bad = 0; [...tbody.children].forEach((tr) => { const o = {}; tr.querySelectorAll('[data-k]').forEach((e) => (o[e.dataset.k] = e.value.trim())); if (!o.store && !o.box && !o.note) { markErr(tr, null); return; } const e = checkRow(Object.assign({}, o, { _x: o.box })); markErr(tr, e); if (e.length) bad++; });
        if (bad) return HS.toast('빨간 줄 ' + bad + '개를 고친 뒤 저장하세요 (줄에 마우스를 올리면 이유가 보입니다)');
        [...tbody.children].forEach((tr, i) => { const o = { kind }; tr.querySelectorAll('[data-k]').forEach((e) => (o[e.dataset.k] = e.value.trim() || null)); if (!o.store && !o.box && !o.note) return; o.box = +o.box || 0; o.source_key = 'm|' + stamp + '|' + i + '|' + Math.random().toString(36).slice(2, 6); if (!o.rec_date) o.rec_date = today(); out.push(o); });
        if (!out.length) return HS.toast('입력한 줄이 없습니다');
        try { await HS.db.upsert('erp_ret_bag', out); HS.toast(out.length + '줄 저장했습니다', 'ok'); HS.go('returns', { k: kind === '행낭' ? 'h' : 't', m: out[0].rec_date.slice(0, 7) }); } catch (e) { HS.err(e); }
      };
    }
    // 대장
    const q = p.q || '';
    const fl = rows.filter((r) => !q || [r.brand, r.store, r.note, r.courier, r.gubun, r.status].join(' ').indexOf(q) >= 0);
    const tb = fl.reduce((a, r) => a + (+r.box || 0), 0);
    const lc = HS.el('<div class="card" style="margin-top:14px"><h3>' + kind + ' 대장 <small>' + esc(mo) + ' · ' + fmt(fl.length) + '건 · ' + fmt(tb) + ' BOX</small><span class="sp"></span><input class="in" id="q" placeholder="검색 (브랜드 · 매장)" style="width:180px"><button class="btn sm" id="xl" style="margin-left:6px">엑셀</button></h3><div class="tw" style="max-height:560px"><table><tr>' + cols.map((c) => '<th' + (c[2] === 'num' ? ' class="n"' : '') + '>' + c[1] + '</th>').join('') + (kind === '타택배' ? '<th>상태</th>' : '') + '</tr>' +
      (fl.length ? fl.slice(0, 1000).map((r) => '<tr class="click" data-id="' + r.id + '">' + cols.map((c) => '<td' + (c[2] === 'num' ? ' class="n"' : '') + '>' + esc(c[2] === 'date' ? (r[c[0]] || '').slice(5).replace('-', '/') : c[2] === 'num' ? fmt(r[c[0]]) : r[c[0]] || (c[2] === 'conf' ? '-' : '')) + '</td>').join('') + (kind === '타택배' ? '<td>' + (r.status ? '<span class="tag ' + (/완료/.test(r.status) ? 'g' : 'y') + '">' + esc(r.status) + '</span>' : r.proc_date ? '<span class="tag g">처리 완료</span>' : '<span class="tag y">확인 대기</span>') + '</td>' : '') + '</tr>').join('') + (fl.length > 1000 ? '<tr><td colspan="12" class="mute">… ' + fmt(fl.length - 1000) + '건 더 (검색 또는 엑셀)</td></tr>' : '') : '<tr><td colspan="12" class="empty">이 달 ' + kind + ' 자료가 없습니다</td></tr>') + '</table></div></div>');
    body.appendChild(lc);
    const qi = lc.querySelector('#q'); qi.value = q; qi.onchange = () => HS.go('returns', Object.assign({}, p, { q: qi.value }));
    lc.querySelector('#xl').onclick = () => HS.download(kind + '_' + mo + '.xlsx', fl.map((r) => { const o = {}; cols.forEach((c) => (o[c[1]] = r[c[0]])); if (kind === '타택배') T_MORE.forEach(([k, l]) => (o[l] = r[k])); return o; }), kind);
    lc.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = async () => {
      const r = rows.find((x) => x.id === +tr.dataset.id); if (!r) return;
      const all = cols.concat(kind === '타택배' ? T_MORE.map(([k, l]) => [k, l, /date/.test(k) ? 'date' : 'text', 0]) : []);
      const f = HS.el('<div class="form qe">' + all.map((c) => '<label class="f' + (c[2] === 'text' || c[2] === 'store' ? ' wide' : '') + '">' + c[1] + inp(c, r[c[0]]) + '</label>').join('') + '</div>');
      f.querySelectorAll('input,select').forEach((e) => e.classList.add('in'));
      const btn = [['닫기', null]]; if (canE) btn.push(['저장', 'save', 'p']); if (HS.can('returns', 'delete') || (canC && r.updated_by === HS.me.id)) btn.unshift(['삭제', 'del', 'r']);
      const res = await HS.modal(kind + ' 수정', f, btn, { onOk: async (a) => { if (a !== 'save') return; const o = { kind, source_key: r.source_key }; f.querySelectorAll('[data-k]').forEach((e) => (o[e.dataset.k] = e.value.trim() || null)); o.box = +o.box || 0; await HS.db.upsert('erp_ret_bag', [o]); HS.toast('저장했습니다', 'ok'); HS.route(); } });
      if (res === 'del' && (await HS.confirm('이 줄을 지울까요?'))) { await HS.db.remove('erp_ret_bag', { id: r.id }).catch(HS.err); HS.route(); }
    }));
  }
})();
