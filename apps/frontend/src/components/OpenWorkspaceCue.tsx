import { ChevronUp } from 'lucide-react';

export interface OpenWorkspaceCueProps {
  onClick: () => void;
  className?: string;
}

/** Bottom-center affordance — animated chevrons + label to open the BDT workspace. */
export function OpenWorkspaceCue({ onClick, className }: OpenWorkspaceCueProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`open-workspace-cue group absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-auto ${className ?? ''}`}
      aria-label="Open Workspace"
    >
      <span className="open-workspace-cue__chevrons relative flex flex-col items-center h-7 w-8" aria-hidden>
        <ChevronUp
          className="open-workspace-cue__chevron open-workspace-cue__chevron--first absolute bottom-0 w-5 h-5 text-white/55 group-hover:text-[#C1AEFF]"
          strokeWidth={2.25}
        />
        <ChevronUp
          className="open-workspace-cue__chevron open-workspace-cue__chevron--second absolute bottom-0 w-5 h-5 text-white/35 group-hover:text-[#C1AEFF]/70"
          strokeWidth={2.25}
        />
      </span>
      <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-white/50 group-hover:text-white/90 transition-colors duration-200">
        Open Workspace
      </span>
    </button>
  );
}
