import { useState } from 'react';
import { useGetAllUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../../hooks/useQueries';
import { authFetch, cn, hasUserRole, getUserRoleKey } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Camera, KeyRound, Filter, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Principal } from '@dfinity/principal';
import { Ed25519KeyIdentity } from '@dfinity/identity';
import { useIsMobile } from '../../hooks/use-mobile';

export default function UsersModule({ userProfile }) {
  const { data: users = [], isLoading } = useGetAllUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    principalId: '',
    username: '',
    password: '1234',
    aadhaar: '',
    firstName: '',
    lastName: '',
    department: '',
    designation: '',
    salary: '',
    role: 'staff',
    avatar: '',
    joiningDate: '',
    dateOfBirth: '',
    gender: '',
    address: '',
    phone: '',
  });

  const [previewUrl, setPreviewUrl] = useState('');
  const [filterRole, setFilterRole] = useState('all');

  const isMobile = useIsMobile();

  // Role styling config - Emerald + Graphite
  const roleBadgeStyles = {
    param:      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25 font-semibold',
    owner:      'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25 font-semibold',
    admin:      'bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6] border-[#0D9488]/25 font-semibold',
    staff:      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25 font-semibold',
    intern:     'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25 font-semibold',
    freelancer: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/25 font-semibold',
  };
  const roleOrder = { param: 0, owner: 1, admin: 2, staff: 3, intern: 4, freelancer: 5 };
  const getRoleKey = (user) => getUserRoleKey(user);
  const getRoleBadge = (roleKey) => roleBadgeStyles[roleKey] || roleBadgeStyles.staff;

  const isAdmin = hasUserRole(userProfile, 'admin');
  const isOwner = hasUserRole(userProfile, 'owner') || hasUserRole(userProfile, 'param');
  const toIdText = (val) => (typeof val === 'string' ? val : (val?.toText ? val.toText() : String(val || '')));
  
  // Gender-aware avatar generator (mirrors backend logic)
  const getGenderAvatar = (gender, seed) => {
    const safeSeed = encodeURIComponent(String(seed || 'user').slice(0, 30));
    const g = String(gender || '').toLowerCase();
    if (g === 'male') {
      return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeSeed}&gender=male&top=shortHair,dreads,frizzle,shaggyMane,shortCurly,shortFlat,shortRound&accessories=prescription01,prescription02,kurt,round,sunglasses&facialHair=beardMedium,beardLight,beardMagestic&facialHairProbability=60`;
    }
    if (g === 'female') {
      return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeSeed}&gender=female&top=longHair,bigHair,bun,curly,curvy,dreads,frida,fro,froAndBand,miaWallace,shavedSides,straight01,straight02,straightAndStrand&facialHairProbability=0`;
    }
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeSeed}`;
  };

  const getAvatarFallback = (user) => getGenderAvatar(user?.gender, user?.username || user?.name || 'user');

  // Access Control: Only Admin and Owner can access
  if (!isAdmin && !isOwner) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">You don't have permission to access this module.</p>
        </CardContent>
      </Card>
    );
  }

  // Filter users based on access + active filter, then sort
  const visibleUsers = users
    .filter(user => {
      if (isAdmin) return true;
      if (isOwner) return ['staff','intern','freelancer','admin','owner','param'].some(r => hasUserRole(user, r));
      return false;
    })
    .filter(user => filterRole === 'all' || getRoleKey(user) === filterRole)
    .sort((a, b) => {
      const ra = roleOrder[getRoleKey(a)] ?? 99;
      const rb = roleOrder[getRoleKey(b)] ?? 99;
      if (ra !== rb) return ra - rb;
      return (a.name || a.username || '').localeCompare(b.name || b.username || '');
    });

  // Count users per role for filter badges
  const roleCounts = users.reduce((acc, user) => {
    if (isAdmin || (isOwner && ['staff','intern','freelancer','admin','owner','param'].some(r => hasUserRole(user, r)))) {
      const rk = getRoleKey(user);
      acc[rk] = (acc[rk] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
    }
    return acc;
  }, { all: 0 });

  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: 'owner', label: 'Owner' },
    { value: 'admin', label: 'Admin' },
    { value: 'staff', label: 'Staff' },
    { value: 'intern', label: 'Intern' },
    { value: 'freelancer', label: 'Freelancer' },
  ].filter(opt => opt.value === 'all' || (roleCounts[opt.value] || 0) > 0);

  // Role Options based on current user role
  const roleOptions = [
    { value: 'staff', label: 'Staff' },
    { value: 'intern', label: 'Intern' },
    { value: 'freelancer', label: 'Freelancer' },
    { value: 'owner', label: 'Owner' },
    { value: 'admin', label: 'Admin' },
  ];

  const computeAge = (dateOfBirth) => {
    if (!dateOfBirth) return null;
    const dob = new Date(`${dateOfBirth}T00:00:00`);
    if (Number.isNaN(dob.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
    return age;
  };

  const formatSalary = (val) => {
    if (!val && val !== 0) return '--';
    const num = Number(String(val).replace(/[^0-9.-]+/g, ''));
    if (isNaN(num)) return `₹${val}`;
    return `₹${num.toLocaleString('en-IN')}`;
  };

  const formatDisplayDate = (dStr) => {
    if (!dStr) return '--';
    try {
      const d = new Date(dStr + (dStr.includes('T') ? '' : 'T00:00:00'));
      if (isNaN(d.getTime())) return dStr;
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dStr;
    }
  };

  // Aadhaar helpers
  const formatAadhaar = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 12);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  };
  const isValidAadhaar = (value) => {
    const digits = value.replace(/\D/g, '');
    return digits.length === 12 && !/^[01]/.test(digits);
  };

  const normalizeDateForInput = (value) => {
    if (!value) return '';
    const s = String(value).trim();
    if (!s) return '';
    const isoMatch = s.match(/^(\d{4})\D(\d{2})\D(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const dmyMatch = s.match(/^(\d{2})\D(\d{2})\D(\d{4})$/);
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return '';
  };

  const handleGenerateResetLink = async (user) => {
    try {
      const confirmed = window.confirm(`Reset password for "${user.name || user.username}" to default (1234)?`);
      if (!confirmed) return;
      const adminId = userProfile.username || localStorage.getItem('current_user') || toIdText(userProfile.id || userProfile.userId);
      const targetIdentifier = toIdText(user.userId || user.id || user.username);
      const res = await authFetch('/api/auth/admin-reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetIdentifier })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to reset password' }));
        throw new Error(err.message || 'Failed to reset password');
      }
      const data = await res.json();
      toast.success(data.message || 'Password reset successfully');
    } catch (e) {
      toast.error(e.message || 'Failed to reset password');
    }
  };

  const handleOpenDialog = (user) => {
    if (user) {
      setEditingUser(user);
      const fullName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim();
      const [fn, ...rest] = (fullName || '').split(' ');
      const ln = rest.join(' ');
      setFormData({
        principalId: user.userId?.toText ? user.userId.toText() : (user.userId ? String(user.userId) : (user.id?.toText ? user.id.toText() : String(user.id))),
        username: user.username,
        password: '',
        aadhaar: user.aadhaar || '',
        firstName: fn || '',
        lastName: ln || '',
        department: user.department || '',
        designation: user.designation || '',
        salary: user.salary?.toString() || '',
        role: typeof user.role === 'string' ? user.role : Object.keys(user.role)[0],
        avatar: user.avatar || '',
        joiningDate: normalizeDateForInput(user.joiningDate),
        dateOfBirth: normalizeDateForInput(user.dateOfBirth),
        gender: user.gender || '',
        address: user.address || '',
        phone: user.phone || '',
      });
      setPreviewUrl(user.avatar || '');
    } else {
      setEditingUser(null);
      setFormData({
        principalId: '',
        username: '',
        password: '1234',
        aadhaar: '',
        firstName: '',
        lastName: '',
        department: '',
        designation: '',
        salary: '',
        role: 'staff',
        avatar: '',
        joiningDate: '',
        dateOfBirth: '',
        gender: '',
        address: '',
        phone: '',
      });
      setPreviewUrl(''); // will show Camera icon until gender selected
    }
    setIsDialogOpen(true);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) {
        toast.error('Image size should be less than 4MB');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        setFormData(prev => ({ ...prev, avatar: result }));
        setPreviewUrl(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!editingUser) {
      const loginId = formData.principalId.trim();
      const username = formData.username.trim();
      if (!loginId || !username) {
        toast.error('Staff ID and username are required');
        return;
      }
    }

    if (!editingUser) {
      const trimmed = formData.principalId.trim();
      // Format validation: 3 letters, hyphen, numbers (e.g., KCT-20251001)
      if (!/^[A-Za-z]{3}-\d+$/.test(trimmed)) {
        toast.error('Staff ID must be in format ABC-12345678 (3 letters, hyphen, numbers)');
        return;
      }
    }

    // Aadhaar validation (mandatory)
    const aadhaarDigits = formData.aadhaar.replace(/\D/g, '');
    if (!aadhaarDigits || aadhaarDigits.length !== 12) {
      toast.error('Please enter a valid 12-digit Aadhaar number');
      return;
    }
    if (/^[01]/.test(aadhaarDigits)) {
      toast.error('Aadhaar number cannot start with 0 or 1');
      return;
    }

    // Helper to create a fake principal object for custom IDs
    const createPrincipalFromInput = (input) => {
      const trimmed = input.trim();
      return {
        toText: () => trimmed,
        _isPrincipal: false
      };
    };

    try {
      const user = {
        userId: editingUser ? (editingUser.userId || editingUser.id) : createPrincipalFromInput(formData.principalId),
        username: formData.username,
        password: formData.password || undefined,
        aadhaar: aadhaarDigits,
        firstName: formData.firstName,
        lastName: formData.lastName,
        name: `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim(),
        department: formData.department,
        designation: formData.designation,
        salary: formData.salary ? formData.salary.toString() : undefined,
        role: { [formData.role]: null },
        avatar: formData.avatar,
        joiningDate: formData.joiningDate || undefined,
        dateOfBirth: formData.dateOfBirth || undefined,
        gender: formData.gender || undefined,
        address: formData.address || undefined,
        phone: formData.phone || undefined,
      };

      if (editingUser) {
        await updateUser.mutateAsync(user);
        toast.success('User updated successfully');
      } else {
        await createUser.mutateAsync(user);
        toast.success('User created successfully');
      }

      setIsDialogOpen(false);
    } catch (error) {
      toast.error('Failed to save user');
      console.error(error);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this user?')) {
      try {
        await deleteUser.mutateAsync(id);
        toast.success('User deleted successfully');
      } catch (error) {
        toast.error('Failed to delete user');
        console.error(error);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Staff Management Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#DFE8EC] dark:border-[#2A3D48]">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6] flex items-center justify-center shrink-0 shadow-2xs">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#172B3A] dark:text-[#E8F0F4] leading-snug">
              {isOwner ? 'Staff & Employee Management' : 'User Management'}
            </h1>
            <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#A6B5C0] mt-0.5 font-normal">
              Manage organization team members, roles, and system credentials
            </p>
          </div>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              onClick={() => handleOpenDialog()} 
              className="bg-[#0D9488] hover:bg-[#0F766E] text-white font-medium text-xs sm:text-sm rounded-xl px-4 h-9 sm:h-10 shadow-xs transition-all flex items-center gap-2 shrink-0 self-start sm:self-auto"
            >
              <Plus className="h-4 w-4" />
              <span>{isOwner ? 'Add Employee' : 'Add User'}</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] w-[95vw] max-w-xl overflow-y-auto md:max-h-[80vh] md:max-w-2xl border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] text-foreground rounded-2xl shadow-xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base md:text-lg font-medium text-[#172B3A] dark:text-[#E8F0F4]">
                {editingUser ? (isOwner ? 'Edit Employee' : 'Edit User Profile') : (isOwner ? 'Add New Employee' : 'Add New User')}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <div className="h-20 w-20 md:h-24 md:w-24 rounded-full overflow-hidden border-2 border-muted bg-muted">
                    {previewUrl ? (
                      <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                    ) : formData.gender ? (
                      // Live gender-based preview when gender is already selected
                      <img
                        src={getGenderAvatar(formData.gender, formData.principalId || formData.username || 'user')}
                        alt="Auto avatar"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex flex-col items-center justify-center bg-muted text-muted-foreground gap-1">
                        <Camera className="h-7 w-7" />
                        <span className="text-[9px] text-center leading-tight px-1">Select gender for auto avatar</span>
                      </div>
                    )}
                  </div>
                  <Label
                    htmlFor="avatar-upload"
                    className="absolute bottom-0 right-0 p-1 bg-primary text-primary-foreground rounded-full cursor-pointer hover:bg-primary/90 transition-colors shadow-sm"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="sr-only">Upload avatar</span>
                  </Label>
                  <Input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
              </div>
              {!editingUser && (
                <div className="space-y-2">
                  <Label htmlFor="principalId">Staff ID *</Label>
                  <Input
                    id="principalId"
                    tabIndex={1}
                    value={formData.principalId}
                    onChange={(e) => setFormData({ ...formData, principalId: e.target.value })}
                    placeholder="e.g., KCT-20251001"
                    required
                  />
                </div>
              )}
              {/* Aadhaar — mandatory, placed before name fields */}
              <div className="space-y-2">
                <Label htmlFor="aadhaar">Aadhaar Number *</Label>
                <Input
                  id="aadhaar"
                  tabIndex={2}
                  value={formData.aadhaar}
                  onChange={(e) => {
                    const formatted = formatAadhaar(e.target.value);
                    setFormData({ ...formData, aadhaar: formatted });
                  }}
                  placeholder="XXXX XXXX XXXX"
                  maxLength={14}
                  required
                  className={formData.aadhaar && !isValidAadhaar(formData.aadhaar) ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {formData.aadhaar && !isValidAadhaar(formData.aadhaar) && (
                  <p className="text-xs text-destructive">Enter a valid 12-digit Aadhaar number (cannot start with 0 or 1)</p>
                )}
                {isValidAadhaar(formData.aadhaar) && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">✓ Valid Aadhaar format — fill the details below from the Aadhaar card</p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`space-y-2 ${editingUser ? 'md:col-span-2' : ''}`}>
                  <Label htmlFor="username">Username *</Label>
                  <Input
                    id="username"
                    tabIndex={3}
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                  />
                </div>
                {!editingUser && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Password *</Label>
                    <Input
                      id="password"
                      tabIndex={4}
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      disabled
                    />
                    <p className="text-xs text-muted-foreground">Default password is 1234. User must change after first login.</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    tabIndex={5}
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    tabIndex={6}
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    tabIndex={7}
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="designation">Designation</Label>
                  <Input
                    id="designation"
                    tabIndex={8}
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth *</Label>
                  <Input
                    id="dateOfBirth"
                    tabIndex={9}
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="joiningDate">Joining Date</Label>
                  <Input
                    id="joiningDate"
                    tabIndex={10}
                    type="date"
                    value={formData.joiningDate}
                    onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gender">Gender *</Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(value) => {
                      setFormData({ ...formData, gender: value });
                      // Auto-update avatar preview if no custom avatar is uploaded
                      if (!formData.avatar) {
                        const seed = formData.principalId || formData.username || 'user';
                        setPreviewUrl(getGenderAvatar(value, seed));
                      }
                    }}
                  >
                    <SelectTrigger tabIndex={11}>
                      <SelectValue placeholder="Select Gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Contact Number</Label>
                  <Input
                    id="phone"
                    tabIndex={12}
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="e.g. +91 98765 43210"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">Communication Address *</Label>
                  <Textarea
                    id="address"
                    tabIndex={13}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Enter full address as per Aadhaar..."
                    className="min-h-[80px]"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger tabIndex={14}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salary">Salary</Label>
                  <Input
                    id="salary"
                    tabIndex={15}
                    type="number"
                    value={formData.salary}
                    onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                  />
                </div>
              </div>
              <Button type="submit" tabIndex={16} className="w-full bg-primary hover:bg-[#0F766E] text-white font-semibold rounded-xl h-11 transition-all shadow-sm" disabled={createUser.isPending || updateUser.isPending}>
                {(createUser.isPending || updateUser.isPending) ? 'Saving...' : 'Save User Profile'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* 2. Role Filter Chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#64748B] dark:text-[#A6B5C0] mr-1">
          <Filter className="h-3.5 w-3.5 text-[#0D9488] dark:text-[#14B8A6]" />
          <span>Filter:</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {filterOptions.map(opt => {
            const active = filterRole === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setFilterRole(opt.value)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium border transition-all cursor-pointer",
                  active
                    ? "bg-[#0D9488] text-white border-[#0D9488] shadow-xs font-semibold"
                    : "bg-white dark:bg-[#15232D] border-[#DFE8EC] dark:border-[#2A3D48] text-[#64748B] dark:text-[#A6B5C0] hover:text-[#172B3A] dark:hover:text-[#E8F0F4] hover:bg-[#F4F8FA] dark:hover:bg-[#1D303B]"
                )}
              >
                <span>{opt.label}</span>
                <span className={cn(
                  "text-[10px] rounded-full px-1.5 py-0.2 font-semibold",
                  active 
                    ? "bg-white/20 text-white" 
                    : "bg-[#F4F8FA] dark:bg-[#1D303B] text-[#64748B] dark:text-[#A6B5C0] border border-[#DFE8EC]/80 dark:border-[#2A3D48]/80"
                )}>
                  {roleCounts[opt.value] || 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Staff Roster Table */}
      <Card className="border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] text-foreground rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="border-b border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] px-6 py-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2.5 text-[#172B3A] dark:text-[#E8F0F4]">
            <span>{isOwner ? 'Staff Roster' : 'All Registered Users'}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6]">
              {visibleUsers.length} total
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-[#64748B] dark:text-[#A6B5C0]">
              Loading staff records...
            </div>
          ) : visibleUsers.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#64748B] dark:text-[#A6B5C0] space-y-1">
              <p className="font-semibold text-foreground text-sm">No team members found</p>
              <p>There are no staff matching this filter.</p>
            </div>
          ) : (
            <>
              {/* Mobile Cards View */}
              <div className="p-4 space-y-3 md:hidden">
                {visibleUsers.map((user) => {
                  const uid = user.userId?.toText ? user.userId.toText() : String(user.userId || user.id);
                  const name = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim();
                  return (
                    <div key={uid} className="border border-[#DFE8EC] dark:border-[#2A3D48] bg-[#F4F8FA]/50 dark:bg-[#1D303B]/50 rounded-xl p-4 shadow-xs">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-muted overflow-hidden border border-[#DFE8EC] dark:border-[#2A3D48]">
                          <img
                            src={user.avatar || getAvatarFallback(user)}
                            alt="Profile"
                            className="h-full w-full object-cover"
                            onError={(e) => { e.currentTarget.src = getAvatarFallback(user); }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold leading-tight truncate text-[#172B3A] dark:text-[#E8F0F4]">{name || '--'}</p>
                              <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] truncate font-mono">@{user.username}</p>
                            </div>
                            <span className={cn("rounded-md border px-2 py-0.5 text-[11px] capitalize", getRoleBadge(getRoleKey(user)))}>
                              {getRoleKey(user)}
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#64748B] dark:text-[#A6B5C0]">
                            <div>
                              <span className="block text-[10px] uppercase font-semibold tracking-wider">Department</span>
                              <span className="text-[#172B3A] dark:text-[#E8F0F4] font-medium">{user.department || '--'}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase font-semibold tracking-wider">Designation</span>
                              <span className="text-[#172B3A] dark:text-[#E8F0F4] font-medium">{user.designation || '--'}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase font-semibold tracking-wider">DOB</span>
                              <span className="text-[#172B3A] dark:text-[#E8F0F4] font-medium">{formatDisplayDate(user.dateOfBirth)}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase font-semibold tracking-wider">Salary</span>
                              <span className="text-[#172B3A] dark:text-[#E8F0F4] font-medium">{formatSalary(user.salary)}</span>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-[#DFE8EC] dark:border-[#2A3D48] pt-2.5">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleGenerateResetLink(user)} 
                              title="Reset Password" 
                              aria-label="Reset Password"
                              className="h-8 w-8 text-[#64748B] hover:text-[#0D9488] dark:hover:text-[#14B8A6] hover:bg-[#0D9488]/10 rounded-lg"
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleOpenDialog(user)} 
                              title="Edit Profile"
                              aria-label="Edit Profile"
                              className="h-8 w-8 text-[#64748B] hover:text-[#0D9488] dark:hover:text-[#14B8A6] hover:bg-[#0D9488]/10 rounded-lg"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleDelete(user.userId || user.id)} 
                              title="Delete User"
                              aria-label="Delete User"
                              className="h-8 w-8 text-[#64748B] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 rounded-lg"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader className="bg-[#F8FAFC] dark:bg-[#1D303B]/60 border-b border-[#DFE8EC] dark:border-[#2A3D48]">
                    <TableRow className="border-[#DFE8EC] dark:border-[#2A3D48]">
                      <TableHead className="py-3.5 pl-6 font-semibold text-[11px] uppercase tracking-wider text-[#64748B] dark:text-[#A6B5C0] w-12">Avatar</TableHead>
                      <TableHead className="py-3.5 font-semibold text-[11px] uppercase tracking-wider text-[#64748B] dark:text-[#A6B5C0]">Name</TableHead>
                      <TableHead className="py-3.5 font-semibold text-[11px] uppercase tracking-wider text-[#64748B] dark:text-[#A6B5C0]">Username</TableHead>
                      <TableHead className="py-3.5 font-semibold text-[11px] uppercase tracking-wider text-[#64748B] dark:text-[#A6B5C0]">Department</TableHead>
                      <TableHead className="py-3.5 font-semibold text-[11px] uppercase tracking-wider text-[#64748B] dark:text-[#A6B5C0]">Designation</TableHead>
                      <TableHead className="py-3.5 font-semibold text-[11px] uppercase tracking-wider text-[#64748B] dark:text-[#A6B5C0]">Date of Birth</TableHead>
                      <TableHead className="py-3.5 font-semibold text-[11px] uppercase tracking-wider text-[#64748B] dark:text-[#A6B5C0]">Age</TableHead>
                      <TableHead className="py-3.5 font-semibold text-[11px] uppercase tracking-wider text-[#64748B] dark:text-[#A6B5C0]">Role</TableHead>
                      <TableHead className="py-3.5 font-semibold text-[11px] uppercase tracking-wider text-[#64748B] dark:text-[#A6B5C0]">Salary</TableHead>
                      <TableHead className="py-3.5 pr-6 text-right font-semibold text-[11px] uppercase tracking-wider text-[#64748B] dark:text-[#A6B5C0]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-[#DFE8EC]/70 dark:divide-[#2A3D48]/70">
                    {visibleUsers.map((user) => (
                      <TableRow 
                        key={(user.userId?.toText ? user.userId.toText() : String(user.userId || user.id))} 
                        className="hover:bg-teal-500/[0.04] dark:hover:bg-teal-400/[0.06] transition-colors"
                      >
                        <TableCell className="pl-6 py-3.5">
                          <div className="h-8 w-8 rounded-full bg-muted overflow-hidden border border-[#DFE8EC] dark:border-[#2A3D48]">
                            <img
                              src={user.avatar || getAvatarFallback(user)}
                              alt="Profile"
                              className="h-full w-full object-cover"
                              onError={(e) => { e.currentTarget.src = getAvatarFallback(user); }}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-xs sm:text-sm text-[#172B3A] dark:text-[#E8F0F4] py-3.5">
                          {user.name || `${user.firstName || ''} ${user.lastName || ''}`}
                        </TableCell>
                        <TableCell className="text-[#64748B] dark:text-[#A6B5C0] py-3.5 text-xs font-mono">
                          @{user.username}
                        </TableCell>
                        <TableCell className="text-[#172B3A] dark:text-[#E8F0F4] py-3.5 text-xs">
                          {user.department || '--'}
                        </TableCell>
                        <TableCell className="text-[#64748B] dark:text-[#A6B5C0] py-3.5 text-xs">
                          {user.designation || '--'}
                        </TableCell>
                        <TableCell className="text-[#64748B] dark:text-[#A6B5C0] py-3.5 text-xs">
                          {formatDisplayDate(user.dateOfBirth)}
                        </TableCell>
                        <TableCell className="text-[#172B3A] dark:text-[#E8F0F4] py-3.5 text-xs">
                          {(user.age ?? computeAge(user.dateOfBirth)) ?? '--'}
                        </TableCell>
                        <TableCell className="py-3.5">
                          <span className={cn("inline-flex rounded-md border px-2.5 py-0.5 text-[11px] capitalize", getRoleBadge(getRoleKey(user)))}>
                            {getRoleKey(user)}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-[#172B3A] dark:text-[#E8F0F4] py-3.5 font-medium">
                          {formatSalary(user.salary)}
                        </TableCell>
                        <TableCell className="text-right pr-6 py-3.5">
                          <div className="flex justify-end items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleGenerateResetLink(user)}
                              title="Reset Password"
                              aria-label="Reset Password"
                              className="hover:bg-[#0D9488]/10 text-[#64748B] hover:text-[#0D9488] dark:hover:text-[#14B8A6] rounded-lg h-7 w-7 transition-colors"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(user)}
                              title="Edit User"
                              aria-label="Edit User"
                              className="hover:bg-[#0D9488]/10 text-[#64748B] hover:text-[#0D9488] dark:hover:text-[#14B8A6] rounded-lg h-7 w-7 transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(user.userId || user.id)}
                              title="Delete User"
                              aria-label="Delete User"
                              className="hover:bg-rose-500/10 text-[#64748B] hover:text-rose-600 dark:hover:text-rose-400 rounded-lg h-7 w-7 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
