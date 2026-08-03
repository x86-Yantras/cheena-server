import logger from '../logger.js';

// Express global error handler middleware
// eslint-disable-next-line no-unused-vars
export function errorHandlerMiddleware(err, req, res, next) {
  const statusCode = err.status || err.statusCode || 500;
  
  logger.error(err, err.message || 'Unhandled server error');

  if (res.headersSent) {
    return next(err);
  }

  const responseMessage = statusCode >= 500 ? 'internal server error' : (err.message || 'An error occurred');

  res.status(statusCode).json({
    error: responseMessage,
    requestId: req.requestId || req.id,
  });
}
