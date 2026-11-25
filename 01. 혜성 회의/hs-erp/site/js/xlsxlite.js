/* 월간회의 — 엑셀 가볍게 읽기 (라이브러리 없이 · 필요한 시트만 압축 해제)
 *  · 25MB 회의 자료 엑셀: 시트 22개 중 보라색(보고서) 시트만 모양 그대로(채우기 색 · 글꼴 · 병합 · 숫자 서식) 읽음
 *  · 근거 시트는 앞부분만 · 압축 해제 크기가 너무 큰 시트(예: 200MB)는 열지 않고 건너뜀
 *  · 브라우저: DecompressionStream('deflate-raw') · Node 테스트에서도 같은 코드로 동작
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HSX = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const td = new TextDecoder('utf-8');
  // ---------- zip ----------
  function readZip(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf); const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--; if (e < 0) throw new Error('엑셀(xlsx) 파일이 아닙니다');
    let n = dv.getUint16(e + 10, true), off = dv.getUint32(e + 16, true); const map = {};
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), usize = dv.getUint32(off + 24, true);
      const nl = dv.getUint16(off + 28, true), xl = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lo = dv.getUint32(off + 42, true);
      const name = td.decode(u8.subarray(off + 46, off + 46 + nl)); map[name] = { name, method, csize, usize, lo }; off += 46 + nl + xl + cl;
    }
    const data = (f) => { const l = f.lo; const nl = dv.getUint16(l + 26, true), xl = dv.getUint16(l + 28, true); const s = l + 30 + nl + xl; return u8.subarray(s, s + f.csize); };
    return { u8, map, data };
  }
  async function inflate(z, f, limit) { // limit: 앞부분 바이트만 (탭 색 읽기)
    const raw = z.data(f); if (f.method === 0) return limit ? raw.subarray(0, limit) : raw;
    const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter(); w.write(raw).catch(() => {}); w.close().catch(() => {});
    const r = ds.readable.getReader(); const parts = []; let got = 0;
    for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); got += value.length; if (limit && got >= limit) { r.cancel().catch(() => {}); break; } }
    const out = new Uint8Array(got); let p = 0; for (const x of parts) { out.set(x, p); p += x.length; } return out;
  }
  const text = async (z, path, limit) => { const f = z.map[path]; return f ? td.decode(await inflate(z, f, limit)) : ''; };
  const unx = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/&amp;/g, '&');
  const attr = (tag, a) => { const m = tag.match(new RegExp('\\s' + a + '="([^"]*)"')); return m ? unx(m[1]) : null; };
  // ---------- 색 (테마 + tint) ----------
  function tintHex(hex, t) {
    if (!t) return hex; let r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2; const d = mx - mn;
    if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    l = t < 0 ? l * (1 + t) : l * (1 - t) + t;
    const f = (p, q, x) => { if (x < 0) x += 1; if (x > 1) x -= 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
    if (!s) r = g = b = l; else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3); }
    return [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  const IDX = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF', '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99', '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'];
  function colorOf(tag, theme) {
    if (!tag) return null; const rgb = attr(tag, 'rgb'), th = attr(tag, 'theme'), ix = attr(tag, 'indexed'), t = +(attr(tag, 'tint') || 0);
    let hex = null; if (rgb) hex = rgb.slice(-6).toUpperCase(); else if (th != null) hex = theme[+th] || null; else if (ix != null && +ix < 64) hex = IDX[+ix]; else return null;
    return hex ? tintHex(hex, t) : null;
  }
  // 테마 순서: lt1 dk1 lt2 dk2 (엑셀 theme 번호 0=lt1 · 1=dk1 · 2=lt2 · 3=dk2) · accent1~6 · hlink · folHlink
  function parseTheme(x) {
    const get = (n) => { const m = x.match(new RegExp('<a:' + n + '>([\\s\\S]*?)</a:' + n + '>')); if (!m) return null; const v = m[1].match(/(?:srgbClr val|lastClr)="([0-9A-Fa-f]{6})"/); return v ? v[1].toUpperCase() : null; };
    const L = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map(get);
    return [L[0] || 'FFFFFF', L[1] || '000000', L[2] || 'E7E6E6', L[3] || '44546A'].concat(L.slice(4));
  }
  // ---------- 숫자 서식 ----------
  const BUILTIN = { 0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 14: 'yyyy-mm-dd', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 20: 'h:mm', 21: 'h:mm:ss', 22: 'yyyy-mm-dd h:mm', 37: '#,##0;(#,##0)', 38: '#,##0;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)', 49: '@' };
  const splitSec = (f) => { const out = []; let cur = '', q = false; for (let i = 0; i < f.length; i++) { const c = f[i]; if (c === '"') q = !q; if (c === '\\' && !q) { cur += c + (f[++i] || ''); continue; } if (c === ';' && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
  const isDateFmt = (f, id) => (id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || /^(\[[^\]]*\])*[^"]*?(y|d|h|s|m{1,2}(?![^"]*"))/i.test(String(f).replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/[#0.,%]/g, '')) && !/[#0]/.test(String(f).replace(/"[^"]*"/g, ''));
  function excelDate(v) { const ms = Math.round((v - 25569) * 86400000); const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return { y: d.getUTCFullYear(), m: p(d.getUTCMonth() + 1), d: p(d.getUTCDate()), H: p(d.getUTCHours()), M: p(d.getUTCMinutes()) }; }
  function fmtNum(v, f, id) {
    if (typeof v !== 'number') return v == null ? '' : String(v);
    if (f == null || f === 'General' || f === '@') { if (Number.isInteger(v)) return Math.abs(v) >= 1e4 ? v.toLocaleString('en-US') : String(v); return String(Math.round(v * 1e6) / 1e6); }
    if (isDateFmt(f, id)) { const d = excelDate(v); return /h/i.test(f) && /:/.test(f) && v % 1 ? d.y + '-' + d.m + '-' + d.d + ' ' + d.H + ':' + d.M : /^m{1,2}[/-]d{1,2}$/i.test(f.replace(/\\/g, '')) ? +d.m + '/' + +d.d : d.y + '-' + d.m + '-' + d.d; }
    const sec = splitSec(f); let s = v > 0 || sec.length === 1 ? sec[0] : v < 0 ? sec[1] : sec[2] != null ? sec[2] : sec[0]; const neg = v < 0 && (sec.length === 1 || !sec[1]);
    if (v < 0 && sec.length > 1) v = -v;
    s = s.replace(/\[[^\]]*\]/g, ''); // [Red] · [$-412] 등
    // 따옴표 · \ 글자는 숫자 기호와 섞이지 않게 사용자 영역 문자 하나로 바꿔 두었다가 마지막에 되돌림
    const lit = []; const back = (t) => t.replace(/[\uE000-\uE8FF]/g, (ch) => lit[ch.charCodeAt(0) - 0xE000]);
    s = s.replace(/"([^"]*)"|\\(.)/g, (m, a, b) => { lit.push(a != null ? a : b); return String.fromCharCode(0xE000 + lit.length - 1); }).replace(/_./g, ' ').replace(/\*./g, '');
    if (/General/i.test(s)) return back(s.replace(/General/i, fmtNum(v, 'General'))).replace(/@/g, '').trim();
    if (!/[0#?]/.test(s)) return back(s).replace(/@/g, '');
    const pct = /%/.test(s); let x = pct ? v * 100 : v;
    const m = s.match(/[0#?,]*(?:\.([0#?]+))?/g).filter(Boolean).sort((a, b) => b.length - a.length)[0] || '0';
    const tail = (m.match(/,+$/) || [''])[0].length; if (tail) x = x / Math.pow(1000, tail); // '#,##0,' = 천 단위 · ',,' = 백만 단위
    const dec = (m.replace(/,+$/, '').split('.')[1] || '').length; const comma = /[0#],[0#]/.test(m);
    let num = Math.abs(x).toFixed(dec); if (comma) { const [a, b] = num.split('.'); num = a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? '.' + b : ''); }
    if (/^#/.test(m) && +num === 0 && !/0/.test(m.split('.')[0])) num = dec ? num.replace(/^0/, '') : '';
    let out = s.replace(m, '\u0003'); out = out.replace(/[0#?,.]+/g, ''); out = back(out.replace('\u0003', num));
    return ((neg || (x < 0 && sec.length === 1)) && +Math.abs(x).toFixed(dec) !== 0 ? '-' : '') + out.trim();
  }
  // ---------- 통합 문서 ----------
  async function openBook(buf) {
    const z = readZip(buf);
    const wbx = await text(z, 'xl/workbook.xml'), rels = await text(z, 'xl/_rels/workbook.xml.rels');
    const rmap = {}; (rels.match(/<Relationship\b[^>]*>/g) || []).forEach((t) => { let tg = attr(t, 'Target') || ''; tg = tg.replace(/^\//, ''); if (!/^xl\//.test(tg)) tg = 'xl/' + tg; rmap[attr(t, 'Id')] = tg; });
    const sheets = [];
    for (const t of wbx.match(/<sheet\b[^>]*>/g) || []) {
      const path = rmap[attr(t, 'r:id')]; const f = z.map[path]; if (!f) continue;
      let color = null; const head = await text(z, path, 4096); const tc = head.match(/<tabColor\b[^>]*\/?>/);
      const dim = head.match(/<dimension ref="([^"]+)"/);
      sheets.push({ name: attr(t, 'name'), hidden: /^(hidden|veryHidden)$/.test(attr(t, 'state') || ''), path, size: f.usize, tc: tc ? tc[0] : null, dim: dim ? dim[1] : '', color });
    }
    const theme = parseTheme(await text(z, 'xl/theme/theme1.xml'));
    sheets.forEach((s) => (s.color = colorOf(s.tc, theme)));
    return { z, sheets, theme, _st: null, _ss: null };
  }
  async function styles(b) {
    if (b._st) return b._st;
    const x = await text(b.z, 'xl/styles.xml'); const nf = Object.assign({}, BUILTIN);
    (x.match(/<numFmt\b[^>]*\/?>/g) || []).forEach((t) => (nf[+attr(t, 'numFmtId')] = attr(t, 'formatCode')));
    const sec = (n) => { const m = x.match(new RegExp('<' + n + '\\b[^>]*>([\\s\\S]*?)</' + n + '>')); return m ? m[1] : ''; };
    const fills = (sec('fills').match(/<fill\b[\s\S]*?<\/fill>|<fill\s*\/>/g) || []).map((f) => { if (!/patternType="solid"/.test(f)) return null; return colorOf((f.match(/<fgColor\b[^>]*\/?>/) || [])[0], b.theme); });
    const fonts = (sec('fonts').match(/<font\b[\s\S]*?<\/font>|<font\s*\/>/g) || []).map((f) => ({ b: /<b\s*\/>|<b val="(1|true)"/.test(f), i: /<i\s*\/>|<i val="(1|true)"/.test(f), sz: +((f.match(/<sz val="([\d.]+)"/) || [])[1] || 11), c: colorOf((f.match(/<color\b[^>]*\/?>/) || [])[0], b.theme), u: /<u\b/.test(f) }));
    const borders = (sec('borders').match(/<border\b[\s\S]*?<\/border>|<border\s*\/>/g) || []).map((f) => ['left', 'right', 'top', 'bottom'].map((k) => { const m = f.match(new RegExp('<' + k + ' style="(\\w+)"')); return m ? (/medium|thick|double/.test(m[1]) ? 2 : 1) : 0; }));
    const xfs = (sec('cellXfs').match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g) || []).map((t) => {
      const fid = +(attr(t, 'numFmtId') || 0); const al = t.match(/<alignment\b[^>]*\/?>/); const fo = fonts[+(attr(t, 'fontId') || 0)] || {};
      return { fid, fmt: nf[fid], bg: fills[+(attr(t, 'fillId') || 0)] || null, fo, bd: borders[+(attr(t, 'borderId') || 0)] || [0, 0, 0, 0], h: al ? attr(al[0], 'horizontal') : null, v: al ? attr(al[0], 'vertical') : null, wrap: al ? attr(al[0], 'wrapText') === '1' : false };
    });
    b._st = xfs; return xfs;
  }
  async function strings(b) {
    if (b._ss) return b._ss; const x = await text(b.z, 'xl/sharedStrings.xml');
    b._ss = (x.match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).map((si) => unx((si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').match(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\/>/g) || []).map((t) => t.replace(/<\/?t\b[^>]*>/g, '')).join('')));
    return b._ss;
  }
  const colNum = (s) => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const ref = (r) => { const m = r.match(/^([A-Z]+)(\d+)$/); return m ? [+m[2] - 1, colNum(m[1])] : null; };
  // 시트 읽기 → { rows: [[{t: 보이는 글자, v: 값, x: 스타일 번호}]], merges, widths, heights, xs: 스타일 }
  async function readSheet(b, s, opt) {
    opt = opt || {}; const maxRows = opt.maxRows || 3000, maxBytes = opt.maxBytes || 30e6;
    if (s.size > maxBytes) return { big: true, rows: [], merges: [], widths: [], size: s.size };
    const [xs, ss] = await Promise.all([styles(b), strings(b)]); const x = await text(b.z, s.path);
    const widths = []; (x.match(/<col\b[^>]*\/>/g) || []).forEach((t) => { const a = +attr(t, 'min') - 1, z2 = +attr(t, 'max') - 1, w = +(attr(t, 'width') || 9), hid = attr(t, 'hidden') === '1'; for (let i = a; i <= Math.min(z2, 200); i++) widths[i] = hid ? 0 : w; });
    const rows = [], heights = []; let maxC = 0; const hiddenRows = new Set();
    const sd = x.indexOf('<sheetData'); const se = x.indexOf('</sheetData>'); const body = sd >= 0 ? x.slice(sd, se >= 0 ? se : undefined) : '';
    const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g; let rm; let n = 0;
    while ((rm = rowRe.exec(body)) && n < maxRows) {
      const ra = rm[1]; const r = +(attr(' ' + ra, 'r') || rows.length + 1) - 1; if (attr(' ' + ra, 'hidden') === '1') hiddenRows.add(r);
      const ht = attr(' ' + ra, 'ht'); if (ht) heights[r] = +ht; const cells = [];
      const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let cm; let ci = 0;
      while ((cm = cRe.exec(rm[2] || ''))) {
        const ca = ' ' + cm[1]; const rr = attr(ca, 'r'); const c = rr ? ref(rr)[1] : ci; ci = c + 1; const t = attr(ca, 't'); const si = +(attr(ca, 's') || 0); const inner = cm[2] || '';
        const vm = inner.match(/<v>([\s\S]*?)<\/v>/); let v = null;
        if (t === 's') v = vm ? ss[+vm[1]] : ''; else if (t === 'inlineStr') v = unx(((inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/) || [])[1]) || ''); else if (t === 'str' || t === 'e') v = vm ? unx(vm[1]) : ''; else if (t === 'b') v = vm ? (vm[1] === '1' ? 'TRUE' : 'FALSE') : ''; else if (vm) v = +vm[1];
        const st = xs[si] || {}; const shown = typeof v === 'number' ? fmtNum(v, st.fmt, st.fid) : v == null ? '' : String(v);
        if (v == null && !si) continue; cells[c] = { t: shown, v, x: si }; if (c + 1 > maxC && (shown !== '' || (st.bg))) maxC = c + 1;
      }
      rows[r] = cells; n++;
    }
    const merges = (x.match(/<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"/g) || []).map((m) => { const p = m.match(/"([A-Z]+\d+):([A-Z]+\d+)"/); const a = ref(p[1]), z2 = ref(p[2]); return [a[0], a[1], z2[0], z2[1]]; });
    return { rows, merges, widths, heights, xs, maxC, hiddenRows: [...hiddenRows], truncated: n >= maxRows };
  }
  return { readZip, openBook, readSheet, styles, fmtNum, tintHex, colorOf, splitSec, ref };
});
