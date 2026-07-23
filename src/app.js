import express from 'express';
import cors from 'cors';
import kundaliRouter from './routes/kundali.js';
import authRouter from './routes/auth.js';
import meKundalisRouter from './routes/meKundalis.js';

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/kundali', kundaliRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/me/kundalis', meKundalisRouter);
  return app;
}

export { createApp };
