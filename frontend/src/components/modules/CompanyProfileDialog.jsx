import { useState, useMemo } from 'react';
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
import { cn } from '@/lib/utils';
import {
  Building2,
  Users,
  Clock,
  DollarSign,
  CheckCircle2,
  FolderKanban,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Search,
} from 'lucide-react';
import { format } from 'date-fns';

const toCleanId = (val) => {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (val.toText) return val.toText().trim();
  if (val._id) return String(val._id).trim();
  if (val.id) return toCleanId(val.id);
  return String(val).trim();
};

export default function CompanyProfileDialog({
  company,
  open,
  onClose,
  allUsers = [],
  allAttendance = [],
  allTasks = [],
  allProjects = [],
  onSelectEmployee,
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [empSearch, setEmpSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [taskFilter, setTaskFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');

  if (!company) return null;

  const compId = toCleanId(company._id || company.companyId || company.id);
  const compName = company.name || 'Unnamed Company';
  const compStatus = typeof company.status === 'string' ? company.status : 'active';
  const isBlocked = compStatus === 'blocked' || compStatus === 'suspended';

  // 1. Employees belonging to this company
  const companyEmployees = useMemo(() => {
    return (allUsers || []).filter(u => {
      const uCompId = toCleanId(u.companyId?._id || u.companyId);
      const uCompName = String(u.companyName || u.company || '').trim().toLowerCase();
      const targetName = compName.trim().toLowerCase();
      return (compId && uCompId && uCompId === compId) || (uCompName && targetName && uCompName === targetName);
    });
  }, [allUsers, compId, compName]);

  // Unique departments in this company
  const departments = useMemo(() => {
    const set = new Set();
    companyEmployees.forEach(u => {
      if (u.department) set.add(u.department);
    });
    return Array.from(set);
  }, [companyEmployees]);

  // Filtered employees for directory
  const filteredEmployees = useMemo(() => {
    return companyEmployees.filter(u => {
      const matchesSearch = !empSearch.trim() || 
        String(u.name || '').toLowerCase().includes(empSearch.toLowerCase()) ||
        String(u.username || '').toLowerCase().includes(empSearch.toLowerCase()) ||
        String(u.StaffId || u.staffId || '').toLowerCase().includes(empSearch.toLowerCase()) ||
        String(u.email || '').toLowerCase().includes(empSearch.toLowerCase()) ||
        String(u.designation || '').toLowerCase().includes(empSearch.toLowerCase());

      const matchesDept = deptFilter === 'all' || u.department === deptFilter;
      return matchesSearch && matchesDept;
    });
  }, [companyEmployees, empSearch, deptFilter]);

  // Employee IDs set for fast membership lookup
  const employeeIds = useMemo(() => {
    const set = new Set();
    companyEmployees.forEach(u => {
      set.add(toCleanId(u.userId).toLowerCase());
      set.add(toCleanId(u._id).toLowerCase());
      set.add(toCleanId(u.id).toLowerCase());
      set.add(toCleanId(u.StaffId || u.staffId).toLowerCase());
      set.add(String(u.username || '').toLowerCase());
    });
    return set;
  }, [companyEmployees]);

  // 2. Company Attendance
  const companyAttendance = useMemo(() => {
    return (allAttendance || []).filter(a => {
      const aCompId = toCleanId(a.companyId);
      if (compId && aCompId && aCompId === compId) return true;
      const uId = toCleanId(a.userId || a.staffId || a.user).toLowerCase();
      return employeeIds.has(uId);
    });
  }, [allAttendance, compId, employeeIds]);

  const attendanceMetrics = useMemo(() => {
    const total = companyAttendance.length;
    let present = 0;
    let late = 0;
    let absent = 0;
    let halfDay = 0;

    companyAttendance.forEach(a => {
      const s = String(a.status || 'present').toLowerCase();
      if (s === 'present') present += 1;
      else if (s === 'late') late += 1;
      else if (s === 'absent') absent += 1;
      else if (s === 'half_day' || s === 'halfday') halfDay += 1;
      else present += 1;
    });

    const attended = present + late + halfDay;
    const rate = total > 0 ? Math.min(100, Math.round((attended / total) * 100)) : 0;
    return { total, present, late, absent, halfDay, rate };
  }, [companyAttendance]);

  // 3. Company Tasks
  const companyTasks = useMemo(() => {
    return (allTasks || []).filter(t => {
      const tCompId = toCleanId(t.companyId);
      if (compId && tCompId && tCompId === compId) return true;
      const assignee = toCleanId(t.assignee || t.assignedTo).toLowerCase();
      return employeeIds.has(assignee);
    });
  }, [allTasks, compId, employeeIds]);

  const taskMetrics = useMemo(() => {
    const total = companyTasks.length;
    const completed = companyTasks.filter(t => t.status === 'done' || t.status === 'completed').length;
    const inProgress = companyTasks.filter(t => t.status === 'in_progress' || t.status === 'review').length;
    const pending = companyTasks.filter(t => t.status === 'todo' || t.status === 'paused' || t.status === 'blocked').length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, pending, rate };
  }, [companyTasks]);

  const filteredTasks = useMemo(() => {
    if (taskFilter === 'all') return companyTasks;
    if (taskFilter === 'completed') return companyTasks.filter(t => t.status === 'done' || t.status === 'completed');
    if (taskFilter === 'in_progress') return companyTasks.filter(t => t.status === 'in_progress' || t.status === 'review');
    if (taskFilter === 'pending') return companyTasks.filter(t => t.status === 'todo' || t.status === 'paused' || t.status === 'blocked');
    return companyTasks;
  }, [companyTasks, taskFilter]);

  // 4. Company Projects
  const companyProjects = useMemo(() => {
    return (allProjects || []).filter(p => {
      const pCompId = toCleanId(p.companyId);
      if (compId && pCompId && pCompId === compId) return true;
      return (p.assignedEmployees || []).some(e => {
        const uId = toCleanId(e.userId || e.id).toLowerCase();
        return employeeIds.has(uId);
      });
    });
  }, [allProjects, compId, employeeIds]);

  const projectMetrics = useMemo(() => {
    const total = companyProjects.length;
    const active = companyProjects.filter(p => p.status === 'active' || p.status === 'in_progress').length;
    const completed = companyProjects.filter(p => p.status === 'completed').length;
    const planning = companyProjects.filter(p => p.status === 'planning' || p.status === 'on_hold').length;
    return { total, active, completed, planning };
  }, [companyProjects]);

  const filteredProjects = useMemo(() => {
    if (projectFilter === 'all') return companyProjects;
    return companyProjects.filter(p => (p.status || 'active').toLowerCase() === projectFilter);
  }, [companyProjects, projectFilter]);

  // 5. Company Payroll / Financial summary
  const payrollSummary = useMemo(() => {
    let totalMonthlyBase = 0;
    let employeeCountWithSalary = 0;

    companyEmployees.forEach(u => {
      const sal = Number(u.salary || 0);
      if (sal > 0) {
        totalMonthlyBase += sal;
        employeeCountWithSalary += 1;
      }
    });

    const avgSalary = employeeCountWithSalary > 0 ? Math.round(totalMonthlyBase / employeeCountWithSalary) : 0;
    const rawFee = Number(company.amount ?? company.monthlyFee ?? company.revenue ?? company.subscriptionAmount ?? 0);
    const platformBilling = isNaN(rawFee) ? 0 : rawFee;

    return {
      totalMonthlyBase,
      avgSalary,
      employeeCountWithSalary,
      platformBilling,
    };
  }, [companyEmployees, company]);

  const formatCurrency = (val) => {
    const num = Number(val || 0);
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatRole = (role) => {
    if (!role) return 'Staff';
    if (typeof role === 'string') return role.charAt(0).toUpperCase() + role.slice(1);
    if (typeof role === 'object') {
      const keys = Object.keys(role);
      return keys.length > 0 ? (keys[0].charAt(0).toUpperCase() + keys[0].slice(1)) : 'Staff';
    }
    return String(role);
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

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-5xl lg:max-w-6xl w-full p-0 overflow-hidden bg-[#FFFFFF] dark:bg-[#0D2028] border-[#D5E5D7] dark:border-[#203A42] text-foreground rounded-2xl shadow-2xl max-h-[92vh] flex flex-col focus:outline-none"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Company Profile: {compName}</DialogTitle>
          <DialogDescription>Super Admin comprehensive view of organization details, workforce, attendance, payroll, tasks, and projects.</DialogDescription>
        </DialogHeader>

        {/* 1. TOP HEADER & BANNER */}
        <div className="relative bg-gradient-to-r from-[#F0FDF4]/80 via-[#F8FAF9] to-[#E6F7F5] dark:from-[#091E24] dark:via-[#0D2028] dark:to-[#10252D] border-b border-[#D5E5D7] dark:border-[#203A42] p-5 sm:p-6 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            {/* Logo & Company Identity */}
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-[#45CFC0] border-2 border-white dark:border-[#203A42] shadow-md ring-2 ring-[#15966A]/20 dark:ring-[#45CFC0]/30 flex items-center justify-center shrink-0">
                {company.logo ? (
                  <img src={company.logo} alt={compName} className="w-full h-full object-cover rounded-2xl" />
                ) : (
                  <Building2 className="w-8 h-8 sm:w-10 sm:h-10 text-primary dark:text-[#45CFC0]" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1F2937] dark:text-[#E8F0F4] truncate">
                    {compName}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-semibold bg-primary/10 text-primary dark:text-[#45CFC0] border border-primary/20 dark:border-[#45CFC0]/30 shrink-0">
                    ID: {compId}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs font-semibold px-2 py-0.5 rounded-full capitalize',
                      isBlocked
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    )}
                  >
                    {isBlocked ? 'Suspended / Blocked' : 'Active Organization'}
                  </Badge>
                </div>

                <div className="text-xs sm:text-sm font-medium text-muted-foreground dark:text-[#A8BAC3] mt-1 flex items-center gap-2 flex-wrap">
                  <span className="text-[#1F2937] dark:text-[#E8F0F4] font-semibold">{company.category || company.industry || 'Enterprise'}</span>
                  <span>•</span>
                  <span>Owner: <span className="font-semibold text-foreground dark:text-[#E8F0F4]">{company.ownerName || company.ownerId || 'Primary Admin'}</span></span>
                  {company.city && (
                    <>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-primary dark:text-[#45CFC0]" />
                        {company.city}{company.state ? `, ${company.state}` : ''}
                      </span>
                    </>
                  )}
                </div>

                {/* Quick Meta */}
                <div className="flex items-center gap-3 sm:gap-4 mt-2.5 text-xs text-muted-foreground dark:text-[#A8BAC3] flex-wrap">
                  <div className="inline-flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-primary/70 dark:text-[#45CFC0]/70" />
                    <span>{companyEmployees.length} Total Employees</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-primary/70 dark:text-[#45CFC0]/70" />
                    <span>{departments.length} Departments</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-primary/70 dark:text-[#45CFC0]/70" />
                    <span>Registered: {company.createdAt ? format(new Date(company.createdAt), 'dd MMM yyyy') : 'Active'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Back button */}
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
            </div>
          </div>
        </div>

        {/* 2. TABS NAVIGATION */}
        <div className="border-b border-[#D5E5D7] dark:border-[#203A42] bg-[#F8FAF9]/80 dark:bg-[#091E24]/80 px-5 sm:px-6 shrink-0 overflow-x-auto">
          <div className="flex items-center gap-1 sm:gap-2">
            {[
              { id: 'overview', label: 'Company Overview', icon: Building2 },
              { id: 'employees', label: 'Employee Directory', icon: Users, count: companyEmployees.length },
              { id: 'attendance', label: 'Attendance', icon: Clock, count: companyAttendance.length },
              { id: 'payroll', label: 'Payroll & Compensation', icon: DollarSign },
              { id: 'tasks', label: 'Tasks', icon: CheckCircle2, count: companyTasks.length },
              { id: 'projects', label: 'Projects', icon: FolderKanban, count: companyProjects.length },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 py-3 px-3 sm:px-3.5 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap',
                    isActive
                      ? 'border-primary dark:border-[#45CFC0] text-primary dark:text-[#45CFC0]'
                      : 'border-transparent text-muted-foreground dark:text-[#A8BAC3] hover:text-foreground dark:hover:text-[#E8F0F4]'
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
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
              {/* Top 4 KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card
                  onClick={() => setActiveTab('employees')}
                  className="p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#10252D] hover:border-primary/40 dark:hover:border-[#45CFC0]/40 transition-all cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground dark:text-[#A8BAC3]">Total Workforce</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#1F2937] dark:text-[#E8F0F4] mt-1">
                        {companyEmployees.length}
                      </h3>
                      <p className="text-[11px] text-muted-foreground dark:text-[#A8BAC3] mt-2">
                        {departments.length} Active Departments
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-primary/10 dark:bg-[#123A3C] text-primary dark:text-[#45CFC0] group-hover:scale-105 transition-transform">
                      <Users className="w-5 h-5" />
                    </div>
                  </div>
                </Card>

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
                      <p className="text-[11px] text-muted-foreground dark:text-[#A8BAC3] mt-2">
                        {attendanceMetrics.total} Total Recorded Logs
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-primary/10 dark:bg-[#123A3C] text-primary dark:text-[#45CFC0] group-hover:scale-105 transition-transform">
                      <Clock className="w-5 h-5" />
                    </div>
                  </div>
                </Card>

                <Card
                  onClick={() => setActiveTab('tasks')}
                  className="p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#10252D] hover:border-primary/40 dark:hover:border-[#45CFC0]/40 transition-all cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground dark:text-[#A8BAC3]">Tasks Progress</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#1F2937] dark:text-[#E8F0F4] mt-1">
                        {taskMetrics.completed} / {taskMetrics.total}
                      </h3>
                      <p className="text-[11px] text-muted-foreground dark:text-[#A8BAC3] mt-2">
                        {taskMetrics.rate}% Overall Completion Rate
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-primary/10 dark:bg-[#123A3C] text-primary dark:text-[#45CFC0] group-hover:scale-105 transition-transform">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  </div>
                </Card>

                <Card
                  onClick={() => setActiveTab('projects')}
                  className="p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#10252D] hover:border-primary/40 dark:hover:border-[#45CFC0]/40 transition-all cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground dark:text-[#A8BAC3]">Associated Projects</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#1F2937] dark:text-[#E8F0F4] mt-1">
                        {projectMetrics.total}
                      </h3>
                      <p className="text-[11px] text-muted-foreground dark:text-[#A8BAC3] mt-2">
                        {projectMetrics.active} Active • {projectMetrics.completed} Completed
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-primary/10 dark:bg-[#123A3C] text-primary dark:text-[#45CFC0] group-hover:scale-105 transition-transform">
                      <FolderKanban className="w-5 h-5" />
                    </div>
                  </div>
                </Card>
              </div>

              {/* 2-Column Organization Details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Organization Information Card */}
                <div className="border border-[#D5E5D7] dark:border-[#203A42] rounded-2xl bg-card dark:bg-[#10252D] p-5 shadow-xs">
                  <h4 className="text-sm font-bold text-[#1F2937] dark:text-[#E8F0F4] flex items-center gap-2 mb-4">
                    <Building2 className="w-4 h-4 text-primary dark:text-[#45CFC0]" />
                    Company Information & Compliance
                  </h4>
                  <div className="divide-y divide-[#D5E5D7]/50 dark:divide-[#203A42]/50 text-xs">
                    <div className="py-2.5 flex justify-between">
                      <span className="text-muted-foreground dark:text-[#A8BAC3]">Company Name</span>
                      <span className="font-semibold text-foreground dark:text-[#E8F0F4]">{compName}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-muted-foreground dark:text-[#A8BAC3]">Category / Sector</span>
                      <span className="font-semibold text-foreground dark:text-[#E8F0F4]">{company.category || company.industry || 'IT Solutions'}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-muted-foreground dark:text-[#A8BAC3]">Primary Owner / Admin</span>
                      <span className="font-semibold text-foreground dark:text-[#E8F0F4]">{company.ownerName || company.ownerId || 'Primary Admin'}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-muted-foreground dark:text-[#A8BAC3]">Email Address</span>
                      <span className="font-semibold text-foreground dark:text-[#E8F0F4]">{company.email || `${company.ownerId || 'admin'}@company.com`}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-muted-foreground dark:text-[#A8BAC3]">Contact Phone</span>
                      <span className="font-semibold text-foreground dark:text-[#E8F0F4]">{company.phone || 'Not provided'}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-muted-foreground dark:text-[#A8BAC3]">GST / Tax Identifier</span>
                      <span className="font-mono font-semibold text-foreground dark:text-[#E8F0F4]">{company.gst || 'Not registered'}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-muted-foreground dark:text-[#A8BAC3]">Headquarters Address</span>
                      <span className="font-semibold text-foreground dark:text-[#E8F0F4] text-right max-w-[240px]">
                        {[company.address, company.city, company.state, company.zip].filter(Boolean).join(', ') || 'Not specified'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payroll & Financial Summary Card */}
                <div className="border border-[#D5E5D7] dark:border-[#203A42] rounded-2xl bg-card dark:bg-[#10252D] p-5 shadow-xs flex flex-col justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-[#1F2937] dark:text-[#E8F0F4] flex items-center gap-2 mb-4">
                      <DollarSign className="w-4 h-4 text-primary dark:text-[#45CFC0]" />
                      Workforce Payroll & Subscription Summary
                    </h4>
                    <div className="divide-y divide-[#D5E5D7]/50 dark:divide-[#203A42]/50 text-xs">
                      <div className="py-2.5 flex justify-between">
                        <span className="text-muted-foreground dark:text-[#A8BAC3]">Monthly Employee Payroll</span>
                        <span className="font-bold text-base text-foreground dark:text-[#E8F0F4]">
                          {formatCurrency(payrollSummary.totalMonthlyBase)}
                        </span>
                      </div>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-muted-foreground dark:text-[#A8BAC3]">Average Staff Compensation</span>
                        <span className="font-semibold text-foreground dark:text-[#E8F0F4]">
                          {formatCurrency(payrollSummary.avgSalary)} / mo
                        </span>
                      </div>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-muted-foreground dark:text-[#A8BAC3]">Employees on Payroll</span>
                        <span className="font-semibold text-foreground dark:text-[#E8F0F4]">
                          {payrollSummary.employeeCountWithSalary} of {companyEmployees.length} recorded
                        </span>
                      </div>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-muted-foreground dark:text-[#A8BAC3]">Organization Subscription Fee</span>
                        <span className="font-semibold text-emerald-600 dark:text-[#45CFC0]">
                          {formatCurrency(payrollSummary.platformBilling)} / mo
                        </span>
                      </div>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-muted-foreground dark:text-[#A8BAC3]">Subscription Plan</span>
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full capitalize">
                          {company.plan || 'Enterprise Plan'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#D5E5D7]/50 dark:border-[#203A42]/50 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground dark:text-[#A8BAC3]">Click to inspect employee directory:</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab('employees')}
                      className="text-xs text-primary dark:text-[#45CFC0] hover:bg-primary/10 h-7 px-2 cursor-pointer font-semibold"
                    >
                      View Workforce ({companyEmployees.length}) →
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EMPLOYEE DIRECTORY */}
          {activeTab === 'employees' && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              {/* Directory Filter Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary/30 dark:bg-[#10252D] p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42]">
                <div className="flex items-center gap-2 flex-1 max-w-sm">
                  <div className="relative w-full">
                    <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={empSearch}
                      onChange={(e) => setEmpSearch(e.target.value)}
                      placeholder="Search employees by name, ID, designation..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-background dark:bg-[#0D2028] border border-[#D5E5D7] dark:border-[#203A42] text-foreground outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground dark:text-[#A8BAC3]">Department:</span>
                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="h-8 px-2.5 rounded-lg text-xs bg-background dark:bg-[#0D2028] border border-[#D5E5D7] dark:border-[#203A42] text-foreground font-medium outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="all">All Departments ({departments.length})</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Employee Cards Grid */}
              {filteredEmployees.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground dark:text-[#A8BAC3] border border-dashed border-[#D5E5D7] dark:border-[#203A42] rounded-xl">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-40 text-primary" />
                  <p className="font-semibold text-foreground dark:text-[#E8F0F4]">No employees found</p>
                  <p className="text-[11px] mt-1 text-muted-foreground/80 dark:text-[#A8BAC3]/80">No team members match the search or department filter.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {filteredEmployees.map((emp) => {
                    const empId = toCleanId(emp.StaffId || emp.staffId || emp.userId || emp.id);
                    const isSuspended = Boolean(emp.isSuspended || (typeof emp.status === 'string' && emp.status.toLowerCase() === 'inactive'));

                    return (
                      <Card
                        key={emp.userId || emp._id || emp.username}
                        onClick={() => onSelectEmployee && onSelectEmployee(emp)}
                        className="p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#10252D] hover:border-primary/50 dark:hover:border-[#45CFC0]/50 transition-all cursor-pointer group shadow-2xs flex flex-col justify-between"
                      >
                        <div className="flex items-start gap-3">
                          <SafeAvatar src={emp.avatar} name={emp.name} className="w-10 h-10 rounded-full shrink-0 border border-border/40" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <h5 className="font-semibold text-xs text-foreground dark:text-[#E8F0F4] group-hover:text-primary dark:group-hover:text-[#45CFC0] transition-colors truncate">
                                {emp.name || emp.username}
                              </h5>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[9px] px-1.5 py-0 rounded-full capitalize shrink-0 font-semibold',
                                  isSuspended
                                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                )}
                              >
                                {isSuspended ? 'Inactive' : 'Active'}
                              </Badge>
                            </div>

                            <p className="text-[11px] text-muted-foreground dark:text-[#A8BAC3]/70 truncate mt-0.5">
                              {emp.designation || formatRole(emp.role)} {emp.department ? `• ${emp.department}` : ''}
                            </p>

                            {empId && (
                              <span className="inline-block text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-primary/10 text-primary dark:text-[#45CFC0] border border-primary/20 shrink-0 mt-1">
                                ID: {empId}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="pt-2.5 mt-2.5 border-t border-[#D5E5D7]/50 dark:border-[#203A42]/50 flex items-center justify-between text-[11px] text-muted-foreground dark:text-[#A8BAC3]">
                          <span>Salary: {emp.salary ? formatCurrency(emp.salary) : 'Configured'}</span>
                          <span className="text-primary dark:text-[#45CFC0] font-semibold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                            View 360° Profile →
                          </span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: COMPANY ATTENDANCE */}
          {activeTab === 'attendance' && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              {/* Attendance Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-secondary/30 dark:bg-[#10252D] p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42]">
                <div>
                  <span className="text-xs text-muted-foreground dark:text-[#A8BAC3]">Company Present Rate</span>
                  <h4 className="text-xl font-bold text-emerald-600 dark:text-[#45CFC0] mt-0.5">{attendanceMetrics.rate}%</h4>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground dark:text-[#A8BAC3]">Present Sessions</span>
                  <h4 className="text-xl font-bold text-foreground dark:text-[#E8F0F4] mt-0.5">{attendanceMetrics.present}</h4>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground dark:text-[#A8BAC3]">Late Arrivals</span>
                  <h4 className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{attendanceMetrics.late}</h4>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground dark:text-[#A8BAC3]">Absences Recorded</span>
                  <h4 className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">{attendanceMetrics.absent}</h4>
                </div>
              </div>

              {/* Attendance Table */}
              {companyAttendance.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground dark:text-[#A8BAC3] border border-dashed border-[#D5E5D7] dark:border-[#203A42] rounded-xl">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-40 text-primary" />
                  <p className="font-semibold text-foreground dark:text-[#E8F0F4]">No attendance logs recorded</p>
                  <p className="text-[11px] mt-1 text-muted-foreground/80 dark:text-[#A8BAC3]/80">No check-in or shift sessions have been submitted for this company yet.</p>
                </div>
              ) : (
                <div className="border border-[#D5E5D7] dark:border-[#203A42] rounded-xl overflow-hidden bg-card dark:bg-[#10252D] shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-secondary/40 dark:bg-[#0D2028] border-b border-[#D5E5D7] dark:border-[#203A42] text-muted-foreground dark:text-[#A8BAC3] font-semibold text-[11px]">
                          <th className="py-2.5 px-3.5">Date</th>
                          <th className="py-2.5 px-3">Employee</th>
                          <th className="py-2.5 px-3">Check-In</th>
                          <th className="py-2.5 px-3">Check-Out</th>
                          <th className="py-2.5 px-3">Working Hours</th>
                          <th className="py-2.5 px-3">Break Time</th>
                          <th className="py-2.5 px-3.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D5E5D7]/50 dark:divide-[#203A42]/50">
                        {companyAttendance.slice(0, 20).map((log, idx) => {
                          const statusStr = String(log.status || 'present').toLowerCase();
                          const isPresent = statusStr === 'present' || statusStr === 'half_day';
                          const isLate = statusStr === 'late';
                          const targetEmp = companyEmployees.find(u => {
                            const uId = toCleanId(u.userId || u.StaffId || u.id);
                            const lId = toCleanId(log.userId || log.staffId);
                            return uId && lId && uId === lId;
                          });

                          return (
                            <tr key={log._id || log.id || idx} className="hover:bg-secondary/30 dark:hover:bg-[#142E35] transition-colors">
                              <td className="py-2.5 px-3.5 font-semibold text-[#1F2937] dark:text-[#E8F0F4] whitespace-nowrap">
                                {log.date ? format(new Date(log.date), 'EEE, dd MMM yyyy') : 'Recent'}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className="font-semibold text-foreground dark:text-[#E8F0F4]">{targetEmp?.name || log.userId || 'Employee'}</span>
                                {log.staffId && <span className="text-[10px] text-muted-foreground ml-1.5 font-mono">({log.staffId})</span>}
                              </td>
                              <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{formatTimeStr(log.checkIn)}</td>
                              <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{formatTimeStr(log.checkOut)}</td>
                              <td className="py-2.5 px-3 font-medium whitespace-nowrap">{log.workingHours ? `${log.workingHours} hrs` : '--'}</td>
                              <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{log.breakMinutes ? `${log.breakMinutes}m` : '--'}</td>
                              <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
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
                                  {log.status || 'Present'}
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

          {/* TAB 4: COMPANY PAYROLL */}
          {activeTab === 'payroll' && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              {/* Payroll Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#10252D] shadow-2xs">
                  <span className="text-xs text-muted-foreground dark:text-[#A8BAC3]">Total Monthly Payroll</span>
                  <h3 className="text-2xl font-bold text-[#1F2937] dark:text-[#E8F0F4] mt-1">
                    {formatCurrency(payrollSummary.totalMonthlyBase)}
                  </h3>
                  <p className="text-[11px] text-muted-foreground dark:text-[#A8BAC3] mt-1">Calculated from staff profiles</p>
                </Card>

                <Card className="p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#10252D] shadow-2xs">
                  <span className="text-xs text-muted-foreground dark:text-[#A8BAC3]">Average Compensation</span>
                  <h3 className="text-2xl font-bold text-foreground dark:text-[#E8F0F4] mt-1">
                    {formatCurrency(payrollSummary.avgSalary)}
                  </h3>
                  <p className="text-[11px] text-muted-foreground dark:text-[#A8BAC3] mt-1">Per active salaried employee</p>
                </Card>

                <Card className="p-4 rounded-xl border border-primary/30 dark:border-[#45CFC0]/30 bg-primary/5 dark:bg-[#123A3C]/40 shadow-2xs">
                  <span className="text-xs text-primary dark:text-[#45CFC0] font-semibold">Platform Subscription</span>
                  <h3 className="text-2xl font-extrabold text-primary dark:text-[#45CFC0] mt-1">
                    {formatCurrency(payrollSummary.platformBilling)}
                  </h3>
                  <p className="text-[11px] text-primary/80 dark:text-[#45CFC0]/80 mt-1">Recurring monthly plan</p>
                </Card>
              </div>

              {/* Employee Salary List */}
              <div className="border border-[#D5E5D7] dark:border-[#203A42] rounded-xl overflow-hidden bg-card dark:bg-[#10252D] p-5 shadow-2xs">
                <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-[#A8BAC3] mb-3">
                  Employee Salary Schedule ({companyEmployees.length})
                </h5>
                <div className="divide-y divide-[#D5E5D7]/50 dark:divide-[#203A42]/50">
                  {companyEmployees.map((emp) => (
                    <div key={emp.userId || emp._id} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <SafeAvatar src={emp.avatar} name={emp.name} className="w-7 h-7 rounded-full shrink-0" />
                        <div>
                          <p className="font-semibold text-foreground dark:text-[#E8F0F4]">{emp.name || emp.username}</p>
                          <p className="text-[11px] text-muted-foreground dark:text-[#A8BAC3]">{emp.designation || formatRole(emp.role)} • {emp.department || 'General'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-foreground dark:text-[#E8F0F4] block">{emp.salary ? formatCurrency(emp.salary) : '₹0'}</span>
                        <span className="text-[10px] text-muted-foreground capitalize">{emp.status || 'Active'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: COMPANY TASKS */}
          {activeTab === 'tasks' && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary/30 dark:bg-[#10252D] p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42]">
                <div>
                  <h4 className="text-sm font-bold text-[#1F2937] dark:text-[#E8F0F4] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary dark:text-[#45CFC0]" />
                    Company Tasks & Execution
                  </h4>
                  <p className="text-xs text-muted-foreground dark:text-[#A8BAC3] mt-0.5">
                    {taskMetrics.completed} of {taskMetrics.total} tasks completed ({taskMetrics.rate}%)
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {['all', 'completed', 'in_progress', 'pending'].map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setTaskFilter(filter)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer',
                        taskFilter === filter
                          ? 'bg-primary dark:bg-[#45CFC0] text-primary-foreground dark:text-[#0D2028]'
                          : 'bg-background dark:bg-[#0D2028] text-muted-foreground dark:text-[#A8BAC3] border border-[#D5E5D7] dark:border-[#203A42]'
                      )}
                    >
                      {filter.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {filteredTasks.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground dark:text-[#A8BAC3] border border-dashed border-[#D5E5D7] dark:border-[#203A42] rounded-xl">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40 text-primary" />
                  <p className="font-semibold text-foreground dark:text-[#E8F0F4]">No tasks found</p>
                  <p className="text-[11px] mt-1 text-muted-foreground/80 dark:text-[#A8BAC3]/80">No tasks have been created under this company's workspace yet.</p>
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
                      <Card key={task.id || task._id} className="p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#10252D] shadow-2xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h5 className="font-bold text-sm text-[#1F2937] dark:text-[#E8F0F4] line-clamp-2">{task.title}</h5>
                            <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0 font-semibold', priorityColor)}>
                              {task.priority || 'Medium'}
                            </Badge>
                          </div>
                          {task.description && (
                            <p className="text-xs text-muted-foreground dark:text-[#A8BAC3] line-clamp-2 mb-3">{task.description}</p>
                          )}
                          {task.projectName && (
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-secondary/60 dark:bg-[#142E35] text-[11px] font-medium text-muted-foreground dark:text-[#A8BAC3] mb-3">
                              <FolderKanban className="w-3 h-3 text-primary dark:text-[#45CFC0]" />
                              <span className="truncate">{task.projectName}</span>
                            </div>
                          )}
                        </div>
                        <div className="pt-3 border-t border-[#D5E5D7]/50 dark:border-[#203A42]/50 flex items-center justify-between text-xs text-muted-foreground dark:text-[#A8BAC3]">
                          <span>Due: {task.dueDate ? format(new Date(task.dueDate), 'dd MMM yyyy') : 'No target date'}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] px-2 py-0.5 rounded-full capitalize font-semibold',
                              isCompleted
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : isInProgress
                                ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
                                : 'bg-secondary dark:bg-[#142E35] text-muted-foreground'
                            )}
                          >
                            {typeof task.status === 'string' ? task.status.replace('_', ' ') : 'Pending'}
                          </Badge>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: COMPANY PROJECTS */}
          {activeTab === 'projects' && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary/30 dark:bg-[#10252D] p-4 rounded-xl border border-[#D5E5D7] dark:border-[#203A42]">
                <div>
                  <h4 className="text-sm font-bold text-[#1F2937] dark:text-[#E8F0F4] flex items-center gap-2">
                    <FolderKanban className="w-4 h-4 text-primary dark:text-[#45CFC0]" />
                    Company Projects
                  </h4>
                  <p className="text-xs text-muted-foreground dark:text-[#A8BAC3] mt-0.5">
                    {projectMetrics.total} Total Projects ({projectMetrics.active} active, {projectMetrics.completed} completed)
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {['all', 'active', 'completed', 'planning'].map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setProjectFilter(filter)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer',
                        projectFilter === filter
                          ? 'bg-primary dark:bg-[#45CFC0] text-primary-foreground dark:text-[#0D2028]'
                          : 'bg-background dark:bg-[#0D2028] text-muted-foreground dark:text-[#A8BAC3] border border-[#D5E5D7] dark:border-[#203A42]'
                      )}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {filteredProjects.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground dark:text-[#A8BAC3] border border-dashed border-[#D5E5D7] dark:border-[#203A42] rounded-xl">
                  <FolderKanban className="w-8 h-8 mx-auto mb-2 opacity-40 text-primary" />
                  <p className="font-semibold text-foreground dark:text-[#E8F0F4]">No projects found</p>
                  <p className="text-[11px] mt-1 text-muted-foreground/80 dark:text-[#A8BAC3]/80">No projects recorded for this company yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filteredProjects.map((project) => {
                    const metrics = project.taskMetrics || { total: 0, completed: 0, inProgress: 0 };
                    const progressPct = metrics.total > 0 ? Math.round((metrics.completed / metrics.total) * 100) : (project.status === 'completed' ? 100 : 0);

                    return (
                      <Card key={project.id || project._id} className="p-5 rounded-xl border border-[#D5E5D7] dark:border-[#203A42] bg-card dark:bg-[#10252D] shadow-2xs space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <h5 className="font-bold text-base text-[#1F2937] dark:text-[#E8F0F4]">{project.name}</h5>
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
                                {project.status || 'Active'}
                              </Badge>
                            </div>
                            {project.description && (
                              <p className="text-xs text-muted-foreground dark:text-[#A8BAC3] mt-1">{project.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground dark:text-[#A8BAC3]">
                              <span>Team: {project.assignedEmployees?.length || 0} Members</span>
                              <span>•</span>
                              <span>Start: {project.startDate ? format(new Date(project.startDate), 'dd MMM yyyy') : 'Recorded'}</span>
                              <span>•</span>
                              <span>Due: {project.dueDate ? format(new Date(project.dueDate), 'dd MMM yyyy') : 'No target date'}</span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-sm font-bold text-primary dark:text-[#45CFC0]">{progressPct}% Completed</span>
                            <span className="block text-[11px] text-muted-foreground dark:text-[#A8BAC3]">
                              {metrics.completed} / {metrics.total} tasks finished
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-secondary/80 dark:bg-[#0D2028] h-2 rounded-full overflow-hidden border border-border/40">
                          <div className="bg-primary dark:bg-[#45CFC0] h-full transition-all duration-300 rounded-full" style={{ width: `${progressPct}%` }} />
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
