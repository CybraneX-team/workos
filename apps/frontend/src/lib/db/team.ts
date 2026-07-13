import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import type { RoleId } from '../supabase';
import { api } from '../api';

/* ──────────────────────────────────────────────────
   Types
────────────────────────────────────────────────── */

export type MemberStatus = 'pending' | 'active' | 'rejected' | 'removed';

export interface TeamMember {
  id: string;              // company_members.id
  user_id: string;
  company_id: string;
  role: RoleId;
  department_id: string | null;
  role_name: string;
  is_system_role: boolean;
  is_protected_role: boolean;
  status: MemberStatus;
  invited_by: string | null;
  approved_at: string | null;
  joined_at: string;
  // joined from user_profiles
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  avatar_url: string | null;
  email: string | null;
}

export interface JoinRequest {
  id: string;
  company_id: string;
  user_id: string;
  requested_role: RoleId;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  assigned_role: RoleId | null;
  created_at: string;
  // joined from user_profiles
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  title: string | null;
}

export interface WorkspaceInvite {
  id: string;
  company_id: string;
  token: string;
  role: RoleId;
  email: string | null;
  expires_at: string;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  created_at: string;
}

export interface JoinableCompany {
  id: string;
  name: string;
  slug: string;
  stage: string | null;
  industry_id: string | null;
  country: string | null;
  employees: number | null;
  description: string | null;
  created_at: string;
  founderEmailMasked?: string | null;
}

/* ──────────────────────────────────────────────────
   useTeamMembers — live subscription to company members
────────────────────────────────────────────────── */

export function useTeamMembers(companyId: string | null | undefined) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchMembers() {
    if (!companyId) { setLoading(false); return; }

    try {
      const { members: rows } = await api.get<{ members: TeamMember[] }>('/api/team/members');
      setMembers(rows ?? []);
    } catch (error) {
      console.error('[team] fetchMembers', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchMembers();
    if (!companyId) return;
    const timer = window.setInterval(() => void fetchMembers(), 30000);
    return () => window.clearInterval(timer);
  }, [companyId]);

  return { members, loading, refetch: fetchMembers };
}

/* ──────────────────────────────────────────────────
   useJoinRequests — pending requests for this company
────────────────────────────────────────────────── */

export function useJoinRequests(companyId: string | null | undefined, enabled = true) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchRequests() {
    if (!companyId || !enabled) {
      setRequests([]);
      setLoading(false);
      return;
    }
    try {
      const { requests: rows } = await api.get<{ requests: any[] }>('/api/join-requests');
      const shaped: JoinRequest[] = (rows ?? []).map((row: any) => ({
        id:             row.id,
        company_id:     row.company_id,
        user_id:        row.user_id,
        requested_role: row.requested_role,
        message:        row.message,
        status:         row.status,
        reviewed_by:    row.reviewed_by,
        reviewed_at:    row.reviewed_at,
        assigned_role:  row.assigned_role,
        created_at:     row.created_at,
        first_name:     row.first_name ?? null,
        last_name:      row.last_name  ?? null,
        email:          null,
        title:          row.title      ?? null,
      }));
      setRequests(shaped);
    } catch (err) {
      console.error('[team] fetchRequests', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchRequests();
    if (!companyId || !enabled) return;
    const timer = window.setInterval(() => void fetchRequests(), 30000);
    return () => window.clearInterval(timer);
  }, [companyId, enabled]);

  return { requests, loading, refetch: fetchRequests };
}

/* ──────────────────────────────────────────────────
   useWorkspaceInvites — active invite links
────────────────────────────────────────────────── */

export function useWorkspaceInvites(companyId: string | null | undefined) {
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchInvites() {
    if (!companyId) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('workspace_invites')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) { console.error('[team] fetchInvites', error); setLoading(false); return; }
    setInvites(data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchInvites(); }, [companyId]);

  return { invites, loading, refetch: fetchInvites };
}

/* ──────────────────────────────────────────────────
   generateInviteLink — create a shareable invite
────────────────────────────────────────────────── */

export async function generateInviteLink(
  companyId: string,
  createdBy: string,
  role: RoleId = 'viewer',
  options?: { email?: string; maxUses?: number; expiresInDays?: number },
): Promise<{ token: string; url: string } | { error: string }> {
  void companyId;
  void createdBy;
  void role;
  void options;
  return { error: 'Shareable invite links are no longer supported. Invite by email instead.' };
}

/* ──────────────────────────────────────────────────
   deactivateInvite — revoke a link
────────────────────────────────────────────────── */

export async function deactivateInvite(inviteId: string): Promise<boolean> {
  void inviteId;
  return false;
}

/* ──────────────────────────────────────────────────
   approveJoinRequest — via DB function
────────────────────────────────────────────────── */

