#!/usr/bin/env node
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const PORT = process.env.BAILEYS_PORT || 3002;
const DATA_DIR = path.join(__dirname, 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const INSTANCES_FILE = path.join(DATA_DIR, 'instances.json');
const QR_EXPIRATION_MS = 2 * 60 * 1000; // 2 minutos
const ALLOWED_STATUSES = new Set(['pending_qr', 'ready', 'disconnected']);
const ALLOWED_MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker']);

fs.mkdirSync(SESSIONS_DIR, { recursive: true });

async function ensureInstancesFile() {
  try {
    await fsp.access(INSTANCES_FILE, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(INSTANCES_FILE, '[]', 'utf-8');
  }
}

class InstanceStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.instances = new Map();
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    await ensureInstancesFile();
    const raw = await fsp.readFile(this.filePath, 'utf-8');
    const parsed = raw ? JSON.parse(raw) : [];
    parsed.forEach((instance) => {
      this.instances.set(instance.id, {
        id: instance.id,
        status: instance.status || 'pending_qr',
        metadata: instance.metadata || {},
      });
    });
    this.initialized = true;
  }

  list() {
    return Array.from(this.instances.values());
  }

  get(id) {
    return this.instances.get(id) || null;
  }

  async save() {
    const serialized = JSON.stringify(this.list(), null, 2);
    await fsp.writeFile(this.filePath, serialized, 'utf-8');
  }

  async create({ id, metadata }) {
    if (!id) {
      throw new Error('ID da instância é obrigatório.');
    }
    if (this.instances.has(id)) {
      const err = new Error('Instância já existe.');
      err.code = 'instance_exists';
      throw err;
    }
    const instance = { id, status: 'pending_qr', metadata: metadata || {} };
    this.instances.set(id, instance);
    await this.save();
    return instance;
  }

  async delete(id) {
    const existed = this.instances.delete(id);
    if (existed) {
      await this.save();
    }
    return existed;
  }

  async updateStatus(id, status) {
    if (!ALLOWED_STATUSES.has(status)) {
      const err = new Error('Status inválido.');
      err.code = 'invalid_status';
      throw err;
    }
    const instance = this.instances.get(id);
    if (!instance) {
      return null;
    }
    instance.status = status;
    await this.save();
    return instance;
  }

  async updateMetadata(id, metadata) {
    const instance = this.instances.get(id);
    if (!instance) {
      return null;
    }
    instance.metadata = metadata || {};
    await this.save();
    return instance;
  }
}

class BaileysManager {
  constructor(store) {
    this.store = store;
    this.sessions = new Map();
  }

  async initExistingInstances() {
    const instances = this.store.list();
    await Promise.all(
      instances.map((instance) =>
        this.initializeForInstance(instance.id).catch((error) => {
          console.error(`Falha ao inicializar instância ${instance.id}:`, error.message);
        })
      )
    );
  }

  async initializeForInstance(instanceId) {
    const existing = this.sessions.get(instanceId);
    if (existing?.sock) {
      return existing;
    }
    const instance = this.store.get(instanceId);
    if (!instance) {
      const err = new Error('Instância não encontrada.');
      err.code = 'instance_not_found';
      throw err;
    }

    const authDir = path.join(SESSIONS_DIR, instanceId);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['Docs API', 'Chrome', '1.0.0'],
    });

    const session = {
      sock,
      saveCreds,
      qr: null,
      connection: 'close',
    };
    this.sessions.set(instanceId, session);

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
      this.handleConnectionUpdate(instanceId, update).catch((error) => {
        console.error(`Erro ao processar update da instância ${instanceId}:`, error);
      });
    });

    return session;
  }

  async handleConnectionUpdate(instanceId, update) {
    const session = this.sessions.get(instanceId);
    if (!session) {
      return;
    }

    if (update.qr) {
      const qrDataUrl = await QRCode.toDataURL(update.qr);
      const base64 = qrDataUrl.split(',')[1];
      session.qr = {
        type: 'base64',
        value: base64,
        expiresAt: Date.now() + QR_EXPIRATION_MS,
      };
      await this.store.updateStatus(instanceId, 'pending_qr');
    }

    if (update.connection) {
      session.connection = update.connection;
      if (update.connection === 'open') {
        session.qr = null;
        await this.store.updateStatus(instanceId, 'ready');
      } else if (update.connection === 'close') {
        const statusCode = update.lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          await this.store.updateStatus(instanceId, 'disconnected');
          await this.cleanupSession(instanceId, { keepData: false });
        } else {
          await this.store.updateStatus(instanceId, 'disconnected');
        }
      }
    }
  }

  async cleanupSession(instanceId, { keepData }) {
    const session = this.sessions.get(instanceId);
    if (session?.sock) {
      try {
        await session.sock.logout();
      } catch (error) {
        if (error?.message && !/not logged in/i.test(error.message)) {
          console.warn(`Erro ao encerrar sessão ${instanceId}:`, error.message);
        }
      }
      try {
        session.sock.ws?.close();
      } catch {}
    }
    this.sessions.delete(instanceId);

    if (!keepData) {
      const authDir = path.join(SESSIONS_DIR, instanceId);
      await fsp.rm(authDir, { recursive: true, force: true });
    }
  }

  getSession(instanceId) {
    return this.sessions.get(instanceId) || null;
  }

  async getOrCreateSession(instanceId) {
    const session = this.sessions.get(instanceId);
    if (session) {
      return session;
    }
    return this.initializeForInstance(instanceId);
  }

  getQRCode(instanceId) {
    const session = this.sessions.get(instanceId);
    if (!session?.qr) {
      return null;
    }
    const expiresIn = Math.max(0, Math.floor((session.qr.expiresAt - Date.now()) / 1000));
    return {
      instanceId,
      image: {
        type: session.qr.type,
        value: session.qr.value,
        expiresIn,
      },
    };
  }
}

