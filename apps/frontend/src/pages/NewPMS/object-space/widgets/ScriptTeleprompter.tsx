import React, { useState } from 'react';
import { Copy, Check, MessageSquare, Sparkles, HelpCircle } from 'lucide-react';
import type { ObjectionCheat } from '../types';

interface ScriptTeleprompterProps {
  scriptContent?: string;
  objectionCheats?: ObjectionCheat[];
  onNotesChange?: (notes: string) => void;
}

export const ScriptTeleprompter: React.FC<ScriptTeleprompterProps> = ({
  scriptContent = '',
  objectionCheats = [],
}) => {
  const [copied, setCopied] = useState(false);
  const [activeObjectionId, setActiveObjectionId] = useState<string | null>(
    objectionCheats[0]?.id || null
  );

  const handleCopy = () => {
    if (!scriptContent) return;
    navigator.clipboard.writeText(scriptContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeObjection = objectionCheats.find((o) => o.id === activeObjectionId);

  // Format token highlights like [First Name], [Company Name]
  const renderFormattedScript = (text: string) => {
    return text.split('\n\n').map((paragraph, idx) => {
      const parts = paragraph.split(/(\[[^\]]+\]|\*\*[^*]+\*\*|\*[^*]+\*)/g);
      return (
        <p key={idx} className="leading-relaxed text-sm text-slate-800 mb-3 last:mb-0">
          {parts.map((part, pIdx) => {
            if (part.startsWith('[') && part.endsWith(']')) {
              return (
                <span
                  key={pIdx}
                  className="px-1.5 py-0.5 rounded text-xs font-mono font-semibold bg-violet-100 text-violet-800 border border-violet-200 mx-0.5"
                >
                  {part}
                </span>
              );
            }
            if (part.startsWith('**') && part.endsWith('**')) {
              return (
                <strong key={pIdx} className="font-bold text-slate-900 block mb-1 text-xs uppercase tracking-wider">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            if (part.startsWith('*') && part.endsWith('*')) {
              return (
                <em key={pIdx} className="italic text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                  {part.slice(1, -1)}
                </em>
              );
            }
            return part;
          })}
        </p>
      );
    });
  };

  return (
    <div className="space-y-4">
      {/* Script Teleprompter Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-violet-50 text-violet-700 border border-violet-200">
              <MessageSquare size={16} />
            </span>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Live Script Teleprompter</h4>
              <p className="text-xs text-slate-500">Verbatim talk track & opening hook</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
          >
            {copied ? (
              <>
                <Check size={13} className="text-emerald-600" />
                <span className="text-emerald-600 font-semibold">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>Copy Pitch</span>
              </>
            )}
          </button>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          {renderFormattedScript(scriptContent || 'No script content provided for this step.')}
        </div>
      </div>

      {/* Objection Handling Cheat Sheet */}
      {objectionCheats.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
              <Sparkles size={16} />
            </span>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Objection Rebuttal Copilot</h4>
              <p className="text-xs text-slate-500">Quick answers when prospects push back</p>
            </div>
          </div>

          {/* Objection Chips */}
          <div className="flex flex-wrap gap-2 mb-3">
            {objectionCheats.map((obj) => (
              <button
                key={obj.id}
                type="button"
                onClick={() => setActiveObjectionId(obj.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeObjectionId === obj.id
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-sm font-semibold'
                    : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200'
                }`}
              >
                <HelpCircle size={12} />
                {obj.title}
              </button>
            ))}
          </div>

          {/* Active Objection Rebuttal Display */}
          {activeObjection && (
            <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-xs font-mono font-semibold text-amber-800 uppercase tracking-wider shrink-0 mt-0.5">
                  Prospect says:
                </span>
                <span className="text-xs italic text-slate-800 font-medium">
                  {activeObjection.trigger}
                </span>
              </div>
              <div className="pt-2 border-t border-amber-200/80 flex items-start gap-2">
                <span className="text-xs font-mono font-semibold text-emerald-800 uppercase tracking-wider shrink-0 mt-0.5">
                  Say this:
                </span>
                <p className="text-xs text-slate-800 leading-relaxed font-sans">
                  {activeObjection.rebuttal}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
