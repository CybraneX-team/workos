// Galaxy Particle Vertex Shader — Clean, optimized

#include ../lib/noise.glsl

uniform float uTime;
uniform float uSize;
uniform float uZoomLevel;
uniform float uPixelRatio;

attribute float aSize;
attribute float aSpeed;
attribute vec3 aColor;
attribute float aBrightness;

varying vec3 vColor;
varying float vAlpha;
varying float vBrightness;

void main() {
  vec3 pos = position;

  // Orbital rotation
  float angle = uTime * aSpeed;
  float ca = cos(angle);
  float sa = sin(angle);
  vec3 rotated = vec3(
    pos.x * ca - pos.z * sa,
    pos.y,
    pos.x * sa + pos.z * ca
  );

  // Subtle breathing
  float n = snoise(rotated * 0.008 + uTime * 0.02);
  rotated.y += n * 1.5;

  vec4 mvPos = modelViewMatrix * vec4(rotated, 1.0);
  float camDist = -mvPos.z;

  // Size attenuation (scaled for macro, clamped to avoid giant spheres)
  float sz = uSize * aSize * uPixelRatio * (8000.0 / max(camDist, 1.0));
  sz = clamp(sz, 0.5, 6.0 * uPixelRatio); // Never look bigger than a distant dot

  // Distance attenuation
  vAlpha = aBrightness * smoothstep(80000.0, 50.0, camDist);
  
  // Proximity Fade (dust physically close to the camera disappears, keeping Solar Systems isolated)
  vAlpha *= smoothstep(400.0, 1500.0, camDist);
  
  vAlpha = clamp(vAlpha, 0.0, 1.0);

  vColor = aColor;
  vBrightness = aBrightness;

  gl_PointSize = max(sz, 0.5);
  gl_Position = projectionMatrix * mvPos;
}
