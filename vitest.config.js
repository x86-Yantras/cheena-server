import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Route test files share one real Postgres instance and TRUNCATE ...
    // CASCADE common tables (users -> kundalis) in afterEach hooks. Running
    // test files in parallel workers causes cross-file truncation races
    // (one file's TRUNCATE wiping rows another file's test just inserted).
    // Force serial file execution to keep the shared-DB suite deterministic.
    fileParallelism: false,
  },
});
