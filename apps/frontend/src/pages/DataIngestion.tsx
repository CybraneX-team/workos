import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Database, Upload, PenLine, FileSpreadsheet, Check, AlertCircle,
  Link2, Globe2, Wifi, WifiOff, Clock, XCircle, RefreshCw,
} from 'lucide-react';
import IntegrationModal from '../components/IntegrationModal';
import { integrations } from '../data/mockData';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useCompany } from '../lib/db/companies';
import { INDUSTRIES } from '../db/industries';
import { fetchConnections } from '../lib/integrations/service';
import type { IntegrationConnection } from '../lib/integrations/types';
import type { Integration } from '../types';

type Tab = 'manual' | 'csv' | 'integrations' | 'public';

interface FormData {
  mrr: string;
  burnRate: string;
  teamSize: string;
  cac: string;
  ltv: string;
  churnRate: string;
  nps: string;
}

interface ReviewDecision {
  id: string;
  run_id: string;
  source_label: string | null;
  proposed_key: string | null;
  final_key: string | null;
  confidence: number | null;
  stage: string;
  status: string;
  reasoning: string | null;
  source_locator: Record<string, unknown>;
  original_name: string;
  sheet_name: string;
  bbox: string | null;
  promoted_count: number;
  impact_value_count?: number;
  created_at: string;
}

