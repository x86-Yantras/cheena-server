CREATE TABLE ai_readings (
  id BIGSERIAL PRIMARY KEY,
  kundali_id BIGINT NOT NULL REFERENCES kundalis(id) ON DELETE CASCADE,
  area TEXT NOT NULL DEFAULT 'overview' CHECK (area IN ('overview', 'career', 'marriage', 'health', 'wealth')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kundali_id, area)
);

CREATE TABLE ai_reading_usage (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);
