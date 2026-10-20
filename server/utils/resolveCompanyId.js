import User from '../models/User.js';

/**
 * Resolve the companyId to stamp on a new record.
 *
 * - Non-SuperAdmin: always returns req.companyId (enforced by middleware).
 * - SuperAdmin (req.companyId === null):
 *     1. If body already has a valid companyId, use it (frontend-supplied).
 *     2. Otherwise, look up a target user (assignedTo / userId / senderId)
 *        and return their companyId.
 *     3. Falls back to null if nothing can be resolved.
 *
 * @param {object} req   - Express request (must have req.companyId set by companyScope)
 * @param {object} body  - The request body for the record being created
 * @returns {Promise<import('mongoose').Types.ObjectId|null>}
 */
export async function resolveCompanyId(req, body) {
  // Regular users: always enforce their own company
  if (req.companyId) return req.companyId;

  // SuperAdmin path (req.companyId === null)
  // 1. Trust an explicitly-provided companyId from the body
  if (body.companyId) return body.companyId;

  // 2. Try to derive from a user reference in the body
  const targetUserId = body.assignedTo || body.userId || body.senderId || body.recipientId;
  if (targetUserId) {
    const user = await User.findOne({ userId: targetUserId }).select('companyId').lean();
    if (user?.companyId) return user.companyId;
  }

  // 3. Nothing found – return null (record stays global / SuperAdmin-only)
  return null;
}
