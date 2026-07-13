import { create } from 'zustand';
import type { UInternalNode } from './universalPolytopeData';

interface DragState {
  isDragging: boolean;
  draggedNode: UInternalNode | null;
  nodeColor: string;
  pointerPos: { x: number; y: number };
  startDrag: (node: UInternalNode, color: string, x: number, y: number) => void;
  updatePointer: (x: number, y: number) => void;
  endDrag: () => void;
}

export const useDragWorkspaceStore = create<DragState>((set) => ({
  isDragging: false,
  draggedNode: null,
  nodeColor: '',
  pointerPos: { x: 0, y: 0 },
  startDrag: (node, color, x, y) => set({
    isDragging: true,
    draggedNode: node,
    nodeColor: color,
    pointerPos: { x, y }
  }),
  updatePointer: (x, y) => set({ pointerPos: { x, y } }),
  endDrag: () => set({ isDragging: false, draggedNode: null }),
}));
