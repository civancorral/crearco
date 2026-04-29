import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import pino from 'pino';
import QRCode from 'qrcode';
import config from '../config.js';
import logger from '../utils/logger.js';
import { publishEvent, storeQrCode, clearQrCode, storeLidMapping, getLidMapping, loadAllLidMappings } from './redis-publisher.js';
import { jidToPhone, normalizePhone } from '../utils/phone.js';
import { writeFile } from 'fs/promises';
import mime from 'mime-types';

// Active socket connections keyed by userId
const sessions = new Map();

// LID-to-phone JID mapping: lid@lid -> phone@s.whatsapp.net
const lidToPhoneMap = new Map();

// Silent pino logger for Baileys internals
const baileysLogger = pino({ level: 'silent' });

/**
 * Get session status for a user.
 */
export function getSessionStatus(userId) {
  const session = sessions.get(String(userId));
  if (!session) {
    return { status: 'disconnected', phone: null };
  }
  return {
    status: session.status,
    phone: session.phone || null,
  };
}

/**
 * Get all active sessions.
 */
export function getAllSessions() {
  const result = {};
  for (const [userId, session] of sessions) {
    result[userId] = {
      status: session.status,
      phone: session.phone || null,
    };
  }
  return result;
}

/**
 * Start a WhatsApp session for a user.
 */
export async function startSession(userId) {
  userId = String(userId);

  // If already connected, return current status
  if (sessions.has(userId) && sessions.get(userId).status === 'connected') {
    logger.info('Session already connected', { userId });
    return { status: 'connected', phone: sessions.get(userId).phone };
  }

  // If connecting, return that
  if (sessions.has(userId) && sessions.get(userId).status === 'connecting') {
    logger.info('Session already connecting', { userId });
    return { status: 'connecting' };
  }

  const sessionDir = join(config.sessionsDir, userId);
  mkdirSync(sessionDir, { recursive: true });

  sessions.set(userId, { status: 'connecting', phone: null, socket: null, retryCount: 0 });

  try {
    await createSocket(userId, sessionDir);
    return { status: 'connecting' };
  } catch (err) {
    logger.error('Failed to start session', { userId, error: err.message });
    sessions.delete(userId);
    throw err;
  }
}

/**
 * Stop a WhatsApp session for a user.
 */
export async function stopSession(userId) {
  userId = String(userId);
  const session = sessions.get(userId);

  if (!session) {
    return { status: 'disconnected' };
  }

  if (session.socket) {
    try {
      await session.socket.logout();
    } catch (e) {
      // Ignore logout errors
    }
    session.socket.end();
  }

  sessions.delete(userId);
  await clearQrCode(userId);

  // Remove session credentials
  const sessionDir = join(config.sessionsDir, userId);
  if (existsSync(sessionDir)) {
    rmSync(sessionDir, { recursive: true, force: true });
  }

  await publishEvent('session.disconnected', { userId });
  logger.info('Session stopped and credentials cleared', { userId });

  return { status: 'disconnected' };
}

/**
 * Send a text message.
 */
export async function sendMessage(userId, jid, text) {
  userId = String(userId);
  const session = sessions.get(userId);

  if (!session || session.status !== 'connected' || !session.socket) {
    throw new Error('Session not connected');
  }

  // Resolve the actual WhatsApp JID (handles 52→521 for Mexican numbers)
  const resolvedJid = await resolveWhatsAppJid(session.socket, jid);

  // Build LID→phone mapping for this recipient
  await cacheLidMapping(session.socket, resolvedJid);

  const result = await session.socket.sendMessage(resolvedJid, { text });
  logger.info('Message sent', { userId, jid: resolvedJid, messageId: result.key.id });

  return {
    messageId: result.key.id,
    timestamp: result.messageTimestamp,
  };
}

/**
 * Send a media message (image, document, audio, video).
 */
