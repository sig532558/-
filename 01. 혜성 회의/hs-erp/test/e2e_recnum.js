// 반품 대장: 수량 칸에 글자가 든 줄 (예: 시즌 표기 'C,D/3,4') 때문에 등록이 통째로 막히던 것
//  + 대량 등록에 반품 정리 대장을 넣으면 [정상팀 › 반품 정리 현황] 이 제 자리라고 알려 주는지
const { chromium } = require('playwright'); const X = require('xlsx'); const fs = require('fs');
const URL = 'http://localhost:' + (process.env.PORT || process.argv[2] || 8766) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SH = __dirname + '/shots/'; const FX = __dirname + '/fx/'; fs.mkdirSync(SH, { recursive: true }); fs.mkdirSync(FX, { recursive: true });

// 실제 대장과 같은 모양: 머리글 위에 두 줄 · '시즌 및 복종' 칸에 글자 · 박스수량에 '12박스'
{
  const head = ['No', '반품일자', '항목', '브랜드', '매장명', '시즌별 수량', '박스수량', '사용처', '반품팀 진행 현황', '최종결과'];
  const rows = [
    [1, '2023-03-02', '폐점', '핑', '가매장', 'C,D/3,4', '12박스', '이월', '정리완료', '완료'],
    [2, '2023-03-03', '폐점', '핑', '나매장', 'D1,D2', 9, '이월', '정리완료', '완료'],
    [3, '2023-03-06', '폐점', '링스', '다매장', 1500, 4, '정상', '인계대기', ''],
    [4, '2023-03-07', '폐점', '링스', '라매장', 'A시즌 이하', 2, '정상', '정리중', ''],
  ];
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['2023년 매장 폐점 수시반품 대장'], []].concat([head]).concat(rows)), '폐점반품_OPEN,홀딩해체');
  X.writeFile(wb, FX + 'rec_num.xlsx');
}

(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1480, height: 1050 } }); const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo');
  await pg.waitForSelector('#body'); await pg.waitForTimeout(1500);
  await pg.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));
  await pg.goto(URL + '#/upload'); await pg.waitForSelector('#drop'); await pg.waitForTimeout(1200);
  await pg.setInputFiles('#fi', FX + 'rec_num.xlsx');
  await pg.waitForFunction(() => /인식 결과|인식된 시트가 없습니다/.test(document.querySelector('#res').textContent), null, { timeout: 60000 });
  await pg.waitForTimeout(1500);
  let r = (await pg.textContent('#res')).replace(/\s+/g, ' ');
  ok(/폐점/.test(r), '폐점 반품 대장으로 알아봄 · ' + r.slice(0, 90));
  ok(/반품 정리 대장이네요/.test(r) && /반품 정리 현황/.test(r), '[정상팀 › 반품 정리 현황] 이 제 자리라고 알려 줌');
  const chk = await pg.$$eval('#res input[data-i]', (x) => x.map((e) => e.checked));
  ok(chk.length > 0 && chk.every((c) => !c), '기본 체크가 꺼져 있음 (같은 자료가 두 군데 들어가지 않게)');
  await pg.screenshot({ path: SH + 'rn1_notice.png', fullPage: true });

  // 그래도 넣겠다고 체크를 켜면 — 오류 없이 등록되어야 한다 (예전에는 numeric 오류로 통째로 막혔음)
  await pg.click('#res input[data-i]'); await pg.waitForTimeout(600);
  await pg.click('#go');
  await pg.waitForFunction(() => /등록 완료|등록 중 오류/.test(document.querySelector('#prog').textContent), null, { timeout: 60000 });
  await pg.waitForTimeout(1500);
  r = (await pg.textContent('#prog')).replace(/\s+/g, ' ');
  ok(/등록 완료/.test(r) && !/오류/.test(r), '수량 칸에 글자가 있어도 등록됨 · ' + r.slice(0, 80));
  ok(!/invalid input syntax/.test(r), "'invalid input syntax for type numeric' 오류 없음");

  const got = await pg.evaluate(async () => (await HS.db.list('erp_records', { eq: { kind: 'close_return' } })).filter((x) => String(x.rec_date || '').slice(0, 4) === '2023').map((x) => ({ d: x.rec_date, q: x.qty, raw: JSON.stringify(x.data || {}) })));
  ok(got.length === 4, '4줄 다 들어감 (' + got.length + ')');
  const g1 = got.find((x) => x.d === '2023-03-02');
  ok(!!g1 && g1.q == null, "글자가 든 줄은 수량을 비워 둠 ('C,D/3,4')");
  ok(!!g1 && /C,D\/3,4/.test(g1.raw), '원본 글자는 자료에 그대로 남음');
  const g2 = got.find((x) => x.d === '2023-03-06');
  ok(!!g2 && g2.q === 1500, '숫자인 줄은 그대로 수량으로 (1500 · 실제 ' + (g2 || {}).q + ')');
  console.log(JSON.stringify(got));
  // 뒤 점검에 영향 없게 치움
  await pg.evaluate(async () => { for (const x of await HS.db.list('erp_records', { eq: { kind: 'close_return' } })) if (String(x.rec_date || '').slice(0, 4) === '2023') await HS.db.remove('erp_records', { source_key: x.source_key }).catch(() => {}); });

  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); if (errs.length) process.exitCode = 1;
  await b.close();
})();
