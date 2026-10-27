import Task from '../models/Task.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import { resolveCompanyId } from '../utils/resolveCompanyId.js';
import { emitToCompany } from '../socket.js';
import { sendReportEmail } from '../utils/mailer.js';

export const createTask = async (req, res) => {
  try {
    const body = { ...req.body };
    body.companyId = await resolveCompanyId(req, body);
    const task = new Task(body);
    await task.save();
    emitToCompany('task:change', task.companyId, { action: 'create', id: task.id });
    if (task.assignedTo) {
      try {
        const notificationPayload = {
          id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          userId: task.assignedTo,
          companyId: task.companyId,
          title: 'New Task Assigned',
          message: `You have been assigned: ${task.title}`,
          createdAt: new Date().toISOString(),
          read: false
        };
        const { default: Notification } = await import('../models/Notification.js');
        const n = new Notification(notificationPayload);
        await n.save();
      } catch (e) {
        console.error(e);
      }
    }
    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const isTaskExpired = (task) => {
  if (!task) return false;
  if (task.status === 'done' || task.status === 'completed') return false;
  if (task.status === 'not_completed' || task.status === 'notCompleted') return true;

  const timeStr = task.dueTime || task.endTime;
  const endDateStr = task.endDate || task.dueDate;

  // 1. Explicit End Date + End Time
  if (endDateStr && timeStr) {
    const [hh, mm] = timeStr.split(':');
    const datePart = endDateStr.includes('T') ? endDateStr.split('T')[0] : endDateStr;
    const d = new Date(datePart + 'T00:00:00');
    d.setHours(parseInt(hh || 0, 10), parseInt(mm || 0, 10), 0, 0);
    if (!isNaN(d.getTime())) {
      return Date.now() > d.getTime();
    }
  }

  // 2. Duration in minutes
  if (task.durationUnit === 'minutes' && Number(task.durationValue) > 0) {
    const base = task.createdAt ? new Date(task.createdAt) : (task.startDate ? new Date(task.startDate) : null);
    if (base && !isNaN(base.getTime())) {
      const deadline = new Date(base.getTime() + Number(task.durationValue) * 60 * 1000);
      return Date.now() > deadline.getTime();
    }
  }

  // 3. Duration in hours
  if (task.durationUnit === 'hours' && Number(task.durationValue) > 0) {
    const base = task.createdAt ? new Date(task.createdAt) : (task.startDate ? new Date(task.startDate) : null);
    if (base && !isNaN(base.getTime())) {
      const deadline = new Date(base.getTime() + Number(task.durationValue) * 3600 * 1000);
      return Date.now() > deadline.getTime();
    }
  }

  // 4. End Date only (default end of day)
  if (endDateStr) {
    const datePart = endDateStr.includes('T') ? endDateStr.split('T')[0] : endDateStr;
    const parts = datePart.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day, 23, 59, 59, 999);
      if (!isNaN(d.getTime())) {
        return Date.now() > d.getTime();
      }
    }
  }

  return false;
};

