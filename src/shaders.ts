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
  float authored = uSourceMode == 0 ? radial : sourceMask(uv);
  float mask = mix(radial, authored, uSourceMix);

  float angle = atan(p.y, p.x);
  float rayBands = 0.5 + 0.5 * sin(angle * (26.0 + uShatterScale * 34.0) + radius * 20.0 - uTime * (0.35 + uWaveSpeed));
  rayBands = pow(rayBands, 5.0) * smoothstep(0.02, 0.55, radius);
  mask = clamp(mask + rayBands * (0.08 + 0.2 * uShatterAmount) * uUseShatter, 0.0, 1.0);
  return mix(1.0, mask, uVignetteMix * uUseVignette);
}

void main() {
  vec2 uv = vUv;
  float field = fieldAt(uv);
  if (uUseBokeh > 0.5) {
    vec2 px = vec2(1.0) / uResolution;
    vec2 tilt = normalize(vec2(cos(uBokehTilt * PI), sin(uBokehTilt * PI)) + 0.0001);
    float spread = (0.5 + uBokehRadius * 4.0) * mix(0.45, 1.0, uBokehMixRadius);
    float blur = field;
    blur += fieldAt(uv + tilt * px * spread * 2.0);
    blur += fieldAt(uv - tilt * px * spread * 2.0);
    blur += fieldAt(uv + vec2(-tilt.y, tilt.x) * px * spread * 1.35);
    blur += fieldAt(uv - vec2(-tilt.y, tilt.x) * px * spread * 1.35);
    field = blur / 5.0;
  }
  vec3 base = mix(uBackground, uShadow, smoothstep(0.0, 0.62, 1.0 - field));
  vec3 color = mix(base, uLight, smoothstep(0.42, 1.0, field));
  float grain = hash21(gl_FragCoord.xy + floor(uTime * 12.0)) - 0.5;
  color += grain * 0.012;
  fragColor = vec4(color, 1.0);
}`;
