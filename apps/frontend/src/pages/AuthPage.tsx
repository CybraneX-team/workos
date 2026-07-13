import { useState } from 'react';
import { Hexagon, Eye, EyeOff, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import SpaceAuthLayout from '../components/SpaceAuthLayout';

const ACCENT = '#C1AEFF';
const ACCENT2 = '#ec4899';

/* ── Left panel: liquid gradient blobs + logo + tagline ── */
function FounderLeft() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '100vh', overflow: 'hidden', background: '#06060e' }}>

      {/* Blob 1 — large violet core */}
      <div style={{
        position: 'absolute',
        width: '75%', height: '75%',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at 38% 38%, rgba(167,139,250,0.85) 0%, rgba(109,40,217,0.7) 30%, rgba(76,29,149,0.45) 55%, transparent 75%)',
        top: '8%', left: '5%',
        filter: 'blur(48px)',
        animation: 'blob-a 14s ease-in-out infinite',
      }} />

      {/* Blob 2 — pink accent, offset */}
      <div style={{
        position: 'absolute',
        width: '55%', height: '55%',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at 60% 40%, rgba(236,72,153,0.6) 0%, rgba(157,23,77,0.35) 45%, transparent 70%)',
        top: '35%', left: '30%',
        filter: 'blur(60px)',
        animation: 'blob-b 18s ease-in-out infinite',
      }} />

      {/* Blob 3 — deep indigo shadow */}
      <div style={{
        position: 'absolute',
        width: '60%', height: '60%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 65%)',
        top: '20%', left: '25%',
        filter: 'blur(70px)',
        animation: 'blob-c 22s ease-in-out infinite',
      }} />

      {/* Dark overlay to add depth/contrast */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(4,4,12,0.55) 100%)',
      }} />

      {/* ── Logo — top left ── */}
      <div style={{ position: 'absolute', top: 36, left: 40, display: 'flex', alignItems: 'center', gap: 10, zIndex: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, rgba(249,198,255,0.9), rgba(193,174,255,0.9))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(193,174,255,0.3)' }}>
          <Hexagon size={18} color="#161618" fill="#161618" strokeWidth={1.5} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)', letterSpacing: '-0.01em' }}>WorkOS</span>
      </div>

      {/* ── Tagline — bottom left ── */}
      <div style={{ position: 'absolute', bottom: 44, left: 44, zIndex: 10, maxWidth: 340 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(193,174,255,0.55)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
          Founder Portal
        </p>
        <h2 style={{ fontSize: 34, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.18, margin: 0, textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>
          Your universe.<br />
          <span style={{ background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Fully mapped.
          </span>
        </h2>
      </div>
    </div>
  );
}

/* ── Shared glass input ── */
function Input({ focused, setFocused, accent = ACCENT, ...props }: {
  focused: string | null; setFocused: (v: string | null) => void; accent?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const isFocused = focused === props.name;
  return (
    <input
      {...props}
      onFocus={() => setFocused(props.name ?? null)}
      onBlur={() => setFocused(null)}
      style={{
        width: '100%', boxSizing: 'border-box',
        background: isFocused ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${isFocused ? accent + '45' : 'rgba(255,255,255,0.09)'}`,
        borderRadius: 12, padding: '13px 16px', fontSize: 14,
        color: '#fff', outline: 'none', fontFamily: 'inherit',
        boxShadow: isFocused ? `0 0 0 3px ${accent}14` : 'none',
        transition: 'all 0.18s',
        ...(props.style ?? {}),
      }}
    />
  );
}

type Mode = 'signin' | 'signup';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode]           = useState<Mode>('signin');
  const [loading, setLoading]     = useState(false);
  const [showPw, setShowPw]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<string | null>(null); // holds the email address
  const [form, setForm]           = useState({ email: '', password: '', first_name: '', last_name: '' });
  const [focused, setFocused]     = useState<string | null>(null);

  function set(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError(null);
  }

  function switchMode(m: Mode) {
    setMode(m); setError(null); setEmailSent(null);
    setForm({ email: '', password: '', first_name: '', last_name: '' });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true); setError(null);
    try {
      if (mode === 'signin') {
        const { error: err } = await signIn(form.email, form.password);
        if (err) { setError(err); return; }
        localStorage.removeItem('active_role');
      } else {
        if (!form.first_name.trim()) { setError('First name is required'); return; }
        const { error: err, needsEmailConfirm } = await signUp(form.email, form.password, {
          first_name: form.first_name.trim(), last_name: form.last_name.trim(),
        });
        if (err) { setError(err); return; }
        localStorage.removeItem('active_role');
        if (needsEmailConfirm) {
          setEmailSent(form.email); // show verification screen
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  /* ── Email verification sent screen ── */
  if (emailSent) {
    return (
      <SpaceAuthLayout leftPanel={<FounderLeft />}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          {/* Icon */}
          <div style={{
            width: 72, height: 72, borderRadius: '50%', marginBottom: 28,
            background: 'rgba(193,174,255,0.08)',
            border: '1px solid rgba(193,174,255,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 40px rgba(193,174,255,0.1)',
          }}>
            <Mail size={30} color={ACCENT} />
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', letterSpacing: '-0.025em', margin: '0 0 10px' }}>
            Check your inbox
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', margin: '0 0 6px', lineHeight: 1.6 }}>
            We sent a verification link to
          </p>
          <p style={{ fontSize: 14, fontWeight: 600, color: ACCENT, margin: '0 0 28px', wordBreak: 'break-all' }}>
            {emailSent}
          </p>

          {/* Instruction box */}
          <div style={{
            width: '100%', padding: '18px 20px', borderRadius: 14, marginBottom: 28,
            background: 'rgba(193,174,255,0.05)',
            border: '1px solid rgba(193,174,255,0.14)',
            textAlign: 'left',
          }}>
            {[
              'Open the email from WorkOS',
              'Click the "Verify your email" link',
              'Come back here and sign in',
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < 2 ? 12 : 0 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(193,174,255,0.12)', border: '1px solid rgba(193,174,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: ACCENT,
                }}>
                  {i + 1}
                </div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{step}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => { setEmailSent(null); switchMode('signin'); }}
            style={{
              width: '100%', padding: '13px', borderRadius: 12, border: 'none',
              background: `linear-gradient(135deg, ${ACCENT} 0%, #9b7fee 100%)`,
              color: '#0d0b1a', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 6px 22px rgba(193,174,255,0.28)', fontFamily: 'inherit',
              transition: 'transform 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            Go to Sign In
          </button>

          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 16 }}>
            Didn't receive it? Check your spam folder or{' '}
            <span
              onClick={() => setEmailSent(null)}
              style={{ color: ACCENT, cursor: 'pointer' }}
            >
              try again
            </span>
          </p>
        </div>
      </SpaceAuthLayout>
    );
  }

  return (
    <SpaceAuthLayout leftPanel={<FounderLeft />}>

      {/* Heading */}
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: '-0.025em', margin: '0 0 6px' }}>
          {mode === 'signin' ? 'Welcome back' : 'Create account'}
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', margin: 0 }}>
          {mode === 'signin' ? 'Sign in to your founder workspace' : 'Start your founder journey today'}
        </p>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,0.07)', marginBottom: 28 }}>
        {(['signin', 'signup'] as Mode[]).map(m => (
          <button key={m} type="button" onClick={() => switchMode(m)} style={{
            flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.18s',
            background: mode === m ? 'rgba(193,174,255,0.13)' : 'transparent',
            color: mode === m ? ACCENT : 'rgba(255,255,255,0.32)',
            boxShadow: mode === m ? 'inset 0 1px 0 rgba(193,174,255,0.18)' : 'none',
          }}>
            {m === 'signin' ? 'Sign In' : 'Sign Up'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mode === 'signup' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <Input focused={focused} setFocused={setFocused} name="first_name" type="text" placeholder="First name" value={form.first_name} onChange={set} required />
            <Input focused={focused} setFocused={setFocused} name="last_name" type="text" placeholder="Last name" value={form.last_name} onChange={set} />
          </div>
        )}

        <Input focused={focused} setFocused={setFocused} name="email" type="email" placeholder="Email address" value={form.email} onChange={set} required />

        <div style={{ position: 'relative' }}>
          <Input focused={focused} setFocused={setFocused} name="password" type={showPw ? 'text' : 'password'} placeholder="Password" value={form.password} onChange={set} required minLength={6} style={{ paddingRight: 48 }} />
          <button type="button" onClick={() => setShowPw(p => !p)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}>
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {mode === 'signin' && (
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 12, color: `rgba(193,174,255,0.4)`, cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = ACCENT)}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(193,174,255,0.4)')}>
              Forgot password?
            </span>
          </div>
        )}

        {error && <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#f87171' }}>{error}</div>}

        <button type="submit" disabled={loading} style={{
          width: '100%', padding: '13px', borderRadius: 12, marginTop: 4,
          background: `linear-gradient(135deg, ${ACCENT} 0%, #9b7fee 100%)`,
          color: '#0d0b1a', fontSize: 14, fontWeight: 700, border: 'none',
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.65 : 1,
          boxShadow: '0 6px 22px rgba(193,174,255,0.32)', fontFamily: 'inherit',
          transition: 'opacity 0.2s, transform 0.15s, box-shadow 0.2s',
        }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      {/* Bottom links */}
      <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.28)', margin: 0 }}>
          {mode === 'signin' ? 'New to WorkOS? ' : 'Already have an account? '}
          <span onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            style={{ color: ACCENT, cursor: 'pointer', fontWeight: 600 }}>
            {mode === 'signin' ? 'Create account' : 'Sign in'}
          </span>
        </p>
        <div style={{ display: 'flex', gap: 20 }}>
          <span style={{ fontSize: 12, color: 'rgba(34,211,238,0.3)', cursor: 'pointer', transition: 'color 0.15s' }}
            onClick={() => navigate('/auth/vc')}
            onMouseEnter={e => (e.currentTarget.style.color = '#22d3ee')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(34,211,238,0.3)')}>
            VC Partner →
          </span>
          <span style={{ fontSize: 12, color: 'rgba(167,139,250,0.3)', cursor: 'pointer', transition: 'color 0.15s' }}
            onClick={() => navigate('/auth/incubator')}
            onMouseEnter={e => (e.currentTarget.style.color = '#a78bfa')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(167,139,250,0.3)')}>
            Incubator →
          </span>
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.13)', marginTop: 28 }}>
        By continuing you agree to our Terms of Service
      </p>
    </SpaceAuthLayout>
  );
}
