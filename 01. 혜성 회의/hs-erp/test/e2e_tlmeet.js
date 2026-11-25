// 2026-11-25 — 팀장 자체 회의록 (2안 회의록 문서형 · views-tlmeet.js · sql/36_tlmeet.sql)
//  회의 만들기 · 팀별 업무 · 지시사항 모아 보기 · 별도 파일(사진 줄이기 · 미리보기) · 안 끝난 업무 넘기기 · 권한 · 엑셀 · 지우기
const { chromium } = require('playwright');
const path = require('path');
const URL = 'http://localhost:' + (process.env.PORT || process.argv[2] || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();
// 1x1 PNG
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('hs-nav-h', 'v'); } catch (e) { /* 무시 */ } });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  pg.on('dialog', (d) => d.dismiss());
  const login = async (id, pw) => {
    await pg.evaluate(() => { try { sessionStorage.removeItem('hs-local-uid'); } catch (e) { /* 무시 */ } }).catch(() => {});
    await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lgo'); await pg.waitForTimeout(1300);
    await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  };
  const open = async (q) => { await pg.evaluate((h) => { location.hash = h; }, '#/tlmeet' + (q || '')); await pg.waitForTimeout(1300); };
  const body = async () => flat(await pg.textContent('#body'));
  const save = async () => { await pg.click('.modal .mf button:has-text("저장")'); await pg.waitForTimeout(1600); };
  const sect = (t) => '#body .tlsec:has(h3:has-text("' + t + '"))';

  // ---------- ① 관리자: 메뉴 · 빈 화면 · 첫 회의 ----------
  await login('admin', 'admin1234');
  const nav = flat(await pg.textContent('.side'));
  ok(/팀장 회의/.test(nav) && /팀장 자체 회의록/.test(nav), '① 메뉴에 팀장 회의 › 팀장 자체 회의록');
  await open();
  ok(/아직 만든 회의가 없습니다/.test(await body()), '① 처음엔 빈 화면 + 새 회의 만들기 안내');
  await pg.click('#tools button:has-text("새 회의 만들기")'); await pg.waitForSelector('.modal #md');
  ok(/첫 회의입니다/.test(flat(await pg.textContent('.modal'))), '① 첫 회의라고 알려 줌');
  await pg.fill('.modal #md', '2026-11-18'); await pg.click('.modal .mf button:has-text("만들기")'); await pg.waitForTimeout(1500);
  ok(/m=2026-11-18/.test(pg.url()), '① 만든 회의로 바로 이동');
  let t = await body();
  ok(/2026-11-18 \(수\)/.test(t) && /주간 팀장 회의/.test(t), '① 회의 날짜 · 요일 · 이름');
  const toc = flat(await pg.textContent('.tltoc'));
  ok(['정상1팀', '이월소터팀', '입고반품팀', '온라인팀', '로라팀', '지원팀', '공통 · 기타'].every((x) => toc.indexOf(x) >= 0) && toc.indexOf('별도인원') < 0, '① 팀 목차 = 사이트 팀 + 지원팀 + 공통 · 기타 (별도인원 뺌)');
  ok(/이번 회의에 적힌 지시사항이 없습니다/.test(t), '① 지시사항 칸이 비어 있다고 보임');

  // ---------- ② 업무 추가 (관리자 · 지시사항 + 파일 3개) ----------
  await pg.click(sect('입고반품팀') + ' [data-add]'); await pg.waitForSelector('.modal #iti');
  ok(await pg.$eval('.modal #is', (e) => e.value) === '2026-11-18', '② 시작일 기본값 = 회의 날짜');
  ok(!(await pg.$eval('.modal #ic', (e) => e.disabled)), '② 관리자는 대표님 지시 칸을 쓸 수 있음');
  await pg.fill('.modal #iti', '27년 초두 입고 · 출고 [세인트 · 바니]');
  await pg.fill('.modal #idt', '· 세인트 11/16 입고 시작\n· 바니 11/27 1차 입고 예정');
  await pg.fill('.modal #ie', '2026-12-05'); await pg.fill('.modal #ip', '45'); await pg.fill('.modal #int', '바니 1차 입고 11/27');
  await pg.fill('.modal #ic', '바니 초두는 12/05 까지 매장 도착 기준'); await pg.fill('.modal #ig', '입고 인원 추가는 지원팀과 금요일까지 협의');
  // 큰 사진 (잡음 1600x1200 PNG ≈ 5MB) → 올릴 때 JPG 로 줄어야 함
  const bigPng = Buffer.from(await pg.evaluate(() => { const c = document.createElement('canvas'); c.width = 1600; c.height = 1200; const g = c.getContext('2d'); const im = g.createImageData(1600, 1200); for (let i = 0; i < im.data.length; i++) im.data[i] = (i % 4 === 3) ? 255 : (Math.random() * 255) | 0; g.putImageData(im, 0, 0); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
  await pg.setInputFiles('.modal #ifile', [{ name: '세인트_입고현황.png', mimeType: 'image/png', buffer: bigPng }, { name: '바니_입고계획.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF') }, { name: '초두_출고일정.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK fake') }]);
  await pg.setInputFiles('.modal #ifile', [{ name: '너무큼.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(11 * 1024 * 1024, 1) }]);
  ok((await pg.$$('.modal .tlpend .pf.new')).length === 4, '② 고른 파일 4개가 올릴 목록에 보임');
  await save();
  t = await body();
  ok(/27년 초두 입고/.test(t) && /바니 1차 입고 11\/27/.test(t) && /45%/.test(t), '② 업무 내용 · 비고 · 진행률이 회의록에 보임');
  ok(/세인트 11\/16 입고 시작/.test(t), '② 세부 사항이 줄째 보임');
  const top = flat(await pg.textContent('.tldg'));
  ok(/대표님 지시사항/.test(top) && /바니 초두는 12\/05 까지 매장 도착 기준 — 입고반품팀/.test(top), '② 대표님 지시가 맨 위에 팀 이름과 같이 모임');
  ok(/입고 인원 추가는 지원팀과 금요일까지 협의 — 입고반품팀/.test(top), '② 총괄 지시도 맨 위에 모임');
  const F = await pg.evaluate(() => HS.db.list('erp_tl_file', {}));
  ok(F.length === 3, '② 10MB 넘는 파일은 빼고 3개만 올라감 (' + F.length + ')');
  const img = F.find((f) => /세인트/.test(f.name));
  ok(img && /\.jpg$/.test(img.name) && img.mime === 'image/jpeg' && +img.size < bigPng.length, '② 큰 사진은 JPG 로 줄여서 올림 (' + Math.round(bigPng.length / 1024) + 'KB → ' + Math.round((img && img.size) / 1024) + 'KB)');
  ok(F.every((f) => /^[A-Za-z0-9._\/-]+$/.test(f.path)), '② 저장소 위치는 영문 · 숫자만 (한글 이름은 따로 보관)');
  ok(await pg.evaluate((ps) => ps.every((p) => HS.db.files.has('tlmeet', p)), F.map((f) => f.path)), '② 파일이 파일 저장소에 들어감 (DB 표에는 이름 · 위치만)');
  await pg.waitForTimeout(500);
  ok(await pg.$eval('.tlf [data-img]', (e) => /url\(/.test(e.style.backgroundImage)), '② 사진은 작은 미리보기 그림으로 보임');
  const tiles = flat(await pg.textContent(sect('입고반품팀') + ' .tlfs'));
  ok(/PDF/.test(tiles) && /XLS/.test(tiles), '② PDF · 엑셀은 종류 표시 칸으로 보임');
  // 미리보기
  await pg.click('.tlf:has([data-img])'); await pg.waitForSelector('.modal .tlv img', { timeout: 5000 });
  ok(/^blob:/.test(await pg.$eval('.modal .tlv img', (e) => e.src)), '② 사진을 누르면 크게 보기');
  await pg.click('.modal [data-x]'); await pg.waitForTimeout(300);
  await pg.click('.tlf:has-text("바니_입고계획.pdf")'); await pg.waitForSelector('.modal iframe.tlpdf', { timeout: 5000 });
  ok(true, '② PDF 를 누르면 화면 안에서 미리보기');
  await pg.click('.modal [data-x]'); await pg.waitForTimeout(300);
  const [dl0] = await Promise.all([pg.waitForEvent('download', { timeout: 5000 }).catch(() => null), pg.click('.tlf:has-text("초두_출고일정.xlsx")')]);
  ok(dl0 && dl0.suggestedFilename() === '초두_출고일정.xlsx', '② 엑셀 파일은 누르면 원래 이름으로 받기');

  // ---------- ③ 정상1팀 업무 둘 (완료 · 지연) ----------
  const addItem = async (team, o) => {
    await pg.click(sect(team) + ' [data-add]'); await pg.waitForSelector('.modal #iti');
    await pg.fill('.modal #iti', o.title); if (o.start) await pg.fill('.modal #is', o.start); if (o.end) await pg.fill('.modal #ie', o.end); if (o.st) await pg.selectOption('.modal #ist', o.st); if (o.pct != null) await pg.fill('.modal #ip', String(o.pct));
    if (o.file) await pg.setInputFiles('.modal #ifile', [{ name: o.file, mimeType: 'image/png', buffer: PNG1 }]);
    await save();
  };
  await addItem('정상1팀', { title: '마무트 1년차 13,000장 정리', st: 'done', file: '마무트.png' });
  await addItem('정상1팀', { title: '온라인 1차 실사 보고서', start: '2026-10-20', end: '2026-11-01', pct: 30 });
  t = await body();
  ok(/완료/.test(flat(await pg.textContent(sect('정상1팀')))) && (await pg.$$(sect('정상1팀') + ' tr.st-done')).length === 1, '③ 완료로 고르면 완료로 보임');
  ok(/지연 · \d+일 지남/.test(t) && (await pg.$$('#body tr.st-late')).length === 1, '③ 종료일이 지났는데 완료가 아니면 지연 (빨강)');
  ok(/지연 1/.test(flat(await pg.textContent('.tltoc'))), '③ 팀 목차에 지연 건수');
  ok(/업무 3건 · 진행 1 · 완료 1 · 지연 1 · 대기 0/.test(t), '③ 회의 머리에 건수 요약');
  await pg.click('.tltoc a:has-text("정상1팀")'); await pg.waitForTimeout(700);
  ok(await pg.evaluate(() => { const r = document.querySelector('.tlsec h3').closest('.tlsec').getBoundingClientRect(); return r.top < 200; }), '③ 팀 목차를 누르면 그 팀으로 이동');
  // 지시사항 줄을 누르면 그 업무로
  await pg.click('.tld.c li'); await pg.waitForTimeout(400);
  ok((await pg.$$('#body tr.tlhi')).length === 1, '③ 지시사항을 누르면 그 업무 줄로 가서 표시');
  // 순서 바꾸기
  const ord0 = await pg.$$eval(sect('정상1팀') + ' .tti', (es) => es.map((e) => e.textContent));
  await pg.click(sect('정상1팀') + ' [data-dn]'); await pg.waitForTimeout(1300);
  const ord1 = await pg.$$eval(sect('정상1팀') + ' .tti', (es) => es.map((e) => e.textContent));
  ok(ord0[0] === ord1[1] && ord0[1] === ord1[0], '③ ▼ 로 업무 순서를 바꿈');

  // ---------- ④ 팀장 (정상1팀): 자기 팀만 · 지시사항 못 씀 ----------
  await login('leader', '1234');
  ok(/팀장 자체 회의록/.test(flat(await pg.textContent('.side'))), '④ 팀장 메뉴에도 보임');
  await open();
  ok(await pg.$(sect('정상1팀') + ' [data-add]') && !(await pg.$(sect('입고반품팀') + ' [data-add]')), '④ 팀장은 자기 팀에만 [업무 추가]');
  ok(!(await pg.$(sect('입고반품팀') + ' [data-ed]')) && !(await pg.$(sect('입고반품팀') + ' [data-fx]')), '④ 다른 팀 업무는 고치기 · 파일 지우기 단추가 없음 (보기만)');
  ok(await pg.$(sect('공통 · 기타') + ' [data-add]'), '④ 공통 · 기타는 팀장도 씀');
  await pg.click(sect('정상1팀') + ' tr.st-late [data-ed]'); await pg.waitForSelector('.modal #iti');
  ok(await pg.$eval('.modal #ic', (e) => e.disabled) && await pg.$eval('.modal #ig', (e) => e.disabled), '④ 팀장은 대표님 · 총괄 지시 칸이 잠김');
  ok(/관리자만 씁니다/.test(flat(await pg.textContent('.modal'))), '④ "관리자만 씁니다" 안내');
  await pg.fill('.modal #ip', '60'); await save();
  ok(/60%/.test(flat(await pg.textContent(sect('정상1팀')))), '④ 팀장이 자기 팀 진행률을 고침');
  const deny = await pg.evaluate(async () => {
    const r = {}; const it = (await HS.db.list('erp_tl_item', {})).find((x) => x.team === '정상1팀');
    try { await HS.db.insert('erp_tl_item', { id: 'zz1', meet_id: '2026-11-18', root: 'zz1', team: '온라인팀', title: '남의 팀' }); r.ins = 'ok'; } catch (e) { r.ins = e.message; }
    try { await HS.db.update('erp_tl_item', { id: it.id }, { ceo: '몰래' }); r.ceo = 'ok'; } catch (e) { r.ceo = e.message; }
    try { await HS.db.rpc('erp_tl_del_meet', { p_id: '2026-11-18' }); r.dm = 'ok'; } catch (e) { r.dm = e.message; }
    return r; });
  ok(/권한|팀장/.test(deny.ins), '④ 다른 팀 업무 넣기는 막힘 (' + deny.ins + ')');
  ok(/관리자만/.test(deny.ceo), '④ 자기 팀 줄이라도 지시사항은 못 넣음');
  ok(/관리자만/.test(deny.dm), '④ 팀장은 회의를 못 지움');
  ok(!(await pg.$('#tldel')), '④ 팀장에게는 [회의 지우기] 단추가 없음');

  // ---------- ⑤ 새 회의 — 안 끝난 업무만 넘어옴 ----------
  await pg.click('#tools button:has-text("새 회의 만들기")'); await pg.waitForSelector('.modal #md');
  ok(/2026-11-18/.test(flat(await pg.textContent('.modal'))) && /완료가 아닌 업무/.test(flat(await pg.textContent('.modal'))), '⑤ 앞 회의에서 무엇이 넘어오는지 안내');
  await pg.fill('.modal #md', '2026-11-25'); await pg.click('.modal .mf button:has-text("만들기")'); await pg.waitForTimeout(1600);
  ok(/안 끝난 업무 2건을 가져왔습니다/.test(flat(await pg.textContent('#toasts'))), '⑤ "안 끝난 업무 2건을 가져왔습니다" (완료 1건은 안 넘어옴)');
  t = await body();
  ok(/2026-11-25/.test(t) && /27년 초두 입고/.test(t) && /온라인 1차 실사 보고서/.test(t) && !/마무트 1년차/.test(t), '⑤ 새 회의 = 진행 중 · 지연 업무만');
  ok(/이어온 업무/.test(t), '⑤ 넘어온 줄에 "이어온 업무" 표시');
  ok(/바니 초두는 12\/05 까지 매장 도착 기준 — 입고반품팀 · 11-18 지시/.test(flat(await pg.textContent('.tldg'))), '⑤ 지난 회의 지시는 날짜(11-18 지시)를 달고 그대로 보임');
  ok((await pg.$$(sect('입고반품팀') + ' .tlf')).length === 3, '⑤ 넘어온 업무에 파일 3개가 그대로 붙어 있음');
  ok(/60%/.test(flat(await pg.textContent(sect('정상1팀')))), '⑤ 진행률도 그대로 넘어옴');
  await pg.click('#tools button:has-text("새 회의 만들기")'); await pg.waitForSelector('.modal #md');
  await pg.fill('.modal #md', '2026-11-25'); await pg.click('.modal .mf button:has-text("만들기")'); await pg.waitForTimeout(1400);
  ok(/이미 있어 그 회의를 엽니다/.test(flat(await pg.textContent('#toasts'))) && (await pg.evaluate(() => HS.db.list('erp_tl_item', { eq: { meet_id: '2026-11-25' } }))).length === 2, '⑤ 같은 날짜를 또 만들면 있던 회의를 엶 (두 번 복사 안 함)');
  // 지난 회의 표시 · 앞뒤 이동
  await open('?m=2026-11-18');
  ok(/지난 회의입니다/.test(await body()), '⑤ 지난 회의를 열면 "지난 회의입니다" 안내');
  await pg.click('#body #tlnew'); await pg.waitForTimeout(1200);
  ok(/m=2026-11-25/.test(pg.url()), '⑤ [최신 회의로] 누르면 최신 회의');
  // 팀장이 넘어온 자기 팀 업무에 파일 붙이기
  await pg.click(sect('정상1팀') + ' [data-ed]'); await pg.waitForSelector('.modal #iti');
  await pg.setInputFiles('.modal #ifile', [{ name: '실사표.png', mimeType: 'image/png', buffer: PNG1 }]); await save();
  ok((await pg.$$(sect('정상1팀') + ' .tlf')).length === 1, '⑤ 팀장이 자기 팀 업무에 파일을 붙임');

  // ---------- ⑥ 엑셀 받기 ----------
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 8000 }), pg.click('#tools button:has-text("엑셀 받기")')]);
  ok(dl.suggestedFilename() === '팀장회의록_2026-11-25.xlsx', '⑥ 엑셀 이름 = 팀장회의록_2026-11-25.xlsx');
  const XLSX = require(path.join(__dirname, '..', 'site', 'vendor', 'xlsx.full.min.js'));
  const wb = XLSX.read(require('fs').readFileSync(await dl.path()));
  const A = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  ok(/팀장 자체 회의록/.test(A[0][0]) && A[3].join('|') === '팀|No|업무 내용|시작일|종료일|진행 현황|진행률(%)|세부 사항|비고|대표님 지시사항|총괄 지시사항|별도 파일', '⑥ 제목 · 회의 날짜 · 칸 이름 (요청하신 항목 순서)');
  const xr = A.find((r) => /27년 초두/.test(r[2]));
  ok(xr && xr[0] === '입고반품팀' && /바니 초두/.test(xr[9]) && /\(2026-11-18\)/.test(xr[9]) && /세인트_입고현황\.jpg/.test(xr[11]) && +xr[6] === 45, '⑥ 업무 줄에 팀 · 진행률 · 지시(날짜) · 파일 이름');

  // ---------- ⑦ 실무진 · 업무지원팀 ----------
  await login('staff', '1234');
  ok(!/팀장 자체 회의록/.test(flat(await pg.textContent('.side'))), '⑦ 실무진 메뉴에는 안 보임');
  await open(); ok(await pg.evaluate(() => HS.cur !== 'tlmeet'), '⑦ 실무진이 주소로 열어도 안 열림');
  ok(await pg.evaluate(() => HS.db.files.url('tlmeet', 'x/y.png').then(() => false, (e) => /권한/.test(e.message))), '⑦ 실무진은 파일 저장소 파일도 못 엶');
  await login('support', '1234');
  await open();
  ok(await pg.$(sect('지원팀') + ' [data-add]') && !(await pg.$(sect('정상1팀') + ' [data-add]')), '⑦ 업무지원팀은 지원팀 업무만 추가');
  await addItem('지원팀', { title: 'V12 판촉집기 출고', end: '2026-11-30', pct: 65 });
  ok(/V12 판촉집기 출고/.test(flat(await pg.textContent(sect('지원팀')))), '⑦ 업무지원팀이 지원팀 업무를 씀');

  // ---------- ⑧ 지우기 ----------
  await login('leader', '1234');
  await open();
  await pg.click(sect('정상1팀') + ' [data-rm]'); await pg.waitForSelector('.modal');
  ok(/지난 회의에 있는 같은 업무는 그대로/.test(flat(await pg.textContent('.modal'))), '⑧ 넘어온 업무를 지울 때 지난 회의 쪽은 그대로라고 알림');
  await pg.click('.modal .mf button:has-text("확인")'); await pg.waitForTimeout(1300);
  ok(!/온라인 1차 실사 보고서/.test(flat(await pg.textContent(sect('정상1팀')))), '⑧ 이 회의에서 업무가 지워짐');
  const left = await pg.evaluate(() => HS.db.list('erp_tl_item', { eq: { meet_id: '2026-11-18' } }));
  ok(left.some((x) => /온라인 1차 실사/.test(x.title)), '⑧ 지난 회의(11-18)의 같은 업무는 남음');
  const fsNow = await pg.evaluate(() => HS.db.list('erp_tl_file', {}));
  ok(fsNow.some((f) => f.name === '실사표.png'), '⑧ 지난 회의에 같은 업무가 남아 있어 그 파일도 남음');
  await login('admin', 'admin1234');
  await open('?m=2026-11-18');
  const doneFile = (await pg.evaluate(() => HS.db.list('erp_tl_file', {}))).find((f) => f.name === '마무트.png');
  await pg.click('#body #tldel'); await pg.waitForSelector('.modal');
  ok(/되돌릴 수 없습니다/.test(flat(await pg.textContent('.modal'))), '⑧ 회의 지우기는 되돌릴 수 없다고 먼저 확인');
  await pg.click('.modal .mf button:has-text("확인")'); await pg.waitForTimeout(1500);
  const after = await pg.evaluate(() => Promise.all([HS.db.list('erp_tl_meet', {}), HS.db.list('erp_tl_file', {})]));
  ok(after[0].length === 1 && after[0][0].id === '2026-11-25', '⑧ 관리자가 11-18 회의를 지움');
  ok(!after[1].some((f) => f.name === '마무트.png') && !(await pg.evaluate((p) => HS.db.files.has('tlmeet', p), doneFile.path)), '⑧ 다른 회의에 없는 업무의 파일은 저장소에서도 지워짐');
  ok(after[1].filter((f) => /세인트|바니|초두/.test(f.name)).length === 3, '⑧ 다음 회의로 이어진 업무의 파일은 남음');
  ok(!after[1].some((f) => f.name === '실사표.png'), '⑧ 지운 회의에만 있던 업무의 파일도 정리됨');

  const bad = errs.filter((e) => !/Failed to load resource/.test(e));
  ok(!bad.length, '화면 오류 없음' + (bad.length ? ' — ' + bad.join(' | ') : ''));
  await b.close();
})();
