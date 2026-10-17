import { useMemo, useState, useEffect } from 'react';
import { useGetAllMeetingNotes, useAddMeetingNote, useUpdateMeetingNote, useDeleteMeetingNote, useGetUserScrumNotes, useGetAllScrumNotes, useAddScrumNote, useUpdateScrumNote, useGetAllUsers, useGetAllTasks, useCreateTask, useUpdateTask } from '../../hooks/useQueries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Clock, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomAuth } from '../../hooks/useCustomAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { safeRandomUUID } from '@/lib/utils';
import { isTaskExpired, getTaskUiStatus, getTaskStatusLabel, getTaskStatusBadgeClass, formatDeadline } from '@/lib/taskUtils';

export default function ScrumModule({ userProfile }) {
  const { identity } = useCustomAuth();
  const isAdmin = userProfile.role.hasOwnProperty('admin') || userProfile.role.hasOwnProperty('owner') || userProfile.role.hasOwnProperty('param');
  const isStaff = userProfile.role.hasOwnProperty('staff') || userProfile.role.hasOwnProperty('intern') || userProfile.role.hasOwnProperty('freelancer');

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

    const now = new Date();
    const timestamp = BigInt(now.getTime() * 1000000);

    const baseNote = {
      id: editingScrum ? editingScrum.id : safeRandomUUID(),
      userId: editingScrum ? editingScrum.userId : (userProfile.userId || userProfile.id || currentUserId),
      taskDetails: scrumForm.taskDetails.trim(),
      status: scrumForm.status,
      priority: scrumForm.priority,
      blockerNotes: scrumForm.status === 'blocked' ? scrumForm.blockerNotes.trim() : '',
      timer: editingScrum ? ((typeof editingScrum.timer === 'number' ? editingScrum.timer : (editingScrum.timer ? Number(editingScrum.timer) : (editingScrum.timmer || 0))) ) : 0,
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
          createdDate.toISOString().split('T')[0] === now.toISOString().split('T')[0];
        if (!sameDay && !isAdmin) {
          toast.error('Only same-day scrums can be edited');
          return;
        }
        await updateScrumNote.mutateAsync(baseNote);
        toast.success('Scrum updated');
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
        toast.success('Scrum saved');
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
      toast.success('Resumed');
    } catch (e) {
      toast.error('Failed to resume');
    }
  };

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
    return users.filter(u => u.role && (u.role.hasOwnProperty('staff') || u.role.hasOwnProperty('intern') || u.role.hasOwnProperty('freelancer')));
  }, [users, isAdmin]);

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
    return date ? date.toLocaleString() : '';
  };

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <h2 className="text-2xl md:text-2xl font-bold">Scrum & Meeting Notes</h2>
        </div>
        {isStaff && (
          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base md:text-lg">Daily Scrum Notepad</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Capture what you are working on today.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground md:justify-end">
                <Clock className="h-4 w-4" />
                <span>
                  {formatScrumDateTime(
                    editingScrum ? editingScrum.createdAt : BigInt(Date.now() * 1000000)
                  )}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleScrumSubmit} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="scrum-task">Task / Work Details</Label>
                    <Label>
                      {(() => {
                        const currentId = toIdText(userProfile.userId || userProfile.id || '');
                        const t = tasks.find(tt => toIdText(tt.assignedTo || tt.assignee || '') === currentId && tt.title === scrumForm.taskDetails);
                        const p = typeof t?.priority === 'string' ? t?.priority : Object.keys(t?.priority || { medium: null })[0] || 'medium';
                        return `Priority: ${p ? p.charAt(0).toUpperCase() + p.slice(1) : '--'}`;
                      })()}
                    </Label>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="space-y-2">
                      <Select
                        value={scrumForm.taskDetails}
                        onValueChange={(value) => setScrumForm({ ...scrumForm, taskDetails: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a task" />
                        </SelectTrigger>
                        <SelectContent>
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
                                  className={expired ? 'text-destructive opacity-75 font-medium' : ''}
                                >
                                  {t.title} {expired ? '— [Not Completed: Time Expired]' : ''}
                                </SelectItem>
                              );
                            })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Textarea
                    id="scrum-task"
                    value={scrumForm.taskDetails}
                    onChange={e => setScrumForm({ ...scrumForm, taskDetails: e.target.value })}
                    placeholder="Or type details here"
                    rows={3}
                  />
                  {(() => {
                    const currentId = toIdText(userProfile.userId || userProfile.id || '');
                    const matched = tasks.find(tt => 
                      toIdText(tt.assignedTo || tt.assignee || '') === currentId && 
                      tt.title.trim().toLowerCase() === (scrumForm.taskDetails || '').trim().toLowerCase()
                    );
                    if (matched && isTaskExpired(matched)) {
                      return (
                        <div className="p-3 rounded-md bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-200 text-xs font-semibold flex items-center gap-2">
                          <span>⚠️ The assigned time for this task ended ({formatDeadline(matched) || 'Deadline passed'}). This task is marked as <strong>Not Completed</strong> and cannot be opened.</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={scrumForm.status}
                      onValueChange={value =>
                        setScrumForm({ ...scrumForm, status: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="blocked">Blocked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {scrumForm.status === 'blocked' && (
                  <div className="space-y-2">
                    <Label>Blocker Notes</Label>
                    <Textarea
                      value={scrumForm.blockerNotes}
                      onChange={e =>
                        setScrumForm({ ...scrumForm, blockerNotes: e.target.value })
                      }
                      placeholder="Describe what is blocking your progress"
                      rows={3}
                    />
                  </div>
                )}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
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
                        className={`w-full md:flex-1 ${isTaskBlockedDueToExpiry ? 'bg-red-600 hover:bg-red-700 text-white cursor-not-allowed' : ''}`}
                        disabled={addScrumNote.isPending || updateScrumNote.isPending || isTaskBlockedDueToExpiry}
                      >
                        {editingScrum
                          ? (addScrumNote.isPending || updateScrumNote.isPending ? 'Saving...' : 'Update Scrum')
                          : isTaskBlockedDueToExpiry
                          ? 'Task Not Completed (Time Expired — Cannot Open)'
                          : (addScrumNote.isPending ? 'Saving...' : 'Start Scrum')}
                      </Button>
                    );
                  })()}
                  {editingScrum && (
                    <Button type="button" variant="outline" onClick={resetScrumForm} className="w-full md:w-auto">
                      New Entry
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-sm">Scrum History</h3>
            <span className="text-xs text-muted-foreground">
              Daily updates sorted by latest first.
            </span>
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Date</span>
              <Input
                type="date"
                className="h-8 w-full md:w-auto"
                value={historyDateFilter ? format(historyDateFilter, 'yyyy-MM-dd') : ''}
                onChange={e =>
                  setHistoryDateFilter(
                    e.target.value ? new Date(e.target.value + 'T00:00:00') : null
                  )
                }
              />
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Staff</span>
                <Select
                  value={historyStaffFilter}
                  onValueChange={value => setHistoryStaffFilter(value)}
                >
                  <SelectTrigger className="h-8 w-full md:w-40 text-xs">
                    <SelectValue placeholder="All staff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {staffOptions.map(staff => (
                      <SelectItem key={(staff.userId?.toText ? staff.userId.toText() : String(staff.userId || staff.id))} value={(staff.userId?.toText ? staff.userId.toText() : String(staff.userId || staff.id))}>
                        {staff.firstName} {staff.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {visibleScrumNotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No scrum entries found for the selected filters.
          </p>
        ) : (
          <div className="space-y-2">
            {visibleScrumNotes.map(note => {
              const applied = optimisticScrum[note.id] ? { ...note, ...optimisticScrum[note.id] } : note;
              const createdDate = toDate(note.createdAt);
              const isSameDay =
                createdDate && createdDate.toISOString().split('T')[0] === todayIso;
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
                  className={isTaskNotCompleted ? 'border-red-400 bg-red-50/20 dark:bg-red-950/20' : ''}
                >
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatScrumDateTime(applied.createdAt)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`px-2 py-0.5 rounded-full ${
                          isTaskNotCompleted
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200 border border-red-300 dark:border-red-800 font-semibold'
                            : applied.status === 'completed'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200 font-medium border border-green-300 dark:border-green-800'
                            : 'bg-muted'
                        }`}>
                          {isTaskNotCompleted
                            ? 'Not Completed'
                            : applied.status === 'in_progress'
                            ? 'In Progress'
                            : applied.status === 'paused'
                            ? 'Paused'
                            : applied.status === 'completed'
                            ? 'Completed'
                            : 'Blocked'}
                        </span>
                        {applied.priority && (
                          <span className="px-2 py-0.5 rounded-full bg-muted">
                            Priority: {applied.priority.charAt(0).toUpperCase() + applied.priority.slice(1)}
                          </span>
                        )}
                        {matchedTask && (
                          <span className={`text-[11px] ${isExpired ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-muted-foreground'}`}>
                            {formatDeadline(matchedTask) ? `Deadline: ${formatDeadline(matchedTask)}` : ''}
                            {isExpired && !applied.status?.includes('completed') ? ' — Expired' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {staffOptions.length > 0 && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <ChevronDown className="h-3 w-3" />
                          {(() => {
                            const staff = users.find(u => toIdText(u.userId || u.id) === sid);
                            return staff ? formatUserLabelSafe(staff) : 'You';
                          })()}
                        </span>
                      )}
                      {applied.status !== 'completed' && (
                        isTaskNotCompleted ? (
                          <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-semibold py-1 px-2.5 rounded bg-red-100/60 dark:bg-red-950/50 border border-red-300 dark:border-red-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
                            <span>Task Not Completed &bull; Expired</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleMarkCompleted(applied)}
                              disabled={updateScrumNote.isPending}
                            >
                              Mark Completed
                            </Button>
                            {applied.status === 'paused' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleMarkResume(applied)}
                                disabled={updateScrumNote.isPending}
                              >
                                Resume
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleMarkPaused(applied)}
                                disabled={updateScrumNote.isPending}
                              >
                                Pause
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleMarkBlocked(applied)}
                              disabled={updateScrumNote.isPending}
                            >
                              Block
                            </Button>
                          </div>
                        )
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm whitespace-pre-wrap">{applied.taskDetails}</p>
                    {isTaskNotCompleted && (
                      <p className="text-xs text-red-600 dark:text-red-400 font-semibold">
                        This task was not completed within the assigned time. It cannot be opened or worked on.
                      </p>
                    )}
                    {applied.status === 'in_progress' && !isTaskNotCompleted && (
                      <p className="text-xs text-muted-foreground">Timer: {formatRunningDuration(applied)}</p>
                    )}
                    {applied.status === 'paused' && !isTaskNotCompleted && (
                      <p className="text-xs font-bold">Timer: {formatPausedDuration(applied)}</p>
                    )}
                    {applied.status === 'completed' && (
                      <p className="text-xs font-bold">Completed in {formatDurationBetween(applied.createdAt, applied.updatedAt)}</p>
                    )}
                    {note.blockerNotes && (
                      <p className="text-xs text-destructive whitespace-pre-wrap">
                        Blocker: {applied.blockerNotes}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h3 className="font-semibold text-sm">Meeting Notes</h3>
          {isAdmin && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} className="w-full md:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Note
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] max-w-2xl md:w-auto">
                <DialogHeader>
                  <DialogTitle className="text-base md:text-lg">{editingNote ? 'Edit Meeting Note' : 'Add Meeting Note'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={e => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Meeting title"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="content">Content *</Label>
                    <Textarea
                      id="content"
                      value={formData.content}
                      onChange={e => setFormData({ ...formData, content: e.target.value })}
                      placeholder="Meeting notes, summary, action items..."
                      rows={10}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={addNote.isPending || updateNote.isPending}
                  >
                    {addNote.isPending || updateNote.isPending ? 'Saving...' : 'Save Note'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4">
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading meeting notes...</p>
          ) : notes.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No meeting notes found</p>
          ) : (
            notes.map(note => (
              <Card key={note.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{note.title}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatDate(note.timestamp)}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{note.content}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
