// Galaxy Particle Fragment Shader — Clean circular particles with twinkle

uniform float uTime;

varying vec3 vColor;
varying float vAlpha;
varying float vBrightness;

void main() {
  // Circular point sprite
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;

  // Soft radial falloff
  float core = 1.0 - smoothstep(0.0, 0.12, d);
  float glow = exp(-d * 5.0);

  // Twinkle
  float tw = sin(uTime * (1.0 + vBrightness * 3.0) + gl_FragCoord.x * 0.013) * 0.3 + 0.7;

  // White core fading to color
  vec3 col = mix(vColor, vec3(1.0, 0.98, 0.94), core * 0.7);
  col *= tw;

  float a = (core + glow * 0.5) * vAlpha * tw;

  gl_FragColor = vec4(col, a);
}
