import { useEffect, useMemo, useState } from 'react';
import type { UExternalNode } from '../../lib/usePolytopeStore';
import { U_DOMAIN_COLOR, type UDomain } from '../../lib/universalPolytopeData';
import {
  EnergyOrb2D,
  EnergyOrbLabel2D,
  computeRootLabelLayouts,
} from '../planet/EnergyOrb2D';
const CX = 400;
const CY = 400;
const CORE_ORB_R = 52;
const ORBIT_FORM_MS = 3200;
const ORBIT_SPOKE_ANIM_MS = 1250;
const ORBIT_PERIOD_S = 72;

function deptOrbRadius(score: number) {
  return 22 + (score / 100) * 8;
}

function ringRadius(count: number) {
  return Math.min(200, 168 + count * 5);
}

interface LayoutNode {
  id: string;
  label: string;
  color: string;
  angle: number;
  localX: number;
  localY: number;
  relevance: number;
}

export interface WorkspacePlanetHeroProps {
  companyName: string;
  industryColor: string;
  departments: UExternalNode[];
}

export function WorkspacePlanetHero({
  companyName,
  industryColor,
  departments,
}: WorkspacePlanetHeroProps) {
  const [orbitPhase, setOrbitPhase] = useState<'deploying' | 'orbiting'>('deploying');

  const activeDepts = useMemo(
    () => departments.filter(d => d.domain !== 'inactive' && !d.isDraft).slice(0, 8),
    [departments],
  );

  const layout = useMemo((): LayoutNode[] => {
    const n = Math.max(activeDepts.length, 1);
    const r0 = ringRadius(n);
    return activeDepts.map((dept, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const localX = Math.cos(angle) * r0;
      const localY = Math.sin(angle) * r0;
      return {
        id: dept.id,
        label: dept.label,
        color: U_DOMAIN_COLOR[dept.domain as UDomain] ?? industryColor,
        angle,
        localX,
        localY,
        relevance: dept.score,
      };
    });
  }, [activeDepts, industryColor]);

  const orbitRingR = ringRadius(activeDepts.length);
  const orbitCircumference = 2 * Math.PI * orbitRingR;
  const isDeploying = orbitPhase === 'deploying';
  const isOrbiting = orbitPhase === 'orbiting';
  const showLabels = !isDeploying;

  useEffect(() => {
    setOrbitPhase('deploying');
    const t = window.setTimeout(() => setOrbitPhase('orbiting'), ORBIT_FORM_MS);
    return () => window.clearTimeout(t);
  }, [companyName, activeDepts.length]);

  const labelLayouts = useMemo(() => {
    if (!showLabels) return null;
    return computeRootLabelLayouts(
      layout.map(n => ({
        id: n.id,
        label: n.label,
        angle: n.angle,
        localX: n.localX,
        localY: n.localY,
        relevance: n.relevance,
      })),
      rel => deptOrbRadius(rel ?? 70),
      CORE_ORB_R,
    );
  }, [layout, showLabels]);

  return (
    <div className="ws-planet-hero relative w-full h-full flex items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 55% 45% at 50% 48%, ${industryColor}18 0%, transparent 70%)`,
        }}
      />

      <svg
        viewBox="0 0 800 800"
        className="ws-planet-svg w-full h-full max-h-full"
        overflow="visible"
      >
        <defs>
          <radialGradient id="wsPlanetCoreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={industryColor} stopOpacity="0.55" />
            <stop offset="100%" stopColor={industryColor} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="wsPlanetGlobe" cx="50%" cy="42%" r="55%">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.35" />
            <stop offset="70%" stopColor="#0f172a" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Wireframe globe */}
        <g opacity={0.45}>
          <circle cx={CX} cy={CY} r={248} fill="url(#wsPlanetGlobe)" stroke={`${industryColor}22`} strokeWidth={1} />
          {[0, 30, 60, 90, 120, 150].map(deg => (
            <ellipse
              key={`lat-${deg}`}
              cx={CX}
              cy={CY}
              rx={248 * Math.cos((deg * Math.PI) / 180)}
              ry={248}
              fill="none"
              stroke={`${industryColor}18`}
              strokeWidth={0.75}
            />
          ))}
          {[0, 45, 90, 135].map(deg => (
            <ellipse
              key={`lon-${deg}`}
              cx={CX}
              cy={CY}
              rx={248}
              ry={248 * Math.sin((deg * Math.PI) / 180) || 0.15}
              fill="none"
              stroke={`${industryColor}14`}
              strokeWidth={0.75}
              transform={`rotate(${deg} ${CX} ${CY})`}
            />
          ))}
        </g>

        {/* Orbit ring */}
        <circle
          cx={CX}
          cy={CY}
          r={orbitRingR}
          fill="none"
          stroke={`${industryColor}33`}
          strokeWidth={1}
          strokeDasharray={`${orbitCircumference} ${orbitCircumference}`}
          className={isDeploying ? 'planet2d-orbit-ring-draw' : undefined}
          style={{
            ['--ring-circ' as string]: String(orbitCircumference),
            strokeDashoffset: isOrbiting ? 0 : undefined,
          }}
        />

        {/* Core */}
        <g transform={`translate(${CX}, ${CY})`} className="planet2d-core-orb">
          <circle r={CORE_ORB_R + 36} fill="url(#wsPlanetCoreGlow)" />
          <EnergyOrb2D
            color={industryColor}
            radius={CORE_ORB_R}
            idSuffix="ws-planet-core"
            intensity={1}
          />
          <text y={-8} textAnchor="middle" fill="#f8fafc" fontSize={14} fontWeight={700}>
            {companyName}
          </text>
          <text y={12} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={9} letterSpacing="0.2em">
            YOUR COMPANY
          </text>
        </g>

        {/* Department orbs */}
        <g transform={`translate(${CX}, ${CY})`}>
          <g>
            {isOrbiting && (
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0"
                to="360"
                dur={`${ORBIT_PERIOD_S}s`}
                repeatCount="indefinite"
              />
            )}
            <g>
              {isOrbiting && (
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0"
                  to="-360"
                  dur={`${ORBIT_PERIOD_S}s`}
                  repeatCount="indefinite"
                />
              )}
              {layout.map((node, nodeIndex) => {
                const r = deptOrbRadius(node.relevance);
                const nodeCount = Math.max(layout.length, 1);
                const orbitPos = `translate(${node.localX}, ${node.localY})`;

                const orb = (
                  <g>
                    <EnergyOrb2D
                      color={node.color}
                      radius={r}
                      idSuffix={node.id}
                      intensity={node.relevance / 100}
                    />
                  </g>
                );

                return (
                  <g key={node.id}>
                    {isDeploying ? (
                      <g
                        className="planet2d-orb-deploy"
                        style={{
                          ['--orb-lx' as string]: `${node.localX}`,
                          ['--orb-ly' as string]: `${node.localY}`,
                          ['--orb-i' as string]: String(nodeIndex),
                          ['--orb-n' as string]: String(nodeCount),
                        }}
                      >
                        {orb}
                      </g>
                    ) : (
                      <g transform={orbitPos}>{orb}</g>
                    )}
                  </g>
                );
              })}
              {showLabels &&
                layout.map(node => {
                  const r = deptOrbRadius(node.relevance);
                  const off = labelLayouts?.get(node.id);
                  return (
                    <g key={`lbl-${node.id}`} transform={`translate(${node.localX}, ${node.localY})`}>
                      <EnergyOrbLabel2D
                        title={node.label}
                        sub={`${node.relevance}`}
                        color={node.color}
                        angle={node.angle}
                        orbR={r}
                        offsetX={off?.x}
                        offsetY={off?.y}
                        compact
                        className="planet2d-label-reveal"
                      />
                    </g>
                  );
                })}
            </g>
          </g>
        </g>
      </svg>

      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.2em] uppercase text-white/35 pointer-events-none">
        Drag any element to the canvas to explore
      </p>

      <style>{`
        .ws-planet-hero .planet2d-orbit-ring-draw {
          animation: planet2dRingDraw ${ORBIT_FORM_MS}ms cubic-bezier(0.22, 0.85, 0.28, 1) forwards;
        }
        @keyframes planet2dOrbDeploy {
          0% { transform: translate(0px, 0px) scale(0.15); opacity: 0; }
          35% { opacity: 0.9; }
          100% {
            transform: translate(calc(var(--orb-lx) * 1px), calc(var(--orb-ly) * 1px)) scale(1);
            opacity: 1;
          }
        }
        @keyframes planet2dRingDraw {
          from { stroke-dashoffset: var(--ring-circ); opacity: 0.2; }
          to { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes planet2dLabelReveal {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .ws-planet-hero .planet2d-orb-deploy {
          transform-origin: 0px 0px;
          animation: planet2dOrbDeploy ${ORBIT_SPOKE_ANIM_MS}ms cubic-bezier(0.22, 0.85, 0.28, 1) forwards;
          animation-delay: calc((var(--orb-i) / var(--orb-n)) * ${ORBIT_FORM_MS * 0.62}ms);
        }
        .ws-planet-hero .planet2d-label-reveal {
          animation: planet2dLabelReveal 0.55s cubic-bezier(0.22, 0.85, 0.28, 1) forwards;
          opacity: 0;
        }
        @keyframes planet2dCorePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.88; }
        }
        .ws-planet-hero .planet2d-core-orb { animation: planet2dCorePulse 3.2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
