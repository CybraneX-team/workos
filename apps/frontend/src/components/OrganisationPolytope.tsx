// @ts-nocheck
/**
 * OrganisationPolytope — ONE unified shell deformed by department performance vectors.
 * Departments are nodes anchored on the shell surface, not individual objects.
 * Spec: polytope.md — "the visible object is a projection, not a static chart"
 */
import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Command, ArrowLeft } from 'lucide-react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei/core/OrbitControls';
import { Stars } from '@react-three/drei/core/Stars';
import { Html } from '@react-three/drei/web/Html';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import gsap from 'gsap';

/* ── Domain colour strategy (polytope.md §3.3) ── */
type Domain = 'leadership' | 'people' | 'tech' | 'delivery' | 'commercial' | 'governance';
const DOMAIN_COLOR: Record<Domain, string> = {
  leadership:  '#a3e635',
  people:      '#60a5fa',
  tech:        '#c084fc',
  delivery:    '#2dd4bf',
  commercial:  '#fb923c',
  governance:  '#fbbf24',
};

/* ── Mock departments (polytope.md §5.2) ── */
interface Dept {
  id: string; label: string; domain: Domain;
  score: number; trend: '+' | '-' | '~'; headcount: number;
  metrics: { performance: number; maturity: number; risk: number; alignment: number };
}
const DEPTS: Dept[] = [
  { id:'exec',       label:'Executive',    domain:'leadership',  score:91, trend:'+', headcount:5,  metrics:{performance:91,maturity:88,risk:12,alignment:95} },
  { id:'strategy',   label:'Strategy',     domain:'leadership',  score:85, trend:'+', headcount:8,  metrics:{performance:85,maturity:80,risk:18,alignment:90} },
  { id:'pmo',        label:'PMO',          domain:'leadership',  score:78, trend:'~', headcount:6,  metrics:{performance:78,maturity:72,risk:22,alignment:82} },
  { id:'hr',         label:'HR',           domain:'people',      score:82, trend:'+', headcount:12, metrics:{performance:82,maturity:78,risk:15,alignment:85} },
  { id:'talent',     label:'Talent',       domain:'people',      score:74, trend:'~', headcount:9,  metrics:{performance:74,maturity:68,risk:28,alignment:76} },
  { id:'culture',    label:'Culture',      domain:'people',      score:88, trend:'+', headcount:4,  metrics:{performance:88,maturity:82,risk:10,alignment:91} },
  { id:'product',    label:'Product',      domain:'tech',        score:94, trend:'+', headcount:18, metrics:{performance:94,maturity:90,risk:8,alignment:88} },
  { id:'eng',        label:'Engineering',  domain:'tech',        score:89, trend:'+', headcount:40, metrics:{performance:89,maturity:86,risk:14,alignment:84} },
  { id:'data',       label:'Data',         domain:'tech',        score:76, trend:'-', headcount:11, metrics:{performance:76,maturity:65,risk:32,alignment:72} },
  { id:'ops',        label:'Operations',   domain:'delivery',    score:8, trend:'~', headcount:22, metrics:{performance:80,maturity:75,risk:20,alignment:78} },
  { id:'supply',     label:'Supply Chain', domain:'delivery',    score:71, trend:'-', headcount:14, metrics:{performance:71,maturity:62,risk:38,alignment:68} },
  { id:'sales',      label:'Sales',        domain:'commercial',  score:87, trend:'+', headcount:25, metrics:{performance:87,maturity:80,risk:16,alignment:83} },
  { id:'mktg',       label:'Marketing',    domain:'commercial',  score:83, trend:'+', headcount:15, metrics:{performance:83,maturity:76,risk:18,alignment:80} },
  { id:'finance',    label:'Finance',      domain:'governance',  score:90, trend:'~', headcount:8,  metrics:{performance:90,maturity:88,risk:10,alignment:92} },
  { id:'legal',      label:'Legal',        domain:'governance',  score:77, trend:'~', headcount:5,  metrics:{performance:77,maturity:74,risk:24,alignment:79} },
  { id:'risk',       label:'Risk',         domain:'governance',  score:73, trend:'-', headcount:6,  metrics:{performance:73,maturity:68,risk:30,alignment:74} },
  { id:'compliance', label:'Compliance',   domain:'governance',  score:81, trend:'+', headcount:4,  metrics:{performance:81,maturity:78,risk:16,alignment:83} },
];
const FEATURES = [
  { id:'strategy',   label:'Strategy',       domain:'leadership', route: '/twin/strategy' },
  { id:'team',       label:'Team & RBAC',    domain:'people',     route: '/twin/team' },
  { id:'data',       label:'Data Ingestion', domain:'tech',       route: '/twin/data' },
  { id:'analytics',  label:'Analytics',      domain:'tech',       route: '/twin/analytics' },
  { id:'benchmarks', label:'Benchmarks',     domain:'governance', route: '/twin/benchmarks' },
];

/* ── Fibonacci sphere distribution ── */
function fibSphere(n: number, r: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y   = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const theta = phi * i;
    pts.push(new THREE.Vector3(Math.cos(theta) * rad * r, y * r, Math.sin(theta) * rad * r));
  }
  return pts;
}

/* ── Polytope surface helpers — computed once at module level ── */
// Unit-length direction for each department (fibonacci distribution)
const DEPT_DIRS_UNIT: THREE.Vector3[] = fibSphere(DEPTS.length, 1.0);

/**
 * Returns the polytope surface radius in world units at any arbitrary direction.
 * Mirrors UnifiedShell’s vertex deformation formula exactly.
 * @param dir  - any THREE.Vector3 (will be normalised internally)
 * @param margin - inward scale so nodes sit just inside the mesh (default 0.95)
 */
function polytopeRadiusAtDir(dir: THREE.Vector3, margin = 0.95): number {
  const nd = dir.clone().normalize();
  let nearestDept = DEPTS[0];
  let minDist     = Infinity;
  DEPT_DIRS_UNIT.forEach((p, di) => {
    const d = nd.distanceTo(p);
    if (d < minDist) { minDist = d; nearestDept = DEPTS[di]; }
  });
  const perf = nearestDept.metrics.performance / 100;
  const disp = -1.2 + perf * 3.0;
  return (7 + disp * (1 - minDist * 0.6)) * margin;
}

/* ─────────────────────────────────
   UNIFIED SHELL — single deformed polytope
   Strong depts (score>85) push surface outward
   Weak depts (score<70) pull surface inward
───────────────────────────────── */
function UnifiedShell({ selectedIdx, positions, activeDomain }: {
  selectedIdx: number | null;
  positions: THREE.Vector3[];
  activeDomain: string | null;
}) {
  const meshRef    = useRef<THREE.Mesh>(null);
  const faceMeshRef = useRef<THREE.Mesh>(null);
  const wireMat    = useRef<THREE.MeshBasicMaterial>(null);
  const faceMat    = useRef<THREE.MeshBasicMaterial>(null);

  // Build a deformed icosphere with per-vertex domain colors
  // Also track per-vertex domain for face highlighting
  const { geometry, faceGeometry } = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(7, 4);
    const pos = geo.attributes.position;
    const tmp = new THREE.Vector3();
    const c   = new THREE.Color();
    const colors     = new Float32Array(pos.count * 3);
    const faceColors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      tmp.fromBufferAttribute(pos, i);
      const dir = tmp.clone().normalize();

      let nearest = DEPTS[0];
      let minDist = Infinity;
      positions.forEach((p, di) => {
        const d = dir.distanceTo(p.clone().normalize());
        if (d < minDist) { minDist = d; nearest = DEPTS[di]; }
      });

      const perf = nearest.metrics.performance / 100;
      const disp = -1.2 + perf * 3.0;
      tmp.copy(dir).multiplyScalar(7 + disp * (1 - minDist * 0.6));
      pos.setXYZ(i, tmp.x, tmp.y, tmp.z);

      // Wireframe vertex color (subtle)
      c.set(DOMAIN_COLOR[nearest.domain]);
      colors[i * 3]     = c.r * 0.55;
      colors[i * 3 + 1] = c.g * 0.55;
      colors[i * 3 + 2] = c.b * 0.55;

      // Face vertex color (vibrant, full domain color)
      faceColors[i * 3]     = c.r;
      faceColors[i * 3 + 1] = c.g;
      faceColors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // Clone for face mesh — shares the same vertex positions but different color attr
    const faceGeo = geo.clone();
    faceGeo.setAttribute('color', new THREE.BufferAttribute(faceColors, 3));

    return { geometry: geo, faceGeometry: faceGeo };
  }, [positions]);

  useFrame(() => {
    if (wireMat.current) {
      wireMat.current.opacity = THREE.MathUtils.lerp(
        wireMat.current.opacity,
        selectedIdx !== null ? 0.04 : 0.18,
        0.05
      );
    }
    if (faceMat.current) {
      // Fade global face fill to 0 when a dept is selected — DomainPlane takes over
      faceMat.current.opacity = THREE.MathUtils.lerp(
        faceMat.current.opacity,
        selectedIdx !== null ? 0.0 : 0.03,
        0.05
      );
    }
  });

  return (
    <group>
      {/* Translucent domain-colored faces on the polytope */}
      <mesh ref={faceMeshRef} geometry={faceGeometry}>
        <meshBasicMaterial
          ref={faceMat}
          vertexColors
          transparent
          opacity={0.03}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* Wireframe grid on top */}
      <mesh ref={meshRef} geometry={geometry}>
        <meshBasicMaterial
          ref={wireMat}
          vertexColors
          wireframe
          transparent opacity={0.18}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/* ─────────────────────────────────
   CURVE GENERATORS
───────────────────────────────── */
const CORE_SPHERE_RADIUS = 1.8; // must match HoloCoreSphere radius

