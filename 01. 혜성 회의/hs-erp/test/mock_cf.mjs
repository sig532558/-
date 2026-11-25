// Cloudflare API 모의 서버 (토큰 확인 · 계정 목록)
import http from 'http';
http.createServer((req, res) => {
  const send = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.headers.authorization !== 'Bearer cf_test_token') return send(401, { success: false, errors: [{ message: 'Invalid API Token' }] });
  if (req.url.startsWith('/user/tokens/verify')) return send(200, { success: true, result: { status: 'active' } });
  if (req.url.startsWith('/accounts')) return send(200, { success: true, result: [{ id: '0123456789abcdef0123456789abcdef', name: 'Sig532558@gmail.com\'s Account' }] });
  send(404, { success: false });
}).listen(9922, () => console.log('cf mock 9922'));
