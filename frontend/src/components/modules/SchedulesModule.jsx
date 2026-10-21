import { useMemo, useState, useEffect } from 'react';
import { useGetAllTasks, useCreateTask, useUpdateTask, useDeleteTask, useGetAllUsers, useGetAllTaskUpdates, useAddTaskUpdate, useGetAllHolidays, useGetAllLeaveRequests } from '../../hooks/useQueries';
import { useCustomAuth } from '../../hooks/useCustomAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Calendar, 
  Clock, 
  AlertCircle, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  RotateCcw, 
  User, 
  ArrowUpDown, 
  ChevronRight, 
  Layers, 
  CalendarCheck,
  Check,
  ClipboardList
} from 'lucide-react';
import { toast } from 'sonner';
import { safeRandomUUID, hasUserRole } from '@/lib/utils';
import { isTaskExpired, getTaskUiStatus, getTaskStatusLabel, getTaskStatusBadgeClass, formatDeadline, getTaskDeadline } from '@/lib/taskUtils';

export default function SchedulesModule({ userProfile }) {
  const { identity } = useCustomAuth();
  const { data: tasks = [], isLoading } = useGetAllTasks();
  const { data: users = [] } = useGetAllUsers();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { data: holidays = [] } = useGetAllHolidays();
  const { data: allLeaves = [] } = useGetAllLeaveRequests();

  const { data: allTaskUpdates = [] } = useGetAllTaskUpdates();
  const addTaskUpdate = useAddTaskUpdate();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignee: '',
    priority: 'medium',
    durationValue: '',
    durationUnit: 'days',
    startDate: '',
    endDate: '',
    dueTime: '',
  });

  const isAdmin = hasUserRole(userProfile, 'admin');
  const isOwner = hasUserRole(userProfile, 'owner') || hasUserRole(userProfile, 'param');
  const isStaff = hasUserRole(userProfile, 'staff') || hasUserRole(userProfile, 'intern') || hasUserRole(userProfile, 'freelancer');
  const canManage = isAdmin || isOwner;

  const currentUserId = userProfile.id || null;

  const toIdText = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val.toText) return val.toText();
    return String(val);
  };
  const formatUserLabel = (user) => {
    const idTxt = toIdText(user.id);
    const nm = user.name || user.username || '';
    return `${nm} - ${idTxt}`.trim();
  };
  const isAssignedToMe = (task) => toIdText(task.assignee) === toIdText(userProfile.id);

  const toUiStatus = (s, task) => {
    if (task) return getTaskUiStatus(task);
    const key = typeof s === 'string' ? s : Object.keys(s || {})[0];
    if (key === 'in_progress') return 'inProgress';
    if (key === 'done' || key === 'completed') return 'completed';
    if (key === 'not_completed' || key === 'notCompleted') return 'not_completed';
    return 'todo';
  };

  const formatStatusLabel = (ui, task) => {
    if (task) return getTaskStatusLabel(task);
    if (ui === 'inProgress') return 'In Progress';
    if (ui === 'completed') return 'Completed';
    if (ui === 'not_completed') return 'Not Completed';
    return 'To Do';
  };

  const getStatusColor = (status, task) => {
    if (task) return getTaskStatusBadgeClass(task);
    const ui = typeof status === 'string' ? status : toUiStatus(status);
    if (ui === 'completed') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
    if (ui === 'not_completed') return 'bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200 border-red-400 dark:border-red-800 font-semibold';
    if (ui === 'inProgress') return 'bg-teal-100 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300 border-teal-300 dark:border-teal-800';
    return 'bg-muted text-muted-foreground border-border';
  };

  const formatDisplayDate = (d) => {
    if (!d) return '--';
    if (typeof d === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.split('T')[0];
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) return parsed.toLocaleDateString();
    }
    if (typeof d === 'bigint' || typeof d === 'number') {
      const num = Number(d);
      const ms = num > 1e12 ? num / 1000000 : num;
      const parsed = new Date(ms);
      if (!isNaN(parsed.getTime())) return parsed.toLocaleDateString();
    }
    return String(d);
  };

  // Filter tasks based on role
  const visibleTasks = tasks.filter(task => {
    if (isAdmin || isOwner) return true;
    if (isStaff) {
      const myId = toIdText(userProfile?.userId || userProfile?.id || '');
      const assigneeId = toIdText(task.assignee || task.assignedTo || '');
      return assigneeId === myId;
    }
    return false;
  });

  // Filter users for assignee dropdown
  const assigneeOptions = users.filter(user => {
    if (isAdmin) return true;
    if (isOwner) return hasUserRole(user, 'staff') || hasUserRole(user, 'intern') || hasUserRole(user, 'freelancer') || hasUserRole(user, 'admin') || hasUserRole(user, 'param');
    return false;
  });
  const supervisorOptions = users.filter(user => hasUserRole(user, 'admin') || hasUserRole(user, 'owner') || hasUserRole(user, 'param'));

  const [updateForms, setUpdateForms] = useState({});
  const [updateDateFilter, setUpdateDateFilter] = useState(null);
  const [updateStaffFilter, setUpdateStaffFilter] = useState('all');

  // Search, filter, and sort toolbar states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('deadline');

  const todayIso = new Date().toISOString().split('T')[0];

  // Real task metrics for KPI cards
  const taskMetrics = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let pendingOrOverdue = 0;

    visibleTasks.forEach(task => {
      const ui = toUiStatus(task.status, task);
      const expired = isTaskExpired(task);
      if (ui === 'completed') {
        completed++;
      } else if (ui === 'inProgress' && !expired) {
        inProgress++;
      } else {
        // todo or not_completed or expired
        pendingOrOverdue++;
      }
    });

    return {
      total: visibleTasks.length,
      completed,
      inProgress,
      pendingOrOverdue,
    };
  }, [visibleTasks]);

  // Filtered and sorted tasks
  const filteredAndSortedTasks = useMemo(() => {
    const list = visibleTasks.filter(task => {
      // 1. Search Query (title, description, assignor, assignee)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = (task.title || '').toLowerCase().includes(q);
        const descMatch = (task.description || '').toLowerCase().includes(q);
        const assignorMatch = (task.assignorName || '').toLowerCase().includes(q);
        const assigneeUser = users.find(u => toIdText(u.id) === toIdText(task.assignee));
        const assigneeMatch = assigneeUser ? formatUserLabel(assigneeUser).toLowerCase().includes(q) : false;
        if (!titleMatch && !descMatch && !assignorMatch && !assigneeMatch) return false;
      }

      // 2. Status Filter
      if (statusFilter !== 'all') {
        const uiStatus = toUiStatus(task.status, task);
        if (statusFilter === 'todo' && uiStatus !== 'todo') return false;
        if (statusFilter === 'inProgress' && uiStatus !== 'inProgress') return false;
        if (statusFilter === 'completed' && uiStatus !== 'completed') return false;
        if (statusFilter === 'not_completed' && uiStatus !== 'not_completed') return false;
      }

      // 3. Priority Filter
      if (priorityFilter !== 'all') {
        const p = (task.priority || 'medium').toLowerCase();
        if (p !== priorityFilter.toLowerCase()) return false;
      }

      // 4. Manager Staff Filter
      if (canManage && updateStaffFilter !== 'all') {
        if (toIdText(task.assignee) !== updateStaffFilter) return false;
      }

      // 5. Manager Date Filter
      if (canManage && updateDateFilter) {
        const target = updateDateFilter.toISOString().split('T')[0];
        const taskStart = formatDisplayDate(task.rawStartDate || task.startDate);
        const taskEnd = formatDisplayDate(task.rawEndDate || task.endDate);
        if (taskStart !== target && taskEnd !== target) return false;
      }

      return true;
    });

    // Sort
    return list.sort((a, b) => {
      if (sortBy === 'deadline') {
        const deadA = getTaskDeadline(a)?.getTime() || Infinity;
        const deadB = getTaskDeadline(b)?.getTime() || Infinity;
        return deadA - deadB;
      }
      if (sortBy === 'date-desc') {
        const timeA = new Date(a.rawStartDate || a.startDate || 0).getTime();
        const timeB = new Date(b.rawStartDate || b.startDate || 0).getTime();
        return timeB - timeA;
      }
      if (sortBy === 'date-asc') {
        const timeA = new Date(a.rawStartDate || a.startDate || 0).getTime();
        const timeB = new Date(b.rawStartDate || b.startDate || 0).getTime();
        return timeA - timeB;
      }
      if (sortBy === 'priority') {
        const weights = { high: 3, medium: 2, low: 1 };
        const wA = weights[(a.priority || 'medium').toLowerCase()] || 0;
        const wB = weights[(b.priority || 'medium').toLowerCase()] || 0;
        return wB - wA;
      }
      return 0;
    });
  }, [visibleTasks, searchQuery, statusFilter, priorityFilter, sortBy, updateStaffFilter, updateDateFilter, users, canManage]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || 
    statusFilter !== 'all' || 
    priorityFilter !== 'all' || 
    sortBy !== 'deadline' || 
    (canManage && updateStaffFilter !== 'all') || 
    (canManage && updateDateFilter !== null)
  );

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setSortBy('deadline');
    setUpdateStaffFilter('all');
    setUpdateDateFilter(null);
  };

  const staffOptions = useMemo(() => {
    return users.filter(user => hasUserRole(user, 'staff') || hasUserRole(user, 'intern') || hasUserRole(user, 'freelancer'));
  }, [users]);
  const holidaySet = useMemo(() => new Set(holidays.map(h => h.date)), [holidays]);
  const approvedLeaveMap = useMemo(() => {
    const map = new Map();
    const addRange = (uid, s, e) => {
      const start = new Date(s);
      const end = new Date(e);
      let d = new Date(start);
      while (d <= end) {
        const iso = d.toISOString().slice(0, 10);
        const set = map.get(uid) || new Set();
        set.add(iso);
        map.set(uid, set);
        d.setDate(d.getDate() + 1);
      }
    };
    allLeaves.forEach(l => {
      if (String(l.status) === 'approved') {
        const uid = toIdText(l.userId);
        addRange(uid, l.startDate, l.endDate);
      }
    });
    return map;
  }, [allLeaves]);

  const computeEndDate = useMemo(() => {
    return (startIso, durationValue, durationUnit, assignee) => {
      if (!startIso || !durationValue || durationValue <= 0) return '';
      
      // Convert hours to days (8 hours = 1 working day)
      let daysCount = durationUnit === 'hours' ? Math.ceil(durationValue / 8) : Math.floor(durationValue);
      if (daysCount <= 0) return '';
      
      const uid = assignee ? toIdText(assignee) : '';
      const leaveSet = uid ? (approvedLeaveMap.get(uid) || new Set()) : new Set();
      
      const isWorkDay = (dateStr) => {
        return !holidaySet.has(dateStr) && !leaveSet.has(dateStr);
      };

      // Parse date as UTC to avoid timezone issues
      const parts = startIso.split('-');
      let year = parseInt(parts[0], 10);
      let month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
      let day = parseInt(parts[2], 10);
      
      // Create UTC date
      let currentDate = new Date(Date.UTC(year, month, day));
      let dateStr = currentDate.toISOString().slice(0, 10);
      
      // Ensure start date is a working day
      while (!isWorkDay(dateStr)) {
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        dateStr = currentDate.toISOString().slice(0, 10);
      }

      // Count working days starting from start date (inclusive)
      let workingDaysCount = 0;
      
      while (workingDaysCount < daysCount) {
        if (isWorkDay(dateStr)) {
          workingDaysCount++;
        }
        if (workingDaysCount < daysCount) {
          currentDate.setUTCDate(currentDate.getUTCDate() + 1);
          dateStr = currentDate.toISOString().slice(0, 10);
        }
      }
      
      return dateStr;
    };
  }, [holidaySet, approvedLeaveMap]);

  // Auto-adjust End Date when Start/Duration/Assignee changes
  useEffect(() => {
    if (formData.startDate && formData.durationValue) {
      const next = computeEndDate(formData.startDate, formData.durationValue, formData.durationUnit, formData.assignee || formData.assignedTo);
      if (next && next !== formData.endDate) {
        setFormData(prev => ({ ...prev, endDate: next }));
      }
    }
  }, [formData.startDate, formData.durationValue, formData.durationUnit, formData.assignee, formData.assignedTo, computeEndDate]);

  // Auto-adjust Start Date if Assignee is on leave or holiday or past date
  useEffect(() => {
    if (!formData.startDate || !formData.assignee) return;
    
    const uid = toIdText(formData.assignee);
    const leaveSet = approvedLeaveMap.get(uid) || new Set();
    
    const isWorkDay = (dateStr) => {
      return !holidaySet.has(dateStr) && !leaveSet.has(dateStr);
    };

    // Parse date as UTC
    const parts = formData.startDate.split('-');
    let year = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1;
    let day = parseInt(parts[2], 10);
    let cur = new Date(Date.UTC(year, month, day));
    let dateStr = cur.toISOString().slice(0, 10);
    
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    
    let adjusted = false;
    
    // Check past date
    if (dateStr < todayStr) {
      cur = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      dateStr = cur.toISOString().slice(0, 10);
      adjusted = true;
    }
    
    // Check holiday or leave
    while (!isWorkDay(dateStr)) {
      cur.setUTCDate(cur.getUTCDate() + 1);
      dateStr = cur.toISOString().slice(0, 10);
      adjusted = true;
    }
    
    if (adjusted && dateStr !== formData.startDate) {
      setFormData(prev => ({ ...prev, startDate: dateStr }));
      toast.info(`Start date adjusted to next available working day: ${dateStr}`);
    }
  }, [formData.startDate, formData.assignee, holidaySet, approvedLeaveMap]);

  const availableAssigneeOptions = useMemo(() => {
    const startIso = formData.startDate;
    const endIso = formData.endDate;
    if (!startIso || !endIso) return assigneeOptions;
    
    const start = new Date(startIso + 'T00:00:00');
    const end = new Date(endIso + 'T00:00:00');
    const rangeIso = new Set();
    let d = new Date(start);
    while (d <= end) {
      rangeIso.add(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    
    return assigneeOptions.filter(user => {
      const uid = toIdText(user.userId || user.id);
      const leaveSet = approvedLeaveMap.get(uid) || new Set();
      for (const iso of rangeIso) {
        if (leaveSet.has(iso)) return false;
      }
      return true;
    });
  }, [assigneeOptions, formData.startDate, formData.endDate, approvedLeaveMap]);

  const getUpdateForm = (taskId) => {
    const existing = updateForms[taskId];
    if (existing) return existing;
    return { details: '', status: 'in_progress' };
  };

  const setUpdateFormForTask = (taskId, form) => {
    setUpdateForms(prev => ({
      ...prev,
      [taskId]: form,
    }));
  };

  const getFilteredUpdatesForTask = (task) => {
    const base = allTaskUpdates.filter(u => u.taskId === task.id);

    let filtered = base;

    if (!canManage && currentUserId) {
      filtered = filtered.filter(u => toIdText(u.staffId) === toIdText(currentUserId));
    } else {
      if (updateStaffFilter !== 'all') {
        filtered = filtered.filter(u => toIdText(u.staffId) === updateStaffFilter);
      }
    }

    if (updateDateFilter) {
      const target = updateDateFilter.toISOString().split('T')[0];
      filtered = filtered.filter(u => {
        const d = new Date(Number(u.createdAt) / 1000000);
        return d.toISOString().split('T')[0] === target;
      });
    }

    return filtered.sort((a, b) => Number(b.createdAt - a.createdAt));
  };

  const handleSaveUpdate = async (task) => {
    if (!currentUserId) return;
    const form = getUpdateForm(task.id);
    const trimmed = form.details.trim();
    if (!trimmed) {
      toast.error('Please enter task update details');
      return;
    }

    const now = new Date();
    const timestamp = BigInt(now.getTime() * 1000000);

    const update = {
      id: safeRandomUUID(),
      taskId: task.id,
      staffId: currentUserId,
      details: trimmed,
      status: form.status,
      createdAt: timestamp,
    };

    try {
      await addTaskUpdate.mutateAsync(update);
      toast.success('Task update saved');
      setUpdateFormForTask(task.id, { details: '', status: 'in_progress' });
    } catch (error) {
      toast.error('Failed to save task update');
      console.error(error);
    }
  };

  const formatUpdateTime = (timestamp) => {
    const d = new Date(Number(timestamp) / 1000000);
    return d.toLocaleString();
  };
  const handleMarkCompleted = async (task) => {
    if (isTaskExpired(task)) {
      toast.error('The assigned time for this task has ended. This task is marked as Not Completed and cannot be completed.');
      return;
    }
    try {
      const updated = {
        id: task.id,
        title: task.title,
        description: task.description,
        assignee: task.assignee,
        status: { completed: null },
        startDate: task.startDate,
        endDate: task.endDate,
        dueTime: task.dueTime || task.endTime || '',
        endTime: task.endTime || task.dueTime || '',
      };
      await updateTask.mutateAsync(updated);
      toast.success('Task marked as completed');
    } catch (error) {
      toast.error(error?.message || 'Failed to mark completed');
    }
  };

  // Mock Data for Task Details
  const mockAttachments = [
    { name: 'Project_Requirements.pdf', size: '2.4 MB', type: 'pdf' },
    { name: 'Design_Assets.zip', size: '15 MB', type: 'zip' },
    { name: 'Screenshot_01.png', size: '1.2 MB', type: 'image' },
  ];

  const mockComments = [
    { id: 1, user: 'Jane Cooper', text: 'I have started working on the initial wireframes.', time: '2 hours ago', avatar: 'https://i.pravatar.cc/150?u=3' },
    { id: 2, user: 'Robert Fox', text: 'Great! Please make sure to include the new brand colors.', time: '1 hour ago', avatar: 'https://i.pravatar.cc/150?u=4' },
    { id: 3, user: 'You', text: 'Will do. I will update the status once done.', time: 'Just now', avatar: userProfile.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile.name}` },
  ];

  const handleOpenDialog = (task) => {
    if (task) {
      setEditingTask(task);
      // Handle both BigInt timestamps and ISO string formats
      const parseDate = (dateValue) => {
        if (!dateValue) return '';
        if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
          return dateValue.split('T')[0];
        }
        if (typeof dateValue === 'bigint' || typeof dateValue === 'number') {
          return new Date(Number(dateValue) / 1000000).toISOString().split('T')[0];
        }
        return '';
      };
      setFormData({
        title: task.title,
        description: task.description,
        assignee: toIdText(task.assignee),
        priority: task.priority || 'medium',
        durationValue: task.durationValue ?? '',
        durationUnit: task.durationUnit || 'days',
        startDate: parseDate(task.rawStartDate || task.startDate),
        endDate: parseDate(task.rawEndDate || task.endDate),
        dueTime: task.dueTime || task.endTime || '',
      });
    } else {
      setEditingTask(null);
      setFormData({
        title: '',
        description: '',
        assignee: '',
        priority: 'medium',
        durationValue: '',
        durationUnit: 'days',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        dueTime: '',
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.assignee) {
      toast.error('Please select assignee');
      return;
    }
    if (!formData.startDate || !formData.endDate) {
      toast.error('Please select start and end dates');
      return;
    }
    
    const start = new Date(formData.startDate + 'T00:00:00');
    const end = new Date(formData.endDate + 'T00:00:00');
    const durVal = parseFloat(formData.durationValue);
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    if (start < todayStart) {
      toast.error('Start date cannot be in the past');
      return;
    }
    if (end < start) {
      toast.error('End date cannot be before start date');
      return;
    }

    try {
      const task = {
        id: editingTask ? editingTask.id : safeRandomUUID(),
        title: formData.title,
        description: formData.description,
        assignee: formData.assignee,
        assignorName: userProfile.name,
        priority: formData.priority,
        durationValue: !isNaN(durVal) && durVal > 0 ? durVal : undefined,
        durationUnit: !isNaN(durVal) && durVal > 0 ? formData.durationUnit : undefined,
        status: editingTask ? editingTask.status : { todo: null },
        startDate: formData.startDate,
        endDate: formData.endDate,
        dueTime: formData.dueTime || '',
        endTime: formData.dueTime || '',
      };

      if (editingTask) {
        await updateTask.mutateAsync(task);
        toast.success('Task updated successfully');
      } else {
        await createTask.mutateAsync(task);
        toast.success(`Task assigned to ${assigneeOptions.find(u => u.id.toText() === formData.assignee)?.username || 'staff'}`);
      }

      setIsDialogOpen(false);
      setEditingTask(null);
      setFormData({
        title: '',
        description: '',
        assignee: '',
        priority: 'medium',
        durationValue: '',
        durationUnit: 'days',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
      });
    } catch (error) {
      toast.error(error?.message || 'Failed to save task');
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this task?')) {
      try {
        await deleteTask.mutateAsync(id);
        toast.success('Task deleted successfully');
      } catch (error) {
        toast.error('Failed to delete task');
        console.error(error);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-[#DFE8EC] dark:border-[#2A3D48]">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6] flex items-center justify-center shrink-0 shadow-2xs">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#172B3A] dark:text-[#E8F0F4] leading-snug">
              Schedules & Tasks
            </h1>
            <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#A6B5C0] mt-0.5 font-normal">
              Plan your work, track progress, and stay on schedule.
            </p>
          </div>
        </div>
        {canManage && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                onClick={() => handleOpenDialog()} 
                className="bg-[#0D9488] hover:bg-[#0F766E] text-white shadow-sm font-medium transition-all px-4 py-2 h-10 rounded-lg flex items-center justify-center gap-2 w-full sm:w-auto shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>Add Task</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-2xl bg-white dark:bg-[#15232D] border-[#DFE8EC] dark:border-[#2A3D48]">
              <DialogHeader>
                <DialogTitle className="text-base md:text-lg text-[#172B3A] dark:text-[#E8F0F4]">
                  {editingTask ? 'Edit Task' : 'Add New Task'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2 min-w-0">
                    <Label htmlFor="assignee">Assignee *</Label>
                    <Select value={formData.assignee} onValueChange={(value) => setFormData({ ...formData, assignee: value })}>
                      <SelectTrigger className="w-full min-w-0 truncate text-sm">
                        <SelectValue placeholder="Select assignee" />
                      </SelectTrigger>
                      <SelectContent>
                        {assigneeOptions.map((user) => (
                          <SelectItem key={toIdText(user.id)} value={toIdText(user.id)}>
                            {formatUserLabel(user)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 min-w-0">
                    <Label htmlFor="priority">Priority</Label>
                    <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })}>
                      <SelectTrigger className="w-full min-w-0 truncate text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="durationValue">Duration</Label>
                    <div className="flex gap-2">
                      <Input
                        id="durationValue"
                        type="number"
                        min="0"
                        value={formData.durationValue}
                        onChange={(e) => setFormData({ ...formData, durationValue: e.target.value })}
                        placeholder="e.g., 8"
                      />
                      <Select value={formData.durationUnit} onValueChange={(value) => setFormData({ ...formData, durationUnit: value })}>
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hours">Hours</SelectItem>
                          <SelectItem value="days">Days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">End Date auto-calculates</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date *</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">End Date *</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dueTime">End Time / Deadline</Label>
                    <Input
                      id="dueTime"
                      type="time"
                      value={formData.dueTime}
                      onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                    />
                    <p className="text-[11px] text-muted-foreground">Optional cutoff time</p>
                  </div>
                </div>
                <Button type="submit" className="w-full bg-[#0D9488] hover:bg-[#0F766E] text-white" disabled={createTask.isPending || updateTask.isPending}>
                  {(createTask.isPending || updateTask.isPending) ? 'Saving...' : 'Save Task'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* 2. Real-Data KPI Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-4 shadow-sm flex items-center justify-between transition-all">
          <div className="space-y-1">
            <p className="text-xs font-medium text-[#64748B] dark:text-[#A6B5C0]">Total Tasks</p>
            <p className="text-2xl font-semibold text-[#172B3A] dark:text-[#E8F0F4]">{taskMetrics.total}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6] flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-4 shadow-sm flex items-center justify-between transition-all">
          <div className="space-y-1">
            <p className="text-xs font-medium text-[#64748B] dark:text-[#A6B5C0]">Completed</p>
            <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{taskMetrics.completed}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-4 shadow-sm flex items-center justify-between transition-all">
          <div className="space-y-1">
            <p className="text-xs font-medium text-[#64748B] dark:text-[#A6B5C0]">In Progress</p>
            <p className="text-2xl font-semibold text-teal-600 dark:text-teal-400">{taskMetrics.inProgress}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-4 shadow-sm flex items-center justify-between transition-all">
          <div className="space-y-1">
            <p className="text-xs font-medium text-[#64748B] dark:text-[#A6B5C0]">Pending / Overdue</p>
            <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">{taskMetrics.pendingOrOverdue}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Task Filters and Organization Toolbar */}
      <div className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-3.5 md:p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B] dark:text-[#A6B5C0]" />
            <Input
              type="text"
              placeholder="Search tasks by title, description, or assignee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs md:text-sm bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] rounded-lg focus-visible:ring-1 focus-visible:ring-[#0D9488]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground p-0.5"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Dropdowns and Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[130px] text-xs bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48]">
                <SelectValue placeholder="Status: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="todo">To Do</SelectItem>
                <SelectItem value="inProgress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="not_completed">Not Completed</SelectItem>
              </SelectContent>
            </Select>

            {/* Priority Filter */}
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-9 w-[130px] text-xs bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48]">
                <SelectValue placeholder="Priority: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="high">High Priority</SelectItem>
                <SelectItem value="medium">Medium Priority</SelectItem>
                <SelectItem value="low">Low Priority</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort By */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-9 w-[145px] text-xs bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48]">
                <div className="flex items-center gap-1.5 truncate">
                  <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <SelectValue placeholder="Sort by" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deadline">Soonest Deadline</SelectItem>
                <SelectItem value="date-desc">Newest First</SelectItem>
                <SelectItem value="date-asc">Oldest First</SelectItem>
                <SelectItem value="priority">Highest Priority</SelectItem>
              </SelectContent>
            </Select>

            {/* Reset Filters Button */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="h-9 px-2.5 text-xs text-[#64748B] hover:text-[#0D9488] dark:hover:text-[#14B8A6] flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </Button>
            )}
          </div>
        </div>

        {/* Manager Filter Extensions (Date & Staff) */}
        {canManage && (
          <div className="pt-2.5 border-t border-[#DFE8EC] dark:border-[#2A3D48] flex flex-wrap items-center justify-between gap-3 text-xs text-[#64748B] dark:text-[#A6B5C0]">
            <span className="font-medium">Manager Filters:</span>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span>Assignee:</span>
                <Select value={updateStaffFilter} onValueChange={setUpdateStaffFilter}>
                  <SelectTrigger className="h-7 w-[140px] text-xs bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48]">
                    <SelectValue placeholder="All staff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Staff</SelectItem>
                    {staffOptions.map(user => (
                      <SelectItem key={toIdText(user.id)} value={toIdText(user.id)}>
                        {formatUserLabel(user)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5">
                <span>Date:</span>
                <Input
                  type="date"
                  className="h-7 w-36 text-xs bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48]"
                  value={updateDateFilter ? updateDateFilter.toISOString().split('T')[0] : ''}
                  onChange={e =>
                    setUpdateDateFilter(
                      e.target.value ? new Date(e.target.value + 'T00:00:00') : null
                    )
                  }
                />
                {updateDateFilter && (
                  <button
                    onClick={() => setUpdateDateFilter(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    title="Clear date filter"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Responsive Task Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 xl:gap-6">
        {isLoading ? (
          [1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse bg-white dark:bg-[#15232D] border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-5 space-y-4">
              <div className="h-5 bg-muted/60 rounded w-1/3"></div>
              <div className="h-6 bg-muted/60 rounded w-3/4"></div>
              <div className="h-12 bg-muted/40 rounded w-full"></div>
              <div className="space-y-2 pt-2 border-t border-muted/30">
                <div className="h-4 bg-muted/40 rounded w-1/2"></div>
                <div className="h-4 bg-muted/40 rounded w-2/3"></div>
              </div>
            </Card>
          ))
        ) : filteredAndSortedTasks.length === 0 ? (
          <div className="col-span-full bg-white dark:bg-[#15232D] border border-dashed border-[#DFE8EC] dark:border-[#2A3D48] rounded-2xl p-8 md:p-12 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6] flex items-center justify-center">
              <CalendarCheck className="w-7 h-7" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-lg font-semibold text-[#172B3A] dark:text-[#E8F0F4]">
                {hasActiveFilters ? 'No matching tasks found' : 'No tasks scheduled yet'}
              </h3>
              <p className="text-sm text-[#64748B] dark:text-[#A6B5C0]">
                {hasActiveFilters 
                  ? 'Try adjusting your search query, status, or priority filters to find what you are looking for.' 
                  : 'Tasks assigned to you or created by your team will appear here.'}
              </p>
            </div>
            {hasActiveFilters ? (
              <Button 
                variant="outline" 
                onClick={handleClearFilters}
                className="text-xs h-9 border-[#DFE8EC] dark:border-[#2A3D48]"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-2" />
                Clear All Filters
              </Button>
            ) : canManage && (
              <Button 
                onClick={() => handleOpenDialog()}
                className="bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs h-9"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Create First Task
              </Button>
            )}
          </div>
        ) : (
          filteredAndSortedTasks.map((task) => {
            const uiStatus = toUiStatus(task.status, task);
            const isCompleted = uiStatus === 'completed';
            const isExpired = isTaskExpired(task);
            const isInProgress = uiStatus === 'inProgress';
            const assigneeUser = users.find(x => toIdText(x.id) === toIdText(task.assignee));
            const assigneeDisplayName = assigneeUser ? (assigneeUser.name || assigneeUser.username || 'Staff') : (toIdText(task.assignee) || 'Unassigned');
            const assigneeInitials = assigneeDisplayName.slice(0, 2).toUpperCase();

            return (
              <Card
                key={task.id}
                className={`group relative overflow-hidden transition-all duration-200 border rounded-xl flex flex-col justify-between ${
                  isCompleted
                    ? 'bg-emerald-50/20 dark:bg-emerald-950/10 border-emerald-500/25 dark:border-emerald-900/40 hover:border-emerald-500/50 hover:shadow-md'
                    : isExpired
                    ? 'bg-rose-50/20 dark:bg-rose-950/10 border-rose-500/30 dark:border-rose-900/40 hover:border-rose-500/50 hover:shadow-md'
                    : 'bg-white dark:bg-[#15232D] border-[#DFE8EC] dark:border-[#2A3D48] hover:border-[#0D9488]/40 dark:hover:border-[#14B8A6]/40 hover:shadow-md'
                }`}
              >
                {/* Status top accent stripe */}
                <div className={`h-1 w-full ${
                  isCompleted ? 'bg-emerald-500' :
                  isExpired ? 'bg-rose-500' :
                  isInProgress ? 'bg-teal-500' :
                  'bg-[#0D9488]/40'
                }`} />

                <CardHeader className="p-5 pb-3 space-y-3">
                  {/* Top row: Badges + Management Action Buttons */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Status Badge */}
                      <Badge className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${
                        isCompleted 
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                          : isExpired 
                          ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25 font-semibold'
                          : isInProgress 
                          ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/25'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25'
                      }`}>
                        {formatStatusLabel(uiStatus, task)}
                      </Badge>

                      {/* Priority Badge */}
                      <Badge className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${
                        task.priority === 'high' 
                          ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20' 
                          : task.priority === 'medium' 
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20' 
                          : 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20'
                      }`}>
                        {task.priority ? (task.priority.charAt(0).toUpperCase() + task.priority.slice(1)) : 'Medium'}
                      </Badge>

                      {/* Compact warning badge if expired and not completed */}
                      {isExpired && !isCompleted && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-900/50">
                          <AlertTriangle className="w-3 h-3" />
                          Past Deadline
                        </span>
                      )}
                    </div>

                    {/* Manager Edit & Delete Buttons */}
                    {canManage && (
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-[#64748B] hover:text-[#0D9488] dark:hover:text-[#14B8A6] rounded-md"
                          onClick={() => handleOpenDialog(task)}
                          title="Edit Task"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-[#64748B] hover:text-rose-600 rounded-md"
                          onClick={() => handleDelete(task.id)}
                          title="Delete Task"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Task Title & Assignor Attribution */}
                  <div className="space-y-1">
                    <h3
                      className="text-base font-medium text-[#172B3A] dark:text-[#E8F0F4] group-hover:text-[#0D9488] dark:group-hover:text-[#14B8A6] transition-colors cursor-pointer line-clamp-1"
                      onClick={() => setSelectedTask(task)}
                      title="Click to view details"
                    >
                      {task.title}
                    </h3>
                    {task.assignorName && (
                      <p className="text-[11px] text-[#64748B] dark:text-[#A6B5C0]">
                        Assigned by <span className="font-medium text-foreground">{task.assignorName}</span>
                      </p>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-5 pt-0 space-y-4">
                  {/* Task Description */}
                  <p className="text-xs md:text-sm text-[#64748B] dark:text-[#A6B5C0] line-clamp-2 leading-relaxed min-h-[2.5rem]">
                    {task.description || 'No additional description provided.'}
                  </p>

                  {/* Structured Details Box */}
                  <div className="bg-[#F4F8FA] dark:bg-[#1D303B] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-lg p-3 space-y-2 text-xs">
                    {/* Assignee */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#64748B] dark:text-[#A6B5C0] flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        Assignee:
                      </span>
                      <div className="flex items-center gap-1.5 font-medium text-[#172B3A] dark:text-[#E8F0F4] truncate max-w-[65%]">
                        <span className="w-4 h-4 rounded-full bg-[#0D9488]/15 text-[#0D9488] dark:text-[#14B8A6] flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                          {assigneeInitials}
                        </span>
                        <span className="truncate" title={assigneeDisplayName}>
                          {assigneeDisplayName}
                        </span>
                      </div>
                    </div>

                    {/* Timeline (Start - End) */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#64748B] dark:text-[#A6B5C0] flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Dates:
                      </span>
                      <span className="font-medium text-[#172B3A] dark:text-[#E8F0F4] text-right">
                        {formatDisplayDate(task.rawStartDate || task.startDate)} — {formatDisplayDate(task.rawEndDate || task.endDate)}
                      </span>
                    </div>

                    {/* Assigned Time / Deadline */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#DFE8EC]/60 dark:border-[#2A3D48]/60">
                      <span className="text-[#64748B] dark:text-[#A6B5C0] flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        Assigned Time:
                      </span>
                      <span className={`text-right font-medium truncate ${
                        isExpired ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-[#172B3A] dark:text-[#E8F0F4]'
                      }`} title={formatDeadline(task) || `${formatDisplayDate(task.rawEndDate || task.endDate)} (End of day)`}>
                        {formatDeadline(task) || `${formatDisplayDate(task.rawEndDate || task.endDate)} (End of day)`}
                      </span>
                    </div>
                  </div>

                  {/* Card Footer: Action Row */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#DFE8EC] dark:border-[#2A3D48]">
                    {isStaff && isAssignedToMe(task) && !isCompleted ? (
                      isExpired ? (
                        <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                          Time Expired
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs h-7 px-2.5 rounded-md shadow-sm flex items-center gap-1.5"
                          onClick={() => handleMarkCompleted(task)}
                          disabled={updateTask.isPending}
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{updateTask.isPending ? 'Updating...' : 'Mark Done'}</span>
                        </Button>
                      )
                    ) : isCompleted ? (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Completed
                      </span>
                    ) : (
                      <div />
                    )}

                    {/* View Details Button */}
                    <button
                      type="button"
                      onClick={() => setSelectedTask(task)}
                      className="text-xs font-medium text-[#0D9488] dark:text-[#14B8A6] hover:text-[#0F766E] transition-colors flex items-center gap-1 ml-auto"
                    >
                      <span>Details & Updates</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* 5. Polished Task Details Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="w-[95vw] max-w-3xl bg-white dark:bg-[#15232D] border-[#DFE8EC] dark:border-[#2A3D48] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-3 border-b border-[#DFE8EC] dark:border-[#2A3D48]">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              {selectedTask && (
                <>
                  <Badge className={`text-xs px-2.5 py-0.5 rounded-md border ${
                    toUiStatus(selectedTask.status, selectedTask) === 'completed'
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                      : isTaskExpired(selectedTask)
                      ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25 font-semibold'
                      : toUiStatus(selectedTask.status, selectedTask) === 'inProgress'
                      ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/25'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25'
                  }`}>
                    {formatStatusLabel(toUiStatus(selectedTask.status, selectedTask), selectedTask)}
                  </Badge>
                  <Badge className={`text-xs px-2.5 py-0.5 rounded-md border ${
                    selectedTask.priority === 'high' 
                      ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20' 
                      : selectedTask.priority === 'medium' 
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20' 
                      : 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20'
                  }`}>
                    {selectedTask.priority ? (selectedTask.priority.charAt(0).toUpperCase() + selectedTask.priority.slice(1)) : 'Medium'} Priority
                  </Badge>
                </>
              )}
            </div>
            <DialogTitle className="text-xl font-medium text-[#172B3A] dark:text-[#E8F0F4]">
              {selectedTask?.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            {selectedTask && isTaskExpired(selectedTask) && toUiStatus(selectedTask.status, selectedTask) !== 'completed' && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-800 dark:text-rose-200 text-xs md:text-sm font-medium flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />
                <span>
                  The assigned deadline for this task has passed ({formatDeadline(selectedTask) || 'Past Deadline'}). This task is marked as <strong>Not Completed</strong> and can no longer be modified.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#F4F8FA] dark:bg-[#1D303B] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-4 space-y-2">
                <h4 className="font-medium text-xs text-[#64748B] dark:text-[#A6B5C0] uppercase tracking-wider">
                  Description
                </h4>
                <p className="text-sm text-[#172B3A] dark:text-[#E8F0F4] whitespace-pre-wrap leading-relaxed">
                  {selectedTask?.description || 'No description provided.'}
                </p>
              </div>

              <div className="bg-[#F4F8FA] dark:bg-[#1D303B] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-4 space-y-3">
                <h4 className="font-medium text-xs text-[#64748B] dark:text-[#A6B5C0] uppercase tracking-wider">
                  Timeline & Deadline
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#64748B] dark:text-[#A6B5C0]">Start Date:</span>
                    <span className="font-medium text-[#172B3A] dark:text-[#E8F0F4]">
                      {selectedTask && formatDisplayDate(selectedTask.rawStartDate || selectedTask.startDate)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B] dark:text-[#A6B5C0]">End Date:</span>
                    <span className="font-medium text-[#172B3A] dark:text-[#E8F0F4]">
                      {selectedTask && formatDisplayDate(selectedTask.rawEndDate || selectedTask.endDate)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-[#DFE8EC]/60 dark:border-[#2A3D48]/60">
                    <span className="text-[#64748B] dark:text-[#A6B5C0]">Assigned Time / Deadline:</span>
                    <span className={`font-semibold ${
                      selectedTask && isTaskExpired(selectedTask) && toUiStatus(selectedTask.status, selectedTask) !== 'completed'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-[#0D9488] dark:text-[#14B8A6]'
                    }`}>
                      {selectedTask && (formatDeadline(selectedTask) || `${formatDisplayDate(selectedTask.rawEndDate || selectedTask.endDate)} (End of day)`)}
                    </span>
                  </div>
                  {selectedTask?.assignorName && (
                    <div className="flex justify-between">
                      <span className="text-[#64748B] dark:text-[#A6B5C0]">Assigned By:</span>
                      <span className="font-medium text-[#172B3A] dark:text-[#E8F0F4]">{selectedTask.assignorName}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Updates History */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm text-[#172B3A] dark:text-[#E8F0F4] flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#0D9488] dark:text-[#14B8A6]" />
                  <span>Task Updates History</span>
                </h4>
                {selectedTask && (
                  <span className="text-xs text-[#64748B] dark:text-[#A6B5C0]">
                    {getFilteredUpdatesForTask(selectedTask).length} update(s)
                  </span>
                )}
              </div>

              <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                {selectedTask && getFilteredUpdatesForTask(selectedTask).length === 0 ? (
                  <div className="text-center py-6 bg-[#F4F8FA] dark:bg-[#1D303B] rounded-xl border border-[#DFE8EC] dark:border-[#2A3D48]">
                    <p className="text-xs text-[#64748B] dark:text-[#A6B5C0]">No updates recorded yet for this task.</p>
                  </div>
                ) : (
                  selectedTask && getFilteredUpdatesForTask(selectedTask).map(update => (
                    <div 
                      key={update.id} 
                      className="bg-[#F4F8FA] dark:bg-[#1D303B] border border-[#DFE8EC] dark:border-[#2A3D48] p-3.5 rounded-xl text-sm space-y-1.5"
                    >
                      <div className="flex justify-between items-center text-xs text-[#64748B] dark:text-[#A6B5C0]">
                        <span className="font-medium text-[#172B3A] dark:text-[#E8F0F4]">
                          {users.find(u => u.id && u.id.toText && u.id.toText() === (update.staffId?.toText ? update.staffId.toText() : String(update.staffId)))?.username || 'Staff'}
                        </span>
                        <span>{formatUpdateTime(update.createdAt)}</span>
                      </div>
                      <p className="text-xs md:text-sm text-[#172B3A] dark:text-[#E8F0F4]">{update.details}</p>
                      <div className="flex justify-end pt-1">
                        <Badge variant="outline" className={`text-[10px] h-5 ${
                          update.status === 'completed' 
                            ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' 
                            : 'border-teal-500/30 text-teal-600 dark:text-teal-400 bg-teal-500/10'
                        }`}>
                          {update.status === 'completed' ? 'Completed' : 'In Progress'}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
