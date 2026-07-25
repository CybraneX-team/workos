import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { BookOpen, BarChart2, Activity, Users, FileText, Target, SquarePen, Trash2, Check, Plus, Sparkles } from 'lucide-react';

import type { PlanetRootNode, PlanetBranchNode, PlanetBranchNodeType } from '../../data/companyPlanetRoots';
import { PLANET_BRANCH_TYPE_LABELS } from '../../data/companyPlanetRoots';

/**
 * IDT-only root-focus visualization: the selected root sits at the center like a
 * core, connected by glowing sinusoidal wave lines to floating branch info cards
 * and parent-attached user note cards.
 */

const CARD_DEPTH_STEP = 0.6;
const WAVE_SEGMENTS = 48;

const CARD_COLUMN_X = 5.6;
const CARD_ROW_GAP = 3.6;

function computeCardPosition(rootPos: THREE.Vector3, index: number, count: number): THREE.Vector3 {
  const leftCount = Math.ceil(count / 2);
  const isLeft = index < leftCount;
  const rowIndex = isLeft ? index : index - leftCount;
  const rowCount = isLeft ? leftCount : count - leftCount;

  const x = (isLeft ? -1 : 1) * CARD_COLUMN_X;
  const y = (rowIndex - (rowCount - 1) / 2) * CARD_ROW_GAP;

  return rootPos
    .clone()
    .add(new THREE.Vector3(0, 0, CARD_DEPTH_STEP))
    .add(new THREE.Vector3(x, y, 0));
}

const NODE_TYPE_ICON: Record<PlanetBranchNodeType, React.ComponentType<{ style?: React.CSSProperties }>> = {
  information: BookOpen,
  metric: BarChart2,
  signal: Activity,
  relationship: Users,
  evidence: FileText,
  decision: Target,
};

