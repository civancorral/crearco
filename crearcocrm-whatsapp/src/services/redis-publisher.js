import Redis from 'ioredis';
import config from '../config.js';
import logger from '../utils/logger.js';

const CHANNEL = 'whatsapp:events';

let redis = null;

function getRedis() {
  if (!redis) {
    redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
    });

    redis.on('error', (err) => {
      logger.error('Redis publisher connection error', { error: err.message });
    });

    redis.on('connect', () => {
      logger.info('Redis publisher connected');
    });
  }
  return redis;
}

/**
 * Publish an event to the whatsapp:events Redis channel.
 * Events are JSON-encoded with a type field for the Laravel subscriber.
 */
export async function publishEvent(type, data) {
  try {
    const payload = JSON.stringify({ type, data, timestamp: Date.now() });
    await getRedis().publish(CHANNEL, payload);
    logger.debug('Published event', { type, channel: CHANNEL });
  } catch (err) {
    logger.error('Failed to publish event', { type, error: err.message });
  }
}

/**
 * Store QR code data in Redis for polling by Laravel.
 */
export async function storeQrCode(userId, qrDataUrl) {
  try {
    await getRedis().setex(`whatsapp:qr:${userId}`, 120, qrDataUrl);
    logger.debug('Stored QR code', { userId });
  } catch (err) {
    logger.error('Failed to store QR code', { userId, error: err.message });
  }
}

/**
 * Get QR code from Redis.
 */
export async function getQrCode(userId) {
  try {
    return await getRedis().get(`whatsapp:qr:${userId}`);
  } catch (err) {
    logger.error('Failed to get QR code', { userId, error: err.message });
    return null;
  }
}

/**
 * Clear QR code from Redis.
 */
export async function clearQrCode(userId) {
  try {
    await getRedis().del(`whatsapp:qr:${userId}`);
  } catch (err) {
    logger.error('Failed to clear QR code', { userId, error: err.message });
  }
}

// --- LID-to-phone mapping persistence ---

const LID_MAP_KEY = 'whatsapp:lid_map';

/**
 * Store a LID→phone mapping in Redis hash.
 */
export async function storeLidMapping(lidJid, phoneJid) {
  try {
    await getRedis().hset(LID_MAP_KEY, lidJid, phoneJid);
  } catch (err) {
    logger.error('Failed to store LID mapping', { lidJid, error: err.message });
  }
}

/**
 * Get a phone JID from a LID JID.
 */
export async function getLidMapping(lidJid) {
  try {
    return await getRedis().hget(LID_MAP_KEY, lidJid);
  } catch (err) {
    logger.error('Failed to get LID mapping', { lidJid, error: err.message });
    return null;
  }
}

/**
 * Load all LID mappings from Redis.
 */
export async function loadAllLidMappings() {
  try {
    return await getRedis().hgetall(LID_MAP_KEY);
  } catch (err) {
    logger.error('Failed to load LID mappings', { error: err.message });
    return {};
  }
}
