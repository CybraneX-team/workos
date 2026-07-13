// @ts-nocheck
/**
 * UniverseController — Mountable 3D Universe
 *
 * Wraps all Three.js rendering into a single class that mounts
 * into a container div. Used by the React <UniverseCanvas /> component.
 */

import * as THREE from 'three';
import gsap from 'gsap';
import { Engine } from './engine/Engine';
import { CameraController, ZOOM_LEVELS } from './engine/CameraController';
import { PostProcessing } from './engine/PostProcessing';
import { GalaxyParticles } from './particles/GalaxyParticles';
import { SystemParticles } from './particles/SystemParticles';
import { PolytopeRenderer } from './particles/PolytopeRenderer';
import { NavigationManager } from './navigation/NavigationManager';
import { Labels } from './ui/Labels';
import { IconParticles } from './particles/IconParticles';
import { SubdomainSolarSystem } from './navigation/SubdomainSolarSystem';
import { loadUniverseNavState } from '../lib/universeNavPersistence';
import type { UniverseData, UniverseIndustry } from '../data/universeGraph';

import './styles/universe.css';

export type ZoomLevel = typeof ZOOM_LEVELS[keyof typeof ZOOM_LEVELS];

export interface NavPathEntry {
  level: ZoomLevel;
  id: string;
  name: string;
  data: any;
}

export interface HoverTarget {
  type: string;
  [key: string]: any;
}

export interface UniverseCallbacks {
  onNavigate?: (path: NavPathEntry[], level: ZoomLevel) => void;
  onHover?: (target: HoverTarget | null) => void;
  onCreateCompany?: (industry: any, subdomain: any) => void;
  onEnterBH?: () => void;
  onExitBH?: () => void;
  /** @deprecated use onEnterCompanyInterior */
  onEnterCompanyPolytope?: (company: any) => void;
  /** Fired when entering logged-in company in-scene interior (no polytope overlay) */
  onEnterCompanyInterior?: (company: any) => void;
  onInteriorLevelChange?: (depth: number, path: string[]) => void;
  /** Fired whenever navigating back from COMPANY level */
  onExitCompanyPolytope?: () => void;
  /** After zoom to company — prompt role selection */
  onCompanyAwaitingRole?: (ctx: { company: any; industry: any; subdomain: any }) => void;
  /** Planet root systems visible in 3D */
  onEnterCompanyPlanetRoots?: (company: any) => void;
  onPlanetLevelChange?: (depth: number, path: string[]) => void;
  onIndustryCoreVoiceToggle?: (industry: any, active: boolean) => void;
}

const _orbitPos = new THREE.Vector3();
const _bhCaptureDir = new THREE.Vector3();
const _bhCapturePos = new THREE.Vector3();

export class UniverseController {
  private container: HTMLElement;
  private engine: Engine;
  private cameraCtrl: CameraController;
  private postProcessing: PostProcessing;
  private galaxyParticles: GalaxyParticles;
  private systemParticles: SystemParticles;
  private polytopeRenderer: PolytopeRenderer;
  private navigation: NavigationManager;
  private labels: Labels;
  private iconParticles: IconParticles;
  private subdomainSolarSystem: SubdomainSolarSystem;
  private _data: UniverseData | null = null;
  private _disposed = false;
  private _workspaceFocused = false;
  private _workspaceFocusIndustryId: string | null = null;
  private _workspaceFocusSubdomainId: string | null = null;
  private _workspaceMode: 'galaxy' | 'industry' | 'subdomain' | null = null;
  private _voiceIntensityRef: React.MutableRefObject<number> | null = null;

  constructor(
    container: HTMLElement,
    data: UniverseData,
    callbacks?: UniverseCallbacks,
  ) {
    this.container = container;
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.pointerEvents = 'auto';
    this._data = data;
    this._callbacks = callbacks ?? {};
    this._exitingBH = false;
    this._bhCapturing = false;

    this._init(data);
  }

  setVoiceIntensityRef(ref: React.MutableRefObject<number> | null) {
    this._voiceIntensityRef = ref;
  }

