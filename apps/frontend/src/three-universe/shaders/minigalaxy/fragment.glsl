// Mini Galaxy Fragment Shader — same as main galaxy fragment

uniform float uTime;

varying vec3 vColor;
varying float vAlpha;
varying float vBrightness;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;

  float core = 1.0 - smoothstep(0.0, 0.10, d);
  float glow = exp(-d * 10.0); // tighter falloff — less halo bleed

  float tw = sin(uTime * (1.0 + vBrightness * 3.0) + gl_FragCoord.x * 0.013) * 0.15 + 0.85;

  vec3 col = mix(vColor, vec3(1.0, 0.98, 0.94), core * 0.5);
  col *= tw;

  float a = (core * 0.65 + glow * 0.20) * vAlpha * tw;

  gl_FragColor = vec4(col, a);
}
