import { useState, useEffect } from 'react';
import {
  Settings, Palette, Bell, Layers, Plus, Trash2, ImagePlus, Save, Loader2, ExternalLink, Link2, Check, X as XIcon,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useCompany, useConnectionRequests, respondToConnectionRequest } from '../lib/db/companies';
import { INDUSTRIES } from '../db/industries';
import type { CompanyStage } from '../lib/supabase';
import { api } from '../lib/api';
import { usePolytopeStore } from '../lib/usePolytopeStore';
import { useBdtCatalog } from '../lib/bdtCatalog';
import type { UCompanySize } from '../lib/bdtPolytopeData';
import { COUNTRIES, getCurrencyCodeForCountry } from '../lib/currency';

const STAGES: CompanyStage[] = [
  'Idea', 'Pre-seed', 'Seed', 'Series A', 'Series B',
  'Series C', 'Series D+', 'Pre-IPO', 'Public', 'PSU', 'Bootstrapped',
];

interface DeptConfig {
  id?: string;
  name: string;
  size: number;
  hod: string;
  access?: { read: boolean; write: boolean; delete: boolean; manage: boolean };
}

type Section = 'organization' | 'profile' | 'departments' | 'workspace' | 'notifications' | 'connections';

const NAV: { id: Section; icon: React.ReactNode; label: string }[] = [
  { id: 'organization', icon: <Layers size={15} />, label: 'Organization' },
  { id: 'profile', icon: <ImagePlus size={15} />, label: 'Profile' },
  { id: 'departments', icon: <Plus size={15} />, label: 'Departments' },
  { id: 'workspace', icon: <Palette size={15} />, label: 'Workspace' },
  { id: 'notifications', icon: <Bell size={15} />, label: 'Notifications' },
  { id: 'connections', icon: <Link2 size={15} />, label: 'Connections' },
];

