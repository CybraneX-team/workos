import React, { useState, useEffect } from 'react';
import {
  ExternalLink,
  Mail,
  Phone,
  Calendar,
  GitPullRequest,
  Figma,
  Target,
  FileText,
  Shield,
  PhoneCall,
  PhoneOff,
  Sparkles,
  Check,
  MessageSquare,
  Video,
  Globe,
  Send,
  ShieldCheck,
} from 'lucide-react';
import type { ConnectorConfig, ConnectorType } from '../types';
import { buildConnectorUrl } from '../utils/connectorUtils';

interface ConnectorActionWidgetProps {
  connector?: ConnectorConfig;
  instructions?: string;
  onActionCompleted?: () => void;
}

export const ConnectorActionWidget: React.FC<ConnectorActionWidgetProps> = ({
  connector,
  onActionCompleted,
}) => {
  const [dialerState, setDialerState] = useState<'idle' | 'calling' | 'connected' | 'ended'>('idle');
  const [launched, setLaunched] = useState(false);

  // Live editable fields initialized from connector payload
  const [phone, setPhone] = useState(connector?.payload?.phoneNumber || '+1 (415) 882-9012');
  const [recipient, setRecipient] = useState(connector?.payload?.recipient || 'client@example.com');
  const [subject, setSubject] = useState(connector?.payload?.subject || 'WorkOS Implementation Follow-Up');
  const [body, setBody] = useState(connector?.payload?.body || 'Hi, following up on our project milestones.');
  const [eventTitle, setEventTitle] = useState(connector?.payload?.eventTitle || 'Implementation Review & Sync');
  const [eventDate, setEventDate] = useState(connector?.payload?.eventDate || new Date().toISOString().slice(0, 10));
  const [eventTime, setEventTime] = useState(connector?.payload?.eventTime || '14:00');
  const [customUrl, setCustomUrl] = useState(connector?.payload?.customUrl || connector?.actionUrl || 'https://');

  useEffect(() => {
    if (connector?.payload) {
      if (connector.payload.phoneNumber) setPhone(connector.payload.phoneNumber);
      if (connector.payload.recipient) setRecipient(connector.payload.recipient);
      if (connector.payload.subject) setSubject(connector.payload.subject);
      if (connector.payload.body) setBody(connector.payload.body);
      if (connector.payload.eventTitle) setEventTitle(connector.payload.eventTitle);
      if (connector.payload.eventDate) setEventDate(connector.payload.eventDate);
      if (connector.payload.eventTime) setEventTime(connector.payload.eventTime);
      if (connector.payload.customUrl) setCustomUrl(connector.payload.customUrl);
    }
  }, [connector]);

  if (!connector) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 text-center text-xs text-slate-400">
        No external connector attached to this step.
      </div>
    );
  }

  const getConnectorIcon = (type: ConnectorType) => {
    switch (type) {
      case 'whatsapp_chat':
        return <MessageSquare size={18} className="text-emerald-600" />;
      case 'gmail_sender':
        return <Mail size={18} className="text-rose-600" />;
      case 'google_calendar':
        return <Calendar size={18} className="text-blue-600" />;
      case 'google_meet':
        return <Video size={18} className="text-amber-600" />;
      case 'custom_link':
        return <Globe size={18} className="text-violet-600" />;
      case 'crm_dialer':
        return <Phone size={18} className="text-emerald-600" />;
      case 'github_pr':
        return <GitPullRequest size={18} className="text-purple-600" />;
      case 'figma':
        return <Figma size={18} className="text-pink-600" />;
      case 'meta_ads':
        return <Target size={18} className="text-sky-600" />;
      case 'native_sales':
        return <FileText size={18} className="text-amber-600" />;
      case 'docusign':
        return <Shield size={18} className="text-indigo-600" />;
      default:
        return <Sparkles size={18} className="text-violet-600" />;
    }
  };

  const handleLaunchWithCurrentInputs = () => {
    const currentPayload = {
      phoneNumber: phone,
      recipient,
      subject,
      body,
      eventTitle,
      eventDate,
      eventTime,
      customUrl,
    };

    const targetUrl = buildConnectorUrl(connector.type, currentPayload, connector.actionUrl);
    if (targetUrl) {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      setLaunched(true);
      if (onActionCompleted) onActionCompleted();
      setTimeout(() => setLaunched(false), 4000);
    }
  };

  const handleStartCall = () => {
    setDialerState('calling');
    setTimeout(() => {
      setDialerState('connected');
    }, 1500);
  };

  const handleEndCall = () => {
    setDialerState('ended');
    setTimeout(() => setDialerState('idle'), 3000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 font-sans">
      {/* Connector Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <span className="p-2 rounded-xl bg-slate-100 border border-slate-200">
            {getConnectorIcon(connector.type)}
          </span>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">{connector.label}</h4>
            <p className="text-xs text-slate-500">Live Browser Deep-Link Connector</p>
          </div>
        </div>
        
        <button
          type="button"
          onClick={handleLaunchWithCurrentInputs}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-sm active:scale-95 transition-all"
        >
          {launched ? (
            <>
              <Check size={13} />
              <span>Redirected!</span>
            </>
          ) : (
            <>
              <span>Connect & Launch</span>
              <ExternalLink size={13} />
            </>
          )}
        </button>
      </div>

      {connector.description && (
        <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
          {connector.description}
        </p>
      )}

      {/* 1. WHATSAPP CONNECTOR */}
      {connector.type === 'whatsapp_chat' && (
        <div className="p-4 rounded-2xl bg-emerald-50/40 border border-emerald-200 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-950">
            <div className="flex items-center gap-1.5">
              <MessageSquare size={14} className="text-emerald-600" />
              <span>WhatsApp Direct Message Parameters</span>
            </div>
            <span className="text-[10px] text-emerald-700 font-mono">wa.me Protocol</span>
          </div>

          <div className="space-y-2.5 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs text-xs">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Recipient Phone Number (with Country Code)
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 415 882 9012"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono font-medium focus:bg-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Prefilled Message Query Text
              </label>
              <textarea
                rows={2}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Message text to encode in URL..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleLaunchWithCurrentInputs}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs active:scale-95 transition-all"
            >
              <Send size={13} />
              <span>Open in WhatsApp</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. GMAIL CONNECTOR */}
      {connector.type === 'gmail_sender' && (
        <div className="p-4 rounded-2xl bg-rose-50/40 border border-rose-200 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-rose-950">
            <div className="flex items-center gap-1.5">
              <Mail size={14} className="text-rose-600" />
              <span>Gmail Web Composer Parameters</span>
            </div>
            <span className="text-[10px] text-rose-700 font-mono">mail.google.com/cm</span>
          </div>

          <div className="space-y-2.5 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Recipient Email</label>
                <input
                  type="email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Body Text</label>
              <textarea
                rows={2}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none focus:border-rose-500 resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleLaunchWithCurrentInputs}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs active:scale-95 transition-all"
            >
              <Mail size={13} />
              <span>Open in Gmail Composer</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. GOOGLE CALENDAR CONNECTOR */}
      {connector.type === 'google_calendar' && (
        <div className="p-4 rounded-2xl bg-blue-50/40 border border-blue-200 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-blue-950">
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className="text-blue-600" />
              <span>Google Calendar Event Parameters</span>
            </div>
            <span className="text-[10px] text-blue-700 font-mono">calendar.google.com</span>
          </div>

          <div className="space-y-2.5 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs text-xs">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Event Title</label>
              <input
                type="text"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Date</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Time</label>
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Description / Notes</label>
              <textarea
                rows={2}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleLaunchWithCurrentInputs}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs active:scale-95 transition-all"
            >
              <Calendar size={13} />
              <span>Schedule in Google Calendar</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. GOOGLE MEET */}
      {connector.type === 'google_meet' && (
        <div className="p-4 rounded-2xl bg-amber-50/40 border border-amber-200 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-950">
            <div className="flex items-center gap-1.5">
              <Video size={14} className="text-amber-600" />
              <span>Google Meet Instant Conference Room</span>
            </div>
            <span className="text-[10px] text-amber-700 font-mono">meet.google.com/new</span>
          </div>

          <p className="text-xs text-slate-600">
            Launches an encrypted meeting room directly on Google Meet with ready-to-share audio/video capabilities.
          </p>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleLaunchWithCurrentInputs}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs active:scale-95 transition-all"
            >
              <Video size={13} />
              <span>Start Instant Meeting</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. CUSTOM LINK / WEB BRIDGE */}
      {connector.type === 'custom_link' && (
        <div className="p-4 rounded-2xl bg-violet-50/40 border border-violet-200 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-violet-950">
            <div className="flex items-center gap-1.5">
              <Globe size={14} className="text-violet-600" />
              <span>Custom Tool Destination Bridge</span>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2 text-xs">
            <label className="text-[11px] font-bold text-slate-700 block">Target URL</label>
            <input
              type="url"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none focus:border-violet-500 font-mono"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleLaunchWithCurrentInputs}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-xs active:scale-95 transition-all"
            >
              <ExternalLink size={13} />
              <span>Open External Tool</span>
            </button>
          </div>
        </div>
      )}

      {/* Legacy Fallback: VoIP Dialer */}
      {connector.type === 'crm_dialer' && (
        <div className="p-4 rounded-xl bg-emerald-50/40 border border-emerald-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-slate-900">WorkOS Integrated VoIP Dialer</span>
            </div>
            <span className="text-[11px] font-mono text-slate-600 font-semibold">Status: {dialerState.toUpperCase()}</span>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm">
            <div>
              <div className="text-xs text-slate-500">Target Lead</div>
              <div className="text-sm font-semibold text-slate-900">David Chen (CTO, Lumina Cloud)</div>
              <div className="text-xs font-mono text-emerald-700 font-semibold mt-0.5">{phone}</div>
            </div>

            {dialerState === 'idle' && (
              <button
                type="button"
                onClick={handleStartCall}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm active:scale-95 transition-all"
              >
                <PhoneCall size={14} />
                <span>Dial Lead</span>
              </button>
            )}

            {dialerState === 'calling' && (
              <div className="flex items-center gap-2 text-xs text-amber-700 font-mono font-semibold animate-pulse">
                <PhoneCall size={14} />
                <span>Connecting audio...</span>
              </div>
            )}

            {dialerState === 'connected' && (
              <button
                type="button"
                onClick={handleEndCall}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm active:scale-95 transition-all"
              >
                <PhoneOff size={14} />
                <span>Hang Up</span>
              </button>
            )}

            {dialerState === 'ended' && (
              <div className="text-xs text-slate-600 font-mono">
                Call finished · Logged to CRM
              </div>
            )}
          </div>
        </div>
      )}

      {/* Privacy & Usage Clarification Note */}
      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-[11px] leading-relaxed">
        <ShieldCheck size={14} className="text-violet-600 shrink-0 mt-0.5" />
        <span>
          <span className="font-bold text-slate-900">Note:</span> These connector details are currently used only for live preview and task execution. They are not stored by the company or used for any further delegations.
        </span>
      </div>
    </div>
  );
};
