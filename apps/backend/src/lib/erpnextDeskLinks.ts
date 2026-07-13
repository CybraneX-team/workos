export interface ErpNextDeskCreds {
  siteUrl: string;
  siteName: string;
  deskUrl?: string;
}

export type ErpNextDeskActionKind = 'list' | 'new' | 'record';

export interface ErpNextDeskAction {
  id: string;
  label: string;
  kind: ErpNextDeskActionKind;
  doctype: string;
  href: string;
}

export function erpnextDeskDoctypeSlug(doctype: string): string {
  return doctype.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function erpnextDeskBaseUrl(creds: ErpNextDeskCreds): string {
  if (creds.deskUrl?.trim()) return creds.deskUrl.trim().replace(/\/+$/, '');

  const fallback = creds.siteUrl.trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(fallback);
    const isLocalSharedHost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname);
    if (isLocalSharedHost && creds.siteName.endsWith('.localhost')) {
      parsed.hostname = creds.siteName;
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch {
    // Keep the original site URL below if it is not parseable.
  }

  return fallback;
}

export function erpnextDeskListUrl(creds: ErpNextDeskCreds, doctype: string): string {
  return `${erpnextDeskBaseUrl(creds)}/app/${erpnextDeskDoctypeSlug(doctype)}`;
}

export function erpnextDeskNewUrl(creds: ErpNextDeskCreds, doctype: string): string {
  const slug = erpnextDeskDoctypeSlug(doctype);
  return `${erpnextDeskBaseUrl(creds)}/app/${slug}/new-${slug}`;
}

export function erpnextDeskRecordUrl(creds: ErpNextDeskCreds, doctype: string, recordName: string): string {
  return `${erpnextDeskListUrl(creds, doctype)}/${encodeURIComponent(recordName)}`;
}