/* ──────────────────────────────────────────────────
   User-Specific Root Notes Persistence (Branch-Attached)
────────────────────────────────────────────────── */
export interface UserRootNote {
  id: string;
  rootId: string;
  parentCardId: string; // The branch.id or parent note.id this note is attached to
  title: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export function getUserNotesStorageKey(userId: string, rootId: string): string {
  return `idt_user_root_notes_v3:${userId}:${rootId}`;
}

export function loadUserRootNotes(userId: string, rootId: string): UserRootNote[] {
  try {
    const raw = localStorage.getItem(getUserNotesStorageKey(userId, rootId));
    return raw ? (JSON.parse(raw) as UserRootNote[]) : [];
  } catch {
    return [];
  }
}

export function saveUserRootNotes(userId: string, rootId: string, notes: UserRootNote[]): void {
  try {
    localStorage.setItem(getUserNotesStorageKey(userId, rootId), JSON.stringify(notes));
  } catch {
    /* quota full */
  }
}

interface WaveLineProps {
  rootPos: THREE.Vector3;
  cardPos: THREE.Vector3;
  color: string;
  expandProgressRef: React.MutableRefObject<number>;
  onClick?: () => void;
  noteTooltip?: { title: string; text: string } | null;
  hidden?: boolean;
}

function WaveLine({ rootPos, cardPos, color, expandProgressRef, onClick, noteTooltip, hidden }: WaveLineProps) {
  const { camera, size } = useThree();
  const [hovered, setHovered] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const hitMeshRef = useRef<THREE.Mesh>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array((WAVE_SEGMENTS + 1) * 3);
    for (let i = 0; i <= WAVE_SEGMENTS; i++) {
      const t = i / WAVE_SEGMENTS;
      const p = rootPos.clone().lerp(cardPos, t);
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lineObj = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: color || '#c8d6e5', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const line = new THREE.Line(geo, mat);
    // This line's geometry is mutated every frame (animated bezier curve) and
    // three.js's default Line.raycast() is not safe against that — clicking
    // directly on it could hit a degenerate/stale-bounding-sphere edge case
    // and throw uncaught inside the R3F pointer-event pipeline, which (with no
    // error boundary around the canvas) blanks the whole screen. The line is
    // purely decorative; a separate static hit-mesh below handles clicks/hover.
    line.raycast = () => {};
    return line;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  useEffect(() => () => {
    lineObj.geometry.dispose();
    (lineObj.material as THREE.LineBasicMaterial).dispose();
  }, [lineObj]);

  useFrame(() => {
    if (hidden) {
      (lineObj.material as THREE.LineBasicMaterial).opacity = 0;
      return;
    }
    const distance = camera.position.distanceTo(cardPos);
    const vFov = ((camera as THREE.PerspectiveCamera).fov ?? 45) * (Math.PI / 180);
    const worldHeightAtDist = 2 * Math.tan(vFov / 2) * distance;
    const worldPerPixel = worldHeightAtDist / Math.max(size.height, 1);
    const halfWidthWorld = 130 * worldPerPixel; // 260px card width / 2 = 130px

    const isLeft = cardPos.x < rootPos.x;
    const anchorPos = cardPos.clone();
    if (isLeft) {
      anchorPos.x += halfWidthWorld;
    } else {
      anchorPos.x -= halfWidthWorld;
    }

    const ctrlDist = Math.max(Math.abs(anchorPos.x - rootPos.x) * 0.45, 1.2);
    const p0 = rootPos.clone();
    const p1 = rootPos.clone().add(new THREE.Vector3(isLeft ? -ctrlDist : ctrlDist, 0, 0));
    const p2 = anchorPos.clone().add(new THREE.Vector3(isLeft ? ctrlDist : -ctrlDist, 0, 0));
    const p3 = anchorPos.clone();

    for (let i = 0; i <= WAVE_SEGMENTS; i++) {
      const t = i / WAVE_SEGMENTS;
      const oneMinusT = 1 - t;
      const oneMinusT2 = oneMinusT * oneMinusT;
      const oneMinusT3 = oneMinusT2 * oneMinusT;
      const t2 = t * t;
      const t3 = t2 * t;

      const p = p0.clone().multiplyScalar(oneMinusT3)
        .addScaledVector(p1, 3 * oneMinusT2 * t)
        .addScaledVector(p2, 3 * oneMinusT * t2)
        .addScaledVector(p3, t3);

      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }

    const attr = lineObj.geometry.attributes.position as THREE.BufferAttribute;
    attr.needsUpdate = true;

    const mat = lineObj.material as THREE.LineBasicMaterial;
    const baseTarget = 0.65 * expandProgressRef.current;
    const target = hidden ? 0 : (hovered ? Math.min(baseTarget * 1.5, 0.95) : baseTarget);
    mat.opacity = THREE.MathUtils.lerp(mat.opacity, target, 0.12);
    mat.color.set(color || '#c8d6e5');

    // Invisible click/hover hit-target: a plain straight cylinder from root to
    // the card anchor. Only its transform changes per frame (no vertex-buffer
    // mutation), so its raycast stays on the standard, safe THREE.Mesh path.
    if (hitMeshRef.current) {
      const dir = anchorPos.clone().sub(rootPos);
      const len = dir.length();
      const mid = rootPos.clone().add(anchorPos).multiplyScalar(0.5);
      hitMeshRef.current.position.copy(mid);
      hitMeshRef.current.scale.set(1, Math.max(len, 0.0001), 1);
      if (len > 0.0001) {
        hitMeshRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      }
    }
  });

  if (hidden) return null;

  return (
    <group>
      <primitive object={lineObj} />
      <mesh
        ref={hitMeshRef}
        onPointerOver={(e: any) => {
          e.stopPropagation();
          setHovered(true);
          setCursorPos({ x: e.clientX, y: e.clientY });
          document.body.style.cursor = 'pointer';
        }}
        onPointerMove={(e: any) => {
          setCursorPos({ x: e.clientX, y: e.clientY });
        }}
        onPointerOut={() => {
          setHovered(false);
          setCursorPos(null);
          document.body.style.cursor = 'auto';
        }}
        onClick={(e: any) => {
          e.stopPropagation();
          onClick?.();
        }}
      >
        <cylinderGeometry args={[0.7, 0.7, 1, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
      </mesh>
      {hovered && noteTooltip && cursorPos && (
        <Html
          calculatePosition={() => [0, 0, 0]}
          style={{
            position: 'fixed',
            left: cursorPos.x + 14,
            top: cursorPos.y + 14,
            pointerEvents: 'none',
            zIndex: 99999,
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(18, 14, 28, 0.95)',
              border: `1px solid ${color || '#c8d6e5'}88`,
              boxShadow: `0 8px 24px rgba(0,0,0,0.85), 0 0 16px ${color || '#c8d6e5'}44`,
              color: '#ffffff',
              pointerEvents: 'none',
              maxWidth: 240,
              backdropFilter: 'blur(10px)',
              fontFamily: 'Asta Sans, sans-serif, system-ui',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: color || '#c8d6e5', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {noteTooltip.title}
            </div>
            <div style={{ fontSize: 11, color: '#d1d5db', lineHeight: '15px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {noteTooltip.text || 'Empty note — click line to view narrative'}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

interface BranchCardProps {
  branch: PlanetBranchNode;
  pos: THREE.Vector3;
  rootPos: THREE.Vector3;
  color: string;
  delayMs: number;
  hidden?: boolean;
  /** World position to animate toward when this card is the narrative focus (or
   *  null when not focused). Relative to rootPos — never an absolute coordinate. */
  focusPos?: THREE.Vector3 | null;
  /** Shared 0→1 progress, driven by GSAP in the parent and read every frame here. */
  focusProgressRef?: React.MutableRefObject<number>;
  isActiveFocus?: boolean;
  onSelect: () => void;
  onAddNote?: (parentCardId: string, parentLabel?: string) => void;
}

function BranchCard({ branch, pos, rootPos, color, delayMs, hidden = false, focusPos = null, focusProgressRef, isActiveFocus = false, onSelect, onAddNote }: BranchCardProps) {
  const { camera, size } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [isLeft, setIsLeft] = useState(() => pos.x < rootPos.x);
  const restPosRef = useRef<THREE.Vector3 | null>(null);

  const hoverTimerRef = useRef<number | null>(null);

  // Smoothly animate this card toward focusPos and back, driven every frame —
  // not a one-shot value read at React-render time, which never updates once
  // GSAP starts mutating focusProgressRef.current outside React's render cycle.
  useFrame(() => {
    if (!groupRef.current || dragging || !focusProgressRef) return;
    const progress = focusProgressRef.current;
    if (focusPos && (isActiveFocus || progress > 0.001)) {
      if (!restPosRef.current) restPosRef.current = pos.clone();
      const desired = restPosRef.current.clone().lerp(focusPos, progress);
      pos.copy(desired);
      groupRef.current.position.copy(desired);
      const nextIsLeft = desired.x < rootPos.x;
      setIsLeft(prev => (prev !== nextIsLeft ? nextIsLeft : prev));
    } else if (restPosRef.current) {
      restPosRef.current = null;
    }
  });

  const handleMouseEnter = useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = window.setTimeout(() => {
      setHovered(false);
    }, 180);
  }, []);

  useEffect(() => {
    setIsLeft(pos.x < rootPos.x);
  }, [pos.x, rootPos.x]);

  const dragRef = useRef<{
    startClientX: number; startClientY: number;
    startPos: THREE.Vector3; moved: boolean;
    right: THREE.Vector3; up: THREE.Vector3; worldPerPixel: number;
  } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs]);

  if (hidden) return null;

  const handlePointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('textarea')) {
      return;
    }

    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const distance = camera.position.distanceTo(pos);
    const vFov = ((camera as THREE.PerspectiveCamera).fov ?? 45) * (Math.PI / 180);
    const worldHeightAtDist = 2 * Math.tan(vFov / 2) * distance;
    const worldPerPixel = worldHeightAtDist / Math.max(size.height, 1);

    dragRef.current = {
      startClientX: e.clientX, startClientY: e.clientY,
      startPos: pos.clone(), moved: false,
      right, up, worldPerPixel,
    };
    setDragging(true);
  };

  const handlePointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;

    const worldDX = dx * drag.worldPerPixel;
    const worldDY = -dy * drag.worldPerPixel;

    const next = drag.startPos.clone()
      .add(drag.right.clone().multiplyScalar(worldDX))
      .add(drag.up.clone().multiplyScalar(worldDY));

    pos.copy(next);
    groupRef.current?.position.copy(next);

    const nextIsLeft = pos.x < rootPos.x;
    setIsLeft(prev => (prev !== nextIsLeft ? nextIsLeft : prev));
  };

  const handlePointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    setDragging(false);
    const wasDragged = drag.moved;
    dragRef.current = null;
    if (!wasDragged) onSelect();
  };

  const Icon = NODE_TYPE_ICON[branch.nodeType] ?? BookOpen;
  const typeLabel = PLANET_BRANCH_TYPE_LABELS[branch.nodeType];
  const displayTypeLabel = branch.nodeType === 'information' ? 'Info' : typeLabel;
  const summary = branch.summary ?? branch.actions[0]?.hint ?? null;

  const anchorStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%) rotate(45deg)',
    width: 9,
    height: 9,
    background: color,
    border: '1.5px solid rgba(255, 255, 255, 0.95)',
    borderRadius: 1,
    boxShadow: `0 0 10px ${color}, 0 0 6px ${color}cc`,
    pointerEvents: 'none',
    zIndex: 10,
  };
  if (isLeft) {
    anchorStyle.right = -5;
  } else {
    anchorStyle.left = -5;
  }

  const astaFont = 'Asta Sans, sans-serif, system-ui';

  return (
    <group ref={groupRef} position={pos}>
      <Html center zIndexRange={[100, 0]}>
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{
            position: 'relative',
            boxSizing: 'border-box',
            width: 260,
            height: 'auto',
            padding: 6,
            borderRadius: 12,
            cursor: dragging ? 'grabbing' : 'grab',
            background: 'rgba(12, 12, 22, 0.72)',
            backdropFilter: 'blur(16px) saturate(180%)',
            WebkitBackdropFilter: 'blur(16px) saturate(180%)',
            border: `1px solid ${hovered ? `${color}bb` : 'rgba(255, 255, 255, 0.12)'}`,
            boxShadow: hovered
              ? `0 20px 50px rgba(0,0,0,0.85), 0 0 32px ${color}44, inset 0 1px 0 rgba(255, 255, 255, 0.25)`
              : '0 16px 40px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            opacity: mounted ? 1 : 0,
            transform: `scale(${hovered && !dragging ? 1.03 : mounted ? 1 : 0.85}) translateY(${mounted ? 0 : 10}px)`,
            transition: dragging
              ? 'none'
              : 'opacity 0.5s ease, transform 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s ease, border-color 0.25s ease',
            pointerEvents: mounted ? 'auto' : 'none',
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          {/* Connection Anchor Diamond (Rhombus) */}
          <div style={anchorStyle} />

          {/* Plus (+) Action Button popping up on the outer side with hit-bridge */}
          <div
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: '50%',
              ...(isLeft
                ? { left: -42, paddingRight: 16 }
                : { right: -42, paddingLeft: 16 }),
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 44,
              zIndex: 25,
              pointerEvents: hovered ? 'auto' : 'none',
            }}
          >
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onAddNote?.(branch.id, branch.label);
              }}
              title="Add Note connected to this card"
              style={{
                transform: hovered ? 'scale(1)' : 'scale(0.8)',
                opacity: hovered ? 1 : 0,
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: 'rgba(18, 18, 18, 0.95)',
                border: `1.5px solid ${color}bb`,
                boxShadow: `0 0 14px ${color}66, 0 4px 12px rgba(0, 0, 0, 0.6)`,
                color: color,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                transition: 'opacity 0.2s ease, transform 0.2s ease, background 0.2s ease, border-color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `${color}33`;
                e.currentTarget.style.borderColor = color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(18, 18, 18, 0.95)';
                e.currentTarget.style.borderColor = `${color}bb`;
              }}
            >
              <Plus style={{ width: 14, height: 14, strokeWidth: 2.5 }} />
            </button>
          </div>

