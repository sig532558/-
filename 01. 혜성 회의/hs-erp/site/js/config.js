/* 운영 연결 정보 — 안성센터 프로그램과 같은 Supabase 프로젝트
 * Supabase 대시보드 > Project Settings > API 에서 복사해 넣으면 모든 직원이 자동 연결됩니다.
 * (비워두면 각자 로그인 화면의 '연결 설정'에서 입력)
 * anon key 는 공개용 키입니다. service_role 키는 절대 넣지 마세요.
 */
window.HS_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',
  // 방화벽 ② 로그인 자동 공격 차단 (Cloudflare Turnstile 사이트 키 · 비우면 사용 안 함)
  turnstileSiteKey: '',
};
