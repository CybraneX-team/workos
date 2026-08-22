import { useEffect, useState } from 'react';
import { Loader } from './PMS3D/arcade/Loader';
import ArcadeApp from './NewPMS/App';
import { LocalBackendProvider, type LocalBackendIdentity } from './NewPMS/localBackend';
import { useArcadeStylesheets } from './NewPMS/NewPMSApp';
import { useAuth } from '../lib/auth';

export default function PmsPage() {
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
  const instanceId = new URLSearchParams(window.location.search).get('instance');
  const storageKey = `workos-pms:${profile.company_id}${instanceId ? `:instance:${instanceId}` : ''}`;

  return (
    <LocalBackendProvider storageKey={storageKey} identity={identity}>
      <ArcadeApp />
      {curtainUp && <Loader label="Loading WorkOS PMS" />}
    </LocalBackendProvider>
  );
}