          {/* Frame 10: Header Row */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              padding: '2px 6px',
              gap: 8,
              height: 24,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                display: 'grid',
                placeItems: 'center',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.05)',
                flexShrink: 0,
              }}
            >
              <Icon style={{ width: 11, height: 11, color: 'rgba(255, 255, 255, 0.5)' }} />
            </div>
            <span
              style={{
                fontSize: 14,
                lineHeight: '17px',
                fontWeight: 500,
                color: 'rgba(255, 255, 255, 0.55)',
                fontFamily: astaFont,
              }}
            >
              {displayTypeLabel}
            </span>
          </div>

          {/* Inner Body Frame ("icon") */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '14px 14px 10px',
              gap: 12,
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: 8,
            }}
          >
            {/* Frame 11: Title & Body */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 8,
                width: '100%',
              }}
            >
              {/* Title */}
              <div
                style={{
                  fontSize: 14,
                  lineHeight: '18px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  fontFamily: astaFont,
                  wordBreak: 'break-word',
                  letterSpacing: '-0.01em',
                }}
              >
                {branch.label}
              </div>

              {/* Description / Summary */}
              {summary && (
                <div
                  style={{
                    fontSize: 13.5,
                    lineHeight: '19px',
                    fontWeight: 400,
                    color: 'rgba(255, 255, 255, 0.88)',
                    fontFamily: astaFont,
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {summary}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                width: '100%',
                textAlign: 'center',
                fontSize: 12,
                lineHeight: '15px',
                fontWeight: 400,
                color: 'rgba(255, 255, 255, 0.45)',
                fontFamily: astaFont,
                marginTop: 4,
              }}
            >
              Actions : tap to chat . drag to move
            </div>
          </div>
        </div>
      </Html>
    </group>
  );
}

