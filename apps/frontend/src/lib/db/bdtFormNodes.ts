import { api } from '../api';
export type BdtFormFieldType='short_text'|'long_text'|'number'|'date'|'checkbox'|'single_select'|'url'|'email';
export type BdtFormField={id:string;label:string;fieldType:BdtFormFieldType;required:boolean;position:number;options?:string[]};
export type BdtFormNode={id:string;departmentId:string;parentNodeId:string;name:string;purpose:string|null;parentLabel:string;schemaLockedAt:string|null;recordCount:number;fields:BdtFormField[];canManageSchema:boolean;canDeleteRecords:boolean};
export type BdtFormRecord={id:string;recordNumber:number;values:Record<string,unknown>;createdAt:string;updatedAt:string};
export const bdtFormNodes={
 list:(departmentId?:string)=>api.get<{items:BdtFormNode[]}>(`/api/bdt/form-nodes${departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : ''}`),
 create:(body:{parentNodeId:string;name:string;purpose?:string|null;fields:Omit<BdtFormField,'id'|'position'>[]})=>api.post<BdtFormNode>('/api/bdt/form-nodes',body),
 get:(id:string)=>api.get<BdtFormNode>(`/api/bdt/form-nodes/${id}`),
 update:(id:string,body:{name?:string;purpose?:string|null;parentNodeId?:string})=>api.patch<BdtFormNode>(`/api/bdt/form-nodes/${id}`,body),
 replaceSchema:(id:string,fields:Omit<BdtFormField,'id'|'position'>[])=>api.put<BdtFormNode>(`/api/bdt/form-nodes/${id}/schema`,{fields}),
 remove:(id:string)=>api.delete<void>(`/api/bdt/form-nodes/${id}`),
 records:(id:string,limit=25,offset=0)=>api.get<{items:BdtFormRecord[];total:number}>(`/api/bdt/form-nodes/${id}/records?limit=${limit}&offset=${offset}`),
 createRecord:(id:string,values:Record<string,unknown>)=>api.post<BdtFormRecord>(`/api/bdt/form-nodes/${id}/records`,{values}),
 updateRecord:(id:string,recordId:string,values:Record<string,unknown>)=>api.patch<BdtFormRecord>(`/api/bdt/form-nodes/${id}/records/${recordId}`,{values}),
 removeRecord:(id:string,recordId:string)=>api.delete<void>(`/api/bdt/form-nodes/${id}/records/${recordId}`),
};
