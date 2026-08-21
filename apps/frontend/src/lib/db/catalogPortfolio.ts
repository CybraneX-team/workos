import { nativeBusiness, type CatalogPortfolio as NativePortfolio } from './nativeBusiness';

export type CatalogProductNode={entity:'product';identity:string;stableKey:string;label:string;subtitle:string;groupId:string|null;disabled:boolean;priced:boolean;modified?:string};
export type CatalogLineNode={entity:'line';identity:string;stableKey:string;label:string;unclassified?:boolean;products:CatalogProductNode[]};
export type CatalogPortfolio={status:'ready'|'empty';generatedAt:string;lines:CatalogLineNode[];warnings:string[]};

export async function fetchCatalogPortfolio():Promise<CatalogPortfolio>{
  const source:NativePortfolio=await nativeBusiness.portfolio();
  const lines:CatalogLineNode[]=source.groups.map(group=>({entity:'line',identity:group.id,stableKey:`catalog:group:${group.id}`,label:group.name,products:source.products.filter(product=>product.group_id===group.id).map(product=>({entity:'product',identity:product.id,stableKey:`catalog:product:${product.id}`,label:product.name,subtitle:product.code,groupId:product.group_id,disabled:!product.active,priced:product.price_amount!==null}))}));
  const ungrouped=source.products.filter(product=>!product.group_id);if(ungrouped.length)lines.push({entity:'line',identity:'ungrouped',stableKey:'catalog:group:ungrouped',label:'Ungrouped',unclassified:true,products:ungrouped.map(product=>({entity:'product',identity:product.id,stableKey:`catalog:product:${product.id}`,label:product.name,subtitle:product.code,groupId:null,disabled:!product.active,priced:product.price_amount!==null}))});
  return{status:source.status,generatedAt:source.generatedAt,lines,warnings:[]};
}
