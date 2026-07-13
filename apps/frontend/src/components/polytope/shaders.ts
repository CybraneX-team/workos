// ── Spectral shell shaders ────────────────────────────────────────────────────
// Used for the translucent convex-hull face mesh that wraps all dept nodes.

export const vertexShader = /* glsl */`
attribute float vertexAlpha;
varying float vAlpha;
varying vec3 vColor;
varying float vDist;
varying vec3 vNormalW;
varying vec3 vWorldPos;

void main() {
    vAlpha    = vertexAlpha;
    vColor    = color;
    vDist     = length(position);
    vNormalW  = normalize(mat3(modelMatrix) * normal);

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos     = worldPos.xyz;
    gl_Position   = projectionMatrix * viewMatrix * worldPos;
}
`;

export const fragmentShader = /* glsl */`
uniform float uOpacity;
uniform vec3  uCameraPos;

varying float vAlpha;
varying vec3  vColor;
varying float vDist;
varying vec3  vNormalW;
varying vec3  vWorldPos;

void main() {
    vec3  viewDir    = normalize(uCameraPos - vWorldPos);
    float fresnel    = pow(1.0 - max(dot(normalize(vNormalW), viewDir), 0.0), 2.2);
    float frontBoost = max(dot(normalize(vNormalW), viewDir), 0.0);

    // pow(0.3) stretches opacity so glow range is wide
    float stretchedAlpha = pow(vAlpha, 0.3);

    // Square the color to deepen saturation — prevents light colours washing out to white
    vec3 deepColor  = vColor * vColor;
    vec3 finalColor = deepColor * (3.5 + frontBoost * 2.0) * vAlpha;
    finalColor     += deepColor * fresnel * 0.4 * vAlpha;

    float alpha = uOpacity * (0.6 + frontBoost * 1.2) * stretchedAlpha;
    gl_FragColor = vec4(finalColor, alpha);
}
`;
