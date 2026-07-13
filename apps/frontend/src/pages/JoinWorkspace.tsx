import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Hexagon, CheckCircle, XCircle, Loader, ShieldCheck, Clock } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { lookupInviteToken, acceptInviteToken } from '../lib/db/team';
import type { RoleId } from '../lib/supabase';

const ACCENT = '#C1AEFF';
const FF = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif';

const BLOB_KF = `
@keyframes jw-a {
  0%,100% { transform: translate(0,0) scale(1); }
  33%      { transform: translate(50px,-40px) scale(1.07); }
  66%      { transform: translate(-30px,25px) scale(0.95); }
}
@keyframes jw-b {
  0%,100% { transform: translate(0,0) scale(1); }
  33%      { transform: translate(-40px,30px) scale(1.05); }
  66%      { transform: translate(40px,-25px) scale(0.97); }
}
@keyframes jw-in {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

const ROLE_LABELS: Record<string, string> = {
  co_founder: 'Co-Founder', admin: 'Admin', analyst: 'Analyst',
  engineer: 'Engineer', viewer: 'Viewer', vc: 'VC Partner',
  founder: 'Founder', super_admin: 'Super Admin',
};

type PageState = 'loading' | 'valid' | 'invalid' | 'accepting' | 'success' | 'error' | 'need_auth' | 'already_company';

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{BLOB_KF}</style>
      <div style={{ minHeight: '100vh', background: '#07070f', position: 'relative', overflow: 'hidden', fontFamily: FF, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Blobs */}
        <div style={{ position: 'fixed', width: '55vw', height: '55vw', borderRadius: '50%', background: 'radial-gradient(ellipse at 40% 40%, rgba(167,139,250,0.5) 0%, rgba(109,40,217,0.3) 35%, transparent 70%)', top: '-15vw', left: '-10vw', filter: 'blur(70px)', animation: 'jw-a 16s ease-in-out infinite', pointerEvents: 'none', zIndex: 0 }} />
        <div style={{ position: 'fixed', width: '40vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(99,60,219,0.25) 0%, transparent 65%)', bottom: '-8vw', right: '-5vw', filter: 'blur(80px)', animation: 'jw-b 20s ease-in-out infinite', pointerEvents: 'none', zIndex: 0 }} />
        <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(4,4,12,0.65) 100%)', pointerEvents: 'none', zIndex: 1 }} />

        {/* Logo */}
        <div style={{ position: 'fixed', top: 28, left: 36, display: 'flex', alignItems: 'center', gap: 10, zIndex: 20 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg, rgba(249,198,255,0.9), rgba(193,174,255,0.9))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Hexagon size={16} color="#161618" fill="#161618" strokeWidth={1.5} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.01em' }}>WorkOS</span>
        </div>

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 440, padding: '0 24px' }}>
          {children}
        </div>
      </div>
    </>
  );
}

function GlassCard({ children, centered = true }: { children: React.ReactNode; centered?: boolean }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 20, padding: '36px 32px', animation: 'jw-in 0.4s ease',
      textAlign: centered ? 'center' : 'left',
    }}>
      {children}
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', padding: '13px', borderRadius: 12, border: 'none',
      background: `linear-gradient(135deg, #F9C6FF, ${ACCENT})`,
      color: '#0d0b1a', fontSize: 14, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: FF, opacity: disabled ? 0.55 : 1, transition: 'transform 0.15s',
      boxShadow: '0 6px 20px rgba(193,174,255,0.25)',
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', padding: '12px', borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.08)', background: 'transparent',
      color: 'rgba(255,255,255,0.38)', fontSize: 14, cursor: 'pointer',
      fontFamily: FF, transition: 'color 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.38)'; }}
    >
      {children}
    </button>
  );
}

