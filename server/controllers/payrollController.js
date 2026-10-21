import mongoose from 'mongoose';
import Payroll from '../models/Payroll.js';
import PayrollSetting from '../models/PayrollSetting.js';
import PaymentTransaction from '../models/PaymentTransaction.js';
import PayrollAdjustment from '../models/PayrollAdjustment.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Holiday from '../models/Holiday.js';
import Notification from '../models/Notification.js';
import { calculateEmployeeMonthlyPayroll, round2, getWeeklyOffDays } from '../utils/payrollCalculator.js';
import { emitToCompany, emitToUser, getIO } from '../socket.js';
import { sendReportEmail } from '../utils/mailer.js';

/**
 * Helper to ensure the current caller belongs to the company
 */
const requireCompanyId = (req, res, allowEmpty = false) => {
  if (!req.companyId) {
    if (allowEmpty) return null;
    res.status(400).json({ message: 'Company context required' });
    return null;
  }
  return req.companyId;
};

/**
 * Helper to verify caller has administrative rights (owner, admin, or param)
 */
const isCompanyAdmin = (user) => {
  if (!user || !user.role) return false;
  const role = typeof user.role === 'object' ? Object.keys(user.role)[0] : String(user.role);
  return ['admin', 'owner', 'param'].includes(role.toLowerCase());
};

/**
 * 1. Get Company Payroll Settings
 */
