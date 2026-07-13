import { useMemo, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getPlanetRootsForCompany,
  type UserPlanetRole,
  type PlanetActionNode,
  type PlanetBranchNode,
  type PlanetRootNode,
  type CompanyPlanetContext,
} from '../data/companyPlanetRoots';
import { useSavedWorkflows } from '../lib/useSavedWorkflows';
import { ActionNodeWorkspace } from '../components/workspace/ActionNodeWorkspace';

export default function WorkspacePage() {
  const [searchParams] = useSearchParams();
  const savedId = searchParams.get('savedId');
  const companyId = searchParams.get('companyId') || 'demo';
  const companyName = searchParams.get('companyName') || 'My Workspace';
  const role = (searchParams.get('role') || 'founder') as UserPlanetRole;
  const rootId = searchParams.get('rootId');
  const branchId = searchParams.get('branchId');
  const actionId = searchParams.get('actionId');

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { items } = useSavedWorkflows();

  // Preferred path: rebuild the node directly from the saved card. This is
  // resilient to root/branch/action id regeneration (ids depend on tag state).
  const fromSaved = useMemo(() => {
    if (!savedId) return null;
    const item = items.find(i => i.id === savedId);
    if (!item || !item.actionId) return null;

    const action: PlanetActionNode = {
      id: item.actionId,
      label: item.actionLabel ?? 'Action',
      hint: item.actionHint,
    };
    const branch: PlanetBranchNode = {
      id: item.branchId ?? `${item.actionId}_branch`,
      label: item.branchLabel ?? '',
      nodeType: 'decision',
      actions: [action],
    };
    const root: PlanetRootNode = {
      id: item.rootId ?? `${item.actionId}_root`,
      label: item.rootLabel ?? '',
      description: item.rootDescription ?? '',
      relevance: 80,
      color: item.rootColor ?? '#C1AEFF',
      branches: [branch],
    };
    const context: CompanyPlanetContext = {
      companyId: item.companyId,
      companyName: item.companyName,
      role: item.role,
      roleLabel: item.roleLabel,
      roots: [root],
    };
    return { root, branch, action, context };
  }, [savedId, items]);

  // Fallback path: resolve against freshly generated roots (legacy deep links).
  const planetContext = useMemo(() => {
    return getPlanetRootsForCompany(companyId, companyName, role);
  }, [companyId, companyName, role]);

  const fromParams = useMemo(() => {
    if (!rootId || !branchId || !actionId) return null;
    const root = planetContext.roots.find(r => r.id === rootId);
    if (!root) return null;
    const branch = root.branches.find(b => b.id === branchId);
    if (!branch) return null;
    const action = branch.actions.find(a => a.id === actionId);
    if (!action) return null;
    return { root, branch, action, context: planetContext };
  }, [planetContext, rootId, branchId, actionId]);

  const resolved = fromSaved ?? fromParams;

  if (!mounted) return null;

  if (!resolved) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white/50">
        Workspace node not found. Please launch this from the 3D Universe.
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative">
      <ActionNodeWorkspace
        actionNode={resolved.action}
        branchNode={resolved.branch}
        rootNode={resolved.root}
        context={resolved.context}
        fullScreen={true}
        embedded={!!fromSaved}
        onClose={() => {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ type: 'ACTION_WORKSPACE_CLOSED' }, '*');
          }
          window.close();
        }}
      />
    </div>
  );
}
