import express from 'express';
import cors from 'cors';

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  return app;
}

export { createApp };
