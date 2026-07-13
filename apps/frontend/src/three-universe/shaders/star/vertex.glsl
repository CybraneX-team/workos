// Star Vertex Shader — Enhanced solar surface
#include ../lib/noise.glsl

uniform float uTime;
uniform float uIntensity;
uniform float uAudio;

varying vec3 vNormal;
varying vec3 vPosition;
varying float vDisplacement;
varying vec2 vUv;
varying vec3 vLocalNormal;

float getDisplacement(vec3 n) {
  // === STATIC UNSTRUCTURED PLANET TERRAIN (static moon/planet craters and hills) ===
  // 1. Large planetary hills/valleys
  float hills = snoise(n * 1.8) * 0.18 + fbm3(n * 3.8) * 0.08;
  
  // 2. Realistic lunar craters
  float cNoise1 = snoise(n * 2.5 + vec3(12.5, 4.3, 8.2));
  float cDist1 = abs(cNoise1 - 0.35);
  float crater1 = -smoothstep(0.22, 0.0, cDist1) * 0.24 + smoothstep(0.08, 0.0, abs(cDist1 - 0.08)) * 0.08;

  float cNoise2 = snoise(n * 3.2 - vec3(5.1, 9.7, 2.4));
  float cDist2 = abs(cNoise2 - 0.4);
  float crater2 = -smoothstep(0.18, 0.0, cDist2) * 0.18 + smoothstep(0.06, 0.0, abs(cDist2 - 0.06)) * 0.06;

  float staticTerrain = hills + crater1 + crater2;

  // === DYNAMIC AUDIO-REACTIVE PARABOLIC SWELLINGS ===
  vec3 warpCoords = n * 1.2 + vec3(uTime * 0.08, uTime * 0.05, uTime * 0.03);
  vec3 warpedNormal = normalize(n + curlNoise(warpCoords) * 0.1);

  float h1 = snoise(warpedNormal * 2.0 + uTime * 0.15);
  float h2 = snoise(warpedNormal * 2.8 - uTime * 0.22);
  
  float dome1 = max(0.0, h1 - 0.1);
  float dome2 = max(0.0, h2 - 0.15);
  
  float dynamicParabolas = (dome1 * dome1 * 1.8 + dome2 * dome2 * 1.4) * uAudio * 1.5;

  return staticTerrain * (0.8 + uIntensity * 0.4) + dynamicParabolas;
}

void main() {
  vec3 smoothNormal = normalize(position);
  vUv = uv;
  vLocalNormal = smoothNormal; // smooth normal for detailed texture sampling

  float radius = length(position);
  float disp = getDisplacement(smoothNormal);
  
  // Convert relative displacement to absolute units
  float displacement = disp * radius * 0.16;

  vec3 newPosition = position + smoothNormal * displacement;
  vDisplacement = disp; // Pass raw displacement value for fragment shading

  vec4 worldPos = modelMatrix * vec4(newPosition, 1.0);
  vPosition = worldPos.xyz;

  // Compute precise perturbed normals based on height difference of neighboring positions
  vec3 tangent = normalize(cross(smoothNormal, vec3(0.0, 1.0, 0.0) + vec3(0.001)));
  vec3 bitangent = cross(smoothNormal, tangent);

  float eps = 0.015;
  float hL = getDisplacement(normalize(smoothNormal - tangent * eps));
  float hR = getDisplacement(normalize(smoothNormal + tangent * eps));
  float hD = getDisplacement(normalize(smoothNormal - bitangent * eps));
  float hU = getDisplacement(normalize(smoothNormal + bitangent * eps));

  vec3 tangentVec = tangent * eps * 2.0 + smoothNormal * (hR - hL);
  vec3 bitangentVec = bitangent * eps * 2.0 + smoothNormal * (hU - hD);
  vec3 perturbedNormal = normalize(cross(tangentVec, bitangentVec));

  vNormal = normalize(mat3(modelMatrix) * perturbedNormal);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
