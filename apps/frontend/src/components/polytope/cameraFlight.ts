import * as THREE from 'three';
import { gsap } from 'gsap';

/**
 * Orbital camera flights for the BDT focus transition.
 *
 * Tweening `camera.position` component-wise walks a straight chord through the
 * polytope: when the focused department sits to the side of (or behind) the
 * camera, the view lurches across the hull instead of swinging around to it.
 * These helpers interpolate the camera as an *orbit* — the offset direction is
 * slerped, the radius and the orbit target are lerped — so the camera visibly
 * rotates around the polytope and settles with the department centred.
 */

/** One live flight per camera; a new flight supersedes the previous one. */
const activeFlights = new WeakMap<THREE.Camera, gsap.core.Tween>();

export interface OrbitalFlightOptions {
  duration?: number;
  ease?: string;
  onComplete?: () => void;
}

/** Stop the in-flight orbital tween for this camera, if any. */
export function cancelOrbitalFlight(camera: THREE.Camera): void {
  const existing = activeFlights.get(camera);
  if (existing) {
    existing.kill();
    activeFlights.delete(camera);
  }
}

export function flyCameraOrbital(
  camera: THREE.Camera,
  orbit: { target: THREE.Vector3 },
  camPos: THREE.Vector3,
  orbitTarget: THREE.Vector3,
  { duration = 1.6, ease = 'power2.inOut', onComplete }: OrbitalFlightOptions = {},
): void {
  cancelOrbitalFlight(camera);
  gsap.killTweensOf(camera.position);
  gsap.killTweensOf(orbit.target);

  const startTarget = orbit.target.clone();
  const endTarget = orbitTarget.clone();
  const startOffset = camera.position.clone().sub(startTarget);
  const endOffset = camPos.clone().sub(endTarget);

  const startRadius = startOffset.length();
  const endRadius = endOffset.length();

  // A camera sitting on its own orbit target has no arc to follow — fall back
  // to a straight tween rather than slerping a zero-length direction.
  if (startRadius < 1e-4 || endRadius < 1e-4) {
    gsap.to(orbit.target, {
      x: endTarget.x, y: endTarget.y, z: endTarget.z,
      duration, ease,
    });
    gsap.to(camera.position, {
      x: camPos.x, y: camPos.y, z: camPos.z,
      duration, ease, onComplete,
    });
    return;
  }

  const startDir = startOffset.divideScalar(startRadius);
  const endDir = endOffset.divideScalar(endRadius);

  const arc = new THREE.Quaternion().setFromUnitVectors(startDir, endDir);
  const identity = new THREE.Quaternion();
  const frameQuat = new THREE.Quaternion();
  const frameDir = new THREE.Vector3();
  const progress = { t: 0 };

  const tween = gsap.to(progress, {
    t: 1,
    duration,
    ease,
    onUpdate: () => {
      const t = progress.t;
      frameQuat.copy(identity).slerp(arc, t);
      frameDir.copy(startDir).applyQuaternion(frameQuat);
      orbit.target.lerpVectors(startTarget, endTarget, t);
      camera.position
        .copy(orbit.target)
        .addScaledVector(frameDir, THREE.MathUtils.lerp(startRadius, endRadius, t));
    },
    onComplete: () => {
      activeFlights.delete(camera);
      onComplete?.();
    },
  });

  activeFlights.set(camera, tween);
}
