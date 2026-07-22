import { Router } from 'express';
import { IANAZone } from 'luxon';
import { calculateKundali } from '../kundaliCalculator.js';

const router = Router();

function validateBody(body) {
  const errors = [];
  const { date, time, latitude, longitude, timezone } = body;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.push('date must be in YYYY-MM-DD format');
  }
  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    errors.push('time must be in HH:MM 24-hour format');
  }
  if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
    errors.push('latitude must be a number between -90 and 90');
  }
  if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
    errors.push('longitude must be a number between -180 and 180');
  }
  if (timezone !== undefined && timezone !== null && timezone !== '') {
    if (typeof timezone !== 'string' || !IANAZone.isValidZone(timezone)) {
      errors.push('timezone must be a valid IANA timezone name (e.g. Asia/Kolkata)');
    }
  }
  return errors;
}

router.post('/', async (req, res) => {
  const errors = validateBody(req.body);
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
