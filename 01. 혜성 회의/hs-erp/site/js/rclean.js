/* 반품 정리 대장 읽기 — '매장 폐점 수시반품 대장' 한 파일에 든 8개 시트
 *  · 시트마다 칸 구성이 달라서 시트별 칸 차례(SHEETS[].cols)를 적어 두고 머리글을 차례로 맞춘다
 *    (같은 이름의 칸이 두 번 나오는 시트가 있어서 — 폐점의 '박스수량', 시즌아웃의 '정리일자' 등 — 이름만으로 찾으면 안 됨)
 *  · 저장은 erp_records (kind · rec_date · brand · title · qty · state · data · source_key) — DB 구조 안 바꿈
 *  · 연도 없는 날짜('1/3' · '01월 14일')는 올릴 때 고른 기준 연도를 씀
 * 브라우저(window.HSRClean)와 Node(require) 양쪽에서 동작
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./parsers2.js'));
  else root.HSRClean = factory(root.HSParsers2);
})(typeof self !== 'undefined' ? self : this, function (P2) {
  'use strict';
  const txt = (v) => (v == null ? '' : String(v).replace(/[　 ]/g, ' ').replace(/\s+/g, ' ').trim());
  const nk = (v) => txt(v).replace(/\s+/g, '').replace(/'+$/, '');
  const num = (v) => { const s = txt(v).replace(/,/g, ''); if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return 0; return +s; };
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? y + '-' + pad(m) + '-' + pad(d) : null);

  // 날짜 글자 → YYYY-MM-DD · 여러 날이 적혀 있으면 첫 날 (1/7~1/14 · 1월02,03일 · 1월23,24,31일,2월3일)
  function firstDate(v, baseYear) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(String(v))) { const d = P2.toDate(v); if (d) return d; }
    const s = txt(v); if (!s) return null;
    let m = s.match(/(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/); if (m) return ymd(+m[1], +m[2], +m[3]);
    m = s.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/); if (m) { let y = +m[3]; if (y < 100) y += 2000; return ymd(y, +m[1], +m[2]); }
    m = s.match(/(\d{1,2})\s*월\s*(\d{1,2})/); if (m) return ymd(baseYear, +m[1], +m[2]);
    m = s.match(/(\d{1,2})\s*[\/.]\s*(\d{1,2})/); if (m) return ymd(baseYear, +m[1], +m[2]);
    return null;
  }
  // 결과 칸이 '끝났다'는 뜻인지 — 날짜만 적혀 있어도 끝난 것으로 봄 · '인계완료'는 아직 정리 전
  function doneWord(v) {
    const s = txt(v); if (!s) return false;
    if (/^[\d\s/.\-월일~,]+$/.test(s)) return true;
    return /(완료|왼료|완됴)/.test(s.replace(/인계\s*완료/g, ''));
  }

  // t: d 날짜 · n 숫자 · b 브랜드 · t 글자
  const C = (h, l, t) => ({ h: nk(h), l: l || txt(h), t: t || 't' });
  const SHEETS = [
    { k: 'rc_close', label: '폐점 · OPEN · 홀딩해체', short: '폐점·홀딩해체', re: /폐점반품/,
      cols: [C('No', 'No', 'n'), C('반품일자', '반품일자', 'd'), C('항목'), C('브랜드', '브랜드', 'b'), C('매장명'), C('시즌별 수량'), C('반품수불', '반품수불', 'n'), C('박스수량', '박스수량', 'n'), C('사용처'), C('반품팀 진행 현황'), C('정상팀 인계일자', '정상팀 인계일자', 'd'), C('박스수량', '인계 박스', 'n'), C('정상팀 정리일자', '정상팀 정리일자', 'd'), C('정리결과'), C('사용처/비고'), C('최종결과')],
      fill: ['반품일자', '브랜드', '매장명'], qty: '반품수불', box: '박스수량', title: '매장명',
      hand: ['정상팀 인계일자'], done: ['정상팀 정리일자'], res: ['정리결과', '최종결과'] },
    { k: 'rc_normal', label: '수시 · 행사반품 (정상팀)', short: '수시·행사 (정상팀)', re: /수시.*행사.*정상/,
      cols: [C('No', 'No', 'n'), C('반품일자', '반품일자', 'd'), C('브랜드', '브랜드', 'b'), C('반품형태'), C('매장명'), C('시즌 및 복종'), C('반품수불', '반품수불', 'n'), C('박스수량', '박스수량', 'n'), C('사용처'), C('반품팀 진행 현황'), C('이월팀 인계일자', '이월팀 인계일자', 'd'), C('리프레쉬 작업일정'), C('이월팀 정리일자', '이월팀 정리일자', 'd'), C('정상팀 인계일자', '정상팀 인계일자', 'd'), C('인계박스', '인계 박스', 'n'), C('정상팀 정리일자', '정상팀 정리일자', 'd'), C('정리결과'), C('최종결과')],
      fill: ['반품일자', '브랜드', '매장명'], qty: '반품수불', box: '박스수량', title: '매장명',
      hand: ['이월팀 인계일자', '정상팀 인계일자'], done: ['이월팀 정리일자', '정상팀 정리일자'], res: ['정리결과', '최종결과'] },
    { k: 'rc_carry', label: '수시 · 행사반품 (이월팀)', short: '수시·행사 (이월팀)', re: /수시.*행사.*이월/,
      cols: [C('No', 'No', 'n'), C('반품일자', '반품일자', 'd'), C('브랜드', '브랜드', 'b'), C('반품형태'), C('매장명'), C('시즌 및 복종'), C('반품수불', '반품수불', 'n'), C('박스수량', '박스수량', 'n'), C('사용처'), C('반품팀 진행 현황'), C('출고 수량', '출고 수량', 'n'), C('이월팀 인계일자', '이월팀 인계일자', 'd'), C('인계박스', '인계 박스', 'n'), C('이월팀 정리일자', '이월팀 정리일자', 'd'), C('리프레쉬 작업일정'), C('정리결과'), C('최종결과')],
      fill: ['반품일자', '브랜드', '매장명'], qty: '반품수불', box: '박스수량', title: '매장명',
      hand: ['이월팀 인계일자'], done: ['이월팀 정리일자'], res: ['정리결과', '최종결과'] },
    { k: 'rc_evout', label: '행사반품 출고 (정상팀)', short: '행사반품 출고', re: /행사반품.*출고/,
      cols: [C('No', 'No', 'n'), C('반품일자', '반품일자', 'd'), C('브랜드', '브랜드', 'b'), C('반품형태'), C('매장명'), C('시즌 및 복종'), C('반품수불', '반품수불', 'n'), C('박스수량', '박스수량', 'n'), C('사용처'), C('브랜드', '출고 브랜드', 'b'), C('출고 내용'), C('출고일자', '출고일자', 'd'), C('출고매장'), C('출고수량', '출고수량', 'n')],
      fill: ['반품일자', '브랜드', '매장명'], qty: '반품수불', box: '박스수량', title: '매장명',
      hand: [], done: ['출고일자'], res: ['출고 내용'] },
    { k: 'rc_seasonout', label: '시즌아웃 반품', short: '시즌아웃', re: /시즌아웃/,
      cols: [C('No', 'No', 'n'), C('반품일자', '반품일자', 'd'), C('브랜드', '브랜드', 'b'), C('반품형태'), C('매장명'), C('시즌 및 복종'), C('반품수불', '반품수불', 'n'), C('박스수량', '박스수량', 'n'), C('사용처'), C('반품팀 진행 현황'), C('인계일자', '인계일자', 'd'), C('인계박스', '인계 박스', 'n'), C('정리일자', '이월팀 정리일자', 'd'), C('인수자', '이월팀 인수자'), C('정리결과', '이월팀 정리결과'), C('최종결과', '이월팀 최종결과'), C('정리일자', '정상팀 정리일자', 'd'), C('인수자', '정상팀 인수자'), C('정리결과', '정상팀 정리결과'), C('최종결과', '정상팀 최종결과')],
      fill: ['반품일자', '브랜드', '매장명'], qty: '반품수불', box: '박스수량', title: '매장명',
      hand: ['인계일자'], done: ['이월팀 정리일자', '정상팀 정리일자'], res: ['이월팀 정리결과', '이월팀 최종결과', '정상팀 정리결과', '정상팀 최종결과'] },
    { k: 'rc_on2b', label: '온라인 → 이월 · 정상', short: '온라인→이월·정상', re: /온라인.*(이월|정상)/,
      cols: [C('B2C 반품 등록일자', 'B2C 반품 등록일자', 'd'), C('브랜드', '브랜드', 'b'), C('수량', '수량', 'n'), C('B2B 반품 등록일', 'B2B 반품 등록일', 'd'), C('B2B 이관 박스수량', 'B2B 이관 박스수량', 'n'), C('이관 수량', '이관 수량', 'n'), C('정상 인계 일자', '정상 인계 일자', 'd'), C('이관 팀'), C('정리 일자', '정리 일자', 'd'), C('서류 인계 일자', '서류 인계 일자', 'd'), C('결과'), C('최종결과')],
      fill: ['B2C 반품 등록일자', '브랜드'], qty: '수량', box: 'B2B 이관 박스수량', title: '이관 팀', date: 'B2C 반품 등록일자',
      hand: ['정상 인계 일자'], done: ['정리 일자'], res: ['결과', '최종결과'] },
    { k: 'rc_b2on', label: '이월 · 정상 → 온라인', short: '이월·정상→온라인', re: /(이월|정상).*온라인/,
      cols: [C('브랜드', '브랜드', 'b'), C('내용'), C('B2C 출고 등록일', 'B2C 출고 등록일', 'd'), C('이관 박스 수량', '이관 박스 수량', 'n'), C('이관 수량', '이관 수량', 'n'), C('시즌'), C('B2C 인계 일자', 'B2C 인계 일자', 'd'), C('정리 일자', '정리 일자', 'd'), C('포스 확정 일자', '포스 확정 일자', 'd'), C('결과'), C('최종결과')],
      fill: ['브랜드'], qty: '이관 수량', box: '이관 박스 수량', title: '내용', date: 'B2C 출고 등록일',
      hand: ['B2C 인계 일자'], done: ['정리 일자', '포스 확정 일자'], res: ['결과', '최종결과'] },
    { k: 'rc_online', label: '온라인 반품대장', short: '온라인 반품대장', re: /온라인.*반품대장/,
      cols: [C('반품일자', '반품일자', 'd'), C('반품수량', '반품수량', 'n'), C('반품등록일', '반품등록일', 'd'), C('폴리백', '폴리백', 'd'), C('B2B반품수량', 'B2B 반품수량', 'n'), C('B2C정리수량', 'B2C 정리수량', 'n'), C('정리일정'), C('결과'), C('비고'), C('최종결과')],
      fill: ['반품일자'], qty: '반품수량', box: null, title: null, date: '반품일자',
      hand: ['반품등록일'], done: ['정리일정'], res: ['결과', '최종결과'] },
  ];
  const SPEC = {}; SHEETS.forEach((s) => (SPEC[s.k] = s));
  const specOf = (name) => { const s = nk(name); for (const x of SHEETS) if (x.re.test(s)) return x; return null; };
  const dateKey = (sp) => sp.date || '반품일자';

  // 머리글 줄 찾기 + 칸 차례 맞추기 — 같은 이름이 두 번 나와도 적어 둔 차례대로 왼쪽부터 집는다
  function mapCols(g, sp) {
    for (let r = 0; r < Math.min(g.length, 8); r++) {
      const row = (g[r] || []).map(nk); if (row.filter(Boolean).length < 4) continue;
      const ix = {}; let at = -1, hit = 0;
      for (const c of sp.cols) {
        let i = -1; for (let j = at + 1; j < row.length; j++) if (row[j] === c.h) { i = j; break; }
        if (i < 0) continue; ix[c.l] = i; at = i; hit++;
      }
      if (hit >= Math.ceil(sp.cols.length * 0.6) && ix[dateKey(sp)] != null) return { r, ix, hit };
    }
    return null;
  }

  // sheets: [{name, ws}] · baseYear: 연도 없는 날짜에 쓸 해
  function readBook(sheets, file, baseYear) {
    const out = { rows: [], found: [], miss: [] };
    for (const s of sheets) {
      const sp = specOf(s.name);
      if (!sp) { out.miss.push({ sheet: s.name, why: '아는 대장이 아닙니다' }); continue; }
      P2.shrink(s.ws);
      const g = P2.grid(s.ws, 200000);
      const h = mapCols(g, sp);
      if (!h) { out.miss.push({ sheet: s.name, label: sp.label, why: '머리글(' + sp.cols.slice(1, 5).map((c) => c.l).join(' · ') + ')을 찾지 못했습니다' }); continue; }
      const dk = dateKey(sp);
      const prev = {}; const seen = {}; let n = 0, blank = 0, noDate = 0, qty = 0, box = 0, from = null, to = null;
      for (let r = h.r + 1; r < g.length; r++) {
        const row = g[r] || [];
        const vals = {}; let any = false;
        for (const c of sp.cols) { const i = h.ix[c.l]; const v = i == null ? '' : row[i]; vals[c.l] = v; if (txt(v) && c.l !== 'No') any = true; }
        if (!any) { if (++blank > 60) break; continue; }
        blank = 0;
        // 칸 합친 줄: 비어 있으면 윗줄 값 이어받기
        for (const f of sp.fill) { if (!txt(vals[f])) { if (txt(prev[f])) vals[f] = prev[f]; } else prev[f] = vals[f]; }
        const data = {};
        for (const c of sp.cols) {
          if (c.l === 'No') continue;
          const v = vals[c.l];
          if (c.t === 'n') data[c.l] = num(v) || 0;
          else if (c.t === 'd') { const d = firstDate(v, baseYear); data[c.l] = d || txt(v) || null; if (d && txt(v) && nk(v) !== nk(d)) data['_' + c.l] = txt(v); }
          else data[c.l] = txt(v) || null;
        }
        const rd = firstDate(vals[dk], baseYear); if (!rd) noDate++;
        const q = sp.qty ? num(vals[sp.qty]) : 0; const bx = sp.box ? num(vals[sp.box]) : 0;
        const o = { kind: sp.k, rec_date: rd, brand: txt(vals['브랜드']) || null, title: sp.title ? txt(vals[sp.title]) || null : null, qty: q, data };
        o.state = stateOf(o, sp);
        const core = [sp.k, rd || txt(vals[dk]), o.brand, o.title, q, bx].join('|');
        seen[core] = (seen[core] || 0) + 1;
        o.source_key = 'RC|' + core + '|' + seen[core];
        out.rows.push(o); n++; qty += q; box += bx;
        if (rd) { if (!from || rd < from) from = rd; if (!to || rd > to) to = rd; }
      }
      out.found.push({ sheet: s.name, kind: sp.k, label: sp.label, rows: n, qty, box, from, to, noDate, file });
    }
    return out;
  }
  function stateOf(o, sp) {
    const any = (ks) => ks.some((k) => { const v = o.data[k]; return v != null && txt(v) !== ''; });
    if (any(sp.done) || sp.res.some((k) => doneWord(o.data[k]))) return '정리완료';
    if (any(sp.hand)) return '정리중';
    return '인계대기';
  }
  const boxOf = (r) => { const sp = SPEC[r.kind]; return sp && sp.box ? +(r.data || {})[sp.box] || 0 : 0; };
  return { readBook, SHEETS, SPEC, specOf, firstDate, doneWord, boxOf, dateKey, stateOf };
});
