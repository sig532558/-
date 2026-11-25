/* 엑셀 일괄 등록 · 사용자/등급 · 기준정보 · 개선 요청(Claude 연동) */
(function () {
  'use strict';
  const { esc, fmt, today } = HS;

  // ================= 엑셀 일괄 등록 =================
  const KIND_INFO = {
    worklog: ['관리자 업무일지', 'worklog'], support: ['별도인원 업무일지', 'worklog'], daily: ['일일 마감보고', 'daily'], coop: ['업무협조 TO-DO', 'tasks'], dispatch: ['용차출고 → TO-DO', 'tasks'], dplus: ['D+1 지시 → TO-DO', 'tasks'], hold: ['출고홀딩 → TO-DO', 'tasks'], open: ['오픈매장 → TO-DO', 'tasks'], close: ['폐점매장 → TO-DO', 'tasks'], material: ['부자재 출고 → TO-DO', 'tasks'],
    return_box: ['반품 박스 수불', 'returns'], return_ledger: ['일별 반품 관리 대장', 'returns'], event_return: ['행사·선반품', 'returns'], reship: ['재반송', 'returns'], defect: ['불량 회수', 'returns'], store_defect: ['매장 불량상품', 'returns'], close_return: ['폐점·홀딩해체 반품', 'returns'], online_return: ['온라인 반품대장', 'returns'], settlement: ['입고대행 정산', 'settlement'],
    orders: ['아침 출고지시', 'orders'], kpi: ['팀별 KPI', 'kpi'],
  };
  HS.view('upload', {
    title: '엑셀 일괄 등록', perm: 'upload',
    async render(body, p, tools) {
      const only = p.only || '';
      const tpl = HS.el('<button class="btn">입력 양식 내려받기</button>'); tpl.onclick = templates; tools.appendChild(tpl);
      body.innerHTML = '';
      // 안내 글은 KIND_INFO 에서 만들고 지금 안 쓰는 메뉴(HS.RETIRED)는 뺀다 (2026-11-19 · 행님 지시 "가능한 항목만 표시")
      const RET = HS.RETIRED || [];
      const liveK = [...new Set(Object.values(KIND_INFO).filter(([, m]) => RET.indexOf(m) < 0).map(([l]) => l))];
      const deadK = [...new Set(Object.values(KIND_INFO).filter(([, m]) => RET.indexOf(m) >= 0).map(([l]) => l.replace(/ → TO-DO$/, '')))];
      const drop = HS.el('<div class="card"><div class="drop" id="drop"><div style="font-size:16px;font-weight:700">엑셀 파일을 여기에 끌어다 놓기 (여러 개 가능) ' + HS.fmtLink('bulk') + '</div><div class="mute" style="margin-top:6px;line-height:1.7">여기서 등록되는 자료: <b>' + esc(liveK.join(' · ')) + '</b> · <b>물동량</b>(아래 [물동량 올리기] 칸으로 넘겨 드립니다)<br>기존에 쓰던 엑셀을 그대로 올리면 됩니다. 같은 자료를 다시 올리면 중복 없이 최신 값으로 바뀝니다.<br><span style="font-size:12px">· <b>반품 관리 대장(V1.211)</b>처럼 여러 시트가 든 파일은 <a href="#/returns?k=up">[반품 현황 › 자료 업데이트]</a>의 [대량 등록]에서 · <b>반품 정리 대장</b>은 <a href="#/rclean">[정상팀 › 반품 정리 현황]</a>에서' + (deadK.length ? '<br>· ' + esc(deadK.join(' · ')) + '는 지금 쓰지 않는 메뉴라 받지 않습니다' : '') + '</span></div><div style="margin-top:14px"><span class="btn p">파일 선택</span></div><input type="file" id="fi" multiple accept=".xlsx,.xlsm,.xls,.csv" class="hide"></div>' + (only ? '<div class="lock" style="margin-top:10px">필터: <b>' + esc(only) + '</b> 시트만 등록합니다</div>' : '') + '<div id="res"></div></div>');
      body.appendChild(drop);
      const hist = HS.el('<div class="card"><h3>최근 등록 이력</h3><div id="hist" class="mute">불러오는 중…</div></div>'); body.appendChild(hist);
      HS.db.list('erp_uploads', { order: ['at', false], limit: 30 }).then((h) => { hist.querySelector('#hist').innerHTML = h.length ? '<div class="tw"><table><tr><th>시각</th><th>파일</th><th>종류</th><th class="n">건수</th><th>등록자</th></tr>' + h.map((x) => '<tr><td>' + esc(new Date(x.at).toLocaleString('ko-KR')) + '</td><td>' + esc(x.file_name) + '</td><td>' + esc((x.kinds || []).join(', ')) + '</td><td class="n">' + fmt(x.rows) + '</td><td>' + esc(HS.who(x.by_user)) + '</td></tr>').join('') + '</table></div>' : '등록 이력이 없습니다'; }).catch(() => (hist.querySelector('#hist').textContent = '-'));
      const dz = drop.querySelector('#drop'), fi = drop.querySelector('#fi'), res = drop.querySelector('#res');
      dz.onclick = () => fi.click();
      dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
      dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); handle([...e.dataTransfer.files]); };
      fi.onchange = () => handle([...fi.files]);
      let found = [];
      async function handle(files) {
        if (!HS.can('upload', 'create')) return HS.toast('등록 권한이 없습니다', 'err');
        found = []; res.innerHTML = '<div class="empty">분석 중… (큰 파일은 몇 초 걸립니다)</div>';
        const volFiles = []; // 물동량 파일은 아래 [물동량 올리기] 칸이 읽음 — 여기서 알아보고 그리로 넘김 (2026-11-12)
        const rcFiles = []; // 반품 정리 대장은 [정상팀 › 반품 정리 현황] 이 제 자리 — 여기서는 체크를 꺼 둠 (2026-11-17)
        const rtFiles = []; // 반품 관리 대장(V1.211)은 [반품 현황 › 자료 업데이트]가 제 자리 — 여기서는 일별 대장 한 시트만 들어감 (2026-11-19)
        for (const f of files) {
          await new Promise((r) => setTimeout(r, 30));
          try {
            const buf = await f.arrayBuffer();
            const wb = HSParsers.readWorkbook(new Uint8Array(buf), { type: 'array' });
            const all = HSParsers.analyze(wb, f.name);
            const out = all.filter((x) => x.kind !== 'unknown' && !x.error && (x.count || 0) > 0);
            out.forEach((x) => { x.file = f.name; x.checked = !only || (x.label || '').indexOf(only) >= 0 || x.sheet.indexOf(only) >= 0; });
            // 못 알아본 시트도 표에 보여 준다 — 조용히 빠지면 '등록은 됐는데 자료가 없다'가 됨 (2026-11-19)
            //   단가 · 금액 시트는 이름도 화면에 적지 않는다 (기밀)
            const SECRET = /금액|단가|정산금|청구|매출액/;
            const skip = all.filter((x) => x.kind === 'unknown' || x.error || !((x.count || 0) > 0))
              .map((x) => ({ file: f.name, sheet: SECRET.test(x.sheet || '') ? '(단가 · 금액 시트)' : x.sheet || '-', kind: 'skip', label: x.error ? '읽기 실패' : '인식 불가 — 등록되지 않습니다', count: 0, sets: [], checked: false }));
            // 반품 관리 대장(여러 시트가 한 파일에)인지 — 여기서는 일별 대장 한 시트만 들어가므로 통째로 넘기도록 안내
            if (out.length <= 2 && wb.SheetNames.length >= 5 && window.HSReturns) {
              let rt = null; try { rt = window.HSReturns.readBook(wb.SheetNames.map((n) => ({ name: n, ws: wb.Sheets[n] })), f.name, null, () => null); } catch (e) { rt = null; }
              const ks = rt ? [...new Set(rt.found.map((x) => x.kind))] : [];
              if (ks.length >= 2) { rtFiles.push(f.name); out.forEach((x) => { x.checked = false; x.retbook = true; }); }
            }
            // 반품 정리 대장(폐점 · 수시 · 행사 · 시즌아웃 · 온라인 반품)은 [정상팀 › 반품 정리 현황] 에서 시트별로 나눠 넣는 자료다.
            // 여기서 넣으면 같은 자료가 다른 종류로 한 벌 더 들어가므로 알아보고 체크를 꺼 둔다 (켜면 그대로 들어감)
            let rcN = 0;
            try { if (window.HSRClean) out.forEach((x) => { const sp = window.HSRClean.specOf(x.sheet || ''); if (sp) { x.checked = false; x.rclean = sp.label; rcN++; } }); } catch (e) { /* 모듈 없음 */ }
            if (rcN) rcFiles.push(f.name);
            // 지금 쓰지 않는 메뉴(업무협조 TO-DO · 팀별 KPI) 자료는 체크를 꺼 둔다 — 켜면 그대로 들어감
            out.forEach((x) => { const m = (KIND_INFO[x.kind] || [])[1]; if (m && RET.indexOf(m) >= 0) { x.checked = false; x.dead = true; } });
            let isVol = false;
            if (!out.length) {
              // 이 칸이 모르는 파일이면 물동량(화주 일별 시트)인지 한 번 더 봄
              let v = null;
              try { if (window.HSVolume) v = window.HSVolume.readBook(wb.SheetNames.map((n) => ({ name: n, ws: wb.Sheets[n] }))); } catch (e) { v = null; }
              if (v && v.found.length) {
                isVol = true; // 물동량 파일은 아래 칸이 통째로 읽으므로 시트 목록을 따로 적지 않는다 (기밀 시트 이름 노출 방지)
                // 건수는 아래 [물동량 올리기] 칸이 파일을 다시 읽어 정확히 셈 (여기 워크북은 이미 분석에 쓰여 숫자가 어긋날 수 있음)
                volFiles.push(f);
                found.push({ file: f.name, sheet: '화주 일별 시트', kind: 'volume', label: '물동량 파일 → 아래 [물동량 올리기] 칸으로', count: 0, sets: [], checked: false });
              } else found.push({ file: f.name, sheet: '-', kind: 'none', label: '인식된 시트가 없습니다', count: 0, sets: [], checked: false });
            }
            found.push(...out); if (!isVol) found.push(...skip);
          } catch (e) { found.push({ file: f.name, sheet: '-', kind: 'error', label: '읽기 실패: ' + e.message, count: 0, sets: [], checked: false }); }
        }
        draw();
        // 물동량 파일이면 아래 전용 칸으로 그대로 넘겨 줌 (행님이 위 칸에 넣는 일이 잦아서 · 2026-11-12)
        if (volFiles.length && HS.volumeTakeFiles) {
          res.insertAdjacentHTML('afterbegin', '<div class="lock ok" style="margin-bottom:10px">📦 <b>물동량 파일이네요.</b> 아래 <b>[물동량 올리기]</b> 칸으로 그대로 넘겼습니다 — 거기서 달 · 화주를 확인하고 등록하세요.</div>');
          HS.volumeTakeFiles(volFiles);
        }
        if (rtFiles.length) res.insertAdjacentHTML('afterbegin', '<div class="lock" style="margin-bottom:10px;background:#FBE6E2;border-color:#F0B8AE">📦 <b>반품 관리 대장(V1.211)이네요.</b> 이 칸은 <b>일별 대장 한 시트만</b> 읽습니다 — 브랜드 시트 · 출고반품현황 · 행낭 · 타택배는 빠집니다.<br>통째로 넣으시려면 <b><a href="#/returns?k=up">[입고팀 › 반품 현황 › 자료 업데이트]</a></b> 의 <b>[대량 등록]</b> 에 올려 주세요. <span class="mute">(여기서는 체크를 꺼 뒀습니다)</span></div>');
        if (rcFiles.length) res.insertAdjacentHTML('afterbegin', '<div class="lock" style="margin-bottom:10px">📋 <b>반품 정리 대장이네요.</b> 이 파일은 <b><a href="#/rclean">[정상팀 › 반품 정리 현황]</a></b> 에서 올리면 시트(폐점 · 수시 · 행사 · 시즌아웃 · 온라인 반품 …)를 종류별로 나눠 넣습니다.<br>여기서도 넣을 수는 있지만 같은 자료가 두 군데로 들어가므로 <b>체크를 꺼 뒀습니다</b> — 그래도 넣으시려면 체크만 켜시면 됩니다.</div>');
      }
      function draw() {
        const byKind = {}; found.filter((x) => x.checked).forEach((x) => { const k = (KIND_INFO[x.kind] || [x.kind])[0]; byKind[k] = (byKind[k] || 0) + x.count; });
        res.innerHTML = '<h3 style="margin:16px 0 8px">인식 결과 <small class="mute">체크한 시트만 등록됩니다</small></h3><div class="tw" style="max-height:420px"><table><tr><th><input type="checkbox" id="ca" checked></th><th>파일</th><th>시트</th><th>인식 종류</th><th class="n">건수</th><th>등록 위치</th><th>참고</th></tr>' +
          found.map((x, i) => '<tr><td>' + (x.count ? '<input type="checkbox" data-i="' + i + '" ' + (x.checked ? 'checked' : '') + '>' : '') + '</td><td>' + esc(x.file) + '</td><td>' + esc(x.sheet) + '</td><td>' + (x.count ? '<span class="tag b">' + esc((KIND_INFO[x.kind] || [x.label])[0]) + '</span>' : '<span class="tag r">' + esc(x.label) + '</span>') + '</td><td class="n">' + fmt(x.count) + '</td><td>' + esc(KIND_INFO[x.kind] ? (HS.MODULES.find((m) => m[0] === KIND_INFO[x.kind][1]) || [0, ''])[1] : '') + '</td><td class="mute">' + esc((x.warnings || []).join(', ')) + (x.rclean ? (x.warnings && x.warnings.length ? ' · ' : '') + '<b>반품 정리 현황</b> 자료 (' + esc(x.rclean) + ')' : '') + (x.dead ? ' <b class="neg">지금 쓰지 않는 메뉴</b>' : '') + (x.retbook ? ' <b class="neg">반품 현황에서 올리세요</b>' : '') + '</td></tr>').join('') + '</table></div>' +
          '<div style="display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap"><button class="btn gd" id="go">선택한 자료 등록</button><span class="mute">' + Object.entries(byKind).map(([k, n]) => esc(k) + ' ' + fmt(n) + '건').join(' · ') + '</span>' + (found.filter((x) => !x.count).length ? '<span class="neg" style="font-size:12px">· 등록되지 않는 시트 <b>' + found.filter((x) => !x.count).length + '개</b> (위 빨간 줄)</span>' : '') + '</div><div id="prog" style="margin-top:12px"></div>';
        res.querySelectorAll('input[data-i]').forEach((c) => (c.onchange = () => { found[+c.dataset.i].checked = c.checked; draw(); }));
        res.querySelector('#ca').onchange = (e) => { found.forEach((x) => { if (x.count) x.checked = e.target.checked; }); draw(); };
        res.querySelector('#go').onclick = run;
      }
      async function run() {
        const sel = found.filter((x) => x.checked && x.count);
        if (!sel.length) return HS.toast('선택한 자료가 없습니다');
        const pg = res.querySelector('#prog'); const go = res.querySelector('#go'); go.disabled = true;
        // 모듈별 권한 확인
        const deny = [...new Set(sel.map((x) => (KIND_INFO[x.kind] || [])[1]).filter((m) => m && !HS.can(m, 'create')))];
        if (deny.length && !(await HS.confirm('다음 메뉴는 등록 권한이 없어 건너뜁니다: <b>' + deny.join(', ') + '</b><br>계속할까요?'))) { go.disabled = false; return; }
        const locks = await HS.db.list('erp_locks', { eq: { locked: true } });
        const lockSet = new Set(locks.map((l) => l.module + '|' + l.lock_date));
        const DATE = { worklog: 'work_date', worklog_day: 'work_date', headcount: 'work_date', daily_records: 'rec_date', returns_box: 'rec_date', orders: 'rec_date', orders_day: 'rec_date', kpi: 'work_date', kpi_day: 'work_date' };
        const LMOD = { worklog: 'worklog', worklog_day: 'worklog', headcount: 'worklog', daily_records: 'daily', returns_box: 'returns', orders: 'orders', orders_day: 'orders', kpi: 'kpi', kpi_day: 'kpi' };
        const jobs = {}; let skipped = 0; const skipMon = new Set(); // 마감 잠금으로 빠진 달 (2026-11-13)
        const push = (table, rows) => (jobs[table] = (jobs[table] || []).concat(rows));
        for (const x of sel) {
          const mod = (KIND_INFO[x.kind] || [])[1]; if (deny.indexOf(mod) >= 0) continue;
          for (const s of x.sets) {
            let rows = s.rows;
            if (LMOD[s.table]) { const lm = LMOD[s.table]; const before = rows.length;
              if (!HS.can(lm, 'unlock')) { const out = rows.filter((r) => lockSet.has(lm + '|' + r[DATE[s.table]])); out.forEach((r) => skipMon.add(String(r[DATE[s.table]] || '').slice(0, 7))); rows = rows.filter((r) => !lockSet.has(lm + '|' + r[DATE[s.table]])); }
              skipped += before - rows.length; }
            if (s.table === 'worklog' || s.table === 'kpi' || s.table === 'kpi_day') rows = rows.filter((r) => HS.teamOk(r.team));
            if ((s.table === 'teams' || s.table === 'team_cost') && !HS.can('settings', 'edit') && !HS.can('upload', 'create')) continue;
            if (rows.length) push(s.table, rows);
          }
          if (x.prices && x.prices.length) push('task_prices', x.prices);
        }
        // 같은 키 중복 제거(마지막 값)
        const order = ['teams', 'team_cost', 'task_prices', 'worklog', 'worklog_day', 'headcount', 'daily_records', 'tasks', 'returns_box', 'records', 'settlement', 'orders', 'orders_day', 'kpi', 'kpi_day'];
        let total = 0; const done = [];
        try {
          for (const t of order) {
            if (!jobs[t]) continue;
            const keys = HSDB.KEYS['erp_' + t] || ['id'];
            let rows = [...new Map(jobs[t].map((r) => [keys.map((k) => r[k]).join('|'), r])).values()];
            if (t === 'task_prices') { // 기존 단가는 유지하고 새 업무만 추가 (단가 변경은 설정에서)
              const ex = await HS.db.list('erp_task_prices'); const have = new Set(ex.map((r) => r.team + '|' + r.grp + '|' + r.task));
              rows = rows.filter((r) => !have.has(r.team + '|' + r.grp + '|' + r.task));
              if (!rows.length) continue;
            }
            if (t === 'teams') rows = rows.map((r) => Object.assign({}, HS.cache.teamMap[r.name] || { sort: 50, active: true }, r));
            if (t === 'tasks') rows = rows.map((r) => { const o = Object.assign({}, r); if (o.assigned_team && !HS.cache.teamMap[o.assigned_team]) o.assigned_team = null; return o; });
            pg.innerHTML = '<div>' + esc(t) + ' 등록 중… 0 / ' + fmt(rows.length) + '</div><progress max="' + rows.length + '" value="0"></progress>';
            const n = await HS.db.upsert('erp_' + t, rows, (a, b) => { pg.innerHTML = '<div>' + esc(t) + ' 등록 중… ' + fmt(a) + ' / ' + fmt(b) + '</div><progress max="' + b + '" value="' + a + '"></progress>'; });
            // 어느 기간이 들어갔는지 같이 보여 줌 — 달이 빠진 것을 바로 알 수 있게 (2026-11-13)
            const dc = DATE[t]; let span = '';
            if (dc) { const ds = rows.map((r) => String(r[dc] || '').slice(0, 7)).filter((x) => /^\d{4}-\d{2}$/.test(x)).sort(); if (ds.length) { const u = [...new Set(ds)]; span = ' (' + u[0] + (u.length > 1 ? ' ~ ' + u[u.length - 1] + ' · ' + u.length + '개월' : '') + ')'; } }
            total += n; done.push(t + ' ' + fmt(n) + span);
            // 일일 마감보고는 넣은 뒤 날짜가 다 들어갔는지 바로 확인한다 (인터넷이 끊겨 한 묶음이 빠지는 일이 있어서 · 2026-11-19)
            if (t === 'daily_records' && dc) {
              const ds = [...new Set(rows.map((r) => String(r[dc] || '')).filter(Boolean))].sort();
              if (ds.length) {
                const have = new Set((await HS.db.list('erp_' + t, { gte: { [dc]: ds[0] }, lte: { [dc]: ds[ds.length - 1] }, select: dc }).catch(() => [])).map((r) => r[dc]));
                const miss = ds.filter((x) => !have.has(x));
                if (miss.length) done.push('⚠ 안 들어간 날짜 ' + miss.length + '일: ' + miss.slice(0, 6).join(' · ') + (miss.length > 6 ? ' …' : '') + ' — 다시 올려 주세요');
              }
            }
          }
          if (jobs.kpi) { // KPI → 관리자 업무일지 자동 반영
            const pairs = [...new Set(jobs.kpi.map((r) => r.work_date + '|' + r.team))].sort(); let okN = 0; const bad = [];
            for (const k of pairs) { const [wd, tm] = k.split('|'); pg.innerHTML = '<div>업무일지 반영 중… ' + esc(wd) + '</div>'; try { await HS.db.rpc('erp_kpi_sync', { p_date: wd, p_team: tm }); okN++; } catch (e) { bad.push(wd + ' ' + e.message); } }
            done.push('업무일지 반영 ' + okN + '일' + (bad.length ? ' (제외 ' + bad.length + '일: ' + bad.slice(0, 2).join(' / ') + ')' : ''));
          }
          await HS.db.insert('erp_uploads', { file_name: [...new Set(sel.map((x) => x.file))].join(', ').slice(0, 300), kinds: [...new Set(sel.map((x) => (KIND_INFO[x.kind] || [x.kind])[0]))], rows: total, summary: { done, skipped } }).catch(() => {});
          pg.innerHTML = '<div class="lock ok">✅ <b>' + fmt(total) + '건 등록 완료</b><span class="mute">' + esc(done.join(' · ')) + (skipped ? ' · 마감된 날짜 ' + fmt(skipped) + '건 제외' + (skipMon.size ? ' (' + [...skipMon].sort().join(' · ') + ' — 마감을 풀고 다시 올리면 들어갑니다)' : '') : '') + '</span></div>';
          HS.toast(fmt(total) + '건 등록했습니다', 'ok'); await HS.loadRefs();
        } catch (e) { HS.err(e); pg.innerHTML = '<div class="lock">⚠️ 등록 중 오류: ' + esc(e.message) + '<br>' + esc(done.join(' · ')) + ' 까지는 등록됐습니다. 다시 올리면 이어서 반영됩니다(중복 없음).</div>'; }
        go.disabled = false;
      }
    },
  });
  function templates() {
    HS.needXlsx(); const wb = XLSX.utils.book_new();
    const add = (name, aoa) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
    add('업무협조', [['업무협조 TO-DO 일괄 등록 양식 (시트 이름은 "업무협조"로 시작)'], [], ['구분', '업무구분', '브랜드', '작성자', '업무제목', '작업지시내용', '할당팀', '완료기한', '출고일자', '현장확인', '결과', '비고'], ['', '보충출고', '마스터바니', HS.me.name, '롯데잠실 보충 출고', '롯데잠실 보충출고 · 용차', '정상1팀', today(), today(), '', '', '']]);
    add('반품박스', [['반품일', '탑코리아', '롯데', '행낭', '기타', '총합계', '옷걸이 및 기타박스', '반품 완료 박스수', '미작업 박스', '반품 진행률', '확정수량(PCS)'], [today(), 10, 20, 2, 0, '', 1, 31, '', '', 800]]);
    add('입고대행누적데이터', [['입고 대행 정산 누적 데이터'], [], [], ['ON', '고객사코드', '고객사명', '입고예정일', '품번', 'PCS수량', 'BOX수량', '차량정보', '', '', '확정BOX(A)', '확정BOX(S)', '확정BOX총수량', '확정BOX금액'], [], [1, 'MAMMUT', 'MAMMUT SPORTS GROUP AG', today(), 'M31E6FT002', 50, 6, '', '', '', 0, 6, 6, 30000]]);
    add('안내', [['혜성물류 회의자료 엑셀 일괄 등록 안내'], ['· 관리자 업무일지, 일일 마감보고(날짜 시트 261019 형식), 업무협조(26년10월 형식), 용차출고, D+1이상지시, 출고홀딩, 오픈/폐점 스케줄, B2B/O2O 부자재출고, 반품 대장 파일은 기존 파일 그대로 올리면 됩니다.'], ['· 같은 자료를 다시 올리면 중복 없이 최신 값으로 바뀝니다.'], ['· 마감 확정된 날짜는 마감 해제 권한자만 덮어쓸 수 있습니다.']]);
    XLSX.writeFile(wb, '혜성ERP_입력양식.xlsx');
  }

  // ================= 사용자 · 등급 =================
  HS.view('users', {
    title: '사용자 · 등급 관리', perm: 'users',
    async render(body, p, tools) {
      const tab = p.k || 'users';
      tools.appendChild(HS.seg([['users', '사용자'], ['roles', '등급 · 권한'], ['ceo', '🔒 대표님 지시 명단'], ['audit', '수정 이력']], tab, (k) => HS.go('users', { k })));
      body.innerHTML = '';
      const edit = HS.can('users', 'edit');
      // 스스로 가입하지 않는 분(대표님 등)의 계정을 관리자가 바로 만들기 (2026-11-19)
      if (tab === 'users' && edit) { const ab = HS.el('<button class="btn p">+ 사용자 직접 추가</button>'); ab.onclick = () => addUserForm().catch(HS.err); tools.appendChild(ab); }
      // 대표님 지시 · 할 일 — 등급이 아니라 사람 단위 명단 (views-ceo.js 의 HS.ceoMembers · sql/29_ceo.sql)
      if (tab === 'ceo') {
        const c = HS.el('<div class="card"><h3>🔒 대표님 지시 · 할 일 — 볼 수 있는 사람 <small>등급이 아니라 사람 단위 · 명단에 없으면 관리자라도 메뉴가 안 보이고 내용을 읽을 수 없음</small></h3><div class="cm"></div></div>');
        body.appendChild(c); if (HS.ceoMembers) await HS.ceoMembers(c.querySelector('.cm')); return;
      }
      if (tab === 'users') {
        const people = await HS.db.list('erp_profiles', { order: ['created_at', false] });
        const pending = people.filter((x) => !x.active || x.role_id === 'pending');
        const roleName = (id) => (HS.cache.roles.find((r) => r.id === id) || { name: id }).name;
        if (pending.length) body.appendChild(HS.el('<div class="lock">🔔 <b>승인 대기 ' + pending.length + '명</b><span class="mute">이름을 눌러 등급과 담당 팀을 지정하고 승인하세요.</span></div>'));
        const c = HS.el('<div class="card"><h3>사용자 ' + people.length + '명 <small>등급에 따라 메뉴별 보기·등록·수정·마감 권한이 정해집니다 · <b>이름을 누르면</b> 아이디 · 비밀번호 · 연락처 · 담당 팀을 고치거나 지울 수 있습니다 (관리자만)</small></h3><div class="tw"><table><tr><th>이름</th><th>아이디</th><th>소속</th><th>직급</th><th>등급</th><th>담당 팀</th><th>상태</th><th>최근 접속</th></tr>' +
          people.map((x) => '<tr class="click" data-id="' + esc(x.id) + '"><td><b>' + esc(x.name) + '</b></td><td>' + esc(x.login_id) + '</td><td>' + esc(x.dept || '') + '</td><td>' + esc(x.title || '') + '</td><td><span class="tag ' + (x.role_id === 'admin' ? 'b' : x.role_id === 'pending' ? 'r' : '') + '">' + esc(roleName(x.role_id)) + '</span></td><td>' + esc((x.teams || []).join(', ') || (HS.cache.roles.find((r) => r.id === x.role_id) || {}).scope === 'all' ? (x.teams || []).join(', ') || '전체' : '-') + '</td><td>' + (x.active ? '<span class="tag g">사용</span>' : '<span class="tag r">대기</span>') + '</td><td class="mute">' + esc(x.last_seen ? new Date(x.last_seen).toLocaleString('ko-KR') : '') + '</td></tr>').join('') + '</table></div></div>');
        body.appendChild(c);
        if (edit) c.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => userForm(people.find((x) => x.id === tr.dataset.id))));
        // 지난 사람 — 지운 사용자의 이름만 남겨 둔 명단 (옛 자료의 작성자 칸이 빈칸이 되지 않게)
        const gone = (HS.cache.gone || []).slice().sort((a, b) => (String(b.at || '') < String(a.at || '') ? -1 : 1));
        if (gone.length) body.appendChild(HS.el('<div class="card" style="margin-top:14px"><h3>지난 사람 ' + gone.length + '명 <small>지운 사용자 · 옛 자료의 작성자 이름을 찾는 데만 씁니다 (로그인 안 됨)</small></h3><div class="tw"><table class="no-no"><tr><th>이름</th><th>아이디</th><th>소속</th><th>직급</th><th>지운 날</th><th>지운 사람</th></tr>'
          + gone.map((x) => '<tr><td><b>' + esc(x.name) + '</b></td><td>' + esc(x.login_id || '') + '</td><td>' + esc(x.dept || '') + '</td><td>' + esc(x.title || '') + '</td><td class="mute">' + esc(x.at ? new Date(x.at).toLocaleString('ko-KR') : '') + '</td><td class="mute">' + esc(x.by_name || '') + '</td></tr>').join('')
          + '</table></div></div>'));
        return;
      }
      if (tab === 'roles') {
        const roles = (await HS.db.list('erp_roles', { order: ['level', false] })).filter((r) => r.id !== 'pending');
        const c = HS.el('<div class="card"><h3>등급별 권한 <small>체크를 바꾸고 저장하면 해당 등급 사용자 모두에게 즉시 적용 · 최종 판단은 DB 보안(RLS)이 함</small><span class="sp"></span>' + (edit ? '<button class="btn sm p" id="addRole">+ 등급 추가</button>' : '') + '</h3><div id="rl"></div></div>');
        body.appendChild(c);
        const rl = c.querySelector('#rl');
        roles.forEach((r) => {
          const box = HS.el('<div style="border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:12px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px"><b style="font-size:14px">' + esc(r.name) + '</b><span class="tag">' + esc(r.id) + '</span><span class="tag ' + (r.scope === 'all' ? 'b' : 'y') + '">' + (r.scope === 'all' ? '전체 팀' : '담당 팀만') + '</span><span class="mute">' + esc(r.memo || '') + '</span><span class="sp"></span>' + (edit ? '<input class="in" style="width:120px" data-f="name" value="' + esc(r.name) + '"><select class="in" data-f="scope"><option value="all">전체 팀</option><option value="own_team">담당 팀만</option></select><input class="in" style="width:70px" data-f="level" title="등급 순위(높을수록 상위)" value="' + esc(r.level) + '"><button class="btn sm p" data-save>저장</button>' + (['admin', 'ceo', 'support', 'leader', 'staff'].indexOf(r.id) < 0 ? '<button class="btn sm r" data-del>삭제</button>' : '') : '') + '</div>' +
            '<div class="tw"><table class="perm"><tr><th>메뉴</th>' + Object.values(HS.ACTIONS).map((a) => '<th style="text-align:center">' + a + '</th>').join('') + '</tr>' +
            HS.MODULES.map(([m, l, acts]) => '<tr><td>' + esc(l) + '</td>' + Object.keys(HS.ACTIONS).map((a) => '<td>' + (acts.indexOf(a) >= 0 ? '<input type="checkbox" data-m="' + m + '" data-a="' + a + '" ' + (r.perms && r.perms[m] && r.perms[m][a] ? 'checked' : '') + ' ' + (edit && !(r.id === 'admin' && m === 'users') ? '' : 'disabled') + '>' : '') + '</td>').join('') + '</tr>').join('') + '</table></div></div>');
          if (edit) {
            box.querySelector('[data-f="scope"]').value = r.scope;
            box.querySelector('[data-save]').onclick = async () => {
              const perms = {}; box.querySelectorAll('input[data-m]').forEach((i) => { if (i.checked) { (perms[i.dataset.m] = perms[i.dataset.m] || {})[i.dataset.a] = true; } });
              if (r.id === 'admin') perms.users = { view: true, edit: true, delete: true };
              try { await HS.db.upsert('erp_roles', [{ id: r.id, name: box.querySelector('[data-f="name"]').value.trim() || r.name, scope: box.querySelector('[data-f="scope"]').value, level: +box.querySelector('[data-f="level"]').value || 0, perms, memo: r.memo }]); HS.toast(r.name + ' 권한을 저장했습니다', 'ok'); await HS.loadRefs(); } catch (e) { HS.err(e); }
            };
            const d = box.querySelector('[data-del]'); if (d) d.onclick = async () => { const used = HS.cache.people.filter((x) => x.role_id === r.id).length; if (used) return HS.toast('이 등급 사용자 ' + used + '명이 있어 삭제할 수 없습니다', 'err'); if (await HS.confirm(r.name + ' 등급을 삭제할까요?')) { await HS.db.remove('erp_roles', { id: r.id }).catch(HS.err); await HS.loadRefs(); HS.route(); } };
          }
          rl.appendChild(box);
        });
        const ar = c.querySelector('#addRole');
        if (ar) ar.onclick = async () => {
          const f = HS.el('<div class="form"><label class="f">등급 이름<input class="in" id="n" placeholder="예: 반장"></label><label class="f">복사할 등급<select class="in" id="b">' + roles.map((r) => '<option value="' + r.id + '">' + esc(r.name) + '</option>').join('') + '</select></label></div>');
          await HS.modal('등급 추가', f, [['취소', null], ['추가', true, 'p']], { onOk: async () => { const n = f.querySelector('#n').value.trim(); if (!n) throw new Error('이름을 입력하세요'); const b = roles.find((r) => r.id === f.querySelector('#b').value); await HS.db.upsert('erp_roles', [{ id: 'r' + Date.now().toString(36), name: n, level: (b.level || 10) - 1, scope: b.scope, perms: JSON.parse(JSON.stringify(b.perms || {})), memo: b.name + ' 기준 복사' }]); await HS.loadRefs(); HS.route(); } });
        };
        return;
      }
      // 수정 이력
      const tbl = p.t || '';
      const rows = await HS.db.list('erp_audit', Object.assign({ order: ['at', false], limit: 400 }, tbl ? { eq: { tbl } } : {}));
      const TN = { erp_worklog: '업무일지', erp_worklog_day: '업무일지(일)', erp_headcount: '인원확인', erp_daily_records: '마감보고', erp_tasks: '업무협조', erp_returns_box: '반품박스', erp_records: '반품대장', erp_settlement: '정산', erp_roles: '등급', erp_profiles: '사용자', erp_teams: '팀', erp_task_prices: '단가', erp_locks: '마감잠금', erp_settings: '설정' };
      const sel = HS.el('<select class="in"><option value="">전체</option>' + Object.entries(TN).map(([k, v]) => '<option value="' + k + '">' + v + '</option>').join('') + '</select>'); sel.value = tbl; sel.onchange = () => HS.go('users', { k: 'audit', t: sel.value }); tools.appendChild(sel);
      const diff = (a, b) => { if (!a) return '신규'; if (!b) return '삭제'; return Object.keys(b).filter((k) => !/updated_at|updated_by|last_seen/.test(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => k + ': ' + short(a[k]) + ' → ' + short(b[k])).join(', ') || '-'; };
      const short = (v) => { const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return s.length > 40 ? s.slice(0, 40) + '…' : s; };
      if (HS.can('users', 'edit')) { const tb = await auditTrimBar(); if (tb) body.appendChild(tb); }
      body.appendChild(HS.el('<div class="card"><h3>수정 이력 <small>최근 400건 · 누가 · 언제 · 무엇을</small></h3><div class="tw"><table><tr><th>시각</th><th>사용자</th><th>메뉴</th><th>동작</th><th>대상</th><th>변경 내용</th></tr>' + rows.map((r) => { const o = r.after || r.before || {}; return '<tr><td>' + esc(new Date(r.at).toLocaleString('ko-KR')) + '</td><td>' + esc(HS.who(r.by_user)) + '</td><td>' + esc(TN[r.tbl] || r.tbl) + '</td><td><span class="tag ' + (r.action === 'DELETE' ? 'r' : r.action === 'INSERT' ? 'g' : 'b') + '">' + ({ INSERT: '등록', UPDATE: '수정', DELETE: '삭제' }[r.action] || r.action) + '</span></td><td>' + esc([o.work_date || o.rec_date || o.lock_date || o.in_date, o.team || o.section, o.task || o.rec_key || o.title || o.name].filter(Boolean).join(' · ')) + '</td><td class="wrap mute">' + esc(diff(r.before, r.after)) + '</td></tr>'; }).join('') + '</table></div></div>'));
    },
  });
  // 수정 이력 자동 지우기 (sql/31_audit_trim.sql · 2026-11-18) — 기본 2년 · 매일 밤 00:40 · 0 이면 끔
  const MONTHS = [[12, '1년 지난 것'], [24, '2년 지난 것'], [36, '3년 지난 것'], [0, '자동으로 지우지 않기']];
  const cutOf = (mo) => { const d = new Date(); d.setMonth(d.getMonth() - mo); return HS.ymd(d); };
  async function auditTrimBar() {
    let i = null; try { i = await HS.db.rpc('erp_audit_trim_info'); } catch (e) { return null; } // SQL 미설치면 줄을 숨김
    if (!i) return null;
    const mo = +i.months || 0;
    const c = HS.el('<div class="card no-tools" style="margin-bottom:12px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
      '<b style="font-size:13px">오래된 이력 자동 지우기</b>' +
      '<select class="in" id="am" style="width:170px">' + MONTHS.map(([m, l]) => '<option value="' + m + '"' + (m === mo ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
      '<span class="mute" style="font-size:12px" id="ai"></span><span class="sp"></span>' +
      '<button class="btn sm" id="ax">지금 지우기</button></div>' +
      '<div class="mute" style="font-size:11.5px;margin-top:6px;line-height:1.7">· 수정 이력만 지웁니다 — 업무 자료(마감보고 · 업무일지 · 반품 대장 등)는 그대로입니다 · <b class="neg">지운 이력은 되돌릴 수 없습니다</b></div></div>');
    const am = c.querySelector('#am'), ai = c.querySelector('#ai'), ax = c.querySelector('#ax');
    const info = (x) => { const m = +x.months || 0; ai.innerHTML = m ? (x.cron ? '매일 밤 00:40 자동' : '<span class="wa3">자동 예약이 안 되어 있습니다 (pg_cron 없음) — [지금 지우기] 를 눌러 주세요</span>') + ' · 지금 지울 것 <b>' + fmt(+x.old || 0) + '건</b>' : '자동으로 지우지 않습니다'; ax.disabled = !m || !+x.old; };
    info(i);
    am.onchange = async () => { try { const x = await HS.db.rpc('erp_audit_trim_set', { p_months: +am.value }); info(x); HS.toast(+am.value ? MONTHS.find((m) => m[0] === +am.value)[1] + ' 부터 매일 밤 지웁니다' : '자동으로 지우지 않습니다', 'ok'); } catch (e) { HS.err(e); } };
    ax.onclick = async () => {
      const m = +am.value; if (!m) return;
      let x = null; try { x = await HS.db.rpc('erp_audit_trim_info'); } catch (e) { return HS.err(e); }
      const n = +x.old || 0; if (!n) { info(x); return HS.toast('지울 것이 없습니다'); }
      if (!(await HS.confirm('수정 이력 <b>' + fmt(n) + '건</b>을 지웁니다 <span class="mute">(' + esc(cutOf(m)) + ' 이전)</span><br><br><b class="neg">되돌릴 수 없습니다.</b> 업무 자료는 그대로입니다.'))) return;
      try { const r = await HS.db.rpc('erp_purge', { p_kind: 'audit', p_before: cutOf(m) }); HS.toast(fmt((r && r.erp_audit) || 0) + '건을 지웠습니다', 'ok'); HS.route(); } catch (e) { HS.err(e); }
    };
    return c;
  }
  // 관리자가 계정을 바로 만들기 (sql/32_add_user.sql) — 대표님처럼 스스로 가입하지 않는 분을 위해 (2026-11-19)
  async function addUserForm() {
    const f = HS.el('<div class="form"><label class="f">아이디 <small class="mute">영문 소문자 · 숫자</small><input class="in" id="a1" placeholder="예: ceo" autocomplete="off"></label>' +
      '<label class="f">이름<input class="in" id="a2" placeholder="예: 홍길동"></label>' +
      '<label class="f">소속<input class="in" id="a3" placeholder="예: 경영지원"></label>' +
      '<label class="f">직급<input class="in" id="a4" placeholder="예: 대표이사"></label>' +
      '<label class="f">연락처<input class="in" id="a5" autocomplete="off"></label>' +
      '<label class="f">등급<select class="in" id="a6">' + HS.cache.roles.filter((r) => r.id !== 'pending').map((r) => '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>').join('') + '</select></label>' +
      '<label class="f">첫 비밀번호 <small class="mute">8자 이상</small><input class="in" id="a7" type="password" autocomplete="new-password"></label>' +
      '<label class="f">비밀번호 다시<input class="in" id="a8" type="password" autocomplete="new-password"></label>' +
      '<div class="wide"><div class="mute" style="font-size:12px;margin-bottom:4px">담당 팀 (현장 팀장 · 실무진은 담당 팀 자료만 봅니다)</div><div id="atc"></div></div>' +
      '<div class="wide mute" style="font-size:11.5px;line-height:1.7">· 바로 쓸 수 있는 계정이 만들어집니다 (승인 절차 없음)<br>· 정한 비밀번호는 본인에게 따로 알려 주시고, 본인이 로그인한 뒤 [비밀번호 변경]으로 바꾸게 하세요<br>· 대표님 지시 · 할 일을 보시게 하려면 만든 뒤 <b>[🔒 대표님 지시 명단]</b> 에서 추가해 주세요</div></div>');
    const sel = new Set(); const tc = f.querySelector('#atc');
    HS.cache.teams.forEach((t) => { const ch = HS.el('<span class="chip">' + esc(t.name) + '</span>'); ch.onclick = () => { if (sel.has(t.name)) sel.delete(t.name); else sel.add(t.name); ch.classList.toggle('on'); }; tc.appendChild(ch); });
    await HS.modal('사용자 직접 추가', f, [['취소', null], ['만들기', true, 'p']], { onOk: async (a, bg) => {
      const g = (i) => bg.querySelector('#a' + i).value;
      if (g(7) !== g(8)) throw new Error('비밀번호 두 칸이 다릅니다');
      const r = await HS.db.rpc('erp_add_user', { p_login_id: g(1).trim(), p_password: g(7), p_name: g(2).trim(), p_role: g(6), p_dept: g(3).trim(), p_title: g(4).trim(), p_phone: g(5).trim(), p_teams: [...sel] });
      HS.toast((r && r.name ? r.name : g(2)) + ' 계정을 만들었습니다 · 아이디 ' + (r && r.login_id ? r.login_id : g(1)), 'ok');
      await HS.loadRefs(); HS.route();
    } });
  }
  // 사용자 고치기 — 이름 · 아이디 · 소속 · 직급 · 연락처 · 등급 · 담당 팀 · 비밀번호 · 삭제 (관리자만 · 2026-11-24)
  async function userForm(u) {
    const f = HS.el('<div class="form"><label class="f">이름<input class="in" id="u1"></label>'
      + '<label class="f">아이디 <small class="mute">영문 소문자 · 숫자 · . _ -</small><input class="in" id="u7" autocomplete="off"></label>'
      + '<label class="f">소속<input class="in" id="u2"></label><label class="f">직급<input class="in" id="u3"></label>'
      + '<label class="f">연락처<input class="in" id="u6"></label>'
      + '<label class="f">등급<select class="in" id="u4">' + HS.cache.roles.map((r) => '<option value="' + r.id + '">' + esc(r.name) + '</option>').join('') + '</select></label>'
      + '<label class="f">상태<select class="in" id="u5"><option value="1">사용 (승인)</option><option value="">사용 중지</option></select></label>'
      + '<div class="wide"><div class="mute" style="font-size:12px;margin-bottom:4px">담당 팀 (현장 팀장·실무진은 담당 팀 자료만 보고 처리합니다)</div><div id="tc"></div></div>'
      + '<div class="wide" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:10px"><button class="btn" id="upw">🔑 비밀번호 바꾸기</button>'
      + '<span class="mute" style="font-size:11.5px">관리자가 새 비밀번호를 정해 주고 본인에게 따로 알려 주세요</span></div>'
      + '<div class="wide mute" style="font-size:11.5px;line-height:1.7">· <b>아이디</b>를 바꾸면 그 사람은 <b>새 아이디로 로그인</b>해야 합니다. 지난 자료는 그대로 붙어 있습니다.<br>· 잠깐 못 쓰게만 하려면 <b>상태 › 사용 중지</b> 를 쓰세요 (삭제는 되돌릴 수 없습니다).</div></div>');
    const v = (i, x) => { const e = f.querySelector('#u' + i); if (x !== undefined) e.value = x == null ? '' : x; return e.value; };
    v(1, u.name); v(7, u.login_id); v(2, u.dept); v(3, u.title); v(6, u.phone); v(4, u.role_id === 'pending' ? 'staff' : u.role_id); v(5, u.active || u.role_id === 'pending' ? '1' : '');
    const sel = new Set(u.teams || []); const tc = f.querySelector('#tc');
    HS.cache.teams.forEach((t) => { const ch = HS.el('<span class="chip ' + (sel.has(t.name) ? 'on' : '') + '">' + esc(t.name) + '</span>'); ch.onclick = () => { if (sel.has(t.name)) sel.delete(t.name); else sel.add(t.name); ch.classList.toggle('on'); }; tc.appendChild(ch); });
    f.querySelector('#upw').onclick = (e) => { e.preventDefault(); pwForm(u).catch(HS.err); };
    const btn = [['취소', null], ['저장', 'save', 'p']]; if (HS.can('users', 'delete') && u.id !== HS.me.id) btn.unshift(['삭제', 'del', 'r']);
    const r = await HS.modal(u.name + ' (' + u.login_id + ')', f, btn, { onOk: async (a) => {
      if (a !== 'save') return;
      const lid = v(7).trim().toLowerCase();
      if (lid && lid !== String(u.login_id || '').toLowerCase()) await HS.db.rpc('erp_set_login_id', { p_id: u.id, p_login_id: lid });
      await HS.db.update('erp_profiles', { id: u.id }, { name: v(1).trim(), dept: v(2).trim() || null, title: v(3).trim() || null, phone: v(6).trim() || null, role_id: v(4), active: !!v(5), teams: [...sel] });
      HS.toast('저장했습니다' + (lid && lid !== String(u.login_id || '').toLowerCase() ? ' · 아이디 ' + lid : ''), 'ok'); await HS.loadRefs(); HS.route();
    } });
    if (r === 'del') await delUser(u);
  }
  // 비밀번호 바꾸기 — 관리자가 직접 정해 줌 (sql/34_user_admin.sql)
  async function pwForm(u) {
    const f = HS.el('<div class="form"><label class="f">새 비밀번호 <small class="mute">8자 이상</small><input class="in" id="p1" type="password" autocomplete="new-password"></label>'
      + '<label class="f">새 비밀번호 다시<input class="in" id="p2" type="password" autocomplete="new-password"></label>'
      + '<div class="wide mute" style="font-size:11.5px;line-height:1.7">· 정한 비밀번호는 <b>본인에게 따로</b> 알려 주시고, 본인이 로그인한 뒤 [비밀번호 변경]으로 바꾸게 하세요.<br>· 지금 비밀번호는 아무도 볼 수 없습니다 (암호로 저장되어 있습니다).</div></div>');
    await HS.modal(u.name + ' (' + u.login_id + ') 비밀번호 바꾸기', f, [['취소', null], ['바꾸기', true, 'p']], { onOk: async (a, bg) => {
      const a1 = bg.querySelector('#p1').value, a2 = bg.querySelector('#p2').value;
      if (a1 !== a2) throw new Error('비밀번호 두 칸이 다릅니다');
      await HS.db.rpc('erp_set_password', { p_id: u.id, p_password: a1 });
      HS.toast(u.name + ' 비밀번호를 바꿨습니다 · 본인에게 알려 주세요', 'ok');
    } });
  }
  // 사용자 삭제 — ERP 명단 + 로그인 계정까지 (이름은 '지난 사람' 으로 남겨 옛 자료의 작성자 칸을 지킴)
  async function delUser(u) {
    const f = HS.el('<div><div style="line-height:1.9"><b>' + esc(u.name) + ' (' + esc(u.login_id) + ')</b> 을(를) <b class="neg">완전히 지웁니다.</b><br>'
      + '· ERP 명단에서 빠지고 <b>로그인 계정(Supabase)까지</b> 지워집니다 — 되돌릴 수 없습니다.<br>'
      + '· 그 아이디를 나중에 다시 쓸 수 있게 됩니다.<br>'
      + '· 이 사람이 쓴 <b>업무일지 · 마감보고 등 자료는 그대로 남습니다.</b> 이름도 [지난 사람] 으로 남겨 두어 작성자 칸이 빈칸이 되지 않습니다.<br>'
      + '· 업무협조 TO-DO 의 담당자 · 등록자 칸은 비워집니다.</div>'
      + '<label class="f" style="margin-top:10px">맞으면 <b>' + esc(u.name) + '</b> 을 그대로 적어 주세요<input class="in" id="dn" autocomplete="off" style="width:200px"></label>'
      + '<div class="mute" style="font-size:11.5px;margin-top:8px">잠깐 못 쓰게만 하려면 지우지 말고 <b>상태 › 사용 중지</b> 를 쓰세요.</div></div>');
    await HS.modal('사용자 완전 삭제', f, [['취소', null], ['사용 중지로 바꾸기', 'off'], ['완전히 삭제', 'del', 'r']], { onOk: async (a, bg) => {
      if (a === 'off') { await HS.db.update('erp_profiles', { id: u.id }, { active: false }); HS.toast(u.name + ' 을 사용 중지로 바꿨습니다', 'ok'); await HS.loadRefs(); HS.route(); return; }
      const nm = bg.querySelector('#dn').value.trim();
      if (nm !== u.name) throw new Error('이름이 다릅니다 — ' + u.name + ' 을 그대로 적어 주세요');
      await HS.db.rpc('erp_del_user', { p_id: u.id, p_name: nm });
      HS.toast(u.name + ' 을 지웠습니다', 'ok'); await HS.loadRefs(); HS.route();
    } });
  }

  // ================= 품번 규칙 (아이템 코드 → 아이템군) =================
  async function styleRules(body, ed) {
    const ST = window.HSStyle;
    try { const im = (await HS.db.list('erp_settings', { eq: { key: 'item_map' } }))[0]; ST.setExtra((im && im.value) || {}); } catch (e) { /* 무시 */ }
    // 재고 품번 수 (WMS 정상 · 반품창고) · 표에 없는 코드 찾기
    const used = {}; try { for (const sub of ['정상창고', '반품창고']) for (const x of (HS.csParts ? await HS.csParts('wms', sub) : [])) { const c = ST.itemOf(String(x[1] || '').toUpperCase()); if (c) (used[c] || (used[c] = new Set())).add(x[1]); } } catch (e) { /* 무시 */ }
    const G = ST.GRP; const gl = (g) => (g ? G[g] : '');
    let rows = ST.table(); const known = new Set(rows.map((r) => r.code));
    Object.keys(used).filter((c) => !known.has(c)).forEach((c) => rows.push({ code: c, n: '', g: null, src: 'unknown', ok: false }));
    const rk = (r) => (r.src === 'unknown' ? 0 : !r.ok ? 1 : 2); rows.sort((a, b) => rk(a) - rk(b) || (a.code < b.code ? -1 : 1));
    const need = rows.filter((r) => !r.ok);
    const ch = (r) => r.src === 'unknown' ? '<span class="tag r">미확인 · 아이템군을 골라 주세요</span>' : r.src === 'learn' ? '<span class="tag y">자동 학습 ' + esc(r.at || '') + (r.ok ? '' : ' · 확인 필요') + '</span>' + (r.from ? ' <span class="mute" style="font-size:11px">' + esc(r.from) + '</span>' : '') : r.src === 'admin' ? '<span class="tag b">관리자 수정 ' + esc(r.at || '') + '</span>' : '<span class="tag">기본</span>';
    body.innerHTML = '';
    if (need.length) body.appendChild(HS.el('<div class="lock" style="margin-bottom:12px">⚠ <b>확인 필요 ' + need.length + '건</b> — ' + need.slice(0, 6).map((r) => '<b>' + esc(r.code) + '</b>' + (r.g ? ' → ' + esc(gl(r.g)) : ' (미확인)')).join(' · ') + (need.length > 6 ? ' 외' : '') + (ed ? ' · 맞으면 [확인], 틀리면 아이템군을 바꾼 뒤 [저장]' : ' · 관리자가 확인합니다') + '</div>'));
    const wrap = HS.el('<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:14px" class="srw"></div>'); body.appendChild(wrap);
    const yr = [['7 · 8 · 9', '2017 · 2018 · 2019'], ['0', '2020'], ['A · B · C', '2021 · 2022 · 2023'], ['D · E · F', '2024 · 2025 · 2026'], ['G · H …', '2027 · 2028 … (자동)']];
    const se = [['1', '1 (봄)'], ['2', '2 (여름)'], ['3', '3 (가을)'], ['4', '4 (겨울)'], ['5 · 6 · 7', 'S/S · F/W · NONSEASON']];
    const box = (v, l, k) => '<div style="border:1px solid ' + (k ? '#E5C35A;background:#FFF8E1' : 'var(--line);background:#fff') + ';border-radius:8px;padding:6px 10px;text-align:center;min-width:54px"><b style="display:block;font-size:19px;font-family:monospace">' + v + '</b><span style="font-size:11.5px">' + l + '</span></div>';
    wrap.appendChild(HS.el('<div class="card"><h3>품번 자리별 뜻 <small>크리스 · LX 공통 · 예: 221E2TR803</small></h3><div style="display:flex;gap:5px;flex-wrap:wrap;margin:4px 0 12px">' + box('2', '브랜드', 1) + box('21', '구분') + box('E', '기획년도', 1) + box('2', '시즌', 1) + box('TR', '아이템', 1) + box('803', '일련번호') + '</div>' +
      '<div class="tw"><table class="no-tools"><tr><th>기획년도 (4번째)</th><th>뜻</th><th>시즌 (5번째)</th><th>뜻</th></tr>' + yr.map((y, i) => '<tr><td>' + y[0] + '</td><td>' + y[1] + '</td><td>' + se[i][0] + '</td><td>' + se[i][1] + '</td></tr>').join('') + '</table></div>' +
      '<div class="mute" style="font-size:11.5px;line-height:1.7;margin-top:8px">· 파일에 기획년도 · 시즌 · 아이템군이 있으면 파일 값을 쓰고, <b>빈칸만</b> 이 규칙으로 채웁니다<br>· 적용 화면: WMS 재고 조회 · 현황 엑셀 · 신상품 현황 · 재고 실사 분류<br>· 년도 · 시즌은 규칙이 고정이라 고칠 것이 없습니다 · 아이템만 오른쪽 표로 관리<br>· 규칙에 맞지 않는 품번(다른 화주 양식 등)은 채우지 않고 빈칸으로 둡니다</div></div>'));
    const c = HS.el('<div class="card"><h3>아이템 코드 → 아이템군 <small>' + rows.length + '개 · 자동 학습 ' + rows.filter((r) => r.src === 'learn').length + ' · 관리자 수정 ' + rows.filter((r) => r.src === 'admin').length + (rows.some((r) => r.src === 'unknown') ? ' · 미확인 ' + rows.filter((r) => r.src === 'unknown').length : '') + '</small></h3>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><select class="in" id="fg" style="width:150px"><option value="">아이템군 전체</option>' + Object.keys(G).map((g) => '<option value="' + g + '">' + G[g] + '</option>').join('') + '<option value="-">미확인 · 확인 필요</option></select><input class="in" id="fq" placeholder="코드 · 이름 찾기" style="width:150px"><span style="flex:1"></span>' + (ed ? '<button class="btn" id="add">+ 코드 추가</button>' : '') + '<button class="btn" id="xl">엑셀 받기</button></div><div class="tw"></div><div id="pg" style="margin-top:6px"></div>' + (ed ? '<button class="btn p" id="sv" style="margin-top:10px">저장</button>' : '') + '</div>');
    wrap.appendChild(c);
    const edit = {}; let page = 0;
    const view = () => { const fg = c.querySelector('#fg').value, fq = c.querySelector('#fq').value.trim().toUpperCase(); return rows.filter((r) => (!fg || (fg === '-' ? !r.ok : String(r.g) === fg)) && (!fq || r.code.indexOf(fq) >= 0 || String(r.n || '').toUpperCase().indexOf(fq) >= 0)); };
    const draw = () => {
      const V = view(); const P = V.slice(page * 50, page * 50 + 50);
      c.querySelector('.tw').innerHTML = '<table class="no-tools"><tr><th>코드</th><th>아이템 이름</th><th>아이템군</th><th>배운 곳</th><th class="n">재고 품번</th></tr>' + P.map((r) => { const g = edit[r.code] ? edit[r.code].g : r.g; return '<tr' + (!r.ok ? ' style="background:#FFFBEA"' : '') + '><td><b>' + esc(r.code) + '</b></td><td>' + (ed ? '<input class="in" data-n="' + esc(r.code) + '" value="' + esc(edit[r.code] && edit[r.code].n != null ? edit[r.code].n : r.n || '') + '" style="width:150px;padding:3px 6px">' : esc(r.n || '')) + '</td><td>' + (ed ? '<select class="in" data-g="' + esc(r.code) + '" style="width:140px;padding:3px 6px"><option value="">(모름)</option>' + Object.keys(G).map((k) => '<option value="' + k + '"' + (String(g) === k ? ' selected' : '') + '>' + G[k] + '</option>').join('') + '</select>' : esc(gl(g))) + '</td><td>' + ch(r) + (ed && !r.ok && r.g ? ' <button class="btn" data-ok="' + esc(r.code) + '" style="padding:1px 9px">확인</button>' : '') + '</td><td class="n">' + (used[r.code] ? fmt(used[r.code].size) : '<span class="mute">0</span>') + '</td></tr>'; }).join('') + (P.length ? '' : '<tr><td colspan="5" class="empty">해당 코드가 없습니다</td></tr>') + '</table>';
      const pn = Math.ceil(V.length / 50); c.querySelector('#pg').innerHTML = pn > 1 ? Array.from({ length: pn }, (_, i) => '<button class="btn' + (i === page ? ' p' : '') + '" data-p="' + i + '" style="padding:2px 9px;margin-right:4px">' + (i + 1) + '</button>').join('') : '';
      c.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { page = +b.dataset.p; draw(); }));
      c.querySelectorAll('[data-g]').forEach((sl) => (sl.onchange = () => { const k = sl.dataset.g; edit[k] = Object.assign(edit[k] || {}, { g: sl.value ? +sl.value : null }); }));
      c.querySelectorAll('[data-n]').forEach((inp) => (inp.oninput = () => { const k = inp.dataset.n; edit[k] = Object.assign(edit[k] || {}, { n: inp.value.trim() }); }));
      c.querySelectorAll('[data-ok]').forEach((b) => (b.onclick = () => save({ [b.dataset.ok]: { ok: true } })));
    };
    const today = () => new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
    async function save(extra) {
      try {
        const cur = Object.assign({}, ST.getExtra()); let n = 0;
        const all = Object.assign({}, edit); for (const k in extra || {}) all[k] = Object.assign({}, all[k] || {}, extra[k]);
        for (const k in all) {
          const r = rows.find((x) => x.code === k) || { code: k, n: '', g: null }; const e = all[k];
          const g = e.g !== undefined ? e.g : r.g; const nm = e.n != null ? e.n : r.n || '';
          if (!g) { if (e.ok) throw new Error(k + ': 아이템군을 먼저 골라 주세요'); continue; }
          const base = ST.BASE[k];
          if (base && base[0] === g && (nm === base[1] || !nm) && !(cur[k] && cur[k].src === 'learn')) { if (cur[k]) { delete cur[k]; n++; } continue; } // 기본값으로 되돌림
          if (r.src === 'learn' && e.g === undefined && e.n == null) cur[k] = Object.assign({}, cur[k], { ok: true });
          else cur[k] = { g, n: nm.slice(0, 40), src: 'admin', ok: true, at: today(), by: (HS.me && HS.me.name) || '' };
          n++;
        }
        if (!n) return HS.toast('바뀐 내용이 없습니다');
        await HS.db.upsert('erp_settings', [{ key: 'item_map', value: cur }]); ST.setExtra(cur); HS.toast('품번 규칙 저장 (' + n + '건)', 'ok'); HS.route();
      } catch (e) { HS.err(e); }
    }
    c.querySelector('#fg').onchange = () => { page = 0; draw(); };
    let tq; c.querySelector('#fq').oninput = () => { clearTimeout(tq); tq = setTimeout(() => { page = 0; draw(); }, 250); };
    c.querySelector('#xl').onclick = () => HS.download('품번규칙_아이템코드_' + today() + '.xlsx', rows.map((r) => ({ 코드: r.code, 아이템이름: r.n || '', 아이템군: gl(r.g), 구분: { base: '기본', learn: '자동 학습', admin: '관리자 수정', unknown: '미확인' }[r.src], 확인: r.ok ? 'Y' : '', 날짜: r.at || '', 재고품번: used[r.code] ? used[r.code].size : 0 })), '아이템 코드');
    if (ed) {
      c.querySelector('#sv').onclick = () => save();
      c.querySelector('#add').onclick = async () => {
        const f = HS.el('<div class="form"><label class="f">코드 (영문 2자리)<input class="in" id="k" maxlength="2" style="text-transform:uppercase"></label><label class="f">아이템 이름<input class="in" id="n"></label><label class="f">아이템군<select class="in" id="g">' + Object.keys(G).map((k) => '<option value="' + k + '">' + G[k] + '</option>').join('') + '</select></label></div>');
        await HS.modal('아이템 코드 추가', f, [['취소', null], ['추가', true, 'p']], { onOk: async () => { const k = f.querySelector('#k').value.trim().toUpperCase(); if (!/^[A-Z]{2}$/.test(k)) throw new Error('코드는 영문 2자리입니다 (예: XA)'); if (!rows.find((r) => r.code === k)) rows.push({ code: k, n: '', g: null, src: 'admin', ok: true }); edit[k] = { g: +f.querySelector('#g').value, n: f.querySelector('#n').value.trim() }; await save(); } });
      };
    }
    draw();
  }

  // ================= 원가관리 설정 (2026-11-11) =================
  //  · 업무(공정) 추가 · 숨김 · 단가 변경 · 팀 인건비를 한 곳에 모음
  //  · 2026-11-12 부터 팀장 등급도 들어올 수 있음 — 단, 업무 · 단가는 자기 팀만 (인건비는 관리자만)
  //  · 삭제는 '숨김'(active=false). 지나간 업무일지 기록과 월간 회의 숫자를 지키기 위해서임
  HS.view('costset', {
    title: '원가관리 설정', perm: 'costset',
    async render(body, p, tools) {
      const admin = HS.can('settings', 'edit'); // 관리자 = 전 팀 · 인건비까지
      const myT = HS.myTeams(); const leadEd = HS.can('costset', 'edit');
      const canTeam = (t) => admin || (leadEd && myT.indexOf(t) >= 0); // 그 팀 업무 · 단가를 고칠 수 있나
      const tabs = admin ? [['prices', '팀별 업무 · 단가'], ['teams', '팀 · 인건비'], ['year', '연도별 인건비']] : [['prices', '팀별 업무 · 단가']];
      const tab = tabs.some((x) => x[0] === p.k) ? p.k : 'prices';
      tools.appendChild(HS.seg(tabs, tab, (k) => HS.go('costset', { k })));
      body.innerHTML = '';
      const saveBtn = (fn) => { const b = HS.el('<button class="btn p" style="margin-top:10px">저장</button>'); b.onclick = async () => { try { await fn(); HS.toast('저장했습니다', 'ok'); await HS.loadRefs(); HS.route(); } catch (e) { HS.err(e); } }; return b; };
      const ed = admin;

      if (tab === 'year') {
        // 연도별 인건비 — 지난 해 지출을 그 해 단가로 계산하기 위한 표 (sql/26_team_year_cost.sql)
        const nowY = new Date().getFullYear();
        const rows = await HS.db.list('erp_team_cost', {}).catch(() => []);
        const years = [...new Set(rows.map((r) => +r.year).concat([nowY, nowY - 1]))].sort((a, b) => b - a);
        const y = +(p.y || nowY);
        tools.appendChild(HS.seg(years.map((x) => [String(x), x + '년']), String(y), (v) => HS.go('costset', { k: 'year', y: v })));
        const R = Object.fromEntries(rows.filter((r) => +r.year === y).map((r) => [r.team, r]));
        const tnames = HS.cache.teams.map((t) => t.name);
        const g = HS.grid({
          keyLabel: '팀', editable: ed,
          rows: tnames.map((t) => ({ key: t, data: { labor_cost: (R[t] || {}).labor_cost, ot_rate: (R[t] || {}).ot_rate, memo: (R[t] || {}).memo || '' } })),
          cols: [{ k: 'labor_cost', l: y + '년 평균 인건비(1인/일)', t: 'num' }, { k: 'ot_rate', l: y + '년 연장근무 시급', t: 'num' }, { k: 'memo', l: '비고', t: 'text' }],
          extraHead: '<th>기준정보 값</th>',
          extra: (r) => '<td class="n mute">' + fmt((HS.cache.teamMap[r.key] || {}).labor_cost || 0) + '</td>',
        });
        const c = HS.el('<div class="card"><h3>' + y + '년 인건비 <small>그 해 지출 = 인원 × 이 값 · 비워 두면 기준정보의 팀 인건비를 씁니다</small></h3></div>');
        c.appendChild(g.el);
        if (ed) c.appendChild(saveBtn(() => HS.db.upsert('erp_team_cost', g.changed().map((r) => ({ team: r.key, year: y, labor_cost: +r.data.labor_cost || 0, ot_rate: +r.data.ot_rate || 0, memo: r.data.memo || null })))));
        body.appendChild(c);
        body.appendChild(HS.el('<div class="mute" style="font-size:11.5px;margin-top:10px;line-height:1.8">· 예전에는 팀마다 인건비가 하나뿐이라 <b>2025년 지출이 2026년 인건비로</b> 계산됐습니다. 이제 해마다 따로 둡니다.<br>· 원가관리 업무일지 엑셀을 올리면 그 파일에 적힌 <b>평균인건비 · 연장근무시급</b>이 그 해 줄에 자동으로 들어갑니다.<br>· 비워 두면 기준정보(팀 · 인건비)의 값을 씁니다 — 예전과 똑같이 나옵니다.</div>'));
        return;
      }
      if (tab === 'teams') {
        const teams = await HS.db.list('erp_teams', { order: ['sort'] });
        const g = HS.grid({
          keyLabel: '팀', editable: ed, rows: teams.map((t) => ({ key: t.name, data: Object.assign({}, t) })),
          cols: [{ k: 'center_id', l: '센터(gobaek/anseong)', t: 'text' }, { k: 'labor_cost', l: '평균 인건비(1인/일)', t: 'num' }, { k: 'ot_rate', l: '연장근무 시급', t: 'num' }, { k: 'sort', l: '순서', t: 'num' }],
          extraHead: ed ? '<th>사용</th>' : '',
          extra: ed ? ((r) => '<td><button class="btn sm' + (r.data.active === false ? ' p' : ' r') + '" data-on="' + esc(r.key) + '">' + (r.data.active === false ? '사용하기' : '사용 중지') + '</button></td>') : null,
        });
        const c = HS.el('<div class="card"><h3>팀 · 인건비 <small>지출 = T.O × 평균 인건비 + 야근시간 × 야근인원 × 연장근무 시급 (기존 엑셀과 동일)</small></h3></div>'); c.appendChild(g.el);
        if (ed) {
          c.appendChild(saveBtn(() => HS.db.upsert('erp_teams', g.changed().map((r) => ({ name: r.key, center_id: r.data.center_id || 'gobaek', labor_cost: +r.data.labor_cost || 0, ot_rate: +r.data.ot_rate || 0, sort: +r.data.sort || 0, active: r.data.active !== false })))));
          const a = HS.el('<button class="btn" style="margin:10px 0 0 8px">+ 팀 추가</button>');
          a.onclick = async () => { const f = HS.el('<div class="form"><label class="f">팀 이름<input class="in" id="n"></label><label class="f">센터<select class="in" id="c"><option value="gobaek">고백리센터</option><option value="anseong">안성센터</option></select></label><label class="f">평균 인건비<input class="in" id="l" value="160390"></label></div>'); await HS.modal('팀 추가', f, [['취소', null], ['추가', true, 'p']], { onOk: async () => { await HS.db.upsert('erp_teams', [{ name: f.querySelector('#n').value.trim(), center_id: f.querySelector('#c').value, labor_cost: +f.querySelector('#l').value || 0, ot_rate: 0, sort: teams.length + 1, active: true }]); await HS.loadRefs(); HS.route(); } }); };
          c.appendChild(a);
          c.querySelectorAll('[data-on]').forEach((b) => (b.onclick = async () => {
            const nm = b.dataset.on; const t0 = teams.find((x) => x.name === nm) || {}; const turnOn = t0.active === false;
            if (!turnOn && !(await HS.confirm('<b>' + esc(nm) + '</b> 팀을 사용 중지할까요?<br><span class="mute">메뉴와 인원 확인 표에서 빠집니다. 지나간 기록은 그대로 남습니다.</span>'))) return;
            try { await HS.db.upsert('erp_teams', [Object.assign({}, t0, { active: turnOn })]); HS.toast(nm + (turnOn ? ' 사용' : ' 사용 중지'), 'ok'); await HS.loadRefs(); HS.route(); } catch (e) { HS.err(e); }
          }));
        }
        body.appendChild(c);
        body.appendChild(HS.el('<div class="mute" style="font-size:11.5px;margin-top:10px;line-height:1.8">· <b>사용 중지</b>한 팀은 메뉴 · 인원 확인 표 · 고르는 칸에서 빠집니다. 지나간 업무일지와 손익 숫자는 그대로 남습니다.<br>· 팀을 아예 지우지는 않습니다 (지나간 기록이 함께 지워지기 때문).</div>'));
        return;
      }

      // ----- 팀별 업무 · 단가 -----
      const team = p.t || (admin ? '' : myT[0]) || (HS.cache.teams[0] || {}).name || '';
      const edT = canTeam(team); // 이 팀 것을 고칠 수 있나 (관리자 = 전 팀 · 팀장 = 자기 팀)
      const showOff = p.off === '1';
      body.appendChild(HS.el('<div class="lock ' + (edT ? 'ok' : '') + '" style="margin-bottom:12px;line-height:1.8">' +
        (edT ? (admin ? '관리자입니다 — <b>모든 팀</b>의 업무 · 단가를 고칠 수 있습니다.' : '팀장입니다 — <b>' + esc(myT.join(' · ')) + '</b> 의 업무 · 단가만 고칠 수 있습니다.')
          : '<b>' + esc(team) + '</b> 은 보기만 됩니다. 업무 추가 · 숨김 · 단가 변경은 <b>관리자</b> 또는 <b>그 팀 팀장</b>만 할 수 있습니다.') +
        '<br><span class="mute">팀별 원가 관리 입력(업무일지) 화면에서는 공정단가를 고칠 수 없습니다 — 바꾸는 곳은 여기 한 곳입니다.</span></div>'));
      const ts = HS.el('<select class="in">' + HS.cache.teams.map((t) => '<option value="' + esc(t.name) + '"' + (t.name === team ? ' selected' : '') + '>' + esc(t.name) + (canTeam(t.name) && !admin ? ' (내 팀)' : '') + '</option>').join('') + '</select>');
      ts.onchange = () => HS.go('costset', { k: 'prices', t: ts.value, off: showOff ? '1' : '' }); tools.appendChild(ts);
      const all = await HS.db.list('erp_task_prices', { eq: { team }, order: ['sort'] });
      const offN = all.filter((r) => r.active === false).length;
      const rows = showOff ? all : all.filter((r) => r.active !== false);
      const tg = HS.el('<button class="btn' + (showOff ? ' p' : '') + '">숨긴 업무도 보기' + (offN ? ' (' + offN + ')' : '') + '</button>');
      tg.onclick = () => HS.go('costset', { k: 'prices', t: team, off: showOff ? '' : '1' }); tools.appendChild(tg);
      const g = HS.grid({
        keyLabel: '업무구분 · 상세업무', editable: edT,
        rows: rows.map((r) => ({ key: r.id, label: (r.grp ? r.grp + ' · ' : '') + r.task + (r.active === false ? ' <span class="tag">숨김</span>' : ''), data: Object.assign({}, r) })),
        cols: [{ k: 'unit_price', l: '공정단가', t: 'num' }, { k: 'sort', l: '순서', t: 'num' }],
        extraHead: edT ? '<th>목록에서</th>' : '',
        extra: edT ? ((r) => '<td><button class="btn sm' + (r.data.active === false ? ' p' : '') + '" data-hide="' + r.key + '">' + (r.data.active === false ? '되살리기' : '숨기기') + '</button></td>') : null,
      });
      const c = HS.el('<div class="card"><h3>' + esc(team) + ' 업무 · 공정 단가 <small>업무일지에 기본으로 나오는 업무 목록 · 매출 = 작업수량 × 공정단가</small></h3></div>');
      c.appendChild(g.el);
      if (edT) {
        c.appendChild(saveBtn(() => Promise.all(g.changed().map((r) => HS.db.update('erp_task_prices', { id: r.key }, { unit_price: +r.data.unit_price || 0, sort: +r.data.sort || 0 })))));
        const a = HS.el('<button class="btn" style="margin:10px 0 0 8px">+ 업무 추가</button>');
        a.onclick = async () => { const f = HS.el('<div class="form"><label class="f">업무구분<input class="in" id="g" placeholder="예: 출고"></label><label class="f">상세업무<input class="in" id="t"></label><label class="f">공정단가<input class="in" id="u" inputmode="decimal"></label></div>'); await HS.modal(team + ' 업무 추가', f, [['취소', null], ['추가', true, 'p']], { onOk: async () => { const task = f.querySelector('#t').value.trim(); if (!task) throw new Error('상세업무를 입력하세요'); await HS.db.upsert('erp_task_prices', [{ team, grp: f.querySelector('#g').value.trim(), task, unit_price: +f.querySelector('#u').value || 0, sort: all.length + 1, active: true }]); HS.toast('추가했습니다', 'ok'); HS.route(); } }); };
        c.appendChild(a);
        c.querySelectorAll('[data-hide]').forEach((b) => (b.onclick = async () => {
          const id = +b.dataset.hide; const r0 = all.find((x) => x.id === id); if (!r0) return;
          const back = r0.active === false;
          if (!back && !(await HS.confirm('<b>' + esc((r0.grp ? r0.grp + ' · ' : '') + r0.task) + '</b> 를 목록에서 숨길까요?<br><span class="mute">앞으로 업무일지 입력칸에 나오지 않습니다. 지나간 기록과 월간 회의 숫자는 그대로 남고, [숨긴 업무도 보기]에서 되살릴 수 있습니다.</span>'))) return;
          try { await HS.db.update('erp_task_prices', { id }, { active: back }); HS.toast(back ? '되살렸습니다' : '숨겼습니다', 'ok'); HS.route(); } catch (e) { HS.err(e); }
        }));
        if (!all.length) c.appendChild(HS.el('<div class="mute" style="margin-top:8px">업무일지 엑셀을 일괄 등록하면 업무 목록과 단가가 자동으로 들어옵니다.</div>'));
      }
      body.appendChild(c);
      body.appendChild(HS.el('<div class="mute" style="font-size:11.5px;margin-top:10px;line-height:1.8">· <b>숨기기</b>는 지우는 것이 아닙니다. 앞으로 입력칸에만 안 나오고, 지나간 업무일지 · 손익 · 월간 회의 숫자는 그대로입니다.<br>· 업무 추가 · 숨김 · 단가 변경은 <b>관리자(전 팀)</b> 와 <b>그 팀 팀장(자기 팀)</b> 만 할 수 있습니다 (2026-11-12).<br>· <b>팀 · 인건비 · 연도별 인건비</b> 는 관리자만 고칩니다.<br>· 원가 관리 입력(업무일지) 화면에서는 공정단가를 못 고칩니다 — 그 화면에서는 작업수량 · T.O 만 적습니다.</div>'));
    },
  });

  // ================= 기준정보 설정 =================
  HS.view('settings', {
    title: '기준정보 설정', perm: 'settings',
    async render(body, p, tools) {
      // 팀 · 인건비 · 공정 단가는 2026-11-11 부터 [원가관리 설정] 으로 옮김 — 옛 주소로 들어와도 그리로 보냄
      if (p.k === 'teams' || p.k === 'prices') return HS.go('costset', { k: p.k === 'teams' ? 'teams' : 'prices', t: p.t || '' });
      const tab = p.k || 'brands'; const ed = HS.can('settings', 'edit');
      tools.appendChild(HS.seg([['brands', '브랜드'], ['style', '품번 규칙'], ['inbound', '입고대행 단가'], ['sec', '보안'], ['conn', '연결']], tab, (k) => HS.go('settings', { k })));
      tools.appendChild(HS.el('<a class="btn" href="#/costset">원가관리 설정 (업무 · 단가 · 인건비)</a>'));
      body.innerHTML = '';
      const saveBtn = (fn) => { const b = HS.el('<button class="btn p" style="margin-top:10px">저장</button>'); b.onclick = async () => { try { await fn(); HS.toast('저장했습니다', 'ok'); await HS.loadRefs(); HS.route(); } catch (e) { HS.err(e); } }; return b; };
      if (tab === 'teams') {
        const teams = await HS.db.list('erp_teams', { order: ['sort'] });
        const g = HS.grid({ keyLabel: '팀', editable: ed, rows: teams.map((t) => ({ key: t.name, data: Object.assign({}, t) })), cols: [{ k: 'center_id', l: '센터(gobaek/anseong)', t: 'text' }, { k: 'labor_cost', l: '평균 인건비(1인/일)', t: 'num' }, { k: 'ot_rate', l: '연장근무 시급', t: 'num' }, { k: 'sort', l: '순서', t: 'num' }] });
        const c = HS.el('<div class="card"><h3>팀 · 인건비 <small>지출 = T.O × 평균 인건비 + 야근시간 × 야근인원 × 연장근무 시급 (기존 엑셀과 동일)</small></h3></div>'); c.appendChild(g.el);
        if (ed) { c.appendChild(saveBtn(() => HS.db.upsert('erp_teams', g.changed().map((r) => ({ name: r.key, center_id: r.data.center_id || 'gobaek', labor_cost: +r.data.labor_cost || 0, ot_rate: +r.data.ot_rate || 0, sort: +r.data.sort || 0, active: r.data.active !== false }))))); const a = HS.el('<button class="btn" style="margin:10px 0 0 8px">+ 팀 추가</button>'); a.onclick = async () => { const f = HS.el('<div class="form"><label class="f">팀 이름<input class="in" id="n"></label><label class="f">센터<select class="in" id="c"><option value="gobaek">고백리센터</option><option value="anseong">안성센터</option></select></label><label class="f">평균 인건비<input class="in" id="l" value="160390"></label></div>'); await HS.modal('팀 추가', f, [['취소', null], ['추가', true, 'p']], { onOk: async () => { await HS.db.upsert('erp_teams', [{ name: f.querySelector('#n').value.trim(), center_id: f.querySelector('#c').value, labor_cost: +f.querySelector('#l').value || 0, ot_rate: 0, sort: teams.length + 1, active: true }]); await HS.loadRefs(); HS.route(); } }); }; c.appendChild(a); }
        body.appendChild(c); return;
      }
      if (tab === 'prices') {
        const team = p.t || HS.cache.teams[0].name;
        const ts = HS.el('<select class="in">' + HS.cache.teams.map((t) => '<option>' + esc(t.name) + '</option>').join('') + '</select>'); ts.value = team; ts.onchange = () => HS.go('settings', { k: 'prices', t: ts.value }); tools.appendChild(ts);
        const rows = await HS.db.list('erp_task_prices', { eq: { team }, order: ['sort'] });
        const g = HS.grid({ keyLabel: '업무구분 · 상세업무', editable: ed, rows: rows.map((r) => ({ key: r.id, label: (r.grp ? r.grp + ' · ' : '') + r.task, data: Object.assign({}, r) })), cols: [{ k: 'unit_price', l: '공정단가', t: 'num' }, { k: 'sort', l: '순서', t: 'num' }] });
        const c = HS.el('<div class="card"><h3>' + esc(team) + ' 공정 단가 <small>업무일지에 기본으로 나오는 업무 목록 · 매출 = 작업수량 × 공정단가</small></h3></div>'); c.appendChild(g.el);
        if (ed) {
          c.appendChild(saveBtn(() => Promise.all(g.changed().map((r) => HS.db.update('erp_task_prices', { id: r.key }, { unit_price: +r.data.unit_price || 0, sort: +r.data.sort || 0 })))));
          const a = HS.el('<button class="btn" style="margin:10px 0 0 8px">+ 업무 추가</button>'); a.onclick = async () => { const f = HS.el('<div class="form"><label class="f">업무구분<input class="in" id="g"></label><label class="f">상세업무<input class="in" id="t"></label><label class="f">공정단가<input class="in" id="u"></label></div>'); await HS.modal('업무 추가', f, [['취소', null], ['추가', true, 'p']], { onOk: async () => { await HS.db.upsert('erp_task_prices', [{ team, grp: f.querySelector('#g').value.trim(), task: f.querySelector('#t').value.trim(), unit_price: +f.querySelector('#u').value || 0, sort: rows.length + 1 }]); HS.route(); } }); }; c.appendChild(a);
          if (!rows.length) c.appendChild(HS.el('<div class="mute" style="margin-top:8px">업무일지 엑셀을 일괄 등록하면 업무 목록과 단가가 자동으로 들어옵니다.</div>'));
        }
        body.appendChild(c); return;
      }
      if (tab === 'style') return styleRules(body, ed);
      if (tab === 'brands') {
        const rows = await HS.db.list('erp_brands', { order: ['sort'] });
        const g = HS.grid({ keyLabel: '브랜드', editable: ed, rows: rows.map((r) => ({ key: r.name, data: Object.assign({}, r) })), cols: [{ k: 'owner', l: '화주사', t: 'text' }, { k: 'center_id', l: '센터', t: 'text' }, { k: 'sort', l: '순서', t: 'num' }] });
        const c = HS.el('<div class="card"><h3>브랜드 · 화주사 <small>일일 마감보고 브랜드 행 순서</small></h3></div>'); c.appendChild(g.el);
        if (ed) { c.appendChild(saveBtn(() => HS.db.upsert('erp_brands', g.changed().map((r) => ({ name: r.key, owner: r.data.owner, center_id: r.data.center_id || 'gobaek', sort: +r.data.sort || 0, b2b: true }))))); const a = HS.el('<button class="btn" style="margin:10px 0 0 8px">+ 브랜드 추가</button>'); a.onclick = async () => { const f = HS.el('<div class="form"><label class="f">브랜드<input class="in" id="n"></label><label class="f">화주사<input class="in" id="o"></label></div>'); await HS.modal('브랜드 추가', f, [['취소', null], ['추가', true, 'p']], { onOk: async () => { await HS.db.upsert('erp_brands', [{ name: f.querySelector('#n').value.trim(), owner: f.querySelector('#o').value.trim(), center_id: 'gobaek', b2b: true, sort: rows.length + 1 }]); await HS.loadRefs(); HS.route(); } }); }; c.appendChild(a); }
        body.appendChild(c); return;
      }
      if (tab === 'inbound') {
        const st = await HS.db.list('erp_settings', { eq: { key: 'inbound_prices' } });
        const list = (st[0] && st[0].value && st[0].value.rows) || HS.DEFAULT_PRICES.map(([name, unit, price, memo]) => ({ name, unit, price, memo }));
        const g = HS.grid({ keyLabel: '항목', editable: ed, rows: list.map((r, i) => ({ key: i, label: r.name, data: Object.assign({}, r) })), cols: [{ k: 'unit', l: '단위', t: 'text' }, { k: 'price', l: '금액(VAT 별도)', t: 'num' }, { k: 'memo', l: '비고', t: 'text' }] });
        const c = HS.el('<div class="card"><h3>입고대행 단가표</h3></div>'); c.appendChild(g.el);
        if (ed) c.appendChild(saveBtn(() => HS.db.upsert('erp_settings', [{ key: 'inbound_prices', value: { rows: list.map((r, i) => Object.assign({}, r, (g.changed().find((x) => x.key === i) || {}).data || {})) } }])));
        body.appendChild(c); return;
      }
      if (tab === 'sec') { await securityTab(body); return; }
      const conn = HSDB.loadConn();
      const c = HS.el('<div class="card"><h3>연결</h3><div class="tw"><table><tr><td class="mute">사용 방식</td><td>' + (HS.db.mode === 'supabase' ? '<span class="tag g">Supabase 운영</span>' : '<span class="tag y">로컬 모드</span>') + '</td></tr><tr><td class="mute">Project URL</td><td>' + esc(conn.url || '-') + '</td></tr><tr><td class="mute">안성센터 프로그램</td><td>같은 Supabase 프로젝트 · erp_ 테이블만 ERP가 사용</td></tr></table></div><div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="cs">연결 설정 바꾸기</button>' + (HS.db.mode === 'local' ? '<button class="btn r" id="rs">로컬 시연 자료 초기화</button>' : '') + '</div></div>');
      body.appendChild(c);
      c.querySelector('#cs').onclick = HS.connSettings;
      if (HS.can('users', 'view')) body.appendChild(await usageCard());
      const rs = c.querySelector('#rs'); if (rs) rs.onclick = async () => { if (await HS.confirm('이 브라우저의 로컬 자료를 모두 지울까요?')) { HS.db.resetLocal(); location.reload(); } };
    },
  });

  // ================= 저장 공간 사용량 (무료 500MB) =================
  const MB = (b) => (b < 1048576 ? Math.max(1, Math.round(b / 1024)) + 'KB' : (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + 'MB');
  const TBL_L = { erp_meet_book: '월간 회의 보고서 (엑셀)', erp_meet_note: '월간 회의 메모', erp_supply: '소모품 · 부자재 발주', erp_daily_records: '일일 마감보고', erp_worklog: '업무일지', erp_audit: '수정 이력', erp_tasks: '업무협조', erp_cnt_part: '재고 실사 자료', erp_kpi: 'KPI', erp_orders: '출고지시', erp_records: '반품 대장', erp_np_style: '신상품', erp_headcount: '인원확인', erp_settlement: '정산', erp_season: '시즌 계획', erp_season_act: '시즌 실적', erp_notifications: '알림', erp_task_events: '업무 진행 기록', erp_uploads: '업로드 기록', erp_roles: '등급 · 권한', erp_brands: '브랜드', erp_profiles: '사용자', erp_teams: '팀 · 인건비', erp_settings: '기준정보 설정', erp_centers: '센터', erp_worklog_day: '업무일지 (일별)', erp_locks: '마감 잠금', erp_task_prices: '공정 단가', erp_returns_box: '반품 박스', erp_kpi_day: 'KPI (일별)', erp_orders_day: '출고지시 (일별)', erp_np_snap: '신상품 주간 기록', erp_views: '저장된 보기', erp_requests: '개선 요청', erp_cnt: '재고 실사 목록', erp_ret_done: '반품 확정', erp_ret_pend: '매장 반품 (미처리)', erp_ret_bag: '행낭 · 타택배', erp_volume: '물동량', erp_meet_note: '월간 회의 메모', erp_supply: '소모품 · 부자재 발주', erp_supply_item: '발주 품목', erp_notice: '공지 사항', erp_notice_read: '공지 읽음', erp_as_daily: '안성 · 날짜별 요약', erp_as_ship: '안성 · 출고', erp_as_transfer: '안성 · 포승이관', erp_as_staff: '안성 · 인원', erp_as_req: '안성 · 받기 기록', erp_as_ret: '안성 · 반품검수 박스별', erp_as_sorter: '안성 · 소터 스타일별', erp_as_inv_daily: '안성 · 날짜별 수불', erp_as_inv_flow: '안성 · 스타일별 수불', erp_as_inv_stock: '안성 · 장소별 재고', erp_usage_log: '저장 공간 기록', erp_secret: '비밀 보관',
    // 이월팀 — 시즌반품정리현황 · 선지시출고현황 (sql/33_iwol.sql · 2026-11-24)
    erp_iw_ord: '이월 · 배분지시', erp_iw_shp: '이월 · 출고 실적', erp_iw_inv: '이월 · 정리 기준', erp_iw_cnt: '이월 · 정리 실적',
    erp_iw_set: '이월 · 일정 기준값', erp_iw_sst: '이월 · 고친 시작일', erp_iw_man: '이월 · 투입 인원', erp_iw_band: '이월 · 일정 띠' };
  HS.TBL_L = TBL_L; HS.MB = MB;
  async function usageCard() {
    const c = HS.el('<div class="card" style="margin-top:14px"><h3>저장 공간 사용량 <small>Supabase 무료 요금제 500MB · 70% 넘으면 관리자 알림</small><span class="sp"></span><a class="btn sm" href="#/storage">하루 사용 · 예상일 보기</a></h3><div class="ub"></div></div>');
    let u = null; try { u = await HS.db.rpc('erp_usage'); } catch (e) { /* SQL 미설치 */ }
    if (!u) { c.querySelector('.ub').innerHTML = '<div class="mute">사용량을 읽지 못했습니다 (설치 프로그램 2번을 다시 실행하면 표시됩니다)</div>'; return c; }
    const p = u.db_bytes / u.limit_bytes * 100; const col = p >= 85 ? 'var(--neg)' : p >= 70 ? 'var(--gold)' : 'var(--pos)';
    c.querySelector('.ub').innerHTML = '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><div class="bar" style="flex:1;min-width:200px;height:14px"><i style="width:' + Math.min(100, p).toFixed(1) + '%;background:' + col + '"></i></div><b style="font-size:18px;color:' + col + '">' + p.toFixed(1) + '%</b><span class="mute">' + MB(u.db_bytes) + ' / ' + MB(u.limit_bytes) + (u.local ? ' (로컬 모드 추정)' : '') + '</span></div>' +
      '<div class="tw" style="margin-top:10px"><table><thead><tr><th>자료</th><th class="n">용량</th><th class="n">비율</th></tr></thead><tbody>' + (u.tables || []).map((t) => '<tr><td>' + esc(TBL_L[t.name] || ('기타 (' + t.name.replace(/^erp_/, '') + ')')) + '</td><td class="n">' + MB(t.bytes) + '</td><td class="n">' + (t.bytes / u.db_bytes * 100).toFixed(1) + '%</td></tr>').join('') + '</tbody></table></div>' +
      '<div class="mute" style="font-size:11.5px;margin-top:6px;line-height:1.6">· 월 내려받기(5GB) 사용량은 Supabase 화면 › Usage 에서 확인합니다<br>· 70%가 넘으면: 3년차 자료 원드라이브 보관을 앞당기거나 Pro 요금제(월 $25 · 8GB)로 전환</div>';
    return c;
  }

  // ================= 보안 (방화벽 ①~⑤ 상태 · 관리자 IP · 2단계 인증) =================
  async function securityTab(body) {
    const sup = HS.db.mode === 'supabase';
    let me = null, sqlOk = true;
    try { me = await HS.db.rpc('erp_my_security'); } catch (e) { sqlOk = false; }
    const st = (await HS.db.list('erp_settings', { eq: { key: 'security' } }))[0];
    const conf = Object.assign({ admin_ips: [], access_done: false }, (st && st.value) || {});
    const roles = await HS.db.list('erp_roles', {});
    let mfa = null; try { mfa = await HS.db.mfaState(); } catch (e) { /* 무시 */ }
    const [hdr, acc] = await Promise.all([
      fetch(location.pathname, { method: 'HEAD', cache: 'no-store' }).then((r) => !!r.headers.get('content-security-policy')).catch(() => false),
      !sup ? false : fetch('/cdn-cgi/access/get-identity', { cache: 'no-store', credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((j) => !!(j && j.email)).catch(() => false),
    ]);
    const tag = (on, y, n) => '<span class="tag ' + (on ? 'g">' + y : 'y">' + n) + '</span>';
    const mfaRoles = roles.filter((r) => r.mfa).map((r) => r.name || r.id);
    const rows = [
      ['① 접속 문 (Cloudflare Access)', 'ERP 주소에 들어올 때 회사 메일로 받은 인증번호 확인', tag(acc || conf.access_done, acc ? '적용됨' : '적용(수동 확인)', '미적용'), '아래 [설정 안내] 참고 · Cloudflare 대시보드에서 설정'],
      ['② 로그인 자동 공격 차단 (Turnstile)', '로그인·가입 화면 사람 확인', tag(!!(window.HS_CONFIG && HS_CONFIG.turnstileSiteKey), '적용됨', '미적용'), 'config.js의 turnstileSiteKey + Supabase › Authentication › Attack Protection'],
      ['③ 관리자 2단계 인증', '휴대폰 인증 앱 6자리 번호', sqlOk ? tag(mfaRoles.length > 0, mfaRoles.join(', ') + ' 등급 필수', '미적용') : tag(false, '', 'SQL 05 미실행'), '아래 등급별 설정'],
      ['④ 보안 헤더', '다른 사이트 끼워넣기·스크립트 주입 차단', tag(hdr, '적용됨', sup ? '미확인' : '배포 후 적용'), '_headers 파일 (Cloudflare Pages 자동)'],
      ['⑤ 관리자 기능 회사 IP 제한', '사용자·등급·설정 변경, 마감 해제는 회사에서만', sqlOk ? tag(conf.admin_ips.length > 0, conf.admin_ips.length + '개 주소', '제한 없음') : tag(false, '', 'SQL 05 미실행'), '아래 목록'],
    ];
    const c1 = HS.el('<div class="card"><h3>보안 점검 <small>' + (sup ? '운영 연결' : '로컬 모드에서는 ①②③⑤가 동작하지 않습니다 (시연용)') + '</small></h3><div class="tw"><table><thead><tr><th>항목</th><th>막는 것</th><th>상태</th><th>설정 위치</th></tr></thead><tbody>' +
      rows.map((r) => '<tr><td><b>' + esc(r[0]) + '</b></td><td>' + esc(r[1]) + '</td><td>' + r[2] + '</td><td class="mute">' + esc(r[3]) + '</td></tr>').join('') + '</tbody></table></div>' +
      '<div class="mute" style="margin-top:8px;font-size:12px">내 접속 주소: <b>' + esc((me && me.ip) || '-') + '</b> · 로그인 단계: <b>' + esc(me ? (me.aal === 'aal2' ? '2단계 인증 완료' : '비밀번호만') : '-') + '</b>' + (me && !me.ip_ok ? ' · <span class="neg">회사 밖 주소라 관리자 기능 제한 중</span>' : '') + '</div></div>');
    body.appendChild(c1);
    if (!sqlOk && sup) { body.appendChild(HS.el('<div class="card"><div class="lock">설치 프로그램 2번(데이터 저장 장소) 단계를 다시 실행하거나 Supabase SQL Editor에서 <b>05_firewall.sql</b>을 실행하세요.</div></div>')); return; }

    // ⑤ 관리자 IP
    const canAdmin = HS.can('settings', 'edit');
    const c5 = HS.el('<div class="card"><h3>⑤ 관리자 기능 허용 주소 <small>한 줄에 하나 · 대역 가능 (예: 211.234.10.0/24) · 비워두면 제한 없음</small></h3>' +
      '<textarea class="in" id="ips" rows="4" style="width:100%;font-family:monospace" ' + (canAdmin ? '' : 'disabled') + '>' + esc(conf.admin_ips.join('\n')) + '</textarea>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' + (canAdmin ? '<button class="btn" id="addme">+ 지금 내 주소 추가</button><button class="btn p" id="saveips">저장</button>' : '') + '</div>' +
      '<div class="mute" style="font-size:11.5px;line-height:1.7;margin-top:8px">· 제한되는 기능: 사용자 승인·등급 변경, 기준정보 설정 변경, 마감 해제 (보기와 일반 업무 입력은 어디서나 가능)<br>· 지금 접속한 주소가 목록에 없으면 저장되지 않습니다 (스스로 잠기는 사고 방지)<br>· 회사 인터넷 주소가 바뀌어 잠겼을 때: Supabase › SQL Editor에서 <code>update erp_settings set value = jsonb_set(value, \'{admin_ips}\', \'[]\') where key = \'security\';</code></div></div>');
    body.appendChild(c5);
    if (canAdmin) {
      c5.querySelector('#addme').onclick = () => { if (!me || !me.ip) return HS.toast('접속 주소를 확인할 수 없습니다 (로컬 모드)'); const t = c5.querySelector('#ips'); if (t.value.split(/\s+/).indexOf(me.ip) < 0) t.value = (t.value.trim() ? t.value.trim() + '\n' : '') + me.ip; };
      c5.querySelector('#saveips').onclick = async () => {
        try {
          const list = c5.querySelector('#ips').value.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
          const bad = list.filter((x) => !/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^[0-9a-f]*:[0-9a-f:]*(\/\d{1,3})?$/i.test(x)); if (bad.length) throw new Error('주소 형식이 올바르지 않습니다: ' + bad.join(', '));
          if (list.length && me && me.ip && !list.some((x) => ipIn(me.ip, x))) throw new Error('지금 접속한 주소(' + me.ip + ')가 목록에 없습니다. 저장하면 관리자 기능이 잠깁니다');
          if (list.length && !(await HS.confirm('관리자 기능을 아래 주소에서만 쓸 수 있게 합니다.\n' + list.join('\n')))) return;
          await HS.db.upsert('erp_settings', [{ key: 'security', value: Object.assign({}, conf, { admin_ips: list }) }]);
          HS.toast('저장했습니다', 'ok'); HS.route();
        } catch (e) { HS.err(e); }
      };
    }

    // ③ 2단계 인증
    const canRole = HS.can('users', 'edit');
    const c3 = HS.el('<div class="card"><h3>③ 2단계 인증 <small>체크한 등급은 로그인할 때 휴대폰 인증 앱 번호가 필요합니다 (보기 외 모든 작업)</small></h3><div class="rl" style="display:flex;gap:14px;flex-wrap:wrap"></div>' +
      (canRole ? '<button class="btn p" id="saverole" style="margin-top:10px">저장</button>' : '') +
      '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line)"><b>내 인증 앱</b> · ' + (mfa && mfa.local ? '로컬 모드에서는 사용하지 않습니다' : mfa && mfa.factors.length ? '등록됨 (' + esc(mfa.factors[0].friendly_name || '') + ') <button class="btn" id="remfa" style="margin-left:8px">휴대폰 바꾸기 (다시 등록)</button>' : '등록 안 됨 <button class="btn" id="enmfa" style="margin-left:8px">지금 등록</button>') + '</div></div>');
    const rl = c3.querySelector('.rl');
    // 등급이 하나도 안 읽히면 로그인이 풀린 것 — 빈 칸만 보이면 왜 그런지 모르므로 적어 준다 (2026-11-19)
    if (!roles.length) rl.innerHTML = '<span class="neg">등급 목록을 불러오지 못했습니다 — 로그인이 풀렸을 수 있습니다. 새로고침(F5) 한 뒤 다시 로그인해 주세요.</span>';
    roles.filter((r) => r.id !== 'pending').forEach((r) => rl.appendChild(HS.el('<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-r="' + esc(r.id) + '"' + (r.mfa ? ' checked' : '') + (canRole ? '' : ' disabled') + '>' + esc(r.name || r.id) + '</label>')));
    body.appendChild(c3);
    if (canRole) c3.querySelector('#saverole').onclick = async () => {
      try {
        const ch = [...rl.querySelectorAll('input')].filter((i) => !!roles.find((r) => r.id === i.dataset.r).mfa !== i.checked);
        if (ch.some((i) => i.dataset.r === 'admin' && !i.checked) && !(await HS.confirm('관리자 등급의 2단계 인증을 끄면 비밀번호만으로 모든 설정을 바꿀 수 있습니다. 계속할까요?'))) return;
        for (const i of ch) await HS.db.update('erp_roles', { id: i.dataset.r }, { mfa: i.checked });
        HS.toast('저장했습니다', 'ok'); HS.route();
      } catch (e) { HS.err(e); }
    };
    const re = c3.querySelector('#remfa'); if (re) re.onclick = async () => { if (!(await HS.confirm('지금 인증 앱 등록을 지우고 새 휴대폰으로 다시 등록합니다. 계속할까요?'))) return; try { await HS.db.mfaRemove(mfa.factors[0].id); await HS.db.logout(); location.reload(); } catch (e) { HS.err(e); } };
    const en = c3.querySelector('#enmfa'); if (en) en.onclick = () => HS.mfaGate(true);

    // ① 안내
    body.appendChild(HS.el('<div class="card"><h3>① 접속 문 설정 안내 <small>Cloudflare Zero Trust · 50명까지 무료</small></h3><ol style="line-height:1.9;padding-left:20px;margin:0">' +
      '<li>Cloudflare 대시보드 › <b>Zero Trust</b> (처음이면 팀 이름 입력 · Free 요금제 선택)</li>' +
      '<li><b>Access › Applications › Add an application › Self-hosted</b></li>' +
      '<li>Application domain: ERP 주소 (권장: 회사 도메인 <code>erp.회사도메인</code> · Pages › Custom domains에서 연결)</li>' +
      '<li><b>Policy</b>: Action = Allow · Include = <b>Emails ending in</b> 회사 메일 도메인 + <b>Emails</b> 지정 명단(협력사 담당자 등)</li>' +
      '<li>Login methods: <b>One-time PIN</b> (메일로 6자리 번호) · Session duration 24시간 권장</li>' +
      '<li>저장 후 휴대폰(데이터)으로 ERP 주소 접속 → 메일 인증 화면이 나오면 완료 · 이 화면 ① 상태가 <b>적용됨</b>으로 바뀝니다</li></ol>' +
      '<div class="mute" style="font-size:11.5px;margin-top:6px">주의: <code>*.pages.dev</code> 기본 주소도 같은 방식으로 막아야 우회가 안 됩니다 (Pages › Settings › Access policy 켜기).</div></div>'));
  }
  function ipIn(ip, cidr) {
    if (ip.indexOf(':') >= 0 || cidr.indexOf(':') >= 0) return ip === cidr.split('/')[0];
    const n = (a) => a.split('.').reduce((s, x) => s * 256 + (+x), 0);
    const [b, m] = cidr.split('/'); const bits = m == null ? 32 : +m;
    const d = Math.pow(2, 32 - bits);
    return Math.floor(n(ip) / d) === Math.floor(n(b) / d);
  }

  // ================= 개선 요청 · Claude 연동 =================
  HS.view('requests', {
    title: '개선 요청 · Claude', perm: 'requests',
    async render(body, p, tools) {
      const nb = HS.el('<button class="btn p">+ 개선 요청</button>'); tools.appendChild(nb);
      const rows = await HS.db.list('erp_requests', { order: ['created_at', false] });
      const adm = HS.can('requests', 'edit');
      body.innerHTML = '';
      body.appendChild(HS.el('<div class="card"><h3>Claude 연동 방식</h3><div style="line-height:1.8">① 직원 누구나 화면 문제·개선 아이디어를 <b>개선 요청</b>으로 남깁니다.<br>② 관리자가 요청을 골라 <b>Claude에게 보내기</b>를 누르면 작업 지시문이 복사됩니다 → Claude 대화창(프로그램 폴더 연결)에 붙여넣기.<br>③ Claude가 고쳐서 <b>수정 파일(zip)</b>을 보내면 관리자 PC에서 <b>업데이트하기.bat</b> 실행 → 자동 배포되어 모든 직원 화면에 적용됩니다.<br>④ 반영이 끝나면 상태가 <span class="tag g">반영완료</span>로 바뀝니다.</div></div>'));
      const c = HS.el('<div class="card"><h3>요청 목록 <small>' + rows.length + '건</small><span class="sp"></span>' + (adm ? '<button class="btn sm gd" id="send">선택 요청 Claude에게 보내기</button>' : '') + '</h3><div class="tw"><table><tr>' + (adm ? '<th><input type="checkbox" id="ca"></th>' : '') + '<th>#</th><th>상태</th><th>중요도</th><th>화면</th><th>제목</th><th>요청자</th><th>요청일</th><th>답변</th></tr>' +
        (rows.length ? rows.map((r) => '<tr class="click" data-id="' + r.id + '">' + (adm ? '<td><input type="checkbox" data-c="' + r.id + '" ' + (r.status === '접수' ? 'checked' : '') + '></td>' : '') + '<td>' + r.id + '</td><td><span class="tag ' + (r.status === '반영완료' ? 'g' : r.status === '검토중' ? 'y' : r.status === '보류' ? 'r' : 'b') + '">' + esc(r.status) + '</span></td><td>' + esc(r.priority || '') + '</td><td>' + esc(r.page || '') + '</td><td class="wrap"><b>' + esc(r.title) + '</b></td><td>' + esc(r.created_name || HS.who(r.created_by)) + '</td><td>' + esc((r.created_at || '').slice(0, 10)) + '</td><td class="wrap mute">' + esc(r.reply || '') + '</td></tr>').join('') : '<tr><td colspan="9" class="empty">요청이 없습니다</td></tr>') + '</table></div></div>');
      body.appendChild(c);
      const pages = ['통합 대시보드', '관리자 업무일지', '일일 마감보고', '업무협조 TO-DO', '반품 관리', '입고대행 정산', '안성센터 연동', '엑셀 일괄 등록', '사용자·등급', '기준정보', '기타'];
      nb.onclick = async () => {
        const f = HS.el('<div class="form"><label class="f">화면<select class="in" id="q1">' + pages.map((x) => '<option>' + x + '</option>').join('') + '</select></label><label class="f">중요도<select class="in" id="q2"><option>보통</option><option>긴급</option><option>낮음</option></select></label><label class="f wide">제목<input class="in" id="q3" placeholder="예: 업무일지에 비고 칸을 업무별로 추가"></label><label class="f wide">내용 (어떤 상황에서, 무엇이, 어떻게 바뀌면 좋은지)<textarea class="in" id="q4" style="min-height:120px"></textarea></label></div>');
        await HS.modal('개선 요청', f, [['취소', null], ['요청 등록', true, 'p']], { onOk: async () => { const t = f.querySelector('#q3').value.trim(); if (!t) throw new Error('제목을 입력하세요'); await HS.db.insert('erp_requests', { page: f.querySelector('#q1').value, priority: f.querySelector('#q2').value, title: t, body: f.querySelector('#q4').value.trim(), created_by: HS.me.id, created_name: HS.me.name, status: '접수' }); HS.toast('요청을 등록했습니다', 'ok'); HS.route(); } });
      };
      c.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = async (e) => {
        if (e.target.matches('input')) return;
        const r = rows.find((x) => x.id === +tr.dataset.id);
        const f = HS.el('<div><div class="mute" style="margin-bottom:6px">' + esc(r.page || '') + ' · ' + esc(r.priority || '') + ' · ' + esc(r.created_name || '') + ' · ' + esc((r.created_at || '').slice(0, 16).replace('T', ' ')) + '</div><div style="white-space:pre-wrap;line-height:1.6;background:#F6F7FA;border-radius:8px;padding:10px">' + esc(r.body || '(내용 없음)') + '</div>' + (adm ? '<div class="form" style="margin-top:12px"><label class="f">상태<select class="in" id="st"><option>접수</option><option>검토중</option><option>반영완료</option><option>보류</option></select></label><label class="f wide">답변<textarea class="in" id="rp"></textarea></label></div>' : r.reply ? '<div style="margin-top:10px"><b>답변</b> ' + esc(r.reply) + '</div>' : '') + '</div>');
        if (adm) { f.querySelector('#st').value = r.status; f.querySelector('#rp').value = r.reply || ''; }
        await HS.modal('#' + r.id + ' ' + r.title, f, adm ? [['닫기', null], ['Claude 지시문 복사', 'copy'], ['저장', 'save', 'p']] : [['닫기', null]], { wide: true, onOk: async (a) => { if (a === 'copy') { await copyPrompt([r]); return false; } if (a === 'save') { await HS.db.update('erp_requests', { id: r.id }, { status: f.querySelector('#st').value, reply: f.querySelector('#rp').value.trim() || null }); HS.toast('저장했습니다', 'ok'); HS.route(); } } });
      }));
      const ca = c.querySelector('#ca'); if (ca) ca.onchange = () => c.querySelectorAll('[data-c]').forEach((x) => (x.checked = ca.checked));
      const send = c.querySelector('#send');
      if (send) send.onclick = async () => { const ids = [...c.querySelectorAll('[data-c]:checked')].map((x) => +x.dataset.c); const sel = rows.filter((r) => ids.indexOf(r.id) >= 0); if (!sel.length) return HS.toast('요청을 선택하세요'); await copyPrompt(sel); for (const r of sel.filter((x) => x.status === '접수')) await HS.db.update('erp_requests', { id: r.id }, { status: '검토중' }).catch(() => {}); HS.route(); };
    },
  });
  async function copyPrompt(list) {
    const txt = '[혜성물류 회의자료 개선 요청]\n프로그램: 혜성물류 회의자료 (Cloudflare Pages · DB: Supabase erp_ 테이블 · 업데이트하기.bat 로 적용)\n아래 요청을 코드에 반영하고 수정 파일(zip)로 보내 주세요. 반영 후 요청 번호별로 무엇을 바꿨는지 알려 주세요.\n\n' +
      list.map((r) => '■ #' + r.id + ' [' + (r.priority || '보통') + '] ' + r.title + '\n- 화면: ' + (r.page || '-') + '\n- 요청자: ' + (r.created_name || '') + ' (' + (r.created_at || '').slice(0, 10) + ')\n- 내용: ' + (r.body || '-')).join('\n\n') +
      '\n\n(요청 시각 ' + new Date().toLocaleString('ko-KR') + ' · 관리자 ' + HS.me.name + ')';
    try { await navigator.clipboard.writeText(txt); HS.toast('Claude 지시문을 복사했습니다. Claude 프로젝트 대화창에 붙여넣으세요', 'ok'); }
    catch (e) { await HS.modal('Claude 지시문 (복사해서 붙여넣기)', '<textarea class="in" style="min-height:300px">' + esc(txt) + '</textarea>'); }
  }
})();
