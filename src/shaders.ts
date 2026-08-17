export const vertexShader = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const fragmentShader = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uPointer;
uniform vec3 uBackground;
uniform vec3 uShadow;
uniform vec3 uLight;
uniform sampler2D uSource;
uniform int uSourceMode;
uniform float uSourceThreshold;
uniform float uSourceSoftness;
uniform float uSourceInvert;
uniform float uSourceMix;
uniform float uSourceScale;
uniform float uSourceRotation;
uniform vec2 uSourceOffset;
uniform float uSourceHover;
uniform float uSourceHoverStrength;
uniform float uVignetteRadius;
uniform float uVignetteFalloff;
uniform float uVignetteDisplace;
uniform float uVignetteMix;
uniform float uVignetteAngle;
uniform float uVignetteSkew;
uniform float uWaveFrequency;
uniform float uWaveAmplitude;
uniform float uWaveFalloff;
uniform float uWaveRotation;
uniform float uWavePhase;
uniform float uWaveSpeed;
uniform float uWaveMixRadius;
uniform float uWaveTrackPointer;
uniform float uShatterScale;
uniform float uShatterAmount;
uniform float uShatterAngle;
uniform float uShatterRadius;
uniform float uShatterSkew;
uniform float uShatterMixRadius;
uniform float uShatterInvert;
uniform float uBokehRadius;
uniform float uBokehTilt;
uniform float uBokehMixRadius;
uniform float uBokehTrackPointer;
uniform float uUseVignette;
uniform float uUseWave;
uniform float uUseShatter;
uniform float uUseBokeh;

#define PI 3.14159265359
#define TAU 6.28318530718

mat2 rotate2d(float angle) {
  float s = sin(angle), c = cos(angle);
  return mat2(c, -s, s, c);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}

float fbm(vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    total += valueNoise(p) * amplitude;
    p = rotate2d(0.47) * p * 2.03 + 7.13;
    amplitude *= 0.5;
  }
  return total;
}

float capsuleDistance(vec2 p, vec2 a, vec2 b, float radius) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * h) - radius;
}

float rayStroke(vec2 p, vec2 center, float lengthValue, float widthValue, float angle, float strength) {
  vec2 direction = vec2(cos(angle), sin(angle));
  vec2 a = center - direction * lengthValue * 0.5;
  vec2 b = center + direction * lengthValue * 0.5;
  float distanceToStroke = capsuleDistance(p, a, b, widthValue);
  float core = 1.0 - smoothstep(-widthValue * 0.28, widthValue * 0.42, distanceToStroke);
  float halo = 1.0 - smoothstep(widthValue * 0.12, widthValue * 2.6, distanceToStroke);
  return clamp((core * 0.82 + halo * 0.34) * strength, 0.0, 1.0);
}

float proceduralRayfield(vec2 p) {
  float field = 0.0;

  // The native source is a family of broad diagonal rays rather than a
  // centred radial blob. The overlapping primary strokes form the soft body
  // while the seeded strokes keep the field alive across the whole surface.
  field = max(field, rayStroke(p, vec2(-0.42, -0.18), 0.92, 0.105, 0.73, 1.0));
  field = max(field, rayStroke(p, vec2(-0.08, -0.22), 0.82, 0.092, 0.76, 0.98));
  field = max(field, rayStroke(p, vec2(0.20, -0.29), 0.64, 0.080, 0.79, 0.92));
  field = max(field, rayStroke(p, vec2(-0.62, -0.31), 0.48, 0.070, 0.70, 0.90));

  for (int i = 0; i < 18; i++) {
    float index = float(i);
    float seedX = hash21(vec2(index + 2.7, 4.1));
    float seedY = hash21(vec2(index + 8.3, 9.7));
    float seedShape = hash21(vec2(index + 15.9, 2.2));
    vec2 center = vec2(mix(-1.02, 1.02, seedX), mix(-0.50, 0.58, seedY));
    center += vec2(sin(uTime * 0.055 + index * 0.81), cos(uTime * 0.047 + index * 0.63)) * 0.008;
    float lengthValue = mix(0.14, 0.44, seedShape);
    float widthValue = mix(0.021, 0.058, hash21(vec2(index + 5.4, 17.1)));
    float angle = 0.75 + (hash21(vec2(index + 3.2, 21.8)) - 0.5) * 0.22;
    float strength = mix(0.58, 0.94, hash21(vec2(index + 22.4, 6.6)));
    field = max(field, rayStroke(p, center, lengthValue, widthValue, angle, strength));
  }

  float textureNoise = fbm(p * 6.5 + vec2(uTime * 0.018, -uTime * 0.012));
  return clamp(field * mix(0.92, 1.05, textureNoise), 0.0, 1.0);
}

