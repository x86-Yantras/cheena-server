CREATE TABLE ai_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  kundali_id BIGINT NOT NULL REFERENCES kundalis(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  lang TEXT NOT NULL DEFAULT 'en',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_chat_messages_kundali_id_created_at_idx ON ai_chat_messages (kundali_id, created_at, id);
