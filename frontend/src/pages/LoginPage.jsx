import { useEffect, useState } from 'react';
import { useCustomAuth } from '../hooks/useCustomAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import Footer from '../components/Footer';

export default function LoginPage({ resetToken: resetTokenProp }) {
  const { login, isLoggingIn } = useCustomAuth();
  
  const [imgError, setImgError] = useState(false);
  const [logoSrc, setLogoSrc] = useState('/logo.jpeg');
  
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
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8 bg-card border border-border p-8 rounded-xl shadow-lg">
          {/* Header */}
          <div className="flex flex-col items-center text-center">
            <div className="flex justify-center mb-6">
              {!imgError ? (
                <img
                  src={logoSrc}
                  alt="reGen"
                  className="object-contain"
                  onError={() => {
                    if (logoSrc === '/logo.jpeg') {
                      setLogoSrc('/logo.png');
                    } else {
                      setImgError(true);
                    }
                  }}
                />
              ) : (
                <div className="h-24 w-64" />
              )}
            </div>
            <h1 className="text-2xl font-bold mb-2">Login to reGen</h1>
            <p className="text-muted-foreground max-w-xs">
              Access your reGen account.
            </p>
          </div>

          {mode === 'login' ? (
            <>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2 text-left">
                  <Label htmlFor="loginUserId">User ID</Label>
                  <Input 
                      id="loginUserId" 
                      value={loginUserId} 
                      onChange={(e) => setLoginUserId(e.target.value)} 
                      required 
                      placeholder="Enter User ID" 
                      className="h-12"
                  />
                </div>
                <div className="space-y-2 text-left">
                  <Label htmlFor="loginPassword">Password</Label>
                  <div className="relative">
                    <Input 
                        id="loginPassword" 
                        type={showPassword ? "text" : "password"} 
                        value={loginPassword} 
                        onChange={(e) => setLoginPassword(e.target.value)} 
                        required 
                        placeholder="Enter Password" 
                        className="h-12 pr-10"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(prev => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full h-14 text-lg font-medium rounded-xl shadow-sm"
                >
                  {isLoggingIn ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                      Verifying...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-3">
                      Login
                    </span>
                  )} 
                </Button>
              </form>
              <Separator />
              <Button variant="outline" className="w-full" onClick={() => setMode('reset')}>
                Reset Password
              </Button>
              <div className="pt-2 text-center">
                <a 
                  href="/superadmin" 
                  className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1 font-medium"
                >
                  👑 Super Admin Portal →
                </a>
              </div>
            </>
          ) : (
            <>
              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-lg">Reset Password</CardTitle>
                  <CardDescription>Open the link from admin/owner or paste token below.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="resetToken">Reset Token</Label>
                      <Input
                        id="resetToken"
                        name="resetToken"
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        placeholder="Paste reset token"
                        className="h-12"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="resetNewPassword">New Password</Label>
                      <Input
                        id="resetNewPassword"
                        name="newPassword"
                        type="password"
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        className="h-12"
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="resetConfirmPassword">Confirm Password</Label>
                      <Input
                        id="resetConfirmPassword"
                        name="confirmPassword"
                        type="password"
                        value={resetConfirmPassword}
                        onChange={(e) => setResetConfirmPassword(e.target.value)}
                        className="h-12"
                        autoComplete="new-password"
                      />
                    </div>
                    <Button type="submit" className="w-full h-14 text-lg font-medium rounded-xl shadow-sm" disabled={isResetting}>
                      {isResetting ? 'Resetting...' : 'Reset Password'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
              <Button variant="outline" className="w-full" onClick={() => setMode('login')}>
                Back to Login
              </Button>
            </>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
