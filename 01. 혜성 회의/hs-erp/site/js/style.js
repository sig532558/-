/* 혜성물류 운영 ERP — 품번 규칙 (크리스 · LX 공통)
 *  품번 예: 521D1TF181BK095 (15자리) · 짧은 품번 221E2TR803 도 앞자리까지 읽음
 *   1번째    = 브랜드
 *   2번째    = 성별
 *   3번째    = 정상/기획
 *   4번째    = 기획년도 (7·8·9 = 2017~2019, 0 = 2020, A = 2021 … F = 2026 …)
 *   5번째    = 시즌 (1 봄 · 2 여름 · 3 가을 · 4 겨울 · 5 S/S · 6 F/W · 7 NONSEASON)
 *   6~7번째  = 아이템 → 아이템군 (기본 61개 + 자동 학습 · 관리자 수정)
 *   8번째    = 테마
 *   9~10번째 = 제품번호
 *   11~12번째= 칼라
 *   13~15번째= 사이즈
 *  파일 값이 있으면 파일 값을 쓰고, 빈칸만 품번으로 채움
 * 브라우저(window.HSStyle)와 Node(require) 양쪽에서 동작
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HSStyle = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const txt = (v) => (v == null ? '' : String(v).replace(/　/g, ' ').trim());
  const up = (v) => txt(v).toUpperCase().replace(/\s+/g, '');
  const GRP = { 1: '1 (T/SHIRTS)', 2: '2 (SWEATER)', 3: '3 (OUTER)', 4: '4 (PANTS)', 5: '5 (ACCESSORY)' };
  const SEASON = { 1: '1 (봄)', 2: '2 (여름)', 3: '3 (가을)', 4: '4 (겨울)', 5: '5 (S/S)', 6: '6 (F/W)', 7: '7 (NONSEASON)' };
  // 정리 · 출고 계획 복종: 아이템군 → 이너 · JK · ACC
  const CLS = { 1: '이너', 2: '이너', 3: 'JK', 4: '이너', 5: 'ACC' };
  // 복종 예외 (브랜드 코드 = 품번 1번째 자리) — 핑 · 팬텀 · 링스의 JO · JS 는 아이템군 3(OUTER)이지만 이너로 운영
  const CLS_EX0 = { 1: { JO: '이너', JS: '이너' }, 2: { JO: '이너', JS: '이너' }, L: { JO: '이너', JS: '이너' } };
  let CLS_EX = JSON.parse(JSON.stringify(CLS_EX0));
  const setClsEx = (m) => { CLS_EX = m && typeof m === 'object' ? m : JSON.parse(JSON.stringify(CLS_EX0)); };
  const getClsEx = () => CLS_EX;
  // 실제 파일 8만 5천 줄에서 확인한 기본표 (코드: [아이템군, 이름])
  const BASE = {
    AC: [5, 'ACCESSORY 기타'], AT: [5, '토시'], BA: [5, '공'], BB: [5, '보스턴백'], BD: [5, '[AC]BAND'], BG: [5, 'BAG'], BT: [5, 'BELT'], CB: [5, '캐디백'], CP: [5, 'CAP'], CV: [5, 'DRIVER COVER'],
    FH: [1, '[FS]Fleece Hoodie'], FM: [1, '[FS]Fleece Mantoman'], FP: [4, '[FS]Fleece Pants'], FT: [1, '[FS]Fleece Full-zip'], GV: [5, 'GLOVES'],
    JA: [3, 'SAFARI'], JB: [3, 'WIND BREAKER'], JC: [3, 'COAT'], JD: [3, 'DOWN'], JF: [3, '특종'], JK: [3, 'JACKET'], JO: [3, 'ONE PIECE'], JP: [3, 'JUMPER'], JR: [3, 'RAIN WEAR'], JS: [3, 'W/SHIRTS'], JV: [3, 'VEST'],
    MF: [5, 'MUFFLER'], OP: [3, 'ONE PIECE'],
    PC: [4, 'CULOTTE'], PD: [4, 'DENIM'], PF: [4, '기능 PANTS'], PK: [4, 'SKIRT'], PL: [4, 'PL'], PM: [4, '5~8부기장'], PN: [4, '9부기장'], PR: [4, 'RAIN WEAR'], PS: [4, 'S/PANTS'], PT: [4, '긴기장'],
    PW: [5, ''],
    SA: [5, '사은품'], SC: [5, 'SOCKS'], SD: [2, 'CARDIGAN'], SE: [5, 'SHOES'], SN: [2, 'H/NECK'], SO: [2, 'POLO'], SR: [2, 'R/V NECK'], ST: [2, 'TURTLE'], SV: [2, 'VEST'], SW: [2, 'SWEATER 기타'],
    TB: [1, '[TS]Bro TOP'], TF: [1, '티셔츠 오픈형'], TH: [1, 'H/NECK'], TI: [1, 'INNER'], TL: [1, 'SLEEVELESS'], TO: [1, 'POLO'], TR: [1, 'R,V/NECK'], TS: [1, 'T/SHIRTS 기타'],
    UW: [5, 'UNDER WEAR'], WL: [5, 'WRISTLET'], WP: [4, '[WS]Warmup Pants'], WT: [3, '[WS]Warmup Top'],
  };
  let EXTRA = {}; // 기준정보 설정 'item_map' — { 코드: { g, n, src: 'learn'|'admin', ok, at, from } }
  const setExtra = (m) => { EXTRA = m && typeof m === 'object' ? m : {}; };
  const getExtra = () => EXTRA;
  // 규칙에 맞는 품번만 (예: 221E2TR803) — 다른 화주 품번에 엉뚱한 값을 채우지 않도록
  const ok = (s) => /^[0-9A-Z]{3}[0-9A-Z][1-7][A-Z]{2}/.test(s);
  const yearNum = (ch) => { const c = String(ch || '').toUpperCase(); if (/^[0-9]$/.test(c)) return c === '0' ? 2020 : 2010 + +c; if (/^[A-Z]$/.test(c)) return 2021 + (c.charCodeAt(0) - 65); return null; };
  const itemOf = (s) => (ok(s) ? s.slice(5, 7) : '');
  const grpNo = (code) => { const e = EXTRA[code]; if (e && e.g) return +e.g; const b = BASE[code]; return b ? b[0] : null; };
  function info(style) {
    const s = up(style); if (!ok(s)) return { yr: '', se: '', gr: '', item: '' };
    const y = yearNum(s[3]); const g = grpNo(s.slice(5, 7));
    return { yr: y ? s[3] + ' (' + y + ')' : '', se: SEASON[s[4]] || '', gr: g ? GRP[g] || '' : '', item: s.slice(5, 7) };
  }
  // 품번 15자리 쪼개기 (짧으면 있는 자리까지) — 화면 범례용
  function parse(style) {
    const s = up(style);
    return { style: s, brand: s[0] || '', gender: s[1] || '', kind: s[2] || '', year: s[3] || '', season: s[4] || '',
      item: s.slice(5, 7), theme: s[7] || '', no: s.slice(8, 10), color: s.slice(10, 12), size: s.slice(12, 15),
      yearNo: yearNum(s[3]), seasonName: SEASON[s[4]] || '', itemName: nameOf(s.slice(5, 7)), grpNo: grpNo(s.slice(5, 7)), ok: ok(s) };
  }
  const nameOf = (code) => { const e = EXTRA[code]; if (e && e.n) return e.n; const b = BASE[code]; return b ? b[1] : ''; };
  // 아는 아이템인지 (이름이 비어 있어도 아이템군이 있으면 안다고 본다)
  const known = (code) => !!grpNo(code);
  // 정리 · 출고 계획 복종 — 브랜드 예외 먼저, 없으면 아이템군 기준
  function clsOf(style, grpRaw, brandCode) {
    const s = up(style); const code = s.slice(5, 7);
    if (code === 'SE') return 'SE';
    const bc = up(brandCode || s[0] || '');
    const ex = CLS_EX[bc]; if (ex && ex[code]) return ex[code];
    let g = null; const m = txt(grpRaw).match(/^([1-5])/); if (m) g = +m[1]; else g = grpNo(code);
    return g ? CLS[g] || '기타' : '기타';
  }
  // 파일에 나온 아이템 중 범례에 없는 것 모으기 → 경고창에서 등록 유도
  function unknownItems(styles) {
    const m = new Map();
    for (const raw of styles || []) { const s = up(raw); if (!ok(s)) continue; const c = s.slice(5, 7); if (known(c)) continue;
      const o = m.get(c) || m.set(c, { code: c, n: 0, samples: [] }).get(c); o.n++; if (o.samples.length < 3) o.samples.push(s); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }
  // 파일 값 우선 · 빈칸만 채움
  function fill(style, yr, se, gr) { yr = txt(yr); se = txt(se); gr = txt(gr); if (yr && se && gr) return [yr, se, gr]; const i = info(style); return [yr || i.yr, se || i.se, gr || i.gr]; }
  // 아이템군 칸이 있는 파일에서 새 코드 배우기 → { 코드: { g, n } } (기본표 · 이미 아는 코드는 빼기)
  function learn(pairs) {
    const cnt = {};
    for (const [style, grpRaw, itemRaw] of pairs) {
      const s = up(style); if (!ok(s)) continue; const code = s.slice(5, 7); if (BASE[code] || EXTRA[code]) continue;
      const m = txt(grpRaw).match(/^([1-5])\b/); if (!m) continue;
      const c = cnt[code] || (cnt[code] = { n: '', g: {} }); c.g[m[1]] = (c.g[m[1]] || 0) + 1;
      if (!c.n) { const t = txt(itemRaw); const im = t.match(/^[A-Z0-9]{2}\s*\((.*)\)\s*$/i); c.n = im ? im[1] : (t && !/^[A-Z0-9]{2}$/i.test(t) ? t : ''); }
    }
    const out = {};
    for (const code in cnt) { const g = Object.entries(cnt[code].g).sort((a, b) => b[1] - a[1])[0][0]; out[code] = { g: +g, n: cnt[code].n }; }
    return out;
  }
  // 기준정보 표 (기본 + 추가)
  function table() {
    const rows = Object.keys(BASE).map((c) => ({ code: c, n: BASE[c][1], g: BASE[c][0], src: 'base', ok: true }));
    for (const c in EXTRA) { const e = EXTRA[c]; const i = rows.findIndex((r) => r.code === c); const r = { code: c, n: e.n || (BASE[c] ? BASE[c][1] : ''), g: +e.g || null, src: e.src || 'admin', ok: e.ok !== false, at: e.at || '', from: e.from || '' }; if (i >= 0) rows[i] = r; else rows.push(r); }
    return rows.sort((a, b) => (a.code < b.code ? -1 : 1));
  }
  return { info, fill, learn, table, setExtra, getExtra, setClsEx, getClsEx, parse, clsOf, known, nameOf, unknownItems, yearNum, itemOf, ok, BASE, GRP, SEASON, CLS, CLS_EX0 };
});