interface NoteCardProps {
  note: UserRootNote;
  pos: THREE.Vector3;
  rootPos: THREE.Vector3;
  color: string;
  delayMs: number;
  isInitialEditing?: boolean;
  hidden?: boolean;
  focusPos?: THREE.Vector3 | null;
  focusProgressRef?: React.MutableRefObject<number>;
  isActiveFocus?: boolean;
  onSave: (noteId: string, title: string, text: string) => void;
  onDelete: (noteId: string) => void;
  onAddNote?: (parentCardId: string, parentLabel?: string) => void;
  onAiSelect?: (parentCardId: string) => void;
  onFinish?: () => void;
}

function NoteCard({ note, pos, rootPos, color, delayMs, isInitialEditing = false, hidden = false, focusPos = null, focusProgressRef, isActiveFocus = false, onSave, onDelete, onAddNote, onAiSelect }: NoteCardProps) {
  const { camera, size } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(isInitialEditing || !note.text);
  const [isSkeleton, setIsSkeleton] = useState(isInitialEditing);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [titleDraft, setTitleDraft] = useState(note.title || 'Note');
  const [textDraft, setTextDraft] = useState(note.text || '');
  const [isLeft, setIsLeft] = useState(() => pos.x < rootPos.x);
  const restPosRef = useRef<THREE.Vector3 | null>(null);

  const hoverTimerRef = useRef<number | null>(null);

  useFrame(() => {
    if (!groupRef.current || dragging || !focusProgressRef) return;
    const progress = focusProgressRef.current;
    if (focusPos && (isActiveFocus || progress > 0.001)) {
      if (!restPosRef.current) restPosRef.current = pos.clone();
      const desired = restPosRef.current.clone().lerp(focusPos, progress);
      pos.copy(desired);
      groupRef.current.position.copy(desired);
      const nextIsLeft = desired.x < rootPos.x;
      setIsLeft(prev => (prev !== nextIsLeft ? nextIsLeft : prev));
    } else if (restPosRef.current) {
      restPosRef.current = null;
    }
  });

  const handleMouseEnter = useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = window.setTimeout(() => {
      setHovered(false);
    }, 180);
  }, []);

  useEffect(() => {
    setIsLeft(pos.x < rootPos.x);
  }, [pos.x, rootPos.x]);

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs]);

  useEffect(() => {
    if (isSkeleton) {
      const t = window.setTimeout(() => setIsSkeleton(false), 380);
      return () => window.clearTimeout(t);
    }
  }, [isSkeleton]);

  useEffect(() => {
    if (isEditing && !isSkeleton) {
      window.setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isEditing, isSkeleton]);

  const dragRef = useRef<{
    startClientX: number; startClientY: number;
    startPos: THREE.Vector3; moved: boolean;
    right: THREE.Vector3; up: THREE.Vector3; worldPerPixel: number;
  } | null>(null);

  // Was previously declared after `if (hidden) return null` below — a real
  // Rules-of-Hooks violation, since `hidden` toggles constantly during
  // narrative-focus mode, making this component call one fewer hook on every
  // render where it's hidden. That's exactly what threw "Rendered fewer hooks
  // than expected" here. Every hook must be declared before any early return.
  const handleCommitSave = useCallback(() => {
    const trimmedTitle = titleDraft.trim() || 'Note';
    const trimmedText = textDraft.trim();
    if (!trimmedText && !note.text) {
      onDelete(note.id);
      return;
    }
    onSave(note.id, trimmedTitle, trimmedText);
    setIsEditing(false);
  }, [note.id, note.text, titleDraft, textDraft, onSave, onDelete]);

  if (hidden) return null;

  const handlePointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('textarea')) {
      return;
    }

    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const distance = camera.position.distanceTo(pos);
    const vFov = ((camera as THREE.PerspectiveCamera).fov ?? 45) * (Math.PI / 180);
    const worldHeightAtDist = 2 * Math.tan(vFov / 2) * distance;
    const worldPerPixel = worldHeightAtDist / Math.max(size.height, 1);

    dragRef.current = {
      startClientX: e.clientX, startClientY: e.clientY,
      startPos: pos.clone(), moved: false,
      right, up, worldPerPixel,
    };
    setDragging(true);
  };

  const handlePointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;

    const worldDX = dx * drag.worldPerPixel;
    const worldDY = -dy * drag.worldPerPixel;

    const next = drag.startPos.clone()
      .add(drag.right.clone().multiplyScalar(worldDX))
      .add(drag.up.clone().multiplyScalar(worldDY));

    pos.copy(next);
    groupRef.current?.position.copy(next);

    const nextIsLeft = pos.x < rootPos.x;
    setIsLeft(prev => (prev !== nextIsLeft ? nextIsLeft : prev));
  };

  const handlePointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    setDragging(false);
    dragRef.current = null;
  };

  const anchorStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%) rotate(45deg)',
    width: 9,
    height: 9,
    background: color,
    border: '1.5px solid rgba(255, 255, 255, 0.95)',
    borderRadius: 1,
    boxShadow: `0 0 10px ${color}, 0 0 5px ${color}cc`,
    pointerEvents: 'none',
    zIndex: 10,
  };
  if (isLeft) {
    anchorStyle.right = -5;
  } else {
    anchorStyle.left = -5;
  }

  const astaFont = 'Asta Sans, sans-serif, system-ui';

  return (
    <group ref={groupRef} position={pos}>
      <Html center zIndexRange={[100, 0]}>
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{
            position: 'relative',
            boxSizing: 'border-box',
            width: 260,
            height: 'auto',
            padding: 6,
            borderRadius: 12,
            cursor: dragging ? 'grabbing' : 'grab',
            background: 'rgba(12, 12, 22, 0.72)',
            backdropFilter: 'blur(16px) saturate(180%)',
            WebkitBackdropFilter: 'blur(16px) saturate(180%)',
            border: `1px solid ${hovered || isEditing ? `${color}bb` : 'rgba(255, 255, 255, 0.12)'}`,
            boxShadow: hovered || isEditing
              ? `0 20px 50px rgba(0,0,0,0.85), 0 0 32px ${color}44, inset 0 1px 0 rgba(255, 255, 255, 0.25)`
              : '0 16px 40px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            opacity: mounted ? 1 : 0,
            transform: `scale(${hovered && !dragging ? 1.03 : mounted ? 1 : 0.82}) translate(${mounted ? '0px, 0px' : isLeft ? '20px, 10px' : '-20px, 10px'})`,
            transition: dragging
              ? 'none'
              : 'opacity 0.55s cubic-bezier(0.16,1,0.3,1), transform 0.55s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s ease, border-color 0.25s ease',
            pointerEvents: mounted ? 'auto' : 'none',
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          {/* Delete Confirmation Modal Overlay */}
          {showDeleteConfirm && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(18, 18, 22, 0.96)',
                borderRadius: 12,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 10,
                zIndex: 60,
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                boxShadow: '0 12px 32px rgba(0,0,0,0.85), 0 0 16px rgba(239, 68, 68, 0.25)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f87171', textAlign: 'center', fontFamily: astaFont }}>
                Delete Note?
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center', lineHeight: '15px', fontFamily: astaFont }}>
                Are you sure you want to delete this note?
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 6,
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    onDelete(note.id);
                  }}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 6,
                    background: '#ef4444',
                    border: 'none',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 0 12px rgba(239, 68, 68, 0.5)',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}

          {/* Connection Anchor Diamond (Rhombus - matches root color) */}
          <div style={anchorStyle} />

          {/* Plus (+) Action Button popping up on outer side with hit-bridge */}
          <div
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: '50%',
              ...(isLeft
                ? { left: -42, paddingRight: 16 }
                : { right: -42, paddingLeft: 16 }),
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 44,
              zIndex: 25,
              pointerEvents: hovered ? 'auto' : 'none',
            }}
          >
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onAddNote?.(note.id, note.title);
              }}
              title="Chain another note to this note card"
              style={{
                transform: hovered ? 'scale(1)' : 'scale(0.8)',
                opacity: hovered ? 1 : 0,
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: 'rgba(18, 18, 18, 0.95)',
                border: `1.5px solid ${color}bb`,
                boxShadow: `0 0 14px ${color}66, 0 4px 12px rgba(0, 0, 0, 0.6)`,
                color: color,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                transition: 'opacity 0.2s ease, transform 0.2s ease, background 0.2s ease, border-color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `${color}33`;
                e.currentTarget.style.borderColor = color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(18, 18, 18, 0.95)';
                e.currentTarget.style.borderColor = `${color}bb`;
              }}
            >
              <Plus style={{ width: 14, height: 14, strokeWidth: 2.5 }} />
            </button>
          </div>

          {isSkeleton ? (
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
              <div
                style={{
                  width: 110,
                  height: 16,
                  borderRadius: 4,
                  background: `${color}55`,
                  boxShadow: `0 0 10px ${color}44`,
                }}
              />
              <div
                style={{
                  width: '100%',
                  height: 72,
                  borderRadius: 6,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: `1px dashed ${color}55`,
                }}
              />
              <div style={{ width: '60%', height: 10, borderRadius: 3, background: 'rgba(255, 255, 255, 0.1)', marginTop: 4 }} />
            </div>
          ) : (
            <>
              {/* Header Row */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: '2px 6px',
                  gap: 8,
                  height: 24,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    display: 'grid',
                    placeItems: 'center',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    flexShrink: 0,
                  }}
                >
                  <SquarePen style={{ width: 11, height: 11, color: 'rgba(255, 255, 255, 0.5)' }} />
                </div>

                {isEditing ? (
                  <input
                    type="text"
                    value={titleDraft}
                    onChange={e => setTitleDraft(e.target.value)}
                    placeholder="Note"
                    style={{
                      fontSize: 14,
                      lineHeight: '17px',
                      fontWeight: 600,
                      color: '#FFFFFF',
                      fontFamily: astaFont,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      width: '120px',
                    }}
                  />
                ) : (
                  <span
                    style={{
                      fontSize: 14,
                      lineHeight: '17px',
                      fontWeight: 600,
                      color: '#FFFFFF',
                      fontFamily: astaFont,
                    }}
                  >
                    {note.title || 'Note'}
                  </span>
                )}

                {/* Action Buttons: Save / Edit / Delete */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isEditing ? (
                    <button
                      type="button"
                      onClick={handleCommitSave}
                      title="Save Note (Enter)"
                      style={{
                        display: 'grid',
                        placeItems: 'center',
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        background: 'rgba(34, 197, 94, 0.2)',
                        border: '1px solid rgba(34, 197, 94, 0.5)',
                        color: '#4ade80',
                        cursor: 'pointer',
                      }}
                    >
                      <Check style={{ width: 12, height: 12 }} />
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAiSelect?.(note.parentCardId);
                        }}
                        title="Ask AI about this note"
                        style={{
                          display: 'grid',
                          placeItems: 'center',
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          background: `${color}25`,
                          border: `1px solid ${color}66`,
                          color: color,
                          cursor: 'pointer',
                          transition: 'background 0.2s ease, border-color 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = `${color}44`;
                          e.currentTarget.style.borderColor = color;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = `${color}25`;
                          e.currentTarget.style.borderColor = `${color}66`;
                        }}
                      >
                        <Sparkles style={{ width: 11, height: 11 }} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(true);
                        }}
                        title="Delete Note"
                        style={{
                          display: 'grid',
                          placeItems: 'center',
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          color: '#f87171',
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 style={{ width: 11, height: 11 }} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Inner Body Frame */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '14px 14px 10px',
                  gap: 12,
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: 8,
                }}
              >
                {isEditing ? (
                  <textarea
                    ref={textareaRef}
                    value={textDraft}
                    onChange={e => setTextDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleCommitSave();
                      }
                    }}
                    onBlur={handleCommitSave}
                    placeholder="Type your thoughts or notes here... (⌘⏎ to save)"
                    rows={4}
                    style={{
                      width: '100%',
                      fontSize: 14,
                      lineHeight: '20px',
                      fontWeight: 400,
                      color: 'rgba(255, 255, 255, 0.88)',
                      fontFamily: astaFont,
                      background: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: 6,
                      padding: '8px 10px',
                      outline: 'none',
                      resize: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                ) : (
                  <div
                    onClick={() => setIsEditing(true)}
                    style={{
                      width: '100%',
                      fontSize: 14,
                      lineHeight: '20px',
                      fontWeight: 400,
                      color: 'rgba(255, 255, 255, 0.88)',
                      fontFamily: astaFont,
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                      cursor: 'pointer',
                      minHeight: '40px',
                    }}
                  >
                    {note.text || <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontStyle: 'italic' }}>Empty note — tap to edit</span>}
                  </div>
                )}

                {/* Footer */}
                <div
                  style={{
                    width: '100%',
                    textAlign: 'center',
                    fontSize: 12,
                    lineHeight: '15px',
                    fontWeight: 400,
                    color: 'rgba(255, 255, 255, 0.45)',
                    fontFamily: astaFont,
                    marginTop: 4,
                  }}
                >
                  Note · tap to edit · drag to move
                </div>
              </div>
            </>
          )}
        </div>
      </Html>
    </group>
  );
}

