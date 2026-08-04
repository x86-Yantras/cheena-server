import express from 'express';
import cors from 'cors';
import { requestIdMiddleware } from './middleware/requestId.js';
import { httpLoggerMiddleware } from './middleware/httpLogger.js';
import { errorHandlerMiddleware } from './middleware/errorHandler.js';
import { initSentry } from './logger.js';
import kundaliRouter from './routes/kundali.js';
import authRouter from './routes/auth.js';
import meKundalisRouter from './routes/meKundalis.js';
import meKundalisChatRouter from './routes/meKundalisChat.js';
import meMatchesRouter from './routes/meMatches.js';
import meProfileRouter from './routes/meProfile.js';
import geocodeRouter from './routes/geocode.js';

function createApp() {
  const app = express();
  
  initSentry(app);

  app.use(requestIdMiddleware);
  app.use(httpLoggerMiddleware);
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/kundali', kundaliRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/me/kundalis', meKundalisRouter);
  app.use('/api/me/kundalis', meKundalisChatRouter);
  app.use('/api/me/matches', meMatchesRouter);
  app.use('/api/me/profile', meProfileRouter);
  app.use('/api/geocode', geocodeRouter);

  app.use(errorHandlerMiddleware);

  return app;
}

export { createApp };
