/**
 * Task deadline and expiration utility functions.
 * Enforces that tasks are only opened/workable until their assigned deadline,
 * and marks them as "Not Completed" once expired.
 */

export function parseDateString(dateVal) {
  if (!dateVal) return null;
  if (typeof dateVal === 'string') {
    // If it has 'T', take the date part if simple YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(dateVal)) {
      return dateVal.split('T')[0];
    }
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  if (typeof dateVal === 'bigint' || typeof dateVal === 'number') {
    const num = Number(dateVal);
    // Nanoseconds vs milliseconds
    const ms = num > 1e12 ? num / 1000000 : num;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  return null;
}

/**
 * Returns the exact Date object when the task expires.
 */
export function getTaskDeadline(task) {
  if (!task) return null;

  const timeStr = task.dueTime || task.endTime;
  const endDateStr = parseDateString(task.rawEndDate || task.endDate || task.dueDate);

  // 1. Explicit End Date + End Time
  if (endDateStr && timeStr) {
    const [hhStr, mmStr] = timeStr.split(':');
    const hh = parseInt(hhStr || '0', 10);
    const mm = parseInt(mmStr || '0', 10);
    const d = new Date(endDateStr + 'T00:00:00');
    d.setHours(hh, mm, 0, 0);
    if (!isNaN(d.getTime())) return d;
  }

  // 2. Duration in hours from start time / created time
  if (task.durationUnit === 'hours' && Number(task.durationValue) > 0) {
    let baseTime = null;
    if (task.createdAt) {
      const c = new Date(task.createdAt);
      if (!isNaN(c.getTime())) baseTime = c.getTime();
    }
    if (!baseTime && (task.rawStartDate || task.startDate)) {
      const s = parseDateString(task.rawStartDate || task.startDate);
      if (s) {
        const sd = new Date(s + 'T00:00:00');
        if (!isNaN(sd.getTime())) baseTime = sd.getTime();
      }
    }
    if (baseTime) {
      return new Date(baseTime + Number(task.durationValue) * 3600 * 1000);
    }
  }

  // 3. End Date only (default deadline is end of that day 23:59:59.999 local time)
  if (endDateStr) {
    const parts = endDateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day, 23, 59, 59, 999);
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

/**
 * Determines whether a task has passed its assigned deadline without being completed.
 */
export function isTaskExpired(task) {
  if (!task) return false;

  // Extract raw status key
  const statusKey = typeof task.status === 'string'
    ? task.status
    : Object.keys(task.status || {})[0] || 'todo';

  // If already marked done / completed, it is completed on time
  if (statusKey === 'done' || statusKey === 'completed') {
    return false;
  }

  // Explicit not_completed status
  if (statusKey === 'not_completed' || statusKey === 'notCompleted') {
    return true;
  }

  const deadline = getTaskDeadline(task);
  if (!deadline) return false;

  return Date.now() > deadline.getTime();
}

/**
 * Returns canonical UI status: 'completed' | 'not_completed' | 'inProgress' | 'todo'
 */
export function getTaskUiStatus(task) {
  if (!task) return 'todo';

  const statusKey = typeof task.status === 'string'
    ? task.status
    : Object.keys(task.status || {})[0] || 'todo';

  if (statusKey === 'done' || statusKey === 'completed') {
    return 'completed';
  }

  if (isTaskExpired(task)) {
    return 'not_completed';
  }

  if (statusKey === 'in_progress' || statusKey === 'inProgress') {
    return 'inProgress';
  }

  if (statusKey === 'review' || statusKey === 'blocked') {
    return 'review';
  }

  return 'todo';
}

/**
 * Formatted human-readable status label
 */
export function getTaskStatusLabel(task) {
  const ui = getTaskUiStatus(task);
  if (ui === 'completed') return 'Completed';
  if (ui === 'not_completed') return 'Not Completed';
  if (ui === 'inProgress') return 'In Progress';
  if (ui === 'review') return 'Under Review';
  return 'To Do';
}

/**
 * Badge styling class corresponding to task status
 */
export function getTaskStatusBadgeClass(task) {
  const ui = getTaskUiStatus(task);
  if (ui === 'completed') {
    return 'bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200 border-green-300 dark:border-green-800';
  }
  if (ui === 'not_completed') {
    return 'bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200 border-red-400 dark:border-red-800 font-semibold';
  }
  if (ui === 'inProgress') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border-blue-300 dark:border-blue-800';
  }
  return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700';
}

/**
 * Human-readable deadline string
 */
export function formatDeadline(task) {
  const deadline = getTaskDeadline(task);
  if (!deadline) return null;

  return deadline.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
