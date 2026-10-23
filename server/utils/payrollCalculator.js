/**
 * Production-Quality Payroll Calculator for Regenai
 * Decimal-safe arithmetic with round-to-2 decimal places
 */

export const round2 = (num) => {
  const n = Number(num);
  if (isNaN(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Derives weekly off days from workingDaysPerWeek if not explicitly provided
 */
export const getWeeklyOffDays = (workingDaysPerWeek = 5, configuredWeeklyOffs = null) => {
  if (Array.isArray(configuredWeeklyOffs) && configuredWeeklyOffs.length > 0) {
    return configuredWeeklyOffs;
  }
  const days = Number(workingDaysPerWeek) || 5;
  if (days <= 4) return [0, 5, 6]; // Sun, Fri, Sat off
  if (days === 5) return [0, 6];    // Sun, Sat off
  if (days === 6) return [0];       // Sun off
  return [];                        // 7 days = no weekly off
};

/**
 * Parses time string (e.g. "09:30" or ISO timestamp) to minutes from midnight
 */
export const parseTimeToMinutes = (timeVal) => {
  if (!timeVal) return null;
  const s = String(timeVal).trim();
  if (s.includes('T')) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.getHours() * 60 + d.getMinutes() + (d.getSeconds() / 60);
    }
  }
  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    return Number(match[1]) * 60 + Number(match[2]);
  }
  return null;
};

/**
 * Calculates actual hours between check-in and check-out safely.
 * Handles overnight shifts and fractional hours.
 */
export const calculateWorkedHours = (checkInStr, checkOutStr, status = 'present', defaultWorkingHours = 8) => {
  if (!checkInStr && !checkOutStr) {
    if (status === 'half_day') return round2(defaultWorkingHours / 2);
    return 0;
  }

  if (checkInStr && !checkOutStr) {
    if (status === 'half_day') return round2(defaultWorkingHours / 2);
    return 0; // Incomplete attendance or ongoing
  }

  // Parse as Dates if ISO or timestamp strings
  const inDate = new Date(checkInStr);
  const outDate = new Date(checkOutStr);

  if (!isNaN(inDate.getTime()) && !isNaN(outDate.getTime())) {
    let diffMs = outDate.getTime() - inDate.getTime();
    if (diffMs < 0) {
      // Overnight shift on same day timestamp (e.g. checkOut next day)
      diffMs += 24 * 60 * 60 * 1000;
    }
    const hours = diffMs / (1000 * 60 * 60);
    return round2(Math.max(0, hours));
  }

  // Fallback: check time strings e.g. "09:30" and "18:30"
  const inMinutes = parseTimeToMinutes(checkInStr);
  const outMinutes = parseTimeToMinutes(checkOutStr);

  if (inMinutes !== null && outMinutes !== null) {
    let diff = outMinutes - inMinutes;
    if (diff < 0) diff += 24 * 60; // Overnight
    return round2(Math.max(0, diff / 60));
  }

  if (status === 'half_day') return round2(defaultWorkingHours / 2);
  return 0;
};

/**
 * Main Payroll Calculation Engine
 * 
 * @param {Object} params
 * @param {Object} params.user Employee User document
 * @param {string} params.month Format 'YYYY-MM' (e.g. '2026-10')
 * @param {Object} params.settings Company PayrollSetting document or plain object
 * @param {Array} params.attendances Attendance records for this user in this month
 * @param {Array} params.leaves Leave requests for this user
 * @param {Array} params.holidays Company holidays for this month
 * @param {Date} [params.referenceDate] Current reference date (defaults to new Date())
 * @returns {Object} Complete payroll calculation result with transparent day-by-day breakdown
 */
