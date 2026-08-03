import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signToken } from '../auth/jwt.js';
import logger from '../logger.js';

const router = Router();

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : email;
}

function validateCredentials(body) {
  const errors = [];
  if (typeof body.email !== 'string' || !/^\S+@\S+\.\S+$/.test(body.email)) {
    errors.push('email must be a valid email address');
  }
  if (typeof body.password !== 'string' || body.password.length < 8) {
    errors.push('password must be at least 8 characters');
  }
  return errors;
}

router.post('/register', async (req, res, next) => {
  const errors = validateCredentials(req.body);
  if (errors.length > 0) {
    logger.warn({ validationErrors: errors }, 'User registration validation failed');
    res.status(400).json({ error: errors.join('; ') });
    return;
  }
  const email = normalizeEmail(req.body.email);
  try {
    const pool = getPool();
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      logger.warn({ email }, 'Registration failed: email already registered');
      res.status(409).json({ error: 'email is already registered' });
      return;
    }
    const passwordHash = await hashPassword(req.body.password);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
    );
    const user = rows[0];
    const token = signToken({ userId: user.id });
    logger.info({ userId: user.id, email: user.email }, 'User account created successfully');
    res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    if (err.code === '23505') {
      logger.warn({ email }, 'Registration failed: email concurrent conflict');
      res.status(409).json({ error: 'email is already registered' });
      return;
    }
    logger.error(err, 'Failed to register user due to database error');
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  const email = normalizeEmail(req.body.email);
  const password = req.body.password;
  if (typeof email !== 'string' || typeof password !== 'string') {
    logger.warn('Login attempt missing email or password');
    res.status(400).json({ error: 'email and password are required' });
    return;
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      logger.warn({ email }, 'Login failed: invalid email or password');
      res.status(401).json({ error: 'invalid email or password' });
      return;
    }
    const token = signToken({ userId: user.id });
    logger.info({ userId: user.id, email: user.email }, 'User logged in successfully');
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    logger.error(err, 'Failed to log in user due to database error');
    next(err);
  }
});

export default router;
