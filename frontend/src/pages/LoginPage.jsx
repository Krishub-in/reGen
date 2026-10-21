import { useEffect, useState } from 'react';
import { useCustomAuth } from '../hooks/useCustomAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Eye, EyeOff, Users, TrendingUp, Briefcase } from 'lucide-react';
import Footer from '../components/Footer';

export default function LoginPage({ resetToken: resetTokenProp }) {
  const { login, isLoggingIn } = useCustomAuth();
  
  // Login Form State
  const [loginUserId, setLoginUserId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState('login');

  const [resetToken, setResetToken] = useState(resetTokenProp || '');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    const tokenFromUrl = new URLSearchParams(window.location.search).get('resetToken') || '';
    const token = resetTokenProp || tokenFromUrl;
    if (token) {
      setResetToken(token);
      setMode('reset');
    }
  }, [resetTokenProp]);

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    try {
      await login((loginUserId || '').trim(), (loginPassword || '').trim());
    } catch (error) {
      console.error("Login failed", error);
      const msg = String(error?.message || '').toLowerCase();
      if (msg.includes('maintenance') || msg.includes('failed to fetch')) {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('server-maintenance'));
        return;
      }
      if (error.message === "The user is not found") {
        toast.error("The user is not found");
      } else {
        toast.error(error.message || "Login failed. Please check your credentials.");
      }
    }
  };

  const handleResetPassword = async (e) => {
    if (e) e.preventDefault();
    if (!resetToken) {
      toast.error('Reset token is missing');
      return;
    }
    if (!resetNewPassword || resetNewPassword.length < 4) {
      toast.error('Password must be at least 4 characters');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setIsResetting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword: resetNewPassword })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Reset failed' }));
        throw new Error(err.message || 'Reset failed');
      }
      toast.success('Password reset successfully. Please login.');
      window.location.href = '/';
    } catch (e2) {
      toast.error(e2.message || 'Reset failed');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="dark min-h-screen w-full bg-[#03141a] text-[#E2F1EC] flex overflow-x-hidden font-sans">
      {/* Left Hero Pane (Matching Design 3: Feature Highlight) */}
      <div 
        className="hidden lg:flex lg:flex-1 relative p-10 xl:p-14 2xl:p-16 flex-col justify-between"
        style={{
          background: "linear-gradient(135deg, rgba(3, 20, 26, 0.90) 0%, rgba(4, 25, 31, 0.72) 50%, rgba(3, 20, 26, 0.94) 100%), url('/login-bg.jpg') center/cover no-repeat"
        }}
      >
        {/* Brand Logo in top-left */}
        <div className="flex items-center">
          <img src="/regen-emblem.svg" alt="ReGen" className="w-[135px] xl:w-[145px] h-auto object-contain" />
        </div>

        {/* Hero Content */}
        <div className="my-auto max-w-xl xl:max-w-2xl">
          <h1 className="login-hero-heading text-[38px] lg:text-[54px] xl:text-[58px] font-extrabold tracking-tight text-white leading-[1.10] mb-5">
            A Better<br />
            Workplace<br />
            Starts Here
          </h1>
          <p className="login-hero-desc text-[18px] lg:text-[22px] xl:text-[24px] text-[#8EA99D] font-normal leading-[1.5] mb-8 xl:mb-9">
            Seamless attendance.<br />
            Stronger teams.<br />
            Greater productivity.
          </p>

          {/* Three Feature Highlight Badges */}
          <div className="space-y-3.5 max-w-md">
            {/* Feature 1 */}
            <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-[#092226]/65 border border-[#16383b]/70 backdrop-blur-md transition-all hover:border-[#23EDCE]/40 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-[#23EDCE]/12 border border-[#23EDCE]/25 flex items-center justify-center shrink-0 text-[#23EDCE]">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#E2F1EC] leading-snug">Better Visibility</h3>
                <p className="text-xs text-[#8EA99D] mt-0.5">Track your workforce in real time</p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-[#092226]/65 border border-[#16383b]/70 backdrop-blur-md transition-all hover:border-[#23EDCE]/40 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-[#23EDCE]/12 border border-[#23EDCE]/25 flex items-center justify-center shrink-0 text-[#23EDCE]">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#E2F1EC] leading-snug">Higher Productivity</h3>
                <p className="text-xs text-[#8EA99D] mt-0.5">Streamline daily operations</p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-[#092226]/65 border border-[#16383b]/70 backdrop-blur-md transition-all hover:border-[#23EDCE]/40 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-[#23EDCE]/12 border border-[#23EDCE]/25 flex items-center justify-center shrink-0 text-[#23EDCE]">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#E2F1EC] leading-snug">Simpler Management</h3>
                <p className="text-xs text-[#8EA99D] mt-0.5">Everything in one place</p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-xs text-[#50726d]">
          © {new Date().getFullYear()} ReGen Innovations Inc. All rights reserved.
        </div>
      </div>

      {/* Right Login Pane */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 relative bg-[#03141a]">
        {/* Ambient Teal Glow */}
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#10B981]/10 rounded-full blur-[100px] pointer-events-none" />

        {/* Floating Login Card */}
        <div className="w-full max-w-md bg-[#081b21]/90 border border-[#1a3d44] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl rounded-3xl p-8 sm:p-10 relative z-10 transition-all">
          {/* Header */}
          <div className="flex flex-col items-center text-center">
            {/* Centered ReGen Emblem */}
            <div className="flex justify-center mb-4">
              <img
                src="/regen-emblem.svg"
                alt="ReGen"
                className="h-12 w-auto object-contain"
              />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white mb-1.5">Login to ReGen</h2>
            <p className="text-xs sm:text-sm text-[#8EA99D] mb-6">
              Access your ReGen account.
            </p>
          </div>

          {mode === 'login' ? (
            <div className="space-y-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5 text-left">
                  <Label htmlFor="loginUserId" className="text-xs font-semibold uppercase tracking-wider text-[#CBD5E1]">
                    User ID
                  </Label>
                  <Input 
                    id="loginUserId" 
                    value={loginUserId} 
                    onChange={(e) => setLoginUserId(e.target.value)} 
                    required 
                    placeholder="Enter your user ID" 
                    className="h-11 bg-[#0f272e] border-[#1b3d45] text-white placeholder:text-[#50726d] rounded-xl focus-visible:ring-1 focus-visible:ring-[#10B981] focus-visible:border-[#10B981]"
                  />
                </div>

                <div className="space-y-1.5 text-left">
                  <Label htmlFor="loginPassword" className="text-xs font-semibold uppercase tracking-wider text-[#CBD5E1]">
                    Password
                  </Label>
                  <div className="relative">
                    <Input 
                      id="loginPassword" 
                      type={showPassword ? "text" : "password"} 
                      value={loginPassword} 
                      onChange={(e) => setLoginPassword(e.target.value)} 
                      required 
                      placeholder="Enter your password" 
                      className="h-11 pr-10 bg-[#0f272e] border-[#1b3d45] text-white placeholder:text-[#50726d] rounded-xl focus-visible:ring-1 focus-visible:ring-[#10B981] focus-visible:border-[#10B981]"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(prev => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#688a84] hover:text-[#23EDCE] transition-colors"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full h-11 text-sm font-semibold rounded-xl bg-[#00A876] hover:bg-[#00B982] active:bg-[#009668] text-white shadow-[0_4px_16px_rgba(0,168,118,0.35)] transition-all flex items-center justify-center gap-2 mt-2"
                >
                  {isLoggingIn ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                      Verifying...
                    </span>
                  ) : (
                    "Login"
                  )} 
                </Button>
              </form>

              <Button 
                variant="outline" 
                className="w-full h-10 rounded-xl bg-[#0c242b] hover:bg-[#112d35] border-[#1c3e46] text-[#D1E3DC] text-xs font-medium transition-all"
                onClick={() => setMode('reset')}
              >
                Reset Password
              </Button>

              <div className="pt-3 text-center">
                <a 
                  href="/superadmin" 
                  className="inline-flex items-center gap-1.5 text-xs text-[#E5A83B] hover:text-[#F3B84C] font-semibold transition-colors"
                >
                  <span>👑</span> Super Admin Portal →
                </a>
              </div>

              <div className="pt-2 text-center text-[11px] text-[#6b8c85]">
                Made with <span className="text-red-500">❤️</span> by Krishub
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#0f272e] border border-[#1b3d45]">
                <h3 className="text-sm font-semibold text-white mb-1">Reset Password</h3>
                <p className="text-xs text-[#8EA99D]">Open the link from admin/owner or paste token below.</p>
              </div>

              <form onSubmit={handleResetPassword} className="space-y-3.5">
                <div className="space-y-1.5 text-left">
                  <Label htmlFor="resetToken" className="text-xs font-semibold uppercase tracking-wider text-[#CBD5E1]">
                    Reset Token
                  </Label>
                  <Input
                    id="resetToken"
                    name="resetToken"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Paste reset token"
                    className="h-10 bg-[#0f272e] border-[#1b3d45] text-white placeholder:text-[#50726d] rounded-xl text-xs"
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-1.5 text-left">
                  <Label htmlFor="resetNewPassword" className="text-xs font-semibold uppercase tracking-wider text-[#CBD5E1]">
                    New Password
                  </Label>
                  <Input
                    id="resetNewPassword"
                    name="newPassword"
                    type="password"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="h-10 bg-[#0f272e] border-[#1b3d45] text-white placeholder:text-[#50726d] rounded-xl text-xs"
                    autoComplete="new-password"
                  />
                </div>

                <div className="space-y-1.5 text-left">
                  <Label htmlFor="resetConfirmPassword" className="text-xs font-semibold uppercase tracking-wider text-[#CBD5E1]">
                    Confirm Password
                  </Label>
                  <Input
                    id="resetConfirmPassword"
                    name="confirmPassword"
                    type="password"
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="h-10 bg-[#0f272e] border-[#1b3d45] text-white placeholder:text-[#50726d] rounded-xl text-xs"
                    autoComplete="new-password"
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-11 text-sm font-semibold rounded-xl bg-[#00A876] hover:bg-[#00B982] text-white shadow-sm mt-2" 
                  disabled={isResetting}
                >
                  {isResetting ? 'Resetting...' : 'Reset Password'}
                </Button>
              </form>

              <Button 
                variant="outline" 
                className="w-full h-10 rounded-xl bg-[#0c242b] hover:bg-[#112d35] border-[#1c3e46] text-[#D1E3DC] text-xs font-medium" 
                onClick={() => setMode('login')}
              >
                Back to Login
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
