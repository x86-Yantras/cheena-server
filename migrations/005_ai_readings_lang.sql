ALTER TABLE ai_readings
  ADD COLUMN lang TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en', 'ne'));

ALTER TABLE ai_readings
  DROP CONSTRAINT ai_readings_kundali_id_area_key;

ALTER TABLE ai_readings
  ADD CONSTRAINT ai_readings_kundali_id_area_lang_key UNIQUE (kundali_id, area, lang);
