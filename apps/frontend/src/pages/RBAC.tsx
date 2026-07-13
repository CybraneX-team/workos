import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, Users, Crown, Briefcase, UserCircle, Plus,
  Check, X, ChevronDown, Clock, Trash2, UserCheck, AlertCircle,
  Mail, Copy, Archive, Save, Pencil,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import {
  useTeamMembers, useJoinRequests,
  approveJoinRequest, rejectJoinRequest,
  changeMemberRole, removeMember,
} from '../lib/db/team';
import type { RoleId, SystemRole } from '../lib/supabase';
import type { TeamMember, JoinRequest } from '../lib/db/team';
import {
  ACTIONS,
  DEPARTMENT_ACTIONS,
  MODULES,
  SYSTEM_ROLE_ORDER,
  archiveCustomRole,
  clonePermissions,
  createCustomRole,
  deleteDepartmentMemberGrant,
  deleteDepartmentRoleGrant,
  fetchDepartmentAccess,
  fetchRbacRoles,
  hasPermission,
  isSystemRole,
  saveDepartmentMemberGrant,
  saveDepartmentRoleGrant,
  updateCustomRole,
  type DepartmentAccess,
  type DepartmentAccessResponse,
  type ExpandedPermissions,
  type RoleDefinition,
} from '../lib/db/rbac';

