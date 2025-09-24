#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const publicDir = path.resolve(__dirname, '..', 'public');
const indexPath = path.join(publicDir, 'index.html');
const openApiPath = path.resolve(__dirname, '..', '..', 'docs', 'swagger', 'openapi.yaml');

const logRequest = (req, statusCode) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url} -> ${statusCode}`);
};

const server = http.createServer((req, res) => {
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
    if (url === '/' || url === '/index.html') {
      const html = fs.readFileSync(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      logRequest(req, 200);
      return;
    }

    if (url === '/openapi.yaml') {
      const spec = fs.readFileSync(openApiPath);
      res.writeHead(200, { 'Content-Type': 'application/yaml; charset=utf-8' });
      res.end(spec);
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
  console.log(`Servidor do Swagger UI disponível em http://localhost:${port}`);
});

process.on('SIGINT', () => {
  console.log('Encerrando servidor...');
  server.close(() => process.exit(0));
});
