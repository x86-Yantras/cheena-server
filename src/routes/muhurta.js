import { Router } from 'express';
import { computeDailyPeriods } from '../muhurtaCalculator.js';
import { validateMuhurtaInput } from '../validators/muhurtaInput.js';
import logger from '../logger.js';

const router = Router();

router.get('/', async (req, res, next) => {
  const errors = validateMuhurtaInput(req.query);
  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }
  try {
    const result = await computeDailyPeriods(
      req.query.date,
      Number(req.query.latitude),
      Number(req.query.longitude),
      req.query.timezone,
    );
    res.json(result);
  } catch (err) {
    logger.error(err, 'Failed to compute muhurta');
    next(err);
  }
});

export default router;
