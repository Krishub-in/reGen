import { useState, useMemo, useEffect, useCallback } from 'react';
import { useGetAllAttendance, useGetUserAttendance, useRecordAttendance, useUpdateAttendance, useGetAllUsers, useGetAllLeaveRequests, useGetUserLeaveRequests, useApplyLeave, useUpdateLeaveRequest, useGetAllTasks } from '../../hooks/useQueries';
import { useCustomAuth } from '../../hooks/useCustomAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { User, Bell, Clock, Calendar, Download, History, Filter, Search, MapPin, LogIn, LogOut, CheckCircle, ListTodo, ChevronLeft, ChevronRight, Timer } from 'lucide-react';
import { format } from 'date-fns';
import { cn, safeRandomUUID, hasUserRole } from '@/lib/utils';
import { Principal } from '@dfinity/principal';
import { toast } from 'sonner';
import { isTaskExpired } from '@/lib/taskUtils';

export default function AttendanceModule({ userProfile }) {
  const { identity } = useCustomAuth();
  const isAdmin = hasUserRole(userProfile, 'admin') || hasUserRole(userProfile, 'owner') || hasUserRole(userProfile, 'param');
  
  const staffIdObj = userProfile.userId || userProfile.id || identity?.getPrincipal() || null;
  const staffIdStr = typeof staffIdObj === 'string' ? staffIdObj : (staffIdObj?.toText ? staffIdObj.toText() : String(staffIdObj || ''));

  // Queries
  const { data: allAttendance = [] } = useGetAllAttendance();
  const { data: userAttendance = [] } = useGetUserAttendance(staffIdObj || null);
  const { data: myLeaves = [] } = useGetUserLeaveRequests(identity?.getPrincipal() || null);
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

  // Admin filter & pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showHistory, setShowHistory] = useState(false);
  const pageSize = 10;

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

  // -- Admin View Logic --
  const attendanceData = isAdmin ? allAttendance : userAttendance;
  
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
    
    // We treat "present", "late", and "half_day" as partially or fully present for positive attendance reinforcement
    const presentCount = prevMonthRecords.filter(a => a.status === 'present' || a.status === 'late' || a.status === 'half_day').length;
    const percentage = weekdays > 0 ? Math.round((presentCount / weekdays) * 100) : 0;
    
    // Cap at 100% just in case of weekend clock-ins going over
    return { prevMonthName: monthName, prevMonthPercentage: Math.min(percentage, 100) };
  }, [userAttendance]);
  
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todaysRecords = attendanceData.filter(r => r.date === today);
    
    return {
      present: todaysRecords.filter(r => r.status === 'present').length,
      absent: todaysRecords.filter(r => r.status === 'absent').length,
      late: todaysRecords.filter(r => r.status === 'late').length,
      halfDay: todaysRecords.filter(r => r.status === 'half_day').length,
    };
  }, [attendanceData]);

  const getUserDetails = useCallback((principalId) => {
    const pid = typeof principalId === 'string' ? principalId : (principalId?.toText ? principalId.toText() : String(principalId));
    return users.find(u => {
      const uid = u.userId?.toText ? u.userId.toText() : String(u.userId || u.id);
      return uid === pid;
    });
  }, [users]);

  // Dynamic department list from users
  const departments = useMemo(() => {
    const deptSet = new Set();
    users.forEach(u => { if (u.department) deptSet.add(u.department); });
    return [...deptSet].sort();
  }, [users]);

  // Filtered + paginated attendance for admin view
  const filteredAttendance = useMemo(() => {
    let data = [...attendanceData];

    // Date filter — only show selected date unless history mode
    if (!showHistory) {
      const dateStr = format(filterDate, 'yyyy-MM-dd');
      data = data.filter(r => r.date === dateStr);
    }

    // Status filter
    if (filterStatus !== 'all') {
      data = data.filter(r => r.status === filterStatus);
    }

    // Department filter
    if (filterDept !== 'all') {
      data = data.filter(r => {
        const user = getUserDetails(r.userId);
        return user?.department === filterDept;
      });
    }

    // Employee filter
    if (filterEmployee !== 'all') {
      data = data.filter(r => {
        const pid = typeof r.userId === 'string' ? r.userId : (r.userId?.toText ? r.userId.toText() : String(r.userId));
        return pid === filterEmployee;
      });
    }

    // Search query (name, userId)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      data = data.filter(r => {
        const user = getUserDetails(r.userId);
        const name = user?.name?.toLowerCase() || '';
        const dept = user?.department?.toLowerCase() || '';
        const uid = typeof r.userId === 'string' ? r.userId : (r.userId?.toText ? r.userId.toText() : String(r.userId));
        return name.includes(q) || dept.includes(q) || uid.toLowerCase().includes(q);
      });
    }

    // Sort by date descending (newest first)
    data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    return data;
  }, [attendanceData, filterDate, filterStatus, filterDept, filterEmployee, searchQuery, showHistory, users]);

  const totalPages = Math.max(1, Math.ceil(filteredAttendance.length / pageSize));
  const paginatedData = filteredAttendance.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterDate, filterStatus, filterDept, filterEmployee, searchQuery, showHistory]);

  // Export CSV handler
  const handleExport = useCallback(() => {
    if (filteredAttendance.length === 0) {
      toast.error('No records to export');
      return;
    }
    const headers = ['Date', 'Employee', 'Department', 'Status', 'Check In', 'Check Out'];
    const rows = filteredAttendance.map(r => {
      const user = getUserDetails(r.userId);
      return [
        r.date || '',
        user?.name || 'Unknown',
        user?.department || '',
        r.status || '',
        getCheckInTime(r) || '',
        getCheckOutTime(r) || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance_${format(filterDate, 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Attendance report exported');
  }, [filteredAttendance, filterDate]);

  const formatTime = (timeValue) => {
    if (!timeValue) return '--';
    try {
      // If it's a BigInt (nanoseconds)
      if (typeof timeValue === 'bigint') {
        const ms = Number(timeValue) / 1000000; // nanoseconds -> ms
        const d = new Date(ms);
        if (isNaN(d.getTime())) return '--';
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      // If it's a string
      if (typeof timeValue === 'string') {
        // If string is all digits, treat as epoch (ns or ms)
        if (/^\d+$/.test(timeValue)) {
          const asBig = BigInt(timeValue);
          const ms = Number(asBig) / 1000000;
          const d = new Date(ms);
          if (isNaN(d.getTime())) return '--';
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        // Otherwise assume ISO date string
        const d = new Date(timeValue);
        if (isNaN(d.getTime())) return '--';
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      // If it's a number, check if nanoseconds
      if (typeof timeValue === 'number') {
        let ms = timeValue;
        if (timeValue > 10000000000) {
          ms = timeValue / 1000000; // nanoseconds -> ms
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

  // -- User/Mobile View Logic --
  const todayStr = format(currentTime, 'yyyy-MM-dd');
  const todayRecord = userAttendance.find(r => r.date === todayStr || (typeof r.date === 'string' && r.date.startsWith(todayStr)));
  const isCheckedIn = !!todayRecord;
  const isCheckedOut = todayRecord && !!getCheckOutTime(todayRecord);

  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const handleCheckIn = async () => {
    if (!identity) {
      toast.error('Please login first');
      return;
    }
    if (isCheckingIn || isCheckedIn) return;

    setIsCheckingIn(true);

    const doCheckIn = async (locationStr = '') => {
      try {
        const now = new Date();
        const payload = {
          id: safeRandomUUID(),
          userId: staffIdStr,
          date: todayStr,
          checkIn: now.toISOString(),
          status: 'present',
          workMode: 'office',
          location: locationStr,
          notes: ''
        };

        await recordAttendance.mutateAsync(payload);
        toast.success('Check-in successful!');
      } catch (error) {
        console.error('Check-in failed:', error);
        toast.error(`Check-in failed: ${error.message || 'Please try again.'}`);
      } finally {
        setIsCheckingIn(false);
      }
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation && window.isSecureContext) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          doCheckIn(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        },
        (error) => {
          console.warn('Geolocation unavailable:', error.message);
          doCheckIn('');
        },
        { timeout: 3000, enableHighAccuracy: false }
      );
    } else {
      doCheckIn('');
    }
  };

  const handleCheckOut = async () => {
    if (!todayRecord || !identity) {
      toast.error('Please check in first before checking out');
      return;
    }
    if (isCheckingOut || isCheckedOut) return;

    setIsCheckingOut(true);
    const now = new Date();

    try {
      await updateAttendance.mutateAsync({
        ...todayRecord,
        userId: staffIdStr,
        checkOut: now.toISOString(),
      });
      toast.success('Check-out successful!');
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
          <div className="flex items-center gap-2">
            <span className={cn(
              "px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5",
              isCheckedIn && !isCheckedOut
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                : isCheckedOut
                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                : "bg-muted text-muted-foreground border border-border"
            )}>
              <span className={cn(
                "w-2 h-2 rounded-full",
                isCheckedIn && !isCheckedOut ? "bg-emerald-500 animate-pulse" : isCheckedOut ? "bg-purple-500" : "bg-muted-foreground"
              )} />
              {isCheckedIn && !isCheckedOut ? "Clocked In & Active" : isCheckedOut ? "Shift Completed" : "Not Clocked In"}
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
                <MapPin className="h-3 w-3" /> Office Main
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
            onClick={!isCheckedIn && !isCheckingIn ? handleCheckIn : undefined}
            className={cn(
              "p-6 rounded-2xl border transition-all duration-200 flex items-center justify-between",
              isCheckedIn
                ? "bg-secondary/40 border-border opacity-80 cursor-default"
                : "bg-card border-border hover:border-emerald-500/50 hover:shadow-md cursor-pointer group"
            )}
          >
            <div className="flex items-center gap-4">
              <div className={cn(
                "h-14 w-14 rounded-2xl flex items-center justify-center transition-all",
                isCheckedIn ? "bg-muted text-muted-foreground" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white"
              )}>
                {isCheckingIn ? (
                  <div className="h-6 w-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <LogIn className="h-7 w-7" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {isCheckingIn ? 'Checking In...' : isCheckedIn ? 'Checked In' : 'Check In'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isCheckedIn ? `Punched in at ${formatTime(getCheckInTime(todayRecord))}` : 'Tap here to mark your arrival for today'}
                </p>
              </div>
            </div>
            <Button
              disabled={isCheckedIn || isCheckingIn}
              className={cn(
                "rounded-xl px-5 h-10 font-semibold shadow-xs",
                isCheckedIn ? "bg-muted text-muted-foreground" : "bg-emerald-600 hover:bg-emerald-700 text-white"
              )}
            >
              {isCheckedIn ? 'Done' : 'Check In'}
            </Button>
          </div>

          {/* Check Out Action Card */}
          <div
            onClick={isCheckedIn && !isCheckedOut && !isCheckingOut ? handleCheckOut : undefined}
            className={cn(
              "p-6 rounded-2xl border transition-all duration-200 flex items-center justify-between",
              !isCheckedIn || isCheckedOut
                ? "bg-secondary/40 border-border opacity-80 cursor-default"
                : "bg-card border-border hover:border-red-500/50 hover:shadow-md cursor-pointer group"
            )}
          >
            <div className="flex items-center gap-4">
              <div className={cn(
                "h-14 w-14 rounded-2xl flex items-center justify-center transition-all",
                !isCheckedIn || isCheckedOut ? "bg-muted text-muted-foreground" : "bg-red-500/10 text-red-600 dark:text-red-400 group-hover:bg-red-500 group-hover:text-white"
              )}>
                {isCheckingOut ? (
                  <div className="h-6 w-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <LogOut className="h-7 w-7" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {isCheckingOut ? 'Checking Out...' : isCheckedOut ? 'Checked Out' : 'Check Out'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isCheckedOut
                    ? `Punched out at ${formatTime(getCheckOutTime(todayRecord))}`
                    : isCheckedIn
                    ? 'Tap here when you finish your shift'
                    : 'Check in required first'}
                </p>
              </div>
            </div>
            <Button
              disabled={!isCheckedIn || isCheckedOut || isCheckingOut}
              className={cn(
                "rounded-xl px-5 h-10 font-semibold shadow-xs",
                !isCheckedIn || isCheckedOut ? "bg-muted text-muted-foreground" : "bg-red-600 hover:bg-red-700 text-white"
              )}
            >
              {isCheckedOut ? 'Done' : 'Check Out'}
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
                  {(showAllHistory ? userAttendance : userAttendance.slice(0, 8)).map((record) => {
                    const inTime = getCheckInTime(record);
                    const outTime = getCheckOutTime(record);
                    const durationStr = calculateDuration(inTime, outTime, true);
                    return (
                      <TableRow key={record.id || record._id} className="border-b border-border/50">
                        <TableCell className="pl-6 py-3.5 font-medium text-foreground text-sm">
                          {record.date || (inTime ? format(new Date(inTime), 'yyyy-MM-dd') : '--')}
                        </TableCell>
                        <TableCell className="py-3.5">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize",
                            record.status === 'present'
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                              : "bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200"
                          )}>
                            {record.status || 'present'}
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
                  {userAttendance.length === 0 && (
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
        <h2 className="text-xl md:text-2xl font-bold leading-tight">
          {showHistory ? 'Attendance History' : 'Daily Attendance Overview'}
        </h2>
        <div className="flex items-center gap-2">
            <div className="relative flex-1 md:flex-none">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search employees..."
                  className="pl-9 w-full md:w-[250px]"
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
          <p className="text-[11px] text-muted-foreground mt-1">Clocked in</p>
        </Card>
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Absent Today</span>
            <div className="p-2 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
              <User className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground mt-2">{stats.absent}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Unexcused / Absent</p>
        </Card>
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Late Arrivals</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground mt-2">{stats.late}</div>
          <p className="text-[11px] text-muted-foreground mt-1">After shift start</p>
        </Card>
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">On Leave</span>
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
            {(() => {
              const totalLogged = stats.present + stats.absent + stats.late + stats.halfDay;
              return totalLogged > 0 ? `${Math.round(((stats.present + stats.late) / totalLogged) * 100)}%` : '100%';
            })()}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Today's turnout</p>
        </Card>
      </div>

      {/* Filters and Actions */}
      <div className="flex flex-col gap-4 justify-between items-start md:items-center">
        <div className="flex flex-col md:flex-row md:flex-wrap gap-3 w-full">
          <div className="w-full md:w-[240px]">
            <input
              type="date"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={format(filterDate, 'yyyy-MM-dd')}
              onChange={(e) => {
                const d = new Date(e.target.value + 'T00:00:00');
                if (!isNaN(d.getTime())) setFilterDate(d);
              }}
            />
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full">
            <span className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Filter by:</span>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-full md:w-[150px]">
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
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {users.map(u => {
                  const uid = u.userId?.toText ? u.userId.toText() : String(u.userId || u.id);
                  return (
                    <SelectItem key={uid} value={uid}>{u.name || u.username || uid}</SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full md:w-[140px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="half_day">Half Day</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              size="sm"
              className="w-full md:w-auto"
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

        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
          <Button className="bg-[#0D9488] hover:bg-[#0F766E] text-white w-full md:w-auto shadow-sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
          <Button
            variant={showHistory ? "default" : "outline"}
            className="w-full md:w-auto"
            onClick={() => setShowHistory(prev => !prev)}
          >
            <History className="mr-2 h-4 w-4" />
            {showHistory ? 'Back to Daily' : 'View History'}
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        {/* Mobile cards */}
        <div className="space-y-3 p-4 md:hidden">
          {paginatedData.map((record) => {
            const user = getUserDetails(record.userId);
            const status = record.status;
            const idText = user?.id?.toText ? user.id.toText() : (record.userId?.toText ? record.userId.toText() : String(record.userId));
            return (
              <Card key={record.id || record._id} className="border border-border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight truncate">{user?.name || user?.username || '--'}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{idText}</p>
                    </div>
                    <span className={cn(
                      "capitalize px-2 py-0.5 rounded-full text-[11px] font-medium",
                      status === 'present' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300' :
                      status === 'absent' ? 'bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200' :
                      status === 'late' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300' :
                      'bg-primary/15 text-primary border border-primary/20'
                    )}>
                      {status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide">Date</span>
                      <span className="text-foreground/90">{record.date || '--'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide">Department</span>
                      <span className="text-foreground/90">{user?.department || '--'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-[10px] uppercase tracking-wide">In / Out & Duration</span>
                      <span className="text-foreground/90">
                        {formatTime(getCheckInTime(record))} - {getCheckOutTime(record) ? formatTime(getCheckOutTime(record)) : '--'}
                        {calculateDuration(getCheckInTime(record), getCheckOutTime(record)) && (
                          <span className="ml-1.5 font-bold text-primary">
                            ({calculateDuration(getCheckInTime(record), getCheckOutTime(record))})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {paginatedData.length === 0 && (
            <p className="text-center py-6 text-sm text-muted-foreground">
              No attendance records found.
            </p>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                {showHistory && <TableHead>Date</TableHead>}
                <TableHead>Employee</TableHead>
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
                  const user = getUserDetails(record.userId);
                  const status = record.status;
                  return (
                    <TableRow key={record.id || record._id}>
                      {showHistory && <TableCell className="text-muted-foreground">{record.date}</TableCell>}
                      <TableCell className="font-medium">{user?.id?.toText ? user.id.toText() : (record.userId?.toText ? record.userId.toText() : String(record.userId))}</TableCell>
                      <TableCell>{user?.name || user?.username || '--'}</TableCell>
                      <TableCell>{user?.department || '--'}</TableCell>
                      <TableCell>{formatTime(getCheckInTime(record))}</TableCell>
                      <TableCell>{getCheckOutTime(record) ? formatTime(getCheckOutTime(record)) : '--'}</TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-primary">
                        {calculateDuration(getCheckInTime(record), getCheckOutTime(record)) || '--'}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "capitalize px-2.5 py-1 rounded-full text-xs font-semibold",
                          status === 'present' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300' :
                          status === 'absent' ? 'bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200' :
                          status === 'late' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300' :
                          'bg-primary/15 text-primary border border-primary/20'
                        )}>
                          {status}
                        </span>
                      </TableCell>
                      <TableCell>
                          <div className="flex items-center text-muted-foreground">
                              <MapPin className="h-3 w-3 mr-1" />
                              {record.location || 'Office Main'}
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

          {/* Pagination */}
          <div className="p-4 border-t flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {filteredAttendance.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredAttendance.length)} of {filteredAttendance.length} entries
              </p>
              <div className="flex gap-2 items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-sm font-medium px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
              </div>
          </div>
        </div>

        {/* Mobile pagination */}
        <div className="p-4 border-t flex items-center justify-between md:hidden">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
