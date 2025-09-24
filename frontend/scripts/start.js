#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const port = process.env.PORT || 3000;
const baileysPort = process.env.BAILEYS_PORT || 3002;
const publicDir = path.resolve(__dirname, '..', 'public');
const indexPath = path.join(publicDir, 'index.html');

const shouldProxy = (pathname) => {
  const apiPrefixes = ['qrcode', 'instances', 'messages'];

  return apiPrefixes.some((prefix) => {
    const pattern = new RegExp(`/(?:${prefix})(?:/|$)`);
    return pattern.test(pathname);
  });
};

const logRequest = (req, statusCode) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url} -> ${statusCode}`);
};

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://localhost:${port}`);
  const { pathname } = requestUrl;

  if (shouldProxy(pathname)) {
    const proxyOptions = {
      hostname: 'localhost',
      port: baileysPort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `localhost:${baileysPort}`,
      },
    };

    const proxyReq = http.request(proxyOptions, (proxyRes) => {
      const headers = { ...proxyRes.headers };
      res.writeHead(proxyRes.statusCode || 502, headers);
      proxyRes.pipe(res);
      proxyRes.on('end', () => {
        logRequest(req, proxyRes.statusCode || 502);
      });
    });

    proxyReq.on('error', (error) => {
      console.error('Erro ao encaminhar requisição para o Baileys:', error);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Bad Gateway\n');
      logRequest(req, 502);
    });

    req.pipe(proxyReq);
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, {
      'Content-Type': 'text/plain; charset=utf-8',
      Allow: 'GET',
    });
    res.end('Method Not Allowed\n');
    logRequest(req, 405);
    return;
  }

  const { url } = req;
  try {
    if (pathname === '/' || pathname === '/index.html') {
      const html = fs.readFileSync(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      logRequest(req, 200);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found\n');
    logRequest(req, 404);
  } catch (error) {
    console.error('Erro ao servir conteúdo:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error\n');
    logRequest(req, 500);
  }
});

server.listen(port, () => {
  console.log(`Painel Baileys disponível em http://localhost:${port}`);
});

process.on('SIGINT', () => {
  console.log('Encerrando servidor...');
  server.close(() => process.exit(0));
});
