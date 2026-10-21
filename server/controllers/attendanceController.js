import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import mongoose from 'mongoose';
import { resolveCompanyId } from '../utils/resolveCompanyId.js';
import { emitToCompany, emitToUser, getIO } from '../socket.js';
import { calculateWorkedHours, round2 } from '../utils/payrollCalculator.js';
import { sendReportEmail } from '../utils/mailer.js';

export const recordAttendance = async (req, res) => {
  try {
    const body = { ...req.body };
    if (!body.id) body.id = new mongoose.Types.ObjectId().toString();
    const validStatuses = ['present', 'absent', 'late', 'half_day'];
    if (body.status && typeof body.status === 'object') {
      body.status = Object.keys(body.status)[0];
    }
    if (!validStatuses.includes(body.status)) {
      body.status = 'present';
    }
    body.companyId = await resolveCompanyId(req, body);
    const attendance = new Attendance(body);
    await attendance.save();

    emitToCompany('attendance:change', attendance.companyId, { action: 'create', id: attendance.id, attendance });
    emitToCompany('payroll:change', attendance.companyId, { action: 'attendance_updated', userId: attendance.userId });
    if (attendance.userId) {
      emitToUser(attendance.userId, 'attendance:change', { action: 'create', id: attendance.id, attendance });
    }
    const io = getIO();
    if (io) {
      io.emit('attendance:change', { action: 'create', id: attendance.id, companyId: attendance.companyId, userId: attendance.userId });
    }

    res.status(201).json(attendance);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getAllAttendance = async (req, res) => {
  try {
    const filter = req.companyId ? { companyId: req.companyId } : {};
    const attendance = await Attendance.find(filter);
    res.status(200).json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUserAttendance = async (req, res) => {
  try {
    const filter = { userId: req.params.userId };
    if (req.companyId) filter.companyId = req.companyId;
    const attendance = await Attendance.find(filter);
    res.status(200).json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateAttendance = async (req, res) => {
  try {
    const id = req.body.id || req.params.id;
    const filter = mongoose.isValidObjectId(id) ? { $or: [{ id }, { _id: id }] } : { id };
    if (req.companyId) filter.companyId = req.companyId;
    const updateData = { ...req.body };
    const validStatuses = ['present', 'absent', 'late', 'half_day'];
    if (updateData.status) {
      if (typeof updateData.status === 'object') {
        updateData.status = Object.keys(updateData.status)[0];
      }
      if (!validStatuses.includes(updateData.status)) {
        delete updateData.status;
      }
    }
    const attendance = await Attendance.findOneAndUpdate(filter, updateData, { new: true });
    if (!attendance) return res.status(404).json({ message: 'Attendance not found' });

    emitToCompany('attendance:change', attendance.companyId, { action: 'update', id: attendance.id, attendance });
    emitToCompany('payroll:change', attendance.companyId, { action: 'attendance_updated', userId: attendance.userId });
    if (attendance.userId) {
      emitToUser(attendance.userId, 'attendance:change', { action: 'update', id: attendance.id, attendance });
    }
    const io = getIO();
    if (io) {
      io.emit('attendance:change', { action: 'update', id: attendance.id, companyId: attendance.companyId, userId: attendance.userId });
    }

    res.status(200).json(attendance);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * Helper to build attendance report items and summary metrics for day, week, month, or year
 */
export const buildAttendanceReportData = async (companyId, { period = 'month', date, startDate, endDate, month, year, department, status, search }) => {
  const query = { companyId };

  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  let periodLabel = '';

  if (period === 'day') {
    const targetDate = (date || todayStr).trim();
    query.date = targetDate;
    periodLabel = `Day (${targetDate})`;
  } else if (period === 'week') {
    let start = startDate;
    let end = endDate;
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
    query.date = { $gte: start, $lte: end };
    periodLabel = `Week (${start} to ${end})`;
  } else if (period === 'year') {
    const targetYear = (year || String(now.getFullYear())).trim();
    query.date = { $regex: `^${targetYear}` };
    periodLabel = `Year (${targetYear})`;
  } else {
    // Default: 'month'
    const targetMonth = (month || `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`).trim();
    query.date = { $regex: `^${targetMonth}` };
    periodLabel = `Month (${targetMonth})`;
  }

  // Fetch company details
  const company = await Company.findById(companyId).select('name code email').lean();
  const companyName = company?.name || 'Company';

  // Fetch all company users for employee metadata mapping
  const users = await User.find({ companyId }).select('userId StaffId name username department designation').lean();
  const userMap = new Map();
  users.forEach(u => {
    if (u.userId) userMap.set(u.userId, u);
    if (u.StaffId) userMap.set(u.StaffId, u);
    userMap.set(String(u._id), u);
  });

  // Query raw attendance records
  let records = await Attendance.find(query).sort({ date: -1, checkIn: 1 }).lean();

  const formatTimeDisplay = (timeStr) => {
    if (!timeStr) return '--';
    if (timeStr.includes('T')) {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    return timeStr;
  };

  // Map enriched rows
  let rows = records.map(r => {
    const u = userMap.get(r.userId) || {};
    const workedHours = calculateWorkedHours(r.checkIn, r.checkOut, r.status, 8);
    const staffId = u.StaffId || r.userId;
    const name = u.name || u.username || r.userId;
    const dept = u.department || 'General';
    const desig = u.designation || 'Staff';

    return {
      id: r.id || String(r._id),
      date: r.date,
      userId: r.userId,
      staffId,
      name,
      department: dept,
      designation: desig,
      status: r.status || 'present',
      checkIn: r.checkIn || null,
      checkOut: r.checkOut || null,
      checkInDisplay: formatTimeDisplay(r.checkIn),
      checkOutDisplay: formatTimeDisplay(r.checkOut),
      workingHours: workedHours,
      workMode: r.workMode || 'office',
      location: r.location || 'Main Office',
      notes: r.notes || '',
    };
  });

  // Filter by department, status, or search
  if (department && department !== 'all') {
    rows = rows.filter(r => (r.department || '').toLowerCase() === department.toLowerCase());
  }
  if (status && status !== 'all') {
    rows = rows.filter(r => (r.status || '').toLowerCase() === status.toLowerCase());
  }
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.staffId || '').toLowerCase().includes(q) ||
      (r.userId || '').toLowerCase().includes(q)
    );
  }

  // Compute Summary Statistics
  const totalRecords = rows.length;
  const totalWorkingHours = round2(rows.reduce((sum, r) => sum + r.workingHours, 0));
  const averageDailyHours = totalRecords > 0 ? round2(totalWorkingHours / totalRecords) : 0;
  const presentCount = rows.filter(r => r.status === 'present').length;
  const lateCount = rows.filter(r => r.status === 'late').length;
  const halfDayCount = rows.filter(r => r.status === 'half_day').length;
  const absentCount = rows.filter(r => r.status === 'absent').length;
  const uniqueEmployees = new Set(rows.map(r => r.userId)).size;

  // Build CSV content
  const csvHeaders = ['Date', 'Employee ID', 'Name', 'Department', 'Designation', 'Status', 'Check In', 'Check Out', 'Working Hours', 'Work Mode', 'Location', 'Notes'];
  const csvRows = rows.map(r => [
    r.date,
    r.staffId,
    `"${(r.name || '').replace(/"/g, '""')}"`,
    `"${(r.department || '').replace(/"/g, '""')}"`,
    `"${(r.designation || '').replace(/"/g, '""')}"`,
    r.status,
    `"${r.checkInDisplay}"`,
    `"${r.checkOutDisplay}"`,
    r.workingHours,
    r.workMode,
    `"${(r.location || '').replace(/"/g, '""')}"`,
    `"${(r.notes || '').replace(/"/g, '""')}"`,
  ].join(','));

  const csvContent = [
    `# ${companyName} - Official Attendance Report`,
    `# Period: ${periodLabel}`,
    `# Generated: ${new Date().toLocaleString()}`,
    `# Summary: Total Shifts: ${totalRecords} | Total Hours: ${totalWorkingHours}h | Unique Staff: ${uniqueEmployees}`,
    '',
    csvHeaders.join(','),
    ...csvRows,
  ].join('\n');

  return {
    companyName,
    period,
    periodLabel,
    totalRecords,
    totalWorkingHours,
    averageDailyHours,
    presentCount,
    lateCount,
    halfDayCount,
    absentCount,
    uniqueEmployees,
    records: rows,
    csvContent,
  };
};

/**
 * Controller: Get Attendance Report (JSON + CSV)
 */
export const getAttendanceReport = async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(400).json({ message: 'Company context required' });

    const report = await buildAttendanceReportData(companyId, req.query);
    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Controller: Send Attendance Report via Email
 */
export const sendAttendanceReport = async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(400).json({ message: 'Company context required' });

    const { recipientEmail, notes, ...filterParams } = req.body;
    if (!recipientEmail || !recipientEmail.trim()) {
      return res.status(400).json({ message: 'Recipient email is required' });
    }

    const report = await buildAttendanceReportData(companyId, filterParams);

    const summaryMetrics = [
      { label: 'Total Working Hours', value: `${report.totalWorkingHours}h` },
      { label: 'Average Daily Hours', value: `${report.averageDailyHours}h` },
      { label: 'Total Attendances', value: `${report.totalRecords}` },
      { label: 'Active Employees', value: `${report.uniqueEmployees}` },
      { label: 'Present / Full-Day', value: `${report.presentCount}` },
      { label: 'Late / Half-Day / Absent', value: `${report.lateCount + report.halfDayCount + report.absentCount}` },
    ];

    const filename = `Attendance_Report_${report.companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${report.periodLabel.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;

    const mailResult = await sendReportEmail({
      to: recipientEmail.trim(),
      subject: `Attendance Report - ${report.companyName} (${report.periodLabel})`,
      companyName: report.companyName,
      reportType: 'Attendance Report',
      periodLabel: report.periodLabel,
      summaryMetrics,
      notes: notes ? String(notes).trim() : '',
      csvContent: report.csvContent,
      filename,
    });

    res.status(200).json({
      message: mailResult.simulated
        ? `Attendance report prepared for ${recipientEmail} (Simulated send: SMTP not configured)`
        : `Attendance report successfully sent to ${recipientEmail}`,
      mailResult,
      summary: {
        totalRecords: report.totalRecords,
        totalWorkingHours: report.totalWorkingHours,
        periodLabel: report.periodLabel,
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
