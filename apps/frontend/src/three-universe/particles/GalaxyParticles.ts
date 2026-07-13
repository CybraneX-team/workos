// @ts-nocheck
/**
 * GalaxyParticles.js — Pure Particle Galaxy
 * 
 * No sprites, no boxes — everything is shader-based points.
 * Logarithmic spiral arms with muted, realistic space colors.
 * Industry positions marked by denser/brighter particle clusters.
 */

import * as THREE from 'three';
import gsap from 'gsap';
import galaxyVertexShader from '../shaders/galaxy/vertex.glsl';
import galaxyFragmentShader from '../shaders/galaxy/fragment.glsl';
import { U_NODES, U_DOMAIN_COLOR } from '../../lib/universalPolytopeData';

const PERSISTED_ANGLES: Record<string, number> = {};

export class GalaxyParticles {
  constructor(scene, industries) {
    this.scene = scene;
    this.industries = industries;
    this.particles = null;
    this.material = null;
    this.backgroundStars = null;

    // Dynamically generate orbital config for any number of industries
    const TAU = Math.PI * 2;
    const N = industries.length;
    const fract = x => x - Math.floor(x);
    const pseudoRand = (idx, salt) => fract(Math.abs(Math.sin(idx * salt) * 43758.5453));
    this.galaxyOrbitData = industries.map((ind, idx) => ({
      id: ind.id,
      angle: PERSISTED_ANGLES[ind.id] !== undefined ? PERSISTED_ANGLES[ind.id] : TAU * (idx / N),
      radius: 14000,
      speed: 0.000055,
      size: 2.5 + pseudoRand(idx, 311.7) * 0.8,
      inclination: 0,
      ascNode: 0,
    }));

    // Adaptive quality
    this.perfTier = this._detectPerf();
    const counts = {
      low: { galaxy: 10000,  bg: 400 },
      mid: { galaxy: 20000, bg: 800 },
      high: { galaxy: 30000, bg: 1200 },
    };
    this.counts = counts[this.perfTier];

    this.params = {
      arms: 4,
      radius: 400000,
      coreRadius: 2000,
      armTight: 0.8,
      armSpread: 0.1,
    };

    this._createGalaxy();
    this._createBackgroundStars();
    this._createUniverseSphere();
    this._createBlackHole();
    this._createBlackHoleInterior();
    this.onEnterBH  = null;
    this.onExitBH   = null;
    this._insideBH  = false;
    this._insideEH  = false;
    this._bhEnabled = true;  // disabled during subdomain/solar-system view
    this._insideIndustryView = false;
  }

