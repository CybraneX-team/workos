import React from 'react';
import { Plus, Minus, FormInput } from 'lucide-react';
import type { FormField } from '../types';

interface InputFormWidgetProps {
  fields?: FormField[];
  onChange: (fields: FormField[]) => void;
  instructions?: string;
}

export const InputFormWidget: React.FC<InputFormWidgetProps> = ({
  fields = [],
  onChange,
  instructions,
}) => {
  const handleFieldChange = (id: string, value: string | number) => {
    const updated = fields.map((f) => (f.id === id ? { ...f, value } : f));
    onChange(updated);
  };

  const handleIncrement = (id: string, delta: number) => {
    const field = fields.find((f) => f.id === id);
    if (!field) return;
    const current = typeof field.value === 'number' ? field.value : Number(field.value) || 0;
    const next = Math.max(0, current + delta);
    handleFieldChange(id, next);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200">
            <FormInput size={16} />
          </span>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Live Execution & Metrics Logger</h4>
            <p className="text-xs text-slate-500">Log quantitative inputs and notes in real time</p>
          </div>
        </div>
      </div>

      {instructions && (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
          {instructions}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((field) => {
          if (field.type === 'counter') {
            const numVal = typeof field.value === 'number' ? field.value : Number(field.value) || 0;
            const pct = field.target ? Math.min(100, Math.round((numVal / field.target) * 100)) : null;

            return (
              <div
                key={field.id}
                className="p-4 rounded-xl bg-slate-50/70 border border-slate-200 hover:border-slate-300 transition-all flex flex-col justify-between space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">{field.label}</span>
                  {field.target && (
                    <span className="text-[11px] font-mono font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                      Target: {field.target}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => handleIncrement(field.id, -1)}
                    className="w-9 h-9 rounded-lg bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200 shadow-sm active:scale-95 transition-all"
                  >
                    <Minus size={14} />
                  </button>

                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
                      {numVal}
                    </span>
                    {pct !== null && (
                      <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {pct}% achieved
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleIncrement(field.id, 1)}
                    className="w-9 h-9 rounded-lg bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center border border-violet-600 shadow-sm active:scale-95 transition-all"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {field.target && (
                  <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        pct && pct >= 100 ? 'bg-emerald-500' : 'bg-violet-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            );
          }

          if (field.type === 'select') {
            return (
              <div key={field.id} className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200 space-y-1.5">
                <label className="text-xs font-semibold text-slate-800 block">{field.label}</label>
                <select
                  value={field.value}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-violet-500"
                >
                  {(field.options || []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          return (
            <div
              key={field.id}
              className={`p-3.5 rounded-xl bg-slate-50/70 border border-slate-200 space-y-1.5 ${
                field.type === 'text' && String(field.value).length > 40 ? 'md:col-span-2' : ''
              }`}
            >
              <label className="text-xs font-semibold text-slate-800 block">{field.label}</label>
              {field.type === 'text' ? (
                <textarea
                  rows={2}
                  value={field.value}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 resize-none"
                  placeholder="Enter details..."
                />
              ) : (
                <input
                  type="number"
                  value={field.value}
                  onChange={(e) => handleFieldChange(field.id, Number(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-violet-500 font-mono"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
