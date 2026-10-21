/**
 * Global Input Validation & Safety Sanitization Middleware
 * Enforces format and safety validation for all inputs (mandatory or optional).
 */

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/;
const SCRIPT_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>|javascript:|on\w+\s*=/i;
const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeValue(val) {
  if (typeof val === 'string') {
    // Strip script execution vectors
    return val
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '');
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeValue);
  }
  if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
    const cleaned = {};
    for (const [k, v] of Object.entries(val)) {
      cleaned[k] = sanitizeValue(v);
    }
    return cleaned;
  }
  return val;
}

export function globalInputValidator(req, res, next) {
  try {
    // 1. Sanitize all incoming strings in body and query
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeValue(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeValue(req.query);
    }

    const payload = { ...req.query, ...(req.body || {}) };

    // 2. Validate formats for common fields if they are supplied (even if optional)
    if (payload.email && typeof payload.email === 'string') {
      const emailTrim = payload.email.trim();
      if (emailTrim && !EMAIL_REGEX.test(emailTrim)) {
        return res.status(400).json({ message: 'Invalid email address format' });
      }
    }

    if (payload.phone && typeof payload.phone === 'string') {
      const phoneTrim = payload.phone.trim();
      if (phoneTrim && !PHONE_REGEX.test(phoneTrim)) {
        return res.status(400).json({ message: 'Invalid phone number format' });
      }
    }

    if (payload.month && typeof payload.month === 'string' && payload.month !== 'all') {
      const monthTrim = payload.month.trim();
      if (monthTrim && !MONTH_REGEX.test(monthTrim) && !/^\d{4}$/.test(monthTrim)) {
        // Allow YYYY or YYYY-MM
        return res.status(400).json({ message: 'Invalid month format (expected YYYY-MM)' });
      }
    }

    // Number sanity checks for amounts / salaries if supplied
    const numericFields = ['amount', 'salary', 'baseSalary', 'bonus', 'deduction', 'hourlyRate'];
    for (const field of numericFields) {
      if (payload[field] !== undefined && payload[field] !== null && payload[field] !== '') {
        const num = Number(payload[field]);
        if (isNaN(num)) {
          return res.status(400).json({ message: `${field} must be a valid number` });
        }
        if (num < 0) {
          return res.status(400).json({ message: `${field} cannot be negative` });
        }
      }
    }

    next();
  } catch (err) {
    next();
  }
}