  private async _init(data: UniverseData) {
    try {
      // Transform UniverseData industries into the shape the particle system expects
      const industries = this._mapIndustries(data);
      this._industries = industries; // cache for panel navigation

      // 1. Engine — mounts into container
      this.engine = new Engine(this.container);

      // 2. Camera Controller
      this.cameraCtrl = new CameraController(this.engine.camera, this.engine.canvas);
      this.cameraCtrl.onWorkspaceComposeUpdate = (t, mode) => {
        if (mode === 'industry') {
          const industryId = this._workspaceFocusIndustryId;
          if (!industryId) return;
          this.applyIndustryWorkspaceProgress(industryId, t);
          return;
        }
        if (mode === 'subdomain') {
          this.applySubdomainWorkspaceProgress(t);
        }
      };
      this.cameraCtrl.onWorkspaceComposeComplete = (active, mode) => {
        if (mode === 'industry') {
          const industryId = this._workspaceFocusIndustryId;
          if (!industryId) return;
          this.applyIndustryWorkspaceProgress(industryId, active ? 1 : 0);
          if (!active) {
            this._workspaceFocusIndustryId = null;
            this.labels?.setActiveIndustry(null);
          }
          return;
        }
        if (mode === 'subdomain') {
          this.applySubdomainWorkspaceProgress(active ? 1 : 0);
          if (!active) {
            this._workspaceFocusIndustryId = null;
            this._workspaceFocusSubdomainId = null;
          }
        }
      };

      // Set camera to gallery-view position immediately if intro already played,
      // unless we're restoring industry/subdomain depth (handled after init).
      const persistedNav = loadUniverseNavState();
      if (sessionStorage.getItem('universe3d_intro_done') && !persistedNav) {
        this.engine.camera.position.set(
          Math.cos(Math.PI * 0.3 + Math.PI * 1.4) * 28000,
          6000,
          Math.sin(Math.PI * 0.3 + Math.PI * 1.4) * 28000,
        );
        this.engine.camera.lookAt(0, 0, 0);
      }

      // 3. Lighting
      this._setupLighting();

      // 4. Galaxy Particles
      this.galaxyParticles = new GalaxyParticles(this.engine.scene, industries);

      // 5. System Particles (industry solar systems)
      this.systemParticles = new SystemParticles(this.engine.scene);
      industries.forEach((industry, idx) => {
        const pos = this.galaxyParticles.getIndustryPosition(idx);
        const sizeMult = this.galaxyParticles.getSizeMultiplier(idx);
        this.systemParticles.createSystem(industry, pos, sizeMult);
      });

      // Staggered galaxy creation (skip if returning to page this session)
      const skipIntro = !!sessionStorage.getItem('universe3d_intro_done');
      industries.forEach((industry, idx) => {
        const sys = this.systemParticles.systems.get(industry.id);
        if (sys?.group) {
          if (skipIntro) {
            sys.group.scale.setScalar(1);
          } else {
            sys.group.scale.setScalar(0.001);
            setTimeout(() => {
              if (this._disposed) return;
              gsap.to(sys.group.scale, { x: 1, y: 1, z: 1, duration: 1.5 + idx * 0.1, ease: 'power2.out' });
            }, 800 + idx * 180);
          }
        }
      });

      // Polytope Renderer
      this.polytopeRenderer = new PolytopeRenderer(this.engine.scene);
      this.polytopeRenderer.renderPolytope("Work OS Orbit", industries, "#4ade80");

      // Black-hole interior callbacks (wired after both deps exist)
      this.galaxyParticles.onEnterBH = () => {
        this._exitingBH = false;
        this._smoothCaptureBlackHole();
      };
      this.galaxyParticles.onExitBH = () => {
        this.cameraCtrl?.resetBlackHoleApproach();
        this.systemParticles?.setVisible(true);
        // Force-restore galaxy visibility — setSubdomainLevel(true) may have hidden it
        this.galaxyParticles?.setVisible(true);
        // polytopeRenderer restored by zoom-level / navigation logic
        this._callbacks?.onExitBH?.();
      };

      // 6. Post-Processing
      this.postProcessing = new PostProcessing(
        this.engine.renderer,
        this.engine.scene,
        this.engine.camera
      );
      this.engine.composer = this.postProcessing.composer;
      this.engine.onResize = (w, h) => this.postProcessing.resize(w, h);

      // 7. Navigation Manager
      this.navigation = new NavigationManager(
        this.engine.camera,
        this.engine.canvas,
        this.cameraCtrl,
        {
          galaxyParticles: this.galaxyParticles,
          systemParticles: this.systemParticles,
          scene: this.engine.scene,
          container: this.container,
        }
      );

      // 8. Labels — mount into container
      this.labels = new Labels(this.engine.scene, this.engine.camera, this.container);
      this._createIndustryLabels(industries);
      this._setupLabelNavigation(industries);

      // 8a. Listen for company tag changes and update label colors live
      this._onWorkflowsUpdated = () => this._refreshCompanyTagColors();
      window.addEventListener('workflows_updated', this._onWorkflowsUpdated);

      // 8b. Icon Particles
      this.iconParticles = new IconParticles(this.engine.scene, this.engine.camera);
      await this.iconParticles.createAll(industries);
      if (this._disposed) return;
      this.iconParticles.attachToSystems(this.systemParticles.systems);
      this.navigation.setIconParticles(this.iconParticles, industries);

      // 8c. Subdomain Solar System
      this.subdomainSolarSystem = new SubdomainSolarSystem(this.engine.scene);
      this.navigation.setSubdomainSolarSystem(this.subdomainSolarSystem);
      this.navigation.setMyCompanyNodeId(data.myCompanyNodeId ?? null);
      this.navigation.isTwinWorkspaceActive = () => this._workspaceFocused;
      this.navigation.onGalaxyNavigationComplete = () => {
        if (this._workspaceFocused && this._workspaceMode === 'galaxy') {
          this.applyTwinWorkspaceFocus();
        }
      };

      // 9. Wire navigation callbacks → React
      this._setupNavigationCallbacks(industries);

      // 10. Start render loop
      this.engine.start((delta, elapsed) => this._update(delta, elapsed, industries));

      // 11. Play intro orbit (only once per session) or restore saved nav level
      setTimeout(() => {
        if (this._disposed) return;
        const alreadyPlayed = sessionStorage.getItem('universe3d_intro_done');
        const persisted = loadUniverseNavState();

        if (alreadyPlayed) {
          const restored = persisted && this.navigation.restorePersistedView(persisted, industries);
          if (!restored) {
            const ctrl = this.cameraCtrl;
            const cam = this.engine.camera;
            cam.position.set(
              Math.cos(Math.PI * 0.3 + Math.PI * 1.4) * 28000,
              6000,
              Math.sin(Math.PI * 0.3 + Math.PI * 1.4) * 28000,
            );
            cam.lookAt(0, 0, 0);
            ctrl.controls.target.set(0, 0, 0);
            ctrl.controls.enabled = true;
            ctrl.controls.update();
            ctrl.isTransitioning = false;
            ctrl.currentLevel = ZOOM_LEVELS.GALAXY;
            ctrl.autoRotateEnabled = true;
            ctrl.controls.autoRotate = true;
          } else {
            this.cameraCtrl.controls.enabled = true;
            this.cameraCtrl.isTransitioning = false;
            this.cameraCtrl.autoRotateEnabled = false;
            this.cameraCtrl.controls.autoRotate = false;
          }
        } else {
          this._playIntroOrbit();
          sessionStorage.setItem('universe3d_intro_done', '1');
        }
      }, 300);

    } catch (err) {
      console.error('Failed to initialize Universe:', err);
    }
  }

