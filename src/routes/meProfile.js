import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { requireAuth } from '../auth/authMiddleware.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import logger from '../logger.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query('SELECT id, email, name FROM users WHERE id = $1', [req.userId]);
    const user = rows[0];
    res.json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    logger.error(err, 'Failed to fetch profile due to database error');
    next(err);
  }
});

router.patch('/', async (req, res, next) => {
  const { name } = req.body;
  if (typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }
  if (name.trim().length > 100) {
    res.status(400).json({ error: 'name must be at most 100 characters' });
    return;
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, email, name',
      [name.trim(), req.userId]
    );
    const user = rows[0];
    res.json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    logger.error(err, 'Failed to update profile due to database error');
    next(err);
  }
});

router.patch('/password', async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    res.status(400).json({ error: 'newPassword must be at least 8 characters' });
    return;
  }
  if (typeof currentPassword !== 'string') {
    res.status(400).json({ error: 'currentPassword is required' });
    return;
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    const user = rows[0];
    if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
      logger.warn({ userId: req.userId }, 'Password change failed: current password incorrect');
      res.status(401).json({ error: 'current password is incorrect' });
      return;
    }
    const passwordHash = await hashPassword(newPassword);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.userId]);
    logger.info({ userId: req.userId }, 'Password changed successfully');
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, 'Failed to change password due to database error');
    next(err);
  }
});

export default router;
