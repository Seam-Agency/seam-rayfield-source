export const vertexShader = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// These five passes are carried directly from the working source renderer.
// Keeping the passes separate is essential: fracture and bokeh sample the
// previous framebuffer rather than re-evaluating an analytic field.
export const vignetteFragmentShader = `#version 300 es
precision highp float;
#define TWO_PI 6.28318530718
in vec2 vUv;
out vec4 fragColor;
uniform float uRadius;
uniform float uFalloff;
uniform float uMix;
uniform float uDisplace;
uniform float uSkew;
uniform float uAngle;
uniform vec3 uVignetteColor;
uniform vec2 uPos;
uniform vec2 uResolution;
uniform sampler2D tSourceTexture;
uniform vec3 uClearColor;
uniform int uSourceMode;
uniform float uSourceThreshold;
uniform float uSourceSoftness;
uniform float uSourceInvert;
uniform float uSourceMix;
uniform float uSourceScale;
uniform float uSourceRotation;
uniform vec2 uSourceOffset;
uniform vec2 uSourcePointer;
uniform float uSourceHover;
uniform float uSourceHoverStrength;

mat2 rot(float a) {
  return mat2(cos(a), -sin(a), sin(a), cos(a));
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
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 octaveRotation = rot(0.47);
  for (int octave = 0; octave < 5; octave++) {
    value += valueNoise(p) * amplitude;
    p = octaveRotation * p * 2.03 + 7.13;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = vUv;
  float displacement = 0.5 * uDisplace * 0.5;
  vec2 aspectRatio = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 skew = vec2(uSkew, 1.0 - uSkew);
  float halfRadius = uRadius * 0.5;
  float innerEdge = halfRadius - uFalloff * halfRadius * 0.5;
  float outerEdge = halfRadius + uFalloff * halfRadius * 0.5;
  vec2 scaledUV = uv * aspectRatio * rot(uAngle * TWO_PI) * skew;
  vec2 scaledPos = uPos * aspectRatio * rot(uAngle * TWO_PI) * skew;
  float radius = distance(scaledUV, scaledPos);
  float radialFalloff = smoothstep(innerEdge + displacement, outerEdge + displacement, radius);

  float pointerInside = step(0.0, uSourcePointer.x) * step(uSourcePointer.x, 1.0)
    * step(0.0, uSourcePointer.y) * step(uSourcePointer.y, 1.0);
  vec2 pointerDelta = uv - uSourcePointer;
  float hoverFalloff = exp(-dot(pointerDelta, pointerDelta) * 22.0);
  vec2 hoverUv = uv - pointerDelta * hoverFalloff
    * uSourceHoverStrength * uSourceHover * pointerInside;
  vec2 sourceUv = hoverUv - 0.5;
  sourceUv = rot(uSourceRotation * TWO_PI) * sourceUv;
  sourceUv /= max(uSourceScale, 0.001);
  sourceUv += 0.5 + uSourceOffset;
  float sourceInside = step(0.0, sourceUv.x) * step(sourceUv.x, 1.0)
    * step(0.0, sourceUv.y) * step(sourceUv.y, 1.0);
  float authoredLuma = dot(texture(tSourceTexture, sourceUv).rgb, vec3(0.299, 0.587, 0.114)) * sourceInside;
  float noiseLuma = fbm(sourceUv * 7.0);
  float sourceLuma = uSourceMode == 2 ? noiseLuma : authoredLuma;
  float sourceMask = smoothstep(
    uSourceThreshold - uSourceSoftness,
    uSourceThreshold + uSourceSoftness,
    sourceLuma
  );
  sourceMask = mix(sourceMask, 1.0 - sourceMask, uSourceInvert);
  float authoredFalloff = 1.0 - sourceMask;
  float falloff = uSourceMode == 0
    ? radialFalloff
    : mix(radialFalloff, authoredFalloff, uSourceMix);
  fragColor = mix(vec4(uClearColor, 0.0), vec4(uVignetteColor, 1.0), falloff);
}`;

