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
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Calendar as CalendarIcon, 
  CalendarDays,
  ChevronLeft, 
  ChevronRight, 
  Check, 
  X, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  User, 
  Palmtree, 
  Cake, 
  FileText 
} from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { safeRandomUUID, cn, hasUserRole } from '@/lib/utils';

export default function CalendarModule({ userProfile = {}, portalType, initialUsers = [] }) {
  const { identity } = useCustomAuth();
  const { data: holidays = [], isLoading: holidaysLoading } = useGetAllHolidays();
  const { data: leaveRequests = [], isLoading: leavesLoading } = useGetAllLeaveRequests();
  const { data: myLeaves = [] } = useGetUserLeaveRequests((userProfile?.userId || userProfile?.id) || null);
  const { data: usersQuery = [] } = useGetAllUsers();
  const users = useMemo(() => {
    return (usersQuery && usersQuery.length > 0) ? usersQuery : (initialUsers || []);
  }, [usersQuery, initialUsers]);
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
  const [agendaFilter, setAgendaFilter] = useState('all');
  const [agendaPage, setAgendaPage] = useState(1);
  const [leavePage, setLeavePage] = useState(1);
  const [myLeavePage, setMyLeavePage] = useState(1);
  const AGENDA_PAGE_SIZE = 4;
  const LEAVE_PAGE_SIZE = 4;
  const isMobile = useIsMobile();
  const touchStartX = useRef(null);

  // Portal & Role Permissions
  const isSuperAdminPortal = portalType === 'superadmin';
  const isSuperAdminUser = hasUserRole(userProfile, 'param');
  const isSuperAdmin = isSuperAdminPortal;
  const isOwner = hasUserRole(userProfile, 'owner') || isSuperAdminUser;
  const isCompanyAdmin = hasUserRole(userProfile, 'admin');
  const isCompanyPortal = isOwner || isCompanyAdmin;
  const isEmployee = !isCompanyPortal && !isSuperAdmin;

  // Administrative powers (holiday management & employee leave review/approval)
  const canManageHolidays = isCompanyPortal || isSuperAdmin || isSuperAdminUser;
  const canReviewLeaves = isCompanyPortal || isSuperAdmin || isSuperAdminUser;

  // Strict Role Requirement: "Apply Leave" is ONLY for employees in User Portal.
  // Company Portal (Owner/Admin) and Super Admin must NEVER see or be able to apply for leave here.
  const canApplyLeave = isEmployee && !isCompanyPortal && !isSuperAdmin;
  const isAdmin = canReviewLeaves;
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
  const formatFriendlyDate = (dateStr) => {
    if (!dateStr) return '--';
    try {
      const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
      if (isNaN(d.getTime())) return dateStr;
      return format(d, 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };
  const formatDateTime = (dateVal) => {
    if (!dateVal) return '';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return String(dateVal);
      return format(d, 'MMM d, yyyy, h:mm a');
    } catch {
      return String(dateVal);
    }
  };
  const holidaySet = useMemo(() => new Set(visibleHolidays.map(h => h.date)), [visibleHolidays]);
  const holidayMap = useMemo(() => {
    const map = new Map();
    visibleHolidays.forEach(h => {
      if (h.date) map.set(h.date, h.name || 'Company Holiday');
    });
    return map;
  }, [visibleHolidays]);
  const holidayList = useMemo(
    () => visibleHolidays.filter(h => String(h.name || '').toLowerCase() !== 'sunday'),
    [visibleHolidays]
  );
  const approvedLeaveDays = useMemo(() => {
    const list = (isAdmin ? leaveRequests : myLeaves).filter(l => l.status === 'approved');
    const map = new Map();
    for (const l of list) {
      let d = new Date(l.startDate);
      const end = new Date(l.endDate);
      while (d <= end) {
        const uid = toIdText(l.userId);
        const staff = users.find(u => toIdText(u.userId || u.id) === uid);
        const label = formatUserLabel(staff) || (l.displayId || l.userId);
        const iso = format(d, 'yyyy-MM-dd');
        const item = {
          id: l.id,
          leave: l,
          staff,
          userId: uid,
          name: label,
          username: staff?.username || uid,
          avatar: staff?.avatar || '',
          department: staff?.department || '',
          designation: staff?.designation || staff?.role || '',
          type: l.type || 'Leave',
          reason: l.reason || '',
          startDate: l.startDate,
          endDate: l.endDate,
          status: 'approved'
        };
        const current = map.get(iso) || [];
        current.push(item);
        map.set(iso, current);
        d = addDays(d, 1);
      }
    }
    return map;
  }, [isAdmin, leaveRequests, myLeaves, users]);

  const pendingLeaveDays = useMemo(() => {
    const list = (isAdmin ? leaveRequests : myLeaves).filter(l => l.status === 'pending');
    const map = new Map();
    for (const l of list) {
      let d = new Date(l.startDate);
      const end = new Date(l.endDate);
      while (d <= end) {
        const uid = toIdText(l.userId);
        const staff = users.find(u => toIdText(u.userId || u.id) === uid);
        const label = formatUserLabel(staff) || (l.displayId || l.userId);
        const iso = format(d, 'yyyy-MM-dd');
        const item = {
          id: l.id,
          leave: l,
          staff,
          userId: uid,
          name: label,
          username: staff?.username || uid,
          avatar: staff?.avatar || '',
          department: staff?.department || '',
          designation: staff?.designation || staff?.role || '',
          type: l.type || 'Leave',
          reason: l.reason || '',
          startDate: l.startDate,
          endDate: l.endDate,
          status: 'pending'
        };
        const current = map.get(iso) || [];
        current.push(item);
        map.set(iso, current);
        d = addDays(d, 1);
      }
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
      list.push({
        id: u?.id || u?.userId || toIdText(u),
        user: u,
        name: getBirthdayLabel(u),
        fullName: formatUserLabel(u),
        username: u?.username || toIdText(u?.userId || u?.id),
        avatar: u?.avatar || '',
        department: u?.department || '',
        designation: u?.designation || u?.role || '',
        dateOfBirth: u?.dateOfBirth
      });
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
      const approvedLeavesList = approvedLeaveDays.get(iso) || [];
      const pendingLeavesList = pendingLeaveDays.get(iso) || [];
      const allLeavesList = [...approvedLeavesList, ...pendingLeavesList];
      const holidayName = holidayMap.get(iso);
      const birthdaysList = birthdayDays.get(iso) || [];
      const birthdayLabel = birthdaysList.length > 0 ? birthdaysList.map(b => b.name).join(', ') : '';
      const leaveName = approvedLeavesList.length > 0 ? approvedLeavesList.map(l => l.name).join(', ') : '';
      const pendingLeaveName = pendingLeavesList.length > 0 ? pendingLeavesList.map(l => l.name).join(', ') : '';

      days.push({
        date: d,
        iso,
        inMonth,
        isHoliday: !!holidayName,
        holidayName,
        leaveName,
        pendingLeaveName,
        birthdayLabel,
        birthdaysList,
        approvedLeavesList,
        pendingLeavesList,
        allLeavesList
      });
    }
    const weeks = [];
    for (let w = 0; w < 6; w++) {
      weeks.push(days.slice(w * 7, (w + 1) * 7));
    }
    return weeks;
  }, [monthDate, holidayMap, approvedLeaveDays, pendingLeaveDays, birthdayDays]);

  // Real event counts for active month
  const monthlyMetrics = useMemo(() => {
    const currentMonthNum = monthDate.getMonth();
    const currentYear = monthDate.getFullYear();

    // 1. Birthdays in this month
    let bdayCount = 0;
    users.forEach(u => {
      if (!u.dateOfBirth) return;
      const s = String(u.dateOfBirth).trim();
      const m = s.match(/^(\d{4})\D(\d{2})\D(\d{2})/);
      let month = 0;
      if (m) month = Number(m[2]);
      else {
        const d = new Date(s);
        if (!isNaN(d.getTime())) month = d.getMonth() + 1;
      }
      if (month === currentMonthNum + 1) bdayCount++;
    });

    // 2. Company Holidays in this month
    let holidayCount = 0;
    visibleHolidays.forEach(h => {
      if (!h.date) return;
      if (String(h.name || '').toLowerCase() === 'sunday') return;
      const d = new Date(h.date + 'T00:00:00');
      if (!isNaN(d.getTime()) && d.getMonth() === currentMonthNum && d.getFullYear() === currentYear) {
        holidayCount++;
      }
    });

    // 3. Approved & Pending Leaves in this month
    const relevantLeaves = isAdmin ? leaveRequests : myLeaves;
    let approvedCount = 0;
    let pendingCount = 0;
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);

    relevantLeaves.forEach(l => {
      const s = new Date(l.startDate + 'T00:00:00');
      const e = new Date(l.endDate + 'T00:00:00');
      if (isNaN(s.getTime()) || isNaN(e.getTime())) return;
      if (s <= monthEnd && e >= monthStart) {
        if (l.status === 'approved') approvedCount++;
        else if (l.status === 'pending') pendingCount++;
      }
    });

    return {
      birthdays: bdayCount,
      holidays: holidayCount,
      approvedLeaves: approvedCount,
      pendingLeaves: pendingCount,
    };
  }, [monthDate, users, visibleHolidays, leaveRequests, myLeaves, isAdmin]);

  // Chronological upcoming events for active month
  const upcomingEvents = useMemo(() => {
    const list = [];
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);

    let cur = new Date(start);
    while (cur <= end) {
      const iso = format(cur, 'yyyy-MM-dd');
      
      // Birthday
      const bdays = birthdayDays.get(iso) || [];
      if (bdays.length > 0) {
        list.push({
          id: `bday-${iso}`,
          date: new Date(cur),
          iso,
          title: bdays.map(b => b.name).join(', '),
          type: 'birthday',
          typeLabel: 'Birthday',
          icon: '🎂',
          badgeClass: 'bg-[#FEF9C3] text-[#854D0E] dark:bg-[#3D310C] dark:text-[#FFD700] border-[#D4AF37]/50 dark:border-[#FFD700]/40',
          dotClass: 'bg-[#FFD700]',
        });
      }

      // Holiday
      const holidayName = holidayMap.get(iso);
      if (holidayName && holidayName.toLowerCase() !== 'sunday') {
        list.push({
          id: `holiday-${iso}`,
          date: new Date(cur),
          iso,
          title: holidayName,
          type: 'holiday',
          typeLabel: 'Holiday',
          icon: '🏖️',
          badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25',
          dotClass: 'bg-blue-500',
        });
      }

      // Approved Leave
      const appLeaves = approvedLeaveDays.get(iso) || [];
      if (appLeaves.length > 0) {
        list.push({
          id: `leave-${iso}`,
          date: new Date(cur),
          iso,
          title: `Leave: ${appLeaves.map(l => l.name).join(', ')}`,
          type: 'approved',
          typeLabel: 'Approved Leave',
          icon: '🌴',
          badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
          dotClass: 'bg-emerald-500',
        });
      }

      // Pending Leave
      const pendLeaves = pendingLeaveDays.get(iso) || [];
      if (pendLeaves.length > 0) {
        list.push({
          id: `pending-${iso}`,
          date: new Date(cur),
          iso,
          title: `Pending: ${pendLeaves.map(l => l.name).join(', ')}`,
          type: 'pending',
          typeLabel: 'Pending Leave',
          icon: '⏳',
          badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
          dotClass: 'bg-amber-500',
        });
      }

      cur = addDays(cur, 1);
    }

    return list.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [monthDate, birthdayDays, holidayMap, approvedLeaveDays, pendingLeaveDays]);

  const filteredUpcomingEvents = useMemo(() => {
    if (agendaFilter === 'all') return upcomingEvents;
    if (agendaFilter === 'leave') return upcomingEvents.filter(e => e.type === 'approved' || e.type === 'pending');
    return upcomingEvents.filter(e => e.type === agendaFilter);
  }, [upcomingEvents, agendaFilter]);

  // Reset pagination on filter or month change
  useEffect(() => {
    setAgendaPage(1);
  }, [agendaFilter, monthDate]);

  const totalAgendaPages = Math.max(1, Math.ceil(filteredUpcomingEvents.length / AGENDA_PAGE_SIZE));
  const paginatedUpcomingEvents = useMemo(() => {
    const start = (agendaPage - 1) * AGENDA_PAGE_SIZE;
    return filteredUpcomingEvents.slice(start, start + AGENDA_PAGE_SIZE);
  }, [filteredUpcomingEvents, agendaPage]);

  const totalLeavePages = Math.max(1, Math.ceil(leaveRequests.length / LEAVE_PAGE_SIZE));
  const paginatedLeaveRequests = useMemo(() => {
    const start = (leavePage - 1) * LEAVE_PAGE_SIZE;
    return leaveRequests.slice(start, start + LEAVE_PAGE_SIZE);
  }, [leaveRequests, leavePage]);

  const totalMyLeavePages = Math.max(1, Math.ceil(myLeaves.length / LEAVE_PAGE_SIZE));
  const paginatedMyLeaves = useMemo(() => {
    const start = (myLeavePage - 1) * LEAVE_PAGE_SIZE;
    return myLeaves.slice(start, start + LEAVE_PAGE_SIZE);
  }, [myLeaves, myLeavePage]);

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

    if (!canApplyLeave) {
      toast.error('Leave applications are only available for employees in the User Portal');
      return;
    }

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
      const uid = (typeof userProfile?.userId === 'string' && userProfile?.userId)
        ? userProfile.userId
        : (userProfile?.id?.toText ? userProfile.id.toText() : (userProfile?.id ? String(userProfile.id) : (userProfile?.username || localStorage.getItem('current_user') || '')));

      if (!uid) {
        toast.error('User identification failed. Please log in again.');
        return;
      }

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
    <div className="space-y-4 sm:space-y-5">
      {/* 1. Page Header with Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#D5E5D7] dark:border-[#2A3D48]">
        {portalType !== 'superadmin' ? (
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#15966A]/10 text-[#15966A] dark:text-[#14B8A6] flex items-center justify-center shrink-0 shadow-2xs">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#183B2B] dark:text-[#E8F0F4] leading-snug">
                Office Calendar
              </h1>
              <p className="text-xs sm:text-sm text-[#687C70] dark:text-[#A6B5C0] mt-0.5 font-normal">
                Your team's schedule, celebrations, and time off.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 shadow-2xs">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground leading-snug">
                Master Organization Calendar
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 font-normal">
                Organization-wide holidays, tenant staff leaves, and celebrations across all companies.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {canManageHolidays && (
            <Button
              size="sm"
              onClick={() => handleOpenHolidayDialog()}
              className="h-8 px-3 text-xs font-semibold bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Holiday
            </Button>
          )}

          {/* Global Navigation Controls */}
          <div className="flex items-center justify-between sm:justify-start gap-1.5 w-full sm:w-auto bg-white dark:bg-[#15232D] p-1 rounded-xl border border-[#DFE8EC] dark:border-[#2A3D48] shadow-xs">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMonthDate(new Date())}
              className="h-7 sm:h-8 px-2 sm:px-2.5 text-xs font-semibold border-[#DFE8EC] dark:border-[#2A3D48] text-[#172B3A] dark:text-[#E8F0F4] hover:text-[#0D9488] dark:hover:text-[#14B8A6] hover:bg-[#F4F8FA] dark:hover:bg-[#1D303B] rounded-lg shadow-xs"
              title="Jump to current date"
            >
              Today
            </Button>
            <div className="h-4 w-px bg-[#DFE8EC] dark:bg-[#2A3D48]" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 sm:h-8 px-1.5 sm:px-2 rounded-lg text-[#172B3A] dark:text-[#E8F0F4] hover:text-[#0D9488] dark:hover:text-[#14B8A6] hover:bg-[#F4F8FA] dark:hover:bg-[#1D303B]"
              onClick={() => setMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs sm:text-sm font-medium text-[#172B3A] dark:text-[#E8F0F4] px-1.5 min-w-[120px] sm:min-w-[130px] text-center">
              {format(monthDate, 'MMMM yyyy')}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 sm:h-8 px-1.5 sm:px-2 rounded-lg text-[#172B3A] dark:text-[#E8F0F4] hover:text-[#0D9488] dark:hover:text-[#14B8A6] hover:bg-[#F4F8FA] dark:hover:bg-[#1D303B]"
              onClick={() => setMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Compact Event Summary Cards (Real Month Data) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-2.5 sm:p-3 shadow-xs flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-[11px] sm:text-xs font-medium text-[#64748B] dark:text-[#A6B5C0]">Birthdays</p>
            <p className="text-xl sm:text-2xl font-semibold tracking-normal text-[#D4AF37] dark:text-[#FFD700]">{monthlyMetrics.birthdays}</p>
          </div>
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#FEF9C3] dark:bg-[#D4AF37]/20 text-[#D4AF37] dark:text-[#FFD700] flex items-center justify-center">
            <Cake className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-2.5 sm:p-3 shadow-xs flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-[11px] sm:text-xs font-medium text-[#64748B] dark:text-[#A6B5C0]">Holidays</p>
            <p className="text-xl sm:text-2xl font-semibold tracking-normal text-blue-600 dark:text-blue-400">{monthlyMetrics.holidays}</p>
          </div>
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Palmtree className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-2.5 sm:p-3 shadow-xs flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-[11px] sm:text-xs font-medium text-[#64748B] dark:text-[#A6B5C0]">Approved Leaves</p>
            <p className="text-xl sm:text-2xl font-semibold tracking-normal text-emerald-600 dark:text-emerald-400">{monthlyMetrics.approvedLeaves}</p>
          </div>
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-2.5 sm:p-3 shadow-xs flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-[11px] sm:text-xs font-medium text-[#64748B] dark:text-[#A6B5C0]">Pending Leaves</p>
            <p className="text-xl sm:text-2xl font-semibold tracking-normal text-amber-600 dark:text-amber-400">{monthlyMetrics.pendingLeaves}</p>
          </div>
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 3. Two-Pane Calendar Dashboard Composition */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,69fr)_minmax(0,31fr)] gap-4 lg:gap-5 items-stretch">
        {/* Left: Centerpiece Monthly Calendar Card (~69% width) */}
        <div className="w-full flex flex-col h-full">
          <Card className="border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] text-foreground rounded-2xl shadow-sm overflow-hidden w-full flex-1 flex flex-col">
          {/* Calendar Header with Legend */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 sm:p-4 border-b border-[#DFE8EC] dark:border-[#2A3D48] bg-[#F4F8FA]/60 dark:bg-[#1D303B]/50 shrink-0">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-[#0D9488] dark:text-[#14B8A6]" />
              <span className="text-sm font-medium text-[#172B3A] dark:text-[#E8F0F4]">Monthly Schedule</span>
            </div>

            {/* Event Legend */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#FFFBEB] text-[#854D0E] border border-[#D4AF37]/60 dark:bg-[#78350F]/25 dark:text-[#FFD700] dark:border-[#D4AF37]/70 font-semibold text-[11px] shadow-2xs">
                <span>🎂</span>
                <span>Birthday</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#DBEAFE] text-[#1E40AF] border border-[#2563EB]/30 dark:bg-blue-950/70 dark:text-blue-200 dark:border-blue-500/60 font-medium text-[11px]">
                <span>🏖️</span>
                <span>Holiday</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#D1FAE5] text-[#065F46] border border-[#059669]/30 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-500/60 font-medium text-[11px]">
                <span>🌴</span>
                <span>Leave</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#FEF3C7] text-[#92400E] border border-[#D97706]/30 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-500/60 font-medium text-[11px]">
                <span>⏳</span>
                <span>Pending</span>
              </div>
            </div>
          </div>

          <CardContent className="p-2.5 sm:p-3.5 space-y-2 sm:space-y-2.5 flex-1 flex flex-col justify-between">
            {/* Month Matrix Grid with Synchronized Weekday Header */}
            <div
              className="overflow-x-auto w-full flex-1 flex flex-col justify-between"
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
              <div className="min-w-[320px] flex-1 flex flex-col justify-between space-y-2">
                {/* Weekday Header - Subtle Weekend Distinction */}
                <div className="grid grid-cols-7 gap-1 sm:gap-1.5 md:gap-2 text-[11px] sm:text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0] w-full py-0.5 text-center shrink-0">
                  <div className="text-rose-600/80 dark:text-rose-400/80 font-bold">Sun</div>
                  <div>Mon</div>
                  <div>Tue</div>
                  <div>Wed</div>
                  <div>Thu</div>
                  <div>Fri</div>
                  <div className="text-rose-600/80 dark:text-rose-400/80 font-bold">Sat</div>
                </div>

                <div className="grid grid-cols-7 gap-1 sm:gap-1.5 md:gap-2 w-full flex-1">
                {monthMatrix.flat().map((cell, idx) => {
                  const isToday = format(cell.date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                  const hasBirthday = Boolean(cell.birthdayLabel);
                  const hasHoliday = Boolean(cell.isHoliday);
                  const hasApprovedLeave = Boolean(cell.leaveName);
                  const hasPendingLeave = Boolean(cell.pendingLeaveName);
                  const dayOfWeek = cell.date.getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                  // Build event badges list
                  const events = [];
                  if (hasBirthday) {
                    events.push({
                      type: 'birthday',
                      label: `B'Day: ${cell.birthdayLabel}`,
                      title: `Birthday: ${cell.birthdayLabel}`,
                      icon: '🎂',
                      className: 'bg-[#FEF9C3] text-[#854D0E] border-[#D4AF37]/60 dark:bg-[#3D310C]/90 dark:text-[#FFD700] dark:border-[#FFD700]/50 shadow-2xs'
                    });
                  }
                  if (hasHoliday) {
                    events.push({
                      type: 'holiday',
                      label: cell.holidayName || 'Holiday',
                      title: cell.holidayName || 'Holiday',
                      icon: '🏖️',
                      className: 'bg-[#DBEAFE] text-[#1E40AF] border-[#2563EB]/30 dark:bg-blue-950/80 dark:text-blue-200 dark:border-blue-500/60'
                    });
                  }
                  if (hasApprovedLeave) {
                    events.push({
                      type: 'approved',
                      label: `Leave: ${cell.leaveName}`,
                      title: `Approved Leave: ${cell.leaveName}`,
                      icon: '🌴',
                      className: 'bg-[#D1FAE5] text-[#065F46] border-[#059669]/30 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-500/60'
                    });
                  }
                  if (hasPendingLeave) {
                    events.push({
                      type: 'pending',
                      label: `Pending: ${cell.pendingLeaveName}`,
                      title: `Pending Leave: ${cell.pendingLeaveName}`,
                      icon: '⏳',
                      className: 'bg-[#FEF3C7] text-[#92400E] border-[#D97706]/30 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-500/60'
                    });
                  }

                  const maxEventsShow = isMobile ? 1 : 2;
                  const visibleEvents = events.slice(0, maxEventsShow);
                  const overflowCount = events.length - maxEventsShow;

                  return (
                    <div
                      key={idx}
                      onClick={() => handleCellClick(cell)}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "rounded-xl p-1 sm:p-1.5 lg:p-2 min-h-[56px] sm:min-h-[64px] lg:min-h-[70px] xl:min-h-[74px] flex flex-col justify-between overflow-hidden relative cursor-pointer border transition-all text-left group",
                        !cell.inMonth && "opacity-30 bg-muted/10 border-[#DFE8EC]/40 dark:border-[#2A3D48]/40",
                        cell.inMonth && "bg-white dark:bg-[#15232D] border-[#DFE8EC] dark:border-[#2A3D48] hover:border-[#0D9488]/50 hover:shadow-xs",
                        isWeekend && cell.inMonth && !hasBirthday && "bg-[#F4F8FA]/50 dark:bg-[#1D303B]/30",
                        hasBirthday && cell.inMonth && "border-[#D4AF37] dark:border-[#FFD700]/70 bg-gradient-to-b from-[#FFFDF0] to-[#FFF9DB]/80 dark:from-[#242010]/90 dark:to-[#181508] shadow-[0_0_12px_rgba(255,215,0,0.18)] dark:shadow-[0_0_16px_rgba(255,215,0,0.14)]",
                        hasHoliday && !hasBirthday && cell.inMonth && "border-blue-300 dark:border-blue-500/50 bg-blue-50/20 dark:bg-blue-950/15",
                        hasApprovedLeave && !hasBirthday && !hasHoliday && cell.inMonth && "border-emerald-300 dark:border-emerald-500/50 bg-emerald-50/20 dark:bg-emerald-950/15",
                        hasPendingLeave && !hasBirthday && !hasHoliday && !hasApprovedLeave && cell.inMonth && "border-amber-300 dark:border-amber-500/50 bg-amber-50/20 dark:bg-amber-950/15",
                        isToday && "ring-2 ring-[#0D9488] ring-offset-1 ring-offset-background"
                      )}
                    >
                      <div className="w-full flex items-center justify-between">
                        <span className={cn(
                          "text-[11px] sm:text-xs font-semibold inline-flex items-center justify-center transition-all",
                          isToday 
                            ? "h-5 w-5 sm:h-6 sm:w-6 rounded-md sm:rounded-lg bg-[#0D9488] text-white font-bold shadow-xs" 
                            : hasBirthday && cell.inMonth
                            ? "h-5 w-5 sm:h-6 sm:w-6 rounded-md sm:rounded-lg bg-[#FEF9C3] dark:bg-[#78350F]/40 text-[#854D0E] dark:text-[#FFD700] font-black border border-[#D4AF37]/50 shadow-2xs group-hover:scale-105"
                            : cell.inMonth 
                            ? (isWeekend ? "text-[#64748B] dark:text-[#A6B5C0]" : "text-[#172B3A] dark:text-[#E8F0F4] group-hover:scale-105") 
                            : "text-muted-foreground/40"
                        )}>
                          {cell.date.getDate()}
                        </span>
                        {events.length > 0 && (
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            hasBirthday && cell.inMonth 
                              ? "bg-[#D4AF37] dark:bg-[#FFD700] shadow-[0_0_6px_#FFD700]" 
                              : "bg-[#0D9488]"
                          )} />
                        )}
                      </div>

                      <div className="mt-0.5 sm:mt-1 w-full flex flex-col gap-0.5 sm:gap-1 items-start">
                        {visibleEvents.map((evt, eIdx) => (
                          <div
                            key={eIdx}
                            className={cn(
                              "flex items-center gap-1 px-1 sm:px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold border truncate w-full shadow-2xs leading-tight",
                              evt.className
                            )}
                            title={evt.title}
                          >
                            <span className="shrink-0 text-[9px] sm:text-[10px]">{evt.icon}</span>
                            <span className="truncate">{evt.label}</span>
                          </div>
                        ))}
                        {overflowCount > 0 && (
                          <span className="text-[9px] font-medium text-[#0D9488] dark:text-[#14B8A6] px-1 bg-[#0D9488]/10 rounded leading-tight">
                            +{overflowCount} more
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
          </CardContent>
        </Card>
        </div>
        {/* Right: Agenda & Leave Requests Column (~31% width, matches calendar height on desktop) */}
        <div className="flex flex-col gap-4 lg:gap-5 w-full lg:h-full">
          {/* Right Top: Upcoming Events Agenda Side Panel */}
          <Card className="border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] text-foreground rounded-2xl shadow-sm p-3.5 sm:p-4 flex flex-col lg:flex-1 lg:min-h-0 overflow-hidden">
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#DFE8EC] dark:border-[#2A3D48] shrink-0">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#0D9488] dark:text-[#14B8A6]" />
                <h3 className="text-sm sm:text-base font-medium text-[#172B3A] dark:text-[#E8F0F4]">Monthly Agenda</h3>
              </div>
              <Badge variant="outline" className="text-[10px] sm:text-[11px] px-2 font-medium">
                {filteredUpcomingEvents.length} event{filteredUpcomingEvents.length === 1 ? '' : 's'}
              </Badge>
            </div>

            {/* Quick Type Filter Pills */}
            <div className="flex items-center gap-1.5 pb-2.5 overflow-x-auto shrink-0">
              {['all', 'holiday', 'birthday', 'leave'].map((type) => (
                <button
                  key={type}
                  onClick={() => setAgendaFilter(type)}
                  className={cn(
                    "px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[11px] font-medium transition-all capitalize shrink-0",
                    agendaFilter === type 
                      ? "bg-[#0D9488] text-white shadow-xs" 
                      : "bg-[#F4F8FA] dark:bg-[#1D303B] text-[#64748B] dark:text-[#A6B5C0] hover:text-foreground"
                  )}
                >
                  {type === 'all' ? 'All' : type === 'holiday' ? 'Holidays' : type === 'birthday' ? 'Birthdays' : 'Leaves'}
                </button>
              ))}
            </div>

            {/* Event List with 4-Item Pagination & Scroll */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {filteredUpcomingEvents.length === 0 ? (
                <div className="h-full min-h-[120px] flex flex-col items-center justify-center py-6 text-center text-xs text-[#64748B] dark:text-[#A6B5C0] space-y-1">
                  <p className="font-semibold text-foreground">No events found</p>
                  <p>No celebrations or leaves match this filter in {format(monthDate, 'MMMM')}.</p>
                </div>
              ) : (
                paginatedUpcomingEvents.map((evt) => (
                  <div
                    key={evt.id}
                    onClick={() => {
                      const matchingCell = monthMatrix.flat().find(c => c.iso === evt.iso);
                      if (matchingCell) handleCellClick(matchingCell);
                    }}
                    className="p-2 sm:p-2.5 rounded-xl border border-[#DFE8EC] dark:border-[#2A3D48] hover:border-[#0D9488]/50 bg-[#F4F8FA]/60 dark:bg-[#1D303B]/60 transition-all cursor-pointer flex items-center justify-between gap-2.5 group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm shrink-0">{evt.icon}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#172B3A] dark:text-[#E8F0F4] group-hover:text-[#0D9488] dark:group-hover:text-[#14B8A6] truncate transition-colors">
                          {evt.title}
                        </p>
                        <p className="text-[10px] text-[#64748B] dark:text-[#A6B5C0]">
                          {format(evt.date, 'EEE, MMM d')}
                        </p>
                      </div>
                    </div>
                    <Badge className={cn("text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded border shrink-0", evt.badgeClass)}>
                      {evt.typeLabel}
                    </Badge>
                  </div>
                ))
              )}
            </div>

            {/* Monthly Agenda Pagination Controls */}
            {filteredUpcomingEvents.length > 0 && (
              <div className="flex items-center justify-between pt-2 mt-auto border-t border-[#DFE8EC] dark:border-[#2A3D48] text-xs text-[#64748B] dark:text-[#A6B5C0] shrink-0">
                <span className="text-[11px]">
                  {Math.min((agendaPage - 1) * AGENDA_PAGE_SIZE + 1, filteredUpcomingEvents.length)} - {Math.min(agendaPage * AGENDA_PAGE_SIZE, filteredUpcomingEvents.length)} of {filteredUpcomingEvents.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAgendaPage(p => Math.max(1, p - 1))}
                    disabled={agendaPage <= 1}
                    className="h-6 w-6 p-0 rounded border-[#DFE8EC] dark:border-[#2A3D48]"
                    title="Previous page"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-[11px] px-1 font-medium text-foreground">
                    {agendaPage}/{totalAgendaPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAgendaPage(p => Math.min(totalAgendaPages, p + 1))}
                    disabled={agendaPage >= totalAgendaPages}
                    className="h-6 w-6 p-0 rounded border-[#DFE8EC] dark:border-[#2A3D48]"
                    title="Next page"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Right Bottom: Leave Requests / Management Card */}
          <Card className="border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] text-foreground rounded-2xl shadow-sm p-3.5 sm:p-4 flex flex-col lg:flex-1 lg:min-h-0 overflow-hidden">
            {/* Header: Title, Description, and Actions */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 pb-2.5 mb-2.5 border-b border-[#DFE8EC] dark:border-[#2A3D48] shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Palmtree className="w-4 h-4 text-[#0D9488] dark:text-[#14B8A6] shrink-0" />
                  <h3 className="text-base font-medium text-[#172B3A] dark:text-[#E8F0F4] truncate">
                    Leave Requests
                  </h3>
                </div>
                <p className="text-[11px] text-[#64748B] dark:text-[#A6B5C0] mt-0.5 line-clamp-1">
                  {canApplyLeave 
                    ? "Review your submitted applications or submit a new leave request." 
                    : "Review and manage team leave applications and official company holidays."}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
                {canManageHolidays && (
                  <Dialog open={isHolidayDialogOpen} onOpenChange={setIsHolidayDialogOpen}>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenHolidayDialog()}
                        className="border-[#DFE8EC] dark:border-[#2A3D48] text-xs h-8 px-2.5 font-medium rounded-xl hover:text-[#0D9488] dark:hover:text-[#14B8A6]"
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Holiday
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D]">
                      <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-[#172B3A] dark:text-[#E8F0F4]">
                          {editingHoliday ? 'Edit Holiday' : 'Add Holiday'}
                        </DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleHolidaySubmit} className="space-y-4 pt-2">
                        <div className="space-y-2">
                          <Label htmlFor="name" className="text-xs font-semibold">Holiday Name *</Label>
                          <Input
                            id="name"
                            value={holidayForm.name}
                            onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                            placeholder="e.g., New Year's Day"
                            className="bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] text-xs sm:text-sm"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="date" className="text-xs font-semibold">Date *</Label>
                          <Input
                            id="date"
                            type="date"
                            value={holidayForm.date}
                            onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                            className="bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] text-xs sm:text-sm"
                            required
                          />
                        </div>
                        <Button type="submit" className="w-full bg-[#0D9488] hover:bg-[#0F766E] text-white" disabled={addHoliday.isPending || updateHoliday.isPending}>
                          {(addHoliday.isPending || updateHoliday.isPending) ? 'Saving...' : 'Save Holiday'}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}

                {canApplyLeave && (
                  <Dialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
                    <DialogTrigger asChild>
                      <Button 
                        size="sm"
                        className="bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs h-8 px-2.5 font-medium shadow-xs rounded-xl flex items-center gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Apply Leave</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D]">
                      <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-[#172B3A] dark:text-[#E8F0F4]">Apply for Leave</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleLeaveSubmit} className="space-y-4 pt-2">
                        <div className="space-y-2">
                          <Label htmlFor="type" className="text-xs font-semibold">Leave Type *</Label>
                          <select
                            id="type"
                            className="h-10 w-full border border-[#DFE8EC] dark:border-[#2A3D48] rounded-lg bg-[#F4F8FA] dark:bg-[#1D303B] px-3 text-xs sm:text-sm text-[#172B3A] dark:text-[#E8F0F4]"
                            value={leaveForm.type}
                            onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}
                          >
                            <option value="casual">Casual Leave</option>
                            <option value="sick">Sick Leave</option>
                            <option value="earned">Earned Leave</option>
                            <option value="unpaid">Unpaid Leave</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="startDate" className="text-xs font-semibold">Start Date *</Label>
                          <Input
                            id="startDate"
                            type="date"
                            value={leaveForm.startDate}
                            onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                            className="bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] text-xs sm:text-sm"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="endDate" className="text-xs font-semibold">End Date *</Label>
                          <Input
                            id="endDate"
                            type="date"
                            value={leaveForm.endDate}
                            onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                            className="bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] text-xs sm:text-sm"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reason" className="text-xs font-semibold">Reason</Label>
                          <Textarea
                            id="reason"
                            value={leaveForm.reason}
                            onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                            placeholder="Reason for leave request..."
                            className="bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] text-xs sm:text-sm"
                            rows={3}
                          />
                        </div>
                        <Button type="submit" className="w-full bg-[#0D9488] hover:bg-[#0F766E] text-white" disabled={applyLeave.isPending}>
                          {applyLeave.isPending ? 'Submitting...' : 'Submit Request'}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>

            {/* Content: Admin Tabs vs Staff Direct View */}
            {isAdmin ? (
              <Tabs defaultValue="leaves" className="w-full lg:flex-1 lg:min-h-0 flex flex-col space-y-2.5">
                <TabsList className="bg-[#F4F8FA] dark:bg-[#1D303B] border border-[#DFE8EC] dark:border-[#2A3D48] p-1 rounded-xl h-auto flex w-full shrink-0">
                  <TabsTrigger 
                    value="leaves" 
                    className="flex-1 text-xs font-medium px-2 py-1.5 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-[#15232D] data-[state=active]:text-[#0D9488] dark:data-[state=active]:text-[#14B8A6] data-[state=active]:shadow-xs"
                  >
                    Leaves ({leaveRequests.length})
                  </TabsTrigger>
                  <TabsTrigger 
                    value="holidays" 
                    className="flex-1 text-xs font-medium px-2 py-1.5 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-[#15232D] data-[state=active]:text-[#0D9488] dark:data-[state=active]:text-[#14B8A6] data-[state=active]:shadow-xs"
                  >
                    Holidays ({holidayList.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="leaves" className="lg:flex-1 lg:min-h-0 flex flex-col mt-2.5 data-[state=inactive]:hidden">
                  {leavesLoading ? (
                    <div className="flex-1 flex items-center justify-center py-6 text-muted-foreground text-xs">Loading leave requests...</div>
                  ) : leaveRequests.length === 0 ? (
                    <div className="flex-1 min-h-[140px] flex flex-col items-center justify-center bg-[#F4F8FA]/60 dark:bg-[#1D303B]/50 border border-dashed border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-4 text-center space-y-2">
                      <div className="w-10 h-10 mx-auto rounded-full bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6] flex items-center justify-center">
                        <CalendarDays className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-[#172B3A] dark:text-[#E8F0F4]">No leave requests found</h4>
                        <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] leading-relaxed">
                          No employee has submitted a leave request yet.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                      {paginatedLeaveRequests.map((leave) => {
                        const staff = users.find(u => toIdText(u.userId || u.id) === toIdText(leave.userId));
                        const requesterName = formatUserLabel(staff) || (leave.displayId || leave.userId);
                        const daysCount = daysBetweenInclusive(leave.startDate, leave.endDate);

                        return (
                          <div 
                            key={leave.id} 
                            className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] hover:border-[#0D9488]/40 dark:hover:border-[#14B8A6]/40 rounded-xl p-3 shadow-xs transition-all space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-[#F4F8FA] dark:bg-[#1D303B] text-[#172B3A] dark:text-[#E8F0F4] border border-[#DFE8EC] dark:border-[#2A3D48]">
                                  {leave.type || 'Leave'}
                                </span>
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                                  leave.status === 'approved' 
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25' 
                                    : leave.status === 'rejected' 
                                    ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25' 
                                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25'
                                }`}>
                                  {leave.status === 'approved' ? 'Approved' : leave.status === 'rejected' ? 'Rejected' : 'Pending Approval'}
                                </span>
                                <span className="text-[11px] font-medium text-[#64748B] dark:text-[#A6B5C0]">
                                  ({daysCount} {daysCount === 1 ? 'day' : 'days'})
                                </span>
                              </div>

                              {leave.status === 'pending' && (
                                <div className="flex items-center gap-1">
                                  <Button 
                                    size="sm" 
                                    className="h-6 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] rounded-md shadow-xs flex items-center gap-1"
                                    onClick={() => updateLeaveReq.mutateAsync({ id: leave.id, status: 'approved' })}
                                    disabled={updateLeaveReq.isPending}
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Approve</span>
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-6 px-2 border-rose-300 dark:border-rose-800 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] rounded-md flex items-center gap-1"
                                    onClick={() => updateLeaveReq.mutateAsync({ id: leave.id, status: 'rejected' })}
                                    disabled={updateLeaveReq.isPending}
                                  >
                                    <X className="w-3 h-3" />
                                    <span>Reject</span>
                                  </Button>
                                </div>
                              )}
                            </div>

                            <div className="space-y-1 pt-0.5 text-xs">
                              <div className="flex items-center gap-1.5 text-xs text-[#64748B] dark:text-[#A6B5C0]">
                                <CalendarDays className="w-3.5 h-3.5 text-[#0D9488] dark:text-[#14B8A6]" />
                                <span className="font-semibold text-[#172B3A] dark:text-[#E8F0F4] text-xs">
                                  {formatFriendlyDate(leave.startDate)} — {formatFriendlyDate(leave.endDate)}
                                </span>
                              </div>

                              <div className="space-y-0.5">
                                <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] line-clamp-2">
                                  {leave.reason || 'No additional notes provided.'}
                                </p>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-[#DFE8EC]/70 dark:border-[#2A3D48]/70 flex items-center justify-between text-[11px] text-[#64748B] dark:text-[#A6B5C0]">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="w-4 h-4 rounded-full bg-[#0D9488]/15 text-[#0D9488] dark:text-[#14B8A6] flex items-center justify-center font-bold text-[9px] shrink-0">
                                  {requesterName.slice(0, 2).toUpperCase()}
                                </span>
                                <span className="truncate">
                                  {requesterName}
                                </span>
                              </div>
                              {leave.createdAt && (
                                <span className="text-[10px] shrink-0">
                                  {formatDateTime(leave.createdAt)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Admin Leave Requests Pagination Controls */}
                    {leaveRequests.length > 0 && (
                      <div className="flex items-center justify-between pt-2 mt-auto border-t border-[#DFE8EC] dark:border-[#2A3D48] text-xs text-[#64748B] dark:text-[#A6B5C0] shrink-0">
                        <span className="text-[11px]">
                          {Math.min((leavePage - 1) * LEAVE_PAGE_SIZE + 1, leaveRequests.length)} - {Math.min(leavePage * LEAVE_PAGE_SIZE, leaveRequests.length)} of {leaveRequests.length}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLeavePage(p => Math.max(1, p - 1))}
                            disabled={leavePage <= 1}
                            className="h-6 w-6 p-0 rounded border-[#DFE8EC] dark:border-[#2A3D48]"
                            title="Previous page"
                          >
                            <ChevronLeft className="h-3 w-3" />
                          </Button>
                          <span className="text-[11px] px-1 font-medium text-foreground">
                            {leavePage}/{totalLeavePages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLeavePage(p => Math.min(totalLeavePages, p + 1))}
                            disabled={leavePage >= totalLeavePages}
                            className="h-6 w-6 p-0 rounded border-[#DFE8EC] dark:border-[#2A3D48]"
                            title="Next page"
                          >
                            <ChevronRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

                <TabsContent value="holidays" className="lg:flex-1 lg:min-h-0 flex flex-col mt-2.5 data-[state=inactive]:hidden">
                  <div className="space-y-2.5 max-h-[300px] lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto pr-1">
                    {holidaysLoading ? (
                      <div className="flex-1 flex items-center justify-center py-6 text-muted-foreground text-xs">Loading holidays...</div>
                    ) : holidayList.length === 0 ? (
                      <div className="flex-1 min-h-[140px] flex flex-col items-center justify-center bg-[#F4F8FA]/60 dark:bg-[#1D303B]/50 border border-dashed border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-4 text-center space-y-2">
                        <p className="text-sm font-semibold text-[#172B3A] dark:text-[#E8F0F4]">No holidays registered</p>
                        <p className="text-xs text-[#64748B] dark:text-[#A6B5C0]">Click "Holiday" above to add official company holidays.</p>
                      </div>
                    ) : (
                      holidayList.map((holiday) => (
                        <div key={holiday.id} className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-3 shadow-xs flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-base shrink-0">🏖️</span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#172B3A] dark:text-[#E8F0F4] truncate">{holiday.name}</p>
                              <p className="text-[11px] text-[#64748B] dark:text-[#A6B5C0]">
                                {new Date(holiday.date).toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </p>
                            </div>
                          </div>
                          {isAdmin && (
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-[#64748B] hover:text-[#0D9488] dark:hover:text-[#14B8A6] rounded-lg"
                                onClick={() => handleOpenHolidayDialog(holiday)}
                                title="Edit Holiday"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-[#64748B] hover:text-rose-600 rounded-lg"
                                onClick={() => handleDeleteHoliday(holiday.id)}
                                title="Delete Holiday"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="w-full lg:flex-1 lg:min-h-0 flex flex-col space-y-2.5">
                {myLeaves.length === 0 ? (
                  <div className="flex-1 min-h-[140px] flex flex-col items-center justify-center bg-[#F4F8FA]/60 dark:bg-[#1D303B]/50 border border-dashed border-[#DFE8EC] dark:border-[#2A3D48] rounded-xl p-4 text-center space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6] flex items-center justify-center">
                      <CalendarDays className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-[#172B3A] dark:text-[#E8F0F4]">No leave requests submitted</h4>
                      <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] leading-relaxed">
                        You have not submitted any leave requests yet. Click "Apply Leave" above to request time off.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                    {paginatedMyLeaves.map((leave) => {
                      const staff = users.find(u => toIdText(u.userId || u.id) === toIdText(leave.userId));
                      const requesterName = formatUserLabel(staff) || (leave.displayId || leave.userId);
                      const daysCount = daysBetweenInclusive(leave.startDate, leave.endDate);

                      return (
                        <div 
                          key={leave.id} 
                          className="bg-white dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48] hover:border-[#0D9488]/40 dark:hover:border-[#14B8A6]/40 rounded-xl p-3 shadow-xs transition-all space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-[#F4F8FA] dark:bg-[#1D303B] text-[#172B3A] dark:text-[#E8F0F4] border border-[#DFE8EC] dark:border-[#2A3D48]">
                                {leave.type || 'Leave'}
                              </span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                                leave.status === 'approved' 
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25' 
                                  : leave.status === 'rejected' 
                                  ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25' 
                                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25'
                              }`}>
                                {leave.status === 'approved' ? 'Approved' : leave.status === 'rejected' ? 'Rejected' : 'Pending Approval'}
                              </span>
                              <span className="text-[11px] font-medium text-[#64748B] dark:text-[#A6B5C0]">
                                ({daysCount} {daysCount === 1 ? 'day' : 'days'})
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1 pt-0.5 text-xs">
                            <div className="flex items-center gap-1.5 text-xs text-[#64748B] dark:text-[#A6B5C0]">
                              <CalendarDays className="w-3.5 h-3.5 text-[#0D9488] dark:text-[#14B8A6]" />
                              <span className="font-semibold text-[#172B3A] dark:text-[#E8F0F4] text-xs">
                                {formatFriendlyDate(leave.startDate)} — {formatFriendlyDate(leave.endDate)}
                              </span>
                            </div>

                            <div className="space-y-0.5">
                              <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] line-clamp-2">
                                {leave.reason || 'No additional notes provided.'}
                              </p>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-[#DFE8EC]/70 dark:border-[#2A3D48]/70 flex items-center justify-between text-[11px] text-[#64748B] dark:text-[#A6B5C0]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-4 h-4 rounded-full bg-[#0D9488]/15 text-[#0D9488] dark:text-[#14B8A6] flex items-center justify-center font-bold text-[9px] shrink-0">
                                {requesterName.slice(0, 2).toUpperCase()}
                              </span>
                              <span className="truncate">
                                {requesterName}
                              </span>
                            </div>
                            {leave.createdAt && (
                              <span className="text-[10px] shrink-0">
                                {formatDateTime(leave.createdAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Staff Leaves Pagination Controls */}
                  {myLeaves.length > 0 && (
                    <div className="flex items-center justify-between pt-2 mt-auto border-t border-[#DFE8EC] dark:border-[#2A3D48] text-xs text-[#64748B] dark:text-[#A6B5C0] shrink-0">
                      <span className="text-[11px]">
                        {Math.min((myLeavePage - 1) * LEAVE_PAGE_SIZE + 1, myLeaves.length)} - {Math.min(myLeavePage * LEAVE_PAGE_SIZE, myLeaves.length)} of {myLeaves.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setMyLeavePage(p => Math.max(1, p - 1))}
                          disabled={myLeavePage <= 1}
                          className="h-6 w-6 p-0 rounded border-[#DFE8EC] dark:border-[#2A3D48]"
                          title="Previous page"
                        >
                          <ChevronLeft className="h-3 w-3" />
                        </Button>
                        <span className="text-[11px] px-1 font-medium text-foreground">
                          {myLeavePage}/{totalMyLeavePages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setMyLeavePage(p => Math.min(totalMyLeavePages, p + 1))}
                          disabled={myLeavePage >= totalMyLeavePages}
                          className="h-6 w-6 p-0 rounded border-[#DFE8EC] dark:border-[#2A3D48]"
                          title="Next page"
                        >
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            )}
          </Card>
        </div>
      </div>

{/* 4. Cell Detail Dialog */}
      <Dialog open={isCellDialogOpen} onOpenChange={setIsCellDialogOpen}>
        <DialogContent className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] text-foreground max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="pb-3 border-b border-[#DFE8EC] dark:border-[#2A3D48]">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-lg font-bold text-[#172B3A] dark:text-[#E8F0F4] flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-[#0D9488] dark:text-[#14B8A6]" />
                <span>{selectedCell ? format(selectedCell.date, 'EEEE, MMMM d, yyyy') : 'Day Breakdown'}</span>
              </DialogTitle>
            </div>
            {selectedCell && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FEF9C3] text-[#854D0E] border border-[#D4AF37]/40 dark:bg-[#2A2310] dark:text-[#FFD700]">
                  🎂 {selectedCell.birthdaysList?.length || 0} Birthday{(selectedCell.birthdaysList?.length || 0) === 1 ? '' : 's'}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#D1FAE5] text-[#065F46] border border-[#059669]/30 dark:bg-emerald-950/60 dark:text-emerald-200">
                  🌴 {selectedCell.allLeavesList?.length || 0} on Leave
                  {selectedCell.allLeavesList?.length > 0 && (
                    <span className="text-[10px] font-normal opacity-80">
                      ({selectedCell.approvedLeavesList?.length || 0} approved, {selectedCell.pendingLeavesList?.length || 0} pending)
                    </span>
                  )}
                </span>
                {selectedCell.isHoliday && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#DBEAFE] text-[#1E40AF] border border-[#2563EB]/30 dark:bg-blue-950/60 dark:text-blue-200">
                    🏖️ Holiday
                  </span>
                )}
              </div>
            )}
          </DialogHeader>

          {selectedCell && (
            <div className="space-y-4 pt-2">
              {/* Holiday Alert */}
              {selectedCell.isHoliday && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#DBEAFE]/80 text-[#1E40AF] border border-[#2563EB]/30 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-500/50">
                  <span className="text-2xl shrink-0 mt-0.5">🏖️</span>
                  <div>
                    <p className="font-bold text-sm">Official Company Holiday</p>
                    <p className="text-xs text-[#1E3A8A] dark:text-blue-300 font-medium">{selectedCell.holidayName || 'Company Holiday'}</p>
                  </div>
                </div>
              )}

              {/* Birthdays Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A6B5C0] flex items-center gap-1.5">
                    <span>🎂 Birthdays on this day</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-[#FEF9C3] text-[#854D0E] dark:bg-[#2A2310] dark:text-[#FFD700] border-[#D4AF37]/40">
                      {selectedCell.birthdaysList?.length || 0}
                    </Badge>
                  </h4>
                </div>

                {selectedCell.birthdaysList?.length > 0 ? (
                  <div className="grid gap-2">
                    {selectedCell.birthdaysList.map((b, idx) => (
                      <div
                        key={b.id || idx}
                        className="flex items-center justify-between p-3 rounded-xl border border-[#D4AF37]/40 bg-gradient-to-r from-[#FFFDF0] to-[#FFF9DB]/70 dark:from-[#242010] dark:to-[#181508] dark:border-[#D4AF37]/50 shadow-2xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {b.avatar ? (
                            <img
                              src={b.avatar}
                              alt={b.name}
                              className="w-10 h-10 rounded-full object-cover border-2 border-[#D4AF37] shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 text-white font-bold flex items-center justify-center text-sm shrink-0 border border-amber-300 shadow-2xs">
                              {(b.fullName || b.name || 'U').slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-[#172B3A] dark:text-[#E8F0F4] truncate">
                              {b.fullName || b.name}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-[#A6B5C0]">
                              <span>@{b.username || 'user'}</span>
                              {b.department && (
                                <>
                                  <span>•</span>
                                  <span className="truncate">{b.department}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#FEF3C7] text-[#92400E] border border-amber-300/60 dark:bg-amber-950/80 dark:text-amber-300">
                            🎉 Birthday
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 text-center rounded-xl bg-[#F4F8FA]/60 dark:bg-[#1D303B]/40 border border-dashed border-[#DFE8EC] dark:border-[#2A3D48] text-xs text-[#64748B] dark:text-[#A6B5C0]">
                    No employee birthdays on this date.
                  </div>
                )}
              </div>

              {/* Leaves Section */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B] dark:text-[#A6B5C0] flex items-center gap-1.5">
                    <span>🌴 Team on Leave on this day</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-[#D1FAE5] text-[#065F46] dark:bg-emerald-950/60 dark:text-emerald-200 border-[#059669]/30">
                      {selectedCell.allLeavesList?.length || 0}
                    </Badge>
                  </h4>
                </div>

                {selectedCell.allLeavesList?.length > 0 ? (
                  <div className="grid gap-2">
                    {selectedCell.allLeavesList.map((l, idx) => {
                      const daysCount = daysBetweenInclusive(l.startDate, l.endDate);
                      const isApproved = l.status === 'approved';

                      return (
                        <div
                          key={l.id || idx}
                          className="p-3.5 rounded-xl border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] shadow-2xs space-y-2 hover:border-[#0D9488]/40 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                              {l.avatar ? (
                                <img
                                  src={l.avatar}
                                  alt={l.name}
                                  className="w-10 h-10 rounded-full object-cover border border-[#DFE8EC] dark:border-[#2A3D48] shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-[#0D9488]/15 text-[#0D9488] dark:text-[#14B8A6] font-bold flex items-center justify-center text-sm shrink-0">
                                  {(l.name || 'U').slice(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-bold text-sm text-[#172B3A] dark:text-[#E8F0F4] truncate">
                                  {l.name}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-[#A6B5C0]">
                                  <span>@{l.username || l.userId}</span>
                                  {l.department && (
                                    <>
                                      <span>•</span>
                                      <span className="truncate">{l.department}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${
                                isApproved
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                              }`}>
                                {isApproved ? 'Approved Leave' : 'Pending Request'}
                              </span>
                              <span className="text-[11px] font-medium text-[#64748B] dark:text-[#A6B5C0] capitalize">
                                {l.type || 'Leave'} ({daysCount} {daysCount === 1 ? 'day' : 'days'})
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-[#64748B] dark:text-[#A6B5C0] pt-1 border-t border-[#DFE8EC]/60 dark:border-[#2A3D48]/60">
                            <CalendarDays className="w-3.5 h-3.5 text-[#0D9488] dark:text-[#14B8A6] shrink-0" />
                            <span className="font-medium text-[#172B3A] dark:text-[#E8F0F4]">
                              {formatFriendlyDate(l.startDate)} — {formatFriendlyDate(l.endDate)}
                            </span>
                          </div>

                          {l.reason && (
                            <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] italic bg-[#F4F8FA] dark:bg-[#1D303B] p-2 rounded-lg">
                              "{l.reason}"
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 text-center rounded-xl bg-[#F4F8FA]/60 dark:bg-[#1D303B]/40 border border-dashed border-[#DFE8EC] dark:border-[#2A3D48] text-xs text-[#64748B] dark:text-[#A6B5C0]">
                    No employees on leave on this date.
                  </div>
                )}
              </div>

              {/* Completely Empty state if neither holiday, birthday, nor leave */}
              {!selectedCell.isHoliday && (!selectedCell.birthdaysList || selectedCell.birthdaysList.length === 0) && (!selectedCell.allLeavesList || selectedCell.allLeavesList.length === 0) && (
                <div className="py-6 text-center text-sm text-[#64748B] dark:text-[#A6B5C0]">
                  No company events, birthdays, or leaves scheduled on this day.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