function createCoreCurve(end: THREE.Vector3) {
  // Start exactly at the sphere surface in the node's radial direction.
  // NO lateral bow — straight radial line so the DomainPlane boundary
  // matches the rendered connection line perfectly.
  const dir = end.clone().normalize();
  const actualStart = dir.clone().multiplyScalar(CORE_SPHERE_RADIUS);

  // Use a midpoint on the straight radial path — no perpendicular offset.
  const mid = actualStart.clone().lerp(end, 0.5);

  return new THREE.QuadraticBezierCurve3(actualStart, mid, end);
}

function createPeerCurve(start: THREE.Vector3, end: THREE.Vector3) {
  // Straight midpoint — no inward bow — so the plane top-edge
  // lies exactly on the rendered peer connection line.
  const mid = start.clone().lerp(end, 0.5);

  return new THREE.QuadraticBezierCurve3(start, mid, end);
}

/* ─────────────────────────────────
   DOMAIN PLANE SHADER — glowing curved surface
   Uses a custom shader for radial gradient + rim glow + pulse.
───────────────────────────────── */
const domainPlaneVertexShader = `
varying vec2 vUv;
varying vec3 vPosition;
void main() {
  vUv = uv;
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const domainPlaneFragmentShader = `
uniform vec3  uColor;
uniform float uOpacity;
uniform float uTime;

varying vec2  vUv;
varying vec3  vPosition;

