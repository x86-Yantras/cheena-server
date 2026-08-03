import { randomUUID } from 'node:crypto';
import { requestContextStore } from '../utils/requestContext.js';

export function requestIdMiddleware(req, res, next) {
  const incomingRequestId = req.headers['x-request-id'] || req.headers['request-id'];
  const incomingCorrelationId = req.headers['x-correlation-id'] || req.headers['correlation-id'];

  const requestId = typeof incomingRequestId === 'string' && incomingRequestId.trim() !== ''
    ? incomingRequestId.trim()
    : randomUUID();

  const correlationId = typeof incomingCorrelationId === 'string' && incomingCorrelationId.trim() !== ''
    ? incomingCorrelationId.trim()
    : (incomingRequestId ? incomingRequestId.trim() : requestId);

  req.id = requestId;
  req.requestId = requestId;
  req.correlationId = correlationId;

  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Correlation-ID', correlationId);

  const context = {
    requestId,
    correlationId,
    userId: req.userId || null,
    path: req.path,
    method: req.method,
    ip: req.ip || req.socket?.remoteAddress,
  };

  requestContextStore.run(context, () => {
    next();
  });
}
