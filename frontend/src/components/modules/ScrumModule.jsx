import { useMemo, useState, useEffect } from 'react';
import { 
  useGetAllMeetingNotes, useAddMeetingNote, useUpdateMeetingNote, useDeleteMeetingNote, 
  useGetUserScrumNotes, useGetAllScrumNotes, useAddScrumNote, useUpdateScrumNote, 
  useGetAllUsers, useGetAllTasks, useUpdateTask 
} from '../../hooks/useQueries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, Clock, ChevronDown, ListTodo, CheckCircle2, Play, AlertTriangle, 
  FileText, Calendar, Pencil, Trash2, X, Pause, ShieldAlert, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { useCustomAuth } from '../../hooks/useCustomAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { safeRandomUUID, cn, hasUserRole } from '@/lib/utils';
import { isTaskExpired, getTaskUiStatus, getTaskStatusLabel, getTaskStatusBadgeClass, formatDeadline } from '@/lib/taskUtils';

export default function ScrumModule({ userProfile }) {
  const { identity } = useCustomAuth();
  const isAdmin = hasUserRole(userProfile, 'admin') || hasUserRole(userProfile, 'owner') || hasUserRole(userProfile, 'param');
  const isStaff = hasUserRole(userProfile, 'staff') || hasUserRole(userProfile, 'intern') || hasUserRole(userProfile, 'freelancer');

  const currentUserId = userProfile.userId || userProfile.id || identity?.getPrincipal() || null;

  const { data: myScrumNotes = [] } = useGetUserScrumNotes(currentUserId || null);
  const { data: allScrumNotes = [] } = useGetAllScrumNotes();
  const { data: users = [] } = useGetAllUsers();
  const { data: tasks = [] } = useGetAllTasks();
  const updateTask = useUpdateTask();

  const addScrumNote = useAddScrumNote();
  const updateScrumNote = useUpdateScrumNote();

  const { data: notes = [], isLoading } = useGetAllMeetingNotes();
  const addNote = useAddMeetingNote();
  const updateNote = useUpdateMeetingNote();
  const deleteNote = useDeleteMeetingNote();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
  });

  const [editingScrum, setEditingScrum] = useState(null);
  const [scrumForm, setScrumForm] = useState({
    taskDetails: '',
    status: 'in_progress',
    priority: 'medium',
    blockerNotes: '',
  });

  const [historyDateFilter, setHistoryDateFilter] = useState(null);
  const [historyStaffFilter, setHistoryStaffFilter] = useState('all');
  const [now, setNow] = useState(Date.now());
  const [optimisticScrum, setOptimisticScrum] = useState({});

  const setOptimistic = (id, patch) =>
    setOptimisticScrum(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  const clearOptimistic = (id) =>
    setOptimisticScrum(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const toDate = (ts) => {
    if (!ts) return null;
    if (typeof ts === 'string') {
      const d = new Date(ts);
      return isNaN(d) ? null : d;
    }
    if (typeof ts === 'bigint') return new Date(Number(ts) / 1000000);
    const n = Number(ts);
    if (!Number.isFinite(n)) return null;
    return new Date(n > 1e12 ? n / 1000000 : n);
  };

  const toIdText = (val) => (typeof val === 'string' ? val : (val?.toText ? val.toText() : String(val)));

  const formatScrumDateTime = (timestamp) => {
    const date = toDate(timestamp);
    return date ? format(date, 'yyyy-MM-dd hh:mm a') : '';
  };

  const formatUserLabelSafe = (u) => {
    const first = u?.firstName || '';
    const last = u?.lastName || '';
    const name = [first, last].filter(Boolean).join(' ').trim();
    if (name) return name;
    if (u?.username) return u.username;
    if (u?.name) return u.name;
    return toIdText(u?.userId || u?.id || '');
  };

  const formatDuration = (fromTs) => {
    const start = toDate(fromTs);
    if (!start) return '';
    const diff = now - start.getTime();
    if (diff < 0) return '00:00:00';
    const secs = Math.floor(diff / 1000);
    const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
    const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  const formatDurationBetween = (fromTs, toTs) => {
    const start = toDate(fromTs);
    const end = toDate(toTs);
    if (!start || !end) return '';
    const diff = end.getTime() - start.getTime();
    if (diff < 0) return '00:00:00';
    const secs = Math.floor(diff / 1000);
    const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
    const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  const formatPausedDuration = (note) => {
    let secs = Math.floor(
      typeof note.timer === 'number'
        ? note.timer
        : (note.timer ? Number(note.timer) : (typeof note.timmer === 'number' ? note.timmer : (note.timmer ? Number(note.timmer) : 0)))
    );
    if (!secs) {
      const ems = typeof note.elapsedMs === 'number' ? note.elapsedMs : (note.elapsedMs ? Number(note.elapsedMs) : 0);
      if (ems) {
        secs = Math.floor(ems / 1000);
      } else {
        const s = toDate(note.createdAt);
        const p = toDate(note.pausedAt || note.updatedAt);
        if (s && p) {
          secs = Math.max(0, Math.floor((p.getTime() - s.getTime()) / 1000));
        }
      }
    }
    const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
    const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  const formatRunningDuration = (note) => {
    const base =
      typeof note.timer === 'number'
        ? note.timer
        : (note.timer ? Number(note.timer) : (typeof note.timmer === 'number' ? note.timmer : (note.timmer ? Number(note.timmer) : 0)));
    const startMs =
      optimisticScrum[note.id]?.timerStartMs ||
      (toDate(note.updatedAt)?.getTime() || 0);
    const added = startMs ? Math.floor((now - startMs) / 1000) : 0;
    const secs = Math.floor(base + added);
    const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
    const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleOpenDialog = (note) => {
    if (note) {
      setEditingNote(note);
      setFormData({
        title: note.title,
        content: note.content,
      });
    } else {
      setEditingNote(null);
      setFormData({
        title: '',
        content: '',
      });
    }
    setIsDialogOpen(true);
  };

  const resetScrumForm = () => {
    setEditingScrum(null);
    setScrumForm({
      taskDetails: '',
      status: 'in_progress',
      priority: 'medium',
      blockerNotes: '',
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const note = {
        id: editingNote ? editingNote.id : `note-${Date.now()}`,
        title: formData.title,
        content: formData.content,
        timestamp: BigInt(Date.now() * 1000000),
      };

      if (editingNote) {
        await updateNote.mutateAsync(note);
        toast.success('Meeting note updated successfully');
      } else {
        await addNote.mutateAsync(note);
        toast.success('Meeting note added successfully');
      }

      setIsDialogOpen(false);
    } catch (error) {
      toast.error('Failed to save meeting note');
      console.error(error);
    }
  };

  const handleScrumSubmit = async (e) => {
    e.preventDefault();
    if (!identity || !currentUserId) return;

    const nowTime = new Date();
    const timestamp = BigInt(nowTime.getTime() * 1000000);

    const baseNote = {
      id: editingScrum ? editingScrum.id : safeRandomUUID(),
      userId: editingScrum ? editingScrum.userId : (userProfile.userId || userProfile.id || currentUserId),
      taskDetails: scrumForm.taskDetails.trim(),
      status: scrumForm.status,
      priority: scrumForm.priority,
      blockerNotes: scrumForm.status === 'blocked' ? scrumForm.blockerNotes.trim() : '',
      timer: editingScrum ? ((typeof editingScrum.timer === 'number' ? editingScrum.timer : (editingScrum.timer ? Number(editingScrum.timer) : (editingScrum.timmer || 0)))) : 0,
      createdAt: editingScrum ? editingScrum.createdAt : timestamp,
      updatedAt: timestamp,
    };

    if (!baseNote.taskDetails) {
      toast.error('Please enter task details');
      return;
    }

    const currentId = toIdText(userProfile.userId || userProfile.id || '');
    const matchedTask = tasks.find(tt => 
      toIdText(tt.assignedTo || tt.assignee || '') === currentId && 
      tt.title.trim().toLowerCase() === baseNote.taskDetails.toLowerCase()
    );

    if (matchedTask && isTaskExpired(matchedTask)) {
      toast.error('The assigned time for this task has ended. This task is marked as Not Completed and cannot be opened.');
      return;
    }

    try {
      if (editingScrum) {
        const createdDate = new Date(Number(editingScrum.createdAt) / 1000000);
        const sameDay =
          createdDate.toISOString().split('T')[0] === nowTime.toISOString().split('T')[0];
        if (!sameDay && !isAdmin) {
          toast.error('Only same-day scrums can be edited');
          return;
        }
        await updateScrumNote.mutateAsync(baseNote);
        toast.success('Scrum updated successfully');
      } else {
        await addScrumNote.mutateAsync(baseNote);
        const t = matchedTask || tasks.find(tt => toIdText(tt.assignedTo || tt.assignee || '') === currentId && tt.title === baseNote.taskDetails);
        if (t) {
          await updateTask.mutateAsync({
            id: t.id,
            title: t.title,
            description: t.description,
            assignee: t.assignee,
            status: { inProgress: null },
            startDate: t.startDate,
            endDate: t.endDate
          });
        }
        setOptimistic(baseNote.id, { status: 'in_progress', timerStartMs: Date.now() });
        toast.success('Scrum started successfully');
      }
      resetScrumForm();
    } catch (error) {
      toast.error('Failed to save scrum');
      console.error(error);
    }
  };

  const handleMarkCompleted = async (note) => {
    try {
      const currentId = toIdText(userProfile.userId || userProfile.id || '');
      const t = tasks.find(tt => toIdText(tt.assignedTo || tt.assignee || '') === currentId && tt.title.trim().toLowerCase() === (note.taskDetails || '').trim().toLowerCase());
      if (t && isTaskExpired(t)) {
        toast.error('The assigned time for this task has ended. This task is marked as Not Completed and cannot be completed.');
        return;
      }
      setOptimistic(note.id, { status: 'completed', updatedAt: BigInt(Date.now() * 1000000) });
      await updateScrumNote.mutateAsync({
        ...note,
        status: 'completed',
        updatedAt: BigInt(Date.now() * 1000000)
      });
      if (t) {
        await updateTask.mutateAsync({
          id: t.id,
          title: t.title,
          description: t.description,
          assignee: t.assignee,
          status: { completed: null },
          startDate: t.startDate,
          endDate: t.endDate
        });
      }
      toast.success('Marked as completed');
      clearOptimistic(note.id);
    } catch (e) {
      toast.error('Failed to mark completed');
    }
  };

  const handleMarkPaused = async (note) => {
    try {
      const base = typeof note.timer === 'number' ? note.timer : (note.timer ? Number(note.timer) : (typeof note.timmer === 'number' ? note.timmer : (note.timmer ? Number(note.timmer) : 0)));
      const startMs = optimisticScrum[note.id]?.timerStartMs || 0;
      const addSecs = startMs ? Math.floor((Date.now() - startMs) / 1000) : 0;
      const newTimer = Math.floor(base + addSecs);
      setOptimistic(note.id, { status: 'paused', timer: newTimer, pausedAt: new Date().toISOString(), updatedAt: BigInt(Date.now() * 1000000) });
      await updateScrumNote.mutateAsync({
        ...note,
        status: 'paused',
        timer: newTimer,
        pausedAt: new Date().toISOString(),
        updatedAt: BigInt(Date.now() * 1000000)
      });
      toast.success('Marked as paused');
      clearOptimistic(note.id);
    } catch (e) {
      toast.error('Failed to mark paused');
    }
  };

  const handleMarkBlocked = async (note) => {
    try {
      setOptimistic(note.id, { status: 'blocked', pausedAt: new Date().toISOString(), updatedAt: BigInt(Date.now() * 1000000) });
      await updateScrumNote.mutateAsync({
        ...note,
        status: 'blocked',
        pausedAt: new Date().toISOString(),
        updatedAt: BigInt(Date.now() * 1000000)
      });
      const currentId = toIdText(userProfile.userId || userProfile.id || '');
      const t = tasks.find(tt => toIdText(tt.assignedTo || tt.assignee || '') === currentId && tt.title === note.taskDetails);
      if (t) {
        await updateTask.mutateAsync({
          id: t.id,
          title: t.title,
          description: t.description,
          assignee: t.assignee,
          status: { blocked: null },
          startDate: t.startDate,
          endDate: t.endDate
        });
      }
      toast.success('Marked as blocked');
      clearOptimistic(note.id);
    } catch (e) {
      toast.error('Failed to mark blocked');
    }
  };

  const handleMarkResume = async (note) => {
    try {
      const currentId = toIdText(userProfile.userId || userProfile.id || '');
      const t = tasks.find(tt => toIdText(tt.assignedTo || tt.assignee || '') === currentId && tt.title.trim().toLowerCase() === (note.taskDetails || '').trim().toLowerCase());
      if (t && isTaskExpired(t)) {
        toast.error('The assigned time for this task has ended. This task is marked as Not Completed and cannot be opened or resumed.');
        return;
      }
      setOptimistic(note.id, { status: 'in_progress', pausedAt: undefined, timerStartMs: Date.now(), updatedAt: BigInt(Date.now() * 1000000) });
      await updateScrumNote.mutateAsync({
        ...note,
        status: 'in_progress',
        pausedAt: undefined,
        updatedAt: BigInt(Date.now() * 1000000)
      });
      toast.success('Resumed task');
    } catch (e) {
      toast.error('Failed to resume');
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this meeting note?')) {
      try {
        await deleteNote.mutateAsync(id);
        toast.success('Meeting note deleted successfully');
      } catch (error) {
        toast.error('Failed to delete meeting note');
        console.error(error);
      }
    }
  };

  const formatDate = (timestamp) => {
    const date = toDate(timestamp);
    return date ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
  };

  const todayIso = new Date().toISOString().split('T')[0];

  const visibleScrumNotes = useMemo(() => {
    const source = isAdmin ? allScrumNotes : myScrumNotes;
    let filtered = source.slice();

    if (historyStaffFilter !== 'all') {
      filtered = filtered.filter(n => toIdText(n.userId) === historyStaffFilter);
    }

    if (historyDateFilter) {
      const targetDate = historyDateFilter.toISOString().split('T')[0];
      filtered = filtered.filter(n => {
        const d = toDate(n.createdAt);
        return d && d.toISOString().split('T')[0] === targetDate;
      });
    }

    return filtered.sort((a, b) => {
      const bt = toDate(b.createdAt)?.getTime() ?? 0;
      const at = toDate(a.createdAt)?.getTime() ?? 0;
      return bt - at;
    });
  }, [isAdmin, allScrumNotes, myScrumNotes, historyDateFilter, historyStaffFilter]);

  const staffOptions = useMemo(() => {
    if (!isAdmin) return [];
    return users.filter(u => hasUserRole(u, 'staff') || hasUserRole(u, 'intern') || hasUserRole(u, 'freelancer'));
  }, [users, isAdmin]);

  // Real-data summary metrics calculated from visible active notes and task deadlines
  const metrics = useMemo(() => {
    const notesList = isAdmin ? allScrumNotes : myScrumNotes;
    let inProgressCount = 0;
    let completedCount = 0;
    let expiredCount = 0;

    notesList.forEach(n => {
      const sid = toIdText(n.userId);
      const matched = tasks.find(tt => 
        toIdText(tt.assignedTo || tt.assignee || '') === sid && 
        tt.title.trim().toLowerCase() === (n.taskDetails || '').trim().toLowerCase()
      );
      const isExpired = matched ? isTaskExpired(matched) : false;
      if (n.status !== 'completed' && isExpired) {
        expiredCount++;
      } else if (n.status === 'completed') {
        completedCount++;
      } else if (n.status === 'in_progress') {
        inProgressCount++;
      }
    });

    return {
      total: notesList.length,
      inProgress: inProgressCount,
      completed: completedCount,
      expired: expiredCount,
    };
  }, [isAdmin, allScrumNotes, myScrumNotes, tasks]);

  // Priority color styling helper
  const getPriorityBadge = (priority) => {
    const p = (priority || 'medium').toLowerCase();
    switch (p) {
      case 'urgent':
        return <Badge variant="outline" className="text-[10px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 px-2 py-0.5 rounded-md">Urgent</Badge>;
      case 'high':
        return <Badge variant="outline" className="text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 px-2 py-0.5 rounded-md">High</Badge>;
      case 'low':
        return <Badge variant="outline" className="text-[10px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 px-2 py-0.5 rounded-md">Low</Badge>;
      case 'medium':
      default:
        return <Badge variant="outline" className="text-[10px] font-semibold bg-[#F4F8FA] dark:bg-[#1D303B] text-[#64748B] dark:text-[#A6B5C0] border-[#DFE8EC] dark:border-[#2A3D48] px-2 py-0.5 rounded-md">Medium</Badge>;
    }
  };

  return (
    <div className="space-y-6 w-full pb-10">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#DFE8EC] dark:border-[#2A3D48]">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6] flex items-center justify-center shrink-0 shadow-2xs">
            <ListTodo className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-light tracking-normal text-[#172B3A] dark:text-[#E8F0F4] leading-snug">
              Scrum & Meeting Notes
            </h1>
            <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#A6B5C0] mt-0.5 font-normal">
              Track daily progress, blockers, active time, and collaborative meeting outcomes.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Scrum Overview Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] text-foreground rounded-2xl shadow-xs p-4 sm:p-5 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#64748B] dark:text-[#A6B5C0] truncate">Total Scrum Updates</p>
              <h3 className="text-2xl sm:text-3xl font-semibold tracking-normal text-[#172B3A] dark:text-[#E8F0F4] mt-1">{metrics.total}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6] flex items-center justify-center shrink-0">
              <ListTodo className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] text-foreground rounded-2xl shadow-xs p-4 sm:p-5 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#64748B] dark:text-[#A6B5C0] truncate">In Progress</p>
              <h3 className="text-2xl sm:text-3xl font-semibold tracking-normal text-teal-600 dark:text-teal-400 mt-1">{metrics.inProgress}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Play className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] text-foreground rounded-2xl shadow-xs p-4 sm:p-5 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#64748B] dark:text-[#A6B5C0] truncate">Completed Tasks</p>
              <h3 className="text-2xl sm:text-3xl font-semibold tracking-normal text-emerald-600 dark:text-emerald-400 mt-1">{metrics.completed}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] text-foreground rounded-2xl shadow-xs p-4 sm:p-5 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#64748B] dark:text-[#A6B5C0] truncate">Expired / Overdue</p>
              <h3 className="text-2xl sm:text-3xl font-semibold tracking-normal text-rose-600 dark:text-rose-400 mt-1">{metrics.expired}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* 3. Daily Scrum Notepad (Staff Form) */}
      {isStaff && (
        <Card className="border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] text-foreground rounded-2xl shadow-xs overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DFE8EC] dark:border-[#2A3D48] p-4 sm:p-5 bg-[#F4F8FA]/60 dark:bg-[#1D303B]/40">
            <div>
              <CardTitle className="text-base sm:text-lg font-medium text-[#172B3A] dark:text-[#E8F0F4]">Daily Scrum Notepad</CardTitle>
              <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] mt-0.5 font-normal">
                Capture your current sprint focus, blockers, and start your live task timer.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#64748B] dark:text-[#A6B5C0] bg-[#F4F8FA] dark:bg-[#1D303B] border border-[#DFE8EC] dark:border-[#2A3D48] px-3 py-1.5 rounded-xl font-mono shrink-0">
              <Clock className="h-3.5 w-3.5 text-[#0D9488] dark:text-[#14B8A6]" />
              <span>
                {formatScrumDateTime(editingScrum ? editingScrum.createdAt : BigInt(Date.now() * 1000000))}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <form onSubmit={handleScrumSubmit} className="space-y-4">
              {/* Task Selection & Priority Row */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-8 space-y-1.5">
                  <div className="flex items-center justify-between h-5">
                    <Label htmlFor="scrum-task" className="text-xs font-semibold text-[#172B3A] dark:text-[#E8F0F4]">
                      Select Assigned Task <span className="text-rose-500">*</span>
                    </Label>
                    {(() => {
                      const currentId = toIdText(userProfile.userId || userProfile.id || '');
                      const t = tasks.find(tt => toIdText(tt.assignedTo || tt.assignee || '') === currentId && tt.title === scrumForm.taskDetails);
                      const p = typeof t?.priority === 'string' ? t?.priority : Object.keys(t?.priority || { medium: null })[0] || 'medium';
                      return (
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-[#64748B] dark:text-[#A6B5C0]">Priority:</span>
                          {getPriorityBadge(p)}
                        </div>
                      );
                    })()}
                  </div>
                  <Select
                    value={scrumForm.taskDetails}
                    onValueChange={(value) => setScrumForm({ ...scrumForm, taskDetails: value })}
                  >
                    <SelectTrigger id="scrum-task" className="h-10 text-xs sm:text-sm rounded-xl bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] text-[#172B3A] dark:text-[#E8F0F4] focus:border-[#0D9488]">
                      <SelectValue placeholder="Choose a task from your assigned backlog..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D]">
                      {tasks
                        .filter(t => {
                          const taskAssignee = toIdText(t.assignedTo || t.assignee || '');
                          const currentId = toIdText(userProfile.userId || userProfile.id || '');
                          const k = typeof t.status === 'string' ? t.status : Object.keys(t.status || {})[0];
                          const isHidden = k === 'in_progress' || k === 'completed' || k === 'done';
                          return taskAssignee === currentId && !isHidden;
                        })
                        .map(t => {
                          const expired = isTaskExpired(t);
                          return (
                            <SelectItem 
                              key={t.id} 
                              value={t.title}
                              disabled={expired}
                              className={cn(expired && "text-destructive opacity-75 font-medium")}
                            >
                              {t.title} {expired ? '— [Not Completed: Time Expired]' : ''}
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-4 space-y-1.5">
                  <div className="flex items-center justify-between h-5">
                    <Label htmlFor="scrum-status" className="text-xs font-semibold text-[#172B3A] dark:text-[#E8F0F4]">
                      Initial Status
                    </Label>
                  </div>
                  <Select
                    value={scrumForm.status}
                    onValueChange={value => setScrumForm({ ...scrumForm, status: value })}
                  >
                    <SelectTrigger id="scrum-status" className="h-10 text-xs sm:text-sm rounded-xl bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] text-[#172B3A] dark:text-[#E8F0F4] focus:border-[#0D9488]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D]">
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Work Details Textarea */}
              <div className="space-y-1.5">
                <Label htmlFor="scrum-details" className="text-xs font-semibold text-[#172B3A] dark:text-[#E8F0F4]">
                  Work Details / Today's Plan
                </Label>
                <Textarea
                  id="scrum-details"
                  value={scrumForm.taskDetails}
                  onChange={e => setScrumForm({ ...scrumForm, taskDetails: e.target.value })}
                  placeholder="Describe your planned deliverables, key focus, or task details here..."
                  rows={3}
                  className="min-h-[105px] resize-y text-xs sm:text-sm rounded-xl bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] text-[#172B3A] dark:text-[#E8F0F4] p-3 focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]/30 transition-all"
                />
              </div>

              {/* Expired Task Warning Callout */}
              {(() => {
                const currentId = toIdText(userProfile.userId || userProfile.id || '');
                const matched = tasks.find(tt => 
                  toIdText(tt.assignedTo || tt.assignee || '') === currentId && 
                  tt.title.trim().toLowerCase() === (scrumForm.taskDetails || '').trim().toLowerCase()
                );
                if (matched && isTaskExpired(matched)) {
                  return (
                    <div className="p-3.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2.5 shadow-2xs">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                      <span>
                        The assigned time for this task ended ({formatDeadline(matched) || 'Deadline passed'}). This task is marked as <strong>Not Completed</strong> and cannot be worked on.
                      </span>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Blocker Notes (Conditional on blocked status) */}
              {scrumForm.status === 'blocked' && (
                <div className="space-y-1.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <Label className="text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> What is blocking your progress?
                  </Label>
                  <Textarea
                    value={scrumForm.blockerNotes}
                    onChange={e => setScrumForm({ ...scrumForm, blockerNotes: e.target.value })}
                    placeholder="Describe dependency blockers, required approvals, or technical hurdles..."
                    rows={2}
                    className="text-xs sm:text-sm rounded-xl bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] text-[#172B3A] dark:text-[#E8F0F4]"
                  />
                </div>
              )}

              {/* Form Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                {(() => {
                  const currentId = toIdText(userProfile.userId || userProfile.id || '');
                  const matched = tasks.find(tt => 
                    toIdText(tt.assignedTo || tt.assignee || '') === currentId && 
                    tt.title.trim().toLowerCase() === (scrumForm.taskDetails || '').trim().toLowerCase()
                  );
                  const isTaskBlockedDueToExpiry = matched ? isTaskExpired(matched) : false;

                  return (
                    <Button
                      type="submit"
                      className={cn(
                        "h-10 px-6 rounded-xl font-semibold shadow-xs transition-all w-full sm:w-auto flex items-center justify-center gap-2",
                        isTaskBlockedDueToExpiry 
                          ? "bg-rose-600 hover:bg-rose-700 text-white cursor-not-allowed opacity-80"
                          : "bg-[#0D9488] hover:bg-[#0F766E] text-white shadow-xs"
                      )}
                      disabled={addScrumNote.isPending || updateScrumNote.isPending || isTaskBlockedDueToExpiry}
                    >
                      <Play className="h-4 w-4" />
                      <span>
                        {editingScrum
                          ? (addScrumNote.isPending || updateScrumNote.isPending ? 'Saving...' : 'Update Scrum Entry')
                          : isTaskBlockedDueToExpiry
                          ? 'Task Expired — Cannot Open'
                          : (addScrumNote.isPending ? 'Starting...' : 'Start Daily Scrum')}
                      </span>
                    </Button>
                  );
                })()}

                {editingScrum && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={resetScrumForm} 
                    className="h-10 px-4 rounded-xl border-[#DFE8EC] dark:border-[#2A3D48] hover:bg-[#F4F8FA] dark:hover:bg-[#1D303B] text-xs sm:text-sm font-medium w-full sm:w-auto"
                  >
                    Cancel Edit
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* 4. Scrum History Section */}
      <div className="space-y-4">
        {/* Section Header & Responsive Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1">
          <div>
            <h2 className="text-base sm:text-lg font-medium text-[#172B3A] dark:text-[#E8F0F4]">Scrum History</h2>
            <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] mt-0.5 font-normal">
              Daily sprint updates and activity logs, latest entries first.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Date Filter */}
            <div className="flex items-center gap-1.5 bg-[#F4F8FA] dark:bg-[#1D303B] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl px-2.5 py-1 shadow-2xs">
              <Calendar className="h-3.5 w-3.5 text-[#0D9488] dark:text-[#14B8A6] shrink-0" />
              <input
                type="date"
                className="h-7 text-xs bg-transparent border-0 text-[#172B3A] dark:text-[#E8F0F4] focus:outline-none focus:ring-0 w-32 cursor-pointer font-medium"
                value={historyDateFilter ? format(historyDateFilter, 'yyyy-MM-dd') : ''}
                onChange={e =>
                  setHistoryDateFilter(
                    e.target.value ? new Date(e.target.value + 'T00:00:00') : null
                  )
                }
              />
            </div>

            {/* Staff Filter (Admin only) */}
            {isAdmin && (
              <Select
                value={historyStaffFilter}
                onValueChange={value => setHistoryStaffFilter(value)}
              >
                <SelectTrigger className="h-9 text-xs rounded-xl bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] text-[#172B3A] dark:text-[#E8F0F4] w-36 font-medium">
                  <SelectValue placeholder="All Staff" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D]">
                  <SelectItem value="all">All Staff</SelectItem>
                  {staffOptions.map(staff => {
                    const sid = staff.userId?.toText ? staff.userId.toText() : String(staff.userId || staff.id);
                    return (
                      <SelectItem key={sid} value={sid}>
                        {staff.firstName || staff.name || 'Staff'} {staff.lastName || ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}

            {/* Reset Filter Button */}
            {(historyDateFilter || historyStaffFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2.5 text-xs text-[#0D9488] dark:text-[#14B8A6] hover:bg-[#0D9488]/10 rounded-xl font-medium"
                onClick={() => {
                  setHistoryDateFilter(null);
                  setHistoryStaffFilter('all');
                }}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Reset
              </Button>
            )}
          </div>
        </div>

        {/* History Cards List */}
        {visibleScrumNotes.length === 0 ? (
          <Card className="border border-dashed border-[#DFE8EC] dark:border-[#2A3D48] bg-[#F4F8FA]/60 dark:bg-[#1D303B]/40 text-foreground rounded-2xl p-10 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6] flex items-center justify-center mx-auto">
              <ListTodo className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-[#172B3A] dark:text-[#E8F0F4]">No Scrum Entries Found</h4>
            <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] max-w-sm mx-auto leading-relaxed">
              There are no recorded scrum entries matching your selected date or staff filter criteria.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {visibleScrumNotes.map(note => {
              const applied = optimisticScrum[note.id] ? { ...note, ...optimisticScrum[note.id] } : note;
              const createdDate = toDate(note.createdAt);
              const isSameDay = createdDate && createdDate.toISOString().split('T')[0] === todayIso;
              const canEdit = isSameDay || isAdmin;

              const sid = toIdText(applied.userId);
              const matchedTask = tasks.find(tt => 
                toIdText(tt.assignedTo || tt.assignee || '') === sid && 
                tt.title.trim().toLowerCase() === (applied.taskDetails || '').trim().toLowerCase()
              );
              const isExpired = matchedTask ? isTaskExpired(matchedTask) : false;
              const isTaskNotCompleted = applied.status !== 'completed' && isExpired;

              return (
                <Card 
                  key={note.id}
                  className={cn(
                    "border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] text-foreground rounded-2xl shadow-xs p-4 sm:p-5 transition-all hover:border-[#0D9488]/40 hover:shadow-xs",
                    isTaskNotCompleted 
                      ? "border-rose-300 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/20"
                      : ""
                  )}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-2 min-w-0 flex-1">
                      {/* Meta Header Row */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Timestamp */}
                        <div className="flex items-center gap-1.5 text-xs text-[#64748B] dark:text-[#A6B5C0] font-mono">
                          <Clock className="h-3.5 w-3.5 text-[#0D9488] dark:text-[#14B8A6]" />
                          <span>{formatScrumDateTime(applied.createdAt)}</span>
                        </div>

                        {/* Staff Label (if admin or viewing others) */}
                        <span className="text-xs font-semibold text-[#172B3A] dark:text-[#E8F0F4] px-2 py-0.5 rounded-md bg-[#F4F8FA] dark:bg-[#1D303B] border border-[#DFE8EC] dark:border-[#2A3D48]">
                          {(() => {
                            const staff = users.find(u => toIdText(u.userId || u.id) === sid);
                            return staff ? formatUserLabelSafe(staff) : (sid === toIdText(currentUserId) ? 'You' : 'Staff');
                          })()}
                        </span>

                        {/* Semantic Status Badge */}
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-md text-[11px] font-semibold border flex items-center gap-1",
                          isTaskNotCompleted
                            ? "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-800"
                            : applied.status === 'completed'
                            ? "bg-[#D1FAE5] text-[#065F46] border-[#059669]/30 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-600/60"
                            : applied.status === 'in_progress'
                            ? "bg-[#CCFBF1] text-[#115E59] border-[#0D9488]/30 dark:bg-teal-950/80 dark:text-teal-200 dark:border-teal-600/60"
                            : applied.status === 'paused'
                            ? "bg-[#FEF3C7] text-[#92400E] border-[#D97706]/30 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-600/60"
                            : "bg-[#FFE4E6] text-[#9F1239] border-[#E11D48]/30 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-600/60"
                        )}>
                          {isTaskNotCompleted ? 'Not Completed • Expired' : (
                            applied.status === 'in_progress' ? 'In Progress' :
                            applied.status === 'paused' ? 'Paused' :
                            applied.status === 'completed' ? 'Completed' : 'Blocked'
                          )}
                        </span>

                        {/* Priority Badge */}
                        {getPriorityBadge(applied.priority)}

                        {/* Matched Task Deadline */}
                        {matchedTask && (
                          <span className={cn(
                            "text-[11px] flex items-center gap-1",
                            isExpired ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-[#64748B] dark:text-[#A6B5C0]"
                          )}>
                            <Calendar className="h-3 w-3" />
                            {formatDeadline(matchedTask) ? `Deadline: ${formatDeadline(matchedTask)}` : ''}
                            {isExpired && !applied.status?.includes('completed') ? ' (Expired)' : ''}
                          </span>
                        )}
                      </div>

                      {/* Work Description Text */}
                      <p className="text-sm font-medium text-[#172B3A] dark:text-[#E8F0F4] whitespace-pre-wrap leading-relaxed pt-1">
                        {applied.taskDetails}
                      </p>

                      {/* Expired Task Context Info */}
                      {isTaskNotCompleted && (
                        <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5 pt-0.5">
                          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                          This task was not completed within the assigned time. It cannot be opened or worked on.
                        </p>
                      )}

                      {/* Blocker Notes Alert */}
                      {note.blockerNotes && (
                        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300">
                          <strong>Blocker:</strong> {applied.blockerNotes}
                        </div>
                      )}

                      {/* Timer & Completion Details */}
                      <div className="flex items-center gap-3 text-xs text-[#64748B] dark:text-[#A6B5C0] pt-1">
                        {applied.status === 'in_progress' && !isTaskNotCompleted && (
                          <span className="flex items-center gap-1.5 font-mono text-teal-600 dark:text-teal-400 font-semibold">
                            <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                            Active Timer: {formatRunningDuration(applied)}
                          </span>
                        )}
                        {applied.status === 'paused' && !isTaskNotCompleted && (
                          <span className="flex items-center gap-1.5 font-mono text-amber-600 dark:text-amber-400 font-semibold">
                            <Pause className="w-3.5 h-3.5" />
                            Paused at: {formatPausedDuration(applied)}
                          </span>
                        )}
                        {applied.status === 'completed' && (
                          <span className="flex items-center gap-1.5 font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Completed in {formatDurationBetween(applied.createdAt, applied.updatedAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Controls for Staff / Admin */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-end sm:self-start pt-2 sm:pt-0">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[#64748B] hover:text-[#172B3A] dark:hover:text-[#E8F0F4] hover:bg-[#F4F8FA] dark:hover:bg-[#1D303B] rounded-xl"
                          onClick={() => {
                            setEditingScrum(applied);
                            setScrumForm({
                              taskDetails: applied.taskDetails,
                              status: applied.status,
                              priority: applied.priority || 'medium',
                              blockerNotes: applied.blockerNotes || '',
                            });
                          }}
                          title="Edit Scrum Entry"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}

                      {applied.status !== 'completed' && !isTaskNotCompleted && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs font-semibold rounded-xl border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5 hover:bg-emerald-500/15"
                            onClick={() => handleMarkCompleted(applied)}
                            disabled={updateScrumNote.isPending}
                          >
                            <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Complete
                          </Button>

                          {applied.status === 'paused' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-xs font-semibold rounded-xl border border-teal-500/30 text-teal-700 dark:text-teal-300 bg-teal-500/5 hover:bg-teal-500/15"
                              onClick={() => handleMarkResume(applied)}
                              disabled={updateScrumNote.isPending}
                            >
                              <Play className="h-3.5 w-3.5 mr-1 text-teal-600" /> Resume
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-xs font-semibold rounded-xl border border-amber-500/30 text-amber-700 dark:text-amber-300 bg-amber-500/5 hover:bg-amber-500/15"
                              onClick={() => handleMarkPaused(applied)}
                              disabled={updateScrumNote.isPending}
                            >
                              <Pause className="h-3.5 w-3.5 mr-1 text-amber-600" /> Pause
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs font-semibold rounded-xl border border-rose-500/30 text-rose-700 dark:text-rose-300 bg-rose-500/5 hover:bg-rose-500/15"
                            onClick={() => handleMarkBlocked(applied)}
                            disabled={updateScrumNote.isPending}
                          >
                            Block
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Meeting Notes Section */}
      <div className="space-y-4 pt-4 border-t border-[#DFE8EC] dark:border-[#2A3D48]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#172B3A] dark:text-[#E8F0F4]">Meeting Notes</h2>
            <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] mt-0.5">
              Collaborative discussions, agendas, and strategic takeaways.
            </p>
          </div>

          {isAdmin && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  onClick={() => handleOpenDialog()} 
                  className="h-9 px-3.5 rounded-xl bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs sm:text-sm font-semibold shadow-xs flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Meeting Note</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] max-w-xl rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] text-foreground">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold text-[#172B3A] dark:text-[#E8F0F4]">
                    {editingNote ? 'Edit Meeting Note' : 'Add New Meeting Note'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="note-title" className="text-xs font-semibold text-[#172B3A] dark:text-[#E8F0F4]">Meeting Title *</Label>
                    <Input
                      id="note-title"
                      value={formData.title}
                      onChange={e => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g. Sprint Retrospective, Client Design Review"
                      className="h-9.5 text-xs sm:text-sm rounded-xl bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] text-[#172B3A] dark:text-[#E8F0F4]"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="note-content" className="text-xs font-semibold text-[#172B3A] dark:text-[#E8F0F4]">Notes & Key Takeaways *</Label>
                    <Textarea
                      id="note-content"
                      value={formData.content}
                      onChange={e => setFormData({ ...formData, content: e.target.value })}
                      placeholder="Outline key discussion points, decisions made, and follow-up action items..."
                      rows={6}
                      className="text-xs sm:text-sm rounded-xl bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] text-[#172B3A] dark:text-[#E8F0F4]"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-10 rounded-xl bg-[#0D9488] hover:bg-[#0F766E] text-white font-semibold"
                    disabled={addNote.isPending || updateNote.isPending}
                  >
                    {addNote.isPending || updateNote.isPending ? 'Saving Note...' : 'Save Meeting Note'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Meeting Notes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isLoading ? (
            <Card className="col-span-full border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] text-foreground rounded-2xl p-8 text-center text-sm text-[#64748B] dark:text-[#A6B5C0]">
              Loading meeting notes...
            </Card>
          ) : notes.length === 0 ? (
            <Card className="col-span-full border border-dashed border-[#DFE8EC] dark:border-[#2A3D48] bg-[#F4F8FA]/60 dark:bg-[#1D303B]/40 text-foreground rounded-2xl p-10 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6] flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-[#172B3A] dark:text-[#E8F0F4]">No Meeting Notes Recorded</h4>
              <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] mt-1 max-w-sm mx-auto leading-relaxed">
                No meeting notes have been published yet. Administrators can add meeting takeaways and agendas above.
              </p>
            </Card>
          ) : (
            notes.map(note => (
              <Card key={note.id} className="border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] text-foreground rounded-2xl shadow-xs overflow-hidden flex flex-col justify-between hover:border-[#0D9488]/40 transition-all">
                <CardHeader className="p-4 sm:p-5 border-b border-[#DFE8EC]/70 dark:border-[#2A3D48]/70 bg-[#F4F8FA]/60 dark:bg-[#1D303B]/40 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-base font-bold text-[#172B3A] dark:text-[#E8F0F4] truncate">{note.title}</h4>
                      <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] mt-0.5 flex items-center gap-1.5 font-mono">
                        <Calendar className="h-3 w-3 text-[#0D9488] dark:text-[#14B8A6]" />
                        {formatDate(note.timestamp)}
                      </p>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[#64748B] hover:text-[#172B3A] dark:hover:text-[#E8F0F4] hover:bg-[#F4F8FA] dark:hover:bg-[#1D303B] rounded-xl"
                          onClick={() => handleOpenDialog(note)}
                          title="Edit Note"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[#64748B] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl"
                          onClick={() => handleDelete(note.id)}
                          title="Delete Note"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-5 flex-1">
                  <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#A6B5C0] whitespace-pre-wrap leading-relaxed">
                    {note.content}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
