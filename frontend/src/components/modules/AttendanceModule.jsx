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
      <div className="max-w-md mx-auto space-y-6 pb-20">
        {/* Header Section */}
        <div className="flex justify-between items-center">
            <div>
                <h2 className="text-xl font-bold">{greeting}</h2>
                <p className="text-muted-foreground">{userProfile?.name || userProfile?.username || (userProfile?.id?.toText ? userProfile.id.toText() : String(userProfile?.id || ''))}</p>
            </div>
            <div className="h-10 w-10 bg-muted rounded-full flex items-center justify-center">
                <User className="h-6 w-6 text-muted-foreground" />
            </div>
        </div>

        {/* Date & Time Card */}
        <Card className="bg-primary text-primary-foreground border-none shadow-lg">
            <CardContent className="p-6 text-center space-y-2">
                <p className="text-primary-foreground/80 text-sm">{format(currentTime, 'EEEE, MMMM d, yyyy')}</p>
                <h1 className="text-4xl font-bold tracking-wider">
                    {format(currentTime, 'hh:mm')}
                    <span className="text-lg ml-1 font-normal">{format(currentTime, 'a')}</span>
                </h1>
                <div className="flex justify-center gap-2 items-center text-primary-foreground/80 text-sm mt-2">
                    <MapPin className="h-4 w-4" />
                    <span>Office Main Location</span>
                </div>
            </CardContent>
        </Card>

        {/* Working Duration Card (Visible when checked in) */}
        {isCheckedIn && (
            <Card className="border-border/60 shadow-sm bg-gradient-to-br from-card via-card to-muted/40 overflow-hidden">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "h-11 w-11 rounded-xl flex items-center justify-center transition-all",
                                isCheckedOut ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                            )}>
                                <Timer className="h-6 w-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-semibold">
                                        {isCheckedOut ? "Total Working Hours" : "Active Working Hours"}
                                    </h4>
                                    <span className={cn(
                                        "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1",
                                        isCheckedOut ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                    )}>
                                        {!isCheckedOut && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                        {isCheckedOut ? "Completed" : "In Progress"}
                                    </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    In: {formatTime(getCheckInTime(todayRecord))}
                                    {isCheckedOut && ` • Out: ${formatTime(getCheckOutTime(todayRecord))}`}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-xl font-extrabold tracking-tight text-foreground font-mono">
                                {isCheckedOut
                                    ? (calculateDuration(getCheckInTime(todayRecord), getCheckOutTime(todayRecord), true) || '0 mins')
                                    : (calculateDuration(getCheckInTime(todayRecord), currentTime, true) || '0 mins')}
                            </span>
                            <p className="text-[11px] text-muted-foreground">
                                {isCheckedOut ? "Check-in to Check-out" : "Elapsed time"}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4">
            <Button 
                className={cn(
                    "h-32 flex flex-col gap-2 rounded-2xl shadow-sm hover:shadow-md transition-all",
                    isCheckedIn ? "bg-muted text-muted-foreground border-2 border-transparent" : "bg-card text-green-600 border-2 border-green-100 dark:border-green-900 hover:border-green-200 hover:bg-green-50 dark:hover:bg-green-900/20"
                )}
                variant="ghost"
                disabled={isCheckedIn || isCheckingIn}
                onClick={handleCheckIn}
            >
                <div className={cn("h-12 w-12 rounded-full flex items-center justify-center", isCheckedIn ? "bg-muted" : "bg-green-100 dark:bg-green-900/30")}>
                    {isCheckingIn ? (
                        <div className="h-6 w-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <LogIn className={cn("h-6 w-6", isCheckedIn ? "text-muted-foreground" : "text-green-600 dark:text-green-400")} />
                    )}
                </div>
                <span className="font-semibold text-lg">{isCheckingIn ? 'Checking In...' : 'Check In'}</span>
                {isCheckedIn && <span className="text-xs">Done at {formatTime(getCheckInTime(todayRecord))}</span>}
            </Button>

            <Button 
                className={cn(
                    "h-32 flex flex-col gap-2 rounded-2xl shadow-sm hover:shadow-md transition-all",
                    !isCheckedIn || isCheckedOut ? "bg-muted text-muted-foreground border-2 border-transparent" : "bg-card text-red-600 border-2 border-red-100 dark:border-red-900 hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20"
                )}
                variant="ghost"
                disabled={!isCheckedIn || isCheckedOut || isCheckingOut}
                onClick={handleCheckOut}
            >
                <div className={cn("h-12 w-12 rounded-full flex items-center justify-center", !isCheckedIn || isCheckedOut ? "bg-muted" : "bg-red-100 dark:bg-red-900/30")}>
                    {isCheckingOut ? (
                        <div className="h-6 w-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <LogOut className={cn("h-6 w-6", !isCheckedIn || isCheckedOut ? "text-muted-foreground" : "text-red-600 dark:text-red-400")} />
                    )}
                </div>
                <span className="font-semibold text-lg">{isCheckingOut ? 'Checking Out...' : 'Check Out'}</span>
                {isCheckedOut && (
                    <div className="flex flex-col items-center">
                        <span className="text-xs">Done at {formatTime(getCheckOutTime(todayRecord))}</span>
                        {calculateDuration(getCheckInTime(todayRecord), getCheckOutTime(todayRecord)) && (
                            <span className="text-[11px] font-bold text-foreground/80">
                                {calculateDuration(getCheckInTime(todayRecord), getCheckOutTime(todayRecord))}
                            </span>
                        )}
                    </div>
                )}
            </Button>
        </div>

        {/* Status Overview */}
        <div className="grid grid-cols-2 gap-4">
             <Card>
                <CardContent className="p-4 flex flex-col items-center justify-center gap-2 text-center">
                    <Clock className="h-6 w-6 text-blue-500" />
                    <span className="text-[12px] whitespace-nowrap text-muted-foreground">{prevMonthName} Attendance</span>
                    <span className="font-bold text-lg">{prevMonthPercentage > 0 ? `${prevMonthPercentage}%` : 'N/A'}</span>
                </CardContent>
            </Card>
             <Card>
                <CardContent className="p-4 flex flex-col items-center justify-center gap-2 text-center">
                    <ListTodo className="h-6 w-6 text-orange-500" />
                    <span className="text-[12px] whitespace-nowrap text-muted-foreground">Pending Tasks</span>
                    <span className="font-bold text-lg">{myPendingTasks}</span>
                </CardContent>
            </Card>
        </div>

        {/* Recent History */}
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="font-bold text-lg">Recent History</h3>
                <Button 
                    variant="link" 
                    className="text-blue-600 h-auto p-0" 
                    onClick={() => setShowAllHistory(!showAllHistory)}
                >
                    {showAllHistory ? "View Less" : "View All"}
                </Button>
            </div>
            
            <div className="space-y-3">
                {(showAllHistory ? userAttendance : userAttendance.slice(0, 5)).map((record) => {
                    const inTime = getCheckInTime(record);
                    const outTime = getCheckOutTime(record);
                    const durationStr = calculateDuration(inTime, outTime, true);
                    return (
                        <div key={record.id || record._id} className="flex items-center justify-between p-3.5 bg-card rounded-xl border border-border shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs">
                                    {new Date(record.date).getDate()}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold text-foreground text-sm">
                                            {record.status === 'present' ? 'Present' : (record.status || 'Present')}
                                        </p>
                                        {durationStr && (
                                            <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-bold">
                                                {durationStr}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {formatTime(inTime)} - {outTime ? formatTime(outTime) : 'Ongoing'}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right flex flex-col items-end gap-1">
                                <span className={cn(
                                    "px-2.5 py-0.5 rounded-full text-xs font-medium capitalize",
                                    record.status === 'present' ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                                )}>
                                    {record.status || 'present'}
                                </span>
                                {durationStr && (
                                    <span className="text-[11px] text-muted-foreground font-mono">
                                        {calculateDuration(inTime, outTime)}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Leave Requests moved to Calendar page */}
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
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Present Today</CardTitle>
            <User className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.present}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Absent Today</CardTitle>
            <User className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.absent}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Late Arrivals</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.late}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">On Leave</CardTitle>
            <Calendar className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.halfDay}</div>
          </CardContent>
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
          <Button className="bg-blue-600 hover:bg-blue-700 text-white w-full md:w-auto" onClick={handleExport}>
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
                      status === 'present' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                      status === 'absent' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                      status === 'late' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                      'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
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
                          "capitalize px-2 py-1 rounded-full text-xs font-medium",
                          status === 'present' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                          status === 'absent' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                          status === 'late' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                          'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
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
                  <TableCell colSpan={showHistory ? 9 : 8} className="text-center py-8 text-muted-foreground">
                    No attendance records found.
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
