import type { ConnectorPayload } from '../types';

export function buildConnectorUrl(type: string, payload?: ConnectorPayload, customActionUrl?: string): string {
  if (customActionUrl && type === 'custom_link') {
    return customActionUrl.startsWith('http') ? customActionUrl : `https://${customActionUrl}`;
  }

  const p = payload || {};

  switch (type) {
    case 'whatsapp_chat': {
      const cleanPhone = (p.phoneNumber || '').replace(/[^0-9]/g, '');
      const text = encodeURIComponent(p.body || '');
      if (cleanPhone) {
        return `https://wa.me/${cleanPhone}${text ? `?text=${text}` : ''}`;
      }
      return text ? `https://wa.me/?text=${text}` : 'https://web.whatsapp.com';
    }

    case 'gmail_sender': {
      const to = encodeURIComponent(p.recipient || '');
      const su = encodeURIComponent(p.subject || '');
      const body = encodeURIComponent(p.body || '');
      return `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${su}&body=${body}`;
    }

    case 'google_calendar': {
      const title = encodeURIComponent(p.eventTitle || 'WorkOS Scheduled Session');
      const details = encodeURIComponent(p.body || '');
      let datesQuery = '';
      if (p.eventDate) {
        const d = p.eventDate.replace(/-/g, '');
        const timeStr = (p.eventTime || '10:00').replace(/:/g, '') + '00';
        datesQuery = `&dates=${d}T${timeStr}/${d}T${timeStr}`;
      }
      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}${datesQuery}`;
    }

    case 'google_meet':
      return 'https://meet.google.com/new';

    case 'custom_link': {
      const url = p.customUrl || customActionUrl || 'https://workos.com';
      return url.startsWith('http') ? url : `https://${url}`;
    }

    default:
      return customActionUrl || 'https://workos.com';
  }
}
