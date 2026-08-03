import logger from '../logger.js';

export function httpLoggerMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    const roundedMs = Math.round(durationMs * 100) / 100;
    const statusCode = res.statusCode;

    const logData = {
      type: 'http_request',
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode,
      responseTimeMs: roundedMs,
      contentLength: res.getHeader('content-length'),
      userAgent: req.get('user-agent'),
      ip: req.ip || req.socket?.remoteAddress,
    };

    const message = `${req.method} ${req.originalUrl || req.url} ${statusCode} - ${roundedMs}ms`;

    if (statusCode >= 500) {
      logger.error(logData, message);
    } else if (statusCode >= 400) {
      logger.warn(logData, message);
    } else {
      logger.info(logData, message);
    }
  });

  next();
}
