import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Loader } from './PMS3D/arcade/Loader';
import ArcadeApp from './NewPMS/App';
import { LocalBackendProvider, type LocalBackendIdentity } from './NewPMS/localBackend';
import { useArcadeStylesheets } from './NewPMS/NewPMSApp';
import { useAuth } from '../lib/auth';

export default function PmsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, canWrite } = useAuth();
  const stylesheetsReady = useArcadeStylesheets();
  const [curtainUp, setCurtainUp] = useState(true);

  useEffect(() => {
    if (!stylesheetsReady) return;
    const settle = window.setTimeout(() => setCurtainUp(false), 500);
    return () => window.clearTimeout(settle);
  }, [stylesheetsReady]);

  if (!user || !profile?.company_id) return null;
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || user.email || 'Team member';
  const identity: LocalBackendIdentity = {
    email: user.email || `${user.id}@workos.local`,
    name,
    role: canWrite('team') ? 'manager' : 'member',
  };
  const params = new URLSearchParams(window.location.search);
  const instanceId = params.get('instance');
  const cycleId = params.get('cycle');
  const returnTo = (location.state as { pmsReturnTo?: string } | null)?.pmsReturnTo;
  const storageKey = `workos-pms:${profile.company_id}${instanceId ? `:instance:${instanceId}` : ''}`;

  return (
    <LocalBackendProvider storageKey={storageKey} identity={identity}>
      <ArcadeApp />
      {(cycleId || returnTo) && (
        <button
          type="button"
          onClick={() => {
            if (returnTo) navigate(returnTo);
            else navigate(-1);
          }}
          style={{
            position: 'fixed',
            top: 84,
            left: 24,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 14px',
            border: '1px solid rgba(103, 232, 255, 0.3)',
            borderRadius: 10,
            background: 'rgba(5, 12, 22, 0.78)',
            backdropFilter: 'blur(14px)',
            color: '#dffaff',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.01em',
            cursor: 'pointer',
            boxShadow: '0 8px 28px rgba(0, 0, 0, 0.28)',
          }}
        >
          <ArrowLeft size={14} />
          Back to Cycle
        </button>
      )}
      {curtainUp && <Loader label="Loading WorkOS PMS" />}
    </LocalBackendProvider>
  );
}
