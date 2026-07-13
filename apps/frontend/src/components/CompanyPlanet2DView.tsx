import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import type { CompanyPlanetContext } from '../data/companyPlanetRoots';
import { getPlanetNodesAtPath, canDrillInto } from '../data/companyPlanetRoots';
import { EnergyOrb2D, EnergyOrbLabel2D, computeRootLabelLayouts } from './planet/EnergyOrb2D';
import { useSavedWorkflows } from '../lib/useSavedWorkflows';
import type { SavedItemLevel } from '../lib/useSavedWorkflows';

export const ROOT_FOCUS_FADE_MS = 480;
export const ROOT_FOCUS_ZOOM_MS = 920;
export const ROOT_FOCUS_HANDOFF_MS = 180;
export const ROOT_FOCUS_TOTAL_MS = ROOT_FOCUS_FADE_MS + ROOT_FOCUS_ZOOM_MS + ROOT_FOCUS_HANDOFF_MS;

export type RootFocusPhase = 'idle' | 'fadeOthers' | 'zoom' | 'handoff';

export interface CompanyPlanet2DViewProps {
  context: CompanyPlanetContext;
  depth: number;
  path: string[];
  requestFocusRootId?: string | null;
  onFocusTransitionComplete: (rootId: string) => void;
  onDrillInto: (nodeId: string) => void;
  onDrillBack: () => void;
  onActionNodeClick?: (rootId: string, branchId: string, actionId: string) => void;
  industryColor?: string;
}

const CX = 400;
const CY = 400;
const FADE_MS = ROOT_FOCUS_FADE_MS;
const ZOOM_MS = ROOT_FOCUS_ZOOM_MS;
const HANDOFF_MS = ROOT_FOCUS_HANDOFF_MS;
const CORE_ORB_R = 44;
/** Ring expands from center into a full circle */
const ORBIT_FORM_MS = 3200;
const ORBIT_SPOKE_ANIM_MS = 1250;
/** One full slow orbit after the ring is formed (seconds) */
const ORBIT_PERIOD_S = 72;

function orbRadius(relevance?: number, depth = 0) {
  const base = depth === 0 ? 26 : depth === 1 ? 20 : 16;
  if (relevance == null) return base;
  return base + (relevance / 100) * 6;
}

function ringRadius(depth: number, count: number) {
  if (depth === 0) return Math.min(228, 182 + count * 6);
  if (depth === 1) return 150;
  return 120;
}

function polar(angle: number, r: number) {
  return { x: CX + Math.cos(angle) * r, y: CY + Math.sin(angle) * r };
}

function radialChildPos(
  parentAngle: number,
  parentR: number,
  index: number,
  count: number,
  depth: number,
) {
  const dir = polar(parentAngle, parentR);
  const outward = parentAngle;
  const childR = parentR + ringRadius(depth, count) * 0.65;
  const offset = ((index / count) - 0.5) * Math.PI * 0.85;
  const angle = outward + offset;
  return {
    x: CX + Math.cos(angle) * childR,
    y: CY + Math.sin(angle) * childR,
    angle,
    parentX: dir.x,
    parentY: dir.y,
  };
}

