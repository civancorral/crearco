import { config } from 'process';

// Load .env manually (no dotenv dependency needed — use PM2 env or shell)
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export default {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'production',
  sharedSecret: process.env.WHATSAPP_SHARED_SECRET || '',
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    db: parseInt(process.env.REDIS_DB || '2', 10),
  },
  mediaDir: resolve(__dirname, '..', process.env.MEDIA_DIR || './media'),
  sessionsDir: resolve(__dirname, '..', process.env.SESSIONS_DIR || './sessions'),
  logLevel: process.env.LOG_LEVEL || 'info',
};