  private _mapIndustries(data: UniverseData) {
    return data.industries.map((ind) => ({
      id: ind.id,
      name: ind.name,
      description: ind.description,
      color: ind.color,
      angle: ind.angle,
      subdomains: ind.subdomains.map(sd => ({
        id: sd.id,
        name: sd.name,
        description: sd.description,
        orbit_index: sd.orbit_index,
        color: sd.color,
        companies: sd.companies.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description,
          founded: c.founded,
          funding: c.funding,
          employees: c.employees,
          isLive: c.isLive,
          kind: c.kind,
          referenceCompanyId: c.referenceCompanyId,
          referenceStatus: c.referenceStatus,
          sourceUrl: c.sourceUrl,
          lastError: c.lastError,
          referenceRaw: c.referenceRaw,
          departments: c.departments || [],
        })),
      })),
      companies: data.industries
        .find(i => i.id === ind.id)
        ?.subdomains.flatMap(sd => sd.companies) ?? [],
    }));
  }

  private _setupLighting() {
    const ambient = new THREE.AmbientLight(0x161633, 0.4);
    this.engine.scene.add(ambient);
    const coreLight = new THREE.PointLight(0x7c3aed, 3, 600, 1.5);
    coreLight.position.set(0, 5, 0);
    this.engine.scene.add(coreLight);
    const coreLight2 = new THREE.PointLight(0xffd4a0, 1.5, 300, 2);
    coreLight2.position.set(0, -3, 0);
    this.engine.scene.add(coreLight2);
    const hemi = new THREE.HemisphereLight(0x2a2a66, 0x090912, 0.15);
    this.engine.scene.add(hemi);
  }

  private _createIndustryLabels(industries: any[]) {
    this.labels.createIndustryLabels(
      industries,
      (idx) => this.galaxyParticles.getIndustryPosition(idx)
    );
  }

  private _setupLabelNavigation(industries: any[]) {
    this.labels.onLabelClick = (type, data, arg2, arg3) => {
      if (type === 'industry') {
        this.navigation.navigateToIndustry(data, arg2, arg3);
      } else if (type === 'subdomain') {
        this.navigation.navigateToSubdomain(arg2, data);
      } else if (type === 'company') {
        this.navigation.navigateToCompany(arg3, arg2, data);
      }
    };
  }

  private _setupNavigationCallbacks(industries: any[]) {
    const originalOnNavigate = this.navigation.onNavigate;
    this.navigation.onNavigate = (path, level) => {
      if (originalOnNavigate) originalOnNavigate(path, level);
      this._updateLabelsForLevel(path, level, industries);
      const activeId = level === ZOOM_LEVELS.GALAXY ? null : path[0]?.data?.id || null;
      this.labels.setActiveIndustry(activeId);

      this._callbacks?.onNavigate?.(path, level);
    };
    this.navigation.onNavigateBegin = (path, level) => {
      this._updateLabelsForLevel(path, level, industries);
    };
    this.navigation.onHover = (target) => {
      this._callbacks?.onHover?.(target);
    };
    this.navigation.onEnterCompanyPolytope = (company) => {
      this._callbacks?.onEnterCompanyPolytope?.(company);
    };
    this.navigation.onEnterCompanyInterior = (company) => {
      this._callbacks?.onEnterCompanyInterior?.(company);
    };
    this.navigation.onInteriorLevelChange = (depth, path) => {
      this._refreshInteriorLabels();
      this._callbacks?.onInteriorLevelChange?.(depth, path);
    };
    this.navigation.onExitCompanyPolytope = () => {
      this._callbacks?.onExitCompanyPolytope?.();
    };
    this.navigation.onCompanyAwaitingRole = (ctx) => {
      this._callbacks?.onCompanyAwaitingRole?.(ctx);
    };
    this.navigation.onEnterCompanyPlanetRoots = (company) => {
      this._callbacks?.onEnterCompanyPlanetRoots?.(company);
    };
    this.navigation.onPlanetLevelChange = (depth, path) => {
      this._refreshInteriorLabels();
      this._callbacks?.onPlanetLevelChange?.(depth, path);
    };
    this.navigation.onIndustryCoreVoiceToggle = (industry, active) => {
      this._callbacks?.onIndustryCoreVoiceToggle?.(industry, active);
    };
  }

  private _refreshInteriorLabels(company?: any) {
    this.labels.removeByPrefix('dept-');
    const sss = this.subdomainSolarSystem;
    const co = company ?? this.navigation?.navigationPath?.[2]?.data;
    if (!co || !sss?.interiorViewActive) return;
    this.labels.createDepartmentLabels(co, () => sss.getInteriorNodeMeshes());
    this.labels.setVisibility('dept-', true);
  }

  private _refreshCompanyTagColors() {
    if (!this.labels) return;
    const STORAGE_KEY = 'industry_os_saved_workflows_v1';
    const TAG_COLORS: Record<string, string> = {
      competitor: '#ef4444',
      potential_client: '#10b981',
      partner: '#3b82f6',
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const items: any[] = raw ? JSON.parse(raw) : [];
      // Build a map: companyId -> tag color (for planet-level items only)
      const tagColorMap = new Map<string, string>();
      for (const item of items) {
        if (item.level === 'planet' && item.planetTag && TAG_COLORS[item.planetTag]) {
          tagColorMap.set(item.companyId, TAG_COLORS[item.planetTag]);
        }
      }
      // Apply to all existing company labels
      // We iterate the labels map via the known company mesh industry colors
      this.labels.labels.forEach((label: any, id: string) => {
        if (!id.startsWith('company-')) return;
        const companyId = id.replace('company-', '');
        const tagColor = tagColorMap.get(companyId);
        if (tagColor) {
          label.element.style.color = tagColor;
        } else {
          // Restore to industry color from mesh userData
          const mesh = label.parent;
          const industryColor = mesh?.userData?.industry?.color || '#ffffff';
          label.element.style.color = industryColor;
        }
      });
    } catch {
      // ignore
    }
  }

  private _updateLabelsForLevel(path: any[], level: string, industries: any[]) {
    this.labels.setVisibility('subdomain-', false);
    this.labels.removeByPrefix('company-');
    this.labels.removeByPrefix('dept-');

    if (level === ZOOM_LEVELS.INDUSTRY) {
      const industry = path[0]?.data;
      if (industry) {
        this.labels.createSubdomainLabels(industry, () => this.systemParticles.getSubdomainMeshes(industry.id));
        this.labels.setVisibility('subdomain-', true);
      }
    } else if (level === ZOOM_LEVELS.SUBDOMAIN) {
      this.labels.setVisibility('subdomain-', false);
      const industry = path[0]?.data;
      const subdomain = path[1]?.data;
      if (industry && subdomain) {
        this.labels.createCompanyLabels(subdomain, () => this.subdomainSolarSystem.companyMeshes);
        this.labels.setVisibility('company-', true);
        this._refreshCompanyTagColors();
      }
    } else if (level === ZOOM_LEVELS.COMPANY) {
      this.labels.setVisibility('subdomain-', true);
      this.labels.setVisibility('company-', true);
      const industry = path[0]?.data;
      const subdomain = path[1]?.data;
      const company = path[2]?.data;
      if (industry && subdomain && company) {
        this.labels.createCompanyLabels(subdomain, () => this.subdomainSolarSystem.companyMeshes);
        this._refreshInteriorLabels(company);
        this._refreshCompanyTagColors();
      }
    } else if (level === ZOOM_LEVELS.DEPARTMENT) {
      this.labels.setVisibility('subdomain-', true);
      this.labels.setVisibility('company-', true);
      this.labels.setVisibility('dept-', true);
    }
  }

  private _playIntroOrbit() {
    const cam = this.engine.camera;
    const ctrl = this.cameraCtrl;

    ctrl.isTransitioning = true;
    ctrl.controls.enabled = false;
    ctrl.controls.autoRotate = false;

    const ORBIT_RADIUS_START = 32000;
    const ORBIT_RADIUS_END   = 28000;
    const ELEV_START = 12000;
    const ELEV_END   = 6000;
    const START_ANGLE = Math.PI * 0.3;
    const SWEEP      = Math.PI * 1.4;
    const DURATION   = 9.0;

    const proxy = { t: 0 };

    cam.position.set(
      Math.cos(START_ANGLE) * ORBIT_RADIUS_START,
      ELEV_START,
      Math.sin(START_ANGLE) * ORBIT_RADIUS_START,
    );
    cam.lookAt(0, 0, 0);

    gsap.to(proxy, {
      t: 1,
      duration: DURATION,
      ease: 'power4.inOut',
      onUpdate: () => {
        if (this._disposed) return;
        const angle  = START_ANGLE + SWEEP * proxy.t;
        const radius = ORBIT_RADIUS_START + (ORBIT_RADIUS_END - ORBIT_RADIUS_START) * proxy.t;
        const elev   = ELEV_START + (ELEV_END - ELEV_START) * proxy.t;
        cam.position.set(Math.cos(angle) * radius, elev, Math.sin(angle) * radius);
        cam.lookAt(0, 0, 0);
      },
      onComplete: () => {
        if (this._disposed) return;
        ctrl.controls.target.set(0, 0, 0);
        ctrl.controls.enabled = true;
        ctrl.controls.update();
        ctrl.isTransitioning = false;
        ctrl.currentLevel = ZOOM_LEVELS.GALAXY;
        setTimeout(() => {
          if (this._disposed) return;
          ctrl.autoRotateEnabled = true;
          ctrl.controls.autoRotate = true;
        }, 1200);
      },
    });
  }

  private _smoothCaptureBlackHole(): void {
    const ctrl = this.cameraCtrl;
    const cam  = this.engine?.camera;
    if (!ctrl || !cam || this._bhCapturing) return;
    this._bhCapturing = true;

    // Stop scroll input — GSAP handles the final approach.
    ctrl.controls.enableZoom = false;
    ctrl.isTransitioning = true;

    gsap.killTweensOf(cam.position);
    gsap.killTweensOf(ctrl.controls.target);
    if (ctrl._flyTimeline) { ctrl._flyTimeline.kill(); ctrl._flyTimeline = null; }

    const CAPTURE_DIST = 460;
    const camLen = cam.position.length();
    if (camLen > 1) {
      _bhCaptureDir.copy(cam.position).divideScalar(camLen);
    } else {
      _bhCaptureDir.set(0.4, 0.35, 0.85).normalize();
    }
    // Land near capture distance; skip a long pull-in if already close to the trigger zone
    const settleDist = camLen <= CAPTURE_DIST * 1.2
      ? camLen
      : THREE.MathUtils.lerp(camLen, CAPTURE_DIST, 0.55);
    _bhCapturePos.copy(_bhCaptureDir).multiplyScalar(settleDist);

    // Hide industry systems during interior view — particle groups stay alive.
    this.systemParticles?.setVisible(false);
    this.polytopeRenderer?.setVisible(false);
    this._callbacks?.onEnterBH?.();

    const captureDur = camLen <= CAPTURE_DIST * 1.2 ? 0.35 : 0.9;
    gsap.to(cam.position, {
      x: _bhCapturePos.x,
      y: _bhCapturePos.y,
      z: _bhCapturePos.z,
      duration: captureDur,
      ease: 'power2.inOut',
      onUpdate: () => ctrl.controls.update(),
      onComplete: () => {
        ctrl.isTransitioning = false;
        ctrl.controls.update();
        this._bhCapturing = false;
        if (this.navigation) {
          this.navigation._persistNavState([], ZOOM_LEVELS.GALAXY);
        }
      },
    });
    gsap.to(ctrl.controls.target, {
      x: 0, y: 0, z: 0,
      duration: captureDur,
      ease: 'power2.inOut',
    });
  }

  private _update(delta: number, elapsed: number, industries: any[]) {
    if (this._disposed) return;

    // Direct, smoothed mapping from voice intensity ref to active industry's starMat shader uniform
    const targetAudio = this._voiceIntensityRef ? this._voiceIntensityRef.current : 0;
    if (this.navigation?.selectedIndustry) {
      const sys = this.systemParticles.systems.get(this.navigation.selectedIndustry.id);
      if (sys && sys.starMat && sys.starMat.uniforms.uAudio) {
        sys.starMat.uniforms.uAudio.value += (targetAudio - sys.starMat.uniforms.uAudio.value) * 0.25;
      }
      
      const sdSys = this.navigation._subdomainSolarSystem;
      if (sdSys && sdSys.sunMat && sdSys.sunMat.uniforms.uAudio) {
        sdSys.sunMat.uniforms.uAudio.value += (targetAudio - sdSys.sunMat.uniforms.uAudio.value) * 0.25;
      }
    }
    
    if (this.polytopeRenderer?.coreMat?.uniforms?.uAudio) {
      this.polytopeRenderer.coreMat.uniforms.uAudio.value += (targetAudio - this.polytopeRenderer.coreMat.uniforms.uAudio.value) * 0.25;
    }

    this.cameraCtrl.update();

    // Progressive BH zoom easing at galaxy level (before interior capture).
    if (
      this.cameraCtrl.currentLevel === ZOOM_LEVELS.GALAXY &&
      !this.galaxyParticles._insideBH &&
      !this._bhCapturing &&
      this.galaxyParticles._bhEnabled
    ) {
      this.cameraCtrl.updateBlackHoleApproach(this.engine.camera.position.length());
    }

    let zoomLevelFactor = 1.0;
    if (this.cameraCtrl.currentLevel === ZOOM_LEVELS.INDUSTRY) zoomLevelFactor = 0.3;
    else if (this.cameraCtrl.currentLevel === ZOOM_LEVELS.SUBDOMAIN) zoomLevelFactor = 0.1;
    else if (this.cameraCtrl.currentLevel === ZOOM_LEVELS.COMPANY) zoomLevelFactor = 0.03;
    else if (this.cameraCtrl.currentLevel === ZOOM_LEVELS.DEPARTMENT) zoomLevelFactor = 0.01;

    this.galaxyParticles.update(elapsed, 0.0, this.engine.camera.position);
    this.systemParticles.update(elapsed, zoomLevelFactor);

    if (this.cameraCtrl.currentLevel === ZOOM_LEVELS.GALAXY && !this._workspaceFocused) {
      const camPos = this.engine.camera.position;
      this.systemParticles.systems.forEach(sys => {
        const dist = camPos.distanceTo(sys.group.position);
        const opacity = Math.max(0.01, 0.10 * (3000 / dist));
        sys.glowMat.opacity = opacity;
      });
    }

    if (this.cameraCtrl.currentLevel === ZOOM_LEVELS.GALAXY) {
      this.galaxyParticles.advanceOrbits();
      industries.forEach((industry, idx) => {
        this.galaxyParticles.getIndustryPosition(idx, _orbitPos);
        this.systemParticles.updateGroupPosition(industry.id, _orbitPos);
        this.labels.updateIndustryLabelPosition(`industry-${industry.id}`, _orbitPos);
      });
    }

    this.polytopeRenderer.update(elapsed);

    if (this.subdomainSolarSystem?.active) {
      this.subdomainSolarSystem.update(elapsed, delta);
    }

    this.navigation?.updateInteriorCamera?.();

    if (this.iconParticles) {
      this.iconParticles.update();
      if (!this._workspaceFocused) {
        const activeId = this.navigation.selectedIndustry?.id || null;
        this.iconParticles.updateForDistance(
          this.engine.camera.position,
          this.systemParticles.systems,
          activeId
        );
      }
    }

    this.labels.render();

    if (this.cameraCtrl.isTransitioning) {
      this.postProcessing.setZoomIntensity(0.4);
    } else {
      this.postProcessing.setZoomIntensity(0);
    }
  }

  // Public API

  freezeSolarSystem() {
    if (this.subdomainSolarSystem) {
      this.subdomainSolarSystem.freeze();
    }
  }

  unfreezeSolarSystem() {
    if (this.subdomainSolarSystem) {
      this.subdomainSolarSystem.unfreeze();
    }
  }

  updateData(data: UniverseData) {
    if (this._disposed) return;
    this._data = data;
    this._industries = this._mapIndustries(data);
    this.navigation?.setMyCompanyNodeId(data.myCompanyNodeId ?? null);

    // If we are currently inside a subdomain, update it live
    if (
      this.cameraCtrl.currentLevel === ZOOM_LEVELS.SUBDOMAIN ||
      this.cameraCtrl.currentLevel === ZOOM_LEVELS.COMPANY ||
      this.cameraCtrl.currentLevel === ZOOM_LEVELS.DEPARTMENT
    ) {
      const activeInd = this.navigation?.selectedIndustry;
      const activeSd = this.navigation?.selectedSubdomain;
      if (activeInd && activeSd) {
        const freshInd = this._industries.find(i => i.id === activeInd.id);
        const freshSd = freshInd?.subdomains.find(s => s.id === activeSd.id);
        if (freshInd && freshSd) {
          this.navigation.selectedIndustry = freshInd;
          this.navigation.selectedSubdomain = freshSd;
          if (this.subdomainSolarSystem) {
            this.subdomainSolarSystem.build(freshSd, freshInd);
          }
          if (this.navigation.navigationPath.length >= 2) {
            this.navigation.navigationPath[0].data = freshInd;
            this.navigation.navigationPath[1].data = freshSd;
          }
          
          // Rebuild the labels for the new meshes
          this._updateLabelsForLevel(this.navigation.navigationPath, this.cameraCtrl.currentLevel, this._industries);
        }
      }
    }
  }

  navigate(path: NavPathEntry[]): void {
    // Programmatic navigation — not used in v1, available for future
  }

  async routeTo(targetLevel: ZoomLevel, industryId?: string, subdomainId?: string, companyId?: string): Promise<void> {
    if (!this.navigation || !this._industries) return;

    // Prevent multiple routes running at once
    if ((this as any)._isRouting) return;
    (this as any)._isRouting = true;

    try {
      const waitForIdle = () => new Promise<void>(resolve => {
        const check = () => {
          if (!this.cameraCtrl.isTransitioning) resolve();
          else setTimeout(check, 100);
        };
        setTimeout(check, 50); // delay first check to let transitions begin
      });

      // Phase 1: Go up until we reach the common ancestor
      while (true) {
        await waitForIdle();
        const lvl = this.getCurrentLevel();
        if (lvl === ZOOM_LEVELS.GALAXY) break;
        
        const curPath = this.getNavigationPath();
        const curInd = curPath[0]?.id;
        const curSub = curPath[1]?.id;
        
        const sameInd = (curInd === industryId);
        const sameSub = (sameInd && curSub === subdomainId);

        if (lvl === ZOOM_LEVELS.DEPARTMENT || lvl === ZOOM_LEVELS.COMPANY) {
          // If we are at a company, and we want another company in the SAME subdomain, we can just pan directly!
          if (sameSub && targetLevel === ZOOM_LEVELS.COMPANY) {
            break; 
          }
          this.goBack();
          continue;
        }
        
        if (lvl === ZOOM_LEVELS.SUBDOMAIN) {
          if (!sameInd || targetLevel === ZOOM_LEVELS.INDUSTRY || !sameSub) {
            this.goBack();
            continue;
          }
          break; // we are in the correct subdomain
        }
        
        if (lvl === ZOOM_LEVELS.INDUSTRY) {
          if (!sameInd) {
            this.goToGalaxy();
            continue;
          }
          break; // we are in the correct industry
        }
      }

      // Phase 2: Go down to target
      await waitForIdle();
      if (this.getCurrentLevel() === ZOOM_LEVELS.GALAXY && industryId) {
        this.zoomToIndustry(industryId);
        await waitForIdle();
      }
      
      if (this.getCurrentLevel() === ZOOM_LEVELS.INDUSTRY && subdomainId) {
        this.zoomToSubdomain(industryId, subdomainId);
        await waitForIdle();
      }
      
      if ((this.getCurrentLevel() === ZOOM_LEVELS.SUBDOMAIN || this.getCurrentLevel() === ZOOM_LEVELS.COMPANY) && companyId && subdomainId && industryId) {
        this.zoomToCompany(industryId, subdomainId, companyId);
        await waitForIdle();
      }
    } finally {
      (this as any)._isRouting = false;
    }
  }

  /**
   * Fly vanilla Three.js camera back to galaxy overview after BH exit.
   * _exitingBH prevents duplicate calls from rapid wheel events.
   */
  exitBlackHole(): void {
    if (this._exitingBH) return;
    this._exitingBH = true;

    const ctrl = this.cameraCtrl;
    const cam  = this.engine?.camera;
    if (!ctrl || !cam) { this._exitingBH = false; return; }

    // Force-clear any in-progress transition so goToGalaxy() doesn't early-return.
    gsap.killTweensOf(cam.position);
    gsap.killTweensOf(ctrl.controls.target);
    if (ctrl._flyTimeline) { ctrl._flyTimeline.kill(); ctrl._flyTimeline = null; }
    ctrl.isTransitioning = false;
    this._bhCapturing = false;

    // Disable zoom only — prevents user scroll fighting the fly animation.
    ctrl.controls.enableZoom = false;

    // If camera coasted to near-origin despite the onEnterBH freeze (e.g. race
    // condition), nudge it out to at least 700 units so flyTo has a valid
    // direction vector and the exit always looks the same regardless of entry depth.
    if (cam.position.lengthSq() < 700 * 700) {
      const safeDir = cam.position.lengthSq() > 1
        ? cam.position.clone().normalize()
        : new THREE.Vector3(0.4, 0.35, 0.85).normalize();
      cam.position.copy(safeDir.multiplyScalar(700));
      ctrl.controls.target.set(0, 0, 0);
      ctrl.controls.update();
    }

    // Force-restore galaxy geometry visibility.
    this.galaxyParticles?.setVisible(true);

    // goToGalaxy handles: zoom cap restore, industry particles, flyToGalaxy
    // GSAP, level/navigationPath reset, auto-rotate re-enable.
    this.navigation?.goToGalaxy();

    // Re-enable zoom + clean up flag well after flyToGalaxy (2.8s) completes.
    setTimeout(() => {
      ctrl.controls.enableZoom = true;
      ctrl.controls.enabled    = true;
      ctrl.resetBlackHoleApproach();
      ctrl.isTransitioning     = false;
      ctrl.controls.update();
      this._exitingBH = false;
      this._bhCapturing = false;
    }, 3500);
  }

  /** Sync polytope departments before / during logged-in company interior view */
  syncCompanyDepartments(departments: unknown[]): void {
    this.navigation?.setCompanyDepartments(departments);
  }

  drillInteriorBack(): boolean {
    const sss = this.subdomainSolarSystem;
    if (!sss?.interiorViewActive) return false;
    if (!sss.drillInteriorBack()) return false;
    this._refreshInteriorLabels();
    return true;
  }

  drillPlanetInto(nodeId: string): boolean {
    const sss = this.subdomainSolarSystem;
    if (!sss?.interiorViewActive) return false;
    return sss.drillInteriorInto(nodeId);
  }

  confirmPlanetRole(
    industry: any,
    subdomain: any,
    company: any,
    tree: unknown[],
  ): void {
    this.navigation?.confirmPlanetRole(industry, subdomain, company, tree);
  }

  /** Called by React when the user scrolls out of a live-company polytope overlay */
  exitCompanyPolytope(): void {
    this.navigation?.goBack();
  }

  goBack(): void {
    this.navigation?.goBack();
  }

  goToGalaxy(): void {
    this.navigation?.goToGalaxy();
  }

  zoomToIndustry(industryId: string): void {
    if (!this.navigation || !this._industries) return;
    const idx = this._industries.findIndex((i) => i.id === industryId);
    if (idx < 0) return;
    this.navigation.navigateToIndustry(this._industries[idx], idx, this._industries.length);
  }

  zoomToSubdomain(industryId: string, subdomainId: string): void {
    if (!this.navigation || !this._industries) return;
    const industry = this._industries.find((i) => i.id === industryId);
    if (!industry) return;
    const subdomain = industry.subdomains.find((s) => s.id === subdomainId);
    if (!subdomain) return;
    this.navigation.navigateToSubdomain(industry, subdomain);
  }

  zoomToCompany(industryId: string, subdomainId: string, companyId: string): void {
    if (!this.navigation || !this._industries) return;
    const industry = this._industries.find((i) => i.id === industryId);
    if (!industry) return;
    const subdomain = industry.subdomains.find((s) => s.id === subdomainId);
    if (!subdomain) return;
    const company = subdomain.companies.find((c) => c.id === companyId);
    if (!company) return;
    this.navigation.navigateToCompany(industry, subdomain, company);
  }

  getCurrentLevel(): ZoomLevel {
    return this.navigation?.currentLevel ?? ZOOM_LEVELS.GALAXY;
  }

  getNavigationPath(): NavPathEntry[] {
    return this.navigation?.navigationPath ?? [];
  }

  /** Force renderer + camera to re-read container dimensions. Call after visibility changes. */
  resize(): void {
    if (this._disposed || !this.engine) return;
    const { width, height } = this.engine._getSize();
    if (width === 0 || height === 0) return;
    this.engine.camera.aspect = width / height;
    this.engine.camera.updateProjectionMatrix();
    this.engine.renderer.setSize(width, height);
    if (this.engine.onResize) this.engine.onResize(width, height);
    this.cameraCtrl?.updateWorkspaceComposeSize(width, height);
  }

  /** Shift the 3D scene into the top band for twin workspace overlay (not the DOM canvas). */
  setWorkspaceCompose(active: boolean, animate = true): void {
    // Keep the peek zone (top band) interactive while workspace is composed.
    // The twin-universe-interaction-blocker div blocks the lower panel band; fullscreen
    // is handled via CSS on .twin-universe-viewport (see index.css).
    if (!active) {
      this._setUniverseInteractive(true);
    }

    if (this._disposed || !this.engine || !this.cameraCtrl) return;
    const { width, height } = this.engine._getSize();
    if (width === 0 || height === 0) return;
    const mode = active
      ? (this._workspaceMode ?? 'galaxy')
      : (this.cameraCtrl._workspaceComposeMode ?? this._workspaceMode ?? 'galaxy');

    if (active && (mode === 'industry' || mode === 'subdomain')) {
      const anchor = this._getLocalWorkspaceAnchor(mode);
      if (anchor) this.cameraCtrl.setLocalWorkspaceEndPose(anchor, mode);
    }

    this.cameraCtrl.setWorkspaceCompose(active, width, height, animate, mode);
  }

  private _getLocalWorkspaceAnchor(mode: 'industry' | 'subdomain'): THREE.Vector3 | null {
    if (mode === 'subdomain') return new THREE.Vector3(0, 0, 0);

    const industryId =
      this._workspaceFocusIndustryId ??
      this.navigation?.selectedIndustry?.id ??
      this._findUserIndustryId();
    if (!industryId) return null;

    const idx = (this._industries ?? []).findIndex((i) => i.id === industryId);
    if (idx < 0) return this.cameraCtrl.controls.target.clone();
    return this.galaxyParticles.getIndustryPosition(idx);
  }

  private _findUserIndustryId(): string | null {
    const industries = this._industries ?? [];
    const myCompanyId = this._data?.myCompanyNodeId;
    if (myCompanyId) {
      for (const industry of industries) {
        for (const subdomain of industry.subdomains ?? []) {
          for (const company of subdomain.companies ?? []) {
            if (company.id === myCompanyId) return industry.id;
          }
        }
      }
    }
    return industries[0]?.id ?? null;
  }

  /** Begin twin workspace from galaxy level (fly to black hole). */
  openTwinWorkspaceFromGalaxy(): void {
    this.enterTwinWorkspaceFocus('galaxy');
    this.navigation?.goToGalaxy();
  }

  /** Begin twin workspace from industry level (compose view — no camera fly). */
  openTwinWorkspaceFromIndustry(): void {
    this.enterTwinWorkspaceFocus('industry');
  }

  /** Begin twin workspace from subdomain level (compose view — no camera fly). */
  openTwinWorkspaceFromSubdomain(): void {
    this.enterTwinWorkspaceFocus('subdomain');
  }

  enterTwinWorkspaceFocus(mode: 'galaxy' | 'industry' | 'subdomain'): void {
    if (this._workspaceFocused || this._disposed) return;
    this._workspaceFocused = true;
    this._workspaceMode = mode;

    if (mode === 'subdomain') {
      this._workspaceFocusIndustryId = this.navigation?.selectedIndustry?.id ?? null;
      this._workspaceFocusSubdomainId = this.navigation?.selectedSubdomain?.id ?? null;
    } else {
      this._workspaceFocusSubdomainId = null;
      this._workspaceFocusIndustryId =
        mode === 'industry'
          ? (this.navigation?.selectedIndustry?.id ?? this._findUserIndustryId())
          : this._findUserIndustryId();
    }

    if (mode === 'galaxy') this.applyTwinWorkspaceFocus();
  }

  applyIndustryWorkspaceProgress(industryId: string, t: number): void {
    if (!industryId || this._disposed) return;
    this.systemParticles?.setIndustryWorkspaceFocusProgress(industryId, t);
    this.iconParticles?.setWorkspaceFocusProgress(industryId, t);
    this.labels?.setIndustryWorkspaceFocusProgress(industryId, t);
    this.galaxyParticles?.setIndustryWorkspaceBackdropProgress(t);
  }

  applySubdomainWorkspaceProgress(t: number): void {
    if (this._disposed || !this.subdomainSolarSystem?.active) return;
    this.labels?.setSubdomainWorkspaceLabelsProgress(t);
  }

  applyTwinWorkspaceFocus(): void {
    if (!this._workspaceFocused || this._disposed) return;

    if (this._workspaceMode === 'galaxy') {
      this.systemParticles?.setWorkspaceFocus(null, true);
      this.iconParticles?.setWorkspaceFocus(null, true);
      this.labels?.setWorkspaceFocus(null, true);
    }
  }

  exitTwinWorkspaceFocus(): void {
    if (!this._workspaceFocused || this._disposed) return;

    const mode = this._workspaceMode;

    if (mode === 'galaxy') {
      this.systemParticles?.setWorkspaceFocus(null, false);
      this.iconParticles?.setWorkspaceFocus(null, false);
      this.labels?.setWorkspaceFocus(null, false);
      this._workspaceFocusIndustryId = null;
      this.labels?.setActiveIndustry(null);
    }
    // Industry/subdomain restore is driven by setWorkspaceCompose(false) progress callback.

    this._workspaceFocused = false;
    this._workspaceMode = null;
  }

  private _setUniverseInteractive(interactive: boolean): void {
    this.container.style.pointerEvents = interactive ? 'auto' : 'none';
    if (this.engine?.canvas) {
      this.engine.canvas.style.pointerEvents = interactive ? 'auto' : 'none';
    }

    this.cameraCtrl?.setInteractionLocked(!interactive);
    this.navigation?.setInteractionEnabled(interactive);
    this.labels?.setInteractionEnabled(interactive);

    if (!interactive) {
      this._callbacks?.onHover?.(null);
    }
  }

  /** Force-restore pointer + orbit after twin workspace closes. */
  restoreUniverseInteraction(): void {
    this._setUniverseInteractive(true);
  }

  /**
   * Spawn a draft company planet into the current subdomain solar system.
   * Returns the draft company ID so React can track it for form binding.
   */
  spawnDraftCompany(industryId: string, subdomainId: string): string | null {
    if (!this.subdomainSolarSystem?.active) return null;
    const industry = this._industries?.find(i => i.id === industryId);
    const subdomain = industry?.subdomains.find(s => s.id === subdomainId);
    if (!industry || !subdomain) return null;

    const draftId = `draft-${Date.now()}`;
    const draftCompany = { id: draftId, name: 'New Company', employees: 10, departments: [] };

    const mesh = this.subdomainSolarSystem.addCompanyPlanet(draftCompany, subdomain, industry);
    if (!mesh) return null;

    // Add a floating label for the new planet
    this.labels.addSingleCompanyLabel(draftId, 'New Company', mesh, industry.color);

    return draftId;
  }

  /** Live-update the draft planet's label text as user types */
  updateDraftName(draftId: string, name: string): void {
    this.labels.updateCompanyLabelText(draftId, name);
    this.subdomainSolarSystem?.updateCompanyLabel(draftId, name);
  }

  /** Remove the draft company planet if the user cancels creation */
  removeDraftCompany(draftId: string): void {
    this.labels.removeSpecific(`company-${draftId}`);
    this.subdomainSolarSystem?.removeCompanyPlanet(draftId);
  }

  /**
   * Get the screen-space (CSS pixel) position of a company planet.
   * Used by React to draw a connector line from the form modal to the planet.
   */
  getCompanyScreenPos(companyId: string): { x: number; y: number } | null {
    if (!this.subdomainSolarSystem?.active || !this.engine) return null;
    const wp = this.subdomainSolarSystem.getCompanyWorldPosition(companyId);
    if (wp.lengthSq() === 0) return null;

    const v = wp.clone().project(this.engine.camera);
    const rect = this.container.getBoundingClientRect();
    return {
      x: (v.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-v.y * 0.5 + 0.5) * rect.height + rect.top,
    };
  }

  /**
   * Fly the camera to a draft company planet and freeze all orbits.
   * Planet is positioned so it fills the right portion of the screen
   * while the form panel sits on the left.
   */
  focusDraftPlanet(draftId: string): void {
    if (!this.subdomainSolarSystem?.active || !this.engine) return;
    const wp = this.subdomainSolarSystem.getCompanyWorldPosition(draftId);
    if (wp.lengthSq() === 0) return;

    // Freeze all orbits so the planet stays locked in place
    this.subdomainSolarSystem.freeze();

    // Disable user controls so nothing interferes with the cinematic
    this.cameraCtrl.controls.enabled = false;

    // Camera positioned to the upper-left of the planet so it dominates
    // the RIGHT half of the screen while the form modal sits on the LEFT.
    // Distance ~38 units → planet (r=12) subtends ~35° of vertical FOV → very large.
    const camTarget = wp.clone();
    const camPos = wp.clone().add(new THREE.Vector3(-18, 8, 32));

    this.cameraCtrl.isTransitioning = true;
    gsap.to(this.engine.camera.position, {
      x: camPos.x, y: camPos.y, z: camPos.z,
      duration: 1.8,
      ease: 'power3.inOut',
      onUpdate: () => {
        this.engine.camera.lookAt(camTarget);
        this.cameraCtrl.controls.target.copy(camTarget);
      },
      onComplete: () => {
        this.cameraCtrl.isTransitioning = false;
        this.cameraCtrl.controls.target.copy(camTarget);
        // Keep controls disabled — user can only interact via the form
      },
    });
  }

  /** Unfreeze all orbits, re-enable controls, and fly camera back to subdomain overview. */
  unfocusDraftPlanet(): void {
    if (!this.subdomainSolarSystem?.active) return;
    this.subdomainSolarSystem.unfreeze();

    if (!this.engine) return;
    this.cameraCtrl.isTransitioning = true;
    gsap.to(this.engine.camera.position, {
      x: 0, y: 200, z: 750,
      duration: 1.4,
      ease: 'power2.inOut',
      onUpdate: () => {
        this.engine.camera.lookAt(0, 0, 0);
        this.cameraCtrl.controls.target.set(0, 0, 0);
      },
      onComplete: () => {
        this.cameraCtrl.isTransitioning = false;
        this.cameraCtrl.controls.target.set(0, 0, 0);
        this.cameraCtrl.controls.update();
        this.cameraCtrl.controls.enabled = true;  // restore user controls
      },
    });
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    if (this._onWorkflowsUpdated) {
      window.removeEventListener('workflows_updated', this._onWorkflowsUpdated);
      this._onWorkflowsUpdated = null;
    }

    gsap.globalTimeline.clear();

    this.engine?.stop();
    this.navigation?.dispose();
    this.labels?.dispose();
    this.iconParticles?.dispose();
    this.galaxyParticles?.dispose();
    this.cameraCtrl?.dispose();
    this.postProcessing?.dispose?.();
    this.engine?.dispose();
  }
}

export { ZOOM_LEVELS };
