import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetPayrollSettings,
  useUpdatePayrollSettings,
  useGetPayrollSummary,
  useGetEmployeePayrollPreview,
  useFinalizePayroll,
  useProcessPayment,
  useGetRecentTransactions,
  useGetEmployeeMyPayroll,
  useGetAllUsers,
  useAddPayrollAdjustment,
} from '../../hooks/useQueries';
import { useCustomAuth } from '../../hooks/useCustomAuth';
import { hasUserRole } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Wallet,
  Settings,
  Download,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  DollarSign,
  Users,
  CreditCard,
  FileText,
  Calendar,
  Building,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Send,
  Printer,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  Gift,
  PlusCircle,
  MinusCircle,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import { useScrollPagination } from '../../hooks/useScrollPagination';

export default function PaymentsModule({ userProfile }) {
  const queryClient = useQueryClient();
  const { identity } = useCustomAuth();

  const isAdmin = hasUserRole(userProfile, 'admin') || hasUserRole(userProfile, 'owner') || hasUserRole(userProfile, 'param');
  const isOwner = hasUserRole(userProfile, 'owner') || hasUserRole(userProfile, 'param');

  // Month navigation (Format: 'YYYY-MM')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'pending', 'processed', 'transactions'
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedPreviewUser, setSelectedPreviewUser] = useState(null); // userId for preview breakdown
  const [selectedPaymentPayroll, setSelectedPaymentPayroll] = useState(null); // payroll object for processing payment
  const [selectedPayslipRecord, setSelectedPayslipRecord] = useState(null); // for viewing/printing payslip
  const [isBonusModalOpen, setIsBonusModalOpen] = useState(false);
  const [isDeductionModalOpen, setIsDeductionModalOpen] = useState(false);

  // Bonus and Deduction forms
  const [bonusForm, setBonusForm] = useState({
    userId: '',
    amount: '',
    reason: '',
  });
  const [deductionForm, setDeductionForm] = useState({
    userId: '',
    amount: '',
    reason: '',
  });

  const addAdjustmentMutation = useAddPayrollAdjustment();

  // Payment form state
  const [paymentForm, setPaymentForm] = useState({
    paymentMethod: 'bank_transfer',
    referenceId: '',
    notes: '',
  });

  // Settings form state
  const { data: payrollSettings, isLoading: isSettingsLoading } = useGetPayrollSettings();
  const updateSettingsMutation = useUpdatePayrollSettings();
  const [settingsForm, setSettingsForm] = useState({
    checkInTime: '09:30',
    checkOutTime: '18:30',
    workingHoursPerDay: 8,
    workingDaysPerWeek: 5,
    hourlyDeductionPct: 50,
    hourlyOvertimePct: 75,
    approvedLeaveDeductionPct: 25,
    unapprovedLeaveDeductionPct: 100,
    graceMinutes: 0,
    payrollDivisorType: 'scheduled_hours',
    fixedPayrollDivisor: 200,
    dailyBasisType: 'scheduled_days',
  });

  useEffect(() => {
    if (payrollSettings) {
      setSettingsForm({
        checkInTime: payrollSettings.checkInTime || '09:30',
        checkOutTime: payrollSettings.checkOutTime || '18:30',
        workingHoursPerDay: payrollSettings.workingHoursPerDay || 8,
        workingDaysPerWeek: payrollSettings.workingDaysPerWeek || 5,
        hourlyDeductionPct: payrollSettings.hourlyDeductionPct ?? 50,
        hourlyOvertimePct: payrollSettings.hourlyOvertimePct ?? 75,
        approvedLeaveDeductionPct: payrollSettings.approvedLeaveDeductionPct ?? 25,
        unapprovedLeaveDeductionPct: payrollSettings.unapprovedLeaveDeductionPct ?? 100,
        graceMinutes: payrollSettings.graceMinutes ?? 0,
        payrollDivisorType: payrollSettings.payrollDivisorType || 'scheduled_hours',
        fixedPayrollDivisor: payrollSettings.fixedPayrollDivisor || 200,
        dailyBasisType: payrollSettings.dailyBasisType || 'scheduled_days',
      });
    }
  }, [payrollSettings]);

  // Main Queries
  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    refetch: refetchSummary,
  } = useGetPayrollSummary(selectedMonth, {
    search: searchQuery,
    department: deptFilter,
    statusTab: activeTab === 'transactions' ? 'all' : activeTab,
  });

  const {
    data: previewData,
    isLoading: isPreviewLoading,
    refetch: refetchPreview,
  } = useGetEmployeePayrollPreview(selectedPreviewUser, selectedMonth);

  const {
    data: transactionsData,
    isLoading: isTransactionsLoading,
    refetch: refetchTransactions,
  } = useGetRecentTransactions({
    month: selectedMonth === 'all' ? '' : selectedMonth,
    search: searchQuery,
    page,
    limit: 15,
  });

  // Employee-side data (when not admin/owner or in employee view)
  const { data: myPayrollData, isLoading: isMyPayrollLoading, refetch: refetchMyPayroll } = useGetEmployeeMyPayroll(selectedMonth);

  // Mutations
  const finalizeMutation = useFinalizePayroll();
  const processPaymentMutation = useProcessPayment();

  // Socket listener for real-time updates
  useEffect(() => {
    const handlePayrollChange = () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
    };
    window.addEventListener('payroll:change', handlePayrollChange);
    return () => window.removeEventListener('payroll:change', handlePayrollChange);
  }, [queryClient]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    setSelectedMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const next = new Date(y, m, 1);
    setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };

  const formattedMonthLabel = useMemo(() => {
    try {
      const [y, m] = selectedMonth.split('-').map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch {
      return selectedMonth;
    }
  }, [selectedMonth]);

  const defaultSummary = {
    totalEmployees: 0,
    totalAmountSent: 0,
    totalAmountToPay: 0,
    totalBaseSalary: 0,
    totalDeductions: 0,
    totalOvertimeAdditions: 0,
    totalBonuses: 0,
    totalManualDeductions: 0,
    totalNetPayable: 0,
    pendingFinalizationCount: 0,
    pendingPaymentCount: 0,
    paymentsCompletedCount: 0,
  };

  const summary = (summaryData?.summary && typeof summaryData.summary === 'object' && !Array.isArray(summaryData.summary))
    ? { ...defaultSummary, ...summaryData.summary }
    : defaultSummary;

  const payrollItems = summaryData?.items || [];

  // Filter items by active tab
  const displayedItems = useMemo(() => {
    if (activeTab === 'pending') {
      return payrollItems.filter(i => !i.isPaid);
    }
    if (activeTab === 'processed') {
      return payrollItems.filter(i => i.isPaid);
    }
    return payrollItems;
  }, [payrollItems, activeTab]);

  // Extract unique departments for filter dropdown
  const departments = useMemo(() => {
    const set = new Set();
    payrollItems.forEach(i => {
      if (i.department) set.add(i.department);
    });
    return Array.from(set);
  }, [payrollItems]);

  // Save Settings handler
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await updateSettingsMutation.mutateAsync(settingsForm);
      toast.success('Company payroll rules updated successfully!');
      setIsSettingsOpen(false);
      refetchSummary();
    } catch (err) {
      toast.error(err.message || 'Failed to update payroll rules');
    }
  };

  // Finalize payroll handler
  const handleFinalizePayroll = async (userId) => {
    try {
      await finalizeMutation.mutateAsync({
        userId,
        month: selectedMonth,
      });
      toast.success('Payroll finalized successfully! Immutable snapshot saved.');
      refetchSummary();
      if (selectedPreviewUser === userId) {
        refetchPreview();
      }
    } catch (err) {
      toast.error(err.message || 'Failed to finalize payroll');
    }
  };

  // Process payment handler
  const handleProcessPayment = async (e) => {
    e.preventDefault();
    if (!paymentForm.referenceId.trim()) {
      toast.error('Please enter a payment reference or transaction ID');
      return;
    }

    const isBonusPayout = selectedPaymentPayroll && selectedPaymentPayroll.amountPaid > 0;
    const amountToPay = selectedPaymentPayroll
      ? (selectedPaymentPayroll.pendingAmount !== undefined && selectedPaymentPayroll.pendingAmount > 0
          ? selectedPaymentPayroll.pendingAmount
          : (selectedPaymentPayroll.totalAmount !== undefined ? selectedPaymentPayroll.totalAmount : selectedPaymentPayroll.netPayable))
      : 0;

    try {
      await processPaymentMutation.mutateAsync({
        payrollId: selectedPaymentPayroll._id || selectedPaymentPayroll.id,
        userId: selectedPaymentPayroll.userId,
        month: selectedMonth,
        amount: amountToPay,
        isBonusPayment: isBonusPayout,
        payoutType: isBonusPayout ? 'bonus' : 'salary',
        paymentMethod: paymentForm.paymentMethod,
        referenceId: paymentForm.referenceId.trim(),
        notes: paymentForm.notes.trim(),
      });
      toast.success(`${isBonusPayout ? 'Bonus payment' : 'Payment'} of ₹${amountToPay.toLocaleString()} processed successfully!`);
      setSelectedPaymentPayroll(null);
      setPaymentForm({ paymentMethod: 'bank_transfer', referenceId: '', notes: '' });
      refetchSummary();
      refetchTransactions();
    } catch (err) {
      toast.error(err.message || 'Failed to process payment');
    }
  };

  // Add Bonus handler
  const handleAddBonus = async (e) => {
    e.preventDefault();
    if (!bonusForm.userId) {
      toast.error('Please select an employee');
      return;
    }
    const amountNum = parseFloat(bonusForm.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid bonus amount greater than 0');
      return;
    }

    try {
      const res = await addAdjustmentMutation.mutateAsync({
        userId: bonusForm.userId,
        month: selectedMonth,
        type: 'bonus',
        amount: amountNum,
        reason: bonusForm.reason.trim(),
      });
      const selectedEmp = payrollItems.find(p => (p.userId === bonusForm.userId || p.StaffId === bonusForm.userId));
      toast.success(res?.message || `Bonus of ₹${amountNum.toLocaleString()} added to ${selectedEmp?.name || bonusForm.userId}!`);
      setIsBonusModalOpen(false);
      setBonusForm({ userId: '', amount: '', reason: '' });
      refetchSummary();
    } catch (err) {
      toast.error(err.message || 'Failed to add bonus');
    }
  };

  // Add Deduction handler
  const handleAddDeduction = async (e) => {
    e.preventDefault();
    if (!deductionForm.userId) {
      toast.error('Please select an employee');
      return;
    }
    const amountNum = parseFloat(deductionForm.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid deduction amount greater than 0');
      return;
    }

    try {
      const res = await addAdjustmentMutation.mutateAsync({
        userId: deductionForm.userId,
        month: selectedMonth,
        type: 'deduction',
        amount: amountNum,
        reason: deductionForm.reason.trim(),
      });
      const selectedEmp = payrollItems.find(p => (p.userId === deductionForm.userId || p.StaffId === deductionForm.userId));
      toast.success(res?.message || `Deduction of ₹${amountNum.toLocaleString()} applied to ${selectedEmp?.name || deductionForm.userId}!`);
      setIsDeductionModalOpen(false);
      setDeductionForm({ userId: '', amount: '', reason: '' });
      refetchSummary();
    } catch (err) {
      toast.error(err.message || 'Failed to add deduction');
    }
  };

  // Export CSV Report
  const handleExportCSV = () => {
    if (!payrollItems.length) {
      toast.info('No payroll records to export');
      return;
    }

    const headers = [
      'Employee ID',
      'Name',
      'Department',
      'Base Salary (INR)',
      'Scheduled Hours',
      'Actual Hours',
      'Shortfall Hours',
      'Overtime Hours',
      'Approved Leave Days',
      'Unapproved Leave Days',
      'Hourly Deductions (INR)',
      'Overtime Additions (INR)',
      'Approved Leave Deductions (INR)',
      'Unapproved Leave Deductions (INR)',
      'Net Payable (INR)',
      'Payroll Status',
      'Payment Status',
    ];

    const rows = payrollItems.map(p => [
      p.StaffId || p.userId,
      `"${p.name || ''}"`,
      `"${p.department || 'General'}"`,
      p.baseSalary,
      p.scheduledWorkingHours,
      p.actualWorkingHours,
      p.shortfallHours,
      p.overtimeHours,
      p.approvedLeaveDays,
      p.unapprovedLeaveDays,
      p.hourlyShortfallDeduction,
      p.hourlyOvertimeAddition,
      p.approvedLeaveDeduction,
      p.unapprovedLeaveDeduction,
      p.netPayable,
      p.status,
      p.paymentStatus,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Regenai_Payroll_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Payroll report downloaded successfully');
  };

  // ==========================================
  // EMPLOYEE VIEW (For Non-Admins / Staff)
  // ==========================================
  if (!isAdmin) {
    const myPayroll = myPayrollData?.payroll;
    const myTx = myPayrollData?.transaction;

    return (
      <div className="space-y-6 pb-12">
        {/* Header with Month Selector */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/60 pb-5">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Wallet className="h-6 w-6 text-teal-600 dark:text-teal-400" />
              My Salary & Payments
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Review your monthly earnings, attendance calculations, deductions, and payment receipts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">

            <div className="flex items-center gap-2 bg-card border border-border px-3 py-1.5 rounded-2xl shadow-xs">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={handlePrevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-semibold text-sm px-2 min-w-[120px] text-center">
                {formattedMonthLabel}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={handleNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {isMyPayrollLoading ? (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
            <RefreshCw className="h-8 w-8 animate-spin text-teal-600 mb-3" />
            <p className="text-sm">Calculating your payroll preview...</p>
          </div>
        ) : !myPayroll ? (
          <Card className="p-12 text-center text-muted-foreground rounded-2xl border-border">
            <p className="text-base font-semibold text-foreground">No payroll record found for {formattedMonthLabel}</p>
            <p className="text-xs text-muted-foreground mt-1">Please select another month or contact HR.</p>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Net Salary Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="md:col-span-2 border border-border bg-gradient-to-br from-card via-card to-teal-500/5 rounded-2xl p-6 shadow-xs relative overflow-hidden">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {myPayroll.isPaid ? 'Total Amount Disbursed' : 'Total Amount'} ({formattedMonthLabel})
                    </span>
                    <div className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mt-1 flex items-baseline gap-1">
                      <span className="text-teal-600 dark:text-teal-400">₹</span>
                      <span>{((myPayroll.totalAmount !== undefined ? myPayroll.totalAmount : myPayroll.netPayable) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge className={myPayroll.isPaid ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' : 'bg-amber-500/15 text-amber-600 border-amber-500/30'}>
                        {myPayroll.isPaid ? 'Paid' : myPayroll.isFinalized ? 'Finalized (Pending Payment)' : 'Draft Preview'}
                      </Badge>
                      {myTx && (
                        <span className="text-xs text-muted-foreground">
                          Ref: <strong className="text-foreground">{myTx.referenceId}</strong> via {myTx.paymentMethod?.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {myPayroll.isPaid && (
                    <Button
                      onClick={() => setSelectedPayslipRecord(myPayroll)}
                      variant="outline"
                      className="rounded-xl border-teal-500/30 hover:bg-teal-500/10 text-teal-700 dark:text-teal-300 font-semibold"
                    >
                      <Printer className="h-4 w-4 mr-2" />
                      View Payslip
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-border/60">
                  <div>
                    <span className="text-[11px] text-muted-foreground uppercase font-medium">Bonus Added</span>
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">+₹{(myPayroll.bonus || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground uppercase font-medium">Overtime Add</span>
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">+₹{(myPayroll.hourlyOvertimeAddition || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground uppercase font-medium">Shortfall Deduct</span>
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400 mt-0.5">-₹{(myPayroll.hourlyShortfallDeduction || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground uppercase font-medium">Leave & Other Deduct</span>
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400 mt-0.5">-₹{(((myPayroll.approvedLeaveDeduction || 0) + (myPayroll.unapprovedLeaveDeduction || 0) + (myPayroll.manualDeduction || 0))).toLocaleString()}</p>
                  </div>
                </div>
              </Card>

              {/* Work Summary Card */}
              <Card className="border border-border bg-card rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attendance Hours</span>
                  <div className="flex items-center justify-between mt-3 text-sm">
                    <span className="text-muted-foreground">Scheduled Hours:</span>
                    <span className="font-semibold">{myPayroll.scheduledWorkingHours}h ({myPayroll.scheduledWorkingDays} days)</span>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <span className="text-muted-foreground">Actual Worked:</span>
                    <span className="font-semibold text-teal-600 dark:text-teal-400">{myPayroll.actualWorkingHours}h</span>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <span className="text-muted-foreground">Shortfall Hours:</span>
                    <span className="font-semibold text-red-500">{myPayroll.shortfallHours}h</span>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <span className="text-muted-foreground">Overtime Hours:</span>
                    <span className="font-semibold text-emerald-500">+{myPayroll.overtimeHours}h</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-border/60 text-[11px] text-muted-foreground">
                  Hourly rate basis: ₹{myPayroll.hourlyDeductionRate}/hr shortfall • ₹{myPayroll.hourlyOvertimeRate}/hr overtime
                </div>
              </Card>
            </div>

            {/* Daily Calculation Breakdown Table */}
            <Card className="border border-border bg-card rounded-2xl shadow-xs overflow-hidden">
              <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
                <CardTitle className="text-base font-bold text-foreground">Day-by-Day Payroll Log</CardTitle>
                <CardDescription className="text-xs">
                  Full transparent breakdown of working hours, leaves, and daily payroll adjustments.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Day</TableHead>
                        <TableHead>Check-In</TableHead>
                        <TableHead>Check-Out</TableHead>
                        <TableHead>Required</TableHead>
                        <TableHead>Actual</TableHead>
                        <TableHead>Shortfall / OT</TableHead>
                        <TableHead>Adjustment (₹)</TableHead>
                        <TableHead>Status / Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myPayroll.dailyBreakdown?.map((day) => (
                        <TableRow key={day.date} className={day.isWeeklyOff || day.isHoliday ? 'bg-muted/10' : ''}>
                          <TableCell className="font-mono text-xs font-medium">{day.date}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{day.dayName}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {day.checkIn ? new Date(day.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {day.checkOut ? new Date(day.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                          </TableCell>
                          <TableCell className="text-xs">{day.requiredHours}h</TableCell>
                          <TableCell className="text-xs font-semibold">{day.actualHours}h</TableCell>
                          <TableCell className="text-xs">
                            {day.overtimeHours > 0 ? (
                              <span className="text-emerald-600 font-semibold">+{day.overtimeHours}h OT</span>
                            ) : day.shortfallHours > 0 ? (
                              <span className="text-red-500 font-semibold">-{day.shortfallHours}h SF</span>
                            ) : (
                              '--'
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {day.overtimeAddition > 0 ? (
                              <span className="text-emerald-600 font-semibold">+₹{day.overtimeAddition}</span>
                            ) : day.shortfallDeduction > 0 ? (
                              <span className="text-red-600 font-semibold">-₹{day.shortfallDeduction}</span>
                            ) : day.leaveDeduction > 0 ? (
                              <span className="text-red-600 font-semibold">-₹{day.leaveDeduction}</span>
                            ) : (
                              '₹0.00'
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {day.isHoliday ? (
                              <Badge variant="outline" className="text-purple-600 bg-purple-500/10 border-purple-500/30">Holiday</Badge>
                            ) : day.isWeeklyOff ? (
                              <Badge variant="outline" className="text-muted-foreground bg-muted">Weekly Off</Badge>
                            ) : day.isApprovedLeave ? (
                              <Badge variant="outline" className="text-blue-600 bg-blue-500/10 border-blue-500/30">Approved Leave</Badge>
                            ) : day.isUnapprovedLeave ? (
                              <Badge variant="outline" className="text-red-600 bg-red-500/10 border-red-500/30">Unapproved</Badge>
                            ) : (
                              day.notes || 'Normal Day'
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // COMPANY MANAGEMENT VIEW (Admin / Owner / Param)
  // ==========================================
  return (
    <div className="space-y-6 pb-12">
      {/* Header with Month Selector & Action Buttons */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/60 pb-5">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Wallet className="h-6 w-6 text-teal-600 dark:text-teal-400" />
            Payroll & Payment Management
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure salary rules, calculate dynamic attendance-based payroll, finalize snapshots, and record employee payments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full md:w-auto">
          {/* Month Navigation */}
          <div className="flex items-center justify-between sm:justify-start gap-1.5 bg-card border border-border px-2.5 py-1 rounded-2xl shadow-xs w-full sm:w-auto">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold text-xs sm:text-sm px-2 min-w-[120px] sm:min-w-[130px] text-center text-foreground flex-1 sm:flex-none">
              {formattedMonthLabel}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Export Report */}
          <Button onClick={handleExportCSV} variant="outline" className="rounded-xl text-xs font-semibold h-9 border-border w-full sm:w-auto justify-center">
            <Download className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            Export CSV
          </Button>

          {/* Payroll Rules Config */}
          <Button
            onClick={() => setIsSettingsOpen(true)}
            variant="outline"
            className="rounded-xl text-xs font-semibold h-9 border-border hover:border-teal-500/50 w-full sm:w-auto justify-center"
          >
            <Settings className="mr-1.5 h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            Payroll Rules
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <Card className="border border-border bg-card rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Staff</span>
            <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <Users className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mt-2">
            {summary.totalEmployees}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Eligible employees</p>
        </Card>

        <Card className="border border-border bg-card rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Amount</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Wallet className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 mt-2">
            ₹{(summary.totalAmountSent || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Dynamically sent • ₹{(summary.totalAmountToPay || 0).toLocaleString()} pending
          </p>
        </Card>

        <Card className="border border-border bg-card rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Bonus Added</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Gift className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 mt-2">
            +₹{(summary.totalBonuses || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Employee bonuses</p>
        </Card>

        <Card className="border border-border bg-card rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Overtime</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 mt-2">
            +₹{(summary.totalOvertimeAdditions || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Total additions</p>
        </Card>

        <Card className="border border-border bg-card rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Deductions</span>
            <div className="p-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
              <ArrowDownRight className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold tracking-tight text-red-600 dark:text-red-400 mt-2">
            -₹{((summary.totalDeductions || 0) + (summary.totalManualDeductions || 0)).toLocaleString()}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Shortfall, leaves & deductions</p>
        </Card>

        <Card className="border border-border bg-card rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Payment Status</span>
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <CreditCard className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mt-2">
            {summary.paymentsCompletedCount} / {summary.totalEmployees}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {summary.pendingPaymentCount} pending • {summary.pendingFinalizationCount} draft
          </p>
        </Card>
      </div>

      {/* Above all payments & pending payment: Add Bonus and Add Deduction Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-card border border-border shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-foreground">Employee Adjustments</h4>
            <p className="text-[11px] text-muted-foreground">Select employee name & ID to instantly add bonus reward or record deduction</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
          {/* Add Bonus Button */}
          <Button
            onClick={() => setIsBonusModalOpen(true)}
            size="sm"
            className="rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs gap-1.5 h-9 px-3.5 cursor-pointer justify-center"
            title="Add bonus to employee"
          >
            <Gift className="h-4 w-4" />
            <span>Add Bonus</span>
          </Button>

          {/* Add Deduction Button */}
          <Button
            onClick={() => setIsDeductionModalOpen(true)}
            size="sm"
            variant="outline"
            className="rounded-xl text-xs font-semibold border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:border-red-500/50 shadow-xs gap-1.5 h-9 px-3.5 cursor-pointer justify-center"
            title="Add deduction to employee"
          >
            <MinusCircle className="h-4 w-4" />
            <span>Add Deduction</span>
          </Button>
        </div>
      </div>

      {/* Tabs and Filters */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <TabsList className="bg-muted/60 p-1 rounded-2xl h-auto min-h-10 flex flex-wrap gap-1 w-full sm:w-auto">
            <TabsTrigger value="all" className="rounded-xl text-xs font-semibold flex-1 sm:flex-none">
              All Payments ({payrollItems.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="rounded-xl text-xs font-semibold flex-1 sm:flex-none">
              Pending ({summary.pendingFinalizationCount + summary.pendingPaymentCount})
            </TabsTrigger>
            <TabsTrigger value="processed" className="rounded-xl text-xs font-semibold flex-1 sm:flex-none">
              Processed ({summary.paymentsCompletedCount})
            </TabsTrigger>
            <TabsTrigger value="transactions" className="rounded-xl text-xs font-semibold flex-1 sm:flex-none">
              Transactions
            </TabsTrigger>
          </TabsList>

          {/* Search & Department Filters */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search staff name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs rounded-xl"
              />
            </div>

            {departments.length > 0 && activeTab !== 'transactions' && (
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="w-[140px] h-9 text-xs rounded-xl">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Depts</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Tab 1, 2, 3: Employee Payroll Table */}
        <TabsContent value="all" className="mt-4">
          <PayrollTable
            items={displayedItems}
            isLoading={isSummaryLoading}
            onOpenPreview={(userId) => setSelectedPreviewUser(userId)}
            onOpenPayment={(item) => setSelectedPaymentPayroll(item)}
            onOpenPayslip={(item) => setSelectedPayslipRecord(item)}
          />
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <PayrollTable
            items={displayedItems}
            isLoading={isSummaryLoading}
            onOpenPreview={(userId) => setSelectedPreviewUser(userId)}
            onOpenPayment={(item) => setSelectedPaymentPayroll(item)}
            onOpenPayslip={(item) => setSelectedPayslipRecord(item)}
          />
        </TabsContent>

        <TabsContent value="processed" className="mt-4">
          <PayrollTable
            items={displayedItems}
            isLoading={isSummaryLoading}
            onOpenPreview={(userId) => setSelectedPreviewUser(userId)}
            onOpenPayment={(item) => setSelectedPaymentPayroll(item)}
            onOpenPayslip={(item) => setSelectedPayslipRecord(item)}
          />
        </TabsContent>

        {/* Tab 4: Recent Transactions Table */}
        <TabsContent value="transactions" className="mt-4">
          <Card className="border border-border bg-card rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <CardTitle className="text-base font-bold text-foreground">Completed Payment Transactions</CardTitle>
              <CardDescription className="text-xs">
                Audited payment receipts processed for {formattedMonthLabel}.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead>Paid Date</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Staff ID</TableHead>
                      <TableHead>Payroll Month</TableHead>
                      <TableHead>Amount Paid</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference / UTR</TableHead>
                      <TableHead>Authorized User</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isTransactionsLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-teal-600" />
                          Loading transactions...
                        </TableCell>
                      </TableRow>
                    ) : transactionsData?.transactions?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                          No payment transactions recorded yet for this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactionsData?.transactions?.map((t) => (
                        <TableRow key={t._id || t.id}>
                          <TableCell className="font-mono text-xs">
                            {new Date(t.paidAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                            <span className="block text-[10px] text-muted-foreground">
                              {new Date(t.paidAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </TableCell>
                          <TableCell className="font-semibold text-xs text-foreground">{t.employeeName}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{t.staffId}</TableCell>
                          <TableCell className="text-xs">{t.month}</TableCell>
                          <TableCell className="font-bold text-xs text-teal-600 dark:text-teal-400">
                            ₹{t.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            {t.type === 'bonus' && (
                              <span className="block text-[10px] text-purple-600 dark:text-purple-400 font-semibold">Bonus Payout</span>
                            )}
                          </TableCell>
                          <TableCell className="capitalize text-xs">
                            <span className="px-2 py-0.5 rounded-md bg-secondary text-foreground text-[11px]">
                              {t.paymentMethod?.replace('_', ' ')}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold">{t.referenceId}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{t.processedByName || t.processedBy}</TableCell>
                          <TableCell>
                            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">
                              Completed
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ========================================== */}
      {/* DIALOG 1: COMPANY PAYROLL RULES CONFIG     */}
      {/* ========================================== */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="w-[95vw] max-w-2xl sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Settings className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              Company Payroll & Attendance Configuration
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure standard work schedules, working hours, and percentage deduction/overtime rules. These rules are company-scoped and calculate employee salaries dynamically.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveSettings} className="space-y-4 pt-2">
            <div className="p-3 bg-muted/30 rounded-xl border border-border/80 space-y-3">
              <span className="text-xs font-bold text-foreground block">
                Hourly Deduction & Overtime Rates (% of Monthly Base Salary)
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center justify-between">
                    <span>Hourly Deduction %</span>
                    <span className="text-teal-600 font-mono text-[11px]">{settingsForm.hourlyDeductionPct}%</span>
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max="500"
                    step="1"
                    required
                    value={settingsForm.hourlyDeductionPct}
                    onChange={(e) => setSettingsForm({ ...settingsForm, hourlyDeductionPct: e.target.value })}
                    className="font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">Shortfall penalty rate per hour</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center justify-between">
                    <span>Hourly Overtime %</span>
                    <span className="text-teal-600 font-mono text-[11px]">{settingsForm.hourlyOvertimePct}%</span>
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max="500"
                    step="1"
                    required
                    value={settingsForm.hourlyOvertimePct}
                    onChange={(e) => setSettingsForm({ ...settingsForm, hourlyOvertimePct: e.target.value })}
                    className="font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">Overtime bonus addition per hour</p>
                </div>
              </div>
            </div>

            <div className="p-3 bg-muted/30 rounded-xl border border-border/80 space-y-3">
              <span className="text-xs font-bold text-foreground block">
                Leave Penalty Rates (% of Configured Daily Salary Basis)
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center justify-between">
                    <span>Approved Leave %</span>
                    <span className="text-teal-600 font-mono text-[11px]">{settingsForm.approvedLeaveDeductionPct}%</span>
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    required
                    value={settingsForm.approvedLeaveDeductionPct}
                    onChange={(e) => setSettingsForm({ ...settingsForm, approvedLeaveDeductionPct: e.target.value })}
                    className="font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">Deduction for approved leave</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center justify-between">
                    <span>Unapproved Leave %</span>
                    <span className="text-red-500 font-mono text-[11px]">{settingsForm.unapprovedLeaveDeductionPct}%</span>
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max="200"
                    step="1"
                    required
                    value={settingsForm.unapprovedLeaveDeductionPct}
                    onChange={(e) => setSettingsForm({ ...settingsForm, unapprovedLeaveDeductionPct: e.target.value })}
                    className="font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">Deduction for unapproved absence</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs font-semibold">Payroll Divisor Mode</Label>
                <Select
                  value={settingsForm.payrollDivisorType}
                  onValueChange={(val) => setSettingsForm({ ...settingsForm, payrollDivisorType: val })}
                >
                  <SelectTrigger className="text-xs w-full truncate">
                    <SelectValue className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled_hours">Scheduled Working Hours (Monthly)</SelectItem>
                    <SelectItem value="fixed_hours">Fixed Divisor (e.g. 200h)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground truncate">Formula: Base Salary × Rate % / Divisor</p>
              </div>

              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs font-semibold">Daily Salary Basis Mode</Label>
                <Select
                  value={settingsForm.dailyBasisType}
                  onValueChange={(val) => setSettingsForm({ ...settingsForm, dailyBasisType: val })}
                >
                  <SelectTrigger className="text-xs w-full truncate">
                    <SelectValue className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled_days">Scheduled Working Days (Excluding Offs/Holidays)</SelectItem>
                    <SelectItem value="calendar_days">Total Calendar Days in Month</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground truncate">Used for daily leave deductions</p>
              </div>
            </div>

            <DialogFooter className="pt-3 border-t">
              <Button type="button" variant="outline" onClick={() => setIsSettingsOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateSettingsMutation.isPending}
                className="bg-[#0D9488] hover:bg-[#0F766E] text-white font-semibold"
              >
                {updateSettingsMutation.isPending ? 'Saving...' : 'Save Configuration'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* DIALOG 2: EMPLOYEE PAYROLL BREAKDOWN MODAL */}
      {/* ========================================== */}
      <Dialog open={!!selectedPreviewUser} onOpenChange={(open) => !open && setSelectedPreviewUser(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                Payroll Calculation Breakdown — {previewData?.name || selectedPreviewUser}
              </span>
              <Badge className={previewData?.isPaid ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' : previewData?.isFinalized ? 'bg-teal-500/15 text-teal-600 border-teal-500/30' : 'bg-amber-500/15 text-amber-600 border-amber-500/30'}>
                {previewData?.isPaid ? 'Paid' : previewData?.isFinalized ? 'Finalized Snapshot' : 'Live Draft Preview'}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Review rate derivations, working hours, day-by-day attendance, and final net calculation for {formattedMonthLabel}.
            </DialogDescription>
          </DialogHeader>

          {isPreviewLoading ? (
            <div className="py-16 text-center text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-teal-600" />
              Calculating live payroll breakdown...
            </div>
          ) : !previewData ? (
            <div className="py-8 text-center text-muted-foreground">No data available</div>
          ) : (
            <div className="space-y-5 py-2">
              {/* Formula & Rates Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-muted/30 rounded-2xl border border-border">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Base Salary</span>
                  <div className="text-base font-bold text-foreground mt-0.5">₹{(previewData?.baseSalary || 0).toLocaleString()}</div>
                  <span className="text-[10px] text-muted-foreground">{previewData?.scheduledWorkingDays || 0} scheduled days</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Hourly Deduction Rate</span>
                  <div className="text-base font-bold text-red-500 mt-0.5">₹{previewData?.hourlyDeductionRate || 0}/hr</div>
                  <span className="text-[10px] text-muted-foreground">Divisor: {previewData?.payrollDivisor || 0}h</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Hourly Overtime Rate</span>
                  <div className="text-base font-bold text-emerald-500 mt-0.5">₹{previewData?.hourlyOvertimeRate || 0}/hr</div>
                  <span className="text-[10px] text-muted-foreground">OT rate basis</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Daily Salary Basis</span>
                  <div className="text-base font-bold text-foreground mt-0.5">₹{previewData?.dailySalaryBasis || 0}/day</div>
                  <span className="text-[10px] text-muted-foreground">Leave deduction basis</span>
                </div>
              </div>

              {/* Monthly Breakdown Math */}
              <div className="p-4 bg-card rounded-2xl border border-border space-y-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                  Net Salary Calculation Summary
                </span>
                <div className="flex justify-between items-center text-sm py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Base Monthly Salary:</span>
                  <span className="font-semibold">₹{(previewData?.baseSalary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center text-sm py-1 border-b border-border/40">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    + Overtime Additions ({previewData?.overtimeHours || 0} hrs @ ₹{previewData?.hourlyOvertimeRate || 0}/hr):
                  </span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    +₹{(previewData?.hourlyOvertimeAddition || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm py-1 border-b border-border/40">
                  <span className="text-red-500">
                    − Hourly Shortfall Deductions ({previewData?.shortfallHours || 0} hrs @ ₹{previewData?.hourlyDeductionRate || 0}/hr):
                  </span>
                  <span className="font-semibold text-red-500">
                    −₹{(previewData?.hourlyShortfallDeduction || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm py-1 border-b border-border/40">
                  <span className="text-red-500">
                    − Approved Leave Deductions ({previewData?.approvedLeaveDays || 0} days):
                  </span>
                  <span className="font-semibold text-red-500">
                    −₹{(previewData?.approvedLeaveDeduction || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm py-1 border-b border-border/40">
                  <span className="text-red-500">
                    − Unapproved Absence Deductions ({previewData?.unapprovedLeaveDays || 0} days):
                  </span>
                  <span className="font-semibold text-red-500">
                    −₹{(previewData?.unapprovedLeaveDeduction || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {(previewData?.bonus > 0 || previewData?.manualDeduction > 0) && (
                  <>
                    {previewData.bonus > 0 && (
                      <div className="flex justify-between items-center text-sm py-1 border-b border-border/40">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          + Added Bonus Reward:
                        </span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          +₹{(previewData.bonus || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    {previewData.manualDeduction > 0 && (
                      <div className="flex justify-between items-center text-sm py-1 border-b border-border/40">
                        <span className="text-red-500">
                          − Other / Manual Deductions:
                        </span>
                        <span className="font-semibold text-red-500">
                          −₹{(previewData.manualDeduction || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between items-center text-base pt-2 font-bold text-foreground">
                  <span>Total Amount:</span>
                  <span className="text-lg text-teal-600 dark:text-teal-400">
                    ₹{((previewData?.totalAmount !== undefined ? previewData.totalAmount : previewData?.netPayable) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {previewData?.excessDeduction > 0 && (
                  <p className="text-xs text-amber-500 font-medium pt-1">
                    Notice: Deductions exceeded earnings by ₹{(previewData.excessDeduction || 0).toLocaleString()}. Net payout clamped to ₹0.00.
                  </p>
                )}
              </div>

              {/* Day by Day Log Table */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-foreground">Daily Attendance & Work Breakdown</span>
                <div className="max-h-60 overflow-y-auto border border-border rounded-xl">
                  <Table>
                    <TableHeader className="bg-muted/50 sticky top-0">
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Day</TableHead>
                        <TableHead className="text-xs">In</TableHead>
                        <TableHead className="text-xs">Out</TableHead>
                        <TableHead className="text-xs">Req/Act</TableHead>
                        <TableHead className="text-xs">SF/OT</TableHead>
                        <TableHead className="text-xs">Impact (₹)</TableHead>
                        <TableHead className="text-xs">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.dailyBreakdown?.map((day) => (
                        <TableRow key={day.date} className={day.isWeeklyOff || day.isHoliday ? 'bg-muted/10' : ''}>
                          <TableCell className="font-mono text-xs font-medium">{day.date}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{day.dayName}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {day.checkIn ? new Date(day.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {day.checkOut ? new Date(day.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                          </TableCell>
                          <TableCell className="text-xs font-mono">{day.requiredHours}h / {day.actualHours}h</TableCell>
                          <TableCell className="text-xs font-mono">
                            {day.overtimeHours > 0 ? (
                              <span className="text-emerald-500 font-semibold">+{day.overtimeHours}h OT</span>
                            ) : day.shortfallHours > 0 ? (
                              <span className="text-red-500 font-semibold">-{day.shortfallHours}h SF</span>
                            ) : '--'}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {day.overtimeAddition > 0 ? (
                              <span className="text-emerald-600 font-semibold">+₹{day.overtimeAddition}</span>
                            ) : day.shortfallDeduction > 0 ? (
                              <span className="text-red-600 font-semibold">-₹{day.shortfallDeduction}</span>
                            ) : day.leaveDeduction > 0 ? (
                              <span className="text-red-600 font-semibold">-₹{day.leaveDeduction}</span>
                            ) : '₹0'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[140px]">
                            {day.isHoliday ? (
                              <span className="text-purple-600 font-semibold">Holiday ({day.holidayName})</span>
                            ) : day.isWeeklyOff ? (
                              'Weekly Off'
                            ) : day.isApprovedLeave ? (
                              <span className="text-blue-600 font-semibold">Approved Leave</span>
                            ) : day.isUnapprovedLeave ? (
                              <span className="text-red-600 font-semibold">Unapproved Absence</span>
                            ) : (
                              day.notes || 'Normal'
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <DialogFooter className="pt-3 border-t flex flex-col-reverse sm:flex-row sm:justify-between items-stretch sm:items-center gap-2">
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setSelectedPreviewUser(null)}>
                  Close
                </Button>

                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  {!previewData.isFinalized && (
                    <Button
                      onClick={() => handleFinalizePayroll(previewData.userId)}
                      disabled={finalizeMutation.isPending}
                      className="bg-[#0D9488] hover:bg-[#0F766E] text-white font-semibold w-full sm:w-auto justify-center"
                    >
                      <ShieldCheck className="mr-1.5 h-4 w-4" />
                      {finalizeMutation.isPending ? 'Finalizing...' : 'Finalize Payroll Snapshot'}
                    </Button>
                  )}

                  {previewData.isFinalized && !previewData.isPaid && (
                    <Button
                      onClick={() => {
                        setSelectedPaymentPayroll(previewData);
                        setSelectedPreviewUser(null);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    >
                      <CreditCard className="mr-1.5 h-4 w-4" />
                      Process Payment (₹{(previewData.totalAmount !== undefined ? previewData.totalAmount : previewData.netPayable).toLocaleString()})
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* DIALOG 3: PROCESS PAYMENT MODAL            */}
      {/* ========================================== */}
      <Dialog open={!!selectedPaymentPayroll} onOpenChange={(open) => !open && setSelectedPaymentPayroll(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              {selectedPaymentPayroll?.amountPaid > 0 ? (
                <>
                  <Gift className="h-5 w-5 text-purple-600" />
                  Disburse Bonus Payout
                </>
              ) : (
                <>
                  <CreditCard className="h-5 w-5 text-emerald-600" />
                  Process Employee Payment
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedPaymentPayroll?.amountPaid > 0
                ? `Disburse standalone bonus payout for ${selectedPaymentPayroll?.name} for ${formattedMonthLabel}. Base salary has already been paid.`
                : `Confirm payment details for ${selectedPaymentPayroll?.name} for ${formattedMonthLabel}.`}
            </DialogDescription>
          </DialogHeader>

          {selectedPaymentPayroll && (() => {
            const isBonusPayout = selectedPaymentPayroll.amountPaid > 0;
            const amountToPayNow = (selectedPaymentPayroll.pendingAmount !== undefined && selectedPaymentPayroll.pendingAmount > 0)
              ? selectedPaymentPayroll.pendingAmount
              : (selectedPaymentPayroll.totalAmount !== undefined ? selectedPaymentPayroll.totalAmount : selectedPaymentPayroll.netPayable);

            return (
              <form onSubmit={handleProcessPayment} className="space-y-4 pt-2">
                <div className={`p-4 rounded-xl border flex justify-between items-center ${isBonusPayout ? 'bg-purple-500/10 border-purple-500/30' : 'bg-muted/40 border-border'}`}>
                  <div>
                    <span className="text-xs text-muted-foreground block font-medium">
                      {isBonusPayout ? 'Pending Bonus Payout Amount' : 'Total Amount to Disburse'}
                    </span>
                    <div className={`text-2xl font-bold mt-0.5 ${isBonusPayout ? 'text-purple-600 dark:text-purple-400' : 'text-teal-600 dark:text-teal-400'}`}>
                      ₹{amountToPayNow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    {isBonusPayout && (
                      <span className="text-[11px] text-muted-foreground block mt-0.5">
                        Base salary of ₹{selectedPaymentPayroll.amountPaid.toLocaleString()} was already paid.
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">Employee ID</span>
                    <div className="font-mono text-sm font-semibold">{selectedPaymentPayroll.StaffId || selectedPaymentPayroll.userId}</div>
                    {isBonusPayout && (
                      <Badge className="mt-1 bg-purple-500/15 text-purple-600 border-purple-500/30 text-[10px]">
                        Bonus Payout
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Payment Method *</Label>
                  <Select
                    value={paymentForm.paymentMethod}
                    onValueChange={(val) => setPaymentForm({ ...paymentForm, paymentMethod: val })}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer (NEFT / IMPS / RTGS)</SelectItem>
                      <SelectItem value="upi">UPI / Instant Transfer</SelectItem>
                      <SelectItem value="cash">Cash Disbursement</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="other">Other Method</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Transaction / Reference ID *</Label>
                  <Input
                    required
                    placeholder="e.g. UTR123456789 or Cheque #0045"
                    value={paymentForm.referenceId}
                    onChange={(e) => setPaymentForm({ ...paymentForm, referenceId: e.target.value })}
                    className="font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">Required for audit tracking and idempotency</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Payment Notes (Optional)</Label>
                  <Input
                    placeholder={isBonusPayout ? "e.g. Festival bonus disbursement" : "e.g. Salary paid via corporate account"}
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                    className="text-xs"
                  />
                </div>

                <DialogFooter className="pt-2 border-t">
                  <Button type="button" variant="outline" onClick={() => setSelectedPaymentPayroll(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={processPaymentMutation.isPending}
                    className={`font-semibold text-white ${isBonusPayout ? 'bg-purple-600 hover:bg-purple-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                  >
                    {processPaymentMutation.isPending ? 'Recording...' : isBonusPayout ? `Confirm & Pay Bonus (₹${amountToPayNow.toLocaleString()})` : 'Confirm & Record Payment'}
                  </Button>
                </DialogFooter>
              </form>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* DIALOG 4: SALARY SLIP / RECEIPT MODAL      */}
      {/* ========================================== */}
      <Dialog open={!!selectedPayslipRecord} onOpenChange={(open) => !open && setSelectedPayslipRecord(null)}>
        <DialogContent className="sm:max-w-2xl rounded-2xl print:m-0 print:p-0">
          <DialogHeader className="print:hidden">
            <DialogTitle className="text-lg font-bold flex items-center justify-between">
              <span>Employee Payslip</span>
              <Button size="sm" variant="outline" onClick={() => window.print()} className="rounded-xl text-xs font-semibold">
                <Printer className="h-3.5 w-3.5 mr-1.5" />
                Print / Save PDF
              </Button>
            </DialogTitle>
          </DialogHeader>

          {selectedPayslipRecord && (
            <div className="border border-border/80 rounded-2xl p-6 bg-card space-y-5 print:border-none print:shadow-none">
              <div className="flex justify-between items-start border-b border-border pb-4">
                <div>
                  <h3 className="text-xl font-bold text-foreground">Regenai HR & Payroll</h3>
                  <p className="text-xs text-muted-foreground">Monthly Salary Disbursement Slip</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-teal-600 uppercase">{selectedMonth}</span>
                  <p className="text-[11px] text-muted-foreground">Generated: {new Date().toLocaleDateString()}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Employee Name:</span>
                  <p className="font-bold text-sm text-foreground">{selectedPayslipRecord.name}</p>
                  <span className="text-muted-foreground">Designation:</span>
                  <p className="font-semibold">{selectedPayslipRecord.designation || 'Staff'}</p>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground">Staff ID:</span>
                  <p className="font-bold text-sm font-mono">{selectedPayslipRecord.StaffId || selectedPayslipRecord.userId}</p>
                  <span className="text-muted-foreground">Department:</span>
                  <p className="font-semibold">{selectedPayslipRecord.department || 'General'}</p>
                </div>
              </div>

              {/* Earnings & Deductions Table */}
              <div className="border border-border rounded-xl overflow-hidden text-xs">
                <div className="grid grid-cols-2 bg-muted/60 font-bold p-2.5 border-b border-border">
                  <span>Earnings (INR)</span>
                  <span className="text-right">Deductions (INR)</span>
                </div>
                <div className="grid grid-cols-2 p-3 gap-y-2">
                  <div>
                    <span className="text-muted-foreground">Base Salary:</span>
                    <strong className="block">₹{selectedPayslipRecord.baseSalary?.toLocaleString()}</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground">Hourly Shortfall:</span>
                    <strong className="block text-red-500">₹{selectedPayslipRecord.hourlyShortfallDeduction?.toLocaleString()}</strong>
                  </div>

                  <div>
                    <span className="text-muted-foreground">Overtime Additions:</span>
                    <strong className="block text-emerald-600">+₹{selectedPayslipRecord.hourlyOvertimeAddition?.toLocaleString()}</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground">Approved Leaves ({selectedPayslipRecord.approvedLeaveDays}d):</span>
                    <strong className="block text-red-500">₹{selectedPayslipRecord.approvedLeaveDeduction?.toLocaleString()}</strong>
                  </div>

                  <div>
                    <span className="text-muted-foreground">Bonus Reward:</span>
                    <strong className="block text-emerald-600">+₹{(selectedPayslipRecord.bonus || 0).toLocaleString()}</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground">Other Deductions:</span>
                    <strong className="block text-red-500">-₹{(selectedPayslipRecord.manualDeduction || 0).toLocaleString()}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-2 bg-muted/30 font-bold p-3 border-t border-border">
                  <div>
                    <span>Total Earnings: ₹{(selectedPayslipRecord.baseSalary + selectedPayslipRecord.hourlyOvertimeAddition + (selectedPayslipRecord.bonus || 0)).toLocaleString()}</span>
                  </div>
                  <div className="text-right">
                    <span>Total Deductions: ₹{(selectedPayslipRecord.totalDeductions + (selectedPayslipRecord.manualDeduction || 0)).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Net Payout Banner */}
              <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/20 flex justify-between items-center">
                <div>
                  <span className="text-xs uppercase font-bold text-teal-800 dark:text-teal-300">Total Salary Paid</span>
                  <div className="text-2xl font-bold text-teal-700 dark:text-teal-300">
                    ₹{(selectedPayslipRecord.totalAmount !== undefined ? selectedPayslipRecord.totalAmount : selectedPayslipRecord.netPayable)?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                    Payment Completed
                  </Badge>
                </div>
              </div>

              <p className="text-[10px] text-center text-muted-foreground pt-2">
                This is a computer-generated payslip verified by Regenai Payroll & Attendance Management.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* DIALOG 5: ADD EMPLOYEE BONUS MODAL         */}
      {/* ========================================== */}
      <Dialog open={isBonusModalOpen} onOpenChange={setIsBonusModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Gift className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Add Employee Bonus
            </DialogTitle>
            <DialogDescription className="text-xs">
              Select an employee by name and ID, enter the bonus amount, and it will be added to their salary. Even if the employee's salary has already been paid, this bonus can be added alone and paid later.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddBonus} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Select Employee *</Label>
              <Select
                value={bonusForm.userId}
                onValueChange={(val) => setBonusForm({ ...bonusForm, userId: val })}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Select employee name & ID..." />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {payrollItems.map((emp) => (
                    <SelectItem key={emp.userId} value={emp.userId}>
                      {emp.name} ({emp.StaffId || emp.userId}) — {emp.department || 'General'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(() => {
              const selectedEmp = payrollItems.find(p => p.userId === bonusForm.userId);
              if (!selectedEmp) return null;
              return (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-foreground block">{selectedEmp.name}</span>
                    <span className="font-mono text-muted-foreground">ID: {selectedEmp.StaffId || selectedEmp.userId} • Dept: {selectedEmp.department || 'General'}</span>
                    {selectedEmp.amountPaid > 0 && (
                      <span className="text-[11px] text-purple-700 dark:text-purple-300 font-semibold block mt-1">
                        ✓ Base salary already paid (₹{selectedEmp.amountPaid.toLocaleString()}). This bonus will be added alone and can be disbursed later.
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground block">Current Total</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                      ₹{(selectedEmp.totalAmount !== undefined ? selectedEmp.totalAmount : selectedEmp.netPayable).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Bonus Amount (₹) *</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-semibold">₹</span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="e.g. 5000"
                  className="pl-7 font-mono text-xs"
                  value={bonusForm.amount}
                  onChange={(e) => setBonusForm({ ...bonusForm, amount: e.target.value })}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">This bonus will be credited to the employee for {formattedMonthLabel} and can be paid separately if salary is already disbursed.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Reason / Description (Optional)</Label>
              <Input
                type="text"
                placeholder="e.g. Festival bonus, outstanding performance, sales incentive"
                className="text-xs"
                value={bonusForm.reason}
                onChange={(e) => setBonusForm({ ...bonusForm, reason: e.target.value })}
              />
            </div>

            <DialogFooter className="pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setIsBonusModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={addAdjustmentMutation.isPending || !bonusForm.userId || !bonusForm.amount}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                <Gift className="mr-1.5 h-4 w-4" />
                {addAdjustmentMutation.isPending ? 'Adding Bonus...' : 'Add Bonus to Employee'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* DIALOG 6: ADD EMPLOYEE DEDUCTION MODAL     */}
      {/* ========================================== */}
      <Dialog open={isDeductionModalOpen} onOpenChange={setIsDeductionModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <MinusCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              Add Employee Deduction
            </DialogTitle>
            <DialogDescription className="text-xs">
              Select an employee by name and ID, enter the deduction amount, and the amount will be immediately deducted from their monthly payroll for {formattedMonthLabel}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddDeduction} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Select Employee *</Label>
              <Select
                value={deductionForm.userId}
                onValueChange={(val) => setDeductionForm({ ...deductionForm, userId: val })}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Select employee name & ID..." />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {payrollItems.map((emp) => (
                    <SelectItem key={emp.userId} value={emp.userId}>
                      {emp.name} ({emp.StaffId || emp.userId}) — {emp.department || 'General'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(() => {
              const selectedEmp = payrollItems.find(p => p.userId === deductionForm.userId);
              if (!selectedEmp) return null;
              return (
                <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-foreground block">{selectedEmp.name}</span>
                    <span className="font-mono text-muted-foreground">ID: {selectedEmp.StaffId || selectedEmp.userId} • Dept: {selectedEmp.department || 'General'}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground block">Current Total</span>
                    <span className="font-bold text-red-600 dark:text-red-400 text-sm">
                      ₹{(selectedEmp.totalAmount !== undefined ? selectedEmp.totalAmount : selectedEmp.netPayable).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Deduction Amount (₹) *</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-semibold">₹</span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="e.g. 1500"
                  className="pl-7 font-mono text-xs"
                  value={deductionForm.amount}
                  onChange={(e) => setDeductionForm({ ...deductionForm, amount: e.target.value })}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">This amount will be deducted from the employee's total payout for {formattedMonthLabel}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Reason / Description (Optional)</Label>
              <Input
                type="text"
                placeholder="e.g. Salary advance recovery, equipment damage, disciplinary"
                className="text-xs"
                value={deductionForm.reason}
                onChange={(e) => setDeductionForm({ ...deductionForm, reason: e.target.value })}
              />
            </div>

            <DialogFooter className="pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setIsDeductionModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={addAdjustmentMutation.isPending || !deductionForm.userId || !deductionForm.amount}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold"
              >
                <MinusCircle className="mr-1.5 h-4 w-4" />
                {addAdjustmentMutation.isPending ? 'Deducting...' : 'Deduct Amount from Employee'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Subcomponent: Main Employee Payroll Table
 */
function PayrollTable({ items = [], isLoading, onOpenPreview, onOpenPayment, onOpenPayslip }) {
  const {
    displayedItems = [],
    hasMore,
    handleScroll,
    totalCount,
    loadMore
  } = useScrollPagination(items, 6);

  if (isLoading) {
    return (
      <Card className="border border-border bg-card rounded-2xl p-12 text-center text-muted-foreground">
        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-teal-600" />
        Loading employee payroll data...
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="border border-border bg-card rounded-2xl p-12 text-center text-muted-foreground">
        <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
        <p className="font-semibold text-sm text-foreground">No employees found</p>
        <p className="text-xs text-muted-foreground mt-0.5">Try adjusting your search or filters.</p>
      </Card>
    );
  }

  return (
    <Card className="border border-border bg-card rounded-2xl shadow-xs overflow-hidden">
      <div 
        className="overflow-x-auto max-h-[520px] overflow-y-auto"
        onScroll={handleScroll}
      >
        <Table>
          <TableHeader className="bg-muted/90 sticky top-0 z-10 backdrop-blur-sm shadow-xs">
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Sched / Act Hours</TableHead>
              <TableHead>Shortfall / OT</TableHead>
              <TableHead>Leave Days</TableHead>
              <TableHead>Deductions (₹)</TableHead>
              <TableHead>Additions (₹)</TableHead>
              <TableHead>Total Amount (₹)</TableHead>
              <TableHead>Payroll Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedItems.map((emp) => {
              const isPaid = emp.isPaid;
              const isFinalized = emp.isFinalized;

              return (
                <TableRow key={emp.userId} className="hover:bg-muted/15 transition-colors">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs text-foreground">{emp.name}</span>
                      <span className="text-[11px] font-mono text-muted-foreground">{emp.StaffId || emp.userId}</span>
                      <span className="text-[10px] text-muted-foreground/80">{emp.department || 'General'}</span>
                    </div>
                  </TableCell>

                  <TableCell className="font-mono text-xs">
                    <span>{emp.scheduledWorkingHours}h</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span className={emp.actualWorkingHours < emp.scheduledWorkingHours ? 'text-amber-600 font-semibold' : 'text-foreground'}>
                      {emp.actualWorkingHours}h
                    </span>
                  </TableCell>

                  <TableCell className="font-mono text-xs">
                    {emp.shortfallHours > 0 && (
                      <span className="text-red-500 font-medium block">-{emp.shortfallHours}h SF</span>
                    )}
                    {emp.overtimeHours > 0 && (
                      <span className="text-emerald-600 font-medium block">+{emp.overtimeHours}h OT</span>
                    )}
                    {emp.shortfallHours === 0 && emp.overtimeHours === 0 && (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>

                  <TableCell className="text-xs">
                    <span title="Approved Leaves" className="text-blue-600 font-medium">{emp.approvedLeaveDays} app</span>
                    <span className="text-muted-foreground mx-1">•</span>
                    <span title="Unapproved Absences" className={emp.unapprovedLeaveDays > 0 ? 'text-red-500 font-medium' : 'text-muted-foreground'}>
                      {emp.unapprovedLeaveDays} unapp
                    </span>
                  </TableCell>

                  <TableCell className="font-mono text-xs font-semibold text-red-600 dark:text-red-400">
                    <div className="flex flex-col">
                      <span>{emp.totalDeductions > 0 ? `-₹${emp.totalDeductions.toLocaleString()}` : '₹0'}</span>
                      {emp.manualDeduction > 0 && (
                        <span className="text-[10px] text-red-500 font-normal">(-₹{emp.manualDeduction.toLocaleString()} manual)</span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <div className="flex flex-col">
                      <span>{(emp.totalAdditions || (emp.hourlyOvertimeAddition + (emp.bonus || 0))) > 0 ? `+₹${(emp.totalAdditions || (emp.hourlyOvertimeAddition + (emp.bonus || 0))).toLocaleString()}` : '₹0'}</span>
                      {emp.bonus > 0 && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">(+₹{emp.bonus.toLocaleString()} bonus)</span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="font-mono text-xs">
                    <div className="flex flex-col">
                      <span className="font-bold text-teal-600 dark:text-teal-400">
                        ₹{(emp.totalAmount !== undefined ? emp.totalAmount : emp.netPayable)?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                      {emp.isPaid ? (
                        <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                          <CheckCircle2 className="h-3 w-3 inline" /> Fully Paid (₹{(emp.amountPaid || emp.totalAmount).toLocaleString()})
                        </span>
                      ) : (emp.isPartiallyPaid || (emp.amountPaid > 0 && emp.pendingAmount > 0)) ? (
                        <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold flex items-center gap-0.5">
                          <Gift className="h-3 w-3 inline text-purple-600" /> Paid: ₹{(emp.amountPaid || 0).toLocaleString()} • Due: ₹{(emp.pendingAmount || 0).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          Pending payout
                        </span>
                      )}
                      {(emp.bonus > 0 || emp.manualDeduction > 0) && (
                        <div className="flex items-center gap-1 mt-0.5">
                          {emp.bonus > 0 && (
                            <span className="text-[9px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-1 py-0.2 rounded font-semibold">
                              +₹{emp.bonus.toLocaleString()} bonus
                            </span>
                          )}
                          {emp.manualDeduction > 0 && (
                            <span className="text-[9px] bg-red-500/15 text-red-600 dark:text-red-400 px-1 py-0.2 rounded font-semibold">
                              -₹{emp.manualDeduction.toLocaleString()} ded
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge variant="outline" className={isFinalized ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30 text-[10px]' : 'bg-muted text-muted-foreground text-[10px]'}>
                      {isFinalized ? 'Finalized' : 'Draft'}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <Badge className={
                      emp.isPaid
                        ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]'
                        : (emp.isPartiallyPaid || (emp.amountPaid > 0 && emp.pendingAmount > 0))
                        ? 'bg-purple-500/15 text-purple-600 border-purple-500/30 text-[10px] font-bold'
                        : 'bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px]'
                    }>
                      {emp.isPaid
                        ? 'Paid'
                        : (emp.isPartiallyPaid || (emp.amountPaid > 0 && emp.pendingAmount > 0))
                        ? `Bonus Pending (₹${(emp.pendingAmount || 0).toLocaleString()})`
                        : 'Unpaid'
                      }
                    </Badge>
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Payroll Review / Calculation Button */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenPreview(emp.userId)}
                        className="rounded-xl h-8 px-2.5 text-xs font-semibold border-border hover:border-teal-500/50"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1 text-teal-600" />
                        Payroll
                      </Button>

                      {/* Process Payment Button if finalized & (unpaid OR bonus pending) */}
                      {isFinalized && (!emp.isPaid || (emp.pendingAmount > 0)) && (
                        <Button
                          size="sm"
                          onClick={() => onOpenPayment(emp)}
                          className={`rounded-xl h-8 px-2.5 text-xs font-semibold text-white ${
                            emp.amountPaid > 0
                              ? 'bg-purple-600 hover:bg-purple-700 shadow-xs'
                              : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                        >
                          {emp.amountPaid > 0 ? (
                            <>
                              <Gift className="h-3.5 w-3.5 mr-1" />
                              Pay Bonus (₹{(emp.pendingAmount || 0).toLocaleString()})
                            </>
                          ) : (
                            <>
                              <CreditCard className="h-3.5 w-3.5 mr-1" />
                              Pay
                            </>
                          )}
                        </Button>
                      )}

                      {/* View Payslip if paid or partially paid */}
                      {(emp.isPaid || emp.amountPaid > 0) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onOpenPayslip(emp)}
                          className="rounded-xl h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                          title="View Payslip / Receipt"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {hasMore && (
          <div className="py-2.5 text-center text-xs text-muted-foreground bg-muted/20 border-t border-border animate-pulse">
            Showing {displayedItems.length} of {totalCount} — scroll down for next 6
          </div>
        )}
      </div>

      {/* Summary Footer */}
      <div className="p-3 border-t flex items-center justify-between text-xs text-muted-foreground">
        <p>
          Showing {displayedItems.length} of {totalCount} employees (6 per batch)
        </p>
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            onClick={loadMore}
            className="h-7 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10"
          >
            Load next 6
          </Button>
        )}
      </div>
    </Card>
  );
}
