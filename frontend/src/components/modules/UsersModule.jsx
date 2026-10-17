import { useState } from 'react';
import { useGetAllUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../../hooks/useQueries';
import { authFetch, hasUserRole, getUserRoleKey } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Camera, KeyRound, Filter } from 'lucide-react';
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

  // Role styling config
  const roleBadgeStyles = {
    param:      'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-violet-300 dark:border-violet-700',
    owner:      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-700',
    admin:      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300 dark:border-blue-700',
    staff:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
    intern:     'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-300 dark:border-sky-700',
    freelancer: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-300 dark:border-orange-700',
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
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">{isOwner ? 'Staff & Employee Management' : 'User Management'}</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              {isOwner ? 'Add Employee' : 'Add User'}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] w-[95vw] max-w-xl overflow-y-auto md:max-h-[80vh] md:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-base md:text-lg">{editingUser ? (isOwner ? 'Edit Employee' : 'Edit User') : (isOwner ? 'Add New Employee' : 'Add New User')}</DialogTitle>
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
              <Button type="submit" tabIndex={16} className="w-full" disabled={createUser.isPending || updateUser.isPending}>
                {(createUser.isPending || updateUser.isPending) ? 'Saving...' : 'Save User'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Role filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        {filterOptions.map(opt => {
          const active = filterRole === opt.value;
          const badgeCls = opt.value !== 'all' ? getRoleBadge(opt.value) : '';
          return (
            <button
              key={opt.value}
              onClick={() => setFilterRole(opt.value)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                active
                  ? opt.value === 'all'
                    ? 'bg-foreground text-background border-foreground'
                    : `${badgeCls} ring-2 ring-offset-1 ring-current`
                  : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
              }`}
            >
              {opt.label}
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                active ? 'bg-background/20 text-current' : 'bg-muted text-muted-foreground'
              }`}>{roleCounts[opt.value] || 0}</span>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isOwner ? 'My Staff' : 'All Users'} <span className="text-sm font-normal text-muted-foreground">({visibleUsers.length})</span></CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading users...</p>
          ) : visibleUsers.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No users found</p>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {visibleUsers.map((user) => {
                  const uid = user.userId?.toText ? user.userId.toText() : String(user.userId || user.id);
                  const name = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim();
                  return (
                    <Card key={uid} className="border border-border shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-muted overflow-hidden">
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
                                <p className="text-sm font-semibold leading-tight truncate">{name || '--'}</p>
                                <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
                              </div>
                              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${getRoleBadge(getRoleKey(user))}`}>
                                {getRoleKey(user)}
                              </span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                              <div>
                                <span className="block text-[10px] uppercase tracking-wide">Department</span>
                                <span className="text-foreground/90">{user.department || '--'}</span>
                              </div>
                              <div>
                                <span className="block text-[10px] uppercase tracking-wide">Designation</span>
                                <span className="text-foreground/90">{user.designation || '--'}</span>
                              </div>
                              <div>
                                <span className="block text-[10px] uppercase tracking-wide">DOB</span>
                                <span className="text-foreground/90">{user.dateOfBirth || '--'}</span>
                              </div>
                              <div>
                                <span className="block text-[10px] uppercase tracking-wide">Salary</span>
                                <span className="text-foreground/90">₹{user.salary?.toString() || '--'}</span>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center justify-end gap-2">
                              <Button variant="ghost" size="icon" onClick={() => handleGenerateResetLink(user)} title="Reset Password">
                                <KeyRound className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(user)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(user.userId || user.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Avatar</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Date of Birth</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Salary</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                {visibleUsers.map((user) => (
                  <TableRow key={(user.userId?.toText ? user.userId.toText() : String(user.userId || user.id))} className="hover:bg-accent">
                    <TableCell>
                      <div className="h-8 w-8 rounded-full bg-muted overflow-hidden">
                        <img
                          src={user.avatar || getAvatarFallback(user)}
                          alt="Profile"
                          className="h-full w-full object-cover"
                          onError={(e) => { e.currentTarget.src = getAvatarFallback(user); }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{user.name || `${user.firstName || ''} ${user.lastName || ''}`}</TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{user.department}</TableCell>
                    <TableCell>{user.designation}</TableCell>
                    <TableCell>{user.dateOfBirth || '--'}</TableCell>
                    <TableCell>{(user.age ?? computeAge(user.dateOfBirth)) ?? '--'}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${getRoleBadge(getRoleKey(user))}`}>
                        {getRoleKey(user)}
                      </span>
                    </TableCell>
                    <TableCell>₹{user.salary?.toString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleGenerateResetLink(user)}
                          title="Reset Password"
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(user)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(user.userId || user.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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