export async function sendMedia(userId, jid, mediaPath, caption, mimeType) {
  userId = String(userId);
  const session = sessions.get(userId);

  if (!session || session.status !== 'connected' || !session.socket) {
    throw new Error('Session not connected');
  }

  // Resolve the actual WhatsApp JID (handles 52→521 for Mexican numbers)
  const resolvedJid = await resolveWhatsAppJid(session.socket, jid);

  // Build LID→phone mapping for this recipient
  await cacheLidMapping(session.socket, resolvedJid);

  const { readFileSync } = await import('fs');
  const buffer = readFileSync(mediaPath);

  let messageContent = {};

  if (mimeType && mimeType.startsWith('image/')) {
    messageContent = { image: buffer, caption: caption || '' };
  } else if (mimeType && mimeType.startsWith('video/')) {
    messageContent = { video: buffer, caption: caption || '' };
  } else if (mimeType && mimeType.startsWith('audio/')) {
    messageContent = { audio: buffer, mimetype: mimeType };
  } else {
    messageContent = {
      document: buffer,
      mimetype: mimeType || 'application/octet-stream',
      fileName: mediaPath.split('/').pop(),
      caption: caption || '',
    };
  }

  const result = await session.socket.sendMessage(resolvedJid, messageContent);
  logger.info('Media sent', { userId, jid: resolvedJid, messageId: result.key.id, mimeType });

  return {
    messageId: result.key.id,
    timestamp: result.messageTimestamp,
  };
}

/**
 * Download media from a received message and save to disk.
 */
export async function downloadMedia(userId, messageKey, message) {
  userId = String(userId);
  const session = sessions.get(userId);

  if (!session || !session.socket) {
    throw new Error('Session not available');
  }

  const { downloadMediaMessage } = await import('@whiskeysockets/baileys');

  const buffer = await downloadMediaMessage(
    { key: messageKey, message },
    'buffer',
    {},
    { logger: baileysLogger, reuploadRequest: session.socket.updateMediaMessage }
  );

  // Determine file extension
  const mediaType = Object.keys(message).find(k =>
    ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(k)
  );

  const mediaMsg = message[mediaType];
  const ext = mime.extension(mediaMsg?.mimetype || 'application/octet-stream') || 'bin';
  const filename = `${messageKey.id}.${ext}`;
  const userMediaDir = join(config.mediaDir, userId);
  mkdirSync(userMediaDir, { recursive: true });

  const filepath = join(userMediaDir, filename);
  await writeFile(filepath, buffer);

  logger.info('Media downloaded', { userId, filename });

  return { filename, filepath, mimetype: mediaMsg?.mimetype, size: buffer.length };
}

/**
 * Auto-start sessions that have saved credentials on disk.
 */
export async function autoStartSavedSessions() {
  const { readdirSync } = await import('fs');
  try {
    if (!existsSync(config.sessionsDir)) return;
    const dirs = readdirSync(config.sessionsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const userId of dirs) {
      const credsPath = join(config.sessionsDir, userId, 'creds.json');
      if (existsSync(credsPath)) {
        logger.info('Auto-starting saved session', { userId });
        try {
          await startSession(userId);
        } catch (e) {
          logger.error('Failed to auto-start session', { userId, error: e.message });
        }
      }
    }
  } catch (e) {
    logger.error('Error scanning sessions directory', { error: e.message });
  }
}

// --- Internal Functions ---

// Cache: normalized phone → actual WhatsApp JID
const whatsappJidCache = new Map();

/**
 * Resolve the actual WhatsApp JID for a phone number.
 * Some Mexican numbers are registered as 521XXXXXXXXXX instead of 52XXXXXXXXXX.
 * WhatsApp silently accepts sends to the wrong format but never delivers them.
 */
async function resolveWhatsAppJid(socket, phoneJid) {
  if (!phoneJid?.endsWith('@s.whatsapp.net')) return phoneJid;

  const phone = jidToPhone(phoneJid);
  const normalizedPhone = normalizePhone(phone);

  // Check cache first
  const cached = whatsappJidCache.get(normalizedPhone);
  if (cached) return cached;

  try {
    const results = await socket.onWhatsApp(phoneJid);
    if (results && results.length > 0 && results[0].exists) {
      const realJid = results[0].jid;
      whatsappJidCache.set(normalizedPhone, realJid);
      logger.info('Resolved WhatsApp JID', { input: phoneJid, resolved: realJid });
      return realJid;
    }
  } catch (e) {
    logger.warn('Failed to resolve WhatsApp JID', { phoneJid, error: e.message });
  }

  // Fallback to original
  return phoneJid;
}

