// Star Fragment Shader — Realistic solar surface
// Granulation + sunspots + limb darkening + plasma flows

#include ../lib/noise.glsl

uniform float uTime;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uAudio;

varying vec3 vNormal;
varying vec3 vPosition;
varying float vDisplacement;
varying vec2 vUv;
varying vec3 vLocalNormal;

void main() {
  vec3 viewDir = normalize(cameraPosition - vPosition);
  float NdotV = max(dot(normalize(vNormal), viewDir), 0.0);

  // === LIMB DARKENING (physically correct: edges darker on real stars) ===
  float limbDark = pow(NdotV, 0.45);  // subtle darkening toward edges

  // === DOMAIN WARP FOR DETAILED TEXTURE FLOWS ===
  vec3 warp = curlNoise(vLocalNormal * 2.8 + vec3(uTime * 0.06, uTime * 0.04, uTime * 0.03)) * (0.10 + uAudio * 0.15);
  vec3 sampleCoords = normalize(vLocalNormal + warp);

  // === TEXTURE SHADING BASED ON GEOLOGICAL TERRAIN ===
  // Valleys and crater floors (low displacement) are dark rock, while hills and rims (high displacement) are highlighted regolith
  vec3 baseRockColor = uColor * 0.35 + vec3(0.08, 0.05, 0.05); // dark basaltic rock
  vec3 dustHighlight = uColor * 0.85 + vec3(0.15, 0.15, 0.12); // light highland dust/regolith
  vec3 magmaColor    = mix(uColor * 2.2, vec3(1.0, 0.85, 0.5), 0.4); // glowing orange-tinted magma

  // Add fine-scale geological noise to the surface
  float rockNoise = snoise(sampleCoords * 35.0) * 0.08;
  vec3 planetColor = mix(baseRockColor, dustHighlight, smoothstep(-0.1, 0.15, vDisplacement)) + vec3(rockNoise);

  // === DYNAMIC MAGMA VEINS IN DEPRESSIONS AND RISING DOMES ===
  // 1. Sharp magma cracks (Worley/simplex vein pattern)
  float crackField = snoise(sampleCoords * 18.0 + vec3(0.0, uTime * 0.1, 0.0));
  float cracks = 1.0 - abs(crackField);
  cracks = pow(cracks, 6.0); // very narrow, high-contrast cracks!

  // 2. We only activate the glowing magma in the valleys or on the rising domes
  float magmaMask = smoothstep(0.0, 0.25, vDisplacement) * uAudio * 0.8; // active on domes
  float valleyMask = smoothstep(-0.05, -0.3, vDisplacement) * 0.35; // slow heat in valleys
  float magmaIntensity = max(magmaMask, valleyMask) * cracks;
  
  vec3 surfaceColor = mix(planetColor, magmaColor, magmaIntensity);

  // === CORONA (outer glow — only visible at edges via fresnel) ===
  float fresnel = 1.0 - NdotV;
  fresnel = pow(fresnel, 1.6);
  vec3 coronaColor = uColor * 1.4 + vec3(0.4, 0.2, 0.0);

  // === ASSEMBLE ===
  // Reduced intensity multipliers so the core never gets overblown
  float currentIntensity = uIntensity + uAudio * 0.08; // almost no overall brightness increase
  vec3 finalColor = surfaceColor * limbDark * currentIntensity;

  // Add displacement brightness details (magma lines glow brighter)
  finalColor *= (1.0 + magmaIntensity * (1.2 + uAudio * 0.6));

  // Corona rim glow (subtle and smooth)
  float coronaGlow = (0.15 + uAudio * 0.08) * uIntensity; // reduced from 0.35 for a much cleaner edge
  finalColor += coronaColor * fresnel * coronaGlow;

  // Subtle breathing pulse
  float pulse = sin(uTime * 1.4) * 0.02 + 0.98;
  finalColor *= pulse;

  gl_FragColor = vec4(clamp(finalColor, 0.0, 2.5), clamp(uIntensity, 0.0, 1.0));
}
