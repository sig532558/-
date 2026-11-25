/* 팀장 자체 회의록 (2026-11-25 행님 지시 · 2안 '회의록 문서형' 승인)
 *  · 회의 날짜마다 한 장 — 지금 쓰시는 엑셀 회의록(01. 2026년 팀장자체 회의록.xlsx)과 같은 모양
 *  · 왼쪽 팀 목차를 누르면 그 팀으로 이동 · 그날 대표님 · 총괄 지시사항은 맨 위에 모아 보임
 *  · [새 회의 만들기] = 지난 회의에서 안 끝난 업무를 새 회의로 복사 (sql/36_tlmeet.sql · erp_tl_new_meet)
 *  · 업무 한 줄 = 팀명 · 업무 내용 · 시작일 · 종료일 · 세부 사항 · 별도 파일 · 진행 현황 · 비고 · 대표님 지시 · 총괄 지시
 *  · 별도 파일은 파일 저장소(Storage 'tlmeet' · 1GB)에 넣음 — DB 를 무겁게 하지 않음
 *    사진 · PDF 는 화면에서 바로 미리보기 · 그 밖의 파일(엑셀 · 한글 · PPT)은 받기 · 사진은 올릴 때 줄임
 *  · 권한 (DB 규칙과 같음): 보기 = 관리자 · 대표 · 업무지원팀 · 팀장
 *     쓰기 = 팀장은 자기 팀 · 업무지원팀은 '지원팀' · 누구나 '공통 · 기타' · 관리자는 전부
 *     대표님 · 총괄 지시사항 칸 · 회의 지우기 = 관리자만
 */
