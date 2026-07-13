import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Building2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { lookupStartupInvite, claimStartupInvite, type PublicInviteInfo } from '../lib/db/incubator';
import { Card, PrimaryButton, SecondaryButton, Spinner } from '../components/incubator/ui';

type PageState = 'loading' | 'invalid' | 'already_claimed' | 'need_auth' | 'valid' | 'claiming' | 'success' | 'error';

export default function JoinStartupInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const token = params.get('token') ?? '';

  const [state, setState] = useState<PageState>('loading');
  const [invite, setInvite] = useState<PublicInviteInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('invalid');
      return;
    }
    if (authLoading) return;

    lookupStartupInvite(token)
      .then((info) => {
        setInvite(info);
        if (info.alreadyClaimed) {
          setState('already_claimed');
        } else {
          setState(user ? 'valid' : 'need_auth');
        }
      })
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setState('invalid');
      });
  }, [token, authLoading, user]);

  function handleSignIn() {
    navigate('/auth', { state: { from: `${location.pathname}${location.search}` } });
  }

  async function handleClaim() {
    setState('claiming');
    try {
      await claimStartupInvite(token);
      setState('success');
      setTimeout(() => navigate('/overview', { replace: true }), 1800);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already_has_company')) {
        setErrorMessage("You're already part of another workspace and can't claim a second one.");
      } else if (message.includes('company_already_claimed') || message.includes('invite_already_claimed')) {
        setErrorMessage('This invite has already been claimed.');
      } else {
        setErrorMessage(message);
      }
      setState('error');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#0c0c10' }}>
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.28)' }}
          >
            <Building2 size={16} style={{ color: '#a78bfa' }} />
          </div>
          <span className="text-sm font-bold text-white">WorkOS</span>
        </div>

        <Card className="p-8 text-center">
          {state === 'loading' && (
            <>
              <Spinner size={28} />
              <p className="text-sm text-white/40 mt-4">Checking invite…</p>
            </>
          )}

          {state === 'invalid' && (
            <>
              <XCircle size={26} className="text-red-400 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-white mb-1">Link expired or invalid</h2>
              <p className="text-sm text-white/40 mb-5">
                {errorMessage || "This invite link is no longer valid. Ask your incubator for a new one."}
              </p>
              <SecondaryButton onClick={() => navigate('/auth')}>Go to sign in</SecondaryButton>
            </>
          )}

          {state === 'already_claimed' && (
            <>
              <CheckCircle2 size={26} className="text-emerald-400 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-white mb-1">Already claimed</h2>
              <p className="text-sm text-white/40 mb-5">This invite has already been used to set up a profile.</p>
              <PrimaryButton onClick={() => navigate('/auth')}>Sign in</PrimaryButton>
            </>
          )}

          {state === 'need_auth' && invite && (
            <>
              <h2 className="text-lg font-bold text-white mb-1">You're invited</h2>
              <p className="text-sm text-white/40 mb-1">to join</p>
              <p className="text-xl font-bold text-white mb-4">{invite.startupName ?? 'a program'}</p>
              <div className="text-left bg-white/[0.03] border border-white/10 rounded-lg p-4 mb-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/40">Incubator</span>
                  <span className="text-white font-medium">{invite.incubatorName}</span>
                </div>
                {invite.cohortName && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Cohort</span>
                    <span className="text-white font-medium">{invite.cohortName}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-white/30 mb-4 flex items-center justify-center gap-1.5">
                <Clock size={12} /> Sign in or create an account to accept
              </p>
              <PrimaryButton onClick={handleSignIn} className="w-full">
                Sign in to accept
              </PrimaryButton>
            </>
          )}

          {state === 'valid' && invite && (
            <>
              <h2 className="text-lg font-bold text-white mb-1">You're invited</h2>
              <p className="text-sm text-white/40 mb-1">to join</p>
              <p className="text-xl font-bold text-white mb-4">{invite.startupName ?? 'a program'}</p>
              <div className="text-left bg-white/[0.03] border border-white/10 rounded-lg p-4 mb-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/40">Incubator</span>
                  <span className="text-white font-medium">{invite.incubatorName}</span>
                </div>
                {invite.cohortName && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Cohort</span>
                    <span className="text-white font-medium">{invite.cohortName}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-white/30 mb-5">
                Once you accept, {invite.incubatorName} will be able to see this company's metrics for program oversight.
              </p>
              <PrimaryButton onClick={handleClaim} className="w-full">
                Create your profile
              </PrimaryButton>
            </>
          )}

          {state === 'claiming' && (
            <>
              <Spinner size={28} />
              <p className="text-sm text-white/40 mt-4">Setting up your workspace…</p>
            </>
          )}

          {state === 'success' && (
            <>
              <CheckCircle2 size={26} className="text-emerald-400 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-white mb-1">You're in!</h2>
              <p className="text-sm text-white/40">Taking you to your dashboard…</p>
            </>
          )}

          {state === 'error' && (
            <>
              <XCircle size={26} className="text-red-400 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-white mb-1">Couldn't complete this</h2>
              <p className="text-sm text-white/40 mb-5">{errorMessage}</p>
              <SecondaryButton onClick={() => navigate('/overview')}>Go to dashboard</SecondaryButton>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
