import type {
  ReactNode,
  HTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  ButtonHTMLAttributes,
} from 'react';

// Shared primitives for the incubator surface — glassmorphic violet theme,
// matching the look already established by IncubatorAuthPage.tsx /
// SpaceAuthLayout.tsx (the only part of this persona's UI designed so far).

export const ACCENT = '#a78bfa';
export const ACCENT2 = '#7c3aed';

export function Card({ children, className = '', ...rest }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.24)] ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function GlassModal({
  children,
  onClose,
  className = '',
}: {
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full rounded-2xl overflow-hidden ${className}`}
        style={{
          background: 'rgba(12,12,18,0.97)',
          border: '1px solid rgba(167,139,250,0.18)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
          backdropFilter: 'blur(40px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">{title}</h1>
        {description && <p className="text-sm text-white/50 mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function PrimaryButton({ className = '', disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-px hover:shadow-[0_6px_22px_rgba(167,139,250,0.32)]'
      } ${className}`}
      style={{ background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`, color: 'white' }}
    />
  );
}

export function SecondaryButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-4 py-2 rounded-xl text-sm font-medium border border-white/15 text-white/80 hover:bg-white/[0.06] transition-colors ${className}`}
    />
  );
}

export function DangerButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-4 py-2 rounded-xl text-sm font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors ${className}`}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="block text-xs font-medium text-white/50 mb-1.5">{children}</label>;
}

const inputBase =
  'w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-sm text-white placeholder:text-white/30 ' +
  'focus:outline-none focus:border-[#a78bfa]/45 focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(167,139,250,0.1)] transition-all';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${props.className ?? ''}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputBase} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`${inputBase} cursor-pointer [&>option]:bg-[#15151c] [&>option]:text-white ${props.className ?? ''}`}
    />
  );
}

const STATUS_STYLES: Record<string, string> = {
  provisional: 'bg-white/10 text-white/60 border border-white/10',
  invited: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  claimed: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  pending: 'bg-white/10 text-white/60 border border-white/10',
  sent: 'bg-sky-500/15 text-sky-300 border border-sky-500/25',
  opened: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  bounced: 'bg-red-500/15 text-red-300 border border-red-500/25',
  expired: 'bg-white/10 text-white/40 border border-white/10',
  active: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  draft: 'bg-white/10 text-white/60 border border-white/10',
  completed: 'bg-sky-500/15 text-sky-300 border border-sky-500/25',
  archived: 'bg-white/10 text-white/40 border border-white/10',
  none: 'bg-white/10 text-white/40 border border-white/10',
  accepted: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  declined: 'bg-red-500/15 text-red-300 border border-red-500/25',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-white/10 text-white/60 border border-white/10';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cls}`}>{status}</span>;
}

/* ── Stage badges — colored pill keyed off companies.stage (COMPANY_STAGE_ENUM) ── */
export const STAGE_COLORS: Record<string, string> = {
  Idea: '#8a8a9a',
  'Pre-seed': '#a78bfa',
  Seed: '#c4b5fd',
  'Series A': '#22d3ee',
  'Series B': '#34d399',
  'Series C': '#fbbf24',
  'Series D+': '#fb923c',
  'Pre-IPO': '#ec4899',
  Public: '#10b981',
  PSU: '#93c5fd',
  Bootstrapped: '#6ee7b7',
  Others: '#71717a',
};

export function StageBadge({ stage }: { stage: string }) {
  const c = STAGE_COLORS[stage] ?? '#8a8a9a';
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: `${c}18`, color: c, border: `1px solid ${c}30` }}
    >
      {stage}
    </span>
  );
}

/* ── Avatar — initials in a colored circle, color hashed from the name ── */
const AVATAR_COLORS = ['#a78bfa', '#22d3ee', '#34d399', '#fbbf24', '#fb923c', '#f87171', '#ec4899', '#93c5fd'];

/* Deterministic color for any free-text string (sectors, names, etc — no fixed lookup table). */
export function stringColor(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function Avatar({ name, size = 32, color }: { name: string; size?: number; color?: string }) {
  const c = color ?? stringColor(name);
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?';
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-bold"
      style={{
        width: size,
        height: size,
        background: `${c}18`,
        border: `1px solid ${c}35`,
        color: c,
        fontSize: Math.max(9, size * 0.34),
      }}
    >
      {initials}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  color = ACCENT,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: any;
  color?: string;
}) {
  return (
    <Card className="p-4" style={{ borderColor: `${color}22` }}>
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon size={13} style={{ color, opacity: 0.85 }} />}
        <p className="text-xs font-medium text-white/40 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {hint && <p className="text-xs text-white/40 mt-1">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <Card className="p-10 text-center">
      <p className="text-white/80 font-medium">{title}</p>
      {description && <p className="text-sm text-white/40 mt-1.5 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <div
      className="rounded-full animate-spin"
      style={{ width: size, height: size, border: `2px solid ${ACCENT}`, borderTopColor: 'transparent' }}
    />
  );
}

/* ── Compact currency formatter — $1.2M / $340K / $890 ── */
export function fmt(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

/* ── SVG donut chart — pure renderer, no data assumptions ── */
export function Donut({ segments, size = 80 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, d) => s + d.value, 0);
  if (!total) return <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />;
  const cx = size / 2, cy = size / 2, R = size * 0.44, r = size * 0.27;
  let cum = 0;
  const paths = segments.filter((s) => s.value > 0).map((s) => {
    const sa = (cum / total) * 2 * Math.PI - Math.PI / 2;
    cum += s.value;
    const ea = (cum / total) * 2 * Math.PI - Math.PI / 2;
    const lg = s.value / total > 0.5 ? 1 : 0;
    const x1 = cx + R * Math.cos(sa), y1 = cy + R * Math.sin(sa);
    const x2 = cx + R * Math.cos(ea), y2 = cy + R * Math.sin(ea);
    const ix1 = cx + r * Math.cos(ea), iy1 = cy + r * Math.sin(ea);
    const ix2 = cx + r * Math.cos(sa), iy2 = cy + r * Math.sin(sa);
    return { ...s, path: `M${x1},${y1} A${R},${R} 0 ${lg},1 ${x2},${y2} L${ix1},${iy1} A${r},${r} 0 ${lg},0 ${ix2},${iy2}Z` };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths.map((p, i) => <path key={i} d={p.path} fill={p.color} opacity={0.9} />)}
      <circle cx={cx} cy={cy} r={r - 1} fill="rgba(10,10,14,0.95)" />
    </svg>
  );
}
