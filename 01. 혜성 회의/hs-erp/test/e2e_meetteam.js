// 월간 회의 팀별 섹션 (2026-11-12) — 정상팀 · 이월팀 · 온라인팀 · 지원팀을 입고팀과 같은 모양으로
//  · 요약 4칸(.kc) + 번호 붙은 묶음(.msub) · 제목을 누르면 그 화면으로
const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const SH = __dirname + '/shots/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const YM = '2026-10', LY = '2025-10';
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 1100 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(800);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));

  // ---------- 자료 넣기 ----------
  await pg.evaluate(async ([ym, ly]) => {
    const pad = (n) => String(n).padStart(2, '0');
    // 1) 일일 마감 보고 B2B 출고 (올해 · 전년) — 달마다 10일에 한 줄
    const dr = [];
    for (let m = 1; m <= 10; m++) { dr.push({ rec_date: '2026-' + pad(m) + '-10', section: 'b2b', rec_key: 'PING', data: { out_qty: 10000 + m * 100 } }); dr.push({ rec_date: '2025-' + pad(m) + '-10', section: 'b2b', rec_key: 'PING', data: { out_qty: 9000 + m * 100 } }); }
    // 그 달 주단위로 보이게 몇 날 더
    [5, 12, 19, 26].forEach((d) => dr.push({ rec_date: ym + '-' + pad(d), section: 'b2b', rec_key: 'LYNX', data: { out_qty: 1000 } }));
    [6, 13, 20, 27].forEach((d) => dr.push({ rec_date: ly + '-' + pad(d), section: 'b2b', rec_key: 'LYNX', data: { out_qty: 800 } }));
    await HS.db.upsert('erp_daily_records', dr);
    // 1-2) 신상품 요약 (출고 · 정리 칸)
    const season = HS.curSeason(); const prevS = (+season.slice(0, 4) - 1) + season.slice(4);
    const mk = (st, inn, out) => ({ st, in: inn, notin: st - inn, out, notout: inn - out, unclean: 12, unclean_all: 12, defect: 0, plan_qty: st * 40, in_qty: inn * 50 });
    await HS.db.upsert('erp_np_snap', [
      { season, snap_date: ym + '-28', data: { tot: mk(1000, 800, 600), by: { PING: mk(600, 500, 400), LYNX: mk(400, 300, 200) } } },
      { season: prevS, snap_date: ly + '-28', data: { tot: mk(900, 700, 500), by: { PING: mk(550, 420, 330), LYNX: mk(350, 280, 170) } } },
    ]);
    // 2) 물동량 — 반품 · B2C · 이관
    const vol = [];
    const add = (d, proc, qty) => vol.push({ rec_date: d, owner: '크리스', proc, qty });
    for (let m = 1; m <= 10; m++) { add('2026-' + pad(m) + '-15', '반품', 20000 + m * 100); add('2025-' + pad(m) + '-15', '반품', 19000 + m * 100); }
    add(ym + '-15', '출고', 50000); add(ly + '-15', '출고', 48000);
    add(ym + '-15', 'B2C고객출고', 20000); add(ly + '-15', 'B2C고객출고', 18000);
    add(ym + '-15', 'B2C고객반품', 3000); add(ly + '-15', 'B2C고객반품', 3600);
    add(ym + '-15', 'B2B→B2C', 9000); add(ly + '-15', 'B2B→B2C', 8000);
    add(ym + '-15', 'B2C→B2B', 1200); add(ly + '-15', 'B2C→B2B', 1400);
    add(ym + '-15', 'RT반출', 800); add(ym + '-15', 'RT반입', 600);
    await HS.db.upsert('erp_volume', vol);
    // 3) 반품 정리 대장 (erp_records · kind=rc_close)
    const rc = [];
    for (let i = 1; i <= 5; i++) rc.push({ source_key: 'T|rc|' + i, kind: 'rc_close', rec_date: ym + '-' + pad(i + 4), brand: 'PING', title: '매장' + i, qty: 1000 * i, state: i <= 3 ? '정리완료' : i === 4 ? '정리중' : '인계대기', data: { 박스수량: 10 * i } });
    await HS.db.upsert('erp_records', rc);
    // 4) 재고 실사 요약
    await HS.db.upsert('erp_cnt', [{ id: 'cT1', name: '시험 실사', center_id: 'gobaek', start_date: ym + '-28', end_date: ym + '-29', status: '확정', opts: {}, summary: { brands: [{ k: 'PING', sys: 400000, act: 399600, short: 400, over: 0, qrate: 99.9 }, { k: 'LYNX', sys: 200000, act: 200100, short: 0, over: 100, qrate: 99.95 }] } }]);
    // 5) 시즌 계획 — 이월소터팀 (정리 + 선지시) · 온라인팀 (OPEN)
    const jobs = [
      { id: 'j1', phase: 'sort', name: '이너 소터 정리', equip: 'sorter', cls: '이너', qty: 80000, start: ym + '-01' },
      { id: 'j2', phase: 'sort', name: '아우터 DAS 정리', equip: 'das', cls: '아우터', qty: 60000, start: ym + '-05' },
      { id: 'j3', phase: 'out', name: '선지시 1차 출고', equip: 'sorter', qty: 30000, start: ym + '-10' },
    ];
    await HS.db.upsert('erp_season', [
      { id: 'T2026SS', name: '2026 S/S 시험', half: 'SS', team: '이월소터팀', start_date: '2026-09-01', end_date: '2026-12-31', status: '진행', opts: { jobs } },
      { id: 'T2026OP', name: '2026 F/W OPEN 시험', half: 'FW', team: '온라인팀', start_date: '2026-09-01', end_date: '2026-12-31', status: '진행', opts: { jobs: [{ id: 'o1', phase: 'sort', name: 'PING OPEN 정리', equip: 'hand', cls: 'PING', qty: 40000 }] } },
    ]);
    await HS.db.upsert('erp_season_act', [
      { season_id: 'T2026SS', work_date: ym + '-12', job: '이너 소터 정리', qty: 60000, people: 18 },
      { season_id: 'T2026SS', work_date: ym + '-13', job: '아우터 DAS 정리', qty: 30000, people: 10 },
      { season_id: 'T2026SS', work_date: ym + '-14', job: '선지시 1차 출고', qty: 15000, people: 12 },
      { season_id: 'T2026OP', work_date: ym + '-15', job: 'PING OPEN 정리', qty: 20000, people: 5 },
    ]);
    // 6) 인원 — 그 달 3일치
    const hc = [];
    [1, 2, 5].forEach((d, i) => {
      hc.push({ work_date: ym + '-' + pad(d), team: '정상1팀', field_count: 10, office_count: 10, alloc_count: 38 });
      hc.push({ work_date: ym + '-' + pad(d), team: '이월소터팀', field_count: 8, office_count: i === 0 ? 7 : 8, alloc_count: 24 });
      hc.push({ work_date: ym + '-' + pad(d), team: '지원팀', field_count: 5 });
    });
    await HS.db.upsert('erp_headcount', hc);
    // 7) 아침 출고지시 취합 — 그 달 2일치
    await HS.db.upsert('erp_orders', [{ rec_date: ym + '-01', section: 'offline', brand: 'PING', data: {} }, { rec_date: ym + '-02', section: 'offline', brand: 'PING', data: {} }]);
  }, [YM, LY]);

  await pg.goto(URL + '#/meeting?m=' + YM); await pg.waitForSelector('#ms-정상팀 .msub', { timeout: 20000 }); await pg.waitForTimeout(1800);
  const subsOf = (s) => pg.$$eval('#ms-' + s + ' .msub > .sh', (a) => a.map((e) => e.querySelector('b').textContent + '>' + e.getAttribute('href')));
  const txtOf = async (s) => (await pg.textContent('#ms-' + s)).replace(/\s+/g, ' ');
  const kcOf = (s) => pg.$$eval('#ms-' + s + ' .kc', (a) => a.map((e) => e.querySelector('.l').textContent + '|' + e.querySelector('.v').textContent + '|' + e.querySelector('.s').textContent));

  // ---------- 1. 정상팀 ----------
  const n1 = await subsOf('정상팀');
  ok(n1.length === 4, '정상팀 묶음 4개 (' + n1.length + ')');
  ok(/출고 현황>#\/shipout/.test(n1[0] || ''), '① 출고 현황 → 출고 현황 화면 · ' + n1[0]);
  ok(/신상품 출고 · 정리 현황>#\/npout/.test(n1[1] || ''), '② 신상품 출고 · 정리 → 신상품 현황 · ' + n1[1]);
  ok(/반품 정리 현황>#\/rclean/.test(n1[2] || ''), '③ 반품 정리 현황 → 반품 정리 현황 · ' + n1[2]);
  ok(/재고 실사>#\/count/.test(n1[3] || ''), '④ 재고 실사 → 재고 실사 · ' + n1[3]);
  const k1 = await kcOf('정상팀');
  ok(k1.length === 4, '정상팀 요약 4칸 (' + k1.length + ')');
  ok(/B2B 출고 물동량\|50,000\|/.test(k1[0]), '요약: B2B 출고 물동량 50,000 · ' + k1[0]);
  const t1 = await txtOf('정상팀');
  // 10월 마감 보고 출고 = PING 11,000 + LYNX 4,000 = 15,000 · 전년 10,000 + 3,200 = 13,200
  ok(/15,000/.test(t1) && /13,200/.test(t1), '① 10월 출고 15,000 ↔ 전년 13,200');
  ok(/1~10월 누계/.test(t1), '① 누계 줄 있음');
  const wk = await pg.$$eval('#ms-정상팀 .msub >> nth=0 >> tbody tr, #ms-정상팀 .msub table tr', (a) => a.length);
  ok(wk >= 6, '① 주단위 줄도 같이 나옴 (줄 ' + wk + ')');
  ok(/기획 S\/T/.test(t1) && /출고 후 미정리/.test(t1) && /입고 후 미출고/.test(t1), '② 신상품 출고 · 정리 표 머리글');
  ok(/75%/.test(t1), '② 출고율 600 / 800 = 75%');
  ok(/폐점·홀딩해체/.test(t1) && /인계 대기/.test(t1), '③ 반품 정리 대장 · 상태 칸');
  ok(/15,000/.test(t1), '③ 반품 정리 수량 합계 15,000');
  ok(/시험 실사/.test(t1) && /99\.9/.test(t1), '④ 재고 실사 브랜드별 · 정확도');

  // ---------- 2. 이월팀 ----------
  // 2026-11-23: 시즌 정리 · 선지시 출고 묶음 폐기 — 반품 물동량 하나만 남음
  const n2 = await subsOf('이월팀');
  ok(n2.length === 1, '이월팀 묶음 1개 (' + n2.length + ')');
  ok(/반품 물동량>#\/volume/.test(n2[0] || ''), '이월팀 묶음 이름 · ' + JSON.stringify(n2));
  const k2 = await kcOf('이월팀');
  ok(/B2B 반품 물동량\|21,000\|/.test(k2[0]), '요약: 10월 반품 21,000 · ' + k2[0]);
  ok(/반품 누계/.test(k2[1] || ''), '요약: 반품 누계 칸 · ' + k2[1]);
  const t2 = await txtOf('이월팀');
  ok(!/시즌/.test(t2), '이월팀에 시즌 계획 자리가 없음');

  // ---------- 3. 온라인팀 ----------
  const n3 = await subsOf('온라인팀');
  ok(n3.length === 2, '온라인팀 묶음 2개 (' + n3.length + ')');
  const k3 = await kcOf('온라인팀');
  ok(/B2C 고객 출고\|20,000\|/.test(k3[0]), '요약: B2C 고객 출고 20,000 · ' + k3[0]);
  ok(/반품률 15\.0%/.test(k3[1]) && /전년 20\.0%/.test(k3[1]), '요약: 반품률 15.0% ↔ 전년 20.0% · ' + k3[1]);
  const t3 = await txtOf('온라인팀');
  ok(/RT 반출/.test(t3) && /RT 반입/.test(t3), '② 이관 · RT 줄');
  ok(/B2B→B2C \(온라인 입고\)/.test(t3), '② 이관 이름 그대로');
  ok(!/OPEN 정리/.test(t3), '시즌 OPEN 정리 계획 자리는 폐기');

  // ---------- 4. 지원팀 ----------
  const n4 = await subsOf('지원팀');
  ok(n4.length === 3, '지원팀 묶음 3개 (' + n4.length + ')');
  ok(/팀별 인원 배정>#\/headcount/.test(n4[0] || ''), '① 팀별 인원 배정 → 팀별 인원 배정 · ' + n4[0]);
  ok(/일일 마감 보고 작성 현황>#\/daily/.test(n4[1] || ''), '② 작성 현황 → 일일 마감 보고 · ' + n4[1]);
  ok(/자료 등록 현황>#\/upload/.test(n4[2] || ''), '③ 자료 등록 현황 → 업로드 · ' + n4[2]);
  const k4 = await kcOf('지원팀');
  ok(/아침 출고지시 취합\|2 \/ 22일\|/.test(k4[1]), '요약: 아침 출고지시 2 / 22일 (영업일) · ' + k4[1]);
  ok(/배정 인원 \(최근\)\|62명\|/.test(k4[2]), '요약: 배정 인원 38 + 24 = 62명 · ' + k4[2]);
  ok(/현장 ↔ 사무실 불일치\|.*1일/.test(k4[3]), '요약: 불일치 1일 · ' + k4[3]);
  const t4 = await txtOf('지원팀');
  ok(/현장확인 \(팀 작성\)/.test(t4) && /사무실확인 \(지원팀\)/.test(t4) && /배정 인원/.test(t4), '① 현장 · 사무실 · 배정 세 칸');
  ok(/1일 다름/.test(t4), '① 다른 날이 몇 일인지 짚어 줌');
  ok(/영업일/.test(t4) && /미작성 날짜/.test(t4), '② 영업일 · 미작성 날짜');
  ok(/물동량 \(크리스/.test(t4) && /원가관리 업무일지/.test(t4) && /반품 정리 대장/.test(t4), '③ 자료별로 어디까지 들어왔는지');
  ok(/2026-10 까지 ✔/.test(t4), '③ 이번 달까지 들어온 자료에 ✔');

  await pg.screenshot({ path: SH + 'meetteam.png', fullPage: true });
  for (const s of ['정상팀', '이월팀', '온라인팀', '지원팀']) { const el = await pg.$('#ms-' + s); if (el) await el.screenshot({ path: SH + 'meet_' + s + '.png' }); }

  // ---------- 5. 휴대폰 ----------
  await pg.setViewportSize({ width: 390, height: 900 }); await pg.waitForTimeout(1200);
  const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 1, '휴대폰 화면 가로 넘침 없음 (' + over + ')');

  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close();
})();
