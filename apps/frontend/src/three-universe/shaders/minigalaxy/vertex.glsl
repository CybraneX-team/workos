// Mini Galaxy Vertex Shader — same look as main galaxy, no proximity fade

#include ../lib/noise.glsl

uniform float uTime;
uniform float uSize;
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
  float n = snoise(rotated * 0.015 + uTime * 0.03);
  rotated.y += n * 0.8;

  vec4 mvPos = modelViewMatrix * vec4(rotated, 1.0);
  float camDist = -mvPos.z;

  // Size — scale nicely at all distances, larger divisor for galaxy-scale viewing
  float sz = uSize * aSize * uPixelRatio * (12000.0 / max(camDist, 1.0));
  sz = clamp(sz, 0.4, 8.0 * uPixelRatio);

  // Alpha — visible across full universe range
  vAlpha = aBrightness * smoothstep(80000.0, 200.0, camDist);
  vAlpha = clamp(vAlpha, 0.0, 1.0);

  vColor = aColor;
  vBrightness = aBrightness;

  gl_PointSize = max(sz, 0.3);
  gl_Position = projectionMatrix * mvPos;
}