const B = 'rgba(255,255,255,0.06)';
const AC = '#C1AEFF';
const DIM = 'rgba(255,255,255,0.28)';

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${B}`,
  borderRadius: 8, padding: '9px 12px',
  fontSize: 13, color: '#fff', outline: 'none',
  transition: 'border-color 0.15s',
  fontFamily: 'inherit',
};

export default function SettingsPage() {
  const { user, profile, refreshProfile, canWrite, role } = useAuth();
  const { company, loading: companyLoading } = useCompany(profile?.company_id);
  const { requests: connectionRequests, loading: connectionsLoading, refresh: refreshConnections } = useConnectionRequests(profile?.company_id);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const canEditSettings = canWrite('settings');
  const canCreateDepartments = canWrite('twin') && canWrite('team');
  const departmentStore = usePolytopeStore('bdt');
  const bdtCatalog = useBdtCatalog();

  const [section, setSection] = useState<Section>('organization');

  const [config, setConfig] = useState({
    companyName: '', stage: '' as string, industry_id: '',
    country: '', website: '', description: '', aiAgents: true, notifications: true,
  });

  const [profileForm, setProfileForm] = useState({ first_name: '', last_name: '', title: '' });

  const [depts, setDepts] = useState<DeptConfig[]>([
    { name: 'Product', size: 4, hod: 'Founder' },
    { name: 'Growth', size: 3, hod: 'Growth Lead' },
    { name: 'Engineering', size: 6, hod: 'CTO' },
    { name: 'Support', size: 2, hod: 'Support Lead' },
  ]);

  const [newDept, setNewDept] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [bdtCompanySize, setBdtCompanySize] = useState<UCompanySize>('standard');
  const [sizeSaving, setSizeSaving] = useState(false);

  useEffect(() => {
    if (profile?.company_id) void departmentStore.loadDepartments();
  }, [profile?.company_id, departmentStore.loadDepartments]);

  const displayDepts: DeptConfig[] = departmentStore.departments
    .filter(d => d.domain !== 'inactive' && !d.isDraft)
    .map(d => ({
      id: d.id,
      name: d.label,
      size: (d as any).memberCount ?? 0,
      hod: d.cluster || 'Unassigned',
      access: d.access,
    }));

  useEffect(() => {
    if (company) {
      setConfig(c => ({
        ...c,
        companyName: company.name ?? '',
        stage: company.stage ?? '',
        industry_id: company.industry_id ?? '',
        country: company.country ?? '',
        website: company.website ?? '',
        description: company.description ?? '',
      }));
      setBdtCompanySize((company.bdt_company_size ?? 'standard') as UCompanySize);
    }
  }, [company]);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        first_name: profile.first_name ?? '',
        last_name: profile.last_name ?? '',
        title: profile.title ?? '',
      });
    }
  }, [profile]);

  async function handleSaveCompany() {
    if (!company || !canEditSettings) return;
    setSaving(true); setSaveMsg(null);
    try {
      await api.patch(`/api/companies/${company.id}`, {
        name: config.companyName.trim(),
        stage: config.stage,
        industry_id: config.industry_id,
        country: config.country,
        currency: getCurrencyCodeForCountry(config.country),
        website: config.website.trim() || null,
        description: config.description.trim() || null,
      });
      setSaveMsg('Saved');
    } catch (err) {
      setSaveMsg('Failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(null), 3000);
  }

  async function handleRespondConnection(requestId: string, accept: boolean) {
    if (!profile?.company_id) return;
    setRespondingId(requestId);
    try {
      await respondToConnectionRequest(profile.company_id, requestId, accept);
      await refreshConnections();
    } finally {
      setRespondingId(null);
    }
  }

  async function handleSaveProfile() {
    if (!user) return;
    setSaving(true); setSaveMsg(null);
    try {
      await api.patch('/api/profile', {
        first_name: profileForm.first_name.trim() || null,
        last_name: profileForm.last_name.trim() || null,
        title: profileForm.title.trim() || null,
      });
      await refreshProfile();
      setSaveMsg('Saved');
    } catch (err) {
      setSaveMsg('Failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(null), 3000);
  }

  async function handleSaveBdtSize() {
    if (!company || !canEditSettings) return;
    setSizeSaving(true);
    setSaveMsg(null);
    try {
      await api.patch(`/api/companies/${company.id}`, { bdtCompanySize });
      departmentStore.setCompanySize(bdtCompanySize);
      await refreshProfile();
      setSaveMsg('Company size updated');
    } catch (err) {
      setSaveMsg('Failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    setSizeSaving(false);
    setTimeout(() => setSaveMsg(null), 3000);
  }

  const addDept = () => {
    if (!canCreateDepartments || !newDept.trim()) return;
    void departmentStore.addDepartment({
      label: newDept.trim(),
      domain: 'build',
      cluster: 'Build',
      score: 80,
      metrics: { performance: 80, efficiency: 80, capacity: 80, alignment: 80, risk: 20 },
    });
    setNewDept('');
  };

  const removeDept = (idx: number) => {
    const dept = departmentStore.departments.filter(d => d.domain !== 'inactive' && !d.isDraft)[idx];
    if (dept?.access?.delete) void departmentStore.deleteDepartment(dept.id);
  };

  const applyTemplate = (template: string) => {
    const templates: Record<string, DeptConfig[]> = {
      'SaaS B2B': [{ name: 'Product', size: 4, hod: 'CPO' }, { name: 'Engineering', size: 8, hod: 'CTO' }, { name: 'Growth', size: 3, hod: 'Growth Lead' }, { name: 'Sales', size: 4, hod: 'Sales Lead' }, { name: 'Support', size: 3, hod: 'Support Lead' }],
      'Marketplace': [{ name: 'Product', size: 3, hod: 'CPO' }, { name: 'Engineering', size: 6, hod: 'CTO' }, { name: 'Supply Ops', size: 4, hod: 'Ops Lead' }, { name: 'Demand Growth', size: 3, hod: 'Growth Lead' }, { name: 'Trust & Safety', size: 2, hod: 'T&S Lead' }],
      'D2C': [{ name: 'Product', size: 3, hod: 'CPO' }, { name: 'Engineering', size: 4, hod: 'CTO' }, { name: 'Marketing', size: 5, hod: 'CMO' }, { name: 'Supply Chain', size: 3, hod: 'SCM Lead' }, { name: 'CX', size: 3, hod: 'CX Lead' }],
      'FinTech': [{ name: 'Product', size: 3, hod: 'CPO' }, { name: 'Engineering', size: 6, hod: 'CTO' }, { name: 'Risk & Compliance', size: 4, hod: 'CRO' }, { name: 'Growth', size: 3, hod: 'Growth Lead' }, { name: 'Operations', size: 3, hod: 'COO' }],
      'HealthTech': [{ name: 'Product', size: 3, hod: 'CPO' }, { name: 'Engineering', size: 5, hod: 'CTO' }, { name: 'Clinical Ops', size: 4, hod: 'Clinical Lead' }, { name: 'Regulatory', size: 2, hod: 'Regulatory Lead' }, { name: 'Growth', size: 2, hod: 'Growth Lead' }],
      'ClimateTech': [{ name: 'Product', size: 3, hod: 'CPO' }, { name: 'Engineering', size: 5, hod: 'CTO' }, { name: 'Science', size: 3, hod: 'CSO' }, { name: 'Partnerships', size: 2, hod: 'BD Lead' }, { name: 'Impact', size: 2, hod: 'Impact Lead' }],
    };
    if (templates[template]) setDepts(templates[template]);
  };

  if (companyLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Page header ───────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 26, borderBottom: `1px solid ${B}` }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, fontSize: 10, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>
            <Settings size={11} color={AC} /> Settings
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.025em', margin: 0, lineHeight: 1 }}>Workspace Config</h1>
          <p style={{ fontSize: 13, color: DIM, margin: '6px 0 0' }}>{role ?? 'Member'} · {company?.name ?? 'Your Company'}</p>
        </div>
        {saveMsg && (
          <div style={{
            fontSize: 13, padding: '8px 16px', borderRadius: 8,
            background: saveMsg.startsWith('Failed') ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
            border: `1px solid ${saveMsg.startsWith('Failed') ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
            color: saveMsg.startsWith('Failed') ? '#f87171' : '#34d399',
          }}>
            {saveMsg}
          </div>
        )}
      </div>

      {/* ── Body: sidebar + content ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 0 }}>

        {/* Sidebar nav */}
        <div style={{ borderRight: `1px solid ${B}`, paddingTop: 24, paddingRight: 12 }}>
          {NAV.map(n => {
            const active = section === n.id;
            return (
              <button key={n.id} onClick={() => setSection(n.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '10px 14px', borderRadius: 10, marginBottom: 3,
                  background: active ? 'rgba(193,174,255,0.08)' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  color: active ? AC : 'rgba(255,255,255,0.38)',
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {n.icon}
                {n.label}
              </button>
            );
          })}
        </div>

        {/* Section content */}
        <div style={{ paddingTop: 28, paddingLeft: 40 }}>

          {/* ── Organization ────────────────────────────────── */}
          {section === 'organization' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>Organization</h2>
                  <p style={{ fontSize: 13, color: DIM, marginTop: 4, margin: '4px 0 0' }}>Company details and workspace identity</p>
                </div>
                {canEditSettings && (
                  <button onClick={handleSaveCompany} disabled={saving}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      background: 'rgba(193,174,255,0.1)', border: `1px solid rgba(193,174,255,0.2)`, color: AC,
                      cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, transition: 'all 0.15s', fontFamily: 'inherit'
                    }}>
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
                  </button>
                )}
              </div>

              {[
                {
                  label: 'Company Name', content: (
                    <input style={inputStyle} type="text" value={config.companyName}
                      disabled={!canEditSettings}
                      onChange={e => setConfig({ ...config, companyName: e.target.value })}
                      onFocus={e => (e.target.style.borderColor = `${AC}40`)}
                      onBlur={e => (e.target.style.borderColor = B)}
                    />
                  )
                },
                {
                  label: 'Industry', content: (
                    <select style={inputStyle} value={config.industry_id} disabled={!canEditSettings}
                      onChange={e => setConfig({ ...config, industry_id: e.target.value })}>
                      <option value="">Select industry</option>
                      {INDUSTRIES.map(ind => <option key={ind.id} value={ind.id}>{ind.label}</option>)}
                    </select>
                  )
                },
                {
                  label: 'Funding Stage', content: (
                    <select style={inputStyle} value={config.stage} disabled={!canEditSettings}
                      onChange={e => setConfig({ ...config, stage: e.target.value })}>
                      {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )
                },
                {
                  label: 'Country', content: (
                    <select style={inputStyle} value={config.country} disabled={!canEditSettings}
                      onChange={e => setConfig({ ...config, country: e.target.value })}>
                      <option value="">Select country</option>
                      {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )
                },
                {
                  label: 'Website', content: (
                    <input style={inputStyle} type="url" value={config.website} disabled={!canEditSettings}
                      placeholder="https://yourcompany.com"
                      onChange={e => setConfig({ ...config, website: e.target.value })}
                      onFocus={e => (e.target.style.borderColor = `${AC}40`)}
                      onBlur={e => (e.target.style.borderColor = B)}
                    />
                  )
                },
                {
                  label: 'Description', content: (
                    <textarea style={{ ...inputStyle, resize: 'none' }} rows={3} value={config.description} disabled={!canEditSettings}
                      onChange={e => setConfig({ ...config, description: e.target.value })}
                      onFocus={e => (e.target.style.borderColor = `${AC}40`)}
                      onBlur={e => (e.target.style.borderColor = B)}
                    />
                  )
                },
                {
                  label: 'WorkOS', content: company?.slug ? (
                    <a href={`https://${company.slug}.erp.os.cybranex.com/app`} target="_blank" rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        background: 'rgba(193,174,255,0.1)', border: `1px solid rgba(193,174,255,0.2)`, color: AC, textDecoration: 'none'
                      }}>
                      Open WorkOS <ExternalLink size={13} />
                    </a>
                  ) : (
                    <span style={{ fontSize: 13, color: DIM }}>Not available yet</span>
                  )
                },
              ].map((row) => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'flex-start', padding: '18px 0', borderBottom: `1px solid ${B}`, gap: 24 }}>
                  <div style={{ width: 140, flexShrink: 0, fontSize: 13, color: 'rgba(255,255,255,0.38)', paddingTop: 10 }}>{row.label}</div>
                  <div style={{ flex: 1 }}>{row.content}</div>
                </div>
              ))}

              <div style={{ display: 'flex', alignItems: 'flex-start', padding: '18px 0', borderBottom: `1px solid ${B}`, gap: 24 }}>
                <div style={{ width: 140, flexShrink: 0, fontSize: 13, color: 'rgba(255,255,255,0.38)', paddingTop: 10 }}>BDT Size</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(['micro', 'msme', 'standard', 'enterprise'] as UCompanySize[]).map(size => {
                      const selected = bdtCompanySize === size;
                      const visibleCount = bdtCatalog?.sizeConfigs[size]?.visibleDeptIds.length ?? 0;
                      const labels: Record<UCompanySize, string> = {
                        micro: 'Micro',
                        msme: 'MSME',
                        standard: 'Standard',
                        enterprise: 'Enterprise',
                      };
                      const descriptions: Record<UCompanySize, string> = {
                        micro: 'Founder-led, early-stage team',
                        msme: 'Growing company with a focused operating core',
                        standard: 'Full operating model with the standard department set',
                        enterprise: 'Expanded multi-team operating model',
                      };
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => canEditSettings && setBdtCompanySize(size)}
                          disabled={!canEditSettings}
                          style={{
                            width: '100%',
                            padding: '14px 16px',
                            borderRadius: 12,
                            border: `1px solid ${selected ? 'rgba(193,174,255,0.35)' : B}`,
                            background: selected ? 'rgba(193,174,255,0.08)' : 'rgba(255,255,255,0.02)',
                            cursor: canEditSettings ? 'pointer' : 'not-allowed',
                            textAlign: 'left',
                            opacity: canEditSettings ? 1 : 0.6,
                            transition: 'all 0.15s',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: selected ? AC : '#fff', marginBottom: 4 }}>
                                {labels[size]}
                              </div>
                              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', lineHeight: 1.5 }}>
                                {descriptions[size]}
                              </div>
                            </div>
                            <div style={{ fontSize: 12, color: selected ? AC : 'rgba(255,255,255,0.24)', fontWeight: 600, flexShrink: 0 }}>
                              {visibleCount} active
                            </div>
                          </div>
                        </button>
                      );
                    })}

                    {canEditSettings && (
                      <div>
                        <button
                          type="button"
                          onClick={handleSaveBdtSize}
                          disabled={sizeSaving}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '8px 16px',
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            background: 'rgba(193,174,255,0.1)',
                            border: `1px solid rgba(193,174,255,0.2)`,
                            color: AC,
                            cursor: sizeSaving ? 'not-allowed' : 'pointer',
                            opacity: sizeSaving ? 0.6 : 1,
                            transition: 'all 0.15s',
                            fontFamily: 'inherit',
                          }}
                        >
                          {sizeSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                          Save Size
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {!canEditSettings && (
                <p style={{ fontSize: 11, color: 'rgba(255,187,0,0.5)', marginTop: 16 }}>Admin or Founder role required to edit company settings.</p>
              )}
            </div>
          )}

          {/* ── Profile ─────────────────────────────────────── */}
          {section === 'profile' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>Your Profile</h2>
                  <p style={{ fontSize: 13, color: DIM, marginTop: 4, margin: '4px 0 0' }}>How you appear to your team</p>
                </div>
                <button onClick={handleSaveProfile} disabled={saving}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    background: 'rgba(193,174,255,0.1)', border: `1px solid rgba(193,174,255,0.2)`, color: AC,
                    cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, transition: 'all 0.15s', fontFamily: 'inherit'
                  }}>
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
                </button>
              </div>

              {/* Avatar preview */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 0', borderBottom: `1px solid ${B}`, marginBottom: 0 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#161618',
                  background: 'linear-gradient(135deg, #F9C6FF, #C1AEFF)'
                }}>
                  {(profileForm.first_name?.[0] ?? '?').toUpperCase()}{(profileForm.last_name?.[0] ?? '').toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>
                    {[profileForm.first_name, profileForm.last_name].filter(Boolean).join(' ') || 'Your Name'}
                  </div>
                  <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{profileForm.title || 'No title set'}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', marginTop: 1 }}>{user?.email}</div>
                </div>
              </div>

              {[
                {
                  label: 'First Name', content: (
                    <input style={inputStyle} type="text" value={profileForm.first_name}
                      onChange={e => setProfileForm({ ...profileForm, first_name: e.target.value })}
                      onFocus={e => (e.target.style.borderColor = `${AC}40`)}
                      onBlur={e => (e.target.style.borderColor = B)}
                    />
                  )
                },
                {
                  label: 'Last Name', content: (
                    <input style={inputStyle} type="text" value={profileForm.last_name}
                      onChange={e => setProfileForm({ ...profileForm, last_name: e.target.value })}
                      onFocus={e => (e.target.style.borderColor = `${AC}40`)}
                      onBlur={e => (e.target.style.borderColor = B)}
                    />
                  )
                },
                {
                  label: 'Title / Role', content: (
                    <input style={inputStyle} type="text" value={profileForm.title} placeholder="e.g. Founder & CEO"
                      onChange={e => setProfileForm({ ...profileForm, title: e.target.value })}
                      onFocus={e => (e.target.style.borderColor = `${AC}40`)}
                      onBlur={e => (e.target.style.borderColor = B)}
                    />
                  )
                },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'flex-start', padding: '18px 0', borderBottom: `1px solid ${B}`, gap: 24 }}>
                  <div style={{ width: 140, flexShrink: 0, fontSize: 13, color: 'rgba(255,255,255,0.38)', paddingTop: 10 }}>{row.label}</div>
                  <div style={{ flex: 1 }}>{row.content}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Departments ─────────────────────────────────── */}
          {section === 'departments' && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>Departments</h2>
                <p style={{ fontSize: 13, color: DIM, marginTop: 4, margin: '4px 0 0' }}>
                  {(displayDepts.length ? displayDepts : depts).reduce((s, d) => s + d.size, 0)} people across {(displayDepts.length ? displayDepts : depts).length} departments
                </p>
              </div>

              {(displayDepts.length ? displayDepts : depts).map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderBottom: `1px solid ${B}` }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: AC, flexShrink: 0, opacity: 0.5 }} />
                  <div style={{ flex: 1, fontSize: 14, color: '#fff', fontWeight: 500 }}>{d.name}</div>
                  <div style={{ fontSize: 13, color: DIM }}>{d.size} <span style={{ fontSize: 11 }}>ppl</span></div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)', width: 100, textAlign: 'right' }}>{d.hod}</div>
                  {d.access?.delete && displayDepts.length > 0 && (
                    <button onClick={() => removeDept(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', padding: 4, display: 'flex' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}

              {canCreateDepartments && (
                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <input style={{ ...inputStyle, flex: 1 }} type="text" value={newDept} placeholder="New department name"
                    onChange={e => setNewDept(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addDept()}
                    onFocus={e => (e.target.style.borderColor = `${AC}40`)}
                    onBlur={e => (e.target.style.borderColor = B)}
                  />
                  <button onClick={addDept}
                    style={{ padding: '9px 18px', borderRadius: 8, background: 'rgba(193,174,255,0.1)', border: `1px solid rgba(193,174,255,0.2)`, color: AC, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Add
                  </button>
                </div>
              )}

              {canEditSettings && (
                <div style={{ marginTop: 32 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Quick Templates</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    {['SaaS B2B', 'Marketplace', 'D2C', 'FinTech', 'HealthTech', 'ClimateTech'].map(t => (
                      <button key={t} onClick={() => applyTemplate(t)}
                        style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${B}`, color: 'rgba(255,255,255,0.45)', fontSize: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', fontFamily: 'inherit' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = `rgba(193,174,255,0.25)`; e.currentTarget.style.color = AC; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = B; e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Workspace ───────────────────────────────────── */}
          {section === 'workspace' && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>Workspace</h2>
                <p style={{ fontSize: 13, color: DIM, marginTop: 4, margin: '4px 0 0' }}>Platform behaviour and preferences</p>
              </div>

              {[
                { label: 'AI Agents', desc: 'Enable autonomous AI agents across your digital twin', toggle: true, key: 'aiAgents' as const },
                { label: 'Dark Theme', desc: 'System enforced — always active', toggle: false },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0', borderBottom: `1px solid ${B}` }}>
                  <div>
                    <div style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>{item.desc}</div>
                  </div>
                  {item.toggle ? (
                    <button
                      onClick={() => setConfig({ ...config, [item.key as string]: !config[item.key as keyof typeof config] })}
                      style={{
                        width: 44, height: 24, borderRadius: 100, border: 'none', cursor: 'pointer', padding: 0, position: 'relative', transition: 'background 0.2s',
                        background: config[item.key as keyof typeof config] ? AC : 'rgba(255,255,255,0.12)'
                      }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, transition: 'left 0.2s',
                        left: config[item.key as keyof typeof config] ? 23 : 3
                      }} />
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: '4px 10px', borderRadius: 6, border: `1px solid ${B}` }}>Active</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Notifications ───────────────────────────────── */}
          {section === 'notifications' && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>Notifications</h2>
                <p style={{ fontSize: 13, color: DIM, marginTop: 4, margin: '4px 0 0' }}>Events and alerts that matter to you</p>
              </div>

              {[
                { label: 'KPI Threshold Alerts', desc: 'Notify when a metric exceeds its set threshold', active: true },
                { label: 'Environment Signal Updates', desc: 'Market signals affecting your twin', active: true },
                { label: 'Simulation Completed', desc: 'When a scenario simulation finishes', active: true },
                { label: 'Data Sync Status', desc: 'Integration sync success or failure', active: true },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 0', borderBottom: `1px solid ${B}` }}>
                  <div>
                    <div style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>{item.desc}</div>
                  </div>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.active ? '#10b981' : 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
                </div>
              ))}
            </div>
          )}

          {/* ── Connections ──────────────────────────────────── */}
          {section === 'connections' && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>Connections</h2>
                <p style={{ fontSize: 13, color: DIM, marginTop: 4, margin: '4px 0 0' }}>
                  Incubators that want to manage your company. Accepting shares your live metrics with them.
                </p>
              </div>

              {connectionsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                  <Loader2 size={20} className="animate-spin" style={{ color: AC }} />
                </div>
              ) : connectionRequests.length === 0 ? (
                <div style={{ fontSize: 13, color: DIM, padding: '24px 0' }}>No pending requests.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {connectionRequests.map(req => (
                    <div key={req.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      padding: '14px 16px', borderRadius: 10, border: `1px solid ${B}`, background: 'rgba(255,255,255,0.02)',
                    }}>
                      <div>
                        <div style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}>{req.incubator_name}</div>
                        {req.message && <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>{req.message}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button onClick={() => handleRespondConnection(req.id, true)} disabled={respondingId === req.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#34d399',
                            cursor: respondingId === req.id ? 'not-allowed' : 'pointer', opacity: respondingId === req.id ? 0.6 : 1, fontFamily: 'inherit'
                          }}>
                          <Check size={13} /> Accept
                        </button>
                        <button onClick={() => handleRespondConnection(req.id, false)} disabled={respondingId === req.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                            background: 'rgba(255,255,255,0.03)', border: `1px solid ${B}`, color: 'rgba(255,255,255,0.5)',
                            cursor: respondingId === req.id ? 'not-allowed' : 'pointer', opacity: respondingId === req.id ? 0.6 : 1, fontFamily: 'inherit'
                          }}>
                          <XIcon size={13} /> Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
