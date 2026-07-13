import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle: string;
  icon: ReactNode;
  badge?: string;
}

export default function PageHeader({ title, subtitle, icon, badge }: Props) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(27,27,29,0.9)', border: '1px solid rgba(255,255,255,0.07)', color: '#C1AEFF' }}
        >
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">{title}</h1>
            {badge && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider"
                style={{ background: 'rgba(193,174,255,0.12)', color: '#C1AEFF' }}
              >
                {badge}
              </span>
            )}
          </div>
          <p className="text-sm mt-0.5" style={{ color: '#5E5E5E' }}>{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
