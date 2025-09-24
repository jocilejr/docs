#!/usr/bin/env node
const http = require('http');

const port = process.env.BAILEYS_PORT || 3002;

const server = http.createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ status: 'ok', message: 'Serviço Baileys de exemplo ativo.' }));
});

server.listen(port, () => {
  console.log(`Serviço Baileys de exemplo aguardando conexões na porta ${port}`);
});

process.on('SIGINT', () => {
  console.log('Encerrando serviço Baileys de exemplo...');
  server.close(() => process.exit(0));
});
