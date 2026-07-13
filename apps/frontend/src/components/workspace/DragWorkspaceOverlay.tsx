import { useEffect, useState, useRef } from 'react';
import { useDragWorkspaceStore } from '../../lib/useDragWorkspaceStore';
import { useSavedWorkflows } from '../../lib/useSavedWorkflows';
import { BookmarkPlus, CheckCircle2 } from 'lucide-react';
import type { CompanyPlanetContext } from '../../data/companyPlanetRoots';
import type { UExternalNode } from '../../lib/universalPolytopeData';

export interface DragWorkspaceOverlayProps {
  planetContext: CompanyPlanetContext | null;
  activeRootDept: UExternalNode | null;
  internalPath: string[];
}

export function DragWorkspaceOverlay({ planetContext, activeRootDept, internalPath }: DragWorkspaceOverlayProps) {
  const { isDragging, draggedNode, pointerPos, nodeColor, updatePointer, endDrag } = useDragWorkspaceStore();
  const { save } = useSavedWorkflows();
  const [isHoveringDropZone, setIsHoveringDropZone] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updatePointer(e.clientX, e.clientY);
      if (dropZoneRef.current) {
        const rect = dropZoneRef.current.getBoundingClientRect();
        setIsHoveringDropZone(
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        );
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      let droppedInZone = false;
      if (dropZoneRef.current) {
        const rect = dropZoneRef.current.getBoundingClientRect();
        droppedInZone = (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        );
      }

      if (droppedInZone && draggedNode && planetContext && activeRootDept) {
        // Build the save context
        const branchId = internalPath[0];
        const rootLabel = activeRootDept.label;
        const rootColor = nodeColor;
        
        let level: 'root' | 'branch' | 'action' = 'action';
        let actionId = draggedNode.id;
        
        if (!branchId) {
          level = 'branch';
        }

        save({
          companyId: planetContext.companyId,
          companyName: planetContext.companyName,
          role: planetContext.role,
          roleLabel: planetContext.roleLabel,
          rootId: activeRootDept.id,
          rootLabel,
          rootColor,
          level,
          branchId: branchId || draggedNode.id,
          actionId: actionId,
          actionLabel: draggedNode.label,
        });

        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2000);
      }
      
      endDrag();
      setIsHoveringDropZone(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, draggedNode, nodeColor, planetContext, activeRootDept, internalPath, updatePointer, endDrag, save]);

  if (!isDragging && !justSaved) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[100]">
      {/* Drop Zone Pop-up */}
      <div 
        ref={dropZoneRef}
        className="absolute top-1/2 right-8 -translate-y-1/2 pointer-events-auto transition-all duration-300"
        style={{
          opacity: isDragging || justSaved ? 1 : 0,
          transform: `translateY(-50%) ${isDragging || justSaved ? 'translateX(0)' : 'translateX(100px)'}`,
        }}
      >
        <div
          className={`flex flex-col items-center justify-center p-8 rounded-3xl border-2 transition-all duration-300 ${
            justSaved ? 'scale-110 border-green-500/50 bg-green-500/10' :
            isHoveringDropZone ? 'scale-105 border-[#C1AEFF] bg-white/10' : 'border-white/20 bg-black/60'
          }`}
          style={{
            backdropFilter: 'blur(16px)',
            width: '240px',
            height: '240px',
            boxShadow: isHoveringDropZone ? '0 0 40px rgba(193,174,255,0.3)' : '0 10px 40px rgba(0,0,0,0.5)',
          }}
        >
          {justSaved ? (
            <>
              <CheckCircle2 className="w-16 h-16 text-green-400 mb-4 animate-bounce" />
              <p className="text-white font-bold text-lg">Saved!</p>
            </>
          ) : (
            <>
              <BookmarkPlus 
                className={`w-12 h-12 mb-4 transition-all duration-300 ${isHoveringDropZone ? 'text-[#C1AEFF] scale-110' : 'text-white/50'}`} 
              />
              <p className="text-white font-semibold text-center mb-2">Save to Workspace</p>
              <p className="text-white/40 text-xs text-center border border-white/10 px-3 py-1.5 rounded-full">
                Drop node here
              </p>
            </>
          )}
        </div>
      </div>

      {/* Floating 2D Orb (Cursor proxy) */}
      {isDragging && draggedNode && (
        <div
          className="absolute rounded-full flex items-center justify-center text-white text-xs font-bold whitespace-nowrap pointer-events-none transition-transform duration-75"
          style={{
            left: pointerPos.x,
            top: pointerPos.y,
            transform: 'translate(-50%, -50%)',
            width: '40px',
            height: '40px',
            background: nodeColor,
            boxShadow: `0 0 30px ${nodeColor}, inset 0 0 10px rgba(255,255,255,0.8)`,
            border: '2px solid rgba(255,255,255,0.5)',
          }}
        >
          {/* Subtle label tooltip underneath */}
          <div className="absolute top-full mt-3 bg-black/80 px-3 py-1 rounded-full border border-white/20 backdrop-blur-md">
            {draggedNode.label}
          </div>
        </div>
      )}
    </div>
  );
}
