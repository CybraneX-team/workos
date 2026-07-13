// @ts-nocheck
/**
 * CameraController.js — Cinematic Camera System
 * 
 * Smooth zoom-based navigation:
 * - Scroll wheel = continuous zoom in/out
 * - Orbit controls with heavy damping for cinematic feel
 * - GSAP fly-to for click-based transitions
 * - Auto-rotation at galaxy level
 * - Zoom threshold detection for level transitions
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from 'gsap';

export const ZOOM_LEVELS = {
  GALAXY: 'galaxy',
  INDUSTRY: 'industry',
  SUBDOMAIN: 'subdomain',
  COMPANY: 'company',
  DEPARTMENT: 'department',
};

/** Canonical view direction for industry/subdomain workspace landing (matches snapTo). */
const LOCAL_WORKSPACE_VIEW_DIR = new THREE.Vector3(0.4, 0.35, 0.85).normalize();
const INDUSTRY_NAV_DISTANCE = 2500;
const SUBDOMAIN_NAV_DISTANCE = Math.hypot(200, 750);
const LOCAL_WORKSPACE_ZOOM_MULT = 3;

function _localWorkspaceEndPose(target, navDistance) {
  const endTarget = target.clone();
  const dir = LOCAL_WORKSPACE_VIEW_DIR.clone();
  const dist = navDistance * LOCAL_WORKSPACE_ZOOM_MULT;
  const endPos = endTarget.clone().add(dir.multiplyScalar(dist));
  endPos.y = Math.max(endPos.y, endTarget.y + dist * 0.25);
  return { endPos, endTarget };
}

export class CameraController {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.currentLevel = ZOOM_LEVELS.GALAXY;
    this.isTransitioning = false;
    this.autoRotateEnabled = true;
    this._flyTimeline = null;

    // Zoom state for massive scale
    this.targetDistance = 18000;
    this.currentDistance = 18000;