export interface RootFocusSpaceProps {
  root: PlanetRootNode;
  rootPos: THREE.Vector3;
  color: string;
  expandProgressRef: React.MutableRefObject<number>;
  onCardSelect: (branchId: string) => void;
  userId?: string;
  onNarrativeChange?: (isNarrative: boolean) => void;
  exitNarrativeTrigger?: number;
}

export function RootFocusSpace({ root, rootPos, color, expandProgressRef, onCardSelect, userId = 'local_user', onNarrativeChange, exitNarrativeTrigger }: RootFocusSpaceProps) {
  const [userNotes, setUserNotes] = useState<UserRootNote[]>(() => loadUserRootNotes(userId, root.id));
  const [narrativeParentId, setNarrativeParentId] = useState<string | null>(null);
  const [focusedBranchId, setFocusedBranchId] = useState<string | null>(null);

  const narrativeProgressRef = useRef(0);

  useEffect(() => {
    onNarrativeChange?.(narrativeParentId !== null);
  }, [narrativeParentId, onNarrativeChange]);

  useEffect(() => {
    if (exitNarrativeTrigger && exitNarrativeTrigger > 0) {
      setNarrativeParentId(null);
    }
  }, [exitNarrativeTrigger]);

  useEffect(() => {
    gsap.killTweensOf(narrativeProgressRef);
    if (narrativeParentId) {
      setFocusedBranchId(narrativeParentId);
      gsap.to(narrativeProgressRef, {
        current: 1,
        duration: 0.8,
        ease: 'power4.out',
      });
    } else if (focusedBranchId) {
      gsap.to(narrativeProgressRef, {
        current: 0,
        duration: 0.7,
        ease: 'power3.inOut',
        onComplete: () => setFocusedBranchId(null),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrativeParentId]);

  const exitNarrativeFocus = useCallback(() => {
    setNarrativeParentId(null);
  }, []);

  // Reload user-specific notes whenever root or userId changes
  useEffect(() => {
    setUserNotes(loadUserRootNotes(userId, root.id));
  }, [userId, root.id]);

  const handleAddNote = useCallback((parentCardId: string): string => {
    const noteId = `note-${Date.now()}`;
    const newNote: UserRootNote = {
      id: noteId,
      rootId: root.id,
      parentCardId,
      title: 'Note',
      text: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setUserNotes(prev => {
      const next = [...prev, newNote];
      saveUserRootNotes(userId, root.id, next);
      return next;
    });
    return noteId;
  }, [userId, root.id]);

  const handleSaveNote = useCallback((noteId: string, title: string, text: string) => {
    setUserNotes(prev => {
      const next = prev.map(n => n.id === noteId ? { ...n, title, text, updatedAt: Date.now() } : n);
      saveUserRootNotes(userId, root.id, next);
      return next;
    });
  }, [userId, root.id]);

  const handleDeleteNote = useCallback((noteId: string) => {
    setUserNotes(prev => {
      const next = prev.filter(n => n.id !== noteId && n.parentCardId !== noteId);
      saveUserRootNotes(userId, root.id, next);
      return next;
    });
  }, [userId, root.id]);

  const branches = root.branches;

  // Calculate position map for branch cards and attached note cards
  const { branchPositions, notePositionEntries } = useMemo(() => {
    const bPositions = branches.map((_, i) => computeCardPosition(rootPos, i, branches.length));
    const posMap = new Map<string, THREE.Vector3>();

    branches.forEach((b, i) => {
      posMap.set(b.id, bPositions[i]);
    });

    const entries: { note: UserRootNote; pos: THREE.Vector3; parentPos: THREE.Vector3 }[] = [];

    // Group notes by parentCardId to stack sibling notes attached to the same parent card
    const notesByParent = new Map<string, UserRootNote[]>();
    userNotes.forEach(n => {
      const list = notesByParent.get(n.parentCardId) || [];
      list.push(n);
      notesByParent.set(n.parentCardId, list);
    });

    notesByParent.forEach((notes, parentId) => {
      const parentPos = posMap.get(parentId) || rootPos;
      const isLeft = parentPos.x < rootPos.x;
      const offsetDistX = 14.0; // Keep note cards completely out of the initial screen view
      const rowGapY = 3.6;

      notes.forEach((n, idx) => {
        const x = parentPos.x + (isLeft ? -offsetDistX : offsetDistX);
        const y = parentPos.y + (idx - (notes.length - 1) / 2) * rowGapY;
        const nPos = new THREE.Vector3(x, y, parentPos.z);
        posMap.set(n.id, nPos);
        entries.push({ note: n, pos: nPos, parentPos });
      });
    });

    return { branchPositions: bPositions, notePositionEntries: entries };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root.id, branches.length, userNotes]);

  return (
    <group>

      {/* Wave Lines for Branch Cards (connecting core planet to branch cards) */}
      {branches.map((branch, i) => (
        <WaveLine
          key={`wave-${branch.id}`}
          rootPos={rootPos}
          cardPos={branchPositions[i]}
          color={color}
          expandProgressRef={expandProgressRef}
          hidden={narrativeParentId !== null}
          onClick={exitNarrativeFocus}
        />
      ))}

      {/* Wave Lines for Note Cards (connecting parent card to attached note card) */}
      {notePositionEntries.map(({ note, pos, parentPos }) => {
        const isHidden = narrativeParentId !== null && note.parentCardId !== narrativeParentId;
        return (
          <WaveLine
            key={`wave-note-${note.id}`}
            rootPos={parentPos}
            cardPos={pos}
            color={color}
            expandProgressRef={expandProgressRef}
            hidden={isHidden}
            noteTooltip={{ title: note.title || 'User Note', text: note.text }}
            onClick={() => setNarrativeParentId(note.parentCardId)}
          />
        );
      })}

      {/* Branch Cards — the focused one animates to a fixed spot to the left of
          root, root-relative (never an absolute world coordinate), so it lands
          wherever the camera is already framed regardless of this root's ring position. */}
      {branches.map((branch, i) => {
        const isHidden = narrativeParentId !== null && branch.id !== narrativeParentId;
        const isActiveFocus = focusedBranchId === branch.id;
        const focusPos = isActiveFocus ? rootPos.clone().add(new THREE.Vector3(-4.2, 0, 3.2)) : null;

        return (
          <BranchCard
            key={branch.id}
            branch={branch}
            pos={branchPositions[i]}
            rootPos={rootPos}
            color={color}
            delayMs={200 + i * 90}
            hidden={isHidden}
            focusPos={focusPos}
            focusProgressRef={narrativeProgressRef}
            isActiveFocus={isActiveFocus}
            onSelect={() => onCardSelect(branch.id)}
            onAddNote={(parentId) => {
              handleAddNote(parentId);
              setNarrativeParentId(parentId);
            }}
          />
        );
      })}

      {/* User Note Cards (attached to parent cards) — focused siblings keep their
          relative vertical stacking offset so multiple notes on the same branch
          stay legible instead of collapsing onto one spot. */}
      {notePositionEntries.map(({ note, pos, parentPos }) => {
        const isHidden = narrativeParentId !== null && note.parentCardId !== narrativeParentId;
        const isActiveFocus = focusedBranchId === note.parentCardId;
        const relativeY = pos.y - parentPos.y;
        const focusPos = isActiveFocus
          ? rootPos.clone().add(new THREE.Vector3(4.2, relativeY, 3.2))
          : null;

        return (
          <NoteCard
            key={note.id}
            note={note}
            pos={pos}
            rootPos={parentPos}
            color={color}
            delayMs={150}
            hidden={isHidden}
            focusPos={focusPos}
            focusProgressRef={narrativeProgressRef}
            isActiveFocus={isActiveFocus}
            isInitialEditing={!note.text}
            onSave={handleSaveNote}
            onDelete={handleDeleteNote}
            onAddNote={(parentId) => {
              handleAddNote(parentId);
              setNarrativeParentId(note.parentCardId);
            }}
            onAiSelect={onCardSelect}
          />
        );
      })}
    </group>
  );
}
