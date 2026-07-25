import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { requireAuth } from '../auth/authMiddleware.js';
import { validateKundaliInput } from '../validators/kundaliInput.js';
import { calculateKundali } from '../kundaliCalculator.js';
import { generateReading, VALID_AREAS } from '../aiReadingService.js';

const router = Router();

const DAILY_READING_LIMIT = 10;

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, label, name, date, time, latitude, longitude, timezone, result, created_at FROM kundalis WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});

router.post('/', async (req, res) => {
  const { label, name } = req.body;
  if (typeof label !== 'string' || label.trim() === '') {
    res.status(400).json({ error: 'label must be a non-empty string' });
    return;
  }
  if (typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }
  const errors = validateKundaliInput(req.body);
  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }
  try {
    const { date, time, latitude, longitude, timezone } = req.body;
    const result = await calculateKundali({ date, time, latitude, longitude, timezone });
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO kundalis (user_id, label, name, date, time, latitude, longitude, timezone, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, label, name, date, time, latitude, longitude, timezone, result, created_at`,
      [req.userId, label.trim(), name.trim(), date, time, latitude, longitude, timezone ?? null, result]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(404).json({ error: 'kundali not found' });
    return;
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, label, name, date, time, latitude, longitude, timezone, result, created_at FROM kundalis WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'kundali not found' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});

router.patch('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(404).json({ error: 'kundali not found' });
    return;
  }
  const { label, name, result } = req.body;
  if (typeof label !== 'string' || label.trim() === '') {
    res.status(400).json({ error: 'label must be a non-empty string' });
    return;
  }
  if (typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE kundalis SET label = $1, name = $2, result = COALESCE($3, result)
       WHERE id = $4 AND user_id = $5
       RETURNING id, label, name, date, time, latitude, longitude, timezone, result, created_at`,
      [label.trim(), name.trim(), result ?? null, req.params.id, req.userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'kundali not found' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(404).json({ error: 'kundali not found' });
    return;
  }
  try {
    const pool = getPool();
    const { rowCount } = await pool.query(
      'DELETE FROM kundalis WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (rowCount === 0) {
      res.status(404).json({ error: 'kundali not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});

router.get('/:id/reading', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(404).json({ error: 'kundali not found' });
    return;
  }
  const area = typeof req.query.area === 'string' ? req.query.area : 'overview';
  if (!VALID_AREAS.includes(area)) {
    res.status(400).json({ error: `area must be one of: ${VALID_AREAS.join(', ')}` });
    return;
  }
  try {
    const pool = getPool();
    const { rows: kundaliRows } = await pool.query(
      'SELECT result FROM kundalis WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (kundaliRows.length === 0) {
      res.status(404).json({ error: 'kundali not found' });
      return;
    }

    const { rows: cachedRows } = await pool.query(
      'SELECT content FROM ai_readings WHERE kundali_id = $1 AND area = $2',
      [req.params.id, area]
    );
    if (cachedRows.length > 0) {
      res.json({ area, content: cachedRows[0].content, cached: true });
      return;
    }

    const { rows: usageRows } = await pool.query(
      'SELECT count FROM ai_reading_usage WHERE user_id = $1 AND usage_date = CURRENT_DATE',
      [req.userId]
    );
    const usedToday = usageRows[0]?.count ?? 0;
    if (usedToday >= DAILY_READING_LIMIT) {
      res.status(429).json({ error: 'daily AI reading limit reached, try again tomorrow' });
      return;
    }

    let content;
    try {
      content = await generateReading({ result: kundaliRows[0].result, area });
    } catch (err) {
      console.error(err);
      res.status(502).json({ error: 'reading unavailable, try again' });
      return;
    }

    await pool.query(
      'INSERT INTO ai_readings (kundali_id, area, content) VALUES ($1, $2, $3)',
      [req.params.id, area, content]
    );
    await pool.query(
      `INSERT INTO ai_reading_usage (user_id, usage_date, count) VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (user_id, usage_date) DO UPDATE SET count = ai_reading_usage.count + 1`,
      [req.userId]
    );

    res.json({ area, content, cached: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});

export default router;
