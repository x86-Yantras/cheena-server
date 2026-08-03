import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp } from '../src/app.js';
import { logger, initSentry, isSentryInitialized } from '../src/logger.js';
import { getRequestContext, setUserIdInContext } from '../src/utils/requestContext.js';
import { requestIdMiddleware } from '../src/middleware/requestId.js';
import { httpLoggerMiddleware } from '../src/middleware/httpLogger.js';
import { errorHandlerMiddleware } from '../src/middleware/errorHandler.js';

describe('Logging & Correlation ID System', () => {
  it('attaches X-Request-ID and X-Correlation-ID headers to responses', async () => {
    const app = createApp();
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.headers['x-correlation-id']).toBeDefined();
    expect(response.headers['x-request-id']).toEqual(response.headers['x-correlation-id']);
  });

  it('preserves existing X-Request-ID and X-Correlation-ID headers from incoming requests', async () => {
    const app = createApp();
    const customReqId = 'custom-request-123';
    const customCorrId = 'custom-correlation-456';

    const response = await request(app)
      .get('/api/health')
      .set('X-Request-ID', customReqId)
      .set('X-Correlation-ID', customCorrId);

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe(customReqId);
    expect(response.headers['x-correlation-id']).toBe(customCorrId);
  });

  it('makes request context available inside route handlers via getRequestContext', async () => {
    const app = express();
    app.use(requestIdMiddleware);

    let capturedContext = null;
    app.get('/test-ctx', (req, res) => {
      setUserIdInContext(42);
      capturedContext = getRequestContext();
      res.json({ ok: true });
    });

    await request(app).get('/test-ctx').set('X-Request-ID', 'test-req-id-789');

    expect(capturedContext).not.toBeNull();
    expect(capturedContext.requestId).toBe('test-req-id-789');
    expect(capturedContext.correlationId).toBe('test-req-id-789');
    expect(capturedContext.userId).toBe(42);
    expect(capturedContext.path).toBe('/test-ctx');
    expect(capturedContext.method).toBe('GET');
  });

  it('supports trace, debug, info, warn, error, and fatal log levels', () => {
    expect(() => logger.trace('Test trace log')).not.toThrow();
    expect(() => logger.debug({ detail: 'test' }, 'Test debug log')).not.toThrow();
    expect(() => logger.info({ userId: 123 }, 'Test info log')).not.toThrow();
    expect(() => logger.warn({ issue: 'test' }, 'Test warn log')).not.toThrow();
    expect(() => logger.error(new Error('Test error'), 'Test error log')).not.toThrow();
    expect(() => logger.fatal(new Error('Critical failure'), 'Test fatal log')).not.toThrow();
  });

  it('handles global express errors in errorHandlerMiddleware', async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(httpLoggerMiddleware);

    app.get('/boom', () => {
      throw new Error('Something exploded');
    });

    app.use(errorHandlerMiddleware);

    const response = await request(app).get('/boom').set('X-Request-ID', 'boom-req-1');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'internal server error',
      requestId: 'boom-req-1',
    });
  });

  it('can initialize Sentry when SENTRY_DSN is provided', () => {
    process.env.SENTRY_DSN = 'https://abc@example.ingest.sentry.io/123456';
    initSentry();
    expect(isSentryInitialized()).toBe(true);
  });
});
