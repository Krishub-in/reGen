import { useMemo, useState, useEffect } from 'react';
import { 
  useGetAllTasks, 
  useCreateTask, 
  useUpdateTask, 
  useDeleteTask, 
  useGetAllUsers, 
  useGetAllTaskUpdates, 
  useAddTaskUpdate, 
  useGetAllHolidays, 
  useGetAllLeaveRequests,
  useGetProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useCreateProjectTask
} from '../../hooks/useQueries';
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
  ClipboardList,
  Play,
  Pause,
  FolderKanban,
  Briefcase,
  Users,
  CheckSquare,
  Send,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowLeft
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { safeRandomUUID, hasUserRole, getUserRoleKey } from '@/lib/utils';
import { isTaskExpired, getTaskUiStatus, getTaskStatusLabel, getTaskStatusBadgeClass, formatDeadline, getTaskDeadline } from '@/lib/taskUtils';
import VoiceDescriptionInput from '../VoiceDescriptionInput';
import VoiceNoteBadgePlayer, { extractVoiceNote } from '../VoiceNoteBadgePlayer';

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
    if (key === 'paused') return 'paused';
    if (key === 'done' || key === 'completed') return 'completed';
    if (key === 'not_completed' || key === 'notCompleted') return 'not_completed';
    return 'todo';
  };

  const formatStatusLabel = (ui, task) => {
    if (task) return getTaskStatusLabel(task);
    if (ui === 'inProgress') return 'In Progress';
    if (ui === 'paused') return 'Paused';
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
    if (ui === 'paused') return 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-800 font-medium';
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

  // Combined helper to compute End Date & End Time automatically
  const computeEndDateTime = useMemo(() => {
    return (startIso, durationValue, durationUnit = 'days', assignee) => {
      if (!startIso) return { endDate: '', dueTime: '' };
      const durVal = parseFloat(durationValue);
      if (isNaN(durVal) || durVal <= 0) {
        return { endDate: startIso, dueTime: '18:00' };
      }

      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');
      const isToday = startIso === todayStr;

      if (durationUnit === 'hours') {
        if (isToday) {
          const targetTime = new Date(now.getTime() + durVal * 3600 * 1000);
          const endDate = format(targetTime, 'yyyy-MM-dd');
          const dueTime = format(targetTime, 'HH:mm');
          return { endDate, dueTime };
        } else {
          const [y, m, d] = startIso.split('-').map(Number);
          const baseDate = new Date(y, m - 1, d, 9, 30, 0, 0);
          const targetTime = new Date(baseDate.getTime() + durVal * 3600 * 1000);
          const endDate = format(targetTime, 'yyyy-MM-dd');
          const dueTime = format(targetTime, 'HH:mm');
          return { endDate, dueTime };
        }
      }

      if (durationUnit === 'minutes') {
        if (isToday) {
          const targetTime = new Date(now.getTime() + durVal * 60 * 1000);
          const endDate = format(targetTime, 'yyyy-MM-dd');
          const dueTime = format(targetTime, 'HH:mm');
          return { endDate, dueTime };
        } else {
          const [y, m, d] = startIso.split('-').map(Number);
          const baseDate = new Date(y, m - 1, d, 9, 30, 0, 0);
          const targetTime = new Date(baseDate.getTime() + durVal * 60 * 1000);
          const endDate = format(targetTime, 'yyyy-MM-dd');
          const dueTime = format(targetTime, 'HH:mm');
          return { endDate, dueTime };
        }
      }

      // Default 'days'
      const computedDate = computeEndDate(startIso, durVal, 'days', assignee) || startIso;
      return { endDate: computedDate, dueTime: '18:00' };
    };
  }, [computeEndDate]);

  // Auto-adjust End Date & End Time when Start/Duration/Assignee changes
  useEffect(() => {
    if (formData.startDate && formData.durationValue) {
      const { endDate: nextEndDate, dueTime: nextDueTime } = computeEndDateTime(
        formData.startDate,
        formData.durationValue,
        formData.durationUnit,
        formData.assignee || formData.assignedTo
      );
      setFormData(prev => {
        const needDateUpdate = nextEndDate && prev.endDate !== nextEndDate;
        const needTimeUpdate = nextDueTime && prev.dueTime !== nextDueTime;
        if (!needDateUpdate && !needTimeUpdate) return prev;
        return {
          ...prev,
          ...(needDateUpdate ? { endDate: nextEndDate } : {}),
          ...(needTimeUpdate ? { dueTime: nextDueTime } : {})
        };
      });
    }
  }, [formData.startDate, formData.durationValue, formData.durationUnit, formData.assignee, formData.assignedTo, computeEndDateTime]);

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

  const handleStartTask = async (task) => {
    if (isTaskExpired(task)) {
      toast.error('The assigned time for this task has ended. This task is marked as Not Completed and cannot be started.');
      return;
    }
    try {
      await updateTask.mutateAsync({
        id: task.id,
        title: task.title,
        description: task.description,
        assignedTo: task.assignedTo || task.assignee,
        assignee: task.assignedTo || task.assignee,
        status: 'in_progress',
        startDate: task.startDate,
        endDate: task.endDate,
        dueTime: task.dueTime || task.endTime || '',
        endTime: task.endTime || task.dueTime || '',
      });
      toast.success(`Task "${task.title}" is now running. Other active tasks for you have been paused.`);
    } catch (err) {
      toast.error(err?.message || 'Failed to start task');
    }
  };

  const handlePauseTask = async (task) => {
    try {
      await updateTask.mutateAsync({
        id: task.id,
        title: task.title,
        description: task.description,
        assignedTo: task.assignedTo || task.assignee,
        assignee: task.assignedTo || task.assignee,
        status: 'paused',
        startDate: task.startDate,
        endDate: task.endDate,
        dueTime: task.dueTime || task.endTime || '',
        endTime: task.endTime || task.dueTime || '',
      });
      toast.success(`Task "${task.title}" paused.`);
    } catch (err) {
      toast.error(err?.message || 'Failed to pause task');
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

  // ==========================================
  // Projects Segment Data & States
  // ==========================================
  const { data: projects = [], isLoading: isProjectsLoading } = useGetProjects();
  const createProjectMutation = useCreateProject();
  const updateProjectMutation = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();
  const createProjectTaskMutation = useCreateProjectTask();

  const [activeSegment, setActiveSegment] = useState('projects'); // 'projects' | 'general'
  const [projectSearch, setProjectSearch] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState('all');
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [projectMemberSearch, setProjectMemberSearch] = useState('');
  const [projectFormData, setProjectFormData] = useState({
    name: '',
    description: '',
    priority: 'medium',
    status: 'active',
    startDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    assignedEmployees: [],
  });

  // Project Task Modal state
  const [isProjectTaskModalOpen, setIsProjectTaskModalOpen] = useState(false);
  const [selectedProjectForTask, setSelectedProjectForTask] = useState(null);
  const [projectTaskFormData, setProjectTaskFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    assignToAll: true,
    assignedTo: '',
    durationValue: '',
    durationUnit: 'days',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    dueTime: '',
  });

  // Auto-adjust End Date & End Time for Project Task when Start/Duration changes
  useEffect(() => {
    if (projectTaskFormData.startDate && projectTaskFormData.durationValue) {
      const { endDate: nextEndDate, dueTime: nextDueTime } = computeEndDateTime(
        projectTaskFormData.startDate,
        projectTaskFormData.durationValue,
        projectTaskFormData.durationUnit,
        projectTaskFormData.assignedTo
      );
      setProjectTaskFormData(prev => {
        const needDateUpdate = nextEndDate && prev.endDate !== nextEndDate;
        const needTimeUpdate = nextDueTime && prev.dueTime !== nextDueTime;
        if (!needDateUpdate && !needTimeUpdate) return prev;
        return {
          ...prev,
          ...(needDateUpdate ? { endDate: nextEndDate } : {}),
          ...(needTimeUpdate ? { dueTime: nextDueTime } : {})
        };
      });
    }
  }, [projectTaskFormData.startDate, projectTaskFormData.durationValue, projectTaskFormData.durationUnit, projectTaskFormData.assignedTo, computeEndDateTime]);

  // Expanded project accordion state
  const [expandedProjects, setExpandedProjects] = useState(new Set());
  const toggleProjectExpanded = (projectId) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const handleOpenCreateProject = (proj = null) => {
    if (proj) {
      setEditingProject(proj);
      setProjectFormData({
        name: proj.name || '',
        description: proj.description || '',
        priority: proj.priority || 'medium',
        status: proj.status || 'active',
        startDate: proj.startDate || new Date().toISOString().split('T')[0],
        dueDate: proj.dueDate || '',
        assignedEmployees: proj.assignedEmployees || [],
      });
    } else {
      setEditingProject(null);
      setProjectFormData({
        name: '',
        description: '',
        priority: 'medium',
        status: 'active',
        startDate: new Date().toISOString().split('T')[0],
        dueDate: '',
        assignedEmployees: [],
      });
    }
    setProjectMemberSearch('');
    setIsCreateProjectOpen(true);
  };

  const handleToggleProjectMember = (user) => {
    const uid = toIdText(user.id || user.userId);
    const exists = projectFormData.assignedEmployees.some(e => toIdText(e.userId) === uid);
    if (exists) {
      setProjectFormData(prev => ({
        ...prev,
        assignedEmployees: prev.assignedEmployees.filter(e => toIdText(e.userId) !== uid),
      }));
    } else {
      setProjectFormData(prev => ({
        ...prev,
        assignedEmployees: [
          ...prev.assignedEmployees,
          {
            userId: uid,
            name: user.name || user.username || 'Staff',
            role: getUserRoleKey(user.role),
            email: user.email || '',
            avatar: user.avatar || '',
          }
        ]
      }));
    }
  };

  const handleSelectAllProjectMembers = () => {
    if (projectFormData.assignedEmployees.length === assigneeOptions.length) {
      setProjectFormData(prev => ({ ...prev, assignedEmployees: [] }));
    } else {
      setProjectFormData(prev => ({
        ...prev,
        assignedEmployees: assigneeOptions.map(u => ({
          userId: toIdText(u.id || u.userId),
          name: u.name || u.username || 'Staff',
          role: getUserRoleKey(u.role),
          email: u.email || '',
          avatar: u.avatar || '',
        }))
      }));
    }
  };

  const handleSaveProject = async (e) => {
    e.preventDefault();
    if (!projectFormData.name.trim()) {
      toast.error('Project name is required');
      return;
    }
    if (projectFormData.assignedEmployees.length === 0) {
      toast.error('Please assign at least one employee to this project');
      return;
    }

    try {
      if (editingProject) {
        await updateProjectMutation.mutateAsync({
          id: editingProject.id,
          ...projectFormData,
        });
        toast.success(`Project "${projectFormData.name}" updated successfully`);
      } else {
        await createProjectMutation.mutateAsync(projectFormData);
        toast.success(`Project "${projectFormData.name}" created and assigned to ${projectFormData.assignedEmployees.length} employee(s)`);
      }
      setIsCreateProjectOpen(false);
      setEditingProject(null);
    } catch (err) {
      toast.error(err?.message || 'Failed to save project');
    }
  };

  const handleDeleteProject = async (projectId) => {
    if (confirm('Are you sure you want to delete this project? Existing tasks linked to this project will be unlinked.')) {
      try {
        await deleteProjectMutation.mutateAsync(projectId);
        toast.success('Project deleted successfully');
      } catch (err) {
        toast.error(err?.message || 'Failed to delete project');
      }
    }
  };

  const handleOpenAddProjectTask = (project) => {
    setSelectedProjectForTask(project);
    setProjectTaskFormData({
      title: '',
      description: '',
      priority: 'medium',
      assignToAll: true,
      assignedTo: project.assignedEmployees?.[0]?.userId || '',
      durationValue: '',
      durationUnit: 'days',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      dueTime: '',
    });
    setIsProjectTaskModalOpen(true);
  };

  const handleSaveProjectTask = async (e) => {
    e.preventDefault();
    if (!selectedProjectForTask) return;
    if (!projectTaskFormData.title.trim()) {
      toast.error('Task title is required');
      return;
    }
    if (!projectTaskFormData.assignToAll && !projectTaskFormData.assignedTo) {
      toast.error('Please select an employee for this task');
      return;
    }
    if (!projectTaskFormData.startDate || !projectTaskFormData.endDate) {
      toast.error('Please select start and end dates');
      return;
    }

    try {
      await createProjectTaskMutation.mutateAsync({
        projectId: selectedProjectForTask.id,
        ...projectTaskFormData,
      });

      const count = projectTaskFormData.assignToAll ? selectedProjectForTask.assignedEmployees.length : 1;
      toast.success(`Project task assigned to ${count} employee(s) and notification sent!`);
      setIsProjectTaskModalOpen(false);
      setExpandedProjects(prev => new Set(prev).add(selectedProjectForTask.id));
    } catch (err) {
      toast.error(err?.message || 'Failed to create project task');
    }
  };

  // Filter projects based on role & search
  const visibleProjects = useMemo(() => {
    const myId = toIdText(userProfile?.userId || userProfile?.id || '');
    return projects.filter(p => {
      if (!canManage) {
        const isMember = (p.assignedEmployees || []).some(e => toIdText(e.userId) === myId);
        if (!isMember) return false;
      }
      if (projectStatusFilter !== 'all' && p.status !== projectStatusFilter) {
        return false;
      }
      if (projectSearch.trim()) {
        const q = projectSearch.toLowerCase();
        const nameMatch = (p.name || '').toLowerCase().includes(q);
        const descMatch = (p.description || '').toLowerCase().includes(q);
        const memberMatch = (p.assignedEmployees || []).some(e => (e.name || '').toLowerCase().includes(q));
        if (!nameMatch && !descMatch && !memberMatch) return false;
      }
      return true;
    });
  }, [projects, canManage, userProfile, projectStatusFilter, projectSearch]);

  const projectMetrics = useMemo(() => {
    const total = visibleProjects.length;
    const active = visibleProjects.filter(p => p.status === 'active').length;
    const completed = visibleProjects.filter(p => p.status === 'completed').length;
    const totalProjectTasks = visibleProjects.reduce((acc, p) => acc + (p.taskCount || 0), 0);
    return { total, active, completed, totalProjectTasks };
  }, [visibleProjects]);

  // Selected Project and Employee Filtering state in Schedules
  const [selectedScheduleProjectId, setSelectedScheduleProjectId] = useState(null);
  const [selectedProjectEmployeeFilter, setSelectedProjectEmployeeFilter] = useState('all');
  const [selectedProjectTaskStatusFilter, setSelectedProjectTaskStatusFilter] = useState('all');

  const activeSelectedProject = useMemo(() => {
    if (!visibleProjects.length) return null;
    if (selectedScheduleProjectId) {
      return visibleProjects.find(p => p.id === selectedScheduleProjectId) || null;
    }
    return null;
  }, [visibleProjects, selectedScheduleProjectId]);

  const activeSelectedProjectTasks = useMemo(() => {
    if (!activeSelectedProject) return [];
    const pUuid = String(activeSelectedProject.id || '');
    const pMongoId = String(activeSelectedProject._id || '');
    const pName = String(activeSelectedProject.name || '').trim().toLowerCase();

    return tasks.filter(t => {
      const tProjId = String(t.projectId?._id || t.projectId?.id || t.projectId || '');
      const tProjName = String(t.projectName || '').trim().toLowerCase();
      if (pUuid && tProjId && tProjId === pUuid) return true;
      if (pMongoId && tProjId && tProjId === pMongoId) return true;
      if (pName && tProjName && tProjName === pName) return true;
      return false;
    });
  }, [tasks, activeSelectedProject]);

  const activeSelectedProjectEmployees = useMemo(() => {
    if (!activeSelectedProject) return [];
    const memberMap = new Map();

    (activeSelectedProject.assignedEmployees || []).forEach(emp => {
      const uid = toIdText(emp.userId);
      if (uid) {
        memberMap.set(uid, {
          userId: uid,
          name: emp.name || emp.username || 'Staff',
          role: emp.role || 'Staff',
          email: emp.email || '',
          avatar: emp.avatar || '',
        });
      }
    });

    activeSelectedProjectTasks.forEach(task => {
      const uids = Array.isArray(task.assignedTo)
        ? task.assignedTo.map(toIdText)
        : task.assignee
        ? [toIdText(task.assignee)]
        : [];
      uids.forEach(uid => {
        if (uid && !memberMap.has(uid)) {
          const found = users.find(u => toIdText(u.id) === uid);
          memberMap.set(uid, {
            userId: uid,
            name: found?.name || found?.username || 'Staff',
            role: found?.role || 'Staff',
            email: found?.email || '',
            avatar: found?.avatar || '',
          });
        }
      });
    });

    return Array.from(memberMap.values());
  }, [activeSelectedProject, activeSelectedProjectTasks, users]);

  const displayedSelectedProjectTasks = useMemo(() => {
    return activeSelectedProjectTasks.filter(task => {
      if (selectedProjectEmployeeFilter !== 'all') {
        const tAssignee = toIdText(task.assignee);
        const tAssignedTo = Array.isArray(task.assignedTo) ? task.assignedTo.map(toIdText) : [];
        if (tAssignee !== selectedProjectEmployeeFilter && !tAssignedTo.includes(selectedProjectEmployeeFilter)) {
          return false;
        }
      }

      if (selectedProjectTaskStatusFilter !== 'all') {
        const ui = toUiStatus(task.status, task);
        if (selectedProjectTaskStatusFilter === 'completed' && ui !== 'completed') return false;
        if (selectedProjectTaskStatusFilter === 'inProgress' && ui !== 'inProgress') return false;
        if (selectedProjectTaskStatusFilter === 'paused' && task.status !== 'paused') return false;
        if (selectedProjectTaskStatusFilter === 'todo' && ui !== 'todo' && ui !== 'not_completed') return false;
      }

      return true;
    });
  }, [activeSelectedProjectTasks, selectedProjectEmployeeFilter, selectedProjectTaskStatusFilter]);

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
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {activeSegment === 'general' ? (
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
                    <VoiceDescriptionInput
                      id="task-description"
                      label="Task Description"
                      value={formData.description}
                      onChange={(val) => setFormData({ ...formData, description: val })}
                      placeholder="Add task instructions, voice-to-text dictation, or record a voice note..."
                      rows={3}
                    />
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
                            onChange={(e) => {
                              const val = e.target.value;
                              const { endDate, dueTime } = computeEndDateTime(formData.startDate, val, formData.durationUnit, formData.assignee);
                              setFormData(prev => ({
                                ...prev,
                                durationValue: val,
                                ...(endDate ? { endDate } : {}),
                                ...(dueTime ? { dueTime } : {})
                              }));
                            }}
                            placeholder="e.g., 8"
                          />
                          <Select 
                            value={formData.durationUnit} 
                            onValueChange={(val) => {
                              const { endDate, dueTime } = computeEndDateTime(formData.startDate, formData.durationValue, val, formData.assignee);
                              setFormData(prev => ({
                                ...prev,
                                durationUnit: val,
                                ...(endDate ? { endDate } : {}),
                                ...(dueTime ? { dueTime } : {})
                              }));
                            }}
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="hours">Hours</SelectItem>
                              <SelectItem value="days">Days</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="text-xs text-[#0D9488] font-medium flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> End Date & End Time auto-fill automatically
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="startDate">Start Date *</Label>
                        <Input
                          id="startDate"
                          type="date"
                          value={formData.startDate}
                          onChange={(e) => {
                            const val = e.target.value;
                            const { endDate, dueTime } = computeEndDateTime(val, formData.durationValue, formData.durationUnit, formData.assignee);
                            setFormData(prev => ({
                              ...prev,
                              startDate: val,
                              ...(endDate ? { endDate } : {}),
                              ...(dueTime ? { dueTime } : {})
                            }));
                          }}
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
                        <p className="text-[11px] text-muted-foreground">Auto-calculated from Start & Duration</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dueTime">End Time / Deadline</Label>
                        <Input
                          id="dueTime"
                          type="time"
                          value={formData.dueTime}
                          onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                        />
                        <p className="text-[11px] text-muted-foreground">Auto-calculated cutoff time</p>
                      </div>
                    </div>
                    <Button type="submit" className="w-full bg-[#0D9488] hover:bg-[#0F766E] text-white" disabled={createTask.isPending || updateTask.isPending}>
                      {(createTask.isPending || updateTask.isPending) ? 'Saving...' : 'Save Task'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
        )}
      </div>

      {/* Segment Switcher Tabs: Projects first, then General Tasks */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DFE8EC] dark:border-[#2A3D48] pb-3">
        <div className="flex items-center gap-1.5 p-1 bg-[#F4F8FA] dark:bg-[#15232D] rounded-xl border border-[#DFE8EC] dark:border-[#2A3D48]">
          <button
            type="button"
            onClick={() => setActiveSegment('projects')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all ${
              activeSegment === 'projects'
                ? 'bg-white dark:bg-[#1D303B] text-[#0D9488] dark:text-[#14B8A6] shadow-xs'
                : 'text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-white'
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            <span>Projects</span>
            <Badge variant="outline" className={`ml-1 text-[10px] h-4.5 px-1.5 ${
              activeSegment === 'projects' ? 'border-[#0D9488]/30 bg-[#0D9488]/10 text-[#0D9488]' : 'text-muted-foreground'
            }`}>
              {projects.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveSegment('general')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all ${
              activeSegment === 'general'
                ? 'bg-white dark:bg-[#1D303B] text-[#0D9488] dark:text-[#14B8A6] shadow-xs'
                : 'text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-white'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>General Tasks</span>
            <Badge variant="outline" className={`ml-1 text-[10px] h-4.5 px-1.5 ${
              activeSegment === 'general' ? 'border-[#0D9488]/30 bg-[#0D9488]/10 text-[#0D9488]' : 'text-muted-foreground'
            }`}>
              {taskMetrics.total}
            </Badge>
          </button>
        </div>

        <div className="text-xs text-[#64748B] dark:text-[#A6B5C0] hidden sm:block">
          {activeSegment === 'projects' ? (
            <span>Collaborative projects with multi-employee task assignment</span>
          ) : (
            <span>Standalone general tasks not bound to a project</span>
          )}
        </div>
      </div>

      {activeSegment === 'general' ? (
        <div className="space-y-6">

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
          <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-lg w-full">
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

                      {/* Project Badge if linked to a Project */}
                      {task.projectName && (
                        <Badge className="text-[11px] font-medium px-2 py-0.5 rounded-md border bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25 flex items-center gap-1">
                          <FolderKanban className="w-3 h-3 text-indigo-500" />
                          <span>{task.projectName}</span>
                        </Badge>
                      )}

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
                        <div className="flex items-center gap-1.5">
                          {isInProgress ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-xs h-7 px-2.5 rounded-md shadow-xs flex items-center gap-1"
                              onClick={() => handlePauseTask(task)}
                              disabled={updateTask.isPending}
                              title="Pause this task"
                            >
                              <Pause className="w-3.5 h-3.5" />
                              <span>Pause</span>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="bg-teal-600 hover:bg-teal-700 text-white text-xs h-7 px-2.5 rounded-md shadow-xs flex items-center gap-1"
                              onClick={() => handleStartTask(task)}
                              disabled={updateTask.isPending}
                              title="Start this task (pauses any other running task)"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>{uiStatus === 'paused' ? 'Resume' : 'Start'}</span>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs h-7 px-2.5 rounded-md shadow-sm flex items-center gap-1"
                            onClick={() => handleMarkCompleted(task)}
                            disabled={updateTask.isPending}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Done</span>
                          </Button>
                        </div>
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
        </div>
      ) : (
        /* ========================================================= */
        /* PROJECTS SEGMENT                                         */
        /* ========================================================= */
        <div className="space-y-6">
          {/* Projects KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-4 shadow-sm flex items-center justify-between transition-all">
              <div className="space-y-1">
                <p className="text-xs font-medium text-[#64748B] dark:text-[#A6B5C0]">Total Projects</p>
                <p className="text-2xl font-semibold text-[#172B3A] dark:text-[#E8F0F4]">{projectMetrics.total}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <FolderKanban className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-4 shadow-sm flex items-center justify-between transition-all">
              <div className="space-y-1">
                <p className="text-xs font-medium text-[#64748B] dark:text-[#A6B5C0]">Active Projects</p>
                <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{projectMetrics.active}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-4 shadow-sm flex items-center justify-between transition-all">
              <div className="space-y-1">
                <p className="text-xs font-medium text-[#64748B] dark:text-[#A6B5C0]">Completed</p>
                <p className="text-2xl font-semibold text-blue-600 dark:text-blue-400">{projectMetrics.completed}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-4 shadow-sm flex items-center justify-between transition-all">
              <div className="space-y-1">
                <p className="text-xs font-medium text-[#64748B] dark:text-[#A6B5C0]">Project Tasks</p>
                <p className="text-2xl font-semibold text-indigo-600 dark:text-indigo-400">{projectMetrics.totalProjectTasks}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Projects Toolbar */}
          <div className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-3.5 md:p-4 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-lg w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B] dark:text-[#A6B5C0]" />
                <Input
                  type="text"
                  placeholder="Search projects by name, description, or team member..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="pl-9 h-9 text-xs md:text-sm bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] rounded-lg focus-visible:ring-1 focus-visible:ring-[#0D9488]"
                />
                {projectSearch && (
                  <button
                    onClick={() => setProjectSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground p-0.5"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Select value={projectStatusFilter} onValueChange={setProjectStatusFilter}>
                  <SelectTrigger className="h-9 w-[140px] text-xs bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48]">
                    <SelectValue placeholder="Status: All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on-hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>

                {(projectSearch || projectStatusFilter !== 'all') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setProjectSearch('');
                      setProjectStatusFilter('all');
                    }}
                    className="h-9 px-2.5 text-xs text-[#64748B] hover:text-[#0D9488] flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Projects View */}
          {visibleProjects.length === 0 ? (
            <div className="bg-white dark:bg-[#15232D] border border-dashed border-[#DFE8EC] dark:border-[#2A3D48] rounded-2xl p-10 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6] flex items-center justify-center">
                <FolderKanban className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-lg font-semibold text-[#172B3A] dark:text-[#E8F0F4]">
                  {projectSearch || projectStatusFilter !== 'all' ? 'No matching projects found' : 'No projects assigned to company'}
                </h3>
                <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#A6B5C0]">
                  {projectSearch || projectStatusFilter !== 'all'
                    ? 'Try adjusting your search query or status filter.'
                    : 'Company projects and collaborative assignments will appear here.'}
                </p>
              </div>
            </div>
          ) : !activeSelectedProject ? (
            /* ONLY LIST OF PROJECTS SHOWS INITIALLY */
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div>
                  <h3 className="text-base font-bold text-[#172B3A] dark:text-[#E8F0F4]">
                    Company Projects ({visibleProjects.length})
                  </h3>
                  <p className="text-xs text-[#64748B] dark:text-[#A6B5C0]">
                    Click any project below to view the employees working on it and their assigned task details
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                {visibleProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedScheduleProjectId(p.id);
                      setSelectedProjectEmployeeFilter('all');
                    }}
                    className="p-4 rounded-2xl border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] hover:border-[#0D9488] hover:shadow-sm transition-all text-left flex items-center justify-between group shadow-2xs cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-[#0D9488]/10 text-[#0D9488] flex items-center justify-center shrink-0 group-hover:bg-[#0D9488] group-hover:text-white transition-colors">
                        <FolderKanban className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-[#172B3A] dark:text-[#E8F0F4] group-hover:text-[#0D9488] transition-colors truncate">
                        {p.name}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#64748B] group-hover:text-[#0D9488] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* CLICKED PROJECT VIEW: BACK BUTTON + EMPLOYEES + TASK DETAILS */
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedScheduleProjectId(null)}
                  className="rounded-xl text-xs h-9 gap-2 border-[#DFE8EC] dark:border-[#2A3D48] text-[#172B3A] dark:text-[#E8F0F4] hover:bg-[#F4F8FA] dark:hover:bg-[#1D303B] shadow-2xs font-semibold"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Projects List</span>
                </Button>

                <span className="text-xs text-[#64748B] dark:text-[#A6B5C0]">
                  Project: <strong className="text-[#172B3A] dark:text-[#E8F0F4]">{activeSelectedProject.name}</strong>
                </span>
              </div>

              {/* Project Header Banner */}
              <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] shadow-xs overflow-hidden">
                <CardHeader className="p-5 sm:p-6 bg-[#F4F8FA]/60 dark:bg-[#1D303B]/40 border-b border-[#DFE8EC] dark:border-[#2A3D48]">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <Badge className={`capitalize font-semibold text-xs ${
                                activeSelectedProject.status === 'completed'
                                  ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
                                  : activeSelectedProject.status === 'on-hold'
                                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                              }`}>
                                {activeSelectedProject.status === 'on-hold' ? 'On Hold' : activeSelectedProject.status || 'Active'}
                              </Badge>
                              {activeSelectedProject.priority && (
                                <Badge variant="outline" className={`capitalize font-medium text-xs ${
                                  activeSelectedProject.priority === 'urgent' || activeSelectedProject.priority === 'high'
                                    ? 'text-red-600 border-red-500/40 bg-red-500/5'
                                    : 'text-muted-foreground'
                                }`}>
                                  {activeSelectedProject.priority} Priority
                                </Badge>
                              )}
                            </div>
                            <h3 className="text-xl font-bold text-[#172B3A] dark:text-[#E8F0F4]">{activeSelectedProject.name}</h3>
                          </div>

                          <div className="flex items-center gap-2">
                            {canManage && (
                              <Button
                                size="sm"
                                onClick={() => handleOpenAddProjectTask(activeSelectedProject)}
                                className="bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs h-9 px-3.5 rounded-xl shadow-xs gap-1.5"
                              >
                                <Plus className="w-4 h-4" />
                                <span>Add Project Task</span>
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Dates info */}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-[#64748B] dark:text-[#A6B5C0] mt-3">
                          {activeSelectedProject.startDate && (
                            <span className="inline-flex items-center gap-1 bg-card px-2.5 py-1 rounded-xl border border-[#DFE8EC] dark:border-[#2A3D48]">
                              <Calendar className="w-3.5 h-3.5 text-[#0D9488]" />
                              Start: {formatDisplayDate(activeSelectedProject.startDate)}
                            </span>
                          )}
                          {activeSelectedProject.dueDate && (
                            <span className="inline-flex items-center gap-1 bg-card px-2.5 py-1 rounded-xl border border-[#DFE8EC] dark:border-[#2A3D48]">
                              <Clock className="w-3.5 h-3.5 text-amber-500" />
                              Due: {formatDisplayDate(activeSelectedProject.dueDate)}
                            </span>
                          )}
                        </div>

                        {activeSelectedProject.description && (
                          <div className="mt-3 pt-3 border-t border-[#DFE8EC]/80 dark:border-[#2A3D48]/80">
                            <p className="text-xs sm:text-sm text-[#172B3A]/80 dark:text-[#E8F0F4]/80 leading-relaxed whitespace-pre-line">
                              {extractVoiceNote(activeSelectedProject.description).text || activeSelectedProject.description}
                            </p>
                            {extractVoiceNote(activeSelectedProject.description).audioUrl && (
                              <div className="mt-2">
                                <VoiceNoteBadgePlayer audioUrl={extractVoiceNote(activeSelectedProject.description).audioUrl} />
                              </div>
                            )}
                          </div>
                        )}
                      </CardHeader>
                    </Card>

                    {/* Section 1: Employees Working on That Project */}
                    <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] shadow-xs">
                      <CardHeader className="p-4 sm:p-5 border-b border-[#DFE8EC] dark:border-[#2A3D48] flex flex-row items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-[#0D9488]/10 text-[#0D9488]">
                            <Users className="w-4 h-4" />
                          </div>
                          <div>
                            <CardTitle className="text-sm sm:text-base font-bold text-[#172B3A] dark:text-[#E8F0F4]">
                              Employees Working on This Project
                            </CardTitle>
                            <p className="text-xs text-[#64748B] dark:text-[#A6B5C0]">
                              {activeSelectedProjectEmployees.length} personnel assigned to project execution
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-[#0D9488]/10 text-[#0D9488] border-[#0D9488]/20 font-bold px-3 py-1">
                          {activeSelectedProjectEmployees.length} Working
                        </Badge>
                      </CardHeader>

                      <CardContent className="p-4 sm:p-5">
                        {activeSelectedProjectEmployees.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground text-xs">
                            No team members are assigned to this project yet.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                              <button
                                onClick={() => setSelectedProjectEmployeeFilter('all')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                                  selectedProjectEmployeeFilter === 'all'
                                    ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-xs'
                                    : 'bg-[#F4F8FA] dark:bg-[#1D303B] text-[#64748B] dark:text-[#A6B5C0] border-[#DFE8EC] dark:border-[#2A3D48]'
                                }`}
                              >
                                All Team Members ({activeSelectedProjectEmployees.length})
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                              {activeSelectedProjectEmployees.map((emp) => {
                                const eId = String(emp.userId);
                                const isEmpActive = selectedProjectEmployeeFilter === eId;
                                const empTasks = activeSelectedProjectTasks.filter((t) => {
                                  const tAssignee = toIdText(t.assignee);
                                  const tAssignedTo = Array.isArray(t.assignedTo) ? t.assignedTo.map(toIdText) : [];
                                  return tAssignee === eId || tAssignedTo.includes(eId);
                                });
                                const empCompleted = empTasks.filter((t) => toUiStatus(t.status, t) === 'completed').length;

                                return (
                                  <div
                                    key={eId}
                                    onClick={() => setSelectedProjectEmployeeFilter(isEmpActive ? 'all' : eId)}
                                    className={`p-3 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
                                      isEmpActive
                                        ? 'bg-[#0D9488]/15 border-[#0D9488] ring-1 ring-[#0D9488]/30'
                                        : 'bg-[#F4F8FA]/60 dark:bg-[#1D303B]/40 border-[#DFE8EC] dark:border-[#2A3D48] hover:border-[#0D9488]/40'
                                    }`}
                                  >
                                    <div className="w-10 h-10 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                                      {emp.avatar ? (
                                        <img src={emp.avatar} alt={emp.name} className="w-full h-full object-cover" />
                                      ) : (
                                        (emp.name || 'S').slice(0, 2).toUpperCase()
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h5 className="text-xs font-bold text-[#172B3A] dark:text-[#E8F0F4] truncate">{emp.name}</h5>
                                      <p className="text-[11px] text-[#64748B] dark:text-[#A6B5C0] truncate capitalize">
                                        {emp.role || 'Staff'}
                                      </p>
                                      <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-[#0D9488]">
                                        <span>{empTasks.length} Tasks</span>
                                        <span>•</span>
                                        <span className="text-emerald-600 dark:text-emerald-400">{empCompleted} Done</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Section 2: Their Tasks & All Details */}
                    <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] shadow-xs">
                      <CardHeader className="p-4 sm:p-5 border-b border-[#DFE8EC] dark:border-[#2A3D48] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-[#0D9488]/10 text-[#0D9488]">
                            <Briefcase className="w-4 h-4" />
                          </div>
                          <div>
                            <CardTitle className="text-sm sm:text-base font-bold text-[#172B3A] dark:text-[#E8F0F4]">
                              {selectedProjectEmployeeFilter !== 'all'
                                ? `Tasks Assigned to ${activeSelectedProjectEmployees.find(e => String(e.userId) === selectedProjectEmployeeFilter)?.name || 'Employee'}`
                                : 'All Project Tasks'}
                            </CardTitle>
                            <p className="text-xs text-[#64748B] dark:text-[#A6B5C0]">
                              Showing {displayedSelectedProjectTasks.length} of {activeSelectedProjectTasks.length} tasks
                            </p>
                          </div>
                        </div>

                        {/* Task Status Filters */}
                        <div className="flex items-center gap-1 bg-[#F4F8FA] dark:bg-[#1D303B] p-1 rounded-xl border border-[#DFE8EC] dark:border-[#2A3D48] overflow-x-auto">
                          {[
                            { key: 'all', label: 'All' },
                            { key: 'inProgress', label: 'In Progress' },
                            { key: 'paused', label: 'On Hold' },
                            { key: 'completed', label: 'Completed' },
                            { key: 'todo', label: 'To Do' },
                          ].map((tab) => (
                            <button
                              key={tab.key}
                              onClick={() => setSelectedProjectTaskStatusFilter(tab.key)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                                selectedProjectTaskStatusFilter === tab.key
                                  ? 'bg-[#0D9488] text-white shadow-xs'
                                  : 'text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-[#E8F0F4]'
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                      </CardHeader>

                      <CardContent className="p-4 sm:p-5 space-y-3">
                        {displayedSelectedProjectTasks.length === 0 ? (
                          <div className="text-center py-10 text-muted-foreground text-xs">
                            No tasks found matching your filter selection for this project.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {displayedSelectedProjectTasks.map((task) => {
                              const uiStatus = toUiStatus(task.status, task);
                              const isCompleted = uiStatus === 'completed';
                              const isHold = task.status === 'paused';
                              const isInProgress = uiStatus === 'inProgress' && !isHold;
                              const { text: cleanDesc, audioUrl } = extractVoiceNote(task.description || '');

                              const assigneeUser = users.find((x) => toIdText(x.id) === toIdText(task.assignee));
                              const assigneeName = assigneeUser ? (assigneeUser.name || assigneeUser.username || 'Staff') : 'Staff';
                              const myTask = isAssignedToMe(task);

                              return (
                                <div
                                  key={task.id}
                                  className={`p-4 rounded-2xl border transition-all ${
                                    isCompleted
                                      ? 'bg-emerald-500/5 border-emerald-500/20'
                                      : isInProgress
                                      ? 'bg-blue-500/5 border-blue-500/20'
                                      : isHold
                                      ? 'bg-amber-500/5 border-amber-500/20'
                                      : 'bg-white dark:bg-[#15232D] border-[#DFE8EC] dark:border-[#2A3D48]'
                                  }`}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 mb-2">
                                    <div className="space-y-1 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h5 
                                          onClick={() => setSelectedTask(task)}
                                          className="text-sm font-bold text-[#172B3A] dark:text-[#E8F0F4] hover:text-[#0D9488] cursor-pointer"
                                        >
                                          {task.title}
                                        </h5>
                                        {task.priority && (
                                          <Badge variant="outline" className={`text-[10px] uppercase font-semibold ${
                                            task.priority === 'urgent' || task.priority === 'high'
                                              ? 'text-red-600 border-red-500/30'
                                              : 'text-muted-foreground'
                                          }`}>
                                            {task.priority}
                                          </Badge>
                                        )}
                                      </div>

                                      {cleanDesc && (
                                        <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] whitespace-pre-line leading-relaxed">
                                          {cleanDesc}
                                        </p>
                                      )}

                                      {audioUrl && (
                                        <div className="pt-1">
                                          <VoiceNoteBadgePlayer audioUrl={audioUrl} />
                                        </div>
                                      )}
                                    </div>

                                    {/* Status Badge */}
                                    <div className="shrink-0 flex items-center gap-2">
                                      {isCompleted ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          Completed
                                        </span>
                                      ) : isInProgress ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
                                          <Play className="w-3.5 h-3.5" />
                                          In Progress
                                        </span>
                                      ) : isHold ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                                          <Pause className="w-3.5 h-3.5" />
                                          On Hold
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full border border-border">
                                          <Clock className="w-3.5 h-3.5" />
                                          To Do
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Task Assigned Employees & Time Completion Details */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 mt-2 border-t border-[#DFE8EC]/80 dark:border-[#2A3D48]/80">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[11px] font-medium text-[#64748B] dark:text-[#A6B5C0]">Assigned to:</span>
                                      <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-[#F4F8FA] dark:bg-[#1D303B] px-2 py-0.5 rounded-lg border border-[#DFE8EC] dark:border-[#2A3D48]">
                                        <User className="w-3 h-3 text-[#0D9488]" />
                                        {assigneeName}
                                      </span>
                                    </div>

                                    {/* Timing Details & Actions */}
                                    <div className="flex items-center gap-2 text-xs flex-wrap">
                                      {isCompleted ? (
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
                                          <Check className="w-3.5 h-3.5" />
                                          <span>
                                            Completed on: {format(new Date(task.completedAt || task.updatedAt || Date.now()), 'MMM d, yyyy · h:mm a')}
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2 text-[11px] text-[#64748B] dark:text-[#A6B5C0]">
                                          {task.durationValue && (
                                            <span className="bg-muted/40 px-2 py-0.5 rounded-md border border-border">
                                              Duration: {task.durationValue} {task.durationUnit || 'hours'}
                                            </span>
                                          )}
                                          {(task.dueDate || task.endDate) && (
                                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                                              <Clock className="w-3 h-3" />
                                              Due: {formatDeadline(task)}
                                            </span>
                                          )}
                                        </div>
                                      )}

                                      {/* Quick status button if assigned to me */}
                                      {myTask && !isCompleted && (
                                        <div className="flex items-center gap-1 pl-2 border-l border-border/60">
                                          {isInProgress ? (
                                            <>
                                              <Button
                                                size="sm"
                                                onClick={() => handlePauseTask(task)}
                                                className="h-7 px-2 bg-amber-500 hover:bg-amber-600 text-white text-[11px] gap-1"
                                              >
                                                <Pause className="w-3 h-3" />
                                                <span>Pause</span>
                                              </Button>
                                              <Button
                                                size="sm"
                                                onClick={() => handleMarkCompleted(task)}
                                                className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] gap-1"
                                              >
                                                <Check className="w-3 h-3" />
                                                <span>Done</span>
                                              </Button>
                                            </>
                                          ) : (
                                            <Button
                                              size="sm"
                                              onClick={() => handleStartTask(task)}
                                              className="h-7 px-2.5 bg-[#0D9488] hover:bg-[#0F766E] text-white text-[11px] gap-1"
                                            >
                                              <Play className="w-3 h-3" />
                                              <span>Start</span>
                                            </Button>
                                          )}
                                        </div>
                                      )}

                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setSelectedTask(task)}
                                        className="h-7 px-2.5 text-[11px] border-[#DFE8EC] dark:border-[#2A3D48]"
                                      >
                                        Details
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}

      {/* Create / Edit Project Dialog */}
      <Dialog open={isCreateProjectOpen} onOpenChange={setIsCreateProjectOpen}>
        <DialogContent className="w-[95vw] max-w-2xl bg-white dark:bg-[#15232D] border-[#DFE8EC] dark:border-[#2A3D48] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base md:text-lg text-[#172B3A] dark:text-[#E8F0F4] flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-[#0D9488]" />
              <span>{editingProject ? 'Edit Project' : 'Create New Project'}</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveProject} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="proj-name">Project Name *</Label>
              <Input
                id="proj-name"
                value={projectFormData.name}
                onChange={(e) => setProjectFormData({ ...projectFormData, name: e.target.value })}
                placeholder="e.g., Mobile App Redesign, Q4 Marketing Campaign"
                required
              />
            </div>

            <VoiceDescriptionInput
              id="proj-desc"
              label="Project Description"
              value={projectFormData.description}
              onChange={(val) => setProjectFormData({ ...projectFormData, description: val })}
              placeholder="Outline objectives, deliverables, and scope for this project (type, voice-to-text, or record voice note)..."
              rows={3}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={projectFormData.priority}
                  onValueChange={(val) => setProjectFormData({ ...projectFormData, priority: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High Priority</SelectItem>
                    <SelectItem value="medium">Medium Priority</SelectItem>
                    <SelectItem value="low">Low Priority</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={projectFormData.status}
                  onValueChange={(val) => setProjectFormData({ ...projectFormData, status: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on-hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="proj-start">Start Date *</Label>
                <Input
                  id="proj-start"
                  type="date"
                  value={projectFormData.startDate}
                  onChange={(e) => setProjectFormData({ ...projectFormData, startDate: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="proj-due">Target Due Date</Label>
                <Input
                  id="proj-due"
                  type="date"
                  value={projectFormData.dueDate}
                  onChange={(e) => setProjectFormData({ ...projectFormData, dueDate: e.target.value })}
                />
              </div>
            </div>

            {/* Team Members Multi-Select Checklist */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">Assign Team Members *</Label>
                  <p className="text-xs text-muted-foreground">Select one or more employees to work on this project</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAllProjectMembers}
                  className="text-xs h-7 px-2 border-[#DFE8EC] dark:border-[#2A3D48]"
                >
                  {projectFormData.assignedEmployees.length === assigneeOptions.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Filter employees..."
                  value={projectMemberSearch}
                  onChange={(e) => setProjectMemberSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-[#F4F8FA] dark:bg-[#1D303B]"
                />
              </div>

              <div className="max-h-48 overflow-y-auto border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-2 space-y-1.5 bg-[#F4F8FA]/50 dark:bg-[#1D303B]/30">
                {assigneeOptions
                  .filter((u) => {
                    if (!projectMemberSearch.trim()) return true;
                    const q = projectMemberSearch.toLowerCase();
                    return (u.name || u.username || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
                  })
                  .map((user) => {
                    const uid = toIdText(user.id || user.userId);
                    const isSelected = projectFormData.assignedEmployees.some((e) => toIdText(e.userId) === uid);

                    return (
                      <div
                        key={uid}
                        onClick={() => handleToggleProjectMember(user)}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all text-xs border ${
                          isSelected
                            ? 'bg-[#0D9488]/10 border-[#0D9488]/40 text-[#0D9488] font-medium'
                            : 'bg-white dark:bg-[#15232D] border-transparent hover:border-[#DFE8EC] dark:hover:border-[#2A3D48] text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isSelected ? 'bg-[#0D9488] text-white' : 'bg-muted text-muted-foreground'
                          }`}>
                            {(user.name || user.username || 'U').slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium leading-none">{user.name || user.username}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{user.email || getUserRoleKey(user.role)}</p>
                          </div>
                        </div>

                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          isSelected ? 'bg-[#0D9488] border-[#0D9488] text-white' : 'border-muted-foreground'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
              </div>
              <p className="text-xs text-muted-foreground">
                Selected: <strong>{projectFormData.assignedEmployees.length}</strong> employee(s)
              </p>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#0D9488] hover:bg-[#0F766E] text-white mt-4"
              disabled={createProjectMutation.isPending || updateProjectMutation.isPending}
            >
              {(createProjectMutation.isPending || updateProjectMutation.isPending) ? 'Saving Project...' : editingProject ? 'Update Project' : 'Create Project'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Task to Project Dialog */}
      <Dialog open={isProjectTaskModalOpen} onOpenChange={setIsProjectTaskModalOpen}>
        <DialogContent className="w-[95vw] max-w-2xl bg-white dark:bg-[#15232D] border-[#DFE8EC] dark:border-[#2A3D48] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base md:text-lg text-[#172B3A] dark:text-[#E8F0F4] flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-[#0D9488]" />
              <span>Add Task: {selectedProjectForTask?.name}</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveProjectTask} className="space-y-4 pt-2">
            {/* Project info chip */}
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-700 dark:text-indigo-300 flex items-center justify-between">
              <span className="font-medium flex items-center gap-1.5">
                <FolderKanban className="w-4 h-4" />
                Project: {selectedProjectForTask?.name}
              </span>
              <span>{selectedProjectForTask?.assignedEmployees?.length || 0} Team Member(s)</span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ptask-title">Task Title *</Label>
              <Input
                id="ptask-title"
                value={projectTaskFormData.title}
                onChange={(e) => setProjectTaskFormData({ ...projectTaskFormData, title: e.target.value })}
                placeholder="e.g., Implement OAuth Authentication, Design Landing Page"
                required
              />
            </div>

            <VoiceDescriptionInput
              id="ptask-desc"
              label="Task Description"
              value={projectTaskFormData.description}
              onChange={(val) => setProjectTaskFormData({ ...projectTaskFormData, description: val })}
              placeholder="Detailed instructions for the assigned member(s) (type, voice-to-text, or record voice note)..."
              rows={3}
            />

            {/* ASSIGNMENT MODE: ALL EMPLOYEES VS SEPARATE EMPLOYEE */}
            <div className="space-y-2 pt-1">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Assignment Scope
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  onClick={() => setProjectTaskFormData({ ...projectTaskFormData, assignToAll: true })}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    projectTaskFormData.assignToAll
                      ? 'bg-[#0D9488]/10 border-[#0D9488] ring-1 ring-[#0D9488]'
                      : 'bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] hover:border-[#0D9488]/40'
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium text-xs md:text-sm text-[#172B3A] dark:text-[#E8F0F4]">
                    <Users className="w-4 h-4 text-[#0D9488]" />
                    <span>All Employees in Project</span>
                  </div>
                  <p className="text-[11px] text-[#64748B] dark:text-[#A6B5C0] mt-1">
                    Dispatches this task and notification to all {selectedProjectForTask?.assignedEmployees?.length || 0} project members.
                  </p>
                </div>

                <div
                  onClick={() => setProjectTaskFormData({ ...projectTaskFormData, assignToAll: false })}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    !projectTaskFormData.assignToAll
                      ? 'bg-[#0D9488]/10 border-[#0D9488] ring-1 ring-[#0D9488]'
                      : 'bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] hover:border-[#0D9488]/40'
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium text-xs md:text-sm text-[#172B3A] dark:text-[#E8F0F4]">
                    <User className="w-4 h-4 text-[#0D9488]" />
                    <span>Specific Employee</span>
                  </div>
                  <p className="text-[11px] text-[#64748B] dark:text-[#A6B5C0] mt-1">
                    Assign this task exclusively to one selected member of the project team.
                  </p>
                </div>
              </div>
            </div>

            {/* Individual Employee Selector when assignToAll is false */}
            {!projectTaskFormData.assignToAll && (
              <div className="space-y-1.5">
                <Label>Select Employee from Project *</Label>
                <Select
                  value={projectTaskFormData.assignedTo}
                  onValueChange={(val) => setProjectTaskFormData({ ...projectTaskFormData, assignedTo: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose project member..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedProjectForTask?.assignedEmployees || []).map((emp) => (
                      <SelectItem key={emp.userId} value={emp.userId}>
                        {emp.name || emp.username || emp.userId} ({getUserRoleKey(emp.role)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={projectTaskFormData.priority}
                  onValueChange={(val) => setProjectTaskFormData({ ...projectTaskFormData, priority: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Duration</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    placeholder="e.g. 8"
                    value={projectTaskFormData.durationValue}
                    onChange={(e) => {
                      const val = e.target.value;
                      const { endDate, dueTime } = computeEndDateTime(projectTaskFormData.startDate, val, projectTaskFormData.durationUnit, projectTaskFormData.assignedTo);
                      setProjectTaskFormData(prev => ({
                        ...prev,
                        durationValue: val,
                        ...(endDate ? { endDate } : {}),
                        ...(dueTime ? { dueTime } : {})
                      }));
                    }}
                  />
                  <Select
                    value={projectTaskFormData.durationUnit}
                    onValueChange={(val) => {
                      const { endDate, dueTime } = computeEndDateTime(projectTaskFormData.startDate, projectTaskFormData.durationValue, val, projectTaskFormData.assignedTo);
                      setProjectTaskFormData(prev => ({
                        ...prev,
                        durationUnit: val,
                        ...(endDate ? { endDate } : {}),
                        ...(dueTime ? { dueTime } : {})
                      }));
                    }}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[11px] text-[#0D9488] font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> End Date & Time auto-fill
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Deadline Time</Label>
                <Input
                  type="time"
                  value={projectTaskFormData.dueTime}
                  onChange={(e) => setProjectTaskFormData({ ...projectTaskFormData, dueTime: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">Auto-calculated cutoff time</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ptask-start">Start Date *</Label>
                <Input
                  id="ptask-start"
                  type="date"
                  value={projectTaskFormData.startDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    const { endDate, dueTime } = computeEndDateTime(val, projectTaskFormData.durationValue, projectTaskFormData.durationUnit, projectTaskFormData.assignedTo);
                    setProjectTaskFormData(prev => ({
                      ...prev,
                      startDate: val,
                      ...(endDate ? { endDate } : {}),
                      ...(dueTime ? { dueTime } : {})
                    }));
                  }}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ptask-end">End Date *</Label>
                <Input
                  id="ptask-end"
                  type="date"
                  value={projectTaskFormData.endDate}
                  onChange={(e) => setProjectTaskFormData({ ...projectTaskFormData, endDate: e.target.value })}
                  required
                />
                <p className="text-[11px] text-muted-foreground">Auto-calculated from Start & Duration</p>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#0D9488] hover:bg-[#0F766E] text-white mt-4"
              disabled={createProjectTaskMutation.isPending}
            >
              {createProjectTaskMutation.isPending 
                ? 'Dispatching Tasks & Notifications...' 
                : projectTaskFormData.assignToAll 
                ? `Dispatch Task to All ${selectedProjectForTask?.assignedEmployees?.length || 0} Members` 
                : 'Dispatch Task to Selected Member'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* 5. Polished Task Details Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="w-[95vw] max-w-3xl bg-white dark:bg-[#15232D] border-[#DFE8EC] dark:border-[#2A3D48] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-3 border-b border-[#DFE8EC] dark:border-[#2A3D48]">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              {selectedTask && (
                <>
                  {selectedTask.projectName && (
                    <Badge className="text-xs px-2.5 py-0.5 rounded-md border bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25 flex items-center gap-1">
                      <FolderKanban className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Project: {selectedTask.projectName}</span>
                    </Badge>
                  )}
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
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-xs text-[#64748B] dark:text-[#A6B5C0] uppercase tracking-wider">
                    Description
                  </h4>
                  {extractVoiceNote(selectedTask?.description).voiceNoteUrl && (
                    <VoiceNoteBadgePlayer src={extractVoiceNote(selectedTask?.description).voiceNoteUrl} />
                  )}
                </div>
                <p className="text-sm text-[#172B3A] dark:text-[#E8F0F4] whitespace-pre-wrap leading-relaxed">
                  {extractVoiceNote(selectedTask?.description).cleanText || 'No description provided.'}
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
