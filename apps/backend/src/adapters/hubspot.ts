import type { HubSpotMetrics } from '@cybranex/shared-types';
export type { HubSpotMetrics };

const HS_BASE = 'https://api.hubapi.com';

interface HsPage<T> {
  total: number;
  results: T[];
}

interface HsDeal {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    dealstage?: string;
    closedate?: string;
    createdate?: string;
  };
}

interface HsContact {
  id: string;
  properties: { createdate?: string };
}

async function hsFetch<T>(token: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${HS_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HubSpot ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function hsPost<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${HS_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HubSpot ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}


export async function validateHubSpotToken(token: string): Promise<string> {
  await hsFetch<HsPage<HsContact>>(token, '/crm/v3/objects/contacts', { limit: '1' });
  return 'HubSpot';
}

export async function fetchHubSpotMetrics(token: string): Promise<HubSpotMetrics> {
  const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const [contactsRes, dealsRes, closedWon30d] = await Promise.all([
    hsFetch<HsPage<HsContact>>(token, '/crm/v3/objects/contacts', { limit: '1' }),
    hsFetch<HsPage<HsDeal>>(token, '/crm/v3/objects/deals', {
      limit: '100',
      properties: 'dealname,amount,dealstage,closedate,createdate',
    }),
    hsPost<HsPage<HsDeal>>(token, '/crm/v3/objects/deals/search', {
      filterGroups: [{ filters: [
        { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
        { propertyName: 'closedate', operator: 'GTE', value: String(thirtyDaysAgoMs) },
      ] }],
      limit: 100,
      properties: ['dealname', 'amount', 'dealstage', 'closedate'],
    }),
  ]);

  let newContacts30d = 0;
  try {
    const newRes = await hsPost<HsPage<HsContact>>(token, '/crm/v3/objects/contacts/search', {
      filterGroups: [{ filters: [{ propertyName: 'createdate', operator: 'GTE', value: String(thirtyDaysAgoMs) }] }],
      limit: 1,
      properties: ['createdate'],
    });
    newContacts30d = newRes.total;
  } catch { /* non-fatal */ }

  const deals = dealsRes.results;
  const openDeals = deals.filter(
    (d) => d.properties.dealstage !== 'closedwon' && d.properties.dealstage !== 'closedlost',
  );
  const pipelineValue = openDeals.reduce((s, d) => s + parseFloat(d.properties.amount ?? '0'), 0);
  const closedWonValue30d = closedWon30d.results.reduce((s, d) => s + parseFloat(d.properties.amount ?? '0'), 0);
  const avgDealValue = openDeals.length > 0 ? pipelineValue / openDeals.length : 0;

  const recentDeals = [...deals]
    .sort((a, b) => (b.properties.closedate ?? b.properties.createdate ?? '').localeCompare(
      a.properties.closedate ?? a.properties.createdate ?? '',
    ))
    .slice(0, 5)
    .map((d) => {
      const stage = d.properties.dealstage ?? '';
      const status: 'open' | 'won' | 'lost' =
        stage === 'closedwon' ? 'won' : stage === 'closedlost' ? 'lost' : 'open';
      return {
        id: d.id,
        name: d.properties.dealname ?? d.id,
        amount: parseFloat(d.properties.amount ?? '0'),
        stage,
        closeDate: d.properties.closedate?.split('T')[0] ?? '',
        status,
      };
    });

  const stageMap = new Map<string, { count: number; value: number }>();
  for (const deal of deals) {
    const stage = deal.properties.dealstage ?? 'unknown';
    const amt = parseFloat(deal.properties.amount ?? '0');
    const cur = stageMap.get(stage) ?? { count: 0, value: 0 };
    stageMap.set(stage, { count: cur.count + 1, value: cur.value + amt });
  }

  return {
    totalContacts: contactsRes.total,
    newContacts30d,
    openDealsCount: openDeals.length,
    pipelineValue: Math.round(pipelineValue),
    closedWonCount30d: closedWon30d.total,
    closedWonValue30d: Math.round(closedWonValue30d),
    avgDealValue: Math.round(avgDealValue),
    recentDeals,
    dealsByStage: Array.from(stageMap.entries()).map(([stage, v]) => ({ stage, ...v })),
  };
}