export const sineFragmentShader = `#version 300 es
precision mediump float;
#define PI3 1.04709283144
in vec2 vUv;
uniform sampler2D tInput;
uniform float uMixRadius;
uniform vec2 uPos;
uniform float uFrequency;
uniform float uAmplitude;
uniform float uRotation;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMousePos;
uniform float uTrackMouse;
out vec4 fragColor;
void main() {
  vec2 uv = vUv;
  vec2 waveCoord = vUv.xy * 2.0 - 1.0;
  float time = uTime * 0.25;
  float frequency = 20.0 * uFrequency;
  float amp = uAmplitude * 0.2;
  float waveX = sin((waveCoord.y + uPos.y) * frequency + (time * PI3)) * amp;
  float waveY = sin((waveCoord.x - uPos.x) * frequency + (time * PI3)) * amp;
  waveCoord.xy += vec2(mix(waveX, 0.0, uRotation), mix(0.0, waveY, uRotation));
  vec2 finalUV = waveCoord * 0.5 + 0.5;
  float aspectRatio = uResolution.x / uResolution.y;
  vec2 mPos = uPos + mix(vec2(0.0), (uMousePos - 0.5), uTrackMouse);
  float dist = max(0.0, 1.0 - distance(uv * vec2(aspectRatio, 1.0), mPos * vec2(aspectRatio, 1.0)) * 4.0 * (1.0 - uMixRadius));
  uv = mix(uv, finalUV, dist);
  fragColor = texture(tInput, uv);
}`;

export const shatterFragmentShader = `#version 300 es
precision mediump float;
#define PI 3.14159265359
in vec2 vUv;
uniform sampler2D tInput;
uniform float uAmount;
uniform float uSpread;
uniform float uAngle;
uniform float uTime;
uniform float uSkew;
uniform vec2 uPos;
uniform vec2 uResolution;
uniform float uMixRadius;
uniform vec2 uMousePos;
uniform float uTrackMouse;
out vec4 fragColor;

vec2 random2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

mat2 rot(float a) {
  return mat2(cos(a), -sin(a), sin(a), cos(a));
}

void main() {
  vec2 uv = vUv;
  float aspectRatio = uResolution.x / uResolution.y;
  vec2 skew = mix(vec2(1.0), vec2(1.0, 0.0), uSkew);
  vec2 st = (uv - uPos) * vec2(aspectRatio, 1.0) * 50.0 * uAmount;
  st = st * rot(uAngle * 2.0 * PI) * skew;
  vec2 i_st = floor(st);
  vec2 f_st = fract(st);
  float m_dist = 15.0;
  vec2 m_point = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 neighbor = vec2(float(i), float(j));
      vec2 point = random2(i_st + neighbor);
      point = 0.5 + 0.5 * sin(5.0 + uTime * 0.2 + 6.2831 * point);
      vec2 diff = neighbor + point - f_st;
      float dist = length(diff);
      if (dist < m_dist) {
        m_dist = dist;
        m_point = point;
      }
    }
  }
  vec2 offset = (m_point * 0.2 * uSpread * 2.0) - (uSpread * 0.2);
  vec2 mPos = uPos + mix(vec2(0.0), (uMousePos - 0.5), uTrackMouse);
  float dist = max(0.0, 1.0 - distance(uv * vec2(aspectRatio, 1.0), mPos * vec2(aspectRatio, 1.0)) * 4.0 * (1.0 - uMixRadius));
  fragColor = texture(tInput, uv + offset * dist);
}`;

export const bokehFragmentShader = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
#define PI2 6.28318530718
#define ITERATIONS 50.0
#define GOLDEN_ANGLE 2.39996323
uniform sampler2D tInput;
uniform sampler2D tBlueNoise;
uniform float uAmount;
uniform float uTilt;
uniform vec2 uPos;
uniform vec2 uResolution;
uniform vec2 uMousePos;
uniform float uTrackMouse;
uniform vec2 uBlueNoiseResolution;

