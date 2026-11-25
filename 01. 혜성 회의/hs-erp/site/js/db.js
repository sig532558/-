/* 혜성물류 운영 ERP — 데이터 계층
 * - Supabase 모드: 실제 운영 (다중 접속, 권한은 DB의 RLS가 최종 판단)
 * - 로컬 모드: Supabase 연결 전 화면 확인·교육용 (이 브라우저에만 저장)
 */
(function () {
  'use strict';
  const fmtN = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const KEYS = {
    erp_worklog: ['work_date', 'team', 'grp', 'task'], erp_worklog_day: ['work_date', 'team'], erp_headcount: ['work_date', 'team'],
    erp_daily_records: ['rec_date', 'section', 'rec_key'], erp_locks: ['lock_date', 'module'], erp_tasks: ['source_key'],
    erp_returns_box: ['rec_date'], erp_records: ['source_key'], erp_settlement: ['source_key'], erp_teams: ['name'],
    erp_task_prices: ['team', 'grp', 'task'], erp_team_cost: ['team', 'year'], erp_ceo_members: ['user_id'], erp_ceo_items: ['id'], erp_brands: ['name'], erp_settings: ['key'], erp_roles: ['id'], erp_profiles: ['id'], erp_centers: ['id'],
    erp_orders: ['rec_date', 'section', 'brand'], erp_orders_day: ['rec_date'], erp_kpi: ['work_date', 'team', 'sheet', 'brand', 'metric'], erp_kpi_day: ['work_date', 'team'], erp_np_style: ['season', 'style'], erp_np_snap: ['season', 'snap_date'], erp_views: ['screen', 'owner', 'name'],
    erp_cnt: ['id'], erp_cnt_part: ['cnt_id', 'kind', 'file', 'part'], erp_season: ['id'], erp_season_act: ['season_id', 'work_date', 'job'],
    erp_ret_done: ['rec_date', 'brand'], erp_ret_pend: ['brand'], erp_ret_bag: ['source_key'],
    erp_as_daily: ['date'], erp_as_ship: ['date', 'courier'], erp_as_transfer: ['date', 'carrier'], erp_as_staff: ['date', 'item'],
    erp_as_sorter: ['date', 'style'], erp_as_inv_daily: ['date', 'kind'], erp_as_inv_flow: ['style'], erp_as_inv_stock: ['style', 'place'], erp_usage_log: ['d'],
    erp_volume: ['rec_date', 'owner', 'proc'], erp_cs_part: ['kind', 'sub', 'part'], erp_cs_daily: ['d', 'kind', 'sub', 'brand'], erp_cs_alloc: ['d', 'brand', 'k'], erp_cs_close: ['d', 'kind'], erp_np_raw: ['kind'],
    // 이월팀 — 시즌반품정리현황 · 선지시출고현황 (sql/33_iwol.sql · 2026-11-24)
    //  2026-11-25: 열쇠에 [운영 기간](term)을 넣음 — 같은 품번이 기간마다 따로 있을 수 있음 (sql/35_iwol_term.sql)
    erp_iw_ord: ['term', 'style'], erp_iw_shp: ['term', 'source_key'], erp_iw_inv: ['term', 'style'], erp_iw_cnt: ['term', 'source_key'],
    erp_iw_set: ['key'], erp_iw_sst: ['kind', 'term', 'gkey'], erp_iw_man: ['kind', 'term', 'grp', 'd'], erp_iw_band: ['id'], erp_iw_term: ['term'],
    erp_gone_user: ['id'], // 지난 사람 (sql/34_user_admin.sql · 이름만 남김)
    erp_tl_meet: ['id'], erp_tl_item: ['id'], erp_tl_file: ['id'], // 팀장 자체 회의록 (sql/36_tlmeet.sql · 2026-11-25)
    erp_cs_order: ['d', 'sub', 'brand'], erp_meet_note: ['ym', 'sect'], erp_meet_book: ['ym', 'idx'], erp_supply_item: ['kind', 'item'], erp_notice_read: ['notice_id', 'user_id'],
  };
  const LOCK_MODULE = { erp_worklog: 'worklog', erp_worklog_day: 'worklog', erp_headcount: 'worklog', erp_daily_records: 'daily', erp_returns_box: 'returns', erp_orders: 'orders', erp_orders_day: 'orders', erp_kpi: 'kpi', erp_kpi_day: 'kpi' };
  const DATE_COL = { erp_worklog: 'work_date', erp_worklog_day: 'work_date', erp_headcount: 'work_date', erp_daily_records: 'rec_date', erp_returns_box: 'rec_date', erp_orders: 'rec_date', erp_orders_day: 'rec_date', erp_kpi: 'work_date', erp_kpi_day: 'work_date' };
  const MOD_OF = { erp_worklog: 'worklog', erp_worklog_day: 'worklog', erp_headcount: 'worklog', erp_daily_records: 'daily', erp_tasks: 'tasks', erp_returns_box: 'returns', erp_records: 'returns', erp_settlement: 'settlement', erp_roles: 'users', erp_teams: 'settings', erp_task_prices: 'settings', erp_brands: 'settings', erp_settings: 'settings', erp_requests: 'requests', erp_uploads: 'upload', erp_centers: 'settings', erp_orders: 'orders', erp_orders_day: 'orders', erp_kpi: 'kpi', erp_kpi_day: 'kpi', erp_np_style: 'newprod', erp_np_snap: 'newprod', erp_cnt: 'count', erp_cnt_part: 'count', erp_season: 'season', erp_season_act: 'season', erp_ret_done: 'returns', erp_ret_pend: 'returns', erp_ret_bag: 'returns', erp_volume: 'volume', erp_meet_note: 'meeting', erp_meet_book: 'meeting', erp_supply: 'supply', erp_supply_item: 'supply', erp_notice: 'notice', erp_as_daily: 'anseong', erp_as_ship: 'anseong', erp_as_transfer: 'anseong', erp_as_staff: 'anseong', erp_as_ret: 'anseong', erp_as_sorter: 'anseong', erp_as_inv_daily: 'anseong', erp_as_inv_flow: 'anseong', erp_as_inv_stock: 'anseong', erp_usage_log: 'users', erp_cs_file: 'csdata', erp_cs_part: 'csdata', erp_cs_daily: 'csdata', erp_cs_order: 'csdata', erp_cs_alloc: 'csdata', erp_cs_close: 'csdata', erp_np_raw: 'newprod', erp_iw_ord: 'iwol', erp_iw_shp: 'iwol', erp_iw_inv: 'iwol', erp_iw_cnt: 'iwol', erp_iw_set: 'iwol', erp_iw_sst: 'iwol', erp_iw_man: 'iwol', erp_iw_band: 'iwol', erp_iw_term: 'iwol', erp_gone_user: 'users', erp_tl_meet: 'tlmeet', erp_tl_item: 'tlmeet', erp_tl_file: 'tlmeet' };

  // ---------- 기본값 (SQL 03_extend.sql 과 동일) ----------
  const NEW_PERMS = {
    admin: { orders: { view: true, create: true, edit: true, delete: true, close: true, unlock: true }, kpi: { view: true, create: true, edit: true, delete: true, close: true, unlock: true }, newprod: { view: true, create: true, edit: true } },
    ceo: { orders: { view: true }, kpi: { view: true }, newprod: { view: true } },
    support: { orders: { view: true, create: true, edit: true, close: true }, kpi: { view: true, create: true, edit: true, close: true }, newprod: { view: true, create: true, edit: true } },
    leader: { orders: { view: true }, kpi: { view: true, create: true, edit: true }, newprod: { view: true } },
    staff: { orders: { view: true }, newprod: { view: true } },
  };
  const NEW_PERMS2 = { // SQL 06_count_season.sql 과 동일
    admin: { count: { view: true, create: true, upload: true, edit: true, delete: true, close: true }, season: { view: true, create: true, upload: true, edit: true, delete: true } },
    ceo: { count: { view: true }, season: { view: true } },
    support: { count: { view: true, create: true, upload: true, edit: true, close: true }, season: { view: true, create: true, upload: true, edit: true } },
    leader: { count: { view: true, upload: true }, season: { view: true, upload: true } },
    staff: { count: { view: true }, season: { view: true } },
  };
  const NEW_PERMS4 = { admin: { csdata: { view: true, create: true } }, support: { csdata: { view: true, create: true } }, ceo: { csdata: { view: true } }, leader: { csdata: { view: true } }, staff: { csdata: { view: true } } }; // SQL 13_csdata.sql 과 동일
  const NEW_PERMS6 = { admin: { close: true } }; // SQL 17_cs_alloc_close.sql: 관리자 배분LIST 마감 해제
  // SQL 25_cost_admin.sql 과 동일 — 인원 확인(headcount): 지원팀이 팀별 인원을 적을 수 있게
  const NEW_PERMS7 = { admin: { headcount: { view: true, edit: true } }, support: { headcount: { view: true, edit: true } }, ceo: { headcount: { view: true } }, leader: { headcount: { view: true } }, staff: { headcount: { view: true } } };
  // SQL 27_cost_leader.sql: 원가관리 설정 — 관리자 · 팀장은 고치기 · 나머지는 보기만
  const NEW_PERMS8 = { admin: { costset: { view: true, edit: true } }, leader: { costset: { view: true, edit: true } }, ceo: { costset: { view: true } }, support: { costset: { view: true } }, staff: { costset: { view: true } } };
  const NEW_PERMS5 = { leader: { delete: true } }; // SQL 15_cnt_trash.sql: 현장 팀장 실사 삭제
  // SQL 33_iwol.sql: 이월팀 시즌반품정리현황 · 선지시출고현황 — 보기는 전체 · 올리기는 이월소터팀 + 관리자(팀 검사는 check 에서)
  const NEW_PERMS9 = { admin: { iwol: { view: true, create: true } }, support: { iwol: { view: true, create: true } }, leader: { iwol: { view: true, create: true } }, staff: { iwol: { view: true, create: true } }, ceo: { iwol: { view: true } } };
  // 팀장 자체 회의록 — SQL 36_tlmeet.sql 과 동일 (보기 = 관리자 · 대표 · 업무지원팀 · 팀장 · 쓰기는 자기 팀만)
  const NEW_PERMS10 = { admin: { tlmeet: { view: true, create: true } }, support: { tlmeet: { view: true, create: true } }, leader: { tlmeet: { view: true, create: true } }, ceo: { tlmeet: { view: true } } };
  const NEW_PERMS3 = { // SQL 08_meeting.sql 과 동일
    admin: { meeting: { view: true, edit: true }, volume: { view: true, create: true }, supply: { view: true, create: true, edit: true, delete: true }, notice: { view: true, create: true, edit: true, delete: true } },
    ceo: { meeting: { view: true }, volume: { view: true }, supply: { view: true }, notice: { view: true } },
    support: { meeting: { view: true, edit: true }, volume: { view: true, create: true }, supply: { view: true, create: true }, notice: { view: true, create: true, edit: true } },
    leader: { meeting: { view: true, edit: true }, volume: { view: true }, supply: { view: true, create: true }, notice: { view: true } },
    staff: { supply: { view: true, create: true }, notice: { view: true } },
  };
  const BRAND_EXT = { 핑: ['PING', '1', ['PING', '핑']], 팬텀: ['FANTOM', '2', ['FANTOM', '펜텀', '팬텀']], 파리게이츠: ['PEARLY GATES', '5', ['PEARLY GATES', '파리', '파리게이츠']], 마스터바니: ['MASTER BUNNY', '4', ['MASTER BUNNY', 'MASTER BUNNY EDITION', '바니', '마바']], 고커: ['GOKER', '6', ['GOKER']], 세인트앤드류스: ['ST ANDREWS', '8', ['ST ANDREWS', '세인트', '세인트앤드류스']], 하이드로겐: ['HYDROGEN', 'H', ['HYDROGEN', '하이']], 마무트: ['MAMMUT', 'M', ['MAMMUT', '마므트']], 앤드원더: ['and wander', 'W', ['AND WANDER', '앤드']], 베셀: ['VESSEL', 'S', ['VESSEL']], 보기보이즈: ['bogeyboys', 'B', ['BOGEYBOYS']], 링스: ['LYNX', 'L', ['LYNX']], V12: ['V12', 'V', ['VTWELVE', 'V12', '브이트웰브']], 로라애슐리: ['LAURA ASHLEY', 'R', ['LAURA ASHLEY', '로라']], 용품볼: ['용품사업부', '9', ['용품사업부']], 네파: ['NEPA', 'N', ['NEPA']] };
  const KPI_MAP = { 정상1팀: [
    { grp: '출고', task: '출고', qty: [['first', '초도PCS'], ['out', '온라인'], ['out', '판매분'], ['out', '오픈'], ['out', '행사']], to: [['first', '인원'], ['out', '인원'], ['box', '인원'], ['etc', '인원']] },
    { grp: '출고', task: '부자재출고', qty: [['first', '부자재']], to: [] }, { grp: '출고', task: '사은품출고', qty: [['first', '사은품']], to: [] },
    { grp: '정리', task: '입고솔리드정리', qty: [['in', 'Units']], to: [['in', '인원']] },
    { grp: '정리', task: '수시,폐점 정리', qty: [['ret', '온라인'], ['ret', '수시'], ['ret', '폐점'], ['ret', '행사'], ['ret', '해체']], to: [['ret', '인원']] },
    { grp: '정리', task: '지원팀,반품팀', qty: [], to: [['day', 'office']] }] };

  const cfgKey = 'hs-erp-conn';
  const rpcWarned = {}; // 1,000줄 잘림 알림은 함수마다 한 번만 (2026-11-13)
  function loadConn() {
    const base = window.HS_CONFIG || {};
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(cfgKey) || '{}'); } catch (e) { /* 저장소 사용 불가 */ }
    return { url: saved.url || base.supabaseUrl || '', key: saved.key || base.supabaseKey || '', mode: saved.mode || (base.supabaseUrl ? 'supabase' : 'local') };
  }
  function saveConn(c) { try { localStorage.setItem(cfgKey, JSON.stringify(c)); } catch (e) { /* 무시 */ } }

  // ======================= Supabase 어댑터 =======================
  function SupaAdapter(conn) {
    const sb = window.supabase.createClient(conn.url, conn.key, { auth: { persistSession: true, autoRefreshToken: true } });
    const EMAIL = (id) => (id.indexOf('@') > 0 ? id : id + '@hyeseong.erp');
    // 로그인(세션)이 풀렸는데 화면만 남아 있으면, 자료가 '없는 것처럼' 보이고 설정은 빈 목록이 된다.
    //  (서버가 손님(anon)으로 보아 아무것도 안 내어 주고, 2단계 인증은 'invalid claim: missing sub claim' 오류)
    //  → 바로 알려 주고 로그인 화면으로 보낸다 (2026-11-19)
    let lostOnce = false;
    const sessionLost = () => {
      if (lostOnce) return; lostOnce = true;
      try { if (window.HS && HS.toast) HS.toast('로그인이 풀렸습니다 · 다시 로그인해 주세요', 'err'); } catch (e) { /* 무시 */ }
      setTimeout(() => { try { sessionStorage.clear(); } catch (e) { /* 무시 */ } location.reload(); }, 1800);
    };
    if (sb.auth.onAuthStateChange) sb.auth.onAuthStateChange((ev, s) => { if (!s && (ev === 'SIGNED_OUT' || ev === 'TOKEN_REFRESHED')) sessionLost(); });
    const LOST = /missing sub claim|invalid claim|JWT expired|Invalid Refresh Token|session_not_found|not authenticated/i;
    const self = {
      mode: 'supabase', client: sb,
      // 지금도 로그인이 살아 있는지 (화면을 그리기 전에 확인 · 풀렸으면 알리고 로그인 화면으로)
      async checkSession() { let r = null; try { r = await sb.auth.getSession(); } catch (e) { r = null; } if (!r || !r.data || !r.data.session) { sessionLost(); return false; } return true; },
      lostMsg(e) { return LOST.test(String((e && e.message) || e)) ? '로그인이 풀렸습니다 · 다시 로그인해 주세요' : null; },
      async login(id, pw, captcha) {
        const { error } = await sb.auth.signInWithPassword({ email: EMAIL(id), password: pw, options: captcha ? { captchaToken: captcha } : undefined });
        if (error) throw new Error(error.message === 'Invalid login credentials' ? '아이디 또는 비밀번호가 맞지 않습니다' : error.message);
        return self.session();
      },
      async signup(f) {
        let uid;
        const { data, error } = await sb.auth.signUp({ email: EMAIL(f.login_id), password: f.password, options: Object.assign({ data: { name: f.name, app: 'erp' } }, f.captcha ? { captchaToken: f.captcha } : {}) });
        if (error && !/already/.test(error.message)) throw new Error(error.message);
        if (error && f.captcha) throw new Error('이미 있는 아이디입니다. 로그인 화면에서 같은 아이디로 로그인하면 ERP 사용 신청 화면이 나옵니다');
        if (error) { // 안성 프로그램 기존 계정 → 로그인 후 ERP 사용 신청
          const r = await sb.auth.signInWithPassword({ email: EMAIL(f.login_id), password: f.password });
          if (r.error) throw new Error('이미 있는 아이디입니다. 비밀번호를 확인하세요');
          uid = r.data.user.id;
        } else uid = data.user && data.user.id;
        if (!data || !data.session) { const r = await sb.auth.signInWithPassword({ email: EMAIL(f.login_id), password: f.password }); if (r.error) throw new Error('가입은 됐지만 로그인 실패: Supabase에서 이메일 확인(Confirm email)을 끄세요'); uid = r.data.user.id; }
        const ins = await sb.from('erp_profiles').insert({ id: uid, login_id: f.login_id, name: f.name, dept: f.dept || null, title: f.title || null, phone: f.phone || null, role_id: 'pending', active: false });
        if (ins.error && !/duplicate/.test(ins.error.message)) throw new Error(ins.error.message);
        return self.session();
      },
      async logout() { lostOnce = true; await sb.auth.signOut(); }, // 일부러 나가는 것이므로 '풀렸습니다' 알림은 띄우지 않음
      // 방화벽 ③ 2단계 인증 (휴대폰 인증 앱 · TOTP)
      async mfaState() {
        if (!(await self.checkSession())) throw new Error('로그인이 풀렸습니다 · 다시 로그인해 주세요');
        const a = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
        if (a.error) throw new Error(self.lostMsg(a.error) || a.error.message);
        const f = await sb.auth.mfa.listFactors();
        if (f.error) throw new Error(self.lostMsg(f.error) || f.error.message);
        const totp = ((f.data && f.data.totp) || []).filter((x) => x.status === 'verified');
        return { current: a.data.currentLevel, next: a.data.nextLevel, factors: totp };
      },
      async mfaEnroll() {
        if (!(await self.checkSession())) throw new Error('로그인이 풀렸습니다 · 다시 로그인해 주세요');
        const old = await sb.auth.mfa.listFactors(); // 완료 안 된 이전 등록 정리
        for (const x of ((old.data && old.data.all) || [])) if (x.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: x.id });
        const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: '혜성 ERP ' + new Date().toISOString().slice(0, 10) });
        if (error) throw new Error(error.message);
        return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
      },
      async mfaVerify(factorId, code) {
        const c = String(code == null ? '' : code).replace(/\D/g, '');
        if (c.length !== 6) throw new Error(c ? '6자리 번호를 넣어 주세요 (지금 ' + c.length + '자리)' : '인증 앱의 6자리 번호를 넣어 주세요'); // 빈칸으로 누르면 서버가 영어로 답함
        const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: c });
        if (error) throw new Error(self.lostMsg(error) || (/invalid|expired/i.test(error.message) ? '인증번호가 맞지 않습니다. 앱의 새 6자리 번호를 입력하세요' : error.message));
        await sb.auth.refreshSession();
      },
      async mfaRemove(factorId) { const { error } = await sb.auth.mfa.unenroll({ factorId }); if (error) throw new Error(error.message); },
      async session() {
        const { data } = await sb.auth.getSession();
        if (!data.session) return null;
        const uid = data.session.user.id;
        const p = await sb.from('erp_profiles').select('*').eq('id', uid).maybeSingle();
        if (!p.data) return { id: uid, needProfile: true, email: data.session.user.email };
        const r = await sb.from('erp_roles').select('*').eq('id', p.data.role_id).maybeSingle();
        sb.from('erp_profiles').update({ last_seen: new Date().toISOString() }).eq('id', uid).then(() => {});
        return Object.assign({}, p.data, { role: r.data || { perms: {} } });
      },
      async list(table, q) {
        q = q || {};
        const all = []; const page = 1000; let from = 0;
        for (;;) {
          let x = sb.from(table).select(q.select || '*');
          for (const k in q.eq || {}) x = x.eq(k, q.eq[k]);
          for (const k in q.neq || {}) x = x.neq(k, q.neq[k]);
          for (const k in q.gte || {}) x = x.gte(k, q.gte[k]);
          for (const k in q.lte || {}) x = x.lte(k, q.lte[k]);
          for (const k in q.in || {}) x = x.in(k, q.in[k]);
          if (q.is) for (const k in q.is) x = x.is(k, q.is[k]);
          if (q.order) x = x.order(q.order[0], { ascending: q.order[1] !== false });
          const lim = q.limit ? Math.min(q.limit - all.length, page) : page;
          x = x.range(from, from + lim - 1);
          const { data, error } = await x;
          if (error) throw new Error(error.message);
          all.push(...data);
          if (data.length < lim || (q.limit && all.length >= q.limit)) break;
          from += lim;
        }
        return all;
      },
      async upsert(table, rows, onProgress) {
        if (!rows.length) return 0;
        const conflict = (KEYS[table] || ['id']).join(',');
        let n = 0;
        // 줄이 많으면 인터넷이 한 번씩 끊겨 한 묶음만 실패하는 일이 있다 → 같은 묶음을 두 번 더 넣어 본다
        //  (키가 같으면 덮어쓰기라 두 번 들어가지 않음 · 2026-11-19)
        const TRY = /network|fetch|timeout|timed out|aborted|5\d\d|Failed to/i;
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          let err = null;
          for (let t = 0; t < 3; t++) {
            // ⚠ supabase 질의는 then 만 있고 catch 가 없다 → .catch() 를 붙이면 터진다. try 로 받을 것
            let r = null; try { r = await sb.from(table).upsert(chunk, { onConflict: conflict }); } catch (e) { r = { error: e }; }
            err = r && r.error; if (!err) break;
            if (!TRY.test(String(err.message || ''))) break;
            await new Promise((x) => setTimeout(x, 800 * (t + 1)));
          }
          if (err) throw new Error(table + ': ' + err.message + ' (' + fmtN(n) + '줄까지 들어갔습니다 · 다시 올리면 이어서 반영됩니다)');
          n += chunk.length; if (onProgress) onProgress(n, rows.length);
        }
        return n;
      },
      async insert(table, row) { const { data, error } = await sb.from(table).insert(row).select().single(); if (error) throw new Error(error.message); return data; },
      async update(table, match, patch) {
        let x = sb.from(table).update(patch); for (const k in match) x = x.eq(k, match[k]);
        const { data, error } = await x.select();
        if (error) throw new Error(error.message);
        if (!data.length) throw new Error('권한이 없거나 마감된 자료입니다');
        return data;
      },
      async remove(table, match) {
        let x = sb.from(table).delete(); for (const k in match) x = x.eq(k, match[k]);
        const { data, error } = await x.select();
        if (error) throw new Error(error.message);
        return data;
      },
      // 서버(PostgREST)는 한 번에 1,000줄까지만 준다 — 딱 1,000줄이 오면 뒤가 잘렸을 수 있으니 알린다 (2026-11-13)
      //  · 자료가 많은 함수는 부르는 쪽에서 기간을 나눠 부를 것 (예: erp_pl_days 는 달마다 · erp_volume_month 는 해마다)
      async rpc(fn, args) {
        const { data, error } = await sb.rpc(fn, args || {});
        if (error) throw new Error(error.message);
        if (Array.isArray(data) && data.length === 1000 && !/_json$/.test(fn)) {
          console.warn('[rpc] ' + fn + ' 결과가 1,000줄 — 서버 한 번 제한에 걸려 뒤가 잘렸을 수 있습니다. 기간을 나눠 부르세요.');
          if (!rpcWarned[fn] && HS.toast) { rpcWarned[fn] = 1; HS.toast('자료가 많아 일부만 불러왔을 수 있습니다 (' + fn + ')', 'err'); }
        }
        return data;
      },
      // 안성센터 테이블(같은 프로젝트) 직접 조회
      async raw(table, q) { return self.list(table, q); },
      // 파일 저장소 (Storage) — 팀장 자체 회의록 별도 파일 (sql/36_tlmeet.sql · 칸 'tlmeet' · 공개 안 함)
      //  · 여는 주소는 1시간짜리 임시 주소 (로그인 + 보기 권한이 있어야 만들어짐)
      files: (() => {
        const msg = (e) => { const m = String((e && (e.message || e.error)) || e);
          return /bucket not found/i.test(m) ? '파일 저장소 칸이 아직 없습니다 — [업데이트하기.bat] 을 실행해 주세요 (sql/36_tlmeet.sql)'
            : /maximum allowed size|too large|payload/i.test(m) ? '파일이 너무 큽니다 — 파일 하나는 10MB 까지입니다'
              : /row-level security|unauthorized|not allowed|403/i.test(m) ? '파일을 올리거나 열 권한이 없습니다' : (self.lostMsg(e) || m); };
        return {
          async up(bucket, path, blob, type) { const { error } = await sb.storage.from(bucket).upload(path, blob, { contentType: type || blob.type || 'application/octet-stream', upsert: false }); if (error) throw new Error(msg(error)); return path; },
          async url(bucket, path, download) { const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 3600, download ? { download } : undefined); if (error) throw new Error(msg(error)); return data.signedUrl; },
          async urls(bucket, paths) { const out = {}; if (!paths.length) return out; const { data, error } = await sb.storage.from(bucket).createSignedUrls(paths, 3600); if (error) throw new Error(msg(error)); (data || []).forEach((x) => { if (x.signedUrl) out[x.path] = x.signedUrl; }); return out; },
          async rm(bucket, paths) { if (!paths || !paths.length) return; const { error } = await sb.storage.from(bucket).remove(paths); if (error) throw new Error(msg(error)); },
        };
      })(),
      subscribe(table, cb) {
        const ch = sb.channel('rt-' + table + '-' + Math.random().toString(36).slice(2)).on('postgres_changes', { event: '*', schema: 'public', table }, (p) => cb(p)).subscribe();
        return () => sb.removeChannel(ch);
      },
      presence(me, cb) {
        const ch = sb.channel('erp-online', { config: { presence: { key: me.id } } });
        ch.on('presence', { event: 'sync' }, () => { const st = ch.presenceState(); cb(Object.keys(st).map((k) => st[k][0])); });
        ch.subscribe(async (s) => { if (s === 'SUBSCRIBED') await ch.track({ id: me.id, name: me.name, page: location.hash }); });
        return { update: (page) => ch.track({ id: me.id, name: me.name, page }), stop: () => sb.removeChannel(ch) };
      },
    };
    return self;
  }

  // ======================= 로컬 어댑터 =======================
  function LocalAdapter() {
    const DBN = 'hs-erp-local'; let T = {}; let seq = {}; let me = null; const subs = {};
    const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DBN, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    async function load() {
      try {
        const db = await idb();
        const v = await new Promise((res) => { const tx = db.transaction('kv').objectStore('kv').get('data'); tx.onsuccess = () => res(tx.result); tx.onerror = () => res(null); });
        if (v) { T = v.T || {}; seq = v.seq || {}; }
      } catch (e) { /* 사생활 보호 모드 등: 메모리만 사용 */ }
      if (!T.erp_roles) seed();
      migrate();
    }
    function migrate() { // 이전 버전 로컬 자료에 새 기능 기본값 추가
      (T.erp_roles || []).forEach((r) => { if (NEW_PERMS[r.id] && !r.perms.orders) Object.assign(r.perms, JSON.parse(JSON.stringify(NEW_PERMS[r.id]))); });
      (T.erp_roles || []).forEach((r) => { if (NEW_PERMS2[r.id] && !r.perms.count) Object.assign(r.perms, JSON.parse(JSON.stringify(NEW_PERMS2[r.id]))); });
      (T.erp_roles || []).forEach((r) => { if (NEW_PERMS9[r.id] && !r.perms.iwol) Object.assign(r.perms, JSON.parse(JSON.stringify(NEW_PERMS9[r.id]))); if (NEW_PERMS8[r.id] && !r.perms.costset) Object.assign(r.perms, JSON.parse(JSON.stringify(NEW_PERMS8[r.id]))); if (NEW_PERMS3[r.id] && !r.perms.supply) Object.assign(r.perms, JSON.parse(JSON.stringify(NEW_PERMS3[r.id]))); if (NEW_PERMS4[r.id] && !r.perms.csdata) Object.assign(r.perms, JSON.parse(JSON.stringify(NEW_PERMS4[r.id]))); if (NEW_PERMS5[r.id] && r.perms.count && r.perms.count.delete == null) r.perms.count.delete = true; if (NEW_PERMS6[r.id] && r.perms.csdata && r.perms.csdata.close == null) r.perms.csdata.close = true; if (NEW_PERMS7[r.id] && !r.perms.headcount) Object.assign(r.perms, JSON.parse(JSON.stringify(NEW_PERMS7[r.id]))); });
      (T.erp_roles || []).forEach((r) => { if (NEW_PERMS10[r.id] && !r.perms.tlmeet) Object.assign(r.perms, JSON.parse(JSON.stringify(NEW_PERMS10[r.id]))); });
      (T.erp_brands || []).forEach((b) => { const x = BRAND_EXT[b.name]; if (x && !b.en) { b.en = x[0]; b.code = x[1]; b.aliases = x[2]; } if (b.active == null) b.active = true; if (b.b2c == null) b.b2c = true; });
      T.erp_settings = T.erp_settings || [];
      if (!T.erp_settings.some((s) => s.key === 'noloc_rule')) T.erp_settings.push({ key: 'noloc_rule', value: { codes: [], min: 1, pct: 5 } });
      if (!T.erp_settings.some((s) => s.key === 'kpi_map')) T.erp_settings.push({ key: 'kpi_map', value: JSON.parse(JSON.stringify(KPI_MAP)) });
    }
    let saveTimer = null;
    function persist() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => { try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').put({ T, seq }, 'data'); } catch (e) { /* 무시 */ } }, 300);
    }
    const tbl = (n) => T[n] || (T[n] = []);
    const nextId = (n) => (seq[n] = (seq[n] || 0) + 1);
    const keyOf = (n, r) => (KEYS[n] || ['id']).map((k) => r[k]).join('|');
    const now = () => new Date().toISOString();
    const emit = (table, type, row, old) => (subs[table] || []).forEach((cb) => { try { cb({ eventType: type, new: row, old }); } catch (e) { console.error(e); } });
    function role() { return me ? (tbl('erp_roles').find((r) => r.id === me.role_id) || { perms: {} }) : { perms: {} }; }
    function can(m, a) { return !!(me && me.active && role().perms[m] && role().perms[m][a]); }
    function teamOk(t) { return !!(me && (role().scope === 'all' || (me.teams || []).indexOf(t) >= 0)); }
    function locked(d, m) { return tbl('erp_locks').some((l) => l.lock_date === d && l.module === m && l.locked); }
    // 대표님 지시 · 할 일 — 사람 단위 명단 (sql/29_ceo.sql 과 같은 규칙)
    const ceoRow = () => (me && me.active ? tbl('erp_ceo_members').find((x) => x.user_id === me.id) : null);
    const ceoOk = (w) => { const r = ceoRow(); return !!(r && (!w || r.can_write)); };
    const ceoFixed = () => { const r = ceoRow(); return !!(r && r.fixed); };
    // 팀장 자체 회의록 — 이 팀 업무를 쓸 수 있나 (sql/36_tlmeet.sql 의 erp_tl_ok 와 같은 규칙)
    const tlOk = (t) => can('tlmeet', 'create') && (can('users', 'edit') || t === '공통 · 기타' || (me.teams || []).indexOf(t) >= 0 || (t === '지원팀' && me.role_id === 'support'));
    function tlBefore(n, o) { // SQL erp_tl_item_guard 와 같음 — 완료 = 100% · 지시사항에 그 회의 날짜 · 이어진 표시는 못 바꿈
      if (n.status === 'done') n.pct = 100;
      if (!o) { n.ceo_d = n.ceo ? (n.ceo_d || n.meet_id) : null; n.gm_d = n.gm ? (n.gm_d || n.meet_id) : null; return; }
      n.ceo_d = (n.ceo || '') !== (o.ceo || '') ? (n.ceo ? n.meet_id : null) : o.ceo_d; n.gm_d = (n.gm || '') !== (o.gm || '') ? (n.gm ? n.meet_id : null) : o.gm_d;
      n.root = o.root; n.carried = o.carried;
    }
    function check(table, action, row) {
      if (!me) throw new Error('로그인이 필요합니다');
      if (table === 'erp_profiles' || table === 'erp_notifications' || table === 'erp_task_events' || table === 'erp_audit') return;
      if (table === 'erp_views') { if (!me.active) throw new Error('승인 후 사용할 수 있습니다'); if (action !== 'create' && row.owner && row.owner !== me.id && !(action === 'delete' && can('users', 'edit'))) throw new Error('내가 저장한 보기만 바꿀 수 있습니다'); row.owner = row.owner || me.id; return; }
      if (table === 'erp_requests') { if (!me.active) throw new Error('승인 후 사용할 수 있습니다'); return; }
      if (table === 'erp_uploads') return;
      if (table === 'erp_locks') { if (!can(row.module, action === 'create' ? 'close' : 'unlock')) throw new Error('마감 ' + (action === 'create' ? '확정' : '해제') + ' 권한이 없습니다'); return; }
      // 대표님 지시 · 할 일 (sql/29_ceo.sql)
      if (table === 'erp_ceo_items') { if (!ceoOk(true)) throw new Error('대표님 지시 · 할 일을 쓸 권한이 없습니다'); return; }
      if (table === 'erp_ceo_members') {
        const old = tbl('erp_ceo_members').find((x) => x.user_id === row.user_id);
        if (row.fixed && row.can_write === false) throw new Error('고정 인원은 쓰기 권한을 끌 수 없습니다');
        if (action === 'create' && !old) { if (ceoFixed()) return; if (!tbl('erp_ceo_members').length && can('users', 'edit') && row.user_id === me.id && row.fixed) return; throw new Error('명단은 행님 · 대표님(고정 인원)만 바꿀 수 있습니다'); }
        if (!ceoFixed()) throw new Error('명단은 행님 · 대표님(고정 인원)만 바꿀 수 있습니다');
        if (old && old.fixed) throw new Error('고정 인원은 빼거나 바꿀 수 없습니다');
        return;
      }
      // 팀장 자체 회의록 (sql/36_tlmeet.sql)
      if (table === 'erp_tl_meet') { if (!(action === 'delete' ? can('users', 'edit') : can('tlmeet', 'create'))) throw new Error(action === 'delete' ? '회의를 지우는 것은 관리자만 할 수 있습니다' : '회의록을 쓸 권한이 없습니다'); return; }
      if (table === 'erp_tl_item') {
        const old = action === 'create' ? null : tbl(table).find((x) => x.id === row.id);
        if (!tlOk(row.team) || (old && !tlOk(old.team))) throw new Error('이 팀 업무는 그 팀 팀장 · 관리자만 쓸 수 있습니다');
        if (!can('users', 'edit')) { const o = old || {}; if ((row.ceo || '') !== (o.ceo || '') || (row.gm || '') !== (o.gm || '')) throw new Error('대표님 · 총괄 지시사항은 관리자만 쓸 수 있습니다'); }
        return;
      }
      if (table === 'erp_tl_file') { const ok = tbl('erp_tl_item').some((i) => i.root === row.root && tlOk(i.team)); if (!(ok || (action === 'delete' && row.by_user === me.id))) throw new Error('이 업무에 파일을 붙이거나 지울 권한이 없습니다'); return; }
      const m = MOD_OF[table];
      if (table === 'erp_tasks' && action === 'edit' && !can('tasks', 'edit')) {
        if (!(can('tasks', 'progress') && (teamOk(row.assigned_team || '') || row.assignee === me.id))) throw new Error('이 업무를 처리할 권한이 없습니다');
        return;
      }
      if (table === 'erp_tasks' && action === 'create') { if (!(can('tasks', 'assign') || can('tasks', 'create'))) throw new Error('업무 등록 권한이 없습니다'); return; }
      if ((table === 'erp_teams' || table === 'erp_task_prices') && can('upload', 'create') && action === 'create') return;
      // 업무(공정) 추가 · 숨김 · 단가 변경은 [설정 › 원가관리 설정] 에서만 (sql/25_cost_admin.sql)
      //  · 관리자는 전 팀 · 팀장은 자기 팀만 (2026-11-12 · sql/27_cost_leader.sql)
      //  · 팀별 원가 관리 입력(업무일지) 화면에서는 아무도 못 고침
      if (table === 'erp_task_prices') {
        if (can('settings', 'edit')) return;
        if (action === 'create' && can('upload', 'create')) return;
        if (can('costset', 'edit') && teamOk(row.team)) return;
        throw new Error('업무 · 단가는 [설정 › 원가관리 설정] 에서 관리자 또는 그 팀 팀장만 바꿀 수 있습니다');
      }
      if (table === 'erp_headcount' && can('headcount', 'edit')) return; // 지원팀: 팀별 인원 확인 입력
      // 연도별 인건비: 관리자 · 엑셀 일괄 등록 (sql/26_team_year_cost.sql)
      if (table === 'erp_team_cost') { if (!(can('settings', 'edit') || (action !== 'delete' && can('upload', 'create')))) throw new Error('연도별 인건비는 관리자만 바꿀 수 있습니다 (설정 › 원가관리 설정)'); return; }
      if (table === 'erp_settings' && row.key === 'np_update' && can('newprod', 'create')) return;
      // 브랜드 완전 삭제는 관리자만 (sql/29_brand_delete.sql 과 동일 규칙 · 2026-11-13)
      if (table === 'erp_brands') { if (can('settings', 'edit')) return; if (action !== 'delete' && can('orders', 'create')) return; throw new Error('브랜드를 완전히 지우는 것은 관리자만 할 수 있습니다'); }
      if (table === 'erp_np_style' || table === 'erp_np_snap' || table === 'erp_np_raw') { if (!(can('newprod', 'create') || (action === 'edit' && can('newprod', 'edit')))) throw new Error('신상품 자료 권한이 없습니다'); return; }
      if (table === 'erp_cnt') { const ok = action === 'create' ? can('count', 'create') : action === 'delete' ? can('count', 'close') : (can('count', 'create') || can('count', 'edit') || can('count', 'close')); if (!ok) throw new Error('재고 실사 권한이 없습니다'); return; }
      if (table === 'erp_cnt_part') {
        const c = tbl('erp_cnt').find((x) => x.id === row.cnt_id); if (c && (c.status === '확정' || c.deleted_at) && !can('count', 'close')) throw new Error(c.deleted_at ? '지운 실사입니다' : '확정된 실사는 수정할 수 없습니다');
        if (can('count', 'create')) return;
        if ((row.kind === 'act' || row.kind === 're') && can('count', 'upload') && (action !== 'delete' || row.uploaded_by === me.id || can('count', 'delete'))) return;
        throw new Error('실사 자료 권한이 없습니다');
      }
      if (table === 'erp_season') { const ok = action === 'create' ? can('season', 'create') : action === 'delete' ? can('season', 'delete') : (can('season', 'create') || can('season', 'edit')); if (!ok) throw new Error('시즌 계획 권한이 없습니다'); return; }
      if (table === 'erp_season_act') { if (!(action === 'delete' ? can('season', 'edit') : (can('season', 'upload') || can('season', 'edit')))) throw new Error('시즌 실적 권한이 없습니다'); return; }
      // 이월팀 시즌반품정리현황 · 선지시출고현황 (sql/33_iwol.sql 과 같은 규칙) — 이월소터팀 + 관리자만 쓰기
      if (m === 'iwol') {
        if (!(can('iwol', 'create') && (((me.teams || []).indexOf('이월소터팀') >= 0) || can('users', 'edit')))) throw new Error('이월팀 자료는 이월소터팀 · 관리자만 올릴 수 있습니다');
        // 마감 확정한 기간은 고칠 수 없다 (sql/35_iwol_term.sql 과 같은 규칙)
        if (table !== 'erp_iw_term' && table !== 'erp_iw_set' && row.term && tbl('erp_iw_term').some((t) => t.term === row.term && t.closed)) throw new Error(row.term + ' 은(는) 마감한 기간이라 고칠 수 없습니다');
        if (table === 'erp_iw_term') throw new Error('마감 · 해제는 [마감 확정] 단추로만 할 수 있습니다');
        return;
      }
      if (table === 'erp_cs_order' || table === 'erp_cs_file' || table === 'erp_cs_part' || table === 'erp_cs_daily' || table === 'erp_cs_alloc' || table === 'erp_cs_close') { if (!can('csdata', 'create') || (table !== 'erp_cs_order' && table !== 'erp_cs_file')) throw new Error('전산자료 올리기 권한이 없습니다'); if (table === 'erp_cs_file' && action !== 'create') throw new Error('올린 기록은 고칠 수 없습니다'); return; }
      if (table === 'erp_volume') { if (!can('volume', 'create')) throw new Error('물동량 올리기 권한이 없습니다'); return; }
      if (table === 'erp_meet_book') { if (!can('meeting', 'edit')) throw new Error('월간 회의 자료 올리기 권한이 없습니다'); return; }
      if (table === 'erp_meet_note') { if (!can('meeting', 'edit')) throw new Error('월간 회의 작성 권한이 없습니다'); return; }
      if (table === 'erp_supply_item') { if (!can('supply', 'edit')) throw new Error('품목 관리 권한이 없습니다'); return; }
      if (table === 'erp_notice_read') { if (!me.active) throw new Error('승인 후 사용할 수 있습니다'); return; }
      if (table === 'erp_notice') { if (!can('notice', action)) throw new Error('공지 사항 권한이 없습니다'); return; }
      if (table === 'erp_supply') { // SQL erp_supply_guard 와 같은 규칙
        if (can('supply', 'edit') && action !== 'delete') return;
        if (action === 'delete') { if (can('supply', 'delete') || (can('supply', 'create') && row.req_by === me.id && row.status === '요청')) return; throw new Error('삭제 권한이 없습니다'); }
        if (!can('supply', 'create')) throw new Error('발주 요청 권한이 없습니다');
        if (action === 'create') { row.status = '요청'; row.req_by = me.id; return; }
        const o = tbl('erp_supply').find((x) => x.id === row.id) || {};
        if (o.req_by !== me.id) throw new Error('내가 요청한 건만 수정할 수 있습니다');
        if (o.status === '발주' && row.status === '입고') return;
        if (o.status !== '요청') throw new Error('이미 처리된 요청은 수정할 수 없습니다');
        if (row.status !== o.status) throw new Error('승인 · 발주는 관리팀만 할 수 있습니다');
        return;
      }
      if (table === 'erp_ret_done' || table === 'erp_ret_pend' || table === 'erp_ret_bag') { // SQL 07_returns.sql 과 동일
        const ok = action === 'create' ? can('returns', 'create') : action === 'delete' ? (can('returns', 'delete') || (table === 'erp_ret_bag' && can('returns', 'create') && row.updated_by === me.id)) : (can('returns', 'create') || can('returns', 'edit'));
        if (!ok) throw new Error('반품 관리 권한이 없습니다'); return;
      }
      if ((table === 'erp_kpi' || table === 'erp_kpi_day') && !teamOk(row.team)) throw new Error('담당 팀 KPI만 입력할 수 있습니다');
      if (!can(m, action)) throw new Error('권한이 없습니다 (' + m + '·' + action + ')');
      if (table === 'erp_worklog' && !teamOk(row.team)) throw new Error('담당 팀 자료만 입력할 수 있습니다');
      const lm = LOCK_MODULE[table];
      if (lm && locked(row[DATE_COL[table]], lm) && !can(lm, 'unlock')) throw new Error(row[DATE_COL[table]] + ' 마감된 자료는 관리자만 수정할 수 있습니다');
    }
    function audit(table, action, before, after) {
      // 이월팀 자료(erp_iw_*)는 한 번에 몇천 줄이 들어와서 수정 이력에 남기지 않는다 (실사이트에도 감사 트리거 없음)
      if (['erp_audit', 'erp_ceo_items', 'erp_notifications', 'erp_task_events', 'erp_uploads', 'erp_requests', 'erp_cnt_part', 'erp_ret_done', 'erp_ret_pend', 'erp_volume', 'erp_notice_read', 'erp_cs_order', 'erp_cs_file'].indexOf(table) >= 0 || table.indexOf('erp_iw_') === 0 || table.indexOf('erp_tl_') === 0) return;
      tbl('erp_audit').push({ id: nextId('erp_audit'), tbl: table, row_key: String((after || before || {}).id || (after || before || {}).rec_date || ''), action, before, after, by_user: me && me.id, at: now() });
    }
    function notify(uid, kind, title, body, ref) {
      const n = { id: nextId('erp_notifications'), user_id: uid, kind, title, body, ref_id: ref, created_at: now(), read_at: null };
      tbl('erp_notifications').push(n); emit('erp_notifications', 'INSERT', n);
    }
    // 업무 TO-DO 트리거 (SQL과 동일 규칙)
    function taskBefore(n, o) {
      if (o && !can('tasks', 'edit')) {
        for (const k of ['title', 'detail', 'assigned_team', 'due_date', 'brand', 'task_type', 'assigned_by']) if ((n[k] || null) !== (o[k] || null)) throw new Error('진행 상태·진행률·결과만 변경할 수 있습니다');
      }
      if (n.status === '완료') { n.progress = 100; if (!o || o.status !== '완료') { n.completed_at = n.completed_at || now(); n.completed_by = n.completed_by || (me && me.id); } }
      else if (o && o.status === '완료') { n.completed_at = null; n.completed_by = null; }
      if (n.status === '접수' && (!o || o.status !== '접수')) n.accepted_at = n.accepted_at || now();
      if (n.status === '진행중' && (!o || o.status !== '진행중')) { n.started_at = n.started_at || now(); n.accepted_at = n.accepted_at || now(); }
    }
    function taskAfter(n, o) {
      const who = me ? me.name : '';
      const ev = (memo) => tbl('erp_task_events').push({ id: nextId('erp_task_events'), task_id: n.id, at: now(), by_user: me && me.id, by_name: who, status: n.status, progress: n.progress, memo });
      const toTeam = () => tbl('erp_profiles').filter((p) => p.active && (p.teams || []).indexOf(n.assigned_team) >= 0 && p.id !== (me && me.id)).forEach((p) => notify(p.id, 'task_new', '새 업무 할당 · ' + n.assigned_team, (n.brand ? n.brand + ' · ' : '') + n.title, n.id));
      if (!o) { if (!n.source) { ev('등록'); if (n.assigned_team) toTeam(); } return; }
      if (n.status !== o.status || n.progress !== o.progress || (n.result || '') !== (o.result || '')) ev((n.result || '') !== (o.result || '') ? n.result : null);
      if (n.status === '완료' && o.status !== '완료' && n.assigned_by) notify(n.assigned_by, 'task_done', '완료 · ' + (n.assigned_team || '') + ' · ' + who, (n.brand ? n.brand + ' · ' : '') + n.title + (n.result ? ' / ' + n.result : ''), n.id);
      if (n.assigned_team && n.assigned_team !== o.assigned_team) toTeam();
    }
    function match(r, q) {
      q = q || {};
      for (const k in q.eq || {}) if (r[k] !== q.eq[k]) return false;
      for (const k in q.neq || {}) if (r[k] === q.neq[k]) return false;
      for (const k in q.gte || {}) if (!(r[k] >= q.gte[k])) return false;
      for (const k in q.lte || {}) if (!(r[k] <= q.lte[k])) return false;
      for (const k in q.in || {}) if (q.in[k].indexOf(r[k]) < 0) return false;
      for (const k in q.is || {}) if ((r[k] == null) !== (q.is[k] == null)) return false;
      return true;
    }
    function visible(table, r) {
      if (!me) return false;
      if (table === 'erp_notifications') return r.user_id === me.id;
      if (table === 'erp_ceo_items') return ceoOk(false); // 명단에 없으면 관리자라도 0줄
      if (table === 'erp_ceo_members') return ceoOk(false) || can('users', 'view');
      if (table === 'erp_views') return !!(me.active && (r.shared || r.owner === me.id));
      if (table === 'erp_worklog') return can('worklog', 'view'); // 원가 관리 전체 공개 (입력은 담당 팀만)
      if (table === 'erp_kpi' || table === 'erp_kpi_day') return can('kpi', 'view') && teamOk(r.team);
      if (MOD_OF[table] && ['orders', 'newprod', 'count', 'season', 'anseong', 'csdata', 'iwol'].indexOf(MOD_OF[table]) >= 0) return can(MOD_OF[table], 'view');
      if (table === 'erp_volume') return can('volume', 'view') || can('meeting', 'view');
      if (table === 'erp_meet_note') return can('meeting', 'view');
      if (table === 'erp_supply' || table === 'erp_supply_item') return can('supply', 'view');
      if (table === 'erp_notice') return !!me.active;
      if (table === 'erp_notice_read') return r.user_id === me.id || can('notice', 'create');
      if (table === 'erp_tasks') return can('tasks', 'view') && (!r.assigned_team || teamOk(r.assigned_team) || r.assigned_by === me.id || r.assignee === me.id);
      if (MOD_OF[table] === 'tlmeet') return can('tlmeet', 'view');
      if (table === 'erp_gone_user') return !!me.active; // 지운 사람 이름을 찾는 데 쓰므로 모두 볼 수 있음
      if (table === 'erp_audit') return can('users', 'view');
      return true;
    }
    function seed() {
      const P = (o) => o;
      T.erp_centers = [{ id: 'gobaek', name: '고백리센터', owners: ['크리스', 'LX', '로라'], sort: 1 }, { id: 'anseong', name: '안성센터', owners: ['네파'], sort: 2 }];
      T.erp_teams = [['정상1팀', 'gobaek', 160390, 30073.125], ['이월소터팀', 'gobaek', 163406, 0], ['입고반품팀', 'gobaek', 157695, 0], ['온라인팀', 'gobaek', 156929, 0], ['로라팀', 'gobaek', 220000, 0], ['별도인원', 'gobaek', 160000, 0], ['안성센터', 'anseong', 157445, 29520.9375]].map((t, i) => ({ name: t[0], center_id: t[1], labor_cost: t[2], ot_rate: t[3], sort: i + 1, active: true })); // 별도인원도 2026-11-11 부터 사용 (sql/25_cost_admin.sql)
      // 연도별 인건비: 올해 줄을 팀 값 그대로 (sql/26_team_year_cost.sql 의 채워 넣기와 같음)
      T.erp_team_cost = T.erp_teams.map((t) => ({ team: t.name, year: new Date().getFullYear(), labor_cost: t.labor_cost, ot_rate: t.ot_rate, memo: '기준정보에서 옮김' }));
      const A = { view: true, create: true, edit: true, delete: true, close: true, unlock: true };
      T.erp_roles = [
        { id: 'admin', name: '관리자', level: 90, scope: 'all', memo: '전체 권한 · 마감 해제 · 등급 관리', perms: { dashboard: { view: true }, worklog: A, daily: A, tasks: { view: true, create: true, edit: true, delete: true, assign: true, progress: true }, returns: A, settlement: { view: true, create: true, edit: true, delete: true }, anseong: { view: true, edit: true }, upload: { view: true, create: true }, users: { view: true, edit: true, delete: true }, settings: { view: true, edit: true }, requests: { view: true, create: true, edit: true } } },
        { id: 'ceo', name: '대표', level: 100, scope: 'all', memo: '전체 열람', perms: { dashboard: { view: true }, worklog: { view: true }, daily: { view: true }, tasks: { view: true }, returns: { view: true }, settlement: { view: true }, anseong: { view: true }, upload: { view: true }, users: { view: true }, settings: { view: true }, requests: { view: true, create: true } } },
        { id: 'support', name: '업무지원팀', level: 60, scope: 'all', memo: '업무 할당 · 마감보고 작성', perms: { dashboard: { view: true }, worklog: { view: true, close: true }, daily: { view: true, create: true, edit: true, close: true }, tasks: { view: true, create: true, edit: true, assign: true, progress: true }, returns: { view: true, create: true, edit: true }, settlement: { view: true, create: true, edit: true }, anseong: { view: true }, upload: { view: true, create: true }, requests: { view: true, create: true } } },
        { id: 'leader', name: '현장 팀장', level: 40, scope: 'own_team', memo: '자기 팀 업무일지 · 업무 진행', perms: { dashboard: { view: true }, worklog: { view: true, create: true, edit: true }, daily: { view: true }, tasks: { view: true, progress: true }, returns: { view: true, create: true, edit: true }, anseong: { view: true }, requests: { view: true, create: true } } },
        { id: 'staff', name: '실무진', level: 20, scope: 'own_team', memo: '자기 팀 업무 진행 처리', perms: { dashboard: { view: true }, worklog: { view: true }, tasks: { view: true, progress: true }, returns: { view: true }, requests: { view: true, create: true } } },
        { id: 'pending', name: '승인 대기', level: 0, scope: 'own_team', memo: '가입 후 관리자 승인 전', perms: {} },
      ];
      T.erp_roles.forEach((r) => { if (NEW_PERMS9[r.id]) Object.assign(r.perms, JSON.parse(JSON.stringify(NEW_PERMS9[r.id]))); if (NEW_PERMS8[r.id]) Object.assign(r.perms, JSON.parse(JSON.stringify(NEW_PERMS8[r.id]))); if (NEW_PERMS[r.id]) Object.assign(r.perms, JSON.parse(JSON.stringify(NEW_PERMS[r.id]))); if (NEW_PERMS2[r.id]) Object.assign(r.perms, JSON.parse(JSON.stringify(NEW_PERMS2[r.id]))); if (NEW_PERMS3[r.id]) Object.assign(r.perms, JSON.parse(JSON.stringify(NEW_PERMS3[r.id]))); if (NEW_PERMS4[r.id]) Object.assign(r.perms, JSON.parse(JSON.stringify(NEW_PERMS4[r.id]))); if (NEW_PERMS5[r.id] && r.perms.count && r.perms.count.delete == null) r.perms.count.delete = true; if (NEW_PERMS6[r.id] && r.perms.csdata && r.perms.csdata.close == null) r.perms.csdata.close = true; if (NEW_PERMS7[r.id] && !r.perms.headcount) Object.assign(r.perms, JSON.parse(JSON.stringify(NEW_PERMS7[r.id]))); });
      T.erp_roles.forEach((r) => { if (NEW_PERMS10[r.id]) Object.assign(r.perms, JSON.parse(JSON.stringify(NEW_PERMS10[r.id]))); });
      const B = [['핑', '크리스'], ['고커', '크리스'], ['팬텀', '크리스'], ['파리게이츠', '크리스'], ['마스터바니', '크리스'], ['세인트앤드류스', '크리스'], ['링스', 'LX컴퍼니'], ['V12', 'LX컴퍼니'], ['베셀', '크리스'], ['하이드로겐', '크리스'], ['마무트', '크리스'], ['앤드원더', '크리스'], ['보기보이즈', '슈퍼윅스'], ['로라애슐리', '로라애슐리'], ['용품볼', '크리스'], ['네파', '네파']];
      T.erp_brands = B.map((b, i) => ({ name: b[0], owner: b[1], center_id: b[0] === '네파' ? 'anseong' : 'gobaek', b2b: true, b2c: true, sort: i + 1, active: true, en: (BRAND_EXT[b[0]] || [])[0], code: (BRAND_EXT[b[0]] || [])[1], aliases: (BRAND_EXT[b[0]] || [])[2] || [] }));
      T.erp_settings = [{ key: 'anseong', value: { mode: 'same_project', datasets: [] } }];
      // 시연용 계정 (로컬 모드 전용)
      T.erp_profiles = [
        P({ id: 'u-admin', login_id: 'admin', password: 'admin1234', name: '관리자', dept: '관리부', title: '차장', role_id: 'admin', teams: [], active: true }),
        P({ id: 'u-support', login_id: 'support', password: '1234', name: '업무지원', dept: '업무지원팀', title: '대리', role_id: 'support', teams: [], active: true }),
        P({ id: 'u-leader', login_id: 'leader', password: '1234', name: '정상팀장', dept: '정상1팀', title: '팀장', role_id: 'leader', teams: ['정상1팀'], active: true }),
        P({ id: 'u-staff', login_id: 'staff', password: '1234', name: '정상실무', dept: '정상1팀', title: '사원', role_id: 'staff', teams: ['정상1팀'], active: true }),
      ];
      persist();
    }
    function kpiSync(d, team) { // SQL erp_kpi_sync 와 동일
      if (!(can('kpi', 'edit') || can('kpi', 'create')) || !teamOk(team)) throw new Error('KPI 입력 권한이 없습니다');
      if (locked(d, 'kpi') && !can('kpi', 'unlock')) throw new Error('KPI 입력 권한이 없습니다');
      if (locked(d, 'worklog') && !can('worklog', 'unlock')) throw new Error(d + ' 업무일지가 마감되어 원가에 반영할 수 없습니다');
      const st = tbl('erp_settings').find((x) => x.key === 'kpi_map'); const m = st && st.value && st.value[team]; if (!m) return 0;
      const day = tbl('erp_kpi_day').find((x) => x.work_date === d && x.team === team) || {};
      const val = (sh, mt) => tbl('erp_kpi').filter((x) => x.work_date === d && x.team === team && x.sheet === sh && x.brand === '' && x.metric === mt).reduce((a, x) => a + (+x.value || 0), 0);
      const t = tbl('erp_worklog'); let n = 0;
      for (const e of m) {
        const q = (e.qty || []).reduce((a, p) => a + val(p[0], p[1]), 0);
        const to = (e.to || []).reduce((a, p) => a + (p[0] === 'day' ? (+day[p[1] === 'office' ? 'office_count' : 'field_count'] || 0) : val(p[0], p[1])), 0);
        const pr = tbl('erp_task_prices').find((x) => x.team === team && x.grp === (e.grp || '') && x.task === e.task);
        const row = { work_date: d, team, grp: e.grp || '', task: e.task, unit_price: pr ? +pr.unit_price : 0, qty: q, to_count: to, note: 'KPI 자동', updated_at: now(), updated_by: me.id };
        const i = t.findIndex((x) => x.work_date === d && x.team === team && x.grp === row.grp && x.task === row.task);
        if (i >= 0) { const before = t[i]; t[i] = Object.assign({}, before, row); audit('erp_worklog', 'UPDATE', before, t[i]); emit('erp_worklog', 'UPDATE', t[i], before); } else { const nr = Object.assign({ id: nextId('erp_worklog') }, row); t.push(nr); audit('erp_worklog', 'INSERT', null, nr); emit('erp_worklog', 'INSERT', nr); }
        n++;
      }
      if (day.ot_hours != null || day.ot_people != null) { const w = tbl('erp_worklog_day'); const i = w.findIndex((x) => x.work_date === d && x.team === team); const r = { work_date: d, team, ot_hours: +day.ot_hours || 0, ot_people: +day.ot_people || 0 }; if (i >= 0) w[i] = Object.assign({}, w[i], r); else w.push(Object.assign({ status: '작성중' }, r)); }
      persist(); return n;
    }
    const self = {
      mode: 'local',
      ready: load(),
      async login(id, pw) {
        await self.ready;
        const p = tbl('erp_profiles').find((x) => x.login_id === id && x.password === pw);
        if (!p) throw new Error('아이디 또는 비밀번호가 맞지 않습니다');
        me = p; try { sessionStorage.setItem('hs-local-uid', p.id); } catch (e) { /* 무시 */ }
        return self.session();
      },
      async signup(f) {
        await self.ready;
        if (tbl('erp_profiles').some((x) => x.login_id === f.login_id)) throw new Error('이미 있는 아이디입니다');
        const p = { id: 'u-' + Date.now().toString(36), login_id: f.login_id, password: f.password, name: f.name, dept: f.dept, title: f.title, phone: f.phone, role_id: 'pending', teams: [], active: false, created_at: now() };
        tbl('erp_profiles').push(p); persist(); me = p;
        try { sessionStorage.setItem('hs-local-uid', p.id); } catch (e) { /* 무시 */ }
        return self.session();
      },
      async logout() { me = null; try { sessionStorage.removeItem('hs-local-uid'); } catch (e) { /* 무시 */ } },
      async mfaState() { return { current: 'aal2', next: 'aal2', factors: [], local: true }; }, // 로컬 모드는 한 PC 시연용 → 2단계 인증 없음
      async session() {
        await self.ready;
        if (!me) { let id = null; try { id = sessionStorage.getItem('hs-local-uid'); } catch (e) { /* 무시 */ } me = tbl('erp_profiles').find((x) => x.id === id) || null; }
        if (!me) return null;
        const r = role(); const o = Object.assign({}, me, { role: r }); delete o.password; return o;
      },
      async list(table, q) {
        await self.ready;
        q = q || {};
        let rows = tbl(table).filter((r) => match(r, q) && visible(table, r));
        if (q.order) { const [c, asc] = q.order; rows = rows.slice().sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc === false ? -1 : 1)); }
        if (q.limit) rows = rows.slice(0, q.limit);
        return rows.map((r) => { const o = Object.assign({}, r); delete o.password; return o; });
      },
      async upsert(table, rows, onProgress) {
        await self.ready;
        const t = tbl(table); const ix = new Map(t.map((r, i) => [keyOf(table, r), i]));
        let n = 0;
        for (const row of rows) {
          const k = keyOf(table, row); const i = ix.get(k);
          if (i != null) { check(table, 'edit', Object.assign({}, t[i], row)); const before = t[i]; const nr = Object.assign({}, before, row, { updated_at: now(), updated_by: me && me.id }); if (table === 'erp_tasks') taskBefore(nr, before); if (table === 'erp_tl_item') tlBefore(nr, before); t[i] = nr; audit(table, 'UPDATE', before, nr); if (table === 'erp_tasks') taskAfter(nr, before); emit(table, 'UPDATE', nr, before); }
          else { check(table, 'create', row); const nr = Object.assign({ id: nextId(table), created_at: now() }, row, { updated_at: now(), updated_by: me && me.id }); if (table === 'erp_tasks') { nr.status = nr.status || '요청'; nr.progress = nr.progress || 0; taskBefore(nr, null); } if (table === 'erp_tl_item') tlBefore(nr, null); t.push(nr); ix.set(k, t.length - 1); audit(table, 'INSERT', null, nr); if (table === 'erp_tasks') taskAfter(nr, null); emit(table, 'INSERT', nr); }
          n++; if (onProgress && n % 500 === 0) onProgress(n, rows.length);
        }
        if (onProgress) onProgress(n, rows.length);
        persist(); return n;
      },
      async insert(table, row) {
        await self.ready;
        check(table, 'create', row);
        const nr = Object.assign({ id: nextId(table), created_at: now() }, row, { updated_at: now() });
        if (table === 'erp_tasks') { nr.assigned_by = nr.assigned_by || (me && me.id); nr.status = nr.status || '요청'; nr.progress = nr.progress || 0; taskBefore(nr, null); }
        if (table === 'erp_requests') { nr.created_by = me.id; nr.created_name = me.name; nr.status = nr.status || '접수'; }
        if (table === 'erp_uploads') nr.by_user = me && me.id;
        if (table === 'erp_cs_file') { nr.at = nr.at || now(); nr.by_user = me && me.id; }
        if (table === 'erp_tl_item') { nr.status = nr.status || 'run'; nr.pct = nr.pct || 0; nr.carried = !!nr.carried; nr.created_by = me && me.id; tlBefore(nr, null); }
        if (table === 'erp_tl_file') { nr.at = nr.at || now(); nr.by_user = me && me.id; }
        tbl(table).push(nr); audit(table, 'INSERT', null, nr);
        if (table === 'erp_tasks') taskAfter(nr, null);
        emit(table, 'INSERT', nr); persist(); return Object.assign({}, nr);
      },
      async update(table, m, patch) {
        await self.ready;
        const t = tbl(table); const out = [];
        for (let i = 0; i < t.length; i++) {
          if (!match(t[i], { eq: m }) || !visible(table, t[i])) continue;
          const before = t[i]; const nr = Object.assign({}, before, patch, { updated_at: now() });
          if (table === 'erp_profiles' && me.id === before.id && !can('users', 'edit')) { for (const k of ['role_id', 'active', 'teams', 'login_id']) if (JSON.stringify(nr[k]) !== JSON.stringify(before[k])) throw new Error('등급·승인·담당팀은 관리자만 변경할 수 있습니다'); }
          else if (table === 'erp_profiles' && !can('users', 'edit') && me.id !== before.id) throw new Error('권한이 없습니다');
          else check(table, 'edit', nr);
          if (table === 'erp_locks') check(table, 'unlock', nr);
          if (table === 'erp_tasks') taskBefore(nr, before);
          if (table === 'erp_tl_item') tlBefore(nr, before);
          t[i] = nr; audit(table, 'UPDATE', before, nr);
          if (table === 'erp_tasks') taskAfter(nr, before);
          emit(table, 'UPDATE', nr, before); out.push(nr);
          if (table === 'erp_profiles' && me && me.id === nr.id) me = nr;
        }
        if (!out.length) throw new Error('권한이 없거나 대상이 없습니다');
        persist(); return out;
      },
      async remove(table, m) {
        await self.ready;
        const t = tbl(table); const keep = [], del = [];
        for (const r of t) { if (match(r, { eq: m }) && visible(table, r)) { if (table === 'erp_locks') check(table, 'unlock', r); else if (table !== 'erp_notifications') check(table, 'delete', r); del.push(r); } else keep.push(r); }
        T[table] = keep; del.forEach((r) => { audit(table, 'DELETE', r, null); emit(table, 'DELETE', null, r); }); persist(); return del;
      },
      async rpc(fn) {
        await self.ready;
        if (fn === 'erp_anseong_tables') return [];
        if (fn === 'erp_bootstrap_admin') return 'already';
        if (fn === 'erp_usage' || fn === 'erp_usage_snap') { if (!can('users', 'view')) { if (fn === 'erp_usage') return null; throw new Error('권한이 없습니다'); }
          const tb = Object.keys(T).filter((k) => k !== 'erp_usage_log').map((k) => ({ name: k, bytes: JSON.stringify(T[k]).length })).sort((a, b) => b.bytes - a.bytes); const db = tb.reduce((x, t) => x + t.bytes, 0);
          if (fn === 'erp_usage_snap') { const d = HS.today ? HS.today() : now().slice(0, 10); T.erp_usage_log = tbl('erp_usage_log').filter((r) => r.d !== d); const r = { d, db_bytes: db, file_bytes: 0, tables: tb, at: now() }; T.erp_usage_log.push(r); persist(); return r; }
          return { db_bytes: db, limit_bytes: 500 * 1024 * 1024, file_bytes: 0, file_limit: 1024 * 1024 * 1024, tables: tb.slice(0, 40), hist: tbl('erp_usage_log').slice().sort((a, b) => (a.d < b.d ? -1 : 1)).map((r) => ({ d: r.d, db: r.db_bytes, file: r.file_bytes, tables: r.tables, at: r.at })), cron: false, local: true }; }
        // 팀장 자체 회의록 (sql/36_tlmeet.sql 과 같은 규칙)
        if (fn === 'erp_tl_new_meet' || fn === 'erp_tl_del_item' || fn === 'erp_tl_del_meet') {
          const a = arguments[1] || {};
          if (fn === 'erp_tl_new_meet') {
            if (!can('tlmeet', 'create')) throw new Error('회의를 만들 권한이 없습니다');
            const d = String(a.p_d || ''); if (!d) throw new Error('회의 날짜를 넣어 주세요');
            if (tbl('erp_tl_meet').some((x) => x.id === d)) return { id: d, carried: 0, existed: true };
            const m = { id: d, d, title: String(a.p_title || '').trim() || '주간 팀장 회의', created_by: me.id, created_at: now(), updated_at: now() };
            const prev = tbl('erp_tl_meet').filter((x) => x.d < d).sort((x, y) => (x.d < y.d ? 1 : -1))[0]; let n = 0;
            tbl('erp_tl_meet').push(m);
            if (prev) tbl('erp_tl_item').filter((i) => i.meet_id === prev.id && i.status !== 'done').forEach((i) => { tbl('erp_tl_item').push(Object.assign({}, i, { id: d + '-' + Math.random().toString(36).slice(2, 12), meet_id: d, carried: true, created_by: me.id, created_at: now(), updated_at: now() })); n++; });
            persist(); emit('erp_tl_meet', 'INSERT', m); return { id: d, carried: n, from: prev ? prev.id : null, existed: false };
          }
          const orphan = (roots) => { const left = new Set(tbl('erp_tl_item').map((i) => i.root)); const gone = tbl('erp_tl_file').filter((f) => roots.indexOf(f.root) >= 0 && !left.has(f.root)); T.erp_tl_file = tbl('erp_tl_file').filter((f) => gone.indexOf(f) < 0); return gone.map((f) => f.path); };
          if (fn === 'erp_tl_del_item') {
            const it = tbl('erp_tl_item').find((x) => x.id === a.p_id); if (!it) throw new Error('없는 업무입니다');
            if (!tlOk(it.team)) throw new Error('이 팀 업무를 지울 권한이 없습니다');
            T.erp_tl_item = tbl('erp_tl_item').filter((x) => x !== it); const p = orphan([it.root]); persist(); emit('erp_tl_item', 'DELETE', null, it); return p;
          }
          if (!can('users', 'edit')) throw new Error('회의를 지우는 것은 관리자만 할 수 있습니다');
          const rs = Array.from(new Set(tbl('erp_tl_item').filter((x) => x.meet_id === a.p_id).map((x) => x.root)));
          T.erp_tl_meet = tbl('erp_tl_meet').filter((x) => x.id !== a.p_id); T.erp_tl_item = tbl('erp_tl_item').filter((x) => x.meet_id !== a.p_id);
          const p = orphan(rs); persist(); emit('erp_tl_meet', 'DELETE', null, { id: a.p_id }); return p;
        }
        // 관리자가 계정을 바로 만들기 (sql/32_add_user.sql)
        if (fn === 'erp_add_user') {
          const a = arguments[1] || {}; if (!can('users', 'edit')) throw new Error('사용자를 만들 권한이 없습니다');
          const lid = String(a.p_login_id || '').trim().toLowerCase(); const nm = String(a.p_name || '').trim();
          if (!/^[a-z0-9._-]{3,30}$/.test(lid)) throw new Error('아이디는 영문 소문자 · 숫자 · . _ - 로 3~30자입니다');
          if (!a.p_password || String(a.p_password).length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다');
          if (!nm) throw new Error('이름을 넣어 주세요');
          if (!tbl('erp_roles').some((r) => r.id === a.p_role)) throw new Error('없는 등급입니다: ' + a.p_role);
          if (tbl('erp_profiles').some((x) => String(x.login_id || '').toLowerCase() === lid)) throw new Error('이미 있는 아이디입니다: ' + lid);
          const id = 'u-' + lid;
          tbl('erp_profiles').push({ id, login_id: lid, password: a.p_password, name: nm, dept: a.p_dept || null, title: a.p_title || null, phone: a.p_phone || null, role_id: a.p_role, teams: a.p_teams || [], active: true, created_at: now(), updated_at: now() });
          persist(); return { id, login_id: lid, email: lid + '@hyeseong.erp', name: nm, role: a.p_role };
        }
        // 이월팀 운영 기간 · 마감 확정 · 넘기기 (sql/35_iwol_term.sql)
        if (fn === 'erp_iw_close_preview' || fn === 'erp_iw_close' || fn === 'erp_iw_reopen') {
          const a = arguments[1] || {}; const tm = String(a.p_term || '');
          const closedOf = (t) => tbl('erp_iw_term').some((x) => x.term === t && x.closed);
          const nextOf = (t) => (t.slice(-2) === 'H1' ? t.slice(0, 4) + 'H2' : String(+t.slice(0, 4) + 1) + 'H1');
          if (fn === 'erp_iw_reopen') {
            if (!can('users', 'edit')) throw new Error('마감 해제는 관리자만 할 수 있습니다');
            const t = tbl('erp_iw_term').find((x) => x.term === tm); if (!t) throw new Error('없는 기간입니다: ' + tm);
            t.closed = false; t.closed_at = null; t.closed_by = null; persist(); return { term: tm, closed: false };
          }
          // 안 끝난 것 고르기 — 배분지시: 지시 − 그 품번 출고 · 정리 기준: 대상 − 그 품번 실적
          const sh = {}; tbl('erp_iw_shp').filter((r) => r.term === tm).forEach((r) => { const o = sh[r.style] || (sh[r.style] = { store: 0, online: 0, rest: 0 }); o[r.kind] = (o[r.kind] || 0) + (+r.qty || 0); });
          const ct = {}; tbl('erp_iw_cnt').filter((r) => r.term === tm).forEach((r) => { ct[r.style] = (ct[r.style] || 0) + (+r.qty || 0); });
          const g0 = (x) => Math.max(0, x);
          const ordC = tbl('erp_iw_ord').filter((r) => r.term === tm).map((r) => { const s = sh[r.style] || {};
            return Object.assign({}, r, { store: g0((+r.store || 0) - (s.store || 0)), online: g0((+r.online || 0) - (s.online || 0)), rest: g0((+r.rest || 0) - (s.rest || 0)) }); })
            .filter((r) => r.store + r.online + r.rest > 0);
          const invC = tbl('erp_iw_inv').filter((r) => r.term === tm).map((r) => Object.assign({}, r, { qty: g0((+r.qty || 0) - (ct[r.style] || 0)) })).filter((r) => r.qty > 0);
          if (fn === 'erp_iw_close_preview') {
            return { term: tm, next: nextOf(tm), closed: closedOf(tm),
              ord_styles: ordC.length, ord_qty: ordC.reduce((a2, r) => a2 + r.store + r.online + r.rest, 0),
              inv_styles: invC.length, inv_qty: invC.reduce((a2, r) => a2 + r.qty, 0),
              ord_all: tbl('erp_iw_ord').filter((r) => r.term === tm).length, inv_all: tbl('erp_iw_inv').filter((r) => r.term === tm).length,
              shp_rows: tbl('erp_iw_shp').filter((r) => r.term === tm).length, cnt_rows: tbl('erp_iw_cnt').filter((r) => r.term === tm).length };
          }
          if (!can('users', 'edit')) throw new Error('마감 확정은 관리자만 할 수 있습니다');
          if (closedOf(tm)) throw new Error('이미 마감한 기간입니다');
          if (!tbl('erp_iw_ord').some((r) => r.term === tm) && !tbl('erp_iw_inv').some((r) => r.term === tm)) throw new Error('이 기간에는 올린 자료가 없습니다');
          const nx = nextOf(tm);
          const lbl = (t) => t.slice(0, 4) + (t.slice(-2) === 'H1' ? ' 상반기' : ' 하반기');
          [tm, nx].forEach((t) => { if (!tbl('erp_iw_term').some((x) => x.term === t)) tbl('erp_iw_term').push({ term: t, label: lbl(t), closed: false, created_at: now() }); });
          let n1 = 0, n2 = 0;
          ordC.forEach((r) => { if (tbl('erp_iw_ord').some((x) => x.term === nx && x.style === r.style)) return;
            tbl('erp_iw_ord').push({ term: nx, style: r.style, brand: r.brand, season: r.season, cls: r.cls, grp: r.grp, store: r.store, online: r.online, rest: r.rest, at: now() }); n1++; });
          invC.forEach((r) => { if (tbl('erp_iw_inv').some((x) => x.term === nx && x.style === r.style)) return;
            tbl('erp_iw_inv').push({ term: nx, style: r.style, brand: r.brand, season: r.season, cls: r.cls, grp: r.grp, qty: r.qty, at: now() }); n2++; });
          const t0 = tbl('erp_iw_term').find((x) => x.term === tm);
          t0.closed = true; t0.closed_at = now(); t0.closed_by = me ? me.name : '';
          persist(); return { term: tm, next: nx, ord_moved: n1, inv_moved: n2 };
        }
        // 사용자 삭제 · 아이디 · 비밀번호 바꾸기 (sql/34_user_admin.sql)
        if (fn === 'erp_del_user' || fn === 'erp_set_password' || fn === 'erp_set_login_id') {
          const a = arguments[1] || {};
          const u = tbl('erp_profiles').find((x) => x.id === a.p_id);
          if (fn === 'erp_del_user') {
            if (!can('users', 'delete')) throw new Error('사용자를 지울 권한이 없습니다');
            if (me && a.p_id === me.id) throw new Error('자기 자신은 지울 수 없습니다');
            if (!u) throw new Error('없는 사용자입니다');
            if (String(a.p_name || '').trim() !== u.name) throw new Error('이름이 다릅니다 — 지울 사람 이름을 그대로 넣어 주세요');
            if (u.role_id === 'admin' && !tbl('erp_profiles').some((x) => x.role_id === 'admin' && x.active && x.id !== u.id)) throw new Error('관리자가 한 명뿐입니다 — 다른 관리자를 먼저 만들어 주세요');
            T.erp_gone_user = tbl('erp_gone_user').filter((x) => x.id !== u.id);
            T.erp_gone_user.push({ id: u.id, login_id: u.login_id, name: u.name, dept: u.dept || null, title: u.title || null, role_id: u.role_id, at: now(), by_name: me ? me.name : '' });
            tbl('erp_tasks').forEach((t) => { ['assignee', 'assigned_by', 'completed_by'].forEach((k) => { if (t[k] === u.id) t[k] = null; }); });
            ['erp_notifications', 'erp_views', 'erp_ceo_members', 'erp_notice_read'].forEach((t) => { T[t] = tbl(t).filter((r) => (r.user_id || r.owner) !== u.id); });
            T.erp_profiles = tbl('erp_profiles').filter((x) => x.id !== u.id);
            persist(); return { id: u.id, name: u.name, login_id: u.login_id };
          }
          if (!can('users', 'edit')) throw new Error(fn === 'erp_set_password' ? '비밀번호를 바꿀 권한이 없습니다' : '아이디를 바꿀 권한이 없습니다');
          if (!u) throw new Error('없는 사용자입니다');
          if (fn === 'erp_set_password') {
            if (!a.p_password || String(a.p_password).length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다');
            u.password = String(a.p_password); u.updated_at = now(); persist();
            return { id: u.id, name: u.name, login_id: u.login_id };
          }
          const lid = String(a.p_login_id || '').trim().toLowerCase();
          if (!/^[a-z0-9._-]{3,30}$/.test(lid)) throw new Error('아이디는 영문 소문자 · 숫자 · . _ - 로 3~30자입니다');
          if (lid === String(u.login_id || '').toLowerCase()) return { id: u.id, login_id: u.login_id, same: true };
          if (tbl('erp_profiles').some((x) => String(x.login_id || '').toLowerCase() === lid && x.id !== u.id)) throw new Error('이미 있는 아이디입니다: ' + lid);
          u.login_id = lid; u.updated_at = now(); persist();
          return { id: u.id, login_id: lid, email: lid + '@hyeseong.erp', name: u.name };
        }
        // 수정 이력 자동 지우기 (sql/31_audit_trim.sql) · 저장 공간 정리 (sql/24_purge.sql)
        if (fn === 'erp_audit_trim_info' || fn === 'erp_audit_trim_set' || fn === 'erp_audit_trim' || fn === 'erp_purge' || fn === 'erp_purge_count') {
          const a = arguments[1] || {};
          const monthsOf = () => { const s = tbl('erp_settings').find((r) => r.key === 'audit_keep_months'); const v = s && s.value ? +s.value.months : NaN; return isNaN(v) ? 24 : v; };
          const cutAt = (mo) => { const d = new Date(); d.setMonth(d.getMonth() - mo); return d.toISOString(); };
          const infoOf = () => { const mo = monthsOf(); const c = cutAt(mo); return { months: mo, old: mo > 0 ? tbl('erp_audit').filter((r) => r.at < c).length : 0, cron: false }; };
          if (fn === 'erp_audit_trim_info') { if (!can('users', 'view')) throw new Error('수정 이력 권한이 없습니다'); return infoOf(); }
          if (fn === 'erp_audit_trim_set') { if (!can('users', 'edit')) throw new Error('수정 이력 설정 권한이 없습니다'); const mo = +a.p_months; if (!(mo >= 0 && mo <= 120)) throw new Error('기간이 올바르지 않습니다'); T.erp_settings = tbl('erp_settings').filter((r) => r.key !== 'audit_keep_months'); T.erp_settings.push({ key: 'audit_keep_months', value: { months: mo }, updated_at: now() }); persist(); return infoOf(); }
          if (!can('users', 'edit')) throw new Error(fn === 'erp_audit_trim' ? '수정 이력 정리 권한이 없습니다' : '저장 공간 정리 권한이 없습니다');
          if (fn === 'erp_audit_trim') { const mo = monthsOf(); if (mo <= 0) return 0; const c = cutAt(mo); const b = tbl('erp_audit').length; T.erp_audit = tbl('erp_audit').filter((r) => r.at >= c); persist(); return b - T.erp_audit.length; }
          const P = { retired: [['erp_task_events', null], ['erp_tasks', null], ['erp_supply', null], ['erp_notifications', null]], meetbook: [['erp_meet_book', 'ym'], ['erp_meet_note', 'ym']], audit: [['erp_audit', 'at']], uploads: [['erp_uploads', 'at']] }[a.p_kind];
          if (!P) throw new Error('모르는 정리 항목입니다: ' + a.p_kind);
          if (a.p_kind !== 'retired' && !a.p_before) throw new Error('언제 이전 것을 지울지 날짜가 없습니다');
          const go = fn === 'erp_purge'; const res = {};
          P.forEach(([t, c]) => { const cut = c === 'ym' ? String(a.p_before).slice(0, 7) : a.p_before; const keep = c ? tbl(t).filter((r) => !(String(r[c] || '') < cut)) : []; res[t] = tbl(t).length - keep.length; if (go) T[t] = keep; });
          if (go) persist();
          return res;
        }
        if (fn === 'erp_as_set_opts') { const a = arguments[1]; if (!can('anseong', 'edit')) throw new Error('안성 연동 설정 권한이 없습니다'); let t = a.p_types || []; if (t.indexOf('daily') < 0) t = ['daily'].concat(t); const v = { types: t, keep_months: Math.max(1, Math.min(36, a.p_keep || 3)) }; T.erp_settings = tbl('erp_settings').filter((r) => r.key !== 'anseong_opts'); T.erp_settings.push({ key: 'anseong_opts', value: v }); persist(); return v; }
        if (fn === 'erp_as_trim') { const a = arguments[1] || {}; if (!can('anseong', 'edit')) throw new Error('안성 연동 설정 권한이 없습니다'); const o = tbl('erp_settings').find((r) => r.key === 'anseong_opts'); const k = a.p_keep || (o && o.value.keep_months) || 3; const dt = new Date(); dt.setMonth(dt.getMonth() - k); const cut = dt.toISOString().slice(0, 10); let n = 0;
          [['erp_as_ret', 'work_date'], ['erp_as_sorter', 'date'], ['erp_as_inv_daily', 'date']].forEach(([t, c]) => { const b = tbl(t).length; T[t] = tbl(t).filter((r) => r[c] >= cut); n += b - T[t].length; }); persist(); return n; }
        if (fn === 'erp_as_status') { if (!can('anseong', 'view')) return null; const d = tbl('erp_as_daily').map((r) => r.date).sort(); return { key_set: false, local: true, net: false, cron: false, last: [], min_date: d[0] || null, max_date: d[d.length - 1] || null }; }
        if (fn === 'erp_as_pull' || fn === 'erp_as_set_key') throw new Error('로컬 모드에서는 안성 API를 받을 수 없습니다 (Supabase 연결 후 사용)');
        if (fn === 'erp_as_collect') return 0;
        if (fn === 'erp_as_store') { const a = arguments[1]; if (!can('anseong', 'edit')) throw new Error('안성 연동 권한이 없습니다'); if (a.p_type === 'inventory') { const R = (a.p && a.p.rows) || {}; T.erp_as_inv_daily = tbl('erp_as_inv_daily').filter((r) => !(r.date >= a.p_from && r.date <= a.p_to)).concat((R.daily || []).map((r) => ({ date: r.date, kind: r.kind || '', qty: r.qty, fetched_at: now() })));
            T.erp_as_inv_flow = (R.flow || []).map((r) => ({ style: r.style || '', opening: r.opening, qty_in: r.in, qty_out: r.out, closing: r.closing, p_from: a.p_from, p_to: a.p_to, fetched_at: now() })); T.erp_as_inv_stock = (R.stock || []).map((r) => ({ style: r.style || '', place: r.place || '', qty: r.qty, as_of: a.p_to, fetched_at: now() })); persist(); return (R.flow || []).length + (R.stock || []).length + (R.daily || []).length; }
          if (a.p_type === 'returns') { const rows = ((a.p && a.p.rows) || []).filter((r) => r.work_date >= a.p_from && r.work_date <= a.p_to); T.erp_as_ret = tbl('erp_as_ret').filter((r) => !(r.work_date >= a.p_from && r.work_date <= a.p_to)).concat(rows.map((r) => Object.assign({ box: '' }, r, { confirmed: r.confirmed === 'Y' || r.confirmed === true ? true : r.confirmed === 'N' || r.confirmed === false ? false : null, fetched_at: now() }))); persist(); return rows.length; }
          const T2 = { daily: ['erp_as_daily', 'date'], ship: ['erp_as_ship', 'date'], transfer: ['erp_as_transfer', 'date'], staff: ['erp_as_staff', 'date'], sorter: ['erp_as_sorter', 'date'] }[a.p_type]; if (!T2) throw new Error('모르는 자료 종류');
          const rows = (a.p && a.p.rows) || []; T[T2[0]] = tbl(T2[0]).filter((r) => !(r.date >= a.p_from && r.date <= a.p_to)); rows.forEach((r) => T[T2[0]].push(Object.assign(a.p_type === 'sorter' ? { style: '' } : { courier: '', carrier: '', item: '' }, r, { fetched_at: now() }))); persist(); return rows.length; }
        if (fn === 'erp_volume_replace') { const a = arguments[1]; if (!can('volume', 'create')) throw new Error('물동량 올리기 권한이 없습니다'); T.erp_volume = tbl('erp_volume').filter((r) => !(r.owner === a.p_owner && r.rec_date >= a.p_from && r.rec_date <= a.p_to)); a.p_rows.forEach((r) => T.erp_volume.push({ rec_date: r.rec_date, owner: a.p_owner, proc: r.proc, qty: +r.qty || 0, updated_at: now() })); persist(); return a.p_rows.length; }
        if (fn === 'erp_volume_month' || fn === 'erp_worklog_month') { const a = arguments[1] || {}; const vol = fn === 'erp_volume_month'; const t = vol ? 'erp_volume' : 'erp_worklog'; const dc = vol ? 'rec_date' : 'work_date'; const m = {};
          tbl(t).filter((r) => r[dc] >= a.p_from && r[dc] <= a.p_to && visible(t, r)).forEach((r) => { const ym = r[dc].slice(0, 7); const k = vol ? ym + '|' + r.owner + '|' + r.proc : ym + '|' + r.team; const o = m[k] || (m[k] = vol ? { ym, owner: r.owner, proc: r.proc, qty: 0 } : { ym, team: r.team, qty: 0, to_count: 0, _d: new Set() }); o.qty += +r.qty || 0; if (!vol) { o.to_count += +r.to_count || 0; o._d.add(r[dc]); } });
          return Object.values(m).map((o) => { if (o._d) { o.days = o._d.size; delete o._d; } return o; }); }
        if (fn === 'erp_cs_replace') { const a = arguments[1]; if (!can('csdata', 'create')) throw new Error('전산자료 올리기 권한이 없습니다'); const dd = HS.today ? HS.today() : now().slice(0, 10);
          T.erp_cs_part = tbl('erp_cs_part').filter((r) => !(r.kind === a.p_kind && r.sub === a.p_sub)); (a.p_parts || []).forEach((rows, i) => T.erp_cs_part.push({ kind: a.p_kind, sub: a.p_sub, part: i, rows, at: now() }));
          T.erp_cs_daily = tbl('erp_cs_daily').filter((r) => !(r.d === dd && r.kind === a.p_kind && r.sub === a.p_sub)); (a.p_daily || []).forEach((y) => T.erp_cs_daily.push(Object.assign({ d: dd, kind: a.p_kind, sub: a.p_sub }, y)));
          const id = nextId('erp_cs_file'); tbl('erp_cs_file').push({ id, kind: a.p_kind, sub: a.p_sub, ref_date: dd, file_name: a.p_file, rows: a.p_rows, qty: a.p_qty, summary: a.p_summary, by_user: me.id, by_name: me.name, at: now() }); persist(); return id; }
        if (fn === 'erp_cnt_trash' || fn === 'erp_cnt_restore') { const id = arguments[1].p_id; const c = tbl('erp_cnt').find((x) => x.id === id); if (!c) throw new Error('실사를 찾을 수 없습니다');
          if (fn === 'erp_cnt_trash') { if (!can('count', 'delete')) throw new Error('실사 삭제 권한이 없습니다'); if (c.status === '확정' && !can('count', 'close')) throw new Error('확정된 실사는 관리자만 삭제할 수 있습니다'); Object.assign(c, { deleted_at: now(), deleted_by: me.id, deleted_name: me.name });
            const lim = new Date(Date.now() - 7 * 864e5).toISOString(); const gone = tbl('erp_cnt').filter((x) => x.deleted_at && x.deleted_at < lim).map((x) => x.id); T.erp_cnt = tbl('erp_cnt').filter((x) => gone.indexOf(x.id) < 0); T.erp_cnt_part = tbl('erp_cnt_part').filter((x) => gone.indexOf(x.cnt_id) < 0); }
          else { if (!can('count', 'close')) throw new Error('되살리기는 관리자만 할 수 있습니다'); if (!c.deleted_at) throw new Error('지운 실사가 아닙니다'); Object.assign(c, { deleted_at: null, deleted_by: null, deleted_name: null }); }
          persist(); return c.name; }
        if (fn === 'erp_item_learn') { const a = arguments[1] || {}; if (!(can('csdata', 'create') || can('newprod', 'create') || can('count', 'create') || can('settings', 'edit'))) throw new Error('자료 올리기 권한이 없습니다');
          let st = tbl('erp_settings').find((x) => x.key === 'item_map'); if (!st) { st = { key: 'item_map', value: {} }; T.erp_settings.push(st); } const cur = st.value || (st.value = {}); let n = 0;
          for (const k in a.p_codes || {}) { if (n >= 50) break; const v = a.p_codes[k] || {}; if (!/^[A-Z]{2}$/.test(k) || cur[k] || !/^[1-5]$/.test(String(v.g))) continue; cur[k] = { g: +v.g, n: String(v.n || '').slice(0, 40), src: 'learn', ok: false, at: new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10), from: String(a.p_from || '').slice(0, 60) }; n++; }
          persist(); return n; }
        if (fn === 'erp_cs_alloc_merge' || fn === 'erp_cs_alloc_skip' || fn === 'erp_cs_alloc_close') { const a = arguments[1]; const CL = (dd) => tbl('erp_cs_close').find((x) => x.d === dd && x.kind === 'alloc');
          const ensure = (dd) => CL(dd) || (tbl('erp_cs_close').push({ d: dd, kind: 'alloc', closed_at: null, skip: [] }), CL(dd));
          if (fn === 'erp_cs_alloc_merge') { if (!can('csdata', 'create')) throw new Error('전산자료 올리기 권한이 없습니다'); const ds = a.p_days || [], bs = a.p_brands || [];
            const cd = ds.filter((dd) => CL(dd) && CL(dd).closed_at); if (cd.length) throw new Error('이미 마감된 날짜입니다 (' + cd.join(', ') + '). 관리자가 마감 해제 후 다시 올려 주세요');
            T.erp_cs_alloc = tbl('erp_cs_alloc').filter((r) => !(ds.indexOf(r.d) >= 0 && (bs.indexOf(r.brand) >= 0 || r.brand === ''))).concat((a.p_rows || []).filter((y) => y.brand).map((y) => Object.assign({ d: y.d, brand: y.brand, k: y.k || 'etc', qty: y.qty, stores: y.stores, lines: y.lines }, y.k === 'all' ? { at: now(), by_name: me.name, file: a.p_file } : {})));
            T.erp_cs_part = tbl('erp_cs_part').filter((r) => !(r.kind === 'alloc' && (r.brand == null || (ds.indexOf(r.sub) >= 0 && bs.indexOf(r.brand) >= 0))));
            let mx = tbl('erp_cs_part').filter((r) => r.kind === 'alloc').reduce((m, r) => Math.max(m, r.part), -1); (a.p_parts || []).forEach((x) => T.erp_cs_part.push({ kind: 'alloc', sub: x.d, part: ++mx, brand: x.brand, rows: x.rows, at: now() }));
            ds.forEach((dd) => { const br = tbl('erp_cs_alloc').filter((r) => r.d === dd && r.brand && r.k === 'all'); const st = new Set(); tbl('erp_cs_part').filter((r) => r.kind === 'alloc' && r.sub === dd).forEach((r) => r.rows.forEach((l) => { if (l[1]) st.add(l[1]); })); T.erp_cs_alloc.push({ d: dd, brand: '', k: 'all', qty: br.reduce((s2, r) => s2 + (+r.qty || 0), 0), stores: st.size, lines: br.reduce((s2, r) => s2 + (+r.lines || 0), 0) }); });
            const id = nextId('erp_cs_file'); tbl('erp_cs_file').push({ id, kind: 'order', sub: '배분LIST', ref_date: ds.slice().sort().pop(), file_name: a.p_file, rows: a.p_lines, qty: a.p_qty, summary: a.p_summary, by_user: me.id, by_name: me.name, at: now() }); persist(); return id; }
          if (fn === 'erp_cs_alloc_skip') { if (!can('csdata', 'create')) throw new Error('전산자료 올리기 권한이 없습니다'); const c = ensure(a.p_d); if (c.closed_at) throw new Error('이미 마감된 날짜입니다'); c.skip = (c.skip || []).filter((b) => b !== a.p_brand).concat(a.p_on ? [a.p_brand] : []); persist(); return c.skip; }
          if (a.p_on) { if (!can('csdata', 'create')) throw new Error('마감 권한이 없습니다'); const c = ensure(a.p_d); if (!c.closed_at) { const br = tbl('erp_cs_alloc').filter((r) => r.d === a.p_d && r.brand && r.k === 'all'); Object.assign(c, { closed_at: now(), closed_by: me.id, closed_name: me.name, brands: br.filter((r) => !/^미등록/.test(r.brand)).length, qty: br.reduce((s2, r) => s2 + (+r.qty || 0), 0) }); } persist(); return 'closed'; }
          if (!can('csdata', 'close')) throw new Error('마감 해제는 관리자만 할 수 있습니다'); const c = ensure(a.p_d); Object.assign(c, { closed_at: null, closed_by: null, closed_name: null }); persist(); return 'opened'; }
        if (fn === 'erp_cs_alloc_replace') { const a = arguments[1]; if (!can('csdata', 'create')) throw new Error('전산자료 올리기 권한이 없습니다'); const ds = a.p_days || [];
          T.erp_cs_alloc = tbl('erp_cs_alloc').filter((r) => ds.indexOf(r.d) < 0).concat((a.p_rows || []).map((y) => ({ d: y.d, brand: y.brand || '', k: y.k || 'etc', qty: y.qty, stores: y.stores, lines: y.lines })));
          T.erp_cs_part = tbl('erp_cs_part').filter((r) => r.kind !== 'alloc'); (a.p_parts || []).forEach((rows, i) => T.erp_cs_part.push({ kind: 'alloc', sub: '배분LIST', part: i, brand: null, rows, at: now() }));
          const id = nextId('erp_cs_file'); tbl('erp_cs_file').push({ id, kind: 'order', sub: '배분LIST', ref_date: ds.slice().sort().pop(), file_name: a.p_file, rows: a.p_lines, qty: a.p_qty, summary: a.p_summary, by_user: me.id, by_name: me.name, at: now() }); persist(); return id; }
        if (fn === 'erp_cs_merge') { const a = arguments[1]; if (!can('csdata', 'create')) throw new Error('전산자료 올리기 권한이 없습니다'); const dd = HS.today ? HS.today() : now().slice(0, 10); const bs = a.p_brands || [];
          T.erp_cs_part = tbl('erp_cs_part').filter((r) => !(r.kind === a.p_kind && r.sub === a.p_sub && (r.brand == null || bs.indexOf(r.brand) >= 0)));
          let mx = tbl('erp_cs_part').filter((r) => r.kind === a.p_kind && r.sub === a.p_sub).reduce((m, r) => Math.max(m, r.part), -1);
          (a.p_parts || []).forEach((x) => T.erp_cs_part.push({ kind: a.p_kind, sub: a.p_sub, part: ++mx, brand: x.brand || '', rows: x.rows, stat: x.stat, at: now() }));
          const by = {}; tbl('erp_cs_part').filter((r) => r.kind === a.p_kind && r.sub === a.p_sub && r.stat).forEach((r) => { const n = r.stat.name || r.brand || ''; const o = by[n] || (by[n] = { d: dd, kind: a.p_kind, sub: a.p_sub, brand: n, qty: 0, sku: 0, noloc: a.p_kind === 'wms' ? 0 : null, noloc_qty: a.p_kind === 'wms' ? 0 : null, out_qty: 0 }); o.qty += +r.stat.qty || 0; o.sku += +r.stat.sku || 0; if (a.p_kind === 'wms') { o.noloc += +r.stat.noloc || 0; o.noloc_qty += +r.stat.noloc_qty || 0; } o.out_qty += +r.stat.out || 0; });
          T.erp_cs_daily = tbl('erp_cs_daily').filter((r) => !(r.d === dd && r.kind === a.p_kind && r.sub === a.p_sub)).concat(Object.values(by));
          let id = null; if ((a.p_rows || 0) > 0) { id = nextId('erp_cs_file'); tbl('erp_cs_file').push({ id, kind: a.p_kind, sub: a.p_sub, ref_date: dd, file_name: a.p_file, rows: a.p_rows, qty: a.p_qty, summary: a.p_summary, by_user: me.id, by_name: me.name, at: now() }); }
          persist(); return id; }
        if (fn === 'erp_pl_days' || fn === 'erp_pl_days_json') { const a = arguments[1] || {}; const tm = {}; tbl('erp_teams').forEach((t) => (tm[t.name] = t)); const m = {}; const g = (d, t, wk) => m[d + '|' + t + '|' + (wk || '')] || (m[d + '|' + t + '|' + (wk || '')] = { d, team: t, wk: wk || null, sales: 0, cost: 0, ot: 0, to_count: 0, qty: 0 });
          // 그 해 인건비 먼저 (sql/26_team_year_cost.sql 과 같은 규칙)
          const yc = {}; tbl('erp_team_cost').forEach((r) => (yc[r.team + '|' + r.year] = r));
          const LAB = (t, d) => { const y = yc[t + '|' + String(d).slice(0, 4)]; return y ? +y.labor_cost || 0 : +(tm[t] || {}).labor_cost || 0; };
          const OTR = (t, d) => { const y = yc[t + '|' + String(d).slice(0, 4)]; return y && +y.ot_rate ? +y.ot_rate : +(tm[t] || {}).ot_rate || 0; };
          tbl('erp_worklog').filter((r) => r.work_date >= a.p_from && r.work_date <= a.p_to && visible('erp_worklog', r)).forEach((r) => { const x = g(r.work_date, r.team, r.extra && r.extra.wk); const L = LAB(r.team, r.work_date); x.sales += (+r.qty || 0) * (+r.unit_price || 0); x.cost += r.cost_override != null ? +r.cost_override : (+r.to_count || 0) * L; x.to_count += +r.to_count || 0; x.qty += +r.qty || 0; });
          tbl('erp_worklog_day').filter((r) => r.work_date >= a.p_from && r.work_date <= a.p_to && visible('erp_worklog_day', r)).forEach((r) => { const v = (+r.ot_hours || 0) * (+r.ot_people || 0) * OTR(r.team, r.work_date); if (v) { const x = g(r.work_date, r.team); x.cost += v; x.ot += v; } });
          return Object.values(m); }
        if (fn === 'erp_my_security') return { ip: null, aal: 'aal2', ip_ok: true, mfa_required: false, local: true };
        if (fn === 'erp_kpi_sync') return kpiSync(arguments[1].p_date, arguments[1].p_team);
        return null;
      },
      async raw() { throw new Error('로컬 모드에서는 안성센터 API를 부를 수 없습니다. 설정에서 Supabase를 연결하세요'); },
      subscribe(table, cb) { (subs[table] || (subs[table] = [])).push(cb); return () => { subs[table] = subs[table].filter((x) => x !== cb); }; },
      presence(meP, cb) { cb([{ id: meP.id, name: meP.name }]); return { update() {}, stop() {} }; },
      resetLocal() { T = {}; seq = {}; seed(); persist(); },
      // 파일 저장소 흉내 — 이 브라우저에만 저장 (권한은 실사이트 저장소 규칙과 같음: 보기 = tlmeet.view · 올리기 · 지우기 = tlmeet.create)
      files: (() => {
        const FM = {}; const key = (b, p) => 'f:' + b + '/' + p;
        const okW = () => { if (!can('tlmeet', 'create')) throw new Error('파일을 올리거나 열 권한이 없습니다'); };
        const okR = () => { if (!can('tlmeet', 'view')) throw new Error('파일을 올리거나 열 권한이 없습니다'); };
        const getB = async (b, p) => { if (FM[key(b, p)]) return FM[key(b, p)]; try { const db = await idb(); return await new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get(key(b, p)); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch (e) { return null; } };
        return {
          async up(b, p, blob) { await self.ready; okW(); if (blob.size > 10485760) throw new Error('파일이 너무 큽니다 — 파일 하나는 10MB 까지입니다'); if (await getB(b, p)) throw new Error('같은 위치에 파일이 이미 있습니다'); FM[key(b, p)] = blob; try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').put(blob, key(b, p)); } catch (e) { /* 메모리만 */ } return p; },
          async url(b, p) { await self.ready; okR(); const x = await getB(b, p); if (!x) throw new Error('파일을 찾을 수 없습니다'); return URL.createObjectURL(x); },
          async urls(b, ps) { const o = {}; for (const p of ps) { try { o[p] = await self.files.url(b, p); } catch (e) { /* 없음 */ } } return o; },
          async rm(b, ps) { await self.ready; okW(); for (const p of ps || []) { delete FM[key(b, p)]; try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').delete(key(b, p)); } catch (e) { /* 무시 */ } } },
          has(b, p) { return !!FM[key(b, p)]; },
        };
      })(),
    };
    return self;
  }

  function create() {
    const c = loadConn();
    if (c.mode === 'supabase' && c.url && c.key && window.supabase) return SupaAdapter(c);
    return LocalAdapter();
  }
  window.HSDB = { create, loadConn, saveConn, KEYS, KPI_MAP };
})();
