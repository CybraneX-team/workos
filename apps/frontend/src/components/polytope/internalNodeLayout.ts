import * as THREE from 'three';
import type { UInternalNode } from '../../lib/universalPolytopeData';

/** How far the internal ring floats outward from its department vertex. */
export const INTERNAL_RING_DEPTH_STEP = 3.0;

/** Radius of the internal ring — widens as more siblings share the orbit. */
export function internalRingRadius(totalNodeCount: number): number {
  return 1.8 * Math.max(1, Math.sqrt(totalNodeCount / 4));
}

/** World position for an internal node ring slot (must match ExternalNode layout). */
export function computeInternalNodePosition(
  deptPos: THREE.Vector3,
  nodeIndex: number,
  totalNodeCount: number,
  layoutMode: 'radial' | 'flat' = 'radial'
): THREE.Vector3 {
  if (totalNodeCount <= 0) return deptPos.clone();

  const angle = (nodeIndex / totalNodeCount) * Math.PI * 2;
  const isFlat = layoutMode === 'flat';

  const dir = isFlat ? new THREE.Vector3(0, 0, 1) : deptPos.clone().normalize();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();

  if (isFlat) {
    right.set(1, 0, 0);
    up.set(0, 1, 0);
  } else {
    let localUp = new THREE.Vector3(0, 1, 0);
    if (Math.abs(dir.dot(localUp)) > 0.99) localUp.set(1, 0, 0);
    right.crossVectors(dir, localUp).normalize();
    up.crossVectors(right, dir).normalize();
  }

  const depthStep = isFlat ? 0.5 : INTERNAL_RING_DEPTH_STEP;
  // Widen ring as more siblings share the orbit (e.g. 6 BDT branch nodes).
  const radius = isFlat ? 4.0 : internalRingRadius(totalNodeCount);
  const childCenter = deptPos.clone().add(dir.clone().multiplyScalar(depthStep));

  return childCenter
    .clone()
    .add(right.clone().multiplyScalar(Math.cos(angle) * radius))
    .add(up.clone().multiplyScalar(Math.sin(angle) * radius));
}

/** Position for a draft node that will be appended (index = existingCount, total = existing + 1). */
export function computeDraftInternalNodePosition(
  deptPos: THREE.Vector3,
  existingInternalCount: number,
): THREE.Vector3 {
  const total = existingInternalCount + 1;
  return computeInternalNodePosition(deptPos, existingInternalCount, total);
}

export function findNodeAtPath(nodes: UInternalNode[], path: string[]): UInternalNode | null {
  if (path.length === 0) return null;
  const node = nodes.find(n => n.id === path[0]);
  if (!node) return null;
  if (path.length === 1) return node;
  return findNodeAtPath(node.children ?? [], path.slice(1));
}

/** True when every id in path exists under the department's internal tree. */
export function isValidInternalPath(nodes: UInternalNode[], path: string[]): boolean {
  let current = nodes;
  for (const id of path) {
    const node = current.find(n => n.id === id);
    if (!node) return false;
    current = node.children ?? [];
  }
  return true;
}

