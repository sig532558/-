/* 설정 › 저장 공간 — Supabase 누적 용량 · 하루 사용량 · 한도(500MB) 도달 예상일
 *  · 매일 00:10(한국) DB가 스스로 용량을 기록(erp_usage_log) → 기록끼리 비교해 하루 사용량 · 예상일 계산
 *  · 70% 노란 알림 · 85% 빨간 알림 · 예상일 30일 이내 미리 알림 (관리자 접속 시 · 대시보드 맨 위)
 *  · 인터넷 전송량(5GB) · 접속 수는 Supabase 관리 화면에서만 보임 */
(function () {
  'use strict';
  const { esc, fmt, today, addDays } = HS;
  const MBf = (b) => (b == null ? '-' : b < 1048576 ? Math.max(1, Math.round(b / 1024)) + 'KB' : (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + 'MB');
  const mb1 = (b) => (b / 1048576).toFixed(1);
  const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  let cached = null; // 최근 계산 (대시보드 알림 줄용 · 10분)
  const lbl = (n) => (HS.TBL_L && HS.TBL_L[n]) || '기타 (' + n.replace(/^erp_/, '') + ')';

  // 계산: 최근 14일 평균 하루 증가 → 남은 공간 ÷ 평균 = 남은 일수
  HS.storageCalc = (u) => {
    const t = today(); const hist = (u.hist || []).filter((h) => h.db != null).slice().sort((a, b) => (a.d < b.d ? -1 : 1));
    if (!hist.length || hist[hist.length - 1].d !== t) hist.push({ d: t, db: u.db_bytes, file: u.file_bytes, tables: u.tables });
    else hist[hist.length - 1] = Object.assign({}, hist[hist.length - 1], { db: u.db_bytes, file: u.file_bytes != null ? u.file_bytes : hist[hist.length - 1].file });
    const last = hist[hist.length - 1]; const diffs = [];
    for (let i = 1; i < hist.length; i++) { const g = dayDiff(hist[i - 1].d, hist[i].d); if (g > 0) diffs.push({ d: hist[i].d, v: (hist[i].db - hist[i - 1].db) / g, f: hist[i].file != null && hist[i - 1].file != null ? (hist[i].file - hist[i - 1].file) / g : null }); }
    const baseOf = (n) => hist.find((h) => dayDiff(h.d, t) <= n && h.d !== t) || null;
    const b14 = baseOf(14); const days14 = b14 ? dayDiff(b14.d, t) : 0;
    const avg = days14 ? (last.db - b14.db) / days14 : null;
    const fAvg = days14 && b14.file != null && last.file != null ? (last.file - b14.file) / days14 : null;
    const prev = hist.filter((h) => { const k = dayDiff(h.d, t); return k >= 15 && k <= 45; }); let prevAvg = null;
    if (prev.length >= 2) { const a = prev[0], b = prev[prev.length - 1]; const g = dayDiff(a.d, b.d); if (g > 0) prevAvg = (b.db - a.db) / g; }
    const left = u.limit_bytes - u.db_bytes; const daysLeft = avg && avg > 0 ? Math.ceil(left / avg) : null;
    const pct = u.db_bytes / u.limit_bytes * 100;
    const level = pct >= 85 || (daysLeft != null && daysLeft <= 30) ? 'red' : pct >= 70 ? 'yellow' : 'ok';
    // 항목별 하루 증가 (기준일 표와 비교)
    const growth = {}; if (b14 && b14.tables && days14) { const bm = {}; (b14.tables || []).forEach((x) => (bm[x.name] = x.bytes)); (u.tables || []).forEach((x) => { if (bm[x.name] != null) growth[x.name] = (x.bytes - bm[x.name]) / days14; }); }
    return { hist, diffs, avg, fAvg, prevAvg, daysLeft, eta: daysLeft != null ? addDays(t, daysLeft) : null, pct, level, growth, sampleDays: days14, left };
  };

  function lineChart(u, C) {
    const W = 820, H = 300, X0 = 54, X1 = 800, Y0 = 258, Y1 = 22; const t = today();
    const past = C.hist.filter((h) => dayDiff(h.d, t) <= 60); const D0 = past.length ? -dayDiff(past[0].d, t) : -1;
    const ahead = C.daysLeft != null ? Math.min(Math.max(C.daysLeft + 10, 30), 400) : 30; const D1 = ahead; const M = u.limit_bytes * 1.1;
    const x = (d) => X0 + (d - Math.min(D0, -1)) / (D1 - Math.min(D0, -1)) * (X1 - X0), y = (v) => Y0 - v / M * (Y0 - Y1);
    let h = '';
    for (let v = 0; v <= 500; v += 100) { const yy = y(v * 1048576); h += '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + yy + '" y2="' + yy + '" stroke="#EEF1F6"/><text x="' + (X0 - 8) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="#6B7486">' + v + '</text>'; }
    const yl = y(u.limit_bytes); h += '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + yl + '" y2="' + yl + '" stroke="#C2412D" stroke-width="1.5" stroke-dasharray="5 4"/><text x="' + (X0 + 6) + '" y="' + (yl - 6) + '" font-size="11" fill="#C2412D" font-weight="700">한도 500MB</text>';
    const pts = past.map((p) => [x(-dayDiff(p.d, t)), y(p.db)]);
    if (pts.length > 1) h += '<path d="' + pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('') + '" fill="none" stroke="#2F5BD3" stroke-width="2.5"/>';
    const cx = x(0), cy = y(u.db_bytes);
    if (C.avg && C.avg > 0) { const dEnd = Math.min(C.daysLeft, D1), vEnd = u.db_bytes + C.avg * dEnd; h += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x(dEnd) + '" y2="' + y(vEnd) + '" stroke="#9AB0EA" stroke-width="2" stroke-dasharray="6 4"/>';
      if (C.daysLeft <= D1) h += '<circle cx="' + x(C.daysLeft) + '" cy="' + yl + '" r="5" fill="#2F5BD3"/><text x="' + Math.min(x(C.daysLeft), X1 - 34) + '" y="' + (yl + 20) + '" text-anchor="middle" font-size="11.5" fill="#2F5BD3" font-weight="700">' + esc(C.eta) + '</text>'; }
    h += '<line x1="' + cx + '" x2="' + cx + '" y1="' + Y1 + '" y2="' + Y0 + '" stroke="#C9D0DC" stroke-dasharray="2 3"/><circle cx="' + cx + '" cy="' + cy + '" r="5" fill="#2F5BD3"/><text x="' + (cx + 8) + '" y="' + (cy + 18) + '" font-size="11.5" fill="#0F1E3D" font-weight="700">오늘 ' + mb1(u.db_bytes) + 'MB</text>';
    const span = D1 - Math.min(D0, -1), step = span > 240 ? 60 : span > 120 ? 30 : 15;
    for (let d = Math.ceil(Math.min(D0, -1) / step) * step; d <= D1; d += step) { const dd = addDays(t, d); h += '<text x="' + x(d) + '" y="' + (Y0 + 18) + '" text-anchor="middle" font-size="11" fill="#6B7486">' + (d === 0 ? '오늘' : +dd.slice(5, 7) + '/' + +dd.slice(8)) + '</text>'; }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="누적 용량 추이">' + h + '</svg>';
  }
  function barChart(C) {
    const v = C.diffs.slice(-14); if (!v.length) return '<div class="empty" style="padding:40px 0">기록이 이틀 이상 쌓이면 하루 사용량이 보입니다<br><span class="mute" style="font-size:12px">매일 밤 00:10 자동 기록</span></div>';
    const W = 480, X0 = 40, PW = 425, Y0 = 258, HH = 220; const mx = Math.max(0.5, ...v.map((a) => Math.abs(a.v) / 1048576)) * 1.15; const bw = PW / Math.max(v.length, 7);
    let h = ''; const st = mx > 8 ? 2 : mx > 3 ? 1 : 0.5;
    for (let s = 0; s <= mx; s += st) { const yy = Y0 - s / mx * HH; h += '<line x1="' + X0 + '" x2="' + (X0 + PW) + '" y1="' + yy + '" y2="' + yy + '" stroke="#EEF1F6"/><text x="' + (X0 - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="#6B7486">' + s + '</text>'; }
    v.forEach((a, i) => { const val = Math.max(0, a.v / 1048576); const hh = val / mx * HH; const xx = X0 + i * bw + 3; h += '<rect x="' + xx + '" y="' + (Y0 - hh) + '" width="' + (bw - 6) + '" height="' + Math.max(hh, 1) + '" rx="3" fill="' + (i === v.length - 1 ? '#2F5BD3' : '#9AB0EA') + '"><title>' + esc(a.d) + ' ' + (a.v / 1048576).toFixed(2) + 'MB</title></rect>';
      if (i === 0 || i === v.length - 1 || i % 4 === 0) h += '<text x="' + (xx + (bw - 6) / 2) + '" y="' + (Y0 + 18) + '" text-anchor="middle" font-size="11" fill="#6B7486">' + +a.d.slice(5, 7) + '/' + +a.d.slice(8) + '</text>'; });
    if (C.avg != null) { const ay = Y0 - Math.max(0, C.avg / 1048576) / mx * HH; h += '<line x1="' + X0 + '" x2="' + (X0 + PW) + '" y1="' + ay + '" y2="' + ay + '" stroke="#E07B39" stroke-dasharray="5 4"/>'; }
    h += '<text x="' + X0 + '" y="14" font-size="11" fill="#6B7486">MB</text>' + (C.avg != null ? '<text x="' + (X0 + PW) + '" y="14" text-anchor="end" font-size="11" fill="#E07B39" font-weight="700">- - 평균 ' + (C.avg / 1048576).toFixed(1) + 'MB</text>' : '');
    return '<svg viewBox="0 0 ' + W + ' 290" width="100%" role="img" aria-label="하루 사용량">' + h + '</svg>';
  }

  HS.view('storage', {
    title: '저장 공간', perm: 'users',
    async render(body, p, tools) {
      let u = null; try { u = await HS.db.rpc('erp_usage'); } catch (e) { /* SQL 미설치 */ }
      if (!u) { body.innerHTML = '<div class="card empty">사용량을 읽지 못했습니다 · 설치하기 2번(DB 설치)을 다시 실행하면 표시됩니다 (sql/10_storage.sql)</div>'; return; }
      const C = HS.storageCalc(u); cached = { u, C }; const lastRec = (u.hist || []).slice(-1)[0];
      const rb = HS.el('<span style="display:flex;gap:8px;align-items:center"><span class="mute" style="font-size:12px">' + (lastRec ? '마지막 기록 ' + esc(new Date(lastRec.at || lastRec.d).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })) : '기록 없음') + '</span><button class="btn sm" id="snap">지금 다시 재기</button></span>');
      tools.appendChild(rb);
      rb.querySelector('#snap').onclick = async () => { try { await HS.db.rpc('erp_usage_snap'); HS.toast('오늘 용량을 기록했습니다', 'ok'); HS.route(); } catch (e) { HS.err(e); } };
      const col = C.pct >= 85 ? 'var(--neg)' : C.pct >= 70 ? 'var(--gold)' : 'var(--navy)';
      const tile = (t, v, s) => '<div class="card kpi"><div class="l">' + t + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
      const yd = C.diffs.length ? C.diffs[C.diffs.length - 1] : null;
      const trend = C.avg != null && C.prevAvg != null ? ' · 지난달 대비 ' + (Math.abs(C.avg - C.prevAvg) < 52429 ? '<span class="mute">비슷 ' : C.avg > C.prevAvg ? '<span class="neg">▲ ' : '<span class="pos">▼ ') + Math.abs((C.avg - C.prevAvg) / 1048576).toFixed(1) + 'MB</span>' : '';
      const etaV = C.avg == null ? '<span class="mute" style="font-size:16px">기록 쌓는 중</span>' : C.avg <= 0 ? '<span class="pos" style="font-size:18px">늘지 않음</span>' : '<span style="color:' + (C.daysLeft <= 30 ? 'var(--neg)' : '#2F5BD3') + '">' + esc(C.eta) + '</span>';
      const etaS = C.avg == null ? '이틀 이상 기록되면 계산 (처음 1~2주는 대략값)' : C.avg <= 0 ? '최근 ' + C.sampleDays + '일 동안 용량이 늘지 않았습니다' : '약 <b>' + fmt(C.daysLeft) + '일</b> 남음 · ' + (C.daysLeft <= 30 ? '<span class="neg">곧 한도</span>' : C.daysLeft <= 90 ? '<span class="wa3">준비 필요</span>' : '<span class="pos">여유</span>') + (C.sampleDays < 14 ? ' · <span class="mute">' + C.sampleDays + '일 기록 기준</span>' : '');
      const fp = u.file_bytes != null ? u.file_bytes / u.file_limit * 100 : null;
      body.innerHTML = '';
      if (u.local) body.appendChild(HS.el('<div class="card" style="margin-bottom:14px;background:#FFF8E6"><span class="wa3">로컬 모드 — 이 브라우저에 저장된 시연 자료 크기로 추정한 값입니다 (Supabase 연결 후 실제 값)</span></div>'));
      if (C.level !== 'ok') body.appendChild(HS.el('<div class="card" style="margin-bottom:14px;border-left:4px solid ' + (C.level === 'red' ? 'var(--neg)' : 'var(--gold)') + '"><b class="' + (C.level === 'red' ? 'neg' : 'wa3') + '">' + (C.level === 'red' ? '⚠ 저장 공간 주의' : '저장 공간 70% 넘음') + '</b> — ' + C.pct.toFixed(0) + '% 사용' + (C.daysLeft != null ? ' · 예상 ' + esc(C.eta) + ' (' + C.daysLeft + '일)' : '') + ' · 오래된 안성 상세 자료 정리 · 3년차 자료 원드라이브 보관 · 또는 Pro 요금제(월 $25 · 8GB) 전환을 검토하세요</div>'));
      body.appendChild(HS.el('<div class="kpis">' +
        tile('데이터 저장 (DB) 누적', mb1(u.db_bytes) + ' <small style="font-size:13px;color:var(--mute)">MB / 500 MB</small>', '<div class="bar" style="height:9px;margin:4px 0 6px"><i style="width:' + Math.min(100, C.pct).toFixed(1) + '%;background:' + col + '"></i></div>' + C.pct.toFixed(1) + '% 사용 · 남은 공간 ' + MBf(Math.max(0, C.left))) +
        tile('어제 하루 사용', yd ? (yd.v >= 0 ? '+' : '') + (yd.v / 1048576).toFixed(1) + ' <small style="font-size:13px;color:var(--mute)">MB</small>' : '<span class="mute" style="font-size:16px">-</span>', C.avg != null ? '최근 ' + C.sampleDays + '일 평균 <b>' + (C.avg >= 0 ? '+' : '') + (C.avg / 1048576).toFixed(1) + ' MB/일</b>' + trend : '기록이 이틀 이상 쌓이면 표시') +
        tile('한도(500MB) 도달 예상일', etaV, etaS) +
        tile('파일 저장 (사진 · 첨부)', u.file_bytes != null ? mb1(u.file_bytes) + ' <small style="font-size:13px;color:var(--mute)">MB / 1 GB</small>' : '<span class="mute" style="font-size:16px">-</span>', fp != null ? '<div class="bar" style="height:9px;margin:4px 0 6px"><i style="width:' + Math.min(100, fp).toFixed(1) + '%;background:var(--pos)"></i></div>' + fp.toFixed(1) + '% 사용' + (C.fAvg != null ? ' · 하루 ' + (C.fAvg >= 0 ? '+' : '') + (C.fAvg / 1048576).toFixed(1) + ' MB' : '') : '파일 저장소 사용 안 함') + '</div>'));
      const two = HS.el('<div class="row2 r21" style="margin-top:14px"></div>'); body.appendChild(two);
      two.appendChild(HS.el('<div class="card"><h3>누적 용량 추이 · 앞으로 예상 <small>지난 60일 실제 + 지금 속도대로 갈 때</small></h3>' + lineChart(u, C) + '<div class="lg-st"><span style="--c:#2F5BD3">실제 누적</span><span style="--c:#9AB0EA">예상 (최근 평균 속도)</span><span style="--c:#C2412D">한도 500MB</span></div></div>'));
      two.appendChild(HS.el('<div class="card"><h3>하루 사용량 <small>최근 14일 · 주말 · 휴일은 적게 씀</small></h3>' + barChart(C) + '</div>'));
      const two2 = HS.el('<div class="row2 r21" style="margin-top:14px"></div>'); body.appendChild(two2);
      const tb = (u.tables || []).filter((t) => t.bytes > 0); const hasG = Object.keys(C.growth).length > 0;
      const tc = HS.el('<div class="card no-tools"><h3>어디에 많이 쓰나 <small>자료별 용량' + (hasG ? ' · 하루 증가 (최근 ' + C.sampleDays + '일 평균)' : ' · 하루 증가는 기록이 쌓이면 표시') + '</small><span class="sp"></span><button class="btn sm" id="xl">엑셀</button></h3><div class="tw"><table><tr><th>자료</th><th class="n">용량</th><th class="n">비중</th><th class="n">하루 증가</th></tr>' +
        tb.slice(0, 15).map((t) => { const g = C.growth[t.name]; return '<tr><td>' + esc(lbl(t.name)) + '</td><td class="n">' + MBf(t.bytes) + '</td><td class="n">' + (t.bytes / u.db_bytes * 100).toFixed(1) + '%</td><td class="n' + (g > 512 * 1024 ? ' wa3' : '') + '">' + (g == null ? '<span class="mute">-</span>' : (g >= 0 ? '+' : '') + (g / 1048576).toFixed(2) + ' MB') + '</td></tr>'; }).join('') +
        (tb.length > 15 ? '<tr><td class="mute">그 밖의 ' + (tb.length - 15) + '개</td><td class="n mute">' + MBf(tb.slice(15).reduce((a, t) => a + t.bytes, 0)) + '</td><td></td><td></td></tr>' : '') + '<tr><td class="mute">시스템 · 색인 등 (Supabase 기본)</td><td class="n mute">' + MBf(Math.max(0, u.db_bytes - tb.reduce((a, t) => a + t.bytes, 0))) + '</td><td></td><td></td></tr></table></div></div>');
      two2.appendChild(tc);
      tc.querySelector('#xl').onclick = () => HS.download('저장공간_' + today() + '.xlsx', (u.hist || []).map((h) => ({ 날짜: h.d, DB_MB: +(h.db / 1048576).toFixed(2), 파일_MB: h.file != null ? +(h.file / 1048576).toFixed(2) : '' })).concat([{}], tb.map((t) => ({ 날짜: lbl(t.name), DB_MB: +(t.bytes / 1048576).toFixed(3) }))), '저장공간');
      const ref = ((HSDB.loadConn().url || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
      two2.appendChild(HS.el('<div class="card no-tools"><h3>알림 · 대비 <small>자동</small></h3><div class="tw"><table><tr><td class="pos" style="font-weight:700">70% 미만</td><td>표시만' + (C.level === 'ok' ? ' <span class="tag g">지금</span>' : '') + '</td></tr><tr><td class="wa3" style="font-weight:700">70% (350MB)</td><td>관리자 접속 시 노란 알림 · 대시보드 맨 위' + (C.level === 'yellow' ? ' <span class="tag y">지금</span>' : '') + '</td></tr><tr><td class="neg" style="font-weight:700">85% (425MB)</td><td>빨간 알림 · 정리 권장' + (C.level === 'red' && C.pct >= 85 ? ' <span class="tag r">지금</span>' : '') + '</td></tr><tr><td class="neg" style="font-weight:700">예상일 30일 이내</td><td>% 와 상관없이 미리 알림' + (C.daysLeft != null && C.daysLeft <= 30 ? ' <span class="tag r">지금</span>' : '') + '</td></tr></table></div>' +
        '<div style="margin-top:12px;padding:10px 12px;background:#F4F6FA;border-radius:8px;font-size:12.5px;line-height:1.7"><b>정리 · 대비</b><br>· 안성 상세 자료(반품검수 · 소터 · 날짜별 수불)는 보관 기간이 지나면 매일 밤 자동 정리 → <a href="#/anseong?k=opt">안성 › 받을 항목</a>에서 기간 변경 · [엑셀 받고 정리]<br>· 3년차 자료는 원드라이브 보관 후 정리<br>· 그래도 부족하면 Pro 요금제(월 $25 · 8GB)<br><span class="mute">※ 인터넷 전송량(월 5GB) · 접속 수는 Supabase 관리 화면 › Usage 에서만 보입니다</span>' + (ref ? '<div style="margin-top:8px"><a class="btn sm" target="_blank" rel="noopener" href="https://supabase.com/dashboard/project/' + esc(ref) + '/settings/billing/usage">Supabase 사용량 열기</a></div>' : '') + '</div></div>'));
      if (HS.can('users', 'edit')) body.appendChild(purgeCard());
      if (HS.can('users', 'edit')) body.appendChild(backupCard(u));
      if (!u.local && u.cron === false) body.appendChild(HS.el('<div class="card" style="margin-top:14px"><span class="wa3">자동 기록 예약이 안 되어 있습니다 (pg_cron 없음) — 이 화면을 열 때마다 [지금 다시 재기]를 눌러 주세요</span></div>'));
    },
  });

  // ---------- 저장 공간 정리 (관리자만 · sql/24_purge.sql) ----------
  //  · 폐기한 화면(업무 협조 TO-DO · 소모품/부자재 발주 · 알림)에 남은 자료 · 오래된 회의 보고서 엑셀 · 수정 이력 · 업로드 기록
  //  · 반드시 [얼마나 지워지나] 로 건수를 먼저 보여 주고, 확인 창에서 한 번 더 물어본 뒤 지움
  const PURGE = [
    { k: 'retired', l: '폐기한 화면에 남은 자료', d: '업무 협조 TO-DO · 소모품 / 부자재 발주 · 알림 — 지금은 쓰지 않는 화면들입니다', mo: 0 },
    { k: 'meetbook', l: '오래된 월간 회의 보고서', d: '올린 회의 자료 엑셀 (보통 가장 많이 차지합니다) · 고른 기간보다 오래된 달만', mo: 24 },
    { k: 'audit', l: '오래된 수정 이력', d: '누가 언제 무엇을 고쳤는지 기록', mo: 12 },
    { k: 'uploads', l: '오래된 업로드 기록', d: '어떤 파일을 올렸는지 기록 (파일 자체는 아님)', mo: 12 },
  ];
  const MOS = [6, 12, 24, 36];
  const beforeOf = (mo) => { if (!mo) return null; const d = new Date(today() + 'T00:00:00'); d.setMonth(d.getMonth() - mo); return HS.ymd(d); };
  const sumN = (r) => Object.keys(r || {}).reduce((a, k) => a + (+r[k] || 0), 0);
  const listN = (r) => Object.keys(r || {}).filter((k) => +r[k] > 0).map((k) => lbl(k) + ' ' + fmt(+r[k]) + '건').join(' · ') || '지울 것이 없습니다';
  function purgeCard() {
    const c = HS.el('<div class="card no-tools" style="margin-top:14px"><h3>저장 공간 정리하기 <small>관리자만 · <b class="neg">되돌릴 수 없습니다</b></small></h3><div class="tw"><table><tr><th>지울 것</th><th>무엇인가</th><th>기준</th><th class="n">건수</th><th></th></tr>' +
      PURGE.map((x) => '<tr data-k="' + x.k + '"><td><b>' + esc(x.l) + '</b></td><td class="mute">' + esc(x.d) + '</td><td>' + (x.mo ? '<select class="in" style="width:110px;height:30px">' + MOS.map((m) => '<option value="' + m + '"' + (m === x.mo ? ' selected' : '') + '>' + m + '개월 지난 것</option>').join('') + '</select>' : '<span class="mute">전부</span>') + '</td><td class="n" data-n><span class="mute">-</span></td><td style="white-space:nowrap"><button class="btn sm" data-c>얼마나 지워지나</button> <button class="btn sm" data-x>지우기</button></td></tr>').join('') +
      '</table></div><div class="mute" style="font-size:11.5px;margin-top:8px;line-height:1.7">· 지운 뒤에도 위의 용량 숫자는 바로 줄지 않을 수 있습니다 — Postgres 가 빈자리를 천천히 되씁니다 (며칠 지나면 반영)<br>· 월간 회의 보고서를 지우면 그 달 화면은 열리지 않습니다. 엑셀 원본은 따로 보관해 두세요<br>· 안성 상세 자료는 <a href="#/anseong?k=opt">안성 › 받을 항목</a>에서 보관 기간으로 자동 정리됩니다</div></div>');
    const moOf = (tr) => { const s = tr.querySelector('select'); return s ? +s.value : 0; };
    const count = async (tr, k) => { const r = await HS.db.rpc('erp_purge_count', { p_kind: k, p_before: beforeOf(moOf(tr)) }); tr.querySelector('[data-n]').innerHTML = sumN(r) ? '<b>' + fmt(sumN(r)) + '</b>' : '<span class="mute">0</span>'; return r; };
    c.querySelectorAll('tr[data-k]').forEach((tr) => {
      const k = tr.dataset.k; const x = PURGE.find((p) => p.k === k);
      const s = tr.querySelector('select'); if (s) s.onchange = () => (tr.querySelector('[data-n]').innerHTML = '<span class="mute">-</span>');
      tr.querySelector('[data-c]').onclick = async (e) => { const b = e.target; b.disabled = true; b.textContent = '세는 중…'; try { const r = await count(tr, k); HS.toast(listN(r)); } catch (err) { HS.err(err); } b.disabled = false; b.textContent = '얼마나 지워지나'; };
      tr.querySelector('[data-x]').onclick = async (e) => {
        const b = e.target; b.disabled = true;
        try {
          const r = await count(tr, k); const n = sumN(r);
          if (!n) { HS.toast('지울 것이 없습니다'); b.disabled = false; return; }
          const mo = moOf(tr); const cut = beforeOf(mo);
          const ok = await HS.modal('저장 공간 정리 · ' + x.l, HS.el('<div style="line-height:1.8"><b>' + esc(x.l) + '</b>' + (cut ? ' <span class="mute">(' + esc(cut) + ' 이전)</span>' : '') + '<br>' + esc(listN(r)) + '<br><br><b class="neg">모두 ' + fmt(n) + '건을 지웁니다. 되돌릴 수 없습니다.</b></div>'), [['취소', null], ['지우기', true, 'p']]);
          if (!ok) { b.disabled = false; return; }
          const d = await HS.db.rpc('erp_purge', { p_kind: k, p_before: cut });
          HS.toast(fmt(sumN(d)) + '건을 지웠습니다 · ' + listN(d), 'ok'); cached = null; HS.route();
        } catch (err) { HS.err(err); b.disabled = false; }
      };
    });
    return c;
  }

  // ---------- 백업 받기 (관리자만 · 2026-11-18 · 다른 프로그램으로 옮기거나 따로 보관할 때) ----------
  //  · 볼 수 있는 자료만 담김 (등급별 RLS 그대로) · 안성 연동 열쇠(erp_secret)는 담지 않음
  const BK_SKIP = ['erp_secret'];
  const flat = (r) => { const o = {}; for (const k in r) { const v = r[k]; o[k] = v && typeof v === 'object' ? JSON.stringify(v) : v; } return o; };
  const sheetName = (used, t) => { const n = String((HS.TBL_L && HS.TBL_L[t]) || t.replace(/^erp_/, '')).replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || t; let x = n, i = 2; while (used.has(x)) x = n.slice(0, 25) + ' ' + i++; used.add(x); return x; };
  function backupCard(u) {
    const names = [...new Set(Object.keys(HS.TBL_L || {}).concat((u.tables || []).map((t) => t.name)))].filter((t) => BK_SKIP.indexOf(t) < 0).sort();
    const c = HS.el('<div class="card no-tools" style="margin-top:14px"><h3>백업 받기 <small>관리자만 · 다른 프로그램으로 옮기거나 따로 보관할 때</small></h3>' +
      '<div class="mute" style="font-size:12.5px;line-height:1.7">모든 표를 이 PC로 내려받습니다. <b>엑셀</b>은 표마다 시트로 나뉘어 바로 열어볼 수 있고, <b>JSON</b>은 이 사이트로 그대로 되돌릴 때 씁니다.</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px"><button class="btn p" id="bx">엑셀로 받기</button><button class="btn" id="bj">JSON으로 받기</button>' +
      '<span class="mute" style="font-size:12px">표 ' + names.length + '개 · 지금 ' + MBf(u.db_bytes) + '</span></div><div id="bp" style="margin-top:10px"></div>' +
      '<div class="mute" style="font-size:11.5px;margin-top:8px;line-height:1.7">· 자료가 많으면 몇 분 걸립니다 — 다 될 때까지 이 화면을 닫지 마세요<br>· 받은 파일은 회사 자료입니다. 밖으로 보내지 마세요<br>· 볼 수 있는 자료만 담깁니다 (등급에 따라 다름) · 안성 연동 열쇠는 담기지 않습니다</div></div>');
    const pb = c.querySelector('#bp'), bx = c.querySelector('#bx'), bj = c.querySelector('#bj');
    const collect = async () => {
      const out = []; let rows = 0;
      for (let i = 0; i < names.length; i++) {
        const t = names[i];
        pb.innerHTML = '<div>받는 중… ' + (i + 1) + ' / ' + names.length + ' · ' + esc((HS.TBL_L && HS.TBL_L[t]) || t) + ' · ' + fmt(rows) + '줄</div><progress max="' + names.length + '" value="' + i + '" style="width:100%"></progress>';
        await new Promise((r) => setTimeout(r, 0));
        let r = null; try { r = await HS.db.list(t, {}); } catch (e) { r = null; } // 없는 표 · 권한 없는 표는 건너뜀
        if (r && r.length) { out.push([t, r]); rows += r.length; }
      }
      pb.innerHTML = '<div>표 ' + out.length + '개 · ' + fmt(rows) + '줄 · 파일 만드는 중… (조금 걸립니다)</div>';
      await new Promise((r) => setTimeout(r, 30));
      return { out, rows };
    };
    const run = async (b, fn) => { bx.disabled = bj.disabled = true; try { const { out, rows } = await collect(); await fn(out); pb.innerHTML = '<div class="lock ok" style="font-size:12.5px">표 ' + out.length + '개 · ' + fmt(rows) + '줄을 받았습니다 · 내려받기 폴더를 확인하세요</div>'; } catch (e) { HS.err(e); pb.innerHTML = '<div class="lock warn" style="font-size:12.5px">받지 못했습니다 — ' + esc(e.message || '') + '</div>'; } bx.disabled = bj.disabled = false; };
    bx.onclick = () => run(bx, async (out) => {
      await HS.xlsx(); const wb = XLSX.utils.book_new(); const used = new Set();
      out.forEach(([t, r]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.map(flat)), sheetName(used, t)));
      if (!wb.SheetNames.length) throw new Error('담을 자료가 없습니다');
      XLSX.writeFile(wb, '혜성물류_백업_' + today() + '.xlsx');
    });
    bj.onclick = () => run(bj, async (out) => {
      const data = { site: '혜성물류 회의자료', made_at: new Date().toISOString(), tables: {} };
      out.forEach(([t, r]) => (data.tables[t] = r));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      a.download = '혜성물류_백업_' + today() + '.json'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    });
    return c;
  }

  // 관리자: 접속 시 하루 한 번 알림 · 대시보드 맨 위 알림 줄
  const check = async () => { if (cached) return cached; if (!HS.can('users', 'view')) return null; try { const u = await HS.db.rpc('erp_usage'); if (!u) return null; cached = { u, C: HS.storageCalc(u) }; setTimeout(() => (cached = null), 600000); return cached; } catch (e) { return null; } };
  (HS.afterBoot = HS.afterBoot || []).push(async () => {
    if (!HS.can('users', 'edit')) return; const k = 'hs-usage-' + today(); try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch (e) { /* 무시 */ }
    const r = await check(); if (!r || r.C.level === 'ok') return;
    HS.toast('저장 공간 ' + r.C.pct.toFixed(0) + '% 사용' + (r.C.daysLeft != null ? ' · 예상 ' + r.C.eta + ' 한도 도달' : '') + ' — 설정 › 저장 공간에서 확인하세요', r.C.level === 'red' ? 'err' : '');
  });
  // 월간 회의 보고서 · 월간 회의(운영 자료) 맨 위에 알림 줄
  ['meetbook', 'meeting'].forEach((vn) => { const dash = HS.views[vn];
  if (dash) { const orig = dash.render; dash.render = async function (body) { const out = await orig.apply(this, arguments); if (HS.can('users', 'edit')) { const r = await check(); if (r && r.C.level !== 'ok' && body.isConnected !== false) body.insertBefore(HS.el('<a href="#/storage" class="card" style="display:block;margin-bottom:14px;text-decoration:none;color:inherit;border-left:4px solid ' + (r.C.level === 'red' ? 'var(--neg)' : 'var(--gold)') + ';background:' + (r.C.level === 'red' ? '#FDECEA' : '#FFF8E6') + '"><b>' + (r.C.level === 'red' ? '⚠ ' : '') + '저장 공간 ' + r.C.pct.toFixed(0) + '% 사용</b>' + (r.C.daysLeft != null ? ' · 지금 속도면 <b>' + esc(r.C.eta) + '</b> (' + r.C.daysLeft + '일 뒤) 500MB 한도 도달' : '') + ' <span class="mute">→ 저장 공간 보기</span></a>'), body.firstChild); } return out; }; } });
})();
