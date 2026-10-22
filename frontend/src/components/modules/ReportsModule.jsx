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
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  useGetAttendanceReport,
  useSendAttendanceReport,
  useGetPayrollReport,
  useSendPayrollReport,
  useGetSchedulesReport,
  useSendSchedulesReport,
  useGetCompanyInfo,
} from '../../hooks/useQueries';

export default function ReportsModule({ userProfile }) {
  const { data: companyInfo } = useGetCompanyInfo();
  const companyName = companyInfo?.name || userProfile?.companyName || userProfile?.tenantName || 'Company';

  // Active Report Tab: 'attendance' | 'payments' | 'schedules'
  const [activeReportTab, setActiveReportTab] = useState('attendance');

  // Time Granularity: 'day' | 'month' | 'year'
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  const currentMonthStr = format(now, 'yyyy-MM');
  const currentYearStr = String(now.getFullYear());

  const [period, setPeriod] = useState('month'); // 'day' | 'month' | 'year'
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [selectedYear, setSelectedYear] = useState(currentYearStr);

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

  // Build Filter Objects for queries
  const attendanceFilter = useMemo(() => ({
    period,
    date: selectedDate,
    month: selectedMonth,
    year: selectedYear,
    department,
    status,
    search,
  }), [period, selectedDate, selectedMonth, selectedYear, department, status, search]);

  const payrollFilter = useMemo(() => ({
    period,
    date: selectedDate,
    month: selectedMonth,
    year: selectedYear,
    department,
    status,
    search,
  }), [period, selectedDate, selectedMonth, selectedYear, department, status, search]);

  const schedulesFilter = useMemo(() => ({
    period,
    date: selectedDate,
    month: selectedMonth,
    year: selectedYear,
    department,
    status,
    search,
  }), [period, selectedDate, selectedMonth, selectedYear, department, status, search]);

  // Queries
  const isAttendanceActive = activeReportTab === 'attendance';
  const isPaymentsActive = activeReportTab === 'payments';
  const isSchedulesActive = activeReportTab === 'schedules';

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

  const sendAttendanceMutation = useSendAttendanceReport();
  const sendPayrollMutation = useSendPayrollReport();
  const sendSchedulesMutation = useSendSchedulesReport();

  const isRefreshing = attendanceFetching || payrollFetching || schedulesFetching;

  // Manual refetch
  const handleRefresh = () => {
    if (isAttendanceActive) refetchAttendance();
    else if (isPaymentsActive) refetchPayroll();
    else refetchSchedules();
    toast.success('Refreshing report data...');
  };

  // CSV Download
  const handleDownloadCsv = () => {
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
    if (period === 'year') {
      return `Full Year ${selectedYear}`;
    }
    try {
      const [y, m] = selectedMonth.split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      return format(d, 'MMMM yyyy');
    } catch {
      return selectedMonth;
    }
  }, [period, selectedDate, selectedMonth, selectedYear]);

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
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveReportTab('attendance')}
            className={cn(
              'flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all',
              isAttendanceActive
                ? 'bg-white dark:bg-[#1D303B] text-[#0D9488] dark:text-[#14B8A6] shadow-sm border border-[#DFE8EC]/80 dark:border-[#2A3D48]'
                : 'text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-[#E8F0F4]'
            )}
          >
            <Clock className="w-4 h-4" />
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
              'flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all',
              isPaymentsActive
                ? 'bg-white dark:bg-[#1D303B] text-[#0D9488] dark:text-[#14B8A6] shadow-sm border border-[#DFE8EC]/80 dark:border-[#2A3D48]'
                : 'text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-[#E8F0F4]'
            )}
          >
            <DollarSign className="w-4 h-4" />
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
              'flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all',
              isSchedulesActive
                ? 'bg-white dark:bg-[#1D303B] text-[#0D9488] dark:text-[#14B8A6] shadow-sm border border-[#DFE8EC]/80 dark:border-[#2A3D48]'
                : 'text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-[#E8F0F4]'
            )}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Schedules & Tasks Report</span>
            {schedulesReport?.totalTasks !== undefined && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-teal-500/10 text-teal-600 dark:text-teal-400 font-bold">
                {schedulesReport.totalTasks}
              </span>
            )}
          </button>
        </div>

        {/* Current Active Period Indicator Badge */}
        <div className="flex items-center justify-end px-3 py-1 text-xs font-semibold text-[#0D9488] dark:text-[#14B8A6]">
          <Calendar className="w-3.5 h-3.5 mr-1.5" />
          <span>Active Period: {activePeriodLabel}</span>
        </div>
      </div>

      {/* 3. Granular Time Filters Bar: Day, Month, Year */}
      <Card className="rounded-2xl border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] shadow-2xs">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Period Granularity Selector (Day | Month | Year) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0] uppercase tracking-wider">
                1. Select Time Range (Day / Month / Year)
              </Label>
              <div className="inline-flex p-1 rounded-xl bg-[#F4F8FA] dark:bg-[#1D303B] border border-[#DFE8EC] dark:border-[#2A3D48]">
                <button
                  type="button"
                  onClick={() => setPeriod('day')}
                  className={cn(
                    'px-4 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    period === 'day'
                      ? 'bg-white dark:bg-[#15232D] text-[#0D9488] shadow-2xs font-bold'
                      : 'text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-[#E8F0F4]'
                  )}
                >
                  Day View
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod('month')}
                  className={cn(
                    'px-4 py-1.5 rounded-lg text-xs font-semibold transition-all',
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
                    'px-4 py-1.5 rounded-lg text-xs font-semibold transition-all',
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
              <Label className="text-xs font-medium text-[#64748B] dark:text-[#A6B5C0]">Search Employee / Task</Label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by name, ID or task..."
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

      {/* 6. Detailed Professional Audit Register Table */}
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
