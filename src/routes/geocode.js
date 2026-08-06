import { Router } from 'express';
import { reverseGeocode, searchPlaces } from '../geocodeService.js';

const router = Router();

router.get('/reverse', async (req, res) => {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);

  if (req.query.latitude === undefined || Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
    res.status(400).json({ error: 'latitude must be a number between -90 and 90' });
    return;
  }
  if (req.query.longitude === undefined || Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
    res.status(400).json({ error: 'longitude must be a number between -180 and 180' });
    return;
  }

  const placeName = await reverseGeocode(latitude, longitude);
  res.json({ placeName });
});

router.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== 'string' || query.trim().length < 3) {
    res.status(400).json({ error: 'q must be a string of at least 3 characters' });
    return;
  }

  const results = await searchPlaces(query.trim());
  res.json({ results });
});

export default router;
