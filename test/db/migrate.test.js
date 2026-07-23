import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPool, closePool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST || 'postgres://postgres:postgres@localhost:5433/kundali_test';

describe('runMigrations', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = TEST_DB_URL;
  });

  afterAll(async () => {
    await closePool();
  });

  it('creates the users table and records the applied migration', async () => {
    await runMigrations();
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'users'"
    );
    expect(rows).toHaveLength(1);
    const migrations = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
    expect(migrations.rows.map((r) => r.name)).toContain('001_users.sql');
  });

  it('is idempotent when run twice', async () => {
    await runMigrations();
    await runMigrations();
    const pool = getPool();
    const { rows } = await pool.query('SELECT COUNT(*) FROM schema_migrations');
    expect(Number(rows[0].count)).toBeGreaterThan(0);
  });

  it('creates the matches table', async () => {
    await runMigrations();
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'matches'"
    );
    expect(rows).toHaveLength(1);
    const migrations = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
    expect(migrations.rows.map((r) => r.name)).toContain('003_matches.sql');
  });
});