void main() {
  // vUv.x = radial (0=inner/sphere, 1=outer/node)
  // vUv.y = lateral (0=side A, 1=side B)

  // Radial fade: soft fade only at the very inner edge (near sphere)
  // No fade at outer edge so plane touches the outer boundary line fully
  float radialFade = smoothstep(0.0, 0.15, vUv.x);

  // Animated pulse traveling outward from core
  float pulse = 0.5 + 0.5 * sin(uTime * 2.2 - vUv.x * 5.0);

  // Edge glow: bright neon rim right at the lateral boundaries (touching the lines)
  float edgeDist = abs(vUv.y - 0.5) * 2.0;       // 0 at centre, 1 at edges
  float edgeGlow = pow(1.0 - edgeDist, 2.5);      // brighter toward the boundary lines
  float rimGlow  = pow(max(0.0, 1.0 - edgeDist - 0.55), 3.0) * 3.0; // sharp neon rim

  // Base fill: solid across the full lateral span (no lateral fade)
  float alpha = radialFade * (0.62 + 0.18 * pulse);
  // Add bright edge glow so plane visibly hugs the connection lines
  alpha += rimGlow * radialFade;
  alpha = clamp(alpha, 0.0, 1.0);

  // Color: brighter at the rim lines, slight white shimmer on pulse
  vec3 shimmer = mix(uColor * 1.4, vec3(1.0), rimGlow * 0.5 + pulse * 0.06);

  gl_FragColor = vec4(shimmer, alpha * uOpacity);
}
`;

/* ─────────────────────────────────
   DOMAIN PLANE — Coons-patch petals (core→pair) + peer triangle fills.
   Petals:    one per pair of domain nodes.
   Triangles: one per triple of domain nodes (inter-dept fill).
   Both surfaces get a gentle 3-D arch for depth.
───────────────────────────────── */
function DomainPlane({ domainIndices, domainColor, nodePositionsRef }: {
  domainIndices: number[];
  domainColor: string;
  nodePositionsRef: React.MutableRefObject<THREE.Vector3[]>;
}) {
  const shaderRef = useRef<THREE.ShaderMaterial>(null);
  const opRef     = useRef(0);

  const SU = 18; // Coons lateral segs
  const SV = 18; // Coons radial  segs
  const ST = 14; // peer-triangle edge subdivisions

  const VERTS_P = (SU + 1) * (SV + 1);
  const TRIS_P  = SU * SV * 2;
  const VERTS_T = (ST + 1) * (ST + 2) / 2;
  const TRIS_T  = ST * ST;

  const N      = domainIndices.length;
  const NPETAL = Math.max(1, N * (N - 1) / 2);
  const NTRI   = Math.max(1, N * (N - 1) * (N - 2) / 6);
  const TOTAL_V = NPETAL * VERTS_P + NTRI * VERTS_T;
  const TOTAL_T = NPETAL * TRIS_P  + NTRI * TRIS_T;

  // Flat index inside a barycentric-subdivided triangle (row i, col j)
  const triIdx = (i: number, j: number) => i * (ST + 1) - (i * (i - 1)) / 2 + j;

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TOTAL_V * 3), 3));
    g.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(TOTAL_V * 2), 2));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(TOTAL_T * 3), 1));
    return g;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [NPETAL, NTRI]);

  const col = useMemo(() => new THREE.Color(domainColor), [domainColor]);

  useFrame(({ clock }) => {
    const mat = shaderRef.current;
    if (!mat) return;
    opRef.current = THREE.MathUtils.lerp(opRef.current, 1.0, 0.06);
    mat.uniforms.uOpacity.value = opRef.current;
    mat.uniforms.uTime.value    = clock.elapsedTime;
    mat.uniforms.uColor.value.copy(col);

    const pos    = nodePositionsRef.current;
    const posArr = geo.attributes.position.array as Float32Array;
    const uvArr  = geo.attributes.uv.array       as Float32Array;
    const idxArr = geo.index!.array              as Uint32Array;

    // ── Part 1: Core petals (one per pair) ────────────────────────
    let petals = 0;
    for (let a = 0; a < domainIndices.length; a++) {
      for (let b = a + 1; b < domainIndices.length; b++) {
        const pA = pos[domainIndices[a]];
        const pB = pos[domainIndices[b]];

        const leftPts  = createCoreCurve(pA).getPoints(SV);
        const rightPts = createCoreCurve(pB).getPoints(SV);
        const topPts   = createPeerCurve(pA, pB).getPoints(SU);

        const P00 = leftPts[0]; const P10 = rightPts[0];
        const P01 = leftPts[SV]; const P11 = rightPts[SV];

        // 3-D arch: perpendicular to petal plane
        const aN  = new THREE.Vector3().crossVectors(pA, pB).normalize();
        const aAmp = pA.distanceTo(pB) * 0.12;

        const vBase = petals * VERTS_P;
        const iBase = petals * TRIS_P;

        for (let iu = 0; iu <= SU; iu++) {
          const u   = iu / SU;
          const bot = P00.clone().lerp(P10, u);
          const top = topPts[iu];
          for (let iv = 0; iv <= SV; iv++) {
            const v = iv / SV;
            const pt = new THREE.Vector3();
            pt.addScaledVector(bot,       1 - v);
            pt.addScaledVector(top,       v);
            pt.addScaledVector(leftPts[iv],  1 - u);
            pt.addScaledVector(rightPts[iv], u);
            pt.addScaledVector(P00, -(1 - u) * (1 - v));
            pt.addScaledVector(P10, -u * (1 - v));
            pt.addScaledVector(P01, -(1 - u) * v);
            pt.addScaledVector(P11, -u * v);
            pt.addScaledVector(aN, Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * aAmp);
            const d = pt.length();
            if (d < CORE_SPHERE_RADIUS + 0.05) pt.multiplyScalar((CORE_SPHERE_RADIUS + 0.05) / d);
            const vi = vBase + iu * (SV + 1) + iv;
            posArr[vi*3]=pt.x; posArr[vi*3+1]=pt.y; posArr[vi*3+2]=pt.z;
            uvArr[vi*2]=v; uvArr[vi*2+1]=u;
          }
        }
        for (let iu = 0; iu < SU; iu++) {
          for (let iv = 0; iv < SV; iv++) {
            const v00=vBase+iu*(SV+1)+iv, v10=vBase+(iu+1)*(SV+1)+iv;
            const v01=vBase+iu*(SV+1)+iv+1, v11=vBase+(iu+1)*(SV+1)+iv+1;
            const qi=(iBase+iu*SV+iv)*6;
            idxArr[qi]=v00; idxArr[qi+1]=v10; idxArr[qi+2]=v11;
            idxArr[qi+3]=v00; idxArr[qi+4]=v11; idxArr[qi+5]=v01;
          }
        }
        petals++;
      }
    }

    // ── Part 2: Peer triangles (one per triple — inter-dept fill) ──
    let tris = 0;
    for (let a = 0; a < domainIndices.length; a++) {
      for (let b = a + 1; b < domainIndices.length; b++) {
        for (let c = b + 1; c < domainIndices.length; c++) {
          const pA = pos[domainIndices[a]];
          const pB = pos[domainIndices[b]];
          const pC = pos[domainIndices[c]];

          const aN = new THREE.Vector3().crossVectors(
            new THREE.Vector3().subVectors(pB, pA),
            new THREE.Vector3().subVectors(pC, pA)
          ).normalize();
          const centroid = pA.clone().add(pB).add(pC).divideScalar(3);
          if (aN.dot(centroid) < 0) aN.negate();
          const aAmp = centroid.length() * 0.18;

          const vBase = NPETAL * VERTS_P + tris * VERTS_T;
          const iBase = NPETAL * TRIS_P  + tris * TRIS_T;

          for (let i = 0; i <= ST; i++) {
            for (let j = 0; j <= ST - i; j++) {
              const alpha = i / ST, beta = j / ST, gamma = 1 - alpha - beta;
              const pt = new THREE.Vector3()
                .addScaledVector(pA, alpha)
                .addScaledVector(pB, beta)
                .addScaledVector(pC, gamma);
              // 27αβγ peaks at 1 when α=β=γ=1/3 (centroid), 0 at edges
              pt.addScaledVector(aN, 27 * alpha * beta * gamma * aAmp);
              const d = pt.length();
              if (d < CORE_SPHERE_RADIUS + 0.05) pt.multiplyScalar((CORE_SPHERE_RADIUS + 0.05) / d);
              const vi = vBase + triIdx(i, j);
              posArr[vi*3]=pt.x; posArr[vi*3+1]=pt.y; posArr[vi*3+2]=pt.z;
              const minB = Math.min(alpha, beta, gamma);
              uvArr[vi*2] = Math.min(1, minB * 3); // fades at all 3 edges
              uvArr[vi*2+1] = 0.5;
            }
          }

          let qi = iBase * 3;
          for (let i = 0; i < ST; i++) {
            for (let j = 0; j <= ST - i - 1; j++) {
              idxArr[qi++]=vBase+triIdx(i,j);
              idxArr[qi++]=vBase+triIdx(i+1,j);
              idxArr[qi++]=vBase+triIdx(i,j+1);
              if (i + j + 1 < ST) {
                idxArr[qi++]=vBase+triIdx(i+1,j);
                idxArr[qi++]=vBase+triIdx(i+1,j+1);
                idxArr[qi++]=vBase+triIdx(i,j+1);
              }
            }
          }
          tris++;
        }
      }
    }

    geo.setDrawRange(0, (petals * TRIS_P + tris * TRIS_T) * 3);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.uv       as THREE.BufferAttribute).needsUpdate = true;
    (geo.index!              as THREE.BufferAttribute).needsUpdate = true;
    geo.computeBoundingSphere();
  });

  useEffect(() => () => geo.dispose(), [geo]);

  return (
    <mesh geometry={geo} frustumCulled={false} renderOrder={1}>
      <shaderMaterial
        ref={shaderRef}
        vertexShader={domainPlaneVertexShader}
        fragmentShader={domainPlaneFragmentShader}
        uniforms={{
          uColor:   { value: col.clone() },
          uOpacity: { value: 0 },
          uTime:    { value: 0 },
        }}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}


/* ─────────────────────────────────
   IMPERATIVE NETWORK — Line2 (pixel-width) core + THREE.Line glow halos.
   All geometry updated imperatively every frame from nodePositionsRef.
───────────────────────────────── */
type ConnDef = { type: 'core' | 'peer'; i: number; j?: number };

function ImperativeNetwork({ nodePositionsRef, selectedIdxRef }: {
  nodePositionsRef: React.MutableRefObject<THREE.Vector3[]>;
  selectedIdxRef:   React.MutableRefObject<number | null>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { size } = useThree();

  const connDefs = useMemo<ConnDef[]>(() => {
    const defs: ConnDef[] = [];
    DEPTS.forEach((dept, i) => {
      defs.push({ type: 'core', i });
      DEPTS.forEach((d2, j) => {
        if (j <= i || d2.domain !== dept.domain) return;
        defs.push({ type: 'peer', i, j });
      });
    });
    return defs;
  }, []);

  type LineEntry = {
    // Line2 — real pixel-width main line
    mainGeo: LineGeometry;
    main:    Line2;
    mainMat: LineMaterial;
    // THREE.Line — cheap glow / bloom halos
    glowGeo:  THREE.BufferGeometry;
    glow:     THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    bloomGeo: THREE.BufferGeometry;
    bloom:    THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    def: ConnDef;
    // Track last known positions to avoid rebuilding static lines every frame
    lastPosI: THREE.Vector3;
    lastPosJ: THREE.Vector3;
  };
  const entries = useRef<LineEntry[]>([]);

  useEffect(() => {
    const grp = groupRef.current;
    if (!grp) return;

    // Dispose old
    entries.current.forEach(e => {
      grp.remove(e.main, e.glow, e.bloom);
      e.mainGeo.dispose(); e.glowGeo.dispose(); e.bloomGeo.dispose();
      e.mainMat.dispose(); e.glow.material.dispose(); e.bloom.material.dispose();
    });
    entries.current = [];

    const SEGS = 48;
    const flatPlaceholder = new Float32Array((SEGS + 1) * 3);
    const vecPlaceholder  = Array.from({ length: SEGS + 1 }, () => new THREE.Vector3());
    const res = new THREE.Vector2(size.width, size.height);

    connDefs.forEach(def => {
      const col    = new THREE.Color(DOMAIN_COLOR[DEPTS[def.i].domain]);
      const isPeer = def.type === 'peer';

      // ─ Line2: real pixel-width core line
      const mainGeo = new LineGeometry();
      mainGeo.setPositions(flatPlaceholder);
      const mainMat = new LineMaterial({
        color:       col,
        linewidth:   isPeer ? 1.5 : 2.5,  // pixels
        transparent: true,
        opacity:     1.0,
        depthWrite:  false,
        blending:    THREE.AdditiveBlending,
        resolution:  res,
      });
      const main = new Line2(mainGeo, mainMat);
      main.frustumCulled = false;

      // ─ Glow halo (THREE.Line, additive)
      const glowGeo = new THREE.BufferGeometry().setFromPoints(vecPlaceholder);
      const glowMat = new THREE.LineBasicMaterial({
        color: col, transparent: true, opacity: 0.70,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Line(glowGeo, glowMat);
      glow.frustumCulled = false;

      // ─ Wide bloom (THREE.Line, white-tinted additive)
      const bloomCol = col.clone().lerp(new THREE.Color('#ffffff'), 0.4);
      const bloomGeo = new THREE.BufferGeometry().setFromPoints(vecPlaceholder);
      const bloomMat = new THREE.LineBasicMaterial({
        color: bloomCol, transparent: true, opacity: 0.40,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const bloom = new THREE.Line(bloomGeo, bloomMat);
      bloom.frustumCulled = false;

      grp.add(main, glow, bloom);
      entries.current.push({
        mainGeo, main, mainMat,
        glowGeo, glow,
        bloomGeo, bloom,
        def,
        lastPosI: new THREE.Vector3(Infinity, 0, 0),
        lastPosJ: new THREE.Vector3(Infinity, 0, 0),
      });
    });

    return () => {
      entries.current.forEach(e => {
        grp.remove(e.main, e.glow, e.bloom);
        e.mainGeo.dispose(); e.glowGeo.dispose(); e.bloomGeo.dispose();
        e.mainMat.dispose(); e.glow.material.dispose(); e.bloom.material.dispose();
      });
    };
  }, [connDefs, size]);

  useFrame(() => {
    const pos  = nodePositionsRef.current;
    const sel  = selectedIdxRef.current;
    const SEGS = 48;

    entries.current.forEach(e => {
      const { type, i, j } = e.def;
      const isPeer  = type === 'peer';
      const active  = sel === null || sel === i || (j !== undefined && sel === j);
      const pi      = pos[i];
      const pj      = j !== undefined ? pos[j] : pi;

      // Only rebuild curve geometry when positions actually moved (avoids per-frame GC)
      const moved = pi.distanceTo(e.lastPosI) > 0.004 || pj.distanceTo(e.lastPosJ) > 0.004;
      if (moved) {
        const curve = isPeer ? createPeerCurve(pi, pj) : createCoreCurve(pi);
        const pts   = curve.getPoints(SEGS);

        // Update Line2 geometry (flat array: x0,y0,z0, x1,y1,z1, ...)
        const flat = new Float32Array(pts.length * 3);
        pts.forEach((p, k) => { flat[k*3]=p.x; flat[k*3+1]=p.y; flat[k*3+2]=p.z; });
        e.mainGeo.setPositions(flat);
        e.main.computeLineDistances();

        // Update THREE.Line halo geometries
        e.glowGeo.setFromPoints(pts);  e.glowGeo.attributes.position.needsUpdate  = true;
        e.bloomGeo.setFromPoints(pts); e.bloomGeo.attributes.position.needsUpdate = true;

        e.lastPosI.copy(pi);
        e.lastPosJ.copy(pj);
      }

      // Opacity updated every frame (cheap)
      if (isPeer) {
        e.mainMat.opacity  = active ? (sel !== null ? 1.00 : 0.75) : 0.02;
        e.glow.material.opacity  = active ? (sel !== null ? 1.20 : 0.45) : 0;
        e.bloom.material.opacity = active ? (sel !== null ? 0.85 : 0.20) : 0;
      } else {
        e.mainMat.opacity  = active ? 1.00 : 0.03;
        e.glow.material.opacity  = active ? (sel !== null ? 1.20 : 0.65) : 0;
        e.bloom.material.opacity = active ? (sel !== null ? 0.90 : 0.35) : 0;
      }
    });
  });

  return <group ref={groupRef} />;
}


/* ─────────────────────────────────
   ORG CORE — large luminous nucleus with company name
───────────────────────────────── */
function OrgCore({ dimmed, companyName }: { dimmed: boolean; companyName: string }) {
  const meshRef  = useRef<THREE.Group>(null);
  const ringMat  = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (meshRef.current)  meshRef.current.rotation.y  = t * 0.08;
    if (ringMat.current)  ringMat.current.opacity = dimmed ? 0.04 : 0.22 + Math.sin(t * 0.9) * 0.06;
  });

  // Dynamically scale font to fit within the ball regardless of name length
  const nameLen = companyName.length;
  let fontSize: number;
  let lineHeight: number;
  if      (nameLen > 40) { fontSize = 8;  lineHeight = 1.1; }
  else if (nameLen > 28) { fontSize = 10; lineHeight = 1.15; }
  else if (nameLen > 18) { fontSize = 13; lineHeight = 1.2; }
  else if (nameLen > 12) { fontSize = 16; lineHeight = 1.2; }
  else                   { fontSize = 19; lineHeight = 1.25; }

  return (
    <group>
      {/* equatorial ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.05, 2.25, 64]} />
        <meshBasicMaterial ref={ringMat} color="#38bdf8" transparent opacity={0.22}
          depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* Holographic Sphere Core */}
      <group ref={meshRef}>
        <HoloCoreSphere 
           radius={1.8} 
         opacity={dimmed ? 0.06 : 1.0} 
        />
      </group>
      {/* company name — lower z so dept labels float above it */}
      <Html center distanceFactor={18} style={{ pointerEvents:'none', userSelect:'none' }} zIndexRange={[5, 0]}>
        <div style={{ 
          textAlign: 'center', 
          transition: 'opacity 0.5s', 
          opacity: dimmed ? 0.25 : 1,
          /* Width is tuned against the ball's projected size at distanceFactor=18 */
          width: '120px',
          maxWidth: '120px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '0 4px',
          boxSizing: 'border-box',
        }}>
          <div style={{
            color: '#e0f2fe',
            fontSize,
            fontWeight: 900,
            letterSpacing: 0.5,
            lineHeight,
            /* Aggressive word-wrap so single long words break mid-character */
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            hyphens: 'auto',
            width: '100%',
            textAlign: 'center',
            textShadow: '0 0 24px #0284c7, 0 0 8px #0ea5e9, 0 2px 4px #000',
          }}>
            {companyName}
          </div>

          <div style={{ color:'#38bdf8', fontSize:8, letterSpacing:4, marginTop:6,
            textTransform:'uppercase', opacity:0.7 }}>Org Core</div>
        </div>
      </Html>
    </group>
  );
}

/* ─────────────────────────────────
   PLASMA ORB SHADERS & COMPONENT
───────────────────────────────── */
const plasmaVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  vPosition = position;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const plasmaFragmentShader = `
uniform float uTime;
uniform vec3 uColor;
uniform float uGlowIntensity;
uniform float uOpacity;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+10.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
}

