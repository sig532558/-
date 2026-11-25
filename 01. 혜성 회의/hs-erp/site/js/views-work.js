/* 통합 대시보드 · 관리자 업무일지 · 일일 마감보고 */
(function () {
  'use strict';
  const { esc, fmt, won, sign, cls, today, addDays, weekLabel, monthRange, weekRange } = HS;

  // ================= 공용 편집 표 =================
  // cols: [{k,l,t:'num'|'text'|'auto', f:(d)=>값, ro:true|(row)=>true}]  rows: [{key,label,data}]
  //  · ro = 그 칸(또는 그 줄의 그 칸)은 읽기 전용 — 인원 확인처럼 '내가 쓰는 칸'과 '남이 쓰는 칸'을 나눌 때 씀 (2026-11-12)
  HS.grid = function (o) {
    const wrap = HS.el('<div class="tw ' + (o.cards === false ? '' : 'rt') + '"></div>');
    const changed = new Map();
    const auto = (row) => { o.cols.forEach((c) => { if (c.t === 'auto') row.data[c.k] = c.f(row.data); }); };
    o.rows.forEach(auto);
    const head = '<tr><th>' + esc(o.keyLabel || '구분') + '</th>' + o.cols.map((c) => '<th class="' + (c.t === 'text' ? '' : 'n') + '">' + esc(c.l) + '</th>').join('') + (o.extraHead || '') + '</tr>';
    const cell = (r, c, i) => {
      const v = r.data[c.k];
      const L = ' data-l="' + esc(c.l) + '"';
      const ro = typeof c.ro === 'function' ? c.ro(r) : !!c.ro;
      if (c.t === 'auto') return '<td' + L + ' class="n ' + (c.cls ? c.cls(v) : '') + '" data-auto="' + c.k + '">' + (c.show ? c.show(v, r.data) : fmt(v, 1)) + '</td>';
      if (!o.editable || ro) return '<td' + L + ' class="' + (c.t === 'text' ? '' : 'n') + (ro ? ' mute' : '') + '">' + (c.t === 'text' ? esc(v || '') : fmt(v, 1)) + '</td>';
      return '<td' + L + ' class="n"><input class="cell ' + (c.t === 'text' ? 'txt' : '') + '" data-r="' + i + '" data-k="' + c.k + '" value="' + esc(v == null ? '' : v) + '"' + (c.t === 'text' ? '' : ' inputmode="decimal"') + '></td>';
    };
    const tot = o.total ? '<tr class="tot"><td class="rk">합계</td>' + o.cols.map((c) => { if (c.t === 'text' || c.noSum) return '<td></td>'; const s = o.rows.reduce((a, r) => a + (+r.data[c.k] || 0), 0); return '<td class="n" data-l="' + esc(c.l) + '" data-tot="' + c.k + '">' + fmt(s, 1) + '</td>'; }).join('') + (o.extraHead ? '<td></td>' : '') + '</tr>' : '';
    wrap.innerHTML = '<table>' + head + o.rows.map((r, i) => '<tr data-i="' + i + '"><td class="rk">' + esc(r.label || r.key) + '</td>' + o.cols.map((c) => cell(r, c, i)).join('') + (o.extra ? o.extra(r, i) : '') + '</tr>').join('') + tot + '</table>';
    const recalc = (i) => {
      const r = o.rows[i]; auto(r);
      const tr = wrap.querySelector('tr[data-i="' + i + '"]');
      o.cols.forEach((c) => { if (c.t === 'auto') { const td = tr.querySelector('[data-auto="' + c.k + '"]'); td.innerHTML = c.show ? c.show(r.data[c.k], r.data) : fmt(r.data[c.k], 1); td.className = 'n ' + (c.cls ? c.cls(r.data[c.k]) : ''); } });
      if (o.total) o.cols.forEach((c) => { const td = wrap.querySelector('[data-tot="' + c.k + '"]'); if (td) td.textContent = fmt(o.rows.reduce((a, x) => a + (+x.data[c.k] || 0), 0), 1); });
    };
    wrap.addEventListener('input', (e) => {
      const t = e.target; if (!t.dataset.k) return;
      const i = +t.dataset.r; const c = o.cols.find((x) => x.k === t.dataset.k);
      const v = c.t === 'text' ? t.value : (t.value.trim() === '' ? null : Number(t.value.replace(/,/g, '')));
      if (c.t !== 'text' && t.value.trim() !== '' && isNaN(v)) { t.style.borderColor = 'var(--neg)'; return; }
      t.style.borderColor = ''; t.classList.add('chg');
      const old = o.rows[i].data[c.k]; o.rows[i].data[c.k] = v; changed.set(i, o.rows[i]);
      // 다른 칸 자동 변경 (예: 출고지시 — 금일 선지시를 넣으면 금일 판매에서 빠짐)
      if (o.onCell) o.onCell(c.k, v, old, o.rows[i].data, (k, val) => { o.rows[i].data[k] = val; const inp = wrap.querySelector('input[data-r="' + i + '"][data-k="' + k + '"]'); if (inp) { inp.value = val == null ? '' : val; inp.classList.add('chg', 'flash'); setTimeout(() => inp.classList.remove('flash'), 700); } });
      recalc(i);
      if (o.onChange) o.onChange(changed.size);
    });
    // 엑셀처럼 Enter → 아래 칸
    wrap.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.dataset.k) return;
      e.preventDefault(); const n = wrap.querySelector('input[data-r="' + (+e.target.dataset.r + 1) + '"][data-k="' + e.target.dataset.k + '"]'); if (n) { n.focus(); n.select(); }
    });
    // 붙여넣기: 엑셀에서 복사한 여러 칸을 한 번에
    wrap.addEventListener('paste', (e) => {
      const t = e.target; if (!t.dataset.k) return;
      const txt = (e.clipboardData || window.clipboardData).getData('text'); if (!/[\t\n]/.test(txt.trim())) return;
      e.preventDefault();
      const lines = txt.replace(/\r/g, '').split('\n').filter((l, i, a) => l !== '' || i < a.length - 1);
      const editCols = o.cols.filter((c) => c.t !== 'auto'); const c0 = editCols.findIndex((c) => c.k === t.dataset.k);
      lines.forEach((line, di) => line.split('\t').forEach((val, dj) => {
        const c = editCols[c0 + dj]; const inp = c && wrap.querySelector('input[data-r="' + (+t.dataset.r + di) + '"][data-k="' + c.k + '"]');
        if (inp) { inp.value = val.trim(); inp.dispatchEvent(new Event('input', { bubbles: true })); }
      }));
    });
    return { el: wrap, changed: () => [...changed.values()], clear: () => { changed.clear(); wrap.querySelectorAll('.chg').forEach((x) => x.classList.remove('chg')); } };
  };

  async function lockState(date, module) {
    const l = await HS.db.list('erp_locks', { eq: { lock_date: date, module } });
    return l.find((x) => x.locked) || null;
  }
  function lockBar(date, module, lock, onChange) {
    const bar = HS.el('<div class="lock ' + (lock ? '' : 'ok') + '"></div>');
    bar.innerHTML = lock ? '🔒 <b>' + date + ' 마감 확정됨</b><span class="mute">' + esc(HS.who(lock.locked_by)) + ' · ' + esc(new Date(lock.locked_at).toLocaleString('ko-KR')) + '</span><span class="mute">— 마감 해제 권한자만 수정 가능</span><span class="sp"></span>' : '✏️ <b>' + date + ' 작성 중</b><span class="mute">여러 명이 동시에 입력할 수 있습니다. 저장하면 다른 사람 화면에도 바로 반영됩니다.</span><span class="sp"></span>';
    if (lock && HS.can(module, 'unlock')) { const b = HS.el('<button class="btn sm">마감 해제</button>'); b.onclick = async () => { if (!(await HS.confirm(date + ' 마감을 해제할까요? 해제 기록이 남습니다.'))) return; try { await HS.db.remove('erp_locks', { lock_date: date, module }); HS.toast('마감을 해제했습니다'); onChange(); } catch (e) { HS.err(e); } }; bar.appendChild(b); }
    if (!lock && HS.can(module, 'close')) { const b = HS.el('<button class="btn gd sm">마감 확정</button>'); b.onclick = async () => { if (!(await HS.confirm(date + ' 자료를 마감 확정할까요?<br>확정 후에는 마감 해제 권한자만 수정할 수 있습니다.'))) return; try { await HS.db.insert('erp_locks', { lock_date: date, module, locked: true, locked_by: HS.me.id, locked_at: new Date().toISOString() }); HS.toast('마감 확정했습니다', 'ok'); onChange(); } catch (e) { HS.err(e); } }; bar.appendChild(b); }
    return bar;
  }
  HS.lockState = lockState; HS.lockBar = lockBar;

  // ================= 통합 대시보드 =================
  HS.view('dashboard', {
    title: '통합 대시보드', perm: 'dashboard',
    async render(body, p, tools) {
      const center = p.c || 'all'; const d = p.d || today();
      tools.appendChild(HS.seg([['all', '전체'], ['gobaek', '고백리센터'], ['anseong', '안성센터']], center, (c) => HS.go('dashboard', { c, d })));
      tools.appendChild(HS.dateNav(d, (x) => HS.go('dashboard', { c: center, d: x })));
      const [m1, m2] = monthRange(d);
      const teams = HS.cache.teams.filter((t) => center === 'all' || t.center_id === center).map((t) => t.name);
      const canW = HS.can('worklog', 'view'), canD = HS.can('daily', 'view'), canT = HS.can('tasks', 'view');
      const [wl, wd, daily, dailyPrev, tasks, subs] = await Promise.all([
        canW ? HS.db.list('erp_worklog', { gte: { work_date: m1 }, lte: { work_date: m2 } }) : [],
        canW ? HS.db.list('erp_worklog_day', { gte: { work_date: m1 }, lte: { work_date: m2 } }) : [],
        canD ? HS.db.list('erp_daily_records', { eq: { rec_date: d } }) : [],
        canD ? HS.db.list('erp_daily_records', { eq: { rec_date: addDays(d, -1) } }) : [],
        canT ? HS.db.list('erp_tasks', { neq: { status: '완료' }, order: ['due_date'] }) : [],
        canW ? HS.db.list('erp_worklog_day', { eq: { work_date: d } }) : [],
      ]);
      const rows = wl.filter((r) => teams.indexOf(r.team) >= 0);
      const by = HS.calc(rows, wd.filter((r) => teams.indexOf(r.team) >= 0));
      const sum = Object.values(by).reduce((a, x) => ({ sales: a.sales + x.sales, cost: a.cost + x.cost }), { sales: 0, cost: 0 });
      const ans = by['안성센터'] || { sales: 0, cost: 0, profit: 0 };
      const gb = { sales: sum.sales - ans.sales, cost: sum.cost - ans.cost };
      const dayRec = daily.length ? daily : dailyPrev; const dayLabel = daily.length ? d : addDays(d, -1);
      const sec = (s) => dayRec.filter((r) => r.section === s);
      const off = sec('offline'); const offOrd = off.reduce((a, r) => a + (+r.data.order_qty || 0), 0), offOut = off.reduce((a, r) => a + (+r.data.total_qty || 0), 0);
      const submitted = subs.filter((s) => s.status === '제출' && teams.indexOf(s.team) >= 0).map((s) => s.team);
      const notSub = teams.filter((t) => t !== '별도인원' && submitted.indexOf(t) < 0);
      const profit = sum.sales - sum.cost;
      const kp = (l, v, s, c) => '<div class="card kpi"><div class="l">' + l + '</div><div class="v ' + (c || '') + '">' + v + '</div><div class="s">' + s + '</div></div>';
      body.innerHTML = '';
      body.appendChild(HS.el('<div class="kpis">' +
        (canW ? kp(m1.slice(5, 7) + '월 매출 (누계)', won(sum.sales), center === 'all' ? '고백리 ' + won(gb.sales) + ' · 안성 ' + won(ans.sales) : weekLabel(d) + ' 기준', '') + kp(m1.slice(5, 7) + '월 지출', won(sum.cost), '인건비 + 연장근무', '') + kp(m1.slice(5, 7) + '월 손익', (profit >= 0 ? '+' : '') + won(profit), '손익률 ' + (sum.sales ? ((profit / sum.sales) * 100).toFixed(1) + '%' : '-'), cls(profit)) : '') +
        (canD ? kp(dayLabel.slice(5).replace('-', '/') + ' 출고 (B2B 4개사)', fmt(offOut) + '<span style="font-size:13px;font-weight:400"> PCS</span>', '지시 ' + fmt(offOrd) + ' · 출고율 ' + (offOrd ? ((offOut / offOrd) * 100).toFixed(2) + '%' : '-') + ' · 미출 ' + fmt(offOrd - offOut), '') : '') +
        (canW ? kp('오늘 업무일지 제출', submitted.length + ' / ' + (submitted.length + notSub.length) + '<span style="font-size:13px;font-weight:400"> 팀</span>', notSub.length ? '<span class="neg">미제출: ' + esc(notSub.join(' · ')) + '</span>' : '<span class="pos">전 팀 제출 완료</span>', '') : '') + '</div>'));

      // 센터 카드
      const row1 = HS.el('<div class="row"></div>');
      if (center !== 'anseong' && canD) {
        const b2b = sec('b2b'), b2c = sec('b2c'), ret = sec('return');
        const s = (arr, k) => arr.reduce((a, r) => a + (+r.data[k] || 0), 0);
        const owners = {}; off.forEach((r) => { const o = owners[r.data.owner] || (owners[r.data.owner] = { ord: 0, out: 0 }); o.ord += +r.data.order_qty || 0; o.out += +r.data.total_qty || 0; });
        row1.appendChild(HS.el('<div class="card" style="flex:1.4;min-width:320px"><h3>고백리센터 <span class="tag k">크리스</span><span class="tag k">LX</span><span class="tag k">로라</span><small>' + dayLabel + ' 마감보고 기준</small></h3>' +
          '<div class="kpis" style="grid-template-columns:repeat(4,1fr);gap:8px"><div class="kpi"><div class="l">입고</div><div class="v" style="font-size:17px">' + fmt(s(b2b, 'in_qty')) + '</div></div><div class="kpi"><div class="l">출고</div><div class="v" style="font-size:17px">' + fmt(s(b2b, 'out_qty')) + '</div></div><div class="kpi"><div class="l">반품 확정</div><div class="v" style="font-size:17px">' + fmt(s(ret, 'return_total')) + '</div></div><div class="kpi"><div class="l">B2C 고객출고</div><div class="v" style="font-size:17px">' + fmt(s(b2c, 'cust_out')) + '</div></div></div>' +
          '<div class="tw" style="margin-top:10px"><table><tr><th>화주사</th><th class="n">지시</th><th class="n">출고</th><th class="n">미출</th><th class="n">출고율</th></tr>' +
          (Object.keys(owners).length ? Object.entries(owners).map(([k, o]) => '<tr><td>' + esc(k) + '</td><td class="n">' + fmt(o.ord) + '</td><td class="n">' + fmt(o.out) + '</td><td class="n ' + (o.ord - o.out ? 'neg' : '') + '">' + fmt(o.ord - o.out) + '</td><td class="n">' + (o.ord ? ((o.out / o.ord) * 100).toFixed(2) + '%' : '-') + '</td></tr>').join('') : '<tr><td colspan="5" class="mute">마감보고 자료가 없습니다</td></tr>') + '</table></div></div>'));
      }
      if (center !== 'gobaek') {
        const card = HS.el('<div class="card" style="flex:1;min-width:300px"><h3>안성센터 <span class="tag k">네파</span><span class="tag b">API 연동</span><small id="ansAt"></small></h3>' +
          '<div class="kpis" style="grid-template-columns:repeat(3,1fr);gap:8px"><div class="kpi"><div class="l">' + m1.slice(5, 7) + '월 매출</div><div class="v" style="font-size:17px">' + won(ans.sales) + '</div></div><div class="kpi"><div class="l">지출</div><div class="v" style="font-size:17px">' + won(ans.cost) + '</div></div><div class="kpi"><div class="l">손익</div><div class="v ' + cls(ans.profit) + '" style="font-size:17px">' + (ans.profit >= 0 ? '+' : '') + won(ans.profit) + '</div></div></div><div id="ansApi" style="margin-top:10px"></div></div>');
        row1.appendChild(card);
        HS.anseongSummary && HS.anseongSummary(card.querySelector('#ansApi'), card.querySelector('#ansAt'));
      }
      if (row1.children.length) body.appendChild(row1);

      const row2 = HS.el('<div class="row"></div>');
      if (canW) {
        const list = teams.map((t) => by[t] || { team: t, sales: 0, cost: 0, profit: 0 });
        const mx = Math.max(1, ...list.map((x) => Math.abs(x.profit)));
        row2.appendChild(HS.el('<div class="card" style="flex:1.3;min-width:340px"><h3>팀별 ' + m1.slice(5, 7) + '월 손익 <small>업무일지 자동 집계 · 팀 이름을 누르면 업무일지로 이동</small></h3><div class="tw"><table><tr><th>팀</th><th class="n">매출</th><th class="n">지출</th><th class="n">손익</th><th style="width:28%">손익 규모</th></tr>' +
          list.map((x) => '<tr class="click" onclick="HS.go(\'worklog\',{t:\'' + esc(x.team) + '\',d:\'' + d + '\'})"><td>' + esc(x.team) + '</td><td class="n">' + fmt(x.sales) + '</td><td class="n">' + fmt(x.cost) + '</td><td class="n ' + cls(x.profit) + '">' + sign(Math.round(x.profit)) + '</td><td><div class="bar"><i style="width:' + Math.round((Math.abs(x.profit) / mx) * 100) + '%;background:var(--' + (x.profit >= 0 ? 'pos' : 'neg') + ')"></i></div></td></tr>').join('') +
          '<tr class="tot"><td>합계</td><td class="n">' + fmt(sum.sales) + '</td><td class="n">' + fmt(sum.cost) + '</td><td class="n ' + cls(profit) + '">' + sign(Math.round(profit)) + '</td><td></td></tr></table></div></div>'));
      }
      if (canT) {
        const open = tasks.filter((t) => center === 'all' || (t.center_id || 'gobaek') === center);
        const late = open.filter((t) => t.due_date && t.due_date < today()).length;
        const byTeam = {}; open.forEach((t) => { const k = t.assigned_team || '미할당'; const x = byTeam[k] || (byTeam[k] = { n: 0, p: 0, wait: 0 }); x.n++; x.p += t.progress || 0; if (t.status === '요청') x.wait++; });
        row2.appendChild(HS.el('<div class="card" style="flex:1;min-width:320px"><h3>업무협조 진행 현황 <small>미완료 ' + open.length + '건' + (late ? ' · <span class="neg">기한 지남 ' + late + '건</span>' : '') + '</small></h3><div class="tw"><table><tr><th>할당 팀</th><th class="n">진행중</th><th class="n">미접수</th><th style="width:40%">평균 진행률</th></tr>' +
          (Object.keys(byTeam).length ? Object.entries(byTeam).map(([k, x]) => '<tr class="click" onclick="HS.go(\'tasks\',{team:\'' + esc(k) + '\'})"><td>' + esc(k) + '</td><td class="n">' + x.n + '</td><td class="n ' + (x.wait ? 'neg' : '') + '">' + x.wait + '</td><td><div class="bar"><i style="width:' + Math.round(x.p / x.n) + '%"></i></div></td></tr>').join('') : '<tr><td colspan="4" class="mute">미완료 업무가 없습니다</td></tr>') + '</table></div>' +
          '<div style="margin-top:10px"><button class="btn sm" onclick="HS.go(\'tasks\')">업무협조 보드 열기</button></div></div>'));
      }
      if (row2.children.length) body.appendChild(row2);
      HS.live(['erp_worklog', 'erp_daily_records', 'erp_tasks', 'erp_worklog_day'], () => HS.cur === 'dashboard' && HS.route());
    },
  });

  // ================= 관리자 업무일지 =================
  HS.view('worklog', {
    title: '관리자 업무일지', perm: 'worklog',
    async render(body, p, tools) {
      const myTeams = HS.myTeams(); if (!myTeams.length) { body.innerHTML = '<div class="card empty">담당 팀이 지정되지 않았습니다. 관리자에게 요청하세요.</div>'; return; }
      const team = myTeams.indexOf(p.t) >= 0 ? p.t : myTeams[0]; const d = p.d || today();
      tools.appendChild(HS.seg(myTeams.map((t) => [t, t + (HS.cache.teamMap[t] && HS.cache.teamMap[t].center_id === 'anseong' ? ' (연동)' : '')]), team, (t) => HS.go('worklog', { t, d })));
      tools.appendChild(HS.dateNav(d, (x) => HS.go('worklog', { t: team, d: x })));
      const tm = HS.laborOf(team, d); // 그 해 인건비 (2026-11-12)
      const [w1, w2] = weekRange(d); const [m1, m2] = monthRange(d);
      const [prices, rows, day, lock, weekRows, weekDays, heads] = await Promise.all([
        HS.db.list('erp_task_prices', { eq: { team }, order: ['sort'] }), HS.db.list('erp_worklog', { eq: { team, work_date: d } }),
        HS.db.list('erp_worklog_day', { eq: { team, work_date: d } }), lockState(d, 'worklog'),
        HS.db.list('erp_worklog', { eq: { team }, gte: { work_date: m1 < w1 ? m1 : w1 }, lte: { work_date: m2 > w2 ? m2 : w2 } }), HS.db.list('erp_worklog_day', { eq: { team }, gte: { work_date: m1 < w1 ? m1 : w1 }, lte: { work_date: m2 > w2 ? m2 : w2 } }),
        HS.db.list('erp_headcount', { eq: { work_date: d } }),
      ]);
      const dayRow = day[0] || { work_date: d, team, ot_hours: 0, ot_people: 0, status: '작성중' };
      const canEdit = HS.teamOk(team) && (HS.can('worklog', 'create') || HS.can('worklog', 'edit')) && (!lock || HS.can('worklog', 'unlock'));
      // 업무 추가 · 단가 변경은 [설정 › 원가관리 설정] 에서만 (관리자 = 전 팀 · 팀장 = 자기 팀)
      // 이 화면의 공정단가는 누구도 못 고칩니다 — 디폴트 수정 불가 (2026-11-12 결정)
      const canSet = HS.can('costset', 'edit') || HS.can('settings', 'edit');
      // 업무 목록 = 단가표 + 기존 입력
      const key = (g, t) => g + '|' + t; const map = new Map();
      prices.filter((x) => x.active !== false).forEach((x) => map.set(key(x.grp, x.task), { grp: x.grp, task: x.task, unit_price: +x.unit_price || 0, qty: null, to_count: null }));
      rows.forEach((r) => map.set(key(r.grp, r.task), Object.assign(map.get(key(r.grp, r.task)) || {}, r)));
      const items = [...map.values()];
      body.innerHTML = '';
      body.appendChild(lockBar(d, 'worklog', lock, () => HS.route()));
      const kp = HS.el('<div class="kpis"></div>'); body.appendChild(kp);
      const lineCost = (r) => (r.cost_override != null ? +r.cost_override : (+r.to_count || 0) * (+tm.labor_cost || 0));
      const otCost = () => (+dayRow.ot_hours || 0) * (+dayRow.ot_people || 0) * (+tm.ot_rate || 0);
      const sumWeek = () => { const all = weekRows.filter((r) => r.work_date >= w1 && r.work_date <= w2 && r.work_date !== d).concat(items.map((x) => Object.assign({ team, work_date: d }, x))); const days = weekDays.filter((x) => x.work_date >= w1 && x.work_date <= w2 && x.work_date !== d).concat([dayRow]); return HS.calc(all, days)[team] || { profit: 0 }; };
      const sumMonth = () => { const all = weekRows.filter((r) => r.work_date >= m1 && r.work_date <= m2 && r.work_date !== d).concat(items.map((x) => Object.assign({ team, work_date: d }, x))); const days = weekDays.filter((x) => x.work_date >= m1 && x.work_date <= m2 && x.work_date !== d).concat([dayRow]); return HS.calc(all, days)[team] || { profit: 0, sales: 0 }; };
      const drawKpi = () => {
        const s = items.reduce((a, r) => a + (+r.qty || 0) * (+r.unit_price || 0), 0), c = items.reduce((a, r) => a + lineCost(r), 0) + otCost(), to = items.reduce((a, r) => a + (+r.to_count || 0), 0);
        const wk = sumWeek(), mo = sumMonth();
        kp.innerHTML = '<div class="card kpi"><div class="l">당일 매출</div><div class="v">' + fmt(s) + '</div><div class="s">작업수량 × 공정단가</div></div><div class="card kpi"><div class="l">당일 지출</div><div class="v">' + fmt(c) + '</div><div class="s">T.O ' + fmt(to, 1) + '명 × ' + fmt(tm.labor_cost) + '원' + (otCost() ? ' + 연장 ' + fmt(otCost()) : '') + '</div></div><div class="card kpi"><div class="l">당일 손익</div><div class="v ' + cls(s - c) + '">' + sign(Math.round(s - c)) + '</div><div class="s">' + weekLabel(d) + ' 누계 ' + sign(Math.round(wk.profit)) + '</div></div><div class="card kpi"><div class="l">' + m1.slice(5, 7) + '월 누계 손익</div><div class="v ' + cls(mo.profit) + '">' + sign(Math.round(mo.profit)) + '</div><div class="s">매출 ' + won(mo.sales) + ' · 상태 <span class="tag ' + (dayRow.status === '제출' ? 'g' : 'y') + '">' + esc(dayRow.status || '작성중') + '</span></div></div>';
      };
      const row = HS.el('<div class="row"></div>'); body.appendChild(row);
      const main = HS.el('<div class="card" style="flex:1;min-width:340px"><h3>업무별 입력 <small>노란 칸만 입력 · 매출·지출·손익은 자동 계산 · 엑셀에서 복사해 붙여넣기 가능</small></h3></div>'); row.appendChild(main);
      const g = HS.grid({
        keyLabel: '업무구분 · 상세업무', editable: canEdit, total: true,
        rows: items.map((x) => ({ key: key(x.grp, x.task), label: (x.grp ? x.grp + ' · ' : '') + x.task, data: x })),
        cols: [
          // 공정단가는 이 화면에서 못 고침 (2026-11-12) — [설정 › 원가관리 설정] 에서만
          { k: 'unit_price', l: '공정단가', t: 'auto', f: (x) => x.unit_price, noSum: true, show: (v) => fmt(v) },
          { k: 'qty', l: '작업수량', t: 'num' }, { k: 'to_count', l: 'T.O', t: 'num' },
          { k: 'sales', l: '매출', t: 'auto', f: (x) => (+x.qty || 0) * (+x.unit_price || 0), show: (v) => fmt(v) },
          { k: 'cost', l: '지출', t: 'auto', f: (x) => lineCost(x), show: (v) => fmt(v) },
          { k: 'profit', l: '손익', t: 'auto', f: (x) => (+x.qty || 0) * (+x.unit_price || 0) - lineCost(x), show: (v) => sign(Math.round(v)), cls: cls },
        ],
        onChange: () => { drawKpi(); dirty(); },
      });
      main.appendChild(g.el);
      const foot = HS.el('<div style="display:flex;gap:12px;margin-top:12px;align-items:center;flex-wrap:wrap"><label class="f" style="flex-direction:row;align-items:center;gap:6px">야근시간 <input class="cell" id="oth" ' + (canEdit ? '' : 'disabled') + '></label><label class="f" style="flex-direction:row;align-items:center;gap:6px">야근인원 <input class="cell" id="otp" ' + (canEdit ? '' : 'disabled') + '></label><label class="f" style="flex-direction:row;align-items:center;gap:6px;flex:1;min-width:200px">비고 <input class="cell txt" style="width:100%" id="dnote" ' + (canEdit ? '' : 'disabled') + '></label>' +
        (canSet ? '<a class="btn" href="#/costset?k=prices&t=' + encodeURIComponent(team) + '">업무 · 단가 고치기 (설정)</a>' : '') + (canEdit ? '<button class="btn" id="save">저장</button><button class="btn p" id="submit">저장 후 제출</button>' : '') + '</div>');
      main.appendChild(foot);
      foot.querySelector('#oth').value = dayRow.ot_hours || ''; foot.querySelector('#otp').value = dayRow.ot_people || ''; foot.querySelector('#dnote').value = dayRow.note || '';
      let dayDirty = false;
      ['oth', 'otp', 'dnote'].forEach((id) => (foot.querySelector('#' + id).oninput = () => { dayRow.ot_hours = +foot.querySelector('#oth').value || 0; dayRow.ot_people = +foot.querySelector('#otp').value || 0; dayRow.note = foot.querySelector('#dnote').value; dayDirty = true; drawKpi(); dirty(); }));
      const dirty = () => { const b = foot.querySelector('#save'); if (b) b.textContent = '저장 (' + (g.changed().length + (dayDirty ? 1 : 0)) + ')'; };
      drawKpi();
      const save = async (submit) => {
        try {
          const ch = g.changed().map((r) => ({ work_date: d, team, grp: r.data.grp || '', task: r.data.task, unit_price: +r.data.unit_price || 0, qty: +r.data.qty || 0, to_count: +r.data.to_count || 0, cost_override: r.data.cost_override != null ? r.data.cost_override : null }));
          if (ch.length) await HS.db.upsert('erp_worklog', ch);
          // 단가표는 여기서 건드리지 않음 (2026-11-12) — [설정 › 원가관리 설정] 에서만 바꿈
          if (dayDirty || submit) await HS.db.upsert('erp_worklog_day', [{ work_date: d, team, ot_hours: dayRow.ot_hours || 0, ot_people: dayRow.ot_people || 0, note: dayRow.note || null, status: submit ? '제출' : dayRow.status || '작성중', submitted_by: submit ? HS.me.id : dayRow.submitted_by || null, submitted_at: submit ? new Date().toISOString() : dayRow.submitted_at || null }]);
          g.clear(); dayDirty = false; HS.toast(submit ? team + ' ' + d + ' 업무일지를 제출했습니다' : '저장했습니다', 'ok'); HS.route();
        } catch (e) { HS.err(e); }
      };
      if (canEdit) {
        foot.querySelector('#save').onclick = () => save(false); foot.querySelector('#submit').onclick = () => save(true);
        main.appendChild(HS.el('<div class="mute" style="font-size:11.5px;margin-top:8px;line-height:1.7">· 여기서는 <b>작업수량 · T.O</b> 만 적습니다. <b>공정단가는 이 화면에서 고칠 수 없습니다</b> (2026-11-12).<br>· 업무 추가 · 숨김 · 단가 변경은 <b>[설정 › 원가관리 설정]</b> 에서 합니다 — ' + (canSet ? '<b>자기 팀</b> 것을 고칠 수 있습니다.' : '관리자 또는 그 팀 팀장만 할 수 있습니다.') + '</div>'));
      }
      // 오른쪽: 인원 확인 + 주간 표
      const side = HS.el('<div class="col" style="width:380px;max-width:100%"></div>'); row.appendChild(side);
      // 인원 확인은 2026-11-12 부터 나눠 적음 — 현장확인은 각 팀이 자기 줄만 · 사무실확인 · 배정 인원은 지원팀 화면에서
      const hc = HS.cache.teams.map((t) => { const h = heads.find((x) => x.team === t.name) || {}; return { key: t.name, data: { field_count: h.field_count, office_count: h.office_count, alloc_count: h.alloc_count } }; });
      const hg = HS.grid({ keyLabel: '부서', editable: (HS.can('worklog', 'edit') || HS.can('worklog', 'create')) && (!lock || HS.can('worklog', 'unlock')), total: true, rows: hc,
        cols: [
          { k: 'field_count', l: '현장확인', t: 'num', ro: (r) => r.key !== team }, // 내 팀 줄만
          { k: 'office_count', l: '사무실확인', t: 'num', ro: true },               // 지원팀이 적음
          { k: 'alloc_count', l: '배정 인원', t: 'num', ro: true },                 // 지원팀이 적음
          { k: 'ok', l: '확인', t: 'auto', noSum: true, f: (x) => (x.field_count == null && x.office_count == null ? null : +x.field_count === +x.office_count ? 1 : 0), show: (v) => (v == null ? '' : v ? '<span class="tag g">일치</span>' : '<span class="tag r">불일치</span>') },
        ] });
      const hcard = HS.el('<div class="card"><h3>팀별 인원 확인 <small>' + d.slice(5) + ' · <b>' + esc(team) + '</b> 줄의 현장확인만 적습니다</small></h3></div>'); hcard.appendChild(hg.el); side.appendChild(hcard);
      hcard.appendChild(HS.el('<div class="mute" style="font-size:11.5px;margin-top:8px;line-height:1.7">· <b>현장확인</b> = 현장에서 센 인원 — 각 팀이 자기 줄에 적습니다 (다른 팀 줄은 보기만).<br>· <b>사무실확인 · 배정 인원</b> = <a href="#/headcount">지원팀 › 팀별 인원 배정</a> 에서 적습니다 (여기서는 보기만).</div>'));
      if (hg.changed) { const b = HS.el('<button class="btn sm" style="margin-top:8px">인원 저장</button>'); b.onclick = async () => { try { const up = hg.changed().filter((r) => r.key === team); if (!up.length) return HS.toast('바뀐 것이 없습니다'); await HS.db.upsert('erp_headcount', up.map((r) => ({ work_date: d, team: r.key, field_count: +r.data.field_count || 0 }))); hg.clear(); HS.toast('인원을 저장했습니다', 'ok'); } catch (e) { HS.err(e); } }; if (!lock || HS.can('worklog', 'unlock')) hcard.appendChild(b); }
      // 주간
      const wk = []; for (let x = w1; x <= w2; x = addDays(x, 1)) wk.push(x);
      const wcard = HS.el('<div class="card"><h3>' + weekLabel(d) + ' 일별 <small>' + w1.slice(5) + ' ~ ' + w2.slice(5) + '</small></h3><div class="tw"><table><tr><th>일자</th><th class="n">T.O</th><th class="n">매출</th><th class="n">손익</th></tr>' +
        wk.map((x) => { const c = HS.calc(weekRows.filter((r) => r.work_date === x), weekDays.filter((r) => r.work_date === x))[team]; return '<tr class="click" data-d="' + x + '"' + (x === d ? ' style="background:#FBF8EC"' : '') + '><td>' + x.slice(5) + ' (' + HS.dow(x) + ')</td><td class="n">' + (c ? fmt(c.to, 1) : '-') + '</td><td class="n">' + (c ? fmt(c.sales) : '-') + '</td><td class="n ' + (c ? cls(c.profit) : '') + '">' + (c ? sign(Math.round(c.profit)) : '-') + '</td></tr>'; }).join('') + '</table></div></div>');
      wcard.querySelectorAll('tr[data-d]').forEach((tr) => { tr.onclick = () => HS.go('worklog', { t: team, d: tr.dataset.d }); }); // 보안 설정(CSP) 때문에 HTML 안의 onclick 은 실행되지 않음
      side.appendChild(wcard);
      // 최종 수정자
      const last = rows.slice().sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0];
      if (last) side.appendChild(HS.el('<div class="card hist"><h3>최근 수정</h3>' + rows.slice().sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, 5).map((r) => '<div><b>' + esc(new Date(r.updated_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })) + ' ' + esc(HS.who(r.updated_by) || '') + '</b> · ' + esc(r.task) + ' 수량 ' + fmt(r.qty) + ' / T.O ' + fmt(r.to_count, 1) + '</div>').join('') + '</div>'));
      HS.live(['erp_worklog', 'erp_locks'], () => { if (HS.cur === 'worklog' && !g.changed().length) HS.route(); });
    },
  });

  // ================= 일일 마감보고 =================
  const N = 'num';
  const SECTIONS = {
    b2b: { l: 'B2B 입·출고', rows: 'brands', cols: [{ k: 'in_plan_st', l: '입고예정ST', t: N }, { k: 'in_real_st', l: '실입고ST', t: N }, { k: 'in_qty', l: '입고수량', t: N }, { k: 'in_return_qty', l: '입고반품', t: N }, { k: 'out_plan_st', l: '출고예정ST', t: N }, { k: 'out_real_st', l: '실출고ST', t: N }, { k: 'wait_st', l: '출고후대기ST', t: N }, { k: 'first_qty', l: '초도출고', t: N }, { k: 'order_qty', l: '판매분지시', t: N }, { k: 'full_qty', l: '완불', t: N }, { k: 'out_qty', l: '출고수량', t: N }, { k: 'short_qty', l: '미출', t: 'auto', f: (x) => (x.out_qty == null && x.order_qty == null ? x.short_qty : (+x.out_qty || 0) - (+x.order_qty || 0) - (+x.full_qty || 0)), cls: (v) => (v ? 'neg' : '') }, { k: 'online_order', l: '온라인지시', t: N }, { k: 'online_out', l: '온라인출고', t: N }, { k: 'online_short', l: '온라인미출', t: 'auto', f: (x) => (+x.online_out || 0) - (+x.online_order || 0), cls: (v) => (v ? 'neg' : '') }, { k: 'total_qty', l: '당일총수량', t: 'auto', f: (x) => (+x.first_qty || 0) + (+x.out_qty || 0) + (+x.online_out || 0) }] },
    return: { l: '반품', rows: 'brands', cols: [{ k: 'online_return', l: '온라인 전일확정', t: N }, { k: 'store_return', l: '매장 전일확정', t: N }, { k: 'return_total', l: '반품합계', t: 'auto', f: (x) => (+x.online_return || 0) + (+x.store_return || 0) }, { k: 'unconfirmed', l: '미확정수량', t: N }] },
    carryover: { l: '이월출고', rows: 'brands', cols: [{ k: 'season', l: '년도·시즌·복종', t: 'text' }, { k: 'boxes', l: '총박스수', t: N }, { k: 'stores', l: '매장수', t: N }, { k: 'qty', l: '출고수량', t: N }] },
    material: { l: '부자재·사은품', rows: 'brands', cols: [{ k: 'in_mat', l: '입고 부자재', t: N }, { k: 'in_gift', l: '입고 사은품', t: N }, { k: 'out_mat', l: '출고 부자재', t: N }, { k: 'out_gift', l: '출고 사은품', t: N }, { k: 'ret_mat', l: '반품 부자재', t: N }, { k: 'ret_gift', l: '반품 사은품', t: N }] },
    parcel: { l: '택배 박스', rows: 'brands', cols: [{ k: 'out_lotte', l: '출고 롯데', t: N }, { k: 'out_top', l: '출고 탑코리아', t: N }, { k: 'out_seoul', l: '출고 서울화물', t: N }, { k: 'out_total', l: '출고합계', t: 'auto', f: (x) => (+x.out_lotte || 0) + (+x.out_top || 0) + (+x.out_seoul || 0) }, { k: 'ret_lotte', l: '반품 롯데', t: N }, { k: 'ret_top', l: '반품 탑코리아', t: N }, { k: 'ret_etc', l: '반품 기타택배', t: N }, { k: 'ret_seoul', l: '반품 서울화물', t: N }, { k: 'ret_total', l: '반품합계', t: 'auto', f: (x) => (+x.ret_lotte || 0) + (+x.ret_top || 0) + (+x.ret_etc || 0) + (+x.ret_seoul || 0) }] },
    b2c: { l: 'B2C 화주사', rows: ['크리스', '엘엑스컴퍼니', '로라애슐리', '수퍼윅스'], cols: [{ k: 'b2b_in', l: 'B2B입고', t: N }, { k: 'rt_in', l: 'RT반입', t: N }, { k: 'order_qty', l: '주문수량', t: N }, { k: 'order_cnt', l: '주문건수', t: N }, { k: 'cust_out', l: '고객출고', t: N }, { k: 'out_cnt', l: '출고건수', t: N }, { k: 'not_out', l: '미출고', t: 'auto', f: (x) => (+x.cust_out || 0) - (+x.order_qty || 0), cls: (v) => (v ? 'neg' : '') }, { k: 'b2b_return', l: 'B2B반품', t: N }, { k: 'cust_return', l: '고객반품', t: N }, { k: 'lotte_out', l: '롯데출고', t: N }, { k: 'out_total', l: '출고합계', t: N }, { k: 'return_total', l: '반품합계', t: N }] },
    offline: { l: '4개사 완불', rows: 'offline', cols: [{ k: 'order_qty', l: '지시수량', t: N }, { k: 'total_qty', l: '당일 총수량', t: N }, { k: 'short', l: '미출고', t: 'auto', f: (x) => (+x.total_qty || 0) - (+x.order_qty || 0), cls: (v) => (v ? 'neg' : '') }, { k: 'rate', l: '출고율', t: 'auto', noSum: true, f: (x) => (+x.order_qty ? (+x.total_qty || 0) / +x.order_qty : null), show: (v) => (v == null ? '-' : (v * 100).toFixed(2) + '%') }, { k: 'reason', l: '미출고 사유', t: 'text' }] },
    wms: { l: 'WMS 대조', rows: 'brands', cols: [{ k: 'sys_in', l: '전산 입고', t: N }, { k: 'sys_out', l: '전산 출고', t: N }, { k: 'sys_return', l: '전산 반품', t: N }, { k: 'wms_in', l: 'WMS 입고', t: N }, { k: 'wms_out', l: 'WMS 출고', t: N }, { k: 'wms_return', l: 'WMS 반품', t: N }, { k: 'match', l: '일치', t: 'auto', noSum: true, f: (x) => (x.sys_in == null && x.wms_in == null ? null : +x.sys_in === +x.wms_in && +x.sys_out === +x.wms_out && +x.sys_return === +x.wms_return), show: (v) => (v == null ? '' : v ? '<span class="tag g">일치</span>' : '<span class="tag r">불일치</span>') }, { k: 'done', l: '출고작업', t: 'text' }] },
    short: { l: '과·미출 상세', rows: 'free', cols: [{ k: 'kind', l: '구분', t: 'text' }, { k: 'brand', l: '브랜드', t: 'text' }, { k: 'store_code', l: '매장코드', t: 'text' }, { k: 'store', l: '매장명', t: 'text' }, { k: 'style', l: '품번', t: 'text' }, { k: 'color', l: '색상', t: 'text' }, { k: 'size', l: '사이즈', t: 'text' }, { k: 'qty', l: '과미출수량', t: N }, { k: 'reason', l: '사유', t: 'text' }] },
  };
  HS.DAILY_SECTIONS = SECTIONS;
  // 일일 마감보고 엑셀 대량 등록: 날짜 시트(예: 261030)마다 하루씩 · 마감된 날짜는 제외 · 이미 있는 날짜는 덮어쓰기 선택
  async function dailyBulk() {
    const f = HS.el('<div><div class="drop" id="bd" style="padding:22px;text-align:center"><b>일일 마감보고 엑셀 파일 놓기</b> (또는 눌러서 고르기) ' + HS.fmtLink('daily_bulk') + '<div class="mute" style="font-size:12px;margin-top:4px">시트 이름이 날짜(예: 261030)인 시트를 모두 읽습니다 · 여러 파일 가능</div><input type="file" multiple accept=".xlsx,.xlsm,.xls" class="hide"></div><div id="br" style="margin-top:12px"></div></div>');
    const dz = f.querySelector('#bd'), fi = dz.querySelector('input'), br = f.querySelector('#br'); let plan = null;
    const handle = async (files) => {
      br.innerHTML = '<div class="empty">읽는 중… (시트가 많으면 10~20초)</div>'; await new Promise((r) => setTimeout(r, 30));
      const days = new Map(); const skip = [];
      for (const file of files) {
        try { const wb = HSParsers.readWorkbook(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
          HSParsers.analyze(wb, file.name).forEach((x) => { if (x.kind !== 'daily' || !x.sets) { if (x.sheet !== '-') skip.push(x.sheet); return; } const rows = x.sets.filter((s2) => s2.table === 'daily_records').flatMap((s2) => s2.rows); if (rows.length) days.set(rows[0].rec_date, rows); });
        } catch (e) { skip.push(file.name + ' 읽기 실패: ' + e.message); }
      }
      const dates = [...days.keys()].sort(); if (!dates.length) { br.innerHTML = '<div class="lock">일일 마감보고 시트를 찾지 못했습니다 · 시트 이름이 날짜(예: 261030)인지 확인하세요</div>'; return; }
      const [have, locks] = await Promise.all([HS.db.list('erp_daily_records', { gte: { rec_date: dates[0] }, lte: { rec_date: dates[dates.length - 1] }, select: 'rec_date' }), HS.db.list('erp_locks', { eq: { module: 'daily', locked: true } })]);
      const H = new Set(have.map((r) => r.rec_date)); const L = new Set(locks.map((l) => l.lock_date)); const unl = HS.can('daily', 'unlock');
      const nw = dates.filter((x) => !H.has(x)), ex = dates.filter((x) => H.has(x) && (!L.has(x) || unl)), lk = dates.filter((x) => L.has(x) && !unl);
      plan = { days, nw, ex, lk };
      const md = (a) => (a.length ? a[0].slice(5).replace('-', '/') + (a.length > 1 ? ' ~ ' + a[a.length - 1].slice(5).replace('-', '/') : '') : '-');
      br.innerHTML = '<div class="tw"><table><tr><th>구분</th><th class="n">날짜 수</th><th>기간</th><th>처리</th></tr><tr><td><b>새 날짜</b></td><td class="n">' + nw.length + '</td><td>' + md(nw) + '</td><td class="pos">등록</td></tr><tr><td><b>이미 있는 날짜</b></td><td class="n">' + ex.length + '</td><td>' + md(ex) + '</td><td><label><input type="checkbox" id="ow" checked> 엑셀 값으로 덮어쓰기</label></td></tr>' + (lk.length ? '<tr><td><b>마감된 날짜</b></td><td class="n">' + lk.length + '</td><td>' + md(lk) + '</td><td class="mute">제외 (마감 해제 권한자만)</td></tr>' : '') + '</table></div><div class="mute" style="font-size:11.5px;margin-top:6px">전체 ' + dates.length + '일 · ' + dates[0] + ' ~ ' + dates[dates.length - 1] + (skip.length ? ' · 날짜 시트가 아닌 것 ' + skip.length + '개는 건너뜀 (' + esc(skip.slice(0, 3).join(', ')) + ')' : '') + '</div><div id="bp" style="margin-top:10px"></div>';
    };
    dz.onclick = (e) => { if (e.target !== fi) fi.click(); }; fi.onchange = () => handle([...fi.files]);
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over'); dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); handle([...e.dataTransfer.files]); };
    const ok = await HS.modal('일일 마감보고 · 엑셀 대량 등록', f, [['닫기', null], ['등록', true, 'p']], { wide: true, onOk: async (v, bg) => {
      if (!plan) throw new Error('먼저 엑셀 파일을 올려 주세요');
      const ow = bg.querySelector('#ow'); const use = plan.nw.concat(ow && !ow.checked ? [] : plan.ex).sort(); if (!use.length) throw new Error('등록할 날짜가 없습니다');
      const rows = use.flatMap((x) => plan.days.get(x)); const bp = bg.querySelector('#bp'); bg.querySelectorAll('.mf .btn').forEach((b) => (b.disabled = true));
      await HS.db.upsert('erp_daily_records', rows, (a, b) => { bp.innerHTML = '<div>등록 중… ' + fmt(a) + ' / ' + fmt(b) + '</div><progress max="' + b + '" value="' + a + '" style="width:100%"></progress>'; });
      await HS.db.insert('erp_uploads', { file_name: '일일 마감보고 대량 등록', kinds: ['일일 마감보고'], rows: rows.length, summary: { days: use.length, from: use[0], to: use[use.length - 1] } }).catch(() => {});
      HS.toast(use.length + '일 · ' + fmt(rows.length) + '줄 등록했습니다', 'ok'); plan.last = use[use.length - 1];
    } });
    if (ok && plan && plan.last) HS.go('daily', { d: plan.last });
  }

  HS.view('daily', {
    title: '일일 마감보고', perm: 'daily',
    async render(body, p, tools) {
      const d = p.d || today(); const s = SECTIONS[p.s] ? p.s : 'b2b';
      tools.appendChild(HS.dateNav(d, (x) => HS.go('daily', { d: x, s })));
      const [recs, lock] = await Promise.all([HS.db.list('erp_daily_records', { eq: { rec_date: d } }), lockState(d, 'daily')]);
      if (HS.can('daily', 'create')) { const bk = HS.el('<button class="btn p" id="dbulk">⬆ 엑셀 대량 등록</button>'); bk.onclick = () => dailyBulk(); tools.appendChild(bk); }
      const xl = HS.el('<button class="btn">엑셀 내려받기</button>'); tools.appendChild(xl);
      xl.onclick = () => { HS.needXlsx(); const wb = XLSX.utils.book_new(); Object.entries(SECTIONS).forEach(([k, def]) => { const rr = recs.filter((r) => r.section === k).map((r) => Object.assign({ 구분: r.rec_key }, Object.fromEntries(def.cols.map((c) => [c.l, r.data[c.k]])))); if (rr.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rr), def.l.replace(/[\\/?*[\]:]/g, '')); }); if (!wb.SheetNames.length) return HS.toast('자료가 없습니다'); XLSX.writeFile(wb, '일일마감보고_' + d + '.xlsx'); };
      body.innerHTML = '';
      body.appendChild(lockBar(d, 'daily', lock, () => HS.route()));
      const tabs = HS.seg(Object.entries(SECTIONS).map(([k, v]) => [k, v.l + (recs.some((r) => r.section === k) ? ' ●' : '')]), s, (x) => HS.go('daily', { d, s: x }));
      body.appendChild(tabs);
      const def = SECTIONS[s];
      const mine = recs.filter((r) => r.section === s);
      let keys;
      if (def.rows === 'brands') keys = HS.bsort([...new Set(HS.cache.brands.filter((b) => b.center_id !== 'anseong' && b.b2b !== false).map((b) => b.name).concat(mine.map((r) => r.rec_key)))]); // 브랜드 차례 = 기준정보 › 브랜드 순번
      else if (def.rows === 'offline') { keys = mine.map((r) => r.rec_key); if (!keys.length) keys = HS.cache.brands.filter((b) => b.center_id !== 'anseong').map((b) => (b.owner || '') + '|' + b.name); }
      else if (def.rows === 'free') keys = mine.map((r) => r.rec_key);
      else keys = [...new Set(def.rows.concat(mine.map((r) => r.rec_key)))];
      const rows = keys.map((k) => { const r = mine.find((x) => x.rec_key === k); return { key: k, label: k.replace('|', ' · '), data: Object.assign({}, r ? r.data : {}) }; });
      const editable = (HS.can('daily', 'create') || HS.can('daily', 'edit')) && (!lock || HS.can('daily', 'unlock'));
      const card = HS.el('<div class="card"><h3>' + esc(def.l) + ' <small>' + d + ' · 단위 PCS' + (s === 'return' && rows[0] && rows[0].data.basis_date ? ' · 반품 기준일 ' + rows[0].data.basis_date : '') + ' · 엑셀에서 여러 칸 복사 → 붙여넣기 가능</small></h3></div>');
      const g = HS.grid({ keyLabel: def.rows === 'offline' ? '화주사 · 브랜드' : def.rows === 'free' ? '#' : '브랜드', editable, total: s !== 'short', rows, cols: def.cols, onChange: (n) => { sv.textContent = '저장 (' + n + ')'; } });
      card.appendChild(g.el);
      // 전산 대비 차이 (B2B 판매분지시 ↔ 전산자료 WMS 출고지시 판매)
      if (false && s === 'b2b' && HS.can('csdata', 'view')) { // WMS 출고지시 미사용 (배분LIST로 대체 · 2026-11-03)
        const co = (await HS.db.list('erp_cs_order', { eq: { d, sub: 'B2B' } }).catch(() => [])).filter((r) => r.sale != null);
        if (co.length) {
          const cs = {}; co.forEach((r) => (cs[r.brand] = +r.sale));
          const df = Object.keys(cs).concat(mine.map((r) => r.rec_key)).filter((b, i, a) => a.indexOf(b) === i).map((b) => { const m = mine.find((x) => x.rec_key === b); const v = m && m.data.order_qty != null ? +m.data.order_qty : null; return { b, v, c: cs[b] != null ? cs[b] : null }; }).filter((x) => x.v != null && x.c != null && x.v !== x.c);
          card.appendChild(HS.el('<div class="lock ' + (df.length ? 'warn' : 'ok') + '" style="margin-top:10px;font-size:12.5px"><b>전산 대비</b>' + (df.length ? '<span class="csdiff">차이 ' + df.length + '개 브랜드</span> ' + df.map((x) => esc(HS.bname(x.b)) + ' 판매분지시 ' + fmt(x.v) + ' / 전산 ' + fmt(x.c) + ' (' + (x.v - x.c > 0 ? '+' : '') + fmt(x.v - x.c) + ')').join(' · ') : '<span class="csdiff ok">판매분지시 = 전산 출고지시</span>') + ' <a href="#/cs?k=order&t=B2B&d=' + d + '">전산자료 보기</a></div>'));
        }
      }
      // 배분LIST(17~18시 당일 마감)로 채운 칸 · 손 수정 표시 · 되돌리기
      const AF = HS.ALLOC_FILL || {}; const AL = { first_qty: '초도출고', order_qty: '판매분지시', full_qty: '완불', online_order: '온라인지시' };
      const srcR = s === 'b2b' ? mine.filter((r) => r.data && r.data._src) : [];
      if (srcR.length) {
        const man = []; srcR.forEach((r) => (r.data._man || []).forEach((f) => man.push({ b: r.rec_key, f, v: r.data[f], src: r.data._src[f] })));
        const at = srcR.map((r) => r.data._src_at).filter(Boolean).sort().pop();
        const acl = HS.allocClose ? await HS.allocClose(d) : null; const aclT = acl && acl.closed_at ? ' · <b>🔒 배분LIST 마감 ' + new Date(acl.closed_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) + ' · ' + acl.brands + '개 브랜드</b>' : ' · <span class="wa3">배분LIST 마감 전</span>';
        const sb = HS.el('<div class="lock ' + (man.length ? 'warn' : 'ok') + '" style="margin-top:10px;font-size:12.5px"><span>📥 <b>전산자료</b> 배분LIST' + (at ? ' ' + new Date(at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '') + ' (당일 마감) 값으로 초도출고 · 판매분지시 · 완불 · 온라인지시를 채웠습니다' + aclT + (man.length ? ' · <b>손 수정 ' + man.length + '칸</b> 유지: ' + man.map((x) => esc(HS.bname(x.b)) + ' ' + AL[x.f] + ' ' + fmt(x.v) + ' (파일 ' + fmt(x.src) + ')').join(' · ') : '') + ' · <a href="#/cs?k=order&t=배분LIST&d=' + d + '">배분LIST 보기</a></span><span class="sp"></span>' + (man.length && editable ? '<button class="btn sm" id="arv">파일 값으로 되돌리기</button>' : '') + '</div>');
        card.appendChild(sb);
        const arv = sb.querySelector('#arv'); if (arv) arv.onclick = async () => { if (!(await HS.confirm('손으로 고친 ' + man.length + '칸을 배분LIST 파일 값으로 되돌릴까요?'))) return; try { await HS.db.upsert('erp_daily_records', srcR.filter((r) => (r.data._man || []).length).map((r) => { const dt = Object.assign({}, r.data); (dt._man || []).forEach((f) => (dt[f] = dt._src[f])); dt._man = []; return { rec_date: d, section: 'b2b', rec_key: r.rec_key, data: dt }; })); HS.toast('되돌렸습니다', 'ok'); HS.route(); } catch (e) { HS.err(e); } };
      }
      const bar = HS.el('<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"></div>'); card.appendChild(bar);
      const sv = HS.el('<button class="btn p">저장</button>');
      if (editable) {
        bar.appendChild(sv);
        sv.onclick = async () => { try { const ch = g.changed(); if (!ch.length) return HS.toast('바뀐 내용이 없습니다'); await HS.db.upsert('erp_daily_records', ch.map((r) => { const dt = Object.assign({}, r.data); if (s === 'b2b' && dt._src) { const m = new Set(dt._man || []); for (const f in (HS.ALLOC_FILL || {})) { if (dt._src[f] == null) continue; const v = dt[f] === '' || dt[f] == null ? null : +dt[f]; if (v !== +dt._src[f]) m.add(f); else m.delete(f); } dt._man = [...m]; } return { rec_date: d, section: s, rec_key: r.key, data: dt }; })); g.clear(); HS.toast(ch.length + '건 저장했습니다', 'ok'); HS.route(); } catch (e) { HS.err(e); } };
        if (def.rows === 'free' || def.rows === 'offline' || def.rows === 'brands') {
          const add = HS.el('<button class="btn">+ 행 추가</button>'); bar.appendChild(add);
          add.onclick = async () => {
            if (def.rows === 'free') { await HS.db.upsert('erp_daily_records', [{ rec_date: d, section: s, rec_key: Date.now().toString(36), data: { kind: 'B2B' } }]); return HS.route(); }
            const f = HS.el('<div class="form"><label class="f wide">' + (def.rows === 'offline' ? '화주사|브랜드 (예: 크리스|핑)' : '브랜드') + '<input class="in" id="k"></label></div>');
            await HS.modal('행 추가', f, [['취소', null], ['추가', true, 'p']], { onOk: async () => { const k = f.querySelector('#k').value.trim(); if (!k) throw new Error('입력하세요'); await HS.db.upsert('erp_daily_records', [{ rec_date: d, section: s, rec_key: k, data: {} }]); HS.route(); } });
          };
        }
        const prev = HS.el('<button class="btn">전날 브랜드 목록 가져오기</button>');
        if (!mine.length && def.rows !== 'brands') { bar.appendChild(prev); prev.onclick = async () => { const pr = await HS.db.list('erp_daily_records', { eq: { rec_date: addDays(d, -1), section: s } }); if (!pr.length) return HS.toast('전날 자료가 없습니다'); await HS.db.upsert('erp_daily_records', pr.map((r) => ({ rec_date: d, section: s, rec_key: r.rec_key, data: {} }))); HS.route(); }; }
      }
      const info = HS.el('<span class="mute" style="font-size:11.5px;align-self:center"></span>');
      const last = mine.slice().sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0];
      if (last) info.textContent = '최종 수정 ' + (HS.who(last.updated_by) || '') + ' ' + new Date(last.updated_at).toLocaleString('ko-KR');
      bar.appendChild(info);
      body.appendChild(card);
      // 섹션별 입력 현황
      body.appendChild(HS.el('<div class="card"><h3>입력 현황</h3><div style="display:flex;gap:8px;flex-wrap:wrap">' + Object.entries(SECTIONS).map(([k, v]) => { const n = recs.filter((r) => r.section === k).length; return '<span class="tag ' + (n ? 'g' : '') + '">' + esc(v.l) + ' ' + (n ? n + '건' : '대기') + '</span>'; }).join('') + '</div></div>'));
      HS.live(['erp_daily_records', 'erp_locks'], () => { if (HS.cur === 'daily' && !g.changed().length) HS.route(); });
    },
  });
})();