function createErrorResponse(res, statusCode, code, message, details) {
  const payload = { code, message };
  if (details && Object.keys(details).length > 0) {
    payload.details = details;
  }
  return res.status(statusCode).json(payload);
}

function bearerAuthMiddleware(req, res, next) {
  const token = process.env.API_BEARER_TOKEN;
  if (!token) {
    return next();
  }
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return createErrorResponse(res, 401, 'unauthorized', 'Bearer token ausente ou inválido.');
  }
  const provided = header.slice('Bearer '.length).trim();
  if (provided !== token) {
    return createErrorResponse(res, 401, 'unauthorized', 'Bearer token ausente ou inválido.');
  }
  return next();
}

function validateInstancePayload(body) {
  if (!body || typeof body !== 'object') {
    const err = new Error('Payload inválido.');
    err.code = 'invalid_payload';
    throw err;
  }
  const { id, metadata } = body;
  if (!id || typeof id !== 'string') {
    const err = new Error('Campo "id" é obrigatório.');
    err.code = 'invalid_payload';
    throw err;
  }
  if (metadata && typeof metadata !== 'object') {
    const err = new Error('Campo "metadata" deve ser um objeto.');
    err.code = 'invalid_payload';
    throw err;
  }
  return { id, metadata: metadata || {} };
}

function buildMessageContent(payload) {
  if (!payload.message || typeof payload.message !== 'object') {
    const err = new Error('Campo "message" é obrigatório.');
    err.code = 'invalid_payload';
    throw err;
  }

  switch (payload.type) {
    case 'text': {
      const text = payload.message.text;
      if (typeof text !== 'string' || text.trim() === '') {
        const err = new Error('Mensagem de texto inválida.');
        err.code = 'invalid_payload';
        throw err;
      }
      return { text };
    }
    case 'media': {
      const { mediaUrl, caption, mimetype, mediaType } = payload.message;
      if (!mediaUrl || typeof mediaUrl !== 'string') {
        const err = new Error('Campo "mediaUrl" é obrigatório para mensagens de mídia.');
        err.code = 'invalid_payload';
        throw err;
      }
      const type = mediaType && ALLOWED_MEDIA_TYPES.has(mediaType) ? mediaType : 'image';
      const content = {
        [type]: { url: mediaUrl },
      };
      if (caption) {
        content.caption = caption;
      }
      if (mimetype) {
        content[type].mimetype = mimetype;
      }
      return content;
    }
    case 'template': {
      return payload.message;
    }
    default: {
      const err = new Error('Tipo de mensagem não suportado.');
      err.code = 'invalid_payload';
      throw err;
    }
  }
}