float fbm(vec3 x) {
  float v = 0.0;
  float a = 0.5;
  vec3 shift = vec3(100.0);
  for (int i = 0; i < 4; ++i) {
    v += a * snoise(x);
    x = x * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);

  // Fresnel for edge glow (atmospheric scattering effect)
  float fresnel = dot(normal, viewDir);
  fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
  fresnel = pow(fresnel, 1.5);

  // 3D Noise for flowing molten plasma
  vec3 noisePos = vPosition * 3.0 + vec3(0.0, uTime * 0.3, uTime * 0.15);
  float n = fbm(noisePos);
  
  // Create sharp white-hot energy veins from noise
  float veins = abs(n);
  veins = 1.0 - veins;
  veins = pow(veins, 6.0); // very sharp

  // Base turbulence for organic liquid look
  float turbulence = (n + 1.0) * 0.5;

  vec3 baseColor = uColor;
  vec3 hotColor = vec3(1.0, 1.0, 1.0);
  
  // Mix colors based on turbulence
  vec3 finalColor = mix(baseColor * 0.6, baseColor * 2.5, turbulence);
  // Add extreme white-hot veins
  finalColor = mix(finalColor, hotColor, veins * 0.9);
  
  // Edge glow reinforcement
  finalColor += baseColor * fresnel * 2.0;
  
  // Final HDR/glow multiplier
  finalColor *= uGlowIntensity;

  // Semi-transparent center, more opaque at edges and veins
  float alpha = mix(0.75, 1.0, fresnel + veins);
  alpha *= uOpacity;

  gl_FragColor = vec4(finalColor, alpha);
}
`;

const glowVertexShader = `
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const glowFragmentShader = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);
  
  // Fade out towards the edges for a soft volumetric bloom
  float fresnel = dot(normal, viewDir);
  float alpha = pow(fresnel, 2.8);
  
  gl_FragColor = vec4(uColor, alpha * uOpacity);
}
`;

function PlasmaSphere({ color, radius, opacity = 1, glowIntensity = 1, depthWrite = true, speed = 1 }: { color: string, radius: number, opacity?: number, glowIntensity?: number, depthWrite?: boolean, speed?: number }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const haloRef = useRef<THREE.ShaderMaterial>(null);
  const col = useMemo(() => new THREE.Color(color), [color]);

  useFrame((state) => {
    const t = state.clock.elapsedTime * speed;
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = t;
      materialRef.current.uniforms.uOpacity.value = opacity;
      materialRef.current.uniforms.uGlowIntensity.value = glowIntensity;
      materialRef.current.uniforms.uColor.value.copy(col);
    }
    if (haloRef.current) {
      haloRef.current.uniforms.uOpacity.value = opacity * 0.35; // base halo opacity
      haloRef.current.uniforms.uColor.value.copy(col);
    }
  });

  return (
    <group>
      {/* Soft Volumetric Bloom Halo (2.6x radius) */}
      <mesh>
        <sphereGeometry args={[radius * 2.6, 32, 32]} />
        <shaderMaterial 
          ref={haloRef}
          vertexShader={glowVertexShader} 
          fragmentShader={glowFragmentShader} 
          uniforms={{
            uColor: { value: col },
            uOpacity: { value: opacity * 0.35 }
          }}
          transparent 
          blending={THREE.AdditiveBlending} 
          depthWrite={false} 
        />
      </mesh>
      {/* Procedural Glowing Plasma Core */}
      <mesh>
        <sphereGeometry args={[radius, 64, 64]} />
        <shaderMaterial 
          ref={materialRef}
          vertexShader={plasmaVertexShader} 
          fragmentShader={plasmaFragmentShader} 
          uniforms={{
            uTime: { value: 0 },
            uColor: { value: col },
            uGlowIntensity: { value: glowIntensity },
            uOpacity: { value: opacity }
          }}
          transparent 
          depthWrite={depthWrite} 
        />
      </mesh>
    </group>
  );
}

/* ─────────────────────────────────
   HOLOGRAPHIC CORE SHADERS & COMPONENTS
───────────────────────────────── */
const holoVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  vPosition = position;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const holoFragmentShader = `
uniform float uOpacity;
uniform vec3 uColorTop;
uniform vec3 uColorBottom;
uniform vec3 uRimColor;
uniform float uRadius;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);

  // Fresnel edge lighting
  float fresnel = dot(normal, viewDir);
  fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
  
  // Thin bright cyan-white emissive rim
  float rim = pow(fresnel, 6.0);
  
  // Soft volumetric atmospheric fog
  float atmosphere = pow(fresnel, 2.0) * 0.4;

  // Concentrated cyan glow near the bottom interior fading upward
  float yNormalized = clamp((vPosition.y + uRadius) / (uRadius * 2.0), 0.0, 1.0);
  float bottomGlow = pow(1.0 - yNormalized, 2.5);

  vec3 baseColor = mix(uColorTop, uColorBottom, bottomGlow);
  
  vec3 finalColor = baseColor;
  finalColor += uColorBottom * atmosphere;
  finalColor += uRimColor * rim * 2.5;

  // Make the ball completely opaque
  float alpha = 1.0;
  alpha *= uOpacity;

  gl_FragColor = vec4(finalColor, alpha);
}
`;

function HoloParticles({ count, radius }: { count: number; radius: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const particlesGeo = useMemo(() => {
    const pts = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = Math.cbrt(Math.random()) * radius;
      pts[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pts[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pts[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    return geo;
  }, [count, radius]);

  useFrame(({ clock }) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = clock.elapsedTime * 0.05;
      pointsRef.current.rotation.x = clock.elapsedTime * 0.02;
    }
  });

  return (
    <points ref={pointsRef} geometry={particlesGeo}>
      <pointsMaterial 
        color="#cffafe" 
        size={0.05} 
        transparent 
        opacity={0.8} 
        blending={THREE.AdditiveBlending} 
        depthWrite={false} 
        sizeAttenuation 
      />
    </points>
  );
}

function HoloCoreSphere({ radius, opacity = 1 }: { radius: number; opacity?: number }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const haloRef = useRef<THREE.ShaderMaterial>(null);
  
  useFrame(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uOpacity.value = opacity;
    }
    if (haloRef.current) {
      haloRef.current.uniforms.uOpacity.value = opacity * 0.3;
    }
  });

  return (
    <group>
      <mesh>
        <sphereGeometry args={[radius, 64, 64]} />
        <shaderMaterial 
          ref={materialRef}
          vertexShader={holoVertexShader} 
          fragmentShader={holoFragmentShader} 
          uniforms={{
            uOpacity: { value: opacity },
            uColorTop: { value: new THREE.Color("#0f172a") }, // deep dark blue
            uColorBottom: { value: new THREE.Color("#06b6d4") }, // cyan
            uRimColor: { value: new THREE.Color("#ffffff") }, // white/cyan rim
            uRadius: { value: radius }
          }}
          transparent 
          depthWrite={true}
        />
      </mesh>
      
      <HoloParticles count={150} radius={radius * 0.95} />
      
      {/* Outer soft volumetric bloom / haze */}
      <mesh>
        <sphereGeometry args={[radius * 1.6, 32, 32]} />
        <shaderMaterial 
          ref={haloRef}
          vertexShader={glowVertexShader} 
          fragmentShader={glowFragmentShader} 
          uniforms={{
            uColor: { value: new THREE.Color("#0ea5e9") },
            uOpacity: { value: opacity * 0.3 }
          }}
          transparent 
          blending={THREE.AdditiveBlending} 
          depthWrite={false} 
        />
      </mesh>
    </group>
  );
}

/* ─────────────────────────────────
   GLOW RING — animated pulse ring per node
───────────────────────────────── */
function GlowRing({ color, active, isSelected, isHovered, idx }: { color: string, active: boolean, isSelected: boolean, isHovered: boolean, idx: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.elapsedTime;
    const s = 0.5 + Math.sin(t * 2 + idx) * 0.15;
    meshRef.current.scale.setScalar(s);
  });
  return (
    <mesh ref={meshRef} visible={active}>
      <ringGeometry args={[0.3, 0.35, 32]} />
      <meshBasicMaterial color={color} transparent opacity={isSelected ? 0.8 : 0.4} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function DeptNode({ dept, pos, idx, isSelected, isHovered, isDimmed, onSelect, onHover, coreRef, nodePositionsRef }: {
  dept: Dept; pos: THREE.Vector3; idx: number;
  isSelected: boolean; isHovered: boolean; isDimmed: boolean;
  onSelect: (i: number | null) => void;
  onHover:  (i: number | null) => void;
  coreRef: React.RefObject<THREE.Mesh>;
  nodePositionsRef: React.MutableRefObject<THREE.Vector3[]>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef  = useRef<THREE.Group>(null);
  const color = DOMAIN_COLOR[dept.domain];

  useEffect(() => {
    if (!meshRef.current) return;
    const s = isHovered || isSelected ? 1.6 : 1;
    gsap.to(meshRef.current.scale, { x:s, y:s, z:s, duration:0.3, ease:'power2.out' });
  }, [isHovered, isSelected]);

  useFrame(() => {
    if (!groupRef.current) return;
    // Copy directly — PositionGuard already lerps nodePositionsRef smoothly.
    // No secondary lerp here: both node sphere and lines read the same ref = always in sync.
    groupRef.current.position.copy(nodePositionsRef.current[idx]);
  });

  const trendClr = dept.trend==='+' ? '#4ade80' : dept.trend==='-' ? '#f87171' : '#94a3b8';
  const glowOpacity = isDimmed ? 0 : isSelected ? 1 : isHovered ? 0.7 : 0.35;

  return (
    <group ref={groupRef} position={pos}>
      {/* Pulse ring — animates via useFrame below */}
      <GlowRing color={color} active={!isDimmed} isSelected={isSelected} isHovered={isHovered} idx={idx} />
      
      {/* node sphere — Procedural Plasma Node */}
      <group ref={meshRef}
        onClick={e => { e.stopPropagation(); onSelect(isSelected ? null : idx); }}
        onPointerEnter={e => { e.stopPropagation(); onHover(idx); }}
        onPointerLeave={e => { e.stopPropagation(); onHover(null); }}
      >
        <PlasmaSphere 
          color={color} 
          radius={0.22} 
          opacity={isDimmed ? 0.08 : 1.0} 
          glowIntensity={isSelected ? 2.5 : isHovered ? 1.8 : 1.2} 
          depthWrite={!isDimmed} 
          speed={1.5} 
        />
      </group>
      {/* Always-visible dept name — occlude against the core sphere for proper depth hiding */}
      {!isDimmed && (
        <Html
          center
          occlude={coreRef.current ? [coreRef as React.RefObject<THREE.Object3D>] : true}
          distanceFactor={28}
          position={[0, 0.52, 0]}
          style={{ pointerEvents:'none', userSelect:'none' }}
          zIndexRange={[10, 0]}
        >
          <div style={{
            color, fontSize: isSelected ? 11 : 9,
            fontWeight: isSelected ? 700 : 500,
            letterSpacing: 0.5,
            textShadow: `0 0 8px ${color}cc, 0 1px 3px #000`,
            transition: 'font-size 0.2s, opacity 0.3s',
            whiteSpace: 'nowrap',
            background: isSelected ? `rgba(8,5,20,0.75)` : 'transparent',
            padding: isSelected ? '2px 6px' : '0',
            borderRadius: 4,
          }}>
            {dept.label}
          </div>
        </Html>
      )}

      {/* Hover / click — progressive disclosure metrics tooltip (no backdrop-blur) */}
      {(isHovered || isSelected) && !isDimmed && (
        <Html center distanceFactor={14} style={{ pointerEvents:'none', userSelect:'none' }} zIndexRange={[60,0]}>
          <div style={{
            background:'rgba(8,5,20,0.96)', border:`1px solid ${color}44`,
            borderRadius:10, padding:'9px 13px', minWidth:138,
            boxShadow:`0 4px 24px ${color}22`,
            transform:'translate(-50%, -160%)',
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
              <span style={{ color, fontSize:11, fontWeight:700 }}>{dept.label}</span>
              <span style={{ color:trendClr, fontSize:13, fontWeight:700 }}>{dept.trend}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ color:'#94a3b8', fontSize:9 }}>Score</span>
              <span style={{ color:'#f1f5f9', fontSize:10, fontWeight:700 }}>{dept.score}</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'3px 10px' }}>
              {Object.entries(dept.metrics).map(([k,v]) => (
                <div key={k} style={{ display:'flex', flexDirection:'column' }}>
                  <span style={{ color:'#475569', fontSize:7.5, textTransform:'capitalize' }}>{k}</span>
                  <span style={{ color:`${color}dd`, fontSize:9.5, fontWeight:600 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ color:'#334155', fontSize:8, marginTop:5, borderTop:'1px solid #1e293b', paddingTop:4 }}>
              {dept.headcount} people · <span style={{ color:`${color}88` }}>{dept.domain}</span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

/* ─────────────────────────────────
   BOUNDARY FIELD — subtle outer halo
───────────────────────────────── */
function BoundaryField({ dimmed }: { dimmed: boolean }) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.opacity = dimmed ? 0.015 : 0.035 + Math.sin(clock.elapsedTime * 0.4) * 0.01;
  });
  return (
    <mesh>
      <sphereGeometry args={[11.5, 32, 32]} />
      <meshBasicMaterial ref={matRef} color="#818cf8" transparent opacity={0.035} depthWrite={false} side={THREE.BackSide} />
    </mesh>
  );
}

