import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { requireAuth } from '../auth/authMiddleware.js';
import { generateChatReply, VALID_AREAS } from '../aiReadingService.js';
import logger from '../logger.js';

const router = Router();

const DAILY_CHAT_LIMIT = 150;
const MAX_MESSAGE_LENGTH = 1000;

router.use(requireAuth);

router.get('/:id/chat', async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(404).json({ error: 'kundali not found' });
    return;
  }
  try {
    const pool = getPool();
    const { rows: kundaliRows } = await pool.query(
      'SELECT id FROM kundalis WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (kundaliRows.length === 0) {
      res.status(404).json({ error: 'kundali not found' });
      return;
    }
    const { rows } = await pool.query(
      'SELECT id, role, content, created_at FROM ai_chat_messages WHERE kundali_id = $1 ORDER BY created_at, id',
      [req.params.id]
    );
    logger.debug({ kundaliId: req.params.id, messageCount: rows.length }, 'Fetched chat history');
    res.json(rows);
  } catch (err) {
    logger.error(err, 'Failed to fetch chat history');
    next(err);
  }
});

router.post('/:id/chat', async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(404).json({ error: 'kundali not found' });
    return;
  }
  const { area, message, provider, model } = req.body;
  if (area == null && message == null) {
    res.status(400).json({ error: 'either area or message is required' });
    return;
  }
  if (area != null && !VALID_AREAS.includes(area)) {
    res.status(400).json({ error: `area must be one of: ${VALID_AREAS.join(', ')}` });
    return;
  }
  if (message != null) {
    if (typeof message !== 'string' || message.trim() === '' || message.length > MAX_MESSAGE_LENGTH) {
      res.status(400).json({ error: `message must be a non-empty string up to ${MAX_MESSAGE_LENGTH} characters` });
      return;
    }
  }
  const lang = typeof req.body.lang === 'string' && req.body.lang.trim() !== '' ? req.body.lang : 'en';

  try {
    const pool = getPool();
    const { rows: kundaliRows } = await pool.query(
      'SELECT result FROM kundalis WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (kundaliRows.length === 0) {
      res.status(404).json({ error: 'kundali not found' });
      return;
    }

    const { rows: usageRows } = await pool.query(
      `INSERT INTO ai_reading_usage (user_id, usage_date, count) VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (user_id, usage_date) DO UPDATE SET count = ai_reading_usage.count + 1
       RETURNING count`,
      [req.userId]
    );
    if (usageRows[0].count > DAILY_CHAT_LIMIT) {
      logger.warn({ userId: req.userId, count: usageRows[0].count }, 'Daily AI chat limit exceeded');
      res.status(429).json({ error: 'daily AI chat limit reached, try again tomorrow' });
      return;
    }

    const { rows: historyRows } = await pool.query(
      'SELECT role, content FROM ai_chat_messages WHERE kundali_id = $1 ORDER BY created_at, id',
      [req.params.id]
    );

    let userMessage;
    let reply;
    try {
      logger.info({ kundaliId: req.params.id, area, provider, model, historyLength: historyRows.length }, 'Generating AI chat reply');
      ({ userMessage, reply } = await generateChatReply({
        result: kundaliRows[0].result,
        message,
        area,
        provider,
        model,
        history: historyRows,
      }));
    } catch (err) {
      logger.error(err, 'AI chat reply generation failed');
      await pool.query(
        'UPDATE ai_reading_usage SET count = count - 1 WHERE user_id = $1 AND usage_date = CURRENT_DATE',
        [req.userId]
      );
      const status = err.message.startsWith('Unknown provider:') ? 400 : 502;
      res.status(status).json({ error: status === 400 ? err.message : 'reading unavailable, try again' });
      return;
    }

    const { rows: insertedRows } = await pool.query(
      `INSERT INTO ai_chat_messages (kundali_id, role, lang, content)
       VALUES ($1, 'user', $3, $2), ($1, 'assistant', $3, $4)
       RETURNING id, role, content, created_at`,
      [req.params.id, userMessage, lang, reply]
    );

    const assistantRow = insertedRows.find((r) => r.role === 'assistant');
    logger.info({ kundaliId: req.params.id, assistantMessageId: assistantRow.id }, 'AI chat exchange saved successfully');
    res.status(201).json(assistantRow);
  } catch (err) {
    logger.error(err, 'Failed to process chat message request');
    next(err);
  }
});

export default router;
