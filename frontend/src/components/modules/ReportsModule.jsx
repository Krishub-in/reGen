import { useState, useMemo, useRef } from 'react';
import {
  FileBarChart,
  Clock,
  DollarSign,
  Download,
  Printer,
  Mail,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  Building2,
  User,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  CreditCard,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Send,
  Sparkles,
  ClipboardList,
  CheckSquare,
  Play,
  Pause,
  XCircle,
  FolderKanban,
  ChevronDown,
  ChevronUp,
  Layers,
  Award,
  Users,
  Briefcase,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatDeadline, parseDateString } from '@/lib/taskUtils';
import VoiceNoteBadgePlayer, { extractVoiceNote } from '../VoiceNoteBadgePlayer';
import {
  useGetAttendanceReport,
  useSendAttendanceReport,
  useGetPayrollReport,
  useSendPayrollReport,
  useGetSchedulesReport,
  useSendSchedulesReport,
  useGetCompanyInfo,
  useGetProjects,
  useGetAllTasks,
  useGetAllUsers,
} from '../../hooks/useQueries';

export default function ReportsModule({ userProfile }) {
  const { data: companyInfo } = useGetCompanyInfo();
  const companyName = companyInfo?.name || userProfile?.companyName || userProfile?.tenantName || 'Company';

  // Active Report Tab: 'attendance' | 'payments' | 'schedules' | 'projects'
  const [activeReportTab, setActiveReportTab] = useState('attendance');

  // Time Granularity: 'day' | 'week' | 'month' | 'year'
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  const currentMonthStr = format(now, 'yyyy-MM');
  const currentYearStr = String(now.getFullYear());

  const [period, setPeriod] = useState('month'); // 'day' | 'week' | 'month' | 'year'
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedWeek, setSelectedWeek] = useState(todayStr);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [selectedYear, setSelectedYear] = useState(currentYearStr);

  // Selected project in Projects Report
  const [selectedReportProjectId, setSelectedReportProjectId] = useState(null);
  const [selectedReportProjectEmployeeFilter, setSelectedReportProjectEmployeeFilter] = useState('all');
  const [projectTaskStatusFilter, setProjectTaskStatusFilter] = useState('all'); // 'all' | 'completed' | 'in_progress' | 'not_completed'

  // Filters
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState('all');

  // Accordion state for employees in schedules report
  const [expandedEmployees, setExpandedEmployees] = useState(new Set());
  const toggleEmployeeExpanded = (userId) => {
    setExpandedEmployees((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // Email Dialog State
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(userProfile?.email || '');
  const [emailNotes, setEmailNotes] = useState('');

  // Precise month range from 1 to 31 (inclusive of all days in the month)
  const monthRange = useMemo(() => {
    try {
      const [yStr, mStr] = selectedMonth.split('-');
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const lastDay = new Date(y, m, 0).getDate();
      const pad2 = (n) => String(n).padStart(2, '0');
      const startStr = `${y}-${pad2(m)}-01`;
      const endStr = `${y}-${pad2(m)}-${pad2(lastDay)}`;
      const startDate = new Date(y, m - 1, 1, 0, 0, 0, 0);
      const endDate = new Date(y, m - 1, lastDay, 23, 59, 59, 999);
      return { startStr, endStr, startDate, endDate, lastDay };
    } catch {
      const now = new Date();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      return {
        startStr: `${now.getFullYear()}-01-01`,
        endStr: `${now.getFullYear()}-01-${lastDay}`,
        startDate: new Date(),
        endDate: new Date(),
        lastDay: 31,
      };
    }
  }, [selectedMonth]);

  // Week interval computation
  const weekInterval = useMemo(() => {
    try {
      const anchor = new Date(selectedWeek + 'T00:00:00');
      const start = startOfWeek(anchor, { weekStartsOn: 1 });
      const end = endOfWeek(anchor, { weekStartsOn: 1 });
      return { start, end };
    } catch {
      const d = new Date();
      return { start: startOfWeek(d, { weekStartsOn: 1 }), end: endOfWeek(d, { weekStartsOn: 1 }) };
    }
  }, [selectedWeek]);

  // Build Filter Objects for queries (with full month 1 to 31 dates passed)
  const attendanceFilter = useMemo(() => ({
    period,
    date: selectedDate,
    month: selectedMonth,
    year: selectedYear,
    startDate: period === 'week' ? format(weekInterval.start, 'yyyy-MM-dd') : period === 'month' ? monthRange.startStr : undefined,
    endDate: period === 'week' ? format(weekInterval.end, 'yyyy-MM-dd') : period === 'month' ? monthRange.endStr : undefined,
    department,
    status,
    search,
  }), [period, selectedDate, selectedMonth, selectedYear, weekInterval, monthRange, department, status, search]);

  const payrollFilter = useMemo(() => ({
    period,
    date: selectedDate,
    month: selectedMonth,
    year: selectedYear,
    startDate: period === 'week' ? format(weekInterval.start, 'yyyy-MM-dd') : period === 'month' ? monthRange.startStr : undefined,
    endDate: period === 'week' ? format(weekInterval.end, 'yyyy-MM-dd') : period === 'month' ? monthRange.endStr : undefined,
    department,
    status,
    search,
  }), [period, selectedDate, selectedMonth, selectedYear, weekInterval, monthRange, department, status, search]);

  const schedulesFilter = useMemo(() => ({
    period,
    date: selectedDate,
    month: selectedMonth,
    year: selectedYear,
    startDate: period === 'week' ? format(weekInterval.start, 'yyyy-MM-dd') : period === 'month' ? monthRange.startStr : undefined,
    endDate: period === 'week' ? format(weekInterval.end, 'yyyy-MM-dd') : period === 'month' ? monthRange.endStr : undefined,
    department,
    status,
    search,
  }), [period, selectedDate, selectedMonth, selectedYear, weekInterval, monthRange, department, status, search]);

  // Queries
  const isAttendanceActive = activeReportTab === 'attendance';
  const isPaymentsActive = activeReportTab === 'payments';
  const isSchedulesActive = activeReportTab === 'schedules';
  const isProjectsActive = activeReportTab === 'projects';

  const {
    data: attendanceReport,
    isLoading: attendanceLoading,
    refetch: refetchAttendance,
    isFetching: attendanceFetching,
  } = useGetAttendanceReport(attendanceFilter, isAttendanceActive);

  const {
    data: payrollReport,
    isLoading: payrollLoading,
    refetch: refetchPayroll,
    isFetching: payrollFetching,
  } = useGetPayrollReport(payrollFilter, isPaymentsActive);

  const {
    data: schedulesReport,
    isLoading: schedulesLoading,
    refetch: refetchSchedules,
    isFetching: schedulesFetching,
  } = useGetSchedulesReport(schedulesFilter, isSchedulesActive);

  // Projects & Tasks queries
  const { data: projects = [], isLoading: projectsLoading, refetch: refetchProjects } = useGetProjects();
  const { data: allTasks = [], isLoading: tasksLoading, refetch: refetchTasks } = useGetAllTasks();
  const { data: users = [] } = useGetAllUsers();

  const sendAttendanceMutation = useSendAttendanceReport();
  const sendPayrollMutation = useSendPayrollReport();
  const sendSchedulesMutation = useSendSchedulesReport();

  const isRefreshing = attendanceFetching || payrollFetching || schedulesFetching;

  // Robust user ID resolver (supports string, Principal, Mongoose ObjectId, object)
  const extractUserId = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
      if (typeof val.toText === 'function') return val.toText();
      if (val.userId) return typeof val.userId.toText === 'function' ? val.userId.toText() : String(val.userId);
      if (val._id) return String(val._id);
      if (val.id) return typeof val.id.toText === 'function' ? val.id.toText() : String(val.id);
      if (typeof val.toString === 'function' && val.toString() !== '[object Object]') return val.toString();
    }
    return String(val);
  };

  // Safe datetime formatter for BigInt / timestamp / string dates
  const safeFormatDateTime = (val, formatStr = 'MMM d, yyyy · h:mm a', fallback = 'Completed') => {
    if (!val) return fallback;
    try {
      let dt = null;
      if (typeof val === 'bigint') {
        dt = new Date(Number(val) / 1000000);
      } else if (typeof val === 'number') {
        dt = new Date(val > 1e14 ? val / 1000000 : val);
      } else if (typeof val === 'string') {
        dt = new Date(val);
      } else if (val instanceof Date) {
        dt = val;
      }
      if (dt && !isNaN(dt.getTime())) {
        return format(dt, formatStr);
      }
    } catch {}
    return fallback;
  };

  // Collect all valid YYYY-MM-DD dates associated with this task
  const getTaskDateStrings = (task) => {
    const dates = [];
    const add = (v) => {
      const parsed = parseDateString(v);
      if (parsed) dates.push(parsed);
    };

    add(task.rawStartDate);
    add(task.rawEndDate);
    add(task.startDate);
    add(task.endDate);
    add(task.dueDate);
    add(task.completedAt);
    add(task.createdAt);
    add(task.updatedAt);

    return Array.from(new Set(dates));
  };

  const getTaskDateRange = (task) => {
    const s = parseDateString(task.rawStartDate || task.startDate) || '';
    const e = parseDateString(task.rawEndDate || task.endDate || task.dueDate) || s;
    return { startDateStr: s, endDateStr: e };
  };

  // Helper: Match task date within the active period (day, week, month from 1 to 31, year)
  const isTaskInPeriod = (task) => {
    const dateStrs = getTaskDateStrings(task);
    if (!dateStrs.length) return true; // Flexible schedule: include

    const { startDateStr, endDateStr } = getTaskDateRange(task);

    if (period === 'day') {
      if (dateStrs.some((d) => d === selectedDate)) return true;
      if (startDateStr && endDateStr && startDateStr <= selectedDate && endDateStr >= selectedDate) return true;
      return false;
    }

    if (period === 'week') {
      const wStart = format(weekInterval.start, 'yyyy-MM-dd');
      const wEnd = format(weekInterval.end, 'yyyy-MM-dd');
      if (dateStrs.some((d) => d >= wStart && d <= wEnd)) return true;
      if (startDateStr && endDateStr && startDateStr <= wEnd && endDateStr >= wStart) return true;
      return false;
    }

    if (period === 'year') {
      if (dateStrs.some((d) => d.startsWith(selectedYear))) return true;
      if (startDateStr && endDateStr && startDateStr <= `${selectedYear}-12-31` && endDateStr >= `${selectedYear}-01-01`) return true;
      return false;
    }

    // Default 'month' — Take all data from day 1 to 31
    if (dateStrs.some((d) => d.startsWith(selectedMonth))) return true;
    if (dateStrs.some((d) => d >= monthRange.startStr && d <= monthRange.endStr)) return true;
    if (startDateStr && endDateStr && startDateStr <= monthRange.endStr && endDateStr >= monthRange.startStr) return true;

    return false;
  };

  // Check if a task belongs to a project (matching UUID, Mongo ObjectId, or Project Name)
  const isTaskBelongingToProject = (task, project) => {
    if (!task || !project) return false;
    const pUuid = String(project.id || '');
    const pMongoId = String(project._id || '');
    const pName = String(project.name || '').trim().toLowerCase();

    const tProjId = String(task.projectId?._id || task.projectId?.id || task.projectId || '');
    const tProjName = String(task.projectName || '').trim().toLowerCase();

    if (pUuid && tProjId && tProjId === pUuid) return true;
    if (pMongoId && tProjId && tProjId === pMongoId) return true;
    if (pName && tProjName && tProjName === pName) return true;
    return false;
  };

  // Filtered Projects for Report
  const filteredProjectsReport = useMemo(() => {
    return projects.filter((p) => {
      if (status !== 'all' && p.status !== status) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = (p.name || '').toLowerCase().includes(q);
        const matchesDesc = (p.description || '').toLowerCase().includes(q);
        const matchesMember = (p.assignedEmployees || []).some((e) => (e.name || '').toLowerCase().includes(q));
        if (!matchesName && !matchesDesc && !matchesMember) return false;
      }
      return true;
    });
  }, [projects, status, search]);

  const activeReportProject = useMemo(() => {
    if (!filteredProjectsReport.length) return null;
    if (selectedReportProjectId) {
      return (
        filteredProjectsReport.find((p) => 
          String(p.id) === String(selectedReportProjectId) ||
          String(p._id) === String(selectedReportProjectId)
        ) || null
      );
    }
    return null;
  }, [filteredProjectsReport, selectedReportProjectId]);

  // All tasks belonging to the active project (unfiltered by date)
  const allActiveProjectTasks = useMemo(() => {
    if (!activeReportProject) return [];
    return allTasks.filter((t) => isTaskBelongingToProject(t, activeReportProject));
  }, [allTasks, activeReportProject]);

  // Tasks under active project matching the active period (with resilient fallback to all project tasks)
  const activeReportProjectTasks = useMemo(() => {
    if (!activeReportProject) return [];
    const periodFiltered = allActiveProjectTasks.filter((t) => isTaskInPeriod(t));
    return periodFiltered.length > 0 ? periodFiltered : allActiveProjectTasks;
  }, [allActiveProjectTasks, isTaskInPeriod]);

  // All employees working on active project
  const activeProjectEmployees = useMemo(() => {
    if (!activeReportProject) return [];
    const memberMap = new Map();

    (activeReportProject.assignedEmployees || []).forEach((emp) => {
      const eId = extractUserId(emp.userId || emp._id || emp.id || emp);
      if (eId) {
        memberMap.set(eId, {
          userId: eId,
          name: emp.name || emp.username || emp.userId?.name || 'Staff',
          role: emp.role || emp.userId?.role || 'Staff',
          email: emp.email || emp.userId?.email || '',
          avatar: emp.avatar || emp.userId?.avatar || '',
          department: emp.department || emp.userId?.department || 'General',
        });
      }
    });

    allActiveProjectTasks.forEach((task) => {
      const rawAssignees = Array.isArray(task.assignedTo)
        ? task.assignedTo
        : task.assignedTo
        ? [task.assignedTo]
        : task.assignee
        ? [task.assignee]
        : [];

      rawAssignees.forEach((assignee) => {
        const uId = extractUserId(assignee);
        if (uId && !memberMap.has(uId)) {
          const found = users.find((u) => {
            const uid = extractUserId(u.userId || u.id || u._id);
            return uid === uId || u.username === uId;
          });
          memberMap.set(uId, {
            userId: uId,
            name: found?.name || assignee?.name || uId,
            role: found?.role || assignee?.role || 'Staff',
            email: found?.email || assignee?.email || '',
            avatar: found?.avatar || assignee?.avatar || '',
            department: found?.department || 'General',
          });
        }
      });
    });

    return Array.from(memberMap.values());
  }, [activeReportProject, allActiveProjectTasks, users]);

  // Tasks filtered by completion status tab and selected employee
  const displayedProjectTasks = useMemo(() => {
    return activeReportProjectTasks.filter((task) => {
      const isCompleted = task.status === 'done' || task.status === 'completed';
      const isInProgress = task.status === 'in_progress';
      const isNotCompleted = !isCompleted;

      if (projectTaskStatusFilter === 'completed' && !isCompleted) return false;
      if (projectTaskStatusFilter === 'not_completed' && !isNotCompleted) return false;
      if (projectTaskStatusFilter === 'in_progress' && !isInProgress) return false;

      if (selectedReportProjectEmployeeFilter !== 'all') {
        const rawAssignees = Array.isArray(task.assignedTo)
          ? task.assignedTo
          : task.assignedTo
          ? [task.assignedTo]
          : task.assignee
          ? [task.assignee]
          : [];
        const taskAssigneeIds = rawAssignees.map(extractUserId).filter(Boolean);

        if (!taskAssigneeIds.includes(String(selectedReportProjectEmployeeFilter))) {
          return false;
        }
      }

      return true;
    });
  }, [activeReportProjectTasks, projectTaskStatusFilter, selectedReportProjectEmployeeFilter]);

  // Summary Metrics for Projects Report
  const projectReportMetrics = useMemo(() => {
    const total = filteredProjectsReport.length;
    const inProgress = filteredProjectsReport.filter((p) => p.status === 'in_progress').length;
    const completed = filteredProjectsReport.filter((p) => p.status === 'completed').length;
    const totalTasksInPeriod = activeReportProjectTasks.length;
    const completedTasksInPeriod = activeReportProjectTasks.filter(
      (t) => t.status === 'done' || t.status === 'completed'
    ).length;
    const completionRate =
      totalTasksInPeriod > 0 ? Math.round((completedTasksInPeriod / totalTasksInPeriod) * 100) : 0;
    return { total, inProgress, completed, totalTasksInPeriod, completedTasksInPeriod, completionRate };
  }, [filteredProjectsReport, activeReportProjectTasks]);

  // Manual refetch
  const handleRefresh = () => {
    if (isAttendanceActive) refetchAttendance();
    else if (isPaymentsActive) refetchPayroll();
    else if (isSchedulesActive) refetchSchedules();
    else {
      refetchProjects();
      refetchTasks();
    }
    toast.success('Refreshing report data...');
  };

  // CSV Download
  const handleDownloadCsv = () => {
    if (isProjectsActive) {
      if (!activeReportProjectTasks.length) {
        toast.error('No project tasks found in the selected period to export');
        return;
      }
      const headers = ['Project Name', 'Task Title', 'Assigned Employees', 'Status', 'Completed Or Not', 'Completion Time', 'Due Date'];
      const rows = activeReportProjectTasks.map((t) => {
        const isDone = t.status === 'done' || t.status === 'completed';
        const assignees = Array.isArray(t.assignedTo) ? t.assignedTo : t.assignedTo ? [t.assignedTo] : [];
        const assigneeNames = assignees.map((a) => a?.name || 'Member').join('; ');
        const compTime = isDone
          ? format(new Date(t.completedAt || t.updatedAt || Date.now()), 'yyyy-MM-dd HH:mm')
          : 'N/A';
        return [
          `"${(activeReportProject?.name || '').replace(/"/g, '""')}"`,
          `"${(t.title || '').replace(/"/g, '""')}"`,
          `"${assigneeNames.replace(/"/g, '""')}"`,
          `"${t.status || ''}"`,
          `"${isDone ? 'Completed' : 'Not Completed'}"`,
          `"${compTime}"`,
          `"${t.dueDate || t.endDate || ''}"`,
        ].join(',');
      });
      const csvStr = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `Project_Report_${(activeReportProject?.name || 'Report').replace(/[^a-zA-Z0-9]/g, '_')}_${period}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Downloaded project report CSV');
      return;
    }

    const csvContent = isAttendanceActive
      ? attendanceReport?.csvContent
      : isPaymentsActive
      ? payrollReport?.csvContent
      : schedulesReport?.csvContent;

    if (!csvContent) {
      toast.error('No report data available to download');
      return;
    }

    const reportTypeName = isAttendanceActive
      ? 'Attendance_Report'
      : isPaymentsActive
      ? 'Payment_Report'
      : 'Schedules_Report';

    const filename = `${reportTypeName}_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${period}_${
      period === 'day' ? selectedDate : period === 'year' ? selectedYear : selectedMonth
    }.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filename}`);
  };

  // Print Report
  const handlePrint = () => {
    window.print();
  };

  // Send Email Dispatch
  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!recipientEmail || !recipientEmail.trim()) {
      toast.error('Please enter a recipient email address');
      return;
    }

    try {
      if (isAttendanceActive) {
        await sendAttendanceMutation.mutateAsync({
          recipientEmail: recipientEmail.trim(),
          notes: emailNotes,
          ...attendanceFilter,
        });
      } else if (isPaymentsActive) {
        await sendPayrollMutation.mutateAsync({
          recipientEmail: recipientEmail.trim(),
          notes: emailNotes,
          ...payrollFilter,
        });
      } else {
        await sendSchedulesMutation.mutateAsync({
          recipientEmail: recipientEmail.trim(),
          notes: emailNotes,
          ...schedulesFilter,
        });
      }
      toast.success(`Report successfully dispatched to ${recipientEmail}`);
      setShowEmailModal(false);
      setEmailNotes('');
    } catch (err) {
      toast.error(err.message || 'Failed to dispatch report email');
    }
  };

  // Quick reset filters
  const handleClearFilters = () => {
    setSearch('');
    setDepartment('all');
    setStatus('all');
  };

  // Human-readable active period label
  const activePeriodLabel = useMemo(() => {
    if (period === 'day') {
      try {
        const d = new Date(selectedDate + 'T00:00:00');
        return isNaN(d.getTime()) ? selectedDate : format(d, 'EEEE, MMMM d, yyyy');
      } catch {
        return selectedDate;
      }
    }
    if (period === 'week') {
      return `Week: ${format(weekInterval.start, 'MMM d')} – ${format(weekInterval.end, 'MMM d, yyyy')}`;
    }
    if (period === 'year') {
      return `Full Year ${selectedYear}`;
    }
    try {
      const [y, m] = selectedMonth.split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      return `${format(d, 'MMMM yyyy')} (Days 1–${monthRange.lastDay})`;
    } catch {
      return selectedMonth;
    }
  }, [period, selectedDate, selectedWeek, selectedMonth, selectedYear, weekInterval, monthRange]);

  // Year options list
  const yearOptions = useMemo(() => {
    const cy = now.getFullYear();
    return [cy + 1, cy, cy - 1, cy - 2, cy - 3].map(String);
  }, []);

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#DFE8EC] dark:border-[#2A3D48]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6] flex items-center justify-center shrink-0 shadow-2xs border border-[#0D9488]/20">
            <FileBarChart className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-[#172B3A] dark:text-[#E8F0F4]">
                Company Reports & Analytics
              </h1>
              <Badge variant="outline" className="text-xs bg-[#0D9488]/10 text-[#0D9488] border-[#0D9488]/30">
                Official Audit
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#A6B5C0] mt-0.5">
              Comprehensive attendance tracking, payment logs, and schedule task completion audits for {companyName}.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="rounded-xl text-xs h-9 border-[#DFE8EC] dark:border-[#2A3D48] text-[#172B3A] dark:text-[#E8F0F4] hover:bg-[#F4F8FA] dark:hover:bg-[#1D303B] shadow-2xs gap-1.5"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin text-[#0D9488]')} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="rounded-xl text-xs h-9 border-[#DFE8EC] dark:border-[#2A3D48] text-[#172B3A] dark:text-[#E8F0F4] hover:bg-[#F4F8FA] dark:hover:bg-[#1D303B] shadow-2xs gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEmailModal(true)}
            className="rounded-xl text-xs h-9 border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 shadow-2xs gap-1.5"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email Report</span>
          </Button>

          <Button
            size="sm"
            onClick={handleDownloadCsv}
            className="rounded-xl text-xs h-9 bg-[#0D9488] hover:bg-[#0B7A70] text-white shadow-sm gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      {/* 2. Primary Report Selector Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-1.5 rounded-2xl bg-[#F4F8FA] dark:bg-[#15232D] border border-[#DFE8EC] dark:border-[#2A3D48]">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-1.5 w-full sm:w-auto">
          <button
            onClick={() => setActiveReportTab('attendance')}
            className={cn(
              'flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all',
              isAttendanceActive
                ? 'bg-white dark:bg-[#1D303B] text-[#0D9488] dark:text-[#14B8A6] shadow-sm border border-[#DFE8EC]/80 dark:border-[#2A3D48]'
                : 'text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-[#E8F0F4]'
            )}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span>Attendance Report</span>
            {attendanceReport?.totalRecords !== undefined && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#0D9488]/10 text-[#0D9488] font-bold">
                {attendanceReport.totalRecords}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveReportTab('payments')}
            className={cn(
              'flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all',
              isPaymentsActive
                ? 'bg-white dark:bg-[#1D303B] text-[#0D9488] dark:text-[#14B8A6] shadow-sm border border-[#DFE8EC]/80 dark:border-[#2A3D48]'
                : 'text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-[#E8F0F4]'
            )}
          >
            <DollarSign className="w-4 h-4 shrink-0" />
            <span>Payment & Payroll Report</span>
            {payrollReport?.totalEmployees !== undefined && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/10 text-emerald-600 font-bold">
                {payrollReport.totalEmployees}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveReportTab('schedules')}
            className={cn(
              'flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all',
              isSchedulesActive
                ? 'bg-white dark:bg-[#1D303B] text-[#0D9488] dark:text-[#14B8A6] shadow-sm border border-[#DFE8EC]/80 dark:border-[#2A3D48]'
                : 'text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-[#E8F0F4]'
            )}
          >
            <ClipboardList className="w-4 h-4 shrink-0" />
            <span>Schedules & Tasks Report</span>
            {schedulesReport?.totalTasks !== undefined && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-teal-500/10 text-teal-600 dark:text-teal-400 font-bold">
                {schedulesReport.totalTasks}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveReportTab('projects')}
            className={cn(
              'flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all',
              isProjectsActive
                ? 'bg-white dark:bg-[#1D303B] text-[#0D9488] dark:text-[#14B8A6] shadow-sm border border-[#DFE8EC]/80 dark:border-[#2A3D48]'
                : 'text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-[#E8F0F4]'
            )}
          >
            <FolderKanban className="w-4 h-4 shrink-0" />
            <span>Projects Report</span>
            {projects.length !== undefined && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold">
                {projects.length}
              </span>
            )}
          </button>
        </div>

        {/* Current Active Period Indicator Badge */}
        <div className="flex items-center justify-center sm:justify-end px-3 py-1 text-xs font-semibold text-[#0D9488] dark:text-[#14B8A6]">
          <Calendar className="w-3.5 h-3.5 mr-1.5 shrink-0" />
          <span>Active Period: {activePeriodLabel}</span>
        </div>
      </div>

      {/* 3. Granular Time Filters Bar: Day, Week, Month, Year */}
      <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] shadow-2xs">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Period Granularity Selector (Day | Week | Month | Year) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0] uppercase tracking-wider">
                1. Select Time Range (Day / Week / Month / Year)
              </Label>
              <div className="inline-flex p-1 rounded-xl bg-[#F4F8FA] dark:bg-[#1D303B] border border-[#DFE8EC] dark:border-[#2A3D48]">
                <button
                  type="button"
                  onClick={() => setPeriod('day')}
                  className={cn(
                    'px-3 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    period === 'day'
                      ? 'bg-white dark:bg-[#15232D] text-[#0D9488] shadow-2xs font-bold'
                      : 'text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-[#E8F0F4]'
                  )}
                >
                  Day View
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod('week')}
                  className={cn(
                    'px-3 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    period === 'week'
                      ? 'bg-white dark:bg-[#15232D] text-[#0D9488] shadow-2xs font-bold'
                      : 'text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-[#E8F0F4]'
                  )}
                >
                  Week View
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod('month')}
                  className={cn(
                    'px-3 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    period === 'month'
                      ? 'bg-white dark:bg-[#15232D] text-[#0D9488] shadow-2xs font-bold'
                      : 'text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-[#E8F0F4]'
                  )}
                >
                  Month View
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod('year')}
                  className={cn(
                    'px-3 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    period === 'year'
                      ? 'bg-white dark:bg-[#15232D] text-[#0D9488] shadow-2xs font-bold'
                      : 'text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-[#E8F0F4]'
                  )}
                >
                  Year View
                </button>
              </div>
            </div>

            {/* Target Value Picker based on period */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0] uppercase tracking-wider">
                2. Target Selection
              </Label>
              <div>
                {period === 'day' && (
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="rounded-xl text-xs h-9 bg-card border-[#DFE8EC] dark:border-[#2A3D48] w-full md:w-56"
                  />
                )}

                {period === 'week' && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <Input
                      type="date"
                      value={selectedWeek}
                      onChange={(e) => setSelectedWeek(e.target.value)}
                      className="rounded-xl text-xs h-9 bg-card border-[#DFE8EC] dark:border-[#2A3D48] w-full md:w-44"
                    />
                    <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap bg-secondary/50 px-2.5 py-1.5 rounded-xl border border-border">
                      {format(weekInterval.start, 'MMM d')} – {format(weekInterval.end, 'MMM d, yyyy')}
                    </span>
                  </div>
                )}

                {period === 'month' && (
                  <Input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="rounded-xl text-xs h-9 bg-card border-[#DFE8EC] dark:border-[#2A3D48] w-full md:w-56"
                  />
                )}

                {period === 'year' && (
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="rounded-xl text-xs h-9 bg-card border-[#DFE8EC] dark:border-[#2A3D48] w-full md:w-56">
                      <SelectValue placeholder="Select Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => (
                        <SelectItem key={y} value={y}>
                          Year {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#DFE8EC]/80 dark:border-[#2A3D48]/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
            {/* Search filter */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#64748B] dark:text-[#A6B5C0]">
                {isProjectsActive ? 'Search Project / Task / Staff' : 'Search Employee / Task'}
              </Label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={isProjectsActive ? 'Filter projects, tasks, or staff...' : 'Filter by name, ID or task...'}
                  className="pl-8 rounded-xl text-xs h-9 bg-card border-[#DFE8EC] dark:border-[#2A3D48]"
                />
              </div>
            </div>

            {/* Department filter */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#64748B] dark:text-[#A6B5C0]">Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger className="rounded-xl text-xs h-9 bg-card border-[#DFE8EC] dark:border-[#2A3D48]">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  <SelectItem value="Engineering">Engineering</SelectItem>
                  <SelectItem value="Product">Product</SelectItem>
                  <SelectItem value="Design">Design</SelectItem>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                  <SelectItem value="Operations">Operations</SelectItem>
                  <SelectItem value="Sales">Sales</SelectItem>
                  <SelectItem value="HR">HR</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status filter */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#64748B] dark:text-[#A6B5C0]">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="rounded-xl text-xs h-9 bg-card border-[#DFE8EC] dark:border-[#2A3D48]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {isAttendanceActive && (
                    <>
                      <SelectItem value="present">Present (Full Day)</SelectItem>
                      <SelectItem value="late">Late Arrival</SelectItem>
                      <SelectItem value="half_day">Half Day</SelectItem>
                      <SelectItem value="absent">Absent</SelectItem>
                    </>
                  )}
                  {isPaymentsActive && (
                    <>
                      <SelectItem value="paid">Fully Paid</SelectItem>
                      <SelectItem value="pending">Pending Payment</SelectItem>
                      <SelectItem value="partially_paid">Partially Paid</SelectItem>
                    </>
                  )}
                  {isSchedulesActive && (
                    <>
                      <SelectItem value="completed">Completed Tasks</SelectItem>
                      <SelectItem value="in_progress">In Progress (Running)</SelectItem>
                      <SelectItem value="todo">Pending / To Do</SelectItem>
                      <SelectItem value="not_completed">Not Completed / Expired</SelectItem>
                    </>
                  )}
                  {isProjectsActive && (
                    <>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="planning">Planning</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters Button */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="rounded-xl text-xs h-9 text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-[#E8F0F4] w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Executive KPI Summary Cards */}
      {isAttendanceActive && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Total Shifts</p>
            <p className="text-2xl font-bold text-[#172B3A] dark:text-[#E8F0F4] mt-1">
              {attendanceReport?.totalRecords ?? (attendanceLoading ? '...' : 0)}
            </p>
            <span className="text-[11px] text-[#0D9488] font-medium">Logged Attendances</span>
          </Card>

          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Present / Full-Day</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {attendanceReport?.presentCount ?? (attendanceLoading ? '...' : 0)}
            </p>
            <span className="text-[11px] text-[#64748B] dark:text-[#A6B5C0]">Regular Attendance</span>
          </Card>

          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Late Arrivals</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              {attendanceReport?.lateCount ?? (attendanceLoading ? '...' : 0)}
            </p>
            <span className="text-[11px] text-[#64748B] dark:text-[#A6B5C0]">After Shift Start</span>
          </Card>

          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Total Hours Worked</p>
            <p className="text-2xl font-bold text-[#0D9488] dark:text-[#14B8A6] mt-1">
              {attendanceReport?.totalWorkingHours !== undefined
                ? `${attendanceReport.totalWorkingHours}h`
                : attendanceLoading
                ? '...'
                : '0h'}
            </p>
            <span className="text-[11px] text-[#64748B] dark:text-[#A6B5C0]">Active Labor Time</span>
          </Card>

          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs col-span-2 lg:col-span-1">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Average Daily Hours</p>
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
              {attendanceReport?.averageDailyHours !== undefined
                ? `${attendanceReport.averageDailyHours}h`
                : attendanceLoading
                ? '...'
                : '0h'}
            </p>
            <span className="text-[11px] text-[#64748B] dark:text-[#A6B5C0]">Per Staff Member</span>
          </Card>
        </div>
      )}

      {isPaymentsActive && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Total Net Paid</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              ₹{(payrollReport?.companyOverallAmountPaid || 0).toLocaleString('en-IN')}
            </p>
            <span className="text-[11px] text-[#64748B] dark:text-[#A6B5C0]">Disbursed to Staff</span>
          </Card>

          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Pending Payment</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              ₹{(payrollReport?.companyOverallPendingAmount || 0).toLocaleString('en-IN')}
            </p>
            <span className="text-[11px] text-[#64748B] dark:text-[#A6B5C0]">Unpaid Balance</span>
          </Card>

          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Total Base Salary</p>
            <p className="text-2xl font-bold text-[#172B3A] dark:text-[#E8F0F4] mt-1">
              ₹{(payrollReport?.companyOverallBaseSalary || 0).toLocaleString('en-IN')}
            </p>
            <span className="text-[11px] text-[#64748B] dark:text-[#A6B5C0]">Gross Contract Base</span>
          </Card>

          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Total Bonuses</p>
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
              ₹{(payrollReport?.companyOverallBonuses || 0).toLocaleString('en-IN')}
            </p>
            <span className="text-[11px] text-[#64748B] dark:text-[#A6B5C0]">Incentives & Rewards</span>
          </Card>

          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs col-span-2 lg:col-span-1">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Total Deductions</p>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
              ₹{(payrollReport?.companyOverallDeductions || 0).toLocaleString('en-IN')}
            </p>
            <span className="text-[11px] text-[#64748B] dark:text-[#A6B5C0]">Leaves & Penalties</span>
          </Card>
        </div>
      )}

      {isSchedulesActive && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Total Tasks Assigned</p>
            <p className="text-2xl font-bold text-[#172B3A] dark:text-[#E8F0F4] mt-1">
              {schedulesReport?.totalTasks ?? (schedulesLoading ? '...' : 0)}
            </p>
            <span className="text-[11px] text-[#0D9488] font-medium">
              Across {schedulesReport?.employeesWithTasks || 0} active assignees
            </span>
          </Card>

          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Completed Tasks</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {schedulesReport?.totalCompleted ?? (schedulesLoading ? '...' : 0)}
            </p>
            <span className="text-[11px] text-emerald-600 font-medium">
              {schedulesReport?.overallCompletionRate ?? 0}% Completion Rate
            </span>
          </Card>

          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">In Progress / Running</p>
            <p className="text-2xl font-bold text-teal-600 dark:text-teal-400 mt-1">
              {schedulesReport?.totalInProgress ?? (schedulesLoading ? '...' : 0)}
            </p>
            <span className="text-[11px] text-[#64748B] dark:text-[#A6B5C0]">Actively being executed</span>
          </Card>

          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Pending / To Do</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              {schedulesReport?.totalTodo ?? (schedulesLoading ? '...' : 0)}
            </p>
            <span className="text-[11px] text-[#64748B] dark:text-[#A6B5C0]">Awaiting member start</span>
          </Card>

          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs col-span-2 lg:col-span-1">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Not Completed / Expired</p>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
              {schedulesReport?.totalNotCompleted ?? (schedulesLoading ? '...' : 0)}
            </p>
            <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">Past designated deadline</span>
          </Card>
        </div>
      )}

      {/* 4. Projects KPI Metric Cards */}
      {isProjectsActive && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Total Projects</p>
            <p className="text-2xl font-bold text-[#172B3A] dark:text-[#E8F0F4] mt-1">
              {projectReportMetrics.total}
            </p>
            <span className="text-[11px] text-[#0D9488] font-medium">Assigned company projects</span>
          </Card>

          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">In Progress</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
              {projectReportMetrics.inProgress}
            </p>
            <span className="text-[11px] text-[#64748B] dark:text-[#A6B5C0]">Currently active</span>
          </Card>

          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Tasks in Period</p>
            <p className="text-2xl font-bold text-[#172B3A] dark:text-[#E8F0F4] mt-1">
              {projectReportMetrics.totalTasksInPeriod}
            </p>
            <span className="text-[11px] text-[#64748B] dark:text-[#A6B5C0]">In {activePeriodLabel}</span>
          </Card>

          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">Tasks Completed</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {projectReportMetrics.completedTasksInPeriod}
            </p>
            <span className="text-[11px] text-emerald-600 font-medium">
              {projectReportMetrics.completionRate}% Done in Period
            </span>
          </Card>

          <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-4 shadow-2xs col-span-2 lg:col-span-1">
            <p className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0]">People Working</p>
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
              {activeProjectEmployees.length}
            </p>
            <span className="text-[11px] text-purple-600 font-medium">Staff on active project</span>
          </Card>
        </div>
      )}

      {/* 5. SPECIFIC TO SCHEDULES: Employee-by-Employee Task Details Audit Cards */}
      {isSchedulesActive && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#172B3A] dark:text-[#E8F0F4] flex items-center gap-2">
                <User className="w-4 h-4 text-[#0D9488]" />
                <span>Every Employee Task Completion Audit</span>
              </h2>
              <p className="text-xs text-[#64748B] dark:text-[#A6B5C0]">
                Full breakdown of what tasks were assigned to each employee, and whether they completed them or not.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const allEmpIds = (schedulesReport?.employees || []).map((e) => e.userId);
                if (expandedEmployees.size === allEmpIds.length) {
                  setExpandedEmployees(new Set());
                } else {
                  setExpandedEmployees(new Set(allEmpIds));
                }
              }}
              className="text-xs h-8 border-[#DFE8EC] dark:border-[#2A3D48]"
            >
              {expandedEmployees.size === (schedulesReport?.employees || []).length
                ? 'Collapse All Details'
                : 'Expand All Details'}
            </Button>
          </div>

          {schedulesLoading ? (
            <div className="p-8 text-center bg-white dark:bg-[#15232D] rounded-2xl border border-[#DFE8EC] dark:border-[#2A3D48]">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#0D9488] mb-2" />
              <p className="text-xs text-[#64748B] dark:text-[#A6B5C0]">Loading employee schedule audit records...</p>
            </div>
          ) : !schedulesReport?.employees || schedulesReport.employees.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-[#15232D] rounded-2xl border border-[#DFE8EC] dark:border-[#2A3D48]">
              <p className="text-sm font-medium text-[#172B3A] dark:text-[#E8F0F4]">No employees found</p>
              <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] mt-1">Try adjusting the filter or search query.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {schedulesReport.employees.map((emp) => {
                const isExpanded = expandedEmployees.has(emp.userId);
                const hasTasks = emp.totalTasks > 0;

                return (
                  <Card
                    key={emp.userId}
                    className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] shadow-2xs overflow-hidden transition-all"
                  >
                    <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Employee Meta */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#0D9488]/10 text-[#0D9488] flex items-center justify-center font-bold text-sm shrink-0 border border-[#0D9488]/20">
                          {(emp.name || 'E').slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-sm text-[#172B3A] dark:text-[#E8F0F4]">{emp.name}</h3>
                            <Badge variant="outline" className="text-[10px] py-0 px-2 border-[#DFE8EC] dark:border-[#2A3D48]">
                              {emp.staffId}
                            </Badge>
                            <Badge className="text-[10px] py-0 px-2 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20">
                              {emp.department} • {emp.designation}
                            </Badge>
                          </div>
                          <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] mt-0.5">{emp.email || 'No email registered'}</p>
                        </div>
                      </div>

                      {/* Performance Counters & Completion Bar */}
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-[#F4F8FA] dark:bg-[#1D303B] border border-[#DFE8EC] dark:border-[#2A3D48] text-[#172B3A] dark:text-[#E8F0F4]">
                            Total: <strong>{emp.totalTasks}</strong>
                          </span>
                          <span className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                            Completed: <strong>{emp.completedTasks}</strong>
                          </span>
                          <span className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                            Running: <strong>{emp.inProgressTasks}</strong>
                          </span>
                          <span className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                            Expired: <strong>{emp.notCompletedTasks}</strong>
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-28 space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-semibold text-[#64748B] dark:text-[#A6B5C0]">
                            <span>Completed</span>
                            <span className={emp.completionRate >= 80 ? 'text-emerald-600 font-bold' : ''}>
                              {emp.completionRate}%
                            </span>
                          </div>
                          <div className="w-full bg-[#DFE8EC] dark:bg-[#2A3D48] h-2 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-500',
                                emp.completionRate >= 80
                                  ? 'bg-emerald-500'
                                  : emp.completionRate >= 40
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                              )}
                              style={{ width: `${emp.completionRate}%` }}
                            />
                          </div>
                        </div>

                        {/* Expand Details Trigger */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleEmployeeExpanded(emp.userId)}
                          className="h-8 px-2.5 text-xs text-[#0D9488] hover:text-[#0D9488] hover:bg-[#0D9488]/10 rounded-xl flex items-center gap-1"
                        >
                          <span>{isExpanded ? 'Hide Tasks' : `View Tasks (${emp.tasks.length})`}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </div>

                    {/* Expandable Task Detail Table */}
                    {isExpanded && (
                      <div className="border-t border-[#DFE8EC] dark:border-[#2A3D48] bg-[#F4F8FA]/60 dark:bg-[#1D303B]/30 p-4 space-y-3">
                        <div className="flex items-center justify-between text-xs font-semibold text-[#172B3A] dark:text-[#E8F0F4]">
                          <span className="flex items-center gap-1.5">
                            <CheckSquare className="w-3.5 h-3.5 text-[#0D9488]" />
                            <span>Tasks Assigned to {emp.name} in this period:</span>
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {emp.tasks.length} task(s) found
                          </span>
                        </div>

                        {emp.tasks.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-3 text-center italic">
                            No tasks assigned to {emp.name} in this selected time range.
                          </p>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D]">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-[#F8FAFC] dark:bg-[#15232D] text-[11px]">
                                  <TableHead className="py-2.5 font-bold">Task Title</TableHead>
                                  <TableHead className="font-bold">Project</TableHead>
                                  <TableHead className="font-bold">Start Date</TableHead>
                                  <TableHead className="font-bold">Due Date</TableHead>
                                  <TableHead className="font-bold">Priority</TableHead>
                                  <TableHead className="font-bold text-center">Execution Status</TableHead>
                                  <TableHead className="font-bold text-right">Completed?</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {emp.tasks.map((task) => (
                                  <TableRow key={task.id} className="text-xs border-b border-[#DFE8EC]/60 dark:border-[#2A3D48]/60">
                                    <TableCell className="font-medium text-[#172B3A] dark:text-[#E8F0F4] max-w-xs">
                                      <p className="truncate font-semibold">{task.title}</p>
                                      {task.description && (
                                        <p className="text-[10px] text-muted-foreground line-clamp-1">{task.description}</p>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-[11px]">
                                      <Badge variant="outline" className="text-[10px] py-0 border-[#DFE8EC] dark:border-[#2A3D48]">
                                        {task.projectName || 'General'}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="font-mono text-[11px] text-[#172B3A] dark:text-[#E8F0F4]">
                                      {task.startDate || '--'}
                                    </TableCell>
                                    <TableCell className="font-mono text-[11px] text-[#172B3A] dark:text-[#E8F0F4]">
                                      {task.endDate || '--'} {task.dueTime ? `(${task.dueTime})` : ''}
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        className={cn(
                                          'text-[10px] uppercase tracking-wider',
                                          task.priority === 'high'
                                            ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
                                            : task.priority === 'medium'
                                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
                                            : 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20'
                                        )}
                                      >
                                        {task.priority}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <span
                                        className={cn(
                                          'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border',
                                          task.isCompleted
                                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                            : task.status === 'in_progress'
                                            ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30'
                                            : task.status === 'not_completed'
                                            ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
                                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                        )}
                                      >
                                        {task.statusLabel}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {task.isCompleted ? (
                                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-[11px] gap-1 px-2 py-0.5">
                                          <CheckCircle2 className="w-3 h-3" />
                                          <span>Yes (Completed)</span>
                                        </Badge>
                                      ) : task.status === 'not_completed' ? (
                                        <Badge className="bg-rose-600 text-white hover:bg-rose-600 text-[11px] gap-1 px-2 py-0.5">
                                          <XCircle className="w-3 h-3" />
                                          <span>No (Expired)</span>
                                        </Badge>
                                      ) : task.status === 'in_progress' ? (
                                        <Badge className="bg-teal-600 text-white hover:bg-teal-600 text-[11px] gap-1 px-2 py-0.5">
                                          <Play className="w-3 h-3 fill-white" />
                                          <span>In Progress</span>
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-[11px] gap-1 px-2 py-0.5">
                                          <Clock className="w-3 h-3" />
                                          <span>Pending</span>
                                        </Badge>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 6. Primary Audit Register or Dedicated Projects Audit Workspace */}
      {!isProjectsActive ? (
        <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] shadow-sm overflow-hidden">
          <CardHeader className="px-5 py-4 border-b border-[#DFE8EC]/80 dark:border-[#2A3D48]/80 bg-[#F4F8FA]/50 dark:bg-[#1D303B]/30 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-[#172B3A] dark:text-[#E8F0F4] flex items-center gap-2">
                <span>
                  {isAttendanceActive
                    ? 'Attendance Audit Log'
                    : isPaymentsActive
                    ? 'Payroll Distribution Register'
                    : 'Schedules & Tasks Master Audit Register'}
                </span>
                <span className="text-xs font-normal text-[#64748B] dark:text-[#A6B5C0]">
                  (
                  {isAttendanceActive
                    ? attendanceReport?.rows?.length || 0
                    : isPaymentsActive
                    ? payrollReport?.items?.length || 0
                    : schedulesReport?.records?.length || 0}{' '}
                  entries)
                </span>
              </CardTitle>
            </div>
            <Badge variant="outline" className="text-xs font-semibold uppercase tracking-wider text-[#0D9488] border-[#0D9488]/30">
              {period} view
            </Badge>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              {isAttendanceActive ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#F8FAFC] dark:bg-[#15232D] border-b border-[#DFE8EC] dark:border-[#2A3D48]">
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4] py-3.5">Date</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">Staff Name</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">Staff ID</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">Department</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">Check In</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">Check Out</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">Hours Worked</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4] text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendanceLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-12 text-center text-sm text-[#64748B] dark:text-[#A6B5C0]">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#0D9488] mb-2" />
                          Loading attendance audit data...
                        </TableCell>
                      </TableRow>
                    ) : !attendanceReport?.rows || attendanceReport.rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-12 text-center text-sm text-[#64748B] dark:text-[#A6B5C0]">
                          No attendance records found for this period and filter selection.
                        </TableCell>
                      </TableRow>
                    ) : (
                      attendanceReport.rows.map((row, idx) => (
                        <TableRow key={row.id || idx} className="hover:bg-[#F4F8FA]/60 dark:hover:bg-[#1D303B]/40 border-b border-[#DFE8EC]/60 dark:border-[#2A3D48]/60">
                          <TableCell className="font-medium text-xs text-[#172B3A] dark:text-[#E8F0F4]">{row.date}</TableCell>
                          <TableCell className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">{row.name}</TableCell>
                          <TableCell className="text-xs text-[#64748B] dark:text-[#A6B5C0]">{row.staffId}</TableCell>
                          <TableCell className="text-xs text-[#64748B] dark:text-[#A6B5C0]">{row.department}</TableCell>
                          <TableCell className="text-xs font-mono text-[#172B3A] dark:text-[#E8F0F4]">
                            {row.checkInDisplay || row.checkIn || '--'}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-[#172B3A] dark:text-[#E8F0F4]">
                            {row.checkOutDisplay || row.checkOut || '--'}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-[#0D9488] dark:text-[#14B8A6]">
                            {row.workedHours !== undefined ? `${row.workedHours} hrs` : '--'}
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={cn(
                                'px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border',
                                row.status === 'present'
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                  : row.status === 'late'
                                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                  : row.status === 'half_day'
                                  ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30'
                                  : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
                              )}
                            >
                              {row.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              ) : isPaymentsActive ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#F8FAFC] dark:bg-[#15232D] border-b border-[#DFE8EC] dark:border-[#2A3D48]">
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4] py-3.5">Period</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">Staff Name</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">Staff ID</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">Department</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4] text-right">Base Salary</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4] text-right">Bonus</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4] text-right">Deductions</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4] text-right">Net Payable</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4] text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-12 text-center text-sm text-[#64748B] dark:text-[#A6B5C0]">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#0D9488] mb-2" />
                          Loading payroll report data...
                        </TableCell>
                      </TableRow>
                    ) : !payrollReport?.items || payrollReport.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-12 text-center text-sm text-[#64748B] dark:text-[#A6B5C0]">
                          No payroll records found for this period and filter selection.
                        </TableCell>
                      </TableRow>
                    ) : (
                      payrollReport.items.map((item, idx) => (
                        <TableRow key={item.id || idx} className="hover:bg-[#F4F8FA]/60 dark:hover:bg-[#1D303B]/40 border-b border-[#DFE8EC]/60 dark:border-[#2A3D48]/60">
                          <TableCell className="font-medium text-xs text-[#172B3A] dark:text-[#E8F0F4]">{item.period}</TableCell>
                          <TableCell className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">{item.name}</TableCell>
                          <TableCell className="text-xs text-[#64748B] dark:text-[#A6B5C0]">{item.staffId}</TableCell>
                          <TableCell className="text-xs text-[#64748B] dark:text-[#A6B5C0]">{item.department}</TableCell>
                          <TableCell className="text-xs font-semibold text-right text-[#172B3A] dark:text-[#E8F0F4]">
                            ₹{(item.baseSalary || 0).toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-xs font-medium text-right text-indigo-600 dark:text-indigo-400">
                            +₹{(item.bonus || 0).toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-xs font-medium text-right text-rose-600 dark:text-rose-400">
                            -₹{(item.totalDeductions || 0).toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-xs font-bold text-right text-emerald-600 dark:text-emerald-400">
                            ₹{(item.totalAmount || item.netPayable || 0).toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={cn(
                                'px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border',
                                item.paymentStatus === 'paid'
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                  : item.paymentStatus === 'partially_paid'
                                  ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30'
                                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                              )}
                            >
                              {item.paymentStatus || 'unpaid'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              ) : (
                /* Schedules & Tasks Audit Table */
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#F8FAFC] dark:bg-[#15232D] border-b border-[#DFE8EC] dark:border-[#2A3D48]">
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4] py-3.5">Assigned Date</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">Employee Name</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">Staff ID</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">Department</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">Task Title</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">Project</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">Due Date</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">Status</TableHead>
                      <TableHead className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4] text-right">Completed?</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedulesLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-12 text-center text-sm text-[#64748B] dark:text-[#A6B5C0]">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#0D9488] mb-2" />
                          Loading schedules report data...
                        </TableCell>
                      </TableRow>
                    ) : !schedulesReport?.records || schedulesReport.records.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-12 text-center text-sm text-[#64748B] dark:text-[#A6B5C0]">
                          No schedule records found for this period and filter selection.
                        </TableCell>
                      </TableRow>
                    ) : (
                      schedulesReport.records.map((rec, idx) => (
                        <TableRow key={idx} className="hover:bg-[#F4F8FA]/60 dark:hover:bg-[#1D303B]/40 border-b border-[#DFE8EC]/60 dark:border-[#2A3D48]/60">
                          <TableCell className="font-medium text-xs text-[#172B3A] dark:text-[#E8F0F4]">{rec.date || '--'}</TableCell>
                          <TableCell className="font-bold text-xs text-[#172B3A] dark:text-[#E8F0F4]">{rec.employeeName}</TableCell>
                          <TableCell className="text-xs text-[#64748B] dark:text-[#A6B5C0]">{rec.employeeId}</TableCell>
                          <TableCell className="text-xs text-[#64748B] dark:text-[#A6B5C0]">{rec.department}</TableCell>
                          <TableCell className="font-medium text-xs text-[#172B3A] dark:text-[#E8F0F4] max-w-xs truncate">
                            {rec.taskTitle}
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="text-[10px] py-0 border-[#DFE8EC] dark:border-[#2A3D48]">
                              {rec.project || 'General'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-[#64748B] dark:text-[#A6B5C0]">{rec.dueDate || '--'}</TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                'px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border',
                                rec.status === 'Completed'
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                  : rec.status === 'In Progress'
                                  ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30'
                                  : rec.status === 'Not Completed'
                                  ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
                                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                              )}
                            >
                              {rec.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              className={cn(
                                'text-[10px] font-bold px-2 py-0.5',
                                rec.isCompleted === 'Completed'
                                  ? 'bg-emerald-600 text-white'
                                  : rec.isCompleted === 'Not Completed'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                              )}
                            >
                              {rec.isCompleted}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        /* DEDICATED PROJECTS REPORT AUDIT WORKSPACE */
        <div className="space-y-6">
          {filteredProjectsReport.length === 0 ? (
            <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] p-12 text-center shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-[#0D9488]/10 text-[#0D9488] mx-auto flex items-center justify-center mb-4">
                <FolderKanban className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-[#172B3A] dark:text-[#E8F0F4]">No Projects Found in Report</h3>
              <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] mt-1 max-w-md mx-auto">
                No company projects match your current search, department, or status filters.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleClearFilters}
                className="mt-4 rounded-xl text-xs border-[#DFE8EC] dark:border-[#2A3D48]"
              >
                Clear Filters
              </Button>
            </Card>
          ) : !activeReportProject ? (
            /* ONLY LIST OF PROJECTS SHOWS INITIALLY */
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div>
                  <h3 className="text-base font-bold text-[#172B3A] dark:text-[#E8F0F4]">
                    Company Projects ({filteredProjectsReport.length})
                  </h3>
                  <p className="text-xs text-[#64748B] dark:text-[#A6B5C0]">
                    Click any project below to audit employees working on it and their schedule task completions for this {period} ({activePeriodLabel})
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                {filteredProjectsReport.map((p) => {
                  const pId = String(p.id || p._id);
                  return (
                    <button
                      key={pId}
                      type="button"
                      onClick={() => {
                        setSelectedReportProjectId(pId);
                        setSelectedReportProjectEmployeeFilter('all');
                        setProjectTaskStatusFilter('all');
                      }}
                      className="p-4 rounded-2xl border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] hover:border-[#0D9488] hover:shadow-sm transition-all text-left flex items-center justify-between group shadow-2xs cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-[#0D9488]/10 text-[#0D9488] flex items-center justify-center shrink-0 group-hover:bg-[#0D9488] group-hover:text-white transition-colors">
                          <FolderKanban className="w-4.5 h-4.5" />
                        </div>
                        <span className="text-sm font-bold text-[#172B3A] dark:text-[#E8F0F4] group-hover:text-[#0D9488] transition-colors truncate">
                          {p.name}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#64748B] group-hover:text-[#0D9488] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* CLICKED PROJECT AUDIT DRILLDOWN */
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedReportProjectId(null)}
                  className="rounded-xl text-xs h-9 gap-2 border-[#DFE8EC] dark:border-[#2A3D48] text-[#172B3A] dark:text-[#E8F0F4] hover:bg-[#F4F8FA] dark:hover:bg-[#1D303B] shadow-2xs font-semibold"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Projects List</span>
                </Button>

                <span className="text-xs text-[#64748B] dark:text-[#A6B5C0]">
                  Auditing Project: <strong className="text-[#172B3A] dark:text-[#E8F0F4]">{activeReportProject.name}</strong> ({activePeriodLabel})
                </span>
              </div>

              {/* Project Header Banner */}
              <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] shadow-xs overflow-hidden">
                <CardHeader className="p-5 sm:p-6 bg-[#F4F8FA]/60 dark:bg-[#1D303B]/40 border-b border-[#DFE8EC] dark:border-[#2A3D48]">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <Badge className={`capitalize font-semibold text-xs ${
                                activeReportProject.status === 'completed'
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                  : activeReportProject.status === 'in_progress'
                                  ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
                                  : activeReportProject.status === 'on_hold'
                                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                  : 'bg-secondary text-muted-foreground'
                              }`}>
                                {activeReportProject.status === 'in_progress' ? 'In Progress' : activeReportProject.status === 'on_hold' ? 'On Hold' : activeReportProject.status || 'Active'}
                              </Badge>
                              {activeReportProject.priority && (
                                <Badge variant="outline" className={`capitalize font-medium text-xs ${
                                  activeReportProject.priority === 'urgent' || activeReportProject.priority === 'high'
                                    ? 'text-red-600 border-red-500/40 bg-red-500/5'
                                    : 'text-muted-foreground'
                                }`}>
                                  {activeReportProject.priority} Priority
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs bg-[#0D9488]/10 text-[#0D9488] border-[#0D9488]/30">
                                Filter: {activePeriodLabel}
                              </Badge>
                            </div>
                            <h3 className="text-xl font-bold text-[#172B3A] dark:text-[#E8F0F4]">{activeReportProject.name}</h3>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-[#A6B5C0]">
                            {activeReportProject.startDate && (
                              <span className="inline-flex items-center gap-1 bg-card px-2.5 py-1 rounded-xl border border-[#DFE8EC] dark:border-[#2A3D48]">
                                <Calendar className="w-3.5 h-3.5 text-[#0D9488]" />
                                Start: {format(new Date(activeReportProject.startDate), 'MMM d, yyyy')}
                              </span>
                            )}
                            {activeReportProject.dueDate && (
                              <span className="inline-flex items-center gap-1 bg-card px-2.5 py-1 rounded-xl border border-[#DFE8EC] dark:border-[#2A3D48]">
                                <Clock className="w-3.5 h-3.5 text-amber-500" />
                                Due: {format(new Date(activeReportProject.dueDate), 'MMM d, yyyy')}
                              </span>
                            )}
                          </div>
                        </div>

                        {activeReportProject.description && (
                          <div className="mt-3 pt-3 border-t border-[#DFE8EC]/80 dark:border-[#2A3D48]/80">
                            <p className="text-xs sm:text-sm text-[#172B3A]/80 dark:text-[#E8F0F4]/80 leading-relaxed whitespace-pre-line">
                              {extractVoiceNote(activeReportProject.description).text || activeReportProject.description}
                            </p>
                            {extractVoiceNote(activeReportProject.description).audioUrl && (
                              <div className="mt-2">
                                <VoiceNoteBadgePlayer audioUrl={extractVoiceNote(activeReportProject.description).audioUrl} />
                              </div>
                            )}
                          </div>
                        )}
                      </CardHeader>
                    </Card>

                    {/* Section 1: All Employees Working on This Project */}
                    <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] shadow-xs">
                      <CardHeader className="p-4 sm:p-5 border-b border-[#DFE8EC] dark:border-[#2A3D48] flex flex-row items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-[#0D9488]/10 text-[#0D9488]">
                            <Users className="w-4 h-4" />
                          </div>
                          <div>
                            <CardTitle className="text-sm sm:text-base font-bold text-[#172B3A] dark:text-[#E8F0F4]">
                              All Employees Working on This Project
                            </CardTitle>
                            <p className="text-xs text-[#64748B] dark:text-[#A6B5C0]">
                              {activeProjectEmployees.length} personnel assigned to this project's tasks
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-[#0D9488]/10 text-[#0D9488] border-[#0D9488]/20 font-bold px-3 py-1">
                          {activeProjectEmployees.length} Employees Working
                        </Badge>
                      </CardHeader>

                      <CardContent className="p-4 sm:p-5">
                        {activeProjectEmployees.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground text-xs">
                            No team members are currently mapped to this project.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                              <button
                                onClick={() => setSelectedReportProjectEmployeeFilter('all')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                                  selectedReportProjectEmployeeFilter === 'all'
                                    ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-xs'
                                    : 'bg-[#F4F8FA] dark:bg-[#1D303B] text-[#64748B] dark:text-[#A6B5C0] border-[#DFE8EC] dark:border-[#2A3D48] hover:border-[#0D9488]/40'
                                }`}
                              >
                                All Team Members ({activeProjectEmployees.length})
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                              {activeProjectEmployees.map((emp) => {
                                const eId = String(emp.userId);
                                const isEmpActive = selectedReportProjectEmployeeFilter === eId;
                                const empTasks = activeReportProjectTasks.filter((t) => {
                                  const rawAssignees = Array.isArray(t.assignedTo)
                                    ? t.assignedTo
                                    : t.assignedTo
                                    ? [t.assignedTo]
                                    : t.assignee
                                    ? [t.assignee]
                                    : [];
                                  const allAssigneeIds = rawAssignees.map(extractUserId).filter(Boolean);
                                  return allAssigneeIds.includes(eId);
                                });
                                const empCompleted = empTasks.filter((t) => t.status === 'done' || t.status === 'completed').length;

                                return (
                                  <div
                                    key={eId}
                                    onClick={() => setSelectedReportProjectEmployeeFilter(isEmpActive ? 'all' : eId)}
                                    className={`p-3 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
                                      isEmpActive
                                        ? 'bg-[#0D9488]/15 border-[#0D9488] ring-1 ring-[#0D9488]/30'
                                        : 'bg-[#F4F8FA]/50 dark:bg-[#1D303B]/30 border-[#DFE8EC] dark:border-[#2A3D48] hover:border-[#0D9488]/30'
                                    }`}
                                  >
                                    <div className="w-10 h-10 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                                      {emp.avatar ? (
                                        <img src={emp.avatar} alt={emp.name} className="w-full h-full object-cover" />
                                      ) : (
                                        (emp.name || 'U').slice(0, 2).toUpperCase()
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h5 className="text-xs font-bold text-[#172B3A] dark:text-[#E8F0F4] truncate">{emp.name}</h5>
                                      <p className="text-[11px] text-[#64748B] dark:text-[#A6B5C0] truncate capitalize">
                                        {emp.role || 'Staff'} • {emp.department}
                                      </p>
                                      <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-[#0D9488]">
                                        <span>{empTasks.length} Tasks ({period})</span>
                                        <span>•</span>
                                        <span className="text-emerald-600 dark:text-emerald-400">{empCompleted} Done</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Section 2: Schedule Task Details & Completion Status */}
                    <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] shadow-xs">
                      <CardHeader className="p-4 sm:p-5 border-b border-[#DFE8EC] dark:border-[#2A3D48] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-[#0D9488]/10 text-[#0D9488]">
                            <Briefcase className="w-4 h-4" />
                          </div>
                          <div>
                            <CardTitle className="text-sm sm:text-base font-bold text-[#172B3A] dark:text-[#E8F0F4]">
                              {selectedReportProjectEmployeeFilter !== 'all'
                                ? `Tasks Assigned to ${activeProjectEmployees.find((e) => String(e.userId) === selectedReportProjectEmployeeFilter)?.name || 'Employee'} (${activePeriodLabel})`
                                : `Schedule Task Details (${activePeriodLabel})`}
                            </CardTitle>
                            <p className="text-xs text-[#64748B] dark:text-[#A6B5C0]">
                              Showing {displayedProjectTasks.length} of {activeReportProjectTasks.length} tasks scheduled in this {period}
                            </p>
                          </div>
                        </div>

                        {/* Task Completion Filter Tabs */}
                        <div className="flex items-center gap-1 bg-[#F4F8FA] dark:bg-[#1D303B] p-1 rounded-xl border border-[#DFE8EC] dark:border-[#2A3D48] overflow-x-auto">
                          {[
                            { key: 'all', label: `All (${activeReportProjectTasks.length})` },
                            {
                              key: 'completed',
                              label: `Completed (${activeReportProjectTasks.filter((t) => t.status === 'done' || t.status === 'completed').length})`,
                            },
                            {
                              key: 'in_progress',
                              label: `In Progress (${activeReportProjectTasks.filter((t) => t.status === 'in_progress').length})`,
                            },
                            {
                              key: 'not_completed',
                              label: `Not Completed (${activeReportProjectTasks.filter((t) => t.status !== 'done' && t.status !== 'completed').length})`,
                            },
                          ].map((tab) => (
                            <button
                              key={tab.key}
                              onClick={() => setProjectTaskStatusFilter(tab.key)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                                projectTaskStatusFilter === tab.key
                                  ? 'bg-[#0D9488] text-white shadow-xs'
                                  : 'text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-[#E8F0F4]'
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                      </CardHeader>

                      <CardContent className="p-4 sm:p-5 space-y-3">
                        {displayedProjectTasks.length === 0 ? (
                          <div className="text-center py-10 text-muted-foreground text-xs">
                            No tasks match your selected {period} period and completion status filter for this project.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {displayedProjectTasks.map((task) => {
                              const isDone = task.status === 'done' || task.status === 'completed';
                              const isInProgress = task.status === 'in_progress';
                              const isHold = task.status === 'paused';
                              const { text: cleanDesc, audioUrl } = extractVoiceNote(task.description || '');

                              const assignees = Array.isArray(task.assignedTo)
                                ? task.assignedTo
                                : task.assignedTo
                                ? [task.assignedTo]
                                : [];

                              return (
                                <div
                                  key={task._id || task.id}
                                  className={`p-4 rounded-2xl border transition-all ${
                                    isDone
                                      ? 'bg-emerald-500/5 border-emerald-500/20'
                                      : isInProgress
                                      ? 'bg-blue-500/5 border-blue-500/20'
                                      : isHold
                                      ? 'bg-amber-500/5 border-amber-500/20'
                                      : 'bg-white dark:bg-[#15232D] border-[#DFE8EC] dark:border-[#2A3D48]'
                                  }`}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 mb-2">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h5 className="text-sm font-bold text-[#172B3A] dark:text-[#E8F0F4]">{task.title}</h5>
                                        {task.priority && (
                                          <Badge variant="outline" className={`text-[10px] uppercase font-semibold ${
                                            task.priority === 'urgent' || task.priority === 'high'
                                              ? 'text-red-500 border-red-500/30'
                                              : 'text-muted-foreground'
                                          }`}>
                                            {task.priority}
                                          </Badge>
                                        )}
                                      </div>

                                      {cleanDesc && (
                                        <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] whitespace-pre-line leading-relaxed">
                                          {cleanDesc}
                                        </p>
                                      )}

                                      {audioUrl && (
                                        <div className="pt-1">
                                          <VoiceNoteBadgePlayer audioUrl={audioUrl} />
                                        </div>
                                      )}
                                    </div>

                                    {/* Completed or Not Status Badge */}
                                    <div className="shrink-0 flex items-center gap-2">
                                      {isDone ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          Completed
                                        </span>
                                      ) : isInProgress ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
                                          <Play className="w-3.5 h-3.5" />
                                          In Progress
                                        </span>
                                      ) : isHold ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                                          <Pause className="w-3.5 h-3.5" />
                                          On Hold
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20">
                                          <Clock className="w-3.5 h-3.5" />
                                          Not Completed
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Task Assigned Employees & Completion Time */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 mt-2 border-t border-[#DFE8EC]/80 dark:border-[#2A3D48]/80">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[11px] font-medium text-[#64748B] dark:text-[#A6B5C0]">Assigned to:</span>
                                      {assignees.length === 0 ? (
                                        <span className="text-[11px] text-muted-foreground italic">Unassigned</span>
                                      ) : (
                                        assignees.map((a, idx) => {
                                          const uId = extractUserId(a);
                                          const foundUser = users.find((u) => {
                                            const uid = extractUserId(u.userId || u.id || u._id);
                                            return uid === uId || u.username === uId;
                                          });
                                          const aName = a?.name || foundUser?.name || foundUser?.username || uId || 'Member';
                                          return (
                                            <span
                                              key={idx}
                                              className="inline-flex items-center gap-1 text-[11px] font-medium bg-[#F4F8FA] dark:bg-[#1D303B] px-2 py-0.5 rounded-lg border border-[#DFE8EC] dark:border-[#2A3D48]"
                                            >
                                              <User className="w-3 h-3 text-[#0D9488]" />
                                              {aName}
                                            </span>
                                          );
                                        })
                                      )}
                                    </div>

                                    {/* Completion Timing Detail */}
                                    <div className="flex items-center gap-2 text-xs">
                                      {isDone ? (
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          <span>
                                            Completed on: {safeFormatDateTime(task.completedAt || task.updatedAt, 'MMM d, yyyy · h:mm a', 'Completed')}
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2 text-[11px] text-[#64748B] dark:text-[#A6B5C0]">
                                          {task.durationValue && (
                                            <span className="bg-muted/40 px-2 py-0.5 rounded-md border border-border">
                                              Duration: {task.durationValue} {task.durationUnit || 'hours'}
                                            </span>
                                          )}
                                          {(task.dueDate || task.endDate) && (
                                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                                              <Clock className="w-3 h-3" />
                                              Due: {formatDeadline(task)}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}

      {/* 7. Email Dispatch Modal */}
      <Dialog open={showEmailModal} onOpenChange={setShowEmailModal}>
        <DialogContent className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#172B3A] dark:text-[#E8F0F4] flex items-center gap-2">
              <Mail className="w-5 h-5 text-[#0D9488] dark:text-[#14B8A6]" />
              <span>
                Email{' '}
                {isAttendanceActive
                  ? 'Attendance'
                  : isPaymentsActive
                  ? 'Payment'
                  : isProjectsActive
                  ? 'Projects'
                  : 'Schedules & Tasks'}{' '}
                Report
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B] dark:text-[#A6B5C0]">
              Send an official report summary and attached CSV export directly to management or auditors.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSendEmail} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Recipient Email *</Label>
              <Input
                type="email"
                required
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="director@company.com"
                className="rounded-xl text-xs h-9 bg-card border-[#DFE8EC] dark:border-[#2A3D48]"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Subject Preview</Label>
              <div className="p-2.5 rounded-xl bg-[#F4F8FA] dark:bg-[#1D303B] border border-[#DFE8EC] dark:border-[#2A3D48] text-xs font-mono text-[#64748B] dark:text-[#A6B5C0]">
                {isAttendanceActive
                  ? 'Attendance Report'
                  : isPaymentsActive
                  ? 'Payment & Payroll Report'
                  : 'Schedules & Tasks Performance Report'}{' '}
                — {companyName} ({activePeriodLabel})
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Executive Notes / Message (Optional)</Label>
              <textarea
                value={emailNotes}
                onChange={(e) => setEmailNotes(e.target.value)}
                placeholder="Add custom review notes or context for the leadership team..."
                rows={3}
                className="w-full rounded-xl text-xs p-2.5 bg-card border border-[#DFE8EC] dark:border-[#2A3D48] text-foreground focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DFE8EC] dark:border-[#2A3D48]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowEmailModal(false)}
                className="rounded-xl text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  sendAttendanceMutation.isPending ||
                  sendPayrollMutation.isPending ||
                  sendSchedulesMutation.isPending
                }
                className="rounded-xl text-xs h-9 bg-[#0D9488] hover:bg-[#0B7A70] text-white gap-1.5 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {sendAttendanceMutation.isPending ||
                  sendPayrollMutation.isPending ||
                  sendSchedulesMutation.isPending
                    ? 'Dispatching...'
                    : 'Dispatch Report'}
                </span>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
