import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCw } from 'lucide-react';
import { useInvites, resendInvite } from '../../lib/db/incubator';
import { PageHeader, Card, SecondaryButton, Select, StatusBadge, Avatar, Spinner, EmptyState } from '../../components/incubator/ui';

const STATUS_OPTIONS = ['', 'pending', 'sent', 'opened', 'claimed', 'bounced', 'expired'];

export default function IncubatorInvites() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const { invites, loading, refresh } = useInvites({ status: status || undefined });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleResend(id: string) {
    setBusyId(id);
    try {
      await resendInvite(id);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Invites" description={`${invites.length} invite${invites.length === 1 ? '' : 's'}`} />

      <div className="mb-4">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s ? s[0].toUpperCase() + s.slice(1) : 'All statuses'}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="p-10 flex justify-center">
          <Spinner />
        </div>
      ) : invites.length === 0 ? (
        <EmptyState
          title="No invites yet"
          description="Send invites from a startup's detail page or in bulk from the Portfolio page."
          action={<SecondaryButton onClick={() => navigate('/incubator/portfolio')}>Go to portfolio</SecondaryButton>}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-white/40 border-b border-white/10">
                <th className="p-3 font-medium">Startup</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Sent</th>
                <th className="p-3 font-medium">Expires</th>
                <th className="p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id} className="border-b border-white/5">
                  <td
                    className="p-3 text-white font-medium cursor-pointer hover:underline"
                    onClick={() => inv.company_id && navigate(`/incubator/portfolio/${inv.company_id}`)}
                  >
                    {inv.startup_name ? (
                      <span className="inline-flex items-center gap-2.5">
                        <Avatar name={inv.startup_name} size={24} />
                        {inv.startup_name}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-3 text-white/60">{inv.email}</td>
                  <td className="p-3">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="p-3 text-white/40">{inv.sent_at ? new Date(inv.sent_at).toLocaleDateString() : '—'}</td>
                  <td className="p-3 text-white/40">{new Date(inv.expires_at).toLocaleDateString()}</td>
                  <td className="p-3">
                    {inv.status !== 'claimed' && (
                      <SecondaryButton onClick={() => handleResend(inv.id)} disabled={busyId === inv.id}>
                        <span className="inline-flex items-center gap-1.5">
                          <RotateCw size={12} /> {busyId === inv.id ? 'Resending…' : 'Resend'}
                        </span>
                      </SecondaryButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
