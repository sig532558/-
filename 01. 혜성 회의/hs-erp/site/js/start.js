/* 시작 (보안 규칙상 화면 안에 직접 쓴 스크립트는 막혀 있어 파일로 분리) */
HS.start();
// 화면을 먼저 띄우고, 엑셀 라이브러리는 뒤에서 조용히 받아 둔다 (2026-11-12)
setTimeout(() => HS.xlsx().catch(() => {}), 300);
// 나중에 받는 화면(시즌 계획 · 재고 실사 등 · app.js 의 HS.LAZY)도 뒤에서 미리 받아 둔다 (2026-11-18)
setTimeout(() => HS.preloadViews && HS.preloadViews(), 2000);
// 홈 화면 어플 (2026-11-19) — 휴대폰에서 [홈 화면에 추가] 가 되도록 · 화면 파일만 저장하고 자료는 늘 새로 받는다
if ('serviceWorker' in navigator) setTimeout(() => navigator.serviceWorker.register('sw.js').catch(() => {}), 3000);
