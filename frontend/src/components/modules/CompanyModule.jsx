import { useMemo, useState, useEffect } from 'react';
import { useGetCompanyInfo, useGetAllCompanies, useCreateCompany, useUpdateCompany, useGetAllUsers } from '../../hooks/useQueries';
import { hasUserRole, getUserRoleKey } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Plus,
  LayoutDashboard,
  Building,
  Users2,
  TrendingUp,
  MapPin,
  Check,
  ChevronRight,
  ShieldCheck,
  Trash2,
  Pencil,
  FileText,
  X,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  const { data: initialInfo } = useGetCompanyInfo();
  const { data: companies = [] } = useGetAllCompanies();
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const { data: users = [] } = useGetAllUsers();

  const [selectedCompanyId, setSelectedCompanyId] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
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
      setFormData({
        name: info.name || '',
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
      });
    } else {
       setFormData({
        name: '', address: '', city: '', state: '', zip: '',
        category: '', about: '', contactEmail: '', contactPhone: '',
        gst: '', taxDetails: '', policies: DEFAULT_TERMS,
      });
    }
  }, [currentCompany, initialInfo]);

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

      const info = {
        name: formData.name,
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

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <h2 className="text-2xl font-bold">
        {isOwner || isAdmin ? 'Company Overview' : 'Company Details'}
      </h2>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="terms">Terms & Conditions</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
        </TabsList>
        
        <TabsContent value="dashboard" className="space-y-6 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-primary/5 border-primary/10">
                <CardContent className="p-6 flex items-center gap-4">
                   <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                      <Users2 className="w-6 h-6" />
                   </div>
                   <div>
                      <p className="text-sm text-muted-foreground font-medium">Total Employees</p>
                      <h3 className="text-2xl font-bold">{ownerDepartments.reduce((sum, d) => sum + d.staff.length, 0)}</h3>
                   </div>
                </CardContent>
              </Card>
              <Card className="bg-blue-500/5 border-blue-500/10">
                <CardContent className="p-6 flex items-center gap-4">
                   <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500">
                      <Building className="w-6 h-6" />
                   </div>
                   <div>
                      <p className="text-sm text-muted-foreground font-medium">Core Departments</p>
                      <h3 className="text-2xl font-bold">{ownerDepartments.length} Active</h3>
                   </div>
                </CardContent>
              </Card>
              <Card className="bg-emerald-500/5 border-emerald-500/10">
                <CardContent className="p-6 flex items-center gap-4">
                   <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500">
                      <TrendingUp className="w-6 h-6" />
                   </div>
                   <div>
                      <p className="text-sm text-muted-foreground font-medium">Industry Segment</p>
                      <h3 className="text-xl font-bold truncate max-w-[120px]">{formData.about || formData.category || 'N/A'}</h3>
                   </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <LayoutDashboard className="w-5 h-5 text-muted-foreground" />
                  Department Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                {departmentCards.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">
                    No department data available. Please initialize staff records.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {departmentCards.map(dept => (
                      <div
                        key={dept.name}
                        className="border border-border rounded-2xl p-5 flex flex-col gap-3 bg-muted/30 hover:bg-muted/50 transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold tracking-tight group-hover:text-primary transition-colors">{dept.name}</span>
                        </div>
                        <div className="space-y-2">
                           <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Resource Load</span>
                              <span className="font-bold">{dept.totalStaff} Members</span>
                           </div>
                           <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                              <div className="bg-primary h-full rounded-full" style={{ width: '100%' }} />
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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

          <Card>
            <CardHeader className="border-b border-border pb-4 flex flex-row items-center justify-between">
              <CardTitle className="text-xl flex items-center gap-3 uppercase tracking-tight">
                <ShieldCheck className="w-6 h-6 text-primary" />
                Core Business Profile
              </CardTitle>
              {(isAdmin || isOwner) && currentCompany && (
                <Button onClick={handleSubmit} disabled={updateCompany.isPending} size="sm">
                  {updateCompany.isPending ? 'Saving...' : 'Update Company'}
                </Button>
              )}
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                <div className="space-y-2">
                    <Label htmlFor="name">Company Name</Label>
                    <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="reGen Innovations Inc."
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="address">Registered Address</Label>
                    <Input
                        id="address"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder="123 Enterprise Drive, Suite 400..."
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        placeholder="Innovation City"
                        disabled={!isAdmin && !isOwner}
                        required
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                        id="state"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        placeholder="California"
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="zip">ZIP Code</Label>
                    <Input
                        id="zip"
                        value={formData.zip}
                        onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                        placeholder="90001"
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
                <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="about">About / Category</Label>
                    <Input
                        id="about"
                        value={formData.about}
                        onChange={(e) => setFormData({ ...formData, about: e.target.value })}
                        placeholder="IT Solutions, Manufacturing, etc."
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="email">Contact Email</Label>
                    <Input
                        id="email"
                        value={formData.contactEmail}
                        onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                        placeholder="contact@regen.com"
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="phone">Contact Phone</Label>
                    <Input
                        id="phone"
                        value={formData.contactPhone}
                        onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                        placeholder="+1 (555) 123-4567"
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="gst">GST/VAT Identification Number</Label>
                    <div className="flex gap-2">
                      <Input
                          id="gst"
                          value={formData.gst}
                          onChange={(e) => setFormData({ ...formData, gst: e.target.value })}
                          placeholder="GSTIN..."
                          disabled={!isAdmin && !isOwner}
                      />
                      {(isAdmin || isOwner) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleGstAutofill}
                        >
                          Fetch
                        </Button>
                      )}
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="tax">Tax Identification Number</Label>
                    <Input
                        id="tax"
                        value={formData.taxDetails}
                        onChange={(e) => setFormData({ ...formData, taxDetails: e.target.value })}
                        placeholder="TX-1234567..."
                        disabled={!isAdmin && !isOwner}
                    />
                </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="terms" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Terms and Conditions</CardTitle>
            </CardHeader>
            <CardContent>
                <Textarea
                  value={formData.policies}
                  onChange={(e) => setFormData({ ...formData, policies: e.target.value })}
                  placeholder="Welcome to reGen Innovations Inc. Our Terms and Conditions..."
                  className="min-h-[400px] font-light text-sm leading-relaxed"
                  disabled={!isAdmin && !isOwner}
                />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="space-y-4 mt-4">
          <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Company Policies</h3>
              {(isAdmin || isOwner) && (
                <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-400" onClick={() => setPolicyForm({ title: '', content: '', effectiveDate: new Date().toISOString().slice(0, 10) })}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add New Policy
                </Button>
              )}
          </div>

          {/* Add / Edit Policy Form */}
          {policyForm && (isAdmin || isOwner) && (
            <Card className="border-blue-200 dark:border-blue-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{editingPolicyIdx !== null ? 'Edit Policy' : 'New Policy'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Policy Title *</Label>
                    <Input value={policyForm.title} onChange={e => setPolicyForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Remote Work Policy" />
                  </div>
                  <div className="space-y-2">
                    <Label>Effective Date</Label>
                    <Input type="date" value={policyForm.effectiveDate} onChange={e => setPolicyForm(f => ({ ...f, effectiveDate: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Policy Content *</Label>
                  <Textarea value={policyForm.content} onChange={e => setPolicyForm(f => ({ ...f, content: e.target.value }))} placeholder="Describe the policy details..." className="min-h-[120px]" />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setPolicyForm(null); setEditingPolicyIdx(null); }}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleSavePolicy} disabled={savingPolicy}>
                    <Save className="h-4 w-4 mr-1" /> {savingPolicy ? 'Saving...' : 'Save Policy'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Policy List */}
          <Card>
            <CardContent className="p-0">
              {(!currentCompany?.companyPolicies || currentCompany.companyPolicies.length === 0) ? (
                <div className="py-12 text-center text-muted-foreground">
                  <FileText className="mx-auto h-10 w-10 mb-3 opacity-40" />
                  <p className="text-sm">No policies added yet.</p>
                  {(isAdmin || isOwner) && <p className="text-xs mt-1">Click "Add New Policy" to create one.</p>}
                </div>
              ) : (
                <Accordion type="single" collapsible className="w-full">
                  {currentCompany.companyPolicies.map((policy, idx) => (
                    <AccordionItem key={policy._id || idx} value={`policy-${idx}`} className={`px-6 ${idx === currentCompany.companyPolicies.length - 1 ? 'border-b-0' : ''}`}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center justify-between w-full pr-2">
                          <div className="text-left">
                            <div className="font-medium">{policy.title}</div>
                            <div className="text-xs text-muted-foreground font-normal mt-1">
                              {policy.effectiveDate ? `Effective: ${new Date(policy.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}` : ''}
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="text-muted-foreground whitespace-pre-wrap text-sm">{policy.content}</div>
                        {(isAdmin || isOwner) && (
                          <div className="flex gap-2 mt-4 pt-3 border-t">
                            <Button variant="outline" size="sm" onClick={() => handleEditPolicy(idx)}>
                              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                            </Button>
                            <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950" onClick={() => handleDeletePolicy(idx)}>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
