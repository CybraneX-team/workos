import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Check, Loader2 } from 'lucide-react';
import {
  COMPANY_TAG_LABELS,
  COMPANY_TAG_ICONS,
  COMPANY_TAG_COLORS,
  type CompanyTag,
} from '../../lib/useSavedWorkflows';
import { setReferenceCompanyClassification } from '../../lib/db/referenceCompanies';
import type { UserPlanetRole } from '../../data/companyPlanetRoots';

export interface CompanyTagDropdownProps {
  companyId: string;
  companyName: string;
  role?: UserPlanetRole;
  industryColor?: string;
  referenceCompanyId?: string;
  activeClassification?: 'competitor' | 'customer' | 'collaborator' | null;
  onClassificationChange?: (tag: CompanyTag | null) => void;
}

export function CompanyTagDropdown({
  companyId: _companyId,
  companyName: _companyName,
  role: _role,
  industryColor = '#C1AEFF',
  referenceCompanyId,
  activeClassification,
  onClassificationChange,
}: CompanyTagDropdownProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [saving, setSaving] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClose = () => setMenuOpen(false);
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
    };
  }, [menuOpen]);

  const activeTag = activeClassification as CompanyTag | null | undefined;

  const handleTag = async (tag: CompanyTag, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);

    const newTag = activeTag === tag ? null : tag;

    if (!referenceCompanyId) {
      // No reference company yet — notify parent but can't persist
      onClassificationChange?.(newTag);
      return;
    }

    setSaving(true);
    try {
      const result = await setReferenceCompanyClassification(referenceCompanyId, newTag);
      onClassificationChange?.(newTag);
      // Trigger a context refresh if the parent hasn't subscribed to onClassificationChange
      if (!onClassificationChange) {
        window.dispatchEvent(new CustomEvent('reference_company_classified', {
          detail: { referenceCompanyId, classification: newTag, classifyJob: result.classifyJob },
        }));
      }
    } catch (err) {
      console.error('[CompanyTagDropdown] classification update failed', err);
    } finally {
      setSaving(false);
    }
  };

  const ActiveIcon = activeTag ? COMPANY_TAG_ICONS[activeTag] : null;
  const activeColor = activeTag ? COMPANY_TAG_COLORS[activeTag] : industryColor;

  return (
    <div className="relative w-full" onClick={e => e.stopPropagation()}>
      <button
        ref={buttonRef}
        disabled={saving}
        onClick={(e) => {
          e.stopPropagation();
          if (!menuOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setCoords({ top: rect.top, left: rect.right + 12 });
          }
          setMenuOpen(!menuOpen);
        }}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
        style={{
          background: activeTag ? `${activeColor}15` : 'rgba(255,255,255,0.03)',
          border: `1px solid ${activeTag ? activeColor + '40' : 'rgba(255,255,255,0.08)'}`,
          color: activeTag ? activeColor : 'rgba(255,255,255,0.5)',
        }}
      >
        <div className="flex items-center gap-2">
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            ActiveIcon && <ActiveIcon className="w-3.5 h-3.5" />
          )}
          {activeTag ? COMPANY_TAG_LABELS[activeTag] : saving ? 'Saving…' : 'Classify'}
        </div>
        <ChevronRight className="w-3.5 h-3.5 transition-transform" />
      </button>

      {menuOpen && createPortal(
        <div
          className="fixed w-48 rounded-xl overflow-hidden shadow-2xl z-[99999] border border-white/10"
          style={{
            top: coords.top,
            left: coords.left,
            background: 'rgba(15, 15, 20, 0.95)',
            backdropFilter: 'blur(20px)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="py-1">
            {(Object.entries(COMPANY_TAG_LABELS) as [CompanyTag, string][]).map(([tag, label]) => {
              const Icon = COMPANY_TAG_ICONS[tag];
              const color = COMPANY_TAG_COLORS[tag];
              const isActive = activeTag === tag;
              return (
                <button
                  key={tag}
                  onClick={(e) => handleTag(tag, e)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                    <span className="text-[11px] font-semibold text-white/80">{label}</span>
                  </div>
                  {isActive && <Check className="w-3.5 h-3.5" style={{ color }} />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
