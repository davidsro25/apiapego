import { pool } from './db'
import { logger } from '../utils/logger'

const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    api_key VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'disconnected',
    webhook_url TEXT,
    webhook_enabled BOOLEAN DEFAULT true,
    webhook_events TEXT[] DEFAULT ARRAY['messages', 'status', 'connection'],
    settings JSONB DEFAULT '{}',
    phone VARCHAR(20),
    profile_name VARCHAR(255),
    profile_pic_url TEXT,
    provider VARCHAR(20) DEFAULT 'baileys',
    subscription_active BOOLEAN DEFAULT true,
    proxy_url TEXT,
    ws_events TEXT[] DEFAULT ARRAY['messages', 'connection', 'qr', 'presence', 'call'],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID REFERENCES instances(id) ON DELETE CASCADE,
    message_id VARCHAR(255) NOT NULL,
    remote_jid VARCHAR(255) NOT NULL,
    from_me BOOLEAN DEFAULT false,
    type VARCHAR(50) NOT NULL,
    content JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'sent',
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
  `,
  `CREATE INDEX IF NOT EXISTS idx_messages_instance ON messages(instance_id)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_remote_jid ON messages(remote_jid)`,
  `
  CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
  `,
  // Colunas adicionadas na v2
  `ALTER TABLE instances ADD COLUMN IF NOT EXISTS webhook_enabled BOOLEAN DEFAULT true`,
  `ALTER TABLE instances ADD COLUMN IF NOT EXISTS subscription_active BOOLEAN DEFAULT true`,
  `ALTER TABLE instances ADD COLUMN IF NOT EXISTS proxy_url TEXT`,
  // Colunas adicionadas na v3
  `ALTER TABLE instances ADD COLUMN IF NOT EXISTS ws_events TEXT[] DEFAULT ARRAY['messages', 'connection', 'qr', 'presence', 'call']`,
]

export async function runMigrations() {
  const client = await pool.connect()
  try {
    logger.info('Running database migrations...')
    for (const migration of MIGRATIONS) {
      await client.query(migration)
    }
    logger.info('Migrations completed successfully')
  } catch (err) {
    logger.error({ err }, 'Migration failed')
    throw err
  } finally {
    client.release()
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}
