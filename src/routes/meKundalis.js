import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { requireAuth } from '../auth/authMiddleware.js';
import { validateKundaliInput } from '../validators/kundaliInput.js';
import { calculateKundali } from '../kundaliCalculator.js';

const router = Router();

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

export default router;
