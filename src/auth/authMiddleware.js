import { verifyToken } from './jwt.js';
import { setUserIdInContext } from '../utils/requestContext.js';

function requireAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    res.status(401).json({ error: 'missing or malformed Authorization header' });
    return;
  }
  try {
    const decoded = verifyToken(match[1]);
    req.userId = decoded.userId;
    setUserIdInContext(decoded.userId);
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}

export { requireAuth };

