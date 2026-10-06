import { api } from '../api';

// Context for the Object Space create-task form: the company's real departments plus the caller's own
// job title and department, all read from the DB. Fetched lazily (when the form first opens) and cached.

export interface ObjectSpaceContext {
  departments: Array<{ id: string; label: string; domain: string }>;
  me: { jobTitle: string | null; departmentId: string | null };
}

export const objectSpaceContextApi = {
  get: () => api.get<ObjectSpaceContext>('/api/pms/object-space/context'),
};