export async function approveJoinRequest(
  requestId: string,
  assignedRole: RoleId = 'viewer',
): Promise<{ success: boolean; error?: string }> {
  try {
    return await api.post<{ success: boolean; error?: string }>(`/api/join-requests/${requestId}/approve`, {
      assignedRole,
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to approve request' };
  }
}

/* ──────────────────────────────────────────────────
   rejectJoinRequest
────────────────────────────────────────────────── */

export async function rejectJoinRequest(
  requestId: string,
): Promise<boolean> {
  try {
    await api.post(`/api/join-requests/${requestId}/reject`, {});
    return true;
  } catch (error) {
    console.error('[team] rejectJoinRequest', error);
    return false;
  }
}

/* ──────────────────────────────────────────────────
   changeMemberRole
────────────────────────────────────────────────── */

export async function changeMemberRole(
  memberId: string,
  newRole: RoleId,
): Promise<boolean> {
  try {
    await api.patch(`/api/team/members/${memberId}/role`, { role: newRole });
    return true;
  } catch (error) {
    console.error('[team] changeMemberRole', error);
    return false;
  }
}

export async function changeMemberDepartment(
  memberId: string,
  departmentId: string | null,
): Promise<boolean> {
  try {
    await api.patch(`/api/team/members/${memberId}/department`, { departmentId });
    return true;
  } catch (error) {
    console.error('[team] changeMemberDepartment', error);
    return false;
  }
}

/* ──────────────────────────────────────────────────
   removeMember
────────────────────────────────────────────────── */

export async function removeMember(memberId: string): Promise<boolean> {
  try {
    await api.delete(`/api/team/members/${memberId}`);
    return true;
  } catch (error) {
    console.error('[team] removeMember', error);
    return false;
  }
}

/* ──────────────────────────────────────────────────
   lookupInviteToken — fetch invite info without auth
   (shown on /join page before user decides to accept)
────────────────────────────────────────────────── */

export async function lookupInviteToken(token: string): Promise<{
  companyName: string;
  role: RoleId;
  expiresAt: string;
  valid: boolean;
} | null> {
  void token;
  return null;
}

/* ──────────────────────────────────────────────────
   acceptInviteToken — call the DB function
────────────────────────────────────────────────── */

export async function acceptInviteToken(
  token: string,
  userId: string,
): Promise<{ success: boolean; companyId?: string; role?: string; error?: string }> {
  void token;
  void userId;
  return { success: false, error: 'Invite links are no longer supported. Ask an admin for an email invite.' };
}

/* ──────────────────────────────────────────────────
   submitJoinRequest — user requests to join a company by slug
────────────────────────────────────────────────── */

export async function submitJoinRequest(
  companyId: string,
  userId: string,
  message?: string,
): Promise<{ success: boolean; requestId?: string; error?: string }> {
  void userId;
  try {
    const result = await api.post<{ success: boolean; requestId?: string }>('/api/join-requests', {
      companyId,
      message,
    });
    return result;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Failed to send join request';
    return {
      success: false,
      error: messageText.includes('409')
        ? 'You already have a pending request for this workspace'
        : messageText,
    };
  }
}

/* ──────────────────────────────────────────────────
   joinCompanyAsViewer — immediate read-only workspace access
────────────────────────────────────────────────── */

export async function joinCompanyAsViewer(
  companyId: string,
  userId: string,
): Promise<{ success: boolean; companyId?: string; role?: RoleId; error?: string }> {
  void companyId;
  void userId;
  return { success: false, error: 'Self-joining is no longer supported. Request access for admin approval.' };
}

/* ──────────────────────────────────────────────────
   listJoinableCompanies — all active companies for onboarding join flow
────────────────────────────────────────────────── */

export async function listJoinableCompanies(options?: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ companies: JoinableCompany[]; total: number }> {
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.max(1, options?.pageSize ?? 4);
  const search = options?.search?.trim() ?? '';

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) params.set('search', search);

  try {
    return await api.get<{ companies: JoinableCompany[]; total: number }>(`/api/companies/joinable?${params}`);
  } catch (err) {
    console.error('[team] listJoinableCompanies', err);
    return { companies: [], total: 0 };
  }
}

/* ──────────────────────────────────────────────────
   searchCompanyBySlug — for join-by-name flow
────────────────────────────────────────────────── */

export async function searchCompanyBySlug(query: string) {
  // Search by name OR slug so users can type the company name naturally
  const { data } = await supabase
    .from('companies')
    .select('id, name, slug, stage, industry_id, status')
    .eq('status', 'active')
    .or(`name.ilike.%${query}%,slug.ilike.%${query}%`)
    .limit(5);
  return data ?? [];
}
