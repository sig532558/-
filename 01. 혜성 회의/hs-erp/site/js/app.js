/* 월간회의 (혜성물류) — 앱 코어 (라우터 · 레이아웃 · 권한 · 알림) */
(function () {
  'use strict';
  const HS = (window.HS = { views: {}, cache: {} });

  // ---------- 유틸 ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => ymd(new Date());
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
  const dow = (s) => '일월화수목금토'[new Date(s + 'T00:00:00').getDay()];
  const fmt = (n, dig) => (n == null || n === '' || isNaN(n) ? '-' : Number(n).toLocaleString('ko-KR', { maximumFractionDigits: dig == null ? 0 : dig }));
  const won = (n) => { if (n == null || isNaN(n)) return '-'; const a = Math.abs(n), s = n < 0 ? '-' : ''; if (a >= 1e8) return s + Math.floor(a / 1e8) + '억 ' + fmt(Math.round((a % 1e8) / 1e4)) + '만'; if (a >= 1e4) return s + fmt(Math.round(a / 1e4)) + '만'; return s + fmt(a); };
  const sign = (n) => (n > 0 ? '+' : '') + fmt(n);
  const pct = (a, b) => (b ? (a / b) * 100 : null);
  const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
  // 월 주차 (월요일 시작 · 그 주의 목요일이 있는 달) — 원가관리 엑셀과 같음: 12/29~1/2 = 1월1주차, 8/31~9/4 = 9월1주차
  function weekInfo(s) {
    const d = new Date(s + 'T00:00:00'); const mon = new Date(d); mon.setDate(d.getDate() - (d.getDay() + 6) % 7); const thu = new Date(mon); thu.setDate(mon.getDate() + 3);
    const y = thu.getFullYear(), m = thu.getMonth() + 1, k = Math.floor((thu.getDate() - 1) / 7) + 1; return { y, m, k, key: y + '-' + String(m).padStart(2, '0') + '-' + k, label: m + '월' + k + '주차' };
  }
  function weekLabel(s) { return weekInfo(s).label; }
  const monthRange = (s) => { const d = new Date(s + 'T00:00:00'); const a = new Date(d.getFullYear(), d.getMonth(), 1), b = new Date(d.getFullYear(), d.getMonth() + 1, 0); return [ymd(a), ymd(b)]; };
  const weekRange = (s) => { const d = new Date(s + 'T00:00:00'); const o = (d.getDay() + 6) % 7; const a = new Date(d); a.setDate(d.getDate() - o); const b = new Date(a); b.setDate(a.getDate() + 6); return [ymd(a), ymd(b)]; };
  Object.assign(HS, { esc, pad, ymd, today, addDays, dow, fmt, won, sign, pct, cls, weekLabel, weekInfo, monthRange, weekRange });

  // ---------- 권한 ----------
  HS.can = (m, a) => !!(HS.me && HS.me.active && HS.me.role && HS.me.role.perms && HS.me.role.perms[m] && HS.me.role.perms[m][a || 'view']);
  HS.teamOk = (t) => !!(HS.me && HS.me.role && (HS.me.role.scope === 'all' || (HS.me.teams || []).indexOf(t) >= 0));
  HS.who = (id) => (id && HS.cache.peopleMap && HS.cache.peopleMap[id] ? HS.cache.peopleMap[id].name : '');
  HS.myTeams = () => (HS.me.role.scope === 'all' ? HS.cache.teams.map((t) => t.name) : (HS.me.teams || []).slice());
  HS.MODULES = [
    ['dashboard', '통합 대시보드', ['view']], ['worklog', '관리자 업무일지', ['view', 'create', 'edit', 'delete', 'close', 'unlock']],
    ['daily', '일일 마감보고', ['view', 'create', 'edit', 'delete', 'close', 'unlock']], ['tasks', '업무협조 TO-DO', ['view', 'create', 'edit', 'delete', 'assign', 'progress']],
    ['returns', '반품 현황', ['view', 'create', 'edit', 'delete', 'close', 'unlock']], ['settlement', '입고대행 정산', ['view', 'create', 'edit', 'delete']],
    ['anseong', '안성센터 연동', ['view', 'edit']], ['upload', '엑셀 일괄 등록', ['view', 'create']], ['users', '사용자·등급 관리', ['view', 'edit', 'delete']],
    ['settings', '기준정보 설정', ['view', 'edit']], ['requests', '개선 요청', ['view', 'create', 'edit']],
    ['orders', '아침 출고지시 취합', ['view', 'create', 'edit', 'delete', 'close', 'unlock']], ['kpi', '팀별 KPI · 원가', ['view', 'create', 'edit', 'delete', 'close', 'unlock']], ['newprod', '신상품 입출고 현황', ['view', 'create', 'edit']], ['count', '재고 실사', ['view', 'create', 'upload', 'edit', 'delete', 'close']], ['season', '시즌 정리 · 선지시', ['view', 'create', 'upload', 'edit', 'delete']],
    ['iwol', '이월팀 반품 정리 · 선지시 출고', ['view', 'create']], ['tlmeet', '팀장 자체 회의록', ['view', 'create']],
    ['meeting', '월간 회의', ['view', 'edit']], ['volume', '물동량 (월마감)', ['view', 'create']], ['supply', '소모품 · 부자재 발주', ['view', 'create', 'edit', 'delete']], ['notice', '공지 사항', ['view', 'create', 'edit', 'delete']], ['csdata', '전산자료 (재고 · 출고지시)', ['view', 'create']],
  ];
  HS.ACTIONS = { view: '보기', create: '등록', edit: '수정', delete: '삭제', close: '마감확정', unlock: '마감해제', assign: '업무할당', progress: '진행처리', upload: '자료 올리기' };

  // ---------- UI 도우미 ----------
  HS.toast = (msg, kind) => { const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg; document.getElementById('toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3000); };
  // 로그인이 풀려서 난 오류는 영어 그대로 보여 주지 말고 알아듣게 (2026-11-19)
  HS.err = (e) => { console.error(e); const lost = HS.db && HS.db.lostMsg && HS.db.lostMsg(e); HS.toast(lost || (e && e.message) || String(e), 'err'); if (lost && HS.db.checkSession) HS.db.checkSession(); };
  HS.modal = (title, body, buttons, opt) => new Promise((resolve) => {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal ' + ((opt && opt.wide) ? 'wide' : '') + '">' + (title ? '<div class="mh"><b>' + esc(title) + '</b><button class="x" data-x>×</button></div>' : '') + '<div class="mb"></div><div class="mf"></div></div>';
    const mb = bg.querySelector('.mb'); if (typeof body === 'string') mb.innerHTML = body; else if (body) mb.appendChild(body);
    const mf = bg.querySelector('.mf');
    (buttons || [['닫기', null]]).forEach(([label, val, c]) => { const b = document.createElement('button'); b.className = 'btn ' + (c || ''); b.textContent = label; b.onclick = async () => { if (opt && opt.onOk && val) { try { const r = await opt.onOk(val, bg); if (r === false) return; } catch (e) { HS.err(e); return; } } close(val); }; mf.appendChild(b); });
    if (!buttons || !buttons.length) mf.remove();
    const close = (v) => { bg.remove(); resolve(v); };
    bg.addEventListener('click', (e) => { if (e.target === bg || e.target.hasAttribute('data-x')) close(null); });
    document.body.appendChild(bg);
    if (opt && opt.onOpen) opt.onOpen(bg);
  });
  HS.confirm = (msg) => HS.modal('확인', '<p style="margin:0;line-height:1.6">' + msg + '</p>', [['취소', null], ['확인', true, 'p']]);
  HS.el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
  HS.seg = (items, cur, onPick) => { const w = HS.el('<div class="seg"></div>'); items.forEach(([v, l]) => { const b = document.createElement('button'); b.textContent = l; if (v === cur) b.className = 'on'; b.onclick = () => onPick(v); w.appendChild(b); }); return w; };
  HS.dateNav = (cur, onPick) => {
    const w = HS.el('<span class="datenav"><button title="전날">◀</button><input type="date"><button title="다음날">▶</button><span class="pill hide-m"></span></span>');
    const [p, i, n, l] = w.children; i.value = cur; l.textContent = dow(cur) + '요일 · ' + weekLabel(cur);
    p.onclick = () => onPick(addDays(cur, -1)); n.onclick = () => onPick(addDays(cur, 1)); i.onchange = () => i.value && onPick(i.value);
    return w;
  };
  HS.download = async (name, rows, sheet) => { await HS.xlsx(); const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet || 'Sheet1'); XLSX.writeFile(wb, name); };
  HS.beep = (kind) => {
    try {
      const C = window.AudioContext || window.webkitAudioContext; const ctx = HS._ac || (HS._ac = new C());
      const notes = kind === 'task_done' ? [784, 988, 1319] : [660, 880];
      notes.forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination); const t = ctx.currentTime + i * 0.16; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15); o.start(t); o.stop(t + 0.16); });
    } catch (e) { /* 소리 불가 환경 */ }
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  };

  // ---------- 기준 데이터 캐시 ----------
  HS.loadRefs = async () => {
    const [teams, brands, roles, centers] = await Promise.all([HS.db.list('erp_teams', { order: ['sort'] }), HS.db.list('erp_brands', { order: ['sort'] }), HS.db.list('erp_roles', { order: ['level', false] }), HS.db.list('erp_centers', { order: ['sort'] })]);
    let people = []; try { people = await HS.db.list('erp_profiles', { select: 'id,name,title,dept,teams,role_id,active' }); } catch (e) { /* 무시 */ }
    // 지난 사람 (지운 사용자) — 이름만 남겨 두어 옛 자료의 '작성자' 칸이 빈칸이 되지 않게 (sql/34_user_admin.sql · 2026-11-24)
    let gone = []; try { gone = await HS.db.list('erp_gone_user', {}); } catch (e) { gone = []; }
    HS.cache.gone = gone;
    Object.assign(HS.cache, { teams: teams.filter((t) => t.active !== false), brands, roles, centers, people,
      peopleMap: Object.assign(Object.fromEntries(gone.map((p) => [p.id, { id: p.id, name: p.name, login_id: p.login_id, gone: true }])), Object.fromEntries(people.map((p) => [p.id, p]))) });
    HS.cache.teamMap = Object.fromEntries(HS.cache.teams.map((t) => [t.name, t]));
    // 연도별 인건비 (sql/26_team_year_cost.sql) — 그 해 값이 있으면 그걸 먼저 씀 (2026-11-12)
    try { const tc = await HS.db.list('erp_team_cost', {}); HS.cache.teamCost = Object.fromEntries(tc.map((r) => [r.team + '|' + r.year, r])); } catch (e) { HS.cache.teamCost = {}; }
    // 대표님 지시 · 할 일 — 등급이 아니라 사람 단위 명단 (sql/29_ceo.sql · 2026-11-18)
    //  · 명단이 아직 비어 있으면(업데이트 직후) 사용자 관리 권한이 있는 사람에게만 메뉴를 보여 '처음 시작' 화면으로 안내 (empty)
    HS.ceo = { ok: false, write: false, fixed: false, empty: false, err: null };
    try {
      const uid = HS.me && HS.me.id;
      if (uid) { const r = (await HS.db.list('erp_ceo_members', { eq: { user_id: uid } }))[0]; if (r) HS.ceo = { ok: true, write: !!r.can_write, fixed: !!r.fixed, empty: false };
        else if (HS.can('users', 'edit')) HS.ceo.empty = !(await HS.db.list('erp_ceo_members', { limit: 1 })).length; }
    } catch (e) { HS.ceo.err = e.message; if (HS.can('users', 'edit')) HS.ceo.empty = true; /* 29번 SQL 적용 전 — 관리자에게 안내 화면 */ }
    buildBrandIndex();
    try { const nr = (await HS.db.list('erp_settings', { eq: { key: 'noloc_rule' } }))[0]; if (window.HSCs) HSCs.setNoloc((nr && nr.value) || {}); } catch (e) { /* 무시 */ }
    try { const im = (await HS.db.list('erp_settings', { eq: { key: 'item_map' } }))[0]; if (window.HSStyle) HSStyle.setExtra((im && im.value) || {}); } catch (e) { /* 무시 */ }
  };
  // 품번 규칙: 아이템군 칸이 있는 파일에서 새 아이템 코드 배우기 (기본표 · 이미 아는 코드는 그대로)
  HS.styLearn = async (pairs, from) => {
    if (!window.HSStyle || !pairs || !pairs.length) return 0; const codes = HSStyle.learn(pairs); const ks = Object.keys(codes); if (!ks.length) return 0;
    try { const n = await HS.db.rpc('erp_item_learn', { p_codes: codes, p_from: from || '' }); const im = (await HS.db.list('erp_settings', { eq: { key: 'item_map' } }))[0]; HSStyle.setExtra((im && im.value) || {}); if (n) HS.toast('새 아이템 코드 ' + ks.slice(0, 5).join(' · ') + ' 자동 등록 (기준정보 › 품번 규칙에서 확인)', 'ok'); return n; } catch (e) { return 0; }
  };

  // 품번 규칙에 없는 아이템 코드가 파일에 있으면 경고창을 띄워 그 자리에서 등록받기
  //  list: [{ code, n, samples }] (HSStyle.unknownItems 결과) · 취소하면 그 파일은 '기타'로 들어간다
  HS.styAsk = async (list, from) => {
    if (!window.HSStyle || !list || !list.length) return 0;
    const G = HSStyle.GRP; const esc = HS.esc;
    const f = HS.el('<div><div class="al y">품번 규칙에 없는 아이템이 <b>' + list.length + '개</b> 있습니다. 등록하지 않으면 복종이 <b>기타</b>로 들어가 일정 · 집계에서 빠집니다.</div>'
      + '<div class="tw" style="margin-top:8px"><table><thead><tr><th>아이템</th><th class="n">줄수</th><th>예시 품번</th><th>아이템군</th><th>이름</th></tr></thead><tbody>'
      + list.map((u, i) => '<tr><td><b>' + esc(u.code) + '</b></td><td class="n">' + HS.fmt(u.n) + '</td><td class="mute" style="font-size:11.5px">' + esc(u.samples.join(' · ')) + '</td>'
        + '<td><select class="in" data-i="' + i + '" data-f="g" style="width:132px"><option value="">고르기</option>'
        + Object.keys(G).map((k) => '<option value="' + k + '">' + esc(G[k]) + '</option>').join('') + '</select></td>'
        + '<td><input class="in" data-i="' + i + '" data-f="n" placeholder="이름 (선택)" style="width:150px"></td></tr>').join('')
      + '</tbody></table></div><div class="mute" style="font-size:11.5px;margin-top:6px">아이템군 1 · 2 · 4 → 이너 · 3 → JK · 5 → ACC 로 자동 분류됩니다</div></div>');
    const picked = {};
    f.querySelectorAll('[data-i]').forEach((x) => (x.onchange = () => { const u = list[+x.dataset.i]; const o = picked[u.code] || (picked[u.code] = {}); o[x.dataset.f] = x.value; }));
    let n = 0;
    await HS.modal('아이템 등록이 필요합니다', f, [['나중에', null], ['등록', true, 'p']], {
      onOk: async () => {
        const codes = {}; for (const c in picked) if (picked[c].g) codes[c] = { g: +picked[c].g, n: picked[c].n || '' };
        if (!Object.keys(codes).length) throw new Error('아이템군을 하나 이상 골라 주세요');
        n = await HS.db.rpc('erp_item_learn', { p_codes: codes, p_from: from || '' });
        const im = (await HS.db.list('erp_settings', { eq: { key: 'item_map' } }))[0]; HSStyle.setExtra((im && im.value) || {});
        HS.toast('아이템 ' + Object.keys(codes).length + '개를 등록했습니다', 'ok');
      },
    });
    return n;
  };

  // ---------- 브랜드: 화면 표시는 영문, 저장은 기준명 ----------
  const bkey = (s) => { let t = String(s == null ? '' : s).trim(); const m = t.match(/^\s*[0-9A-Za-z]{1,2}\s*\((.+)\)\s*$/); if (m) t = m[1]; return t.toUpperCase().replace(/[\s　·._\-\[\]()]/g, ''); };
  function buildBrandIndex() {
    const ix = {}; const bm = {};
    (HS.cache.brands || []).forEach((b) => { bm[b.name] = b; [b.name, b.en].concat(b.aliases || []).forEach((a) => { const k = bkey(a); if (k && !ix[k]) ix[k] = b.name; }); });
    (HS.cache.brands || []).forEach((b) => { if (b.code) { const k = 'CODE:' + String(b.code).toUpperCase(); if (!ix[k]) ix[k] = b.name; } });
    HS.cache.brandIx = ix; HS.cache.brandMap = bm;
  }
  HS.bkey = bkey;
  HS.brandOf = (text) => { if (text == null || text === '') return null; const ix = HS.cache.brandIx || {}; const k = bkey(text); if (ix[k]) return ix[k]; const m = String(text).match(/^\s*([0-9A-Za-z])\s*\(/); if (m && ix['CODE:' + m[1].toUpperCase()]) return ix['CODE:' + m[1].toUpperCase()]; return null; };
  HS.bname = (name) => { const b = (HS.cache.brandMap || {})[name]; return b && b.en ? b.en : name || ''; };
  // 브랜드 차례 — 설정 › 기준정보 › 브랜드에서 정한 순번 하나로 모든 화면이 같은 차례를 쓴다 (2026-11-17)
  //  · 순번이 없거나 기준정보에 없는 이름(샘플 · 기타 · 미등록 등)은 맨 뒤로, 그 안에서는 가나다순
  HS.border = (name) => { const b = (HS.cache.brandMap || {})[name]; const s = b ? +b.sort : NaN; return isFinite(s) && s > 0 ? s : 9000; };
  HS.bcmp = (a, b) => HS.border(a) - HS.border(b) || String(a || '').localeCompare(String(b || ''), 'ko');
  HS.bsort = (list, key) => (list || []).slice().sort((x, y) => HS.bcmp(key ? key(x) : x, key ? key(y) : y));
  HS.activeBrands = (opt) => { opt = opt || {}; const d = opt.date || today(); return (HS.cache.brands || []).filter((b) => (opt.center ? (b.center_id || 'gobaek') === opt.center : true) && (opt.all || ((b.active !== false) && (!b.end_date || b.end_date >= d) && (!b.start_date || b.start_date <= d))) && (!opt.use || b[opt.use] !== false)); };
  // 엑셀 라이브러리(861KB)는 첫 화면을 막지 않도록 뒤에서 받음 — 엑셀을 읽거나 내려받기 전에 await HS.xlsx() (2026-11-12)
  HS.xlsx = () => (window.XLSX ? Promise.resolve() : HS.loadScript('vendor/xlsx.full.min.js'));
  HS.needXlsx = () => { if (!window.XLSX) { HS.xlsx().catch(() => {}); throw new Error('엑셀 기능을 아직 불러오는 중입니다. 2~3초 뒤에 다시 눌러 주세요'); } };
  HS.loadScript = (src) => HS['_s_' + src] || (HS['_s_' + src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src + ' 불러오기 실패')); document.head.appendChild(s); }));
  // 첫 로딩 쪼개기 (2026-11-18 · 사이트 점검 ⑤): 다른 화면이 빌려 쓰지 않는 화면은 처음에 받지 않고 그 화면을 열 때 받음
  //  · 로그인하고 2초 뒤 뒤에서 조용히 미리 받아 두므로, 보통은 누르면 바로 열림
  //  · 새 화면 파일을 여기로 옮기려면: 그 파일이 HS.xxx = 로 내놓는 기능을 다른 파일이 쓰지 않는지 먼저 확인
  //  · iwret · iwout 는 한 파일(views-iwol.js)이 화면 둘을 같이 등록한다 — 어느 쪽을 먼저 열어도 한 번만 받는다
  HS.LAZY = { count: 'js/views-count.js', rclean: 'js/views-rclean.js', npout: 'js/views-npout.js', shipout: 'js/views-shipout.js', headcount: 'js/views-headcount.js', iwret: 'js/views-iwol.js', iwout: 'js/views-iwol.js', tlmeet: 'js/views-tlmeet.js' };
  HS.loadView = (name) => { const src = HS.LAZY[name]; if (!src || HS.views[name]) return Promise.resolve(); return HS.loadScript(src).catch((e) => { delete HS['_s_' + src]; throw e; }); };
  HS.preloadViews = () => Object.keys(HS.LAZY).reduce((p, k) => p.then(() => HS.loadView(k).catch(() => {})), Promise.resolve());
  // 화면 영역 → 이미지(PNG) 저장 · 클립보드 복사 (카톡 붙여넣기)
  HS.snap = async (el, name) => {
    await HS.loadScript('vendor/html2canvas.min.js');
    HS.toast('이미지 만드는 중…', '');
    const c = await window.html2canvas(el, { backgroundColor: '#ffffff', scale: 2, useCORS: false, logging: false });
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const url = URL.createObjectURL(blob); const file = name.replace(/[\\/:*?"<>|]/g, '') + '.png';
    // 미리보기 → [복사] [저장] [공유] 중 고르기
    const canShare = (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([blob], file, { type: 'image/png' })] })); } catch (e) { return false; } })();
    const f = HS.el('<div class="snapv"><div class="mute" style="font-size:12px;margin-bottom:8px">' + c.width / 2 + ' × ' + c.height / 2 + ' · 확인 후 아래 버튼을 누르세요</div><div class="snapi"><img alt="미리보기"></div></div>');
    f.querySelector('img').src = url;
    const btns = [['닫기', null], ['📋 복사 (카톡에 붙여넣기)', 'copy'], ['⬇ 저장', 'save', 'p']]; if (canShare) btns.splice(1, 0, ['📤 공유 (카톡 보내기)', 'share']);
    await HS.modal('카톡 이미지 미리보기', f, btns, { wide: true, onOk: async (v) => {
      if (v === 'copy') { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); HS.toast('복사했습니다 · 카톡 대화창에 붙여넣기(Ctrl+V)', 'ok'); } catch (e) { HS.toast('이 브라우저는 이미지 복사가 안 됩니다 · [저장]을 누르세요', 'err'); return false; } return false; }
      if (v === 'share') { try { await navigator.share({ files: [new File([blob], file, { type: 'image/png' })], title: name }); } catch (e) { /* 취소 */ } return false; }
      if (v === 'save') { const a = document.createElement('a'); a.href = url; a.download = file; a.click(); HS.toast('저장했습니다 · ' + file, 'ok'); }
    } });
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  // ---------- 표를 손으로 잡아끌어 옮기기 (2026-11-18) ----------
  //  가로로 긴 표(일정표 · 일정 진행 현황 · 월간 회의 · 재고 등)에서 맨 아래 얇은 막대를 찾지 않아도
  //  표 아무 데나 누른 채로 끌면 그대로 따라옵니다. 그냥 누르기(실적 입력 등)는 예전 그대로.
  //  · 문서 한 곳에만 걸어 두므로 나중에 새로 그리는 표에도 자동으로 붙습니다
  //  · 글자 입력칸 · 버튼 · 링크 · 고르는 칸 위에서는 동작하지 않습니다 (글자 선택 · 누르기 그대로)
  (function () {
    const SKIP = 'input,textarea,select,button,a,label,option,[contenteditable]';
    const MOVE = 5; // 이만큼 움직여야 '끌었다'고 봄 (손떨림으로 클릭이 씹히지 않게)
    const canScroll = (el) => {
      for (let e = el; e && e !== document.body && e.nodeType === 1; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 4) return e;
        if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 4) return e;
      }
      return null;
    };
    let box = null, x0 = 0, y0 = 0, l0 = 0, t0 = 0, moved = 0, on = false;
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !e.target.closest) return;
      if (e.target.closest(SKIP)) return;
      const s = canScroll(e.target); if (!s) return;
      box = s; x0 = e.clientX; y0 = e.clientY; l0 = s.scrollLeft; t0 = s.scrollTop; moved = 0; on = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!box) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
      if (!on && moved < MOVE) return;
      if (!on) { on = true; document.body.classList.add('dragging'); }
      box.scrollLeft = l0 - dx; box.scrollTop = t0 - dy;
      e.preventDefault();
    });
    const end = () => { if (on) document.body.classList.remove('dragging'); box = null; on = false; };
    document.addEventListener('mouseup', end);
    document.addEventListener('mouseleave', end);
    // 끌고 난 뒤의 클릭은 흘려보냄 (칸을 눌러 실적을 입력하는 기능과 부딪히지 않게)
    document.addEventListener('click', (e) => { if (moved > MOVE) { e.stopPropagation(); e.preventDefault(); } moved = 0; }, true);
    // 끌 수 있는 표 위에서는 손 모양 커서
    document.addEventListener('mouseover', (e) => {
      const t = e.target; if (!t.closest) return;
      const w = t.closest('.tw,.dg,.gtt,.scal,.mbw,.tw2'); if (!w) return;
      w.classList.toggle('dragx', !!canScroll(t) && !t.closest(SKIP));
    });
  })();

  // 그 해 인건비 (sql/26_team_year_cost.sql) — 연도별 값이 있으면 그것, 없으면 기준정보의 팀 값 (2026-11-12)
  //  d: 'YYYY-MM-DD' 날짜 · 'YYYY' · 연도 숫자 — 아무거나 받음. 안 주면 올해
  HS.laborOf = (team, d) => {
    const y = d == null ? new Date().getFullYear() : +String(d).slice(0, 4);
    const base = HS.cache.teamMap[team] || { labor_cost: 0, ot_rate: 0 };
    const yr = (HS.cache.teamCost || {})[team + '|' + y];
    if (!yr) return base;
    return { labor_cost: +yr.labor_cost || 0, ot_rate: +yr.ot_rate || +base.ot_rate || 0, _year: y };
  };
  // 업무일지 계산 (기존 엑셀과 동일: 매출=수량×공정단가, 지출=T.O×평균인건비 + 야근시간×야근인원×연장시급)
  HS.calc = (rows, days) => {
    const by = {};
    const get = (t) => by[t] || (by[t] = { team: t, sales: 0, cost: 0, to: 0, qty: 0, ot: 0 });
    rows.forEach((r) => { const tm = HS.laborOf(r.team, r.work_date); const x = get(r.team); x.sales += (+r.qty || 0) * (+r.unit_price || 0); x.cost += r.cost_override != null ? +r.cost_override : (+r.to_count || 0) * (+tm.labor_cost || 0); x.to += +r.to_count || 0; x.qty += +r.qty || 0; });
    (days || []).forEach((d) => { const tm = HS.laborOf(d.team, d.work_date); const v = (+d.ot_hours || 0) * (+d.ot_people || 0) * (+tm.ot_rate || 0); if (v) { const x = get(d.team); x.cost += v; x.ot += v; } });
    Object.values(by).forEach((x) => (x.profit = x.sales - x.cost));
    return by;
  };

  // ---------- 화면 등록 · 라우터 ----------
  HS.view = (name, def) => (HS.views[name] = def);
  // 메뉴: 팀별 그룹 → 하위 항목 (같은 화면을 팀 조건으로 나눠 씀) · 권한 없는 항목은 숨김
  const MENU = [
    // 2026-11-12: 하위 메뉴(00~10)는 폐기 — 월간 회의 화면에서 스크롤로 다 보이므로 메뉴는 하나만 둠
    //  · `#/meeting?s=<섹션키>` 로 들어오면 그 항목으로 내려가는 기능은 그대로 (섹션 제목 링크 등)
    { g: '월간 회의', items: [['meeting', '월간 회의 (운영 자료)', 'meeting']] },
    // 2026-11-25: 팀장 자체 회의록 (2안 회의록 문서형 · views-tlmeet.js · sql/36_tlmeet.sql) — 보기 = 팀장 이상 · 쓰기 = 자기 팀
    { g: '팀장 회의', items: [['tlmeet', '팀장 자체 회의록', 'tlmeet']] },
    { g: '전산자료', items: [['csdash', '대시보드', 'csdata'], ['cs', 'WMS 재고 현황', 'csdata', { k: 'wms' }], ['cs', 'ERP 재고 현황', 'csdata', { k: 'erp' }], ['count', '재고 실사', 'count']] },
    { g: '입고팀', teams: ['입고반품팀'], items: [['worklog', '원가 관리 입력', 'worklog', { t: '입고반품팀' }], ['newprod', '신상품 입고 · 출고 · 정리', 'newprod'], ['settlement', '입고 대행 정산', 'settlement'], ['returns', '반품 현황', 'returns']] },
    // 2026-11-13: 재고 실사는 전산자료 하위 하나로만 — 정상팀에 있던 중복 링크 뺌 (화면 자체는 그대로, 들어가는 길만 하나로)
    { g: '정상팀', teams: ['정상1팀'], items: [['worklog', '원가 관리 입력', 'worklog', { t: '정상1팀' }], ['npout', '신상품 현황', 'newprod'], ['shipout', '출고 현황', 'daily'], ['rclean', '반품 정리 현황', 'returns']] },
    // 2026-11-23: 시즌 아웃 반품 정리 계획 · 선지시 출고 계획 · 시즌 OPEN 정리 계획 폐기 — 다른 프로그램으로 옮김 (자료는 DB 에 그대로)
    // 2026-11-24: 그 '다른 프로그램'(이월팀 출고관리 단독판)을 사이트로 들여옴 — 메뉴 2개 (views-iwol.js · sql/33_iwol.sql)
    //  · 보기는 전체 공개 · 올리기 · 고치기는 이월소터팀 + 관리자 (행님 결정)
    { g: '이월팀', teams: ['이월소터팀'], items: [['worklog', '원가 관리 입력', 'worklog', { t: '이월소터팀' }], ['iwret', '시즌반품정리현황', 'iwol'], ['iwout', '선지시출고현황', 'iwol']] },
    { g: '지원팀', roles: ['support'], items: [['daily', '일일 마감 보고', 'daily'], ['orders', '아침 출고지시 취합', 'orders'], ['headcount', '팀별 인원 배정', 'headcount']] },
    { g: '온라인팀', teams: ['온라인팀'], items: [['worklog', '원가 관리 입력', 'worklog', { t: '온라인팀' }]] },
    { g: '로라팀', teams: ['로라팀'], items: [['worklog', '원가 관리 입력', 'worklog', { t: '로라팀' }]] },
    { g: '별도인원', teams: ['별도인원'], items: [['worklog', '원가 관리 입력', 'worklog', { t: '별도인원' }]] },
    { g: '설정', items: [['upload', '엑셀 · 물동량 업로드', 'upload'], ['costset', '원가관리 설정', 'costset'], ['users', '사용자 · 등급', 'users'], ['settings', '기준정보', 'settings'], ['storage', '저장 공간', 'users'], ['requests', '개선 요청', 'requests']] },
    // 2026-11-18: 대표님 지시 · 할 일 — 명단(사람 단위)에 든 사람에게만 보임 · 메뉴 맨 위 (아래 PIN)
    { g: '🔒 대표님 지시', ceo: true, items: [['ceo', '지시 · 할 일', null]] },
  ];
  // 폐기한 화면 (KPI 원가관리 · 업무협조 TO-DO · 통합 대시보드 · 소모품/부자재 발주 · 월간 회의 보고서): 메뉴에서 빼고 주소로도 열리지 않음 (자료는 DB에 그대로 보관)
  //  · 월간 회의(meeting)는 2026-11-10 다시 살림 — 입고팀 항목 묶음 · 운영 자료 모아 보기
  //  · 월간 회의 보고서(meetbook · 엑셀 올려 보는 화면)는 2026-11-10 폐기 — 자료는 설정 › 저장 공간 › 정리하기에서 지울 수 있음
  //  · 시즌 계획(season)은 2026-11-23 폐기 — 이월팀 정리 계획 · 선지시 출고 계획 · 온라인팀 OPEN 계획이 다른 프로그램으로 갔음
  HS.RETIRED = ['kpi', 'tasks', 'dashboard', 'supply', 'meetbook', 'season'];
  // 공휴일 · 명절 (폐기한 시즌 계획에 있던 목록을 그대로 옮김 · 2026-11-23) — 내년 예상 물동량의 '작업일 수' 계산에 씀
  //  · 대체공휴일은 센터가 근무하는 경우가 많아 뺌
  HS.HOLIDAYS = ['2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-05-05', '2026-06-03', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-09', '2026-12-25',
    '2027-01-01', '2027-02-08', '2027-03-01', '2027-05-05', '2027-05-13', '2027-09-14', '2027-09-15', '2027-09-16', '2027-12-25'];
  const TOP = [['notice', '📢 공지 사항', 'notice']]; // 메뉴 맨 위 단독 (모든 직원) · 대시보드 · 소모품/부자재 발주 화면은 메뉴에서 숨김(자료 유지)
  HS.MENU = MENU;
  const NAV = TOP.concat(MENU.flatMap((m) => m.items.map((x) => [x[0], x[1], x[2]])));
  // 첫 화면: 내 팀 묶음의 첫 메뉴 · 팀 없으면 월간 회의 보고서 · 그것도 없으면 볼 수 있는 첫 메뉴
  // 휴대폰 · 좁은 창에서는 읽기 전용 휴대폰 화면으로 (2026-11-19) · [PC 화면으로 보기] 를 누르면 이 브라우저에서는 안 뜸
  HS.mobileOn = () => { try { if (localStorage.getItem('hs-pc') === '1') return false; } catch (e) { /* 무시 */ } return window.innerWidth < 720 && !!HS.views.m; };
  HS.home = () => { if (HS.mobileOn()) return ['m', {}]; const mine = HS.myGroup(); const g = MENU.find((m) => m.g === mine); const vis = (x) => menuVisible(x) && (HS.views[x[0]] || HS.LAZY[x[0]]) && HS.RETIRED.indexOf(x[0]) < 0; const it = (g && g.items.find(vis)) || MENU[0].items.find(vis) || MENU.flatMap((m) => m.items).find(vis); return it ? [it[0], it[3] || {}] : ['notice', {}]; };
  const menuHref = (x) => '#/' + x[0] + (x[3] ? '?' + new URLSearchParams(x[3]).toString() : '');
  const menuVisible = (x) => (x[0] === 'requests' ? HS.me.active : x[0] === 'notice' ? HS.me.active : x[0] === 'ceo' ? !!(HS.ceo && (HS.ceo.ok || HS.ceo.empty)) : HS.can(x[2], 'view'));
  HS.myGroup = () => { const me = HS.me || {}; const tm = me.teams || []; const g = MENU.find((m) => (m.teams && m.teams.some((t) => tm.indexOf(t) >= 0)) || (m.roles && m.roles.indexOf(me.role_id) >= 0)); return g ? g.g : null; };
  const STICKY = ['tm', 'ph']; // 같은 화면 안에서 이동할 때 메뉴 조건(팀 · 구분) 유지
  HS.go = (name, params) => {
    params = Object.assign({}, params || {});
    if (name === HS.cur) { const cur = HS.params(); STICKY.forEach((k) => { if (params[k] == null && cur[k] != null) params[k] = cur[k]; }); }
    Object.keys(params).forEach((k) => { if (params[k] == null) delete params[k]; });
    const q = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
    if (location.hash === '#/' + name + q) HS.route(); else location.hash = '#/' + name + q;
  };
  HS.params = () => { const h = location.hash.split('?')[1]; return Object.fromEntries(new URLSearchParams(h || '')); };
  HS.route = async () => {
    if (!HS.me || !HS.me.active) return;
    let name = location.hash.replace(/^#\/?/, '').split('?')[0];
    if (name && !HS.views[name] && HS.LAZY[name] && HS.RETIRED.indexOf(name) < 0) { // 나중에 받는 화면 — 받은 뒤 이어서 그림
      const bd = document.getElementById('body'); if (bd) bd.innerHTML = '<div class="empty">화면 불러오는 중…</div>';
      try { await HS.loadView(name); } catch (e) { HS.err(new Error('화면을 불러오지 못했습니다 · 인터넷 연결을 확인하고 새로고침(F5) 하세요')); return; }
      if (location.hash.replace(/^#\/?/, '').split('?')[0] !== name) return; // 받는 사이 다른 화면으로 옮김
    }
    if (!name || !HS.views[name] || HS.RETIRED.indexOf(name) >= 0) { const [h, q] = HS.home(); HS.go(h, q); return; }
    const v = HS.views[name];
    if (v.perm && !HS.can(v.perm, 'view')) { const [h, q] = HS.home(); if (h !== name) { HS.go(h, q); return; } }
    { const cur = HS.params(); let best = null, bs = -1;
      document.querySelectorAll('.nav a[data-v]').forEach((a) => { a.classList.remove('on'); if (a.dataset.v !== name) return; const q = JSON.parse(a.dataset.q || '{}'); const ks = Object.keys(q);
        if (ks.some((k) => cur[k] != null && cur[k] !== '' && String(cur[k]) !== String(q[k]))) return; // 다른 팀 · 구분 메뉴
        const sc = ks.filter((k) => String(cur[k]) === String(q[k])).length - (ks.length && !ks.some((k) => cur[k] != null) ? 0.5 : 0);
        if (sc > bs) { bs = sc; best = a; } });
      if (best) { best.classList.add('on'); const g = best.closest('.ng'); if (g) g.classList.add('open'); } }
    document.querySelector('.side').classList.remove('open');
    const body = document.getElementById('body'); const title = document.getElementById('ttl'); const tools = document.getElementById('tools');
    title.textContent = v.title; tools.innerHTML = ''; body.className = 'body'; body.innerHTML = '<div class="empty">불러오는 중…</div>';
    HS.unsubView && HS.unsubView(); HS.unsubView = null;
    HS.cur = name;
    document.getElementById('app').classList.toggle('mapp', name === 'm'); // 휴대폰 화면은 메뉴 · 제목 줄을 숨김
    if (HS.db.checkSession) HS.db.checkSession(); // 로그인이 풀린 채로 빈 화면을 그리지 않게
    if (HS.pres) HS.pres.update(name);
    try { await v.render(body, HS.params(), tools); } catch (e) { HS.err(e); body.innerHTML = '<div class="card empty">' + esc(e.message) + '</div>'; }
    if (HS.enhanceTables) { HS.enhanceTables(body); HS.watchTables(); }
  };
  // 실시간: 다른 사람이 같은 화면 자료를 바꾸면 자동 새로고침
  HS.live = (tables, fn) => {
    const offs = tables.map((t) => HS.db.subscribe(t, () => { clearTimeout(HS._lt); HS._lt = setTimeout(fn, 600); }));
    HS.unsubView = () => offs.forEach((o) => o());
  };

  // ---------- 레이아웃 ----------
  function layout() {
    const me = HS.me;
    const mine = HS.myGroup(); let opened = {}; try { opened = JSON.parse(localStorage.getItem('hs-nav-open') || '{}'); } catch (e) { /* 무시 */ }
    const groups = MENU.map((m) => { const items = m.items.filter(menuVisible); return { m, items }; }).filter((x) => x.items.length);
    const PIN = ['🔒 대표님 지시', '월간 회의', '팀장 회의', '전산자료']; // 맨 위 고정 (그 다음 내 팀) · 대표님 지시는 명단에 든 사람에게만 보임
    const rank = (g) => (PIN.indexOf(g) >= 0 ? PIN.indexOf(g) : g === mine ? 10 : 20);
    groups.sort((a, b) => rank(a.m.g) - rank(b.m.g));
    const nav = groups.map(({ m, items }) => { const op = opened[m.g] != null ? opened[m.g] : (m.g === mine || m.g === '월간 회의' || m.g === '팀장 회의' || !!m.ceo);
      return '<div class="ng' + (op ? ' open' : '') + (m.g === mine ? ' mine' : '') + (m.ceo ? ' ceo' : '') + '" data-g="' + esc(m.g) + '"><div class="gh"><span class="ar">›</span>' + esc(m.g) + (m.g === mine ? ' <em>내 팀</em>' : '') + '<span class="gc">' + items.length + '</span></div><div class="gi">' +
        items.map((x) => '<a data-v="' + x[0] + '" data-q=\'' + esc(JSON.stringify(x[3] || {})) + '\' href="' + esc(menuHref(x)) + '"><i></i>' + esc(x[1]) + (x[0] === 'tasks' && (!x[3] || mine === m.g) ? '<span class="cnt hide" data-tc></span>' : '') + '</a>').join('') + '</div></div>'; }).join('');
    const top = TOP.filter(menuVisible).map((x) => '<a class="topn" data-v="' + x[0] + '" data-q="{}" href="#/' + x[0] + '"><i></i>' + esc(x[1]) + '<span class="cnt hide" data-nc></span></a>').join('');
    document.getElementById('root').innerHTML =
      '<div id="app"><aside class="side"><div class="logo"><b>혜성물류 회의자료</b><span>월간 회의 · 고백리 · 안성</span></div>' +
      (HS.db.mode === 'local' ? '<div class="mode">로컬 모드 · 이 브라우저에만 저장</div>' : '') +
      '<nav class="nav">' + top + nav + '</nav><div class="me"><b>' + esc(me.name) + ' ' + esc(me.title || '') + '</b><em>' + esc(me.role.name || '') + (me.teams && me.teams.length ? ' · ' + esc(me.teams.join(', ')) : '') + '</em><br><span class="lo" id="pw">비밀번호 변경</span> · <span class="lo" id="logout">로그아웃</span><span class="nvh"> · <span class="lo" id="navh">세로 메뉴로</span></span> · <span class="lo" id="mgo">휴대폰 화면</span></div></aside>' +
      '<div class="main"><div class="top"><button class="burger" id="burger">☰</button><h1 id="ttl"></h1><div id="tools" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"></div><div class="sp"></div>' +
      '<div class="live" id="live"><span class="dot"></span><span>접속 <b id="onl">1</b>명</span><span class="nm" id="onlNames"></span></div><button class="bell" id="bell" title="알림">🔔<b class="hide" id="bellCnt"></b></button></div><div class="body" id="body"></div></div></div>';
    document.getElementById('burger').onclick = () => document.querySelector('.side').classList.toggle('open');
    // PC 가로 메뉴 (2026-11-18 · 사이트 점검 ④): 화면 폭 1200px 이상이면 메뉴를 위쪽 가로줄로 · 휴대폰 · 좁은 창은 지금처럼 ☰
    //  · 묶음에 마우스를 올리거나 누르면 아래로 펼침 · [세로 메뉴로] 를 누르면 이 브라우저에서는 예전 세로 메뉴
    const app = document.getElementById('app'), side = app.querySelector('.side');
    const hPref = () => { try { return localStorage.getItem('hs-nav-h') !== 'v'; } catch (e) { return true; } };
    const hOn = () => window.innerWidth >= 1200 && hPref();
    const hSync = () => { const on = hOn(); app.classList.toggle('hnav', on); document.documentElement.style.setProperty('--hnh', on ? side.offsetHeight + 'px' : '0px'); const t = document.getElementById('navh'); if (t) t.textContent = hPref() ? '세로 메뉴로' : '가로 메뉴로'; if (!on) app.querySelectorAll('.ng.hopen').forEach((g) => g.classList.remove('hopen')); };
    hSync(); if (HS._hsync) window.removeEventListener('resize', HS._hsync); HS._hsync = hSync; window.addEventListener('resize', hSync);
    if (window.ResizeObserver) new ResizeObserver(() => { if (app.classList.contains('hnav')) document.documentElement.style.setProperty('--hnh', side.offsetHeight + 'px'); }).observe(side);
    document.getElementById('navh').onclick = () => { try { localStorage.setItem('hs-nav-h', hPref() ? 'v' : 'h'); } catch (e) { /* 무시 */ } hSync(); };
    // 펼침 표시는 hopen — drop 은 '엑셀 파일 놓는 칸'(점선 흰 상자) 이름이라 겹치면 안 됨 (2026-11-18)
    const dropOff = () => app.querySelectorAll('.ng.hopen').forEach((g) => g.classList.remove('hopen'));
    if (!HS._hdoc) { HS._hdoc = true; document.addEventListener('click', (e) => { if (!e.target.closest('.hnav .nav .ng')) dropOff(); const a = e.target.closest('.hnav .nav .gi a'); if (a) setTimeout(() => { dropOff(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); a.closest('.ng').classList.add('shut'); }, 0); }, true);
      // 누른 뒤에도 마우스가 그 묶음 위에 있으면 펼침이 남으므로, 마우스가 한 번 나갈 때까지 닫아 둠
      document.addEventListener('mouseout', (e) => { const g = e.target.closest && e.target.closest('.ng.shut'); if (g && !g.contains(e.relatedTarget)) g.classList.remove('shut'); }); }
    document.querySelectorAll('.nav .gh').forEach((h) => (h.onclick = () => { const g = h.parentElement;
      if (app.classList.contains('hnav')) { const was = g.classList.contains('hopen'); dropOff(); if (!was) g.classList.add('hopen'); return; } // 가로 메뉴일 때는 펼침만 (세로 메뉴 접힘 기억은 건드리지 않음)
      g.classList.toggle('open'); try { const o = JSON.parse(localStorage.getItem('hs-nav-open') || '{}'); o[g.dataset.g] = g.classList.contains('open'); localStorage.setItem('hs-nav-open', JSON.stringify(o)); } catch (e) { /* 무시 */ } }));
    { const mg = document.getElementById('mgo'); if (mg) mg.onclick = () => { try { localStorage.removeItem('hs-pc'); } catch (e) { /* 무시 */ } HS.go('m', {}); }; }
    document.getElementById('logout').onclick = async () => { await HS.db.logout(); location.hash = ''; location.reload(); };
    document.getElementById('pw').onclick = changePw;
    document.getElementById('bell').onclick = showNotiList;
  }
  async function changePw() {
    if (HS.db.mode !== 'supabase') return HS.toast('로컬 모드에서는 비밀번호를 바꿀 수 없습니다');
    const f = HS.el('<div class="form"><label class="f wide">새 비밀번호 (6자 이상)<input class="in" type="password" id="np"></label></div>');
    await HS.modal('비밀번호 변경', f, [['취소', null], ['변경', true, 'p']], { onOk: async () => { const v = f.querySelector('#np').value; if (v.length < 6) throw new Error('6자 이상 입력하세요'); const { error } = await HS.db.client.auth.updateUser({ password: v }); if (error) throw error; HS.toast('변경했습니다', 'ok'); } });
  }

  // ---------- 알림 (완료 콜사인 팝업) ----------
  HS.noti = { list: [], shown: new Set(), queue: [], open: false };
  async function refreshNoti() {
    try {
      const rows = await HS.db.list('erp_notifications', { eq: { user_id: HS.me.id }, order: ['created_at', false], limit: 50 });
      HS.noti.list = rows;
      const unread = rows.filter((r) => !r.read_at);
      const b = document.getElementById('bellCnt'); if (b) { b.textContent = unread.length; b.classList.toggle('hide', !unread.length); }
      unread.slice().reverse().forEach((n) => { if (!HS.noti.shown.has(n.id)) { HS.noti.shown.add(n.id); HS.noti.queue.push(n); } });
      pump();
    } catch (e) { console.warn(e); }
  }
  function pump() {
    if (HS.noti.open || !HS.noti.queue.length) return;
    const n = HS.noti.queue.shift(); HS.noti.open = true; HS.beep(n.kind);
    const done = n.kind === 'task_done';
    const body = '<div class="callsign ' + (done ? '' : 'new') + '"><div class="ic">' + (done ? '✔' : '📋') + '</div><h2>' + esc(done ? '완료 콜사인' : '새 업무 할당') + '</h2><p><b>' + esc(n.title) + '</b><br>' + esc(n.body || '') + '<br><span class="mute">' + esc(new Date(n.created_at).toLocaleString('ko-KR')) + '</span></p></div>';
    HS.modal(null, body, [['확인', 'ok'], ['업무 보기', 'go', 'p']]).then(async (v) => {
      HS.noti.open = false;
      try { await HS.db.update('erp_notifications', { id: n.id }, { read_at: new Date().toISOString() }); } catch (e) { /* 무시 */ }
      if (v === 'go' && n.ref_id) HS.go('tasks', { id: n.ref_id });
      refreshNoti(); setTimeout(pump, 200);
    });
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(done ? '완료 콜사인' : '새 업무', { body: n.title + '\n' + (n.body || '') }); } catch (e) { /* 무시 */ } }
  }
  async function showNotiList() {
    await refreshNoti();
    const rows = HS.noti.list;
    const html = rows.length ? '<div class="tw"><table><tr><th>시각</th><th>내용</th><th></th></tr>' + rows.map((n) => '<tr class="click" data-id="' + n.id + '" data-ref="' + (n.ref_id || '') + '"><td>' + esc(new Date(n.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })) + '</td><td class="wrap"><b>' + esc(n.title) + '</b><br><span class="mute">' + esc(n.body || '') + '</span></td><td>' + (n.read_at ? '' : '<span class="tag r">새 알림</span>') + '</td></tr>').join('') + '</table></div>' : '<div class="empty">알림이 없습니다</div>';
    HS.modal('알림', html, [['모두 읽음', 'all'], ['닫기', null]], {
      onOpen: (bg) => bg.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = async () => { await HS.db.update('erp_notifications', { id: +tr.dataset.id }, { read_at: new Date().toISOString() }).catch(() => {}); bg.remove(); if (tr.dataset.ref) HS.go('tasks', { id: tr.dataset.ref }); refreshNoti(); })),
      onOk: async (v) => { if (v === 'all') { for (const n of rows.filter((r) => !r.read_at)) await HS.db.update('erp_notifications', { id: n.id }, { read_at: new Date().toISOString() }).catch(() => {}); refreshNoti(); } },
    });
  }
  async function refreshTaskCnt() {
    try {
      const rows = await HS.db.list('erp_tasks', { in: { status: ['요청', '접수', '진행중'] }, select: 'id,assigned_team,status' });
      const mine = rows.filter((t) => t.assigned_team && HS.teamOk(t.assigned_team) && t.status === '요청');
      document.querySelectorAll('[data-tc]').forEach((c) => { c.textContent = mine.length; c.classList.toggle('hide', !mine.length); });
    } catch (e) { /* 권한 없음 */ }
  }

  // ---------- 방화벽 ② 로그인 자동 공격 차단 (Cloudflare Turnstile) ----------
  const captchaOn = () => HS.db.mode === 'supabase' && !!(window.HS_CONFIG && HS_CONFIG.turnstileSiteKey);
  function captchaBox(host) { // { token(), reset() }
    const st = { tok: '', id: null };
    if (!captchaOn()) return { token: () => '', reset: () => {} };
    const box = HS.el('<div class="cap"><span class="mute" style="font-size:11.5px">자동 접속 방지 확인 중…</span></div>'); host.appendChild(box);
    HS.loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit').then(() => {
      box.innerHTML = '';
      st.id = window.turnstile.render(box, { sitekey: HS_CONFIG.turnstileSiteKey, language: 'ko', callback: (t) => { st.tok = t; }, 'expired-callback': () => { st.tok = ''; }, 'error-callback': () => { st.tok = ''; } });
    }).catch(() => { box.innerHTML = '<span class="neg" style="font-size:11.5px">자동 접속 방지 확인을 불러오지 못했습니다. 인터넷 연결을 확인하세요</span>'; });
    return {
      token: () => { if (!st.tok) throw new Error('자동 접속 방지 확인(체크 표시)이 끝난 뒤 다시 누르세요'); return st.tok; },
      reset: () => { st.tok = ''; try { if (st.id != null) window.turnstile.reset(st.id); } catch (e) { /* 무시 */ } },
    };
  }

  // ---------- 방화벽 ③ 관리자 2단계 인증 ----------
  async function mfaGate(force) { // true = 통과 · force = 설정 화면에서 직접 등록
    if (HS.db.mode !== 'supabase' || !(force || (HS.me.role && HS.me.role.mfa))) return true;
    // ⚠ 예전에는 여기서 오류가 나면 그냥 통과시켰다 → 세션이 끊기면 2단계 인증이 사실상 꺼졌음.
    //    이제는 통과시키지 않고 무엇이 잘못됐는지 보여 준다 (2026-11-19)
    let s; try { s = await HS.db.mfaState(); } catch (e) {
      HS.err(e);
      document.getElementById('root').innerHTML = '<div class="login"><div class="box"><h2>2단계 인증</h2><div class="sub">' + esc((e && e.message) || '확인하지 못했습니다') + '</div>' +
        '<button class="btn p" id="mrl" style="padding:11px">다시 시도</button><button class="btn" id="mlo">로그아웃</button></div></div>';
      document.getElementById('mrl').onclick = () => location.reload();
      document.getElementById('mlo').onclick = async () => { await HS.db.logout(); location.hash = ''; location.reload(); };
      return false;
    }
    if (s.current === 'aal2' && !(force && !s.factors.length)) return true;
    const root = document.getElementById('root');
    const out = '<button class="btn" id="mlo">로그아웃</button>';
    if (!s.factors.length) { // 처음: 휴대폰 인증 앱 등록
      let en; try { en = await HS.db.mfaEnroll(); } catch (e) { HS.err(e); return false; }
      root.innerHTML = '<div class="login"><div class="box"><h2>2단계 인증 등록</h2><div class="sub">' + esc(HS.me.name || '') + '님은 관리자 기능을 쓰는 등급이라 휴대폰 인증이 필요합니다. (처음 한 번)</div>' +
        '<ol class="mfa-steps"><li>휴대폰에 <b>Google Authenticator</b> 또는 <b>Microsoft Authenticator</b> 앱 설치</li><li>앱에서 <b>+ → QR 코드 스캔</b></li><li>앱에 나온 <b>6자리 번호</b> 입력</li></ol>' +
        '<div class="qr"><img alt="QR" src="' + esc(en.qr) + '"></div><div class="mute" style="font-size:11px;text-align:center;word-break:break-all">QR이 안 되면 직접 입력: <b>' + esc(en.secret) + '</b></div>' +
        '<input class="in" id="mcode" inputmode="numeric" maxlength="12" placeholder="6자리 번호" autocomplete="one-time-code"><button class="btn p" id="mgo" style="padding:11px">등록 완료</button>' + out + '</div></div>';
      document.getElementById('mgo').onclick = async () => { try { await HS.db.mfaVerify(en.id, document.getElementById('mcode').value); HS.toast('2단계 인증이 등록됐습니다', 'ok'); boot(); } catch (e) { HS.err(e); } };
    } else { // 로그인할 때마다: 앱 번호 확인
      root.innerHTML = '<div class="login"><div class="box"><h2>2단계 인증</h2><div class="sub">휴대폰 인증 앱의 <b>혜성 ERP</b> 6자리 번호를 입력하세요.</div>' +
        '<input class="in" id="mcode" inputmode="numeric" maxlength="12" placeholder="6자리 번호" autocomplete="one-time-code"><button class="btn p" id="mgo" style="padding:11px">확인</button>' + out +
        '<div class="mute" style="font-size:11.5px;line-height:1.6">휴대폰을 바꿨거나 잃어버렸으면 다른 관리자에게 해제를 요청하세요. (관리자가 1명뿐이면 Supabase 대시보드 › Authentication › Users에서 해당 사용자의 MFA 해제)</div></div></div>';
      document.getElementById('mgo').onclick = async () => { try { await HS.db.mfaVerify(s.factors[0].id, document.getElementById('mcode').value); boot(); } catch (e) { HS.err(e); } };
    }
    document.getElementById('mcode').onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('mgo').click(); }; // false를 돌려주면 글자 입력이 막히므로 블록으로
    document.getElementById('mcode').oninput = (e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); if (v !== e.target.value) e.target.value = v; }; // 띄어쓰기 · 붙여넣기 허용
    document.getElementById('mcode').focus();
    document.getElementById('mlo').onclick = async () => { await HS.db.logout(); location.reload(); };
    return false;
  }

  HS.mfaGate = mfaGate;

  // ---------- 로그인 · 가입 ----------
  function loginScreen(msg) {
    const conn = HSDB.loadConn();
    document.getElementById('root').innerHTML =
      '<div class="login"><div class="box"><h2>혜성물류 회의자료</h2><div class="sub">혜성물류 · 월간 회의 자료 통합 (고백리 · 안성)</div>' +
      (msg ? '<div class="lock">' + esc(msg) + '</div>' : '') +
      '<input class="in" id="lid" placeholder="아이디" autocomplete="username"><input class="in" id="lpw" type="password" placeholder="비밀번호" autocomplete="current-password">' +
      '<button class="btn p" id="lgo" style="padding:11px">로그인</button><button class="btn" id="lsu">사용 신청 (가입)</button>' +
      '<div class="mute" style="font-size:11.5px;line-height:1.6">' + (HS.db.mode === 'local' ? '<b>로컬 모드</b> · 시연 계정 admin / admin1234 · support · leader · staff (비밀번호 1234)<br>' : '연결: ' + esc(conn.url.replace(/^https?:\/\//, '')) + '<br>') +
      '<a href="#" id="lconn">연결 설정</a></div></div></div>';
    const cap = captchaBox(document.getElementById('lgo').parentNode.insertBefore(HS.el('<div></div>'), document.getElementById('lgo')));
    const go = async () => { try { HS.me = await HS.db.login(document.getElementById('lid').value.trim(), document.getElementById('lpw').value, cap.token()); boot(); } catch (e) { cap.reset(); HS.err(e); } };
    document.getElementById('lgo').onclick = go; document.getElementById('lpw').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    document.getElementById('lsu').onclick = signup; document.getElementById('lconn').onclick = (e) => { e.preventDefault(); connSettings(); };
  }
  async function signup() {
    const f = HS.el('<div class="form"><label class="f">아이디<input class="in" id="s1"></label><label class="f">비밀번호 (6자 이상)<input class="in" type="password" id="s2"></label><label class="f">이름<input class="in" id="s3"></label><label class="f">소속(팀)<input class="in" id="s4" placeholder="예: 정상1팀"></label><label class="f">직급<select class="in" id="s5">' + ['사원', '주임', '대리', '과장', '차장', '부장', '조장', '반장', '팀장', '센터장'].map((x) => '<option>' + x + '</option>').join('') + '</select></label><label class="f">연락처<input class="in" id="s6"></label><div class="wide mute" style="font-size:11.5px">안성센터 프로그램 계정이 있으면 같은 아이디·비밀번호로 신청하세요. 관리자가 승인하고 등급을 지정하면 사용할 수 있습니다.</div><div class="wide" id="scap"></div></div>');
    const cap = captchaBox(f.querySelector('#scap'));
    await HS.modal('ERP 사용 신청', f, [['취소', null], ['신청', true, 'p']], {
      onOk: async () => { const v = (i) => f.querySelector('#s' + i).value.trim(); if (!/^[A-Za-z0-9._@-]{3,}$/.test(v(1))) throw new Error('아이디는 영문·숫자 3자 이상'); if (v(2).length < 6) throw new Error('비밀번호 6자 이상'); if (!v(3)) throw new Error('이름을 입력하세요'); try { HS.me = await HS.db.signup({ login_id: v(1), password: f.querySelector('#s2').value, name: v(3), dept: v(4), title: v(5), phone: v(6), captcha: cap.token() }); } catch (e) { cap.reset(); throw e; } boot(); },
    });
  }
  function connSettings() {
    const c = HSDB.loadConn();
    const f = HS.el('<div class="form"><label class="f wide">사용 방식<select class="in" id="cm"><option value="supabase">Supabase 연결 (운영)</option><option value="local">로컬 모드 (시연·교육)</option></select></label><label class="f wide">Project URL<input class="in" id="cu" placeholder="https://xxxx.supabase.co"></label><label class="f wide">anon public key<input class="in" id="ck" placeholder="eyJ..."></label><div class="wide mute" style="font-size:11.5px;line-height:1.6">안성센터 프로그램 설정 화면(또는 Supabase > Project Settings > API)의 URL과 anon key를 그대로 넣으세요. 같은 프로젝트를 쓰면 안성 자료가 API로 바로 연동됩니다.</div></div>');
    f.querySelector('#cm').value = c.mode; f.querySelector('#cu').value = c.url; f.querySelector('#ck').value = c.key;
    HS.modal('연결 설정', f, [['취소', null], ['저장 후 다시 시작', true, 'p']], { onOk: async () => { HSDB.saveConn({ mode: f.querySelector('#cm').value, url: f.querySelector('#cu').value.trim(), key: f.querySelector('#ck').value.trim() }); location.reload(); } });
  }
  HS.connSettings = connSettings;
  function pendingScreen() {
    document.getElementById('root').innerHTML = '<div class="login"><div class="box"><h2>승인 대기 중</h2><div class="sub">' + esc(HS.me.name || '') + '님, 사용 신청이 접수됐습니다.</div><div class="lock">관리자가 승인하고 등급(관리자·업무지원팀·현장 팀장·실무진 등)을 지정하면 바로 사용할 수 있습니다.</div>' +
      (HS.db.mode === 'supabase' ? '<button class="btn" id="boot">최초 관리자로 지정 (관리자가 아직 없을 때만)</button>' : '') + '<button class="btn p" id="re">다시 확인</button><button class="btn" id="lo">로그아웃</button></div></div>';
    document.getElementById('re').onclick = boot;
    document.getElementById('lo').onclick = async () => { await HS.db.logout(); location.reload(); };
    const b = document.getElementById('boot'); if (b) b.onclick = async () => { try { const r = await HS.db.rpc('erp_bootstrap_admin'); HS.toast(r === 'ok' ? '관리자로 지정됐습니다' : '이미 관리자가 있습니다. 관리자에게 승인을 요청하세요', r === 'ok' ? 'ok' : ''); boot(); } catch (e) { HS.err(e); } };
  }
  async function profileForm() { // 안성 계정으로 로그인했지만 ERP 프로필이 없음
    const f = HS.el('<div class="form"><label class="f">아이디<input class="in" id="p1"></label><label class="f">이름<input class="in" id="p2"></label><label class="f">소속(팀)<input class="in" id="p3"></label><label class="f">직급<input class="in" id="p4"></label></div>');
    f.querySelector('#p1').value = (HS.me.email || '').replace('@hyeseong.erp', '');
    await HS.modal('ERP 사용 신청', f, [['신청', true, 'p']], { onOk: async () => { const ins = await HS.db.client.from('erp_profiles').insert({ id: HS.me.id, login_id: f.querySelector('#p1').value.trim(), name: f.querySelector('#p2').value.trim(), dept: f.querySelector('#p3').value.trim(), title: f.querySelector('#p4').value.trim(), role_id: 'pending', active: false }); if (ins.error) throw new Error(ins.error.message); } });
    boot();
  }

  // ---------- 시작 ----------
  // 메뉴를 다시 그림 — 대표님 지시 명단처럼 '내가 볼 수 있는 메뉴'가 바뀌었을 때 (2026-11-18)
  HS.relayout = async () => { await HS.loadRefs(); layout(); HS.route(); };
  async function boot() {
    try { HS.me = await HS.db.session(); } catch (e) { HS.err(e); HS.me = null; }
    if (!HS.me) return loginScreen();
    if (HS.me.needProfile) return profileForm();
    if (!HS.me.active || HS.me.role_id === 'pending') return pendingScreen();
    if (!(await mfaGate())) return;
    await HS.loadRefs();
    layout();
    window.onhashchange = HS.route;
    HS.route();
    // 알림 · 실시간 · 접속자
    refreshNoti(); refreshTaskCnt();
    HS.db.subscribe('erp_notifications', (p) => { if (!p.new || p.new.user_id === HS.me.id) refreshNoti(); });
    HS.db.subscribe('erp_tasks', () => { clearTimeout(HS._tc); HS._tc = setTimeout(refreshTaskCnt, 800); });
    setInterval(refreshNoti, 60000); // 실시간 끊김 대비
    HS.pres = HS.db.presence(HS.me, (list) => { const u = [...new Map(list.map((x) => [x.id, x])).values()]; const o = document.getElementById('onl'); if (o) o.textContent = u.length; const nm = document.getElementById('onlNames'); if (nm) nm.textContent = u.slice(0, 4).map((x) => x.name).join(', ') + (u.length > 4 ? ' 외' : ''); });
    (HS.afterBoot || []).forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
    if ('Notification' in window && Notification.permission === 'default') document.addEventListener('click', function ask() { Notification.requestPermission(); document.removeEventListener('click', ask); }, { once: true });
  }
  HS.reboot = boot;
  HS.start = () => { HS.db = HSDB.create(); boot(); };
})();
