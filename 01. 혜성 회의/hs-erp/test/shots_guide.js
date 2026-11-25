// 운영 시작 절차 PDF용 실제 화면 캡처
const { chromium } = require('playwright'); const URL = 'http://localhost:' + (process.env.PORT || 8767) + '/'; const OUT = process.argv[2];
const QR = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges">' + Array.from({ length: 441 }, (_, i) => { const x = i % 21, y = (i / 21) | 0; const f = (a, b) => x >= a && x < a + 7 && y >= b && y < b + 7; const fin = f(0, 0) || f(14, 0) || f(0, 14); const on = fin ? !(((x % 14 === 1 || x % 14 === 5) && y % 14 >= 1 && y % 14 <= 5) || ((y % 14 === 1 || y % 14 === 5) && x % 14 >= 1 && x % 14 <= 5)) : ((x * 7 + y * 13 + x * y) % 3 === 0); return on ? '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>' : ''; }).join('') + '</svg>');
const FAKE = (pending) => `window.__st={aal:'aal1',factors:[],session:${pending ? 'true' : 'false'}};
window.supabase={createClient(){const st=window.__st;const q=(t)=>{const base={then(r){return Promise.resolve({data:[],error:null,count:0}).then(r)},single(){return Promise.resolve({data:null})},maybeSingle(){
 if(t==='erp_profiles')return Promise.resolve({data:{id:'u1',login_id:'bjy',name:'배중열',role_id:${pending ? "'pending'" : "'admin'"},active:${pending ? 'false' : 'true'}}});
 if(t==='erp_roles')return Promise.resolve({data:{id:'admin',name:'관리자',mfa:true,perms:{}}});return Promise.resolve({data:null})}};const o=new Proxy(base,{get(tg,k){return k in tg?tg[k]:()=>o}});return o;};
 return {from:q,removeChannel(){},rpc:async()=>({data:null}),channel(){const c={on(){return c},subscribe(){return c},track(){},presenceState(){return{}}};return c},
 auth:{async signInWithPassword(){st.session=true;return{error:null}},async getSession(){return{data:{session:st.session?{user:{id:'u1',email:'bjy@hyeseong.erp'}}:null}}},async signOut(){},async refreshSession(){},
 mfa:{async getAuthenticatorAssuranceLevel(){return{data:{currentLevel:'aal1',nextLevel:'aal1'}}},async listFactors(){return{data:{totp:[],all:[]}}},async enroll(){return{data:{id:'f1',totp:{qr_code:'${QR}',secret:'JBSWY3DPEHPK3PXP'}}}},async challengeAndVerify(){return{error:null}},async unenroll(){}}}}}};`;
(async () => {
  const b = await chromium.launch(); const mk = async (pending) => { const ctx = await b.newContext({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 2 });
    await ctx.route('**/vendor/supabase.js', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE(pending) }));
    await ctx.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.HS_CONFIG={supabaseUrl:'https://abcdefghijklmnopqrst.supabase.co',supabaseKey:'anon',turnstileSiteKey:''};" }));
    return ctx.newPage(); };
  let pg = await mk(false); await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.screenshot({ path: OUT + '/e_login.png' });
  await pg.click('#lsu'); await pg.waitForSelector('#s1'); await pg.fill('#s1', 'bjy'); await pg.fill('#s2', 'xxxxxxxx'); await pg.fill('#s3', '배중열'); await pg.fill('#s4', '물류관리팀'); await pg.selectOption('#s5', '부장'); await pg.screenshot({ path: OUT + '/e_signup.png' });
  pg = await mk(true); await pg.goto(URL); await pg.waitForTimeout(800); await pg.screenshot({ path: OUT + '/e_pending.png' });
  pg = await mk(false); await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'bjy'); await pg.fill('#lpw', 'x'); await pg.click('#lgo'); await pg.waitForTimeout(900); await pg.screenshot({ path: OUT + '/e_mfa.png' });
  // 로컬 모드: 직원 신청 → 관리자 승인 화면
  const ctx = await b.newContext({ viewport: { width: 1360, height: 820 }, deviceScaleFactor: 2 }); pg = await ctx.newPage();
  await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.click('#lsu'); await pg.waitForSelector('#s1'); await pg.fill('#s1', 'kimyj'); await pg.fill('#s2', 'abc12345'); await pg.fill('#s3', '김영자'); await pg.fill('#s4', '업무지원팀'); await pg.selectOption('#s5', '과장'); await pg.click('.modal .btn.p'); await pg.waitForTimeout(800);
  await pg.evaluate(() => sessionStorage.clear()); await pg.goto(URL); await pg.waitForSelector('#lid'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'admin1234'); await pg.click('#lgo'); await pg.waitForSelector('#body');
  await pg.goto(URL + '#/users'); await pg.waitForTimeout(1200); await pg.screenshot({ path: OUT + '/e_users.png' });
  await pg.click('tr[data-id] >> text=김영자'); await pg.waitForTimeout(600); await pg.screenshot({ path: OUT + '/e_approve.png' }); await pg.click('.modal .btn:has-text("취소")'); await pg.waitForTimeout(300); await pg.goto(URL + '#/upload'); await pg.waitForTimeout(1000); await pg.screenshot({ path: OUT + '/e_upload.png' });
  await pg.goto(URL + '#/settings?k=conn'); await pg.waitForTimeout(1200); await pg.screenshot({ path: OUT + '/e_usage.png', fullPage: true });
  await b.close();
})();
