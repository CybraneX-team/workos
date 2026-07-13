import { useRef, useEffect } from 'react';
import { getExternalNodeColor } from '../../lib/universalPolytopeData';
import type { UExternalNode } from '../../lib/universalPolytopeData';

interface AnalyticHoverCardProps {
  hoveredId: string | null;
  departments: UExternalNode[];
}

export function AnalyticHoverCard({ hoveredId, departments }: AnalyticHoverCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hoveredId) return;
    const handlePointerMove = (e: PointerEvent) => {
      if (!cardRef.current) return;
      const x = e.clientX + 15;
      const y = e.clientY + 15;
      const maxX = window.innerWidth - 260;
      const maxY = window.innerHeight - 200;
      cardRef.current.style.transform =
        `translate(${Math.min(x, maxX)}px, ${Math.min(y, maxY)}px)`;
    };
    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [hoveredId]);

  if (!hoveredId) return null;

  const node = departments.find(n => n.id === hoveredId);
  if (!node) return null;

  const color = getExternalNodeColor(node);

  return (
    <div
      ref={cardRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '240px',
        background: 'linear-gradient(135deg, rgba(20,10,40,0.75) 0%, rgba(5,4,15,0.9) 100%)',
        border: `1px solid ${color}`,
        boxShadow: `0 0 20px ${color}33, inset 0 0 15px rgba(255,255,255,0.05)`,
        borderRadius: '12px',
        padding: '16px',
        color: '#e2e8f0',
        backdropFilter: 'blur(16px)',
        zIndex: 99999,
        pointerEvents: 'none',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#f8fafc' }}>
          {node.label}
        </h3>
        <span style={{
          fontSize: '12px',
          fontWeight: '800',
          background: `${color}22`,
          color,
          padding: '2px 8px',
          borderRadius: '12px',
          border: `1px solid ${color}40`,
        }}>
          {node.score} PTS
        </span>
      </div>

      <div style={{
        fontSize: '10px',
        color: '#94a3b8',
        marginBottom: '12px',
        textTransform: 'uppercase',
        letterSpacing: '1px',
      }}>
        Cluster: {node.cluster}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {Object.entries(node.metrics).map(([key, val]) => (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span style={{ textTransform: 'capitalize', color: '#cbd5e1' }}>{key}</span>
              <span style={{
                fontWeight: '600',
                color: key === 'risk' ? '#ef4444' : '#10b981',
              }}>
                {val}%
              </span>
            </div>
            <div style={{
              width: '100%',
              height: '5px',
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${val}%`,
                height: '100%',
                backgroundColor: key === 'risk' ? '#ef4444' : color,
                borderRadius: '2px',
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
