// 정상팀 › 반품 정리 현황 — [📷 카톡용 이미지] ① 전체 현황 + ② 오늘 챙길 것 한 장
const { chromium } = require('playwright'); const fs = require('fs');
const URL = 'http://localhost:' + (process.env.PORT || process.argv[2] || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; fs.mkdirSync(SH, { recursive: true });

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 1050 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.addInitScript(() => { const T = new Date('2026-11-18T10:00:00').getTime(); const D = Date; class FD extends D { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } } window.Date = FD; });
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body');
  await pg.waitForTimeout(1200);

  // 자료 — 폐점 4줄 · 시즌아웃 4줄 · 수시(정상팀) 2줄 = 10줄
  //  인계 대기 7건 (오래된 순: 10/08 41일 · 10/13 36일 · 10/20 29일 · 10/27 22일 · 11/03 15일 · 11/10 8일 · 11/14 4일)
  //  정리 중 2건 · 정리 완료 1건
  const B = await pg.evaluate(async () => {
    const bs = HS.cache.brands.slice().sort((a, b) => (+a.sort || 0) - (+b.sort || 0)).map((x) => x.name);
    const mk = (kind, d, brand, store, box, state, i) => ({ kind, rec_date: d, brand, title: store, qty: null, state, source_key: 'RCK|' + kind + '|' + i, data: { 반품일자: d, 브랜드: brand, 매장명: store, 박스수량: box } });
    const rows = [
      mk('rc_seasonout', '2026-10-08', bs[0], '가매장', 32, '인계대기', 1),
      mk('rc_normal', '2026-10-13', bs[1], '나매장', 14, '인계대기', 2),
      mk('rc_close', '2026-10-20', bs[2], '다매장', 58, '인계대기', 3),
      mk('rc_seasonout', '2026-10-27', bs[0], '라매장', 21, '인계대기', 4),
      mk('rc_close', '2026-11-03', bs[1], '마매장', 9, '인계대기', 5),
      mk('rc_close', '2026-11-10', bs[2], '바매장', 5, '인계대기', 6),
      mk('rc_seasonout', '2026-11-14', bs[0], '사매장', 3, '인계대기', 7),
      mk('rc_close', '2026-09-01', bs[0], '아매장', 10, '정리중', 8),
      mk('rc_seasonout', '2026-09-02', bs[0], '자매장', 20, '정리중', 9),
      mk('rc_normal', '2026-08-01', bs[1], '차매장', 40, '정리완료', 10),
    ];
    await HS.db.upsert('erp_records', rows);
    return bs;
  });

  await pg.goto(URL + '#/rclean'); await pg.waitForTimeout(2200);
  ok(!!(await pg.$('button:has-text("카톡용 이미지")')), '[📷 카톡용 이미지] 버튼');
  await pg.click('button:has-text("카톡용 이미지")'); await pg.waitForSelector('.rep-rc', { timeout: 30000 });
  const C = await pg.evaluate(() => {
    const el = document.querySelector('.rep-rc'); const tx = (s) => [...el.querySelectorAll(s)].map((x) => x.textContent.replace(/\s+/g, ' ').trim());
    const cells = [...el.querySelectorAll('.big>div')].map((d) => ({ l: d.querySelector('.l').textContent.trim(), v: d.querySelector('.v').textContent.trim(), s: d.querySelector('.c').textContent.trim() }));
    const sh2 = [...el.querySelectorAll('.sh2')];
    const after = (h) => { const out = []; let n = h.nextElementSibling; while (n && !n.classList.contains('sh2') && !n.classList.contains('foot')) { out.push(n.textContent.replace(/\s+/g, ' ').trim()); n = n.nextElementSibling; } return out; };
    return { ttl: el.querySelector('.hd .t').textContent.trim(), h4: tx('h4'), cells, rows: [...el.querySelectorAll('table tr')].slice(1).map((r) => [...r.children].map((c) => c.textContent.trim())),
      wait: after(sh2[0]), ing: after(sh2[1]), red: el.querySelectorAll('.dday:not(.m)').length, yel: el.querySelectorAll('.dday.m').length, foot: el.querySelector('.foot').textContent, w: el.offsetWidth };
  });
  ok(/2026 반품 정리 현황 · 11\/18 \(수\)/.test(C.ttl), '제목 (' + C.ttl + ')');
  ok(C.h4.length === 2 && /전체 현황/.test(C.h4[0]) && /오늘 챙길 것/.test(C.h4[1]), '두 칸: ① 전체 현황 · ② 오늘 챙길 것');
  const v = (l) => (C.cells.find((x) => x.l === l) || {});
  ok(v('등록된 반품').v === '10', '등록된 반품 10');
  ok(v('정리 완료').v === '1' && v('정리 완료').s === '10.0%', '정리 완료 1 · 10.0%');
  ok(v('정리 중').v === '2' && v('정리 중').s === '20.0%', '정리 중 2 · 20.0%');
  ok(v('인계 대기').v === '7' && v('인계 대기').s === '최장 41일', '인계 대기 7 · 최장 41일 (' + v('인계 대기').s + ')');
  ok(C.rows.length === 4 && /폐점/.test(C.rows[0][0]), '① 대장별 표 3줄 + 합계 (' + C.rows.map((r) => r[0]).join(' · ') + ')');
  ok(C.rows[C.rows.length - 1][1] === '10' && C.rows[C.rows.length - 1][2] === '212', '합계 10건 · 박스 212');
  ok(C.wait.length === 6, '② 인계 대기 5줄 + 그 밖에 한 줄 (' + C.wait.length + ')');
  ok(/^41일\s*10\/8/.test(C.wait[0]) && /32 박스/.test(C.wait[0]), '맨 위가 가장 오래된 것 (' + C.wait[0] + ')');
  ok(/^15일\s*11\/3/.test(C.wait[4]), '다섯째가 15일 (' + C.wait[4] + ')');
  ok(/그 밖에 2건 \(8일 이하\)/.test(C.wait[5]) && /8 박스/.test(C.wait[5]), '나머지는 합계 한 줄 (그 밖에 2건 · 8일 이하 · 8 박스)');
  ok(C.red === 4 && C.yel === 1, '15일 넘으면 빨강 4 · 15일 이하는 노랑 1');
  ok(C.ing.length === 1 && /2 건/.test(C.ing[0]) && /30 박스/.test(C.ing[0]), '② 정리 중 브랜드별 (' + C.ing.join(' / ') + ')');
  ok(/빨강 = 15일/.test(C.foot), '꼬리말에 빨강 기준');
  ok(C.w >= 600 && C.w <= 760, '카드 폭 ' + C.w + 'px');
  await pg.waitForSelector('.snapv img', { timeout: 60000 });
  ok(/복사/.test(await pg.textContent('.modal')), '미리보기 창에 [복사] · [저장]');
  await pg.screenshot({ path: SH + 'rck_preview.png' });
  // 카드 전체 모습 (사진 확인용)
  // 만들어진 사진 파일 그대로 꺼내 저장 (미리보기 창은 스크롤 상자라 화면 사진으로는 잘림)
  const b64 = await pg.evaluate(() => { const i = document.querySelector('.snapv img'); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); return c.toDataURL('image/png').split(',')[1]; });
  fs.writeFileSync(SH + 'rck_card.png', Buffer.from(b64, 'base64'));
  await pg.click('.modal button:has-text("닫기")'); await pg.waitForTimeout(400);

  // 대장 하나 (시즌아웃) 를 고르면 — 제목에 대장 이름 · 표는 브랜드별 · ② 는 그 대장 것만
  await pg.goto(URL + '#/rclean?k=rc_seasonout'); await pg.waitForTimeout(1800);
  await pg.click('button:has-text("카톡용 이미지")'); await pg.waitForSelector('.rep-rc', { timeout: 30000 });
  const D = await pg.evaluate(() => { const el = document.querySelector('.rep-rc');
    return { ttl: el.querySelector('.hd .t').textContent.trim(), th: el.querySelector('table th').textContent.trim(), n: el.querySelectorAll('table tr').length - 2, waits: el.querySelectorAll('.dday').length, tot: [...el.querySelectorAll('table tr.sum td')].map((c) => c.textContent.trim()) }; });
  ok(/시즌아웃/.test(D.ttl), '대장을 고르면 제목에 대장 이름 (' + D.ttl + ')');
  ok(D.th === '브랜드' && D.n === 1, '표가 그 대장의 브랜드별 (' + D.n + '줄)');
  ok(D.tot[1] === '4' && D.waits === 3, '그 대장 것만 (4건 · 인계 대기 3건)');
  await pg.waitForSelector('.snapv img', { timeout: 60000 }); await pg.click('.modal button:has-text("닫기")');

  // 치우기
  await pg.evaluate(async () => { for (const k of ['rc_close', 'rc_seasonout', 'rc_normal']) for (const r of await HS.db.list('erp_records', { eq: { kind: k } })) if (/^RCK\|/.test(r.source_key)) await HS.db.remove('erp_records', { source_key: r.source_key }).catch(() => {}); });
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
