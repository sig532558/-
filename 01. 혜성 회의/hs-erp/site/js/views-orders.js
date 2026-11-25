/* 아침 출고지시 취합 · 브랜드 관리 */
(function () {
  'use strict';
  const { esc, fmt, today, addDays, dow } = HS;
  const P2 = window.HSParsers2;
  const pctS = (a, b) => (a == null || !b ? '-' : ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%');
  const pcls = (a, b) => (a == null || !b ? 'mute' : a >= b ? 'pos' : 'neg');
  const sum = (a, f) => a.reduce((x, r) => x + (+f(r) || 0), 0);
  const ownerOf = (name) => { const b = (HS.cache.brandMap || {})[name]; const o = (b && b.owner) || ''; return /LX/i.test(o) ? 'LX' : /크리스/.test(o) ? '크리스' : o || '기타'; };
  HS.ownerOf = ownerOf;

  // ---------- 엑셀 일괄 등록에 출고지시 · KPI 인식 추가 ----------
  function patchParsers() {
    if (!window.HSParsers || HSParsers._p2) return; HSParsers._p2 = true;
    const orig = HSParsers.analyze;
    HSParsers.analyze = function (wb, fileName, opts) {
      if (P2.isKpiBook(wb)) {
        const k = P2.parseKpiBook(wb, HS.brandOf);
        if (!k.team || !k.kpi.length) return [{ sheet: 'Daily KPI Report', kind: 'unknown', label: 'Daily KPI Report (인식 실패)', file: fileName, count: 0, warnings: k.warnings.length ? k.warnings : ['자료를 찾지 못했습니다'], sets: [] }];
        return [{ sheet: 'Daily KPI Report', kind: 'kpi', label: '팀별 KPI · ' + k.team, file: fileName, count: k.kpi.length, warnings: [k.team + ' · ' + k.dates[0] + ' ~ ' + k.dates[k.dates.length - 1] + ' (' + k.dates.length + '일)'].concat(k.warnings), sets: [{ table: 'kpi', rows: k.kpi }, { table: 'kpi_day', rows: k.days }] }];
      }
      const res = orig(wb, fileName, opts);
      return res.map((x) => {
        if (x.kind !== 'unknown') return x;
        const r = P2.parseOrderSheet(x.sheet, wb.Sheets[x.sheet], HS.brandOf);
        if (!r || !r.orders.length) return x;
        return { sheet: x.sheet, kind: 'orders', label: '아침 출고지시 · ' + r.format, file: fileName, count: r.orders.length, warnings: r.warnings, sets: [{ table: 'orders', rows: r.orders }, { table: 'orders_day', rows: r.days }] };
      });
    };
  }
  patchParsers();

  // ================= 브랜드 관리 =================
  // 순서 저장: 1, 2, 3 … 으로 다시 매김 (같은 번호가 있어도 확실히 바뀜)
  async function saveOrder(names) {
    const up = names.map((n, i) => Object.assign({}, HS.cache.brandMap[n], { sort: i + 1 })).filter((b, i) => +HS.cache.brandMap[names[i]].sort !== i + 1);
    if (up.length) await HS.db.upsert('erp_brands', up); await HS.loadRefs(); return up.length;
  }
  // 표시 순서 편집: 끌어서 옮기기 · ▲▼ · 맨 위/맨 아래 · 센터별 보기 → 보고서 · 입력 화면 · 대시보드 브랜드 순서
  HS.brandOrder = async () => {
    await HS.loadRefs();
    let list = HS.cache.brands.slice().sort((a, b) => (+a.sort || 0) - (+b.sort || 0)).map((b) => b.name);
    const f = HS.el('<div><div class="mute" style="font-size:12px;margin-bottom:8px">줄을 <b>끌어서</b> 옮기거나 ▲▼ · ⤒ ⤓ 버튼을 누르세요 · 저장하면 모든 화면에 같은 순서로 나옵니다</div><div class="seg" id="oc" style="margin-bottom:8px"></div><div class="bord"></div></div>');
    let center = '';
    const cs = [['', '전체']].concat((HS.cache.centers || []).map((c) => [c.id, c.name]));
    const segDraw = () => { const w = f.querySelector('#oc'); w.innerHTML = ''; cs.forEach(([v, l]) => { const b = document.createElement('button'); b.textContent = l; if (v === center) b.className = 'on'; b.onclick = () => { center = v; segDraw(); draw(); }; w.appendChild(b); }); };
    const box = f.querySelector('.bord'); let drag = null;
    const draw = () => {
      const vis = list.filter((n) => !center || (HS.cache.brandMap[n].center_id || 'gobaek') === center);
      box.innerHTML = vis.map((n, i) => { const b = HS.cache.brandMap[n]; return '<div class="bo-row' + (b.active === false ? ' off' : '') + '" draggable="true" data-n="' + esc(n) + '"><span class="bo-h">⋮⋮</span><span class="bo-i">' + (i + 1) + '</span><b>' + esc(b.en || n) + '</b><span class="mute" style="font-size:11.5px">' + esc(b.owner || '') + (b.active === false ? ' · 사용 중지' : '') + '</span><span class="sp"></span><button class="btn sm" data-t>⤒</button><button class="btn sm" data-u>▲</button><button class="btn sm" data-d>▼</button><button class="btn sm" data-b>⤓</button></div>'; }).join('');
      const move = (n, to) => { const vis2 = list.filter((x) => !center || (HS.cache.brandMap[x].center_id || 'gobaek') === center); const from = vis2.indexOf(n); to = Math.max(0, Math.min(vis2.length - 1, to)); if (from === to) return; const tgt = vis2[to]; list.splice(list.indexOf(n), 1); const ti = list.indexOf(tgt); list.splice(to > from ? ti + 1 : ti, 0, n); draw(); };
      box.querySelectorAll('.bo-row').forEach((r, i) => { const n = r.dataset.n;
        r.querySelector('[data-t]').onclick = () => move(n, 0); r.querySelector('[data-b]').onclick = () => move(n, 9999); r.querySelector('[data-u]').onclick = () => move(n, i - 1); r.querySelector('[data-d]').onclick = () => move(n, i + 1);
        r.ondragstart = (e) => { drag = n; r.classList.add('drag'); try { e.dataTransfer.setData('text/plain', n); } catch (x) { /* */ } };
        r.ondragend = () => r.classList.remove('drag');
        r.ondragover = (e) => { e.preventDefault(); r.classList.add('over'); }; r.ondragleave = () => r.classList.remove('over');
        r.ondrop = (e) => { e.preventDefault(); r.classList.remove('over'); if (drag && drag !== n) move(drag, i); drag = null; };
      });
    };
    segDraw(); draw();
    const ok = await HS.modal('브랜드 표시 순서 편집', f, [['취소', null], ['순서 저장', true, 'p']], { onOk: async () => { const n = await saveOrder(list); HS.toast(n ? '순서를 저장했습니다 · 모든 화면에 반영' : '바뀐 순서가 없습니다', 'ok'); } });
    if (ok) HS.route();
  };
  const canBrand = () => HS.can('settings', 'edit') || HS.can('orders', 'create');
  async function brandForm(b, opt) {
    b = Object.assign({ active: true, b2b: true, b2c: true, use_returns: true, center_id: 'gobaek', aliases: [] }, b || {});
    const isNew = !b.name; const brands = HS.cache.brands || [];
    const f = HS.el('<div class="form">' +
      '<label class="f">브랜드명 (영문)<input class="in" id="en" placeholder="NEW BRAND"></label>' +
      '<label class="f">기준명 (저장용 · 한글 가능)<input class="in" id="nm" ' + (isNew ? '' : 'disabled') + ' placeholder="비우면 영문명"></label>' +
      '<label class="f">코드 <span class="mute">엑셀 \'1 (PING)\'의 앞 기호</span><input class="in" id="cd" style="max-width:120px"></label>' +
      '<label class="f">화주사<input class="in" id="ow" list="owl"><datalist id="owl">' + [...new Set(brands.map((x) => x.owner).filter(Boolean))].map((o) => '<option value="' + esc(o) + '">').join('') + '</datalist></label>' +
      '<label class="f">센터<select class="in" id="ct">' + (HS.cache.centers || []).map((c) => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') + '</select></label>' +
      '<label class="f">사용 시작일<input class="in" type="date" id="sd"></label>' +
      '<div class="f wide">사용 구분 <span style="display:flex;gap:16px;margin-top:6px"><label><input type="checkbox" id="u1"> B2B 출고지시</label><label><input type="checkbox" id="u2"> B2C 주문</label><label><input type="checkbox" id="u3"> 반품 관리</label></span></div>' +
      '<label class="f wide">다른 이름 <span class="mute">사방넷 · WMS · 엑셀에 다르게 적힌 이름 (쉼표로 구분) → 이 브랜드로 합산</span><input class="in" id="al"></label>' +
      '<label class="f">표시 위치<select class="in" id="ps"><option value="">맨 뒤</option>' + brands.filter((x) => x.name !== b.name).map((x) => '<option value="' + esc(x.name) + '">' + esc(HS.bname(x.name)) + ' 다음</option>').join('') + '</select></label>' +
      '<div class="wide mute" style="font-size:11.5px">변경 내용은 수정 이력에 남습니다. 브랜드는 지우지 않고 \'사용 중지\'로 처리해 지난 자료와 전년 비교를 유지합니다.</div></div>');
    const $ = (id) => f.querySelector('#' + id);
    $('en').value = b.en || opt && opt.en || ''; $('nm').value = b.name || ''; $('cd').value = b.code || ''; $('ow').value = b.owner || ''; $('ct').value = b.center_id || 'gobaek';
    $('sd').value = b.start_date || (isNew ? today() : ''); $('u1').checked = b.b2b !== false; $('u2').checked = b.b2c !== false; $('u3').checked = b.use_returns !== false;
    $('al').value = (b.aliases || []).concat(opt && opt.alias ? [opt.alias] : []).filter((v, i, a) => a.indexOf(v) === i).join(', ');
    return HS.modal(isNew ? '브랜드 추가' : '브랜드 수정 · ' + HS.bname(b.name), f, [['취소', null], ['저장', true, 'p']], {
      onOk: async () => {
        const en = $('en').value.trim(); const name = isNew ? ($('nm').value.trim() || en) : b.name;
        if (!en && !name) throw new Error('브랜드명을 입력하세요');
        if (isNew && brands.some((x) => x.name === name)) throw new Error('이미 있는 브랜드입니다');
        const aliases = $('al').value.split(',').map((x) => x.trim()).filter(Boolean);
        const clash = aliases.concat([en]).map((a) => [a, HS.brandOf(a)]).find(([a, o]) => o && o !== name);
        if (clash) throw new Error("'" + clash[0] + "'은(는) 이미 " + HS.bname(clash[1]) + ' 의 이름입니다');
        let sort = b.sort; const after = $('ps').value;
        if (isNew || after) { const ref = brands.find((x) => x.name === after); sort = ref ? +ref.sort + 0.5 : Math.max(0, ...brands.map((x) => +x.sort || 0)) + 1; }
        const row = { name, en: en || name, code: $('cd').value.trim() || null, owner: $('ow').value.trim() || null, center_id: $('ct').value, start_date: $('sd').value || null, b2b: $('u1').checked, b2c: $('u2').checked, use_returns: $('u3').checked, aliases, sort, active: b.active !== false };
        await HS.db.upsert('erp_brands', [row]);
        // 순서 다시 매기기 (정수)
        await HS.loadRefs();
        const re = HS.cache.brands.slice().sort((x, y) => (+x.sort || 0) - (+y.sort || 0)).map((x, i) => ({ name: x.name, sort: i + 1 })).filter((x) => +HS.cache.brandMap[x.name].sort !== x.sort);
        if (re.length) await HS.db.upsert('erp_brands', re.map((x) => Object.assign({}, HS.cache.brandMap[x.name], { sort: x.sort })));
        await HS.loadRefs(); HS.toast('저장했습니다', 'ok');
      },
    });
  }
  HS.brandForm = brandForm;
  // 브랜드 완전 삭제 (2026-11-13) — 지금까지는 '사용 중지' 뿐이었음. 관리자만 · 아래 자료가 하나도 없을 때만 지울 수 있음
  //  · erp_daily_records 는 rec_key 가 브랜드 기준명 그대로 (b2b · return · carryover · material · parcel · wms 섹션)
  const USAGE_TABLES = [
    ['erp_ret_done', 'brand', '반품 확정 (고백센터)'], ['erp_ret_pend', 'brand', '매장 반품 등록'], ['erp_ret_bag', 'brand', '행낭 · 타택배'],
    ['erp_records', 'brand', '행사 · 재반송 · 불량 · 폐점반품 등 대장'], ['erp_daily_records', 'rec_key', '일일 마감보고'],
    ['erp_cs_daily', 'brand', '전산자료 재고'], ['erp_cs_close', 'brand', '배분LIST 마감'], ['erp_cs_part', 'brand', '전산자료 등록 구간'],
    ['erp_cs_alloc', 'brand', '배분LIST'], ['erp_orders', 'brand', '아침 출고지시 취합'], ['erp_kpi', 'brand', 'KPI'],
    ['erp_np_style', 'brand', '신상품 입고 · 출고 · 정리'], ['erp_supply', 'brand', '소모품 발주'], ['erp_supply_item', 'brand', '소모품 품목'],
  ];
  async function checkBrandUsage(name) {
    const found = [];
    for (const [table, col, label] of USAGE_TABLES) {
      try { const r = await HS.db.list(table, { eq: { [col]: name }, limit: 1, select: col }); if (r && r.length) found.push(label); } catch (e) { /* 그 자료 접근 권한이 없으면 건너뜀 */ }
    }
    return found;
  }
  HS.brandDelete = async (b) => {
    if (!HS.can('settings', 'edit')) { HS.toast('브랜드를 완전히 지우는 것은 관리자만 할 수 있습니다', 'err'); return; }
    HS.toast(HS.bname(b.name) + ' 관련 자료를 확인하는 중…', '');
    const found = await checkBrandUsage(b.name);
    if (found.length) {
      await HS.modal('지울 수 없습니다', '<div style="line-height:1.8"><b>' + esc(HS.bname(b.name)) + '</b> 은(는) 다음 자료에 아직 쓰이고 있어 지우면 지난 기록을 찾을 수 없게 됩니다.<br><br>· ' + found.map(esc).join('<br>· ') + '<br><br>지우는 대신 <b>사용 중지</b>로 두세요. 지난 자료와 전년 비교는 그대로 유지됩니다.</div>', [['확인', null]]);
      return;
    }
    const f = HS.el('<div style="font-size:13px;line-height:1.8"><b>' + esc(HS.bname(b.name)) + '</b>(기준명 \'' + esc(b.name) + '\')을 완전히 지웁니다.<div class="lock ok" style="margin:8px 0;font-size:12.5px">확인한 ' + USAGE_TABLES.length + '개 자료 어디에도 이 브랜드로 저장된 줄이 없습니다.</div><b class="neg">되돌릴 수 없습니다.</b> 확인을 위해 기준명을 그대로 입력하세요<input class="in" id="cn" style="margin-top:6px;width:100%" placeholder="' + esc(b.name) + '"><div class="mute" style="font-size:11.5px;margin-top:8px">· 삭제 기록(누가 · 언제 · 무엇을)은 수정 이력에 남습니다</div></div>');
    const ok = await HS.modal('브랜드 완전 삭제', f, [['취소', null], ['완전히 삭제', true, 'p del']], {
      onOk: async (v, bg) => {
        if (bg.querySelector('#cn').value.trim() !== b.name) throw new Error('기준명이 맞지 않습니다');
        await HS.db.remove('erp_brands', { name: b.name });
        // 센터의 화주사 목록(owners)에서도 빼기 — 같은 화주사를 쓰는 다른 브랜드가 남아 있으면 그대로 둠 (2026-11-13)
        if (b.owner) {
          const stillUsed = (HS.cache.brands || []).some((x) => x.name !== b.name && x.owner === b.owner);
          if (!stillUsed) {
            const cs = (HS.cache.centers || []).filter((c) => (c.owners || []).indexOf(b.owner) >= 0);
            for (const c of cs) await HS.db.upsert('erp_centers', [Object.assign({}, c, { owners: (c.owners || []).filter((x) => x !== b.owner) })]).catch(() => {});
          }
        }
        await HS.loadRefs();
      },
    });
    if (ok) { HS.toast('"' + HS.bname(b.name) + '" 를 완전히 지웠습니다', 'ok'); HS.route(); }
  };
  // 등록 안 된 브랜드 처리: 새로 추가 / 기존 브랜드의 다른 이름으로 연결 / 이번만 기타
  HS.resolveUnknownBrands = async (names, where) => {
    for (const nm of names) {
      if (HS.brandOf(nm)) continue;
      if (!canBrand()) { HS.toast("등록 안 된 브랜드 '" + nm + "' — 관리자에게 브랜드 추가를 요청하세요", 'err'); continue; }
      const f = HS.el('<div><p style="margin:0 0 10px;line-height:1.6">' + esc(where || '') + '에 등록되지 않은 브랜드 <b>\'' + esc(nm) + '\'</b> 가 있습니다.</p><label class="f">기존 브랜드의 다른 이름으로 연결<select class="in" id="to"><option value="">선택…</option>' + HS.activeBrands({ all: true }).map((b) => '<option value="' + esc(b.name) + '">' + esc(HS.bname(b.name)) + '</option>').join('') + '</select></label></div>');
      const v = await HS.modal('새 브랜드 발견', f, [['이번만 기타로', 'skip'], ['다른 이름으로 연결', 'link'], ['새 브랜드로 추가', 'add', 'p']]);
      if (v === 'add') await brandForm(null, { en: nm.replace(/^\s*[0-9A-Za-z]{1,2}\s*\((.+)\)\s*$/, '$1').trim(), alias: nm });
      else if (v === 'link') { const to = f.querySelector('#to').value; if (!to) continue; const b = HS.cache.brandMap[to]; await HS.db.upsert('erp_brands', [Object.assign({}, b, { aliases: (b.aliases || []).concat([nm]) })]); await HS.loadRefs(); HS.toast(nm + ' → ' + HS.bname(to) + ' 연결', 'ok'); }
    }
  };
  async function brandAdmin(body) {
    await HS.loadRefs();
    const ed = canBrand(); const canDel = HS.can('settings', 'edit'); const showOff = HS.params().off === '1';
    const rows = HS.cache.brands.slice().sort((a, b) => (+a.sort || 0) - (+b.sort || 0)).filter((b) => showOff || b.active !== false);
    const c = HS.el('<div class="card"><h3>브랜드 목록 <small>여기서 바꾸면 출고지시 · KPI · 신상품 · 마감보고 · 반품 · 대시보드에 모두 반영 · ▲▼로 순서 변경 (보고서 순서)</small><span class="sp"></span></h3><div class="tw rt"></div></div>');
    const h3 = c.querySelector('h3');
    const off = HS.el('<label class="mute" style="font-size:12px;font-weight:400"><input type="checkbox"' + (showOff ? ' checked' : '') + '> 사용 중지 브랜드 보기</label>'); off.querySelector('input').onchange = (e) => HS.go('settings', Object.assign({ k: 'brands' }, e.target.checked ? { off: '1' } : {})); h3.appendChild(off);
    if (ed) { const o = HS.el('<button class="btn sm" id="bord" style="margin-left:8px">↕ 표시 순서 편집</button>'); o.onclick = () => HS.brandOrder(); h3.appendChild(o); const a = HS.el('<button class="btn p sm" style="margin-left:6px">＋ 브랜드 추가</button>'); a.onclick = async () => { if (await brandForm()) HS.route(); }; h3.appendChild(a); }
    const on = (v) => (v !== false ? '<span class="pos">●</span>' : '<span class="mute">○</span>');
    c.querySelector('.tw').innerHTML = '<table><tr><th></th><th>브랜드</th><th>기준명</th><th>코드</th><th>화주사</th><th>센터</th><th>B2B</th><th>B2C</th><th>반품</th><th>다른 이름</th><th>사용 기간</th><th>상태</th><th></th></tr>' +
      rows.map((b, i) => '<tr data-n="' + esc(b.name) + '"' + (b.active === false ? ' class="mute"' : '') + '><td data-l="순서">' + (ed ? '<button class="btn sm" data-up="' + i + '">▲</button><button class="btn sm" data-dn="' + i + '">▼</button>' : i + 1) + '</td><td data-l="브랜드"><b>' + esc(b.en || b.name) + '</b>' + (b.start_date && b.start_date > addDays(today(), -60) ? ' <span class="tag k">신규</span>' : '') + '</td><td data-l="기준명">' + esc(b.name) + '</td><td data-l="코드">' + esc(b.code || '') + '</td><td data-l="화주사">' + esc(b.owner || '') + '</td><td data-l="센터">' + esc(((HS.cache.centers || []).find((x) => x.id === b.center_id) || {}).name || '') + '</td><td data-l="B2B">' + on(b.b2b) + '</td><td data-l="B2C">' + on(b.b2c) + '</td><td data-l="반품">' + on(b.use_returns) + '</td><td data-l="다른 이름" class="wrap">' + (b.aliases || []).map((a) => '<span class="tag">' + esc(a) + '</span>').join(' ') + '</td><td data-l="기간">' + esc((b.start_date || '') + ' ~ ' + (b.end_date || '')) + '</td><td data-l="상태">' + (b.active === false ? '사용 중지' : '<span class="pos">사용</span>') + '</td><td>' + (ed ? '<button class="btn sm" data-ed>수정</button> <button class="btn sm" data-off>' + (b.active === false ? '다시 사용' : '사용 중지') + '</button>' : '') + (canDel && b.active === false ? ' <button class="btn sm" data-del>완전히 삭제</button>' : '') + '</td></tr>').join('') + '</table>';
    c.querySelector('.tw').insertAdjacentHTML('afterend', '<div class="mute" style="font-size:11.5px;margin-top:8px;line-height:1.6">· <b>삭제 대신 사용 중지</b>: 입력 화면에서는 숨기고, 지난 자료와 전년 비교는 그대로 유지 · 새 브랜드는 전년 값이 없어 증감률 대신 \'신규\' 표시<br>· 사방넷 · KPI · WMS 파일에 모르는 브랜드가 있으면 올릴 때 바로 \'새 브랜드 추가 / 다른 이름 연결\'을 물어봅니다<br>· <b>완전히 삭제</b>는 사용 중지 상태에서 반품 · 일일마감 · 신상품 등 관련 자료가 하나도 없을 때만 할 수 있고 관리자만 보입니다. 자료가 있으면 눌러도 지울 수 없다고 알려 주고 막습니다</div>');
    body.innerHTML = ''; body.appendChild(c);
    if (!ed) return;
    const swap = async (i, j) => { if (j < 0 || j >= rows.length) return; const all = HS.cache.brands.slice().sort((a, b) => (+a.sort || 0) - (+b.sort || 0)); const ia = all.indexOf(rows[i]), ib = all.indexOf(rows[j]); [all[ia], all[ib]] = [all[ib], all[ia]]; try { await saveOrder(all.map((x) => x.name)); HS.route(); } catch (e) { HS.err(e); } };
    c.querySelectorAll('[data-up]').forEach((x) => (x.onclick = () => swap(+x.dataset.up, +x.dataset.up - 1)));
    c.querySelectorAll('[data-dn]').forEach((x) => (x.onclick = () => swap(+x.dataset.dn, +x.dataset.dn + 1)));
    c.querySelectorAll('[data-ed]').forEach((x) => (x.onclick = async () => { if (await brandForm(HS.cache.brandMap[x.closest('tr').dataset.n])) HS.route(); }));
    c.querySelectorAll('[data-off]').forEach((x) => (x.onclick = async () => { const b = HS.cache.brandMap[x.closest('tr').dataset.n]; const stop = b.active !== false; if (!(await HS.confirm(HS.bname(b.name) + (stop ? ' 사용을 중지할까요?<br>입력 화면에서 숨기고 지난 자료는 유지합니다.' : ' 을(를) 다시 사용할까요?')))) return; try { await HS.db.upsert('erp_brands', [Object.assign({}, b, { active: !stop, end_date: stop ? today() : null })]); await HS.loadRefs(); HS.route(); } catch (e) { HS.err(e); } }));
    c.querySelectorAll('[data-del]').forEach((x) => (x.onclick = () => HS.brandDelete(HS.cache.brandMap[x.closest('tr').dataset.n])));
  }
  // 기준정보 설정 > 브랜드 탭을 새 화면으로 (2026-11-13: 기본값 · 탭 목록이 실제 화면과 달라 늘 옛 화면으로 빠지던 것 고침 —
  //  원래 화면의 기본 탭은 'teams'가 아니라 'brands'이고, 팀·인건비/공정단가는 2026-11-11부터 [원가관리 설정]으로 옮겨서 이 탭 줄에 없음)
  const sv = HS.views.settings;
  if (sv) {
    const orig = sv.render;
    sv.render = async (body, p, tools) => {
      if ((p.k || 'brands') !== 'brands' || p.k === 'teams' || p.k === 'prices') return orig(body, p, tools);
      tools.appendChild(HS.seg([['brands', '브랜드'], ['style', '품번 규칙'], ['inbound', '입고대행 단가'], ['sec', '보안'], ['conn', '연결']], 'brands', (k) => HS.go('settings', { k })));
      tools.appendChild(HS.el('<a class="btn" href="#/costset">원가관리 설정 (업무 · 단가 · 인건비)</a>'));
      return brandAdmin(body);
    };
  }

  // ================= 아침 출고지시 취합 =================
  async function loadDay(d) {
    const [rows, dayArr, lock] = await Promise.all([HS.db.list('erp_orders', { eq: { rec_date: d } }), HS.db.list('erp_orders_day', { eq: { rec_date: d } }), HS.lockState(d, 'orders')]);
    const day = dayArr[0] || null;
    const auto = addDays(d, -364);
    const cmp = (day && day.cmp_date) || auto;
    const usePrevSheet = day && day.prev && !day.cmp_date; // 엑셀에서 넘어온 당시 전년값
    const prevRows = await HS.db.list('erp_orders', { eq: { rec_date: cmp } });
    const P = { sale: {}, pre: {}, b2c: {}, b2cQty: null, b2cCnt: null, src: usePrevSheet ? '엑셀 기록값' : (day && day.cmp_date ? '직접 지정' : '같은 요일 자동') };
    if (usePrevSheet) { Object.assign(P.sale, day.prev.sale || {}); Object.assign(P.pre, day.prev.pre || {}); P.b2cQty = day.prev.b2c_qty != null ? day.prev.b2c_qty : null; }
    else { prevRows.forEach((r) => { if (r.section === 'sale') P.sale[r.brand] = r.qty; if (r.section === 'pre') P.pre[r.brand] = r.qty; }); }
    prevRows.forEach((r) => { if (r.section === 'b2c') P.b2c[r.brand] = r; });
    const pch = prevRows.filter((r) => r.section === 'b2c_ch');
    if (P.b2cQty == null && pch.length) { P.b2cQty = sum(pch, (r) => r.qty); P.b2cCnt = sum(pch, (r) => r.cnt); }
    if (day && day.b2c_prev_qty != null) P.b2cQty = day.b2c_prev_qty;
    const T = { sale: {}, pre: {}, note: {}, b2c: {}, ch: {}, src: {} };
    rows.forEach((r) => { if ((r.section === 'sale' || r.section === 'pre') && r.src_qty != null) T.src[r.section + '|' + r.brand] = { src: +r.src_qty, manual: !!r.manual, qty: r.qty }; if (r.section === 'sale') T.sale[r.brand] = r.qty; if (r.section === 'pre') { T.pre[r.brand] = r.qty; if (r.note) T.note[r.brand] = r.note; } if (r.section === 'b2c') T.b2c[r.brand] = r; if (r.section === 'b2c_ch') T.ch[r.brand] = r; });
    return { d, day, cmp, auto, P, T, lock, rows };
  }
  function totals(X) {
    const s = (o) => Object.values(o).reduce((a, v) => a + (+v || 0), 0);
    const sale = s(X.T.sale), pre = s(X.T.pre), psale = s(X.P.sale), ppre = s(X.P.pre);
    const ch = Object.values(X.T.ch); const b2cCnt = sum(ch, (r) => r.cnt), b2cQty = sum(ch, (r) => r.qty);
    return { sale, pre, b2b: sale + pre, psale, ppre, pb2b: psale + ppre, b2cCnt, b2cQty, pb2c: X.P.b2cQty };
  }
  // B2B 브랜드 목록: 사용 중 + 오늘/전년 값이 있는 브랜드
  function b2bBrands(X) {
    const have = new Set(Object.keys(X.T.sale).concat(Object.keys(X.T.pre), Object.keys(X.P.sale), Object.keys(X.P.pre)));
    const act = HS.activeBrands({ center: 'gobaek', date: X.d, use: 'b2b' }).map((b) => b.name);
    const order = HS.cache.brands.slice().sort((a, b) => (+a.sort || 0) - (+b.sort || 0)).map((b) => b.name);
    return order.filter((n) => (act.indexOf(n) >= 0 && !/로라|용품/.test(n)) || have.has(n)).concat([...have].filter((n) => order.indexOf(n) < 0));
  }

  HS.view('orders', {
    title: '아침 출고지시 취합', perm: 'orders',
    async render(body, p, tools) {
      const d = p.d || today();
      tools.appendChild(HS.dateNav(d, (x) => HS.go('orders', { d: x })));
      const X = await loadDay(d);
      const lockedForMe = X.lock && !HS.can('orders', 'unlock');
      const canW = (HS.can('orders', 'edit') || HS.can('orders', 'create')) && !lockedForMe;
      const bx = HS.el('<span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-x>엑셀 내려받기</button><button class="btn" data-i2>엑셀형 이미지</button><button class="btn gd" data-i1>카톡용 이미지</button>' + (HS.can('orders', 'create') ? '<button class="btn" data-imp>과거 엑셀 불러오기</button>' : '') + '</span>');
      tools.appendChild(bx);
      body.innerHTML = '';
      // 비교일
      const cmpBar = HS.el('<div class="lock ok" style="margin-bottom:12px"><b>전년 비교일</b> <span>' + X.cmp + ' (' + dow(X.cmp) + ')</span><span class="mute">· ' + esc(X.P.src) + (X.P.src !== '같은 요일 자동' ? ' (자동이면 ' + X.auto + ')' : '') + '</span><span class="sp"></span>' + (canW ? '<input type="date" class="in" style="width:150px;padding:4px 8px" id="cmpd"><button class="btn sm" id="cmpS">비교일 변경</button>' + (X.day && (X.day.cmp_date || X.day.prev) ? '<button class="btn sm" id="cmpA">같은 요일 자동으로</button>' : '') : '') + '</div>');
      body.appendChild(cmpBar);
      if (canW) {
        cmpBar.querySelector('#cmpd').value = X.cmp;
        cmpBar.querySelector('#cmpS').onclick = async () => { const v = cmpBar.querySelector('#cmpd').value; if (!v) return; try { await HS.db.upsert('erp_orders_day', [{ rec_date: d, cmp_date: v }]); HS.route(); } catch (e) { HS.err(e); } };
        const a = cmpBar.querySelector('#cmpA'); if (a) a.onclick = async () => { try { await HS.db.upsert('erp_orders_day', [{ rec_date: d, cmp_date: null, prev: null }]); HS.route(); } catch (e) { HS.err(e); } };
      }
      body.appendChild(HS.lockBar(d, 'orders', X.lock, () => HS.route()));
      const t = totals(X);
      const k = HS.el('<div class="kpis" style="margin:12px 0"></div>');
      const kp = (l, v, pv, s2) => '<div class="card kpi"><div class="l">' + l + '</div><div class="v">' + v + (pv != null ? ' <span class="mute" style="font-size:14px">/ ' + fmt(pv) + '</span>' : '') + '</div><div class="s ' + (s2 ? '' : '') + '">' + (s2 || '') + '</div></div>';
      k.innerHTML = kp('B2B 판매분 (금일 / 전년)', fmt(t.sale), t.psale, '<span class="' + pcls(t.sale, t.psale) + '">' + pctS(t.sale, t.psale) + '</span>') + kp('선지시 (금일 / 전년)', fmt(t.pre), t.ppre, '<span class="' + pcls(t.pre, t.ppre) + '">' + pctS(t.pre, t.ppre) + '</span>') + kp('B2B 합계 (금일 / 전년)', fmt(t.b2b), t.pb2b, '<span class="' + pcls(t.b2b, t.pb2b) + '">' + pctS(t.b2b, t.pb2b) + '</span>') + kp('B2C 주문 (건수 · 수량 / 전년 수량)', fmt(t.b2cCnt) + '건 · ' + fmt(t.b2cQty), t.pb2c, '<span class="' + pcls(t.b2cQty, t.pb2c) + '">' + pctS(t.b2cQty, t.pb2c) + '</span>');
      body.appendChild(k);
      const row2 = HS.el('<div class="row" style="display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:14px;align-items:start"></div>'); body.appendChild(row2);
      // ---- B2B ----
      const names = b2bBrands(X);
      const rows = names.map((n) => ({ key: n, label: HS.bname(n), data: { psale: X.P.sale[n] != null ? X.P.sale[n] : null, sale: X.T.sale[n] != null ? X.T.sale[n] : null, ppre: X.P.pre[n] != null ? X.P.pre[n] : null, pre: X.T.pre[n] != null ? X.T.pre[n] : null, note: X.T.note[n] || '' } }));
      const show = (v) => (v == null ? '<span class="mute">-</span>' : fmt(v));
      const g = HS.grid({
        keyLabel: '브랜드', editable: canW, total: true, rows,
        cols: [
          { k: 'psale', l: '전년 판매', t: 'auto', f: (r) => r.psale, show },
          { k: 'sale', l: '금일 판매' },
          { k: 'dsale', l: '증감', t: 'auto', noSum: true, f: (r) => (r.sale == null || r.psale == null ? null : r.sale - r.psale), show: (v, r) => (r.psale == null && r.sale != null ? '<span class="tag k">신규</span>' : '<span class="' + pcls(r.sale, r.psale) + '">' + pctS(r.sale, r.psale) + '</span>') },
          { k: 'ppre', l: '전년 선지시', t: 'auto', f: (r) => r.ppre, show },
          { k: 'pre', l: '금일 선지시' },
          { k: 'note', l: '비고', t: 'text' },
        ],
        onChange: (n) => { const b = c1.querySelector('#sv1'); if (b) b.textContent = '저장 (' + n + ')'; },
        // 금일 판매를 먼저 넣고 금일 선지시를 넣으면 → 금일 판매 = 판매 − 선지시 (선지시를 고치면 차이만큼 다시 계산)
        onCell: (k, v, old, r, set) => { if (k !== 'pre' || r.sale == null) return; const nv = r.sale - ((v || 0) - (old || 0)); set('sale', Math.max(0, nv)); },
      });
      const c1 = HS.el('<div class="card"><h3>① B2B 브랜드별 출고 지시 <small>' + (canW ? '금일 칸만 입력 · 전년은 자동 · 엑셀에서 복사해 붙여넣기 가능 · <b>금일 판매 입력 후 금일 선지시를 넣으면 판매에서 자동으로 빠짐</b>' : '읽기 전용') + '</small></h3></div>');
      // 전산자료(WMS 출고지시)로 채운 칸 · 손으로 고친 칸 표시
      const srcK = Object.keys(X.T.src);
      if (srcK.length) {
        const man = srcK.filter((x) => X.T.src[x].manual);
        const sb0 = HS.el('<div class="lock ' + (man.length ? 'warn' : 'ok') + '" style="margin-bottom:8px;font-size:12.5px"><span><b>전산자료</b> WMS 출고지시 파일 값으로 채움 · <a href="#/cs?k=order&t=B2B&d=' + d + '">파일 보기</a>' + (man.length ? ' · <b>손 수정 ' + man.length + '칸</b>: ' + man.map((x) => { const [sec, b] = x.split('|'); return esc(HS.bname(b)) + ' ' + (sec === 'sale' ? '판매' : '선지시') + ' ' + fmt(X.T.src[x].qty) + ' <span class="mute">(WMS ' + fmt(X.T.src[x].src) + ')</span>'; }).join(', ') : ' · 손 수정 없음') + '</span><span class="sp"></span>' + (canW && man.length ? '<button class="btn sm" id="rvt">파일 값으로 되돌리기</button>' : '') + '</div>');
        c1.appendChild(sb0);
        const rv = sb0.querySelector('#rvt'); if (rv) rv.onclick = async () => { if (!(await HS.confirm('손으로 고친 ' + man.length + '칸을 WMS 파일 값으로 되돌릴까요?'))) return; try { await HS.db.upsert('erp_orders', man.map((x) => { const [sec, b] = x.split('|'); return { rec_date: d, section: sec, brand: b, qty: X.T.src[x].src, manual: false }; })); HS.toast('되돌렸습니다', 'ok'); HS.route(); } catch (e) { HS.err(e); } };
      }
      c1.appendChild(g.el);
      if (canW) { const sb = HS.el('<div style="margin-top:10px;display:flex;gap:8px;align-items:center"><button class="btn p" id="sv1">저장</button><span class="mute" style="font-size:11.5px">0과 빈칸은 다르게 저장됩니다 (빈칸 = 지시 없음)</span></div>'); c1.appendChild(sb); sb.querySelector('#sv1').onclick = async () => { const ch = g.changed(); if (!ch.length) return HS.toast('바뀐 내용이 없습니다'); const up = []; const mf = (sec, k, v) => { const s0 = X.T.src[sec + '|' + k]; return s0 ? { manual: v !== s0.src } : {}; }; ch.forEach((r) => { up.push(Object.assign({ rec_date: d, section: 'sale', brand: r.key, qty: r.data.sale }, mf('sale', r.key, r.data.sale))); up.push(Object.assign({ rec_date: d, section: 'pre', brand: r.key, qty: r.data.pre, note: r.data.note || null }, mf('pre', r.key, r.data.pre))); }); try { await HS.db.upsert('erp_orders', up); g.clear(); HS.toast('저장했습니다', 'ok'); HS.route(); } catch (e) { HS.err(e); } }; }
      row2.appendChild(c1);
      // ---- B2C ----
      const c2 = HS.el('<div class="card"><h3>② B2C 브랜드별 고객 주문 <small>사방넷 파일은 이 PC에서 계산만 하고 원본(이름·전화·주소)은 저장하지 않음</small></h3></div>');
      row2.appendChild(c2);
      let parsed = null; // {brands:{}, owners:{}}
      if (canW) {
        const dz = HS.el('<div class="drop" style="padding:14px"><b>사방넷 주문 파일 놓기</b> (크리스 · LX, 여러 개 가능) ' + HS.fmtLink('cs_sabang') + '<div class="mute" style="font-size:11.5px;margin-top:4px">배송지 기준 건수 · 주문수량 합계 · 주문확인 포함 / 취소·반품 제외</div><input type="file" multiple accept=".xlsx,.xls,.csv" class="hide"><div class="res" style="margin-top:6px"></div></div>');
        c2.appendChild(dz);
        const fi = dz.querySelector('input'); const res = dz.querySelector('.res');
        dz.onclick = (e) => { if (e.target === fi) return; fi.click(); };
        dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
        const handle = async (files) => {
          res.innerHTML = '계산 중…'; const acc = { brands: {}, owners: {}, files: [], unknown: [] };
          for (const f of files) {
            try {
              HS.needXlsx(); const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' });
              let hit = false;
              for (const n of wb.SheetNames) {
                const r = P2.parseSabang(wb.Sheets[n], HS.brandOf, ownerOf); if (!r) continue; hit = true;
                for (const b in r.brands) { const x = acc.brands[b] || (acc.brands[b] = { cnt: 0, qty: 0 }); x.cnt += r.brands[b].cnt; x.qty += r.brands[b].qty; }
                for (const o in r.owners) { const x = acc.owners[o] || (acc.owners[o] = { cnt: 0, qty: 0 }); x.cnt += r.owners[o].cnt; x.qty += r.owners[o].qty; }
                acc.unknown.push(...r.unknown); acc.files.push(f.name + ' · ' + n + ' ' + fmt(r.lines) + '줄');
              }
              if (!hit) acc.files.push(f.name + ' — 사방넷 주문 양식이 아님');
              for (const k in wb.Sheets) delete wb.Sheets[k];
            } catch (e) { acc.files.push(f.name + ' 읽기 실패: ' + e.message); }
          }
          if (acc.unknown.length) { await HS.resolveUnknownBrands([...new Set(acc.unknown)], '사방넷 파일'); return HS.toast('브랜드를 정리했습니다. 파일을 다시 올려 주세요'); }
          parsed = acc; res.innerHTML = acc.files.map((x) => '<div class="pos">✔ ' + esc(x) + '</div>').join('') + Object.entries(acc.owners).map(([o, v]) => '<b>' + esc(o) + '</b> ' + fmt(v.cnt) + '건 · ' + fmt(v.qty) + '개').join(' &nbsp; ');
          drawB2C();
        };
        fi.onchange = () => handle([...fi.files]);
        dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); handle([...e.dataTransfer.files]); };
      }
      const b2cWrap = HS.el('<div></div>'); c2.appendChild(b2cWrap);
      function drawB2C() {
        const B = parsed ? parsed.brands : Object.fromEntries(Object.entries(X.T.b2c).map(([b, r]) => [b, { cnt: r.cnt, qty: r.qty }]));
        const CH = parsed ? Object.assign({}, parsed.owners) : Object.fromEntries(Object.entries(X.T.ch).map(([b, r]) => [b, { cnt: r.cnt, qty: r.qty }]));
        const adm = X.T.ch['어드민'] || {}; if (parsed) CH['어드민'] = { cnt: adm.cnt, qty: adm.qty };
        const order = HS.cache.brands.slice().sort((a, b) => (+a.sort || 0) - (+b.sort || 0)).map((b) => b.name);
        const bn = Object.keys(B).sort((a, b) => (ownerOf(a) + (order.indexOf(a) + 1000)).localeCompare(ownerOf(b) + (order.indexOf(b) + 1000)));
        const chList = ['크리스', 'LX'].concat(Object.keys(CH).filter((x) => ['크리스', 'LX', '어드민'].indexOf(x) < 0));
        const tc = sum(Object.values(CH), (v) => v.cnt), tq = sum(Object.values(CH), (v) => v.qty);
        const pv = (b) => (X.P.b2c[b] ? X.P.b2c[b].qty : null);
        b2cWrap.innerHTML = '<div class="tw rt" style="margin-top:8px"><table><tr><th>구분</th><th>브랜드</th><th class="n">건수<br><small>배송지</small></th><th class="n">수량</th><th class="n">전년 수량</th><th class="n">증감</th></tr>' +
          (bn.length ? bn.map((b) => '<tr><td data-l="구분"><span class="tag b">' + esc(ownerOf(b)) + '</span></td><td data-l="브랜드">' + esc(HS.bname(b)) + '</td><td class="n" data-l="건수">' + fmt(B[b].cnt) + '</td><td class="n" data-l="수량">' + fmt(B[b].qty) + '</td><td class="n mute" data-l="전년">' + (pv(b) == null ? '-' : fmt(pv(b))) + '</td><td class="n" data-l="증감">' + (pv(b) == null ? '<span class="mute">-</span>' : '<span class="' + pcls(B[b].qty, pv(b)) + '">' + pctS(B[b].qty, pv(b)) + '</span>') + '</td></tr>').join('') : '<tr><td colspan="6" class="mute">브랜드별 자료 없음 — 사방넷 파일을 올리면 채워집니다</td></tr>') +
          chList.map((o) => (CH[o] ? '<tr class="tot"><td data-l="채널">' + esc(o) + '</td><td>채널 합계</td><td class="n">' + fmt(CH[o].cnt) + '</td><td class="n">' + fmt(CH[o].qty) + '</td><td></td><td></td></tr>' : '')).join('') +
          '<tr><td data-l="채널"><span class="tag y">어드민</span></td><td>수기 입력</td><td class="n">' + (canW ? '<input class="cell" id="adc" inputmode="decimal" style="width:80px">' : fmt(adm.cnt)) + '</td><td class="n">' + (canW ? '<input class="cell" id="adq" inputmode="decimal" style="width:80px">' : fmt(adm.qty)) + '</td><td></td><td></td></tr>' +
          '<tr class="tot"><td colspan="2">합계</td><td class="n">' + fmt(tc) + '</td><td class="n">' + fmt(tq) + '</td><td class="n">' + (canW ? '<input class="cell" id="pq" inputmode="decimal" style="width:80px" title="전년 B2C 수량 (자동 값이 없을 때 직접 입력)">' : fmt(X.P.b2cQty)) + '</td><td class="n"><span class="' + pcls(tq, X.P.b2cQty) + '">' + pctS(tq, X.P.b2cQty) + '</span></td></tr></table></div>' +
          '<div class="mute" style="font-size:11.5px;margin-top:6px;line-height:1.6">· 건수 합계는 여러 브랜드를 함께 주문한 배송지를 1건으로 셉니다 (브랜드별 건수 합보다 작을 수 있음)<br>· 전년 수량: ' + (X.P.b2cQty != null ? esc(X.P.src) : '자료 없음 — 물동량 현황 연결 전에는 직접 입력') + '</div>' +
          (canW ? '<div style="margin-top:10px"><button class="btn p" id="sv2">B2C 저장</button></div>' : '');
        if (!canW) return;
        const $ = (id) => b2cWrap.querySelector('#' + id);
        if (adm.cnt != null) $('adc').value = adm.cnt; if (adm.qty != null) $('adq').value = adm.qty; if (X.day && X.day.b2c_prev_qty != null) $('pq').value = X.day.b2c_prev_qty; else if (X.P.b2cQty != null) $('pq').placeholder = fmt(X.P.b2cQty);
        $('sv2').onclick = async () => {
          const n = (v) => (v.trim() === '' ? null : Number(v.replace(/,/g, '')));
          const up = [];
          if (parsed) {
            const keys = new Set(Object.keys(parsed.brands).concat(Object.keys(X.T.b2c)));
            keys.forEach((b) => up.push({ rec_date: d, section: 'b2c', brand: b, cnt: parsed.brands[b] ? parsed.brands[b].cnt : null, qty: parsed.brands[b] ? parsed.brands[b].qty : null }));
            const ok = new Set(Object.keys(parsed.owners).concat(Object.keys(X.T.ch).filter((x) => x !== '어드민')));
            ok.forEach((o) => up.push({ rec_date: d, section: 'b2c_ch', brand: o, cnt: parsed.owners[o] ? parsed.owners[o].cnt : null, qty: parsed.owners[o] ? parsed.owners[o].qty : null }));
          }
          up.push({ rec_date: d, section: 'b2c_ch', brand: '어드민', cnt: n($('adc').value), qty: n($('adq').value) });
          try {
            await HS.db.upsert('erp_orders', up);
            const pq = n($('pq').value); if (pq !== ((X.day && X.day.b2c_prev_qty) != null ? X.day.b2c_prev_qty : null)) await HS.db.upsert('erp_orders_day', [{ rec_date: d, b2c_prev_qty: pq }]);
            HS.toast('B2C 저장했습니다', 'ok'); HS.route();
          } catch (e) { HS.err(e); }
        };
      }
      drawB2C();
      // ---- 보고서 ----
      bx.querySelector('[data-i1]').onclick = () => report(X, 'kakao').catch(HS.err);
      bx.querySelector('[data-i2]').onclick = () => report(X, 'xls').catch(HS.err);
      bx.querySelector('[data-x]').onclick = () => excel(X);
      const im = bx.querySelector('[data-imp]'); if (im) im.onclick = () => HS.go('upload', { only: '' });
      HS.live(['erp_orders', 'erp_orders_day', 'erp_locks'], () => { if (HS.cur === 'orders' && !g.changed().length && !parsed) HS.route(); });
    },
  });

  // ---------- 보고서 데이터 ----------
  function repData(X) {
    const names = b2bBrands(X);
    const b2b = names.map((n) => { const ps = X.P.sale[n], s = X.T.sale[n], pp = X.P.pre[n], p = X.T.pre[n]; return { n, ps, s, pp, p, pt: ps == null && pp == null ? null : (ps || 0) + (pp || 0), t: s == null && p == null ? null : (s || 0) + (p || 0), note: X.T.note[n] || '', any: [ps, s, pp, p].some((v) => v != null) }; }).filter((r) => r.any);
    const b2c = Object.entries(X.T.b2c).filter(([, r]) => r.qty != null).map(([n, r]) => ({ n, cnt: r.cnt, qty: r.qty })).sort((a, b) => b.qty - a.qty);
    const ch = X.T.ch; const t = totals(X);
    return { b2b, b2c, ch, t };
  }
  async function report(X, kind) {
    const R = repData(X); const d = X.d; const t = R.t;
    const md = (+d.slice(5, 7)) + '월 ' + (+d.slice(8)) + '일 (' + dow(d) + ')';
    const chTxt = ['크리스', 'LX', '어드민'].filter((o) => R.ch[o]).map((o) => o + ' ' + fmt(R.ch[o].cnt) + '건 · ' + fmt(R.ch[o].qty) + '개').join(' / ');
    const notes = R.b2b.filter((r) => r.note).map((r) => HS.bname(r.n) + ' ' + r.note);
    let html;
    if (kind === 'kakao') {
      const top = R.b2b.slice().sort((a, b) => (b.t || 0) + (b.pt || 0) - ((a.t || 0) + (a.pt || 0))); const main = top.slice(0, 6), rest = top.slice(6);
      const line = (l, pv, v) => '<tr><td>' + l + '</td><td class="n mute">' + fmt(pv) + '</td><td class="n">' + fmt(v) + '</td><td class="n ' + pcls(v, pv) + '">' + (pv ? pctS(v, pv) : (v ? '신규' : '-')) + '</td></tr>';
      const bc = R.b2c.slice(0, 5), br = R.b2c.slice(5);
      html = '<div class="rep-k"><div class="hd"><div class="s">혜성물류 · 아침 출고지시 현황</div><div class="t">' + md + '</div><div class="d">전년 비교: ' + X.cmp + ' (' + dow(X.cmp) + ')</div></div>' +
        '<div class="big"><div><div class="l">B2B 지시 합계</div><div class="v">' + fmt(t.b2b) + '</div><div class="c ' + pcls(t.b2b, t.pb2b) + '">' + pctS(t.b2b, t.pb2b) + ' <span class="mute">(' + fmt(t.pb2b) + ')</span></div></div><div><div class="l">B2C 주문 수량</div><div class="v">' + fmt(t.b2cQty) + '</div><div class="c ' + pcls(t.b2cQty, t.pb2c) + '">' + pctS(t.b2cQty, t.pb2c) + (t.pb2c != null ? ' <span class="mute">(' + fmt(t.pb2c) + ')</span>' : '') + '</div></div><div><div class="l">B2C 주문 건수</div><div class="v">' + fmt(t.b2cCnt) + '</div><div class="c mute">배송지 기준</div></div></div>' +
        '<h4>B2B 브랜드별 지시 (판매분 + 선지시)</h4><table><tr><th style="text-align:left">브랜드</th><th>전년</th><th>금일</th><th>증감</th></tr>' + main.map((r) => line(HS.bname(r.n), r.pt, r.t)).join('') + (rest.length ? line('기타 (' + rest.slice(0, 3).map((r) => HS.bname(r.n)).join('·') + (rest.length > 3 ? ' 등' : '') + ')', sum(rest, (r) => r.pt), sum(rest, (r) => r.t)) : '') +
        '<tr class="sum"><td>합계 <small>(판매 ' + fmt(t.sale) + ' + 선지시 ' + fmt(t.pre) + ')</small></td><td class="n">' + fmt(t.pb2b) + '</td><td class="n">' + fmt(t.b2b) + '</td><td class="n ' + pcls(t.b2b, t.pb2b) + '">' + pctS(t.b2b, t.pb2b) + '</td></tr></table>' +
        '<h4>B2C 브랜드별 주문 (건수 / 수량)</h4><table><tr><th style="text-align:left">브랜드</th><th>건수</th><th>수량</th></tr>' + bc.map((r) => '<tr><td>' + esc(HS.bname(r.n)) + '</td><td class="n">' + fmt(r.cnt) + '</td><td class="n">' + fmt(r.qty) + '</td></tr>').join('') + (br.length ? '<tr><td>기타 (' + esc(HS.bname(br[0].n)) + ' 외)</td><td class="n">' + fmt(sum(br, (r) => r.cnt)) + '</td><td class="n">' + fmt(sum(br, (r) => r.qty)) + '</td></tr>' : '') + (R.ch['어드민'] ? '<tr><td>어드민</td><td class="n">' + fmt(R.ch['어드민'].cnt) + '</td><td class="n">' + fmt(R.ch['어드민'].qty) + '</td></tr>' : '') +
        '<tr class="sum"><td>합계</td><td class="n">' + fmt(t.b2cCnt) + '</td><td class="n">' + fmt(t.b2cQty) + '</td></tr></table>' +
        '<div class="foot">' + esc(chTxt) + '<br>※ 건수 합계는 여러 브랜드를 함께 주문한 배송지를 1건으로 셉니다' + (notes.length ? '<br>특이사항: ' + esc(notes.join(' / ')) : '') + '<br>혜성물류 운영 ERP</div></div>';
    } else {
      html = '<div class="rep-x"><div class="ttl"><b>브랜드별 출고지시 취합 — ' + d + ' (' + dow(d) + ')</b><span>전년 비교일 ' + X.cmp + ' (' + dow(X.cmp) + ') · ' + esc(HS.me.name) + '</span></div><table>' +
        '<tr><th rowspan="2">브랜드</th><th colspan="3">B2B 판매분</th><th colspan="3">B2B 선지시 (미작업분)</th><th colspan="3">B2B 합계</th><th class="g" colspan="2">B2C 금일</th></tr><tr><th>전년</th><th>금일</th><th>증감률</th><th>전년</th><th>금일</th><th>비고</th><th>전년</th><th>금일</th><th>증감률</th><th class="g">건수</th><th class="g">수량</th></tr>' +
        R.b2b.map((r) => { const c = X.T.b2c[r.n] || {}; return '<tr><td class="b">' + esc(HS.bname(r.n)) + '</td><td class="n">' + (r.ps == null ? '-' : fmt(r.ps)) + '</td><td class="n">' + (r.s == null ? '-' : fmt(r.s)) + '</td><td class="n ' + pcls(r.s, r.ps) + '">' + pctS(r.s, r.ps) + '</td><td class="n">' + (r.pp == null ? '' : fmt(r.pp)) + '</td><td class="n">' + (r.p == null ? '' : fmt(r.p)) + '</td><td>' + esc(r.note) + '</td><td class="n">' + (r.pt == null ? '-' : fmt(r.pt)) + '</td><td class="n">' + (r.t == null ? '-' : fmt(r.t)) + '</td><td class="n ' + pcls(r.t, r.pt) + '">' + pctS(r.t, r.pt) + '</td><td class="n">' + (c.cnt == null ? '-' : fmt(c.cnt)) + '</td><td class="n">' + (c.qty == null ? '-' : fmt(c.qty)) + '</td></tr>'; }).join('') +
        (R.ch['어드민'] ? '<tr><td class="b">어드민</td><td colspan="9" class="mute" style="text-align:center">B2C 전용 채널</td><td class="n">' + fmt(R.ch['어드민'].cnt) + '</td><td class="n">' + fmt(R.ch['어드민'].qty) + '</td></tr>' : '') +
        '<tr class="tot"><td>합계</td><td class="n">' + fmt(t.psale) + '</td><td class="n">' + fmt(t.sale) + '</td><td class="n ' + pcls(t.sale, t.psale) + '">' + pctS(t.sale, t.psale) + '</td><td class="n">' + fmt(t.ppre) + '</td><td class="n">' + fmt(t.pre) + '</td><td></td><td class="n">' + fmt(t.pb2b) + '</td><td class="n">' + fmt(t.b2b) + '</td><td class="n ' + pcls(t.b2b, t.pb2b) + '">' + pctS(t.b2b, t.pb2b) + '</td><td class="n">' + fmt(t.b2cCnt) + '</td><td class="n">' + fmt(t.b2cQty) + '</td></tr>' +
        '<tr class="sub"><td>B2C 전년 대비</td><td colspan="9" style="text-align:right">B2C 전년 수량 ' + (t.pb2c == null ? '-' : fmt(t.pb2c)) + ' → 금일 ' + fmt(t.b2cQty) + ' &nbsp; (' + esc(chTxt) + ') · 건수 합계는 중복 배송지 1건 처리</td><td colspan="2" class="n ' + pcls(t.b2cQty, t.pb2c) + '" style="text-align:center">' + pctS(t.b2cQty, t.pb2c) + '</td></tr></table></div>';
    }
    const host = HS.el('<div style="position:fixed;left:-12000px;top:0;z-index:-1"></div>'); host.innerHTML = html; document.body.appendChild(host);
    try { await HS.snap(host.firstElementChild, '출고지시_' + d + (kind === 'kakao' ? '_카톡' : '_엑셀형')); } finally { host.remove(); }
  }
  function excel(X) {
    const R = repData(X); const t = R.t;
    const aoa = [['브랜드별 출고지시 취합', X.d + ' (' + dow(X.d) + ')', '전년 비교일', X.cmp], [], ['브랜드', '전년 판매분', '금일 판매분', '증감률', '전년 선지시', '금일 선지시', '비고', '전년 합계', '금일 합계', '증감률', 'B2C 건수', 'B2C 수량']];
    const pc = (a, b) => (a == null || !b ? '' : Math.round((a / b - 1) * 1000) / 10 + '%');
    R.b2b.forEach((r) => { const c = X.T.b2c[r.n] || {}; aoa.push([HS.bname(r.n), r.ps, r.s, pc(r.s, r.ps), r.pp, r.p, r.note, r.pt, r.t, pc(r.t, r.pt), c.cnt, c.qty]); });
    Object.entries(X.T.b2c).filter(([n]) => R.b2b.every((r) => r.n !== n)).forEach(([n, c]) => aoa.push([HS.bname(n), '', '', '', '', '', '', '', '', '', c.cnt, c.qty]));
    if (R.ch['어드민']) aoa.push(['어드민', '', '', '', '', '', 'B2C 전용', '', '', '', R.ch['어드민'].cnt, R.ch['어드민'].qty]);
    aoa.push(['합계', t.psale, t.sale, pc(t.sale, t.psale), t.ppre, t.pre, '', t.pb2b, t.b2b, pc(t.b2b, t.pb2b), t.b2cCnt, t.b2cQty]);
    aoa.push([], ['B2C 채널', '건수', '수량']); ['크리스', 'LX', '어드민'].forEach((o) => R.ch[o] && aoa.push([o, R.ch[o].cnt, R.ch[o].qty]));
    aoa.push(['B2C 전년 수량', t.pb2c, '', '증감률', pc(t.b2cQty, t.pb2c)]);
    HS.needXlsx(); const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = [{ wch: 16 }].concat(Array(11).fill({ wch: 11 })); XLSX.utils.book_append_sheet(wb, ws, X.d); XLSX.writeFile(wb, '출고지시취합_' + X.d + '.xlsx');
  }
})();
