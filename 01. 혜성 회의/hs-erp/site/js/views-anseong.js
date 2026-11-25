/* 안성센터 연동 — 안성 자료 API(hq_export)를 ERP 서버가 받아 저장한 자료 보기
 *  · 본사 전용 열쇠(hq_)는 ERP DB 안에만 보관 (화면 · 직원 브라우저로 나가지 않음)
 *  · 자동: 매일 08:30 · 18:30 최근 7일 다시 받기 · 화면: [지금 가져오기] · [기간 지정]
 *  · 받는 자료: 날짜별 요약 · 출고(택배사별) · 포승이관 · 인원(공정별) + (고르면) 반품검수 박스별 · 소터 스타일별 · 수불·재고 — 금액 없음
 *  · 화면 탭: 요약 · 반품검수 · 소터 · 수불·재고 · 받을 항목 */
(function () {
  'use strict';
  const { esc, fmt, today, addDays } = HS;
  const n0 = (v) => (v == null ? '<span class="mute">-</span>' : fmt(Math.round(+v * 10) / 10));
  const sum = (rows, k) => rows.reduce((a, r) => a + (+r[k] || 0), 0);
  const monthStart = () => today().slice(0, 8) + '01';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function pullAndCollect(from, to, msgEl) {
    const n = await HS.db.rpc('erp_as_pull', { p_from: from, p_to: to });
    for (let i = 0; i < 15; i++) { // 응답 기다리기 (최대 약 45초)
      if (msgEl) msgEl.textContent = '안성 자료 받는 중… 요청 ' + n + '건 · ' + (i * 3) + '초';
      await wait(3000); await HS.db.rpc('erp_as_collect');
      const st = await HS.db.rpc('erp_as_status'); if (!(st.last || []).some((x) => !x.done)) return st;
    }
    return HS.db.rpc('erp_as_status');
  }
  const TABS = [['sum', '요약'], ['ret', '반품검수'], ['sorter', '소터'], ['inv', '수불 · 재고'], ['opt', '받을 항목']];
  const TYPES = [['daily', '날짜별 요약', '반품확정 · 소터 · 출고 · 이관 장수 · 박스, 작업 인원', '하루 1줄', true], ['ship', '출고 (날짜 · 택배사별)', '택배사, 파레트, 박스(수도권 · 지방권), 매장 수, 장수, 확정', '하루 몇 줄'], ['transfer', '포승이관', '운송사, 파레트, 박스, 장수, 스타일 수, 확정', '하루 1줄'], ['staff', '인원 (공정별)', '공정별 인원, 야근 인원 · 시간, 기타업무 내용', '하루 10줄 안팎'],
    ['returns', '반품검수 박스별', '작업일, 박스, 매장, 차수, 구분, 예정 · 검수 수량, RFID · 비RFID, SKU 수, 밥상 확정', '하루 수백 줄 → 3개월 보관'], ['sorter', '소터 스타일별', '소터 작업일, 스타일(품번), 분류 장수', '하루 수백 줄 → 3개월 보관'], ['inventory', '수불 · 재고', '스타일별 시작 · 입고 · 출고 · 끝 재고, 장소별 재고(도착대기 · 검수장 · 가용), 날짜 · 종류별 합계', '스타일 수만큼 (최근 기간만 보관)']];
  const getOpts = async () => { try { const r = await HS.db.list('erp_settings', { eq: { key: 'anseong_opts' } }); return (r[0] && r[0].value) || { types: ['daily', 'ship', 'transfer', 'staff'], keep_months: 3 }; } catch (e) { return { types: ['daily', 'ship', 'transfer', 'staff'], keep_months: 3 }; } };
  const kp = (l, v, s) => '<div class="card kpi"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
  const offHint = async (body, type, label) => { const o = await getOpts(); if ((o.types || []).indexOf(type) >= 0) return false; body.appendChild(HS.el('<div class="card empty">' + esc(label) + ' 자료는 아직 받지 않고 있습니다 · <a href="#/anseong?k=opt">받을 항목</a>에서 켜면 다음 자동 받기(08:30 · 18:30)부터 들어옵니다</div>')); return true; };
  const dl = (d) => esc(d.slice(5).replace('-', '/')) + ' (' + HS.dow(d) + ')';

  // ---------- 반품검수 박스별 ----------
  async function retTab(body, from, to) {
    const rows = await HS.db.list('erp_as_ret', { gte: { work_date: from }, lte: { work_date: to }, order: ['work_date'] });
    body.innerHTML = ''; if (!rows.length) { if (!(await offHint(body, 'returns', '반품검수 박스별'))) body.appendChild(HS.el('<div class="card empty">' + esc(from + ' ~ ' + to) + ' 반품검수 자료가 없습니다</div>')); return; }
    const plan = sum(rows, 'plan_qty'), sent = sum(rows, 'sent_qty'), rf = sum(rows, 'rfid_qty'), un = rows.filter((r) => r.confirmed === false);
    body.appendChild(HS.el('<div class="kpis">' + kp('검수 박스', fmt(rows.length), '매장 ' + fmt(new Set(rows.map((r) => r.store)).size) + '곳') + kp('예정 수량', fmt(plan), '장') + kp('검수(확정) 수량', fmt(sent), '예정 대비 ' + (plan ? (sent / plan * 100).toFixed(1) + '%' : '-')) + kp('차이 (예정 − 검수)', fmt(plan - sent), '장') + kp('RFID 비율', sent ? (rf / sent * 100).toFixed(1) + '%' : '-', 'SKU ' + fmt(sum(rows, 'sku_cnt'))) + kp('밥상 미확정', fmt(un.length) + ' 박스', fmt(sum(un, 'sent_qty')) + '장') + '</div>'));
    const byD = {}; rows.forEach((r) => { const o = byD[r.work_date] || (byD[r.work_date] = { n: 0, plan: 0, sent: 0, rf: 0, un: 0 }); o.n++; o.plan += +r.plan_qty || 0; o.sent += +r.sent_qty || 0; o.rf += +r.rfid_qty || 0; if (r.confirmed === false) o.un++; });
    const byS = {}; rows.forEach((r) => { const k = r.store_name || r.store || '-'; const o = byS[k] || (byS[k] = { n: 0, plan: 0, sent: 0 }); o.n++; o.plan += +r.plan_qty || 0; o.sent += +r.sent_qty || 0; });
    const two = HS.el('<div class="row2" style="margin-top:14px"></div>'); body.appendChild(two);
    two.appendChild(HS.el('<div class="card"><h3>날짜별 <small>작업일자 기준</small></h3><div class="tw"><table><tr><th>날짜</th><th class="n">박스</th><th class="n">예정</th><th class="n">검수</th><th class="n">차이</th><th class="n">RFID</th><th class="n">미확정</th></tr>' + Object.keys(byD).sort().map((d) => { const o = byD[d]; return '<tr><td>' + dl(d) + '</td><td class="n">' + fmt(o.n) + '</td><td class="n">' + fmt(o.plan) + '</td><td class="n"><b>' + fmt(o.sent) + '</b></td><td class="n' + (o.plan - o.sent ? ' neg' : '') + '">' + fmt(o.plan - o.sent) + '</td><td class="n">' + fmt(o.rf) + '</td><td class="n">' + (o.un ? '<span class="tag y">' + o.un + '</span>' : '-') + '</td></tr>'; }).join('') + '</table></div></div>'));
    two.appendChild(HS.el('<div class="card"><h3>매장별 <small>검수 수량 많은 순 · 상위 20</small></h3><div class="tw"><table><tr><th>매장</th><th class="n">박스</th><th class="n">예정</th><th class="n">검수</th><th class="n">차이</th></tr>' + Object.entries(byS).sort((x, y) => y[1].sent - x[1].sent).slice(0, 20).map(([k, o]) => '<tr><td>' + esc(k) + '</td><td class="n">' + fmt(o.n) + '</td><td class="n">' + fmt(o.plan) + '</td><td class="n"><b>' + fmt(o.sent) + '</b></td><td class="n' + (o.plan - o.sent ? ' neg' : '') + '">' + fmt(o.plan - o.sent) + '</td></tr>').join('') + '</table></div></div>'));
    const c = HS.el('<div class="card" style="margin-top:14px"><h3>박스 목록 <small>' + fmt(rows.length) + '박스 · 화면은 300줄까지 · 전체는 엑셀</small><span class="sp"></span><input class="in" id="q" placeholder="박스 · 매장 · 차수 찾기" style="width:200px"><label style="font-size:12px;margin-left:8px"><input type="checkbox" id="u"> 미확정·차이만</label><button class="btn sm" id="xl" style="margin-left:8px">엑셀</button></h3><div class="tw" id="tb"></div></div>'); body.appendChild(c);
    const draw = () => { const q = c.querySelector('#q').value.trim().toLowerCase(), u = c.querySelector('#u').checked; const f = rows.filter((r) => (!q || [r.box, r.store, r.store_name, r.order_no].join(' ').toLowerCase().indexOf(q) >= 0) && (!u || r.confirmed === false || (+r.plan_qty || 0) !== (+r.sent_qty || 0)));
      c.querySelector('#tb').innerHTML = '<table><tr><th>작업일</th><th>박스</th><th>매장</th><th>차수</th><th>구분</th><th class="n">예정</th><th class="n">검수</th><th class="n">RFID</th><th class="n">비RFID</th><th class="n">SKU</th><th>밥상 확정</th></tr>' + f.slice(0, 300).map((r) => '<tr><td>' + esc(r.work_date.slice(5)) + '</td><td>' + esc(r.box) + '</td><td>' + esc(r.store_name || r.store || '') + '</td><td>' + esc(r.order_no || '') + '</td><td>' + esc(r.kind || '') + '</td><td class="n">' + n0(r.plan_qty) + '</td><td class="n' + ((+r.plan_qty || 0) !== (+r.sent_qty || 0) ? ' neg' : '') + '">' + n0(r.sent_qty) + '</td><td class="n">' + n0(r.rfid_qty) + '</td><td class="n">' + n0(r.nonrfid_qty) + '</td><td class="n">' + n0(r.sku_cnt) + '</td><td>' + (r.confirmed === true ? '<span class="tag g">확정</span>' : r.confirmed === false ? '<span class="tag y">미확정</span>' : '-') + '</td></tr>').join('') + (f.length ? '' : '<tr><td colspan="11" class="empty">맞는 박스가 없습니다</td></tr>') + '</table>'; };
    c.querySelector('#q').oninput = draw; c.querySelector('#u').onchange = draw; draw();
    c.querySelector('#xl').onclick = () => HS.download('안성_반품검수_' + from + '_' + to + '.xlsx', rows.map((r) => ({ 작업일자: r.work_date, 박스: r.box, 매장코드: r.store, 매장명: r.store_name, 차수: r.order_no, 구분: r.kind, 예정수량: r.plan_qty, 검수수량: r.sent_qty, RFID: r.rfid_qty, 비RFID: r.nonrfid_qty, SKU수: r.sku_cnt, 밥상확정: r.confirmed === true ? 'Y' : r.confirmed === false ? 'N' : '', 확정시각: r.confirmed_at })), '반품검수');
  }

  // ---------- 소터 스타일별 ----------
  async function sorterTab(body, from, to) {
    const rows = await HS.db.list('erp_as_sorter', { gte: { date: from }, lte: { date: to } });
    body.innerHTML = ''; if (!rows.length) { if (!(await offHint(body, 'sorter', '소터 스타일별'))) body.appendChild(HS.el('<div class="card empty">' + esc(from + ' ~ ' + to) + ' 소터 자료가 없습니다</div>')); return; }
    const byD = {}, byS = {}; rows.forEach((r) => { const q = +r.qty || 0; const d = byD[r.date] || (byD[r.date] = { q: 0, n: 0 }); d.q += q; d.n++; byS[r.style] = (byS[r.style] || 0) + q; });
    const days = Object.keys(byD).length, tot = sum(rows, 'qty');
    body.appendChild(HS.el('<div class="kpis">' + kp('소터 분류', fmt(tot), '장') + kp('스타일 수', fmt(Object.keys(byS).length), '품번') + kp('작업일', fmt(days), '일') + kp('하루 평균', fmt(Math.round(tot / (days || 1))), '장') + '</div>'));
    const two = HS.el('<div class="row2" style="margin-top:14px"></div>'); body.appendChild(two);
    two.appendChild(HS.el('<div class="card"><h3>날짜별 <small>소터 작업일 기준</small></h3><div class="tw"><table><tr><th>날짜</th><th class="n">분류 장수</th><th class="n">스타일 수</th></tr>' + Object.keys(byD).sort().map((d) => '<tr><td>' + dl(d) + '</td><td class="n"><b>' + fmt(byD[d].q) + '</b></td><td class="n">' + fmt(byD[d].n) + '</td></tr>').join('') + '</table></div></div>'));
    const c = HS.el('<div class="card"><h3>스타일별 <small>많은 순 · 화면 100개 · 전체는 엑셀</small><span class="sp"></span><input class="in" id="q" placeholder="품번 찾기" style="width:150px"><button class="btn sm" id="xl" style="margin-left:8px">엑셀</button></h3><div class="tw" id="tb"></div></div>'); two.appendChild(c);
    const st = Object.entries(byS).sort((x, y) => y[1] - x[1]);
    const draw = () => { const q = c.querySelector('#q').value.trim().toLowerCase(); const f = st.filter(([k]) => !q || k.toLowerCase().indexOf(q) >= 0); c.querySelector('#tb').innerHTML = '<table><tr><th>#</th><th>스타일</th><th class="n">분류 장수</th><th class="n">비중</th></tr>' + f.slice(0, 100).map(([k, v], i) => '<tr><td class="mute">' + (i + 1) + '</td><td>' + esc(k) + '</td><td class="n"><b>' + fmt(v) + '</b></td><td class="n">' + (v / tot * 100).toFixed(1) + '%</td></tr>').join('') + '</table>'; };
    c.querySelector('#q').oninput = draw; draw();
    c.querySelector('#xl').onclick = () => HS.download('안성_소터_' + from + '_' + to + '.xlsx', rows.slice().sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0)).map((r) => ({ 작업일: r.date, 스타일: r.style, 분류장수: r.qty })), '소터');
  }

  // ---------- 수불 · 재고 ----------
  async function invTab(body, from, to) {
    const [dy, flow, stock] = await Promise.all([HS.db.list('erp_as_inv_daily', { gte: { date: from }, lte: { date: to } }), HS.db.list('erp_as_inv_flow', {}), HS.db.list('erp_as_inv_stock', {})]);
    body.innerHTML = ''; if (!dy.length && !flow.length && !stock.length) { if (!(await offHint(body, 'inventory', '수불 · 재고'))) body.appendChild(HS.el('<div class="card empty">수불 · 재고 자료가 없습니다</div>')); return; }
    const places = {}; stock.forEach((r) => (places[r.place || '-'] = (places[r.place || '-'] || 0) + (+r.qty || 0))); const stTot = Object.values(places).reduce((a, b) => a + b, 0);
    const f0 = flow[0] || {};
    body.appendChild(HS.el('<div class="kpis">' + kp('끝 재고 (전체)', fmt(stTot || sum(flow, 'closing')), stock[0] ? esc(stock[0].as_of || '') + ' 기준' : '') + Object.entries(places).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => kp(esc(k), fmt(v), stTot ? (v / stTot * 100).toFixed(1) + '%' : '')).join('') + kp('기간 입고 · 출고', fmt(sum(flow, 'qty_in')) + ' · ' + fmt(sum(flow, 'qty_out')), f0.p_from ? esc(f0.p_from + ' ~ ' + f0.p_to) : '') + '</div>'));
    // 날짜 × 종류
    const kinds = [...new Set(dy.map((r) => r.kind))]; const byD = {}; dy.forEach((r) => ((byD[r.date] || (byD[r.date] = {}))[r.kind] = (+r.qty || 0)));
    if (dy.length) body.appendChild(HS.el('<div class="card" style="margin-top:14px"><h3>날짜 · 종류별 합계 <small>' + esc(from + ' ~ ' + to) + '</small></h3><div class="tw"><table><tr><th>날짜</th>' + kinds.map((k) => '<th class="n">' + esc(k) + '</th>').join('') + '</tr>' + Object.keys(byD).sort().map((d) => '<tr><td>' + dl(d) + '</td>' + kinds.map((k) => '<td class="n">' + (byD[d][k] != null ? fmt(byD[d][k]) : '-') + '</td>').join('') + '</tr>').join('') + '<tr><th>합계</th>' + kinds.map((k) => '<th class="n">' + fmt(dy.filter((r) => r.kind === k).reduce((a, r) => a + (+r.qty || 0), 0)) + '</th>').join('') + '</tr></table></div></div>'));
    // 스타일별 수불 + 장소별 재고
    const pl = Object.keys(places); const sp = {}; stock.forEach((r) => ((sp[r.style] || (sp[r.style] = {}))[r.place || '-'] = +r.qty || 0));
    const c = HS.el('<div class="card" style="margin-top:14px"><h3>스타일별 수불 · 장소별 재고 <small>' + (f0.p_from ? '수불 기간 ' + esc(f0.p_from + ' ~ ' + f0.p_to) + ' (마지막으로 받은 기간)' : '') + ' · 화면 200개 · 전체는 엑셀</small><span class="sp"></span><input class="in" id="q" placeholder="품번 찾기" style="width:150px"><button class="btn sm" id="xl" style="margin-left:8px">엑셀</button></h3><div class="tw" id="tb"></div></div>'); body.appendChild(c);
    const styles = [...new Set(flow.map((r) => r.style).concat(Object.keys(sp)))]; const fm = {}; flow.forEach((r) => (fm[r.style] = r));
    const rowsAll = styles.map((s2) => ({ s: s2, f: fm[s2] || {}, p: sp[s2] || {} })).sort((x, y) => (+y.f.closing || 0) - (+x.f.closing || 0));
    const draw = () => { const q = c.querySelector('#q').value.trim().toLowerCase(); const f = rowsAll.filter((r) => !q || r.s.toLowerCase().indexOf(q) >= 0);
      c.querySelector('#tb').innerHTML = '<table><tr><th>스타일</th><th class="n">시작</th><th class="n">입고</th><th class="n">출고</th><th class="n">끝 재고</th>' + pl.map((k) => '<th class="n">' + esc(k) + '</th>').join('') + '</tr>' + f.slice(0, 200).map((r) => '<tr><td>' + esc(r.s) + '</td><td class="n">' + n0(r.f.opening) + '</td><td class="n">' + n0(r.f.qty_in) + '</td><td class="n">' + n0(r.f.qty_out) + '</td><td class="n"><b>' + n0(r.f.closing) + '</b></td>' + pl.map((k) => '<td class="n">' + n0(r.p[k]) + '</td>').join('') + '</tr>').join('') + '</table>'; };
    c.querySelector('#q').oninput = draw; draw();
    c.querySelector('#xl').onclick = () => HS.download('안성_수불재고_' + (f0.p_to || to) + '.xlsx', rowsAll.map((r) => Object.assign({ 스타일: r.s, 시작재고: r.f.opening, 입고: r.f.qty_in, 출고: r.f.qty_out, 끝재고: r.f.closing }, Object.fromEntries(pl.map((k) => [k, r.p[k]])))), '수불재고');
  }

  // ---------- 받을 항목 고르기 · 보관 기간 · 정리 ----------
  async function optTab(body, canE) {
    const o = await getOpts(); const on = new Set(o.types || []); body.innerHTML = '';
    const c = HS.el('<div class="card"><h3>받을 항목 고르기 <small>체크한 항목만 매일 08:30 · 18:30 자동으로 받음 · 금액(단가 · 인건비)과 클레임반품 차수는 안성 API에서 보내지 않음</small>' + (canE ? '<span class="sp"></span><button class="btn sm p" id="sv">선택 저장</button>' : '') + '</h3><div class="tw"><table><tr><th></th><th>항목</th><th>들어 있는 칸</th><th>양</th></tr>' +
      TYPES.map(([k, l, d, q, must]) => '<tr><td><input type="checkbox" data-k="' + k + '"' + (on.has(k) || must ? ' checked' : '') + (must || !canE ? ' disabled' : '') + '></td><td><b>' + esc(l) + '</b><div class="mute" style="font-size:11px">' + k + (must ? ' · 항상' : '') + '</div></td><td>' + esc(d) + '</td><td class="mute">' + esc(q) + '</td></tr>').join('') + '</table></div>' +
      '<div class="form" style="margin-top:12px;max-width:520px"><label class="f">상세 자료 보관 (반품검수 · 소터 · 날짜별 수불)<select class="in" id="km"' + (canE ? '' : ' disabled') + '>' + [1, 2, 3, 6, 12].map((m) => '<option value="' + m + '"' + (m === (+o.keep_months || 3) ? ' selected' : '') + '>최근 ' + m + '개월</option>').join('') + '</select></label></div>' +
      '<div class="mute" style="font-size:11.5px;line-height:1.7;margin-top:6px">· 보관 기간이 지난 상세 자료는 매일 밤 00:20 자동으로 지웁니다 (안성 원본은 그대로라 필요하면 [기간 지정 가져오기]로 다시 받을 수 있음)<br>· 새로 켠 항목의 지난 자료가 필요하면 <a href="#/anseong">요약</a> 탭 › [기간 지정 가져오기]<br>· 저장 공간은 <a href="#/storage">설정 › 저장 공간</a>에서 확인</div></div>'); body.appendChild(c);
    if (!canE) return;
    c.querySelector('#sv').onclick = async () => { const t = [...c.querySelectorAll('input[data-k]')].filter((x) => x.checked).map((x) => x.dataset.k); try { await HS.db.rpc('erp_as_set_opts', { p_types: t, p_keep: +c.querySelector('#km').value }); HS.toast('저장했습니다 · 다음 자동 받기부터 적용', 'ok'); HS.route(); } catch (e) { HS.err(e); } };
    const c2 = HS.el('<div class="card" style="margin-top:14px"><h3>지금 정리 <small>보관 기간 지난 안성 상세 자료 지우기 · 지우기 전에 엑셀로 먼저 내려받음</small><span class="sp"></span><button class="btn sm r" id="tr">엑셀 받고 정리</button></h3><div class="mute" id="tm" style="font-size:12px"></div></div>'); body.appendChild(c2);
    c2.querySelector('#tr').onclick = async () => { const k = +c.querySelector('#km').value || 3; const d = new Date(); d.setMonth(d.getMonth() - k); const cut = d.toISOString().slice(0, 10); const lt = addDays(cut, -1);
      const [r1, r2, r3] = await Promise.all([HS.db.list('erp_as_ret', { lte: { work_date: lt } }), HS.db.list('erp_as_sorter', { lte: { date: lt } }), HS.db.list('erp_as_inv_daily', { lte: { date: lt } })]);
      if (!r1.length && !r2.length && !r3.length) { c2.querySelector('#tm').textContent = cut + ' 이전 자료가 없습니다 · 정리할 것 없음'; return; }
      if (!(await HS.confirm(cut + ' 이전 안성 상세 자료 ' + fmt(r1.length + r2.length + r3.length) + '줄을 엑셀로 받은 뒤 지울까요?'))) return;
      HS.needXlsx(); const wb = XLSX.utils.book_new(); [[r1, '반품검수'], [r2, '소터'], [r3, '날짜별수불']].forEach(([r, n]) => { if (r.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.map((x) => { const y = Object.assign({}, x); delete y.fetched_at; return y; })), n); }); XLSX.writeFile(wb, '안성_정리전보관_' + cut + '.xlsx');
      try { const n = await HS.db.rpc('erp_as_trim', { p_keep: k }); HS.toast(fmt(n) + '줄 정리했습니다', 'ok'); c2.querySelector('#tm').textContent = fmt(n) + '줄 정리 · 엑셀 보관 파일을 원드라이브에 넣어 두세요'; } catch (e) { HS.err(e); } };
  }

  HS.view('anseong', {
    title: '안성센터 현황', perm: 'anseong',
    async render(body, p, tools) {
      const from = p.f || monthStart(), to = p.t || today(); const canE = HS.can('anseong', 'edit'); const tab = p.k || 'sum';
      tools.appendChild(HS.seg(TABS, tab, (k) => HS.go('anseong', { k, f: from, t: to })));
      if (tab !== 'opt') { const a = HS.el('<input class="in" type="date" style="width:150px">'), b = HS.el('<input class="in" type="date" style="width:150px">'); a.value = from; b.value = to;
        a.onchange = b.onchange = () => HS.go('anseong', { k: tab, f: a.value, t: b.value }); tools.appendChild(a); tools.appendChild(b); }
      if (tab === 'ret') return retTab(body, from, to);
      if (tab === 'sorter') return sorterTab(body, from, to);
      if (tab === 'inv') return invTab(body, from, to);
      if (tab === 'opt') return optTab(body, canE);
      const [st, cfgRow, daily, ship, trans, staff] = await Promise.all([HS.db.rpc('erp_as_status').catch(() => null), HS.db.list('erp_settings', { eq: { key: 'anseong_api' } }).catch(() => []),
        HS.db.list('erp_as_daily', { gte: { date: from }, lte: { date: to }, order: ['date'] }), HS.db.list('erp_as_ship', { gte: { date: from }, lte: { date: to } }), HS.db.list('erp_as_transfer', { gte: { date: from }, lte: { date: to } }), HS.db.list('erp_as_staff', { gte: { date: from }, lte: { date: to } })]);
      const S = st || {}; const cfg = (cfgRow[0] && cfgRow[0].value) || {}; const last = (S.last || [])[0];
      body.innerHTML = '';
      // 연결 상태
      const lastOk = (S.last || []).find((x) => x.status === 200);
      const c0 = HS.el('<div class="card"><h3>연결 상태 <small>안성센터 자료 API (hq_export) · 보기 전용 · 금액 없음</small><span class="sp"></span>' + (canE ? '<button class="btn sm" id="key">본사 열쇠 ' + (S.key_set ? '변경' : '등록') + '</button><button class="btn sm" id="api" style="margin-left:6px">API 주소</button><button class="btn sm" id="rng" style="margin-left:6px">기간 지정 가져오기</button><button class="btn sm p" id="now" style="margin-left:6px">지금 가져오기 (최근 7일)</button>' : '') + '</h3>' +
        '<div class="tw"><table><tr><td class="mute" style="width:150px">본사 전용 열쇠</td><td>' + (S.key_set ? '<span class="pos">● 등록됨</span> <span class="mute">hq_····' + esc(S.key_tail || '') + ' · ' + esc((S.key_at || '').slice(0, 10)) + '</span>' : '<span class="neg">● 없음</span> <span class="mute">안성센터 관리자에게 받은 hq_ 열쇠를 [본사 열쇠 등록]으로 넣으세요 (대화 · 메일로 보내지 마세요)</span>') + '</td></tr>' +
        '<tr><td class="mute">자동 받기</td><td>' + (S.local ? '<span class="wa3">로컬 모드 — Supabase 연결 후 사용할 수 있습니다</span>' : S.cron ? '매일 08:30 · 18:30 최근 7일 다시 받기' : '<span class="wa3">자동 예약 안 됨 (pg_cron 없음) · [지금 가져오기]로 받으세요</span>') + (!S.local && S.net === false ? ' · <span class="neg">pg_net 없음 → 설치하기 2번(DB 설치)을 다시 실행하세요</span>' : '') + '</td></tr>' +
        '<tr><td class="mute">받은 기간</td><td>' + (S.min_date ? esc(S.min_date + ' ~ ' + S.max_date) : '아직 없음') + (lastOk ? ' <span class="mute">· 마지막 성공 ' + esc(new Date(lastOk.at).toLocaleString('ko-KR')) + '</span>' : '') + '</td></tr>' +
        (last && last.status && last.status !== 200 ? '<tr><td class="mute">마지막 오류</td><td class="neg">' + esc(last.status + ' · ' + (last.msg || '')) + '</td></tr>' : '') +
        '<tr><td class="mute">API 주소</td><td class="mute" style="word-break:break-all">' + esc(cfg.url || '-') + '</td></tr></table></div><div id="pm" class="mute" style="margin-top:6px;font-size:12px"></div></div>');
      body.appendChild(c0);
      const pm = c0.querySelector('#pm');
      const run = async (f, t) => { const bt = c0.querySelectorAll('button'); bt.forEach((x) => (x.disabled = true)); try { const s2 = await pullAndCollect(f, t, pm); const er = (s2.last || []).filter((x) => x.status && x.status !== 200); HS.toast(er.length ? '일부 실패: ' + er[0].status + ' ' + (er[0].msg || '') : '안성 자료를 받았습니다', er.length ? 'err' : 'ok'); HS.route(); } catch (e) { bt.forEach((x) => (x.disabled = false)); pm.textContent = ''; HS.err(e); } };
      if (canE) {
        c0.querySelector('#now').onclick = () => run(addDays(today(), -7), today());
        c0.querySelector('#rng').onclick = async () => { const f = HS.el('<div class="form"><label class="f">시작<input class="in" type="date" id="r1"></label><label class="f">끝<input class="in" type="date" id="r2"></label><div class="wide mute" style="font-size:11.5px">93일이 넘으면 나눠서 받습니다 · 같은 기간을 다시 받아도 두 번 들어가지 않습니다</div></div>'); f.querySelector('#r1').value = from; f.querySelector('#r2').value = to; const ok = await HS.modal('기간 지정 가져오기', f, [['취소', null], ['가져오기', true, 'p']]); if (ok) run(f.querySelector('#r1').value, f.querySelector('#r2').value); };
        c0.querySelector('#key').onclick = async () => { const f = HS.el('<div class="form"><label class="f wide">본사 전용 열쇠 (hq_ 로 시작)<input class="in" type="password" id="k1" autocomplete="off"></label><div class="wide mute" style="font-size:11.5px;line-height:1.7">· ERP 서버(DB)에만 저장되고 화면에는 끝 4자리만 보입니다<br>· 관리자 · 허용된 접속 주소에서만 바꿀 수 있습니다<br>· 비우고 저장하면 열쇠를 지웁니다 (연동 중지)</div></div>'); const ok = await HS.modal('본사 열쇠', f, [['취소', null], ['저장', true, 'p']], { onOk: async () => { await HS.db.rpc('erp_as_set_key', { p_key: f.querySelector('#k1').value.trim() }); } }); if (ok) { HS.toast('저장했습니다', 'ok'); HS.route(); } };
        c0.querySelector('#api').onclick = async () => { const f = HS.el('<div class="form"><label class="f wide">주소 (POST)<input class="in" id="u1"></label><label class="f wide">apikey (공개키)<input class="in" id="u2"></label></div>'); f.querySelector('#u1').value = cfg.url || ''; f.querySelector('#u2').value = cfg.apikey || ''; await HS.modal('안성 API 주소', f, [['취소', null], ['저장', true, 'p']], { onOk: async () => { await HS.db.upsert('erp_settings', [{ key: 'anseong_api', value: { url: f.querySelector('#u1').value.trim(), apikey: f.querySelector('#u2').value.trim() } }]); HS.route(); } }); };
      }
      if (!daily.length) { body.appendChild(HS.el('<div class="card empty" style="margin-top:14px">' + esc(from + ' ~ ' + to) + ' 안성 자료가 없습니다' + (S.key_set ? ' · [지금 가져오기] 또는 [기간 지정 가져오기]' : ' · 먼저 본사 열쇠를 등록하세요') + '</div>')); return; }
      // 요약
      const heads = sum(daily, 'heads'); const work = sum(daily, 'return_qty') + sum(daily, 'sorter_qty') + sum(daily, 'ship_qty') + sum(daily, 'transfer_qty');
      body.appendChild(HS.el('<div class="kpis" style="margin-top:14px">' + kp('반품 확정', fmt(sum(daily, 'return_qty')), fmt(sum(daily, 'return_boxes')) + ' 박스') + kp('소터 분류', fmt(sum(daily, 'sorter_qty')), '장') + kp('출고 (확정)', fmt(sum(daily, 'ship_qty')), fmt(sum(daily, 'ship_boxes')) + ' 박스') + kp('포승 이관 (확정)', fmt(sum(daily, 'transfer_qty')), fmt(sum(daily, 'transfer_boxes')) + ' 박스') + kp('작업 인원 (연인원)', fmt(heads), '기타업무 ' + fmt(sum(daily, 'heads_etc')) + ' · 인당 ' + (heads ? fmt(Math.round(work / heads)) : '-') + '장') + '</div>'));
      // 날짜별
      const c1 = HS.el('<div class="card" style="margin-top:14px"><h3>날짜별 <small>' + esc(from + ' ~ ' + to) + ' · 반품 · 인원 = 작업일 · 소터 = 소터 작업일 · 출고 · 이관 = 확정된 날만</small><span class="sp"></span><button class="btn sm" id="xl">엑셀</button></h3><div class="tw"><table><tr><th>날짜</th><th class="n">반품 확정</th><th class="n">박스</th><th class="n">소터 분류</th><th class="n">출고</th><th class="n">박스</th><th class="n">포승 이관</th><th class="n">박스</th><th class="n">인원</th><th class="n">기타업무</th><th class="n">인당 처리</th></tr>' +
        daily.map((r) => { const w = (+r.return_qty || 0) + (+r.sorter_qty || 0) + (+r.ship_qty || 0) + (+r.transfer_qty || 0); return '<tr><td>' + esc(r.date.slice(5).replace('-', '/')) + ' (' + HS.dow(r.date) + ')</td><td class="n">' + n0(r.return_qty) + '</td><td class="n">' + n0(r.return_boxes) + '</td><td class="n">' + n0(r.sorter_qty) + '</td><td class="n">' + n0(r.ship_qty) + '</td><td class="n">' + n0(r.ship_boxes) + '</td><td class="n">' + n0(r.transfer_qty) + '</td><td class="n">' + n0(r.transfer_boxes) + '</td><td class="n">' + n0(r.heads) + '</td><td class="n">' + n0(r.heads_etc) + '</td><td class="n">' + (+r.heads ? fmt(Math.round(w / r.heads)) : '<span class="mute">-</span>') + '</td></tr>'; }).join('') + '</table></div></div>');
      body.appendChild(c1);
      c1.querySelector('#xl').onclick = () => HS.download('안성센터_' + from + '_' + to + '.xlsx', daily.map((r) => ({ 날짜: r.date, 반품확정: r.return_qty, 반품박스: r.return_boxes, 소터분류: r.sorter_qty, 출고: r.ship_qty, 출고박스: r.ship_boxes, 포승이관: r.transfer_qty, 이관박스: r.transfer_boxes, 인원: r.heads, 기타업무: r.heads_etc })), '안성센터');
      // 택배사별 출고 · 공정별 인원
      const two = HS.el('<div class="row2" style="margin-top:14px"></div>'); body.appendChild(two);
      const byC = {}; ship.forEach((r) => { const o = byC[r.courier || '-'] || (byC[r.courier || '-'] = { boxes: 0, qty: 0, stores: 0, metro: 0, local: 0, plt: 0, days: 0, unconf: 0 }); if (r.confirmed === false) { o.unconf++; return; } o.boxes += +r.boxes || 0; o.qty += +r.qty || 0; o.metro += +r.boxes_metro || 0; o.local += +r.boxes_local || 0; o.plt += +r.plt || 0; o.days++; });
      two.appendChild(HS.el('<div class="card"><h3>출고 · 택배사별 <small>확정된 날만 · 이관 ' + fmt(sum(trans.filter((t) => t.confirmed !== false), 'qty')) + '장</small></h3><div class="tw"><table><tr><th>택배사</th><th class="n">일수</th><th class="n">파레트</th><th class="n">박스</th><th class="n">수도권</th><th class="n">지방권</th><th class="n">장수</th></tr>' + (Object.keys(byC).length ? Object.entries(byC).map(([k, o]) => '<tr><td>' + esc(k) + (o.unconf ? ' <span class="tag y">미확정 ' + o.unconf + '일</span>' : '') + '</td><td class="n">' + o.days + '</td><td class="n">' + fmt(o.plt) + '</td><td class="n">' + fmt(o.boxes) + '</td><td class="n">' + fmt(o.metro) + '</td><td class="n">' + fmt(o.local) + '</td><td class="n"><b>' + fmt(o.qty) + '</b></td></tr>').join('') : '<tr><td colspan="7" class="empty">출고 자료 없음</td></tr>') + '</table></div></div>'));
      const byI = {}; staff.forEach((r) => { const o = byI[r.item] || (byI[r.item] = { heads: 0, oh: 0, ot: 0, days: 0 }); o.heads += +r.heads || 0; o.oh += +r.overtime_heads || 0; o.ot += (+r.overtime_heads || 0) * (+r.overtime_hours || 0); o.days++; });
      two.appendChild(HS.el('<div class="card"><h3>인원 · 공정별 <small>안성 원가관리 입력값 · 연인원</small></h3><div class="tw"><table><tr><th>공정</th><th class="n">일수</th><th class="n">인원 (연인원)</th><th class="n">일 평균</th><th class="n">야근 (인원 · 시간)</th></tr>' + (Object.keys(byI).length ? Object.entries(byI).sort((x, y) => y[1].heads - x[1].heads).map(([k, o]) => '<tr><td>' + esc(k) + '</td><td class="n">' + o.days + '</td><td class="n"><b>' + n0(o.heads || null) + '</b></td><td class="n">' + (o.heads ? (o.heads / o.days).toFixed(1) : '-') + '</td><td class="n">' + (o.oh ? fmt(o.oh) + '명 · ' + fmt(o.ot) + '시간' : '-') + '</td></tr>').join('') : '<tr><td colspan="5" class="empty">인원 자료 없음</td></tr>') + '</table></div></div>'));
      // 받기 기록
      if ((S.last || []).length) body.appendChild(HS.el('<div class="card" style="margin-top:14px"><h3>받기 기록 <small>최근 12건</small></h3><div class="tw"><table><tr><th>시각</th><th>자료</th><th>기간</th><th>결과</th><th class="n">줄</th><th>요청</th></tr>' + S.last.map((x) => '<tr><td>' + esc(new Date(x.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })) + '</td><td>' + esc(x.p_type) + '</td><td>' + esc(x.p_from + ' ~ ' + x.p_to) + '</td><td>' + (!x.done ? '<span class="tag y">대기</span>' : x.status === 200 ? '<span class="tag g">성공</span>' : '<span class="tag r">' + esc(String(x.status || '') + ' ' + (x.msg || '')) + '</span>') + '</td><td class="n">' + n0(x.rows) + '</td><td>' + esc(x.by_name || '') + '</td></tr>').join('') + '</table></div></div>'));
    },
  });
  // 통합 대시보드: 안성 최근 하루
  HS.anseongSummary = async (el, atEl) => {
    if (!HS.can('anseong', 'view')) return;
    try {
      const rows = await HS.db.list('erp_as_daily', { gte: { date: addDays(today(), -14) }, lte: { date: today() }, order: ['date', false] });
      const r = rows.find((x) => (+x.return_qty || 0) + (+x.sorter_qty || 0) + (+x.ship_qty || 0) + (+x.transfer_qty || 0) > 0);
      if (!r) { el.innerHTML = '<div class="mute" style="font-size:12px">최근 안성 자료가 없습니다 · <a href="#/anseong">안성센터 연동</a>에서 가져오기</div>'; return; }
      el.innerHTML = '<div class="tw"><table><tr><th>안성센터 ' + esc(r.date.slice(5).replace('-', '/')) + '</th><th class="n">반품 확정</th><th class="n">소터</th><th class="n">출고</th><th class="n">포승 이관</th><th class="n">인원</th></tr><tr><td class="mute">장수 (박스)</td><td class="n">' + fmt(+r.return_qty || 0) + ' (' + fmt(+r.return_boxes || 0) + ')</td><td class="n">' + fmt(+r.sorter_qty || 0) + '</td><td class="n">' + fmt(+r.ship_qty || 0) + ' (' + fmt(+r.ship_boxes || 0) + ')</td><td class="n">' + fmt(+r.transfer_qty || 0) + ' (' + fmt(+r.transfer_boxes || 0) + ')</td><td class="n">' + n0(r.heads) + '</td></tr></table></div>';
      if (atEl) atEl.textContent = '안성 API · ' + (r.fetched_at ? new Date(r.fetched_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' 받음' : '');
    } catch (e) { el.innerHTML = '<div class="mute" style="font-size:12px">안성 자료 조회 실패: ' + esc(e.message) + '</div>'; }
  };
})();