/* ─────────────────────────────────
   CAMERA RIG — smooth focus / return
───────────────────────────────── */
const HOME_CAM = new THREE.Vector3(0, 6, 24);

function CameraRig({ target }: { target: THREE.Vector3 | null }) {
  const { camera } = useThree() as any;

  useEffect(() => {
    const dest = target
      ? target.clone().normalize().multiplyScalar(20).add(new THREE.Vector3(0, 3, 0))
      : HOME_CAM.clone();
    gsap.to(camera.position, {
      x: dest.x, y: dest.y, z: dest.z,
      duration: target ? 1.1 : 1.3,
      ease: target ? 'power3.inOut' : 'power2.inOut',
    });
  }, [target, camera]);

  return null;
}

/* ─────────────────────────────────
   POSITION GUARD — repels nodes away from camera-center axis
   Keeps the OrgCore always unobstructed from any viewing angle.
   Uses hysteresis + ref-based lerp to prevent all flickering.
───────────────────────────────── */
function PositionGuard({ basePositions, nodePositionsRef, onLinesUpdate, selectedIdxRef }: {
  basePositions: THREE.Vector3[];
  nodePositionsRef: React.MutableRefObject<THREE.Vector3[]>;
  onLinesUpdate: (pos: THREE.Vector3[]) => void;
  selectedIdxRef: React.MutableRefObject<number | null>;
}) {
  const { camera } = useThree();

  // Hysteresis: separate enter/exit thresholds to prevent boundary oscillation
  const PUSH_DOT    = 0.82;  // ~35° — push when node enters this cone
  const RESTORE_DOT = 0.68;  // ~47° — only restore when clearly outside (wide gap)

  const isPushed    = useRef<boolean[]>(new Array(basePositions.length).fill(false));
  const settleTimer = useRef(0);          // how long positions have been stable
  const lastSynced  = useRef<THREE.Vector3[]>(basePositions.map(p => p.clone()));

  useFrame((_, delta) => {
    const camDir = camera.position.clone().normalize();
    let anyMoving = false;

    basePositions.forEach((base, i) => {
      const nodeDir = base.clone().normalize();
      const dot     = nodeDir.dot(camDir);

      // Never push the currently-selected node — camera intentionally faces it
      const isSelected = i === selectedIdxRef.current;
      if (isSelected) {
        isPushed.current[i] = false;
      } else {
        // Hysteresis state machine — only flip when clearly crossing threshold
        if (!isPushed.current[i] && dot > PUSH_DOT)    isPushed.current[i] = true;
        if ( isPushed.current[i] && dot < RESTORE_DOT) isPushed.current[i] = false;
      }

      let target: THREE.Vector3;
      if (isPushed.current[i]) {
        const axis = new THREE.Vector3().crossVectors(nodeDir, camDir);
        if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0);
        axis.normalize();
        const currAngle = Math.acos(Math.min(dot, 1.0));
        const tgtAngle  = Math.acos(RESTORE_DOT) + 0.10;
        // Rotate direction only — then re-derive radius from polytope surface formula
        // so pushed node always stays on (or inside) the polytope grid
        const newDir = nodeDir.clone().applyAxisAngle(axis, Math.max(0, tgtAngle - currAngle));
        const r = polytopeRadiusAtDir(newDir);
        target = newDir.multiplyScalar(r);
      } else {
        target = base;
      }

      // Lerp ref every frame (frame-rate independent, no React state = no re-renders)
      const before = nodePositionsRef.current[i].clone();
      nodePositionsRef.current[i].lerp(target, Math.min(1, 0.028 * 60 * delta));
      if (nodePositionsRef.current[i].distanceTo(before) > 0.002) anyMoving = true;
    });

    // Sync lines (React state) ONLY after animation fully settles — eliminates tube flicker
    if (anyMoving) {
      settleTimer.current = 0;
    } else {
      settleTimer.current += delta;
      if (settleTimer.current > 0.5) {
        const changed = nodePositionsRef.current.some(
          (p, i) => p.distanceTo(lastSynced.current[i]) > 0.06
        );
        if (changed) {
          lastSynced.current = nodePositionsRef.current.map(p => p.clone());
          onLinesUpdate([...lastSynced.current]);
          settleTimer.current = 0;
        }
      }
    }
  });

  return null;
}

