import React, { useState, useEffect } from 'react';
import {
  X,
  ListChecks,
  Zap,
  Plus,
  Trash2,
  MessageSquare,
  Mail,
  Calendar,
  Video,
  Globe,
  ShieldCheck,
} from 'lucide-react';
import type { TaskStep, StepType, ConnectorType, ConnectorConfig } from '../types';
import { buildConnectorUrl } from '../utils/connectorUtils';

interface AddStepModalProps {
  currentStepCount: number;
  onAddStep: (newStep: TaskStep) => void;
  onClose: () => void;
}

export const AddStepModal: React.FC<AddStepModalProps> = ({
  currentStepCount,
  onAddStep,
  onClose,
}) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<StepType>('checklist');
  const [instructions, setInstructions] = useState('');
  
  // Checklist State
  const [checklistItems, setChecklistItems] = useState<string[]>([
    'Verify requirements',
    'Confirm with lead',
  ]);
  const [newItemText, setNewItemText] = useState('');

  // Connector State
  const [connectorType, setConnectorType] = useState<ConnectorType>('whatsapp_chat');
  const [phoneNumber, setPhoneNumber] = useState('+1 (415) 882-9012');
  const [emailRecipient, setEmailRecipient] = useState('lead@example.com');
  const [emailSubject, setEmailSubject] = useState('WorkOS Playbook & Next Steps');
  const [messageBody, setMessageBody] = useState('Hi, following up on our implementation timeline and requirements.');
  const [calendarTitle, setCalendarTitle] = useState('Implementation Review & Sync');
  const [calendarDate, setCalendarDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [calendarTime, setCalendarTime] = useState('14:00');
  const [customUrl, setCustomUrl] = useState('https://');
  const [customLabel, setCustomLabel] = useState('Connected Tool');

  // Hide global navigation bars when modal is open
  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, []);

  const handleAddChecklistItem = () => {
    if (!newItemText.trim()) return;
    setChecklistItems((prev) => [...prev, newItemText.trim()]);
    setNewItemText('');
  };

  const handleRemoveChecklistItem = (indexToRemove: number) => {
    setChecklistItems((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleUpdateChecklistItem = (indexToUpdate: number, newLabel: string) => {
    setChecklistItems((prev) =>
      prev.map((item, idx) => (idx === indexToUpdate ? newLabel : item))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    // If user has unsubmitted text in the newItemText field, include it too
    let finalItems = [...checklistItems];
    if (newItemText.trim()) {
      finalItems.push(newItemText.trim());
    }

    const newStep: TaskStep = {
      id: `custom-step-${Date.now()}`,
      stepOrder: currentStepCount + 1,
      title: title.trim(),
      type,
      isCompleted: false,
      instructions: instructions.trim() || undefined,
    };

    if (type === 'checklist') {
      const items = finalItems
        .filter((l) => l.trim().length > 0)
        .map((label, idx) => ({
          id: `item-${Date.now()}-${idx}`,
          label: label.trim(),
          checked: false,
        }));
      newStep.checklistItems = items;
    } else if (type === 'connector_action') {
      const payload = {
        phoneNumber: phoneNumber.trim(),
        recipient: emailRecipient.trim(),
        subject: emailSubject.trim(),
        body: messageBody.trim(),
        eventTitle: calendarTitle.trim(),
        eventDate: calendarDate,
        eventTime: calendarTime,
        customUrl: customUrl.trim(),
      };

      const actionUrl = buildConnectorUrl(connectorType, payload, customUrl);
      
      const connectorLabel =
        connectorType === 'whatsapp_chat'
          ? `WhatsApp Message (${phoneNumber.trim() || 'Direct'})`
          : connectorType === 'gmail_sender'
          ? `Gmail Compose (${emailRecipient.trim() || 'Draft'})`
          : connectorType === 'google_calendar'
          ? `Google Calendar (${calendarTitle.trim()})`
          : connectorType === 'google_meet'
          ? 'Google Meet Video Room'
          : customLabel.trim() || 'Custom Connected Tool';

      newStep.connector = {
        type: connectorType,
        label: connectorLabel,
        actionUrl,
        description: messageBody.trim() || instructions.trim() || undefined,
        payload,
      };
    }

    onAddStep(newStep);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn font-sans">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header without top-left icon */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
          <div>
            <h3 className="text-base font-bold text-slate-900">Add Custom Implementation Step</h3>
            <p className="text-[11px] text-slate-500">Configure playbook step instructions and actions</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-4 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden flex-1"
        >
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Step Title</label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Secondary ICP Touchpoint & Follow-up"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Instructions / Guidance Notes (Optional)
            </label>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g., Follow standardized SOP before marking complete"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-2">Step Widget Type</label>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { type: 'checklist' as StepType, label: 'Checklist', icon: ListChecks, desc: 'SOP checkboxes' },
                { type: 'connector_action' as StepType, label: 'Connector', icon: Zap, desc: '1-click tool bridge' },
              ].map((opt) => {
                const Icon = opt.icon;
                const isSelected = type === opt.type;
                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => setType(opt.type)}
                    className={`flex items-start gap-2.5 p-3 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? 'bg-violet-50 border-violet-500 text-violet-900 shadow-xs'
                        : 'bg-slate-50/70 border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                    }`}
                  >
                    <Icon size={16} className={isSelected ? 'text-violet-600' : 'text-slate-400'} />
                    <div>
                      <div className="text-xs font-bold">{opt.label}</div>
                      <div className="text-[10px] text-slate-500">{opt.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {type === 'checklist' && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 block">
                  Checklist Items
                </label>
                <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-100">
                  {checklistItems.length + (newItemText.trim() ? 1 : 0)} items
                </span>
              </div>

              {/* Continuous List / Rail of items */}
              <div className="space-y-2 bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80">
                {checklistItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs group hover:border-violet-300 transition-all"
                  >
                    <div className="w-5 h-5 rounded-md bg-violet-100 text-violet-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                      {idx + 1}
                    </div>
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => handleUpdateChecklistItem(idx, e.target.value)}
                      className="flex-1 bg-transparent text-xs text-slate-800 font-medium focus:outline-none focus:text-violet-900"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveChecklistItem(idx)}
                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Remove item"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}

                {/* Inline Add Item Field & Button */}
                <div className="flex items-center gap-2 pt-1">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={newItemText}
                      onChange={(e) => setNewItemText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddChecklistItem();
                        }
                      }}
                      placeholder="Add next checklist item..."
                      className="w-full bg-white border border-dashed border-violet-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddChecklistItem}
                    disabled={!newItemText.trim()}
                    className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-all shrink-0 active:scale-95"
                  >
                    <Plus size={14} />
                    <span>Add</span>
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 pl-1">
                Press Enter or click Add to append item to checklist list.
              </p>
            </div>
          )}

          {type === 'connector_action' && (
            <div className="space-y-3.5 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-2">
                  Select Action Connector Preset
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'whatsapp_chat' as ConnectorType, label: 'WhatsApp', icon: MessageSquare, color: 'text-emerald-600' },
                    { id: 'gmail_sender' as ConnectorType, label: 'Gmail', icon: Mail, color: 'text-rose-600' },
                    { id: 'google_calendar' as ConnectorType, label: 'Calendar', icon: Calendar, color: 'text-blue-600' },
                    { id: 'google_meet' as ConnectorType, label: 'Meet Call', icon: Video, color: 'text-amber-600' },
                    { id: 'custom_link' as ConnectorType, label: 'Custom URL', icon: Globe, color: 'text-violet-600' },
                  ].map((preset) => {
                    const PresetIcon = preset.icon;
                    const isSelected = connectorType === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setConnectorType(preset.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-violet-50 border-violet-500 text-violet-950 font-bold shadow-2xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                        }`}
                      >
                        <PresetIcon size={15} className={preset.color} />
                        <span className="text-xs">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Contextual Input Form depending on connectorType */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                {/* 1. WHATSAPP */}
                {connectorType === 'whatsapp_chat' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                        <span>Recipient Phone Number</span>
                        <span className="text-[10px] text-slate-400 font-normal">With country code</span>
                      </label>
                      <input
                        type="text"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="e.g., +1 415 882 9012"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">
                        Prefilled Message Text
                      </label>
                      <textarea
                        rows={2}
                        value={messageBody}
                        onChange={(e) => setMessageBody(e.target.value)}
                        placeholder="e.g., Hi, following up on our implementation..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-violet-500 resize-none"
                      />
                    </div>
                  </>
                )}

                {/* 2. GMAIL */}
                {connectorType === 'gmail_sender' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">Recipient Email</label>
                        <input
                          type="email"
                          value={emailRecipient}
                          onChange={(e) => setEmailRecipient(e.target.value)}
                          placeholder="client@company.com"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">Subject Line</label>
                        <input
                          type="text"
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          placeholder="Subject..."
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">Email Body</label>
                      <textarea
                        rows={2}
                        value={messageBody}
                        onChange={(e) => setMessageBody(e.target.value)}
                        placeholder="Type email draft..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-violet-500 resize-none"
                      />
                    </div>
                  </>
                )}

                {/* 3. GOOGLE CALENDAR */}
                {connectorType === 'google_calendar' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">Event Title</label>
                      <input
                        type="text"
                        value={calendarTitle}
                        onChange={(e) => setCalendarTitle(e.target.value)}
                        placeholder="e.g., Client Architecture Sync"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">Date</label>
                        <input
                          type="date"
                          value={calendarDate}
                          onChange={(e) => setCalendarDate(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">Time</label>
                        <input
                          type="time"
                          value={calendarTime}
                          onChange={(e) => setCalendarTime(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">Agenda / Notes</label>
                      <textarea
                        rows={2}
                        value={messageBody}
                        onChange={(e) => setMessageBody(e.target.value)}
                        placeholder="Meeting description..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-violet-500 resize-none"
                      />
                    </div>
                  </>
                )}

                {/* 4. GOOGLE MEET */}
                {connectorType === 'google_meet' && (
                  <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center gap-2.5">
                    <Video size={18} className="text-amber-600 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-900 block">1-Click Instant Room</span>
                      <span>Generates and launches a secure Google Meet conference room instantly.</span>
                    </div>
                  </div>
                )}

                {/* 5. CUSTOM LINK */}
                {connectorType === 'custom_link' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">Tool / Destination Label</label>
                      <input
                        type="text"
                        value={customLabel}
                        onChange={(e) => setCustomLabel(e.target.value)}
                        placeholder="e.g., Figma Prototype / Stripe Invoice"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">Target URL</label>
                      <input
                        type="url"
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        placeholder="https://example.com/item/123"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Privacy & Usage Clarification Note */}
              <div className="flex items-start gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-600 text-[11px] leading-relaxed">
                <ShieldCheck size={15} className="text-violet-600 shrink-0 mt-0.5" />
                <span>
                  <span className="font-bold text-slate-900">Note:</span> These connector details are currently used only for live browser preview and task execution. They are not stored by the company or used for any further delegations.
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-200 active:scale-95 transition-all"
            >
              Add Step to Flow
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
