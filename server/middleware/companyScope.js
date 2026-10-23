import User from '../models/User.js';

/**
 * Middleware that resolves the current user's companyId from the DB
 * and attaches it to req.companyId.
 *
 * - All users (including SuperAdmin/param) are scoped to their own companyId.
 * - If a user has no companyId and is an owner, it tries to resolve from Company collection.
 *
 * This must be placed AFTER verifyToken so req.user exists.
 */
export const companyScope = async (req, res, next) => {
  try {
    // Public paths don't need scoping
    const skipPaths = [
      '/api/auth/',
      '/api/health',
      '/api/system/',
      '/api/deploy/',
    ];
    if (skipPaths.some(p => req.path.startsWith(p))) return next();

    const decoded = req.user;
    if (!decoded || !decoded.userId) return next(); // no user context (handled by verifyToken)

    // 1. Super Admin (param) role handling
    if (decoded.role === 'param') {
      const isSuperAdminPortal = req.headers['x-portal-view'] === 'superadmin' || 
        (!req.headers['x-portal-view'] && req.headers.referer?.includes('/superadmin'));
      if (isSuperAdminPortal) {
        req.companyId = null;
        return next();
      }
      // Super Admin operating inside EMS company view: scope to Super Admin's owned company
      const { default: Company } = await import('../models/Company.js');
      const saCompany = await Company.findOne({
        $or: [{ ownerId: decoded.userId }, { name: 'krish Tech Computer' }]
      }).lean();
      if (saCompany) {
        req.companyId = saCompany._id;
      }
      return next();
    }

    // 2. Company owners, admins, staff, interns: strictly resolve and scope to their companyId
    const user = await User.findOne({ userId: decoded.userId }).lean();
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (!user.companyId) {
      if (user.role === 'owner') {
        const { default: Company } = await import('../models/Company.js');
        const company = await Company.findOne({ ownerId: user.userId }).lean();
        if (company) {
          await User.updateOne({ userId: user.userId }, { companyId: company._id, company: company.name });
          req.companyId = company._id;
          return next();
        }
      }
      req.companyId = undefined;
      return next();
    }

    req.companyId = user.companyId;
    next();
  } catch (err) {
    console.error('companyScope middleware error:', err);
    return res.status(500).json({ message: 'Failed to resolve company context' });
  }
};
