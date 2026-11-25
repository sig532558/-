/* 혜성물류 운영 ERP — 엑셀 자동 인식 엔진
 * 브라우저(window.XLSX)와 Node(require('xlsx')) 양쪽에서 동작
 * 결과: [{kind, label, sheet, table, rows, warnings}]
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('xlsx'));
  // 2026-11-12: 엑셀 라이브러리를 뒤에서 받으므로 여기서 값을 붙잡으면 안 됨 — 쓸 때마다 window.XLSX 를 봄
  else root.HSParsers = factory({ get utils() { return root.XLSX.utils; }, read: function () { return root.XLSX.read.apply(root.XLSX, arguments); }, write: function () { return root.XLSX.write.apply(root.XLSX, arguments); }, writeFile: function () { return root.XLSX.writeFile.apply(root.XLSX, arguments); } });
})(typeof self !== 'undefined' ? self : this, function (XLSX) {
  'use strict';

  // ---------- 공통 유틸 ----------
  const norm = (v) => (v == null ? '' : String(v).replace(/[\s　]+/g, '').replace(/[()\[\]]/g, '').trim());
  const txt = (v) => (v == null ? '' : String(v).replace(/　/g, ' ').trim());
  const num = (v) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v).replace(/[,\s원]/g, '').replace(/^▲/, '-');
    if (s === '' || s === '-' || /^#/.test(s)) return null;
    const n = Number(s);
    if (isFinite(n)) return n;
    const m = s.match(/^-?\d+(\.\d+)?/); // 숫자에 단위가 붙은 값 (예: '220박스') 은 숫자만 씀
    return m ? +m[0] : null;
  };
  const pad = (n) => String(n).padStart(2, '0');
  // 엑셀 일련번호/문자열/yyyymmdd → 'YYYY-MM-DD'
  function toDate(v, refYear) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    if (typeof v === 'number') {
      if (v > 19000101 && v < 21001231) { const s = String(Math.round(v)); return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); }
      if (v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
      return null;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})$/);
    if (m) return '20' + m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    m = s.match(/^(\d{1,2})[/.월]\s*(\d{1,2})일?$/);
    if (m && refYear) return refYear + '-' + pad(m[1]) + '-' + pad(m[2]);
    return null;
  }
  function sheetDate(name) { // '261019' → 2026-10-19
    const m = String(name).trim().match(/^(\d{2})(\d{2})(\d{2})$/);
    if (!m) return null;
    const mm = +m[2], dd = +m[3];
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return '20' + m[1] + '-' + m[2] + '-' + m[3];
  }

  // 희소 시트를 절대 좌표 격자로 변환 (100만 행 시트도 실제 값만 읽음)
  function grid(ws, maxRows) {
    const g = [];
    maxRows = maxRows || 200000;
    for (const k in ws) {
      if (k[0] === '!') continue;
      const a = XLSX.utils.decode_cell(k);
      if (a.r >= maxRows || a.c > 400) continue;
      const cell = ws[k];
      let v = cell.v;
      if (cell.t === 'e') v = null;
      if (v === undefined || v === null || v === '') continue;
      (g[a.r] || (g[a.r] = []))[a.c] = v;
    }
    return g;
  }
  const at = (g, r, c) => (g[r] ? g[r][c] : undefined);
  const lastRow = (g) => g.length - 1;
  const col = (L) => XLSX.utils.decode_col(L);

  // 헤더 행 찾기: 필수 토큰이 모두 들어있는 첫 행
  function findHeader(g, tokens, maxScan) {
    maxScan = Math.min(maxScan || 40, g.length);
    const T = tokens.map(norm);
    for (let r = 0; r < maxScan; r++) {
      const row = g[r]; if (!row) continue;
      const cells = row.map(norm);
      if (T.every((t) => cells.some((c) => c && c.indexOf(t) === 0))) {
        const map = {};
        cells.forEach((c, i) => { if (c && !(c in map)) map[c] = i; });
        return { r, map, cells };
      }
    }
    return null;
  }
  function idx(h, name) { // 헤더 이름(접두 일치)으로 열 번호
    const n = norm(name);
    if (n in h.map) return h.map[n];
    for (let i = 0; i < h.cells.length; i++) if (h.cells[i] && h.cells[i].indexOf(n) === 0) return i;
    return -1;
  }
  function rowObject(g, r, h) { // 헤더 기준 원본 보존용 jsonb
    const o = {}; const row = g[r] || [];
    h.cells.forEach((c, i) => { if (c && row[i] != null && row[i] !== '') o[c] = row[i]; });
    return o;
  }

  const BRAND_ALIAS = { '파리': '파리게이츠', '바니': '마스터바니', '세인트': '세인트앤드류스', '세인트앤드류': '세인트앤드류스', '펜텀': '팬텀', '하이': '하이드로겐', '앤드': '앤드원더', '로라': '로라애슐리', 'PING': '핑', 'FANTOM': '팬텀', 'PEARLYGATES': '파리게이츠', 'MASTERBUNNY': '마스터바니', 'STANDREWS': '세인트앤드류스', 'LYNX': '링스', 'HYDROGEN': '하이드로겐', 'MAMMUT': '마무트', 'ANDWANDER': '앤드원더' };
  const brand = (b) => { const t = txt(b); if (!t) return t; const k = t.replace(/^\d+\s*\(|\)$/g, '').replace(/\s/g, '').toUpperCase(); return BRAND_ALIAS[t.replace(/\s/g, '')] || BRAND_ALIAS[k] || t; };
  const TEAM_FROM_SHEET = (name) => {
    const s = norm(name);
    if (s.indexOf('안성') >= 0) return '안성센터';
    if (s.indexOf('별도인원') >= 0) return '별도인원';
    const m = s.match(/^(.+?)업무일지$/);
    return m ? m[1] : null;
  };
  const centerOf = (team) => (team === '안성센터' ? 'anseong' : 'gobaek');

  // ---------- 1) 관리자 업무일지 (가로 157열 구조) ----------
  function parseWorklog(ws, sheetName) {
    const g = grid(ws, 5000);
    const team = TEAM_FROM_SHEET(sheetName);
    const rows = [], days = [], heads = [], warnings = [], order = new Map();
    // 평균인건비 · 연장근무시급도 해에 따라 칸이 다름 (2025년 F·G열 · 2026년 I·J열) — 글자로 찾는다 (2026-11-12)
    const labelNum = (lab) => { for (let r = 0; r < 5; r++) for (let c = 0; c < 16; c++) { if (norm(at(g, r, c)) !== lab) continue; for (let k = c + 1; k < c + 4; k++) { const v = num(at(g, r, k)); if (v != null) return v; } } return null; };
    const labor = labelNum('평균인건비') != null ? labelNum('평균인건비') : num(at(g, 1, col('J')));
    const otRate = labelNum('연장근무시급') != null ? labelNum('연장근무시급') : num(at(g, 2, col('J')));
    for (let r = 0; r <= lastRow(g); r++) {
      if (norm(at(g, r, 1)) !== '업무구분' || norm(at(g, r, 2)) !== '상세업무') continue;
      const hr = g[r];
      // 공정단가 칸은 해에 따라 자리가 다름 — 머리글 글자로 찾는다 (2026-11-12)
      //   2025년 모양: 업무구분(1) 상세업무(2) [공정단가(3)] 매출(5) 지출(6) 손익계산(7) → 블록은 8칸부터
      //   2026년 모양: 업무구분(1) 상세업무(2) 작업수량(3) 인원(4) 월손익(5) [공정단가(6)] 매출(8) … → 블록은 11칸부터
      //   자리로 고정해 읽으면 2025년 파일에서 '지출(금액)'을 단가로 읽어 매출이 수조 원이 됨
      let priceCol = -1;
      for (let c = 3; c < Math.min(hr.length, 12); c++) if (norm(hr[c]) === '공정단가') { priceCol = c; break; }
      if (priceCol < 0) { priceCol = 6; warnings.push('공정단가 칸을 찾지 못해 G열로 봅니다 (' + (r + 1) + '행)'); }
      // 작업수량 블록(날짜 있는 것만)
      const blocks = []; let wl = null;
      for (let c = 3; c < hr.length; c++) {
        // 주차 이름 ('1월 1주차 출근인원' · '9월 1주차 합계') — 그 오른쪽 날짜 칸들이 이 주차 (엑셀 손익계산표와 같은 주 · 월 구분)
        for (const rr of [r - 3, r - 2]) { const m = txt(at(g, rr, c)).match(/(\d{1,2})\s*월\s*(\d)\s*주차/); if (m) { wl = { m: +m[1], k: +m[2] }; break; } }
        if (norm(hr[c]) === '작업수량' && norm(hr[c + 1]) === 'T.O') {
          const d = toDate(at(g, r - 2, c + 2));
          if (d) { let wk = null; if (wl) { let y = +d.slice(0, 4); const dm = +d.slice(5, 7); if (wl.m === 1 && dm === 12) y++; else if (wl.m === 12 && dm === 1) y--; wk = y + '-' + String(wl.m).padStart(2, '0') + '-' + wl.k; }
            blocks.push({ c, d, wk, otH: num(at(g, r - 2, c + 1)), otP: num(at(g, r - 1, c + 1)) }); }
        }
      }
      let grp = ''; const seenT = {};
      for (let rr = r + 1; rr <= r + 40 && rr <= lastRow(g); rr++) {
        let task = txt(at(g, rr, 2));
        if (!task) continue;
        if (norm(task) === '손익합계') break;
        const gv = txt(at(g, rr, 1));
        if (gv && !/^\d+$/.test(gv)) grp = gv.replace(/\s+/g, '');
        // 같은 구분 안에 같은 업무 이름이 두 줄 (예: 정리 › 기타 2줄) → 두 번째부터 '기타 (2)' (예전엔 앞 줄이 덮어써져 빠짐)
        const tk = grp + '|' + task; seenT[tk] = (seenT[tk] || 0) + 1; if (seenT[tk] > 1) task = task + ' (' + seenT[tk] + ')';
        const price = num(at(g, rr, priceCol)) || 0;
        if (!order.has(grp + '|' + task)) order.set(grp + '|' + task, { team, grp, task, unit_price: price, sort: order.size + 1 });
        for (const b of blocks) {
          const qty = num(at(g, rr, b.c)) || 0;
          const to = num(at(g, rr, b.c + 1)) || 0;
          if (!qty && !to) continue;
          rows.push(Object.assign({ work_date: b.d, team, grp, task, unit_price: price, qty, to_count: to }, b.wk ? { extra: { wk: b.wk } } : {}));
        }
      }
      for (const b of blocks) {
        if (b.otH && b.otP) days.push({ work_date: b.d, team, ot_hours: b.otH, ot_people: b.otP }); // 야근 인원 있는 칸만 (같은 날짜가 다음 달 칸에 0명으로 또 있으면 덮어쓰던 오류 수정)
        // 인원 확인 블록: 날짜열 = 부서열, 다음 열 현장/사무실 (헤더행 위 2~12행 사이)
        for (let rr = r - 12; rr < r - 2; rr++) {
          if (norm(at(g, rr, b.c + 2)) === '부서') {
            for (let k = rr + 1; k < r - 2; k++) {
              const dept = txt(at(g, k, b.c + 2));
              if (!dept || dept === '합계인원') continue;
              const f = num(at(g, k, b.c + 3)), o = num(at(g, k, b.c + 4));
              if (f || o) heads.push({ work_date: b.d, team: dept, field_count: f || 0, office_count: o || 0 });
            }
            break;
          }
        }
      }
    }
    // 같은 날짜·업무 중복은 마지막 값 사용
    const uniq = new Map(); const dup = new Set();
    const same = new Set();
    rows.forEach((x) => { const k = x.work_date + '|' + x.team + '|' + x.grp + '|' + x.task; const o = uniq.get(k); if (o) { if (o.qty !== x.qty || o.to_count !== x.to_count) dup.add(x.work_date); else same.add(x.work_date + ' (' + [o, x].map((z) => (z.extra && z.extra.wk ? +z.extra.wk.slice(5, 7) + '월' + z.extra.wk.slice(8) + '주차' : '')).join(' · ') + ')'); } uniq.set(k, x); });
    if (dup.size) warnings.push('같은 날짜가 두 주차 칸에 다른 값으로 들어 있음 (뒤 칸 값 사용): ' + [...dup].sort().slice(0, 6).join(', ') + (dup.size > 6 ? ' 외 ' + (dup.size - 6) + '일' : ''));
    if (same.size) warnings.push('같은 날짜가 두 주차 칸에 똑같이 입력됨 → 엑셀 손익계산표는 두 번 더해짐 · ERP는 한 번만: ' + [...same].sort().slice(0, 4).join(', ') + (same.size > 4 ? ' 외 ' + (same.size - 4) + '건' : ''));
    const dmap = new Map(); days.forEach((x) => dmap.set(x.work_date, x)); days.length = 0; dmap.forEach((x) => days.push(x));
    if (!uniq.size) warnings.push('업무 데이터가 없습니다');
    const lastYearInFile = rows.reduce((a, x) => Math.max(a, +String(x.work_date).slice(0, 4) || 0), 0);
    // 연도별 인건비 (sql/26_team_year_cost.sql) — 파일에 든 해마다 그 해 인건비로 넣음
    //  · 파일의 '연간' 머리글 값은 그 파일이 다루는 해의 값이므로, 줄이 가장 많은 해에만 매김
    const yearCount = {}; rows.forEach((x) => { const y = +String(x.work_date).slice(0, 4); if (y) yearCount[y] = (yearCount[y] || 0) + 1; });
    const mainYear = +Object.keys(yearCount).sort((a, b) => yearCount[b] - yearCount[a])[0] || 0;
    const yearCost = team && labor && mainYear ? [{ team, year: mainYear, labor_cost: labor, ot_rate: otRate || 0, memo: sheetName }] : [];
    if (yearCost.length) warnings.push(mainYear + '년 인건비 ' + Math.round(labor).toLocaleString() + '원 · 연장 ' + Math.round(otRate || 0).toLocaleString() + '원으로 저장합니다 (그 해 지출 계산에 씁니다)');
    if (team && labor && lastYearInFile && lastYearInFile < new Date().getFullYear()) warnings.push('지난 해 파일이라 기준정보의 팀 인건비는 그대로 둡니다 (올해 지출이 틀어지지 않게)');
    return {
      sets: [
        { table: 'worklog', conflict: 'work_date,team,grp,task', rows: [...uniq.values()] },
        { table: 'worklog_day', conflict: 'work_date,team', rows: days },
        { table: 'headcount', conflict: 'work_date,team', rows: heads },
        // 팀 인건비는 '올해 파일'일 때만 바꿈 — 지난 해 파일(예: 2025년 153,300원)로 덮으면 올해 지출이 틀어짐 (2026-11-12)
        // 팀 인건비(기준정보)는 '올해 파일'일 때만 바꿈 — 지난 해 파일로 덮으면 올해 지출이 틀어짐 (2026-11-12)
        { table: 'teams', conflict: 'name', rows: team && labor && lastYearInFile >= new Date().getFullYear() ? [{ name: team, center_id: centerOf(team), labor_cost: labor, ot_rate: otRate || 0 }] : [] },
        // 그 해 인건비는 해마다 따로 보관 → 지난 해 지출도 그 해 단가로 계산됨
        { table: 'team_cost', conflict: 'team,year', rows: yearCost },
      ],
      prices: [...order.values()],
      team, warnings,
    };
  }

  // 별도인원 업무일지 (목록형)
  function parseSupport(ws) {
    const g = grid(ws, 20000), rows = [];
    for (let r = 4; r <= lastRow(g); r++) {
      const d = toDate(at(g, r, 0));
      if (!d) continue;
      const detail = txt(at(g, r, 10)).replace(/^\(예시\)$/, '');
      const kind = txt(at(g, r, 9)) || (detail ? '기타' : ''); if (!kind) continue;
      const to = num(at(g, r, 11)) || 0;
      if (!to) continue;
      const rev = num(at(g, r, 12)) || 0;
      rows.push({
        work_date: d, team: '별도인원', grp: kind, task: detail || kind,
        unit_price: rev ? Math.round(rev / to) : 0, qty: rev ? to : 0, to_count: to,
        cost_override: (num(at(g, r, 13)) != null && Math.round(num(at(g, r, 13))) !== Math.round(to * 160000)) ? num(at(g, r, 13)) : null,
        note: txt(at(g, r, 8)) ? '업무진행: ' + txt(at(g, r, 8)) : null,
        extra: Object.assign({ 정상: num(at(g, r, 1)), 이월: num(at(g, r, 2)), 입고: num(at(g, r, 3)), B2C: num(at(g, r, 4)), 로라: num(at(g, r, 5)), 진행팀: txt(at(g, r, 8)), 상태: txt(at(g, r, 17)) }, (() => { const m = txt(at(g, r, 16)).match(/(\d{1,2})\s*월\s*(\d)\s*주차/); if (!m) return {}; let y = +d.slice(0, 4); const dm = +d.slice(5, 7); if (+m[1] === 1 && dm === 12) y++; else if (+m[1] === 12 && dm === 1) y--; return { wk: y + '-' + String(+m[1]).padStart(2, '0') + '-' + m[2] }; })()), // 주차 = 엑셀 Q열
      });
    }
    const m = new Map(); rows.forEach((x, i) => m.set(x.work_date + '|' + x.grp + '|' + x.task + '|' + (x.extra.진행팀 || '') + '|' + i, x));
    // 같은 날 같은 업무 여러 건은 합산
    const agg = new Map();
    rows.forEach((x) => {
      const k = x.work_date + '|' + x.grp + '|' + x.task;
      const p = agg.get(k);
      if (p) { p.qty += x.qty; p.to_count += x.to_count; if (x.cost_override != null || p.cost_override != null) p.cost_override = (p.cost_override != null ? p.cost_override : (p.to_count - x.to_count) * 160000) + (x.cost_override != null ? x.cost_override : x.to_count * 160000); } else agg.set(k, { ...x });
    });
    return { sets: [{ table: 'worklog', conflict: 'work_date,team,grp,task', rows: [...agg.values()] }], warnings: [] };
  }

  // ---------- 2) 일일 마감보고 (날짜별 시트) ----------
  const B2B_COLS = [
    ['in_plan_st', 'C'], ['in_real_st', 'D'], ['in_qty', 'E'], ['in_return_qty', 'F'], ['truck_1t', 'G'], ['truck_25t', 'H'], ['ft20', 'I'], ['ft40', 'J'],
    ['pre_in_st', 'K'], ['out_plan_st', 'L'], ['out_real_st', 'M'], ['wait_st', 'N'], ['first_qty', 'O'], ['order_qty', 'P'], ['full_qty', 'Q'], ['out_qty', 'R'],
    ['short_qty', 'S'], ['online_order', 'T'], ['online_out', 'U'], ['online_short', 'V'], ['open_export', 'W'], ['hold_change', 'X'], ['total_qty', 'Y'], ['total_short', 'Z'],
    ['ord_22', 'AE'], ['ord_9', 'AF'], ['ord_etc', 'AG'], ['ord_1330', 'AH'], ['ord_online22', 'AI'], ['ord_day', 'AJ'],
  ];
  const B2C_COLS = [['b2b_in', 'C'], ['rt_in', 'D'], ['order_qty', 'E'], ['order_cnt', 'F'], ['cust_out', 'G'], ['out_cnt', 'H'], ['not_out', 'I'], ['rt_out', 'J'], ['b2b_return', 'K'], ['material', 'L'], ['gift', 'M'], ['cust_return', 'N'], ['pick', 'O'], ['arrange', 'P'], ['pack', 'Q'], ['defect', 'R'], ['lotte_out', 'S'], ['haeng_out', 'T'], ['out_total', 'U'], ['lotte_return', 'V'], ['etc_return', 'W'], ['haeng_return', 'X'], ['return_total', 'Y']];
  function pick(g, r, cols) { const o = {}; cols.forEach(([k, L]) => { const v = num(at(g, r, typeof L === 'number' ? L : col(L))); if (v != null) o[k] = v; }); return o; }
  // 2025년 판 일일 마감보고는 B2B 머리글에 '입고반품 수량'(F) 칸이 없어 그 뒤 칸이 한 칸씩 당겨져 있다.
  // 머리글을 보고 밀린 만큼 칸 번호를 옮겨 준다 (2026-11-19 · 행님 지시 "25년 파일도 인식되게")
  const ORD_K = ['ord_22', 'ord_9', 'ord_etc', 'ord_1330', 'ord_online22', 'ord_day'];
  const b2bCols = (g, hr) => {
    const sh = norm(at(g, hr, col('F'))).indexOf('입고반품') === 0 ? 0 : -1;
    const from = col('F');
    // 2025년 판에는 '입고반품 수량' 칸 자체가 없다
    const out = B2B_COLS.filter(([k]) => ORD_K.indexOf(k) < 0 && !(sh && k === 'in_return_qty')).map(([k, L]) => { const i = col(L); return [k, i >= from ? i + sh : i]; });
    // 지시 분류(9시주문분 · 기타보충분 …)는 블록째로 자리가 달라 머리글로 찾는다
    let n9 = -1; for (let i = col('Y'); i <= col('BA'); i++) { if (norm(at(g, hr, i)).indexOf('9시주문분') === 0) { n9 = i; break; } }
    if (n9 > 0) ORD_K.forEach((k, j) => out.push([k, n9 - 1 + j]));
    return out;
  };

  function parseDaily(ws, sheetName) {
    const g = grid(ws, 400), out = [], warnings = [];
    const d = toDate(at(g, 2, 1)) || sheetDate(sheetName);
    if (!d) return { sets: [], warnings: ['날짜를 찾을 수 없음'] };
    
    const BRANDED = { b2b: 1, return: 1, carryover: 1, material: 1, parcel: 1, wms: 1 };
    const add = (section, key, data) => { if (BRANDED[section]) key = brand(key); if (section === 'offline') { data.brand = brand(data.brand); key = data.owner + '|' + data.brand; } if (section === 'short') data.brand = brand(data.brand); if (key && Object.keys(data).length) out.push({ rec_date: d, section, rec_key: key, data }); };
    for (let r = 0; r <= Math.min(lastRow(g), 200); r++) {
      const b = norm(at(g, r, 1)), c = norm(at(g, r, 2));
      // B2B 입출고
      if (b === '브랜드' && c === '입고예정ST') {
        const BC = b2bCols(g, r);
        for (let rr = r + 1; rr < r + 40; rr++) {
          const br = txt(at(g, rr, 1)); if (!br) continue;
          if (norm(br) === '총합계') break;
          add('b2b', br, pick(g, rr, BC));
        }
      }
      // 반품 / 이월출고 / 부자재 / 택배박스
      if (b === '브랜드' && c.indexOf('온라인전일') === 0) {
        const basis = toDate(at(g, r - 1, 1));
        for (let rr = r + 1; rr < r + 40; rr++) {
          const br = txt(at(g, rr, 1)); if (!br) continue;
          if (norm(br) === '총합계') break;
          add('return', br, Object.assign({ basis_date: basis }, pick(g, rr, [['online_return', 'C'], ['store_return', 'D'], ['return_total', 'E'], ['unconfirmed', 'F']])));
          const season = txt(at(g, rr, 7));
          const co = pick(g, rr, [['boxes', 'I'], ['stores', 'J'], ['qty', 'K']]);
          if (Object.keys(co).length) add('carryover', br, Object.assign({ season }, co));
          add('material', br, pick(g, rr, [['in_mat', 'M'], ['in_gift', 'N'], ['out_mat', 'O'], ['out_gift', 'P'], ['ret_mat', 'Q'], ['ret_gift', 'R']]));
          add('parcel', br, pick(g, rr, [['out_lotte', 'T'], ['out_top', 'U'], ['out_seoul', 'V'], ['out_total', 'W'], ['ret_lotte', 'X'], ['ret_top', 'Y'], ['ret_etc', 'Z'], ['ret_seoul', 'AA'], ['ret_total', 'AB']]));
        }
        // 과·미출 상세 — 2026년 판은 AD 구분 · AE 브랜드부터, 2025년 판은 그 두 칸이 없어 매장코드부터 시작한다.
        // 자리를 '매장코드' 머리글로 찾아 두 판을 모두 읽는다 (2026-11-19)
        let sc = -1; for (let i = col('Y'); i <= col('BA'); i++) { if (norm(at(g, r, i)) === '매장코드') { sc = i; break; } }
        if (sc > 0) {
          const kI = norm(at(g, r, sc - 2)).indexOf('구분') === 0 ? sc - 2 : null;
          const bI = norm(at(g, r, sc - 1)).indexOf('브랜드') === 0 ? sc - 1 : null;
          for (let rr = r + 1; rr < r + 80; rr++) {
            const q = num(at(g, rr, sc + 5)); if (q == null) continue;
            const br = bI == null ? '' : txt(at(g, rr, bI));
            if (bI != null && !br) continue;
            if (bI == null && !txt(at(g, rr, sc)) && !txt(at(g, rr, sc + 1))) continue; // 브랜드 칸이 없는 판은 매장으로 줄을 가려냄
            add('short', [br, txt(at(g, rr, sc)), txt(at(g, rr, sc + 2)), txt(at(g, rr, sc + 3)), txt(at(g, rr, sc + 4))].join('|'),
              { kind: kI == null ? '' : txt(at(g, rr, kI)), brand: br, store_code: txt(at(g, rr, sc)), store: txt(at(g, rr, sc + 1)), style: txt(at(g, rr, sc + 2)), color: txt(at(g, rr, sc + 3)), size: txt(at(g, rr, sc + 4)), qty: q, reason: txt(at(g, rr, sc + 6)) });
          }
        }
      }
      // B2C 화주사
      if (b === 'B2C' && c === 'B2B입고') {
        for (let rr = r + 1; rr < r + 12; rr++) {
          const cl = txt(at(g, rr, 1)); if (!cl) continue;
          if (norm(cl) === '합계') break;
          add('b2c', cl, pick(g, rr, B2C_COLS));
        }
      }
      // WMS 대조
      if (b === '브랜드' && c.indexOf('전산총') === 0) {
        for (let rr = r + 1; rr < r + 40; rr++) {
          const br = txt(at(g, rr, 1)); if (!br) continue;
          if (norm(br) === '총합계') break;
          const o = pick(g, rr, [['sys_in', 'C'], ['sys_out', 'D'], ['sys_return', 'E'], ['wms_in', 'I'], ['wms_out', 'J'], ['wms_return', 'K']]);
          o.match = [5, 6, 7].every((ci) => at(g, rr, ci) === true || norm(at(g, rr, ci)) === 'TRUE');
          o.done = txt(at(g, rr, 11));
          add('wms', br, o);
        }
      }
    }
    // 출고 미출고 누계(B2C 요청시간별) Q~AA
    for (let r = 0; r <= Math.min(lastRow(g), 120); r++) {
      const cl = txt(at(g, r, col('R'))); const tm = at(g, r, col('S'));
      if (cl && isNaN(Number(cl)) && typeof tm === 'number' && tm > 0 && tm < 1 && num(at(g, r, col('T'))) != null) {
        const h = Math.round(tm * 24 * 60);
        add('b2c_time', cl + '|' + pad(Math.floor(h / 60)) + ':' + pad(h % 60), { client: cl, time: pad(Math.floor(h / 60)) + ':' + pad(h % 60), req_qty: num(at(g, r, col('T'))), req_cnt: num(at(g, r, col('U'))), out_qty: num(at(g, r, col('V'))), out_cnt: num(at(g, r, col('W'))), reason: txt(at(g, r, col('Z'))) });
      }
    }
    // 오프라인 4개사 완불 (B=구분 C=브랜드 D=지시수량) — 표가 여러 개 연속됨
    let owner = '';
    const isHead = (r) => norm(at(g, r, 1)) === '구분' && norm(at(g, r, 2)) === '브랜드' && norm(at(g, r, 3)) === '지시수량';
    for (let r = 0; r <= lastRow(g); r++) {
      if (!isHead(r)) continue;
      for (let rr = r + 1; rr <= lastRow(g); rr++) {
        if (isHead(rr)) { r = rr - 1; break; }
        const o = txt(at(g, rr, 1)); const br = txt(at(g, rr, 2));
        if (/4개사/.test(norm(o))) { r = rr; break; }
        if (/총합계/.test(norm(o))) continue;
        if (o) owner = o;
        if (!br) continue;
        add('offline', owner + '|' + br, { owner, brand: br, order_qty: num(at(g, rr, 3)), total_qty: num(at(g, rr, 4)), short: num(at(g, rr, 5)), rate: num(at(g, rr, 6)), reason: txt(at(g, rr, 7)) });
        r = rr;
      }
    }
    if (!out.length) warnings.push('인식된 표가 없습니다');
    return { sets: [{ table: 'daily_records', conflict: 'rec_date,section,rec_key', rows: out }], date: d, warnings };
  }

  // ---------- 3) 목록형 시트 공통 엔진 ----------
  // spec: {header:[필수헤더], map:{필드:헤더명}, date:[날짜필드], skip(row)}
  function parseList(ws, spec, maxRows) {
    const g = grid(ws, maxRows || 200000);
    const h = findHeader(g, spec.header, spec.scan || 30);
    if (!h) return null;
    const ci = {}; for (const f in spec.map) ci[f] = idx(h, spec.map[f]);
    const refYear = spec.year || null;
    const rows = [];
    for (let r = h.r + 1; r <= lastRow(g); r++) {
      if (!g[r]) continue;
      const o = {};
      for (const f in ci) {
        if (ci[f] < 0) continue;
        let v = at(g, r, ci[f]);
        if (spec.date && spec.date.indexOf(f) >= 0) v = toDate(v, refYear);
        else if (spec.nums && spec.nums.indexOf(f) >= 0) v = num(v);
        else v = v == null ? null : txt(v);
        if (v !== null && v !== '') o[f] = v;
      }
      if (spec.need && !spec.need.every((f) => o[f] != null && o[f] !== '')) continue;
      o.raw = rowObject(g, r, h);
      o._row = r + 1;
      rows.push(o);
    }
    return { rows, headerRow: h.r + 1 };
  }

  // 업무협조/할일 상태 정규화
  function taskStatus(s) {
    s = norm(s);
    if (!s) return '요청';
    if (/완료|출고완료|전산완료/.test(s)) return '완료';
    if (/진행|작업중/.test(s)) return '진행중';
    if (/접수|확인/.test(s)) return '접수';
    if (/보류|홀딩|대기/.test(s)) return '보류';
    return '요청';
  }

  const LIST_SPECS = [
    {
      kind: 'coop', label: '업무협조 지시', match: (n) => /^\d{2}년\s*\d{1,2}월$/.test(n.trim()) || /^업무협조/.test(n.trim()),
      spec: { header: ['업무구분', '브랜드', '작업지시내용'], map: { sub: '구분', type: '업무구분', brand: '브랜드', requester: '작성자', detail: '작업지시내용', attach: '첨부파일', ship_date: '출고일자', checker: '현장확인', result: '결과', note: '비고', team: '할당팀', due: '완료기한', title: '업무제목' }, date: ['ship_date', 'due'], need: ['detail'] },
      to: (o) => ({ task_type: o.type || '기타', brand: o.brand, title: o.title || firstLine(o.detail), detail: o.detail, requester: o.requester, assigned_team: teamName(o.team) || null, due_date: o.due || o.ship_date, ship_date: o.ship_date, assignee_name: o.checker, status: taskStatus(o.result), progress: taskStatus(o.result) === '완료' ? 100 : 0, result: o.result, note: [o.note, o.attach].filter(Boolean).join(' / ') || null }),
    },
    {
      kind: 'dispatch', label: '용차출고', match: (n) => /용차출고/.test(n) && !/2024/.test(n),
      spec: { header: ['배차접수일', '배차요청자', '브랜드'], map: { req_date: '배차접수일', requester: '배차요청자', brand: '브랜드', ship_date: '출고일자', from: '상차지', to: '도착지', boxes: '박스수', ton: '톤수', cnt: '대수', receipt: '인수증', charge: '구분', note: '비고' }, date: ['req_date', 'ship_date'], nums: ['boxes'], need: ['brand', 'ship_date'] },
      to: (o) => ({ task_type: '용차', brand: o.brand, title: (o.to || '') + ' ' + (o.boxes ? o.boxes + '박스' : '') + ' · ' + (o.ton || '') + ' ' + (o.cnt ? o.cnt + '대' : ''), detail: [o.from && '상차: ' + o.from, o.to && '도착: ' + o.to, o.charge && '청구: ' + o.charge, o.note].filter(Boolean).join(' / '), requester: o.requester, request_date: o.req_date, due_date: o.ship_date, ship_date: o.ship_date, boxes: o.boxes, status: o.receipt === '유' ? '완료' : (o.ship_date && o.ship_date < today() ? '완료' : '요청'), progress: o.receipt === '유' ? 100 : 0 }),
    },
    {
      kind: 'dplus', label: 'D+1 이상 지시', match: (n) => /^D\+1이상지시$/.test(n.replace(/\s/g, '')),
      spec: { header: ['브랜드', '구분', '작성일자', '지시일자'], map: { brand: '브랜드', sub: '구분', write_date: '작성일자', order_date: '지시일자', done_req: '출고작업완료요청일', ship_req: '출고요청일자', seq: '지시차수', qty: '지시수량', office: '사무팀', kind2: '종류', note: '비고', receiver: '현장접수자', team: '실작업팀', plan: '작업예정일자', done: '실작업완료일자', ship: '출고일자', sys: '전산처리' }, date: ['write_date', 'order_date', 'done_req', 'ship_req', 'plan', 'done', 'ship'], nums: ['qty'], need: ['brand', 'qty'] },
      to: (o) => ({ task_type: 'D+1지시', brand: o.brand, title: (o.kind2 || '') + ' ' + (o.qty || 0) + 'PCS · 차수 ' + (o.seq || '-'), detail: o.note, requester: o.office, request_date: o.write_date, due_date: o.done_req || o.ship_req || o.plan, ship_date: o.ship, assignee_name: o.receiver, assigned_team: teamName(o.team), qty: o.qty, status: o.done ? '완료' : o.plan ? '접수' : '요청', progress: o.done ? 100 : 0 }),
    },
    {
      kind: 'hold', label: '출고홀딩·재출고', match: (n) => /^출고홀딩/.test(n.replace(/\s/g, '')),
      spec: { header: ['구분', '브랜드', '지시'], scan: 10, map: { no: 'NO', sub: '구분', brand: '브랜드', store_code: '지시매장코드', store: '지시매장', receiver: '업무접수자', new_store: '변경매장', wms: 'WMS', hold_from: '홀딩,정지시작일', ship_from: '출고시작일', done: '출고완료여부', season: '년도시즌', method: '출고방법', reason: '홀딩,정지사유', plan: '작업예정', real_done: '실완료일자', real_ship: '실출고일자' }, date: ['hold_from', 'ship_from', 'real_done', 'real_ship'], need: ['brand'] },
      to: (o) => ({ task_type: '홀딩·재출고', brand: o.brand, title: (o.store || o.store_code || '') + ' ' + (o.sub || '') + ' 홀딩분 출고', detail: [o.season, o.reason, o.method].filter(Boolean).join(' / '), requester: o.receiver, request_date: o.hold_from, due_date: o.ship_from, ship_date: o.real_ship, status: /완료/.test(o.done || '') ? '완료' : '요청', progress: /완료/.test(o.done || '') ? 100 : 0 }),
    },
    {
      kind: 'open', label: '오픈매장 스케줄', match: (n) => /^오픈스케줄누적$/.test(n.replace(/\s/g, '')),
      spec: { header: ['브랜드', '기존매장', '변경매장'], map: { brand: '브랜드', store: '기존매장', new_store: '변경매장', reg: '전산지시', qty: '지시수량', ship_req: '출고요청일자', check_date: '검수일자', check: '검수방법', method: '출고방법', boxes: '합계', note: '비고', receiver: '업무접수자', plan: '작업예정일', done: '실완료일자', ship: '실출고일자', writer: '최종작성자' }, date: ['reg', 'ship_req', 'check_date', 'plan', 'done', 'ship'], nums: ['qty', 'boxes'], need: ['brand', 'store'] },
      to: (o) => ({ task_type: '오픈출고', brand: o.brand, title: (o.new_store || o.store) + ' 오픈 출고 ' + (o.qty ? o.qty + 'PCS' : ''), detail: [o.check && '검수: ' + o.check, o.method && '출고: ' + o.method, o.note].filter(Boolean).join(' / '), requester: o.writer, request_date: o.reg, due_date: o.ship_req, ship_date: o.ship, assignee_name: o.receiver, qty: o.qty, boxes: o.boxes, status: o.ship || o.done ? '완료' : o.plan ? '접수' : '요청', progress: o.ship || o.done ? 100 : 0 }),
    },
    {
      kind: 'close', label: '폐점매장 스케줄', match: (n) => /^폐점매장스케줄누적$/.test(n.replace(/\s/g, '')),
      spec: { header: ['브랜드', '폐점매장명'], map: { brand: '브랜드', store: '폐점매장명', qty: '반품등록', stock: '매장재고', close_date: '폐점일자', ret_date: '폐점반품일자', method: '반품방법', use: '상품사용', season: '사용년도', reg: '반품등록', writer: '최종작성자' }, date: ['close_date', 'ret_date'], nums: ['qty', 'stock'], need: ['brand', 'store'] },
      to: (o) => ({ task_type: '폐점', brand: o.brand, title: o.store + ' 폐점 반품 ' + (o.qty ? o.qty + 'PCS' : ''), detail: [o.method && '반품방법: ' + o.method, o.season].filter(Boolean).join(' / '), requester: o.writer, request_date: o.ret_date, due_date: o.close_date, qty: o.qty, status: /완료/.test(o.reg || '') ? '완료' : '요청', progress: /완료/.test(o.reg || '') ? 100 : 0 }),
    },
    {
      kind: 'material', label: '부자재 출고', match: (n) => /^(B2B|O2O)부자재출고$/.test(n.replace(/\s/g, '')),
      spec: { header: ['작성일', '작성자', '브랜드', '내용'], map: { write_date: '작성일', requester: '작성자', brand: '브랜드', order_date: '전산지시일', ship_req: '출고요청일', detail: '내용', stores: '매장수', qty: '수량', receiver: '업무접수자', plan: '작업예정일', due: '완료예정일', done: '실완료일자', note: '비고', sys: '전산처리' }, date: ['write_date', 'order_date', 'ship_req', 'done'], nums: ['qty', 'stores'], need: ['brand', 'detail'] },
      to: (o, sheet) => ({ task_type: /O2O/.test(sheet) ? 'O2O부자재' : 'B2B부자재', brand: o.brand, title: o.detail + (o.qty ? ' · ' + o.qty + 'PCS' : ''), detail: [o.stores && '매장 ' + o.stores, o.note].filter(Boolean).join(' / '), requester: o.requester, request_date: o.write_date, due_date: o.ship_req, ship_date: o.done, assignee_name: o.receiver, qty: o.qty, status: o.done ? '완료' : o.receiver ? '접수' : '요청', progress: o.done ? 100 : 0 }),
    },
  ];
  function firstLine(s) { s = txt(s).split(/\n/).map((x) => x.replace(/^[■★\-\s]+/, '').trim()).filter(Boolean)[0] || ''; return s.length > 60 ? s.slice(0, 60) + '…' : s; }
  function teamName(s) { s = txt(s); if (!s) return null; if (/정상/.test(s)) return '정상1팀'; if (/이월|소터/.test(s)) return '이월소터팀'; if (/온라인|B2C/.test(s)) return '온라인팀'; if (/입고|반품/.test(s)) return '입고반품팀'; if (/로라/.test(s)) return '로라팀'; if (/안성/.test(s)) return '안성센터'; return s; }
  function today() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hashKey(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  // ---------- 4) 반품 박스 수불 ----------
  function parseReturnBox(ws) {
    const g = grid(ws, 3000);
    const h = findHeader(g, ['반품일', '탑코리아', '롯데']);
    if (!h) return null;
    const rows = [];
    for (let r = h.r + 1; r <= lastRow(g); r++) {
      const d = toDate(at(g, r, 0)); if (!d) continue;
      const o = { rec_date: d, top: num(at(g, r, 1)) || 0, lotte: num(at(g, r, 2)) || 0, haengnang: num(at(g, r, 3)) || 0, etc: num(at(g, r, 4)) || 0, hanger: num(at(g, r, 6)) || 0, done: num(at(g, r, 7)) || 0, pending: num(at(g, r, 8)) || 0, confirmed_pcs: num(at(g, r, 10)) || 0 };
      if (o.top + o.lotte + o.haengnang + o.etc + o.done + o.confirmed_pcs === 0) continue;
      rows.push(o);
    }
    return { sets: [{ table: 'returns_box', conflict: 'rec_date', rows }], warnings: [] };
  }
  // 일별 반품 관리 대장 전표 (운송사·브랜드별)
  function parseReturnLedger(ws) {
    const g = grid(ws, 2000);
    const h = findHeader(g, ['도착일', '도착운송사']);
    if (!h) return null;
    const brandRow = g[h.r + 1] || [];
    const done = [], unproc = [];
    for (let c = col('L'); c <= col('W'); c++) if (brandRow[c]) done.push([c, txt(brandRow[c])]);
    for (let c = col('Y'); c <= col('AJ'); c++) if (brandRow[c]) unproc.push([c, txt(brandRow[c])]);
    const rows = [];
    for (let r = h.r + 2; r <= lastRow(g); r++) {
      const d = toDate(at(g, r, 0)); if (!d) continue;
      const data = { top: num(at(g, r, 1)) || 0, lotte: num(at(g, r, 2)) || 0, haengnang: num(at(g, r, 3)) || 0, etc: num(at(g, r, 4)) || 0, total: num(at(g, r, 5)) || 0, worker_total: num(at(g, r, 6)) || 0, goods: num(at(g, r, 7)) || 0, done_box: num(at(g, r, 8)) || 0, wait_box: num(at(g, r, 9)) || 0, slip_box: num(at(g, r, 10)) || 0, slips: num(at(g, r, col('AK'))) || 0, done_by_brand: {}, unproc_by_brand: {} };
      done.forEach(([c, b]) => { const v = num(at(g, r, c)); if (v) data.done_by_brand[b] = v; });
      unproc.forEach(([c, b]) => { const v = num(at(g, r, c)); if (v) data.unproc_by_brand[b] = v; });
      if (!data.total && !data.done_box) continue;
      rows.push({ rec_date: d, section: 'return_ledger', rec_key: '전체', data });
    }
    return { sets: [{ table: 'daily_records', conflict: 'rec_date,section,rec_key', rows }], warnings: [] };
  }

  // ---------- 5) 입고대행 정산 ----------
  function parseSettlement(ws) {
    const g = grid(ws, 50000);
    const h = findHeader(g, ['ON', '고객사']);
    if (!h) return null;
    const rows = [];
    for (let r = h.r + 2; r <= lastRow(g); r++) {
      const code = txt(at(g, r, 1)); const d = toDate(at(g, r, 3));
      if (!code || !d) continue;
      const base = num(at(g, r, col('N'))) || 0, fin = num(at(g, r, col('AA')));
      const err = (num(at(g, r, col('R'))) || 0) + (num(at(g, r, col('V'))) || 0) + (num(at(g, r, col('Z'))) || 0);
      const style = txt(at(g, r, 4));
      rows.push({
        source_key: 'S' + hashKey(code + '|' + d + '|' + style + '|' + (at(g, r, 0) || r)),
        client_code: code, client_name: txt(at(g, r, 2)), in_date: d, style, pcs: num(at(g, r, 5)) || 0,
        box_assort: num(at(g, r, col('K'))) || 0, box_solid: num(at(g, r, col('L'))) || 0, box_total: num(at(g, r, col('M'))) || 0,
        base_amount: base, err_amount: err, final_amount: fin != null ? fin : base + err,
        status: txt(at(g, r, col('AB'))) || '대기', done_date: toDate(at(g, r, col('AC'))), note: txt(at(g, r, col('AD'))) || null,
        data: { 차량: txt(at(g, r, 7)), 오류1: txt(at(g, r, col('O'))), 오류2: txt(at(g, r, col('S'))), 오류3: txt(at(g, r, col('W'))) },
      });
    }
    return { sets: [{ table: 'settlement', conflict: 'source_key', rows }], warnings: [] };
  }

  // ---------- 6) 기타 대장(행사반품, 재반송, 불량회수, 폐점반품 등) → records ----------
  //  수량 칸에 글자가 들어 있는 대장이 있다 (예: '시즌 및 복종' 칸의 'C,D/3,4') → 숫자가 아니면 비워 두고
  //  원본 줄은 data 에 그대로 남긴다. 숫자 칸에 글자를 보내면 DB 가 통째로 거부한다.
  const RECORD_SPECS = [
    { kind: 'event_return', label: '행사·선반품 리스트', header: ['브랜드', '반품내용', '사용처'], map: { brand: '브랜드', title: '반품내용', use: '사용처', period: '반품기간', plan: '반품예상수량', confirmed: '반품확정수량', state: '미확정수량', handover: '인계사항' }, nums: ['plan', 'confirmed'], need: ['brand', 'title'] },
    { kind: 'reship', label: '재반송', header: ['브랜드', '매장', '반송월', '반송일자'], map: { brand: '브랜드', store: '매장', rec_date: '반송일자', reason: '반송사유', boxes: '박스수', qty: '수량', barcode: '바코드번호' }, date: ['rec_date'], nums: ['boxes', 'qty'], need: ['brand', 'rec_date'] },
    { kind: 'defect', label: '불량 회수 상품', header: ['브랜드', '작성일자', '불량사유'], map: { brand: '브랜드', rec_date: '작성일자', reason: '불량사유', ret_date: '물류반품일자', season: '시즌', style: '품번', color: '색상', qty: '총수량', state: '완료여부' }, date: ['rec_date', 'ret_date'], nums: ['qty'], need: ['brand', 'style'], scan: 8 },
    { kind: 'close_return', label: '폐점·홀딩해체 반품', header: ['No', '반품일자', '항목', '브랜드', '매장명'], map: { rec_date: '반품일자', title: '항목', brand: '브랜드', store: '매장명', qty: '시즌별수량', boxes: '박스수량', use: '사용처', state: '반품팀진행현황', result: '최종결과' }, date: ['rec_date'], nums: ['boxes'], need: ['brand', 'rec_date'] },
    { kind: 'store_defect', label: '매장반품 불량상품 관리대장', header: ['날짜', '브랜드', '구분', '매장/업체명'], map: { rec_date: '날짜', brand: '브랜드', sub: '구분', store: '매장/업체명', style: '품번', color: '색상', size: '사이즈', qty: '수량', title: '내용', state: '처리여부', done_date: '처리일자', worker: '처리자' }, date: ['rec_date', 'done_date'], nums: ['qty'], need: ['brand', 'style'], scan: 12 },
    { kind: 'online_return', label: '온라인 반품대장', header: ['반품일자', '반품수량', '반품등록일'], map: { rec_date: '반품일자', qty: '반품수량', reg: '반품등록일', b2b: 'B2B반품수량', b2c: 'B2C정리수량', state: '결과', result: '최종결과' }, nums: ['qty'], need: ['qty'] },
  ];

  // ---------- 감지 ----------
  function detectSheet(name, ws) {
    const n = String(name).trim(), nn = n.replace(/\s/g, '');
    if (/업무일지$/.test(nn) && nn !== '별도인원업무일지') return { kind: 'worklog', label: '관리자 업무일지 · ' + TEAM_FROM_SHEET(n) };
    if (nn === '별도인원업무일지') return { kind: 'support', label: '별도인원 업무일지' };
    if (sheetDate(n)) return { kind: 'daily', label: '일일 마감보고 ' + sheetDate(n) };
    if (nn === '입고대행누적데이터') return { kind: 'settlement', label: '입고대행 정산 누적' };
    if (nn === '일별반품관리대장전표') return { kind: 'return_ledger', label: '일별 반품 관리 대장' };
    for (const s of LIST_SPECS) if (s.match(n)) return { kind: s.kind, label: s.label + ' · ' + n, list: s };
    return { kind: 'probe' }; // 내용으로 판별
  }

  // 메인: 워크북 → 인식 결과 목록
  function analyze(wb, fileName, opts) {
    opts = opts || {};
    const results = [];
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      if (!ws || !ws['!ref']) continue;
      if (opts.skipHidden && wb.Workbook && wb.Workbook.Sheets) {
        const meta = wb.Workbook.Sheets.find((s) => s.name === name);
        if (meta && meta.Hidden) continue;
      }
      const det = detectSheet(name, ws);
      let res = null;
      try {
        if (det.kind === 'worklog') res = parseWorklog(ws, name);
        else if (det.kind === 'support') res = parseSupport(ws);
        else if (det.kind === 'daily') res = parseDaily(ws, name);
        else if (det.kind === 'settlement') res = parseSettlement(ws);
        else if (det.kind === 'return_ledger') res = parseReturnLedger(ws);
        else if (det.list) {
          const yr = (n) => { const m = n.match(/^(\d{2})년/); return m ? '20' + m[1] : String(new Date().getFullYear()); };
          const p = parseList(ws, Object.assign({ year: yr(name) }, det.list.spec));
          if (p) {
            const rows = p.rows.map((o) => {
              const t = det.list.to(o, name);
              t.assigned_by = null; t.source = det.list.kind; t.source_key = det.list.kind + ':' + hashKey(name + '|' + JSON.stringify(o.raw));
              t.data = o.raw; t.center_id = 'gobaek'; if (t.brand) t.brand = brand(t.brand);
              if (t.status === '완료') t.completed_at = (t.ship_date || t.due_date || t.request_date || today()) + 'T18:00:00+09:00';
              return t;
            });
            res = { sets: [{ table: 'tasks', conflict: 'source_key', rows }], warnings: [] };
          }
        }
        if (!res && det.kind !== 'worklog' && det.kind !== 'daily') {
          // 내용으로 판별
          const rb = parseReturnBox(ws);
          if (rb && rb.sets[0].rows.length) { det.kind = 'return_box'; det.label = '반품 박스 수불 · ' + name; res = rb; }
          else {
            for (const s of RECORD_SPECS) {
              const p = parseList(ws, s, 100000);
              if (p && p.rows.length) {
                det.kind = s.kind; det.label = s.label + ' · ' + name;
                res = { sets: [{ table: 'records', conflict: 'source_key', rows: p.rows.map((o) => ({ kind: s.kind, rec_date: o.rec_date || o.done_date || null, brand: brand(o.brand) || null, title: o.title || o.store || o.style || null, qty: num(o.qty != null ? o.qty : o.confirmed), state: o.state || o.result || null, source_key: s.kind + ':' + hashKey(name + '|' + JSON.stringify(o.raw)), data: o.raw })) }], warnings: [] };
                break;
              }
            }
          }
        }
      } catch (e) {
        results.push({ sheet: name, kind: det.kind, label: det.label || name, error: String(e && e.message || e), sets: [] });
        continue;
      }
      if (!res) { results.push({ sheet: name, kind: 'unknown', label: '인식 불가 · ' + name, sets: [] }); continue; }
      const count = res.sets.reduce((a, s) => a + s.rows.length, 0);
      results.push({ sheet: name, kind: det.kind, label: det.label, sets: res.sets, prices: res.prices, count, warnings: res.warnings || [], file: fileName });
    }
    return results;
  }

  // 대용량 파일: 시트 이름만 먼저 읽고 필요한 시트만 파싱
  function readWorkbook(data, opts) {
    opts = opts || {};
    HS.needXlsx();
    const names = XLSX.read(data, { type: opts.type || 'array', bookSheets: true, bookProps: true });
    const wanted = names.SheetNames.filter((n) => opts.allSheets || !/^(범례|정상이관|정상정리 현황판|행낭|출고반품현황|매장리스트▶|ERP브랜드별품번정보|전체 데이터|아이템_색상 현황|입고현황|재고 현황|전개시기|고객사정보|WMS업체별입고예상데이터|WMS입고반품현황|크리스|LX|option|2024년|2023년|241030원본)$/.test(n.trim()));
    const wb = XLSX.read(data, { type: opts.type || 'array', sheets: wanted, cellDates: false, cellFormula: false, cellHTML: false, cellText: false, sheetStubs: false });
    return wb;
  }

  return { brand, analyze, readWorkbook, parseWorklog, parseDaily, parseList, toDate, num, norm, hashKey, LIST_SPECS };
});