export const getPayrollSettings = async (req, res) => {
  try {
    const companyId = requireCompanyId(req, res, true);
    if (!companyId) {
      return res.status(200).json({
        checkInTime: '09:30',
        checkOutTime: '18:30',
        workingHoursPerDay: 8,
        workingDaysPerWeek: 5,
        weeklyOffDays: [0, 6],
        hourlyDeductionPct: 50,
        hourlyOvertimePct: 75,
        approvedLeaveDeductionPct: 25,
        unapprovedLeaveDeductionPct: 100,
        graceMinutes: 0,
        payrollDivisorType: 'scheduled_hours',
        fixedPayrollDivisor: 200,
        dailyBasisType: 'scheduled_days',
      });
    }

    let settings = await PayrollSetting.findOne({ companyId });
    if (!settings) {
      // Create sensible defaults for the company
      settings = await PayrollSetting.create({
        companyId,
        checkInTime: '09:30',
        checkOutTime: '18:30',
        workingHoursPerDay: 8,
        workingDaysPerWeek: 5,
        weeklyOffDays: [0, 6],
        hourlyDeductionPct: 50,
        hourlyOvertimePct: 75,
        approvedLeaveDeductionPct: 25,
        unapprovedLeaveDeductionPct: 100,
        graceMinutes: 0,
        payrollDivisorType: 'scheduled_hours',
        fixedPayrollDivisor: 200,
        dailyBasisType: 'scheduled_days',
      });
    }

    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * 2. Update Company Payroll Settings
 */
export const updatePayrollSettings = async (req, res) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    if (!isCompanyAdmin(req.user)) {
      return res.status(403).json({ message: 'Only company admins or owners can update payroll settings' });
    }

    const {
      checkInTime,
      checkOutTime,
      workingHoursPerDay,
      workingDaysPerWeek,
      weeklyOffDays,
      hourlyDeductionPct,
      hourlyOvertimePct,
      approvedLeaveDeductionPct,
      unapprovedLeaveDeductionPct,
      graceMinutes,
      payrollDivisorType,
      fixedPayrollDivisor,
      dailyBasisType,
    } = req.body;

    // Validate ranges
    const updates = {};

    if (checkInTime) updates.checkInTime = String(checkInTime).trim();
    if (checkOutTime) updates.checkOutTime = String(checkOutTime).trim();

    if (workingHoursPerDay !== undefined) {
      const wh = Number(workingHoursPerDay);
      if (isNaN(wh) || wh < 1 || wh > 24) {
        return res.status(400).json({ message: 'Working hours per day must be between 1 and 24' });
      }
      updates.workingHoursPerDay = wh;
    }

    if (workingDaysPerWeek !== undefined) {
      const wd = Number(workingDaysPerWeek);
      if (isNaN(wd) || wd < 1 || wd > 7) {
        return res.status(400).json({ message: 'Working days per week must be between 1 and 7' });
      }
      updates.workingDaysPerWeek = wd;
      // Auto-set weeklyOffDays if not explicitly provided
      if (!weeklyOffDays) {
        updates.weeklyOffDays = getWeeklyOffDays(wd);
      }
    }

    if (Array.isArray(weeklyOffDays)) {
      updates.weeklyOffDays = weeklyOffDays.map(Number).filter(n => n >= 0 && n <= 6);
    }

    if (hourlyDeductionPct !== undefined) {
      const hd = Number(hourlyDeductionPct);
      if (isNaN(hd) || hd < 0 || hd > 500) {
        return res.status(400).json({ message: 'Hourly deduction percentage must be between 0% and 500%' });
      }
      updates.hourlyDeductionPct = hd;
    }

    if (hourlyOvertimePct !== undefined) {
      const ho = Number(hourlyOvertimePct);
      if (isNaN(ho) || ho < 0 || ho > 500) {
        return res.status(400).json({ message: 'Hourly overtime percentage must be between 0% and 500%' });
      }
      updates.hourlyOvertimePct = ho;
    }

    if (approvedLeaveDeductionPct !== undefined) {
      const al = Number(approvedLeaveDeductionPct);
      if (isNaN(al) || al < 0 || al > 100) {
        return res.status(400).json({ message: 'Approved leave deduction percentage must be between 0% and 100%' });
      }
      updates.approvedLeaveDeductionPct = al;
    }

    if (unapprovedLeaveDeductionPct !== undefined) {
      const ul = Number(unapprovedLeaveDeductionPct);
      if (isNaN(ul) || ul < 0 || ul > 200) {
        return res.status(400).json({ message: 'Unapproved leave deduction percentage must be between 0% and 200%' });
      }
      updates.unapprovedLeaveDeductionPct = ul;
    }

    if (graceMinutes !== undefined) {
      const gm = Number(graceMinutes);
      if (isNaN(gm) || gm < 0 || gm > 120) {
        return res.status(400).json({ message: 'Grace buffer minutes must be between 0 and 120' });
      }
      updates.graceMinutes = gm;
    }

    if (payrollDivisorType) {
      if (!['scheduled_hours', 'fixed_hours'].includes(payrollDivisorType)) {
        return res.status(400).json({ message: 'Invalid payroll divisor type' });
      }
      updates.payrollDivisorType = payrollDivisorType;
    }

    if (fixedPayrollDivisor !== undefined) {
      const fpd = Number(fixedPayrollDivisor);
      if (isNaN(fpd) || fpd <= 0) {
        return res.status(400).json({ message: 'Fixed payroll divisor must be greater than 0' });
      }
      updates.fixedPayrollDivisor = fpd;
    }

    if (dailyBasisType) {
      if (!['scheduled_days', 'calendar_days'].includes(dailyBasisType)) {
        return res.status(400).json({ message: 'Invalid daily basis type' });
      }
      updates.dailyBasisType = dailyBasisType;
    }

    updates.updatedBy = req.user.userId;

    const settings = await PayrollSetting.findOneAndUpdate(
      { companyId },
      { $set: updates },
      { new: true, upsert: true }
    );

    emitToCompany('payroll:settings_updated', companyId, settings);

    res.status(200).json({ message: 'Payroll settings updated successfully', settings });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * 3. Get Monthly Payroll Summary for All Company Employees
 * Live calculation for draft records + snapshot for finalized records
 */
export const getPayrollSummary = async (req, res) => {
  try {
    const companyId = requireCompanyId(req, res, true);
    if (!companyId) {
      return res.status(200).json({ summary: [], totalGross: 0, totalNet: 0, count: 0, page: 1, totalPages: 1 });
    }

    if (!isCompanyAdmin(req.user)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Default to current month if not provided: 'YYYY-MM'
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = (req.query.month || currentMonthStr).trim();

    // Query parameters for filter/search
    const search = String(req.query.search || '').trim().toLowerCase();
    const department = String(req.query.department || 'all').trim();
    const statusTab = String(req.query.statusTab || 'all').trim(); // 'all', 'pending', 'processed'

    // 1. Fetch company payroll settings
    let settings = await PayrollSetting.findOne({ companyId }).lean();
    if (!settings) {
      settings = {
        workingHoursPerDay: 8,
        workingDaysPerWeek: 5,
        weeklyOffDays: [0, 6],
        hourlyDeductionPct: 50,
        hourlyOvertimePct: 75,
        approvedLeaveDeductionPct: 25,
        unapprovedLeaveDeductionPct: 100,
        payrollDivisorType: 'scheduled_hours',
        fixedPayrollDivisor: 200,
        dailyBasisType: 'scheduled_days',
      };
    }

    // 2. Fetch all company employees (exclude owners and superadmins from employee payroll table)
    const users = await User.find({
      companyId,
      role: { $in: ['staff', 'intern', 'freelancer', 'admin'] }
    }).select('userId StaffId username name role department designation salary status').lean();

    // 3. Fetch existing payroll records for this month
    const existingPayrolls = await Payroll.find({ companyId, month }).lean();
    const payrollMap = new Map();
    existingPayrolls.forEach(p => payrollMap.set(p.userId, p));

    // 4. Fetch holidays for this company and month
    const holidays = await Holiday.find({
      companyId,
      date: { $regex: `^${month}` }
    }).lean();

    // 5. Fetch all attendances for company in this month
    const attendances = await Attendance.find({
      companyId,
      date: { $regex: `^${month}` }
    }).lean();

    // 6. Fetch all leaves for company
    const leaves = await Leave.find({
      companyId,
      $or: [
        { startDate: { $regex: `^${month}` } },
        { endDate: { $regex: `^${month}` } },
      ]
    }).lean();

    // Group attendance and leaves by userId
    const attendanceByUser = new Map();
    attendances.forEach(a => {
      const uid = String(a.userId);
      if (!attendanceByUser.has(uid)) attendanceByUser.set(uid, []);
      attendanceByUser.get(uid).push(a);
    });

    const leavesByUser = new Map();
    leaves.forEach(l => {
      const uid = String(l.userId);
      if (!leavesByUser.has(uid)) leavesByUser.set(uid, []);
      leavesByUser.get(uid).push(l);
    });

    // 7. Fetch all bonus and deduction adjustments for this company and month
    const adjustments = await PayrollAdjustment.find({ companyId, month }).lean();
    const adjustmentsByUser = new Map();
    adjustments.forEach(a => {
      const uid = String(a.userId);
      if (!adjustmentsByUser.has(uid)) adjustmentsByUser.set(uid, []);
      adjustmentsByUser.get(uid).push(a);
    });

    // 8. Fetch completed payment transactions for this company and month to get exact amount sent dynamically
    const completedTransactions = await PaymentTransaction.find({ companyId, month, status: 'completed' }).lean();
    const paidByPayrollId = new Map();
    const paidByUserId = new Map();
    completedTransactions.forEach(tx => {
      const amt = Number(tx.amount || 0);
      if (tx.payrollId) {
        const pid = String(tx.payrollId);
        paidByPayrollId.set(pid, round2((paidByPayrollId.get(pid) || 0) + amt));
      }
      if (tx.userId) {
        const uid = String(tx.userId);
        paidByUserId.set(uid, round2((paidByUserId.get(uid) || 0) + amt));
      }
    });

    // 9. Calculate or map payroll for each employee
    const items = [];
    let totalBaseSalary = 0;
    let totalDeductions = 0;
    let totalOvertimeAdditions = 0;
    let totalBonuses = 0;
    let totalManualDeductions = 0;
    let totalNetPayable = 0;
    let totalAmountSent = 0;
    let totalAmountToPay = 0;
    let pendingFinalizationCount = 0;
    let pendingPaymentCount = 0;
    let paymentsCompletedCount = 0;

    for (const u of users) {
      const uid = u.userId || u.StaffId || String(u._id);
      const existing = payrollMap.get(uid) || payrollMap.get(u.userId) || (u.StaffId ? payrollMap.get(u.StaffId) : null);
      const userAdjustments = adjustments.filter(a =>
        a.userId === u.userId ||
        (u.StaffId && a.userId === u.StaffId) ||
        (u._id && a.userId === String(u._id)) ||
        a.userId === uid
      );
      const userBonus = round2(userAdjustments.filter(a => a.type === 'bonus').reduce((sum, a) => sum + Number(a.amount || 0), 0));
      const userManualDeduction = round2(userAdjustments.filter(a => a.type === 'deduction').reduce((sum, a) => sum + Number(a.amount || 0), 0));

      let record;
      if (existing && existing.status === 'finalized') {
        const bonus = userBonus > 0 ? userBonus : (existing.bonus || 0);
        const manualDeduction = userManualDeduction > 0 ? userManualDeduction : (existing.manualDeduction || 0);

        const hourlyOvertimeAddition = round2(existing.hourlyOvertimeAddition || 0);
        const hourlyShortfallDeduction = round2(existing.hourlyShortfallDeduction || 0);
        const approvedLeaveDeduction = round2(existing.approvedLeaveDeduction || 0);
        const unapprovedLeaveDeduction = round2(existing.unapprovedLeaveDeduction || 0);
        const baseSalary = round2(existing.baseSalary || Number(u.salary) || 0);

        const totalAdditions = round2(hourlyOvertimeAddition + bonus);
        const totalDeductions = round2(hourlyShortfallDeduction + approvedLeaveDeduction + unapprovedLeaveDeduction + manualDeduction);
        const grossPayable = round2(baseSalary + totalAdditions);
        const totalAmount = Math.max(0, round2(grossPayable - totalDeductions));
        const netPayable = totalAmount;

        // Transactions paid total
        const txPaid = (paidByPayrollId.get(String(existing._id)) || 0) +
          (paidByUserId.get(uid) || 0) +
          (u.userId !== uid ? (paidByUserId.get(u.userId) || 0) : 0);

        let amountPaid = txPaid;
        if (amountPaid === 0 && existing.paymentStatus === 'paid') {
          amountPaid = existing.amountPaid > 0 ? existing.amountPaid : (existing.totalAmount || existing.netPayable || 0);
        }

        const pendingAmount = Math.max(0, round2(totalAmount - amountPaid));
        const isPaid = pendingAmount <= 0.01 && (amountPaid > 0 || existing.paymentStatus === 'paid');
        const isPartiallyPaid = amountPaid > 0 && pendingAmount > 0.01;
        const paymentStatus = isPaid ? 'paid' : (isPartiallyPaid ? 'partially_paid' : (existing.paymentStatus || 'unpaid'));

        record = {
          ...existing,
          name: u.name || u.username || uid,
          StaffId: u.StaffId || uid,
          designation: u.designation || 'Staff',
          department: u.department || 'General',
          baseSalary,
          bonus,
          manualDeduction,
          hourlyOvertimeAddition,
          totalAdditions,
          hourlyShortfallDeduction,
          approvedLeaveDeduction,
          unapprovedLeaveDeduction,
          totalDeductions,
          grossPayable,
          totalAmount,
          netPayable,
          amountPaid,
          pendingAmount,
          paymentStatus,
          isFinalized: true,
          isPaid,
          isPartiallyPaid,
          hasPendingBonus: isPartiallyPaid && bonus > 0,
        };
      } else {
        // Live dynamic preview
        const userAttendances = attendanceByUser.get(uid) || [];
        const userLeaves = leavesByUser.get(uid) || [];
        const calculated = calculateEmployeeMonthlyPayroll({
          user: u,
          month,
          settings,
          attendances: userAttendances,
          leaves: userLeaves,
          holidays,
          adjustments: userAdjustments,
          referenceDate: new Date(),
        });

        record = {
          ...calculated,
          _id: existing?._id,
          id: existing?.id,
          companyId,
          userId: uid,
          StaffId: u.StaffId || uid,
          name: u.name || u.username || uid,
          designation: u.designation || 'Staff',
          department: u.department || 'General',
          bonus: userBonus,
          manualDeduction: userManualDeduction,
          totalAmount: calculated.totalAmount,
          amountPaid: 0,
          pendingAmount: calculated.totalAmount,
          status: 'draft',
          paymentStatus: 'unpaid',
          isFinalized: false,
          isPaid: false,
          isPartiallyPaid: false,
          hasPendingBonus: false,
        };
      }

      // Count metrics
      totalBaseSalary = round2(totalBaseSalary + record.baseSalary);
      totalDeductions = round2(totalDeductions + record.totalDeductions);
      totalOvertimeAdditions = round2(totalOvertimeAdditions + record.hourlyOvertimeAddition);
      totalBonuses = round2(totalBonuses + (record.bonus || 0));
      totalManualDeductions = round2(totalManualDeductions + (record.manualDeduction || 0));
      totalNetPayable = round2(totalNetPayable + record.netPayable);

      totalAmountSent = round2(totalAmountSent + (record.amountPaid || 0));
      totalAmountToPay = round2(totalAmountToPay + (record.pendingAmount !== undefined ? record.pendingAmount : (record.isPaid ? 0 : record.totalAmount)));

      if (record.isPaid) {
        paymentsCompletedCount++;
      } else if (record.isPartiallyPaid) {
        pendingPaymentCount++;
      } else {
        if (record.status === 'draft') {
          pendingFinalizationCount++;
        } else {
          pendingPaymentCount++;
        }
      }

      items.push(record);
    }

    // 10. Filter by statusTab and search
    let filtered = items;

    if (statusTab === 'pending') {
      filtered = filtered.filter(i => !i.isPaid || i.isPartiallyPaid);
    } else if (statusTab === 'processed') {
      filtered = filtered.filter(i => i.isPaid || i.isPartiallyPaid);
    }

    if (department !== 'all') {
      filtered = filtered.filter(i => (i.department || '').toLowerCase() === department.toLowerCase());
    }

    if (search) {
      filtered = filtered.filter(i =>
        (i.name || '').toLowerCase().includes(search) ||
        (i.userId || '').toLowerCase().includes(search) ||
        (i.StaffId || '').toLowerCase().includes(search)
      );
    }

    res.status(200).json({
      month,
      summary: {
        totalEmployees: users.length,
        totalAmountSent,
        totalAmountToPay,
        totalBaseSalary,
        totalDeductions,
        totalOvertimeAdditions,
        totalBonuses,
        totalManualDeductions,
        totalNetPayable,
        pendingFinalizationCount,
        pendingPaymentCount,
        paymentsCompletedCount,
      },
      settings,
      items: filtered,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * 4. Get Detailed Employee Payroll Preview (Breakdown)
 */
export const getEmployeePayrollPreview = async (req, res) => {
  try {
    const companyId = requireCompanyId(req, res, true);
    if (!companyId) {
      return res.status(200).json({});
    }

    const { userId, month } = req.query;
    if (!userId || !month) {
      return res.status(400).json({ message: 'userId and month are required' });
    }

    // Enforce permission: employee can only see their own; admin can see any company user
    if (!isCompanyAdmin(req.user) && req.user.userId !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await User.findOne({
      $or: [{ userId }, { StaffId: userId }, ...(mongoose.isValidObjectId(userId) ? [{ _id: userId }] : [])],
      companyId,
    }).lean();

    if (!user) {
      return res.status(404).json({ message: 'Employee not found in this company' });
    }

    // Check if finalized record exists
    const existing = await Payroll.findOne({ companyId, userId: user.userId, month }).lean();
    if (existing && existing.status === 'finalized') {
      return res.status(200).json({
        ...existing,
        name: user.name || user.username || user.userId,
        StaffId: user.StaffId || user.userId,
        department: user.department || 'General',
        isFinalized: true,
        isPaid: existing.paymentStatus === 'paid',
      });
    }

    // Live calculation
    let settings = await PayrollSetting.findOne({ companyId }).lean();
    if (!settings) {
      settings = {
        workingHoursPerDay: 8,
        workingDaysPerWeek: 5,
        weeklyOffDays: [0, 6],
        hourlyDeductionPct: 50,
        hourlyOvertimePct: 75,
        approvedLeaveDeductionPct: 25,
        unapprovedLeaveDeductionPct: 100,
        payrollDivisorType: 'scheduled_hours',
        fixedPayrollDivisor: 200,
        dailyBasisType: 'scheduled_days',
      };
    }

    const holidays = await Holiday.find({
      companyId,
      date: { $regex: `^${month}` }
    }).lean();

    const attendances = await Attendance.find({
      companyId,
      userId: user.userId,
      date: { $regex: `^${month}` }
    }).lean();

    const leaves = await Leave.find({
      companyId,
      userId: user.userId,
      $or: [
        { startDate: { $regex: `^${month}` } },
        { endDate: { $regex: `^${month}` } },
      ]
    }).lean();

    const adjustments = await PayrollAdjustment.find({
      companyId,
      $or: [
        { userId: user.userId },
        ...(user.StaffId ? [{ userId: user.StaffId }] : []),
        ...(mongoose.isValidObjectId(user._id) ? [{ userId: String(user._id) }] : [])
      ],
      month,
    }).lean();

    const result = calculateEmployeeMonthlyPayroll({
      user,
      month,
      settings,
      attendances,
      leaves,
      holidays,
      adjustments,
      referenceDate: new Date(),
    });

    let amountPaid = 0;
    const completedTransactions = await PaymentTransaction.find({
      companyId,
      $or: [
        { userId: user.userId },
        ...(user.StaffId ? [{ userId: user.StaffId }] : []),
        ...(existing?._id ? [{ payrollId: existing._id }] : [])
      ],
      month,
      status: 'completed',
    }).lean();

    amountPaid = round2(completedTransactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0));
    if (amountPaid === 0 && existing?.paymentStatus === 'paid') {
      amountPaid = existing.amountPaid > 0 ? existing.amountPaid : (existing.totalAmount || existing.netPayable || 0);
    }
    const pendingAmount = Math.max(0, round2(result.totalAmount - amountPaid));
    const isPaid = pendingAmount <= 0.01 && (amountPaid > 0 || existing?.paymentStatus === 'paid');
    const isPartiallyPaid = amountPaid > 0 && pendingAmount > 0.01;

    res.status(200).json({
      ...result,
      _id: existing?._id,
      id: existing?.id,
      amountPaid,
      pendingAmount,
      status: existing?.status || 'draft',
      paymentStatus: isPaid ? 'paid' : (isPartiallyPaid ? 'partially_paid' : (existing?.paymentStatus || 'unpaid')),
      isFinalized: existing?.status === 'finalized',
      isPaid,
      isPartiallyPaid,
      hasPendingBonus: isPartiallyPaid && result.bonus > 0,
      adjustments,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * 5. Finalize Payroll
 * Saves an immutable snapshot of calculation inputs, rates, breakdowns, and amounts.
 */
export const finalizePayroll = async (req, res) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    if (!isCompanyAdmin(req.user)) {
      return res.status(403).json({ message: 'Only company admins or owners can finalize payroll' });
    }

    const { userId, month, notes } = req.body;
    if (!userId || !month) {
      return res.status(400).json({ message: 'userId and month are required' });
    }

    const user = await User.findOne({
      $or: [{ userId }, { StaffId: userId }, ...(mongoose.isValidObjectId(userId) ? [{ _id: userId }] : [])],
      companyId,
    });

    if (!user) {
      return res.status(404).json({ message: 'Employee not found in this company' });
    }

    // Check existing
    const existing = await Payroll.findOne({ companyId, userId: user.userId, month });
    if (existing && existing.status === 'finalized') {
      return res.status(400).json({ message: 'Payroll for this employee and month has already been finalized' });
    }
    if (existing && existing.paymentStatus === 'paid') {
      return res.status(400).json({ message: 'Payroll has already been paid' });
    }

    // Perform live calculation to freeze
    let settings = await PayrollSetting.findOne({ companyId }).lean();
    if (!settings) {
      settings = {
        workingHoursPerDay: 8,
        workingDaysPerWeek: 5,
        weeklyOffDays: [0, 6],
        hourlyDeductionPct: 50,
        hourlyOvertimePct: 75,
        approvedLeaveDeductionPct: 25,
        unapprovedLeaveDeductionPct: 100,
        payrollDivisorType: 'scheduled_hours',
        fixedPayrollDivisor: 200,
        dailyBasisType: 'scheduled_days',
      };
    }

    const holidays = await Holiday.find({
      companyId,
      date: { $regex: `^${month}` }
    }).lean();

    const attendances = await Attendance.find({
      companyId,
      userId: user.userId,
      date: { $regex: `^${month}` }
    }).lean();

    const leaves = await Leave.find({
      companyId,
      userId: user.userId,
      $or: [
        { startDate: { $regex: `^${month}` } },
        { endDate: { $regex: `^${month}` } },
      ]
    }).lean();

    const adjustments = await PayrollAdjustment.find({
      companyId,
      $or: [
        { userId: user.userId },
        ...(user.StaffId ? [{ userId: user.StaffId }] : []),
        ...(mongoose.isValidObjectId(user._id) ? [{ userId: String(user._id) }] : [])
      ],
      month,
    }).lean();

    const calculation = calculateEmployeeMonthlyPayroll({
      user,
      month,
      settings,
      attendances,
      leaves,
      holidays,
      adjustments,
      referenceDate: new Date(),
    });

    const payrollData = {
      ...calculation,
      companyId,
      userId: user.userId,
      month,
      status: 'finalized',
      paymentStatus: 'unpaid',
      amountPaid: 0,
      pendingAmount: calculation.totalAmount,
      finalizedAt: new Date(),
      finalizedBy: req.user.userId,
      notes: notes || '',
      $push: {
        auditTrail: {
          action: 'FINALIZED',
          performedBy: req.user.userId,
          timestamp: new Date(),
          details: { netPayable: calculation.netPayable, totalDeductions: calculation.totalDeductions },
        }
      }
    };

    const payroll = await Payroll.findOneAndUpdate(
      { companyId, userId: user.userId, month },
      payrollData,
      { new: true, upsert: true }
    );

    emitToCompany('payroll:change', companyId, { action: 'finalized', payrollId: payroll._id, month });
    emitToUser(user.userId, 'payroll:change', { action: 'finalized', payrollId: payroll._id, month });

    try {
      const finNotif = await Notification.create({
        id: `notif-fin-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        userId: user.userId,
        companyId,
        title: 'Payroll Finalized',
        message: `Your payroll for ${month} has been finalized. Net payable: ₹${calculation.netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`,
        type: 'payroll',
        read: false,
        createdAt: new Date().toISOString(),
        metadata: {
          month,
          netPayable: calculation.netPayable,
          totalAmount: calculation.totalAmount,
        }
      });
      const targetUserIds = new Set([String(user.userId)]);
      if (user.StaffId) targetUserIds.add(String(user.StaffId));
      if (user._id) targetUserIds.add(String(user._id));
      targetUserIds.forEach(uid => {
        emitToUser(uid, 'notification:new', finNotif);
      });
    } catch (notifErr) {
      console.warn('Failed to send finalize notification:', notifErr.message);
    }

    res.status(200).json({
      message: 'Payroll finalized successfully with immutable snapshot',
      payroll,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * 6. Process Payment
 * Idempotent, atomic payment confirmation and transaction recording.
 * Supports paying regular salary as well as standalone bonus payouts.
 */
export const processPayment = async (req, res) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    if (!isCompanyAdmin(req.user)) {
      return res.status(403).json({ message: 'Only company admins or owners can process payments' });
    }

    const { payrollId, userId, month, paymentMethod, referenceId, notes, amount, isBonusPayment, payoutType } = req.body;

    if (!referenceId) {
      return res.status(400).json({ message: 'Payment reference or transaction ID is required' });
    }

    let filter = {};
    if (payrollId && mongoose.isValidObjectId(payrollId)) {
      filter = { _id: payrollId, companyId };
    } else if (userId && month) {
      filter = { companyId, userId, month };
    } else {
      return res.status(400).json({ message: 'payrollId or (userId and month) required' });
    }

    // 1. Locate payroll
    const payroll = await Payroll.findOne(filter);
    if (!payroll) {
      return res.status(404).json({ message: 'Payroll record not found. Please finalize payroll first.' });
    }

    if (payroll.status !== 'finalized') {
      return res.status(400).json({ message: 'Payroll must be finalized before processing payment' });
    }

    // 2. Check if a transaction record already exists with this referenceId
    const existingRefTx = await PaymentTransaction.findOne({
      referenceId: String(referenceId).trim(),
    });
    if (existingRefTx) {
      return res.status(409).json({ message: 'A payment transaction with this reference ID already exists' });
    }

    // 3. Compute prior payments for this payroll
    const existingTxs = await PaymentTransaction.find({
      payrollId: payroll._id,
      status: 'completed',
    }).lean();

    let priorPaid = round2(existingTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0));
    if (priorPaid === 0 && payroll.paymentStatus === 'paid') {
      priorPaid = payroll.amountPaid > 0 ? payroll.amountPaid : (payroll.totalAmount || payroll.netPayable || 0);
    }

    const currentTotal = payroll.totalAmount !== undefined && payroll.totalAmount !== null ? payroll.totalAmount : payroll.netPayable;
    const remainingToPay = Math.max(0, round2(currentTotal - priorPaid));

    if (remainingToPay <= 0.01 && payroll.paymentStatus === 'paid' && !amount) {
      return res.status(400).json({ message: 'All salary and bonuses for this employee have already been fully paid' });
    }

    // 4. Determine payout amount
    let payoutAmount = Number(amount);
    if (isNaN(payoutAmount) || payoutAmount <= 0) {
      payoutAmount = remainingToPay > 0 ? remainingToPay : currentTotal;
    }
    payoutAmount = round2(payoutAmount);

    const isBonus = Boolean(isBonusPayment || payoutType === 'bonus' || (priorPaid > 0 && payroll.bonus > 0));
    const newTotalPaid = round2(priorPaid + payoutAmount);
    const isNowFullyPaid = newTotalPaid >= (currentTotal - 0.01);
    const newPaymentStatus = isNowFullyPaid ? 'paid' : 'partially_paid';

    // 5. Create PaymentTransaction record
    const transaction = await PaymentTransaction.create({
      payrollId: payroll._id,
      companyId,
      userId: payroll.userId,
      month: payroll.month,
      amount: payoutAmount,
      type: isBonus ? 'bonus' : 'salary',
      paymentMethod: paymentMethod || 'bank_transfer',
      referenceId: String(referenceId).trim(),
      status: 'completed',
      paidAt: new Date(),
      processedBy: req.user.userId,
      processedByName: req.user.username || req.user.userId,
      notes: notes || (isBonus ? 'Bonus payout' : 'Salary payout'),
    });

    // 6. Update Payroll
    payroll.paymentStatus = newPaymentStatus;
    payroll.paidAt = new Date();
    payroll.amountPaid = newTotalPaid;
    payroll.pendingAmount = Math.max(0, round2(currentTotal - newTotalPaid));
    payroll.paymentId = transaction.id;
    if (notes) payroll.notes = notes;

    payroll.auditTrail.push({
      action: isBonus ? 'BONUS_PAYMENT_PROCESSED' : 'PAYMENT_PROCESSED',
      performedBy: req.user.userId,
      timestamp: new Date(),
      details: {
        referenceId,
        paymentMethod: paymentMethod || 'bank_transfer',
        amount: payoutAmount,
        priorPaid,
        newTotalPaid,
        type: isBonus ? 'bonus' : 'salary',
      },
    });

    await payroll.save();

    // 7. Send notification to employee
    try {
      const notifDoc = {
        id: `notif-payment-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        userId: payroll.userId,
        companyId,
        title: isBonus ? 'Payment Received - Bonus' : 'Payment Received - Salary',
        message: `Your ${isBonus ? 'bonus' : 'salary'} payment for ${payroll.month} of ₹${payoutAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} has been received and processed via ${(paymentMethod || 'bank transfer').replace('_', ' ')} (Ref: ${referenceId}).`,
        type: 'payment',
        read: false,
        createdAt: new Date().toISOString(),
        metadata: {
          month: payroll.month,
          amount: payoutAmount,
          transactionId: transaction.id,
          referenceId,
          type: isBonus ? 'bonus' : 'salary',
        }
      };

      const paymentNotif = await Notification.create(notifDoc);

      const empUser = await User.findOne({
        $or: [{ userId: payroll.userId }, { StaffId: payroll.userId }, ...(mongoose.isValidObjectId(payroll.userId) ? [{ _id: payroll.userId }] : [])],
        companyId,
      }).lean();
      const targetUserIds = new Set([String(payroll.userId)]);
      if (empUser) {
        if (empUser.userId) targetUserIds.add(String(empUser.userId));
        if (empUser.StaffId) targetUserIds.add(String(empUser.StaffId));
        if (empUser._id) targetUserIds.add(String(empUser._id));
      }
      targetUserIds.forEach(uid => {
        emitToUser(uid, 'notification:new', paymentNotif);
      });
    } catch (notifErr) {
      console.warn('Failed to send payment notification:', notifErr.message);
    }

    emitToCompany('payroll:change', companyId, {
      action: 'paid',
      payrollId: payroll._id,
      transactionId: transaction.id,
      isBonus,
      newPaymentStatus,
    });
    emitToUser(payroll.userId, 'payroll:change', {
      action: 'paid',
      payrollId: payroll._id,
      transactionId: transaction.id,
      isBonus,
      newPaymentStatus,
    });

    res.status(200).json({
      message: `${isBonus ? 'Bonus' : 'Salary'} payment of ₹${payoutAmount.toLocaleString()} processed and recorded successfully`,
      payroll,
      transaction,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * 7. Get Recent Transactions
 */
export const getRecentTransactions = async (req, res) => {
  try {
    const companyId = requireCompanyId(req, res, true);
    if (!companyId) {
      return res.status(200).json({ transactions: [], total: 0, page: 1, totalPages: 1 });
    }

    const filter = { companyId };

    if (!isCompanyAdmin(req.user)) {
      const u = await User.findOne({
        $or: [
          { userId: req.user.userId },
          ...(req.user.StaffId ? [{ StaffId: req.user.StaffId }] : []),
          ...(mongoose.isValidObjectId(req.user.userId) ? [{ _id: req.user.userId }] : []),
          ...(mongoose.isValidObjectId(req.user.id) ? [{ _id: req.user.id }] : [])
        ],
        companyId
      }).lean();

      const possibleIds = new Set([req.user.userId]);
      if (req.user.StaffId) possibleIds.add(req.user.StaffId);
      if (req.user.id) possibleIds.add(String(req.user.id));
      if (u) {
        if (u.userId) possibleIds.add(u.userId);
        if (u.StaffId) possibleIds.add(u.StaffId);
        if (u._id) possibleIds.add(String(u._id));
      }
      filter.userId = { $in: Array.from(possibleIds) };
    }

    const { month, year, search, page = 1, limit = 20 } = req.query;

    if (month && month !== 'all') {
      filter.month = month;
    } else if (year && year !== 'all') {
      filter.month = new RegExp(`^${year}-`);
    }

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const transactions = await PaymentTransaction.find(filter)
      .sort({ paidAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const totalCount = await PaymentTransaction.countDocuments(filter);

    // Populate employee names
    const userIds = [...new Set(transactions.map(t => t.userId))];
    const users = await User.find({ userId: { $in: userIds } }).select('userId StaffId name username department').lean();
    const userMap = new Map();
    users.forEach(u => userMap.set(u.userId, u));

    const enriched = transactions.map(t => {
      const u = userMap.get(t.userId);
      return {
        ...t,
        employeeName: u?.name || u?.username || t.userId,
        staffId: u?.StaffId || t.userId,
        department: u?.department || 'General',
      };
    });

    // Client-side search if needed
    let result = enriched;
    if (search) {
      const q = String(search).toLowerCase();
      result = result.filter(t =>
        (t.employeeName || '').toLowerCase().includes(q) ||
        (t.staffId || '').toLowerCase().includes(q) ||
        (t.referenceId || '').toLowerCase().includes(q)
      );
    }

    res.status(200).json({
      transactions: result,
      totalCount,
      page: Number(page),
      totalPages: Math.ceil(totalCount / Number(limit)) || 1,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * 8. Employee-Side Payment & Payroll Records
 * Employees can only access their own payroll records (read-only)
 */
export const getEmployeeMyPayroll = async (req, res) => {
  try {
    const companyId = requireCompanyId(req, res, true);
    if (!companyId) {
      return res.status(200).json({ records: [] });
    }

    const callerUserId = req.user.userId;
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = (req.query.month || currentMonthStr).trim();

    const user = await User.findOne({ userId: callerUserId, companyId }).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found in company' });
    }

    // 1. Check if finalized record exists
    const existing = await Payroll.findOne({ companyId, userId: callerUserId, month }).lean();
    let payrollRecord;

    if (existing && existing.status === 'finalized') {
      payrollRecord = {
        ...existing,
        name: user.name || user.username || user.userId,
        StaffId: user.StaffId || user.userId,
        department: user.department || 'General',
        isFinalized: true,
        isPaid: existing.paymentStatus === 'paid',
        isPartiallyPaid: existing.paymentStatus === 'partially_paid',
        pendingAmount: existing.pendingAmount || 0,
        amountPaid: existing.amountPaid || (existing.paymentStatus === 'paid' ? (existing.totalAmount || existing.netPayable) : 0),
      };
    } else {
      // Dynamic live preview for employee
      let settings = await PayrollSetting.findOne({ companyId }).lean();
      if (!settings) {
        settings = {
          workingHoursPerDay: 8,
          workingDaysPerWeek: 5,
          weeklyOffDays: [0, 6],
          hourlyDeductionPct: 50,
          hourlyOvertimePct: 75,
          approvedLeaveDeductionPct: 25,
          unapprovedLeaveDeductionPct: 100,
          payrollDivisorType: 'scheduled_hours',
          fixedPayrollDivisor: 200,
          dailyBasisType: 'scheduled_days',
        };
      }

      const holidays = await Holiday.find({
        companyId,
        date: { $regex: `^${month}` }
      }).lean();

      const attendances = await Attendance.find({
        companyId,
        userId: callerUserId,
        date: { $regex: `^${month}` }
      }).lean();

      const leaves = await Leave.find({
        companyId,
        userId: callerUserId,
        $or: [
          { startDate: { $regex: `^${month}` } },
          { endDate: { $regex: `^${month}` } },
        ]
      }).lean();

      const adjustments = await PayrollAdjustment.find({
        companyId,
        $or: [
          { userId: callerUserId },
          ...(user.StaffId ? [{ userId: user.StaffId }] : []),
          ...(mongoose.isValidObjectId(user._id) ? [{ userId: String(user._id) }] : [])
        ],
        month,
      }).lean();

      const calculated = calculateEmployeeMonthlyPayroll({
        user,
        month,
        settings,
        attendances,
        leaves,
        holidays,
        adjustments,
        referenceDate: new Date(),
      });

      payrollRecord = {
        ...calculated,
        _id: existing?._id,
        id: existing?.id,
        companyId,
        userId: callerUserId,
        StaffId: user.StaffId || callerUserId,
        name: user.name || user.username || callerUserId,
        department: user.department || 'General',
        status: 'draft',
        paymentStatus: 'unpaid',
        isFinalized: false,
        isPaid: false,
      };
    }

    // 2. Fetch payment transaction details if paid
    let transaction = null;
    if (payrollRecord.isPaid && payrollRecord._id) {
      transaction = await PaymentTransaction.findOne({ payrollId: payrollRecord._id }).lean();
    }

    // 3. List of months employee has finalized or paid records for history dropdown
    const historyPayrolls = await Payroll.find({
      companyId,
      userId: callerUserId,
    }).select('month status paymentStatus netPayable totalAmount paidAt').sort({ month: -1 }).lean();

    res.status(200).json({
      payroll: payrollRecord,
      transaction,
      history: historyPayrolls,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Helper: Recalculates and updates an existing Payroll record when adjustments change,
 * tracking amountPaid and pendingAmount for standalone bonus payments.
 */
export const syncPayrollWithAdjustments = async (companyId, userId, month, actor = null) => {
  try {
    const user = await User.findOne({
      $or: [{ userId }, { StaffId: userId }, ...(mongoose.isValidObjectId(userId) ? [{ _id: userId }] : [])],
      companyId,
    });
    if (!user) return null;

    const allAdjustments = await PayrollAdjustment.find({
      companyId,
      $or: [
        { userId: user.userId },
        ...(user.StaffId ? [{ userId: user.StaffId }] : []),
        ...(mongoose.isValidObjectId(user._id) ? [{ userId: String(user._id) }] : [])
      ],
      month,
    }).lean();

    const totalBonus = round2(
      allAdjustments.filter(a => a.type === 'bonus').reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
    );
    const totalManualDeduction = round2(
      allAdjustments.filter(a => a.type === 'deduction').reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
    );

    const transactions = await PaymentTransaction.find({
      companyId,
      $or: [
        { userId: user.userId },
        ...(user.StaffId ? [{ userId: user.StaffId }] : []),
        ...(mongoose.isValidObjectId(user._id) ? [{ userId: String(user._id) }] : [])
      ],
      month,
      status: 'completed',
    }).lean();

    const totalPaidFromTx = round2(transactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0));

    const payroll = await Payroll.findOne({
      companyId,
      $or: [
        { userId: user.userId },
        ...(user.StaffId ? [{ userId: user.StaffId }] : []),
        ...(mongoose.isValidObjectId(user._id) ? [{ userId: String(user._id) }] : [])
      ],
      month,
    });

    if (payroll) {
      let priorPaid = totalPaidFromTx;
      if (priorPaid === 0 && payroll.paymentStatus === 'paid') {
        priorPaid = (payroll.amountPaid && payroll.amountPaid > 0)
          ? payroll.amountPaid
          : (payroll.totalAmount || payroll.netPayable || 0);
      }

      payroll.bonus = totalBonus;
      payroll.manualDeduction = totalManualDeduction;
      payroll.totalAdditions = round2((payroll.hourlyOvertimeAddition || 0) + totalBonus);
      payroll.totalDeductions = round2(
        (payroll.hourlyShortfallDeduction || 0) +
        (payroll.approvedLeaveDeduction || 0) +
        (payroll.unapprovedLeaveDeduction || 0) +
        totalManualDeduction
      );
      payroll.grossPayable = round2((payroll.baseSalary || 0) + payroll.totalAdditions);
      payroll.totalAmount = Math.max(0, round2(payroll.grossPayable - payroll.totalDeductions));
      payroll.netPayable = payroll.totalAmount;

      payroll.amountPaid = priorPaid;
      payroll.pendingAmount = Math.max(0, round2(payroll.totalAmount - priorPaid));

      if (payroll.pendingAmount <= 0.01 && (priorPaid > 0 || payroll.paymentStatus === 'paid')) {
        payroll.paymentStatus = 'paid';
      } else if (priorPaid > 0 && payroll.pendingAmount > 0.01) {
        payroll.paymentStatus = 'partially_paid';
      }

      if (actor) {
        payroll.auditTrail.push({
          action: 'ADJUSTMENTS_SYNCED',
          performedBy: actor.userId || actor.username || 'admin',
          timestamp: new Date(),
          details: { totalBonus, totalManualDeduction, netPayable: payroll.netPayable, amountPaid: payroll.amountPaid, pendingAmount: payroll.pendingAmount }
        });
      }

      await payroll.save();

      emitToCompany('payroll:change', companyId, { action: 'updated', payrollId: payroll._id, month });
      emitToUser(user.userId, 'payroll:change', { action: 'updated', payrollId: payroll._id, month });
      return payroll;
    }
    return null;
  } catch (err) {
    console.error('Error syncing payroll with adjustments:', err);
    return null;
  }
};

/**
 * 8. Add Bonus or Deduction Adjustment for Employee
 */
export const addPayrollAdjustment = async (req, res) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    if (!isCompanyAdmin(req.user)) {
      return res.status(403).json({ message: 'Only company admins or owners can add adjustments' });
    }

    const { userId, month, type, amount, reason } = req.body;
    if (!userId) {
      return res.status(400).json({ message: 'Employee userId is required' });
    }
    if (!type || !['bonus', 'deduction'].includes(type)) {
      return res.status(400).json({ message: 'Valid type is required (bonus or deduction)' });
    }
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: 'Amount must be a positive number' });
    }

    const currentMonthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const adjMonth = (month || currentMonthStr).trim();

    // Verify employee belongs to company
    const user = await User.findOne({
      $or: [{ userId }, { StaffId: userId }, ...(mongoose.isValidObjectId(userId) ? [{ _id: userId }] : [])],
      companyId,
    });
    if (!user) {
      return res.status(404).json({ message: 'Employee not found in this company' });
    }

    const adjustment = await PayrollAdjustment.create({
      companyId,
      userId: user.userId,
      month: adjMonth,
      type,
      amount: round2(numericAmount),
      reason: reason ? String(reason).trim() : '',
      addedBy: req.user.userId,
      addedByName: req.user.name || req.user.username || req.user.userId,
    });

    // Synchronize and update the employee's payroll document if exists
    const updatedPayroll = await syncPayrollWithAdjustments(companyId, user.userId, adjMonth, req.user);

    // Send notification to employee
    try {
      const notifTitle = type === 'bonus' ? 'Bonus Added to Salary' : 'Salary Deduction Applied';
      const notifMsg = type === 'bonus'
        ? `A bonus of ₹${numericAmount.toLocaleString('en-IN')} has been added to your salary for ${adjMonth}${reason ? ` (${reason})` : ''}.${updatedPayroll?.paymentStatus === 'partially_paid' ? ' This bonus has been queued as a pending payout and can be disbursed.' : ''}`
        : `A deduction of ₹${numericAmount.toLocaleString('en-IN')} has been applied to your salary for ${adjMonth}${reason ? ` (${reason})` : ''}.`;

      const adjNotif = await Notification.create({
        id: `notif-adj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        userId: user.userId,
        companyId,
        title: notifTitle,
        message: notifMsg,
        type: type === 'bonus' ? 'bonus' : 'deduction',
        read: false,
        createdAt: new Date().toISOString(),
        metadata: {
          month: adjMonth,
          type,
          amount: numericAmount,
          reason,
          adjustmentId: adjustment._id,
        }
      });

      const targetUserIds = new Set([String(user.userId)]);
      if (user.StaffId) targetUserIds.add(String(user.StaffId));
      if (user._id) targetUserIds.add(String(user._id));
      targetUserIds.forEach(uid => {
        emitToUser(uid, 'notification:new', adjNotif);
      });
    } catch (notifErr) {
      console.warn('Failed to send adjustment notification:', notifErr.message);
    }

    res.status(201).json({
      message: `${type === 'bonus' ? 'Bonus' : 'Deduction'} of ₹${numericAmount.toLocaleString()} added successfully for ${user.name || user.username || user.userId}${updatedPayroll ? (updatedPayroll.paymentStatus === 'partially_paid' ? ' (Added as pending bonus to be paid later)' : '') : ''}`,
      adjustment,
      payroll: updatedPayroll,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * 9. Get Payroll Adjustments for Company / Month / User
 */
export const getPayrollAdjustments = async (req, res) => {
  try {
    const companyId = requireCompanyId(req, res, true);
    if (!companyId) {
      return res.status(200).json([]);
    }

    const { month, userId } = req.query;
    const filter = { companyId };
    if (month) filter.month = String(month).trim();
    if (userId) filter.userId = String(userId).trim();

    const adjustments = await PayrollAdjustment.find(filter).sort({ createdAt: -1 }).lean();
    res.status(200).json(adjustments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * 10. Delete Payroll Adjustment
 */
export const deletePayrollAdjustment = async (req, res) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    if (!isCompanyAdmin(req.user)) {
      return res.status(403).json({ message: 'Only company admins or owners can delete adjustments' });
    }

    const { id } = req.params;
    const deleted = await PayrollAdjustment.findOneAndDelete({ _id: id, companyId });
    if (!deleted) {
      return res.status(404).json({ message: 'Adjustment not found' });
    }

    // Synchronize and update the employee's payroll document after removal
    await syncPayrollWithAdjustments(companyId, deleted.userId, deleted.month, req.user);

    res.status(200).json({ message: 'Adjustment removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * 11. Helper to build detailed Payroll / Payment report data for day, week, month, or year
 */
export const buildPayrollReportData = async (companyId, { period = 'month', date, startDate, endDate, month, year, department, status, search }) => {
  const company = await Company.findById(companyId).select('name code email').lean();
  const companyName = company?.name || 'Company';

  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  let periodLabel = '';
  let reportItems = [];

  // Fetch all company users
  const users = await User.find({ companyId }).select('userId StaffId name username department designation salary').lean();
  const userMap = new Map();
  users.forEach(u => {
    if (u.userId) userMap.set(u.userId, u);
    if (u.StaffId) userMap.set(u.StaffId, u);
    userMap.set(String(u._id), u);
  });

  if (period === 'year') {
    const targetYear = (year || String(now.getFullYear())).trim();
    periodLabel = `Annual (${targetYear})`;

    // Fetch all payroll records for the year
    const yearPayrolls = await Payroll.find({
      companyId,
      month: { $regex: `^${targetYear}` }
    }).lean();

    // Fetch all adjustments for the year
    const yearAdjustments = await PayrollAdjustment.find({
      companyId,
      month: { $regex: `^${targetYear}` }
    }).lean();

    // Fetch all transactions for the year
    const yearTransactions = await PaymentTransaction.find({
      companyId,
      month: { $regex: `^${targetYear}` },
      status: 'completed'
    }).lean();

    const txPaidByUser = new Map();
    yearTransactions.forEach(t => {
      const uid = String(t.userId);
      txPaidByUser.set(uid, round2((txPaidByUser.get(uid) || 0) + Number(t.amount || 0)));
    });

    // Group annual summary per employee
    for (const u of users) {
      const uid = u.userId || u.StaffId || String(u._id);
      const empPayrolls = yearPayrolls.filter(p => p.userId === u.userId || p.userId === u.StaffId || p.userId === uid);
      const empAdjustments = yearAdjustments.filter(a => a.userId === u.userId || a.userId === u.StaffId || a.userId === uid);

      const totalBonus = round2(empAdjustments.filter(a => a.type === 'bonus').reduce((sum, a) => sum + Number(a.amount || 0), 0) +
        empPayrolls.reduce((sum, p) => sum + Number(p.bonus || 0), 0));
      const totalDeductions = round2(empPayrolls.reduce((sum, p) => sum + Number(p.totalDeductions || 0), 0));
      const totalNetPayable = round2(empPayrolls.reduce((sum, p) => sum + Number(p.totalAmount || p.netPayable || 0), 0));

      const txPaid = txPaidByUser.get(uid) || (u.userId !== uid ? txPaidByUser.get(u.userId) : 0) || 0;
      let amountPaid = txPaid;
      if (amountPaid === 0) {
        amountPaid = round2(empPayrolls.filter(p => p.paymentStatus === 'paid').reduce((sum, p) => sum + Number(p.amountPaid || p.totalAmount || p.netPayable || 0), 0));
      }
      const pendingAmount = Math.max(0, round2(totalNetPayable - amountPaid));

      let empPaymentStatus = 'unpaid';
      if (pendingAmount <= 0.01 && (amountPaid > 0 || empPayrolls.some(p => p.paymentStatus === 'paid'))) {
        empPaymentStatus = 'paid';
      } else if (amountPaid > 0 && pendingAmount > 0.01) {
        empPaymentStatus = 'partially_paid';
      }

      reportItems.push({
        period: targetYear,
        userId: uid,
        staffId: u.StaffId || uid,
        name: u.name || u.username || uid,
        department: u.department || 'General',
        designation: u.designation || 'Staff',
        baseSalary: round2((Number(u.salary) || 0) * 12),
        monthlyBaseSalary: Number(u.salary) || 0,
        amountPaid,
        pendingAmount,
        bonus: totalBonus,
        totalDeductions,
        totalAmount: totalNetPayable,
        paymentStatus: empPaymentStatus,
        monthsFinalized: empPayrolls.length,
      });
    }
  } else if (period === 'day' || period === 'week') {
    let start = date || todayStr;
    let end = date || todayStr;
    if (period === 'week') {
      start = startDate;
      end = endDate;
      if (!start || !end) {
        const d = new Date(now);
        const day = d.getDay();
        const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(d.setDate(diffToMon));
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        start = `${mon.getFullYear()}-${pad2(mon.getMonth() + 1)}-${pad2(mon.getDate())}`;
        end = `${sun.getFullYear()}-${pad2(sun.getMonth() + 1)}-${pad2(sun.getDate())}`;
      }
      periodLabel = `Week (${start} to ${end})`;
    } else {
      periodLabel = `Day (${start})`;
    }

    // Query payment transactions in date range
    const startIso = new Date(`${start}T00:00:00.000Z`);
    const endIso = new Date(`${end}T23:59:59.999Z`);
    const txs = await PaymentTransaction.find({
      companyId,
      paidAt: { $gte: startIso, $lte: endIso },
      status: 'completed',
    }).lean();

    const txPaidByUser = new Map();
    const txBonusByUser = new Map();
    txs.forEach(t => {
      const uid = String(t.userId);
      txPaidByUser.set(uid, round2((txPaidByUser.get(uid) || 0) + Number(t.amount || 0)));
      if (t.type === 'bonus') {
        txBonusByUser.set(uid, round2((txBonusByUser.get(uid) || 0) + Number(t.amount || 0)));
      }
    });

    const currentMonth = start.slice(0, 7);
    const monthPayrolls = await Payroll.find({ companyId, month: currentMonth }).lean();
    const monthPayrollsMap = new Map();
    monthPayrolls.forEach(p => {
      monthPayrollsMap.set(p.userId, p);
    });

    for (const u of users) {
      const uid = u.userId || u.StaffId || String(u._id);
      const paidInWindow = txPaidByUser.get(uid) || (u.userId !== uid ? txPaidByUser.get(u.userId) : 0) || 0;
      const bonusInWindow = txBonusByUser.get(uid) || (u.userId !== uid ? txBonusByUser.get(u.userId) : 0) || 0;
      const p = monthPayrollsMap.get(uid) || (u.userId !== uid ? monthPayrollsMap.get(u.userId) : null);

      const pendingAmount = p ? Math.max(0, round2((p.totalAmount || p.netPayable || 0) - (p.amountPaid || 0))) : 0;
      const baseSalary = Number(u.salary) || 0;

      let pStatus = 'unpaid';
      if (paidInWindow > 0 && pendingAmount <= 0.01) pStatus = 'paid';
      else if (paidInWindow > 0) pStatus = 'partially_paid';
      else if (p?.paymentStatus === 'paid') pStatus = 'paid';

      reportItems.push({
        period: period === 'day' ? start : `${start} to ${end}`,
        userId: uid,
        staffId: u.StaffId || uid,
        name: u.name || u.username || uid,
        department: u.department || 'General',
        designation: u.designation || 'Staff',
        baseSalary,
        amountPaid: paidInWindow,
        pendingAmount,
        bonus: bonusInWindow,
        totalDeductions: p ? (p.totalDeductions || 0) : 0,
        totalAmount: round2(paidInWindow + pendingAmount),
        paymentStatus: pStatus,
      });
    }
  } else {
    // Default: 'month'
    const targetMonth = (month || `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`).trim();
    periodLabel = `Month (${targetMonth})`;

    // Run monthly summary logic
    const reqMock = { companyId, user: { role: 'admin' }, query: { month: targetMonth, limit: 1000 } };
    let summaryData = null;
    const resMock = {
      status: () => ({
        json: (data) => { summaryData = data; }
      })
    };
    await getPayrollSummary(reqMock, resMock);

    if (summaryData && Array.isArray(summaryData.items)) {
      reportItems = summaryData.items.map(p => ({
        period: targetMonth,
        userId: p.userId,
        staffId: p.StaffId || p.userId,
        name: p.name,
        department: p.department || 'General',
        designation: p.designation || 'Staff',
        baseSalary: p.baseSalary || 0,
        amountPaid: p.amountPaid || 0,
        pendingAmount: p.pendingAmount !== undefined ? p.pendingAmount : (p.isPaid ? 0 : p.totalAmount),
        bonus: p.bonus || 0,
        totalDeductions: p.totalDeductions || 0,
        totalAmount: p.totalAmount !== undefined ? p.totalAmount : p.netPayable,
        paymentStatus: p.paymentStatus || (p.isPaid ? 'paid' : 'unpaid'),
      }));
    }
  }

  // Filter by department, status, search
  if (department && department !== 'all') {
    reportItems = reportItems.filter(r => (r.department || '').toLowerCase() === department.toLowerCase());
  }
  if (status && status !== 'all') {
    if (status === 'paid') reportItems = reportItems.filter(r => r.paymentStatus === 'paid');
    else if (status === 'pending') reportItems = reportItems.filter(r => r.paymentStatus === 'partially_paid' || r.paymentStatus === 'unpaid');
    else reportItems = reportItems.filter(r => r.paymentStatus === status);
  }
  if (search) {
    const q = search.toLowerCase();
    reportItems = reportItems.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.staffId || '').toLowerCase().includes(q) ||
      (r.userId || '').toLowerCase().includes(q)
    );
  }

  // Calculate Company-Wise Grand Totals
  const totalEmployees = reportItems.length;
  const companyOverallAmountPaid = round2(reportItems.reduce((sum, r) => sum + (Number(r.amountPaid) || 0), 0));
  const companyOverallPendingAmount = round2(reportItems.reduce((sum, r) => sum + (Number(r.pendingAmount) || 0), 0));
  const companyOverallBonuses = round2(reportItems.reduce((sum, r) => sum + (Number(r.bonus) || 0), 0));
  const companyOverallDeductions = round2(reportItems.reduce((sum, r) => sum + (Number(r.totalDeductions) || 0), 0));
  const companyOverallBaseSalary = round2(reportItems.reduce((sum, r) => sum + (Number(r.baseSalary) || 0), 0));
  const companyTotalNetPayable = round2(reportItems.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0));

  const fullyPaidEmployees = reportItems.filter(r => r.paymentStatus === 'paid').length;
  const pendingEmployees = reportItems.filter(r => r.paymentStatus !== 'paid').length;

  // Build CSV content
  const csvHeaders = ['Period', 'Employee ID', 'Name', 'Department', 'Designation', 'Base Salary (INR)', 'Amount Paid (INR)', 'Pending Payment (INR)', 'Bonus (INR)', 'Total Deductions (INR)', 'Net Payable (INR)', 'Payment Status'];
  const csvRows = reportItems.map(r => [
    r.period,
    r.staffId,
    `"${(r.name || '').replace(/"/g, '""')}"`,
    `"${(r.department || '').replace(/"/g, '""')}"`,
    `"${(r.designation || '').replace(/"/g, '""')}"`,
    r.baseSalary,
    r.amountPaid,
    r.pendingAmount,
    r.bonus,
    r.totalDeductions,
    r.totalAmount,
    r.paymentStatus,
  ].join(','));

  // Company summary row at bottom of CSV
  const summaryRow = [
    `"TOTAL / COMPANY SUMMARY"`,
    `"--"`,
    `"ALL EMPLOYEES"`,
    `"--"`,
    `"--"`,
    companyOverallBaseSalary,
    companyOverallAmountPaid,
    companyOverallPendingAmount,
    companyOverallBonuses,
    companyOverallDeductions,
    companyTotalNetPayable,
    `"Disbursed: ${fullyPaidEmployees} | Due: ${pendingEmployees}"`,
  ].join(',');

  const csvContent = [
    `# ${companyName} - Official Company Payment & Payroll Report`,
    `# Period: ${periodLabel}`,
    `# Generated on: ${new Date().toLocaleString()}`,
    `# COMPANY GRAND TOTALS: Amount Paid: INR ${companyOverallAmountPaid.toLocaleString()} | Pending: INR ${companyOverallPendingAmount.toLocaleString()} | Total Bonus: INR ${companyOverallBonuses.toLocaleString()}`,
    '',
    csvHeaders.join(','),
    ...csvRows,
    '',
    summaryRow,
  ].join('\n');

  return {
    companyName,
    period,
    periodLabel,
    totalEmployees,
    fullyPaidEmployees,
    pendingEmployees,
    companyOverallAmountPaid,
    companyOverallPendingAmount,
    companyOverallBonuses,
    companyOverallDeductions,
    companyOverallBaseSalary,
    companyTotalNetPayable,
    records: reportItems,
    csvContent,
  };
};

/**
 * 12. Controller: Get Payment / Payroll Report
 */
export const getPayrollReport = async (req, res) => {
  try {
    const companyId = requireCompanyId(req, res, true);
    if (!companyId) {
      return res.status(200).json({ rows: [], totals: {} });
    }

    const report = await buildPayrollReportData(companyId, req.query);
    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * 13. Controller: Send Payment / Payroll Report via Email
 */
export const sendPayrollReport = async (req, res) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const { recipientEmail, notes, ...filterParams } = req.body;
    if (!recipientEmail || !recipientEmail.trim()) {
      return res.status(400).json({ message: 'Recipient email is required' });
    }

    const report = await buildPayrollReportData(companyId, filterParams);

    const summaryMetrics = [
      { label: 'Company Total Paid', value: `₹${report.companyOverallAmountPaid.toLocaleString()}` },
      { label: 'Company Total Pending', value: `₹${report.companyOverallPendingAmount.toLocaleString()}` },
      { label: 'Total Bonuses Disbursed', value: `+₹${report.companyOverallBonuses.toLocaleString()}` },
      { label: 'Total Deductions', value: `-₹${report.companyOverallDeductions.toLocaleString()}` },
      { label: 'Eligible Staff Count', value: `${report.totalEmployees}` },
      { label: 'Fully Settled Staff', value: `${report.fullyPaidEmployees} / ${report.totalEmployees}` },
    ];

    const filename = `Payment_Report_${report.companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${report.periodLabel.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;

    const mailResult = await sendReportEmail({
      to: recipientEmail.trim(),
      subject: `Payment & Payroll Report - ${report.companyName} (${report.periodLabel})`,
      companyName: report.companyName,
      reportType: 'Payment & Payroll Report',
      periodLabel: report.periodLabel,
      summaryMetrics,
      notes: notes ? String(notes).trim() : '',
      csvContent: report.csvContent,
      filename,
    });

    res.status(200).json({
      message: mailResult.simulated
        ? `Payment report prepared for ${recipientEmail} (Simulated send: SMTP not configured)`
        : `Payment report successfully sent to ${recipientEmail}`,
      mailResult,
      summary: {
        companyOverallAmountPaid: report.companyOverallAmountPaid,
        companyOverallPendingAmount: report.companyOverallPendingAmount,
        companyOverallBonuses: report.companyOverallBonuses,
        periodLabel: report.periodLabel,
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

