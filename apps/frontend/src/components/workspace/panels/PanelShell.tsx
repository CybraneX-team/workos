import type { ReactNode, CSSProperties } from 'react';

// Shared BDT workspace panel primitives. Previously duplicated (not imported) across
// BdtActionWorkspace.tsx, ActionNodeWorkspace.tsx, and JoinWorkspace.tsx — this is the one
// place new panels (and, gradually, those older files) should import from.

export function SectionTitle({ children, icon: Icon }: { children: ReactNode; icon?: any }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {Icon && <Icon className="w-3.5 h-3.5 text-white/40" />}
      <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/40">{children}</span>
    </div>
  );
}

export function GlassCard({ children, className = '', style = {} }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`anw-glass-card ${className}`} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '20px', ...style }}>
      {children}
    </div>
  );
}
