import { Router } from 'express';
import {
  getDeliveryNotes,
  getItemList,
  getLowStockItems,
  getMaterialRequests,
  getPickLists,
  getPurchaseOrders,
  getPurchaseReceipts,
  getShipments,
  getStockBalances,
  getWarehouses,
} from '../../adapters/erpnext.js';
import { getErpNextNotConfiguredMessage, resolveErpNextCreds } from '../../lib/erpnextConnection.js';
import { authJwt } from '../../middleware/authJwt.js';

export const erpnextSupplyChainRouter = Router();

type BranchKey = 'inventory' | 'logistics' | 'shipping' | 'warehousing' | 'routing' | 'procurement_flow';

interface SupplyChainCard {
  id: string;
  title: string;
  subtitle?: string;
  value?: string;
  status?: string;
  sourceDoctype: string;
  sourceId?: string;
}

interface SupplyChainMetric {
  label: string;
  value: number | string;
  unit?: string;
}

interface SupplyChainRecommendation {
  label: string;
  reason: string;
  severity: 'info' | 'warning' | 'critical';
}

interface SupplyChainBranch {
  key: BranchKey;
  label: string;
  connected: boolean;
  sourceDoctypes: string[];
  cards: SupplyChainCard[];
  metrics: SupplyChainMetric[];
  recommendedActions: SupplyChainRecommendation[];
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.round(next)));
}

async function safeRead<T>(
  label: string,
  warnings: string[],
  read: () => Promise<T[]>,
): Promise<{ ok: true; rows: T[] } | { ok: false; rows: []; error: string }> {
  try {
    return { ok: true, rows: await read() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`${label}: ${message}`);
    return { ok: false, rows: [], error: message };
  }
}

function isOpenStatus(status: string | null | undefined): boolean {
  if (!status) return true;
  return !/closed|cancelled|completed|stopped|delivered|received|billed/i.test(status);
}

function branch(
  key: BranchKey,
  label: string,
  sourceDoctypes: string[],
  connected: boolean,
  cards: SupplyChainCard[],
  metrics: SupplyChainMetric[],
  recommendedActions: SupplyChainRecommendation[],
): SupplyChainBranch {
  return { key, label, sourceDoctypes, connected, cards, metrics, recommendedActions };
}

