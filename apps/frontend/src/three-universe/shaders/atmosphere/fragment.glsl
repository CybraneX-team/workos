// Atmosphere Fragment Shader — Thick Rayleigh scattering glow

uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;

varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);

  // Fresnel — wider than before (pow 2.0 vs 3.0) for thicker atmosphere
  float fresnel = 1.0 - max(dot(vNormal, viewDir), 0.0);
  fresnel = pow(fresnel, 1.9);

  // Light direction from star (approximate: star is at group origin, planet orbits around it)
  vec3 lightDir = normalize(-vWorldPosition);
  float NdotL   = dot(vNormal, lightDir);

  // Lit side: brighter, warmer atmosphere; night side: deeper blue
  vec3 litColor   = mix(uColor * 1.3 + vec3(0.15, 0.1, 0.0), vec3(0.6, 0.8, 1.0), 0.25);
  vec3 nightColor = uColor * 0.4 + vec3(0.05, 0.1, 0.4);
  vec3 atmosphereColor = mix(nightColor, litColor, smoothstep(-0.2, 0.6, NdotL));

  // Subtle shimmer
  float shimmer = sin(uTime * 1.2 + vNormal.y * 4.5) * 0.04 + 0.96;

  float alpha = fresnel * 0.90 * uIntensity;

  gl_FragColor = vec4(atmosphereColor * uIntensity * shimmer, alpha);
}
