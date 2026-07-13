import { useState } from 'react';
import { Hexagon, Clock, LogOut, RefreshCcw, Building2, CheckCircle } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { DbUserProfile } from '../lib/supabase';

export default function PendingApproval() {
  const { profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);

  async function handleCheckStatus() {
    setChecking(true);
    try {
      await refreshProfile();
      const freshProfile = await api.get<DbUserProfile>('/api/me');
      if (freshProfile?.company_id) {
        await refreshProfile();
        navigate('/overview', { replace: true });
        return;
      }
    } catch (error) {
      console.error('[pending] status check failed', error);
    } finally {
      setChecking(false);
    }
    setChecked(true);
  }

  async function handleSignOut() {
    await signOut();
    navigate('/auth', { replace: true });
  }

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'there';

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#161618' }}>
      <div className="w-full max-w-md px-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #F9C6FF, #C1AEFF)' }}
          >
            <Hexagon size={24} color="#161618" fill="#161618" strokeWidth={1.5} />
          </div>
          <span className="text-white text-2xl font-semibold tracking-tight">WorkOS</span>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8 text-center" style={{ background: '#1B1B1D' }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: 'rgba(193,174,255,0.1)' }}>
            <Clock className="w-8 h-8" style={{ color: '#C1AEFF' }} />
          </div>

          <h2 className="text-white text-xl font-semibold mb-2">
            Waiting for approval, {displayName}
          </h2>
          <p className="text-sm mb-6 leading-relaxed" style={{ color: '#5E5E5E' }}>
            Your request to join a workspace has been sent. The founder or admin will
            review it and grant you access. This usually takes a few hours.
          </p>

          {/* What happens next */}
          <div className="rounded-xl p-4 mb-6 text-left space-y-3" style={{ background: '#161618' }}>
            {[
              'Founder reviews your request',
              'You get assigned a role (analyst, viewer, etc.)',
              'You\'re added to the workspace automatically',
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                  style={{ background: 'rgba(193,174,255,0.15)', color: '#C1AEFF' }}
                >
                  {i + 1}
                </div>
                <span className="text-sm" style={{ color: '#5E5E5E' }}>{step}</span>
              </div>
            ))}
          </div>

          {checked && (
            <div className="rounded-xl px-4 py-3 mb-4 flex items-center gap-2"
              style={{ background: 'rgba(52,211,153,0.08)', color: '#34d399' }}>
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span className="text-sm">Still pending — no approval yet. Check back soon.</span>
            </div>
          )}

          <button
            onClick={handleCheckStatus}
            disabled={checking}
            className="w-full py-3 rounded-xl text-sm font-semibold mb-3 flex items-center justify-center gap-2 transition-opacity"
            style={{
              background: 'linear-gradient(135deg, #F9C6FF, #C1AEFF)',
              color: '#161618',
              opacity: checking ? 0.6 : 1,
            }}
          >
            {checking
              ? <><div className="w-4 h-4 border-2 border-gray-800/30 border-t-gray-800 rounded-full animate-spin" /> Checking…</>
              : <><RefreshCcw className="w-4 h-4" /> Check Approval Status</>
            }
          </button>

          <button
            onClick={() => navigate('/onboarding')}
            className="w-full py-2.5 rounded-xl text-sm font-medium mb-2 flex items-center justify-center gap-2 transition-all hover:opacity-80"
            style={{ background: '#161618', color: '#5E5E5E' }}
          >
            <Building2 className="w-4 h-4" />
            Create my own workspace instead
          </button>

          <button
            onClick={handleSignOut}
            className="w-full py-2 text-xs flex items-center justify-center gap-1.5 transition-colors hover:text-gray-400"
            style={{ color: '#3E3E3E' }}
          >
            <LogOut className="w-3 h-3" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
