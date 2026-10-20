import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  useGetAllUsers, useGetUserAttendance, useGetUserLeaveRequests, 
  useGetUserPayments, useGetAllAttendance, useGetAllTasks, useGetAllLeaveRequests 
} from '../../hooks/useQueries';
import { useCustomAuth } from '../../hooks/useCustomAuth';
import { 
  Users, Building2, UserCheck, Search, MoreVertical, CheckCircle2, ArrowUpRight, Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip 
} from 'recharts';

export default function DashboardHome({ userProfile, onNavigate }) {
  const { identity } = useCustomAuth();
  const currentUserId = userProfile?.userId || userProfile?.id || userProfile?.StaffId || identity?.getPrincipal() || null;
  const { data: users = [] } = useGetAllUsers();
  const { data: attendance = [] } = useGetUserAttendance(currentUserId);
  const { data: userLeaves = [] } = useGetUserLeaveRequests(currentUserId);
  const { data: allLeaves = [] } = useGetAllLeaveRequests();
  const { data: payments = [] } = useGetUserPayments(currentUserId);
  const { data: allAttendance = [] } = useGetAllAttendance();
  const { data: allTasks = [] } = useGetAllTasks();

  const [trendRange, setTrendRange] = useState('week');
  const [empSearch, setEmpSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const isAdmin = userProfile?.role?.hasOwnProperty('admin') || userProfile?.role === 'admin';
  const isOwner = userProfile?.role?.hasOwnProperty('owner') || userProfile?.role?.hasOwnProperty('param') || userProfile?.role === 'owner' || userProfile?.role === 'param';
  const isStaff = userProfile?.role?.hasOwnProperty('staff') || userProfile?.role?.hasOwnProperty('intern') || userProfile?.role?.hasOwnProperty('freelancer') || userProfile?.role === 'staff';

  const isCompanyLogin = useMemo(() => {
    if (!userProfile?.role) return false;
    const r = userProfile.role;
    if (typeof r === 'string') {
      const lower = r.toLowerCase();
      return lower === 'owner' || lower === 'admin' || lower === 'param' || lower === 'company';
    }
    if (typeof r === 'object') {
      return Boolean(r.owner || r.admin || r.param || r.company || r.hasOwnProperty('owner') || r.hasOwnProperty('admin') || r.hasOwnProperty('param') || r.hasOwnProperty('company'));
    }
    return false;
  }, [userProfile]);

  // Helper to determine if a role represents an owner / company head
  const isOwnerRole = useCallback((role) => {
    if (!role) return false;
    if (typeof role === 'string') {
      const lower = role.toLowerCase().trim();
      return lower === 'owner' || lower === 'param';
    }
    if (typeof role === 'object') {
      const keys = Object.keys(role).map(k => k.toLowerCase());
      return keys.includes('owner') || keys.includes('param');
    }
    return false;
  }, []);

  const toIdText = useCallback((val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val.toText) return val.toText();
    return String(val);
  }, []);

  // Filter employees excluding the owner
  const activeCompanyEmployees = useMemo(() => {
    return users.filter(u => !isOwnerRole(u.role));
  }, [users, isOwnerRole]);

  // Real employee count strictly without the owner
  const totalEmployeesCount = activeCompanyEmployees.length;

  const employeeIdSet = useMemo(() => {
    return new Set(
      activeCompanyEmployees.map(u => toIdText(u.userId || u.id))
    );
  }, [activeCompanyEmployees, toIdText]);

  const departmentsList = useMemo(() => {
    return Array.from(new Set(activeCompanyEmployees.map(u => u.department).filter(Boolean)));
  }, [activeCompanyEmployees]);
  const totalDepartments = departmentsList.length;

  const myIdStr = toIdText(currentUserId);

  // Real Today's Attendance Stats
  const todayDate = new Date().toISOString().split('T')[0];
  const todayAttendance = useMemo(() => {
    return allAttendance.filter(a => {
      if (!a.date) return false;
      const aDate = typeof a.date === 'string' ? a.date.split('T')[0] : new Date(a.date).toISOString().split('T')[0];
      return aDate === todayDate;
    });
  }, [allAttendance, todayDate]);

  const activeUsersToday = useMemo(() => {
    const presentUsers = todayAttendance
      .filter(a => a.status === 'present' || a.status === 'late' || a.status === 'half_day')
      .map(a => toIdText(a.userId));
    const matched = employeeIdSet.size > 0
      ? presentUsers.filter(id => employeeIdSet.has(id))
      : presentUsers;
    return new Set(matched).size;
  }, [todayAttendance, employeeIdSet, toIdText]);

  // Today's check-in status for user dashboard
  const userTodayStatus = useMemo(() => {
    const source = allAttendance.length > 0 ? allAttendance : attendance;
    const todayRec = source.find(a => {
      if (!a.date) return false;
      const aDate = typeof a.date === 'string' ? a.date.split('T')[0] : new Date(a.date).toISOString().split('T')[0];
      return aDate === todayDate && toIdText(a.userId) === myIdStr;
    });
    if (!todayRec) return 'Not Checked In';
    if (todayRec.status === 'present') return 'Present';
    if (todayRec.status === 'late') return 'Late';
    if (todayRec.status === 'half_day') return 'Half Day';
    if (todayRec.status === 'absent') return 'Absent';
    return 'Checked In';
  }, [allAttendance, attendance, todayDate, myIdStr, toIdText]);

  // Dynamic Attendance Breakdown (Present, Absent, Late, Rate) for Week, Month, Year
  // - In Company dashboard: calculates across ALL company employees (excluding owner)
  // - In User dashboard: calculates specifically for THAT employee
  const rateBreakdown = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDate = now.getDate();

    let targetDates = [];
    if (trendRange === 'week') {
      const dayOfWeek = (now.getDay() + 6) % 7; // Mon=0 ... Sun=6
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek);
      monday.setHours(0, 0, 0, 0);

      for (let i = 0; i <= dayOfWeek; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        if (d.getDay() !== 0) { // Exclude Sunday
          targetDates.push(d.toISOString().split('T')[0]);
        }
      }
    } else if (trendRange === 'month') {
      for (let day = 1; day <= currentDate; day++) {
        const d = new Date(currentYear, currentMonth, day);
        if (d.getDay() !== 0) {
          targetDates.push(d.toISOString().split('T')[0]);
        }
      }
    } else { // year
      const cur = new Date(currentYear, 0, 1);
      const endDay = new Date(now);
      endDay.setHours(0, 0, 0, 0);
      while (cur <= endDay) {
        if (cur.getDay() !== 0) {
          targetDates.push(cur.toISOString().split('T')[0]);
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    const targetDatesSet = new Set(targetDates);
    const totalWorkingDays = targetDates.length || 1;

    if (isCompanyLogin) {
      // Company view: all non-owner employees
      const relevantRecords = allAttendance.filter(a => {
        if (!a.date) return false;
        const dIso = typeof a.date === 'string' ? a.date.split('T')[0] : new Date(a.date).toISOString().split('T')[0];
        if (!targetDatesSet.has(dIso)) return false;
        const uid = toIdText(a.userId);
        return employeeIdSet.size > 0 ? employeeIdSet.has(uid) : true;
      });

      const present = relevantRecords.filter(r => r.status === 'present' || r.status === 'half_day').length;
      const late = relevantRecords.filter(r => r.status === 'late').length;
      const attended = present + late;
      const totalExpected = (totalEmployeesCount || 1) * totalWorkingDays;
      const absent = Math.max(0, totalExpected - attended);
      const rate = totalExpected > 0 ? Math.min(100, Math.round((attended / totalExpected) * 100)) : 0;

      return { present, absent, late, rate };
    } else {
      // User view: only this employee
      const mySourceAttendance = allAttendance.length > 0 ? allAttendance : attendance;
      const myRecords = mySourceAttendance.filter(a => {
        const uid = toIdText(a.userId);
        return uid === myIdStr;
      });

      const recordsInRange = myRecords.filter(a => {
        if (!a.date) return false;
        const dIso = typeof a.date === 'string' ? a.date.split('T')[0] : new Date(a.date).toISOString().split('T')[0];
        return targetDatesSet.has(dIso);
      });

      const present = recordsInRange.filter(r => r.status === 'present' || r.status === 'half_day').length;
      const late = recordsInRange.filter(r => r.status === 'late').length;
      const attended = present + late;
      const absent = Math.max(0, totalWorkingDays - attended);
      const rate = totalWorkingDays > 0 ? Math.min(100, Math.round((attended / totalWorkingDays) * 100)) : 0;

      return { present, absent, late, rate };
    }
  }, [trendRange, isCompanyLogin, allAttendance, attendance, employeeIdSet, totalEmployeesCount, myIdStr, toIdText]);

  // Real Attendance Trend computed from actual records
  const trendData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7; // Mon=0 ... Sun=6
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const sourceRecords = isCompanyLogin
      ? allAttendance.filter(a => {
          const uid = toIdText(a.userId);
          return employeeIdSet.size > 0 ? employeeIdSet.has(uid) : true;
        })
      : (allAttendance.length > 0 ? allAttendance : attendance).filter(a => toIdText(a.userId) === myIdStr);

    const divisor = isCompanyLogin ? (totalEmployeesCount || 1) : 1;

    // 1. Week trend (Mon-Sun of current week)
    const weekList = days.map((name, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dIso = d.toISOString().split('T')[0];

      const recordsOnDay = sourceRecords.filter(a => {
        if (!a.date) return false;
        const aDate = typeof a.date === 'string' ? a.date.split('T')[0] : new Date(a.date).toISOString().split('T')[0];
        return aDate === dIso;
      });

      const attendedCount = isCompanyLogin
        ? new Set(
            recordsOnDay
              .filter(r => r.status === 'present' || r.status === 'late' || r.status === 'half_day')
              .map(r => toIdText(r.userId))
          ).size
        : recordsOnDay.filter(r => r.status === 'present' || r.status === 'late' || r.status === 'half_day').length;

      const rate = Math.min(100, Math.round((attendedCount / divisor) * 100));
      return { name, rate, date: dIso, present: attendedCount };
    });

    // 2. Month trend (Weeks 1 to 4 of current month)
    const year = now.getFullYear();
    const month = now.getMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const monthWeeks = [
      { name: 'Week 1', start: 1, end: 7 },
      { name: 'Week 2', start: 8, end: 14 },
      { name: 'Week 3', start: 15, end: 21 },
      { name: 'Week 4', start: 22, end: lastDayOfMonth },
    ];

    const monthList = monthWeeks.map(w => {
      const recordsInWeek = sourceRecords.filter(a => {
        if (!a.date) return false;
        const d = new Date(a.date);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() >= w.start && d.getDate() <= w.end;
      });

      const dateSet = new Set(
        recordsInWeek.map(a => typeof a.date === 'string' ? a.date.split('T')[0] : new Date(a.date).toISOString().split('T')[0])
      );
      const totalPossible = (dateSet.size || 1) * divisor;

      const attended = recordsInWeek.filter(r => r.status === 'present' || r.status === 'late' || r.status === 'half_day').length;
      const rate = totalPossible > 0 ? Math.min(100, Math.round((attended / totalPossible) * 100)) : 0;
      return { name: w.name, rate };
    });

    // 3. Year trend (Q1, Q2, Q3, Q4)
    const quarters = [
      { name: 'Q1', months: [0, 1, 2] },
      { name: 'Q2', months: [3, 4, 5] },
      { name: 'Q3', months: [6, 7, 8] },
      { name: 'Q4', months: [9, 10, 11] },
    ];

    const yearList = quarters.map(q => {
      const recordsInQuarter = sourceRecords.filter(a => {
        if (!a.date) return false;
        const d = new Date(a.date);
        return d.getFullYear() === year && q.months.includes(d.getMonth());
      });

      const dateSet = new Set(
        recordsInQuarter.map(a => typeof a.date === 'string' ? a.date.split('T')[0] : new Date(a.date).toISOString().split('T')[0])
      );
      const totalPossible = (dateSet.size || 1) * divisor;

      const attended = recordsInQuarter.filter(r => r.status === 'present' || r.status === 'late' || r.status === 'half_day').length;
      const rate = totalPossible > 0 ? Math.min(100, Math.round((attended / totalPossible) * 100)) : 0;
      return { name: q.name, rate };
    });

    return {
      week: weekList,
      month: monthList,
      year: yearList,
    };
  }, [allAttendance, attendance, isCompanyLogin, totalEmployeesCount, employeeIdSet, myIdStr, toIdText]);

  const currentTrendData = trendData[trendRange] || trendData.week;

  // Filtered employees for table (strictly without owner)
  const displayedEmployees = useMemo(() => {
    let list = activeCompanyEmployees;
    if (empSearch.trim()) {
      const q = empSearch.toLowerCase();
      list = list.filter(u => {
        const name = (u.name || `${u.firstName || ''} ${u.lastName || ''}`).toLowerCase();
        const dept = (u.department || '').toLowerCase();
        const role = (u.designation || Object.keys(u.role || {})[0] || '').toLowerCase();
        return name.includes(q) || dept.includes(q) || role.includes(q);
      });
    }
    if (deptFilter !== 'all') {
      list = list.filter(u => u.department === deptFilter);
    }
    if (statusFilter !== 'all') {
      list = list.filter(u => (statusFilter === 'active' ? !u.isSuspended : u.isSuspended));
    }
    return list.slice(0, 5);
  }, [activeCompanyEmployees, empSearch, deptFilter, statusFilter]);

  const formatLeaveRange = (start, end) => {
    if (!start) return 'Upcoming';
    try {
      const sd = new Date(start);
      if (isNaN(sd.getTime())) return start;
      const opts = { day: '2-digit', month: 'short' };
      const sStr = sd.toLocaleDateString('en-GB', opts);
      if (!end) return sStr;
      const ed = new Date(end);
      if (isNaN(ed.getTime()) || sd.getTime() === ed.getTime()) return sStr;
      const eStr = ed.toLocaleDateString('en-GB', opts);
      return `${sStr} – ${eStr}`;
    } catch {
      return `${start}${end ? ' - ' + end : ''}`;
    }
  };

  const formatLeaveType = (type) => {
    if (!type) return 'Leave';
    if (typeof type === 'string') return type.charAt(0).toUpperCase() + type.slice(1);
    if (typeof type === 'object') {
      const key = Object.keys(type)[0];
      if (key) return key.charAt(0).toUpperCase() + key.slice(1);
    }
    return String(type);
  };

  // Real Upcoming Leaves:
  // - Company view: shows any employee who applied for leave with their actual name
  // - User view: shows only the leaves the logged-in user applied for
  const upcomingLeavesList = useMemo(() => {
    const rawLeaves = isCompanyLogin ? allLeaves : userLeaves;
    if (!Array.isArray(rawLeaves) || rawLeaves.length === 0) return [];

    const todayAtMidnight = new Date();
    todayAtMidnight.setHours(0, 0, 0, 0);

    const filtered = rawLeaves.filter(l => {
      const status = typeof l.status === 'string' ? l.status.toLowerCase() : Object.keys(l.status || {})[0]?.toLowerCase();
      if (status === 'rejected') return false;

      if (!l.endDate && !l.startDate) return true;
      const d = new Date(l.endDate || l.startDate);
      if (isNaN(d.getTime())) return true;
      return d >= todayAtMidnight;
    });

    const sorted = [...filtered].sort((a, b) => {
      const da = new Date(a.startDate || 0).getTime();
      const db = new Date(b.startDate || 0).getTime();
      return da - db;
    });

    return sorted.slice(0, 5).map(l => {
      const uid = toIdText(l.userId || l.staffId || l.applicantId);
      const employee = users.find(u => toIdText(u.userId || u.id) === uid);

      const empName = isCompanyLogin
        ? (employee?.name || `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || employee?.username || l.displayId || 'Team Member')
        : (userProfile?.name || `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim() || 'My Leave');

      const avatar = employee?.avatar || userProfile?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${empName}`;
      const leaveType = formatLeaveType(l.leaveType || l.type || 'Annual Leave');
      const status = typeof l.status === 'string' ? l.status : Object.keys(l.status || {})[0] || 'pending';
      const range = formatLeaveRange(l.startDate, l.endDate);

      return {
        id: l._id || l.id || Math.random(),
        name: empName,
        type: leaveType,
        status: status,
        range: range,
        avatar: avatar,
      };
    });
  }, [isCompanyLogin, allLeaves, userLeaves, users, userProfile, toIdText]);

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Welcome Greeting Banner (Matching Reference Image) */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          Welcome back, {userProfile?.name ? userProfile.name.split(' ')[0] : 'Vishwa'}!
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Here's your team overview for today.
        </p>
      </div>

      {/* 2. Top 4 Stats Cards Grid (Matching Reference Image) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Total Employees */}
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-5 relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Employees</p>
              <h3 className="text-3xl font-bold tracking-tight text-foreground mt-2">{totalEmployeesCount}</h3>
              <div className="mt-3 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  <ArrowUpRight className="w-3 h-3" /> +12%
                </span>
                <span className="text-[11px] text-muted-foreground">from last month</span>
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-secondary/80 text-muted-foreground">
              <Users className="w-5 h-5 text-primary" />
            </div>
          </div>
        </Card>

        {/* Departments */}
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-5 relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Departments</p>
              <h3 className="text-3xl font-bold tracking-tight text-foreground mt-2">{totalDepartments}</h3>
              <div className="mt-3 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> 1 new
                </span>
                <span className="text-[11px] text-muted-foreground">added recently</span>
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-secondary/80 text-muted-foreground">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
          </div>
        </Card>

        {/* Active Staff Today / User Check-in Status */}
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-5 relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                {isCompanyLogin ? 'Active Staff Today' : 'Today\'s Status'}
              </p>
              <h3 className="text-2xl font-bold tracking-tight text-foreground mt-2">
                {isCompanyLogin ? activeUsersToday : userTodayStatus}
              </h3>
              <div className="mt-3 flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-muted-foreground">
                  <strong className="text-foreground font-semibold">{rateBreakdown.rate}%</strong> {isCompanyLogin ? `${trendRange} team rate` : `${trendRange} rate`}
                </span>
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-secondary/80 text-muted-foreground">
              <UserCheck className="w-5 h-5 text-primary" />
            </div>
          </div>
        </Card>

        {/* Attendance Rate (Circular Donut with Week, Month, Year breakdown) */}
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isCompanyLogin ? 'Attendance Rate' : 'My Attendance'}
            </p>
            <div className="flex items-center gap-0.5 bg-secondary/80 p-0.5 rounded-lg border border-border text-[10px] font-semibold">
              <button
                type="button"
                onClick={() => setTrendRange('week')}
                className={cn("px-1.5 py-0.5 rounded transition-all", trendRange === 'week' ? "bg-card text-foreground shadow-2xs font-bold" : "text-muted-foreground hover:text-foreground")}
              >
                Week
              </button>
              <button
                type="button"
                onClick={() => setTrendRange('month')}
                className={cn("px-1.5 py-0.5 rounded transition-all", trendRange === 'month' ? "bg-card text-foreground shadow-2xs font-bold" : "text-muted-foreground hover:text-foreground")}
              >
                Month
              </button>
              <button
                type="button"
                onClick={() => setTrendRange('year')}
                className={cn("px-1.5 py-0.5 rounded transition-all", trendRange === 'year' ? "bg-card text-foreground shadow-2xs font-bold" : "text-muted-foreground hover:text-foreground")}
              >
                Year
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mt-1">
            <div className="relative w-20 h-20 sm:w-22 sm:h-22 flex items-center justify-center shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-secondary stroke-current"
                  strokeWidth="3.5"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-primary stroke-current transition-all duration-700"
                  strokeDasharray={`${rateBreakdown.rate}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg sm:text-xl font-bold tracking-tight text-foreground">{rateBreakdown.rate}%</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 text-xs flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground text-[11px] truncate">
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0" /> Present
                </span>
                <span className="font-semibold text-foreground text-[11px] ml-1">{rateBreakdown.present}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground text-[11px] truncate">
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" /> Absent
                </span>
                <span className="font-semibold text-foreground text-[11px] ml-1">{rateBreakdown.absent}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground text-[11px] truncate">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" /> Late
                </span>
                <span className="font-semibold text-foreground text-[11px] ml-1">{rateBreakdown.late}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* 3. Middle Row: Attendance Trend */}
      <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-foreground">Attendance Trend</h3>
          <div className="flex items-center gap-1 bg-secondary/80 p-0.5 rounded-lg border border-border text-[10px] font-semibold">
            <button
              onClick={() => setTrendRange('week')}
              className={cn("px-2 py-0.5 rounded-md transition-all", trendRange === 'week' ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground")}
            >
              Week
            </button>
            <button
              onClick={() => setTrendRange('month')}
              className={cn("px-2 py-0.5 rounded-md transition-all", trendRange === 'month' ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground")}
            >
              Month
            </button>
            <button
              onClick={() => setTrendRange('year')}
              className={cn("px-2 py-0.5 rounded-md transition-all", trendRange === 'year' ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground")}
            >
              Year
            </button>
          </div>
        </div>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={currentTrendData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0D9488" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0D9488" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'var(--card)', 
                  borderColor: 'var(--border)', 
                  borderRadius: '0.75rem', 
                  fontSize: '11px',
                  color: 'var(--foreground)'
                }} 
              />
              <Area type="monotone" dataKey="rate" stroke="#0D9488" strokeWidth={2.5} fillOpacity={1} fill="url(#emeraldGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 4. Bottom Row: Employees Table (col-span-2) + Upcoming Leaves (col-span-1) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Employees Table (col-span-2) */}
        <Card className="lg:col-span-2 border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden">
          <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-base font-bold text-foreground">Employees</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  className="h-8 pl-8 pr-3 text-xs rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-28 sm:w-36"
                />
              </div>

              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="h-8 px-2.5 text-xs rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Departments</option>
                {departmentsList.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 px-2.5 text-xs rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
              </select>

              {/* + Add Employee only shown for company/owner dashboard, removed for user dashboard */}
              {isCompanyLogin && (
                <Button
                  onClick={() => onNavigate('users')}
                  size="sm"
                  className="h-8 bg-primary hover:bg-[#0F766E] text-white font-semibold rounded-xl text-xs px-3 shadow-xs"
                >
                  + Add Employee
                </Button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/40 border-b border-border text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-5">Name</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Joining Date</th>
                  <th className="py-3 px-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {displayedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                      No employees found
                    </td>
                  </tr>
                ) : (
                  displayedEmployees.map((emp, idx) => {
                    const name = emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Employee';
                    const avatar = emp.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
                    const dept = emp.department || 'Engineering';
                    const role = emp.designation || (typeof emp.role === 'string' ? emp.role : Object.keys(emp.role || {})[0]) || 'Staff';
                    const isActive = !emp.isSuspended;
                    const joinDate = emp.joiningDate ? new Date(emp.joiningDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '12 Jan 2024';

                    return (
                      <tr key={emp._id || emp.id || idx} className="hover:bg-teal-500/[0.04] dark:hover:bg-teal-400/[0.06] transition-colors">
                        <td className="py-3 px-5 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-muted border border-border shrink-0">
                            <img src={avatar} alt="" className="w-full h-full object-cover" />
                          </div>
                          <span className="font-semibold text-foreground text-xs">{name}</span>
                        </td>
                        <td className="py-3 px-4 text-foreground/90">{dept}</td>
                        <td className="py-3 px-4 text-muted-foreground">{role}</td>
                        <td className="py-3 px-4">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-semibold border",
                            isActive
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          )}>
                            {isActive ? 'Active' : 'Pending'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-[11px]">{joinDate}</td>
                        <td className="py-3 px-4 text-right">
                          <button 
                            onClick={() => onNavigate('users')}
                            className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Upcoming Leaves (col-span-1) */}
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-foreground">Upcoming Leaves</h3>
              <button
                onClick={() => onNavigate('calendar')}
                className="text-xs font-semibold text-primary hover:underline"
              >
                View all
              </button>
            </div>

            {upcomingLeavesList.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center justify-center">
                <Calendar className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p>{isCompanyLogin ? "No upcoming employee leaves" : "You have no upcoming leaves"}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 text-xs h-7 rounded-lg"
                  onClick={() => onNavigate('calendar')}
                >
                  {isCompanyLogin ? "View Leave Calendar" : "Apply for Leave"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingLeavesList.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-muted border border-border shrink-0">
                        <img 
                          src={item.avatar} 
                          alt="" 
                          className="w-full h-full object-cover" 
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate leading-tight">{item.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] text-muted-foreground truncate">{item.type}</span>
                          <span className={cn(
                            "text-[9px] px-1.5 py-0.2 rounded-full font-medium border capitalize",
                            item.status === 'approved'
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          )}>
                            {item.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground shrink-0 bg-secondary/60 px-2 py-0.5 rounded-md">
                      {item.range}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