erpnextSupplyChainRouter.get('/summary', authJwt, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const threshold = boundedNumber(req.query.low_stock_threshold, 10, 1, 100000);
  const limit = boundedNumber(req.query.limit, 50, 1, 100);

  const creds = await resolveErpNextCreds(companyId);
  if (!creds) {
    const message = await getErpNextNotConfiguredMessage(companyId);
    return res.status(503).json({ error: 'erpnext_not_configured', message });
  }

  const warnings: string[] = [];
  const [
    items,
    stock,
    lowStock,
    warehouses,
    materialRequests,
    purchaseOrders,
    purchaseReceipts,
    deliveryNotes,
    pickLists,
    shipments,
  ] = await Promise.all([
    safeRead('Item', warnings, () => getItemList(creds, undefined)),
    safeRead('Bin', warnings, () => getStockBalances(creds, limit)),
    safeRead('Low stock Bin', warnings, () => getLowStockItems(creds, threshold)),
    safeRead('Warehouse', warnings, () => getWarehouses(creds, limit)),
    safeRead('Material Request', warnings, () => getMaterialRequests(creds, limit)),
    safeRead('Purchase Order', warnings, () => getPurchaseOrders(creds, limit)),
    safeRead('Purchase Receipt', warnings, () => getPurchaseReceipts(creds, limit)),
    safeRead('Delivery Note', warnings, () => getDeliveryNotes(creds, limit)),
    safeRead('Pick List', warnings, () => getPickLists(creds, limit)),
    safeRead('Shipment', warnings, () => getShipments(creds, limit)),
  ]);

  const stockedItemCodes = new Set(stock.rows.filter(row => Number(row.actual_qty) > 0).map(row => row.item_code));
  const warehouseNames = new Set(stock.rows.map(row => row.warehouse).filter(Boolean));
  const lowStockCards: SupplyChainCard[] = lowStock.rows.slice(0, 8).map(row => ({
    id: `low-stock:${row.item_code}:${row.warehouse}`,
    title: row.item_code,
    subtitle: row.warehouse,
    value: String(row.actual_qty),
    status: Number(row.actual_qty) <= 0 ? 'stockout' : 'low_stock',
    sourceDoctype: 'Bin',
    sourceId: `${row.item_code}:${row.warehouse}`,
  }));

  const openMaterialRequests = materialRequests.rows.filter(row => isOpenStatus(row.status));
  const openPurchaseOrders = purchaseOrders.rows.filter(row => isOpenStatus(row.status));
  const openPurchaseReceipts = purchaseReceipts.rows.filter(row => isOpenStatus(row.status));
  const openDeliveryNotes = deliveryNotes.rows.filter(row => isOpenStatus(row.status));
  const openPickLists = pickLists.rows.filter(row => isOpenStatus(row.status));
  const openShipments = shipments.rows.filter(row => isOpenStatus(row.status));

  const procurementCards: SupplyChainCard[] = [
    ...openMaterialRequests.slice(0, 4).map(row => ({
      id: `material-request:${row.name}`,
      title: row.name,
      subtitle: row.material_request_type ?? undefined,
      value: row.schedule_date ?? row.transaction_date ?? undefined,
      status: row.status ?? undefined,
      sourceDoctype: 'Material Request',
      sourceId: row.name,
    })),
    ...openPurchaseOrders.slice(0, 4).map(row => ({
      id: `purchase-order:${row.name}`,
      title: row.name,
      subtitle: row.supplier ?? undefined,
      value: row.grand_total == null ? undefined : String(row.grand_total),
      status: row.status ?? undefined,
      sourceDoctype: 'Purchase Order',
      sourceId: row.name,
    })),
    ...openPurchaseReceipts.slice(0, 4).map(row => ({
      id: `purchase-receipt:${row.name}`,
      title: row.name,
      subtitle: row.supplier ?? undefined,
      value: row.posting_date ?? undefined,
      status: row.status ?? undefined,
      sourceDoctype: 'Purchase Receipt',
      sourceId: row.name,
    })),
  ].slice(0, 10);

  const shippingCards: SupplyChainCard[] = [
    ...openDeliveryNotes.slice(0, 4).map(row => ({
      id: `delivery-note:${row.name}`,
      title: row.name,
      subtitle: row.customer ?? undefined,
      value: row.posting_date ?? undefined,
      status: row.status ?? undefined,
      sourceDoctype: 'Delivery Note',
      sourceId: row.name,
    })),
    ...openPickLists.slice(0, 4).map(row => ({
      id: `pick-list:${row.name}`,
      title: row.name,
      subtitle: row.purpose ?? undefined,
      value: row.modified ?? undefined,
      status: row.status ?? undefined,
      sourceDoctype: 'Pick List',
      sourceId: row.name,
    })),
    ...openShipments.slice(0, 4).map(row => ({
      id: `shipment:${row.name}`,
      title: row.name,
      value: row.modified ?? undefined,
      status: row.status ?? undefined,
      sourceDoctype: 'Shipment',
      sourceId: row.name,
    })),
  ].slice(0, 10);

  const branches: SupplyChainBranch[] = [
    branch(
      'inventory',
      'Inventory',
      ['Item', 'Bin'],
      items.ok && stock.ok,
      lowStockCards,
      [
        { label: 'Items', value: items.rows.length },
        { label: 'Stocked items', value: stockedItemCodes.size },
        { label: 'Stock positions', value: stock.rows.length },
        { label: 'Low-stock positions', value: lowStock.rows.length },
      ],
      lowStock.rows.length > 0
        ? [{ label: 'Review low stock', reason: `${lowStock.rows.length} stock position(s) are below ${threshold}.`, severity: 'warning' }]
        : [],
    ),
    branch(
      'logistics',
      'logistics',
      ['Delivery Note', 'Pick List', 'Shipment', 'Bin'],
      deliveryNotes.ok || pickLists.ok || shipments.ok || stock.ok,
      shippingCards,
      [
        { label: 'Open delivery notes', value: openDeliveryNotes.length },
        { label: 'Open pick lists', value: openPickLists.length },
        { label: 'Open shipments', value: openShipments.length },
      ],
      shippingCards.length > 0
        ? [{ label: 'Review outbound flow', reason: 'Open delivery/picking/shipment records are waiting in WorkOS.', severity: 'info' }]
        : [],
    ),
    branch(
      'shipping',
      'shipping',
      ['Delivery Note', 'Pick List', 'Shipment'],
      deliveryNotes.ok || pickLists.ok || shipments.ok,
      shippingCards,
      [
        { label: 'Open delivery notes', value: openDeliveryNotes.length },
        { label: 'Open pick lists', value: openPickLists.length },
        { label: 'Open shipments', value: openShipments.length },
      ],
      [],
    ),
    branch(
      'warehousing',
      'warehousing',
      ['Warehouse', 'Bin'],
      warehouses.ok && stock.ok,
      warehouses.rows.slice(0, 10).map(row => ({
        id: `warehouse:${row.name}`,
        title: row.warehouse_name || row.name,
        subtitle: row.is_group ? 'Warehouse group' : 'Warehouse',
        value: `${stock.rows.filter(bin => bin.warehouse === row.name).length} stock position(s)`,
        status: row.disabled ? 'disabled' : 'active',
        sourceDoctype: 'Warehouse',
        sourceId: row.name,
      })),
      [
        { label: 'Warehouses', value: warehouses.rows.length },
        { label: 'Warehouses with stock', value: warehouseNames.size },
        { label: 'Low-stock positions', value: lowStock.rows.length },
      ],
      warehouses.rows.length > 0 && warehouseNames.size < warehouses.rows.length
        ? [{ label: 'Review empty warehouses', reason: `${warehouses.rows.length - warehouseNames.size} warehouse(s) have no stock positions in the current WorkOS view.`, severity: 'info' }]
        : [],
    ),
    branch(
      'routing',
      'routing',
      ['Delivery Trip'],
      false,
      [],
      [],
      [{ label: 'Keep routing disconnected', reason: 'WorkOS core routing is not verified for this site in v1; no route optimization is inferred.', severity: 'info' }],
    ),
    branch(
      'procurement_flow',
      'procurement flow',
      ['Material Request', 'Purchase Order', 'Purchase Receipt'],
      materialRequests.ok || purchaseOrders.ok || purchaseReceipts.ok,
      procurementCards,
      [
        { label: 'Open material requests', value: openMaterialRequests.length },
        { label: 'Open purchase orders', value: openPurchaseOrders.length },
        { label: 'Open purchase receipts', value: openPurchaseReceipts.length },
      ],
      lowStock.rows.length > 0
        ? [{ label: 'Review before requesting', reason: 'Low-stock positions exist; verify demand before creating material requests in WorkOS.', severity: 'warning' }]
        : [],
    ),
  ];

  return res.json({
    status: 'ready',
    generatedAt: new Date().toISOString(),
    siteName: creds.siteName,
    warnings,
    branches,
  });
});
