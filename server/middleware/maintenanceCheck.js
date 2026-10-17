import SystemSetting from '../models/SystemSetting.js';
import User from '../models/User.js';
import { isPort3004Reachable } from '../utils/portCheck.js';

export const maintenanceCheck = async (req, res, next) => {
  try {
    const is3004Up = await isPort3004Reachable();
    if (!is3004Up) {
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
