import config from '../config.js';

/**
 * Bearer token authentication middleware.
 * Validates the Authorization header against WHATSAPP_SHARED_SECRET.
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.substring(7);

  if (token !== config.sharedSecret) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  next();
}
