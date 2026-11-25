/* 혜성물류 운영 ERP — 재고 실사
 *  ① 실사 등록 ② 전산 재고(WMS 재고 · 미래 발생분) ③ 실사 자료(조별) ④ 차이 확인 · 재실사 ⑤ 확정 · 차이 현황 엑셀
 *  대시보드: 브랜드 · 년도 · 시즌 · 복종(이너·JK·ACC) — 공통 그리드(피벗) 설정 · 필터 · 저장 보기
 */
(function () {
  'use strict';
  const { esc, fmt, today } = HS;
  const C = window.HSCount;
  const CACHE = {}; // id → { at, data, res }
  const pct = (v, d) => (v == null || !isFinite(v) ? '-' : v.toFixed(d == null ? 1 : d) + '%');
  const sg = (v) => (v > 0 ? '+' : '') + fmt(v);
  const dcls = (v) => (v < 0 ? 'neg' : v > 0 ? 'pos' : '');
  const TYPE_TAG = { 부족: 'r', 과잉: 'g', '위치 상이': 'b', 미등록: 'k', 일치: '' };
  const CMP_L = { cur: '현재고', acc: '누적재고', loc: '구역별 지정' };
  const LOSS_L = { excl: '로스 제외', incl: '로스 포함' };
  const brandOf = (x) => { if (!x) return null; const b = HS.brandOf(x); return b && !/^CODE:/.test(b) ? b : null; };
  const BN = (b) => HS.bname(b) || b;

  async function loadAll(cnt, force) {
    const c = CACHE[cnt.id];
    if (c && !force && c.stamp === cnt.updated_at) return c;
    const parts = await HS.db.list('erp_cnt_part', { eq: { cnt_id: cnt.id } });
    const data = { sys: [], fut: [], act: [], re: [] }; const files = { sys: {}, fut: {}, act: {}, re: {} };
    // 같은 파일을 다시 올렸을 때 이전 묶음이 남아 있어도 최신 업로드 묶음만 사용
    const latest = {}; parts.forEach((p) => { const k = p.kind + '|' + p.file; if (!latest[k] || String(p.uploaded_at) > latest[k]) latest[k] = String(p.uploaded_at); });
    parts.filter((p) => String(p.uploaded_at) === latest[p.kind + '|' + p.file]).sort((a, b) => a.part - b.part).forEach((p) => {
      const f = files[p.kind][p.file] || (files[p.kind][p.file] = { file: p.file, at: p.uploaded_at, by: p.uploaded_by, meta: p.meta || {}, rows: [] });
      f.rows.push(...(p.rows || []));
    });
    data.sys = Object.values(files.sys).flatMap((f) => f.rows); data.fut = Object.values(files.fut).flatMap((f) => f.rows);
    data.act = Object.values(files.act).map((f) => ({ file: f.file, at: f.at, crew: f.meta.crew || '', rows: f.rows }));
    data.re = Object.values(files.re).map((f) => ({ file: f.file, at: f.at, rows: f.rows }));
    const res = C.compute(data, Object.assign({}, cnt.opts, { zones_done: cnt.zones_done || [], base_year: +(cnt.start_date || today()).slice(0, 4) }), brandOf);
    return (CACHE[cnt.id] = { stamp: cnt.updated_at, files, data, res });
  }
  async function saveSummary(cnt, res) { // 목록·대시보드 요약 (권한 없으면 건너뜀)
    if (!(HS.can('count', 'create') || HS.can('count', 'edit') || HS.can('count', 'close'))) return;
    try { const r = await HS.db.update('erp_cnt', { id: cnt.id }, { summary: C.summary(res) }); if (r && r[0]) { cnt.updated_at = r[0].updated_at; if (CACHE[cnt.id]) CACHE[cnt.id].stamp = cnt.updated_at; } } catch (e) { /* 무시 */ }
  }
  async function putFile(cnt, kind, file, parsed, extra) {
    await HS.db.remove('erp_cnt_part', { cnt_id: cnt.id, kind, file }).catch(() => {});
    const parts = C.chunk(parsed.rows); const at = new Date().toISOString();
    for (let i = 0; i < parts.length; i++) await HS.db.upsert('erp_cnt_part', [{ cnt_id: cnt.id, kind, file, part: i, meta: Object.assign({}, parsed.meta, extra || {}), rows: parts[i], uploaded_by: HS.me.id, uploaded_at: at }]);
  }
  const readRows = async (f) => { HS.needXlsx(); const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array', cellFormula: false, cellHTML: false, cellText: false }); return wb.SheetNames.map((n) => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) })); };
  function dropBox(title, sub, onFiles) {
    const dz = HS.el('<div class="drop" style="padding:16px"><b>' + title + '</b><div class="mute" style="font-size:11.5px;margin-top:4px;line-height:1.6">' + sub + '</div><input type="file" multiple accept=".xlsx,.xlsm,.xls,.csv" class="hide"><div class="res" style="margin-top:6px;font-size:12.5px;text-align:left"></div></div>');
    const fi = dz.querySelector('input');
    dz.onclick = (e) => { if (e.target !== fi) fi.click(); };
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
    const go = async (files) => { const r = dz.querySelector('.res'); r.innerHTML = '<span class="mute">읽는 중…</span>'; await new Promise((x) => setTimeout(x, 30)); try { r.innerHTML = await onFiles(files); } catch (e) { r.innerHTML = '<span class="neg">' + esc(e.message) + '</span>'; HS.err(e); } };
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); go([...e.dataTransfer.files]); };
    fi.onchange = () => { go([...fi.files]); fi.value = ''; };
    return dz;
  }
  const steps = (cnt, d, cur) => {
    const has = (k) => Object.keys(d.files[k]).length > 0;
    const st = [['setup', '① 실사 등록', true], ['setup', '② 전산 재고', has('sys')], ['setup', '③ 실사 자료', has('act')], ['diff', '④ 차이 확인 · 재실사', d.res.kpi.n_re > 0 || (has('act') && d.res.kpi.n_recount === 0)], ['diff', '⑤ 확정 · 다운로드', cnt.status === '확정']];
    const w = HS.el('<div class="steps"></div>');
    const next = st.findIndex((x) => !x[2]);
    st.forEach(([k, l, done], i) => { const b = HS.el('<button class="' + (done ? 'done' : '') + (i === next && k === cur ? ' on' : '') + '">' + l + (done ? ' ✔' : '') + '</button>'); b.onclick = () => HS.go('count', { id: cnt.id, s: k }); w.appendChild(b); });
    return w;
  };

  HS.view('count', {
    title: '재고 실사', perm: 'count',
    async render(body, p, tools) {
      body.innerHTML = '';
      const list = await HS.db.list('erp_cnt', { select: 'id,name,center_id,scope,start_date,end_date,opts,zones_done,status,summary,created_at,updated_at,deleted_at,deleted_name', order: ['start_date', false] });
      if (!p.id) return listView(body, list.filter((x) => !x.deleted_at), tools, list.filter((x) => x.deleted_at));
      const cnt = list.find((x) => x.id === p.id && !x.deleted_at); if (!cnt) { body.innerHTML = '<div class="empty">실사를 찾을 수 없습니다</div>'; return; }
      tools.appendChild(HS.el('<span class="chip dk">' + esc(cnt.name) + '</span>'));
      tools.appendChild(HS.el('<span class="chip">' + esc([(HS.cache.centers.find((c) => c.id === cnt.center_id) || {}).name, cnt.scope].filter(Boolean).join(' · ')) + '</span>'));
      tools.appendChild(HS.el('<span class="chip">' + esc((cnt.start_date || '') + (cnt.end_date && cnt.end_date !== cnt.start_date ? ' ~ ' + cnt.end_date.slice(5) : '')) + '</span>'));
      if (cnt.status === '확정') tools.appendChild(HS.el('<span class="tag g">확정</span>'));
      const s = p.s || (cnt.summary && cnt.summary.kpi && cnt.summary.kpi.act_total ? 'diff' : 'setup');
      tools.appendChild(HS.seg([['setup', '등록 · 업로드'], ['diff', '차이 현황'], ['dash', '대시보드']], s, (k) => HS.go('count', { id: cnt.id, s: k })));
      const back = HS.el('<button class="btn">← 실사 목록</button>'); back.onclick = () => HS.go('count', {}); tools.appendChild(back);
      body.innerHTML = '<div class="empty">실사 자료 계산 중… (5만 줄 기준 2~3초)</div>';
      await new Promise((x) => setTimeout(x, 20));
      const d = await loadAll(cnt, p.r === '1');
      body.innerHTML = '';
      if (s !== 'dash') body.appendChild(steps(cnt, d, s));
      if (s === 'setup') return setupView(body, cnt, d);
      if (s === 'diff') return diffView(body, cnt, d);
      return dashView(body, cnt, d);
    },
  });

  // ================= 실사 목록 =================
  function listView(body, list, tools, trash) {
    const canDel = HS.can('count', 'delete'), isAdm = HS.can('count', 'close');
    if (HS.can('count', 'create')) { const b = HS.el('<button class="btn p">+ 새 실사</button>'); b.onclick = () => editCount(null); tools.appendChild(b); }
    const c = HS.el('<div class="card"><h3>재고 실사 <small>정기 · 수시 실사 · 전산 재고와 실사 수량 비교 · 차이 현황 엑셀</small></h3><div class="tw"></div></div>');
    c.querySelector('.tw').innerHTML = list.length ? '<table><thead><tr><th>실사</th><th>센터 · 범위</th><th>일자</th><th>비교</th><th class="n">비교 수량</th><th class="n">실사 수량</th><th class="n">차이</th><th class="n">정확도(SKU)</th><th>진행률</th><th>상태</th>' + (canDel ? '<th></th>' : '') + '</tr></thead><tbody>' +
      list.map((x) => { const k = (x.summary && x.summary.kpi) || {}; const o = x.opts || {}; return '<tr class="click" data-id="' + esc(x.id) + '"><td><b>' + esc(x.name) + '</b></td><td>' + esc([(HS.cache.centers.find((c) => c.id === x.center_id) || {}).name, x.scope].filter(Boolean).join(' · ')) + '</td><td>' + esc(x.start_date || '') + (x.end_date && x.end_date !== x.start_date ? ' ~ ' + esc(x.end_date.slice(5)) : '') + '</td><td>' + esc(CMP_L[o.cmp || 'cur'] + ' · ' + LOSS_L[o.loss || 'excl']) + '</td><td class="n">' + (k.sys != null ? fmt(k.sys) : '-') + '</td><td class="n">' + (k.act != null ? fmt(k.act) : '-') + '</td><td class="n ' + dcls(k.diff) + '">' + (k.diff != null ? sg(k.diff) : '-') + '</td><td class="n"><b>' + pct(k.rate, 2) + '</b></td><td>' + (k.progress != null ? '<span class="bar" style="display:inline-block;width:80px;vertical-align:middle"><i style="width:' + Math.min(100, k.progress) + '%"></i></span> ' + pct(k.progress) : '-') + '</td><td>' + (x.status === '확정' ? '<span class="tag g">확정</span>' : '<span class="tag y">진행</span>') + '</td>' + (canDel ? '<td>' + (x.status !== '확정' || isAdm ? '<button class="btn sm" data-del="' + esc(x.id) + '" style="color:#C2412D;border-color:#F1C4BC">🗑 삭제</button>' : '<span class="mute" style="font-size:11.5px">확정 → 관리자만</span>') + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table>'
      : '<div class="empty">등록된 실사가 없습니다. [+ 새 실사]로 시작하세요.</div>';
    c.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = (e) => { if (e.target.closest('[data-del]')) return; HS.go('count', { id: tr.dataset.id }); }));
    c.querySelectorAll('[data-del]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); trashCount(list.find((x) => x.id === b.dataset.del)); }));
    body.appendChild(c);
    if (isAdm && trash && trash.length) {
      const t = HS.el('<div class="card" style="margin-top:14px"><h3>지운 실사 <small>7일 보관 · 7일이 지나면 완전히 지워짐 · 관리자만 되살리기</small></h3><div class="tw"><table class="no-tools"><tr><th>실사</th><th>일자</th><th>지운 사람</th><th>지운 때</th><th>남은 날</th><th></th></tr>' +
        trash.map((x) => { const left = Math.max(0, 7 - Math.floor((Date.now() - new Date(x.deleted_at).getTime()) / 864e5)); return '<tr><td><b>' + esc(x.name) + '</b></td><td>' + esc(x.start_date || '') + '</td><td>' + esc(x.deleted_name || '') + '</td><td>' + esc(new Date(x.deleted_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })) + '</td><td>' + left + '일</td><td><button class="btn sm" data-rs="' + esc(x.id) + '">되살리기</button></td></tr>'; }).join('') + '</table></div></div>');
      t.querySelectorAll('[data-rs]').forEach((b) => (b.onclick = async () => { try { const n = await HS.db.rpc('erp_cnt_restore', { p_id: b.dataset.rs }); HS.toast('"' + n + '" 되살렸습니다', 'ok'); HS.route(); } catch (e) { HS.err(e); } }));
      body.appendChild(t);
    }
    body.appendChild(HS.el('<div class="card" style="margin-top:14px"><h3>진행 순서</h3><ol style="margin:0;padding-left:20px;line-height:1.9"><li><b>실사 등록</b> — 범위 · 비교 수량(현재고/누적재고/구역별) · 로스 처리 · 재실사 기준</li><li><b>전산 재고</b> — WMS 재고 현황(현재고 · 미래 발생분 · 누적재고) + 미래 발생분 내역(오픈 · 행사 · 로스 · 반품 창고) 업로드 · WMS가 바뀌면 다시 업로드</li><li><b>실사 자료</b> — 조 · 구역별 엑셀 여러 개 (PDA 스캔 다운로드 또는 집계 엑셀) · 같은 로케이션은 최신 파일로 교체</li><li><b>차이 확인</b> — 부족 · 과잉 · 위치 상이 · 미등록 → 재실사 → 재실사 결과 업로드</li><li><b>확정</b> — 차이 현황 엑셀(요약 · 브랜드별 · 구역별 · 차이 상세 · 미래 발생분 · 재실사 · WMS 조정용)</li></ol></div>'));
  }

  // 필요 없는 실사 지우기 (이름 확인) — 진행 중: 삭제 권한(팀장) · 확정: 관리자
  async function trashCount(cnt) {
    if (!cnt) return;
    const parts = await HS.db.list('erp_cnt_part', { eq: { cnt_id: cnt.id }, select: 'kind,file' }).catch(() => []);
    const n = (k) => new Set(parts.filter((x) => x.kind === k).map((x) => x.file)).size;
    const f = HS.el('<div style="font-size:13px;line-height:1.8"><b>' + esc(cnt.name) + '</b> 을(를) 삭제합니다.<div class="lock warn" style="margin:8px 0;font-size:12.5px">함께 지워지는 것: 전산 재고 ' + (n('sys') + n('fut')) + '개 · 실사 파일 ' + n('act') + '개 · 재실사 ' + n('re') + '개 · 차이 결과</div>확인을 위해 실사 이름을 그대로 입력하세요<input class="in" id="cn" style="margin-top:6px;width:100%" placeholder="' + esc(cnt.name) + '"><div class="mute" style="font-size:11.5px;margin-top:8px">· 삭제 기록(누가 · 언제 · 무엇을)은 수정 이력에 남습니다 · 지운 뒤 7일 안에는 관리자가 되살릴 수 있음</div></div>');
    const ok = await HS.modal('실사 삭제', f, [['취소', null], ['삭제', true, 'p del']], { onOk: async (v, bg) => { if (bg.querySelector('#cn').value.trim() !== cnt.name.trim()) throw new Error('실사 이름이 맞지 않습니다'); await HS.db.rpc('erp_cnt_trash', { p_id: cnt.id }); } });
    if (ok) { HS.toast('"' + cnt.name + '" 삭제했습니다' + (HS.can('count', 'close') ? '' : ' · 7일 안에는 관리자가 되살릴 수 있습니다'), 'ok'); HS.go('count', {}); }
  }

  async function editCount(cnt) {
    const o = Object.assign({ level: 'auto', cmp: 'cur', loss: 'excl', tol_qty: 3, tol_pct: 5, loc_rule: [] }, (cnt && cnt.opts) || {});
    const f = HS.el('<div class="form">' +
      '<label class="f wide">실사 이름<input class="in" id="n" placeholder="예: 2026 하반기 정기 실사"></label>' +
      '<label class="f">센터<select class="in" id="c">' + HS.cache.centers.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('') + '</select></label><label class="f">범위<input class="in" id="sc" placeholder="예: 이월 창고 1~3층 (크리스 · LX)"></label>' +
      '<label class="f">시작일<input class="in" type="date" id="d1"></label><label class="f">종료일<input class="in" type="date" id="d2"></label>' +
      '<label class="f">비교 기준<select class="in" id="lv"><option value="auto">자동 (위치가 여러 개면 SKU)</option><option value="loc">로케이션 + SKU</option><option value="sku">SKU만</option></select></label>' +
      '<label class="f">비교 수량<select class="in" id="cm"><option value="cur">현재고</option><option value="acc">누적재고 (현재고 − 미래 발생분)</option><option value="loc">구역별 지정</option></select></label>' +
      '<label class="f wide" id="lrw">구역별 비교 수량 <span class="mute">(한 줄에 하나 · 로케이션 앞부분 = 현재고/누적재고 · 나머지는 현재고)</span><textarea class="in" id="lr" rows="3" placeholder="3F = 누적재고&#10;1F-SP = 현재고"></textarea></label>' +
      '<label class="f">로스 처리<select class="in" id="ls"><option value="excl">차이에서 제외 · 따로 표시</option><option value="incl">차이에 포함</option></select></label>' +
      '<label class="f">재실사 기준<span style="display:flex;gap:6px;align-items:center">± <input class="in" id="tq" style="width:60px"> 개 이상 또는 ± <input class="in" id="tp" style="width:60px"> % 이상</span></label>' +
      '</div>');
    const q = (x) => f.querySelector(x);
    q('#n').value = cnt ? cnt.name : today().slice(0, 4) + (+today().slice(5, 7) <= 6 ? ' 상반기' : ' 하반기') + ' 정기 실사';
    q('#c').value = cnt ? cnt.center_id : 'gobaek'; q('#sc').value = cnt ? cnt.scope || '' : '';
    q('#d1').value = cnt ? cnt.start_date || '' : today(); q('#d2').value = cnt ? cnt.end_date || '' : today();
    q('#lv').value = o.level; q('#cm').value = o.cmp; q('#ls').value = o.loss; q('#tq').value = o.tol_qty; q('#tp').value = o.tol_pct;
    q('#lr').value = (o.loc_rule || []).map((r) => r.prefix + ' = ' + CMP_L[r.cmp]).join('\n');
    const tog = () => (q('#lrw').style.display = q('#cm').value === 'loc' ? '' : 'none'); q('#cm').onchange = tog; tog();
    await HS.modal(cnt ? '실사 설정' : '새 실사', f, [['취소', null], [cnt ? '저장' : '등록', true, 'p']], {
      onOk: async () => {
        const name = q('#n').value.trim(); if (!name) throw new Error('실사 이름을 입력하세요');
        const loc_rule = q('#lr').value.split('\n').map((l) => l.split(/[=:→]/)).filter((x) => x.length >= 2 && x[0].trim()).map(([a, b]) => ({ prefix: a.trim().toUpperCase(), cmp: /누적/.test(b) ? 'acc' : 'cur' }));
        const opts = { level: q('#lv').value, cmp: q('#cm').value, loss: q('#ls').value, tol_qty: +q('#tq').value || 3, tol_pct: +q('#tp').value || 5, loc_rule };
        const row = { name, center_id: q('#c').value, scope: q('#sc').value.trim() || null, start_date: q('#d1').value || null, end_date: q('#d2').value || q('#d1').value || null, opts };
        if (cnt) { await HS.db.update('erp_cnt', { id: cnt.id }, row); delete CACHE[cnt.id]; HS.go('count', { id: cnt.id, s: 'setup', r: '1' }); }
        else { const id = 'c' + (row.start_date || today()).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6); await HS.db.upsert('erp_cnt', [Object.assign({ id, status: '진행', zones_done: [] }, row)]); HS.go('count', { id, s: 'setup' }); }
      },
    });
  }

  // ================= ① ② ③ 등록 · 업로드 =================
  function setupView(body, cnt, d) {
    const R = d.res; const K = R.kpi; const o = Object.assign({ cmp: 'cur', loss: 'excl', tol_qty: 3, tol_pct: 5 }, cnt.opts);
    const open = cnt.status !== '확정' || HS.can('count', 'close');
    const g = HS.el('<div class="cnt2"></div>'); body.appendChild(g);
    const L = HS.el('<div></div>'), Rr = HS.el('<div></div>'); g.appendChild(L); g.appendChild(Rr);
    // ① 등록
    const c1 = HS.el('<div class="card"><h3><span class="no">1</span>실사 등록 <small>범위 · 비교 기준</small></h3><div class="tw"><table class="kv">' +
      '<tr><td>실사 이름</td><td>' + esc(cnt.name) + '</td></tr><tr><td>센터 · 범위</td><td>' + esc([(HS.cache.centers.find((c) => c.id === cnt.center_id) || {}).name, cnt.scope].filter(Boolean).join(' · ')) + '</td></tr>' +
      '<tr><td>실사 일자</td><td>' + esc((cnt.start_date || '') + (cnt.end_date && cnt.end_date !== cnt.start_date ? ' ~ ' + cnt.end_date : '')) + '</td></tr>' +
      '<tr><td>비교 기준</td><td><b>' + (R.level === 'loc' ? '로케이션 + SKU' : 'SKU (품번 · 색상 · 사이즈)') + '</b>' + (R.multi && (o.level || 'auto') !== 'sku' ? ' <span class="mute">· 전산 재고 한 칸에 위치가 여러 개라 SKU로 비교</span>' : '') + '</td></tr>' +
      '<tr><td>비교 수량</td><td><b>' + CMP_L[o.cmp] + '</b>' + (o.cmp === 'loc' ? ' <span class="mute">' + esc((o.loc_rule || []).map((r) => r.prefix + '→' + CMP_L[r.cmp]).join(' · ') || '규칙 없음(현재고)') + '</span>' : '') + '</td></tr>' +
      '<tr><td>로스 처리</td><td>' + (o.loss === 'excl' ? '<b>차이에서 제외 · 따로 표시</b>' : '<b>차이에 포함</b>') + '</td></tr>' +
      '<tr><td>재실사 기준</td><td>차이 ±' + o.tol_qty + '개 이상 또는 ±' + o.tol_pct + '% 이상</td></tr></table></div></div>');
    if (HS.can('count', 'create') || HS.can('count', 'edit')) { const b = HS.el('<button class="btn sm" style="margin-top:8px">설정 바꾸기</button>'); b.onclick = () => editCount(cnt); c1.appendChild(b); }
    L.appendChild(c1);
    // ② 전산 재고
    const c2 = HS.el('<div class="card"><h3><span class="no">2</span>전산 재고 (WMS) <small>WMS 변동 시 파일 다시 업로드 · 누적재고 = 현재고 − 미래 발생분</small></h3></div>'); L.appendChild(c2);
    const fileLine = (f, kind) => '<div class="okline">✔ ' + (kind === 'sys' ? '재고 현황' : '미래 발생분 내역') + ' · ' + esc(f.file) + ' · ' + fmt(f.meta.lines || f.rows.length) + '줄 · ' + esc(new Date(f.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })) + '</div>';
    Object.values(d.files.sys).forEach((f) => c2.appendChild(HS.el(fileLine(f, 'sys'))));
    Object.values(d.files.fut).forEach((f) => c2.appendChild(HS.el(fileLine(f, 'fut'))));
    if (HS.can('count', 'create') && open) {
      c2.appendChild(dropBox('WMS 재고 현황 · 미래 발생분 내역 파일 놓기 ' + HS.fmtLink('cnt_sys'), '재고: 위치정보 · 품번 · 색상 · (사이즈) · 현재고 · 미래발생분 · 누적재고 / 미래 발생분: 구분(오픈·행사·로스·반품 창고) · 품번 · 색상 · 수량 (로케이션 없음)<br>올리면 같은 종류의 이전 파일을 바꿉니다', async (files) => {
        const out = []; let sys = null; const fut = [];
        for (const f of files) for (const sh of await readRows(f)) {
          const pz = C.parse(sh.rows); if (!pz) continue;
          if (pz.kind === 'sys') { if (!sys || pz.rows.length > sys.p.rows.length) sys = { f: f.name, p: pz }; }
          else if (pz.kind === 'fut') fut.push({ f: f.name + (sh.name ? ' · ' + sh.name : ''), p: pz });
          else out.push('<div class="mute">' + esc(f.name + ' · ' + sh.name) + ': 실사 자료 형식 → ③ 실사 자료에 올리세요</div>');
        }
        if (!sys && !fut.length) throw new Error('재고 현황(현재고 칸) 또는 미래 발생분(구분 · 수량 칸) 파일이 아닙니다');
        if (sys) { await HS.db.remove('erp_cnt_part', { cnt_id: cnt.id, kind: 'sys' }).catch(() => {}); await putFile(cnt, 'sys', sys.f, sys.p); out.unshift('<div class="okline">✔ 재고 ' + fmt(sys.p.rows.length) + '줄 · 현재고 ' + fmt(sys.p.meta.qty) + '</div>'); }
        if (fut.length) { await HS.db.remove('erp_cnt_part', { cnt_id: cnt.id, kind: 'fut' }).catch(() => {}); for (const x of fut) await putFile(cnt, 'fut', x.f, x.p); out.push('<div class="okline">✔ 미래 발생분 ' + fmt(fut.reduce((s, x) => s + x.p.rows.length, 0)) + '줄</div>'); }
        await refresh(cnt); return out.join('');
      }));
    }
    if (Object.keys(d.files.sys).length) {
      const by = {}; R.lines.filter((l) => l.inSys).forEach((l) => { const o2 = by[l.brand] || (by[l.brand] = { cur: 0, fut: 0, acc: 0 }); o2.cur += l.cur; o2.fut += l.fut; o2.acc += l.acc; });
      const bk = HS.bsort(Object.keys(by)); // 브랜드 차례 = 기준정보 › 브랜드 순번
      const t = HS.el('<div class="tw" style="margin-top:10px"><table><thead><tr><th>브랜드</th><th class="n">현재고</th><th class="n">미래 발생분</th><th class="n">누적재고</th></tr></thead><tbody>' + bk.map((b) => '<tr><td>' + esc(BN(b)) + '</td><td class="n">' + fmt(by[b].cur) + '</td><td class="n">' + fmt(by[b].fut) + '</td><td class="n">' + fmt(by[b].acc) + '</td></tr>').join('') + '</tbody><tfoot><tr class="tot"><td>합계</td><td class="n">' + fmt(K.all_cur) + '</td><td class="n">' + fmt(K.all_fut) + '</td><td class="n">' + fmt(K.all_acc) + '</td></tr></tfoot></table></div>');
      c2.appendChild(t);
      if (R.fut.length) c2.appendChild(HS.el('<div class="mute" style="font-size:12px;margin-top:6px">미래 발생분 내역: ' + R.fut.map((x) => esc(x.kind) + ' ' + fmt(x.qty)).join(' · ') + '</div>'));
      c2.appendChild(HS.el('<div class="mute" style="font-size:11.5px;margin-top:4px">미래 발생분 = 오픈 · 행사 · 로스 · 반품 창고(반품 입고 확정 후 정상팀 · 이월팀 정리 완료 전, 정상 창고 이관 전) 등</div>'));
    }
    // ③ 실사 자료
    const c3 = HS.el('<div class="card"><h3><span class="no">3</span>실사 자료 업로드 <small>조 · 구역별 파일 여러 개 · PDA 스캔 다운로드 또는 수기 집계 엑셀</small></h3></div>'); Rr.appendChild(c3);
    if (HS.can('count', 'upload') && open) {
      c3.appendChild(dropBox('실사 엑셀 끌어다 놓기 (여러 개 한 번에) ' + HS.fmtLink('cnt_act'), '로케이션 · 품번 · 색상 · (사이즈) · 수량 또는 로케이션 · 바코드 · (수량) — 수량 칸이 없으면 한 줄 = 1개(PDA 스캔)<br>파일 이름의 "1조" 등은 담당 조로 자동 인식 · 같은 로케이션을 다시 올리면 최신 값으로 교체', async (files) => {
        if (!Object.keys(d.files.sys).length) throw new Error('② 전산 재고를 먼저 올리세요');
        const out = [];
        for (const f of files) {
          let pz = null; for (const sh of await readRows(f)) { const x = C.parse(sh.rows, 'act'); if (x && x.rows.length && (!pz || x.rows.length > pz.rows.length)) pz = x; }
          if (!pz) { out.push('<div class="neg">' + esc(f.name) + ': 로케이션 · 품번(또는 바코드) 칸을 찾지 못했습니다</div>'); continue; }
          const crew = (f.name.match(/(\d+)\s*조/) || [])[1] ? f.name.match(/(\d+)\s*조/)[1] + '조' : (pz.rows.find((r) => r[6]) || [])[6] || '';
          const zones = [...new Set(pz.rows.map((r) => C.zoneOf(r[0])))].slice(0, 6);
          await putFile(cnt, 'act', f.name, pz, { crew, zones });
          out.push('<div class="okline">✔ ' + esc(f.name) + ' · ' + fmt(pz.rows.length) + '줄 · ' + fmt(pz.meta.qty) + '개' + (crew ? ' · ' + esc(crew) : '') + '</div>');
        }
        await refresh(cnt); return out.join('');
      }));
    }
    const af = Object.values(d.files.act).sort((a, b) => String(a.at).localeCompare(String(b.at)));
    if (af.length) {
      const t = HS.el('<div class="tw" style="margin-top:10px"><table><thead><tr><th>파일</th><th>조</th><th>구역</th><th class="n">줄 수</th><th class="n">실사 수량</th><th>올린 시각</th><th></th></tr></thead><tbody>' +
        af.map((f) => '<tr><td>' + esc(f.file) + '</td><td>' + esc(f.meta.crew || '-') + '</td><td>' + esc((f.meta.zones || []).join(', ')) + '</td><td class="n">' + fmt(f.rows.length) + '</td><td class="n">' + fmt(f.meta.qty || 0) + '</td><td>' + esc(new Date(f.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })) + '</td><td>' + ((HS.can('count', 'create') || HS.can('count', 'delete') || f.by === HS.me.id) && open ? '<button class="btn sm" data-del="' + esc(f.file) + '">삭제</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>');
      t.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (!(await HS.confirm(esc(b.dataset.del) + ' 실사 자료를 지울까요?'))) return; try { await HS.db.remove('erp_cnt_part', { cnt_id: cnt.id, kind: 'act', file: b.dataset.del }); await refresh(cnt); } catch (e) { HS.err(e); } }));
      c3.appendChild(t);
    }
    // ④ 구역별 진행률
    const c4 = HS.el('<div class="card"><h3><span class="no">4</span>구역별 진행률 <small>전산 로케이션 대비 실사 완료 · 완료 처리한 구역은 스캔 안 된 로케이션을 0개로 비교</small></h3><div class="tw"></div></div>'); Rr.appendChild(c4);
    const canZ = (HS.can('count', 'create') || HS.can('count', 'edit')) && open;
    const zl = R.zones; const tz = zl.reduce((a, z) => ({ locs: a.locs + z.locs, done: a.done + z.done, cur: a.cur + z.cur, act: a.act + z.act, sys: a.sys + z.sys }), { locs: 0, done: 0, cur: 0, act: 0, sys: 0 });
    c4.querySelector('.tw').innerHTML = zl.length ? '<table><thead><tr><th>구역</th><th class="n">로케이션</th><th class="n">완료</th><th>진행률</th><th class="n">전산 수량</th><th class="n">실사 수량</th><th class="n">차이</th><th>담당</th>' + (canZ ? '<th>완료 처리</th>' : '') + '</tr></thead><tbody>' +
      zl.map((z) => { const col = z.pct >= 100 ? 'var(--pos)' : z.pct > 0 ? 'var(--gold)' : '#ccd'; const anyAct = z.act > 0 || z.complete; return '<tr><td><b>' + esc(z.zone) + '</b></td><td class="n">' + fmt(z.locs) + '</td><td class="n">' + fmt(z.done) + '</td><td><span class="bar" style="display:inline-block;width:110px;vertical-align:middle"><i style="width:' + Math.min(100, z.pct) + '%;background:' + col + '"></i></span> ' + pct(z.pct) + '</td><td class="n">' + fmt(z.cur) + '</td><td class="n">' + (anyAct ? fmt(z.act) : '-') + '</td><td class="n ' + dcls(z.diff) + '">' + (anyAct ? sg(z.diff) : '-') + '</td><td>' + esc(z.crew || '') + '</td>' + (canZ ? '<td><input type="checkbox" data-z="' + esc(z.zone) + '"' + ((cnt.zones_done || []).indexOf(z.zone) >= 0 ? ' checked' : '') + '></td>' : '') + '</tr>'; }).join('') +
      '</tbody><tfoot><tr class="tot"><td>합계</td><td class="n">' + fmt(tz.locs) + '</td><td class="n">' + fmt(tz.done) + '</td><td>' + pct(tz.locs ? tz.done / tz.locs * 100 : 0) + '</td><td class="n">' + fmt(tz.cur) + '</td><td class="n">' + fmt(tz.act) + '</td><td class="n ' + dcls(tz.act - tz.sys) + '">' + sg(tz.act - tz.sys) + '</td><td></td>' + (canZ ? '<td></td>' : '') + '</tr></tfoot></table>' : '<div class="empty">전산 재고를 올리면 구역(층-구역)별로 나눠 보여줍니다</div>';
    c4.querySelectorAll('[data-z]').forEach((x) => (x.onchange = async () => { const set = new Set(cnt.zones_done || []); if (x.checked) set.add(x.dataset.z); else set.delete(x.dataset.z); try { await HS.db.update('erp_cnt', { id: cnt.id }, { zones_done: [...set] }); cnt.zones_done = [...set]; await refresh(cnt); } catch (e) { HS.err(e); } }));
    c4.appendChild(HS.el('<div class="mute" style="font-size:11.5px;margin-top:6px;line-height:1.6">· 차이는 실사가 끝난 로케이션(스캔 또는 완료 처리 구역)만 계산합니다 · 전산에 없는 로케이션 · SKU는 \'미등록\'으로 따로 모아 보여줍니다</div>'));
  }
  async function refresh(cnt) { delete CACHE[cnt.id]; const list = await HS.db.list('erp_cnt', { eq: { id: cnt.id } }); const c = list[0] || cnt; const d = await loadAll(c, true); await saveSummary(c, d.res); HS.route(); }

  // ================= ④ ⑤ 차이 현황 =================
  function diffView(body, cnt, d) {
    const R = d.res, K = R.kpi; const o = Object.assign({ cmp: 'cur', loss: 'excl', tol_qty: 3, tol_pct: 5 }, cnt.opts);
    const zDone = R.zones.filter((z) => z.complete).length;
    const tb = HS.el('<div class="cnt-tb"><span class="chip">' + (R.level === 'loc' ? '로케이션+SKU' : 'SKU') + ' · ' + CMP_L[o.cmp] + ' · ' + LOSS_L[o.loss] + '</span><span class="chip">완료 구역 ' + zDone + '/' + R.zones.length + ' · 진행률 ' + pct(K.progress) + '</span><span class="sp"></span></div>');
    const bX = HS.el('<button class="btn gd">차이 현황 엑셀 다운로드</button>'); tb.appendChild(bX);
    if (HS.can('count', 'close')) { const bc = HS.el('<button class="btn ' + (cnt.status === '확정' ? '' : 'p') + '">' + (cnt.status === '확정' ? '확정 해제' : '확정') + '</button>'); bc.onclick = async () => { const to = cnt.status === '확정' ? '진행' : '확정'; if (!(await HS.confirm(to === '확정' ? '실사를 확정할까요? 확정 후에는 자료를 바꿀 수 없습니다.' : '확정을 해제할까요?'))) return; try { await HS.db.update('erp_cnt', { id: cnt.id }, { status: to, summary: C.summary(R) }); HS.toast(to === '확정' ? '확정했습니다' : '해제했습니다', 'ok'); HS.route(); } catch (e) { HS.err(e); } }; tb.appendChild(bc); }
    body.appendChild(tb);
    bX.onclick = () => exportXlsx(cnt, R);
    if (!Object.keys(d.files.act).length) body.appendChild(HS.el('<div class="lock" style="margin-bottom:12px">아직 실사 자료가 없습니다. [등록 · 업로드]에서 ③ 실사 자료를 올리면 차이가 계산됩니다.</div>'));
    const kp = (l, v, s, st) => '<div class="card kpi"' + (st ? ' style="' + st + '"' : '') + '><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
    const k = HS.el('<div class="kpis" style="margin-bottom:14px"></div>');
    k.innerHTML = kp(CMP_L[o.cmp === 'loc' ? 'cur' : o.cmp] + (o.cmp === 'loc' ? '·누적 (구역별)' : '') + ' (비교 기준 · 완료 구역)', fmt(K.sys), '미래 발생분 ' + fmt(K.fut) + ' · 누적재고 ' + fmt(K.acc) + (K.loss ? ' · 로스 ' + fmt(K.loss) : '')) +
      kp('실사 수량', fmt(K.act), '<span class="' + dcls(K.diff) + '">' + sg(K.diff) + ' (' + (K.sys ? (K.diff / K.sys * 100).toFixed(2) : '0') + '%)</span>') +
      kp('재고 정확도 (SKU 일치율)', '<span class="' + (K.rate >= 99 ? 'pos' : K.rate >= 97 ? '' : 'neg') + '">' + pct(K.rate, 2) + '</span>', '일치 ' + fmt(K.match) + ' / ' + fmt(K.lines) + ' SKU · 수량 정확도 ' + pct(K.qrate, 2), 'border:2px solid var(--navy)') +
      kp('차이 SKU', '<span class="neg">' + fmt(K.n_diff) + '</span>', '부족 ' + fmt(K.n_short) + ' · 과잉 ' + fmt(K.n_over) + (R.level === 'loc' ? ' · 위치 상이 ' + fmt(K.n_moved) : '') + ' · 미등록 ' + fmt(K.n_unreg)) +
      kp('재실사 대상', '<span style="color:var(--gold)">' + fmt(K.n_recount) + '</span>', '±' + o.tol_qty + '개 또는 ±' + o.tol_pct + '% 이상' + (K.n_re ? ' · 재실사 반영 ' + fmt(K.n_re) : ''));
    body.appendChild(k);
    const g = HS.el('<div class="cnt2 w"></div>'); body.appendChild(g);
    const L = HS.el('<div></div>'), Rr = HS.el('<div></div>'); g.appendChild(L); g.appendChild(Rr);
    // ① 브랜드별
    // 2026-11-11 정상팀 요청: 브랜드별로 '기준 재고(현재고 · 미래 발생분 · 누적재고) ↔ 실사 ↔ 차이' 를 한 표에서 보게 함
    const c1 = HS.el('<div class="card"><h3><span class="no">1</span>브랜드별 기준 재고 · 실사 · 차이 <small>비교 수량: ' + CMP_L[o.cmp] + ' · ' + (o.loss === 'excl' ? '로스는 차이에서 제외' : '로스 포함') + ' · 완료 구역만</small></h3><div class="tw"></div></div>');
    const B = R.brands; const bt = B.reduce((a, b) => ({ sys: a.sys + b.sys, act: a.act + b.act, short: a.short + b.short, over: a.over + b.over, cur: a.cur + b.cur, fut: a.fut + b.fut, acc: a.acc + b.acc, n: a.n + b.n, rec: a.rec + (b.rec || 0), match: a.match + b.match }), { sys: 0, act: 0, short: 0, over: 0, cur: 0, fut: 0, acc: 0, n: 0, rec: 0, match: 0 });
    const cmpL = CMP_L[o.cmp === 'loc' ? 'cur' : o.cmp];
    c1.querySelector('.tw').innerHTML = '<table><thead><tr><th rowspan="2">브랜드</th><th colspan="3" class="c">기준 재고 (전산)</th><th rowspan="2" class="n">비교 기준<br><span class="mute" style="font-weight:400">' + esc(cmpL) + '</span></th><th rowspan="2" class="n">실사</th><th colspan="3" class="c">차이</th><th rowspan="2" class="n">차이 SKU</th><th rowspan="2" class="n">재실사</th><th rowspan="2" class="n">정확도</th></tr>' +
      '<tr><th class="n">현재고</th><th class="n">미래 발생분</th><th class="n">누적재고</th><th class="n">부족</th><th class="n">과잉</th><th class="n">순차이</th></tr></thead><tbody>' +
      B.map((b) => '<tr class="click" data-b="' + esc(b.k) + '"><td>' + esc(BN(b.k)) + '</td><td class="n">' + fmt(b.cur) + '</td><td class="n">' + (b.fut ? fmt(b.fut) : '<span class="mute">-</span>') + '</td><td class="n">' + fmt(b.acc) + '</td><td class="n b">' + fmt(b.sys) + '</td><td class="n">' + fmt(b.act) + '</td><td class="n neg">' + (b.short ? fmt(b.short) : '0') + '</td><td class="n pos">' + (b.over ? '+' + fmt(b.over) : '0') + '</td><td class="n ' + dcls(b.diff) + '">' + sg(b.diff) + '</td><td class="n">' + fmt(b.n - b.match) + '</td><td class="n"' + (b.rec ? ' style="color:var(--gold);font-weight:700"' : '') + '>' + fmt(b.rec || 0) + '</td><td class="n">' + pct(b.qrate) + '</td></tr>').join('') +
      '</tbody><tfoot><tr class="tot"><td>합계</td><td class="n">' + fmt(bt.cur) + '</td><td class="n">' + fmt(bt.fut) + '</td><td class="n">' + fmt(bt.acc) + '</td><td class="n b">' + fmt(bt.sys) + '</td><td class="n">' + fmt(bt.act) + '</td><td class="n neg">' + fmt(bt.short) + '</td><td class="n pos">+' + fmt(bt.over) + '</td><td class="n ' + dcls(bt.act - bt.sys) + '">' + sg(bt.act - bt.sys) + '</td><td class="n">' + fmt(bt.n - bt.match) + '</td><td class="n">' + fmt(bt.rec) + '</td><td class="n">' + pct(K.qrate, 2) + '</td></tr></tfoot></table>';
    body.insertBefore(c1, g); // 칸이 많아 한 줄 전체를 씀 (반쪽 카드에 넣으면 오른쪽이 잘림)
    c1.style.marginBottom = '14px';
    // ② 미래 발생분
    const ft = R.fut.reduce((s, x) => s + x.qty, 0);
    const c2 = HS.el('<div class="card"><h3><span class="no">2</span>미래 발생분 내역 <small>로케이션 미지정 · 차이 계산에서 따로 관리</small></h3><div class="tw"></div></div>');
    const ord = ['오픈', '행사', '로스', '반품 창고', '기타'];
    c2.querySelector('.tw').innerHTML = R.fut.length ? '<table><thead><tr><th>구분</th><th class="n">수량</th><th>처리</th></tr></thead><tbody>' +
      R.fut.slice().sort((a, b) => ord.indexOf(a.kind) - ord.indexOf(b.kind)).map((x) => '<tr><td>' + (x.kind === '반품 창고' ? '<b>반품 창고</b>' : esc(x.kind)) + '</td><td class="n">' + fmt(x.qty) + '</td><td>' + (x.kind === '로스' ? '<span class="tag k">' + (o.loss === 'excl' ? '차이에서 제외' : '차이에 포함') + ' (선택)</span>' + (K.loss ? ' 부족 ' + fmt(Math.abs(K.loss)) + '개 설명' : '') : x.kind === '반품 창고' ? '반품 입고 확정 · 정상창고 이관 전 → <a href="#/returns">반품 관리 미정리와 대조</a>' : /오픈|행사/.test(x.kind) ? '출고 대기' : '') + '</td></tr>').join('') +
      '</tbody><tfoot><tr class="tot"><td>합계</td><td class="n">' + fmt(ft) + '</td><td>WMS 미래 발생분 칸 합계 ' + fmt(K.all_fut) + (ft !== K.all_fut ? ' <span class="neg">(내역과 ' + sg(ft - K.all_fut) + ')</span>' : '') + '</td></tr></tfoot></table>' : '<div class="empty">미래 발생분 내역 파일을 올리면 구분별로 보여줍니다 (WMS 미래 발생분 칸 합계 ' + fmt(K.all_fut) + ')</div>';
    L.appendChild(c2);
    // ④ 차이 상세
    const c4 = HS.el('<div class="card"><h3><span class="no">3</span>차이 상세 <small>차이 큰 순 · 유형별 · 재실사 결과를 올리면 자동 갱신</small></h3><div class="ttabs"></div><div class="tw dt"></div><div class="dbtn" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center"></div></div>');
    Rr.appendChild(c4);
    const S = R.lines.filter((l) => l.scope && (l.type !== '일치' || l.re != null));
    const TABS = [['all', '전체', (l) => l.type !== '일치'], ['부족', '부족', (l) => l.type === '부족'], ['과잉', '과잉', (l) => l.type === '과잉']].concat(R.level === 'loc' ? [['위치 상이', '위치 상이', (l) => l.type === '위치 상이']] : []).concat([['미등록', '미등록', (l) => l.type === '미등록'], ['re', '재실사', (l) => l.recount], ['done', '재실사 반영', (l) => l.re != null]]);
    let tab = 'all', lim = 200;
    let brandF = null; let pf = HS._cntFilter || null; HS._cntFilter = null; // 대시보드 칸에서 넘어온 조건
    const FV = { brand: (l) => BN(l.brand), year: (l) => String(l.yband), season: (l) => l.season, cls: (l) => l.cls, grp: (l) => l.grp, zone: (l) => l.zone, type: (l) => l.type };
    const pfOk = (l) => !pf || Object.entries(pf).every(([k, v]) => !FV[k] || v == null || (Array.isArray(v) ? !v.length || v.indexOf(FV[k](l)) >= 0 : FV[k](l) === v));
    const pfLabel = () => Object.entries(pf || {}).filter(([k, v]) => FV[k] && v != null && (!Array.isArray(v) || v.length)).map(([, v]) => (Array.isArray(v) ? v.join('/') : v)).join(' · ');
    c1.querySelectorAll('tr[data-b]').forEach((tr) => (tr.onclick = () => { brandF = brandF === tr.dataset.b ? null : tr.dataset.b; c1.querySelectorAll('tr[data-b]').forEach((x) => x.classList.toggle('sel', x.dataset.b === brandF)); lim = 200; draw(); }));
    function draw() {
      const base = S.filter((l) => (!brandF || l.brand === brandF) && pfOk(l));
      c4.querySelector('.ttabs').innerHTML = TABS.map(([k, l, f]) => '<button class="' + (k === tab ? 'on' : '') + '" data-t="' + k + '">' + l + ' ' + fmt(base.filter(f).length) + '</button>').join('') + (brandF ? ' <span class="chip" data-x="b">' + esc(BN(brandF)) + ' ✕</span>' : '') + (pf && pfLabel() ? ' <span class="chip" data-x="p">' + esc(pfLabel()) + ' ✕</span>' : '');
      c4.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { tab = b.dataset.t; lim = 200; draw(); }));
      c4.querySelectorAll('.ttabs [data-x]').forEach((ch) => (ch.onclick = () => { if (ch.dataset.x === 'b') { brandF = null; c1.querySelectorAll('tr[data-b]').forEach((x) => x.classList.remove('sel')); } else pf = null; draw(); }));
      const rows = base.filter(TABS.find((t) => t[0] === tab)[2]).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.loc.localeCompare(b.loc));
      const hasSize = rows.some((l) => l.size);
      c4.querySelector('.dt').innerHTML = rows.length ? '<table><thead><tr><th>로케이션</th><th>브랜드</th><th>품번</th><th>색상</th>' + (hasSize ? '<th>사이즈</th>' : '') + '<th class="n">현재고</th><th class="n">미래</th><th class="n">누적</th><th class="n">실사</th><th class="n">차이</th><th>유형</th><th>재실사</th></tr></thead><tbody>' +
        rows.slice(0, lim).map((l) => '<tr><td style="max-width:180px;white-space:normal;font-size:12px">' + esc(l.loc || '-') + '</td><td>' + esc(BN(l.brand)) + '</td><td>' + esc(l.style) + '</td><td>' + esc(l.color) + '</td>' + (hasSize ? '<td>' + esc(l.size) + '</td>' : '') + '<td class="n">' + (l.inSys ? fmt(l.cur) : '-') + '</td><td class="n">' + (l.inSys ? fmt(l.fut) : '-') + '</td><td class="n">' + (l.inSys ? fmt(l.acc) : '-') + '</td><td class="n">' + fmt(l.act) + (l.re != null ? ' <span class="mute" title="1차 실사">(' + fmt(l.act1) + ')</span>' : '') + '</td><td class="n ' + dcls(l.diff) + '"><b>' + sg(l.diff) + '</b>' + (l.loss > 0 ? '<div class="mute" style="font-size:11px">로스 ' + fmt(l.loss) + ' 제외</div>' : '') + '</td><td><span class="tag ' + (TYPE_TAG[l.type] || '') + '">' + esc(l.type) + '</span></td><td>' + (l.re != null ? '<span class="tag g">반영</span>' : l.recount ? '<span class="tag y">' + (l.type === '미등록' ? '확인' : '대상') + '</span>' : l.type === '위치 상이' ? '<span class="mute" style="font-size:11.5px">' + esc(l.moveTo ? '→ ' + l.moveTo + ' 발견' : '← ' + (l.moveFrom || '')) + '</span>' : '<span class="mute">기준 미만</span>') + '</td></tr>').join('') +
        '</tbody></table>' + (rows.length > lim ? '<div style="text-align:center;margin-top:8px"><button class="btn sm" data-more>' + fmt(rows.length - lim) + '건 더 보기</button></div>' : '') : '<div class="empty">' + (Object.keys(d.files.act).length ? '해당 차이가 없습니다' : '실사 자료가 없습니다') + '</div>';
      const more = c4.querySelector('[data-more]'); if (more) more.onclick = () => { lim += 500; draw(); };
    }
    draw();
    const db = c4.querySelector('.dbtn');
    if (HS.can('count', 'upload') && (cnt.status !== '확정' || HS.can('count', 'close'))) {
      const inp = HS.el('<input type="file" multiple accept=".xlsx,.xls,.csv" class="hide">');
      const btn = HS.el('<button class="btn">재실사 결과 올리기</button>'); btn.onclick = () => inp.click(); db.appendChild(HS.el('<span style="margin-left:6px">' + HS.fmtLink('cnt_act', '양식') + '</span>'));
      inp.onchange = async () => {
        try {
          let n = 0;
          for (const f of inp.files) { let pz = null; for (const sh of await readRows(f)) { const x = C.parse(sh.rows, 'act'); if (x && x.rows.length && (!pz || x.rows.length > pz.rows.length)) pz = x; } if (!pz) throw new Error(f.name + ': 품번(또는 바코드) · 수량 칸을 찾지 못했습니다'); await putFile(cnt, 're', f.name, pz); n += pz.rows.length; }
          HS.toast('재실사 ' + fmt(n) + '줄 반영', 'ok'); await refresh(cnt);
        } catch (e) { HS.err(e); }
        inp.value = '';
      };
      db.appendChild(btn); db.appendChild(inp);
    }
    db.appendChild(HS.el('<span class="mute" style="font-size:11.5px">' + (R.level === 'loc' ? '위치 상이 = 같은 SKU가 다른 로케이션에서 발견 → 수량 차이 아님 · ' : '') + '재실사 파일 = 실사 자료와 같은 양식 (해당 항목만)</span>'));
  }

  // ================= 대시보드 =================
  function dashView(body, cnt, d) {
    const R = d.res; const o = Object.assign({ cmp: 'cur', loss: 'excl' }, cnt.opts);
    const tb = HS.el('<div class="cnt-tb"><span class="chip">비교: ' + CMP_L[o.cmp] + ' · ' + LOSS_L[o.loss] + '</span><span class="sp"></span></div>');
    const bi = HS.el('<button class="btn">이미지</button>'); const bx = HS.el('<button class="btn gd">차이 현황 엑셀 다운로드</button>'); tb.appendChild(bi); tb.appendChild(bx); body.appendChild(tb);
    bx.onclick = () => exportXlsx(cnt, R);
    const S = R.lines.filter((l) => l.scope);
    const acc = (rows) => { const sys = rows.reduce((s, l) => s + l.sys, 0); const ad = rows.reduce((s, l) => s + Math.abs(l.diff), 0); return { sys, diff: rows.reduce((s, l) => s + l.diff, 0), q: sys ? (1 - ad / sys) * 100 : null }; };
    const k = HS.el('<div class="kpis" style="margin-bottom:14px"></div>');
    const kp = (l, v, s) => '<div class="card kpi"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
    const col = (q) => (q == null ? '' : q >= 99 ? '' : q >= 98 ? 'style="color:var(--gold)"' : 'class="neg"');
    k.innerHTML = [['이너', '이너 (티셔츠 · 바지 · 스웨터)'], ['JK', 'JK (아우터)'], ['ACC', 'ACC']].map(([c, l]) => { const a = acc(S.filter((x) => x.cls === c)); return kp(l, '<span ' + col(a.q) + '>' + pct(a.q) + '</span>', CMP_L[o.cmp === 'loc' ? 'cur' : o.cmp] + ' ' + fmt(a.sys) + ' · 차이 ' + sg(a.diff)); }).join('') +
      kp('년도별 정확도', [...new Set(S.map((x) => x.yband))].sort().reverse().slice(0, 3).map((y) => { const a = acc(S.filter((x) => x.yband === y)); return esc(y) + ' <span ' + col(a.q) + '>' + pct(a.q) + '</span>'; }).join(' · ') || '-', '오래된 재고일수록 차이가 큰지 확인');
    body.appendChild(k);
    const c = HS.el('<div class="card"><h3><span class="no">1</span>브랜드 · 년도 · 시즌 × 복종별 실사 차이 <small>⚙ 그리드 설정으로 행 · 열 · 값 바꾸기 · 칸을 누르면 차이 상세 · 년도 = 품번 4번째 자리(F=2026) · 시즌 = 5번째 자리</small></h3><div class="pv-host"></div></div>');
    body.appendChild(c);
    const data = S.map((l) => ({ brand: BN(l.brand), year: String(l.yband), season: l.season, cls: l.cls, grp: l.grp, zone: l.zone, type: l.type, cur: l.cur, fut: l.fut, acc: l.acc, sys: l.sys, act: l.act, diff: l.diff, short: l.diff < 0 ? l.diff : 0, over: l.diff > 0 ? l.diff : 0, absd: Math.abs(l.diff), n: 1, ok: l.type === '일치' ? 1 : 0 }));
    HS.pivot({
      el: c.querySelector('.pv-host'), key: 'count-dash', title: cnt.name + ' 실사 대시보드', data,
      dims: [{ k: 'brand', l: '브랜드' }, { k: 'year', l: '년도' }, { k: 'season', l: '시즌' }, { k: 'cls', l: '복종', order: ['이너', 'JK', 'ACC', '기타'] }, { k: 'grp', l: '아이템군' }, { k: 'zone', l: '구역' }, { k: 'type', l: '유형', order: ['부족', '과잉', '위치 상이', '미등록', '일치'] }],
      measures: [{ k: 'sys', l: '비교 수량' }, { k: 'cur', l: '현재고' }, { k: 'fut', l: '미래 발생분' }, { k: 'acc', l: '누적재고' }, { k: 'act', l: '실사' }, { k: 'diff', l: '차이', color: true }, { k: 'short', l: '부족', color: true }, { k: 'over', l: '과잉', color: true }, { k: 'n', l: 'SKU 수' }, { k: 'ok', l: '일치 SKU' }, { k: 'absd', l: '차이 절댓값' }],
      derived: [{ k: 'qrate', l: '정확도 %', f: (a) => (a.sys ? (1 - a.absd / a.sys) * 100 : null), show: (v) => pct(v) }, { k: 'srate', l: 'SKU 일치율 %', f: (a) => (a.n ? a.ok / a.n * 100 : null), show: (v) => pct(v) }],
      state: { rows: ['brand', 'year', 'season'], col: 'cls', vals: ['sys', 'act', 'diff'], opts: { sub: true } },
      onCell: (path) => { HS._cntFilter = path; HS.go('count', { id: cnt.id, s: 'diff' }); },
    });
    bi.onclick = () => HS.snap(c, cnt.name + '_대시보드');
  }

  // ================= 차이 현황 엑셀 =================
  function exportXlsx(cnt, R) {
    const K = R.kpi; const o = Object.assign({ cmp: 'cur', loss: 'excl', tol_qty: 3, tol_pct: 5 }, cnt.opts);
    HS.needXlsx(); const wb = XLSX.utils.book_new(); const add = (name, aoa, w) => { const ws = XLSX.utils.aoa_to_sheet(aoa); if (w) ws['!cols'] = w.map((x) => ({ wch: x })); XLSX.utils.book_append_sheet(wb, ws, name); };
    const S = R.lines.filter((l) => l.scope);
    add('요약', [[cnt.name], ['센터 · 범위', [(HS.cache.centers.find((c) => c.id === cnt.center_id) || {}).name, cnt.scope].filter(Boolean).join(' · ')], ['실사 일자', (cnt.start_date || '') + (cnt.end_date ? ' ~ ' + cnt.end_date : '')], ['비교', (R.level === 'loc' ? '로케이션+SKU' : 'SKU') + ' · ' + CMP_L[o.cmp] + ' · ' + LOSS_L[o.loss]], ['상태', cnt.status], [],
      ['항목', '값'], ['현재고 (완료 구역)', K.cur], ['미래 발생분', K.fut], ['누적재고', K.acc], ['비교 수량', K.sys], ['실사 수량', K.act], ['차이', K.diff], ['차이율 %', K.sys ? +(K.diff / K.sys * 100).toFixed(3) : 0], ['로스 제외 수량', K.loss],
      ['SKU 일치율 %', K.rate == null ? '' : +K.rate.toFixed(2)], ['수량 정확도 %', K.qrate == null ? '' : +K.qrate.toFixed(2)], ['비교 SKU', K.lines], ['일치', K.match], ['부족', K.n_short], ['과잉', K.n_over], ['위치 상이', K.n_moved], ['미등록', K.n_unreg], ['재실사 대상', K.n_recount], ['재실사 반영', K.n_re],
      ['진행률 % (로케이션)', +K.progress.toFixed(1)], ['완료 구역', K.zones_complete + ' / ' + K.zones_total], ['작성', new Date().toLocaleString('ko-KR') + ' · ' + (HS.me.name || '')]], [22, 40]);
    const by = {}; S.forEach((l) => { const k = [BN(l.brand), l.season, l.cls].join('|'); const x = by[k] || (by[k] = { b: BN(l.brand), s: l.season, c: l.cls, cur: 0, fut: 0, acc: 0, sys: 0, act: 0, sh: 0, ov: 0 }); x.cur += l.cur; x.fut += l.fut; x.acc += l.acc; x.sys += l.sys; x.act += l.act; if (l.diff < 0) x.sh += l.diff; else x.ov += l.diff; });
    add('브랜드별', [['브랜드', '시즌', '복종', '현재고', '미래 발생분', '누적재고', '비교 수량', '실사', '부족', '과잉', '순차이', '정확도 %']].concat(Object.values(by).sort((a, b) => a.b.localeCompare(b.b) || a.s.localeCompare(b.s) || a.c.localeCompare(b.c)).map((x) => [x.b, x.s, x.c, x.cur, x.fut, x.acc, x.sys, x.act, x.sh, x.ov, x.act - x.sys, x.sys ? +((1 - (Math.abs(x.sh) + x.ov) / x.sys) * 100).toFixed(2) : ''])), [16, 12, 6, 10, 10, 10, 10, 10, 8, 8, 8, 9]);
    add('구역별', [['구역', '로케이션', '완료', '진행률 %', '현재고', '비교 수량', '실사', '차이', '담당 조', '완료 처리']].concat(R.zones.map((z) => [z.zone, z.locs, z.done, +z.pct.toFixed(1), z.cur, z.sys, z.act, z.diff, z.crew, z.complete ? 'O' : ''])), [12, 9, 8, 9, 10, 10, 10, 8, 10, 8]);
    const det = S.filter((l) => l.type !== '일치' || l.re != null).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    add('차이 상세', [['로케이션', '구역', '브랜드', '년도', '시즌', '복종', '품번', '색상', '사이즈', '현재고', '미래 발생분', '누적재고', '비교 수량', '1차 실사', '재실사', '실사', '차이', '로스 제외', '유형', '재실사 대상', '비고']].concat(det.map((l) => [l.loc, l.zone, BN(l.brand), l.year, l.season, l.cls, l.style, l.color, l.size, l.cur, l.fut, l.acc, l.sys, l.act1, l.re == null ? '' : l.re, l.act, l.diff, l.loss || '', l.type, l.recount ? 'O' : '', l.moveTo ? '→ ' + l.moveTo : l.moveFrom ? '← ' + l.moveFrom : ''])), [24, 8, 14, 6, 10, 6, 12, 6, 6, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 16]);
    add('미래 발생분', [['구분', '수량']].concat(R.fut.map((x) => [x.kind, x.qty])).concat([['합계', R.fut.reduce((s, x) => s + x.qty, 0)], ['WMS 미래 발생분 칸 합계', K.all_fut], [], ['품번', '색상', '사이즈', '미래 발생분 합계']]).concat([...R.futSku].map(([k, q]) => k.split('|').concat([q]))), [16, 10, 8, 14]);
    add('재실사 목록', [['로케이션', '구역', '브랜드', '품번', '색상', '사이즈', '비교 수량', '1차 실사', '차이', '유형', '2차 실사 (기입)', '확인자']].concat(S.filter((l) => l.recount || l.re != null).sort((a, b) => a.zone.localeCompare(b.zone) || a.loc.localeCompare(b.loc)).map((l) => [l.loc, l.zone, BN(l.brand), l.style, l.color, l.size, l.sys, l.act1, l.act1 - l.sys, l.type, l.re == null ? '' : l.re, ''])), [24, 8, 14, 12, 6, 6, 9, 9, 8, 8, 14, 10]);
    add('WMS 조정용', [['로케이션', '품번', '색상', '사이즈', '조정 수량', '사유']].concat(det.filter((l) => l.diff && l.type !== '위치 상이').map((l) => [R.level === 'loc' ? l.loc : (l.loc || '').split(' ')[0], l.style, l.color, l.size, l.diff, '재고 실사 ' + (cnt.end_date || cnt.start_date || '') + ' · ' + l.type])).concat(det.filter((l) => l.type === '위치 상이' && l.diff < 0).map((l) => [l.loc, l.style, l.color, l.size, l.diff, '위치 이동 → ' + (l.moveTo || '')])).concat(det.filter((l) => l.type === '위치 상이' && l.diff > 0).map((l) => [l.loc, l.style, l.color, l.size, l.diff, '위치 이동 ← ' + (l.moveFrom || '')])), [24, 12, 6, 6, 9, 30]);
    XLSX.writeFile(wb, cnt.name.replace(/[\\/:*?"<>|]/g, '') + '_차이현황_' + today() + '.xlsx');
  }
})();
