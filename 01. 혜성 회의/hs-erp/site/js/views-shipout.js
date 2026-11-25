/* 정상팀 › 출고 현황 (전년대비)
 *  · 올해   = 지원팀 일일 마감 보고 (erp_daily_records · section b2b · 브랜드별 · data.out_qty)
 *  · 전년   = ① 전년도 일일 마감 보고가 있으면 그것 (올해와 같은 자료 = 같은 기준 비교) — 기본
 *             ② 없으면 물동량 (erp_volume · 출고 + 쿠팡출고) — 화주 단위라 브랜드로 쪼갤 수 없음
 *             → 브랜드를 고르면 무조건 ① (물동량은 브랜드로 못 나눔. 숫자를 나눠서 지어내지 않음 — 2026-11-11 사용자 확인)
 *             → 둘 다 있으면 tools 의 [전년 기준] 칸으로 고를 수 있음 (2026-11-11 추가)
 *  · 주차 규칙은 기존 엑셀과 같음: 그 주 금요일이 속한 달 (P2.weekTh)
 */
(function () {
  'use strict';
  const { esc, fmt, today, addDays } = HS;
  const P2 = window.HSParsers2;
  const OUTP = ['출고', '쿠팡출고'];
  const dd = (s) => new Date(s + 'T00:00:00');
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const monOf = (s) => { const d = dd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
  const md = (s) => s.slice(5).replace('-', '/');
  const lastOf = (ym) => iso(new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0));
  const DOW = ['월', '화', '수', '목', '금', '토', '일'];
  const dowIx = (s) => (dd(s).getDay() + 6) % 7;
  // 그 달에 속한 주 (금요일이 그 달)
  function weeksOf(ym) {
    const out = []; const seen = {};
    for (let x = addDays(ym + '-01', -7); x <= addDays(lastOf(ym), 7); x = addDays(x, 1)) {
      const m = monOf(x); if (seen[m]) continue; seen[m] = 1;
      const fri = addDays(m, 4); if (fri.slice(0, 7) !== ym) continue;
      out.push({ mon: m, sun: addDays(m, 6), w: P2.weekTh(fri) });
    }
    return out.sort((a, b) => (a.mon < b.mon ? -1 : 1));
  }
  const ownKey = (s) => { const t = String(s || '').replace(/\s/g, ''); if (/크리스/.test(t)) return '크리스'; if (/^LX|링스/.test(t)) return 'LX'; if (/로라/.test(t)) return '로라'; if (/슈퍼[웍윅]스/.test(t)) return '슈퍼웍스'; if (/네파/.test(t)) return '네파'; return t || '기타'; };
  const OWN_L = { 크리스: '크리스', LX: 'LX컴퍼니', 로라: '로라애슐리', 슈퍼웍스: '슈퍼윅스', 네파: '네파' };
  const rate = (c, p) => (p ? ((c / p - 1) * 100) : null);
  const rTag = (v) => (v == null ? '<span class="mute">-</span>' : '<span class="' + (v >= 0 ? 'pos' : 'neg') + '">' + (v >= 0 ? '▲ ' : '▼ ') + Math.abs(v).toFixed(1) + '%</span>');
  const dTag = (v) => (v == null ? '<span class="mute">-</span>' : '<span class="' + (v > 0 ? 'pos' : v < 0 ? 'neg' : 'mute') + '">' + (v > 0 ? '+' : '') + fmt(v) + '</span>');
  const nz = (v) => (v ? fmt(v) : '<span class="mute">-</span>');

  HS.view('shipout', {
    title: '출고 현황', perm: 'daily',
    async render(body, p, tools) {
      const nowY = +today().slice(0, 4);
      const y = +(p.y || nowY), py = y - 1;
      const brandF = p.b || '';
      const srcP = p.s || '';
      const go = (o) => HS.go('shipout', Object.assign({ y: String(y), b: brandF, s: srcP }, o));
      tools.appendChild(HS.seg([nowY, nowY - 1, nowY - 2].map((x) => [String(x), x + '년']), String(y), (v) => go({ y: v })));
      const [dy, dp, vol] = await Promise.all([
        HS.db.list('erp_daily_records', { eq: { section: 'b2b' }, gte: { rec_date: y + '-01-01' }, lte: { rec_date: y + '-12-31' } }).catch(() => []),
        HS.db.list('erp_daily_records', { eq: { section: 'b2b' }, gte: { rec_date: py + '-01-01' }, lte: { rec_date: py + '-12-31' } }).catch(() => []),
        HS.db.list('erp_volume', { gte: { rec_date: py + '-01-01' }, lte: { rec_date: py + '-12-31' } }).catch(() => []),
      ]);
      const out = (r) => +((r.data || {}).out_qty) || 0;
      const bNames = [...new Set(dy.concat(dp).map((r) => r.rec_key).filter(Boolean))];
      const bOrder = HS.cache.brands.slice().sort((a, b) => (+a.sort || 0) - (+b.sort || 0)).map((x) => x.name);
      bNames.sort((a, b) => bOrder.indexOf(a) - bOrder.indexOf(b));
      const bs = HS.el('<select class="in" style="width:160px"><option value="">전체 브랜드</option>' + bNames.map((b) => '<option value="' + esc(b) + '"' + (b === brandF ? ' selected' : '') + '>' + esc(HS.bname(b)) + '</option>').join('') + '</select>');
      bs.onchange = () => go({ b: bs.value }); tools.appendChild(bs);
      const volOut = vol.filter((v) => OUTP.indexOf(v.proc) >= 0);
      const lastCur = dy.map((r) => r.rec_date).sort().pop() || null;
      const lastVol = volOut.map((v) => v.rec_date).sort().pop() || null;
      // 전년 기준 — 브랜드를 고르면 무조건 마감 보고 (물동량은 화주 단위라 못 나눔)
      // 전체 브랜드일 때: 전년 마감 보고가 1년치에 가깝게(P_FULL 일 이상) 있으면 그것을 기본으로 씀 (올해와 같은 자료 = 같은 기준)
      // 며칠치만 올라와 있으면 전년 합계가 실제보다 낮게 나오므로 물동량을 기본으로 씀
      const P_FULL = 150; // 1년 영업일의 약 60%
      const pDays = new Set(dp.map((r) => r.rec_date)).size;
      const haveP = pDays > 0, haveV = volOut.length > 0, pFull = pDays >= P_FULL;
      const psrc = brandF ? 'daily' : (srcP === 'vol' && haveV ? 'vol' : srcP === 'daily' && haveP ? 'daily' : !haveV || pFull ? (haveP ? 'daily' : 'vol') : 'vol');
      if (!brandF && haveP && haveV) tools.appendChild(HS.seg([['daily', py + ' 마감 보고'], ['vol', py + ' 물동량']], psrc, (v) => go({ s: v })));
      tools.appendChild(HS.el('<span class="pill">마감 보고 ' + esc(lastCur ? md(lastCur) : '없음') + ' · ' + py + ' 마감 보고 ' + (haveP ? fmt(pDays) + '일' : '<span class="neg">없음</span>') + ' · ' + py + ' 물동량 ' + esc(lastVol ? lastVol.slice(0, 7) : '없음') + '</span>'));
      const xb = HS.el('<button class="btn gd">엑셀 내려받기</button>'); tools.appendChild(xb);

      body.innerHTML = '';
      if (!dy.length && !volOut.length) { body.innerHTML = '<div class="card empty">' + y + '년 출고 자료가 없습니다.<br><span class="mute" style="font-size:12px">올해는 <a href="#/daily">지원팀 일일 마감 보고</a>, 전년은 <a href="#/volume">물동량</a> 자료를 씁니다.</span></div>'; return; }

      // 날짜별 합계 (고른 브랜드 기준)
      const curD = {}; dy.forEach((r) => { if (brandF && r.rec_key !== brandF) return; curD[r.rec_date] = (curD[r.rec_date] || 0) + out(r); });
      const prevD = {};
      if (psrc === 'daily') dp.forEach((r) => { if (brandF && r.rec_key !== brandF) return; prevD[r.rec_date] = (prevD[r.rec_date] || 0) + out(r); });
      else volOut.forEach((v) => { prevD[v.rec_date] = (prevD[v.rec_date] || 0) + (+v.qty || 0); });
      const prevIsDaily = psrc === 'daily';
      const sumR = (M, a, b) => { let s = 0; for (const k in M) if (k >= a && k <= b) s += M[k]; return s; };
      const hasPrev = Object.keys(prevD).length > 0;

      body.appendChild(HS.el('<div class="lock" style="margin-bottom:14px;font-size:12px;line-height:1.8">' +
        '올해(<b>' + y + '</b>)는 <b>지원팀 일일 마감 보고</b>의 브랜드별 출고수량, 전년(<b>' + py + '</b>)은 ' + (prevIsDaily ? '<b>' + py + '년 일일 마감 보고</b>' : '<b>물동량</b>(출고 + 쿠팡출고)') + ' 입니다.' +
        (prevIsDaily && !brandF ? ' 올해와 <b>같은 자료</b>라 같은 기준으로 비교합니다.' + (pFull ? '' : '<br><span class="neg">⚠ ' + py + '년 마감 보고가 ' + fmt(pDays) + '일치뿐입니다 — 전년 숫자가 실제보다 낮습니다.</span> 위 [' + py + ' 물동량] 으로 바꿔 보세요.') : '') +
        (!prevIsDaily && !brandF ? ' 물동량은 B2C · 쿠팡까지 들어 있어 마감 보고와 범위가 다릅니다.' : '') +
        (brandF && !hasPrev ? '<br><span class="neg">⚠ ' + esc(HS.bname(brandF)) + ' 는 ' + py + '년 일일 마감 보고가 없어 전년 칸이 비어 있습니다.</span> 물동량은 화주 단위라 브랜드로 쪼갤 수 없습니다 — 아래 <b>화주 묶음</b> 줄에서 보세요.' : '') + '</div>'));

      // ---------- ① 월별 ----------
      const mons = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
      let cc = 0, pp = 0; const mRows = [];
      mons.forEach((mm) => {
        const c = sumR(curD, y + '-' + mm + '-01', y + '-' + mm + '-31');
        const q = sumR(prevD, py + '-' + mm + '-01', py + '-' + mm + '-31');
        cc += c; pp += q; mRows.push({ mm, c, q, cc, pp, cur: lastCur && lastCur.slice(0, 7) === y + '-' + mm });
      });
      const c1 = HS.el('<div class="card" id="so1"><h3>① 월별 출고 현황 <small>' + y + ' ↔ ' + py + (brandF ? ' · ' + esc(HS.bname(brandF)) : ' · 전체 브랜드') + '</small><span class="sp"></span><span class="mute" style="font-size:11.5px">진행 중인 달은 증감률을 내지 않습니다 (기간이 달라서)</span></h3><div class="tw rt no-tools"></div></div>');
      c1.querySelector('.tw').innerHTML = '<table><tr><th>월</th><th class="n">' + y + '</th><th class="n">' + py + '</th><th class="n">증감</th><th>증감률</th><th class="n">누계 ' + y + '</th><th class="n">누계 ' + py + '</th><th>누계 증감률</th></tr>' +
        mRows.map((r) => '<tr' + (r.cur ? ' style="outline:2px dashed var(--gold);outline-offset:-2px"' : '') + '><td data-l="월"><b>' + (+r.mm) + '월</b>' + (r.cur ? ' <span class="tag y">이번 달</span>' : '') + '</td><td class="n" data-l="올해">' + nz(r.c) + '</td><td class="n" data-l="전년">' + nz(r.q) + '</td><td class="n" data-l="증감">' + (r.c && r.q ? dTag(r.c - r.q) : '<span class="mute">-</span>') + '</td><td data-l="증감률">' + (r.cur ? '<span class="mute">' + esc(md(lastCur)) + ' 까지 · 진행 중</span>' : r.c && r.q ? rTag(rate(r.c, r.q)) : '<span class="mute">-</span>') + '</td><td class="n" data-l="누계 올해">' + nz(r.cc) + '</td><td class="n" data-l="누계 전년">' + nz(r.pp) + '</td><td data-l="누계 증감률">' + (r.cc && r.pp ? rTag(rate(r.cc, r.pp)) : '<span class="mute">-</span>') + '</td></tr>').join('') +
        '<tr class="tot"><td>합계</td><td class="n">' + nz(cc) + '</td><td class="n">' + nz(pp) + '</td><td class="n">' + (cc && pp ? dTag(cc - pp) : '-') + '</td><td>' + (cc && pp ? rTag(rate(cc, pp)) : '-') + '</td><td class="n"></td><td class="n"></td><td></td></tr></table>';
      body.appendChild(c1);

      // ---------- 브랜드별 연간 누계 ----------
      const upto = lastCur || y + '-12-31';
      const uptoP = py + upto.slice(4);
      const curB = {}; dy.forEach((r) => { if (r.rec_date > upto) return; curB[r.rec_key] = (curB[r.rec_key] || 0) + out(r); });
      const prevB = {}; dp.forEach((r) => { if (r.rec_date > uptoP) return; prevB[r.rec_key] = (prevB[r.rec_key] || 0) + out(r); });
      const ownOf = (b) => ownKey((HS.cache.brandMap && HS.cache.brandMap[b] && HS.cache.brandMap[b].owner) || '');
      const prevO = {};
      if (prevIsDaily) Object.keys(prevB).forEach((b) => { const k = ownOf(b); prevO[k] = (prevO[k] || 0) + prevB[b]; });
      else volOut.forEach((v) => { if (v.rec_date > uptoP) return; const k = ownKey(v.owner); prevO[k] = (prevO[k] || 0) + (+v.qty || 0); });
      const curO = {}; Object.keys(curB).forEach((b) => { const k = ownOf(b); curO[k] = (curO[k] || 0) + curB[b]; });
      const bList = Object.keys(curB).sort((a, b) => curB[b] - curB[a]);
      const curT = bList.reduce((a, b) => a + curB[b], 0);
      const prevT = Object.values(prevO).reduce((a, n) => a + n, 0);
      const oList = [...new Set(Object.keys(curO).concat(Object.keys(prevO)))].sort((a, b) => (curO[b] || 0) - (curO[a] || 0));
      const c2 = HS.el('<div class="card" id="so2" style="margin-top:14px"><h3>브랜드별 연간 누계 <small>' + y + '-01-01 ~ ' + esc(upto) + ' · 전년 같은 기간</small><span class="sp"></span><span class="mute" style="font-size:11.5px">브랜드를 누르면 ① 표가 그 브랜드 것으로 바뀝니다</span></h3><div class="tw rt no-tools"></div><div class="mute" style="font-size:11.5px;margin-top:8px;line-height:1.7">· 브랜드 줄의 전년 칸은 <b>' + py + '년 일일 마감 보고</b>가 있어야 나옵니다' + (prevIsDaily ? '<br>· <b>화주 묶음</b> 줄과 합계도 ' + py + '년 마감 보고를 화주로 묶은 값입니다 (올해와 같은 기준)' : '<br>· <b>화주 묶음</b> 줄과 합계의 전년은 <b>물동량</b> 기준이라 언제나 나옵니다 (올해는 마감 보고를 화주로 묶은 값)') + '</div></div>');
      c2.querySelector('.tw').innerHTML = '<table><tr><th>브랜드</th><th>화주</th><th class="n">' + y + ' 누계</th><th class="n">' + py + ' 누계</th><th class="n">증감</th><th>증감률</th><th class="n">비중</th></tr>' +
        bList.map((b) => { const c = curB[b], q = prevB[b] || 0;
          return '<tr class="click" data-b="' + esc(b) + '"><td data-l="브랜드"><b>' + esc(HS.bname(b)) + '</b></td><td class="mute" data-l="화주">' + esc(OWN_L[ownOf(b)] || ownOf(b)) + '</td><td class="n" data-l="올해">' + nz(c) + '</td><td class="n" data-l="전년">' + (q ? fmt(q) : '<span class="mute">-</span>') + '</td><td class="n" data-l="증감">' + (q ? dTag(c - q) : '<span class="mute">-</span>') + '</td><td data-l="증감률">' + (q ? rTag(rate(c, q)) : '<span class="tag">' + py + ' 마감 보고 없음</span>') + '</td><td class="n" data-l="비중">' + (curT ? ((c / curT) * 100).toFixed(1) + '%' : '-') + '</td></tr>'; }).join('') +
        oList.map((k) => { const c = curO[k] || 0, q = prevO[k] || 0;
          return '<tr style="background:#F7F9FC"><td colspan="2" data-l="화주 묶음"><b>' + esc(OWN_L[k] || k) + '</b> <span class="mute">화주 묶음</span></td><td class="n b" data-l="올해">' + nz(c) + '</td><td class="n b" data-l="전년">' + nz(q) + '</td><td class="n" data-l="증감">' + (c && q ? dTag(c - q) : '<span class="mute">-</span>') + '</td><td data-l="증감률">' + (c && q ? rTag(rate(c, q)) : '<span class="mute">-</span>') + '</td><td class="n" data-l="비중">' + (curT ? ((c / curT) * 100).toFixed(1) + '%' : '-') + '</td></tr>'; }).join('') +
        '<tr class="tot"><td colspan="2">합계</td><td class="n">' + nz(curT) + '</td><td class="n">' + nz(prevT) + '</td><td class="n">' + (curT && prevT ? dTag(curT - prevT) : '-') + '</td><td>' + (curT && prevT ? rTag(rate(curT, prevT)) : '-') + '</td><td class="n">100%</td></tr></table>';
      c2.querySelectorAll('tr[data-b]').forEach((tr) => (tr.onclick = () => go({ b: tr.dataset.b === brandF ? '' : tr.dataset.b })));
      body.appendChild(c2);

      // ---------- ② 주단위 · ③ 일별 ----------
      const two = HS.el('<div class="row2" style="margin-top:14px"></div>'); body.appendChild(two);
      const base = lastCur || today();
      // 2026-11-23: 금주 · 차주는 '오늘' 이 든 주 기준 (마감 보고가 하루 이틀 늦게 들어와도 주가 밀리지 않게)
      //  · 지난 해를 볼 때는 오늘이 그 해에 없으므로 그 해 마지막 자료 기준
      const anc2 = y === nowY ? today() : base;
      const curYm = anc2.slice(0, 7); const d0 = dd(curYm + '-01'); d0.setMonth(d0.getMonth() - 1);
      const preYm = iso(d0).slice(0, 7);
      const wList = weeksOf(preYm).concat(weeksOf(curYm));
      // 전년 같은 주: 작년 같은 달에서 주차 이름이 같은 주
      const pw = {}; [preYm, curYm].forEach((ym) => weeksOf(py + ym.slice(4)).forEach((w) => (pw[w.w] = w)));
      const nowMon = monOf(anc2);
      let tc = 0, tq = 0;
      const wRows = wList.map((w) => { const c = sumR(curD, w.mon, w.sun); const o = pw[w.w]; const q = o ? sumR(prevD, o.mon, o.sun) : 0; tc += c; tq += q; return { w, c, q, o, cur: w.mon === nowMon }; });
      const c3 = HS.el('<div class="card" id="so3"><h3>② 전월 · 당월 출고 현황 <small>주단위 · 전년 같은 주</small></h3><div class="tw rt no-tools"></div><div class="mute" style="font-size:11.5px;margin-top:8px;line-height:1.7">· 주차는 기존 엑셀과 같은 규칙 (그 주 금요일이 속한 달)<br>· 전년 동주 = ' + py + '년 같은 달 같은 주차<br>· 지금 전년 칸은 <b>' + (psrc === 'vol' ? py + '년 물동량' : py + '년 일일 마감 보고') + '</b>으로 그렸습니다' + (psrc === 'vol' ? ' — 마감 보고가 ' + (pDays ? fmt(pDays) + '일치뿐이라' : '없어서') + ' 물동량을 씁니다. [설정 › 엑셀 · 물동량 업로드]에 ' + py + '년 일일업무수불을 올리면 마감 보고로 바뀝니다' : '') + '</div></div>');
      // 전년 칸이 어느 자료로 그려졌는지 머리에 적어 둔다 — 비어 보일 때 왜 그런지 바로 알 수 있게 (2026-11-19)
      c3.querySelector('.tw').innerHTML = '<table><tr><th>주차</th><th>기간</th><th class="n">' + y + '</th><th class="n">' + py + ' 동주<br><span class="mute" style="font-weight:400;font-size:11px">' + (psrc === 'vol' ? '물동량 자료' : '마감 보고 ' + fmt(pDays) + '일') + '</span></th><th>증감률</th></tr>' +
        wRows.map((r) => '<tr' + (r.cur ? ' style="outline:2px dashed var(--gold);outline-offset:-2px"' : '') + '><td data-l="주차"><b>' + esc(r.w.w) + '</b>' + (r.cur ? ' <span class="tag y">이번 주</span>' : '') + '</td><td class="mute" data-l="기간">' + md(r.w.mon) + ' ~ ' + md(r.w.sun) + '</td><td class="n" data-l="올해">' + nz(r.c) + '</td><td class="n" data-l="전년">' + nz(r.q) + '</td><td data-l="증감률">' + (r.cur ? '<span class="mute">' + esc(md(base)) + ' 까지</span>' : r.c && r.q ? rTag(rate(r.c, r.q)) : '<span class="mute">-</span>') + '</td></tr>').join('') +
        '<tr class="tot"><td>합계</td><td></td><td class="n">' + nz(tc) + '</td><td class="n">' + nz(tq) + '</td><td>' + (tc && tq ? rTag(rate(tc, tq)) : '-') + '</td></tr></table>';
      two.appendChild(c3);
      // ③ 금주 출고 현황 — 요일 맞춰서 (2026-11-23: '일별 출고 현황' 에서 이름 바꿈)
      const curW = wList.find((w) => w.mon === nowMon) || wList[wList.length - 1];
      const preW = { mon: addDays(curW.mon, -7), sun: addDays(curW.mon, -1) };
      const lyW = pw[curW.w] || null;
      const c4 = HS.el('<div class="card" id="so4"><h3>③ 금주 출고 현황 <small>' + py + ' 동월 동일주 · 전주 · 금주 · <b>요일 맞춰서</b></small></h3><div class="tw rt no-tools"></div><div class="mute" style="font-size:11.5px;margin-top:8px;line-height:1.7">· 날짜가 아니라 <b>요일</b>을 맞춰 비교합니다 (' + py + ' ' + esc(curW.w) + '의 월요일 ↔ ' + y + ' ' + esc(curW.w) + '의 월요일)<br>· 전년 칸은 ' + (prevIsDaily ? py + '년 <b>일일 마감 보고</b>가' : '<b>물동량</b>(일자별)이') + ' 있어야 나옵니다</div></div>');
      let ly = 0, pr = 0, cu = 0;
      c4.querySelector('.tw').innerHTML = '<table><tr><th>요일</th><th class="n">' + py + ' ' + esc(curW.w) + '</th><th class="n">전주</th><th class="n">금주</th><th>전년대비</th></tr>' +
        DOW.map((w, i) => {
          const ld = lyW ? addDays(lyW.mon, i) : null; const pd = addDays(preW.mon, i); const cd2 = addDays(curW.mon, i);
          const a = ld ? prevD[ld] || 0 : 0, b = curD[pd] || 0, c = curD[cd2] || 0; ly += a; pr += b; cu += c;
          return '<tr><td data-l="요일"><b>' + w + '</b></td><td class="n" data-l="전년">' + nz(a) + (a && ld ? ' <span class="mute">' + md(ld) + '</span>' : '') + '</td><td class="n" data-l="전주">' + nz(b) + (b ? ' <span class="mute">' + md(pd) + '</span>' : '') + '</td><td class="n b" data-l="금주">' + nz(c) + (c ? ' <span class="mute">' + md(cd2) + '</span>' : '') + '</td><td data-l="전년대비">' + (a && c ? rTag(rate(c, a)) : '<span class="mute">-</span>') + '</td></tr>';
        }).join('') +
        '<tr class="tot"><td>합계</td><td class="n">' + nz(ly) + '</td><td class="n">' + nz(pr) + '</td><td class="n">' + nz(cu) + '</td><td>' + (ly && cu ? rTag(rate(cu, ly)) : '<span class="mute">진행 중</span>') + '</td></tr></table>';
      two.appendChild(c4);

      // ④ 차주 출고 현황 (2026-11-23 행님 지시) — 전년 같은 주로 다음 주를 가늠한다
      const nxtW = { mon: addDays(curW.mon, 7), sun: addDays(curW.mon, 13) };
      nxtW.w = P2.weekTh(addDays(nxtW.mon, 4));
      // 전년 같은 주 = 전년 같은 달 · 같은 주차 이름 (차주가 다음 달로 넘어갈 수 있어 그 달도 같이 찾아 둔다)
      const nxtYm = addDays(nxtW.mon, 4).slice(0, 7);
      const pw2 = Object.assign({}, pw); weeksOf(py + nxtYm.slice(4)).forEach((w) => (pw2[w.w] = pw2[w.w] || w));
      const lyN = pw2[nxtW.w] || null;
      const c5 = HS.el('<div class="card" id="so5" style="margin-top:14px"><h3>④ 차주 출고 현황 <small>' + esc(nxtW.w) + ' · ' + esc(md(nxtW.mon)) + ' ~ ' + esc(md(nxtW.sun)) + ' · 전년 같은 주와 나란히</small></h3><div class="tw rt no-tools"></div>'
        + '<div class="mute" style="font-size:11.5px;margin-top:8px;line-height:1.7">· <b>차주</b> 칸은 그날 마감 보고가 들어오면 채워집니다 (앞날은 비어 있는 것이 맞습니다)<br>· <b>' + py + ' 차주</b> = ' + py + '년 같은 달 ' + esc(nxtW.w) + ' · 요일을 맞춰 비교합니다<br>· 전년 칸은 ' + (prevIsDaily ? py + '년 <b>일일 마감 보고</b>가' : '<b>물동량</b>(일자별)이') + ' 있어야 나옵니다</div></div>');
      let nly = 0, ncu = 0, nnx = 0;
      c5.querySelector('.tw').innerHTML = '<table><tr><th>요일</th><th class="n">' + py + ' ' + esc(nxtW.w) + '</th><th class="n">금주</th><th class="n">차주</th><th>전년대비</th></tr>' +
        DOW.map((w, i) => {
          const ld = lyN ? addDays(lyN.mon, i) : null; const cd2 = addDays(curW.mon, i); const nd = addDays(nxtW.mon, i);
          const a = ld ? prevD[ld] || 0 : 0, c = curD[cd2] || 0, n = curD[nd] || 0; nly += a; ncu += c; nnx += n;
          return '<tr><td data-l="요일"><b>' + w + '</b></td><td class="n" data-l="전년 차주">' + nz(a) + (a && ld ? ' <span class="mute">' + md(ld) + '</span>' : '') + '</td><td class="n" data-l="금주">' + nz(c) + (c ? ' <span class="mute">' + md(cd2) + '</span>' : '') + '</td><td class="n b" data-l="차주">' + nz(n) + ' <span class="mute">' + md(nd) + '</span></td><td data-l="전년대비">' + (a && n ? rTag(rate(n, a)) : '<span class="mute">-</span>') + '</td></tr>';
        }).join('') +
        '<tr class="tot"><td>합계</td><td class="n">' + nz(nly) + '</td><td class="n">' + nz(ncu) + '</td><td class="n">' + nz(nnx) + '</td><td>' + (nly && nnx ? rTag(rate(nnx, nly)) : '<span class="mute">앞날</span>') + '</td></tr></table>';
      two.appendChild(c5);

      xb.onclick = () => HS.download('출고현황_' + y + '_' + (brandF ? HS.bname(brandF) + '_' : '') + today() + '.xlsx',
        mRows.map((r) => ({ 월: +r.mm + '월', ['' + y]: r.c, ['' + py]: r.q, 증감: r.c && r.q ? r.c - r.q : null, 증감률: r.c && r.q ? +(rate(r.c, r.q)).toFixed(1) : null, ['누계 ' + y]: r.cc, ['누계 ' + py]: r.pp })), y + ' 월별');
      HS.live(['erp_daily_records', 'erp_volume'], () => { if (HS.cur === 'shipout') HS.route(); });
    },
  });
})();