    this._initControls();
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);

    // Heavy damping for smooth, cinematic feel
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.04;

    this.controls.minDistance = 3;
    this.controls.maxDistance = 38000;

    // Smooth zoom speed
    this._baseZoomSpeed = 0.6;
    this._baseDamping = 0.04;
    this.controls.zoomSpeed = this._baseZoomSpeed;

    // Pan
    this.controls.enablePan = true;
    this.controls.panSpeed = 0.4;

    // Rotation limits
    this.controls.maxPolarAngle = Math.PI * 0.82;
    this.controls.minPolarAngle = Math.PI * 0.18;

    // Rotation inertia
    this.controls.rotateSpeed = 0.5;

    // Auto-rotate at galaxy level
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.06;

    // Disable the default scroll zoom — we'll override
    this.controls.enableZoom = true;

    // Mouse buttons
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };

    // Touch
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    // Manage auto-rotate on user interaction
    this._autoRotateTimer = null;
    this.controls.addEventListener('start', () => {
      this.autoRotateEnabled = false;
      this.controls.autoRotate = false;
      clearTimeout(this._autoRotateTimer);
    });

    this.controls.addEventListener('end', () => {
      clearTimeout(this._autoRotateTimer);
      this._autoRotateTimer = setTimeout(() => {
        if (
          this.currentLevel === ZOOM_LEVELS.GALAXY &&
          !this.isTransitioning &&
          !this._interactionLocked
        ) {
          this.autoRotateEnabled = true;
          this.controls.autoRotate = true;
        }
      }, 6000);
    });
  }

  /** Block orbit / pointer when twin workspace overlay is active. */
  _interactionLocked = false;

  setInteractionLocked(locked) {
    this._interactionLocked = locked;
    if (locked) {
      this.controls.enabled = false;
      this.controls.autoRotate = false;
      clearTimeout(this._autoRotateTimer);
      return;
    }

    this.controls.enabled = true;
    if (
      this.currentLevel === ZOOM_LEVELS.GALAXY &&
      this.autoRotateEnabled &&
      !this.isTransitioning
    ) {
      this.controls.autoRotate = true;
    }
  }

  /**
   * Teleport camera to target — no zoom animation (logged-in company interior).
   */
  snapTo(targetPosition, distance, level, onComplete, overrideDir) {
    if (this._flyTimeline) this._flyTimeline.kill();
    this.isTransitioning = false;
    this.controls.autoRotate = false;

    let currentDir;
    if (overrideDir) {
      currentDir = overrideDir.clone().normalize();
    } else {
      const toCam = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
      const toCamLen = toCam.length();
      currentDir = toCamLen < 150
        ? new THREE.Vector3(0.4, 0.35, 0.85).normalize()
        : toCam.divideScalar(toCamLen);
      if (Math.abs(currentDir.y) > 0.9) {
        currentDir.set(0.5, 0.4, 0.5).normalize();
      }
    }

    const newCamPos = new THREE.Vector3()
      .copy(targetPosition)
      .add(currentDir.multiplyScalar(distance));
    newCamPos.y = Math.max(newCamPos.y, targetPosition.y + distance * 0.25);

    this.camera.position.copy(newCamPos);
    this.controls.target.copy(targetPosition);
    this.controls.update();
    this.currentLevel = level;
    if (onComplete) onComplete();
  }

  /**
   * Fly the camera to a target with cinematic GSAP transition.
   */
  flyTo(targetPosition, distance, level, onComplete, durationOverride) {
    if (this.isTransitioning) {
      // Kill previous transition
      if (this._flyTimeline) this._flyTimeline.kill();
    }
    this.isTransitioning = true;
    this.controls.autoRotate = false;

    // Calculate camera destination
    const toCam = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const toCamLen = toCam.length();

    // Degenerate: camera at/very near target (e.g. coasted to BH center).
    // Use a fixed "safe" direction so every galaxy exit looks the same.
    const currentDir = toCamLen < 150
      ? new THREE.Vector3(0.4, 0.35, 0.85).normalize()
      : toCam.divideScalar(toCamLen); // manual normalize to reuse already-computed length

    // Prevent near-vertical direction (gimbal-lock feeling)
    if (Math.abs(currentDir.y) > 0.9) {
      currentDir.set(0.5, 0.4, 0.5).normalize();
    }

    const newCamPos = new THREE.Vector3()
      .copy(targetPosition)
      .add(currentDir.multiplyScalar(distance));

    // Ensure above plane
    newCamPos.y = Math.max(newCamPos.y, targetPosition.y + distance * 0.25);

    const duration = durationOverride ?? this._getTransitionDuration(distance);

    this._flyTimeline = gsap.timeline({
      onComplete: () => {
        this.currentLevel = level;
        this.isTransitioning = false;
        this._flyTimeline = null;

        // Resume auto-rotate at galaxy level
        if (level === ZOOM_LEVELS.GALAXY && !this._interactionLocked) {
          this._autoRotateTimer = setTimeout(() => {
            if (!this._interactionLocked) {
              this.autoRotateEnabled = true;
              this.controls.autoRotate = true;
              this.controls.autoRotateSpeed = 0.06;
            }
          }, 1000);
        }

        if (onComplete) onComplete();
      },
    });

    // Animate camera position with strong ease
    this._flyTimeline.to(
      this.camera.position,
      {
        x: newCamPos.x,
        y: newCamPos.y,
        z: newCamPos.z,
        duration,
        ease: 'power3.inOut',
      },
      0
    );

    // Animate orbit target
    this._flyTimeline.to(
      this.controls.target,
      {
        x: targetPosition.x,
        y: targetPosition.y,
        z: targetPosition.z,
        duration,
        ease: 'power3.inOut',
      },
      0
    );
  }

  /**
   * Get transition duration based on travel distance
   */
  _getTransitionDuration(targetDistance) {
    const currentDist = this.getDistanceToTarget();
    const travel = Math.abs(currentDist - targetDistance);

    // Massive travel distances require slightly more time, but keep it speedy
    if (travel > 10000) return 2.8;
    if (travel > 2000) return 2.2;
    if (travel > 1000) return 1.8;
    if (travel > 300) return 1.5;
    if (travel > 50) return 1.2;
    return 0.9;
  }

  /**
   * Fly back to galaxy view
   */
  flyToGalaxy(onComplete) {
    this.flyTo(
      new THREE.Vector3(0, 0, 0),
      28000,
      ZOOM_LEVELS.GALAXY,
      onComplete
    );
  }

  /**
   * Get current camera distance to orbit target
   */
  /** Cap zoom-out at industry level so user can't drift to galaxy view manually */
  setZoomCap(max) {
    this.controls.maxDistance = max;
  }

  getDistanceToTarget() {
    return this.camera.position.distanceTo(this.controls.target);
  }

  /**
   * Get normalized zoom (0 = closest, 1 = farthest)
   */
  getZoomNormalized() {
    const dist = this.getDistanceToTarget();
    return THREE.MathUtils.clamp(
      (dist - this.controls.minDistance) /
        (this.controls.maxDistance - this.controls.minDistance),
      0,
      1
    );
  }

  /**
   * Progressive zoom/damping easing as the camera approaches the galactic center
   * (black hole). Replaces abrupt on/off speed changes with a smooth curve.
   */
  updateBlackHoleApproach(distFromOrigin) {
    if (this.isTransitioning || !this.controls.enableZoom) return;

    const SLOW_START = 2400;
    const SLOW_END   = 1050;

    if (distFromOrigin >= SLOW_START) {
      this.resetBlackHoleApproach();
      return;
    }

    const t = THREE.MathUtils.clamp(
      (SLOW_START - distFromOrigin) / (SLOW_START - SLOW_END),
      0,
      1,
    );
    const ease = t * t * (3 - 2 * t); // smoothstep

    this.controls.zoomSpeed = THREE.MathUtils.lerp(this._baseZoomSpeed, 0.22, ease);
    this.controls.dampingFactor = THREE.MathUtils.lerp(this._baseDamping, 0.065, ease);
    // Prevent overshooting into minDistance=3 before interior capture takes over
    this.controls.minDistance = THREE.MathUtils.lerp(3, 140, ease);
  }

  /** Restore default scroll/orbit feel after leaving the BH approach zone. */
  resetBlackHoleApproach() {
    this.controls.zoomSpeed = this._baseZoomSpeed;
    this.controls.dampingFactor = this._baseDamping;
    this.controls.minDistance = 3;
  }

  /** Animate universe into top band via camera view offset (canvas stays full-screen). */
  _workspaceComposeT = 0;
  _workspaceComposeActive = false;
  _workspaceComposeTween = null;
  _workspaceComposeMode = 'galaxy';
  _savedIndustryCamPos = null;
  _savedIndustryCamTarget = null;
  _localWorkspaceEndPos = null;
  _localWorkspaceEndTarget = null;

  /** Fixed workspace landing pose — same regardless of where the user was orbiting. */
  setLocalWorkspaceEndPose(target, kind) {
    const navDistance = kind === 'subdomain' ? SUBDOMAIN_NAV_DISTANCE : INDUSTRY_NAV_DISTANCE;
    const { endPos, endTarget } = _localWorkspaceEndPose(target, navDistance);
    this._localWorkspaceEndPos = endPos;
    this._localWorkspaceEndTarget = endTarget;
  }

  clearLocalWorkspaceEndPose() {
    this._localWorkspaceEndPos = null;
    this._localWorkspaceEndTarget = null;
  }

  _applyGalaxyWorkspaceViewOffset(width, height, t) {
    if (t <= 0.001) {
      this.camera.clearViewOffset();
      this.camera.updateProjectionMatrix();
      return;
    }

    const fsT = this._fullscreenT ?? 0;
    const scale = THREE.MathUtils.lerp(1, 0.48, t);
    const fullW = width / scale;
    const fullH = height / scale;
    const subW = width;
    const subH = height;
    const offsetX = (fullW - subW) * 0.5;
    const offsetY = (fullH - subH) * THREE.MathUtils.lerp(0.5, 0.7, t) + fsT * fullH * 0.65;

    this.camera.setViewOffset(fullW, fullH, offsetX, offsetY, subW, subH);
    this.camera.updateProjectionMatrix();
  }

  /** Industry workspace — uniform shrink + shift up, no vertical crop (keeps viewing angle). */
  _applyIndustryWorkspaceViewOffset(width, height, t) {
    if (t <= 0.001) {
      this.camera.clearViewOffset();
      this.camera.updateProjectionMatrix();
      return;
    }

    const fsT = this._fullscreenT ?? 0;
    const scale = THREE.MathUtils.lerp(1, 0.60, t);
    const fullW = width / scale;
    const fullH = height / scale;
    const subW = width;
    const subH = height;
    const offsetX = (fullW - subW) * 0.5;
    const offsetY = (fullH - subH) * 0.58 + height * 0.24 * t + fsT * fullH * 0.85;

    this.camera.setViewOffset(fullW, fullH, offsetX, offsetY, subW, subH);
    this.camera.updateProjectionMatrix();
  }

  /** Lerp camera to fixed workspace landing pose (not user-relative zoom). */
  _applyIndustryWorkspaceZoom(t) {
    if (!this._savedIndustryCamPos || !this._savedIndustryCamTarget) return;
    if (!this._localWorkspaceEndPos || !this._localWorkspaceEndTarget) return;

    this.camera.position.lerpVectors(this._savedIndustryCamPos, this._localWorkspaceEndPos, t);
    this.controls.target.lerpVectors(this._savedIndustryCamTarget, this._localWorkspaceEndTarget, t);
    this.controls.update();
  }

  _applyWorkspaceFrame(width, height, t, mode) {
    if (mode === 'industry' || mode === 'subdomain') {
      this._applyIndustryWorkspaceViewOffset(width, height, t);
      this._applyIndustryWorkspaceZoom(t);
    } else {
      this._applyGalaxyWorkspaceViewOffset(width, height, t);
    }
  }

  _isLocalWorkspaceMode(mode) {
    return mode === 'industry' || mode === 'subdomain';
  }

  setWorkspaceCompose(active, width, height, animate = true, mode = 'galaxy') {
    if (this._workspaceComposeTween) {
      this._workspaceComposeTween.kill();
      this._workspaceComposeTween = null;
    }

    this._workspaceComposeMode = mode;

    const targetT = active ? 1 : 0;
    const startT = this._workspaceComposeT;

    if (active && this._isLocalWorkspaceMode(mode) && startT <= 0.001) {
      this._savedIndustryCamPos = this.camera.position.clone();
      this._savedIndustryCamTarget = this.controls.target.clone();
    }

    if (!animate) {
      this._workspaceComposeT = targetT;
      this._workspaceComposeActive = active;
      this._applyWorkspaceFrame(width, height, targetT, mode);
      this.onWorkspaceComposeUpdate?.(targetT, mode);
      this.onWorkspaceComposeComplete?.(active, mode);
      if (!active && this._isLocalWorkspaceMode(mode)) this._restoreIndustryCamera();
      return;
    }

    const state = { t: startT };
    this._workspaceComposeTween = gsap.to(state, {
      t: targetT,
      duration: 0.88,
      ease: 'power3.inOut',
      onUpdate: () => {
         this._workspaceComposeT = state.t;
         this._applyWorkspaceFrame(width, height, state.t, mode);
         this.onWorkspaceComposeUpdate?.(state.t, mode);
      },
      onComplete: () => {
        this._workspaceComposeT = targetT;
        this._workspaceComposeActive = active;
        this._workspaceComposeTween = null;
        this.onWorkspaceComposeComplete?.(active, mode);
        if (!active) {
          this.camera.clearViewOffset();
          this.camera.updateProjectionMatrix();
          if (this._isLocalWorkspaceMode(mode)) this._restoreIndustryCamera();
        }
      },
    });
  }

  _restoreIndustryCamera() {
    if (this._savedIndustryCamPos && this._savedIndustryCamTarget) {
      this.camera.position.copy(this._savedIndustryCamPos);
      this.controls.target.copy(this._savedIndustryCamTarget);
      this.controls.update();
    }
    this._savedIndustryCamPos = null;
    this._savedIndustryCamTarget = null;
    this.clearLocalWorkspaceEndPose();
  }

  updateWorkspaceComposeSize(width, height) {
    const t = this._workspaceComposeT;
    if (t <= 0.001 && !this._workspaceComposeActive) return;
    this._applyWorkspaceFrame(width, height, t, this._workspaceComposeMode);
  }

  _fullscreenT = 0;
  _lastIsFS = false;
  _fullscreenTween = null;

  _updateFullscreenTransition() {
    const isFS = !!document.querySelector('.ws-canvas-wrap--fullscreen');
    if (isFS !== this._lastIsFS) {
      this._lastIsFS = isFS;
      if (this._fullscreenTween) {
        this._fullscreenTween.kill();
      }

      const targetFS = isFS ? 1 : 0;
      const startFS = this._fullscreenT;
      const state = { t: startFS };

      this._fullscreenTween = gsap.to(state, {
        t: targetFS,
        duration: 2.2,
        ease: 'power3.inOut',
        onUpdate: () => {
          this._fullscreenT = state.t;
          const width = this.canvas.clientWidth;
          const height = this.canvas.clientHeight;
          this.updateWorkspaceComposeSize(width, height);
        },
        onComplete: () => {
          this._fullscreenT = targetFS;
          this._fullscreenTween = null;
        },
      });
    }
  }

  update() {
    if (this._interactionLocked) {
      this.controls.enabled = false;
      this.controls.autoRotate = false;
    }
    this._updateFullscreenTransition();
    this.controls.update();
  }

  dispose() {
    this.controls.dispose();
    clearTimeout(this._autoRotateTimer);
    if (this._flyTimeline) this._flyTimeline.kill();
    if (this._workspaceComposeTween) this._workspaceComposeTween.kill();
    if (this._fullscreenTween) this._fullscreenTween.kill();
    this.camera.clearViewOffset();
  }
}
