import { useMemo, useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useGetCompanyInfo, 
  useGetAllCompanies, 
  useCreateCompany, 
  useUpdateCompany, 
  useGetAllUsers,
  useGetCompanyPolicyReviews,
  useAllowEmployeeWorkForward,
  useGetProjects,
  useGetAllTasks
} from '../../hooks/useQueries';
import { cn, hasUserRole, getUserRoleKey, authFetch } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  LayoutDashboard,
  Building,
  Users2,
  TrendingUp,
  MapPin,
  Check,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Trash2,
  Pencil,
  FileText,
  X,
  Save,
  Camera,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  Clock,
  FolderKanban,
  Calendar,
  User,
  Users,
  Search,
  Pause,
  Play,
  Briefcase
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatDeadline, getTaskUiStatus, getTaskStatusLabel, getTaskStatusBadgeClass, isTaskExpired } from '@/lib/taskUtils';
import VoiceNoteBadgePlayer, { extractVoiceNote } from '../VoiceNoteBadgePlayer';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '../PageHeader';
import OfficeLocationMapModal from './OfficeLocationMapModal';

const DEFAULT_TERMS = `Welcome to ReGen Innovations Inc.

These terms and conditions outline the rules and regulations for the use of our applications, systems, and internal modules.

1. Acceptance of Terms
By accessing this system, we assume you accept these terms and conditions. Do not continue to use the system if you do not agree to all of the terms and conditions stated on this page.

2. License & Access
Unless otherwise stated, ReGen Innovations Inc. and/or its licensors own the intellectual property rights for all material on this internal portal. All intellectual property rights are reserved. You may access this from the portal for your own personal and professional use subjected to restrictions set in these terms and conditions.

You must not:
• Republish material from the system
• Sell, rent or sub-license material from the system
• Reproduce, duplicate or copy material from the system
• Redistribute content from ReGen Innovations Inc.

3. User Responsibilities
As an active employee or user within the system, you are responsible for maintaining the confidentiality of your credentials. Any actions performed under your account remain your sole responsibility.

4. Data Privacy & Handling
All personal data, attendance logs, and internal communications are stored securely and actively monitored to ensure operational integrity. Data collected will exclusively be utilized to manage internal procedures, operations, and compliance reporting.

5. Termination of Access
We may freeze or terminate your access to the application gracefully and without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.

If you have any queries regarding any of our terms, please contact the administration directly.`;

