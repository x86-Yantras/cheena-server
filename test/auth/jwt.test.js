import { describe, it, expect, beforeAll } from 'vitest';
import { signToken, verifyToken } from '../../src/auth/jwt.js';

describe('jwt', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  it('signs and verifies a payload round-trip', () => {
    const token = signToken({ userId: 42 });
    const decoded = verifyToken(token);
    expect(decoded.userId).toBe(42);
  });

  it('throws when verifying a tampered token', () => {
    const token = signToken({ userId: 42 });
    expect(() => verifyToken(`${token}x`)).toThrow();
  });
});
