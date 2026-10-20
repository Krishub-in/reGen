import jwt from 'jsonwebtoken';
import SystemSetting from '../models/SystemSetting.js';
import User from '../models/User.js';
import { isPort3004Reachable } from '../utils/portCheck.js';

export const maintenanceCheck = async (req, res, next) => {
  try {
    // If request contains Bearer token and req.user isn't populated yet, extract role
    if (!req.user && req.headers?.authorization?.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.slice(7);
        const secret = process.env.JWT_SECRET;
        if (secret) {
          req.user = jwt.verify(token, secret);
        }
      } catch {}
    }

    const is3004Up = await isPort3004Reachable();
    if (!is3004Up) {
      // Super Admin bypass so system control / emergency dashboard still functions
      if (req.user && req.user.role === 'param') {
        return next();
      }
      // Allow Super Admin login attempt through so they can authenticate and manage
      if (req.path === '/api/auth/login' && req.body?.identifier?.toLowerCase() === (process.env.SUPER_ADMIN_USERNAME || 'vyshwa').toLowerCase()) {
        return next();
      }
      return res.status(503).json({ 
        message: 'Server Under Maintenance',
        maintenance: true,
        portDown: true
      });
    }

    // Check if maintenance mode is ON
    const setting = await SystemSetting.findOne({ key: 'maintenance_mode' });
    const isMaintenance = setting?.value === true;

    if (isMaintenance) {
      // Allow if the user is a Super Admin (from JWT)
      if (req.user && req.user.role === 'param') {
        return next();
      }

      return res.status(503).json({ 
        message: 'Server Under Maintenance',
        maintenance: true 
      });
    }

    next();
  } catch (error) {
    next(); // On error, allow request to proceed (safe fallback)
  }
};

