// 운영(Supabase) 모드 로그인 흐름 점검 — Supabase·Turnstile을 가짜로 대체
const { chromium } = require('playwright');
const URL = 'http://localhost:' + (process.env.PORT || 8767) + '/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const FAKE_SB = `window.__log=[];window.__st={aal:'aal1',factors:[],session:false};
window.supabase={createClient(){const st=window.__st,L=window.__log;
 const q=(t)=>{const base={then(r){return Promise.resolve({data:[],error:null,count:0}).then(r)},
  single(){return Promise.resolve({data:null,error:null})},maybeSingle(){ if(t==='erp_profiles')return Promise.resolve({data:{id:'u1',login_id:'boss',name:'배중열',role_id:'admin',active:true}});
   if(t==='erp_roles')return Promise.resolve({data:{id:'admin',name:'관리자',mfa:true,perms:{}}}); return Promise.resolve({data:null}); }};const o=new Proxy(base,{get(tg,k){if(k==='catch')return undefined;return k in tg?tg[k]:()=>o}});return o;};
 return {from:q,removeChannel(){},removeAllChannels(){},rpc:async()=>({data:null,error:null}),channel(){const c={on(){return c},subscribe(){return c},track(){},presenceState(){return{}}};return c},
  auth:{async signInWithPassword(a){L.push(['login',a.options&&a.options.captchaToken]);st.session=true;return{error:null}},
   async getSession(){return{data:{session:st.session?{user:{id:'u1',email:'boss@hyeseong.erp'}}:null}}},
   async signOut(){st.session=false},async refreshSession(){},
   onAuthStateChange(fn){window.__authcb=fn;return{data:{subscription:{unsubscribe(){}}}}},
   mfa:{async getAuthenticatorAssuranceLevel(){return{data:{currentLevel:st.aal,nextLevel:st.factors.length?'aal2':'aal1'}}},
    async listFactors(){return{data:{totp:st.factors,all:st.factors}}},
    async enroll(){L.push(['enroll']);return{data:{id:'f1',totp:{qr_code:'data:image/svg+xml;utf-8,<svg xmlns=%22http://www.w3.org/2000/svg%22/>',secret:'JBSWY3DPEHPK3PXP'}}}},
    async challengeAndVerify(a){L.push(['verify',a.code]);if(a.code!=='123456')return{error:{message:'Invalid TOTP code entered'}};st.aal='aal2';if(!st.factors.length)st.factors=[{id:a.factorId,status:'verified',friendly_name:'혜성 ERP'}];return{error:null}},
    async unenroll(){st.factors=[]}}}}}};`;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const errs = [];
  await ctx.route('**/vendor/supabase.js', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE_SB }));
  await ctx.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.HS_CONFIG={supabaseUrl:'https://abcdefghij1234567890.supabase.co',supabaseKey:'anon',turnstileSiteKey:'0x4AAA'};" }));
  await ctx.route('https://challenges.cloudflare.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.turnstile={render(el,o){el.textContent='사람 확인 완료';setTimeout(()=>o.callback('tok-123'),50);return 1},reset(){}};" }));
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/인증번호가 맞지|체크 표시|6자리 번호를 넣어/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.waitForTimeout(400);
  ok(/사람 확인 완료/.test(await pg.textContent('.login')), '② 로그인 화면에 자동 공격 차단 확인 표시');
  await pg.click('#lid'); await pg.keyboard.type('boss'); await pg.click('#lpw'); await pg.keyboard.type('pw12'); ok(await pg.inputValue('#lpw') === 'pw12', '로그인 비밀번호 칸 키보드 입력'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(600);
  let log = await pg.evaluate(() => window.__log);
  ok(log[0][0] === 'login' && log[0][1] === 'tok-123', '② 로그인 요청에 확인 토큰 전달');
  ok(/2단계 인증 등록/.test(await pg.textContent('body')) && (await pg.$('.qr img')), '③ 관리자 첫 로그인 → 인증 앱 등록 화면(QR)');
  await pg.screenshot({ path: __dirname + '/shots/mfa_enroll.png' });
  await pg.click('#mgo'); await pg.waitForTimeout(300);
  ok(/6자리 번호를 넣어 주세요/.test(await pg.textContent('body')), '③ 빈칸으로 누르면 한국어로 알려 줌');
  ok(!(await pg.evaluate(() => window.__log)).some((x) => x[0] === 'verify'), '③ 빈칸은 서버로 보내지 않음');
  await pg.fill('#mcode', '000000'); await pg.click('#mgo'); await pg.waitForTimeout(300);
  ok(/인증번호가 맞지 않습니다/.test(await pg.textContent('body')), '③ 틀린 번호 거부');
  await pg.$eval('#mcode', (e) => { e.value = ''; }); await pg.click('#mcode'); await pg.keyboard.type('123 456'); ok(await pg.inputValue('#mcode') === '123456', '③ 띄어쓰기 넣어 입력해도 숫자 6개로 정리'); await pg.click('#mgo'); await pg.waitForTimeout(1200);
  ok(!(await pg.$('#mcode')), '③ 맞는 번호 → 등록 완료 후 통과');
  // 다시 로그인: 이미 등록됨 → 번호 확인 화면
  await pg.evaluate(() => { window.__st.aal = 'aal1'; }); await pg.evaluate(() => window.HS.reboot()); await pg.waitForTimeout(600);
  ok(/휴대폰 인증 앱의/.test(await pg.textContent('body')), '③ 다음 로그인 → 6자리 번호 확인 화면');
  await pg.screenshot({ path: __dirname + '/shots/mfa_challenge.png' });
  await pg.fill('#mcode', '123456'); await pg.press('#mcode', 'Enter'); await pg.waitForTimeout(1000);
  ok(!(await pg.$('#mcode')), '③ 번호 확인 후 통과');
  log = await pg.evaluate(() => window.__log); ok(log.filter((x) => x[0] === 'enroll').length === 1, '③ 등록은 한 번만');
  // 로그인(세션)이 풀렸을 때 — 빈 화면을 그리지 말고 알리고 로그인 화면으로 (2026-11-19)
  // 운영(Supabase) 질의는 then 만 있고 catch 가 없다 — 저장이 터지지 않는지 (2026-11-19 사고)
  const upOk = await pg.evaluate(async () => { try { return await HS.db.upsert('erp_settings', [{ key: 'zz', value: {} }]); } catch (e) { return 'ERR ' + e.message; } });
  ok(upOk === 1, '운영 모드 저장(upsert)이 터지지 않음 · ' + upOk);
  const lsOk = await pg.evaluate(async () => { try { return (await HS.db.list('erp_settings', {})).length >= 0; } catch (e) { return 'ERR ' + e.message; } });
  ok(lsOk === true, '운영 모드 읽기(list)도 그대로 · ' + lsOk);
  ok(await pg.evaluate(() => typeof HS.db.checkSession === 'function'), '로그인이 살아 있는지 확인하는 장치가 있음');
  await pg.evaluate(() => { window.__st.session = false; });
  const lost = await pg.evaluate(async () => { await HS.db.checkSession(); await new Promise((r) => setTimeout(r, 300)); return document.body.textContent; });
  ok(/로그인이 풀렸습니다/.test(lost), '로그인이 풀리면 바로 알려 줌');
  await pg.waitForSelector('#lid', { timeout: 15000 });
  ok(!!(await pg.$('#lid')), '곧바로 로그인 화면으로 보냄');
  // 일부러 로그아웃할 때는 '풀렸습니다' 를 띄우지 않는다
  await pg.evaluate(() => { window.__st.session = true; });
  await pg.fill('#lid', 'boss'); await pg.fill('#lpw', 'pw12'); await pg.click('#lgo'); await pg.waitForTimeout(1500);
  await pg.evaluate(async () => { await HS.db.logout(); });
  await pg.waitForTimeout(600);
  ok(!/로그인이 풀렸습니다/.test(await pg.textContent('body')), '일부러 로그아웃할 때는 풀렸다고 하지 않음');
  ok(/로그인이 풀렸습니다/.test(await pg.evaluate(() => { try { return HS.db.lostMsg({ message: 'invalid claim: missing sub claim' }) || ''; } catch (e) { return ''; } })), "'invalid claim: missing sub claim' 같은 영어 오류도 알아듣게 바꿔 줌");
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await b.close();
})();
