import { useState, useRef, useEffect } from 'react';
import { useSaveCallerUserProfile } from '../hooks/useQueries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Camera, Upload } from 'lucide-react';

export default function ProfileSetup() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  // Password not needed here as user is already logged in
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Male');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [salary, setSalary] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [referralSource, setReferralSource] = useState('');
  const [role, setRole] = useState('staff');
  const [avatar, setAvatar] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const fileInputRef = useRef(null);

  const saveProfile = useSaveCallerUserProfile();

  useEffect(() => {
    const storedUser = localStorage.getItem('current_user');
    if (storedUser) {
      setUsername(storedUser);
    }
  }, []);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) { // 4MB limit
        toast.error('Image size should be less than 4MB');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        setAvatar(result);
        setPreviewUrl(result);
      };
      reader.readAsDataURL(file);
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

    if (!username.trim()) {
        toast.error('Please enter a username');
        return;
    }

    const profile = {
      id: username.trim(),
      username: username.trim(),
      // password: password, // Not sending password as it's already handled by auth
      name: name.trim(),
      age: parseInt(age) || 0,
      gender: gender,
      aadhaar: aadhaar,
      email: `${name.trim().toLowerCase().replace(/\s+/g, '.')}@company.com`,
      role: role === 'admin' ? { admin: null } : role === 'owner' ? { owner: null } : role === 'param' ? { param: null } : role === 'intern' ? { intern: null } : role === 'freelancer' ? { freelancer: null } : { staff: null },
      contact,
      address,
      department,
      designation,
      salary: salary ? BigInt(salary) : undefined,
      joiningDate,
      referralSource,
      avatar: avatar || undefined
    };
     
    try {
      await saveProfile.mutateAsync(profile);
      toast.success('Profile created successfully!');
    } catch (error) {
      toast.error('Failed to create profile');
      console.error(error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('current_user');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader className="text-center relative">
            <Button 
                variant="ghost" 
                size="sm" 
                className="absolute right-0 top-0 text-muted-foreground hover:text-destructive"
                onClick={handleLogout}
            >
                Back to Login
            </Button>
          <CardTitle className="text-3xl">Complete Your Profile</CardTitle>
          <CardDescription>Please provide your information to get started</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col items-center justify-center mb-6">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="h-24 w-24 rounded-full bg-muted border-2 border-dashed border-muted-foreground/50 flex items-center justify-center overflow-hidden hover:border-primary transition-colors">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <Camera className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1 shadow-lg">
                  <Upload className="h-3 w-3" />
                </div>
              </div>
              <p className="text-sm font-semibold text-destructive mt-2">Upload Profile Picture *</p>
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
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  required
                  disabled={true} 
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact">Contact Number</Label>
                <Input
                  id="contact"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Phone number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Age"
                />
              </div>

              <div className="space-y-2">
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

              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g., Engineering, Sales"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="designation">Designation</Label>
                <Input
                  id="designation"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g., Software Engineer"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="salary">Salary</Label>
                <Input
                  id="salary"
                  type="number"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                  placeholder="Monthly salary"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="joiningDate">Joining Date</Label>
                <Input
                  id="joiningDate"
                  type="date"
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="aadhaar">Aadhaar Number</Label>
                <Input
                  id="aadhaar"
                  value={aadhaar}
                  onChange={(e) => setAadhaar(e.target.value)}
                  placeholder="12-digit Aadhaar"
                  maxLength={12}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="referralSource">Referral Source</Label>
                <Input
                  id="referralSource"
                  value={referralSource}
                  onChange={(e) => setReferralSource(e.target.value)}
                  placeholder="How did you join?"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={role} onValueChange={(value) => setRole(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="intern">Intern</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Full address"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={saveProfile.isPending}
            >
              {saveProfile.isPending ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Creating Profile...
                </>
              ) : (
                'Create Profile'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