export function computeDraftChildNodePosition(
  parentPos: THREE.Vector3,
  existingCount: number,
  depth: number,
  rootPos?: THREE.Vector3
): THREE.Vector3 {
  const count = existingCount + 1;
  const idx = existingCount;
  const ringRadius = 1.4 * Math.pow(0.7, depth - 1);

  const effectiveRoot = rootPos || new THREE.Vector3(0, 0, 0);
  const offset = parentPos.clone().sub(effectiveRoot);
  const dir = offset.lengthSq() > 0.0001 ? offset.normalize() : new THREE.Vector3(0, 0, 1);

  const localUp = new THREE.Vector3(0, 1, 0);
  if (Math.abs(dir.dot(localUp)) > 0.99) localUp.set(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(dir, localUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();

  const depthStep = 3.0;
  const childCenter = parentPos.clone().add(dir.clone().multiplyScalar(depthStep));

  const angle = (idx / count) * Math.PI * 2;
  return childCenter.clone()
    .add(right.clone().multiplyScalar(Math.cos(angle) * ringRadius))
    .add(up.clone().multiplyScalar(Math.sin(angle) * ringRadius));
}

/**
 * Plain framing: camera pulled back along `dir` with a subtle upward tilt,
 * looking straight at `targetPos` so it lands on screen centre.
 *
 * Note `shiftRightAmount` moves camera and orbit target together, which does
 * not reframe the subject — it slides it off screen centre by that distance.
 * Its basis vector is also `cross(dir, worldUp)`, the opposite of the
 * `cross(worldUp, dir)` three.js treats as screen-right, so positive values
 * push the subject left. Pass 0 to centre.
 */
export function frameNodeView(
  targetPos: THREE.Vector3,
  dir: THREE.Vector3,
  distance: number,
  shiftRightAmount: number = 0
): { camPos: THREE.Vector3; orbitTarget: THREE.Vector3 } {
  let localUp = new THREE.Vector3(0, 1, 0);
  if (Math.abs(dir.dot(localUp)) > 0.99) localUp.set(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(dir, localUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();

  // Subtle upward tilt angle so the node is framed at a cinematic 3D angle
  const tiltOffset = up.clone().multiplyScalar(distance * 0.14);
  const camPos = targetPos.clone().add(dir.clone().multiplyScalar(distance)).add(tiltOffset);
  const orbitTarget = targetPos.clone();

  if (shiftRightAmount !== 0) {
    const shiftVec = right.clone().multiplyScalar(shiftRightAmount);
    camPos.add(shiftVec);
    orbitTarget.add(shiftVec);
  }

  return { camPos, orbitTarget };
}

/**
 * Distance at which an internal ring of `nodeCount` nodes fills `fill` of the
 * viewport's shorter half-axis. Replaces guessing the pull-back from the node
 * count alone, which left small rings distant and large rings overflowing.
 */
export function ringFitDistance(
  nodeCount: number,
  vFovDeg: number,
  aspect: number,
  fill: number,
): number {
  const tanHalf = Math.tan((vFovDeg / 2) * (Math.PI / 180)) * Math.min(1, aspect);
  return INTERNAL_RING_DEPTH_STEP + internalRingRadius(nodeCount) / (tanHalf * fill);
}

export function computeCameraFraming(
  targetPos: THREE.Vector3,
  dir: THREE.Vector3,
  childrenCount: number,
  baseZoomDist: number,
  shiftRightAmount: number = 0
): { camPos: THREE.Vector3; orbitTarget: THREE.Vector3 } {
  if (childrenCount !== 2) {
    return frameNodeView(targetPos, dir, baseZoomDist, shiftRightAmount);
  }

  let localUp = new THREE.Vector3(0, 1, 0);
  if (Math.abs(dir.dot(localUp)) > 0.99) localUp.set(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(dir, localUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();

  let camPos: THREE.Vector3;
  let orbitTarget: THREE.Vector3;

  {
    const ratio = baseZoomDist / 10.0;
    const dist = baseZoomDist * 0.75;
    const upShift = -2.2 * ratio;
    const orbitUp = 1.0 * ratio;

    camPos = targetPos.clone()
      .add(dir.clone().multiplyScalar(dist))
      .add(up.clone().multiplyScalar(upShift));
    
    orbitTarget = targetPos.clone().add(up.clone().multiplyScalar(orbitUp));
  }

  if (shiftRightAmount !== 0) {
    const shiftVec = right.clone().multiplyScalar(shiftRightAmount);
    camPos.add(shiftVec);
    orbitTarget.add(shiftVec);
  }

  return { camPos, orbitTarget };
}

/** Pull camera back when a department has many first-level internal nodes. */
export function deptZoomDistance(internalCount: number, base = 10): number {
  return base + Math.max(0, internalCount - 4) * 1.4;
}