export default function JoinWorkspace() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();

  const token = params.get('token') ?? '';

  const [state, setState] = useState<PageState>('loading');
  const [inviteInfo, setInviteInfo] = useState<{
    companyName: string; role: RoleId; expiresAt: string; valid: boolean;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    lookupInviteToken(token).then(info => {
      if (!info || !info.valid) { setState('invalid'); return; }
      setInviteInfo(info);
      setState(authLoading ? 'loading' : profile?.company_id ? 'already_company' : user ? 'valid' : 'need_auth');
    });
  }, [token, authLoading, user, profile?.company_id]);

  useEffect(() => {
    if (authLoading) return;
    if (profile?.company_id) { setState('already_company'); return; }
    if (state === 'loading' && inviteInfo) setState(user ? 'valid' : 'need_auth');
    if (state === 'need_auth' && user && inviteInfo) setState('valid');
  }, [authLoading, user, profile?.company_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state !== 'already_company') return;
    const timer = window.setTimeout(() => { navigate('/overview', { replace: true }); }, 2400);
    return () => window.clearTimeout(timer);
  }, [state, navigate]);

  async function handleAccept() {
    if (!user || !inviteInfo) return;
    if (profile?.company_id) { setState('already_company'); return; }
    setState('accepting');
    const result = await acceptInviteToken(token, user.id);
    if (!result.success) { setErrorMsg(result.error ?? 'Something went wrong.'); setState('error'); return; }
    await refreshProfile();
    setState('success');
    setTimeout(() => navigate('/overview', { replace: true }), 2000);
  }

  function handleSignIn() { navigate(`/auth?redirect=/join?token=${token}`); }

  if (state === 'loading') {
    return (
      <PageShell>
        <GlassCard>
          <Loader size={32} style={{ color: ACCENT, animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', margin: 0 }}>Checking invite link…</p>
        </GlassCard>
      </PageShell>
    );
  }

  if (state === 'invalid') {
    return (
      <PageShell>
        <GlassCard>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <XCircle size={26} color="#f87171" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.02em' }}>
            Link Expired or Invalid
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, margin: '0 0 28px' }}>
            This invite link is no longer valid. It may have expired or already been used. Ask the workspace admin to send a new one.
          </p>
          <PrimaryBtn onClick={() => navigate('/auth')}>Go to Sign In</PrimaryBtn>
        </GlassCard>
      </PageShell>
    );
  }

  if (state === 'already_company') {
    return (
      <PageShell>
        <GlassCard>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <CheckCircle size={26} color="#34d399" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.02em' }}>Already set up</h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, margin: '0 0 28px' }}>
            You are already part of a workspace and cannot join another.
          </p>
          <PrimaryBtn onClick={() => navigate('/overview', { replace: true })}>Open Dashboard</PrimaryBtn>
        </GlassCard>
      </PageShell>
    );
  }

  if (state === 'need_auth') {
    return (
      <PageShell>
        <GlassCard>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(193,174,255,0.08)', border: '1px solid rgba(193,174,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <ShieldCheck size={26} color={ACCENT} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>You're Invited</h2>
          {inviteInfo && (
            <div style={{ margin: '0 0 20px' }}>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: '0 0 4px' }}>to join</p>
              <p style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>{inviteInfo.companyName}</p>
              <span style={{ fontSize: 13, color: ACCENT, fontWeight: 600 }}>
                as {ROLE_LABELS[inviteInfo.role] ?? inviteInfo.role}
              </span>
            </div>
          )}
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)', margin: '0 0 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Clock size={13} /> Sign in to accept this invite
          </p>
          <PrimaryBtn onClick={handleSignIn}>Sign In to Accept</PrimaryBtn>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 16 }}>
            No account?{' '}
            <span onClick={handleSignIn} style={{ color: ACCENT, cursor: 'pointer' }}>Create one</span>
            {' '}and come back to this link.
          </p>
        </GlassCard>
      </PageShell>
    );
  }

  if (state === 'valid' && inviteInfo) {
    const expiresIn = Math.ceil((new Date(inviteInfo.expiresAt).getTime() - Date.now()) / 86400000);
    return (
      <PageShell>
        <GlassCard centered={false}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(193,174,255,0.08)', border: '1px solid rgba(193,174,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <ShieldCheck size={26} color={ACCENT} />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>You're Invited</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: 0 }}>You've been invited to join a workspace on WorkOS</p>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>Workspace</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>{inviteInfo.companyName}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>Your Role</p>
              <span style={{ fontSize: 13, fontWeight: 600, color: ACCENT, background: 'rgba(193,174,255,0.1)', padding: '4px 12px', borderRadius: 8 }}>
                {ROLE_LABELS[inviteInfo.role] ?? inviteInfo.role}
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={12} /> Expires in {expiresIn} day{expiresIn !== 1 ? 's' : ''}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PrimaryBtn onClick={handleAccept}>Accept & Join Workspace</PrimaryBtn>
            <GhostBtn onClick={() => navigate('/')}>Decline</GhostBtn>
          </div>
        </GlassCard>
      </PageShell>
    );
  }

  if (state === 'accepting') {
    return (
      <PageShell>
        <GlassCard>
          <Loader size={32} style={{ color: ACCENT, animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: '#fff', margin: '0 0 6px' }}>Joining workspace…</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Setting up your access</p>
        </GlassCard>
      </PageShell>
    );
  }

  if (state === 'success') {
    return (
      <PageShell>
        <GlassCard>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <CheckCircle size={26} color="#34d399" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.02em' }}>You're In!</h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', margin: 0 }}>
            Welcome to {inviteInfo?.companyName}. Taking you to the dashboard…
          </p>
        </GlassCard>
      </PageShell>
    );
  }

  if (state === 'error') {
    return (
      <PageShell>
        <GlassCard>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <XCircle size={26} color="#f87171" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.02em' }}>Couldn't Join</h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', margin: '0 0 28px' }}>{errorMsg}</p>
          <PrimaryBtn onClick={() => navigate('/overview')}>Go to Dashboard</PrimaryBtn>
        </GlassCard>
      </PageShell>
    );
  }

  return null;
}