export default function CompanyModule({ userProfile }) {
  const queryClient = useQueryClient();
  const { data: initialInfo } = useGetCompanyInfo();
  const { data: companies = [] } = useGetAllCompanies();
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const { data: users = [] } = useGetAllUsers();
  const { data: projects = [], isLoading: isProjectsLoading } = useGetProjects();
  const { data: tasks = [] } = useGetAllTasks();

  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState('all');
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [isOfficeMapOpen, setIsOfficeMapOpen] = useState(false);

  const logoFileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    logo: '',
    name: '',
    ownerName: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    category: '',
    about: '',
    contactEmail: '',
    contactPhone: '',
    gst: '',
    taxDetails: '',
    policies: DEFAULT_TERMS,
  });

  const isAdmin = hasUserRole(userProfile, 'admin');
  const isOwner = hasUserRole(userProfile, 'owner') || hasUserRole(userProfile, 'param');

  // Policy management state
  const [policyForm, setPolicyForm] = useState(null); // null = hidden, object = form data
  const [editingPolicyIdx, setEditingPolicyIdx] = useState(null); // null = adding, number = editing index
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Policy Acknowledgment & Exemption Reviews
  const { data: policyReviews = [], refetch: refetchReviews } = useGetCompanyPolicyReviews();
  const allowMutation = useAllowEmployeeWorkForward();

  const handleAllowEmployee = async (ackId, empName) => {
    try {
      await allowMutation.mutateAsync({ ackId });
      toast.success(`Exemption approved for ${empName}. Employee is now allowed to work forward.`);
      refetchReviews();
    } catch (err) {
      toast.error(err.message || 'Failed to allow employee');
    }
  };

  useEffect(() => {
    if (companies.length > 0 && !selectedCompanyId) {
      setSelectedCompanyId(companies[0]._id);
    }
  }, [companies, selectedCompanyId]);

  const currentCompany = useMemo(() => 
    companies.find(c => c._id === selectedCompanyId) || null
  , [companies, selectedCompanyId]);

  useEffect(() => {
    const info = currentCompany || initialInfo;
    if (info) {
      setFormData(prev => ({
        logo: prev.logo || info.logo || '',
        name: info.name || '',
        ownerName: info.ownerName || '',
        address: info.address || '',
        city: info.city || '',
        state: info.state || '',
        zip: info.zip || '',
        category: info.category || '',
        about: info.about || '',
        contactEmail: info.email || '',
        contactPhone: info.phoneNumber || '',
        gst: info.gst || '',
        taxDetails: info.taxDetails || '',
        policies: info.policies || DEFAULT_TERMS,
      }));
    } else {
       setFormData({
        logo: '', name: '', ownerName: '', address: '', city: '', state: '', zip: '',
        category: '', about: '', contactEmail: '', contactPhone: '',
        gst: '', taxDetails: '', establishmentYear: '', policies: DEFAULT_TERMS,
      });
    }
  }, [currentCompany, initialInfo]);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo file size must be less than 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const preview = reader.result;
      setFormData(prev => ({ ...prev, logo: preview }));
      if (currentCompany?._id) {
        try {
          const fd = new FormData();
          fd.append('logo', file);
          const res = await authFetch(`/api/company/${currentCompany._id}/logo`, {
            method: 'POST',
            body: fd
          });
          if (res.ok) {
            const data = await res.json();
            if (data.logo) {
              setFormData(prev => ({ ...prev, logo: data.logo }));
              queryClient.setQueryData(['companies'], (old = []) =>
                Array.isArray(old) ? old.map(c => c._id === currentCompany._id ? { ...c, logo: data.logo } : c) : old
              );
              queryClient.invalidateQueries({ queryKey: ['companies'] });
              queryClient.invalidateQueries({ queryKey: ['companyInfo'] });
              queryClient.invalidateQueries({ queryKey: ['currentUserProfile'] });
              queryClient.invalidateQueries({ queryKey: ['users'] });
              toast.success('Company logo uploaded successfully');
            }
          }
        } catch (err) {
          console.error('Failed to upload logo', err);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGstAutofill = () => {
    if (!isAdmin && !isOwner) return;
    const gstValue = formData.gst.trim();
    if (!gstValue) {
      toast.error('Enter GST number first');
      return;
    }
    const presets = {
      GSTIN123456: {
        name: 'ReGen Innovations Inc.',
        address: '123 Enterprise Drive, Suite 400, Innovation City',
        contact: 'contact@regen.com|+1 (555) 123-4567',
        gst: 'GSTIN123456',
        taxDetails: 'TX-1234567',
        policies: formData.policies,
      },
    };
    const info = presets[gstValue];
    if (!info) {
      toast.error('No company record found for this GST number');
      return;
    }
    const [email, phone] = (info.contact || '').split('|');
    setFormData({
      name: info.name,
      address: info.address,
      contactEmail: email || info.contact || '',
      contactPhone: phone || '',
      gst: info.gst,
      taxDetails: info.taxDetails,
      policies: info.policies,
    });
    toast.success('Company details filled from GST');
  };

  if (!isAdmin && !isOwner) {
    // Read-only view for Staff
    // Or we can just let them see the "Policies" tab primarily
  }

  const handleSubmit = async () => {
    try {
      if (!formData.name || !formData.city) {
        toast.error('Company Name and City are required');
        return;
      }

      if (!formData.logo) {
        toast.error('Company logo / profile picture is mandatory');
        return;
      }

      const info = {
        logo: formData.logo,
        name: formData.name,
        ownerName: formData.ownerName,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
        category: formData.category,
        about: formData.about,
        phoneNumber: formData.contactPhone,
        email: formData.contactEmail,
        gst: formData.gst,
        taxDetails: formData.taxDetails,
        policies: formData.policies,
      };

      if (currentCompany) {
        await updateCompany.mutateAsync({ id: currentCompany._id, info });
        queryClient.setQueryData(['companies'], (old = []) =>
          Array.isArray(old) ? old.map(c => c._id === currentCompany._id ? { ...c, ...info } : c) : old
        );
        queryClient.invalidateQueries({ queryKey: ['companies'] });
        queryClient.invalidateQueries({ queryKey: ['companyInfo'] });
        queryClient.invalidateQueries({ queryKey: ['currentUserProfile'] });
        queryClient.invalidateQueries({ queryKey: ['users'] });
        toast.success('Company profile updated');
      } else {
        toast.error('Only SuperAdmin can create new companies');
      }
    } catch (error) {
      toast.error(error.message || 'Failed to save company information');
    }
  };

  const handleAddNew = () => {
    // Only SuperAdmin can create new companies (handled in SuperAdminDashboard)
    toast.error('Only SuperAdmin can create new companies');
  };

  // --- Policy CRUD handlers ---
  const handleSavePolicy = async () => {
    if (!policyForm?.title?.trim() || !policyForm?.content?.trim()) {
      toast.error('Policy title and content are required');
      return;
    }
    if (!currentCompany?._id) return;

    setSavingPolicy(true);
    try {
      const existing = currentCompany.companyPolicies || [];
      let updated;
      if (editingPolicyIdx !== null) {
        // Edit existing
        updated = existing.map((p, i) => i === editingPolicyIdx ? { ...p, title: policyForm.title, content: policyForm.content, effectiveDate: policyForm.effectiveDate } : p);
      } else {
        // Add new
        updated = [...existing, { title: policyForm.title, content: policyForm.content, effectiveDate: policyForm.effectiveDate }];
      }
      await updateCompany.mutateAsync({ id: currentCompany._id, info: { companyPolicies: updated } });
      toast.success(editingPolicyIdx !== null ? 'Policy updated' : 'Policy added');
      setPolicyForm(null);
      setEditingPolicyIdx(null);
    } catch (err) {
      toast.error(err.message || 'Failed to save policy');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleEditPolicy = (idx) => {
    const policy = currentCompany?.companyPolicies?.[idx];
    if (!policy) return;
    setPolicyForm({
      title: policy.title || '',
      content: policy.content || '',
      effectiveDate: policy.effectiveDate ? policy.effectiveDate.slice(0, 10) : '',
    });
    setEditingPolicyIdx(idx);
  };

  const handleDeletePolicy = async (idx) => {
    if (!currentCompany?._id) return;
    const existing = currentCompany.companyPolicies || [];
    const policy = existing[idx];
    if (!confirm(`Delete policy "${policy?.title}"?`)) return;

    try {
      const updated = existing.filter((_, i) => i !== idx);
      await updateCompany.mutateAsync({ id: currentCompany._id, info: { companyPolicies: updated } });
      toast.success('Policy deleted');
    } catch (err) {
      toast.error(err.message || 'Failed to delete policy');
    }
  };

  const ownerDepartments = useMemo(() => {
    // Show departments for all company members
    const companyUsers = selectedCompanyId
      ? users.filter(u => {
          const uid = u.companyId?._id || u.companyId;
          return uid && String(uid) === String(selectedCompanyId);
        })
      : users;
    const allCompanyUsers = companyUsers.filter(u => {
      const rk = getUserRoleKey(u);
      return rk !== 'owner' && rk !== 'param';
    });
    const deptMap = new Map();

    allCompanyUsers.forEach(u => {
      const deptKey = u.department || 'Unassigned';
      if (!deptMap.has(deptKey)) {
        deptMap.set(deptKey, { department: deptKey, staff: [] });
      }
      deptMap.get(deptKey).staff.push(u);
    });

    return Array.from(deptMap.values()).sort((a, b) =>
      a.department.localeCompare(b.department),
    );
  }, [users, selectedCompanyId]);

  const departmentCards = useMemo(() => {
    return ownerDepartments.map(dept => {
      const totalStaff = dept.staff.length;
      const activeStaff = totalStaff;
      const inactiveStaff = 0;
      return {
        name: dept.department,
        totalStaff,
        activeStaff,
        inactiveStaff,
      };
    });
  }, [ownerDepartments]);

  // Company Projects data
  const companyProjects = useMemo(() => {
    return projects.filter(p => {
      if (selectedCompanyId) {
        const pCo = p.companyId?._id || p.companyId;
        if (pCo && String(pCo) !== String(selectedCompanyId)) return false;
      }
      if (projectStatusFilter !== 'all' && p.status !== projectStatusFilter) {
        return false;
      }
      if (projectSearch.trim()) {
        const query = projectSearch.toLowerCase();
        const matchesName = (p.name || '').toLowerCase().includes(query);
        const matchesDesc = (p.description || '').toLowerCase().includes(query);
        return matchesName || matchesDesc;
      }
      return true;
    });
  }, [projects, selectedCompanyId, projectStatusFilter, projectSearch]);

  const activeProject = useMemo(() => {
    if (!companyProjects.length || !selectedProjectId) return null;
    return companyProjects.find(p => String(p._id || p.id) === String(selectedProjectId)) || null;
  }, [companyProjects, selectedProjectId]);

  const activeProjectTasks = useMemo(() => {
    if (!activeProject) return [];
    const pUuid = String(activeProject.id || '');
    const pMongoId = String(activeProject._id || '');
    const pName = String(activeProject.name || '').trim().toLowerCase();

    return tasks.filter(t => {
      const taskProjId = String(t.projectId?._id || t.projectId?.id || t.projectId || '');
      const taskProjName = String(t.projectName || '').trim().toLowerCase();
      if (pUuid && taskProjId && taskProjId === pUuid) return true;
      if (pMongoId && taskProjId && taskProjId === pMongoId) return true;
      if (pName && taskProjName && taskProjName === pName) return true;
      return false;
    });
  }, [tasks, activeProject]);

  const projectTeamMembers = useMemo(() => {
    if (!activeProject) return [];
    const memberMap = new Map();

    (activeProject.assignedEmployees || []).forEach(emp => {
      const eId = String(emp.userId?._id || emp.userId || emp._id || emp.id || '');
      if (eId) {
        memberMap.set(eId, {
          userId: eId,
          name: emp.name || emp.userId?.name || 'Team Member',
          role: emp.role || emp.userId?.role || 'Staff',
          email: emp.email || emp.userId?.email || '',
          avatar: emp.avatar || emp.userId?.avatar || '',
        });
      }
    });

    activeProjectTasks.forEach(task => {
      const assignees = Array.isArray(task.assignedTo) ? task.assignedTo : task.assignedTo ? [task.assignedTo] : [];
      assignees.forEach(assignee => {
        const uId = String(assignee?._id || assignee?.id || assignee || '');
        if (uId && !memberMap.has(uId)) {
          const found = users.find(u => String(u._id || u.id) === uId);
          memberMap.set(uId, {
            userId: uId,
            name: found?.name || assignee?.name || 'Team Member',
            role: found?.role || assignee?.role || 'Staff',
            email: found?.email || assignee?.email || '',
            avatar: found?.avatar || assignee?.avatar || '',
          });
        }
      });
    });

    return Array.from(memberMap.values());
  }, [activeProject, activeProjectTasks, users]);

  const filteredProjectTasks = useMemo(() => {
    if (taskStatusFilter === 'all') return activeProjectTasks;
    if (taskStatusFilter === 'completed') return activeProjectTasks.filter(t => t.status === 'done' || t.status === 'completed');
    if (taskStatusFilter === 'in_progress') return activeProjectTasks.filter(t => t.status === 'in_progress');
    if (taskStatusFilter === 'hold') return activeProjectTasks.filter(t => t.status === 'paused');
    if (taskStatusFilter === 'todo') return activeProjectTasks.filter(t => t.status === 'todo' || t.status === 'not_completed');
    return activeProjectTasks;
  }, [activeProjectTasks, taskStatusFilter]);

  const projectMetrics = useMemo(() => {
    const total = projects.length;
    const completed = projects.filter(p => p.status === 'completed').length;
    const inProgress = projects.filter(p => p.status === 'in_progress').length;
    const totalStaffAssigned = new Set();
    projects.forEach(p => {
      (p.assignedEmployees || []).forEach(e => {
        const id = e.userId?._id || e.userId || e._id;
        if (id) totalStaffAssigned.add(String(id));
      });
    });
    return { total, completed, inProgress, totalStaffAssigned: totalStaffAssigned.size };
  }, [projects]);

  return (
    <div className="emerald-theme space-y-6 w-full pb-10">
      <PageHeader
        icon={Building}
        title={isOwner || isAdmin ? 'Company Overview' : 'Company Details'}
        subtitle="Manage organizational profile, departmental capacity, terms, and policies."
      />

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 bg-secondary/60 p-1 rounded-2xl border border-border h-auto min-h-12 gap-1">
          <TabsTrigger value="dashboard" className="rounded-xl font-semibold data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-xs sm:text-sm py-2">Dashboard</TabsTrigger>
          <TabsTrigger value="projects" className="rounded-xl font-semibold data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-xs sm:text-sm py-2 flex items-center justify-center gap-1.5">
            <FolderKanban className="w-4 h-4" />
            <span>Projects ({projects.length})</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="rounded-xl font-semibold data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-xs sm:text-sm py-2">Profile</TabsTrigger>
          <TabsTrigger value="terms" className="rounded-xl font-semibold data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-xs sm:text-sm py-2">Terms & Conditions</TabsTrigger>
          <TabsTrigger value="policies" className="rounded-xl font-semibold data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-xs sm:text-sm py-2">Policies</TabsTrigger>
        </TabsList>
        
        <TabsContent value="dashboard" className="space-y-6 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs">
                <CardContent className="p-6 flex items-center gap-4">
                   <div className="p-3.5 rounded-2xl bg-primary/10 text-primary">
                      <Users2 className="w-6 h-6" />
                   </div>
                   <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Employees</p>
                      <h3 className="text-2xl font-semibold text-foreground mt-0.5">{ownerDepartments.reduce((sum, d) => sum + d.staff.length, 0)}</h3>
                   </div>
                </CardContent>
              </Card>
              <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs">
                <CardContent className="p-6 flex items-center gap-4">
                   <div className="p-3.5 rounded-2xl bg-primary/10 text-primary">
                      <Building className="w-6 h-6" />
                   </div>
                   <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Core Departments</p>
                      <h3 className="text-2xl font-semibold text-foreground mt-0.5">{ownerDepartments.length} Active</h3>
                   </div>
                </CardContent>
              </Card>
              <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs">
                <CardContent className="p-6 flex items-center gap-4">
                   <div className="p-3.5 rounded-2xl bg-primary/10 text-primary">
                      <TrendingUp className="w-6 h-6" />
                   </div>
                   <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Industry Segment</p>
                      <h3 className="text-xl font-semibold text-foreground truncate max-w-[140px] mt-0.5">{formData.about || formData.category || 'N/A'}</h3>
                   </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden">
              <CardHeader className="border-b border-border bg-card px-6 py-4">
                <CardTitle className="text-base font-medium flex items-center gap-2 text-foreground">
                  <LayoutDashboard className="w-5 h-5 text-primary" />
                  Department Health & Allocation
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {departmentCards.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">
                    No department data available. Please initialize staff records.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {departmentCards.map(dept => (
                      <div
                        key={dept.name}
                        className="border border-border rounded-2xl p-5 flex flex-col gap-3 bg-secondary/30 hover:border-primary/40 transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium tracking-normal text-foreground group-hover:text-primary transition-colors">{dept.name}</span>
                        </div>
                        <div className="space-y-2">
                           <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Resource Load</span>
                              <span className="font-bold text-foreground">{dept.totalStaff} Members</span>
                           </div>
                           <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                              <div className="bg-primary h-full rounded-full transition-all" style={{ width: '100%' }} />
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Company Assigned Projects Tab */}
          <TabsContent value="projects" className="space-y-6 mt-4">
            {/* KPI Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs">
                <CardContent className="p-4 sm:p-5 flex items-center gap-3.5">
                  <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                    <FolderKanban className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Total Projects</p>
                    <h3 className="text-xl sm:text-2xl font-bold text-foreground mt-0.5">{projectMetrics.total}</h3>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs">
                <CardContent className="p-4 sm:p-5 flex items-center gap-3.5">
                  <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Play className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">In Progress</p>
                    <h3 className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">{projectMetrics.inProgress}</h3>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs">
                <CardContent className="p-4 sm:p-5 flex items-center gap-3.5">
                  <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Completed</p>
                    <h3 className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{projectMetrics.completed}</h3>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs">
                <CardContent className="p-4 sm:p-5 flex items-center gap-3.5">
                  <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">People Working</p>
                    <h3 className="text-xl sm:text-2xl font-bold text-foreground mt-0.5">{projectMetrics.totalStaffAssigned}</h3>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filter & Search Bar - No Create Project Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-secondary/40 p-3 sm:p-4 rounded-2xl border border-border">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  placeholder="Search company projects by name or description..."
                  className="pl-9 h-10 rounded-xl bg-card border-border text-xs sm:text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Status:</span>
                  <select
                    value={projectStatusFilter}
                    onChange={(e) => setProjectStatusFilter(e.target.value)}
                    className="h-10 px-3 rounded-xl bg-card border border-border text-xs text-foreground font-medium focus:ring-1 focus:ring-primary outline-hidden"
                  >
                    <option value="all">All Projects</option>
                    <option value="in_progress">In Progress</option>
                    <option value="planning">Planning</option>
                    <option value="completed">Completed</option>
                    <option value="on_hold">On Hold</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Master-Detail Projects View */}
            {companyProjects.length === 0 ? (
              <Card className="border border-border bg-card rounded-2xl p-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted/60 text-muted-foreground mx-auto flex items-center justify-center mb-4">
                  <FolderKanban className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">No Projects Found</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  {projectSearch || projectStatusFilter !== 'all'
                    ? 'No company projects match your search or status filter.'
                    : 'There are currently no projects assigned in the company.'}
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Company Projects ({companyProjects.length})
                  </span>
                  <span className="text-xs text-muted-foreground">Click a project title to view its details</span>
                </div>

                <div className="space-y-3">
                  {companyProjects.map((p) => {
                    const pId = String(p._id || p.id);
                    const isExpanded = selectedProjectId === pId;

                    return (
                      <div
                        key={pId}
                        className={`border rounded-2xl overflow-hidden transition-all shadow-xs ${
                          isExpanded
                            ? 'border-primary ring-1 ring-primary/20 bg-card'
                            : 'border-border bg-card hover:border-primary/40'
                        }`}
                      >
                        {/* Project Title Row - Only Title Shows */}
                        <button
                          type="button"
                          onClick={() => setSelectedProjectId(prev => prev === pId ? null : pId)}
                          className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left transition-colors hover:bg-muted/30 cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                              isExpanded ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
                            }`}>
                              <FolderKanban className="w-4 h-4" />
                            </div>
                            <span className="text-sm sm:text-base font-bold text-foreground truncate">
                              {p.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground hidden sm:inline">
                              {isExpanded ? 'Hide Details' : 'View Details'}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-primary" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                        </button>

                        {/* Project Details - ONLY shown after clicking */}
                        {isExpanded && activeProject && (
                          <div className="border-t border-border p-5 sm:p-6 space-y-6 bg-secondary/10">
                            {/* Project Overview */}
                            <div className="space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge className={`capitalize font-semibold text-xs ${
                                    activeProject.status === 'completed'
                                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                      : activeProject.status === 'in_progress'
                                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20'
                                      : activeProject.status === 'on_hold'
                                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                      : 'bg-secondary text-muted-foreground'
                                  }`}>
                                    {activeProject.status === 'in_progress' ? 'In Progress' : activeProject.status === 'on_hold' ? 'On Hold' : activeProject.status || 'Active'}
                                  </Badge>
                                  {activeProject.priority && (
                                    <Badge variant="outline" className={`capitalize font-medium text-xs ${
                                      activeProject.priority === 'urgent' || activeProject.priority === 'high'
                                        ? 'text-red-500 border-red-500/30'
                                        : 'text-muted-foreground'
                                    }`}>
                                      {activeProject.priority} Priority
                                    </Badge>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {activeProject.startDate && (
                                    <span className="inline-flex items-center gap-1 bg-card px-2.5 py-1 rounded-xl border border-border">
                                      <Calendar className="w-3.5 h-3.5 text-primary" />
                                      Start: {format(new Date(activeProject.startDate), 'MMM d, yyyy')}
                                    </span>
                                  )}
                                  {activeProject.dueDate && (
                                    <span className="inline-flex items-center gap-1 bg-card px-2.5 py-1 rounded-xl border border-border">
                                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                                      Due: {format(new Date(activeProject.dueDate), 'MMM d, yyyy')}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {activeProject.description && (
                                <div className="pt-2 border-t border-border/60">
                                  <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                                    {extractVoiceNote(activeProject.description).text || activeProject.description}
                                  </p>
                                  {extractVoiceNote(activeProject.description).audioUrl && (
                                    <div className="mt-2">
                                      <VoiceNoteBadgePlayer audioUrl={extractVoiceNote(activeProject.description).audioUrl} />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* People Working On That Project Section */}
                            <Card className="border border-border bg-card rounded-2xl shadow-xs">
                              <CardHeader className="p-4 sm:p-5 border-b border-border flex flex-row items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                    <Users className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <CardTitle className="text-sm sm:text-base font-bold text-foreground">
                                      People Working on This Project
                                    </CardTitle>
                                    <p className="text-xs text-muted-foreground">
                                      {projectTeamMembers.length} team members assigned to project tasks
                                    </p>
                                  </div>
                                </div>
                                <Badge className="bg-primary/10 text-primary border-primary/20 font-bold px-3 py-1">
                                  {projectTeamMembers.length} Working
                                </Badge>
                              </CardHeader>

                              <CardContent className="p-4 sm:p-5">
                                {projectTeamMembers.length === 0 ? (
                                  <div className="text-center py-6 text-muted-foreground text-xs">
                                    No team members are assigned to this project yet.
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {projectTeamMembers.map((member) => {
                                      const mId = String(member.userId);
                                      const memberTasks = activeProjectTasks.filter(t => {
                                        const assignees = Array.isArray(t.assignedTo) ? t.assignedTo : t.assignedTo ? [t.assignedTo] : [];
                                        return assignees.some(a => String(a?._id || a?.id || a) === mId);
                                      });
                                      const memberCompleted = memberTasks.filter(t => t.status === 'done' || t.status === 'completed').length;

                                      return (
                                        <div
                                          key={mId}
                                          className="p-3 rounded-xl border border-border bg-secondary/20 flex items-center gap-3 hover:border-primary/30 transition-all"
                                        >
                                          <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                                            {member.avatar ? (
                                              <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" />
                                            ) : (
                                              (member.name || 'U').slice(0, 2).toUpperCase()
                                            )}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <h5 className="text-xs font-bold text-foreground truncate">{member.name}</h5>
                                            <p className="text-[11px] text-muted-foreground truncate capitalize">{member.role || 'Staff'}</p>
                                            <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-primary">
                                              <span>{memberTasks.length} Tasks</span>
                                              <span>•</span>
                                              <span className="text-emerald-600 dark:text-emerald-400">{memberCompleted} Done</span>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </CardContent>
                            </Card>

                            {/* Assigned Tasks & Execution Status Details */}
                            <Card className="border border-border bg-card rounded-2xl shadow-xs">
                              <CardHeader className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                    <Briefcase className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <CardTitle className="text-sm sm:text-base font-bold text-foreground">
                                      Assigned Project Tasks
                                    </CardTitle>
                                    <p className="text-xs text-muted-foreground">
                                      Showing {filteredProjectTasks.length} of {activeProjectTasks.length} tasks
                                    </p>
                                  </div>
                                </div>

                                {/* Task Status Filter Selector */}
                                <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-xl border border-border overflow-x-auto">
                                  {[
                                    { key: 'all', label: 'All' },
                                    { key: 'in_progress', label: 'In Progress' },
                                    { key: 'hold', label: 'On Hold' },
                                    { key: 'completed', label: 'Completed' },
                                    { key: 'todo', label: 'To Do' },
                                  ].map((tab) => (
                                    <button
                                      key={tab.key}
                                      onClick={() => setTaskStatusFilter(tab.key)}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                                        taskStatusFilter === tab.key
                                          ? 'bg-primary text-white shadow-xs'
                                          : 'text-muted-foreground hover:text-foreground'
                                      }`}
                                    >
                                      {tab.label}
                                    </button>
                                  ))}
                                </div>
                              </CardHeader>

                              <CardContent className="p-4 sm:p-5 space-y-3">
                                {filteredProjectTasks.length === 0 ? (
                                  <div className="text-center py-10 text-muted-foreground text-xs">
                                    No tasks match the selected status filter in this project.
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {filteredProjectTasks.map((task) => {
                                      const isDone = task.status === 'done' || task.status === 'completed';
                                      const isInProgress = task.status === 'in_progress';
                                      const isHold = task.status === 'paused';
                                      const { text: cleanDesc, audioUrl } = extractVoiceNote(task.description || '');

                                      const assignees = Array.isArray(task.assignedTo) ? task.assignedTo : task.assignedTo ? [task.assignedTo] : [];

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
                                              : 'bg-card border-border'
                                          }`}
                                        >
                                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 mb-2">
                                            <div className="space-y-1">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <h5 className="text-sm font-bold text-foreground">{task.title}</h5>
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
                                                <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                                                  {cleanDesc}
                                                </p>
                                              )}

                                              {audioUrl && (
                                                <div className="pt-1">
                                                  <VoiceNoteBadgePlayer audioUrl={audioUrl} />
                                                </div>
                                              )}
                                            </div>

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
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full border border-border">
                                                  <Clock className="w-3.5 h-3.5" />
                                                  To Do
                                                </span>
                                              )}
                                            </div>
                                          </div>

                                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 mt-2 border-t border-border/60">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="text-[11px] font-medium text-muted-foreground">Assigned to:</span>
                                              {assignees.length === 0 ? (
                                                <span className="text-[11px] text-muted-foreground italic">Unassigned</span>
                                              ) : (
                                                assignees.map((a, idx) => {
                                                  const aName = a?.name || (typeof a === 'string' ? users.find(u => String(u._id || u.id) === a)?.name : 'Member') || 'Member';
                                                  return (
                                                    <span key={idx} className="inline-flex items-center gap-1 text-[11px] font-medium bg-secondary/60 px-2 py-0.5 rounded-lg border border-border">
                                                      <User className="w-3 h-3 text-primary" />
                                                      {aName}
                                                    </span>
                                                  );
                                                })
                                              )}
                                            </div>

                                            <div className="flex items-center gap-2 text-xs">
                                              {isDone ? (
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
                                                  <Check className="w-3.5 h-3.5" />
                                                  <span>
                                                    Completed on: {format(new Date(task.completedAt || task.updatedAt || Date.now()), 'MMM d, yyyy · h:mm a')}
                                                  </span>
                                                </div>
                                              ) : (
                                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
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
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>
        
        <TabsContent value="profile" className="space-y-6 mt-4">
          {hasUserRole(userProfile, 'param') && companies.length > 1 && (
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Managed Companies ({companies.length})</Label>
              <div className="flex flex-wrap gap-3">
                {companies.map(co => (
                  <button
                    key={co._id}
                    onClick={() => setSelectedCompanyId(co._id)}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border transition-all ${
                      selectedCompanyId === co._id 
                      ? 'bg-primary/10 border-primary text-primary ring-1 ring-primary/20' 
                      : 'bg-muted/40 border-border text-muted-foreground hover:border-muted-foreground/30'
                    }`}
                  >
                    <Building className={`w-4 h-4 ${selectedCompanyId === co._id ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-sm font-semibold">{co.name}</span>
                    {selectedCompanyId === co._id && <Check className="w-3.5 h-3.5 ml-1" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="border-b border-border bg-card px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2.5 text-foreground">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Core Business Profile
              </CardTitle>
              {(isAdmin || isOwner) && currentCompany && (
                <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
                  <Button
                    type="button"
                    onClick={() => setIsOfficeMapOpen(true)}
                    variant="outline"
                    size="sm"
                    className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-semibold rounded-xl shadow-xs px-3.5 h-9 transition-all flex items-center gap-1.5"
                  >
                    <MapPin className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Set Office Location</span>
                  </Button>
                  <Button onClick={handleSubmit} disabled={updateCompany.isPending} size="sm" className="bg-primary hover:bg-[#0F766E] text-white font-semibold rounded-xl shadow-xs px-4 h-9 transition-all w-full sm:w-auto">
                    {updateCompany.isPending ? 'Saving...' : 'Update Company'}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 p-4 sm:p-6">
                {/* Office Attendance Geofence Status Card */}
                <div className="md:col-span-2 p-4 rounded-2xl border border-border bg-secondary/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-emerald-500" />
                        Office Attendance Geofence (5 Metres)
                      </span>
                      {currentCompany?.officeLocation?.latitude != null ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          Active · 5m Radius
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                          Location Not Configured
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {currentCompany?.officeLocation?.latitude != null
                        ? `Saved Office: ${currentCompany.officeLocation.latitude.toFixed(6)}, ${currentCompany.officeLocation.longitude.toFixed(6)}${currentCompany.officeLocation.address ? ` (${currentCompany.officeLocation.address})` : ''}`
                        : 'Staff cannot perform attendance actions (check-in, check-out, breaks) until office coordinates are set.'}
                    </p>
                  </div>
                  {(isAdmin || isOwner) && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setIsOfficeMapOpen(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs h-8.5 px-3.5 shrink-0 flex items-center gap-1.5 shadow-sm"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{currentCompany?.officeLocation?.latitude != null ? 'Update Office Location' : 'Set Office Location'}</span>
                    </Button>
                  )}
                </div>
                {/* Company Logo / Profile Picture (Mandatory) */}
                <div className="md:col-span-2 flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-2xl bg-secondary/20 border-border/80 hover:border-primary/50 transition-colors">
                  <div 
                    onClick={() => (isAdmin || isOwner) && logoFileInputRef.current?.click()}
                    className={`relative group flex flex-col items-center gap-2.5 ${(isAdmin || isOwner) ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <div className={`w-24 h-24 rounded-2xl overflow-hidden border-2 flex items-center justify-center bg-card shadow-sm ${formData.logo ? 'border-primary' : 'border-destructive/60'}`}>
                      {formData.logo ? (
                        <img src={formData.logo} alt="Company Logo" className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-muted-foreground p-2 text-center">
                          <Building className="w-8 h-8 text-destructive/80 mb-1" />
                          <span className="text-[10px] font-bold text-destructive">Logo Required *</span>
                        </div>
                      )}
                    </div>
                    {(isAdmin || isOwner) && (
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{formData.logo ? 'Change Company Logo *' : 'Upload Company Logo * (Mandatory)'}</span>
                      </div>
                    )}
                    <input 
                      type="file" 
                      ref={logoFileInputRef} 
                      className="hidden" 
                      accept="image/*" 
                      onChange={handleLogoUpload} 
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground mt-1.5">Company logo is mandatory and will be displayed across the workspace.</span>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs font-semibold text-foreground">Company Name *</Label>
                    <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="ReGen Innovations Inc."
                        className="rounded-xl border border-border bg-background text-foreground"
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="ownerName" className="text-xs font-semibold text-foreground">Company Owner Name *</Label>
                    <Input
                        id="ownerName"
                        value={formData.ownerName}
                        onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                        placeholder="e.g. Ramesh Kumar"
                        className="rounded-xl border border-border bg-background text-foreground"
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
                 <div className="space-y-1.5">
                    <Label htmlFor="address" className="text-xs font-semibold text-foreground">Registered Address</Label>
                    <Input
                        id="address"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder="123 Enterprise Drive, Suite 400..."
                        className="rounded-xl border border-border bg-background text-foreground"
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="city" className="text-xs font-semibold text-foreground">City *</Label>
                    <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        placeholder="Innovation City"
                        className="rounded-xl border border-border bg-background text-foreground"
                        disabled={!isAdmin && !isOwner}
                        required
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="state" className="text-xs font-semibold text-foreground">State</Label>
                    <Input
                        id="state"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        placeholder="California"
                        className="rounded-xl border border-border bg-background text-foreground"
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="zip" className="text-xs font-semibold text-foreground">ZIP Code</Label>
                    <Input
                        id="zip"
                        value={formData.zip}
                        onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                        placeholder="90001"
                        className="rounded-xl border border-border bg-background text-foreground"
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="about" className="text-xs font-semibold text-foreground">About / Category</Label>
                    <Input
                        id="about"
                        value={formData.about}
                        onChange={(e) => setFormData({ ...formData, about: e.target.value })}
                        placeholder="IT Solutions, Manufacturing, etc."
                        className="rounded-xl border border-border bg-background text-foreground"
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="establishmentYear" className="text-xs font-semibold text-foreground">Company Started / Establishment Year</Label>
                    <Input
                        id="establishmentYear"
                        type="number"
                        min="1970"
                        max={new Date().getFullYear()}
                        value={formData.establishmentYear}
                        onChange={(e) => setFormData({ ...formData, establishmentYear: e.target.value })}
                        placeholder="e.g. 2008"
                        className="rounded-xl border border-border bg-background text-foreground font-semibold"
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-semibold text-foreground">Contact Email</Label>
                    <Input
                        id="email"
                        value={formData.contactEmail}
                        onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                        placeholder="contact@regen.com"
                        className="rounded-xl border border-border bg-background text-foreground"
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs font-semibold text-foreground">Contact Phone</Label>
                    <Input
                        id="phone"
                        value={formData.contactPhone}
                        onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                        placeholder="+1 (555) 123-4567"
                        className="rounded-xl border border-border bg-background text-foreground"
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="gst" className="text-xs font-semibold text-foreground">GST/VAT Identification Number</Label>
                    <div className="flex gap-2">
                      <Input
                          id="gst"
                          value={formData.gst}
                          onChange={(e) => setFormData({ ...formData, gst: e.target.value })}
                          placeholder="GSTIN..."
                          className="rounded-xl border border-border bg-background text-foreground"
                          disabled={!isAdmin && !isOwner}
                      />
                      {(isAdmin || isOwner) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleGstAutofill}
                          className="rounded-xl border border-border bg-secondary hover:bg-secondary/80 text-foreground font-semibold px-4"
                        >
                          Fetch
                        </Button>
                      )}
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="tax" className="text-xs font-semibold text-foreground">Tax Identification Number</Label>
                    <Input
                        id="tax"
                        value={formData.taxDetails}
                        onChange={(e) => setFormData({ ...formData, taxDetails: e.target.value })}
                        placeholder="TX-1234567..."
                        className="rounded-xl border border-border bg-background text-foreground"
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="terms" className="space-y-4 mt-4">
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="border-b border-border bg-card px-6 py-4">
              <CardTitle className="text-base font-bold text-foreground">Terms and Conditions</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
                <Textarea
                  value={formData.policies}
                  onChange={(e) => setFormData({ ...formData, policies: e.target.value })}
                  placeholder="Welcome to ReGen Innovations Inc. Our Terms and Conditions..."
                  className="min-h-[400px] font-light text-sm leading-relaxed rounded-xl border border-border bg-background text-foreground"
                  disabled={!isAdmin && !isOwner}
                />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="space-y-4 mt-4">
          <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">Company Policies</h3>
                <p className="text-xs text-muted-foreground">Internal policies, guidelines, and compliance documents</p>
              </div>
              {(isAdmin || isOwner) && (
                <Button size="sm" className="bg-primary hover:bg-[#0F766E] text-white font-semibold rounded-xl shadow-xs px-4 h-9 transition-all" onClick={() => setPolicyForm({ title: '', content: '', effectiveDate: new Date().toISOString().slice(0, 10) })}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add New Policy
                </Button>
              )}
          </div>

          {/* Add / Edit Policy Form */}
          {policyForm && (isAdmin || isOwner) && (
            <Card className="border border-primary/30 bg-card rounded-2xl shadow-md overflow-hidden">
              <CardHeader className="border-b border-border bg-card px-6 py-3">
                <CardTitle className="text-base font-bold text-foreground">{editingPolicyIdx !== null ? 'Edit Policy' : 'New Policy'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">Policy Title *</Label>
                    <Input value={policyForm.title} onChange={e => setPolicyForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Remote Work Policy" className="rounded-xl border border-border bg-background text-foreground" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">Effective Date</Label>
                    <Input type="date" value={policyForm.effectiveDate} onChange={e => setPolicyForm(f => ({ ...f, effectiveDate: e.target.value }))} className="rounded-xl border border-border bg-background text-foreground" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Policy Content *</Label>
                  <Textarea value={policyForm.content} onChange={e => setPolicyForm(f => ({ ...f, content: e.target.value }))} placeholder="Describe the policy details..." className="min-h-[120px] rounded-xl border border-border bg-background text-foreground" />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="ghost" size="sm" onClick={() => { setPolicyForm(null); setEditingPolicyIdx(null); }} className="rounded-xl hover:bg-secondary">
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleSavePolicy} disabled={savingPolicy} className="bg-primary hover:bg-[#0F766E] text-white font-semibold rounded-xl shadow-xs px-4 h-9">
                    <Save className="h-4 w-4 mr-1" /> {savingPolicy ? 'Saving...' : 'Save Policy'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Policy List */}
          <Card className="border border-border bg-card rounded-2xl shadow-xs overflow-hidden">
            <CardContent className="p-0">
              {(!currentCompany?.companyPolicies || currentCompany.companyPolicies.length === 0) ? (
                <div className="py-12 text-center text-muted-foreground">
                  <FileText className="mx-auto h-10 w-10 mb-3 text-primary/40" />
                  <p className="text-sm font-medium">No policies added yet.</p>
                  {(isAdmin || isOwner) && <p className="text-xs mt-1">Click "Add New Policy" to create one.</p>}
                </div>
              ) : (
                <Accordion type="single" collapsible className="w-full">
                  {currentCompany.companyPolicies.map((policy, idx) => (
                    <AccordionItem key={policy._id || idx} value={`policy-${idx}`} className={`px-6 border-b border-border/60 ${idx === currentCompany.companyPolicies.length - 1 ? 'border-b-0' : ''}`}>
                      <AccordionTrigger className="hover:no-underline py-4">
                        <div className="flex items-center justify-between w-full pr-2">
                          <div className="text-left">
                            <div className="font-semibold text-foreground">{policy.title}</div>
                            <div className="text-xs text-muted-foreground font-normal mt-1">
                              {policy.effectiveDate ? `Effective: ${new Date(policy.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}` : ''}
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <div className="text-foreground/90 whitespace-pre-wrap text-sm leading-relaxed">{policy.content}</div>
                        {(isAdmin || isOwner) && (
                          <div className="flex gap-2 mt-4 pt-3 border-t border-border">
                            <Button variant="outline" size="sm" onClick={() => handleEditPolicy(idx)} className="rounded-xl border border-border hover:bg-secondary">
                              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                            </Button>
                            <Button variant="outline" size="sm" className="rounded-xl text-destructive border-destructive/20 hover:bg-destructive/10" onClick={() => handleDeletePolicy(idx)}>
                              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                            </Button>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>

          {/* Employee Policy Responses & Owner Review Section */}
          {(isAdmin || isOwner) && (
            <Card className="border border-border bg-card rounded-2xl shadow-xs overflow-hidden mt-6">
              <CardHeader className="border-b border-border bg-card px-6 py-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    <span>Employee Policy Responses & Exemption Review</span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Review which employees have accepted policies, view reasons for declined policies, and allow them to work forward.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20">
                    {policyReviews.filter(r => r.status === 'declined').length} Declined (Restricted)
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    {policyReviews.filter(r => r.status === 'accepted').length} Accepted
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {policyReviews.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-xs">
                    No employee responses recorded yet. When employees receive and respond to policies, their statuses will appear here.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                          <th className="text-left py-3 px-4">Employee</th>
                          <th className="text-left py-3 px-4">Policy</th>
                          <th className="text-left py-3 px-4">Status</th>
                          <th className="text-left py-3 px-4">Decline Reason / Notes</th>
                          <th className="text-right py-3 px-4">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {policyReviews.map((ack) => {
                          const isDeclined = ack.status === 'declined';
                          const isAllowed = ack.status === 'allowed';
                          const isAccepted = ack.status === 'accepted';

                          return (
                            <tr key={ack._id} className={cn("hover:bg-muted/30 transition-colors", isDeclined && "bg-rose-50/40 dark:bg-rose-950/20")}>
                              <td className="py-3 px-4">
                                <div className="font-bold text-foreground">{ack.userName || ack.userId}</div>
                                <div className="text-[11px] text-muted-foreground">{ack.department || 'Staff'} • {ack.userId}</div>
                              </td>
                              <td className="py-3 px-4 font-medium text-foreground">
                                {ack.policyTitle}
                              </td>
                              <td className="py-3 px-4">
                                <span className={cn(
                                  "px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border",
                                  isAccepted
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                    : isDeclined
                                    ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
                                    : isAllowed
                                    ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30"
                                    : "bg-muted text-muted-foreground border-border"
                                )}>
                                  {isDeclined ? 'Declined (Blocked)' : isAllowed ? 'Allowed to Work' : isAccepted ? 'Accepted' : 'Pending'}
                                </span>
                              </td>
                              <td className="py-3 px-4 max-w-xs">
                                {isDeclined && (
                                  <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300/40 text-rose-900 dark:text-rose-200 text-xs italic">
                                    "{ack.declineReason || 'No reason specified'}"
                                  </div>
                                )}
                                {isAllowed && (
                                  <div className="text-[11px] text-teal-700 dark:text-teal-300 font-medium">
                                    Exemption approved by {ack.allowedBy || 'Owner'}
                                  </div>
                                )}
                                {!isDeclined && !isAllowed && (
                                  <span className="text-muted-foreground/60 text-[11px]">—</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {isDeclined && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleAllowEmployee(ack._id, ack.userName)}
                                    disabled={allowMutation.isPending}
                                    className="bg-primary hover:bg-[#0F766E] text-white text-xs h-8 px-3 rounded-xl shadow-xs gap-1"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Allow to Work</span>
                                  </Button>
                                )}
                                {isAllowed && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-600 dark:text-teal-400">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Active
                                  </span>
                                )}
                                {isAccepted && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Working Normal
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <OfficeLocationMapModal
        isOpen={isOfficeMapOpen}
        onClose={() => setIsOfficeMapOpen(false)}
        companyId={currentCompany?._id || selectedCompanyId}
        companyName={currentCompany?.name || formData.name}
        initialLocation={currentCompany?.officeLocation}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['companies'] });
          queryClient.invalidateQueries({ queryKey: ['companyInfo'] });
        }}
      />
    </div>
  );
}
