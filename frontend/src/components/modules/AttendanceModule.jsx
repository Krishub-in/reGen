import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetAllAttendance, useGetUserAttendance, useRecordAttendance, useUpdateAttendance, useGetAllUsers, useGetAllLeaveRequests, useGetUserLeaveRequests, useApplyLeave, useUpdateLeaveRequest, useGetAllTasks, useGetPayrollSettings, useUpdatePayrollSettings } from '../../hooks/useQueries';
import { useCustomAuth } from '../../hooks/useCustomAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { User, Bell, Clock, Calendar, Download, History, Filter, Search, MapPin, LogIn, LogOut, CheckCircle, ListTodo, ChevronLeft, ChevronRight, Timer, CalendarClock, Briefcase, AlertCircle, FileText, Mail } from 'lucide-react';
import { format } from 'date-fns';
import { cn, safeRandomUUID, hasUserRole } from '@/lib/utils';
import { toast } from 'sonner';
import { isTaskExpired } from '@/lib/taskUtils';
import { useScrollPagination } from '../../hooks/useScrollPagination';

export default function AttendanceModule({ userProfile }) {
  const { identity } = useCustomAuth();
  const queryClient = useQueryClient();
  const isAdmin = hasUserRole(userProfile, 'admin') || hasUserRole(userProfile, 'owner') || hasUserRole(userProfile, 'param');
  
  const staffIdObj = userProfile?.userId || 
                     userProfile?.id || 
                     userProfile?._id || 
                     userProfile?.staffId || 
                     userProfile?.StaffId || 
                     (identity?.getPrincipal ? identity.getPrincipal() : null) || 
                     userProfile?.username || 
                     (typeof window !== 'undefined' ? localStorage.getItem('current_user') : null) || 
                     null;
  const staffIdStr = typeof staffIdObj === 'string' 
    ? staffIdObj.trim() 
    : (staffIdObj?.toText ? staffIdObj.toText() : (staffIdObj ? String(staffIdObj).trim() : ''));

  // Dynamically sync and refetch attendance immediately on check-in or socket update
  useEffect(() => {
    const handleAttendanceChange = () => {
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'attendance',
        refetchType: 'all',
      });
      queryClient.refetchQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'attendance',
      });
    };

    window.addEventListener('attendance:updated', handleAttendanceChange);
    return () => {
      window.removeEventListener('attendance:updated', handleAttendanceChange);
    };
  }, [queryClient]);

  // Default Work Schedule: 09:30 AM to 06:30 PM, 5 Days/week, 8 Working Hours
  const DEFAULT_SCHEDULE = useMemo(() => ({
    checkInTime: '09:30',
    checkOutTime: '18:30',
    daysPerWeek: '5',
    workingHours: '8',
    graceMinutes: '0',
  }), []);

  const getCompanyScheduleKey = useCallback(() => {
    const compId = userProfile?.companyId || userProfile?.tenantId || 'global';
    return `company_work_schedule_${compId}`;
  }, [userProfile]);

  const [workSchedule, setWorkSchedule] = useState(() => {
    try {
      const key = `company_work_schedule_${userProfile?.companyId || userProfile?.tenantId || 'global'}`;
      const saved = localStorage.getItem(key) || localStorage.getItem('company_work_schedule');
      if (saved) return { checkInTime: '09:30', checkOutTime: '18:30', daysPerWeek: '5', workingHours: '8', graceMinutes: '0', ...JSON.parse(saved) };
    } catch (e) {
      console.warn('Failed to parse work schedule:', e);
    }
    return {
      checkInTime: '09:30',
      checkOutTime: '18:30',
      daysPerWeek: '5',
      workingHours: '8',
      graceMinutes: '0',
    };
  });

  const { data: dbPayrollSettings } = useGetPayrollSettings();
  const updatePayrollSettingsMutation = useUpdatePayrollSettings();

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(workSchedule);

  // Sync with DB payroll settings if available
  useEffect(() => {
    if (dbPayrollSettings) {
      const merged = {
        checkInTime: dbPayrollSettings.checkInTime || '09:30',
        checkOutTime: dbPayrollSettings.checkOutTime || '18:30',
        daysPerWeek: String(dbPayrollSettings.workingDaysPerWeek || 5),
        workingHours: String(dbPayrollSettings.workingHoursPerDay || 8),
        graceMinutes: String(dbPayrollSettings.graceMinutes || 0),
      };
      setWorkSchedule(merged);
      setScheduleForm(merged);
    }
  }, [dbPayrollSettings]);

  // Sync schedule if updated elsewhere
  useEffect(() => {
    const handleScheduleUpdate = () => {
      try {
        const key = getCompanyScheduleKey();
        const saved = localStorage.getItem(key) || localStorage.getItem('company_work_schedule');
        if (saved) {
          const parsed = { ...DEFAULT_SCHEDULE, ...JSON.parse(saved) };
          setWorkSchedule(parsed);
          setScheduleForm(parsed);
        }
      } catch (e) {
        console.warn('Error reading updated schedule', e);
      }
    };
    window.addEventListener('company_work_schedule_updated', handleScheduleUpdate);
    return () => window.removeEventListener('company_work_schedule_updated', handleScheduleUpdate);
  }, [getCompanyScheduleKey, DEFAULT_SCHEDULE]);

  const handleSaveSchedule = async (e) => {
    e?.preventDefault?.();
    try {
      const key = getCompanyScheduleKey();
      localStorage.setItem(key, JSON.stringify(scheduleForm));
      localStorage.setItem('company_work_schedule', JSON.stringify(scheduleForm));
      setWorkSchedule(scheduleForm);
      window.dispatchEvent(new Event('company_work_schedule_updated'));

      // Also persist to company MongoDB settings
      await updatePayrollSettingsMutation.mutateAsync({
        checkInTime: scheduleForm.checkInTime,
        checkOutTime: scheduleForm.checkOutTime,
        workingDaysPerWeek: Number(scheduleForm.daysPerWeek),
        workingHoursPerDay: Number(scheduleForm.workingHours),
        graceMinutes: Number(scheduleForm.graceMinutes || 0),
      });

      setIsScheduleModalOpen(false);
      toast.success('Work schedule & payroll timings updated successfully!');
    } catch (err) {
      toast.error(err.message || 'Failed to save schedule');
    }
  };

  // Queries
  const { data: allAttendance = [] } = useGetAllAttendance();
  const { data: userAttendance = [] } = useGetUserAttendance(staffIdObj || null);
  const { data: myLeaves = [] } = useGetUserLeaveRequests(staffIdStr || (userProfile?.userId || userProfile?.id) || null);
  const { data: allLeaves = [] } = useGetAllLeaveRequests();
  const applyLeave = useApplyLeave();
  const updateLeaveReq = useUpdateLeaveRequest();
  const { data: users = [] } = useGetAllUsers();
  const { data: allTasks = [] } = useGetAllTasks();
  
  // Mutations
  const recordAttendance = useRecordAttendance();
  const updateAttendance = useUpdateAttendance();

  // State
  const [currentTime, setCurrentTime] = useState(new Date());
  const [filterDate, setFilterDate] = useState(new Date());
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ type: 'casual', startDate: '', endDate: '', reason: '' });

  // Admin filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showHistory, setShowHistory] = useState(false);

  const greeting = useMemo(() => {
    const h = currentTime.getHours();
    if (h < 12) return 'Good Morning,';
    if (h < 17) return 'Good Afternoon,';
    if (h < 21) return 'Good Evening,';
    return 'Good Night,';
  }, [currentTime]);
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Robust Helpers
  const toIdText = useCallback((val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val.toText) return val.toText();
    return String(val);
  }, []);

  const isOwnerRole = useCallback((role) => {
    if (!role) return false;
    const r = typeof role === 'string' ? role.toLowerCase() : Object.keys(role || {})[0]?.toLowerCase() || '';
    return r === 'owner' || r === 'superadmin' || r === 'param';
  }, []);

  // Filter employees excluding the owner
  const activeEmployees = useMemo(() => {
    return users.filter(u => !isOwnerRole(u.role));
  }, [users, isOwnerRole]);

  const getUserDetails = useCallback((principalId) => {
    if (!principalId) return null;
    const pid = toIdText(principalId).toLowerCase().trim();
    return users.find(u => {
      const uIds = [
        toIdText(u.userId),
        toIdText(u.id),
        toIdText(u._id),
        toIdText(u.username),
        toIdText(u.staffId),
        toIdText(u.StaffId),
      ].map(s => s.toLowerCase().trim()).filter(Boolean);
      return uIds.includes(pid);
    });
  }, [users, toIdText]);

  const matchesEmployee = useCallback((record, user) => {
    if (!record || !user) return false;
    const rId = toIdText(record.userId || record.id).toLowerCase().trim();
    if (!rId) return false;
    const uIds = [
      toIdText(user.userId),
      toIdText(user.id),
      toIdText(user._id),
      toIdText(user.username),
      toIdText(user.staffId),
      toIdText(user.StaffId),
    ].map(s => s.toLowerCase().trim()).filter(Boolean);
    return uIds.includes(rId);
  }, [toIdText]);

  // Safely extract string status even if Candid variant object like { present: null } or { late: null }
  const getAttendanceStatus = useCallback((status) => {
    if (!status) return 'present';
    if (typeof status === 'string') return status.toLowerCase().trim();
    if (typeof status === 'object') {
      const key = Object.keys(status)[0];
      return (key || 'present').toLowerCase().trim();
    }
    return String(status).toLowerCase().trim();
  }, []);

  const isPresentStatus = useCallback((status) => {
    const s = getAttendanceStatus(status);
    return s === 'present' || s === 'half_day' || s === 'halfday';
  }, [getAttendanceStatus]);

  const isLateStatus = useCallback((status) => {
    const s = getAttendanceStatus(status);
    return s === 'late';
  }, [getAttendanceStatus]);

  const isAbsentStatus = useCallback((status) => {
    const s = getAttendanceStatus(status);
    return s === 'absent';
  }, [getAttendanceStatus]);

  // Robust date extractor from string, ISO, number or Motoko BigInt nanoseconds
  const normalizeAttendanceDate = useCallback((a) => {
    const raw = a?.date || a?.checkIn || a?.createdAt;
    if (!raw) return '';
    if (typeof raw === 'string') {
      if (raw.includes('T')) return raw.split('T')[0];
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      return raw.trim();
    }
    if (typeof raw === 'number' || typeof raw === 'bigint') {
      const num = Number(raw);
      const ms = num > 1e14 ? num / 1e6 : (num > 1e11 ? num : num * 1000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    if (raw instanceof Date) {
      return raw.toISOString().split('T')[0];
    }
    return '';
  }, []);

  const isEmployeeOnLeaveOnDate = useCallback((user, dateStr) => {
    if (!user || !dateStr) return false;
    const uIds = [
      toIdText(user.userId),
      toIdText(user.id),
      toIdText(user._id),
      toIdText(user.username),
      toIdText(user.staffId),
      toIdText(user.StaffId),
    ].map(s => s.toLowerCase().trim()).filter(Boolean);

    return allLeaves.some(l => {
      const lUid = toIdText(l.userId || l.employeeId || l.applicant).toLowerCase().trim();
      if (!uIds.includes(lUid)) return false;
      const statusKey = typeof l.status === 'string' ? l.status.toLowerCase() : Object.keys(l.status || {})[0]?.toLowerCase();
      if (statusKey !== 'approved') return false;

      const start = normalizeAttendanceDate(l.startDate || l.start) || (typeof l.startDate === 'string' ? l.startDate.slice(0, 10) : '');
      const end = normalizeAttendanceDate(l.endDate || l.end) || (typeof l.endDate === 'string' ? l.endDate.slice(0, 10) : '') || start;
      if (!start) return false;
      return dateStr >= start && dateStr <= end;
    });
  }, [allLeaves, toIdText, normalizeAttendanceDate]);

  const formatTime = (timeValue) => {
    if (!timeValue) return '--';
    try {
      if (typeof timeValue === 'bigint') {
        const ms = Number(timeValue) / 1000000;
        const d = new Date(ms);
        if (isNaN(d.getTime())) return '--';
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      if (typeof timeValue === 'string') {
        if (/^\d+$/.test(timeValue)) {
          const asBig = BigInt(timeValue);
          const ms = Number(asBig) / 1000000;
          const d = new Date(ms);
          if (isNaN(d.getTime())) return '--';
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        const d = new Date(timeValue);
        if (isNaN(d.getTime())) return '--';
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      if (typeof timeValue === 'number') {
        let ms = timeValue;
        if (timeValue > 10000000000) {
          ms = timeValue / 1000000;
        }
        const d = new Date(ms);
        if (isNaN(d.getTime())) return '--';
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    } catch (e) {
      console.error('Error formatting time:', timeValue, e);
      return '--';
    }
  };

  const getCheckInTime = (record) => {
    if (!record) return null;
    return record?.checkIn || 
           record?.checkInTime || 
           record?.checkInAt || 
           record?.checkinTime ||
           record?.start ||
           record?.startTime ||
           null;
  };

  const getCheckOutTime = (record) => {
    if (!record) return null;
    const checkOut = record?.checkOut || 
                    record?.checkOutTime || 
                    record?.checkOutAt || 
                    record?.checkoutTime ||
                    record?.end ||
                    record?.endTime ||
                    null;
    return Array.isArray(checkOut) ? checkOut[0] : checkOut;
  };

  const calculateDuration = (startTime, endTime, verbose = false) => {
    if (!startTime || !endTime) return null;
    try {
      let startMs = typeof startTime === 'number'
        ? (startTime > 10000000000 ? startTime / 1000000 : startTime)
        : new Date(startTime).getTime();
      let endMs = typeof endTime === 'number'
        ? (endTime > 10000000000 ? endTime / 1000000 : endTime)
        : new Date(endTime).getTime();

      if (isNaN(startMs) || isNaN(endMs) || endMs < startMs) return null;

      const diffMs = endMs - startMs;
      const totalMinutes = Math.floor(diffMs / (1000 * 60));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      if (verbose) {
        if (hours === 0) return `${minutes} min${minutes !== 1 ? 's' : ''}`;
        if (minutes === 0) return `${hours} hr${hours !== 1 ? 's' : ''}`;
        return `${hours} hr${hours !== 1 ? 's' : ''} ${minutes} min${minutes !== 1 ? 's' : ''}`;
      }
      if (hours === 0) return `${minutes}m`;
      if (minutes === 0) return `${hours}h`;
      return `${hours}h ${minutes}m`;
    } catch {
      return null;
    }
  };

  // Combined attendance list ensuring instant cross-view synchronization
  const combinedAttendanceList = useMemo(() => {
    const map = new Map();
    (allAttendance || []).forEach(a => {
      const d = normalizeAttendanceDate(a);
      const u = toIdText(a.userId || a.id);
      map.set(a.id || a._id || `${u}-${d}`, a);
    });
    (userAttendance || []).forEach(a => {
      const d = normalizeAttendanceDate(a);
      const u = toIdText(a.userId || a.id);
      map.set(a.id || a._id || `${u}-${d}`, a);
    });
    return Array.from(map.values());
  }, [allAttendance, userAttendance, normalizeAttendanceDate, toIdText]);

  // Dynamic user-specific attendance history sorted with newest records first
  const myAttendanceHistory = useMemo(() => {
    return (combinedAttendanceList || [])
      .filter(r => matchesEmployee(r, userProfile) || (staffIdStr && toIdText(r.userId) === staffIdStr))
      .sort((a, b) => {
        const timeA = new Date(getCheckInTime(a) || a.date || 0).getTime();
        const timeB = new Date(getCheckInTime(b) || b.date || 0).getTime();
        return timeB - timeA;
      });
  }, [combinedAttendanceList, userProfile, staffIdStr, matchesEmployee, toIdText, getCheckInTime]);

  // -- Admin View Logic --
  const attendanceData = isAdmin ? combinedAttendanceList : userAttendance;
  
  const myPendingTasks = useMemo(() => {
    return allTasks.filter(t => {
      const a1 = typeof t.assignedTo === 'string' ? t.assignedTo : (t.assignedTo?.toText ? t.assignedTo.toText() : String(t.assignedTo || ''));
      const a2 = typeof t.assignee === 'string' ? t.assignee : (t.assignee?.toText ? t.assignee.toText() : String(t.assignee || ''));
      const hasStaffId = staffIdStr && (a1 === staffIdStr || a2 === staffIdStr);
      if (!hasStaffId) return false;

      const statusKey = typeof t.status === 'string' ? t.status : Object.keys(t.status || {})[0];
      if (statusKey === 'done' || statusKey === 'completed' || statusKey === 'not_completed' || statusKey === 'notCompleted') return false;
      if (isTaskExpired(t)) return false;

      return true;
    }).length;
  }, [allTasks, staffIdStr, currentTime]);
  
  const { prevMonthName, prevMonthPercentage } = useMemo(() => {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthName = prevMonth.toLocaleString('default', { month: 'long' });
    const daysInPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    
    let weekdays = 0;
    for (let i = 1; i <= daysInPrevMonth; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - 1, i);
        if (d.getDay() !== 0 && d.getDay() !== 6) weekdays++;
    }

    const prevMonthRecords = userAttendance.filter(a => {
        const d = new Date(a.date);
        return d.getMonth() === prevMonth.getMonth() && d.getFullYear() === prevMonth.getFullYear();
    });
    
    const presentCount = prevMonthRecords.filter(a => isPresentStatus(a.status) || isLateStatus(a.status)).length;
    const percentage = weekdays > 0 ? Math.round((presentCount / weekdays) * 100) : 0;
    
    return { prevMonthName: monthName, prevMonthPercentage: Math.min(percentage, 100) };
  }, [userAttendance, isPresentStatus, isLateStatus]);

  // Selected date formatted for daily view
  const selectedDateStr = useMemo(() => {
    return showHistory ? format(currentTime, 'yyyy-MM-dd') : format(filterDate, 'yyyy-MM-dd');
  }, [showHistory, currentTime, filterDate]);

  // Dynamic department list from active employees
  const departments = useMemo(() => {
    const deptSet = new Set();
    activeEmployees.forEach(u => { if (u.department) deptSet.add(u.department); });
    return [...deptSet].sort();
  }, [activeEmployees]);

  // Comprehensive daily roster of ALL active company employees for selectedDateStr
  const dailyRoster = useMemo(() => {
    if (showHistory) return [];

    return activeEmployees.map(emp => {
      const empIdStr = toIdText(emp.userId || emp.id);
      // Find matching attendance record for selectedDateStr
      const record = attendanceData.find(a => {
        const matchesUser = matchesEmployee(a, emp);
        const aDate = normalizeAttendanceDate(a);
        return matchesUser && aDate === selectedDateStr;
      });

      if (record) {
        const rawStatus = record.status;
        let resolvedStatus = 'present';
        if (isLateStatus(rawStatus)) {
          resolvedStatus = 'late';
        } else if (isAbsentStatus(rawStatus)) {
          resolvedStatus = 'absent';
        } else if (getAttendanceStatus(rawStatus) === 'half_day' || getAttendanceStatus(rawStatus) === 'halfday') {
          resolvedStatus = 'half_day';
        } else {
          resolvedStatus = 'present';
        }

        const inTime = getCheckInTime(record);
        const outTime = getCheckOutTime(record);
        const duration = calculateDuration(inTime, outTime);

        return {
          id: record.id || record._id || `att-${empIdStr}`,
          recordId: record.id || record._id,
          userId: empIdStr,
          rawUser: emp,
          name: emp.name || emp.username || 'Employee',
          department: emp.department || 'General',
          date: selectedDateStr,
          checkIn: inTime,
          checkOut: outTime,
          duration,
          status: resolvedStatus,
          location: record.location || 'Office Main',
          hasRecord: true,
          originalRecord: record,
        };
      }

      // If no attendance record, check if on approved leave
      const onLeave = isEmployeeOnLeaveOnDate(emp, selectedDateStr);
      const status = onLeave ? 'on_leave' : 'absent';

      return {
        id: `absent-${empIdStr}-${selectedDateStr}`,
        recordId: null,
        userId: empIdStr,
        rawUser: emp,
        name: emp.name || emp.username || 'Employee',
        department: emp.department || 'General',
        date: selectedDateStr,
        checkIn: null,
        checkOut: null,
        duration: null,
        status,
        location: '--',
        hasRecord: false,
        originalRecord: null,
      };
    });
  }, [showHistory, activeEmployees, attendanceData, selectedDateStr, matchesEmployee, normalizeAttendanceDate, isLateStatus, isAbsentStatus, getAttendanceStatus, isEmployeeOnLeaveOnDate, toIdText]);

  // Accurate Stats: Present, Absent, Late, On Leave / Half Day, Rate
  const stats = useMemo(() => {
    if (!showHistory && dailyRoster.length > 0) {
      const present = dailyRoster.filter(r => r.status === 'present').length;
      const late = dailyRoster.filter(r => r.status === 'late').length;
      const absent = dailyRoster.filter(r => r.status === 'absent').length;
      const halfDay = dailyRoster.filter(r => r.status === 'half_day' || r.status === 'on_leave').length;
      const total = activeEmployees.length || dailyRoster.length;
      const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

      return {
        present,
        absent,
        late,
        halfDay,
        rate: Math.min(100, Math.max(0, rate)),
        total,
      };
    }

    // If history mode, compute stats for today:
    const today = format(new Date(), 'yyyy-MM-dd');
    let present = 0;
    let late = 0;
    let halfDay = 0;

    activeEmployees.forEach(emp => {
      const record = attendanceData.find(a => matchesEmployee(a, emp) && normalizeAttendanceDate(a) === today);
      if (record) {
        if (isLateStatus(record.status)) late++;
        else if (isAbsentStatus(record.status)) {} // absent
        else if (getAttendanceStatus(record.status) === 'half_day') halfDay++;
        else present++;
      } else {
        if (isEmployeeOnLeaveOnDate(emp, today)) halfDay++;
      }
    });

    const total = activeEmployees.length;
    const absent = Math.max(0, total - (present + late + halfDay));
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return {
      present,
      absent,
      late,
      halfDay,
      rate: Math.min(100, Math.max(0, rate)),
      total,
    };
  }, [showHistory, dailyRoster, activeEmployees, attendanceData, matchesEmployee, normalizeAttendanceDate, isLateStatus, isAbsentStatus, getAttendanceStatus, isEmployeeOnLeaveOnDate]);

  // Filtered attendance for table display
  const filteredAttendance = useMemo(() => {
    let list = [];

    if (!showHistory) {
      list = [...dailyRoster];
    } else {
      list = attendanceData.map(r => {
        const user = getUserDetails(r.userId);
        const inTime = getCheckInTime(r);
        const outTime = getCheckOutTime(r);
        const rawStatus = r.status;
        let resolvedStatus = 'present';
        if (isLateStatus(rawStatus)) resolvedStatus = 'late';
        else if (isAbsentStatus(rawStatus)) resolvedStatus = 'absent';
        else if (getAttendanceStatus(rawStatus) === 'half_day') resolvedStatus = 'half_day';
        else resolvedStatus = 'present';

        return {
          id: r.id || r._id,
          recordId: r.id || r._id,
          userId: toIdText(r.userId),
          rawUser: user,
          name: user?.name || user?.username || 'Employee',
          department: user?.department || '--',
          date: normalizeAttendanceDate(r) || r.date || '--',
          checkIn: inTime,
          checkOut: outTime,
          duration: calculateDuration(inTime, outTime),
          status: resolvedStatus,
          location: r.location || 'Office Main',
          hasRecord: true,
          originalRecord: r,
        };
      });

      list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    // Status filter
    if (filterStatus !== 'all') {
      list = list.filter(r => r.status === filterStatus);
    }

    // Department filter
    if (filterDept !== 'all') {
      list = list.filter(r => r.department === filterDept);
    }

    // Employee filter
    if (filterEmployee !== 'all') {
      const target = filterEmployee.toLowerCase();
      list = list.filter(r => {
        const rUid = (r.userId || '').toLowerCase();
        const rawUid = toIdText(r.rawUser?.userId || r.rawUser?.id).toLowerCase();
        return rUid === target || rawUid === target;
      });
    }

    // Search query (name, userId, department)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r => {
        const name = (r.name || '').toLowerCase();
        const dept = (r.department || '').toLowerCase();
        const uid = (r.userId || '').toLowerCase();
        return name.includes(q) || dept.includes(q) || uid.includes(q);
      });
    }

    return list;
  }, [showHistory, dailyRoster, attendanceData, filterStatus, filterDept, filterEmployee, searchQuery, getUserDetails, isLateStatus, isAbsentStatus, getAttendanceStatus, toIdText, normalizeAttendanceDate]);

  // Scroll-down pagination: 6 per page, loading next 6 on scroll down
  const {
    displayedItems = [],
    hasMore: hasMoreData,
    handleScroll: handleTableScroll,
    totalCount: totalDataCount,
    loadMore: loadMoreData,
  } = useScrollPagination(filteredAttendance, 6, [filterDate, filterStatus, filterDept, filterEmployee, searchQuery, showHistory]);
  const paginatedData = Array.isArray(displayedItems) ? displayedItems : [];

  // Export CSV handler
  const handleExport = useCallback(() => {
    if (filteredAttendance.length === 0) {
      toast.error('No records to export');
      return;
    }
    const headers = ['Date', 'Employee ID', 'Name', 'Department', 'Status', 'Check In', 'Check Out', 'Working Hours', 'Location'];
    const rows = filteredAttendance.map(r => {
      return [
        r.date || '',
        r.userId || '',
        r.name || 'Unknown',
        r.department || '',
        r.status || '',
        formatTime(r.checkIn) || '',
        r.checkOut ? formatTime(r.checkOut) : '',
        r.duration || '',
        r.location || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance_${selectedDateStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Attendance report exported');
  }, [filteredAttendance, selectedDateStr]);

  // -- User/Mobile View Logic --
  const todayStr = format(currentTime, 'yyyy-MM-dd');
  const todayRecord = useMemo(() => {
    const source = combinedAttendanceList;
    return source.find(r => {
      const matchesMe = matchesEmployee(r, userProfile) || (staffIdStr && toIdText(r.userId) === staffIdStr);
      if (!matchesMe) return false;
      const aDate = normalizeAttendanceDate(r);
      return aDate === todayStr || (typeof r.date === 'string' && r.date.startsWith(todayStr));
    });
  }, [combinedAttendanceList, userProfile, staffIdStr, matchesEmployee, normalizeAttendanceDate, todayStr, toIdText]);
  const isCheckedIn = !!todayRecord;
  const isCheckedOut = todayRecord && !!getCheckOutTime(todayRecord);
  const isTodayLate = todayRecord && isLateStatus(todayRecord.status);

  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const handleCheckIn = async () => {
    if (!staffIdStr && !identity && !userProfile) {
      toast.error('Please login first');
      return;
    }
    if (isCheckedOut) {
      toast.info('You have already completed your shift today. Check-in will reopen tomorrow.');
      return;
    }
    if (isCheckingIn || isCheckedIn) {
      toast.info('You are already checked in for today.');
      return;
    }

    setIsCheckingIn(true);

    const doCheckIn = async (locationStr = '') => {
      try {
        const now = new Date();

        // Evaluate if check-in is late compared to scheduled check-in time
        let checkInStatus = 'present';
        try {
          const [schedH, schedM] = (workSchedule.checkInTime || '09:30').split(':').map(Number);
          const grace = Number(workSchedule.graceMinutes) || 0;
          const scheduledMinutes = (isNaN(schedH) ? 9 : schedH) * 60 + (isNaN(schedM) ? 30 : schedM) + grace;
          const currentMinutes = now.getHours() * 60 + now.getMinutes();

          if (currentMinutes > scheduledMinutes) {
            checkInStatus = 'late';
          }
        } catch (e) {
          console.warn('Failed to calculate late status:', e);
        }

        const payload = {
          id: safeRandomUUID(),
          userId: staffIdStr,
          companyId: userProfile?.companyId || userProfile?.tenantId || undefined,
          date: todayStr,
          checkIn: now.toISOString(),
          status: checkInStatus,
          workMode: 'office',
          location: locationStr || 'Office Main',
          notes: checkInStatus === 'late' ? `Late arrival (Shift start: ${workSchedule.checkInTime})` : ''
        };

        await recordAttendance.mutateAsync(payload);
        if (checkInStatus === 'late') {
          toast.warning(`Checked in as LATE at ${format(now, 'hh:mm a')} (Shift start: ${workSchedule.checkInTime})`);
        } else {
          toast.success('Check-in successful! Have a great day.');
        }
      } catch (error) {
        console.error('Check-in failed:', error);
        toast.error(`Check-in failed: ${error.message || 'Please try again.'}`);
      } finally {
        setIsCheckingIn(false);
      }
    };

    let hasExecuted = false;
    const executeCheckIn = (loc = '') => {
      if (hasExecuted) return;
      hasExecuted = true;
      doCheckIn(loc);
    };

    // Quick 800ms fallback so UI is immediately responsive even if geolocation hangs or permissions are pending
    const geoTimer = setTimeout(() => {
      executeCheckIn('');
    }, 800);

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            clearTimeout(geoTimer);
            const { latitude, longitude } = position.coords;
            executeCheckIn(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          },
          (error) => {
            clearTimeout(geoTimer);
            executeCheckIn('');
          },
          { timeout: 800, enableHighAccuracy: false, maximumAge: 60000 }
        );
      } catch {
        clearTimeout(geoTimer);
        executeCheckIn('');
      }
    } else {
      clearTimeout(geoTimer);
      executeCheckIn('');
    }
  };

  const handleCheckOut = async () => {
    if (!todayRecord) {
      toast.error('Please check in first before checking out');
      return;
    }
    if (isCheckingOut || isCheckedOut) return;

    setIsCheckingOut(true);
    const now = new Date();

    try {
      await updateAttendance.mutateAsync({
        ...todayRecord,
        id: todayRecord.id || todayRecord._id,
        userId: staffIdStr || toIdText(todayRecord.userId),
        checkOut: now.toISOString(),
      });
      toast.success('Check-out successful! Shift completed.');
    } catch (error) {
      console.error("Check-out failed:", error);
      toast.error('Check-out failed. Please try again.');
    } finally {
      setIsCheckingOut(false);
    }
  };
  // --- Render Mobile/User View ---
  if (!isAdmin) {
    return (
      <div className="w-full space-y-6 pb-12">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/60">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{greeting}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Logged in as <span className="font-semibold text-foreground">{userProfile?.name || userProfile?.username || (userProfile?.id?.toText ? userProfile.id.toText() : String(userProfile?.id || ''))}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(
              "px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5",
              isCheckedIn && !isCheckedOut
                ? isTodayLate
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                : isCheckedOut
                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                : "bg-muted text-muted-foreground border border-border"
            )}>
              <span className={cn(
                "w-2 h-2 rounded-full",
                isCheckedIn && !isCheckedOut ? (isTodayLate ? "bg-amber-500 animate-pulse" : "bg-emerald-500 animate-pulse") : isCheckedOut ? "bg-purple-500" : "bg-muted-foreground"
              )} />
              {isCheckedIn && !isCheckedOut ? (isTodayLate ? "Clocked In (Late)" : "Clocked In & Active") : isCheckedOut ? "Shift Completed (Reopens Tomorrow)" : "Not Clocked In"}
            </span>
          </div>
        </div>

        {/* Top Metric & Status Cards (Full-Width Responsive 4-Column Grid) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Clock & Date Card */}
          <Card className="border border-border bg-gradient-to-br from-[#0D9488] to-[#0F766E] text-white rounded-2xl shadow-sm p-5 relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-emerald-100 uppercase tracking-wider">{format(currentTime, 'EEEE')}</span>
              <div className="flex items-center gap-1 text-[11px] text-emerald-100 bg-white/10 px-2 py-0.5 rounded-full backdrop-blur-xs">
                <MapPin className="h-3 w-3" /> Shift {workSchedule.checkInTime}–{workSchedule.checkOutTime}
              </div>
            </div>
            <div className="my-3">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-mono">
                {format(currentTime, 'hh:mm')}
                <span className="text-base font-normal ml-1 opacity-90">{format(currentTime, 'a')}</span>
              </h1>
              <p className="text-xs text-emerald-100 mt-1">{format(currentTime, 'MMMM d, yyyy')}</p>
            </div>
            <p className="text-[11px] text-emerald-100/80">Realtime synced with office attendance zone</p>
          </Card>

          {/* Active Shift / Duration Card */}
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {isCheckedOut ? "Shift Duration" : "Working Hours"}
              </span>
              <div className={cn(
                "p-2 rounded-xl",
                isCheckedIn && !isCheckedOut ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"
              )}>
                <Timer className="w-4 h-4" />
              </div>
            </div>
            <div className="my-2">
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight font-mono text-foreground">
                {isCheckedOut
                  ? (calculateDuration(getCheckInTime(todayRecord), getCheckOutTime(todayRecord), true) || '0 mins')
                  : isCheckedIn
                  ? (calculateDuration(getCheckInTime(todayRecord), currentTime, true) || '0 mins')
                  : '--'}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                {isCheckedIn ? `In: ${formatTime(getCheckInTime(todayRecord))}` : 'Punch in to start timer'}
                {isCheckedOut && ` • Out: ${formatTime(getCheckOutTime(todayRecord))}`}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                isCheckedIn && !isCheckedOut ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
              )} />
              <span>{isCheckedIn && !isCheckedOut ? "Currently logging active shift" : "Shift idle"}</span>
            </div>
          </Card>

          {/* Last Month Attendance % */}
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{prevMonthName} Attendance</span>
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="my-2">
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                {prevMonthPercentage > 0 ? `${prevMonthPercentage}%` : 'N/A'}
              </span>
              <p className="text-xs text-muted-foreground mt-1">On-time adherence record</p>
            </div>
            <p className="text-[11px] text-muted-foreground">Calculated across working days</p>
          </Card>

          {/* Pending Tasks */}
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pending Tasks</span>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <ListTodo className="w-4 h-4" />
              </div>
            </div>
            <div className="my-2">
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                {myPendingTasks}
              </span>
              <p className="text-xs text-muted-foreground mt-1">Assigned deliverables</p>
            </div>
            <p className="text-[11px] text-muted-foreground">Check Scrum / Schedules for details</p>
          </Card>
        </div>

        {/* Action Punch Cards (Full-Width Responsive 2-Column Grid) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
          {/* Check In Action Card */}
          <div
            onClick={!isCheckedIn && !isCheckedOut && !isCheckingIn ? handleCheckIn : isCheckedOut ? () => toast.info('Shift completed for today. Check-in reopens tomorrow.') : undefined}
            className={cn(
              "p-4 sm:p-6 rounded-2xl border transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4",
              isCheckedIn || isCheckedOut
                ? "bg-secondary/40 border-border opacity-80 cursor-default"
                : "bg-card border-border hover:border-emerald-500/50 hover:shadow-md cursor-pointer group"
            )}
          >
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className={cn(
                "h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center shrink-0 transition-all",
                isCheckedOut
                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                  : isCheckedIn
                  ? "bg-muted text-muted-foreground"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white"
              )}>
                {isCheckedOut ? (
                  <CheckCircle className="h-6 w-6 sm:h-7 sm:w-7 text-purple-600 dark:text-purple-400" />
                ) : isCheckingIn ? (
                  <div className="h-5 w-5 sm:h-6 sm:w-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <LogIn className="h-6 w-6 sm:h-7 sm:w-7" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base sm:text-lg font-bold text-foreground truncate">
                  {isCheckedOut ? 'Shift Completed Today' : isCheckingIn ? 'Checking In...' : isCheckedIn ? 'Checked In' : 'Check In'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {isCheckedOut
                    ? `Punched out at ${formatTime(getCheckOutTime(todayRecord))} • Check-in reopens tomorrow`
                    : isCheckedIn
                    ? `Punched in at ${formatTime(getCheckInTime(todayRecord))}`
                    : 'Tap here to mark your arrival for today'}
                </p>
              </div>
            </div>
            <Button
              disabled={isCheckedIn || isCheckedOut || isCheckingIn}
              onClick={(e) => {
                e.stopPropagation();
                if (!isCheckedIn && !isCheckedOut && !isCheckingIn) handleCheckIn();
              }}
              className={cn(
                "w-full sm:w-auto rounded-xl px-5 h-10 font-semibold shadow-xs transition-transform active:scale-95 shrink-0",
                isCheckedOut
                  ? "bg-purple-600/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 cursor-default"
                  : isCheckedIn
                  ? "bg-muted text-muted-foreground cursor-default"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              )}
            >
              {isCheckedOut ? 'Completed' : isCheckingIn ? 'Saving...' : isCheckedIn ? 'Done' : 'Check In'}
            </Button>
          </div>

          {/* Check Out Action Card */}
          <div
            onClick={isCheckedIn && !isCheckedOut && !isCheckingOut ? handleCheckOut : isCheckedOut ? () => toast.info('Shift already completed. Reopens tomorrow.') : undefined}
            className={cn(
              "p-4 sm:p-6 rounded-2xl border transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4",
              !isCheckedIn || isCheckedOut
                ? "bg-secondary/40 border-border opacity-80 cursor-default"
                : "bg-card border-border hover:border-red-500/50 hover:shadow-md cursor-pointer group"
            )}
          >
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className={cn(
                "h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center shrink-0 transition-all",
                isCheckedOut
                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                  : !isCheckedIn
                  ? "bg-muted text-muted-foreground"
                  : "bg-red-500/10 text-red-600 dark:text-red-400 group-hover:bg-red-500 group-hover:text-white"
              )}>
                {isCheckedOut ? (
                  <CheckCircle className="h-6 w-6 sm:h-7 sm:w-7 text-purple-600 dark:text-purple-400" />
                ) : isCheckingOut ? (
                  <div className="h-5 w-5 sm:h-6 sm:w-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <LogOut className="h-6 w-6 sm:h-7 sm:w-7" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base sm:text-lg font-bold text-foreground truncate">
                  {isCheckedOut ? 'Shift Completed' : isCheckingOut ? 'Checking Out...' : 'Check Out'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {isCheckedOut
                    ? `Punched out at ${formatTime(getCheckOutTime(todayRecord))} • Reopens tomorrow`
                    : isCheckedIn
                    ? 'Tap here when you finish your shift'
                    : 'Check in required first'}
                </p>
              </div>
            </div>
            <Button
              disabled={!isCheckedIn || isCheckedOut || isCheckingOut}
              onClick={(e) => {
                e.stopPropagation();
                if (isCheckedIn && !isCheckedOut && !isCheckingOut) handleCheckOut();
              }}
              className={cn(
                "w-full sm:w-auto rounded-xl px-5 h-10 font-semibold shadow-xs transition-transform active:scale-95 shrink-0",
                isCheckedOut
                  ? "bg-purple-600/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 cursor-default"
                  : !isCheckedIn
                  ? "bg-muted text-muted-foreground cursor-default"
                  : "bg-red-600 hover:bg-red-700 text-white cursor-pointer"
              )}
            >
              {isCheckedOut ? 'Completed' : isCheckingOut ? 'Saving...' : 'Check Out'}
            </Button>
          </div>
        </div>

        {/* Full-Width Recent History Table */}
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden">
          <CardHeader className="border-b border-border bg-card px-6 py-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-foreground">Recent Attendance History</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Log of your daily check-in, check-out and total working duration</p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="text-xs font-semibold rounded-xl border-border"
              onClick={() => setShowAllHistory(!showAllHistory)}
            >
              {showAllHistory ? "View Less" : "View All"}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-secondary/40 border-b border-border">
                  <TableRow>
                    <TableHead className="pl-6 py-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                    <TableHead className="py-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                    <TableHead className="py-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Check In</TableHead>
                    <TableHead className="py-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Check Out</TableHead>
                    <TableHead className="py-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Working Hours</TableHead>
                    <TableHead className="pr-6 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(showAllHistory ? myAttendanceHistory : myAttendanceHistory.slice(0, 8)).map((record) => {
                    const inTime = getCheckInTime(record);
                    const outTime = getCheckOutTime(record);
                    const durationStr = calculateDuration(inTime, outTime, true);
                    const rawStatus = record.status;
                    const isLate = isLateStatus(rawStatus);
                    const isPresent = isPresentStatus(rawStatus);
                    const isAbsent = isAbsentStatus(rawStatus);
                    const statusText = isLate ? 'late' : (isPresent ? 'present' : (isAbsent ? 'absent' : 'present'));

                    return (
                      <TableRow key={record.id || record._id} className="border-b border-border/50">
                        <TableCell className="pl-6 py-3.5 font-medium text-foreground text-sm">
                          {record.date || (inTime ? format(new Date(inTime), 'yyyy-MM-dd') : '--')}
                        </TableCell>
                        <TableCell className="py-3.5">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize inline-flex items-center gap-1",
                            statusText === 'present'
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                              : statusText === 'late'
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                              : "bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200"
                          )}>
                            <span className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              statusText === 'present' ? "bg-emerald-500" :
                              statusText === 'late' ? "bg-amber-500" :
                              "bg-red-500"
                            )} />
                            {statusText}
                          </span>
                        </TableCell>
                        <TableCell className="py-3.5 font-mono text-xs text-foreground">
                          {formatTime(inTime)}
                        </TableCell>
                        <TableCell className="py-3.5 font-mono text-xs text-foreground">
                          {outTime ? formatTime(outTime) : <span className="text-muted-foreground italic">Ongoing</span>}
                        </TableCell>
                        <TableCell className="py-3.5 font-mono text-xs font-semibold text-primary">
                          {durationStr || '--'}
                        </TableCell>
                        <TableCell className="pr-6 py-3.5 text-right text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {record.location || 'Office Main'}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {myAttendanceHistory.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                        No previous attendance records recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Render Admin View ---
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold leading-tight">
            {showHistory ? 'Attendance History' : 'Daily Attendance Overview'}
          </h2>
          {/* Active schedule summary badge */}
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-foreground bg-muted px-2 py-0.5 rounded-md">
              <Clock className="w-3.5 h-3.5 text-primary" />
              Office Shift: {workSchedule.checkInTime || '09:30'} – {workSchedule.checkOutTime || '18:30'}
            </span>
            <span>•</span>
            <span>{workSchedule.workingHours || 8} hrs/day</span>
            <span>•</span>
            <span>{workSchedule.daysPerWeek || 5} days/wk</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 md:flex-none">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search employees..."
                  className="pl-9 w-full md:w-[230px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-6">
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Present Today</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <User className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground mt-2">{stats.present}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Clocked in on time</p>
        </Card>
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Absent Today</span>
            <div className="p-2 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
              <User className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground mt-2">{stats.absent}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Not clocked in / Absent</p>
        </Card>
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Late Arrivals</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground mt-2">{stats.late}</div>
          <p className="text-[11px] text-muted-foreground mt-1">After {workSchedule.checkInTime || '09:30'}</p>
        </Card>
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">On Leave / Half Day</span>
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground mt-2">{stats.halfDay}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Approved time off</p>
        </Card>
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-4 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Attendance Rate</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground mt-2">
            {stats.rate}%
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Turnout ({stats.present + stats.late}/{stats.total})</p>
        </Card>
      </div>

      {/* Filters and Actions */}
      <div className="flex flex-col gap-4 justify-between items-start md:items-center">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2.5 sm:gap-3 w-full">
          <div className="w-full sm:w-[220px]">
            <input
              type="date"
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={format(filterDate, 'yyyy-MM-dd')}
              onChange={(e) => {
                const d = new Date(e.target.value + 'T00:00:00');
                if (!isNaN(d.getTime())) setFilterDate(d);
              }}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto flex-wrap">
            <span className="text-xs text-muted-foreground font-medium hidden sm:inline">Filter:</span>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-full sm:w-[150px] rounded-xl h-10 text-xs">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(dept => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterEmployee} onValueChange={setFilterEmployee}>
              <SelectTrigger className="w-full sm:w-[170px] rounded-xl h-10 text-xs">
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {activeEmployees.map(u => {
                  const uid = toIdText(u.userId || u.id);
                  return (
                    <SelectItem key={uid} value={uid}>{u.name || u.username || uid}</SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[140px] rounded-xl h-10 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="on_leave">On Leave</SelectItem>
                <SelectItem value="half_day">Half Day</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              size="sm"
              className="w-full sm:w-auto h-10 rounded-xl text-xs font-semibold"
              onClick={() => {
                setSearchQuery('');
                setFilterDept('all');
                setFilterEmployee('all');
                setFilterStatus('all');
                setFilterDate(new Date());
                setShowHistory(false);
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-center gap-2 w-full md:w-auto">
          <Button variant="outline" className="w-full sm:w-auto shadow-2xs" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant={showHistory ? "default" : "outline"}
            className="w-full sm:w-auto"
            onClick={() => setShowHistory(prev => !prev)}
          >
            <History className="mr-2 h-4 w-4" />
            {showHistory ? 'Back to Daily' : 'View History'}
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        {/* Mobile cards with 6 per page lazy scroll */}
        <div 
          className="space-y-3 p-4 md:hidden max-h-[520px] overflow-y-auto"
          onScroll={handleTableScroll}
        >
          {paginatedData.map((record) => {
            const status = record.status;
            return (
              <Card key={record.id} className={cn("border border-border shadow-xs", !record.hasRecord && "bg-muted/15")}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight truncate">{record.name}</p>
                      <p className="text-[11px] font-mono text-muted-foreground truncate">{record.userId}</p>
                    </div>
                    <span className={cn(
                      "capitalize px-2 py-0.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1",
                      status === 'present' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300' :
                      status === 'late' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300' :
                      status === 'absent' ? 'bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200' :
                      status === 'on_leave' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300' :
                      'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300'
                    )}>
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        status === 'present' ? 'bg-emerald-500' :
                        status === 'late' ? 'bg-amber-500' :
                        status === 'absent' ? 'bg-red-500' :
                        'bg-blue-500'
                      )} />
                      {status === 'on_leave' ? 'On Leave' : status === 'half_day' ? 'Half Day' : status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide">Date</span>
                      <span className="text-foreground/90 font-mono">{record.date || '--'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide">Department</span>
                      <span className="text-foreground/90">{record.department || '--'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-[10px] uppercase tracking-wide">In / Out & Duration</span>
                      <span className="text-foreground/90 font-mono">
                        {formatTime(record.checkIn)} - {record.checkOut ? formatTime(record.checkOut) : (record.checkIn ? 'Ongoing' : '--')}
                        {record.duration && (
                          <span className="ml-1.5 font-bold text-primary">
                            ({record.duration})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {hasMoreData && (
            <div className="py-2.5 text-center text-xs text-muted-foreground animate-pulse border-t border-border/50">
              Showing {paginatedData.length} of {totalDataCount} — scroll down for next 6
            </div>
          )}
          {paginatedData.length === 0 && (
            <p className="text-center py-6 text-sm text-muted-foreground">
              No attendance records found.
            </p>
          )}
        </div>

        {/* Desktop table with 6 per page lazy scroll */}
        <div 
          className="hidden md:block max-h-[520px] overflow-y-auto"
          onScroll={handleTableScroll}
        >
          <Table>
            <TableHeader className="bg-muted/90 sticky top-0 z-10 backdrop-blur-sm shadow-xs">
              <TableRow>
                {showHistory && <TableHead>Date</TableHead>}
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>In Time</TableHead>
                <TableHead>Out Time</TableHead>
                <TableHead>Working Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Geo-Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.map((record) => {
                  const status = record.status;
                  const inTimeFormatted = formatTime(record.checkIn);
                  const outTimeFormatted = record.checkOut ? formatTime(record.checkOut) : (record.checkIn ? <span className="text-muted-foreground italic">Ongoing</span> : '--');
                  
                  return (
                    <TableRow key={record.id} className={cn("border-b border-border/50 transition-colors", !record.hasRecord && "bg-muted/15")}>
                      {showHistory && <TableCell className="text-muted-foreground font-mono text-xs">{record.date}</TableCell>}
                      <TableCell className="font-mono text-xs text-muted-foreground font-medium truncate max-w-[150px]">
                        {record.userId || '--'}
                      </TableCell>
                      <TableCell className="font-semibold text-foreground">
                        {record.name}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                          {record.department || 'General'}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground">
                        {inTimeFormatted}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground">
                        {outTimeFormatted}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-primary">
                        {record.duration || (record.hasRecord && record.checkIn && !record.checkOut ? 'In progress' : '--')}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "capitalize px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5",
                          status === 'present' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300' :
                          status === 'late' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300' :
                          status === 'absent' ? 'bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200' :
                          status === 'on_leave' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300' :
                          'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300'
                        )}>
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            status === 'present' ? 'bg-emerald-500' :
                            status === 'late' ? 'bg-amber-500' :
                            status === 'absent' ? 'bg-red-500' :
                            'bg-blue-500'
                          )} />
                          {status === 'on_leave' ? 'On Leave' : status === 'half_day' ? 'Half Day' : status}
                        </span>
                      </TableCell>
                      <TableCell>
                          <div className="flex items-center text-muted-foreground text-xs">
                              <MapPin className="h-3 w-3 mr-1 text-muted-foreground/70" />
                              {record.location || '--'}
                          </div>
                      </TableCell>
                    </TableRow>
                  );
              })}
              {paginatedData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={showHistory ? 9 : 8} className="text-center py-16 text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <div className="p-3 rounded-2xl bg-muted/60 mb-3 text-muted-foreground">
                        <Clock className="w-8 h-8 opacity-40" />
                      </div>
                      <p className="font-semibold text-sm text-foreground">No attendance records found</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                        No check-ins logged matching your current filters or date. Try clearing filters or selecting another date.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {hasMoreData && (
            <div className="py-2.5 text-center text-xs text-muted-foreground bg-muted/20 border-t border-border animate-pulse">
              Showing {paginatedData.length} of {totalDataCount} — scroll down for next 6
            </div>
          )}
        </div>

        {/* Summary Footer */}
        <div className="p-3.5 border-t flex items-center justify-between text-xs text-muted-foreground">
          <p>
            Showing {paginatedData.length} of {totalDataCount} entries (6 per batch)
          </p>
          {hasMoreData && (
            <Button
              variant="ghost"
              size="sm"
              onClick={loadMoreData}
              className="h-7 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10"
            >
              Load next 6
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