(function () {
  'use strict';
  const { esc, today } = HS;
  const BK = 'tlmeet'; // 파일 저장소 칸
  const MAXB = 10 * 1024 * 1024; // 파일 하나 10MB
  const ETC = '공통 · 기타', SUP = '지원팀';
  const WD = '일월화수목금토';
  const md = (d) => (d ? d.slice(5, 7) + '-' + d.slice(8, 10) : '');
  const dw = (d) => WD[new Date(d + 'T00:00:00').getDay()];
  const gap = (d) => Math.round((new Date(today() + 'T00:00:00') - new Date(d + 'T00:00:00')) / 86400000); // + 면 지난 날
  const rid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const ml = (s) => esc(s || '').replace(/\n/g, '<br>');
  const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB');
  const admin = () => HS.can('users', 'edit');
  // 이 팀 업무를 쓸 수 있나 (sql/36_tlmeet.sql 의 erp_tl_ok 와 같은 규칙)
  const canTeam = (t) => HS.can('tlmeet', 'create') && (admin() || t === ETC || (HS.me.teams || []).indexOf(t) >= 0 || (t === SUP && HS.me.role_id === 'support'));
  const teamList = (items) => {
    const L = (HS.cache.teams || []).map((t) => t.name).filter((n) => n !== '별도인원').concat([SUP, ETC]);
    (items || []).forEach((x) => { if (L.indexOf(x.team) < 0) L.splice(L.length - 1, 0, x.team); });
    return L;
  };
  // 진행 현황 — 대기 · 진행 · 완료 (저장값) + 지연 (종료일이 지났는데 완료가 아님 · 화면에서 판단)
  const stOf = (x) => {
    if (x.status === 'done') return { k: 'done', t: '완료' };
    if (x.end_d && gap(x.end_d) > 0) return { k: 'late', t: '지연 · ' + gap(x.end_d) + '일 지남' };
    if (x.status === 'wait') return { k: 'wait', t: '대기' };
    return { k: 'run', t: '진행' };
  };
  const kindOf = (f) => (/^image\//.test(f.mime || '') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name) ? 'img'
    : /pdf/.test(f.mime || '') || /\.pdf$/i.test(f.name) ? 'pdf' : 'etc');
  const extOf = (n) => { const m = /\.([A-Za-z0-9]{1,6})$/.exec(n || ''); return m ? m[1].toLowerCase() : ''; };
  const tileTxt = (f) => { const e = extOf(f.name); return /xls|csv/.test(e) ? 'XLS' : /hwp/.test(e) ? 'HWP' : /ppt/.test(e) ? 'PPT' : /doc/.test(e) ? 'DOC' : (e || 'FILE').toUpperCase().slice(0, 4); };
  const tileCls = (f) => { const t = tileTxt(f); return t === 'XLS' ? 'x' : t === 'PDF' ? 'p' : t === 'HWP' ? 'h' : t === 'PPT' ? 'k' : 'o'; };

  // ---------- 파일 저장소 ----------
  //  사진이 크면 긴 쪽 1,920 픽셀 · JPG 로 줄임 (화면 캡처 보통 0.2~0.5MB) — 줄인 게 더 크면 원본 그대로
  async function shrink(f) {
    if (!/^image\/(jpeg|png|webp|bmp)$/.test(f.type) || f.size < 450 * 1024 || !window.createImageBitmap) return f;
    try {
      const bm = await createImageBitmap(f); const s = Math.min(1, 1920 / Math.max(bm.width, bm.height));
      const c = document.createElement('canvas'); c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bm, 0, 0, c.width, c.height);
      const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
      if (!b || b.size >= f.size) return f;
      return new File([b], (f.name || '사진').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch (e) { return f; }
  }
  async function putFiles(root, list) {
    let n = 0;
    for (const raw of list) {
      const f = await shrink(raw);
      if (f.size > MAXB) { HS.toast(f.name + ' — ' + kb(f.size) + ' · 파일 하나는 10MB 까지입니다', 'err'); continue; }
      const id = rid('f'); const path = root + '/' + id + (extOf(f.name) ? '.' + extOf(f.name) : '');
      await HS.db.files.up(BK, path, f, f.type || 'application/octet-stream');
      try { await HS.db.insert('erp_tl_file', { id, root, name: f.name || '붙여넣은 사진.png', path, mime: f.type || null, size: f.size, by_name: HS.me.name }); }
      catch (e) { await HS.db.files.rm(BK, [path]).catch(() => {}); throw e; }
      n++;
    }
    return n;
  }
  async function openFile(f) {
    const k = kindOf(f);
    try {
      if (k === 'etc') { const u = await HS.db.files.url(BK, f.path, f.name); const a = document.createElement('a'); a.href = u; a.download = f.name; a.target = '_blank'; document.body.appendChild(a); a.click(); a.remove(); return; }
      const u = await HS.db.files.url(BK, f.path);
      const body = k === 'img' ? '<div class="tlv"><img src="' + esc(u) + '" alt=""></div>' : '<iframe class="tlpdf" src="' + esc(u) + '"></iframe>';
      const r = await HS.modal(f.name + ' · ' + kb(+f.size || 0), body + (k === 'pdf' ? '<div class="mute" style="margin-top:6px;font-size:12px">화면에 안 보이면 [새 창으로 열기] 를 누르세요</div>' : ''), (k === 'pdf' ? [['새 창으로 열기', 'tab']] : []).concat([['⬇ 받기', 'dl'], ['닫기', null]]), { wide: true });
      if (r === 'tab') window.open(u, '_blank', 'noopener');
      if (r === 'dl') { const d = await HS.db.files.url(BK, f.path, f.name); const a = document.createElement('a'); a.href = d; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); }
    } catch (e) { HS.err(e); }
  }

  // ---------- 화면 ----------
  HS.view('tlmeet', {
    title: '팀장 자체 회의록', perm: 'tlmeet',
    async render(body, p, tools) {
      let meets;
      try { meets = await HS.db.list('erp_tl_meet', { order: ['d', false] }); }
      catch (e) { body.innerHTML = '<div class="card"><div class="lock">DB 에 회의록 칸이 아직 없습니다 — [업데이트하기.bat] 이 SQL(36_tlmeet.sql)까지 끝났는지 확인해 주세요<br><span class="mute">' + esc(e.message) + '</span></div></div>'; return; }
      const W = HS.can('tlmeet', 'create');
      const cur = meets.find((m) => m.id === p.m) || meets[0];
      const go = (id) => HS.go('tlmeet', { m: id });
      // 위 도구: ‹ 앞 회의 · 회의 고르기 · 다음 회의 › · 인쇄 · 엑셀 · 새 회의
      if (cur) {
        const i = meets.indexOf(cur); const older = meets[i + 1], newer = meets[i - 1];
        const bp = HS.el('<button class="btn sm" title="앞 회의"' + (older ? '' : ' disabled') + '>‹ ' + (older ? md(older.d) : '') + '</button>');
        const sel = HS.el('<select class="in tlsel">' + meets.map((m) => '<option value="' + esc(m.id) + '"' + (m === cur ? ' selected' : '') + '>' + esc(m.d + ' (' + dw(m.d) + ') ' + (m.title || '')) + '</option>').join('') + '</select>');
        const bn = HS.el('<button class="btn sm" title="다음 회의"' + (newer ? '' : ' disabled') + '>' + (newer ? md(newer.d) : '') + ' ›</button>');
        if (older) bp.onclick = () => go(older.id); if (newer) bn.onclick = () => go(newer.id); sel.onchange = () => go(sel.value);
        tools.appendChild(bp); tools.appendChild(sel); tools.appendChild(bn);
        const pr = HS.el('<button class="btn">🖨 인쇄</button>'); pr.onclick = () => window.print(); tools.appendChild(pr);
        const xl = HS.el('<button class="btn gd">⬇ 엑셀 받기</button>'); tools.appendChild(xl); xl.onclick = () => toXlsx().catch(HS.err);
      }
      if (W) { const nb = HS.el('<button class="btn p">＋ 새 회의 만들기</button>'); nb.onclick = () => newMeet(meets); tools.appendChild(nb); }
      if (!cur) {
        body.innerHTML = '<div class="card empty" style="line-height:1.9">아직 만든 회의가 없습니다.<br>' + (W ? '위의 <b>[＋ 새 회의 만들기]</b> 를 눌러 첫 회의를 시작하세요. 다음 회의부터는 안 끝난 업무가 자동으로 넘어옵니다.' : '팀장이 첫 회의를 만들면 여기에 보입니다.') + '</div>';
        return;
      }

      const items = await HS.db.list('erp_tl_item', { eq: { meet_id: cur.id } });
      const roots = Array.from(new Set(items.map((x) => x.root)));
      const files = roots.length ? await HS.db.list('erp_tl_file', { in: { root: roots } }).catch(() => []) : [];
      const FB = {}; files.sort((a, b) => (a.at < b.at ? -1 : 1)).forEach((f) => (FB[f.root] || (FB[f.root] = [])).push(f));
      const TEAMS = teamList(items);
      const byTeam = {}; TEAMS.forEach((t) => (byTeam[t] = [])); items.forEach((x) => byTeam[x.team].push(x));
      TEAMS.forEach((t) => byTeam[t].sort((a, b) => (a.sort || 0) - (b.sort || 0) || (a.created_at < b.created_at ? -1 : 1)));
      const isLatest = cur === meets[0];

      // ---- 지시사항 모아 보기 (이번 회의에 적은 것 먼저 · 이어온 지시는 날짜 표시) ----
      const dirs = (key, kd) => items.filter((x) => (x[key] || '').trim()).map((x) => ({ x, d: x[kd] || cur.d, me: (x[kd] || cur.d) === cur.d }))
        .sort((a, b) => (b.me - a.me) || TEAMS.indexOf(a.x.team) - TEAMS.indexOf(b.x.team) || (a.d < b.d ? 1 : -1));
      const dirBox = (cls, ico, ttl, list, key) => '<div class="tld ' + cls + '"><b>' + ico + ' ' + ttl + '</b>'
        + (list.length ? '<ol>' + list.map((o) => '<li data-go="' + esc(o.x.id) + '">' + ml(o.x[key]) + ' <span class="tlt">— ' + esc(o.x.team) + (o.me ? '' : ' · ' + md(o.d) + ' 지시') + '</span></li>').join('') + '</ol>'
          : '<div class="mute" style="margin-top:4px">이번 회의에 적힌 지시사항이 없습니다</div>') + '</div>';
      const cnt = { all: items.length, run: 0, done: 0, late: 0, wait: 0 }; items.forEach((x) => cnt[stOf(x).k]++);

      // ---- 업무 한 줄 ----
      const thumbs = (x, canW) => (FB[x.root] || []).map((f) => { const k = kindOf(f);
        return '<div class="tlf" data-f="' + esc(f.id) + '" title="' + esc(f.name + ' · ' + kb(+f.size || 0)) + '">' + (k === 'img' ? '<div class="im" data-img="' + esc(f.path) + '"></div>' : '<div class="im t-' + (k === 'pdf' ? 'p' : tileCls(f)) + '">' + (k === 'pdf' ? 'PDF' : tileTxt(f)) + '</div>')
          + '<div class="nm">' + esc(f.name) + '</div>' + (canW ? '<button class="fx" data-fx="' + esc(f.id) + '" title="파일 지우기">×</button>' : '') + '</div>'; }).join('');
      const row = (x, i, list) => {
        const st = stOf(x); const cw = canTeam(x.team);
        const pct = x.status === 'done' ? 100 : Math.max(0, Math.min(100, +x.pct || 0));
        const per = x.start_d || x.end_d ? '<span class="nw">' + (x.start_d ? md(x.start_d) : '') + ' ~ ' + (x.end_d ? md(x.end_d) : '') + '</span>' : '<span class="mute">-</span>';
        return '<tr id="tli-' + esc(x.id) + '" class="st-' + st.k + '"><td class="no">' + (i + 1) + '</td>'
          + '<td class="ct"><div class="tti">' + esc(x.title) + '</div>' + (x.detail ? '<div class="tdt">' + ml(x.detail) + '</div>' : '')
          + (x.ceo ? '<div class="tdd c">👑 <b>대표님</b> ' + ml(x.ceo) + (x.ceo_d && x.ceo_d !== cur.d ? ' <span class="tlt">(' + md(x.ceo_d) + ')</span>' : '') + '</div>' : '')
          + (x.gm ? '<div class="tdd g">📋 <b>총괄</b> ' + ml(x.gm) + (x.gm_d && x.gm_d !== cur.d ? ' <span class="tlt">(' + md(x.gm_d) + ')</span>' : '') + '</div>' : '')
          + ((FB[x.root] || []).length ? '<div class="tlfs">' + thumbs(x, cw) + '</div>' : '') + '</td>'
          + '<td>' + per + '</td>'
          + '<td><span class="tls ' + st.k + '">' + esc(st.t) + '</span>' + (st.k !== 'done' ? '<div class="bar tlb"><i style="width:' + pct + '%"></i></div><span class="mute">' + pct + '%</span>' : '') + '</td>'
          + '<td class="nt">' + ml(x.note) + (x.carried ? '<div class="tlt">이어온 업무</div>' : '') + '</td>'
          + '<td class="ac noprint">' + (cw ? '<button class="btn sm" data-ed="' + esc(x.id) + '" title="고치기 · 파일 올리기">✎</button>'
            + (i > 0 ? '<button class="btn sm" data-up="' + esc(x.id) + '" title="위로">▲</button>' : '') + (i < list.length - 1 ? '<button class="btn sm" data-dn="' + esc(x.id) + '" title="아래로">▼</button>' : '')
            + '<button class="btn sm r" data-rm="' + esc(x.id) + '" title="지우기">🗑</button>' : '') + '</td></tr>';
      };
      const shown = TEAMS.filter((t) => byTeam[t].length || canTeam(t));
      const sect = (t, n) => { const L = byTeam[t];
        return '<div class="card tlsec" id="tlt-' + n + '"><h3><span class="tln">' + (n + 1) + '.</span> ' + esc(t) + ' <small>' + L.length + '건</small><span style="flex:1"></span>'
          + (canTeam(t) ? '<button class="btn sm noprint" data-add="' + esc(t) + '">＋ 업무 추가</button>' : '') + '</h3>'
          + (L.length ? '<table class="tlx no-no"><thead><tr><th style="width:30px">No</th><th>업무 내용 · 세부 사항</th><th style="width:96px">기간</th><th style="width:120px">진행 현황</th><th style="width:170px">비고</th><th class="noprint" style="width:120px"></th></tr></thead><tbody>'
            + L.map((x, i) => row(x, i, L)).join('') + '</tbody></table>' : '<div class="mute tle">이번 회의에 적힌 업무가 없습니다</div>') + '</div>'; };

      body.innerHTML = '<div class="tlm">'
        + '<div class="tltoc noprint"><div class="card"><div class="mute" style="font-size:11.5px;padding:0 14px 6px">팀 목차</div>'
        + shown.map((t, n) => { const L = byTeam[t]; const lt = L.filter((x) => stOf(x).k === 'late').length;
          return '<a data-toc="' + n + '">' + esc(t) + '<span class="' + (lt ? 'neg' : 'mute') + '">' + (lt ? '지연 ' + lt + ' · ' : '') + L.length + '</span></a>'; }).join('')
        + '<div class="mute" style="font-size:11px;padding:8px 14px 0;line-height:1.6">' + (W ? '업무 쓰기는 자기 팀만 · 지시사항은 관리자만' : '보기만 됩니다') + '</div></div></div>'
        + '<div class="tlmain">'
        + '<div class="ptitle tlpt">혜성물류 팀장 자체 회의록 — ' + esc(cur.d + ' (' + dw(cur.d) + ') ' + (cur.title || '')) + '</div>'
        + (isLatest ? '' : '<div class="lock noprint" style="margin-bottom:12px">📁 지난 회의입니다 — 여기서 고친 내용은 그 뒤 회의에는 넘어가지 않습니다 <button class="btn sm" id="tlnew">최신 회의(' + esc(md(meets[0].d)) + ')로 ›</button></div>')
        + '<div class="card tlhd"><div class="tlh1"><b>' + esc(cur.d + ' (' + dw(cur.d) + ')') + '</b> ' + esc(cur.title || '') + (W ? ' <button class="btn sm noprint" id="tlrn" title="회의 이름 바꾸기">✎</button>' : '')
        + '<span style="flex:1"></span><span class="mute">업무 ' + cnt.all + '건 · 진행 ' + cnt.run + ' · 완료 ' + cnt.done + ' · <span class="' + (cnt.late ? 'neg' : '') + '">지연 ' + cnt.late + '</span> · 대기 ' + cnt.wait + '</span>'
        + (admin() ? ' <button class="btn sm r noprint" id="tldel" title="회의 지우기 (관리자)">회의 지우기</button>' : '') + '</div>'
        + '<div class="tldg">' + dirBox('c', '👑', '대표님 지시사항', dirs('ceo', 'ceo_d'), 'ceo') + dirBox('g', '📋', '총괄 지시사항', dirs('gm', 'gm_d'), 'gm') + '</div></div>'
        + shown.map((t, n) => sect(t, n)).join('')
        + '</div></div>';

      // ---- 이미지 미리보기는 그린 뒤에 주소를 받아 채움 (1시간짜리 임시 주소) ----
      const imgs = Array.from(body.querySelectorAll('[data-img]'));
      if (imgs.length) HS.db.files.urls(BK, imgs.map((e) => e.dataset.img)).then((U) => imgs.forEach((e) => { const u = U[e.dataset.img]; if (u) e.style.backgroundImage = 'url("' + u.replace(/"/g, '%22') + '")'; else e.textContent = '?'; })).catch(() => imgs.forEach((e) => (e.textContent = '?')));

      // ---- 눌렀을 때 ----
      const byId = Object.fromEntries(items.map((x) => [x.id, x])); const fById = Object.fromEntries(files.map((f) => [f.id, f]));
      const flash = (el) => { if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('tlhi'); setTimeout(() => el.classList.remove('tlhi'), 1800); };
      body.querySelectorAll('[data-toc]').forEach((a) => (a.onclick = () => { const s = body.querySelector('#tlt-' + a.dataset.toc); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); body.querySelectorAll('[data-toc]').forEach((b) => b.classList.toggle('on', b === a)); }));
      body.querySelectorAll('[data-go]').forEach((li) => (li.onclick = () => flash(body.querySelector('#tli-' + CSS.escape(li.dataset.go)))));
      const nw = body.querySelector('#tlnew'); if (nw) nw.onclick = () => go(meets[0].id);
      const rn = body.querySelector('#tlrn'); if (rn) rn.onclick = async () => {
        const f = HS.el('<div class="form"><label class="f wide">회의 이름<input class="in" id="mt" value="' + esc(cur.title || '') + '"></label></div>');
        const ok = await HS.modal('회의 이름 바꾸기 · ' + cur.d, f, [['취소', null], ['저장', true, 'p']]);
        if (!ok) return; try { await HS.db.update('erp_tl_meet', { id: cur.id }, { title: f.querySelector('#mt').value.trim() || '주간 팀장 회의' }); HS.route(); } catch (e) { HS.err(e); } };
      const dl = body.querySelector('#tldel'); if (dl) dl.onclick = async () => {
        const nCar = items.filter((x) => x.carried).length;
        if (!(await HS.confirm('<b>' + esc(cur.d + ' ' + (cur.title || '')) + '</b> 회의를 지웁니다.<br>· 이 회의의 업무 <b>' + items.length + '건</b>이 같이 지워지고 되돌릴 수 없습니다.<br>· 다음 회의로 이어진 업무와 그 파일은 그대로 남습니다.' + (nCar ? '<br>· 이 회의에는 지난 회의에서 넘어온 업무가 ' + nCar + '건 있습니다 (지난 회의 쪽은 그대로).' : '')))) return;
        try { const paths = await HS.db.rpc('erp_tl_del_meet', { p_id: cur.id }); if (paths && paths.length) await HS.db.files.rm(BK, paths).catch(() => {}); HS.toast('회의를 지웠습니다', 'ok'); HS.go('tlmeet', {}); } catch (e) { HS.err(e); } };
      body.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => editItem(null, b.dataset.add)));
      body.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => editItem(byId[b.dataset.ed])));
      body.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => {
        const x = byId[b.dataset.rm]; const nf = (FB[x.root] || []).length;
        if (!(await HS.confirm('<b>' + esc(x.team) + ' · ' + esc(x.title) + '</b> 업무를 이 회의에서 지웁니다.' + (x.carried ? '<br>· 지난 회의에 있는 같은 업무는 그대로 남습니다.' : '') + (nf ? '<br>· 붙은 파일 ' + nf + '개는 다른 회의에 이 업무가 없으면 같이 지워집니다.' : '')))) return;
        try { const paths = await HS.db.rpc('erp_tl_del_item', { p_id: x.id }); if (paths && paths.length) await HS.db.files.rm(BK, paths).catch(() => {}); HS.toast('지웠습니다', 'ok'); HS.route(); } catch (e) { HS.err(e); } }));
      const move = async (id, dir) => {
        const x = byId[id]; const L = byTeam[x.team]; const i = L.indexOf(x); const y = L[i + dir]; if (!y) return;
        try { // 순서 번호를 줄 순서대로 다시 매기고 두 줄을 바꿈
          const ord = L.slice(); ord[i] = y; ord[i + dir] = x;
          for (let k = 0; k < ord.length; k++) if ((ord[k].sort || 0) !== k + 1) await HS.db.update('erp_tl_item', { id: ord[k].id }, { sort: k + 1 });
          HS.route();
        } catch (e) { HS.err(e); } };
      body.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => move(b.dataset.up, -1)));
      body.querySelectorAll('[data-dn]').forEach((b) => (b.onclick = () => move(b.dataset.dn, 1)));
      body.querySelectorAll('.tlf').forEach((el) => (el.onclick = (ev) => { if (ev.target.closest('[data-fx]')) return; const f = fById[el.dataset.f]; if (f) openFile(f); }));
      body.querySelectorAll('[data-fx]').forEach((b) => (b.onclick = async (ev) => {
        ev.stopPropagation(); const f = fById[b.dataset.fx]; if (!f) return;
        if (!(await HS.confirm('파일 <b>' + esc(f.name) + '</b> 을(를) 지웁니다. 이 업무가 이어진 다른 회의에서도 안 보이게 됩니다.'))) return;
        try { await HS.db.remove('erp_tl_file', { id: f.id }); await HS.db.files.rm(BK, [f.path]).catch(() => {}); HS.toast('파일을 지웠습니다', 'ok'); HS.route(); } catch (e) { HS.err(e); } }));
      // 회의 중 다른 팀장이 고치면 저절로 새로 고침 (고치는 창이 열려 있으면 닫힐 때까지 기다림)
      HS.live(['erp_tl_item', 'erp_tl_file', 'erp_tl_meet'], () => { if (!document.querySelector('.modal-bg') && HS.cur === 'tlmeet') HS.route(); });

      // ---------- 업무 쓰기 · 고치기 ----------
      async function editItem(x, team0) {
        const isNew = !x; const A = admin();
        const myTeams = TEAMS.filter((t) => canTeam(t)); const team = x ? x.team : team0 || myTeams[0];
        const pend = []; const ex = x ? (FB[x.root] || []) : [];
        const f = HS.el('<div class="form tlform">'
          + '<label class="f">팀<select class="in" id="it"' + (isNew ? '' : ' disabled') + '>' + (isNew ? myTeams : [team]).map((t) => '<option' + (t === team ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></label>'
          + '<label class="f">시작일<input class="in" type="date" id="is" value="' + esc((x && x.start_d) || (isNew ? cur.d : '')) + '"></label>'
          + '<label class="f">종료일<input class="in" type="date" id="ie" value="' + esc((x && x.end_d) || '') + '"></label>'
          + '<label class="f">진행 현황<select class="in" id="ist">' + [['wait', '대기'], ['run', '진행'], ['done', '완료']].map(([v, l]) => '<option value="' + v + '"' + (((x && x.status) || 'run') === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>'
          + '<label class="f">진행률 (%)<input class="in" type="number" min="0" max="100" step="5" id="ip" value="' + esc(x ? (x.status === 'done' ? 100 : +x.pct || 0) : 0) + '"></label>'
          + '<label class="f wide">업무 내용<input class="in" id="iti" value="' + esc((x && x.title) || '') + '" placeholder="예: 27년 초두 입고 · 출고 [세인트 · 바니]"></label>'
          + '<label class="f wide">세부 사항<textarea class="in" id="idt" rows="4" placeholder="예: · 세인트 11/16 입고 시작, 1차 18,400장 검수 완료&#10;· 바니 11/27 1차 입고 예정 — 입고 인원 2명 추가 필요">' + esc((x && x.detail) || '') + '</textarea></label>'
          + '<label class="f wide">비고<input class="in" id="int" value="' + esc((x && x.note) || '') + '"></label>'
          + '<label class="f wide tlc">👑 대표님 지시사항' + (A ? '' : ' <em>— 관리자만 씁니다</em>') + '<textarea class="in" id="ic" rows="2"' + (A ? '' : ' disabled') + '>' + esc((x && x.ceo) || '') + '</textarea></label>'
          + '<label class="f wide tlg">📋 총괄 지시사항' + (A ? '' : ' <em>— 관리자만 씁니다</em>') + '<textarea class="in" id="ig" rows="2"' + (A ? '' : ' disabled') + '>' + esc((x && x.gm) || '') + '</textarea></label>'
          + '<div class="f wide"><span>별도 파일 <em class="mute">— 사진 · PDF 는 화면에서 바로 보임 · 엑셀 · 한글 · PPT 는 받기 · 파일 하나 10MB 까지 · 사진은 자동으로 줄여서 올림</em></span>'
          + '<div class="tldrop" id="idrop">여기로 파일을 끌어다 놓거나 <b>[파일 고르기]</b> · 화면 캡처는 <b>Ctrl+V</b> 로 붙여 넣기 <button type="button" class="btn sm" id="ipick">📎 파일 고르기</button><input type="file" id="ifile" multiple hidden></div>'
          + '<div class="tlpend" id="ipend">' + ex.map((g) => '<span class="pf old">📎 ' + esc(g.name) + ' <i class="mute">' + kb(+g.size || 0) + '</i></span>').join('') + '</div></div>'
          + '</div>');
        const $ = (s) => f.querySelector(s);
        const drawPend = () => { $('#ipend').innerHTML = ex.map((g) => '<span class="pf old">📎 ' + esc(g.name) + ' <i class="mute">' + kb(+g.size || 0) + '</i></span>').join('') + pend.map((g, i) => '<span class="pf new">＋ ' + esc(g.name) + ' <i class="mute">' + kb(g.size) + '</i> <a data-pi="' + i + '">×</a></span>').join('');
          $('#ipend').querySelectorAll('[data-pi]').forEach((a) => (a.onclick = () => { pend.splice(+a.dataset.pi, 1); drawPend(); })); };
        const addF = (list) => { Array.from(list || []).forEach((g, i) => { if (!g.name || /^image\.(png|jpe?g)$/i.test(g.name)) g = new File([g], '붙여넣은 사진 ' + (pend.length + i + 1) + '.' + ((g.type || '').split('/')[1] || 'png'), { type: g.type }); pend.push(g); }); drawPend(); };
        $('#ipick').onclick = () => $('#ifile').click(); $('#ifile').onchange = () => { addF($('#ifile').files); $('#ifile').value = ''; };
        const dz = $('#idrop'); dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('on'); }; dz.ondragleave = () => dz.classList.remove('on');
        dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('on'); addF(e.dataTransfer.files); };
        $('#ist').onchange = () => { if ($('#ist').value === 'done') $('#ip').value = 100; };
        $('#ip').onchange = () => { if (+$('#ip').value >= 100) $('#ist').value = 'done'; };
        const onPaste = (e) => { const fs = Array.from((e.clipboardData && e.clipboardData.files) || []); if (fs.length) { e.preventDefault(); addF(fs); } };
        const r = await HS.modal((isNew ? '업무 추가' : '업무 고치기') + ' · ' + cur.d + ' 회의', f, [['취소', null], ['저장', true, 'p']], {
          wide: true,
          onOpen: (bg) => { bg.addEventListener('paste', onPaste); setTimeout(() => $('#iti').focus(), 30); },
          onOk: async () => {
            const tm = isNew ? $('#it').value : x.team; const ti = $('#iti').value.trim();
            if (!tm) throw new Error('쓸 수 있는 팀이 없습니다');
            if (!ti) { HS.toast('업무 내용을 넣어 주세요', 'err'); $('#iti').focus(); return false; }
            const s = $('#is').value || null, e2 = $('#ie').value || null;
            if (s && e2 && s > e2) { HS.toast('종료일이 시작일보다 앞입니다', 'err'); return false; }
            const st = $('#ist').value; const pc = st === 'done' ? 100 : Math.max(0, Math.min(100, Math.round(+$('#ip').value || 0)));
            const rowv = { title: ti, start_d: s, end_d: e2, status: st, pct: pc, detail: $('#idt').value.trim() || null, note: $('#int').value.trim() || null };
            if (A) { rowv.ceo = $('#ic').value.trim() || null; rowv.gm = $('#ig').value.trim() || null; }
            let root;
            if (isNew) { const id = rid('t'); root = id; const L = byTeam[tm] || [];
              await HS.db.insert('erp_tl_item', Object.assign({ id, meet_id: cur.id, root: id, team: tm, sort: L.reduce((m, y) => Math.max(m, y.sort || 0), 0) + 1 }, rowv)); }
            else { root = x.root; await HS.db.update('erp_tl_item', { id: x.id }, rowv); }
            if (pend.length) { try { const n = await putFiles(root, pend); if (n) HS.toast('파일 ' + n + '개를 올렸습니다', 'ok'); } catch (e) { HS.err(e); HS.toast('업무는 저장됐고 파일 올리기만 실패했습니다 — 다시 ✎ 눌러 올려 주세요', 'err'); } }
            return true;
          },
        });
        if (r) HS.route();
      }

      // ---------- 엑셀 받기 (지금 회의록 엑셀처럼 한 장) ----------
      async function toXlsx() {
        await HS.xlsx();
        const H = ['팀', 'No', '업무 내용', '시작일', '종료일', '진행 현황', '진행률(%)', '세부 사항', '비고', '대표님 지시사항', '총괄 지시사항', '별도 파일'];
        const A = [['혜성물류 팀장 자체 회의록'], [cur.d + ' (' + dw(cur.d) + ') ' + (cur.title || '')], [], H];
        TEAMS.forEach((t) => byTeam[t].forEach((x, i) => { const st = stOf(x);
          A.push([i ? '' : t, i + 1, x.title, x.start_d || '', x.end_d || '', st.t + (x.carried ? ' (이어온 업무)' : ''), x.status === 'done' ? 100 : +x.pct || 0, x.detail || '', x.note || '',
            (x.ceo || '') + (x.ceo && x.ceo_d && x.ceo_d !== cur.d ? ' (' + x.ceo_d + ')' : ''), (x.gm || '') + (x.gm && x.gm_d && x.gm_d !== cur.d ? ' (' + x.gm_d + ')' : ''), (FB[x.root] || []).map((g) => g.name).join(', ')]); }));
        const ws = XLSX.utils.aoa_to_sheet(A);
        ws['!cols'] = [12, 5, 36, 11, 11, 16, 9, 50, 24, 34, 34, 28].map((w) => ({ wch: w }));
        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } }];
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, cur.d);
        XLSX.writeFile(wb, '팀장회의록_' + cur.d + '.xlsx');
      }
    },
  });

  // ---------- 새 회의 만들기 ----------
  async function newMeet(meets) {
    const last = meets[0];
    const f = HS.el('<div class="form"><label class="f">회의 날짜<input class="in" type="date" id="md" value="' + esc(today()) + '"></label>'
      + '<label class="f">회의 이름<input class="in" id="mt" value="주간 팀장 회의"></label>'
      + '<div class="f wide mute" style="line-height:1.7;white-space:normal">' + (last ? '바로 앞 회의(<b>' + esc(last.d) + '</b>)에서 <b>완료가 아닌 업무</b>가 진행률 · 세부 사항 · 지시사항 · 파일과 함께 새 회의로 넘어옵니다.<br>같은 날짜 회의가 이미 있으면 그 회의를 엽니다.' : '첫 회의입니다 — 빈 회의록이 만들어집니다.') + '</div></div>');
    const r = await HS.modal('새 회의 만들기', f, [['취소', null], ['만들기', true, 'p']], {
      onOk: async () => {
        const d = f.querySelector('#md').value; if (!d) { HS.toast('회의 날짜를 넣어 주세요', 'err'); return false; }
        const j = await HS.db.rpc('erp_tl_new_meet', { p_d: d, p_title: f.querySelector('#mt').value.trim() });
        const o = typeof j === 'string' ? JSON.parse(j) : j;
        HS.toast(o.existed ? d + ' 회의가 이미 있어 그 회의를 엽니다' : (o.from ? o.from + ' 회의에서 안 끝난 업무 ' + (+o.carried || 0) + '건을 가져왔습니다' : '새 회의를 만들었습니다'), 'ok');
        HS.go('tlmeet', { m: o.id }); return true;
      },
    });
    return r;
  }
})();
