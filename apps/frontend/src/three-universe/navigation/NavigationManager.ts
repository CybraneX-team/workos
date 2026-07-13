// @ts-nocheck
/**
 * NavigationManager.js — Unified Hierarchy Navigation
 * 
 * Hierarchy: Galaxy → Industry → Subdomain → Company → Department
 * Morphs systems in and out rather than toggling visibility.
 */

import * as THREE from 'three';
import gsap from 'gsap';
import { ZOOM_LEVELS } from '../engine/CameraController.js';
import { SubdomainSolarSystem } from './SubdomainSolarSystem.js';
import {
  saveUniverseNavState,
  clearUniverseNavState,
} from '../../lib/universeNavPersistence.js';

export class NavigationManager {
  constructor(camera, canvas, cameraController, systems) {
    this.camera = camera;
    this.canvas = canvas;
    this.container = systems.container || canvas.parentElement;
    this.cameraCtrl = cameraController;
    this.galaxyParticles = systems.galaxyParticles;
    this.systemParticles = systems.systemParticles;
    this._subdomainSolarSystem = systems.scene ? new SubdomainSolarSystem(systems.scene) : null;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.currentLevel = ZOOM_LEVELS.GALAXY;
    this.navigationPath = [];
    this.hoveredObject = null;
    this.selectedIndustry = null;
    this.selectedSubdomain = null;
    this.selectedCompany = null;
    this._isCoreZoomedIn = false;
    this._hoveredCore = false;
    this.onIndustryCoreVoiceToggle = null;

    this.onNavigate = null;
    this.onNavigateBegin = null; // fires immediately at nav start — for early label/UI updates
    this.onHover = null;
    this.onSelect = null;
    this.onEnterCompanyPolytope = null;
    this.onEnterCompanyInterior = null;
    this.onExitCompanyPolytope  = null;
    this.onInteriorLevelChange = null;
    /** Fired after zoom to company — show role picker before roots */
    this.onCompanyAwaitingRole = null;
    this.onEnterCompanyPlanetRoots = null;
    this.onPlanetLevelChange = null;
    this.myCompanyNodeId = null;
    this._companyDepartments = [];
    this._interiorCameraLock = false;
    this._companyInteriorMode = 'none';

    this._afterNextNavigate = null;

    this._interactionEnabled = true;
    /** When true, goToGalaxy must not restore orbiting industry systems. */
    this.isTwinWorkspaceActive = null;
    this.onGalaxyNavigationComplete = null;

    this._bind();
    this._initEvents();
  }

  // Called at the end of every navigation — fires one-shot callback if set
  _onNavigateDone(path, level) {
    this._persistNavState(path, level);
    if (this.onNavigate) this.onNavigate(path, level);
    if (this._afterNextNavigate) {
      const cb = this._afterNextNavigate;
      this._afterNextNavigate = null;
      cb();
    }
  }

  _persistNavState(path, level) {
    if (level === ZOOM_LEVELS.GALAXY) {
      if (this.galaxyParticles && this.galaxyParticles._insideBH) {
        // Do not clear state if we are inside the black hole, we want to save it below!
      } else {
        clearUniverseNavState();
        return;
      }
    }
    if (level === ZOOM_LEVELS.DEPARTMENT) return;

    const industryId = path[0]?.id;
    if (!industryId) {
      if (this.galaxyParticles?._insideBH) {
        const cam = this.camera.position;
        const target = this.cameraCtrl.controls.target;
        saveUniverseNavState({
          level: 'industry', // fallback
          industryId: 'bh',
          interiorMode: null,
          insideBH: true,
          cameraPosition: [cam.x, cam.y, cam.z],
          cameraTarget: [target.x, target.y, target.z],
        });
      }
      return;
    }

    const cam = this.camera.position;
    const target = this.cameraCtrl.controls.target;
    const navLevel =
      level === ZOOM_LEVELS.INDUSTRY
        ? 'industry'
        : level === ZOOM_LEVELS.SUBDOMAIN
          ? 'subdomain'
          : 'company';

    saveUniverseNavState({
      level: navLevel,
      industryId,
      subdomainId: path[1]?.id,
      companyId: path[2]?.id,
      interiorMode: this._companyInteriorMode || null,
      insideBH: !!this.galaxyParticles?._insideBH,
      cameraPosition: [cam.x, cam.y, cam.z],
      cameraTarget: [target.x, target.y, target.z],
    });
  }