async function bootstrap() {
  const store = new InstanceStore(INSTANCES_FILE);
  await store.init();
  const manager = new BaileysManager(store);
  await manager.initExistingInstances();

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(bearerAuthMiddleware);

  app.get('/qrcode', async (req, res) => {
    const { instanceId } = req.query;
    if (!instanceId || typeof instanceId !== 'string') {
      return createErrorResponse(res, 400, 'invalid_request', 'Parâmetro "instanceId" é obrigatório.');
    }
    const instance = store.get(instanceId);
    if (!instance) {
      return createErrorResponse(res, 404, 'not_found', 'Instância não encontrada.');
    }

    try {
      await manager.getOrCreateSession(instanceId);
    } catch (error) {
      console.error(`Erro ao inicializar sessão ${instanceId}:`, error.message);
      return createErrorResponse(res, 500, 'internal_error', 'Falha ao inicializar a sessão Baileys.');
    }

    const qr = manager.getQRCode(instanceId);
    if (!qr) {
      if (instance.status === 'ready') {
        return createErrorResponse(res, 404, 'qr_not_available', 'Instância já autenticada.');
      }
      return createErrorResponse(res, 404, 'qr_not_ready', 'QR Code não disponível no momento.');
    }

    return res.json(qr);
  });

  app.get('/instances', (req, res) => {
    return res.json(store.list());
  });

  app.post('/instances', async (req, res) => {
    let payload;
    try {
      payload = validateInstancePayload(req.body);
    } catch (error) {
      return createErrorResponse(res, 400, error.code || 'invalid_payload', error.message);
    }

    try {
      const instance = await store.create(payload);
      await manager.initializeForInstance(instance.id);
      return res.status(201).json(instance);
    } catch (error) {
      const code = error.code === 'instance_exists' ? 400 : 500;
      const message = error.code === 'instance_exists' ? error.message : 'Erro ao criar instância.';
      return createErrorResponse(res, code, error.code || 'internal_error', message);
    }
  });

  app.get('/instances/:instanceId', (req, res) => {
    const instance = store.get(req.params.instanceId);
    if (!instance) {
      return createErrorResponse(res, 404, 'not_found', 'Instância não encontrada.');
    }
    return res.json(instance);
  });

  app.delete('/instances/:instanceId', async (req, res) => {
    const { instanceId } = req.params;
    const instance = store.get(instanceId);
    if (!instance) {
      return createErrorResponse(res, 404, 'not_found', 'Instância não encontrada.');
    }
    await manager.cleanupSession(instanceId, { keepData: false });
    await store.delete(instanceId);
    return res.status(204).send();
  });

  app.patch('/instances/:instanceId/status', async (req, res) => {
    const { instanceId } = req.params;
    const { status } = req.body || {};
    if (typeof status !== 'string') {
      return createErrorResponse(res, 400, 'invalid_payload', 'Campo "status" é obrigatório.');
    }
    if (!ALLOWED_STATUSES.has(status)) {
      return createErrorResponse(res, 400, 'invalid_status', 'Status informado é inválido.');
    }
    const instance = await store.updateStatus(instanceId, status);
    if (!instance) {
      return createErrorResponse(res, 404, 'not_found', 'Instância não encontrada.');
    }
    return res.json(instance);
  });

  app.post('/messages', async (req, res) => {
    const payload = req.body || {};
    const { instanceId, to, type } = payload;

    if (!instanceId || typeof instanceId !== 'string') {
      return createErrorResponse(res, 400, 'invalid_payload', 'Campo "instanceId" é obrigatório.');
    }
    if (!to || typeof to !== 'string') {
      return createErrorResponse(res, 400, 'invalid_payload', 'Campo "to" é obrigatório.');
    }
    if (!type || typeof type !== 'string') {
      return createErrorResponse(res, 400, 'invalid_payload', 'Campo "type" é obrigatório.');
    }

    const instance = store.get(instanceId);
    if (!instance) {
      return createErrorResponse(res, 404, 'not_found', 'Instância não encontrada.');
    }

    let session;
    try {
      session = await manager.getOrCreateSession(instanceId);
    } catch (error) {
      console.error(`Erro ao recuperar sessão ${instanceId}:`, error.message);
      return createErrorResponse(res, 500, 'internal_error', 'Falha ao inicializar a sessão Baileys.');
    }

    if (session.connection !== 'open') {
      return createErrorResponse(res, 409, 'instance_not_ready', 'Instância não está pronta para enviar mensagens.');
    }

    let content;
    try {
      content = buildMessageContent(payload);
    } catch (error) {
      return createErrorResponse(res, 400, error.code || 'invalid_payload', error.message);
    }

    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

    try {
      const result = await session.sock.sendMessage(jid, content);
      const response = {
        messageId: result.key?.id || '',
        status: 'queued',
        timestamp: new Date().toISOString(),
      };
      return res.status(202).json(response);
    } catch (error) {
      console.error(`Erro ao enviar mensagem pela instância ${instanceId}:`, error);
      return createErrorResponse(res, 500, 'internal_error', 'Não foi possível enviar a mensagem.');
    }
  });

  app.use((err, req, res, _next) => {
    console.error('Erro inesperado:', err);
    return createErrorResponse(res, 500, 'internal_error', 'Erro interno do servidor.');
  });

  app.listen(PORT, () => {
    console.log(`Serviço Baileys escutando na porta ${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Falha ao iniciar o serviço Baileys:', error);
  process.exit(1);
});
