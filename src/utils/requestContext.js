import { AsyncLocalStorage } from 'node:async_hooks';

const requestContextStore = new AsyncLocalStorage();

/**
 * Get current request context from AsyncLocalStorage.
 * Returns an object with requestId, correlationId, userId, path, method, etc.
 */
export function getRequestContext() {
  return requestContextStore.getStore() || {};
}

/**
 * Helper to update userId in current request context.
 */
export function setUserIdInContext(userId) {
  const currentStore = requestContextStore.getStore();
  if (currentStore) {
    currentStore.userId = userId;
  }
}

export { requestContextStore };
