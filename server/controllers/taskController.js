import Task from '../models/Task.js';
import User from '../models/User.js';
import { resolveCompanyId } from '../utils/resolveCompanyId.js';
import { emitToCompany } from '../socket.js';

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
  if (task.status === 'not_completed') return true;

  const timeStr = task.dueTime || task.endTime;
  const endDateStr = task.endDate || task.dueDate;

  if (endDateStr && timeStr) {
    const [hh, mm] = timeStr.split(':');
    const d = new Date(endDateStr.includes('T') ? endDateStr.split('T')[0] + 'T00:00:00' : endDateStr + 'T00:00:00');
    d.setHours(parseInt(hh || 0, 10), parseInt(mm || 0, 10), 0, 0);
    if (!isNaN(d.getTime())) {
      return Date.now() > d.getTime();
    }
  }

  if (task.durationUnit === 'hours' && Number(task.durationValue) > 0) {
    const base = task.createdAt ? new Date(task.createdAt) : (task.startDate ? new Date(task.startDate) : null);
    if (base && !isNaN(base.getTime())) {
      const deadline = new Date(base.getTime() + Number(task.durationValue) * 3600 * 1000);
      return Date.now() > deadline.getTime();
    }
  }

  if (endDateStr) {
    const d = new Date(endDateStr.includes('T') ? endDateStr : endDateStr + 'T23:59:59.999');
    if (!isNaN(d.getTime())) {
      return Date.now() > d.getTime();
    }
  }

  return false;
};

export const getAllTasks = async (req, res) => {
  try {
    const filter = req.companyId ? { companyId: req.companyId } : {};
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
    const reqStatus = req.body.status;
    const isTryingToComplete = reqStatus === 'done' || reqStatus === 'completed' || (reqStatus && typeof reqStatus === 'object' && 'completed' in reqStatus);
    if (isTaskExpired(previous) && isTryingToComplete) {
      return res.status(400).json({ message: 'The assigned time for this task has ended. This task is marked as Not Completed and cannot be completed.' });
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
