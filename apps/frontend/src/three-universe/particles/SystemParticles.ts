// @ts-nocheck
/**
 * SystemParticles.js — Unified Solar System
 * 
 * Hierarchy: Industry (Star) → Subdomains (Planets) → Companies (Moons) → Departments (micro-moons)
 * 
 * All 12 systems are ALWAYS visible at the galaxy level.
 * Scaling is used to "morph in/out" deeper levels.
 */

import * as THREE from 'three';
import gsap from 'gsap';
import { TextureGenerator } from '../engine/TextureGenerator.js';
import starVertexShader from '../shaders/star/vertex.glsl';
import starFragmentShader from '../shaders/star/fragment.glsl';
import atmosphereVertexShader from '../shaders/atmosphere/vertex.glsl';
import atmosphereFragmentShader from '../shaders/atmosphere/fragment.glsl';
import miniGalaxyVertex from '../shaders/minigalaxy/vertex.glsl';
import miniGalaxyFragment from '../shaders/minigalaxy/fragment.glsl';
import planetVertexShader from '../shaders/planet/vertex.glsl';
import planetFragmentShader from '../shaders/planet/fragment.glsl';

let _glowTex = null;
function getGlow() {
  if (!_glowTex) _glowTex = new THREE.CanvasTexture(TextureGenerator.createGlowTexture(128));
  return _glowTex;
}

