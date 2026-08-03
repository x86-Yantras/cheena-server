import 'dotenv/config';
import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import logger from './logger.js';

const PORT = process.env.PORT || 4000;

process.on('uncaughtException', (err) => {
  logger.fatal(err, 'Fatal: Uncaught exception in process');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  if (reason instanceof Error) {
    logger.fatal(reason, 'Fatal: Unhandled promise rejection in process');
  } else {
    logger.fatal({ reason }, 'Fatal: Unhandled promise rejection in process');
  }
  process.exit(1);
});

async function main() {
  logger.info({ port: PORT }, 'Initializing Kundali backend service...');
  await runMigrations();
  createApp().listen(PORT, () => {
    logger.info({ port: PORT }, `Kundali backend successfully running on port ${PORT}`);
  });
}

main().catch((err) => {
  logger.fatal(err, 'Fatal: Failed to start server');
  process.exit(1);
});
