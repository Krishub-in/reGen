import { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Send,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { useGetEmployeePolicyStatus, useAcceptPolicy, useDeclinePolicy } from '../hooks/useQueries';

export default function PolicyGate({ userProfile }) {
  const isSuperAdmin = userProfile?.role === 'param';
  const isOwner = userProfile?.role === 'owner';

  // Only employees/staff/interns/freelancers/admins are subject to employee policy gating
  if (isSuperAdmin || isOwner) {
    return null;
  }

  const { data: policyStatus, isLoading } = useGetEmployeePolicyStatus();
  const acceptMutation = useAcceptPolicy();
  const declineMutation = useDeclinePolicy();

  // Decline reason input state
  const [showDeclineInput, setShowDeclineInput] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  const hasBlocked = policyStatus?.hasBlockedPolicy;
  const blockedList = policyStatus?.blockedPolicies || [];
  const pendingList = policyStatus?.pendingPolicies || [];

  const currentBlocked = blockedList[0];
  const currentPending = pendingList[0];

  const handleAccept = async (policyId) => {
    try {
      await acceptMutation.mutateAsync(policyId);
      toast.success('Policy accepted. Workspace access enabled.');
      setShowDeclineInput(false);
      setDeclineReason('');
    } catch (err) {
      toast.error(err.message || 'Failed to accept policy');
    }
  };

  const handleDecline = async (policyId) => {
    if (!declineReason || !declineReason.trim()) {
      toast.error('Please enter a reason for declining this policy');
      return;
    }

    try {
      await declineMutation.mutateAsync({
        policyId,
        reason: declineReason.trim(),
      });
      toast.info('Reason submitted to company owner. Workspace is paused until reviewed.');
      setShowDeclineInput(false);
      setDeclineReason('');
    } catch (err) {
      toast.error(err.message || 'Failed to submit decline');
    }
  };

  // Case 1: Employee is BLOCKED because they declined a policy and owner hasn't allowed them yet!
  if (hasBlocked && currentBlocked) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 overflow-y-auto">
        <div className="w-full max-w-xl bg-white dark:bg-[#15232D] border border-amber-500/40 rounded-3xl shadow-2xl overflow-hidden p-5 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200 my-auto">
          <div className="flex items-center gap-3.5 pb-4 border-b border-[#DFE8EC] dark:border-[#2A3D48]">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-[#172B3A] dark:text-[#E8F0F4]">
                  Work Access Restricted
                </h2>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40 text-[10px]">
                  Awaiting Owner Approval
                </Badge>
              </div>
              <p className="text-xs text-[#64748B] dark:text-[#A6B5C0] mt-0.5">
                You declined a mandatory company policy. Access to your workspace is paused.
              </p>
            </div>
          </div>

          {/* Policy Information Card */}
          <div className="p-4 rounded-2xl bg-[#F4F8FA] dark:bg-[#1D303B] border border-[#DFE8EC] dark:border-[#2A3D48] space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#172B3A] dark:text-[#E8F0F4] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0D9488]" />
                <span>{currentBlocked.title}</span>
              </h3>
              {currentBlocked.effectiveDate && (
                <span className="text-[11px] text-[#64748B] dark:text-[#A6B5C0]">
                  Effective: {currentBlocked.effectiveDate}
                </span>
              )}
            </div>
            <div className="text-xs text-[#64748B] dark:text-[#A6B5C0] max-h-32 overflow-y-auto leading-relaxed whitespace-pre-wrap pr-1 bg-white/60 dark:bg-[#15232D]/60 p-3 rounded-xl border border-[#DFE8EC]/60 dark:border-[#2A3D48]/60">
              {currentBlocked.content}
            </div>
          </div>

          {/* Reason Submitted by Employee */}
          <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-500/30 space-y-1.5">
            <p className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Your Reason for Declining:</span>
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300 italic bg-white/80 dark:bg-[#15232D]/80 p-2.5 rounded-xl border border-amber-500/20">
              "{currentBlocked.declineReason || 'No reason provided'}"
            </p>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 pt-1">
              Your explanation has been sent to the company owner. Until the owner reviews your reason and allows you to work forward, access to workspace actions remains locked.
            </p>
          </div>

          {/* Option to Change Mind and Accept */}
          <div className="pt-2 border-t border-[#DFE8EC] dark:border-[#2A3D48] flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-xs text-[#64748B] dark:text-[#A6B5C0] text-center sm:text-left">
              Changed your mind? You can accept the policy now to resume work immediately.
            </span>
            <Button
              onClick={() => handleAccept(currentBlocked.policyId)}
              disabled={acceptMutation.isPending}
              className="w-full sm:w-auto bg-[#0D9488] hover:bg-[#0B7A70] text-white font-semibold text-xs h-9 rounded-xl shadow-sm px-4 gap-1.5 shrink-0"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{acceptMutation.isPending ? 'Accepting...' : 'Accept Policy Now'}</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: Employee has PENDING policy to review
  if (currentPending) {
    return (
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent className="w-[95vw] max-w-lg bg-white dark:bg-[#15232D] border-[#DFE8EC] dark:border-[#2A3D48] rounded-3xl p-6 sm:p-7 shadow-2xl">
          <DialogHeader className="pb-3 border-b border-[#DFE8EC] dark:border-[#2A3D48]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6] flex items-center justify-center shrink-0 border border-[#0D9488]/20">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-[#172B3A] dark:text-[#E8F0F4]">
                  Company Policy Acknowledgment
                </DialogTitle>
                <DialogDescription className="text-xs text-[#64748B] dark:text-[#A6B5C0]">
                  Please review the updated company policy below.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-[#172B3A] dark:text-[#E8F0F4]">
                  {currentPending.title}
                </h4>
                {currentPending.effectiveDate && (
                  <Badge variant="outline" className="text-[10px] text-[#64748B]">
                    Effective: {currentPending.effectiveDate}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-[#64748B] dark:text-[#A6B5C0] max-h-48 overflow-y-auto leading-relaxed whitespace-pre-wrap p-3.5 rounded-2xl bg-[#F4F8FA] dark:bg-[#1D303B] border border-[#DFE8EC] dark:border-[#2A3D48]">
                {currentPending.content}
              </div>
            </div>

            {/* Decline Reason Section */}
            {showDeclineInput && (
              <div className="space-y-2 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 animate-in fade-in duration-200">
                <Label className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  Reason for Declining *
                </Label>
                <Textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Explain why you are declining this policy (this will be sent to the company owner for review)..."
                  rows={3}
                  className="rounded-xl text-xs bg-card border-amber-500/30"
                />
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  Note: Declining pauses your user workspace until the company owner reads your reason and allows you to work forward.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2.5">
              {!showDeclineInput ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowDeclineInput(true)}
                    className="w-full sm:w-auto text-xs h-9 rounded-xl border-[#DFE8EC] dark:border-[#2A3D48] text-rose-600 hover:bg-rose-500/10"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                    Decline with Reason
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleAccept(currentPending.policyId)}
                    disabled={acceptMutation.isPending}
                    className="w-full sm:w-auto text-xs h-9 rounded-xl bg-[#0D9488] hover:bg-[#0B7A70] text-white font-semibold gap-1.5 shadow-sm"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{acceptMutation.isPending ? 'Accepting...' : 'Accept & Work Normal'}</span>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowDeclineInput(false)}
                    className="w-full sm:w-auto text-xs h-9 rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleDecline(currentPending.policyId)}
                    disabled={declineMutation.isPending}
                    className="w-full sm:w-auto text-xs h-9 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{declineMutation.isPending ? 'Submitting...' : 'Submit Reason to Owner'}</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}