/**
 * Query onWhatsApp to build LID→phone mapping for a JID.
 * Normalizes the returned JID to handle Mexican 521→52 format.
 */
async function cacheLidMapping(socket, phoneJid) {
  if (!phoneJid?.endsWith('@s.whatsapp.net')) return;
  // Don't re-query if we already have a mapping that maps to this phone
  const phone = jidToPhone(phoneJid);
  const normalizedPhone = normalizePhone(phone);
  for (const [, val] of lidToPhoneMap) {
    const valPhone = normalizePhone(jidToPhone(val));
    if (valPhone === normalizedPhone) {
      return; // Already cached
    }
  }
  try {
    const results = await socket.onWhatsApp(phoneJid);
    if (results) {
      for (const r of results) {
        if (r.lid && r.jid) {
          const lidJid = r.lid.endsWith('@lid') ? r.lid : `${r.lid}@lid`;
          const rNormalized = normalizePhone(jidToPhone(r.jid));
          const normalizedJid = rNormalized ? `${rNormalized}@s.whatsapp.net` : r.jid;
          lidToPhoneMap.set(lidJid, normalizedJid);
          // Persist to Redis so it survives restarts
          await storeLidMapping(lidJid, normalizedJid);
          logger.info('Cached LID mapping', { phoneJid: normalizedJid, lid: lidJid });
        }
      }
    }
  } catch (e) {
    logger.warn('Failed to cache LID mapping', { phoneJid, error: e.message });
  }
}

/**
 * Resolve a LID JID to phone JID. Checks in-memory cache, then Redis, then onWhatsApp.
 */
async function resolveLidJid(socket, lidJid) {
  // 1. Check in-memory cache
  const cached = lidToPhoneMap.get(lidJid);
  if (cached) return cached;

  // 2. Check Redis
  const redisCached = await getLidMapping(lidJid);
  if (redisCached) {
    lidToPhoneMap.set(lidJid, redisCached);
    return redisCached;
  }

  // 3. No fallback for LID — we can't query onWhatsApp with a LID
  return null;
}

