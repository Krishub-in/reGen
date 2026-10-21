/**
 * Validation & Input Sanitization Utilities
 * Enforces format and safety validation across all input fields (required or optional).
 */

// Regex patterns for format validation
export const PATTERNS = {
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  PHONE: /^\+?[0-9\s\-()]{7,20}$/,
  URL: /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?$/,
  DATE_ISO: /^\d{4}-\d{2}-\d{2}$/,
  MONTH_ISO: /^\d{4}-\d{2}$/,
  TIME_HHMM: /^([01]\d|2[0-3]):([0-5]\d)$/,
  DANGEROUS_SCRIPT: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>|javascript:|on\w+\s*=/i,
};

/**
 * Sanitizes input string to disallow dangerous script execution or malicious payloads
 */
export function sanitizeInput(value) {
  if (typeof value !== 'string') return value;
  // Strip malicious HTML tags and scripts
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

/**
 * Validates a value according to field type and optional constraints.
 * If the value is empty, it returns { valid: true } unless required is true.
 * If a value is provided, it strictly checks format and safety.
 *
 * @param {string|number} value - The input value to check
 * @param {object} options - Validation options (type, minLength, maxLength, min, max, required, label)
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateField(value, options = {}) {
  const {
    type = 'text',
    required = false,
    label = 'Field',
    minLength,
    maxLength = 1000,
    min,
    max,
    customPattern,
  } = options;

  // Handle null / undefined
  if (value === null || value === undefined) {
    if (required) {
      return { valid: false, error: `${label} is required` };
    }
    return { valid: true, error: null };
  }

  const strVal = String(value).trim();

  // If empty and not required -> valid
  if (!strVal) {
    if (required) {
      return { valid: false, error: `${label} is required` };
    }
    return { valid: true, error: null };
  }

  // Safety check against XSS or script payloads for all text inputs
  if (PATTERNS.DANGEROUS_SCRIPT.test(strVal)) {
    return { valid: false, error: `${label} contains invalid or restricted characters` };
  }

  // Max length check (safety against buffer/payload overflow)
  if (maxLength && strVal.length > maxLength) {
    return { valid: false, error: `${label} cannot exceed ${maxLength} characters` };
  }

  // Min length check
  if (minLength && strVal.length < minLength) {
    return { valid: false, error: `${label} must be at least ${minLength} characters` };
  }

  // Type-specific format checks
  switch (type) {
    case 'email':
      if (!PATTERNS.EMAIL.test(strVal)) {
        return { valid: false, error: `Please enter a valid email address` };
      }
      break;

    case 'tel':
    case 'phone':
      if (!PATTERNS.PHONE.test(strVal)) {
        return { valid: false, error: `Please enter a valid phone number (digits, +, hyphens)` };
      }
      break;

    case 'url':
      if (!PATTERNS.URL.test(strVal)) {
        return { valid: false, error: `Please enter a valid web URL` };
      }
      break;

    case 'number': {
      const num = Number(strVal);
      if (isNaN(num)) {
        return { valid: false, error: `${label} must be a valid number` };
      }
      if (min !== undefined && num < min) {
        return { valid: false, error: `${label} must be at least ${min}` };
      }
      if (max !== undefined && num > max) {
        return { valid: false, error: `${label} cannot exceed ${max}` };
      }
      break;
    }

    case 'date':
      if (!PATTERNS.DATE_ISO.test(strVal) && isNaN(new Date(strVal).getTime())) {
        return { valid: false, error: `Please enter a valid date (YYYY-MM-DD)` };
      }
      break;

    case 'time':
      if (!PATTERNS.TIME_HHMM.test(strVal)) {
        return { valid: false, error: `Please enter a valid time (HH:MM)` };
      }
      break;

    default:
      if (customPattern && !customPattern.test(strVal)) {
        return { valid: false, error: `${label} format is invalid` };
      }
      break;
  }

  return { valid: true, error: null };
}
