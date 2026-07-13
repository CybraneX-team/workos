// @ts-nocheck
/**
 * SubdomainSolarSystem.js
 * Built fresh on every subdomain entry at world origin (0,0,0).
 * Sun (star shader) + company planets + local star field.
 */

import * as THREE from 'three';
import gsap from 'gsap';
import starVertexShader   from '../shaders/star/vertex.glsl';
import starFragmentShader from '../shaders/star/fragment.glsl';
import atmVert from '../shaders/atmosphere/vertex.glsl';
import atmFrag from '../shaders/atmosphere/fragment.glsl';
import { TextureGenerator } from '../engine/TextureGenerator.js';
import { CompanyInteriorView } from './CompanyInteriorView.js';
import { CompanyPlanetRootView } from './CompanyPlanetRootView.js';

function generatePlanetTexture(baseColor: THREE.Color, seed: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  
  ctx.fillStyle = `#${baseColor.getHexString()}`;
  ctx.fillRect(0, 0, 512, 256);
  
  // Random deterministic function
  const rand = (n: number) => {
    let t = Math.sin(seed * n) * 10000;
    return t - Math.floor(t);
  };

  // Draw noisy bands (gas giant look) or craters
  const isGasGiant = rand(1) > 0.5;
  
  for (let i = 0; i < 150; i++) {
    const x = rand(i * 2) * 512;
    const y = rand(i * 2 + 1) * 256;
    
    const hsl = { h: 0, s: 0, l: 0 };
    baseColor.getHSL(hsl);
    hsl.l += (rand(i * 3) - 0.5) * 0.4;
    hsl.s += (rand(i * 3 + 1) - 0.5) * 0.2;
    const c = new THREE.Color().setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s)), Math.max(0, Math.min(1, hsl.l)));
    
    ctx.fillStyle = `#${c.getHexString()}`;
    ctx.globalAlpha = 0.3 + rand(i * 4) * 0.5;
    
    ctx.beginPath();
    if (isGasGiant) {
      // Band-like structures
      const w = 50 + rand(i*5) * 200;
      const h = 5 + rand(i*6) * 15;
      ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    } else {
      // Crater-like spots
      const r = 5 + rand(i*5) * 25;
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  
  // Add some tiny dots for texture
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 1000; i++) {
    ctx.fillRect(rand(i * 7) * 512, rand(i * 8) * 256, 1, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

let _glowTex = null;
const getGlow = () => {
  if (!_glowTex) _glowTex = new THREE.CanvasTexture(TextureGenerator.createGlowTexture(128));
  return _glowTex;
};

export class SubdomainSolarSystem {
  constructor(scene) {
    this.scene  = scene;
    this.group  = null;
    this._sunMat = null;
    this._containers = [];   // { container, orbitRadius, angle, speed }
    this._atmoMats   = [];
    this.companyMeshes = [];  // exposed for raycasting
    this._frozen = false;    // when true, all planets stop orbiting
    this._frozenAngle = new Map(); // companyId → frozen angle
    this.interiorView = new CompanyInteriorView();
    this.planetRootView = new CompanyPlanetRootView();
    this._interiorMode = 'none';
  }

  _activeInterior() {
    if (this._interiorMode === 'planet') return this.planetRootView;
    if (this._interiorMode === 'dept') return this.interiorView;
    return null;
  }

  // ── BUILD ────────────────────────────────────────────────────────────────
  build(subdomain, industry) {
    this.destroy();

    this.group = new THREE.Group();
    this._containers   = [];
    this._atmoMats     = [];
    this.companyMeshes = [];
    this.active = true;
    this._frozen = false;
    this._frozenAngle = new Map();

    const color = new THREE.Color(industry.color);

    // ─ SUN ─
    const sunMat = new THREE.ShaderMaterial({
      vertexShader: starVertexShader,
      fragmentShader: starFragmentShader,
      uniforms: {
        uTime:      { value: 0 },
        uColor:     { value: color.clone() },
        uIntensity: { value: 0.65 },
        uAudio:     { value: 0 },
      },
    });
    this._sunMat = sunMat;
    this.sunMat = sunMat;
    const sun = new THREE.Mesh(new THREE.IcosahedronGeometry(28, 6), sunMat);
    sun.userData = { type: 'core', subdomain, industry };
    this.sunMesh = sun;
    this.group.add(sun);

    // Sun glow sprite — keep small so company planets aren't swallowed
    const glowSpr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlow(), color, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glowSpr.scale.set(75, 75, 1);
    this.group.add(glowSpr);

    // Strong white/tinted point light from sun so planets are well-lit
    const lightColor = new THREE.Color(0xffffff).lerp(color, 0.3); // mostly white, slightly tinted
    this.group.add(new THREE.PointLight(lightColor.getHex(), 4.5, 1500, 1.2));

    // Ambient light so dark sides of planets are brightly visible
    this.group.add(new THREE.AmbientLight(0xffffff, 0.45));

    // ─ COMPANY PLANETS ─
    const companies = subdomain.companies || [];
    const maxEmp    = Math.max(...companies.map(c => c.employees || 1), 1);

    companies.forEach((company, idx) => {
      // Bound radius so they don't go infinitely far away, but keep the spiral look
      const maxRadius = 800;
      const minRadius = 180;
      const orbitRadius = minRadius + (idx / Math.max(1, companies.length - 1)) * (maxRadius - minRadius);
      // Add the same + idx * 0.5 angle wrap used by subdomains to make it look identical
      const angle = (idx / companies.length) * Math.PI * 2 + idx * 0.5;
      const speed = 3.0 / Math.sqrt(orbitRadius); // rad/sec

      const container = new THREE.Group();
      container.position.set(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius);

      const texture = generatePlanetTexture(color, company.id.length * (company.employees || 1) + Math.random());

      const r = 8 + ((company.employees || 0) / maxEmp) * 12;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 64, 64),
        new THREE.MeshStandardMaterial({
          map: texture,
          bumpMap: texture,
          bumpScale: 0.5,
          color: 0xffffff, // The texture already has the color
          roughness: 0.8,
          metalness: 0.1,
        })
      );
      mesh.userData = { type: 'company', company, subdomain, industry, planetSize: r };
      
      container.add(mesh);
      this.companyMeshes.push(mesh);

      // Glow
      const cgSpr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getGlow(), color, transparent: true, opacity: 0.08,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      cgSpr.scale.set(r * 4, r * 4, 1);
      container.add(cgSpr);

      this.group.add(container);
      this._containers.push({ container, orbitRadius, angle, speed });
    });

    // ─ LOCAL STAR FIELD ─
    const N   = 900;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const r  = 350 + Math.random() * 1100;
      pos[i*3]   = r * Math.sin(ph) * Math.cos(th);
      pos[i*3+1] = r * Math.sin(ph) * Math.sin(th);
      pos[i*3+2] = r * Math.cos(ph);
      // White + subtle industry tint
      col[i*3]   = 0.75 + color.r * 0.2 * Math.random();
      col[i*3+1] = 0.75 + color.g * 0.2 * Math.random();
      col[i*3+2] = 0.85 + color.b * 0.1 * Math.random();
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    this._starMat = new THREE.PointsMaterial({
      vertexColors: true, size: 1.3, sizeAttenuation: true,
      transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.group.add(new THREE.Points(starGeo, this._starMat));

    this.scene.add(this.group);

    // Fade stars in
    gsap.to(this._starMat, { opacity: 0.85, duration: 1.8, ease: 'power2.out' });
  }

  /** Skip star-field fade-in after session restore. */
  revealInstantly() {
    if (this._starMat) {
      gsap.killTweensOf(this._starMat);
      this._starMat.opacity = 0.85;
    }
  }

  // ── UPDATE (called every frame) ──────────────────────────────────────────
  update(elapsed) {
    if (!this.group) return;
    if (this._sunMat) this._sunMat.uniforms.uTime.value = elapsed;
    const iv = this._activeInterior();
    if (iv?.active) iv.update(elapsed);
    if (this._frozen) return;  // planets are stopped — skip orbit update
    const ts = 0.016 * 0.12;
    this._containers.forEach(cc => {
      cc.angle += cc.speed * ts;
      cc.container.position.set(
        Math.cos(cc.angle) * cc.orbitRadius,
        Math.sin(cc.angle * 2.0) * 1.5,
        Math.sin(cc.angle) * cc.orbitRadius
      );
    });
    this._atmoMats.forEach(m => { m.uniforms.uTime.value = elapsed; });
  }

  /** Stop all planets in their current positions */
  freeze() { this._frozen = true; }

  /** Resume normal orbiting */
  unfreeze() { this._frozen = false; }

  // ── DESTROY ──────────────────────────────────────────────────────────────
  destroy() {
    if (!this.group) return;
    this.exitCompanyInterior();
    if (this._starMat) gsap.to(this._starMat, { opacity: 0, duration: 0.2 });
    this.scene.remove(this.group);
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
    this.group      = null;
    this._sunMat    = null;
    this._containers = [];
    this._atmoMats  = [];
    this.companyMeshes = [];
    this.active = false;
  }

  // ── DYNAMIC PLANET CREATION ──────────────────────────────────────────────
  /**
   * Spawn a brand-new company planet into orbit around the sun.
   * Returns the mesh so the caller can track its world position.
   */
  addCompanyPlanet(company, subdomain, industry) {
    if (!this.group) return null;

    const color = new THREE.Color(industry.color);
    const existingCount = this._containers.length;
    
    // Use the same bounded radius + angle wrap logic for new planets
    const maxRadius = 800;
    const minRadius = 180;
    const orbitRadius = minRadius + (existingCount / Math.max(1, existingCount)) * (maxRadius - minRadius) + 40; // slight push out for new ones
    const angle = (existingCount / Math.max(1, existingCount + 1)) * Math.PI * 2 + existingCount * 0.5;
    const speed = 3.0 / Math.sqrt(orbitRadius);

    const container = new THREE.Group();
    container.position.set(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius);

    const texture = generatePlanetTexture(color, company.name.length * 7 + Math.random() * 1000);
    const r = 12;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 64, 64),
      new THREE.MeshStandardMaterial({
        map: texture,
        bumpMap: texture,
        bumpScale: 0.5,
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0.1,
      })
    );
    mesh.userData = { type: 'company', company, subdomain, industry, planetSize: r };
    container.add(mesh);
    this.companyMeshes.push(mesh);

    // Glow sprite
    const cgSpr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlow(), color, transparent: true, opacity: 0.08,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    cgSpr.scale.set(r * 4, r * 4, 1);
    container.add(cgSpr);

    // Spawn animation — scale from 0
    container.scale.setScalar(0.01);
    gsap.to(container.scale, { x: 1, y: 1, z: 1, duration: 1.2, ease: 'elastic.out(1, 0.5)' });

    this.group.add(container);
    this._containers.push({ container, orbitRadius, angle, speed, companyId: company.id });

    return mesh;
  }

  /**
   * Remove a specifically spawned company planet (e.g. if draft is cancelled)
   */
  removeCompanyPlanet(companyId) {
    if (!this.group) return;

    // Remove from meshes array
    const meshIndex = this.companyMeshes.findIndex(m => m.userData.company?.id === companyId);
    if (meshIndex !== -1) {
      this.companyMeshes.splice(meshIndex, 1);
    }

    // Remove from containers array and scene graph
    const containerIndex = this._containers.findIndex(c => c.companyId === companyId);
    if (containerIndex !== -1) {
      const { container } = this._containers[containerIndex];
      this.group.remove(container);
      
      // Clean up geometries/materials to prevent memory leaks
      container.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      });
      
      this._containers.splice(containerIndex, 1);
    }
  }

  /** Live-update the name stored in a company mesh's userData */
  updateCompanyLabel(companyId, newName) {
    const mesh = this.companyMeshes.find(m => m.userData.company?.id === companyId);
    if (mesh) {
      mesh.userData.company = { ...mesh.userData.company, name: newName };
    }
  }

  /** Get the world-space position of the sun (centre of the solar system) */
  getSunWorldPosition() {
    if (!this.group) return new THREE.Vector3();
    return this.group.position.clone();
  }

  enterCompanyInterior(companyMesh, departments, industryColorHex) {
    if (!companyMesh) return;
    this.planetRootView.exit();
    this._interiorMode = 'dept';
    this.freeze();
    this.interiorView.enter(companyMesh, departments, industryColorHex);
  }

  enterCompanyPlanetRoots(companyMesh, tree, industryColorHex) {
    if (!companyMesh) return;
    this.interiorView.exit();
    this._interiorMode = 'planet';
    this.freeze();
    this.planetRootView.enter(companyMesh, tree, industryColorHex);
  }

  exitCompanyInterior() {
    this.interiorView.exit();
    this.planetRootView.exit();
    this._interiorMode = 'none';
    this.unfreeze();
  }

  getInteriorNodeMeshes() {
    const iv = this._activeInterior();
    return iv?.active ? iv.getNodeMeshes() : [];
  }

  getInteriorFocusPosition() {
    const iv = this._activeInterior();
    return iv?.active ? iv.getFocusWorldPosition() : null;
  }

  getInteriorCameraDistance() {
    const iv = this._activeInterior();
    return iv?.active ? iv.getCameraDistance() : 28;
  }

  drillInteriorInto(nodeId) {
    const iv = this._activeInterior();
    return iv?.active ? iv.drillInto(nodeId) : false;
  }

  drillInteriorBack() {
    const iv = this._activeInterior();
    return iv?.active ? iv.drillBack() : false;
  }

  get interiorViewActive() {
    return !!this._activeInterior()?.active;
  }

  /** Scale down sibling planets during company interior view */
  morphOutSiblings(keepCompanyId, delay = 0.4, duration = 1.2) {
    if (!this.group) return;
    this.freeze();
    this._containers.forEach(cc => {
      const mesh = cc.container.children.find(c => c.userData?.company);
      if (mesh?.userData?.company?.id !== keepCompanyId) {
        gsap.killTweensOf(cc.container.scale);
        gsap.to(cc.container.scale, { x: 0.001, y: 0.001, z: 0.001, duration, delay, ease: 'power3.inOut' });
      }
    });
    const sunMesh = this.group.children[0];
    if (sunMesh?.scale) {
      gsap.killTweensOf(sunMesh.scale);
      gsap.to(sunMesh.scale, { x: 0.001, y: 0.001, z: 0.001, duration, delay, ease: 'power3.in' });
    }
    if (this._starMat) {
      gsap.killTweensOf(this._starMat);
      gsap.to(this._starMat, { opacity: 0, duration, delay, ease: 'power2.in' });
    }
  }

  /** Restore solar system after exiting company polytope */
  restoreFromCompanyEntry() {
    if (!this.group) return;
    this._containers.forEach(cc => {
      gsap.killTweensOf(cc.container.scale);
      gsap.to(cc.container.scale, { x: 1, y: 1, z: 1, duration: 1.0, ease: 'power2.out' });
    });
    const sunMesh = this.group.children[0];
    if (sunMesh?.scale) {
      gsap.killTweensOf(sunMesh.scale);
      gsap.to(sunMesh.scale, { x: 1, y: 1, z: 1, duration: 1.0, ease: 'power2.out' });
    }
    if (this._starMat) {
      gsap.killTweensOf(this._starMat);
      gsap.to(this._starMat, { opacity: 0.85, duration: 1.0, ease: 'power2.out' });
    }
    this.unfreeze();
  }

  // ── HELPERS ──────────────────────────────────────────────────────────────
  getCompanyWorldPosition(companyId) {
    const mesh = this.companyMeshes.find(m => m.userData.company.id === companyId);
    if (!mesh) return new THREE.Vector3();
    const wp = new THREE.Vector3();
    mesh.getWorldPosition(wp);
    return wp;
  }
}