async function createSocket(userId, sessionDir) {
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
    },
    logger: baileysLogger,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect: true,
  });

  // Update socket reference
  const session = sessions.get(userId);
  if (session) session.socket = socket;

  // Handle credentials update
  socket.ev.on('creds.update', saveCreds);

  // Load existing LID mappings from Redis on connection
  try {
    const savedMappings = await loadAllLidMappings();
    for (const [lid, phoneJid] of Object.entries(savedMappings)) {
      lidToPhoneMap.set(lid, phoneJid);
    }
    if (Object.keys(savedMappings).length > 0) {
      logger.info('Loaded LID mappings from Redis', { userId, count: Object.keys(savedMappings).length });
    }
  } catch (e) {
    logger.warn('Failed to load LID mappings from Redis', { error: e.message });
  }

  // Build LID-to-phone mapping from contacts events
  const updateLidMapping = async (contacts) => {
    for (const contact of contacts) {
      let lidKey = null;
      let phoneValue = null;

      if (contact.lid && contact.jid) {
        lidKey = contact.lid;
        phoneValue = contact.jid;
      } else if (contact.id && contact.lid) {
        if (contact.id.endsWith('@s.whatsapp.net')) {
          lidKey = contact.lid;
          phoneValue = contact.id;
        }
      } else if (contact.id && contact.id.endsWith('@lid')) {
        if (contact.jid) {
          lidKey = contact.id;
          phoneValue = contact.jid;
        }
      }

      if (lidKey && phoneValue) {
        lidToPhoneMap.set(lidKey, phoneValue);
        await storeLidMapping(lidKey, phoneValue);
      }
    }
  };

  // Use process() to handle batched events — contacts before messages
  socket.ev.process(async (events) => {
    // 1. Update contacts/LID mapping FIRST
    if (events['contacts.upsert']) {
      await updateLidMapping(events['contacts.upsert']);
      logger.info('Contacts upserted', { userId, count: events['contacts.upsert'].length, mapSize: lidToPhoneMap.size });
    }
    if (events['contacts.update']) {
      await updateLidMapping(events['contacts.update']);
    }

    // 2. Process messages AFTER contacts are mapped
    if (events['messages.upsert']) {
      await handleMessagesUpsert(userId, events['messages.upsert']);
    }

    // 3. Handle message status updates
    if (events['messages.update']) {
      await handleMessagesUpdate(userId, events['messages.update']);
    }
  });

  // Handle connection update
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('QR code generated', { userId });
      try {
        const qrDataUrl = await QRCode.toDataURL(qr);
        await storeQrCode(userId, qrDataUrl);
        await publishEvent('session.qr', { userId, qr: qrDataUrl });
      } catch (err) {
        logger.error('Failed to generate QR', { userId, error: err.message });
      }
    }

    if (connection === 'open') {
      const phone = jidToPhone(socket.user?.id) || null;
      const sessionData = sessions.get(userId);
      if (sessionData) {
        sessionData.status = 'connected';
        sessionData.phone = phone;
        sessionData.retryCount = 0;
      }

      await clearQrCode(userId);
      await publishEvent('session.connected', { userId, phone });
      logger.info('Session connected', { userId, phone });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      const sessionData = sessions.get(userId);

      logger.warn('Connection closed', { userId, statusCode, shouldReconnect });

      if (shouldReconnect && sessionData && sessionData.retryCount < 5) {
        sessionData.retryCount++;
        sessionData.status = 'connecting';
        logger.info('Attempting reconnection', { userId, attempt: sessionData.retryCount });
        setTimeout(() => createSocket(userId, sessionDir), 3000);
      } else {
        if (sessionData) {
          sessionData.status = 'disconnected';
          sessionData.socket = null;
        }
        if (statusCode === DisconnectReason.loggedOut) {
          // Clear credentials on logout
          if (existsSync(sessionDir)) {
            rmSync(sessionDir, { recursive: true, force: true });
          }
        }
        await publishEvent('session.disconnected', { userId, reason: statusCode });
        sessions.delete(userId);
      }
    }
  });

}

// --- Message Event Handlers ---

