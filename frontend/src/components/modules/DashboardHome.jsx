import { useState, useMemo, useCallback, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useGetAllUsers, 
  useGetUserAttendance, 
  useGetUserLeaveRequests, 
  useGetAllAttendance, 
  useGetAllLeaveRequests,
  useGetAllTasks,
  useGetRecentTransactions,
  useGetCompanyInfo,
  useGetProjects
} from '../../hooks/useQueries';
import { useCustomAuth } from '../../hooks/useCustomAuth';
import { useScrollPagination } from '../../hooks/useScrollPagination';
import { 
  Users, Building2, UserCheck, Search, CheckCircle2, ArrowUpRight, Calendar,
  Clock, DollarSign, CreditCard, TrendingUp, MoreVertical, FolderKanban, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip 
} from 'recharts';
import { SafeAvatar } from '../SafeAvatar';

export const toLocalDateStr = (d) => {
  if (!d) return '';
  const dateObj = d instanceof Date ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return '';
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function DashboardHome({ userProfile, onNavigate, selectedYear = new Date().getFullYear(), setSelectedYear }) {
  const { identity } = useCustomAuth();
  const queryClient = useQueryClient();
  const currentUserId = userProfile?.userId || userProfile?.id || userProfile?.StaffId || identity?.getPrincipal() || null;
  const currentYear = new Date().getFullYear();
  const isCurrentYear = selectedYear === currentYear;

  const { data: users = [] } = useGetAllUsers();
  const { data: attendance = [] } = useGetUserAttendance(currentUserId);
  const { data: userLeaves = [] } = useGetUserLeaveRequests(currentUserId);
  const { data: allLeaves = [] } = useGetAllLeaveRequests();
  const { data: allAttendance = [] } = useGetAllAttendance();
  const { data: allTasks = [] } = useGetAllTasks();
  const { data: companyInfo } = useGetCompanyInfo();
  const { data: transactionsData } = useGetRecentTransactions({ year: selectedYear, limit: 100 });
  const { data: allProjects = [] } = useGetProjects();

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

  const [trendRange, setTrendRange] = useState('year');
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

  // Helper to extract joining/creation year
  const getEmployeeYear = useCallback((emp) => {
    if (!emp) return currentYear;
    if (emp.joiningDate) {
      const d = new Date(emp.joiningDate);
      if (!isNaN(d.getTime())) return d.getFullYear();
    }
    if (emp.createdAt) {
      const d = new Date(emp.createdAt);
      if (!isNaN(d.getTime())) return d.getFullYear();
    }
    return currentYear;
  }, [currentYear]);

  // Active employees in company excluding the owner
  const activeCompanyEmployees = useMemo(() => {
    return users.filter(u => !isOwnerRole(u.role));
  }, [users, isOwnerRole]);

  // Filtered employees who joined on or before selectedYear
  const employeesInYear = useMemo(() => {
    return activeCompanyEmployees.filter(u => getEmployeeYear(u) <= selectedYear);
  }, [activeCompanyEmployees, selectedYear, getEmployeeYear]);

  // New joiners in selectedYear
  const newJoinersInYear = useMemo(() => {
    return activeCompanyEmployees.filter(u => getEmployeeYear(u) === selectedYear);
  }, [activeCompanyEmployees, selectedYear, getEmployeeYear]);

  const totalEmployeesCount = employeesInYear.length;

  const departmentsList = useMemo(() => {
    return Array.from(new Set(employeesInYear.map(u => u.department).filter(Boolean)));
  }, [employeesInYear]);
  const totalDepartments = departmentsList.length;

  const myIds = useMemo(() => {
    const list = [
      toIdText(userProfile?.userId),
      toIdText(userProfile?.id),
      toIdText(userProfile?._id),
      toIdText(userProfile?.username),
      toIdText(userProfile?.staffId),
      toIdText(userProfile?.StaffId),
      toIdText(identity?.getPrincipal()),
    ].map(s => s.toLowerCase().trim()).filter(Boolean);
    return new Set(list);
  }, [userProfile, identity, toIdText]);

  // Projects where this user is an assigned employee
  const userProjects = useMemo(() => {
    return allProjects.filter(p => {
      return (p.assignedEmployees || []).some(e => {
        const uid = toIdText(e.userId).toLowerCase().trim();
        return myIds.has(uid);
      });
    });
  }, [allProjects, myIds, toIdText]);

  // Tasks assigned to this user that are linked to a project
  const userProjectTasks = useMemo(() => {
    return allTasks.filter(t => {
      if (!t.projectId) return false;
      const assignee = toIdText(t.assignee || t.assignedTo).toLowerCase().trim();
      return myIds.has(assignee);
    });
  }, [allTasks, myIds, toIdText]);

  const isMyAttendance = useCallback((a) => {
    if (!a) return false;
    const aIds = [
      toIdText(a.userId),
      toIdText(a.staffId),
      toIdText(a.employeeId),
      toIdText(a.user),
      toIdText(a.id)
    ].map(s => s.toLowerCase().trim()).filter(Boolean);
    return aIds.some(id => myIds.has(id));
  }, [myIds, toIdText]);

  const matchesEmployee = useCallback((a, u) => {
    if (!a || !u) return false;
    const aIds = [
      toIdText(a.userId),
      toIdText(a.staffId),
      toIdText(a.employeeId),
      toIdText(a.user),
      toIdText(a.id)
    ].map(s => s.toLowerCase().trim()).filter(Boolean);

    const uIds = [
      toIdText(u.userId),
      toIdText(u.id),
      toIdText(u._id),
      toIdText(u.username),
      toIdText(u.staffId),
      toIdText(u.StaffId),
    ].map(s => s.toLowerCase().trim()).filter(Boolean);

    return aIds.some(id => uIds.includes(id));
  }, [toIdText]);

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

  // Robust date extractor YYYY-MM-DD
  const normalizeAttendanceDate = useCallback((a) => {
    const raw = a?.date || a?.checkIn || a?.createdAt;
    if (!raw) return '';
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) return toLocalDateStr(d);
      return trimmed;
    }
    if (typeof raw === 'number' || typeof raw === 'bigint') {
      const num = Number(raw);
      const ms = num > 1e14 ? num / 1e6 : (num > 1e11 ? num : num * 1000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return toLocalDateStr(d);
    }
    if (raw instanceof Date) {
      return toLocalDateStr(raw);
    }
    return '';
  }, []);

  const formatTime = useCallback((timeVal) => {
    if (!timeVal) return '';
    try {
      if (typeof timeVal === 'number' || typeof timeVal === 'bigint') {
        const num = Number(timeVal);
        const ms = num > 1e14 ? num / 1e6 : (num > 1e11 ? num : num * 1000);
        const d = new Date(ms);
        if (!isNaN(d.getTime())) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      }
      const d = new Date(timeVal);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      }
      if (typeof timeVal === 'string' && timeVal.includes(':')) {
        return timeVal.slice(0, 5);
      }
      return String(timeVal);
    } catch {
      return '';
    }
  }, []);

  // Merged real-time attendance deduplicated
  const combinedAttendance = useMemo(() => {
    const map = new Map();
    (allAttendance || []).forEach(a => {
      const d = normalizeAttendanceDate(a);
      const u = toIdText(a.userId || a.id);
      const key = a.id || a._id || `${u}-${d}`;
      map.set(key, a);
    });
    (attendance || []).forEach(a => {
      const d = normalizeAttendanceDate(a);
      const u = toIdText(a.userId || a.id);
      const key = a.id || a._id || `${u}-${d}`;
      map.set(key, a);
    });
    return Array.from(map.values());
  }, [allAttendance, attendance, toIdText, normalizeAttendanceDate]);

  // Attendance records strictly in selectedYear
  const yearAttendance = useMemo(() => {
    const prefix = `${selectedYear}-`;
    return combinedAttendance.filter(a => {
      const d = normalizeAttendanceDate(a);
      return d && d.startsWith(prefix);
    });
  }, [combinedAttendance, selectedYear, normalizeAttendanceDate]);

  // Today's Attendance Stats
  const todayDate = toLocalDateStr(new Date());
  const todayAttendance = useMemo(() => {
    return combinedAttendance.filter(a => normalizeAttendanceDate(a) === todayDate);
  }, [combinedAttendance, todayDate, normalizeAttendanceDate]);

  const activeUsersToday = useMemo(() => {
    const presentRecords = todayAttendance.filter(a => isPresentStatus(a.status) || isLateStatus(a.status));
    if (employeesInYear.length === 0) return presentRecords.length;
    return employeesInYear.filter(u => presentRecords.some(a => matchesEmployee(a, u))).length;
  }, [todayAttendance, employeesInYear, matchesEmployee, isPresentStatus, isLateStatus]);

  // Today's check-in status and record for user dashboard
  const userTodayRecord = useMemo(() => {
    return todayAttendance.find(a => isMyAttendance(a));
  }, [todayAttendance, isMyAttendance]);

  const userTodayStatus = useMemo(() => {
    if (!userTodayRecord) return 'Not Checked In';
    if (isPresentStatus(userTodayRecord.status)) return 'Present';
    if (isLateStatus(userTodayRecord.status)) return 'Late';
    if (isAbsentStatus(userTodayRecord.status)) return 'Absent';
    return 'Present';
  }, [userTodayRecord, isPresentStatus, isLateStatus, isAbsentStatus]);

  // Attendance breakdown for selectedYear
  const rateBreakdown = useMemo(() => {
    const now = new Date();
    let targetDates = [];

    if (trendRange === 'week' && isCurrentYear) {
      const dayOfWeek = (now.getDay() + 6) % 7;
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);

      for (let i = 0; i <= dayOfWeek; i++) {
        const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
        if (d.getDay() !== 0) {
          targetDates.push(toLocalDateStr(d));
        }
      }
    } else if (trendRange === 'month' && isCurrentYear) {
      const currentMonth = now.getMonth();
      const currentDate = now.getDate();
      for (let day = 1; day <= currentDate; day++) {
        const d = new Date(selectedYear, currentMonth, day);
        if (d.getDay() !== 0) {
          targetDates.push(toLocalDateStr(d));
        }
      }
    } else {
      // Annual calculation for selectedYear
      const cur = new Date(selectedYear, 0, 1);
      const endDay = isCurrentYear ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : new Date(selectedYear, 11, 31);

      if (cur <= endDay) {
        while (cur <= endDay) {
          if (cur.getDay() !== 0) {
            targetDates.push(toLocalDateStr(cur));
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
    }

    const targetDatesSet = new Set(targetDates);
    const sourceAttendance = yearAttendance;

    if (isCompanyLogin) {
      const relevantRecords = sourceAttendance.filter(a => {
        const dIso = normalizeAttendanceDate(a);
        if (targetDates.length > 0 && !targetDatesSet.has(dIso)) return false;
        if (employeesInYear.length === 0) return true;
        return employeesInYear.some(u => matchesEmployee(a, u));
      });

      const present = relevantRecords.filter(r => isPresentStatus(r.status)).length;
      const late = relevantRecords.filter(r => isLateStatus(r.status)).length;
      const attended = present + late;
      const explicitAbsent = relevantRecords.filter(r => isAbsentStatus(r.status)).length;
      
      const totalExpected = Math.max(1, (totalEmployeesCount || 1) * (targetDates.length || 1));
      const absent = explicitAbsent > 0 ? explicitAbsent : Math.max(0, totalExpected - attended);
      const totalBasis = Math.max(attended + absent, totalExpected);
      const rate = totalBasis > 0 ? Math.min(100, Math.round((attended / totalBasis) * 100)) : 0;

      return { present, absent, late, rate, totalExpected };
    } else {
      const myRecords = sourceAttendance.filter(a => isMyAttendance(a));
      const recordsInRange = targetDates.length > 0
        ? myRecords.filter(a => targetDatesSet.has(normalizeAttendanceDate(a)))
        : myRecords;

      const present = recordsInRange.filter(r => isPresentStatus(r.status)).length;
      const late = recordsInRange.filter(r => isLateStatus(r.status)).length;
      const attended = present + late;
      const explicitAbsent = recordsInRange.filter(r => isAbsentStatus(r.status)).length;
      const expectedDays = targetDates.length || 1;
      const absent = explicitAbsent > 0 ? explicitAbsent : Math.max(0, expectedDays - attended);
      const totalBasis = Math.max(attended + absent, expectedDays);
      const rate = totalBasis > 0 ? Math.min(100, Math.round((attended / totalBasis) * 100)) : 0;

      return { present, absent, late, rate, totalExpected: expectedDays };
    }
  }, [
    trendRange, selectedYear, isCurrentYear, isCompanyLogin, yearAttendance,
    employeesInYear, totalEmployeesCount, matchesEmployee, isMyAttendance,
    isPresentStatus, isLateStatus, isAbsentStatus, normalizeAttendanceDate
  ]);

  // Real Attendance Trend computed for selectedYear (12 Months / Month / Week)
  const trendData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const now = new Date();

    const sourceRecords = isCompanyLogin
      ? yearAttendance.filter(a => {
          if (employeesInYear.length === 0) return true;
          return employeesInYear.some(u => matchesEmployee(a, u));
        })
      : yearAttendance.filter(a => isMyAttendance(a));

    const divisor = isCompanyLogin ? (totalEmployeesCount || 1) : 1;

    // 1. Full 12-Month Trend for selectedYear
    const yearList = months.map((name, mIdx) => {
      const monthPrefix = `${selectedYear}-${String(mIdx + 1).padStart(2, '0')}`;
      const recordsInMonth = sourceRecords.filter(a => {
        const dIso = normalizeAttendanceDate(a);
        return dIso && dIso.startsWith(monthPrefix);
      });

      const uniqueDates = new Set(recordsInMonth.map(a => normalizeAttendanceDate(a)));
      const workingDays = uniqueDates.size || 0;
      const totalPossible = Math.max(1, workingDays * divisor);

      const attended = recordsInMonth.filter(r => isPresentStatus(r.status) || isLateStatus(r.status)).length;
      const rate = workingDays > 0 ? Math.min(100, Math.round((attended / totalPossible) * 100)) : 0;
      return { name, rate, attended, month: monthPrefix };
    });

    // 2. Month Trend (Weeks 1 to 4 of current or last month in selectedYear)
    const targetMonthIdx = isCurrentYear ? now.getMonth() : 11;
    const lastDayOfMonth = new Date(selectedYear, targetMonthIdx + 1, 0).getDate();
    const monthWeeks = [
      { name: 'Week 1', start: 1, end: 7 },
      { name: 'Week 2', start: 8, end: 14 },
      { name: 'Week 3', start: 15, end: 21 },
      { name: 'Week 4', start: 22, end: lastDayOfMonth },
    ];

    const monthList = monthWeeks.map(w => {
      const recordsInWeek = sourceRecords.filter(a => {
        const dIso = normalizeAttendanceDate(a);
        if (!dIso) return false;
        const parts = dIso.split('-');
        if (parts.length !== 3) return false;
        const y = Number(parts[0]);
        const m = Number(parts[1]) - 1;
        const day = Number(parts[2]);
        return y === selectedYear && m === targetMonthIdx && day >= w.start && day <= w.end;
      });

      const dateSet = new Set(recordsInWeek.map(a => normalizeAttendanceDate(a)));
      const totalPossible = Math.max(1, (dateSet.size || 1) * divisor);
      const attended = recordsInWeek.filter(r => isPresentStatus(r.status) || isLateStatus(r.status)).length;
      const rate = dateSet.size > 0 ? Math.min(100, Math.round((attended / totalPossible) * 100)) : 0;
      return { name: w.name, rate };
    });

    // 3. Week Trend (Mon-Sun)
    const dayOfWeek = (now.getDay() + 6) % 7;
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);

    const weekList = days.map((name, i) => {
      const d = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + i);
      const dIso = toLocalDateStr(d);

      const recordsOnDay = sourceRecords.filter(a => normalizeAttendanceDate(a) === dIso);
      const attendedCount = recordsOnDay.filter(r => isPresentStatus(r.status) || isLateStatus(r.status)).length;
      const rate = Math.min(100, Math.round((attendedCount / divisor) * 100));
      return { name, rate, date: dIso, present: attendedCount };
    });

    return {
      week: weekList,
      month: monthList,
      year: yearList,
    };
  }, [
    yearAttendance, selectedYear, isCurrentYear, isCompanyLogin, totalEmployeesCount,
    employeesInYear, matchesEmployee, isMyAttendance, isPresentStatus, isLateStatus, normalizeAttendanceDate
  ]);

  const currentTrendData = trendData[trendRange] || trendData.year;

  // Filtered employees for table (strictly in selectedYear)
  const filteredEmployees = useMemo(() => {
    let list = employeesInYear;
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
    return list;
  }, [employeesInYear, empSearch, deptFilter, statusFilter]);

  // Pagination upon 6 per page with scroll-down lazy loading
  const empPagination = useScrollPagination(filteredEmployees, 6, [empSearch, deptFilter, statusFilter, selectedYear]);
  const displayedEmployees = empPagination.visibleItems;

  // Employee-specific annual attendance rate for employee table
  const getEmployeeAnnualAttendance = useCallback((emp) => {
    if (!emp) return { rate: 0, presentDays: 0 };
    const empRecords = yearAttendance.filter(a => matchesEmployee(a, emp));
    const attended = empRecords.filter(r => isPresentStatus(r.status) || isLateStatus(r.status)).length;
    const rate = rateBreakdown.totalExpected > 0 ? Math.min(100, Math.round((attended / rateBreakdown.totalExpected) * 100)) : 0;
    return { rate, presentDays: attended };
  }, [yearAttendance, matchesEmployee, isPresentStatus, isLateStatus, rateBreakdown.totalExpected]);

  const formatLeaveRange = (start, end) => {
    if (!start) return 'Leave';
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

  // Leaves filtered by selectedYear
  const leavesInYear = useMemo(() => {
    const rawLeaves = isCompanyLogin ? allLeaves : userLeaves;
    if (!Array.isArray(rawLeaves) || rawLeaves.length === 0) return [];

    const yrPrefix = String(selectedYear);
    return rawLeaves.filter(l => {
      const s = String(l.startDate || '');
      const e = String(l.endDate || '');
      const c = String(l.createdAt || '');
      return s.startsWith(yrPrefix) || e.startsWith(yrPrefix) || c.startsWith(yrPrefix);
    });
  }, [isCompanyLogin, allLeaves, userLeaves, selectedYear]);

  const upcomingLeavesList = useMemo(() => {
    const todayAtMidnight = new Date();
    todayAtMidnight.setHours(0, 0, 0, 0);

    const filtered = leavesInYear.filter(l => {
      const status = typeof l.status === 'string' ? l.status.toLowerCase() : Object.keys(l.status || {})[0]?.toLowerCase();
      if (status === 'rejected') return false;
      if (isCurrentYear) {
        if (!l.endDate && !l.startDate) return true;
        const d = new Date(l.endDate || l.startDate);
        if (isNaN(d.getTime())) return true;
        return d >= todayAtMidnight;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const da = new Date(a.startDate || 0).getTime();
      const db = new Date(b.startDate || 0).getTime();
      return isCurrentYear ? da - db : db - da;
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
  }, [leavesInYear, isCurrentYear, isCompanyLogin, users, userProfile, toIdText]);

  // Payment transactions strictly in selectedYear
  const myTransactions = useMemo(() => {
    const list = transactionsData?.transactions || (Array.isArray(transactionsData) ? transactionsData : []);
    const yrPrefix = `${selectedYear}-`;
    const yrStr = String(selectedYear);
    return list.filter(t => {
      if (t.month && String(t.month).startsWith(yrPrefix)) return true;
      if (t.paidAt && String(t.paidAt).startsWith(yrStr)) return true;
      if (t.createdAt && String(t.createdAt).startsWith(yrStr)) return true;
      return false;
    });
  }, [transactionsData, selectedYear]);

  const totalPaidInYear = useMemo(() => {
    const completed = myTransactions.filter(t => t.status === 'completed' || !t.status);
    return completed.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [myTransactions]);

  const approvedLeavesCount = useMemo(() => {
    return leavesInYear.filter(l => {
      const st = typeof l.status === 'string' ? l.status.toLowerCase() : Object.keys(l.status || {})[0]?.toLowerCase();
      return st === 'approved';
    }).length;
  }, [leavesInYear]);

  // Pagination upon 6 per page with scroll-down lazy loading
  const leavePagination = useScrollPagination(leavesInYear, 6, [selectedYear]);
  const displayedLeaves = leavePagination.visibleItems;

  const txPagination = useScrollPagination(myTransactions, 6, [selectedYear]);
  const displayedTransactions = txPagination.visibleItems;

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Welcome Greeting Banner with Year Context */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-card border border-border p-4 sm:p-5 lg:p-6 rounded-2xl shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-foreground">
            Welcome back, {userProfile?.ownerName || userProfile?.name || 'User'}!
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {isCompanyLogin
              ? `Company operations and workforce analytics for year ${selectedYear}.`
              : `Your personal attendance, leave, and payroll records for year ${selectedYear}.`}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-primary/10 text-primary border border-primary/20">
            <Calendar className="w-3.5 h-3.5" />
            Year: {selectedYear}
          </span>
          {isCurrentYear && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          )}
        </div>
      </div>

      {/* 2. Top Stats Cards Grid */}
      {isCompanyLogin ? (
        /* Company Dashboard Top Cards */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5">
          {/* Total Employees in Year */}
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-3.5 sm:p-5 relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total Employees ({selectedYear})</p>
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1.5 sm:mt-2">{totalEmployeesCount}</h3>
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    <ArrowUpRight className="w-3 h-3" /> +{newJoinersInYear.length} joined
                  </span>
                  <span className="text-[11px] text-muted-foreground">in {selectedYear}</span>
                </div>
              </div>
              <div className="p-2 sm:p-2.5 rounded-xl bg-secondary/80 text-muted-foreground">
                <Users className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-primary" />
              </div>
            </div>
          </Card>

          {/* Active Departments in Year */}
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-3.5 sm:p-5 relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Departments ({selectedYear})</p>
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1.5 sm:mt-2">{totalDepartments}</h3>
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" /> Active
                  </span>
                  <span className="text-[11px] text-muted-foreground">in {selectedYear}</span>
                </div>
              </div>
              <div className="p-2 sm:p-2.5 rounded-xl bg-secondary/80 text-muted-foreground">
                <Building2 className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-primary" />
              </div>
            </div>
          </Card>

          {/* Today's Status / Year Attendance */}
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-3.5 sm:p-5 relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  {isCurrentYear ? "Today's Attendance" : `Annual Attendance (${selectedYear})`}
                </p>
                <div className="flex items-center gap-2 mt-1.5 sm:mt-2 flex-wrap">
                  <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                    {isCurrentYear ? `${activeUsersToday} / ${totalEmployeesCount || 1}` : `${rateBreakdown.rate}%`}
                  </h3>
                </div>
                <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    <strong className="text-foreground font-semibold">{rateBreakdown.rate}%</strong> {trendRange} average
                  </span>
                  {isCurrentYear && (
                    <span className="text-[11px] text-muted-foreground">
                      ({activeUsersToday} present today)
                    </span>
                  )}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-secondary/80 text-muted-foreground shrink-0 ml-2">
                <UserCheck className="w-5 h-5 text-primary" />
              </div>
            </div>
          </Card>

          {/* Attendance Rate Donut Card */}
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-3.5 sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Attendance Rate ({selectedYear})
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
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center shrink-0">
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
                  <span className="text-base sm:text-lg font-bold tracking-tight text-foreground">{rateBreakdown.rate}%</span>
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
      ) : (
        /* Employee/User Dashboard Top Cards */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
          {/* Card 1: My Annual Attendance Percentage */}
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-3.5 sm:p-5 relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Attendance Rate ({selectedYear})</p>
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1.5 sm:mt-2">{rateBreakdown.rate}%</h3>
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    <UserCheck className="w-3 h-3" /> {rateBreakdown.present + rateBreakdown.late} days
                  </span>
                  <span className="text-[11px] text-muted-foreground">attended in {selectedYear}</span>
                </div>
              </div>
              <div className="p-2 sm:p-2.5 rounded-xl bg-secondary/80 text-muted-foreground">
                <UserCheck className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-primary" />
              </div>
            </div>
          </Card>

          {/* Card: My Assigned Projects */}
          <Card 
            onClick={() => onNavigate('schedules')}
            className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-3.5 sm:p-5 relative overflow-hidden cursor-pointer hover:border-primary/40 hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">
                  My Projects
                </p>
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1.5 sm:mt-2">
                  {userProjects.length}
                </h3>
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-600 dark:text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full">
                    <FolderKanban className="w-3 h-3" /> {userProjectTasks.length} tasks
                  </span>
                  <span className="text-[11px] text-muted-foreground">assigned</span>
                </div>
              </div>
              <div className="p-2 sm:p-2.5 rounded-xl bg-secondary/80 text-muted-foreground group-hover:bg-teal-500/10 group-hover:text-teal-600 transition-all">
                <FolderKanban className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-primary" />
              </div>
            </div>
          </Card>

          {/* Card 2: Attendance Summary (Present / Late / Absent) */}
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-3.5 sm:p-5 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Attendance Summary ({selectedYear})</p>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mt-2.5 sm:mt-3 text-center">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-1.5 sm:p-2">
                  <p className="text-[10px] text-muted-foreground font-semibold">Present</p>
                  <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">{rateBreakdown.present}</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-1.5 sm:p-2">
                  <p className="text-[10px] text-muted-foreground font-semibold">Late</p>
                  <p className="text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400">{rateBreakdown.late}</p>
                </div>
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-1.5 sm:p-2">
                  <p className="text-[10px] text-muted-foreground font-semibold">Absent</p>
                  <p className="text-base sm:text-lg font-bold text-rose-600 dark:text-rose-400">{rateBreakdown.absent}</p>
                </div>
              </div>
            </div>
            {isCurrentYear && (
              <div className="mt-3 pt-2 border-t border-border flex items-center justify-between text-xs">
                <span className="text-muted-foreground text-[11px]">Today:</span>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                  userTodayStatus === 'Present' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                  userTodayStatus === 'Late' ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" :
                  "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                )}>
                  {userTodayStatus}
                </span>
              </div>
            )}
          </Card>

          {/* Card 3: Leave Summary in Year */}
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-3.5 sm:p-5 relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Leaves ({selectedYear})</p>
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1.5 sm:mt-2">{leavesInYear.length}</h3>
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {approvedLeavesCount} Approved
                  </span>
                  <span className="text-[11px] text-muted-foreground">applications</span>
                </div>
              </div>
              <div className="p-2 sm:p-2.5 rounded-xl bg-secondary/80 text-muted-foreground">
                <Calendar className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-primary" />
              </div>
            </div>
          </Card>

          {/* Card 4: Total Earnings / Payroll in Year */}
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-3.5 sm:p-5 relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Earnings Paid ({selectedYear})</p>
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1.5 sm:mt-2">
                  ₹{totalPaidInYear.toLocaleString('en-IN')}
                </h3>
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    {myTransactions.length} payments
                  </span>
                  <span className="text-[11px] text-muted-foreground">in {selectedYear}</span>
                </div>
              </div>
              <div className="p-2 sm:p-2.5 rounded-xl bg-secondary/80 text-muted-foreground">
                <DollarSign className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-primary" />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* 3. Middle Row: Attendance Trend Chart for selectedYear */}
      <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-base font-bold text-foreground">
              {isCompanyLogin ? `Team Attendance Trend (${selectedYear})` : `My Attendance Trend (${selectedYear})`}
            </h3>
            <p className="text-xs text-muted-foreground">
              {trendRange === 'year' 
                ? `Monthly attendance distribution for ${selectedYear}` 
                : (trendRange === 'month' ? `Weekly breakdown for ${selectedYear}` : `Day-by-day analysis`)}
            </p>
          </div>
          <div className="flex items-center gap-1 bg-secondary/80 p-0.5 rounded-lg border border-border text-[10px] font-semibold">
            <button
              onClick={() => setTrendRange('week')}
              className={cn("px-2.5 py-1 rounded-md transition-all", trendRange === 'week' ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground")}
            >
              Week
            </button>
            <button
              onClick={() => setTrendRange('month')}
              className={cn("px-2.5 py-1 rounded-md transition-all", trendRange === 'month' ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground")}
            >
              Month
            </button>
            <button
              onClick={() => setTrendRange('year')}
              className={cn("px-2.5 py-1 rounded-md transition-all", trendRange === 'year' ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground")}
            >
              Year ({selectedYear})
            </button>
          </div>
        </div>
        <div className="h-48 sm:h-56 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={currentTrendData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0D9488" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0D9488" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'var(--card)', 
                  borderColor: 'var(--border)', 
                  borderRadius: '0.75rem', 
                  fontSize: '11px',
                  color: 'var(--foreground)'
                }}
                formatter={(val) => [`${val}%`, 'Attendance Rate']}
              />
              <Area type="monotone" dataKey="rate" stroke="#0D9488" strokeWidth={2.5} fillOpacity={1} fill="url(#emeraldGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 4. Bottom Row: Company View (Employees Table + Leaves) OR Employee View (Leaves + Payroll) */}
      {isCompanyLogin ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Employees Table (col-span-2) */}
          <Card className="lg:col-span-2 border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden">
            <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Employees ({selectedYear})</h3>
                <p className="text-xs text-muted-foreground">{totalEmployeesCount} members active in {selectedYear}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                <div className="relative flex-1 min-w-[110px] sm:flex-none sm:w-36">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    className="h-8 pl-8 pr-3 text-xs rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-full"
                  />
                </div>

                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="h-8 px-2.5 text-xs rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary flex-1 min-w-[120px] sm:flex-none"
                >
                  <option value="all">All Departments</option>
                  {departmentsList.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-8 px-2.5 text-xs rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary flex-1 min-w-[100px] sm:flex-none"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                </select>

                <Button
                  onClick={() => onNavigate('users')}
                  size="sm"
                  className="h-8 bg-primary hover:bg-[#0F766E] text-white font-semibold rounded-xl text-xs px-3 shadow-xs w-full sm:w-auto"
                >
                  + Add Employee
                </Button>
              </div>
            </div>

            <div 
              ref={empPagination.containerRef}
              className="overflow-x-auto max-h-[440px] overflow-y-auto"
              onScroll={empPagination.onScroll}
            >
              <table className="w-full text-left text-xs">
                <thead className="bg-secondary/40 border-b border-border text-muted-foreground font-semibold uppercase text-[10px] tracking-wider sticky top-0 bg-card z-10">
                  <tr>
                    <th className="py-3 px-5">Name</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">{isCurrentYear ? "Today's Status" : `Attendance (${selectedYear})`}</th>
                    <th className="py-3 px-4">Joining Date</th>
                    <th className="py-3 px-4 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {displayedEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                        No employees found for year {selectedYear}
                      </td>
                    </tr>
                  ) : (
                    displayedEmployees.map((emp, idx) => {
                      const name = emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Employee';
                      const avatar = emp.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
                      const dept = emp.department || 'General';
                      const role = emp.designation || (typeof emp.role === 'string' ? emp.role : Object.keys(emp.role || {})[0]) || 'Staff';
                      const isActive = !emp.isSuspended;
                      const joinDate = emp.joiningDate ? new Date(emp.joiningDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

                      const todayRec = todayAttendance.find(a => matchesEmployee(a, emp));
                      const isPresent = todayRec && isPresentStatus(todayRec.status);
                      const isLate = todayRec && isLateStatus(todayRec.status);
                      const inTimeStr = todayRec ? formatTime(todayRec.checkIn || todayRec.createdAt) : '';

                      const annualStats = getEmployeeAnnualAttendance(emp);

                      return (
                        <tr key={emp._id || emp.id || idx} className="hover:bg-teal-500/[0.04] dark:hover:bg-teal-400/[0.06] transition-colors">
                          <td className="py-3 px-5 flex items-center gap-3">
                            <SafeAvatar
                              src={emp.avatar}
                              name={name}
                              username={emp.username}
                              gender={emp.gender}
                              className="w-8 h-8 rounded-full border border-border"
                            />
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
                          <td className="py-3 px-4">
                            {isCurrentYear ? (
                              isPresent ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                  Present {inTimeStr ? `(${inTimeStr})` : ''}
                                </span>
                              ) : isLate ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                  Late {inTimeStr ? `(${inTimeStr})` : ''}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                  Absent
                                </span>
                              )
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                                {annualStats.presentDays} days ({annualStats.rate}%)
                              </span>
                            )}
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
              {empPagination.hasMore && (
                <div 
                  ref={empPagination.sentinelRef}
                  className="py-2.5 px-4 text-center border-t border-border bg-secondary/30 text-[11px] text-muted-foreground flex items-center justify-between gap-1.5"
                >
                  <span>Showing {displayedEmployees.length} of {empPagination.totalCount} employees</span>
                  <button
                    type="button"
                    onClick={empPagination.loadMore}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                  >
                    Load next ({empPagination.totalCount - displayedEmployees.length} remaining)
                  </button>
                </div>
              )}
            </div>
          </Card>

          {/* Upcoming Leaves (col-span-1) */}
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-foreground">
                  {isCurrentYear ? "Upcoming Leaves" : `Leaves in ${selectedYear}`}
                </h3>
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
                  <p>No leaves recorded for year {selectedYear}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 text-xs h-7 rounded-lg"
                    onClick={() => onNavigate('calendar')}
                  >
                    View Leave Calendar
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
                                : (item.status === 'rejected'
                                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20")
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
      ) : (
        /* Employee Dashboard Bottom Sections: Leaves Records + Payroll & Payments History */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Leave Records for Employee */}
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">My Leaves ({selectedYear})</h3>
                  <p className="text-xs text-muted-foreground">{leavesInYear.length} total applications in {selectedYear}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onNavigate('calendar')}
                  className="text-xs h-8 rounded-xl gap-1.5 font-semibold"
                >
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  Apply Leave
                </Button>
              </div>

            <div className="p-5">
              {leavesInYear.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center justify-center">
                  <Calendar className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p>You have no leave records in {selectedYear}</p>
                </div>
              ) : (
                <div 
                  className="overflow-x-auto max-h-[360px] overflow-y-auto"
                  onScroll={leavePagination.onScroll}
                >
                  <table className="w-full text-left text-xs">
                    <thead className="bg-secondary/40 border-b border-border text-muted-foreground font-semibold uppercase text-[10px] tracking-wider sticky top-0 bg-card z-10">
                      <tr>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Dates</th>
                        <th className="py-2.5 px-3">Days</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {displayedLeaves.map((l, i) => {
                        const type = formatLeaveType(l.leaveType || l.type);
                        const status = typeof l.status === 'string' ? l.status : Object.keys(l.status || {})[0] || 'pending';
                        const range = formatLeaveRange(l.startDate, l.endDate);
                        const days = l.days || l.totalDays || 1;

                        return (
                          <tr key={l._id || l.id || i} className="hover:bg-secondary/30 transition-colors">
                            <td className="py-2.5 px-3 font-semibold text-foreground">{type}</td>
                            <td className="py-2.5 px-3 text-muted-foreground">{range}</td>
                            <td className="py-2.5 px-3 text-foreground">{days} {days === 1 ? 'day' : 'days'}</td>
                            <td className="py-2.5 px-3">
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize",
                                status === 'approved' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                                status === 'rejected' ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" :
                                "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                              )}>
                                {status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {leavePagination.hasMore && (
                    <div 
                      onClick={leavePagination.loadMore}
                      className="py-2 px-3 text-center border-t border-border bg-secondary/30 text-[10px] text-muted-foreground flex items-center justify-center gap-1.5 cursor-pointer hover:bg-secondary/50 transition-colors"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      <span>Showing {displayedLeaves.length} of {leavePagination.totalCount} leaves — Scroll down for next 6</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Payroll & Payment History for Employee */}
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">Payment History ({selectedYear})</h3>
                <p className="text-xs text-muted-foreground">Salary and bonus records for {selectedYear}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onNavigate('payments')}
                className="text-xs h-8 rounded-xl gap-1.5 font-semibold"
              >
                <DollarSign className="w-3.5 h-3.5 text-primary" />
                View All Payments
              </Button>
            </div>

            <div className="p-5">
              {myTransactions.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center justify-center">
                  <CreditCard className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p>No payment records found for year {selectedYear}</p>
                </div>
              ) : (
                <div 
                  className="overflow-x-auto max-h-[360px] overflow-y-auto"
                  onScroll={txPagination.onScroll}
                >
                  <table className="w-full text-left text-xs">
                    <thead className="bg-secondary/40 border-b border-border text-muted-foreground font-semibold uppercase text-[10px] tracking-wider sticky top-0 bg-card z-10">
                      <tr>
                        <th className="py-2.5 px-3">Month</th>
                        <th className="py-2.5 px-3">Amount</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Ref ID</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {displayedTransactions.map((t, i) => {
                        const amt = Number(t.amount) || 0;
                        const status = t.status || 'completed';
                        const type = (t.type || 'Salary').toUpperCase();

                        return (
                          <tr key={t.id || t._id || i} className="hover:bg-secondary/30 transition-colors">
                            <td className="py-2.5 px-3 font-semibold text-foreground">{t.month}</td>
                            <td className="py-2.5 px-3 font-bold text-emerald-600 dark:text-emerald-400">
                              ₹{amt.toLocaleString('en-IN')}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary border border-border">
                                {type}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">{t.referenceId || 'N/A'}</td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 capitalize">
                                {status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {txPagination.hasMore && (
                    <div 
                      onClick={txPagination.loadMore}
                      className="py-2 px-3 text-center border-t border-border bg-secondary/30 text-[10px] text-muted-foreground flex items-center justify-center gap-1.5 cursor-pointer hover:bg-secondary/50 transition-colors"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      <span>Showing {displayedTransactions.length} of {txPagination.totalCount} payments — Scroll down for next 6</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
