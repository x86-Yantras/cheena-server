import 'dotenv/config';
import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';

const PORT = process.env.PORT || 4000;

async function main() {
  await runMigrations();
  createApp().listen(PORT, () => {
    console.log(`Kundali backend listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