function gauss() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class SystemParticles {
  constructor(scene) {
    this.scene = scene;
    this.systems = new Map();
  }

  createSystem(industry, centerPosition, sizeMultiplier = 1.0) {
    const group = new THREE.Group();
    group.position.copy(centerPosition);
    group.visible = true;
    
    const color = new THREE.Color(industry.color);

    // ═══ CENTRAL STAR (isolated group — scale independently of planets) ═══
    const coreGroup = new THREE.Group();
    group.add(coreGroup);

    const starGeo = new THREE.IcosahedronGeometry(60 * sizeMultiplier, 6);
    const starMat = new THREE.ShaderMaterial({
      vertexShader: starVertexShader,
      fragmentShader: starFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: color.clone() },
        uIntensity: { value: 0.55 },
        uAudio: { value: 0 },
      },
    });
    const star = new THREE.Mesh(starGeo, starMat);
    coreGroup.add(star);

    const glowMat = new THREE.SpriteMaterial({
      map: getGlow(), color: color, transparent: true, opacity: 0.10,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(150 * sizeMultiplier, 100 * sizeMultiplier, 1);
    coreGroup.add(glow);

    const light = new THREE.PointLight(color.getHex(), 0.4, 400, 2.0);
    coreGroup.add(light);

    // ═══ MINI SPIRAL GALAXY (shader-based) ═══
    // ── TUNING KNOBS ──────────────────────────────────────────
    const dustCount  = 4000;   // total spiral particles (fewer = cleaner arms)
    const numArms    = 5;      // number of spiral arms
    const armTight   = 0.55;   // logarithmic tightness (higher = tighter wound)
    const armDev     = 0.5;   // arm scatter width (lower = sharper arms)
    const galRadius  = 1500 * sizeMultiplier;
    const galCore    = 320;
    // ──────────────────────────────────────────────────────────

    const dustPositions = new Float32Array(dustCount * 3);
    const dustColors = new Float32Array(dustCount * 3);
    const dustSizes = new Float32Array(dustCount);
    const dustSpeeds = new Float32Array(dustCount);
    const dustBright = new Float32Array(dustCount);

    const baseHSL = { h: 0, s: 0, l: 0 };
    color.getHSL(baseHSL);

    for (let i = 0; i < dustCount; i++) {
      const i3 = i * 3;
      const t = Math.random();
      const dist = Math.pow(t, 2.2) * galRadius;

      const armIdx = Math.floor(Math.random() * numArms);
      const armBase = (armIdx / numArms) * Math.PI * 2;
      const spiral = armTight * Math.log(Math.max(dist, 1)) * 3;

      const normDist = dist / galRadius;
      const deviation = gauss() * armDev * normDist;
      const angle = armBase + spiral + deviation;

      dustPositions[i3]     = Math.cos(angle) * dist;
      // Flat disc — Y thickness exponentially drops off from core
      dustPositions[i3 + 1] = gauss() * 22 * Math.exp(-dist / (galCore * 1.5));
      dustPositions[i3 + 2] = Math.sin(angle) * dist;

      const coreness = Math.max(0, 1 - dist / galCore);
      const pColor = new THREE.Color();
      if (coreness > 0.3) {
        // Core: industry hue, warm but not white — keep color identity
        pColor.setHSL(baseHSL.h, baseHSL.s * 0.55, 0.50 + coreness * 0.08);
      } else {
        // Arms: boosted saturation so each galaxy reads as distinctly colored
        const outerFade = 1.0 - normDist * 0.25;
        pColor.setHSL(
          baseHSL.h + (Math.random() - 0.5) * 0.03,
          Math.min(baseHSL.s * 1.35, 0.95) * outerFade,
          baseHSL.l * 0.88 + (Math.random() - 0.5) * 0.06
        );
      }
      dustColors[i3] = pColor.r; dustColors[i3 + 1] = pColor.g; dustColors[i3 + 2] = pColor.b;
      dustSizes[i] = (0.4 + Math.random() * 0.9) * (1 + coreness * 1.8);
      dustSpeeds[i] = (0.006 + Math.random() * 0.01) / Math.max(Math.pow(dist / 30, 0.5), 0.3);
      dustBright[i] = 0.25 + Math.random() * 0.30 + coreness * 0.20;
    }

    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    dustGeo.setAttribute('aColor', new THREE.BufferAttribute(dustColors, 3));
    dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dustSizes, 1));
    dustGeo.setAttribute('aSpeed', new THREE.BufferAttribute(dustSpeeds, 1));
    dustGeo.setAttribute('aBrightness', new THREE.BufferAttribute(dustBright, 1));

    const dustMat = new THREE.ShaderMaterial({
      vertexShader: miniGalaxyVertex,
      fragmentShader: miniGalaxyFragment,
      uniforms: { uTime: { value: 0 }, uSize: { value: 4.5 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    group.add(dust);

    // ═══ AMBIENT STAR FIELD ═══
    // ── TUNING: starCount, starField (spread), PointsMaterial size ──
    const starCount = 0;
    const starPositions = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);
    const starField = 25000; 
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3]     = (Math.random() - 0.5) * starField * 2;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * starField * 0.3;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * starField * 2;
      starSizes[i] = 0.1 + Math.random() * 0.5;
    }
    const starGeoField = new THREE.BufferGeometry();
    starGeoField.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeoField.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
    const starFieldMat = new THREE.PointsMaterial({
      color: color, size: 0.35, transparent: true, opacity: 0.20,
      sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const starFieldPoints = new THREE.Points(starGeoField, starFieldMat);
    group.add(starFieldPoints);

    // ═══ SUBDOMAIN PLANETS (orbiting industry star) ═══
    const orbitGroup = new THREE.Group();
    orbitGroup.scale.setScalar(0.001); // morph in on navigate
    orbitGroup.visible = false; // GPU-cull until entered
    group.add(orbitGroup);

    const subdomains = industry.subdomains || [];
    const subdomainMeshes = [];
    const subdomainContainers = [];
    const planetMats = [];

    // Seed base for this industry — drives per-planet type variation
    const industrySeedBase = industry.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 17.3;

    subdomains.forEach((subdomain, idx) => {
      // Tight orbits around industry star — camera closeness creates the 'far away' perception
      const orbitRadius = 1000 + idx * 300;
      const startAngle = (idx / subdomains.length) * Math.PI * 2 + idx * 0.5;


      // Subdomain container
      const container = new THREE.Group();
      orbitGroup.add(container);
      subdomainContainers.push({ container, orbitRadius, startAngle, speed: 1 / Math.sqrt(orbitRadius) }); // ← TUNING: increase for faster orbits

      // Subdomain planet (larger than company planets)
      const sdRadius = 50 + (subdomain.companies.length / 8) * 8;
      const sdGeo = new THREE.IcosahedronGeometry(sdRadius, 5);
      const planetSeed = industrySeedBase + idx * 1337.17;
      const sdMat = new THREE.ShaderMaterial({
        vertexShader: planetVertexShader,
        fragmentShader: planetFragmentShader,
        uniforms: {
          uTime:     { value: 0 },
          uColor:    { value: color.clone() },
          uSeed:     { value: planetSeed },
          uStarPos:  { value: new THREE.Vector3() },
        },
      });
      planetMats.push(sdMat);
      const sdMesh = new THREE.Mesh(sdGeo, sdMat);
      sdMesh.userData = { type: 'subdomain', subdomain, industry, planetSize: sdRadius };
      container.add(sdMesh);
      subdomainMeshes.push(sdMesh);

      container.userData = {};

      // Subdomain glow (planet view)
      const sdGlowMat = new THREE.SpriteMaterial({
        map: getGlow(), color: color, transparent: true, opacity: 0.1,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const sdGlow = new THREE.Sprite(sdGlowMat);
      sdGlow.scale.set(sdRadius * 3, sdRadius * 3, 1);
      container.add(sdGlow);

      // ═══ SUBDOMAIN SOLAR SYSTEM (shown when user enters this subdomain) ═══
      const sunRadius = 20;
      const sdSunGeo = new THREE.IcosahedronGeometry(sunRadius, 3);
      const sdSunMat = new THREE.ShaderMaterial({
        vertexShader: starVertexShader, fragmentShader: starFragmentShader,
        uniforms: { uTime: { value: 0 }, uColor: { value: color.clone() }, uIntensity: { value: 0.65 } },
      });
      const sdSun = new THREE.Mesh(sdSunGeo, sdSunMat);
      sdSun.visible = false;
      container.add(sdSun);

      const sdSunGlowMat = new THREE.SpriteMaterial({
        map: getGlow(), color: color, transparent: true, opacity: 0.2,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const sdSunGlow = new THREE.Sprite(sdSunGlowMat);
      sdSunGlow.scale.set(90, 90, 1);
      sdSunGlow.visible = false;
      container.add(sdSunGlow);

      const lightColor = new THREE.Color(0xffffff).lerp(color, 0.4);
      const sdSunLight = new THREE.PointLight(lightColor.getHex(), 3.5, 900, 1.5);
      sdSunLight.visible = false;
      container.add(sdSunLight);
      
      const sdAmbientLight = new THREE.AmbientLight(0xffffff, 0.35);
      sdAmbientLight.visible = false;
      container.add(sdAmbientLight);

      // Local star field — surrounds camera when inside the solar system
      const lsCount = 600;
      const lsPos = new Float32Array(lsCount * 3);
      for (let si = 0; si < lsCount; si++) {
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const r = 250 + Math.random() * 900;
        lsPos[si*3]   = r * Math.sin(ph) * Math.cos(th);
        lsPos[si*3+1] = r * Math.sin(ph) * Math.sin(th);
        lsPos[si*3+2] = r * Math.cos(ph);
      }
      const lsGeo = new THREE.BufferGeometry();
      lsGeo.setAttribute('position', new THREE.BufferAttribute(lsPos, 3));
      const lsMat = new THREE.PointsMaterial({
        color: 0xaabbee, size: 1.4, sizeAttenuation: true,
        transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const localStars = new THREE.Points(lsGeo, lsMat);
      localStars.visible = false;
      container.add(localStars);

      sdMesh.userData.sdSun = sdSun;
      sdMesh.userData.sdSunMat = sdSunMat;
      sdMesh.userData.sdSunGlow = sdSunGlow;
      sdMesh.userData.sdSunLight = sdSunLight;
      sdMesh.userData.sdAmbientLight = sdAmbientLight;
      sdMesh.userData.localStars = localStars;

      // ═══ COMPANY PLANETS (orbiting subdomain) ═══
      const companyGroup = new THREE.Group();
      companyGroup.scale.setScalar(0.001);
      companyGroup.visible = false; // GPU-cull until entered
      container.add(companyGroup);
      sdMesh.userData.companyGroup = companyGroup;

      const companies = subdomain.companies || [];
      const companyMeshes = [];
      const companyContainers = [];

      companies.forEach((company, cIdx) => {
        // Moderate spacing — camera closeness creates distance perception
        const cOrbitRadius = sdRadius * 6 + cIdx * 55;
        const cStartAngle = (cIdx / companies.length) * Math.PI * 2 + cIdx * 0.7;

        // company orbit rings removed

        const cContainer = new THREE.Group();
        companyGroup.add(cContainer);
        companyContainers.push({ container: cContainer, orbitRadius: cOrbitRadius, startAngle: cStartAngle, speed: 0.2 / Math.sqrt(cOrbitRadius) });

        const maxEmp = Math.max(...companies.map(c => c.employees), 1);
        const cRadius = 3 + (company.employees / maxEmp) * 5.0;
        const cGeo = new THREE.IcosahedronGeometry(cRadius, 3);
        const cMat = new THREE.MeshStandardMaterial({
          color: color.clone().multiplyScalar(0.65), emissive: color, emissiveIntensity: 0.15,
          roughness: 0.75, metalness: 0.25,
        });
        const cMesh = new THREE.Mesh(cGeo, cMat);
        cMesh.userData = { type: 'company', company, subdomain, industry, planetSize: cRadius };
        cContainer.add(cMesh);
        companyMeshes.push(cMesh);

        // Company atmosphere
        const cAtmoGeo = new THREE.IcosahedronGeometry(cRadius * 1.3, 3);
        const cAtmoMat = new THREE.ShaderMaterial({
          vertexShader: atmosphereVertexShader, fragmentShader: atmosphereFragmentShader,
          uniforms: { uColor: { value: color.clone() }, uIntensity: { value: 0.15 }, uTime: { value: 0 } },
          transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
        });
        cContainer.add(new THREE.Mesh(cAtmoGeo, cAtmoMat));

        // ═══ DEPARTMENT PLANETS (proper planets, not ugly micro-moons) ═══
        const deptGroup = new THREE.Group();
        deptGroup.scale.setScalar(0.001);
        deptGroup.visible = false; // GPU-cull until entered
        cContainer.add(deptGroup);
        cMesh.userData.deptGroup = deptGroup;

        const depts = company.departments || [];
        depts.forEach((dept, dIdx) => {
          // Reasonable spacing around company
          const dOrbit = cRadius * 5 + dIdx * 10;
          const dSize = 1.2 + Math.min(dept.headcount / 80, 2.0);
          const dAngle = (dIdx / depts.length) * Math.PI * 2 + dIdx * 0.8;

          // dept orbit rings removed

          // Department as a proper planet
          const dGeo = new THREE.IcosahedronGeometry(dSize, 3);
          const dMat = new THREE.MeshStandardMaterial({
            color: color.clone().multiplyScalar(0.55), emissive: color, emissiveIntensity: 0.12,
            roughness: 0.8, metalness: 0.2,
          });
          const moon = new THREE.Mesh(dGeo, dMat);
          moon.userData = { type: 'department', department: dept, company, subdomain, industry, orbitRadius: dOrbit, angle: dAngle, speed: 0.3 / Math.sqrt(dOrbit), moonSize: dSize };
          deptGroup.add(moon);

          // Department atmosphere glow
          const dAtmoGeo = new THREE.IcosahedronGeometry(dSize * 1.5, 2);
          const dAtmoMat = new THREE.ShaderMaterial({
            vertexShader: atmosphereVertexShader, fragmentShader: atmosphereFragmentShader,
            uniforms: { uColor: { value: color.clone() }, uIntensity: { value: 0.3 }, uTime: { value: 0 } },
            transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
          });
          deptGroup.add(new THREE.Mesh(dAtmoGeo, dAtmoMat));
        });
      });

      sdMesh.userData.companyMeshes = companyMeshes;
      sdMesh.userData.companyContainers = companyContainers;
    });

    const system = { group, coreGroup, orbitGroup, starMat, glowMat, dustMat, dust, subdomainMeshes, subdomainContainers, planetMats, industry };
    this.systems.set(industry.id, system);
    this.scene.add(group);
    return system;
  }

  // ═══ ACCESSORS ═══

  getGalaxyClickMeshes() {
    const meshes = [];
    this.systems.forEach((sys, id) => {
      // star mesh is first child of group
      const star = sys.coreGroup.children.find(c => c.isMesh);
      if (star) { star.userData._industryId = id; meshes.push(star); }
      if (sys.dust) { sys.dust.userData._industryId = id; meshes.push(sys.dust); }
    });
    return meshes;
  }

  getSubdomainMeshes(industryId) {
    const sys = this.systems.get(industryId);
    return sys ? sys.subdomainMeshes : [];
  }

  getSubdomainMesh(industryId, subdomainId) {
    const meshes = this.getSubdomainMeshes(industryId);
    return meshes.find(m => m.userData.subdomain.id === subdomainId);
  }

  getSubdomainPosition(industryId, subdomainId) {
    const mesh = this.getSubdomainMesh(industryId, subdomainId);
    if (!mesh) return new THREE.Vector3();
    const wp = new THREE.Vector3();
    mesh.getWorldPosition(wp);
    return wp;
  }

  getCompanyMeshes(industryId, subdomainId) {
    const sdMesh = this.getSubdomainMesh(industryId, subdomainId);
    return sdMesh ? (sdMesh.userData.companyMeshes || []) : [];
  }

  getCompanyMesh(industryId, subdomainId, companyId) {
    const meshes = this.getCompanyMeshes(industryId, subdomainId);
    return meshes.find(m => m.userData.company.id === companyId);
  }

  getCompanyPosition(industryId, subdomainId, companyId) {
    const mesh = this.getCompanyMesh(industryId, subdomainId, companyId);
    if (!mesh) return new THREE.Vector3();
    const wp = new THREE.Vector3();
    mesh.getWorldPosition(wp);
    return wp;
  }

  getDeptMeshes(industryId, subdomainId, companyId) {
    const cMesh = this.getCompanyMesh(industryId, subdomainId, companyId);
    if (!cMesh || !cMesh.userData.deptGroup) return [];
    return cMesh.userData.deptGroup.children.filter(c => c.userData && c.userData.type === 'department');
  }

  updateGroupPosition(industryId, pos) {
    const sys = this.systems.get(industryId);
    if (sys) sys.group.position.copy(pos);
  }

  getDeptPosition(industryId, subdomainId, companyId, deptId) {
    const meshes = this.getDeptMeshes(industryId, subdomainId, companyId);
    const m = meshes.find(m => m.userData.department.id === deptId);
    if (!m) return new THREE.Vector3();
    const wp = new THREE.Vector3();
    m.getWorldPosition(wp);
    return wp;
  }

  // ═══ UPDATE ═══

  update(elapsed, zoomLevelFactor) {
    const timeScale = 0.016 * zoomLevelFactor;

    this.systems.forEach(sys => {
      sys.starMat.uniforms.uTime.value = elapsed;
      // Update planet shader uniforms: time + star world position
      if (sys.planetMats?.length) {
        const starPos = sys.group.position; // star is at group origin
        sys.planetMats.forEach(mat => {
          mat.uniforms.uTime.value = elapsed;
          mat.uniforms.uStarPos.value.copy(starPos);
        });
      }
      // glowMat.opacity controlled by distance in main.js — no pulse here
      if (sys.dustMat && sys.dustMat.uniforms) sys.dustMat.uniforms.uTime.value = elapsed;

      // Orbit subdomains — skip if orbitGroup culled
      if (!sys.orbitGroup.visible) return;
      sys.subdomainContainers.forEach((sd, idx) => {
        sd.startAngle += sd.speed * timeScale;
        sd.container.position.set(
          Math.cos(sd.startAngle) * sd.orbitRadius,
          Math.sin(sd.startAngle * 2) * 1.5,
          Math.sin(sd.startAngle) * sd.orbitRadius
        );

        const sdMesh = sys.subdomainMeshes[idx];
        sdMesh.rotation.y += 0.006;
        if (sdMesh.userData.sdSunMat && sdMesh.userData.sdSun.visible)
          sdMesh.userData.sdSunMat.uniforms.uTime.value = elapsed;


        // Orbit companies around subdomain — skip if companyGroup culled
        const companyGroup = sdMesh.userData.companyGroup;
        if (!companyGroup || !companyGroup.visible) return;
        const cContainers = sdMesh.userData.companyContainers || [];
        const cMeshes = sdMesh.userData.companyMeshes || [];
        cContainers.forEach((cd, cIdx) => {
          cd.startAngle += cd.speed * timeScale;
          cd.container.position.set(
            Math.cos(cd.startAngle) * cd.orbitRadius,
            Math.sin(cd.startAngle * 1.5) * 0.8,
            Math.sin(cd.startAngle) * cd.orbitRadius
          );

          const cMesh = cMeshes[cIdx];
          if (cMesh) {
            cMesh.rotation.y += 0.01;

            // Orbit departments around company — skip if deptGroup culled
            const deptGroup = cMesh.userData.deptGroup;
            if (!deptGroup || !deptGroup.visible) return;
            deptGroup.children.forEach(child => {
              if (child.userData && child.userData.type === 'department') {
                child.userData.angle += child.userData.speed * timeScale;
                child.position.set(
                  Math.cos(child.userData.angle) * child.userData.orbitRadius,
                  Math.sin(child.userData.angle * 1.5) * 0.3,
                  Math.sin(child.userData.angle) * child.userData.orbitRadius
                );
                child.rotation.y += 0.015;
              }
            });
          }
        });
      });
    });
  }

  setVisible(v) {
    this.systems.forEach(sys => { sys.group.visible = v; });
  }

  /** Industry workspace hide progress (0 = visible, 1 = hidden) — synced to camera compose zoom. */
  setIndustryWorkspaceFocusProgress(activeIndustryId, t) {
    if (!activeIndustryId) return;
    const hideScale = THREE.MathUtils.lerp(0.08, 0.001, t);
    const glowOpacity = THREE.MathUtils.lerp(0.1, 0, t);

    this.systems.forEach((sys, id) => {
      if (id === activeIndustryId) return;

      gsap.killTweensOf(sys.group.scale);
      if (sys.glowMat) gsap.killTweensOf(sys.glowMat);

      const fullyHidden = t >= 0.999;
      sys.group.visible = !fullyHidden;
      sys.group.scale.set(hideScale, hideScale, hideScale);
      if (sys.glowMat) sys.glowMat.opacity = glowOpacity;
    });
  }

  /** Industry workspace — hide other galaxies only; active core + planets stay put. */
  setIndustryWorkspaceFocus(activeIndustryId, focused, duration = 0.88) {
    const ease = 'power3.inOut';
    this.systems.forEach((sys, id) => {
      if (id === activeIndustryId) return;

      gsap.killTweensOf(sys.group.scale);
      if (sys.glowMat) gsap.killTweensOf(sys.glowMat);

      if (focused) {
        sys.group.visible = true;
        gsap.to(sys.group.scale, {
          x: 0.001,
          y: 0.001,
          z: 0.001,
          duration,
          ease,
          onComplete: () => {
            sys.group.visible = false;
          },
        });
        if (sys.glowMat) {
          gsap.to(sys.glowMat, { opacity: 0, duration, ease });
        }
        return;
      }

      sys.group.visible = true;
      gsap.to(sys.group.scale, { x: 0.08, y: 0.08, z: 0.08, duration, ease });
      if (sys.glowMat) {
        gsap.to(sys.glowMat, { opacity: 0.1, duration, ease });
      }
    });
  }

  /** Hide orbiting industry galaxies while twin workspace is open (BH-only view). */
  setWorkspaceFocus(keepIndustryId, focused, duration = 0.88) {
    const ease = 'power3.inOut';
    this.systems.forEach((sys, id) => {
      const hide = focused && (keepIndustryId == null || id !== keepIndustryId);
      gsap.killTweensOf(sys.group.scale);
      if (sys.glowMat) gsap.killTweensOf(sys.glowMat);

      if (hide) {
        sys.group.visible = true;
        gsap.to(sys.group.scale, {
          x: 0.001,
          y: 0.001,
          z: 0.001,
          duration,
          ease,
          onComplete: () => {
            sys.group.visible = false;
          },
        });
        if (sys.glowMat) {
          gsap.to(sys.glowMat, { opacity: 0, duration, ease });
        }
        return;
      }

      if (!focused) {
        sys.group.visible = true;
        gsap.to(sys.group.scale, { x: 1, y: 1, z: 1, duration, ease });
        if (sys.glowMat) {
          gsap.to(sys.glowMat, { opacity: 0.1, duration, ease });
        }
      }
    });
  }

  dispose() {
    this.systems.forEach(sys => {
      sys.group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose?.(); });
      this.scene.remove(sys.group);
    });
  }
}
