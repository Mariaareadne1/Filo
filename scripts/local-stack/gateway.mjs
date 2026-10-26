// Minimal Kong stand-in for the local dev stack: routes the Supabase URL
// layout (/auth/v1, /rest/v1, /storage/v1) to the service containers.
// Dev-only; no auth logic lives here (GoTrue/PostgREST/Storage enforce it).
import http from 'node:http';

const ROUTES = [
  ['/auth/v1', process.env.GOTRUE_URL ?? 'http://127.0.0.1:55999'],
  ['/rest/v1', process.env.REST_URL ?? 'http://127.0.0.1:55300'],
  ['/storage/v1', process.env.STORAGE_URL ?? 'http://127.0.0.1:55500'],
];
const PORT = Number(process.env.PORT ?? 55321);

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

http.createServer((req, res) => {
  if (process.env.GATEWAY_LOG !== '0') console.log(`${req.method} ${req.url.split('?')[0]}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  // Email templates for local GoTrue: Filo signs in with a 6-digit code, so
  // the template must contain {{ .Token }} (mirror this in the hosted project).
  if (req.url.startsWith('/templates/')) {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<p>Your Filo sign-in code is</p><h2>{{ .Token }}</h2>');
    return;
  }
  const route = ROUTES.find(([prefix]) => req.url.startsWith(prefix + '/') || req.url === prefix);
  if (!route) { res.writeHead(404, CORS); res.end('no route'); return; }
  const [prefix, target] = route;
  const url = new URL(req.url.slice(prefix.length) || '/', target);
  const upstream = http.request(url, { method: req.method, headers: { ...req.headers, host: url.host } }, (up) => {
    res.writeHead(up.statusCode ?? 502, { ...up.headers, ...CORS });
    up.pipe(res);
  });
  upstream.on('error', (e) => { res.writeHead(502, CORS); res.end(String(e)); });
  req.pipe(upstream);
}).listen(PORT, () => console.log(`gateway on :${PORT}`));
