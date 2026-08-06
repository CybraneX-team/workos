import { Router } from 'express';
import { getErpNextRecords, type ErpNextCreds, type ErpNextGenericRecord } from '../../adapters/erpnext.js';
import { getErpNextNotConfiguredMessage, resolveErpNextCreds } from '../../lib/erpnextConnection.js';
import { authJwt } from '../../middleware/authJwt.js';

/** Live ERPNext catalog projection for the V3 Product Lines BDT branch. */
export const erpnextProductsRouter = Router();

export type PortfolioStatus = 'ready' | 'partial' | 'empty' | 'not_configured';
export type PortfolioEntity = 'line' | 'product';

export type CatalogProduct = {
  entity: 'product'; identity: string; stableKey: string; label: string; subtitle: string;
  itemGroup: string; disabled: boolean; priced: boolean; modified?: string;
};
export type CatalogLine = {
  entity: 'line'; identity: string; stableKey: string; label: string; unclassified?: boolean;
  products: CatalogProduct[];
};
export type CatalogPortfolio = {
  status: PortfolioStatus; generatedAt: string; siteName?: string; lines: CatalogLine[];
  warnings: string[]; message?: string;
};

type ItemGroupRow = ErpNextGenericRecord & { item_group_name?: string; parent_item_group?: string };
type ItemRow = ErpNextGenericRecord & { item_code?: string; item_name?: string; item_group?: string; disabled?: string | number | null };
type ItemPriceRow = ErpNextGenericRecord & { item_code?: string; price_list_rate?: string | number | null };

const ROOT_GROUP = 'All Item Groups';
const UNCLASSIFIED = '__unclassified__';
const key = (kind: PortfolioEntity, identity: string) => `erpnext:${kind}:${identity}`;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
const disabled = (value: unknown) => value === 1 || value === '1' || value === true;

function topLevelGroup(identity: string, parents: Map<string, string>): string | null {
  let current = identity;
  const seen = new Set<string>();
  while (current && current !== ROOT_GROUP && !seen.has(current)) {
    seen.add(current);
    const parent = parents.get(current);
    if (parent === ROOT_GROUP) return current;
    if (!parent) return null;
    current = parent;
  }
  return null;
}

/** Pure mapper: Item Groups directly below the ERPNext root are lines; nested Items flatten into them. */
export function buildCatalogPortfolio(groups: ItemGroupRow[], items: ItemRow[], prices: ItemPriceRow[], partialWarnings: string[] = [], siteName?: string): CatalogPortfolio {
  const parents = new Map<string, string>(groups.map(group => [text(group.name), text(group.parent_item_group)] as const).filter(([name]) => Boolean(name)));
  const labels = new Map<string, string>(groups.map(group => [text(group.name), text(group.item_group_name) || text(group.name)] as const).filter(([name]) => Boolean(name)));
  const lineMap = new Map<string, CatalogLine>();
  for (const [identity, parent] of parents) {
    if (parent === ROOT_GROUP) lineMap.set(identity, { entity: 'line', identity, stableKey: key('line', identity), label: labels.get(identity) ?? identity, products: [] });
  }
  const pricedCodes = new Set(prices.filter(price => text(price.price_list_rate) !== '').map(price => text(price.item_code)).filter(Boolean));
  const unclassified: CatalogProduct[] = [];
  for (const item of items) {
    const itemCode = text(item.item_code) || text(item.name);
    if (!itemCode) continue;
    const group = text(item.item_group);
    const line = group === ROOT_GROUP ? null : topLevelGroup(group, parents);
    const product: CatalogProduct = {
      entity: 'product', identity: itemCode, stableKey: key('product', itemCode),
      label: text(item.item_name) || itemCode, subtitle: itemCode, itemGroup: group || ROOT_GROUP,
      disabled: disabled(item.disabled), priced: pricedCodes.has(itemCode), modified: text(item.modified) || undefined,
    };
    const destination = line ? lineMap.get(line) : undefined;
    if (destination) destination.products.push(product); else unclassified.push(product);
  }
  if (unclassified.length) lineMap.set(UNCLASSIFIED, { entity: 'line', identity: UNCLASSIFIED, stableKey: key('line', UNCLASSIFIED), label: 'Unclassified', unclassified: true, products: unclassified });
  const lines = [...lineMap.values()].filter(line => line.products.length > 0).map(line => ({ ...line, products: [...line.products].sort((a, b) => a.label.localeCompare(b.label)) })).sort((a, b) => a.label.localeCompare(b.label));
  const status: PortfolioStatus = lines.length === 0 ? 'empty' : partialWarnings.length ? 'partial' : 'ready';
  return { status, generatedAt: new Date().toISOString(), siteName, lines, warnings: partialWarnings, message: lines.length ? undefined : 'Create top-level Item Groups and Items in ERPNext to build your Product Lines portfolio.' };
}

