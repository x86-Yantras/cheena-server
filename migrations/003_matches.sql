CREATE TABLE matches (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  groom_label TEXT NOT NULL,
  bride_label TEXT NOT NULL,
  groom_input JSONB NOT NULL,
  bride_input JSONB NOT NULL,
  groom_kundali_id BIGINT REFERENCES kundalis(id) ON DELETE SET NULL,
  bride_kundali_id BIGINT REFERENCES kundalis(id) ON DELETE SET NULL,
  report JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
