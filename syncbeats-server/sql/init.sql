-- SyncBeats — PostgreSQL schema
-- Run automatically on first container boot

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT        NOT NULL,
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT,
  auth_provider TEXT        NOT NULL DEFAULT 'LOCAL',
  google_id     TEXT        UNIQUE,
  email_verified_at TIMESTAMPTZ,
  email_verification_token_hash TEXT,
  email_verification_expires_at TIMESTAMPTZ,
  password_reset_token_hash TEXT,
  password_reset_expires_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ── Devices ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS devices (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_key    TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, device_key)
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices (user_id);

-- ── Rooms ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rooms (
  id            TEXT        PRIMARY KEY,          -- 6-digit code e.g. "482931"
  host_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_url     TEXT,
  playback_state TEXT       NOT NULL DEFAULT 'IDLE',
  position_ms   BIGINT      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at      TIMESTAMPTZ                        -- NULL = still active
);

CREATE INDEX IF NOT EXISTS idx_rooms_host_id   ON rooms (host_id);
CREATE INDEX IF NOT EXISTS idx_rooms_active    ON rooms (ended_at) WHERE ended_at IS NULL;

-- ── Room Participants ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS room_participants (
  room_id      TEXT        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  socket_id    TEXT        NOT NULL,
  display_name TEXT        NOT NULL,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at      TIMESTAMPTZ,
  PRIMARY KEY (room_id, user_id)
);

-- ── Auto updated_at trigger (shared) ──────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER trg_devices_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();