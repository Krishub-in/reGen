import { useState, useMemo } from 'react';
import {
  useGetAllPayments,
  useGetUserPayments,
  useRecordPayment,
  useUpdatePayment,
  useDeletePayment,
  useGetAllUsers,
} from '../../hooks/useQueries';
import { useCustomAuth } from '../../hooks/useCustomAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Download, TrendingUp, Users, DollarSign, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Principal } from '@dfinity/principal';
import { hasUserRole } from '@/lib/utils';
import PageHeader from '../PageHeader';

export default function PaymentsModule({ userProfile }) {
  const { identity } = useCustomAuth();
  const isAdmin = hasUserRole(userProfile, 'admin') || hasUserRole(userProfile, 'owner') || hasUserRole(userProfile, 'param');
  
  const { data: allPayments = [] } = useGetAllPayments();
  const { data: userPayments = [] } = useGetUserPayments(identity?.getPrincipal() || null);
  const { data: users = [] } = useGetAllUsers();
  
  const recordPayment = useRecordPayment();
  const updatePayment = useUpdatePayment();
  const deletePayment = useDeletePayment();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [formData, setFormData] = useState({
    userId: '',
    amount: '',
    recordType: 'salary',
    date: new Date().toISOString().split('T')[0],
  });

  const payments = isAdmin ? allPayments : userPayments;

  // Stats for Trends
  const stats = useMemo(() => {
    const totalPayroll = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const uniqueEmployees = new Set(payments.map(p => p.userId.toString())).size;
    const avgSalary = uniqueEmployees > 0 ? totalPayroll / uniqueEmployees : 0;
    
    // Calculate pending (dummy logic as we don't have status, assuming all recorded are paid/processed)
    // Or we could use current month's expected vs actual.
    // For now, let's just show "Last Month" comparison (dummy)
    
    return {
        totalPayroll,
        employeeCount: uniqueEmployees,
        avgSalary
    };
  }, [payments]);

  const getUserName = (principalId) => {
    const user = users.find(u => u.id.toText() === principalId);
    return user ? `${user.firstName} ${user.lastName}` : principalId;
  };

  const handleOpenDialog = (payment) => {
    if (payment) {
      setEditingPayment(payment);
      setFormData({
        userId: payment.userId.toText(),
        amount: payment.amount.toString(),
        recordType: payment.recordType,
        date: payment.date,
      });
    } else {
      setEditingPayment(null);
      setFormData({
        userId: '',
        amount: '',
        recordType: 'salary',
        date: new Date().toISOString().split('T')[0],
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const payment = {
        id: editingPayment ? editingPayment.id : `payment-${Date.now()}`,
        userId: Principal.fromText(formData.userId),
        amount: BigInt(formData.amount),
        recordType: formData.recordType,
        date: formData.date,
      };

      if (editingPayment) {
        await updatePayment.mutateAsync(payment);
        toast.success('Payment updated successfully');
      } else {
        await recordPayment.mutateAsync(payment);
        toast.success('Payment recorded successfully');
      }

      setIsDialogOpen(false);
    } catch (error) {
      toast.error('Failed to save payment');
      console.error(error);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this payment record?')) {
      try {
        await deletePayment.mutateAsync(id);
        toast.success('Payment deleted successfully');
      } catch (error) {
        toast.error('Failed to delete payment');
        console.error(error);
      }
    }
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Employee', 'User ID', 'Amount', 'Type'];
    const rows = payments.map(payment => [
      payment.date,
      getUserName(payment.userId.toText()),
      payment.userId.toText(),
      payment.amount.toString(),
      payment.recordType,
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Wallet}
        title="Payments & Payroll"
        subtitle="Manage employee salaries, bonuses, and payment records."
        actions={
          <>
            <Button onClick={exportToCSV} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export Report
            </Button>
            {isAdmin && (
              <Button onClick={() => handleOpenDialog()} className="bg-[#15966A] hover:bg-[#0E7F58] text-white shadow-sm font-medium">
                <Wallet className="mr-2 h-4 w-4" />
                Run Payroll
              </Button>
            )}
          </>
        }
      />

      {/* Trends Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-5">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Payroll</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-semibold tracking-normal text-foreground mt-1">${stats.totalPayroll.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1 font-normal">Total distributed to date</p>
          </div>
        </Card>
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-5">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg. Salary</span>
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-semibold tracking-normal text-foreground mt-1">${stats.avgSalary.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <p className="text-xs text-muted-foreground mt-1 font-normal">Per employee average</p>
          </div>
        </Card>
        <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs p-5">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Employees</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-semibold tracking-normal text-foreground mt-1">{stats.employeeCount}</div>
            <p className="text-xs text-muted-foreground mt-1 font-normal">Recipients of payments</p>
          </div>
        </Card>
      </div>

      {/* Quick Actions (Admin Only) */}
      {isAdmin && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          <Button variant="outline" className="rounded-xl whitespace-nowrap h-9 text-xs font-semibold border-border hover:border-primary/40" onClick={() => {
            setFormData(prev => ({ ...prev, recordType: 'bonus' }));
            handleOpenDialog();
          }}>
            <Plus className="mr-1.5 h-3.5 w-3.5 text-primary" /> Add Bonus
          </Button>
          <Button variant="outline" className="rounded-xl whitespace-nowrap h-9 text-xs font-semibold border-border hover:border-primary/40" onClick={() => {
            setFormData(prev => ({ ...prev, recordType: 'deduction' }));
            handleOpenDialog();
          }}>
            <Plus className="mr-1.5 h-3.5 w-3.5 text-primary" /> Add Deduction
          </Button>
          <Button variant="outline" className="rounded-xl whitespace-nowrap h-9 text-xs font-semibold border-border hover:border-primary/40" onClick={() => {
            setFormData(prev => ({ ...prev, recordType: 'salary' }));
            handleOpenDialog();
          }}>
            <Plus className="mr-1.5 h-3.5 w-3.5 text-primary" /> Record Salary
          </Button>
        </div>
      )}

      {/* Payments Table */}
      <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="border-b border-border bg-card px-6 py-4">
          <CardTitle className="text-base font-bold text-foreground">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
                </TableHeader>
                <TableBody>
                {payments.length === 0 ? (
                    <TableRow>
                    <TableCell colSpan={isAdmin ? 5 : 4} className="text-center h-24 text-muted-foreground">
                        No payment records found.
                    </TableCell>
                    </TableRow>
                ) : (
                    payments.map((payment) => (
                    <TableRow key={payment.id}>
                        <TableCell>{payment.date}</TableCell>
                        <TableCell>
                            <div className="flex flex-col">
                                <span className="font-medium">{getUserName(payment.userId.toText())}</span>
                                <span className="text-xs text-muted-foreground truncate max-w-[150px]">{payment.userId.toText()}</span>
                            </div>
                        </TableCell>
                        <TableCell className="capitalize">{payment.recordType}</TableCell>
                        <TableCell>${payment.amount.toString()}</TableCell>
                        {isAdmin && (
                        <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(payment)}>
                                <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(payment.id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                            </div>
                        </TableCell>
                        )}
                    </TableRow>
                    ))
                )}
                </TableBody>
            </Table>
        </CardContent>
      </Card>

      {/* Record/Edit Payment Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
        <DialogHeader>
            <DialogTitle>{editingPayment ? 'Edit Payment' : 'Record Payment'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
            <Label htmlFor="userId">Employee *</Label>
            {isAdmin ? (
                <Select 
                    value={formData.userId} 
                    onValueChange={(value) => setFormData({ ...formData, userId: value })}
                    disabled={!!editingPayment}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                        {users.map(user => (
                            <SelectItem key={user.id.toText()} value={user.id.toText()}>
                                {user.firstName} {user.lastName} ({user.id.toText().slice(0, 5)}...)
                            </SelectItem>
                        ))}
                        {/* Allow entering custom principal if needed or if users list is empty */}
                        <SelectItem value="manual">+ Enter Manual ID</SelectItem>
                    </SelectContent>
                </Select>
            ) : (
                 <Input value="Me" disabled />
            )}
            {formData.userId === 'manual' && (
                 <Input
                    placeholder="Enter Principal ID manually"
                    value={formData.userId === 'manual' ? '' : formData.userId}
                    onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                 />
            )}
            </div>
            <div className="space-y-2">
            <Label htmlFor="amount">Amount ($) *</Label>
            <Input
                id="amount"
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="Enter amount"
                required
            />
            </div>
            <div className="space-y-2">
            <Label htmlFor="recordType">Type</Label>
            <Select value={formData.recordType} onValueChange={(value) => setFormData({ ...formData, recordType: value })}>
                <SelectTrigger>
                <SelectValue />
                </SelectTrigger>
                <SelectContent>
                <SelectItem value="salary">Salary</SelectItem>
                <SelectItem value="bonus">Bonus</SelectItem>
                <SelectItem value="increment">Increment</SelectItem>
                <SelectItem value="deduction">Deduction</SelectItem>
                </SelectContent>
            </Select>
            </div>
            <div className="space-y-2">
            <Label htmlFor="date">Date *</Label>
            <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
            />
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={recordPayment.isPending || updatePayment.isPending}>
                    {(recordPayment.isPending || updatePayment.isPending) ? 'Saving...' : 'Save Payment'}
                </Button>
            </DialogFooter>
        </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
