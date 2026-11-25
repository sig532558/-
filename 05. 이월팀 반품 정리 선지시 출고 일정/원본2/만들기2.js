// 이월팀 출고관리 단독판 한 파일 만들기 —  node 만들기2.js  →  ../이월팀_출고관리_단독판.html
const fs = require('fs');
const path = require('path');
const SITE = path.resolve(__dirname, '../../01. 혜성 회의/hs-erp/site');
const OUT = path.resolve(__dirname, '../이월팀_출고관리_단독판.html');
const js = (name, src) => '<script>/* ===== ' + name + ' ===== */\n' + src.replace(/<\/script/gi, '<\\/script') + '\n</script>\n';
const parts = [
  ['vendor/xlsx.full.min.js', fs.readFileSync(path.join(SITE, 'vendor/xlsx.full.min.js'), 'utf8')],
  ['앱.js', fs.readFileSync(path.join(__dirname, '앱.js'), 'utf8')],
];
const icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230F1E3D'/%3E%3Ctext x='32' y='43' font-size='28' text-anchor='middle' fill='%23C9A227' font-family='sans-serif' font-weight='700'%3E출%3C/text%3E%3C/svg%3E";
const made = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 16).replace('T', ' ');
const html = '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  + '<title>이월팀 출고관리 · 배분지시 · 출고 일정</title>\n<link rel="icon" href="' + icon + '">\n'
  + '<!-- 만든 때: ' + made + ' (한국 시각) · 만들기: 원본2/만들기2.js -->\n'
  + '<style>\n' + fs.readFileSync(path.join(__dirname, '화면.css'), 'utf8') + '\n</style>\n</head>\n<body>\n<div id="root"></div>\n<div id="toasts"></div>\n'
  + parts.map(([n, s]) => js(n, s)).join('')
  + '<script>IWOL.boot();</script>\n</body>\n</html>\n';
fs.writeFileSync(OUT, html);
console.log('만듦: ' + OUT + ' (' + Math.round(Buffer.byteLength(html) / 1024) + 'KB)');