/* ─────────────────────────────────
   SCENE
───────────────────────────────── */
function Scene({ onEscNoSelection, companyName, selectedIdx, onSelect }: { onEscNoSelection: () => void; companyName: string; selectedIdx: number | null; onSelect: (idx: number | null) => void }) {
  const [hoveredIdx,  setHoveredIdx]  = useState<number | null>(null);
  const orbitRef  = useRef<any>(null);
  const coreRef   = useRef<THREE.Mesh>(null);

  // Place each node exactly on the polytope surface using the same formula as UnifiedShell
  const basePositions = useMemo(() =>
    DEPT_DIRS_UNIT.map((dir, i) =>
      dir.clone().multiplyScalar(polytopeRadiusAtDir(dir))
    )
  , []);
  // nodePositionsRef — lerped every frame by PositionGuard (drives node spheres + lines)
  const nodePositionsRef  = useRef<THREE.Vector3[]>(basePositions.map(p => p.clone()));
  // selectedIdxRef — mirror of selectedIdx for useFrame closures (no React dependency)
  const selectedIdxRef    = useRef<number | null>(null);
  // linePositions — React state, synced after settle (drives UnifiedShell deformation)
  const [linePositions, setLinePositions] = useState<THREE.Vector3[]>(() => basePositions.map(p => p.clone()));
  const selPos = selectedIdx !== null ? linePositions[selectedIdx] : null;

  // Keep selectedIdxRef in sync with state
  useEffect(() => { selectedIdxRef.current = selectedIdx; }, [selectedIdx]);

  // ESC key — deselect node (camera returns via CameraRig target=null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedIdx !== null) {
        // Stop the event here — don't let NavigationManager or Universe3D also handle it
        e.stopImmediatePropagation();
        e.preventDefault();
        onSelect(null);
        setHoveredIdx(null);
      } else {
        onEscNoSelection();
      }
    };
    // useCapture=true so this fires BEFORE other listeners (NavigationManager uses bubble phase)
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [selectedIdx, onEscNoSelection, onSelect]);

  const select = useCallback((i: number | null) => onSelect(i), [onSelect]);
  const hover  = useCallback((i: number | null) => setHoveredIdx(i),  []);

  return (
    <>
      <color attach="background" args={['#05040f']} />
      <fog attach="fog" args={['#05040f', 45, 95]} />

      <ambientLight intensity={0.12} />
      <pointLight position={[0,0,0]} intensity={5} color="#a855f7" distance={28} decay={2} />
      {/* Domain-colored lights distributed around the scene */}
      <pointLight position={[14, 10, 6]}   intensity={1.8} color={DOMAIN_COLOR.leadership}  distance={32} decay={2} />
      <pointLight position={[-12, 8, -8]}  intensity={1.8} color={DOMAIN_COLOR.people}       distance={32} decay={2} />
      <pointLight position={[6, -12, 12]}  intensity={1.8} color={DOMAIN_COLOR.tech}         distance={32} decay={2} />
      <pointLight position={[-8, -10, 10]} intensity={1.6} color={DOMAIN_COLOR.delivery}     distance={30} decay={2} />
      <pointLight position={[12, -8, -10]} intensity={1.6} color={DOMAIN_COLOR.commercial}   distance={30} decay={2} />
      <pointLight position={[-10, 6, -14]} intensity={1.6} color={DOMAIN_COLOR.governance}   distance={30} decay={2} />

      <Stars radius={90} depth={70} count={3000} factor={3} saturation={0} fade speed={0.4} />

      <PositionGuard
        basePositions={basePositions}
        nodePositionsRef={nodePositionsRef}
        onLinesUpdate={setLinePositions}
        selectedIdxRef={selectedIdxRef}
      />

      <UnifiedShell selectedIdx={selectedIdx} positions={linePositions} activeDomain={selectedIdx !== null ? DEPTS[selectedIdx].domain : null} />
      <ImperativeNetwork nodePositionsRef={nodePositionsRef} selectedIdxRef={selectedIdxRef} />

      {/* Domain plane — only the selected dept's domain, full brightness */}
      {selectedIdx !== null && (() => {
        const activeDomain = DEPTS[selectedIdx].domain;
        const domainIndices = DEPTS
          .map((d, i) => d.domain === activeDomain ? i : -1)
          .filter(i => i !== -1);
        return (
          <DomainPlane
            key={activeDomain}
            domainIndices={domainIndices}
            domainColor={DOMAIN_COLOR[activeDomain]}
            nodePositionsRef={nodePositionsRef}
          />
        );
      })()}

      {/* OrgCore — attach coreRef to the icosphere for occlusion */}
      <group>
        <OrgCore dimmed={selectedIdx !== null} companyName={companyName} />
        {/* invisible solid sphere used purely as occluder for dept name labels */}
        <mesh
          ref={coreRef}
          onPointerOver={(e) => {
            e.stopPropagation();
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <sphereGeometry args={[1.75, 16, 16]} />
          <meshBasicMaterial color="#000" transparent opacity={0} depthWrite />
        </mesh>
      </group>

      {DEPTS.map((d, i) => {
        const isSelected = selectedIdx === i;
        const isHovered = hoveredIdx === i;
        // A node is considered connected if it belongs to the same domain as the selected node
        const isConnected = selectedIdx !== null && d.domain === DEPTS[selectedIdx].domain;
        const isDimmed = selectedIdx !== null && !isConnected;

        return (
          <DeptNode key={d.id} dept={d} pos={linePositions[i]} idx={i}
            isSelected={isSelected}
            isHovered={isHovered}
            isDimmed={isDimmed}
            onSelect={select} onHover={hover}
            coreRef={coreRef}
            nodePositionsRef={nodePositionsRef}
          />
        );
      })}

      {/* CameraRig always mounted so it can return to home on deselect */}
      <CameraRig target={selPos} />

      <OrbitControls ref={orbitRef} makeDefault
        minDistance={11} maxDistance={38}
        enablePan={false} rotateSpeed={0.5} zoomSpeed={0.55}
        maxPolarAngle={Math.PI * 0.88} minPolarAngle={Math.PI * 0.12}
      />
    </>
  );
}

/* ─────────────────────────────────
   DOMAIN LEGEND
───────────────────────────────── */
const DOMAIN_LABELS: Record<Domain, string> = {
  leadership: 'Leadership', people: 'People', tech: 'Product & Tech',
  delivery: 'Delivery', commercial: 'Commercial', governance: 'Governance',
};
function PolytopeSidePanel({ onClose, selectedIdx, onSelectDept }: { onClose?: () => void; selectedIdx: number | null; onSelectDept: (idx: number) => void }) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'departments' | 'info'>('departments');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === ' ')) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  const filteredDepts = DEPTS.filter(d => 
    d.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
    d.domain.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="absolute bottom-6 left-4 z-20 flex flex-col items-start gap-3 pointer-events-auto">
      {/* Search Bar */}
      <div 
        className="relative rounded-2xl overflow-hidden shadow-xl"
        style={{
          width: '196px',
          background: 'rgba(0, 0, 0, 0.72)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div className="flex items-center px-3 py-2.5">
          <Search className="w-3.5 h-3.5 text-gray-400 mr-2 shrink-0" />
          <input 
            ref={searchInputRef}
            type="text" 
            placeholder="Search departments..." 
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              if (e.target.value) setActiveTab('departments');
            }}
            className="bg-transparent border-none outline-none text-xs text-white w-full placeholder:text-gray-500"
          />
          <div className="flex items-center gap-0.5 ml-2 opacity-50 shrink-0 bg-white/10 px-1.5 py-0.5 rounded">
            <Command className="w-2.5 h-2.5 text-gray-300" />
            <span className="text-[9px] text-gray-300 font-medium">K</span>
          </div>
        </div>
      </div>

      {/* Side nav panel */}
      <div
        className="rounded-2xl overflow-hidden flex flex-col"
        style={{
          width: '196px',
          maxHeight: '420px',
          background: 'rgba(0, 0, 0, 0.72)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <div
          className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-[11px] font-medium transition-colors hover:text-white"
            style={{ color: '#C1AEFF' }}
          >
            <ArrowLeft className="w-3 h-3" />
            Back
          </button>
        </div>

        <div className="flex px-3 pt-2 gap-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setActiveTab('departments')}
            className={`flex-1 text-[10px] font-semibold tracking-widest pb-1.5 border-b-2 transition-colors ${activeTab === 'departments' ? 'border-[#C1AEFF] text-[#C1AEFF]' : 'border-transparent text-[#5E5E5E] hover:text-gray-300'}`}
          >
            {searchQuery ? 'SEARCH RESULTS' : 'DEPARTMENTS'}
          </button>
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 text-[10px] font-semibold tracking-widest pb-1.5 border-b-2 transition-colors ${activeTab === 'info' ? 'border-[#C1AEFF] text-[#C1AEFF]' : 'border-transparent text-[#5E5E5E] hover:text-gray-300'}`}
          >
            INFORMATION
          </button>
        </div>

        <div 
          className="transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] grid"
          style={{ 
            gridTemplateRows: activeTab === 'departments' ? '1fr' : '0fr',
            opacity: activeTab === 'departments' ? 1 : 0,
          }}
        >
          <div className="overflow-hidden">
            <div
              className="overflow-y-auto pb-2 mt-1"
              style={{ scrollbarWidth: 'none', maxHeight: '320px' }}
            >
              {filteredDepts.map((item, i) => {
                const originalIdx = DEPTS.findIndex(d => d.id === item.id);
                const isSelected = selectedIdx === originalIdx;

                return (
                <button
                  key={item.id}
                  onClick={() => onSelectDept(originalIdx)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors group ${isSelected ? 'bg-white/[0.12]' : 'hover:bg-white/[0.06]'}`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0 transition-transform group-hover:scale-125"
                    style={{
                      background: DOMAIN_COLOR[item.domain],
                      boxShadow: `0 0 8px ${DOMAIN_COLOR[item.domain]}70`,
                    }}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] text-gray-300 group-hover:text-white transition-colors leading-tight truncate">
                      {item.label}
                    </span>
                    <span className="block text-[10px] leading-tight mt-0.5" style={{ color: '#4b5563' }}>
                      {item.headcount} emp
                    </span>
                  </span>
                </button>
                );
              })}
            </div>
          </div>
        </div>

        <div 
          className="transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] grid"
          style={{ 
            gridTemplateRows: activeTab === 'info' ? '1fr' : '0fr',
            opacity: activeTab === 'info' ? 1 : 0,
          }}
        >
          <div className="overflow-hidden">
            <div
              className="overflow-y-auto pb-2 mt-1"
              style={{ scrollbarWidth: 'none', maxHeight: '200px' }}
            >
              {FEATURES.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(item.route)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.06] group"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0 transition-transform group-hover:scale-125"
                    style={{
                      background: DOMAIN_COLOR[item.domain as Domain] || '#64748b',
                      boxShadow: `0 0 8px ${(DOMAIN_COLOR[item.domain as Domain] || '#64748b')}70`,
                    }}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] text-gray-300 group-hover:text-white transition-colors leading-tight truncate">
                      {item.label}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Ecosystem pills */}
      <div className="flex flex-col gap-2 w-full">
        <button
          onClick={() => navigate('/ecosystem/vc-connect')}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 border backdrop-blur-md transition-all hover:text-white hover:border-sky-500/30"
          style={{ background: 'rgba(0,0,0,0.55)', borderColor: 'rgba(148,163,184,0.1)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
          VC &amp; Mentors
        </button>
        <button
          onClick={() => navigate('/ecosystem/network')}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 border backdrop-blur-md transition-all hover:text-white hover:border-teal-500/30"
          style={{ background: 'rgba(0,0,0,0.55)', borderColor: 'rgba(148,163,184,0.1)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
          Startup Network
        </button>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div style={{
      position:'absolute', bottom:24, left:'50%', transform:'translateX(-50%)',
      display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center',
      background:'rgba(8,5,20,0.85)', borderRadius:999, padding:'6px 18px',
      backdropFilter:'blur(14px)', border:'1px solid rgba(255,255,255,0.05)', zIndex:10,
    }}>
      {(Object.entries(DOMAIN_LABELS) as [Domain,string][]).map(([d,l]) => (
        <div key={d} style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:DOMAIN_COLOR[d],
            display:'inline-block', boxShadow:`0 0 5px ${DOMAIN_COLOR[d]}` }} />
          <span style={{ color:'#64748b', fontSize:9.5 }}>{l}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────
   EXPORT
───────────────────────────────── */
export default function OrganisationPolytope({ companyName = 'Your Organisation', is3DRoute = false, onClose }: { companyName?: string; is3DRoute?: boolean; onClose?: () => void }) {
  const navigate = useNavigate();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Called by Scene when ESC is pressed and nothing is selected → navigate back
  const handleEscBack = useCallback(() => {
    if (selectedIdx !== null) {
      setSelectedIdx(null);
      return;
    }
    const el = overlayRef.current;
    const executeClose = () => {
      if (onClose) onClose();
      else navigate('/overview');
    };

    if (!el) { executeClose(); return; }
    // Fade to black, then navigate
    gsap.fromTo(el,
      { opacity: 0 },
      {
        opacity: 1, duration: 0.55, ease: 'power2.inOut',
        onComplete: executeClose,
      }
    );
  }, [navigate, onClose, selectedIdx]);

  // Fade-in on mount
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    gsap.fromTo(el, { opacity: 1 }, { opacity: 0, duration: 0.65, ease: 'power2.out' });
  }, []);

  return (
    <div style={{ position:'relative', width:'100%', height:'100%' }}>
      <Canvas camera={{ position:[0,6,24], fov:52, near:0.1, far:300 }}
        dpr={[1,1.5]} gl={{ antialias:true, alpha:false }}
        style={{ background:'#05040f' }}
      >
        <Scene onEscNoSelection={handleEscBack} companyName={companyName} selectedIdx={selectedIdx} onSelect={setSelectedIdx} />
      </Canvas>

      {/* Full-screen black overlay for fade in/out transitions */}
      <div
        ref={overlayRef}
        style={{
          position:'absolute', inset:0,
          background:'#05040f',
          pointerEvents:'none',
          zIndex:50,
          opacity:1,
        }}
      />

      {/* ESC hint badge — appears only when a node is selected */}
      <div id="esc-hint" style={{
        position:'absolute', top:820, right:20, zIndex:10,
        background:'rgba(8,5,20,0.85)', border:'1px solid rgba(255,255,255,0.07)',
        borderRadius:8, padding:'5px 12px',
        backdropFilter:'blur(12px)',
        display:'flex', alignItems:'center', gap:7,
        pointerEvents:'none',
      }}>
          <kbd style={{
          background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)',
          borderRadius:4, padding:'1px 6px', fontSize:9, color:'#94a3b8', fontFamily:'monospace',
        }}>ESC</kbd>
        <span style={{ color:'#475569', fontSize:9 }}>Deselect / Go back</span>
      </div>

      <Legend />
      {is3DRoute && <PolytopeSidePanel onClose={handleEscBack} selectedIdx={selectedIdx} onSelectDept={setSelectedIdx} />}
    </div>
  );
}
