import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Globe, Loader2, CheckCircle2, Search } from 'lucide-react';
import type { UniverseController } from '../three-universe/UniverseController';
import {
  createReferenceCompany,
  type ReferenceCompany,
  type ReferenceCompanyJob,
} from '../lib/db/referenceCompanies';
import type { CompanyTag } from '../lib/useSavedWorkflows';
import { COMPANY_TAG_LABELS, COMPANY_TAG_ICONS, COMPANY_TAG_COLORS } from '../lib/useSavedWorkflows';

interface CreateCompanyModalProps {
  industryId: string;
  subdomainId: string;
  subdomainName: string;
  industryName: string;
  industryColor: string;
  draftPlanetId: string | null;
  controllerRef: React.MutableRefObject<UniverseController | null>;
  onClose: (isCancel?: boolean) => void;
  onCreated: (result: { company: ReferenceCompany; job: ReferenceCompanyJob }) => void;
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#fff',
  borderRadius: '0.625rem',
  padding: '8px 12px',
  fontSize: '13px',
  outline: 'none',
  width: '100%',
  transition: 'border-color 0.2s',
};

function hostnameFromUrl(raw: string): string {
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return raw;
  }
}

export default function CreateCompanyModal({
  subdomainId,
  subdomainName,
  industryName,
  industryColor,
  draftPlanetId,
  controllerRef,
  onClose,
  onCreated,
}: CreateCompanyModalProps) {
  const [url, setUrl] = useState('');
  const [classification, setClassification] = useState<CompanyTag | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [planetPos, setPlanetPos] = useState<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Live-update planet label with hostname as user types
  useEffect(() => {
    if (draftPlanetId && controllerRef.current) {
      const label = url ? hostnameFromUrl(url) : 'New Company';
      controllerRef.current.updateDraftName(draftPlanetId, label);
    }
  }, [url, draftPlanetId, controllerRef]);

  // Track planet screen position for connector line
  const updatePlanetPos = useCallback(() => {
    if (!draftPlanetId || !controllerRef.current) return;
    const pos = controllerRef.current.getCompanyScreenPos(draftPlanetId);
    if (pos) setPlanetPos(pos);
    rafRef.current = requestAnimationFrame(updatePlanetPos);
  }, [draftPlanetId, controllerRef]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(updatePlanetPos);
    return () => cancelAnimationFrame(rafRef.current);
  }, [updatePlanetPos]);

  // Auto-focus URL field
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    // Silently prepend https:// if missing
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    setLoading(true);
    setError(null);
    try {
      const result = await createReferenceCompany({ url: normalized, subdomainId, classification: classification ?? undefined });
      setDone(true);
      setTimeout(() => {
        onCreated(result);
        onClose(false);
      }, 1200);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Failed to add company. Please try again.');
    }
  }

  const modalLeft = 24;
  const modalTop = 100;
  const modalWidth = 340;
  const modalHeight = 220;
  const modalCenterY = modalTop + modalHeight / 2;
  const modalRight = modalLeft + modalWidth;

  const hostname = url ? hostnameFromUrl(url) : null;

  /* ── Success state ── */
  if (done) {
    return (
      <div
        className="fixed z-[999] flex flex-col items-center justify-center gap-4 p-8 rounded-2xl"
        style={{
          left: modalLeft, top: modalTop, width: modalWidth,
          background: 'rgba(10, 10, 12, 0.95)',
          border: `1px solid ${industryColor}40`,
          backdropFilter: 'blur(20px)',
          boxShadow: `0 0 60px ${industryColor}18, 0 24px 64px rgba(0,0,0,0.7)`,
        }}
      >
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: `${industryColor}20` }}
        >
          <CheckCircle2 className="w-7 h-7" style={{ color: industryColor }} />
        </div>
        <p className="text-white text-sm font-semibold">Research started!</p>
        <p className="text-xs text-center" style={{ color: '#5E5E5E' }}>
          <span style={{ color: industryColor }}>{hostname}</span> is being researched in{' '}
          <span className="text-white">{subdomainName}</span>
        </p>
      </div>
    );
  }

  /* ── Main floating panel ── */
  return (
    <>
      {/* Connector line from modal to draft planet */}
      {planetPos && (
        <svg
          className="create-modal-connector"
          style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 998 }}
        >
          <line
            x1={modalRight + 8} y1={modalCenterY}
            x2={planetPos.x} y2={planetPos.y}
            stroke={industryColor} strokeWidth="1.5" strokeOpacity="0.5"
          />
          <circle cx={planetPos.x} cy={planetPos.y} r="4" fill={industryColor} fillOpacity="0.7" />
          <circle cx={modalRight + 8} cy={modalCenterY} r="3" fill={industryColor} fillOpacity="0.5" />
        </svg>
      )}

      {/* Floating panel */}
      <div
        className="fixed z-[999] flex flex-col rounded-2xl overflow-hidden"
        style={{
          left: modalLeft, top: modalTop, width: modalWidth,
          background: 'rgba(10, 10, 12, 0.92)',
          border: `1px solid ${industryColor}25`,
          backdropFilter: 'blur(24px)',
          boxShadow: `0 0 80px ${industryColor}12, 0 24px 64px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)`,
          animation: 'panel-slide-in 0.3s cubic-bezier(0.23, 1, 0.32, 1) both',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2.5 px-4 py-3.5 shrink-0"
          style={{ borderBottom: `1px solid ${industryColor}15` }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${industryColor}18`, border: `1px solid ${industryColor}25` }}
          >
            <Search className="w-4 h-4" style={{ color: industryColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white text-sm font-semibold leading-tight">Research Company</h2>
            <p className="text-[10px] mt-0.5 truncate" style={{ color: '#5E5E5E' }}>
              {industryName} → <span style={{ color: industryColor }}>{subdomainName}</span>
            </p>
          </div>
          <button
            onClick={() => onClose(true)}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/10 shrink-0"
            style={{ color: '#5E5E5E' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-4 py-3.5 flex flex-col gap-3.5">
          {/* URL field */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5E5E5E' }}>
              Company Website
            </label>
            <div className="relative">
              <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: '#5E5E5E' }} />
              <input
                ref={inputRef}
                type="url"
                placeholder="https://competitor.com"
                value={url}
                onChange={e => { setUrl(e.target.value); setError(null); }}
                required
                style={{ ...inputStyle, paddingLeft: '28px', fontSize: '13px' }}
                onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
              />
            </div>
          </div>

          {/* Classification picker */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5E5E5E' }}>
              Classify as
            </label>
            <div className="flex gap-2">
              {(Object.keys(COMPANY_TAG_LABELS) as CompanyTag[]).map(tag => {
                const Icon = COMPANY_TAG_ICONS[tag];
                const color = COMPANY_TAG_COLORS[tag];
                const isActive = classification === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setClassification(isActive ? null : tag)}
                    className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                    style={{
                      background: isActive ? `${color}20` : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isActive ? color + '55' : 'rgba(255,255,255,0.08)'}`,
                      color: isActive ? color : 'rgba(255,255,255,0.3)',
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {COMPANY_TAG_LABELS[tag]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Context badge */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[10px]"
            style={{ background: `${industryColor}0a`, border: `1px solid ${industryColor}15`, color: industryColor }}
          >
            <Search className="w-3 h-3 shrink-0" />
            <span>
              AI will research and build a twin in <strong>{subdomainName}</strong>
            </span>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
              {error}
            </p>
          )}
        </form>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3 shrink-0"
          style={{ borderTop: `1px solid ${industryColor}12` }}
        >
          <button
            type="button"
            onClick={() => onClose(true)}
            className="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors hover:bg-white/5"
            style={{ color: '#5E5E5E' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !url.trim() || !classification}
            onClick={handleSubmit}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-[11px] font-semibold transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, ${industryColor}, ${industryColor}bb)`, color: '#161618' }}
          >
            {loading ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" />Researching…</>
            ) : (
              <><Search className="w-3.5 h-3.5" />Research</>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
