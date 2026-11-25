// 월간 회의 "3. 입고팀" 항목 묶음: 기획량 · 입고 S/T · 입고 수량(PCS) 전년 비교 · 월별 입고 현황(브랜드 고르기) · 반품 이름 · 하위 화면 바로 가기
const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const YM = '2026-10', LY = '2025-10';
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1440, height: 1000 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body'); await pg.waitForTimeout(800);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));

  // ---------- 자료 넣기 ----------
  await pg.evaluate(async ([ym, ly]) => {
    const season = HS.curSeason(); const prev = (+season.slice(0, 4) - 1) + season.slice(4);
    const mk = (st, inn, inq) => ({ st, in: inn, notin: st - inn, out: Math.round(inn * 0.6), notout: 0, unclean: 3, unclean_all: 3, defect: 0, plan_qty: st * 40, in_qty: inq });
    const cur = { tot: mk(1000, 800, 40000), by: { PING: mk(600, 500, 25000), LYNX: mk(400, 300, 15000) } };
    const pre = { tot: mk(900, 650, 32000), by: { PING: mk(550, 400, 20000), LYNX: mk(350, 250, 12000) } };
    await HS.db.upsert('erp_np_snap', [{ season, snap_date: ym + '-28', data: cur }, { season: prev, snap_date: ly + '-28', data: pre }]);
    // WMS 입고반품 현황 원자료 (브랜드 · 일자 · 입고구분 · 기획년도 · 시즌 · 아이템군 · 품번 · 색상 · 입고수량 · 등록일자)
    const rows = []; const add = (br, d, gu, q) => rows.push([br, d, gu, '2026', 'F', '아우터', 'X1', 'BK', q, d]);
    for (let m = 1; m <= 10; m++) { const d = '2026-' + String(m).padStart(2, '0') + '-10'; add('PING', d, '입고', 1000 + m * 10); add('LYNX', d, '입고', 500 + m * 5); add('PING', d, '반품', 100); }
    for (let m = 1; m <= 10; m++) { const d = '2025-' + String(m).padStart(2, '0') + '-10'; add('PING', d, '입고', 900 + m * 8); add('LYNX', d, '입고', 400 + m * 4); }
    await HS.db.upsert('erp_np_raw', [{ kind: 'inbound', file: '시험.xlsx', n: rows.length, rows }]);
    await HS.db.upsert('erp_ret_done', [{ rec_date: ym + '-05', brand: 'PING', slips: 100, pcs: 4000 }, { rec_date: ly + '-05', brand: 'PING', slips: 80, pcs: 3000 }]);
    await HS.db.upsert('erp_ret_pend', [{ brand: 'PING', req_from: ym + '-01', req_to: ym + '-28', req_slips: 9, req_pcs: 90, rows: [{ d: ym + '-02', no: 'A1', store: '본점', req: 10, out: 0, pend: 10, open: true }, { d: ym + '-03', no: 'A2', store: '판교', req: 5, out: 0, pend: 5, open: true }] }]);
    await HS.db.upsert('erp_returns_box', [{ rec_date: ym + '-05', top: 60, lotte: 20, haengnang: 10, etc: 10, hanger: 0, done: 80, pending: 20, confirmed_pcs: 0 }, { rec_date: ly + '-05', top: 50, lotte: 20, haengnang: 10, etc: 20, hanger: 0, done: 60, pending: 40, confirmed_pcs: 0 }]);
    await HS.db.upsert('erp_settlement', [{ source_key: 's1', client_name: 'MAMMUT SPORTS GROUP', in_date: ym + '-07', pcs: 5280, box_total: 212, status: '확정' }, { source_key: 's2', client_name: 'LYNX KOREA', in_date: ym + '-08', pcs: 3940, box_total: 164, status: '대기' }]);
  }, [YM, LY]);

  await pg.goto(URL + '#/meeting?m=' + YM); await pg.waitForSelector('#ms-입고팀 .msub', { timeout: 15000 }); await pg.waitForTimeout(1200);
  const sect = '#ms-입고팀 ';

  // ---------- 1. 항목 묶음 5개 · 제목 누르면 하위 화면 ----------
  const subs = await pg.$$eval(sect + '.msub > .sh', (a) => a.map((e) => e.querySelector('b').textContent + '>' + e.getAttribute('href')));
  ok(subs.length === 4, '항목 묶음 4개 · 원가 관리는 맨 마지막 섹션으로 뺌 (' + subs.length + ')');
  ok(subs[0].indexOf('신상품 입고 현황>#/newprod') === 0, '① 신상품 입고 현황 → 신상품 화면 · ' + subs[0]);
  ok(/반품 진행 현황>#\/returns/.test(subs[2] || ''), '③ 반품 진행 현황 → 반품 현황 · ' + subs[2]);
  ok(/입고 대행>#\/settlement/.test(subs[3] || ''), '④ 입고 대행 → 입고 대행 정산 · ' + subs[3]);

  // ---------- 1-2. 섹션 번호 · 순서 ----------
  const secs = await pg.$$eval('.msect > h3', (a) => a.map((e) => e.childNodes[0].textContent.trim()));
  ok(/^00\. \d{4}년 예상 물동량$/.test(secs[0]), '첫 섹션 00. 내년 예상 물동량 · ' + secs[0]);
  ok(secs[1] === '01. 물동량 (월마감)', '둘째 섹션 01. 물동량 · ' + secs[1]);
  ok(secs[2] === '02. 입고팀', '셋째 섹션 02. 입고팀 · ' + secs[2]);
  ok(secs[secs.length - 1] === '10. 원가 관리 · 인력 운영', '마지막 섹션 10. 원가 관리 · ' + secs[secs.length - 1]);
  ok(!secs.some((x) => /신상품/.test(x)), '신상품 섹션은 입고팀 ① 과 겹쳐서 뺌');
  ok(!/투입 인원|인당 작업 수량/.test(await pg.textContent('#ms-정상팀')), '팀별 섹션에는 인원 · 원가 항목 없음 (정상팀)');

  // ---------- 2. 기획량 · 입고 수량(PCS) 전년 대비 ----------
  const kpis = await pg.$$eval(sect + '.kc', (a) => a.map((e) => e.querySelector('.l').textContent + '|' + e.querySelector('.v').textContent + '|' + e.querySelector('.s').textContent));
  const kplan = kpis.find((x) => x.indexOf('신상품 기획량') === 0) || '';
  ok(/\|1,000\|/.test(kplan) && /전년 900/.test(kplan) && /\+11\.1%/.test(kplan), '상단 기획량 1,000 · 전년 900 · +11.1% · ' + kplan);
  const kpcs = kpis.find((x) => x.indexOf('신상품 입고 수량 (PCS)') === 0) || '';
  ok(/\|40,000\|/.test(kpcs) && /전년 32,000/.test(kpcs) && /\+25\.0%/.test(kpcs), '상단 입고 수량 40,000 · 전년 32,000 · +25.0% · ' + kpcs);

  // ---------- 3. 신상품 표: 기획량 · 입고 · PCS 묶음 머리글 ----------
  const gh = await pg.$$eval(sect + 'table.mgrp tr.gh th', (a) => a.map((e) => e.textContent));
  ok(gh.join(',') === '브랜드,기획량 (S/T),입고 (S/T),입고 수량 (PCS),입고율 · 미입고,출고 · 정리', '묶음 머리글: ' + gh.join(','));
  const tot = await pg.$$eval(sect + 'table.mgrp tr.tot td', (a) => a.map((e) => e.textContent));
  ok(tot[1] === '1,000' && tot[2] === '900' && tot[3] === '+11.1%', '합계 기획량 1,000 / 900 / +11.1% · ' + tot.slice(1, 4).join(' '));
  ok(tot[7] === '40,000' && tot[8] === '32,000' && tot[9] === '+25.0%', '합계 입고 PCS 40,000 / 32,000 / +25.0% · ' + tot.slice(7, 10).join(' '));

  // ---------- 4. 월별 입고 현황: 브랜드 여러 개 고르기 ----------
  const mtot = () => pg.textContent(sect + '#npmonb table tr.tot td >> nth=3');
  const all = (await mtot()).trim();        // 10월 PING(1100-100) + LYNX(550) = 1550
  ok(all === '1,550', '월별 합계(전체) 1,550 · ' + all);
  await pg.click(sect + '#mbrand'); await pg.waitForSelector('.qpop', { timeout: 8000 });
  await pg.click('.qpop [data-none]'); await pg.click('.qpop label:has(span:text-is("LYNX"))'); await pg.mouse.click(5, 5); await pg.waitForTimeout(400);
  const one = (await mtot()).trim();
  ok(one === '550', 'LYNX 만 고르면 550 · ' + one);
  ok(/1개/.test(await pg.textContent(sect + '#mbrand')), '버튼에 1개 표시 · ' + (await pg.textContent(sect + '#mbrand')).trim());

  // ---------- 5. 반품 진행 현황 = 반품 현황 화면의 일별 반품 관리 대장을 그대로 ----------
  await pg.waitForSelector(sect + '#retdash .rtab table', { timeout: 15000 });
  const rt = (await pg.textContent(sect + '.msub >> nth=2')).replace(/\s+/g, ' ');
  ok(/일별 반품 관리 대장/.test(rt), '일별 반품 관리 대장이 그대로 들어감');
  ok(/도착 운송사 BOX/.test(rt) && /실무진 BOX/.test(rt) && /당일 반품 완료 전표/.test(rt) && /반품 미발송 전표/.test(rt), '묶음 머리글 4개 (도착 BOX · 실무진 BOX · 당일 완료 · 미발송)');
  ok(/브랜드별 반품 미발송/.test(rt) && /반품 미발송 상세/.test(rt), '브랜드별 미발송 · 미발송 상세도 같이 나옴');
  ok(rt.indexOf('전산 미처리') < 0, '"전산 미처리" 라는 말은 안 씀');
  ok(!/반품 확정 \(전표\)/.test(rt), '"반품 확정" 이라는 말은 안 씀');
  // 요약 4칸은 빼고 (월간 회의에는 위에 이미 요약이 있음)
  ok(!(await pg.$(sect + '#retdash .kpis')), '반품 요약 4칸은 빼고 넣음');
  // 전표 ↔ PCS 를 눌러도 화면을 떠나지 않고 그 자리에서 바뀜
  await pg.click(sect + '#retdash .seg >> text=PCS'); await pg.waitForTimeout(900);
  ok(/#\/meeting/.test(pg.url()), '전표/PCS 를 눌러도 월간 회의 화면에 그대로 있음 · ' + pg.url().split('#')[1]);
  ok(/전산 완료 PCS/.test((await pg.textContent(sect + '#retdash')).replace(/\s+/g, ' ')), 'PCS 로 바뀜');

  // ---------- 6. 입고 대행: 고객사별 ----------
  const st = await pg.textContent(sect + '.msub >> nth=3');
  ok(st.indexOf('MAMMUT SPORTS GROUP') >= 0 && st.indexOf('LYNX KOREA') >= 0, '입고 대행 고객사별로 나옴');
  ok(/9,220/.test(st), '입고 대행 합계 9,220 PCS');

  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1; await b.close();
})();
