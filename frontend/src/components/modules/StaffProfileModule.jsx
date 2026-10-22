import { useEffect, useState, useRef } from 'react';
import { useSaveCallerUserProfile } from '../../hooks/useQueries';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Camera, Upload, ShieldCheck, Lock, User, Briefcase, Calendar, 
  Phone, MapPin, Building, Key, CheckCircle2, AlertTriangle, Shield, Settings
} from 'lucide-react';
import { authFetch, cn, hasUserRole } from '@/lib/utils';
import PageHeader from '../PageHeader';

export default function StaffProfileModule({ userProfile }) {
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

  const [name, setName] = useState(userProfile.name || '');
  const [age, setAge] = useState(userProfile.age?.toString() || '');
  const [dateOfBirth, setDateOfBirth] = useState(normalizeDateForInput(userProfile.dateOfBirth));
  const [gender, setGender] = useState(userProfile.gender || 'Male');
  const [contact, setContact] = useState(userProfile.contact || userProfile.phone || '');
  const [address, setAddress] = useState(userProfile.address || '');
  const [department, setDepartment] = useState(userProfile.department || '');
  const [designation, setDesignation] = useState(userProfile.designation || '');
  const [salary, setSalary] = useState(userProfile.salary ? userProfile.salary.toString() : '');
  const [aadhaar, setAadhaar] = useState(userProfile.aadhaar || '');
  const [joiningDate, setJoiningDate] = useState(userProfile.joiningDate || '');
  const [referralSource, setReferralSource] = useState(userProfile.referralSource || '');
  const [avatar, setAvatar] = useState(userProfile.avatar || '');
  const [previewUrl, setPreviewUrl] = useState(userProfile.avatar || '');
  const fileInputRef = useRef(null);

  const saveProfile = useSaveCallerUserProfile();
  const queryClient = useQueryClient();
  const isStaff = hasUserRole(userProfile, 'staff') || hasUserRole(userProfile, 'intern') || hasUserRole(userProfile, 'freelancer');
  const needsPasswordChange = !!userProfile.mustChangePassword;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (userProfile.name !== undefined) setName(userProfile.name || '');
    if (userProfile.gender !== undefined) setGender(userProfile.gender || 'Male');
    if (userProfile.dateOfBirth !== undefined) setDateOfBirth(normalizeDateForInput(userProfile.dateOfBirth));
    if (userProfile.age !== undefined) setAge(userProfile.age?.toString() || '');
  }, [userProfile.name, userProfile.gender, userProfile.dateOfBirth, userProfile.age]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      toast.error('Image size should be less than 4MB');
      return;
    }
    try {
      const uid = userProfile.userId?.toText
        ? userProfile.userId.toText()
        : (userProfile.id?.toText ? userProfile.id.toText() : String(userProfile.userId || userProfile.id || ''));
      if (!uid) throw new Error('User ID not found');
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await authFetch(`/api/users/${uid}/avatar`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(err.message || 'Upload failed');
      }
      const data = await res.json();
      const avatarPath = data?.avatar || '';
      setAvatar(avatarPath);
      setPreviewUrl(avatarPath);
      toast.success('Profile picture updated successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to upload image');
    } finally {
      e.target.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter your name');
      return;
    }
    if (!avatar) {
      toast.error('Profile picture is mandatory. Please upload an image.');
      return;
    }
    const role = userProfile.role;
    const finalAvatar = avatar || undefined;
    const profile = {
      id: userProfile.id,
      username: userProfile.username,
      name: name.trim(),
      age: parseInt(age) || 0,
      dateOfBirth: dateOfBirth || undefined,
      gender,
      aadhaar,
      email: userProfile.email,
      role,
      contact,
      address,
      department,
      designation,
      salary: salary ? BigInt(salary) : undefined,
      joiningDate,
      referralSource,
      avatar: finalAvatar
    };
    try {
      await saveProfile.mutateAsync(profile);
      toast.success('Profile updated successfully');
    } catch {
      toast.error('Failed to update profile');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      toast.error('Please fill current and new password');
      return;
    }
    if (newPassword.length < 4) {
      toast.error('Password must be at least 4 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setIsChangingPassword(true);
    try {
      const identifier = localStorage.getItem('current_user') || userProfile.username;
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, currentPassword, newPassword })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to change password' }));
        throw new Error(err.message || 'Failed to change password');
      }
      toast.success('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      queryClient.invalidateQueries({ queryKey: ['currentUserProfile'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (e2) {
      toast.error(e2.message || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const roleName = Object.keys(userProfile.role || {})[0] || 'staff';
  const employeeId = userProfile.userId?.toText 
    ? userProfile.userId.toText() 
    : (userProfile.id?.toText ? userProfile.id.toText() : String(userProfile.userId || userProfile.id || ''));

  return (
    <div className="space-y-6 w-full pb-10">
      {/* 1. Header Section */}
      <PageHeader
        icon={Settings}
        title="Settings"
        subtitle="Manage your personal profile, workplace information, and account security."
      />

      {/* Action Required Banner for First Login / Default Password */}
      {needsPasswordChange && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-300 flex items-start gap-3 shadow-xs">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm">
            <p className="font-medium">Security Action Required</p>
            <p className="mt-0.5 text-xs opacity-90 font-normal">
              You are currently using a default temporary password. Please update your password below to secure your account.
            </p>
          </div>
        </div>
      )}

      {/* 2. Compact Profile Summary Hero Card */}
      <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden">
        <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
          {/* Avatar with Clickable Upload Action */}
          <div className="relative group shrink-0">
            <div 
              className="h-20 w-20 sm:h-22 sm:w-22 rounded-2xl bg-secondary border-2 border-border flex items-center justify-center overflow-hidden cursor-pointer shadow-xs transition-transform group-hover:scale-[1.02]"
              onClick={() => fileInputRef.current?.click()}
              title="Click to update profile photo"
            >
              <img
                src={previewUrl || userProfile.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name || userProfile.name || 'user')}`}
                alt="Profile"
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name || userProfile.name || 'user')}`;
                }}
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity rounded-2xl">
                <Camera className="h-5 w-5" />
                <span className="text-[10px] font-medium mt-0.5">Change</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-xl bg-primary text-white flex items-center justify-center shadow-md hover:bg-[#0F766E] transition-colors border-2 border-card"
              title="Upload Photo"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleImageUpload}
            />
          </div>

          {/* Core Employee Details */}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl sm:text-2xl font-medium text-foreground truncate">
                {name || userProfile.name || userProfile.username}
              </h2>
              <Badge variant="outline" className="capitalize text-xs font-semibold px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                {roleName}
              </Badge>
              {employeeId && (
                <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-secondary text-muted-foreground border border-border">
                  ID: {employeeId}
                </span>
              )}
            </div>

            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {designation || userProfile.designation || 'Staff Member'} • <span className="font-medium text-foreground">{department || userProfile.department || 'General'}</span>
            </p>

            {/* Quick Meta Row */}
            <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-3 sm:gap-4 text-xs text-muted-foreground">
              {contact && (
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-primary" />
                  <span>{contact}</span>
                </div>
              )}
              {joiningDate && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  <span>Joined {new Date(joiningDate).toLocaleDateString()}</span>
                </div>
              )}
              {address && (
                <div className="flex items-center gap-1.5 truncate max-w-xs">
                  <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">{address}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Profile & Employment Form */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Card 1: Personal Information */}
            <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/70 bg-card">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-medium text-foreground">Personal Information</CardTitle>
                    <CardDescription className="text-xs text-muted-foreground font-normal">
                      Your identity, contact, and personal demographic details.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="name" className="text-xs font-semibold text-foreground">Full Name *</Label>
                      {isStaff && <span className="text-[10px] text-muted-foreground font-mono">Read-only</span>}
                    </div>
                    <Input 
                      id="name" 
                      value={name} 
                      onChange={(e) => setName(e.target.value)} 
                      disabled={isStaff} 
                      className={cn(
                        "h-9.5 text-xs sm:text-sm rounded-xl bg-background border-border",
                        isStaff && "bg-muted/40 cursor-not-allowed opacity-80"
                      )}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="contact" className="text-xs font-semibold text-foreground">Contact Phone</Label>
                    <Input 
                      id="contact" 
                      value={contact} 
                      onChange={(e) => setContact(e.target.value)} 
                      placeholder="+1 (555) 000-0000"
                      className="h-9.5 text-xs sm:text-sm rounded-xl bg-background border-border"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="dob" className="text-xs font-semibold text-foreground">Date of Birth</Label>
                    <Input
                      id="dob"
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDateOfBirth(v);
                        if (v) {
                          try {
                            const dob = new Date(v);
                            const now = new Date();
                            let a = now.getFullYear() - dob.getFullYear();
                            const m = now.getMonth() - dob.getMonth();
                            if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) a--;
                            setAge(String(a));
                          } catch {}
                        }
                      }}
                      className="h-9.5 text-xs sm:text-sm rounded-xl bg-background border-border"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="age" className="text-xs font-semibold text-foreground">Age</Label>
                        <span className="text-[10px] text-muted-foreground font-mono">Auto</span>
                      </div>
                      <Input 
                        id="age" 
                        type="number" 
                        value={age} 
                        disabled 
                        className="h-9.5 text-xs sm:text-sm rounded-xl bg-muted/40 border-border cursor-not-allowed opacity-80" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="gender" className="text-xs font-semibold text-foreground">Gender</Label>
                      <Select value={gender} onValueChange={setGender}>
                        <SelectTrigger className="h-9.5 text-xs sm:text-sm rounded-xl bg-background border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="aadhaar" className="text-xs font-semibold text-foreground">Aadhaar / National ID</Label>
                    <Input 
                      id="aadhaar" 
                      value={aadhaar} 
                      onChange={(e) => setAadhaar(e.target.value)} 
                      maxLength={12} 
                      placeholder="12-digit number"
                      className="h-9.5 text-xs sm:text-sm rounded-xl bg-background border-border font-mono"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="address" className="text-xs font-semibold text-foreground">Residential Address</Label>
                    <Input 
                      id="address" 
                      value={address} 
                      onChange={(e) => setAddress(e.target.value)} 
                      placeholder="Street address, City, State, ZIP"
                      className="h-9.5 text-xs sm:text-sm rounded-xl bg-background border-border"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Employment Information */}
            <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/70 bg-card">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <Briefcase className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-medium text-foreground">Workplace & Employment Information</CardTitle>
                    <CardDescription className="text-xs text-muted-foreground font-normal">
                      Company designation, assigned department, and employment terms.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="department" className="text-xs font-semibold text-foreground">Department</Label>
                      {isStaff && <span className="text-[10px] text-muted-foreground font-mono">Managed by Admin</span>}
                    </div>
                    <Input 
                      id="department" 
                      value={department} 
                      onChange={(e) => setDepartment(e.target.value)} 
                      disabled={isStaff} 
                      className={cn(
                        "h-9.5 text-xs sm:text-sm rounded-xl bg-background border-border",
                        isStaff && "bg-muted/40 cursor-not-allowed opacity-80"
                      )}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="designation" className="text-xs font-semibold text-foreground">Designation</Label>
                      {isStaff && <span className="text-[10px] text-muted-foreground font-mono">Managed by Admin</span>}
                    </div>
                    <Input 
                      id="designation" 
                      value={designation} 
                      onChange={(e) => setDesignation(e.target.value)} 
                      disabled={isStaff} 
                      className={cn(
                        "h-9.5 text-xs sm:text-sm rounded-xl bg-background border-border",
                        isStaff && "bg-muted/40 cursor-not-allowed opacity-80"
                      )}
                    />
                  </div>

                  {/* Salary field - rendered only if authorized/present */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="salary" className="text-xs font-semibold text-foreground">Base Salary</Label>
                      {isStaff && <span className="text-[10px] text-muted-foreground font-mono">Confidential</span>}
                    </div>
                    <Input 
                      id="salary" 
                      type="number" 
                      value={salary} 
                      onChange={(e) => setSalary(e.target.value)} 
                      disabled={isStaff} 
                      placeholder="Salary amount"
                      className={cn(
                        "h-9.5 text-xs sm:text-sm rounded-xl bg-background border-border font-mono",
                        isStaff && "bg-muted/40 cursor-not-allowed opacity-80"
                      )}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="joiningDate" className="text-xs font-semibold text-foreground">Date of Joining</Label>
                      {isStaff && <span className="text-[10px] text-muted-foreground font-mono">Official</span>}
                    </div>
                    <Input 
                      id="joiningDate" 
                      type="date" 
                      value={joiningDate} 
                      onChange={(e) => setJoiningDate(e.target.value)} 
                      disabled={isStaff} 
                      className={cn(
                        "h-9.5 text-xs sm:text-sm rounded-xl bg-background border-border",
                        isStaff && "bg-muted/40 cursor-not-allowed opacity-80"
                      )}
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="referralSource" className="text-xs font-semibold text-foreground">Referral / Application Source</Label>
                    <Input 
                      id="referralSource" 
                      value={referralSource} 
                      onChange={(e) => setReferralSource(e.target.value)} 
                      placeholder="e.g. LinkedIn, Internal Referral, Career Site"
                      className="h-9.5 text-xs sm:text-sm rounded-xl bg-background border-border"
                    />
                  </div>
                </div>

                {/* Save Changes Button Bar */}
                <div className="pt-2 flex justify-end">
                  <Button 
                    type="submit" 
                    className="h-10 px-6 rounded-xl bg-[#0D9488] hover:bg-[#0F766E] text-white font-semibold shadow-xs transition-all w-full sm:w-auto" 
                    disabled={saveProfile.isPending}
                  >
                    {saveProfile.isPending ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Saving Profile...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </div>

        {/* Right Column (1 Col): Account Security & Account Snapshot */}
        <div className="space-y-6">
          {/* Card: Account Security / Change Password */}
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/70 bg-card">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Key className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-medium text-foreground">Account Security</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground font-normal">
                    Change your account password anytime.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <form className="space-y-3.5" onSubmit={handleChangePassword}>
                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword" className="text-xs font-semibold text-foreground">Current Password *</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    className="h-9.5 text-xs sm:text-sm rounded-xl bg-background border-border"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="newPassword" className="text-xs font-semibold text-foreground">New Password *</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="Min. 4 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    className="h-9.5 text-xs sm:text-sm rounded-xl bg-background border-border"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-xs font-semibold text-foreground">Confirm New Password *</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className="h-9.5 text-xs sm:text-sm rounded-xl bg-background border-border"
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-9.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold border border-border transition-colors mt-2" 
                  disabled={isChangingPassword}
                >
                  {isChangingPassword ? 'Updating Password...' : 'Update Password'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Card: Account Status & Info Summary */}
          <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/70 bg-card">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-medium text-foreground">Account Status</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground font-normal">
                    System permissions and credentials
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                <span className="text-muted-foreground">System Role</span>
                <span className="font-semibold text-foreground capitalize">{roleName}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                <span className="text-muted-foreground">Username</span>
                <span className="font-mono text-foreground font-semibold">{userProfile.username || 'user'}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                <span className="text-muted-foreground">Assigned ID</span>
                <span className="font-mono text-foreground">{employeeId || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                <span className="text-muted-foreground">Authentication</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Active
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-muted-foreground">Photo Restrictions</span>
                <span className="text-muted-foreground">15-day policy</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
