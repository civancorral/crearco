import { Router } from 'express';
import { sendMessage, sendMedia } from '../services/baileys-manager.js';
import { phoneToJid } from '../utils/phone.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * POST /api/messages/send — Send a text message
 * Body: { userId, phone, text }
 */
router.post('/send', async (req, res) => {
  const { userId, phone, jid, text } = req.body;

  if (!userId || !text) {
    return res.status(400).json({ error: 'userId and text are required' });
  }

  if (!phone && !jid) {
    return res.status(400).json({ error: 'phone or jid is required' });
  }

  const targetJid = jid || phoneToJid(phone);

  try {
    const result = await sendMessage(String(userId), targetJid, text);
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('Error sending message', { userId, phone, error: err.message });
    res.status(500).json({ error: 'Failed to send message', details: err.message });
  }
});

/**
 * POST /api/messages/send-media — Send a media message
 * Body: { userId, phone, mediaPath, caption, mimeType }
 */
router.post('/send-media', async (req, res) => {
  const { userId, phone, jid, mediaPath, caption, mimeType } = req.body;

  if (!userId || !mediaPath) {
    return res.status(400).json({ error: 'userId and mediaPath are required' });
  }

  if (!phone && !jid) {
    return res.status(400).json({ error: 'phone or jid is required' });
  }

  const targetJid = jid || phoneToJid(phone);

  try {
    const result = await sendMedia(String(userId), targetJid, mediaPath, caption, mimeType);
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('Error sending media', { userId, phone, error: err.message });
    res.status(500).json({ error: 'Failed to send media', details: err.message });
  }
});

/**
 * POST /api/messages/send-bulk — Send message to multiple recipients
 * Body: { userId, recipients: [{ phone }], text, delayMs }
 */
router.post('/send-bulk', async (req, res) => {
  const { userId, recipients, text, delayMs = 2000 } = req.body;

  if (!userId || !recipients || !Array.isArray(recipients) || !text) {
    return res.status(400).json({ error: 'userId, recipients array, and text are required' });
  }

  // Start sending in background
  const results = [];
  let successCount = 0;
  let failCount = 0;

  // Send without blocking the response
  res.json({
    success: true,
    message: `Sending to ${recipients.length} recipients`,
    total: recipients.length,
  });

  // Process in background
  for (const recipient of recipients) {
    try {
      const targetJid = phoneToJid(recipient.phone);
      await sendMessage(String(userId), targetJid, text);
      successCount++;
      logger.info('Bulk message sent', { userId, phone: recipient.phone });
    } catch (err) {
      failCount++;
      logger.error('Bulk message failed', { userId, phone: recipient.phone, error: err.message });
    }

    // Rate limiting delay
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  logger.info('Bulk send completed', { userId, successCount, failCount, total: recipients.length });
});

export default router;
