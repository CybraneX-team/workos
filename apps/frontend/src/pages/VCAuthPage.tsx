import { useState } from 'react';
import { Eye, EyeOff, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import SpaceAuthLayout from '../components/SpaceAuthLayout';

const ACCENT = '#22d3ee';
const ACCENT2 = '#0ea5e9';

const BYPASS_EMAIL    = 'developer.cybranex@gmail.com';
const BYPASS_PASSWORD = '12345678';

function VCLeft() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '100vh', overflow: 'hidden', background: '#04090f' }}>

      {/* Blob 1 — large cyan core */}
      <div style={{
        position: 'absolute',
        width: '72%', height: '72%',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at 40% 42%, rgba(34,211,238,0.72) 0%, rgba(8,145,178,0.55) 32%, rgba(12,74,110,0.38) 58%, transparent 75%)',
        top: '10%', left: '8%',
        filter: 'blur(50px)',
        animation: 'blob-a 15s ease-in-out infinite',
      }} />

      {/* Blob 2 — deep blue accent */}
      <div style={{
        position: 'absolute',
        width: '52%', height: '52%',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at 55% 45%, rgba(56,189,248,0.55) 0%, rgba(14,165,233,0.3) 45%, transparent 70%)',
        top: '30%', left: '35%',
        filter: 'blur(65px)',
        animation: 'blob-b 19s ease-in-out infinite',
      }} />

      {/* Blob 3 — teal shadow */}
      <div style={{
        position: 'absolute',
        width: '58%', height: '58%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(6,182,212,0.28) 0%, transparent 65%)',
        top: '25%', left: '20%',
        filter: 'blur(75px)',
        animation: 'blob-c 24s ease-in-out infinite',
      }} />

      {/* Depth overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(2,6,12,0.6) 100%)',
      }} />

      {/* ── Logo — top left ── */}
      <div style={{ position: 'absolute', top: 36, left: 40, display: 'flex', alignItems: 'center', gap: 10, zIndex: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TrendingUp size={18} color={ACCENT} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)', letterSpacing: '-0.01em' }}>WorkOS</span>
      </div>

      {/* ── Tagline — bottom left ── */}
      <div style={{ position: 'absolute', bottom: 44, left: 44, zIndex: 10, maxWidth: 340 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(34,211,238,0.5)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
          VC Partner Portal
        </p>
        <h2 style={{ fontSize: 34, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.18, margin: 0, textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>
          See every signal.<br />
          <span style={{ background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Fund the future.
          </span>
        </h2>
      </div>
    </div>
  );
}

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

export default function VCAuthPage() {
  const { signIn } = useAuth();
  const navigate   = useNavigate();

  const [email, setEmail]       = useState(BYPASS_EMAIL);
  const [password, setPassword] = useState(BYPASS_PASSWORD);
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [focused, setFocused]   = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true); setError(null);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) { setError(err); return; }
    localStorage.setItem('active_role', 'vc');
    navigate('/3d');
  }

  return (
    <SpaceAuthLayout leftPanel={<VCLeft />}>

      {/* Heading */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: '-0.025em', margin: '0 0 6px' }}>Sign in</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', margin: 0 }}>Access the VC Universe as a partner</p>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Email</label>
          <Input focused={focused} setFocused={setFocused} accent={ACCENT} name="email" type="email" placeholder="Email address" value={email} onChange={e => { setEmail(e.target.value); setError(null); }} required />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Password</label>
            <span style={{ fontSize: 12, color: `rgba(34,211,238,0.4)`, cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = ACCENT)}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(34,211,238,0.4)')}>
              Forgot password?
            </span>
          </div>
          <div style={{ position: 'relative' }}>
            <Input focused={focused} setFocused={setFocused} accent={ACCENT} name="password" type={showPw ? 'text' : 'password'} placeholder="Password" value={password} onChange={e => { setPassword(e.target.value); setError(null); }} required style={{ paddingRight: 48 }} />
            <button type="button" onClick={() => setShowPw(p => !p)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}>
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {error && <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#f87171' }}>{error}</div>}

        <button type="submit" disabled={loading} style={{
          width: '100%', padding: '13px', borderRadius: 12, marginTop: 4,
          background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
          color: '#03111a', fontSize: 14, fontWeight: 700, border: 'none',
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.65 : 1,
          boxShadow: '0 6px 22px rgba(34,211,238,0.3)', fontFamily: 'inherit',
          transition: 'opacity 0.2s, transform 0.15s',
        }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          {loading ? 'Signing in…' : 'Enter VC Universe'}
        </button>
      </form>

      <div style={{ marginTop: 28, textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.28)', margin: 0 }}>
          Not a VC?{' '}
          <span onClick={() => navigate('/auth')} style={{ color: ACCENT, cursor: 'pointer', fontWeight: 600 }}>
            Founder Sign In
          </span>
        </p>
      </div>

      <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.13)', marginTop: 28 }}>
        By continuing you agree to our Terms of Service
      </p>
    </SpaceAuthLayout>
  );
}
