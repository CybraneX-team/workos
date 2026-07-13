import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Graph3D from '../components/Graph3D';
import { useTwinGraph } from '../data/twinGraph';
import { useAuth } from '../lib/auth';

export default function Twin() {
  const navigate = useNavigate();
  const { user, profile, canRead } = useAuth();
  // Pass null (not undefined) for logged-in users without a company yet —
  // this hides the "WorkOS" placeholder regardless of load state
  const graphCompanyId = user ? (profile?.company_id ?? null) : undefined;
  const { nodes: twinNodes, edges: twinEdges, myCompanyNodeId, emergeParent } = useTwinGraph(graphCompanyId);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [filters] = useState({
    industry: true,
    company: true,
    department: true,
    signal: true,
  });

  const visibleNodes = useMemo(
    () => twinNodes.filter((n) => {
      if (n.type === 'kpi') return filters.department;
      if (n.type === 'feature') return true;
      return filters[n.type as keyof typeof filters];
    }),
    [twinNodes, filters],
  );
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => twinEdges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to)),
    [twinEdges, visibleIds],
  );

  const selectedData = selectedNode ? twinNodes.find((n) => n.id === selectedNode) : null;
  const connEdges = selectedNode
    ? twinEdges.filter((e) => e.from === selectedNode || e.to === selectedNode)
    : [];

  const handleNavigate = useCallback((route: string) => {
    navigate(route);
  }, [navigate]);

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden" style={{ background: '#06061a' }}>
      {/* 3D Graph — full viewport, z-0 so Html labels stay below TopBar z-50 */}
      <div className="absolute inset-0 w-full h-full z-0">
        <Graph3D
          nodes={visibleNodes}
          edges={visibleEdges}
          selectedNode={selectedNode}
          hoveredNode={hoveredNode}
          onSelect={setSelectedNode}
          onHover={setHoveredNode}
          onNavigate={handleNavigate}
          myCompanyId={myCompanyNodeId}
          emergeParentMap={emergeParent}
        />
      </div>

      {/* Hover detail panel — floating top-right below topbar */}
      {selectedData && selectedData.type !== 'feature' && (
        <div className="absolute top-20 right-6 w-72 p-5 z-20 rounded-xl border border-slate-700/40 backdrop-blur-xl"
          style={{ background: 'rgba(2, 6, 23, 0.88)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full ${
                selectedData.type === 'industry'
                  ? 'bg-sky-500/15 text-sky-300'
                  : selectedData.type === 'company'
                    ? 'bg-cyan-500/15 text-cyan-300'
                    : selectedData.type === 'department'
                      ? 'bg-teal-500/15 text-teal-300'
                      : selectedData.type === 'kpi'
                        ? 'bg-rose-500/15 text-rose-300'
                        : 'bg-amber-500/15 text-amber-300'
              }`}
            >
              {selectedData.type}
            </span>
            {selectedData.status && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  selectedData.status === 'healthy'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : selectedData.status === 'warning'
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-red-500/15 text-red-400'
                }`}
              >
                {selectedData.status}
              </span>
            )}
          </div>

          <h3 className="text-base font-semibold text-white mb-1">{selectedData.label}</h3>
          {selectedData.description && (
            <p className="text-xs text-gray-400 mb-3">{selectedData.description}</p>
          )}

          {selectedData.metrics && (
            <div className="mb-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Metrics</p>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(selectedData.metrics).map(([k, v]) => (
                  <div key={k} className="bg-gray-900/60 rounded-lg py-1.5 px-2">
                    <span className="text-[9px] text-gray-500 capitalize">{k}</span>
                    <p className="text-xs font-medium text-white">
                      {typeof v === 'number' && v > 100 ? `$${v.toLocaleString()}` : String(v)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
            Connections ({connEdges.length})
          </p>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {connEdges.map((e, i) => {
              const otherId = e.from === selectedNode ? e.to : e.from;
              const other = twinNodes.find((n) => n.id === otherId);
              return (
                <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-gray-900/40">
                  <span className="text-gray-300 truncate">{other?.label}</span>
                  <span className="text-gray-600 text-[10px] ml-2">{(e.strength * 100).toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ecosystem quick-access — floating bottom-left (hidden if user lacks ecosystem read) */}
      {canRead('ecosystem') && (
        <div className="absolute bottom-6 left-6 flex flex-col gap-2 z-10">
          <button
            onClick={() => navigate('/ecosystem/vc-connect')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 border backdrop-blur-md transition-all hover:text-white hover:border-sky-500/30"
            style={{ background: 'rgba(2, 6, 23, 0.75)', borderColor: 'rgba(148,163,184,0.1)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            VC &amp; Mentors
          </button>
          <button
            onClick={() => navigate('/ecosystem/network')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 border backdrop-blur-md transition-all hover:text-white hover:border-teal-500/30"
            style={{ background: 'rgba(2, 6, 23, 0.75)', borderColor: 'rgba(148,163,184,0.1)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
            Startup Network
          </button>
        </div>
      )}

      {/* Legend — floating bottom center */}
      {/* <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 text-xs px-4 py-2 rounded-full backdrop-blur-md z-10"
        style={{ background: 'rgba(22,22,24,0.85)', color: '#5E5E5E' }}
      >
        {[
          { color: '#0ea5e9', label: 'Industry' },
          { color: '#38bdf8', label: 'Company' },
          { color: '#2dd4bf', label: 'Department' },
          { color: '#fbbf24', label: 'Signal' },
          { color: '#f472b6', label: 'KPI' },
          { color: '#64748b', label: 'Module' },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
      </div> */}
    </div>
  );
}
