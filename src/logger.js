import pino from 'pino';
import * as Sentry from '@sentry/node';
import { getRequestContext } from './utils/requestContext.js';

let sentryInitialized = false;

export function initSentry(app) {
  const dsn = process.env.SENTRY_DSN;
  if (dsn) {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      serverName: process.env.SERVICE_NAME || 'kundali-backend',
      tracesSampleRate: 1.0,
    });
    sentryInitialized = true;
    logger.info('Sentry initialized successfully');
  }
}

export function isSentryInitialized() {
  return sentryInitialized;
}

const level = process.env.LOG_LEVEL || 'info';

const pinoInstance = pino({
  level,
  base: {
    service: process.env.SERVICE_NAME || 'kundali-backend',
    env: process.env.NODE_ENV || 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const ctx = getRequestContext();
    const contextFields = {};
    if (ctx.requestId) contextFields.requestId = ctx.requestId;
    if (ctx.correlationId) contextFields.correlationId = ctx.correlationId;
    if (ctx.userId) contextFields.userId = ctx.userId;
    if (ctx.path) contextFields.path = ctx.path;
    if (ctx.method) contextFields.method = ctx.method;
    return contextFields;
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});

function wrapLogMethod(methodName) {
  return (arg1, arg2, ...rest) => {
    if (arg1 instanceof Error) {
      const errObj = { err: arg1 };
      if (typeof arg2 === 'string') {
        pinoInstance[methodName](errObj, arg2, ...rest);
      } else if (typeof arg2 === 'object' && arg2 !== null) {
        pinoInstance[methodName]({ ...errObj, ...arg2 }, arg1.message, ...rest);
      } else {
        pinoInstance[methodName](errObj, arg1.message);
      }
    } else {
      pinoInstance[methodName](arg1, arg2, ...rest);
    }
  };
}

export const logger = {
  trace: wrapLogMethod('trace'),
  debug: wrapLogMethod('debug'),
  info: wrapLogMethod('info'),
  warn: wrapLogMethod('warn'),
  error: (arg1, arg2, ...rest) => {
    wrapLogMethod('error')(arg1, arg2, ...rest);
    if (sentryInitialized) {
      captureExceptionInSentry(arg1, arg2);
    }
  },
  fatal: (arg1, arg2, ...rest) => {
    wrapLogMethod('fatal')(arg1, arg2, ...rest);
    if (sentryInitialized) {
      captureExceptionInSentry(arg1, arg2);
    }
  },
  child: (...args) => pinoInstance.child(...args),
};

function captureExceptionInSentry(arg1, arg2) {
  try {
    const ctx = getRequestContext();
    Sentry.withScope((scope) => {
      if (ctx.requestId) scope.setTag('requestId', ctx.requestId);
      if (ctx.correlationId) scope.setTag('correlationId', ctx.correlationId);
      if (ctx.userId) scope.setUser({ id: String(ctx.userId) });
      if (ctx.path) scope.setExtra('path', ctx.path);
      if (ctx.method) scope.setExtra('method', ctx.method);

      if (arg1 instanceof Error) {
        if (typeof arg2 === 'string') {
          scope.setExtra('logMessage', arg2);
        }
        Sentry.captureException(arg1);
      } else if (typeof arg1 === 'string') {
        Sentry.captureMessage(arg1);
      } else if (typeof arg1 === 'object' && arg1 !== null) {
        if (arg1.err instanceof Error) {
          Sentry.captureException(arg1.err);
        } else {
          Sentry.captureMessage(arg2 || JSON.stringify(arg1));
        }
      }
    });
  } catch (sentryErr) {
    pinoInstance.error({ err: sentryErr }, 'Failed to send event to Sentry');
  }
}

export default logger;
