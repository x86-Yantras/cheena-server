import { Router } from 'express';
import { calculateKundali } from '../kundaliCalculator.js';
import { validateKundaliInput } from '../validators/kundaliInput.js';

const router = Router();

router.post('/', async (req, res) => {
  const errors = validateKundaliInput(req.body);
  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }
  try {
    const result = await calculateKundali(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
