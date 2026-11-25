/* 정상팀 › 반품 정리 현황 — '매장 폐점 수시반품 대장' 8개 시트를 한 파일로 올리고 정리 진행 상태를 봄
 *  · 저장은 erp_records (kind = rc_*) — DB 구조 안 바꿈
 *  · 상태는 자동 판정: 정리일자 있거나 결과가 완료류 → 정리완료 · 인계일자만 → 정리중 · 둘 다 없음 → 인계대기 (rclean.js stateOf)
 */
(function () {
  'use strict';
  const { esc, fmt, today } = HS;
  const R = window.HSRClean;
  const KINDS = R.SHEETS.map((s) => s.k);
  const ST = [['정리완료', 'g'], ['정리중', 'y'], ['인계대기', 'r']];
  const stTag = (s) => { const x = ST.find((t) => t[0] === s); return '<span class="tag ' + (x ? x[1] : '') + '">' + esc(s === '인계대기' ? '인계 대기' : s === '정리중' ? '정리 중' : '정리 완료') + '</span>'; };
  const pcs = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '-');
  const bar = (v) => '<span class="npb"><i style="width:' + Math.min(100, Math.max(0, v || 0)) + '%"></i></span>';
  const dv = (v) => (v == null || v === '' ? '<span class="mute">-</span>' : /^\d{4}-\d\d-\d\d$/.test(v) ? esc(v.slice(5).replace('-', '/')) : esc(String(v)));

  // ---------- 카톡용 이미지 — ① 전체 현황 + ② 오늘 챙길 것 한 장 (2026-11-18 승인) ----------
  //  화면 오른쪽 위 [📷 카톡용 이미지] → 세로 카드를 사진으로 (HS.snap 미리보기 → 복사 · 저장 · 공유)
  //  · 전체 탭: ① 표는 대장별 · 대장 탭: 제목에 대장 이름, ① 표는 그 대장의 브랜드별, ② 는 그 대장 것만
  const LATE = 15; // 이 날수를 넘게 인계 대기면 빨간 꼬리표 (그 아래는 노랑)
  const TOPW = 5; // 인계 대기 몇 건까지 줄로 보여 줄지 (나머지는 합계 한 줄)
  const TOPB = 3; // 정리 중 브랜드 몇 개까지 (나머지는 합계 한 줄)
  async function kakaoCard(tab, rows, byKind, sum) {
    const one = tab !== 'all'; const sp = one ? R.SPEC[tab] : null;
    const T = sum(rows); const t0 = today();
    const days = (d) => Math.round((new Date(t0 + 'T00:00:00') - new Date(d + 'T00:00:00')) / 86400000);
    const md = (d) => (d ? +d.slice(5, 7) + '/' + +d.slice(8, 10) : '');
    const dow = '일월화수목금토'[new Date(t0 + 'T00:00:00').getDay()];
    const ds = rows.map((r) => r.rec_date).filter(Boolean).sort();
    const yr = (ds[ds.length - 1] || t0).slice(0, 4);
    const range = ds.length ? +ds[0].slice(5, 7) + '월 ~ ' + +ds[ds.length - 1].slice(5, 7) + '월' : '';
    const pc = (a, b) => (b ? (a / b) * 100 : 0);
    const barH = (v) => '<span class="kbar"><i style="width:' + (v > 0 ? Math.max(2, Math.min(100, v)) : 0) + '%;background:' + (v >= 80 ? '#2F7A43' : v >= 60 ? '#C9A227' : '#B4442F') + '"></i></span>';
    const kc = (l, v, s, cls) => '<div' + (cls ? ' class="' + cls + '"' : '') + '><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="c mute">' + s + '</div></div>';
    // ① 표 — 전체면 대장별, 대장 하나면 그 대장의 브랜드별 (브랜드 차례 = 기준정보 순번)
    let groups;
    if (one) { const m = {}; rows.forEach((r) => { const b = r.brand || '(브랜드 없음)'; (m[b] = m[b] || []).push(r); }); groups = HS.bsort(Object.keys(m)).map((b) => [HS.bname(b), m[b]]); }
    else groups = R.SHEETS.filter((s) => (byKind[s.k] || []).length).map((s) => [s.short, byKind[s.k]]);
    const trs = groups.map(([nm, L]) => { const x = sum(L); const p = pc(x.done, x.n);
      return '<tr><td>' + esc(nm) + '</td><td class="n">' + fmt(x.n) + '</td><td class="n">' + (x.box ? fmt(x.box) : '-') + '</td><td class="n">' + fmt(x.done) + '</td><td class="n' + (x.ing ? ' cing' : '') + '">' + fmt(x.ing) + '</td><td class="n' + (x.wait ? ' cwait' : '') + '">' + fmt(x.wait) + '</td><td class="n">' + barH(p) + p.toFixed(1) + '%</td></tr>'; }).join('');
    // ② 인계 대기 — 오래된 순
    const W = rows.filter((r) => r.state === '인계대기').sort((a, b) => ((a.rec_date || '9') < (b.rec_date || '9') ? -1 : 1));
    const firstD = W.find((r) => r.rec_date); const maxD = firstD ? days(firstD.rec_date) : 0;
    const wline = (r) => { const d = r.rec_date ? days(r.rec_date) : null;
      const where = [!one ? esc((R.SPEC[r.kind] || {}).short || '') : '', r.brand ? '<b>' + esc(HS.bname(r.brand)) + '</b>' : '', esc(r.title || '')].filter(Boolean).join(' · ');
      return '<div class="ln"><span>' + (d != null ? '<span class="dday' + (d > LATE ? '' : ' m') + '">' + d + '일</span>' + md(r.rec_date) + ' ' : '<span class="dday m">-</span>') + where + '</span><span>' + (R.boxOf(r) ? fmt(R.boxOf(r)) + ' 박스' : '') + '</span></div>'; };
    const wRest = W.slice(TOPW); const wRestD = wRest.length && wRest[0].rec_date ? days(wRest[0].rec_date) : null;
    const wHtml = !W.length ? '<div class="none">✔ 인계 대기 없음</div>'
      : W.slice(0, TOPW).map(wline).join('') + (wRest.length ? '<div class="ln mute"><span>그 밖에 ' + fmt(wRest.length) + '건' + (wRestD != null ? ' (' + wRestD + '일 이하)' : '') + '</span><span>' + fmt(wRest.reduce((a, r) => a + R.boxOf(r), 0)) + ' 박스</span></div>' : '');
    // ② 정리 중 — 브랜드별
    const I = rows.filter((r) => r.state === '정리중'); const ib = {};
    I.forEach((r) => { const b = r.brand || '(브랜드 없음)'; const o = ib[b] || (ib[b] = { n: 0, box: 0 }); o.n++; o.box += R.boxOf(r); });
    const ibs = Object.keys(ib).sort((a, b) => ib[b].n - ib[a].n || HS.bcmp(a, b));
    const iRest = ibs.slice(TOPB); const iRs = iRest.reduce((a, b) => ({ n: a.n + ib[b].n, box: a.box + ib[b].box }), { n: 0, box: 0 });
    const iHtml = !I.length ? '<div class="none">✔ 정리 중인 반품 없음</div>'
      : ibs.slice(0, TOPB).map((b) => '<div class="ln"><span>' + esc(HS.bname(b)) + '</span><span><b class="warn">' + fmt(ib[b].n) + '</b> 건' + (ib[b].box ? ' · ' + fmt(ib[b].box) + ' 박스' : '') + '</span></div>').join('')
        + (iRest.length ? '<div class="ln mute"><span>' + esc(HS.bname(iRest[0])) + (iRest.length > 1 ? ' 외 ' + (iRest.length - 1) + '개 브랜드' : '') + '</span><span>' + fmt(iRs.n) + ' 건' + (iRs.box ? ' · ' + fmt(iRs.box) + ' 박스' : '') + '</span></div>' : '');
    const ttl = (one ? sp.label : yr + ' 반품') + ' 정리 현황 · ' + md(t0) + ' (' + dow + ')';
    const sub = (one ? '' : '대장 ' + groups.length + '개 · ') + (range ? range + ' · ' : '') + '박스 ' + fmt(T.box);
    const html = '<div class="rep-k rep-np rep-rc"><div class="hd"><div class="s">혜성물류 · 반품 정리 현황</div><div class="t">' + esc(ttl) + '</div><div class="d">' + esc(sub) + '</div></div>'
      + '<h4>① 전체 현황</h4>'
      + '<div class="big">'
      + kc('등록된 반품', fmt(T.n), '건')
      + kc('정리 완료', '<span class="ok">' + fmt(T.done) + '</span>', pc(T.done, T.n).toFixed(1) + '%', 'g')
      + kc('정리 중', '<span class="warn">' + fmt(T.ing) + '</span>', pc(T.ing, T.n).toFixed(1) + '%', 'y')
      + kc('인계 대기', '<span class="bad">' + fmt(T.wait) + '</span>', maxD ? '최장 ' + maxD + '일' : '-', 'r')
      + '</div>'
      + '<table><tr><th style="text-align:left">' + (one ? '브랜드' : '대장') + '</th><th>매장</th><th>박스</th><th>완료</th><th>중</th><th>대기</th><th>진행률</th></tr>' + trs
      + '<tr class="sum"><td>합계</td><td class="n">' + fmt(T.n) + '</td><td class="n">' + fmt(T.box) + '</td><td class="n">' + fmt(T.done) + '</td><td class="n">' + fmt(T.ing) + '</td><td class="n">' + fmt(T.wait) + '</td><td class="n">' + pc(T.done, T.n).toFixed(1) + '%</td></tr></table>'
      + '<div class="split"></div>'
      + '<h4 class="r">② 오늘 챙길 것 <small>· 인계 대기 ' + fmt(T.wait) + ' · 정리 중 ' + fmt(T.ing) + '</small></h4>'
      + '<div class="sh2 r">인계 대기 — 오래된 순</div>' + wHtml
      + '<div class="sh2 y">정리 중 — 브랜드별</div>' + iHtml
      + '<div class="foot">상태는 대장의 인계일자 · 정리일자로 자동 판정 · 빨강 = ' + LATE + '일 넘게 대기 · 혜성물류 회의자료</div></div>';
    const host = HS.el('<div style="position:fixed;left:-12000px;top:0;z-index:-1"></div>'); host.innerHTML = html; document.body.appendChild(host);
    try { await HS.snap(host.firstElementChild, '반품정리현황_' + (one ? sp.short.replace(/[·→()\s]/g, '') : '전체') + '_' + t0.replace(/-/g, '')); } finally { host.remove(); }
  }

  HS.view('rclean', {
    title: '반품 정리 현황', perm: 'returns',
    async render(body, p, tools) {
      const tab = KINDS.indexOf(p.k) >= 0 ? p.k : 'all';
      const go = (o) => HS.go('rclean', Object.assign({ k: tab, q: p.q || '', f: p.f || '', m: p.m || '' }, o));
      tools.appendChild(HS.seg([['all', '전체']].concat(R.SHEETS.map((s) => [s.k, s.short])), tab, (k) => go({ k, q: '' })));
      const canUp = HS.can('returns', 'create');
      if (canUp) { const b = HS.el('<button class="btn p">대장 엑셀 올리기</button>'); b.onclick = () => go({ up: p.up ? '' : '1' }); tools.appendChild(b); }
      const kb = HS.el('<button class="btn">📷 카톡용 이미지</button>'); tools.appendChild(kb);
      const xb = HS.el('<button class="btn gd">엑셀 내려받기</button>'); tools.appendChild(xb);

      const got = await Promise.all(KINDS.map((k) => HS.db.list('erp_records', { eq: { kind: k }, order: ['rec_date', false] }).catch(() => [])));
      const byKind = {}; KINDS.forEach((k, i) => (byKind[k] = got[i]));
      const all = [].concat.apply([], got);
      body.innerHTML = '';
      if (canUp && (p.up === '1' || !all.length)) body.appendChild(uploadCard(byKind, go));
      if (!all.length) { kb.remove(); if (!canUp) body.innerHTML = '<div class="card empty">아직 올린 대장이 없습니다.</div>'; return; }

      const rows = tab === 'all' ? all : byKind[tab];
      const sum = (L) => { const o = { n: L.length, qty: 0, box: 0, done: 0, ing: 0, wait: 0, last: null };
        L.forEach((r) => { o.qty += +r.qty || 0; o.box += R.boxOf(r); if (r.state === '정리완료') o.done++; else if (r.state === '정리중') o.ing++; else o.wait++; if (r.rec_date && (!o.last || r.rec_date > o.last)) o.last = r.rec_date; });
        return o; };
      const T = sum(rows);
      kb.onclick = () => kakaoCard(tab, rows, byKind, sum).catch(HS.err);
      const ds = rows.map((r) => r.rec_date).filter(Boolean).sort();
      const kp = (l, v, s, c) => '<div class="card kpi"><div class="l">' + l + '</div><div class="v ' + (c || '') + '">' + v + '</div><div class="s">' + s + '</div></div>';
      const oldest = rows.filter((r) => r.state === '인계대기' && r.rec_date).map((r) => r.rec_date).sort()[0];
      const lateD = oldest ? Math.round((new Date(today() + 'T00:00:00') - new Date(oldest + 'T00:00:00')) / 86400000) : 0;
      body.appendChild(HS.el('<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">' +
        kp('등록된 매장 (개)', fmt(T.n), (tab === 'all' ? KINDS.filter((k) => byKind[k].length).length + '개 대장 · ' : esc(R.SPEC[tab].label) + ' · ') + (ds.length ? esc(ds[0].slice(0, 7)) + ' ~ ' + esc(ds[ds.length - 1].slice(0, 7)) : '날짜 없음')) +
        kp('정리 완료 (매장)', fmt(T.done), pcs(T.done, T.n), 'pos') +
        kp('정리 중 (매장)', fmt(T.ing), '인계는 됐는데 정리일자 없음') +
        kp('인계 대기 (매장)', fmt(T.wait), '반품팀 인계일자 없음' + (lateD ? ' · 최장 <b>' + lateD + '일</b>' : ''), T.wait ? 'neg' : '') + '</div>'));

      if (tab === 'all') {
        const c = HS.el('<div class="card" style="margin-top:14px"><h3>대장별 정리 현황 <small>대장을 누르면 그 대장으로 갑니다</small></h3><div class="tw rt no-tools"></div></div>');
        c.querySelector('.tw').innerHTML = '<table><tr><th>대장</th><th class="n">매장 (개)</th><th class="n">수량 (PCS)</th><th class="n">박스 (BOX)</th><th class="n">정리 완료 (매장)</th><th class="n">정리 중 (매장)</th><th class="n">인계 대기 (매장)</th><th>진행률</th><th>최근 반품일</th></tr>' +
          R.SHEETS.map((s) => { const x = sum(byKind[s.k]); if (!x.n) return ''; const r = (x.done / x.n) * 100;
            return '<tr class="click" data-k="' + s.k + '"><td data-l="대장"><b>' + esc(s.label) + '</b></td><td class="n" data-l="매장">' + fmt(x.n) + '</td><td class="n" data-l="수량">' + fmt(x.qty) + '</td><td class="n" data-l="박스">' + (x.box ? fmt(x.box) : '<span class="mute">-</span>') + '</td><td class="n" data-l="완료">' + fmt(x.done) + '</td><td class="n" data-l="정리중"' + (x.ing ? ' style="color:var(--gold)"' : '') + '>' + fmt(x.ing) + '</td><td class="n' + (x.wait ? ' neg' : '') + '" data-l="대기">' + fmt(x.wait) + '</td><td data-l="진행률">' + bar(r) + r.toFixed(1) + '%</td><td class="mute" data-l="최근">' + (x.last ? esc(x.last.slice(5).replace('-', '/')) : '-') + '</td></tr>'; }).join('') +
          '<tr class="tot"><td>합계</td><td class="n">' + fmt(T.n) + '</td><td class="n">' + fmt(T.qty) + '</td><td class="n">' + fmt(T.box) + '</td><td class="n">' + fmt(T.done) + '</td><td class="n">' + fmt(T.ing) + '</td><td class="n">' + fmt(T.wait) + '</td><td>' + pcs(T.done, T.n) + '</td><td></td></tr></table>';
        c.querySelectorAll('tr[data-k]').forEach((tr) => (tr.onclick = () => go({ k: tr.dataset.k })));
        body.appendChild(c);
        xb.onclick = () => HS.download('반품정리현황_' + today() + '.xlsx', R.SHEETS.filter((s) => byKind[s.k].length).map((s) => { const x = sum(byKind[s.k]); return { 대장: s.label, '매장(개)': x.n, '수량(PCS)': x.qty, '박스(BOX)': x.box, '정리완료(매장)': x.done, '정리중(매장)': x.ing, '인계대기(매장)': x.wait, 최근반품일: x.last }; }), '대장별');
        return;
      }

      // ---------- 대장 하나 ----------
      const sp = R.SPEC[tab]; const cols = sp.cols.filter((c) => c.l !== 'No');
      const q = p.q || ''; const only = p.f !== 'all';
      let fl = rows;
      if (only) fl = fl.filter((r) => r.state !== '정리완료');
      if (q) fl = fl.filter((r) => JSON.stringify([r.brand, r.title, r.data]).indexOf(q) >= 0);
      fl = fl.slice().sort((a, b) => ((b.rec_date || '') < (a.rec_date || '') ? -1 : 1));
      const c = HS.el('<div class="card" style="margin-top:14px"><h3>' + esc(sp.label) + ' <small>' + fmt(rows.length) + '개 매장' + (only ? ' · 정리 안 끝난 곳 ' + fmt(fl.length) + '개' : '') + '</small><span class="sp"></span><input class="in" id="q" placeholder="검색 (브랜드 · 매장 · 사용처)" style="width:200px"><span id="fs" style="margin-left:6px"></span><button class="btn sm" id="xl" style="margin-left:6px">엑셀</button></h3><div class="tw rt no-tools" style="max-height:620px"></div><div class="mute" style="font-size:11.5px;margin-top:8px;line-height:1.7">· <b>상태</b>는 자동으로 봅니다 — 정리일자가 있거나 결과가 "완료"류면 정리 완료 · 인계일자만 있으면 정리 중 · 인계일자도 없으면 인계 대기<br>· 엑셀에 적힌 글자는 고치지 않고 그대로 보여 줍니다 ("왼료" 같은 오타도 완료로 읽습니다)<br>· 줄을 누르면 그 줄의 모든 칸을 보여 줍니다 (고치실 때는 엑셀에서 고쳐 다시 올리시면 됩니다)</div></div>');
      c.querySelector('#fs').appendChild(HS.seg([['', '정리 안 끝난 것'], ['all', '전체']], only ? '' : 'all', (f) => go({ f })));
      c.querySelector('.tw').innerHTML = '<table><tr><th>상태</th>' + cols.map((x) => '<th' + (x.t === 'n' ? ' class="n"' : '') + '>' + esc(x.l) + '</th>').join('') + '</tr>' +
        (fl.length ? fl.slice(0, 600).map((r, i) => '<tr class="click" data-i="' + i + '"><td data-l="상태">' + stTag(r.state) + '</td>' +
          cols.map((x) => { const v = (r.data || {})[x.l]; const raw = (r.data || {})['_' + x.l];
            return '<td' + (x.t === 'n' ? ' class="n"' : '') + ' data-l="' + esc(x.l) + '">' + (x.t === 'n' ? (v ? fmt(v) : '<span class="mute">-</span>') : dv(v)) + (raw ? ' <span class="mute" title="엑셀에 적힌 글자">(' + esc(raw) + ')</span>' : '') + '</td>'; }).join('') + '</tr>').join('')
          : '<tr><td colspan="' + (cols.length + 1) + '" class="empty">' + (q ? '찾는 매장이 없습니다' : only ? '정리 안 끝난 매장이 없습니다' : '자료가 없습니다') + '</td></tr>') +
        '</table>' + (fl.length > 600 ? '<div class="mute" style="padding:6px">600개까지 보여 줍니다 · 전체는 [엑셀]</div>' : '');
      const qi = c.querySelector('#q'); qi.value = q; qi.onchange = () => go({ q: qi.value });
      const xrow = (r) => { const o = { 상태: r.state }; cols.forEach((x) => (o[x.l] = (r.data || {})[x.l])); return o; };
      c.querySelector('#xl').onclick = () => HS.download('반품정리_' + sp.short + '_' + today() + '.xlsx', fl.map(xrow), sp.short.slice(0, 28));
      xb.onclick = () => HS.download('반품정리_' + sp.short + '_전체_' + today() + '.xlsx', rows.map(xrow), sp.short.slice(0, 28));
      c.querySelectorAll('tr[data-i]').forEach((tr) => (tr.onclick = async () => {
        const r = fl[+tr.dataset.i]; if (!r) return;
        const d = r.data || {};
        await HS.modal(sp.label, HS.el('<div class="tw"><table>' + Object.keys(d).filter((k) => k[0] !== '_').map((k) => '<tr><td class="mute" style="width:150px">' + esc(k) + '</td><td class="wrap">' + dv(d[k]) + (d['_' + k] ? ' <span class="mute">(엑셀: ' + esc(d['_' + k]) + ')</span>' : '') + '</td></tr>').join('') + '<tr><td class="mute">상태</td><td>' + stTag(r.state) + '</td></tr></table></div>'), [['닫기', null]], { wide: true });
      }));
      body.appendChild(c);
      HS.live(['erp_records'], () => { if (HS.cur === 'rclean' && !document.querySelector('.modal-bg')) HS.route(); });
    },
  });

  // ---------- 올리기 ----------
  function uploadCard(byKind, go) {
    const yNow = +today().slice(0, 4);
    const card = HS.el('<div class="card"><h3>대장 엑셀 올리기 <small>한 파일에 든 8개 시트를 한 번에</small><span class="sp"></span><label class="mute" style="font-size:12px">연도 없는 날짜는 <select class="in" id="yy" style="width:96px;display:inline-block"></select> 으로</label></h3>' +
      '<div class="rcz" id="dz">파일을 끌어다 놓거나 눌러서 고르기<br><span class="mute">매장 폐점 수시반품 대장 엑셀을 수정 없이 그대로</span></div><div id="pv" style="margin-top:10px"></div>' +
      '<div class="mute" style="font-size:11.5px;margin-top:8px;line-height:1.7">· 날짜 칸이 비어 있는 줄(엑셀에서 칸 합친 줄)은 <b>윗줄 값을 이어받습니다</b><br>· <b>1/7~1/14</b> · <b>1월02,03일</b> 처럼 여러 날이 적힌 줄은 <b>첫 날</b>로 넣고, 적힌 글자는 그대로 보관합니다<br>· 같은 파일을 다시 올려도 두 번 들어가지 않습니다 (줄마다 열쇠를 만들어 덮어씁니다)</div>' +
      '<input type="file" accept=".xlsx,.xlsm,.xls" class="hide"></div>');
    const ys = card.querySelector('#yy'); for (let y = yNow + 1; y >= yNow - 4; y--) ys.insertAdjacentHTML('beforeend', '<option' + (y === yNow ? ' selected' : '') + '>' + y + '년</option>');
    const fi = card.querySelector('input[type=file]'); const dz = card.querySelector('#dz'); const pv = card.querySelector('#pv');
    dz.onclick = () => fi.click();
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); load(e.dataTransfer.files[0]); };
    fi.onchange = () => load(fi.files[0]);
    ys.onchange = () => { if (last) load(last); };
    let last = null;
    async function load(f) {
      if (!f) return; last = f;
      dz.className = 'rcz'; dz.innerHTML = '읽는 중… (큰 파일은 10~20초)'; pv.innerHTML = '';
      await new Promise((r) => setTimeout(r, 30));
      let d;
      try { HS.needXlsx(); const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array', cellFormula: false, cellHTML: false, cellText: false });
        d = R.readBook(wb.SheetNames.map((n) => ({ name: n, ws: wb.Sheets[n] })), f.name, +ys.value.slice(0, 4));
      } catch (e) { dz.className = 'rcz bad'; dz.innerHTML = '✖ 파일을 열 수 없습니다 (' + esc(e.message) + ')'; return; }
      if (!d.found.length) { dz.className = 'rcz bad'; dz.innerHTML = '✖ <b>' + esc(f.name) + '</b> 에서 아는 대장을 찾지 못했습니다<br><span class="mute">' + d.miss.map((m) => esc(m.sheet) + ': ' + esc(m.why)).join(' · ') + '</span>'; return; }
      const ds = d.rows.map((r) => r.rec_date).filter(Boolean).sort();
      dz.className = 'rcz ok';
      dz.innerHTML = '✔ <b>' + esc(f.name) + '</b><br>' + d.found.length + '개 시트 · <b>' + fmt(d.rows.length) + '줄</b>' + (ds.length ? ' · 반품일자 ' + esc(ds[0]) + ' ~ ' + esc(ds[ds.length - 1]) : '');
      const have = {}; KINDS.forEach((k) => (have[k] = new Set((byKind[k] || []).map((r) => r.source_key))));
      const over = {}; d.rows.forEach((r) => { if (have[r.kind] && have[r.kind].has(r.source_key)) over[r.kind] = (over[r.kind] || 0) + 1; });
      const noDate = d.found.reduce((a, x) => a + x.noDate, 0);
      pv.innerHTML = '<div class="tw no-tools"><table><tr><th>시트</th><th>대장</th><th class="n">줄</th><th>기간</th><th class="n">수량</th><th class="n">박스</th><th>지금 DB</th></tr>' +
        d.found.map((x) => '<tr><td class="mute">' + esc(x.sheet) + '</td><td><b>' + esc(x.label) + '</b></td><td class="n">' + fmt(x.rows) + '</td><td class="mute">' + (x.from ? esc(x.from.slice(5).replace('-', '/')) + ' ~ ' + esc(x.to.slice(5).replace('-', '/')) : '-') + '</td><td class="n">' + fmt(x.qty) + '</td><td class="n">' + (x.box ? fmt(x.box) : '<span class="mute">-</span>') + '</td><td>' + (over[x.kind] ? '<span class="tag y">' + fmt(over[x.kind]) + '줄 덮어씀</span>' : '<span class="mute">새로 들어감</span>') + '</td></tr>').join('') + '</table></div>' +
        (d.miss.length ? '<div class="lock" style="margin-top:8px">읽지 않은 시트: ' + d.miss.map((m) => esc(m.sheet)).join(' · ') + '</div>' : '') +
        (noDate ? '<div class="lock" style="margin-top:8px;background:#FBE6E2;border-color:#F0B8AE">⚠ 날짜를 읽지 못한 줄 <b>' + fmt(noDate) + '</b>개 — 엑셀의 날짜 칸을 확인해 주세요 (그래도 등록은 됩니다 · 날짜 없이 들어갑니다)</div>' : '') +
        '<div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn p" id="reg">' + fmt(d.rows.length) + '줄 등록</button></div><div id="st" class="mute" style="text-align:right;margin-top:6px"></div>';
      pv.querySelector('#reg').onclick = async () => {
        const b = pv.querySelector('#reg'); b.disabled = true; const st = pv.querySelector('#st');
        try {
          await HS.db.upsert('erp_records', d.rows, (n, t) => (st.textContent = '저장 중… ' + fmt(n) + ' / ' + fmt(t)));
          await HS.db.insert('erp_uploads', { file_name: f.name.slice(0, 300), kinds: ['반품 정리 대장'], rows: d.rows.length, summary: Object.fromEntries(d.found.map((x) => [x.label, x.rows])) }).catch(() => {});
          HS.toast(fmt(d.rows.length) + '줄 등록했습니다', 'ok'); go({ up: '', k: 'all' });
        } catch (e) { b.disabled = false; st.textContent = ''; HS.err(e); }
      };
    }
    return card;
  }
})();
