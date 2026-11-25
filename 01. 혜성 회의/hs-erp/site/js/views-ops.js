/* 업무협조 TO-DO · 반품 관리 · 입고대행 정산 · 안성센터 연동 */
(function () {
  'use strict';
  const { esc, fmt, today, addDays, monthRange } = HS;

  // ================= 업무협조 TO-DO =================
  const TYPES = ['보충출고', '오픈출고', '홀딩·재출고', '수출출고', '용차', 'D+1지시', 'B2B부자재', 'O2O부자재', '폐점', '반품', '이관', '기타'];
  const STATUS = [['요청', '요청 (미접수)', ''], ['접수', '접수', 'b'], ['진행중', '진행중', 'y'], ['보류', '보류', 'r'], ['완료', '완료', 'g']];
  const stTag = (s) => { const x = STATUS.find((y) => y[0] === s) || STATUS[0]; return '<span class="tag ' + x[2] + '">' + esc(s) + '</span>'; };
  const typeTag = (t) => '<span class="tag ' + (/오픈/.test(t) ? 'b' : /홀딩/.test(t) ? 'r' : /수출/.test(t) ? 'k' : /용차/.test(t) ? 'n' : '') + '">' + esc(t) + '</span>';
  const canWork = (t) => HS.can('tasks', 'edit') || (HS.can('tasks', 'progress') && ((t.assigned_team && HS.teamOk(t.assigned_team)) || t.assignee === HS.me.id));

  async function taskForm(t) {
    const isNew = !t; t = t || { task_type: '보충출고', priority: '보통', due_date: today(), center_id: 'gobaek' };
    const teams = HS.cache.teams.map((x) => x.name);
    const f = HS.el('<div class="form">' +
      '<label class="f">업무 구분<select class="in" id="f_type">' + TYPES.map((x) => '<option>' + x + '</option>').join('') + '</select></label>' +
      '<label class="f">브랜드<select class="in" id="f_brand"><option value="">-</option>' + HS.cache.brands.map((b) => '<option>' + esc(b.name) + '</option>').join('') + '</select></label>' +
      '<label class="f">할당 팀<select class="in" id="f_team"><option value="">선택</option>' + teams.map((x) => '<option>' + esc(x) + '</option>').join('') + '</select></label>' +
      '<label class="f">담당자 (선택)<select class="in" id="f_who"><option value="">팀 전체</option></select></label>' +
      '<label class="f wide">업무 제목<input class="in" id="f_title" placeholder="예: 롯데잠실 보충 출고 · 용차"></label>' +
      '<label class="f wide">작업 지시 내용<textarea class="in" id="f_detail" placeholder="매장명, 수량, 출고 방법, 주의사항 등"></textarea></label>' +
      '<label class="f">완료 기한<input class="in" type="date" id="f_due"></label><label class="f">출고일<input class="in" type="date" id="f_ship"></label>' +
      '<label class="f">우선순위<select class="in" id="f_pri"><option>긴급</option><option>보통</option><option>낮음</option></select></label>' +
      '<label class="f">센터<select class="in" id="f_center">' + HS.cache.centers.map((c) => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') + '</select></label>' +
      '<label class="f">수량 (PCS)<input class="in" id="f_qty" inputmode="decimal"></label><label class="f">박스수<input class="in" id="f_box" inputmode="decimal"></label></div>');
    const v = (id, x) => { const e = f.querySelector('#' + id); if (x !== undefined) e.value = x == null ? '' : x; return e.value; };
    v('f_type', t.task_type); v('f_brand', t.brand); v('f_team', t.assigned_team); v('f_title', t.title); v('f_detail', t.detail); v('f_due', t.due_date); v('f_ship', t.ship_date); v('f_pri', t.priority || '보통'); v('f_center', t.center_id || 'gobaek'); v('f_qty', t.qty); v('f_box', t.boxes);
    const fillWho = () => { const tm = v('f_team'); const sel = f.querySelector('#f_who'); sel.innerHTML = '<option value="">팀 전체</option>' + HS.cache.people.filter((p) => p.active && (p.teams || []).indexOf(tm) >= 0).map((p) => '<option value="' + p.id + '">' + esc(p.name + ' ' + (p.title || '')) + '</option>').join(''); sel.value = t.assignee || ''; };
    f.querySelector('#f_team').onchange = fillWho; fillWho();
    f.querySelector('#f_team').addEventListener('change', () => { const c = HS.cache.teamMap[v('f_team')]; if (c) v('f_center', c.center_id); });
    return HS.modal(isNew ? '업무 할당' : '업무 수정', f, [['취소', null], [isNew ? '할당하기' : '저장', true, 'p']], {
      wide: true,
      onOk: async () => {
        const row = { task_type: v('f_type'), brand: v('f_brand') || null, assigned_team: v('f_team') || null, assignee: v('f_who') || null, assignee_name: v('f_who') ? HS.who(v('f_who')) : null, title: v('f_title').trim(), detail: v('f_detail').trim() || null, due_date: v('f_due') || null, ship_date: v('f_ship') || null, priority: v('f_pri'), center_id: v('f_center'), qty: v('f_qty') ? +v('f_qty') : null, boxes: v('f_box') ? +v('f_box') : null };
        if (!row.title) throw new Error('업무 제목을 입력하세요');
        if (!row.assigned_team) throw new Error('할당 팀을 선택하세요');
        if (isNew) { row.assigned_by = HS.me.id; row.requester = HS.me.name; row.status = '요청'; row.progress = 0; await HS.db.insert('erp_tasks', row); HS.toast(row.assigned_team + '에 할당했습니다', 'ok'); }
        else { await HS.db.update('erp_tasks', { id: t.id }, row); HS.toast('수정했습니다', 'ok'); }
        HS.route();
      },
    });
  }

  async function taskDetail(id) {
    const t = (await HS.db.list('erp_tasks', { eq: { id: +id } }))[0];
    if (!t) return HS.toast('업무를 찾을 수 없거나 볼 권한이 없습니다', 'err');
    const ev = await HS.db.list('erp_task_events', { eq: { task_id: t.id }, order: ['at', false] }).catch(() => []);
    const work = canWork(t) && t.status !== '완료';
    const late = t.due_date && t.due_date < today() && t.status !== '완료';
    const box = HS.el('<div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' + typeTag(t.task_type) + (t.brand ? '<span class="tag">' + esc(t.brand) + '</span>' : '') + stTag(t.status) + (t.priority === '긴급' ? '<span class="tag r">긴급</span>' : '') + (late ? '<span class="tag r">기한 지남</span>' : '') + '</div>' +
      '<div style="font-size:15px;font-weight:700;margin-bottom:6px">' + esc(t.title) + '</div>' +
      (t.detail ? '<div style="white-space:pre-wrap;line-height:1.6;background:#F6F7FA;border-radius:8px;padding:10px;margin-bottom:10px">' + esc(t.detail) + '</div>' : '') +
      '<div class="tw"><table><tr><td class="mute">할당 팀</td><td><b>' + esc(t.assigned_team || '-') + '</b>' + (t.assignee ? ' · ' + esc(HS.who(t.assignee) || t.assignee_name || '') : t.assignee_name ? ' · ' + esc(t.assignee_name) : '') + '</td><td class="mute">할당자</td><td>' + esc(HS.who(t.assigned_by) || t.requester || '-') + '</td></tr>' +
      '<tr><td class="mute">완료 기한</td><td class="' + (late ? 'neg' : '') + '">' + esc(t.due_date || '-') + '</td><td class="mute">출고일</td><td>' + esc(t.ship_date || '-') + '</td></tr>' +
      '<tr><td class="mute">수량</td><td>' + (t.qty != null ? fmt(t.qty) + ' PCS' : '-') + '</td><td class="mute">박스</td><td>' + (t.boxes != null ? fmt(t.boxes) : '-') + '</td></tr>' +
      '<tr><td class="mute">접수</td><td>' + (t.accepted_at ? new Date(t.accepted_at).toLocaleString('ko-KR') : '-') + '</td><td class="mute">완료</td><td>' + (t.completed_at ? new Date(t.completed_at).toLocaleString('ko-KR') + ' · ' + esc(HS.who(t.completed_by)) : '-') + '</td></tr></table></div>' +
      '<div style="margin:14px 0 6px;display:flex;align-items:center;gap:10px"><b>진행률</b><div class="bar" style="flex:1;height:10px"><i id="pbar" style="width:' + (t.progress || 0) + '%"></i></div><b id="pval">' + (t.progress || 0) + '%</b></div>' +
      (work ? '<input type="range" class="range" id="prog" min="0" max="100" step="10" value="' + (t.progress || 0) + '"><label class="f" style="margin-top:8px">작업 결과 · 메모<textarea class="in" id="res" placeholder="예: 182박스 출고, 서광범 인계">' + esc(t.result || '') + '</textarea></label>' : (t.result ? '<div style="margin-top:6px"><span class="mute">결과:</span> ' + esc(t.result) + '</div>' : '')) +
      '<h4 style="margin:16px 0 6px">진행 이력</h4><div class="hist">' + (ev.length ? ev.map((e) => '<div><b>' + esc(new Date(e.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })) + ' ' + esc(e.by_name || '') + '</b> · ' + esc(e.status) + ' ' + (e.progress != null ? e.progress + '%' : '') + (e.memo ? ' · ' + esc(e.memo) : '') + '</div>').join('') : '<div>이력 없음 (엑셀 이관 자료)</div>') + '</div></div>');
    const btns = [];
    if (work) {
      if (t.status === '요청' || t.status === '보류') btns.push(['접수', 'accept', 'b']);
      if (t.status !== '진행중') btns.push(['진행 시작', 'start']);
      btns.push(['진행률 저장', 'save']); btns.push(['보류', 'hold', 'r']); btns.push(['완료 처리', 'done', 'gd']);
    }
    if (t.status === '완료' && canWork(t)) btns.push(['완료 취소', 'reopen']);
    if (HS.can('tasks', 'edit')) btns.push(['내용 수정', 'edit']);
    if (HS.can('tasks', 'delete')) btns.push(['삭제', 'del', 'r']);
    btns.push(['닫기', null]);
    const res = await HS.modal('업무 상세 #' + t.id, box, btns, {
      wide: true,
      onOpen: (bg) => { const r = bg.querySelector('#prog'); if (r) r.oninput = () => { bg.querySelector('#pbar').style.width = r.value + '%'; bg.querySelector('#pval').textContent = r.value + '%'; }; },
      onOk: async (act, bg) => {
        const pr = bg.querySelector('#prog'), rs = bg.querySelector('#res');
        const base = { progress: pr ? +pr.value : t.progress, result: rs ? rs.value.trim() || null : t.result };
        if (act === 'edit' || act === 'del') return;
        if (act === 'accept') Object.assign(base, { status: '접수' });
        if (act === 'start') Object.assign(base, { status: '진행중', progress: Math.max(base.progress, 10) });
        if (act === 'save') Object.assign(base, { status: base.progress >= 100 ? '완료' : base.progress > 0 && (t.status === '요청' || t.status === '접수' || t.status === '보류') ? '진행중' : t.status });
        if (act === 'hold') Object.assign(base, { status: '보류' });
        if (act === 'done') { if (!(await HS.confirm('완료 처리할까요?<br>할당한 담당자(' + esc(HS.who(t.assigned_by) || t.requester || '') + ')에게 완료 콜사인 알림이 갑니다.'))) return false; Object.assign(base, { status: '완료', progress: 100 }); }
        if (act === 'reopen') Object.assign(base, { status: '진행중', progress: 90 });
        await HS.db.update('erp_tasks', { id: t.id }, base);
        HS.toast(act === 'done' ? '완료 처리했습니다 · 할당자에게 알림 전송' : '저장했습니다', 'ok');
      },
    });
    if (res === 'edit') return taskForm(t);
    if (res === 'del') { if (await HS.confirm('이 업무를 삭제할까요?')) { try { await HS.db.remove('erp_tasks', { id: t.id }); HS.toast('삭제했습니다'); } catch (e) { HS.err(e); } } }
    if (res) HS.route();
  }

  HS.view('tasks', {
    title: '업무협조 TO-DO', perm: 'tasks',
    async render(body, p, tools) {
      const mode = p.v || 'board'; const scopeAll = HS.me.role.scope === 'all';
      const team = p.team || (scopeAll ? '' : (HS.me.teams || [])[0] || '');
      const type = p.type || ''; const range = p.r || '30';
      const set = (o) => HS.go('tasks', Object.assign({ v: mode, team, type, r: range }, o));
      tools.appendChild(HS.seg([['board', '보드'], ['list', '목록'], ['mine', '내가 할당한 업무']], mode, (v) => set({ v })));
      const ts = HS.el('<select class="in"><option value="">전체 팀</option>' + HS.cache.teams.map((t) => '<option>' + esc(t.name) + '</option>').join('') + '<option value="미할당">미할당</option></select>'); ts.value = team; ts.onchange = () => set({ team: ts.value }); tools.appendChild(ts);
      const ty = HS.el('<select class="in hide-m"><option value="">전체 구분</option>' + TYPES.map((t) => '<option>' + t + '</option>').join('') + '</select>'); ty.value = type; ty.onchange = () => set({ type: ty.value }); tools.appendChild(ty);
      tools.appendChild(HS.seg([['30', '최근 30일'], ['all', '전체 기간']], range, (r) => set({ r })));
      if (HS.can('tasks', 'assign') || HS.can('tasks', 'create')) { const b = HS.el('<button class="btn p">+ 업무 할당</button>'); b.onclick = () => taskForm(); tools.appendChild(b); }
      const since = addDays(today(), -7);
      const [open, done] = await Promise.all([HS.db.list('erp_tasks', { neq: { status: '완료' }, order: ['due_date'] }), HS.db.list('erp_tasks', { eq: { status: '완료' }, gte: { completed_at: since }, order: ['completed_at', false] })]);
      let all = open.concat(done);
      if (team) all = all.filter((t) => (team === '미할당' ? !t.assigned_team : t.assigned_team === team));
      if (type) all = all.filter((t) => t.task_type === type);
      if (mode === 'mine') all = all.filter((t) => t.assigned_by === HS.me.id);
      if (range === '30') { const lim = addDays(today(), -30); all = all.filter((t) => !t.source || t.status === '접수' || t.status === '진행중' || (t.due_date || t.request_date || (t.created_at || '').slice(0, 10)) >= lim); }
      const late = all.filter((t) => t.status !== '완료' && t.due_date && t.due_date < today());
      body.innerHTML = '';
      const cnt = (s) => all.filter((t) => t.status === s).length;
      const avg = all.filter((t) => t.status !== '완료'); const ap = avg.length ? Math.round(avg.reduce((a, t) => a + (t.progress || 0), 0) / avg.length) : 0;
      body.appendChild(HS.el('<div class="kpis"><div class="card kpi"><div class="l">미접수 (요청)</div><div class="v ' + (cnt('요청') ? 'neg' : '') + '">' + cnt('요청') + '</div><div class="s">할당받은 팀이 접수해야 함</div></div><div class="card kpi"><div class="l">접수 · 진행중</div><div class="v">' + (cnt('접수') + cnt('진행중')) + '</div><div class="s">평균 진행률 ' + ap + '%</div></div><div class="card kpi"><div class="l">기한 지남</div><div class="v ' + (late.length ? 'neg' : '') + '">' + late.length + '</div><div class="s">완료 기한이 오늘 이전</div></div><div class="card kpi"><div class="l">최근 7일 완료</div><div class="v pos">' + cnt('완료') + '</div><div class="s">완료 시 할당자에게 콜사인 알림</div></div></div>'));
      const card = (t) => { const lt = t.status !== '완료' && t.due_date && t.due_date < today(); return '<div class="tk ' + (lt ? 'late' : '') + '" data-id="' + t.id + '"><div style="display:flex;gap:4px;flex-wrap:wrap">' + typeTag(t.task_type) + (t.brand ? '<span class="tag">' + esc(t.brand) + '</span>' : '') + (t.priority === '긴급' ? '<span class="tag r">긴급</span>' : '') + '</div><b>' + esc(t.title) + '</b>' + (t.status !== '요청' && t.status !== '완료' ? '<div class="bar"><i style="width:' + (t.progress || 0) + '%"></i></div>' : '') + '<div class="m"><span>' + esc(t.assigned_team || '미할당') + (t.assignee ? ' · ' + esc(HS.who(t.assignee)) : '') + '</span><span class="' + (lt ? 'neg' : '') + '">' + (t.status === '완료' ? '완료 ' + (t.completed_at || '').slice(5, 10).replace('-', '/') : t.due_date ? '기한 ' + t.due_date.slice(5).replace('-', '/') : '') + (t.status !== '요청' && t.status !== '완료' ? ' · ' + (t.progress || 0) + '%' : '') + '</span></div><div class="m"><span>할당 ' + esc(HS.who(t.assigned_by) || t.requester || '-') + '</span></div></div>'; };
      if (mode === 'list') {
        const wrap = HS.el('<div class="card"><div class="tw"><table><tr><th>#</th><th>상태</th><th>구분</th><th>브랜드</th><th>업무</th><th>할당 팀</th><th>할당자</th><th>기한</th><th style="width:120px">진행률</th></tr>' + (all.length ? all.map((t) => '<tr class="click" data-id="' + t.id + '"><td>' + t.id + '</td><td>' + stTag(t.status) + '</td><td>' + typeTag(t.task_type) + '</td><td>' + esc(t.brand || '') + '</td><td class="wrap">' + esc(t.title) + '</td><td>' + esc(t.assigned_team || '-') + '</td><td>' + esc(HS.who(t.assigned_by) || t.requester || '') + '</td><td class="' + (t.status !== '완료' && t.due_date && t.due_date < today() ? 'neg' : '') + '">' + esc(t.due_date || '') + '</td><td><div class="bar"><i style="width:' + (t.progress || 0) + '%"></i></div></td></tr>').join('') : '<tr><td colspan="9" class="empty">업무가 없습니다</td></tr>') + '</table></div><div style="margin-top:10px"><button class="btn sm" id="xl">엑셀 내려받기</button></div></div>');
        body.appendChild(wrap);
        wrap.querySelector('#xl').onclick = () => HS.download('업무협조_' + today() + '.xlsx', all.map((t) => ({ 번호: t.id, 상태: t.status, 구분: t.task_type, 브랜드: t.brand, 업무: t.title, 내용: t.detail, 할당팀: t.assigned_team, 할당자: HS.who(t.assigned_by) || t.requester, 기한: t.due_date, 진행률: t.progress, 결과: t.result, 완료시각: t.completed_at })), '업무협조');
      } else {
        const kb = HS.el('<div class="kanban">' + STATUS.map(([s, l]) => { const xs = all.filter((t) => t.status === s); return '<div class="kan"><h4>' + l + ' <span>' + xs.length + '</span></h4>' + (xs.length ? xs.map(card).join('') : '<div class="mute" style="font-size:11.5px;padding:8px">없음</div>') + '</div>'; }).join('') + '</div>');
        body.appendChild(kb);
      }
      body.querySelectorAll('[data-id]').forEach((x) => (x.onclick = () => taskDetail(x.dataset.id)));
      if (p.id) { const id = p.id; history.replaceState(null, '', location.hash.replace(/([?&])id=\d+&?/, '$1').replace(/[?&]$/, '')); taskDetail(id); }
      HS.live(['erp_tasks'], () => { if (HS.cur === 'tasks' && !document.querySelector('.modal-bg')) HS.route(); });
    },
  });

  // ================= 반품 관리 =================
  const REC_KINDS = [['event_return', '행사·선반품'], ['close_return', '폐점·홀딩해체'], ['online_return', '온라인 반품대장'], ['reship', '재반송'], ['defect', '불량 회수 상품'], ['store_defect', '매장반품 불량상품']];
  HS.REC_KINDS = REC_KINDS;
  // 반품 관리 화면은 views-returns.js — 여기는 박스 수불 · 기타 대장(행사·폐점·온라인 등)
  HS.returnsLegacy = ({
    title: '반품 관리', perm: 'returns',
    async render(body, p, tools) {
      const tab = p.k || 'box'; const mo = p.m || today().slice(0, 7);
      const [m1, m2] = monthRange(mo + '-01');
      body.innerHTML = '';
      if (tab === 'box') {
        const rows = await HS.db.list('erp_returns_box', { gte: { rec_date: m1 }, lte: { rec_date: m2 }, order: ['rec_date'] });
        const days = []; for (let x = m1; x <= m2; x = addDays(x, 1)) { const w = new Date(x + 'T00:00:00').getDay(); if ((w > 0 && w < 6) || rows.some((r) => r.rec_date === x)) days.push(x); }
        const tot = rows.reduce((a, r) => { ['top', 'lotte', 'haengnang', 'etc', 'hanger', 'done', 'confirmed_pcs'].forEach((k) => (a[k] = (a[k] || 0) + (+r[k] || 0))); return a; }, {});
        const all = (tot.top || 0) + (tot.lotte || 0) + (tot.haengnang || 0) + (tot.etc || 0);
        body.appendChild(HS.el('<div class="kpis"><div class="card kpi"><div class="l">' + mo.slice(5) + '월 반품 도착 박스</div><div class="v">' + fmt(all) + '</div><div class="s">탑 ' + fmt(tot.top) + ' · 롯데 ' + fmt(tot.lotte) + ' · 행낭 ' + fmt(tot.haengnang) + ' · 기타 ' + fmt(tot.etc) + '</div></div><div class="card kpi"><div class="l">반품 완료 박스</div><div class="v">' + fmt(tot.done) + '</div><div class="s">진행률 ' + (all - (tot.hanger || 0) > 0 ? (((tot.done || 0) / (all - (tot.hanger || 0))) * 100).toFixed(1) + '%' : '-') + ' · 옷걸이·기타 ' + fmt(tot.hanger) + '</div></div><div class="card kpi"><div class="l">확정 수량</div><div class="v">' + fmt(tot.confirmed_pcs) + '<span style="font-size:13px;font-weight:400"> PCS</span></div><div class="s">' + rows.length + '일 입력</div></div></div>'));
        const locks = await HS.db.list('erp_locks', { eq: { module: 'returns' }, gte: { lock_date: m1 }, lte: { lock_date: m2 } });
        const editable = (HS.can('returns', 'create') || HS.can('returns', 'edit'));
        const g = HS.grid({
          keyLabel: '반품일', editable, total: true,
          rows: days.map((x) => ({ key: x, label: x.slice(5) + ' (' + HS.dow(x) + ')' + (locks.some((l) => l.lock_date === x && l.locked) ? ' 🔒' : ''), data: Object.assign({}, rows.find((r) => r.rec_date === x) || {}) })),
          cols: [{ k: 'top', l: '탑코리아', t: 'num' }, { k: 'lotte', l: '롯데', t: 'num' }, { k: 'haengnang', l: '행낭', t: 'num' }, { k: 'etc', l: '기타', t: 'num' }, { k: 'total', l: '총합계', t: 'auto', f: (x) => (+x.top || 0) + (+x.lotte || 0) + (+x.haengnang || 0) + (+x.etc || 0) }, { k: 'hanger', l: '옷걸이·기타박스', t: 'num' }, { k: 'done', l: '반품 완료', t: 'num' }, { k: 'pending', l: '미작업', t: 'auto', f: (x) => Math.max(0, (+x.top || 0) + (+x.lotte || 0) + (+x.haengnang || 0) + (+x.etc || 0) - (+x.hanger || 0) - (+x.done || 0)), cls: (v) => (v ? 'neg' : '') }, { k: 'rate', l: '진행률', t: 'auto', noSum: true, f: (x) => { const b = (+x.top || 0) + (+x.lotte || 0) + (+x.haengnang || 0) + (+x.etc || 0) - (+x.hanger || 0); return b > 0 ? (+x.done || 0) / b : null; }, show: (v) => (v == null ? '-' : (v * 100).toFixed(1) + '%') }, { k: 'confirmed_pcs', l: '확정 PCS', t: 'num' }],
        });
        const c = HS.el('<div class="card"><h3>일별 반품 박스 수불 <small>운송사별 박스 입력 → 미작업·진행률 자동 · 분모 0이면 "-" 표시</small></h3></div>'); c.appendChild(g.el);
        if (editable) { const b = HS.el('<button class="btn p" style="margin-top:10px">저장</button>'); b.onclick = async () => { try { const ch = g.changed(); await HS.db.upsert('erp_returns_box', ch.map((r) => ({ rec_date: r.key, top: +r.data.top || 0, lotte: +r.data.lotte || 0, haengnang: +r.data.haengnang || 0, etc: +r.data.etc || 0, hanger: +r.data.hanger || 0, done: +r.data.done || 0, pending: +r.data.pending || 0, confirmed_pcs: +r.data.confirmed_pcs || 0 }))); HS.toast(ch.length + '일 저장', 'ok'); HS.route(); } catch (e) { HS.err(e); } }; c.appendChild(b); }
        body.appendChild(c);
        HS.live(['erp_returns_box'], () => { if (HS.cur === 'returns' && !g.changed().length) HS.route(); });
        return;
      }
      if (tab === 'ledger') {
        const rows = await HS.db.list('erp_daily_records', { eq: { section: 'return_ledger' }, gte: { rec_date: m1 }, lte: { rec_date: m2 }, order: ['rec_date'] });
        const brands = HS.bsort([...new Set(rows.flatMap((r) => Object.keys(r.data.done_by_brand || {})))]); // 브랜드 차례 = 기준정보 › 브랜드 순번
        body.appendChild(HS.el('<div class="card"><h3>일별 반품 관리 대장 <small>도착 운송사 BOX · 브랜드별 당일 반품 완료 (엑셀 일괄 등록으로 반영)</small></h3><div class="tw"><table><tr><th>도착일</th><th class="n">탑</th><th class="n">롯데</th><th class="n">행낭</th><th class="n">기타</th><th class="n">합계</th><th class="n">완료</th><th class="n">대기</th>' + brands.map((b) => '<th class="n">' + esc(b) + '</th>').join('') + '<th class="n">전표수</th></tr>' +
          (rows.length ? rows.map((r) => { const x = r.data; return '<tr><td>' + r.rec_date.slice(5) + '</td><td class="n">' + fmt(x.top) + '</td><td class="n">' + fmt(x.lotte) + '</td><td class="n">' + fmt(x.haengnang) + '</td><td class="n">' + fmt(x.etc) + '</td><td class="n">' + fmt(x.total) + '</td><td class="n">' + fmt(x.done_box) + '</td><td class="n ' + (x.wait_box ? 'neg' : '') + '">' + fmt(x.wait_box) + '</td>' + brands.map((b) => '<td class="n">' + fmt((x.done_by_brand || {})[b] || 0) + '</td>').join('') + '<td class="n">' + fmt(x.slips) + '</td></tr>'; }).join('') : '<tr><td colspan="20" class="empty">이 달 자료가 없습니다. 엑셀 일괄 등록에서 반품 관리 대장 파일을 올리세요.</td></tr>') + '</table></div></div>'));
        return;
      }
      // 대장(기록) 목록
      const kname = (REC_KINDS.find((k) => k[0] === tab) || [tab, tab])[1];
      const q = p.q || ''; const allMonths = p.all === '1';
      const rows = await HS.db.list('erp_records', allMonths ? { eq: { kind: tab }, order: ['rec_date', false] } : { eq: { kind: tab }, gte: { rec_date: m1 }, lte: { rec_date: m2 }, order: ['rec_date', false] });
      const fl = rows.filter((r) => !q || JSON.stringify(r).indexOf(q) >= 0);
      const cols = [...new Set(fl.slice(0, 200).flatMap((r) => Object.keys(r.data || {})))].slice(0, 14);
      const c = HS.el('<div class="card"><h3>' + esc(kname) + ' <small>' + (allMonths ? '전체 기간' : mo) + ' · ' + fl.length + '건</small><span class="sp"></span><input class="in" id="q" placeholder="검색 (브랜드·매장·품번)" style="width:200px"><label class="mute" style="font-size:12px"><input type="checkbox" id="allm"> 전체 기간</label>' + (HS.can('returns', 'create') ? '<button class="btn sm p" id="add">+ 등록</button>' : '') + '<button class="btn sm" id="xl">엑셀</button></h3><div class="tw"><table><tr><th>일자</th><th>브랜드</th><th>내용</th><th class="n">수량</th><th>상태</th>' + cols.map((k) => '<th>' + esc(k) + '</th>').join('') + '</tr>' +
        (fl.length ? fl.slice(0, 500).map((r) => '<tr class="click" data-id="' + r.id + '"><td>' + esc(r.rec_date || '') + '</td><td>' + esc(r.brand || '') + '</td><td class="wrap">' + esc(r.title || '') + '</td><td class="n">' + fmt(r.qty) + '</td><td>' + (r.state ? '<span class="tag ' + (/완료/.test(r.state) ? 'g' : 'y') + '">' + esc(r.state) + '</span>' : '') + '</td>' + cols.map((k) => '<td>' + esc(fmtCell((r.data || {})[k])) + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="20" class="empty">자료가 없습니다</td></tr>') + '</table></div>' + (fl.length > 500 ? '<div class="mute">500건까지 표시 · 엑셀로 전체 확인</div>' : '') + '</div>');
      body.appendChild(c);
      const qi = c.querySelector('#q'); qi.value = q; qi.onchange = () => HS.go('returns', { k: tab, m: mo, q: qi.value, all: allMonths ? '1' : '' });
      const am = c.querySelector('#allm'); am.checked = allMonths; am.onchange = () => HS.go('returns', { k: tab, m: mo, q, all: am.checked ? '1' : '' });
      c.querySelector('#xl').onclick = () => HS.download(kname + '_' + mo + '.xlsx', fl.map((r) => Object.assign({ 일자: r.rec_date, 브랜드: r.brand, 내용: r.title, 수량: r.qty, 상태: r.state }, r.data || {})), kname.slice(0, 30));
      const recForm = async (r) => {
        r = r || { kind: tab, rec_date: today(), data: {} };
        const f = HS.el('<div class="form"><label class="f">일자<input class="in" type="date" id="r1"></label><label class="f">브랜드<select class="in" id="r2"><option value=""></option>' + HS.cache.brands.map((b) => '<option>' + esc(b.name) + '</option>').join('') + '</select></label><label class="f">수량<input class="in" id="r4" inputmode="decimal"></label><label class="f">상태<input class="in" id="r5" placeholder="예: 반품완료, 이월팀 인계완료"></label><label class="f wide">내용<input class="in" id="r3"></label><label class="f wide">메모<textarea class="in" id="r6"></textarea></label></div>');
        f.querySelector('#r1').value = r.rec_date || ''; f.querySelector('#r2').value = r.brand || ''; f.querySelector('#r3').value = r.title || ''; f.querySelector('#r4').value = r.qty == null ? '' : r.qty; f.querySelector('#r5').value = r.state || ''; f.querySelector('#r6').value = (r.data && r.data.메모) || '';
        const extra = Object.entries(r.data || {}).filter(([k]) => k !== '메모');
        if (extra.length) f.appendChild(HS.el('<div class="wide tw"><table>' + extra.map(([k, v]) => '<tr><td class="mute">' + esc(k) + '</td><td class="wrap">' + esc(fmtCell(v)) + '</td></tr>').join('') + '</table></div>'));
        const btn = [['닫기', null]]; if (HS.can('returns', r.id ? 'edit' : 'create')) btn.push(['저장', 'save', 'p']); if (r.id && HS.can('returns', 'delete')) btn.unshift(['삭제', 'del', 'r']);
        const v = await HS.modal(kname + (r.id ? ' 수정' : ' 등록'), f, btn, { onOk: async (a) => { if (a !== 'save') return; const row = { kind: tab, rec_date: f.querySelector('#r1').value || null, brand: f.querySelector('#r2').value || null, title: f.querySelector('#r3').value.trim() || null, qty: f.querySelector('#r4').value ? +f.querySelector('#r4').value : null, state: f.querySelector('#r5').value.trim() || null, data: Object.assign({}, r.data, { 메모: f.querySelector('#r6').value.trim() || undefined }) }; if (r.id) await HS.db.update('erp_records', { id: r.id }, row); else { row.source_key = 'M:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await HS.db.upsert('erp_records', [row]); } HS.toast('저장했습니다', 'ok'); HS.route(); } });
        if (v === 'del' && (await HS.confirm('삭제할까요?'))) { await HS.db.remove('erp_records', { id: r.id }).catch(HS.err); HS.route(); }
      };
      const add = c.querySelector('#add'); if (add) add.onclick = () => recForm();
      c.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => recForm(fl.find((r) => r.id === +tr.dataset.id))));
    },
  });
  function fmtCell(v) { if (v == null) return ''; if (typeof v === 'number' && v > 30000 && v < 60000) return HSParsers.toDate(v) || v; if (typeof v === 'object') return JSON.stringify(v); return String(v); }

  // ================= 입고대행 정산 =================
  const DEFAULT_PRICES = [['입고BOX', 'BOX', 1000, '1~30BOX 이하 30,000원'], ['배분오류(수량오류)', 'PCS', 3500, '매장별 확인 후 과부족 수정'], ['입고바코드 인식오류', 'BOX', 2000, ''], ['입고바코드 수정', 'BOX', 2000, ''], ['입고바코드 미부착', 'BOX', 2000, ''], ['RFID 중복', 'PCS', 3500, ''], ['RFID 미인식', 'PCS', 3500, ''], ['금사/은사', 'BOX', 1000, 'RFID 인식률에 따라 협의'], ['가격텍 교체', '시간', 18750, '실비(인건비 150,000)'], ['검사 대행', 'ST', 15000, ''], ['인건비', '일당', 150000, ''], ['타브랜드 하역비', 'BOX', 1000, '']];
  HS.view('settlement', {
    title: '입고대행 정산', perm: 'settlement',
    async render(body, p, tools) {
      const mo = p.m || today().slice(0, 7);
      const mi = HS.el('<input class="in" type="month">'); mi.value = mo; mi.onchange = () => HS.go('settlement', { m: mi.value }); tools.appendChild(mi);
      if (HS.can('settlement', 'create')) { const b = HS.el('<button class="btn p">+ 입고 등록</button>'); b.onclick = () => form(); tools.appendChild(b); }
      const [m1, m2] = monthRange(mo + '-01');
      // 정산 기준: 입고 완료일(수불 완료) — 기존 정산서와 동일. 미완료 건은 별도 표시
      const [done, pend, st] = await Promise.all([HS.db.list('erp_settlement', { gte: { done_date: m1 }, lte: { done_date: m2 }, order: ['done_date'] }), HS.db.list('erp_settlement', { neq: { status: '완료' }, lte: { in_date: m2 }, order: ['in_date'] }), HS.db.list('erp_settings', { eq: { key: 'inbound_prices' } })]);
      const billed = done.filter((r) => r.status === '완료');
      const rows = billed.concat(pend.filter((r) => !billed.some((b) => b.id === r.id)));
      const prices = (st[0] && st[0].value && st[0].value.rows) || DEFAULT_PRICES.map(([name, unit, price, memo]) => ({ name, unit, price, memo }));
      // 일자·고객사별 묶음: 박스×1,000원, 30박스 이하 30,000원
      const grp = {}; billed.forEach((r) => { const k = r.done_date + '|' + r.client_code; const g = grp[k] || (grp[k] = { date: r.done_date, code: r.client_code, name: r.client_name, boxes: 0, err: 0, n: 0 }); g.boxes += +r.box_total || 0; g.err += +r.err_amount || 0; g.n++; });
      Object.values(grp).forEach((g) => { g.base = Math.max(30000, g.boxes * 1000); g.total = g.base + g.err; });
      const byClient = {}; Object.values(grp).forEach((g) => { const c = byClient[g.code] || (byClient[g.code] = { code: g.code, name: g.name, days: 0, boxes: 0, base: 0, err: 0, total: 0 }); c.days++; c.boxes += g.boxes; c.base += g.base; c.err += g.err; c.total += g.total; });
      const total = Object.values(byClient).reduce((a, c) => a + c.total, 0);
      body.innerHTML = '';
      body.appendChild(HS.el('<div class="kpis"><div class="card kpi"><div class="l">' + mo + ' 정산 합계</div><div class="v">' + fmt(total) + '</div><div class="s">VAT 별도 · 세금계산서 ' + Object.keys(byClient).length + '개 업체</div></div><div class="card kpi"><div class="l">확정 박스</div><div class="v">' + fmt(Object.values(byClient).reduce((a, c) => a + c.boxes, 0)) + '</div><div class="s">입고 ' + Object.keys(grp).length + '건 (일자·고객사 기준)</div></div><div class="card kpi"><div class="l">미완료 수불</div><div class="v ' + (rows.some((r) => r.status !== '완료') ? 'neg' : '') + '">' + rows.filter((r) => r.status !== '완료').length + '</div><div class="s">수불 완료 전 품번</div></div></div>'));
      const row = HS.el('<div class="row"></div>'); body.appendChild(row);
      const c1 = HS.el('<div class="card" style="flex:1;min-width:320px"><h3>업체별 세금계산서 발행 금액 <small>입고 완료일·고객사별 박스×1,000원 (30박스 이하 30,000원) + 오류 추가금 · 수불 완료 건만</small></h3><div class="tw"><table><tr><th>업체코드</th><th>업체명</th><th class="n">입고일수</th><th class="n">박스</th><th class="n">기본</th><th class="n">오류 추가</th><th class="n">합계</th></tr>' + (Object.values(byClient).length ? Object.values(byClient).sort((a, b) => b.total - a.total).map((c) => '<tr><td>' + esc(c.code) + '</td><td>' + esc(c.name) + '</td><td class="n">' + c.days + '</td><td class="n">' + fmt(c.boxes) + '</td><td class="n">' + fmt(c.base) + '</td><td class="n">' + fmt(c.err) + '</td><td class="n"><b>' + fmt(c.total) + '</b></td></tr>').join('') + '<tr class="tot"><td colspan="6">합계</td><td class="n">' + fmt(total) + '</td></tr>' : '<tr><td colspan="7" class="empty">이 달 정산 자료가 없습니다</td></tr>') + '</table></div><div style="margin-top:10px"><button class="btn sm" id="tax">세금계산서 목록 엑셀</button> <button class="btn sm" id="det">상세 엑셀</button></div></div>');
      row.appendChild(c1);
      c1.querySelector('#tax').onclick = () => HS.download('세금계산서_' + mo + '.xlsx', Object.values(byClient).map((c, i) => ({ 번호: i + 1, 업체코드: c.code, 업체명: c.name, 공급가액: c.total, 부가세: Math.round(c.total * 0.1), 합계: Math.round(c.total * 1.1) })), mo);
      c1.querySelector('#det').onclick = () => HS.download('입고대행정산_' + mo + '.xlsx', rows.map((r) => ({ 입고일: r.in_date, 고객사코드: r.client_code, 고객사명: r.client_name, 품번: r.style, PCS: r.pcs, 아소트BOX: r.box_assort, 솔리드BOX: r.box_solid, 확정BOX: r.box_total, 오류금액: r.err_amount, 수불: r.status, 완료일: r.done_date, 비고: r.note })), '정산');
      const c2 = HS.el('<div class="card" style="width:420px;max-width:100%"><h3>단가표 <small>VAT 별도' + (HS.can('settings', 'edit') ? ' · 설정에서 수정' : '') + '</small></h3><div class="tw"><table><tr><th>항목</th><th>단위</th><th class="n">금액</th><th>비고</th></tr>' + prices.map((x) => '<tr><td>' + esc(x.name) + '</td><td>' + esc(x.unit) + '</td><td class="n">' + fmt(x.price) + '</td><td class="mute">' + esc(x.memo || '') + '</td></tr>').join('') + '</table></div></div>');
      row.appendChild(c2);
      const c3 = HS.el('<div class="card"><h3>입고 상세 <small>' + rows.length + '건 · 행을 누르면 수정</small></h3><div class="tw"><table><tr><th>입고일</th><th>고객사</th><th>품번</th><th class="n">PCS</th><th class="n">아소트</th><th class="n">솔리드</th><th class="n">확정 BOX</th><th class="n">오류 추가</th><th>수불</th><th>완료일</th></tr>' + (rows.length ? rows.slice(0, 800).map((r) => '<tr class="click" data-id="' + r.id + '"><td>' + esc(r.in_date) + '</td><td>' + esc(r.client_name || r.client_code) + '</td><td>' + esc(r.style || '') + '</td><td class="n">' + fmt(r.pcs) + '</td><td class="n">' + fmt(r.box_assort) + '</td><td class="n">' + fmt(r.box_solid) + '</td><td class="n">' + fmt(r.box_total) + '</td><td class="n">' + fmt(r.err_amount) + '</td><td><span class="tag ' + (r.status === '완료' ? 'g' : 'y') + '">' + esc(r.status || '대기') + '</span></td><td>' + esc(r.done_date || '') + '</td></tr>').join('') : '<tr><td colspan="10" class="empty">자료 없음</td></tr>') + '</table></div></div>');
      body.appendChild(c3);
      c3.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => form(rows.find((r) => r.id === +tr.dataset.id))));
      async function form(r) {
        r = r || { in_date: today(), status: '대기' };
        const f = HS.el('<div class="form"><label class="f">입고일<input class="in" type="date" id="s1"></label><label class="f">고객사 코드<input class="in" id="s2"></label><label class="f">고객사명<input class="in" id="s3"></label><label class="f">품번<input class="in" id="s4"></label><label class="f">PCS<input class="in" id="s5" inputmode="decimal"></label><label class="f">아소트 BOX<input class="in" id="s6" inputmode="decimal"></label><label class="f">솔리드 BOX<input class="in" id="s7" inputmode="decimal"></label><label class="f">오류 항목<select class="in" id="s8"><option value="">없음</option>' + prices.slice(1).map((x, i) => '<option value="' + (i + 1) + '">' + esc(x.name) + ' (' + fmt(x.price) + '/' + esc(x.unit) + ')</option>').join('') + '</select></label><label class="f">오류 수량<input class="in" id="s9" inputmode="decimal"></label><label class="f">오류 추가금<input class="in" id="s10" inputmode="decimal"></label><label class="f">수불<select class="in" id="s11"><option>대기</option><option>완료</option></select></label><label class="f">완료일<input class="in" type="date" id="s12"></label><label class="f wide">비고<input class="in" id="s13"></label></div>');
        const v = (i, x) => { const e = f.querySelector('#s' + i); if (x !== undefined) e.value = x == null ? '' : x; return e.value; };
        v(1, r.in_date); v(2, r.client_code); v(3, r.client_name); v(4, r.style); v(5, r.pcs); v(6, r.box_assort); v(7, r.box_solid); v(10, r.err_amount); v(11, r.status || '대기'); v(12, r.done_date); v(13, r.note);
        const calc = () => { const it = prices[+v(8)]; if (it) v(10, (+v(9) || 0) * it.price); };
        f.querySelector('#s8').onchange = calc; f.querySelector('#s9').oninput = calc;
        const btn = [['닫기', null]]; if (HS.can('settlement', r.id ? 'edit' : 'create')) btn.push(['저장', 'save', 'p']); if (r.id && HS.can('settlement', 'delete')) btn.unshift(['삭제', 'del', 'r']);
        const res = await HS.modal(r.id ? '입고 정산 수정' : '입고 등록', f, btn, { wide: true, onOk: async (a) => { if (a !== 'save') return; const row = { in_date: v(1), client_code: v(2).trim(), client_name: v(3).trim(), style: v(4).trim(), pcs: +v(5) || 0, box_assort: +v(6) || 0, box_solid: +v(7) || 0, box_total: (+v(6) || 0) + (+v(7) || 0), err_amount: +v(10) || 0, status: v(11), done_date: v(12) || null, note: v(13) || null }; row.base_amount = row.box_total * 1000; row.final_amount = row.base_amount + row.err_amount; if (!row.in_date || !row.client_code) throw new Error('입고일·고객사 코드는 필수'); if (r.id) await HS.db.update('erp_settlement', { id: r.id }, row); else { row.source_key = 'M:' + Date.now().toString(36); await HS.db.upsert('erp_settlement', [row]); } HS.toast('저장했습니다', 'ok'); HS.route(); } });
        if (res === 'del' && (await HS.confirm('삭제할까요?'))) { await HS.db.remove('erp_settlement', { id: r.id }).catch(HS.err); HS.route(); }
      }
    },
  });
  HS.DEFAULT_PRICES = DEFAULT_PRICES;

  // ================= 안성센터 연동 =================
  async function ansCfg() { const s = await HS.db.list('erp_settings', { eq: { key: 'anseong' } }); return (s[0] && s[0].value) || { mode: 'same_project', datasets: [] }; }
  async function fetchDataset(ds, from, to) {
    const q = { limit: ds.limit || 5000 };
    if (ds.date_col && from) { q.gte = { [ds.date_col]: from }; q.lte = { [ds.date_col]: to + (ds.date_is_ts ? 'T23:59:59' : '') }; }
    if (ds.filter_col && ds.filter_val) q.eq = { [ds.filter_col]: ds.filter_val };
    if (ds.date_col) q.order = [ds.date_col, false];
    return HS.db.raw(ds.table, q);
  }
  HS.anseongSummary = async (el, atEl) => {
    if (!HS.can('anseong', 'view')) return;
    try {
      const cfg = await ansCfg(); const list = (cfg.datasets || []).filter((d) => d.dash);
      if (!list.length) { el.innerHTML = '<div class="mute" style="font-size:12px">안성 프로그램 API 항목이 아직 지정되지 않았습니다. <a href="#/anseong">안성센터 연동</a>에서 테이블을 고르세요.</div>'; return; }
      const t = today(); const out = [];
      for (const ds of list) { const rows = await fetchDataset(ds, ds.date_col ? t : null, t); const s = (ds.sum_cols || []).map((c) => [c, rows.reduce((a, r) => a + (+r[c] || 0), 0)]); out.push('<tr><td>' + esc(ds.label || ds.table) + '</td><td class="n">' + fmt(rows.length) + '건</td><td class="n">' + s.map(([c, v]) => esc(c) + ' ' + fmt(v)).join(' · ') + '</td></tr>'); }
      el.innerHTML = '<div class="tw"><table><tr><th>안성 프로그램 (오늘)</th><th class="n">건수</th><th class="n">합계</th></tr>' + out.join('') + '</table></div>';
      if (atEl) atEl.textContent = '실시간 조회 ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { el.innerHTML = '<div class="mute" style="font-size:12px">안성 API 조회 실패: ' + esc(e.message) + '</div>'; }
  };
})();