export const calculateEmployeeMonthlyPayroll = ({
  user,
  month,
  settings = {},
  attendances = [],
  leaves = [],
  holidays = [],
  adjustments = [],
  referenceDate = new Date(),
}) => {
  const [yearStr, monthStr] = (month || '').split('-');
  const year = Number(yearStr) || referenceDate.getFullYear();
  const monthNum = Number(monthStr) || (referenceDate.getMonth() + 1);

  // Reference date YYYY-MM-DD
  const refIso = referenceDate.toISOString().slice(0, 10);

  // Month boundary
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const pad2 = (n) => String(n).padStart(2, '0');

  // Company Settings & Rules
  const workingHoursPerDay = Number(settings.workingHoursPerDay) || 8;
  const workingDaysPerWeek = Number(settings.workingDaysPerWeek) || 5;
  const weeklyOffDays = getWeeklyOffDays(workingDaysPerWeek, settings.weeklyOffDays);
  const hourlyDeductionPct = Number(settings.hourlyDeductionPct) >= 0 ? Number(settings.hourlyDeductionPct) : 50;
  const hourlyOvertimePct = Number(settings.hourlyOvertimePct) >= 0 ? Number(settings.hourlyOvertimePct) : 75;
  const approvedLeaveDeductionPct = Number(settings.approvedLeaveDeductionPct) >= 0 ? Number(settings.approvedLeaveDeductionPct) : 25;
  const unapprovedLeaveDeductionPct = Number(settings.unapprovedLeaveDeductionPct) >= 0 ? Number(settings.unapprovedLeaveDeductionPct) : 100;
  const payrollDivisorType = settings.payrollDivisorType || 'scheduled_hours';
  const fixedPayrollDivisor = Number(settings.fixedPayrollDivisor) || 200;
  const dailyBasisType = settings.dailyBasisType || 'scheduled_days';

  // Employee Salary
  const monthlySalary = Number(user?.salary) || 0;

  // Build lookups
  // 1. Holiday lookup by date (YYYY-MM-DD)
  const holidayMap = new Map();
  holidays.forEach(h => {
    if (h.date) holidayMap.set(h.date, h.name || 'Holiday');
  });

  // 2. Attendance lookup by date (YYYY-MM-DD)
  const attendanceMap = new Map();
  attendances.forEach(a => {
    if (a.date) {
      // If multiple records, pick the one with checkOut, or earliest
      if (!attendanceMap.has(a.date) || (!attendanceMap.get(a.date).checkOut && a.checkOut)) {
        attendanceMap.set(a.date, a);
      }
    }
  });

  // 3. Leaves lookup: check if any approved or pending leave covers the date
  const isDateInLeave = (dateIso) => {
    for (const l of leaves) {
      if (l.startDate && l.endDate) {
        if (dateIso >= l.startDate && dateIso <= l.endDate) {
          return l;
        }
      }
    }
    return null;
  };

  // First pass: Determine scheduled working days and hours for the month
  let scheduledWorkingDaysCount = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const isoDate = `${year}-${pad2(monthNum)}-${pad2(day)}`;
    const d = new Date(year, monthNum - 1, day);
    const dayOfWeek = d.getDay();
    const isHoliday = holidayMap.has(isoDate);
    const isWeeklyOff = weeklyOffDays.includes(dayOfWeek);
    if (!isHoliday && !isWeeklyOff) {
      scheduledWorkingDaysCount++;
    }
  }

  // Divisor and Rate Derivations
  const scheduledWorkingHours = round2(scheduledWorkingDaysCount * workingHoursPerDay);
  const payrollDivisor = payrollDivisorType === 'fixed_hours'
    ? fixedPayrollDivisor
    : (scheduledWorkingHours > 0 ? scheduledWorkingHours : 1);

  const hourlyDeductionRate = round2((monthlySalary * (hourlyDeductionPct / 100)) / (payrollDivisor || 1));
  const hourlyOvertimeRate = round2((monthlySalary * (hourlyOvertimePct / 100)) / (payrollDivisor || 1));

  const dailySalaryBasis = dailyBasisType === 'calendar_days'
    ? round2(monthlySalary / (daysInMonth || 1))
    : round2(monthlySalary / (scheduledWorkingDaysCount || 1));

  // Second pass: Calculate daily breakdown
  const dailyBreakdown = [];
  let totalActualHours = 0;
  let totalShortfallHours = 0;
  let totalOvertimeHours = 0;
  let totalApprovedLeaveDays = 0;
  let totalUnapprovedLeaveDays = 0;
  let totalPresentDays = 0;
  let totalHolidayDays = 0;
  let totalWeeklyOffDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const isoDate = `${year}-${pad2(monthNum)}-${pad2(day)}`;
    const d = new Date(year, monthNum - 1, day);
    const dayOfWeek = d.getDay();
    const dayName = DAY_NAMES[dayOfWeek];
    const isFuture = isoDate > refIso;
    const isHoliday = holidayMap.has(isoDate);
    const holidayName = isHoliday ? holidayMap.get(isoDate) : null;
    const isWeeklyOff = weeklyOffDays.includes(dayOfWeek);

    const item = {
      date: isoDate,
      dayOfWeek,
      dayName,
      isHoliday,
      holidayName,
      isWeeklyOff,
      isApprovedLeave: false,
      isUnapprovedLeave: false,
      isPresent: false,
      isFuture,
      checkIn: null,
      checkOut: null,
      requiredHours: 0,
      actualHours: 0,
      shortfallHours: 0,
      overtimeHours: 0,
      shortfallDeduction: 0,
      overtimeAddition: 0,
      leaveDeduction: 0,
      notes: '',
    };

    if (isHoliday) {
      totalHolidayDays++;
      item.notes = `Holiday: ${holidayName}`;
      dailyBreakdown.push(item);
      continue;
    }

    if (isWeeklyOff) {
      totalWeeklyOffDays++;
      item.notes = 'Weekly Off';
      dailyBreakdown.push(item);
      continue;
    }

    // Normal working day
    item.requiredHours = workingHoursPerDay;

    const att = attendanceMap.get(isoDate);
    const leave = isDateInLeave(isoDate);

    if (att) {
      // Employee attended or attempted check-in
      item.checkIn = att.checkIn || null;
      item.checkOut = att.checkOut || null;
      item.isPresent = true;
      totalPresentDays++;

      item.breakMinutes = Number(att.breakMinutes) || 0;
      item.breakDelayMinutes = Number(att.breakDelayMinutes) || 0;
      item.casualBreakMinutes = Number(att.casualBreakMinutes) || 0;
      item.casualBreakDelayMinutes = Number(att.casualBreakDelayMinutes) || 0;
      item.totalBreakDelayMinutes = Number(att.totalBreakDelayMinutes) || (item.breakDelayMinutes + item.casualBreakDelayMinutes);
      item.breakDeduction = Number(att.breakDeduction) || 0;

      const workedHours = calculateWorkedHours(att.checkIn, att.checkOut, att.status, workingHoursPerDay);
      item.actualHours = workedHours;
      totalActualHours = round2(totalActualHours + workedHours);

      // Compare actual vs required
      if (workedHours >= workingHoursPerDay) {
        const ot = round2(workedHours - workingHoursPerDay);
        item.overtimeHours = ot;
        item.shortfallHours = 0;
        item.overtimeAddition = round2(ot * hourlyOvertimeRate);
        item.shortfallDeduction = 0;
        totalOvertimeHours = round2(totalOvertimeHours + ot);
        item.notes = ot > 0 ? `Overtime +${ot}h` : 'On Time / Full Day';
      } else {
        // Less than required
        if (!att.checkOut && !isFuture && att.status !== 'half_day') {
          // Missing checkout in past
          item.notes = 'Missing check-out (incomplete)';
        } else if (att.status === 'half_day') {
          item.notes = 'Half Day attendance';
        }
        const sf = round2(workingHoursPerDay - workedHours);
        item.shortfallHours = sf;
        item.overtimeHours = 0;
        item.shortfallDeduction = round2(sf * hourlyDeductionRate);
        item.overtimeAddition = 0;
        totalShortfallHours = round2(totalShortfallHours + sf);
        if (!item.notes) item.notes = `Shortfall -${sf}h`;
      }
    } else {
      // No attendance logged
      if (leave && leave.status === 'approved') {
        item.isApprovedLeave = true;
        totalApprovedLeaveDays++;
        item.leaveDeduction = round2(dailySalaryBasis * (approvedLeaveDeductionPct / 100));
        item.notes = `Approved Leave (${leave.type || 'leave'})`;
      } else if (!isFuture) {
        // Date is in the past with no attendance and no approved leave
        item.isUnapprovedLeave = true;
        totalUnapprovedLeaveDays++;
        item.leaveDeduction = round2(dailySalaryBasis * (unapprovedLeaveDeductionPct / 100));
        item.notes = leave ? `Unapproved Leave (${leave.status})` : 'Unapproved Absence';
      } else {
        // Future scheduled day in current month
        item.isFuture = true;
        item.notes = 'Scheduled working day';
      }
    }

    dailyBreakdown.push(item);
  }

  // Monthly totals
  const bonus = round2(
    adjustments.filter(a => a.type === 'bonus').reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
  );
  const manualDeduction = round2(
    adjustments.filter(a => a.type === 'deduction').reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
  );

  const hourlyShortfallDeduction = round2(totalShortfallHours * hourlyDeductionRate);
  const hourlyOvertimeAddition = round2(totalOvertimeHours * hourlyOvertimeRate);
  const approvedLeaveDeduction = round2(totalApprovedLeaveDays * dailySalaryBasis * (approvedLeaveDeductionPct / 100));
  const unapprovedLeaveDeduction = round2(totalUnapprovedLeaveDays * dailySalaryBasis * (unapprovedLeaveDeductionPct / 100));
  const otherAdjustments = 0;

  const totalBreakDeduction = round2(
    dailyBreakdown.reduce((sum, item) => sum + (Number(item.breakDeduction) || 0), 0)
  );
  const totalBreakDelayMinutes = dailyBreakdown.reduce(
    (sum, item) => sum + (Number(item.totalBreakDelayMinutes) || 0), 
    0
  );

  const totalDeductions = round2(hourlyShortfallDeduction + approvedLeaveDeduction + unapprovedLeaveDeduction + manualDeduction + totalBreakDeduction);
  const totalAdditions = round2(hourlyOvertimeAddition + bonus + otherAdjustments);
  const grossPayable = round2(monthlySalary + totalAdditions);
  const totalAmount = Math.max(0, round2(grossPayable - totalDeductions));
  const netPayable = totalAmount; // alias for compatibility
  const excessDeduction = totalDeductions > grossPayable ? round2(totalDeductions - grossPayable) : 0;

  return {
    month,
    userId: user.userId || user.StaffId || String(user._id),
    name: user.name || user.username || user.userId,
    designation: user.designation || 'Staff',
    department: user.department || 'General',
    baseSalary: monthlySalary,
    scheduledWorkingDays: scheduledWorkingDaysCount,
    scheduledWorkingHours,
    actualWorkingHours: totalActualHours,
    shortfallHours: totalShortfallHours,
    overtimeHours: totalOvertimeHours,
    approvedLeaveDays: totalApprovedLeaveDays,
    unapprovedLeaveDays: totalUnapprovedLeaveDays,
    holidayDays: totalHolidayDays,
    weeklyOffDays: totalWeeklyOffDays,
    presentDays: totalPresentDays,
    payrollDivisor,
    hourlyDeductionRate,
    hourlyOvertimeRate,
    dailySalaryBasis,
    hourlyShortfallDeduction,
    hourlyOvertimeAddition,
    approvedLeaveDeduction,
    unapprovedLeaveDeduction,
    bonus,
    manualDeduction,
    totalBreakDelayMinutes,
    totalBreakDeduction,
    otherAdjustments,
    grossPayable,
    totalDeductions,
    totalAdditions,
    totalAmount,
    netPayable,
    excessDeduction,
    snapshotSettings: {
      workingHoursPerDay,
      workingDaysPerWeek,
      weeklyOffDays,
      hourlyDeductionPct,
      hourlyOvertimePct,
      approvedLeaveDeductionPct,
      unapprovedLeaveDeductionPct,
      payrollDivisorType,
      fixedPayrollDivisor,
      dailyBasisType,
    },
    dailyBreakdown,
  };
};

export default {
  round2,
  getWeeklyOffDays,
  parseTimeToMinutes,
  calculateWorkedHours,
  calculateEmployeeMonthlyPayroll,
};
