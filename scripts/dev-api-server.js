// Minimal local API server for development, standing in for Vercel's
// serverless routing (vercel dev is unreliable on this machine due to a
// yarn/build-detection issue on the linked project). Not used in production
// — Vercel handles routing there via the api/ folder + vercel.json rewrites.
//
// Mirrors production routing: each consolidated function parses the id/
// action itself from req.url, same as it would on Vercel.
require('dotenv').config();
const http = require('http');
const { URL } = require('url');

const routes = [
  { prefix: '/api/health', handler: () => require('../api/health') },
  { prefix: '/api/users', handler: () => require('../api/users') },
  { prefix: '/api/residents', handler: () => require('../api/residents') },
  { prefix: '/api/pending', handler: () => require('../api/pending') },
  { prefix: '/api/dashboard', handler: () => require('../api/dashboard') },
  { prefix: '/api/audit-log', handler: () => require('../api/audit-log') },
  { prefix: '/api/photos', handler: () => require('../api/photos') },
  { prefix: '/api/profile', handler: () => require('../api/profile') },
  { prefix: '/api/vehicles', handler: () => require('../api/vehicles') },
];

const PORT = 3000;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = routes.find((r) => url.pathname === r.prefix || url.pathname.startsWith(`${r.prefix}/`));

  if (!route) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Not found' } }));
    return;
  }

  const query = Object.fromEntries(url.searchParams.entries());

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
