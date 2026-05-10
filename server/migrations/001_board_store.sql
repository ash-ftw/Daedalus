CREATE TABLE IF NOT EXISTS daedalus_board_rooms (
  room_id TEXT PRIMARY KEY,
  board_name TEXT NOT NULL,
  classroom_id TEXT,
  owner_name TEXT,
  thumbnail_data_url TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  help_requested BOOLEAN NOT NULL DEFAULT false,
  objects JSONB NOT NULL DEFAULT '[]'::jsonb,
  analyses JSONB NOT NULL DEFAULT '[]'::jsonb,
  chat JSONB NOT NULL DEFAULT '[]'::jsonb,
  comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  versions JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daedalus_board_rooms_classroom_id
  ON daedalus_board_rooms (classroom_id);

CREATE INDEX IF NOT EXISTS idx_daedalus_board_rooms_updated_at
  ON daedalus_board_rooms (updated_at DESC);
