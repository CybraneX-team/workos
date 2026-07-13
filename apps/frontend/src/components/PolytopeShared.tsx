import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import starVertexShader from '../three-universe/shaders/star/vertex.glsl';
import starFragmentShader from '../three-universe/shaders/star/fragment.glsl';
import { VoicePlasmaWeb } from './polytope/VoicePlasmaWeb';

/* ─────────────────────────────────
   ORG CORE — large luminous nucleus with company name
───────────────────────────────── */
export function OrgCore({
  dimmed,
  companyName,
  subdomainName: _subdomainName,
  industryName: _industryName,
  isDeepDrillDown = false,
  showWorkspaceCta = false,
  coreClickEnabled = true,
  voiceIntensityRef,
  onClick,
  hideCompanyName = false,
  coreWorkspacePhase = 'idle',
}: {
  dimmed: boolean;
  companyName: string;
  subdomainName?: string;
  industryName?: string;
  isDeepDrillDown?: boolean;
  onClick?: () => void;
  /** BDT: static CTA on core — click to dive into workspace */
  showWorkspaceCta?: boolean;
  /** When false, core is visible but not clickable (e.g. camera too far) */
  coreClickEnabled?: boolean;
  voiceIntensityRef?: React.MutableRefObject<number> | undefined;
  hideCompanyName?: boolean;
  coreWorkspacePhase?: string;
}) {
  const meshRef  = useRef<THREE.Group>(null);
  const isHoveringCoreRef = useRef(false);

  const canClickCore = Boolean(onClick) && coreClickEnabled;

  useFrame(({ clock }) => {
    if (meshRef.current) meshRef.current.rotation.y = clock.elapsedTime * 0.08;
  });

  useEffect(() => {
    if (isHoveringCoreRef.current) {
      document.body.style.cursor = canClickCore ? 'pointer' : 'auto';
    }
  }, [canClickCore]);

  return (
    <group>
      {/* Plasma Sphere Core — click or zoom to open workspace (BDT) */}
      <group ref={meshRef}>
        <mesh
          onPointerOver={(e) => {
            e.stopPropagation();
            isHoveringCoreRef.current = true;
            if (canClickCore) document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            isHoveringCoreRef.current = false;
            document.body.style.cursor = 'auto';
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (canClickCore) onClick?.();
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (canClickCore) onClick?.();
          }}
        >
          <sphereGeometry args={[1.35, 32, 32]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        <group visible={coreWorkspacePhase !== 'workspace'}>
          <StarSphere 
             radius={1.2} 
             color="#1e3a8a" // Navy blue core
             opacity={dimmed ? 0.08 : 1.0} 
             glowIntensity={1.0}
             uAudio={voiceIntensityRef?.current ?? 0}
             coreWorkspacePhase={coreWorkspacePhase}
          />
        </group>
        <VoicePlasmaWeb
          coreWorkspacePhase={coreWorkspacePhase}
          voiceIntensityRef={voiceIntensityRef}
          radius={1.2}
          count={8000}
        />
      </group>
      
      {/* 3D Text floating on top of the core */}
      {!hideCompanyName && (
        <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
          <group position={[0, 1.6, 0]}>
            <Text
              color="#ffffff"
              fontSize={0.32}
              maxWidth={3.2}
              lineHeight={1.1}
              letterSpacing={0.12}
              textAlign="center"
              anchorX="center"
              anchorY="middle"
              fillOpacity={isDeepDrillDown ? 0 : dimmed ? 0.65 : 0.92}
              outlineWidth={0.01}
              outlineColor="#0f172a"
              outlineOpacity={isDeepDrillDown ? 0 : dimmed ? 0.35 : 0.6}
            >
              {companyName}
            </Text>
          </group>
        </Billboard>
      )}

      {/* CTA below core — same treatment as company name above */}
      {showWorkspaceCta && !isDeepDrillDown && (
        <Billboard follow lockX={false} lockY={false} lockZ={false}>
          <group position={[0, -1.65, 0]}>
            <Text
              color="#ffffff"
              fontSize={0.2}
              maxWidth={4.2}
              lineHeight={1.15}
              letterSpacing={0.1}
              textAlign="center"
              anchorX="center"
              anchorY="middle"
              fillOpacity={0.95}
              outlineWidth={0.01}
              outlineColor="#0f172a"
              outlineOpacity={0.55}
            >
              Click to interact with WorkOS AI
            </Text>
          </group>
        </Billboard>
      )}
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

export function PlasmaSphere({
  color,
  radius,
  opacity = 1,
  glowIntensity = 1,
  depthWrite = true,
  speed = 1,
  halo = true,
}: {
  color: string;
  radius: number;
  opacity?: number;
  glowIntensity?: number;
  depthWrite?: boolean;
  speed?: number;
  /** Volumetric bloom shell — off for internal branch/action nodes */
  halo?: boolean;
}) {
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
    if (halo && haloRef.current) {
      haloRef.current.uniforms.uOpacity.value = opacity * 0.35;
      haloRef.current.uniforms.uColor.value.copy(col);
    }
  });

  return (
    <group>
      {halo && (
        <mesh>
          <sphereGeometry args={[radius * 1.6, 32, 32]} />
          <shaderMaterial
            ref={haloRef}
            vertexShader={glowVertexShader}
            fragmentShader={glowFragmentShader}
            uniforms={{
              uColor: { value: col },
              uOpacity: { value: opacity * 0.35 },
            }}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
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
   STAR SPHERE (VOICE AI ENABLED)
───────────────────────────────── */
export function StarSphere({
  color,
  radius,
  opacity = 1,
  glowIntensity = 1,
  depthWrite = true,
  speed = 1,
  uAudio = 0,
  coreWorkspacePhase = 'idle',
}: {
  color: string;
  radius: number;
  opacity?: number;
  glowIntensity?: number;
  depthWrite?: boolean;
  speed?: number;
  uAudio?: number;
  coreWorkspacePhase?: string;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const col = useMemo(() => new THREE.Color(color), [color]);
  const opacityFactorRef = useRef(1.0);

  useFrame((state) => {
    const t = state.clock.elapsedTime * speed;
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = t;
      materialRef.current.uniforms.uColor.value.copy(col);

      let targetFactor = 1.0;
      if (coreWorkspacePhase === 'diving-in' || coreWorkspacePhase === 'workspace') {
        targetFactor = 0.0;
      }
      opacityFactorRef.current += (targetFactor - opacityFactorRef.current) * 0.04;

      const effectiveOpacity = opacity * glowIntensity * opacityFactorRef.current;
      materialRef.current.uniforms.uIntensity.value = effectiveOpacity;

      const isOpaque = effectiveOpacity >= 0.98;
      materialRef.current.transparent = !isOpaque;
      materialRef.current.depthWrite = isOpaque ? true : depthWrite;
      
      // Smoothly approach the target audio level for fluid visualizer effect
      const currentAudio = materialRef.current.uniforms.uAudio.value;
      materialRef.current.uniforms.uAudio.value += (uAudio - currentAudio) * 0.25;
    }
  });

  return (
    <group>
      <mesh>
        <icosahedronGeometry args={[radius, 6]} />
        <shaderMaterial 
          ref={materialRef}
          vertexShader={starVertexShader} 
          fragmentShader={starFragmentShader} 
          uniforms={{
            uTime: { value: 0 },
            uColor: { value: col },
            uIntensity: { value: opacity * glowIntensity },
            uAudio: { value: 0 }
          }}
          transparent={opacity < 0.98}
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
uniform float uEmission;

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

  finalColor *= uEmission;

  // Make the ball completely opaque
  float alpha = 1.0;
  alpha *= uOpacity;

  gl_FragColor = vec4(finalColor, alpha);
}
`;

export function HoloParticles({ count, radius }: { count: number; radius: number }) {
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
        color="#FFE6B3" 
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

export function HoloCoreSphere({ radius, opacity = 1 }: { radius: number; opacity?: number }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const haloRef = useRef<THREE.ShaderMaterial>(null);
  
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const emission = 0.6 + (Math.sin(t * 3.0) * 0.5 + 0.5) * 0.4; // 0.6 to 1.0

    if (materialRef.current) {
      materialRef.current.uniforms.uOpacity.value = opacity;
      materialRef.current.uniforms.uEmission.value = emission;
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
            uEmission: { value: 1.0 },
            uColorTop: { value: new THREE.Color("#4a2b10") }, // warm dark brown
            uColorBottom: { value: new THREE.Color("#FFE6B3") }, // warm bright emission
            uRimColor: { value: new THREE.Color("#ffffff") }, // white rim
            uRadius: { value: radius }
          }}
          transparent 
          depthWrite={true}
        />
      </mesh>
      
      <HoloParticles count={150} radius={radius * 0.95} />
      
    </group>
  );
}

/* ─────────────────────────────────
   GLOW RING — animated pulse ring per node
───────────────────────────────── */
export function GlowRing({ color, active, isSelected, idx }: { color: string, active: boolean, isSelected: boolean, idx: number }) {
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
