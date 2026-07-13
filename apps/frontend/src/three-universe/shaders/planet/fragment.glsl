// Planet Fragment Shader — Procedural realistic planets
// 5 planet types: Terrestrial, Gas Giant, Lava, Ice, Desert
// Driven by uSeed for per-planet variation

#include ../lib/noise.glsl

uniform float uTime;
uniform vec3  uColor;     // industry color — drives planet palette
uniform float uSeed;      // per-planet variation (idx * large_prime)
uniform vec3  uStarPos;   // world-space position of parent star

varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vLocalPos;   // unit sphere — noise sampling

void main() {
  // ── LIGHTING ───────────────────────────────────────────────────────────────
  vec3 lightDir = normalize(uStarPos - vWorldPosition);
  float NdotL   = dot(vWorldNormal, lightDir);
  float diffuse = max(NdotL, 0.0);
  float light   = 0.07 + diffuse * 0.93;
  // Night factor for city lights
  float nightFactor = 1.0 - smoothstep(-0.15, 0.35, NdotL);

  // ── SURFACE SAMPLING DIRECTION ─────────────────────────────────────────────
  // vLocalPos rotates with planet geometry (rotation.y each frame) — features stick to surface
  vec3 p = vLocalPos;
  // Clouds drift slightly faster than surface
  float ct = uTime * 0.055 + uSeed * 3.17;
  float cosT = cos(ct); float sinT = sin(ct);
  vec3 pCloud = vec3(p.x * cosT - p.z * sinT, p.y, p.x * sinT + p.z * cosT);

  // ── PLANET TYPE ────────────────────────────────────────────────────────────
  float typeVal = fract(uSeed * 0.13713);

  vec3  surfaceColor    = vec3(0.5);
  float specularStrength = 0.0;
  float cloudCoverage   = 0.35;
  bool  selfIlluminate  = false;
  vec3  selfIllumColor  = vec3(0.0);

  // ── TYPE 0: TERRESTRIAL (oceans + continents + ice caps) ──────────────────
  if (typeVal < 0.22) {
    float terrain = fbm5(p * 3.2 + uSeed * 0.17);

    float seaLevel  = 0.02 + fract(uSeed * 7.3) * 0.08;
    float polarity  = abs(p.y);
    float iceCap    = smoothstep(0.62, 0.88, polarity);

    vec3 oceanDeep  = mix(vec3(0.02, 0.08, 0.38), uColor * 0.4, 0.25);
    vec3 oceanShallow = mix(vec3(0.05, 0.25, 0.55), uColor * 0.5, 0.3);
    vec3 sandColor  = vec3(0.72, 0.60, 0.38) * (uColor * 0.3 + vec3(0.6));
    vec3 grassColor = vec3(0.18, 0.42, 0.12) * (uColor * 0.25 + vec3(0.25, 0.4, 0.1));
    vec3 rockColor  = vec3(0.38, 0.30, 0.24) * (uColor * 0.35 + vec3(0.35));
    vec3 snowColor  = vec3(0.92, 0.95, 1.00);

    // Shallow ocean at coastline
    vec3 oceanColor = mix(oceanDeep, oceanShallow, smoothstep(seaLevel - 0.12, seaLevel, terrain));
    surfaceColor = oceanColor;
    surfaceColor = mix(surfaceColor, sandColor,  smoothstep(seaLevel,        seaLevel + 0.07, terrain));
    surfaceColor = mix(surfaceColor, grassColor, smoothstep(seaLevel + 0.05, seaLevel + 0.22, terrain));
    surfaceColor = mix(surfaceColor, rockColor,  smoothstep(seaLevel + 0.25, seaLevel + 0.48, terrain));
    surfaceColor = mix(surfaceColor, snowColor,  smoothstep(seaLevel + 0.48, seaLevel + 0.65, terrain));
    surfaceColor = mix(surfaceColor, snowColor,  iceCap);

    // Ocean specular (only water areas)
    float isOcean = 1.0 - smoothstep(seaLevel - 0.03, seaLevel + 0.04, terrain);
    specularStrength = isOcean * 0.65;
    cloudCoverage    = 0.45;

  // ── TYPE 1: GAS GIANT (banded atmosphere + great storm) ───────────────────
  } else if (typeVal < 0.44) {
    float lat       = p.y;
    float bandFreq  = 7.0 + fract(uSeed * 3.71) * 7.0;
    float turbulence = fbm3(p * 2.8 + uTime * 0.018) * 2.2;
    float band      = sin(lat * bandFreq + turbulence);

    vec3 band1 = uColor;
    vec3 band2 = uColor * 0.38 + vec3(0.32, 0.16, 0.06);
    vec3 band3 = clamp(uColor * 1.5 + vec3(0.25, 0.12, 0.0), 0.0, 1.0);

    float t = band * 0.5 + 0.5;
    surfaceColor = mix(band1, band2, smoothstep(0.2, 0.75, t));
    surfaceColor = mix(surfaceColor, band3, smoothstep(0.72, 1.0, t));

    // Swirling storm detail
    float swirl = fbm5(vec3(p.x * 2.0 + uTime * 0.01, p.y * 4.0, p.z * 2.0 + uSeed));
    surfaceColor = mix(surfaceColor, band2 * 1.3, swirl * 0.3);

    // Great storm oval
    vec2 stormCenter = vec2(fract(uSeed * 2.11) * 0.6 - 0.3, (fract(uSeed * 5.73) - 0.5) * 0.5);
    float stormDist  = length(vec2(p.x - stormCenter.x, p.y - stormCenter.y) * vec2(1.0, 2.5));
    float storm      = 1.0 - smoothstep(0.0, 0.22, stormDist);
    vec3  stormColor = clamp(vec3(0.9, 0.45, 0.12) * uColor * 2.5, 0.0, 1.0);
    surfaceColor     = mix(surfaceColor, stormColor, storm * 0.75);

    specularStrength = 0.12;
    cloudCoverage    = 0.0; // gas giant IS the clouds

  // ── TYPE 2: LAVA / VOLCANIC ───────────────────────────────────────────────
  } else if (typeVal < 0.62) {
    float lava   = fbm5(p * 4.2 + uTime * 0.035);
    float cracks = 1.0 - abs(snoise(p * 9.5 + uSeed));
    cracks = pow(max(cracks - 0.65, 0.0) / 0.35, 2.2);

    vec3 rockDark  = vec3(0.06, 0.04, 0.03);
    vec3 rockMid   = uColor * 0.3 + vec3(0.18, 0.08, 0.04);
    vec3 lavaGlow  = clamp(uColor * 2.2 + vec3(1.0, 0.28, 0.0), 0.0, 1.0);

    surfaceColor = mix(rockDark, rockMid, smoothstep(0.2, 0.55, lava));
    surfaceColor = mix(surfaceColor, lavaGlow, smoothstep(0.55, 0.85, lava));
    surfaceColor += lavaGlow * cracks * 0.9;

    // Lava cracks self-illuminate on night side
    selfIlluminate = true;
    selfIllumColor = lavaGlow * (cracks + smoothstep(0.7, 0.95, lava)) * 0.55;

    cloudCoverage    = 0.10;
    specularStrength = 0.0;

  // ── TYPE 3: ICE / FROZEN ──────────────────────────────────────────────────
  } else if (typeVal < 0.80) {
    float iceTerrain = fbm5(p * 5.5 + uSeed * 0.23);
    float cracks     = snoise(p * 13.0 + uSeed) * 0.5 + 0.5;
    float subsurface = snoise(p * 28.0) * 0.5 + 0.5; // fine texture

    vec3 iceWhite = vec3(0.88, 0.93, 1.00);
    vec3 iceBlue  = vec3(0.12, 0.35, 0.72) * (uColor * 0.3 + vec3(0.25, 0.4, 0.7));
    vec3 iceDirt  = uColor * 0.28 + vec3(0.22, 0.16, 0.12);

    surfaceColor = mix(iceBlue, iceWhite, smoothstep(0.15, 0.72, iceTerrain));
    surfaceColor = mix(surfaceColor, iceDirt, smoothstep(0.68, 0.92, iceTerrain) * 0.4);
    // Blue cracks through surface
    surfaceColor = mix(iceBlue * 0.65, surfaceColor, smoothstep(0.28, 0.62, cracks));
    // Fine surface texture
    surfaceColor *= 0.88 + subsurface * 0.24;

    specularStrength = 0.80;
    cloudCoverage    = 0.08;

  // ── TYPE 4: DESERT / BARREN ───────────────────────────────────────────────
  } else {
    float dunes    = fbm5(p * 6.5 + uSeed * 0.31);
    float craters  = snoise(p * 4.8 + uSeed * 1.7) * 0.5 + 0.5;
    float fine     = snoise(p * 22.0) * 0.5 + 0.5;

    vec3 sandBase = uColor * 0.55 + vec3(0.58, 0.42, 0.18);
    vec3 sandDark = uColor * 0.28 + vec3(0.28, 0.17, 0.06);
    vec3 craterRim = vec3(0.72, 0.67, 0.60);
    vec3 rockVein  = uColor * 0.2 + vec3(0.35, 0.25, 0.18);

    surfaceColor = mix(sandDark, sandBase, smoothstep(0.18, 0.82, dunes));
    surfaceColor = mix(surfaceColor, craterRim, smoothstep(0.72, 0.90, craters) * 0.45);
    surfaceColor = mix(surfaceColor, rockVein,  smoothstep(0.75, 0.95, fine)    * 0.3);

    specularStrength = 0.0;
    cloudCoverage    = 0.04;
  }

  // ── CLOUDS ─────────────────────────────────────────────────────────────────
  if (cloudCoverage > 0.0) {
    float c1 = fbm5(pCloud * 3.8);
    float c2 = fbm3(pCloud * 7.2 + 0.5 + uSeed * 0.7);
    float clouds = smoothstep(0.52 - cloudCoverage * 0.28, 0.78, c1 * c2 * 2.0);
    vec3 cloudColor = mix(vec3(0.92, 0.93, 1.0), uColor * 0.3 + vec3(0.7), 0.15);
    surfaceColor = mix(surfaceColor, cloudColor, clouds * cloudCoverage);
  }

  // ── SPECULAR HIGHLIGHT ─────────────────────────────────────────────────────
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 halfDir = normalize(lightDir + viewDir);
  float spec   = pow(max(dot(vWorldNormal, halfDir), 0.0), 56.0) * specularStrength * diffuse;

  // ── CITY LIGHTS (night side — terrestrial + desert only) ──────────────────
  float cityNoise = smoothstep(0.76, 0.96, fbm3(p * 19.0 + uSeed * 2.3) * 0.5 + 0.5);
  vec3  cityLight = vec3(1.0, 0.88, 0.42) * cityNoise * nightFactor * 0.45;
  if (typeVal >= 0.44 && typeVal < 0.62) cityLight = vec3(0.0); // no cities on lava
  if (typeVal >= 0.62 && typeVal < 0.80) cityLight = vec3(0.0); // no cities on ice

  // ── FINAL COMPOSITE ────────────────────────────────────────────────────────
  vec3 final = surfaceColor * light;
  final += vec3(spec);
  final += cityLight;
  if (selfIlluminate) final += selfIllumColor * (1.0 - diffuse * 0.6);

  gl_FragColor = vec4(clamp(final, 0.0, 1.0), 1.0);
}
