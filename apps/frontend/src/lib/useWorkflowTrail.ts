import { useState, useCallback } from 'react';
import type { UInternalNode } from './bdtPolytopeData';

export interface BdtTrailAnchor {
  deptId: string;
  deptLabel: string;
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  internalPath: string[];
}

export interface BdtTrailStop {
  deptId: string;
  deptLabel: string;
  enteredVia: 'interrelated';
  internalPath: string[];
  nodeId?: string;
  nodeLabel?: string;
  nodeType?: string;
  visitedAt: string;        // ISO
}

export interface BdtWorkflowTrailSession {
  id: string;              // session uuid
  companyId: string;
  userId?: string;
  startedAt: string;
  anchor: BdtTrailAnchor;
  stops: BdtTrailStop[];   // ordered; does NOT include anchor as a stop
}

export function useWorkflowTrail() {
  const [trailSession, setTrailSession] = useState<BdtWorkflowTrailSession | null>(null);

  const startTrail = useCallback((
    companyId: string,
    userId: string | undefined,
    anchorDeptId: string,
    anchorDeptLabel: string,
    anchorNode: UInternalNode,
    anchorInternalPath: string[],
    targetDeptId: string,
    targetDeptLabel: string
  ) => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();

    const anchor: BdtTrailAnchor = {
      deptId: anchorDeptId,
      deptLabel: anchorDeptLabel,
      nodeId: anchorNode.id,
      nodeLabel: anchorNode.label,
      nodeType: anchorNode.type,
      internalPath: anchorInternalPath,
    };

    const firstStop: BdtTrailStop = {
      deptId: targetDeptId,
      deptLabel: targetDeptLabel,
      enteredVia: 'interrelated',
      internalPath: [],
      visitedAt: now,
    };

    setTrailSession({
      id: sessionId,
      companyId,
      userId,
      startedAt: now,
      anchor,
      stops: [firstStop],
    });
  }, []);

  const appendStop = useCallback((targetDeptId: string, targetDeptLabel: string) => {
    setTrailSession(prev => {
      if (!prev) return null;

      // Avoid duplicate depts back-to-back
      const lastStop = prev.stops[prev.stops.length - 1];
      if (lastStop && lastStop.deptId === targetDeptId) {
        return prev;
      }

      const newStop: BdtTrailStop = {
        deptId: targetDeptId,
        deptLabel: targetDeptLabel,
        enteredVia: 'interrelated',
        internalPath: [],
        visitedAt: new Date().toISOString(),
      };

      return {
        ...prev,
        stops: [...prev.stops, newStop],
      };
    });
  }, []);

  const undoLastStop = useCallback(() => {
    setTrailSession(prev => {
      if (!prev) return null;
      if (prev.stops.length <= 1) {
        // Can't undo further, session must cancel/clear if there is no stop
        return null;
      }
      return {
        ...prev,
        stops: prev.stops.slice(0, -1),
      };
    });
  }, []);

  const enrichCurrentStop = useCallback((node: UInternalNode, internalPath: string[]) => {
    setTrailSession(prev => {
      if (!prev || prev.stops.length === 0) return prev;

      const updatedStops = [...prev.stops];
      const lastIndex = updatedStops.length - 1;
      
      updatedStops[lastIndex] = {
        ...updatedStops[lastIndex],
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.type,
        internalPath,
      };

      return {
        ...prev,
        stops: updatedStops,
      };
    });
  }, []);

  const cancelTrail = useCallback(() => {
    setTrailSession(null);
  }, []);

  return {
    trailSession,
    isTrailActive: !!trailSession,
    startTrail,
    appendStop,
    undoLastStop,
    enrichCurrentStop,
    cancelTrail,
    setTrailSession,
  };
}
