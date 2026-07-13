// Planet Vertex Shader
// Passes world-space data for lighting + local position for noise sampling

varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vLocalPos;  // unit sphere direction — noise anchored to surface

void main() {
  vLocalPos = normalize(position);
  // World-space normal for directional lighting
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
