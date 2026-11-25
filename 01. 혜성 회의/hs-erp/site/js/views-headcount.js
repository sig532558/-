/* 지원팀 › 팀별 인원 배정 (2026-11-11)
 *  · 지원팀 · 관리팀은 따로 매출이 없는 팀이고, 인원을 각 팀에 배정해 운영함 (사용자 확인)
 *  · 여기서 팀별로 적으면 그 팀 [원가 관리 입력] 화면의 '현장확인 · 사무실확인' 에 그대로 나옴
 *    (같은 자료 erp_headcount 를 씁니다 — 따로 옮기는 일 없음)
 *  · 권한은 headcount (sql/25_cost_admin.sql) — 지원팀 · 관리자만 쓸 수 있고, 업무일지는 못 건드림
 */
(function () {
  'use strict';
  const { esc, fmt, today } = HS;
  const POOL = ['지원팀', '관리팀']; // 배정해 나눠 쓰는 인원 (erp_teams 의 팀이 아님 — 여기에만 적음)

  HS.view('headcount', {
    title: '팀별 인원 배정', perm: 'headcount',
    async render(body, p, tools) {
      const d = p.d || today();
      tools.appendChild(HS.dateNav(d, (x) => HS.go('headcount', { d: x })));
      const ed = HS.can('headcount', 'edit');
      const [rows, lock] = await Promise.all([
        HS.db.list('erp_headcount', { eq: { work_date: d } }).catch(() => []),
        HS.db.list('erp_locks', { eq: { lock_date: d, module: 'worklog' } }).catch(() => []),
      ]);
      const locked = rows.length >= 0 && lock.length > 0 && !HS.can('worklog', 'unlock');
      const R = Object.fromEntries(rows.map((r) => [r.team, r]));
      const teams = HS.cache.teams.map((t) => t.name);
      body.innerHTML = '';
      if (locked) body.appendChild(HS.el('<div class="lock" style="margin-bottom:12px">' + esc(d) + ' 은 마감되어 고칠 수 없습니다. 마감 해제는 관리자에게 요청하세요.</div>'));
      const canW = ed && !locked;

      // ① 나눠 쓰는 인원 (지원팀 · 관리팀 전체 인원)
      const pg = HS.grid({
        keyLabel: '부서', editable: canW, cards: false,
        rows: POOL.map((t) => ({ key: t, data: { field_count: (R[t] || {}).field_count } })),
        cols: [{ k: 'field_count', l: '오늘 인원', t: 'num' }],
      });
      const c1 = HS.el('<div class="card"><h3>① 나눠 쓸 인원 <small>' + esc(d.slice(5)) + ' · 지원팀 · 관리팀은 매출이 없는 부서라 인원을 각 팀에 배정합니다</small></h3></div>');
      c1.appendChild(pg.el); body.appendChild(c1);

      // ② 팀별 배정
      const hg = HS.grid({
        keyLabel: '팀', editable: canW, total: true,
        rows: teams.map((t) => ({ key: t, data: { field_count: (R[t] || {}).field_count, office_count: (R[t] || {}).office_count, alloc_count: (R[t] || {}).alloc_count } })),
        cols: [
          // 현장확인은 각 팀이 자기 원가 관리 입력 화면에서 적음 — 여기서는 보기만 (2026-11-12)
          { k: 'field_count', l: '현장확인 (팀 작성)', t: 'num', ro: true },
          { k: 'office_count', l: '사무실확인 (지원팀)', t: 'num' },
          { k: 'alloc_count', l: '배정 인원', t: 'num' },
          { k: 'ok', l: '확인', t: 'auto', noSum: true, f: (x) => (x.field_count == null && x.office_count == null ? null : +x.field_count === +x.office_count ? 1 : 0), show: (v) => (v == null ? '' : v ? '<span class="tag g">일치</span>' : '<span class="tag r">불일치</span>') },
        ],
        onChange: () => drawSum(),
      });
      const c2 = HS.el('<div class="card" style="margin-top:14px"><h3>② 팀별 배정 <small>' + esc(d.slice(5)) + ' · 현장확인은 각 팀이 적은 값 (보기만) · 사무실확인 · 배정 인원은 여기서 적습니다</small></h3></div>');
      c2.appendChild(hg.el);
      const sum = HS.el('<div class="lock" style="margin-top:10px;font-size:12px;line-height:1.8"></div>'); c2.appendChild(sum);
      body.appendChild(c2);

      function drawSum() {
        const pool = pg.el ? POOL.reduce((a, t) => { const r = (pg.changed().find((x) => x.key === t) || {}).data || { field_count: (R[t] || {}).field_count }; return a + (+r.field_count || 0); }, 0) : 0;
        const given = teams.reduce((a, t) => { const ch = hg.changed().find((x) => x.key === t); const v = ch ? ch.data.alloc_count : (R[t] || {}).alloc_count; return a + (+v || 0); }, 0);
        const bad = teams.filter((t) => { const r = R[t] || {}; const ch = hg.changed().find((x) => x.key === t); const f = ch ? ch.data.field_count : r.field_count; const o = ch ? ch.data.office_count : r.office_count; return f != null && o != null && +f !== +o; });
        sum.innerHTML = '나눠 쓸 인원 <b>' + fmt(pool, 1) + '명</b> · 팀별 배정 합계 <b>' + fmt(given, 1) + '명</b>' + (pool && given && pool !== given ? ' <span class="neg">(' + fmt(Math.abs(pool - given), 1) + '명 ' + (pool > given ? '덜 배정' : '더 배정') + ')</span>' : '') +
          (bad.length ? '<br><span class="neg">⚠ 현장확인과 사무실확인이 다른 팀: <b>' + bad.map(esc).join(' · ') + '</b></span>' : '<br>현장확인과 사무실확인이 모두 맞습니다.');
      }
      drawSum();

      if (canW) {
        const b = HS.el('<button class="btn p" style="margin-top:12px">인원 저장</button>');
        b.onclick = async () => {
          try {
            // ① 나눠 쓸 인원(지원팀 · 관리팀)은 그 부서 줄의 현장확인 · ② 는 사무실확인 · 배정 인원만 (현장확인은 각 팀이 적음)
            const up1 = pg.changed().map((r) => ({ work_date: d, team: r.key, field_count: +r.data.field_count || 0 }));
            const up2 = hg.changed().map((r) => ({ work_date: d, team: r.key, office_count: +r.data.office_count || 0, alloc_count: +r.data.alloc_count || 0 }));
            if (!up1.length && !up2.length) return HS.toast('바뀐 것이 없습니다');
            if (up1.length) await HS.db.upsert('erp_headcount', up1);
            if (up2.length) await HS.db.upsert('erp_headcount', up2);
            const up = up1.concat(up2);
            pg.clear(); hg.clear(); HS.toast(up.length + '줄 저장했습니다', 'ok'); HS.route();
          } catch (e) { HS.err(e); }
        };
        body.appendChild(b);
      }
      body.appendChild(HS.el('<div class="mute" style="font-size:11.5px;margin-top:12px;line-height:1.8">· <b>현장확인</b>은 각 팀이 자기 <b>원가 관리 입력</b> 화면에서 적습니다 — 여기서는 보기만 합니다 (2026-11-12).<br>· <b>사무실확인 · 배정 인원</b>은 지원팀이 여기서 적습니다. 각 팀 화면에도 그대로 보이지만 그 쪽에서는 못 고칩니다 (같은 자료입니다).<br>· 현장확인과 사무실확인이 다르면 <b>불일치</b>로 표시됩니다 — 어느 쪽이 맞는지 확인하는 칸입니다.<br>· 지원팀 · 관리팀 인원은 ① 에 전체 인원을 적고, ② <b>배정 인원</b>에 각 팀에 나눠 적으면 됩니다.<br>· 작업수량 · 공정단가 · 업무일지는 여기서 고칠 수 없습니다.</div>'));
      HS.live(['erp_headcount'], () => { if (HS.cur === 'headcount') HS.route(); });
    },
  });
})();