export const getAllTasks = async (req, res) => {
  try {
    const isEmsView = req.headers['x-portal-view'] === 'ems' || req.query.portalView === 'ems';
    const isSuperAdmin = req.user?.role === 'param' || req.user?.role === 'admin';
    const filter = (isSuperAdmin && !isEmsView) ? {} : (req.companyId ? { companyId: req.companyId } : {});
    const tasks = await Task.find(filter);

    // Auto-update any expired incomplete tasks to not_completed
    const processedTasks = await Promise.all(tasks.map(async (task) => {
      if (isTaskExpired(task) && task.status !== 'not_completed') {
        task.status = 'not_completed';
        await Task.updateOne({ _id: task._id }, { status: 'not_completed' });
      }
      return task;
    }));

    res.status(200).json(processedTasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateTask = async (req, res) => {
  try {
    const id = req.body.id || req.params.id;
    const findFilter = { id };
    if (req.companyId) findFilter.companyId = req.companyId;
    const previous = await Task.findOne(findFilter);
    if (!previous) return res.status(404).json({ message: 'Task not found' });

    // If task was expired and incomplete, prevent marking it completed
    let reqStatus = req.body.status;
    if (reqStatus && typeof reqStatus === 'object') {
      if ('inProgress' in reqStatus || 'in_progress' in reqStatus) reqStatus = 'in_progress';
      else if ('completed' in reqStatus || 'done' in reqStatus) reqStatus = 'done';
      else if ('paused' in reqStatus) reqStatus = 'paused';
      else if ('blocked' in reqStatus) reqStatus = 'blocked';
      else if ('todo' in reqStatus) reqStatus = 'todo';
      req.body.status = reqStatus;
    }
    const isTryingToComplete = reqStatus === 'done' || reqStatus === 'completed';
    if (isTaskExpired(previous) && isTryingToComplete) {
      return res.status(400).json({ message: 'The assigned time for this task has ended. This task is marked as Not Completed and cannot be completed.' });
    }

    // Exclusivity: Only one task can be in_progress at a time per user.
    // If this task is starting (in_progress), pause all other running tasks and scrum notes for the same user.
    if (reqStatus === 'in_progress') {
      const targetUser = req.body.assignedTo || previous.assignedTo || req.body.assignee || previous.assignee;
      if (targetUser) {
        const pauseFilter = {
          id: { $ne: previous.id },
          $or: [
            { assignedTo: targetUser },
            { assignee: targetUser }
          ],
          status: 'in_progress'
        };
        if (req.companyId) pauseFilter.companyId = req.companyId;
        const runningOtherTasks = await Task.find(pauseFilter);
        if (runningOtherTasks.length > 0) {
          await Task.updateMany(pauseFilter, { status: 'paused' });
          runningOtherTasks.forEach(pt => {
            emitToCompany('task:change', pt.companyId || req.companyId, { action: 'update', id: pt.id, status: 'paused' });
          });
        }

        // Also pause other in_progress ScrumNotes for targetUser
        try {
          const { default: ScrumNote } = await import('../models/ScrumNote.js');
          const scrumPauseFilter = {
            userId: targetUser,
            status: 'in_progress',
            taskDetails: { $ne: previous.title }
          };
          if (req.companyId) scrumPauseFilter.companyId = req.companyId;
          await ScrumNote.updateMany(scrumPauseFilter, { status: 'paused', pausedAt: new Date().toISOString() });
        } catch (e) {}
      }
    }

    const task = await Task.findOneAndUpdate(findFilter, req.body, { new: true });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.assignedTo) {
      try {
        const notificationPayload = {
          id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          userId: task.assignedTo,
          companyId: task.companyId,
          title: 'Task Updated',
          message: `Your task was updated: ${task.title}`,
          createdAt: new Date().toISOString(),
          read: false
        };
        const { default: Notification } = await import('../models/Notification.js');
        const n = new Notification(notificationPayload);
        await n.save();
      } catch (e) {}
    }
    // Notify assignor if we can resolve their userId
    if (task.assignorName) {
      try {
        const assignorFilter = {
          $or: [{ username: task.assignorName }, { name: task.assignorName }]
        };
        if (task.companyId) assignorFilter.companyId = task.companyId;
        const assignor = await User.findOne(assignorFilter);
        if (assignor && assignor.userId) {
          const statusLabel = String(task.status || '').replace('_', ' ') || 'updated';
          const { default: Notification } = await import('../models/Notification.js');
          const n2 = new Notification({
            id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            userId: assignor.userId,
            companyId: task.companyId,
            title: 'Task Status Change',
            message: `Task "${task.title}" status: ${statusLabel}`,
            createdAt: new Date().toISOString(),
            read: false
          });
          await n2.save();
        }
      } catch (e) {}
    }
    emitToCompany('task:change', task.companyId, { action: 'update', id: task.id });
    res.status(200).json(task);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteTask = async (req, res) => {
  try {
    const filter = { id: req.params.id };
    if (req.companyId) filter.companyId = req.companyId;
    const task = await Task.findOneAndDelete(filter);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    emitToCompany('task:change', task.companyId, { action: 'delete', id: task.id });
    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Build Schedules & Tasks Report Data
 */
export const buildSchedulesReportData = async (companyId, query = {}) => {
  const period = query.period || 'month'; // 'day' | 'month' | 'year'
  const filterDate = query.date; // e.g. '2026-10-22'
  const filterMonth = query.month; // e.g. '2026-10'
  const filterYear = query.year; // e.g. '2026'
  const departmentFilter = query.department;
  const statusFilter = query.status; // 'all' | 'completed' | 'in_progress' | 'todo' | 'not_completed'
  const searchQuery = (query.search || '').trim().toLowerCase();

  const company = await Company.findById(companyId).lean();
  const companyName = company?.name || 'Company';

  // Format Period Label
  let periodLabel = '';
  if (period === 'day') {
    periodLabel = filterDate ? `Day: ${filterDate}` : 'Today';
  } else if (period === 'year') {
    periodLabel = filterYear ? `Year: ${filterYear}` : 'Full Year';
  } else {
    periodLabel = filterMonth ? `Month: ${filterMonth}` : 'Current Month';
  }

  // 1. Fetch all company employees
  const userFilter = {
    companyId,
    role: { $in: ['staff', 'employee', 'intern', 'freelancer', 'admin'] }
  };
  if (departmentFilter && departmentFilter !== 'all') {
    userFilter.department = departmentFilter;
  }
  const employees = await User.find(userFilter).lean();

  // 2. Fetch all tasks for this company
  const tasks = await Task.find({ companyId }).sort({ createdAt: -1 }).lean();

  // Helper to determine if task date matches selected period
  const matchesPeriod = (t) => {
    const sDate = t.startDate || '';
    const eDate = t.endDate || '';
    const dDate = t.dueDate || '';
    const cDate = t.createdAt ? new Date(t.createdAt).toISOString().split('T')[0] : '';

    if (period === 'day' && filterDate) {
      if (sDate && eDate && sDate <= filterDate && eDate >= filterDate) return true;
      if (sDate === filterDate || eDate === filterDate || dDate === filterDate || cDate === filterDate) return true;
      return false;
    }
    if (period === 'month' && filterMonth) {
      if (sDate.startsWith(filterMonth) || eDate.startsWith(filterMonth) || dDate.startsWith(filterMonth) || cDate.startsWith(filterMonth)) return true;
      try {
        const [yStr, mStr] = filterMonth.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10);
        const lastDay = new Date(y, m, 0).getDate();
        const pad2 = (n) => String(n).padStart(2, '0');
        const mStart = `${y}-${pad2(m)}-01`;
        const mEnd = `${y}-${pad2(m)}-${pad2(lastDay)}`;
        const effEnd = eDate || dDate;
        if (sDate && effEnd && sDate <= mEnd && effEnd >= mStart) return true;
      } catch {
        // ignore
      }
      return false;
    }
    if (period === 'year' && filterYear) {
      if (sDate.startsWith(filterYear) || eDate.startsWith(filterYear) || dDate.startsWith(filterYear) || cDate.startsWith(filterYear)) return true;
      return false;
    }
    return true; // default include
  };

  const periodTasks = tasks.filter(matchesPeriod);

  // Auto-flag expired
  periodTasks.forEach(t => {
    if (isTaskExpired(t) && t.status !== 'not_completed' && t.status !== 'done' && t.status !== 'completed') {
      t.status = 'not_completed';
    }
  });

  // Group tasks by employee
  const employeeStats = [];
  const flatRecords = [];

  for (const emp of employees) {
    const empKey = String(emp.userId || emp._id);
    const empUsername = String(emp.username || '').toLowerCase();
    const empName = String(emp.name || '').toLowerCase();

    // Find all tasks assigned to this employee
    const empTasks = periodTasks.filter(t => {
      if (!t.assignedTo) return false;
      const assign = String(t.assignedTo).trim().toLowerCase();
      return assign === empKey.toLowerCase() || assign === empUsername || assign === empName;
    });

    // Check status filter if applicable
    let filteredEmpTasks = empTasks;
    if (statusFilter && statusFilter !== 'all') {
      filteredEmpTasks = empTasks.filter(t => {
        const isDone = t.status === 'done' || t.status === 'completed';
        if (statusFilter === 'completed') return isDone;
        if (statusFilter === 'in_progress') return t.status === 'in_progress' || t.status === 'paused';
        if (statusFilter === 'todo') return t.status === 'todo';
        if (statusFilter === 'not_completed') return t.status === 'not_completed';
        return true;
      });
    }

    const totalAssigned = empTasks.length;
    const completedCount = empTasks.filter(t => t.status === 'done' || t.status === 'completed').length;
    const inProgressCount = empTasks.filter(t => t.status === 'in_progress').length;
    const pausedCount = empTasks.filter(t => t.status === 'paused').length;
    const todoCount = empTasks.filter(t => t.status === 'todo').length;
    const notCompletedCount = empTasks.filter(t => t.status === 'not_completed').length;
    const completionRate = totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 0;

    // Check search query against employee name/id
    if (searchQuery) {
      const matchEmp = (emp.name || '').toLowerCase().includes(searchQuery) ||
                       (emp.userId || '').toLowerCase().includes(searchQuery) ||
                       (emp.department || '').toLowerCase().includes(searchQuery);
      const matchAnyTask = empTasks.some(t => (t.title || '').toLowerCase().includes(searchQuery));
      if (!matchEmp && !matchAnyTask) {
        continue;
      }
    }

    const taskItems = filteredEmpTasks.map(t => {
      const isCompleted = t.status === 'done' || t.status === 'completed';
      const isExpired = t.status === 'not_completed' || isTaskExpired(t);
      let statusLabel = 'To Do';
      if (isCompleted) statusLabel = 'Completed';
      else if (isExpired) statusLabel = 'Not Completed';
      else if (t.status === 'in_progress') statusLabel = 'In Progress';
      else if (t.status === 'paused') statusLabel = 'Paused';

      return {
        id: t.id,
        title: t.title,
        description: t.description || '',
        projectName: t.projectName || 'General',
        priority: t.priority || 'medium',
        startDate: t.startDate || '',
        endDate: t.endDate || t.dueDate || '',
        dueTime: t.dueTime || t.endTime || '',
        status: t.status,
        statusLabel,
        isCompleted,
        assignorName: t.assignorName || 'Company',
      };
    });

    employeeStats.push({
      userId: emp.userId || emp._id,
      staffId: emp.userId || emp.staffId || 'EMP',
      name: emp.name || emp.username || 'Staff',
      email: emp.email || '',
      department: emp.department || 'General',
      designation: emp.designation || 'Staff',
      avatar: emp.avatar || '',
      totalTasks: totalAssigned,
      completedTasks: completedCount,
      inProgressTasks: inProgressCount,
      pausedTasks: pausedCount,
      todoTasks: todoCount,
      notCompletedTasks: notCompletedCount,
      completionRate,
      tasks: taskItems,
    });

    // Add to flatRecords for tabular report view and CSV export
    taskItems.forEach(t => {
      flatRecords.push({
        date: t.startDate || t.endDate || (period === 'day' ? filterDate : ''),
        employeeId: emp.userId || emp.staffId || '',
        employeeName: emp.name || emp.username || '',
        department: emp.department || 'General',
        designation: emp.designation || 'Staff',
        taskTitle: t.title,
        project: t.projectName,
        priority: t.priority,
        startDate: t.startDate,
        dueDate: t.endDate,
        status: t.statusLabel,
        isCompleted: t.isCompleted ? 'Completed' : (t.status === 'not_completed' ? 'Not Completed' : 'Pending'),
      });
    });
  }

  // Summary Metrics
  const totalTasks = periodTasks.length;
  const totalCompleted = periodTasks.filter(t => t.status === 'done' || t.status === 'completed').length;
  const totalInProgress = periodTasks.filter(t => t.status === 'in_progress').length;
  const totalTodo = periodTasks.filter(t => t.status === 'todo').length;
  const totalNotCompleted = periodTasks.filter(t => t.status === 'not_completed' || isTaskExpired(t)).length;
  const overallCompletionRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;
  const employeesWithTasks = employeeStats.filter(e => e.totalTasks > 0).length;

  // Build CSV content
  const csvHeaders = ['Date', 'Employee ID', 'Employee Name', 'Department', 'Designation', 'Task Title', 'Project', 'Priority', 'Start Date', 'Due Date', 'Status', 'Completed (Yes/No)'];
  const csvRows = flatRecords.map(r => [
    r.date,
    r.employeeId,
    `"${(r.employeeName || '').replace(/"/g, '""')}"`,
    `"${(r.department || '').replace(/"/g, '""')}"`,
    `"${(r.designation || '').replace(/"/g, '""')}"`,
    `"${(r.taskTitle || '').replace(/"/g, '""')}"`,
    `"${(r.project || '').replace(/"/g, '""')}"`,
    r.priority,
    r.startDate,
    r.dueDate,
    r.status,
    r.isCompleted === 'Completed' ? 'Yes' : 'No'
  ].join(','));

  const csvContent = [
    `# ${companyName} - Official Schedules & Tasks Report`,
    `# Period: ${periodLabel}`,
    `# Generated: ${new Date().toLocaleString()}`,
    `# Summary: Total Tasks: ${totalTasks} | Completed: ${totalCompleted} (${overallCompletionRate}%) | In Progress: ${totalInProgress} | Not Completed: ${totalNotCompleted}`,
    '',
    csvHeaders.join(','),
    ...csvRows,
  ].join('\n');

  return {
    companyName,
    period,
    periodLabel,
    totalTasks,
    totalCompleted,
    totalInProgress,
    totalTodo,
    totalNotCompleted,
    overallCompletionRate,
    totalEmployees: employees.length,
    employeesWithTasks,
    employees: employeeStats,
    records: flatRecords,
    csvContent,
  };
};

/**
 * Controller: Get Schedules & Tasks Report (JSON + CSV)
 */
export const getSchedulesReport = async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(400).json({ message: 'Company context required' });

    const report = await buildSchedulesReportData(companyId, req.query);
    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Controller: Send Schedules Report via Email
 */
export const sendSchedulesReport = async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(400).json({ message: 'Company context required' });

    const { recipientEmail, notes, ...filterParams } = req.body;
    if (!recipientEmail || !recipientEmail.trim()) {
      return res.status(400).json({ message: 'Recipient email is required' });
    }

    const report = await buildSchedulesReportData(companyId, filterParams);

    const summaryMetrics = [
      { label: 'Total Tasks Assigned', value: `${report.totalTasks}` },
      { label: 'Completed Tasks', value: `${report.totalCompleted} (${report.overallCompletionRate}%)` },
      { label: 'In Progress / Running', value: `${report.totalInProgress}` },
      { label: 'Pending / To Do', value: `${report.totalTodo}` },
      { label: 'Not Completed / Expired', value: `${report.totalNotCompleted}` },
      { label: 'Employees with Tasks', value: `${report.employeesWithTasks} / ${report.totalEmployees}` },
    ];

    const filename = `Schedules_Report_${report.companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${report.periodLabel.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;

    const mailResult = await sendReportEmail({
      to: recipientEmail.trim(),
      subject: `Schedules & Tasks Report - ${report.companyName} (${report.periodLabel})`,
      companyName: report.companyName,
      reportType: 'Schedules & Tasks Performance Report',
      periodLabel: report.periodLabel,
      summaryMetrics,
      notes: notes ? String(notes).trim() : '',
      csvContent: report.csvContent,
      filename,
    });

    res.status(200).json({
      message: mailResult.simulated
        ? `Schedules report prepared for ${recipientEmail} (Simulated send: SMTP not configured)`
        : `Schedules report successfully sent to ${recipientEmail}`,
      mailResult,
      summary: {
        totalTasks: report.totalTasks,
        totalCompleted: report.totalCompleted,
        overallCompletionRate: report.overallCompletionRate,
        periodLabel: report.periodLabel,
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
