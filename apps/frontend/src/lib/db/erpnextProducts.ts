import { api } from '../api';

export type ErpNextPortfolioStatus = 'ready' | 'partial' | 'empty' | 'not_configured';
export type ErpNextCatalogProduct = { entity: 'product'; identity: string; stableKey: string; label: string; subtitle: string; itemGroup: string; disabled: boolean; priced: boolean; modified?: string };
export type ErpNextCatalogLine = { entity: 'line'; identity: string; stableKey: string; label: string; unclassified?: boolean; products: ErpNextCatalogProduct[] };
export type ErpNextCatalogPortfolio = { status: ErpNextPortfolioStatus; generatedAt: string; siteName?: string; lines: ErpNextCatalogLine[]; warnings: string[]; message?: string };
export type ErpNextCatalogReadiness = { status: ErpNextPortfolioStatus | 'inactive' | 'attention'; entity: 'line' | 'product'; identity: string; label: string; generatedAt: string; metrics: Array<{ label: string; value: number }>; signals: Array<{ severity: 'info' | 'warning'; label: string; detail: string }> };

export function fetchErpNextProductPortfolio() { return api.get<ErpNextCatalogPortfolio>('/api/erpnext/products/portfolio'); }
export function fetchErpNextCatalogReadiness(entity: 'line' | 'product', identity: string) {
  return api.get<ErpNextCatalogReadiness>(`/api/erpnext/products/readiness?${new URLSearchParams({ entity, identity })}`);
}
