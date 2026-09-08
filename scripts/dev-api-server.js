// Minimal local API server for development, standing in for Vercel's
// serverless routing (vercel dev is unreliable on this machine due to a
// yarn/build-detection issue on the linked project). Not used in production
// — Vercel handles routing there via the api/ folder convention.
require('dotenv').config();
const http = require('http');
const { URL } = require('url');

const routes = [
  { method: 'GET', pattern: /^\/api\/health$/, handler: () => require('../api/health'), params: [] },
  { method: 'POST', pattern: /^\/api\/users$/, handler: () => require('../api/users/index'), params: [] },
  { method: 'GET', pattern: /^\/api\/residents$/, handler: () => require('../api/residents/index'), params: [] },
  { method: 'POST', pattern: /^\/api\/residents$/, handler: () => require('../api/residents/index'), params: [] },
  { method: 'GET', pattern: /^\/api\/residents\/([^/]+)$/, handler: () => require('../api/residents/[id]'), params: ['id'] },
  { method: 'PATCH', pattern: /^\/api\/residents\/([^/]+)$/, handler: () => require('../api/residents/[id]'), params: ['id'] },
  { method: 'DELETE', pattern: /^\/api\/residents\/([^/]+)$/, handler: () => require('../api/residents/[id]'), params: ['id'] },
  { method: 'GET', pattern: /^\/api\/pending$/, handler: () => require('../api/pending/index'), params: [] },
  { method: 'POST', pattern: /^\/api\/pending$/, handler: () => require('../api/pending/index'), params: [] },
  { method: 'POST', pattern: /^\/api\/pending\/([^/]+)\/approve$/, handler: () => require('../api/pending/[id]/approve'), params: ['id'] },
  { method: 'POST', pattern: /^\/api\/pending\/([^/]+)\/reject$/, handler: () => require('../api/pending/[id]/reject'), params: ['id'] },
  { method: 'GET', pattern: /^\/api\/dashboard$/, handler: () => require('../api/dashboard'), params: [] },
  { method: 'GET', pattern: /^\/api\/audit-log$/, handler: () => require('../api/audit-log'), params: [] },
  { method: 'POST', pattern: /^\/api\/photos\/upload-url$/, handler: () => require('../api/photos/upload-url'), params: [] },
  { method: 'POST', pattern: /^\/api\/photos\/signed-url$/, handler: () => require('../api/photos/signed-url'), params: [] },
];

const PORT = 3000;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));

  if (!route) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Not found' } }));
    return;
  }

  const match = url.pathname.match(route.pattern);
  const query = Object.fromEntries(url.searchParams.entries());
  route.params.forEach((name, i) => {
    query[name] = match[i + 1];
  });

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    req.query = query;
    try {
      req.body = body ? JSON.parse(body) : {};
    } catch {
      req.body = {};
    }

    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (payload) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
      return res;
    };

    try {
      const handler = route.handler();
      await handler(req, res);
    } catch (err) {
      console.error('Handler error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: { message: 'Internal server error' } });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Dev API server listening on http://localhost:${PORT}`);
});
