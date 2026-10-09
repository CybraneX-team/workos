import React, { useState, useEffect } from 'react';
import {
  Zap,
  Volume2,
  VolumeX,
  ShieldCheck,
  Check,
} from 'lucide-react';
import type { ChecklistItem } from '../types';
import { arcadeAudio } from '../utils/arcadeAudio';

interface ChecklistWidgetProps {
  items?: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  instructions?: string;
  onAllCompleted?: () => void;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
}

export const ChecklistWidget: React.FC<ChecklistWidgetProps> = ({
  items = [],
  onChange,
  instructions,
  onAllCompleted,
}) => {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeParticles, setActiveParticles] = useState<{ [nodeId: string]: Particle[] }>({});

  const completedCount = items.filter((i) => i.checked).length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isAllDone = totalCount > 0 && completedCount === totalCount;

  // Trigger fanfare audio when 100% reached
  useEffect(() => {
    if (isAllDone) {
      if (soundEnabled) {
        arcadeAudio.playStepMasteredFanfare();
      }
      if (onAllCompleted) {
        onAllCompleted();
      }
    }
  }, [isAllDone, soundEnabled, onAllCompleted]);

  const triggerNodeParticles = (nodeId: string) => {
    const newParticles: Particle[] = Array.from({ length: 12 }, (_, i) => ({
      id: Date.now() + i,
      x: (Math.random() - 0.5) * 60,
      y: (Math.random() - 0.5) * 60,
      color: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#8b5cf6'][Math.floor(Math.random() * 5)],
    }));

    setActiveParticles((prev) => ({ ...prev, [nodeId]: newParticles }));
    setTimeout(() => {
      setActiveParticles((prev) => {
        const copy = { ...prev };
        delete copy[nodeId];
        return copy;
      });
    }, 900);
  };

  const handleToggle = (id: string, index: number) => {
    const targetItem = items.find((i) => i.id === id);
    const willBeChecked = !targetItem?.checked;

    if (willBeChecked) {
      triggerNodeParticles(id);
      if (soundEnabled) {
        arcadeAudio.playNodeChime(index);
      }
    } else {
      if (soundEnabled) {
        arcadeAudio.playSoftUncheck();
      }
    }

    const updated = items.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item
    );
    onChange(updated);
  };

  return (
    <div className="bg-[#0f1424]/90 rounded-3xl p-6 shadow-xl space-y-5 font-sans relative overflow-hidden text-slate-200 backdrop-blur-xl">
      {/* TOP HEADER */}
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-950/80 text-emerald-400 flex items-center justify-center shadow-xs">
            <Zap size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white tracking-tight">
                Skill-Tree Verification Rail
              </h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900 text-slate-300 font-mono">
                {completedCount}/{totalCount} Armed
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Sequential circuit waypoints · Click node to charge
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Sound Synthesizer SFX Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            className={`p-1.5 rounded-xl border transition-all ${
              soundEnabled
                ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850 hover:text-white'
                : 'bg-slate-950 border-slate-850 text-slate-500 hover:text-slate-300'
            }`}
            title={soundEnabled ? 'Arcade Audio Chimes: Enabled' : 'Arcade Audio: Muted'}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>

          {/* Glowing Mini Progress Bar */}
          <div className="w-28 h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isAllDone
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* INSTRUCTIONS / GUIDANCE */}
      {instructions && (
        <div className="p-3.5 rounded-2xl bg-slate-900/80 text-xs text-slate-300 flex items-start gap-2">
          <ShieldCheck size={15} className="text-violet-400 shrink-0 mt-0.5" />
          <span>{instructions}</span>
        </div>
      )}

      {/* GAMIFIED VERTICAL CIRCUIT WAYPOINT RAIL */}
      <div className="relative py-1 space-y-3">
        {/* Glowing Vertical Circuit Line Track */}
        {totalCount > 1 && (
          <div className="absolute left-[15px] top-6 bottom-6 w-0.5 bg-slate-800 rounded-full overflow-hidden pointer-events-none">
            <div
              className="w-full bg-gradient-to-b from-emerald-400 via-emerald-500 to-teal-400 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.9)]"
              style={{
                height: `${(completedCount / totalCount) * 100}%`,
              }}
            />
          </div>
        )}

        {items.map((item, idx) => {
          const isArmed = item.checked;
          const particles = activeParticles[item.id] || [];

          return (
            <div
              key={item.id}
              onClick={() => handleToggle(item.id, idx)}
              className="group relative flex items-center gap-3.5 cursor-pointer select-none"
            >
              {/* WAYPOINT CIRCUIT NODE SPHERE */}
              <div className="relative w-8 h-8 shrink-0 flex items-center justify-center z-10">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-300 ${
                    isArmed
                      ? 'bg-gradient-to-tr from-emerald-600 to-emerald-400 text-white shadow-[0_0_16px_rgba(16,185,129,0.9)] scale-105'
                      : 'bg-[#12182b] border-2 border-slate-700 text-slate-400 group-hover:border-violet-500 group-hover:text-violet-400 shadow-xs'
                  }`}
                >
                  {isArmed ? (
                    <Check size={15} className="stroke-[3]" />
                  ) : (
                    <span className="text-xs font-mono">{idx + 1}</span>
                  )}
                </div>

                {/* Burst Neon Particles on Check */}
                {particles.length > 0 && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    {particles.map((p) => (
                      <div
                        key={p.id}
                        className="absolute w-2 h-2 rounded-full animate-ping"
                        style={{
                          backgroundColor: p.color,
                          transform: `translate(${p.x}px, ${p.y}px)`,
                          transition: 'all 0.8s ease-out',
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* REQUIREMENT CONTENT CARD */}
              <div
                className={`flex-1 flex items-center justify-between p-3.5 rounded-2xl transition-all duration-200 active:scale-[0.99] ${
                  isArmed
                    ? 'bg-gradient-to-r from-emerald-950/40 via-emerald-950/20 to-slate-900/60 shadow-md shadow-emerald-950/30'
                    : 'bg-[#13192b]/70 group-hover:bg-[#161d31] shadow-2xs'
                }`}
              >
                <div className="min-w-0 pr-3">
                  <div
                    className={`text-xs font-semibold leading-relaxed transition-colors ${
                      isArmed
                        ? 'text-white font-bold'
                        : 'text-slate-300 group-hover:text-white'
                    }`}
                  >
                    {item.label}
                  </div>
                  <div
                    className={`text-[10px] font-mono mt-0.5 ${
                      isArmed ? 'text-emerald-400 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    Waypoint {idx + 1} · {isArmed ? 'Requirement Verified' : 'Pending Action'}
                  </div>
                </div>

                <span
                  className={`shrink-0 text-[10px] font-mono font-bold px-2.5 py-1 rounded-full transition-all ${
                    isArmed
                      ? 'bg-emerald-950/80 text-emerald-300'
                      : 'bg-slate-900/90 text-slate-400 group-hover:bg-slate-800 group-hover:text-slate-200'
                  }`}
                >
                  {isArmed ? 'CHARGED ✓' : 'STANDBY'}
                </span>
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-500 bg-slate-900/50 rounded-2xl">
            No checklist requirements configured in this playbook.
          </div>
        )}
      </div>
    </div>
  );
};