  _detectPerf() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return 'low';
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const r = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL).toLowerCase() : '';
      if (r.includes('intel') || r.includes('mesa') || r.includes('swift')) return 'low';
      if (window.devicePixelRatio <= 1.5) return 'mid';
      return 'high';
    } catch { return 'mid'; }
  }

  _gauss() {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  _createGalaxy() {
    const count = this.counts.galaxy;
    const p = this.params;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const speeds = new Float32Array(count);
    const brightness = new Float32Array(count);

    // Muted, realistic space palette per industry — supports both raw and ind-prefixed IDs
    const palettes = {
      'technology':                 { h: 0.73, s: 0.45, l: 0.65 },
      'finance':                    { h: 0.44, s: 0.4, l: 0.6 },
      'manufacturing':              { h: 0.08, s: 0.35, l: 0.58 },
      'healthcare':                 { h: 0.97, s: 0.4, l: 0.62 },
      'education':                  { h: 0.6, s: 0.4, l: 0.65 },
      'media--entertainment':       { h: 0.07, s: 0.4, l: 0.62 },
      'commerce':                   { h: 0.9, s: 0.35, l: 0.65 },
      'energy--sustainability':     { h: 0.38, s: 0.35, l: 0.58 },
      'government--public-systems': { h: 0.55, s: 0.3, l: 0.55 },
      'mobility--transportation':   { h: 0.15, s: 0.4, l: 0.6 },
      'real-estate--infrastructure':{ h: 0.08, s: 0.3, l: 0.62 },
      'agriculture--food':          { h: 0.33, s: 0.4, l: 0.55 },
      // WorkOS ind-prefixed IDs
      'ind-saas':           { h: 0.73, s: 0.45, l: 0.65 },
      'ind-fintech':        { h: 0.44, s: 0.4, l: 0.6 },
      'ind-healthtech':     { h: 0.97, s: 0.4, l: 0.62 },
      'ind-edtech':         { h: 0.6, s: 0.4, l: 0.65 },
      'ind-ecommerce':      { h: 0.9, s: 0.35, l: 0.65 },
      'ind-aiml':           { h: 0.12, s: 0.45, l: 0.65 },
      'ind-cleantech':      { h: 0.38, s: 0.35, l: 0.58 },
      'ind-logistics':      { h: 0.15, s: 0.4, l: 0.6 },
      'ind-gaming':         { h: 0.07, s: 0.4, l: 0.62 },
      'ind-mobility':       { h: 0.15, s: 0.4, l: 0.6 },
      'ind-media':          { h: 0.07, s: 0.4, l: 0.62 },
      'ind-agritech':       { h: 0.33, s: 0.4, l: 0.55 },
      'ind-cyber':          { h: 0.68, s: 0.4, l: 0.6 },
      'ind-space':          { h: 0.48, s: 0.35, l: 0.6 },
      'ind-proptech':       { h: 0.08, s: 0.3, l: 0.62 },
    };

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Radial distribution — massive center bias, long infinite tail
      const t = Math.random();
      const dist = Math.pow(t, 2.0) * p.radius;

      // Spiral arm
      const armIdx = Math.floor(Math.random() * p.arms);
      const armBase = (armIdx / p.arms) * Math.PI * 2;
      const spiral = p.armTight * Math.log(Math.max(dist, 1)) * 3;
      
      // Deviation increases drastically further out (gas diffusion)
      const deviation = this._gauss() * p.armSpread * Math.max(0.2, (dist / 1000));
      const angle = armBase + spiral + deviation;

      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const thickness = 20 * Math.exp(-dist / (p.coreRadius));
      const y = this._gauss() * thickness;

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;

      // Color — find nearest industry and apply muted palette
      const pAngle = Math.atan2(z, x);
      let nearest = this.industries[0];
      let nearDist = Infinity;
      for (const ind of this.industries) {
        let diff = Math.abs(pAngle - ind.angle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < nearDist) { nearDist = diff; nearest = ind; }
      }

      const pal = palettes[nearest.id] || { h: 0, s: 0, l: 0.7 };
      const ownership = Math.max(0, 1 - nearDist / (Math.PI / this.industries.length));

      const coreness = Math.max(0, 1 - dist / p.coreRadius);
      const color = new THREE.Color();

      // Core: warm tint, reduced brightness so it doesn't bloom white from industry view
      if (coreness > 0.3) {
        color.setHSL(
          0.1,
          0.15 * (1 - coreness),
          0.52 + coreness * 0.10  // ← TUNING: lower = dimmer core
        );
      } else {
        color.setHSL(
          pal.h + (Math.random() - 0.5) * 0.03,
          pal.s * (0.3 + ownership * 0.7) * 0.8,
          pal.l + (Math.random() - 0.5) * 0.1
        );
      }

      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;

      // Size — bigger near core
      sizes[i] = (0.3 + Math.random() * 1.2) * (1 + coreness * 2.5);

      // Orbital speed — Keplerian
      speeds[i] = (0.008 + Math.random() * 0.012) / Math.max(Math.pow(dist / 40, 0.5), 0.3);

      // Brightness
      brightness[i] = 0.30 + Math.random() * 0.4 + coreness * 0.30;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geo.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: galaxyVertexShader,
      fragmentShader: galaxyFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 3.5 },
        uZoomLevel: { value: 0.0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geo, this.material);
    this.scene.add(this.particles);
  }

  _createBackgroundStars() {
    const count = this.counts.bg;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 25000 + Math.random() * 15000; // Massively pushed back
      pos[i3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i3 + 2] = r * Math.cos(phi);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xaaaacc,
      size: 1.5,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      fog: false,
    });

    this.backgroundStars = new THREE.Points(geo, mat);
    this.scene.add(this.backgroundStars);
  }

  _createUniverseSphere() {
    // Observable universe boundary sphere — camera maxDistance=30000, sphere at 32000
    // sizeAttenuation:false keeps particles as fixed screen-size dots regardless of distance
    const count = 1000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      // Shell just outside galaxy orbits (max 16000) — camera zooms out to 38000 to see it as a circle
      const r = 20000 + (Math.random() - 0.5) * 800;

      pos[i3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i3 + 2] = r * Math.cos(phi);

      // Blue-white cosmic boundary color
      const tint = Math.random();
      if (tint < 0.55) {
        // Pure white
        col[i3] = 0.95; col[i3 + 1] = 0.95; col[i3 + 2] = 1.0;
      } else if (tint < 0.80) {
        // Blue-white
        col[i3] = 0.6 + Math.random() * 0.2;
        col[i3 + 1] = 0.75 + Math.random() * 0.15;
        col[i3 + 2] = 1.0;
      } else {
        // Soft purple
        col[i3] = 0.7 + Math.random() * 0.2;
        col[i3 + 1] = 0.5 + Math.random() * 0.2;
        col[i3 + 2] = 1.0;
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const mat = new THREE.PointsMaterial({
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      size: 6.0,
      fog: false,
    });

    this.universeSphere = new THREE.Points(geo, mat);
    this.scene.add(this.universeSphere);
  }

  _createBlackHole() {
    const EH_R  = 900;    // event horizon radius
    const IN_R  = 1050;   // disk inner edge
    const OUT_R = 5200;   // disk outer edge (wider for particle spread)

    const group = new THREE.Group();

    // ── Event horizon ──────────────────────────────────────────────────
    // renderOrder 999 + depthTest:false → paints black over EVERY pixel
    // in its silhouette (particles, stars, disk, whatever rendered before).
    // depthWrite:true → writes depth so ring/arc can test against it.
    const ehMesh = new THREE.Mesh(
      new THREE.SphereGeometry(EH_R, 64, 64, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,   // transparent bucket → renders AFTER disk/particles
        opacity: 1.0,
        depthWrite: true,
        depthTest: false,
      }),
    );
    ehMesh.scale.set(1, 0.5, 1);
    ehMesh.renderOrder = 999;
    group.add(ehMesh);

    // ── BackSide occluder (always-on) ──────────────────────────────────
    // BackSide → invisible from outside, auto-visible once camera enters EH.
    // depthTest:false + renderOrder 998 → paints solid black over all
    // external geometry the moment camera crosses the event horizon.
    const occluder = new THREE.Mesh(
      new THREE.SphereGeometry(EH_R * 0.99, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.BackSide,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        depthTest: false,
      }),
    );
    occluder.scale.set(1, 0.5, 1);
    occluder.renderOrder = 998;
    group.add(occluder);

    // Invisible click target for reliable raycasting (full sphere, larger than EH)
    const clickTarget = new THREE.Mesh(
      new THREE.SphereGeometry(EH_R * 1.5, 16, 16),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    clickTarget.userData.isBHClickTarget = true;
    group.add(clickTarget);

    this._bhGroup = group;
    this.scene.add(group);

    // Accretion disk as particle system (added after group is in scene)
    this._createAccretionParticles(EH_R, IN_R, OUT_R);
  }

  _createAccretionParticles(EH_R: number, IN_R: number, OUT_R: number) {
    const COUNT       = 7000;
    const NUM_ARMS    = 5;       // 5 spiral arms
    const ARM_TIGHT   = 2.6;    // logarithmic spiral tightness

    const aR     = new Float32Array(COUNT);
    const aA0    = new Float32Array(COUNT);
    const aSpd   = new Float32Array(COUNT);
    const aSize  = new Float32Array(COUNT);
    const aColor = new Float32Array(COUNT * 3);

    // Box-Muller gaussian
    const gauss = () => {
      let u = 0, v = 0;
      while (!u) u = Math.random();
      while (!v) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    for (let i = 0; i < COUNT; i++) {
      // Strong inner bias: pow² → most particles near inner edge,
      // counts drop sharply toward outer edge.
      const t = Math.pow(Math.random(), 2.2);
      const r = IN_R + (OUT_R - IN_R) * t;
      aR[i] = r;

      // Place on a logarithmic spiral arm
      const arm = Math.floor(Math.random() * NUM_ARMS);
      const armBase    = (arm / NUM_ARMS) * Math.PI * 2;
      const spiralAng  = armBase + ARM_TIGHT * Math.log(r / IN_R);

      // Angular scatter: zero at inner edge, broadens outward
      const scatter = gauss() * 0.22 * Math.pow(t, 0.55);
      aA0[i] = spiralAng + scatter;

      // Keplerian: ω ∝ r^(-3/2), scaled for visual speed
      aSpd[i] = 0.11 / Math.sqrt(r / IN_R);

      // Smaller tight particles inner, larger diffuse outer
      aSize[i] = 0.5 + t * 2.8;

      // Color: white-yellow (inner) → orange → dark red (outer)
      let cr: number, cg: number, cb: number;
      if (t < 0.28) {
        const lt = t / 0.28;
        cr = 1.00; cg = 0.90 - lt * 0.50; cb = 0.65 - lt * 0.58;
      } else if (t < 0.62) {
        const lt = (t - 0.28) / 0.34;
        cr = 1.00; cg = 0.40 - lt * 0.26; cb = 0.07;
      } else {
        const lt = (t - 0.62) / 0.38;
        cr = 0.95 - lt * 0.52; cg = 0.14 - lt * 0.12; cb = 0.07;
      }
      const j = (Math.random() - 0.5) * 0.10;
      aColor[i * 3]     = Math.min(1, Math.max(0, cr + j));
      aColor[i * 3 + 1] = Math.min(1, Math.max(0, cg + j * 0.4));
      aColor[i * 3 + 2] = Math.min(1, Math.max(0, cb));
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geo.setAttribute('aR',     new THREE.BufferAttribute(aR,    1));
    geo.setAttribute('aA0',    new THREE.BufferAttribute(aA0,   1));
    geo.setAttribute('aSpd',   new THREE.BufferAttribute(aSpd,  1));
    geo.setAttribute('aSize',  new THREE.BufferAttribute(aSize, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:       { value: 0 },
        uPixelRatio: { value: window.devicePixelRatio || 1 },
        uInner:      { value: IN_R },
        uOuter:      { value: OUT_R },
      },
      vertexShader: `
        attribute float aR;
        attribute float aA0;
        attribute float aSpd;
        attribute float aSize;
        attribute vec3  aColor;

        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uInner;
        uniform float uOuter;

        varying vec3  vColor;
        varying float vAlpha;

        void main() {
          float angle = aA0 - uTime * aSpd;

          float x = aR * cos(angle);
          float z = aR * sin(angle);

          // Vertical scatter: thin disk, thickens slightly outward
          float t = (aR - uInner) / (uOuter - uInner);
          float ySpread = 28.0 + t * 90.0;
          float y = sin(aA0 * 4.9 + aR * 0.0007) * ySpread * 0.5;

          vec4 mvPos    = modelViewMatrix * vec4(x, y, z, 1.0);
          float camDist = max(-mvPos.z, 1.0);

          float sz = uPixelRatio * aSize * (8000.0 / camDist);
          gl_PointSize = clamp(sz, 0.5, 10.0 * uPixelRatio);
          gl_Position  = projectionMatrix * mvPos;

          // Doppler brightening (relativistic approximation)
          float doppler = 0.55 + 0.45 * cos(angle);
          // Alpha: strong falloff at outer edge → sparse rim feel
          vAlpha  = pow(1.0 - t, 1.80) * (0.55 + 0.45 * doppler);
          vColor  = aColor * (0.75 + 0.50 * doppler);
        }
      `,
      fragmentShader: `
        varying vec3  vColor;
        varying float vAlpha;
        void main() {
          vec2  uv = gl_PointCoord - 0.5;
          float d  = length(uv);
          if (d > 0.5) discard;
          float soft = 1.0 - smoothstep(0.08, 0.50, d);
          gl_FragColor = vec4(vColor, vAlpha * soft);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._bhAccretionMat = mat;
    this._bhAccretionGeo = geo;
    this._bhGroup.add(new THREE.Points(geo, mat));
  }

  _createBlackHoleInterior() {
    // Pure vanilla Three.js — no ConvexGeometry, no custom shaders, no three-stdlib
    // MeshBasicMaterial + AdditiveBlending — opacity tweened directly by GSAP
    const SCALE  = 32;   // node orbit radius = 12 * SCALE = 384 BH units
    const NODE_R = 18;   // node sphere radius
    const CORE_R = 26;   // central core radius
    const group  = new THREE.Group();

    // ── Symmetric dir helpers ─────────────────────────────────────────────
    const PHI = (1 + Math.sqrt(5)) / 2;
    const icoDirs = () => {
      const t = PHI;
      return [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],
              [0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]]
        .map(([x,y,z]) => new THREE.Vector3(x,y,z).normalize());
    };
    const dodDirs = () => {
      const p = PHI, q = 1/p;
      return [[1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1],[-1,1,1],[-1,1,-1],[-1,-1,1],[-1,-1,-1],
              [0,q,p],[0,q,-p],[0,-q,p],[0,-q,-p],[q,p,0],[q,-p,0],[-q,p,0],[-q,-p,0],
              [p,0,q],[p,0,-q],[-p,0,q],[-p,0,-q]]
        .map(([x,y,z]) => new THREE.Vector3(x,y,z).normalize());
    };
    const geoDirs = (n) => {
      const base = icoDirs();
      const pool = [...base];
      for (let a=0;a<base.length;a++)
        for (let b=a+1;b<base.length;b++)
          pool.push(base[a].clone().add(base[b]).normalize());
      const chosen = [pool[0]];
      while (chosen.length < n) {
        let bi=0, bd=-1;
        for (let i=0;i<pool.length;i++) {
          const d = Math.min(...chosen.map(c => pool[i].distanceTo(c)));
          if (d > bd) { bd=d; bi=i; }
        }
        chosen.push(pool[bi]);
      }
      return chosen;
    };
    const symDirs = (n) => n===12 ? icoDirs() : n===20 ? dodDirs() : geoDirs(n);
    const shuffle = (arr, seed=42) => {
      const a=[...arr]; let s=seed;
      const rng=()=>{ s=(s*1664525+1013904223)&0xffffffff; return (s>>>0)/0xffffffff; };
      for (let i=a.length-1;i>0;i--) { const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
      return a;
    };

    // ── Data: same layout as UniversalPolytope ────────────────────────────
    const departments  = U_NODES.filter(n => n.domain !== 'inactive');
    const N            = departments.length;
    const nodePositions= shuffle(symDirs(N), 137).map(d => d.clone().multiplyScalar(12 * SCALE));
    const nodeColors   = departments.map(n => new THREE.Color(U_DOMAIN_COLOR[n.domain]));
    const ORBIT_R      = 12 * SCALE;

    // All materials — GSAP tweens .opacity directly on MeshBasicMaterial
    const allMats: { mat: THREE.MeshBasicMaterial; target: number }[] = [];

    // ── Hull faces: IcosahedronGeometry colored by nearest node ──────────
    const hullGeo = new THREE.IcosahedronGeometry(ORBIT_R * 0.97, 2).toNonIndexed();
    const hPosAttr = hullGeo.getAttribute('position') as THREE.BufferAttribute;
    const hColors  = new Float32Array(hPosAttr.count * 3);
    for (let i = 0; i < hPosAttr.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(hPosAttr, i);
      let nearIdx = 0, nearDist = Infinity;
      for (let j = 0; j < N; j++) {
        const d = nodePositions[j].distanceTo(v);
        if (d < nearDist) { nearDist = d; nearIdx = j; }
      }
      const c = nodeColors[nearIdx];
      hColors[i*3]=c.r; hColors[i*3+1]=c.g; hColors[i*3+2]=c.b;
    }
    hullGeo.setAttribute('color', new THREE.BufferAttribute(hColors, 3));
    const hullMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.renderOrder = 1000;
    group.add(hull);
    allMats.push({ mat: hullMat, target: 0.07 });

    // ── Edges: connect nearest-neighbor pairs (same threshold as UniversalPolytope) ─
    let minEdgeLen = Infinity;
    for (let i = 0; i < N; i++)
      for (let j = i+1; j < N; j++) {
        const d = nodePositions[i].distanceTo(nodePositions[j]);
        if (d < minEdgeLen) minEdgeLen = d;
      }
    const edgeThreshold = minEdgeLen * 1.05;

    const edgePts: THREE.Vector3[]  = [];
    const edgeCols: number[]        = [];
    for (let i = 0; i < N; i++) {
      for (let j = i+1; j < N; j++) {
        if (nodePositions[i].distanceTo(nodePositions[j]) <= edgeThreshold) {
          edgePts.push(nodePositions[i].clone(), nodePositions[j].clone());
          edgeCols.push(
            nodeColors[i].r, nodeColors[i].g, nodeColors[i].b,
            nodeColors[j].r, nodeColors[j].g, nodeColors[j].b,
          );
        }
      }
    }
    const edgesGeo = new THREE.BufferGeometry().setFromPoints(edgePts);
    edgesGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(edgeCols), 3));
    const edgeMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const edges = new THREE.LineSegments(edgesGeo, edgeMat);
    edges.renderOrder = 1001;
    group.add(edges);
    allMats.push({ mat: edgeMat, target: 0.85 });

    // ── Node spheres: glow halo + solid core ─────────────────────────────
    const nodeGeo  = new THREE.SphereGeometry(NODE_R, 16, 16);
    const haloGeo  = new THREE.SphereGeometry(NODE_R * 2.8, 12, 12);
    for (let i = 0; i < N; i++) {
      const col = nodeColors[i];

      const haloMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.copy(nodePositions[i]);
      halo.renderOrder = 1003;
      group.add(halo);
      allMats.push({ mat: haloMat, target: 0.12 });

      const coreMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const core = new THREE.Mesh(nodeGeo, coreMat);
      core.position.copy(nodePositions[i]);
      core.renderOrder = 1002;
      group.add(core);
      allMats.push({ mat: coreMat, target: 0.95 });
    }

    // ── OrgCore: navy central sphere + halo ──────────────────────────────
    const orgColor = new THREE.Color('#3b82f6');

    const orgHaloMat = new THREE.MeshBasicMaterial({
      color: orgColor,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const orgHalo = new THREE.Mesh(new THREE.SphereGeometry(CORE_R * 3.0, 16, 16), orgHaloMat);
    orgHalo.renderOrder = 1003;
    group.add(orgHalo);
    allMats.push({ mat: orgHaloMat, target: 0.15 });

    const orgCoreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#1e3a8a'),
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const orgCore = new THREE.Mesh(new THREE.SphereGeometry(CORE_R, 16, 16), orgCoreMat);
    orgCore.renderOrder = 1002;
    group.add(orgCore);
    allMats.push({ mat: orgCoreMat, target: 0.9 });

    group.visible = false;
    this._bhInteriorGroup = group;
    this._bhAllMats       = allMats;
    this._bhInteriorMats  = []; // legacy

    this.scene.add(group);
  }

  _transitionBHInterior(enter: boolean) {
    // The visual interior is now handled by the R3F UniversalPolytope overlay
    // in Universe3D.tsx — just fire the React callbacks; no vanilla Three.js
    // geometry is shown to avoid a double-polytope glitch.
    if (enter) {
      this.onEnterBH?.();
    } else {
      this.onExitBH?.();
    }
  }

  /** Called when camera crosses event horizon — fades galaxy in/out separately from polytope */
  _fadeGalaxyForBH(entering: boolean) {
    const dur  = 1.4;
    const ease = 'power2.inOut';
    if (entering) {
      if (this.material)
        gsap.to(this.material.uniforms.uSize, { value: 0, duration: dur * 0.5, ease });
      if (this.backgroundStars?.material) {
        const m = this.backgroundStars.material as THREE.PointsMaterial;
        gsap.to(m, { opacity: 0, duration: dur * 0.5, ease,
          onUpdate: () => { m.needsUpdate = true; } });
      }
      if (this.universeSphere?.material) {
        const m = this.universeSphere.material as THREE.PointsMaterial;
        gsap.to(m, { opacity: 0, duration: dur * 0.5, ease,
          onUpdate: () => { m.needsUpdate = true; } });
      }
    } else {
      // Force-show before fading in — setSubdomainLevel(true) may have set visible=false
      if (this.particles)        this.particles.visible       = true;
      if (this.backgroundStars) this.backgroundStars.visible  = true;
      if (this.universeSphere)  this.universeSphere.visible   = true;

      if (this.material) {
        gsap.killTweensOf(this.material.uniforms.uSize);
        gsap.to(this.material.uniforms.uSize, { value: 3.5, duration: dur, ease });
      }
      if (this.backgroundStars?.material) {
        const m = this.backgroundStars.material as THREE.PointsMaterial;
        gsap.killTweensOf(m);
        gsap.to(m, { opacity: 0.40, duration: dur, ease,
          onUpdate: () => { m.needsUpdate = true; } });
      }
      if (this.universeSphere?.material) {
        const m = this.universeSphere.material as THREE.PointsMaterial;
        gsap.killTweensOf(m);
        gsap.to(m, { opacity: 0.90, duration: dur, ease,
          onUpdate: () => { m.needsUpdate = true; } });
      }
    }
  }

  getIndustryPosition(idx, target) {
    const d = this.galaxyOrbitData[idx];
    const ox = Math.cos(d.angle) * d.radius;
    const oz = Math.sin(d.angle) * d.radius;
    if (target) { target.set(ox, 0, oz); return target; }
    return new THREE.Vector3(ox, 0, oz);
  }

  advanceOrbits() {
    this.galaxyOrbitData.forEach(d => { 
      d.angle += d.speed; 
      PERSISTED_ANGLES[d.id] = d.angle;
    });
  }

  getSizeMultiplier(idx) {
    return this.galaxyOrbitData[idx].size;
  }

  update(elapsed, zoomLevel, camPos?: THREE.Vector3) {
    if (this.material) {
      this.material.uniforms.uTime.value = elapsed;
      this.material.uniforms.uZoomLevel.value = zoomLevel;
    }
    // Animate accretion particle disk
    if (this._bhAccretionMat) this._bhAccretionMat.uniforms.uTime.value = elapsed;

    // Black hole — two-stage camera detection (disabled during subdomain solar-system view)
    if (camPos && this._bhEnabled) {
      const distSq = camPos.lengthSq();
      // Trigger radii — larger = polytope appears sooner (less scroll from galaxy view)
      const EH_R           = 1400;
      const POLY_R_TRIGGER = 1200;

      // ── Stage 1: entered event horizon → fade galaxy, stay dark ─────────
      const insideEH = distSq < EH_R * EH_R;
      if (insideEH !== this._insideEH) {
        this._insideEH = insideEH;
        this._fadeGalaxyForBH(insideEH);
      }

      // ── Stage 2: deep inside → show R3F polytope overlay via callback ────
      const inside = distSq < POLY_R_TRIGGER * POLY_R_TRIGGER;
      if (inside !== this._insideBH) {
        this._insideBH = inside;
        this._transitionBHInterior(inside);
      }
    }
  }

  /** Enable/disable the BH proximity trigger AND hide/show the BH mesh group.
   *  Must be false while the solar-system (subdomain) view is active — otherwise
   *  the black-hole group (at world origin) overlaps the solar system and the
   *  camera's distance check fires erroneously. */
  setBHEnabled(v: boolean) {
    this._bhEnabled = v;
    if (this._bhGroup) this._bhGroup.visible = v;
    if (!v) {
      // Reset internal state so the triggers fire cleanly on next enable
      this._insideBH = false;
      this._insideEH = false;
    }
  }

  setVisible(v) {
    if (this.particles) this.particles.visible = v;
    if (this.backgroundStars) this.backgroundStars.visible = v;
    if (this.universeSphere) this.universeSphere.visible = v;
  }

  /** Fully hide spiral + bg stars + universe sphere (subdomain level) */
  setSubdomainLevel(inside, dur = 2.8) {
    const ease = 'power3.inOut';
    // ShaderMaterial — animate uSize to 0
    if (this.material) {
      gsap.killTweensOf(this.material.uniforms.uSize);
      gsap.to(this.material.uniforms.uSize, { value: inside ? 0 : 3.5, duration: dur, ease });
    }
    // Background stars
    if (this.backgroundStars) {
      const m = this.backgroundStars.material;
      this.backgroundStars.visible = true;
      gsap.killTweensOf(m);
      gsap.to(m, { opacity: inside ? 0 : 0.40, duration: dur, ease,
        onUpdate: () => { m.needsUpdate = true; },
        onComplete: () => { if (inside) this.backgroundStars.visible = false; },
      });
    }
    // Universe sphere (outer star shell)
    if (this.universeSphere) {
      const m = this.universeSphere.material;
      this.universeSphere.visible = true;
      gsap.killTweensOf(m);
      gsap.to(m, { opacity: inside ? 0 : 0.9, duration: dur * 0.7, ease,
        onUpdate: () => { m.needsUpdate = true; },
        onComplete: () => { if (inside) this.universeSphere.visible = false; },
      });
    }
  }

  /** Snap galaxy visuals to industry/subdomain level without animation (session restore). */
  applyInsideIndustryState(inside) {
    this._insideIndustryView = inside;
    if (this.material?.uniforms?.uSize) {
      gsap.killTweensOf(this.material.uniforms.uSize);
      this.material.uniforms.uSize.value = inside ? 1 : 3.5;
    }
    if (this.backgroundStars) {
      const m = this.backgroundStars.material;
      gsap.killTweensOf(m);
      this.backgroundStars.visible = true;
      m.size = inside ? 3.5 : 1.5;
      m.opacity = inside ? 0.55 : 0.40;
      m.needsUpdate = true;
    }
    if (this.universeSphere) {
      const m = this.universeSphere.material;
      gsap.killTweensOf(m);
      this.universeSphere.visible = true;
      m.opacity = inside ? 0.15 : 0.9;
      m.needsUpdate = true;
    }
  }

  applySubdomainLevelState(inside) {
    if (this.material?.uniforms?.uSize) {
      gsap.killTweensOf(this.material.uniforms.uSize);
      this.material.uniforms.uSize.value = inside ? 0 : 3.5;
    }
    if (this.backgroundStars) {
      const m = this.backgroundStars.material;
      gsap.killTweensOf(m);
      if (inside) {
        this.backgroundStars.visible = false;
        m.opacity = 0;
      } else {
        this.backgroundStars.visible = true;
        m.opacity = 0.40;
      }
      m.needsUpdate = true;
    }
    if (this.universeSphere) {
      const m = this.universeSphere.material;
      gsap.killTweensOf(m);
      if (inside) {
        this.universeSphere.visible = false;
        m.opacity = 0;
      } else {
        this.universeSphere.visible = true;
        m.opacity = 0.9;
      }
      m.needsUpdate = true;
    }
  }

  /** Shrink particles when inside an industry — restore at galaxy level */
  setInsideIndustry(inside) {
    this._insideIndustryView = inside;
    const dur = 2.8;
    const ease = 'power3.inOut';

    if (this.material) {
      gsap.killTweensOf(this.material.uniforms.uSize);
      gsap.to(this.material.uniforms.uSize, { value: inside ? 1 : 3.5, duration: dur, ease });
    }

    if (this.backgroundStars) {
      const m = this.backgroundStars.material;
      this.backgroundStars.visible = true;
      gsap.killTweensOf(m);
      gsap.to(m, { size: inside ? 3.5 : 1.5, opacity: inside ? 0.55 : 0.40, duration: dur, ease,
        onUpdate: () => { m.needsUpdate = true; },
      });
    }

    // Universe sphere dims but stays visible inside industry
    if (this.universeSphere) {
      const m = this.universeSphere.material;
      this.universeSphere.visible = true;
      gsap.killTweensOf(m);
      gsap.to(m, { opacity: inside ? 0.15 : 0.9, duration: dur, ease,
        onUpdate: () => { m.needsUpdate = true; },
      });
    }
  }

  /** Industry workspace backdrop hide progress (0 = visible, 1 = hidden) — synced to camera compose zoom. */
  setIndustryWorkspaceBackdropProgress(t) {
    const spiralRest = this._insideIndustryView ? 1 : 3.5;
    const sphereRest = this._insideIndustryView ? 0.15 : 0.9;
    const bhScale = THREE.MathUtils.lerp(1, 0.001, t);
    const spiralSize = THREE.MathUtils.lerp(spiralRest, 0, t);
    const sphereOpacity = THREE.MathUtils.lerp(sphereRest, 0, t);

    if (this._bhGroup) {
      gsap.killTweensOf(this._bhGroup.scale);
      this._bhGroup.visible = bhScale > 0.002;
      this._bhGroup.scale.set(bhScale, bhScale, bhScale);
    }
    if (this.material) {
      gsap.killTweensOf(this.material.uniforms.uSize);
      this.material.uniforms.uSize.value = spiralSize;
    }
    if (this.universeSphere?.material) {
      const m = this.universeSphere.material;
      gsap.killTweensOf(m);
      m.opacity = sphereOpacity;
      m.needsUpdate = true;
      this.universeSphere.visible = sphereOpacity > 0.01;
    }

    if (t >= 0.99) {
      this._bhEnabled = false;
    } else if (t <= 0.01) {
      this.setBHEnabled(true);
    }
  }

  /** Hide central black hole + galaxy spiral during industry-level twin workspace. */
  setIndustryWorkspaceBackdrop(focused, duration = 0.88) {
    const ease = 'power2.inOut';

    if (focused) {
      this.setBHEnabled(false);
      if (this._bhGroup) {
        gsap.killTweensOf(this._bhGroup.scale);
        gsap.to(this._bhGroup.scale, { x: 0.001, y: 0.001, z: 0.001, duration, ease });
      }
      if (this.material) {
        gsap.killTweensOf(this.material.uniforms.uSize);
        gsap.to(this.material.uniforms.uSize, { value: 0, duration, ease });
      }
      if (this.backgroundStars?.material) {
        const m = this.backgroundStars.material;
        gsap.killTweensOf(m);
        gsap.to(m, {
          opacity: 0,
          duration,
          ease,
          onUpdate: () => { m.needsUpdate = true; },
          onComplete: () => { if (this.backgroundStars) this.backgroundStars.visible = false; },
        });
      }
      if (this.universeSphere?.material) {
        const m = this.universeSphere.material;
        gsap.killTweensOf(m);
        gsap.to(m, {
          opacity: 0,
          duration,
          ease,
          onUpdate: () => { m.needsUpdate = true; },
          onComplete: () => { if (this.universeSphere) this.universeSphere.visible = false; },
        });
      }
      return;
    }

    this.setBHEnabled(true);
    if (this._bhGroup) {
      gsap.killTweensOf(this._bhGroup.scale);
      this._bhGroup.visible = true;
      gsap.to(this._bhGroup.scale, { x: 1, y: 1, z: 1, duration, ease });
    }
    if (this.material) {
      gsap.killTweensOf(this.material.uniforms.uSize);
      gsap.to(this.material.uniforms.uSize, {
        value: this._insideIndustryView ? 1 : 3.5,
        duration,
        ease,
      });
    }
    if (this.backgroundStars?.material) {
      const m = this.backgroundStars.material;
      this.backgroundStars.visible = true;
      gsap.killTweensOf(m);
      gsap.to(m, {
        opacity: this._insideIndustryView ? 0.55 : 0.40,
        duration,
        ease,
        onUpdate: () => { m.needsUpdate = true; },
      });
    }
    if (this.universeSphere?.material) {
      const m = this.universeSphere.material;
      this.universeSphere.visible = true;
      gsap.killTweensOf(m);
      gsap.to(m, {
        opacity: this._insideIndustryView ? 0.15 : 0.9,
        duration,
        ease,
        onUpdate: () => { m.needsUpdate = true; },
      });
    }
  }

  dispose() {
    if (this.particles) { this.particles.geometry.dispose(); this.material.dispose(); this.scene.remove(this.particles); }
    if (this.backgroundStars) { this.backgroundStars.geometry.dispose(); this.backgroundStars.material.dispose(); this.scene.remove(this.backgroundStars); }
    if (this.universeSphere) { this.universeSphere.geometry.dispose(); this.universeSphere.material.dispose(); this.scene.remove(this.universeSphere); }
    if (this._bhGroup)         this.scene.remove(this._bhGroup);
    if (this._bhAccretionMat)  this._bhAccretionMat.dispose();
    if (this._bhAccretionGeo)  this._bhAccretionGeo.dispose();
    if (this._bhInteriorGroup) this.scene.remove(this._bhInteriorGroup);
    if (this._bhAllMats)       this._bhAllMats.forEach(({ mat }) => mat.dispose());
    if (this._bhInteriorMats)  this._bhInteriorMats.forEach(m => m.dispose());
  }
}