float sourceMask(vec2 uv) {
  vec2 sourceUv = uv - 0.5;
  vec2 pointerDelta = uv - uPointer;
  float hover = exp(-dot(pointerDelta, pointerDelta) * 22.0) * uSourceHover;
  sourceUv -= pointerDelta * hover * uSourceHoverStrength;
  sourceUv = rotate2d(uSourceRotation * TAU) * sourceUv;
  sourceUv /= max(0.001, uSourceScale);
  sourceUv += 0.5 + uSourceOffset;
  float inside = step(0.0, sourceUv.x) * step(sourceUv.x, 1.0) * step(0.0, sourceUv.y) * step(sourceUv.y, 1.0);
  float luma = dot(texture(uSource, sourceUv).rgb, vec3(0.299, 0.587, 0.114)) * inside;
  if (uSourceMode == 2) luma = fbm(sourceUv * 7.0 + uTime * 0.025);
  float mask = smoothstep(uSourceThreshold - uSourceSoftness, uSourceThreshold + uSourceSoftness, luma);
  return mix(mask, 1.0 - mask, uSourceInvert);
}

float fieldAt(vec2 uv) {
  vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec2 p = (uv - 0.5) * aspect;
  vec2 pointer = (uPointer - 0.5) * aspect;

  float distanceFromOrigin = length(p);
  float radialMix = smoothstep(0.0, max(0.001, uShatterRadius), distanceFromOrigin);

  if (uUseShatter > 0.5) {
    float angle = atan(p.y, p.x) + radians(uShatterAngle);
    float cells = mix(5.0, 34.0, clamp(uShatterScale, 0.0, 1.5) / 1.5);
    float wedge = floor((angle / TAU + 0.5) * cells);
    float jitter = hash21(vec2(wedge, floor(distanceFromOrigin * 12.0)));
    vec2 tangent = normalize(vec2(-p.y, p.x) + 0.0001);
    float mask = mix(1.0 - radialMix, radialMix, uShatterInvert);
    p += tangent * (jitter - 0.5) * uShatterAmount * 0.11 * mix(1.0, mask, uShatterMixRadius);
    p.x += (jitter - 0.5) * uShatterSkew * 0.035;
  }

  if (uUseWave > 0.5) {
    float rotation = uWaveRotation * TAU;
    vec2 direction = vec2(cos(rotation), sin(rotation));
    vec2 normal = vec2(-direction.y, direction.x);
    float pointerPhase = dot(pointer, direction) * uWaveTrackPointer * 3.0;
    float wave = sin(dot(p, direction) * (5.0 + uWaveFrequency * 22.0) + uWavePhase * TAU + uTime * uWaveSpeed * 2.5 + pointerPhase);
    float attenuation = mix(1.0, exp(-distanceFromOrigin * (1.0 + uWaveFalloff * 5.0)), uWaveFalloff);
    p += normal * wave * uWaveAmplitude * 0.045 * attenuation * mix(1.0, 1.0 - radialMix, uWaveMixRadius);
  }

  vec2 skew = vec2(max(0.05, uVignetteSkew * 1.8), max(0.05, (1.0 - uVignetteSkew) * 1.8));
  vec2 vp = rotate2d(uVignetteAngle * TAU) * (p * skew);
  float radius = length(vp);
  float edge = max(0.005, uVignetteRadius * 0.72);
  float soft = max(0.002, edge * (0.06 + uVignetteFalloff * 0.52));
  float radial = 1.0 - smoothstep(edge - soft, edge + soft, radius + fbm(vp * 5.0) * uVignetteDisplace * 0.06);
  float authored = uSourceMode == 0 ? proceduralRayfield(p) : sourceMask(uv);
  float mask = mix(radial, authored, uSourceMix);

  return mix(1.0, mask, uVignetteMix * uUseVignette);
}

void main() {
  vec2 uv = vUv;
  float field = fieldAt(uv);
  if (uUseBokeh > 0.5) {
    float bloom = clamp(uBokehRadius / 1.5, 0.0, 1.0) * mix(0.45, 1.0, uBokehMixRadius);
    float shoulder = sqrt(max(field, 0.0));
    float softField = smoothstep(0.0, max(0.52, 1.0 - bloom * 0.2), field);
    field = mix(field, mix(softField, shoulder, 0.34), bloom * 0.42);
  }
  float shadowWeight = 0.12 + smoothstep(0.0, 0.84, 1.0 - field) * 0.09;
  vec3 base = mix(uBackground, uShadow, shadowWeight);
  base = mix(base, uLight, 0.035 + uv.x * 0.018);
  vec3 color = mix(base, uLight, smoothstep(0.12, 0.88, field));
  float grain = hash21(gl_FragCoord.xy + floor(uTime * 12.0)) - 0.5;
  color += grain * 0.012;
  fragColor = vec4(color, 1.0);
}`;