const SYSTEM_ROLE_META: Record<SystemRole, { label: string; color: string; bg: string; border: string; icon: typeof Crown }> = {
  super_admin: { label: 'Super Admin', color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: ShieldCheck },
  founder:     { label: 'Founder',     color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: Crown },
  co_founder:  { label: 'Co-Founder',  color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: Crown },
  admin:       { label: 'Admin',       color: 'text-sky-400',    bg: 'bg-sky-500/10',    border: 'border-sky-500/20',    icon: Briefcase },
  analyst:     { label: 'Analyst',     color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20',   icon: UserCircle },
  engineer:    { label: 'Engineer',    color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', icon: UserCircle },
  viewer:      { label: 'Viewer',      color: 'text-gray-400',   bg: 'bg-gray-500/10',   border: 'border-gray-500/20',   icon: UserCircle },
  investor:    { label: 'Investor',    color: 'text-teal-400',   bg: 'bg-teal-500/10',   border: 'border-teal-500/20',   icon: UserCircle },
};

const CUSTOM_META = { label: 'Custom', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', icon: ShieldCheck };

function roleMeta(role?: RoleDefinition | null, roleId?: RoleId | null) {
  if (role?.isSystem && isSystemRole(role.id)) return SYSTEM_ROLE_META[role.id];
  if (roleId && isSystemRole(roleId)) return SYSTEM_ROLE_META[roleId];
  return CUSTOM_META;
}

function roleLabel(role?: RoleDefinition | null, fallback?: RoleId | null) {
  if (role) return role.name;
  if (fallback && isSystemRole(fallback)) return SYSTEM_ROLE_META[fallback].label;
  return fallback ?? 'Unknown';
}

function memberName(m: TeamMember | JoinRequest) {
  if (m.first_name || m.last_name) return [m.first_name, m.last_name].filter(Boolean).join(' ');
  return m.email ?? 'Unknown';
}

function initials(m: TeamMember | JoinRequest) {
  const n = memberName(m);
  return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

type RoleDraft = {
  sourceRoleId: RoleId;
  name: string;
  description: string;
  permissions: ExpandedPermissions;
};

export default function RBAC() {
  const { user, profile, role: myRole, roleName, can, canWrite, canDelete } = useAuth();
  const companyId = profile?.company_id ?? null;
  const canManage = canWrite('team');
  const canRemoveMembers = canDelete('team');

  const { members, loading: loadingMembers, refetch: refetchMembers } = useTeamMembers(companyId);
  const { requests, loading: loadingRequests, refetch: refetchRequests } = useJoinRequests(companyId, canManage);

  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState<RoleId>('founder');
  const [tab, setTab] = useState<'members' | 'requests' | 'invites' | 'permissions' | 'departmentAccess'>('members');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [approveRole, setApproveRole] = useState<Record<string, RoleId>>({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingEmailInvite, setSendingEmailInvite] = useState(false);
  const [inviteEmailStatus, setInviteEmailStatus] = useState<'sent' | 'exists' | 'error' | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<RoleId | 'new' | null>(null);
  const [draft, setDraft] = useState<RoleDraft | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [departmentAccess, setDepartmentAccess] = useState<DepartmentAccessResponse | null>(null);
  const [loadingDepartmentAccess, setLoadingDepartmentAccess] = useState(false);
  const [departmentAccessError, setDepartmentAccessError] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    setLoadingRoles(true);
    try {
      const rows = await fetchRbacRoles();
      setRoles(rows);
      if (!rows.some(r => r.id === selectedRoleId)) {
        setSelectedRoleId(rows.find(r => r.id === 'founder')?.id ?? rows[0]?.id ?? 'viewer');
      }
    } catch (error) {
      console.error('[rbac] fetch roles', error);
      setRoles([]);
    } finally {
      setLoadingRoles(false);
    }
  }, [selectedRoleId]);

  useEffect(() => {
    if (!companyId) return;
    void loadRoles();
  }, [companyId, loadRoles]);

  const loadDepartmentAccess = useCallback(async () => {
    if (!companyId) return;
    setLoadingDepartmentAccess(true);
    setDepartmentAccessError(null);
    try {
      setDepartmentAccess(await fetchDepartmentAccess());
    } catch (error) {
      console.error('[rbac] fetch department access', error);
      setDepartmentAccess(null);
      setDepartmentAccessError(error instanceof Error ? error.message : 'Department access load failed.');
    } finally {
      setLoadingDepartmentAccess(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (tab === 'departmentAccess') void loadDepartmentAccess();
  }, [tab, loadDepartmentAccess]);

  const roleById = useMemo(() => new Map(roles.map(r => [r.id, r])), [roles]);
  const sortedRoles = useMemo(() => {
    const order = new Map(SYSTEM_ROLE_ORDER.map((id, index) => [id, index]));
    return [...roles].sort((a, b) => {
      const aOrder = order.get(a.id as SystemRole) ?? 1000;
      const bOrder = order.get(b.id as SystemRole) ?? 1000;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    });
  }, [roles]);
  const assignableRoles = sortedRoles.filter(r => r.assignable);
  const selectedRole = roleById.get(selectedRoleId) ?? sortedRoles[0] ?? null;
  const activeMembers = members.filter(m => m.status === 'active');
  const pendingCount = requests.length;

  async function handleEmailInvite() {
    const email = inviteEmail.trim();
    if (!email) return;
    setSendingEmailInvite(true);
    setInviteEmailStatus(null);
    try {
      await api.post('/api/company-invites', { email });
      setInviteEmailStatus('sent');
      setInviteEmail('');
    } catch (err) {
      setInviteEmailStatus(err instanceof Error && err.message.startsWith('409') ? 'exists' : 'error');
    } finally {
      setSendingEmailInvite(false);
    }
  }

  async function handleApprove(req: JoinRequest) {
    const defaultRole = assignableRoles.find(r => r.id === 'viewer')?.id ?? assignableRoles[0]?.id ?? 'viewer';
    const role = approveRole[req.id] ?? defaultRole;
    setActionLoading(req.id);
    const result = await approveJoinRequest(req.id, role);
    setActionLoading(null);
    if (!result.success) { alert(result.error); return; }
    void refetchRequests();
    void refetchMembers();
  }

  async function handleReject(reqId: string) {
    setActionLoading(reqId);
    await rejectJoinRequest(reqId);
    setActionLoading(null);
    void refetchRequests();
  }

  async function handleRoleChange(memberId: string, newRole: RoleId) {
    setActionLoading(memberId);
    await changeMemberRole(memberId, newRole);
    setActionLoading(null);
    void refetchMembers();
  }

  async function handleRemove(memberId: string) {
    if (!confirm('Remove this member from the workspace?')) return;
    setActionLoading(memberId);
    await removeMember(memberId);
    setActionLoading(null);
    void refetchMembers();
  }

  function startCopy(source: RoleDefinition) {
    setRoleError(null);
    setEditingRoleId('new');
    setDraft({
      sourceRoleId: source.id,
      name: `${source.name} Copy`,
      description: source.description ?? '',
      permissions: clonePermissions(source.permissions),
    });
  }

  function startEdit(role: RoleDefinition) {
    if (role.isSystem) return;
    setRoleError(null);
    setEditingRoleId(role.id);
    setDraft({
      sourceRoleId: role.baseRoleId ?? role.id,
      name: role.name,
      description: role.description ?? '',
      permissions: clonePermissions(role.permissions),
    });
  }

  function cancelDraft() {
    setEditingRoleId(null);
    setDraft(null);
    setRoleError(null);
  }

  function toggleDraftPermission(module: keyof ExpandedPermissions, action: 'read' | 'write' | 'delete') {
    if (!draft) return;
    const current = draft.permissions[module][action];
    if (!current && !can(module, action)) return;
    const permissions = clonePermissions(draft.permissions);
    permissions[module][action] = !current;
    setDraft({ ...draft, permissions });
  }

  async function saveDraft() {
    if (!draft) return;
    setRoleError(null);
    try {
      const name = draft.name.trim();
      if (!name) {
        setRoleError('Role name is required.');
        return;
      }
      if (editingRoleId === 'new') {
        const created = await createCustomRole({
          name,
          description: draft.description,
          sourceRoleId: draft.sourceRoleId,
          permissions: draft.permissions,
        });
        setSelectedRoleId(created.id);
      } else if (editingRoleId) {
        const updated = await updateCustomRole(editingRoleId, {
          name,
          description: draft.description,
          permissions: draft.permissions,
        });
        setSelectedRoleId(updated.id);
      }
      cancelDraft();
      await loadRoles();
    } catch (error) {
      setRoleError(error instanceof Error ? error.message : 'Role save failed.');
    }
  }

  async function handleArchive(role: RoleDefinition) {
    if (!confirm(`Archive ${role.name}?`)) return;
    setRoleError(null);
    try {
      await archiveCustomRole(role.id);
      if (selectedRoleId === role.id) setSelectedRoleId('founder');
      await loadRoles();
    } catch (error) {
      setRoleError(error instanceof Error ? error.message : 'Role archive failed.');
    }
  }

  function emptyDepartmentAccess(): DepartmentAccess {
    return { read: false, write: false, delete: false, manage: false };
  }

  async function toggleRoleDepartmentGrant(departmentId: string, roleId: RoleId, action: keyof DepartmentAccess) {
    if (!departmentAccess) return;
    const existing = departmentAccess.roleGrants.find(g => g.department_id === departmentId && g.role_id === roleId) ?? {
      department_id: departmentId,
      role_id: roleId,
      ...emptyDepartmentAccess(),
    };
    const next = { read: existing.read, write: existing.write, delete: existing.delete, manage: existing.manage, [action]: !existing[action] };
    const hasAny = DEPARTMENT_ACTIONS.some(a => next[a]);
    setActionLoading(`${departmentId}:${roleId}:${action}`);
    try {
      if (hasAny) await saveDepartmentRoleGrant(departmentId, roleId, next);
      else await deleteDepartmentRoleGrant(departmentId, roleId);
      await loadDepartmentAccess();
      await refetchMembers();
    } catch (error) {
      setDepartmentAccessError(error instanceof Error ? error.message : 'Grant update failed.');
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleMemberDepartmentGrant(departmentId: string, memberId: string, action: keyof DepartmentAccess) {
    if (!departmentAccess) return;
    const existing = departmentAccess.memberGrants.find(g => g.department_id === departmentId && g.member_id === memberId) ?? {
      department_id: departmentId,
      member_id: memberId,
      ...emptyDepartmentAccess(),
    };
    const next = { read: existing.read, write: existing.write, delete: existing.delete, manage: existing.manage, [action]: !existing[action] };
    const hasAny = DEPARTMENT_ACTIONS.some(a => next[a]);
    setActionLoading(`${departmentId}:${memberId}:${action}`);
    try {
      if (hasAny) await saveDepartmentMemberGrant(departmentId, memberId, next);
      else await deleteDepartmentMemberGrant(departmentId, memberId);
      await loadDepartmentAccess();
    } catch (error) {
      setDepartmentAccessError(error instanceof Error ? error.message : 'Grant update failed.');
    } finally {
      setActionLoading(null);
    }
  }

  const selectedMeta = roleMeta(selectedRole, selectedRoleId);
  const SelectedIcon = selectedMeta.icon;

  const B  = 'rgba(255,255,255,0.06)';
  const AC = '#C1AEFF';
  const DIM = 'rgba(255,255,255,0.28)';

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:26, borderBottom:`1px solid ${B}` }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:10, fontSize:10, color:'rgba(255,255,255,0.22)', letterSpacing:'0.12em', textTransform:'uppercase', fontWeight:600 }}>
            <ShieldCheck size={11} color={AC} /> Access Control
          </div>
          <h1 style={{ fontSize:28, fontWeight:800, color:'#fff', letterSpacing:'-0.025em', margin:0, lineHeight:1 }}>Team & Access</h1>
          <p style={{ fontSize:13, color:DIM, margin:'7px 0 0' }}>Manage workspace members, roles, and permissions</p>
        </div>
      </div>

      {/* ── Stat strip ────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', borderBottom:`1px solid ${B}` }}>
        {[
          { label: 'Total Members',    value: activeMembers.length, valueColor: '#0ea5e9' },
          { label: 'Pending Requests', value: pendingCount, valueColor: pendingCount > 0 ? '#fbbf24' : 'rgba(255,255,255,0.3)' },
          { label: 'Your Role',        value: roleName ?? roleLabel(roleById.get(myRole ?? ''), myRole), valueColor: roleMeta(roleById.get(myRole ?? ''), myRole).color.replace('text-', '').includes('-') ? undefined : undefined },
        ].map((s, i) => (
          <div key={s.label} style={{ padding:'20px', borderLeft: i > 0 ? `1px solid ${B}` : 'none' }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.25)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:8 }}>{s.label}</div>
            <div style={{ fontSize:24, fontWeight:700, color:'#fff', letterSpacing:'-0.02em' }} className={roleMeta(roleById.get(myRole ?? ''), myRole).color && i === 2 ? roleMeta(roleById.get(myRole ?? ''), myRole).color : ''}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Tab bar ───────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:2, padding:'16px 0', borderBottom:`1px solid ${B}` }}>
        {([
          { key: 'members',          label: 'Members',       count: activeMembers.length, show: true },
          { key: 'requests',         label: 'Requests',      count: pendingCount,         show: canManage },
          { key: 'invites',          label: 'Invite',        count: null,                 show: canManage },
          { key: 'permissions',      label: 'Permissions',   count: null,                 show: true },
          { key: 'departmentAccess', label: 'Dept Access',   count: null,                 show: can('team', 'read') },
        ] as const).filter(t => t.show).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display:'flex', alignItems:'center', gap:7,
            padding:'7px 14px', borderRadius:8, fontSize:13, fontWeight: tab === t.key ? 600 : 400,
            background: tab === t.key ? 'rgba(193,174,255,0.1)' : 'transparent',
            border: `1px solid ${tab === t.key ? 'rgba(193,174,255,0.22)' : 'transparent'}`,
            color: tab === t.key ? AC : 'rgba(255,255,255,0.35)',
            cursor:'pointer', transition:'all 0.15s', fontFamily:'inherit',
          }}>
            {t.label}
            {t.count !== null && t.count > 0 && (
              <span style={{ fontSize:10, padding:'1px 6px', borderRadius:100, background: t.key === 'requests' && pendingCount > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.08)', color: t.key === 'requests' && pendingCount > 0 ? '#fbbf24' : 'rgba(255,255,255,0.4)' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'members' && (
        <div style={{ paddingTop:8 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 0', borderBottom:`1px solid ${B}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'rgba(255,255,255,0.45)' }}>
              <Users size={14} /> {activeMembers.length} member{activeMembers.length !== 1 ? 's' : ''}
            </div>
            {canManage && (
              <button onClick={() => setTab('invites')} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:600, background:'rgba(14,165,233,0.08)', border:'1px solid rgba(14,165,233,0.2)', color:'#7dd3fc', cursor:'pointer', fontFamily:'inherit' }}>
                <Plus size={13} /> Invite Member
              </button>
            )}
          </div>

          {loadingMembers ? (
            <div style={{ padding:'48px 0', textAlign:'center', fontSize:13, color:'rgba(255,255,255,0.25)' }}>Loading…</div>
          ) : activeMembers.length === 0 ? (
            <div style={{ padding:'48px 0', textAlign:'center' }}>
              <Users size={32} style={{ color:'rgba(255,255,255,0.1)', margin:'0 auto 12px', display:'block' }} />
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.3)' }}>No members yet</div>
            </div>
          ) : (
            <div>
              {activeMembers.map(m => {
                const role = roleById.get(m.role);
                const meta = roleMeta(role, m.role);
                const Icon = meta.icon;
                const isMe = m.user_id === user?.id;
                const isProtectedMember = m.is_protected_role;
                return (
                  <div key={m.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 0', borderBottom:`1px solid ${B}`, transition:'background 0.15s' }}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${meta.bg} ${meta.color}`}>
                      {initials(m)}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:14, color:'#fff', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{memberName(m)}</span>
                        {isMe && <span style={{ fontSize:9, padding:'2px 6px', borderRadius:100, background:'rgba(14,165,233,0.1)', color:'#7dd3fc' }}>You</span>}
                      </div>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.25)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.email ?? m.title ?? '—'}</div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {canManage && !isMe && !isProtectedMember ? (
                        <div style={{ position:'relative' }}>
                          <select value={m.role} disabled={actionLoading === m.id}
                            onChange={e => handleRoleChange(m.id, e.target.value)}
                            className={`text-[11px] px-2.5 py-1.5 pr-6 rounded-lg border appearance-none cursor-pointer transition-colors ${meta.bg} ${meta.border} ${meta.color} bg-transparent`}>
                            {assignableRoles.map(r => (
                              <option key={r.id} value={r.id} className="bg-gray-900 text-white">{r.name}</option>
                            ))}
                          </select>
                          <ChevronDown className={`w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none ${meta.color}`} />
                        </div>
                      ) : (
                        <span className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border ${meta.bg} ${meta.border} ${meta.color}`}>
                          <Icon className="w-3 h-3" /> {roleLabel(role, m.role)}
                        </span>
                      )}
                      {canRemoveMembers && !isMe && !isProtectedMember && (
                        <button onClick={() => handleRemove(m.id)} disabled={actionLoading === m.id}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.2)', padding:6, borderRadius:6, display:'flex', transition:'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.2)'; e.currentTarget.style.background = 'none'; }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'requests' && (
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800/50">
            <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-amber-400" />
              Pending Join Requests
              {pendingCount > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">{pendingCount} pending</span>}
            </h3>
          </div>
          {loadingRequests ? (
            <div className="p-8 text-center text-gray-500 text-sm">Loading...</div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center">
              <UserCheck className="w-8 h-8 text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No pending requests right now.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800/40">
              {requests.map(req => {
                const defaultRole = assignableRoles.find(r => r.id === 'viewer')?.id ?? assignableRoles[0]?.id ?? 'viewer';
                const roleForApproval = approveRole[req.id] ?? defaultRole;
                const approvalRole = roleById.get(roleForApproval);
                const meta = roleMeta(approvalRole, roleForApproval);
                return (
                  <div key={req.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 bg-amber-500/10 text-amber-400">
                      {initials(req)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium">{memberName(req)}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-500">Access request</span>
                        <span className="text-[10px] text-gray-600 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(req.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {req.message && <p className="text-[11px] text-gray-400 mt-1 italic">"{req.message}"</p>}
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <select
                          value={roleForApproval}
                          onChange={e => setApproveRole(prev => ({ ...prev, [req.id]: e.target.value }))}
                          className={`text-[11px] px-2.5 py-1.5 rounded-lg border appearance-none cursor-pointer ${meta.bg} ${meta.border} ${meta.color} bg-transparent`}
                        >
                          {assignableRoles.map(r => (
                            <option key={r.id} value={r.id} className="bg-gray-900 text-white">{r.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleApprove(req)}
                          disabled={actionLoading === req.id}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/25 transition-all disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => handleReject(req.id)}
                          disabled={actionLoading === req.id}
                          className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'invites' && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <Mail className="w-4 h-4 text-sky-400" />
            Invite Someone by Email
          </h3>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 block">Email Address</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => { setInviteEmail(e.target.value); setInviteEmailStatus(null); }}
                placeholder="someone@company.com"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-700 bg-gray-900/50 text-white focus:border-sky-500/50 focus:outline-none"
              />
            </div>
            <button
              onClick={handleEmailInvite}
              disabled={sendingEmailInvite || !inviteEmail.trim()}
              className="flex items-center gap-2 px-5 py-2.5 text-sm rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-all disabled:opacity-60"
            >
              {sendingEmailInvite ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Mail className="w-4 h-4" />}
              Send Invite
            </button>
          </div>
          {inviteEmailStatus === 'exists' && <p className="text-[11px] text-amber-400 mt-3 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> This email already has an account.</p>}
          {inviteEmailStatus === 'sent' && <p className="text-[11px] text-emerald-400 mt-3 flex items-center gap-1.5"><Check className="w-3 h-3" /> Invite sent.</p>}
          {inviteEmailStatus === 'error' && <p className="text-[11px] text-red-400 mt-3 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> Failed to send invite. Try again.</p>}
        </div>
      )}

      {tab === 'permissions' && (
        <div className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                Permission Matrix
              </h3>
              {canManage && selectedRole && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startCopy(selectedRole)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 hover:bg-violet-500/15"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy Role
                  </button>
                  {!selectedRole.isSystem && (
                    <>
                      <button
                        onClick={() => startEdit(selectedRole)}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-300 hover:bg-sky-500/15"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => handleArchive(selectedRole)}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/15"
                      >
                        <Archive className="w-3.5 h-3.5" /> Archive
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {loadingRoles ? (
              <div className="p-8 text-center text-gray-500 text-sm">Loading roles...</div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-5">
                  {sortedRoles.map(r => {
                    const meta = roleMeta(r);
                    const Icon = meta.icon;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelectedRoleId(r.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
                          selectedRoleId === r.id ? `${meta.bg} ${meta.border} ${meta.color} font-medium` : 'bg-gray-900/50 border-gray-800 text-gray-500 hover:border-gray-700'
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        {r.name}
                      </button>
                    );
                  })}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left py-2.5 px-4 text-[10px] text-gray-500 uppercase tracking-wider">Module</th>
                        {ACTIONS.map(action => (
                          <th key={action} className="text-center py-2.5 px-4 text-[10px] text-gray-500 uppercase tracking-wider capitalize">{action}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MODULES.map(mod => (
                        <tr key={mod} className="border-b border-gray-800/40">
                          <td className="py-3 px-4 text-sm text-gray-300 capitalize">{mod}</td>
                          {ACTIONS.map(action => {
                            const allowed = hasPermission(selectedRole?.permissions, mod, action);
                            return (
                              <td key={action} className="py-3 px-4 text-center">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${allowed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-800 text-gray-600'}`}>
                                  {allowed ? '✓' : '×'}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {draft && (
            <div className="glass-card p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
                  <SelectedIcon className={`w-4 h-4 ${selectedMeta.color}`} />
                  {editingRoleId === 'new' ? 'New Custom Role' : 'Edit Custom Role'}
                </h3>
                <div className="flex items-center gap-2">
                  <button onClick={cancelDraft} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5"><X className="w-4 h-4" /></button>
                  <button onClick={saveDraft} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/20">
                    <Save className="w-3.5 h-3.5" /> Save
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <input
                  value={draft.name}
                  onChange={e => setDraft({ ...draft, name: e.target.value })}
                  className="px-3 py-2 text-sm rounded-lg border border-gray-700 bg-gray-900/50 text-white focus:outline-none focus:border-violet-500/50"
                  placeholder="Role name"
                />
                <input
                  value={draft.description}
                  onChange={e => setDraft({ ...draft, description: e.target.value })}
                  className="px-3 py-2 text-sm rounded-lg border border-gray-700 bg-gray-900/50 text-white focus:outline-none focus:border-violet-500/50"
                  placeholder="Description"
                />
              </div>
              {roleError && <p className="text-xs text-red-400 mb-3">{roleError}</p>}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-2.5 px-4 text-[10px] text-gray-500 uppercase tracking-wider">Module</th>
                      {ACTIONS.map(action => <th key={action} className="text-center py-2.5 px-4 text-[10px] text-gray-500 uppercase tracking-wider capitalize">{action}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map(mod => (
                      <tr key={mod} className="border-b border-gray-800/40">
                        <td className="py-3 px-4 text-sm text-gray-300 capitalize">{mod}</td>
                        {ACTIONS.map(action => {
                          const checked = draft.permissions[mod][action];
                          const disabled = !checked && !can(mod, action);
                          return (
                            <td key={action} className="py-3 px-4 text-center">
                              <button
                                onClick={() => toggleDraftPermission(mod, action)}
                                disabled={disabled}
                                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-colors ${checked ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-800 text-gray-600'} disabled:opacity-40`}
                              >
                                {checked ? '✓' : '×'}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="glass-card p-5">
            <h3 className="text-sm font-medium text-gray-200 mb-4">Members by Role</h3>
            <div className="grid grid-cols-4 gap-3">
              {sortedRoles.map(r => {
                const count = activeMembers.filter(m => m.role === r.id).length;
                if (count === 0) return null;
                const meta = roleMeta(r);
                const Icon = meta.icon;
                return (
                  <div key={r.id} className={`p-3 rounded-xl border ${meta.bg} ${meta.border}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                      <span className={`text-[10px] font-medium ${meta.color}`}>{r.name}</span>
                    </div>
                    <p className="text-xl font-bold text-white">{count}</p>
                    <p className="text-[9px] text-gray-600">{count === 1 ? 'member' : 'members'}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'departmentAccess' && (
        <div className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                Department Access
              </h3>
              <button
                onClick={() => loadDepartmentAccess()}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Refresh
              </button>
            </div>
            {departmentAccessError && <p className="text-xs text-red-400 mb-3">{departmentAccessError}</p>}
            {loadingDepartmentAccess ? (
              <div className="p-8 text-center text-gray-500 text-sm">Loading department access...</div>
            ) : !departmentAccess || departmentAccess.departments.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No departments are accessible to manage.</div>
            ) : (
              <div className="space-y-5">
                {departmentAccess.departments.map(department => {
                  const canManageDepartment = canManage && department.access.manage;
                  const roleGrant = (roleId: RoleId) =>
                    departmentAccess.roleGrants.find(g => g.department_id === department.id && g.role_id === roleId);
                  const memberGrant = (memberId: string) =>
                    departmentAccess.memberGrants.find(g => g.department_id === department.id && g.member_id === memberId);

                  return (
                    <div key={department.id} className="rounded-xl border border-gray-800 bg-gray-950/40 p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <h4 className="text-sm font-medium text-white">{department.label}</h4>
                          <p className="text-[10px] text-gray-500">
                            Your access: {DEPARTMENT_ACTIONS.filter(a => department.access[a]).join(', ') || 'none'}
                          </p>
                        </div>
                        {!canManageDepartment && (
                          <span className="text-[10px] px-2 py-1 rounded-full bg-gray-800 text-gray-500">read-only</span>
                        )}
                      </div>

                      <div className="overflow-x-auto mb-4">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-800">
                              <th className="text-left py-2 px-3 text-[10px] text-gray-500 uppercase tracking-wider">Role</th>
                              {DEPARTMENT_ACTIONS.map(action => (
                                <th key={action} className="text-center py-2 px-3 text-[10px] text-gray-500 uppercase tracking-wider capitalize">{action}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sortedRoles.map(r => {
                              const grant = roleGrant(r.id);
                              const locked = r.id === 'founder' || r.id === 'super_admin';
                              return (
                                <tr key={r.id} className="border-b border-gray-800/40">
                                  <td className="py-2 px-3 text-xs text-gray-300">{r.name}{locked ? ' (implicit)' : ''}</td>
                                  {DEPARTMENT_ACTIONS.map(action => {
                                    const checked = locked || grant?.[action] === true;
                                    const disabled = locked || !canManageDepartment || (!checked && !department.access[action]) || actionLoading === `${department.id}:${r.id}:${action}`;
                                    return (
                                      <td key={action} className="py-2 px-3 text-center">
                                        <button
                                          onClick={() => toggleRoleDepartmentGrant(department.id, r.id, action)}
                                          disabled={disabled}
                                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${checked ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-800 text-gray-600'} disabled:opacity-40`}
                                        >
                                          {checked ? '✓' : '×'}
                                        </button>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-800">
                              <th className="text-left py-2 px-3 text-[10px] text-gray-500 uppercase tracking-wider">Member Exception</th>
                              {DEPARTMENT_ACTIONS.map(action => (
                                <th key={action} className="text-center py-2 px-3 text-[10px] text-gray-500 uppercase tracking-wider capitalize">{action}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {activeMembers.map(member => {
                              const grant = memberGrant(member.id);
                              return (
                                <tr key={member.id} className="border-b border-gray-800/40">
                                  <td className="py-2 px-3 text-xs text-gray-300">{memberName(member)}</td>
                                  {DEPARTMENT_ACTIONS.map(action => {
                                    const checked = grant?.[action] === true;
                                    const disabled = !canManageDepartment || (!checked && !department.access[action]) || actionLoading === `${department.id}:${member.id}:${action}`;
                                    return (
                                      <td key={action} className="py-2 px-3 text-center">
                                        <button
                                          onClick={() => toggleMemberDepartmentGrant(department.id, member.id, action)}
                                          disabled={disabled}
                                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${checked ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-800 text-gray-600'} disabled:opacity-40`}
                                        >
                                          {checked ? '✓' : '×'}
                                        </button>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