export default function CompanyPlanet2DView({
  context,
  depth,
  path,
  requestFocusRootId,
  onFocusTransitionComplete,
  onDrillInto,
  onDrillBack,
  onActionNodeClick,
  industryColor = '#C1AEFF',
}: CompanyPlanet2DViewProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [entranceKey, setEntranceKey] = useState(0);
  const [orbitPhase, setOrbitPhase] = useState<'deploying' | 'orbiting'>('deploying');
  const [labelsReady, setLabelsReady] = useState(false);
  const [focusRootId, setFocusRootId] = useState<string | null>(null);
  const [focusPhase, setFocusPhase] = useState<RootFocusPhase>('idle');
  const timersRef = useRef<number[]>([]);

  // ── Saved workflows hook ───────────────────────────────────────────
  const { save, has, remove, items } = useSavedWorkflows();
  const [justSavedId, setJustSavedId] = useState<string | null>(null);

  const handleBookmark = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Determine level and IDs from current path + nodeId
    let level: SavedItemLevel;
    let rootId: string, branchId: string | undefined, actionId: string | undefined;
    let rootNode = context.roots[0];
    let branchNode: (typeof rootNode.branches)[0] | undefined;

    if (depth === 0) {
      level = 'root';
      rootId = nodeId;
      rootNode = context.roots.find(r => r.id === nodeId) ?? context.roots[0];
    } else if (depth === 1) {
      level = 'branch';
      rootId = path[0];
      branchId = nodeId;
      rootNode = context.roots.find(r => r.id === rootId) ?? context.roots[0];
      branchNode = rootNode.branches.find(b => b.id === nodeId);
    } else {
      level = 'action';
      rootId = path[0];
      branchId = path[1];
      actionId = nodeId;
      rootNode = context.roots.find(r => r.id === rootId) ?? context.roots[0];
      branchNode = rootNode.branches.find(b => b.id === branchId);
    }

    // Check if already saved — find the matching saved item to get its id for removal
    const isSaved = has({ companyId: context.companyId, role: context.role, rootId, branchId, actionId });

    if (isSaved) {
      const savedItem = items.find(it =>
        it.companyId === context.companyId &&
        it.role === context.role &&
        it.rootId === rootId &&
        (it.branchId ?? '') === (branchId ?? '') &&
        (it.actionId ?? '') === (actionId ?? '')
      );
      if (savedItem) remove(savedItem.id);
      return;
    }

    save({
      level,
      companyId: context.companyId,
      companyName: context.companyName,
      role: context.role,
      roleLabel: context.roleLabel,
      rootId,
      rootLabel: rootNode.label,
      rootColor: rootNode.color,
      rootDescription: rootNode.description,
      branchId,
      branchLabel: branchNode?.label,
      actionId,
      actionLabel: depth === 2 ? (branchNode?.actions.find(a => a.id === nodeId)?.label) : undefined,
      actionHint: depth === 2 ? (branchNode?.actions.find(a => a.id === nodeId)?.hint ?? undefined) : undefined,
    });
    setJustSavedId(nodeId);
    setTimeout(() => setJustSavedId(null), 2000);
  }, [depth, path, context, has, items, remove, save]);

  const isTransitioning = focusPhase !== 'idle';
  const isZooming = focusPhase === 'zoom' || focusPhase === 'handoff';

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(t => window.clearTimeout(t));
    timersRef.current = [];
  }, []);

  const startFocusTransition = useCallback((rootId: string) => {
    if (focusPhase !== 'idle') return;
    if (depth !== 0 || !canDrillInto(context, path, rootId)) return;

    clearTimers();
    setFocusRootId(rootId);
    setFocusPhase('fadeOthers');

    timersRef.current.push(
      window.setTimeout(() => setFocusPhase('zoom'), FADE_MS),
      window.setTimeout(() => setFocusPhase('handoff'), FADE_MS + ZOOM_MS),
      window.setTimeout(() => {
        onFocusTransitionComplete(rootId);
        setFocusRootId(null);
        setFocusPhase('idle');
      }, FADE_MS + ZOOM_MS + HANDOFF_MS),
    );
  }, [focusPhase, depth, context, path, clearTimers, onFocusTransitionComplete]);

  useEffect(() => {
    if (requestFocusRootId && focusPhase === 'idle') {
      startFocusTransition(requestFocusRootId);
    }
  }, [requestFocusRootId, focusPhase, startFocusTransition]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    setEntranceKey(k => k + 1);
  }, [context.companyId, context.role]);

  useEffect(() => {
    if (depth !== 0) return;
    setOrbitPhase('deploying');
    setLabelsReady(false);
    // Labels appear right after orbs finish flying in — no need to wait for the full ring draw
    const labelTimer = window.setTimeout(() => setLabelsReady(true), ORBIT_SPOKE_ANIM_MS + 80);
    const orbitTimer = window.setTimeout(() => setOrbitPhase('orbiting'), ORBIT_FORM_MS);
    return () => {
      window.clearTimeout(labelTimer);
      window.clearTimeout(orbitTimer);
    };
  }, [entranceKey, depth]);

  const nodes = useMemo(() => getPlanetNodesAtPath(context, path), [context, path]);
  const isDeploying = depth === 0 && !isTransitioning && orbitPhase === 'deploying';
  const isOrbiting = depth === 0 && !isTransitioning && orbitPhase === 'orbiting';
  const showRootLabels = depth === 0 && labelsReady && !isTransitioning;
  const orbitRingR = ringRadius(depth, nodes.length);
  const orbitCircumference = 2 * Math.PI * orbitRingR;

  const parentRootIndex = useMemo(() => {
    if (path.length === 0) return -1;
    return context.roots.findIndex(r => r.id === path[0]);
  }, [context.roots, path]);

  const parentRootAngle = parentRootIndex >= 0
    ? (parentRootIndex / Math.max(context.roots.length, 1)) * Math.PI * 2 - Math.PI / 2
    : 0;

  const layout = useMemo(() => {
    const n = Math.max(nodes.length, 1);
    const r0 = ringRadius(depth, n);

    if (depth === 0) {
      return nodes.map((node, i) => {
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
        const localX = Math.cos(angle) * r0;
        const localY = Math.sin(angle) * r0;
        return {
          ...node,
          angle,
          ringR: r0,
          localX,
          localY,
          x: CX + localX,
          y: CY + localY,
          lineFrom: { x: CX, y: CY },
        };
      });
    }

    const parentR = depth === 1 ? ringRadius(0, context.roots.length) : ringRadius(1, 4);
    const parentAngle = depth === 1 ? parentRootAngle : parentRootAngle + 0.4;

    return nodes.map((node, i) => {
      const child = radialChildPos(parentAngle, parentR, i, n, depth);
      return {
        ...node,
        x: child.x,
        y: child.y,
        angle: child.angle,
        localX: child.x - CX,
        localY: child.y - CY,
        lineFrom: { x: child.parentX, y: child.parentY },
      };
    });
  }, [nodes, depth, context.roots.length, parentRootAngle]);

  const rootLabelLayouts = useMemo(() => {
    if (depth !== 0) return null;
    return computeRootLabelLayouts(
      layout.map(node => ({
        id: node.id,
        label: node.label,
        angle: node.angle,
        localX: node.localX ?? node.x - CX,
        localY: node.localY ?? node.y - CY,
        relevance: node.relevance,
      })),
      rel => orbRadius(rel, 0),
      CORE_ORB_R,
    );
  }, [layout, depth]);

  const focusNode = focusRootId ? layout.find(n => n.id === focusRootId) : null;
  const zoomOriginX = focusNode ? (focusNode.x / 800) * 100 : 50;
  const zoomOriginY = focusNode ? (focusNode.y / 800) * 100 : 50;
  const zoomScale = isZooming ? 20 : 1;

  const handleNodeClick = (nodeId: string) => {
    if (isTransitioning) return;
    if (depth === 0 && canDrillInto(context, path, nodeId)) {
      startFocusTransition(nodeId);
      return;
    }
    if (canDrillInto(context, path, nodeId)) {
      setAnimKey(k => k + 1);
      onDrillInto(nodeId);
      return;
    }
    // Leaf action node clicked (depth=2, no children) → open workspace
    if (depth === 2 && onActionNodeClick && path.length >= 2) {
      onActionNodeClick(path[0], path[1], nodeId);
    }
  };

  const coreOpacity = isZooming ? 0 : focusPhase === 'fadeOthers' ? 0.45 : 1;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center overflow-hidden planet2d-stage"
      style={{
        background: `
          radial-gradient(ellipse 70% 55% at 50% 42%, ${industryColor}12 0%, transparent 55%),
          radial-gradient(ellipse at 50% 50%, rgba(18,10,36,1.0) 0%, rgba(2,2,8,1.0) 72%)
        `,
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(${industryColor}40 1px, transparent 1px), linear-gradient(90deg, ${industryColor}40 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      {depth > 0 && !isTransitioning && (
        <button
          type="button"
          onClick={() => { setAnimKey(k => k + 1); onDrillBack(); }}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-full text-[11px] font-medium text-gray-300 hover:text-white transition-colors"
          style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          ← Back to {depth === 1 ? 'roots' : 'branches'}
        </button>
      )}

      <div
        className="absolute inset-0 pointer-events-none z-30"
        style={{
          background: `radial-gradient(circle at ${zoomOriginX}% ${zoomOriginY}%, ${industryColor}40 0%, transparent 55%)`,
          opacity: focusPhase === 'handoff' ? 1 : 0,
          transition: 'opacity 0.18s ease-out',
        }}
      />

      <div
        className="relative w-full max-w-[min(92vw,820px)] aspect-square planet2d-zoom-stage"
        style={{
          transform: isZooming ? `scale(${zoomScale})` : 'scale(1)',
          transformOrigin: focusNode ? `${zoomOriginX}% ${zoomOriginY}%` : '50% 50%',
          transition: focusPhase === 'zoom' || focusPhase === 'handoff'
            ? `transform ${ZOOM_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
            : 'transform 0.3s ease-out',
          willChange: isTransitioning ? 'transform' : undefined,
        }}
      >
        <svg
          viewBox="0 0 800 800"
          className="w-full h-full"
          overflow="hidden"
          style={{ filter: isTransitioning ? 'none' : `drop-shadow(0 0 48px ${industryColor}22)` }}
        >
          <g>
          <defs>
            <radialGradient id="planetCoreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={industryColor} stopOpacity="0.5" />
              <stop offset="100%" stopColor={industryColor} stopOpacity="0" />
            </radialGradient>
            <filter id="planetOrbGlow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g
            className="planet2d-orbit"
            style={{
              opacity: isTransitioning ? 0 : 1,
              transition: `opacity ${FADE_MS}ms ease-out`,
            }}
          >
            <circle
              cx={CX}
              cy={CY}
              r={orbitRingR}
              fill="none"
              stroke={`${industryColor}33`}
              strokeWidth="1"
              strokeDasharray={`${orbitCircumference} ${orbitCircumference}`}
              className={isDeploying ? 'planet2d-orbit-ring-draw' : undefined}
              style={{
                ['--ring-circ' as string]: String(orbitCircumference),
                strokeDashoffset: isOrbiting || isTransitioning ? 0 : undefined,
              }}
            />
          </g>

          <g
            className="planet2d-edges"
            style={{
              opacity: isTransitioning ? 0 : 1,
              transition: `opacity ${FADE_MS}ms ease-out`,
            }}
          >
            {layout.map((node) => {
              if (!node.lineFrom) return null;
              const isOther = focusRootId != null && node.id !== focusRootId;
              if (isOther) return null;
              return (
                <line
                  key={`edge-${node.id}`}
                  x1={node.lineFrom.x}
                  y1={node.lineFrom.y}
                  x2={node.x}
                  y2={node.y}
                  stroke={node.color || industryColor}
                  strokeOpacity={0.25}
                  strokeWidth="1.5"
                />
              );
            })}
          </g>

          {/* Center company energy orb — with company name label */}
          {depth === 0 && (
            <g
              transform={`translate(${CX}, ${CY})`}
              className="planet2d-core-orb"
              style={{
                opacity: coreOpacity,
                transition: `opacity ${FADE_MS}ms ease-out`,
              }}
            >
              <EnergyOrb2D
                color={industryColor}
                radius={CORE_ORB_R}
                idSuffix="planet-core"
                intensity={1}
                selected={false}
              />
              <EnergyOrbLabel2D
                title={context.companyName}
                color={industryColor}
                angle={Math.PI / 2}
                orbR={CORE_ORB_R}
              />
            </g>
          )}

          <g transform={`translate(${CX}, ${CY})`}>
            <g key={`orbit-${entranceKey}-${animKey}`}>
              <g>
                {layout.map((node) => {
                  const r = orbRadius(node.relevance, depth);
                  const isHovered = hoveredId === node.id && !isTransitioning;
                  const isFocus = node.id === focusRootId;
                  const isOther = focusRootId != null && !isFocus;
                  const scale = isFocus && isZooming ? 1.32 : isHovered ? 1.1 : 1;
                  const labelAngle = node.angle;
                  const lx = node.localX ?? node.x - CX;
                  const ly = node.localY ?? node.y - CY;
                  const orbitPos = `translate(${lx}, ${ly})`;

                  const orbContent = (
                    <g
                      style={{
                        transform: `scale(${scale})`,
                        transition: isTransitioning
                          ? `transform ${ZOOM_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
                          : 'transform 0.2s ease-out',
                      }}
                    >
                      <EnergyOrb2D
                        color={node.color}
                        radius={r}
                        idSuffix={node.id}
                        selected={isFocus}
                        hovered={isHovered}
                        intensity={(node.relevance ?? 70) / 100}
                      />
                      {depth > 0 && !isOther && (
                        <EnergyOrbLabel2D
                          title={node.label}
                          sub={
                            node.relevance != null ? `${node.relevance}% relevance` : undefined
                          }
                          color={node.color}
                          angle={labelAngle}
                          orbR={r}
                        />
                      )}
                    </g>
                  );

                  return (
                    <g
                      key={`${node.id}-${entranceKey}`}
                      opacity={isOther ? 0 : 1}
                      style={{
                        transition: isOther || isTransitioning
                          ? `opacity ${FADE_MS}ms ease-out`
                          : undefined,
                        pointerEvents: isTransitioning && !isFocus ? 'none' : 'auto',
                      }}
                      onClick={() => handleNodeClick(node.id)}
                      onMouseEnter={() => !isTransitioning && setHoveredId(node.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      {isDeploying ? (
                        <g
                          className="planet2d-orb-deploy"
                          style={{
                            ['--orb-lx' as string]: `${lx}`,
                            ['--orb-ly' as string]: `${ly}`,
                          }}
                        >
                          {orbContent}
                        </g>
                      ) : (
                        <g transform={orbitPos}>
                          {orbContent}
                        </g>
                      )}
                    </g>
                  );
                })}
                {showRootLabels &&
                  layout.map(node => {
                    const isOther = focusRootId != null && node.id !== focusRootId;
                    if (isOther) return null;
                    const r = orbRadius(node.relevance, depth);
                    const lx = node.localX ?? node.x - CX;
                    const ly = node.localY ?? node.y - CY;
                    const labelOff = rootLabelLayouts?.get(node.id);
                    const orbitPos = `translate(${lx}, ${ly})`;

                    return (
                      <g
                        key={`label-${node.id}-${entranceKey}`}
                        transform={orbitPos}
                        opacity={isTransitioning && node.id !== focusRootId ? 0 : 1}
                        style={{
                          transition: isTransitioning
                            ? `opacity ${FADE_MS}ms ease-out`
                            : undefined,
                        }}
                      >
                        <EnergyOrbLabel2D
                          title={node.label}
                          sub={
                            node.relevance != null
                              ? `${node.relevance}% relevance`
                              : undefined
                          }
                          color={node.color}
                          angle={node.angle}
                          orbR={r}
                          offsetX={labelOff?.x}
                          offsetY={labelOff?.y}
                          className="planet2d-label-reveal"
                        />
                      </g>
                    );
                  })}
              </g>
            </g>
          </g>
          </g>
        </svg>
      </div>

      {/* ── Bookmark overlays positioned as HTML on top of the SVG ── */}
      {!isTransitioning && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
          {layout.map(node => {
            if (depth === 0) return null; // Do not show bookmarks on root nodes
            // Convert SVG coords (0-800) to % of container
            const lx = (node.localX ?? node.x - CX) + CX;
            const ly = (node.localY ?? node.y - CY) + CY;
            const xPct = (lx / 800) * 100;
            const yPct = (ly / 800) * 100;

            const rootId = depth === 0 ? node.id : path[0];
            const branchId = depth === 1 ? node.id : depth >= 2 ? path[1] : undefined;
            const actionId = depth === 2 ? node.id : undefined;

            const isSaved = has({
              companyId: context.companyId,
              role: context.role,
              rootId,
              branchId,
              actionId,
            });
            const justSaved = justSavedId === node.id;
            const isNodeHovered = hoveredId === node.id;

            return (
              <div
                key={`bm-${node.id}`}
                className="absolute pointer-events-auto"
                style={{
                  left: `${xPct}%`,
                  top: `${yPct}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <button
                  onClick={(e) => handleBookmark(node.id, e)}
                  className="flex items-center justify-center rounded-full transition-all duration-200"
                  title={isSaved ? 'Remove bookmark' : 'Save workflow'}
                  style={{
                    width: 22,
                    height: 22,
                    marginTop: -orbRadius(node.relevance, depth) - 14,
                    background: isSaved || justSaved
                      ? `${node.color}30`
                      : 'rgba(0,0,0,0.55)',
                    border: `1px solid ${isSaved || justSaved ? node.color + '60' : 'rgba(255,255,255,0.12)'}`,
                    opacity: isNodeHovered || isSaved ? 1 : 0,
                    boxShadow: isSaved ? `0 0 10px ${node.color}40` : 'none',
                    backdropFilter: 'blur(4px)',
                    cursor: 'pointer',
                    transition: 'opacity 0.2s, background 0.2s, border-color 0.2s',
                  }}
                >
                  {isSaved || justSaved
                    ? <BookmarkCheck style={{ width: 10, height: 10, color: node.color }} />
                    : <Bookmark style={{ width: 10, height: 10, color: 'rgba(255,255,255,0.5)' }} />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes planet2dOrbDeploy {
          0% {
            transform: translate(0px, 0px) scale(0.15);
            opacity: 0;
          }
          35% {
            opacity: 0.9;
          }
          100% {
            transform: translate(calc(var(--orb-lx) * 1px), calc(var(--orb-ly) * 1px)) scale(1);
            opacity: 1;
          }
        }
        @keyframes planet2dRingDraw {
          from {
            stroke-dashoffset: var(--ring-circ);
            opacity: 0.2;
          }
          to {
            stroke-dashoffset: 0;
            opacity: 1;
          }
        }
        @keyframes planet2dCorePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.88; }
        }
        @keyframes planet2dNodePulse {
          0%, 100% { opacity: 0.92; }
          50% { opacity: 1; }
        }
        @keyframes energyOrbRingSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .planet2d-core-orb { animation: planet2dCorePulse 3.2s ease-in-out infinite; }
        .energy-orb-halo { animation: planet2dNodePulse 2.8s ease-in-out infinite; }
        .energy-orb-core { animation: planet2dNodePulse 2.4s ease-in-out infinite; }
        .energy-orb-ring-spin {
          transform-origin: center;
          animation: energyOrbRingSpin 14s linear infinite;
        }
        @keyframes planet2dLabelReveal {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .planet2d-label-reveal {
          animation: planet2dLabelReveal 0.55s cubic-bezier(0.22, 0.85, 0.28, 1) forwards;
          opacity: 0;
        }
        .planet2d-orb-deploy {
          transform-origin: 0px 0px;
          animation: planet2dOrbDeploy ${ORBIT_SPOKE_ANIM_MS}ms cubic-bezier(0.22, 0.85, 0.28, 1) forwards;
        }
        .planet2d-orbit-ring-draw {
          animation: planet2dRingDraw ${ORBIT_FORM_MS}ms cubic-bezier(0.22, 0.85, 0.28, 1) forwards;
        }
        @keyframes planet2dOrbitSystem {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes planet2dOrbitCounter {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        .planet2d-orbit-system {
          transform-origin: 0px 0px;
          animation: planet2dOrbitSystem ${ORBIT_PERIOD_S}s linear infinite;
        }
        .planet2d-orbit-counter {
          transform-origin: 0px 0px;
          animation: planet2dOrbitCounter ${ORBIT_PERIOD_S}s linear infinite;
        }
      `}</style>
    </div>
  );
}
