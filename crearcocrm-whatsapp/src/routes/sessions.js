import { Router } from 'express';
import { startSession, stopSession, getSessionStatus, getAllSessions } from '../services/baileys-manager.js';
import { getQrCode } from '../services/redis-publisher.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * GET /api/sessions — List all active sessions
 */
router.get('/', (req, res) => {
  const sessions = getAllSessions();
  res.json({ sessions });
});

/**
 * GET /api/sessions/:userId/status — Get session status
 */
router.get('/:userId/status', (req, res) => {
  const { userId } = req.params;
  const status = getSessionStatus(userId);
  res.json(status);
});

/**
 * GET /api/sessions/:userId/qr — Get QR code for scanning
 */
router.get('/:userId/qr', async (req, res) => {
  const { userId } = req.params;
  try {
    const qr = await getQrCode(userId);
    if (!qr) {
      return res.json({ qr: null, message: 'No QR code available. Session may already be connected.' });
    }
    res.json({ qr });
  } catch (err) {
    logger.error('Error fetching QR', { userId, error: err.message });
    res.status(500).json({ error: 'Failed to fetch QR code' });
  }
});

/**
 * POST /api/sessions/:userId/start — Start a WhatsApp session
 */
router.post('/:userId/start', async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await startSession(userId);
    res.json(result);
  } catch (err) {
    logger.error('Error starting session', { userId, error: err.message });
    res.status(500).json({ error: 'Failed to start session', details: err.message });
  }
});

/**
 * POST /api/sessions/:userId/stop — Stop and disconnect session
 */
router.post('/:userId/stop', async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await stopSession(userId);
    res.json(result);
  } catch (err) {
    logger.error('Error stopping session', { userId, error: err.message });
    res.status(500).json({ error: 'Failed to stop session', details: err.message });
  }
});

export default router;
