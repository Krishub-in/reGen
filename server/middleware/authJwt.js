import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set in environment variables');
  return secret;
};

export const signToken = (user) => {
  return jwt.sign(
    { userId: user.userId, username: user.username, role: user.role, companyId: user.companyId || null, tokenVersion: Number(user.tokenVersion || 0) },
    getSecret(),
    { expiresIn: '7d' }
  );
};

export const verifyToken = async (req, res, next) => {
  // Public routes skip JWT verification
  const publicPaths = [
    '/api/auth/login',
    '/api/auth/reset-password',
    '/api/auth/reset-link',
    '/api/health',
    '/api/system/maintenance',
  ];
  if (publicPaths.some(p => req.path === p || req.path.startsWith(p + '/'))) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, getSecret());
    const dbUser = await User.findOne({ userId: decoded.userId }).select('userId tokenVersion lastActive status role').lean();
    if (!dbUser) {
      return res.status(401).json({ message: 'Invalid session. Please login again.' });
    }
    if (dbUser.role !== 'param' && dbUser.status === 'inactive') {
      return res.status(403).json({ message: 'Your account has been suspended by the Super Admin.', code: 'USER_SUSPENDED' });
    }
    const tokenVersion = Number(decoded.tokenVersion || 0);
    const currentTokenVersion = Number(dbUser.tokenVersion || 0);
    if (tokenVersion !== currentTokenVersion) {
      return res.status(401).json({ message: 'Session expired. Please login again.' });
    }
    const now = Date.now();
    if (!dbUser.lastActive || (now - new Date(dbUser.lastActive).getTime()) > 60000) {
      User.updateOne({ userId: decoded.userId }, { $set: { lastActive: new Date() } }).catch(() => {});
    }
    req.user = decoded; // { userId, username, role, companyId, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export default { signToken, verifyToken };
