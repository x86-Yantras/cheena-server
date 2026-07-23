import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { requireAuth } from '../auth/authMiddleware.js';
import { validateKundaliInput } from '../validators/kundaliInput.js';
import { calculateKundali } from '../kundaliCalculator.js';
import { computeMatch } from '../matchCalculator.js';

const router = Router();

router.use(requireAuth);

async function resolveSide(pool, userId, side) {
  if (side && typeof side.kundaliId !== 'undefined') {
    const { rows } = await pool.query(
      'SELECT date, time, latitude, longitude, timezone, result FROM kundalis WHERE id = $1 AND user_id = $2',
      [side.kundaliId, userId],
    );
    if (rows.length === 0) return { error: 'kundali not found', status: 404 };
    const row = rows[0];
    return {
      result: row.result,
      input: { date: row.date, time: row.time, latitude: row.latitude, longitude: row.longitude, timezone: row.timezone },
    };
  }
  const errors = validateKundaliInput(side || {});
  if (errors.length > 0) return { error: errors.join('; '), status: 400 };
  const { date, time, latitude, longitude, timezone } = side;
  const result = await calculateKundali({ date, time, latitude, longitude, timezone });
  return { result, input: { date, time, latitude, longitude, timezone: timezone ?? null } };
}

const LIST_COLUMNS = `
  id, groom_label AS "groomLabel", bride_label AS "brideLabel", report, created_at AS "createdAt"
`;
const FULL_COLUMNS = `
  id, groom_label AS "groomLabel", bride_label AS "brideLabel",
  groom_input AS "groomInput", bride_input AS "brideInput",
  groom_kundali_id AS "groomKundaliId", bride_kundali_id AS "brideKundaliId",
  report, created_at AS "createdAt"
`;

router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT ${LIST_COLUMNS} FROM matches WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.userId],
    );
    res.json(rows.map((row) => ({
      id: row.id,
      groomLabel: row.groomLabel,
      brideLabel: row.brideLabel,
      totalPoints: row.report.ashtakoot.totalPoints,
      verdictBand: row.report.verdict.band,
      createdAt: row.createdAt,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});

router.post('/', async (req, res) => {
  const { groomLabel, brideLabel, groom, bride } = req.body;
  if (typeof groomLabel !== 'string' || groomLabel.trim() === '') {
    res.status(400).json({ error: 'groomLabel must be a non-empty string' });
    return;
  }
  if (typeof brideLabel !== 'string' || brideLabel.trim() === '') {
    res.status(400).json({ error: 'brideLabel must be a non-empty string' });
    return;
  }
  try {
    const pool = getPool();
    const groomSide = await resolveSide(pool, req.userId, groom);
    if (groomSide.error) {
      res.status(groomSide.status).json({ error: groomSide.error });
      return;
    }
    const brideSide = await resolveSide(pool, req.userId, bride);
    if (brideSide.error) {
      res.status(brideSide.status).json({ error: brideSide.error });
      return;
    }
    const report = computeMatch(groomSide.result, brideSide.result);
    const { rows } = await pool.query(
      `INSERT INTO matches
         (user_id, groom_label, bride_label, groom_input, bride_input, groom_kundali_id, bride_kundali_id, report)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${FULL_COLUMNS}`,
      [
        req.userId, groomLabel.trim(), brideLabel.trim(),
        groomSide.input, brideSide.input,
        groom.kundaliId ?? null, bride.kundaliId ?? null,
        report,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(404).json({ error: 'match not found' });
    return;
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT ${FULL_COLUMNS} FROM matches WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'match not found' });
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
    res.status(404).json({ error: 'match not found' });
    return;
  }
  try {
    const pool = getPool();
    const { rowCount } = await pool.query(
      'DELETE FROM matches WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId],
    );
    if (rowCount === 0) {
      res.status(404).json({ error: 'match not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});

export default router;
