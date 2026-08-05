import { Router } from 'express';
import { computeTaskMuhurta } from '../taskMuhurtaCalculator.js';
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
    const result = await computeTaskMuhurta(
      req.query.task,
      req.query.from,
      req.query.to,
      Number(req.query.latitude),
      Number(req.query.longitude),
      req.query.timezone,
    );
    res.json(result);
  } catch (err) {
    logger.error(err, 'Failed to compute task muhurta');
    next(err);
  }
});

export default router;
