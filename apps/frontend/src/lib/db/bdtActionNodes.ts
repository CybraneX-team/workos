import { api } from '../api';

export type BdtActionNode={id:string;departmentId:string;parentNodeId:string;name:string;purpose:string|null;parentLabel?:string};
export type BdtActionResource={id:string;kind:'file'|'link';label:string;original_name?:string|null;mime_type?:string|null;byte_size?:number|null;external_url?:string|null;created_at:string};
export const bdtActionNodes={
  create:(body:{parentNodeId:string;name:string;purpose?:string|null})=>api.post<BdtActionNode>('/api/bdt/action-nodes',body),
  update:(id:string,body:{name?:string;purpose?:string|null;parentNodeId?:string})=>api.patch<BdtActionNode>(`/api/bdt/action-nodes/${id}`,body),
  remove:(id:string)=>api.delete<void>(`/api/bdt/action-nodes/${id}`),
  resources:(nodeId:string)=>api.get<{items:BdtActionResource[]}>(`/api/bdt/action-nodes/${nodeId}/resources`),
  addLink:(nodeId:string,body:{label:string;url:string})=>api.post<BdtActionResource>(`/api/bdt/action-nodes/${nodeId}/resources/links`,body),
  upload:(nodeId:string,file:File)=>{const form=new FormData();form.append('file',file);return api.post<BdtActionResource>(`/api/bdt/action-nodes/${nodeId}/resources/files`,form)},
  download:(nodeId:string,id:string)=>api.getBlob(`/api/bdt/action-nodes/${nodeId}/resources/${id}/download`),
  removeResource:(nodeId:string,id:string)=>api.delete<void>(`/api/bdt/action-nodes/${nodeId}/resources/${id}`),
};