  _bind() {
    this._onClick = this._onClick.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);
    this._onKey = this._onKey.bind(this);
  }

  _initEvents() {
    this.canvas.addEventListener('click', this._onClick);
    this.canvas.addEventListener('mousemove', this._onMove);
    this.canvas.addEventListener('mouseleave', this._onMouseLeave);
    window.addEventListener('keydown', this._onKey);
  }

  _setMouse(e) {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _onMove(e) { if (!this._interactionEnabled) return; this._setMouse(e); this._hover(); }
  _onMouseLeave(e) {
    if (this.hoveredObject) {
      this._unhover(this.hoveredObject);
      this.hoveredObject = null;
      this.canvas.style.cursor = 'default';
      if (this.onHover) this.onHover(null);
    }
    if (this.currentLevel === ZOOM_LEVELS.GALAXY && this._hoveredIndustryId) {
      this._hoveredIndustryId = null;
      this.canvas.style.cursor = 'default';
      if (this.onHover) this.onHover(null);
    }
  }
  _onClick(e) { if (!this._interactionEnabled) return; if (!this.cameraCtrl.isTransitioning) { this._setMouse(e); this._click(); } }
  _onKey(e) {
    if (!this._interactionEnabled) return;
    if (e.key === 'Escape') { 
      if (this.currentLevel === ZOOM_LEVELS.COMPANY) {
        const sss = this._subdomainSolarSystem;
        if (sss?.interiorViewActive && sss.drillInteriorBack()) {
          e.preventDefault();
          // this._refocusCompanyInteriorCamera(true);
          return;
        }
      }
      e.preventDefault(); 
      this.goBack(); 
    } 
  }

  _hover() {
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // ── GALAXY level: hover over industry galaxies ──
    if (this.currentLevel === ZOOM_LEVELS.GALAXY) {
      const clickMeshes = this.systemParticles.getGalaxyClickMeshes();
      if (this._iconParticles) {
        this._iconParticles.icons.forEach(({ points }) => clickMeshes.push(points));
      }
      if (this.galaxyParticles._bhGroup && this.galaxyParticles._bhGroup.visible) {
        clickMeshes.push(...this.galaxyParticles._bhGroup.children);
      }
      const hits = this.raycaster.intersectObjects(clickMeshes, false);
      if (hits.length > 0) {
        const obj = hits[0].object;
        if (this.galaxyParticles._bhGroup && this.galaxyParticles._bhGroup.children.includes(obj)) {
          if (this._hoveredIndustryId !== 'blackhole') {
            this._hoveredIndustryId = 'blackhole';
            this.canvas.style.cursor = 'pointer';
            if (this.onHover) this.onHover(null);
          }
          return;
        }

        const id = obj.userData._industryId || obj.userData.industryId;
        const industry = (this._industries || []).find(i => i.id === id);
        if (industry) {
          if (this._hoveredIndustryId !== id) {
            this._hoveredIndustryId = id;
            this.canvas.style.cursor = 'pointer';
            if (this.onHover) {
              const wp = new THREE.Vector3();
              hits[0].object.getWorldPosition(wp);
              wp.project(this.camera);
              const rect = this.container.getBoundingClientRect();
              const screenX = (wp.x * 0.5 + 0.5) * rect.width + rect.left;
              const screenY = -(wp.y * 0.5 - 0.5) * rect.height + rect.top;
              this.onHover({ type: 'industry', industry, screenX, screenY });
            }
          }
          return;
        }
      }
      if (this._hoveredIndustryId) {
        this._hoveredIndustryId = null;
        this.canvas.style.cursor = 'default';
        if (this.onHover) this.onHover(null);
      }
      return;
    }

    // ── Deeper levels: hover over planets ──
    let hits = [];
    if (this.currentLevel === ZOOM_LEVELS.INDUSTRY && this.selectedIndustry) {
      // ── Check star core hover FIRST (no scale-up, just pointer + tooltip) ──
      const sys = this.systemParticles.systems.get(this.selectedIndustry.id);
      const starMesh = sys?.coreGroup?.children?.find(c => c.isMesh);
      if (starMesh) {
        const starHits = this.raycaster.intersectObject(starMesh);
        if (starHits.length > 0) {
          if (!this._hoveredCore) {
            this._hoveredCore = true;
            // Clear any planet hover without triggering scale-down on star
            if (this.hoveredObject) {
              this._unhover(this.hoveredObject);
              this.hoveredObject = null;
            }
            this.canvas.style.cursor = 'pointer';
            if (this.onHover) {
              const wp = new THREE.Vector3();
              starMesh.getWorldPosition(wp);
              wp.project(this.camera);
              const rect = this.container.getBoundingClientRect();
              const screenX = (wp.x * 0.5 + 0.5) * rect.width + rect.left;
              const screenY = -(wp.y * 0.5 - 0.5) * rect.height + rect.top;
              this.onHover({ 
                type: 'core', 
                level: 'industry',
                nodeLabel: 'Click to interact with WorkOS AI', 
                screenX, 
                screenY,
                industry: this.selectedIndustry 
              });
            }
          }
          return;
        }
      }
      // Mouse left the star core area
      if (this._hoveredCore) {
        this._hoveredCore = false;
        this.canvas.style.cursor = 'default';
        if (this.onHover) this.onHover(null);
      }

      const meshes = this.systemParticles.getSubdomainMeshes(this.selectedIndustry.id);
      hits = this.raycaster.intersectObjects(meshes);
    } else if (this.currentLevel === ZOOM_LEVELS.SUBDOMAIN && this.selectedSubdomain) {
      // ── Check star core hover FIRST (no scale-up, just pointer + tooltip) ──
      const sdSunMesh = this._subdomainSolarSystem?.sunMesh;
      if (sdSunMesh) {
        const starHits = this.raycaster.intersectObject(sdSunMesh);
        if (starHits.length > 0) {
          if (!this._hoveredCore) {
            this._hoveredCore = true;
            // Clear any planet hover without triggering scale-down on star
            if (this.hoveredObject) {
              this._unhover(this.hoveredObject);
              this.hoveredObject = null;
            }
            this.canvas.style.cursor = 'pointer';
            if (this.onHover) {
              const wp = new THREE.Vector3();
              sdSunMesh.getWorldPosition(wp);
              wp.project(this.camera);
              const rect = this.container.getBoundingClientRect();
              const screenX = (wp.x * 0.5 + 0.5) * rect.width + rect.left;
              const screenY = -(wp.y * 0.5 - 0.5) * rect.height + rect.top;
              this.onHover({ 
                type: 'core', 
                level: 'subdomain',
                nodeLabel: 'Click to interact with WorkOS AI', 
                screenX, 
                screenY,
                industry: this.selectedIndustry 
              });
            }
          }
          return;
        }
      }
      // Mouse left the star core area
      if (this._hoveredCore) {
        this._hoveredCore = false;
        this.canvas.style.cursor = 'default';
        if (this.onHover) this.onHover(null);
      }

      const meshes = this._subdomainSolarSystem?.companyMeshes?.length
        ? this._subdomainSolarSystem.companyMeshes
        : this.systemParticles.getCompanyMeshes(this.selectedIndustry.id, this.selectedSubdomain.id);
      hits = this.raycaster.intersectObjects(meshes);
    } else if (this.currentLevel === ZOOM_LEVELS.COMPANY && this.selectedCompany) {
      const interior = this._subdomainSolarSystem?.getInteriorNodeMeshes?.() ?? [];
      if (interior.length) {
        hits = this.raycaster.intersectObjects(interior);
      } else {
        const meshes = this.systemParticles.getDeptMeshes(this.selectedIndustry.id, this.selectedSubdomain.id, this.selectedCompany.id);
        hits = this.raycaster.intersectObjects(meshes);
      }
    }

    if (hits.length > 0) {
      const obj = hits[0].object;
      if (this.hoveredObject !== obj) {
        if (this.hoveredObject) this._unhover(this.hoveredObject);
        this.hoveredObject = obj;
        this._doHover(obj);
        this.canvas.style.cursor = 'pointer';
        if (this.onHover) {
          const wp = new THREE.Vector3();
          obj.getWorldPosition(wp);
          wp.project(this.camera);
          const rect = this.container.getBoundingClientRect();
          const screenX = (wp.x * 0.5 + 0.5) * rect.width + rect.left;
          const screenY = -(wp.y * 0.5 - 0.5) * rect.height + rect.top;
          this.onHover({ ...obj.userData, screenX, screenY });
        }
      }
    } else {
      if (this.hoveredObject) {
        this._unhover(this.hoveredObject);
        this.hoveredObject = null;
        this.canvas.style.cursor = 'default';
        if (this.onHover) this.onHover(null);
      }
    }
  }

  _doHover(o) {
    gsap.to(o.scale, { x: 1.25, y: 1.25, z: 1.25, duration: 0.25, ease: 'back.out(2)' });
    if (o.material && o.material.emissiveIntensity !== undefined) {
      o._origEmI = o.material.emissiveIntensity;
      gsap.to(o.material, { emissiveIntensity: 0.5, duration: 0.25 });
    }
  }

  _unhover(o) {
    gsap.to(o.scale, { x: 1, y: 1, z: 1, duration: 0.25, ease: 'power2.out' });
    if (o.material && o._origEmI !== undefined) {
      gsap.to(o.material, { emissiveIntensity: o._origEmI, duration: 0.25 });
    }
  }

  setIconParticles(iconParticles, industries) {
    this._iconParticles = iconParticles;
    this._industries = industries;
  }

  setSubdomainSolarSystem(sss) {
    this._subdomainSolarSystem = sss;
  }

  setMyCompanyNodeId(id) {
    this.myCompanyNodeId = id;
  }

  setCompanyDepartments(departments) {
    this._companyDepartments = departments ?? [];
    const iv = this._subdomainSolarSystem?.interiorView;
    if (iv?.active) {
      iv.departments = this._companyDepartments;
      iv._buildRing(iv._nodesAtCurrentLevel(), false);
    }
  }

  _isLoggedInCompany(company) {
    if (!company) return false;
    if (this.myCompanyNodeId) return company.id === this.myCompanyNodeId;
    return !!company.isLive;
  }

  _refocusCompanyInteriorCamera(animateForward = false) {
    const sss = this._subdomainSolarSystem;
    if (!sss?.interiorViewActive) return;
    const wp = sss.getInteriorFocusPosition();
    if (!wp) return;
    const dist = sss.getInteriorCameraDistance();

    if (!animateForward) {
      this.cameraCtrl.snapTo(wp, dist, ZOOM_LEVELS.COMPANY, null);
      return;
    }

    const toCam = new THREE.Vector3().subVectors(this.camera.position, this.cameraCtrl.controls.target);
    const len = toCam.length();
    const dir = len < 1
      ? new THREE.Vector3(0.4, 0.35, 0.85).normalize()
      : toCam.divideScalar(len);
    const newCamPos = new THREE.Vector3().copy(wp).add(dir.multiplyScalar(dist));
    newCamPos.y = Math.max(newCamPos.y, wp.y + dist * 0.25);

    gsap.to(this.camera.position, {
      x: newCamPos.x, y: newCamPos.y, z: newCamPos.z,
      duration: 0.7, ease: 'power2.inOut',
      onUpdate: () => { this.cameraCtrl.controls.update(); },
    });
    gsap.to(this.cameraCtrl.controls.target, {
      x: wp.x, y: wp.y, z: wp.z,
      duration: 0.7, ease: 'power2.inOut',
      onUpdate: () => { this.cameraCtrl.controls.update(); },
    });
  }

  _enterPlanetRootView(industry, subdomain, company, tree, earlyPath) {
    if (this.onEnterCompanyPlanetRoots) this.onEnterCompanyPlanetRoots(company);

    const sss = this._subdomainSolarSystem;
    if (sss?.group?.visible) {
      const mesh = sss.companyMeshes.find(m => m.userData.company?.id === company.id);
      if (mesh) {
        sss.enterCompanyPlanetRoots(mesh, tree, industry?.color);
        const iv = sss.planetRootView;
        iv.onLevelChange = (depth, path) => {
          if (this.onPlanetLevelChange) this.onPlanetLevelChange(depth, path);
          if (this.onInteriorLevelChange) this.onInteriorLevelChange(depth, path);
        };
      }
    }

    this.currentLevel = ZOOM_LEVELS.COMPANY;
    this.navigationPath = earlyPath;
    this._companyInteriorMode = 'planet';
    this._onNavigateDone(this.navigationPath, this.currentLevel);
    this._interiorCameraLock = true;
    this._refocusCompanyInteriorCamera(true);
  }

  /** Called from React after user picks Career / Founder / Investor */
  confirmPlanetRole(industry, subdomain, company, tree) {
    const earlyPath = [
      { level: ZOOM_LEVELS.INDUSTRY, id: industry.id, name: industry.name, data: industry },
      { level: ZOOM_LEVELS.SUBDOMAIN, id: subdomain.id, name: subdomain.name, data: subdomain },
      { level: ZOOM_LEVELS.COMPANY, id: company.id, name: company.name, data: company },
    ];
    this.selectedCompany = company;
    this._enterPlanetRootView(industry, subdomain, company, tree, earlyPath);
  }

  _enterLoggedInDeptInterior(industry, subdomain, company) {
    if (this.onEnterCompanyInterior) this.onEnterCompanyInterior(company);
    const sss = this._subdomainSolarSystem;
    if (sss?.group?.visible) {
      const mesh = sss.companyMeshes.find(m => m.userData.company?.id === company.id);
      if (mesh) {
        sss.enterCompanyInterior(mesh, this._companyDepartments, industry?.color);
        sss.interiorView.onLevelChange = () => {
          if (this.onInteriorLevelChange) {
            this.onInteriorLevelChange(sss.interiorView.depth, [...sss.interiorView.path]);
          }
        };
      }
    }
    this._companyInteriorMode = 'dept';
    this._interiorCameraLock = true;
    this._refocusCompanyInteriorCamera(true);
  }

  _click() {
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Galaxy level — click icon particles OR galaxy star/dust to navigate
    if (this.currentLevel === ZOOM_LEVELS.GALAXY) {
      const clickMeshes = this.systemParticles.getGalaxyClickMeshes();
      if (this._iconParticles) {
        this._iconParticles.icons.forEach(({ points }) => clickMeshes.push(points));
      }
      if (this.galaxyParticles._bhGroup && this.galaxyParticles._bhGroup.visible) {
        clickMeshes.push(...this.galaxyParticles._bhGroup.children);
      }
      const hits = this.raycaster.intersectObjects(clickMeshes, false);
      if (hits.length > 0) {
        const obj = hits[0].object;
        
        if (this.galaxyParticles._bhGroup && this.galaxyParticles._bhGroup.children.includes(obj)) {
          this.cameraCtrl.flyTo(new THREE.Vector3(0, 0, 0), 1000, ZOOM_LEVELS.GALAXY);
          return;
        }

        const id = obj.userData._industryId || obj.userData.industryId;
        const idx = (this._industries || []).findIndex(i => i.id === id);
        if (idx >= 0) { this.navigateToIndustry(this._industries[idx], idx); return; }
      }
    }

    if (this.currentLevel === ZOOM_LEVELS.INDUSTRY && this.selectedIndustry) {
      const sys = this.systemParticles.systems.get(this.selectedIndustry.id);
      const starMesh = sys?.coreGroup?.children?.find(c => c.isMesh);
      if (starMesh) {
        const starHits = this.raycaster.intersectObject(starMesh);
        if (starHits.length > 0) {
          this.toggleIndustryCoreZoom(this.selectedIndustry);
          return;
        }
      }

      const meshes = this.systemParticles.getSubdomainMeshes(this.selectedIndustry.id);
      const hits = this.raycaster.intersectObjects(meshes);
      if (hits.length > 0) {
        const { subdomain, industry } = hits[0].object.userData;
        this.navigateToSubdomain(industry, subdomain);
        return;
      }
    } else if (this.currentLevel === ZOOM_LEVELS.SUBDOMAIN && this.selectedSubdomain) {
      const sdSunMesh = this._subdomainSolarSystem?.sunMesh;
      if (sdSunMesh) {
        const starHits = this.raycaster.intersectObject(sdSunMesh);
        if (starHits.length > 0) {
          this.toggleSubdomainCoreZoom(this.selectedIndustry, this.selectedSubdomain);
          return;
        }
      }

      const meshes = this._subdomainSolarSystem?.companyMeshes?.length
        ? this._subdomainSolarSystem.companyMeshes
        : this.systemParticles.getCompanyMeshes(this.selectedIndustry.id, this.selectedSubdomain.id);
      const hits = this.raycaster.intersectObjects(meshes);
      if (hits.length > 0) {
        const { company, subdomain, industry } = hits[0].object.userData;
        this.navigateToCompany(industry, subdomain, company);
        return;
      }
    } else if (this.currentLevel === ZOOM_LEVELS.COMPANY && this.selectedCompany) {
      const sss = this._subdomainSolarSystem;
      const interiorMeshes = sss?.getInteriorNodeMeshes?.() ?? [];
      if (interiorMeshes.length) {
        const hits = this.raycaster.intersectObjects(interiorMeshes);
        if (hits.length > 0) {
          const ud = hits[0].object.userData;
          if (ud.canDrill && sss.drillInteriorInto(ud.nodeId)) {
            // Do not zoom in or move camera on node click
            // this._refocusCompanyInteriorCamera(true);
          }
          return;
        }
      }
      const meshes = this.systemParticles.getDeptMeshes(this.selectedIndustry.id, this.selectedSubdomain.id, this.selectedCompany.id);
      const hits = this.raycaster.intersectObjects(meshes);
      if (hits.length > 0) {
        const { department, company, subdomain, industry } = hits[0].object.userData;
        this.navigateToDepartment(industry, subdomain, company, department);
        return;
      }
    }
  }

  /** Keep orbit target on company sphere while exploring interior nodes */
  updateInteriorCamera() {
    if (!this._interiorCameraLock || this.currentLevel !== ZOOM_LEVELS.COMPANY) return;
    const sss = this._subdomainSolarSystem;
    if (!sss?.interiorViewActive) return;
    const wp = sss.getInteriorFocusPosition();
    if (!wp) return;
    this.cameraCtrl.controls.target.lerp(wp, 0.14);
    this.cameraCtrl.controls.update();
  }

  // ═══ NAVIGATE TO INDUSTRY ═══
  navigateToIndustry(industry, idx, total) {
    if (this.cameraCtrl.isTransitioning) return;
    this.selectedIndustry = industry;
    // Set level IMMEDIATELY so main.js orbit loop stops overriding group positions this frame
    this.cameraCtrl.currentLevel = ZOOM_LEVELS.INDUSTRY;
    this.galaxyParticles.setInsideIndustry(true);

    // Push other galaxies to far edge + scale down
    // ← TUNING: FAR_RADIUS = fixed distance from active galaxy each other gets pushed to
    // ← TUNING: SIZE_SCALE = apparent size (0=invisible, 1=full)
    const FAR_RADIUS = 20000;  // huge distance — others become specks at edge
    const SIZE_SCALE = 0.08;
    const activePos  = this.galaxyParticles.getIndustryPosition(idx);

    this.systemParticles.systems.forEach((sys, id) => {
      if (id !== industry.id) {
        if (!sys.group.userData._origPos) {
          sys.group.userData._origPos = sys.group.position.clone();
        }
        const orig = sys.group.userData._origPos;
        // Direction from active → this galaxy, then place at FAR_RADIUS along that dir
        const dir = orig.clone().sub(activePos);
        if (dir.lengthSq() === 0) dir.set(1, 0, 0);
        dir.normalize().multiplyScalar(FAR_RADIUS);
        const target = activePos.clone().add(dir);

        gsap.killTweensOf(sys.group.position);
        gsap.killTweensOf(sys.group.scale);
        gsap.to(sys.group.position, { x: target.x, y: target.y, z: target.z, duration: 4.5, ease: 'power2.inOut' });
        gsap.to(sys.group.scale,    { x: SIZE_SCALE, y: SIZE_SCALE, z: SIZE_SCALE, duration: 4.0, ease: 'power2.inOut' });
      }
    });

    // Start morph mid-flight (slight delay for dramatic effect)
    setTimeout(() => {
      const sys = this.systemParticles.systems.get(industry.id);
      if (sys && sys.orbitGroup.scale.x < 0.5) {
        gsap.killTweensOf(sys.orbitGroup.scale);
        sys.orbitGroup.visible = true;
        gsap.to(sys.orbitGroup.scale, { x: 1, y: 1, z: 1, duration: 1.8, ease: 'power2.out' });
      }
    }, 300);

    const pos = this.galaxyParticles.getIndustryPosition(idx);
    this.cameraCtrl.flyTo(pos, 2500, ZOOM_LEVELS.INDUSTRY, () => {
      this.currentLevel = ZOOM_LEVELS.INDUSTRY;
      this.navigationPath = [{ level: ZOOM_LEVELS.INDUSTRY, id: industry.id, name: industry.name, data: industry }];
      // Cap zoom-out: just enough to see all subdomains, can't scroll back to galaxy
      this.cameraCtrl.setZoomCap(5500);
      this._onNavigateDone(this.navigationPath, this.currentLevel);
    });
  }

  toggleSubdomainCoreZoom(industry, subdomain) {
    if (this.cameraCtrl.isTransitioning) return;

    const sdSys = this._subdomainSolarSystem;
    if (!sdSys) return;

    const isZoomedIn = this._isCoreZoomedIn;

    if (!isZoomedIn) {
      this._isCoreZoomedIn = true;

      if (this.onIndustryCoreVoiceToggle) {
        this.onIndustryCoreVoiceToggle(industry, true);
      }

      // Hide company planets
      sdSys._containers.forEach(cc => {
        gsap.killTweensOf(cc.container.scale);
        gsap.to(cc.container.scale, {
          x: 0.001, y: 0.001, z: 0.001,
          duration: 0.8,
          ease: 'power2.inOut',
          onComplete: () => {
            cc.container.visible = false;
          }
        });
      });

      if (this.labels) {
        this.labels.setVisibility('company-', false);
      }

      const oldMinDist = this.cameraCtrl.controls.minDistance;
      this.cameraCtrl.controls.minDistance = 10;
      this.cameraCtrl.flyTo(new THREE.Vector3(0, 0, 0), 100, ZOOM_LEVELS.SUBDOMAIN, () => {
        this.cameraCtrl.controls.minDistance = oldMinDist;
      });

    } else {
      this._isCoreZoomedIn = false;

      if (this.onIndustryCoreVoiceToggle) {
        this.onIndustryCoreVoiceToggle(industry, false);
      }

      sdSys._containers.forEach(cc => {
        cc.container.visible = true;
        gsap.killTweensOf(cc.container.scale);
        gsap.to(cc.container.scale, {
          x: 1, y: 1, z: 1,
          duration: 1.0,
          ease: 'power2.out'
        });
      });

      if (this.labels) {
        this.labels.setVisibility('company-', true);
      }

      this.cameraCtrl.flyTo(new THREE.Vector3(0, 0, 0), 750, ZOOM_LEVELS.SUBDOMAIN);
    }
  }

  toggleIndustryCoreZoom(industry) {
    if (this.cameraCtrl.isTransitioning) return;

    const sys = this.systemParticles.systems.get(industry.id);
    if (!sys) return;

    const isZoomedIn = this._isCoreZoomedIn;

    if (!isZoomedIn) {
      this._isCoreZoomedIn = true;

      if (this.onIndustryCoreVoiceToggle) {
        this.onIndustryCoreVoiceToggle(industry, true);
      }

      if (sys.orbitGroup) {
        gsap.killTweensOf(sys.orbitGroup.scale);
        gsap.to(sys.orbitGroup.scale, {
          x: 0.001, y: 0.001, z: 0.001,
          duration: 0.8,
          ease: 'power2.inOut',
          onComplete: () => {
            sys.orbitGroup.visible = false;
          }
        });
      }

      // Hide other industry systems
      this.systemParticles.systems.forEach((otherSys, id) => {
        if (id !== industry.id) {
          gsap.killTweensOf(otherSys.group.scale);
          gsap.to(otherSys.group.scale, {
            x: 0.001, y: 0.001, z: 0.001,
            duration: 0.8,
            ease: 'power2.inOut',
            onComplete: () => {
              otherSys.group.visible = false;
            }
          });
        }
      });

      // Hide black hole and backdrop
      if (this.galaxyParticles) {
        this.galaxyParticles.setIndustryWorkspaceBackdrop(true, 0.8);
      }

      if (this.labels) {
        this.labels.setVisibility('subdomain-', false);
      }

      const starPos = sys.group.position;
      const sizeMult = this.galaxyParticles.getSizeMultiplier(
        this._industries.findIndex(i => i.id === industry.id)
      ) || 1.0;
      const zoomDist = 180 * sizeMult;

      const oldMinDist = this.cameraCtrl.controls.minDistance;
      this.cameraCtrl.controls.minDistance = 10;

      this.cameraCtrl.flyTo(starPos, zoomDist, ZOOM_LEVELS.INDUSTRY, () => {
        this.cameraCtrl.controls.minDistance = oldMinDist;
      });

    } else {
      this._isCoreZoomedIn = false;

      if (this.onIndustryCoreVoiceToggle) {
        this.onIndustryCoreVoiceToggle(industry, false);
      }

      if (sys.orbitGroup) {
        sys.orbitGroup.visible = true;
        gsap.killTweensOf(sys.orbitGroup.scale);
        gsap.to(sys.orbitGroup.scale, {
          x: 1, y: 1, z: 1,
          duration: 1.0,
          ease: 'power2.out'
        });
      }

      // Restore other industry systems
      this.systemParticles.systems.forEach((otherSys, id) => {
        if (id !== industry.id) {
          otherSys.group.visible = true;
          gsap.killTweensOf(otherSys.group.scale);
          gsap.to(otherSys.group.scale, {
            x: 0.08, y: 0.08, z: 0.08,
            duration: 0.8,
            ease: 'power2.out'
          });
        }
      });

      // Restore black hole and backdrop
      if (this.galaxyParticles) {
        this.galaxyParticles.setIndustryWorkspaceBackdrop(false, 0.8);
      }

      if (this.labels) {
        this.labels.setVisibility('subdomain-', true);
      }

      const starPos = sys.group.position;
      this.cameraCtrl.flyTo(starPos, 2500, ZOOM_LEVELS.INDUSTRY, () => {
        // done
      });
    }
  }

  /** Camera pose matching flyTo(target, distance) for scene-swap teleports */
  _cameraPoseNearTarget(targetPosition, distance) {
    const dir = new THREE.Vector3(0.4, 0.35, 0.85).normalize();
    const pos = new THREE.Vector3()
      .copy(targetPosition)
      .add(dir.multiplyScalar(distance));
    pos.y = Math.max(pos.y, targetPosition.y + distance * 0.25);
    return { pos, target: targetPosition.clone() };
  }

  // ── Simple fade-to-black scene swap ─────────────────────────────────────
  // Fade out (300ms) → onMidpoint (instant scene swap) → fade in (300ms) → onComplete
  _fadeSwap(onMidpoint, onComplete) {
    this.cameraCtrl.isTransitioning = true;
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;z-index:200;pointer-events:none;transition:opacity 0.15s ease';
    this.container.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      setTimeout(() => {
        onMidpoint();
        requestAnimationFrame(() => {
          el.style.opacity = '0';
          setTimeout(() => {
            el.remove();
            this.cameraCtrl.isTransitioning = false;
            if (onComplete) onComplete();
          }, 150);
        });
      }, 150);
    });
  }

  // ═══ NAVIGATE TO SUBDOMAIN ═══
  navigateToSubdomain(industry, subdomain) {
    if (this.cameraCtrl.isTransitioning) return;
    this.selectedIndustry = industry;
    this.selectedSubdomain = subdomain;

    const earlyPath = [
      { level: ZOOM_LEVELS.INDUSTRY, id: industry.id, name: industry.name, data: industry },
      { level: ZOOM_LEVELS.SUBDOMAIN, id: subdomain.id, name: subdomain.name, data: subdomain },
    ];
    if (this.onNavigateBegin) this.onNavigateBegin(earlyPath, ZOOM_LEVELS.SUBDOMAIN);

    // ── Morph-out during zoom-in ──────────────────────────────────────────────

    // INSTANT: other galaxy systems + spiral + bg stars + universe sphere snap away
    this.galaxyParticles.setSubdomainLevel(true, 0.25);
    this.systemParticles.systems.forEach((sys, id) => {
      if (id !== industry.id) {
        gsap.killTweensOf(sys.group.scale);
        gsap.to(sys.group.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.25, ease: 'power2.in' });
      }
    });

    // DELAYED: target industry core + sibling subdomains morph out after camera starts moving
    const DELAY = 0.5;   // wait 0.5s so user sees the zoom-in start before things vanish
    const MORPH_DUR = 1.4;
    const targetSys = this.systemParticles.systems.get(industry.id);
    if (targetSys) {
      gsap.killTweensOf(targetSys.coreGroup.scale);
      gsap.to(targetSys.coreGroup.scale, { x: 0.001, y: 0.001, z: 0.001, duration: MORPH_DUR, delay: DELAY, ease: 'power3.inOut' });

      targetSys.subdomainContainers.forEach((sd, i) => {
        const mesh = targetSys.subdomainMeshes[i];
        if (mesh?.userData?.subdomain?.id !== subdomain.id) {
          gsap.killTweensOf(sd.container.scale);
          gsap.to(sd.container.scale, { x: 0.001, y: 0.001, z: 0.001, duration: MORPH_DUR, delay: DELAY, ease: 'power2.inOut' });
        }
      });

      if (targetSys.dustMat?.uniforms?.uSize) {
        gsap.killTweensOf(targetSys.dustMat.uniforms.uSize);
        gsap.to(targetSys.dustMat.uniforms.uSize, { value: 0, duration: MORPH_DUR, delay: DELAY, ease: 'power2.in' });
      }
    }

    // ── Phase 1: Fly INTO the subdomain planet ────────────────────────────────
    const wp = this.systemParticles.getSubdomainPosition(industry.id, subdomain.id);
    this.cameraCtrl.flyTo(wp, 5, ZOOM_LEVELS.SUBDOMAIN, () => {
      // ── Phase 2: Fade-swap scene ──────────────────────────────────────────
      this._fadeSwap(
        () => {
          // Disable BH FIRST — its group is at world origin (same as solar system)
          // and camera will pass within EH radius during the zoom-in animation.
          this.galaxyParticles.setBHEnabled(false);
          this.galaxyParticles.setVisible(false);
          this.systemParticles.systems.forEach(s => { s.group.visible = false; });
          if (this._subdomainSolarSystem) this._subdomainSolarSystem.build(subdomain, industry);
          // Camera FAR away — solar system is a distant glowing cluster
          this.camera.position.set(0, 800, 6000);
          this.cameraCtrl.controls.target.set(0, 0, 0);
          this.cameraCtrl.controls.update();
        },
        () => {
          // ── Phase 3: Warp-zoom INTO solar system from deep space ─────────
          this.cameraCtrl.isTransitioning = true;
          gsap.to(this.camera.position, {
            x: 0, y: 200, z: 750,
            duration: 2.6,
            ease: 'power3.in',   // accelerates — pulled in by gravity
            onUpdate: () => { this.cameraCtrl.controls.update(); },
            onComplete: () => {
              this.cameraCtrl.isTransitioning = false;
              this.currentLevel = ZOOM_LEVELS.SUBDOMAIN;
              this.navigationPath = earlyPath;
              this._onNavigateDone(this.navigationPath, this.currentLevel);
            },
          });
          gsap.to(this.cameraCtrl.controls.target, { x: 0, y: 0, z: 0, duration: 2.6, ease: 'power3.in' });
        }
      );
    });
  }

  // ═══ NAVIGATE TO COMPANY ═══
  navigateToCompany(industry, subdomain, company) {
    if (this.cameraCtrl.isTransitioning) return;
    this.selectedCompany = company;

    // Immediately freeze the solar system so planets stop revolving
    if (this._subdomainSolarSystem) {
      this._subdomainSolarSystem.freeze();
    }

    const earlyPath = [
      { level: ZOOM_LEVELS.INDUSTRY, id: industry.id, name: industry.name, data: industry },
      { level: ZOOM_LEVELS.SUBDOMAIN, id: subdomain.id, name: subdomain.name, data: subdomain },
      { level: ZOOM_LEVELS.COMPANY, id: company.id, name: company.name, data: company },
    ];
    if (this.onNavigateBegin) this.onNavigateBegin(earlyPath, ZOOM_LEVELS.COMPANY);

    const wp = this._subdomainSolarSystem?.companyMeshes?.length
      ? this._subdomainSolarSystem.getCompanyWorldPosition(company.id)
      : this.systemParticles.getCompanyPosition(industry.id, subdomain.id, company.id);

    // Zoom inside the planet (minimum radius is 8, so 1.5 is well inside the planet body)
    const zoomDist = 1.5;

    // Temporarily reduce minDistance so OrbitControls doesn't clamp the flyTo camera position to 3
    const oldMinDist = this.cameraCtrl.controls.minDistance;
    this.cameraCtrl.controls.minDistance = 0.1;

    this.cameraCtrl.flyTo(wp, zoomDist, ZOOM_LEVELS.COMPANY, () => {
      // Restore the original minDistance
      this.cameraCtrl.controls.minDistance = oldMinDist;

      this.currentLevel = ZOOM_LEVELS.COMPANY;
      this.navigationPath = earlyPath;
      this._onNavigateDone(this.navigationPath, this.currentLevel);
      if (this.onCompanyAwaitingRole) {
        this.onCompanyAwaitingRole({ company, industry, subdomain });
      }
    });
  }

  // ═══ EXIT LIVE COMPANY POLYTOPE (reverse of navigateToCompany) ═══
  _exitLiveCompanyPolytope(industry, subdomain, company, sss) {
    const subdomainPath = [
      { level: ZOOM_LEVELS.INDUSTRY, id: industry.id, name: industry.name, data: industry },
      { level: ZOOM_LEVELS.SUBDOMAIN, id: subdomain.id, name: subdomain.name, data: subdomain },
    ];
    if (this.onNavigateBegin) this.onNavigateBegin(subdomainPath, ZOOM_LEVELS.SUBDOMAIN);

    const wp = sss.getCompanyWorldPosition(company.id);
    const atPlanet = this._cameraPoseNearTarget(wp, 6);

    this.cameraCtrl.isTransitioning = true;

    // Phase 1: zoom out from polytope interior (reverse of entry warp)
    gsap.to(this.camera.position, {
      x: 0, y: 420, z: 3000,
      duration: 1.7,
      ease: 'power2.inOut',
      onUpdate: () => { this.cameraCtrl.controls.update(); },
      onComplete: () => {
        // Phase 2: fade-swap — re-enter solar system at the company planet
        this._fadeSwap(
          () => {
            sss.group.visible = true;
            sss.restoreFromCompanyEntry();
            this.camera.position.copy(atPlanet.pos);
            this.cameraCtrl.controls.target.copy(atPlanet.target);
            this.cameraCtrl.controls.update();
          },
          () => {
            // Phase 3: zoom out from company planet to subdomain solar system
            gsap.to(this.camera.position, {
              x: 0, y: 200, z: 750,
              duration: 2.5,
              ease: 'power3.out',
              onUpdate: () => { this.cameraCtrl.controls.update(); },
              onComplete: () => {
                this.selectedCompany = null;
                this.currentLevel = ZOOM_LEVELS.SUBDOMAIN;
                this.navigationPath = subdomainPath;
                this.cameraCtrl.isTransitioning = false;
                this._onNavigateDone(this.navigationPath, this.currentLevel);
              },
            });
            gsap.to(this.cameraCtrl.controls.target, { x: 0, y: 0, z: 0, duration: 2.5, ease: 'power3.out' });
          }
        );
      },
    });
    gsap.to(this.cameraCtrl.controls.target, { x: 0, y: 0, z: 0, duration: 1.7, ease: 'power2.inOut' });
  }

  // ═══ NAVIGATE TO DEPARTMENT ═══
  navigateToDepartment(industry, subdomain, company, department) {
    if (this.cameraCtrl.isTransitioning) return;

    const wp = this.systemParticles.getDeptPosition(industry.id, subdomain.id, company.id, department.id);
    const currentDist = this.cameraCtrl.getDistanceToTarget();
    this.cameraCtrl.flyTo(wp, currentDist, ZOOM_LEVELS.DEPARTMENT, () => {
      this.currentLevel = ZOOM_LEVELS.DEPARTMENT;
      this.navigationPath = [
        { level: ZOOM_LEVELS.INDUSTRY, id: industry.id, name: industry.name, data: industry },
        { level: ZOOM_LEVELS.SUBDOMAIN, id: subdomain.id, name: subdomain.name, data: subdomain },
        { level: ZOOM_LEVELS.COMPANY, id: company.id, name: company.name, data: company },
        { level: ZOOM_LEVELS.DEPARTMENT, id: department.id, name: department.name, data: department },
      ];
      if (this.onSelect) this.onSelect(department);
      this._onNavigateDone(this.navigationPath, this.currentLevel);
    });
  }

  // ═══ GO BACK ═══
  goBack() {
    if (this.cameraCtrl.isTransitioning) return;

    if (this._isCoreZoomedIn) {
      if (this.currentLevel === ZOOM_LEVELS.SUBDOMAIN && this.selectedSubdomain) {
        this.toggleSubdomainCoreZoom(this.selectedIndustry, this.selectedSubdomain);
      } else {
        this.toggleIndustryCoreZoom(this.selectedIndustry);
      }
      return;
    }

    if (this.currentLevel === ZOOM_LEVELS.DEPARTMENT) {
      // Back to company
      const company = this.navigationPath[2]?.data;
      const subdomain = this.navigationPath[1]?.data;
      const industry = this.navigationPath[0]?.data;
      if (!company || !subdomain || !industry) return;
      
      const wp = this.systemParticles.getCompanyPosition(industry.id, subdomain.id, company.id);
      this.cameraCtrl.flyTo(wp, 25, ZOOM_LEVELS.COMPANY, () => {
        this.currentLevel = ZOOM_LEVELS.COMPANY;
        this.navigationPath = this.navigationPath.slice(0, 3);
        this._onNavigateDone(this.navigationPath, this.currentLevel);
      });

    } else if (this.currentLevel === ZOOM_LEVELS.COMPANY) {
      const company = this.navigationPath[2]?.data;
      const subdomain = this.navigationPath[1]?.data;
      const industry = this.navigationPath[0]?.data;
      if (!company || !subdomain || !industry) return;

      if (this.onExitCompanyPolytope) this.onExitCompanyPolytope();

      const sss = this._subdomainSolarSystem;
      const wasLivePolytope = company.isLive && sss?.group && !sss.group.visible;
      const wasLoggedInSolar = this._isLoggedInCompany(company) && sss?.group?.visible;

      if (wasLivePolytope) {
        this._exitLiveCompanyPolytope(industry, subdomain, company, sss);
        return;
      }

      if (sss?.interiorViewActive) {
        sss.exitCompanyInterior();
        if (wasLoggedInSolar) sss.restoreFromCompanyEntry();
      }
      this._interiorCameraLock = false;
      this._companyInteriorMode = 'none';

      // Catalog company — restore particle-system groups and fly back
      const sdMesh2 = this.systemParticles.getSubdomainMesh(industry.id, subdomain.id);
      if (sdMesh2) {
        (sdMesh2.userData.companyContainers || []).forEach(cd => {
          gsap.killTweensOf(cd.container.scale);
          gsap.to(cd.container.scale, { x: 1, y: 1, z: 1, duration: 0.8, ease: 'power2.out' });
        });
      }

      const cMesh = this.systemParticles.getCompanyMesh(industry.id, subdomain.id, company.id);
      if (cMesh && cMesh.userData.deptGroup) {
        const _dg = cMesh.userData.deptGroup;
        gsap.killTweensOf(_dg.scale);
        gsap.to(_dg.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 1.0, ease: 'power3.inOut', onComplete: () => { _dg.visible = false; } });
      }

      this.selectedCompany = null;
      const wp = sss?.group
        ? new THREE.Vector3(0, 0, 0)
        : this.systemParticles.getSubdomainPosition(industry.id, subdomain.id);
      this.cameraCtrl.flyTo(wp, 450, ZOOM_LEVELS.SUBDOMAIN, () => {
        this.currentLevel = ZOOM_LEVELS.SUBDOMAIN;
        this.navigationPath = this.navigationPath.slice(0, 2);
        this._onNavigateDone(this.navigationPath, this.currentLevel);
        if (sss) {
          sss.unfreeze();
        }
      });

    } else if (this.currentLevel === ZOOM_LEVELS.SUBDOMAIN) {
      const subdomain = this.navigationPath[1]?.data;
      const industry = this.navigationPath[0]?.data;
      if (!subdomain || !industry) return;

      const earlyPath = [{ level: ZOOM_LEVELS.INDUSTRY, id: industry.id, name: industry.name, data: industry }];
      if (this.onNavigateBegin) this.onNavigateBegin(earlyPath, ZOOM_LEVELS.INDUSTRY);

      // Phase 1: zoom out inside solar system — camera pulls back to reveal full layout
      this.cameraCtrl.isTransitioning = true;
      const tl = gsap.timeline({
        onComplete: () => {
          this.cameraCtrl.isTransitioning = false;

          // Phase 2: morph-fade to real universe
          this._fadeSwap(
            () => {
              if (this._subdomainSolarSystem) this._subdomainSolarSystem.destroy();
              // Re-enable BH before restoring galaxy (camera is now far from origin)
              this.galaxyParticles.setBHEnabled(true);
              this.galaxyParticles.setVisible(true);
              // Restore to INDUSTRY level state: spiral dim, bg stars bright, sphere dim
              // setInsideIndustry restores universeSphere visibility + opacity internally
              this.galaxyParticles.setInsideIndustry(true);

              const sys2 = this.systemParticles.systems.get(industry.id);
              this.systemParticles.systems.forEach((s) => {
                s.group.visible = true;
                s.group.scale.setScalar(1.0);
              });
              if (sys2) {
                sys2.orbitGroup.visible = true;
                sys2.orbitGroup.scale.setScalar(1.0);
                gsap.to(sys2.coreGroup.scale, { x: 1, y: 1, z: 1, duration: 1.2, ease: 'power2.out' });
                gsap.to(sys2.coreGroup.position, { x: 0, y: 0, z: 0, duration: 1.2, ease: 'power2.out' });
                sys2.subdomainContainers.forEach((sd, i) => {
                  gsap.to(sd, { orbitRadius: sd._savedOrbitRadius || sd.orbitRadius, duration: 1.2, ease: 'power2.out' });
                  gsap.to(sd.container.scale, { x: 1, y: 1, z: 1, duration: 1.2, ease: 'power2.out' });
                });
                // Restore dust size that was zeroed on subdomain enter
                if (sys2.dustMat?.uniforms?.uSize) {
                  gsap.killTweensOf(sys2.dustMat.uniforms.uSize);
                  gsap.to(sys2.dustMat.uniforms.uSize, { value: 4.5, duration: 1.2, ease: 'power2.out' });
                }
                sys2.group.updateMatrixWorld(true);
              }

              const sdPos = this.systemParticles.getSubdomainPosition(industry.id, subdomain.id);
              this.camera.position.set(sdPos.x, sdPos.y + 25, sdPos.z + 40);
              this.cameraCtrl.controls.target.copy(sdPos);
              this.cameraCtrl.controls.update();
            },
            () => {
              this.selectedSubdomain = null;
              const idx2 = this.galaxyParticles.industries.findIndex(i => i.id === industry.id);
              const pos = this.galaxyParticles.getIndustryPosition(idx2);
              this.cameraCtrl.flyTo(pos, 2500, ZOOM_LEVELS.INDUSTRY, () => {
                this.currentLevel = ZOOM_LEVELS.INDUSTRY;
                this.navigationPath = this.navigationPath.slice(0, 1);
                this.cameraCtrl.setZoomCap(5500);
                this._onNavigateDone(this.navigationPath, this.currentLevel);
              });
            }
          );
        },
      });

      // Smoothly pull camera back to show the entire solar system
      tl.to(this.camera.position, { x: 0, y: 2000, z: 10000, duration: 2, ease: 'power2.inOut' }, 0);
 
      tl.to(this.cameraCtrl.controls.target, { x: 0, y: 0, z: 0, duration: 1.6, ease: 'power2.inOut' }, 0);

    } else if (this.currentLevel === ZOOM_LEVELS.INDUSTRY) {
      this._goToGalaxy();
    }
  }

  goToGalaxy() {
    if (this.cameraCtrl.isTransitioning) return;

    // Must step through intermediate levels — can't skip from subdomain straight to galaxy
    if (
      this.currentLevel === ZOOM_LEVELS.SUBDOMAIN ||
      this.currentLevel === ZOOM_LEVELS.COMPANY ||
      this.currentLevel === ZOOM_LEVELS.DEPARTMENT
    ) {
      // goBack brings us to INDUSTRY; chain another goToGalaxy from there
      this._afterNextNavigate = () => { this.goToGalaxy(); };
      this.goBack();
      return;
    }

    this._goToGalaxy();
  }

  _goToGalaxy() {
    this.cameraCtrl.setZoomCap(38000); // restore full zoom range at galaxy level
    this.galaxyParticles.setInsideIndustry(false);
    // Hide subdomain labels IMMEDIATELY — before any animation starts
    if (this.onNavigateBegin) this.onNavigateBegin([], ZOOM_LEVELS.GALAXY);
    const workspaceActive = this.isTwinWorkspaceActive?.() ?? false;
    // Morph ALL opened orbit groups back
    this.systemParticles.systems.forEach(sys => {
      if (workspaceActive) {
        gsap.killTweensOf(sys.group.scale);
        gsap.to(sys.group.scale, {
          x: 0.001,
          y: 0.001,
          z: 0.001,
          duration: 0.9,
          ease: 'power3.inOut',
          onComplete: () => {
            sys.group.visible = false;
          },
        });
        if (sys.glowMat) {
          gsap.killTweensOf(sys.glowMat);
          gsap.to(sys.glowMat, { opacity: 0, duration: 0.8, ease: 'power2.inOut' });
        }
        return;
      }

      sys.group.visible = true;
      gsap.killTweensOf(sys.group.scale);
      gsap.killTweensOf(sys.group.position);
      gsap.to(sys.group.scale, { x: 1, y: 1, z: 1, duration: 2.0, ease: 'power2.out' });
      // Restore original position
      const orig = sys.group.userData._origPos;
      if (orig) gsap.to(sys.group.position, { x: orig.x, y: orig.y, z: orig.z, duration: 2.5, ease: 'power2.out' });
      // Restore coreGroup + subdomain containers to full scale/position
      gsap.killTweensOf(sys.coreGroup.scale);
      gsap.to(sys.coreGroup.scale, { x: 1, y: 1, z: 1, duration: 1.2, ease: 'power2.out' });
      gsap.killTweensOf(sys.coreGroup.position);
      gsap.to(sys.coreGroup.position, { x: 0, y: 0, z: 0, duration: 1.2, ease: 'power2.out' });
      sys.subdomainContainers.forEach((sd, i) => {
        gsap.killTweensOf(sd);
        gsap.to(sd, { orbitRadius: sd._savedOrbitRadius || sd.orbitRadius, duration: 1.2, ease: 'power2.out' });
        gsap.killTweensOf(sd.container.scale);
        gsap.to(sd.container.scale, { x: 1, y: 1, z: 1, duration: 1.2, ease: 'power2.out' });
      });
      if (sys.dust && sys.dust.material) {
        gsap.killTweensOf(sys.dust.material.uniforms.uSize);
        gsap.to(sys.dust.material.uniforms.uSize, { value: 4.5, duration: 1.2, ease: 'power2.out' });
      }

      if (sys.orbitGroup.scale.x > 0.002) {
        const _og = sys.orbitGroup;
        gsap.killTweensOf(_og.scale);
        gsap.to(_og.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 1.2, ease: 'power3.inOut', onComplete: () => { _og.visible = false; } });
      } else {
        sys.orbitGroup.visible = false;
      }
      // Also collapse any opened company groups
      sys.subdomainMeshes.forEach(sdMesh => {
        if (sdMesh.userData.companyGroup) {
          const _cg = sdMesh.userData.companyGroup;
          if (_cg.scale.x > 0.002) {
            gsap.killTweensOf(_cg.scale);
            gsap.to(_cg.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 1.0, ease: 'power3.inOut', onComplete: () => { _cg.visible = false; } });
          } else {
            _cg.visible = false;
          }
        }
        (sdMesh.userData.companyMeshes || []).forEach(cMesh => {
          if (cMesh.userData.deptGroup) {
            const _dg = cMesh.userData.deptGroup;
            if (_dg.scale.x > 0.002) {
              gsap.killTweensOf(_dg.scale);
              gsap.to(_dg.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.8, ease: 'power3.inOut', onComplete: () => { _dg.visible = false; } });
            } else {
              _dg.visible = false;
            }
          }
        });
      });
    });

    this.cameraCtrl.flyToGalaxy(() => {
      this.currentLevel = ZOOM_LEVELS.GALAXY;
      this.navigationPath = [];
      this.selectedIndustry = null;
      this.selectedSubdomain = null;
      this.selectedCompany = null;
      if (this.onGalaxyNavigationComplete) this.onGalaxyNavigationComplete();
      this._onNavigateDone(this.navigationPath, this.currentLevel);
    });
  }

  /** Restore industry/subdomain view after page refresh (no fly animations). */
  restorePersistedView(persisted, industries) {
    if (persisted.insideBH) {
      if (this.galaxyParticles && this.galaxyParticles.onEnterBH) {
        this.galaxyParticles.onEnterBH();
        this.camera.position.set(0, 0, 500); // Inside BH camera
        this.cameraCtrl.controls.target.set(0, 0, 0);
        this.cameraCtrl.controls.update();
      }
      return true;
    }

    const industry = industries.find((i) => i.id === persisted.industryId);
    if (!industry) {
      clearUniverseNavState();
      return false;
    }

    const idx = industries.findIndex((i) => i.id === industry.id);
    if (idx < 0) {
      clearUniverseNavState();
      return false;
    }

    if (persisted.level === 'industry') {
      this._snapToIndustry(industry, idx, persisted);
      return true;
    }

    const subdomain = industry.subdomains?.find((s) => s.id === persisted.subdomainId);
    if (!subdomain) {
      clearUniverseNavState();
      return false;
    }

    let company = null;
    if (persisted.level === 'company' && persisted.companyId) {
      company = subdomain.companies?.find((c) => c.id === persisted.companyId) ?? null;
      // DO NOT clear company if it's the logged-in one, so we can restore the interior view
    }

    this._snapToSubdomain(industry, subdomain, idx, persisted, company);

    if (company && persisted.interiorMode) {
      if (persisted.interiorMode === 'dept') {
        this._enterLoggedInDeptInterior(industry, subdomain, company);
      } else if (persisted.interiorMode === 'planet') {
        // Find dummy tree since it's not saved (it will be regenerated)
        // We'll let the user click to re-initiate, or we just pass a default
        this._enterPlanetRootView(industry, subdomain, company, [], this.navigationPath);
      }
    }

    return true;
  }

  _applySavedCamera(persisted, fallbackPos, fallbackTarget) {
    if (persisted?.cameraPosition && persisted?.cameraTarget) {
      this.camera.position.fromArray(persisted.cameraPosition);
      this.cameraCtrl.controls.target.fromArray(persisted.cameraTarget);
      this.cameraCtrl.controls.update();
      return;
    }
    if (fallbackPos && fallbackTarget) {
      this.camera.position.copy(fallbackPos);
      this.cameraCtrl.controls.target.copy(fallbackTarget);
      this.cameraCtrl.controls.update();
    }
  }

  _snapToIndustry(industry, idx, persisted) {
    this.selectedIndustry = industry;
    this.selectedSubdomain = null;
    this.selectedCompany = null;
    this.currentLevel = ZOOM_LEVELS.INDUSTRY;
    this.cameraCtrl.currentLevel = ZOOM_LEVELS.INDUSTRY;
    this.cameraCtrl.isTransitioning = false;
    this.cameraCtrl.controls.autoRotate = false;
    this.cameraCtrl.autoRotateEnabled = false;

    this.galaxyParticles.applyInsideIndustryState(true);

    const FAR_RADIUS = 20000;
    const SIZE_SCALE = 0.08;
    const activePos = this.galaxyParticles.getIndustryPosition(idx);

    this.systemParticles.systems.forEach((sys, id) => {
      gsap.killTweensOf(sys.group.position);
      gsap.killTweensOf(sys.group.scale);
      gsap.killTweensOf(sys.coreGroup?.scale);
      sys.group.visible = true;

      if (id !== industry.id) {
        if (!sys.group.userData._origPos) {
          sys.group.userData._origPos = sys.group.position.clone();
        }
        const orig = sys.group.userData._origPos;
        const dir = orig.clone().sub(activePos);
        if (dir.lengthSq() === 0) dir.set(1, 0, 0);
        dir.normalize().multiplyScalar(FAR_RADIUS);
        sys.group.position.copy(activePos.clone().add(dir));
        sys.group.scale.setScalar(SIZE_SCALE);
        return;
      }

      sys.group.scale.setScalar(1);
      sys.coreGroup.scale.setScalar(1);
      sys.coreGroup.position.set(0, 0, 0);
      sys.orbitGroup.visible = true;
      sys.orbitGroup.scale.setScalar(1);
      sys.subdomainContainers.forEach((sd) => {
        gsap.killTweensOf(sd.container.scale);
        sd.container.scale.setScalar(1);
      });
      if (sys.dustMat?.uniforms?.uSize) {
        gsap.killTweensOf(sys.dustMat.uniforms.uSize);
        sys.dustMat.uniforms.uSize.value = 4.5;
      }
    });

    const pos = this.galaxyParticles.getIndustryPosition(idx);
    if (persisted?.cameraPosition && persisted?.cameraTarget) {
      this._applySavedCamera(persisted);
    } else {
      this.cameraCtrl.snapTo(pos, 2500, ZOOM_LEVELS.INDUSTRY);
    }

    this.cameraCtrl.setZoomCap(5500);
    this.navigationPath = [
      { level: ZOOM_LEVELS.INDUSTRY, id: industry.id, name: industry.name, data: industry },
    ];
    this._onNavigateDone(this.navigationPath, this.currentLevel);
  }

  _snapToSubdomain(industry, subdomain, idx, persisted, company = null) {
    this.selectedIndustry = industry;
    this.selectedSubdomain = subdomain;
    this.selectedCompany = company;
    this.cameraCtrl.isTransitioning = false;
    this.cameraCtrl.controls.autoRotate = false;
    this.cameraCtrl.autoRotateEnabled = false;

    this.galaxyParticles.setBHEnabled(false);
    this.galaxyParticles.setVisible(false);
    this.galaxyParticles.applySubdomainLevelState(true);

    this.systemParticles.systems.forEach((sys, id) => {
      gsap.killTweensOf(sys.group.scale);
      if (id !== industry.id) {
        sys.group.scale.set(0.001, 0.001, 0.001);
        return;
      }

      sys.orbitGroup.visible = true;
      sys.orbitGroup.scale.setScalar(1);
      sys.coreGroup.scale.set(0.001, 0.001, 0.001);
      sys.subdomainContainers.forEach((sd, i) => {
        const mesh = sys.subdomainMeshes[i];
        gsap.killTweensOf(sd.container.scale);
        if (mesh?.userData?.subdomain?.id !== subdomain.id) {
          sd.container.scale.set(0.001, 0.001, 0.001);
        } else {
          sd.container.scale.setScalar(1);
        }
      });
      if (sys.dustMat?.uniforms?.uSize) {
        gsap.killTweensOf(sys.dustMat.uniforms.uSize);
        sys.dustMat.uniforms.uSize.value = 0;
      }
    });

    this.systemParticles.systems.forEach((s) => {
      s.group.visible = false;
    });

    if (this._subdomainSolarSystem) {
      this._subdomainSolarSystem.build(subdomain, industry);
      this._subdomainSolarSystem.revealInstantly();
    }

    const defaultPos = new THREE.Vector3(0, 200, 750);
    const defaultTarget = new THREE.Vector3(0, 0, 0);
    this._applySavedCamera(persisted, defaultPos, defaultTarget);

    if (company) {
      this.currentLevel = ZOOM_LEVELS.COMPANY;
      this.cameraCtrl.currentLevel = ZOOM_LEVELS.COMPANY;
      this.navigationPath = [
        { level: ZOOM_LEVELS.INDUSTRY, id: industry.id, name: industry.name, data: industry },
        { level: ZOOM_LEVELS.SUBDOMAIN, id: subdomain.id, name: subdomain.name, data: subdomain },
        { level: ZOOM_LEVELS.COMPANY, id: company.id, name: company.name, data: company },
      ];
    } else {
      this.currentLevel = ZOOM_LEVELS.SUBDOMAIN;
      this.cameraCtrl.currentLevel = ZOOM_LEVELS.SUBDOMAIN;
      this.navigationPath = [
        { level: ZOOM_LEVELS.INDUSTRY, id: industry.id, name: industry.name, data: industry },
        { level: ZOOM_LEVELS.SUBDOMAIN, id: subdomain.id, name: subdomain.name, data: subdomain },
      ];
    }

    this._onNavigateDone(this.navigationPath, this.currentLevel);
  }

  navigateToLevel(levelIndex) {
    if (levelIndex < 0) this.goToGalaxy();
    else if (levelIndex < this.navigationPath.length - 1) this.goBack();
  }

  setInteractionEnabled(enabled) {
    this._interactionEnabled = enabled;
    if (enabled) return;
    if (this.hoveredObject) {
      this._unhover(this.hoveredObject);
      this.hoveredObject = null;
      if (this.onHover) this.onHover(null);
    }
  }

  dispose() {
    this.canvas.removeEventListener('click', this._onClick);
    this.canvas.removeEventListener('mousemove', this._onMove);
    window.removeEventListener('keydown', this._onKey);
    if (this._subdomainSolarSystem) this._subdomainSolarSystem.destroy?.();
  }
}
