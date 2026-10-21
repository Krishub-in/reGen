import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Download,
  Printer,
  Send,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  Mail,
  User,
  Building,
  Timer,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useGetAttendanceReport, useSendAttendanceReport } from '../../hooks/useQueries';

export default function AttendanceReportDialog({ open, onOpenChange, companyName = 'Company', userProfile }) {
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  const currentMonthStr = format(now, 'yyyy-MM');
  const currentYearStr = String(now.getFullYear());

  // Period: 'day' | 'week' | 'month' | 'year'
  const [period, setPeriod] = useState('month');
  const [date, setDate] = useState(todayStr);
  
  // For week range: default to current Monday - Sunday
  const defaultWeekRange = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diffToMon));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return {
      start: format(mon, 'yyyy-MM-dd'),
      end: format(sun, 'yyyy-MM-dd'),
    };
  }, []);

  const [startDate, setStartDate] = useState(defaultWeekRange.start);
  const [endDate, setEndDate] = useState(defaultWeekRange.end);
  const [month, setMonth] = useState(currentMonthStr);
  const [year, setYear] = useState(currentYearStr);

  // Filters
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState('all');

  // Email dispatch state
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(userProfile?.email || '');
  const [emailNotes, setEmailNotes] = useState('');

  // Report query params
  const reportFilter = useMemo(() => ({
    period,
    date,
    startDate,
    endDate,
    month,
    year,
    department,
    status,
    search,
  }), [period, date, startDate, endDate, month, year, department, status, search]);

  const { data: reportData, isLoading, refetch, isFetching } = useGetAttendanceReport(reportFilter, open);
  const sendReportMutation = useSendAttendanceReport();

  // CSV Download handler
  const handleDownloadCsv = () => {
    if (!reportData?.csvContent) {
      toast.error('No report data available to download');
      return;
    }
    const blob = new Blob([reportData.csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeCompany = (reportData.companyName || companyName).replace(/[^a-zA-Z0-9]/g, '_');
    const safePeriod = (reportData.periodLabel || period).replace(/[^a-zA-Z0-9]/g, '_');
    link.download = `Attendance_Report_${safeCompany}_${safePeriod}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Attendance CSV report downloaded successfully');
  };

  // Print handler
  const handlePrint = () => {
    window.print();
  };

  // Email dispatch handler
  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!recipientEmail || !recipientEmail.trim()) {
      toast.error('Please enter a recipient email address');
      return;
    }

    try {
      const res = await sendReportMutation.mutateAsync({
        recipientEmail: recipientEmail.trim(),
        notes: emailNotes.trim(),
        ...reportFilter,
      });

      toast.success(res.message || 'Attendance report sent successfully!');
      setShowEmailForm(false);
      setEmailNotes('');
    } catch (err) {
      toast.error(err.message || 'Failed to send attendance report email');
    }
  };

  const records = reportData?.records || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-7xl sm:max-w-7xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0 bg-background border-border shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-4 sm:p-6 pb-4 border-b border-border bg-card/60 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <FileText className="h-5 w-5" />
                </div>
                <DialogTitle className="text-xl font-bold tracking-tight">
                  Company Attendance Report
                </DialogTitle>
                <Badge variant="outline" className="text-xs font-mono border-teal-500/30 text-teal-600 dark:text-teal-400">
                  {reportData?.periodLabel || period.toUpperCase()}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Generate, export, and dispatch complete employee attendance records with check-in, check-out, and daily working hours.
              </DialogDescription>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="gap-1.5 text-xs h-9 justify-center"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="gap-1.5 text-xs h-9 justify-center"
              >
                <Printer className="h-3.5 w-3.5" />
                Print
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadCsv}
                disabled={records.length === 0}
                className="gap-1.5 text-xs h-9 justify-center text-teal-600 dark:text-teal-400 border-teal-500/30 hover:bg-teal-500/10"
              >
                <Download className="h-3.5 w-3.5" />
                Download CSV
              </Button>
              <Button
                size="sm"
                onClick={() => setShowEmailForm(prev => !prev)}
                className="gap-1.5 text-xs h-9 justify-center bg-teal-600 hover:bg-teal-700 text-white shadow-sm"
              >
                <Mail className="h-3.5 w-3.5" />
                Send via Email
              </Button>
            </div>
          </div>

          {/* Collapsible Email Dispatch Form */}
          {showEmailForm && (
            <form onSubmit={handleSendEmail} className="mt-4 p-4 rounded-xl border border-teal-500/30 bg-teal-500/5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                  <Mail className="h-4 w-4" /> Send Attendance Report via Email
                </span>
                <span className="text-[11px] text-muted-foreground">Includes KPI summary & attached CSV</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <Label className="text-xs">Recipient Email</Label>
                  <Input
                    type="email"
                    required
                    placeholder="management@company.com"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    className="h-9 text-xs mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Notes / Executive Message (Optional)</Label>
                  <Input
                    placeholder="e.g., Weekly executive shift review for operations audit"
                    value={emailNotes}
                    onChange={(e) => setEmailNotes(e.target.value)}
                    className="h-9 text-xs mt-1"
                  />
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1 [&>button]:w-full sm:[&>button]:w-auto">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEmailForm(false)}
                  className="text-xs h-8 justify-center"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={sendReportMutation.isPending}
                  className="text-xs h-8 bg-teal-600 hover:bg-teal-700 text-white gap-1.5 justify-center"
                >
                  <Send className="h-3 w-3" />
                  {sendReportMutation.isPending ? 'Sending Report...' : 'Send Report Now'}
                </Button>
              </div>
            </form>
          )}

          {/* Period Selector & Parameter Controls */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 items-end">
            {/* Period Type */}
            <div>
              <Label className="text-[11px] uppercase font-bold text-muted-foreground">Period</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-9 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day (Daily)</SelectItem>
                  <SelectItem value="week">Week (Weekly)</SelectItem>
                  <SelectItem value="month">Month (Monthly)</SelectItem>
                  <SelectItem value="year">Year (Annual)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic Date Inputs based on Period */}
            {period === 'day' && (
              <div className="md:col-span-2">
                <Label className="text-[11px] uppercase font-bold text-muted-foreground">Select Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-9 text-xs mt-1"
                />
              </div>
            )}

            {period === 'week' && (
              <>
                <div>
                  <Label className="text-[11px] uppercase font-bold text-muted-foreground">Week Start</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-9 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] uppercase font-bold text-muted-foreground">Week End</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-9 text-xs mt-1"
                  />
                </div>
              </>
            )}

            {period === 'month' && (
              <div className="md:col-span-2">
                <Label className="text-[11px] uppercase font-bold text-muted-foreground">Select Month</Label>
                <Input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="h-9 text-xs mt-1"
                />
              </div>
            )}

            {period === 'year' && (
              <div className="md:col-span-2">
                <Label className="text-[11px] uppercase font-bold text-muted-foreground">Select Year</Label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className="h-9 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027, 2028].map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Status Filter */}
            <div>
              <Label className="text-[11px] uppercase font-bold text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                  <SelectItem value="half_day">Half Day</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search Input */}
            <div className="sm:col-span-2">
              <Label className="text-[11px] uppercase font-bold text-muted-foreground">Search</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filter name or ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 text-xs pl-8"
                />
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Executive Summary Metric Cards */}
        <div className="p-6 py-4 bg-muted/20 border-b border-border grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-xl bg-card border border-border shadow-2xs min-w-0 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate block">Total Shifts</span>
            <div className="text-xl lg:text-2xl font-black font-mono text-foreground mt-1 whitespace-nowrap">
              {reportData?.totalRecords ?? 0}
            </div>
            <span className="text-[11px] text-muted-foreground mt-1 truncate block">Recorded logs</span>
          </div>

          <div className="p-3.5 rounded-xl bg-card border border-border shadow-2xs min-w-0 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate block">Total Hours</span>
            <div className="text-xl lg:text-2xl font-black font-mono text-teal-600 dark:text-teal-400 mt-1 whitespace-nowrap">
              {reportData?.totalWorkingHours ?? 0}h
            </div>
            <span className="text-[11px] text-muted-foreground mt-1 truncate block">Worked total</span>
          </div>

          <div className="p-3.5 rounded-xl bg-card border border-border shadow-2xs min-w-0 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate block">Avg Daily Hours</span>
            <div className="text-xl lg:text-2xl font-black font-mono text-foreground mt-1 whitespace-nowrap">
              {reportData?.averageDailyHours ?? 0}h
            </div>
            <span className="text-[11px] text-muted-foreground mt-1 truncate block">Per employee shift</span>
          </div>

          <div className="p-3.5 rounded-xl bg-card border border-border shadow-2xs min-w-0 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate block">Active Staff</span>
            <div className="text-xl lg:text-2xl font-black font-mono text-foreground mt-1 whitespace-nowrap">
              {reportData?.uniqueEmployees ?? 0}
            </div>
            <span className="text-[11px] text-muted-foreground mt-1 truncate block">Unique employees</span>
          </div>

          <div className="p-3.5 rounded-xl bg-card border border-border shadow-2xs min-w-0 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate block">Present / On Time</span>
            <div className="text-xl lg:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1 whitespace-nowrap">
              {reportData?.presentCount ?? 0}
            </div>
            <span className="text-[11px] text-muted-foreground mt-1 truncate block">Full attendance</span>
          </div>

          <div className="p-3.5 rounded-xl bg-card border border-border shadow-2xs min-w-0 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate block">Late / Half / Absent</span>
            <div className="text-xl lg:text-2xl font-black font-mono text-amber-600 dark:text-amber-400 mt-1 whitespace-nowrap">
              {(reportData?.lateCount ?? 0) + (reportData?.halfDayCount ?? 0) + (reportData?.absentCount ?? 0)}
            </div>
            <span className="text-[11px] text-muted-foreground mt-1 truncate block">Late: {reportData?.lateCount ?? 0}</span>
          </div>
        </div>

        {/* Line-by-Line Detailed Attendance Records Table */}
        <div className="flex-1 overflow-auto p-6 pt-2">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-teal-600" />
              <p className="text-sm text-muted-foreground font-medium">Compiling attendance report records...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="py-20 text-center space-y-2">
              <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto opacity-40" />
              <p className="text-sm font-semibold text-foreground">No attendance records found for this period</p>
              <p className="text-xs text-muted-foreground">Try adjusting your date range or filter criteria.</p>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden shadow-2xs">
              <Table>
                <TableHeader className="bg-secondary/40 sticky top-0 z-10 backdrop-blur-sm">
                  <TableRow>
                    <TableHead className="text-xs font-bold uppercase text-muted-foreground py-3 whitespace-nowrap">Date</TableHead>
                    <TableHead className="text-xs font-bold uppercase text-muted-foreground py-3 whitespace-nowrap">Employee ID</TableHead>
                    <TableHead className="text-xs font-bold uppercase text-muted-foreground py-3 whitespace-nowrap">Name</TableHead>
                    <TableHead className="text-xs font-bold uppercase text-muted-foreground py-3 whitespace-nowrap">Check In</TableHead>
                    <TableHead className="text-xs font-bold uppercase text-muted-foreground py-3 whitespace-nowrap">Check Out</TableHead>
                    <TableHead className="text-xs font-bold uppercase text-muted-foreground py-3 whitespace-nowrap">Working Hours</TableHead>
                    <TableHead className="text-xs font-bold uppercase text-muted-foreground py-3 whitespace-nowrap">Status</TableHead>
                    <TableHead className="text-xs font-bold uppercase text-muted-foreground py-3 whitespace-nowrap">Department</TableHead>
                    <TableHead className="text-xs font-bold uppercase text-muted-foreground py-3 text-right whitespace-nowrap">Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r, i) => (
                    <TableRow key={r.id || `${r.userId}-${r.date}-${i}`} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs font-medium py-3 whitespace-nowrap">{r.date}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground py-3 whitespace-nowrap">{r.staffId || r.userId}</TableCell>
                      <TableCell className="text-xs font-semibold text-foreground py-3 whitespace-nowrap">
                        {r.name}
                        {r.designation && <span className="block text-[10px] text-muted-foreground font-normal">{r.designation}</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground py-3 whitespace-nowrap">
                        {r.checkInDisplay || '--'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground py-3 whitespace-nowrap">
                        {r.checkOutDisplay || <span className="text-muted-foreground italic">Ongoing</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-bold text-teal-600 dark:text-teal-400 py-3 whitespace-nowrap">
                        {r.workingHours} hrs
                      </TableCell>
                      <TableCell className="py-3 whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={
                            r.status === 'present'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              : r.status === 'late'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                              : r.status === 'half_day'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                              : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
                          }
                        >
                          {r.status === 'half_day' ? 'Half Day' : r.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-3 whitespace-nowrap">{r.department || 'General'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground py-3 text-right whitespace-nowrap">{r.location || 'Office'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
