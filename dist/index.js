import { forwardRef as e, useEffect as t, useImperativeHandle as n, useLayoutEffect as r, useRef as i, useState as a } from "react";
import { jsx as o, jsxs as s } from "react/jsx-runtime";
//#region src/config.ts
var c = {
	background: { color: "#dccfd0" },
	source: {
		mode: "procedural",
		threshold: .5,
		softness: .08,
		invert: !1,
		mix: 1,
		scale: 1,
		rotation: 0,
		offsetX: 0,
		offsetY: 0,
		hover: !0,
		hoverActive: !1,
		hoverStrength: .045
	},
	vignette: {
		color: "#4a0035",
		radius: .354,
		falloff: 1,
		displace: 0,
		mix: 1,
		angle: 0,
		skew: .54
	},
	sine: {
		frequency: .35,
		amplitude: 1.18,
		falloff: .5,
		rotation: 0,
		phase: 0,
		speed: .1,
		mixRadius: 1,
		trackMouse: !1
	},
	shatter: {
		scale: .534,
		amount: 1,
		angle: 44,
		radius: 1,
		skew: .84,
		mixRadius: 1,
		mixRadiusInvert: !1
	},
	bokeh: {
		radius: .754,
		tilt: .5,
		mixRadius: 1,
		trackMouse: !1
	},
	output: { color: "#f4d9ca" },
	useVignette: !0,
	useSine: !0,
	useShatter: !0,
	useBokeh: !0
};
function l(e, t) {
	if (!t) return structuredClone(e);
	let n = structuredClone(e);
	for (let [e, r] of Object.entries(t)) {
		if (r === void 0) continue;
		let t = n[e];
		n[e] = t && r && typeof t == "object" && typeof r == "object" && !Array.isArray(r) ? l(t, r) : r;
	}
	return n;
}
function u(e) {
	return l(c, e);
}
function d(e, t) {
	let n = l(e, t);
	return Object.assign(e, n), e;
}
//#endregion
//#region src/shaders.ts
var f = "#version 300 es\nprecision highp float;\nout vec2 vUv;\nvoid main() {\n  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);\n  vUv = p;\n  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);\n}", p = "#version 300 es\nprecision highp float;\nin vec2 vUv;\nout vec4 fragColor;\n\nuniform vec2 uResolution;\nuniform float uTime;\nuniform vec2 uPointer;\nuniform vec3 uBackground;\nuniform vec3 uShadow;\nuniform vec3 uLight;\nuniform sampler2D uSource;\nuniform int uSourceMode;\nuniform float uSourceThreshold;\nuniform float uSourceSoftness;\nuniform float uSourceInvert;\nuniform float uSourceMix;\nuniform float uSourceScale;\nuniform float uSourceRotation;\nuniform vec2 uSourceOffset;\nuniform float uSourceHover;\nuniform float uSourceHoverStrength;\nuniform float uVignetteRadius;\nuniform float uVignetteFalloff;\nuniform float uVignetteDisplace;\nuniform float uVignetteMix;\nuniform float uVignetteAngle;\nuniform float uVignetteSkew;\nuniform float uWaveFrequency;\nuniform float uWaveAmplitude;\nuniform float uWaveFalloff;\nuniform float uWaveRotation;\nuniform float uWavePhase;\nuniform float uWaveSpeed;\nuniform float uWaveMixRadius;\nuniform float uWaveTrackPointer;\nuniform float uShatterScale;\nuniform float uShatterAmount;\nuniform float uShatterAngle;\nuniform float uShatterRadius;\nuniform float uShatterSkew;\nuniform float uShatterMixRadius;\nuniform float uShatterInvert;\nuniform float uBokehRadius;\nuniform float uBokehTilt;\nuniform float uBokehMixRadius;\nuniform float uBokehTrackPointer;\nuniform float uUseVignette;\nuniform float uUseWave;\nuniform float uUseShatter;\nuniform float uUseBokeh;\n\n#define PI 3.14159265359\n#define TAU 6.28318530718\n\nmat2 rotate2d(float angle) {\n  float s = sin(angle), c = cos(angle);\n  return mat2(c, -s, s, c);\n}\n\nfloat hash21(vec2 p) {\n  p = fract(p * vec2(123.34, 456.21));\n  p += dot(p, p + 45.32);\n  return fract(p.x * p.y);\n}\n\nfloat valueNoise(vec2 p) {\n  vec2 i = floor(p);\n  vec2 f = fract(p);\n  f = f * f * (3.0 - 2.0 * f);\n  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x),\n             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);\n}\n\nfloat fbm(vec2 p) {\n  float total = 0.0;\n  float amplitude = 0.5;\n  for (int i = 0; i < 5; i++) {\n    total += valueNoise(p) * amplitude;\n    p = rotate2d(0.47) * p * 2.03 + 7.13;\n    amplitude *= 0.5;\n  }\n  return total;\n}\n\nfloat capsuleDistance(vec2 p, vec2 a, vec2 b, float radius) {\n  vec2 pa = p - a;\n  vec2 ba = b - a;\n  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);\n  return length(pa - ba * h) - radius;\n}\n\nfloat rayStroke(vec2 p, vec2 center, float lengthValue, float widthValue, float angle, float strength) {\n  vec2 direction = vec2(cos(angle), sin(angle));\n  vec2 a = center - direction * lengthValue * 0.5;\n  vec2 b = center + direction * lengthValue * 0.5;\n  float distanceToStroke = capsuleDistance(p, a, b, widthValue);\n  float core = 1.0 - smoothstep(-widthValue * 0.28, widthValue * 0.42, distanceToStroke);\n  float halo = 1.0 - smoothstep(widthValue * 0.12, widthValue * 2.6, distanceToStroke);\n  return clamp((core * 0.82 + halo * 0.34) * strength, 0.0, 1.0);\n}\n\nfloat proceduralRayfield(vec2 p) {\n  float field = 0.0;\n\n  // The native source is a family of broad diagonal rays rather than a\n  // centred radial blob. The overlapping primary strokes form the soft body\n  // while the seeded strokes keep the field alive across the whole surface.\n  field = max(field, rayStroke(p, vec2(-0.42, -0.18), 0.92, 0.105, 0.73, 1.0));\n  field = max(field, rayStroke(p, vec2(-0.08, -0.22), 0.82, 0.092, 0.76, 0.98));\n  field = max(field, rayStroke(p, vec2(0.20, -0.29), 0.64, 0.080, 0.79, 0.92));\n  field = max(field, rayStroke(p, vec2(-0.62, -0.31), 0.48, 0.070, 0.70, 0.90));\n\n  for (int i = 0; i < 18; i++) {\n    float index = float(i);\n    float seedX = hash21(vec2(index + 2.7, 4.1));\n    float seedY = hash21(vec2(index + 8.3, 9.7));\n    float seedShape = hash21(vec2(index + 15.9, 2.2));\n    vec2 center = vec2(mix(-1.02, 1.02, seedX), mix(-0.50, 0.58, seedY));\n    center += vec2(sin(uTime * 0.055 + index * 0.81), cos(uTime * 0.047 + index * 0.63)) * 0.008;\n    float lengthValue = mix(0.14, 0.44, seedShape);\n    float widthValue = mix(0.021, 0.058, hash21(vec2(index + 5.4, 17.1)));\n    float angle = 0.75 + (hash21(vec2(index + 3.2, 21.8)) - 0.5) * 0.22;\n    float strength = mix(0.58, 0.94, hash21(vec2(index + 22.4, 6.6)));\n    field = max(field, rayStroke(p, center, lengthValue, widthValue, angle, strength));\n  }\n\n  float textureNoise = fbm(p * 6.5 + vec2(uTime * 0.018, -uTime * 0.012));\n  return clamp(field * mix(0.92, 1.05, textureNoise), 0.0, 1.0);\n}\n\nfloat sourceMask(vec2 uv) {\n  vec2 sourceUv = uv - 0.5;\n  vec2 pointerDelta = uv - uPointer;\n  float hover = exp(-dot(pointerDelta, pointerDelta) * 22.0) * uSourceHover;\n  sourceUv -= pointerDelta * hover * uSourceHoverStrength;\n  sourceUv = rotate2d(uSourceRotation * TAU) * sourceUv;\n  sourceUv /= max(0.001, uSourceScale);\n  sourceUv += 0.5 + uSourceOffset;\n  float inside = step(0.0, sourceUv.x) * step(sourceUv.x, 1.0) * step(0.0, sourceUv.y) * step(sourceUv.y, 1.0);\n  float luma = dot(texture(uSource, sourceUv).rgb, vec3(0.299, 0.587, 0.114)) * inside;\n  if (uSourceMode == 2) luma = fbm(sourceUv * 7.0 + uTime * 0.025);\n  float mask = smoothstep(uSourceThreshold - uSourceSoftness, uSourceThreshold + uSourceSoftness, luma);\n  return mix(mask, 1.0 - mask, uSourceInvert);\n}\n\nfloat fieldAt(vec2 uv) {\n  vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);\n  vec2 p = (uv - 0.5) * aspect;\n  vec2 pointer = (uPointer - 0.5) * aspect;\n\n  float distanceFromOrigin = length(p);\n  float radialMix = smoothstep(0.0, max(0.001, uShatterRadius), distanceFromOrigin);\n\n  if (uUseShatter > 0.5) {\n    float angle = atan(p.y, p.x) + radians(uShatterAngle);\n    float cells = mix(5.0, 34.0, clamp(uShatterScale, 0.0, 1.5) / 1.5);\n    float wedge = floor((angle / TAU + 0.5) * cells);\n    float jitter = hash21(vec2(wedge, floor(distanceFromOrigin * 12.0)));\n    vec2 tangent = normalize(vec2(-p.y, p.x) + 0.0001);\n    float mask = mix(1.0 - radialMix, radialMix, uShatterInvert);\n    p += tangent * (jitter - 0.5) * uShatterAmount * 0.11 * mix(1.0, mask, uShatterMixRadius);\n    p.x += (jitter - 0.5) * uShatterSkew * 0.035;\n  }\n\n  if (uUseWave > 0.5) {\n    float rotation = uWaveRotation * TAU;\n    vec2 direction = vec2(cos(rotation), sin(rotation));\n    vec2 normal = vec2(-direction.y, direction.x);\n    float pointerPhase = dot(pointer, direction) * uWaveTrackPointer * 3.0;\n    float wave = sin(dot(p, direction) * (5.0 + uWaveFrequency * 22.0) + uWavePhase * TAU + uTime * uWaveSpeed * 2.5 + pointerPhase);\n    float attenuation = mix(1.0, exp(-distanceFromOrigin * (1.0 + uWaveFalloff * 5.0)), uWaveFalloff);\n    p += normal * wave * uWaveAmplitude * 0.045 * attenuation * mix(1.0, 1.0 - radialMix, uWaveMixRadius);\n  }\n\n  vec2 skew = vec2(max(0.05, uVignetteSkew * 1.8), max(0.05, (1.0 - uVignetteSkew) * 1.8));\n  vec2 vp = rotate2d(uVignetteAngle * TAU) * (p * skew);\n  float radius = length(vp);\n  float edge = max(0.005, uVignetteRadius * 0.72);\n  float soft = max(0.002, edge * (0.06 + uVignetteFalloff * 0.52));\n  float radial = 1.0 - smoothstep(edge - soft, edge + soft, radius + fbm(vp * 5.0) * uVignetteDisplace * 0.06);\n  float authored = uSourceMode == 0 ? proceduralRayfield(p) : sourceMask(uv);\n  float mask = mix(radial, authored, uSourceMix);\n\n  return mix(1.0, mask, uVignetteMix * uUseVignette);\n}\n\nvoid main() {\n  vec2 uv = vUv;\n  float field = fieldAt(uv);\n  if (uUseBokeh > 0.5) {\n    vec2 px = vec2(1.0) / uResolution;\n    vec2 tilt = normalize(vec2(cos(uBokehTilt * PI), sin(uBokehTilt * PI)) + 0.0001);\n    float spread = (0.5 + uBokehRadius * 4.0) * mix(0.45, 1.0, uBokehMixRadius);\n    float blur = field;\n    blur += fieldAt(uv + tilt * px * spread * 2.0);\n    blur += fieldAt(uv - tilt * px * spread * 2.0);\n    blur += fieldAt(uv + vec2(-tilt.y, tilt.x) * px * spread * 1.35);\n    blur += fieldAt(uv - vec2(-tilt.y, tilt.x) * px * spread * 1.35);\n    field = blur / 5.0;\n  }\n  float shadowWeight = 0.12 + smoothstep(0.0, 0.84, 1.0 - field) * 0.09;\n  vec3 base = mix(uBackground, uShadow, shadowWeight);\n  base = mix(base, uLight, 0.035 + uv.x * 0.018);\n  vec3 color = mix(base, uLight, smoothstep(0.12, 0.88, field));\n  float grain = hash21(gl_FragCoord.xy + floor(uTime * 12.0)) - 0.5;\n  color += grain * 0.012;\n  fragColor = vec4(color, 1.0);\n}";
//#endregion
//#region src/renderer.ts
function m(e, t, n) {
	let r = e.createShader(t);
	if (!r) throw Error("Rayfield could not allocate a WebGL shader.");
	if (e.shaderSource(r, n), e.compileShader(r), !e.getShaderParameter(r, e.COMPILE_STATUS)) {
		let t = e.getShaderInfoLog(r) || "Unknown shader compilation error.";
		throw e.deleteShader(r), Error(`Rayfield shader compilation failed: ${t}`);
	}
	return r;
}
function h(e) {
	let t = e.createProgram();
	if (!t) throw Error("Rayfield could not allocate a WebGL program.");
	let n = m(e, e.VERTEX_SHADER, f), r = m(e, e.FRAGMENT_SHADER, p);
	if (e.attachShader(t, n), e.attachShader(t, r), e.linkProgram(t), e.deleteShader(n), e.deleteShader(r), !e.getProgramParameter(t, e.LINK_STATUS)) {
		let n = e.getProgramInfoLog(t) || "Unknown program link error.";
		throw e.deleteProgram(t), Error(`Rayfield program link failed: ${n}`);
	}
	return t;
}
function g(e) {
	let t = e.trim().replace(/^#/, ""), n = t.length === 3 ? t.split("").map((e) => e + e).join("") : t, r = Number.parseInt(n.slice(0, 6), 16);
	return Number.isFinite(r) ? [
		(r >> 16 & 255) / 255,
		(r >> 8 & 255) / 255,
		(r & 255) / 255
	] : [
		1,
		1,
		1
	];
}
function _(e) {
	return +!!e;
}
var v = class {
	canvas;
	gl;
	config;
	pointer = [.5, .5];
	currPointer = [.5, .5];
	program;
	vao;
	sourceTexture;
	uniforms = /* @__PURE__ */ new Map();
	pixelRatio;
	reducedMotion;
	frame = 0;
	startedAt = performance.now();
	elapsedBeforePause = 0;
	destroyed = !1;
	paused = !1;
	source = null;
	resizeObserver;
	constructor(e, t = {}) {
		this.canvas = e;
		let n = e.getContext("webgl2", {
			alpha: !1,
			antialias: !1,
			depth: !1,
			powerPreference: "high-performance",
			preserveDrawingBuffer: !1
		});
		if (!n) throw Error("Seam Rayfield requires WebGL 2.");
		this.gl = n, this.program = h(n);
		let r = n.createVertexArray(), i = n.createTexture();
		if (!r || !i) throw Error("Rayfield could not allocate WebGL resources.");
		this.vao = r, this.sourceTexture = i, this.config = u(t.config), this.pixelRatio = Math.max(.5, Math.min(t.pixelRatio ?? window.devicePixelRatio ?? 1, 2)), this.reducedMotion = t.reducedMotion ?? window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? !1, n.useProgram(this.program), n.bindVertexArray(this.vao), n.bindTexture(n.TEXTURE_2D, this.sourceTexture), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_WRAP_S, n.CLAMP_TO_EDGE), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_WRAP_T, n.CLAMP_TO_EDGE), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_MIN_FILTER, n.LINEAR), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_MAG_FILTER, n.LINEAR), n.texImage2D(n.TEXTURE_2D, 0, n.RGBA, 1, 1, 0, n.RGBA, n.UNSIGNED_BYTE, new Uint8Array([
			255,
			255,
			255,
			255
		])), n.uniform1i(this.location("uSource"), 0), e.addEventListener("pointermove", this.onPointerMove, { passive: !0 }), e.addEventListener("pointerenter", this.onPointerEnter, { passive: !0 }), e.addEventListener("pointerleave", this.onPointerLeave, { passive: !0 }), e.addEventListener("webglcontextlost", this.onContextLost), "ResizeObserver" in window && (this.resizeObserver = new ResizeObserver(() => this.resize()), this.resizeObserver.observe(e)), this.resize(), t.autoStart === !1 ? this.draw(0) : this.resume();
	}
	get stopped() {
		return this.paused;
	}
	set stopped(e) {
		e ? this.pause() : this.resume();
	}
	setConfig(e) {
		d(this.config, e), (this.paused || this.reducedMotion) && this.draw(this.elapsedBeforePause / 1e3);
	}
	setColors(e) {
		e.backgroundColor && (this.config.background.color = e.backgroundColor), e.vignetteColor && (this.config.vignette.color = e.vignetteColor), e.outputColor && (this.config.output.color = e.outputColor), (this.paused || this.reducedMotion) && this.draw(this.elapsedBeforePause / 1e3);
	}
	setSourceCanvas(e) {
		this.source = e, this.refreshSourceTexture();
	}
	setSource(e) {
		e ? this.setSourceCanvas(e) : this.clearSourceTexture();
	}
	refreshSourceTexture() {
		if (!this.source || this.destroyed) return;
		let e = this.gl;
		e.activeTexture(e.TEXTURE0), e.bindTexture(e.TEXTURE_2D, this.sourceTexture), e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL, !0), e.texImage2D(e.TEXTURE_2D, 0, e.RGBA, e.RGBA, e.UNSIGNED_BYTE, this.source), e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL, !1), (this.paused || this.reducedMotion) && this.draw(this.elapsedBeforePause / 1e3);
	}
	clearSourceTexture() {
		this.source = null;
		let e = this.gl;
		e.bindTexture(e.TEXTURE_2D, this.sourceTexture), e.texImage2D(e.TEXTURE_2D, 0, e.RGBA, 1, 1, 0, e.RGBA, e.UNSIGNED_BYTE, new Uint8Array([
			255,
			255,
			255,
			255
		]));
	}
	resize() {
		if (this.destroyed) return;
		let e = this.canvas.getBoundingClientRect(), t = Math.max(1, Math.round(e.width * this.pixelRatio)), n = Math.max(1, Math.round(e.height * this.pixelRatio));
		(this.canvas.width !== t || this.canvas.height !== n) && (this.canvas.width = t, this.canvas.height = n, this.gl.viewport(0, 0, t, n), (this.paused || this.reducedMotion) && this.draw(this.elapsedBeforePause / 1e3));
	}
	pause() {
		this.paused || (this.paused = !0, this.elapsedBeforePause += performance.now() - this.startedAt, cancelAnimationFrame(this.frame), this.frame = 0, this.draw(this.elapsedBeforePause / 1e3));
	}
	resume() {
		if (!this.destroyed) {
			if (this.reducedMotion) {
				this.paused = !0, this.draw(0);
				return;
			}
			!this.paused && this.frame || (this.paused = !1, this.startedAt = performance.now(), this.frame = requestAnimationFrame(this.tick));
		}
	}
	reset() {
		Object.assign(this.config, u(c)), this.pointer[0] = this.currPointer[0] = .5, this.pointer[1] = this.currPointer[1] = .5, this.elapsedBeforePause = 0, this.startedAt = performance.now();
	}
	destroy() {
		this.destroyed || (this.destroyed = !0, cancelAnimationFrame(this.frame), this.resizeObserver?.disconnect(), this.canvas.removeEventListener("pointermove", this.onPointerMove), this.canvas.removeEventListener("pointerenter", this.onPointerEnter), this.canvas.removeEventListener("pointerleave", this.onPointerLeave), this.canvas.removeEventListener("webglcontextlost", this.onContextLost), this.gl.deleteTexture(this.sourceTexture), this.gl.deleteVertexArray(this.vao), this.gl.deleteProgram(this.program));
	}
	location(e) {
		return this.uniforms.has(e) || this.uniforms.set(e, this.gl.getUniformLocation(this.program, e)), this.uniforms.get(e) ?? null;
	}
	set1(e, t) {
		this.gl.uniform1f(this.location(e), t);
	}
	set2(e, t, n) {
		this.gl.uniform2f(this.location(e), t, n);
	}
	set3(e, t) {
		this.gl.uniform3fv(this.location(e), g(t));
	}
	draw(e) {
		if (this.destroyed) return;
		let t = this.gl, n = this.config;
		this.currPointer[0] += (this.pointer[0] - this.currPointer[0]) * .075, this.currPointer[1] += (this.pointer[1] - this.currPointer[1]) * .075, t.useProgram(this.program), t.bindVertexArray(this.vao), t.activeTexture(t.TEXTURE0), t.bindTexture(t.TEXTURE_2D, this.sourceTexture), this.set2("uResolution", this.canvas.width, this.canvas.height), this.set1("uTime", e), this.set2("uPointer", this.currPointer[0], this.currPointer[1]), this.set3("uBackground", n.background.color), this.set3("uShadow", n.vignette.color), this.set3("uLight", n.output.color), t.uniform1i(this.location("uSourceMode"), n.source.mode === "texture" ? 1 : n.source.mode === "noise" ? 2 : 0), this.set1("uSourceThreshold", n.source.threshold), this.set1("uSourceSoftness", n.source.softness), this.set1("uSourceInvert", _(n.source.invert)), this.set1("uSourceMix", n.source.mix), this.set1("uSourceScale", n.source.scale), this.set1("uSourceRotation", n.source.rotation), this.set2("uSourceOffset", n.source.offsetX, n.source.offsetY), this.set1("uSourceHover", _(n.source.hover && n.source.hoverActive)), this.set1("uSourceHoverStrength", n.source.hoverStrength), this.set1("uVignetteRadius", n.vignette.radius), this.set1("uVignetteFalloff", n.vignette.falloff), this.set1("uVignetteDisplace", n.vignette.displace), this.set1("uVignetteMix", n.vignette.mix), this.set1("uVignetteAngle", n.vignette.angle), this.set1("uVignetteSkew", n.vignette.skew), this.set1("uWaveFrequency", n.sine.frequency), this.set1("uWaveAmplitude", n.sine.amplitude), this.set1("uWaveFalloff", n.sine.falloff), this.set1("uWaveRotation", n.sine.rotation), this.set1("uWavePhase", n.sine.phase), this.set1("uWaveSpeed", n.sine.speed), this.set1("uWaveMixRadius", n.sine.mixRadius), this.set1("uWaveTrackPointer", _(n.sine.trackMouse)), this.set1("uShatterScale", n.shatter.scale), this.set1("uShatterAmount", n.shatter.amount), this.set1("uShatterAngle", n.shatter.angle), this.set1("uShatterRadius", n.shatter.radius), this.set1("uShatterSkew", n.shatter.skew), this.set1("uShatterMixRadius", n.shatter.mixRadius), this.set1("uShatterInvert", _(n.shatter.mixRadiusInvert)), this.set1("uBokehRadius", n.bokeh.radius), this.set1("uBokehTilt", n.bokeh.tilt), this.set1("uBokehMixRadius", n.bokeh.mixRadius), this.set1("uBokehTrackPointer", _(n.bokeh.trackMouse)), this.set1("uUseVignette", _(n.useVignette)), this.set1("uUseWave", _(n.useSine)), this.set1("uUseShatter", _(n.useShatter)), this.set1("uUseBokeh", _(n.useBokeh)), t.drawArrays(t.TRIANGLES, 0, 3);
	}
	tick = (e) => {
		this.destroyed || this.paused || (this.draw((this.elapsedBeforePause + e - this.startedAt) / 1e3), this.frame = requestAnimationFrame(this.tick));
	};
	onPointerMove = (e) => {
		let t = this.canvas.getBoundingClientRect();
		!t.width || !t.height || (this.pointer[0] = (e.clientX - t.left) / t.width, this.pointer[1] = 1 - (e.clientY - t.top) / t.height);
	};
	onPointerEnter = () => {
		this.config.source.hoverActive = !0;
	};
	onPointerLeave = () => {
		this.config.source.hoverActive = !1;
	};
	onContextLost = (e) => {
		e.preventDefault(), this.pause();
	};
};
function y(e, t) {
	return new v(e, t);
}
//#endregion
//#region src/SeamRayfield.tsx
var b = e(function({ className: e, style: c, config: l, paused: u = !1, source: d = null, pixelRatio: f, ariaLabel: p = "Animated light ray field", fallback: m = "The light field is unavailable because WebGL 2 could not start.", onReady: h, onError: g }, _) {
	let v = i(null), b = i(null), [x, S] = a(null);
	return r(() => {
		let e = v.current;
		if (e) try {
			let t = y(e, {
				config: l,
				pixelRatio: f,
				autoStart: !u
			});
			return b.current = t, h?.({
				canvas: e,
				renderer: t,
				resize: () => t.resize(),
				pause: () => t.pause(),
				resume: () => t.resume(),
				reset: () => t.reset(),
				setSource: (e) => t.setSource(e)
			}), () => {
				t.destroy(), b.current = null;
			};
		} catch (e) {
			let t = e instanceof Error ? e : /* @__PURE__ */ Error("Seam Rayfield could not start.");
			S(t), g?.(t);
		}
	}, []), t(() => {
		l && b.current?.setConfig(l);
	}, [l]), t(() => {
		b.current?.setSource(d);
	}, [d]), t(() => {
		u ? b.current?.pause() : b.current?.resume();
	}, [u]), n(_, () => {
		let e = b.current, t = v.current;
		if (!e || !t) throw Error("Seam Rayfield is not ready yet.");
		return {
			canvas: t,
			renderer: e,
			resize: () => e.resize(),
			pause: () => e.pause(),
			resume: () => e.resume(),
			reset: () => e.reset(),
			setSource: (t) => e.setSource(t)
		};
	}, []), /* @__PURE__ */ s("div", {
		className: ["seam-rayfield", e].filter(Boolean).join(" "),
		style: c,
		children: [/* @__PURE__ */ o("canvas", {
			ref: v,
			className: "seam-rayfield__canvas",
			"aria-label": p,
			role: "img"
		}), x ? /* @__PURE__ */ o("p", {
			className: "seam-rayfield__fallback",
			role: "status",
			children: m
		}) : null]
	});
});
//#endregion
export { v as RayfieldRenderer, b as SeamRayfield, d as applyRayfieldConfig, u as createRayfieldConfig, y as createRayfieldRenderer, c as defaultRayfieldConfig };
