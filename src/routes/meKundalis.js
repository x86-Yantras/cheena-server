import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { requireAuth } from '../auth/authMiddleware.js';
import { validateKundaliInput } from '../validators/kundaliInput.js';
import { calculateKundali } from '../kundaliCalculator.js';
import { generateReading, VALID_AREAS } from '../aiReadingService.js';
import logger from '../logger.js';

const router = Router();

const DAILY_READING_LIMIT = 150;

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, label, name, date, time, latitude, longitude, timezone, result, created_at FROM kundalis WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );
    logger.debug({ count: rows.length }, 'Fetched user saved kundalis');
    res.json(rows);
  } catch (err) {
    logger.error(err, 'Failed to fetch user kundalis');
    next(err);
  }
});

router.post('/', async (req, res, next) => {
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
    const createdKundali = rows[0];
    logger.info({ kundaliId: createdKundali.id, label: createdKundali.label, name: createdKundali.name }, 'Saved new user kundali');
    res.status(201).json(createdKundali);
  } catch (err) {
    logger.error(err, 'Failed to create user kundali');
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
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
    logger.error(err, 'Failed to get user kundali by ID');
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
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
    if (result != null) {
      await pool.query('DELETE FROM ai_readings WHERE kundali_id = $1', [req.params.id]);
      await pool.query('DELETE FROM ai_chat_messages WHERE kundali_id = $1', [req.params.id]);
      logger.info({ kundaliId: req.params.id }, 'Invalidated cached readings and chat history due to result recalculation');
    }
    logger.info({ kundaliId: req.params.id, label: label.trim() }, 'Updated user kundali');
    res.json(rows[0]);
  } catch (err) {
    logger.error(err, 'Failed to patch user kundali');
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
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
    logger.info({ kundaliId: req.params.id }, 'Deleted user kundali');
    res.status(204).send();
  } catch (err) {
    logger.error(err, 'Failed to delete user kundali');
    next(err);
  }
});

router.get('/:id/reading', async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(404).json({ error: 'kundali not found' });
    return;
  }
  const area = typeof req.query.area === 'string' ? req.query.area : 'overview';
  if (!VALID_AREAS.includes(area)) {
    res.status(400).json({ error: `area must be one of: ${VALID_AREAS.join(', ')}` });
    return;
  }
  const provider = typeof req.query.provider === 'string' && req.query.provider !== '' ? req.query.provider : undefined;
  const model = typeof req.query.model === 'string' && req.query.model !== '' ? req.query.model : undefined;
  const isOverride = provider !== undefined || model !== undefined;

  try {
    const pool = getPool();
    const { rows: kundaliRows } = await pool.query(
      'SELECT result, latitude, longitude, timezone FROM kundalis WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (kundaliRows.length === 0) {
      res.status(404).json({ error: 'kundali not found' });
      return;
    }

    if (!isOverride) {
      const { rows: cachedRows } = await pool.query(
        "SELECT content FROM ai_readings WHERE kundali_id = $1 AND area = $2 AND created_at > now() - interval '7 days'",
        [req.params.id, area]
      );
      if (cachedRows.length > 0) {
        logger.info({ kundaliId: req.params.id, area, cached: true }, 'Returned cached AI reading');
        res.json({ area, content: cachedRows[0].content, cached: true });
        return;
      }

      const { rows: usageRows } = await pool.query(
        `INSERT INTO ai_reading_usage (user_id, usage_date, count) VALUES ($1, CURRENT_DATE, 1)
         ON CONFLICT (user_id, usage_date) DO UPDATE SET count = ai_reading_usage.count + 1
         RETURNING count`,
        [req.userId]
      );
      if (usageRows[0].count > DAILY_READING_LIMIT) {
        logger.warn({ userId: req.userId, count: usageRows[0].count }, 'Daily AI reading rate limit exceeded');
        res.status(429).json({ error: 'daily AI reading limit reached, try again tomorrow' });
        return;
      }
    }

    let content;
    try {
      logger.info({ kundaliId: req.params.id, area, provider, model }, 'Generating new AI reading');
      content = await generateReading({
        result: kundaliRows[0].result,
        area,
        provider,
        model,
        latitude: kundaliRows[0].latitude,
        longitude: kundaliRows[0].longitude,
        timezone: kundaliRows[0].timezone,
      });
    } catch (err) {
      logger.error(err, 'AI reading generation failed');
      if (!isOverride) {
        await pool.query(
          'UPDATE ai_reading_usage SET count = count - 1 WHERE user_id = $1 AND usage_date = CURRENT_DATE',
          [req.userId]
        );
      }
      const status = err.message.startsWith('Unknown provider:') ? 400 : 502;
      res.status(status).json({ error: status === 400 ? err.message : 'reading unavailable, try again' });
      return;
    }

    if (isOverride) {
      logger.info({ kundaliId: req.params.id, area, provider, model }, 'Generated AI reading with provider override');
      res.json({ area, content, cached: false });
      return;
    }

    try {
      await pool.query(
        `INSERT INTO ai_readings (kundali_id, area, content) VALUES ($1, $2, $3)
         ON CONFLICT (kundali_id, area, lang) DO UPDATE SET content = EXCLUDED.content, created_at = now()`,
        [req.params.id, area, content]
      );
      logger.info({ kundaliId: req.params.id, area }, 'Saved newly generated AI reading to cache');
    } catch (err) {
      if (err.code === '23505') {
        const { rows } = await pool.query(
          'SELECT content FROM ai_readings WHERE kundali_id = $1 AND area = $2',
          [req.params.id, area]
        );
        logger.info({ kundaliId: req.params.id, area }, 'Concurrent insertion race resolved, returned cached AI reading');
        res.json({ area, content: rows[0].content, cached: true });
        return;
      }
      throw err;
    }

    res.json({ area, content, cached: false });
  } catch (err) {
    logger.error(err, 'Failed to process kundali reading request');
    next(err);
  }
});

export default router;
