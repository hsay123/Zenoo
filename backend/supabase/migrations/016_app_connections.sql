-- Migration: 016_app_connections
-- viaSocket App integrations (HHG sponsor): a user connects their own Slack or
-- Discord and chooses where Zeno posts their alerts (job funded, label
-- reviewed, payout settled). viaSocket holds the OAuth; Zeno keeps one
-- connection id (auth_id) and one flow id (script_id) per user and app.
--
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS user_app_connections (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app                TEXT NOT NULL CHECK (app IN ('slack', 'discord')),
  auth_id            TEXT NOT NULL,                 -- viaSocket connection (opaque)
  script_id          TEXT NOT NULL,                 -- viaSocket flow that runs the app's actions
  destination        JSONB,                         -- chosen once after Connect; null = not set yet
  destination_label  TEXT,                          -- e.g. "#zeno-alerts", shown in the UI
  events             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  last_sent_at       TIMESTAMPTZ,
  last_error         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, app)
);
CREATE INDEX IF NOT EXISTS idx_user_app_connections_user ON user_app_connections(user_id);
ALTER TABLE user_app_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON user_app_connections FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
