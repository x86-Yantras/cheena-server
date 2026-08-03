import { Router } from 'express';
import { calculateKundali } from '../kundaliCalculator.js';
import { validateKundaliInput } from '../validators/kundaliInput.js';
import logger from '../logger.js';

const router = Router();

router.post('/', async (req, res, next) => {
  const errors = validateKundaliInput(req.body);
  if (errors.length > 0) {
    logger.warn({ validationErrors: errors }, 'Kundali calculation validation failed');
    res.status(400).json({ error: errors.join('; ') });
    return;
  }
  try {
    logger.debug({ input: req.body }, 'Calculating kundali chart');
    const result = await calculateKundali(req.body);
    logger.info({ ascendant: result.ascendant?.rashiName, planetsCount: result.planets?.length }, 'Kundali chart calculated successfully');
    res.json(result);
  } catch (err) {
    logger.error(err, 'Failed to calculate kundali');
    next(err);
  }
});

export default router;
