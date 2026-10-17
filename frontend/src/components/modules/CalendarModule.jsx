import { useState, useMemo, useEffect, useRef } from 'react';
import { useGetAllHolidays, useAddHoliday, useUpdateHoliday, useDeleteHoliday, useGetAllLeaveRequests, useGetUserLeaveRequests, useApplyLeave, useUpdateLeaveRequest, useGetAllUsers } from '../../hooks/useQueries';
import { useCustomAuth } from '../../hooks/useCustomAuth';
import { useIsMobile } from '../../hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { safeRandomUUID, hasUserRole } from '@/lib/utils';

export default function CalendarModule({ userProfile }) {
  const { identity } = useCustomAuth();
  const { data: holidays = [], isLoading: holidaysLoading } = useGetAllHolidays();
  const { data: leaveRequests = [], isLoading: leavesLoading } = useGetAllLeaveRequests();
  const { data: myLeaves = [] } = useGetUserLeaveRequests((userProfile.userId || userProfile.id) || null);
  const { data: users = [] } = useGetAllUsers();
  const addHoliday = useAddHoliday();
  const updateHoliday = useUpdateHoliday();
  const deleteHoliday = useDeleteHoliday();
  const applyLeave = useApplyLeave();
  const updateLeaveReq = useUpdateLeaveRequest();

  const [isHolidayDialogOpen, setIsHolidayDialogOpen] = useState(false);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [isCellDialogOpen, setIsCellDialogOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [holidayForm, setHolidayForm] = useState({ name: '', date: '' });
  const [leaveForm, setLeaveForm] = useState({ type: 'casual', startDate: '', endDate: '', reason: '' });
  const [monthDate, setMonthDate] = useState(new Date());
  const isMobile = useIsMobile();
  const touchStartX = useRef(null);

  const isAdmin = hasUserRole(userProfile, 'admin') || hasUserRole(userProfile, 'owner') || hasUserRole(userProfile, 'param');
  const visibleHolidays = useMemo(() => holidays, [holidays]);
  const toIdText = (val) => (typeof val === 'string' ? val : (val?.toText ? val.toText() : String(val)));
  const formatUserLabel = (u) => {
    const first = u?.firstName || '';
    const last = u?.lastName || '';
    const name = [first, last].filter(Boolean).join(' ').trim();
    if (name) return name;
    if (u?.username) return u.username;
    if (u?.name) return u.name;
    return toIdText(u?.userId || u?.id || '');
  };
  const daysBetweenInclusive = (s, e) => {
    const sd = new Date(s);
    const ed = new Date(e);
    if (!sd || !ed || isNaN(sd) || isNaN(ed)) return 0;
    const diff = Math.floor((ed.getTime() - sd.getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff + 1 : 0;
  };
  const holidaySet = useMemo(() => new Set(visibleHolidays.map(h => h.date)), [visibleHolidays]);
  const holidayList = useMemo(
    () => visibleHolidays.filter(h => String(h.name || '').toLowerCase() !== 'sunday'),
    [visibleHolidays]
  );
  const approvedLeaveDays = useMemo(() => {
    const list = (isAdmin ? leaveRequests : myLeaves).filter(l => l.status === 'approved');
    const ranges = [];
    for (const l of list) {
      let d = new Date(l.startDate);
      const end = new Date(l.endDate);
      while (d <= end) {
        const uid = toIdText(l.userId);
        const staff = users.find(u => toIdText(u.userId || u.id) === uid);
        const label = formatUserLabel(staff) || (l.displayId || l.userId);
        ranges.push({ iso: format(d, 'yyyy-MM-dd'), name: label });
        d = addDays(d, 1);
      }
    }
    const map = new Map();
    for (const r of ranges) {
      map.set(r.iso, r.name);
    }
    return map;
  }, [isAdmin, leaveRequests, myLeaves, users]);
  const birthdayDays = useMemo(() => {
    const map = new Map();
    const pad2 = (n) => String(n).padStart(2, '0');
    const currentYear = monthDate.getFullYear();
    const parseMonthDay = (dob) => {
      if (!dob) return null;
      const s = String(dob).trim();
      const m = s.match(/^(\d{4})\D(\d{2})\D(\d{2})/);
      if (m) return { month: Number(m[2]), day: Number(m[3]) };
      const dmy = s.match(/^(\d{1,2})\D(\d{1,2})\D(\d{4})$/);
      if (dmy) {
        const a = Number(dmy[1]);
        const b = Number(dmy[2]);
        const month = a > 12 ? b : (b > 12 ? a : b);
        const day = a > 12 ? a : (b > 12 ? b : a);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
      }
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return null;
      return { month: d.getMonth() + 1, day: d.getDate() };
    };
    const getBirthdayLabel = (u) => (u?.username || u?.name || '').toString().trim() || toIdText(u?.userId || u?.id || '');
    for (const u of users) {
      // Show birthdays for all users (staff, admins, owners)
      const md = parseMonthDay(u.dateOfBirth);
      if (!md) continue;
      let month = md.month;
      let day = md.day;
      if (month === 2 && day === 29) {
        const isLeap = (currentYear % 4 === 0 && currentYear % 100 !== 0) || (currentYear % 400 === 0);
        if (!isLeap) day = 28;
      }
      const iso = `${currentYear}-${pad2(month)}-${pad2(day)}`;
      const list = map.get(iso) || [];
      list.push(getBirthdayLabel(u));
      map.set(iso, list);
    }
    return map;
  }, [users, monthDate]);
  const monthMatrix = useMemo(() => {
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    const gridStart = addDays(start, -start.getDay());
    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      const inMonth = d.getMonth() === monthDate.getMonth();
      const iso = format(d, 'yyyy-MM-dd');
      const leaveName = approvedLeaveDays.get(iso);
      const bdays = birthdayDays.get(iso);
      const birthdayLabel = bdays && bdays.length ? bdays.join(', ') : '';
      days.push({ date: d, iso, inMonth, isHoliday: holidaySet.has(iso), leaveName, birthdayLabel });
    }
    const weeks = [];
    for (let w = 0; w < 6; w++) {
      weeks.push(days.slice(w * 7, (w + 1) * 7));
    }
    return weeks;
  }, [monthDate, holidaySet, approvedLeaveDays, birthdayDays]);

  // Auto-adjust leave dates to skip holidays and approved leaves
  useEffect(() => {
    if (!leaveForm.startDate || !leaveForm.endDate) return;

    const unavailableDates = new Set();
    
    // Add holidays
    visibleHolidays.forEach(h => {
      unavailableDates.add(h.date);
    });

    // Add user's approved leave dates
    myLeaves.forEach(l => {
      if (l.status === 'approved') {
        let d = new Date(l.startDate + 'T00:00:00');
        const end = new Date(l.endDate + 'T00:00:00');
        while (d <= end) {
          unavailableDates.add(d.toISOString().split('T')[0]);
          d.setDate(d.getDate() + 1);
        }
      }
    });

    const isAvailable = (dateStr) => !unavailableDates.has(dateStr);

    // Check if start date is available, if not find next available
    let startDate = new Date(leaveForm.startDate + 'T00:00:00');
    let adjustedStart = leaveForm.startDate;
    let daysToAdjust = 0;
    
    while (!isAvailable(startDate.toISOString().split('T')[0])) {
      startDate.setDate(startDate.getDate() + 1);
      daysToAdjust++;
      if (daysToAdjust > 365) break; // Safety check
    }

    if (daysToAdjust > 0) {
      adjustedStart = startDate.toISOString().split('T')[0];
      setLeaveForm(prev => ({ ...prev, startDate: adjustedStart }));
      toast.info(`Start date adjusted to ${adjustedStart} (skipped holidays/approved leaves)`);
      return;
    }

    // Check if end date is available, if not find next available
    let endDate = new Date(leaveForm.endDate + 'T00:00:00');
    let adjustedEnd = leaveForm.endDate;
    daysToAdjust = 0;

    while (!isAvailable(endDate.toISOString().split('T')[0])) {
      endDate.setDate(endDate.getDate() + 1);
      daysToAdjust++;
      if (daysToAdjust > 365) break; // Safety check
    }

    if (daysToAdjust > 0) {
      adjustedEnd = endDate.toISOString().split('T')[0];
      setLeaveForm(prev => ({ ...prev, endDate: adjustedEnd }));
      toast.info(`End date adjusted to ${adjustedEnd} (skipped holidays/approved leaves)`);
    }
  }, [leaveForm.startDate, leaveForm.endDate, visibleHolidays, myLeaves]);

  const handleOpenHolidayDialog = (holiday) => {
    if (holiday) {
      setEditingHoliday(holiday);
      setHolidayForm({ name: holiday.name, date: holiday.date });
    } else {
      setEditingHoliday(null);
      setHolidayForm({ name: '', date: '' });
    }
    setIsHolidayDialogOpen(true);
  };

  const handleCellClick = (cell) => {
    setSelectedCell(cell);
    setIsCellDialogOpen(true);
  };

  const handleHolidaySubmit = async (e) => {
    e.preventDefault();

    try {
      const holiday = {
        id: editingHoliday ? editingHoliday.id : `holiday-${Date.now()}`,
        name: holidayForm.name,
        date: holidayForm.date,
      };

      if (editingHoliday) {
        await updateHoliday.mutateAsync(holiday);
        toast.success('Holiday updated successfully');
      } else {
        await addHoliday.mutateAsync(holiday);
        toast.success('Holiday added successfully');
      }

      setIsHolidayDialogOpen(false);
    } catch (error) {
      toast.error('Failed to save holiday');
      console.error(error);
    }
  };

  const handleDeleteHoliday = async (id) => {
    if (confirm('Are you sure you want to delete this holiday?')) {
      try {
        await deleteHoliday.mutateAsync(id);
        toast.success('Holiday deleted successfully');
      } catch (error) {
        toast.error('Failed to delete holiday');
        console.error(error);
      }
    }
  };

  const handleLeaveSubmit = async (e) => {
    e.preventDefault();

    if (!identity) return;

    try {
      // Validate dates
      if (!leaveForm.startDate || !leaveForm.endDate) {
        toast.error('Please select both start and end dates');
        return;
      }

      const startDate = new Date(leaveForm.startDate + 'T00:00:00');
      const endDate = new Date(leaveForm.endDate + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if start date is in the past
      if (startDate < today) {
        toast.error('Start date cannot be in the past');
        return;
      }

      // Check if end date is before start date
      if (endDate < startDate) {
        toast.error('End date cannot be before start date');
        return;
      }

      // Get the current user's ID
      const uid = (typeof userProfile.userId === 'string' && userProfile.userId)
        ? userProfile.userId
        : (userProfile.id?.toText ? userProfile.id.toText() : String(userProfile.id));

      // Build set of unavailable dates (holidays + approved leaves)
      const unavailableDates = new Set();
      
      // Add holidays
      visibleHolidays.forEach(h => {
        unavailableDates.add(h.date);
      });

      // Add user's approved leave dates
      myLeaves.forEach(l => {
        if (l.status === 'approved') {
          let d = new Date(l.startDate + 'T00:00:00');
          const end = new Date(l.endDate + 'T00:00:00');
          while (d <= end) {
            unavailableDates.add(d.toISOString().split('T')[0]);
            d.setDate(d.getDate() + 1);
          }
        }
      });

      // Check and warn if selected dates contain holidays or approved leaves
      let currentDate = new Date(startDate);
      const unavailableDatesInRange = [];
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        if (unavailableDates.has(dateStr)) {
          unavailableDatesInRange.push(dateStr);
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      if (unavailableDatesInRange.length > 0) {
        toast.warning(`Note: Your leave request includes holidays or already approved leave dates: ${unavailableDatesInRange.join(', ')}`);
      }

      await applyLeave.mutateAsync({
        id: safeRandomUUID(),
        userId: uid,
        displayId: uid,
        type: leaveForm.type,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        reason: leaveForm.reason,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      toast.success('Leave request submitted successfully');
      setIsLeaveDialogOpen(false);
      setLeaveForm({ type: 'casual', startDate: '', endDate: '', reason: '' });
    } catch (error) {
      toast.error('Failed to submit leave request');
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Office Calendar</h2>
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-lg">Monthly Calendar</CardTitle>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              >
                Prev
              </Button>
              <span className="text-sm text-muted-foreground">
                {format(monthDate, 'MMMM yyyy')}
              </span>
              <Button
                variant="outline"
                onClick={() => setMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-7 gap-1 sm:gap-2 text-xs text-muted-foreground w-full max-w-[800px] mx-auto min-w-[320px] sm:min-w-[420px]">
            <div className="text-center font-medium">Sun</div>
            <div className="text-center font-medium">Mon</div>
            <div className="text-center font-medium">Tue</div>
            <div className="text-center font-medium">Wed</div>
            <div className="text-center font-medium">Thu</div>
            <div className="text-center font-medium">Fri</div>
            <div className="text-center font-medium">Sat</div>
          </div>
          <div
            className="overflow-x-auto flex justify-center w-full"
            onTouchStart={
              isMobile
                ? (e) => {
                    touchStartX.current = e.touches?.[0]?.clientX ?? null;
                  }
                : undefined
            }
            onTouchEnd={
              isMobile
                ? (e) => {
                    const startX = touchStartX.current;
                    const endX = e.changedTouches?.[0]?.clientX ?? null;
                    touchStartX.current = null;
                    if (startX === null || endX === null) return;
                    const delta = endX - startX;
                    if (Math.abs(delta) < 40) return;
                    if (delta < 0) {
                      setMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
                    } else {
                      setMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
                    }
                  }
                : undefined
            }
          >
            <div className="grid grid-cols-7 gap-1 sm:gap-2 w-full max-w-[800px] mx-auto min-w-[320px] sm:min-w-[420px]">
              {monthMatrix.flat().map((cell, idx) => (
                <div
                  key={idx}
                  onClick={() => handleCellClick(cell)}
                  role="button"
                  tabIndex={0}
                  className={`rounded-md p-1 sm:p-2 h-14 sm:h-20 flex flex-col justify-between overflow-hidden relative cursor-pointer focus:outline focus:outline-2 focus:outline-primary ${cell.inMonth ? '' : 'opacity-40'} ${cell.isHoliday ? 'bg-muted text-muted-foreground' : 'bg-background border'}`}
                  style={
                    cell.leaveName
                      ? { backgroundColor: 'rgb(15 21 65)', color: 'rgb(219 228 231)' }
                      : (cell.birthdayLabel ? { backgroundColor: 'rgb(255 215 0)', color: 'rgb(0 0 0)' } : undefined)
                  }
                >
                  <div className="w-full flex items-start justify-center sm:justify-between">
                    <div className="text-[11px] sm:text-sm font-semibold text-center sm:text-left w-full sm:w-auto">{cell.date.getDate()}</div>
                  </div>
                  <div className="mt-0.5 w-full flex flex-col gap-0.5 items-center sm:items-start text-center sm:text-left">
                    {cell.isHoliday && (
                      <div className="text-[9px] sm:text-[10px] truncate w-full">Holiday</div>
                    )}
                    {cell.leaveName && (
                      <div className="text-[9px] sm:text-[10px] font-semibold truncate w-full">Leave: {String(cell.leaveName)}</div>
                    )}
                    {cell.birthdayLabel && (
                      <div className="text-[9px] sm:text-[10px] font-semibold truncate w-full">B'Day: {String(cell.birthdayLabel)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Cell detail dialog shown on tap/click (mobile friendly) */}
          <Dialog open={isCellDialogOpen} onOpenChange={setIsCellDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{selectedCell ? format(selectedCell.date, 'MMMM dd, yyyy') : 'Details'}</DialogTitle>
              </DialogHeader>
              {selectedCell && (
                <div className="space-y-2">
                  {selectedCell.isHoliday && <p className="font-medium">Holiday</p>}
                  {selectedCell.leaveName && <p className="font-medium">Leave: {selectedCell.leaveName}</p>}
                  {selectedCell.birthdayLabel && (
                    <div>
                      <p className="font-medium">Birthdays:</p>
                      <p className="text-sm text-muted-foreground">{String(selectedCell.birthdayLabel)}</p>
                    </div>
                  )}
                  {!selectedCell.isHoliday && !selectedCell.leaveName && !selectedCell.birthdayLabel && (
                    <p className="text-sm text-muted-foreground">No events</p>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
          <p className="text-xs text-muted-foreground">
            Grey-shaded dates indicate official company holidays.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue={isAdmin ? 'holidays' : 'leaves'} className="w-full">
        <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {isAdmin && <TabsTrigger value="holidays">Holidays</TabsTrigger>}
          <TabsTrigger value="leaves">Leave Requests</TabsTrigger>
        </TabsList>

        {isAdmin && (
        <TabsContent value="holidays" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Company Holidays</h3>
            {isAdmin && (
              <Dialog open={isHolidayDialogOpen} onOpenChange={setIsHolidayDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => handleOpenHolidayDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Holiday
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingHoliday ? 'Edit Holiday' : 'Add Holiday'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleHolidaySubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Holiday Name *</Label>
                      <Input
                        id="name"
                        value={holidayForm.name}
                        onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                        placeholder="e.g., New Year's Day"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="date">Date *</Label>
                      <Input
                        id="date"
                        type="date"
                        value={holidayForm.date}
                        onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={addHoliday.isPending || updateHoliday.isPending}>
                      {(addHoliday.isPending || updateHoliday.isPending) ? 'Saving...' : 'Save Holiday'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {holidaysLoading ? (
              <p className="col-span-full text-center py-8 text-muted-foreground">Loading holidays...</p>
            ) : holidayList.length === 0 ? (
              <p className="col-span-full text-center py-8 text-muted-foreground">No holidays found</p>
            ) : (
              holidayList.map((holiday) => (
                <Card key={holiday.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-base">{holiday.name}</CardTitle>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleOpenHolidayDialog(holiday)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDeleteHoliday(holiday.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {new Date(holiday.date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
        )}

        <TabsContent value="leaves" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Leave Requests</h3>
            <Dialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Apply Leave
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Apply for Leave</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleLeaveSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Type *</Label>
                    <select
                      id="type"
                      className="h-10 w-full border rounded-md bg-background"
                      value={leaveForm.type}
                      onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}
                    >
                      <option value="casual">Casual</option>
                      <option value="sick">Sick</option>
                      <option value="earned">Earned</option>
                      <option value="unpaid">Unpaid</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date *</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={leaveForm.startDate}
                      onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">End Date *</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={leaveForm.endDate}
                      onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason</Label>
                    <Textarea
                      id="reason"
                      value={leaveForm.reason}
                      onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                      placeholder="Reason for leave..."
                      rows={3}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={applyLeave.isPending}>
                    {applyLeave.isPending ? 'Submitting...' : 'Submit Request'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <p className="text-sm text-muted-foreground">Submitted: {myLeaves.length}</p>

          <Card>
            <CardHeader>
              <CardTitle>All Leave Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {isAdmin ? (leavesLoading ? (
                <p className="text-center py-8 text-muted-foreground">Loading leave requests...</p>
              ) : leaveRequests.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No leave requests found</p>
              ) : (
                <div className="space-y-3">
                  {leaveRequests.map((leave) => (
                            <div key={leave.id} className="p-3 border rounded-lg hover:bg-accent transition-colors">
                              <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                  <p className="font-medium">
                                    {leave.startDate} to {leave.endDate}{' '}
                                    <span className="font-bold">({daysBetweenInclusive(leave.startDate, leave.endDate)} days)</span>
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {leave.reason || 'No notes'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Requested by: {(() => {
                                      const toIdText = (val) => (typeof val === 'string' ? val : (val?.toText ? val.toText() : String(val)));
                                      const staff = users.find(u => toIdText(u.userId || u.id) === toIdText(leave.userId));
                                      const first = staff?.firstName || '';
                                      const last = staff?.lastName || '';
                                      const name = [first, last].filter(Boolean).join(' ').trim();
                                      return name || staff?.username || staff?.name || (leave.displayId || leave.userId);
                                    })()} - {new Date(leave.createdAt).toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                    leave.status === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                    leave.status === 'rejected' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                  }`}>
                                    {leave.status}
                                  </span>
                                  {isAdmin && leave.status === 'pending' && (
                                    <>
                                      <Button size="sm" variant="outline" onClick={() => updateLeaveReq.mutateAsync({ id: leave.id, status: 'approved' })}>
                                        Approve
                                      </Button>
                                      <Button size="sm" variant="destructive" onClick={() => updateLeaveReq.mutateAsync({ id: leave.id, status: 'rejected' })}>
                                        Reject
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                  ))}
                </div>
              )) : (
                myLeaves.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No leave requests found</p>
                ) : (
                  <div className="space-y-3">
                    {myLeaves.map((leave) => (
                      <div key={leave.id} className="p-3 border rounded-lg hover:bg-accent transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <p className="font-medium">
                              {leave.startDate} to {leave.endDate}{' '}
                              <span className="font-bold">({daysBetweenInclusive(leave.startDate, leave.endDate)} days)</span>
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {leave.reason || 'No notes'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Requested by: {(() => {
                                const toIdText = (val) => (typeof val === 'string' ? val : (val?.toText ? val.toText() : String(val)));
                                const staff = users.find(u => toIdText(u.userId || u.id) === toIdText(leave.userId));
                                const first = staff?.firstName || '';
                                const last = staff?.lastName || '';
                                const name = [first, last].filter(Boolean).join(' ').trim();
                                return name || staff?.username || staff?.name || (leave.displayId || leave.userId);
                              })()} - {new Date(leave.createdAt).toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                              leave.status === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                              leave.status === 'rejected' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                              'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                            }`}>
                              {leave.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
