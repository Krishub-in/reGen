import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SafeAvatar } from '../SafeAvatar';
import { authFetch, cn } from '@/lib/utils';
import {
  User,
  Mail,
  Phone,
  Calendar,
  Clock,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  FolderKanban,
  Briefcase,
  Building2,
  X,
  ArrowLeft,
  Timer,
  Receipt,
  FileText,
  Filter,
  Check,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  CreditCard,
  Layers,
  Sparkles,
  CalendarCheck,
  CalendarX,
  Hourglass,
  Tag
} from 'lucide-react';
import { format } from 'date-fns';

export default function EmployeeProfileDialog({
  employee,
  open,
  onClose,
  userProfile,
  selectedYear = new Date().getFullYear(),
  allAttendance = [],
  allTasks = [],
  allProjects = [],
  transactionsData,
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [attendanceMonthFilter, setAttendanceMonthFilter] = useState('all');
  const [taskFilter, setTaskFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');

  // Payroll live calculation / finalized preview state
  const [payrollData, setPayrollData] = useState(null);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollError, setPayrollError] = useState(null);

  // User-specific attendance records fetched or filtered
  const [userAttendanceLogs, setUserAttendanceLogs] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Reset tab when new employee opened
  useEffect(() => {
    if (open) {
      setActiveTab('overview');
      setAttendanceMonthFilter('all');
      setTaskFilter('all');
      setProjectFilter('all');
      const now = new Date();
      setSelectedMonth(format(now, 'yyyy-MM'));
    }
  }, [open, employee?.userId, employee?.StaffId]);

  // Normalize ID text helper
  const toIdText = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val.trim();
    if (val?.toText) return val.toText().trim();
    if (val?._id) return String(val._id).trim();
    if (val?.id) return String(val.id).trim();
    return String(val).trim();
  };

  const empUserId = toIdText(employee?.userId || employee?.id || employee?._id);
  const empStaffId = toIdText(employee?.StaffId || employee?.staffId);
  const empUsername = toIdText(employee?.username);
  const empName = employee?.name || employee?.username || 'Employee';

  // Fetch or filter attendance strictly belonging to this employee
  useEffect(() => {
    if (!open || !employee) return;

    let isMounted = true;
    setAttendanceLoading(true);

    const filterFromAll = () => {
      const uIds = [empUserId, empStaffId, empUsername, toIdText(employee?._id)].filter(Boolean).map(s => s.toLowerCase());
      return (allAttendance || []).filter(a => {
        const aIds = [
          toIdText(a.userId),
          toIdText(a.staffId),
          toIdText(a.employeeId),
          toIdText(a.user),
          toIdText(a.id)
        ].filter(Boolean).map(s => s.toLowerCase());
        return aIds.some(id => uIds.includes(id));
      });
    };

    // Attempt direct API fetch for this specific employee first to ensure fresh data
    const fetchAttendance = async () => {
      try {
        const targetId = toIdText(employee.userId || employee.StaffId || employee.id);
        if (targetId && targetId !== '[object Object]') {
          const res = await authFetch(`/api/attendance/user/${encodeURIComponent(targetId)}`);
          if (res.ok) {
            const data = await res.json();
            if (isMounted) {
              setUserAttendanceLogs(Array.isArray(data) ? data : filterFromAll());
              setAttendanceLoading(false);
            }
            return;
          }
        }
      } catch (e) {
        // Fallback to allAttendance
      }
      if (isMounted) {
        setUserAttendanceLogs(filterFromAll());
        setAttendanceLoading(false);
      }
    };

    fetchAttendance();

    return () => {
      isMounted = false;
    };
  }, [open, employee, allAttendance, empUserId, empStaffId, empUsername]);

  // Fetch Payroll Preview for selected month
  useEffect(() => {
    if (!open || !employee) return;

    let isMounted = true;
    setPayrollLoading(true);
    setPayrollError(null);

    const fetchPayroll = async () => {
      try {
        const targetId = employee.userId || employee.StaffId || employee.id;
        const res = await authFetch(`/api/payroll/preview?userId=${encodeURIComponent(targetId)}&month=${encodeURIComponent(selectedMonth)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setPayrollData(data);
            setPayrollLoading(false);
          }
        } else {
          const err = await res.json().catch(() => ({}));
          if (isMounted) {
            setPayrollError(err.message || 'Unable to retrieve payroll records for this period');
            setPayrollData(null);
            setPayrollLoading(false);
          }
        }
      } catch (err) {
        if (isMounted) {
          setPayrollError('Network or server error while loading payroll');
          setPayrollData(null);
          setPayrollLoading(false);
        }
      }
    };

    fetchPayroll();

    return () => {
      isMounted = false;
    };
  }, [open, employee, selectedMonth]);

  // Filter tasks belonging to employee
  const employeeTasks = useMemo(() => {
    if (!employee) return [];
    const uIds = [empUserId, empStaffId, empUsername, toIdText(employee?._id)].filter(Boolean).map(s => s.toLowerCase());

    return (allTasks || []).filter(t => {
      const assigned = toIdText(t.assignedTo).toLowerCase();
      const assignor = toIdText(t.assignorName).toLowerCase();
      return uIds.includes(assigned) || (t.assigneeId && uIds.includes(toIdText(t.assigneeId).toLowerCase()));
    });
  }, [allTasks, employee, empUserId, empStaffId, empUsername]);

  // Filter projects associated with employee
  const employeeProjects = useMemo(() => {
    if (!employee) return [];
    const uIds = [empUserId, empStaffId, empUsername, toIdText(employee?._id)].filter(Boolean).map(s => s.toLowerCase());

    return (allProjects || []).filter(p => {
      if (!Array.isArray(p.assignedEmployees)) return false;
      return p.assignedEmployees.some(e => {
        const eId = toIdText(e.userId || e.id || e._id || e.username).toLowerCase();
        const eName = String(e.name || '').toLowerCase();
        return uIds.includes(eId) || (empName && eName === empName.toLowerCase());
      });
    });
  }, [allProjects, employee, empUserId, empStaffId, empUsername, empName]);

  // Transactions belonging to employee
  const employeeTransactions = useMemo(() => {
    const rawList = transactionsData?.transactions || [];
    const uIds = [empUserId, empStaffId, empUsername, toIdText(employee?._id)].filter(Boolean).map(s => s.toLowerCase());

    return rawList.filter(tx => {
      const tUser = toIdText(tx.userId || tx.staffId).toLowerCase();
      const tName = String(tx.employeeName || '').toLowerCase();
      return uIds.includes(tUser) || (empName && tName === empName.toLowerCase());
    });
  }, [transactionsData, employee, empUserId, empStaffId, empUsername, empName]);

  // Attendance metrics calculation
  const attendanceMetrics = useMemo(() => {
    const logs = userAttendanceLogs || [];
    const presentCount = logs.filter(a => {
      const s = String(a.status || 'present').toLowerCase();
      return s === 'present' || s === 'half_day' || s === 'halfday';
    }).length;

    const lateCount = logs.filter(a => {
      const s = String(a.status || '').toLowerCase();
      return s === 'late' || (a.lateStatus && a.lateStatus !== 'on_time');
    }).length;

    const absentCount = logs.filter(a => {
      const s = String(a.status || '').toLowerCase();
      return s === 'absent';
    }).length;

    const totalDays = Math.max(1, presentCount + lateCount + absentCount);
    const rate = logs.length > 0 ? Math.round(((presentCount + lateCount) / totalDays) * 100) : 0;

    return {
      total: logs.length,
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      rate: Math.min(100, Math.max(0, rate)),
    };
  }, [userAttendanceLogs]);

  // Tasks metrics
  const taskMetrics = useMemo(() => {
    const total = employeeTasks.length;
    const completed = employeeTasks.filter(t => t.status === 'done' || t.status === 'completed').length;
    const inProgress = employeeTasks.filter(t => t.status === 'in_progress' || t.status === 'review').length;
    const pending = employeeTasks.filter(t => t.status === 'todo' || t.status === 'paused' || t.status === 'blocked').length;
    const notCompleted = employeeTasks.filter(t => t.status === 'not_completed').length;

    return {
      total,
      completed,
      inProgress,
      pending: pending + notCompleted,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [employeeTasks]);

  // Projects metrics
  const projectMetrics = useMemo(() => {
    const total = employeeProjects.length;
    const completed = employeeProjects.filter(p => p.status === 'completed').length;
    const active = employeeProjects.filter(p => p.status === 'active' || p.status === 'planning').length;
    const onHold = employeeProjects.filter(p => p.status === 'on_hold').length;

    return {
      total,
      completed,
      active,
      onHold,
    };
  }, [employeeProjects]);

  // Filtered attendance by selected month
  const filteredAttendance = useMemo(() => {
    if (attendanceMonthFilter === 'all') return userAttendanceLogs;
    return userAttendanceLogs.filter(a => {
      const rawDate = a.date || a.checkIn || a.createdAt || '';
      return String(rawDate).startsWith(attendanceMonthFilter);
    });
  }, [userAttendanceLogs, attendanceMonthFilter]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    if (taskFilter === 'all') return employeeTasks;
    if (taskFilter === 'completed') {
      return employeeTasks.filter(t => t.status === 'done' || t.status === 'completed');
    }
    if (taskFilter === 'in_progress') {
      return employeeTasks.filter(t => t.status === 'in_progress' || t.status === 'review');
    }
    if (taskFilter === 'pending') {
      return employeeTasks.filter(t => t.status === 'todo' || t.status === 'paused' || t.status === 'blocked');
    }
    if (taskFilter === 'overdue') {
      const now = Date.now();
      return employeeTasks.filter(t => {
        if (t.status === 'done' || t.status === 'completed') return false;
        if (t.status === 'not_completed') return true;
        const due = t.dueDate || t.endDate;
        if (!due) return false;
        const d = new Date(due);
        return !isNaN(d.getTime()) && now > d.getTime();
      });
    }
    return employeeTasks;
  }, [employeeTasks, taskFilter]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    if (projectFilter === 'all') return employeeProjects;
    return employeeProjects.filter(p => p.status === projectFilter);
  }, [employeeProjects, projectFilter]);

  if (!employee) return null;

  const formatRole = (r) => {
    if (!r) return '';
    if (typeof r === 'string') return r;
    if (typeof r === 'object') {
      const k = Object.keys(r)[0];
      return k ? (k.charAt(0).toUpperCase() + k.slice(1)) : '';
    }
    return String(r);
  };

  const formatStatus = (s, suspended) => {
    if (suspended) return 'Inactive';
    if (!s) return 'Active';
    if (typeof s === 'string') return s.charAt(0).toUpperCase() + s.slice(1);
    if (typeof s === 'object') {
      const k = Object.keys(s)[0];
      return k ? (k.charAt(0).toUpperCase() + k.slice(1)) : 'Active';
    }
    return String(s);
  };

  const displayStaffId = toIdText(employee.StaffId || employee.staffId || employee.userId || employee.id) || 'N/A';
  const displayDepartment = typeof employee.department === 'string' ? employee.department : 'General';
  const displayDesignation = employee.designation || formatRole(employee.role) || 'Staff Member';
  const displayEmail = employee.email || `${employee.username || 'staff'}@company.com`;
  const displayPhone = employee.phone || employee.contact || 'Not provided';
  const isSuspended = Boolean(employee.isSuspended || (typeof employee.status === 'string' && employee.status.toLowerCase() === 'inactive'));
  const displayStatus = formatStatus(employee.status, isSuspended);

  const displayCompanyName = employee.companyName || employee.company || '';

  const formatJoiningDate = (dateVal) => {
    if (!dateVal) return 'Not recorded';
    try {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) return format(d, 'dd MMM yyyy');
      return String(dateVal);
    } catch {
      return String(dateVal);
    }
  };

  const formatTimeStr = (raw) => {
    if (!raw) return '--:--';
    try {
      if (typeof raw === 'string' && raw.includes(':') && !raw.includes('T')) return raw.slice(0, 5);
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return format(d, 'hh:mm a');
      return String(raw);
    } catch {
      return '--:--';
    }
  };

  const formatCurrency = (val) => {
    const num = Number(val || 0);
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-5xl lg:max-w-6xl w-full p-0 overflow-hidden bg-[#FFFFFF] dark:bg-[#0D2028] border-[#D5E5D7] dark:border-[#203A42] text-foreground rounded-2xl shadow-2xl max-h-[92vh] flex flex-col focus:outline-none"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Employee Profile: {empName}</DialogTitle>
          <DialogDescription>Comprehensive employee view including attendance, payroll, tasks, and projects.</DialogDescription>
        </DialogHeader>

        {/* 1. TOP HEADER & BANNER */}
        <div className="relative bg-gradient-to-r from-[#F0FDF4]/80 via-[#F8FAF9] to-[#E6F7F5] dark:from-[#091E24] dark:via-[#0D2028] dark:to-[#10252D] border-b border-[#D5E5D7] dark:border-[#203A42] p-5 sm:p-6 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            {/* Avatar & Employee Identity */}
            <div className="flex items-start gap-4 min-w-0">
              <div className="relative shrink-0">
                <SafeAvatar
                  src={employee.avatar}
                  name={empName}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 border-white dark:border-[#203A42] shadow-md ring-2 ring-[#15966A]/20 dark:ring-[#45CFC0]/30"
                />
                <span
                  className={cn(
                    'absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-[#0D2028]',
                    isSuspended ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'
                  )}
                  title={displayStatus}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1F2937] dark:text-[#E8F0F4] truncate">
                    {empName}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-semibold bg-primary/10 text-primary dark:text-[#45CFC0] border border-primary/20 dark:border-[#45CFC0]/30 shrink-0">
                    ID: {displayStaffId}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs font-semibold px-2 py-0.5 rounded-full capitalize',
                      isSuspended
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    )}
                  >
                    {displayStatus}
                  </Badge>
                </div>

                <p className="text-xs sm:text-sm font-medium text-muted-foreground dark:text-[#A8BAC3] mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[#1F2937] dark:text-[#E8F0F4] font-semibold">{displayDesignation}</span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-primary dark:text-[#45CFC0]" />
                    {displayDepartment}
                  </span>
                  {displayCompanyName && (
                    <>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-primary dark:text-[#45CFC0]">
                        <Building2 className="w-3.5 h-3.5" />
                        {displayCompanyName}
                      </span>
                    </>
                  )}
                </p>

                {/* Contact & Meta Badges */}
                <div className="flex items-center gap-3 sm:gap-4 mt-3 text-xs text-muted-foreground dark:text-[#A8BAC3] flex-wrap">
                  <div className="inline-flex items-center gap-1.5 hover:text-foreground dark:hover:text-[#E8F0F4] transition-colors">
                    <Mail className="w-3.5 h-3.5 text-primary/70 dark:text-[#45CFC0]/70" />
                    <span className="truncate max-w-[200px]">{displayEmail}</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-primary/70 dark:text-[#45CFC0]/70" />
                    <span>{displayPhone}</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-primary/70 dark:text-[#45CFC0]/70" />
                    <span>Joined: {formatJoiningDate(employee.joiningDate || employee.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Back / Close Action */}
            <div className="flex items-center gap-2 self-start shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="gap-1.5 rounded-xl border-[#D5E5D7] dark:border-[#203A42] bg-background dark:bg-[#10252D] text-muted-foreground hover:text-foreground dark:hover:text-[#E8F0F4] hover:bg-secondary dark:hover:bg-[#142E35] transition-colors cursor-pointer text-xs font-semibold shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Dashboard</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground dark:hover:text-[#E8F0F4] hover:bg-secondary dark:hover:bg-[#142E35] cursor-pointer"
                title="Close Profile (Esc)"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* 2. TAB NAVIGATION BAR */}
        <div className="px-5 sm:px-6 border-b border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#0D2028] shrink-0">
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-2.5 scrollbar-thin">
            {[
              { id: 'overview', label: 'Overview', icon: Layers },
              { id: 'attendance', label: 'Attendance', icon: Clock, count: userAttendanceLogs.length },
              { id: 'salary', label: 'Salary & Payroll', icon: DollarSign },
              { id: 'tasks', label: 'Tasks', icon: CheckCircle2, count: employeeTasks.length },
              { id: 'projects', label: 'Projects', icon: FolderKanban, count: employeeProjects.length },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap',
                    isActive
                      ? 'bg-primary/10 dark:bg-[#123A3C] text-primary dark:text-[#45CFC0] border border-primary/20 dark:border-[#176B68] shadow-2xs'
                      : 'text-muted-foreground dark:text-[#A8BAC3] hover:text-foreground dark:hover:text-[#E8F0F4] hover:bg-secondary/60 dark:hover:bg-[#142E35]'
                  )}
                >
                  <Icon className={cn('w-4 h-4', isActive ? 'text-primary dark:text-[#45CFC0]' : 'text-muted-foreground dark:text-[#688A84]')} />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={cn(
                        'px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                        isActive
                          ? 'bg-primary/20 dark:bg-[#45CFC0]/20 text-primary dark:text-[#45CFC0]'
                          : 'bg-secondary dark:bg-[#142E35] text-muted-foreground dark:text-[#A8BAC3]'
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. SCROLLABLE TAB CONTENT BODY */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 scrollbar-thin">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in-50 duration-200">
              {/* Top 4 Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Attendance Card */}
                <Card
                  onClick={() => setActiveTab('attendance')}
                  className="p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#10252D] hover:border-primary/40 dark:hover:border-[#45CFC0]/40 transition-all cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground dark:text-[#A8BAC3]">Attendance Rate</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#1F2937] dark:text-[#E8F0F4] mt-1">
                        {attendanceMetrics.rate}%
                      </h3>
                      <p className="text-[11px] text-muted-foreground dark:text-[#A8BAC3] mt-2 flex items-center gap-1.5">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{attendanceMetrics.present} Present</span>
                        <span>•</span>
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">{attendanceMetrics.late} Late</span>
                        <span>•</span>
                        <span className="text-rose-600 dark:text-rose-400 font-semibold">{attendanceMetrics.absent} Absent</span>
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-primary/10 dark:bg-[#123A3C] text-primary dark:text-[#45CFC0] group-hover:scale-105 transition-transform">
                      <Clock className="w-5 h-5" />
                    </div>
                  </div>
                </Card>

                {/* Salary Card */}
                <Card
                  onClick={() => setActiveTab('salary')}
                  className="p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#10252D] hover:border-primary/40 dark:hover:border-[#45CFC0]/40 transition-all cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground dark:text-[#A8BAC3]">Base Compensation</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#1F2937] dark:text-[#E8F0F4] mt-1">
                        {formatCurrency(payrollData?.baseSalary || employee.salary || 0)}
                      </h3>
                      <div className="text-[11px] text-muted-foreground dark:text-[#A8BAC3] mt-2 flex items-center gap-1.5">
                        <span className="font-semibold text-foreground dark:text-[#E8F0F4]">{selectedMonth}</span>
                        <span>•</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-1.5 py-0 rounded capitalize font-semibold',
                            payrollData?.paymentStatus === 'paid'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                          )}
                        >
                          {payrollData?.paymentStatus || 'Draft'}
                        </Badge>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-primary/10 dark:bg-[#123A3C] text-primary dark:text-[#45CFC0] group-hover:scale-105 transition-transform">
                      <DollarSign className="w-5 h-5" />
                    </div>
                  </div>
                </Card>

                {/* Tasks Card */}
                <Card
                  onClick={() => setActiveTab('tasks')}
                  className="p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#10252D] hover:border-primary/40 dark:hover:border-[#45CFC0]/40 transition-all cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground dark:text-[#A8BAC3]">Assigned Tasks</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#1F2937] dark:text-[#E8F0F4] mt-1">
                        {taskMetrics.completed} <span className="text-sm font-normal text-muted-foreground dark:text-[#A8BAC3]">/ {taskMetrics.total}</span>
                      </h3>
                      <p className="text-[11px] text-muted-foreground dark:text-[#A8BAC3] mt-2 flex items-center gap-1.5">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{taskMetrics.completed} Done</span>
                        <span>•</span>
                        <span className="text-sky-600 dark:text-sky-400 font-semibold">{taskMetrics.inProgress} Active</span>
                        <span>•</span>
                        <span className="text-muted-foreground dark:text-[#A8BAC3] font-semibold">{taskMetrics.pending} Pending</span>
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-primary/10 dark:bg-[#123A3C] text-primary dark:text-[#45CFC0] group-hover:scale-105 transition-transform">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  </div>
                </Card>

                {/* Projects Card */}
                <Card
                  onClick={() => setActiveTab('projects')}
                  className="p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#10252D] hover:border-primary/40 dark:hover:border-[#45CFC0]/40 transition-all cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground dark:text-[#A8BAC3]">Assigned Projects</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#1F2937] dark:text-[#E8F0F4] mt-1">
                        {projectMetrics.total}
                      </h3>
                      <p className="text-[11px] text-muted-foreground dark:text-[#A8BAC3] mt-2 flex items-center gap-1.5">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{projectMetrics.active} Active</span>
                        <span>•</span>
                        <span className="text-sky-600 dark:text-sky-400 font-semibold">{projectMetrics.completed} Completed</span>
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-primary/10 dark:bg-[#123A3C] text-primary dark:text-[#45CFC0] group-hover:scale-105 transition-transform">
                      <FolderKanban className="w-5 h-5" />
                    </div>
                  </div>
                </Card>
              </div>

              {/* 2-Column Overview Details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Attendance Preview */}
                <div className="border border-[#D5E5D7] dark:border-[#203A42] rounded-2xl bg-card dark:bg-[#10252D] p-5 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary dark:text-[#45CFC0]" />
                        <h4 className="text-sm font-bold text-[#1F2937] dark:text-[#E8F0F4]">Recent Attendance Logs</h4>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveTab('attendance')}
                        className="text-xs text-primary dark:text-[#45CFC0] hover:bg-primary/10 dark:hover:bg-[#142E35] h-7 px-2 cursor-pointer"
                      >
                        View All ({userAttendanceLogs.length}) →
                      </Button>
                    </div>

                    {userAttendanceLogs.length === 0 ? (
                      <div className="p-6 text-center text-xs text-muted-foreground dark:text-[#A8BAC3]">
                        <Clock className="w-6 h-6 mx-auto mb-2 opacity-40 text-primary" />
                        No attendance records available for this employee yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-[#D5E5D7]/50 dark:divide-[#203A42]/50">
                        {userAttendanceLogs.slice(0, 5).map((log, idx) => (
                          <div key={log._id || log.id || idx} className="py-2.5 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-semibold text-[#1F2937] dark:text-[#E8F0F4]">
                                {log.date ? format(new Date(log.date), 'EEE, dd MMM yyyy') : 'Recent'}
                              </p>
                              <p className="text-[11px] text-muted-foreground dark:text-[#A8BAC3] mt-0.5">
                                In: {formatTimeStr(log.checkIn)} • Out: {formatTimeStr(log.checkOut)}
                                {log.workingHours ? ` • ${log.workingHours} hrs` : ''}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] px-2 py-0.5 rounded-full capitalize font-semibold',
                                String(log.status || '').toLowerCase() === 'present'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                  : String(log.status || '').toLowerCase() === 'late'
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                              )}
                            >
                              {formatStatus(log.status, false)}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Tasks Preview */}
                <div className="border border-[#D5E5D7] dark:border-[#203A42] rounded-2xl bg-card dark:bg-[#10252D] p-5 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary dark:text-[#45CFC0]" />
                        <h4 className="text-sm font-bold text-[#1F2937] dark:text-[#E8F0F4]">Assigned Tasks</h4>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveTab('tasks')}
                        className="text-xs text-primary dark:text-[#45CFC0] hover:bg-primary/10 dark:hover:bg-[#142E35] h-7 px-2 cursor-pointer"
                      >
                        View All ({employeeTasks.length}) →
                      </Button>
                    </div>

                    {employeeTasks.length === 0 ? (
                      <div className="p-6 text-center text-xs text-muted-foreground dark:text-[#A8BAC3]">
                        <CheckCircle2 className="w-6 h-6 mx-auto mb-2 opacity-40 text-primary" />
                        No tasks currently assigned to this employee.
                      </div>
                    ) : (
                      <div className="divide-y divide-[#D5E5D7]/50 dark:divide-[#203A42]/50">
                        {employeeTasks.slice(0, 4).map((task) => (
                          <div key={task.id || task._id} className="py-2.5 flex items-center justify-between text-xs gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-[#1F2937] dark:text-[#E8F0F4] truncate">
                                {task.title}
                              </p>
                              <p className="text-[11px] text-muted-foreground dark:text-[#A8BAC3] mt-0.5 truncate">
                                {task.projectName ? `Project: ${task.projectName} • ` : ''}
                                Due: {task.dueDate ? format(new Date(task.dueDate), 'dd MMM yyyy') : 'No due date'}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={cn(
                                  'text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize',
                                  task.status === 'done' || task.status === 'completed'
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : task.status === 'in_progress'
                                    ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                                    : 'bg-secondary dark:bg-[#142E35] text-muted-foreground dark:text-[#A8BAC3]'
                                )}
                              >
                                {task.status?.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Personal & Employment Details Row */}
              <div className="border border-[#D5E5D7] dark:border-[#203A42] rounded-2xl bg-card dark:bg-[#10252D] p-5 shadow-xs">
                <h4 className="text-sm font-bold text-[#1F2937] dark:text-[#E8F0F4] mb-3 flex items-center gap-2">
                  <User className="w-4 h-4 text-primary dark:text-[#45CFC0]" />
                  Personal & Employment Profile
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground dark:text-[#A8BAC3] block text-[11px]">Full Name</span>
                    <span className="font-semibold text-[#1F2937] dark:text-[#E8F0F4] mt-0.5 block">{empName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground dark:text-[#A8BAC3] block text-[11px]">Employee ID (StaffId)</span>
                    <span className="font-semibold text-[#1F2937] dark:text-[#E8F0F4] mt-0.5 block font-mono">{displayStaffId}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground dark:text-[#A8BAC3] block text-[11px]">Department</span>
                    <span className="font-semibold text-[#1F2937] dark:text-[#E8F0F4] mt-0.5 block">{displayDepartment}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground dark:text-[#A8BAC3] block text-[11px]">Designation</span>
                    <span className="font-semibold text-[#1F2937] dark:text-[#E8F0F4] mt-0.5 block">{displayDesignation}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground dark:text-[#A8BAC3] block text-[11px]">Gender</span>
                    <span className="font-semibold text-[#1F2937] dark:text-[#E8F0F4] mt-0.5 block">{employee.gender || 'Not specified'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground dark:text-[#A8BAC3] block text-[11px]">Date of Birth</span>
                    <span className="font-semibold text-[#1F2937] dark:text-[#E8F0F4] mt-0.5 block">{employee.dateOfBirth || 'Not specified'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground dark:text-[#A8BAC3] block text-[11px]">Reporting Manager</span>
                    <span className="font-semibold text-[#1F2937] dark:text-[#E8F0F4] mt-0.5 block">
                      {employee.managerName || employee.reportingManager || 'Company Administration'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground dark:text-[#A8BAC3] block text-[11px]">Organization / Company</span>
                    <span className="font-semibold text-primary dark:text-[#45CFC0] mt-0.5 block truncate" title={displayCompanyName || 'Registered Organization'}>
                      {displayCompanyName || 'Registered Organization'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground dark:text-[#A8BAC3] block text-[11px]">Address</span>
                    <span className="font-semibold text-[#1F2937] dark:text-[#E8F0F4] mt-0.5 block truncate" title={employee.address}>
                      {employee.address || 'On file'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ATTENDANCE DETAILS */}
          {activeTab === 'attendance' && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              {/* Header and Filter */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary/30 dark:bg-[#10252D] p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42]">
                <div>
                  <h4 className="text-sm font-bold text-[#1F2937] dark:text-[#E8F0F4] flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary dark:text-[#45CFC0]" />
                    Attendance Records & History
                  </h4>
                  <p className="text-xs text-muted-foreground dark:text-[#A8BAC3] mt-0.5">
                    Total recorded sessions: {filteredAttendance.length} records
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground dark:text-[#A8BAC3]">Filter:</span>
                  <select
                    value={attendanceMonthFilter}
                    onChange={(e) => setAttendanceMonthFilter(e.target.value)}
                    className="h-8 px-2.5 rounded-lg text-xs bg-background dark:bg-[#0D2028] border border-[#D5E5D7] dark:border-[#203A42] text-foreground font-medium outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="all">All Available Records</option>
                    {[...Array(12)].map((_, i) => {
                      const m = String(i + 1).padStart(2, '0');
                      const val = `${selectedYear}-${m}`;
                      const label = format(new Date(selectedYear, i, 1), 'MMMM yyyy');
                      return <option key={val} value={val}>{label}</option>;
                    })}
                  </select>
                </div>
              </div>

              {/* Attendance Table */}
              {attendanceLoading ? (
                <div className="p-12 text-center text-xs text-muted-foreground dark:text-[#A8BAC3]">
                  <Clock className="w-6 h-6 mx-auto mb-2 text-primary animate-spin" />
                  Loading attendance records...
                </div>
              ) : filteredAttendance.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground dark:text-[#A8BAC3] border border-dashed border-[#D5E5D7] dark:border-[#203A42] rounded-xl">
                  <CalendarX className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40 dark:text-[#688A84]" />
                  <p className="font-semibold text-foreground dark:text-[#E8F0F4]">No attendance records found</p>
                  <p className="text-[11px] mt-1 text-muted-foreground/80 dark:text-[#A8BAC3]/80">No check-in or attendance logs exist for this period.</p>
                </div>
              ) : (
                <div className="border border-[#D5E5D7] dark:border-[#203A42] rounded-xl overflow-hidden bg-card dark:bg-[#10252D] shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-secondary/40 dark:bg-[#0D2028] border-b border-[#D5E5D7] dark:border-[#203A42] text-muted-foreground dark:text-[#A8BAC3] font-semibold text-[11px]">
                          <th className="py-2.5 px-3.5">Date</th>
                          <th className="py-2.5 px-3">Check-In</th>
                          <th className="py-2.5 px-3">Check-Out</th>
                          <th className="py-2.5 px-3">Working Hours</th>
                          <th className="py-2.5 px-3">Official Break</th>
                          <th className="py-2.5 px-3">Casual Break</th>
                          <th className="py-2.5 px-3">Late Status</th>
                          <th className="py-2.5 px-3.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D5E5D7]/50 dark:divide-[#203A42]/50">
                        {filteredAttendance.map((log, idx) => {
                          const statusStr = String(log.status || 'present').toLowerCase();
                          const isLate = statusStr === 'late' || (log.lateStatus && log.lateStatus !== 'on_time');
                          const isAbsent = statusStr === 'absent';
                          const isPresent = statusStr === 'present' || statusStr === 'half_day';

                          return (
                            <tr key={log._id || log.id || idx} className="hover:bg-secondary/30 dark:hover:bg-[#142E35] transition-colors">
                              <td className="py-3 px-3.5 font-semibold text-[#1F2937] dark:text-[#E8F0F4] whitespace-nowrap">
                                {log.date ? format(new Date(log.date), 'EEE, dd MMM yyyy') : 'Recent'}
                              </td>
                              <td className="py-3 px-3 text-muted-foreground dark:text-[#A8BAC3] whitespace-nowrap">
                                {formatTimeStr(log.checkIn)}
                              </td>
                              <td className="py-3 px-3 text-muted-foreground dark:text-[#A8BAC3] whitespace-nowrap">
                                {formatTimeStr(log.checkOut)}
                              </td>
                              <td className="py-3 px-3 font-medium text-foreground dark:text-[#E8F0F4] whitespace-nowrap">
                                {log.workingHours ? `${log.workingHours} hrs` : '--'}
                              </td>
                              <td className="py-3 px-3 text-muted-foreground dark:text-[#A8BAC3] whitespace-nowrap">
                                {log.breakMinutes ? `${log.breakMinutes} mins` : (log.breakDuration || '--')}
                              </td>
                              <td className="py-3 px-3 text-muted-foreground dark:text-[#A8BAC3] whitespace-nowrap">
                                {log.casualBreakMinutes ? `${log.casualBreakMinutes} mins` : (log.casualBreakDuration || '--')}
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                {isLate ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                    <AlertTriangle className="w-3 h-3" />
                                    {log.lateDelayMinutes ? `${log.lateDelayMinutes}m late` : 'Late'}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">On time</span>
                                )}
                              </td>
                              <td className="py-3 px-3.5 text-right whitespace-nowrap">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[10px] px-2 py-0.5 rounded-full capitalize font-semibold',
                                    isPresent
                                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                      : isLate
                                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                  )}
                                >
                                  {formatStatus(log.status, false)}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SALARY & PAYROLL DETAILS */}
          {activeTab === 'salary' && (
            <div className="space-y-6 animate-in fade-in-50 duration-200">
              {/* Month Selector Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary/30 dark:bg-[#10252D] p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42]">
                <div>
                  <h4 className="text-sm font-bold text-[#1F2937] dark:text-[#E8F0F4] flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-primary dark:text-[#45CFC0]" />
                    Payroll Computation & Payment Records
                  </h4>
                  <p className="text-xs text-muted-foreground dark:text-[#A8BAC3] mt-0.5">
                    Viewing calculation for period: <span className="font-semibold text-foreground dark:text-[#E8F0F4]">{selectedMonth}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground dark:text-[#A8BAC3]">Month:</span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="h-8 px-2.5 rounded-lg text-xs bg-background dark:bg-[#0D2028] border border-[#D5E5D7] dark:border-[#203A42] text-foreground font-medium outline-none focus:border-primary cursor-pointer"
                  />
                </div>
              </div>

              {payrollLoading ? (
                <div className="p-12 text-center text-xs text-muted-foreground dark:text-[#A8BAC3]">
                  <DollarSign className="w-6 h-6 mx-auto mb-2 text-primary animate-spin" />
                  Calculating live payroll details...
                </div>
              ) : payrollError ? (
                <div className="p-8 text-center text-xs text-rose-500 border border-rose-500/20 rounded-xl bg-rose-500/5">
                  <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                  {payrollError}
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Payroll Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card className="p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#10252D] shadow-2xs">
                      <span className="text-xs text-muted-foreground dark:text-[#A8BAC3]">Base Salary</span>
                      <h3 className="text-2xl font-bold text-[#1F2937] dark:text-[#E8F0F4] mt-1">
                        {formatCurrency(payrollData?.baseSalary || employee.salary || 0)}
                      </h3>
                      <p className="text-[11px] text-muted-foreground dark:text-[#A8BAC3] mt-1">Configured monthly basic</p>
                    </Card>

                    <Card className="p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#10252D] shadow-2xs">
                      <span className="text-xs text-muted-foreground dark:text-[#A8BAC3]">Total Deductions</span>
                      <h3 className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
                        -{formatCurrency(payrollData?.totalDeductions || 0)}
                      </h3>
                      <p className="text-[11px] text-muted-foreground dark:text-[#A8BAC3] mt-1">
                        Late, break delays & unapproved leaves
                      </p>
                    </Card>

                    <Card className="p-4 rounded-xl border border-primary/30 dark:border-[#45CFC0]/30 bg-primary/5 dark:bg-[#123A3C]/40 shadow-2xs">
                      <span className="text-xs text-primary dark:text-[#45CFC0] font-semibold">Net Payable</span>
                      <h3 className="text-2xl font-extrabold text-primary dark:text-[#45CFC0] mt-1">
                        {formatCurrency(payrollData?.totalAmount || payrollData?.netPayable || employee.salary || 0)}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-1.5 py-0 capitalize font-bold',
                            payrollData?.paymentStatus === 'paid'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                          )}
                        >
                          Status: {payrollData?.paymentStatus || 'Draft'}
                        </Badge>
                      </div>
                    </Card>
                  </div>

                  {/* Detailed Breakdown Table */}
                  <div className="border border-[#D5E5D7] dark:border-[#203A42] rounded-xl overflow-hidden bg-card dark:bg-[#10252D] p-5 shadow-2xs">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-[#A8BAC3] mb-4">
                      Earnings & Deductions Itemization
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                      {/* Additions / Earnings */}
                      <div className="space-y-2.5">
                        <p className="font-bold text-emerald-600 dark:text-emerald-400 text-xs border-b border-[#D5E5D7] dark:border-[#203A42] pb-1">
                          Earnings & Additions
                        </p>
                        <div className="flex justify-between py-1 border-b border-border/40">
                          <span className="text-muted-foreground dark:text-[#A8BAC3]">Base Gross Salary</span>
                          <span className="font-semibold text-foreground dark:text-[#E8F0F4]">
                            {formatCurrency(payrollData?.baseSalary || employee.salary || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border/40">
                          <span className="text-muted-foreground dark:text-[#A8BAC3]">Hourly Overtime Addition</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            +{formatCurrency(payrollData?.hourlyOvertimeAddition || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border/40">
                          <span className="text-muted-foreground dark:text-[#A8BAC3]">Bonuses & Allowances</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            +{formatCurrency(payrollData?.bonus || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 font-bold text-foreground dark:text-[#E8F0F4]">
                          <span>Total Gross Additions</span>
                          <span>{formatCurrency((payrollData?.baseSalary || 0) + (payrollData?.hourlyOvertimeAddition || 0) + (payrollData?.bonus || 0))}</span>
                        </div>
                      </div>

                      {/* Deductions */}
                      <div className="space-y-2.5">
                        <p className="font-bold text-rose-600 dark:text-rose-400 text-xs border-b border-[#D5E5D7] dark:border-[#203A42] pb-1">
                          Calculated Deductions
                        </p>
                        <div className="flex justify-between py-1 border-b border-border/40">
                          <span className="text-muted-foreground dark:text-[#A8BAC3]">Late Arrival Deductions</span>
                          <span className="font-semibold text-rose-600 dark:text-rose-400">
                            -{formatCurrency(payrollData?.lateDeduction || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border/40">
                          <span className="text-muted-foreground dark:text-[#A8BAC3]">Excess Break Delay</span>
                          <span className="font-semibold text-rose-600 dark:text-rose-400">
                            -{formatCurrency(payrollData?.breakDelayDeduction || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border/40">
                          <span className="text-muted-foreground dark:text-[#A8BAC3]">Unapproved Leaves / Absences</span>
                          <span className="font-semibold text-rose-600 dark:text-rose-400">
                            -{formatCurrency(payrollData?.unapprovedLeaveDeduction || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border/40">
                          <span className="text-muted-foreground dark:text-[#A8BAC3]">Half Day / Other Deductions</span>
                          <span className="font-semibold text-rose-600 dark:text-rose-400">
                            -{formatCurrency(payrollData?.halfDayDeduction || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 font-bold text-foreground dark:text-[#E8F0F4]">
                          <span>Total Deductions</span>
                          <span className="text-rose-600 dark:text-rose-400">-{formatCurrency(payrollData?.totalDeductions || 0)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Payment Transactions Log */}
                  <div className="border border-[#D5E5D7] dark:border-[#203A42] rounded-xl overflow-hidden bg-card dark:bg-[#10252D] p-5 shadow-2xs">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-[#A8BAC3] mb-3">
                      Payment Transactions & Receipts ({employeeTransactions.length})
                    </h5>
                    {employeeTransactions.length === 0 ? (
                      <p className="text-xs text-muted-foreground dark:text-[#A8BAC3] py-2">
                        No recent transactions recorded for this employee.
                      </p>
                    ) : (
                      <div className="divide-y divide-[#D5E5D7]/50 dark:divide-[#203A42]/50">
                        {employeeTransactions.map((tx) => (
                          <div key={tx.id || tx._id} className="py-2.5 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-semibold text-[#1F2937] dark:text-[#E8F0F4]">
                                {tx.paidAt ? format(new Date(tx.paidAt), 'dd MMM yyyy, hh:mm a') : 'Processed'}
                              </p>
                              <p className="text-[11px] text-muted-foreground dark:text-[#A8BAC3] mt-0.5">
                                Ref: <span className="font-mono">{tx.referenceId || tx.id}</span> • Method: {tx.paymentMethod?.replace('_', ' ') || 'Bank Transfer'}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-emerald-600 dark:text-emerald-400 block">
                                {formatCurrency(tx.amount)}
                              </span>
                              <span className="text-[10px] text-muted-foreground capitalize">
                                {tx.status || 'Completed'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: TASKS DETAILS */}
          {activeTab === 'tasks' && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              {/* Header and Filter */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary/30 dark:bg-[#10252D] p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42]">
                <div>
                  <h4 className="text-sm font-bold text-[#1F2937] dark:text-[#E8F0F4] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary dark:text-[#45CFC0]" />
                    Assigned Tasks & Deliverables
                  </h4>
                  <p className="text-xs text-muted-foreground dark:text-[#A8BAC3] mt-0.5">
                    Completed: {taskMetrics.completed} of {taskMetrics.total} tasks ({taskMetrics.completionRate}%)
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'in_progress', label: 'In Progress' },
                    { id: 'pending', label: 'Pending' },
                    { id: 'completed', label: 'Completed' },
                    { id: 'overdue', label: 'Overdue' },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setTaskFilter(filter.id)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                        taskFilter === filter.id
                          ? 'bg-primary dark:bg-[#45CFC0] text-primary-foreground dark:text-[#0D2028]'
                          : 'bg-background dark:bg-[#0D2028] text-muted-foreground dark:text-[#A8BAC3] hover:text-foreground dark:hover:text-[#E8F0F4] border border-[#D5E5D7] dark:border-[#203A42]'
                      )}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tasks List */}
              {filteredTasks.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground dark:text-[#A8BAC3] border border-dashed border-[#D5E5D7] dark:border-[#203A42] rounded-xl">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40 dark:text-[#688A84]" />
                  <p className="font-semibold text-foreground dark:text-[#E8F0F4]">No tasks found</p>
                  <p className="text-[11px] mt-1 text-muted-foreground/80 dark:text-[#A8BAC3]/80">No tasks match the active filter criteria.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredTasks.map((task) => {
                    const isCompleted = task.status === 'done' || task.status === 'completed';
                    const isInProgress = task.status === 'in_progress' || task.status === 'review';
                    const priorityColor =
                      task.priority === 'high'
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                        : task.priority === 'medium'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                        : 'bg-secondary text-muted-foreground border-border';

                    return (
                      <Card
                        key={task.id || task._id}
                        className="p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#10252D] shadow-2xs flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h5 className="font-bold text-sm text-[#1F2937] dark:text-[#E8F0F4] line-clamp-2">
                              {task.title}
                            </h5>
                            <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0 font-semibold', priorityColor)}>
                              {task.priority || 'Medium'}
                            </Badge>
                          </div>

                          {task.description && (
                            <p className="text-xs text-muted-foreground dark:text-[#A8BAC3] line-clamp-2 mb-3">
                              {task.description}
                            </p>
                          )}

                          {task.projectName && (
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-secondary/60 dark:bg-[#142E35] text-[11px] font-medium text-muted-foreground dark:text-[#A8BAC3] mb-3">
                              <FolderKanban className="w-3 h-3 text-primary dark:text-[#45CFC0]" />
                              <span className="truncate">{task.projectName}</span>
                            </div>
                          )}
                        </div>

                        <div className="pt-3 border-t border-[#D5E5D7]/50 dark:border-[#203A42]/50 flex items-center justify-between text-xs text-muted-foreground dark:text-[#A8BAC3]">
                          <span>Due: {task.dueDate ? format(new Date(task.dueDate), 'dd MMM yyyy') : 'No due date'}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] px-2 py-0.5 rounded-full capitalize font-semibold',
                              isCompleted
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : isInProgress
                                ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
                                : 'bg-secondary dark:bg-[#142E35] text-muted-foreground dark:text-[#A8BAC3]'
                            )}
                          >
                            {task.status?.replace('_', ' ')}
                          </Badge>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: PROJECTS DETAILS */}
          {activeTab === 'projects' && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              {/* Header and Filter */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary/30 dark:bg-[#10252D] p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42]">
                <div>
                  <h4 className="text-sm font-bold text-[#1F2937] dark:text-[#E8F0F4] flex items-center gap-2">
                    <FolderKanban className="w-4 h-4 text-primary dark:text-[#45CFC0]" />
                    Associated Projects
                  </h4>
                  <p className="text-xs text-muted-foreground dark:text-[#A8BAC3] mt-0.5">
                    Assigned to {projectMetrics.total} projects ({projectMetrics.active} active, {projectMetrics.completed} completed)
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { id: 'all', label: 'All Projects' },
                    { id: 'active', label: 'Active' },
                    { id: 'completed', label: 'Completed' },
                    { id: 'planning', label: 'Planning' },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setProjectFilter(filter.id)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                        projectFilter === filter.id
                          ? 'bg-primary dark:bg-[#45CFC0] text-primary-foreground dark:text-[#0D2028]'
                          : 'bg-background dark:bg-[#0D2028] text-muted-foreground dark:text-[#A8BAC3] hover:text-foreground dark:hover:text-[#E8F0F4] border border-[#D5E5D7] dark:border-[#203A42]'
                      )}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredProjects.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground dark:text-[#A8BAC3] border border-dashed border-[#D5E5D7] dark:border-[#203A42] rounded-xl">
                  <FolderKanban className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40 dark:text-[#688A84]" />
                  <p className="font-semibold text-foreground dark:text-[#E8F0F4]">No projects found</p>
                  <p className="text-[11px] mt-1 text-muted-foreground/80 dark:text-[#A8BAC3]/80">This employee is not currently assigned to projects matching this filter.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filteredProjects.map((project) => {
                    const metrics = project.taskMetrics || { total: 0, completed: 0, inProgress: 0 };
                    const progressPct = metrics.total > 0 ? Math.round((metrics.completed / metrics.total) * 100) : (project.status === 'completed' ? 100 : 0);

                    // Find employee specific role in this project
                    const userAssignment = project.assignedEmployees?.find(e => {
                      const uId = toIdText(e.userId || e.id);
                      return uId === empUserId || uId === empStaffId;
                    });
                    const roleInProject = userAssignment?.department ? `${userAssignment.department} Specialist` : 'Project Contributor';

                    return (
                      <Card
                        key={project.id || project._id}
                        className="p-5 rounded-xl border border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#10252D] shadow-2xs space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <h5 className="font-bold text-base text-[#1F2937] dark:text-[#E8F0F4]">
                                {project.name}
                              </h5>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] px-2 py-0.5 rounded-full capitalize font-semibold',
                                  project.status === 'completed'
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                    : project.status === 'active'
                                    ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
                                    : 'bg-secondary text-muted-foreground border-border'
                                )}
                              >
                                {formatStatus(project.status, false)}
                              </Badge>
                            </div>

                            {project.description && (
                              <p className="text-xs text-muted-foreground dark:text-[#A8BAC3] mt-1">
                                {project.description}
                              </p>
                            )}

                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground dark:text-[#A8BAC3]">
                              <span className="inline-flex items-center gap-1 font-medium text-foreground dark:text-[#E8F0F4]">
                                <Tag className="w-3.5 h-3.5 text-primary dark:text-[#45CFC0]" />
                                Role: {roleInProject}
                              </span>
                              <span>•</span>
                              <span>
                                Start: {project.startDate ? format(new Date(project.startDate), 'dd MMM yyyy') : 'Recorded'}
                              </span>
                              <span>•</span>
                              <span>
                                Due: {project.dueDate ? format(new Date(project.dueDate), 'dd MMM yyyy') : 'No target date'}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-sm font-bold text-primary dark:text-[#45CFC0]">
                              {progressPct}% Completed
                            </span>
                            <span className="block text-[11px] text-muted-foreground dark:text-[#A8BAC3]">
                              {metrics.completed} / {metrics.total} tasks finished
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-secondary/80 dark:bg-[#0D2028] h-2 rounded-full overflow-hidden border border-border/40">
                          <div
                            className="bg-primary dark:bg-[#45CFC0] h-full transition-all duration-300 rounded-full"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