async function portfolioFor(companyId: string): Promise<CatalogPortfolio> {
  const creds = await resolveErpNextCreds(companyId);
  if (!creds) return { status: 'not_configured', generatedAt: new Date().toISOString(), lines: [], warnings: [], message: await getErpNextNotConfiguredMessage(companyId) };
  const reads = await Promise.allSettled([
    getErpNextRecords(creds, 'Item Group', ['item_group_name', 'parent_item_group', 'modified'], 500, [], 1000),
    getErpNextRecords(creds, 'Item', ['item_code', 'item_name', 'item_group', 'disabled', 'modified'], 1000, [], 1000),
    // The control-plane contract caps an individual page at 1,000 rows. Keep
    // this at the cap: `getErpNextRecords` paginates up to the preceding limit.
    getErpNextRecords(creds, 'Item Price', ['item_code', 'price_list_rate'], 1000, [], 1000),
  ]);
  const warnings = reads.flatMap((result, index) => result.status === 'rejected' ? [`${['Item Group', 'Item', 'Item Price'][index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`] : []);
  const rows = reads.map(result => result.status === 'fulfilled' ? result.value : []) as [ErpNextGenericRecord[], ErpNextGenericRecord[], ErpNextGenericRecord[]];
  return buildCatalogPortfolio(rows[0] as ItemGroupRow[], rows[1] as ItemRow[], rows[2] as ItemPriceRow[], warnings, creds.siteName);
}

function readiness(line: CatalogLine, product?: CatalogProduct) {
  const products = product ? [product] : line.products;
  const disabledCount = products.filter(entry => entry.disabled).length;
  const pricedCount = products.filter(entry => entry.priced).length;
  const modified = products.map(entry => entry.modified).filter((value): value is string => Boolean(value)).sort()[0];
  const total = products.length;
  const status = disabledCount === total ? 'inactive' : disabledCount || pricedCount < total || line.unclassified ? 'attention' : 'ready';
  return {
    entity: product ? 'product' : 'line', identity: product?.identity ?? line.identity, label: product?.label ?? line.label,
    status, generatedAt: new Date().toISOString(),
    metrics: [
      { label: 'Products', value: total }, { label: 'Enabled', value: total - disabledCount },
      { label: 'Priced', value: pricedCount }, { label: 'Unpriced', value: total - pricedCount },
    ],
    signals: [
      ...(product?.disabled ? [{ severity: 'warning', label: 'Inactive in ERPNext', detail: 'This Item is disabled in ERPNext.' }] : []),
      ...(products.filter(entry => !entry.priced).length ? [{ severity: 'warning', label: 'Price coverage', detail: `${products.filter(entry => !entry.priced).length} item(s) have no Item Price.` }] : []),
      ...(line.unclassified ? [{ severity: 'warning', label: 'Unclassified catalog items', detail: 'These Items are not under a top-level Product Line.' }] : []),
      ...(modified ? [{ severity: 'info', label: 'Oldest catalog update', detail: modified }] : []),
    ],
  };
}

erpnextProductsRouter.get('/portfolio', authJwt, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  return res.json(await portfolioFor(companyId));
});

erpnextProductsRouter.get('/readiness', authJwt, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  const entity = req.query.entity === 'line' || req.query.entity === 'product' ? req.query.entity : null;
  const identity = typeof req.query.identity === 'string' ? req.query.identity : '';
  if (!entity || !identity) return res.status(400).json({ error: 'entity_and_identity_required' });
  const portfolio = await portfolioFor(companyId);
  if (portfolio.status === 'not_configured') return res.status(503).json({ error: 'erpnext_not_configured', message: portfolio.message });
  const line = portfolio.lines.find(entry => entity === 'line' ? entry.identity === identity : entry.products.some(product => product.identity === identity));
  if (!line) return res.status(404).json({ error: 'catalog_entity_not_found' });
  const product = entity === 'product' ? line.products.find(entry => entry.identity === identity) : undefined;
  return res.json({ siteName: portfolio.siteName, portfolioStatus: portfolio.status, ...readiness(line, product) });
});
