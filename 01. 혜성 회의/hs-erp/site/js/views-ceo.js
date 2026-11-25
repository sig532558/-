/* 🔒 대표님 지시 · 할 일 (2026-11-18 승인)
 *  · 행님 · 대표님만 보고 쓰는 칸 — 권한은 등급이 아니라 사람 단위 명단(erp_ceo_members · sql/29_ceo.sql)
 *    명단에 없으면 메뉴도 안 보이고, 서버(RLS)에서도 자료를 읽을 수 없음
 *  · 지시(dir) 하나에 할 일(todo) 여러 개 · 할 일을 다 끝내면 지시가 자동으로 '완료'
 *  · 내 할 일(mine) = 지시와 상관없이 혼자 챙기는 목록
 *  · 명단 관리(사람 추가 · 보기/쓰기 · 고정)는 설정 › 사용자 · 등급 화면 아래 칸 (views-admin.js)
 */
(function () {
  'use strict';
  const { esc, fmt, today, addDays } = HS;
  const T = 'erp_ceo_items';
  const SRC = ['월간 회의', '전화', '카톡', '대면', '메일', '기타'];
  const ST = ['새로 받음', '진행 중', '완료', '보류'];
  const WD = '일월화수목금토';
  const md = (d) => (d ? +d.slice(5, 7) + '/' + +d.slice(8, 10) : '');
  const mdw = (d) => (d ? md(d) + ' (' + WD[new Date(d + 'T00:00:00').getDay()] + ')' : '');
  const gap = (d) => Math.round((new Date(today() + 'T00:00:00') - new Date(d + 'T00:00:00')) / 86400000); // + 면 지난 날
  const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const monOf = (d) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const FKEY = 'hs.ceo.f';
  // 구글 캘린더 (2026-11-18 승인) — ① 줄마다 일정 추가 창 ② 한꺼번에 .ics 파일 · 넣었는지 표시와 보낼 내용은 사람 · 브라우저마다 기억
  const CALK = 'hs.ceo.cal'; const CMODE = 'hs.ceo.calmode';
  const CMN = { title: '제목 + 날짜만', full: '제목 + 날짜 + 담당 · 메모', hide: '제목을 감춤' };
  const CMX = { title: '예) [대표님 지시] 매장별 런닝 운영 수량 맞춰 보기 · 11/20 — 설명 · 메모 · 지시 원문은 안 보냄',
    full: '예) 위 + "담당 정상팀 · 메모" — 메모에 적은 숫자까지 구글에 저장됨', hide: '예) "혜성 할 일 (11/20)" — 무슨 일인지는 사이트에서만 보임' };

  // 지시 상태 — 보류 · 완료는 저장값, 그 밖에는 할 일 진행으로 판단 · 기한 지나면 'N일 지남'
  function dirState(d, kids) {
    if (d.state === '보류') return { k: 'hold', t: '보류' };
    if (d.state === '완료' || (kids.length && kids.every((x) => x.done))) return { k: 'done', t: '완료' };
    if (d.due && gap(d.due) > 0) return { k: 'late', t: gap(d.due) + '일 지남' };
    if (d.state === '진행 중' || kids.some((x) => x.done)) return { k: 'ing', t: '진행 중' };
    return { k: 'new', t: '새로 받음' };
  }
  const baseState = (d, kids) => { const s = dirState(d, kids); return s.k === 'late' ? (d.state === '새로 받음' && !kids.some((x) => x.done) ? '새로 받음' : '진행 중') : s.t; };
  const todoState = (t) => (t.done ? { k: 'done', t: '완료' } : t.due && gap(t.due) > 0 ? { k: 'late', t: gap(t.due) + '일 지남' } : { k: 'ing', t: '진행 중' });

  // ---------- 명단 편집 (사람 단위 권한) — 지시 화면의 🔒 버튼 · 설정 › 사용자 · 등급 › 🔒 탭 둘 다 이걸 씀 ----------
  //  · 고정 인원(행님 · 대표님)만 사람을 더하고 뺌 · 고정 인원은 빼거나 쓰기를 끌 수 없음 (DB 규칙도 같음)
  //  · 처음 한 번: 명단이 비어 있으면 사용자 관리 권한이 있는 사람이 '자기 자신'을 고정으로 넣고 시작
  HS.ceoMembers = async function (host) {
    let M = [];
    try { M = await HS.db.list('erp_ceo_members', {}); } catch (e) { host.innerHTML = '<div class="lock">아직 DB 에 대표님 지시 칸이 없습니다 — [업데이트하기.bat] 을 먼저 실행해 주세요</div>'; return; }
    const FX = !!(HS.ceo && HS.ceo.fixed);
    const P = HS.cache.peopleMap || {}; const nm = (id) => (P[id] ? P[id].name + (P[id].title ? ' ' + P[id].title : '') : '(지운 계정)');
    const roleName = (id) => (HS.cache.roles.find((r) => r.id === id) || { name: id || '-' }).name;
    const redraw = () => HS.ceoMembers(host);
    if (!M.length) {
      host.innerHTML = '<div class="ceo-boot">아직 명단이 비어 있어 <b>아무도 볼 수 없습니다.</b><br>'
        + (HS.can('users', 'edit') ? '처음 한 번만 — 아래 버튼을 누르면 <b>본인 계정</b>이 고정 인원으로 들어갑니다. 그 다음 이 칸에서 <b>대표님</b>을 고정으로 넣으시면 됩니다.<div style="margin-top:10px"><button class="btn p" id="cbs">나를 고정 인원으로 넣고 시작</button></div>'
          : '사용자 관리 권한이 있는 분(관리자)이 처음 한 번 시작해 주셔야 합니다.') + '</div>';
      const b = host.querySelector('#cbs');
      if (b) b.onclick = async () => { try { await HS.db.upsert('erp_ceo_members', [{ user_id: HS.me.id, can_write: true, fixed: true }]); HS.toast('명단을 시작했습니다 · 왼쪽 메뉴 맨 위에 🔒 대표님 지시가 생겼습니다', 'ok'); await HS.relayout(); }
        catch (e) { // 서버 규칙에 막힌 경우 — 관리자 기능과 같은 조건(2단계 인증 · 관리자 IP)
          if (/row-level security|violates/i.test(e.message || '')) host.insertAdjacentHTML('beforeend', '<div class="lock" style="margin-top:10px">시작이 막혔습니다 — 다른 관리자 기능과 같은 조건이 필요합니다: <b>2단계 인증으로 로그인</b>했는지, 설정에 <b>관리자 IP 제한</b>이 있으면 <b>회사에서 접속</b>했는지 확인해 주세요.<br><span class="mute" style="font-size:11.5px">' + esc(e.message) + '</span></div>');
          HS.err(e); } };
      return;
    }
    M.sort((a, b) => (b.fixed - a.fixed) || (b.can_write - a.can_write) || nm(a.user_id).localeCompare(nm(b.user_id), 'ko'));
    const tg = (on, attr) => '<span class="ctg' + (on ? ' on' : '') + (attr ? '" ' + attr : ' ro"') + '><i></i></span>';
    const others = (HS.cache.people || []).filter((p) => p.active && !M.some((m) => m.user_id === p.id)).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));
    host.innerHTML = '<table class="ceo-mem"><tr><th>이름</th><th>등급</th><th class="c">보기</th><th class="c">쓰기</th><th></th></tr>'
      + M.map((m) => { const p = P[m.user_id] || {}; const ed = FX && !m.fixed;
        return '<tr data-u="' + esc(m.user_id) + '"><td><b>' + esc(nm(m.user_id)) + '</b>' + (m.user_id === HS.me.id ? ' <span class="mute">(나)</span>' : '') + '</td><td>' + esc(roleName(p.role_id)) + '</td>'
          + '<td class="c">' + tg(true, ed ? 'data-a="del" title="끄면 명단에서 빠집니다"' : '') + '</td><td class="c">' + tg(m.can_write, ed ? 'data-a="w"' : '') + '</td>'
          + '<td class="mute">' + (m.fixed ? '고정 · 뺄 수 없음' : (m.can_write ? '보기 · 쓰기' : '보기만') + (FX ? ' <button class="btn sm" data-a="fix">고정으로</button>' : '')) + '</td></tr>'; }).join('') + '</table>'
      + (FX ? '<div class="ceo-addp"><select class="in" id="cpu"><option value="">사람 고르기…</option>' + others.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name + (p.title ? ' ' + p.title : '') + ' · ' + roleName(p.role_id)) + '</option>').join('') + '</select>'
          + '<select class="in" id="cpw"><option value="0">보기만</option><option value="1">보기 · 쓰기</option></select><label style="font-size:12.5px"><input type="checkbox" id="cpf"> 고정</label><button class="btn sm p" id="cpa">+ 사람 추가</button></div>'
          + '<div class="mute" style="font-size:11.5px;margin-top:6px;line-height:1.7">· 보기를 끄면 명단에서 빠집니다 · 고정 인원은 화면에서 빼거나 쓰기를 끌 수 없습니다 (실수로 잠기는 일 없게)<br>· 대표님이 목록에 없으면 먼저 [설정 › 사용자 · 등급] 에서 대표님 계정을 만들고 승인해 주세요 · 바뀐 기록은 수정 이력에 남습니다</div>'
        : '<div class="mute" style="font-size:11.5px;margin-top:6px">명단은 고정 인원(행님 · 대표님)만 바꿀 수 있습니다' + (HS.can('users', 'view') && !(HS.ceo && HS.ceo.ok) ? ' · 이 화면에서는 누가 볼 수 있는지만 보이고 지시 내용은 보이지 않습니다' : '') + '</div>');
    host.querySelectorAll('tr[data-u]').forEach((tr) => { const m = M.find((x) => x.user_id === tr.dataset.u); if (!m) return;
      tr.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => { const a = b.dataset.a;
        try {
          if (a === 'del') { if (!(await HS.confirm(esc(nm(m.user_id)) + ' 을(를) 명단에서 뺄까요?<br>바로 메뉴가 사라지고 지시 내용을 볼 수 없게 됩니다.'))) return; await HS.db.remove('erp_ceo_members', { user_id: m.user_id }); HS.toast('명단에서 뺐습니다', 'ok'); }
          if (a === 'w') { await HS.db.update('erp_ceo_members', { user_id: m.user_id }, { can_write: !m.can_write }); HS.toast(m.can_write ? '보기만으로 바꿨습니다' : '쓰기를 켰습니다', 'ok'); }
          if (a === 'fix') { if (!(await HS.confirm(esc(nm(m.user_id)) + ' 을(를) 고정 인원으로 할까요?<br><b>고정하면 화면에서는 다시 뺄 수 없습니다.</b> (쓰기도 같이 켜집니다)'))) return; await HS.db.update('erp_ceo_members', { user_id: m.user_id }, { fixed: true, can_write: true }); HS.toast('고정 인원으로 바꿨습니다', 'ok'); }
          redraw();
        } catch (e) { HS.err(e); } })); });
    const pa = host.querySelector('#cpa');
    if (pa) pa.onclick = async () => { const u = host.querySelector('#cpu').value; if (!u) return HS.toast('사람을 고르세요');
      const fixed = host.querySelector('#cpf').checked; const w = fixed || host.querySelector('#cpw').value === '1';
      if (fixed && !(await HS.confirm(esc(nm(u)) + ' 을(를) 고정 인원으로 넣을까요?<br><b>고정하면 화면에서는 다시 뺄 수 없습니다.</b>'))) return;
      try { await HS.db.upsert('erp_ceo_members', [{ user_id: u, can_write: w, fixed }]); HS.toast(nm(u) + ' 추가했습니다', 'ok'); redraw(); } catch (e) { HS.err(e); } };
  };

  HS.view('ceo', {
    title: '대표님 지시 · 할 일',
    async render(body, p, tools) {
      if (!(HS.ceo && HS.ceo.ok)) {
        // 명단이 아직 비어 있을 때(업데이트 직후) 관리자에게만 — 처음 시작 화면
        if (HS.ceo && HS.ceo.empty) {
          const c = HS.el('<div class="card" style="max-width:820px"><h3>🔒 대표님 지시 · 할 일 — 처음 시작</h3>'
            + (HS.ceo.err ? '<div class="lock" style="margin-bottom:10px">DB 에 대표님 지시 칸이 아직 없습니다 — [업데이트하기.bat] 이 SQL(29_ceo.sql)까지 끝났는지 확인해 주세요<br><span class="mute" style="font-size:11.5px">' + esc(HS.ceo.err) + '</span></div>' : '')
            + '<div style="font-size:13px;line-height:1.9;margin-bottom:10px">이 칸은 <b>명단에 든 사람만</b> 볼 수 있습니다. 지금은 명단이 비어 있어 아무도 볼 수 없어서, 관리자에게만 이 시작 화면이 보입니다.<br>'
            + '① 아래 버튼으로 <b>본인 계정</b>을 고정 인원으로 넣습니다 → ② 같은 칸에서 <b>대표님 계정</b>을 고르고 \'고정\' 체크 후 [+ 사람 추가]<br>'
            + '시작하고 나면 명단에 없는 사람(다른 관리자 포함)에게는 이 메뉴가 사라집니다.</div><div class="cm"></div></div>');
          body.innerHTML = ''; body.appendChild(c); if (!HS.ceo.err) await HS.ceoMembers(c.querySelector('.cm'));
          return;
        }
        const [h, q] = HS.home(); HS.go(h, q); return;
      }
      const W = !!HS.ceo.write;
      const all = await HS.db.list(T, {});
      body.innerHTML = ''; // '불러오는 중…' 지우기
      const members = await HS.db.list('erp_ceo_members', {}).catch(() => []);
      const lk = HS.el('<button class="ceo-lock" title="누가 볼 수 있는지 · ' + (HS.ceo.fixed ? '사람 추가 · 빼기' : '보기만') + '">🔒 볼 수 있는 사람 ' + members.length + '명</button>'); tools.appendChild(lk);
      lk.onclick = async () => { const h = HS.el('<div></div>'); const pr = HS.ceoMembers(h); await HS.modal('🔒 대표님 지시 · 할 일 — 볼 수 있는 사람', h, [['닫기', null]], { wide: true }); await pr; HS.route(); };
      const bd = HS.el('<button class="btn p">+ 지시 등록</button>'); const bc = HS.el('<button class="btn">📅 캘린더 설정</button>'); const bx = HS.el('<button class="btn gd">엑셀</button>');
      if (W) tools.appendChild(bd); tools.appendChild(bc); tools.appendChild(bx);

      const dirs = all.filter((x) => x.kind === 'dir'); const mines = all.filter((x) => x.kind === 'mine');
      const dirOf = {}; dirs.forEach((d) => (dirOf[d.id] = d));
      const kidsOf = {}; all.filter((x) => x.kind === 'todo').forEach((x) => (kidsOf[x.parent_id] = kidsOf[x.parent_id] || []).push(x));
      Object.values(kidsOf).forEach((l) => l.sort((a, b) => (+a.sort || 0) - (+b.sort || 0) || ((a.created_at || '') < (b.created_at || '') ? -1 : 1)));
      const K = (d) => kidsOf[d.id] || [];
      const t0 = today(); const wk0 = monOf(t0), wk1 = addDays(wk0, 6); const ym = t0.slice(0, 7);

      // ---------- 요약 ----------
      const live = dirs.filter((d) => ['done', 'hold'].indexOf(dirState(d, K(d)).k) < 0);
      const liveKids = [].concat.apply([], live.map(K));
      const openAll = [].concat(live, [].concat.apply([], dirs.map(K)).filter((t) => !t.done), mines.filter((t) => !t.done));
      const thisWeek = openAll.filter((x) => x.due && x.due >= wk0 && x.due <= wk1);
      const late = openAll.filter((x) => x.due && x.due < t0); const lateMax = late.length ? Math.max.apply(null, late.map((x) => gap(x.due))) : 0;
      const doneM = dirs.filter((d) => dirState(d, K(d)).k === 'done' && (d.done_at || '').slice(0, 7) === ym).length;
      const doneMT = [].concat.apply([], dirs.map(K)).concat(mines).filter((t) => t.done && (t.done_at || '').slice(0, 7) === ym).length;
      const kp = (l, v, s, c) => '<div class="card kpi' + (c ? ' ' + c : '') + '"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
      body.appendChild(HS.el('<div class="kpis ceo-k">' +
        kp('진행 중 지시', fmt(live.length), '할 일 ' + fmt(liveKids.length) + '개 중 ' + fmt(liveKids.filter((x) => x.done).length) + '개 완료') +
        kp('이번 주 기한', '<span class="gold">' + fmt(thisWeek.length) + '</span>', md(wk0) + ' ~ ' + md(wk1), 'y') +
        kp('기한 지남', '<span class="neg">' + fmt(late.length) + '</span>', late.length ? '가장 오래된 것 ' + lateMax + '일' : '없음', late.length ? 'r' : '') +
        kp(+ym.slice(5) + '월 완료', '<span class="pos">' + fmt(doneM) + '</span>', '지시 ' + fmt(doneM) + ' · 할 일 ' + fmt(doneMT), 'g') + '</div>'));

      // ---------- 필터 (관련 팀 · 찾기 · 지시 상태) ----------
      const teamsAll = [...new Set([].concat.apply([], dirs.map((d) => d.teams || [])))];
      let F = { st: ['새로 받음', '진행 중'], tm: [], q: '', dir: '' };
      try { const s = JSON.parse(localStorage.getItem(FKEY) || 'null'); if (s && s.st) F = Object.assign(F, s); } catch (e) { /* 기억 못 해도 기본값 */ }
      if (F.dir && !dirOf[F.dir]) F.dir = '';
      const keepF = () => { try { localStorage.setItem(FKEY, JSON.stringify(F)); } catch (e) { /* 무시 */ } };
      const fl = HS.el('<div class="ceo-flt"></div>'); body.appendChild(fl);
      const cols = HS.el('<div class="ceo-cols"><div class="ceo-l card no-tools no-no"></div><div class="ceo-r"></div></div>'); body.appendChild(cols);
      const drawAll = () => { drawF(); drawL(); drawR(); };
      function drawF() {
        const ch = (k, v, on) => '<span class="chip2' + (on ? ' on' : '') + '" data-k="' + k + '" data-v="' + esc(v) + '">' + esc(v) + '</span>';
        fl.innerHTML = (teamsAll.length ? '<b>관련 팀</b>' + ch('tm', '전체', !F.tm.length) + teamsAll.map((t) => ch('tm', t, F.tm.indexOf(t) >= 0)).join('') : '')
          + (F.dir ? '<span class="chip2 on" data-undir="1" title="눌러서 풀기">📌 ' + esc(dirOf[F.dir].title.slice(0, 24)) + ' 만 ✕</span>' : '')
          + '<span class="sp"></span><input class="in" id="cq" placeholder="찾기 (내용 · 담당 · 메모)" style="width:220px">';
        const qi = fl.querySelector('#cq'); qi.value = F.q; qi.oninput = () => { F.q = qi.value; keepF(); drawL(); drawR(); };
        fl.querySelectorAll('[data-k]').forEach((e) => (e.onclick = () => { const k = e.dataset.k, v = e.dataset.v;
          if (k === 'tm' && v === '전체') F.tm = []; else F[k] = F[k].indexOf(v) >= 0 ? F[k].filter((x) => x !== v) : F[k].concat([v]);
          keepF(); drawAll(); }));
        const ud = fl.querySelector('[data-undir]'); if (ud) ud.onclick = () => { F.dir = ''; keepF(); drawAll(); };
      }
      const words = () => F.q.trim().split(/[,\s]+/).filter(Boolean);
      const hitS = (s) => words().every((w) => s.indexOf(w) >= 0);
      const teamOkD = (d) => !F.tm.length || (d.teams || []).some((t) => F.tm.indexOf(t) >= 0);
      // 할 일 한 줄이 보이나 — 지시에서 나온 것은 그 지시의 관련 팀으로, 내 할 일은 팀을 고르면 숨김
      const fitT = (t) => { const d = t.kind === 'todo' ? dirOf[t.parent_id] : null;
        if (F.dir) return !!d && d.id === F.dir && hitS(JSON.stringify([t.title, t.owner, t.memo]));
        if (F.tm.length && (!d || !teamOkD(d))) return false;
        return hitS(JSON.stringify([t.title, t.owner, t.memo, d ? d.title : ''])); };
      const fitD = (d) => F.st.indexOf(baseState(d, K(d))) >= 0 && teamOkD(d) && hitS(JSON.stringify([d.title, d.note, d.memo, d.src, d.teams, K(d).map((t) => [t.title, t.owner, t.memo])]));
      const badge = (s) => '<span class="cst ' + s.k + '">' + esc(s.t) + '</span>';

      // ---------- 구글 캘린더 (① 줄마다 일정 추가 창 · ② 한꺼번에 .ics 파일) ----------
      //  · 넣었는지 표시는 '그 사람 · 그 브라우저'에 기억 (캘린더는 사람마다 따로라서 DB 에 안 둠)
      //  · 보낼 내용은 처음 한 번 고르면 기억 — 기본은 '제목 + 날짜만' (회사 밖 구글 서버로 나가는 내용 최소)
      let CAL = {}; try { CAL = JSON.parse(localStorage.getItem(CALK) || '{}') || {}; } catch (e) { CAL = {}; }
      const markCal = (ids) => { ids.forEach((id) => (CAL[id] = t0)); try { localStorage.setItem(CALK, JSON.stringify(CAL)); } catch (e) { /* 무시 */ } };
      const calMode = () => { try { return localStorage.getItem(CMODE) || 'title'; } catch (e) { return 'title'; } };
      const calTitle = (t) => (calMode() === 'hide' ? '혜성 할 일 (' + md(t.due) + ')' : (t.kind === 'mine' ? '[내 할 일] ' : '[대표님 지시] ') + t.title);
      const calDesc = (t) => { if (calMode() !== 'full') return ''; const d = t.kind === 'todo' ? dirOf[t.parent_id] : null;
        return [t.owner ? '담당 ' + t.owner : '', t.memo || '', d ? '지시: ' + d.title : '', '혜성물류 회의자료'].filter(Boolean).join('\n'); };
      const d8 = (d) => d.replace(/-/g, '');
      const gUrl = (t) => 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(calTitle(t)) + '&dates=' + d8(t.due) + '/' + d8(addDays(t.due, 1)) + (calDesc(t) ? '&details=' + encodeURIComponent(calDesc(t)) : '');
      const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
      function icsOf(list) {
        const st = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//hyeseong//ceo-todo//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
        list.forEach((t) => { L.push('BEGIN:VEVENT', 'UID:' + t.id + '@hyeseong-erp', 'DTSTAMP:' + st, 'DTSTART;VALUE=DATE:' + d8(t.due), 'DTEND;VALUE=DATE:' + d8(addDays(t.due, 1)),
          'SUMMARY:' + icsEsc(calTitle(t)), 'CLASS:PRIVATE', 'TRANSP:TRANSPARENT');
          if (calDesc(t)) L.push('DESCRIPTION:' + icsEsc(calDesc(t)));
          L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(calTitle(t)), 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT'); }); // 종일 일정 0시 기준 -15시간 = 하루 전 오전 9시
        L.push('END:VCALENDAR'); return L.join('\r\n') + '\r\n';
      }
      HS.ceoIcs = icsOf; // 점검용
      const calBtn = (t) => (t.done ? '' : !t.due ? '<span class="mute" style="font-size:11px">기한을 넣으면 📅</span>'
        : CAL[t.id] ? '<button class="calb done" data-cal="1" title="' + md(CAL[t.id]) + ' 에 넣음 · 다시 누르면 한 번 더">✓ 캘린더</button>' : '<button class="calb" data-cal="1" title="구글 캘린더 일정 추가 창이 열립니다">📅 넣기</button>');
      async function calOne(t) { window.open(gUrl(t), '_blank', 'noopener'); markCal([t.id]); drawL(); }
      async function calMany() {
        const L = [].concat.apply([], dirs.map(K)).concat(mines).filter((t) => !t.done && t.due && t.due <= wk1 && fitT(t)).sort((a, b) => (a.due < b.due ? -1 : 1));
        if (!L.length) return HS.toast('이번 주까지 기한인 할 일이 없습니다');
        const f = HS.el('<div><div class="mute" style="font-size:12px;margin-bottom:8px">기한 지난 것 + 이번 주(' + md(wk0) + ' ~ ' + md(wk1) + ') 것 · <b>아직 안 넣은 것</b>만 골라 두었습니다 · 보낼 내용: <b>' + esc(CMN[calMode()]) + '</b></div>'
          + L.map((t) => '<label class="cpick"><input type="checkbox" value="' + esc(t.id) + '"' + (CAL[t.id] ? '' : ' checked') + '> <b>' + esc(md(t.due)) + '</b> ' + esc(calTitle(t)) + (CAL[t.id] ? ' <span class="mute">(' + md(CAL[t.id]) + ' 넣음)</span>' : '') + '</label>').join('')
          + '<div class="mute" style="font-size:11.5px;margin-top:10px;line-height:1.7">받은 파일(.ics)을 <b>구글 캘린더 › 설정 › 가져오기 및 내보내기 › 가져오기</b>에 올리면 한 번에 들어갑니다 · 일정마다 <b>하루 전 오전 9시 알림</b> · 비공개<br>같은 파일을 두 번 올리면 두 번 들어가니, 넣은 것은 다음부터 체크가 빠져 있습니다</div></div>');
        await HS.modal('📅 구글 캘린더로 한꺼번에 — 파일 받기', f, [['취소', null], ['파일 받기', true, 'p']], { wide: true, onOk: async () => {
          const ids = [...f.querySelectorAll('input:checked')].map((x) => x.value); if (!ids.length) throw new Error('넣을 할 일을 하나 이상 고르세요');
          const pick = L.filter((t) => ids.indexOf(t.id) >= 0);
          const url = URL.createObjectURL(new Blob([icsOf(pick)], { type: 'text/calendar;charset=utf-8' }));
          const a = document.createElement('a'); a.href = url; a.download = '대표님지시_할일_' + t0.slice(5).replace('-', '') + '.ics'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
          markCal(ids); HS.toast(ids.length + '개 일정 파일을 받았습니다 · 구글 캘린더 › 설정 › 가져오기', 'ok'); drawL();
        } });
      }
      bc.onclick = async () => {
        const cur = calMode();
        const f = HS.el('<div class="opt2">' + Object.keys(CMN).map((k) => '<label class="' + (k === cur ? 'on' : '') + '"><input type="radio" name="cm" value="' + k + '"' + (k === cur ? ' checked' : '') + '> <span><b>' + esc(CMN[k]) + '</b>' + (k === 'title' ? ' <span class="cst done">추천</span>' : '') + '<br><span class="mute">' + esc(CMX[k]) + '</span></span></label>').join('')
          + '<div class="lock" style="margin-top:10px;font-size:12px;line-height:1.75">캘린더에 넣는 순간 그 내용은 <b>구글 서버에 저장</b>됩니다 — 이 사이트의 \'명단에 든 사람만\' 보호가 캘린더에는 적용되지 않습니다. 📅 를 누를 때만 보내고, 저절로 나가는 일은 없습니다.<br>· 파일(.ics)로 넣으면 일정이 <b>비공개</b> · 하루 전 9시 알림 · 줄마다 넣는 창은 구글이 기본값(공개 범위 · 알림)을 씁니다</div></div>');
        await HS.modal('📅 구글 캘린더 설정 — 보낼 내용', f, [['취소', null], ['저장', true, 'p']], { onOk: async () => { const v = (f.querySelector('input:checked') || {}).value || 'title'; try { localStorage.setItem(CMODE, v); } catch (e) { /* 무시 */ } HS.toast('캘린더로 보낼 내용: ' + CMN[v], 'ok'); drawL(); } });
      };

      // ---------- 왼쪽: 할 일 (지시에서 나온 할 일 + 내 할 일 · 날짜별) ----------
      let showDone = false; let qk = F.dir ? 'dir' : 'mine';
      function drawL() {
        const box = cols.querySelector('.ceo-l');
        const items = [].concat.apply([], dirs.map(K)).concat(mines).filter(fitT);
        const open = items.filter((t) => !t.done); const done = items.filter((t) => t.done && (t.done_at || '').slice(0, 7) === ym).sort((a, b) => ((b.done_at || '') < (a.done_at || '') ? -1 : 1));
        const G = [['late', '⚠ 기한 지남', (t) => t.due && t.due < t0], ['today', '오늘 · ' + mdw(t0), (t) => t.due === t0], ['week', '이번 주 · ' + md(addDays(t0, 1)) + ' ~ ' + md(wk1), (t) => t.due && t.due > t0 && t.due <= wk1],
          ['later', '다음 주 이후', (t) => t.due && t.due > wk1], ['none', '기한 없음', (t) => !t.due]];
        const openDirs = dirs.filter((d) => ['done', 'hold'].indexOf(dirState(d, K(d)).k) < 0);
        const row = (t) => { const d = t.kind === 'todo' ? dirOf[t.parent_id] : null; const lt = !t.done && t.due && t.due < t0;
          return '<div class="ctd2' + (t.done ? ' dn' : '') + '" data-i="' + esc(t.id) + '"><span class="ccb2' + (t.done ? ' on' : '') + (W ? '' : ' ro') + '" data-ck="1" title="' + (t.done ? '다시 풀기' : '끝냄') + '">' + (t.done ? '✓' : '') + '</span>'
            + '<span class="t"><span class="src ' + (d ? 'ceo' : 'me') + '">' + (d ? '대표님 지시' : '내 할 일') + '</span><b class="tx" data-ed="1">' + esc(t.title) + '</b>' + (t.memo ? ' <span class="mute">· ' + esc(t.memo) + '</span>' : '')
            + (d ? '<span class="from">↳ ' + esc(d.title) + (d.rec_date ? ' · ' + md(d.rec_date) : '') + (d.src ? ' ' + esc(d.src) : '') + '</span>' : '') + '</span>'
            + '<span>' + (t.owner ? '<span class="cwho">' + esc(t.owner) + '</span>' : '') + '</span>'
            + '<span class="' + (lt ? 'neg' : t.done ? 'mute' : '') + '">' + (t.done ? md(t.done_at) + ' 끝' : t.due ? (lt ? '<b>' + md(t.due) + '</b> · ' + gap(t.due) + '일' : t.due === t0 ? '<b>' + md(t.due) + '</b>' : mdw(t.due)) : '<span class="mute">-</span>') + '</span>'
            + '<span>' + calBtn(t) + '</span></div>'; };
        box.innerHTML = '<h3>할 일 <small>' + (F.dir ? '고른 지시의 할 일만' : '지시에서 나온 할 일 + 내 할 일 · 날짜별 · 동그라미를 누르면 끝') + '</small><span class="sp"></span><button class="btn sm calb" id="calall">📅 이번 주 것 캘린더로 한꺼번에</button></h3>'
          + (W ? '<div class="cquick"><span class="seg2"><span data-qk="dir" class="' + (qk === 'dir' ? 'on' : '') + '">대표님 지시</span><span data-qk="mine" class="' + (qk === 'mine' ? 'on' : '') + '">내 할 일</span></span>'
            + (qk === 'dir' ? (openDirs.length ? '<select class="in" id="qd" style="max-width:220px">' + openDirs.map((d) => '<option value="' + esc(d.id) + '"' + (d.id === F.dir ? ' selected' : '') + '>' + esc(d.title.slice(0, 30)) + '</option>').join('') + '</select>' : '<span class="mute" style="font-size:12px">진행 중인 지시가 없습니다 → [+ 지시 등록]</span>') : '')
            + '<input class="in" id="qt" placeholder="할 일 적고 Enter" style="flex:1;min-width:160px">' + (qk === 'dir' ? '<input class="in" id="qo" placeholder="담당" list="ceo-who" style="width:100px">' : '')
            + '<input class="in" type="date" id="qu" style="width:140px"><button class="btn p" id="qa">+ 추가</button></div>' : '')
          + (open.length ? G.map(([k, l, f]) => { const L = open.filter(f).sort((a, b) => ((a.due || '9') < (b.due || '9') ? -1 : (a.due || '9') > (b.due || '9') ? 1 : 0));
              return L.length ? '<div class="cgrp ' + k + '">' + l + ' <span class="n">' + L.length + '</span></div>' + L.map(row).join('') : ''; }).join('')
            : '<div class="empty">' + (items.length ? '남은 할 일이 없습니다 👍' : '할 일이 없습니다' + (W ? ' · 위 칸에 적고 Enter' : '')) + '</div>')
          + (done.length ? '<div class="cfold" id="cfd">' + (showDone ? '▾' : '▸') + ' 끝낸 것 ' + done.length + '개 (이번 달)' + (showDone ? '' : ' — 누르면 펼침') + '</div>' + (showDone ? done.map(row).join('') : '') : '')
          + '<datalist id="ceo-who">' + ['물류관리팀'].concat(HS.cache.teams.map((t) => t.name)).map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist>';
        const all2 = [].concat.apply([], dirs.map(K)).concat(mines);
        box.querySelectorAll('.ctd2').forEach((r) => { const t = all2.find((x) => x.id === r.dataset.i); if (!t) return;
          if (W) r.querySelector('[data-ck]').onclick = () => toggle(t, t.kind === 'todo' ? dirOf[t.parent_id] : null).catch(HS.err);
          if (W) r.querySelector('[data-ed]').onclick = () => editItem(t).catch(HS.err);
          const cb = r.querySelector('[data-cal]'); if (cb) cb.onclick = () => calOne(t).catch(HS.err); });
        box.querySelector('#calall').onclick = () => calMany().catch(HS.err);
        const fd = box.querySelector('#cfd'); if (fd) fd.onclick = () => { showDone = !showDone; drawL(); };
        box.querySelectorAll('[data-qk]').forEach((e) => (e.onclick = () => { qk = e.dataset.qk; drawL(); const i = box.querySelector('#qt'); if (i) i.focus(); }));
        const qa = box.querySelector('#qa'), qt = box.querySelector('#qt');
        if (qa) { const add = async () => { const ti = qt.value.trim(); if (!ti) return HS.toast('할 일을 적어 주세요'); const due = box.querySelector('#qu').value || null;
            if (qk === 'dir') { const qd = box.querySelector('#qd'); if (!qd) return HS.toast('먼저 [+ 지시 등록] 으로 지시를 넣어 주세요'); const d = dirOf[qd.value];
              await save({ id: newId(), kind: 'todo', parent_id: d.id, title: ti, owner: (box.querySelector('#qo').value || '').trim() || null, due, done: false, sort: K(d).length + 1 }, true);
              if (d.state === '새로 받음' || d.state === '완료') await save(Object.assign({}, d, { state: '진행 중', done_at: null }), true);
            } else await save({ id: newId(), kind: 'mine', title: ti, due, done: false }, true);
            HS.toast('추가했습니다', 'ok'); HS.route(); };
          qa.onclick = () => add().catch(HS.err); qt.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) add().catch(HS.err); }; }
      }
      // ---------- 오른쪽: 대표님 지시 묶음 ----------
      function drawR() {
        const R = cols.querySelector('.ceo-r');
        const L = dirs.filter(fitD).sort((a, b) => { const r = (k) => ({ late: 0, new: 1, ing: 2, hold: 3, done: 4 })[k]; const sa = dirState(a, K(a)).k, sb = dirState(b, K(b)).k;
          return r(sa) - r(sb) || ((a.due || '9') < (b.due || '9') ? -1 : (a.due || '9') > (b.due || '9') ? 1 : 0) || ((b.rec_date || '') < (a.rec_date || '') ? -1 : 1); });
        const ch = (v, on) => '<span class="chip2 sm' + (on ? ' on' : '') + '" data-st="' + esc(v) + '">' + esc(v) + '</span>';
        R.innerHTML = '<div class="card no-tools no-no"><h3>대표님 지시 <small>누르면 그 지시의 할 일만 왼쪽에</small></h3><div class="cstf">' + ST.map((s) => ch(s, F.st.indexOf(s) >= 0)).join('') + '</div>'
          + (!dirs.length ? '<div class="empty">등록한 지시가 없습니다' + (W ? ' · 위 [+ 지시 등록]' : '') + '</div>' : !L.length ? '<div class="empty">고른 조건에 맞는 지시가 없습니다</div>'
            : L.map((d) => { const ks = K(d); const s = dirState(d, ks); const n = ks.filter((x) => x.done).length; const pr = ks.length ? Math.round((n / ks.length) * 100) : s.k === 'done' ? 100 : 0; const on = F.dir === d.id;
              return '<div class="cdir' + (on ? ' on' : '') + '" data-d="' + esc(d.id) + '"><div class="h"><b>' + esc(d.title) + '</b>' + badge(s) + '</div>'
                + '<div class="m">' + esc([mdw(d.rec_date), d.src].filter(Boolean).join(' ')) + (d.due ? ' · 기한 <b class="' + (s.k === 'late' ? 'neg' : '') + '">' + md(d.due) + '</b>' : '') + ' · <span class="cpb"><i style="width:' + pr + '%' + (s.k === 'late' ? ';background:#B4442F' : '') + '"></i></span>' + n + ' / ' + ks.length
                + ((d.teams || []).length ? ' · ' + d.teams.map((t) => '<span class="cwho">' + esc(t) + '</span>').join(' ') : '') + '</div>'
                + (on ? (d.note ? '<div class="m">' + esc(d.note) + '</div>' : '') + (d.memo ? '<div class="cmemo">📝 ' + esc(d.memo) + '</div>' : '') + (W ? '<div class="cadd"><span class="sp"></span><button class="btn sm" data-edd="1">지시 고치기</button><button class="btn sm r" data-del="1">지우기</button></div>' : '') : '') + '</div>'; }).join('')) + '</div>';
        R.querySelectorAll('[data-st]').forEach((e) => (e.onclick = () => { const v = e.dataset.st; F.st = F.st.indexOf(v) >= 0 ? F.st.filter((x) => x !== v) : F.st.concat([v]); keepF(); drawR(); }));
        R.querySelectorAll('.cdir').forEach((el) => { const d = dirOf[el.dataset.d]; if (!d) return;
          el.onclick = (e) => { if (e.target.closest('button')) return; F.dir = F.dir === d.id ? '' : d.id; if (F.dir) qk = 'dir'; keepF(); drawAll(); };
          const ed = el.querySelector('[data-edd]'); if (ed) ed.onclick = () => editDir(d).catch(HS.err);
          const dl = el.querySelector('[data-del]'); if (dl) dl.onclick = async () => { if (!(await HS.confirm('이 지시와 붙은 할 일 ' + K(d).length + '개를 지울까요?<br><b>' + esc(d.title) + '</b>'))) return; await HS.db.remove(T, { id: d.id }); if (F.dir === d.id) { F.dir = ''; keepF(); } HS.toast('지웠습니다', 'ok'); HS.route(); }; });
      }

      // ---------- 저장 · 체크 · 고치기 ----------
      async function save(row, quiet) { const r = Object.assign({}, row); ['created_at', 'updated_at'].forEach((k) => delete r[k]); await HS.db.upsert(T, [r]); if (!quiet) HS.toast('저장했습니다', 'ok'); }
      async function toggle(t, d) {
        const done = !t.done; await save(Object.assign({}, t, { done, done_at: done ? today() : null }), true);
        if (d) { // 할 일을 다 끝내면 지시도 완료 · 하나라도 다시 풀면 진행 중으로
          const ks = K(d).map((x) => (x.id === t.id ? Object.assign({}, x, { done }) : x));
          if (ks.length && ks.every((x) => x.done) && d.state !== '완료') { await save(Object.assign({}, d, { state: '완료', done_at: today() }), true); HS.toast('할 일을 다 끝내 지시가 완료됐습니다', 'ok'); }
          else if (!done && d.state === '완료') await save(Object.assign({}, d, { state: '진행 중', done_at: null }), true);
          else if (done && d.state === '새로 받음') await save(Object.assign({}, d, { state: '진행 중' }), true);
        }
        HS.route();
      }
      async function editDir(d0) {
        const d = d0 || { id: newId(), kind: 'dir', rec_date: today(), src: '월간 회의', state: '새로 받음', teams: [] };
        const teams = HS.cache.teams.map((t) => t.name);
        const f = HS.el('<div class="form ceo-form"><label class="f">받은 날<input class="in" type="date" id="cd" value="' + esc(d.rec_date || '') + '"></label>'
          + '<label class="f">받은 곳<select class="in" id="cs">' + SRC.map((s) => '<option' + (s === d.src ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></label>'
          + '<label class="f wide">지시 내용<input class="in" id="ct" value="' + esc(d.title || '') + '" placeholder="예: 런닝 품번은 반품 빼고 매장 운영"></label>'
          + '<label class="f wide">한 줄 설명 (선택)<input class="in" id="cn" value="' + esc(d.note || '') + '" placeholder="예: 정상팀 · 이월팀 같이 · 26SS런닝품번 기준"></label>'
          + '<div class="f wide"><span>관련 팀</span><div class="ctm">' + teams.map((t) => '<label><input type="checkbox" value="' + esc(t) + '"' + ((d.teams || []).indexOf(t) >= 0 ? ' checked' : '') + '> ' + esc(t) + '</label>').join('') + '</div></div>'
          + '<label class="f">기한<input class="in" type="date" id="cu" value="' + esc(d.due || '') + '"></label>'
          + '<label class="f">상태<select class="in" id="cx">' + ST.map((s) => '<option' + (s === (d.state || '새로 받음') ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></label>'
          + '<label class="f wide">메모 (선택)<textarea class="in" id="cm" rows="3">' + esc(d.memo || '') + '</textarea></label></div>');
        const q = (s) => f.querySelector(s);
        await HS.modal(d0 ? '지시 고치기' : '지시 등록', f, [['취소', null], [d0 ? '저장' : '등록', true, 'p']], { onOk: async () => {
          const title = q('#ct').value.trim(); if (!title) throw new Error('지시 내용을 적어 주세요');
          const st = q('#cx').value;
          await save(Object.assign({}, d, { title, rec_date: q('#cd').value || null, src: q('#cs').value, note: q('#cn').value.trim() || null, teams: [...f.querySelectorAll('.ctm input:checked')].map((x) => x.value), due: q('#cu').value || null, state: st, done_at: st === '완료' ? d.done_at || today() : null, memo: q('#cm').value.trim() || null }));
          F.dir = d.id; keepF(); HS.route(); // 등록한 지시를 골라 둠 → 바로 할 일을 붙이기 좋게
        } });
      }
      async function editItem(t) {
        const f = HS.el('<div class="form ceo-form"><label class="f wide">' + (t.kind === 'mine' ? '내 할 일' : '할 일') + '<input class="in" id="it" value="' + esc(t.title || '') + '"></label>'
          + (t.kind === 'todo' ? '<label class="f">담당<input class="in" id="io" value="' + esc(t.owner || '') + '" list="ceo-who"></label>' : '')
          + '<label class="f">기한<input class="in" type="date" id="iu" value="' + esc(t.due || '') + '"></label>'
          + '<label class="f wide">메모 (선택)<input class="in" id="im" value="' + esc(t.memo || '') + '"></label></div>');
        const q = (s) => f.querySelector(s);
        const v = await HS.modal('할 일 고치기', f, [['지우기', 'del', 'r'], ['취소', null], ['저장', 'ok', 'p']], { onOk: async (k) => {
          if (k === 'del') { if (!(await HS.confirm('이 할 일을 지울까요?<br><b>' + esc(t.title) + '</b>'))) return false; await HS.db.remove(T, { id: t.id }); HS.toast('지웠습니다', 'ok'); return; }
          const title = q('#it').value.trim(); if (!title) throw new Error('할 일을 적어 주세요');
          const due = q('#iu').value || null;
          await save(Object.assign({}, t, { title, owner: q('#io') ? q('#io').value.trim() || null : t.owner, due, memo: q('#im').value.trim() || null }));
          if (due !== t.due && CAL[t.id]) HS.toast('기한이 바뀌었습니다 — 구글 캘린더 일정은 저절로 안 바뀌니 캘린더에서 옮겨 주세요', '');
        } });
        if (v) HS.route();
      }
      if (W) bd.onclick = () => editDir(null).catch(HS.err);
      bx.onclick = () => HS.download('대표님지시_할일_' + today() + '.xlsx',
        [].concat.apply([], dirs.map((d) => { const s = dirState(d, K(d)); const row = { 구분: '지시', 받은날: d.rec_date || '', 받은곳: d.src || '', 내용: d.title, 설명: d.note || '', 관련팀: (d.teams || []).join(', '), 담당: '', 기한: d.due || '', 상태: s.t, 완료일: d.done_at || '', 메모: d.memo || '' };
          return [row].concat(K(d).map((t) => ({ 구분: '  └ 할 일', 받은날: '', 받은곳: '', 내용: t.title, 설명: '', 관련팀: '', 담당: t.owner || '', 기한: t.due || '', 상태: todoState(t).t, 완료일: t.done_at || '', 메모: t.memo || '' }))); }))
          .concat(mines.map((t) => ({ 구분: '내 할 일', 받은날: '', 받은곳: '', 내용: t.title, 설명: '', 관련팀: '', 담당: '', 기한: t.due || '', 상태: todoState(t).t, 완료일: t.done_at || '', 메모: t.memo || '' }))), '지시 · 할 일');
      drawAll();
      HS.live([T], () => { if (HS.cur === 'ceo' && !document.querySelector('.modal-bg')) HS.route(); });
    },
  });
})();
