import express from 'express';
import config from './config.js';
import logger from './utils/logger.js';
import { authMiddleware } from './middleware/auth.js';
import sessionsRouter from './routes/sessions.js';
import messagesRouter from './routes/messages.js';
import { mkdirSync } from 'fs';
import { autoStartSavedSessions } from './services/baileys-manager.js';

// Ensure required directories exist
mkdirSync(config.sessionsDir, { recursive: true });
mkdirSync(config.mediaDir, { recursive: true });
mkdirSync('/var/www/crearco/crearcocrm-whatsapp/logs', { recursive: true });

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));

// Health check (no auth)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Auth middleware for all /api routes
app.use('/api', authMiddleware);

// Routes
app.use('/api/sessions', sessionsRouter);
app.use('/api/messages', messagesRouter);

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(config.port, '127.0.0.1', () => {
  logger.info(`WhatsApp Bridge running on port ${config.port}`);

  // Auto-start sessions with saved credentials
  autoStartSavedSessions().catch(err => {
    logger.error('Auto-start failed', { error: err.message });
  });
});
