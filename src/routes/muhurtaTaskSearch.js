import { Router } from 'express';
import { computeTaskMuhurta } from '../taskMuhurtaCalculator.js';
import { computeGeneralMuhurta } from '../generalMuhurtaCalculator.js';
import { validateTaskMuhurtaInput } from '../validators/taskMuhurtaInput.js';
import logger from '../logger.js';

const router = Router();

router.get('/', async (req, res, next) => {
  const errors = validateTaskMuhurtaInput(req.query);
  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }
  try {
    const { task, from, to } = req.query;
    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);
    const timezone = req.query.timezone;
    const result = task === 'general'
      ? await computeGeneralMuhurta(from, to, latitude, longitude, timezone)
      : await computeTaskMuhurta(task, from, to, latitude, longitude, timezone);
    res.json(result);
  } catch (err) {
    logger.error(err, 'Failed to compute task muhurta');
    next(err);
  }
});

export default router;
