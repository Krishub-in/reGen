import PolicyAcknowledgment from '../models/PolicyAcknowledgment.js';
import Company from '../models/Company.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { safeRandomUUID } from '../utils/safeRandomUUID.js';

/**
 * Sync / Initialize Policy Acknowledgment records for all active employees of a company
 */
export const syncPolicyAcknowledgmentsForCompany = async (companyId, io) => {
  try {
    const company = await Company.findById(companyId);
    if (!company || !company.companyPolicies || company.companyPolicies.length === 0) return;

    // Get all employees of the company (excluding superadmin and owner)
    const employees = await User.find({
      companyId: company._id,
      role: { $in: ['staff', 'employee', 'intern', 'freelancer', 'admin'] }
    });

    for (const policy of company.companyPolicies) {
      const policyIdStr = policy._id ? policy._id.toString() : String(policy.title);

      for (const emp of employees) {
        const uId = emp.userId || emp.StaffId || emp._id.toString();

        const existing = await PolicyAcknowledgment.findOne({
          companyId: company._id,
          policyId: policyIdStr,
          userId: uId
        });

        if (!existing) {
          // Create pending acknowledgment
          await PolicyAcknowledgment.create({
            companyId: company._id,
            policyId: policyIdStr,
            policyTitle: policy.title,
            policyContent: policy.content,
            effectiveDate: policy.effectiveDate || '',
            userId: uId,
            userName: emp.name || emp.username || uId,
            userEmail: emp.email || '',
            department: emp.department || 'General',
            status: 'pending'
          });

          // Create notification for employee
          const notifId = safeRandomUUID();
          await Notification.create({
            id: notifId,
            companyId: company._id,
            userId: uId,
            title: `New Policy: ${policy.title}`,
            message: `Company policy "${policy.title}" has been published. Please review and acknowledge.`,
            type: 'policy',
            senderName: company.name,
            createdAt: new Date().toISOString(),
            metadata: {
              policyId: policyIdStr,
              policyTitle: policy.title
            }
          });

          if (io) {
            io.to(`company:${company._id}`).emit('policy:new', {
              policyId: policyIdStr,
              title: policy.title,
              userId: uId
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[POLICY-SYNC-ERROR]', err);
  }
};

/**
 * Controller: Get Employee Policy Status
 * Returns whether user is blocked by any declined policy, plus pending policies.
 */
export const getEmployeePolicyStatus = async (req, res) => {
  try {
    const companyId = req.companyId;
    const user = req.user;
    if (!companyId || !user) {
      return res.status(200).json({ hasBlockedPolicy: false, blockedPolicies: [], pendingPolicies: [] });
    }

    const uId = user.userId || user.StaffId || user._id?.toString() || user.id;

    // Fetch company to ensure we only evaluate policies that currently exist
    const company = await Company.findById(companyId);
    if (!company || !company.companyPolicies || company.companyPolicies.length === 0) {
      return res.status(200).json({ hasBlockedPolicy: false, blockedPolicies: [], pendingPolicies: [] });
    }

    const activePolicyIds = new Set(company.companyPolicies.map(p => p._id ? p._id.toString() : String(p.title)));

    // Find all acknowledgments for this employee
    const acks = await PolicyAcknowledgment.find({
      companyId,
      userId: uId
    });

    const ackMap = new Map();
    acks.forEach(a => ackMap.set(a.policyId, a));

    const blockedPolicies = [];
    const pendingPolicies = [];

    for (const policy of company.companyPolicies) {
      const pId = policy._id ? policy._id.toString() : String(policy.title);
      const ack = ackMap.get(pId);

      if (!ack) {
        // Pending response
        pendingPolicies.push({
          policyId: pId,
          title: policy.title,
          content: policy.content,
          effectiveDate: policy.effectiveDate || '',
          status: 'pending'
        });
      } else if (ack.status === 'declined') {
        // User declined this policy and owner has not allowed yet -> BLOCKED!
        blockedPolicies.push({
          ackId: ack._id,
          policyId: pId,
          title: policy.title,
          content: policy.content,
          effectiveDate: policy.effectiveDate || '',
          status: 'declined',
          declineReason: ack.declineReason,
          declinedAt: ack.declinedAt
        });
      } else if (ack.status === 'pending') {
        pendingPolicies.push({
          ackId: ack._id,
          policyId: pId,
          title: policy.title,
          content: policy.content,
          effectiveDate: policy.effectiveDate || '',
          status: 'pending'
        });
      }
    }

    const hasBlockedPolicy = blockedPolicies.length > 0;

    res.status(200).json({
      hasBlockedPolicy,
      blockedPolicies,
      pendingPolicies
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Controller: Employee Accepts Policy
 */
export const acceptPolicy = async (req, res) => {
  try {
    const companyId = req.companyId;
    const user = req.user;
    const { policyId } = req.params;

    if (!companyId || !user) {
      return res.status(400).json({ message: 'Authentication and company context required' });
    }

    const uId = user.userId || user.StaffId || user._id?.toString() || user.id;
    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ message: 'Company not found' });

    const policy = (company.companyPolicies || []).find(
      p => (p._id ? p._id.toString() : String(p.title)) === policyId
    );

    const policyTitle = policy?.title || 'Company Policy';
    const policyContent = policy?.content || '';

    let ack = await PolicyAcknowledgment.findOne({
      companyId,
      policyId,
      userId: uId
    });

    if (ack) {
      ack.status = 'accepted';
      ack.acceptedAt = new Date();
      ack.policyTitle = policyTitle;
      ack.policyContent = policyContent;
      await ack.save();
    } else {
      ack = await PolicyAcknowledgment.create({
        companyId,
        policyId,
        policyTitle,
        policyContent,
        effectiveDate: policy?.effectiveDate || '',
        userId: uId,
        userName: user.name || user.username || uId,
        userEmail: user.email || '',
        department: user.department || 'General',
        status: 'accepted',
        acceptedAt: new Date()
      });
    }

    // Notify owner
    const owner = await User.findOne({
      $or: [{ userId: company.ownerId }, { companyId: company._id, role: 'owner' }]
    });

    if (owner) {
      const ownerId = owner.userId || owner.StaffId || owner._id.toString();
      await Notification.create({
        id: safeRandomUUID(),
        companyId,
        userId: ownerId,
        title: `Policy Accepted: ${policyTitle}`,
        message: `${user.name || user.username} accepted company policy "${policyTitle}".`,
        type: 'policy',
        senderName: user.name || user.username,
        createdAt: new Date().toISOString(),
        metadata: { policyId, employeeId: uId }
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`company:${companyId}`).emit('policy:status-updated', {
        policyId,
        userId: uId,
        status: 'accepted'
      });
    }

    res.status(200).json({
      message: 'Policy accepted successfully. You may continue working.',
      acknowledgment: ack
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Controller: Employee Declines Policy with Reason
 */
export const declinePolicy = async (req, res) => {
  try {
    const companyId = req.companyId;
    const user = req.user;
    const { policyId } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'A reason for declining the policy is required' });
    }

    if (!companyId || !user) {
      return res.status(400).json({ message: 'Authentication and company context required' });
    }

    const uId = user.userId || user.StaffId || user._id?.toString() || user.id;
    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ message: 'Company not found' });

    const policy = (company.companyPolicies || []).find(
      p => (p._id ? p._id.toString() : String(p.title)) === policyId
    );

    const policyTitle = policy?.title || 'Company Policy';
    const policyContent = policy?.content || '';

    let ack = await PolicyAcknowledgment.findOne({
      companyId,
      policyId,
      userId: uId
    });

    if (ack) {
      ack.status = 'declined';
      ack.declineReason = reason.trim();
      ack.declinedAt = new Date();
      ack.policyTitle = policyTitle;
      ack.policyContent = policyContent;
      await ack.save();
    } else {
      ack = await PolicyAcknowledgment.create({
        companyId,
        policyId,
        policyTitle,
        policyContent,
        effectiveDate: policy?.effectiveDate || '',
        userId: uId,
        userName: user.name || user.username || uId,
        userEmail: user.email || '',
        department: user.department || 'General',
        status: 'declined',
        declineReason: reason.trim(),
        declinedAt: new Date()
      });
    }

    // Send high-priority notification to Company Owner with the reason
    const owner = await User.findOne({
      $or: [{ userId: company.ownerId }, { companyId: company._id, role: 'owner' }]
    });

    if (owner) {
      const ownerId = owner.userId || owner.StaffId || owner._id.toString();
      await Notification.create({
        id: safeRandomUUID(),
        companyId,
        userId: ownerId,
        title: `Policy Declined: ${policyTitle}`,
        message: `${user.name || user.username} declined policy "${policyTitle}". Reason: "${reason.trim()}"`,
        type: 'policy',
        senderName: user.name || user.username,
        createdAt: new Date().toISOString(),
        metadata: {
          policyId,
          employeeId: uId,
          employeeName: user.name || user.username,
          declineReason: reason.trim(),
          ackId: ack._id
        }
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`company:${companyId}`).emit('policy:status-updated', {
        policyId,
        userId: uId,
        status: 'declined',
        reason: reason.trim()
      });
    }

    res.status(200).json({
      message: 'Policy declined. Your reason has been submitted to the company owner for review. Access to workspace actions is paused until reviewed.',
      acknowledgment: ack,
      hasBlockedPolicy: true
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Controller: Get all Policy Acknowledgments / Reviews for Company Owner / Admin
 */
export const getCompanyPolicyReviews = async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(400).json({ message: 'Company context required' });

    const acks = await PolicyAcknowledgment.find({ companyId })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(acks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Controller: Owner Allows Employee to Work Forward
 */
export const allowEmployeeWorkForward = async (req, res) => {
  try {
    const companyId = req.companyId;
    const { id } = req.params; // ackId
    const { notes } = req.body;
    const reviewer = req.user;

    const ack = await PolicyAcknowledgment.findById(id);
    if (!ack) return res.status(404).json({ message: 'Policy response record not found' });

    if (ack.companyId.toString() !== companyId.toString()) {
      return res.status(403).json({ message: 'Unauthorized for this company' });
    }

    ack.status = 'allowed';
    ack.allowedAt = new Date();
    ack.allowedBy = reviewer?.name || reviewer?.username || 'Company Owner';
    ack.ownerNotes = notes ? notes.trim() : 'Exemption approved by company owner';
    await ack.save();

    // Send notification to the employee that they are allowed to work forward
    await Notification.create({
      id: safeRandomUUID(),
      companyId,
      userId: ack.userId,
      title: `Policy Review: Allowed to Work`,
      message: `The company owner has reviewed your reason for "${ack.policyTitle}" and approved you to work forward.`,
      type: 'policy',
      senderName: reviewer?.name || 'Company Owner',
      createdAt: new Date().toISOString(),
      metadata: {
        policyId: ack.policyId,
        status: 'allowed'
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`company:${companyId}`).emit('policy:status-updated', {
        policyId: ack.policyId,
        userId: ack.userId,
        status: 'allowed'
      });
    }

    res.status(200).json({
      message: `Employee ${ack.userName} has been allowed to work forward.`,
      acknowledgment: ack
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