async function handleMessagesUpsert(userId, { messages: msgs, type: upsertType }) {
  logger.info('messages.upsert fired', { userId, upsertType, count: msgs.length });
  // Accept both 'notify' (real-time) and 'append' (offline/catch-up) messages
  if (upsertType !== 'notify' && upsertType !== 'append') return;

  for (const msg of msgs) {
    // Skip status broadcasts
    if (msg.key.remoteJid === 'status@broadcast') continue;
    // Skip group messages
    if (msg.key.remoteJid?.endsWith('@g.us')) continue;

    // For 'append' type, skip messages older than 5 minutes to avoid old history
    if (upsertType === 'append' && msg.messageTimestamp) {
      const ts = typeof msg.messageTimestamp === 'object' ? msg.messageTimestamp.low : msg.messageTimestamp;
      const ageSeconds = Math.floor(Date.now() / 1000) - ts;
      if (ageSeconds > 300) {
        logger.info('Skipping old history message', { userId, ageSeconds, msgId: msg.key.id });
        continue;
      }
    }

    const isFromMe = msg.key.fromMe || false;
    let jid = msg.key.remoteJid;
    let phone = jidToPhone(jid);

    // Normalize Mexican phone numbers (521→52) to prevent duplicate conversations
    if (jid?.endsWith('@s.whatsapp.net') && phone) {
      const normalized = normalizePhone(phone);
      if (normalized && normalized !== phone) {
        jid = `${normalized}@s.whatsapp.net`;
        phone = normalized;
      }
    }

    // Resolve LID JIDs to phone-based JIDs
    if (jid?.endsWith('@lid')) {
      const session = sessions.get(userId);
      const resolvedJid = await resolveLidJid(session?.socket, jid);
      if (resolvedJid) {
        jid = resolvedJid;
        phone = jidToPhone(jid);
      } else if (msg.key.participant?.endsWith('@s.whatsapp.net')) {
        // Some messages include participant with phone JID
        lidToPhoneMap.set(jid, msg.key.participant);
        await storeLidMapping(jid, msg.key.participant);
        jid = msg.key.participant;
        phone = jidToPhone(jid);
      } else {
        logger.info('LID not resolved', { userId, lid: jid, pushName: msg.pushName, mapSize: lidToPhoneMap.size });
      }
    }

    // Determine message type and body
    const messageContent = msg.message;
    if (!messageContent) continue;

    let msgType = 'text';
    let body = '';
    let mediaInfo = null;

    if (messageContent.conversation) {
      body = messageContent.conversation;
    } else if (messageContent.extendedTextMessage) {
      body = messageContent.extendedTextMessage.text || '';
    } else if (messageContent.imageMessage) {
      msgType = 'image';
      body = messageContent.imageMessage.caption || '';
      mediaInfo = {
        mimetype: messageContent.imageMessage.mimetype,
        size: messageContent.imageMessage.fileLength,
      };
    } else if (messageContent.videoMessage) {
      msgType = 'video';
      body = messageContent.videoMessage.caption || '';
      mediaInfo = {
        mimetype: messageContent.videoMessage.mimetype,
        size: messageContent.videoMessage.fileLength,
      };
    } else if (messageContent.audioMessage) {
      msgType = 'audio';
      mediaInfo = {
        mimetype: messageContent.audioMessage.mimetype,
        size: messageContent.audioMessage.fileLength,
        ptt: messageContent.audioMessage.ptt || false,
      };
    } else if (messageContent.documentMessage) {
      msgType = 'document';
      body = messageContent.documentMessage.fileName || '';
      mediaInfo = {
        mimetype: messageContent.documentMessage.mimetype,
        size: messageContent.documentMessage.fileLength,
        fileName: messageContent.documentMessage.fileName,
      };
    } else if (messageContent.stickerMessage) {
      msgType = 'sticker';
      mediaInfo = { mimetype: messageContent.stickerMessage.mimetype };
    } else {
      continue;
    }

    // Download media if present and incoming
    let downloadedMedia = null;
    if (mediaInfo && !isFromMe) {
      try {
        downloadedMedia = await downloadMedia(userId, msg.key, messageContent);
      } catch (err) {
        logger.error('Failed to download media', { userId, error: err.message });
      }
    }

    const eventData = {
      userId,
      messageId: msg.key.id,
      jid,
      phone,
      isFromMe,
      type: msgType,
      body,
      mediaInfo,
      downloadedMedia,
      timestamp: msg.messageTimestamp,
      pushName: msg.pushName || null,
      rawKey: msg.key,
    };

    await publishEvent('message.received', eventData);
    logger.info('Message processed', { userId, jid, type: msgType, isFromMe });
  }
}

async function handleMessagesUpdate(userId, updates) {
  logger.info('messages.update fired', { userId, count: updates.length });
  for (const update of updates) {
    if (update.key.remoteJid === 'status@broadcast') continue;
    // Skip group messages
    if (update.key.remoteJid?.endsWith('@g.us')) continue;

    let status = 'unknown';
    const rawStatus = update.update?.status;
    if (rawStatus === 2) status = 'sent';
    else if (rawStatus === 3) status = 'delivered';
    else if (rawStatus === 4) status = 'read';

    if (status !== 'unknown') {
      logger.info('Message status update', { userId, messageId: update.key.id, status, rawStatus });
      await publishEvent('message.status', {
        userId,
        messageId: update.key.id,
        jid: update.key.remoteJid,
        status,
      });
    }
  }
}
