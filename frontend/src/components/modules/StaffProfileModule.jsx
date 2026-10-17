import { useEffect, useState, useRef } from 'react';
import { useSaveCallerUserProfile } from '../../hooks/useQueries';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Camera, Upload } from 'lucide-react';
import { authFetch, hasUserRole } from '@/lib/utils';

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

    if (userProfile.lastAvatarUpdate) {
      const diff = Date.now() - new Date(userProfile.lastAvatarUpdate).getTime();
      const days = diff / (1000 * 60 * 60 * 24);
      if (days < 15) {
        toast.error(`Profile photo change restricted. Please wait ${Math.ceil(15 - days)} more days.`);
        e.target.value = '';
        return;
      }
    }

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
      toast.success('Profile picture updated');
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

  return (
    <div className="space-y-6">
      {needsPasswordChange && (
        <Card>
          <CardHeader>
            <CardTitle>Action Required</CardTitle>
            <CardDescription>Please change your default password to continue using the system.</CardDescription>
          </CardHeader>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{isStaff ? 'Profile Details' : 'Edit Profile'}</CardTitle>
          <CardDescription>{isStaff ? 'View your personal information. You can update your picture and contact details.' : 'Update your personal information and preferences'}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col items-center justify-center mb-6">
              <div className="relative" onClick={() => fileInputRef.current?.click()}>
                <div className="h-24 w-24 rounded-full bg-muted border-2 border-dashed border-muted-foreground/50 flex items-center justify-center overflow-hidden hover:border-primary transition-colors">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name || userProfile.name || 'user')}`;
                      }}
                    />
                  ) : (
                    <Camera className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1 shadow-lg">
                  <Upload className="h-3 w-3" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-2">Upload Profile Picture</p>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} disabled={isStaff} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact">Contact Number</Label>
                <Input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} />
              </div>
              <div className="flex flex-col md:flex-row gap-4 md:col-span-2">
                <div className="space-y-2 flex-1 min-w-0">
                  <Label htmlFor="dob">Date of Birth</Label>
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
                  />
                </div>
                <div className="space-y-2 flex-1 min-w-0">
                  <Label htmlFor="age">Age</Label>
                  <Input id="age" type="number" value={age} disabled />
                </div>
                <div className="space-y-2 flex-1 min-w-0">
                  <Label htmlFor="gender">Gender</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger>
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
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input id="department" value={department} onChange={(e) => setDepartment(e.target.value)} disabled={isStaff} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="designation">Designation</Label>
                <Input id="designation" value={designation} onChange={(e) => setDesignation(e.target.value)} disabled={isStaff} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary">Salary</Label>
                <Input id="salary" type="number" value={salary} onChange={(e) => setSalary(e.target.value)} disabled={isStaff} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="joiningDate">Joining Date</Label>
                <Input id="joiningDate" type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} disabled={isStaff} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="aadhaar">Aadhaar Number</Label>
                <Input id="aadhaar" value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} maxLength={12} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="referralSource">Referral Source</Label>
                <Input id="referralSource" value={referralSource} onChange={(e) => setReferralSource(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>

            <Button type="submit" className="w-full" disabled={saveProfile.isPending}>
              {saveProfile.isPending ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your password anytime after first login.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleChangePassword}>
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isChangingPassword}>
              {isChangingPassword ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-muted overflow-hidden">
              <img
                src={previewUrl || userProfile.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(userProfile.name || 'user')}`}
                alt="Profile"
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(userProfile.name || 'user')}`;
                }}
              />
            </div>
            <div>
              <div className="font-semibold">{name || userProfile.name}</div>
              <div className="text-xs font-semibold">
                {userProfile.userId?.toText ? userProfile.userId.toText() : (userProfile.id?.toText ? userProfile.id.toText() : String(userProfile.userId || userProfile.id || ''))}
              </div>
              <div className="text-sm text-muted-foreground">{designation || userProfile.designation || 'N/A'}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Department</span>
              <span className="font-medium">{department || userProfile.department || 'N/A'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Role</span>
              <span className="font-medium capitalize">{Object.keys(userProfile.role)[0]}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Joining Date</span>
              <span className="font-medium">{(joiningDate || userProfile.joiningDate) ? new Date(joiningDate || userProfile.joiningDate).toLocaleDateString() : 'N/A'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Contact</span>
              <span className="font-medium">{contact || userProfile.contact || 'N/A'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Date of Birth</span>
              <span className="font-medium">{dateOfBirth || userProfile.dateOfBirth || 'N/A'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Age</span>
              <span className="font-medium">{age || (userProfile.age !== undefined ? String(userProfile.age) : 'N/A')}</span>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
