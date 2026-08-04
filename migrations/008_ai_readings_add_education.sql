ALTER TABLE ai_readings DROP CONSTRAINT ai_readings_area_check;
ALTER TABLE ai_readings ADD CONSTRAINT ai_readings_area_check CHECK (area IN ('overview', 'career', 'marriage', 'health', 'wealth', 'education'));
