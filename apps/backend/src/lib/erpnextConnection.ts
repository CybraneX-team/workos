import type { ErpNextCreds } from '../adapters/erpnext.js';
import { getTenantStatus } from './erpnextControlPlane.js';

export async function resolveErpNextCreds(companyId: string): Promise<ErpNextCreds | null> {
  const status = await getTenantStatus(companyId);
  if (status.status !== 'ready' || !status.siteName) return null;
  return { companyId, siteName: status.siteName, deskUrl: status.deskUrl, siteUrl: status.deskUrl ?? '' };
}

export async function getErpNextNotConfiguredMessage(companyId: string): Promise<string> {
  const status = await getTenantStatus(companyId);
  if (status.status === 'failed') return 'Setting up this workspace\'s inventory/CRM system failed. Please contact support.';
  if (status.status === 'provisioning') return 'Your workspace\'s inventory/CRM system is still being set up — this usually takes about a minute after signup. Try again shortly.';
  return 'This workspace\'s inventory/CRM system hasn\'t been set up yet.';
}
