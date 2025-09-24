#!/usr/bin/env node
const http = require('http');

const port = process.env.PORT || 3000;

const server = http.createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Front-end de exemplo rodando. Substitua este script pelo seu app real.\n');
});

server.listen(port, () => {
  console.log(`Servidor de exemplo iniciado em http://localhost:${port}`);
});

process.on('SIGINT', () => {
  console.log('Encerrando servidor de exemplo...');
  server.close(() => process.exit(0));
});