vec2 sampleOffset(in float theta, inout float r) {
  r += 1.0 / r;
  return (r - 1.0) * vec2(cos(theta), sin(theta));
}

float getBlueNoiseOffset(vec2 st) {
  ivec2 texSize = ivec2(uBlueNoiseResolution);
  vec4 blueNoise = texelFetch(
    tBlueNoise,
    ivec2(fract(st * uResolution / vec2(texSize) * vec2(float(texSize.x) / float(texSize.y), 1.0)) * vec2(texSize)) % texSize,
    0
  );
  return mod((blueNoise.r - 0.5) * PI2, PI2);
}

vec4 bokeh(sampler2D tex, vec2 uv, float blurRadius) {
  vec3 accumulatedColor = vec3(0.0);
  vec3 accumulatedWeights = vec3(0.0);
  float accumulatedAlpha = 0.0;
  float aspectRatio = uResolution.x / uResolution.y;
  vec2 pixelSize = vec2(1.0 / aspectRatio, 1.0) * 0.04 * 0.075;
  float r = 1.0;
  float noiseOffset = (getBlueNoiseOffset(uv) - 0.5) * 0.01;
  float noiseAngle = noiseOffset * PI2;
  mat2 rotationMatrix = mat2(cos(noiseAngle), -sin(noiseAngle), sin(noiseAngle), cos(noiseAngle));
  for (float j = 0.0; j < GOLDEN_ANGLE * ITERATIONS; j += GOLDEN_ANGLE) {
    vec2 offset = sampleOffset(j, r) * pixelSize;
    float jitterAmount = 0.05 * (sin(j * 0.1) * 0.5 + 0.5);
    offset *= 1.0 + jitterAmount * sin(j * 0.7 + noiseOffset);
    vec2 samplePosition = rotationMatrix * offset;
    vec4 colorSample = texture(tex, uv + samplePosition);
    vec3 bokehWeight = vec3(5.0) + pow(colorSample.rgb, vec3(9.0)) * 150.0;
    accumulatedAlpha += colorSample.a;
    accumulatedColor += colorSample.rgb * bokehWeight;
    accumulatedWeights += bokehWeight;
  }
  return vec4(accumulatedColor / accumulatedWeights, accumulatedAlpha / ITERATIONS);
}

void main() {
  vec2 uv = vUv;
  if (uAmount == 0.0) {
    fragColor = vec4(0.0);
    return;
  }
  vec2 pos = uPos + mix(vec2(0.0), (uMousePos - 0.5), uTrackMouse);
  float dis = distance(uv, pos) * 1000.0;
  float tilt = mix(1.0 - dis * 0.001, dis * 0.001, uTilt);
  fragColor = bokeh(tInput, uv, uAmount * tilt);
}`;

export const outputFragmentShader = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D tBgTexture;
uniform vec3 uBgColor;
uniform sampler2D tInput;
uniform vec3 uOutputColor;
uniform int uLoaded;

vec3 overlay(vec3 base, vec3 blend) {
  return mix(
    2.0 * base * blend,
    1.0 - 2.0 * (1.0 - base) * (1.0 - blend),
    step(0.5, base)
  );
}

void main() {
  if (uLoaded != 1) {
    fragColor = vec4(197.0 / 255.0, 136.0 / 255.0, 122.0 / 255.0, 1.0);
  } else {
    vec3 bgTex = texture(tBgTexture, vUv).rgb;
    vec3 base = mix(uBgColor, overlay(uBgColor, bgTex), 0.61);
    vec4 inputSample = texture(tInput, vUv);
    vec3 blend = mix(uOutputColor, inputSample.rgb, inputSample.a);
    fragColor = vec4(base * mix(vec3(1.0), blend, 0.26), 1.0);
  }
}`;