const statusBadge = {
  connected: { icon: Wifi, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  available: { icon: WifiOff, color: 'text-gray-400', bg: 'bg-gray-800 border-gray-700' },
  'coming-soon': { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
};

const catLabels: Record<string, string> = {
  finance: 'Finance & Payments',
  crm: 'CRM & Sales',
  analytics: 'Product Analytics',
  project: 'Project & Comms',
  market: 'Market Intelligence',
  social: 'Social Listening',
  government: 'Government & Compliance',
};

export default function DataIngestion() {
  const { canWrite, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { company } = useCompany(companyId);
  const canManageExcel = canWrite('data');
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<Tab>(requestedTab === 'integrations' ? 'integrations' : 'manual');

  // ── Integration state ──────────────────────────────────────────────────────
  const [connections, setConnections]       = useState<Record<string, IntegrationConnection>>({});
  const [loadingConns, setLoadingConns]     = useState(false);
  const [selectedInt, setSelectedInt]       = useState<Integration | null>(null);

  const loadConnections = useCallback(async () => {
    setLoadingConns(true);
    try {
      const c = await fetchConnections();
      setConnections(c);
    } catch { /* backend may not be running */ }
    finally { setLoadingConns(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'integrations') void loadConnections();
  }, [activeTab, loadConnections]);

  // ──────────────────────────────────────────────────────────────────────────

  const [formData, setFormData] = useState<FormData>({
    mrr: '',
    burnRate: '',
    teamSize: '',
    cac: '',
    ltv: '',
    churnRate: '',
    nps: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load latest saved metrics via backend (bypasses RLS on metric_snapshots)
  useEffect(() => {
    if (!companyId) return;
    api.get<Record<string, number> | null>(`/api/metrics-onboarding/${companyId}/latest`)
      .then((m) => {
        if (m) {
          setFormData({
            mrr:       m.revenue   != null ? String(m.revenue)   : '',
            burnRate:  m.burn      != null ? String(m.burn)      : '',
            teamSize:  m.headcount != null ? String(m.headcount) : '',
            cac:       m.cpa       != null ? String(m.cpa)       : '',
            ltv:       m.cltv      != null ? String(m.cltv)      : '',
            churnRate: m.churn     != null ? String(m.churn)     : '',
            nps:       m.nps       != null ? String(m.nps)       : '',
          });
        }
      })
      .catch(() => { /* backend may not be running — fall through to company fallback */ });
  }, [companyId]);

  // Company-record fallback: fill only empty fields so API data is not overwritten
  useEffect(() => {
    if (!company) return;
    setFormData(prev => ({
      mrr:       prev.mrr       || (company.mrr_usd       != null ? String(company.mrr_usd)       : ''),
      burnRate:  prev.burnRate  || (company.burn_rate_usd  != null ? String(company.burn_rate_usd) : ''),
      teamSize:  prev.teamSize  || (company.employees      != null ? String(company.employees)     : ''),
      cac:       prev.cac,
      ltv:       prev.ltv,
      churnRate: prev.churnRate,
      nps:       prev.nps,
    }));
  }, [company]);
  const [csvFile, setCsvFile] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [jobState, setJobState] = useState<{
    status: 'pending' | 'running' | 'complete' | 'failed';
    record_count?: number | null;
    last_error?: string | null;
  } | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ReviewDecision[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [overrideInputs, setOverrideInputs] = useState<Record<string, string>>({});
  const [actingDecisionId, setActingDecisionId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setSaveError(null);
    try {
      await api.post(`/api/metrics-onboarding/${companyId}/initial`, {
        mrr:       parseFloat(formData.mrr)       || 0,
        burn:      parseFloat(formData.burnRate)   || 0,
        headcount: parseInt(formData.teamSize)     || 0,
        cac:       parseFloat(formData.cac)        || 0,
        ltv:       parseFloat(formData.ltv)        || 0,
        churn:     parseFloat(formData.churnRate)  || 0,
        nps:       parseFloat(formData.nps)        || 0,
      });
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    } catch (err) {
      setSaveError(String(err));
    }
  };

  const loadReviewQueue = useCallback(async () => {
    setReviewLoading(true);
    setReviewError(null);
    try {
      const rows = await api.get<ReviewDecision[]>('/api/ingestion/decisions/pending');
      setReviewQueue(rows);
      setOverrideInputs((current) => {
        const next = { ...current };
        for (const row of rows) {
          if (!next[row.id]) next[row.id] = row.proposed_key ?? '';
        }
        return next;
      });
    } catch (e) {
      setReviewError(String(e));
    } finally {
      setReviewLoading(false);
    }
  }, []);

  async function handleDecisionAction(
    decision: ReviewDecision,
    action: 'accept' | 'override' | 'reject',
  ) {
    setActingDecisionId(decision.id);
    setReviewError(null);
    try {
      await api.post<{ promoted: number; status: string; finalKey?: string }>(
        `/api/ingestion/decisions/${decision.id}/override`,
        {
          action,
          ...(action === 'override' ? { finalKey: overrideInputs[decision.id] } : {}),
        },
      );
      await loadReviewQueue();
    } catch (e) {
      setReviewError(String(e));
    } finally {
      setActingDecisionId(null);
    }
  }

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const next = await api.get<{
          status: 'pending' | 'running' | 'complete' | 'failed';
          record_count?: number | null;
          last_error?: string | null;
        }>(`/api/ingestion/jobs/${jobId}`);
        if (cancelled) return;
        setJobState(next);
        if (next.status === 'complete' || next.status === 'failed') {
          clearInterval(timer);
          if (next.status === 'complete') void loadReviewQueue();
        }
      } catch (e) {
        if (!cancelled) {
          setUploadError(String(e));
          clearInterval(timer);
        }
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, loadReviewQueue]);

  useEffect(() => {
    if (activeTab === 'csv') void loadReviewQueue();
  }, [activeTab, loadReviewQueue]);

  async function handleExcelFile(file: File) {
    if (!canManageExcel) return;
    setUploading(true);
    setUploadError(null);
    setJobState(null);
    setJobId(null);
    setCsvFile(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await api.post<{ jobId: string; dedup?: boolean }>(
        '/api/ingestion/excel/upload',
        formData,
      );
      setJobId(result.jobId);
    } catch (e) {
      setUploadError(String(e));
    } finally {
      setUploading(false);
    }
  }

  const fields = [
    { key: 'mrr',       label: 'Monthly Recurring Revenue',  unit: '$',      placeholder: '0' },
    { key: 'burnRate',  label: 'Monthly Burn Rate',           unit: '$',      placeholder: '0' },
    { key: 'teamSize',  label: 'Team Size',                   unit: 'people', placeholder: '0' },
    { key: 'cac',       label: 'Customer Acquisition Cost',   unit: '$',      placeholder: '0' },
    { key: 'ltv',       label: 'Customer Lifetime Value',     unit: '$',      placeholder: '0' },
    { key: 'churnRate', label: 'Monthly Churn Rate',          unit: '%',      placeholder: '0' },
    { key: 'nps',       label: 'Net Promoter Score',          unit: '',       placeholder: '0' },
  ];

  const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'manual', icon: <PenLine className="w-4 h-4" />, label: 'Manual Input' },
    { id: 'csv', icon: <FileSpreadsheet className="w-4 h-4" />, label: 'Excel Upload' },
    { id: 'integrations', icon: <Link2 className="w-4 h-4" />, label: 'Integrations' },
    { id: 'public', icon: <Globe2 className="w-4 h-4" />, label: 'Public Sources' },
  ];

  // Group integrations by category
  const intCats = ['finance', 'crm', 'analytics', 'project'] as const;
  const pubCats = ['market', 'social', 'government'] as const;

  const B  = 'rgba(255,255,255,0.06)';
  const AC = '#C1AEFF';
  const DIM = 'rgba(255,255,255,0.28)';

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:26, borderBottom:`1px solid ${B}` }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:10, fontSize:10, color:'rgba(255,255,255,0.22)', letterSpacing:'0.12em', textTransform:'uppercase', fontWeight:600 }}>
            <Database size={11} color={AC} /> Data
          </div>
          <h1 style={{ fontSize:28, fontWeight:800, color:'#fff', letterSpacing:'-0.025em', margin:0, lineHeight:1 }}>Data Ingestion</h1>
          <p style={{ fontSize:13, color:DIM, margin:'7px 0 0' }}>Feed real operational data into your digital twin</p>
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:2, padding:'20px 0', borderBottom:`1px solid ${B}` }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              display:'flex', alignItems:'center', gap:7,
              padding:'8px 16px', borderRadius:8, fontSize:13, fontWeight: activeTab === t.id ? 600 : 400,
              background: activeTab === t.id ? 'rgba(193,174,255,0.1)' : 'transparent',
              border: `1px solid ${activeTab === t.id ? 'rgba(193,174,255,0.22)' : 'transparent'}`,
              color: activeTab === t.id ? AC : 'rgba(255,255,255,0.35)',
              cursor:'pointer', transition:'all 0.15s', fontFamily:'inherit',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ===== MANUAL ===== */}
      {activeTab === 'manual' && (
        <form onSubmit={handleSubmit}>

          {/* Field list — label | unit | input pattern */}
          <div style={{ marginTop:4 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'18px 0', borderBottom:`1px solid ${B}` }}>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.22)', letterSpacing:'0.1em', textTransform:'uppercase' }}>Operational Metrics</span>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                {saveError && (
                  <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#f87171' }}>
                    <AlertCircle size={13} /> {saveError}
                  </span>
                )}
                <button type="submit" style={{
                  display:'flex', alignItems:'center', gap:7, padding:'8px 18px', borderRadius:8, fontSize:13, fontWeight:600,
                  background: submitted ? 'rgba(16,185,129,0.12)' : 'rgba(193,174,255,0.1)',
                  border: `1px solid ${submitted ? 'rgba(16,185,129,0.25)' : 'rgba(193,174,255,0.22)'}`,
                  color: submitted ? '#34d399' : AC,
                  cursor:'pointer', transition:'all 0.2s', fontFamily:'inherit',
                }}>
                  {submitted ? <Check size={13} /> : <Upload size={13} />}
                  {submitted ? 'Synced!' : 'Sync to Twin'}
                </button>
              </div>
            </div>

            {fields.map((f) => (
              <div key={f.key} style={{ display:'flex', alignItems:'center', padding:'16px 0', borderBottom:`1px solid ${B}`, gap:24 }}>
                <div style={{ width:220, flexShrink:0, fontSize:13, color:'rgba(255,255,255,0.45)' }}>{f.label}</div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
                  {f.unit && f.unit !== '%' && f.unit !== 'people' && (
                    <span style={{ fontSize:13, color:'rgba(255,255,255,0.25)', width:12 }}>{f.unit}</span>
                  )}
                  <input
                    type="number"
                    value={formData[f.key as keyof FormData]}
                    onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                    placeholder="0"
                    style={{
                      background:'transparent', border:'none', borderBottom:`1px solid ${B}`,
                      borderRadius:0, padding:'4px 0', fontSize:16, fontWeight:600,
                      color:'#fff', outline:'none', width:160, fontFamily:'inherit',
                      transition:'border-color 0.15s',
                    }}
                    onFocus={e => (e.target.style.borderBottomColor = `${AC}60`)}
                    onBlur={e => (e.target.style.borderBottomColor = B)}
                  />
                  {(f.unit === '%' || f.unit === 'people') && (
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.25)' }}>{f.unit}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Normalization strip */}
          {(() => {
            const industryLabel = company?.industry_id
              ? (INDUSTRIES.find(i => i.id === company.industry_id)?.label ?? company.industry_id) : '—';
            const country = company?.country ?? '—';
            const stage = company?.stage ?? '—';
            const model = company?.business_model ?? '—';
            const items = [
              { dim: 'Industry',  value: industryLabel },
              { dim: 'Geography', value: country       },
              { dim: 'Stage',     value: stage         },
              { dim: 'Model',     value: model         },
            ];
            return (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', borderTop:`1px solid ${B}`, marginTop:0, borderBottom:`1px solid ${B}` }}>
                {items.map((n, i) => (
                  <div key={n.dim} style={{ padding:'16px 20px', borderLeft: i > 0 ? `1px solid ${B}` : 'none' }}>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.22)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:6 }}>{n.dim}</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'#0ea5e9' }}>{n.value}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </form>
      )}

      {/* ===== CSV ===== */}
      {activeTab === 'csv' && (
        <div style={{ paddingTop:24 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:600, color:'#fff' }}>Excel Upload</div>
              <div style={{ fontSize:12, color:DIM, marginTop:3 }}>Upload a filled WorkOS metrics template</div>
            </div>
            <a href="/templates/WorkOS_Metrics_Template.xlsx"
              style={{ fontSize:12, color:'#0ea5e9', textDecoration:'none', padding:'7px 14px', borderRadius:7, border:'1px solid rgba(14,165,233,0.2)', background:'rgba(14,165,233,0.06)' }}>
              Download template
            </a>
          </div>

          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) void handleExcelFile(file);
              e.currentTarget.value = '';
            }}
          />

          <button
            type="button"
            onClick={() => canManageExcel && fileInputRef.current?.click()}
            disabled={!canManageExcel || uploading}
            style={{
              width:'100%', border:`2px dashed ${canManageExcel ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
              borderRadius:16, padding:'52px 0', textAlign:'center', background:'transparent',
              cursor: canManageExcel ? 'pointer' : 'not-allowed',
              opacity: canManageExcel ? 1 : 0.5,
              transition:'border-color 0.2s',
            }}
            onMouseEnter={e => canManageExcel && (e.currentTarget.style.borderColor = 'rgba(14,165,233,0.35)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
          >
            {uploading ? (
              <div>
                <Upload size={28} style={{ color:'#0ea5e9', margin:'0 auto 12px', display:'block' }} className="animate-pulse" />
                <div style={{ fontSize:14, color:'#7dd3fc' }}>Uploading…</div>
                <div style={{ fontSize:12, color:DIM, marginTop:4 }}>Processing and syncing automatically</div>
              </div>
            ) : csvFile ? (
              <div>
                <Check size={28} style={{ color:'#34d399', margin:'0 auto 12px', display:'block' }} />
                <div style={{ fontSize:14, color:'#6ee7b7', fontWeight:600 }}>{csvFile}</div>
                <div style={{ fontSize:12, color:DIM, marginTop:4 }}>Upload submitted — tracking ingestion job</div>
              </div>
            ) : (
              <div>
                <FileSpreadsheet size={28} style={{ color:'rgba(255,255,255,0.2)', margin:'0 auto 12px', display:'block' }} />
                <div style={{ fontSize:14, color:'rgba(255,255,255,0.45)' }}>
                  {canManageExcel ? 'Click to upload filled .xlsx template' : 'No upload permission for your role'}
                </div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.2)', marginTop:4 }}>WorkOS canonical template only</div>
              </div>
            )}
          </button>

          {(jobState || uploadError) && (
            <div className="mt-6">
              <h4 className="text-xs font-medium text-gray-400 mb-3">Ingestion Job</h4>
              {uploadError && (
                <div className="flex items-center gap-2 text-sm text-red-400 mb-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {uploadError}
                </div>
              )}
              {jobState && (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-300">
                    <span className="text-gray-500">Status:</span>
                    <span className={`font-medium ${
                      jobState.status === 'complete'
                        ? 'text-emerald-400'
                        : jobState.status === 'failed'
                          ? 'text-red-400'
                          : 'text-sky-400'
                    }`}>
                      {jobState.status}
                    </span>
                  </div>
                  {typeof jobState.record_count === 'number' && (
                    <div className="text-gray-300">
                      <span className="text-gray-500">Records:</span> {jobState.record_count}
                    </div>
                  )}
                  {jobState.last_error && (
                    <div className="flex items-center gap-2 text-red-400">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {jobState.last_error}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-8 border-t border-gray-800 pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Review Queue
                </h4>
                <p className="text-xs text-gray-600 mt-1">
                  {reviewQueue.length} pending mappings
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadReviewQueue()}
                className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-gray-800 text-gray-400 hover:text-sky-300 hover:border-sky-500/30 transition-colors"
                disabled={reviewLoading}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reviewLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {!canManageExcel && reviewQueue.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 mb-3">
                Your role can view pending mappings, but only founders, co-founders, admins, and super admins can apply changes.
              </div>
            )}

            {reviewError && (
              <div className="flex items-center gap-2 text-sm text-red-400 mb-3">
                <AlertCircle className="w-3.5 h-3.5" />
                {reviewError}
              </div>
            )}

            {reviewLoading && reviewQueue.length === 0 ? (
              <div className="text-sm text-gray-500 py-6">Loading review items...</div>
            ) : reviewQueue.length === 0 ? (
              <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-5 text-sm text-gray-500">
                No pending mappings.
              </div>
            ) : (
              <div className="space-y-3">
                {reviewQueue.map((decision) => {
                  const busy = actingDecisionId === decision.id;
                  const locator = decision.source_locator ?? {};
                  const locatorText = [
                    decision.sheet_name,
                    typeof locator.row_idx === 'number' ? `row ${Number(locator.row_idx) + 1}` : null,
                    decision.bbox,
                  ].filter(Boolean).join(' · ');

                  return (
                    <div
                      key={decision.id}
                      className="rounded-lg border border-gray-800 bg-gray-950/40 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white truncate">
                              {decision.source_label ?? 'Unlabeled source'}
                            </p>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">
                              {Math.round(Number(decision.confidence ?? 0) * 100)}%
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 truncate">
                            {decision.original_name} · {locatorText}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            Proposed: <span className="text-gray-400">{decision.proposed_key ?? 'none'}</span>
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            Impact: <span className="text-gray-400">
                              promotes up to {decision.impact_value_count ?? 0} source values from this row
                            </span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDecisionAction(decision, 'reject')}
                          disabled={busy || !canManageExcel}
                          className="shrink-0 p-2 rounded-lg border border-gray-800 text-gray-500 hover:text-red-300 hover:border-red-500/30 transition-colors"
                          title="Reject mapping"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                        <input
                          value={overrideInputs[decision.id] ?? decision.proposed_key ?? ''}
                          onChange={(e) => setOverrideInputs({
                            ...overrideInputs,
                            [decision.id]: e.target.value,
                          })}
                          className="min-w-0 flex-1 px-3 py-2 bg-gray-900/70 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sky-500 transition-colors"
                          placeholder="metric_key"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleDecisionAction(decision, 'accept')}
                            disabled={busy || !canManageExcel || !decision.proposed_key}
                            className="flex items-center gap-2 px-3 py-2 bg-emerald-600/15 border border-emerald-500/25 text-emerald-300 text-xs font-medium rounded-lg hover:bg-emerald-600/25 disabled:opacity-50 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDecisionAction(decision, 'override')}
                            disabled={busy || !canManageExcel || !(overrideInputs[decision.id] ?? '').trim()}
                            className="flex items-center gap-2 px-3 py-2 bg-sky-600/15 border border-sky-500/25 text-sky-300 text-xs font-medium rounded-lg hover:bg-sky-600/25 disabled:opacity-50 transition-colors"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== INTEGRATIONS ===== */}
      {activeTab === 'integrations' && (
        <div style={{ paddingTop:24 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:600, color:'#fff' }}>{Object.keys(connections).length} Connected</div>
              <div style={{ fontSize:12, color:DIM, marginTop:3 }}>Click any integration to connect or view metrics</div>
            </div>
            <button onClick={() => void loadConnections()} disabled={loadingConns}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, background:'transparent', border:`1px solid ${B}`, color:'rgba(255,255,255,0.4)', cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>
              <RefreshCw size={13} className={loadingConns ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
            {intCats.map((cat) => {
              const items = integrations.filter((i) => i.category === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.22)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:12 }}>{catLabels[cat]}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                    {items.map((int) => {
                      const liveConn = connections[int.id];
                      const isConnected = !!liveConn;
                      const isComingSoon = int.status === 'coming-soon';
                      return (
                        <button key={int.id}
                          onClick={() => !isComingSoon && setSelectedInt(int)}
                          disabled={isComingSoon}
                          style={{
                            display:'flex', alignItems:'flex-start', justifyContent:'space-between',
                            padding:'16px', borderRadius:12, textAlign:'left',
                            background:'rgba(255,255,255,0.02)',
                            border:`1px solid ${isConnected ? 'rgba(16,185,129,0.2)' : B}`,
                            cursor: isComingSoon ? 'not-allowed' : 'pointer',
                            opacity: isComingSoon ? 0.5 : 1,
                            transition:'all 0.15s', fontFamily:'inherit',
                          }}
                          onMouseEnter={e => !isComingSoon && (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                        >
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>{int.name}</div>
                            <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{int.description}</div>
                            {isConnected && liveConn.accountName && (
                              <div style={{ fontSize:10, color:'rgba(255,255,255,0.2)', marginTop:4 }}>{liveConn.accountName}</div>
                            )}
                          </div>
                          {isConnected ? (
                            <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, padding:'3px 8px', borderRadius:100, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.2)', color:'#34d399', flexShrink:0, marginLeft:8 }}>
                              <Wifi size={10} /> Live
                            </span>
                          ) : isComingSoon ? (
                            <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, padding:'3px 8px', borderRadius:100, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.2)', color:'#fbbf24', flexShrink:0, marginLeft:8 }}>
                              <Clock size={10} /> Soon
                            </span>
                          ) : (
                            <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, padding:'3px 8px', borderRadius:100, background:'rgba(255,255,255,0.05)', border:`1px solid ${B}`, color:'rgba(255,255,255,0.35)', flexShrink:0, marginLeft:8 }}>
                              <WifiOff size={10} /> Connect
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {selectedInt && (
            <IntegrationModal
              integration={selectedInt}
              connection={connections[selectedInt.id] ?? null}
              onClose={() => setSelectedInt(null)}
              onConnectionChange={() => void loadConnections()}
            />
          )}
        </div>
      )}

      {/* ===== PUBLIC SOURCES ===== */}
      {activeTab === 'public' && (
        <div style={{ paddingTop:24 }}>
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'#fff' }}>External Data Feeds</div>
            <div style={{ fontSize:12, color:DIM, marginTop:4 }}>Public sources powering the Environment Twin — market signals, competitor intel, sentiment, and regulatory updates.</div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
            {pubCats.map((cat) => {
              const items = integrations.filter((i) => i.category === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.22)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:12 }}>{catLabels[cat]}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                    {items.map((int) => {
                      const badge = statusBadge[int.status];
                      const Icon = badge.icon;
                      return (
                        <div key={int.id} style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'16px', borderRadius:12, background:'rgba(255,255,255,0.02)', border:`1px solid ${B}` }}>
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>{int.name}</div>
                            <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:3 }}>{int.description}</div>
                          </div>
                          <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ml-2 shrink-0 ${badge.bg} ${badge.color}`}>
                            <Icon size={10} />
                            {int.status === 'connected' ? 'Live' : int.status === 'available' ? 'Connect' : 'Soon'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pipeline strip */}
          <div style={{ display:'flex', borderTop:`1px solid ${B}`, marginTop:28 }}>
            {['Ingest', 'Normalize', 'Score', 'Route to Twin'].map((step, i) => (
              <div key={step} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'14px 0', borderLeft: i > 0 ? `1px solid ${B}` : 'none' }}>
                <span style={{ width:22, height:22, borderRadius:'50%', background:'rgba(14,165,233,0.1)', border:'1px solid rgba(14,165,233,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'#7dd3fc', flexShrink:0 }}>{i+1}</span>
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
